const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const { slugify, uniqueSlug } = require('../../utils/slug');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { NotFoundError, ValidationError, ConflictError } = require('@ejua/shared');

/**
 * Tenant management service.
 *
 * Each tenant is an independent marketplace instance with its own:
 *   - Users, vendors, products, orders
 *   - Commission rates, escrow periods, fee structures
 *   - Payment providers
 *   - Branding (domain, logo, colors)
 *   - Feature flags
 *   - API keys
 *
 * The 'default' tenant is used for single-tenant (Ejua direct) launch.
 */
class TenantService {
  constructor() {
    this.db = getDb();
  }

  // ─── TENANT CRUD ─────────────────────────────

  async create(data) {
    const { name, domain, logo_url, config } = data;

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Tenant name must be at least 2 characters', 'name');
    }

    const baseSlug = slugify(name);
    // Slug uniqueness check without tenant_id (tenants table is global)
    const existing = await this.db('tenants').where({ slug: baseSlug }).first();
    const slug = existing ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    const defaultConfig = {
      // Fee structure
      commission_bps: 1000,         // 10% platform commission
      gateway_fee_bps: 300,         // 3% payment gateway fee
      escrow_days: 14,              // Return window
      grace_period_days: 3,         // Late fee grace period
      late_fee_bps: 200,            // 2% weekly late fee
      late_fee_cap_bps: 1500,       // 15% max late fee

      // Supported currencies
      default_currency: 'GHS',
      supported_currencies: ['GHS'],

      // BNPL settings
      bnpl_enabled: true,
      bnpl_down_payment_bps: 4000,  // 40%
      bnpl_max_installments: 3,

      // Branding
      branding: {
        primary_color: '#1A1A2E',
        accent_color: '#E94560',
        font_family: 'Inter, sans-serif',
      },

      // Feature flags
      features: {
        flyer_generation: true,
        social_posting: true,
        ad_boost: false,            // Requires Meta app review
        whatsapp_messaging: false,  // Requires WhatsApp Business approval
        multi_currency: false,      // Phase 4
      },

      // Limits
      limits: {
        max_vendors: 100,
        max_products_per_vendor: 500,
        max_flyers_per_day: 50,
      },
    };

    const mergedConfig = { ...defaultConfig, ...config };

    const [tenant] = await this.db('tenants')
      .insert({
        id: uuidv4(),
        name: name.trim(),
        slug,
        domain: domain || null,
        logo_url: logo_url || null,
        config: mergedConfig,
      })
      .returning('*');

    // Create platform wallets for the new tenant
    const walletService = require('../wallets/wallet.service');
    await walletService.createWallet(
      tenant.id, 'platform', 'platform', mergedConfig.default_currency
    );
    await walletService.createWallet(
      tenant.id, 'gateway', 'gateway', mergedConfig.default_currency
    );

