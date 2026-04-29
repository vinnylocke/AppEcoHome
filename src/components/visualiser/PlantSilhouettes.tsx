export const SILHOUETTE_TYPES = ["shrub", "tree", "grass", "climber", "succulent", "herb"] as const;
export type SilhouetteType = (typeof SILHOUETTE_TYPES)[number];

export const SILHOUETTE_LABELS: Record<SilhouetteType, string> = {
  shrub: "Shrub",
  tree: "Tree",
  grass: "Grass / Ground Cover",
  climber: "Climber / Vine",
  succulent: "Succulent",
  herb: "Herb / Small Bush",
};

const SILHOUETTE_SVG: Record<SilhouetteType, string> = {
  shrub: `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="72" rx="42" ry="38" fill="#3d7a4e"/>
  <ellipse cx="22" cy="85" rx="30" ry="27" fill="#4a8f5e"/>
  <ellipse cx="78" cy="85" rx="30" ry="27" fill="#4a8f5e"/>
  <ellipse cx="50" cy="58" rx="34" ry="30" fill="#5ba36e"/>
  <rect x="45" y="106" width="10" height="22" rx="4" fill="#7a5230"/>
</svg>`,

  tree: `<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="55" rx="42" ry="46" fill="#3d7a4e"/>
  <ellipse cx="50" cy="40" rx="34" ry="34" fill="#5ba36e"/>
  <rect x="42" y="96" width="16" height="48" rx="6" fill="#7a5230"/>
</svg>`,

  grass: `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 112 C49 88 43 62 36 22" stroke="#3d7a4e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M50 112 C51 84 57 56 64 18" stroke="#4a8f5e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M50 112 C46 90 38 68 25 38" stroke="#5ba36e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M50 112 C54 90 62 68 75 38" stroke="#5ba36e" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M50 112 C47 92 41 74 32 52" stroke="#4a8f5e" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M50 112 C53 92 59 74 68 52" stroke="#4a8f5e" stroke-width="4" stroke-linecap="round" fill="none"/>
  <ellipse cx="50" cy="112" rx="30" ry="6" fill="#3d7a4e" opacity="0.4"/>
</svg>`,

  climber: `<svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg">
  <rect x="48" y="8" width="4" height="146" rx="2" fill="#7a5230"/>
  <rect x="18" y="38" width="64" height="4" rx="2" fill="#7a5230"/>
  <rect x="18" y="80" width="64" height="4" rx="2" fill="#7a5230"/>
  <rect x="18" y="122" width="64" height="4" rx="2" fill="#7a5230"/>
  <ellipse cx="32" cy="30" rx="14" ry="10" fill="#4a8f5e" transform="rotate(-35 32 30)"/>
  <ellipse cx="68" cy="52" rx="14" ry="10" fill="#3d7a4e" transform="rotate(35 68 52)"/>
  <ellipse cx="28" cy="72" rx="14" ry="10" fill="#5ba36e" transform="rotate(-25 28 72)"/>
  <ellipse cx="72" cy="96" rx="14" ry="10" fill="#4a8f5e" transform="rotate(25 72 96)"/>
  <ellipse cx="30" cy="115" rx="14" ry="10" fill="#3d7a4e" transform="rotate(-35 30 115)"/>
  <ellipse cx="70" cy="136" rx="14" ry="10" fill="#5ba36e" transform="rotate(35 70 136)"/>
</svg>`,

  succulent: `<svg viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="18" rx="11" ry="22" fill="#4a8f5e"/>
  <ellipse cx="71" cy="28" rx="11" ry="22" fill="#3d7a4e" transform="rotate(60 71 28)"/>
  <ellipse cx="71" cy="58" rx="11" ry="22" fill="#5ba36e" transform="rotate(120 71 58)"/>
  <ellipse cx="50" cy="68" rx="11" ry="22" fill="#4a8f5e" transform="rotate(180 50 68)"/>
  <ellipse cx="29" cy="58" rx="11" ry="22" fill="#3d7a4e" transform="rotate(240 29 58)"/>
  <ellipse cx="29" cy="28" rx="11" ry="22" fill="#5ba36e" transform="rotate(300 29 28)"/>
  <ellipse cx="50" cy="30" rx="7" ry="14" fill="#6dbf7e" transform="rotate(30 50 30)"/>
  <ellipse cx="62" cy="43" rx="7" ry="14" fill="#5ba36e" transform="rotate(90 62 43)"/>
  <ellipse cx="62" cy="57" rx="7" ry="14" fill="#4a8f5e" transform="rotate(150 62 57)"/>
  <ellipse cx="50" cy="63" rx="7" ry="14" fill="#6dbf7e" transform="rotate(210 50 63)"/>
  <ellipse cx="38" cy="57" rx="7" ry="14" fill="#5ba36e" transform="rotate(270 38 57)"/>
  <ellipse cx="38" cy="43" rx="7" ry="14" fill="#4a8f5e" transform="rotate(330 38 43)"/>
  <circle cx="50" cy="44" r="10" fill="#6dbf7e"/>
  <circle cx="50" cy="44" r="5" fill="#9fe8b0"/>
</svg>`,

  herb: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="62" rx="40" ry="28" fill="#4a8f5e"/>
  <ellipse cx="28" cy="68" rx="26" ry="22" fill="#5ba36e"/>
  <ellipse cx="72" cy="68" rx="26" ry="22" fill="#5ba36e"/>
  <ellipse cx="50" cy="50" rx="30" ry="24" fill="#6dbf7e"/>
  <ellipse cx="34" cy="56" rx="20" ry="18" fill="#5ba36e"/>
  <ellipse cx="66" cy="56" rx="20" ry="18" fill="#5ba36e"/>
  <ellipse cx="50" cy="42" rx="22" ry="16" fill="#7dd98f"/>
  <rect x="46" y="84" width="8" height="14" rx="3" fill="#7a5230"/>
</svg>`,
};

export function getSilhouetteDataUrl(type: SilhouetteType): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SILHOUETTE_SVG[type])}`;
}

export async function silhouetteToPngBlob(type: SilhouetteType): Promise<Blob> {
  const dataUrl = getSilhouetteDataUrl(type);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 560;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, 400, 560);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/png",
      );
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = dataUrl;
  });
}

export function PlantSilhouettePreview({
  type,
  className = "",
}: {
  type: SilhouetteType;
  className?: string;
}) {
  return (
    <img
      src={getSilhouetteDataUrl(type)}
      alt={SILHOUETTE_LABELS[type]}
      className={className}
    />
  );
}
