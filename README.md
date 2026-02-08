# Ejua Ejua — Composable Commerce Platform

A next-generation e-commerce ecosystem designed for the African market, built as composable microservices. Ejua closes the **Access Gap** — the distance between high consumer demand and low immediate liquidity — through integrated BNPL, automated marketing, and one-click social advertising.

---

## Development Roadmap

This roadmap tracks every deliverable across all four phases. Each item is marked with its current status.

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete |
| 🔲 | Not started |

---

### Phase 1: Marketplace & Installment Engine

The commercial heart of Ejua. Handles product listing through to final payment settlement, with BNPL woven into the checkout experience.

#### 1.1 — Foundation & Infrastructure

| # | Deliverable | Status |
|---|-------------|--------|
| 1.1.1 | Monorepo structure (npm workspaces, shared package) | ✅ |
| 1.1.2 | Shared types: enums, currency helpers, error classes, money validators | ✅ |
| 1.1.3 | Standard API response envelope (success, error, paginated) | ✅ |
| 1.1.4 | Fastify server boilerplate with Swagger docs | ✅ |
| 1.1.5 | JWT authentication middleware (register, login, role-based access) | ✅ |
| 1.1.6 | Tenant context middleware (multi-tenancy ready) | ✅ |
| 1.1.7 | Global error handler (AppError hierarchy → HTTP responses) | ✅ |
| 1.1.8 | Pino structured logging | ✅ |
| 1.1.9 | Database connection manager (Knex + PostgreSQL) | ✅ |
| 1.1.10 | Migration runner (raw SQL, up/down) | ✅ |
| 1.1.11 | Environment configuration (.env.example, config loader) | ✅ |
| 1.1.12 | Health check endpoint | ✅ |

#### 1.2 — Database Schema

| # | Deliverable | Status |
|---|-------------|--------|
| 1.2.1 | Tenants table + default tenant seed | ✅ |
| 1.2.2 | Currencies table + GHS/NGN/XOF/USD seed data | ✅ |
| 1.2.3 | Users table (customers, vendors, admins) with phone-based auth | ✅ |
| 1.2.4 | Vendors table with KYC placeholder and configurable commission | ✅ |
| 1.2.5 | Categories table (hierarchical, self-referencing) | ✅ |
| 1.2.6 | Products table (BIGINT pricing, multi-currency, JSONB images) | ✅ |
| 1.2.7 | Product variants table (size, colour, price overrides) | ✅ |
| 1.2.8 | Orders table (full lifecycle status enum) | ✅ |
| 1.2.9 | Order items table (price snapshot at order time) | ✅ |
| 1.2.10 | Wallets table (available + escrow balances, non-negative constraints) | ✅ |
| 1.2.11 | Transactions table (typed, referenced to orders/installments) | ✅ |
| 1.2.12 | Ledger entries table (immutable, append-only, idempotency key) | ✅ |
| 1.2.13 | Immutability trigger (blocks UPDATE/DELETE on ledger_entries) | ✅ |
| 1.2.14 | Payment splits table (vendor/commission/gateway breakdown) | ✅ |
| 1.2.15 | Installment plans table (Motito + internal provider support) | ✅ |
| 1.2.16 | Installments table (per-payment tracking, retry scheduling) | ✅ |
| 1.2.17 | Late fee rules table (configurable per tenant per currency) | ✅ |
| 1.2.18 | Webhook events log table (audit trail for all inbound webhooks) | ✅ |
| 1.2.19 | Auto-update triggers for updated_at columns | ✅ |
| 1.2.20 | All indexes (composite, partial, unique constraints) | ✅ |
| 1.2.21 | Platform system wallets seed (commission + gateway fee wallets) | ✅ |

#### 1.3 — Wallet & Ledger Engine

| # | Deliverable | Status |
|---|-------------|--------|
| 1.3.1 | Wallet CRUD (create, get, get-or-create) | ✅ |
| 1.3.2 | Double-entry ledger write (atomic debit + credit pairs) | ✅ |
| 1.3.3 | Idempotency protection on ledger writes | ✅ |
| 1.3.4 | Payment split engine (vendor escrow / commission / gateway fee) | ✅ |
| 1.3.5 | Escrow release service (time-based, for return window) | ✅ |
| 1.3.6 | Wallet balance + transaction history queries | ✅ |
| 1.3.7 | Wallet API routes (balance, history, vendor wallets) | ✅ |
| 1.3.8 | Unit tests: money validators, split calculations, currency formatting | ✅ |

#### 1.4 — Installment & BNPL Engine

| # | Deliverable | Status |
|---|-------------|--------|
| 1.4.1 | Installment plan creation (down payment + N monthly records) | ✅ |
| 1.4.2 | Motito BNPL approval handler (activate plan, mark down payment paid) | ✅ |
| 1.4.3 | Payment recording against individual installments | ✅ |
| 1.4.4 | Plan completion detection (auto-close when all paid) | ✅ |
| 1.4.5 | Late fee calculation engine (percentage or flat, with cap) | ✅ |
| 1.4.6 | Retry scheduler with exponential backoff | ✅ |
| 1.4.7 | Installment API routes (plans, schedule, admin overdue trigger) | ✅ |

