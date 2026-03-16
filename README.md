
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
GET    /api/v1/payments/invoice/:invoiceId
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






