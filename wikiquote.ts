/**
 * Wikiquote import core — shared by the CLI (tools/wikiquote-import.mjs) and the
 * admin dashboard ("Import from Wikiquote" button → POST /api/admin/import-wikiquote).
 *
 * Pulls quotes from the Wikiquote MediaWiki API for a curated author list, cleans
 * the wikitext, filters to quality English quotes, dedupes against seed quotes
 * (src/data/quotes.ts) AND existing runtime_quotes, and inserts them via
 * createRuntimeQuote() with status:'pending' and source_type:'wikiquote'.
 *
 * NOTE: never calls pool.end() — the server keeps the pool open. The CLI closes it.
 */
import { getRuntimeQuotes, createRuntimeQuote } from "./db.ts";
import { getEnrichedQuotes } from "./src/data/quotes.ts";

const REQUEST_DELAY_MS = 500;
const UA = "InvertedCommaImporter/1.0 (https://invertedcomma.com; admin@invertedcomma.com)";

// Curated authors → our category (page title must match Wikiquote exactly).
const AUTHORS: [string, string][] = [
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
  ["Albert Einstein", "Science & Technology"],
  ["Richard Feynman", "Science & Technology"],
  ["Carl Sagan", "Science & Technology"],
  ["Charles Darwin", "Science & Technology"],
  ["Nikola Tesla", "Science & Technology"],
  ["Isaac Newton", "Science & Technology"],
  ["Galileo Galilei", "Science & Technology"],
  ["Carl Jung", "Psychology & Mind"],
  ["Sigmund Freud", "Psychology & Mind"],
  ["William James", "Psychology & Mind"],
  ["Winston Churchill", "History & Politics"],
  ["Abraham Lincoln", "History & Politics"],
  ["Mahatma Gandhi", "History & Politics"],
  ["Nelson Mandela", "History & Politics"],
  ["Martin Luther King Jr.", "History & Politics"],
  ["Theodore Roosevelt", "History & Politics"],
  ["Pablo Picasso", "Creativity & Art"],
  ["Leonardo da Vinci", "Creativity & Art"],
  ["Vincent van Gogh", "Creativity & Art"],
  ["Steve Jobs", "Business & Entrepreneurship"],
  ["Henry Ford", "Business & Entrepreneurship"],
  ["Voltaire", "Society & Change"],
  ["Ralph Waldo Emerson", "Society & Change"],
  ["Henry David Thoreau", "Society & Change"],
];

// Wikiquote category tree → our site category. The crawler walks each root and its
// subcategories (depth-limited) to discover authors far beyond the curated seed
// above. Wikiquote category titles must match exactly; a root that returns nothing
// is logged and skipped, so the seed authors still import. Earlier roots win when
// the same author appears under multiple categories.
const ROOT_CATEGORIES: [string, string][] = [
  ["Philosophers",   "Philosophy & Stoicism"],
  ["Writers",        "Literature & Writing"],
  ["Authors",        "Literature & Writing"],
  ["Poets",          "Literature & Writing"],
  ["Scientists",     "Science & Technology"],
  ["Physicists",     "Science & Technology"],
  ["Psychologists",  "Psychology & Mind"],
  ["Political leaders", "Leadership"],
  ["Entrepreneurs",  "Business & Entrepreneurship"],
  ["Businesspeople", "Business & Entrepreneurship"],
  ["Designers",      "Design & Architecture"],
  ["Artists",        "Creativity & Art"],
  ["Religious figures", "Spirituality"],
  ["Spiritual teachers", "Spirituality"],
];

const SKIP_SECTION = /(misattribut|disputed|quotes about|^about\b|see also|external links?|references?|notes?|bibliography|further reading|sources and notes)/i;

// Category/page titles that are clearly not a quotable person — skip during crawl.
const SKIP_PAGE = /^(List of|Lists of|Index of|Wikiquote:|Template:|Portal:|Category:)/i;

async function fetchWikitext(page: string): Promise<string | null> {
  const url = `https://en.wikiquote.org/w/api.php?action=parse&page=${encodeURIComponent(page)}` +
              `&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) return null;
  const json: any = await res.json();
  if (json.error || !json.parse || !json.parse.wikitext) return null;
  return json.parse.wikitext as string;
}

// List members of a Wikiquote category. `type` is "page" (articles → authors) or
// "subcat" (child categories). Follows continuation up to `maxPages` of results.
async function fetchCategoryMembers(
  category: string, type: "page" | "subcat", maxPages = 5,
): Promise<string[]> {
  const titles: string[] = [];
  let cont: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = `https://en.wikiquote.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent("Category:" + category)}` +
      `&cmtype=${type}&cmlimit=500&format=json&formatversion=2` +
      (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
    let json: any = null;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
      if (!res.ok) break;
      json = await res.json();
    } catch { break; }
    for (const m of json?.query?.categorymembers || []) {
      const title = String(m.title || "");
      if (type === "subcat") titles.push(title.replace(/^Category:/, ""));
      else if (!SKIP_PAGE.test(title)) titles.push(title);
    }
    cont = json?.continue?.cmcontinue;
    if (!cont) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return titles;
}

