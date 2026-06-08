import { LayoutGrid, Layers, BookOpen } from "lucide-react";

interface BottomNavProps {
  activeView: "deck" | "grid" | "collections";
  setActiveView: (view: "deck" | "grid" | "collections") => void;
  savedCount: number;
}

const TABS = [
  {
    key: "deck" as const,
    label: "Discover",
    Icon: Layers,
  },
  {
    key: "grid" as const,
    label: "Browse",
    Icon: LayoutGrid,
  },
  {
    key: "collections" as const,
    label: "Library",
    Icon: BookOpen,
  },
];

export default function BottomNav({ activeView, setActiveView, savedCount }: BottomNavProps) {
  return (
    <>
      {/* Bottom bar — visible on mobile, hidden on md+ */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#FBF9F6]/96 backdrop-blur-md border-t border-[#E5E1D9] safe-area-bottom">
        <div className="flex items-stretch">
          {TABS.map(({ key, label, Icon }) => {
            const isActive = activeView === key;
            const hasBadge = key === "collections" && savedCount > 0;
            return (
              <button
                key={key}
                onClick={() => setActiveView(key)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[60px] transition-colors ${
                  isActive ? "text-[#1A1A1A]" : "text-[#9A948C]"
                }`}
                aria-label={label}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                  {hasBadge && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {savedCount > 9 ? "9+" : savedCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
                  {label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 h-0.5 w-8 bg-[#1A1A1A] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop tab bar — hidden on mobile, visible on md+ */}
      <div className="hidden md:flex items-center justify-center gap-1 bg-[#F5F2ED] border border-[#E5E1D9] rounded-full p-1 mx-auto w-fit mb-6 mt-2">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = activeView === key;
          const hasBadge = key === "collections" && savedCount > 0;
          return (
            <button
              key={key}
              onClick={() => setActiveView(key)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[#1A1A1A] text-white font-bold"
                  : "text-[#6B665E] hover:text-[#1A1A1A]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="uppercase tracking-wider">{label}</span>
              {hasBadge && (
                <span className="w-4 h-4 bg-orange-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {savedCount > 9 ? "9+" : savedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
