import React, { useState, useRef, useEffect } from "react";
import { X, Download, Loader2, Check } from "lucide-react";
import { Quote } from "../types";
import { authorSlug } from "./QuoteCard";
import {
  Format, Theme, FORMATS, THEMES, drawQuoteCard, drawTextCard,
} from "../lib/quoteCard";

// Formats offered for the social bundle (per product spec).
const SOCIAL_FORMATS: { key: Format; label: string }[] = [
  { key: "square",      label: "Square" },
  { key: "instagram45", label: "Instagram 4:5" },
  { key: "linkedin",    label: "LinkedIn" },
  { key: "pinterest",   label: "Pinterest" },
  { key: "twitter",     label: "X" },
];

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("ic_token") ?? ""}` };
}

// Format a birth/death era from the author record, falling back to the quote year.
function formatEra(born?: string, died?: string, year?: number): string {
  if (born && died) return `${born} – ${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  if (typeof year === "number") return year < 0 ? `Quoted ${Math.abs(year)} BC` : `Quoted ${year}`;
  return "";
}

// Trim a full author bio to a card-friendly length, preferring a sentence boundary.
function trimBio(text: string, max = 320): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const sp = cut.lastIndexOf(" ");
  return cut.slice(0, sp > 0 ? sp : max).trim() + "…";
}

interface SavedBundle { context: string; authorLine: string; authorBio: string; counterpoint: string; }

interface SocialContentModalProps {
  quote: Quote;
  onClose: () => void;
  /** When opened from the dashboard for an already-saved bundle, pass its snapshots
   *  so we skip the AI call and author fetch entirely. */
  initial?: SavedBundle | null;
  /** Fired after a fresh bundle is generated + saved, so the dashboard can refresh. */
  onSaved?: () => void;
}

interface CardPreview { key: string; label: string; filename: string; url: string; }

