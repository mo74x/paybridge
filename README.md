# PayBridge

<p align="center">
  <strong>Enterprise-Grade Multi-Gateway Payment Orchestration Engine</strong>
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
  - [Authentication](#authentication)
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

**PayBridge** is a high-availability, multi-provider payment orchestrator built with **NestJS**, **TypeScript**, **PostgreSQL**, and **Redis**. It provides a single unified API to route, execute, monitor, and reconcile transactions across disparate payment service providers (**Stripe**, **Paymob**, **Fawry**, and beyond).

PayBridge eliminates vendor lock-in, shields applications from payment gateway downtime with circuit breakers and dynamic fallback routing, enforces strict database-level idempotency to prevent double-charging, and guarantees reliable merchant notifications via resilient BullMQ message queues.

---

## Key Features

- **Multi-Gateway Strategy Pattern**: Plug-and-play architecture supporting **Stripe** (global cards & APMs), **Paymob** (MENA cards & digital wallets), and **Fawry** (Egyptian cash/reference numbers).
- **Smart Dynamic Routing**:
  - `CURRENCY_OPTIMIZED`: Directs local currencies (`EGP`, `SAR`, `AED`, `USD`, `EUR`) to their optimal regional providers.
  - `FEE_OPTIMIZED`: Routes micro-transactions and high-volume payments to lowest-cost interchange channels.
  - `LOWEST_LATENCY`: Prioritizes nearest regional endpoints.
  - **Health-Aware Fallbacks**: Dynamically skips degraded or failing gateways in the candidate fallback chain.
- **Circuit Breaker Fault Tolerance (Opossum)**:
  - Gateway-isolated circuit breakers monitor error rates, response timeouts, and thresholds.
  - Fails fast on degraded gateways, preventing cascading timeouts and system exhaustion.
  - Automatically tests gateway health recovery via `HALF_OPEN` probe requests.
- **Strict Idempotency Layer**:
  - Header-driven (`Idempotency-Key`) interceptor persisted in PostgreSQL.
  - Protects against duplicate checkout requests and concurrent in-flight submissions (`409 Conflict`).
  - Seamlessly replays cached responses (`x-idempotent-replay: true`).
- **Cryptographic Webhook Ingestion & Anti-Replay**:
  - Validates provider HMAC signatures against unparsed raw body buffers.
  - Transactional event ledger (`WebhookEvent`) with database unique constraints prevents replay attacks.
- **Reliable Outbound Webhooks (BullMQ + Redis)**:
  - Asynchronous background dispatch of lifecycle events (`payment.succeeded`, `payment.failed`, `refund.processed`).
  - Exponential backoff retry policy (5 attempts: 2s, 4s, 8s, 16s, 32s).
  - HMAC-SHA256 payload signing (`x-paybridge-signature`) for merchant authenticity.
- **Automated Transaction Reconciliation**:
  - Background worker and on-demand trigger to resolve abandoned or zombie `PENDING` transactions.
  - Polls provider upstream APIs and broadcasts compensating outbound webhooks for dropped events.
- **Full & Partial Refunds Engine**:
  - Unified refund initiation and status tracking across all integrated providers.
- **Observability & Analytics**:
  - Prometheus-compatible `/metrics` endpoint (process memory, circuit breaker states, volume by currency, gateway counters).
  - Production-ready `/health` health checks for database, Redis, and payment providers.
  - Comprehensive analytics aggregation API with conversion and success rate metrics.

---

## Architecture & Design Patterns

### System Architecture

```mermaid
graph TD
    Client["Client / Frontend / Merchant App"] -->|HTTPS + API Key| Gateway["PayBridge API Gateway (NestJS)"]
    
    subgraph Core ["PayBridge Core Engine"]
        Guard["API Key Guard & Idempotency Interceptor"]
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

    Client --> Guard
    Guard --> Router
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

### Payment Checkout Flow

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as Merchant / Client
    participant Controller as Checkout Controller
    participant Idemp as Idempotency Interceptor
    participant Router as Smart Routing Service
    participant Breaker as Circuit Breaker Service
    participant Provider as Payment Gateway (Stripe/Paymob)
    participant DB as PostgreSQL (Prisma)

    Merchant->>Controller: POST /api/v1/checkout/session (Idempotency-Key)
    Controller->>Idemp: Validate & Reserve Idempotency Key
    Idemp->>DB: Check / Insert Idempotency Key
    Controller->>Router: resolveRoute({ amount, currency, strategy })
    Router->>Breaker: Check provider availability
    Router-->>Controller: Return candidate fallback chain
    Controller->>Breaker: fire(selectedGateway, createIntent)
    Breaker->>Provider: Create Payment Intent
    Provider-->>Breaker: Success (gatewayPaymentId, clientSecret)
    Breaker-->>Controller: Return Payment Intent Result
    Controller->>DB: Save PaymentIntent (PENDING)
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
    participant Merchant as Merchant Server

    Gateway->>WebhookCtrl: POST /api/v1/webhooks/:gateway (Signature Header)
    WebhookCtrl->>Provider: verifyWebhookSignature(rawBody, signature)
    alt Signature Invalid
        WebhookCtrl-->>Gateway: 401 Unauthorized
    else Signature Valid
        WebhookCtrl->>DB: $transaction: Insert WebhookEvent & Update PaymentIntent (CAPTURED)
        alt Duplicate Event (P2002 Unique Constraint)
            WebhookCtrl-->>Gateway: 200 OK (Duplicate ignored)
        else Fresh Event
            WebhookCtrl->>BullMQ: Enqueue Outbound Webhook Job (attempts=5)
            WebhookCtrl-->>Gateway: 200 OK { received: true }
            BullMQ->>Worker: Consume Job
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
| **Database** | [PostgreSQL](https://www.postgresql.org/) | `16-alpine` | ACID-compliant relational data store |
| **Job Queue & Cache** | [Redis](https://redis.io/) / [BullMQ](https://docs.bullmq.io/) | `v7.x` / `v6.x` | Distributed asynchronous task queues & retries |
| **Resilience** | [Opossum](https://nodeshift.dev/opossum/) | `v10.x` | Circuit Breaker implementation |
| **Validation** | [class-validator](https://github.com/typestack/class-validator) | `v0.15.x` | DTO validation and input sanitization |
| **Testing** | [Jest](https://jestjs.io/) / Supertest | `v30.x` | Comprehensive unit and integration test suite |
| **Containers** | [Docker](https://www.docker.com/) & Docker Compose | `v3.8` | Containerized PostgreSQL and Redis services |

---

## Project Structure

```
paybridge/
├── .agents/                      # Agent workflows & custom skills
├── prisma/
│   └── schema.prisma             # PostgreSQL schema definitions
├── src/
│   ├── analytics/                # Volume, conversion & gateway metrics
│   │   ├── dto/                  # Analytics query filters
│   │   ├── analytics.controller.ts
│   │   ├── analytics.service.ts
│   │   └── analytics.types.ts
│   ├── checkout/                 # Checkout session orchestration
│   │   ├── dto/                  # CreateCheckoutSessionDto
│   │   ├── checkout.controller.ts
│   │   └── checkout.service.ts
│   ├── common/                   # Cross-cutting concerns & middleware
│   │   ├── auth/                 # API Key authentication guard
│   │   ├── idempotency/          # Database-backed idempotency interceptor
│   │   └── resilience/           # Opossum circuit breaker service
│   ├── health/                   # Liveness, readiness & Prometheus metrics
│   │   ├── health.controller.ts
│   │   ├── health.service.ts
│   │   └── metrics.service.ts
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
│   └── main.ts                   # Application entrypoint & raw-body config
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

# Merchant Webhook Settings
MERCHANT_WEBHOOK_URL="http://localhost:4000/webhook"
WEBHOOK_SIGNING_SECRET="pb_whsec_dev_secret_key_12345"

# Security
DEV_MASTER_API_KEY="pb_test_live_key_998877"

# Idempotency & Reconciliation
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

2. **Run database migrations:**
   ```bash
   npx prisma migrate dev --name init
   ```

3. *(Optional)* **Open Prisma Studio:**
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

All protected endpoints require an API Key supplied via header:
- `x-api-key: <YOUR_API_KEY>` or
- `Authorization: Bearer <YOUR_API_KEY>`

---

### Authentication

| Header | Description | Default Dev Key |
| :--- | :--- | :--- |
| `x-api-key` | API Key provided to authorized merchants | `pb_test_live_key_998877` |
| `Authorization` | Bearer token format | `Bearer pb_test_live_key_998877` |

---

### Checkout & Payments

#### 1. Create Checkout Session
Initiates a payment intent, resolves the best gateway candidate chain via the Smart Routing Engine, creates the intent with circuit breaker protection, and returns client credentials.

- **Endpoint**: `POST /api/v1/checkout/session`
- **Headers**:
  - `Content-Type: application/json`
  - `x-api-key: pb_test_live_key_998877`
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

**Routing Strategies Available**:
- `CURRENCY_OPTIMIZED` *(Default)*
- `FEE_OPTIMIZED`
- `LOWEST_LATENCY`

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

#### 1. Process a Refund
Issues a full or partial refund for a captured payment intent.

- **Endpoint**: `POST /api/v1/payments/:id/refund`
- **Headers**: `x-api-key`, `Idempotency-Key` *(Optional)*

**Request Body:**
```json
{
  "amount": 100.00,
  "reason": "Customer requested order cancellation"
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
    "reason": "Customer requested order cancellation",
    "status": "SUCCEEDED",
    "gatewayRefundId": "re_stripe_1724000000000",
    "createdAt": "2026-08-18T20:30:00.000Z"
  }
]
```

---

### Inbound Webhooks

Used by payment providers to notify PayBridge of transaction status updates.

- **Endpoint**: `POST /api/v1/webhooks/:gateway`
- **Supported Gateway Parameters**: `stripe`, `paymob`, `fawry`
- **Headers**:
  - For Stripe: `stripe-signature: <signature>`
  - For Paymob / Fawry: `hmac: <signature>`

**Stripe Example Payload:**
```json
{
  "id": "evt_test_12345",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "d7a46e5a-8b89-4a7b-a25e-049e755a9b71",
      "amount": 25000,
      "currency": "usd"
    }
  }
}
```

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
  "executedAt": "2026-08-18T20:35:00.000Z"
}
```

---

### Analytics

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

| Endpoint | Method | Output | Description |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | JSON | Overall system status, database connectivity & Redis health |
| `/metrics` | `GET` | Prometheus Text | Prometheus metrics (memory, uptime, circuit breakers, volumes) |

---

## Merchant Webhook Verification

Outbound webhooks sent from PayBridge to your merchant server include HMAC-SHA256 signature headers to guarantee authenticity and prevent replay attacks:

- `x-paybridge-signature`: `t=<timestamp>,v1=<signature>`
- `x-paybridge-timestamp`: `<timestamp>`

### Node.js Verification Example

```typescript
import * as crypto from 'crypto';

function verifyPaybridgeSignature(
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
    return false; // Timestamp out of tolerance
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
- [x] Prometheus metrics & health checks
- [ ] Apple Pay & Google Pay direct session pass-through
- [ ] Multi-tenant merchant account segregation & portal
- [ ] 3D-Secure 2.0 frictionless authentication flows

---

## License

This project is licensed under the **MIT License**.
