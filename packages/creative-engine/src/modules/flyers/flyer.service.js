const sharp = require('sharp');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const config = require('../../config');
const logger = require('../../utils/logger');
const { generateQRCode } = require('../qr/qr.service');
const { getTemplate, createTextSvg, createBadgeSvg } = require('../templates/template.engine');
const backgroundRemover = require('./background-remover');
const { formatMoney, bpsOf } = require('@ejua/shared');

class FlyerService {
  constructor() {
    this.outputDir = config.output.directory;
  }

  /**
   * Generate a marketing flyer for a product.
   *
   * Input: Product data JSON (from Pillar 1 via API contract)
   * Output: High-res image (JPG/PNG) with product, pricing, QR code, and CTA
   *
   * @param {Object} params - Matches Contract 1 from API spec
   * @returns {Object} { flyer_id, assets, qr_code, metadata }
   */
  async generateFlyer({
    product_id,
    tenant_id,
    product,
    pricing,
    vendor,
    flyer_options = {},
  }) {
    const startTime = Date.now();
    const flyerId = uuidv4();

    const templateId = flyer_options.template_id || 'clean-white';
    const format = flyer_options.format || 'square_1080';
    const showInstallment = flyer_options.show_installment !== false;
    const ctaText = flyer_options.cta_text || 'Buy on Ejua';

    const template = getTemplate(templateId);
    const dimensions = config.output.formats[format] || config.output.formats.square;
    const { width, height } = dimensions;

    logger.info({ flyerId, productId: product_id, template: templateId, format }, 'Generating flyer');

    // ─── STEP 1: Fetch and process product image ──
    let productImage;
    try {
      productImage = await this._fetchAndProcessImage(product.image_url, width, height);
    } catch (err) {
      logger.warn({ err: err.message }, 'Product image fetch failed, using placeholder');
      productImage = await this._createPlaceholder(width, height, template);
    }

    // ─── STEP 2: Generate QR code ─────────────────
    const qrTargetUrl = flyer_options.qr_target_url ||
      `${config.platform.url}/p/${product_id}`;
    const qrSize = Math.round(width * 0.12); // 12% of canvas width
    const qrBuffer = await generateQRCode(qrTargetUrl, { width: qrSize });

    // ─── STEP 3: Prepare text overlays ────────────
    const currency = pricing.currency || 'GHS';
    const fullPrice = pricing.full_price;
    const effectivePrice = pricing.installment_plans?.[0]
      ? pricing.full_price
      : fullPrice;

    // Product name
    const nameOverlay = createTextSvg(this._truncate(product.name, 40), {
      width,
      height: 80,
      fontSize: format === 'story' ? 44 : 40,
      fontWeight: 'bold',
      color: template.textColor,
    });

    // Price
    const priceText = formatMoney(effectivePrice, currency);
    const priceOverlay = createTextSvg(priceText, {
      width,
      height: 70,
      fontSize: format === 'story' ? 56 : 52,
      fontWeight: 'bold',
      color: template.priceColor,
    });

    // Installment badge
    let installmentBadge = null;
    if (showInstallment && pricing.installment_plans?.length > 0) {
      const plan = pricing.installment_plans[0];
      const monthlyFormatted = formatMoney(plan.installment_amount, currency);
      installmentBadge = createBadgeSvg(
        `From ${monthlyFormatted}/mo`,
        {
          width: Math.round(width * 0.4),
          height: 56,
          fontSize: 22,
          bgColor: template.badgeColor,
          textColor: '#FFFFFF',
        }
      );
    } else if (showInstallment) {
      // Calculate default installment preview
      const downPayment = bpsOf(effectivePrice, 4000);
      const monthly = Math.ceil((effectivePrice - downPayment) / 3);
      const monthlyFormatted = formatMoney(monthly, currency);
      installmentBadge = createBadgeSvg(
        `From ${monthlyFormatted}/mo`,
        {
          width: Math.round(width * 0.4),
          height: 56,
          fontSize: 22,
          bgColor: template.badgeColor,
          textColor: '#FFFFFF',
        }
      );
    }

    // CTA button
    const ctaBadge = createBadgeSvg(ctaText, {
      width: Math.round(width * 0.45),
      height: 64,
      fontSize: 26,
      bgColor: template.accent,
      textColor: template.background.r > 128 ? '#FFFFFF' : '#FFFFFF',
      borderRadius: 32,
    });

    // Vendor name
    const vendorOverlay = createTextSvg(vendor?.store_name || 'Ejua Vendor', {
      width,
      height: 40,
      fontSize: 20,
      fontWeight: 'normal',
      color: template.textColor + 'AA', // slightly transparent
    });

    // ─── STEP 4: Composite everything ─────────────
    const composites = [];
    const isStory = format === 'story';
    const productAreaHeight = isStory ? Math.round(height * 0.5) : Math.round(height * 0.55);
    const textStartY = productAreaHeight + 20;

    // Product image (centered in top portion)
    composites.push({
      input: await sharp(productImage)
        .resize({
          width: Math.round(width * 0.7),
          height: productAreaHeight - 40,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
      top: 30,
      left: Math.round(width * 0.15),
    });

    // Product name
    composites.push({
      input: nameOverlay,
      top: textStartY,
      left: 0,
    });

    // Price
    composites.push({
      input: priceOverlay,
      top: textStartY + 75,
      left: 0,
    });

    // Installment badge
    if (installmentBadge) {
      const badgeWidth = Math.round(width * 0.4);
      composites.push({
        input: installmentBadge,
        top: textStartY + 150,
        left: Math.round((width - badgeWidth) / 2),
      });
    }

    // CTA button
    const ctaTop = isStory ? height - 200 : height - 140;
    const ctaWidth = Math.round(width * 0.45);
    composites.push({
      input: ctaBadge,
      top: ctaTop,
      left: Math.round((width - ctaWidth) / 2),
    });

    // QR code (bottom-right corner)
    composites.push({
      input: qrBuffer,
      top: height - qrSize - 20,
      left: width - qrSize - 20,
    });

    // Vendor name (bottom-left)
    composites.push({
      input: vendorOverlay,
      top: height - 50,
      left: 0,
    });

    // ─── STEP 5: Render final image ───────────────
    const canvas = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { ...template.background, alpha: 255 },
      },
    });

