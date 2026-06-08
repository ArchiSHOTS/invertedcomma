import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Bookmark, ExternalLink, Calendar, EyeOff } from "lucide-react";
import { Quote } from "../types";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";

const BRAND = "#3D5A3E";

interface PublicProfile {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  joinedAt: string;
  anonymous: boolean;
  savedQuoteIds: string[];
}

export default function UserProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/user/${handle}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/user/${handle}/quotes`).then(r => r.ok ? r.json() : { quotes: [] }),
    ]).then(([prof, q]) => {
      if (!prof) { setNotFound(true); }
      else { setProfile(prof); setQuotes(q.quotes || []); }
    }).finally(() => setLoading(false));
  }, [handle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#FAF8F5]">
        <SiteHeader />
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <p className="text-stone-400 text-sm">This profile doesn't exist.</p>
          <Link to="/" className="text-xs text-stone-400 hover:text-stone-700 mt-3 inline-block underline">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <SiteHeader />

      <main className="max-w-4xl mx-auto px-4 py-10 sm:py-14">

        {/* ── Profile header ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-5 mb-10">
          <div className="relative flex-shrink-0">
            <img
              src={profile.avatar}
              alt={profile.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-white shadow-md object-cover"
            />
            {profile.anonymous && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-stone-400 border-2 border-white flex items-center justify-center">
                <EyeOff className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-stone-900">{profile.name}</h1>
              {profile.anonymous && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">Anonymous</span>
              )}
            </div>
            <p className="text-sm text-stone-400 mt-0.5">@{profile.handle}</p>
            {profile.bio && (
              <p className="text-sm text-stone-600 mt-2 max-w-md">{profile.bio}</p>
            )}
            <div className="flex items-center gap-1.5 mt-3 text-xs text-stone-400">
              <Calendar className="w-3 h-3" />
              Joined {new Date(profile.joinedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              <span className="text-stone-300">·</span>
              <Bookmark className="w-3 h-3" />
              {profile.savedQuoteIds.length} bookmark{profile.savedQuoteIds.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* ── Collection ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-5">
            Collection · {quotes.length} quote{quotes.length !== 1 ? "s" : ""}
          </h2>

          {quotes.length === 0 ? (
            <div className="text-center py-20">
              <Bookmark className="w-8 h-8 text-stone-200 mx-auto mb-3" />
              <p className="text-stone-400 text-sm">No public bookmarks yet.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {quotes.map(q => (
                <div key={q.id} className="group bg-white border border-stone-200 rounded-2xl p-4 hover:border-stone-300 transition-colors">
                  <Link to={`/q/${q.slug}`} className="block">
                    <p className="font-serif italic text-stone-800 text-sm leading-relaxed line-clamp-3 group-hover:text-stone-600 transition-colors">
                      "{q.text}"
                    </p>
                    <div className="flex items-center justify-between mt-2.5">
                      <p className="text-xs font-semibold text-stone-500">
                        — {q.author}{q.year ? `, ${q.year}` : ""}
                      </p>
                      <span
                        className="w-6 h-6 rounded-full border border-stone-200 flex items-center justify-center text-stone-300 group-hover:border-stone-400 group-hover:text-stone-500 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                    {q.source && (
                      <p className="text-[11px] text-stone-400 italic mt-0.5">{q.source}</p>
                    )}
                  </Link>
                  {q.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-stone-100">
                      {q.tags.slice(0, 4).map(t => (
                        <Link
                          key={t}
                          to={`/tag/${t}`}
                          className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                          onClick={e => e.stopPropagation()}
                        >
                          #{t}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
