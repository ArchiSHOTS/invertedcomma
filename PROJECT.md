# Inverted Comma — Project Reference

> A single source of truth for the Inverted Comma codebase: what it is, how it's built, and how it runs. Read this first when starting work on the project.
>
> **No secrets live in this file** — only environment-variable *names* and their purpose. Real values live in Render / Neon / Cloudflare / your local `.env` (which is git-ignored).

---

## 1. Overview

**Inverted Comma** (live at **invertedcomma.com**) is a curated quotes platform. It collects quotes worth thinking about — drawn from books, films, speeches, art and essays — and presents each one with:

- **Context & sources** (where the quote comes from, the year, related books)
- An AI **"Deep Dive"** (author bio, the quote's meaning, historical context, related works, web references)
- A dialectic AI **"Counterpoint"** that challenges the quote's premise
- **Community discussion**
- Beautiful, downloadable **share cards**

Users can register, verify their email, save quotes into collections, pick interests, and receive a personalised welcome email. Admins/moderators manage content, users, discussions, and monetisation through a dedicated dashboard.

---

## 2. Tech stack

**Frontend:** React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · React Router 7 · `react-helmet-async` (SEO) · Framer Motion.

**Backend:** Express 4 on **Node 22**, written in TypeScript and bundled to ESM with esbuild. The same Express server **serves both the API and the built React SPA** — one full-stack service, not two.

**Database:** Neon (serverless PostgreSQL) accessed via the `pg` driver (no ORM; raw parameterised SQL in `db.ts`).

**AI:** Google Gemini via `@google/genai` (quote enrichment, counterpoints, author profiles, YouTube/text extraction).

**Images:** `@napi-rs/canvas` generates 1200×630 Open Graph share images server-side.

**Email:** Resend for transactional mail.

**Security/validation:** `helmet`, `cors`, `express-rate-limit`, `zod`, `bcrypt`, `jsonwebtoken`, `google-auth-library`.

---

## 3. Architecture & hosting

```
        GitHub (ArchiSHOTS/invertedcomma)
                  │  push to main → auto-deploy
                  ▼
        Render  ──────────  one Node web service (Singapore)
        │  Express serves /api/* AND the built SPA (dist/)
        │
        ├── Neon PostgreSQL (Singapore)  ← DATABASE_URL
        ├── Google Gemini API            ← GEMINI_API_KEY
        ├── Google Identity (OAuth)      ← GOOGLE_CLIENT_ID
        └── Resend (email)               ← RESEND_API_KEY
                  ▲
                  │ DNS / SSL / proxy
        Cloudflare  (apex invertedcomma.com → www, "Full strict" SSL)
```

- Domain registered at Hostinger, DNS managed by **Cloudflare**. The apex `invertedcomma.com` **redirects to `www.invertedcomma.com`** (the canonical host — important when configuring OAuth origins and testing).
- SSL/TLS mode is **Full (strict)**.
- The frontend and API share an origin, so the SPA calls the API with **relative** URLs.

---

## 4. Repository layout

```
inverted-comma/
├── server.ts            # Express app: all API routes, auth, AI, OG images, static serving, startup
├── db.ts                # Postgres pool + all SQL queries + runMigrations()
├── email.ts             # Resend wrapper + branded HTML templates
├── schema.sql           # Canonical DB schema (+ idempotent ALTERs)
├── render.yaml          # Render blueprint
├── .env.example         # Documented env-var names (no real values)
├── PROJECT.md           # This file
│
├── src/
│   ├── App.tsx          # Routes + the inline HomePage
│   ├── main.tsx         # React root + HelmetProvider
│   ├── index.css        # Tailwind + Google Fonts imports
│   ├── types.ts         # Quote, User, and related TypeScript types
│   ├── data/quotes.ts   # Seed quotes (getEnrichedQuotes, AVAILABLE_TAGS)
│   ├── context/UserContext.tsx   # Auth state/provider
│   ├── hooks/           # useBookmarks, useCollections
│   ├── pages/           # Page components (see §6)
│   └── components/      # Reusable UI (see §7)
│
├── public/
│   ├── logo.svg         # Full wordmark (site header/footer)
│   ├── icon.png         # Two-bubble mark (mobile header / iconOnly)
│   ├── favicon.png      # Square transparent favicon
│   ├── apple-touch-icon.png
│   ├── brand/           # Social profile pics + banners (generated)
│   └── email/           # Email logo + social icons (generated PNGs)
│
└── tools/
    ├── brand-assets.mjs # Regenerates public/brand/* from the logo
    └── email-assets.mjs # Regenerates public/email/* (white logo + social glyphs)
```

---

## 5. Features

**Discovery**
- **Hero** featured quote on the homepage (rotates the most-liked), with a single "Deep dive" CTA.
- **Explore quotes** section with search + a horizontally scrollable tag filter.
- **Discover / Browse / Library** modes; **SwipeDeck** (swipe right to save, left to skip) for Discover.

**Quote pages** (`/q/:slug`)
- Full quote, author, year, category, source & related books.
- **Deep Dive** — AI-generated insights (cached).
- **Discussion** drawer with comments and an AI **counterpoint** (web-grounded).
- **Share** modal → downloadable PNG card in multiple formats and themes (rendered client-side on `<canvas>`).

**Authors** (`/author/:slug`) — profile (AI-generated on first visit if missing) + all their quotes.

**Accounts**
- Email/password **and** Google sign-in (both converge on one user record).
- **Email verification** (soft gate: logged in immediately, banner prompts to verify) + a **personalised welcome email** containing a quote matched to the user's chosen interests.
- Saved quotes, custom **collections**, interests, profile, public profile at `/u/:handle`.

**Newsletter** — footer subscribe (email + source).

**Admin dashboard** (`/control`) — content/user/discussion/subscriber/monetisation management (see §7).

**SEO** — per-page meta/OG/Twitter/JSON-LD tags + dynamic OG images.

---

## 6. Frontend routes (`src/App.tsx`)

| Path | Page |
|------|------|
| `/` | HomePage (inline in App.tsx) |
| `/q/:slug` | QuotePage |
| `/tag/:tag` | TagPage |
| `/explore` | ExplorePage |
| `/author/:slug` | AuthorPage |
| `/me` | MePage (logged-in dashboard) |
| `/u/:handle` | UserProfilePage (public profile) |
| `/control` | ControlPage (admin/moderator dashboard) |
| `/auth/login` | LoginPage |
| `/auth/signup` | SignupPage |
| `/auth/forgot-password` | ForgotPasswordPage |
| `/auth/verify` | VerifyEmailPage |
| `/about` · `/terms` · `/privacy` | Static content pages |
| `*` | Falls back to HomePage |

> Note: `src/pages/AdminPage.tsx` exists but is **dead code** (not routed) — the live admin UI is `ControlPage.tsx`.

---

## 7. Key components & state

**Components (`src/components/`)**
- **SiteHeader** — sticky nav; becomes a floating pill on scroll; renders the verify-email banner; logo + nav + UserBadge.
- **SiteFooter** — newsletter (kept prominent), social icons (`@invertedcommahq`), nav, legal.
- **Logo** — full wordmark (`logo.svg`) or `iconOnly` mark (`icon.png`); `size`/`light` props.
- **HeroSection** — featured-quote banner (Deep dive only).
- **QuoteCard** / **VideoQuoteCard** — grid cards; the video variant embeds YouTube with timestamps.
- **SwipeDeck** — swipe-to-save discovery UI.
- **ShareCardModal** — canvas share-card generator (formats + themes); titled "Share".
- **DiscussionDrawer** — comments + AI counterpoint.
- **FilterHeader**, **BottomNav** (mobile), **UserBadge**, **VerifyEmailBanner**, **SEO**, **ReadingListManager**.

**State**
- **`UserContext`** (`src/context/UserContext.tsx`): `user`, `isLoggedIn`, `isAdmin`, `isLoading`, and `login` / `register` / `loginWithGoogle` / `saveInterests` / `logout` / `updateUser`. JWT stored in `localStorage` under **`ic_token`**; on mount it calls `/api/auth/me` to hydrate.
- **`useBookmarks`** — server-authoritative when logged in (`/api/quotes/:id/bookmark`); redirects to login when not; `ic_saved_ids` localStorage fallback.
- **`useCollections`** — custom collections in `ic_collections_v2` localStorage (with v1→v2 migration).

**Admin dashboard tabs (`ControlPage.tsx`):** Overview, Quotes, Authors, Tags, Users, Discussions, Subscribers, Monetisation, AI. A login gate requires `admin`/`moderator`; a "Change password" action and user-delete confirmation modal live in the sidebar/users tab.

---

## 8. Backend API reference (`server.ts`)

All under `/api`. `(admin)` = admin/moderator; `(admin-only)` = admin role only; `(auth)` = any logged-in user.

**Auth**
- `POST /auth/register` — create account (email/password/interests); sends verification email
- `POST /auth/login` — authenticate → JWT
- `GET  /auth/me` — current user (rejects stale token_version)
- `POST /auth/google` — verify Google ID token (signature/audience) → sign in / auto-register
- `POST /auth/change-password` (auth) — verify current, set new, bump token_version, re-issue token
- `POST /auth/verify-email` — confirm email link → mark verified + send welcome
- `POST /auth/resend-verification` (auth) — resend verification email
- `POST /auth/forgot-password` — stub (logs only; email-based reset is a future phase)
- `PUT  /auth/interests` (auth) · `PUT /auth/profile` (auth) — update profile fields

**User & bookmarks**
- `GET  /user/:handle` — public profile · `GET /user/:handle/quotes` — their saved quotes
- `POST /quotes/:id/bookmark` (auth) — toggle bookmark

**Quotes & tags**
- `GET /quotes` — all published (seed + runtime) · `GET /quotes/:slugOrId` — one quote
- `GET /tags` — tags with counts
- `GET /quotes/:quoteId/insights` — AI Deep Dive (generates + caches on demand)

**Authors**
- `GET /authors` · `GET /author/:slug` (AI-generates profile if missing)
- `PUT /author/:slug` (admin) · `POST /author/:slug/regenerate` (admin)

**Discussions**
- `GET /discussions/:quoteId` · `POST /discussions/:quoteId` — comments
- `POST /discussions/:quoteId/ai-counterpoint` — AI counterpoint (cached)
- `GET /admin/discussions` (admin) · `DELETE /admin/discussions/:quoteId/comments/:commentId` (admin)

**Newsletter**
- `POST /subscribe` · `GET /admin/subscribers` (admin)

**Admin — quotes / tags / users / stats**
- `GET|POST /admin/quotes`, `POST /admin/quotes/bulk`, `PUT|DELETE /admin/quotes/:id`, `POST /admin/quotes/:id/approve|reject` (admin)
- `POST /admin/tags`, `DELETE /admin/tags/:name` (admin)
- `GET /admin/users` (admin), `PUT /admin/users/:id/role` (admin-only), `DELETE /admin/users/:id` (admin-only)
- `GET /admin/stats` (admin)
- `POST /admin/extract-youtube`, `POST /admin/extract-text` (admin) — AI quote extraction

**OG images** (PNG via canvas) — `GET /og/quote/:slug`, `/og/tag/:tag`, `/og/author/:slug`, `/og/default`

**Debug** — `GET /debug/ai` (checks Gemini connectivity)

---

## 9. Data model

PostgreSQL (Neon). Seed quotes are **code** (`src/data/quotes.ts` → `getEnrichedQuotes()`, `AVAILABLE_TAGS`); user/admin-added quotes are **rows** in `runtime_quotes`. `db.ts` runs `runMigrations()` (idempotent `ALTER ... IF NOT EXISTS`) on every boot.

| Table | Key columns |
|-------|-------------|
| **users** | id (PK), email (unique), password_hash, display_name, handle (unique), avatar, bio, role, interests[], saved_quote_ids[], submitted_quote_ids[], is_subscribed, anonymous, email_verified, token_version, created_at |
| **authors** | slug (PK), name, full_name, bio, image_url, born, died, nationality, known_for, auto_generated, enriched_at, created_at |
| **runtime_quotes** | id (PK), slug (unique), text, author, source, source_url, year, category, context, tags[], source_type, status, submitted_by→users.id, enrichment (JSONB), likes, bookmarks, created_at |
| **comments** | id (PK), quote_id (idx), user_id→users.id, display_name, avatar, text, anonymous, likes, created_at |
| **subscribers** | id (serial PK), email (unique), source, subscribed_at, unsubscribed_at |
| **insights_cache** | quote_id (PK), data (JSONB), created_at |
| **quote_likes** | (user_id, quote_id) composite PK — prevents double-likes |

**`db.ts` exports:** `testConnection`, `runMigrations`; users (`getUserById/ByEmail/ByHandle`, `getAllUsers`, `createUser`, `updateUser`, `deleteUser`, `toggleBookmark`); authors (`getAuthorBySlug`, `getAllAuthors`, `upsertAuthor`); quotes (`getRuntimeQuotes`, `getRuntimeQuoteBySlug`, `createRuntimeQuote`, `updateRuntimeQuote`, `deleteRuntimeQuote`); comments (`getComments`, `createComment`, `likeComment`, `deleteComment`, `getAllComments`); subscribers (`addSubscriber`, `getAllSubscribers`, `unsubscribe`); insights (`getInsight`, `setInsight`); likes (`toggleQuoteLike`).

---

## 10. Auth & security

- **JWT** payload `{ sub: userId, tv: tokenVersion }`, 30-day expiry. `signToken(userId, tokenVersion)` / `verifyToken()`.
- **Session invalidation:** every user has `token_version`; middleware rejects a token whose `tv` ≠ the user's current version. Changing a password increments it → logs out other/stolen sessions.
- **Middleware:** `authMiddleware` (valid, fresh token), `adminMiddleware` (admin **or** moderator), `superAdminMiddleware` (admin only).
- **Roles:** `user` (default), `moderator`, `admin`.
- **Admin bootstrap** — `ensureAdmin()` on startup (idempotent): creates the admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, migrates the legacy `admin@invertedcomma.com` row if present, and only resets an existing admin's password when `ADMIN_PASSWORD_RESET=true` (break-glass). Skips with a warning if the env vars are unset.
- **Passwords are hashed** with bcrypt (one-way, salted — *not* reversible "encryption"). Everything is TLS-encrypted in transit.
- **HTTP hardening:** helmet headers; **CORS scoped to `/api` only** (the SPA/static assets are never origin-gated — this was the cause of an earlier blank-page bug); tiered rate limits (general / auth / AI); `Cross-Origin-Opener-Policy: same-origin-allow-popups` (required for the Google sign-in popup); CSP allows Google Fonts and `accounts.google.com`; `Cross-Origin-Resource-Policy: cross-origin` so OG images are crawler-fetchable.
- **Validation:** zod schemas on all write endpoints; 64 kb JSON body limit. Production refuses to boot if `JWT_SECRET` is still the dev default.

---

## 11. Email system (`email.ts`)

- **Provider:** Resend. The wrapper **degrades gracefully** — with no `RESEND_API_KEY`, sends are logged and skipped, and signup/login still work. All sends are fire-and-forget.
- **From:** `EMAIL_FROM` (default `Inverted Comma <hello@invertedcomma.com>`); the domain is verified in Resend, and `hello@` replies forward to the brand Gmail via Cloudflare Email Routing.
- **Templates:** `sendVerificationEmail` (24h signed-JWT link), `sendWelcomeEmail` (one-liner + a quote chosen from the user's interests, with its context and a deep-dive link; falls back to a random quote). Branded layout: white logo on a green header + Instagram/X/Pinterest icons in the footer.
- **Assets:** email images live in `public/email/` and are regenerated with `node tools/email-assets.mjs` (emails can't rely on SVG).

---

## 12. Environment variables (names only)

Configure these in Render (and a local `.env` for dev). See `.env.example`. **Never commit real values.**

| Name | Req? | Purpose |
|------|------|---------|
| `DATABASE_URL` | required | Neon Postgres connection string |
| `JWT_SECRET` | required (prod) | Signs JWTs; prod refuses the dev default |
| `ADMIN_EMAIL` | required | Admin bootstrap email |
| `ADMIN_PASSWORD` | required | Admin bootstrap password |
| `ADMIN_PASSWORD_RESET` | optional | `"true"` forces an admin password reset on boot (break-glass) |
| `GEMINI_API_KEY` | optional | Enables AI features (disabled if unset) |
| `GOOGLE_CLIENT_ID` | optional | Server-side Google token verification |
| `VITE_GOOGLE_CLIENT_ID` | optional | Frontend Google button (baked in at build) |
| `RESEND_API_KEY` | optional | Enables transactional email |
| `EMAIL_FROM` | optional | Sender identity (default `hello@invertedcomma.com`) |
| `SITE_URL` | optional | Base URL for email links / OG (default `https://www.invertedcomma.com`) |
| `NODE_ENV` | optional | `production` enables static serving (Render sets it) |
| `PORT` | optional | Listen port (Render sets it) |

---

## 13. Local development

```bash
npm install
npm run dev      # tsx server.ts — dev server on :3000 (Vite middleware)
npm run build    # vite build + esbuild bundle → dist/
NODE_ENV=production npm start   # run the production bundle (dist/server.mjs)
npm run lint     # tsc --noEmit
```

- **Dev vs prod databases:** local `.env` typically points at the Neon **dev branch**; Render uses the **main (production) branch**. They're separate databases — *accounts you create locally won't appear in production*, and vice versa.
- Production static serving requires `NODE_ENV=production` (otherwise the server runs Vite middleware instead of serving `dist/`).

---

## 14. Deployment & ops

- **CI/CD:** push to `main` → Render auto-deploys. Build: `vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --sourcemap --outfile=dist/server.mjs`; start: `node dist/server.mjs`.
- **Schema changes:** add an idempotent `ALTER ... IF NOT EXISTS` to `runMigrations()` in `db.ts` (and to `schema.sql`) — it applies to both branches on the next boot.
- **Changing admin credentials:** update `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars; `ensureAdmin()` migrates/creates on the next deploy. Locked out → set `ADMIN_PASSWORD_RESET=true` + a new `ADMIN_PASSWORD`, redeploy once, then remove the flag.
- **Brand/email assets:** regenerate with `node tools/brand-assets.mjs` and `node tools/email-assets.mjs` after changing `public/logo.svg` or `public/icon.png`.

---

## 15. Brand

- **Palette:** `#3D5A3E` (primary green / CTAs), `#0F1F10` (near-black green, footer/dark sections), `#FBF9F6` (cream background), stone/taupe text accents (`#6B665E`, `#9A948C`), emerald highlights (`#7FAF82`).
- **Fonts:** Inter (body), Georgia/serif (display & quotes), JetBrains Mono (labels/timestamps).
- **Logo:** `logo.svg` (wordmark), `icon.png` (two-bubble mark), `favicon.png` / `apple-touch-icon.png`.
- **Social:** `@invertedcommahq` on Instagram, X, Pinterest. Brand inbox: the project Gmail (forwarded from `hello@invertedcomma.com`).

---

## 16. Known gaps & future phases

- **Email-based public "forgot password"** reset link (currently a stub; in-dashboard change-password + env break-glass exist).
- **"Participate" page** inviting curators/moderators (a placeholder link hook exists in the footer).
- **Subscriber name capture** + three managed lists (admins / subscribers / users) in the dashboard.
- **Delete dead code:** `src/pages/AdminPage.tsx` (unused).
- **Performance:** code-split the ~800 kb JS bundle.
- **Hardening:** consider raising the bcrypt cost factor and adding password-strength rules.
