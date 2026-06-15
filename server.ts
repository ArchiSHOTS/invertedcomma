import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z, ZodSchema } from "zod";

// @napi-rs/canvas — server-side PNG generation for OG images
let createCanvas: any = null;
let loadImage: any = null;
let GlobalFonts: any = null;
try {
  const canvasMod = await import("@napi-rs/canvas");
  createCanvas  = canvasMod.createCanvas;
  loadImage     = canvasMod.loadImage;
  GlobalFonts   = canvasMod.GlobalFonts;
  console.log("[og] @napi-rs/canvas loaded");
} catch { console.warn("[og] @napi-rs/canvas not available — OG images will 404"); }

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { createServer as createViteServer } from "vite";
import { getEnrichedQuotes, AVAILABLE_TAGS } from "./src/data/quotes.ts";
import { DiscussionStore, Comment } from "./src/types.ts";

// Auth: bcrypt + jwt
let bcrypt: any = null;
let jwt: any = null;
try { bcrypt = (await import("bcrypt")).default; } catch { console.warn("[auth] bcrypt not installed — run: npm install bcrypt @types/bcrypt"); }
try { jwt = (await import("jsonwebtoken")).default; } catch { console.warn("[auth] jsonwebtoken not installed — run: npm install jsonwebtoken @types/jsonwebtoken"); }

// Google OAuth — server-side ID token verification
let googleClient: any = null;
try {
  const { OAuth2Client } = await import("google-auth-library");
  googleClient = new OAuth2Client();
} catch { console.warn("[auth] google-auth-library not installed — Google sign-in disabled"); }

dotenv.config();

// ── Database ──────────────────────────────────────────────────────────────────
import {
  testConnection, runMigrations,
  getUserById, getUserByEmail, getUserByHandle, getAllUsers,
  createUser, updateUser, deleteUser, toggleBookmark,
  getAuthorBySlug, getAllAuthors, upsertAuthor,
  getRuntimeQuotes, getRuntimeQuoteBySlug, getRuntimeQuoteEnrichment, createRuntimeQuote,
  updateRuntimeQuote, deleteRuntimeQuote, bulkSetRuntimeQuoteStatus, bulkEditRuntimeQuotes,
  getComments, createComment, likeComment, deleteComment, getAllComments,
  addSubscriber, getAllSubscribers, setSubscriberStatus,
  getUserCount, getSubscriberCount, getUserCountByRole,
  getInsight, setInsight,
  getAnatomy, upsertAnatomy, getAnatomyQuoteIds,
  toggleQuoteLike,
  upsertSocialContent, getSocialContent, listSocialContent, deleteSocialContent,
  getAIConfig, upsertAIConfig,
} from "./db.ts";
import { sendVerificationEmail, sendWelcomeEmail, sendSubscriberWelcomeEmail, type WelcomeQuote } from "./email.ts";
import { importWikiquote, importStatus } from "./wikiquote.ts";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const IS_PROD = process.env.NODE_ENV === "production";

// ── Compression: gzip/brotli all responses — JSON quote payloads shrink ~70-80%,
// the single biggest lever on Neon egress short of paginating /api/quotes.
app.use(compression());

// ── Security: HTTP headers ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc:     ["'self'"],
      // Google Identity Services: script + iframe + xhr + button styles
      // Cloudflare Turnstile: bot/spam protection on forms
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:         ["'self'", "data:", "https:"],
      connectSrc:     ["'self'", "https://generativelanguage.googleapis.com", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      frameSrc:       ["'self'", "https://accounts.google.com", "https://challenges.cloudflare.com"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  } : false, // relax CSP in dev so Vite HMR works
  crossOriginEmbedderPolicy: false, // needed for @napi-rs/canvas
  // Google sign-in opens a popup that must postMessage the credential back via
  // window.opener — the default COOP "same-origin" severs that link (blank popup).
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // Allow OG images (/api/og/*) to be fetched cross-origin by social crawlers
  // (Twitter, Facebook, LinkedIn) and let static assets load without CORS friction.
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── Security: CORS ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = IS_PROD
  ? [
      "https://www.invertedcomma.com",
      "https://invertedcomma.com",
    ]
  : ["http://localhost:3000", "http://localhost:5173"];

// IMPORTANT: CORS is scoped to /api only. The static frontend (HTML, JS, CSS,
// fonts) must never be gated by the API origin allowlist — otherwise asset
// requests from the serving origin get 403'd and the app renders blank.
app.use("/api", cors({
  origin(origin, cb) {
    // Allow requests with no origin (curl, mobile apps, same-origin subresources)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// CORS error handler — scoped to /api, must follow the cors() middleware
app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.message?.startsWith("CORS:")) {
    return res.status(403).json({ error: "Forbidden — cross-origin request not allowed" });
  }
  next(err);
});

// ── Security: Rate limiting ───────────────────────────────────────────────────
// Generic: 120 req / minute per IP
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

// Auth routes: 10 attempts / 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — please try again in 15 minutes." },
});

// AI routes: expensive, limit to 30 / 10 minutes per IP
const aiLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI rate limit reached — please wait a few minutes." },
});

// Rate-limit only the API — never throttle static asset delivery.
app.use("/api", generalLimiter);
app.use("/api/auth/login",           authLimiter);
app.use("/api/auth/register",        authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/change-password", authLimiter);
app.use("/api/auth/verify-email",        authLimiter);
app.use("/api/auth/resend-verification", authLimiter);
app.use("/api/quotes/:id/insights",  aiLimiter);
app.use("/api/discussions/:id/ai-counterpoint", aiLimiter);
app.use("/api/admin/extract-youtube", aiLimiter);
app.use("/api/admin/extract-text",    aiLimiter);

// ── Body size limit ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "512kb" }));

// ── Input validation helpers (Zod) ───────────────────────────────────────────
/** Middleware factory: validates req.body against a Zod schema */
function validate<T>(schema: ZodSchema<T>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return res.status(400).json({ error: msg });
    }
    (req as any).validated = result.data;
    next();
  };
}

// Schemas
const RegisterSchema = z.object({
  displayName: z.string().min(2).max(60).trim(),
  email:       z.string().email().max(254).toLowerCase(),
  password:    z.string().min(8).max(128),
  interests:   z.array(z.string().max(40)).max(20).optional().default([]),
  turnstileToken: z.string().optional(),
});

const LoginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional().default(""),
  newPassword:     z.string().min(8).max(128),
});

const InterestsSchema = z.object({
  interests: z.array(z.string().max(40)).max(20),
});

const ProfileSchema = z.object({
  displayName: z.string().min(2).max(60).trim().optional(),
  bio:         z.string().max(160).optional(),
  anonymous:   z.boolean().optional(),
  interests:   z.array(z.string().max(40)).max(20).optional(),
  isSubscribed:z.boolean().optional(),
});

const SubscribeSchema = z.object({
  email:  z.string().email().toLowerCase(),
  name:   z.string().max(120).trim().optional(),
  source: z.string().max(40).optional().default("footer"),
  turnstileToken: z.string().optional(),
});

const CommentSchema = z.object({
  username:      z.string().min(1).max(80).trim(),
  text:          z.string().min(1).max(2000).trim(),
  avatar:        z.string().url().optional(),
  isCounterpoint:z.boolean().optional().default(false),
  isAdmin:       z.boolean().optional().default(false),
  turnstileToken: z.string().optional(),
});

const QuoteCreateSchema = z.object({
  text:       z.string().min(3).max(2000).trim(),
  author:     z.string().min(1).max(200).trim(),
  source:     z.string().max(200).optional().default(""),
  sourceUrl:  z.string().url().optional().or(z.literal("")).optional(),
  year:       z.number().int().min(-3000).max(2100).optional(),
  category:   z.string().min(1).max(100),
  context:    z.string().max(1000).optional().default(""),
  tags:       z.array(z.string().max(40)).max(20).optional().default([]),
  sourceType: z.string().max(40).optional().default("unknown"),
});

// ── JWT secret safety check ───────────────────────────────────────────────────
if (IS_PROD && process.env.JWT_SECRET === "ic-dev-secret-change-in-production") {
  console.error("[security] FATAL: JWT_SECRET is still the default dev value. Set a real secret in production env vars.");
  process.exit(1);
}

// ── AI providers (Gemini / OpenAI) ────────────────────────────────────────────
// The active provider + API keys live in the `ai_config` DB row (admin-set from
// the dashboard) and override the env-var defaults. Both can be rotated at
// runtime via rebuildAIClients() — no redeploy needed.
type AIProvider = "gemini" | "openai";
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const aiConfig = {
  provider:    "gemini" as AIProvider,
  geminiKey:   process.env.GEMINI_API_KEY || "",
  openaiKey:   process.env.OPENAI_API_KEY || "",
  geminiModel: "",                       // "" → use the GEMINI_MODELS fallback chain
  openaiModel: DEFAULT_OPENAI_MODEL,
};

let geminiClient: GoogleGenAI | null = null;
let openaiClient: OpenAI | null = null;

function rebuildAIClients() {
  geminiClient = aiConfig.geminiKey ? new GoogleGenAI({ apiKey: aiConfig.geminiKey }) : null;
  openaiClient = aiConfig.openaiKey ? new OpenAI({ apiKey: aiConfig.openaiKey }) : null;
}
rebuildAIClients();

// Is the *currently selected* provider usable?
function aiReady(): boolean {
  return aiConfig.provider === "openai" ? !!openaiClient : !!geminiClient;
}

// Load persisted config from the DB (overrides env) at startup, and whenever
// the admin saves new settings.
async function loadAIConfig() {
  try {
    const row = await getAIConfig();
    if (row) {
      if (row.provider === "gemini" || row.provider === "openai") aiConfig.provider = row.provider;
      if (row.gemini_key)   aiConfig.geminiKey   = row.gemini_key;
      if (row.openai_key)   aiConfig.openaiKey   = row.openai_key;
      if (row.gemini_model) aiConfig.geminiModel = row.gemini_model;
      if (row.openai_model) aiConfig.openaiModel = row.openai_model;
      rebuildAIClients();
    }
  } catch (e: any) {
    console.warn("[ai] config load failed (using env defaults):", e?.message);
  }
  console.log(`[ai] provider=${aiConfig.provider} · gemini=${geminiClient ? "✓" : "✗"} · openai=${openaiClient ? "✓" : "✗"}`);
}

// Unified generate. Returns a normalised object with `.text` and `.candidates`
// so every existing caller (which reads response.text / groundingChunks) works
// against either provider. OpenAI has no built-in web grounding, so its
// candidates are empty (no sources) — callers degrade to model-supplied links.
async function generateWithFallback(
  contents: string | any[],
  config: Record<string, any> = {},
): Promise<any> {
  return aiConfig.provider === "openai"
    ? generateOpenAI(contents, config)
    : generateGemini(contents, config);
}

