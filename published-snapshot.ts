/**
 * Published quote snapshot — serves the public feed from memory/disk, not Neon.
 * Rebuilt on deploy (build script) and on admin publish/write (runtime).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pool } from "./db.ts";
import { getEnrichedQuotes, AVAILABLE_TAGS } from "./src/data/quotes.ts";
import type { Quote } from "./src/types.ts";
import {
  approxJsonBytes,
  recordNeonFallbackRead,
  recordSnapshotDiskLoad,
  recordSnapshotMemoryHit,
  recordSnapshotRebuild,
} from "./egress-metrics.ts";

export const LIST_COLS =
  "id, slug, text, author, source, source_url, year, category, context, " +
  "tags, source_type, status, submitted_by, likes, bookmarks, created_at";

export interface ListQuote {
  id: string;
  slug: string;
  text: string;
  author: string;
  category: string;
  tags: string[];
  sourceType?: string;
  likes: number;
  bookmarks: number;
  year?: number;
  source?: string;
}

export interface QuotesQueryParams {
  page?: number;
  limit?: number;
  tag?: string;
  category?: string;
  sourceType?: string;
  author?: string;
  search?: string;
  slim?: boolean;
}

export interface QuotesListResponse {
  quotes: (ListQuote | Quote)[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SnapshotState {
  quotes: Quote[];
  bySlug: Map<string, Quote>;
  byId: Map<string, Quote>;
  tagsIndex: { name: string; count: number }[];
  loadedAt: number;
  source: "memory" | "disk" | "neon";
  partial?: boolean; // disk snapshot built without a DB read (seed-only) — self-heal from Neon once
}

let snapshot: SnapshotState | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
let selfHealAttempted = false;

function dataDirs(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "data"),
    path.join(cwd, "dist", "data"),
  ];
}

function snapshotPaths(): { json: string; gz: string; tags: string }[] {
  return dataDirs().flatMap((dir) => [
    {
      json: path.join(dir, "published-quotes.json"),
      gz: path.join(dir, "published-quotes.json.gz"),
      tags: path.join(dir, "tags-index.json"),
    },
  ]);
}

/** Normalize a DB row (snake_case) to client Quote shape (camelCase). */
export function normalizeDbRow(r: any): Quote {
  return {
    id: r.id,
    slug: r.slug,
    text: r.text,
    author: r.author,
    source: r.source ?? undefined,
    sourceUrl: r.source_url ?? undefined,
    year: r.year ?? undefined,
    category: r.category ?? "Uncategorized",
    context: r.context ?? undefined,
    tags: r.tags ?? [],
    sourceType: r.source_type ?? "book",
    likes: r.likes ?? 0,
    bookmarks: r.bookmarks ?? 0,
    status: r.status ?? "published",
  } as Quote;
}

export function toListQuote(q: Quote): ListQuote {
  return {
    id: q.id,
    slug: q.slug,
    text: q.text,
    author: q.author,
    category: q.category,
    tags: q.tags,
    sourceType: q.sourceType ?? "book",
    likes: q.likes ?? 0,
    bookmarks: q.bookmarks ?? 0,
    year: q.year,
    source: q.source,
  };
}

export function buildTagsIndex(quotes: Quote[]): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const q of quotes) {
    for (const tag of q.tags) counts[tag] = (counts[tag] || 0) + 1;
  }
  for (const tag of AVAILABLE_TAGS) {
    if (!counts[tag]) counts[tag] = 0;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildIndexMaps(quotes: Quote[]): { bySlug: Map<string, Quote>; byId: Map<string, Quote> } {
  const bySlug = new Map<string, Quote>();
  const byId = new Map<string, Quote>();
  for (const q of quotes) {
    bySlug.set(q.slug, q);
    byId.set(q.id, q);
  }
  return { bySlug, byId };
}

function setSnapshot(quotes: Quote[], source: SnapshotState["source"]) {
  const { bySlug, byId } = buildIndexMaps(quotes);
  snapshot = {
    quotes,
    bySlug,
    byId,
    tagsIndex: buildTagsIndex(quotes),
    loadedAt: Date.now(),
    source,
  };
}

export function mergePublishedQuotes(seedQuotes: Quote[], runtimeRows: any[]): Quote[] {
  const runtime = runtimeRows.map(normalizeDbRow);
  const seedIds = new Set(seedQuotes.map((q) => q.id));
  const runtimeOnly = runtime.filter((q) => !seedIds.has(q.id));
  return [...seedQuotes, ...runtimeOnly];
}

function readGzJson(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = zlib.gunzipSync(fs.readFileSync(filePath));
    return JSON.parse(raw.toString("utf8"));
  } catch (e: any) {
    console.warn(`[snapshot] failed to read ${filePath}:`, e?.message);
    return null;
  }
}

