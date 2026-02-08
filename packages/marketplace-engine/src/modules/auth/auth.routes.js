const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../utils/db');
const config = require('../../config');
const walletService = require('../wallets/wallet.service');
const { successResponse, ValidationError, WalletOwnerType } = require('@ejua/shared');

function generateTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    vendorId: user.vendor_id || null,
    tenantId: user.tenant_id,
  };

  const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
}

async function authRoutes(fastify) {
  const db = getDb();

  // ─── REGISTER ────────────────────────────────
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password', 'first_name'],
        properties: {
          phone: { type: 'string', minLength: 10 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          role: { type: 'string', enum: ['customer', 'vendor'] },
        },
      },
    },
    handler: async (request, reply) => {
      const { phone, email, password, first_name, last_name, role = 'customer' } = request.body;
      const tenantId = request.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000001';

      // Check for existing user
      const existing = await db('users')
        .where({ tenant_id: tenantId, phone })
        .first();

      if (existing) {
        throw new ValidationError('Phone number already registered', 'phone');
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [user] = await db('users')
        .insert({
          id: uuidv4(),
          tenant_id: tenantId,
          phone,
          email: email || null,
          password_hash: passwordHash,
          first_name,
          last_name: last_name || null,
          role,
        })
        .returning('*');

      // Create customer wallet
      await walletService.createWallet(
        tenantId,
        WalletOwnerType.CUSTOMER,
        user.id,
        config.platform.defaultCurrency
      );

      const tokens = generateTokens(user);

      return reply.status(201).send(
        successResponse({
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
          },
          ...tokens,
        })
      );
    },
  });

  // ─── LOGIN ───────────────────────────────────
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const { phone, password } = request.body;
      const tenantId = request.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000001';

      const user = await db('users')
        .where({ tenant_id: tenantId, phone, is_active: true })
        .first();

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        throw new ValidationError('Invalid phone or password');
      }

      // If vendor, attach vendor_id
      let vendorId = null;
      if (user.role === 'vendor') {
        const vendor = await db('vendors').where({ user_id: user.id }).first();
        vendorId = vendor?.id;
      }

      const tokens = generateTokens({ ...user, vendor_id: vendorId });

      return successResponse({
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          vendor_id: vendorId,
        },
        ...tokens,
      });
    },
  });
}

module.exports = authRoutes;
