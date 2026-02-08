-- Rollback 002_multi_tenancy_and_scale

DROP TRIGGER IF EXISTS trg_tenant_payment_providers_updated ON tenant_payment_providers;
DROP TABLE IF EXISTS tenant_api_keys;
DROP TABLE IF EXISTS tenant_payment_providers;
DROP TABLE IF EXISTS exchange_rate_history;
