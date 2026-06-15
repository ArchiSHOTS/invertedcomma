import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import Logo from "./Logo";
import UserBadge from "./UserBadge";
import VerifyEmailBanner from "./VerifyEmailBanner";

const SEARCH_WORDS = ["quotes", "authors", "themes", "topics", "movies", "speeches"];

function HeaderSearch({ scrolled }: { scrolled: boolean }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % SEARCH_WORDS.length);
        setAnimating(false);
      }, 400);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const submit = (e: import("react").FormEvent) => {
    e.preventDefault();
    if (term.trim()) navigate(`/explore?search=${encodeURIComponent(term.trim())}`);
  };

  return (
    <form
      onSubmit={submit}
      className={`relative hidden md:flex items-center bg-white/70 border border-stone-200 rounded-full transition-all duration-300 ${
        scrolled ? "h-8 w-44" : "h-9 w-56"
      } focus-within:ring-2 focus-within:ring-[#3D5A3E]/20 focus-within:border-[#3D5A3E]/40`}
    >
      <Search className="absolute left-3 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full h-full bg-transparent rounded-full pl-8 pr-3 text-xs text-stone-800 placeholder-transparent focus:outline-none"
        aria-label="Search quotes, authors, themes, topics"
      />
      {!term && (
        <div className="pointer-events-none absolute left-8 right-3 flex items-center gap-1 text-xs text-stone-400 overflow-hidden">
          <span className="flex-shrink-0">Search</span>
          <span className="relative h-4 flex-1 overflow-hidden">
            <span
              key={wordIndex}
              className={`absolute left-0 top-0 whitespace-nowrap font-bold italic text-[#3D5A3E] ${animating ? "word-cycle-out" : "word-cycle-in"}`}
            >
              {SEARCH_WORDS[wordIndex]}…
            </span>
          </span>
        </div>
      )}
    </form>
  );
}

// Mobile inline search — expands within the header instead of routing to /explore
function MobileSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setTerm("");
  }, [open]);

  if (!open) return null;

  const submit = (e: import("react").FormEvent) => {
    e.preventDefault();
    if (term.trim()) {
      navigate(`/explore?search=${encodeURIComponent(term.trim())}`);
      onClose();
    }
  };

  return (
    <form onSubmit={submit} className="md:hidden flex items-center gap-2 w-full">
      <div className="relative flex-1 flex items-center bg-white/70 border border-stone-200 rounded-full h-9 focus-within:ring-2 focus-within:ring-[#3D5A3E]/20 focus-within:border-[#3D5A3E]/40">
        <Search className="absolute left-3 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search quotes, authors, topics…"
          className="w-full h-full bg-transparent rounded-full pl-8 pr-3 text-xs text-stone-800 placeholder-stone-400 focus:outline-none"
          aria-label="Search quotes, authors, topics"
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </form>
  );
}

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 72);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
   <>
    <VerifyEmailBanner />
    {/* pointer-events-none on the outer header so the transparent gap
       around the floating pill doesn't block page clicks */}
    <header className="sticky top-0 z-50 pointer-events-none">
      <div
        className={`pointer-events-auto transition-all duration-300 ease-out ${
          scrolled
            /* floating pill: centered, ~42rem wide, fully rounded */
            ? "mx-auto w-[min(calc(100%-2.5rem),42rem)] mt-3 rounded-full shadow-xl shadow-black/10 bg-[#FBF9F6]/96 border border-[#E8E4DD] backdrop-blur-xl"
            /* flush bar: full width, straight edges */
            : "w-full rounded-none shadow-none bg-[#FBF9F6]/95 border-b border-[#E8E4DD] backdrop-blur-md"
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-300 ${
            scrolled ? "px-5 md:px-7" : "px-5 md:px-8 max-w-6xl mx-auto"
          }`}
          style={{ height: scrolled ? "3.25rem" : "4rem" }}
        >
          {mobileSearchOpen ? (
            <MobileSearch open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />
          ) : (
          <>
          <Link to="/" className="hover:opacity-75 transition-opacity flex-shrink-0">
            <Logo size={scrolled ? 26 : 32} iconOnly className="block md:hidden" />
            <Logo size={scrolled ? 22 : 28} className="hidden md:block" />
          </Link>

          {/* Centre nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/"
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                pathname === "/" ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              Home
            </Link>
            <Link
              to="/explore"
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                pathname === "/explore" ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              Explore
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <HeaderSearch scrolled={scrolled} />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
            <UserBadge />
          </div>
          </>
          )}
        </div>
      </div>
    </header>
   </>
  );
}
