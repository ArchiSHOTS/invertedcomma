import React, { useState, useRef, useCallback, useEffect } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { Quote } from "../types";
import { Format, Theme, FORMATS, THEMES, drawQuoteCard } from "../lib/quoteCard";

// ShareCard exposes three classic formats; the full set lives in lib/quoteCard.
const SHARE_FORMATS: Format[] = ["square", "story", "twitter"];

// --- Format shape icons -------------------------------------------------------
// All drawn in a shared 48×48 viewBox; shapes are proportional silhouettes,
// no button background — just the outline.
function FormatIcon({ fmt, active }: { fmt: Format; active: boolean }) {
  const stroke = active ? "#3D5A3E" : "#C0BAB2";
  const fill   = active ? "#3D5A3E1A" : "none";
  const sw = 2;
  const r  = 2.5;
  if (fmt === "square") return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
      <rect x="9" y="9" width="30" height="30" rx={r} stroke={stroke} strokeWidth={sw} fill={fill}/>
    </svg>
  );
  if (fmt === "story") return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
      {/* 9:16 → 18×32 centred in 48×48 */}
      <rect x="15" y="8" width="18" height="32" rx={r} stroke={stroke} strokeWidth={sw} fill={fill}/>
    </svg>
  );
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
      {/* 1200:628 ≈ 1.91:1 → 36×19 centred */}
      <rect x="6" y="14.5" width="36" height="19" rx={r} stroke={stroke} strokeWidth={sw} fill={fill}/>
    </svg>
  );
}

interface ShareCardModalProps {
  quote: Quote;
  onClose: () => void;
}

// --- Component ----------------------------------------------------------------
export default function ShareCardModal({ quote, onClose }: ShareCardModalProps) {
  const [format, setFormat]           = useState<Format>("square");
  const [theme, setTheme]             = useState<Theme>("green");
  const [copied, setCopied]           = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl]   = useState("");

  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef      = useRef<HTMLImageElement | null>(null);
  const [logoReady, setLogoReady]     = useState(false);

  // Preload the SVG logo once
  useEffect(() => {
    const img = new Image();
    img.onload  = () => { logoRef.current = img; setLogoReady(true); };
    img.onerror = () => { setLogoReady(true); }; // proceed without logo on error
    img.src = "/logo.svg";
  }, []);

  const getCanvas = useCallback((): HTMLCanvasElement => {
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    return offscreenRef.current;
  }, []);

  // Re-render canvas whenever any input changes (or logo finishes loading)
  useEffect(() => {
    const canvas = getCanvas();
    drawQuoteCard(canvas, quote, format, theme, logoRef.current);
    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [quote, format, theme, getCanvas, logoReady]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const a = document.createElement("a");
      a.href     = getCanvas().toDataURL("image/png");
      a.download = `inverted-comma-${quote.slug}-${format}-${theme}.png`;
      a.click();
    } finally { setDownloading(false); }
  };

  const handleCopy = async () => {
    getCanvas().toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } catch {
        navigator.clipboard.writeText(
          `“${quote.text}” — ${quote.author}\nwww.invertedcomma.com/q/${quote.slug}`
        );
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }, "image/png");
  };

  const cfg = FORMATS[format];
  const previewScale = Math.min(340 / cfg.w, 460 / cfg.h);
  const previewW = Math.round(cfg.w * previewScale);
  const previewH = Math.round(cfg.h * previewScale);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose} />

      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-[#FBF9F6] w-full sm:max-w-xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[95dvh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 flex-shrink-0">
            <h2 className="font-serif italic font-bold text-stone-800 text-lg">Share</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Format picker — three bare proportional shape icons, centred */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-2">Format</p>
              <div className="flex justify-center gap-6">
                {SHARE_FORMATS.map((key) => (
                  <button
                    key={key}
                    onClick={() => setFormat(key)}
                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                    className="flex items-center justify-center w-11 h-11 rounded-xl transition-all hover:bg-stone-100 focus:outline-none"
                  >
                    <FormatIcon fmt={key} active={format === key} />
                  </button>
                ))}
              </div>
            </div>

            {/* Theme picker — four coloured circles, centred, all with visible ring */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3">Theme</p>
              <div className="flex justify-center gap-5">
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

            {/* Preview */}
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3">Preview</p>
              <div className="flex justify-center">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Card preview"
                    width={previewW}
                    height={previewH}
                    className="rounded-lg shadow-md"
                    style={{ border: "1px solid #E8E4DD" }}
                  />
                ) : (
                  <div className="rounded-lg bg-stone-100 animate-pulse" style={{ width: previewW, height: previewH }} />
                )}
              </div>
              <p className="text-center text-[10px] text-stone-400 font-mono mt-2">
                {cfg.w}×{cfg.h}px · PNG · {cfg.platform}
              </p>
            </div>

          </div>

          {/* Actions */}
          <div className="flex gap-2 p-4 border-t border-stone-200 flex-shrink-0">
            <button
              onClick={handleCopy}
              className={`flex-1 h-11 flex items-center justify-center gap-2 border rounded-full text-sm font-medium transition-colors ${
                copied ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-stone-200 text-stone-700 hover:bg-stone-100"
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy image"}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 h-11 flex items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-colors disabled:opacity-50 hover:opacity-90"
              style={{ background: "#3D5A3E" }}
            >
              <Download className="w-4 h-4" />
              {downloading ? "Saving…" : "Download PNG"}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
