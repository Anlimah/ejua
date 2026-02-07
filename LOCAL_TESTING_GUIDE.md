# Ejua Platform — Comprehensive Local Testing Guide

A critical, detailed guide for testing the Ejua composable commerce platform
locally. This covers system analysis, environment setup, automated tests,
manual API testing, integration testing, and known gaps.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Critical Analysis](#2-critical-analysis)
3. [Prerequisites & Environment Setup](#3-prerequisites--environment-setup)
4. [Database Setup & Migrations](#4-database-setup--migrations)
5. [Running Automated Tests](#5-running-automated-tests)
6. [Starting Services Locally](#6-starting-services-locally)
7. [Manual API Testing (curl)](#7-manual-api-testing-curl)
8. [Service-by-Service Testing](#8-service-by-service-testing)
9. [Integration & End-to-End Testing](#9-integration--end-to-end-testing)
10. [Testing External Integrations](#10-testing-external-integrations)
11. [Database Inspection & Debugging](#11-database-inspection--debugging)
12. [Known Gaps & Recommendations](#12-known-gaps--recommendations)

---

## 1. System Architecture Overview

Ejua is a **monorepo** (npm workspaces) with 4 backend services and 1 frontend:

```
ejua/
├── packages/
│   ├── shared/                # Shared types, validators, R2 storage
│   ├── marketplace-engine/    # Core commerce: orders, wallets, BNPL (port 3001)
│   ├── creative-engine/       # Flyer generation SaaS (port 3002)
│   └── amplify-engine/        # Social posting & ad management (port 3003)
├── apps/
│   └── storefront/            # Next.js 14 frontend (port 3010)
└── gateway/                   # API gateway (port 3000, workspace listed but not built)
```

### Key Technology Decisions

| Component        | Choice                   | Notes                                         |
|------------------|--------------------------|-----------------------------------------------|
| Runtime          | Node.js 20+              | Required — uses modern JS features            |
| Backend          | Fastify 4.26             | Chosen for speed over Express                 |
| Database         | PostgreSQL 15+           | uuid-ossp + pgcrypto extensions required      |
| ORM              | Knex.js 3.1              | Raw SQL migrations, query builder for app code|
| Cache            | Redis 7+                 | Used by amplify-engine; optional for marketplace |
| Auth             | JWT + bcryptjs           | Stateless auth, no refresh token rotation     |
| File Storage     | Cloudflare R2 (S3 API)   | Images, flyers, assets                        |
| Image Processing | Sharp + node-canvas      | Server-side flyer rendering                   |
| Frontend         | Next.js 14 + Tailwind    | TypeScript, Zustand for state                 |
| Testing          | Jest 29.7                | Unit tests only — no integration test DB      |

### Service Dependencies

```
┌─────────────┐     ┌───────────────┐     ┌────────────────┐
│  Storefront │────>│  Marketplace  │────>│  PostgreSQL    │
│  (Next.js)  │     │  Engine :3001 │     │  :5432         │
└─────────────┘     └───────┬───────┘     └────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
              ┌─────▼─────┐  ┌─────▼─────┐
              │ Creative   │  │ Amplify   │
              │ Engine     │  │ Engine    │──> Redis :6379
              │ :3002      │  │ :3003     │
              └────────────┘  └───────────┘
```

**Critical path:** Only marketplace-engine requires PostgreSQL. Creative-engine
is stateless (filesystem only). Amplify-engine uses Redis for caching but can
start without it (with degraded functionality).

---

## 2. Critical Analysis

### What Works Well

- **Double-entry ledger** for wallets: Every debit has a matching credit.
  Integer arithmetic (pesewas, not cedis) avoids floating-point errors.
- **State machine** for orders: Explicit transitions prevent invalid state
  changes (e.g., you cannot go from `created` to `shipped` without
  `confirmed` and `processing` in between).
- **Multi-tenancy** at the data layer: tenant_id isolation with configurable
  commission rates per tenant.
- **Shared package** for cross-service consistency: Money validators, enums,
  and response envelope shared across all services.

### What Needs Attention

1. **Tests are purely unit-level.** All 63+ tests mock or compute in-memory.
   There are zero tests that hit the actual database, make HTTP requests to
   running services, or test cross-service communication. This means:
   - Schema drift could go undetected
   - Route handler bugs (auth, validation, DB queries) are untested
   - Race conditions in concurrent wallet operations are untested

2. **No test database configuration.** There is no `DB_NAME_TEST` or test
   environment override. Running integration tests would require manual
   setup of a separate database.

3. **No Docker/docker-compose.** Every developer must install PostgreSQL and
   Redis natively. This creates "works on my machine" problems.

4. **No CI/CD pipeline.** Tests do not run automatically on push or PR.
   Regressions can reach the main branch undetected.

5. **Secrets in LOCAL_SETUP.md.** The existing setup guide includes actual
   Paystack test keys and R2 credentials inline. These should be kept in
   .env only, not in version-controlled documentation.

6. **Redis is listed as a dependency but not universally used.** The
   marketplace-engine imports ioredis but Redis connection failures may not
   be handled gracefully if Redis is not running.

7. **Gateway workspace is declared but empty/absent.** The root package.json
   lists `gateway` as a workspace, but the gateway service is not
   implemented. Running `npm install` may warn about this.

8. **The `canvas` npm package** requires native system dependencies
   (libcairo, libpango, libjpeg, libgif, librsvg). This will fail on a
   fresh machine without these libraries installed.

---

## 3. Prerequisites & Environment Setup

### Required Software

```bash
# 1. Node.js 20+ (LTS recommended)
node -v    # must show v20.x or higher
npm -v     # must show 10.x or higher

# 2. PostgreSQL 15+
psql --version   # must show 15.x or higher

# 3. Redis 7+ (needed for amplify-engine)
redis-cli --version   # must show 7.x or higher
```

### Platform-Specific Installation

**macOS:**
```bash
# Node.js (via nvm — recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20

# PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Redis
brew install redis
brew services start redis

# Canvas native dependencies (required for creative-engine)
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

**Ubuntu/Debian:**
```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20

# PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Redis
sudo apt install redis-server
sudo systemctl start redis-server

# Canvas native dependencies (required for creative-engine)
sudo apt install build-essential libcairo2-dev libpango1.0-dev \
  libjpeg-dev libgif-dev librsvg2-dev
```

**Windows (WSL2 recommended):**
```bash
# Install WSL2 first, then follow Ubuntu instructions above.
# Native Windows: Download PostgreSQL from postgresql.org/download/windows
# Native Windows: Download Redis from github.com/microsoftarchive/redis/releases
# Native Windows: canvas package may require additional configuration
```

### Install Project Dependencies

```bash
cd ejua

# Install all workspace dependencies (this may take a few minutes)
npm install

# If you see warnings about the "gateway" workspace — ignore them.
# The gateway workspace is declared but not implemented.
```

**Possible failure:** If `npm install` fails on the `canvas` package, you are
missing native graphics libraries. See the platform-specific instructions above.

### Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your local values. The minimum required for testing:

```env
NODE_ENV=development
PORT=3001

# Database — use values matching what you create in Step 4
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ejua_marketplace
DB_USER=ejua_admin
DB_PASSWORD=ejua_dev_2026
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_SSL=false

# JWT — any random string works for local dev
JWT_SECRET=local-dev-secret-key-change-in-prod-at-least-64-chars-long-1234
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Redis (needed for amplify-engine)
REDIS_URL=redis://localhost:6379

# Platform defaults
PLATFORM_NAME=Ejua
PLATFORM_URL=http://localhost:3010
DEFAULT_CURRENCY=GHS
DEFAULT_COMMISSION_BPS=1000
DEFAULT_ESCROW_DAYS=14
DEFAULT_GRACE_PERIOD_DAYS=3
DEFAULT_LATE_FEE_BPS=200
DEFAULT_LATE_FEE_CAP_BPS=1500
```

For external integrations (Paystack, MoMo, R2, Meta), use your own sandbox/test
keys. These are **not** required to run the automated test suite or test core
functionality locally.

---

## 4. Database Setup & Migrations

### Create the Database

```bash
# Connect as the postgres superuser
sudo -u postgres psql
# (on macOS with Homebrew, just: psql postgres)

# Run these SQL commands:
CREATE USER ejua_admin WITH PASSWORD 'ejua_dev_2026';
CREATE DATABASE ejua_marketplace OWNER ejua_admin;
GRANT ALL PRIVILEGES ON DATABASE ejua_marketplace TO ejua_admin;

# Connect to the new database and enable extensions
\c ejua_marketplace
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
\q
```

### Run Migrations

```bash
npm run migrate
```

**Expected output:**
```
Database connection established
Running migration: 001_initial_schema.sql
  ✓ 001_initial_schema.sql applied
Running migration: 002_multi_tenancy_and_scale.sql
  ✓ 002_multi_tenancy_and_scale.sql applied
All 2 migration(s) applied.
```

**If migration fails:**
- Check that PostgreSQL is running: `pg_isready`
- Verify credentials: `psql -U ejua_admin -d ejua_marketplace -c "SELECT 1"`
- Check `.env` DB_HOST/DB_PORT/DB_USER/DB_PASSWORD match

### Seed Test Data

```bash
npm run seed
```

This creates:
- 4 users (admin, 2 vendors, 1 customer) — password: `password123`
- 2 vendor stores (TechZone GH, Style Ghana)
- 5 product categories
- 8 products with pricing
- 6 wallets (platform, gateway, escrow, 2 vendor, 1 customer)

### Reset Everything (Nuclear Option)

```bash
# Drop and recreate database
psql -U postgres -c "DROP DATABASE IF EXISTS ejua_marketplace;"
psql -U postgres -c "CREATE DATABASE ejua_marketplace OWNER ejua_admin;"
psql -U postgres -d ejua_marketplace -c \
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
npm run migrate
npm run seed
```

---

## 5. Running Automated Tests

### Run All Tests

```bash
npm run test
```

This runs Jest across all workspaces that have a `test` script defined.

### Run Tests by Service

```bash
# Marketplace engine tests only (wallet, orders, vendor-product, phase4)
npm run test:marketplace

# Run a specific test file
npx jest packages/marketplace-engine/tests/wallet.test.js --runInBand --forceExit

# Run tests in watch mode (re-runs on file changes)
npx jest packages/marketplace-engine/tests/ --watch --runInBand
```

### Understanding What the Tests Cover

| Test File              | # Tests | What It Validates                                           |
|------------------------|---------|-------------------------------------------------------------|
| `wallet.test.js`       | ~15     | Money validation, currency conversion, payment splits       |
| `orders.test.js`       | ~15     | State machine transitions, order number format, Paystack mapping |
| `vendor-product.test.js`| ~18    | Slug generation, installment previews, KYC state transitions |
| `phase4.test.js`       | ~16     | Exchange rates, tenant config, multi-currency, API key format|
| `creative.test.js`     | ~10     | Template registry, SVG generation, installment badge rendering|
| `amplify.test.js`      | ~18     | OAuth URLs, scheduling, ad targeting, budget calcs, captions |
| `storage.test.js`      | ~12     | R2 key structure, filename sanitization, MIME types          |

### What the Tests Do NOT Cover

This is critical to understand for local testing:

- **No HTTP request tests.** No test starts a Fastify server and sends
  requests to it. Route handlers, middleware, auth checks, and request
  validation are all untested by automation.
- **No database tests.** No test connects to PostgreSQL. SQL queries, Knex
  migrations, foreign key constraints, and transaction behavior are untested.
- **No cross-service tests.** No test verifies that marketplace-engine can
  call creative-engine to generate a flyer, or that webhook payloads from
  Paystack are correctly parsed.
- **No frontend tests.** The storefront (Next.js app) has no test suite at all.
- **No load/performance tests.** No tooling for concurrent request testing.

This means **manual testing is essential** to validate the system works
end-to-end. The sections below guide you through that.

---

## 6. Starting Services Locally

### Start Services (3-4 terminal windows)

**Terminal 1 — Marketplace Engine (required):**
```bash
npm run dev:marketplace
# Expected: "Marketplace Engine running on port 3001"
```

**Terminal 2 — Creative Engine (optional, for flyer testing):**
```bash
npm run dev:creative
# Expected: "Creative Engine running on port 3002"
```

**Terminal 3 — Amplify Engine (optional, for social posting testing):**
```bash
npm run dev:amplify
# Expected: "Amplify Engine running on port 3003"
# Note: Requires Redis. Will fail or degrade without it.
```

**Terminal 4 — Storefront (optional, for UI testing):**
```bash
npm run dev:storefront
# Expected: Next.js dev server on http://localhost:3010
```

### Verify Services Are Running

```bash
# Health check — marketplace
curl -s http://localhost:3001/api/v1/health | python3 -m json.tool

# Health check — creative
curl -s http://localhost:3002/health | python3 -m json.tool

# Health check — amplify
curl -s http://localhost:3003/health | python3 -m json.tool
```

### Swagger API Documentation

Open http://localhost:3001/docs in your browser to see the interactive
OpenAPI documentation for the marketplace engine.

---

## 7. Manual API Testing (curl)

This section walks through testing every major flow manually. All commands
assume the marketplace engine is running on port 3001.

### 7.1 Authentication

**Register a new user:**
```bash
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "0551000099",
    "password": "testpass123",
    "first_name": "Test",
    "last_name": "User",
    "email": "test@example.com"
  }' | python3 -m json.tool
```

**Login and capture token:**
```bash
# Login as the seeded customer
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"0551000001","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "Token: $TOKEN"
```

**Login as vendor:**
```bash
VENDOR_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"0241000001","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "Vendor Token: $VENDOR_TOKEN"
```

**Login as admin:**
```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"0201000001","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "Admin Token: $ADMIN_TOKEN"
```

### 7.2 Products & Catalog

**List all products (paginated):**
```bash
curl -s http://localhost:3001/api/v1/products | python3 -m json.tool
```

**Get product by slug:**
```bash
curl -s http://localhost:3001/api/v1/p/samsung-galaxy-a15 | python3 -m json.tool
```

**Get featured products:**
```bash
curl -s http://localhost:3001/api/v1/products/featured | python3 -m json.tool
```

**List categories:**
```bash
curl -s http://localhost:3001/api/v1/categories | python3 -m json.tool
```

**Create a product (as vendor):**
```bash
curl -s -X POST http://localhost:3001/api/v1/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VENDOR_TOKEN" \
  -d '{
    "name": "Test Product",
    "description": "A test product for local testing",
    "price": 9999,
    "currency": "GHS",
    "category_id": "<CATEGORY_UUID>",
    "stock_quantity": 50
  }' | python3 -m json.tool
```
(Replace `<CATEGORY_UUID>` with an actual category ID from the categories
endpoint.)

### 7.3 Order Lifecycle

**Step 1 — Get a product ID:**
```bash
PRODUCT_ID=$(curl -s http://localhost:3001/api/v1/products | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data'][0]['id'])")
echo "Product ID: $PRODUCT_ID"
```

**Step 2 — Create an order (as customer):**
```bash
curl -s -X POST http://localhost:3001/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"items\": [{\"product_id\": \"$PRODUCT_ID\", \"quantity\": 1}],
    \"shipping_address\": {
      \"name\": \"Kofi Owusu\",
      \"phone\": \"0551000001\",
      \"address\": \"12 Independence Ave\",
      \"city\": \"Accra\",
      \"region\": \"Greater Accra\"
    }
  }" | python3 -m json.tool
```

**Step 3 — Initiate Paystack checkout:**
```bash
ORDER_ID="<paste-order-id-from-step-2>"

curl -s -X POST "http://localhost:3001/api/v1/orders/$ORDER_ID/checkout/paystack" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"kofi@gmail.com","channels":["mobile_money","card"]}' | \
  python3 -m json.tool
```
(This returns an `authorization_url` — open it in a browser to use the Paystack
test payment page. Requires valid Paystack test keys in `.env`.)

**Step 4 — Check customer orders:**
```bash
curl -s http://localhost:3001/api/v1/my/orders \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Step 5 — Check vendor orders:**
```bash
VENDOR_ID="<vendor-uuid>"
curl -s "http://localhost:3001/api/v1/vendors/$VENDOR_ID/orders" \
  -H "Authorization: Bearer $VENDOR_TOKEN" | python3 -m json.tool
```

### 7.4 Wallet Operations

**Check wallet balance:**
```bash
curl -s http://localhost:3001/api/v1/wallet/balance \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**View transaction history:**
```bash
curl -s http://localhost:3001/api/v1/wallet/transactions \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 7.5 Vendor Management

**View store page:**
```bash
curl -s http://localhost:3001/api/v1/stores/techzone-gh | python3 -m json.tool
```

**Register as vendor (customer becomes vendor):**
```bash
curl -s -X POST http://localhost:3001/api/v1/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "store_name": "Test Store",
    "store_description": "A test vendor store",
    "phone": "0551000001",
    "city": "Accra",
    "region": "Greater Accra"
  }' | python3 -m json.tool
```

---

## 8. Service-by-Service Testing

### 8.1 Marketplace Engine (Port 3001)

This is the core service. Test these areas in order:

**Authentication flow:**
1. Register a new user -> verify JWT returned
2. Login with the new user -> verify token works
3. Access a protected endpoint without token -> verify 401
4. Access a protected endpoint with invalid token -> verify 401

**Product CRUD (as vendor):**
1. List products -> verify seeded products appear
2. Create a product -> verify it appears in list
3. Get product by slug -> verify fields
4. Upload product image (multipart) -> verify image URL returned

**Order state machine:**
1. Create order (as customer) -> verify status is `created`
2. Attempt invalid transition -> verify rejection
3. Checkout with Paystack -> verify `authorization_url` returned
4. Check order appears in customer's order list
5. Check order appears in vendor's order list

**Wallet integrity:**
1. Check platform wallet balance
2. Check vendor wallet balance
3. After a completed payment, verify ledger entries exist (debit + credit)

### 8.2 Creative Engine (Port 3002)

**Template listing:**
```bash
curl -s http://localhost:3002/api/v1/templates | python3 -m json.tool
```

**Flyer generation:**
```bash
curl -s -X POST http://localhost:3002/api/v1/flyers/generate \
  -H "Content-Type: application/json" \
  -d '{
    "product_name": "Samsung Galaxy A15",
    "price": 259900,
    "currency": "GHS",
    "template": "tech",
    "store_name": "TechZone GH"
  }' | python3 -m json.tool
```

**What to verify:**
- Response contains a URL/path to the generated image
- Image file actually exists on disk (check `packages/creative-engine/output/`)
- Different templates produce different visual styles

### 8.3 Amplify Engine (Port 3003)

**Health check:**
```bash
curl -s http://localhost:3003/health | python3 -m json.tool
```

**Meta OAuth URL (requires META_APP_ID in .env):**
```bash
curl -s "http://localhost:3003/api/v1/auth/meta/connect?vendor_id=test-vendor" | \
  python3 -m json.tool
```

**What to verify:**
- OAuth URL contains correct scopes (pages_manage_posts, ads_management)
- Scheduled posting validates future dates
- Caption length limits enforced (Facebook: 5000, Instagram: 2200)

### 8.4 Storefront (Port 3010)

```bash
npm run dev:storefront
# Open http://localhost:3010 in browser
```

**What to verify:**
- Home page loads and displays products from marketplace-engine API
- Product detail pages render correctly
- Cart functionality works (Zustand state)
- Login/register forms submit correctly
- Responsive design on mobile viewport

---

## 9. Integration & End-to-End Testing

Since there are no automated integration tests, here are manual end-to-end
flows to test. Each flow crosses multiple components.

### Flow 1: Customer Purchase (Happy Path)

```
Register → Login → Browse Products → Add to Cart → Create Order →
Paystack Checkout → Payment Callback → Order Confirmed →
Vendor Sees Order → Ships → Delivered → Return Window → Settled →
Verify Wallet Ledger Entries
```

### Flow 2: BNPL Purchase

```
Login → Create Order with BNPL → Motito BNPL Approval →
Verify Installment Plan Created → First Payment →
Check Installment Status → Subsequent Payments → Plan Completed
```

### Flow 3: Vendor Onboarding

```
Register as Customer → Apply as Vendor → KYC Submission →
Admin Approves KYC → Create First Product → Upload Product Image →
Product Appears in Catalog → First Order Received →
Commission Split Verified in Ledger
```

### Flow 4: Flyer Generation Pipeline

```
Login as Vendor → Select Product → Call Creative Engine →
Generate Flyer with Template → Download Flyer →
Post to Facebook via Amplify Engine → Verify Post Created
```

### Flow 5: Multi-Tenant Operations

```
Create New Tenant (admin) → Configure Tenant Commission Rate →
Create User Under Tenant → Create Product Under Tenant →
Place Order → Verify Commission Uses Tenant Rate →
Cross-Tenant Report → Verify USD Conversion
```

---

## 10. Testing External Integrations

### Paystack (Payment Gateway)

1. Get sandbox test keys from https://dashboard.paystack.com (test mode)
2. Add to `.env`: `PAYSTACK_SECRET_KEY=sk_test_...` and `PAYSTACK_PUBLIC_KEY=pk_test_...`
3. Create an order and initiate checkout
4. Use Paystack's test card: `4084 0840 8408 4081` (expiry: any future date, CVV: 408)
5. After payment, Paystack sends a webhook to your callback URL
6. For local webhook testing, use a tunnel (ngrok, localtunnel):
   ```bash
   ngrok http 3001
   # Update PAYSTACK_CALLBACK_URL in .env with your ngrok URL
   ```

### MTN MoMo (Mobile Money)

1. Register at https://momodeveloper.mtn.com
2. Get sandbox credentials
3. Add to `.env`: `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY`
4. Test with sandbox phone numbers provided by MTN

### Motito (BNPL)

1. Requires sandbox credentials from Motito
2. BNPL flow: order creation -> Motito approval -> installment schedule
3. Test with Motito sandbox test scenarios

### Cloudflare R2 (File Storage)

1. Create an R2 bucket in Cloudflare dashboard
2. Generate API tokens with R2 read/write permissions
3. Add credentials to `.env`
4. Test image upload: `POST /api/v1/products/:id/image` with multipart file

### Meta APIs (Facebook/Instagram)

1. Create a Meta Developer app at https://developers.facebook.com
2. Add Facebook Login and Marketing API products
3. Get `META_APP_ID` and `META_APP_SECRET`
4. Test OAuth flow through the amplify engine
5. Use Meta's test pages/accounts for posting

**Note:** All external integrations can be skipped for core local testing.
The unit tests mock all external API calls. Manual testing of these integrations
requires real sandbox credentials.

---

## 11. Database Inspection & Debugging

### Connect to the Database

```bash
psql -U ejua_admin -d ejua_marketplace
```

### Useful Queries

**Check all tables:**
```sql
\dt
```

**View seeded users:**
```sql
SELECT id, phone, email, first_name, role FROM users;
```

**View products with pricing:**
```sql
SELECT p.name, p.price_amount, p.currency, v.store_name
FROM products p
JOIN vendors v ON p.vendor_id = v.id
ORDER BY p.created_at;
```

**Check wallet balances:**
```sql
SELECT w.id, w.owner_type, w.balance, w.currency,
       COALESCE(u.first_name, w.owner_type) AS owner
FROM wallets w
LEFT JOIN users u ON w.owner_id = u.id;
```

**Inspect ledger entries for an order:**
```sql
SELECT le.entry_type, le.amount, le.description, w.owner_type
FROM ledger_entries le
JOIN wallets w ON le.wallet_id = w.id
WHERE le.reference_id = '<order-uuid>'
ORDER BY le.created_at;
```

**Check order state:**
```sql
SELECT order_number, status, total_amount, currency, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

**View installment plans:**
```sql
SELECT ip.status, ip.total_amount, ip.down_payment_amount,
       ip.number_of_installments, ip.provider
FROM installment_plans ip
ORDER BY ip.created_at DESC;
```

**Check migration status:**
```sql
SELECT * FROM _migrations ORDER BY applied_at;
```

### Debugging Tips

- **Structured logs:** All services use Pino logger. In development mode, logs
  are formatted with `pino-pretty` for readability.
- **Request tracing:** Each request gets a unique request ID in Fastify logs.
- **Database pool:** Default pool is 2-10 connections. If you see
  `TimeoutError: Knex: Timeout acquiring a connection`, increase `DB_POOL_MAX`
  or check for connection leaks.

---

## 12. Known Gaps & Recommendations

### Testing Gaps

| Gap                          | Risk Level | Recommendation                         |
|------------------------------|------------|----------------------------------------|
| No integration tests         | High       | Add supertest-based API tests          |
| No database tests            | High       | Add test DB config + migration tests   |
| No frontend tests            | Medium     | Add React Testing Library + Cypress    |
| No cross-service tests       | Medium     | Add contract tests or E2E with all services |
| No load testing              | Low        | Add k6 or Artillery for performance    |
| No test coverage reporting   | Low        | Add `--coverage` flag to Jest config   |

### Infrastructure Gaps

| Gap                          | Recommendation                                |
|------------------------------|-----------------------------------------------|
| No Docker setup              | Add Dockerfile per service + docker-compose.yml|
| No CI/CD                     | Add GitHub Actions: lint, test, build on PR    |
| No health check for Redis    | Amplify engine should gracefully degrade       |
| Gateway workspace incomplete | Remove from workspaces or implement            |

### Security Notes for Local Testing

- The JWT secret in development mode is static — this is fine for local testing
  but must be randomized in production.
- Rate limiting is set to 100 req/min per IP — you may hit this during
  aggressive manual testing. Increase `RATE_LIMIT_MAX_REQUESTS` in `.env` if
  needed.
- CORS is set to `origin: true` (allow all) in development mode.
- Never commit your `.env` file. The `.env.example` should contain placeholder
  values only.

### Quick Reference: Test Accounts

| Role     | Phone       | Password    | Store        |
|----------|-------------|-------------|--------------|
| Admin    | 0201000001  | password123 | —            |
| Vendor 1 | 0241000001  | password123 | TechZone GH  |
| Vendor 2 | 0271000001  | password123 | Style Ghana  |
| Customer | 0551000001  | password123 | —            |

### Quick Reference: Service Ports

| Service            | Port | Health Endpoint                  |
|--------------------|------|----------------------------------|
| Marketplace Engine | 3001 | GET /api/v1/health               |
| Creative Engine    | 3002 | GET /health                      |
| Amplify Engine     | 3003 | GET /health                      |
| Storefront         | 3010 | —                                |
| Swagger Docs       | 3001 | http://localhost:3001/docs        |
