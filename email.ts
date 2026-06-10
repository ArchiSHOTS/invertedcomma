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

const SOCIALS = [
  { name: "instagram", url: "https://instagram.com/invertedcommahq" },
  { name: "x",         url: "https://x.com/invertedcommahq" },
  { name: "pinterest", url: "https://pinterest.com/invertedcommahq" },
];

function socialRow(): string {
  return SOCIALS.map(s =>
    `<a href="${s.url}" style="text-decoration:none;display:inline-block;margin:0 4px;">` +
    `<img src="${SITE_URL}/email/${s.name}.png" width="30" height="30" alt="${s.name}" style="display:inline-block;border:0;border-radius:50%;"></a>`
  ).join("");
}

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
        <tr><td align="center" style="background:${GREEN};padding:26px 32px;">
          <img src="${SITE_URL}/email/logo-white.png" height="34" alt="Inverted Comma"
               style="display:block;height:34px;width:auto;border:0;">
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding:24px 32px;border-top:1px solid #f0eeec;">
          <p style="margin:0 0 12px;">${socialRow()}</p>
          <p style="margin:0;color:#a8a29e;font-size:12px;line-height:1.7;">
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

export interface WelcomeQuote {
  text: string;
  author: string;
  context?: string;
  tag?: string;     // the interest this was matched on (if any)
  url: string;      // deep-dive link
}

export function welcomeEmailHtml(name: string, quote?: WelcomeQuote | null): string {
  const quoteBlock = quote ? `
    <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${GREEN};">
      ${quote.tag ? `A quote on ${escapeHtml(quote.tag)}, for you` : "A quote to begin with"}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border:1px solid #ece9e4;border-radius:14px;margin:0 0 20px;">
      <tr><td style="padding:22px 22px 18px;">
        <p style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.5;color:#1c1917;">
          &ldquo;${escapeHtml(quote.text)}&rdquo;
        </p>
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#57534e;">
          — ${escapeHtml(quote.author)}
        </p>
        ${quote.context ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#78716c;">${escapeHtml(quote.context)}</p>` : ""}
      </td></tr>
    </table>
    <p style="margin:0 0 26px;">${button(quote.url, "Deep dive into this quote →")}</p>
  ` : `
    <p style="margin:0 0 24px;">${button(SITE_URL + "/explore", "Start exploring")}</p>
  `;

  return layout(`
    <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;">Welcome, ${escapeHtml(name)} 👋</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#44403c;">
      You're in — your email is verified. Here's a thought to start with.
    </p>
    ${quoteBlock}
    <p style="margin:0;font-size:14px;line-height:1.7;color:#78716c;">
      Save quotes that resonate, follow the deep dives, and share beautifully designed cards. Glad to have you.
    </p>
  `);
}

export async function sendWelcomeEmail(to: string, name: string, quote?: WelcomeQuote | null): Promise<boolean> {
  return sendEmail({ to, subject: "Welcome to Inverted Comma", html: welcomeEmailHtml(name, quote) });
}

export function subscriberWelcomeEmailHtml(name: string, unsubscribeUrl: string): string {
  const greeting = name ? escapeHtml(name) : "Commarade";
  return layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">You're on the list, ${greeting} 👋</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#44403c;">
      Thanks for subscribing to the Inverted Comma newsletter — one thoughtful quote,
      with context and a deep dive, every week.
    </p>
    <p style="margin:0 0 24px;">${button(SITE_URL + "/explore", "Start exploring")}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#a8a29e;">
      Didn't sign up for this, or it was someone else? No hard feelings —
      <a href="${unsubscribeUrl}" style="color:${GREEN};">unsubscribe here</a> any time.
    </p>
  `);
}

export async function sendSubscriberWelcomeEmail(to: string, name: string, unsubscribeUrl: string): Promise<boolean> {
  return sendEmail({ to, subject: "You're subscribed — Inverted Comma", html: subscriberWelcomeEmailHtml(name, unsubscribeUrl) });
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
