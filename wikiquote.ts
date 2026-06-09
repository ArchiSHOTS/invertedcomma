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

const SKIP_SECTION = /(misattribut|disputed|quotes about|^about\b|see also|external links?|references?|notes?|bibliography|further reading|sources and notes)/i;

async function fetchWikitext(page: string): Promise<string | null> {
  const url = `https://en.wikiquote.org/w/api.php?action=parse&page=${encodeURIComponent(page)}` +
              `&prop=wikitext&format=json&formatversion=2&redirects=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!res.ok) return null;
  const json: any = await res.json();
  if (json.error || !json.parse || !json.parse.wikitext) return null;
  return json.parse.wikitext as string;
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
  if (t.length < 20 || t.length > 400) return false;
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
  imported: number;
  authorsDone: number;
  authorsTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}
export const importStatus: ImportStatus = {
  running: false, imported: 0, authorsDone: 0, authorsTotal: AUTHORS.length,
  startedAt: null, finishedAt: null, error: null,
};

export interface ImportOptions {
  maxPerAuthor?: number;
  dryRun?: boolean;
  onProgress?: (info: { page: string; parsed: number; kept: number; total: number }) => void;
}

/** Run the import. Updates `importStatus` as it goes. Returns the total imported. */
export async function importWikiquote(opts: ImportOptions = {}): Promise<number> {
  const { maxPerAuthor = 60, dryRun = false, onProgress } = opts;

  importStatus.running = true;
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

    let total = 0;
    for (const [page, category] of AUTHORS) {
      let wt: string | null = null;
      try { wt = await fetchWikitext(page); } catch { wt = null; }
      if (wt) {
        const raw = extractRawQuotes(wt);
        const sourceUrl = `https://en.wikiquote.org/wiki/${page.replace(/ /g, "_")}`;
        let kept = 0;
        for (const item of raw) {
          if (kept >= maxPerAuthor) break;
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
        }
        total += kept;
        importStatus.imported = total;
        onProgress?.({ page, parsed: raw.length, kept, total });
      }
      importStatus.authorsDone++;
      await sleep(REQUEST_DELAY_MS);
    }
    return total;
  } catch (e: any) {
    importStatus.error = e?.message || String(e);
    throw e;
  } finally {
    importStatus.running = false;
    importStatus.finishedAt = new Date().toISOString();
  }
}

export { AUTHORS };
