import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Send, Check, AlertCircle, ArrowLeft } from "lucide-react";
import Logo from "../../components/Logo";

const BRAND = "#3D5A3E";

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError]   = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) { setError("Please enter a valid email address."); return; }
    setError("");
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
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

        <Link to="/auth/login" className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>

        {status === "done" ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="font-serif italic font-bold text-xl text-stone-800 mb-2">Check your inbox</h1>
            <p className="text-sm text-stone-500 leading-relaxed mb-6">
              If <span className="font-medium text-stone-700">{email}</span> is registered, you'll receive a password reset link shortly.
            </p>
            <p className="text-xs text-stone-400 mb-6">Didn't receive it? Check your spam folder, or try again.</p>
            <button onClick={() => setStatus("idle")} className="text-sm font-medium hover:underline" style={{ color: BRAND }}>
              Try a different email
            </button>
          </div>
        ) : (
          /* Form state */
          <>
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">Forgot password?</h1>
            <p className="text-sm text-stone-400 mb-7">
              Enter the email address associated with your account and we'll send you a reset link.
            </p>

            {error && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {status === "error" && !error && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 text-sm text-rose-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Something went wrong. Please try again.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Email address</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email"
                  className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
                />
              </div>

              <button type="submit" disabled={status === "loading"}
                className="w-full h-11 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: BRAND }}
              >
                <Send className="w-4 h-4" />
                {status === "loading" ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="text-center text-sm text-stone-400 mt-7">
              Remembered it?{" "}
              <Link to="/auth/login" className="font-semibold hover:underline" style={{ color: BRAND }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>

      <Link to="/" className="mt-6 text-xs text-stone-400 hover:text-stone-600 transition-colors">
        ← Back to Inverted Comma
      </Link>
    </div>
  );
}
