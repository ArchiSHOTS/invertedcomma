/**
 * Generates the social-media brand image kit from the logo.
 * Run: node tools/brand-assets.mjs
 * Output: public/brand/*.png
 */
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "public", "brand");
fs.mkdirSync(OUT, { recursive: true });

const GREEN = "#455D49";
const CREAM = "#FAF8F4";
const DARKGREEN = "#0F1F10";

const markSvg = path.join(OUT, "mark.svg");
const logoSvg = path.join(ROOT, "public", "logo.svg");

function save(name, canvas) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, canvas.toBuffer("image/png"));
  console.log("✓", "public/brand/" + name, `(${canvas.width}×${canvas.height})`);
}

/** Draw an image scaled to fit within (maxW × maxH), centered at (cx, cy). */
function drawContain(ctx, img, cx, cy, maxW, maxH) {
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

const mark = await loadImage(markSvg);
const logo = await loadImage(logoSvg);

// ── 1. Profile picture — green bg, cream mark (1080×1080) ─────────────────────
{
  const s = 1080;
  const c = createCanvas(s, s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, s, s);
  drawContain(ctx, mark, s / 2, s / 2 + 10, s * 0.52, s * 0.52);
  save("profile-green-1080.png", c);
}

// ── 2. Profile picture — cream bg, green mark (alt, 1080×1080) ────────────────
{
  const s = 1080;
  const c = createCanvas(s, s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, s, s);
  // recolor: draw mark then tint isn't trivial; load a green-on-cream variant
  // Simpler: draw the cream mark inside a green disc for contrast
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.40, 0, Math.PI * 2);
  ctx.fill();
  drawContain(ctx, mark, s / 2, s / 2 + 8, s * 0.46, s * 0.46);
  save("profile-cream-1080.png", c);
}

// ── helper: banner with logo + tagline ────────────────────────────────────────
function banner(name, W, H, opts = {}) {
  const { bg = CREAM, logoRatio = 0.5, tagline = "Quotes worth thinking about.",
          taglineColor = "rgba(69,93,73,0.75)", showTagline = true } = opts;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // For dark backgrounds we can't recolor the SVG easily; logo.svg is green ink,
  // so banners use cream/light backgrounds to keep the green wordmark legible.
  const logoMaxW = W * logoRatio;
  const logoMaxH = H * (showTagline ? 0.42 : 0.6);
  const cx = W / 2;
  const cy = showTagline ? H * 0.40 : H * 0.5;
  drawContain(ctx, logo, cx, cy, logoMaxW, logoMaxH);

  if (showTagline) {
    const fs2 = Math.round(H * 0.075);
    ctx.font = `italic ${fs2}px Georgia, serif`;
    ctx.fillStyle = taglineColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tagline, cx, H * 0.74);
  }
  save(name, c);
}

// ── 3. X / Twitter header (1500×500) ──────────────────────────────────────────
banner("banner-x-1500x500.png", 1500, 500, { logoRatio: 0.42 });

// ── 4. LinkedIn page banner (1128×191) — short, no tagline ────────────────────
banner("banner-linkedin-1128x191.png", 1128, 191, { logoRatio: 0.34, showTagline: false });

// ── 5. Facebook page cover (1640×624) ─────────────────────────────────────────
banner("banner-facebook-1640x624.png", 1640, 624, { logoRatio: 0.40 });

// ── 6. Pinterest profile is square — reuse profile-green ──────────────────────
console.log("\nDone. Upload from public/brand/");
