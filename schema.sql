-- Inverted Comma — full schema
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL DEFAULT '',
  display_name        TEXT NOT NULL,
  handle              TEXT NOT NULL UNIQUE,
  avatar              TEXT,
  bio                 TEXT NOT NULL DEFAULT '',
  role                TEXT NOT NULL DEFAULT 'user',
  interests           TEXT[]  NOT NULL DEFAULT '{}',
  saved_quote_ids     TEXT[]  NOT NULL DEFAULT '{}',
  submitted_quote_ids TEXT[]  NOT NULL DEFAULT '{}',
  is_subscribed       BOOLEAN NOT NULL DEFAULT false,
  anonymous           BOOLEAN NOT NULL DEFAULT false,
  token_version       INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Authors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authors (
  slug          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  full_name     TEXT,
  bio           TEXT,
  image_url     TEXT,
  born          TEXT,
  died          TEXT,
  nationality   TEXT,
  known_for     TEXT,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  enriched_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Runtime quotes (admin-added + user-submitted) ─────────────────────────────
CREATE TABLE IF NOT EXISTS runtime_quotes (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  text         TEXT NOT NULL,
  author       TEXT NOT NULL,
  source       TEXT,
  source_url   TEXT,
  year         INTEGER,
  category     TEXT,
  context      TEXT,
  tags         TEXT[]  NOT NULL DEFAULT '{}',
  source_type  TEXT    NOT NULL DEFAULT 'book',
  status       TEXT    NOT NULL DEFAULT 'pending',
  submitted_by TEXT    REFERENCES users(id) ON DELETE SET NULL,
  enrichment   JSONB,
  likes        INTEGER NOT NULL DEFAULT 0,
  bookmarks    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Comments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,
  quote_id     TEXT NOT NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  avatar       TEXT,
  text         TEXT NOT NULL,
  anonymous    BOOLEAN NOT NULL DEFAULT false,
  likes        INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_quote_id_idx ON comments(quote_id);

-- ── Subscribers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id               SERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  source           TEXT NOT NULL DEFAULT 'footer',
  subscribed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at  TIMESTAMPTZ
);

-- ── Insights / AI cache ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights_cache (
  quote_id   TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Quote likes (one per user per quote) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quote_id)
);
