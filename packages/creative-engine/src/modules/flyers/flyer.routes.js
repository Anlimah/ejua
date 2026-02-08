const flyerService = require('./flyers/flyer.service');
const templateService = require('./templates/template.service');

async function flyerRoutes(fastify) {

  // ═══════════════════════════════════════════
  // FLYER GENERATION
  // ═══════════════════════════════════════════

  /**
   * Generate a single flyer.
   * Matches Contract 1 from API spec.
   */
  fastify.post('/flyers/generate', {
    schema: {
      body: {
        type: 'object',
        required: ['product_id', 'product', 'pricing'],
        properties: {
          product_id: { type: 'string' },
          tenant_id: { type: 'string' },
          product: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              image_url: { type: 'string' },
              category: { type: 'string' },
              brand: { type: 'string' },
            },
          },
          pricing: {
            type: 'object',
            required: ['full_price'],
            properties: {
              currency: { type: 'string', default: 'GHS' },
              full_price: { type: 'integer', minimum: 1 },
              installment_plans: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    plan_id: { type: 'string' },
                    label: { type: 'string' },
                    down_payment: { type: 'integer' },
                    num_installments: { type: 'integer' },
                    installment_amount: { type: 'integer' },
                    total_cost: { type: 'integer' },
                    interest_rate_bps: { type: 'integer' },
                    provider: { type: 'string' },
                  },
                },
              },
            },
          },
          vendor: {
            type: 'object',
            properties: {
              vendor_id: { type: 'string' },
              store_name: { type: 'string' },
              logo_url: { type: 'string' },
            },
          },
          flyer_options: {
            type: 'object',
            properties: {
              template_id: { type: 'string' },
              format: { type: 'string', enum: ['square_1080', 'story'] },
              show_installment: { type: 'boolean', default: true },
              cta_text: { type: 'string', maxLength: 30 },
              qr_target_url: { type: 'string' },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const result = await flyerService.generateFlyer(request.body);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Generate flyers for multiple products.
   */
  fastify.post('/flyers/generate/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['products'],
        properties: {
          products: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: { type: 'object' }, // Each item matches single generate schema
          },
        },
      },
    },
    handler: async (request, reply) => {
      const results = await flyerService.generateBatch(request.body.products);
      return reply.status(201).send({ status: 'success', data: results });
    },
  });

  // ═══════════════════════════════════════════
  // TEMPLATES
  // ═══════════════════════════════════════════

  /**
   * List all available templates.
   */
  fastify.get('/templates', {
    handler: async () => {
      const templates = templateService.listAll();
      return { status: 'success', data: templates };
    },
  });

  /**
   * Get template details.
   */
  fastify.get('/templates/:templateId', {
    handler: async (request, reply) => {
      const template = templateService.getById(request.params.templateId);
      if (!template) {
        return reply.status(404).send({ status: 'error', errors: [{ code: 'NOT_FOUND' }] });
      }
      return { status: 'success', data: template };
    },
  });

  /**
   * Generate a preview for a template.
   */
  fastify.post('/templates/:templateId/preview', {
    handler: async (request, reply) => {
      const result = await templateService.generatePreview(request.params.templateId);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Upload a custom template.
   */
  fastify.post('/templates', {
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ status: 'error', errors: [{ message: 'File required' }] });
      }

      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Parse metadata from fields
      const metadata = {};
      if (data.fields.name) metadata.name = data.fields.name.value;
      if (data.fields.description) metadata.description = data.fields.description.value;
      if (data.fields.category) metadata.category = data.fields.category.value;

      const template = await templateService.uploadTemplate(buffer, metadata);
      return reply.status(201).send({ status: 'success', data: template });
    },
  });

  /**
   * Delete a custom template.
   */
  fastify.delete('/templates/:templateId', {
    handler: async (request, reply) => {
      const result = await templateService.deleteTemplate(request.params.templateId);
      return { status: 'success', data: result };
    },
  });
}

module.exports = flyerRoutes;
