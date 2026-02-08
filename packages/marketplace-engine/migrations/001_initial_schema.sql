-- ============================================================
-- EJUA MARKETPLACE ENGINE — INITIAL SCHEMA
-- Migration: 001_initial_schema.sql
-- 
-- This creates all tables for:
--   - Multi-tenancy foundation
--   - User & vendor management
--   - Product catalog
--   - Order lifecycle
--   - Wallet & double-entry ledger
--   - Payment splits & escrow
--   - Installment plans & late fees
--   - Currency support
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────

CREATE TYPE wallet_owner_type AS ENUM (
  'vendor', 'customer', 'platform', 'escrow', 'gateway'
);

CREATE TYPE transaction_type AS ENUM (
  'payment', 'split', 'escrow_hold', 'escrow_release',
  'refund', 'late_fee', 'withdrawal', 'adjustment'
);

CREATE TYPE transaction_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'reversed'
);

CREATE TYPE order_status AS ENUM (
  'created', 'bnpl_pending', 'confirmed', 'processing',
  'shipped', 'delivered', 'return_window', 'settled',
  'cancelled', 'refunded'
);

CREATE TYPE installment_plan_status AS ENUM (
  'pending_approval', 'active', 'completed', 'defaulted', 'cancelled'
);

CREATE TYPE installment_status AS ENUM (
  'scheduled', 'pending', 'paid', 'overdue', 'grace_period', 'defaulted'
);

CREATE TYPE payment_method AS ENUM (
  'momo_mtn', 'momo_voda', 'momo_airteltigo', 'card', 'motito'
);

CREATE TYPE split_type AS ENUM (
  'vendor_payout', 'platform_commission', 'gateway_fee', 'tax'
);

CREATE TYPE bnpl_provider AS ENUM ('internal', 'motito');

CREATE TYPE ledger_entry_type AS ENUM ('debit', 'credit');

CREATE TYPE split_status AS ENUM (
  'pending', 'held_in_escrow', 'released', 'refunded'
);

CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'admin');

CREATE TYPE late_fee_type AS ENUM ('percentage', 'flat');

CREATE TYPE flyer_format AS ENUM ('square_1080', 'story_1080x1920');


-- ─────────────────────────────────────────────
-- TENANTS
-- ─────────────────────────────────────────────

CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  domain        VARCHAR(255),
  logo_url      TEXT,
  config        JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default tenant for single-tenant launch
INSERT INTO tenants (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ejua', 'default');


-- ─────────────────────────────────────────────
-- CURRENCIES
-- ─────────────────────────────────────────────

CREATE TABLE currencies (
  code                  VARCHAR(3) PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  symbol                VARCHAR(10) NOT NULL,
  smallest_unit         VARCHAR(20) NOT NULL,
  decimal_places        INTEGER NOT NULL DEFAULT 2,
  exchange_rate_to_usd  DECIMAL(18, 8) NOT NULL DEFAULT 1.0,
  rate_updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active             BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO currencies (code, name, symbol, smallest_unit, decimal_places, exchange_rate_to_usd) VALUES
  ('GHS', 'Ghana Cedi',     'GH₵', 'pesewas',  2, 0.0625),
  ('NGN', 'Nigerian Naira',  '₦',   'kobo',     2, 0.000625),
  ('XOF', 'CFA Franc',      'CFA',  'centimes', 0, 0.00155),
  ('USD', 'US Dollar',      '$',    'cents',    2, 1.0);


-- ─────────────────────────────────────────────
-- USERS (customers + vendor owners + admins)
-- ─────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         VARCHAR(255),
  phone         VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  role          user_role NOT NULL DEFAULT 'customer',
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_phone_tenant ON users(tenant_id, phone);
CREATE UNIQUE INDEX idx_users_email_tenant ON users(tenant_id, email) WHERE email IS NOT NULL;


-- ─────────────────────────────────────────────
-- VENDORS
-- ─────────────────────────────────────────────

CREATE TABLE vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  store_name      VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  phone           VARCHAR(20),
  email           VARCHAR(255),
  address         JSONB DEFAULT '{}',
  commission_bps  INTEGER NOT NULL DEFAULT 1000, -- 10% default
  kyc_status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  kyc_data        JSONB DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_vendors_slug_tenant ON vendors(tenant_id, slug);
CREATE INDEX idx_vendors_user ON vendors(user_id);


-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  parent_id   UUID REFERENCES categories(id),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_categories_slug_tenant ON categories(tenant_id, slug);


-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  category_id     UUID REFERENCES categories(id),
  name            VARCHAR(500) NOT NULL,
  slug            VARCHAR(255) NOT NULL,
  description     TEXT,
  price           BIGINT NOT NULL,           -- in smallest currency unit
  sale_price      BIGINT,                     -- optional discounted price
  currency_code   VARCHAR(3) NOT NULL DEFAULT 'GHS' REFERENCES currencies(code),
  sku             VARCHAR(100),
  stock_quantity  INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  images          JSONB NOT NULL DEFAULT '[]', -- array of {url, alt, sort_order}
  attributes      JSONB DEFAULT '{}',          -- {color: "black", size: "XL"}
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_products_slug_vendor ON products(vendor_id, slug);
CREATE INDEX idx_products_category ON products(category_id) WHERE is_active = true;
CREATE INDEX idx_products_tenant_active ON products(tenant_id) WHERE is_active = true;
CREATE INDEX idx_products_vendor ON products(vendor_id);


-- ─────────────────────────────────────────────
-- PRODUCT VARIANTS (size, colour, etc.)
-- ─────────────────────────────────────────────

CREATE TABLE product_variants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,       -- e.g., "Black / XL"
  sku             VARCHAR(100),
  price_override  BIGINT,                       -- null = use product price
  stock_quantity  INTEGER NOT NULL DEFAULT 0,
  attributes      JSONB NOT NULL DEFAULT '{}',  -- {color: "black", size: "XL"}
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);


-- ─────────────────────────────────────────────
-- WALLETS
-- ─────────────────────────────────────────────

CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  owner_type        wallet_owner_type NOT NULL,
  owner_id          UUID NOT NULL,
  currency_code     VARCHAR(3) NOT NULL REFERENCES currencies(code),
  available_balance BIGINT NOT NULL DEFAULT 0,
  escrow_balance    BIGINT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_available_balance_non_negative CHECK (available_balance >= 0),
  CONSTRAINT chk_escrow_balance_non_negative CHECK (escrow_balance >= 0)
);

