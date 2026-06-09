/**
 * Wikiquote bulk import — grows the quote library with attributed quotes.
 *
 * Pulls quotes from the Wikiquote MediaWiki API for a curated author list,
 * cleans the wikitext, deduplicates against the seed quotes (src/data/quotes.ts)
 * AND existing runtime_quotes, and inserts them directly via createRuntimeQuote()
 * with status:'pending' and source_type:'wikiquote' for review/traceability.
 *
 * Run (against whatever DATABASE_URL points at — use the Neon DEV branch first):
 *   npx tsx tools/wikiquote-import.mjs              # import
 *   npx tsx tools/wikiquote-import.mjs --dry-run    # parse + report, no writes
 *   npx tsx tools/wikiquote-import.mjs --max=40     # cap per author (default 70)
 *
 * Notes:
 *  - 500ms delay between API calls (Wikimedia etiquette).
 *  - Idempotent: re-running won't duplicate (dedupes against what's already stored).
 *  - Quotes go in as 'pending' — approve them in the admin dashboard.
 */
import { getRuntimeQuotes, createRuntimeQuote, pool } from "../db.ts";
import { getEnrichedQuotes } from "../src/data/quotes.ts";

// ── CLI flags ─────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");
const MAX_PER_AUTHOR = Number(
  (process.argv.find(a => a.startsWith("--max=")) || "").split("=")[1] || 70
);
const REQUEST_DELAY_MS = 500;
const UA = "InvertedCommaImporter/1.0 (https://invertedcomma.com; admin@invertedcomma.com)";

// ── Curated authors → our category (page title must match Wikiquote exactly) ──
const AUTHORS = [
  // Philosophy & Stoicism
  ["Marcus Aurelius", "Philosophy & Stoicism"],
  ["Seneca the Younger", "Philosophy & Stoicism"],
  ["Epictetus", "Philosophy & Stoicism"],
  ["Friedrich Nietzsche", "Philosophy & Stoicism"],
  ["Arthur Schopenhauer", "Philosophy & Stoicism"],
  ["Søren Kierkegaard", "Philosophy & Stoicism"],
  ["Plato", "Philosophy & Stoicism"],
  ["Aristotle", "Philosophy & Stoicism"],
  ["Confucius", "Philosophy & Stoicism"],
  ["Bertrand Russell", "Philosophy & Stoicism"],
  // Literature & Writing
  ["Oscar Wilde", "Literature & Writing"],
  ["Mark Twain", "Literature & Writing"],
  ["Fyodor Dostoevsky", "Literature & Writing"],
  ["Franz Kafka", "Literature & Writing"],
  ["Virginia Woolf", "Literature & Writing"],
  ["Ernest Hemingway", "Literature & Writing"],
  ["Leo Tolstoy", "Literature & Writing"],
  ["Jane Austen", "Literature & Writing"],
  ["William Shakespeare", "Literature & Writing"],
  ["George Orwell", "Literature & Writing"],
  // Science & Technology
  ["Albert Einstein", "Science & Technology"],
  ["Richard Feynman", "Science & Technology"],
  ["Carl Sagan", "Science & Technology"],
  ["Charles Darwin", "Science & Technology"],
  ["Nikola Tesla", "Science & Technology"],
  ["Isaac Newton", "Science & Technology"],
  ["Galileo Galilei", "Science & Technology"],
  // Psychology & Mind
  ["Carl Jung", "Psychology & Mind"],
  ["Sigmund Freud", "Psychology & Mind"],
  ["William James", "Psychology & Mind"],
  // History & Politics
  ["Winston Churchill", "History & Politics"],
  ["Abraham Lincoln", "History & Politics"],
  ["Mahatma Gandhi", "History & Politics"],
  ["Nelson Mandela", "History & Politics"],
  ["Martin Luther King Jr.", "History & Politics"],
  ["Theodore Roosevelt", "History & Politics"],
  // Creativity & Art
  ["Pablo Picasso", "Creativity & Art"],
  ["Leonardo da Vinci", "Creativity & Art"],
  ["Vincent van Gogh", "Creativity & Art"],
  // Business & Entrepreneurship
  ["Steve Jobs", "Business & Entrepreneurship"],
  ["Henry Ford", "Business & Entrepreneurship"],
  // Society & Change
  ["Voltaire", "Society & Change"],
  ["Ralph Waldo Emerson", "Society & Change"],
  ["Henry David Thoreau", "Society & Change"],
];

