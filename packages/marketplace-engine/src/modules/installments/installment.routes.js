const installmentService = require('./installment.service');
const { successResponse } = require('@ejua/shared');

async function installmentRoutes(fastify) {
  // Get installment plan for an order
  fastify.get('/orders/:orderId/installment-plans', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const plans = await installmentService.getPlansByOrder(request.params.orderId);
      return successResponse(plans);
    },
  });

  // Get plan details with all installments
  fastify.get('/installment-plans/:planId', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const result = await installmentService.getPlanWithInstallments(request.params.planId);
      if (!result) {
        return reply.status(404).send({ status: 'error', errors: [{ code: 'NOT_FOUND' }] });
      }
      return successResponse(result);
    },
  });

  // Admin: Trigger overdue processing (in production, this is a cron job)
  fastify.post('/admin/installments/process-overdue', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    handler: async (request, reply) => {
      const result = await installmentService.processOverdueInstallments(request.tenantId);
      return successResponse(result);
    },
  });
}

module.exports = installmentRoutes;
