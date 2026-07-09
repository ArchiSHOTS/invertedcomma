/**
 * Lightweight Neon egress instrumentation — log-only counters for diagnosing
 * which code paths still hit the database. Inspect via GET /api/admin/egress-stats.
 */

export interface EgressMetrics {
  startedAt: string;
  runtimeQuotesCacheHits: number;
  runtimeQuotesCacheMisses: number;
  snapshotRebuilds: number;
  snapshotDiskLoads: number;
  snapshotMemoryHits: number;
  neonFallbackReads: number;
  endpointDbReads: Record<string, number>;
  lastCacheRebuild: {
    rowCount: number;
    approxBytes: number;
    source: "neon" | "disk" | "memory";
    at: string;
  } | null;
}

const metrics: EgressMetrics = {
  startedAt: new Date().toISOString(),
  runtimeQuotesCacheHits: 0,
  runtimeQuotesCacheMisses: 0,
  snapshotRebuilds: 0,
  snapshotDiskLoads: 0,
  snapshotMemoryHits: 0,
  neonFallbackReads: 0,
  endpointDbReads: {},
  lastCacheRebuild: null,
};

export function recordRuntimeQuotesCacheHit() {
  metrics.runtimeQuotesCacheHits++;
}

export function recordRuntimeQuotesCacheMiss(rowCount: number, approxBytes: number) {
  metrics.runtimeQuotesCacheMisses++;
  metrics.lastCacheRebuild = {
    rowCount,
    approxBytes,
    source: "neon",
    at: new Date().toISOString(),
  };
  console.log(
    `[egress] runtime_quotes Neon read: ${rowCount} rows, ~${Math.round(approxBytes / 1024)} KB`
  );
}

export function recordSnapshotRebuild(rowCount: number, approxBytes: number) {
  metrics.snapshotRebuilds++;
  metrics.lastCacheRebuild = {
    rowCount,
    approxBytes,
    source: "neon",
    at: new Date().toISOString(),
  };
  console.log(
    `[egress] snapshot rebuild from Neon: ${rowCount} quotes, ~${Math.round(approxBytes / 1024)} KB`
  );
}

export function recordSnapshotDiskLoad(rowCount: number, approxBytes: number) {
  metrics.snapshotDiskLoads++;
  metrics.lastCacheRebuild = {
    rowCount,
    approxBytes,
    source: "disk",
    at: new Date().toISOString(),
  };
}

export function recordSnapshotMemoryHit() {
  metrics.snapshotMemoryHits++;
}

export function recordNeonFallbackRead() {
  metrics.neonFallbackReads++;
}

export function recordEndpointDbRead(endpoint: string) {
  metrics.endpointDbReads[endpoint] = (metrics.endpointDbReads[endpoint] || 0) + 1;
}

export function getEgressMetrics(): EgressMetrics {
  return { ...metrics, endpointDbReads: { ...metrics.endpointDbReads } };
}

export function approxJsonBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data), "utf8");
  } catch {
    return 0;
  }
}
