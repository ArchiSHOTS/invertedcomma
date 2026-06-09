import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "./Logo";
import UserBadge from "./UserBadge";
import VerifyEmailBanner from "./VerifyEmailBanner";

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
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

          <UserBadge />
        </div>
      </div>
    </header>
   </>
  );
}
