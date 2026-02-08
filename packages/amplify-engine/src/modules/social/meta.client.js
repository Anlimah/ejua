const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Meta Graph API client.
 *
 * Handles Facebook Pages, Instagram Business, and Meta Marketing API
 * through a single unified client.
 *
 * Authentication flow:
 *   1. Vendor visits our OAuth URL → redirected to Meta login
 *   2. Meta redirects back with a code
 *   3. We exchange code for a short-lived user token
 *   4. We exchange that for a long-lived user token (60 days)
 *   5. We use the user token to get page tokens (never expire)
 *   6. Page tokens are stored per-vendor for posting
 */
class MetaClient {
  constructor() {
    this.graphUrl = config.meta.graphApiUrl;
    this.appId = config.meta.appId;
    this.appSecret = config.meta.appSecret;
    this.redirectUri = config.meta.redirectUri;

    this.client = axios.create({
      baseURL: this.graphUrl,
      timeout: 30000,
    });
  }

  // ─── OAUTH FLOW ──────────────────────────────

  /**
   * Generate the OAuth URL for a vendor to connect their Facebook page.
   * @returns {string} URL to redirect the vendor to
   */
  getOAuthUrl(state = '') {
    const scopes = config.meta.permissions.join(',');
    return `https://www.facebook.com/${config.meta.graphApiVersion}/dialog/oauth?` +
      `client_id=${this.appId}` +
      `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
      `&scope=${scopes}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`;
  }

  /**
   * Exchange the OAuth code for a short-lived token, then extend it.
   * @param {string} code - Code from Meta redirect
   * @returns {{ access_token, token_type, expires_in }}
   */
  async exchangeCodeForToken(code) {
    try {
      // Step 1: Exchange code for short-lived token
      const { data: shortLived } = await this.client.get('/oauth/access_token', {
        params: {
          client_id: this.appId,
          client_secret: this.appSecret,
          redirect_uri: this.redirectUri,
          code,
        },
      });

      // Step 2: Exchange for long-lived token (60 days)
      const { data: longLived } = await this.client.get('/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortLived.access_token,
        },
      });

      logger.info('OAuth token exchanged and extended');
      return longLived;
    } catch (err) {
      logger.error({ err: err.response?.data || err.message }, 'OAuth token exchange failed');
      throw new Error(`Meta OAuth failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Get the list of Facebook Pages the user manages.
   * Each page comes with its own never-expiring page access token.
   */
  async getPages(userAccessToken) {
    try {
      const { data } = await this.client.get('/me/accounts', {
        params: {
          access_token: userAccessToken,
          fields: 'id,name,access_token,category,picture,instagram_business_account',
        },
      });

      return data.data.map((page) => ({
        page_id: page.id,
        name: page.name,
        access_token: page.access_token, // Page-level token (never expires)
        category: page.category,
        picture_url: page.picture?.data?.url,
        instagram_account_id: page.instagram_business_account?.id || null,
      }));
    } catch (err) {
      logger.error({ err: err.response?.data || err.message }, 'Failed to fetch pages');
      throw new Error(`Failed to get pages: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // ─── FACEBOOK PAGE POSTING ───────────────────

  /**
   * Post a photo with caption to a Facebook Page.
   *
   * @param {Object} params
   * @param {string} params.pageId - Facebook Page ID
   * @param {string} params.pageToken - Page access token
   * @param {string} params.imageUrl - Public URL of the image (flyer)
   * @param {string} params.caption - Post text
   * @param {boolean} [params.published=true] - Set false to create unpublished/dark post for ads
   * @returns {{ post_id, created_time }}
   */
  async postToPage({ pageId, pageToken, imageUrl, caption, published = true }) {
    try {
      const { data } = await this.client.post(`/${pageId}/photos`, null, {
        params: {
          url: imageUrl,
          message: caption,
          published,
          access_token: pageToken,
        },
      });

      logger.info({ pageId, postId: data.id, published }, 'Posted to Facebook Page');
      return {
        post_id: data.id,
        platform: 'facebook',
        page_id: pageId,
        published,
      };
    } catch (err) {
      logger.error({ err: err.response?.data || err.message, pageId }, 'Facebook post failed');
      throw new Error(`Facebook post failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Post a text-only update to a Facebook Page.
   */
  async postTextToPage({ pageId, pageToken, message }) {
    try {
      const { data } = await this.client.post(`/${pageId}/feed`, null, {
        params: {
          message,
          access_token: pageToken,
        },
      });

      return { post_id: data.id, platform: 'facebook', page_id: pageId };
    } catch (err) {
      throw new Error(`Facebook text post failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // ─── INSTAGRAM BUSINESS POSTING ──────────────

  /**
   * Post to Instagram Business account (connected via Facebook Page).
   *
   * Instagram API requires a 2-step process:
   *   1. Create a media container (upload)
   *   2. Publish the container
   *
   * @param {Object} params
   * @param {string} params.igAccountId - Instagram Business Account ID
   * @param {string} params.pageToken - Page access token (IG uses page tokens)
   * @param {string} params.imageUrl - Public URL of the image (must be accessible from Meta servers)
   * @param {string} params.caption - Post caption
   * @returns {{ creation_id, media_id, permalink }}
   */
  async postToInstagram({ igAccountId, pageToken, imageUrl, caption }) {
    try {
      // Step 1: Create media container
      const { data: container } = await this.client.post(`/${igAccountId}/media`, null, {
        params: {
          image_url: imageUrl,
          caption,
          access_token: pageToken,
        },
      });

      // Step 2: Publish the container
      const { data: published } = await this.client.post(`/${igAccountId}/media_publish`, null, {
        params: {
          creation_id: container.id,
          access_token: pageToken,
        },
      });

      // Get permalink
      let permalink = null;
      try {
        const { data: mediaInfo } = await this.client.get(`/${published.id}`, {
          params: { fields: 'permalink', access_token: pageToken },
        });
        permalink = mediaInfo.permalink;
      } catch {}

      logger.info({ igAccountId, mediaId: published.id }, 'Posted to Instagram');
      return {
        creation_id: container.id,
        media_id: published.id,
        platform: 'instagram',
        permalink,
      };
    } catch (err) {
      logger.error({ err: err.response?.data || err.message, igAccountId }, 'Instagram post failed');
      throw new Error(`Instagram post failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // ─── WHATSAPP BUSINESS ───────────────────────

  /**
   * Send a WhatsApp message with an image (product flyer) and caption.
   * Uses the WhatsApp Business API (Cloud API via Meta).
   *
   * @param {Object} params
   * @param {string} params.to - Recipient phone number (international format)
   * @param {string} params.imageUrl - Public URL of the flyer
   * @param {string} params.caption - Message text
   * @returns {{ message_id }}
   */
  async sendWhatsAppImage({ to, imageUrl, caption }) {
    try {
      const { data } = await axios.post(
        `${config.whatsapp.apiUrl}/${config.whatsapp.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'image',
          image: {
            link: imageUrl,
            caption,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info({ to: to.slice(-4), messageId: data.messages?.[0]?.id }, 'WhatsApp message sent');
      return {
        message_id: data.messages?.[0]?.id,
        platform: 'whatsapp',
      };
    } catch (err) {
      logger.error({ err: err.response?.data || err.message }, 'WhatsApp send failed');
      throw new Error(`WhatsApp failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  // ─── META MARKETING API (ADS) ────────────────

  /**
   * Create an ad campaign.
   *
   * @param {Object} params
   * @param {string} params.adAccountId - Meta Ad Account ID (act_XXXX)
   * @param {string} params.userToken - Long-lived user token with ads_management permission
   * @param {string} params.name - Campaign name
   * @param {string} [params.objective='OUTCOME_TRAFFIC'] - Campaign objective
   * @returns {{ campaign_id }}
   */
  async createCampaign({ adAccountId, userToken, name, objective = 'OUTCOME_TRAFFIC' }) {
    try {
      const { data } = await this.client.post(`/${adAccountId}/campaigns`, null, {
        params: {
          name,
          objective,
          status: 'PAUSED', // Always create paused, vendor activates
          special_ad_categories: '[]',
          access_token: userToken,
        },
      });

      logger.info({ campaignId: data.id, adAccountId }, 'Ad campaign created');
      return { campaign_id: data.id };
    } catch (err) {
      logger.error({ err: err.response?.data || err.message }, 'Campaign creation failed');
      throw new Error(`Campaign failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Create an ad set with targeting and budget.
   */
  async createAdSet({ adAccountId, userToken, campaignId, name, dailyBudget, targeting, startTime }) {
    try {
      const { data } = await this.client.post(`/${adAccountId}/adsets`, null, {
        params: {
          name,
          campaign_id: campaignId,
          daily_budget: dailyBudget, // In smallest currency unit (pesewas)
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          targeting: JSON.stringify(targeting),
          start_time: startTime || new Date().toISOString(),
          status: 'PAUSED',
          access_token: userToken,
        },
      });

      return { adset_id: data.id };
    } catch (err) {
      throw new Error(`Ad set failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Create an ad creative from a flyer (page post).
   */
  async createAdCreative({ adAccountId, userToken, pageId, name, imageUrl, linkUrl, message, headline }) {
    try {
      // First, upload the image to the ad account
      const { data: imageData } = await this.client.post(`/${adAccountId}/adimages`, null, {
        params: {
          url: imageUrl,
          access_token: userToken,
        },
      });

      const imageHash = Object.values(imageData.images)[0]?.hash;
      if (!imageHash) throw new Error('Image upload failed');

      // Create the creative
      const { data } = await this.client.post(`/${adAccountId}/adcreatives`, null, {
        params: {
          name,
          object_story_spec: JSON.stringify({
            page_id: pageId,
            link_data: {
              image_hash: imageHash,
              link: linkUrl,
              message,
              name: headline,
              call_to_action: {
                type: 'SHOP_NOW',
                value: { link: linkUrl },
              },
            },
          }),
          access_token: userToken,
        },
      });

      return { creative_id: data.id, image_hash: imageHash };
    } catch (err) {
      throw new Error(`Creative failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Create and link an ad to ad set + creative.
   */
  async createAd({ adAccountId, userToken, adSetId, creativeId, name }) {
    try {
      const { data } = await this.client.post(`/${adAccountId}/ads`, null, {
        params: {
          name,
          adset_id: adSetId,
          creative: JSON.stringify({ creative_id: creativeId }),
          status: 'PAUSED',
          access_token: userToken,
        },
      });

      return { ad_id: data.id };
    } catch (err) {
      throw new Error(`Ad creation failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  /**
   * Get ad insights (performance data).
   */
  async getAdInsights({ objectId, userToken, datePreset = 'last_7d', level = 'ad' }) {
    try {
      const { data } = await this.client.get(`/${objectId}/insights`, {
        params: {
          fields: 'impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type',
          date_preset: datePreset,
          level,
          access_token: userToken,
        },
      });

      return data.data || [];
    } catch (err) {
      throw new Error(`Insights failed: ${err.response?.data?.error?.message || err.message}`);
    }
  }
}

module.exports = new MetaClient();
