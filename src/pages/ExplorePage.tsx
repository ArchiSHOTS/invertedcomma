import React, { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BookOpen, Film, Mic2, FileText, Newspaper, MessageCircle,
  Feather, Hash, Search, X, RefreshCw, ChevronRight, Sparkles,
} from "lucide-react";
import { Quote, SourceType } from "../types";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

// ── Source type metadata ────────────────────────────────────────────────────
const SOURCE_TYPES: {
  key: SourceType | "all";
  label: string;
  Icon: React.ElementType;
  description: string;
  color: string;
}[] = [
  { key: "all",       label: "All Sources",  Icon: Sparkles,       description: "Every quote in our library",         color: "bg-stone-100 text-stone-700" },
  { key: "book",      label: "Books",        Icon: BookOpen,       description: "Classic & modern literature",         color: "bg-amber-50 text-amber-800" },
  { key: "movie",     label: "Movies",       Icon: Film,           description: "Cinema's most memorable lines",       color: "bg-blue-50 text-blue-800" },
  { key: "speech",    label: "Speeches",     Icon: Mic2,           description: "Historic addresses & talks",          color: "bg-purple-50 text-purple-800" },
  { key: "essay",     label: "Essays",       Icon: FileText,       description: "Long-form thought & argument",        color: "bg-green-50 text-green-800" },
  { key: "poem",      label: "Poetry",       Icon: Feather,        description: "Verse & lyrical writing",             color: "bg-rose-50 text-rose-800" },
  { key: "article",   label: "Articles",     Icon: Newspaper,      description: "Journalism & published writing",      color: "bg-cyan-50 text-cyan-800" },
  { key: "interview", label: "Interviews",   Icon: MessageCircle,  description: "Conversations & profiles",            color: "bg-orange-50 text-orange-800" },
];

const SOURCE_ICON_MAP: Record<string, React.ElementType> = {
  book: BookOpen,
  movie: Film,
  speech: Mic2,
  essay: FileText,
  poem: Feather,
  article: Newspaper,
  interview: MessageCircle,
  tweet: Hash,
  unknown: Sparkles,
};

