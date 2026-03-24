# Phase 8 SLO Alarms

Use these alarms as baseline for production hardening.

## Availability and Health

1. Redis Health Degraded
- Source: /health/redis
- Condition: status != connected for 2 minutes
- Severity: SEV-2

2. Circuit Breaker Open Burst
- Source: /metrics/redis
- Condition: circuitBreaker.state=open 3+ times in 10 minutes
- Severity: SEV-1

## Capacity and Memory

1. Core Redis Memory High
- Source: /metrics/redis
- Condition: used_memory / maxmemory >= 85% for 10 minutes
- Severity: SEV-2

2. Queue Redis Write Risk
- Source: Redis exporter or queue failures
- Condition: noeviction + failed writes detected
- Severity: SEV-1

## Queue Reliability

1. Queue Backlog Growth
- Source: /metrics/queues
- Condition: waiting count grows continuously for 15 minutes
- Severity: SEV-2

2. Queue Failures Spike
- Source: /metrics/queues
- Condition: failed increases by > 50 in 10 minutes
- Severity: SEV-2

3. DLQ Growth
- Source: /dlq/queues
- Condition: dead-letter entries increase for 30 minutes
- Severity: SEV-2

## Webhook Reliability

1. Retry Spike
- Source: /metrics/webhooks
- Condition: retried delta > 25 in 5 minutes
- Severity: SEV-2

2. Dead Letter Webhooks
- Source: /metrics/webhooks or /dlq/webhooks
- Condition: deadLetterDepth > 0 for 15 minutes
- Severity: SEV-2

## Security Controls

1. Redis Auth Failures
- Source: Redis logs
- Condition: repeated NOAUTH or AUTH failure events
- Severity: SEV-1

2. Non-Internal Redis Access Attempt
- Source: network/firewall logs
- Condition: connection attempts from non-allowlisted CIDRs
- Severity: SEV-1

## SLO Tracking

Track monthly for:
- Redis availability >= 99.9%
- Command success >= 99.95%
- Queue latency P95 <= 60s
- DLQ sustained depth = 0
