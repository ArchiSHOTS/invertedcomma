import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, UserPlus, Check, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { useUser } from "../../context/UserContext";
import Logo from "../../components/Logo";

const BRAND = "#3D5A3E";

// Interest topics — shown as selectable pills on step 2
const INTEREST_TOPICS = [
  { id: "philosophy",   label: "Philosophy" },
  { id: "science",      label: "Science" },
  { id: "literature",   label: "Literature" },
  { id: "history",      label: "History" },
  { id: "art",          label: "Art & Design" },
  { id: "technology",   label: "Technology" },
  { id: "business",     label: "Business" },
  { id: "psychology",   label: "Psychology" },
  { id: "nature",       label: "Nature" },
  { id: "music",        label: "Music" },
  { id: "politics",     label: "Politics" },
  { id: "film",         label: "Film" },
  { id: "mathematics",  label: "Mathematics" },
  { id: "spirituality", label: "Spirituality" },
  { id: "sports",       label: "Sports" },
];

function PasswordStrength({ password }: { password: string }) {
  const len   = password.length >= 8;
  const upper = /[A-Z]/.test(password);
  const num   = /[0-9]/.test(password);
  const score = [len, upper, num].filter(Boolean).length;
  const label = ["", "Weak", "Fair", "Strong"][score];
  const color = ["", "#EF4444", "#F59E0B", BRAND][score];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1,2,3].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all"
            style={{ background: i <= score ? color : "#E7E5E4" }} />
        ))}
      </div>
      <p className="text-[10px] font-mono" style={{ color }}>{label}</p>
    </div>
  );
}

export default function SignupPage() {
  const { register, isLoggedIn } = useUser();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showPw, setShowPw]           = useState(false);

  // Step 2 fields
  const [interests, setInterests] = useState<string[]>([]);

  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isLoggedIn) navigate("/", { replace: true }); }, [isLoggedIn]);

  const validateStep1 = () => {
    if (!displayName.trim()) return "Please enter your display name.";
    if (!email.includes("@")) return "Please enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirmPw) return "Passwords don't match.";
    return "";
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError("");
    setStep(2);
  };

  const toggleInterest = (id: string) =>
    setInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleSubmit = async (skip = false) => {
    setError("");
    setLoading(true);
    try {
      await register({ displayName: displayName.trim(), email: email.toLowerCase(), password, interests: skip ? [] : interests });
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "Sign up failed");
      setStep(1);
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

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${step >= s ? "text-white" : "border border-stone-300 text-stone-400"}`}
                style={step >= s ? { background: BRAND } : {}}>
                {step > s ? <Check className="w-3 h-3" /> : s}
              </div>
              {s < 2 && <div className="flex-1 h-px w-12 bg-stone-200" />}
            </div>
          ))}
          <span className="ml-auto text-[10px] font-mono text-stone-400">Step {step} of 2</span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-5 text-sm text-rose-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ── Step 1: Credentials ───────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">Create account</h1>
            <p className="text-sm text-stone-400 mb-7">Join the conversation.</p>

            <form onSubmit={handleStep1} className="space-y-4">
              {/* Display name */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Display name</label>
                <input type="text" required value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="How you'll appear in discussions"
                  className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Email address</label>
                <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm pr-11 focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5">Confirm password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} required value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-stone-200 rounded-full px-4 py-2.5 text-sm pr-11 focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/20 focus:border-[#3D5A3E]/50 transition-all"
                  />
                  {confirmPw && (
                    <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${password === confirmPw ? "text-emerald-500" : "text-rose-400"}`}>
                      {password === confirmPw ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </span>
                  )}
                </div>
              </div>

              <button type="submit"
                className="w-full h-11 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 mt-2"
                style={{ background: BRAND }}
              >
                Next — Pick your interests
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <p className="text-center text-sm text-stone-400 mt-7">
              Already have an account?{" "}
              <Link to="/auth/login" className="font-semibold hover:underline" style={{ color: BRAND }}>
                Sign in
              </Link>
            </p>
          </>
        )}

        {/* ── Step 2: Interests ─────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <button onClick={() => setStep(1)} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors mb-5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <h1 className="font-serif italic font-bold text-2xl text-stone-800 mb-1">What moves you?</h1>
            <p className="text-sm text-stone-400 mb-6">Pick topics you love — we'll personalise your feed. You can always change these later.</p>

            <div className="flex flex-wrap gap-2 mb-7">
              {INTEREST_TOPICS.map(({ id, label }) => {
                const active = interests.includes(id);
                return (
                  <button key={id} type="button" onClick={() => toggleInterest(id)}
                    className={`h-9 px-4 rounded-full text-xs font-medium border transition-all ${active ? "text-white border-transparent" : "border-stone-200 text-stone-500 hover:border-stone-400"}`}
                    style={active ? { background: BRAND, borderColor: BRAND } : {}}
                  >
                    {active && <Check className="w-3 h-3 inline mr-1" />}
                    {label}
                  </button>
                );
              })}
            </div>

            {interests.length > 0 && (
              <p className="text-xs text-stone-400 mb-5 font-mono">
                {interests.length} topic{interests.length !== 1 ? "s" : ""} selected
              </p>
            )}

            <button onClick={() => handleSubmit(false)} disabled={loading}
              className="w-full h-11 rounded-full text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: BRAND }}
            >
              <UserPlus className="w-4 h-4" />
              {loading ? "Creating account…" : "Create my account"}
            </button>

            <button onClick={() => handleSubmit(true)} disabled={loading}
              className="w-full h-10 mt-2 rounded-full text-sm text-stone-400 hover:text-stone-600 transition-colors">
              Skip for now
            </button>
          </>
        )}
      </div>

      <Link to="/" className="mt-6 text-xs text-stone-400 hover:text-stone-600 transition-colors">
        ← Back to Inverted Comma
      </Link>
    </div>
  );
}
