# Ejua Platform — Local Development Setup (No Docker)

This guide gets all backend services running on your local machine.

---

## Prerequisites

Install these if you don't have them:

```bash
# Node.js 20+
node -v   # Should show v20.x or higher

# PostgreSQL 15+
psql --version   # Should show 15.x or higher

# npm (comes with Node)
npm -v
```

**Install PostgreSQL locally:**
- **macOS:** `brew install postgresql@15 && brew services start postgresql@15`
- **Windows:** Download from https://www.postgresql.org/download/windows/
- **Ubuntu/Debian:** `sudo apt install postgresql postgresql-contrib`

---

## Step 1: Clone & Install Dependencies

```bash
# If you extracted from the tar.gz:
cd ejua-platform

# Install all workspace dependencies
npm install
```

---

## Step 2: Create the PostgreSQL Database

```bash
# Connect to PostgreSQL as superuser
# macOS/Linux:
sudo -u postgres psql
# OR if your user has admin rights:
psql -U postgres

# In the psql shell, run:
CREATE USER ejua_admin WITH PASSWORD 'ejua_dev_2026';
CREATE DATABASE ejua_marketplace OWNER ejua_admin;
GRANT ALL PRIVILEGES ON DATABASE ejua_marketplace TO ejua_admin;

# Enable required extensions (connect to the new database)
\c ejua_marketplace
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

# Exit psql
\q
```

---

## Step 3: Create Your .env File

```bash
# From the project root
cp .env.example .env
```

Edit `.env` with your actual values:

```env
# ─── ENVIRONMENT ───
NODE_ENV=development
PORT=3001

# ─── DATABASE ───
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ejua_marketplace
DB_USER=ejua_admin
DB_PASSWORD=ejua_dev_2026
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_SSL=false

# ─── JWT ───
JWT_SECRET=ejua-dev-secret-change-this-in-production-please-2026
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ─── PAYSTACK (your test keys) ───
PAYSTACK_SECRET_KEY=sk_test_768d959cfc46ecf2e3b11d61986065f32ff9a40b
PAYSTACK_PUBLIC_KEY=pk_test_244e970dcc6a4c93780ab9997718996a7c81303f
PAYSTACK_CALLBACK_URL=http://localhost:3001/api/v1/payments/callback
PAYSTACK_WEBHOOK_SECRET=

# ─── CLOUDFLARE R2 STORAGE ───
R2_ENDPOINT=https://30eb54551b0d67c56918195b7a1fc21b.r2.cloudflarestorage.com
R2_BUCKET_NAME=nesisoft-s3-bucket
R2_PREFIX=ejua
R2_ACCESS_KEY_ID=15e4c7b6e15144901598ea43bf88a2f4
R2_SECRET_ACCESS_KEY=8ec32df4ffab6bb5c5898528e2d6e2d5d15218344b705d42daa568fe7e4f45bd
R2_PUBLIC_URL=https://pub-a0a8767766c84b1d804f6206f3d1d5d3.r2.dev

# ─── PLATFORM ───
PLATFORM_NAME=Ejua
PLATFORM_URL=http://localhost:3010
DEFAULT_CURRENCY=GHS
```

---

## Step 4: Run Database Migrations

```bash
# This creates all tables, enums, indexes, and seeds the default tenant + currencies
npm run migrate
```

Expected output:
```
Database connection established
Running migration: 001_initial_schema.sql
  ✓ 001_initial_schema.sql applied
Running migration: 002_multi_tenancy_and_scale.sql
  ✓ 002_multi_tenancy_and_scale.sql applied

All 2 migration(s) applied.
```

**If you need to start fresh:**
```bash
npm run migrate:rollback   # Rolls back one migration at a time
npm run migrate:rollback   # Run again for the second migration
npm run migrate            # Re-run all
```

---

## Step 5: Seed Test Data

```bash
npm run seed
```

Expected output:
```
🌱 Seeding database...

  ✓ User: Platform Admin (admin) — phone: 0201000001
  ✓ User: Kwame Asante (vendor) — phone: 0241000001
  ✓ User: Ama Mensah (vendor) — phone: 0271000001
  ✓ User: Kofi Owusu (customer) — phone: 0551000001
  ✓ Vendor: TechZone GH (techzone-gh)
  ✓ Vendor: Style Ghana (style-ghana)
  ✓ Category: Electronics & Gadgets
  ✓ Category: Fashion & Clothing
  ...
  ✓ Product: Samsung Galaxy A15 — 2599.00 GHS
  ...

✅ Seed complete!

Test accounts (password: password123):
  Admin:    0201000001
  Vendor 1: 0241000001 (TechZone GH)
  Vendor 2: 0271000001 (Style Ghana)
  Customer: 0551000001 (Kofi Owusu)
```

---

## Step 6: Start the Backend Services

