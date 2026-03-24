
<p align="center">
  <b>Production-grade backend infrastructure for a multi-tenant SaaS billing platform.</b>
</p>

# 🧾 SaaS Billing Platform
### Backend System for Organizations, Clients, Invoices and Payments

---

## 🚀 Overview

The SaaS Billing Platform is a backend-focused project designed to simulate real-world **SaaS billing infrastructure**.

It allows organizations to manage:

- Clients
- Invoices
- Payments
- Billing workflows

while maintaining:

- 🔐 Secure Authentication
- 🏢 Multi-Tenant Data Isolation
- 💳 Payment Gateway Integration
- 📧 Automated Email Notifications
- 🧪 Automated Testing
- 🐳 Docker Deployment
- 🔄 CI/CD Pipelines

---

## ✨ Core Features

### 🏢 Multi-Tenant Architecture

Each organization has isolated data including:

- clients
- invoices
- payments
- analytics

Users from one organization **cannot access another organization's data**.

---

### 🔐 Authentication & Security

- JWT Access Tokens
- Refresh Token Support
- Role-Based Access Control (RBAC)
- Password Hashing (bcrypt)
- Rate Limiting
- Security Middleware
- Protected API Routes

---

### 🧾 Invoice Management

Organizations can:

- create invoices
- update invoices
- send invoices
- track payment status
- calculate tax automatically

Invoice lifecycle:
- draft → sent → paid / overdue

---

### 💳 Payment Integration

Supports multiple payment providers using a **provider abstraction layer**.

Current providers:
1) mock (development)
2) razorpay (production ready)


Features include:

- Razorpay order creation
- payment signature verification
- webhook handling
- payment record storage
- invoice auto-settlement

---

### 📧 Email Notifications

Automated emails for:

- invoice delivery
- payment confirmation
- overdue reminders

Includes **PDF invoice attachments**.

---

### 📊 Analytics APIs

Provides organization-level insights such as:

- total revenue
- invoices created
- invoices paid
- overdue invoices
- client activity

---

### 🧪 Automated Testing

Testing implemented using **Jest + Supertest**.

Covers:

- authentication flows
- invoice lifecycle
- payment verification
- webhook processing
- RBAC access rules

---

### 🐳 Dockerized Deployment

Application runs inside containers using:
Docker
Docker-compose


Features include:

- Razorpay order creation
- payment signature verification
- webhook handling
- payment record storage
- invoice auto-settlement

---



### 🔄 CI/CD Pipeline

GitHub Actions pipeline automatically:
install dependencies
run tests
build Docker image


This ensures every push maintains stability.

---

### 📘 Swagger API Documentation

Interactive API documentation available via Swagger UI.

Developers can:

- explore endpoints
- test requests
- view schemas

---

## 🏗 Architecture & Tech Stack

### 🔹 Backend

- Node.js
- Express.js
- MongoDB
- Mongoose ODM

---

### 🔹 Authentication & Security

- JWT Authentication
- bcrypt password hashing
- Rate Limiting
- Security Middleware

---

### 🔹 Payments

- Razorpay API
- Webhook verification
- Payment signature validation

---

### 🔹 Utilities

- Nodemailer (Email Service)
- Puppeteer (PDF Invoice Generation)
- Winston (Logging)

---

### 🔹 DevOps

- Docker
- Docker Compose
- GitHub Actions (CI/CD)

---

## 📂 Project Structure

