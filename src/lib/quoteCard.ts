/**
 * Shared quote-card rendering engine.
 *
 * Used by:
 *   - ShareCardModal      → the single "main quote" share card (Card 1)
 *   - SocialContentModal  → the 4-card social bundle (quote / context / author / counterpoint)
 *
 * All drawing is canvas-based at 2× DPR for crisp PNG export. Keep this dependency-free.
 */
import { Quote } from "../types";

// ── Formats ───────────────────────────────────────────────────────────────────
// Superset of every platform aspect we support. Each modal exposes the subset it needs.
export type Format =
  | "square"      // 1:1   — Instagram / Facebook
  | "story"       // 9:16  — Stories
  | "twitter"     // 1.91:1 — X / Twitter
  | "linkedin"    // 1.91:1 — LinkedIn
  | "pinterest"   // 2:3   — Pinterest
  | "instagram45";// 4:5   — Instagram portrait

export const FORMATS: Record<Format, { platform: string; w: number; h: number; pad: number }> = {
  square:       { platform: "Instagram / Facebook", w: 1080, h: 1080, pad: 88  },
  story:        { platform: "Stories",              w: 1080, h: 1920, pad: 100 },
  twitter:      { platform: "X / Twitter",          w: 1200, h: 628,  pad: 72  },
  linkedin:     { platform: "LinkedIn",             w: 1200, h: 627,  pad: 76  },
  pinterest:    { platform: "Pinterest",            w: 1000, h: 1500, pad: 90  },
  instagram45:  { platform: "Instagram (4:5)",      w: 1080, h: 1350, pad: 92  },
};

// ── Themes ──────────────────────────────────────────────────────────────────--
export type Theme = "green" | "dark" | "cream" | "minimal";

export const THEMES: Record<Theme, { swatch: string; bg: string; text: string; accent: string; border: string; brand: string; tagBg: string }> = {
  green:   { swatch: "#3D5A3E", bg: "#0F1F10", text: "#FFFFFF", accent: "#7FAF82", border: "#2D4A2E", brand: "#FFFFFF", tagBg: "#1B3A1D" },
  dark:    { swatch: "#1A1A1A", bg: "#1A1A1A", text: "#FFFFFF", accent: "#9A948C", border: "#2F2F2F", brand: "#FFFFFF", tagBg: "#282828" },
  cream:   { swatch: "#FBF9F6", bg: "#FBF9F6", text: "#1A1A1A", accent: "#6B665E", border: "#DDD9D0", brand: "#3D5A3E", tagBg: "#EDE9E3" },
  minimal: { swatch: "#FFFFFF", bg: "#FFFFFF", text: "#111111", accent: "#888888", border: "#DEDEDE", brand: "#3D5A3E", tagBg: "#F2F2F2" },
};

const LOGO_ASPECT = 1410 / 383;

// ── Canvas helpers ────────────────────────────────────────────────────────────
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function fitText(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxHeight: number,
  maxPt: number, minPt: number, font: (pt: number) => string, lineRatio = 1.45,
): { size: number; lines: string[] } {
  for (let size = maxPt; size >= minPt; size -= 2) {
    ctx.font = font(size);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * lineRatio <= maxHeight) return { size, lines };
  }
  ctx.font = font(minPt);
  return { size: minPt, lines: wrapText(ctx, text, maxWidth) };
}

