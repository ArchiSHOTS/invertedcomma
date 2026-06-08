import React, { useState } from "react";
import { FolderHeart, Plus, Copy, Check, Download, Bookmark, Trash, BookOpen, Sparkles } from "lucide-react";
import { Quote, CustomCollection } from "../types";

interface ReadingListManagerProps {
  quotes: Quote[];
  savedQuoteIds: string[];
  setSavedQuoteIds: (ids: string[]) => void;
  collections: CustomCollection[];
  setCollections: (cols: CustomCollection[]) => void;
  onRemoveFavorite: (id: string) => void;
  onRemoveFromCollection: (colId: string, quoteId: string) => void;
}

export default function ReadingListManager({
  quotes,
  savedQuoteIds,
  setSavedQuoteIds,
  collections,
  setCollections,
  onRemoveFavorite,
  onRemoveFromCollection,
}: ReadingListManagerProps) {
  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [copiedExport, setCopiedExport] = useState(false);

  const savedQuotes = quotes.filter((q) => savedQuoteIds.includes(q.id));

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newCol: CustomCollection = {
      id: `col_${Date.now()}`,
      name: newColName.trim(),
      description: newColDesc.trim() || undefined,
      quoteIds: [],
    };

    setCollections([...collections, newCol]);
    setNewColName("");
    setNewColDesc("");
  };

  const handleDeleteCollection = (id: string) => {
    setCollections(collections.filter((c) => c.id !== id));
  };

  // Generate tag-based organized export text
  const generateTagBasedExportText = () => {
    // Collect all quotes that are saved or part of any collection
    const allCollectedQuoteIds = Array.from(
      new Set([...savedQuoteIds, ...collections.flatMap((c) => c.quoteIds)])
    );

    const collectedQuotes = quotes.filter((q) => allCollectedQuoteIds.includes(q.id));

    if (collectedQuotes.length === 0) {
      return "No quotes selected for reading list yet. Browse and save some first!";
    }

    // Cluster by tags
    const clusters: Record<string, Quote[]> = {};
    collectedQuotes.forEach((q) => {
      q.tags.forEach((tag) => {
        if (!clusters[tag]) {
          clusters[tag] = [];
        }
        if (!clusters[tag].some((existing) => existing.id === q.id)) {
          clusters[tag].push(q);
        }
      });
    });

    let output = `# INVERTED COMMA reading list\n`;
    output += `*Organized by Tag-Based Architecture • Curated on ${new Date().toLocaleDateString()}*\n\n`;

    Object.entries(clusters)
      .sort((a, b) => b[1].length - a[1].length) // Sort tags with most quotes first
      .forEach(([tag, quotesList]) => {
        output += `## #${tag.toUpperCase()} (${quotesList.length})\n`;
        quotesList.forEach((q) => {
          output += `> “${q.text}”\n`;
          output += `> — ${q.author}\n\n`;
        });
        output += `***\n\n`;
      });

    return output;
  };

  const handleCopyExport = () => {
    const text = generateTagBasedExportText();
    navigator.clipboard.writeText(text);
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  };

  const handleDownloadExport = () => {
    const text = generateTagBasedExportText();
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "invertedcomma_reading_list.md");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      
      {/* Intro Block */}
      <div className="text-center space-y-2">
        <h2 className="font-serif italic text-3xl sm:text-4xl font-black text-[#1A1A1A] tracking-tight">Your Curated Workspace</h2>
        <p className="text-sm text-[#6B665E] font-sans max-w-xl mx-auto">
          Every favorited and bookmarked quote converges here. Build custom collections, challenge statements, and compile themed publications.
        </p>
      </div>

      <div className="grid md:grid-cols-12 gap-8">
        
        {/* Left Side: Create Folder & Collections */}
        <div className="md:col-span-12 lg:col-span-5 space-y-6">
          <div className="bg-[#F5F2ED] border border-[#E5E1D9] p-6 rounded-none space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#1A1A1A] flex items-center gap-2">
              <FolderHeart className="w-4 h-4 text-[#1A1A1A]" /> Make Custom Folder
            </h3>
            
            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9A948C] mb-1">Folder Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Architectural Beauty, Stoic Focus"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-white border border-[#E5E1D9] rounded-none px-3.5 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#9A948C] mb-1">Brief Description (Optional)</label>
                <textarea
                  placeholder="Define the dialectic guidelines for this focus pool..."
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  className="w-full bg-white border border-[#E5E1D9] rounded-none px-3.5 py-2 text-xs text-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A]"
                  rows={2}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#1A1A1A] text-white hover:bg-[#6B665E] font-bold uppercase tracking-[0.2em] text-xs py-3 rounded-none flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create Folder
              </button>
            </form>
          </div>

          {/* Active Collections List */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9A948C]">Your Folders ({collections.length})</h4>
            
            {collections.length === 0 ? (
              <p className="text-xs text-[#6B665E] italic">No custom folders created yet.</p>
            ) : (
              <div className="space-y-4">
                {collections.map((col) => {
                  const items = quotes.filter((q) => col.quoteIds.includes(q.id));
                  return (
                    <div key={col.id} className="bg-white border border-[#E5E1D9] p-5 rounded-none flex flex-col justify-between hover:border-[#1A1A1A] transition">
                      <div>
                        <div className="flex items-start justify-between">
                          <h5 className="font-serif font-bold text-[#1A1A1A] text-base flex items-center gap-1.5">
                            📁 <span>{col.name}</span>
                          </h5>
                          <button
                            onClick={() => handleDeleteCollection(col.id)}
                            className="p-1 rounded-full text-[#9A948C] hover:text-[#1a1a1a] hover:bg-[#E5E1D9] transition cursor-pointer"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {col.description && (
                          <p className="text-xs text-[#6B665E] mt-1 italic">{col.description}</p>
                        )}
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#F5F2ED] border border-[#E5E1D9] text-[#1A1A1A] px-2.5 py-0.5 rounded mt-3 inline-block">
                          {col.quoteIds.length} cards included
                        </span>
                      </div>

                      {items.length > 0 && (
                        <div className="mt-4 border-t border-[#E5E1D9] pt-3 space-y-2.5">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs gap-2">
                              <span className="font-serif italic truncate max-w-[200px] text-[#4A463F]">
                                “{it.text}”
                              </span>
                              <button
                                onClick={() => onRemoveFromCollection(col.id, it.id)}
                                className="text-[10px] font-mono text-red-650 hover:underline cursor-pointer flex-shrink-0"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Saved Items & Custom Exporter */}
        <div className="md:col-span-12 lg:col-span-7 space-y-6">
          
          {/* Tag based organization exporter */}
          <div className="bg-[#F5F2ED] border border-[#E5E1D9] p-6 rounded-none space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E1D9] pb-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#1A1A1A] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#1A1A1A]" /> Workspace Exporter
                </h3>
                <p className="text-xs text-[#6B665E] font-sans">
                  Instantly group collected ideas by tags and compile beautiful Markdown publications.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="bg-white border border-[#E5E1D9] text-[#1A1A1A] hover:bg-[#F0EEE9] font-mono text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedExport ? <Check className="w-3.5 h-3.5 text-[#1A1A1A]" /> : <Copy className="w-3.5 h-3.5 text-[#1A1A1A]" />}
                  <span>{copiedExport ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="bg-[#1A1A1A] text-white hover:bg-neutral-800 text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Simulated Live Preview of Organized Reading list */}
            <div className="bg-white border border-[#E5E1D9] p-4 font-mono text-[11px] text-[#4A463F] max-h-56 overflow-y-auto scrollbar-thin whitespace-pre-wrap leading-relaxed select-all">
              {generateTagBasedExportText()}
            </div>
          </div>

          {/* Bookmarks Manager */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9A948C]">
              Bookmarked Cards ({savedQuotes.length})
            </h4>

            {savedQuotes.length === 0 ? (
              <div className="text-center py-12 bg-white border border-[#E5E1D9]">
                <Bookmark className="w-6 h-6 text-[#9A948C] mx-auto mb-2" />
                <p className="text-xs text-[#6B665E] italic">Your bookmarked cards array is currently empty.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedQuotes.map((q) => (
                  <div key={q.id} className="bg-white border border-[#E5E1D9] p-5 rounded-none flex items-start gap-4 hover:border-[#1A1A1A] [&_button]:hover:opacity-100 transition duration-300">
                    <div className="flex-1 space-y-2">
                      <p className="font-serif italic text-[#1A1A1A] text-sm leading-relaxed">
                        “{q.text}”
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E1D9] pt-2 text-xs">
                        <span className="font-bold uppercase text-[11px] tracking-wider text-[#1A1A1A]">— {q.author}</span>
                        <div className="flex items-center space-x-1.5">
                          {q.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-[10px] font-mono text-[#9A948C]">
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onRemoveFavorite(q.id)}
                      className="text-[#9A948C] hover:text-[#1A1A1A] transition p-1 cursor-pointer"
                      title="Unbookmark"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
