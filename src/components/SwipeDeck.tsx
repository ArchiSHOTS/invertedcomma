import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play, RefreshCw, Heart } from "lucide-react";
import { Quote, CustomCollection } from "../types";
import QuoteCard from "./QuoteCard";

interface SwipeDeckProps {
  quotes: Quote[];
  savedQuoteIds: string[];
  onToggleBookmark: (id: string) => void;
  collections: CustomCollection[];
  onAddToCollection: (colId: string, quoteId: string) => void;
  onRemoveFromCollection: (colId: string, quoteId: string) => void;
  onOpenDiscussion: (quote: Quote) => void;
  onShareCard?: (quote: Quote) => void;
  onTagClick?: (tag: string) => void;
}

// How long each card is shown before auto-advancing.
const AUTO_MS = 6000;

// A slimmed, non-interactive glimpse of the adjacent quote, shown as a sliver
// on each side so it's obvious you can move between cards (prev on the left,
// next on the right).
function PeekBody({ quote }: { quote: Quote }) {
  return (
    <div className="h-full bg-white border border-[#E5E1D9] rounded-2xl px-6 py-7 overflow-hidden shadow-sm select-none">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6B665E]">
        {quote.category}
      </span>
      <p className="font-serif italic text-[#1A1A1A] text-xl mt-4 leading-snug line-clamp-4">
        “{quote.text}”
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9A948C] mt-4">
        — {quote.author}
      </p>
    </div>
  );
}

// Direction-aware slide: forward (d=1) the card exits to the LEFT (right-to-left
// auto-swipe) and the next enters from the right; backward is the mirror.
const cardVariants = {
  enter: (d: number) => ({ x: d > 0 ? 64 : -64, scale: 0.92, opacity: 0 }),
  center: { x: 0, scale: 1, opacity: 1, rotate: 0 },
  exit: (d: number) => ({ x: d > 0 ? -420 : 420, rotate: d > 0 ? -8 : 8, opacity: 0 }),
};

