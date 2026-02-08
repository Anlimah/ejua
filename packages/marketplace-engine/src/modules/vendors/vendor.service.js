const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const { slugify, uniqueSlug } = require('../../utils/slug');
const { paginate } = require('../../utils/pagination');
const walletService = require('../wallets/wallet.service');
const config = require('../../config');
const {
  WalletOwnerType,
  NotFoundError,
  ValidationError,
  ConflictError,
} = require('@ejua/shared');

const KYC_STATUSES = ['pending', 'submitted', 'verified', 'rejected', 'suspended'];

class VendorService {
  constructor() {
    this.db = getDb();
  }

  // ─── REGISTRATION ────────────────────────────

  /**
   * Register a new vendor.
   * Creates the vendor record, a vendor wallet, and an escrow wallet.
   * The user must already exist (created via /auth/register with role='vendor').
   */
  async register(tenantId, userId, data) {
    const { store_name, description, phone, email, address } = data;

    if (!store_name || store_name.trim().length < 2) {
      throw new ValidationError('Store name must be at least 2 characters', 'store_name');
    }

    // Check user exists and is a vendor
    const user = await this.db('users').where({ id: userId, tenant_id: tenantId }).first();
    if (!user) throw new NotFoundError('User', userId);
    if (user.role !== 'vendor') {
      throw new ValidationError('User must have vendor role to register a store', 'role');
    }

    // Check user doesn't already have a vendor store
    const existingVendor = await this.db('vendors')
      .where({ user_id: userId, tenant_id: tenantId })
      .first();
    if (existingVendor) {
      throw new ConflictError('User already has a registered store');
    }

    const baseSlug = slugify(store_name);
    const slug = await uniqueSlug(this.db, 'vendors', baseSlug, tenantId);

    return this.db.transaction(async (trx) => {
      const [vendor] = await trx('vendors')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          user_id: userId,
          store_name: store_name.trim(),
          slug,
          description: description || null,
          phone: phone || user.phone,
          email: email || user.email,
          address: address || {},
          commission_bps: config.platform.defaultCommissionBps,
          kyc_status: 'pending',
        })
        .returning('*');

      // Create vendor wallet (for available/withdrawable funds)
      await walletService.createWallet(
        tenantId,
        WalletOwnerType.VENDOR,
        vendor.id,
        config.platform.defaultCurrency
      );

      // Create escrow wallet (for funds held during return window)
      await walletService.createWallet(
        tenantId,
        WalletOwnerType.ESCROW,
        vendor.id,
        config.platform.defaultCurrency
      );

      logger.info({ vendorId: vendor.id, slug }, 'Vendor registered');
      return this._formatVendor(vendor);
    });
  }

  // ─── CRUD ────────────────────────────────────

  async getById(vendorId, tenantId) {
    const vendor = await this.db('vendors')
      .where({ id: vendorId, tenant_id: tenantId })
      .first();

    if (!vendor) throw new NotFoundError('Vendor', vendorId);
    return this._formatVendor(vendor);
  }

  async getBySlug(slug, tenantId) {
    const vendor = await this.db('vendors')
      .where({ slug, tenant_id: tenantId, is_active: true })
      .first();

    if (!vendor) throw new NotFoundError('Vendor', slug);
    return this._formatVendor(vendor);
  }

  async update(vendorId, tenantId, data) {
    const vendor = await this.db('vendors')
      .where({ id: vendorId, tenant_id: tenantId })
      .first();

    if (!vendor) throw new NotFoundError('Vendor', vendorId);

    const updates = {};

    if (data.store_name && data.store_name !== vendor.store_name) {
      updates.store_name = data.store_name.trim();
      const baseSlug = slugify(data.store_name);
      updates.slug = await uniqueSlug(this.db, 'vendors', baseSlug, tenantId, vendorId);
    }
    if (data.description !== undefined) updates.description = data.description;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.email !== undefined) updates.email = data.email;
    if (data.address !== undefined) updates.address = data.address;
    if (data.logo_url !== undefined) updates.logo_url = data.logo_url;
    if (data.banner_url !== undefined) updates.banner_url = data.banner_url;

    if (Object.keys(updates).length === 0) {
      return this._formatVendor(vendor);
    }

    const [updated] = await this.db('vendors')
      .where({ id: vendorId })
      .update(updates)
      .returning('*');

    logger.info({ vendorId, updates: Object.keys(updates) }, 'Vendor updated');
    return this._formatVendor(updated);
  }

  async list(tenantId, opts = {}) {
    let query = this.db('vendors').where({ tenant_id: tenantId });

    if (opts.search) {
      query = query.where(function () {
        this.whereILike('store_name', `%${opts.search}%`)
          .orWhereILike('slug', `%${opts.search}%`);
      });
    }

    if (opts.kyc_status) {
      query = query.where('kyc_status', opts.kyc_status);
    }

    if (opts.is_active !== undefined) {
      query = query.where('is_active', opts.is_active);
    } else {
      // Default: only active vendors for public listing
      query = query.where('is_active', true);
    }

    return paginate(query, opts);
  }

  // ─── KYC MANAGEMENT ──────────────────────────

  async updateKycStatus(vendorId, tenantId, newStatus, kycData = null) {
    if (!KYC_STATUSES.includes(newStatus)) {
      throw new ValidationError(`Invalid KYC status. Must be: ${KYC_STATUSES.join(', ')}`, 'kyc_status');
    }

    const vendor = await this.db('vendors')
      .where({ id: vendorId, tenant_id: tenantId })
      .first();

    if (!vendor) throw new NotFoundError('Vendor', vendorId);

    // Validate transitions
    const validTransitions = {
      pending: ['submitted'],
      submitted: ['verified', 'rejected'],
      verified: ['suspended'],
      rejected: ['submitted'],     // Can resubmit
      suspended: ['verified'],     // Can be reinstated
    };

    const allowed = validTransitions[vendor.kyc_status] || [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${vendor.kyc_status}' to '${newStatus}'. Allowed: ${allowed.join(', ')}`,
        'kyc_status'
      );
    }

    const updates = { kyc_status: newStatus };
    if (kycData) {
      updates.kyc_data = { ...vendor.kyc_data, ...kycData, updated_at: new Date().toISOString() };
    }

    // If suspended, deactivate the vendor
    if (newStatus === 'suspended') {
      updates.is_active = false;
    }
    // If verified or reinstated from suspension, activate
    if (newStatus === 'verified') {
      updates.is_active = true;
    }

    const [updated] = await this.db('vendors')
      .where({ id: vendorId })
      .update(updates)
      .returning('*');

    logger.info({ vendorId, from: vendor.kyc_status, to: newStatus }, 'KYC status updated');
    return this._formatVendor(updated);
  }

  // ─── COMMISSION ──────────────────────────────

  async updateCommission(vendorId, tenantId, commissionBps) {
    if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 5000) {
      throw new ValidationError('Commission must be 0–5000 basis points (0%–50%)', 'commission_bps');
    }

    const vendor = await this.db('vendors')
      .where({ id: vendorId, tenant_id: tenantId })
      .first();

    if (!vendor) throw new NotFoundError('Vendor', vendorId);

    const [updated] = await this.db('vendors')
      .where({ id: vendorId })
      .update({ commission_bps: commissionBps })
      .returning('*');

    logger.info({ vendorId, commissionBps }, 'Vendor commission updated');
    return this._formatVendor(updated);
  }

  // ─── DASHBOARD DATA ──────────────────────────

  async getDashboard(vendorId, tenantId) {
    const vendor = await this.getById(vendorId, tenantId);

    // Wallet balances
    const wallets = await walletService.getVendorWallets(tenantId, vendorId);

    // Order stats
    const orderStats = await this.db('orders')
      .where({ vendor_id: vendorId, tenant_id: tenantId })
      .select(
        this.db.raw("COUNT(*) FILTER (WHERE status = 'confirmed') as pending_orders"),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'delivered') as delivered_orders"),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'settled') as settled_orders"),
        this.db.raw("COUNT(*) as total_orders"),
        this.db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status IN ('confirmed','shipped','delivered','settled')), 0) as total_revenue")
      )
      .first();

    // Product count
    const productCount = await this.db('products')
      .where({ vendor_id: vendorId, is_active: true })
      .count('id as count')
      .first();

    return {
      vendor,
      wallets: wallets.map((w) => ({
        id: w.id,
        type: w.owner_type,
        currency: w.currency_code,
        available: w.available_balance,
        escrow: w.escrow_balance,
        total: w.available_balance + w.escrow_balance,
      })),
      stats: {
        total_orders: parseInt(orderStats.total_orders) || 0,
        pending_orders: parseInt(orderStats.pending_orders) || 0,
        delivered_orders: parseInt(orderStats.delivered_orders) || 0,
        settled_orders: parseInt(orderStats.settled_orders) || 0,
        total_revenue: parseInt(orderStats.total_revenue) || 0,
        product_count: parseInt(productCount.count) || 0,
      },
    };
  }

  // ─── PRIVATE HELPERS ─────────────────────────

  _formatVendor(vendor) {
    // Strip internal fields for API responses
    const { password_hash, kyc_data, ...safe } = vendor;
    return safe;
  }
}

module.exports = new VendorService();
