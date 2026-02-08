const socialService = require('./social/social.service');
const adService = require('./ads/ad.service');

async function amplifyRoutes(fastify) {

  // ═══════════════════════════════════════════
  // META OAUTH
  // ═══════════════════════════════════════════

  /**
   * Get the OAuth URL for connecting Facebook/Instagram.
   */
  fastify.get('/auth/meta/connect', {
    schema: {
      querystring: {
        type: 'object',
        required: ['vendor_id'],
        properties: { vendor_id: { type: 'string' } },
      },
    },
    handler: async (request) => {
      const url = socialService.getConnectUrl(request.query.vendor_id);
      return { status: 'success', data: { oauth_url: url } };
    },
  });

  /**
   * OAuth callback from Meta.
   */
  fastify.get('/auth/meta/callback', {
    handler: async (request, reply) => {
      const { code, state, error } = request.query;

      if (error) {
        return reply.redirect(
          `${process.env.PLATFORM_URL || 'http://localhost:3000'}/settings/social?error=${error}`
        );
      }

      try {
        const result = await socialService.handleOAuthCallback(code, state);
        return reply.redirect(
          `${process.env.PLATFORM_URL || 'http://localhost:3000'}/settings/social?connected=true&pages=${result.pages.length}`
        );
      } catch (err) {
        request.log.error({ err }, 'OAuth callback error');
        return reply.redirect(
          `${process.env.PLATFORM_URL || 'http://localhost:3000'}/settings/social?error=auth_failed`
        );
      }
    },
  });

  /**
   * Get connected accounts for a vendor.
   */
  fastify.get('/social/accounts/:vendorId', {
    handler: async (request) => {
      const accounts = socialService.getConnectedAccounts(request.params.vendorId);
      return { status: 'success', data: accounts || { connected: false } };
    },
  });

  // ═══════════════════════════════════════════
  // SOCIAL POSTING
  // ═══════════════════════════════════════════

  /**
   * Post to Facebook Page.
   */
  fastify.post('/social/facebook/post', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'page_id', 'image_url', 'caption'],
        properties: {
          vendor_id: { type: 'string' },
          page_id: { type: 'string' },
          image_url: { type: 'string' },
          caption: { type: 'string', maxLength: 5000 },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, ...postData } = request.body;
      const result = await socialService.postToFacebook(vendor_id, postData);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Post to Instagram Business.
   */
  fastify.post('/social/instagram/post', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'page_id', 'image_url', 'caption'],
        properties: {
          vendor_id: { type: 'string' },
          page_id: { type: 'string' },
          image_url: { type: 'string' },
          caption: { type: 'string', maxLength: 2200 },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, ...postData } = request.body;
      const result = await socialService.postToInstagram(vendor_id, postData);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Send WhatsApp message with product flyer.
   */
  fastify.post('/social/whatsapp/send', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'to', 'image_url', 'caption'],
        properties: {
          vendor_id: { type: 'string' },
          to: { type: 'string' },
          image_url: { type: 'string' },
          caption: { type: 'string', maxLength: 1024 },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, ...msgData } = request.body;
      const result = await socialService.sendWhatsApp(vendor_id, msgData);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Post to multiple platforms at once.
   */
  fastify.post('/social/multi-post', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'platforms', 'image_url', 'caption'],
        properties: {
          vendor_id: { type: 'string' },
          platforms: { type: 'array', items: { type: 'string', enum: ['facebook', 'instagram'] } },
          page_id: { type: 'string' },
          image_url: { type: 'string' },
          caption: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, ...postData } = request.body;
      const results = await socialService.postToMultiple(vendor_id, postData);
      return reply.status(201).send({ status: 'success', data: results });
    },
  });

  // ═══════════════════════════════════════════
  // SCHEDULED POSTING
  // ═══════════════════════════════════════════

  /**
   * Schedule a post for future publication.
   */
  fastify.post('/social/schedule', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'platforms', 'image_url', 'caption', 'publish_at'],
        properties: {
          vendor_id: { type: 'string' },
          platforms: { type: 'array', items: { type: 'string' } },
          page_id: { type: 'string' },
          image_url: { type: 'string' },
          caption: { type: 'string' },
          publish_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, ...scheduleData } = request.body;
      const result = socialService.schedulePost(vendor_id, scheduleData);
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * List scheduled posts for a vendor.
   */
  fastify.get('/social/schedule/:vendorId', {
    handler: async (request) => {
      const posts = socialService.listScheduledPosts(request.params.vendorId);
      return { status: 'success', data: posts };
    },
  });

  /**
   * Cancel a scheduled post.
   */
  fastify.delete('/social/schedule/:scheduleId', {
    handler: async (request) => {
      const result = socialService.cancelScheduledPost(request.params.scheduleId);
      return { status: 'success', data: result };
    },
  });

  /**
   * Get post history for a vendor.
   */
  fastify.get('/social/history/:vendorId', {
    handler: async (request) => {
      const history = socialService.getPostHistory(request.params.vendorId);
      return { status: 'success', data: history };
    },
  });

  // ═══════════════════════════════════════════
  // AD CAMPAIGNS
  // ═══════════════════════════════════════════

  /**
   * One-click ad boost for a product flyer.
   */
  fastify.post('/ads/boost', {
    schema: {
      body: {
        type: 'object',
        required: ['vendor_id', 'page_id', 'ad_account_id', 'image_url', 'link_url', 'product_name', 'daily_budget'],
        properties: {
          vendor_id: { type: 'string' },
          page_id: { type: 'string' },
          ad_account_id: { type: 'string' },
          image_url: { type: 'string' },
          link_url: { type: 'string' },
          product_name: { type: 'string' },
          message: { type: 'string' },
          headline: { type: 'string' },
          daily_budget: { type: 'integer', minimum: 100 }, // Min 1 GHS
          duration_days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
          targeting: { type: 'object' },
        },
      },
    },
    handler: async (request, reply) => {
      const { vendor_id, page_id, ad_account_id, ...adData } = request.body;
      const result = await adService.boostProduct({
        vendorId: vendor_id,
        pageId: page_id,
        adAccountId: ad_account_id,
        ...adData,
      });
      return reply.status(201).send({ status: 'success', data: result });
    },
  });

  /**
   * Get ad performance.
   */
  fastify.get('/ads/:boostId/performance', {
    handler: async (request) => {
      const result = await adService.getPerformance(request.params.boostId);
      return { status: 'success', data: result };
    },
  });

  /**
   * Get conversion data (ad click → order).
   */
  fastify.get('/ads/:boostId/conversions', {
    handler: async (request) => {
      const result = adService.getConversions(request.params.boostId);
      return { status: 'success', data: result };
    },
  });

  /**
   * Record a conversion (called by Marketplace Engine).
   */
  fastify.post('/ads/:boostId/conversions', {
    schema: {
      body: {
        type: 'object',
        required: ['order_id', 'order_amount'],
        properties: {
          order_id: { type: 'string' },
          order_amount: { type: 'integer' },
          currency: { type: 'string', default: 'GHS' },
        },
      },
    },
    handler: async (request) => {
      adService.recordConversion(request.params.boostId, request.body);
      return { status: 'success', data: { recorded: true } };
    },
  });

  /**
   * List all campaigns for a vendor.
   */
  fastify.get('/ads/vendor/:vendorId', {
    handler: async (request) => {
      const campaigns = adService.listCampaigns(request.params.vendorId);
      return { status: 'success', data: campaigns };
    },
  });
}

module.exports = amplifyRoutes;