#### 1.5 — Webhooks & External Integrations

| # | Deliverable | Status |
|---|-------------|--------|
| 1.5.1 | Motito webhook receiver (signature verification, event logging) | ✅ |
| 1.5.2 | `bnpl.approved` handler (order confirmation + payment split) | ✅ |
| 1.5.3 | `bnpl.declined` handler (order + plan cancellation) | ✅ |
| 1.5.4 | `bnpl.payment_received` handler (installment recording) | ✅ |

#### 1.6 — Vendor Management

| # | Deliverable | Status |
|---|-------------|--------|
| 1.6.1 | Vendor registration (with automatic wallet + escrow creation) | ✅ |
| 1.6.2 | Vendor profile CRUD (store name, logo, description, address) | ✅ |
| 1.6.3 | Vendor slug generation (URL-safe, unique per tenant) | ✅ |
| 1.6.4 | Vendor KYC status management (pending → verified → suspended) | ✅ |
| 1.6.5 | Vendor commission override (per-vendor rates) | ✅ |
| 1.6.6 | Vendor dashboard data: sales, wallet balance, pending orders | ✅ |

#### 1.7 — Product Catalog

| # | Deliverable | Status |
|---|-------------|--------|
| 1.7.1 | Product CRUD (create, read, update, soft-delete) | ✅ |
| 1.7.2 | Product variant management (size/colour combos, stock per variant) | ✅ |
| 1.7.3 | Category CRUD (hierarchical tree, slug-based routing) | ✅ |
| 1.7.4 | Image upload to R2 with CDN URL generation | ✅ |
| 1.7.5 | Product listing with filters (category, price range, vendor, search) | ✅ |
| 1.7.6 | Inventory management (stock decrement on order, low-stock alerts) | ✅ |
| 1.7.7 | Featured products and sorting | ✅ |
| 1.7.8 | Installment plan preview (show "from GH₵X/month" on product cards) | ✅ |

#### 1.8 — Order Lifecycle

| # | Deliverable | Status |
|---|-------------|--------|
| 1.8.1 | Cart management (add/remove/update items, cart totals) | ✅ |
| 1.8.2 | Order creation from cart (stock validation, price snapshot) | ✅ |
| 1.8.3 | Order number generation (human-readable, tenant-scoped) | ✅ |
| 1.8.4 | Checkout: Direct MoMo payment flow (request-to-pay → callback) | ✅ |
| 1.8.5 | Checkout: Motito BNPL flow (redirect → webhook → confirmation) | ✅ |
| 1.8.6 | Order status transitions (state machine with validation) | ✅ |
| 1.8.7 | Shipping status updates (vendor-triggered) | ✅ |
| 1.8.8 | Delivery confirmation + return window start | ✅ |
| 1.8.9 | Escrow auto-release cron job (after return window closes) | ✅ |
| 1.8.10 | Order history for customers and vendors | ✅ |
| 1.8.11 | Refund processing (full and partial, with ledger reversals) | ✅ |

#### 1.9 — MoMo Payment Integration

| # | Deliverable | Status |
|---|-------------|--------|
| 1.9.1 | MTN MoMo API client (request-to-pay, check status) | ✅ |
| 1.9.2 | MoMo webhook/callback handler | ✅ |
| 1.9.3 | Payment provider adapter interface (swap MTN/Vodafone/AirtelTigo) | ✅ |
| 1.9.4 | Auto-deduction for installment retries via MoMo | ✅ |
| 1.9.5 | Vendor payout (disbursement from available wallet to MoMo) | ✅ |

---

### Phase 2: Creative Engine (Flyer SaaS)

Transforms raw product data into professional marketing collateral in under 10 seconds.

| # | Deliverable | Status |
|---|-------------|--------|
| 2.1 | Fastify service boilerplate (separate from marketplace) | ✅ |
| 2.2 | Flyer generation API endpoint (accepts product JSON) | ✅ |
| 2.3 | Background removal integration (remove.bg or rembg) | ✅ |
| 2.4 | Template engine (branded overlays, dynamic text placement) | ✅ |
| 2.5 | Template library (10+ starter templates, square + story formats) | ✅ |
| 2.6 | QR code generation (links to product checkout page) | ✅ |
| 2.7 | Installment price overlay ("From GH₵X/month") | ✅ |
| 2.8 | Output delivery (S3 upload, CDN URL return) | ✅ |
| 2.9 | Template CRUD API (upload, list, preview) | ✅ |
| 2.10 | Batch flyer generation (multiple products at once) | ✅ |

---

### Phase 3: Ejua Amplify (Social & Ad Engine)

