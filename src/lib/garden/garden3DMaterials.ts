// Procedurally generated three.js textures + material factory used by the 3D
// garden scene. Keeping everything in one module avoids loading remote PNGs and
// keeps the bundle small.

import * as THREE from "three";

/** Cache textures so we don't regenerate them on every render. */
const TEXTURE_CACHE: Record<string, THREE.CanvasTexture> = {};

function makeNoiseTexture(
  cacheKey: string,
  size: number,
  baseColor: [number, number, number],
  colorJitter: number,
  detail: number,
  repeat: number,
): THREE.CanvasTexture {
  if (TEXTURE_CACHE[cacheKey]) return TEXTURE_CACHE[cacheKey];
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!canvas) throw new Error("garden3DMaterials requires a browser environment");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Base colour fill
  ctx.fillStyle = `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`;
  ctx.fillRect(0, 0, size, size);

  // Sprinkle noise dots in subtly different shades
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < detail; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const idx = (y * size + x) * 4;
    const j = (Math.random() - 0.5) * colorJitter * 2;
    data[idx]     = Math.max(0, Math.min(255, baseColor[0] + j));
    data[idx + 1] = Math.max(0, Math.min(255, baseColor[1] + j));
    data[idx + 2] = Math.max(0, Math.min(255, baseColor[2] + j));
  }
  ctx.putImageData(imageData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEXTURE_CACHE[cacheKey] = tex;
  return tex;
}

export function getGrassTexture(canvasWidthM: number, canvasHeightM: number): THREE.CanvasTexture {
  const repeat = Math.max(canvasWidthM, canvasHeightM) / 2; // ~0.5m per tile
  // Cache per canvas size bucket to avoid endless regeneration
  const bucket = Math.round(repeat);
  return makeNoiseTexture(
    `grass-${bucket}`,
    128,
    [105, 145, 90],   // base meadow green
    35,                // colour jitter range
    9000,              // detail count
    bucket,
  );
}

export function getSoilTexture(): THREE.CanvasTexture {
  return makeNoiseTexture("soil", 128, [90, 60, 40], 25, 6000, 1);
}

export function getStoneTexture(): THREE.CanvasTexture {
  return makeNoiseTexture("stone", 128, [165, 158, 150], 28, 7000, 1);
}

export function getWoodTexture(): THREE.CanvasTexture {
  return makeNoiseTexture("wood", 128, [120, 80, 45], 30, 5000, 1);
}

export type Preset = string | null;

/** Return a three.js material configured for the given preset. */
export function getMaterialForPreset(preset: Preset, fallbackColor: string, isSelected: boolean): THREE.Material {
  const selectedEmissive = isSelected ? new THREE.Color("#3b82f6") : new THREE.Color("#000000");
  const emissiveIntensity = isSelected ? 0.25 : 0;

  switch (preset) {
    case "raised-bed":
    case "planter-box":
    case "oval-bed":
    case "round-planter":
      // Soil-filled bed — rich brown
      return new THREE.MeshStandardMaterial({
        map: getSoilTexture(),
        roughness: 0.95,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "greenhouse":
      // Translucent glass with low roughness
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(fallbackColor),
        transmission: 0.6,
        transparent: true,
        opacity: 0.75,
        roughness: 0.15,
        thickness: 0.4,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "pond":
      // Water surface — strong env-map reflection + subtle transparency
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(fallbackColor),
        transparent: true,
        opacity: 0.78,
        roughness: 0.04,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.5,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "path":
      return new THREE.MeshStandardMaterial({
        map: getStoneTexture(),
        roughness: 0.85,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "wall":
      return new THREE.MeshStandardMaterial({
        map: getStoneTexture(),
        roughness: 0.95,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "fence-panel":
    case "gate":
    case "door":
    case "shed":
      return new THREE.MeshStandardMaterial({
        map: getWoodTexture(),
        roughness: 0.7,
        emissive: selectedEmissive,
        emissiveIntensity,
      });

    case "tree-canopy":
      // Foliage — emissive hint for richness
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(fallbackColor),
        roughness: 0.85,
        emissive: new THREE.Color("#14532d"),
        emissiveIntensity: isSelected ? 0.35 : 0.08,
      });

    default:
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(fallbackColor),
        roughness: 0.85,
        emissive: selectedEmissive,
        emissiveIntensity,
      });
  }
}