// Walk each root category (and subcategories, depth-limited) to build a deduped
// author → site-category map. Seeded with the curated AUTHORS so a mistyped or
// empty Wikiquote root never costs us the reliable base set. Stops once `maxAuthors`
// distinct authors are found.
async function discoverAuthors(
  maxDepth: number, maxAuthors: number,
  onProgress?: (info: { category: string; found: number }) => void,
): Promise<Map<string, string>> {
  const authors = new Map<string, string>();
  for (const [page, cat] of AUTHORS) authors.set(page, cat);

  const visited = new Set<string>();
  // Queue of [categoryTitle, siteCategory, depth]
  const queue: [string, string, number][] = ROOT_CATEGORIES.map(([c, our]) => [c, our, 0]);

  while (queue.length && authors.size < maxAuthors) {
    const [cat, ourCat, depth] = queue.shift()!;
    if (visited.has(cat)) continue;
    visited.add(cat);

    const pages = await fetchCategoryMembers(cat, "page");
    for (const p of pages) { if (!authors.has(p)) authors.set(p, ourCat); }
    onProgress?.({ category: cat, found: authors.size });
    await sleep(REQUEST_DELAY_MS);

    if (depth < maxDepth) {
      const subs = await fetchCategoryMembers(cat, "subcat");
      for (const s of subs) if (!visited.has(s)) queue.push([s, ourCat, depth + 1]);
      await sleep(REQUEST_DELAY_MS);
    }
  }
  return authors;
}

function extractRawQuotes(wikitext: string): { raw: string; sourceRaw: string }[] {
  const out: { raw: string; sourceRaw: string }[] = [];
  let skip = false;
  for (const line of wikitext.split("\n")) {
    const heading = line.match(/^(={2,})\s*(.+?)\s*\1\s*$/);
    if (heading) { skip = SKIP_SECTION.test(heading[2]); continue; }
    if (skip) continue;
    if (/^\*\*+/.test(line)) {
      if (out.length && !out[out.length - 1].sourceRaw) out[out.length - 1].sourceRaw = line.replace(/^\*+/, "").trim();
      continue;
    }
    const m = line.match(/^\*\s+(.*\S)\s*$/);
    if (m) out.push({ raw: m[1], sourceRaw: "" });
  }
  return out;
}

