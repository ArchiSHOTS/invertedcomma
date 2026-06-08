import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, LogOut, ShieldCheck, ChevronDown, User, Settings } from "lucide-react";
import { useUser } from "../context/UserContext";

export default function UserBadge() {
  const { user, isLoggedIn, isAdmin, logout } = useUser();
  const [open, setOpen] = useState(false);

  if (!isLoggedIn) {
    return (
      <Link
        to="/auth/login"
        className="flex items-center gap-1.5 h-9 px-3 border border-[#E5E1D9] rounded-full text-xs font-medium text-[#6B665E] hover:bg-[#F5F2ED] transition-colors"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-9 pl-1 pr-3 border border-[#E5E1D9] rounded-full hover:bg-[#F5F2ED] transition-colors"
      >
        <img
          src={user!.avatar}
          alt={user!.name}
          className="w-7 h-7 rounded-full border border-[#E5E1D9] object-cover"
        />
        <span className="text-xs font-medium text-[#1A1A1A] hidden sm:block max-w-[80px] truncate">
          @{user!.handle}
        </span>
        {isAdmin && <ShieldCheck className="w-3 h-3 text-rose-600 flex-shrink-0" />}
        <ChevronDown className="w-3 h-3 text-[#9A948C] flex-shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#E5E1D9] rounded-xl shadow-xl p-2 z-20 space-y-1">
            <div className="px-2.5 py-2 border-b border-[#E5E1D9]">
              <p className="text-xs font-bold text-[#1A1A1A]">{user!.name}</p>
              <p className="text-[10px] text-[#9A948C]">@{user!.handle}</p>
            </div>

            <Link
              to="/me"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F5F2ED] text-xs text-[#1A1A1A] transition-colors"
            >
              <User className="w-3.5 h-3.5 text-stone-400" />
              My dashboard
            </Link>

            <Link
              to={`/u/${user!.handle}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F5F2ED] text-xs text-[#1A1A1A] transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-stone-400" />
              Public profile
            </Link>

            {isAdmin && (
              <Link
                to="/control"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F5F2ED] text-xs text-[#1A1A1A] transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                Control panel
              </Link>
            )}

            <div className="border-t border-[#E5E1D9] mt-1 pt-1">
              <button
                onClick={() => { logout(); setOpen(false); }}
                className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F5F2ED] text-xs text-[#6B665E] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