function SourceBadge({ type }: { type: SourceType }) {
  const Icon = SOURCE_ICON_MAP[type] ?? Sparkles;
  const meta = SOURCE_TYPES.find(s => s.key === type);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${meta?.color ?? "bg-stone-100 text-stone-600"}`}>
      <Icon className="w-2.5 h-2.5" />
      {meta?.label ?? type}
    </span>
  );
}

// ── Quote card for the explore grid ────────────────────────────────────────
function ExploreQuoteCard({ quote, onTagClick }: { quote: Quote; onTagClick: (t: string) => void }) {
  return (
    <Link
      to={`/q/${quote.slug}`}
      className="group flex flex-col gap-3 bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-md hover:border-stone-300 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <SourceBadge type={quote.sourceType ?? "book"} />
        {quote.year && (
          <span className="text-[10px] font-mono text-stone-400 flex-shrink-0">{quote.year < 0 ? `${Math.abs(quote.year)} BC` : quote.year}</span>
        )}
      </div>

      <blockquote className="font-serif italic text-stone-800 text-sm leading-relaxed line-clamp-4">
        "{quote.text}"
      </blockquote>

      <div className="mt-auto pt-2 border-t border-stone-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-stone-800">{quote.author}</p>
          {quote.source && (
            <p className="text-[10px] text-stone-400 truncate max-w-[160px]">{quote.source}</p>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-500 transition-colors" />
      </div>

      <div className="flex flex-wrap gap-1">
        {quote.tags.slice(0, 3).map(tag => (
          <button
            key={tag}
            onClick={e => { e.preventDefault(); onTagClick(tag); }}
            className="text-[10px] font-medium text-stone-500 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded-full transition-colors"
          >
            #{tag}
          </button>
        ))}
      </div>
    </Link>
  );
}

// ── Category sidebar chip ───────────────────────────────────────────────────
function CategoryChip({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-all text-left ${
        active
          ? "bg-[#3D5A3E] text-white"
          : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
      }`}
    >
      <span className="truncate pr-2">{label}</span>
      <span className={`text-[10px] font-mono flex-shrink-0 ${active ? "text-white/70" : "text-stone-400"}`}>{count}</span>
    </button>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSource, setActiveSource] = useState<SourceType | "all">("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");

  // Keep the URL in sync so header search links / back-forward navigation work
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (searchTerm.trim()) next.set("search", searchTerm); else next.delete("search");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    fetch("/api/quotes")
      .then(r => r.json())
      .then(d => setQuotes(d.quotes || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Derived counts
  const sourceTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    quotes.forEach(q => {
      const t = q.sourceType ?? "book";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [quotes]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    quotes.forEach(q => { counts[q.category] = (counts[q.category] || 0) + 1; });
    return counts;
  }, [quotes]);

  const topTags = useMemo(() => {
    const counts: Record<string, number> = {};
    quotes.forEach(q => q.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    return (Object.entries(counts) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [quotes]);

  // Filtered quotes
  const filtered = useMemo(() => {
    return quotes.filter(q => {
      if (activeSource !== "all" && (q.sourceType ?? "book") !== activeSource) return false;
      if (activeCategory && q.category !== activeCategory) return false;
      if (activeTag && !q.tags.includes(activeTag)) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          q.text.toLowerCase().includes(term) ||
          q.author.toLowerCase().includes(term) ||
          (q.source || "").toLowerCase().includes(term) ||
          q.tags.some(t => t.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [quotes, activeSource, activeCategory, activeTag, searchTerm]);

  const hasFilters = activeSource !== "all" || !!activeCategory || !!activeTag || !!searchTerm;

  const clearAll = () => {
    setActiveSource("all");
    setActiveCategory(null);
    setActiveTag(null);
    setSearchTerm("");
  };

  const sortedCategories = (Object.entries(categoryCounts) as [string, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
      <SiteHeader />

      {/* ── Hero ── */}
      <section className="max-w-6xl w-full mx-auto px-5 md:px-8 pt-12 pb-8">
        <div className="mb-8">
          <h1 className="font-serif italic font-bold text-4xl md:text-5xl text-stone-800 mb-2">Explore</h1>
          <p className="text-stone-500 text-sm">
            {quotes.length} quotes from books, films, speeches, essays and more
          </p>
        </div>

        {/* ── Source type tabs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 mb-8">
          {SOURCE_TYPES.map(({ key, label, Icon, color }) => {
            const count = key === "all" ? quotes.length : (sourceTypeCounts[key] || 0);
            if (key !== "all" && count === 0) return null;
            const active = activeSource === key;
            return (
              <button
                key={key}
                onClick={() => { setActiveSource(key); setActiveCategory(null); setActiveTag(null); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                  active
                    ? "border-[#3D5A3E] bg-[#3D5A3E] text-white shadow-md"
                    : `border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm ${color}`
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold leading-tight text-center">{label}</span>
                <span className={`text-[10px] font-mono ${active ? "text-white/70" : "text-stone-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Search bar ── */}
        <div className="relative max-w-xl mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search quotes, authors, sources…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-full pl-11 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/40 text-stone-800 placeholder-stone-400 shadow-sm transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-300 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Active filter summary + clear */}
        {hasFilters && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs text-stone-500">{filtered.length} results</span>
            {activeSource !== "all" && (
              <span className="inline-flex items-center gap-1 bg-[#3D5A3E] text-white text-xs px-3 py-1 rounded-full">
                {SOURCE_TYPES.find(s => s.key === activeSource)?.label}
                <button onClick={() => setActiveSource("all")}><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeCategory && (
              <span className="inline-flex items-center gap-1 bg-stone-800 text-white text-xs px-3 py-1 rounded-full">
                {activeCategory}
                <button onClick={() => setActiveCategory(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeTag && (
              <span className="inline-flex items-center gap-1 bg-stone-600 text-white text-xs px-3 py-1 rounded-full">
                #{activeTag}
                <button onClick={() => setActiveTag(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
            <button onClick={clearAll} className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2">Clear all</button>
          </div>
        )}
      </section>

      {/* ── Main layout: sidebar + grid ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 md:px-8 pb-16">
        <div className="flex gap-8">

          {/* Sidebar */}
          <aside className="hidden md:flex flex-col gap-6 w-52 flex-shrink-0">

            {/* Categories */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 px-1">Categories</h3>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-medium transition-all text-left ${
                    !activeCategory ? "bg-[#3D5A3E] text-white" : "bg-white text-stone-600 hover:bg-stone-50 border border-stone-200"
                  }`}
                >
                  <span>All Categories</span>
                  <span className={`text-[10px] font-mono ${!activeCategory ? "text-white/70" : "text-stone-400"}`}>{quotes.length}</span>
                </button>
                {sortedCategories.map(([cat, count]) => (
                  <CategoryChip
                    key={cat}
                    label={cat}
                    count={count}
                    active={activeCategory === cat}
                    onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  />
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 px-1">Popular Tags</h3>
              <div className="flex flex-wrap gap-1">
                {topTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border transition-all ${
                      activeTag === tag
                        ? "bg-[#3D5A3E] text-white border-[#3D5A3E]"
                        : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    #{tag}
                    <span className={`font-mono ${activeTag === tag ? "text-white/60" : "text-stone-300"}`}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Quote grid */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <RefreshCw className="w-5 h-5 text-[#3D5A3E] animate-spin" />
                <span className="text-xs font-mono text-stone-400 uppercase tracking-wider">Loading quotes…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-stone-200">
                <p className="text-stone-400 font-serif italic text-lg">No quotes found.</p>
                <p className="text-stone-400 text-sm mt-1">Try adjusting your filters.</p>
                <button onClick={clearAll} className="mt-4 text-xs text-[#3D5A3E] underline underline-offset-2">Clear all filters</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-stone-400 mb-4">
                  Showing {filtered.length} {filtered.length === 1 ? "quote" : "quotes"}
                  {activeSource !== "all" && ` from ${SOURCE_TYPES.find(s => s.key === activeSource)?.label.toLowerCase()}`}
                  {activeCategory && ` in ${activeCategory}`}
                  {activeTag && ` tagged #${activeTag}`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map(q => (
                    <ExploreQuoteCard
                      key={q.id}
                      quote={q}
                      onTagClick={tag => setActiveTag(tag)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile tag strip */}
        <div className="md:hidden mt-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Filter by tag</p>
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none -mx-5 px-5">
            {topTags.slice(0, 20).map(([tag]) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`flex-shrink-0 text-[10px] font-medium px-3 py-1.5 rounded-full border transition-all ${
                  activeTag === tag
                    ? "bg-[#3D5A3E] text-white border-[#3D5A3E]"
                    : "bg-white text-stone-500 border-stone-200"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