Turns every vendor into a digital marketer without requiring marketing knowledge.

| # | Deliverable | Status |
|---|-------------|--------|
| 3.1 | Fastify service boilerplate | ✅ |
| 3.2 | Meta OAuth flow (Facebook + Instagram page connection) | ✅ |
| 3.3 | WhatsApp Business API integration | ✅ |
| 3.4 | Post to Facebook Page endpoint | ✅ |
| 3.5 | Post to Instagram Business endpoint | ✅ |
| 3.6 | Scheduled posting (publish_at with timezone support) | ✅ |
| 3.7 | Meta Marketing API integration (ad campaign creation) | ✅ |
| 3.8 | Ad boost endpoint (budget, targeting, creative from flyer) | ✅ |
| 3.9 | Ad performance tracking (impressions, clicks, CPC) | ✅ |
| 3.10 | Conversion tracking (ad click → order in Pillar 1) | ✅ |

---

### Phase 4: Global Scalability & Multi-Tenancy

| # | Deliverable | Status |
|---|-------------|--------|
| 4.1 | Multi-currency transaction support (cross-currency orders) | ✅ |
| 4.2 | Exchange rate service (daily fetch + cache) | ✅ |
| 4.3 | Tenant management API (create, configure, billing) | ✅ |
| 4.4 | Tenant-level feature flags and configuration | ✅ |
| 4.5 | White-label branding (custom domain, logo, colours per tenant) | ✅ |
| 4.6 | Per-tenant commission and fee structures | ✅ |
| 4.7 | API Gateway (rate limiting, routing, API key management) | ✅ |
| 4.8 | Nigeria launch: Paystack integration (NGN payments) | ✅ |
| 4.9 | Francophone launch: Wave integration (XOF payments) | ✅ |
| 4.10 | Consolidated reporting (cross-tenant, USD-equivalent) | ✅ |

---

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 1 — Marketplace Engine | 63 | 63 | 0 |
| 2 — Creative Engine | 10 | 10 | 0 |
| 3 — Amplify Engine | 10 | 10 | 0 |
| 4 — Scalability | 10 | 10 | 0 |
| **Total** | **93** | **93** | **0** |

---

## Architecture

```
ejua-platform/
├── gateway/                    # API Gateway (Kong/Express proxy)
├── packages/
│   ├── shared/                 # Shared types, contracts, error classes
│   ├── marketplace-engine/     # Pillar 1: Marketplace, Wallet, BNPL
│   ├── creative-engine/        # Pillar 2: Flyer Generation SaaS
│   └── amplify-engine/         # Pillar 3: Social Posting & Ad Management
├── scripts/                    # Deployment & utility scripts
└── docs/                       # API documentation
```

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL 15+
- Redis 7+

### 1. Clone and install

```bash
git clone <repo-url> && cd ejua-platform
cp .env.example .env
# Edit .env with your database credentials
npm install
```

### 2. Create the database

```bash
createdb ejua_marketplace
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Start the Marketplace Engine

```bash
npm run dev:marketplace
```

The API will be available at `http://localhost:3001` with Swagger docs at `http://localhost:3001/api/v1/docs`.

### 5. Run tests

```bash
npm run test:marketplace
```

## Key Design Decisions

- **Double-entry ledger**: Every money movement creates debit + credit entries that must net to zero
- **Integer arithmetic**: All amounts stored as BIGINT in smallest currency unit (pesewas, kobo, centimes) — no floating-point errors
- **Immutable ledger**: PostgreSQL trigger prevents UPDATE/DELETE on ledger_entries; corrections via reversing entries only
- **Escrow with time release**: Vendor funds held until configurable return window closes, then auto-released by cron
- **Motito BNPL adapter**: Abstracted behind a provider interface for easy swap to alternative BNPL providers
- **Multi-tenant from day one**: tenant_id on every table with a default tenant for single-tenant launch
- **Idempotent webhook processing**: Every inbound webhook is logged and deduplicated before processing
- **Composable pillars**: Each service is independently deployable, scalable, and licensable as SaaS

## Environment Variables

See `.env.example` for the complete list. Key ones:

| Variable | Description |
|----------|-------------|
| `DB_*` | PostgreSQL connection |
| `MOTITO_*` | Motito BNPL API credentials |
| `MOMO_*` | MTN MoMo API credentials |
| `JWT_SECRET` | JWT signing secret (change in production!) |
| `DEFAULT_COMMISSION_BPS` | Platform commission in basis points (1000 = 10%) |
| `DEFAULT_ESCROW_DAYS` | Days to hold vendor funds in escrow |
| `DEFAULT_GRACE_PERIOD_DAYS` | Days after due date before late fees apply |
| `DEFAULT_LATE_FEE_BPS` | Weekly late fee rate in basis points (200 = 2%) |
| `DEFAULT_LATE_FEE_CAP_BPS` | Max late fee as % of original amount (1500 = 15%) |
