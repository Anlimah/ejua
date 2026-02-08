const QRCode = require('qrcode');
const logger = require('../utils/logger');

/**
 * Generate a QR code as a PNG buffer.
 *
 * @param {string} url - The target URL (e.g., product checkout page)
 * @param {Object} [opts]
 * @param {number} [opts.width=200] - QR code width in pixels
 * @param {number} [opts.margin=1] - Quiet zone margin
 * @param {string} [opts.color='#000000'] - Foreground color
 * @param {string} [opts.background='#FFFFFF'] - Background color (use '#00000000' for transparent)
 * @returns {Buffer} PNG buffer
 */
async function generateQRCode(url, opts = {}) {
  const {
    width = 200,
    margin = 1,
    color = '#000000',
    background = '#FFFFFF',
  } = opts;

  try {
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width,
      margin,
      color: {
        dark: color,
        light: background,
      },
      errorCorrectionLevel: 'M',
    });

    logger.debug({ url, width }, 'QR code generated');
    return buffer;
  } catch (err) {
    logger.error({ err, url }, 'QR code generation failed');
    throw err;
  }
}

/**
 * Generate a QR code as a data URI for embedding in HTML/templates.
 */
async function generateQRCodeDataUri(url, opts = {}) {
  const { width = 200, margin = 1, color = '#000000' } = opts;

  return QRCode.toDataURL(url, {
    width,
    margin,
    color: { dark: color, light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}

module.exports = { generateQRCode, generateQRCodeDataUri };
