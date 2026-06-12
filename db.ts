/**
 * db.ts — all database operations for Inverted Comma
 * Single Pool, all queries in one place. server.ts imports from here.
 */
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set — add it to .env");
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/** Run at startup — verifies connection is working */
export async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[db] Connected to Neon PostgreSQL ✓");
  } finally {
    client.release();
  }
}

/** Idempotent schema migrations — safe to run on every boot. */
export async function runMigrations() {
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false"
  );
  await pool.query(
    "ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS name TEXT"
  );
  await pool.query(
    "ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'subscribed'"
  );
  // Backfill status for existing rows based on unsubscribed_at
  await pool.query(
    "UPDATE subscribers SET status='unsubscribed' WHERE unsubscribed_at IS NOT NULL AND status='subscribed'"
  );
  // Anatomy: detailed AI-drafted + human-edited deep context for select quotes.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS anatomies (
       quote_id   TEXT PRIMARY KEY,
       data       JSONB   NOT NULL,
       enabled    BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  console.log("[db] Migrations applied ✓");
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  handle: string;
  avatar: string | null;
  bio: string;
  role: string;
  interests: string[];
  saved_quote_ids: string[];
  submitted_quote_ids: string[];
  is_subscribed: boolean;
  anonymous: boolean;
  email_verified: boolean;
  token_version: number;
  created_at: string;
}

/** Convert DB row to the shape the rest of server.ts expects */
export function rowToUser(r: DbUser) {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    displayName: r.display_name,
    handle: r.handle,
    avatar: r.avatar ?? "",
    bio: r.bio ?? "",
    role: r.role,
    interests: r.interests ?? [],
    savedQuoteIds: r.saved_quote_ids ?? [],
    submittedQuoteIds: r.submitted_quote_ids ?? [],
    isSubscribed: r.is_subscribed ?? false,
    anonymous: r.anonymous ?? false,
    emailVerified: r.email_verified ?? false,
    tokenVersion: r.token_version ?? 0,
    createdAt: r.created_at,
  };
}

