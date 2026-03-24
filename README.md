<p align="center">
  <strong>Production-grade backend infrastructure for a multi-tenant SaaS billing platform.</strong>
</p>

# 🧾 SaaS Billing Platform

A modern Express backend that handles organizations, clients, invoices, and payments — built with the reliability and resilience tooling you'd expect in production.

---

## What Makes This Different

Most billing backends are CRUD with a payment call bolted on. This one goes further:

- **Async-first** — BullMQ queues handle email delivery, PDF generation, overdue reminders, and webhook retries. No blocking, no dropped jobs.
- **Redis-powered resilience** — circuit breaker + in-memory fallback on every Redis-dependent path, so the app degrades gracefully instead of crashing.
- **Idempotency built in** — payment retries replay saved responses instead of double-charging.
- **Webhook reliability** — exponential backoff, dedupe/replay protection, and dead-letter routing for every failed event.
- **Failure-resilience test suite** — actual Redis cycling tests that prove the fallback paths work.

---

## Core Features

### 🏢 Multi-Tenant Architecture
Each organization gets fully isolated data — clients, invoices, payments, and analytics. Cross-tenant data leakage is impossible by design, enforced at the middleware layer.

### 🔐 Auth & Security
JWT access + refresh token flows, bcrypt, RBAC, request validation, and Redis-backed rate limiting with a circuit breaker per policy.

### 🧾 Invoice Lifecycle
`draft → sent → paid / overdue` — with automatic tax calculation, audit trails, and overdue reminders triggered via queue workers.

### 💳 Razorpay Payment Integration
Provider abstraction layer (`src/providers/razorpayProvider.js`) with mock for dev and Razorpay for production. The integration covers:

- **Signature verification** — every payment response is validated via HMAC in `src/utils/razorpayVerify.js` before any invoice state changes.
- **Webhook handling** — `src/webhooks/razorpayWebhook.js` processes Razorpay events with secret-based payload verification, deduplication, and DLQ routing for failures.
- **Service layer** — `src/services/razorpayService.js` encapsulates all Razorpay API calls behind a clean interface, keeping controllers payment-provider-agnostic.
- **Tested end-to-end** — `razorpayPayment.test.js`, `razorpayVerifyPayment.test.js`, and `razorpayWebhook.test.js` cover the full payment and webhook lifecycle.

### 📊 Analytics
Organization-level insights: total revenue, invoice counts, payment activity, and client trends.

---

## Architecture & Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, MongoDB + Mongoose |
| Async / Queues | BullMQ, dual Redis (core + queue) |
| Payments | Razorpay API (India's Stripe equivalent), signature verification, idempotency middleware |
| Email / PDF | Nodemailer, Puppeteer |
| Observability | Winston logs, `/health`, `/health/redis`, `/metrics/redis`, Swagger UI |
| DevOps | Docker, Docker Compose, GitHub Actions CI/CD |

---

## Project Layout

```bash
src/
├── config/         # env, logger, Redis + queue helpers, Swagger
├── controllers/
├── middleware/      # auth, idempotency, rate limits, error guards
├── models/
├── routes/
├── services/        # auth, payments, invoices, cache, webhook reliability
├── queues/          # BullMQ registry + helpers
├── workers/         # email / pdf / reminder / webhook workers
├── webhooks/        # Razorpay webhook handlers
├── app.js
└── server.js

tests/
├── integration/     # auth, invoices, payments, RBAC, tenant isolation, failure resilience
├── unit/            # invoice guards, service logic
└── setup/
```

---

## API Endpoints

| Area | Routes |
|---|---|
| Auth | `POST /register` `/login` `/refresh` `/logout` |
| Clients | Full CRUD — `/api/v1/clients` |
| Invoices | Full CRUD — `/api/v1/invoices` |
| Payments | `/create-order` `/verify` `/invoice/:id/pay` `/invoice/:id/payments` |
| Webhooks | `POST /api/v1/webhooks/razorpay` |

---

## Running Locally

**Prerequisites:** Node.js v18+, MongoDB, Redis, npm

```bash
git clone https://github.com/<your-username>/saas-billing-platform.git
cd saas-billing-platform
npm install
cp .env.example .env   # update secrets + Redis URLs
npm run dev
```

- API → `http://localhost:4000`
- Swagger → `http://localhost:4000/api-docs`

### Key Environment Variables

```env
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/saas
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
REDIS_URL=redis://:password@localhost:6379
QUEUE_REDIS_URL=redis://:password@localhost:6380
REDIS_CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
REDIS_CIRCUIT_BREAKER_COOLDOWN_MS=30000
```

---

## Testing

```bash
npm test                    # default suite
npm run test:coverage       # enforces 45% coverage thresholds
```

**Failure-resilience suite** (intentionally cycles Docker Redis — run separately):
```powershell
$env:RUN_FAILURE_RESILIENCE_TESTS='true'; npm test -- tests/integration/failureResilience.test.js
```

Test coverage spans: auth flows, invoice lifecycle, payment verification, webhook edge cases, RBAC rules, and tenant isolation.

---

## Docker

```bash
docker compose up --build
```

| Service | Address |
|---|---|
| API | `http://localhost:4000` |
| MongoDB | `localhost:27017` |
| Redis core | `localhost:6379` |
| Redis queue | `localhost:6380` |
| Worker | `npm run dev:worker` |

---

## Reliability Guarantees

| Scenario | What Happens |
|---|---|
| Duplicate webhook delivery | `buildWebhookDedupeKey` + `isWebhookAlreadyProcessed` checks Redis (with local fallback map) before any processing — second delivery is short-circuited entirely. Covered end-to-end in `webhookReliability.test.js` and `webhookEdgeCases.test.js`. |
| Retry limit before dead-letter | `incrementWebhookRetryCount` tracks retries in Redis. Once the count hits `WEBHOOK_RETRY_MAX_ATTEMPTS` (default: 3, configurable), `handleWebhookFailure` routes the event to the DLQ via `pushWebhookEventToDlq` — hard ceiling, no infinite retry loops. |
| Redis outage | Circuit breaker in `src/config/redis.js` counts failures per client. At `REDIS_CIRCUIT_BREAKER_FAILURE_THRESHOLD` (default: 5) the breaker opens, short-circuits Redis commands, and falls back to in-memory stores — app keeps running and recovers automatically after `REDIS_CIRCUIT_BREAKER_COOLDOWN_MS`. |

---

## Monitoring

| Endpoint | What it shows |
|---|---|
| `/health` | Overall health + Mongo/Redis state |
| `/health/redis` | Redis connectivity + circuit breaker metadata |
| `/metrics/redis` | Hit ratio, latency — ready for dashboards |

---

## CI/CD

GitHub Actions runs on every push: installs dependencies → `npm run test:coverage` → builds Docker image. Coverage thresholds only enforce when `COVERAGE=true`.
