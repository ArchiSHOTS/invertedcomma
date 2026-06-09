import React, { useState, useRef, useCallback, useEffect } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { Quote } from "../types";

// --- Types --------------------------------------------------------------------
type Format = "square" | "story" | "twitter";
type Theme  = "green" | "dark" | "cream" | "minimal";

const FORMATS: Record<Format, { platform: string; w: number; h: number; pad: number }> = {
  square:  { platform: "Instagram / Facebook", w: 1080, h: 1080, pad: 88  },
  story:   { platform: "Stories",              w: 1080, h: 1920, pad: 100 },
  twitter: { platform: "Twitter / X",          w: 1200, h: 628,  pad: 72  },
};

const THEMES: Record<Theme, { swatch: string; bg: string; text: string; accent: string; border: string; brand: string; tagBg: string }> = {
  green:   { swatch: "#3D5A3E", bg: "#0F1F10", text: "#FFFFFF", accent: "#7FAF82", border: "#2D4A2E", brand: "#FFFFFF", tagBg: "#1B3A1D" },
  dark:    { swatch: "#1A1A1A", bg: "#1A1A1A", text: "#FFFFFF", accent: "#9A948C", border: "#2F2F2F", brand: "#FFFFFF", tagBg: "#282828" },
  cream:   { swatch: "#FBF9F6", bg: "#FBF9F6", text: "#1A1A1A", accent: "#6B665E", border: "#DDD9D0", brand: "#3D5A3E", tagBg: "#EDE9E3" },
  minimal: { swatch: "#FFFFFF", bg: "#FFFFFF", text: "#111111", accent: "#888888", border: "#DEDEDE", brand: "#3D5A3E", tagBg: "#F2F2F2" },
};

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

// --- Canvas helpers -----------------------------------------------------------
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + R);
  ctx.lineTo(x + w, y + h - R);
  ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
  ctx.lineTo(x + R, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - R);
  ctx.lineTo(x, y + R);
  ctx.quadraticCurveTo(x, y,         x + R, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitQuote(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number, maxPt: number, minPt: number): { size: number; lines: string[] } {
  for (let size = maxPt; size >= minPt; size -= 2) {
    ctx.font = `italic ${size}px Georgia, "Times New Roman", serif`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * 1.45 <= maxHeight) return { size, lines };
  }
  ctx.font = `italic ${minPt}px Georgia, "Times New Roman", serif`;
  return { size: minPt, lines: wrapText(ctx, text, maxWidth) };
}

// Colorise a loaded image to a flat colour via offscreen canvas compositing
function tintedImage(src: HTMLImageElement, color: string, targetW: number, targetH: number): HTMLCanvasElement {
  const tmp = document.createElement("canvas");
  tmp.width  = targetW;
  tmp.height = targetH;
  const tc = tmp.getContext("2d")!;
  tc.drawImage(src, 0, 0, targetW, targetH);
  tc.globalCompositeOperation = "source-in";
  tc.fillStyle = color;
  tc.fillRect(0, 0, targetW, targetH);
  return tmp;
}

