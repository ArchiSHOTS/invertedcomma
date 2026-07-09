/**
 * One-time (idempotent) migration: copy the code seed quotes into runtime_quotes
 * so they become searchable / editable / deletable from the admin dashboard, and
 * so the database is the single source of truth for every quote.
 *
 * Safe to re-run: ON CONFLICT DO NOTHING skips any row already present (by id or
 * slug). Purely additive — never modifies or deletes existing rows.
 *
 * Run with the production connection string:
 *   DATABASE_URL=... npx tsx tools/migrate-seeds-to-db.mjs
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("[migrate] FATAL: DATABASE_URL not set");
  process.exit(1);
}

// Import via tsx so the TS seed module (and its ../types import) resolves.
// enrichSeedQuotes returns the seed quotes with enriched tags (getEnrichedQuotes
// now returns [] since seeds live in the DB).
const { enrichSeedQuotes } = await import("../src/data/quotes.ts");
const seeds = enrichSeedQuotes();
console.log(`[migrate] ${seeds.length} seed quotes to migrate`);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
});

let inserted = 0;
let skipped = 0;
const base = Date.now();

for (let i = 0; i < seeds.length; i++) {
  const q = seeds[i];
  // Preserve the code array order (first seed = newest) so the curated quotes
  // keep leading the feed after the merge switches to DB order (created_at DESC).
  const createdAt = new Date(base - i * 1000);
  const res = await pool.query(
    `INSERT INTO runtime_quotes
       (id, slug, text, author, source, source_url, year, category, context,
        tags, source_type, status, likes, bookmarks, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT DO NOTHING`,
    [
      q.id, q.slug, q.text, q.author, q.source ?? null, q.sourceUrl ?? null,
      q.year ?? null, q.category ?? null, q.context ?? null, q.tags ?? [],
      q.sourceType ?? "book", "published", q.likes ?? 0, q.bookmarks ?? 0, createdAt,
    ]
  );
  if (res.rowCount > 0) inserted++;
  else skipped++;
}

console.log(`[migrate] inserted ${inserted}, skipped ${skipped} (already present)`);

// Verify every seed id is now present in runtime_quotes.
const ids = seeds.map((q) => q.id);
const { rows: present } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM runtime_quotes WHERE id = ANY($1)`,
  [ids]
);
const { rows: total } = await pool.query(
  `SELECT COUNT(*)::int AS n FROM runtime_quotes WHERE status='published'`
);
console.log(`[migrate] seed ids present in DB: ${present[0].n}/${seeds.length}`);
console.log(`[migrate] runtime_quotes published total: ${total[0].n}`);

await pool.end();

if (present[0].n !== seeds.length) {
  console.error("[migrate] WARNING: not all seed ids are present — do NOT switch getEnrichedQuotes to [] yet.");
  process.exitCode = 1;
}
