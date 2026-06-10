import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Check, Instagram } from "lucide-react";
import Logo from "./Logo";
import { useTurnstile } from "./TurnstileWidget";

// X (Twitter) — lucide's Twitter glyph is the old bird; use the current X mark.
const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

// Pinterest — not in lucide; brand glyph.
const PinterestIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345c-.091.378-.293 1.194-.333 1.361-.052.22-.174.266-.401.16-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
  </svg>
);

const SOCIALS = [
  { Icon: Instagram,     label: "Instagram", href: "https://instagram.com/invertedcommahq" },
  { Icon: XIcon,         label: "X",         href: "https://x.com/invertedcommahq" },
  { Icon: PinterestIcon, label: "Pinterest", href: "https://pinterest.com/invertedcommahq" },
];

export default function SiteFooter() {
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError]   = useState("");
  const turnstile = useTurnstile();

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, source: "footer", turnstileToken: turnstile.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Something went wrong. Please try again.");
        turnstile.reset();
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
      turnstile.reset();
    }
  };

  return (
    <footer className="bg-[#0F1F10] text-white">

      {/* ── Top band: Logo · tagline · newsletter ─────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-8 md:pt-14 md:pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7 md:gap-8 items-start">

          {/* Logo + tagline */}
          <div>
            <Link to="/" className="inline-block hover:opacity-70 transition-opacity">
              <Logo size={48} light />
            </Link>
            <p className="text-stone-400 text-xs leading-relaxed mt-3 max-w-[14rem]">
              Curating high-contrast quotes, counterpoints &amp; conversations.
            </p>
          </div>

          {/* Newsletter — spans 2 cols on desktop so it feels generous */}
          <div className="md:col-span-2 md:border-l md:border-white/10 md:pl-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400/70 mb-1.5">
              Newsletter — free forever
            </p>
            <h3 className="font-serif italic text-2xl md:text-3xl text-white mb-1 leading-tight">
              Stay inspired.
            </h3>
            <p className="text-stone-400 text-sm leading-relaxed mb-5">
              One thoughtful quote every week. Unsubscribe anytime.
            </p>

            {status === "done" ? (
              <div className="flex items-center gap-2.5 text-emerald-400 text-sm font-medium">
                <span className="w-6 h-6 rounded-full bg-emerald-400/20 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </span>
                You're in! Check your inbox.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="max-w-md">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Commarade (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20 transition-colors"
                  />
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/20 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading" || (turnstile.enabled && !turnstile.token)}
                    className="flex items-center justify-center gap-1.5 bg-white text-[#0F1F10] rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-emerald-50 transition-colors disabled:opacity-60 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {status === "loading" ? "…" : "Subscribe"}
                  </button>
                </div>
                <turnstile.Widget />
                {error && <p className="text-rose-400 text-xs mt-2">{error}</p>}
              </form>
            )}
          </div>

        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="border-t border-white/10" />

      {/* ── Bottom grid — compact on mobile: [Social | Navigate] then Legal ─ */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-7 md:py-10 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7 sm:gap-10">

        {/* Col 1 — Social: icon-only row */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500 mb-4">
            Follow us
          </p>
          <div className="flex items-center gap-3">
            {SOCIALS.map(({ Icon, label, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-stone-400 hover:text-white transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
              </a>
            ))}
          </div>
        </div>

        {/* Col 2 — Navigation (no admin link) */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500 mb-4">
            Navigate
          </p>
          <div className="flex flex-col gap-2.5 text-sm text-stone-400">
            <a href="#explore"  className="hover:text-white transition-colors">Explore quotes</a>
            {/* TODO: add <Link to="/participate">Participate</Link> here (future phase) */}
            <Link to="/about"   className="hover:text-white transition-colors">About</Link>
            <Link to="/terms"   className="hover:text-white transition-colors">Terms of use</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy policy</Link>
          </div>
        </div>

        {/* Col 3 — Legal (full-width row beneath the link columns on mobile) */}
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500 mb-4">
            Legal
          </p>
          <div className="space-y-2 text-xs text-stone-500 leading-relaxed">
            <p>
              Some links on this site are affiliate links. We may earn a small
              commission at no extra cost to you.
            </p>
            <p>
              This site contains advertising. Sponsored content is clearly
              labelled.
            </p>
            <p className="pt-2 border-t border-white/10">
              © {new Date().getFullYear()} Inverted Comma.
              <br />All rights reserved.
            </p>
          </div>
        </div>

      </div>
    </footer>
  );
}
