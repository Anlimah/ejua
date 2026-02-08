const { v4: uuidv4 } = require('uuid');
const metaClient = require('../social/meta.client');
const socialService = require('../social/social.service');
const logger = require('../../utils/logger');
const config = require('../../config');

/**
 * Ad campaign service.
 *
 * Abstracts the complexity of Meta Marketing API into a simple
 * "boost this product" action. Vendors don't need to understand
 * campaigns, ad sets, creatives, or targeting.
 */
class AdService {
  constructor() {
    // In-memory campaign store (production: database)
    this.campaigns = new Map();
  }

  /**
   * One-click ad boost for a product flyer.
   *
   * Creates the full Meta ad stack:
   *   Campaign → Ad Set (with targeting + budget) → Creative (flyer) → Ad
   *
   * @param {Object} params
   * @param {string} params.vendorId
   * @param {string} params.pageId - Facebook Page ID
   * @param {string} params.adAccountId - Meta Ad Account ID (act_XXXX)
   * @param {string} params.imageUrl - Flyer URL (from Creative Engine)
   * @param {string} params.linkUrl - Product checkout page URL
   * @param {string} params.productName
   * @param {string} params.message - Ad copy
   * @param {string} params.headline - Ad headline
   * @param {number} params.dailyBudget - Daily budget in pesewas
   * @param {number} [params.durationDays=7] - How many days to run
   * @param {Object} [params.targeting] - Custom targeting (or defaults used)
   * @returns {Object} Campaign summary
   */
  async boostProduct({
    vendorId,
    pageId,
    adAccountId,
    imageUrl,
    linkUrl,
    productName,
    message,
    headline,
    dailyBudget,
    durationDays = 7,
    targeting,
  }) {
    const account = socialService.getConnectedAccounts(vendorId);
    if (!account) throw new Error('Connect your Meta account first');

    const connectedAccount = socialService.connectedAccounts.get(vendorId);
    const userToken = connectedAccount.user_token;

    // Default targeting: Ghana, 18-65, all genders
    const defaultTargeting = {
      geo_locations: {
        countries: ['GH'],
      },
      age_min: 18,
      age_max: 65,
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'marketplace'],
      instagram_positions: ['stream', 'story', 'explore'],
    };

    const adTargeting = { ...defaultTargeting, ...targeting };
    const campaignName = `Ejua Boost: ${productName}`;

    try {
      // Step 1: Create campaign
      const campaign = await metaClient.createCampaign({
        adAccountId,
        userToken,
        name: campaignName,
        objective: 'OUTCOME_TRAFFIC',
      });

      // Step 2: Create ad set with budget and targeting
      const startTime = new Date();
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + durationDays);

      const adSet = await metaClient.createAdSet({
        adAccountId,
        userToken,
        campaignId: campaign.campaign_id,
        name: `${campaignName} - Ad Set`,
        dailyBudget,
        targeting: adTargeting,
        startTime: startTime.toISOString(),
      });

      // Step 3: Create creative from flyer
      const creative = await metaClient.createAdCreative({
        adAccountId,
        userToken,
        pageId,
        name: `${campaignName} - Creative`,
        imageUrl,
        linkUrl,
        message: message || `Check out ${productName} on Ejua!`,
        headline: headline || productName,
      });

      // Step 4: Create the ad
      const ad = await metaClient.createAd({
        adAccountId,
        userToken,
        adSetId: adSet.adset_id,
        creativeId: creative.creative_id,
        name: `${campaignName} - Ad`,
      });

      // Store campaign info
      const boostId = uuidv4();
      const campaignData = {
        id: boostId,
        vendor_id: vendorId,
        product_name: productName,
        campaign_id: campaign.campaign_id,
        adset_id: adSet.adset_id,
        creative_id: creative.creative_id,
        ad_id: ad.ad_id,
        daily_budget: dailyBudget,
        total_budget: dailyBudget * durationDays,
        duration_days: durationDays,
        start_date: startTime.toISOString(),
        end_date: endTime.toISOString(),
        status: 'paused', // Vendor must explicitly activate
        targeting: adTargeting,
        created_at: new Date().toISOString(),
      };