async function generateGemini(contents: string | any[], config: Record<string, any>): Promise<any> {
  if (!geminiClient) throw new Error("No Gemini client");
  const models = aiConfig.geminiModel ? [aiConfig.geminiModel] : GEMINI_MODELS;
  let lastErr: any;
  for (const model of models) {
    try {
      const res = await geminiClient.models.generateContent({ model, contents, config });
      if (models.indexOf(model) > 0) console.log(`[Gemini] Used fallback model: ${model}`);
      return res;
    } catch (err: any) {
      let status: number | undefined;
      try { status = JSON.parse(err.message || "{}").error?.code; } catch {}
      if (status === 503 || status === 429) {
        console.warn(`[Gemini] ${model} unavailable (${status}), trying next...`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function generateOpenAI(contents: string | any[], config: Record<string, any>): Promise<any> {
  if (!openaiClient) throw new Error("No OpenAI client");
  let prompt = Array.isArray(contents)
    ? contents.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("\n")
    : String(contents);
  const wantJson = config.responseMimeType === "application/json";
  // OpenAI's JSON mode requires the word "json" somewhere in the messages.
  if (wantJson && !/json/i.test(prompt)) prompt += "\n\nRespond with a single JSON object.";
  try {
    const resp = await openaiClient.chat.completions.create({
      model: aiConfig.openaiModel || DEFAULT_OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: typeof config.temperature === "number" ? config.temperature : 0.7,
      ...(wantJson ? { response_format: { type: "json_object" } } : {}),
    });
    return { text: resp.choices?.[0]?.message?.content || "", candidates: [] };
  } catch (err: any) {
    // Normalise OpenAI's status onto the shape isQuotaError()/aiError() parse,
    // so quota/rate-limit handling is identical across providers.
    const code = err?.status || err?.code;
    if (code === 429 || code === 503) {
      throw new Error(JSON.stringify({ error: { code: Number(code) || 429 } }));
    }
    throw err;
  }
}

// True when a Gemini error is a quota / rate-limit exhaustion (free-tier daily
// cap, etc). Retrying these immediately just burns more of the same quota.
function isQuotaError(err: any): boolean {
  const raw = err?.message || "";
  let code: number | undefined;
  try { code = JSON.parse(raw).error?.code; } catch {}
  return code === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw);
}

// Map a raw Gemini SDK error to a clean, user-facing message + HTTP status,
// so we never leak the provider's error JSON to the client.
function aiError(err: any): { status: number; message: string } {
  const raw = err?.message || "";
  let code: number | undefined;
  try { code = JSON.parse(raw).error?.code; } catch {}
  if (isQuotaError(err)) {
    return { status: 429, message: "Our AI has reached today's usage limit. Please try again later." };
  }
  // Bad/rejected API key (OpenAI throws status 401; Gemini reports 400 INVALID_ARGUMENT).
  if (err?.status === 401 || code === 401 || /invalid_api_key|API key not valid|API_KEY_INVALID/i.test(raw)) {
    return { status: 401, message: "The API key was rejected. Check the key for the selected provider." };
  }
  if (code === 503 || /UNAVAILABLE|overloaded/i.test(raw)) {
    return { status: 503, message: "The AI service is busy right now. Please try again in a moment." };
  }
  return { status: 502, message: "Couldn't generate this right now. Please try again." };
}

// ── Auth constants ────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "ic-dev-secret-change-in-production";
const SALT_ROUNDS = 10;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// ── Cloudflare Turnstile (bot/spam protection) ────────────────────────────────
// Degrades gracefully: if TURNSTILE_SECRET_KEY is unset, verification is skipped
// (so forms keep working before the Cloudflare keys are configured).
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data: any = await res.json();
    return !!data.success;
  } catch (e: any) {
    console.warn("[turnstile] verification request failed:", e?.message);
    return false;
  }
}

// Admin bootstrap (env-driven — never hardcode the real password in the repo)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_PASSWORD_RESET = process.env.ADMIN_PASSWORD_RESET === "true";
const LEGACY_ADMIN_EMAIL = "admin@invertedcomma.com";

// Custom tags added at runtime (admin-only, in-memory is fine — low-churn)
const customTags: string[] = [];

// ── AI enrichment ─────────────────────────────────────────────────────────────
interface QuoteEnrichment {
  authorBio: string;
  quoteMeaning: string;
  historicalContext: string;
  relatedWorks: { title: string; author: string; description: string }[];
  webReferences: { title: string; url: string }[];
  enrichedAt: string;
}

async function enrichQuoteWithAI(quote: any): Promise<QuoteEnrichment | null> {
  if (!aiReady()) return null;
  const sourceInfo = quote.source ? `\nSource: "${quote.source}"` : "";
  const yearInfo   = quote.year   ? `\nYear: ${quote.year}` : "";

  const prompt = `You are a literary and intellectual research assistant. Provide a rich, deeply researched profile for the following quote.

Quote: "${quote.text}"
Author: ${quote.author}${yearInfo}${sourceInfo}

Return a JSON object with EXACTLY these fields:
{
  "authorBio": "A rich 4-5 sentence biography of the author — their life, background, key ideas, major works, intellectual legacy, and historical importance. Write with depth and warmth.",
  "quoteMeaning": "2-3 sentences explaining the precise meaning and significance of this specific quote.",
  "historicalContext": "2-3 sentences on the historical or biographical context in which this quote was written or spoken.",
  "relatedWorks": [
    { "title": "Work title", "author": "Author", "description": "One sentence on relevance" }
  ],
  "webReferences": [
    { "title": "Reference title", "url": "https://..." }
  ]
}

Rules:
- relatedWorks: 3-5 entries.
- webReferences: 3-6 credible links.
- All text in British English.
- Return ONLY the JSON object, no markdown fences, no commentary.`;

  try {
    let response: any;
    let webReferences: { title: string; url: string }[] = [];
    try {
      response = await generateWithFallback(prompt, { tools: [{ googleSearch: {} }], temperature: 0.4 });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundedRefs = chunks
        .map((c: any) => ({ title: c.web?.title || "", url: c.web?.uri || "" }))
        .filter((r: any) => r.title && r.url)
        .slice(0, 6);
      if (groundedRefs.length > 0) webReferences = groundedRefs;
    } catch {
      response = await generateWithFallback(prompt, { temperature: 0.4 });
    }
    const raw     = response.text?.trim() || "";
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed  = JSON.parse(jsonStr);
    return {
      authorBio:        parsed.authorBio        || "",
      quoteMeaning:     parsed.quoteMeaning     || "",
      historicalContext:parsed.historicalContext || "",
      relatedWorks:     Array.isArray(parsed.relatedWorks)    ? parsed.relatedWorks.slice(0, 5) : [],
      webReferences:    webReferences.length > 0 ? webReferences :
                        (Array.isArray(parsed.webReferences) ? parsed.webReferences.slice(0, 6) : []),
      enrichedAt:       new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("[AI enrichment] Failed for quote", quote.id, ":", err.message);
    return null;
  }
}

// ── Author AI generation ──────────────────────────────────────────────────────
function authorSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function generateAuthorProfile(name: string): Promise<any | null> {
  if (!aiReady()) return null;
  const prompt = `You are a biographical research assistant. Generate a concise but rich profile for the person: "${name}".

Return ONLY a JSON object:
{
  "fullName": "Full legal name",
  "bio": "4-5 sentence biography.",
  "born": "Year as string, e.g. '1929'",
  "died": "Year as string, or omit if living",
  "nationality": "Country / cultural identity",
  "knownFor": "One sentence: primary field and contribution"
}

Return ONLY the JSON. No markdown, no commentary.`;
  try {
    const res  = await generateWithFallback(prompt, { temperature: 0.3 });
    const raw  = (res.text || "").trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const p    = JSON.parse(raw);
    return {
      slug:         authorSlug(name),
      name,
      fullName:     p.fullName  || name,
      bio:          p.bio       || "",
      born:         p.born,
      died:         p.died,
      nationality:  p.nationality,
      knownFor:     p.knownFor,
      autoGenerated:true,
      enrichedAt:   new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("[authors] Failed to generate profile for", name, ":", err.message);
    return null;
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function generateHandle(displayName: string, id: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 16) + "_" + id.slice(-4);
}

function sanitiseUser(u: any) {
  return {
    id:               u.id,
    name:             u.anonymous ? "Anonymous" : (u.displayName || u.name),
    handle:           u.handle,
    email:            u.email,
    avatar:           u.avatar,
    bio:              u.bio || "",
    anonymous:        u.anonymous || false,
    role:             u.role as "user" | "moderator" | "admin",
    joinedAt:         u.createdAt,
    savedQuoteIds:    u.savedQuoteIds || [],
    submittedQuoteIds:u.submittedQuoteIds || [],
    isSubscribed:     u.isSubscribed || false,
    emailVerified:    u.emailVerified || false,
    interests:        u.interests || [],
  };
}

function signToken(userId: string, tokenVersion = 0): string {
  if (!jwt) throw new Error("jsonwebtoken not installed");
  return jwt.sign({ sub: userId, tv: tokenVersion }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token: string): { sub: string; tv?: number } | null {
  if (!jwt) return null;
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; tv?: number }; } catch { return null; }
}

// Short-lived, single-purpose token for email verification links.
const SITE_URL = process.env.SITE_URL || "https://www.invertedcomma.com";
function signVerifyToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "verify" }, JWT_SECRET, { expiresIn: "24h" });
}
function verifyVerifyToken(token: string): string | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub: string; purpose?: string };
    return p.purpose === "verify" ? p.sub : null;
  } catch { return null; }
}

// Long-lived, single-purpose token for newsletter unsubscribe links.
function signUnsubscribeToken(email: string): string {
  return jwt.sign({ sub: email.toLowerCase(), purpose: "unsubscribe" }, JWT_SECRET, { expiresIn: "1y" });
}
function verifyUnsubscribeToken(token: string): string | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { sub: string; purpose?: string };
    return p.purpose === "unsubscribe" ? p.sub : null;
  } catch { return null; }
}
/** Fire-and-forget: email a verification link to the user. */
function dispatchVerification(user: { id: string; email: string; displayName?: string; name?: string }) {
  const url = `${SITE_URL}/auth/verify?token=${signVerifyToken(user.id)}`;
  sendVerificationEmail(user.email, user.displayName || user.name || "there", url)
    .catch(e => console.warn("[email] verification dispatch failed:", e?.message));
}

/** Pick a published quote matching one of the user's interests (random fallback). */
async function pickWelcomeQuote(interests: string[] = []): Promise<WelcomeQuote | null> {
  const dbRQ = await getRuntimeQuotes("published");
  const all  = [...getEnrichedQuotes(), ...dbRQ] as any[];
  if (!all.length) return null;

  const set = new Set((interests || []).map(s => s.toLowerCase()));
  let pool = all;
  if (set.size) {
    const matches = all.filter((q: any) =>
      (q.tags || []).some((t: string) => set.has(String(t).toLowerCase())) ||
      set.has(String(q.category || "").toLowerCase())
    );
    if (matches.length) pool = matches;
  }

  const q = pool[Math.floor(Math.random() * pool.length)];
  if (!q) return null;

  const matchedTag = set.size
    ? ((q.tags || []).find((t: string) => set.has(String(t).toLowerCase()))
        || (set.has(String(q.category || "").toLowerCase()) ? q.category : undefined))
    : undefined;

  return {
    text: q.text,
    author: q.author,
    context: q.context || "",
    tag: matchedTag,
    url: `${SITE_URL}/q/${q.slug}`,
  };
}

/** Fire-and-forget: email the welcome note with a personalised quote. */
async function dispatchWelcome(user: { email: string; displayName?: string; name?: string; interests?: string[] }) {
  try {
    const quote = await pickWelcomeQuote(user.interests);
    await sendWelcomeEmail(user.email, user.displayName || user.name || "there", quote);
  } catch (e: any) {
    console.warn("[email] welcome dispatch failed:", e?.message);
  }
}

// Reject a token whose embedded version no longer matches the user's current
// token_version (bumped on password change → invalidates older/stolen sessions).
function tokenVersionStale(payload: { tv?: number }, user: { tokenVersion?: number }) {
  return (payload.tv ?? 0) !== (user.tokenVersion ?? 0);
}

async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  const user = await getUserById(payload.sub);
  if (!user || tokenVersionStale(payload, user)) {
    return res.status(401).json({ error: "Session expired — please sign in again" });
  }
  (req as any).userId = payload.sub;
  next();
}

async function adminMiddlewareFn(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  const user = await getUserById(payload.sub);
  if (!user || tokenVersionStale(payload, user)) {
    return res.status(401).json({ error: "Session expired — please sign in again" });
  }
  if (user.role !== "admin" && user.role !== "moderator") {
    return res.status(403).json({ error: "Forbidden — admin or moderator role required" });
  }
  (req as any).userId   = payload.sub;
  (req as any).userRole = user.role;
  next();
}
const adminMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) =>
  adminMiddlewareFn(req, res, next);