export async function getUserById(id: string) {
  const { rows } = await pool.query<DbUser>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByEmail(email: string) {
  const { rows } = await pool.query<DbUser>(
    "SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByHandle(handle: string) {
  const { rows } = await pool.query<DbUser>(
    "SELECT * FROM users WHERE handle = $1", [handle]
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getAllUsers() {
  const { rows } = await pool.query<DbUser>("SELECT * FROM users ORDER BY created_at DESC");
  return rows.map(rowToUser);
}

export async function createUser(u: {
  id: string; email: string; passwordHash: string; displayName: string;
  handle: string; avatar: string; interests: string[]; role?: string;
  emailVerified?: boolean;
}) {
  const { rows } = await pool.query<DbUser>(
    `INSERT INTO users (id, email, password_hash, display_name, handle, avatar, interests, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [u.id, u.email.toLowerCase(), u.passwordHash, u.displayName,
     u.handle, u.avatar, u.interests, u.role ?? "user", u.emailVerified ?? false]
  );
  return rowToUser(rows[0]);
}

export async function updateUser(id: string, fields: Partial<{
  email: string; passwordHash: string;
  displayName: string; handle: string; avatar: string; bio: string;
  anonymous: boolean; interests: string[]; isSubscribed: boolean;
  emailVerified: boolean;
  role: string; savedQuoteIds: string[]; tokenVersion: number;
}>) {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (fields.email         !== undefined) { sets.push(`email=$${i++}`);               vals.push(fields.email.toLowerCase()); }
  if (fields.passwordHash  !== undefined) { sets.push(`password_hash=$${i++}`);       vals.push(fields.passwordHash); }
  if (fields.displayName   !== undefined) { sets.push(`display_name=$${i++}`);       vals.push(fields.displayName); }
  if (fields.handle        !== undefined) { sets.push(`handle=$${i++}`);              vals.push(fields.handle); }
  if (fields.avatar        !== undefined) { sets.push(`avatar=$${i++}`);              vals.push(fields.avatar); }
  if (fields.bio           !== undefined) { sets.push(`bio=$${i++}`);                 vals.push(fields.bio); }
  if (fields.anonymous     !== undefined) { sets.push(`anonymous=$${i++}`);           vals.push(fields.anonymous); }
  if (fields.interests     !== undefined) { sets.push(`interests=$${i++}`);           vals.push(fields.interests); }
  if (fields.isSubscribed  !== undefined) { sets.push(`is_subscribed=$${i++}`);       vals.push(fields.isSubscribed); }
  if (fields.emailVerified !== undefined) { sets.push(`email_verified=$${i++}`);       vals.push(fields.emailVerified); }
  if (fields.role          !== undefined) { sets.push(`role=$${i++}`);                vals.push(fields.role); }
  if (fields.savedQuoteIds !== undefined) { sets.push(`saved_quote_ids=$${i++}`);     vals.push(fields.savedQuoteIds); }
  if (fields.tokenVersion  !== undefined) { sets.push(`token_version=$${i++}`);       vals.push(fields.tokenVersion); }
  if (sets.length === 0) return getUserById(id);
  vals.push(id);
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET ${sets.join(", ")} WHERE id=$${i} RETURNING *`, vals
  );
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function deleteUser(id: string) {
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
}

export async function toggleBookmark(userId: string, quoteId: string) {
  const user = await getUserById(userId);
  if (!user) return null;
  const ids = user.savedQuoteIds ?? [];
  const next = ids.includes(quoteId) ? ids.filter(x => x !== quoteId) : [...ids, quoteId];
  return updateUser(userId, { savedQuoteIds: next });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORS
// ─────────────────────────────────────────────────────────────────────────────

export interface DbAuthor {
  slug: string; name: string; full_name: string | null;
  bio: string | null; image_url: string | null;
  born: string | null; died: string | null;
  nationality: string | null; known_for: string | null;
  auto_generated: boolean; enriched_at: string | null;
  created_at: string;
}

export function rowToAuthor(r: DbAuthor) {
  return {
    id: r.slug, slug: r.slug, name: r.name,
    fullName: r.full_name ?? undefined,
    bio: r.bio ?? undefined,
    imageUrl: r.image_url ?? undefined,
    born: r.born ?? undefined, died: r.died ?? undefined,
    nationality: r.nationality ?? undefined,
    knownFor: r.known_for ?? undefined,
    autoGenerated: r.auto_generated,
    enrichedAt: r.enriched_at ?? undefined,
  };
}

export async function getAuthorBySlug(slug: string) {
  const { rows } = await pool.query<DbAuthor>("SELECT * FROM authors WHERE slug=$1", [slug]);
  return rows[0] ? rowToAuthor(rows[0]) : null;
}

export async function getAllAuthors() {
  const { rows } = await pool.query<DbAuthor>("SELECT * FROM authors ORDER BY name");
  return rows.map(rowToAuthor);
}

export async function upsertAuthor(a: {
  slug: string; name: string; fullName?: string; bio?: string; imageUrl?: string;
  born?: string; died?: string; nationality?: string; knownFor?: string;
  autoGenerated?: boolean; enrichedAt?: string;
}) {
  const { rows } = await pool.query<DbAuthor>(
    `INSERT INTO authors (slug, name, full_name, bio, image_url, born, died, nationality, known_for, auto_generated, enriched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (slug) DO UPDATE SET
       name=EXCLUDED.name, full_name=EXCLUDED.full_name, bio=EXCLUDED.bio,
       image_url=EXCLUDED.image_url, born=EXCLUDED.born, died=EXCLUDED.died,
       nationality=EXCLUDED.nationality, known_for=EXCLUDED.known_for,
       auto_generated=EXCLUDED.auto_generated, enriched_at=EXCLUDED.enriched_at
     RETURNING *`,
    [a.slug, a.name, a.fullName ?? null, a.bio ?? null, a.imageUrl ?? null,
     a.born ?? null, a.died ?? null, a.nationality ?? null, a.knownFor ?? null,
     a.autoGenerated ?? false, a.enrichedAt ?? null]
  );
  return rowToAuthor(rows[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME QUOTES
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache for the full runtime_quotes table. This table is read on
// nearly every request (page views, social-preview crawlers, OG image
// generation), so without a cache each one triggers a full-table SELECT
// (including the potentially-large `enrichment` JSONB column). A short TTL
// keeps reads cheap while staying close to real-time for admin edits.
let runtimeQuotesCache: { rows: any[]; expiresAt: number } | null = null;
const RUNTIME_QUOTES_CACHE_TTL_MS = 30_000;

function invalidateRuntimeQuotesCache() {
  runtimeQuotesCache = null;
}

export async function getRuntimeQuotes(status?: string) {
  if (!runtimeQuotesCache || runtimeQuotesCache.expiresAt < Date.now()) {
    const { rows } = await pool.query("SELECT * FROM runtime_quotes ORDER BY created_at DESC");
    runtimeQuotesCache = {
      rows: rows.map((r: any) => ({ ...r, tags: r.tags ?? [] })),
      expiresAt: Date.now() + RUNTIME_QUOTES_CACHE_TTL_MS,
    };
  }
  return status ? runtimeQuotesCache.rows.filter((r: any) => r.status === status) : runtimeQuotesCache.rows;
}

export async function getRuntimeQuoteBySlug(slug: string) {
  const { rows } = await pool.query(
    "SELECT * FROM runtime_quotes WHERE slug=$1 OR id=$1", [slug]
  );
  return rows[0] ?? null;
}

export async function createRuntimeQuote(q: any) {
  const { rows } = await pool.query(
    `INSERT INTO runtime_quotes
     (id, slug, text, author, source, source_url, year, category, context, tags, source_type, status, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [q.id, q.slug, q.text, q.author, q.source ?? null, q.sourceUrl ?? null,
     q.year ?? null, q.category ?? null, q.context ?? null,
     q.tags ?? [], q.sourceType ?? "book", q.status ?? "pending", q.submittedBy ?? null]
  );
  invalidateRuntimeQuotesCache();
  return rows[0];
}

export async function updateRuntimeQuote(id: string, fields: any) {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  const map: Record<string, string> = {
    text: "text", author: "author", source: "source", sourceUrl: "source_url",
    year: "year", category: "category", context: "context", tags: "tags",
    sourceType: "source_type", status: "status", enrichment: "enrichment",
    likes: "likes", bookmarks: "bookmarks",
  };
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(fields[k]); }
  }
  if (!sets.length) return getRuntimeQuoteBySlug(id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE runtime_quotes SET ${sets.join(",")} WHERE id=$${i} OR slug=$${i} RETURNING *`, vals
  );
  invalidateRuntimeQuotesCache();
  return rows[0] ?? null;
}

export async function deleteRuntimeQuote(id: string) {
  await pool.query("DELETE FROM runtime_quotes WHERE id=$1", [id]);
  invalidateRuntimeQuotesCache();
}

/** Apply shared attributes (category, source, sourceUrl, year, extra tags) to many runtime quotes at once. */
export async function bulkEditRuntimeQuotes(
  ids: string[],
  fields: { category?: string; source?: string; sourceUrl?: string; year?: number; addTags?: string[] }
): Promise<number> {
  if (!ids.length) return 0;
  const { category, source, sourceUrl, year, addTags } = fields;
  const { rowCount } = await pool.query(
    `UPDATE runtime_quotes SET
       category   = COALESCE($2, category),
       source     = COALESCE($3, source),
       source_url = COALESCE($4, source_url),
       year       = COALESCE($6, year),
       tags       = CASE WHEN $5::text[] IS NOT NULL
                          THEN (SELECT ARRAY(SELECT DISTINCT unnest(tags || $5::text[])))
                          ELSE tags END
     WHERE id = ANY($1::text[])`,
    [ids, category || null, source || null, sourceUrl || null, addTags && addTags.length ? addTags : null,
     typeof year === "number" ? year : null]
  );
  invalidateRuntimeQuotesCache();
  return rowCount ?? 0;
}

/** Set status on many runtime quotes in a single query (by id list or by current-status filter). */
export async function bulkSetRuntimeQuoteStatus(
  newStatus: string,
  opts: { ids?: string[]; whereStatus?: string; whereSourceType?: string }
): Promise<number> {
  const where: string[] = [];
  const params: any[] = [newStatus];
  if (opts.ids && opts.ids.length) { params.push(opts.ids); where.push(`id = ANY($${params.length}::text[])`); }
  if (opts.whereStatus)     { params.push(opts.whereStatus);     where.push(`status = $${params.length}`); }
  if (opts.whereSourceType) { params.push(opts.whereSourceType); where.push(`source_type = $${params.length}`); }
  if (where.length === 0) return 0;
  const { rowCount } = await pool.query(
    `UPDATE runtime_quotes SET status=$1 WHERE ${where.join(" AND ")}`, params
  );
  invalidateRuntimeQuotesCache();
  return rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS / DISCUSSIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function getComments(quoteId: string) {
  const { rows } = await pool.query(
    "SELECT * FROM comments WHERE quote_id=$1 ORDER BY created_at ASC", [quoteId]
  );
  return rows;
}

export async function createComment(c: {
  id: string; quoteId: string; userId?: string; displayName: string;
  avatar?: string; text: string; anonymous?: boolean;
}) {
  const { rows } = await pool.query(
    `INSERT INTO comments (id, quote_id, user_id, display_name, avatar, text, anonymous)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [c.id, c.quoteId, c.userId ?? null, c.displayName,
     c.avatar ?? null, c.text, c.anonymous ?? false]
  );
  return rows[0];
}

export async function likeComment(commentId: string) {
  const { rows } = await pool.query(
    "UPDATE comments SET likes = likes + 1 WHERE id=$1 RETURNING likes", [commentId]
  );
  return rows[0]?.likes ?? 0;
}

export async function deleteComment(commentId: string) {
  await pool.query("DELETE FROM comments WHERE id=$1", [commentId]);
}

export async function getAllComments() {
  const { rows } = await pool.query(
    "SELECT * FROM comments ORDER BY created_at DESC LIMIT 200"
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBERS
// ─────────────────────────────────────────────────────────────────────────────

function mapSubscriber(row: any) {
  if (!row) return row;
  return {
    id: String(row.id),
    email: row.email,
    name: row.name || "Commarade",
    source: row.source,
    status: row.status,
    subscribedAt: row.subscribed_at,
    unsubscribedAt: row.unsubscribed_at,
  };
}

/** Inserts a new subscriber, or re-activates an existing one (resets status to 'subscribed'). */
export async function addSubscriber(email: string, name?: string, source = "footer") {
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscribers (email, name, source, status)
       VALUES ($1,$2,$3,'subscribed')
       ON CONFLICT (email) DO UPDATE SET
         name=COALESCE(EXCLUDED.name, subscribers.name),
         status='subscribed', unsubscribed_at=NULL
       RETURNING *`,
      [email.toLowerCase(), name || null, source]
    );
    return mapSubscriber(rows[0]);
  } catch { return null; }
}

export async function getAllSubscribers() {
  const { rows } = await pool.query(
    "SELECT * FROM subscribers ORDER BY subscribed_at DESC"
  );
  return rows.map(mapSubscriber);
}

export async function getSubscriberByEmail(email: string) {
  const { rows } = await pool.query(
    "SELECT * FROM subscribers WHERE LOWER(email)=LOWER($1)", [email]
  );
  return mapSubscriber(rows[0]) ?? null;
}

export async function setSubscriberStatus(idOrEmail: string, status: "subscribed" | "unsubscribed" | "spam") {
  const { rows } = await pool.query(
    `UPDATE subscribers SET status=$1, unsubscribed_at=CASE WHEN $1='subscribed' THEN NULL ELSE now() END
     WHERE id::text=$2 OR LOWER(email)=LOWER($2) RETURNING *`,
    [status, idOrEmail]
  );
  return mapSubscriber(rows[0]) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS CACHE
// ─────────────────────────────────────────────────────────────────────────────

export async function getInsight(quoteId: string) {
  const { rows } = await pool.query(
    "SELECT data FROM insights_cache WHERE quote_id=$1", [quoteId]
  );
  return rows[0]?.data ?? null;
}

export async function setInsight(quoteId: string, data: object) {
  await pool.query(
    `INSERT INTO insights_cache (quote_id, data) VALUES ($1,$2)
     ON CONFLICT (quote_id) DO UPDATE SET data=EXCLUDED.data, created_at=now()`,
    [quoteId, JSON.stringify(data)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANATOMY (admin-curated deep context per quote)
// ─────────────────────────────────────────────────────────────────────────────

// Cheap cached set of quote ids that have an enabled anatomy — drives the
// "has anatomy" badge on cards everywhere without bloating quote payloads.
let anatomyIdsCache: { ids: string[]; expiresAt: number } | null = null;
const ANATOMY_IDS_CACHE_TTL_MS = 30_000;

function invalidateAnatomyIdsCache() {
  anatomyIdsCache = null;
}

export async function getAnatomy(quoteId: string) {
  const { rows } = await pool.query(
    "SELECT data, enabled FROM anatomies WHERE quote_id=$1", [quoteId]
  );
  return rows[0] ?? null;
}

export async function upsertAnatomy(quoteId: string, data: object, enabled: boolean) {
  await pool.query(
    `INSERT INTO anatomies (quote_id, data, enabled) VALUES ($1,$2,$3)
     ON CONFLICT (quote_id) DO UPDATE SET data=EXCLUDED.data, enabled=EXCLUDED.enabled, updated_at=now()`,
    [quoteId, JSON.stringify(data), enabled]
  );
  invalidateAnatomyIdsCache();
}

export async function getAnatomyQuoteIds(): Promise<string[]> {
  if (!anatomyIdsCache || anatomyIdsCache.expiresAt < Date.now()) {
    const { rows } = await pool.query("SELECT quote_id FROM anatomies WHERE enabled=true");
    anatomyIdsCache = {
      ids: rows.map((r: any) => r.quote_id),
      expiresAt: Date.now() + ANATOMY_IDS_CACHE_TTL_MS,
    };
  }
  return anatomyIdsCache.ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE LIKES (prevents double-liking)
// ─────────────────────────────────────────────────────────────────────────────

export async function toggleQuoteLike(userId: string, quoteId: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM quote_likes WHERE user_id=$1 AND quote_id=$2", [userId, quoteId]
  );
  if (rows.length > 0) {
    await pool.query("DELETE FROM quote_likes WHERE user_id=$1 AND quote_id=$2", [userId, quoteId]);
    return false; // unliked
  } else {
    await pool.query("INSERT INTO quote_likes (user_id, quote_id) VALUES ($1,$2)", [userId, quoteId]);
    return true;  // liked
  }
}
