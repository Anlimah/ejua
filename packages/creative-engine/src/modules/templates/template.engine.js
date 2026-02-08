const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Built-in template definitions.
 * Each template defines layout positions, colors, and font sizes
 * for compositing product info onto a canvas.
 *
 * All dimensions are for a 1080×1080 base canvas (scaled for story format).
 */
const BUILT_IN_TEMPLATES = {
  'clean-white': {
    id: 'clean-white',
    name: 'Clean White',
    description: 'Minimalist white background with bold typography',
    background: { r: 255, g: 255, b: 255 },
    accent: '#1A1A2E',
    priceColor: '#E94560',
    textColor: '#1A1A2E',
    badgeColor: '#E94560',
    layout: 'center-product',
    category: 'minimal',
  },
  'dark-luxury': {
    id: 'dark-luxury',
    name: 'Dark Luxury',
    description: 'Dark gradient background with gold accents',
    background: { r: 26, g: 26, b: 46 },
    accent: '#D4AF37',
    priceColor: '#D4AF37',
    textColor: '#FFFFFF',
    badgeColor: '#D4AF37',
    layout: 'center-product',
    category: 'luxury',
  },
  'vibrant-orange': {
    id: 'vibrant-orange',
    name: 'Vibrant Orange',
    description: 'Bold orange accents, great for electronics and tech',
    background: { r: 255, g: 255, b: 255 },
    accent: '#FF6B35',
    priceColor: '#FF6B35',
    textColor: '#2D2D2D',
    badgeColor: '#FF6B35',
    layout: 'center-product',
    category: 'tech',
  },
  'fresh-green': {
    id: 'fresh-green',
    name: 'Fresh Green',
    description: 'Natural green tones for food, beauty, and health products',
    background: { r: 245, g: 250, b: 245 },
    accent: '#2D6A4F',
    priceColor: '#2D6A4F',
    textColor: '#1B4332',
    badgeColor: '#52B788',
    layout: 'center-product',
    category: 'organic',
  },
  'bold-red': {
    id: 'bold-red',
    name: 'Bold Red',
    description: 'High-contrast red for sales and promotions',
    background: { r: 220, g: 20, b: 60 },
    accent: '#FFFFFF',
    priceColor: '#FFD700',
    textColor: '#FFFFFF',
    badgeColor: '#FFD700',
    layout: 'center-product',
    category: 'sale',
  },
  'ocean-blue': {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    description: 'Professional blue tones for services and B2B',
    background: { r: 240, g: 248, b: 255 },
    accent: '#0077B6',
    priceColor: '#0077B6',
    textColor: '#023E8A',
    badgeColor: '#00B4D8',
    layout: 'center-product',
    category: 'professional',
  },
  'afro-pattern': {
    id: 'afro-pattern',
    name: 'Afro Pattern',
    description: 'Warm tones inspired by African textile patterns',
    background: { r: 255, g: 248, b: 230 },
    accent: '#B7410E',
    priceColor: '#B7410E',
    textColor: '#3E2723',
    badgeColor: '#FF8C00',
    layout: 'center-product',
    category: 'fashion',
  },
  'neon-pop': {
    id: 'neon-pop',
    name: 'Neon Pop',
    description: 'Bright neon accents for youth and streetwear',
    background: { r: 18, g: 18, b: 18 },
    accent: '#39FF14',
    priceColor: '#39FF14',
    textColor: '#FFFFFF',
    badgeColor: '#FF1493',
    layout: 'center-product',
    category: 'streetwear',
  },
  'pastel-dream': {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    description: 'Soft pastels for beauty, baby, and lifestyle products',
    background: { r: 255, g: 240, b: 245 },
    accent: '#DB7093',
    priceColor: '#C71585',
    textColor: '#4A4A4A',
    badgeColor: '#DB7093',
    layout: 'center-product',
    category: 'beauty',
  },
  'classic-gold': {
    id: 'classic-gold',
    name: 'Classic Gold',
    description: 'Premium gold on cream for jewelry and accessories',
    background: { r: 255, g: 253, b: 245 },
    accent: '#B8860B',
    priceColor: '#B8860B',
    textColor: '#333333',
    badgeColor: '#DAA520',
    layout: 'center-product',
    category: 'jewelry',
  },
};

/**
 * Get a template by ID.
 */
function getTemplate(templateId) {
  return BUILT_IN_TEMPLATES[templateId] || BUILT_IN_TEMPLATES['clean-white'];
}

/**
 * List all available templates.
 */
function listTemplates() {
  return Object.values(BUILT_IN_TEMPLATES).map(({ id, name, description, category }) => ({
    id, name, description, category,
  }));
}

/**
 * Render text onto an SVG for compositing.
 * Sharp doesn't have native text rendering, so we create SVG text overlays.
 */
function createTextSvg(text, {
  width = 1080,
  height = 100,
  fontSize = 48,
  fontWeight = 'bold',
  color = '#000000',
  align = 'center',
  fontFamily = 'Arial, Helvetica, sans-serif',
}) {
  const x = align === 'center' ? width / 2 : (align === 'right' ? width - 40 : 40);
  const anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');

  // Escape special XML characters
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${x}" y="${height * 0.7}" 
          font-family="${fontFamily}" 
          font-size="${fontSize}" 
          font-weight="${fontWeight}" 
          fill="${color}" 
          text-anchor="${anchor}">
      ${escaped}
    </text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * Create a colored rectangle with rounded corners.
 */
function createBadgeSvg(text, {
  width = 300,
  height = 60,
  fontSize = 24,
  bgColor = '#E94560',
  textColor = '#FFFFFF',
  borderRadius = 12,
}) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" fill="${bgColor}"/>
    <text x="${width / 2}" y="${height * 0.65}" 
          font-family="Arial, Helvetica, sans-serif" 
          font-size="${fontSize}" 
          font-weight="bold" 
          fill="${textColor}" 
          text-anchor="middle">
      ${escaped}
    </text>
  </svg>`;

  return Buffer.from(svg);
}

module.exports = {
  BUILT_IN_TEMPLATES,
  getTemplate,
  listTemplates,
  createTextSvg,
  createBadgeSvg,
};
