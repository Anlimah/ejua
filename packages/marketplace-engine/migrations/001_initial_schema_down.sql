-- ============================================================
-- ROLLBACK: 001_initial_schema.sql
-- ============================================================

DROP TRIGGER IF EXISTS trg_late_fee_rules_updated_at ON late_fee_rules;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
DROP TRIGGER IF EXISTS trg_installments_updated_at ON installments;
DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_ledger_no_update ON ledger_entries;

DROP FUNCTION IF EXISTS update_updated_at();
DROP FUNCTION IF EXISTS prevent_ledger_mutation();

DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS late_fee_rules CASCADE;
DROP TABLE IF EXISTS installments CASCADE;
DROP TABLE IF EXISTS installment_plans CASCADE;
DROP TABLE IF EXISTS payment_splits CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS ledger_entries CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS currencies CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP TYPE IF EXISTS flyer_format;
DROP TYPE IF EXISTS late_fee_type;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS split_status;
DROP TYPE IF EXISTS ledger_entry_type;
DROP TYPE IF EXISTS bnpl_provider;
DROP TYPE IF EXISTS split_type;
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS installment_status;
DROP TYPE IF EXISTS installment_plan_status;
DROP TYPE IF EXISTS order_status;
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS transaction_type;
DROP TYPE IF EXISTS wallet_owner_type;