// Colorise a loaded image to a flat colour via offscreen canvas compositing
export function tintedImage(src: HTMLImageElement, color: string, targetW: number, targetH: number): HTMLCanvasElement {
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

// Shared frame: background, border, and the logo + URL footer. Returns the y of
// the footer's top edge so callers know where the content zone ends.
function drawFrameFooter(
  ctx: CanvasRenderingContext2D, W: number, H: number, PAD: number, compact: boolean,
  t: typeof THEMES[Theme], logoImg: HTMLImageElement | null,
): number {
  const logoH = compact ? 36 : 50;
  const logoW = logoH * LOGO_ASPECT;
  const urlFontSz = compact ? 20 : 26;

  const urlY       = H - PAD;
  const logoBottom = urlY - urlFontSz - (compact ? 14 : 18);
  const logoTop    = logoBottom - logoH;
  const divY       = logoTop - (compact ? 20 : 26);

  // Divider
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, divY);
  ctx.lineTo(W - PAD, divY);
  ctx.stroke();

  // Logo (tinted SVG) or text fallback
  if (logoImg) {
    const DPR = 2;
    const tinted = tintedImage(logoImg, t.brand, Math.round(logoW * DPR), Math.round(logoH * DPR));
    ctx.drawImage(tinted, (W - logoW) / 2, logoTop, logoW, logoH);
  } else {
    ctx.font = `bold ${compact ? 28 : 36}px Helvetica Neue, Arial, sans-serif`;
    ctx.fillStyle = t.brand;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("INVERTED COMMA", W / 2, logoBottom);
  }

  // URL
  ctx.font = `${urlFontSz}px Helvetica Neue, Arial, sans-serif`;
  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("www.invertedcomma.com", W / 2, urlY);

  return divY;
}

// Top kicker pill (e.g. "#PHILOSOPHY", "CONTEXT"). Returns its bottom edge y.
function drawKicker(ctx: CanvasRenderingContext2D, label: string, PAD: number, compact: boolean, t: typeof THEMES[Theme]): number {
  const fontSz = compact ? 20 : 24;
  ctx.font = `bold ${fontSz}px Helvetica Neue, Arial, sans-serif`;
  const textW = ctx.measureText(label).width;
  const pillH = fontSz + 18;
  const pillW = textW + 36;
  ctx.fillStyle = t.tagBg;
  rrect(ctx, PAD, PAD, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = t.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, PAD + 18, PAD + pillH / 2);
  return PAD + pillH;
}

function setupCanvas(canvas: HTMLCanvasElement, cfg: { w: number; h: number }, t: typeof THEMES[Theme]) {
  const DPR = 2;
  canvas.width = cfg.w * DPR;
  canvas.height = cfg.h * DPR;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, cfg.w, cfg.h);
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cfg.w - 1, cfg.h - 1);
  return ctx;
}