    logger.info({ tenantId: tenant.id, slug }, 'Tenant created');
    return tenant;
  }

  async getById(tenantId) {
    const tenant = await this.db('tenants').where({ id: tenantId }).first();
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    return tenant;
  }

  async getBySlug(slug) {
    const tenant = await this.db('tenants').where({ slug, is_active: true }).first();
    if (!tenant) throw new NotFoundError('Tenant', slug);
    return tenant;
  }

  async getByDomain(domain) {
    const tenant = await this.db('tenants').where({ domain, is_active: true }).first();
    if (!tenant) throw new NotFoundError('Tenant', domain);
    return tenant;
  }

  async update(tenantId, data) {
    const tenant = await this.getById(tenantId);

    const updates = {};
    if (data.name) updates.name = data.name.trim();
    if (data.domain !== undefined) updates.domain = data.domain;
    if (data.logo_url !== undefined) updates.logo_url = data.logo_url;
    if (data.is_active !== undefined) updates.is_active = data.is_active;
    if (data.config) {
      updates.config = { ...tenant.config, ...data.config };
    }

    if (Object.keys(updates).length === 0) return tenant;

    const [updated] = await this.db('tenants')
      .where({ id: tenantId })
      .update(updates)
      .returning('*');

    logger.info({ tenantId, updates: Object.keys(updates) }, 'Tenant updated');
    return updated;
  }

  async list() {
    return this.db('tenants').orderBy('created_at', 'desc');
  }

  // ─── CONFIGURATION ───────────────────────────

  async updateConfig(tenantId, configUpdates) {
    const tenant = await this.getById(tenantId);
    const newConfig = { ...tenant.config, ...configUpdates };

    const [updated] = await this.db('tenants')
      .where({ id: tenantId })
      .update({ config: newConfig })
      .returning('*');

    return updated;
  }

  async getFeatureFlags(tenantId) {
    const tenant = await this.getById(tenantId);
    return tenant.config?.features || {};
  }

  async setFeatureFlag(tenantId, feature, enabled) {
    const tenant = await this.getById(tenantId);
    const features = { ...tenant.config.features, [feature]: enabled };
    return this.updateConfig(tenantId, { features });
  }

  // ─── BRANDING ────────────────────────────────

  async updateBranding(tenantId, branding) {
    const tenant = await this.getById(tenantId);
    const currentBranding = tenant.config?.branding || {};
    return this.updateConfig(tenantId, { branding: { ...currentBranding, ...branding } });
  }

  // ─── FEE STRUCTURES ──────────────────────────

  async updateFees(tenantId, fees) {
    const validFeeKeys = [
      'commission_bps', 'gateway_fee_bps', 'escrow_days',
      'grace_period_days', 'late_fee_bps', 'late_fee_cap_bps',
    ];

    const updates = {};
    for (const [key, value] of Object.entries(fees)) {
      if (validFeeKeys.includes(key)) {
        if (typeof value !== 'number' || value < 0) {
          throw new ValidationError(`${key} must be a non-negative number`, key);
        }
        updates[key] = value;
      }
    }

    return this.updateConfig(tenantId, updates);
  }

  // ─── PAYMENT PROVIDERS ───────────────────────

  async addPaymentProvider(tenantId, { provider, country_code, currency_code, config, is_primary }) {
    await this.getById(tenantId); // Validate tenant exists

    // If setting as primary, unset other primaries for this tenant+country
    if (is_primary) {
      await this.db('tenant_payment_providers')
        .where({ tenant_id: tenantId, country_code })
        .update({ is_primary: false });
    }

    const [record] = await this.db('tenant_payment_providers')
      .insert({
        tenant_id: tenantId,
        provider,
        country_code,
        currency_code,
        config: config || {},
        is_primary: is_primary || false,
      })
      .onConflict(['tenant_id', 'provider', 'country_code'])
      .merge()
      .returning('*');

    logger.info({ tenantId, provider, country_code }, 'Payment provider configured');
    return record;
  }

  async getPaymentProviders(tenantId) {
    return this.db('tenant_payment_providers')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('is_primary', 'desc');
  }

  async getPrimaryProvider(tenantId, countryCode) {
    return this.db('tenant_payment_providers')
      .where({ tenant_id: tenantId, country_code: countryCode, is_primary: true, is_active: true })
      .first();
  }

  // ─── API KEYS ────────────────────────────────

  async generateApiKey(tenantId, name) {
    await this.getById(tenantId);

    // Generate a random API key
    const rawKey = `ejua_pk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 16);

    await this.db('tenant_api_keys').insert({
      tenant_id: tenantId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      scopes: JSON.stringify(['read', 'write']),
    });

    // Return the raw key ONCE — it cannot be retrieved again
    logger.info({ tenantId, keyPrefix, name }, 'API key generated');
    return {
      api_key: rawKey,
      key_prefix: keyPrefix,
      name,
      warning: 'Store this key securely. It cannot be retrieved again.',
    };
  }

  async validateApiKey(rawKey) {
    const prefix = rawKey.substring(0, 16);

    const keys = await this.db('tenant_api_keys')
      .where({ key_prefix: prefix, is_active: true })
      .where(function () {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
      });

    for (const key of keys) {
      const valid = await bcrypt.compare(rawKey, key.key_hash);
      if (valid) {
        // Update last_used_at
        await this.db('tenant_api_keys')
          .where({ id: key.id })
          .update({ last_used_at: new Date() });

        return {
          valid: true,
          tenant_id: key.tenant_id,
          scopes: key.scopes,
        };
      }
    }

    return { valid: false };
  }

  async listApiKeys(tenantId) {
    return this.db('tenant_api_keys')
      .where({ tenant_id: tenantId })
      .select('id', 'key_prefix', 'name', 'scopes', 'is_active', 'last_used_at', 'created_at')
      .orderBy('created_at', 'desc');
  }

  async revokeApiKey(keyId, tenantId) {
    await this.db('tenant_api_keys')
      .where({ id: keyId, tenant_id: tenantId })
      .update({ is_active: false });
    return { revoked: true };
  }

  // ─── CONSOLIDATED REPORTING ──────────────────

  /**
   * Cross-tenant report in USD-equivalent for platform admin.
   */
  async getConsolidatedReport() {
    const exchangeService = require('../currency/exchange-rate.service');
    const tenants = await this.db('tenants').where({ is_active: true });
    const report = [];

    for (const tenant of tenants) {
      const currency = tenant.config?.default_currency || 'GHS';

      // Order totals
      const orderStats = await this.db('orders')
        .where({ tenant_id: tenant.id })
        .select(
          this.db.raw('COUNT(*) as total_orders'),
          this.db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status IN ('confirmed','shipped','delivered','settled')), 0) as revenue"),
          this.db.raw("COALESCE(SUM(total_amount) FILTER (WHERE status = 'settled'), 0) as settled_revenue"),
        )
        .first();

      const revenue = parseInt(orderStats.revenue) || 0;
      const usdEquivalent = await exchangeService.convertToUsd(revenue, currency);

      // Vendor count
      const vendorCount = await this.db('vendors')
        .where({ tenant_id: tenant.id, is_active: true })
        .count('id as count')
        .first();

      // User count
      const userCount = await this.db('users')
        .where({ tenant_id: tenant.id })
        .count('id as count')
        .first();

      report.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        slug: tenant.slug,
        currency,
        total_orders: parseInt(orderStats.total_orders) || 0,
        revenue,
        revenue_formatted: require('@ejua/shared').formatMoney(revenue, currency),
        revenue_usd: usdEquivalent.converted,
        revenue_usd_formatted: require('@ejua/shared').formatMoney(usdEquivalent.converted, 'USD'),
        settled_revenue: parseInt(orderStats.settled_revenue) || 0,
        vendor_count: parseInt(vendorCount.count) || 0,
        user_count: parseInt(userCount.count) || 0,
      });
    }

    // Grand totals
    const totalUsdRevenue = report.reduce((sum, r) => sum + r.revenue_usd, 0);

    return {
      tenants: report,
      totals: {
        total_tenants: report.length,
        total_orders: report.reduce((s, r) => s + r.total_orders, 0),
        total_revenue_usd: totalUsdRevenue,
        total_revenue_usd_formatted: require('@ejua/shared').formatMoney(totalUsdRevenue, 'USD'),
        total_vendors: report.reduce((s, r) => s + r.vendor_count, 0),
        total_users: report.reduce((s, r) => s + r.user_count, 0),
      },
      generated_at: new Date().toISOString(),
    };
  }
}

module.exports = new TenantService();
