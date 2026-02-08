const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.AMPLIFY_ENGINE_PORT, 10) || 3003,

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    graphApiUrl: process.env.META_GRAPH_API_URL || 'https://graph.facebook.com/v19.0',
    graphApiVersion: 'v19.0',
    // OAuth redirect URL (your app must register this in Meta developer portal)
    redirectUri: process.env.META_REDIRECT_URI || 'http://localhost:3003/api/v1/auth/meta/callback',
    // Required permissions for page posting + ad management
    permissions: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'instagram_basic',
      'instagram_content_publish',
      'ads_management',
      'ads_read',
      'business_management',
    ],
  },

  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v19.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    // Token is a page-level token from Meta
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  },

  platform: {
    name: process.env.PLATFORM_NAME || 'Ejua',
    url: process.env.PLATFORM_URL || 'https://ejua.com',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'GHS',
  },

  // Creative engine URL for fetching flyers
  creativeEngine: {
    url: process.env.CREATIVE_ENGINE_URL || 'http://localhost:3002',
  },

  // Marketplace engine URL for product data
  marketplaceEngine: {
    url: process.env.MARKETPLACE_ENGINE_URL || 'http://localhost:3001',
  },
};

module.exports = config;
