# PayBridge

<p align="center">
  <strong>Enterprise-Grade Multi-Tenant Payment Orchestration Engine</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/BullMQ-FF4500?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Design Patterns](#architecture--design-patterns)
  - [System Architecture](#system-architecture)
  - [Multi-Tenant Merchant & API Key Lifecycle](#multi-tenant-merchant--api-key-lifecycle)
  - [Payment Checkout Flow](#payment-checkout-flow)
  - [Inbound & Outbound Webhook Lifecycle](#inbound--outbound-webhook-lifecycle)
  - [Resilience & Circuit Breaker](#resilience--circuit-breaker)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup & Migrations](#database-setup--migrations)
  - [Running the Application](#running-the-application)
- [API Reference](#api-reference)
  - [Authentication & Access Control](#authentication--access-control)
  - [Merchant Management (Admin API)](#merchant-management-admin-api)
  - [Checkout & Payments](#checkout--payments)
  - [Refunds](#refunds)
  - [Inbound Webhooks](#inbound-webhooks)
  - [Reconciliation](#reconciliation)
  - [Analytics](#analytics)
  - [Health & Metrics](#health--metrics)
- [Merchant Webhook Verification](#merchant-webhook-verification)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

**PayBridge** is a high-availability, multi-tenant payment orchestration engine built with **NestJS**, **TypeScript**, **PostgreSQL**, and **Redis**. It provides a unified API to route, execute, monitor, reconcile, and refund transactions across disparate payment service providers (**Stripe**, **Paymob**, **Fawry**, and more).

Designed as an enterprise core banking & fintech bridge, PayBridge eliminates vendor lock-in, shields downstream systems from gateway downtime via circuit breakers and dynamic fallback routing, enforces strict database-level idempotency to eliminate duplicate charges, provides multi-tenant merchant isolation with cryptographically secure API keys, and guarantees reliable merchant notifications via resilient BullMQ message queues.

---

## Key Features

- **Multi-Tenant Merchant Architecture**:
  - Full data and operational isolation across distinct merchants.
  - Per-merchant outbound webhook endpoints and dedicated HMAC signing secrets.
  - Granular API key management: SHA-256 hashed storage, masked prefix display (`pb_live_...`), instant rotation, deactivation, and background `lastUsedAt` tracking.
  - Administrative control plane protected by master credentials (`AdminGuard`).
- **Multi-Gateway Strategy Pattern**:
  - Unified driver interface for **Stripe** (global credit/debit cards & APMs), **Paymob** (MENA cards & digital wallets), and **Fawry** (Egyptian cash reference codes).
- **Smart Dynamic Routing**:
  - `CURRENCY_OPTIMIZED`: Directs transactions to optimal regional providers based on currency (`EGP`, `SAR`, `AED`, `USD`, `EUR`).
  - `FEE_OPTIMIZED`: Directs micro-transactions and high-volume payments to lowest-cost interchange channels.
  - `LOWEST_LATENCY`: Prioritizes nearest regional endpoints for lower processing latency.
  - **Health-Aware Fallback**: Automatically bypasses degraded or unhealthy gateways in the fallback chain.
- **Circuit Breaker Fault Tolerance (Opossum)**:
  - Isolated circuit breakers per gateway provider monitor error rates, failure thresholds, and timeouts.
  - Fails fast on degraded gateways to prevent thread pool exhaustion and cascading latency.
  - Automatically probes gateway health recovery via `HALF_OPEN` trial requests.
- **Strict Idempotency Layer**:
  - Header-driven (`Idempotency-Key`) interceptor persisted directly in PostgreSQL.
  - Rejects concurrent duplicate in-flight requests (`409 Conflict`).
  - Safely replays stored responses for previously processed idempotency keys (`x-idempotent-replay: true`).
- **Cryptographic Webhook Ingestion & Anti-Replay**:
  - Ingests and verifies provider HMAC signatures against raw, unparsed payload buffers.
  - Transactional event ledger (`WebhookEvent`) with database unique constraints eliminates replay attacks.
- **Reliable Outbound Webhooks (BullMQ + Redis)**:
  - Background asynchronous dispatch of lifecycle events (`payment.succeeded`, `payment.failed`, `refund.processed`).
  - Exponential backoff retry policy (5 attempts: 2s, 4s, 8s, 16s, 32s).
  - Merchant-specific HMAC-SHA256 payload signing (`x-paybridge-signature`, `x-paybridge-timestamp`).
- **Automated Transaction Reconciliation**:
  - Scheduled background worker and on-demand trigger to reconcile abandoned or zombie `PENDING` transactions.
  - Directly queries upstream provider APIs and triggers compensating outbound merchant events for lost inbound webhooks.
- **Full & Partial Refunds Engine**:
  - Tenant-scoped refund processing and audit tracking across integrated providers.
- **Observability & Analytics**:
  - Prometheus-compatible `/metrics` endpoint (memory usage, circuit breaker states, volume by currency, gateway counters).
  - Production `/health` readiness and liveness checks for database, Redis, and providers.
  - Per-merchant analytics overview with conversion, volume, failure rate, and gateway breakdowns.

---

## Architecture & Design Patterns

### System Architecture

```mermaid
graph TD
    Client["Client / Frontend / Merchant App"] -->|HTTPS + API Key| Gateway["PayBridge API Gateway (NestJS)"]
    
    subgraph Security ["Authentication & Protection Layer"]
        AdminGuard["Admin Guard (DEV_MASTER_API_KEY)"]
        ApiKeyGuard["Merchant API Key Guard (SHA-256)"]
        Idemp["Idempotency Interceptor (PostgreSQL)"]
    end

    subgraph Core ["PayBridge Core Engine"]
        Merchants["Merchants & API Key Service"]
        Router["Smart Routing Engine"]
        Breaker["Circuit Breaker Service (Opossum)"]
        Orchestrator["Payment Provider Orchestrator"]
        Reconciliation["Reconciliation Engine"]
        Analytics["Analytics & Metrics Engine"]
    end

    subgraph Adapters ["Provider Adapters (Strategy Pattern)"]
        Stripe["Stripe Adapter"]
        Paymob["Paymob Adapter"]
        Fawry["Fawry Adapter"]
    end

    subgraph Storage ["Infrastructure & Persistence"]
        DB[(PostgreSQL Database\nPrisma ORM)]
        Redis[(Redis Cache & BullMQ)]
    end

    subgraph AsyncWorker ["Background Job Workers"]
        Queue["BullMQ Webhook Queue"]
        Worker["Outbound Webhook Worker"]
        ReconCron["Reconciliation Worker"]
    end

    Gateway --> Security
    Security --> Core
    
    Router --> Breaker
    Breaker --> Orchestrator
    Orchestrator --> Stripe
    Orchestrator --> Paymob
    Orchestrator --> Fawry
    
    Gateway --> DB
    Gateway --> Redis
    Orchestrator --> DB
    
    Stripe -. Inbound Webhook .-> Gateway
    Paymob -. Inbound Webhook .-> Gateway
    Fawry -. Inbound Webhook .-> Gateway

    Gateway --> Queue
    Queue --> Worker
    Worker -->|Signed Webhook Event| Client
    Reconciliation --> DB
```

---

### Multi-Tenant Merchant & API Key Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Admin as System Administrator
    actor Merchant as Merchant System
    participant API as PayBridge API
    participant MService as Merchants Service
    participant DB as PostgreSQL (Prisma)
    
    Admin->>API: POST /api/v1/merchants (Master API Key)
    API->>MService: createMerchant({ name, email, webhookUrl })
    MService->>MService: Generate API Key (pb_live_...) & SHA-256 Hash
    MService->>DB: Save Merchant & Hashed ApiKey
    MService-->>Admin: 201 Created (Full API Key returned once)
    
    Merchant->>API: POST /api/v1/checkout/session (x-api-key: pb_live_...)
    API->>MService: findMerchantByApiKey(rawKey)
    MService->>DB: Query ApiKey by SHA-256 hash
    DB-->>MService: Return Merchant Entity
    MService->>DB: Background update lastUsedAt
    API->>API: Scope execution to Merchant ID
    API-->>Merchant: 201 Created (Tenant-scoped PaymentIntent)
```

---

### Payment Checkout Flow

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as Merchant / Client
    participant Controller as Checkout Controller
    participant Auth as ApiKeyGuard
    participant Idemp as Idempotency Interceptor
    participant Router as Smart Routing Service
    participant Breaker as Circuit Breaker Service
    participant Provider as Payment Gateway (Stripe/Paymob)
    participant DB as PostgreSQL (Prisma)

    Merchant->>Controller: POST /api/v1/checkout/session (x-api-key, Idempotency-Key)
    Controller->>Auth: Validate API Key & attach Merchant context
    Auth-->>Controller: Merchant Verified (merchantId)
    Controller->>Idemp: Validate & Reserve Idempotency Key
    Idemp->>DB: Check / Insert Idempotency Key
    Controller->>Router: resolveRoute({ amount, currency, strategy })
    Router->>Breaker: Check provider health status
    Router-->>Controller: Return candidate fallback chain
    Controller->>Breaker: fire(selectedGateway, createIntent)
    Breaker->>Provider: Create Payment Intent
    Provider-->>Breaker: Success (gatewayPaymentId, clientSecret)
    Breaker-->>Controller: Return Payment Intent Result
    Controller->>DB: Save PaymentIntent (PENDING, merchantId)
    Controller->>DB: Cache response against Idempotency Key
    Controller-->>Merchant: 201 Created (intentId, reference, clientSecret)
```

---

### Inbound & Outbound Webhook Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Gateway as External Gateway (Stripe / Paymob)
    participant WebhookCtrl as Webhooks Controller
    participant Provider as Provider Adapter
    participant DB as PostgreSQL
    participant BullMQ as BullMQ Queue (Redis)
    participant Worker as Webhook Dispatcher Worker
    participant Merchant as Merchant Webhook Server

    Gateway->>WebhookCtrl: POST /api/v1/webhooks/:gateway (Signature Header)
    WebhookCtrl->>Provider: verifyWebhookSignature(rawBody, signature)
    alt Signature Invalid
        WebhookCtrl-->>Gateway: 401 Unauthorized
    else Signature Valid
        WebhookCtrl->>DB: $transaction: Insert WebhookEvent & Update PaymentIntent (CAPTURED)
        alt Duplicate Event (P2002 Unique Constraint)
            WebhookCtrl-->>Gateway: 200 OK (Duplicate ignored)
        else Fresh Event
            WebhookCtrl->>BullMQ: Enqueue Outbound Webhook Job (merchantId, attempts=5)
            WebhookCtrl-->>Gateway: 200 OK { received: true }
            BullMQ->>Worker: Consume Job
            Worker->>DB: Lookup Merchant webhookUrl & webhookSecret
            Worker->>Worker: Generate HMAC Signature (x-paybridge-signature)
            Worker->>Merchant: POST Merchant Webhook URL
            alt Delivery Failed
                Worker->>BullMQ: Retry with Exponential Backoff (2s, 4s, 8s, 16s, 32s)
            else Delivery Succeeded
                Worker->>BullMQ: Mark Job Complete
            end
        end
    end
```

---

### Resilience & Circuit Breaker

PayBridge utilizes the **Circuit Breaker Pattern** for all third-party outbound HTTP requests:

```mermaid
stateDiagram-v2
    [*] --> CLOSED: Normal Operation
    CLOSED --> OPEN: Error rate > 50% (after >= 10 requests)
    OPEN --> HALF_OPEN: Reset timeout elapsed (30s)
    HALF_OPEN --> CLOSED: Probe request succeeds
    HALF_OPEN --> OPEN: Probe request fails
```

- **`CLOSED`**: All traffic passes directly to the gateway.
- **`OPEN`**: Requests fail immediately (`500/503`) or are transparently rerouted to the next available provider in the candidate chain without waiting for network timeouts.
- **`HALF_OPEN`**: Allows a trial request to verify if the gateway has restored normal operations.

---

## Tech Stack

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | [NestJS](https://nestjs.com/) | `v11.x` | Enterprise TypeScript server framework |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `v5.x` | Strongly-typed JavaScript execution |
| **ORM** | [Prisma ORM](https://www.prisma.io/) | `v7.x` | Type-safe database queries, schema & migrations |
| **Database** | [PostgreSQL](https://www.postgresql.org/) | `16-alpine` | Multi-tenant ACID relational data store |
| **Job Queue & Cache** | [Redis](https://redis.io/) / [BullMQ](https://docs.bullmq.io/) | `v7.x` / `v6.x` | Distributed asynchronous task queues & retries |
| **Resilience** | [Opossum](https://nodeshift.dev/opossum/) | `v10.x` | Circuit Breaker implementation |
| **Validation** | [class-validator](https://github.com/typestack/class-validator) | `v0.15.x` | DTO validation and input sanitization |
| **Testing** | [Jest](https://jestjs.io/) / Supertest | `v30.x` | Unit and integration test suite |
| **Containers** | [Docker](https://www.docker.com/) & Docker Compose | `v3.8` | Containerized PostgreSQL and Redis services |

---

## Project Structure

```
paybridge/
├── .agents/                      # Custom skills & agent workflows
├── prisma/
│   └── schema.prisma             # PostgreSQL multi-tenant schema
├── src/
│   ├── analytics/                # Multi-tenant analytics & aggregations
│   │   ├── dto/                  # Query filters (date range, gateway)
│   │   ├── analytics.controller.ts
│   │   ├── analytics.service.ts
│   │   └── analytics.types.ts
│   ├── checkout/                 # Checkout session orchestration
│   │   ├── dto/                  # CreateCheckoutSessionDto
│   │   ├── checkout.controller.ts
│   │   └── checkout.service.ts
│   ├── common/                   # Cross-cutting infrastructure
│   │   ├── auth/                 # AdminGuard & ApiKeyGuard
│   │   ├── idempotency/          # Database-backed idempotency interceptor
│   │   └── resilience/           # Opossum circuit breaker service
│   ├── health/                   # Liveness, readiness & Prometheus metrics
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── metrics.service.ts
│   ├── merchants/                # Multi-tenant merchant & API key domain
│   │   ├── dto/                  # CreateMerchantDto, UpdateMerchantDto
│   │   ├── merchants.controller.ts
│   │   ├── merchants.module.ts
│   │   └── merchants.service.ts
│   ├── outbound-webhooks/        # BullMQ queue & background worker
│   │   ├── interfaces/           # Webhook payload & job interfaces
│   │   ├── outbound-webhooks.processor.ts
│   │   └── outbound-webhooks.service.ts
│   ├── prisma/                   # Prisma database client service
│   ├── providers/                # Gateway adapters (Strategy Pattern)
│   │   ├── interfaces/           # IPaymentProvider contract
│   │   ├── orchestrator/         # Provider registration & delegation
│   │   ├── fawry.service.ts      # Fawry payment adapter
│   │   ├── paymob.service.ts     # Paymob payment adapter
│   │   └── stripe.service.ts     # Stripe payment adapter
│   ├── reconciliation/           # Stale payment polling & sync
│   │   ├── interfaces/           # Reconciliation report interfaces
│   │   ├── reconciliation.controller.ts
│   │   ├── reconciliation.processor.ts
│   │   └── reconciliation.service.ts
│   ├── refunds/                  # Full & partial refunds processing
│   │   ├── dto/                  # CreateRefundDto
│   │   ├── refunds.controller.ts
│   │   └── refunds.service.ts
│   ├── routing/                  # Smart gateway selection & failover
│   │   ├── routing.types.ts
│   │   └── smart-routing.service.ts
│   ├── webhooks/                 # Inbound gateway webhook ingestion
│   │   ├── webhooks.controller.ts
│   │   └── webhooks.module.ts
│   ├── app.module.ts             # Root application module
│   └── main.ts                   # Application bootstrap & raw body config
├── test/                         # End-to-end (e2e) tests
├── docker-compose.yml            # Local PostgreSQL & Redis infrastructure
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v20.x` or later
- **npm**: `v10.x` or later
- **Docker** & **Docker Compose**: For running PostgreSQL and Redis

---

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mo74x/paybridge.git
   cd paybridge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start local infrastructure (PostgreSQL & Redis):**
   ```bash
   docker-compose up -d
   ```

---

### Environment Configuration

Create a `.env` file in the root directory:

```ini
# Database (PostgreSQL)
DATABASE_URL="postgresql://pb_user:pb_password@localhost:5432/paybridge_db?schema=public"

# Redis (BullMQ & Caching)
REDIS_HOST="localhost"
REDIS_PORT="6379"

# System Administrator Key (for Merchant Management API)
DEV_MASTER_API_KEY="pb_master_admin_secret_key_998877"

# Default Merchant Webhook Settings (Fallback)
MERCHANT_WEBHOOK_URL="http://localhost:4000/webhook"
WEBHOOK_SIGNING_SECRET="pb_whsec_dev_secret_key_12345"

# Gateway Sandbox API Keys
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
PAYMOB_API_KEY="..."
PAYMOB_HMAC_SECRET="..."
FAWRY_MERCHANT_CODE="..."
FAWRY_SECURITY_KEY="..."

# Idempotency & Reconciliation Configuration
IDEMPOTENCY_TTL_SECONDS="86400"
RECONCILIATION_INTERVAL_MS="900000"
RECONCILIATION_THRESHOLD_MINUTES="15"
```

---

### Database Setup & Migrations

1. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

2. **Run database migrations or synchronize schema:**
   ```bash
   npx prisma migrate dev --name init
   # Or for fast local sync:
   npx prisma db push
   ```

3. *(Optional)* **Inspect database with Prisma Studio:**
   ```bash
   npx prisma studio
   ```

---

### Running the Application

```bash
# Start in development watch mode
npm run start:dev

# Start in production mode
npm run build
npm run start:prod
```

The API will be available at: `http://localhost:3000`

---

## API Reference

### Authentication & Access Control

PayBridge uses a dual-tier authentication architecture:

| Tier | Guard | Header | Target Endpoints |
| :--- | :--- | :--- | :--- |
| **System Admin** | `AdminGuard` | `x-api-key: <DEV_MASTER_API_KEY>` | `/api/v1/merchants/**` |
| **Merchant** | `ApiKeyGuard` | `x-api-key: <pb_live_...>` or `Authorization: Bearer <pb_live_...>` | `/api/v1/checkout/**`, `/api/v1/payments/**`, `/api/v1/analytics/**` |

---

### Merchant Management (Admin API)

Guarded by `AdminGuard`. Use `DEV_MASTER_API_KEY`.

#### 1. Create a Merchant
- **Endpoint**: `POST /api/v1/merchants`
- **Request Body:**
  ```json
  {
    "name": "Acme Commerce Ltd.",
    "email": "payments@acme.com",
    "webhookUrl": "https://api.acme.com/webhooks/paybridge",
    "webhookSecret": "whsec_custom_secret_key_9988",
    "keyLabel": "Production API Key"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "merchant": {
      "id": "a9dcc262-84eb-4f32-93fd-ed331ec8a68f",
      "name": "Acme Commerce Ltd.",
      "email": "payments@acme.com",
      "webhookUrl": "https://api.acme.com/webhooks/paybridge",
      "isActive": true,
      "createdAt": "2026-08-21T20:42:00.000Z"
    },
    "apiKey": {
      "id": "e2f1a34b-12cd-45ef-89ab-0123456789cd",
      "key": "pb_live_9f83b271a04c5e6d7890123456789abcdef0123456789abcdef0123456789abc",
      "prefix": "pb_live_...89abc",
      "label": "Production API Key"
    }
  }
  ```
  > [!NOTE]
  > The full raw API key is returned **only once** at creation time. The database only stores a cryptographic SHA-256 hash.

#### 2. List Merchants
- **Endpoint**: `GET /api/v1/merchants?page=1&limit=20`
- **Response (`200 OK`):**
  ```json
  {
    "data": [
      {
        "id": "a9dcc262-84eb-4f32-93fd-ed331ec8a68f",
        "name": "Acme Commerce Ltd.",
        "email": "payments@acme.com",
        "isActive": true,
        "createdAt": "2026-08-21T20:42:00.000Z",
        "_count": {
          "paymentIntents": 142
        }
      }
    ],
    "meta": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
  ```

#### 3. Get Merchant Details
- **Endpoint**: `GET /api/v1/merchants/:id`
- **Response (`200 OK`):** Returns merchant metadata and active key prefixes (masked).

#### 4. Update Merchant Settings
- **Endpoint**: `PATCH /api/v1/merchants/:id`
- **Request Body:**
  ```json
  {
    "webhookUrl": "https://new-api.acme.com/webhooks",
    "isActive": true
  }
  ```

#### 5. Generate / Rotate API Key
- **Endpoint**: `POST /api/v1/merchants/:id/keys`
- **Request Body:** `{ "label": "Secondary Backup Key" }`
- **Response (`201 Created`):** Returns the newly created full API key.

#### 6. Revoke API Key
- **Endpoint**: `DELETE /api/v1/merchants/:id/keys/:keyId`
- **Response (`200 OK`):** `{ "revoked": true, "keyId": "e2f1a34b-12cd-45ef-89ab-0123456789cd" }`

---

### Checkout & Payments

Guarded by `ApiKeyGuard`. Scoped automatically to the authenticated merchant.

#### 1. Create Checkout Session
Initiates a payment intent, resolves the optimal gateway candidate chain via the Smart Routing Engine, creates the intent with circuit breaker protection, and returns client credentials.

- **Endpoint**: `POST /api/v1/checkout/session`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: pb_live_...`
  - `Idempotency-Key: <unique-request-id>` *(Recommended)*

**Request Body:**
```json
{
  "amount": 250.00,
  "currency": "EGP",
  "customerEmail": "customer@example.com",
  "gateway": "PAYMOB",
  "routingStrategy": "CURRENCY_OPTIMIZED",
  "webhookUrl": "https://merchant.example.com/api/webhooks"
}
```

**Routing Strategies:**
- `CURRENCY_OPTIMIZED` *(Default)*: Routes based on currency origin (`EGP` -> Paymob/Fawry, `USD`/`EUR` -> Stripe).
- `FEE_OPTIMIZED`: Prioritizes lowest interchange processing fees.
- `LOWEST_LATENCY`: Prioritizes lowest network latency endpoints.

**Response (`201 Created`):**
```json
{
  "intentId": "d7a46e5a-8b89-4a7b-a25e-049e755a9b71",
  "reference": "ORD-1724000000000-abcd1234",
  "gateway": "PAYMOB",
  "clientSecret": "paymob_token_mock_1724000000000"
}
```

---

### Refunds

Guarded by `ApiKeyGuard`.

#### 1. Process a Refund
Issues a full or partial refund for a captured payment intent owned by the merchant.

- **Endpoint**: `POST /api/v1/payments/:id/refund`
- **Headers**: `x-api-key`, `Idempotency-Key` *(Optional)*

**Request Body:**
```json
{
  "amount": 100.00,
  "reason": "Customer requested item cancellation"
}
```

**Response (`200 OK`):**
```json
{
  "refundId": "5c1f9b31-3c72-4d69-b59a-241c28c8942b",
  "paymentIntentId": "d7a46e5a-8b89-4a7b-a25e-049e755a9b71",
  "amount": 100.00,
  "status": "SUCCEEDED",
  "gatewayRefundId": "re_stripe_1724000000000"
}
```

#### 2. Get Refunds for Payment Intent
- **Endpoint**: `GET /api/v1/payments/:id/refunds`
- **Response (`200 OK`):**
```json
[
  {
    "id": "5c1f9b31-3c72-4d69-b59a-241c28c8942b",
    "paymentIntentId": "d7a46e5a-8b89-4a7b-a25e-049e755a9b71",
    "amount": "100.00",
    "reason": "Customer requested item cancellation",
    "status": "SUCCEEDED",
    "gatewayRefundId": "re_stripe_1724000000000",
    "createdAt": "2026-08-21T20:30:00.000Z"
  }
]
```

---

### Inbound Webhooks

Used by payment providers to notify PayBridge of transaction updates.

- **Endpoint**: `POST /api/v1/webhooks/:gateway`
- **Supported Providers**: `stripe`, `paymob`, `fawry`
- **Headers**:
  - Stripe: `stripe-signature: <signature>`
  - Paymob / Fawry: `hmac: <signature>`

---

### Reconciliation

#### 1. Trigger Manual Reconciliation
Scans for stale `PENDING` transactions older than `RECONCILIATION_THRESHOLD_MINUTES`, queries the provider status directly, syncs local records, and queues merchant notifications.

- **Endpoint**: `POST /api/v1/reconciliation/trigger`
- **Response (`200 OK`):**
```json
{
  "scanned": 12,
  "captured": 3,
  "failed": 1,
  "unchanged": 8,
  "errors": [],
  "executedAt": "2026-08-21T20:35:00.000Z"
}
```

---

### Analytics

Guarded by `ApiKeyGuard`. Scopes metrics directly to the authenticated merchant.

#### 1. Get Transaction Overview
Returns aggregate volume, conversion rates, currency breakdowns, gateway metrics, and refund figures.

- **Endpoint**: `GET /api/v1/analytics/overview`
- **Query Parameters**:
  - `from`: ISO Date String (`2026-01-01T00:00:00Z`)
  - `to`: ISO Date String (`2026-12-31T23:59:59Z`)
  - `gateway`: `STRIPE` | `PAYMOB` | `FAWRY`

**Response (`200 OK`):**
```json
{
  "summary": {
    "totalTransactions": 150,
    "successfulTransactions": 142,
    "failedTransactions": 5,
    "pendingTransactions": 3,
    "overallSuccessRate": 96.6,
    "overallConversionRate": 94.67
  },
  "volumeByCurrency": [
    { "currency": "EGP", "totalAmount": 145000.00, "count": 100 },
    { "currency": "USD", "totalAmount": 12500.00, "count": 50 }
  ],
  "gatewayBreakdown": {
    "STRIPE": {
      "gateway": "STRIPE",
      "totalTransactions": 50,
      "successfulTransactions": 49,
      "failedTransactions": 1,
      "pendingTransactions": 0,
      "successRate": 98.0,
      "failureRate": 2.0,
      "totalVolume": { "USD": 12500.00 }
    },
    "PAYMOB": {
      "gateway": "PAYMOB",
      "totalTransactions": 80,
      "successfulTransactions": 75,
      "failedTransactions": 3,
      "pendingTransactions": 2,
      "successRate": 96.15,
      "failureRate": 3.85,
      "totalVolume": { "EGP": 120000.00 }
    },
    "FAWRY": {
      "gateway": "FAWRY",
      "totalTransactions": 20,
      "successfulTransactions": 18,
      "failedTransactions": 1,
      "pendingTransactions": 1,
      "successRate": 94.74,
      "failureRate": 5.26,
      "totalVolume": { "EGP": 25000.00 }
    }
  },
  "statusBreakdown": {
    "PENDING": 3,
    "AUTHORIZED": 0,
    "CAPTURED": 138,
    "FAILED": 5,
    "REFUNDED": 4
  },
  "refunds": {
    "totalRefunds": 4,
    "totalRefundAmount": {
      "EGP": 1500.00,
      "USD": 250.00
    }
  }
}
```

---

### Health & Metrics

| Endpoint | Method | Format | Description |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | JSON | Overall system status, database connectivity & Redis health |
| `/metrics` | `GET` | Prometheus Text | Prometheus metrics (process memory, circuit breaker status, volumes) |

---

## Merchant Webhook Verification

Outbound webhooks dispatched by PayBridge to merchant servers include HMAC-SHA256 signature headers generated using the merchant's private `webhookSecret`:

- `x-paybridge-signature`: `t=<timestamp>,v1=<signature>`
- `x-paybridge-timestamp`: `<timestamp>`

### Node.js / TypeScript Verification Example

```typescript
import * as crypto from 'crypto';

export function verifyPaybridgeSignature(
  rawPayload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  // 1. Parse header parts
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = parseInt(timestampPart.substring(2), 10);
  const signature = signaturePart.substring(3);

  // 2. Prevent replay attacks (check timestamp drift)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false; // Timestamp outside acceptable tolerance window
  }

  // 3. Compute expected HMAC
  const expectedPayload = `${timestamp}.${rawPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(expectedPayload)
    .digest('hex');

  // 4. Timing-safe equality comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );
}
```

---

## Testing

PayBridge includes comprehensive test suites across controllers, services, interceptors, circuit breakers, processors, and guards:

```bash
# Run unit tests
npm run test

# Run tests with coverage
npm run test:cov

# Run tests in watch mode
npm run test:watch

# Run end-to-end tests
npm run test:e2e
```

---

## Roadmap

- [x] Multi-gateway strategy pattern (Stripe, Paymob, Fawry)
- [x] Smart dynamic routing with fee/currency/latency optimization
- [x] Circuit breaker resilience with Opossum
- [x] Database-backed Idempotency Interceptor
- [x] BullMQ outbound webhook queues with exponential backoff
- [x] Automated transaction reconciliation
- [x] Full & partial refunds
- [x] Multi-tenant merchant architecture with SHA-256 API key isolation
- [x] Prometheus metrics & health checks
- [ ] Apple Pay & Google Pay direct session pass-through
- [ ] Merchant self-service web dashboard & analytics portal
- [ ] 3D-Secure 2.0 frictionless authentication flows

---

## License

This project is licensed under the **MIT License**.
