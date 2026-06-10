import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Logo from "../components/Logo";

const BRAND = "#3D5A3E";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setStatus("error"); setMessage("This unsubscribe link is missing its token."); return; }

    (async () => {
      try {
        const res = await fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not unsubscribe");
        setStatus("success");
        setMessage(`${data.email} has been unsubscribed from the newsletter.`);
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message || "Could not unsubscribe");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-12">
      <Link to="/" className="mb-8 hover:opacity-75 transition-opacity">
        <Logo size={32} />
      </Link>

      <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center">
        {status === "working" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-stone-400" />
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">One moment…</h1>
            <p className="text-sm text-stone-400">Processing your request.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">You're unsubscribed</h1>
            <p className="text-sm text-stone-500 mb-6">{message}</p>
            <p className="text-xs text-stone-400">
              Changed your mind? You can re-subscribe any time from the footer of any page.
            </p>
            <Link to="/" className="inline-block mt-5 text-sm font-semibold hover:underline" style={{ color: BRAND }}>
              Back to Inverted Comma
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
            <Link to="/" className="text-sm font-semibold hover:underline" style={{ color: BRAND }}>
              Back to Inverted Comma
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
