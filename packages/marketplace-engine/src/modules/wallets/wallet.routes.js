const walletService = require('./wallet.service');
const { successResponse } = require('@ejua/shared');

async function walletRoutes(fastify) {
  // Get vendor wallets
  fastify.get('/vendors/:vendorId/wallets', {
    preHandler: [fastify.authenticate, fastify.requireRole('vendor', 'admin')],
    handler: async (request, reply) => {
      const { vendorId } = request.params;
      const wallets = await walletService.getVendorWallets(request.tenantId, vendorId);
      return successResponse(wallets);
    },
  });

  // Get wallet details with history
  fastify.get('/wallets/:walletId', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { walletId } = request.params;
      const limit = parseInt(request.query.limit) || 20;
      const result = await walletService.getWalletWithHistory(walletId, limit);
      return successResponse(result);
    },
  });

  // Get wallet balance only (lightweight)
  fastify.get('/wallets/:walletId/balance', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const wallet = await walletService.getWallet(request.params.walletId);
      return successResponse({
        wallet_id: wallet.id,
        currency_code: wallet.currency_code,
        available_balance: wallet.available_balance,
        escrow_balance: wallet.escrow_balance,
        total_balance: wallet.available_balance + wallet.escrow_balance,
      });
    },
  });
}

module.exports = walletRoutes;
