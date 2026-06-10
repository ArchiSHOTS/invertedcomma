# Inverted Comma — Tasks & Feature Roadmap

> Planning reference for Claude Code sessions. Read PROJECT.md first for full stack/schema context.
> Priorities: **Immediate** → **High** → **Medium** → **Low**

---

## IMMEDIATE

### 1. Wikiquote Bulk Import Script
**Goal:** Grow quote library from ~260 to 2000 quality, attributed quotes.

**What to build:**
- A Node.js script (`tools/wikiquote-import.mjs`) that calls the Wikiquote MediaWiki API
- Pulls quotes by author category (philosophers, writers, scientists, filmmakers, etc.)
- Cleans wikitext markup → plain text
- Deduplicates against existing slugs in `runtime_quotes`
- Formats output to match the `runtime_quotes` schema:
  ```
  { text, author, source, source_url, year, category, context, tags[], source_type, status }
  ```
- Sets `status: 'pending'` on all imported quotes (for review before approval)
- Sets `source_type: 'wikiquote'` for traceability
- Calls `POST /admin/quotes/bulk` with admin JWT auth in batches of 50
- Logs progress, errors, and final count

**Wikiquote API entry point:**
```
https://en.wikiquote.org/w/api.php?action=parse&page=Albert_Einstein&prop=wikitext&format=json
```

**Notes:**
- Respect API rate limits — add a 500ms delay between requests
- Target 30–40 authors initially to reach 2000 quotes
- Prioritise authors already in the `authors` table to leverage existing profiles
- Source URL for each quote: `https://en.wikiquote.org/wiki/{Author_Name}`

---

### 2. Human Counterpoint Feature
**Goal:** Alongside the existing AI-generated counterpoint, surface a real human voice that challenged the quote's idea.

**What to build:**

**Backend (`server.ts`):**
- Extend the `/api/discussions/:quoteId/ai-counterpoint` endpoint (or add a new `/api/discussions/:quoteId/human-counterpoint` endpoint)
- Prompt Gemini (web-grounded) to find a documented, attributed human statement that contradicts or complicates the quote — must return: `{ text, author, year, source_url }`
- If no credible human counterpoint is found, return `null` (do not fabricate)
- Cache result in `insights_cache` as a new `human_counterpoint` JSONB field alongside existing data

**Schema change (`db.ts` + `schema.sql`):**
- Add `human_counterpoint JSONB` column to `insights_cache` table via idempotent `ALTER TABLE insights_cache ADD COLUMN IF NOT EXISTS human_counterpoint JSONB`

**Frontend (`src/components/DiscussionDrawer.tsx`):**
- Display two distinct cards in the Discussion drawer:
  - **"A human voice that disagreed"** — attributed name, year, source link, quote text (styled differently from AI content)
  - **"An AI-constructed argument"** — existing counterpoint (current behaviour, unchanged)
- If `human_counterpoint` is null, show only the AI counterpoint (no empty state needed)

---

## HIGH

### 3. Quote Context Note ("Quote in Context")
**Goal:** Show a 2–3 sentence note explaining the real-world circumstances when the quote was said or written. Most quote sites strip all context — this is a meaningful differentiator.

**What to build:**
- Add a `context_note` field to the AI Deep Dive generation prompt in `server.ts`
- Store in `insights_cache` JSONB data
- Display as a small contextual callout on the QuotePage, above or below the main quote text
- Example: "Gandhi never actually said these exact words. The sentiment derives from a 1913 essay by him, later paraphrased into this form."

---

### 4. Misattribution Flag
**Goal:** A visible indicator on quotes that are commonly misattributed — "Einstein never said this."

**What to build:**
- Add `misattributed: boolean` and `misattribution_note: string` fields to `runtime_quotes` table
- Admin dashboard (ControlPage.tsx → Quotes tab): add toggle + note field for misattribution
- Frontend QuotePage: display a subtle but clear badge — "Often misattributed to [Author]" — with a one-line note
- Gemini can flag likely misattributions during enrichment; store as a suggestion for admin review

---

### 5. Contradiction Wall Page
**Goal:** A dedicated page showing pairs of famous quotes that directly contradict each other. Highly shareable, tied directly to the counterpoint mechanic.

**What to build:**
- New route: `/contradictions`
- New page: `src/pages/ContradictionsPage.tsx`
- New DB table: `contradiction_pairs (id, quote_id_a, quote_id_b, theme, created_at)`
- Admin dashboard: ability to create/manage pairs manually
- UI: two-column layout, one quote per side, theme label above the pair, links to both QuotePages
- Initially seed with 20–30 hand-curated pairs; grow via admin curation

---

### 6. Performance: Code-Split the JS Bundle
**Goal:** The ~800kb JS bundle (noted in PROJECT.md §16) needs splitting.

**What to do:**
- Add React lazy + Suspense to all page-level components in `src/App.tsx`
- Verify Vite's `build.rollupOptions` is not bundling everything into one chunk
- Target: no single chunk above 200kb gzipped
- Test with `npm run build` and inspect `dist/` output sizes

---

## MEDIUM

