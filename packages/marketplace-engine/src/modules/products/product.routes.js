const productService = require('./product.service');
const categoryService = require('./category.service');
const { successResponse, paginatedResponse } = require('@ejua/shared');
const { parseListParams } = require('../../utils/pagination');

async function productRoutes(fastify) {

  // ═══════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════

  // ─── CREATE CATEGORY (admin) ───────────────
  fastify.post('/categories', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 255 },
          description: { type: 'string' },
          parent_id: { type: 'string', format: 'uuid' },
          image_url: { type: 'string', format: 'uri' },
          sort_order: { type: 'integer', minimum: 0 },
        },
      },
    },
    handler: async (request, reply) => {
      const category = await categoryService.create(request.tenantId, request.body);
      return reply.status(201).send(successResponse(category));
    },
  });

  // ─── LIST CATEGORIES (flat) ────────────────
  fastify.get('/categories', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const categories = await categoryService.list(tenantId);
      return successResponse(categories);
    },
  });

  // ─── CATEGORY TREE (nested) ────────────────
  fastify.get('/categories/tree', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const tree = await categoryService.getTree(tenantId);
      return successResponse(tree);
    },
  });

  // ─── GET CATEGORY ──────────────────────────
  fastify.get('/categories/:categoryId', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const category = await categoryService.getById(request.params.categoryId, tenantId);
      return successResponse(category);
    },
  });

  // ─── UPDATE CATEGORY (admin) ───────────────
  fastify.patch('/categories/:categoryId', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 255 },
          description: { type: 'string' },
          parent_id: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
          image_url: { type: 'string' },
          sort_order: { type: 'integer', minimum: 0 },
          is_active: { type: 'boolean' },
        },
      },
    },
    handler: async (request) => {
      const category = await categoryService.update(
        request.params.categoryId,
        request.tenantId,
        request.body
      );
      return successResponse(category);
    },
  });

  // ─── DELETE CATEGORY (admin) ───────────────
  fastify.delete('/categories/:categoryId', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request) => {
      const result = await categoryService.delete(request.params.categoryId, request.tenantId);
      return successResponse(result);
    },
  });

  // ═══════════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════════

  // ─── CREATE PRODUCT ────────────────────────
  fastify.post('/products', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 500 },
          description: { type: 'string' },
          price: { type: 'integer', minimum: 1 },
          sale_price: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
          currency_code: { type: 'string', enum: ['GHS', 'NGN', 'XOF', 'USD'] },
          category_id: { type: 'string', format: 'uuid' },
          sku: { type: 'string' },
          stock_quantity: { type: 'integer', minimum: 0 },
          is_featured: { type: 'boolean' },
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                alt: { type: 'string' },
                sort_order: { type: 'integer' },
              },
              required: ['url'],
            },
          },
          attributes: { type: 'object' },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                sku: { type: 'string' },
                price_override: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
                stock_quantity: { type: 'integer', minimum: 0 },
                attributes: { type: 'object' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const vendorId = request.user.vendorId;
      if (!vendorId && request.user.role !== 'admin') {
        return reply.status(403).send({ status: 'error', errors: [{ code: 'NO_VENDOR', message: 'Register a vendor store first' }] });
      }
      const product = await productService.create(
        request.tenantId,
        request.body.vendor_id || vendorId,
        request.body
      );
      return reply.status(201).send(successResponse(product));
    },
  });

  // ─── LIST PRODUCTS (public, with filters) ──
  fastify.get('/products', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          search: { type: 'string' },
          vendor_id: { type: 'string' },
          category_id: { type: 'string' },
          category_slug: { type: 'string' },
          min_price: { type: 'integer' },
          max_price: { type: 'integer' },
          featured: { type: 'boolean' },
          in_stock: { type: 'boolean' },
          sort: { type: 'string', enum: ['newest', 'price_low', 'price_high', 'name'] },
        },
      },
    },
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const params = { ...parseListParams(request.query), ...request.query };
      const { data, pagination } = await productService.list(tenantId, params);
      return paginatedResponse(data, pagination);
    },
  });

  // ─── FEATURED PRODUCTS ─────────────────────
  fastify.get('/products/featured', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const limit = parseInt(request.query.limit) || 12;
      const products = await productService.getFeatured(tenantId, limit);
      return successResponse(products);
    },
  });

  // ─── GET PRODUCT BY ID ─────────────────────
  fastify.get('/products/:productId', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const product = await productService.getById(request.params.productId, tenantId);
      return successResponse(product);
    },
  });

  // ─── GET PRODUCT BY SLUG (storefront) ──────
  fastify.get('/p/:slug', {
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const product = await productService.getBySlug(request.params.slug, tenantId);
      return successResponse(product);
    },
  });

  // ─── UPDATE PRODUCT ────────────────────────
  fastify.patch('/products/:productId', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 500 },
          description: { type: 'string' },
          price: { type: 'integer', minimum: 1 },
          sale_price: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
          category_id: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
          sku: { type: 'string' },
          stock_quantity: { type: 'integer', minimum: 0 },
          images: { type: 'array' },
          attributes: { type: 'object' },
          is_featured: { type: 'boolean' },
          is_active: { type: 'boolean' },
        },
      },
    },
    handler: async (request) => {
      const vendorId = request.user.vendorId || request.body.vendor_id;
      const product = await productService.update(
        request.params.productId,
        request.tenantId,
        vendorId,
        request.body
      );
      return successResponse(product);
    },
  });

  // ─── DELETE PRODUCT (soft) ─────────────────
  fastify.delete('/products/:productId', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request) => {
      const vendorId = request.user.vendorId;
      const result = await productService.softDelete(
        request.params.productId,
        request.tenantId,
        vendorId
      );
      return successResponse(result);
    },
  });

  // ─── VENDOR'S OWN PRODUCTS ─────────────────
  fastify.get('/vendors/:vendorId/products', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          search: { type: 'string' },
          in_stock: { type: 'boolean' },
          sort: { type: 'string', enum: ['newest', 'price_low', 'price_high', 'name'] },
        },
      },
    },
    handler: async (request) => {
      const tenantId = request.headers['x-tenant-id'] || 'default';
      const params = {
        ...parseListParams(request.query),
        ...request.query,
        vendor_id: request.params.vendorId,
      };
      const { data, pagination } = await productService.list(tenantId, params);
      return paginatedResponse(data, pagination);
    },
  });

  // ═══════════════════════════════════════════
  // VARIANTS
  // ═══════════════════════════════════════════

  // ─── ADD VARIANT ───────────────────────────
  fastify.post('/products/:productId/variants', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 255 },
          sku: { type: 'string' },
          price_override: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
          stock_quantity: { type: 'integer', minimum: 0 },
          attributes: { type: 'object' },
        },
      },
    },
    handler: async (request, reply) => {
      const variant = await productService.addVariant(
        request.params.productId,
        request.tenantId,
        request.body
      );
      return reply.status(201).send(successResponse(variant));
    },
  });

  // ─── LIST VARIANTS ─────────────────────────
  fastify.get('/products/:productId/variants', {
    handler: async (request) => {
      const variants = await productService.getVariants(request.params.productId);
      return successResponse(variants);
    },
  });

  // ─── UPDATE VARIANT ────────────────────────
  fastify.patch('/variants/:variantId', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255 },
          sku: { type: 'string' },
          price_override: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
          stock_quantity: { type: 'integer', minimum: 0 },
          attributes: { type: 'object' },
          is_active: { type: 'boolean' },
        },
      },
    },
    handler: async (request) => {
      const variant = await productService.updateVariant(
        request.params.variantId,
        request.body
      );
      return successResponse(variant);
    },
  });

  // ─── DELETE VARIANT ────────────────────────
  fastify.delete('/variants/:variantId', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request) => {
      const result = await productService.deleteVariant(request.params.variantId);
      return successResponse(result);
    },
  });

  // ═══════════════════════════════════════════
  // PRODUCT IMAGE UPLOAD (R2)
  // ═══════════════════════════════════════════

  fastify.post('/products/:productId/image', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request, reply) => {
      const { storage } = require('@ejua/shared');
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ status: 'error', errors: [{ message: 'Image file required' }] });
      }

      // Validate mime type
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(data.mimetype)) {
        return reply.status(400).send({
          status: 'error',
          errors: [{ message: `Unsupported image type: ${data.mimetype}. Use JPEG, PNG, or WebP.` }],
        });
      }

      // Read file into buffer
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Upload to R2
      const result = await storage.uploadProductImage(buffer, {
        tenantId: request.tenantId,
        productId: request.params.productId,
        filename: data.filename,
        contentType: data.mimetype,
      });

      // Update the product's image_url in database
      const { getDb } = require('../../utils/db');
      await getDb()('products')
        .where({ id: request.params.productId, tenant_id: request.tenantId })
        .update({ image_url: result.url });

      return reply.status(201).send(successResponse({
        image_url: result.url,
        key: result.key,
        size: result.size,
      }));
    },
  });
}

module.exports = productRoutes;
