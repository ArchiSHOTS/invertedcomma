import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { useUser } from "../../context/UserContext";
import Logo from "../../components/Logo";

const BRAND = "#3D5A3E";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: object) => void;
          renderButton: (el: HTMLElement, cfg: object) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { login, loginWithGoogle, isLoggedIn } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => { if (isLoggedIn) navigate(from, { replace: true }); }, [isLoggedIn]);

  // Load Google Identity Services
  useEffect(() => {
    const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }: { credential: string }) => {
          try {
            await loginWithGoogle(credential);
            navigate(from, { replace: true });
          } catch (e: any) {
            setError(e.message || "Google sign-in failed");
          }
        },
      });
      if (googleBtnRef.current) {
        window.google?.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard", theme: "outline", size: "large",
          text: "signin_with", shape: "pill", width: 340,
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <Link to="/" className="mb-8 hover:opacity-75 transition-opacity">
        <Logo size={32} />
      </Link>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-8">

        <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">Welcome back</h1>
        <p className="text-sm text-stone-400 mb-7">Sign in to your Inverted Comma account.</p>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">Email address</label>
            <input
              type="email" required autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-stone-600">Password</label>
              <Link to="/auth/forgot-password" className="text-xs text-stone-400 hover:text-stone-700 transition-colors">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"} required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm pr-11 focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit" disabled={loading}
            className="w-full h-11 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 mt-2"
            style={{ background: BRAND }}
          >
            <LogIn className="w-4 h-4" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-stone-200" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">or</span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>

        {/* Google button */}
        {(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ? (
          <div ref={googleBtnRef} className="flex justify-center" />
        ) : (
          <button
            disabled
            className="w-full h-11 rounded-full border border-stone-200 text-sm text-stone-400 flex items-center justify-center gap-2.5 cursor-not-allowed"
            title="Add VITE_GOOGLE_CLIENT_ID to .env to enable"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-stone-500">Continue with Google</span>
            <span className="text-[9px] bg-stone-100 px-1.5 py-0.5 rounded-full font-mono">setup needed</span>
          </button>
        )}

        {/* Sign up link */}
        <p className="text-center text-sm text-stone-400 mt-7">
          No account yet?{" "}
          <Link to="/auth/signup" className="font-semibold hover:underline" style={{ color: BRAND }}>
            Create one
          </Link>
        </p>
      </div>

      {/* Back to site */}
      <Link to="/" className="mt-6 text-xs text-stone-400 hover:text-stone-600 transition-colors">
        ← Back to Inverted Comma
      </Link>
    </div>
  );
}