      this.campaigns.set(boostId, campaignData);

      logger.info({
        boostId,
        campaignId: campaign.campaign_id,
        adId: ad.ad_id,
        dailyBudget,
      }, 'Product ad boost created');

      return campaignData;
    } catch (err) {
      logger.error({ err: err.message, vendorId, productName }, 'Ad boost failed');
      throw err;
    }
  }

  /**
   * Get performance data for an ad campaign.
   */
  async getPerformance(boostId) {
    const campaign = this.campaigns.get(boostId);
    if (!campaign) throw new Error('Campaign not found');

    const connectedAccount = socialService.connectedAccounts.get(campaign.vendor_id);
    if (!connectedAccount) throw new Error('Meta account disconnected');

    const insights = await metaClient.getAdInsights({
      objectId: campaign.ad_id,
      userToken: connectedAccount.user_token,
      datePreset: 'lifetime',
    });

    const data = insights[0] || {};

    return {
      boost_id: boostId,
      campaign_id: campaign.campaign_id,
      status: campaign.status,
      budget: {
        daily: campaign.daily_budget,
        total: campaign.total_budget,
        spent: parseInt(data.spend || 0),
      },
      performance: {
        impressions: parseInt(data.impressions || 0),
        clicks: parseInt(data.clicks || 0),
        reach: parseInt(data.reach || 0),
        cpc: parseFloat(data.cpc || 0), // Cost per click
        cpm: parseFloat(data.cpm || 0), // Cost per 1000 impressions
        ctr: parseFloat(data.ctr || 0), // Click-through rate
        frequency: parseFloat(data.frequency || 0),
      },
      conversions: this._extractConversions(data.actions),
      period: {
        start: campaign.start_date,
        end: campaign.end_date,
      },
    };
  }

  /**
   * List all campaigns for a vendor.
   */
  listCampaigns(vendorId) {
    return Array.from(this.campaigns.values())
      .filter((c) => c.vendor_id === vendorId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // ─── CONVERSION TRACKING ─────────────────────

  /**
   * Track a conversion: ad click → order in Pillar 1.
   *
   * Called by the Marketplace Engine when an order is created from
   * a URL containing UTM parameters (ejua_boost_id, ejua_ad_id).
   */
  recordConversion(boostId, { orderId, orderAmount, currency }) {
    const campaign = this.campaigns.get(boostId);
    if (!campaign) return;

    if (!campaign.conversions) campaign.conversions = [];
    campaign.conversions.push({
      order_id: orderId,
      amount: orderAmount,
      currency,
      converted_at: new Date().toISOString(),
    });

    logger.info({ boostId, orderId, orderAmount }, 'Conversion recorded');
  }

  /**
   * Get conversion data: how many ad clicks turned into orders.
   */
  getConversions(boostId) {
    const campaign = this.campaigns.get(boostId);
    if (!campaign) throw new Error('Campaign not found');

    const conversions = campaign.conversions || [];
    const totalRevenue = conversions.reduce((sum, c) => sum + c.amount, 0);
    const totalSpent = campaign.total_budget; // Simplified; actual from insights

    return {
      boost_id: boostId,
      total_conversions: conversions.length,
      total_revenue: totalRevenue,
      total_ad_spend: totalSpent,
      roas: totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : 0, // Return on ad spend
      conversions,
    };
  }

  // ─── PRIVATE ─────────────────────────────────

  _extractConversions(actions) {
    if (!actions) return {};
    const result = {};
    for (const action of actions) {
      result[action.action_type] = parseInt(action.value || 0);
    }
    return result;
  }
}

module.exports = new AdService();