async function superAdminMiddlewareFn(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  const user = await getUserById(payload.sub);
  if (!user || tokenVersionStale(payload, user)) {
    return res.status(401).json({ error: "Session expired — please sign in again" });
  }
  if (user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden — admin role required" });
  }
  (req as any).userId   = payload.sub;
  (req as any).userRole = user.role;
  next();
}
const superAdminMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) =>
  superAdminMiddlewareFn(req, res, next);

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

// Gemini responses (especially with googleSearch grounding) sometimes wrap the JSON
// array in markdown fences and/or trailing commentary/citations. Pull out just the
// outermost [...] array before parsing.
function extractJsonArray(raw: string): any[] {
  const stripped = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const start = stripped.indexOf("[");
  if (start === -1) return [];

  // Walk from the first '[' tracking bracket depth (ignoring brackets inside
  // string literals) to find its *matching* close. A naive first-to-last-bracket
  // slice breaks when the model appends grounding citations like "[1]" after the
  // array — the trailing text then trips JSON.parse with "non-whitespace after JSON".
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      try { return JSON.parse(stripped.slice(start, i + 1)); }
      catch { return []; }
    }
  }
  return [];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ")
    .trim();
}

// Fetches the video's title, channel name, and timestamped transcript by scraping
// the public watch page for caption track URLs. Returns null if no captions exist.
async function fetchYouTubeTranscript(videoId: string): Promise<{ title: string; author: string; transcript: string } | null> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const titleMatch  = html.match(/"title":"((?:[^"\\]|\\.)*)"/);
  const authorMatch = html.match(/"author":"((?:[^"\\]|\\.)*)"/);
  const title  = titleMatch  ? JSON.parse(`"${titleMatch[1]}"`)  : "";
  const author = authorMatch ? JSON.parse(`"${authorMatch[1]}"`) : "";

  const captionsMatch = html.match(/"captionTracks":(\[.*?\])/);
  if (!captionsMatch) return null;

  let tracks: any[];
  try { tracks = JSON.parse(captionsMatch[1]); } catch { return null; }
  if (!tracks.length) return null;

  const track = tracks.find(t => t.languageCode?.startsWith("en")) || tracks[0];
  const baseUrl = track.baseUrl?.replace(/\\u0026/g, "&");
  if (!baseUrl) return null;

  const capRes = await fetch(baseUrl);
  if (!capRes.ok) return null;
  const xml = await capRes.text();

  const transcript = [...xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)]
    .map(m => `[${Math.round(parseFloat(m[1]))}s] ${decodeHtmlEntities(m[2])}`)
    .join("\n");

  if (!transcript.trim()) return null;
  return { title, author, transcript };
}

// Lightweight, reliable metadata lookup (title + uploading channel) via YouTube's public oEmbed endpoint.
async function fetchYouTubeOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data: any = await res.json();
    return { title: data.title || "", author: data.author_name || "" };
  } catch {
    return null;
  }
}

function slugify(text: string, author: string): string {
  return `${text.slice(0, 40)} ${author}`.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim() + "-" + Math.random().toString(36).slice(2, 6);
}

// ── Health check (for splash page to detect when server is ready) ──────────────
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// ── Auth endpoints ────────────────────────────────────────────────────────────

app.post("/api/auth/register", validate(RegisterSchema), async (req: any, res) => {
  if (!bcrypt || !jwt) return res.status(503).json({ error: "Auth packages not installed." });
  const { displayName, email, password, interests, turnstileToken } = req.validated as z.infer<typeof RegisterSchema>;

  if (!(await verifyTurnstile(turnstileToken, req.ip))) {
    return res.status(400).json({ error: "Verification failed. Please try again." });
  }

  const existing = await getUserByEmail(email);
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const id           = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const handle       = generateHandle(displayName, id);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const avatar       = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=3D5A3E&color=fff&size=100`;

  const newUser = await createUser({ id, email, passwordHash, displayName, handle, avatar, interests });
  const token   = signToken(id, newUser.tokenVersion);
  // Soft gate: log in immediately, but email a verification link.
  dispatchVerification(newUser);
  res.status(201).json({ token, user: sanitiseUser(newUser) });
});

app.post("/api/auth/login", validate(LoginSchema), async (req: any, res) => {
  if (!bcrypt || !jwt) return res.status(503).json({ error: "Auth packages not installed." });
  const { email, password } = req.validated as z.infer<typeof LoginSchema>;

  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: "Invalid email or password" });

  res.json({ token: signToken(user.id, user.tokenVersion), user: sanitiseUser(user) });
});

app.get("/api/auth/me", async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  const user = await getUserById(payload.sub);
  if (!user || tokenVersionStale(payload, user)) {
    return res.status(401).json({ error: "Session expired — please sign in again" });
  }
  res.json({ user: sanitiseUser(user) });
});

app.post("/api/auth/forgot-password", validate(ForgotPasswordSchema), async (req: any, res) => {
  const { email } = req.validated as z.infer<typeof ForgotPasswordSchema>;
  const user = await getUserByEmail(email);
  if (user) console.log(`[auth] Password reset requested for ${email} — send reset link in production`);
  res.json({ message: "If an account exists for this email, a reset link has been sent." });
});

// Change password for the logged-in user. Bumps token_version (invalidating
// other sessions) and returns a fresh token so the current session stays valid.
app.post("/api/auth/change-password", authMiddleware, validate(ChangePasswordSchema), async (req: any, res) => {
  if (!bcrypt || !jwt) return res.status(503).json({ error: "Auth packages not installed." });
  const { currentPassword, newPassword } = req.validated as z.infer<typeof ChangePasswordSchema>;

  const user = await getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  // Accounts created via Google have an empty password hash — they may set a
  // password without supplying a current one. Everyone else must verify it.
  const hasPassword = !!user.passwordHash;
  if (hasPassword) {
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const nextVersion  = (user.tokenVersion ?? 0) + 1;
  await updateUser(user.id, { passwordHash, tokenVersion: nextVersion });

  // Re-issue a token at the new version so this session is not logged out.
  res.json({ token: signToken(user.id, nextVersion), message: "Password updated" });
});

// Confirm an email-verification link. Idempotent; sends the welcome email once.
app.post("/api/auth/verify-email", async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Verification token required" });
  const userId = verifyVerifyToken(token);
  if (!userId) return res.status(400).json({ error: "This verification link is invalid or has expired." });

  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: "Account not found" });

  if (!user.emailVerified) {
    await updateUser(user.id, { emailVerified: true });
    dispatchWelcome(user); // personalised quote based on their interests
  }
  res.json({ ok: true, alreadyVerified: user.emailVerified });
});

// Resend the verification email to the logged-in user.
app.post("/api/auth/resend-verification", authMiddleware, async (req: any, res) => {
  const user = await getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "Account not found" });
  if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
  dispatchVerification(user);
  res.json({ ok: true });
});

app.post("/api/auth/google", async (req, res) => {
  if (!jwt) return res.status(503).json({ error: "Auth packages not installed." });
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google sign-in is not configured on the server." });
  }
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Google credential required" });

  try {
    // Cryptographically verify the ID token: checks Google's signature, that the
    // token was issued for OUR client (audience), the issuer, and expiry.
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Could not verify Google account" });
    }
    if (payload.email_verified === false) {
      return res.status(403).json({ error: "Your Google email is not verified" });
    }

    const { sub: googleId, email, name, picture } = payload;
    let user = await getUserByEmail(email);
    if (!user) {
      const id = "user_google_" + googleId;
      // Google has already verified this email — mark verified and welcome them.
      user = await createUser({
        id, email, passwordHash: "", displayName: name || email,
        handle: generateHandle(name || email, id),
        avatar: picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=3D5A3E&color=fff&size=100`,
        interests: [], emailVerified: true,
      });
      dispatchWelcome(user); // Google users have no interests yet → random quote
    }
    res.json({ token: signToken(user.id, user.tokenVersion), user: sanitiseUser(user) });
  } catch (err: any) {
    console.warn("[auth] Google verification failed:", err.message);
    res.status(401).json({ error: "Invalid or expired Google credential" });
  }
});

app.put("/api/auth/interests", validate(InterestsSchema), async (req: any, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  const { interests } = req.validated as z.infer<typeof InterestsSchema>;
  const user = await updateUser(payload.sub, { interests });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: sanitiseUser(user) });
});

app.put("/api/auth/profile", validate(ProfileSchema), async (req: any, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });
  const existing = await getUserById(payload.sub);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { displayName, bio, anonymous, interests, isSubscribed } = req.validated as z.infer<typeof ProfileSchema>;
  const fields: any = {};

  if (displayName && typeof displayName === "string") {
    fields.displayName = displayName.trim().slice(0, 60);
    if (!anonymous) {
      fields.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(fields.displayName)}&background=3D5A3E&color=fff&size=100`;
    }
  }
  if (typeof bio          === "string")  fields.bio         = bio.trim().slice(0, 160);
  if (typeof anonymous    === "boolean") {
    fields.anonymous = anonymous;
    const n = fields.displayName || existing.displayName;
    fields.avatar = anonymous
      ? `https://ui-avatars.com/api/?name=Anonymous&background=888&color=fff&size=100`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=3D5A3E&color=fff&size=100`;
  }
  if (Array.isArray(interests))           fields.interests   = interests;
  if (typeof isSubscribed === "boolean")  fields.isSubscribed = isSubscribed;

  const user = await updateUser(payload.sub, fields);
  res.json({ user: sanitiseUser(user!) });
});

app.post("/api/quotes/:id/bookmark", async (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid token" });

  const user = await toggleBookmark(payload.sub, req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const bookmarked = user.savedQuoteIds.includes(req.params.id);
  res.json({ bookmarked, savedQuoteIds: user.savedQuoteIds });
});

app.get("/api/user/:handle", async (req, res) => {
  const user = await getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id, name: user.anonymous ? "Anonymous" : user.displayName,
    handle: user.handle, avatar: user.avatar, bio: user.bio || "",
    joinedAt: user.createdAt, anonymous: user.anonymous || false,
    savedQuoteIds: user.savedQuoteIds, submittedQuoteIds: user.submittedQuoteIds || [],
  });
});

app.get("/api/user/:handle/quotes", async (req, res) => {
  const user = await getUserByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: "User not found" });
  const dbRQ  = await getRuntimeQuotes("published");
  const allQuotes = [...getEnrichedQuotes(), ...dbRQ];
  const saved = allQuotes.filter(q => (user.savedQuoteIds || []).includes(q.id));
  res.json({ quotes: saved });
});

// ── Author endpoints ──────────────────────────────────────────────────────────

app.get("/api/authors", async (req, res) => {
  const dbRQ  = await getRuntimeQuotes("published");
  const allQuotes = [...getEnrichedQuotes(), ...dbRQ];
  const names = Array.from(new Set(allQuotes.map((q: any) => q.author as string))).sort();
  const dbAuthors = await getAllAuthors();
  const result = names.map(name => {
    const slug     = authorSlug(name);
    const existing = dbAuthors.find(a => a.slug === slug);
    const quoteCount = allQuotes.filter((q: any) => q.author === name).length;
    return existing
      ? { ...existing, quoteCount }
      : { id: slug, slug, name, bio: "", quoteCount, autoGenerated: false };
  });
  res.json({ authors: result });
});

app.get("/api/author/:slug", async (req, res) => {
  const { slug } = req.params;
  let profile    = await getAuthorBySlug(slug);
  const dbRQ     = await getRuntimeQuotes("published");
  const allQuotes = [...getEnrichedQuotes(), ...dbRQ];

  const authorName = profile?.name || allQuotes.find((q: any) => authorSlug(q.author) === slug)?.author;
  if (!authorName) return res.status(404).json({ error: "Author not found" });

  if (!profile || !profile.bio) {
    const generated = await generateAuthorProfile(authorName);
    if (generated) {
      await upsertAuthor(generated);
      profile = generated;
    }
  }

  const quotes = allQuotes.filter((q: any) => q.author === authorName);
  res.json({ author: profile || { id: slug, slug, name: authorName, bio: "" }, quotes });
});

