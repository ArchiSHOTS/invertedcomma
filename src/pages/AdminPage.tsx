import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck, ArrowLeft, Quote as QuoteIcon, Tag, Users, Mail,
  Bot, Plus, Trash2, CheckCircle, XCircle, Youtube, FileText,
  Upload, Sparkles, RefreshCw, ExternalLink, Eye, BarChart2,
  ChevronDown, ChevronRight
} from "lucide-react";
import { useUser } from "../context/UserContext";
import { Quote, ExtractedQuote, Subscriber } from "../types";

type Tab = "quotes" | "tags" | "users" | "subscribers" | "ai";

// ── Password gate ────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, validate against server. For now: env or hardcoded demo.
    const envPw = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_ADMIN_PASSWORD;
    if (pw === "admin123" || (envPw && pw === envPw)) {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <ShieldCheck className="w-8 h-8 mx-auto text-[#1A1A1A]" />
          <h1 className="font-serif italic font-black text-2xl">Admin Access</h1>
          <p className="text-xs text-[#6B665E]">invertedcomma.com · restricted</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Admin password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            className={`w-full bg-white border rounded-none px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 ${
              error ? "border-red-400" : "border-[#E5E1D9]"
            }`}
          />
          {error && <p className="text-xs text-red-500">Incorrect password</p>}
          <button
            type="submit"
            className="w-full h-11 bg-[#1A1A1A] text-white font-bold uppercase tracking-wider text-sm hover:bg-neutral-800 transition-colors"
          >
            Enter Dashboard
          </button>
        </form>
        <p className="text-center text-[10px] text-[#9A948C] font-mono">Demo password: admin123</p>
        <Link to="/" className="flex items-center justify-center gap-2 text-xs text-[#6B665E] hover:text-[#1A1A1A]">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to site
        </Link>
      </div>
    </div>
  );
}

