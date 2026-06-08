import { Helmet } from "react-helmet-async";

const SITE_NAME   = "Inverted Comma";
const SITE_URL    = "https://www.invertedcomma.com";
const TWITTER_ID  = "@invertedcomma";

const DEFAULT_DESC = "Curating high-contrast quotes, counterpoints & conversations — from books, films, speeches and beyond.";
const DEFAULT_OG   = `${SITE_URL}/api/og/default`;

interface SEOProps {
  /** Browser tab + OG title (site name is appended automatically) */
  title?: string;
  description?: string;
  /** Absolute OG image URL. Defaults to the site-wide card. */
  image?: string;
  /** Path (e.g. /q/some-slug) — used for canonical URL */
  path?: string;
  /** "article" for quote/blog pages, "website" for everything else */
  type?: "website" | "article";
  /** Pass true for /me, /control, auth pages, etc. */
  noIndex?: boolean;
  /** JSON-LD structured data object */
  jsonLd?: object;
}

export default function SEO({
  title,
  description,
  image,
  path,
  type = "website",
  noIndex,
  jsonLd,
}: SEOProps) {
  const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
  const desc      = description || DEFAULT_DESC;
  const img       = image       || DEFAULT_OG;
  const canonical = path ? `${SITE_URL}${path}` : SITE_URL;

  return (
    <Helmet>
      {/* ── Primary ───────────────────────────────────── */}
      <title>{fullTitle}</title>
      <meta name="description"        content={desc} />
      <link rel="canonical"           href={canonical} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}

      {/* ── Open Graph ────────────────────────────────── */}
      <meta property="og:site_name"   content={SITE_NAME} />
      <meta property="og:type"        content={type} />
      <meta property="og:url"         content={canonical} />
      <meta property="og:title"       content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image"       content={img} />
      <meta property="og:image:width"  content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type"   content="image/png" />

      {/* ── Twitter / X Card ──────────────────────────── */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:site"        content={TWITTER_ID} />
      <meta name="twitter:creator"     content={TWITTER_ID} />
      <meta name="twitter:title"       content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image"       content={img} />

      {/* ── JSON-LD structured data ───────────────────── */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
