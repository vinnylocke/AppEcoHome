// Field-guide detail as a MODAL — the plants-parity surface for the ailment
// search takeover (hub search-first overhaul Stage 2, 2026-07-21): tapping a
// result row opens this, exactly as tapping a plant result opens
// PlantDetailModal. Renders the shared AilmentDetailBody at z-[100] (above
// the z-[60] search overlay). The host passes the watch state + handler (it
// already owns the watchlist add flow); favourites, the "could affect" plant
// names, and Ask-AI wiring are self-contained here.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { favouriteLibraryAilment, type LibraryAilment } from "../../services/ailmentLibraryService";
import { listFavouriteAilments, unfavouriteAilment } from "../../services/favouritesService";
import type { FavouriteAilment } from "../../types";
import { usePlantDoctor } from "../../context/PlantDoctorContext";
import { usePersona } from "../../hooks/usePersona";
import { supabase } from "../../lib/supabase";
import AilmentDetailBody from "./AilmentDetailBody";

interface Props {
  ailment: LibraryAilment;
  homeId: string;
  aiEnabled: boolean;
  /** Host-owned watchlist state + add flow (mirrors the row's + button). */
  watching: boolean;
  watchingBusy: boolean;
  canWatch: boolean;
  onWatch: () => void;
  onClose: () => void;
}

export default function AilmentDetailModal({
  ailment,
  homeId,
  aiEnabled,
  watching,
  watchingBusy,
  canWatch,
  onWatch,
  onClose,
}: Props) {
  const { setPageContext, setIsOpen: setChatOpen } = usePlantDoctor();
  const persona = usePersona();
  const isNewGardener = persona !== "experienced";

  const [favRowId, setFavRowId] = useState<string | null>(null);
  const [favBusy, setFavBusy] = useState(false);
  const [plantNames, setPlantNames] = useState<string[]>([]);

  useEffect(() => {
    // ♥ fill state — resolve whether this library entry is already favourited.
    listFavouriteAilments()
      .then((rows: FavouriteAilment[]) => {
        const hit = rows.find(
          (f) => (f as { ailment_library_id?: number | null }).ailment_library_id === ailment.id,
        );
        setFavRowId(hit ? ((hit as { id?: string }).id ?? null) : null);
      })
      .catch(() => {/* favourites are an enhancement — detail still works */});

    // "Could affect your garden" — the home's active plant names.
    supabase
      .from("plants")
      .select("common_name, is_archived")
      .eq("home_id", homeId)
      .then(({ data }) => {
        setPlantNames(
          (data ?? [])
            .filter((p) => !p.is_archived && p.common_name)
            .map((p) => p.common_name as string),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ailment.id, homeId]);

  // Own Escape — closes just this layer. The search overlay's guard ignores
  // Escape while we're open (defaultPrevented).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavourite = async () => {
    setFavBusy(true);
    try {
      if (favRowId) {
        await unfavouriteAilment(favRowId);
        setFavRowId(null);
      } else {
        const row = await favouriteLibraryAilment(ailment, homeId);
        setFavRowId((row as { id: string }).id);
        toast.success(`"${ailment.name}" saved to your favourites.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update favourites.");
    } finally {
      setFavBusy(false);
    }
  };

  const askAi = () => {
    setPageContext({
      action: "Asking about an ailment from the library",
      ailment: {
        name: ailment.name,
        scientific_name: ailment.scientific_name,
        type: ailment.kind,
        description: ailment.description,
        symptoms: ailment.symptoms,
        treatment: ailment.treatment,
        prevention: ailment.prevention,
      },
    });
    setChatOpen(true);
  };

  // Portaled — same PullToRefresh residual-transform trap as the overlays.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-rhozly-bg overflow-y-auto custom-scrollbar overscroll-contain animate-in fade-in duration-200"
      data-testid="ailment-detail-modal"
    >
      <div
        className="max-w-3xl mx-auto w-full px-4 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <button
          onClick={onClose}
          data-testid="ailment-detail-modal-close"
          aria-label="Back to search"
          className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface-variant can-hover:hover:text-rhozly-on-surface mb-4 min-h-[44px] active:scale-[0.97] transition"
        >
          <ArrowLeft size={15} /> Back to search
        </button>
        <AilmentDetailBody
          ailment={ailment}
          watching={watching}
          watchingBusy={watchingBusy}
          canWatch={canWatch}
          onWatch={onWatch}
          favRowId={favRowId}
          favBusy={favBusy}
          onToggleFavourite={toggleFavourite}
          aiEnabled={aiEnabled}
          onAskAi={askAi}
          isNewGardener={isNewGardener}
          plantNames={plantNames}
        />
      </div>
    </div>,
    document.body,
  );
}
