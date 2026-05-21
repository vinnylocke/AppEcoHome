import React from "react";
import { Routes, Route, useLocation, useNavigate, Navigate } from "react-router-dom";
import { Search, Bookmark, BookOpen, ArrowLeft } from "lucide-react";
import LibrarySearchTab from "./LibrarySearchTab";
import LibrarySavedTab from "./LibrarySavedTab";
import PlantPreview from "./PlantPreview";

interface Props {
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
}

type Tab = "search" | "saved";

/**
 * The Library — top-level page shell.
 *
 * Hosts the Search / Saved tab toggle and nests:
 *   /library/search       → LibrarySearchTab
 *   /library/saved        → LibrarySavedTab
 *   /library/plant/:id    → PlantPreview (tabs hidden — preview owns the
 *                           screen).
 *
 * Mounted under the same focus-mode shell as `/quick/*`.
 */
export default function LibraryHome({ homeId, aiEnabled, isPremium }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide the tab toggle while inside a preview — that screen has its own
  // back-to-search header and the toggle would be redundant.
  const onPreview = /^\/library\/plant\//.test(location.pathname);
  const activeTab: Tab =
    location.pathname.startsWith("/library/saved") ? "saved" : "search";

  return (
    <div
      data-testid="library-home"
      style={{ paddingTop: "calc(5rem + env(safe-area-inset-top, 0px))" }}
      className="min-h-full w-full max-w-2xl mx-auto px-4 sm:px-6 pb-8"
    >
      {!onPreview && (
        <>
          {/* Back-to-Quick link — small pill sat above the header so users
              can return to the Quick Access home without using the device
              back button or the menu drawer. */}
          <button
            type="button"
            data-testid="library-back-to-quick"
            onClick={() => navigate("/quick")}
            className="inline-flex items-center gap-1.5 mb-3 px-3 py-1.5 min-h-[36px] rounded-full bg-white border border-rhozly-outline/15 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/60 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition"
          >
            <ArrowLeft size={12} />
            Quick Menu
          </button>

          {/* Header — wordmark + sub */}
          <header data-testid="library-header" className="mb-5">
            <div className="inline-flex items-center gap-1.5 bg-white/70 backdrop-blur-sm text-rhozly-primary px-3 py-1 rounded-full mb-2.5 border border-rhozly-primary/15">
              <BookOpen size={11} strokeWidth={2.5} />
              <span className="text-[11px] font-black uppercase tracking-widest">
                The Library
              </span>
            </div>
            <h1 className="font-display font-black text-2xl sm:text-3xl text-rhozly-on-surface tracking-tight leading-tight">
              Look up any plant.
            </h1>
            <p className="text-sm text-rhozly-on-surface/65 mt-1.5 leading-relaxed max-w-md">
              Search the plant database, browse a complete care guide, and save the ones you want to your Shed.
            </p>
          </header>

          {/* Tab toggle */}
          <nav
            data-testid="library-tab-toggle"
            className="flex items-center bg-white rounded-2xl border border-rhozly-outline/15 p-1 mb-4"
          >
            <button
              type="button"
              data-testid="library-tab-search"
              aria-pressed={activeTab === "search"}
              onClick={() => navigate("/library/search")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black uppercase tracking-widest transition ${
                activeTab === "search"
                  ? "bg-rhozly-primary text-white shadow-sm"
                  : "text-rhozly-on-surface/55 hover:text-rhozly-primary"
              }`}
            >
              <Search size={13} />
              Search
            </button>
            <button
              type="button"
              data-testid="library-tab-saved"
              aria-pressed={activeTab === "saved"}
              onClick={() => navigate("/library/saved")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-black uppercase tracking-widest transition ${
                activeTab === "saved"
                  ? "bg-rhozly-primary text-white shadow-sm"
                  : "text-rhozly-on-surface/55 hover:text-rhozly-primary"
              }`}
            >
              <Bookmark size={13} />
              Saved
            </button>
          </nav>
        </>
      )}

      <Routes>
        <Route index element={<Navigate to="search" replace />} />
        <Route
          path="search"
          element={<LibrarySearchTab homeId={homeId} aiEnabled={aiEnabled} />}
        />
        <Route
          path="saved"
          element={<LibrarySavedTab homeId={homeId} />}
        />
        {/* `plant/:plantId` handles both real catalogue ids and the
            sentinel `preview` value (passed by the instant-open flow with
            the search result in location.state). A separate static route
            for `plant/preview` would shadow this and useParams would not
            carry plantId at all — keep one route. */}
        <Route
          path="plant/:plantId"
          element={
            <PlantPreview
              homeId={homeId}
              aiEnabled={aiEnabled}
              isPremium={isPremium}
            />
          }
        />
        <Route path="*" element={<Navigate to="search" replace />} />
      </Routes>
    </div>
  );
}
