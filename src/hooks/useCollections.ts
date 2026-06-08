import { useState, useEffect } from "react";
import { CustomCollection } from "../types";

const KEY = "ic_collections_v2";

function load(): CustomCollection[] {
  try {
    const v2 = localStorage.getItem(KEY);
    if (v2) return JSON.parse(v2);
    // One-time migration from old key (filter out hardcoded demo entries)
    const old = localStorage.getItem("ic_collections");
    if (old) {
      const parsed: CustomCollection[] = JSON.parse(old);
      const real = parsed.filter(c => !c.id.startsWith("col_default_"));
      localStorage.setItem(KEY, JSON.stringify(real));
      return real;
    }
  } catch {}
  return [];
}

/**
 * Shared collections state backed by ic_collections_v2.
 * Use on every page that renders QuoteCard so folder membership is consistent.
 */
export function useCollections() {
  const [collections, setCollections] = useState<CustomCollection[]>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(collections));
  }, [collections]);

  const addToCollection = (colId: string, quoteId: string) =>
    setCollections(cols =>
      cols.map(c =>
        c.id === colId && !c.quoteIds.includes(quoteId)
          ? { ...c, quoteIds: [...c.quoteIds, quoteId] }
          : c
      )
    );

  const removeFromCollection = (colId: string, quoteId: string) =>
    setCollections(cols =>
      cols.map(c =>
        c.id === colId ? { ...c, quoteIds: c.quoteIds.filter(id => id !== quoteId) } : c
      )
    );

  return { collections, setCollections, addToCollection, removeFromCollection };
}