function readJson(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e: any) {
    console.warn(`[snapshot] failed to read ${filePath}:`, e?.message);
    return null;
  }
}

function loadFromDisk(): boolean {
  for (const paths of snapshotPaths()) {
    const payload =
      readGzJson(paths.gz) ??
      readJson(paths.json);
    if (!payload?.quotes) continue;

    const quotes = payload.quotes as Quote[];
    const tagsIndex = payload.tagsIndex ?? buildTagsIndex(quotes);
    const { bySlug, byId } = buildIndexMaps(quotes);
    snapshot = {
      quotes,
      bySlug,
      byId,
      tagsIndex,
      loadedAt: Date.now(),
      source: "disk",
      partial: payload.partial === true,
    };
    recordSnapshotDiskLoad(quotes.length, approxJsonBytes(payload));
    console.log(
      `[snapshot] loaded ${quotes.length} quotes from disk (${paths.gz})` +
      (snapshot.partial ? " — PARTIAL (seed-only), will self-heal from Neon" : "")
    );
    return true;
  }
  return false;
}

async function loadFromNeon(): Promise<boolean> {
  try {
    recordNeonFallbackRead();
    const { rows } = await pool.query(
      `SELECT ${LIST_COLS} FROM runtime_quotes WHERE status = 'published' ORDER BY created_at DESC`
    );
    const quotes = mergePublishedQuotes(getEnrichedQuotes(), rows);
    setSnapshot(quotes, "neon");
    recordSnapshotRebuild(quotes.length, approxJsonBytes(quotes));
    return true;
  } catch (e: any) {
    console.error("[snapshot] Neon fallback read failed:", e?.message);
    return false;
  }
}

// If the on-disk snapshot was built without a DB read (seed-only), rebuild once
// from Neon in the background so the live feed self-heals. Serves the partial
// snapshot immediately; one Neon read upgrades it to the full catalogue.
function maybeSelfHeal() {
  if (selfHealAttempted || !snapshot?.partial) return;
  selfHealAttempted = true;
  console.warn("[snapshot] partial disk snapshot — self-healing from Neon (one-time)…");
  rebuildPublishedSnapshotFromDb().catch((e) =>
    console.error("[snapshot] self-heal rebuild failed:", e?.message)
  );
}

/** Ensure snapshot is loaded: memory → disk → Neon (once). */
export async function ensurePublishedSnapshot(): Promise<SnapshotState> {
  if (snapshot) {
    recordSnapshotMemoryHit();
    return snapshot;
  }
  if (loadFromDisk()) {
    maybeSelfHeal();
    return snapshot!;
  }
  await loadFromNeon();
  if (snapshot) return snapshot;
  // Last resort: seeds only (DB down, no disk file)
  const seeds = getEnrichedQuotes();
  setSnapshot(seeds, "disk");
  return snapshot!;
}

export async function getPublishedSnapshot(): Promise<Quote[]> {
  return (await ensurePublishedSnapshot()).quotes;
}

export async function getPublishedTagsIndex(): Promise<{ name: string; count: number }[]> {
  return (await ensurePublishedSnapshot()).tagsIndex;
}

