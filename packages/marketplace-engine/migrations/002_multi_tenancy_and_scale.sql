-- ============================================================
-- EJUA MARKETPLACE ENGINE — PHASE 4: MULTI-TENANCY & SCALE
-- Migration: 002_multi_tenancy_and_scale.sql
--
-- Adds:
--   - Tenant configuration (features, branding, fees)
--   - Exchange rate history table
--   - Payment provider profiles per tenant
--   - Tenant API keys
-- ============================================================

-- ─────────────────────────────────────────────
-- EXCHANGE RATE HISTORY
-- Stores daily snapshots for audit and historical conversion
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  to_currency     VARCHAR(3) NOT NULL REFERENCES currencies(code),
  rate            DECIMAL(18, 8) NOT NULL,
  source          VARCHAR(50) NOT NULL DEFAULT 'manual',  -- 'manual', 'openexchangerates', 'exchangerate-api'
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exchange_rate_history_pair ON exchange_rate_history (from_currency, to_currency, fetched_at DESC);

-- ─────────────────────────────────────────────
-- TENANT PAYMENT PROVIDERS
-- Each tenant can have different payment providers
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_payment_providers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  provider        VARCHAR(50) NOT NULL,    -- 'paystack', 'flutterwave', 'wave', 'mpesa'
  country_code    VARCHAR(2) NOT NULL,     -- 'GH', 'NG', 'SN', 'CI'
  currency_code   VARCHAR(3) NOT NULL REFERENCES currencies(code),
  config          JSONB NOT NULL DEFAULT '{}',  -- Encrypted provider credentials
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider, country_code)
);

-- ─────────────────────────────────────────────
-- TENANT API KEYS
-- For white-label partners integrating via API
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  key_hash        VARCHAR(255) NOT NULL,   -- bcrypt hash of the actual key
  key_prefix      VARCHAR(20) NOT NULL,    -- First 8 chars for identification: "ejua_pk_"
  name            VARCHAR(100) NOT NULL,   -- "Production API Key", "Test Key"
  scopes          JSONB NOT NULL DEFAULT '["read", "write"]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_api_keys_prefix ON tenant_api_keys (key_prefix) WHERE is_active = true;

-- ─────────────────────────────────────────────
-- SEED: Default tenant payment provider (Paystack GH)
-- ─────────────────────────────────────────────

INSERT INTO tenant_payment_providers (tenant_id, provider, country_code, currency_code, config, is_primary) VALUES
  ('00000000-0000-0000-0000-000000000001', 'paystack', 'GH', 'GHS', '{"label": "Paystack Ghana"}', true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- UPDATE TRIGGERS
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_payment_providers_updated
  BEFORE UPDATE ON tenant_payment_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