CREATE UNIQUE INDEX idx_wallets_owner ON wallets(tenant_id, owner_type, owner_id, currency_code);

-- Create platform system wallets for default tenant
INSERT INTO wallets (id, tenant_id, owner_type, owner_id, currency_code) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'platform', '00000000-0000-0000-0000-000000000001', 'GHS'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'gateway',  '00000000-0000-0000-0000-000000000001', 'GHS');


-- ─────────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────────

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  type            transaction_type NOT NULL,
  status          transaction_status NOT NULL DEFAULT 'pending',
  order_id        UUID,             -- FK added after orders table
  installment_id  UUID,             -- FK added after installments table
  total_amount    BIGINT NOT NULL,
  currency_code   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  reference       VARCHAR(255),      -- external reference (MoMo txn, Motito ref)
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  CONSTRAINT chk_txn_amount_positive CHECK (total_amount > 0)
);

CREATE INDEX idx_txn_order ON transactions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_txn_tenant_status ON transactions(tenant_id, status);
CREATE INDEX idx_txn_reference ON transactions(reference) WHERE reference IS NOT NULL;


-- ─────────────────────────────────────────────
-- LEDGER ENTRIES (immutable, append-only)
-- ─────────────────────────────────────────────

CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  wallet_id       UUID NOT NULL REFERENCES wallets(id),
  entry_type      ledger_entry_type NOT NULL,
  amount          BIGINT NOT NULL,
  currency_code   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  balance_after   BIGINT NOT NULL,
  description     TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key VARCHAR(128) NOT NULL,

  CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_ledger_txn ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_wallet_time ON ledger_entries(wallet_id, created_at DESC);
CREATE UNIQUE INDEX idx_ledger_idempotency ON ledger_entries(idempotency_key);

-- Prevent any updates or deletes on ledger_entries
CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable. Use reversing entries for corrections.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();


-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  customer_id       UUID NOT NULL REFERENCES users(id),
  vendor_id         UUID NOT NULL REFERENCES vendors(id),
  order_number      VARCHAR(20) NOT NULL,
  status            order_status NOT NULL DEFAULT 'created',
  subtotal          BIGINT NOT NULL,
  discount_amount   BIGINT NOT NULL DEFAULT 0,
  shipping_amount   BIGINT NOT NULL DEFAULT 0,
  tax_amount        BIGINT NOT NULL DEFAULT 0,
  total_amount      BIGINT NOT NULL,
  currency_code     VARCHAR(3) NOT NULL REFERENCES currencies(code),
  payment_method    payment_method,
  shipping_address  JSONB DEFAULT '{}',
  notes             TEXT,
  metadata          JSONB DEFAULT '{}',
  return_window_end TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at      TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  settled_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_orders_number_tenant ON orders(tenant_id, order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_vendor ON orders(vendor_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);

-- Now add the FK from transactions to orders
ALTER TABLE transactions
  ADD CONSTRAINT fk_txn_order FOREIGN KEY (order_id) REFERENCES orders(id);


-- ─────────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────────

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id),
  variant_id    UUID REFERENCES product_variants(id),
  product_name  VARCHAR(500) NOT NULL,        -- snapshot at time of order
  unit_price    BIGINT NOT NULL,              -- snapshot
  quantity      INTEGER NOT NULL DEFAULT 1,
  total_price   BIGINT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);


-- ─────────────────────────────────────────────
-- PAYMENT SPLITS
-- ─────────────────────────────────────────────

