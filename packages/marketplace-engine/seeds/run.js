#!/usr/bin/env node

/**
 * Seed the database with test data for local development.
 * Usage: node seeds/run.js
 *
 * Creates:
 *   - 1 admin user
 *   - 2 vendor users with stores
 *   - 1 customer user
 *   - 5 categories
 *   - 8 products across vendors
 *   - Platform + gateway wallets (if not existing)
 *   - Vendor + customer wallets
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, testConnection, closeDb } = require('../src/utils/db');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_PASSWORD = 'password123'; // For all test users

async function seed() {
  const db = getDb();

  console.log('🌱 Seeding database...\n');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  // ─── USERS ─────────────────────────────────

  const adminId = uuidv4();
  const vendor1UserId = uuidv4();
  const vendor2UserId = uuidv4();
  const customerId = uuidv4();

  const users = [
    {
      id: adminId, tenant_id: TENANT_ID, phone: '0201000001',
      email: 'admin@ejua.com', password_hash: passwordHash,
      first_name: 'Platform', last_name: 'Admin', role: 'admin', is_verified: true,
    },
    {
      id: vendor1UserId, tenant_id: TENANT_ID, phone: '0241000001',
      email: 'kwame@techzone.com', password_hash: passwordHash,
      first_name: 'Kwame', last_name: 'Asante', role: 'vendor', is_verified: true,
    },
    {
      id: vendor2UserId, tenant_id: TENANT_ID, phone: '0271000001',
      email: 'ama@styleghana.com', password_hash: passwordHash,
      first_name: 'Ama', last_name: 'Mensah', role: 'vendor', is_verified: true,
    },
    {
      id: customerId, tenant_id: TENANT_ID, phone: '0551000001',
      email: 'kofi@gmail.com', password_hash: passwordHash,
      first_name: 'Kofi', last_name: 'Owusu', role: 'customer', is_verified: true,
    },
  ];

  for (const user of users) {
    const existing = await db('users').where({ tenant_id: TENANT_ID, phone: user.phone }).first();
    if (!existing) {
      await db('users').insert(user);
      console.log(`  ✓ User: ${user.first_name} ${user.last_name} (${user.role}) — phone: ${user.phone}`);
    } else {
      console.log(`  ⏭ User: ${user.phone} already exists`);
    }
  }

  // ─── VENDORS ───────────────────────────────

  const vendor1Id = uuidv4();
  const vendor2Id = uuidv4();

  const vendors = [
    {
      id: vendor1Id, tenant_id: TENANT_ID, user_id: vendor1UserId,
      store_name: 'TechZone GH', slug: 'techzone-gh',
      description: 'Your one-stop shop for phones, gadgets, and electronics in Accra.',
      phone: '0241000001', email: 'kwame@techzone.com',
      city: 'Accra', region: 'Greater Accra', digital_address: 'GA-123-4567',
      commission_override_bps: null, is_verified: true, is_active: true,
    },
    {
      id: vendor2Id, tenant_id: TENANT_ID, user_id: vendor2UserId,
      store_name: 'Style Ghana', slug: 'style-ghana',
      description: 'Authentic Ghanaian fashion, kente, and accessories handcrafted with love.',
      phone: '0271000001', email: 'ama@styleghana.com',
      city: 'Kumasi', region: 'Ashanti', digital_address: 'AK-456-7890',
      commission_override_bps: 800, is_verified: true, is_active: true,
    },
  ];

  for (const vendor of vendors) {
    const existing = await db('vendors').where({ slug: vendor.slug }).first();
    if (!existing) {
      await db('vendors').insert(vendor);
      console.log(`  ✓ Vendor: ${vendor.store_name} (${vendor.slug})`);
    } else {
      console.log(`  ⏭ Vendor: ${vendor.slug} already exists`);
    }
  }

  // ─── CATEGORIES ────────────────────────────

  const catElectronics = uuidv4();
  const catFashion = uuidv4();
  const catBeauty = uuidv4();
  const catGroceries = uuidv4();
  const catHome = uuidv4();

  const categories = [
    { id: catElectronics, tenant_id: TENANT_ID, name: 'Electronics & Gadgets', slug: 'electronics' },
    { id: catFashion, tenant_id: TENANT_ID, name: 'Fashion & Clothing', slug: 'fashion' },
    { id: catBeauty, tenant_id: TENANT_ID, name: 'Beauty & Health', slug: 'beauty-health' },
    { id: catGroceries, tenant_id: TENANT_ID, name: 'Groceries & Food', slug: 'groceries' },
    { id: catHome, tenant_id: TENANT_ID, name: 'Home & Living', slug: 'home-living' },
  ];

  for (const cat of categories) {
    const existing = await db('categories').where({ tenant_id: TENANT_ID, slug: cat.slug }).first();
    if (!existing) {
      await db('categories').insert(cat);
      console.log(`  ✓ Category: ${cat.name}`);
    } else {
      console.log(`  ⏭ Category: ${cat.slug} already exists`);
    }
  }

  // ─── PRODUCTS ──────────────────────────────

  const products = [
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor1Id, category_id: catElectronics,
      name: 'Samsung Galaxy A15', slug: 'samsung-galaxy-a15',
      description: '6.5" Super AMOLED, 128GB, 4GB RAM, 5000mAh battery. Perfect for everyday use.',
      price: 259900, currency_code: 'GHS', stock_quantity: 50, sku: 'SGA15-128',
      is_featured: true, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor1Id, category_id: catElectronics,
      name: 'JBL Tune 520BT Headphones', slug: 'jbl-tune-520bt',
      description: 'Wireless Bluetooth headphones with 57-hour battery life and JBL Pure Bass.',
      price: 52000, sale_price: 45000, currency_code: 'GHS', stock_quantity: 35, sku: 'JBL520BT',
      is_featured: true, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor1Id, category_id: catElectronics,
      name: 'Oraimo Power Bank 10000mAh', slug: 'oraimo-pb-10000',
      description: 'Dual USB output, fast charging, LED indicator. Never run out of battery.',
      price: 12500, currency_code: 'GHS', stock_quantity: 100, sku: 'ORM-PB10K',
      is_featured: false, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor2Id, category_id: catFashion,
      name: 'Kente Print Dress', slug: 'kente-print-dress',
      description: 'Authentic Ghanaian Kente fabric dress. Handcrafted in Kumasi, available in multiple sizes.',
      price: 45000, sale_price: 38000, currency_code: 'GHS', stock_quantity: 20, sku: 'KNT-DRS-M',
      is_featured: true, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor2Id, category_id: catFashion,
      name: 'Ankara Laptop Bag', slug: 'ankara-laptop-bag',
      description: 'Stylish laptop bag with Ankara fabric exterior. Fits up to 15" laptops.',
      price: 18000, sale_price: 15500, currency_code: 'GHS', stock_quantity: 30, sku: 'ANK-BAG-15',
      is_featured: false, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor2Id, category_id: catBeauty,
      name: 'Shea Butter (500ml)', slug: 'shea-butter-500ml',
      description: 'Pure unrefined shea butter from Northern Ghana. Great for skin and hair care.',
      price: 7500, currency_code: 'GHS', stock_quantity: 80, sku: 'SHB-500',
      is_featured: false, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor1Id, category_id: catElectronics,
      name: 'Infinix Smart 8', slug: 'infinix-smart-8',
      description: '6.6" HD+ display, 64GB storage, dual SIM. Affordable smartphone for everyone.',
      price: 149900, currency_code: 'GHS', stock_quantity: 40, sku: 'INF-SM8-64',
      is_featured: false, is_active: true,
    },
    {
      id: uuidv4(), tenant_id: TENANT_ID, vendor_id: vendor2Id, category_id: catFashion,
      name: 'African Print Sneakers', slug: 'african-print-sneakers',
      description: 'Custom-made sneakers with vibrant African print fabric. Unisex, sizes 38-46.',
      price: 35000, currency_code: 'GHS', stock_quantity: 15, sku: 'AFP-SNK-42',
      is_featured: true, is_active: true,
    },
  ];

  for (const product of products) {
    const existing = await db('products').where({ tenant_id: TENANT_ID, slug: product.slug }).first();
    if (!existing) {
      await db('products').insert(product);
      console.log(`  ✓ Product: ${product.name} — ${(product.price / 100).toFixed(2)} GHS`);
    } else {
      console.log(`  ⏭ Product: ${product.slug} already exists`);
    }
  }

  // ─── WALLETS ───────────────────────────────

  const wallets = [
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'platform', owner_id: 'platform', currency_code: 'GHS', label: 'Ejua Platform Wallet' },
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'gateway', owner_id: 'gateway', currency_code: 'GHS', label: 'Payment Gateway Wallet' },
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'escrow', owner_id: 'escrow', currency_code: 'GHS', label: 'Escrow Holding Wallet' },
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'vendor', owner_id: vendor1Id, currency_code: 'GHS', label: 'TechZone GH Wallet' },
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'vendor', owner_id: vendor2Id, currency_code: 'GHS', label: 'Style Ghana Wallet' },
    { id: uuidv4(), tenant_id: TENANT_ID, owner_type: 'customer', owner_id: customerId, currency_code: 'GHS', label: 'Kofi Owusu Wallet' },
  ];

  for (const wallet of wallets) {
    const existing = await db('wallets')
      .where({ tenant_id: TENANT_ID, owner_type: wallet.owner_type, owner_id: wallet.owner_id })
      .first();
    if (!existing) {
      await db('wallets').insert(wallet);
      console.log(`  ✓ Wallet: ${wallet.label}`);
    } else {
      console.log(`  ⏭ Wallet: ${wallet.label} already exists`);
    }
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Test accounts (password: password123):');
  console.log('  Admin:    0201000001');
  console.log('  Vendor 1: 0241000001 (TechZone GH)');
  console.log('  Vendor 2: 0271000001 (Style Ghana)');
  console.log('  Customer: 0551000001 (Kofi Owusu)\n');
}

async function main() {
  try {
    await testConnection();
    await seed();
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    if (err.message.includes('does not exist')) {
      console.error('\n💡 Did you run migrations first? Try: npm run migrate');
    }
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