app.put("/api/author/:slug", adminMiddleware, async (req: any, res) => {
  const { slug } = req.params;
  const updates  = req.body;
  const dbRQ     = await getRuntimeQuotes();
  const allQuotes = [...getEnrichedQuotes(), ...dbRQ];
  const name     = updates.name || allQuotes.find((q: any) => authorSlug(q.author) === slug)?.author || slug;
  const saved    = await upsertAuthor({ slug, name, ...updates, autoGenerated: false });
  res.json({ author: saved });
});

app.post("/api/author/:slug/regenerate", adminMiddleware, async (req: any, res) => {
  const { slug } = req.params;
  const existing = await getAuthorBySlug(slug);
  const dbRQ     = await getRuntimeQuotes();
  const allQuotes = [...getEnrichedQuotes(), ...dbRQ];
  const authorName = existing?.name || allQuotes.find((q: any) => authorSlug(q.author) === slug)?.author;
  if (!authorName) return res.status(404).json({ error: "Author not found" });
  res.json({ status: "generating" });
  generateAuthorProfile(authorName).then(async generated => {
    if (generated) await upsertAuthor(generated);
  });
});

// ── Quotes endpoints ──────────────────────────────────────────────────────────

app.get("/api/quotes", async (req, res) => {
  // Degrade gracefully: if the DB read fails, still serve the code-backed seed
  // quotes rather than blanking the page (or crashing on an async rejection).
  let dbRQ: Awaited<ReturnType<typeof getRuntimeQuotes>> = [];
  try {
    dbRQ = await getRuntimeQuotes("published");
  } catch (e: any) {
    console.error("[quotes] DB read failed, serving seed quotes only:", e?.message);
  }
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ quotes: [...getEnrichedQuotes(), ...dbRQ] });
});

app.get("/api/tags", (req, res) => {
  const quotes = getEnrichedQuotes();
  const tagCounts: Record<string, number> = {};
  quotes.forEach((q) => q.tags.forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  AVAILABLE_TAGS.forEach((tag) => { if (!tagCounts[tag]) tagCounts[tag] = 0; });
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  res.json({ tags: Object.entries(tagCounts).map(([name, count]) => ({ name, count })) });
});

app.get("/api/quotes/:slugOrId", async (req, res) => {
  const { slugOrId } = req.params;
  const seed  = getEnrichedQuotes();
  const seedQ = seed.find((q) => q.slug === slugOrId || q.id === slugOrId);
  if (seedQ) return res.json({ quote: seedQ });
  // Serve runtime quotes from the cached list (5-min TTL, no enrichment JSONB).
  // The detail page never reads `enrichment` — insights are fetched separately —
  // so this avoids an uncached SELECT * (incl. the heavy JSONB) on every view.
  let rq: any = null;
  try {
    rq = (await getRuntimeQuotes()).find((q: any) => q.slug === slugOrId || q.id === slugOrId);
  } catch (e: any) {
    console.error("[quote] DB read failed:", e?.message);
  }
  if (!rq)  return res.status(404).json({ error: "Quote not found" });
  res.json({ quote: rq });
});

// ── Newsletter ────────────────────────────────────────────────────────────────

app.post("/api/subscribe", validate(SubscribeSchema), async (req: any, res) => {
  const { email, name, source, turnstileToken } = req.validated as z.infer<typeof SubscribeSchema>;

  if (!(await verifyTurnstile(turnstileToken, req.ip))) {
    return res.status(400).json({ error: "Verification failed. Please try again." });
  }

  const sub = await addSubscriber(email, name, source);
  if (!sub) return res.status(500).json({ error: "Could not subscribe — please try again." });

  const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${signUnsubscribeToken(email)}`;
  sendSubscriberWelcomeEmail(email, name || "", unsubscribeUrl)
    .catch(e => console.warn("[email] subscriber welcome dispatch failed:", e?.message));

  res.json({ ok: true, message: "Subscribed!" });
});

app.get("/api/unsubscribe", async (req, res) => {
  const token = String(req.query.token || "");
  const email = verifyUnsubscribeToken(token);
  if (!email) return res.status(400).json({ error: "Invalid or expired link." });
  await setSubscriberStatus(email, "unsubscribed");
  res.json({ ok: true, email });
});

app.get("/api/admin/subscribers", adminMiddleware, async (req, res) => {
  const subs = await getAllSubscribers();
  res.json({ subscribers: subs, total: subs.length });
});

app.patch("/api/admin/subscribers/:id/status", adminMiddleware, async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!["subscribed", "unsubscribed", "spam"].includes(status || "")) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const sub = await setSubscriberStatus(req.params.id, status as any);
  if (!sub) return res.status(404).json({ error: "Subscriber not found" });
  res.json({ subscriber: sub });
});

// ── Admin: Tags ───────────────────────────────────────────────────────────────

app.post("/api/admin/tags", adminMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Tag name required" });
  const normalized = name.toLowerCase().trim().replace(/\s+/g, "-");
  if (!customTags.includes(normalized)) customTags.push(normalized);
  res.json({ ok: true, tags: customTags });
});

app.delete("/api/admin/tags/:name", adminMiddleware, (req, res) => {
  const idx = customTags.indexOf(req.params.name);
  if (idx !== -1) customTags.splice(idx, 1);
  res.json({ ok: true, tags: customTags });
});

// ── Admin: Quotes ─────────────────────────────────────────────────────────────

app.post("/api/admin/quotes", adminMiddleware, validate(QuoteCreateSchema), async (req: any, res) => {
  const { text, author, source, year, category, context, tags, sourceType, sourceUrl } = req.validated as z.infer<typeof QuoteCreateSchema>;

  const newQuote = await createRuntimeQuote({
    id:         `q_${Date.now()}`,
    slug:       slugify(text, author),
    text, author,
    source:     source || "",
    sourceUrl:  sourceUrl || null,
    year:       year ? Number(year) : null,
    category,
    context:    context || "",
    tags:       tags,
    sourceType: sourceType || "unknown",
    status:     "published",
    submittedBy:req.userId,
  });
  res.status(201).json({ ok: true, quote: newQuote });

  enrichQuoteWithAI(newQuote).then(async (enrichment) => {
    if (enrichment) {
      await updateRuntimeQuote(newQuote.id, { enrichment });
      console.log(`[AI] Enriched quote by ${newQuote.author} (${newQuote.id})`);
    }
  });
});

app.post("/api/admin/quotes/bulk", adminMiddleware, async (req: any, res) => {
  const { quotes } = req.body;
  if (!Array.isArray(quotes) || quotes.length === 0) return res.status(400).json({ error: "quotes[] array required" });

  const created: any[] = [];
  for (const q of quotes) {
    if (!q.text || !q.author) continue;
    const newQ = await createRuntimeQuote({
      id:         `q_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      slug:       slugify(q.text, q.author),
      text:       q.text,
      author:     q.author || "Unknown",
      source:     q.source || (q.youtubeId ? `youtube:${q.youtubeId}` : ""),
      sourceUrl:  q.sourceUrl || (q.youtubeId ? `https://www.youtube.com/watch?v=${q.youtubeId}` : null),
      year:       q.year ? Number(q.year) : null,
      category:   q.category || "Uncategorized",
      context:    q.context || "",
      tags:       Array.isArray(q.tags) ? q.tags : (Array.isArray(q.suggestedTags) ? q.suggestedTags : []),
      status:     q.status || "published",
      submittedBy:req.userId,
    });
    created.push(newQ);
  }
  res.status(201).json({ ok: true, created: created.length, quotes: created });

  for (const q of created) {
    enrichQuoteWithAI(q).then(async (enrichment) => {
      if (enrichment) await updateRuntimeQuote(q.id, { enrichment });
    });
  }
});

// Kick off a Wikiquote import (runs in the background; quotes land as 'pending').
app.post("/api/admin/import-wikiquote", adminMiddleware, async (req: any, res) => {
  if (importStatus.running) {
    return res.status(409).json({ error: "An import is already running.", status: importStatus });
  }
  const maxPerAuthor = Math.min(Math.max(Number(req.body?.max) || 40, 5), 120);
  const targetCount  = Math.min(Math.max(Number(req.body?.target) || 5000, 100), 20000);
  const maxDepth     = Math.min(Math.max(Number(req.body?.depth) || 2, 0), 3);
  // Fire and forget — the admin UI polls /status. A full category crawl can take
  // 15–40 min, so we never await it here.
  importWikiquote({ maxPerAuthor, targetCount, maxDepth })
    .catch(e => console.error("[wikiquote] import failed:", e?.message));
  res.status(202).json({ started: true });
});

// Poll import progress.
app.get("/api/admin/import-wikiquote/status", adminMiddleware, (_req, res) => {
  res.json(importStatus);
});

// Bulk approve/reject quotes — by explicit IDs, or by a status/sourceType filter
// (e.g. "approve all pending"). Single SQL UPDATE, so 2,000+ rows is instant.
// IMPORTANT: these /bulk/ routes MUST be registered BEFORE the /:id/ routes
// below — otherwise Express matches "bulk" as the :id param and the bulk
// handler is never reached (returns a spurious 404 "Quote not found").
const BulkSchema = z.object({
  ids: z.array(z.string()).optional(),
  status: z.enum(["pending", "published", "rejected"]).optional(),
  sourceType: z.string().optional(),
  category: z.string().optional(),
});

async function bulkSetStatus(req: any, res: any, newStatus: string) {
  const parsed = BulkSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { ids, status, sourceType, category } = parsed.data;
  if ((!ids || ids.length === 0) && !status && !sourceType && !category) {
    return res.status(400).json({ error: "Provide ids[] or a status/sourceType/category filter" });
  }
  const updated = await bulkSetRuntimeQuoteStatus(newStatus, {
    ids, whereStatus: status, whereSourceType: sourceType, whereCategory: category,
  });
  res.json({ updated });
}

app.post("/api/admin/quotes/bulk/approve", adminMiddleware, (req, res) => bulkSetStatus(req, res, "published"));
app.post("/api/admin/quotes/bulk/reject",  adminMiddleware, (req, res) => bulkSetStatus(req, res, "rejected"));

// Bulk-edit shared attributes (category, source, source URL, tags) across many quotes at once —
// e.g. select all "mindset" results and tag/categorise them together.
const BulkEditSchema = z.object({
  ids:       z.array(z.string()).min(1),
  category:  z.string().max(100).optional(),
  source:    z.string().max(200).optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  year:      z.number().int().min(-3000).max(new Date().getFullYear() + 1).optional(),
  addTags:   z.array(z.string().max(40)).max(20).optional(),
});

app.post("/api/admin/quotes/bulk/edit", adminMiddleware, async (req, res) => {
  const parsed = BulkEditSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { ids, category, source, sourceUrl, year, addTags } = parsed.data;
  const updated = await bulkEditRuntimeQuotes(ids, { category, source, sourceUrl: sourceUrl || undefined, year, addTags });
  res.json({ updated });
});

app.post("/api/admin/quotes/:id/approve", adminMiddleware, async (req, res) => {
  const q = await updateRuntimeQuote(req.params.id, { status: "published" });
  if (!q) return res.status(404).json({ error: "Quote not found" });
  res.json({ ok: true, quote: q });
});

app.post("/api/admin/quotes/:id/reject", adminMiddleware, async (req, res) => {
  const q = await updateRuntimeQuote(req.params.id, { status: "rejected" });
  if (!q) return res.status(404).json({ error: "Quote not found" });
  res.json({ ok: true, quote: q });
});

app.get("/api/admin/quotes", adminMiddleware, async (req, res) => {
  const quotes = await getRuntimeQuotes();
  res.json({ quotes, total: quotes.length });
});

