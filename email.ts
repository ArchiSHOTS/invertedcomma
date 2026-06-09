/**
 * email.ts — transactional email via Resend.
 * Degrades gracefully: if RESEND_API_KEY is unset, sends are skipped (logged)
 * so signup/login still work without email configured.
 */
import dotenv from "dotenv";
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Inverted Comma <hello@invertedcomma.com>";
const SITE_URL = process.env.SITE_URL || "https://www.invertedcomma.com";

let resend: any = null;
if (RESEND_API_KEY) {
  try {
    const { Resend } = await import("resend");
    resend = new Resend(RESEND_API_KEY);
    console.log("[email] Resend configured ✓");
  } catch {
    console.warn("[email] resend package not available — emails disabled");
  }
} else {
  console.warn("[email] RESEND_API_KEY not set — transactional emails disabled");
}

export function emailEnabled() {
  return !!resend;
}

/** Low-level send. Never throws — logs and returns false on failure. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!resend) {
    console.log(`[email] (skipped — no provider) → ${opts.to}: ${opts.subject}`);
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) { console.warn("[email] send error:", error); return false; }
    return true;
  } catch (err: any) {
    console.warn("[email] send threw:", err.message);
    return false;
  }
}

// ── Branded layout ────────────────────────────────────────────────────────────
const GREEN = "#3D5A3E";
const DARK = "#0F1F10";
const CREAM = "#FBF9F6";

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
        <tr><td style="background:${DARK};padding:24px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">INVERTED&nbsp;COMMA</span>
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #f0eeec;">
          <p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.6;">
            Quotes worth thinking about.<br>
            <a href="${SITE_URL}" style="color:${GREEN};text-decoration:none;">invertedcomma.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:999px;">${label}</a>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<boolean> {
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">Confirm your email</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#44403c;">
      Hi ${escapeHtml(name)}, welcome to Inverted Comma. Please confirm this email address to unlock everything — saving quotes, joining discussions and the weekly note.
    </p>
    <p style="margin:0 0 24px;">${button(verifyUrl, "Verify my email")}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#a8a29e;">
      If the button doesn't work, paste this link into your browser:<br>
      <a href="${verifyUrl}" style="color:${GREEN};word-break:break-all;">${verifyUrl}</a><br><br>
      This link expires in 24 hours. If you didn't create an account, you can ignore this email.
    </p>
  `);
  return sendEmail({ to, subject: "Confirm your email — Inverted Comma", html });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">Welcome, ${escapeHtml(name)} 👋</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#44403c;">
      You're in. Inverted Comma is a home for quotes worth thinking about — drawn from books, films, speeches, art and essays, each with context, sources and a thoughtful counterpoint.
    </p>
    <p style="margin:0 0 24px;">${button(SITE_URL + "/explore", "Start exploring")}</p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#44403c;">
      A few things to try:<br>
      • <strong>Save</strong> quotes that resonate to your collection<br>
      • <strong>Deep dive</strong> into the meaning and history behind a quote<br>
      • <strong>Share</strong> a beautifully designed quote card
    </p>
  `);
  return sendEmail({ to, subject: "Welcome to Inverted Comma", html });
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
