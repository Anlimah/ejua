const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.CREATIVE_ENGINE_PORT, 10) || 3002,

  // Background removal service
  removeBg: {
    apiKey: process.env.REMOVEBG_API_KEY || '',
    apiUrl: 'https://api.remove.bg/v1.0/removebg',
  },

  // S3 for flyer output storage
  aws: {
    region: process.env.AWS_REGION || 'eu-west-1',
    s3Bucket: process.env.S3_BUCKET || 'ejua-assets-dev',
    cdnUrl: process.env.CDN_URL || '',
  },

  // Output settings
  output: {
    directory: process.env.FLYER_OUTPUT_DIR || path.resolve(__dirname, '../../output'),
    maxWidth: 1080,
    maxHeight: 1920,
    quality: 90,
    formats: {
      square: { width: 1080, height: 1080 },
      story: { width: 1080, height: 1920 },
    },
  },

  // Template directory
  templates: {
    directory: process.env.TEMPLATE_DIR || path.resolve(__dirname, '../../assets/templates'),
  },

  // Platform info for branding
  platform: {
    name: process.env.PLATFORM_NAME || 'Ejua',
    url: process.env.PLATFORM_URL || 'https://ejua.com',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'GHS',
  },
};

module.exports = config;
