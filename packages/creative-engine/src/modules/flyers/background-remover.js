const axios = require('axios');
const sharp = require('sharp');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Remove the background from a product image.
 *
 * Strategy:
 *   1. If remove.bg API key is configured, use their API (best quality)
 *   2. Otherwise, fall back to a simple white-background extraction using Sharp
 *      (works for product photos on white/light backgrounds)
 */
class BackgroundRemover {
  constructor() {
    this.apiKey = config.removeBg.apiKey;
    this.apiUrl = config.removeBg.apiUrl;
  }

  /**
   * Remove background from an image buffer.
   * @param {Buffer} imageBuffer - Original image
   * @returns {Buffer} Image with transparent background (PNG)
   */
  async removeBackground(imageBuffer) {
    if (this.apiKey) {
      return this._removeWithApi(imageBuffer);
    }
    return this._removeWithSharp(imageBuffer);
  }

  /**
   * Use remove.bg API for high-quality background removal.
   */
  async _removeWithApi(imageBuffer) {
    try {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/png' });
      formData.append('image_file', blob, 'product.png');
      formData.append('size', 'regular');
      formData.append('type', 'product');

      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          'X-Api-Key': this.apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      logger.info('Background removed via remove.bg API');
      return Buffer.from(response.data);
    } catch (err) {
      logger.warn({ err: err.message }, 'remove.bg API failed, falling back to Sharp');
      return this._removeWithSharp(imageBuffer);
    }
  }

  /**
   * Simple background removal using Sharp.
   * Works by detecting the dominant background color and making it transparent.
   * Best suited for product images on white/light backgrounds.
   */
  async _removeWithSharp(imageBuffer) {
    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();

      // Strategy: Extract alpha channel if present, or create one based on
      // color distance from edges (assuming background is the edge color)
      const { data, info } = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;

      // Sample corners to detect background color
      const bgSamples = [
        this._getPixel(data, 0, 0, width, channels),                   // top-left
        this._getPixel(data, width - 1, 0, width, channels),           // top-right
        this._getPixel(data, 0, height - 1, width, channels),          // bottom-left
        this._getPixel(data, width - 1, height - 1, width, channels),  // bottom-right
      ];

      // Average background color
      const bgColor = {
        r: Math.round(bgSamples.reduce((s, p) => s + p.r, 0) / 4),
        g: Math.round(bgSamples.reduce((s, p) => s + p.g, 0) / 4),
        b: Math.round(bgSamples.reduce((s, p) => s + p.b, 0) / 4),
      };

      // Create alpha mask based on color distance from background
      const threshold = 50; // Color distance threshold
      const newData = Buffer.alloc(data.length);

      for (let i = 0; i < data.length; i += channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const distance = Math.sqrt(
          Math.pow(r - bgColor.r, 2) +
          Math.pow(g - bgColor.g, 2) +
          Math.pow(b - bgColor.b, 2)
        );

        newData[i] = r;
        newData[i + 1] = g;
        newData[i + 2] = b;
        newData[i + 3] = distance < threshold ? 0 : 255; // transparent if close to bg
      }

      const result = await sharp(newData, { raw: { width, height, channels } })
        .png()
        .toBuffer();

      logger.info('Background removed via Sharp (local)');
      return result;
    } catch (err) {
      logger.error({ err }, 'Sharp background removal failed, returning original');
      // Return original with alpha channel as fallback
      return sharp(imageBuffer).ensureAlpha().png().toBuffer();
    }
  }

  _getPixel(data, x, y, width, channels) {
    const idx = (y * width + x) * channels;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  }
}

module.exports = new BackgroundRemover();
