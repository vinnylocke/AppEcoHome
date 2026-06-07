import React from "react";
import SmartImage from "../SmartImage";
import ImageCredit from "./ImageCredit";
import type { ImageCredit as ImageCreditModel } from "../../lib/imageCredit";

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  credit: ImageCreditModel | null | undefined | unknown;
  /** Fallback image URL when the primary fails to load. */
  fallback?: string;
  /**  Where the credit badge sits. Overlay = absolutely positioned on the
   *   image; inline = below the image. */
  creditVariant?: "overlay" | "inline" | "badge-only";
  /** Wrapper className (the image gets the existing `className` prop). */
  wrapperClassName?: string;
}

// ─── CreditedImage ─────────────────────────────────────────────────────
//
// Standard image + credit badge. Replaces plain `<SmartImage>` callsites
// surface-by-surface. The wrapper is `relative` so the overlay badge can
// anchor to the bottom-right corner of the rendered image.

export default function CreditedImage({
  src,
  credit,
  fallback,
  creditVariant = "overlay",
  wrapperClassName,
  className,
  alt,
  ...imgProps
}: Props) {
  return (
    <div className={`relative inline-block w-full ${wrapperClassName ?? ""}`} data-testid="credited-image">
      <SmartImage src={src} fallback={fallback} alt={alt} className={className} {...imgProps} />
      {creditVariant === "overlay" && (
        <ImageCredit credit={credit} variant="overlay" />
      )}
      {creditVariant === "badge-only" && (
        <div className="absolute z-10 bottom-1.5 right-1.5">
          <ImageCredit credit={credit} variant="badge-only" />
        </div>
      )}
      {creditVariant === "inline" && (
        <div className="mt-1">
          <ImageCredit credit={credit} variant="inline" />
        </div>
      )}
    </div>
  );
}
