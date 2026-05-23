import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertTriangle, HelpCircle, ExternalLink } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import ManualPlantCreation from "../ManualPlantCreation";
import type { PlantLibraryRow } from "../../services/plantLibraryAdminService";

interface Props {
  row: PlantLibraryRow;
  onClose: () => void;
}

/**
 * Portal modal that renders a `plant_library` row as a populated care
 * guide. Wraps the existing `ManualPlantCreation` component in
 * read-only mode — same care fields + chips PlantSearchModal renders
 * in its preview pane, no transform layer needed.
 *
 * Adds an admin-only header strip showing the row's verification
 * status (matched / amended / unverified / default-passed) and any
 * cited `sources` so admins can spot-check data quality alongside the
 * care info.
 */
export default function PlantLibraryCareGuideModal({ row, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sciName = row.scientific_name?.[0] ?? null;
  const heroImage = row.image_url || row.thumbnail_url || null;
  const hasSources = Array.isArray(row.sources) && row.sources.length > 0;

  return createPortal(
    <div
      data-testid="plant-library-care-guide-modal"
      className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-3xl bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Hero header — image + name + close */}
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start gap-4 border-b border-rhozly-outline/10">
          {heroImage && (
            <img
              src={heroImage}
              alt={row.common_name}
              loading="lazy"
              className="shrink-0 w-20 h-20 rounded-2xl object-cover bg-rhozly-surface-low border border-rhozly-outline/15"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              Library plant · #{row.id}
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-xl leading-tight">
              {row.common_name}
            </h2>
            {sciName && (
              <p className="text-xs text-rhozly-on-surface/55 italic">
                {sciName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        {/* Admin-only header strip — verification status + sources. Sits
            above the care guide proper so spot-checking quality is
            one-glance. Hidden when the row has no admin-relevant state. */}
        <AdminMetaStrip row={row} hasSources={hasSources} />

        {/* Body — the actual care guide. `ManualPlantCreation` in
            read-only mode renders description, chips, and every care
            field already; the plant_library row maps onto its
            `initialData` shape directly. */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 sm:px-5 py-4">
            <ManualPlantCreation initialData={row} isReadOnly={true} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AdminMetaStrip({
  row,
  hasSources,
}: {
  row: PlantLibraryRow;
  hasSources: boolean;
}) {
  const validChip =
    row.valid === true
      ? {
          tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
          icon: <CheckCircle2 size={11} />,
          label: "Matched",
        }
      : row.valid === false
      ? {
          tone: "bg-amber-50 text-amber-800 border-amber-100",
          icon: <AlertTriangle size={11} />,
          label: "Amended",
        }
      : {
          tone: "bg-rhozly-surface-low text-rhozly-on-surface/55 border-rhozly-outline/20",
          icon: <HelpCircle size={11} />,
          label: "Unverified",
        };

  return (
    <div className="shrink-0 px-5 py-2.5 bg-rhozly-surface-low/40 border-b border-rhozly-outline/10 flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${validChip.tone}`}
      >
        {validChip.icon}
        {validChip.label}
      </span>
      {row.verification_attempts > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-100">
          {row.verification_attempts} verify {row.verification_attempts === 1 ? "attempt" : "attempts"}
        </span>
      )}
      {hasSources && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
          Sources:
          {row.sources!.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-rhozly-primary hover:underline"
            >
              {s.source}
              <ExternalLink size={9} />
            </a>
          ))}
        </span>
      )}
    </div>
  );
}
