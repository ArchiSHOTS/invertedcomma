import { useEffect, useState } from "react";

// Shared, cached set of quote ids that have an enabled anatomy. One fetch powers
// the "has anatomy" badge on every card, regardless of where the quote came from.
let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const subscribers = new Set<(ids: Set<string>) => void>();

async function load(force = false): Promise<Set<string>> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;
  inflight = fetch("/api/anatomies/ids")
    .then(r => (r.ok ? r.json() : { ids: [] }))
    .then(d => {
      cache = new Set<string>(d.ids || []);
      subscribers.forEach(fn => fn(cache!));
      return cache;
    })
    .catch(() => {
      cache = new Set<string>();
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Force a refresh after an anatomy is created/updated/disabled. */
export function refreshAnatomyIds() {
  load(true);
}

export function useAnatomyIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(cache ?? new Set());
  useEffect(() => {
    const fn = (next: Set<string>) => setIds(next);
    subscribers.add(fn);
    load().then(setIds);
    return () => { subscribers.delete(fn); };
  }, []);
  return ids;
}