### 7. Author Universe — Interactive Graph
**Goal:** A D3 force-directed graph where each node is an author, sized by quote count, clustered by era or theme. The visual showpiece of the site.

**What to build:**
- New route: `/universe`
- New page: `src/pages/UniversePage.tsx`
- Add `d3` as a dependency
- Data: pull from `GET /authors` + quote counts per author
- Node size = quote count; node colour = era/century; click → AuthorPage
- Mobile fallback: a simpler list view (the graph won't work well on small screens)

---

### 8. Quote Timeline Page
**Goal:** A horizontal scrolling timeline showing when the most-quoted ideas were first articulated, grouped by century.

**What to build:**
- New route: `/timeline`
- New page: `src/pages/TimelinePage.tsx`
- Uses existing `year` field on `runtime_quotes`
- Only include quotes where `year` is populated and numeric
- Group by century; within each century, sort by `likes` descending
- Consider this after the `year` field is well-populated from the Wikiquote import

---

### 9. "Most Challenged" Leaderboard
**Goal:** A page showing which quotes have attracted the most counterpoints and discussion — directly tied to the site's core mechanic.

**What to build:**
- New route: `/most-challenged`
- Derived from `comments` count + whether `human_counterpoint` and `ai_counterpoint` are both populated
- Simple ranked list, links to QuotePages
- Can be a section on the homepage before it earns its own page

---

### 10. Quote Genealogy / Lineage (Editorial)
**Goal:** Show the intellectual lineage of an idea — Seneca → Montaigne → Emerson → modern self-help bumper sticker.

**What to build:**
- New DB table: `quote_lineage (id, quote_id_ancestor, quote_id_descendant, note, created_at)`
- Admin dashboard: ability to link quotes in a chain with a note
- QuotePage: "This idea travelled through time" section showing the chain
- Start with 10–15 well-documented lineage chains, curated manually
- This is partly editorial work, not just dev — needs research investment

---

### 11. Subscriber Name Capture + Managed Lists
**Goal:** Capture subscriber names at signup; manage three separate lists (admins, subscribers, users) in the dashboard. (Noted as a known gap in PROJECT.md §16.)

**What to build:**
- Add optional `name` field to `POST /subscribe` endpoint and `subscribers` table
- Update footer newsletter form to include an optional name input
- Admin dashboard Subscribers tab: show name column, filter by list type

---

### 12. Forgot Password (Email Flow)
**Goal:** Complete the stubbed `POST /auth/forgot-password` endpoint. (Noted as a known gap in PROJECT.md §16.)

**What to build:**
- Generate a signed, time-limited JWT reset token (15-minute expiry)
- Send email via Resend with a reset link → `/auth/reset-password?token=...`
- New page: `src/pages/ResetPasswordPage.tsx`
- Validate token → allow new password → bump `token_version` to invalidate all sessions

---

## LOW

### 13. Quote Mood Board (Monthly/Weekly)
**Goal:** A hand-curated visual page of 8–10 quotes arranged typographically around a single theme or mood. Downloadable as wallpaper.

**What to build:**
- New route: `/moodboard` (or `/moodboard/:slug` for named editions)
- New DB table: `moodboards (id, slug, title, theme, quote_ids[], published_at)`
- Admin dashboard: ability to create moodboards by selecting quotes + a theme
- Frontend: typographic layout using canvas (already available via `@napi-rs/canvas`)
- Download as PNG (1080×1920 for mobile wallpaper, 2560×1440 for desktop)

---

### 14. "Participate" Page
**Goal:** Invite curators and moderators. A placeholder hook exists in the footer. (Noted in PROJECT.md §16.)

**What to build:**
- New route: `/participate`
- Simple static page explaining the curation philosophy and how to apply
- A form that submits to a new `POST /api/participate` endpoint → stores in DB or emails admin

---

### 15. Delete Dead Code
**Goal:** Remove `src/pages/AdminPage.tsx` which is unrouted and unused. (Noted in PROJECT.md §16.)

**What to do:**
- Delete `src/pages/AdminPage.tsx`
- Confirm no imports reference it
- Run `npm run lint` to verify clean

---

### 16. Gutenberg Source Links
**Goal:** When a quote exists in a Project Gutenberg text, link the `source_url` field to the canonical Gutenberg page — not for bulk import, but as a reference enrichment layer.

**What to build:**
- No new endpoints needed
- Extend the admin Quotes edit form: a "Link to Gutenberg" helper that searches `gutenberg.org` for the author and pre-fills `source_url`
- Useful for pre-1928 authors (Nietzsche, Thoreau, Marcus Aurelius, Dickens, etc.)

---

## Notes for Claude Code Sessions

- Always read `PROJECT.md` before starting any task — schema, endpoints, and env vars are all documented there
- All schema changes go into both `db.ts` (`runMigrations()`) and `schema.sql`
- New routes go into `src/App.tsx`; new pages go into `src/pages/`
- AI calls use Gemini via `@google/genai` — see existing counterpoint/enrichment prompts in `server.ts` for pattern
- Admin-only features need `adminMiddleware` on the route
- Test locally against the Neon dev branch before pushing to main