CREATE TABLE payment_splits (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  transaction_id        UUID NOT NULL REFERENCES transactions(id),
  order_id              UUID NOT NULL REFERENCES orders(id),
  source_wallet_id      UUID NOT NULL REFERENCES wallets(id),
  destination_wallet_id UUID NOT NULL REFERENCES wallets(id),
  split_type            split_type NOT NULL,
  amount                BIGINT NOT NULL,
  percentage_bps        INTEGER NOT NULL,
  currency_code         VARCHAR(3) NOT NULL REFERENCES currencies(code),
  status                split_status NOT NULL DEFAULT 'pending',
  escrow_release_at     TIMESTAMPTZ,
  released_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_split_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_splits_order ON payment_splits(order_id);
CREATE INDEX idx_splits_txn ON payment_splits(transaction_id);
CREATE INDEX idx_splits_escrow ON payment_splits(status, escrow_release_at)
  WHERE status = 'held_in_escrow';


-- ─────────────────────────────────────────────
-- INSTALLMENT PLANS
-- ─────────────────────────────────────────────

CREATE TABLE installment_plans (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  order_id              UUID NOT NULL REFERENCES orders(id),
  customer_id           UUID NOT NULL REFERENCES users(id),
  provider              bnpl_provider NOT NULL,
  provider_reference    VARCHAR(255),
  total_amount          BIGINT NOT NULL,
  down_payment_amount   BIGINT NOT NULL,
  down_payment_pct_bps  INTEGER NOT NULL,
  num_installments      INTEGER NOT NULL,
  interest_rate_bps     INTEGER NOT NULL DEFAULT 0,
  currency_code         VARCHAR(3) NOT NULL REFERENCES currencies(code),
  status                installment_plan_status NOT NULL DEFAULT 'pending_approval',
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX idx_plans_order ON installment_plans(order_id);
CREATE INDEX idx_plans_customer ON installment_plans(customer_id);
CREATE INDEX idx_plans_status ON installment_plans(tenant_id, status);


-- ─────────────────────────────────────────────
-- INSTALLMENTS (individual payments)
-- ─────────────────────────────────────────────

CREATE TABLE installments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  plan_id           UUID NOT NULL REFERENCES installment_plans(id),
  installment_num   INTEGER NOT NULL,           -- 0 = down payment
  amount_due        BIGINT NOT NULL,
  amount_paid       BIGINT NOT NULL DEFAULT 0,
  late_fee_amount   BIGINT NOT NULL DEFAULT 0,
  currency_code     VARCHAR(3) NOT NULL REFERENCES currencies(code),
  due_date          DATE NOT NULL,
  grace_period_days INTEGER NOT NULL DEFAULT 3,
  grace_deadline    DATE NOT NULL,              -- due_date + grace_period_days
  status            installment_status NOT NULL DEFAULT 'scheduled',
  payment_method    payment_method,
  payment_reference VARCHAR(255),
  paid_at           TIMESTAMPTZ,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  next_retry_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_installments_plan_num ON installments(plan_id, installment_num);
CREATE INDEX idx_installments_status_due ON installments(status, due_date)
  WHERE status IN ('scheduled', 'pending', 'overdue', 'grace_period');
CREATE INDEX idx_installments_retry ON installments(next_retry_at)
  WHERE next_retry_at IS NOT NULL AND status IN ('pending', 'overdue');

-- Now add the FK from transactions to installments
ALTER TABLE transactions
  ADD CONSTRAINT fk_txn_installment FOREIGN KEY (installment_id) REFERENCES installments(id);


-- ─────────────────────────────────────────────
-- LATE FEE RULES (per tenant, configurable)
-- ─────────────────────────────────────────────

CREATE TABLE late_fee_rules (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  grace_period_days   INTEGER NOT NULL DEFAULT 3,
  fee_type            late_fee_type NOT NULL DEFAULT 'percentage',
  fee_rate_bps        INTEGER,           -- e.g., 200 = 2% per week
  flat_fee_amount     BIGINT,
  max_fee_pct_bps     INTEGER NOT NULL DEFAULT 1500, -- 15% cap
  auto_retry_enabled  BOOLEAN NOT NULL DEFAULT true,
  max_retries         INTEGER NOT NULL DEFAULT 4,
  retry_backoff_hours INTEGER[] NOT NULL DEFAULT '{24, 48, 96, 168}',
  currency_code       VARCHAR(3) NOT NULL REFERENCES currencies(code),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default late fee rule for GHS
INSERT INTO late_fee_rules (tenant_id, grace_period_days, fee_type, fee_rate_bps, max_fee_pct_bps, currency_code)
VALUES ('00000000-0000-0000-0000-000000000001', 3, 'percentage', 200, 1500, 'GHS');


-- ─────────────────────────────────────────────
-- WEBHOOK EVENTS LOG (for Motito, MoMo callbacks)
-- ─────────────────────────────────────────────

CREATE TABLE webhook_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  provider      VARCHAR(50) NOT NULL,         -- 'motito', 'mtn_momo', etc.
  event_type    VARCHAR(100) NOT NULL,
  payload       JSONB NOT NULL,
  signature     TEXT,
  processed     BOOLEAN NOT NULL DEFAULT false,
  processed_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_unprocessed ON webhook_events(provider, processed)
  WHERE processed = false;


-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_installments_updated_at BEFORE UPDATE ON installments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_late_fee_rules_updated_at BEFORE UPDATE ON late_fee_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