// ── Card 1: the main quote card (unchanged design from the share feature) ───────
export function drawQuoteCard(
  canvas: HTMLCanvasElement, quote: Quote, format: Format, theme: Theme, logoImg: HTMLImageElement | null,
) {
  const cfg = FORMATS[format];
  const t   = THEMES[theme];
  const W = cfg.w, H = cfg.h, PAD = cfg.pad;
  const compact = H <= 700;

  const ctx = setupCanvas(canvas, cfg, t);

  // Ghost quote mark
  const glyphSize = Math.round(H * 0.62);
  ctx.save();
  ctx.font = `italic bold ${glyphSize}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = t.accent;
  ctx.globalAlpha = 0.07;
  ctx.fillText("“", PAD - Math.round(glyphSize * 0.18), Math.round(H * 0.56));
  ctx.restore();

  const tag = (quote.tags[0] || quote.category || "quote").toUpperCase();
  const kickerBottom = drawKicker(ctx, `#${tag}`, PAD, compact, t);

  const footerTop = drawFrameFooter(ctx, W, H, PAD, compact, t, logoImg);

  const CONTENT_TOP = kickerBottom + (compact ? 28 : 44);
  const CONTENT_H   = footerTop - CONTENT_TOP - (compact ? 28 : 40);
  const QUOTE_W     = W - PAD * 2;

  const rawText     = quote.text.length > 220 ? quote.text.slice(0, 218) + "…" : quote.text;
  const displayText = `“${rawText}”`;
  const maxPt = compact ? 52 : 72;
  const minPt = compact ? 28 : 36;
  const authorFontSz = compact ? 22 : 28;
  const AUTHOR_BLOCK_H = authorFontSz + (compact ? 28 : 36);

  const { size: quotePt, lines } = fitText(
    ctx, displayText, QUOTE_W, CONTENT_H - AUTHOR_BLOCK_H, maxPt, minPt,
    (pt) => `italic ${pt}px Georgia, "Times New Roman", serif`,
  );
  const lineH = quotePt * 1.45;
  const quoteBlockH = lines.length * lineH;
  const totalBlockH = quoteBlockH + AUTHOR_BLOCK_H;
  const blockTop = CONTENT_TOP + Math.max(0, (CONTENT_H - totalBlockH) / 2);

  ctx.font = `italic ${quotePt}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = t.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let ty = blockTop + quotePt;
  for (const line of lines) { ctx.fillText(line, PAD, ty); ty += lineH; }

  const authorText =
    `— ${quote.author.toUpperCase()}` +
    (quote.year ? `  ·  ${quote.year < 0 ? `${Math.abs(quote.year)} BC` : String(quote.year)}` : "");
  const authorY = blockTop + quoteBlockH + (compact ? 24 : 30) + authorFontSz;
  ctx.font = `bold ${authorFontSz}px Helvetica Neue, Arial, sans-serif`;
  ctx.fillStyle = t.accent;
  ctx.textAlign = "center";
  ctx.fillText(authorText, W / 2, authorY);
}

// ── Cards 2–4: kicker + optional heading + body, in the same frame ──────────────
export interface TextCardContent {
  kicker: string;          // e.g. "CONTEXT", "ABOUT THE AUTHOR", "COUNTERPOINT"
  heading?: string;        // optional large heading (e.g. author name)
  subheading?: string;     // optional small line under heading (e.g. era)
  body: string;            // main wrapped text
  bodyStyle?: "serif" | "sans";
  bodyItalic?: boolean;
}

export function drawTextCard(
  canvas: HTMLCanvasElement, content: TextCardContent, format: Format, theme: Theme, logoImg: HTMLImageElement | null,
) {
  const cfg = FORMATS[format];
  const t   = THEMES[theme];
  const W = cfg.w, H = cfg.h, PAD = cfg.pad;
  const compact = H <= 700;

  const ctx = setupCanvas(canvas, cfg, t);

  const kickerBottom = drawKicker(ctx, content.kicker, PAD, compact, t);
  const footerTop = drawFrameFooter(ctx, W, H, PAD, compact, t, logoImg);

  const CONTENT_TOP = kickerBottom + (compact ? 26 : 44);
  const CONTENT_H   = footerTop - CONTENT_TOP - (compact ? 26 : 40);
  const BODY_W      = W - PAD * 2;

  // Measure optional heading block
  let headingH = 0;
  const headingPt = compact ? 34 : 48;
  const subPt     = compact ? 18 : 22;
  if (content.heading) {
    headingH += headingPt + (compact ? 10 : 16);
    if (content.subheading) headingH += subPt + (compact ? 8 : 12);
    headingH += compact ? 16 : 28; // gap before body
  }

  const serif = content.bodyStyle !== "sans";
  const italic = content.bodyItalic ? "italic " : "";
  const bodyFont = (pt: number) =>
    serif ? `${italic}${pt}px Georgia, "Times New Roman", serif`
          : `${italic}${pt}px Helvetica Neue, Arial, sans-serif`;
  const maxPt = compact ? 34 : 46;
  const minPt = compact ? 20 : 26;

  const { size: bodyPt, lines } = fitText(
    ctx, content.body, BODY_W, CONTENT_H - headingH, maxPt, minPt, bodyFont, 1.5,
  );
  const lineH = bodyPt * 1.5;
  const bodyBlockH = lines.length * lineH;
  const totalH = headingH + bodyBlockH;
  let y = CONTENT_TOP + Math.max(0, (CONTENT_H - totalH) / 2);

  // Heading
  if (content.heading) {
    ctx.font = `bold ${headingPt}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = t.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    y += headingPt;
    ctx.fillText(content.heading, W / 2, y);
    y += compact ? 10 : 16;
    if (content.subheading) {
      y += subPt;
      ctx.font = `${subPt}px Helvetica Neue, Arial, sans-serif`;
      ctx.fillStyle = t.accent;
      ctx.fillText(content.subheading, W / 2, y);
      y += compact ? 8 : 12;
    }
    y += compact ? 16 : 28;
  }

  // Body (centred lines)
  ctx.font = bodyFont(bodyPt);
  ctx.fillStyle = content.heading ? t.accent : t.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  y += bodyPt;
  for (const line of lines) { ctx.fillText(line, W / 2, y); y += lineH; }
}
