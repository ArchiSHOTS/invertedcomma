/**
 * Build-time export: one Neon read per deploy → dist/data/published-quotes.json.gz
 * Run as part of `npm run build` when DATABASE_URL is set.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const LIST_COLS =
  "id, slug, text, author, source, source_url, year, category, context, " +
  "tags, source_type, status, submitted_by, likes, bookmarks, created_at";

async function loadSeedQuotes() {
  const mod = await import("../src/data/quotes.ts");
  return mod.getEnrichedQuotes();
}

function normalizeDbRow(r) {
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
  };
}

function buildTagsIndex(quotes, availableTags) {
  const counts = {};
  for (const q of quotes) {
    for (const tag of q.tags) counts[tag] = (counts[tag] || 0) + 1;
  }
  for (const tag of availableTags) {
    if (!counts[tag]) counts[tag] = 0;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function main() {
  const outDir = path.join(process.cwd(), "dist", "data");
  fs.mkdirSync(outDir, { recursive: true });

  const seeds = await loadSeedQuotes();
  const { AVAILABLE_TAGS } = await import("../src/data/quotes.ts");

  // Guard: without DATABASE_URL the snapshot would contain seed quotes only,
  // hiding every runtime quote from the live site. Fail the build loudly rather
  // than silently shipping a seed-only feed.
  if (!process.env.DATABASE_URL) {
    console.error(
      "\n[export] FATAL: DATABASE_URL is not set at build time.\n" +
      "  A seed-only snapshot would hide every runtime quote from the live site.\n" +
      "  Set DATABASE_URL in the build environment (Render → service → Environment)\n" +
      "  and redeploy.\n"
    );
    process.exit(1);
  }

  let runtime = [];
  let partial = false; // true → DB read failed; the running server self-heals from Neon on first request
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5_000,
  });
  try {
    const { rows } = await pool.query(
      `SELECT ${LIST_COLS} FROM runtime_quotes WHERE status = 'published' ORDER BY created_at DESC`
    );
    runtime = rows.map(normalizeDbRow);
    console.log(`[export] fetched ${runtime.length} published runtime quotes from Neon`);
  } catch (e) {
    partial = true;
    console.warn(
      "[export] Neon read FAILED — writing a PARTIAL (seed-only) snapshot; the running " +
      "server will self-heal from Neon on first request:", e?.message || e
    );
  } finally {
    await pool.end().catch(() => {});
  }

  const seedIds = new Set(seeds.map((q) => q.id));
  const quotes = [...seeds, ...runtime.filter((q) => !seedIds.has(q.id))];
  const tagsIndex = buildTagsIndex(quotes, AVAILABLE_TAGS);
  const payload = { quotes, tagsIndex, partial, generatedAt: new Date().toISOString() };
  const json = JSON.stringify(payload);
  const gz = zlib.gzipSync(json);

  fs.writeFileSync(path.join(outDir, "published-quotes.json"), json);
  fs.writeFileSync(path.join(outDir, "published-quotes.json.gz"), gz);
  fs.writeFileSync(path.join(outDir, "tags-index.json"), JSON.stringify({ tags: tagsIndex, generatedAt: payload.generatedAt }));

  console.log(
    `[export] wrote ${quotes.length} quotes (${Math.round(gz.length / 1024)} KB gz) → dist/data/`
  );
}

main().catch((e) => {
  console.error("[export] FATAL:", e);
  process.exitCode = 1;
});
