import { Search, X } from "lucide-react";
import UserBadge from "./UserBadge";
import Logo from "./Logo";

interface FilterHeaderProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  tagsWithCounts: { name: string; count: number }[];
  activeView: "deck" | "grid" | "collections";
  setActiveView: (view: "deck" | "grid" | "collections") => void;
  savedCount: number;
}

export default function FilterHeader({
  searchTerm,
  setSearchTerm,
  selectedTag,
  setSelectedTag,
  tagsWithCounts,
}: FilterHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-[#FBF9F6]/95 backdrop-blur-md border-b border-[#E5E1D9]">
      <div className="max-w-5xl mx-auto">

        {/* Brand + Search row */}
        <div className="flex items-center gap-3 px-4 py-3 md:px-8">
          {/* Logo */}
          <a
            href="/"
            className="flex-shrink-0 hover:opacity-70 transition"
            aria-label="invertedcomma home"
          >
            {/* Mobile: icon only. Desktop: full wordmark */}
            <Logo size={36} iconOnly className="block md:hidden" />
            <Logo size={36} className="hidden md:block" />
          </a>

          {/* Search — full width on mobile */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A948C] pointer-events-none" />
            <input
              type="search"
              inputMode="search"
              placeholder="Search quotes, authors, topics…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#F0EEE9] border-none rounded-full pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 text-[#1A1A1A] placeholder-[#9A948C]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A948C] hover:text-[#1A1A1A]"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* User badge — right side */}
          <UserBadge />
        </div>

        {/* Horizontal tag strip */}
        <div className="relative overflow-x-auto scrollbar-none flex items-center gap-2 px-4 md:px-8 pb-3 select-none">
          {/* All pill */}
          <button
            onClick={() => setSelectedTag(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
              selectedTag === null
                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                : "bg-white text-[#6B665E] border-[#E5E1D9] hover:bg-[#F5F2ED]"
            }`}
          >
            All
          </button>

          {/* Active tag pill with × */}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#1A1A1A] text-white border border-[#1A1A1A]"
            >
              <span>#{selectedTag}</span>
              <X className="w-3 h-3" />
            </button>
          )}

          {tagsWithCounts
            .filter((tc) => tc.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((tc) => {
              const isSelected = selectedTag === tc.name;
              if (isSelected) return null; // Already shown above
              return (
                <button
                  key={tc.name}
                  onClick={() => setSelectedTag(tc.name)}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-[#E5E1D9] bg-white text-[#6B665E] hover:bg-[#F5F2ED] transition-colors duration-200"
                >
                  <span>#{tc.name}</span>
                  <span className="text-[10px] text-[#B0A99F]">{tc.count}</span>
                </button>
              );
            })}
        </div>
      </div>
    </header>
  );
}