// ── Quotes tab ───────────────────────────────────────────────────────────────
function QuotesTab() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "youtube" | "paste" | null>(null);

  // Manual add form
  const [manualForm, setManualForm] = useState({
    text: "", author: "", source: "", year: "", category: "", context: "", tags: ""
  });

  // YouTube extraction
  const [ytUrl, setYtUrl] = useState("");
  const [ytExtracting, setYtExtracting] = useState(false);
  const [extractedQuotes, setExtractedQuotes] = useState<ExtractedQuote[]>([]);
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set());

  // Paste/text
  const [pasteText, setPasteText] = useState("");
  const [pasteExtracting, setPasteExtracting] = useState(false);
  const [pasteExtracted, setPasteExtracted] = useState<ExtractedQuote[]>([]);

  useEffect(() => {
    fetch("/api/quotes").then(r => r.json()).then(d => setQuotes(d.quotes || []));
  }, []);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...manualForm,
        year: manualForm.year ? parseInt(manualForm.year) : undefined,
        tags: manualForm.tags.split(",").map(t => t.trim()).filter(Boolean),
        status: "published",
        submittedBy: "admin",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuotes(prev => [data.quote, ...prev]);
      setManualForm({ text: "", author: "", source: "", year: "", category: "", context: "", tags: "" });
      setAddMode(null);
    }
  };

  const handleYouTubeExtract = async () => {
    if (!ytUrl.trim()) return;
    setYtExtracting(true);
    setExtractedQuotes([]);
    try {
      const res = await fetch("/api/admin/extract-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ytUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setExtractedQuotes(data.quotes || []);
        // Pre-select all
        setSelectedExtracted(new Set(data.quotes.map((_: ExtractedQuote, i: number) => i)));
      }
    } finally {
      setYtExtracting(false);
    }
  };

  const handleSaveExtracted = async () => {
    const toSave = extractedQuotes.filter((_, i) => selectedExtracted.has(i));
    const res = await fetch("/api/admin/quotes/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotes: toSave }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuotes(prev => [...data.quotes, ...prev]);
      setExtractedQuotes([]);
      setYtUrl("");
      setAddMode(null);
    }
  };

  const handlePasteExtract = async () => {
    if (!pasteText.trim()) return;
    setPasteExtracting(true);
    try {
      const res = await fetch("/api/admin/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      if (res.ok) {
        const data = await res.json();
        setPasteExtracted(data.quotes || []);
      }
    } finally {
      setPasteExtracting(false);
    }
  };

  const handleApprove = async (id: string) => {
    await fetch(`/api/admin/quotes/${id}/approve`, { method: "POST" });
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: "published" } : q));
  };

  const handleReject = async (id: string) => {
    await fetch(`/api/admin/quotes/${id}/reject`, { method: "POST" });
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: "rejected" } : q));
  };

  const displayed = pendingOnly ? quotes.filter(q => q.status === "pending") : quotes;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif italic font-bold text-xl">Quotes <span className="text-[#9A948C] font-sans not-italic text-sm">({quotes.length})</span></h2>
          <label className="flex items-center gap-1.5 text-xs text-[#6B665E] cursor-pointer">
            <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} className="accent-[#1A1A1A]" />
            Pending only ({quotes.filter(q => q.status === "pending").length})
          </label>
        </div>
        <div className="flex gap-2">
          {([["manual", "Manual"], ["youtube", "YouTube URL"], ["paste", "Paste Text"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setAddMode(addMode === mode ? null : mode)}
              className={`flex items-center gap-1.5 h-8 px-3 border rounded-full text-xs font-medium transition-colors ${
                addMode === mode ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "border-[#E5E1D9] text-[#6B665E] hover:bg-[#F5F2ED]"
              }`}
            >
              {mode === "youtube" ? <Youtube className="w-3 h-3" /> : mode === "paste" ? <FileText className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Add: Manual ── */}
      {addMode === "manual" && (
        <form onSubmit={handleManualSubmit} className="bg-white border border-[#E5E1D9] p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A948C]">Add quote manually</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <textarea rows={3} placeholder="Quote text *" value={manualForm.text}
              onChange={e => setManualForm(p => ({...p, text: e.target.value}))} required
              className="sm:col-span-2 w-full border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] resize-none" />
            <input placeholder="Author *" value={manualForm.author}
              onChange={e => setManualForm(p => ({...p, author: e.target.value}))} required
              className="border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]" />
            <input placeholder="Source / Book" value={manualForm.source}
              onChange={e => setManualForm(p => ({...p, source: e.target.value}))}
              className="border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]" />
            <input placeholder="Year (e.g. 1984 or -400)" value={manualForm.year}
              onChange={e => setManualForm(p => ({...p, year: e.target.value}))}
              className="border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]" />
            <input placeholder="Category *" value={manualForm.category}
              onChange={e => setManualForm(p => ({...p, category: e.target.value}))} required
              className="border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]" />
            <textarea rows={2} placeholder="Context (author bio, quote background)" value={manualForm.context}
              onChange={e => setManualForm(p => ({...p, context: e.target.value}))}
              className="sm:col-span-2 w-full border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] resize-none" />
            <input placeholder="Tags (comma-separated: philosophy, stoicism)" value={manualForm.tags}
              onChange={e => setManualForm(p => ({...p, tags: e.target.value}))}
              className="sm:col-span-2 border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="h-9 px-5 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-wider hover:bg-neutral-800 transition-colors">
              Publish quote
            </button>
            <button type="button" onClick={() => setAddMode(null)} className="h-9 px-4 border border-[#E5E1D9] text-xs text-[#6B665E] hover:bg-[#F5F2ED] transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Add: YouTube ── */}
      {addMode === "youtube" && (
        <div className="bg-white border border-[#E5E1D9] p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A948C]">Extract quotes from YouTube</h3>
            <p className="text-xs text-[#6B665E]">
              Paste any YouTube URL. Gemini will fetch the transcript, identify quotable moments, and extract speaker name, timestamp, context, and suggested tags.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FF0000]" />
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
                className="w-full border border-[#E5E1D9] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
              />
            </div>
            <button
              onClick={handleYouTubeExtract}
              disabled={ytExtracting || !ytUrl.trim()}
              className="h-10 px-4 bg-[#1A1A1A] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors hover:bg-neutral-800"
            >
              {ytExtracting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {ytExtracting ? "Extracting…" : "Extract quotes"}
            </button>
          </div>

          {extractedQuotes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[#1A1A1A]">{extractedQuotes.length} quotes found</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedExtracted(new Set(extractedQuotes.map((_, i) => i)))}
                    className="text-[10px] text-[#6B665E] hover:underline">Select all</button>
                  <button onClick={() => setSelectedExtracted(new Set())}
                    className="text-[10px] text-[#6B665E] hover:underline">Deselect all</button>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {extractedQuotes.map((eq, i) => (
                  <label key={i} className={`flex gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedExtracted.has(i) ? "border-[#1A1A1A] bg-[#F5F2ED]" : "border-[#E5E1D9] hover:bg-[#F9F8F5]"
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedExtracted.has(i)}
                      onChange={() => setSelectedExtracted(prev => {
                        const next = new Set(prev);
                        next.has(i) ? next.delete(i) : next.add(i);
                        return next;
                      })}
                      className="mt-0.5 accent-[#1A1A1A] flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-serif italic text-sm text-[#1A1A1A] leading-snug">"{eq.text}"</p>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#9A948C] font-mono">
                        <span className="font-bold text-[#6B665E]">— {eq.speaker}</span>
                        <span>⏱ {Math.floor(eq.startSeconds/60)}:{String(eq.startSeconds%60).padStart(2,"0")}</span>
                        {eq.suggestedTags.slice(0,3).map(t => (
                          <span key={t} className="bg-[#F0EDE8] px-1.5 py-0.5 rounded">#{t}</span>
                        ))}
                      </div>
                      {eq.context && <p className="text-[11px] text-[#6B665E]">{eq.context}</p>}
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveExtracted}
                  disabled={selectedExtracted.size === 0}
                  className="h-9 px-5 bg-[#1A1A1A] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-40 transition-colors hover:bg-neutral-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add {selectedExtracted.size} quote{selectedExtracted.size !== 1 ? "s" : ""}
                </button>
                <button onClick={() => { setExtractedQuotes([]); setYtUrl(""); setAddMode(null); }}
                  className="h-9 px-4 border border-[#E5E1D9] text-xs text-[#6B665E] hover:bg-[#F5F2ED] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add: Paste text ── */}
      {addMode === "paste" && (
        <div className="bg-white border border-[#E5E1D9] p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#9A948C]">Extract quotes from text / article / PDF</h3>
            <p className="text-xs text-[#6B665E]">Paste article text, a book excerpt, or transcript. AI will identify all quotable statements.</p>
          </div>
          <textarea
            rows={8}
            placeholder="Paste article, speech transcript, PDF text, book excerpt…"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            className="w-full border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] resize-y font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={handlePasteExtract}
              disabled={pasteExtracting || !pasteText.trim()}
              className="h-9 px-5 bg-[#1A1A1A] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {pasteExtracting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {pasteExtracting ? "Extracting…" : "Extract quotes"}
            </button>
            <button onClick={() => setAddMode(null)} className="h-9 px-4 border border-[#E5E1D9] text-xs text-[#6B665E]">Cancel</button>
          </div>

          {pasteExtracted.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto border border-[#E5E1D9] p-3">
              {pasteExtracted.map((eq, i) => (
                <div key={i} className="p-3 bg-[#F5F2ED] space-y-1">
                  <p className="font-serif italic text-sm">"{eq.text}"</p>
                  <p className="text-xs font-bold">— {eq.speaker}</p>
                  <div className="flex gap-1.5">
                    {eq.suggestedTags.map(t => (
                      <span key={t} className="text-[10px] bg-white border border-[#E5E1D9] px-1.5 py-0.5 rounded font-mono">#{t}</span>
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={async () => {
                  await fetch("/api/admin/quotes/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quotes: pasteExtracted }),
                  });
                  setPasteExtracted([]);
                  setPasteText("");
                  setAddMode(null);
                }}
                className="w-full h-9 bg-[#1A1A1A] text-white text-xs font-bold"
              >
                Add all {pasteExtracted.length} quotes
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quote list */}
      <div className="space-y-2">
        {displayed.length === 0 ? (
          <p className="text-sm text-[#9A948C] italic text-center py-8">No quotes to show.</p>
        ) : (
          displayed.map((q) => (
            <div key={q.id} className={`flex items-start gap-3 p-4 bg-white border rounded-lg transition-colors ${
              q.status === "pending" ? "border-amber-300 bg-amber-50/30" : "border-[#E5E1D9]"
            }`}>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="font-serif italic text-sm text-[#1A1A1A] line-clamp-2">"{q.text}"</p>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#9A948C] font-mono">
                  <span className="font-bold text-[#6B665E]">— {q.author}</span>
                  <span className="bg-[#F0EDE8] px-1.5 py-0.5 rounded">{q.category}</span>
                  {q.status === "pending" && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">PENDING</span>}
                  {q.submittedBy && q.submittedBy !== "admin" && <span>by @{q.submittedBy}</span>}
                  {q.videoTimestamp && <span className="text-[#FF0000]">▶ VIDEO</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Link to={`/q/${q.slug}`} className="w-7 h-7 border border-[#E5E1D9] rounded-full flex items-center justify-center text-[#6B665E] hover:bg-[#F5F2ED]" title="View">
                  <Eye className="w-3 h-3" />
                </Link>
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
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tags tab ─────────────────────────────────────────────────────────────────
function TagsTab() {
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    fetch("/api/tags").then(r => r.json()).then(d => setTags(d.tags || []));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTag.trim().toLowerCase().replace(/\s+/g, "-") }),
    });
    if (res.ok) {
      setTags(prev => [...prev, { name: newTag.trim(), count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTag("");
    }
  };

  const handleDelete = async (name: string) => {
    await fetch(`/api/admin/tags/${name}`, { method: "DELETE" });
    setTags(prev => prev.filter(t => t.name !== name));
  };

  return (
    <div className="space-y-5">
      <h2 className="font-serif italic font-bold text-xl">Tags <span className="text-[#9A948C] font-sans not-italic text-sm">({tags.length})</span></h2>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder="New tag name…"
          className="flex-1 border border-[#E5E1D9] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
        />
        <button type="submit" className="h-9 px-4 bg-[#1A1A1A] text-white text-xs font-bold flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tags.sort((a, b) => b.count - a.count).map(({ name, count }) => (
          <div key={name} className="flex items-center gap-1.5 bg-white border border-[#E5E1D9] rounded-full px-3 py-1.5 group">
            <span className="text-xs text-[#1A1A1A] font-medium">#{name}</span>
            <span className="text-[10px] text-[#9A948C] font-mono">{count}</span>
            <button onClick={() => handleDelete(name)}
              className="w-4 h-4 text-[#9A948C] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const demoUsers = [
    { id: "user_demo_001", handle: "socrates_21", email: "demo@invertedcomma.com", role: "user", quotes: 0, comments: 1, joined: "Jan 2024" },
    { id: "user_admin_001", handle: "ic_admin", email: "admin@invertedcomma.com", role: "admin", quotes: 0, comments: 0, joined: "Jan 2024" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif italic font-bold text-xl">Users <span className="text-[#9A948C] font-sans not-italic text-sm">(demo — {demoUsers.length})</span></h2>
        <p className="text-[10px] text-[#9A948C] font-mono bg-[#F5F2ED] border border-[#E5E1D9] px-2.5 py-1 rounded">Real auth = replace UserContext with JWT/OAuth</p>
      </div>

      <div className="space-y-2">
        {demoUsers.map(u => (
          <div key={u.id} className="flex items-center gap-4 p-4 bg-white border border-[#E5E1D9] rounded-lg">
            <div className="w-8 h-8 bg-[#E5E1D9] rounded-full flex items-center justify-center flex-shrink-0">
              {u.role === "admin" ? <ShieldCheck className="w-4 h-4 text-rose-600" /> : <Users className="w-4 h-4 text-[#6B665E]" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#1A1A1A]">@{u.handle}</p>
              <p className="text-[11px] text-[#9A948C]">{u.email} · joined {u.joined}</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-mono text-[#9A948C]">
              <span>{u.quotes} quotes</span>
              <span>{u.comments} comments</span>
              <span className={`px-2 py-0.5 rounded font-bold uppercase ${u.role === "admin" ? "bg-rose-100 text-rose-600" : "bg-[#F0EDE8] text-[#6B665E]"}`}>
                {u.role}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Subscribers tab ───────────────────────────────────────────────────────────
function SubscribersTab() {
  const [subs, setSubs] = useState<Subscriber[]>([]);

  useEffect(() => {
    fetch("/api/admin/subscribers").then(r => r.json()).then(d => setSubs(d.subscribers || []));
  }, []);

  const handleExport = () => {
    const csv = ["email,source,date", ...subs.map(s => `${s.email},${s.source},${s.subscribedAt}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ic_subscribers.csv"; a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif italic font-bold text-xl">Subscribers <span className="text-[#9A948C] font-sans not-italic text-sm">({subs.length})</span></h2>
        {subs.length > 0 && (
          <button onClick={handleExport} className="flex items-center gap-1.5 h-8 px-3 border border-[#E5E1D9] text-xs text-[#6B665E] hover:bg-[#F5F2ED] rounded-full transition-colors">
            <Upload className="w-3 h-3" /> Export CSV
          </button>
        )}
      </div>

      {subs.length === 0 ? (
        <div className="text-center py-12 bg-white border border-[#E5E1D9]">
          <Mail className="w-6 h-6 text-[#9A948C] mx-auto mb-2" />
          <p className="text-sm text-[#6B665E] italic">No subscribers yet. The newsletter CTA on quote pages will populate this list.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subs.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-[#E5E1D9]">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{s.email}</p>
                <p className="text-[10px] text-[#9A948C] font-mono">via {s.source} · {new Date(s.subscribedAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Management tab ─────────────────────────────────────────────────────────
function AITab() {
  const models = [
    { name: "Gemini 2.0 Flash", provider: "Google", inputCost: "$0.075/1M tokens", outputCost: "$0.30/1M tokens", freeTier: "1,500 req/day", status: "active", recommended: true },
    { name: "GPT-4o Mini", provider: "OpenAI", inputCost: "$0.15/1M tokens", outputCost: "$0.60/1M tokens", freeTier: "None", status: "available", recommended: false },
    { name: "Claude Haiku 3.5", provider: "Anthropic", inputCost: "$0.80/1M tokens", outputCost: "$4.00/1M tokens", freeTier: "None", status: "available", recommended: false },
    { name: "Llama 3.1 8B (Groq)", provider: "Groq", inputCost: "~$0.05/1M tokens", outputCost: "~$0.08/1M tokens", freeTier: "Rate-limited", status: "available", recommended: false },
  ];

  const useCases = [
    { task: "AI Counterpoint", model: "Gemini 2.0 Flash", avgTokens: "~400 tokens/req", monthlyEst: "~$0.03 per 1k uses" },
    { task: "YouTube Quote Extraction", model: "Gemini 2.0 Flash", avgTokens: "~2,000 tokens/req", monthlyEst: "~$0.15 per 100 videos" },
    { task: "Text/Article Extraction", model: "Gemini 2.0 Flash", avgTokens: "~1,500 tokens/req", monthlyEst: "~$0.11 per 100 articles" },
    { task: "Tag Suggestions", model: "Gemini 2.0 Flash", avgTokens: "~200 tokens/req", monthlyEst: "~$0.02 per 1k quotes" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-serif italic font-bold text-xl">AI Management</h2>

      {/* Cost summary */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 space-y-1">
        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Cost estimate for free-forever model</p>
        <p className="text-sm text-emerald-700">At 10,000 active users/month with Gemini 2.0 Flash free tier: <strong>~$0 in AI costs</strong> up to 1,500 requests/day. Beyond that: ~$1–5/month at typical usage patterns.</p>
      </div>

      {/* Model comparison */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9A948C] mb-3">Model comparison</p>
        <div className="space-y-2">
          {models.map(m => (
            <div key={m.name} className={`flex flex-wrap items-center gap-3 p-3 border rounded-lg ${m.status === "active" ? "border-[#1A1A1A] bg-[#F5F2ED]" : "border-[#E5E1D9] bg-white"}`}>
              <div className="flex items-center gap-2 min-w-[180px]">
                {m.recommended && <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />}
                <div>
                  <p className="text-xs font-bold text-[#1A1A1A]">{m.name}</p>
                  <p className="text-[10px] text-[#9A948C]">{m.provider}</p>
                </div>
              </div>
              <div className="flex gap-4 text-[10px] font-mono text-[#6B665E] flex-wrap">
                <span>In: {m.inputCost}</span>
                <span>Out: {m.outputCost}</span>
                <span className="text-emerald-600">Free: {m.freeTier}</span>
              </div>
              <div className="ml-auto">
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${m.status === "active" ? "bg-[#1A1A1A] text-white" : "bg-[#E5E1D9] text-[#6B665E]"}`}>
                  {m.status === "active" ? "● Active" : "Available"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Use case cost table */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9A948C] mb-3">Cost by use case</p>
        <div className="bg-white border border-[#E5E1D9] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E5E1D9] bg-[#F5F2ED]">
                <th className="text-left px-4 py-2.5 font-bold text-[#1A1A1A] uppercase tracking-wider text-[10px]">Task</th>
                <th className="text-left px-4 py-2.5 font-bold text-[#1A1A1A] uppercase tracking-wider text-[10px]">Model</th>
                <th className="text-left px-4 py-2.5 font-bold text-[#1A1A1A] uppercase tracking-wider text-[10px]">Avg tokens</th>
                <th className="text-left px-4 py-2.5 font-bold text-[#1A1A1A] uppercase tracking-wider text-[10px]">Est. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E1D9]">
              {useCases.map(uc => (
                <tr key={uc.task}>
                  <td className="px-4 py-2.5 font-medium">{uc.task}</td>
                  <td className="px-4 py-2.5 text-[#6B665E]">{uc.model}</td>
                  <td className="px-4 py-2.5 font-mono text-[#9A948C]">{uc.avgTokens}</td>
                  <td className="px-4 py-2.5 font-mono text-emerald-600 font-bold">{uc.monthlyEst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#F5F2ED] border border-[#E5E1D9] p-4 space-y-1">
        <p className="text-xs font-bold text-[#1A1A1A]">To switch AI provider:</p>
        <p className="text-xs text-[#6B665E]">In <code className="bg-white px-1 rounded border border-[#E5E1D9]">server.ts</code>, replace the Gemini client with the provider of your choice. The API endpoints are provider-agnostic — only the client instantiation changes.</p>
      </div>
    </div>
  );
}

// ── Main AdminPage ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { isAdmin, login } = useUser();
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("quotes");

  // Auto-unlock if already logged in as admin
  useEffect(() => {
    if (isAdmin) setUnlocked(true);
  }, [isAdmin]);

  const handleUnlock = () => {
    login(true); // sets admin user
    setUnlocked(true);
  };

  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;

  const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: "quotes", label: "Quotes", Icon: QuoteIcon },
    { key: "tags", label: "Tags", Icon: Tag },
    { key: "users", label: "Users", Icon: Users },
    { key: "subscribers", label: "Subscribers", Icon: Mail },
    { key: "ai", label: "AI", Icon: Bot },
  ];

  return (
    <div className="min-h-screen bg-[#FBF9F6]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#FBF9F6]/95 backdrop-blur-md border-b border-[#E5E1D9] px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[#6B665E] hover:text-[#1A1A1A] transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-rose-600" />
              <span className="font-serif italic font-bold text-lg text-[#1A1A1A]">Admin</span>
            </div>
          </div>
          <Link to="/" className="font-serif italic font-black text-sm text-[#1A1A1A] opacity-60 hover:opacity-100 transition">
            "invertedcomma.com
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar nav */}
          <nav className="hidden md:flex flex-col w-44 flex-shrink-0 space-y-1">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeTab === key
                    ? "bg-[#1A1A1A] text-white"
                    : "text-[#6B665E] hover:bg-[#F5F2ED] hover:text-[#1A1A1A]"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Mobile tab bar */}
          <div className="md:hidden w-full overflow-x-auto flex gap-1 mb-4">
            {TABS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  activeTab === key ? "bg-[#1A1A1A] text-white" : "border border-[#E5E1D9] text-[#6B665E]"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "quotes" && <QuotesTab />}
            {activeTab === "tags" && <TagsTab />}
            {activeTab === "users" && <UsersTab />}
            {activeTab === "subscribers" && <SubscribersTab />}
            {activeTab === "ai" && <AITab />}
          </main>
        </div>
      </div>
    </div>
  );
}

// X icon used in TagsTab
function X({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
