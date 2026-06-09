import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useUser } from "../../context/UserContext";
import Logo from "../../components/Logo";

const BRAND = "#3D5A3E";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { updateUser } = useUser();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;        // guard React 18 StrictMode double-invoke
    ran.current = true;
    if (!token) { setStatus("error"); setMessage("This verification link is missing its token."); return; }

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed");
        updateUser({ emailVerified: true });
        setStatus("success");
        setMessage(data.alreadyVerified ? "Your email was already verified." : "Your email is verified.");
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message || "Verification failed");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-12">
      <Link to="/" className="mb-8 hover:opacity-75 transition-opacity">
        <Logo size={32} />
      </Link>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-stone-400" />
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">Verifying…</h1>
            <p className="text-sm text-stone-400">One moment while we confirm your email.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">You're all set</h1>
            <p className="text-sm text-stone-500 mb-6">{message}</p>
            <Link to="/explore" className="inline-block w-full h-11 leading-[44px] rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: BRAND }}>
              Start exploring
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-rose-50 mb-4">
              <AlertCircle className="w-7 h-7 text-rose-500" />
            </div>
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">Link didn't work</h1>
            <p className="text-sm text-stone-500 mb-6">{message}</p>
            <p className="text-xs text-stone-400">
              Verification links expire after 24 hours. Sign in and request a new one from the banner at the top of the site.
            </p>
            <Link to="/auth/login" className="inline-block mt-5 text-sm font-semibold hover:underline" style={{ color: BRAND }}>
              Go to sign in
            </Link>
          </>
        )}
      </div>

      <Link to="/" className="mt-6 text-xs text-stone-400 hover:text-stone-600 transition-colors">
        ← Back to Inverted Comma
      </Link>
    </div>
  );
}
