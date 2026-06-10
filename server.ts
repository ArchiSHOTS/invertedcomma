import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
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
  getRuntimeQuotes, getRuntimeQuoteBySlug, createRuntimeQuote,
  updateRuntimeQuote, deleteRuntimeQuote, bulkSetRuntimeQuoteStatus,
  getComments, createComment, likeComment, deleteComment, getAllComments,
  addSubscriber, getAllSubscribers, setSubscriberStatus,
  getInsight, setInsight,
  toggleQuoteLike,
} from "./db.ts";
import { sendVerificationEmail, sendWelcomeEmail, sendSubscriberWelcomeEmail, type WelcomeQuote } from "./email.ts";
import { importWikiquote, importStatus } from "./wikiquote.ts";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const IS_PROD = process.env.NODE_ENV === "production";

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

// ── Gemini AI ─────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({ apiKey });
  console.log(`[Gemini] API key loaded (${apiKey.slice(0, 8)}…${apiKey.slice(-4)})`);
} else {
  console.warn("[Gemini] No GEMINI_API_KEY found in environment — AI features disabled.");
}

const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];

async function generateWithFallback(
  contents: string,
  config: Record<string, any> = {}
): Promise<any> {
  if (!aiClient) throw new Error("No AI client");
  let lastErr: any;
  for (const model of MODELS) {
    try {
      const res = await aiClient.models.generateContent({ model, contents, config });
      if (MODELS.indexOf(model) > 0) console.log(`[Gemini] Used fallback model: ${model}`);
      return res;
    } catch (err: any) {
      const status = JSON.parse(err.message || "{}").error?.code;
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
  if (!aiClient) return null;
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
  if (!aiClient) return null;
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

function slugify(text: string, author: string): string {
  return `${text.slice(0, 40)} ${author}`.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim() + "-" + Math.random().toString(36).slice(2, 6);
}

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
  const dbRQ = await getRuntimeQuotes("published");
  res.json({ quotes: [...getEnrichedQuotes(), ...dbRQ] });
});

app.get("/api/tags", (req, res) => {
  const quotes = getEnrichedQuotes();
  const tagCounts: Record<string, number> = {};
  quotes.forEach((q) => q.tags.forEach((tag) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }));
  AVAILABLE_TAGS.forEach((tag) => { if (!tagCounts[tag]) tagCounts[tag] = 0; });
  res.json({ tags: Object.entries(tagCounts).map(([name, count]) => ({ name, count })) });
});

app.get("/api/quotes/:slugOrId", async (req, res) => {
  const { slugOrId } = req.params;
  const seed  = getEnrichedQuotes();
  const seedQ = seed.find((q) => q.slug === slugOrId || q.id === slugOrId);
  if (seedQ) return res.json({ quote: seedQ });
  const rq = await getRuntimeQuoteBySlug(slugOrId);
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
      year:       q.year ? Number(q.year) : null,
      category:   q.category || "Uncategorized",
      context:    q.context || "",
      tags:       Array.isArray(q.suggestedTags) ? q.suggestedTags : [],
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
  const maxPerAuthor = Math.min(Math.max(Number(req.body?.max) || 60, 5), 120);
  // Fire and forget — the admin UI polls /status. Don't await (it takes ~1 min).
  importWikiquote({ maxPerAuthor }).catch(e => console.error("[wikiquote] import failed:", e?.message));
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
});

async function bulkSetStatus(req: any, res: any, newStatus: string) {
  const parsed = BulkSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  const { ids, status, sourceType } = parsed.data;
  if ((!ids || ids.length === 0) && !status && !sourceType) {
    return res.status(400).json({ error: "Provide ids[] or a status/sourceType filter" });
  }
  const updated = await bulkSetRuntimeQuoteStatus(newStatus, {
    ids, whereStatus: status, whereSourceType: sourceType,
  });
  res.json({ updated });
}

app.post("/api/admin/quotes/bulk/approve", adminMiddleware, (req, res) => bulkSetStatus(req, res, "published"));
app.post("/api/admin/quotes/bulk/reject",  adminMiddleware, (req, res) => bulkSetStatus(req, res, "rejected"));

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
  const users     = await getAllUsers();
  const subs      = await getAllSubscribers();
  const pending   = rq.filter(q => q.status === "pending").length;
  const published = allSeed.length + rq.filter(q => q.status === "published").length;
  res.json({
    totalQuotes:      published,
    pendingQuotes:    pending,
    totalUsers:       users.length,
    totalSubscribers: subs.length,
    admins:           users.filter(u => u.role === "admin").length,
    moderators:       users.filter(u => u.role === "moderator").length,
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

  if (!aiClient) {
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
    } catch {
      response = await generateWithFallback(prompt, { temperature: 0.7 });
    }

    const aiCounterpoint = response.text?.trim() || "No counterpoint could be generated. Try again.";
    const data = { aiCounterpoint, sources };
    await setInsight(`cp:${quoteId}`, data);
    res.json(data);
  } catch (err: any) {
    console.error("[Gemini] Counterpoint error:", err.message);
    res.status(500).json({ error: "Failed to generate counterpoint: " + err.message });
  }
});

