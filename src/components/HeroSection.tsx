import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, Share2, ArrowRight, ChevronDown } from "lucide-react";
import { Quote } from "../types";

interface HeroSectionProps {
  quotes: Quote[];
  onShareCard?: (quote: Quote) => void;
}

export default function HeroSection({ quotes, onShareCard }: HeroSectionProps) {
  const [featured, setFeatured] = useState<Quote | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  useEffect(() => {
    if (quotes.length === 0) return;
    // Pick from the top 15 most-liked quotes for a quality hero
    const pool = [...quotes].sort((a, b) => b.likes - a.likes).slice(0, 15);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setFeatured(pick);
    setLikeCount(pick.likes);
  }, [quotes]);

  const handleLike = () => {
    setLiked((prev) => !prev);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  if (!featured) {
    return (
      <div className="h-72 bg-gradient-to-br from-[#0F1F10] via-[#1E3320] to-[#3D5A3E]" />
    );
  }

  // Truncate very long quotes for the hero
  const heroText =
    featured.text.length > 220 ? featured.text.slice(0, 217) + "…" : featured.text;

  return (
    <section className="relative bg-gradient-to-br from-[#0F1F10] via-[#1E3320] to-[#3D5A3E] overflow-hidden">
      {/* Decorative oversized quote mark */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{ opacity: 0.035 }}
      >
        <span className="text-white font-serif" style={{ fontSize: "36rem", lineHeight: 1 }}>
          &ldquo;
        </span>
      </div>

      {/* Soft glow orbs */}
      <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-emerald-600/10 blur-2xl pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 md:px-8 py-20 md:py-28 text-center">
        {/* Pill label */}
        <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-300/80 bg-white/10 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Featured quote
        </div>

        {/* Category */}
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300/50 mb-5">
          {featured.category}
        </p>

        {/* Quote */}
        <blockquote className="font-serif italic leading-tight text-white/95 mb-6"
          style={{ fontSize: "clamp(1.6rem, 4vw, 3.25rem)" }}
        >
          &ldquo;{heroText}&rdquo;
        </blockquote>

        {/* Author */}
        <cite className="block text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200/60 not-italic mb-12">
          — {featured.author}
          {featured.year && (
            <span className="ml-2 font-normal opacity-60">· {featured.year}</span>
          )}
        </cite>

        {/* Action — Deep dive only */}
        <div className="flex items-center justify-center">
          <Link
            to={`/q/${featured.slug}`}
            className="flex items-center gap-2 h-11 px-7 rounded-full text-sm font-semibold bg-white text-[#1E3320] hover:bg-emerald-50 transition-all shadow-lg shadow-black/20"
          >
            Deep dive
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Scroll hint — smooth scroll via JS */}
        <button
          onClick={() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" })}
          className="mt-16 flex flex-col items-center gap-2 opacity-30 hover:opacity-60 transition-opacity mx-auto w-fit"
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-white">
            Explore quotes
          </span>
          <ChevronDown className="w-4 h-4 text-white animate-bounce" />
        </button>
      </div>
    </section>
  );
}
