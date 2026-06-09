import React, { useState, useEffect, useRef, useMemo } from "react";
import { BrowserRouter, Routes, Route, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { Quote, CustomCollection } from "./types";
import { useBookmarks } from "./hooks/useBookmarks";
import { useCollections } from "./hooks/useCollections";
import { Search, X, Layers, LayoutGrid, BookOpen, RefreshCw, Library } from "lucide-react";

import SiteHeader from "./components/SiteHeader";
import HeroSection from "./components/HeroSection";
import SiteFooter from "./components/SiteFooter";
import SEO from "./components/SEO";
import SwipeDeck from "./components/SwipeDeck";
import QuoteCard from "./components/QuoteCard";
import DiscussionDrawer from "./components/DiscussionDrawer";
import ReadingListManager from "./components/ReadingListManager";
import ShareCardModal from "./components/ShareCardModal";

import QuotePage from "./pages/QuotePage";
import TagPage from "./pages/TagPage";
import ControlPage from "./pages/ControlPage";
import ExplorePage from "./pages/ExplorePage";
import MePage from "./pages/MePage";
import UserProfilePage from "./pages/UserProfilePage";
import AuthorPage from "./pages/AuthorPage";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import AboutPage from "./pages/AboutPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import { UserProvider, useUser } from "./context/UserContext";

// ── BottomNav — mobile only ────────────────────────────────────────────────
function MobileNav({
  activeView,
  setActiveView,
  savedCount,
}: {
  activeView: "deck" | "grid" | "collections";
  setActiveView: (v: "deck" | "grid" | "collections") => void;
  savedCount: number;
}) {
  const { isLoggedIn } = useUser();
  const navigate = useNavigate();

  const tabs = [
    { key: "deck" as const, label: "Discover", Icon: Layers },
    { key: "grid" as const, label: "Browse", Icon: LayoutGrid },
    ...(isLoggedIn
      ? [{ key: "collections" as const, label: "Library", Icon: BookOpen }]
      : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map(({ key, label, Icon }) => {
          const active = activeView === key;
          return (
            <button
              key={key}
              onClick={() => key === "collections" ? navigate("/me") : setActiveView(key)}
              className={`flex flex-col items-center gap-0.5 px-5 py-2 rounded-2xl transition-all relative ${
                active ? "text-[#3D5A3E]" : "text-stone-400"
              }`}
            >
              {key === "collections" && savedCount > 0 && (
                <span className="absolute -top-0.5 right-2 w-4 h-4 rounded-full bg-[#3D5A3E] text-white text-[9px] flex items-center justify-center font-bold leading-none">
                  {savedCount > 9 ? "9+" : savedCount}
                </span>
              )}
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
              <span className={`text-[10px] font-medium ${active ? "font-bold" : ""}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ── Desktop view tabs ─────────────────────────────────────────────────────
function DesktopTabs({
  activeView,
  setActiveView,
  savedCount,
}: {
  activeView: "deck" | "grid" | "collections";
  setActiveView: (v: "deck" | "grid" | "collections") => void;
  savedCount: number;
}) {
  const { isLoggedIn } = useUser();
  const navigate = useNavigate();

  const tabs = [
    { key: "deck" as const, label: "Discover", Icon: Layers },
    { key: "grid" as const, label: "Browse", Icon: LayoutGrid },
    ...(isLoggedIn
      ? [{ key: "collections" as const, label: "Library", Icon: Library }]
      : []),
  ];

  return (
    <div className="hidden md:flex items-center gap-1 bg-stone-100 rounded-full p-1 w-fit">
      {tabs.map(({ key, label, Icon }) => {
        const active = activeView === key;
        return (
          <button
            key={key}
            onClick={() => key === "collections" ? navigate("/me") : setActiveView(key)}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all relative ${
              active
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "collections" && savedCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#3D5A3E] text-white text-[10px] flex items-center justify-center font-bold">
                {savedCount > 9 ? "9+" : savedCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────
function HomePage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState<"deck" | "grid" | "collections">("deck");
  const [searchParams] = useSearchParams();
  const [selectedTag, setSelectedTag] = useState<string | null>(searchParams.get("tag") || null);
  const [isLoading, setIsLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const { savedIds: savedQuoteIds, toggle: handleToggleBookmark } = useBookmarks();
  const { collections, addToCollection: handleAddToCollection, removeFromCollection: handleRemoveFromCollection } = useCollections();

  const [discussionQuote, setDiscussionQuote] = useState<Quote | null>(null);
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);
  const [shareCardQuote, setShareCardQuote] = useState<Quote | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [qRes, tRes] = await Promise.all([fetch("/api/quotes"), fetch("/api/tags")]);
      if (qRes.ok) setQuotes((await qRes.json()).quotes || []);
      if (tRes.ok) setTags((await tRes.json()).tags || []);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDiscussion = (quote: Quote) => {
    setDiscussionQuote(quote);
    setIsDiscussionOpen(true);
  };

  // Stable random 15-quote sample for the unfiltered homepage view
  const featuredSample = useMemo(() => {
    if (quotes.length === 0) return [];
    const shuffled = [...quotes].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 15);
  }, [quotes.length > 0]); // re-sample only when quotes first load

  // Filter logic
  const isFiltered = !!searchTerm.trim() || !!selectedTag;
  const filteredQuotes = (isFiltered ? quotes : featuredSample).filter((q) => {
    const matchesTag = selectedTag ? q.tags.includes(selectedTag) : true;
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      q.text.toLowerCase().includes(term) ||
      q.author.toLowerCase().includes(term) ||
      q.category.toLowerCase().includes(term) ||
      q.tags.some((t) => t.toLowerCase().includes(term));
    return matchesTag && matchesSearch;
  });

  // Inject sponsored card at position 7 in grid
  const gridQuotes = (() => {
    if (activeView !== "grid" || filteredQuotes.length < 8) return filteredQuotes;
    const sponsored: Quote = {
      id: "sponsored-1", slug: "sponsored-1",
      text: "Discover the books behind history's greatest minds. Independent bookshops. Affiliate links.",
      author: "Bookshop.org", category: "Sponsored", tags: [], likes: 0, bookmarks: 0,
      sponsored: true, sponsorLabel: "Partner", sponsorUrl: "https://bookshop.org",
    };
    const result = [...filteredQuotes];
    result.splice(7, 0, sponsored);
    return result;
  })();

  const topTags = [...tags].sort((a, b) => b.count - a.count).filter((t) => t.count > 0);

  return (
    <>
    <SEO
      title="Inverted Comma — Quotes worth thinking about"
      description="Curating high-contrast quotes, counterpoints & conversations — from books, films, speeches, art and beyond. Browse, bookmark and deep dive."
      path="/"
    />
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
      <SiteHeader />
      <HeroSection quotes={quotes} onShareCard={(q) => setShareCardQuote(q)} />

      {/* ── Explore section ─────────────────────────────────────── */}
      <main id="explore" className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 pt-10 pb-28 md:pb-12">

        {/* Section heading — centered */}
        <div className="text-center mb-7">
          <h2 className="font-serif italic text-3xl md:text-4xl lg:text-5xl text-stone-800 font-bold mb-1">
            Explore quotes
          </h2>
          <p className="text-stone-400 text-sm">
            {isFiltered
              ? `${filteredQuotes.length} of ${quotes.length} quotes`
              : `${featuredSample.length} featured · ${quotes.length} total`}
          </p>
        </div>

        {/* Search bar — centered */}
        <div className="relative max-w-xl mx-auto mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            placeholder="Search quotes, authors, topics…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-full pl-11 pr-10 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/40 text-stone-800 placeholder-stone-400 shadow-sm transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-300 transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Tag pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none select-none -mx-4 px-4 md:mx-0 md:px-0">
          <button
            onClick={() => setSelectedTag(null)}
            className={`flex-shrink-0 h-8 px-4 rounded-full text-xs font-semibold transition-all border ${
              selectedTag === null
                ? "bg-[#3D5A3E] text-white border-[#3D5A3E]"
                : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
            }`}
          >
            All
          </button>
          {topTags.map((tc) => (
            <button
              key={tc.name}
              onClick={() => setSelectedTag(selectedTag === tc.name ? null : tc.name)}
              className={`flex-shrink-0 h-8 px-4 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${
                selectedTag === tc.name
                  ? "bg-[#3D5A3E] text-white border-[#3D5A3E]"
                  : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
              }`}
            >
              #{tc.name}
              <span className={`text-[10px] font-mono ${selectedTag === tc.name ? "text-white/60" : "text-stone-400"}`}>
                {tc.count}
              </span>
            </button>
          ))}
        </div>

        {/* View tabs — above quotes */}
        <div className="flex justify-center items-center mb-5">
          <DesktopTabs activeView={activeView} setActiveView={setActiveView} savedCount={savedQuoteIds.length} />
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <RefreshCw className="w-5 h-5 text-[#3D5A3E] animate-spin" />
            <span className="text-xs font-mono text-stone-400 uppercase tracking-wider">Loading quotes…</span>
          </div>
        ) : (
          <>
            {/* ── Discover (swipe deck) ── */}
            {activeView === "deck" && (
              <SwipeDeck
                quotes={filteredQuotes}
                savedQuoteIds={savedQuoteIds}
                onToggleBookmark={handleToggleBookmark}
                collections={collections}
                onAddToCollection={handleAddToCollection}
                onRemoveFromCollection={handleRemoveFromCollection}
                onOpenDiscussion={handleOpenDiscussion}
                onShareCard={(q) => setShareCardQuote(q)}
                onTagClick={(tag) => setSelectedTag(tag)}
              />
            )}

            {/* ── Browse (grid) ── */}
            {activeView === "grid" && (
              <>
                {filteredQuotes.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-stone-200">
                    <p className="text-stone-400 font-serif italic text-lg">No quotes found.</p>
                    <p className="text-stone-400 text-sm mt-1">Try a different search or tag.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {gridQuotes.map((q) => (
                      <QuoteCard
                        key={q.id}
                        quote={q}
                        isBookmarked={savedQuoteIds.includes(q.id)}
                        onToggleBookmark={() => handleToggleBookmark(q.id)}

                        onOpenDiscussion={() => handleOpenDiscussion(q)}
                        onShareCard={() => setShareCardQuote(q)}
                        collections={collections}
                        onAddToCollection={handleAddToCollection}
                        onRemoveFromCollection={handleRemoveFromCollection}
                        onTagClick={(tag) => setSelectedTag(tag)}
                        compact
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Library — navigates to /me ── */}
            {activeView === "collections" && null}
          </>
        )}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav activeView={activeView} setActiveView={setActiveView} savedCount={savedQuoteIds.length} />

      <SiteFooter />

      {/* Discussion drawer */}
      {discussionQuote && (
        <DiscussionDrawer
          quote={discussionQuote}
          isOpen={isDiscussionOpen}
          onClose={() => {
            setIsDiscussionOpen(false);
            setDiscussionQuote(null);
          }}
        />
      )}

      {/* Share card modal */}
      {shareCardQuote && (
        <ShareCardModal
          quote={shareCardQuote}
          onClose={() => setShareCardQuote(null)}
        />
      )}
    </div>
    </>
  );
}

// ── ScrollToTop — instant scroll to top on every route change ─────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ── Root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/q/:slug" element={<QuotePage />} />
          <Route path="/tag/:tag" element={<TagPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/control" element={<ControlPage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/verify" element={<VerifyEmailPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/u/:handle" element={<UserProfilePage />} />
          <Route path="/author/:slug" element={<AuthorPage />} />
          <Route path="/about"   element={<AboutPage />} />
          <Route path="/terms"   element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
  );
}