app.delete("/api/admin/quotes/:id", adminMiddleware, async (req, res) => {
  const q = await getRuntimeQuoteBySlug(req.params.id);
  if (!q) return res.status(404).json({ error: "Quote not found" });
  await deleteRuntimeQuote(req.params.id);
  res.json({ ok: true, quote: q });
});

app.put("/api/admin/quotes/:id", adminMiddleware, async (req, res) => {
  const { text, author, source, sourceUrl, year, category, context, tags, sourceType } = req.body;
  const fields: any = {};
  if (text       !== undefined) fields.text       = text;
  if (author     !== undefined) fields.author     = author;
  if (source     !== undefined) fields.source     = source;
  if (sourceUrl  !== undefined) fields.sourceUrl  = sourceUrl || null;
  if (year       !== undefined) fields.year       = year ? Number(year) : null;
  if (category   !== undefined) fields.category   = category;
  if (context    !== undefined) fields.context    = context;
  if (tags       !== undefined) fields.tags       = Array.isArray(tags) ? tags : tags.split(",").map((t: string) => t.trim()).filter(Boolean);
  if (sourceType !== undefined) fields.sourceType = sourceType;
  const q = await updateRuntimeQuote(req.params.id, fields);
  if (!q) return res.status(404).json({ error: "Quote not found" });
  res.json({ ok: true, quote: q });
});

// ── Admin: Users ──────────────────────────────────────────────────────────────

app.get("/api/admin/users", adminMiddleware, async (req, res) => {
  const users = await getAllUsers();
  res.json({ users: users.map(sanitiseUser), total: users.length });
});

