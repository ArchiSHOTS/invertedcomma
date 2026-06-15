import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Calendar, Globe, BookOpen, Sparkles, ExternalLink } from "lucide-react";
import { AuthorProfile, Quote } from "../types";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import QuoteCard from "../components/QuoteCard";
import DiscussionDrawer from "../components/DiscussionDrawer";
import ShareCardModal from "../components/ShareCardModal";
import { useBookmarks } from "../hooks/useBookmarks";
import { useCollections } from "../hooks/useCollections";
import SEO from "../components/SEO";

export default function AuthorPage() {
  const { slug } = useParams<{ slug: string }>();
  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { savedIds, toggle } = useBookmarks();
  const { collections, addToCollection, removeFromCollection } = useCollections();

  // Discussion drawer
  const [discussionQuote, setDiscussionQuote] = useState<Quote | null>(null);
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);

  // Share card modal
  const [shareCardQuote, setShareCardQuote] = useState<Quote | null>(null);

  // Load author + quotes
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/author/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setNotFound(true); return; }
        setAuthor(d.author);
        setQuotes(d.quotes || []);
        if (!d.author?.bio) setGenerating(true);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Poll until bio arrives when auto-generating
  useEffect(() => {
    if (!generating || !slug) return;
    const timer = setInterval(() => {
      fetch(`/api/author/${slug}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.author?.bio) { setAuthor(d.author); setGenerating(false); }
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [generating, slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FAF8F5]">
        <SiteHeader />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <p className="text-stone-400 text-sm">Author not found.</p>
          <Link to="/" className="text-xs text-stone-400 hover:text-stone-700 mt-3 inline-block underline">Back to home</Link>
        </div>
      </div>
    );
  }

  const displayName = author?.fullName || author?.name || slug;
  const bioSnippet  = author?.bio ? author.bio.slice(0, 140) + (author.bio.length > 140 ? "…" : "") : "";

  return (
    <>
    <SEO
      title={displayName}
      description={
        bioSnippet
          ? `${displayName} — ${bioSnippet}`
          : `Browse all ${quotes.length} quotes by ${displayName} on Inverted Comma. Read in context, explore deep dives and join the conversation.`
      }
      image={`https://www.invertedcomma.com/api/og/author/${slug}`}
      path={`/author/${slug}`}
      type="article"
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "Person",
        "name": displayName,
        "description": bioSnippet || undefined,
        "url": `https://www.invertedcomma.com/author/${slug}`,
      }}
    />
    <div className="min-h-screen bg-[#FAF8F5]">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">

        {/* ── Author header ────────────────────────────────────────────────── */}
        <div className="flex items-start gap-6 mb-10">
          <div className="flex-shrink-0">
            {author?.imageUrl ? (
              <img
                src={author.imageUrl}
                alt={displayName}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-stone-200 shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-stone-200 flex items-center justify-center">
                <span className="text-2xl font-bold text-stone-500">
                  {(author?.name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 leading-tight">{displayName}</h1>
            {author?.knownFor && (
              <p className="text-sm text-stone-500 mt-1">{author.knownFor}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-stone-400">
              {(author?.born || author?.died) && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {author.born}{author.died ? ` – ${author.died}` : ""}
                </span>
              )}
              {author?.nationality && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  {author.nationality}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Bio ──────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 mb-10">
          {generating ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>Generating author profile…</span>
            </div>
          ) : author?.bio ? (
            <div>
              <p className="text-sm text-stone-700 leading-relaxed">{author.bio}</p>
              {author.autoGenerated && (
                <p className="text-[10px] text-stone-300 mt-3 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> AI generated
                </p>
              )}
            </div>
          ) : (
            <p className="text-stone-400 text-sm italic">No biography available yet.</p>
          )}
        </div>

        {/* ── Quotes grid ──────────────────────────────────────────────────── */}
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-5">
          Quotes
        </h2>

        {quotes.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="w-8 h-8 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-400 text-sm">No quotes found for this author.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes.map(q => (
              <QuoteCard
                key={q.id}
                quote={q}
                isBookmarked={savedIds.includes(q.id)}
                onToggleBookmark={() => toggle(q.id)}
                onOpenDiscussion={() => { setDiscussionQuote(q); setIsDiscussionOpen(true); }}
                onShareCard={() => setShareCardQuote(q)}
                collections={collections}
                onAddToCollection={addToCollection}
                onRemoveFromCollection={removeFromCollection}
                onTagClick={() => {}}
                compact
              />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Explore all quotes
          </Link>
        </div>
      </main>

      <SiteFooter />

      {discussionQuote && (
        <DiscussionDrawer
          quote={discussionQuote}
          isOpen={isDiscussionOpen}
          onClose={() => { setIsDiscussionOpen(false); setDiscussionQuote(null); }}
        />
      )}

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
