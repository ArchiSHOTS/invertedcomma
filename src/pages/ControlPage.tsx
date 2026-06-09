import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Quote as QuoteIcon, Tag, Users, Mail, Bot,
  MessageSquare, ShieldCheck, LogOut, Eye, EyeOff,
  Plus, Trash2, CheckCircle, XCircle, Youtube, FileText,
  Upload, Sparkles, RefreshCw, ExternalLink, Edit2, Save,
  X, ChevronDown, Menu, AlertCircle, BookOpen, Film, Mic2,
  Feather, Newspaper, Hash, Search, BarChart2, Link2,
  Crown, Shield, DollarSign, Megaphone, ShoppingBag, GripVertical,
  ToggleLeft, ToggleRight, Copy, ImageIcon, MapPin, Globe,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import Logo from "../components/Logo";
import { Quote, ExtractedQuote, Subscriber, SourceType } from "../types";

const TOKEN_KEY = "ic_token";

const getToken = () => localStorage.getItem(TOKEN_KEY) ?? "";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

// ── Login screen ──────────────────────────────────────────────────────────────
function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // Verify role from server
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (!data.user || (data.user.role !== "admin" && data.user.role !== "moderator")) {
        localStorage.removeItem(TOKEN_KEY);
        setError("Access denied. This dashboard requires admin or moderator privileges.");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1F10] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-5">
            <Logo size={40} light />
          </div>
          <p className="text-emerald-400/70 text-[10px] font-mono uppercase tracking-[0.25em]">Control Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
              placeholder="you@example.com"
              className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/40 focus:bg-white/10 focus:ring-2 focus:ring-emerald-400/15 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-white/[0.07] border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-emerald-400/40 focus:bg-white/10 focus:ring-2 focus:ring-emerald-400/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-[#3D5A3E] text-white font-bold text-sm rounded-xl hover:bg-[#34502f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in to Dashboard"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link to="/" className="text-white/30 text-xs hover:text-white/60 transition-colors">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Change-password modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update password");
      // Server bumped token_version and returned a fresh token for this session.
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
      setStatus("done");
    } catch (err: any) {
      setError(err.message || "Could not update password");
      setStatus("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-serif italic font-bold text-xl text-stone-800">Change password</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X className="w-4 h-4" /></button>
        </div>

        {status === "done" ? (
          <div className="mt-4 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm text-stone-600 mb-5">Your password has been updated. Other signed-in sessions have been logged out.</p>
            <button onClick={onClose} className="w-full h-10 rounded-full bg-[#3D5A3E] text-white text-sm font-semibold hover:bg-[#34502f] transition-colors">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 mt-4">
            <p className="text-xs text-stone-400 mb-2">Use a strong, unique password of at least 8 characters.</p>
            <input
              type={showPw ? "text" : "password"} value={current} onChange={e => setCurrent(e.target.value)}
              autoFocus placeholder="Current password" autoComplete="current-password"
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50"
            />
            <input
              type={showPw ? "text" : "password"} value={next} onChange={e => setNext(e.target.value)}
              placeholder="New password" autoComplete="new-password"
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50"
            />
            <input
              type={showPw ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirm new password" autoComplete="new-password"
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50"
            />
            <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer select-none">
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} className="rounded" />
              Show passwords
            </label>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={status === "loading"}
              className="w-full h-10 rounded-full bg-[#3D5A3E] text-white text-sm font-semibold hover:bg-[#34502f] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {status === "loading" && <RefreshCw className="w-4 h-4 animate-spin" />}
              {status === "loading" ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, Icon, color = "bg-white" }: {
  label: string; value: string | number; sub?: string;
  Icon: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-stone-900">{value}</p>
        <p className="text-xs font-medium text-stone-500 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-stone-400 font-mono mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState<any>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    fetch("/api/admin/stats", { headers: authHeaders() })
      .then(r => r.json()).then(setStats).catch(console.error);
    fetch("/api/quotes")
      .then(r => r.json()).then(d => setQuotes(d.quotes || [])).catch(console.error);
  }, []);

  const categoryCounts = quotes.reduce((acc: Record<string, number>, q) => {
    acc[q.category] = (acc[q.category] || 0) + 1;
    return acc;
  }, {});

  const topCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-stone-900 mb-1">Overview</h2>
        <p className="text-sm text-stone-500">Live snapshot of your content and community.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Quotes" value={stats?.totalQuotes ?? quotes.length} Icon={QuoteIcon} color="bg-stone-100 text-stone-700" />
        <StatCard label="Pending Review" value={stats?.pendingQuotes ?? 0} sub="awaiting moderation" Icon={AlertCircle} color="bg-amber-100 text-amber-700" />
        <StatCard label="Registered Users" value={stats?.totalUsers ?? 0} Icon={Users} color="bg-blue-100 text-blue-700" />
        <StatCard label="Newsletter Subs" value={stats?.totalSubscribers ?? 0} Icon={Mail} color="bg-green-100 text-green-700" />
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h3 className="text-sm font-bold text-stone-800 mb-4">Quotes by Category</h3>
        <div className="space-y-3">
          {topCategories.map(([cat, count]) => {
            const pct = Math.round(((count as number) / quotes.length) * 100);
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-stone-600 font-medium truncate">{cat}</span>
                  <span className="text-stone-400 font-mono ml-2">{count as number} · {pct}%</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-800 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role summary */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h3 className="text-sm font-bold text-stone-800 mb-4">Team</h3>
        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-stone-900">{stats?.admins ?? 0}</p>
            <p className="text-xs text-stone-500 mt-1">Admins</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-stone-900">{stats?.moderators ?? 0}</p>
            <p className="text-xs text-stone-500 mt-1">Moderators</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-stone-900">{(stats?.totalUsers ?? 0) - (stats?.admins ?? 0) - (stats?.moderators ?? 0)}</p>
            <p className="text-xs text-stone-500 mt-1">Members</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared pill badge ─────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  if (!status || status === "published") return <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Published</span>;
  if (status === "pending") return <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>;
  return <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Rejected</span>;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  book: "Book", movie: "Movie", speech: "Speech", essay: "Essay",
  poem: "Poem", article: "Article", interview: "Interview", tweet: "Tweet",
  wikiquote: "Wikiquote", unknown: "Unknown",
};

// ── Source type config ────────────────────────────────────────────────────────
const SOURCE_TYPE_CONFIG: Record<string, {
  label: string;
  Icon: React.ElementType;
  fields: { key: string; label: string; placeholder: string; type?: string; hint?: string }[];
}> = {
  book: {
    label: "Book", Icon: BookOpen,
    fields: [
      { key: "sourceName", label: "Book title", placeholder: "e.g. Man's Search for Meaning" },
      { key: "sourceAuthor", label: "Book author", placeholder: "e.g. Viktor Frankl", hint: "If different from quote author" },
      { key: "sourceUrl", label: "Buy / read link", placeholder: "https://bookshop.org/…", hint: "Bookshop.org, Amazon, Goodreads, etc." },
    ],
  },
  movie: {
    label: "Movie / Film", Icon: Film,
    fields: [
      { key: "sourceName", label: "Film title", placeholder: "e.g. The Shawshank Redemption" },
      { key: "sourceDirector", label: "Director", placeholder: "e.g. Frank Darabont", hint: "Optional" },
      { key: "sourceUrl", label: "IMDb / streaming link", placeholder: "https://imdb.com/title/…", hint: "Optional" },
    ],
  },
  speech: {
    label: "Speech / Address", Icon: Mic2,
    fields: [
      { key: "sourceName", label: "Speech / occasion title", placeholder: "e.g. Stanford Commencement Address 2005" },
      { key: "sourceLocation", label: "Location / event", placeholder: "e.g. Stanford University, California", hint: "Optional" },
      { key: "sourceUrl", label: "Recording or transcript link", placeholder: "https://…", hint: "Optional" },
    ],
  },
  essay: {
    label: "Essay", Icon: FileText,
    fields: [
      { key: "sourceName", label: "Essay title", placeholder: "e.g. Self-Reliance" },
      { key: "sourcePublication", label: "Publication / collection", placeholder: "e.g. Essays: First Series", hint: "Optional" },
      { key: "sourceUrl", label: "Read online link", placeholder: "https://…", hint: "Optional" },
    ],
  },
  article: {
    label: "Article", Icon: Newspaper,
    fields: [
      { key: "sourceName", label: "Article title", placeholder: "e.g. The Hedgehog and the Fox" },
      { key: "sourcePublication", label: "Publication / outlet", placeholder: "e.g. Wired Magazine", hint: "Optional" },
      { key: "sourceUrl", label: "Article URL", placeholder: "https://…", hint: "Optional — direct link to article" },
    ],
  },
  poem: {
    label: "Poem", Icon: Feather,
    fields: [
      { key: "sourceName", label: "Poem title", placeholder: "e.g. The Road Not Taken" },
      { key: "sourceCollection", label: "Collection / anthology", placeholder: "e.g. Mountain Interval, 1916", hint: "Optional" },
      { key: "sourceUrl", label: "Read online link", placeholder: "https://…", hint: "Optional" },
    ],
  },
  interview: {
    label: "Interview", Icon: MessageSquare,
    fields: [
      { key: "sourceName", label: "Interview title / context", placeholder: "e.g. Rolling Stone, 1969" },
      { key: "sourcePublication", label: "Publication / show", placeholder: "e.g. Rolling Stone Magazine", hint: "Optional" },
      { key: "sourceUrl", label: "Interview link", placeholder: "https://…", hint: "Optional" },
    ],
  },
  tweet: {
    label: "Social / Tweet", Icon: Hash,
    fields: [
      { key: "sourceName", label: "Platform / thread title", placeholder: "e.g. Twitter / Naval's thread on wealth" },
      { key: "sourceUrl", label: "Link to post", placeholder: "https://twitter.com/…", hint: "Optional" },
    ],
  },
  unknown: {
    label: "Unknown / Other", Icon: Sparkles,
    fields: [
      { key: "sourceName", label: "Source description", placeholder: "e.g. Traditional proverb", hint: "Optional" },
    ],
  },
};

const CATEGORIES = [
  "Philosophy & Stoicism", "Design & Architecture", "Creativity & Art",
  "Business & Entrepreneurship", "Literature & Writing", "Science & Technology",
  "Psychology & Mind", "History & Politics", "Motivation & Success", "Leadership",
  "Nature & Environment", "Mathematics & Logic", "Music & Culture",
  "Education & Knowledge", "Sports & Discipline", "Love & Relationships",
  "Society & Change", "Economics & Wealth", "Health & Well-being",
  "Innovation & Future", "Minimalism & Focus", "Truth & Language", "Humour & Paradox",
];

// ── Add Quote Form ────────────────────────────────────────────────────────────
function AddQuoteForm({ onSaved, onCancel }: { onSaved: (q: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    text: "",
    author: "",
    year: "",
    category: "",
    context: "",
    tags: "",
    sourceType: "book" as SourceType,
    // Dynamic source fields
    sourceName: "",
    sourceAuthor: "",
    sourceDirector: "",
    sourceLocation: "",
    sourcePublication: "",
    sourceCollection: "",
    sourceUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Existing sources for autocomplete
  const [knownSources, setKnownSources] = useState<string[]>([]);
  const sourceNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/quotes")
      .then(r => r.json())
      .then(d => {
        const names = Array.from(new Set(
          (d.quotes || []).map((q: any) => q.source).filter(Boolean)
        )) as string[];
        setKnownSources(names);
      });
  }, []);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const config = SOURCE_TYPE_CONFIG[form.sourceType] ?? SOURCE_TYPE_CONFIG.book;
  const SourceIcon = config.Icon;

  // Build a "source" string for the quote from the form data
  const buildSourceString = () => {
    if (!form.sourceName.trim()) return "";
    const parts = [form.sourceName.trim()];
    if (form.sourceType === "book" && form.sourceAuthor?.trim()) parts.push(`by ${form.sourceAuthor.trim()}`);
    if (form.sourceType === "movie" && form.sourceDirector?.trim()) parts.push(`dir. ${form.sourceDirector.trim()}`);
    return parts.join(", ");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.text.trim() || !form.author.trim() || !form.category) {
      setError("Quote text, author, and category are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/quotes", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          text: form.text.trim(),
          author: form.author.trim(),
          source: buildSourceString(),
          sourceUrl: form.sourceUrl.trim() || undefined,
          year: form.year ? parseInt(form.year) : undefined,
          category: form.category,
          context: form.context.trim(),
          tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
          sourceType: form.sourceType,
          status: "published",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save quote.");
        return;
      }
      const data = await res.json();
      onSaved(data.quote);
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-stone-50 border border-stone-200 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-800">Add quote manually</h3>
        <button type="button" onClick={onCancel} className="w-7 h-7 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:bg-stone-100">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quote text */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Quote *</label>
        <textarea
          rows={3}
          placeholder="Type or paste the quote here…"
          value={form.text}
          onChange={e => set("text", e.target.value)}
          required
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-none placeholder-stone-300"
        />
      </div>

      {/* Author + Year */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Author *</label>
          <input
            placeholder="e.g. Zaha Hadid"
            value={form.author}
            onChange={e => set("author", e.target.value)}
            required
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Year</label>
          <input
            placeholder="e.g. 2004 or -400"
            value={form.year}
            onChange={e => set("year", e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
        </div>
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Category *</label>
        <select
          value={form.category}
          onChange={e => set("category", e.target.value)}
          required
          className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 text-stone-700"
        >
          <option value="">Select a category…</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* ── Source section ── */}
      <div className="border border-stone-200 rounded-2xl bg-white overflow-hidden">
        {/* Source type selector */}
        <div className="p-4 border-b border-stone-100">
          <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider block mb-3">Source type</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SOURCE_TYPE_CONFIG).map(([key, { label, Icon }]) => (
              <button
                key={key}
                type="button"
                onClick={() => { set("sourceType", key); set("sourceName", ""); }}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-all ${
                  form.sourceType === key
                    ? "bg-stone-900 text-white border-stone-900"
                    : "border-stone-200 text-stone-500 hover:border-stone-400"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic source fields */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <SourceIcon className="w-4 h-4 text-stone-400" />
            <span className="text-xs font-semibold text-stone-600">{config.label} details</span>
          </div>

          {config.fields.map(field => (
            <div key={field.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-stone-500">{field.label}</label>
                {field.hint && <span className="text-[10px] text-stone-400 italic">{field.hint}</span>}
              </div>
              {field.key === "sourceName" ? (
                <>
                  <input
                    ref={sourceNameRef}
                    list={`source-suggestions-${form.sourceType}`}
                    placeholder={field.placeholder}
                    value={form.sourceName}
                    onChange={e => set("sourceName", e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                  />
                  <datalist id={`source-suggestions-${form.sourceType}`}>
                    {knownSources.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {knownSources.length > 0 && (
                    <p className="text-[10px] text-stone-400">
                      Type to search {knownSources.length} existing source{knownSources.length !== 1 ? "s" : ""}, or enter a new one
                    </p>
                  )}
                </>
              ) : field.key === "sourceUrl" ? (
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-300 pointer-events-none" />
                  <input
                    type="url"
                    placeholder={field.placeholder}
                    value={(form as any)[field.key] || ""}
                    onChange={e => set(field.key, e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                  />
                </div>
              ) : (
                <input
                  placeholder={field.placeholder}
                  value={(form as any)[field.key] || ""}
                  onChange={e => set(field.key, e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Context */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Context</label>
        <textarea
          rows={2}
          placeholder="Background, significance, or story behind the quote…"
          value={form.context}
          onChange={e => set("context", e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-none"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider">Tags</label>
        <input
          placeholder="philosophy, architecture, creativity (comma-separated)"
          value={form.tags}
          onChange={e => set("tags", e.target.value)}
          className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10"
        />
        <p className="text-[10px] text-stone-400">Separate tags with commas. Lowercase, no spaces.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Preview */}
      {form.text && form.author && (
        <div className="bg-stone-100 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Preview</p>
          <p className="font-serif italic text-stone-700 text-sm leading-relaxed">"{form.text}"</p>
          <p className="text-xs font-bold text-stone-600">— {form.author}{form.year ? `, ${form.year}` : ""}</p>
          {(form.sourceName || buildSourceString()) && (
            <p className="text-[11px] text-stone-400 italic">{buildSourceString() || form.sourceName}</p>
          )}
          {form.category && (
            <p className="text-[10px] text-stone-400">Category: {form.category}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 h-10 px-6 bg-stone-900 text-white text-sm font-bold rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Publish quote"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-4 border border-stone-200 text-sm text-stone-600 rounded-xl hover:bg-stone-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Reusable pagination ───────────────────────────────────────────────────────
function Pagination({ page, perPage, total, onPage }: {
  page: number; perPage: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const btn = "h-8 px-3 rounded-full text-xs font-medium border border-stone-200 text-stone-600 hover:border-stone-400 disabled:opacity-40 disabled:hover:border-stone-200 transition-colors";
  return (
    <div className="flex items-center justify-center gap-3 pt-5">
      <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span className="text-xs text-stone-500">
        Page {page} of {pages} · {total.toLocaleString()} items
      </span>
      <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  );
}

/** Page state that resets to 1 whenever a dependency (search/filter) changes. */
function usePaged(deps: any[], perPage = 25) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  return { page, setPage, perPage, from: (page - 1) * perPage, to: page * perPage };
}

// ── Quotes tab ────────────────────────────────────────────────────────────────
function QuotesTab() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "pending" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [addMode, setAddMode] = useState<null | "manual" | "youtube" | "paste">(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Add forms
  const [ytUrl, setYtUrl] = useState("");
  const [ytExtracting, setYtExtracting] = useState(false);
  const [extractedQuotes, setExtractedQuotes] = useState<ExtractedQuote[]>([]);
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set());
  const [pasteText, setPasteText] = useState("");
  const [pasteExtracting, setPasteExtracting] = useState(false);
  const [pasteExtracted, setPasteExtracted] = useState<any[]>([]);

  // Wikiquote import progress (polled while running)
  const [wqImport, setWqImport] = useState<null | {
    running: boolean; imported: number; authorsDone: number; authorsTotal: number; error: string | null;
  }>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    // Merge the public list (seed + published) with the admin list (ALL runtime
    // quotes incl. pending/rejected) so the moderation queue is visible.
    Promise.all([
      fetch("/api/quotes").then(r => r.json()).catch(() => ({ quotes: [] })),
      fetch("/api/admin/quotes", { headers: authHeaders() }).then(r => r.json()).catch(() => ({ quotes: [] })),
    ]).then(([pub, adm]) => {
      const map = new Map<string, Quote>();
      (pub.quotes || []).forEach((q: Quote) => map.set(q.id, { ...q, status: (q.status || "published") as Quote["status"] }));
      (adm.quotes || []).forEach((q: Quote) => map.set(q.id, q)); // admin row wins (true status)
      setQuotes([...map.values()]);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = quotes.filter(q => {
    const matchStatus = statusFilter === "all" || (q.status || "published") === statusFilter;
    const term = search.toLowerCase();
    const matchSearch = !term ||
      q.text.toLowerCase().includes(term) ||
      q.author.toLowerCase().includes(term) ||
      (q.source || "").toLowerCase().includes(term) ||
      q.category.toLowerCase().includes(term);
    return matchStatus && matchSearch;
  });
  const paged = usePaged([search, statusFilter]);


  const pollImport = useCallback(() => {
    const tick = async () => {
      const r = await fetch("/api/admin/import-wikiquote/status", { headers: authHeaders() });
      const s = await r.json();
      setWqImport(s);
      if (s.running) setTimeout(tick, 2000);
      else load();   // refresh the list when the import finishes
    };
    tick();
  }, [load]);

  const startWikiquoteImport = async () => {
    if (!confirm("Import ~2,000 attributed quotes from Wikiquote? They'll arrive as 'pending' for your review.")) return;
    setWqImport({ running: true, imported: 0, authorsDone: 0, authorsTotal: 44, error: null });
    const res = await fetch("/api/admin/import-wikiquote", {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ max: 60 }),
    });
    if (res.status === 409) { const d = await res.json(); setWqImport(d.status); }
    pollImport();
  };

  const handleApprove = async (id: string) => {
    await fetch(`/api/admin/quotes/${id}/approve`, { method: "POST", headers: authHeaders() });
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: "published" } : q));
  };

  const handleReject = async (id: string) => {
    await fetch(`/api/admin/quotes/${id}/reject`, { method: "POST", headers: authHeaders() });
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: "rejected" } : q));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this quote permanently?")) return;
    const res = await fetch(`/api/admin/quotes/${id}`, { method: "DELETE", headers: authHeaders() });
    if (res.ok) setQuotes(prev => prev.filter(q => q.id !== id));
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkApproving(true);
    try {
      await fetch("/api/admin/quotes/bulk/approve", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ ids: [...selected] }),
      });
      setQuotes(prev => prev.map(q => selected.has(q.id) ? { ...q, status: "published" } : q));
      setSelected(new Set());
    } finally { setBulkApproving(false); }
  };

  const bulkReject = async () => {
    if (selected.size === 0) return;
    setBulkRejecting(true);
    try {
      await fetch("/api/admin/quotes/bulk/reject", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ ids: [...selected] }),
      });
      setQuotes(prev => prev.map(q => selected.has(q.id) ? { ...q, status: "rejected" } : q));
      setSelected(new Set());
    } finally { setBulkRejecting(false); }
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const toggleSelectAll = () => {
    if (selected.size === displayed.length) setSelected(new Set());
    else setSelected(new Set(displayed.map(q => q.id)));
  };

  const startEdit = (q: Quote) => {
    setEditingId(q.id);
    setEditForm({ text: q.text, author: q.author, source: q.source || "", sourceUrl: (q as any).sourceUrl || "", year: q.year?.toString() || "", category: q.category, context: q.context || "", tags: q.tags.join(", "), sourceType: q.sourceType || "book" });
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/admin/quotes/${id}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ ...editForm, year: editForm.year ? parseInt(editForm.year) : undefined, tags: editForm.tags.split(",").map((t: string) => t.trim()).filter(Boolean) }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, ...data.quote } : q));
      setEditingId(null);
    }
  };

  const handleYouTubeExtract = async () => {
    setYtExtracting(true);
    setExtractedQuotes([]);
    try {
      const res = await fetch("/api/admin/extract-youtube", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ url: ytUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedQuotes(data.quotes || []);
        setSelectedExtracted(new Set(data.quotes.map((_: any, i: number) => i)));
      }
    } finally { setYtExtracting(false); }
  };

  const handleSaveExtracted = async () => {
    const toSave = extractedQuotes.filter((_, i) => selectedExtracted.has(i));
    const res = await fetch("/api/admin/quotes/bulk", {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ quotes: toSave }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuotes(prev => [...data.quotes, ...prev]);
      setExtractedQuotes([]); setYtUrl(""); setAddMode(null);
    }
  };

  const handlePasteExtract = async () => {
    setPasteExtracting(true);
    try {
      const res = await fetch("/api/admin/extract-text", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ text: pasteText }),
      });
      if (res.ok) { const data = await res.json(); setPasteExtracted(data.quotes || []); }
    } finally { setPasteExtracting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Quotes</h2>
          <p className="text-xs text-stone-500 mt-0.5">{quotes.length} total · {quotes.filter(q => q.status === "pending").length} pending</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["manual", "youtube", "paste"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAddMode(addMode === mode ? null : mode)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all border ${
                addMode === mode ? "bg-stone-900 text-white border-stone-900" : "border-stone-300 text-stone-600 hover:border-stone-400"
              }`}
            >
              {mode === "youtube" ? <Youtube className="w-3 h-3" /> : mode === "paste" ? <FileText className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {{ manual: "Manual", youtube: "YouTube", paste: "Paste text" }[mode]}
            </button>
          ))}
          <button
            onClick={startWikiquoteImport}
            disabled={!!wqImport?.running}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {wqImport?.running ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Wikiquote
          </button>
        </div>
      </div>

      {/* Import progress */}
      {wqImport && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${wqImport.error ? "bg-red-50 border-red-200 text-red-700" : wqImport.running ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
          {wqImport.error
            ? `Import failed: ${wqImport.error}`
            : wqImport.running
              ? `Importing from Wikiquote… ${wqImport.imported} quotes added (${wqImport.authorsDone}/${wqImport.authorsTotal} authors). You can keep working — this runs in the background.`
              : `Import complete — ${wqImport.imported} pending quotes added. Review them in the Pending tab below.`}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search quotes, authors…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
          />
        </div>
        <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1">
          {(["all", "published", "pending", "rejected"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                statusFilter === s ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── Manual add form ── */}
      {addMode === "manual" && (
        <AddQuoteForm
          onSaved={(q) => {
            setQuotes(prev => [q, ...prev]);
            setAddMode(null);
            // Brief toast to set expectations about deep dive timing
            const toast = document.createElement("div");
            toast.textContent = "Quote published. AI deep dive is being prepared in the background.";
            toast.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1c1c;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4500);
          }}
          onCancel={() => setAddMode(null)}
        />
      )}

      {/* ── YouTube extract ── */}
      {addMode === "youtube" && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Extract from YouTube</h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
              <input type="url" placeholder="https://www.youtube.com/watch?v=…" value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 bg-white" />
            </div>
            <button onClick={handleYouTubeExtract} disabled={ytExtracting || !ytUrl.trim()}
              className="h-10 px-4 bg-stone-900 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-2">
              {ytExtracting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {ytExtracting ? "Extracting…" : "Extract"}
            </button>
          </div>
          {extractedQuotes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold">{extractedQuotes.length} quotes found</p>
                <div className="flex gap-3 text-[10px] text-stone-500">
                  <button onClick={() => setSelectedExtracted(new Set(extractedQuotes.map((_, i) => i)))} className="hover:text-stone-800">Select all</button>
                  <button onClick={() => setSelectedExtracted(new Set())} className="hover:text-stone-800">None</button>
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {extractedQuotes.map((eq, i) => (
                  <label key={i} className={`flex gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${selectedExtracted.has(i) ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}>
                    <input type="checkbox" checked={selectedExtracted.has(i)}
                      onChange={() => setSelectedExtracted(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                      className="mt-0.5 accent-stone-900 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-serif italic text-sm leading-snug">"{eq.text}"</p>
                      <p className="text-[10px] font-bold text-stone-500">— {eq.speaker} · {Math.floor(eq.startSeconds / 60)}:{String(eq.startSeconds % 60).padStart(2, "0")}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveExtracted} disabled={selectedExtracted.size === 0}
                  className="h-9 px-5 bg-stone-900 text-white text-xs font-bold rounded-xl disabled:opacity-40">
                  Add {selectedExtracted.size} selected
                </button>
                <button onClick={() => { setExtractedQuotes([]); setYtUrl(""); setAddMode(null); }}
                  className="h-9 px-4 border border-stone-200 text-xs text-stone-600 rounded-xl">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Paste text extract ── */}
      {addMode === "paste" && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Extract from article / text</h3>
          <textarea rows={8} placeholder="Paste article, speech transcript, book excerpt…" value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-y font-mono bg-white" />
          <div className="flex gap-2">
            <button onClick={handlePasteExtract} disabled={pasteExtracting || !pasteText.trim()}
              className="h-9 px-5 bg-stone-900 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-2">
              {pasteExtracting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {pasteExtracting ? "Extracting…" : "Extract"}
            </button>
            <button onClick={() => setAddMode(null)} className="h-9 px-4 border border-stone-200 text-xs text-stone-600 rounded-xl">Cancel</button>
          </div>
          {pasteExtracted.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto border border-stone-200 rounded-xl p-3 bg-white">
              {pasteExtracted.map((eq, i) => (
                <div key={i} className="p-3 bg-stone-50 rounded-xl space-y-1">
                  <p className="font-serif italic text-sm">"{eq.text}"</p>
                  <p className="text-xs font-bold text-stone-500">— {eq.author || eq.speaker}</p>
                </div>
              ))}
              <button onClick={async () => {
                await fetch("/api/admin/quotes/bulk", { method: "POST", headers: authHeaders(), body: JSON.stringify({ quotes: pasteExtracted }) });
                load(); setPasteExtracted([]); setPasteText(""); setAddMode(null);
              }} className="w-full h-9 bg-stone-900 text-white text-xs font-bold rounded-xl mt-2">
                Add all {pasteExtracted.length} quotes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="sticky top-20 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-emerald-900">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={bulkApprove} disabled={bulkApproving}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" /> {bulkApproving ? "Approving…" : `Approve (${selected.size})`}
            </button>
            <button
              onClick={bulkReject} disabled={bulkRejecting}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" /> {bulkRejecting ? "Rejecting…" : `Reject (${selected.size})`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 bg-stone-200 text-stone-600 text-xs font-semibold rounded-lg hover:bg-stone-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Quote list */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-stone-400" /></div>
      ) : (
        <div className="space-y-2">
          {displayed.length === 0 && (
            <p className="text-sm text-stone-400 text-center italic py-10">No quotes match your filters.</p>
          )}
          {/* Select all checkbox */}
          {displayed.length > 0 && (
            <div className="px-4 py-2 flex items-center gap-2">
              <input type="checkbox" checked={selected.size > 0 && selected.size === displayed.length}
                onChange={toggleSelectAll} className="w-4 h-4 cursor-pointer" />
              <label className="text-xs text-stone-500 cursor-pointer">Select all ({displayed.length} on this page)</label>
            </div>
          )}
          {displayed.slice(paged.from, paged.to).map(q =>
            editingId === q.id ? (
              <div key={q.id} className="bg-stone-50 border border-stone-300 rounded-2xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Editing quote</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <textarea rows={3} value={editForm.text} onChange={e => setEditForm((p: any) => ({ ...p, text: e.target.value }))}
                    className="sm:col-span-2 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.author} onChange={e => setEditForm((p: any) => ({ ...p, author: e.target.value }))} placeholder="Author"
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.source} onChange={e => setEditForm((p: any) => ({ ...p, source: e.target.value }))} placeholder="Source title"
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.sourceUrl} onChange={e => setEditForm((p: any) => ({ ...p, sourceUrl: e.target.value }))} placeholder="Source URL (https://…)"
                    className="sm:col-span-2 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.year} onChange={e => setEditForm((p: any) => ({ ...p, year: e.target.value }))} placeholder="Year"
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.category} onChange={e => setEditForm((p: any) => ({ ...p, category: e.target.value }))} placeholder="Category"
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <select value={editForm.sourceType} onChange={e => setEditForm((p: any) => ({ ...p, sourceType: e.target.value }))}
                    className="border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 text-stone-700">
                    {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <textarea rows={2} value={editForm.context} onChange={e => setEditForm((p: any) => ({ ...p, context: e.target.value }))} placeholder="Context (background, significance…)"
                    className="sm:col-span-2 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                  <input value={editForm.tags} onChange={e => setEditForm((p: any) => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma-separated)"
                    className="sm:col-span-2 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(q.id)} className="h-8 px-4 bg-stone-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5">
                    <Save className="w-3 h-3" /> Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="h-8 px-4 border border-stone-200 text-xs text-stone-600 rounded-xl">Cancel</button>
                </div>
              </div>
            ) : (
              <div key={q.id} className={`flex items-start gap-3 p-4 bg-white border rounded-2xl transition-colors ${selected.has(q.id) ? "border-emerald-400 bg-emerald-50/30" : q.status === "pending" ? "border-amber-200 bg-amber-50/30" : "border-stone-200"}`}>
                <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} className="w-4 h-4 mt-1 flex-shrink-0 cursor-pointer" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-serif italic text-sm text-stone-800 line-clamp-2">"{q.text}"</p>
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-bold text-stone-600">— {q.author}</span>
                    <span className="bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full font-medium">{q.category}</span>
                    {q.sourceType && q.sourceType !== "unknown" && (
                      <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{SOURCE_TYPE_LABELS[q.sourceType] || q.sourceType}</span>
                    )}
                    <StatusBadge status={q.status} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a href={`/q/${q.slug}`} target="_blank" rel="noopener noreferrer"
                    className="w-7 h-7 border border-stone-200 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-50" title="View">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button onClick={() => startEdit(q)} className="w-7 h-7 border border-stone-200 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-50" title="Edit">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {q.status === "pending" && (
                    <>
                      <button onClick={() => handleApprove(q.id)} className="w-7 h-7 border border-emerald-300 rounded-full flex items-center justify-center text-emerald-600 hover:bg-emerald-50" title="Approve">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleReject(q.id)} className="w-7 h-7 border border-red-200 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50" title="Reject">
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(q.id)} className="w-7 h-7 border border-red-100 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 hover:border-red-300 transition-colors" title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          )}
          <Pagination page={paged.page} perPage={paged.perPage} total={displayed.length} onPage={paged.setPage} />
        </div>
      )}
    </div>
  );
}

// ── Sources tab ───────────────────────────────────────────────────────────────
function SourcesTab() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [activeType, setActiveType] = useState<string>("all");

  useEffect(() => {
    fetch("/api/quotes").then(r => r.json()).then(d => setQuotes(d.quotes || []));
  }, []);

  const TYPES = [
    { key: "all", label: "All", Icon: BarChart2 },
    { key: "book", label: "Books", Icon: BookOpen },
    { key: "movie", label: "Movies", Icon: Film },
    { key: "speech", label: "Speeches", Icon: Mic2 },
    { key: "essay", label: "Essays", Icon: FileText },
    { key: "poem", label: "Poems", Icon: Feather },
    { key: "article", label: "Articles", Icon: Newspaper },
    { key: "interview", label: "Interviews", Icon: MessageSquare },
  ];

  const typeCounts = quotes.reduce((acc: Record<string, number>, q) => {
    const t = q.sourceType || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const filtered = activeType === "all" ? quotes : quotes.filter(q => (q.sourceType || "unknown") === activeType);

  // Group by source title
  const bySource: Record<string, Quote[]> = {};
  filtered.forEach(q => {
    const key = q.source || "(no source listed)";
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(q);
  });
  const sortedSources = Object.entries(bySource).sort(([, a], [, b]) => b.length - a.length);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Sources</h2>
        <p className="text-xs text-stone-500 mt-0.5">Browse your quote library organised by source type</p>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map(({ key, label, Icon }) => {
          const count = key === "all" ? quotes.length : (typeCounts[key] || 0);
          return (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-all ${
                activeType === key ? "bg-stone-900 text-white border-stone-900" : "border-stone-200 text-stone-600 hover:border-stone-400"
              }`}
            >
              <Icon className="w-3 h-3" />
              {label}
              <span className={`font-mono text-[10px] ${activeType === key ? "text-white/60" : "text-stone-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Source groups */}
      <div className="space-y-3">
        {sortedSources.length === 0 ? (
          <p className="text-sm text-stone-400 italic text-center py-10">No quotes for this source type.</p>
        ) : (
          sortedSources.map(([source, sourceQuotes]) => (
            <details key={source} className="group bg-white border border-stone-200 rounded-2xl overflow-hidden">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-stone-800 text-sm">{source}</span>
                  <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{sourceQuotes.length}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-stone-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="border-t border-stone-100 divide-y divide-stone-100">
                {sourceQuotes.map(q => (
                  <div key={q.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-serif italic text-sm text-stone-700 line-clamp-2">"{q.text}"</p>
                      <p className="text-[10px] text-stone-400 mt-1">— {q.author}{q.year ? ` · ${q.year < 0 ? `${Math.abs(q.year)} BC` : q.year}` : ""}</p>
                    </div>
                    <a href={`/q/${q.slug}`} target="_blank" rel="noopener noreferrer"
                      className="w-6 h-6 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:text-stone-700 flex-shrink-0">
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tags tab ──────────────────────────────────────────────────────────────────
function TagsTab() {
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [newTag, setNewTag] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/tags").then(r => r.json()).then(d => setTags(d.tags || []));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const res = await fetch("/api/admin/tags", {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ name: newTag.trim().toLowerCase().replace(/\s+/g, "-") }),
    });
    if (res.ok) {
      setTags(prev => [...prev, { name: newTag.trim(), count: 0 }]);
      setNewTag("");
    }
  };

  const handleDelete = async (name: string) => {
    await fetch(`/api/admin/tags/${encodeURIComponent(name)}`, { method: "DELETE", headers: authHeaders() });
    setTags(prev => prev.filter(t => t.name !== name));
  };

  const sorted = [...tags].sort((a, b) => b.count - a.count)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Tags</h2>
        <p className="text-xs text-stone-500 mt-0.5">{tags.length} tags · sorted by usage</p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-mono">#</span>
          <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="new-tag-name"
            className="w-full pl-7 pr-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
        </div>
        <button type="submit" className="h-10 px-5 bg-stone-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 hover:bg-stone-800">
          <Plus className="w-3.5 h-3.5" /> Add tag
        </button>
      </form>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tags…"
          className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
      </div>

      <div className="flex flex-wrap gap-2">
        {sorted.map(({ name, count }) => (
          <div key={name} className="group flex items-center gap-2 bg-white border border-stone-200 rounded-full px-3 py-1.5 hover:border-stone-400 transition-colors">
            <span className="text-xs text-stone-700 font-medium">#{name}</span>
            <span className="text-[10px] font-mono text-stone-400">{count}</span>
            <button onClick={() => handleDelete(name)}
              className="w-3.5 h-3.5 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab({ currentRole }: { currentRole: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "moderator" | "user">("all");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<any | null>(null);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/users", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (userId: string, role: string) => {
    setChangingRole(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: data.user.role } : u));
      } else {
        const err = await res.json();
        alert(err.error || "Could not update role");
      }
    } finally { setChangingRole(null); }
  };

  // Open an explicit in-app confirmation (no native confirm(), which some
  // browsers suppress — that silently aborted deletes before).
  const openDelete = (u: any) => { setDeleteError(""); setPendingDelete(u); };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteState("deleting");
    setDeleteError("");
    try {
      const res = await fetch(`/api/admin/users/${pendingDelete.id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) throw new Error("Your admin session expired — sign out and back in, then retry.");
        throw new Error(err.error || `Delete failed (HTTP ${res.status})`);
      }
      setPendingDelete(null);
      load(); // re-fetch the authoritative list from the server
    } catch (e: any) {
      setDeleteError(e.message || "Could not delete user");
    } finally {
      setDeleteState("idle");
    }
  };

  const filtered = users.filter(u => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const term = search.toLowerCase();
    const matchSearch = !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.handle.toLowerCase().includes(term);
    return matchRole && matchSearch;
  });
  const paged = usePaged([search, roleFilter]);

  const roleBadge = (role: string) => {
    if (role === "admin") return <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full"><Crown className="w-2.5 h-2.5" />Admin</span>;
    if (role === "moderator") return <span className="flex items-center gap-1 text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full"><Shield className="w-2.5 h-2.5" />Mod</span>;
    return <span className="text-[10px] font-bold bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">Member</span>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Users</h2>
        <p className="text-xs text-stone-500 mt-0.5">{users.length} registered accounts</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, handle…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
        </div>
        <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1">
          {(["all", "admin", "moderator", "user"] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${roleFilter === r ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-stone-400" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-sm text-stone-400 italic text-center py-10">No users found.</p>}
          {filtered.slice(paged.from, paged.to).map(u => (
            <div key={u.id} className="flex items-center gap-4 p-4 bg-white border border-stone-200 rounded-2xl">
              <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-stone-200" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-stone-800 truncate">{u.name}</p>
                  {roleBadge(u.role)}
                </div>
                <p className="text-[11px] text-stone-400 truncate">@{u.handle} · {u.email}</p>
                <p className="text-[10px] text-stone-400 font-mono">Joined {new Date(u.joinedAt).toLocaleDateString()}</p>
              </div>

              {/* Role change — admin only */}
              {currentRole === "admin" && (
                <select
                  value={u.role}
                  onChange={e => handleRoleChange(u.id, e.target.value)}
                  disabled={changingRole === u.id}
                  className="text-xs border border-stone-200 rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 text-stone-700 disabled:opacity-50"
                >
                  <option value="user">Member</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              )}

              {currentRole === "admin" && (
                <button onClick={() => openDelete(u)}
                  className="w-7 h-7 border border-red-100 rounded-full flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors flex-shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <Pagination page={paged.page} perPage={paged.perPage} total={filtered.length} onPage={paged.setPage} />
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => deleteState !== "deleting" && setPendingDelete(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-red-50 mb-3">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="font-bold text-lg text-stone-900 mb-1">Delete this account?</h2>
            <p className="text-sm text-stone-500 mb-1">
              This permanently removes <span className="font-semibold text-stone-700">{pendingDelete.email}</span>.
            </p>
            <p className="text-xs text-stone-400 mb-5">They will no longer be able to sign in. This cannot be undone.</p>

            {deleteError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setPendingDelete(null)} disabled={deleteState === "deleting"}
                className="flex-1 h-10 rounded-full border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteState === "deleting"}
                className="flex-1 h-10 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteState === "deleting" && <RefreshCw className="w-4 h-4 animate-spin" />}
                {deleteState === "deleting" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Discussions tab ───────────────────────────────────────────────────────────
function DiscussionsTab() {
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    fetch("/api/admin/discussions", { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setDiscussions(d.discussions || []));
  }, []);

  const loadComments = async (quoteId: string) => {
    if (activeQuote === quoteId) { setActiveQuote(null); return; }
    setActiveQuote(quoteId);
    setLoadingComments(true);
    const r = await fetch(`/api/discussions/${quoteId}`);
    const d = await r.json();
    setComments(d.comments || []);
    setLoadingComments(false);
  };

  const deleteComment = async (quoteId: string, commentId: string) => {
    const res = await fetch(`/api/admin/discussions/${quoteId}/comments/${commentId}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== commentId));
      setDiscussions(prev => prev.map(d => d.quoteId === quoteId ? { ...d, commentCount: d.commentCount - 1 } : d));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Discussions</h2>
        <p className="text-xs text-stone-500 mt-0.5">Moderate comments across all quote pages</p>
      </div>

      {discussions.length === 0 ? (
        <div className="text-center py-16 bg-white border border-stone-200 rounded-2xl">
          <MessageSquare className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-400 text-sm italic">No discussions yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {discussions.map(d => (
            <div key={d.quoteId} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => loadComments(d.quoteId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-stone-700 font-mono">#{d.quoteId}</span>
                  <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{d.commentCount} comments</span>
                  {d.hasAiCounterpoint && <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">AI counterpoint</span>}
                </div>
                <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeQuote === d.quoteId ? "rotate-180" : ""}`} />
              </button>

              {activeQuote === d.quoteId && (
                <div className="border-t border-stone-100 px-5 py-3 space-y-2">
                  {loadingComments ? (
                    <div className="flex justify-center py-4"><RefreshCw className="w-4 h-4 animate-spin text-stone-400" /></div>
                  ) : comments.length === 0 ? (
                    <p className="text-xs text-stone-400 italic py-2">No comments yet.</p>
                  ) : (
                    comments.map(c => (
                      <div key={c.id} className="flex items-start gap-3 py-2">
                        <img src={c.avatar} alt={c.username} className="w-7 h-7 rounded-full object-cover flex-shrink-0 bg-stone-200" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-stone-700">{c.username}</span>
                            <span className="text-[10px] text-stone-400">{c.createdAt}</span>
                            {c.isCounterpoint && <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 rounded-full">counterpoint</span>}
                          </div>
                          <p className="text-xs text-stone-600 leading-relaxed">{c.text}</p>
                        </div>
                        <button
                          onClick={() => deleteComment(d.quoteId, c.id)}
                          className="w-6 h-6 rounded-full border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                          title="Delete comment"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Subscribers tab ───────────────────────────────────────────────────────────
function SubscribersTab() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/subscribers", { headers: authHeaders() })
      .then(r => r.json()).then(d => setSubs(d.subscribers || []));
  }, []);

  const handleExport = () => {
    const csv = ["email,source,date", ...subs.map(s => `${s.email},${s.source},${s.subscribedAt}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ic_subscribers.csv"; a.click();
  };

  const filtered = subs.filter(s => !search || s.email.toLowerCase().includes(search.toLowerCase()));
  const paged = usePaged([search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Subscribers</h2>
          <p className="text-xs text-stone-500 mt-0.5">{subs.length} newsletter subscribers</p>
        </div>
        {subs.length > 0 && (
          <button onClick={handleExport} className="flex items-center gap-1.5 h-8 px-3 border border-stone-300 text-xs text-stone-600 rounded-full hover:bg-stone-50 transition-colors">
            <Upload className="w-3 h-3" /> Export CSV
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by email…"
          className="w-full pl-9 pr-4 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10" />
      </div>

      {subs.length === 0 ? (
        <div className="text-center py-16 bg-white border border-stone-200 rounded-2xl">
          <Mail className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-400 text-sm italic">No subscribers yet.</p>
          <p className="text-stone-400 text-xs mt-1">The newsletter form on quote pages will populate this list.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 font-bold text-stone-500 uppercase tracking-wider text-[10px]">Email</th>
                <th className="text-left px-5 py-3 font-bold text-stone-500 uppercase tracking-wider text-[10px]">Source</th>
                <th className="text-left px-5 py-3 font-bold text-stone-500 uppercase tracking-wider text-[10px]">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.slice(paged.from, paged.to).map(s => (
                <tr key={s.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-stone-700">{s.email}</td>
                  <td className="px-5 py-3 text-stone-500 capitalize">{s.source}</td>
                  <td className="px-5 py-3 text-stone-400 font-mono">{new Date(s.subscribedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.page} perPage={paged.perPage} total={filtered.length} onPage={paged.setPage} />
        </div>
      )}
    </div>
  );
}

// ── AI tab ────────────────────────────────────────────────────────────────────
function AITab() {
  const models = [
    { name: "Gemini 2.5 Flash", provider: "Google", inputCost: "$0.075/1M", outputCost: "$0.30/1M", freeTier: "1,500 req/day", status: "active" },
    { name: "GPT-4o Mini", provider: "OpenAI", inputCost: "$0.15/1M", outputCost: "$0.60/1M", freeTier: "None", status: "available" },
    { name: "Claude Haiku 3.5", provider: "Anthropic", inputCost: "$0.80/1M", outputCost: "$4.00/1M", freeTier: "None", status: "available" },
    { name: "Llama 3.1 8B (Groq)", provider: "Groq", inputCost: "~$0.05/1M", outputCost: "~$0.08/1M", freeTier: "Rate-limited", status: "available" },
  ];
  const useCases = [
    { task: "AI Counterpoint", model: "Gemini 2.5 Flash", tokens: "~400/req", cost: "~$0.03 per 1k uses" },
    { task: "YouTube Extraction", model: "Gemini 2.5 Flash", tokens: "~2,000/req", cost: "~$0.15 per 100 videos" },
    { task: "Text/Article Extraction", model: "Gemini 2.5 Flash", tokens: "~1,500/req", cost: "~$0.11 per 100 articles" },
    { task: "Author Insights", model: "Gemini 2.5 Flash", tokens: "~800/req", cost: "~$0.06 per 1k quotes" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-stone-900">AI Management</h2>
        <p className="text-xs text-stone-500 mt-0.5">Model configuration, cost estimates, and feature toggles</p>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Free-tier cost estimate</p>
        <p className="text-sm text-emerald-700">At 10,000 active users/month with Gemini 2.5 Flash free tier: <strong>~$0 in AI costs</strong> up to 1,500 requests/day. Beyond that: ~$1–5/month at typical usage.</p>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Active model</p>
        <div className="space-y-2">
          {models.map(m => (
            <div key={m.name} className={`flex flex-wrap items-center gap-4 p-4 border rounded-2xl ${m.status === "active" ? "border-stone-900 bg-stone-50" : "border-stone-200 bg-white"}`}>
              <div className="flex items-center gap-2 min-w-[160px]">
                {m.status === "active" && <span className="w-2 h-2 bg-emerald-500 rounded-full" />}
                <div>
                  <p className="text-sm font-bold text-stone-800">{m.name}</p>
                  <p className="text-[10px] text-stone-400">{m.provider}</p>
                </div>
              </div>
              <div className="flex gap-4 text-[10px] font-mono text-stone-500 flex-wrap">
                <span>In: {m.inputCost}</span>
                <span>Out: {m.outputCost}</span>
                <span className="text-emerald-600">Free: {m.freeTier}</span>
              </div>
              <span className={`ml-auto text-[9px] font-bold uppercase px-2 py-1 rounded-full ${m.status === "active" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"}`}>
                {m.status === "active" ? "● Active" : "Available"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Cost by feature</p>
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                {["Feature", "Model", "Avg tokens", "Est. cost"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-bold text-stone-400 uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {useCases.map(uc => (
                <tr key={uc.task} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-medium text-stone-700">{uc.task}</td>
                  <td className="px-4 py-3 text-stone-500">{uc.model}</td>
                  <td className="px-4 py-3 font-mono text-stone-400">{uc.tokens}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-600">{uc.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5">
        <p className="text-sm font-bold text-stone-800 mb-1">To switch AI provider</p>
        <p className="text-xs text-stone-500">In <code className="bg-white border border-stone-200 px-1.5 py-0.5 rounded text-stone-700">server.ts</code>, replace the Gemini client initialisation. All API endpoints are provider-agnostic.</p>
      </div>
    </div>
  );
}

// ── Authors tab ───────────────────────────────────────────────────────────────
function AuthorsTab() {
  const [authors, setAuthors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function getToken() { return localStorage.getItem("ic_token") ?? ""; }
  function authHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }; }

  useEffect(() => {
    fetch("/api/authors", { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { authors: [] })
      .then(d => { setAuthors(d.authors || []); setLoading(false); });
  }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/author/${editing.slug}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(editing) });
    setAuthors(prev => prev.map(a => a.slug === editing.slug ? { ...a, ...editing } : a));
    setEditing(null);
    setSaving(false);
  };

  const regenerate = async (slug: string) => {
    setRegenerating(slug);
    await fetch(`/api/author/${slug}/regenerate`, { method: "POST", headers: authHeaders() });
    setTimeout(() => {
      fetch(`/api/author/${slug}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.author) setAuthors(prev => prev.map(a => a.slug === slug ? { ...a, ...d.author } : a));
          setRegenerating(null);
        });
    }, 5000);
  };

  const filtered = authors.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));
  const paged = usePaged([search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Authors</h2>
          <p className="text-xs text-stone-400 mt-0.5">Manage author profiles. Bios are AI-generated and manually editable.</p>
        </div>
        <span className="text-xs text-stone-400 font-mono">{authors.length} authors</span>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search authors…"
        className="w-full max-w-sm border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900/10 mb-6"
      />

      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-stone-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(paged.from, paged.to).map(author => (
            <div key={author.slug} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-start gap-4">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl bg-stone-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                {author.imageUrl
                  ? <img src={author.imageUrl} alt={author.name} className="w-full h-full object-cover" />
                  : <span className="text-sm font-bold text-stone-400">{author.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-stone-800">{author.name}</p>
                  {author.nationality && <span className="text-[10px] text-stone-400">{author.nationality}</span>}
                  {author.born && <span className="text-[10px] text-stone-400">{author.born}{author.died ? `–${author.died}` : ""}</span>}
                  <span className="text-[10px] font-mono text-stone-300">{author.quoteCount} quote{author.quoteCount !== 1 ? "s" : ""}</span>
                  {author.autoGenerated && <span className="text-[10px] bg-blue-50 text-blue-400 px-1.5 py-0.5 rounded-full">AI</span>}
                  {!author.bio && <span className="text-[10px] bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded-full">No bio</span>}
                </div>
                {author.bio && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{author.bio}</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => regenerate(author.slug)}
                  disabled={regenerating === author.slug}
                  className="h-7 px-3 rounded-lg text-[10px] font-medium bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors disabled:opacity-50"
                  title="Re-generate bio with AI"
                >
                  {regenerating === author.slug ? "…" : "✦ AI"}
                </button>
                <button
                  onClick={() => setEditing({ ...author })}
                  className="h-7 px-3 rounded-lg text-[10px] font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
          <Pagination page={paged.page} perPage={paged.perPage} total={filtered.length} onPage={paged.setPage} />
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900">Edit: {editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-stone-400 hover:text-stone-700 text-lg leading-none">✕</button>
            </div>
            {[
              { key: "fullName", label: "Full name" },
              { key: "nationality", label: "Nationality" },
              { key: "born", label: "Born (year)" },
              { key: "died", label: "Died (year, leave blank if living)" },
              { key: "knownFor", label: "Known for" },
              { key: "imageUrl", label: "Image URL" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-stone-500">{label}</label>
                <input
                  value={(editing as any)[key] || ""}
                  onChange={e => setEditing({ ...editing, [key]: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500">Bio</label>
              <textarea
                value={editing.bio || ""}
                onChange={e => setEditing({ ...editing, bio: e.target.value })}
                rows={5}
                className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 h-9 rounded-xl text-sm font-bold text-white bg-stone-900 hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditing(null)} className="h-9 px-5 rounded-xl text-sm text-stone-500 hover:bg-stone-100 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sidebar nav def ───────────────────────────────────────────────────────────
// ── Monetisation tab ─────────────────────────────────────────────────────────

type AdType   = "sponsored_card" | "banner" | "affiliate" | "newsletter_ad";
type AdStatus = "active" | "paused" | "draft";

interface Ad {
  id: string;
  type: AdType;
  status: AdStatus;
  label: string;           // internal name
  sponsorName: string;
  sponsorUrl: string;
  sponsorLabel: string;    // pill text shown to user e.g. "Partner"
  headline: string;        // primary copy
  body: string;            // secondary copy (optional)
  ctaText: string;         // button/link text
  imageUrl: string;        // optional image/logo
  placement: string;       // e.g. "grid:7", "sidebar", "newsletter"
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  notes: string;
}

const EMPTY_AD: Omit<Ad, "id" | "impressions" | "clicks"> = {
  type: "sponsored_card",
  status: "draft",
  label: "",
  sponsorName: "",
  sponsorUrl: "",
  sponsorLabel: "Partner",
  headline: "",
  body: "",
  ctaText: "Learn more",
  imageUrl: "",
  placement: "grid:7",
  startDate: "",
  endDate: "",
  notes: "",
};

const AD_TYPE_META: Record<AdType, { label: string; Icon: React.ElementType; desc: string }> = {
  sponsored_card: { label: "Sponsored card",  Icon: QuoteIcon,    desc: "Appears in the quote grid at a set position"   },
  banner:         { label: "Banner",          Icon: ImageIcon,    desc: "Full-width banner strip on any page"           },
  affiliate:      { label: "Affiliate link",  Icon: ShoppingBag,  desc: "In-text or card link with tracking parameter"  },
  newsletter_ad:  { label: "Newsletter ad",   Icon: Mail,         desc: "Injected into the weekly digest email"         },
};

const STATUS_COLORS: Record<AdStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  draft:  "bg-stone-100 text-stone-500",
};

const PLACEMENT_PRESETS = [
  { value: "grid:7",       label: "Quote grid — position 7"  },
  { value: "grid:15",      label: "Quote grid — position 15" },
  { value: "sidebar",      label: "Sidebar"                  },
  { value: "hero",         label: "Hero section"             },
  { value: "newsletter",   label: "Newsletter digest"        },
  { value: "explore:top",  label: "Explore — top of page"   },
];

// Local-storage persistence (no backend endpoint needed for MVP)
const ADS_KEY = "ic_ads_v1";
function loadAds(): Ad[] {
  try { return JSON.parse(localStorage.getItem(ADS_KEY) || "[]"); } catch { return []; }
}
function saveAds(ads: Ad[]) {
  localStorage.setItem(ADS_KEY, JSON.stringify(ads));
}

function MonetisationTab() {
  const [ads, setAds] = useState<Ad[]>(loadAds);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [activeType, setActiveType] = useState<AdType | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const persist = (next: Ad[]) => { setAds(next); saveAds(next); };

  const startNew = (type: AdType = "sponsored_card") => {
    const fresh: Ad = { ...EMPTY_AD, type, id: `ad_${Date.now()}`, impressions: 0, clicks: 0 };
    setEditing(fresh);
    setIsNew(true);
  };

  const startEdit = (ad: Ad) => { setEditing({ ...ad }); setIsNew(false); };

  const save = () => {
    if (!editing) return;
    const next = isNew
      ? [...ads, editing]
      : ads.map(a => a.id === editing.id ? editing : a);
    persist(next);
    setEditing(null);
  };

  const remove = (id: string) => persist(ads.filter(a => a.id !== id));

  const toggleStatus = (id: string) => persist(ads.map(a => {
    if (a.id !== id) return a;
    const next: AdStatus = a.status === "active" ? "paused" : "active";
    return { ...a, status: next };
  }));

  const copySnippet = (ad: Ad) => {
    const snippet = `<!-- Inverted Comma Ad: ${ad.label} -->\n<a href="${ad.sponsorUrl}" data-ic-ad="${ad.id}">${ad.headline}</a>`;
    navigator.clipboard.writeText(snippet).catch(() => {});
    setCopiedId(ad.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = activeType === "all" ? ads : ads.filter(a => a.type === activeType);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const ctr = totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0.00";

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Monetisation</h2>
          <p className="text-sm text-stone-500 mt-0.5">Manage sponsored content, affiliate links, ads &amp; placements</p>
        </div>
        <button
          onClick={() => startNew()}
          className="flex items-center gap-2 bg-stone-900 text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New placement
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total placements", value: ads.length,                       sub: `${ads.filter(a=>a.status==="active").length} active` },
          { label: "Impressions",      value: totalImpressions.toLocaleString(), sub: "all time"   },
          { label: "Clicks",           value: totalClicks.toLocaleString(),      sub: "all time"   },
          { label: "CTR",              value: `${ctr}%`,                         sub: "click-through" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">{s.label}</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{s.value}</p>
            <p className="text-[11px] text-stone-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", "sponsored_card", "banner", "affiliate", "newsletter_ad"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              activeType === t
                ? "bg-stone-900 text-white border-stone-900"
                : "border-stone-200 text-stone-500 hover:border-stone-400"
            }`}
          >
            {t === "all" ? "All" : AD_TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Placements list */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white border border-dashed border-stone-200 rounded-2xl">
          <Megaphone className="w-8 h-8 text-stone-200 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">No placements yet.</p>
          <button onClick={() => startNew()} className="mt-3 text-xs text-stone-500 underline hover:text-stone-800">
            Create your first one
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ad => {
            const meta = AD_TYPE_META[ad.type];
            const Icon = meta.Icon;
            const ctrAd = ad.impressions ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : "—";
            return (
              <div key={ad.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex items-start gap-4">
                {/* Drag handle + type icon */}
                <div className="flex flex-col items-center gap-2 pt-0.5 flex-shrink-0">
                  <GripVertical className="w-4 h-4 text-stone-300" />
                  <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-stone-500" />
                  </div>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-stone-900 text-sm truncate">{ad.label || "(untitled)"}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_COLORS[ad.status]}`}>
                      {ad.status}
                    </span>
                    <span className="text-[10px] text-stone-400 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-full">
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 truncate">{ad.sponsorName}{ad.headline ? ` · "${ad.headline}"` : ""}</p>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-stone-400">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ad.placement || "—"}</span>
                    <span>{ad.impressions.toLocaleString()} impr.</span>
                    <span>{ad.clicks.toLocaleString()} clicks</span>
                    <span>CTR {ctrAd}%</span>
                    {(ad.startDate || ad.endDate) && (
                      <span>{ad.startDate || "∞"} → {ad.endDate || "∞"}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleStatus(ad.id)}
                    title={ad.status === "active" ? "Pause" : "Activate"}
                    className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    {ad.status === "active"
                      ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                      : <ToggleLeft  className="w-4 h-4 text-stone-400" />}
                  </button>
                  <button
                    onClick={() => copySnippet(ad)}
                    title="Copy embed snippet"
                    className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    {copiedId === ad.id
                      ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                      : <Copy className="w-4 h-4 text-stone-400" />}
                  </button>
                  <button
                    onClick={() => startEdit(ad)}
                    className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    <Edit2 className="w-4 h-4 text-stone-400" />
                  </button>
                  <button
                    onClick={() => remove(ad.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-stone-300 hover:text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Affiliate links reference section ──────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingBag className="w-4 h-4 text-stone-400" />
          <h3 className="text-sm font-bold text-stone-800">Affiliate link guide</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-stone-500">
          <div className="space-y-1">
            <p className="font-semibold text-stone-700 text-[11px] uppercase tracking-wider">How to add an affiliate link</p>
            <p>Create a new "Affiliate link" placement above. Set your tracked URL in the Sponsor URL field and choose a placement slot. The embed snippet auto-appends <code className="bg-stone-100 px-1 rounded">?ref=ic</code>.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-stone-700 text-[11px] uppercase tracking-wider">Labelling requirements</p>
            <p>All sponsored and affiliate content must be clearly labelled. Use the Sponsor Label field — e.g. "Partner", "Affiliate", "Ad". This text appears as a pill on the card.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-stone-700 text-[11px] uppercase tracking-wider">Disclosure</p>
            <p>The site footer automatically shows a generic affiliate disclosure. You do not need to add individual disclosures per placement — the sitewide notice covers it.</p>
          </div>
        </div>
      </div>

      {/* ── Edit / New modal ─────────────────────────────────────────────────────── */}
      {editing && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEditing(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
                <h3 className="font-bold text-stone-900">{isNew ? "New placement" : "Edit placement"}</h3>
                <button onClick={() => setEditing(null)} className="w-7 h-7 rounded-full hover:bg-stone-100 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5">

                {/* Type selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.entries(AD_TYPE_META) as [AdType, typeof AD_TYPE_META[AdType]][]).map(([k, m]) => (
                      <button
                        key={k}
                        onClick={() => setEditing(e => e ? { ...e, type: k } : e)}
                        className={`flex flex-col items-center gap-1.5 p-3 border rounded-xl text-center text-xs transition-all ${
                          editing.type === k
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-200 text-stone-500 hover:border-stone-400"
                        }`}
                      >
                        <m.Icon className="w-4 h-4" />
                        <span className="font-medium leading-tight">{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-stone-400 mt-1.5">{AD_TYPE_META[editing.type].desc}</p>
                </div>

                {/* Two-column fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Internal label */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Internal label</label>
                    <input
                      value={editing.label}
                      onChange={e => setEditing(ed => ed ? { ...ed, label: e.target.value } : ed)}
                      placeholder="e.g. Summer books campaign"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* Status */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Status</label>
                    <select
                      value={editing.status}
                      onChange={e => setEditing(ed => ed ? { ...ed, status: e.target.value as AdStatus } : ed)}
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-200"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  {/* Sponsor name */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Sponsor / brand name</label>
                    <input
                      value={editing.sponsorName}
                      onChange={e => setEditing(ed => ed ? { ...ed, sponsorName: e.target.value } : ed)}
                      placeholder="e.g. Acme Books"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* Sponsor label (pill) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Label pill (shown to users)</label>
                    <input
                      value={editing.sponsorLabel}
                      onChange={e => setEditing(ed => ed ? { ...ed, sponsorLabel: e.target.value } : ed)}
                      placeholder="Partner / Affiliate / Ad"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* URL */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      Destination URL
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                      <input
                        value={editing.sponsorUrl}
                        onChange={e => setEditing(ed => ed ? { ...ed, sponsorUrl: e.target.value } : ed)}
                        placeholder="https://example.com?ref=ic"
                        className="w-full border border-stone-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                      />
                    </div>
                  </div>
                  {/* Headline */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Headline copy</label>
                    <input
                      value={editing.headline}
                      onChange={e => setEditing(ed => ed ? { ...ed, headline: e.target.value } : ed)}
                      placeholder="Short, attention-grabbing headline"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* Body */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Body copy <span className="normal-case font-normal text-stone-400">(optional)</span></label>
                    <textarea
                      rows={2}
                      value={editing.body}
                      onChange={e => setEditing(ed => ed ? { ...ed, body: e.target.value } : ed)}
                      placeholder="Supporting text shown below the headline"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* CTA */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">CTA button text</label>
                    <input
                      value={editing.ctaText}
                      onChange={e => setEditing(ed => ed ? { ...ed, ctaText: e.target.value } : ed)}
                      placeholder="Learn more"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* Image URL */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Image / logo URL <span className="normal-case font-normal text-stone-400">(optional)</span></label>
                    <input
                      value={editing.imageUrl}
                      onChange={e => setEditing(ed => ed ? { ...ed, imageUrl: e.target.value } : ed)}
                      placeholder="https://…"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  {/* Placement */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />Placement slot</span>
                    </label>
                    <select
                      value={editing.placement}
                      onChange={e => setEditing(ed => ed ? { ...ed, placement: e.target.value } : ed)}
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-200"
                    >
                      {PLACEMENT_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                      <option value="custom">Custom…</option>
                    </select>
                    {editing.placement === "custom" && (
                      <input
                        className="w-full mt-2 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                        placeholder="Describe placement"
                        onChange={e => setEditing(ed => ed ? { ...ed, placement: e.target.value } : ed)}
                      />
                    )}
                  </div>
                  {/* Dates */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Flight dates <span className="normal-case font-normal text-stone-400">(optional)</span></label>
                    <div className="flex gap-2">
                      <input type="date" value={editing.startDate}
                        onChange={e => setEditing(ed => ed ? { ...ed, startDate: e.target.value } : ed)}
                        className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                      />
                      <input type="date" value={editing.endDate}
                        onChange={e => setEditing(ed => ed ? { ...ed, endDate: e.target.value } : ed)}
                        className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
                      />
                    </div>
                  </div>
                  {/* Notes */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">Internal notes</label>
                    <textarea
                      rows={2}
                      value={editing.notes}
                      onChange={e => setEditing(ed => ed ? { ...ed, notes: e.target.value } : ed)}
                      placeholder="Contact info, rate agreed, special instructions…"
                      className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                </div>

              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-stone-100 sticky bottom-0 bg-white">
                <button onClick={() => setEditing(null)} className="text-sm text-stone-400 hover:text-stone-700">
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="flex items-center gap-2 bg-stone-900 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-stone-700 transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isNew ? "Create placement" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Tab = "overview" | "quotes" | "authors" | "sources" | "tags" | "users" | "discussions" | "subscribers" | "ai" | "monetisation";

const TABS: { key: Tab; label: string; Icon: React.ElementType; adminOnly?: boolean }[] = [
  { key: "overview",      label: "Overview",      Icon: LayoutDashboard },
  { key: "quotes",        label: "Quotes",        Icon: QuoteIcon },
  { key: "authors",       label: "Authors",       Icon: Users },
  { key: "sources",       label: "Sources",       Icon: BookOpen },
  { key: "tags",          label: "Tags",          Icon: Tag },
  { key: "users",         label: "Users",         Icon: Users },
  { key: "discussions",   label: "Discussions",   Icon: MessageSquare },
  { key: "subscribers",   label: "Subscribers",   Icon: Mail },
  { key: "monetisation",  label: "Monetisation",  Icon: DollarSign, adminOnly: true },
  { key: "ai",            label: "AI",            Icon: Bot },
];

// ── Main ControlPage ──────────────────────────────────────────────────────────
export default function ControlPage() {
  const { user, isLoggedIn, isAdmin, logout } = useUser();
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isModerator = user?.role === "moderator";
  const isPrivileged = isAdmin || isModerator;

  useEffect(() => {
    if (isLoggedIn && isPrivileged) setUnlocked(true);
  }, [isLoggedIn, isPrivileged]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!unlocked) {
    return <LoginGate onSuccess={() => setUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-[#111] flex flex-col transition-transform duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } md:relative md:translate-x-0`}>

        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/10">
          <Link to="/" className="font-serif italic font-bold text-white text-lg tracking-tight hover:opacity-80 transition-opacity">
            "invertedcomma
          </Link>
          <p className="text-white/30 text-[10px] font-mono uppercase tracking-widest mt-0.5">Control Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {TABS.map(({ key, label, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => { setActiveTab(key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  active ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80 hover:bg-white/8"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-white" : ""}`} />
                {label}
              </button>
            );
          })}
        </nav>

      </aside>

      {pwModalOpen && <ChangePasswordModal onClose={() => setPwModalOpen(false)} />}

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="md:hidden text-stone-500 hover:text-stone-800 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ShieldCheck className="w-4 h-4 text-stone-400 flex-shrink-0" />
            <span className="text-sm font-medium text-stone-600 capitalize">{activeTab}</span>
          </div>

          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors border border-stone-200 rounded-full px-3 py-1.5">
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:block">View site</span>
            </a>
            {/* Admin menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 rounded-full hover:bg-stone-100 pl-1 pr-2 py-1 transition-colors"
              >
                <img src={user?.avatar} alt={user?.name} className="w-7 h-7 rounded-full object-cover bg-stone-200" />
                <span className="hidden sm:block text-xs font-medium text-stone-700">{user?.name}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1">
                    <div className="px-4 py-3 border-b border-stone-100">
                      <p className="text-sm font-semibold text-stone-800 truncate">{user?.name}</p>
                      <p className="text-[11px] text-stone-400 truncate">{user?.email}</p>
                      <p className="text-[10px] text-stone-400 capitalize font-mono mt-0.5">{user?.role}</p>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); setPwModalOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 text-stone-400" /> Change password
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); handleLogout(); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-5 md:px-8 py-8 max-w-5xl w-full mx-auto">
          {activeTab === "overview"     && <OverviewTab />}
          {activeTab === "quotes"       && <QuotesTab />}
          {activeTab === "authors"      && <AuthorsTab />}
          {activeTab === "sources"      && <SourcesTab />}
          {activeTab === "tags"         && <TagsTab />}
          {activeTab === "users"        && <UsersTab currentRole={user?.role ?? "moderator"} />}
          {activeTab === "discussions"  && <DiscussionsTab />}
          {activeTab === "subscribers"  && <SubscribersTab />}
          {activeTab === "monetisation" && <MonetisationTab />}
          {activeTab === "ai"           && <AITab />}
        </main>
      </div>
    </div>
  );
}
