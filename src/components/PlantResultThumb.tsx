import React, { useEffect, useState } from "react";
import { Leaf, Sparkles } from "lucide-react";
import { isUsablePlantImageUrl, resolvePlantThumbUrl } from "../lib/plantThumb";
import ImageCredit from "./credit/ImageCredit";
import { coerceImageCredit, isKnownCredit, type ImageCredit as ImageCreditModel } from "../lib/imageCredit";

interface Props {
  name: string;
  /** Stored URL from the row/library/provider, if any. */
  url?: string | null;
  /** Drives the placeholder icon ("ai" → sparkles, else leaf). */
  source?: string;
  /** Placeholder icon size in px. */
  iconSize?: number;
  alt?: string;
  /** Wave 22.0003 — optional licence + attribution. When present and not
   *  unknown, a small badge-only credit pill anchors to the bottom-right
   *  of the thumbnail. When null/undefined, no badge renders so we don't
   *  decorate placeholder states. */
  credit?: ImageCreditModel | null | unknown;
}

/**
 * Self-resolving plant thumbnail. Shows the stored URL when usable; otherwise
 * — or when that URL fails to load — lazily resolves one by name via
 * `plant-image-search` (server-cached). Falls back to a leaf / sparkles
 * placeholder. Fills its parent (`w-full h-full`), so the parent controls
 * size + shape. This is the single place result/hero plant images resolve.
 *
 * Wave 22.0003 — when a `credit` prop is passed AND we're showing a real
 * image (not the resolving / placeholder states), a small badge-only credit
 * pill anchors to the bottom-right corner so users can tap through to the
 * source / licence.
 */
export default function PlantResultThumb({ name, url, source, iconSize = 18, alt, credit }: Props) {
  const storedOk = isUsablePlantImageUrl(url);
  const [src, setSrc] = useState<string | null>(storedOk ? url : null);
  const [needsResolve, setNeedsResolve] = useState(!storedOk);
  const [resolving, setResolving] = useState(false);

  // Reset when inputs change: prefer the stored URL, else flag for resolution.
  useEffect(() => {
    if (storedOk) {
      setSrc(url);
      setNeedsResolve(false);
    } else {
      setSrc(null);
      setNeedsResolve(true);
    }
  }, [name, url, storedOk]);

  // Resolve a fallback by name whenever needed (no usable stored URL, or the
  // stored URL errored). Shared + deduped via plant-image-search.
  useEffect(() => {
    if (!needsResolve) return;
    let cancelled = false;
    setResolving(true);
    resolvePlantThumbUrl(name)
      .then((resolved) => {
        if (!cancelled) {
          setSrc(resolved);
          setNeedsResolve(false);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsResolve, name]);

  if (src) {
    const normalisedCredit = coerceImageCredit(credit);
    const showBadge = isKnownCredit(normalisedCredit);
    return (
      <div className="relative w-full h-full">
        <img
          src={src}
          alt={alt ?? name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => {
            // Stored URL broke → resolve a fallback by name once. A resolved URL
            // that also breaks → drop to the placeholder.
            if (src === url) {
              setSrc(null);
              setNeedsResolve(true);
            } else {
              setSrc(null);
            }
          }}
        />
        {showBadge && (
          <div className="absolute bottom-1 right-1 z-[2]">
            <ImageCredit credit={normalisedCredit} variant="badge-only" />
          </div>
        )}
      </div>
    );
  }

  if (resolving) {
    return <div className="w-full h-full bg-rhozly-surface-low animate-pulse" />;
  }

  return source === "ai" ? <Sparkles size={iconSize} /> : <Leaf size={iconSize} />;
}
