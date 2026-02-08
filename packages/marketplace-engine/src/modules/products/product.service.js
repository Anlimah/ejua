const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const logger = require('../../utils/logger');
const { slugify, uniqueSlug } = require('../../utils/slug');
const { paginate } = require('../../utils/pagination');
const config = require('../../config');
const {
  NotFoundError,
  ValidationError,
  validateAmount,
  validateCurrency,
  bpsOf,
  formatMoney,
} = require('@ejua/shared');

class ProductService {
  constructor() {
    this.db = getDb();
  }

  // ─── CREATE ──────────────────────────────────

  async create(tenantId, vendorId, data) {
    const {
      name, description, price, sale_price, currency_code,
      category_id, sku, stock_quantity, images, attributes, is_featured,
      variants,
    } = data;

    if (!name || name.trim().length < 2) {
      throw new ValidationError('Product name must be at least 2 characters', 'name');
    }

    const currency = currency_code || config.platform.defaultCurrency;
    validateCurrency(currency);
    validateAmount(price, 'price');
    if (sale_price !== undefined && sale_price !== null) {
      validateAmount(sale_price, 'sale_price');
      if (sale_price >= price) {
        throw new ValidationError('Sale price must be less than regular price', 'sale_price');
      }
    }

    // Verify vendor exists
    const vendor = await this.db('vendors')
      .where({ id: vendorId, tenant_id: tenantId, is_active: true })
      .first();
    if (!vendor) throw new NotFoundError('Vendor', vendorId);

    // Verify category exists if provided
    if (category_id) {
      const cat = await this.db('categories')
        .where({ id: category_id, tenant_id: tenantId })
        .first();
      if (!cat) throw new NotFoundError('Category', category_id);
    }

    const baseSlug = slugify(name);
    const slug = await uniqueSlug(this.db, 'products', baseSlug, tenantId);

    return this.db.transaction(async (trx) => {
      const [product] = await trx('products')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          vendor_id: vendorId,
          category_id: category_id || null,
          name: name.trim(),
          slug,
          description: description || null,
          price,
          sale_price: sale_price || null,
          currency_code: currency,
          sku: sku || null,
          stock_quantity: stock_quantity || 0,
          is_featured: is_featured || false,
          images: images || [],
          attributes: attributes || {},
        })
        .returning('*');

      // Create variants if provided
      let createdVariants = [];
      if (variants && variants.length > 0) {
        const variantRecords = variants.map((v) => ({
          id: uuidv4(),
          product_id: product.id,
          name: v.name,
          sku: v.sku || null,
          price_override: v.price_override || null,
          stock_quantity: v.stock_quantity || 0,
          attributes: v.attributes || {},
        }));
        createdVariants = await trx('product_variants').insert(variantRecords).returning('*');
      }

      logger.info({ productId: product.id, vendorId, slug }, 'Product created');
      return this._enrichProduct(product, createdVariants);
    });
  }

  // ─── READ ────────────────────────────────────

  async getById(productId, tenantId) {
    const product = await this.db('products')
      .where({ id: productId, tenant_id: tenantId })
      .first();

    if (!product) throw new NotFoundError('Product', productId);

    const variants = await this.db('product_variants')
      .where({ product_id: productId, is_active: true })
      .orderBy('name', 'asc');

    return this._enrichProduct(product, variants);
  }

  async getBySlug(slug, tenantId) {
    const product = await this.db('products')
      .where({ slug, tenant_id: tenantId, is_active: true })
      .first();

    if (!product) throw new NotFoundError('Product', slug);

    const variants = await this.db('product_variants')
      .where({ product_id: product.id, is_active: true })
      .orderBy('name', 'asc');

    return this._enrichProduct(product, variants);
  }

  // ─── UPDATE ──────────────────────────────────

  async update(productId, tenantId, vendorId, data) {
    const product = await this.db('products')
      .where({ id: productId, tenant_id: tenantId, vendor_id: vendorId })
      .first();

    if (!product) throw new NotFoundError('Product', productId);

    const updates = {};

    if (data.name && data.name !== product.name) {
      updates.name = data.name.trim();
      const baseSlug = slugify(data.name);
      updates.slug = await uniqueSlug(this.db, 'products', baseSlug, tenantId, productId);
    }
    if (data.description !== undefined) updates.description = data.description;
    if (data.price !== undefined) {
      validateAmount(data.price, 'price');
      updates.price = data.price;
    }
    if (data.sale_price !== undefined) {
      if (data.sale_price === null) {
        updates.sale_price = null;
      } else {
        validateAmount(data.sale_price, 'sale_price');
        updates.sale_price = data.sale_price;
      }
    }
    if (data.category_id !== undefined) updates.category_id = data.category_id;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.stock_quantity !== undefined) updates.stock_quantity = data.stock_quantity;
    if (data.images !== undefined) updates.images = JSON.stringify(data.images);
    if (data.attributes !== undefined) updates.attributes = JSON.stringify(data.attributes);
    if (data.is_featured !== undefined) updates.is_featured = data.is_featured;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    if (Object.keys(updates).length === 0) {
      const variants = await this.db('product_variants')
        .where({ product_id: productId, is_active: true });
      return this._enrichProduct(product, variants);
    }

    const [updated] = await this.db('products')
      .where({ id: productId })
      .update(updates)
      .returning('*');

    const variants = await this.db('product_variants')
      .where({ product_id: productId, is_active: true });

    logger.info({ productId, updates: Object.keys(updates) }, 'Product updated');
    return this._enrichProduct(updated, variants);
  }

  // ─── SOFT DELETE ─────────────────────────────

  async softDelete(productId, tenantId, vendorId) {
    const product = await this.db('products')
      .where({ id: productId, tenant_id: tenantId, vendor_id: vendorId })
      .first();

    if (!product) throw new NotFoundError('Product', productId);

    await this.db('products')
      .where({ id: productId })
      .update({ is_active: false });

    logger.info({ productId }, 'Product soft-deleted');
    return { deleted: true };
  }

  // ─── LISTING WITH FILTERS ───────────────────

  async list(tenantId, opts = {}) {
    let query = this.db('products AS p')
      .select(
        'p.*',
        this.db.raw("COALESCE(p.sale_price, p.price) as effective_price"),
        'v.store_name as vendor_name',
        'v.slug as vendor_slug',
        'c.name as category_name',
        'c.slug as category_slug'
      )
      .leftJoin('vendors AS v', 'p.vendor_id', 'v.id')
      .leftJoin('categories AS c', 'p.category_id', 'c.id')
      .where('p.tenant_id', tenantId)
      .where('p.is_active', true);

    // Filters
    if (opts.vendor_id) {
      query = query.where('p.vendor_id', opts.vendor_id);
    }

    if (opts.category_id) {
      query = query.where('p.category_id', opts.category_id);
    }

    if (opts.category_slug) {
      query = query.where('c.slug', opts.category_slug);
    }

    if (opts.min_price !== undefined) {
      query = query.where(this.db.raw('COALESCE(p.sale_price, p.price)'), '>=', opts.min_price);
    }

    if (opts.max_price !== undefined) {
      query = query.where(this.db.raw('COALESCE(p.sale_price, p.price)'), '<=', opts.max_price);
    }

    if (opts.search) {
      query = query.where(function () {
        this.whereILike('p.name', `%${opts.search}%`)
          .orWhereILike('p.description', `%${opts.search}%`);
      });
    }

    if (opts.featured) {
      query = query.where('p.is_featured', true);
    }

    if (opts.in_stock) {
      query = query.where('p.stock_quantity', '>', 0);
    }

    // Sort options
    const sortMap = {
      'newest': { sortBy: 'p.created_at', sortDir: 'desc' },
      'price_low': { sortBy: 'effective_price', sortDir: 'asc' },
      'price_high': { sortBy: 'effective_price', sortDir: 'desc' },
      'name': { sortBy: 'p.name', sortDir: 'asc' },
    };

    const sortConfig = sortMap[opts.sort] || sortMap['newest'];

    const result = await paginate(query, {
      ...opts,
      sortBy: sortConfig.sortBy,
      sortDir: sortConfig.sortDir,
    });

    // Enrich each product with installment preview
    result.data = result.data.map((p) => this._addInstallmentPreview(p));

    return result;
  }

  // ─── VARIANT MANAGEMENT ──────────────────────

  async addVariant(productId, tenantId, data) {
    const product = await this.db('products')
      .where({ id: productId, tenant_id: tenantId })
      .first();

    if (!product) throw new NotFoundError('Product', productId);

    const [variant] = await this.db('product_variants')
      .insert({
        id: uuidv4(),
        product_id: productId,
        name: data.name,
        sku: data.sku || null,
        price_override: data.price_override || null,
        stock_quantity: data.stock_quantity || 0,
        attributes: data.attributes || {},
      })
      .returning('*');

    return variant;
  }

  async updateVariant(variantId, data) {
    const variant = await this.db('product_variants')
      .where({ id: variantId })
      .first();

    if (!variant) throw new NotFoundError('Variant', variantId);

    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.price_override !== undefined) updates.price_override = data.price_override;
    if (data.stock_quantity !== undefined) updates.stock_quantity = data.stock_quantity;
    if (data.attributes !== undefined) updates.attributes = data.attributes;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    if (Object.keys(updates).length === 0) return variant;

    const [updated] = await this.db('product_variants')
      .where({ id: variantId })
      .update(updates)
      .returning('*');

    return updated;
  }

  async deleteVariant(variantId) {
    const variant = await this.db('product_variants')
      .where({ id: variantId })
      .first();

    if (!variant) throw new NotFoundError('Variant', variantId);

    await this.db('product_variants')
      .where({ id: variantId })
      .update({ is_active: false });

    return { deleted: true };
  }

  async getVariants(productId) {
    return this.db('product_variants')
      .where({ product_id: productId, is_active: true })
      .orderBy('name', 'asc');
  }

  // ─── INVENTORY ───────────────────────────────

  /**
   * Decrement stock for an order. Called during order creation.
   * Validates sufficient stock is available.
   * Works within a database transaction.
   */
  async decrementStock(trx, productId, variantId, quantity) {
    const table = variantId ? 'product_variants' : 'products';
    const id = variantId || productId;

    const item = await trx(table).where({ id }).first();
    if (!item) throw new NotFoundError(variantId ? 'Variant' : 'Product', id);

    if (item.stock_quantity < quantity) {
      throw new ValidationError(
        `Insufficient stock for ${item.name || 'product'}. Available: ${item.stock_quantity}, requested: ${quantity}`,
        'stock_quantity'
      );
    }

    await trx(table)
      .where({ id })
      .decrement('stock_quantity', quantity);

    // Also decrement the parent product total if working with a variant
    if (variantId) {
      await trx('products')
        .where({ id: productId })
        .decrement('stock_quantity', quantity);
    }

    const newStock = item.stock_quantity - quantity;

    // Log low stock warning
    if (newStock <= 5 && newStock > 0) {
      logger.warn({ productId, variantId, remaining: newStock }, 'Low stock warning');
    }

    return { previousStock: item.stock_quantity, newStock };
  }

  /**
   * Restore stock when an order is cancelled or refunded.
   */
  async incrementStock(trx, productId, variantId, quantity) {
    const table = variantId ? 'product_variants' : 'products';
    const id = variantId || productId;

    await trx(table).where({ id }).increment('stock_quantity', quantity);

    if (variantId) {
      await trx('products')
        .where({ id: productId })
        .increment('stock_quantity', quantity);
    }
  }

  // ─── FEATURED & SORTING ──────────────────────

  async setFeatured(productId, tenantId, isFeatured) {
    const product = await this.db('products')
      .where({ id: productId, tenant_id: tenantId })
      .first();

    if (!product) throw new NotFoundError('Product', productId);

    const [updated] = await this.db('products')
      .where({ id: productId })
      .update({ is_featured: isFeatured })
      .returning('*');

    return updated;
  }

  async getFeatured(tenantId, limit = 12) {
    const products = await this.db('products')
      .where({ tenant_id: tenantId, is_active: true, is_featured: true })
      .where('stock_quantity', '>', 0)
      .orderBy('updated_at', 'desc')
      .limit(limit);

    return products.map((p) => this._addInstallmentPreview(p));
  }

  // ─── PRIVATE HELPERS ─────────────────────────

  /**
   * Attach variants and installment preview to a product.
   */
  _enrichProduct(product, variants = []) {
    return {
      ...product,
      variants,
      installment_preview: this._calculateInstallmentPreview(product),
    };
  }

  /**
   * Calculate the "from GH₵X/month" preview for product cards.
   * Uses default 40% down, 3 months, 0% interest (Motito terms).
   */
  _calculateInstallmentPreview(product) {
    const effectivePrice = product.sale_price || product.price;
    const currency = product.currency_code || 'GHS';
    const downPayment = bpsOf(effectivePrice, 4000); // 40%
    const remaining = effectivePrice - downPayment;
    const monthlyAmount = Math.ceil(remaining / 3);

    return {
      full_price: effectivePrice,
      down_payment: downPayment,
      monthly_amount: monthlyAmount,
      num_months: 3,
      monthly_formatted: formatMoney(monthlyAmount, currency),
      down_payment_formatted: formatMoney(downPayment, currency),
    };
  }

  /**
   * Lightweight version for list views.
   */
  _addInstallmentPreview(product) {
    product.installment_preview = this._calculateInstallmentPreview(product);
    return product;
  }
}

module.exports = new ProductService();