export async function getPublishedQuoteBySlug(idOrSlug: string): Promise<Quote | null> {
  const s = await ensurePublishedSnapshot();
  return s.bySlug.get(idOrSlug) ?? s.byId.get(idOrSlug) ?? null;
}

export async function getPublishedQuoteBySlugFromDb(idOrSlug: string): Promise<Quote | null> {
  try {
    recordNeonFallbackRead();
    const { rows } = await pool.query(
      `SELECT ${LIST_COLS} FROM runtime_quotes WHERE (slug=$1 OR id=$1) AND status='published' LIMIT 1`,
      [idOrSlug]
    );
    return rows[0] ? normalizeDbRow(rows[0]) : null;
  } catch (e: any) {
    console.error("[snapshot] slug fallback read failed:", e?.message);
    return null;
  }
}

export async function resolvePublishedQuote(idOrSlug: string): Promise<Quote | null> {
  const fromSnapshot = await getPublishedQuoteBySlug(idOrSlug);
  if (fromSnapshot) return fromSnapshot;
  return getPublishedQuoteBySlugFromDb(idOrSlug);
}

export function filterQuotes(quotes: Quote[], params: QuotesQueryParams): Quote[] {
  const tag = params.tag?.toLowerCase();
  const category = params.category;
  const sourceType = params.sourceType;
  const author = params.author?.toLowerCase();
  const search = params.search?.trim().toLowerCase();

  return quotes.filter((q) => {
    if (tag && !q.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (category && q.category !== category) return false;
    if (sourceType && (q.sourceType ?? "book") !== sourceType) return false;
    if (author && q.author.toLowerCase() !== author) return false;
    if (search) {
      const hay = [
        q.text,
        q.author,
        q.category,
        q.source ?? "",
        ...q.tags,
      ].join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export function paginateQuotesList(
  quotes: Quote[],
  params: QuotesQueryParams,
  slim = true
): QuotesListResponse {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 24));
  const filtered = filterQuotes(quotes, params);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const slice = filtered.slice((page - 1) * limit, page * limit);
  const useSlim = params.slim !== false && slim;
  return {
    quotes: useSlim ? slice.map(toListQuote) : slice,
    total,
    page,
    limit,
    totalPages,
  };
}

export function writeSnapshotFiles(quotes: Quote[], tagsIndex?: { name: string; count: number }[]) {
  const tags = tagsIndex ?? buildTagsIndex(quotes);
  const payload = { quotes, tagsIndex: tags, generatedAt: new Date().toISOString() };
  const json = JSON.stringify(payload);
  const gz = zlib.gzipSync(json);

  for (const dir of dataDirs()) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "published-quotes.json"), json);
      fs.writeFileSync(path.join(dir, "published-quotes.json.gz"), gz);
      fs.writeFileSync(path.join(dir, "tags-index.json"), JSON.stringify({ tags, generatedAt: payload.generatedAt }));
    } catch (e: any) {
      console.warn(`[snapshot] could not write to ${dir}:`, e?.message);
    }
  }
}

/** Rebuild snapshot from Neon + seeds; write to disk and memory. */
export async function rebuildPublishedSnapshotFromDb(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT ${LIST_COLS} FROM runtime_quotes WHERE status = 'published' ORDER BY created_at DESC`
  );
  const quotes = mergePublishedQuotes(getEnrichedQuotes(), rows);
  const tagsIndex = buildTagsIndex(quotes);
  setSnapshot(quotes, "neon");
  writeSnapshotFiles(quotes, tagsIndex);
  recordSnapshotRebuild(quotes.length, approxJsonBytes(quotes));
  return quotes.length;
}

/** Debounced rebuild after admin writes — one Neon read per burst. */
export function scheduleSnapshotRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    rebuildPublishedSnapshotFromDb().catch((e) =>
      console.error("[snapshot] scheduled rebuild failed:", e?.message)
    );
  }, 1000);
}

/** Force-clear in-memory snapshot (e.g. after bulk delete). */
export function invalidatePublishedSnapshot() {
  snapshot = null;
}
