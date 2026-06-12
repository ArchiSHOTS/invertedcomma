import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, Heart, Bookmark, Share2, MessageSquare,
  BookOpen, Sparkles, Send, Shield, ExternalLink,
  Bot, Globe, ShoppingCart, RefreshCw, FileSearch,
} from "lucide-react";
import { Quote, Comment } from "../types";
import { getQuoteBySlug, getEnrichedQuotes } from "../data/quotes";
import { useUser } from "../context/UserContext";
import { useAnatomyIds } from "../hooks/useAnatomyIds";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import ShareCardModal from "../components/ShareCardModal";
import SEO from "../components/SEO";

const BRAND = "#3D5A3E";

// Anatomy is heavy (editor + reader); code-split it and mount only when its tab opens.
const QuoteAnatomy = lazy(() => import("../components/QuoteAnatomy"));

type TabKey = "context" | "deepdive" | "anatomy" | "discuss";

// Horizontal slide variants for the swipeable tab pager (direction-aware).
const panelVariants = {
  enter:  (d: number) => ({ x: d > 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d: number) => ({ x: d > 0 ? -36 : 36, opacity: 0 }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateMeta(name: string, content: string) {
  let el = document.querySelector(
    `meta[name="${name}"], meta[property="${name}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function amazonUrl(title: string, author: string, region: "com" | "in") {
  const q = encodeURIComponent(`${title} ${author}`);
  const tag = region === "com" ? "invertedcomma-20" : "invertedcomma-21";
  return `https://www.amazon.${region}/s?k=${q}&tag=${tag}`;
}

function authorHref(name: string) {
  return `/author/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("ic_token") ?? ""; }
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

export default function QuotePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn, updateUser } = useUser();
  const anatomyIds = useAnatomyIds();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [aiCounterpoint, setAiCounterpoint] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<{ title: string; url: string }[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [counterpointError, setCounterpointError] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // Cover image (book cover or movie poster)
  const [coverImage, setCoverImage] = useState<{ url: string; credit: string } | null>(null);

  // Full AI enrichment
  const [insights, setInsights] = useState<{
    authorBio: string | null;
    quoteMeaning: string | null;
    historicalContext: string | null;
    relatedWorks: { title: string; author: string; description: string }[];
    webReferences: { title: string; url: string }[];
  } | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  const [newCommentText, setNewCommentText] = useState("");
  const [isCounterpoint, setIsCounterpoint] = useState(false);
  const [hasLiked, setHasLiked] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [localLikes, setLocalLikes] = useState(0);
  const [bookmarkToast, setBookmarkToast] = useState<"saved" | "removed" | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [relatedQuotes, setRelatedQuotes] = useState<Quote[]>([]);

  // Tabbed layout
  const [activeTab, setActiveTab] = useState<TabKey>("context");
  const [dir, setDir] = useState(1);
  const tabBarRef = useRef<HTMLDivElement>(null);

  // ── Data loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    const local = getQuoteBySlug(slug);
    if (local) {
      setQuote(local);
      setLocalLikes(local.likes);
      document.title = `"${local.text.slice(0, 60)}…" — ${local.author} — Deep Dive with Inverted Comma`;
      updateMeta("description", `${local.text} — ${local.author}`);
      updateMeta("og:title", `"${local.text.slice(0, 80)}" — ${local.author} — Deep Dive with Inverted Comma`);
      updateMeta("og:description", local.context || local.text);
      updateMeta("og:url", window.location.href);

      const savedLocal: string[] = JSON.parse(localStorage.getItem("ic_saved_ids") || "[]");
      setIsBookmarked(savedLocal.includes(local.id));

      const all = getEnrichedQuotes();
      setRelatedQuotes(
        all
          .filter((q) => q.id !== local.id &&
            (q.category === local.category || q.tags.some((t) => local.tags.includes(t))))
          .slice(0, 4)
      );
    } else {
      fetch(`/api/quotes/${slug}`)
        .then((r) => r.json())
        .then((d) => { if (d.quote) { setQuote(d.quote); setLocalLikes(d.quote.likes); } else navigate("/", { replace: true }); })
        .catch(() => navigate("/", { replace: true }));
    }
  }, [slug]);

  // Open the tab referenced by the URL hash (e.g. ControlPage's /q/:slug#anatomy).
  useEffect(() => {
    if (location.hash === "#anatomy") setActiveTab("anatomy");
    else if (location.hash === "#discussion") setActiveTab("discuss");
  }, [location.hash]);

  // Sync bookmark state from logged-in user's account
  useEffect(() => {
    if (isLoggedIn && user && quote) {
      setIsBookmarked(user.savedQuoteIds.includes(quote.id));
    }
  }, [isLoggedIn, user?.savedQuoteIds, quote?.id]);

  // Fetch cover image when quote + sourceType are known
  useEffect(() => {
    if (!quote) return;
    const st = (quote as any).sourceType;
    const source = quote.source || "";

    if (st === "book" && source) {
      // Open Library search — completely free, no key
      const query = encodeURIComponent(source.split(",")[0].trim());
      fetch(`https://openlibrary.org/search.json?q=${query}&limit=1&fields=cover_i,title,author_name`)
        .then(r => r.json())
        .then(d => {
          const doc = d.docs?.[0];
          if (doc?.cover_i) {
            setCoverImage({
              url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
              credit: "Cover via Open Library",
            });
          }
        })
        .catch(() => {});
    } else if (st === "movie" && source) {
      // OMDB free tier — 1000 req/day, no key needed for basic poster
      const title = encodeURIComponent(source.split(",")[0].split("dir.")[0].trim());
      fetch(`https://www.omdbapi.com/?t=${title}&apikey=trilogy&type=movie`)
        .then(r => r.json())
        .then(d => {
          if (d.Poster && d.Poster !== "N/A") {
            setCoverImage({ url: d.Poster, credit: `Poster via OMDb · © ${d.Year || ""}` });
          }
        })
        .catch(() => {});
    }
  }, [quote?.id]);

  // When quote loads: fetch discussions + insights
  useEffect(() => {
    if (!quote?.id) return;
    fetchDiscussionsAndCounterpoint(quote);
    fetchInsights(quote.id);
  }, [quote?.id]);

  // ── Fetch discussions + auto-generate counterpoint ────────────────────────
  const fetchDiscussionsAndCounterpoint = async (q: Quote) => {
    setIsLoadingComments(true);
    try {
      const res = await fetch(`/api/discussions/${q.id}`);
      if (res.ok) {
        const d = await res.json();
        setComments(d.comments || []);
        if (d.aiCounterpoint) {
          setAiCounterpoint(d.aiCounterpoint);
          setAiSources(d.aiSources || []);
        } else {
          // Auto-generate counterpoint (non-blocking)
          generateCounterpoint(q.id, q.text, q.author);
        }
      }
    } finally { setIsLoadingComments(false); }
  };

  const generateCounterpoint = async (id: string, text: string, author: string) => {
    setIsGeneratingAi(true);
    setCounterpointError("");
    try {
      const res = await fetch(`/api/discussions/${id}/ai-counterpoint`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteText: text, author }),
      });
      const d = await res.json();
      if (res.ok) {
        setAiCounterpoint(d.aiCounterpoint || null);
        setAiSources(d.sources || []);
      } else {
        setCounterpointError(d.error || "Could not generate a counterpoint. Try again.");
      }
    } catch {
      setCounterpointError("Network error. Please try again.");
    } finally { setIsGeneratingAi(false); }
  };

  // ── Fetch insights (with background polling if not ready yet) ────────────
  const insightsPollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInsights = async (id: string) => {
    setIsLoadingInsights(true);
    try {
      const res = await fetch(`/api/quotes/${id}/insights`);
      if (res.ok) {
        const data = await res.json();
        if (data.authorBio) {
          setInsights(data);
          setIsLoadingInsights(false);
          return;
        }
      }
    } catch {}
    // Not ready yet — show skeleton briefly then switch to "being generated" state,
    // and poll every 8 seconds until enrichment lands
    setIsLoadingInsights(false);
    const poll = () => {
      insightsPollRef.current = setTimeout(async () => {
        try {
          const r = await fetch(`/api/quotes/${id}/insights`);
          if (r.ok) {
            const d = await r.json();
            if (d.authorBio) { setInsights(d); return; }
          }
        } catch {}
        poll();
      }, 8000);
    };
    poll();
  };

  // Clear poll on unmount
  React.useEffect(() => {
    return () => { if (insightsPollRef.current) clearTimeout(insightsPollRef.current); };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote || !newCommentText.trim()) return;
    // Posting requires an account — send guests to sign in, then back here.
    if (!isLoggedIn || !user) {
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    const displayHandle = user.handle;
    const displayAvatar = user.avatar;
    try {
      const res = await fetch(`/api/discussions/${quote.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: displayHandle,
          avatar: displayAvatar,
          text: newCommentText.trim(), isCounterpoint,
        }),
      });
      if (res.ok) { const d = await res.json(); setComments(d.comments || []); setNewCommentText(""); setIsCounterpoint(false); }
    } catch {}
  };

  const handleBookmark = async () => {
    if (!quote) return;
    const next = !isBookmarked;
    setIsBookmarked(next);
    setBookmarkToast(next ? "saved" : "removed");
    setTimeout(() => setBookmarkToast(null), 2500);

    // Always update localStorage
    const saved: string[] = JSON.parse(localStorage.getItem("ic_saved_ids") || "[]");
    const updated = next ? [...saved, quote.id] : saved.filter(id => id !== quote.id);
    localStorage.setItem("ic_saved_ids", JSON.stringify(updated));

    // Also persist to account if logged in
    if (isLoggedIn) {
      try {
        const r = await fetch(`/api/quotes/${quote.id}/bookmark`, { method: "POST", headers: authHeaders() });
        if (r.ok) {
          const d = await r.json();
          updateUser({ savedQuoteIds: d.savedQuoteIds });
        }
      } catch {}
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share && quote) {
      try { await navigator.share({ title: `"${quote.text}" — ${quote.author}`, url }); return; } catch {}
    }
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleLike = () => {
    const next = !hasLiked;
    setHasLiked(next);
    setLocalLikes(c => c + (next ? 1 : -1));
    if (next) { setLikeAnimating(true); setTimeout(() => setLikeAnimating(false), 600); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!quote) {
    return (
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-[#3D5A3E] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-stone-400 font-mono">Loading…</p>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const yearLabel = quote.year
    ? (quote.year < 0 ? `${Math.abs(quote.year)} BC` : String(quote.year))
    : null;

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const canEditAnatomy = user?.role === "admin" || user?.role === "moderator";
  const hasAnatomy = anatomyIds.has(quote.id);
  const showContextTab = !!quote.context || quote.tags.length > 0 || !!coverImage;
  const showAnatomyTab = canEditAnatomy || hasAnatomy;

  const tabs: { key: TabKey; label: string; Icon: React.ElementType; badge?: number }[] = [
    ...(showContextTab ? [{ key: "context" as TabKey, label: "Context", Icon: BookOpen }] : []),
    { key: "deepdive", label: "Deep Dive", Icon: Sparkles },
    ...(showAnatomyTab ? [{ key: "anatomy" as TabKey, label: "Anatomy", Icon: FileSearch }] : []),
    { key: "discuss", label: "Discuss", Icon: MessageSquare, badge: comments.length || undefined },
  ];
  const order = tabs.map(t => t.key);
  const effectiveTab: TabKey = order.includes(activeTab) ? activeTab : order[0];

  const goToTab = (key: TabKey) => {
    setDir(order.indexOf(key) >= order.indexOf(effectiveTab) ? 1 : -1);
    setActiveTab(key);
    requestAnimationFrame(() => tabBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const swipeToNeighbour = (offsetX: number) => {
    const i = order.indexOf(effectiveTab);
    if (offsetX < -60 && i < order.length - 1) goToTab(order[i + 1]);
    else if (offsetX > 60 && i > 0) goToTab(order[i - 1]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const ogImage = `https://www.invertedcomma.com/api/og/quote/${quote.slug}`;
  const shortText = quote.text.length > 120 ? quote.text.slice(0, 118) + "…" : quote.text;
  const quoteJsonLd = {
    "@context": "https://schema.org",
    "@type": "Quotation",
    "text": quote.text,
    "spokenByCharacter": { "@type": "Person", "name": quote.author },
    "isPartOf": quote.source ? { "@type": "CreativeWork", "name": quote.source } : undefined,
    "datePublished": quote.year ? String(quote.year) : undefined,
    "url": `https://www.invertedcomma.com/q/${quote.slug}`,
  };

  return (
    <>
      <SEO
        title={`"${shortText}" — ${quote.author} — Deep Dive with Inverted Comma`}
        description={`Deep dive into this ${quote.author} quote. Explore context, commentary, discussion and related ideas on Inverted Comma.`}
        image={ogImage}
        path={`/q/${quote.slug}`}
        type="article"
        jsonLd={quoteJsonLd}
        appendSiteName={false}
      />
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
        <SiteHeader />

        {/* ── Green hero ─────────────────────────────────────────────── */}
        <section className="w-full bg-gradient-to-br from-[#0F1F10] via-[#1E3320] to-[#3D5A3E]">
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14">
            {/* Breadcrumb */}
            <div className="flex items-center gap-3 mb-7">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Explore
              </Link>
              <span className="text-white/30">/</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-white/15 text-white/90">
                {quote.category}
              </span>
            </div>

            {/* Quote */}
            <div className="relative">
              <span
                className="absolute -top-6 -left-1 font-serif leading-none select-none pointer-events-none text-white/15"
                style={{ fontSize: "5.5rem" }}
              >
                &ldquo;
              </span>
              <blockquote className="font-serif italic text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.15] text-stone-50 relative z-10">
                {quote.text}
              </blockquote>
            </div>

            {/* Attribution */}
            <cite className="not-italic block mt-6">
              <span className="font-bold text-sm uppercase tracking-[0.18em] text-white">
                — <a href={authorHref(quote.author)} className="hover:underline">{quote.author}</a>
              </span>
              {(quote.source || yearLabel) && (
                <span className="block font-serif italic text-sm text-white/60 mt-1">
                  {quote.source && (quote as any).sourceUrl ? (
                    <a
                      href={(quote as any).sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white/90 underline underline-offset-2 decoration-white/30 transition-colors"
                    >
                      {quote.source}
                    </a>
                  ) : (
                    quote.source
                  )}
                  {quote.source && yearLabel && ", "}
                  {yearLabel}
                </span>
              )}
            </cite>

            {/* Action row */}
            <div className="flex items-center flex-wrap gap-2 mt-8">
              <button
                onClick={toggleLike}
                className={`flex items-center gap-2 h-10 px-4 rounded-full text-sm font-medium border transition-all ${
                  hasLiked ? "bg-white text-rose-600 border-white" : "border-white/30 text-white hover:bg-white/10"
                }`}
              >
                <Heart
                  className={`w-4 h-4 transition-transform ${hasLiked ? "fill-rose-600" : ""} ${likeAnimating ? "scale-150" : "scale-100"}`}
                  style={{ transitionDuration: "150ms" }}
                />
                {localLikes.toLocaleString()}
              </button>

              <button
                onClick={handleBookmark}
                className={`flex items-center gap-2 h-10 px-4 rounded-full text-sm font-medium border transition-all ${
                  isBookmarked ? "bg-white text-[#3D5A3E] border-white" : "border-white/30 text-white hover:bg-white/10"
                }`}
              >
                <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-[#3D5A3E]" : ""}`} />
                <span className="hidden sm:inline">{isBookmarked ? "Saved" : "Save"}</span>
              </button>

              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold bg-white text-[#3D5A3E] border border-white transition-all hover:bg-white/90"
              >
                <Share2 className="w-4 h-4" />
                {copied ? "Copied" : "Share"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Sticky tab bar ─────────────────────────────────────────── */}
        <div
          ref={tabBarRef}
          className="sticky top-16 z-30 bg-[#FBF9F6]/95 backdrop-blur border-b border-stone-200 scroll-mt-16"
        >
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6">
            <div
              className="flex gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
              role="tablist"
            >
              {tabs.map((t) => {
                const active = t.key === effectiveTab;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => goToTab(t.key)}
                    className={`relative flex items-center gap-1.5 whitespace-nowrap px-4 h-12 text-sm font-semibold transition-colors ${
                      active ? "text-[#3D5A3E]" : "text-stone-400 hover:text-stone-600"
                    }`}
                  >
                    <t.Icon className="w-3.5 h-3.5" />
                    {t.label}
                    {t.badge ? (
                      <span className="text-[10px] font-mono text-stone-400">{t.badge}</span>
                    ) : null}
                    {active && (
                      <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full" style={{ background: BRAND }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Pager ──────────────────────────────────────────────────── */}
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={effectiveTab}
              custom={dir}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.18, ease: "easeOut" }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => swipeToNeighbour(info.offset.x)}
              className="space-y-8 touch-pan-y"
            >
              {/* ── Context panel ── */}
              {effectiveTab === "context" && (
                <>
                  {coverImage && (
                    <section className="flex gap-5 items-start">
                      <div className="flex-shrink-0">
                        <img
                          src={coverImage.url}
                          alt={quote.source || "Source cover"}
                          className="w-24 sm:w-32 rounded-xl shadow-md object-cover border border-stone-200"
                          onError={() => setCoverImage(null)}
                        />
                        <p className="text-[9px] text-stone-300 mt-1 text-center leading-tight">{coverImage.credit}</p>
                      </div>
                      {quote.source && (
                        <div className="pt-1">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-1">
                            {(quote as any).sourceType === "movie" ? "Film" : "From the book"}
                          </p>
                          <p className="font-semibold text-stone-800 text-sm">{quote.source}</p>
                          {(quote as any).sourceUrl && (
                            <a
                              href={(quote as any).sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-stone-400 hover:text-stone-700 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" /> View source
                            </a>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {quote.context && (
                    <section className="bg-white rounded-2xl border border-stone-200 p-6">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Context</h2>
                        <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">
                          AI generated
                        </span>
                      </div>
                      <p className="font-serif text-stone-600 leading-relaxed text-[0.95rem]">{quote.context}</p>
                    </section>
                  )}

                  {quote.tags.length > 0 && (
                    <section>
                      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3">Topics</h2>
                      <div className="flex flex-wrap gap-2">
                        {quote.tags.map((tag) => (
                          <Link
                            key={tag}
                            to={`/tag/${tag}`}
                            className="inline-flex items-center h-8 px-4 rounded-full text-xs font-medium border border-stone-200 text-stone-500 hover:text-white hover:border-transparent transition-all"
                            onMouseEnter={(e) => { e.currentTarget.style.background = BRAND; e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = "white"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = ""; e.currentTarget.style.borderColor = ""; e.currentTarget.style.color = ""; }}
                          >
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {/* ── Deep Dive panel ── */}
              {effectiveTab === "deepdive" && (
                <>
                  <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${BRAND}18` }}>
                          <Sparkles className="w-3.5 h-3.5" style={{ color: BRAND }} />
                        </div>
                        <h2 className="text-sm font-semibold text-stone-700">Deep Dive</h2>
                      </div>
                      <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">
                        AI generated
                      </span>
                    </div>

                    {isLoadingInsights ? (
                      <div className="p-6 space-y-5 animate-pulse">
                        <div className="space-y-2">
                          <div className="h-2 bg-stone-100 rounded w-28" />
                          <div className="h-3 bg-stone-100 rounded w-full" />
                          <div className="h-3 bg-stone-100 rounded w-5/6" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-2 bg-stone-100 rounded w-32" />
                          <div className="h-3 bg-stone-100 rounded w-full" />
                          <div className="h-3 bg-stone-100 rounded w-4/5" />
                          <div className="h-3 bg-stone-100 rounded w-full" />
                        </div>
                      </div>
                    ) : insights?.authorBio ? (
                      <div className="divide-y divide-stone-100">
                        {insights.quoteMeaning && (
                          <div className="px-6 py-5 space-y-2">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">What this quote means</p>
                            <p className="text-stone-700 leading-relaxed text-sm font-serif italic">{insights.quoteMeaning}</p>
                          </div>
                        )}

                        <div className="px-6 py-5 space-y-2">
                          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">About {quote.author}</p>
                          <p className="text-stone-600 leading-relaxed text-sm">{insights.authorBio}</p>
                        </div>

                        {insights.historicalContext && (
                          <div className="px-6 py-5 space-y-2">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Historical context</p>
                            <p className="text-stone-600 leading-relaxed text-sm">{insights.historicalContext}</p>
                          </div>
                        )}

                        {insights.relatedWorks?.length > 0 && (
                          <div className="px-6 py-5 space-y-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Further reading</p>
                            <div className="space-y-3">
                              {insights.relatedWorks.map((work, i) => (
                                <div key={i} className="flex gap-3">
                                  <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-stone-800 leading-snug">
                                      {work.title}
                                      {work.author && work.author !== quote.author && (
                                        <span className="font-normal text-stone-400"> · {work.author}</span>
                                      )}
                                    </p>
                                    {work.description && (
                                      <p className="text-[11px] text-stone-500 leading-relaxed mt-0.5">{work.description}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {insights.webReferences?.length > 0 && (
                          <div className="px-6 py-5 space-y-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Sources & references</p>
                            <div className="flex flex-wrap gap-1.5">
                              {insights.webReferences.map((ref, i) => (
                                <a
                                  key={i}
                                  href={ref.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={ref.title}
                                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-stone-100 hover:bg-stone-200 text-[10px] text-stone-500 hover:text-stone-700 transition-colors max-w-[240px]"
                                >
                                  <Globe className="w-2.5 h-2.5 flex-shrink-0 text-stone-400" />
                                  <span className="truncate">{ref.title}</span>
                                  <ExternalLink className="w-2 h-2 flex-shrink-0 text-stone-300" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-6 py-10 flex flex-col items-center gap-3">
                        <div className="flex gap-1.5">
                          {[0, 1, 2].map(i => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-stone-300"
                              style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                            />
                          ))}
                        </div>
                        <p className="text-sm text-stone-400">Preparing your deep dive…</p>
                        <p className="text-[11px] text-stone-300">This appears automatically once ready.</p>
                      </div>
                    )}
                  </section>

                  {/* Web Counterpoint */}
                  <section className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${BRAND}18` }}>
                          <Bot className="w-3.5 h-3.5" style={{ color: BRAND }} />
                        </div>
                        <h2 className="text-sm font-semibold text-stone-700">Web Counterpoint</h2>
                      </div>
                      <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">
                        AI generated
                      </span>
                    </div>

                    {isGeneratingAi && !aiCounterpoint ? (
                      <div className="space-y-3 animate-pulse">
                        <div className="h-3 bg-stone-100 rounded w-full" />
                        <div className="h-3 bg-stone-100 rounded w-11/12" />
                        <div className="h-3 bg-stone-100 rounded w-4/5" />
                      </div>
                    ) : aiCounterpoint ? (
                      <>
                        <blockquote
                          className="font-serif italic text-stone-600 leading-relaxed text-[0.95rem] pl-4 border-l-2"
                          style={{ borderColor: BRAND }}
                        >
                          &ldquo;{aiCounterpoint}&rdquo;
                        </blockquote>
                        <p className="text-[10px] font-mono text-stone-400">— The Dialectic Engine</p>

                        {aiSources.length > 0 && (
                          <div className="pt-1 space-y-1.5">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Sources</p>
                            <div className="flex flex-wrap gap-1.5">
                              {aiSources.map((s, i) => (
                                <a
                                  key={i}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={s.title}
                                  className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-stone-100 hover:bg-stone-200 text-[10px] text-stone-500 hover:text-stone-700 transition-colors max-w-[200px]"
                                >
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">{s.title}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-stone-400 leading-relaxed">
                          Search the web for real critiques and counterarguments to this idea.
                        </p>
                        <button
                          onClick={() => quote && generateCounterpoint(quote.id, quote.text, quote.author)}
                          disabled={isGeneratingAi}
                          className="inline-flex items-center gap-2 h-10 px-6 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-50 hover:opacity-90"
                          style={{ background: BRAND }}
                        >
                          {isGeneratingAi ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {isGeneratingAi ? "Searching…" : "Find Counterpoint"}
                        </button>
                        {counterpointError && (
                          <p className="text-xs text-red-400">{counterpointError}</p>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Further Reading & Resources */}
                  {quote.relatedBooks && quote.relatedBooks.length > 0 && (
                    <section className="space-y-4">
                      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
                        Further reading &amp; resources
                      </h2>

                      <div className="space-y-3">
                        {quote.relatedBooks.map((book) => (
                          <div key={book.title} className="flex items-start gap-4 p-4 bg-white rounded-2xl border border-stone-200">
                            <div className="w-9 h-12 rounded-md flex-shrink-0 flex items-center justify-center" style={{ background: `${BRAND}18` }}>
                              <BookOpen className="w-4 h-4" style={{ color: BRAND }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-serif font-semibold text-sm text-stone-800 leading-tight mb-0.5">{book.title}</p>
                              <p className="text-[11px] text-stone-400 mb-2">{book.author}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {book.affiliateUrl && (
                                  <a href={book.affiliateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-stone-100 hover:bg-stone-200 text-[10px] text-stone-500 transition-colors">
                                    <BookOpen className="w-2.5 h-2.5" /> Bookshop.org
                                  </a>
                                )}
                                <a href={amazonUrl(book.title, book.author, "com")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-orange-50 hover:bg-orange-100 text-[10px] text-orange-600 transition-colors">
                                  <ShoppingCart className="w-2.5 h-2.5" /> Amazon.com
                                </a>
                                <a href={amazonUrl(book.title, book.author, "in")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-orange-50 hover:bg-orange-100 text-[10px] text-orange-600 transition-colors">
                                  <ShoppingCart className="w-2.5 h-2.5" /> Amazon.in
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-center space-y-1">
                        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Advertisement</p>
                        <p className="text-xs text-stone-400">
                          Partner with Inverted Comma — reach curious minds.{" "}
                          <a href="mailto:hello@invertedcomma.com" className="underline hover:text-stone-600 transition-colors">hello@invertedcomma.com</a>
                        </p>
                      </div>

                      <p className="text-[9px] text-stone-400 font-mono">
                        Bookshop.org links support independent bookshops. Amazon links may contain affiliate tags.
                      </p>
                    </section>
                  )}
                </>
              )}

              {/* ── Anatomy panel ── */}
              {effectiveTab === "anatomy" && (
                <div id="anatomy" className="scroll-mt-24">
                  <Suspense fallback={<div className="py-16 text-center text-sm text-stone-400">Loading anatomy…</div>}>
                    <QuoteAnatomy quoteId={quote.id} slug={slug} />
                  </Suspense>
                </div>
              )}

              {/* ── Discuss panel ── */}
              {effectiveTab === "discuss" && (
                <section id="discussion" className="space-y-6">
                  {isLoadingComments ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-16 bg-stone-100 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : comments.length === 0 ? null : (
                    <div className="space-y-4">
                      {comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3 items-start bg-white rounded-2xl border border-stone-200 p-4">
                          <img
                            src={comment.avatar}
                            alt={comment.username}
                            className="w-8 h-8 rounded-full border border-stone-200 object-cover flex-shrink-0 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-semibold text-xs text-stone-800">{comment.username}</span>
                              {comment.isAdmin && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">
                                  <Shield className="w-2 h-2" /> admin
                                </span>
                              )}
                              {comment.isCounterpoint && (
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: `${BRAND}18`, color: BRAND }}>
                                  counterpoint
                                </span>
                              )}
                              <span className="ml-auto text-[10px] text-stone-400 font-mono">{comment.createdAt}</span>
                            </div>
                            <p className={`text-sm leading-relaxed ${comment.isCounterpoint ? "font-serif italic text-stone-600" : "text-stone-600"}`}>
                              {comment.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comment form */}
                  <form onSubmit={handlePostComment} className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-stone-700">Add your voice</h3>
                      {isLoggedIn && user && (
                        <div className="flex items-center gap-2">
                          <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-full object-cover border border-stone-200" />
                          <span className="text-xs font-medium text-stone-600">@{user.handle}</span>
                        </div>
                      )}
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Challenge, agree, or add nuance…"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all resize-none"
                      style={{ ["--tw-ring-color" as string]: `${BRAND}40` }}
                    />

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isCounterpoint}
                          onChange={(e) => setIsCounterpoint(e.target.checked)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        Mark as counterpoint
                      </label>

                      <button
                        type="submit"
                        disabled={!newCommentText.trim()}
                        className="flex items-center gap-2 h-9 px-5 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                        style={{ background: BRAND }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Post
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ── Related Ideas (always below the tabs) ───────────────────── */}
          {relatedQuotes.length > 0 && (
            <section className="mt-12">
              <h2 className="font-semibold text-stone-700 mb-4">Related ideas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {relatedQuotes.map((rq) => (
                  <Link
                    key={rq.id}
                    to={`/q/${rq.slug}`}
                    className="block bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-md hover:border-stone-300 transition-all group"
                  >
                    <p className="font-serif italic text-stone-600 leading-snug text-sm mb-3 line-clamp-3">
                      &ldquo;{rq.text}&rdquo;
                    </p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 group-hover:text-stone-600 transition-colors">
                      — {rq.author}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        <SiteFooter />
      </div>

      {showShareModal && (
        <ShareCardModal quote={quote} onClose={() => setShowShareModal(false)} />
      )}

      {/* Bookmark toast */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 h-10 px-5 rounded-full text-sm font-medium text-white shadow-lg transition-all duration-300 pointer-events-none ${
          bookmarkToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
        style={{ background: bookmarkToast === "removed" ? "#78716c" : BRAND }}
      >
        <Bookmark className={`w-4 h-4 ${bookmarkToast === "saved" ? "fill-white" : ""}`} />
        {bookmarkToast === "saved" ? "Saved to your collection" : "Removed from collection"}
      </div>
    </>
  );
}
