import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

export function authorSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function AuthorLink({ name, className }: { name: string; className?: string }) {
  return (
    <Link
      to={`/author/${authorSlug(name)}`}
      className={className ?? "hover:underline hover:text-stone-700 transition-colors"}
      onClick={e => e.stopPropagation()}
    >
      {name}
    </Link>
  );
}
import {
  Heart, Bookmark, Share2, MessageSquare,
  Plus, Check, FolderClosed, BookOpen, ExternalLink, FileSearch,
} from "lucide-react";
import { Quote, CustomCollection } from "../types";
import { useAnatomyIds } from "../hooks/useAnatomyIds";

interface QuoteCardProps {
  key?: string;
  quote: Quote;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenDiscussion: () => void;
  onShareCard?: () => void;
  collections: CustomCollection[];
  onAddToCollection: (colId: string, quoteId: string) => void;
  onRemoveFromCollection: (colId: string, quoteId: string) => void;
  onTagClick?: (tag: string) => void;
  compact?: boolean;
}

// Brand colour matching the logo
const BRAND = "#3D5A3E";

export default function QuoteCard({
  quote,
  isBookmarked,
  onToggleBookmark,
  onOpenDiscussion,
  onShareCard,
  collections,
  onAddToCollection,
  onRemoveFromCollection,
  onTagClick,
  compact = false,
}: QuoteCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn } = useUser();
  const anatomyIds = useAnatomyIds();
  const hasAnatomy = anatomyIds.has(quote.id);
  const [likesCount, setLikesCount] = useState(quote.likes);
  const [hasLiked, setHasLiked] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // ── Sponsored variant ──────────────────────────────────────────────────────
  if (quote.sponsored) {
    return (
      <div className="relative bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col gap-3 w-full">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
            Sponsored
          </span>
          {quote.sponsorLabel && (
            <span className="text-[9px] text-amber-500 font-mono">{quote.sponsorLabel}</span>
          )}
        </div>
        <blockquote className="font-serif italic text-lg leading-snug text-stone-800">
          &ldquo;{quote.text}&rdquo;
        </blockquote>
        <cite className="text-xs font-bold uppercase tracking-wider text-stone-500 not-italic">
          — <AuthorLink name={quote.author} />
        </cite>
        {quote.sponsorUrl && (
          <a
            href={quote.sponsorUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Learn more
          </a>
        )}
      </div>
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleLike = () => {
    if (!isLoggedIn) {
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setHasLiked((prev) => !prev);
    setLikesCount((c) => (hasLiked ? c - 1 : c + 1));
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/q/${quote.slug}`;
    const text = `"${quote.text}" — ${quote.author}`;
    if (navigator.share) {
      try { await navigator.share({ title: quote.author, text, url }); return; } catch {}
    }
    navigator.clipboard.writeText(`${text}\n${url}`);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  // Clamp long quotes in grid view
  const displayText =
    compact && quote.text.length > 180
      ? quote.text.slice(0, 177) + "…"
      : quote.text;

  const visibleTags = quote.tags.slice(0, compact ? 3 : 4);

  // ── Card ───────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={() => navigate(`/q/${quote.slug}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(`/q/${quote.slug}`); }}
      className="group relative bg-white border border-stone-200 rounded-2xl flex flex-col gap-0 hover:shadow-lg hover:border-stone-300 transition-all duration-200 overflow-hidden w-full cursor-pointer"
    >

      {/* Category stripe */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full"
            style={{ background: `${BRAND}15`, color: BRAND }}
          >
            {quote.category}
          </span>
          {hasAnatomy && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full"
              style={{ background: `${BRAND}15`, color: BRAND }}
              title="This quote has a detailed anatomy"
            >
              <FileSearch className="w-3 h-3" />
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleLike(); }}
          className={`flex items-center gap-1 text-xs font-mono rounded-full px-2.5 py-1 transition-all ${
            hasLiked
              ? "bg-rose-50 text-rose-500"
              : "text-stone-400 hover:text-rose-400"
          }`}
          aria-label="Like"
        >
          <Heart className={`w-3.5 h-3.5 ${hasLiked ? "fill-rose-500" : ""}`} />
          {likesCount.toLocaleString()}
        </button>
      </div>

      {/* Quote body */}
      <div className="flex-1 px-5 pb-4">
        <blockquote className={`font-serif italic leading-snug text-stone-800 mb-3 ${compact ? "text-[1.15rem]" : "text-xl"}`}>
          &ldquo;{displayText}&rdquo;
        </blockquote>
        <cite className="text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400 not-italic">
          — <AuthorLink name={quote.author} className="hover:text-stone-600 hover:underline transition-colors" />
          {quote.year && (
            <span className="ml-1.5 font-normal opacity-70">
              · {quote.year < 0 ? `${Math.abs(quote.year)} BC` : quote.year}
            </span>
          )}
        </cite>
      </div>

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {visibleTags.map((tag) => (
            <button
              key={tag}
              onClick={(e) => { e.stopPropagation(); onTagClick ? onTagClick(tag) : navigate(`/tag/${tag}`); }}
              className="px-2.5 py-1 text-[10px] text-stone-500 bg-stone-50 hover:bg-stone-100 rounded-full border border-stone-200 transition-colors"
            >
              #{tag}
            </button>
          ))}
          {quote.tags.length > visibleTags.length && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/q/${quote.slug}`); }}
              className="px-2 py-1 text-[10px] text-stone-400 hover:text-stone-600 font-mono transition-colors"
              aria-label="View all tags"
            >
              +{quote.tags.length - visibleTags.length}
            </button>
          )}
        </div>
      )}

      {/* Book strip */}
      {quote.relatedBooks && quote.relatedBooks.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-stone-100 bg-stone-50/60">
          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 flex-shrink-0">Read:</span>
          {quote.relatedBooks.slice(0, 2).map((book) => (
            <a
              key={book.title}
              href={book.affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-800 hover:underline transition-colors font-medium truncate"
            >
              <BookOpen className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate max-w-[110px]">{book.title}</span>
            </a>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
        {/* Left: icon actions */}
        <div className="flex items-center gap-1">
          {/* Bookmark */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              isBookmarked
                ? "bg-stone-800 text-white"
                : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            }`}
            aria-label="Bookmark"
          >
            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-white" : ""}`} />
          </button>

          {/* Add to collection */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowFolderMenu(!showFolderMenu); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                showFolderMenu
                  ? "bg-stone-800 text-white"
                  : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              }`}
              aria-label="Add to folder"
            >
              <FolderClosed className="w-3.5 h-3.5" />
            </button>
            {showFolderMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowFolderMenu(false); }} />
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-full left-0 mb-2 w-52 bg-white border border-stone-200 rounded-xl shadow-xl p-2 z-20 space-y-0.5"
                >
                  <p className="text-[9px] font-bold uppercase tracking-wider text-stone-400 px-2 py-1.5 border-b border-stone-100">
                    Save to folder
                  </p>
                  {collections.length === 0 ? (
                    <p className="text-[10px] text-stone-500 p-2 italic">No folders yet — create one in Library.</p>
                  ) : (
                    collections.map((col) => {
                      const inCol = col.quoteIds.includes(quote.id);
                      return (
                        <button
                          key={col.id}
                          onClick={() => inCol
                            ? onRemoveFromCollection(col.id, quote.id)
                            : onAddToCollection(col.id, quote.id)
                          }
                          className="w-full text-left text-xs px-2.5 py-2 rounded-lg flex items-center justify-between hover:bg-stone-50 transition text-stone-700"
                        >
                          <span className="truncate max-w-[140px]">{col.name}</span>
                          {inCol
                            ? <Check className="w-3.5 h-3.5 text-stone-800 flex-shrink-0" />
                            : <Plus className="w-3 h-3 text-stone-400 flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Share */}
          <button
            onClick={(e) => { e.stopPropagation(); (onShareCard || handleShare)(); }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              copiedShare
                ? "bg-stone-800 text-white"
                : "text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            }`}
            aria-label="Share"
          >
            {copiedShare ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Right: Deep dive */}
        <div className="flex items-center gap-2">
          <Link
            to={`/q/${quote.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="h-8 px-3 rounded-full text-[10px] font-semibold text-white flex items-center gap-1.5 transition-all"
            style={{ background: BRAND }}
          >
            <BookOpen className="w-3 h-3" />
            <span className="hidden sm:inline">Deep dive</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
