import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// Cloudflare Turnstile site key — set VITE_TURNSTILE_SITE_KEY to enable.
// Degrades gracefully: if unset, the widget renders nothing and the
// server skips verification (see verifyTurnstile in server.ts).
const SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    turnstile?: any;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Renders an invisible/managed Cloudflare Turnstile challenge and
 * returns the verification token to send alongside form submissions.
 * No-op (token always "") when VITE_TURNSTILE_SITE_KEY isn't configured.
 */
export function useTurnstile() {
  const [token, setToken] = useState("");
  const [loadTimeout, setLoadTimeout] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoadTimeout(true);
    }, 5000);
    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        size: "flexible",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
      clearTimeout(timeoutId);
    });
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
    setToken("");
  }, []);

  const Widget = useMemo(() => {
    return function TurnstileWidget() {
      if (!SITE_KEY) return null;
      return <div ref={containerRef} className="mt-1" />;
    };
  }, []);

  return { token, reset, Widget, enabled: !!SITE_KEY && !loadTimeout };
}
