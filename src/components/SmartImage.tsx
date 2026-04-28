import React, { useState, useEffect } from "react";
import { Sprout } from "lucide-react";

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallback?: string;
}

export default function SmartImage({
  src,
  fallback,
  ...props
}: SmartImageProps) {
  const [cachedSrc, setCachedSrc] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    setCachedSrc(null);

    async function loadImage() {
      // 1. Check if we have this image in the 'plant-image-cache'
      const cache = await caches.open("rhozly-image-cache");
      const cachedResponse = await cache.match(src);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        setCachedSrc(URL.createObjectURL(blob));
        return;
      }

      // 2. If not in cache, fetch it manually
      try {
        const response = await fetch(src);
        const clonedResponse = response.clone();
        const blob = await response.blob();

        // 3. Store it in the Cache API permanently
        await cache.put(src, clonedResponse);

        setCachedSrc(URL.createObjectURL(blob));
      } catch (error) {
        console.error("Image load failed", error);
        if (fallback) {
          setCachedSrc(fallback);
        } else {
          setErrored(true);
        }
      }
    }

    if (src) loadImage();
  }, [src, fallback]);

  if (errored) {
    return (
      <div className="w-full h-full bg-rhozly-surface-low flex items-center justify-center">
        <Sprout className="w-8 h-8 text-rhozly-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!cachedSrc) {
    return (
      <div className="w-full h-full bg-rhozly-surface-low animate-pulse" />
    );
  }

  return (
    <img
      src={cachedSrc}
      {...props}
      onError={() => setErrored(true)}
    />
  );
}
