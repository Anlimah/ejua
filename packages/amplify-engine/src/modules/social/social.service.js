const { v4: uuidv4 } = require('uuid');
const metaClient = require('./meta.client');
const logger = require('../../utils/logger');

/**
 * Social posting service.
 *
 * Orchestrates posting across Facebook, Instagram, and WhatsApp.
 * Manages connected accounts (stored in memory for now; production → database).
 * Supports immediate and scheduled posting.
 */
class SocialService {
  constructor() {
    // In-memory stores (production: database tables)
    this.connectedAccounts = new Map(); // vendorId → { pages, tokens }
    this.postHistory = new Map();       // postId → { platform, status, result }
    this.scheduledPosts = new Map();    // scheduleId → { post, publish_at, timer }
  }

  // ─── OAUTH & ACCOUNT CONNECTION ──────────────

  /**
   * Get the OAuth URL for a vendor to connect their Facebook/Instagram.
   */
  getConnectUrl(vendorId) {
    const state = Buffer.from(JSON.stringify({ vendorId })).toString('base64');
    return metaClient.getOAuthUrl(state);
  }

  /**
   * Handle OAuth callback — exchange code, fetch pages, store tokens.
   */
  async handleOAuthCallback(code, state) {
    const { vendorId } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for long-lived token
    const tokenData = await metaClient.exchangeCodeForToken(code);

    // Fetch pages the vendor manages
    const pages = await metaClient.getPages(tokenData.access_token);

    // Store the connection
    this.connectedAccounts.set(vendorId, {
      user_token: tokenData.access_token,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 5184000) * 1000),
      pages,
      connected_at: new Date().toISOString(),
    });

    logger.info({ vendorId, pageCount: pages.length }, 'Meta account connected');

    return {
      vendor_id: vendorId,
      pages: pages.map(({ page_id, name, category, picture_url, instagram_account_id }) => ({
        page_id,
        name,
        category,
        picture_url,
        has_instagram: !!instagram_account_id,
      })),
    };
  }

  /**
   * Get connected accounts for a vendor.
   */
  getConnectedAccounts(vendorId) {
    const account = this.connectedAccounts.get(vendorId);
    if (!account) return null;

    return {
      connected: true,
      connected_at: account.connected_at,
      pages: account.pages.map(({ page_id, name, category, instagram_account_id }) => ({
        page_id,
        name,
        category,
        has_instagram: !!instagram_account_id,
      })),
    };
  }

  // ─── POSTING ─────────────────────────────────

  /**
   * Post to Facebook Page.
   */
  async postToFacebook(vendorId, { page_id, image_url, caption }) {
    const account = this._getAccount(vendorId);
    const page = account.pages.find((p) => p.page_id === page_id);
    if (!page) throw new Error(`Page ${page_id} not connected for this vendor`);

    const result = await metaClient.postToPage({
      pageId: page.page_id,
      pageToken: page.access_token,
      imageUrl: image_url,
      caption,
    });

    const postId = uuidv4();
    this.postHistory.set(postId, {
      id: postId,
      vendor_id: vendorId,
      platform: 'facebook',
      page_id,
      result,
      created_at: new Date().toISOString(),
    });

    return { post_id: postId, ...result };
  }

  /**
   * Post to Instagram Business.
   */
  async postToInstagram(vendorId, { page_id, image_url, caption }) {
    const account = this._getAccount(vendorId);
    const page = account.pages.find((p) => p.page_id === page_id);
    if (!page) throw new Error(`Page ${page_id} not connected`);
    if (!page.instagram_account_id) {
      throw new Error('No Instagram Business account connected to this page');
    }

    const result = await metaClient.postToInstagram({
      igAccountId: page.instagram_account_id,
      pageToken: page.access_token,
      imageUrl: image_url,
      caption,
    });

    const postId = uuidv4();
    this.postHistory.set(postId, {
      id: postId,
      vendor_id: vendorId,
      platform: 'instagram',
      page_id,
      result,
      created_at: new Date().toISOString(),
    });

    return { post_id: postId, ...result };
  }

  /**
   * Send WhatsApp message with product flyer.
   */
  async sendWhatsApp(vendorId, { to, image_url, caption }) {
    const result = await metaClient.sendWhatsAppImage({
      to,
      imageUrl: image_url,
      caption,
    });

    const postId = uuidv4();
    this.postHistory.set(postId, {
      id: postId,
      vendor_id: vendorId,
      platform: 'whatsapp',
      to,
      result,
      created_at: new Date().toISOString(),
    });

    return { post_id: postId, ...result };
  }

  /**
   * Post to multiple platforms at once.
   */
  async postToMultiple(vendorId, { platforms, page_id, image_url, caption }) {
    const results = [];

    for (const platform of platforms) {
      try {
        let result;
        switch (platform) {
          case 'facebook':
            result = await this.postToFacebook(vendorId, { page_id, image_url, caption });
            break;
          case 'instagram':
            result = await this.postToInstagram(vendorId, { page_id, image_url, caption });
            break;
          default:
            result = { status: 'skipped', platform, reason: 'Unknown platform' };
        }
        results.push({ platform, status: 'success', data: result });
      } catch (err) {
        results.push({ platform, status: 'error', error: err.message });
      }
    }

    return results;
  }

  // ─── SCHEDULED POSTING ───────────────────────

  /**
   * Schedule a post for future publication.
   *
   * @param {Object} params
   * @param {string} params.publish_at - ISO datetime with timezone
   * @returns {{ schedule_id, publish_at, status }}
   */
  schedulePost(vendorId, { platforms, page_id, image_url, caption, publish_at }) {
    const publishDate = new Date(publish_at);
    const now = new Date();

    if (publishDate <= now) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduleId = uuidv4();
    const delayMs = publishDate.getTime() - now.getTime();

    const timer = setTimeout(async () => {
      try {
        logger.info({ scheduleId }, 'Executing scheduled post');
        const results = await this.postToMultiple(vendorId, {
          platforms,
          page_id,
          image_url,
          caption,
        });

        const entry = this.scheduledPosts.get(scheduleId);
        if (entry) {
          entry.status = 'published';
          entry.results = results;
          entry.published_at = new Date().toISOString();
        }
      } catch (err) {
        logger.error({ err, scheduleId }, 'Scheduled post failed');
        const entry = this.scheduledPosts.get(scheduleId);
        if (entry) {
          entry.status = 'failed';
          entry.error = err.message;
        }
      }
    }, delayMs);

    this.scheduledPosts.set(scheduleId, {
      id: scheduleId,
      vendor_id: vendorId,
      platforms,
      page_id,
      image_url,
      caption,
      publish_at: publishDate.toISOString(),
      status: 'scheduled',
      created_at: now.toISOString(),
      timer, // For cancellation
    });

    logger.info({ scheduleId, publishAt: publishDate.toISOString(), delayMs }, 'Post scheduled');

    return {
      schedule_id: scheduleId,
      publish_at: publishDate.toISOString(),
      status: 'scheduled',
    };
  }

  /**
   * Cancel a scheduled post.
   */
  cancelScheduledPost(scheduleId) {
    const entry = this.scheduledPosts.get(scheduleId);
    if (!entry) throw new Error('Scheduled post not found');
    if (entry.status !== 'scheduled') throw new Error(`Cannot cancel: status is '${entry.status}'`);

    clearTimeout(entry.timer);
    entry.status = 'cancelled';

    return { schedule_id: scheduleId, status: 'cancelled' };
  }

  /**
   * List scheduled posts for a vendor.
   */
  listScheduledPosts(vendorId) {
    return Array.from(this.scheduledPosts.values())
      .filter((p) => p.vendor_id === vendorId)
      .map(({ timer, ...rest }) => rest) // Don't expose timer handle
      .sort((a, b) => new Date(a.publish_at) - new Date(b.publish_at));
  }

  // ─── POST HISTORY ────────────────────────────

  getPostHistory(vendorId) {
    return Array.from(this.postHistory.values())
      .filter((p) => p.vendor_id === vendorId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // ─── PRIVATE HELPERS ─────────────────────────

  _getAccount(vendorId) {
    const account = this.connectedAccounts.get(vendorId);
    if (!account) throw new Error('No Meta account connected. Connect via OAuth first.');
    return account;
  }
}

module.exports = new SocialService();
