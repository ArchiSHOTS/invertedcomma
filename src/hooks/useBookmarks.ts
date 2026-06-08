import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

export function useBookmarks() {
  const { user, isLoggedIn, updateUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [savedIds, setSavedIds] = useState<string[]>(() => {
    if (isLoggedIn && user?.savedQuoteIds) return user.savedQuoteIds;
    try { return JSON.parse(localStorage.getItem("ic_saved_ids") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (isLoggedIn && user?.savedQuoteIds) {
      setSavedIds(user.savedQuoteIds);
    }
  }, [isLoggedIn, user?.savedQuoteIds]);

  const toggle = async (id: string) => {
    if (!isLoggedIn) {
      navigate(`/auth/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }

    const next = savedIds.includes(id) ? savedIds.filter(i => i !== id) : [...savedIds, id];
    setSavedIds(next);

    try {
      const r = await fetch(`/api/quotes/${id}/bookmark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("ic_token") ?? ""}`,
        },
      });
      if (r.ok) {
        const d = await r.json();
        setSavedIds(d.savedQuoteIds);
        localStorage.setItem("ic_saved_ids", JSON.stringify(d.savedQuoteIds));
        updateUser({ savedQuoteIds: d.savedQuoteIds });
      }
    } catch {}
  };

  return { savedIds, toggle };
}
