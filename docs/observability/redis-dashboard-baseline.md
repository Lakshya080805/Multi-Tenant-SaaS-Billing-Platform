# Redis Baseline Dashboard

Use `/metrics/redis` and `/health/redis` as data sources for a first Grafana/Datadog dashboard.

## Core Panels

1. Redis availability
- Source: `/health/redis`
- Field: `status`
- Alert when status != `connected` for 2 minutes.

2. Redis ops/sec
- Source: `/metrics/redis`
- Field: `metrics.instantaneous_ops_per_sec`
- Track trend and correlate with API traffic.

3. Connected clients
- Source: `/metrics/redis`
- Field: `metrics.connected_clients`
- Alert when unexpected growth persists.

4. Cache hit ratio
- Source: `/metrics/redis`
- Field: `metrics.cache_hit_ratio`
- Start target: >= 0.70 after cache rollout.

5. Memory usage
- Source: `/metrics/redis`
- Fields: `metrics.used_memory_human`, `metrics.used_memory_peak_human`
- Alert near maxmemory threshold.

6. Circuit breaker state
- Source: `/metrics/redis`
- Field: `circuitBreaker.state`
- Alert when state = `open`.

## Suggested SLO Alerts

1. Availability: redis connected >= 99.9% over 30 days.
2. Error burst: circuit breaker opens 3+ times within 10 minutes.
3. Performance: ops/sec drops to near-zero while API traffic is normal.

## Notes

- Keep this dashboard as baseline during Phase 0.
- Add queue depth, cache-by-domain hit ratios, and command latencies in later phases.