    const flyerBuffer = await canvas
      .composite(composites)
      .png({ quality: config.output.quality })
      .toBuffer();

    // Generate thumbnail
    const thumbnailBuffer = await sharp(flyerBuffer)
      .resize(400, Math.round(400 * (height / width)))
      .jpeg({ quality: 80 })
      .toBuffer();

    // ─── STEP 6: Upload to R2 (with local fallback) ──
    let imageUrl, imageUrlHd, thumbnailUrl;

    try {
      const { storage } = require('@ejua/shared');

      // Check if R2 is configured
      if (process.env.R2_ACCESS_KEY_ID) {
        const [flyerUpload, thumbUpload] = await Promise.all([
          storage.uploadFlyer(flyerBuffer, { tenantId: tenant_id, flyerId }),
          storage.uploadFlyerThumbnail(thumbnailBuffer, { tenantId: tenant_id, flyerId }),
        ]);

        imageUrl = flyerUpload.url;
        imageUrlHd = flyerUpload.url; // Same file, max resolution
        thumbnailUrl = thumbUpload.url;
      } else {
        throw new Error('R2 not configured, falling back to local');
      }
    } catch (uploadErr) {
      // Fallback: save to local disk (dev mode)
      logger.debug({ err: uploadErr.message }, 'R2 upload skipped, saving locally');
      await fs.mkdir(this.outputDir, { recursive: true });

      const filename = `${flyerId}.png`;
      await fs.writeFile(path.join(this.outputDir, filename), flyerBuffer);

      const thumbFilename = `${flyerId}_thumb.jpg`;
      await fs.writeFile(path.join(this.outputDir, thumbFilename), thumbnailBuffer);

      imageUrl = `/output/${filename}`;
      imageUrlHd = `/output/${filename}`;
      thumbnailUrl = `/output/${thumbFilename}`;
    }

    const processingTime = Date.now() - startTime;

    logger.info({
      flyerId,
      productId: product_id,
      template: templateId,
      format,
      processingTimeMs: processingTime,
      fileSizeBytes: flyerBuffer.length,
    }, 'Flyer generated');

    // Return Contract 2 response
    return {
      flyer_id: flyerId,
      product_id,
      tenant_id,
      assets: {
        image_url: imageUrl,
        image_url_hd: imageUrlHd,
        thumbnail_url: thumbnailUrl,
        dimensions: { width, height },
        file_size_bytes: flyerBuffer.length,
        format: 'png',
      },
      qr_code: {
        target_url: qrTargetUrl,
        image_url: thumbnailUrl, // QR embedded in flyer already
      },
      metadata: {
        template_id: templateId,
        generated_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        storage: process.env.R2_ACCESS_KEY_ID ? 'r2' : 'local',
      },
    };
  }

  // ─── BATCH GENERATION ────────────────────────

  /**
   * Generate flyers for multiple products in parallel.
   * @param {Array} products - Array of flyer generation params
   * @returns {Array} Array of results
   */
  async generateBatch(products) {
    const concurrency = 3; // Process 3 at a time
    const results = [];

    for (let i = 0; i < products.length; i += concurrency) {
      const batch = products.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((params) => this.generateFlyer(params))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push({ status: 'success', data: result.value });
        } else {
          results.push({ status: 'error', error: result.reason.message });
        }
      }
    }

    return results;
  }

  // ─── PRIVATE HELPERS ─────────────────────────

  async _fetchAndProcessImage(imageUrl, canvasWidth, canvasHeight) {
    if (!imageUrl) throw new Error('No image URL provided');

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });

    let imageBuffer = Buffer.from(response.data);

    // Attempt background removal
    try {
      imageBuffer = await backgroundRemover.removeBackground(imageBuffer);
    } catch (err) {
      logger.warn({ err: err.message }, 'Background removal failed, using original');
    }

    return imageBuffer;
  }

  async _createPlaceholder(width, height, template) {
    // Create a simple placeholder with the template colors
    const size = Math.round(Math.min(width, height) * 0.4);
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="20" fill="${template.accent}20"/>
      <text x="${size / 2}" y="${size / 2 + 10}" 
            font-family="Arial" font-size="24" fill="${template.accent}"
            text-anchor="middle">No Image</text>
    </svg>`;
    return Buffer.from(svg);
  }

  _truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = new FlyerService();
