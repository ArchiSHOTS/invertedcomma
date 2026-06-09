/**
 * Inverted Comma logo.
 *   - Full wordmark: /public/logo.svg
 *   - iconOnly mark: /public/icon.png (speech-bubble glyph, for compact/mobile use)
 *
 * Props:
 *   size      — controls height in px; width scales with the image aspect ratio
 *   light     — invert colours for use on dark backgrounds
 *   iconOnly  — render the speech-bubble mark instead of the wordmark
 *   className — extra Tailwind classes
 */
import React from "react";

interface LogoProps {
  size?: number;
  light?: boolean;
  iconOnly?: boolean;
  className?: string;
}

// Natural aspect ratio of the wordmark SVG: 1410 / 383 ≈ 3.68
const FULL_ASPECT = 1410 / 383;

// iconOnly uses the dedicated icon.png (the speech-bubble mark): 527 × 384
const ICON_ASPECT = 527 / 384; // ≈ 1.37

export default function Logo({
  size = 40,
  light = false,
  iconOnly = false,
  className = "",
}: LogoProps) {
  const aspect = iconOnly ? ICON_ASPECT : FULL_ASPECT;
  const w = Math.round(size * aspect);

  // Default the element to `block`, but only when the caller hasn't supplied their
  // own display utility (e.g. `hidden md:block`). Mixing a default `block` with a
  // caller `hidden` would make the winner depend on stylesheet order — avoid that.
  const hasDisplayClass = /\b(hidden|block|inline|flex|grid|contents)\b/.test(className);
  const displayClass = hasDisplayClass ? "" : "block";

  // For icon-only we clip to the left 28% of the image via object-position + overflow hidden
  // NOTE: do NOT set `display` here — an inline display overrides Tailwind's responsive
  // `hidden`/`md:block` classes (this caused the "two logos on mobile" bug). Display is
  // controlled via className instead.
  const style: React.CSSProperties = {
    width: w,
    height: size,
    flexShrink: 0,
    // Invert to white for dark backgrounds, then re-tint green
    filter: light ? "brightness(0) invert(1) sepia(1) saturate(0.3) hue-rotate(80deg)" : undefined,
  };

  if (iconOnly) {
    // Dedicated speech-bubble mark (public/icon.png)
    return (
      <img
        src="/icon.png"
        alt="Inverted Comma"
        width={w}
        height={size}
        style={style}
        className={`${displayClass} ${className}`.trim()}
        draggable={false}
      />
    );
  }

  return (
    <img
      src="/logo.svg"
      alt="Inverted Comma"
      width={w}
      height={size}
      style={style}
      className={`${displayClass} ${className}`.trim()}
      draggable={false}
    />
  );
}