```bash
saas/
|-- src/
|   |-- config/
|   |   |-- env.js
|   |   |-- logger.js
|   |   |-- razorpay.js
|   |   |-- swagger.js
|   |
|   |-- controllers/
|   |   |-- authController.js
|   |   |-- clientController.js
|   |   |-- dashboardController.js
|   |   |-- invoiceController.js
|   |   |-- orgController.js
|   |   |-- paymentController.js
|   |
|   |-- middleware/
|   |   |-- authMiddleware.js
|   |   |-- errorMiddleware.js
|   |   |-- notFoundMiddleware.js
|   |   |-- orgMiddleware.js
|   |   |-- rateLimitMiddleware.js
|   |   |-- roleMiddleware.js
|   |   |-- validationMiddleware.js
|   |
|   |-- models/
|   |   |-- clientModel.js
|   |   |-- invoiceModel.js
|   |   |-- organizationModel.js
|   |   |-- paymentModel.js
|   |   |-- refreshTokenModel.js
|   |   |-- userModel.js
|   |
|   |-- routes/
|   |   |-- index.js
|   |   |-- v1/
|   |       |-- authRoutes.js
|   |       |-- clientRoutes.js
|   |       |-- dashboardRoutes.js
|   |       |-- invoiceRoutes.js
|   |       |-- orgRoutes.js
|   |       |-- paymentRoutes.js
|   |       |-- webhookRoutes.js
|   |
|   |-- services/
|   |   |-- authService.js
|   |   |-- clientService.js
|   |   |-- dashboardService.js
|   |   |-- emailService.js
|   |   |-- invoiceScheduler.js
|   |   |-- invoiceService.js
|   |   |-- orgService.js
|   |   |-- paymentService.js
|   |   |-- pdfService.js
|   |   |-- razorpayService.js
|   |
|   |-- utils/
|   |   |-- ApiError.js
|   |   |-- apiResponse.js
|   |   |-- asyncHandler.js
|   |   |-- email.js
|   |   |-- jwt.js
|   |   |-- pdf.js
|   |   |-- pdfGenerator.js
|   |   |-- razorpayVerify.js
|   |
|   |-- webhooks/
|   |   |-- paymentWebhook.js
|   |   |-- razorpayWebhook.js
|   |
|   |-- app.js
|   |-- server.js
|
|-- tests/
|   |-- fixtures/
|   |   |-- invoiceFactory.js
|   |   |-- userFactory.js
|   |-- integration/
|   |   |-- auth.test.js
|   |   |-- authFailure.test.js
|   |   |-- client.test.js
|   |   |-- invoice.test.js
|   |   |-- invoiceLifecycle.test.js
|   |   |-- payment.test.js
|   |   |-- razorpayPayment.test.js
|   |   |-- razorpayVerifyPayment.test.js
|   |   |-- rbac.test.js
|   |   |-- tenantIsolation.test.js
|   |-- setup/
|   |   |-- testApp.js
|   |   |-- testDatabase.js
|   |-- unit/
|   |   |-- invoiceGuards.test.js
|   |   |-- invoiceService.test.js
|   |-- webhooks/
|       |-- razorpayWebhook.test.js
|       |-- webhookEdgeCases.test.js
|
|-- logs/
|-- docker-compose.yml
|-- Dockerfile
|-- jest.config.js
|-- package.json
|-- README.md
```

## ⚡ API Endpoints

### 🔐 Auth

```http
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
```

### 👥 Clients

```http
POST   /api/v1/clients
GET    /api/v1/clients
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
DELETE /api/v1/clients/:id
```

### 🧾 Invoices

```http
POST   /api/v1/invoices
GET    /api/v1/invoices
GET    /api/v1/invoices/:id
PATCH  /api/v1/invoices/:id
DELETE /api/v1/invoices/:id
```

### 💳 Payments

```http
POST   /api/v1/payments/create-order
POST   /api/v1/payments/verify
POST   /api/v1/payments/invoice/:invoiceId/pay
GET    /api/v1/payments/invoice/:invoiceId/payments
```

### 🔔 Webhooks

```http
POST   /api/v1/webhooks/razorpay
```

Used to process Razorpay payment events.

### 🐳 Running Locally
🔧 Prerequisites
-	Node.js (v18+)
-	MongoDB Atlas or Local MongoDB
-	npm
-	Docker (optional)

### 1️⃣ Clone Repository

```Bash
git clone https://github.com/<your-username>/saas-billing-platform.git
cd saas-billing-platform
```

### 2️⃣ Install Dependencies
```Bash
npm install
```

### 3️⃣ Configure Environment
Create .env
```.env
PORT=4000
MONGO_URI=your_mongodb_connection_string

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

PAYMENT_PROVIDER=razorpay

RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx
```

### 4️⃣ Start Server
```Bash
npm run dev
```

Server runs at:
```
http://localhost:4000
```
Swagger documentation:
```
http://localhost:4000/api-docs
```

### 🧪 Running Tests
```Bash
npm test
```

Runs:
-	integration tests
-	webhook tests
-	payment verification tests


### 🐳 Docker Setup
Run the full stack using Docker:
```Bash
docker compose up --build
```

