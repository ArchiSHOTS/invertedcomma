import { useEffect, useState, type ReactNode } from "react";
import {
  FileSearch, RefreshCw, Check, X, Save, Eye, EyeOff, Sparkles,
} from "lucide-react";
import { useUser } from "../context/UserContext";
import { AnatomySectionKey, AnatomySection } from "../types";
import { refreshAnatomyIds } from "../hooks/useAnatomyIds";

const BRAND = "#3D5A3E";
const TOKEN_KEY = "ic_token";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ""}`,
});

const SECTION_ORDER: AnatomySectionKey[] = [
  "context", "makers", "discussions", "relevance", "evolution", "further_reading",
];
const SECTION_TITLES: Record<AnatomySectionKey, string> = {
  context:         "Context",
  makers:          "Makers & Origin",
  discussions:     "Scholarly Discussions",
  relevance:       "Modern Relevance",
  evolution:       "Evolution",
  further_reading: "Further Reading",
};

type Sections = Partial<Record<AnatomySectionKey, AnatomySection>>;

// Lightweight prose renderer: blank-line paragraphs, "- "/"•" runs become bullet lists.
function renderProse(body: string) {
  const blocks = body.trim().split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    const isList = lines.every(l => /^\s*[-•]\s+/.test(l));
    if (isList) {
      return (
        <ul key={bi} className="list-disc pl-5 space-y-1 text-stone-700 text-sm leading-relaxed">
          {lines.map((l, li) => <li key={li}>{l.replace(/^\s*[-•]\s+/, "")}</li>)}
        </ul>
      );
    }
    return <p key={bi} className="text-stone-700 text-sm leading-relaxed">{block}</p>;
  });
}

function SectionShell({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-5 space-y-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
        {String(index + 1).padStart(2, "0")} · {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function QuoteAnatomy({ quoteId }: { quoteId: string; slug?: string }) {
  const { user } = useUser();
  const canEdit = user?.role === "admin" || user?.role === "moderator";

  const [loading, setLoading]   = useState(true);
  const [exists, setExists]     = useState(false);   // an anatomy row exists (admin view)
  const [topEnabled, setTopEnabled] = useState(true);
  const [sections, setSections] = useState<Sections>({});

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [regenKey, setRegenKey]     = useState<AnatomySectionKey | null>(null);
  const [preview, setPreview]       = useState<{ key: AnatomySectionKey; body: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = canEdit
      ? `/api/admin/quotes/${quoteId}/anatomy`
      : `/api/quotes/${quoteId}/anatomy`;
    const opts = canEdit ? { headers: authHeaders() } : undefined;
    fetch(url, opts)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        if (canEdit) {
          setExists(!!d.exists);
          setTopEnabled(d.exists ? !!d.enabled : true);
          setSections(d.sections || {});
        } else {
          setTopEnabled(!!d.enabled);
          setSections(d.sections || {});
          setExists(!!d.enabled);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [quoteId, canEdit]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/anatomy/generate`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) { alert("Anatomy generation failed — please try again."); return; }
      const d = await res.json();
      setSections(d.sections || {});
      setTopEnabled(true);
      setExists(true);
      refreshAnatomyIds();
    } finally { setGenerating(false); }
  };

  const regenerate = async (key: AnatomySectionKey) => {
    setRegenKey(key);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/anatomy/regenerate-section`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ section: key }),
      });
      if (!res.ok) { alert("Regeneration failed — please try again."); return; }
      const d = await res.json();
      setPreview({ key, body: d.body || "" });
    } finally { setRegenKey(null); }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: topEnabled,
        sections: Object.fromEntries(
          SECTION_ORDER.map(k => [k, {
            body: sections[k]?.body ?? "",
            enabled: sections[k]?.enabled ?? false,
          }])
        ),
      };
      const res = await fetch(`/api/admin/quotes/${quoteId}/anatomy`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        alert(`Save failed (HTTP ${res.status}). ${detail.slice(0, 200)}`);
        return;
      }
      setExists(true);
      refreshAnatomyIds();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert("Save failed — network error. " + (err?.message ?? ""));
    } finally { setSaving(false); }
  };

  const setBody    = (k: AnatomySectionKey, body: string) =>
    setSections(p => ({ ...p, [k]: { body, enabled: p[k]?.enabled ?? true } }));
  const setEnabled = (k: AnatomySectionKey, enabled: boolean) =>
    setSections(p => ({ ...p, [k]: { body: p[k]?.body ?? "", enabled } }));

  if (loading) return null;

  // ── Visitor / non-editor: read-only, only when an enabled anatomy exists ──
  if (!canEdit) {
    if (!topEnabled) return null;
    const visible = SECTION_ORDER.filter(k => sections[k]?.body?.trim());
    if (!visible.length) return null;
    return (
      <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${BRAND}18` }}>
              <FileSearch className="w-3.5 h-3.5" style={{ color: BRAND }} />
            </div>
            <h2 className="text-sm font-semibold text-stone-700">Anatomy of this quote</h2>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">
            AI generated
          </span>
        </div>
        <div className="divide-y divide-stone-100">
          {visible.map((k, i) => (
            <div key={k}>
              <SectionShell index={i} title={SECTION_TITLES[k]}>
                {renderProse(sections[k]!.body)}
              </SectionShell>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Admin / moderator: editor ──
  return (
    <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${BRAND}18` }}>
            <FileSearch className="w-3.5 h-3.5" style={{ color: BRAND }} />
          </div>
          <h2 className="text-sm font-semibold text-stone-700">Anatomy</h2>
          <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-400 px-2 py-0.5 rounded-full">
            Admin
          </span>
        </div>
        {exists && (
          <button
            onClick={() => setTopEnabled(v => !v)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              topEnabled ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-stone-300 text-stone-500 bg-stone-50"
            }`}
            title="Show or hide the whole anatomy from visitors"
          >
            {topEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {topEnabled ? "Visible" : "Hidden"}
          </button>
        )}
      </div>

      {!exists ? (
        <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-stone-500">No anatomy yet for this quote.</p>
          <button
            onClick={generate} disabled={generating}
            className="flex items-center gap-2 h-10 px-5 bg-stone-900 text-white text-xs font-bold rounded-xl disabled:opacity-50"
          >
            {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? "Drafting all six sections…" : "Create Anatomy"}
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-stone-100">
            {SECTION_ORDER.map((k, i) => {
              const sec = sections[k];
              const sectionEnabled = sec?.enabled ?? false;
              return (
                <div key={k} className="px-6 py-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">
                      {String(i + 1).padStart(2, "0")} · {SECTION_TITLES[k]}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => regenerate(k)} disabled={regenKey === k}
                        className="flex items-center gap-1 text-[10px] font-semibold text-stone-500 hover:text-stone-800 border border-stone-200 rounded-full px-2 py-0.5 disabled:opacity-50"
                        title="Regenerate this section with AI"
                      >
                        <RefreshCw className={`w-3 h-3 ${regenKey === k ? "animate-spin" : ""}`} />
                        {regenKey === k ? "…" : "Regenerate"}
                      </button>
                      <button
                        onClick={() => setEnabled(k, !sectionEnabled)}
                        className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                          sectionEnabled ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-stone-300 text-stone-400 bg-stone-50"
                        }`}
                        title="Show or hide this section"
                      >
                        {sectionEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {sectionEnabled ? "On" : "Off"}
                      </button>
                    </div>
                  </div>

                  {preview && preview.key === k ? (
                    <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">New draft — review before accepting</p>
                      <textarea
                        value={preview.body} onChange={e => setPreview({ key: k, body: e.target.value })}
                        rows={6}
                        className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-y bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setBody(k, preview.body); setPreview(null); }}
                          className="flex items-center gap-1 h-8 px-3 bg-stone-900 text-white text-[11px] font-bold rounded-lg"
                        >
                          <Check className="w-3 h-3" /> Accept
                        </button>
                        <button
                          onClick={() => setPreview(null)}
                          className="flex items-center gap-1 h-8 px-3 border border-stone-200 text-stone-600 text-[11px] font-semibold rounded-lg"
                        >
                          <X className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <textarea
                      value={sec?.body ?? ""} onChange={e => setBody(k, e.target.value)}
                      rows={5} placeholder={`Write the ${SECTION_TITLES[k]} section…`}
                      className={`w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-y ${
                        sectionEnabled ? "" : "opacity-60"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 flex items-center justify-end gap-3 px-6 py-3 border-t border-stone-100 bg-white/95 backdrop-blur">
            {saved && (
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={saveAll} disabled={saving}
              className="flex items-center gap-2 h-9 px-5 bg-stone-900 text-white text-xs font-bold rounded-xl disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save All"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
