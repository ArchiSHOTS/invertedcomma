import { useState } from "react";
import { MailWarning, X, Check } from "lucide-react";
import { useUser } from "../context/UserContext";

const TOKEN_KEY = "ic_token";

/**
 * Slim notice shown to logged-in users whose email isn't verified yet.
 * Lets them resend the verification email. Dismissible for the session.
 */
export default function VerifyEmailBanner() {
  const { user, isLoggedIn } = useUser();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  if (!isLoggedIn || !user || user.emailVerified || dismissed) return null;

  const resend = async () => {
    if (state === "sending") return;
    setState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}`,
        },
      });
      setState("sent");
    } catch {
      setState("idle");
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-2 flex items-center gap-3 text-xs sm:text-sm">
        <MailWarning className="w-4 h-4 flex-shrink-0 text-amber-600" />
        <p className="flex-1 min-w-0">
          Please verify your email{user.email ? <> (<span className="font-medium">{user.email}</span>)</> : null} to unlock everything.
        </p>
        {state === "sent" ? (
          <span className="flex items-center gap-1 text-emerald-700 font-medium flex-shrink-0">
            <Check className="w-3.5 h-3.5" /> Email sent
          </span>
        ) : (
          <button
            onClick={resend}
            disabled={state === "sending"}
            className="flex-shrink-0 font-semibold underline underline-offset-2 hover:text-amber-700 disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Resend email"}
          </button>
        )}
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex-shrink-0 text-amber-500 hover:text-amber-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