### Services:
```http
API → http://localhost:4000
MongoDB → localhost:27017
```

## Redis Phase 0 Foundation

Redis is now wired as foundational infrastructure for caching, rate limiting, and future queue workloads.

### Local

Run the default stack:

```bash
docker compose up --build
```

Services:

```http
API → http://localhost:4000
MongoDB → localhost:27017
Redis → localhost:6379
```

### Staging

Use staging overrides:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d
```

### Production

Use production overrides:

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml up --build -d
```

Required Redis env values:

- REDIS_ENABLED=true
- REDIS_URL=redis://<host>:6379
- REDIS_PREFIX=saas-prod

### Health and Metrics

- GET /health includes MongoDB and Redis state
- GET /health/redis returns Redis connectivity + circuit breaker state
- GET /metrics/redis returns baseline Redis metrics for dashboards

Baseline dashboard panel guidance is documented in docs/observability/redis-dashboard-baseline.md.

## Scheduler Coordination

Invoice reminder scheduling now uses a leader lock so only one instance executes the cron tick in horizontally scaled deployments.

Environment variables:

- SCHEDULER_INSTANCE_ID=<unique-instance-name>
- SCHEDULER_LEADER_LOCK_TTL_MS=120000

Behavior:

- Redis-enabled environments use distributed lock coordination across instances.
- If Redis is unavailable, scheduler falls back to process-local lock coordination.

## Phase 8 Hardening And Runbook

### Workload Memory and Eviction Policies

Redis is split into two workload profiles in Docker-based deployments:

- `redis-core` (locks, idempotency, webhook reliability, scheduler coordination)
  - `REDIS_CORE_MAXMEMORY` (default: `512mb` local / `1gb` production)
  - `REDIS_CORE_MAXMEMORY_POLICY` (default: `volatile-ttl`)
- `redis-queue` (BullMQ queues, retries, dead-letter)
  - `REDIS_QUEUE_MAXMEMORY` (default: `1gb` local / `2gb` production)
  - `REDIS_QUEUE_MAXMEMORY_POLICY` (default: `noeviction`)

App environment:

- `REDIS_URL` -> core workload endpoint
- `QUEUE_REDIS_URL` -> queue workload endpoint

### Persistence Mode

Both Redis workloads are configured with:

- AOF enabled (`appendonly yes`, `appendfsync everysec`) for durability-sensitive paths.
- RDB snapshots (`save 900 1`, `save 300 10`, `save 60 10000`) for recovery baseline.

### Security Controls

- Redis auth enabled via `REDIS_PASSWORD` and `--requirepass`.
- Network isolation via internal compose network (`saas_backend`).
- Staging/production overrides remove host port exposure for Redis (`ports: []`).
- TLS where applicable:
  - Use managed Redis with `rediss://` URLs for `REDIS_URL` and `QUEUE_REDIS_URL`.

### Incident Runbook and SLO Alarms

- Incident runbook: `docs/runbooks/redis-incident-runbook.md`
- SLO alarm baseline: `docs/observability/phase8-slo-alarms.md`

## Load Testing

Two load scripts are available for the next validation phase.

Prerequisites:

- API server running (`npm run dev` or equivalent)
- Redis enabled (`REDIS_ENABLED=true`)
- Worker process running for queue drain checks (`npm run dev:worker`)

### 1) Dashboard Endpoints Before vs After Redis Cache

Runs two benchmark passes against dashboard APIs:

- cold pass (cache not warmed)
- warm pass (cache preloaded)

and prints before/after deltas for throughput and latency plus cache hit/miss metrics.

```bash
npm run load:dashboard-cache -- --baseUrl http://localhost:4000 --duration 20 --connections 30 --clients 20 --invoices 120
```

### 2) Queue Throughput and Worker Stability Under Burst Traffic

Creates invoices, enqueues async PDF jobs in burst mode, then polls queue metrics until drain timeout.
Reports enqueue rate, pending/active peaks, drain success, and failed/dead-letter deltas.

```bash
npm run load:queue-burst -- --baseUrl http://localhost:4000 --invoices 150 --enqueueConcurrency 50 --drainTimeoutSec 180
```

If the script exits with code `2`, queue jobs did not drain before timeout and worker capacity/health should be investigated.






