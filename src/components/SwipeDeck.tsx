import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);

  if (quotes.length === 0) {
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

  const activeQuote = quotes[currentIndex % quotes.length];
  const isBookmarked = savedQuoteIds.includes(activeQuote.id);

  const goNext = () => {
    setSwipeDir("left");
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
      setSwipeDir(null);
    }, 200);
  };

  const goPrev = () => {
    setSwipeDir("right");
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + quotes.length) % quotes.length);
      setSwipeDir(null);
    }, 200);
  };

  const handleSwipeRight = () => {
    // Swipe right = save & advance
    if (!isBookmarked) onToggleBookmark(activeQuote.id);
    setSwipeDir("right");
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
      setSwipeDir(null);
    }, 250);
  };

  const handleSwipeLeft = () => {
    // Swipe left = skip
    setSwipeDir("left");
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
      setSwipeDir(null);
    }, 250);
  };

  const handleToggleBookmark = () => onToggleBookmark(activeQuote.id);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "s" || e.key === "S") handleToggleBookmark();
  };

  return (
    <div
      className="max-w-lg mx-auto py-4 px-4 focus:outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Card deck area */}
      <div className="relative min-h-[440px] md:min-h-[400px] flex items-center justify-center mb-6">
        {/* Ghost stack */}
        <div className="absolute top-3 w-[95%] h-[99%] bg-[#F0EDE8] border border-[#E5E1D9] rotate-1 translate-y-2 z-0 opacity-70 rounded-none" />
        <div className="absolute top-5 w-[90%] h-[97%] bg-[#E8E4DF]/50 border border-[#E5E1D9]/50 -rotate-1 translate-y-3 z-[-1] opacity-50 rounded-none" />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeQuote.id}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.65}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) handleSwipeRight();
              else if (info.offset.x < -100) handleSwipeLeft();
            }}
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: 0,
              x: swipeDir === "left" ? -380 : swipeDir === "right" ? 380 : 0,
              rotate: swipeDir === "left" ? -10 : swipeDir === "right" ? 10 : 0,
            }}
            exit={{ scale: 0.95, opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="w-full absolute cursor-grab active:cursor-grabbing z-10 touch-pan-y"
          >
            <QuoteCard
              quote={activeQuote}
              isBookmarked={isBookmarked}
              onToggleBookmark={handleToggleBookmark}
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

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={goPrev}
          className="flex-1 h-11 bg-white border border-[#E5E1D9] rounded-full flex items-center justify-center gap-2 text-xs font-medium text-[#6B665E] hover:text-[#1A1A1A] hover:bg-[#F5F2ED] transition-colors uppercase tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <button
          onClick={goNext}
          className="flex-1 h-11 bg-[#1A1A1A] border border-[#1A1A1A] rounded-full flex items-center justify-center gap-2 text-xs font-medium text-white hover:bg-neutral-800 transition-colors uppercase tracking-wider"
        >
          <span>Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

    </div>
  );
}
