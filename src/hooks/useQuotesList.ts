import { useState, useEffect, useCallback } from "react";
import type { Quote } from "../types";

export interface QuotesQueryParams {
  page?: number;
  limit?: number;
  tag?: string;
  category?: string;
  sourceType?: string;
  author?: string;
  search?: string;
  slim?: boolean;
}

export interface QuotesListResponse {
  quotes: Quote[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: QuotesListResponse; at: number }>();

export function buildQuotesQuery(params: QuotesQueryParams = {}): string {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.tag) q.set("tag", params.tag);
  if (params.category) q.set("category", params.category);
  if (params.sourceType) q.set("sourceType", params.sourceType);
  if (params.author) q.set("author", params.author);
  if (params.search) q.set("search", params.search);
  if (params.slim === false) q.set("slim", "0");
  const qs = q.toString();
  return qs ? `/api/quotes?${qs}` : "/api/quotes";
}

export async function fetchQuotesList(
  params: QuotesQueryParams = {},
  { force = false } = {}
): Promise<QuotesListResponse> {
  const url = buildQuotesQuery(params);
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load quotes (${res.status})`);
  const data = (await res.json()) as QuotesListResponse;
  cache.set(url, { data, at: Date.now() });
  return data;
}

export async function fetchQuotesFacets(): Promise<{
  sourceTypeCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  topTags: { name: string; count: number }[];
  total: number;
}> {
  const res = await fetch("/api/quotes/facets");
  if (!res.ok) throw new Error("Failed to load facets");
  return res.json();
}

export function useQuotesList(params: QuotesQueryParams = {}) {
  const [data, setData] = useState<QuotesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify(params);

  const reload = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchQuotesList(params, { force });
      setData(result);
    } catch (e: any) {
      setError(e?.message || "Failed to load quotes");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, quotes: data?.quotes ?? [], loading, error, reload };
}

let tagsCache: { tags: { name: string; count: number }[]; at: number } | null = null;

export async function fetchTagsIndex(): Promise<{ name: string; count: number }[]> {
  if (tagsCache && Date.now() - tagsCache.at < CACHE_TTL_MS) return tagsCache.tags;
  const res = await fetch("/api/tags");
  if (!res.ok) throw new Error("Failed to load tags");
  const data = await res.json();
  const tags = data.tags || [];
  tagsCache = { tags, at: Date.now() };
  return tags;
}

export function useTagsIndex() {
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTagsIndex()
      .then(setTags)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { tags, loading };
}
