import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Check, Twitter, Instagram, Linkedin, Youtube } from "lucide-react";
import Logo from "./Logo";

const SOCIALS = [
  { Icon: Twitter,   label: "X / Twitter", href: "https://twitter.com/invertedcomma" },
  { Icon: Instagram, label: "Instagram",   href: "https://instagram.com/invertedcomma" },
  { Icon: Linkedin,  label: "LinkedIn",    href: "https://linkedin.com/company/invertedcomma" },
  { Icon: Youtube,   label: "YouTube",     href: "https://youtube.com/@invertedcomma" },
];

export default function SiteFooter() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("done");
    }
  };

  return (
    <footer className="bg-[#0F1F10] text-white">

      {/* ── Top band: Logo · tagline · newsletter ─────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 pt-14 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 items-start">

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
              <form onSubmit={handleSubscribe} className="flex gap-2 max-w-md">
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
                  disabled={status === "loading"}
                  className="flex items-center gap-1.5 bg-white text-[#0F1F10] rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-emerald-50 transition-colors disabled:opacity-60 flex-shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  {status === "loading" ? "…" : "Subscribe"}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="border-t border-white/10" />

      {/* ── Bottom 3-column grid ──────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 grid grid-cols-1 sm:grid-cols-3 gap-10">

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
          <div className="flex flex-col gap-3 text-sm text-stone-400">
            <a href="#explore"  className="hover:text-white transition-colors">Explore quotes</a>
            <Link to="/about"   className="hover:text-white transition-colors">About</Link>
            <Link to="/terms"   className="hover:text-white transition-colors">Terms of use</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy policy</Link>
          </div>
        </div>

        {/* Col 3 — Legal */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-stone-500 mb-4">
            Legal
          </p>
          <div className="space-y-3 text-xs text-stone-500 leading-relaxed">
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
