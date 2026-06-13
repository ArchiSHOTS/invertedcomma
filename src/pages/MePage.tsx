import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bookmark, Settings, LogOut, Bell, BellOff,
  Save, X, Check, BookOpen,
  Clock, Tag, Eye, EyeOff, AlertCircle, ExternalLink,
  Sparkles, Trash2, FolderHeart, Plus, FolderOpen, Folder,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import { Quote } from "../types";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

const BRAND = "#3D5A3E";

const ALL_INTERESTS = [
  "Philosophy & Stoicism", "Design & Architecture", "Creativity & Art",
  "Business & Entrepreneurship", "Literature & Writing", "Science & Technology",
  "Psychology & Mind", "History & Politics", "Motivation & Success", "Leadership",
  "Nature & Environment", "Mathematics & Logic", "Music & Culture",
  "Education & Knowledge", "Sports & Discipline", "Love & Relationships",
  "Society & Change", "Economics & Wealth", "Health & Well-being",
  "Innovation & Future", "Minimalism & Focus", "Truth & Language", "Humour & Paradox",
];

function getToken() { return localStorage.getItem("ic_token") ?? ""; }
function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

type Tab = "bookmarks" | "collections" | "submissions" | "interests" | "settings";

interface Collection {
  id: string;
  name: string;
  description?: string;
  quoteIds: string[];
}

function loadCollections(): Collection[] {
  try { return JSON.parse(localStorage.getItem("ic_collections_v2") || "[]"); } catch { return []; }
}
function saveCollections(cols: Collection[]) {
  localStorage.setItem("ic_collections_v2", JSON.stringify(cols));
}