// ── Admin: YouTube extraction ─────────────────────────────────────────────────

app.post("/api/admin/extract-youtube", adminMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "YouTube URL required" });
  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: "Could not parse YouTube video ID from URL" });
  if (!aiClient) return res.status(503).json({ error: "AI client not configured. Set GEMINI_API_KEY in .env" });

  try {
    const prompt = `You are a quote extraction expert. Analyze the YouTube video at https://www.youtube.com/watch?v=${videoId}

Extract the most insightful, thought-provoking, or memorable quotes. For each quote provide the exact text, speaker name, approximate start/end timestamps (seconds), brief context, and 2-4 relevant topic tags.

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
    const raw      = response.text?.trim() || "[]";
    const jsonStr  = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const extracted = JSON.parse(jsonStr);
    if (!Array.isArray(extracted)) return res.status(500).json({ error: "AI returned unexpected format" });

    res.json({
      ok: true, videoId,
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
  const { text, source } = req.body;
  if (!text || text.trim().length < 50) return res.status(400).json({ error: "Paste at least 50 characters of text" });
  if (!aiClient) return res.status(503).json({ error: "AI client not configured. Set GEMINI_API_KEY in .env" });

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
    "author": "Speaker/Author",
    "category": "Category Name",
    "context": "Brief context",
    "suggestedTags": ["tag1", "tag2"],
    "source": "${source || "Pasted text"}"
  }
]

Extract 3-15 quotes. Return ONLY the JSON array.`;

    const response  = await generateWithFallback(prompt, { temperature: 0.2, responseMimeType: "application/json" });
    const raw       = response.text?.trim() || "[]";
    const jsonStr   = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const extracted = JSON.parse(jsonStr);
    if (!Array.isArray(extracted)) return res.status(500).json({ error: "AI returned unexpected format" });
    res.json({ ok: true, quotes: extracted, count: extracted.length });
  } catch (error: any) {
    console.error("Text extraction error:", error);
    res.status(500).json({ error: "Extraction failed: " + error.message });
  }
});

// ── Debug ─────────────────────────────────────────────────────────────────────
app.get("/api/debug/ai", async (_req, res) => {
  if (!aiClient) return res.json({ ok: false, reason: "No GEMINI_API_KEY in environment" });
  try {
    const r = await generateWithFallback("Say 'Gemini is working' in exactly 4 words.", { temperature: 0 });
    res.json({ ok: true, response: r.text?.trim() });
  } catch (err: any) {
    res.json({ ok: false, reason: err.message });
  }
});

// ── Quote Insights ────────────────────────────────────────────────────────────
app.get("/api/quotes/:quoteId/insights", async (req, res) => {
  const { quoteId } = req.params;
  const allSeed     = getEnrichedQuotes();
  const runtimeQ    = await getRuntimeQuoteBySlug(quoteId);
  const quote       = allSeed.find((q: any) => q.id === quoteId) ?? runtimeQ;
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  // Runtime quote: return inline enrichment if available
  if (runtimeQ?.enrichment) return res.json(runtimeQ.enrichment);

  // DB insights cache
  const cached = await getInsight(quoteId);
  if (cached) return res.json(cached);

  if (!aiClient) {
    return res.json({ authorBio: null, quoteMeaning: null, historicalContext: null, relatedWorks: [], webReferences: [] });
  }

  try {
    const enrichment = await enrichQuoteWithAI(quote);
    if (!enrichment) {
      return res.json({ authorBio: null, quoteMeaning: null, historicalContext: null, relatedWorks: [], webReferences: [] });
    }
    if (runtimeQ) {
      await updateRuntimeQuote(quoteId, { enrichment });
    } else {
      await setInsight(quoteId, enrichment);
    }
    res.json(enrichment);
  } catch (err: any) {
    console.error("[Gemini] Insights error:", err.message);
    res.status(500).json({ error: err.message });
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
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  let x = 60;
  for (const ch of "INVERTED COMMA") { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + 2.5; }
  ctx.font = "17px Arial, sans-serif";
  ctx.fillStyle = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
  ctx.textAlign = "right";
  ctx.fillText("www.invertedcomma.com", OG_W - 60, y);
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
  ctx.font = "bold 13px Arial, sans-serif"; ctx.fillStyle = OG_STONE;
  ctx.textAlign = "right"; ctx.fillText("DEEP DIVE", OG_W - 60, 70);
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

// ── Server startup ────────────────────────────────────────────────────────────
async function startServer() {
  // Connect to database + apply idempotent migrations
  await testConnection();
  await runMigrations();

  // Ensure the admin account from env (ADMIN_EMAIL / ADMIN_PASSWORD).
  await ensureAdmin();

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
