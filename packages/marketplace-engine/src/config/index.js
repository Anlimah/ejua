const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'ejua_marketplace',
    user: process.env.DB_USER || 'ejua_admin',
    password: process.env.DB_PASSWORD || '',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    },
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  motito: {
    apiUrl: process.env.MOTITO_API_URL || 'https://sandbox.motito.co/v1',
    merchantId: process.env.MOTITO_MERCHANT_ID || '',
    apiKey: process.env.MOTITO_API_KEY || '',
    webhookSecret: process.env.MOTITO_WEBHOOK_SECRET || '',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    apiUrl: process.env.PAYSTACK_API_URL || 'https://api.paystack.co',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3001/api/v1/payments/callback',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
  },

  momo: {
    apiUrl: process.env.MOMO_API_URL || 'https://sandbox.momodeveloper.mtn.com',
    subscriptionKey: process.env.MOMO_SUBSCRIPTION_KEY || '',
    apiUser: process.env.MOMO_API_USER || '',
    apiKey: process.env.MOMO_API_KEY || '',
    environment: process.env.MOMO_ENVIRONMENT || 'sandbox',
    currency: process.env.MOMO_CURRENCY || 'GHS',
  },

  r2: {
    endpoint: process.env.R2_ENDPOINT || 'https://30eb54551b0d67c56918195b7a1fc21b.r2.cloudflarestorage.com',
    bucketName: process.env.R2_BUCKET_NAME || 'nesisoft-s3-bucket',
    prefix: process.env.R2_PREFIX || 'ejua',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },

  platform: {
    name: process.env.PLATFORM_NAME || 'Ejua',
    url: process.env.PLATFORM_URL || 'https://ejua.com',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'GHS',
    defaultCommissionBps: parseInt(process.env.DEFAULT_COMMISSION_BPS, 10) || 1000,
    defaultEscrowDays: parseInt(process.env.DEFAULT_ESCROW_DAYS, 10) || 14,
    defaultGracePeriodDays: parseInt(process.env.DEFAULT_GRACE_PERIOD_DAYS, 10) || 3,
    defaultLateFeeBps: parseInt(process.env.DEFAULT_LATE_FEE_BPS, 10) || 200,
    defaultLateFeeCapBps: parseInt(process.env.DEFAULT_LATE_FEE_CAP_BPS, 10) || 1500,
  },
};

module.exports = config;