Open **three separate terminal windows/tabs:**

### Terminal 1 — Marketplace Engine (Port 3001)
```bash
npm run dev:marketplace
```
You should see:
```
Marketplace Engine running on port 3001
API docs: http://localhost:3001/api/v1/docs
```

### Terminal 2 — Creative Engine (Port 3002)
```bash
npm run dev:creative
```

### Terminal 3 — Amplify Engine (Port 3003)
```bash
npm run dev:amplify
```

---

## Step 7: Verify Everything Works

### Health check
```bash
curl http://localhost:3001/api/v1/health
```
Expected: `{"status":"success","data":{"status":"healthy","database":"connected",...}}`

### Swagger docs
Open in browser: **http://localhost:3001/docs**

### Test login
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"0551000001","password":"password123"}'
```
Expected: Returns JWT token + user info for Kofi (customer).

### List products
```bash
curl http://localhost:3001/api/v1/products
```
Expected: Returns 8 seeded products with pagination.

### Get a single product
```bash
curl http://localhost:3001/api/v1/p/samsung-galaxy-a15
```

### List categories
```bash
curl http://localhost:3001/api/v1/categories
```

---

## Step 8: Test the Full Order Flow

```bash
# 1. Login as customer
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"0551000001","password":"password123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "Token: $TOKEN"

# 2. Get product ID (first product)
PRODUCT_ID=$(curl -s http://localhost:3001/api/v1/products | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data'][0]['id'])")

echo "Product: $PRODUCT_ID"

# 3. Create an order
curl -X POST http://localhost:3001/api/v1/orders \
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
  }"

# The response contains the order ID and order number (EJ-YYMMDD-XXXX format)
```

### Test Paystack checkout (opens payment page)
```bash
ORDER_ID="<paste-order-id-from-above>"

curl -X POST "http://localhost:3001/api/v1/orders/$ORDER_ID/checkout/paystack" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email":"kofi@gmail.com","channels":["mobile_money","card"]}'

# Response contains authorization_url — open it in your browser to test payment
```

---

## Service Ports Summary

| Service             | Port | URL                              |
|---------------------|------|----------------------------------|
| Marketplace Engine  | 3001 | http://localhost:3001             |
| Creative Engine     | 3002 | http://localhost:3002             |
| Amplify Engine      | 3003 | http://localhost:3003             |
| Storefront (Next.js)| 3010 | http://localhost:3010             |
| API Docs (Swagger)  | 3001 | http://localhost:3001/docs        |

---

## Test Accounts

| Role     | Phone        | Password     | Store         |
|----------|-------------|-------------|---------------|
| Admin    | 0201000001  | password123 | —             |
| Vendor 1 | 0241000001  | password123 | TechZone GH   |
| Vendor 2 | 0271000001  | password123 | Style Ghana   |
| Customer | 0551000001  | password123 | —             |

---

## Key API Endpoints

### Auth
- `POST /api/v1/auth/register` — Create account
- `POST /api/v1/auth/login` — Get JWT token

### Products
- `GET /api/v1/products` — List all (paginated)
- `GET /api/v1/products/featured` — Featured products
- `GET /api/v1/p/:slug` — Get by slug
- `POST /api/v1/products` — Create (vendor auth)
- `POST /api/v1/products/:id/image` — Upload image to R2 (multipart)

### Orders
- `POST /api/v1/orders` — Create order
- `POST /api/v1/orders/:id/checkout/paystack` — Get payment URL
- `GET /api/v1/my/orders` — Customer's orders
- `GET /api/v1/vendors/:id/orders` — Vendor's orders

### Vendors
- `GET /api/v1/stores/:slug` — Public store page
- `POST /api/v1/vendors` — Register as vendor

### Creative Engine
- `POST /api/v1/flyers/generate` — Generate product flyer
- `GET /api/v1/templates` — List flyer templates

### Amplify Engine
- `GET /api/v1/auth/meta/connect?vendor_id=X` — Start Meta OAuth
- `POST /api/v1/social/facebook/post` — Post to Facebook Page

---

## Troubleshooting

### "Database connection failed"
- Is PostgreSQL running? `pg_isready`
- Check DB_USER/DB_PASSWORD in `.env`
- Check the database exists: `psql -U ejua_admin -d ejua_marketplace -c "SELECT 1"`

### "relation does not exist"
- Run migrations: `npm run migrate`

### "ECONNREFUSED :3001"
- Is the marketplace engine running? Check terminal 1

### "Module not found"
- Run `npm install` from the project root

### Want to start fresh?
```bash
# Drop and recreate the database
psql -U postgres -c "DROP DATABASE ejua_marketplace;"
psql -U postgres -c "CREATE DATABASE ejua_marketplace OWNER ejua_admin;"
psql -U postgres -d ejua_marketplace -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
npm run migrate
npm run seed
```
