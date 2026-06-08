import React, { useState, useEffect } from "react";
import { MessageSquare, Shield, User, Bot, Send, Sparkles, X } from "lucide-react";
import { Quote, Comment } from "../types";

interface DiscussionDrawerProps {
  quote: Quote;
  isOpen: boolean;
  onClose: () => void;
}

export default function DiscussionDrawer({ quote, isOpen, onClose }: DiscussionDrawerProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [aiCounterpoint, setAiCounterpoint] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<{ title: string; url: string }[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [username, setUsername] = useState("");
  const [isCounterpointToggle, setIsCounterpointToggle] = useState(false);
  const [isAdminToggle, setIsAdminToggle] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  useEffect(() => {
    if (isOpen && quote.id) {
      fetchDiscussions();
    }
  }, [isOpen, quote.id]);

  // Lock body scroll when open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const fetchDiscussions = async () => {
    setIsLoadingComments(true);
    try {
      const res = await fetch(`/api/discussions/${quote.id}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setAiCounterpoint(data.aiCounterpoint || null);
        setAiSources(data.aiSources || []);
      }
    } catch (err) {
      console.error("Error fetching discussions:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    const finalUsername = username.trim() || "anonymous";
    const avatar = `https://images.unsplash.com/photo-${getRandomUserId()}?auto=format&fit=crop&q=80&w=100`;

    try {
      const res = await fetch(`/api/discussions/${quote.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: finalUsername, avatar, text: newCommentText.trim(),
          isCounterpoint: isCounterpointToggle || isAdminToggle,
          isAdmin: isAdminToggle,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setNewCommentText("");
        setIsAdminToggle(false);
        setIsCounterpointToggle(false);
      }
    } catch (err) {
      console.error("Error posting comment:", err);
    }
  };

  const handleGenerateAiCounterpoint = async () => {
    setIsGeneratingAi(true);
    try {
      const res = await fetch(`/api/discussions/${quote.id}/ai-counterpoint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteText: quote.text, author: quote.author }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiCounterpoint(data.aiCounterpoint || null);
        setAiSources(data.sources || []);
      }
    } catch (err) {
      console.error("Error generating AI counterpoint:", err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const getRandomUserId = () => {
    const ids = [
      "1534528741775-53994a69daeb", "1507003211169-0a1dd7228f2d",
      "1492562080023-ab3db95bfbce", "1535713875002-d1d0cf377fde",
      "1570295999919-56ceb5ecca61", "1522075469751-3a6694fb2f61"
    ];
    return ids[Math.floor(Math.random() * ids.length)];
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/*
        Mobile: full-screen bottom sheet sliding up
        Desktop: side drawer from right
      */}
      <div
        className={`
          fixed z-50 bg-[#F5F2ED] flex flex-col shadow-2xl
          /* Mobile: bottom sheet, full width, max 92vh */
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[92dvh]
          /* Desktop (md+): side drawer, right-anchored */
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:rounded-none md:rounded-l-none md:max-h-none md:h-full md:w-full md:max-w-lg md:border-l md:border-[#E5E1D9]
        `}
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-[#D0CBC2] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E5E1D9] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-[#1A1A1A]" />
            <h3 className="font-serif italic font-bold text-[#1A1A1A] text-lg">Dialectic Critique</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-[#6B665E] hover:text-[#1A1A1A] hover:bg-[#E5E1D9] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 overscroll-contain">

          {/* Quote context */}
          <div className="bg-white border border-[#E5E1D9] p-4">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#9A948C]">Debating Statement</span>
            <p className="font-serif italic text-[#1A1A1A] text-base mt-1.5 mb-2 leading-snug">"{quote.text}"</p>
            <span className="font-sans text-[11px] font-bold text-[#1A1A1A]">— {quote.author}</span>
          </div>

          {/* AI Counterpoint */}
          <div className="bg-white border border-[#E5E1D9] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#1A1A1A]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#1A1A1A]">
                  Web Counterpoint
                </span>
              </div>
              <span className="bg-[#E5E1D9] text-[#1A1A1A] font-bold uppercase tracking-widest text-[8px] px-2 py-0.5 rounded">
                Search
              </span>
            </div>

            {aiCounterpoint ? (
              <div className="space-y-2">
                <p className="text-sm font-serif leading-relaxed text-[#4A463F] italic bg-[#FBF9F6] p-3 border border-[#E5E1D9]">
                  "{aiCounterpoint}"
                </p>
                <p className="text-[9px] text-[#9A948C] font-mono text-right">— THE DIALECTIC ENGINE</p>
                {aiSources.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-[#9A948C]">Sources</p>
                    <div className="flex flex-wrap gap-1">
                      {aiSources.map((s, i) => (
                        <a
                          key={i}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={s.title}
                          className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F5F2ED] hover:bg-[#E5E1D9] text-[9px] text-[#6B665E] transition-colors max-w-[180px] truncate"
                        >
                          <span className="truncate">{s.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-3 text-center space-y-3">
                <p className="text-xs text-[#6B665E]">Search the web for real critiques of this idea.</p>
                <button
                  type="button"
                  onClick={handleGenerateAiCounterpoint}
                  disabled={isGeneratingAi}
                  className="bg-[#1A1A1A] text-white hover:bg-neutral-800 font-bold uppercase tracking-[0.12em] text-xs px-5 py-2.5 inline-flex items-center gap-2 transition-colors disabled:opacity-60"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isGeneratingAi ? "Searching…" : "Find Counterpoint"}
                </button>
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-3">
            <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#9A948C]">
              Discussion ({comments.length})
            </h4>

            {isLoadingComments ? (
              <div className="space-y-2.5">
                <div className="h-12 bg-[#E5E1D9]/40 rounded animate-pulse" />
                <div className="h-8 bg-[#E5E1D9]/40 rounded animate-pulse w-3/4" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 bg-white border border-[#E5E1D9]">
                <p className="text-xs text-[#6B665E] italic">No discussions yet. Add your voice.</p>
              </div>
            ) : (
              <div className="space-y-4 divide-y divide-[#E5E1D9]">
                {comments.map((comment) => (
                  <div key={comment.id} className="pt-4 first:pt-0 flex gap-3 items-start">
                    <img
                      src={comment.avatar}
                      alt={comment.username}
                      className="w-7 h-7 rounded-full border border-[#E5E1D9] object-cover flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-[#1A1A1A] truncate">{comment.username}</span>
                        <div className="flex items-center gap-1 text-[9px] font-mono text-[#9A948C] flex-shrink-0">
                          <span>{comment.createdAt}</span>
                          {comment.isAdmin && (
                            <span className="bg-[#E5E1D9] text-[#1A1A1A] px-1 py-0.5 rounded text-[8px] font-bold uppercase flex items-center gap-0.5">
                              <Shield className="w-2 h-2" /> admin
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`text-xs text-[#4A463F] leading-relaxed ${comment.isCounterpoint ? "bg-white p-2.5 border border-[#E5E1D9] italic font-serif" : ""}`}>
                        {comment.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Comment form — pinned at bottom */}
        <form
          onSubmit={handlePostComment}
          className="p-4 border-t border-[#E5E1D9] bg-[#F5F2ED] space-y-2.5 flex-shrink-0"
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#9A948C]" />
              <input
                type="text"
                placeholder="Your handle…"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white border border-[#E5E1D9] pl-7 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] text-[#1A1A1A]"
              />
            </div>

            <label className="flex items-center gap-1.5 bg-white border border-[#E5E1D9] px-2.5 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAdminToggle}
                onChange={(e) => setIsAdminToggle(e.target.checked)}
                className="w-3 h-3 accent-[#1A1A1A]"
              />
              <Shield className="w-3 h-3 text-rose-600" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#6B665E]">Admin</span>
            </label>
          </div>

          <label className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-[#6B665E] cursor-pointer">
            <input
              type="checkbox"
              checked={isCounterpointToggle}
              onChange={(e) => setIsCounterpointToggle(e.target.checked)}
              className="w-3 h-3 accent-[#1A1A1A]"
            />
            Mark as counterpoint
          </label>

          <div className="relative">
            <textarea
              rows={2}
              placeholder="Add your voice to the critique…"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              className="w-full bg-white border border-[#E5E1D9] px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] text-[#1A1A1A] resize-none"
            />
            <button
              type="submit"
              className="absolute right-2 bottom-2.5 text-white bg-[#1A1A1A] hover:bg-neutral-700 p-1.5 rounded-full transition-colors"
              aria-label="Post comment"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
