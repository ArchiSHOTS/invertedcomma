/**
 * Wikiquote bulk import — CLI wrapper around the shared core in wikiquote.ts.
 *
 * Inserts attributed quotes (status:'pending', source_type:'wikiquote') into
 * whatever DATABASE_URL points at. Use the Neon DEV branch first.
 *
 *   npx tsx tools/wikiquote-import.mjs              # import (max 60/author)
 *   npx tsx tools/wikiquote-import.mjs --dry-run    # parse + report, no writes
 *   npx tsx tools/wikiquote-import.mjs --max=40     # cap per author
 *
 * The same import also runs from the admin dashboard ("Import from Wikiquote"),
 * which is the easiest way to import into production.
 */
import { importWikiquote } from "../wikiquote.ts";
import { pool } from "../db.ts";

const dryRun = process.argv.includes("--dry-run");
const maxPerAuthor = Number((process.argv.find(a => a.startsWith("--max=")) || "").split("=")[1] || 60);

console.log(`\n[wikiquote] ${dryRun ? "DRY RUN — " : ""}max ${maxPerAuthor}/author\n`);

try {
  const total = await importWikiquote({
    maxPerAuthor,
    dryRun,
    onProgress: ({ page, parsed, kept, total }) =>
      console.log(`  ✓ ${page.padEnd(24)} parsed ${String(parsed).padStart(4)} → kept ${String(kept).padStart(3)}   (total ${total})`),
  });
  console.log(`\n[wikiquote] DONE — ${dryRun ? "would import" : "imported"} ${total} pending quotes.`);
  if (!dryRun) console.log("[wikiquote] Review & approve them in the admin dashboard → Quotes (status: pending).\n");
} catch (e) {
  console.error("[wikiquote] FATAL:", e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