// --- Draw a single card frame onto the canvas --------------------------------
function drawCard(
  canvas: HTMLCanvasElement,
  quote: Quote,
  format: Format,
  theme: Theme,
  logoImg: HTMLImageElement | null,
) {
  const cfg = FORMATS[format];
  const t   = THEMES[theme];
  const DPR = 2;

  canvas.width  = cfg.w * DPR;
  canvas.height = cfg.h * DPR;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);

  const W   = cfg.w;
  const H   = cfg.h;
  const PAD = cfg.pad;
  const isTw = format === "twitter";

  // -- Background --------------------------------------------------------------
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // -- Ghost quote mark --------------------------------------------------------
  const glyphSize = Math.round(H * 0.62);
  ctx.save();
  ctx.font = `italic bold ${glyphSize}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.07;
  ctx.fillText("“", PAD - Math.round(glyphSize * 0.18), Math.round(H * 0.56));
  ctx.restore();

  // -- Tag pill ----------------------------------------------------------------
  const tag       = (quote.tags[0] || quote.category || "quote").toUpperCase();
  const tagLabel  = `#${tag}`;
  const tagFontSz = isTw ? 20 : 24;
  ctx.font = `bold ${tagFontSz}px Helvetica Neue, Arial, sans-serif`;
  const tagTextW = ctx.measureText(tagLabel).width;
  const tagPillH = tagFontSz + 18;
  const tagPillW = tagTextW + 36;
  ctx.fillStyle = t.tagBg;
  rrect(ctx, PAD, PAD, tagPillW, tagPillH, tagPillH / 2);
  ctx.fill();
  ctx.fillStyle = t.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(tagLabel, PAD + 18, PAD + tagPillH / 2);

  // -- Footer layout (bottom-up) -----------------------------------------------
  // logo SVG aspect ratio from viewBox="0 0 1410 383"
  const LOGO_ASPECT = 1410 / 383;
  const logoH   = isTw ? 36 : 50;
  const logoW   = logoH * LOGO_ASPECT;
  const urlFontSz    = isTw ? 20 : 26;
  const authorFontSz = isTw ? 22 : 28;

  const urlY       = H - PAD;                           // url text baseline
  const logoBottom = urlY - urlFontSz - (isTw ? 14 : 18);
  const logoTop    = logoBottom - logoH;
  const divY       = logoTop - (isTw ? 20 : 26);
  const FOOTER_TOP = divY;

  // -- Content zone ------------------------------------------------------------
  const CONTENT_TOP = PAD + tagPillH + (isTw ? 28 : 44);
  const CONTENT_H   = FOOTER_TOP - CONTENT_TOP - (isTw ? 28 : 40);
  const QUOTE_W     = W - PAD * 2;

  // -- Quote text --------------------------------------------------------------
  const rawText     = quote.text.length > 220 ? quote.text.slice(0, 218) + "…" : quote.text;
  const displayText = `“${rawText}”`;
  const maxPt = isTw ? 52 : 72;
  const minPt = isTw ? 28 : 36;

  const AUTHOR_BLOCK_H = authorFontSz + (isTw ? 28 : 36);
  const { size: quotePt, lines } = fitQuote(ctx, displayText, QUOTE_W, CONTENT_H - AUTHOR_BLOCK_H, maxPt, minPt);
  const lineH       = quotePt * 1.45;
  const quoteBlockH = lines.length * lineH;
  const totalBlockH = quoteBlockH + AUTHOR_BLOCK_H;
  const blockTop    = CONTENT_TOP + Math.max(0, (CONTENT_H - totalBlockH) / 2);

  ctx.font = `italic ${quotePt}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = t.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let ty = blockTop + quotePt;
  for (const line of lines) { ctx.fillText(line, PAD, ty); ty += lineH; }

  // -- Author + year -----------------------------------------------------------
  const authorText =
    `— ${quote.author.toUpperCase()}` +
    (quote.year ? `  ·  ${quote.year < 0 ? `${Math.abs(quote.year)} BC` : String(quote.year)}` : "");
  const authorY = blockTop + quoteBlockH + (isTw ? 24 : 30) + authorFontSz;
  ctx.font = `bold ${authorFontSz}px Helvetica Neue, Arial, sans-serif`;
  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(authorText, W / 2, authorY);

  // -- Divider -----------------------------------------------------------------
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // -- Logo: SVG image or text fallback, centred --------------------------------
  if (logoImg) {
    // Render at 2× internal resolution for sharpness, then draw at logical size
    const tinted = tintedImage(logoImg, t.brand, Math.round(logoW * DPR), Math.round(logoH * DPR));
    const lx = (W - logoW) / 2;
    ctx.drawImage(tinted, lx, logoTop, logoW, logoH);
  } else {
    // Fallback: letter-spaced text, centred
    const logoFontSz = isTw ? 28 : 36;
    ctx.font = `bold ${logoFontSz}px Helvetica Neue, Arial, sans-serif`;
    ctx.fillStyle = t.brand;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("INVERTED COMMA", W / 2, logoBottom);
  }

  // -- URL, centred ------------------------------------------------------------
  ctx.font = `${urlFontSz}px Helvetica Neue, Arial, sans-serif`;
  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("www.invertedcomma.com", W / 2, urlY);
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
    drawCard(canvas, quote, format, theme, logoRef.current);
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
                {(Object.keys(FORMATS) as Format[]).map((key) => (
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
                        // Always show a 1px border so cream/white are visible against the modal bg
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