app.put("/api/admin/users/:id/role", superAdminMiddleware, async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { role } = req.body;
  if (!["user", "moderator", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  if (user.role === "admin" && role !== "admin") {
    const allUsers   = await getAllUsers();
    const adminCount = allUsers.filter(u => u.role === "admin").length;
    if (adminCount <= 1) return res.status(400).json({ error: "Cannot remove the last admin" });
  }
  const updated = await updateUser(req.params.id, { role });
  res.json({ ok: true, user: sanitiseUser(updated!) });
});

app.delete("/api/admin/users/:id", superAdminMiddleware, async (req: any, res) => {
  const caller = await getUserById(req.userId);
  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === caller?.id)      return res.status(400).json({ error: "Cannot delete your own account" });
  if (target.role === "admin")       return res.status(400).json({ error: "Cannot delete another admin" });
  await deleteUser(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  const allSeed   = getEnrichedQuotes();
  const rq        = await getRuntimeQuotes();
  const pending   = rq.filter(q => q.status === "pending").length;
  const published = allSeed.length + rq.filter(q => q.status === "published").length;

  // Use lightweight COUNT queries instead of fetching all records just to count them.
  // This saves significant bandwidth on stats lookups.
  const totalUsers       = await getUserCount();
  const totalSubscribers = await getSubscriberCount();
  const admins           = await getUserCountByRole("admin");
  const moderators       = await getUserCountByRole("moderator");

  res.json({
    totalQuotes:      published,
    pendingQuotes:    pending,
    totalUsers,
    totalSubscribers,
    admins,
    moderators,
  });
});

// ── Discussions ───────────────────────────────────────────────────────────────

app.get("/api/admin/discussions", adminMiddleware, async (req, res) => {
  const comments = await getAllComments();
  // Group by quote_id
  const byQuote: Record<string, any[]> = {};
  for (const c of comments) {
    if (!byQuote[c.quote_id]) byQuote[c.quote_id] = [];
    byQuote[c.quote_id].push(c);
  }
  const summary = Object.entries(byQuote).map(([quoteId, cmts]) => ({
    quoteId, commentCount: cmts.length, latestComment: cmts[cmts.length - 1] || null,
  }));
  res.json({ discussions: summary, total: summary.length });
});

app.delete("/api/admin/discussions/:quoteId/comments/:commentId", adminMiddleware, async (req, res) => {
  await deleteComment(req.params.commentId);
  res.json({ ok: true });
});

app.get("/api/discussions/:quoteId", async (req, res) => {
  const comments = await getComments(req.params.quoteId);
  res.json({ quoteId: req.params.quoteId, comments });
});

app.post("/api/discussions/:quoteId", validate(CommentSchema), async (req: any, res) => {
  const { quoteId }                              = req.params;
  const { username, avatar, text, isCounterpoint, isAdmin, turnstileToken } = req.validated as z.infer<typeof CommentSchema>;

  if (!(await verifyTurnstile(turnstileToken, req.ip))) {
    return res.status(400).json({ error: "Verification failed. Please try again." });
  }

  const comment = await createComment({
    id:          `c_${Date.now()}`,
    quoteId,
    displayName: username,
    avatar:      avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100",
    text,
    anonymous:   false,
  });
  const comments = await getComments(quoteId);
  res.json({ quoteId, comments });
});

app.post("/api/discussions/:quoteId/ai-counterpoint", async (req, res) => {
  const { quoteId }          = req.params;
  const { quoteText, author } = req.body;
  if (!quoteText || !author) return res.status(400).json({ error: "Quote details are required" });

  // Return cached counterpoint if available
  const cached = await getInsight(`cp:${quoteId}`);
  if (cached) return res.json(cached);

  if (!aiReady()) {
    const fallback = `Under a critical lens, this quote by ${author} proposes a singular path that glosses over contextual diversity.`;
    const data = { aiCounterpoint: fallback, sources: [] };
    await setInsight(`cp:${quoteId}`, data);
    return res.json(data);
  }

  try {
    const prompt = `You are a critical thinker and philosopher. A user is reading this quote:
"${quoteText}" — ${author}

Search the web for scholarly critiques, philosophical objections, or documented counterarguments to this quote or its underlying ideas. Write a concise, intellectually sharp counterpoint (2–3 sentences). Tone: sophisticated, respectful, engaging.`;

    let response: any;
    let sources: { title: string; url: string }[] = [];
    try {
      response = await generateWithFallback(prompt, { tools: [{ googleSearch: {} }], temperature: 0.7 });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      sources = chunks.map((c: any) => ({ title: c.web?.title || "", url: c.web?.uri || "" }))
        .filter((s: any) => s.title && s.url).slice(0, 4);
    } catch (gErr: any) {
      // Grounded search can fail for non-quota reasons — retry once without tools.
      // But on a quota/rate-limit error, retrying just wastes more quota: bail.
      if (isQuotaError(gErr)) throw gErr;
      response = await generateWithFallback(prompt, { temperature: 0.7 });
    }

    const aiCounterpoint = response.text?.trim() || "No counterpoint could be generated. Try again.";
    const data = { aiCounterpoint, sources };
    await setInsight(`cp:${quoteId}`, data);
    res.json(data);
  } catch (err: any) {
    console.error("[Gemini] Counterpoint error:", err.message);
    const { status, message } = aiError(err);
    res.status(status).json({ error: message });
  }
});

// ── Social Content (saved 4-card bundles) ──────────────────────────────────────
const SocialContentSchema = z.object({
  context:      z.string().max(4000).optional().default(""),
  authorLine:   z.string().max(200).optional().default(""),
  authorBio:    z.string().max(4000).optional().default(""),
  counterpoint: z.string().max(4000).optional().default(""),
});

// List saved bundles for the dashboard.
app.get("/api/admin/social-content", adminMiddleware, async (_req, res) => {
  res.json({ items: await listSocialContent() });
});

// Fetch one saved bundle (to know whether a quote already has content).
app.get("/api/admin/social-content/:quoteId", adminMiddleware, async (req, res) => {
  const row = await getSocialContent(req.params.quoteId);
  if (!row) return res.status(404).json({ error: "No saved social content for this quote" });
  res.json({ item: row });
});

// Create/update a saved bundle. The client renders card images locally; we only
// persist the lightweight text snapshots so re-downloads never re-call the AI.
app.post("/api/admin/social-content/:quoteId", adminMiddleware, validate(SocialContentSchema), async (req: any, res) => {
  const { context, authorLine, authorBio, counterpoint } = req.validated as z.infer<typeof SocialContentSchema>;
  const row = await upsertSocialContent(req.params.quoteId, { context, authorLine, authorBio, counterpoint });
  res.status(201).json({ item: row });
});

app.delete("/api/admin/social-content/:quoteId", adminMiddleware, async (req, res) => {
  const ok = await deleteSocialContent(req.params.quoteId);
  if (!ok) return res.status(404).json({ error: "No saved social content for this quote" });
  res.json({ ok: true });
});

// ── Admin: YouTube extraction ─────────────────────────────────────────────────

app.post("/api/admin/extract-youtube", adminMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "YouTube URL required" });
  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: "Could not parse YouTube video ID from URL" });
  if (!aiReady()) return res.status(503).json({ error: "AI is not configured. Set a provider + API key in the dashboard AI tab." });

  try {
    // oEmbed gives us a reliable title + uploading channel for grounding, regardless of
    // whether we can pull a full transcript.
    const oembed = await fetchYouTubeOEmbed(videoId);
    const videoTitle  = oembed?.title  || "";
    const channelName = oembed?.author || "";

    if (!videoTitle && !channelName) {
      return res.status(422).json({ error: "Could not find this video. Double-check the URL." });
    }

    // Best case: pull the real timestamped transcript so extraction is grounded in
    // what was actually said — not a guess based on title/channel alone.
    const transcriptMeta = await fetchYouTubeTranscript(videoId);

    let extracted: any[] = [];

    if (transcriptMeta?.transcript) {
      const speakerName = transcriptMeta.author || channelName;
      const truncated = transcriptMeta.transcript.length > 40000
        ? transcriptMeta.transcript.slice(0, 40000) + "\n[...transcript truncated]"
        : transcriptMeta.transcript;

      const prompt = `You are a quote extraction expert. Below is the actual timestamped transcript of a YouTube video.

Video title: "${transcriptMeta.title || videoTitle}"
Channel/Speaker: "${speakerName}"

Transcript:
"""
${truncated}
"""

Extract the most insightful, thought-provoking, or memorable quotes spoken in THIS transcript — verbatim, lightly cleaned up for filler words/false starts only. The "speaker" field must be "${speakerName}" unless the transcript clearly shows a different named guest speaking. Use the "[Ns]" markers in the transcript to determine accurate startSeconds/endSeconds for each quote. For each quote provide the exact text, speaker name, start/end timestamps (seconds), brief context, and 2-4 relevant topic tags.

Return a valid JSON array:
[
  {
    "text": "exact quote text",
    "speaker": "Speaker Name",
    "startSeconds": 120,
    "endSeconds": 145,
    "context": "Brief context",
    "suggestedTags": ["tag1", "tag2"],
    "youtubeId": "${videoId}"
  }
]

Extract 3-10 quotes. Return ONLY the JSON array.`;

      const response = await generateWithFallback(prompt, { temperature: 0.3, responseMimeType: "application/json" });
      extracted = extractJsonArray(response.text || "[]");
      if (extracted.length === 0) {
        console.warn(`[extract-youtube] transcript path returned 0 quotes for ${videoId}, raw length=${(response.text || "").length}`);
      }
    }

    // No transcript (common — YouTube's caption CDN blocks datacenter IPs), or the
    // transcript path came back empty. Fall back to web-grounded search using the
    // verified title/channel so the model researches the actual speaker instead of guessing.
    if (extracted.length === 0) {
      const prompt = `You are a quote extraction expert researching a specific YouTube video.

Video title: "${videoTitle}"
Uploaded by channel: "${channelName}"
URL: https://www.youtube.com/watch?v=${videoId}

Step 1: Identify the actual speaker. Use the title to figure out who is speaking (the uploading channel may just be a re-poster, not the speaker) — e.g. "Simon Sinek" for a video titled "... TED Talk from Simon Sinek". If the channel name itself looks like a real person's name and the title doesn't suggest otherwise, the channel owner is the speaker.

Step 2: Search the web for a transcript, article, or reliable coverage of THIS video, OR — if that's not findable — for well-documented quotes by the identified speaker on the same topic as this video's title (e.g. official transcripts on ted.com, interview transcripts, articles quoting them on this subject).

Step 3: Extract the most insightful, thought-provoking, or memorable quotes, attributed to the speaker identified in Step 1. Only return an empty array if you cannot confidently identify who the speaker even is — do NOT substitute a different person as the speaker.

Return a valid JSON array (no markdown fences):
[
  {
    "text": "exact quote text",
    "speaker": "Speaker Name",
    "startSeconds": 0,
    "endSeconds": 0,
    "context": "Brief context",
    "suggestedTags": ["tag1", "tag2"],
    "youtubeId": "${videoId}"
  }
]

Extract up to 10 quotes. Use 0 for startSeconds/endSeconds if timestamps are unknown. Return ONLY the JSON array.`;

      const response = await generateWithFallback(prompt, { tools: [{ googleSearch: {} }], temperature: 0.3 });
      extracted = extractJsonArray(response.text || "[]");
      if (extracted.length === 0) {
        console.warn(`[extract-youtube] search-grounded path returned 0 quotes for ${videoId}, raw length=${(response.text || "").length}, raw="${(response.text || "").slice(0, 300)}"`);
      }
    }

    if (!Array.isArray(extracted)) return res.status(500).json({ error: "AI returned unexpected format" });
    if (extracted.length === 0) {
      return res.status(422).json({ error: "Couldn't find quotable content for this video. Try the 'Paste text' option with a transcript instead." });
    }

    res.json({
      ok: true, videoId, videoTitle, channelName,
      videoUrl:     `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      quotes: extracted, count: extracted.length,
    });
  } catch (error: any) {
    console.error("YouTube extraction error:", error);
    res.status(500).json({ error: "Extraction failed: " + error.message });
  }
});

app.post("/api/admin/extract-text", adminMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 50) return res.status(400).json({ error: "Paste at least 50 characters of text" });
  if (!aiReady()) return res.status(503).json({ error: "AI is not configured. Set a provider + API key in the dashboard AI tab." });

  try {
    const prompt = `You are a quote extraction expert. Extract all notable, insightful, or memorable quotes from the following text.

Source text:
---
${text.slice(0, 8000)}
---

For each quote, return: exact text, speaker/author, brief context, 2-4 tags, and category.

Return ONLY a valid JSON array:
[
  {
    "text": "quote text",
    "author": "Speaker/Author (if identifiable from the text, else empty string)",
    "category": "Category Name",
    "context": "Brief context",
    "suggestedTags": ["tag1", "tag2"]
  }
]

Extract 3-15 quotes. Return ONLY the JSON array.`;

    const response  = await generateWithFallback(prompt, { temperature: 0.2, responseMimeType: "application/json" });
    const extracted = extractJsonArray(response.text || "[]");
    res.json({ ok: true, quotes: extracted, count: extracted.length });
  } catch (error: any) {
    console.error("Text extraction error:", error);
    res.status(500).json({ error: "Extraction failed: " + error.message });
  }
});

// ── Debug ─────────────────────────────────────────────────────────────────────
app.get("/api/debug/ai", async (_req, res) => {
  if (!aiReady()) return res.json({ ok: false, reason: `No API key for active provider (${aiConfig.provider})` });
  try {
    const r = await generateWithFallback("Say 'AI is working' in exactly 4 words.", { temperature: 0 });
    res.json({ ok: true, provider: aiConfig.provider, response: r.text?.trim() });
  } catch (err: any) {
    res.json({ ok: false, provider: aiConfig.provider, reason: aiError(err).message });
  }
});

// ── Admin: AI provider configuration ──────────────────────────────────────────
// API keys are never returned to the client — only a masked "set + last 4".
function maskKey(k: string) {
  return k ? { set: true, last4: k.slice(-4) } : { set: false, last4: "" };
}

app.get("/api/admin/ai-config", adminMiddleware, (_req, res) => {
  res.json({
    provider:    aiConfig.provider,
    geminiModel: aiConfig.geminiModel || "",
    openaiModel: aiConfig.openaiModel || DEFAULT_OPENAI_MODEL,
    gemini:      maskKey(aiConfig.geminiKey),
    openai:      maskKey(aiConfig.openaiKey),
    ready:       aiReady(),
    geminiModels:       GEMINI_MODELS,
    defaultOpenaiModel: DEFAULT_OPENAI_MODEL,
  });
});

const AIConfigSchema = z.object({
  provider:    z.enum(["gemini", "openai"]).optional(),
  geminiKey:   z.string().trim().max(200).optional(),
  openaiKey:   z.string().trim().max(200).optional(),
  geminiModel: z.string().trim().max(80).optional(),
  openaiModel: z.string().trim().max(80).optional(),
});

app.put("/api/admin/ai-config", adminMiddleware, validate(AIConfigSchema), async (req: any, res) => {
  const body = req.validated as z.infer<typeof AIConfigSchema>;
  // Blank key fields mean "leave unchanged" (the UI never echoes the saved key
  // back, so an untouched field arrives empty). Model fields may be cleared.
  const fields: Parameters<typeof upsertAIConfig>[0] = {};
  if (body.provider)               fields.provider    = body.provider;
  if (body.geminiKey)              fields.geminiKey   = body.geminiKey;
  if (body.openaiKey)              fields.openaiKey   = body.openaiKey;
  if (body.geminiModel !== undefined) fields.geminiModel = body.geminiModel;
  if (body.openaiModel !== undefined) fields.openaiModel = body.openaiModel;

  try {
    await upsertAIConfig(fields);
  } catch (e: any) {
    return res.status(500).json({ error: "Could not save AI config: " + e?.message });
  }

  // Apply live so the change takes effect without a restart.
  if (fields.provider)    aiConfig.provider    = fields.provider as AIProvider;
  if (fields.geminiKey)   aiConfig.geminiKey   = fields.geminiKey;
  if (fields.openaiKey)   aiConfig.openaiKey   = fields.openaiKey;
  if (fields.geminiModel !== undefined) aiConfig.geminiModel = fields.geminiModel;
  if (fields.openaiModel !== undefined) aiConfig.openaiModel = fields.openaiModel;
  rebuildAIClients();

  res.json({ ok: true, provider: aiConfig.provider, ready: aiReady() });
});

// Test the active provider end-to-end (a tiny live call).
app.post("/api/admin/ai-config/test", adminMiddleware, async (_req, res) => {
  if (!aiReady()) return res.json({ ok: false, provider: aiConfig.provider, reason: `No API key set for ${aiConfig.provider}.` });
  try {
    const r = await generateWithFallback("Reply with exactly: OK", { temperature: 0 });
    res.json({ ok: true, provider: aiConfig.provider, response: (r.text || "").trim().slice(0, 80) });
  } catch (err: any) {
    res.json({ ok: false, provider: aiConfig.provider, reason: aiError(err).message });
  }
});

// ── Quote Insights ────────────────────────────────────────────────────────────
app.get("/api/quotes/:quoteId/insights", async (req, res) => {
  const { quoteId } = req.params;
  const allSeed     = getEnrichedQuotes();
  const seedQ       = allSeed.find((q: any) => q.id === quoteId);
  // Resolve runtime quotes from the cached list (no enrichment) to avoid a
  // SELECT * on every insights request/poll.
  const runtimeQ    = seedQ ? null : (await getRuntimeQuotes()).find((q: any) => q.id === quoteId || q.slug === quoteId);
  const quote       = seedQ ?? runtimeQ;
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  // Runtime quote: return inline enrichment if available. Pull ONLY the
  // enrichment column (not the whole row) so repeated polls stay cheap.
  if (runtimeQ) {
    const enrichment = await getRuntimeQuoteEnrichment(quote.id);
    if (enrichment) return res.json(enrichment);
  }

  // DB insights cache
  const cached = await getInsight(quoteId);
  if (cached) return res.json(cached);

  // cacheOnly: caller (the Deep Dive tab opening) just wants existing insights —
  // never spend an AI request on a page view. Signal "needs generation" instead.
  if (req.query.cacheOnly === "1") {
    return res.json({ available: false });
  }

  if (!aiReady()) {
    return res.json({ authorBio: null, quoteMeaning: null, historicalContext: null, relatedWorks: [], webReferences: [] });
  }

  try {
    const enrichment = await enrichQuoteWithAI(quote);
    if (!enrichment) {
      return res.json({ authorBio: null, quoteMeaning: null, historicalContext: null, relatedWorks: [], webReferences: [] });
    }
    if (runtimeQ) {
      await updateRuntimeQuote(quote.id, { enrichment });
    } else {
      await setInsight(quoteId, enrichment);
    }
    res.json(enrichment);
  } catch (err: any) {
    console.error("[Gemini] Insights error:", err.message);
    const { status, message } = aiError(err);
    res.status(status).json({ error: message });
  }
});

// ── Anatomy (admin-curated deep context) ──────────────────────────────────────

const ANATOMY_SECTIONS = ["context", "makers", "discussions", "relevance", "evolution", "further_reading"] as const;
type AnatomySectionKey = typeof ANATOMY_SECTIONS[number];

// Per-section drafting instructions, used both for full generation and single-section regeneration.
const ANATOMY_SECTION_PROMPTS: Record<AnatomySectionKey, string> = {
  context:         "The real-world circumstances and background: when, where, and why the quote was first said or written, and what was happening around it.",
  makers:          "The makers and origin: who authored or voiced it, their background, and how the line came to be attributed, adapted, or popularised over time.",
  discussions:     "Scholarly discussions: how philosophers, critics, and scholars across traditions interpret, support, or complicate the idea. Note key debates.",
  relevance:       "Modern relevance: how the idea reads and applies in today's world — culture, work, technology, daily life.",
  evolution:       "Evolution over time: how the phrasing and meaning of the idea have shifted across eras, cultures, and re-voicings.",
  further_reading: "Further reading: a short curated list of books, essays, talks, or films that deepen the idea. Return each as a bullet line starting with '- ' (title — author/source, one-line why).",
};

// Robustly pull the first balanced JSON object from a model response (tolerates fences / trailing prose / citations).
function extractJsonObject(raw: string): any {
  const stripped = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const start = stripped.indexOf("{");
  if (start === -1) return {};
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(stripped.slice(start, i + 1)); }
      catch { return {}; }
    }
  }
  return {};
}

// Resolve a quote by id-or-slug across seed + runtime, mirroring the insights endpoint.
async function resolveQuoteForAnatomy(quoteId: string) {
  const allSeed  = getEnrichedQuotes();
  const runtimeQ = await getRuntimeQuoteBySlug(quoteId);
  return allSeed.find((q: any) => q.id === quoteId) ?? runtimeQ ?? null;
}

function anatomyQuoteContext(q: any): string {
  return `Quote: "${q.text}"\nAttributed to: ${q.author}${q.source ? `\nSource: ${q.source}` : ""}${q.year ? `\nYear: ${q.year}` : ""}`;
}

// Public: enabled anatomy with only its enabled sections (visitors).
app.get("/api/quotes/:quoteId/anatomy", async (req, res) => {
  const row = await getAnatomy(req.params.quoteId);
  if (!row || !row.enabled) return res.json({ enabled: false });
  const all = row.data?.sections || {};
  const sections: Record<string, { body: string }> = {};
  for (const key of ANATOMY_SECTIONS) {
    if (all[key]?.enabled && all[key]?.body?.trim()) sections[key] = { body: all[key].body };
  }
  res.json({ enabled: true, sections });
});

// Admin: full anatomy incl. disabled sections + flags, for the editor.
app.get("/api/admin/quotes/:quoteId/anatomy", adminMiddleware, async (req, res) => {
  const row = await getAnatomy(req.params.quoteId);
  if (!row) return res.json({ exists: false });
  res.json({ exists: true, enabled: row.enabled, sections: row.data?.sections || {} });
});

// Admin: generate all six sections from scratch (grounded), enable everything, persist.
app.post("/api/admin/quotes/:quoteId/anatomy/generate", adminMiddleware, async (req, res) => {
  if (!aiReady()) return res.status(503).json({ error: "AI is not configured. Set a provider + API key in the dashboard AI tab." });
  const quote = await resolveQuoteForAnatomy(req.params.quoteId);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const sectionSpec = ANATOMY_SECTIONS.map(k => `"${k}": ${ANATOMY_SECTION_PROMPTS[k]}`).join("\n");
  const prompt = `You are an editorial researcher writing a deep "anatomy" of a quote for a thoughtful general audience.

${anatomyQuoteContext(quote)}

Write six sections. Each value is 2-4 short paragraphs of grounded, accurate prose (you may use "- " bullet lines where a list fits). Be specific and factual; do not invent sources.

Sections (key: what to cover):
${sectionSpec}

Return ONLY a JSON object with exactly these keys: ${ANATOMY_SECTIONS.join(", ")}. Each value is the section's prose as a single string.`;

  try {
    const response = await generateWithFallback(prompt, { tools: [{ googleSearch: {} }], temperature: 0.4 });
    const parsed   = extractJsonObject(response.text || "{}");
    const sections: Record<string, { body: string; enabled: boolean }> = {};
    for (const key of ANATOMY_SECTIONS) {
      sections[key] = { body: typeof parsed[key] === "string" ? parsed[key].trim() : "", enabled: true };
    }
    const data = { sections, model: "gemini", generatedAt: new Date().toISOString(), editedAt: new Date().toISOString() };
    await upsertAnatomy(req.params.quoteId, data, true);
    res.json({ enabled: true, sections });
  } catch (err: any) {
    console.error("[anatomy] generate error:", err.message);
    res.status(500).json({ error: "Anatomy generation failed: " + err.message });
  }
});

// Admin: regenerate a single section's prose — returns the draft WITHOUT saving.
app.post("/api/admin/quotes/:quoteId/anatomy/regenerate-section", adminMiddleware, async (req, res) => {
  if (!aiReady()) return res.status(503).json({ error: "AI is not configured. Set a provider + API key in the dashboard AI tab." });
  const section = req.body?.section as AnatomySectionKey;
  if (!ANATOMY_SECTIONS.includes(section)) return res.status(400).json({ error: "Invalid section" });
  const quote = await resolveQuoteForAnatomy(req.params.quoteId);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const prompt = `You are an editorial researcher writing one section of a quote's deep "anatomy" for a thoughtful general audience.

${anatomyQuoteContext(quote)}

Write ONLY this section: ${ANATOMY_SECTION_PROMPTS[section]}

Return 2-4 short paragraphs of grounded, accurate prose (you may use "- " bullet lines where a list fits). Do not invent sources. Return ONLY the prose — no headings, no JSON, no preamble.`;

  try {
    const response = await generateWithFallback(prompt, { tools: [{ googleSearch: {} }], temperature: 0.4 });
    res.json({ body: (response.text || "").trim() });
  } catch (err: any) {
    console.error("[anatomy] regenerate error:", err.message);
    res.status(500).json({ error: "Section regeneration failed: " + err.message });
  }
});

// Admin: save the whole anatomy (Save All) — bodies + per-section flags + top-level enabled.
const AnatomySectionSchema = z.object({ body: z.string().max(8000), enabled: z.boolean() });
const AnatomySaveSchema = z.object({
  enabled:  z.boolean(),
  sections: z.record(z.enum(ANATOMY_SECTIONS), AnatomySectionSchema),
});

app.put("/api/admin/quotes/:quoteId/anatomy", adminMiddleware, async (req, res) => {
  const parsed = AnatomySaveSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid anatomy payload" });
  const existing = await getAnatomy(req.params.quoteId);
  const sections: Record<string, { body: string; enabled: boolean }> = {};
  for (const key of ANATOMY_SECTIONS) {
    const incoming = parsed.data.sections[key];
    sections[key] = incoming
      ? { body: incoming.body.trim(), enabled: incoming.enabled }
      : (existing?.data?.sections?.[key] ?? { body: "", enabled: false });
  }
  const data = {
    sections,
    model:       existing?.data?.model ?? "gemini",
    generatedAt: existing?.data?.generatedAt ?? new Date().toISOString(),
    editedAt:    new Date().toISOString(),
  };
  await upsertAnatomy(req.params.quoteId, data, parsed.data.enabled);
  res.json({ ok: true, enabled: parsed.data.enabled, sections });
});

// Public: ids of quotes that have an enabled anatomy — powers the "has anatomy" badge on cards.
app.get("/api/anatomies/ids", async (_req, res) => {
  try {
    res.json({ ids: await getAnatomyQuoteIds() });
    return;
  } catch (e: any) {
    console.error("[anatomies/ids] DB read failed, returning empty set:", e?.message);
    res.json({ ids: [] });
  }
});

// ── OG Image generation ───────────────────────────────────────────────────────
const OG_W = 1200; const OG_H = 630;
const OG_BG_DARK = "#0F1F10"; const OG_BG_CREAM = "#FBF9F6";
const OG_GREEN = "#3D5A3E"; const OG_ACCENT = "#7FAF82"; const OG_STONE = "#9A948C";
const ogCache = new Map<string, Buffer>();

function ogWrap(ctx: any, text: string, maxW: number): string[] {
  const words = text.split(" "); const lines: string[] = []; let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line); return lines;
}

