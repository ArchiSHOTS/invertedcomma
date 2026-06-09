import { useState } from "react";
import { Play, ExternalLink, Clock, User } from "lucide-react";
import { Quote } from "../types";

interface VideoQuoteCardProps {
  quote: Quote;
  onOpenDiscussion?: () => void;
  onShareCard?: () => void;
}

function secondsToTimestamp(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function VideoQuoteCard({ quote, onOpenDiscussion, onShareCard }: VideoQuoteCardProps) {
  const [playing, setPlaying] = useState(false);
  const vt = quote.videoTimestamp!;

  const youtubeEmbedUrl = `https://www.youtube.com/embed/${vt.youtubeId}?start=${vt.startSeconds}&autoplay=1&rel=0&modestbranding=1`;
  const youtubeLinkUrl = `https://youtu.be/${vt.youtubeId}?t=${vt.startSeconds}`;

  return (
    <div className="bg-white border border-[#E5E1D9] hover:border-[#1A1A1A] transition-all duration-200 w-full">

      {/* Video area */}
      <div className="relative bg-[#1A1A1A] aspect-video overflow-hidden">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl}
            title={`${quote.author} — ${quote.text.slice(0, 50)}`}
            className="w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            {/* Thumbnail */}
            <img
              src={vt.thumbnailUrl || `https://img.youtube.com/vi/${vt.youtubeId}/hqdefault.jpg`}
              alt={`Video: ${quote.author}`}
              className="w-full h-full object-cover opacity-70"
            />
            {/* Play button */}
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center group"
              aria-label="Play video"
            >
              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Play className="w-6 h-6 text-[#1A1A1A] fill-[#1A1A1A] ml-1" />
              </div>
            </button>

            {/* Timestamp badge */}
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {secondsToTimestamp(vt.startSeconds)}
              {vt.endSeconds && ` – ${secondsToTimestamp(vt.endSeconds)}`}
            </div>

            {/* Video label */}
            <div className="absolute top-2 left-2 bg-[#FF0000]/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
              YouTube
            </div>
          </>
        )}
      </div>

      {/* Quote content */}
      <div className="p-5 space-y-3">
        {/* Category + speaker */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#9A948C]">
            {quote.category}
          </span>
          {vt.speakerName && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-[#6B665E]">
              <User className="w-2.5 h-2.5" />
              {vt.speakerName}
            </span>
          )}
        </div>

        {/* Quote */}
        <blockquote className="font-serif italic text-lg leading-snug text-[#1A1A1A]">
          "{quote.text}"
        </blockquote>
        <cite className="block text-xs font-bold uppercase tracking-[0.15em] text-[#1A1A1A] not-italic">
          — {quote.author}
          {quote.source && (
            <span className="font-serif italic font-normal text-[#6B665E] tracking-normal lowercase ml-2">
              ({quote.source})
            </span>
          )}
        </cite>

        {/* Context */}
        {quote.context && (
          <p className="text-xs text-[#6B665E] leading-relaxed border-l-2 border-[#E5E1D9] pl-3">
            {quote.context}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {quote.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 border border-[#E5E1D9] text-[#6B665E] rounded-full text-[10px]"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between pt-2 border-t border-[#E5E1D9]">
          <a
            href={youtubeLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] text-[#6B665E] hover:text-[#1A1A1A] font-medium transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Watch on YouTube
          </a>

          <div className="flex items-center gap-2">
            {onShareCard && (
              <button
                onClick={onShareCard}
                className="h-8 px-3 border border-[#E5E1D9] rounded-full text-[10px] font-mono text-[#6B665E] hover:bg-[#F5F2ED] transition-colors"
              >
                Share
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