function clean(s: string): string {
  let t = s;
  t = t.replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(/<ref[^>]*\/>/gi, "");
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  for (let i = 0; i < 4 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  t = t.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[\[([^\]]+)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\]/g, "");
  t = t.replace(/'''''|'''|''/g, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
       .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^["“”']+|["“”']+$/g, "").trim();
  return t;
}

const NON_EN_WORDS = new Set((
  "le les un une des qui que dans pour avec pas cette est sont toujours quand " +
  "rien tout mais comme sans faut leur vous nous aussi plus " +
  "die der das und nicht ist sich dass ein eine von dem den mit auch wie nur " +
  "aber wenn wird sind uns vom zwar zur zum " +
  "el los las por con para como pero más esta este tiene alguien existe"
).split(/\s+/));

const EN_WORDS = new Set((
  "the a an of to and is in that it you for be this with his her we not are as " +
  "at by or but from have has was were will would can do if on my your our who " +
  "what which when how all one no so out about into than then them they he she " +
  "me him us its more most such only own same too very just i"
).split(/\s+/));

function looksNonEnglish(t: string): boolean {
  if (/[Ѐ-ӿͰ-Ͽ一-鿿぀-ヿ؀-ۿ֐-׿]/.test(t)) return true;
  const words = t.toLowerCase().match(/[a-zà-ÿ']+/g) || [];
  const nonEn = new Set<string>(); let enHits = 0;
  for (const w of words) { if (NON_EN_WORDS.has(w)) nonEn.add(w); if (EN_WORDS.has(w)) enHits++; }
  if (nonEn.size >= 2) return true;
  if (t.length > 30 && enHits === 0) return true;
  return false;
}

function isGoodQuote(t: string): boolean {
  // 30–180 chars: long enough to be a real quote, short enough to sit comfortably
  // inside the share card (which hard-truncates at 220) with breathing room.
  if (t.length < 30 || t.length > 180) return false;
  if (/[{}|]|\[\[|\]\]|https?:\/\//.test(t)) return false;
  if (/^[a-z]/.test(t)) return false;
  if (!/[.?!"”]$/.test(t)) return false;
  if (looksNonEnglish(t)) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < t.length * 0.5) return false;
  return true;
}

const YEAR_RE = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const slugify = (text: string, author: string) =>
  `${text.slice(0, 40)} ${author}`.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()
    + "-" + Math.random().toString(36).slice(2, 6);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Live status (for the admin UI to poll) ────────────────────────────────────
export interface ImportStatus {
  running: boolean;
  phase: "idle" | "discovering" | "importing" | "done";
  imported: number;
  authorsDone: number;
  authorsTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}
export const importStatus: ImportStatus = {
  running: false, phase: "idle", imported: 0, authorsDone: 0, authorsTotal: AUTHORS.length,
  startedAt: null, finishedAt: null, error: null,
};

export interface ImportOptions {
  maxPerAuthor?: number;   // cap quotes kept per author
  targetCount?: number;    // stop once this many NEW quotes are imported
  maxDepth?: number;       // category-tree recursion depth
  maxAuthors?: number;     // cap on authors discovered (bounds crawl time)
  dryRun?: boolean;
  onProgress?: (info: { page: string; parsed: number; kept: number; total: number }) => void;
}

/** Run the import. Updates `importStatus` as it goes. Returns the total imported. */
export async function importWikiquote(opts: ImportOptions = {}): Promise<number> {
  const {
    maxPerAuthor = 40,
    targetCount  = 200,  // curated monthly imports, not bulk
    maxDepth     = 2,
    maxAuthors   = 2000,
    dryRun = false, onProgress,
  } = opts;

  importStatus.running = true;
  importStatus.phase = "discovering";
  importStatus.imported = 0;
  importStatus.authorsDone = 0;
  importStatus.authorsTotal = AUTHORS.length;
  importStatus.startedAt = new Date().toISOString();
  importStatus.finishedAt = null;
  importStatus.error = null;

  try {
    const seed = getEnrichedQuotes();
    const runtime = await getRuntimeQuotes();
    const seen = new Set([...seed, ...runtime].map((q: any) => norm(q.text)));

    // Phase 1 — discover the author pool by crawling the category tree.
    const authorMap = await discoverAuthors(maxDepth, maxAuthors, ({ found }) => {
      importStatus.authorsTotal = found;
    });
    const authorList = [...authorMap.entries()]; // [page, siteCategory][]

    // Phase 2 — pull quotes per author until we hit the target count.
    importStatus.phase = "importing";
    importStatus.authorsTotal = authorList.length;

    let total = 0;
    for (const [page, category] of authorList) {
      if (total >= targetCount) break;
      let wt: string | null = null;
      try { wt = await fetchWikitext(page); } catch { wt = null; }
      if (wt) {
        const raw = extractRawQuotes(wt);
        const sourceUrl = `https://en.wikiquote.org/wiki/${page.replace(/ /g, "_")}`;
        let kept = 0;
        for (const item of raw) {
          if (kept >= maxPerAuthor || total >= targetCount) break;
          const text = clean(item.raw);
          if (!isGoodQuote(text)) continue;
          const key = norm(text);
          if (seen.has(key)) continue;
          seen.add(key);
          const src = clean(item.sourceRaw || "");
          const ym = src.match(YEAR_RE) || item.sourceRaw.match(YEAR_RE);
          if (!dryRun) {
            await createRuntimeQuote({
              id: `q_wq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              slug: slugify(text, page),
              text, author: page,
              source: src.slice(0, 160), sourceUrl,
              year: ym ? Number(ym[1]) : null,
              category, context: "", tags: [],
              sourceType: "wikiquote", status: "pending", submittedBy: null,
            });
          }
          kept++;
          total++;
        }
        importStatus.imported = total;
        onProgress?.({ page, parsed: raw.length, kept, total });
      }
      importStatus.authorsDone++;
      await sleep(REQUEST_DELAY_MS);
    }
    importStatus.phase = "done";
    return total;
  } catch (e: any) {
    importStatus.error = e?.message || String(e);
    throw e;
  } finally {
    importStatus.running = false;
    importStatus.finishedAt = new Date().toISOString();
  }
}

export { AUTHORS, ROOT_CATEGORIES };
