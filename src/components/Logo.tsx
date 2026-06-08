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

  // For icon-only we clip to the left 28% of the image via object-position + overflow hidden
  const style: React.CSSProperties = {
    width: w,
    height: size,
    display: "block",
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
      className={className}
      draggable={false}
    />
  );
}
