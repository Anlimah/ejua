const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('./logger');

/**
 * Cloudflare R2 Storage Service.
 *
 * R2 is S3-compatible with zero egress fees — perfect for serving
 * product images and marketing flyers across African markets.
 *
 * Directory structure inside the bucket:
 *   ejua/
 *     products/{tenant_id}/{product_id}/{filename}
 *     flyers/{tenant_id}/{flyer_id}/{filename}
 *     templates/{template_id}/{filename}
 *     vendors/{tenant_id}/{vendor_id}/{filename}
 */
class StorageService {
  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME || 'nesisoft-s3-bucket';
    this.prefix = process.env.R2_PREFIX || 'ejua';
    this.publicUrl = process.env.R2_PUBLIC_URL || ''; // Set when custom domain is configured

    this.client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || 'https://30eb54551b0d67c56918195b7a1fc21b.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true, // Required for Cloudflare R2
    });
  }

  // ─── UPLOAD ──────────────────────────────────

  /**
   * Upload a file to R2.
   *
   * @param {Buffer} buffer - File contents
   * @param {Object} opts
   * @param {string} opts.folder - Subfolder (e.g., 'products', 'flyers')
   * @param {string} opts.tenantId - Tenant ID for namespace isolation
   * @param {string} opts.entityId - Product/flyer/vendor ID
   * @param {string} opts.filename - Original or desired filename
   * @param {string} opts.contentType - MIME type (e.g., 'image/png')
   * @param {string} [opts.cacheControl] - Cache-Control header
   * @returns {{ key, url, size }}
   */
  async upload(buffer, { folder, tenantId, entityId, filename, contentType, cacheControl }) {
    // Build the key: ejua/products/{tenant}/{entity}/{uuid}-{filename}
    const ext = path.extname(filename) || this._extFromMime(contentType);
    const uniqueName = `${uuidv4().slice(0, 8)}-${this._sanitize(filename)}`;
    const key = [this.prefix, folder, tenantId, entityId, uniqueName]
      .filter(Boolean)
      .join('/');

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: cacheControl || 'public, max-age=31536000, immutable',
    });

    await this.client.send(command);

    // Build the public URL
    // With R2 public access enabled, files are accessible at:
    //   https://pub-{id}.r2.dev/{key}
    // In production with custom domain:
    //   https://assets.ejua.com/{key}
    const url = this.publicUrl
      ? `${this.publicUrl}/${key}`
      : `https://pub-a0a8767766c84b1d804f6206f3d1d5d3.r2.dev/${key}`;

    logger.info({ key, size: buffer.length, contentType, url }, 'File uploaded to R2');

    return {
      key,
      url,
      size: buffer.length,
      content_type: contentType,
    };
  }

  // ─── CONVENIENCE UPLOADERS ───────────────────

  /**
   * Upload a product image.
   */
  async uploadProductImage(buffer, { tenantId, productId, filename, contentType }) {
    return this.upload(buffer, {
      folder: 'products',
      tenantId,
      entityId: productId,
      filename: filename || 'image.jpg',
      contentType: contentType || 'image/jpeg',
    });
  }

  /**
   * Upload a generated flyer.
   */
  async uploadFlyer(buffer, { tenantId, flyerId, format = 'png' }) {
    return this.upload(buffer, {
      folder: 'flyers',
      tenantId,
      entityId: flyerId,
      filename: `flyer.${format}`,
      contentType: format === 'jpg' ? 'image/jpeg' : 'image/png',
    });
  }

  /**
   * Upload a flyer thumbnail.
   */
  async uploadFlyerThumbnail(buffer, { tenantId, flyerId }) {
    return this.upload(buffer, {
      folder: 'flyers',
      tenantId,
      entityId: flyerId,
      filename: 'thumb.jpg',
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=86400',
    });
  }

  /**
   * Upload a vendor logo.
   */
  async uploadVendorLogo(buffer, { tenantId, vendorId, contentType }) {
    return this.upload(buffer, {
      folder: 'vendors',
      tenantId,
      entityId: vendorId,
      filename: 'logo.png',
      contentType: contentType || 'image/png',
    });
  }

  /**
   * Upload a custom template overlay.
   */
  async uploadTemplate(buffer, { templateId }) {
    return this.upload(buffer, {
      folder: 'templates',
      tenantId: null,
      entityId: templateId,
      filename: 'overlay.png',
      contentType: 'image/png',
    });
  }

  // ─── READ ────────────────────────────────────

  /**
   * Get a file as a Buffer.
   */
  async getFile(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Check if a file exists.
   */
  async exists(key) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a pre-signed URL for temporary access (default 1 hour).
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  // ─── DELETE ──────────────────────────────────

  /**
   * Delete a file from R2.
   */
  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
    logger.info({ key }, 'File deleted from R2');
  }

  // ─── HELPERS ─────────────────────────────────

  _sanitize(filename) {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  _extFromMime(mime) {
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
    };
    return map[mime] || '';
  }
}

module.exports = new StorageService();