// ── Bookmark card ─────────────────────────────────────────────────────────────
function BookmarkCard({
  quote, onRemove, collections, onToggleCollection,
}: {
  quote: Quote;
  onRemove: (id: string) => void;
  collections: Collection[];
  onToggleCollection: (colId: string, quoteId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    await fetch(`/api/quotes/${quote.id}/bookmark`, { method: "POST", headers: authHeaders() });
    onRemove(quote.id);
  };

  const memberOf = collections.filter(c => c.quoteIds.includes(quote.id));

  return (
    <div className="group bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <Link to={`/q/${quote.slug}`} className="block">
            <p className="font-serif italic text-stone-800 text-sm leading-relaxed line-clamp-3 hover:text-stone-600 transition-colors">
              "{quote.text}"
            </p>
            <p className="text-xs font-semibold text-stone-500 mt-1.5">— {quote.author}{quote.year ? `, ${quote.year}` : ""}</p>
          </Link>
          {quote.source && (
            <p className="text-[11px] text-stone-400 italic mt-0.5">{quote.source}</p>
          )}
          {/* Collection membership chips */}
          {memberOf.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {memberOf.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">
                  <Folder className="w-2.5 h-2.5" />{c.name}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {quote.tags.slice(0, 4).map(t => (
              <Link key={t} to={`/tag/${t}`} className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors">
                #{t}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <Link
            to={`/q/${quote.slug}`}
            className="w-7 h-7 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:bg-stone-100 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </Link>

          {/* Add to collection button */}
          {collections.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setFolderOpen(o => !o)}
                className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                  memberOf.length > 0
                    ? "border-stone-400 text-stone-600 bg-stone-50"
                    : "border-stone-200 text-stone-300 hover:border-stone-400 hover:text-stone-500"
                }`}
                title="Add to collection"
              >
                <FolderHeart className="w-3 h-3" />
              </button>

              {folderOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFolderOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-stone-200 rounded-2xl shadow-xl p-2 z-20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 px-2 pt-1 pb-2">Save to collection</p>
                    {collections.map(col => {
                      const inCol = col.quoteIds.includes(quote.id);
                      return (
                        <button
                          key={col.id}
                          onClick={() => { onToggleCollection(col.id, quote.id); }}
                          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-stone-50 transition-colors text-left"
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            inCol ? "border-[#3D5A3E] bg-[#3D5A3E]" : "border-stone-200"
                          }`}>
                            {inCol && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-stone-700 truncate">{col.name}</p>
                            {col.description && <p className="text-[10px] text-stone-400 truncate">{col.description}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Remove bookmark */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-red-500 font-medium whitespace-nowrap">Remove?</span>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors"
              >
                {removing ? <X className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="w-6 h-6 rounded-full border border-stone-200 flex items-center justify-center text-stone-400 hover:bg-stone-100 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-full border border-stone-200 flex items-center justify-center text-stone-300 hover:border-red-200 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="Remove bookmark"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MePage() {
  const { user, isLoggedIn, isLoading, logout, updateUser } = useUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("bookmarks");

  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !isLoggedIn) navigate("/auth/login", { replace: true });
  }, [isLoading, isLoggedIn, navigate]);

  // ── Bookmarks ──────────────────────────────────────────────────────────────
  const [bookmarks, setBookmarks] = useState<Quote[]>([]);

  const [bookmarksLoading, setBookmarksLoading] = useState(false);

  const loadBookmarks = useCallback(async () => {
    if (!user?.handle) return;
    setBookmarksLoading(true);
    try {
      const r = await fetch(`/api/user/${user.handle}/quotes`);
      if (r.ok) {
        const d = await r.json();
        setBookmarks((d.quotes || []) as Quote[]);
      }
    } finally { setBookmarksLoading(false); }
  }, [user?.handle]);

  useEffect(() => { if (tab === "bookmarks" || tab === "collections") loadBookmarks(); }, [tab, loadBookmarks]);

  // ── Collections ────────────────────────────────────────────────────────────
  const [collections, setCollections] = useState<Collection[]>(loadCollections);
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  useEffect(() => { saveCollections(collections); }, [collections]);

  const createCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    const col: Collection = { id: `col_${Date.now()}`, name: newColName.trim(), description: newColDesc.trim() || undefined, quoteIds: [] };
    setCollections(prev => [...prev, col]);
    setNewColName("");
    setNewColDesc("");
  };

  const deleteCollection = (id: string) => setCollections(prev => prev.filter(c => c.id !== id));

  const toggleQuoteInCollection = (colId: string, quoteId: string) => {
    setCollections(prev => prev.map(c =>
      c.id === colId
        ? { ...c, quoteIds: c.quoteIds.includes(quoteId) ? c.quoteIds.filter(i => i !== quoteId) : [...c.quoteIds, quoteId] }
        : c
    ));
  };

  // ── Submissions ──────────────────────────────────────────────────────────
  // User-submitted quotes feature is not live yet — the tab shows a placeholder.

  // ── Settings ───────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (user) {
      setDisplayName(user.name === "Anonymous" ? "" : user.name);
      setBio(user.bio || "");
      setAnonymous(user.anonymous || false);
      setIsSubscribed(user.isSubscribed);
    }
  }, [user]);

  const saveSettings = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ displayName, bio, anonymous, isSubscribed }),
      });
      if (r.ok) {
        const d = await r.json();
        updateUser(d.user);
        setSaveMsg("Saved.");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  // ── Interests ──────────────────────────────────────────────────────────────
  const [interests, setInterests] = useState<string[]>([]);
  const [interestSaving, setInterestSaving] = useState(false);
  const [interestMsg, setInterestMsg] = useState("");

  useEffect(() => { setInterests(user?.interests || []); }, [user?.interests]);

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const saveInterests = async () => {
    setInterestSaving(true);
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ interests }),
      });
      if (r.ok) {
        const d = await r.json();
        updateUser(d.user);
        setInterestMsg("Interests saved. Your newsletter will reflect these.");
      }
    } finally {
      setInterestSaving(false);
      setTimeout(() => setInterestMsg(""), 4000);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
    { id: "collections", label: "Collections", icon: FolderHeart },
    { id: "submissions", label: "Submissions", icon: BookOpen },
    { id: "interests", label: "Interests & Newsletter", icon: Tag },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 py-10 sm:py-14">

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-5 mb-10">
          <div className="relative flex-shrink-0">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-16 h-16 rounded-full border-2 border-white shadow-md object-cover"
            />
            {user.anonymous && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-stone-400 border-2 border-white flex items-center justify-center">
                <EyeOff className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-stone-900">{user.name}</h1>
              {user.anonymous && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">Anonymous</span>
              )}
            </div>
            <p className="text-sm text-stone-400">@{user.handle}</p>
            {user.bio && <p className="text-sm text-stone-600 mt-1">{user.bio}</p>}
            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-stone-400">
                <span className="font-semibold text-stone-600">{user.savedQuoteIds.length}</span> bookmarks
              </span>
              <span className="text-xs text-stone-400">
                <span className="font-semibold text-stone-600">{user.submittedQuoteIds.length}</span> submitted
              </span>
              <Link
                to={`/u/${user.handle}`}
                className="text-xs text-stone-400 hover:text-stone-700 flex items-center gap-1 transition-colors"
              >
                <Eye className="w-3 h-3" /> View public profile
              </Link>
            </div>
          </div>
        </div>

        {/* ── Tab nav ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 h-9 px-4 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                tab === id
                  ? "bg-stone-900 text-white"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="flex items-center gap-2 h-9 px-4 rounded-full text-xs font-medium text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>

        {/* ── Bookmarks ────────────────────────────────────────────────────── */}
        {tab === "bookmarks" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-stone-700">
                Saved quotes <span className="font-normal text-stone-400 ml-1">({bookmarks.length})</span>
              </h2>
            </div>
            {bookmarksLoading ? (
              <div className="grid sm:grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-32 bg-stone-100 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="text-center py-20">
                <Bookmark className="w-8 h-8 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No bookmarks yet.</p>
                <p className="text-stone-300 text-xs mt-1">Hit the bookmark icon on any quote to save it here.</p>
                <Link to="/explore" className="inline-flex items-center gap-1.5 mt-5 h-9 px-5 rounded-full text-xs font-semibold text-white transition-all" style={{ background: BRAND }}>
                  <Sparkles className="w-3.5 h-3.5" /> Explore quotes
                </Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {bookmarks.map(q => (
                  <BookmarkCard
                    key={q.id}
                    quote={q}
                    onRemove={(id) => setBookmarks(prev => prev.filter(b => b.id !== id))}
                    collections={collections}
                    onToggleCollection={toggleQuoteInCollection}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Collections ──────────────────────────────────────────────────── */}
        {tab === "collections" && (
          <div className="max-w-3xl">
            <div className="mb-6 space-y-1">
              <h2 className="text-sm font-bold text-stone-700">Collections</h2>
              <p className="text-xs text-stone-400">Organise your bookmarks into named folders. Folders are stored locally on this device.</p>
            </div>

            {/* Create folder */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-4 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> New collection
              </h3>
              <form onSubmit={createCollection} className="space-y-3">
                <input
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  placeholder="Collection name"
                  maxLength={50}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                />
                <input
                  value={newColDesc}
                  onChange={e => setNewColDesc(e.target.value)}
                  placeholder="Short description (optional)"
                  maxLength={100}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!newColName.trim()}
                  className="h-9 px-5 rounded-full text-xs font-bold text-white transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: BRAND }}
                >
                  <Plus className="w-3.5 h-3.5" /> Create
                </button>
              </form>
            </div>

            {/* Hint */}
            {collections.length > 0 && (
              <p className="text-xs text-stone-400 mb-5 flex items-center gap-1.5">
                <FolderHeart className="w-3.5 h-3.5 flex-shrink-0" />
                To add or move quotes, go to <button onClick={() => setTab("bookmarks")} className="underline hover:text-stone-600 transition-colors">Bookmarks</button> and use the <FolderHeart className="w-3 h-3 inline mx-0.5" /> icon on any card.
              </p>
            )}

            {/* Folder list */}
            {collections.length === 0 ? (
              <div className="text-center py-16">
                <FolderOpen className="w-8 h-8 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-400 text-sm">No collections yet.</p>
                <p className="text-stone-300 text-xs mt-1">Create one above, then add quotes via the folder icon on each bookmark.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {collections.map(col => {
                  const colQuotes = bookmarks.filter(q => col.quoteIds.includes(q.id));
                  const isOpen = expandedCol === col.id;
                  return (
                    <div key={col.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center gap-3 p-4">
                        <button
                          onClick={() => setExpandedCol(isOpen ? null : col.id)}
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        >
                          {isOpen
                            ? <FolderOpen className="w-4 h-4 text-stone-400 flex-shrink-0" />
                            : <Folder className="w-4 h-4 text-stone-400 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-800 truncate">{col.name}</p>
                            {col.description && <p className="text-[11px] text-stone-400 truncate">{col.description}</p>}
                          </div>
                          <span className="text-[10px] font-mono text-stone-400 flex-shrink-0 ml-2">
                            {colQuotes.length} quote{colQuotes.length !== 1 ? "s" : ""}
                          </span>
                        </button>
                        <button
                          onClick={() => { if (window.confirm(`Delete "${col.name}"?`)) deleteCollection(col.id); }}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                          title="Delete collection"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-stone-100 p-4">
                          {colQuotes.length === 0 ? (
                            <p className="text-xs text-stone-400 italic">
                              No quotes yet — go to Bookmarks and use the <FolderHeart className="w-3 h-3 inline mx-0.5" /> icon to add some.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {colQuotes.map(q => (
                                <div key={q.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-stone-50 transition-colors">
                                  <Link to={`/q/${q.slug}`} className="flex-1 min-w-0">
                                    <p className="text-xs font-serif italic text-stone-700 line-clamp-1">"{q.text}"</p>
                                    <p className="text-[10px] text-stone-400 mt-0.5">— {q.author}</p>
                                  </Link>
                                  <button
                                    onClick={() => toggleQuoteInCollection(col.id, q.id)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-stone-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                                    title="Remove from this collection"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Submissions ──────────────────────────────────────────────────── */}
        {tab === "submissions" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-stone-700">Your submitted quotes</h2>
            </div>
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${BRAND}14` }}>
                <Sparkles className="w-5 h-5" style={{ color: BRAND }} />
              </div>
              <p className="text-sm font-semibold text-stone-700">Submit your own quotes</p>
              <p className="text-stone-400 text-sm mt-1.5">Feature coming soon — you'll soon be able to submit quotes for the collection.</p>
            </div>
          </div>
        )}

        {/* ── Interests & Newsletter ────────────────────────────────────────── */}
        {tab === "interests" && (
          <div className="max-w-2xl">
            <div className="mb-6 space-y-1.5">
              <h2 className="text-sm font-bold text-stone-700">Interests & Newsletter</h2>
              <p className="text-xs text-stone-400 leading-relaxed">
                Choose the topics you care about. Your newsletter will be curated around these — only quotes and authors that match what you've selected.
              </p>
            </div>

            {/* Newsletter toggle */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${BRAND}18` }}>
                  {isSubscribed ? <Bell className="w-4 h-4" style={{ color: BRAND }} /> : <BellOff className="w-4 h-4 text-stone-400" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-800">Weekly newsletter</p>
                  <p className="text-[11px] text-stone-400">Personalised quotes based on your interests</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubscribed(s => !s)}
                className={`relative w-11 h-6 rounded-full transition-colors ${isSubscribed ? "bg-[#3D5A3E]" : "bg-stone-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isSubscribed ? "translate-x-5" : ""}`} />
              </button>
            </div>

            {/* Interest grid */}
            <div className="flex flex-wrap gap-2 mb-6">
              {ALL_INTERESTS.map(topic => (
                <button
                  key={topic}
                  onClick={() => toggleInterest(topic)}
                  className={`h-8 px-4 rounded-full text-xs font-medium border transition-all ${
                    interests.includes(topic)
                      ? "border-[#3D5A3E] text-[#3D5A3E] bg-[#3D5A3E]/8"
                      : "border-stone-200 text-stone-500 hover:border-stone-400"
                  }`}
                  style={interests.includes(topic) ? { backgroundColor: `${BRAND}12` } : {}}
                >
                  {interests.includes(topic) && <Check className="w-3 h-3 inline mr-1.5" />}
                  {topic}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveInterests}
                disabled={interestSaving}
                className="h-9 px-6 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-2"
                style={{ background: BRAND }}
              >
                {interestSaving ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {interestSaving ? "Saving…" : "Save interests"}
              </button>
              {interestMsg && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> {interestMsg}
                </p>
              )}
              <span className="text-xs text-stone-400 ml-auto">{interests.length} selected</span>
            </div>
          </div>
        )}

        {/* ── Settings ──────────────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="max-w-lg space-y-6">
            <h2 className="text-sm font-bold text-stone-700">Account settings</h2>

            {/* Display name */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Public identity</h3>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-600">Display name</label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name (visible on your public profile)"
                  maxLength={60}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-600">Bio <span className="text-stone-300 font-normal">(optional)</span></label>
                <textarea
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="A line about you — shown on your public profile"
                  maxLength={160}
                  rows={2}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white resize-none"
                />
                <p className="text-[10px] text-stone-300 text-right">{bio.length}/160</p>
              </div>

              {/* Anonymous toggle */}
              <div className="flex items-start justify-between gap-4 pt-1">
                <div>
                  <p className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                    Anonymous mode
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Your name and avatar are hidden on your public profile and collection. Your handle stays visible.
                  </p>
                </div>
                <button
                  onClick={() => setAnonymous(a => !a)}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors mt-0.5 ${anonymous ? "bg-stone-700" : "bg-stone-200"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${anonymous ? "translate-x-5" : ""}`} />
                </button>
              </div>
            </div>

            {/* Email info */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Account</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-600">Email address</p>
                  <p className="text-sm text-stone-800 mt-0.5">{user.email}</p>
                </div>
                <span className="text-[10px] bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">Private</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <div>
                  <p className="text-xs font-medium text-stone-600">Handle</p>
                  <p className="text-sm text-stone-500 mt-0.5">@{user.handle}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <div>
                  <p className="text-xs font-medium text-stone-600">Member since</p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {new Date(user.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="h-9 px-6 rounded-full text-xs font-bold text-white transition-colors flex items-center gap-2"
                style={{ background: BRAND }}
              >
                {saving ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveMsg && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> {saveMsg}
                </p>
              )}
            </div>

            {/* Danger zone */}
            <div className="border border-red-100 rounded-2xl p-5 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Danger zone
              </h3>
              <p className="text-xs text-stone-400">Deleting your account is permanent and cannot be undone. Your bookmarks and submissions will be removed.</p>
              <button
                onClick={() => { if (window.confirm("Are you sure? This cannot be undone.")) logout(); }}
                className="h-8 px-4 rounded-xl text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                Delete my account
              </button>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
