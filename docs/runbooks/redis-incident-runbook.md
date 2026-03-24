# Redis Incident Runbook (Phase 8)

This runbook covers Redis availability, saturation, and security incidents for the SaaS platform.

## Scope

- Core Redis workload: locks, idempotency, webhook reliability, scheduler coordination.
- Queue Redis workload: BullMQ queues and retries.

## Key Endpoints

- GET /health
- GET /health/redis
- GET /metrics/redis
- GET /metrics/queues
- GET /metrics/webhooks
- GET /dlq/queues
- GET /dlq/webhooks

## SLO Targets

- Redis availability (health=connected): >= 99.9% monthly.
- Redis command success rate: >= 99.95% monthly.
- Queue processing latency P95: <= 60s for email/reminder/retry jobs.
- Dead-letter growth: zero sustained growth over 30 minutes.

## Incident Severity

- SEV-1: Core Redis unavailable for > 5 minutes or persistent payment/webhook failures.
- SEV-2: Elevated failures/latency, circuit breaker open bursts, queue backlog > threshold.
- SEV-3: Non-critical degradation with healthy failover behavior.

## Detection Signals

1. /health/redis returns degraded/disconnected.
2. /metrics/redis shows circuitBreaker.state=open.
3. /metrics/queues shows waiting or failed counts increasing continuously.
4. /metrics/webhooks shows failures/retries spikes.

## Triage Checklist

1. Confirm impact scope:
- API-only vs worker-only vs both.
- Core redis-core vs queue redis-queue.

2. Validate connectivity:
- Redis pod/container health.
- Auth credentials validity.
- DNS/network route from API and worker.

3. Check resource pressure:
- used_memory_human and peak memory.
- eviction policy and memory ceiling.
- queue waiting/failed counts.

4. Check security events:
- repeated auth failures.
- unexpected external source IPs.

## Containment and Recovery

### A. Redis Unavailable

1. Restart affected Redis service.
2. Verify API fallback behavior (local stores for safety paths where applicable).
3. Resume workers and monitor queue drain rate.

### B. Memory Saturation / Eviction Risk

1. If queue workload is noeviction and writes fail, temporarily scale memory up.
2. If core workload is saturating, increase REDIS_CORE_MAXMEMORY and restart during window.
3. Confirm policy:
- core: volatile-ttl (or approved override).
- queue: noeviction.

### C. Backlog / DLQ Growth

1. Inspect /dlq/queues and /dlq/webhooks samples.
2. Identify top failing job/event type.
3. Apply fix and replay from DLQ in controlled batches.

### D. Security Incident

1. Rotate REDIS_PASSWORD immediately.
2. Restrict network ingress to internal network/security groups only.
3. Enforce TLS endpoint usage (rediss://) where provider supports it.
4. Audit access logs and rotate API secrets if lateral movement suspected.

## Post-Incident Steps

1. Capture timeline and root cause.
2. Record MTTD/MTTR and SLO impact.
3. Add preventive action item with owner and due date.
4. Update this runbook and alert thresholds.
