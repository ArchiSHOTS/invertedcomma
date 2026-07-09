# Neon Egress Verification

After deploying egress optimizations, verify with **measured** numbers — not estimates.

## 1. Neon Console (primary signal)

1. Open [Neon Console](https://console.neon.tech) → your project → **Monitoring**.
2. View **Data transfer** for the last 7 days (hourly if available).
3. Record baseline GB used and daily slope **before** and **48 hours after** each deploy.

**Success criteria (from optimization plan):**

| Milestone | Target |
|-----------|--------|
| Current quote volume | Public browsing **< 0.5 GB/month** Neon egress |
| At ~50k published quotes | **< 2 GB/month** with snapshot + pagination |

## 2. In-app instrumentation

`GET /api/admin/egress-stats` (admin auth required) returns:

- `runtimeQuotesCacheHits` / `runtimeQuotesCacheMisses` — legacy cache (should stay near zero on public traffic)
- `snapshotRebuilds` — should equal **deploys + admin publish bursts**, not page views
- `snapshotDiskLoads` — cold starts loading `dist/data/published-quotes.json.gz`
- `snapshotMemoryHits` — warm instance serving from memory
- `neonFallbackReads` — should be rare (slug edge cases, admin writes)
- `lastCacheRebuild` — row count and approximate JSON bytes

### Expected healthy pattern

```
snapshotMemoryHits     ↑ on every /api/quotes request (warm instance)
snapshotDiskLoads      ↑ once per cold start (no Neon)
snapshotRebuilds       ↑ only on deploy + admin publish (not per visitor)
runtimeQuotesCacheMisses ≈ 0 for public browsing
```

## 3. Row counts

Check admin stats or run in Neon SQL editor:

```sql
SELECT status, COUNT(*) FROM runtime_quotes GROUP BY status;
```

Pending Wikiquote bloat increases admin egress — use **Delete pending Wikiquote** in admin or:

```
POST /api/admin/quotes/bulk/delete-pending-wikiquote
```

## 4. 48-hour checklist after deploy

- [ ] Neon data transfer curve flattened vs pre-deploy week
- [ ] `snapshotRebuilds` in egress-stats did not climb with page views
- [ ] `/api/quotes?page=1&limit=24` returns paginated JSON (~50–100 KB), not full catalog
- [ ] Cold start (or restart) serves quotes without `runtimeQuotesCacheMisses` spike
- [ ] Build log shows `[export] wrote N quotes` during Render deploy

## 5. What still uses Neon (by design)

| Path | Neon reads |
|------|------------|
| Public quote list / explore / tags | **0** (snapshot) |
| Quote detail (published) | **0** (snapshot) |
| Insights / enrichment | Per-quote lazy read |
| Admin moderation | Paginated queries |
| Auth / bookmarks / comments | Per-user |
| Deploy build export | 1 full published SELECT |
| Admin publish / approve | 1 snapshot rebuild per burst |