// Section headings to skip entirely (misattributed/about-others/meta).
const SKIP_SECTION = /(misattribut|disputed|quotes about|^about\b|see also|external links?|references?|notes?|bibliography|further reading|sources and notes)/i;

// ── Wikiquote fetch ───────────────────────────────────────────────────────────
async function fetchWikitext(page) {
  const url = `https://en.wikiquote.org/w/api.php?action=parse&page=${encodeURIComponent(page)}` +
              `&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.error || !json.parse || !json.parse.wikitext) return null;
  return json.parse.wikitext;
}

// ── Wikitext → list of { raw, sourceRaw } ─────────────────────────────────────
function extractRawQuotes(wikitext) {
  const out = [];
  let skip = false;
  for (const line of wikitext.split("\n")) {
    const heading = line.match(/^(={2,})\s*(.+?)\s*\1\s*$/);
    if (heading) { skip = SKIP_SECTION.test(heading[2]); continue; }
    if (skip) continue;
    if (/^\*\*+/.test(line)) {                       // sub-bullet → source/attribution
      if (out.length && !out[out.length - 1].sourceRaw) {
        out[out.length - 1].sourceRaw = line.replace(/^\*+/, "").trim();
      }
      continue;
    }
    const m = line.match(/^\*\s+(.*\S)\s*$/);          // single-asterisk → a quote
    if (m) out.push({ raw: m[1], sourceRaw: "" });
  }
  return out;
}

// ── Clean wiki markup → plain text ────────────────────────────────────────────
function clean(s) {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // templates: drop innermost {{...}} repeatedly (handles a couple of levels)
  for (let i = 0; i < 4 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  // links
  t = t.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1");   // [[a|b]] → b
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");            // [[a]]  → a
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1"); // [url text] → text
  t = t.replace(/\[https?:\/\/\S+\]/g, "");            // [url] → ''
  // emphasis
  t = t.replace(/'''''|'''|''/g, "");
  // html + entities
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
       .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'");
  t = t.replace(/\s+/g, " ").trim();
  // strip wrapping quotation marks
  t = t.replace(/^["“”']+|["“”']+$/g, "").trim();
  return t;
}

// Skip non-English primaries. Many translated authors (Voltaire, Nietzsche,
// Einstein, Picasso…) list the original-language quote as the main bullet with
// the English translation demoted to a sub-bullet — importing the original is
// wrong. Detect via common French/German/Spanish stopwords (none of which are
// English words); 2+ distinct hits ⇒ treat as non-English.
const NON_EN_WORDS = new Set((
  // French
  "le les un une des qui que dans pour avec pas cette est sont toujours quand " +
  "rien tout mais comme sans faut leur vous nous aussi plus " +
  // German
  "die der das und nicht ist sich dass ein eine von dem den mit auch wie nur " +
  "aber wenn wird sind uns vom zwar zur zum " +
  // Spanish
  "el los las por con para como pero más esta este tiene alguien existe"
).split(/\s+/));

// Common English function words — a real English sentence almost always has one.
const EN_WORDS = new Set((
  "the a an of to and is in that it you for be this with his her we not are as " +
  "at by or but from have has was were will would can do if on my your our who " +
  "what which when how all one no so out about into than then them they he she " +
  "me him us its more most such only own same too very just i"
).split(/\s+/));

function looksNonEnglish(t) {
  if (/[Ѐ-ӿͰ-Ͽ一-鿿぀-ヿ؀-ۿ֐-׿]/.test(t)) return true;          // Cyrillic/Greek/CJK/Arabic/Hebrew
  const words = t.toLowerCase().match(/[a-zà-ÿ']+/g) || [];
  let nonEn = new Set(), enHits = 0;
  for (const w of words) {
    if (NON_EN_WORDS.has(w)) nonEn.add(w);
    if (EN_WORDS.has(w)) enHits++;
  }
  if (nonEn.size >= 2) return true;                 // 2+ FR/DE/ES stopwords
  if (t.length > 30 && enHits === 0) return true;   // no English function word ⇒ Latin/other
  return false;
}

// ── Quality filter ────────────────────────────────────────────────────────────
function isGoodQuote(t) {
  if (t.length < 20 || t.length > 400) return false;
  if (/[{}|]|\[\[|\]\]|https?:\/\//.test(t)) return false;  // leftover markup
  if (/^[a-z]/.test(t)) return false;                        // should start capitalised
  if (!/[.?!"”]$/.test(t)) return false;                     // should look like a finished sentence
  if (looksNonEnglish(t)) return false;                      // skip original-language primaries
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < t.length * 0.5) return false;                // mostly symbols/numbers → skip
  return true;
}

const YEAR_RE = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

function slugify(text, author) {
  return `${text.slice(0, 40)} ${author}`.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
    + "-" + Math.random().toString(36).slice(2, 6);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[wikiquote] ${DRY_RUN ? "DRY RUN — " : ""}max ${MAX_PER_AUTHOR}/author, ${AUTHORS.length} authors\n`);

  // Build the dedup set from seed quotes + existing runtime quotes.
  const seed = getEnrichedQuotes();
  const runtime = await getRuntimeQuotes();
  const seen = new Set([...seed, ...runtime].map(q => norm(q.text)));
  console.log(`[wikiquote] dedup baseline: ${seed.length} seed + ${runtime.length} runtime = ${seen.size} unique\n`);

  let grandTotal = 0;

  for (const [page, category] of AUTHORS) {
    let wt;
    try { wt = await fetchWikitext(page); }
    catch (e) { console.warn(`  ✗ ${page}: fetch error ${e.message}`); await sleep(REQUEST_DELAY_MS); continue; }
    if (!wt) { console.warn(`  ✗ ${page}: not found / no wikitext`); await sleep(REQUEST_DELAY_MS); continue; }

    const raw = extractRawQuotes(wt);
    const sourceUrl = `https://en.wikiquote.org/wiki/${page.replace(/ /g, "_")}`;
    let kept = 0;

    for (const item of raw) {
      if (kept >= MAX_PER_AUTHOR) break;
      const text = clean(item.raw);
      if (!isGoodQuote(text)) continue;
      const key = norm(text);
      if (seen.has(key)) continue;
      seen.add(key);

      const src = clean(item.sourceRaw || "");
      const yearMatch = (src.match(YEAR_RE) || item.sourceRaw.match(YEAR_RE));
      const year = yearMatch ? Number(yearMatch[1]) : null;

      if (!DRY_RUN) {
        await createRuntimeQuote({
          id: `q_wq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          slug: slugify(text, page),
          text,
          author: page,
          source: src.slice(0, 160),
          sourceUrl,
          year,
          category,
          context: "",
          tags: [],
          sourceType: "wikiquote",
          status: "pending",
          submittedBy: null,
        });
      }
      kept++;
    }

    grandTotal += kept;
    console.log(`  ✓ ${page.padEnd(24)} parsed ${String(raw.length).padStart(4)} → kept ${String(kept).padStart(3)}   (total ${grandTotal})`);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n[wikiquote] DONE — ${DRY_RUN ? "would import" : "imported"} ${grandTotal} pending quotes.`);
  if (!DRY_RUN) console.log("[wikiquote] Review & approve them in the admin dashboard → Quotes (status: pending).\n");
  await pool.end();
}

main().catch(async (e) => { console.error("[wikiquote] FATAL:", e); try { await pool.end(); } catch {} process.exit(1); });