export default function SwipeDeck({
  quotes,
  savedQuoteIds,
  onToggleBookmark,
  collections,
  onAddToCollection,
  onRemoveFromCollection,
  onOpenDiscussion,
  onShareCard,
  onTagClick,
}: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [playing, setPlaying] = useState(true);
  const [interacting, setInteracting] = useState(false); // hover / drag / focus
  const reduce = useReducedMotion();

  const n = quotes.length;

  // Keep index in range if the filtered list shrinks (tag/search change).
  useEffect(() => {
    if (index > n - 1) setIndex(0);
  }, [n, index]);

  const advance = useCallback(
    (d: 1 | -1) => {
      if (n <= 1) return;
      setDir(d);
      setIndex((prev) => (prev + d + n) % n);
    },
    [n],
  );

  const autoOn = playing && !interacting && !reduce && n > 1;

  // Auto-advance timer — restarts whenever the card or play-state changes.
  useEffect(() => {
    if (!autoOn) return;
    const t = setTimeout(() => advance(1), AUTO_MS);
    return () => clearTimeout(t);
  }, [index, autoOn, advance]);

  // Pause while the browser tab is hidden (don't churn quotes in the background).
  useEffect(() => {
    const onVis = () => setInteracting(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (n === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-[#F5F2ED] border border-[#E5E1D9] min-h-[400px]">
        <RefreshCw className="w-6 h-6 text-[#9A948C] mb-3" />
        <h4 className="font-serif font-bold text-[#1A1A1A] text-lg">No quotes match</h4>
        <p className="text-xs text-[#6B665E] max-w-xs mt-1">
          Try expanding your search or selecting a different tag.
        </p>
      </div>
    );
  }

  const safeIndex = index % n;
  const activeQuote = quotes[safeIndex];
  const isBookmarked = savedQuoteIds.includes(activeQuote.id);
  const prevQuote = quotes[(safeIndex - 1 + n) % n];
  const nextQuote = quotes[(safeIndex + 1) % n];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") advance(-1);
    else if (e.key === "ArrowRight") advance(1);
    else if (e.key === "s" || e.key === "S") onToggleBookmark(activeQuote.id);
    else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
  };

  return (
    <div
      className="max-w-lg mx-auto py-4 px-4 focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={() => setInteracting(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Explore quotes"
    >
      {/* Counter — signals position within a larger set ("there are more") */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-[#9A948C]">
          {String(safeIndex + 1).padStart(2, "0")}
          <span className="mx-1 text-[#CFC9BF]">/</span>
          {String(n).padStart(2, "0")}
        </span>
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-[#9A948C]">
          {autoOn ? "Auto-playing" : reduce ? "" : "Paused"}
        </span>
      </div>

      {/* Card deck area — active card centered, with a sliver of the previous
          card peeking on the left and the next card on the right. */}
      <div className="relative min-h-[440px] md:min-h-[400px] flex items-center justify-center mb-4 overflow-hidden">
        {/* Previous card — glimpsed on the left; click to go back */}
        {n > 1 && (
          <div
            onClick={() => advance(-1)}
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2 h-[300px] z-0 opacity-45 cursor-pointer transition-opacity hover:opacity-70"
            style={{ left: "-42%", width: "52%" }}
          >
            <PeekBody quote={prevQuote} />
          </div>
        )}
        {/* Next card — glimpsed on the right; click to advance */}
        {n > 1 && (
          <div
            onClick={() => advance(1)}
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2 h-[300px] z-0 opacity-45 cursor-pointer transition-opacity hover:opacity-70"
            style={{ right: "-42%", width: "52%" }}
          >
            <PeekBody quote={nextQuote} />
          </div>
        )}

        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          <motion.div
            key={activeQuote.id}
            custom={dir}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragStart={() => setInteracting(true)}
            onDragEnd={(_, info) => {
              // Swipe left → next, swipe right → previous (natural reading direction).
              if (info.offset.x < -90) advance(1);
              else if (info.offset.x > 90) advance(-1);
              setInteracting(false);
            }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            style={{ left: "8%", right: "8%" }}
            className="absolute cursor-grab active:cursor-grabbing z-10 touch-pan-y"
          >
            <QuoteCard
              quote={activeQuote}
              isBookmarked={isBookmarked}
              onToggleBookmark={() => onToggleBookmark(activeQuote.id)}
              onOpenDiscussion={() => onOpenDiscussion(activeQuote)}
              onShareCard={onShareCard ? () => onShareCard(activeQuote) : undefined}
              collections={collections}
              onAddToCollection={(colId) => onAddToCollection(colId, activeQuote.id)}
              onRemoveFromCollection={(colId) => onRemoveFromCollection(colId, activeQuote.id)}
              onTagClick={onTagClick}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Auto-advance progress bar — fills over AUTO_MS, restarts each card */}
      <div className="h-[3px] w-full bg-[#EDE9E2] rounded-full overflow-hidden mb-4">
        <motion.div
          key={`${index}-${autoOn}`}
          className="h-full bg-[#3D5A3E]"
          initial={{ width: "0%" }}
          animate={{ width: autoOn ? "100%" : "0%" }}
          transition={{ duration: autoOn ? AUTO_MS / 1000 : 0.3, ease: "linear" }}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => advance(-1)}
          disabled={n <= 1}
          className="flex-1 h-11 bg-white border border-[#E5E1D9] rounded-full flex items-center justify-center gap-2 text-xs font-medium text-[#6B665E] hover:text-[#1A1A1A] hover:bg-[#F5F2ED] transition-colors uppercase tracking-wider disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous quote"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex-shrink-0 w-11 h-11 bg-white border border-[#E5E1D9] rounded-full flex items-center justify-center text-[#3D5A3E] hover:bg-[#F5F2ED] transition-colors"
          aria-label={playing ? "Pause auto-play" : "Resume auto-play"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <button
          onClick={() => advance(1)}
          disabled={n <= 1}
          className="flex-1 h-11 bg-[#1A1A1A] border border-[#1A1A1A] rounded-full flex items-center justify-center gap-2 text-xs font-medium text-white hover:bg-neutral-800 transition-colors uppercase tracking-wider disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next quote"
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Teaching hint */}
      <p className="mt-3 text-center text-[11px] text-[#9A948C] flex items-center justify-center gap-1.5">
        Swipe or use the arrows to browse
        <span className="text-[#CFC9BF]">·</span>
        tap <Heart className="w-3 h-3 inline -mt-px" /> to save
      </p>
    </div>
  );
}
