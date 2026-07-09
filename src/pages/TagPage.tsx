import { useState, useEffect } from "react";
import { useQuotesList } from "../hooks/useQuotesList";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Tag } from "lucide-react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import QuoteCard from "../components/QuoteCard";
import DiscussionDrawer from "../components/DiscussionDrawer";
import ShareCardModal from "../components/ShareCardModal";
import { Quote } from "../types";
import { useBookmarks } from "../hooks/useBookmarks";
import { useCollections } from "../hooks/useCollections";
import SEO from "../components/SEO";

const BRAND = "#3D5A3E";
const PAGE_SIZE = 20;

export default function TagPage() {
  const { tag = "" } = useParams<{ tag: string }>();

  const { savedIds, toggle } = useBookmarks();
  const { collections, addToCollection, removeFromCollection } = useCollections();

  const [shareCardQuote, setShareCardQuote] = useState<Quote | null>(null);
  const [discussionQuote, setDiscussionQuote] = useState<Quote | null>(null);
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);

  const [page, setPage] = useState(1);
  const { data, quotes: pagedQuotes } = useQuotesList({
    tag,
    page,
    limit: PAGE_SIZE,
    slim: false,
  });

  useEffect(() => { setPage(1); }, [tag]);

  const taggedQuotesTotal = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const tagTitle = tag.charAt(0).toUpperCase() + tag.slice(1);

  return (
    <>
    <SEO
      title={`Explore #${tag} — browse, read and deep dive into quotes about ${tagTitle}`}
      description={`${taggedQuotesTotal} handpicked quotes tagged #${tag}. Read in context, discover counterpoints, and join the conversation on Inverted Comma.`}
      image={`https://www.invertedcomma.com/api/og/tag/${encodeURIComponent(tag)}`}
      path={`/tag/${tag}`}
    />
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
      <SiteHeader />

      <main className="flex-1 max-w-6xl mx-auto px-4 md:px-8 py-10 pb-16 w-full">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to explore
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-full"
              style={{ background: `${BRAND}18`, color: BRAND }}
            >
              <Tag className="w-3 h-3" />
              Tag
            </span>
          </div>
          <h1 className="font-serif italic font-bold text-3xl md:text-4xl text-stone-800">
            #{tag}
          </h1>
        </div>

        {taggedQuotesTotal === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-stone-200">
            <p className="font-serif italic text-stone-400 text-xl mb-2">No quotes yet for this tag.</p>
            <Link to="/" className="text-sm text-[#3D5A3E] hover:underline">Explore all quotes →</Link>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedQuotes.map(q => (
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
                compact
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-10">
              <button
                onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={page === 1}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-stone-200 text-stone-600 hover:border-stone-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-xs font-mono text-stone-400">Page {page} of {totalPages}</span>
              <button
                onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                disabled={page === totalPages}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-stone-200 text-stone-600 hover:border-stone-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
          </>
        )}
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
        <ShareCardModal quote={shareCardQuote} onClose={() => setShareCardQuote(null)} />
      )}
    </div>
    </>
  );
}