export default function SocialContentModal({ quote, onClose, initial = null, onSaved }: SocialContentModalProps) {
  const [format, setFormat] = useState<Format>("square");
  const [theme, setTheme]   = useState<Theme>("green");

  const [counterpoint, setCounterpoint] = useState<string>(initial?.counterpoint ?? "");
  const [authorLine, setAuthorLine]     = useState<string>(initial?.authorLine ?? "");
  const [authorBio, setAuthorBio]       = useState<string>(initial?.authorBio ?? "");
  const [loading, setLoading]           = useState(!initial);
  const [error, setError]               = useState<string | null>(null);
  const [saved, setSaved]               = useState(!!initial);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const [previews, setPreviews] = useState<CardPreview[]>([]);

  const logoRef = useRef<HTMLImageElement | null>(null);
  const [logoReady, setLogoReady] = useState(false);

  // Preload the logo once.
  useEffect(() => {
    const img = new Image();
    img.onload  = () => { logoRef.current = img; setLogoReady(true); };
    img.onerror = () => setLogoReady(true);
    img.src = "/logo.svg";
  }, []);

  // Gather the dynamic content (counterpoint + author era), then persist the bundle.
  useEffect(() => {
    if (initial) return; // already have everything
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Author profile → era + bio (best-effort; non-fatal on failure). The author
        // endpoint auto-generates a bio when one is missing, so Card 3 carries real
        // information rather than just repeating the name.
        let era = formatEra(undefined, undefined, quote.year);
        let bio = "";
        try {
          const ar = await fetch(`/api/author/${authorSlug(quote.author)}`);
          if (ar.ok) {
            const d = await ar.json();
            const a = d.author || {};
            const e = formatEra(a.born, a.died, quote.year);
            if (e) era = a.nationality ? `${a.nationality} · ${e}` : e;
            else if (a.nationality) era = a.nationality;
            bio = trimBio(a.bio || a.knownFor || "");
          }
        } catch { /* keep fallback */ }

        // AI counterpoint (server-cached, so this is cheap on repeat)
        const cr = await fetch(`/api/discussions/${quote.id}/ai-counterpoint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quoteText: quote.text, author: quote.author }),
        });
        if (!cr.ok) throw new Error("Could not generate counterpoint");
        const cd = await cr.json();
        const cp = cd.aiCounterpoint || "";
        if (cancelled) return;

        setAuthorLine(era);
        setAuthorBio(bio);
        setCounterpoint(cp);

        // Persist the bundle so it appears in the dashboard and re-downloads never re-call AI.
        const save = await fetch(`/api/admin/social-content/${quote.id}`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ context: quote.context || "", authorLine: era, authorBio: bio, counterpoint: cp }),
        });
        if (!cancelled && save.ok) { setSaved(true); onSaved?.(); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [quote, initial, onSaved]);

  // Render every card to a PNG data URL whenever inputs change.
  useEffect(() => {
    if (loading && !initial) return;
    const canvas = document.createElement("canvas");
    const out: CardPreview[] = [];
    const slug = quote.slug || quote.id;

    // Card 1 — main quote
    drawQuoteCard(canvas, quote, format, theme, logoRef.current);
    out.push({ key: "quote", label: "Quote", filename: `inverted-comma-${slug}-1-quote.png`, url: canvas.toDataURL("image/png") });

    // Card 2 — context (only when present → yields 3 or 4 cards)
    if (quote.context && quote.context.trim()) {
      drawTextCard(canvas, { kicker: "CONTEXT", body: quote.context.trim(), bodyStyle: "serif" }, format, theme, logoRef.current);
      out.push({ key: "context", label: "Context", filename: `inverted-comma-${slug}-2-context.png`, url: canvas.toDataURL("image/png") });
    }

    // Card 3 — about the author (name + era + a real bio)
    drawTextCard(canvas, {
      kicker: "ABOUT THE AUTHOR",
      heading: quote.author,
      subheading: authorLine,
      body: authorBio,
      bodyStyle: "sans",
    }, format, theme, logoRef.current);
    out.push({ key: "author", label: "Author", filename: `inverted-comma-${slug}-3-author.png`, url: canvas.toDataURL("image/png") });

    // Card 4 — AI counterpoint
    if (counterpoint && counterpoint.trim()) {
      drawTextCard(canvas, { kicker: "COUNTERPOINT", body: counterpoint.trim(), bodyStyle: "serif", bodyItalic: true }, format, theme, logoRef.current);
      out.push({ key: "counterpoint", label: "Counterpoint", filename: `inverted-comma-${slug}-4-counterpoint.png`, url: canvas.toDataURL("image/png") });
    }

    setPreviews(out);
  }, [quote, format, theme, counterpoint, authorLine, authorBio, loading, initial, logoReady]);

  const downloadOne = (p: CardPreview) => {
    const a = document.createElement("a");
    a.href = p.url;
    a.download = p.filename;
    a.click();
  };

  // No zip dependency: trigger sequential downloads with a small gap so the browser
  // doesn't coalesce/block them.
  const downloadAll = async () => {
    setDownloadingAll(true);
    try {
      for (const p of previews) {
        downloadOne(p);
        await new Promise(r => setTimeout(r, 350));
      }
    } finally { setDownloadingAll(false); }
  };

  const cfg = FORMATS[format];
  const previewScale = Math.min(220 / cfg.w, 300 / cfg.h);
  const pw = Math.round(cfg.w * previewScale);
  const ph = Math.round(cfg.h * previewScale);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-[#FBF9F6] w-full sm:max-w-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[95dvh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 flex-shrink-0">
            <div>
              <h2 className="font-serif italic font-bold text-stone-800 text-lg">Social Content</h2>
              <p className="text-[11px] text-stone-400 truncate max-w-md">“{quote.text}” — {quote.author}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Format picker */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-2">Format</p>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_FORMATS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFormat(key)}
                    className={`px-3 h-8 rounded-full text-xs font-medium transition-all border ${
                      format === key ? "bg-[#3D5A3E] text-white border-[#3D5A3E]" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme picker */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3">Theme</p>
              <div className="flex gap-5">
                {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([key, th]) => {
                  const isLight = key === "cream" || key === "minimal";
                  const ringColor = isLight ? "#C5BEB4" : th.swatch;
                  return (
                    <button
                      key={key}
                      onClick={() => setTheme(key)}
                      title={key.charAt(0).toUpperCase() + key.slice(1)}
                      className="relative w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                      style={{
                        background: th.swatch,
                        boxShadow: theme === key
                          ? `0 0 0 1.5px #FBF9F6, 0 0 0 3.5px ${ringColor}`
                          : `0 0 0 1px ${isLight ? "#D6D0C8" : "transparent"}`,
                      }}
                    >
                      {theme === key && (
                        <svg className="absolute inset-0 m-auto w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7.5l2.8 2.8 6-6.5" stroke={isLight ? "#3D5A3E" : "white"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">
                  {previews.length} card{previews.length === 1 ? "" : "s"} · {cfg.w}×{cfg.h}px
                </p>
                {saved && <span className="text-[10px] text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-stone-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-3" />
                  <p className="text-sm">Generating counterpoint &amp; building cards…</p>
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-500 text-sm">{error}</div>
              ) : (
                <div className="flex flex-wrap gap-4 justify-center">
                  {previews.map((p) => (
                    <div key={p.key} className="flex flex-col items-center gap-2">
                      <img src={p.url} alt={p.label} width={pw} height={ph} className="rounded-lg shadow-md" style={{ border: "1px solid #E8E4DD" }} />
                      <button
                        onClick={() => downloadOne(p)}
                        className="text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> {p.label}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 p-4 border-t border-stone-200 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 h-11 flex items-center justify-center gap-2 border border-stone-200 rounded-full text-sm font-medium text-stone-700 hover:bg-stone-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={downloadAll}
              disabled={downloadingAll || loading || previews.length === 0}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-colors disabled:opacity-50 hover:opacity-90"
              style={{ background: "#3D5A3E" }}
            >
              {downloadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloadingAll ? "Saving…" : `Download all (${previews.length})`}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