function ogFitText(ctx: any, text: string, maxW: number, maxH: number, maxPt = 56, minPt = 22, bold = false) {
  const weight = bold ? "bold " : "";
  for (let pt = maxPt; pt >= minPt; pt -= 2) {
    ctx.font = `italic ${weight}${pt}px Georgia, serif`;
    const lines = ogWrap(ctx, text, maxW);
    if (lines.length * pt * 1.4 <= maxH) return { pt, lines };
  }
  ctx.font = `italic ${weight}${minPt}px Georgia, serif`;
  return { pt: minPt, lines: ogWrap(ctx, text, maxW) };
}

function ogFooter(ctx: any, dark: boolean) {
  const y = OG_H - 44;
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.fillStyle = dark ? OG_ACCENT : OG_GREEN;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Deep Dive with Inverted Comma  ·  www.invertedcomma.com", OG_W / 2, y);
}

function ogGhost(ctx: any, dark: boolean) {
  ctx.save(); ctx.font = `italic bold 520px Georgia, serif`;
  ctx.fillStyle = dark ? "#FFFFFF" : "#000000"; ctx.globalAlpha = 0.04;
  ctx.textBaseline = "alphabetic"; ctx.fillText("“", 28, 520); ctx.restore();
}

function ogDivider(ctx: any, dark: boolean, y: number) {
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(OG_W - 60, y); ctx.stroke();
}

// ── Server-side social-preview meta injection ────────────────────────────────
// Crawlers (Facebook, Twitter/X, LinkedIn, Slack, WhatsApp, etc.) don't run JS,
// so the react-helmet-async tags set client-side in <SEO> are invisible to
// them — they only ever see the static index.html shell. These routes inject
// the same og:/twitter: tags server-side before sending the HTML.
const SITE_NAME_META  = "Inverted Comma";
const TWITTER_ID_META = "@invertedcomma";
const DEFAULT_DESC_META = "Curating high-contrast quotes, counterpoints & conversations — from books, films, speeches and beyond.";

function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

interface MetaTags {
  title: string;
  description?: string;
  image?: string;
  url: string;
  type?: "website" | "article";
}

function renderMetaTagsHtml({ title, description, image, url, type = "website" }: MetaTags): string {
  const desc = description || DEFAULT_DESC_META;
  const img  = image || `${SITE_URL}/api/og/default`;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME_META}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:image" content="${escapeHtml(img)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="${TWITTER_ID_META}" />`,
    `<meta name="twitter:creator" content="${TWITTER_ID_META}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img)}" />`,
  ].join("\n    ");
}

// Strips the <title> the static shell ships with and inserts our tags right
// before </head> so they win over (and don't duplicate) the static defaults.
function injectMetaTags(html: string, meta: MetaTags): string {
  const withoutTitle = html.replace(/<title>[^<]*<\/title>/, "");
  return withoutTitle.replace("</head>", `${renderMetaTagsHtml(meta)}\n  </head>`);
}

// Registers routes that serve the SPA shell with route-specific OG/Twitter
// meta tags baked in server-side, for /q/:slug, /author/:slug and /tag/:tag.
// Must be registered before the SPA's catch-all (express.static fallback /
// vite's "spa" middleware) so they take priority for these paths.
function registerSocialMetaRoutes(renderShell: (url: string) => Promise<string>) {
  app.get("/q/:slug", async (req, res, next) => {
    try {
      const all   = getEnrichedQuotes() as any[];
      const rq    = await getRuntimeQuotes("published");
      const quote = [...all, ...rq].find((q: any) => q.slug === req.params.slug);
      if (!quote) return next();
      const shortText = quote.text.length > 120 ? quote.text.slice(0, 118) + "…" : quote.text;
      const html = await renderShell(req.originalUrl);
      res.send(injectMetaTags(html, {
        title: `"${shortText}" — ${quote.author} — Deep Dive with ${SITE_NAME_META}`,
        description: quote.context || quote.text,
        image: `${SITE_URL}/api/og/quote/${quote.slug}`,
        url: `${SITE_URL}/q/${quote.slug}`,
        type: "article",
      }));
    } catch (err) { next(err); }
  });

  app.get("/author/:slug", async (req, res, next) => {
    try {
      const slug   = req.params.slug;
      const author = await getAuthorBySlug(slug);
      const all    = getEnrichedQuotes() as any[];
      const rq     = await getRuntimeQuotes("published");
      const quoteCount = [...all, ...rq].filter((q: any) =>
        (q.author || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug
      ).length;
      const name = author?.name || slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const html = await renderShell(req.originalUrl);
      res.send(injectMetaTags(html, {
        title: `${name} — Quotes — ${SITE_NAME_META}`,
        description: author?.bio || `Explore ${quoteCount} quote${quoteCount === 1 ? "" : "s"} from ${name} on Inverted Comma.`,
        image: `${SITE_URL}/api/og/author/${slug}`,
        url: `${SITE_URL}/author/${slug}`,
      }));
    } catch (err) { next(err); }
  });

  app.get("/tag/:tag", async (req, res, next) => {
    try {
      const tag = decodeURIComponent(req.params.tag);
      const html = await renderShell(req.originalUrl);
      res.send(injectMetaTags(html, {
        title: `#${tag} — ${SITE_NAME_META}`,
        description: `Browse, read and deep dive into quotes about ${tag} on Inverted Comma.`,
        image: `${SITE_URL}/api/og/tag/${encodeURIComponent(tag)}`,
        url: `${SITE_URL}/tag/${encodeURIComponent(tag)}`,
      }));
    } catch (err) { next(err); }
  });
}

function buildQuoteOg(quote: { text: string; author: string; year?: number; tags?: string[]; category?: string }): Buffer {
  if (!createCanvas) return Buffer.alloc(0);
  const canvas = createCanvas(OG_W, OG_H); const ctx = canvas.getContext("2d");
  ctx.fillStyle = OG_BG_CREAM; ctx.fillRect(0, 0, OG_W, OG_H);
  ogGhost(ctx, false);
  const tag = (quote.tags?.[0] || quote.category || "quote").toUpperCase();
  ctx.font = "bold 20px Arial, sans-serif";
  const tagW = ctx.measureText(`#${tag}`).width + 32;
  ctx.fillStyle = OG_GREEN; ctx.beginPath(); ctx.roundRect(60, 52, tagW, 36, 18); ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(`#${tag}`, 76, 70);
  const PAD = 60; const INNER = OG_W - PAD * 2;
  const rawText = quote.text.length > 200 ? quote.text.slice(0, 198) + "…" : quote.text;
  const { pt, lines } = ogFitText(ctx, `"${rawText}"`, INNER, 320);
  ctx.fillStyle = OG_GREEN; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let ty = 148 + pt;
  for (const line of lines) { ctx.fillText(line, PAD, ty); ty += pt * 1.4; }
  const authorText = `— ${quote.author.toUpperCase()}` + (quote.year ? `  ·  ${quote.year < 0 ? `${Math.abs(quote.year)} BC` : quote.year}` : "");
  ctx.font = `italic bold 24px Georgia, serif`; ctx.fillStyle = OG_GREEN; ctx.textAlign = "left";
  ctx.fillText(authorText, PAD, ty + 24);
  ogDivider(ctx, false, OG_H - 80); ogFooter(ctx, false);
  return canvas.toBuffer("image/png");
}

