/**
 * Inverted Comma logo — served from /public/logo.svg.
 *
 * Props:
 *   size      — controls height in px; width scales with the 1410×383 aspect ratio
 *   light     — invert colours for use on dark backgrounds
 *   iconOnly  — show only the left ~30% (speech bubbles, no text)
 *   className — extra Tailwind classes
 */
import React from "react";

interface LogoProps {
  size?: number;
  light?: boolean;
  iconOnly?: boolean;
  className?: string;
}

// Natural aspect ratio of the SVG: 1410 / 383 ≈ 3.68
const FULL_ASPECT = 1410 / 383;

// The two speech bubbles occupy roughly the left 28% of the canvas
const ICON_ASPECT = 0.28 * FULL_ASPECT; // ≈ 1.03 — nearly square

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
    // Show only the left portion (speech bubbles) by putting the full image inside
    // a clipped container sized to the icon width
    const fullW = Math.round(size * FULL_ASPECT);
    return (
      <div
        className={`overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: w, height: size }}
        aria-label="Inverted Comma"
      >
        <img
          src="/logo.svg"
          alt=""
          width={fullW}
          height={size}
          className="block"
          style={{ ...style, width: fullW, objectPosition: "left center", objectFit: "cover" }}
          draggable={false}
        />
      </div>
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
