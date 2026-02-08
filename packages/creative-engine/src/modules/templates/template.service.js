const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const logger = require('../../utils/logger');
const { BUILT_IN_TEMPLATES, listTemplates, getTemplate, createTextSvg } = require('./template.engine');

/**
 * Template management service.
 * Handles built-in templates and custom uploaded templates.
 */
class TemplateService {
  constructor() {
    this.templateDir = config.templates.directory;
    this.customTemplates = new Map(); // In-memory store; in production → database
  }

  /**
   * List all available templates (built-in + custom).
   */
  listAll() {
    const builtIn = listTemplates().map((t) => ({ ...t, type: 'built_in' }));
    const custom = Array.from(this.customTemplates.values()).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: 'custom',
      preview_url: t.preview_url,
    }));

    return [...builtIn, ...custom];
  }

  /**
   * Get template by ID (built-in or custom).
   */
  getById(templateId) {
    const builtIn = BUILT_IN_TEMPLATES[templateId];
    if (builtIn) return { ...builtIn, type: 'built_in' };

    const custom = this.customTemplates.get(templateId);
    if (custom) return { ...custom, type: 'custom' };

    return null;
  }

  /**
   * Upload a custom template overlay image.
   * The overlay should be a 1080×1080 or 1080×1920 PNG with transparent areas
   * where the product image and text will be placed.
   *
   * @param {Buffer} imageBuffer - PNG template overlay
   * @param {Object} metadata
   */
  async uploadTemplate(imageBuffer, metadata) {
    const id = metadata.id || uuidv4();

    // Validate dimensions
    const imgMeta = await sharp(imageBuffer).metadata();
    const validDimensions = [
      { w: 1080, h: 1080 },
      { w: 1080, h: 1920 },
    ];

    const isValid = validDimensions.some((d) => d.w === imgMeta.width && d.h === imgMeta.height);
    if (!isValid) {
      throw new Error(`Template must be 1080×1080 or 1080×1920. Got ${imgMeta.width}×${imgMeta.height}`);
    }

    // Save the template
    await fs.mkdir(this.templateDir, { recursive: true });
    const filename = `${id}.png`;
    const filepath = path.join(this.templateDir, filename);
    await sharp(imageBuffer).png().toFile(filepath);

    // Generate preview thumbnail
    const previewBuffer = await sharp(imageBuffer)
      .resize(300, Math.round(300 * (imgMeta.height / imgMeta.width)))
      .jpeg({ quality: 80 })
      .toBuffer();

    const previewFilename = `${id}_preview.jpg`;
    const previewPath = path.join(this.templateDir, previewFilename);
    await fs.writeFile(previewPath, previewBuffer);

    const template = {
      id,
      name: metadata.name || 'Custom Template',
      description: metadata.description || '',
      category: metadata.category || 'custom',
      dimensions: { width: imgMeta.width, height: imgMeta.height },
      overlay_path: filepath,
      preview_url: `/templates/${previewFilename}`,
      created_at: new Date().toISOString(),
      // Default layout config for custom templates
      background: metadata.background || { r: 255, g: 255, b: 255 },
      accent: metadata.accent || '#1A1A2E',
      priceColor: metadata.priceColor || '#E94560',
      textColor: metadata.textColor || '#1A1A2E',
      badgeColor: metadata.badgeColor || '#E94560',
      layout: 'overlay',
    };

    this.customTemplates.set(id, template);
    logger.info({ templateId: id, name: template.name }, 'Custom template uploaded');

    return template;
  }

  /**
   * Delete a custom template.
   */
  async deleteTemplate(templateId) {
    if (BUILT_IN_TEMPLATES[templateId]) {
      throw new Error('Cannot delete built-in templates');
    }

    const template = this.customTemplates.get(templateId);
    if (!template) throw new Error('Template not found');

    // Remove files
    try {
      if (template.overlay_path) await fs.unlink(template.overlay_path);
    } catch {}

    this.customTemplates.delete(templateId);
    logger.info({ templateId }, 'Custom template deleted');
    return { deleted: true };
  }

  /**
   * Generate a preview of a template with sample data.
   */
  async generatePreview(templateId) {
    const template = this.getById(templateId);
    if (!template) throw new Error('Template not found');

    const flyerService = require('../flyers/flyer.service');

    return flyerService.generateFlyer({
      product_id: 'preview',
      tenant_id: 'preview',
      product: {
        name: 'Sample Product Name',
        description: 'High-quality product for your everyday needs',
        image_url: null, // Will use placeholder
        category: 'Electronics',
      },
      pricing: {
        currency: 'GHS',
        full_price: 259900,
      },
      vendor: {
        store_name: 'Demo Store',
      },
      flyer_options: {
        template_id: templateId,
        format: 'square_1080',
        show_installment: true,
        cta_text: 'Buy on Ejua',
      },
    });
  }
}

module.exports = new TemplateService();