function buildTagOg(tag: string): Buffer {
  if (!createCanvas) return Buffer.alloc(0);
  const canvas = createCanvas(OG_W, OG_H); const ctx = canvas.getContext("2d");
  ctx.fillStyle = OG_BG_DARK; ctx.fillRect(0, 0, OG_W, OG_H);
  ctx.save(); ctx.font = "bold 480px Arial, sans-serif"; ctx.fillStyle = "#FFFFFF"; ctx.globalAlpha = 0.04;
  ctx.textBaseline = "alphabetic"; ctx.fillText("#", 36, 520); ctx.restore();
  ctx.font = "bold 16px Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("EXPLORE TAG", 60, 100);
  const displayTag = `#${tag}`; let tagFontPt = 148;
  ctx.font = `italic bold ${tagFontPt}px Georgia, serif`;
  while (ctx.measureText(displayTag).width > OG_W - 120 && tagFontPt > 60) {
    tagFontPt -= 6; ctx.font = `italic bold ${tagFontPt}px Georgia, serif`;
  }
  ctx.fillStyle = "#FFFFFF"; ctx.textBaseline = "alphabetic"; ctx.fillText(displayTag, 60, 280);
  ctx.font = "24px Arial, sans-serif"; ctx.fillStyle = OG_ACCENT; ctx.textBaseline = "alphabetic";
  ctx.fillText(`Browse, read and deep dive into quotes about ${tag.charAt(0).toUpperCase() + tag.slice(1)} →`, 60, 330);
  ogDivider(ctx, true, OG_H - 80); ogFooter(ctx, true);
  return canvas.toBuffer("image/png");
}

function buildAuthorOg(authorData: { name: string; bio?: string; knownFor?: string; nationality?: string; quoteCount?: number }): Buffer {
  if (!createCanvas) return Buffer.alloc(0);
  const canvas = createCanvas(OG_W, OG_H); const ctx = canvas.getContext("2d");
  ctx.fillStyle = OG_BG_DARK; ctx.fillRect(0, 0, OG_W, OG_H); ogGhost(ctx, true);
  ctx.font = "bold 16px Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("AUTHOR", 60, 100);
  const name = authorData.name; let namePt = 108;
  ctx.font = `italic bold ${namePt}px Georgia, serif`;
  while (ctx.measureText(name).width > OG_W - 120 && namePt > 44) {
    namePt -= 4; ctx.font = `italic bold ${namePt}px Georgia, serif`;
  }
  ctx.fillStyle = "#FFFFFF"; ctx.textBaseline = "alphabetic"; ctx.fillText(name, 60, 240);
  if (authorData.knownFor || authorData.nationality) {
    ctx.font = "26px Arial, sans-serif"; ctx.fillStyle = OG_ACCENT;
    const sub = [authorData.knownFor, authorData.nationality].filter(Boolean).join("  ·  ");
    ctx.fillText(sub, 60, 284);
  }
  if (authorData.bio) {
    const snippet = authorData.bio.slice(0, 160) + (authorData.bio.length > 160 ? "…" : "");
    ctx.font = "22px Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.55)";
    const bioLines = ogWrap(ctx, snippet, OG_W - 120); let by = 334;
    for (const l of bioLines.slice(0, 3)) { ctx.fillText(l, 60, by); by += 34; }
  }
  if (authorData.quoteCount !== undefined) {
    ctx.font = "bold 19px Arial, sans-serif"; ctx.fillStyle = OG_ACCENT;
    ctx.fillText(`${authorData.quoteCount} quotes on Inverted Comma`, 60, OG_H - 100);
  }
  ogDivider(ctx, true, OG_H - 80); ogFooter(ctx, true);
  return canvas.toBuffer("image/png");
}

function buildDefaultOg(): Buffer {
  if (!createCanvas) return Buffer.alloc(0);
  const canvas = createCanvas(OG_W, OG_H); const ctx = canvas.getContext("2d");
  ctx.fillStyle = OG_BG_CREAM; ctx.fillRect(0, 0, OG_W, OG_H);
  ctx.save(); ctx.font = `italic bold 500px Georgia, serif`; ctx.fillStyle = OG_GREEN;
  ctx.globalAlpha = 0.06; ctx.textBaseline = "alphabetic"; ctx.fillText("“", 28, 520); ctx.restore();
  ctx.font = "bold 16px Arial, sans-serif"; ctx.fillStyle = OG_GREEN;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("INVERTED COMMA", 60, 110);
  ctx.font = `italic bold 90px Georgia, serif`; ctx.fillStyle = "#1A1A1A";
  ctx.fillText("Quotes worth", 60, 250); ctx.fillText("thinking about.", 60, 356);
  ctx.font = "26px Arial, sans-serif"; ctx.fillStyle = OG_STONE;
  ctx.fillText("Books  ·  Films  ·  Speeches  ·  Art  ·  Essays", 60, 420);
  ogDivider(ctx, false, OG_H - 80); ogFooter(ctx, false);
  return canvas.toBuffer("image/png");
}

function sendOg(res: any, buf: Buffer, cacheKey: string) {
  if (!buf.length) return res.status(404).json({ error: "Canvas not available" });
  ogCache.set(cacheKey, buf);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  res.send(buf);
}

app.get("/api/og/quote/:slug", async (req, res) => {
  const cacheKey = `quote:${req.params.slug}`;
  if (ogCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(ogCache.get(cacheKey)!);
  }
  const all   = getEnrichedQuotes() as any[];
  const rq    = await getRuntimeQuotes("published");
  const quote = [...all, ...rq].find((q: any) => q.slug === req.params.slug);
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  try { sendOg(res, buildQuoteOg(quote), cacheKey); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/og/tag/:tag", (req, res) => {
  const tag = decodeURIComponent(req.params.tag);
  const cacheKey = `tag:${tag}`;
  if (ogCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(ogCache.get(cacheKey)!);
  }
  try { sendOg(res, buildTagOg(tag), cacheKey); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/og/author/:slug", async (req, res) => {
  const slug     = req.params.slug;
  const cacheKey = `author:${slug}`;
  if (ogCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(ogCache.get(cacheKey)!);
  }
  const author = await getAuthorBySlug(slug);
  const all    = getEnrichedQuotes() as any[];
  const rq     = await getRuntimeQuotes("published");
  const quoteCount = [...all, ...rq].filter((q: any) =>
    (q.author || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === slug
  ).length;
  const authorData = author
    ? { name: author.name, bio: author.bio, knownFor: author.knownFor, nationality: author.nationality, quoteCount }
    : { name: slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), quoteCount };
  try { sendOg(res, buildAuthorOg(authorData), cacheKey); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/og/default", (_req, res) => {
  const cacheKey = "default";
  if (ogCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png"); res.setHeader("Cache-Control", "public, max-age=604800");
    return res.send(ogCache.get(cacheKey)!);
  }
  try { sendOg(res, buildDefaultOg(), cacheKey); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Admin bootstrap ───────────────────────────────────────────────────────────
// Idempotent. Creates/migrates the admin from ADMIN_EMAIL/ADMIN_PASSWORD (env).
// Never resets an existing admin's password on a normal boot (so in-dashboard
// password changes stick) — except when ADMIN_PASSWORD_RESET=true (break-glass).
async function ensureAdmin() {
  if (!bcrypt) return;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn("[auth] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.");
    return;
  }

  const existing = await getUserByEmail(ADMIN_EMAIL);
  if (existing) {
    const updates: any = {};
    if (existing.role !== "admin") updates.role = "admin";
    if (ADMIN_PASSWORD_RESET) {
      updates.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
      updates.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    }
    if (Object.keys(updates).length) {
      await updateUser(existing.id, updates);
      console.log(`[auth] Admin ${ADMIN_EMAIL} ${ADMIN_PASSWORD_RESET ? "password reset" : "role ensured"}.`);
    } else {
      console.log(`[auth] Admin ${ADMIN_EMAIL} present.`);
    }
    return;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  // Migrate the legacy seeded admin (admin@invertedcomma.com) if present.
  const legacy = await getUserByEmail(LEGACY_ADMIN_EMAIL);
  if (legacy) {
    await updateUser(legacy.id, {
      email: ADMIN_EMAIL,
      passwordHash: hash,
      role: "admin",
      tokenVersion: (legacy.tokenVersion ?? 0) + 1,
    });
    console.log(`[auth] Migrated legacy admin → ${ADMIN_EMAIL}.`);
    return;
  }

  // Fresh install.
  const id = "user_admin_001";
  await createUser({
    id,
    email:        ADMIN_EMAIL,
    passwordHash: hash,
    displayName:  "Admin",
    handle:       "ic_admin",
    avatar:       "https://ui-avatars.com/api/?name=Admin&background=3D5A3E&color=fff&size=100",
    interests:    [],
    role:         "admin",
  });
  console.log(`[auth] Created admin ${ADMIN_EMAIL}.`);
}

// ── Crash safety net ──────────────────────────────────────────────────────────
// Express 4 doesn't catch rejections from async route handlers, so a single
// failed DB query would otherwise take the whole process down. Log loudly and
// stay alive — one bad request must never kill the server for everyone.
process.on("unhandledRejection", (reason: any) => {
  console.error("[unhandledRejection]", reason?.message || reason);
});

// ── Server startup ────────────────────────────────────────────────────────────
async function startServer() {
  // Connect to database + apply idempotent migrations. In production this must
  // succeed; in dev we tolerate an unreachable DB so the SPA and code-backed
  // endpoints (e.g. seed quotes) still serve for frontend work without Neon.
  try {
    await testConnection();
    await runMigrations();
    // Ensure the admin account from env (ADMIN_EMAIL / ADMIN_PASSWORD).
    await ensureAdmin();
    // Load the admin-set AI provider/keys (overrides env defaults).
    await loadAIConfig();
  } catch (err: any) {
    if (IS_PROD) throw err;
    console.warn(`[db] Unavailable — starting in DB-less dev mode. DB-backed routes will fail. (${err?.message})`);
  }

  let renderShell: (url: string) => Promise<string>;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    renderShell = async (url) => {
      const raw = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");
      return vite.transformIndexHtml(url, raw);
    };
    // Routes below are registered first so they win over vite's SPA fallback.
    registerSocialMetaRoutes(renderShell);
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const shellHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
    renderShell = async () => shellHtml;
    registerSocialMetaRoutes(renderShell);
    // index: false — let the catch-all below inject meta tags into "/" too,
    // instead of express.static serving dist/index.html as-is.
    app.use(express.static(distPath, { index: false }));
    app.get("*", async (req, res) => {
      const html = await renderShell(req.originalUrl);
      res.send(injectMetaTags(html, {
        title: `${SITE_NAME_META} — Curated Quotes & Dialectics`,
        url: `${SITE_URL}${req.path}`,
      }));
    });
  }

  // ── Global error handler — must be last ──────────────────────────────────
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status  = err.status || err.statusCode || 500;
    const message = IS_PROD ? "Internal server error" : (err.message || "Unknown error");
    console.error(`[error] ${req.method} ${req.path} →`, err.message);
    res.status(status).json({ error: message });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[invertedcomma] server running on http://localhost:${PORT}`);
  });
}

startServer();
