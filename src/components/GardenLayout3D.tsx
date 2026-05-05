import React, { useRef, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, GizmoHelper, GizmoViewport } from "@react-three/drei";
import type { ShapeData } from "./GardenShapeProperties";
import GardenShape3D from "./GardenShape3D";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  canvasW: number;
  canvasH: number;
  homeLatLng: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  onShapeChange: (id: string, updates: Partial<ShapeData>) => void;
  sunPosition?: { altitude: number; azimuth: number };
}

const SUN_DIST = 50;

export default function GardenLayout3D({ shapes, selectedId, canvasW, canvasH, onSelect, onShapeChange, sunPosition }: Props) {
  const orbitRef = useRef<any>(null);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");

  const maxDim = Math.max(canvasW, canvasH);

  // Compute directional light position from sun angles.
  // Pass directly as prop so R3F's reconciler applies it — never mutate a ref
  // when R3F owns the same prop (reconciler overwrites on every render).
  const lightPos = useMemo<[number, number, number]>(() => {
    if (!sunPosition) return [canvasW / 2 + maxDim * 0.6, maxDim * 0.6, canvasH / 2 - maxDim * 0.3];
    const lx = SUN_DIST * Math.cos(sunPosition.altitude) * Math.sin(sunPosition.azimuth);
    const ly = SUN_DIST * Math.sin(sunPosition.altitude);
    const lz = SUN_DIST * Math.cos(sunPosition.altitude) * Math.cos(sunPosition.azimuth);
    return [canvasW / 2 + lx, Math.max(2, ly), canvasH / 2 + lz];
  }, [sunPosition, canvasW, canvasH, maxDim]);

  // Sky colour shifts with sun altitude: night → dawn/dusk → day
  const skyColor = useMemo(() => {
    if (!sunPosition) return "#d4e8d4";
    const alt = sunPosition.altitude;
    if (alt > 0.35) return "#87ceeb";   // high sun — sky blue
    if (alt > 0.08) return "#f5a623";   // low sun — golden hour
    if (alt > 0)    return "#ff6b35";   // near horizon — red/orange
    return "#1a1a2e";                   // below horizon — night
  }, [sunPosition]);

  // Ambient light dims at night
  const ambientIntensity = useMemo(() => {
    if (!sunPosition) return 0.6;
    const alt = sunPosition.altitude;
    if (alt <= 0) return 0.15;
    return 0.15 + 0.55 * Math.min(alt / 0.5, 1);
  }, [sunPosition]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows="percentage"
        camera={{ position: [canvasW / 2, 20, canvasH + 15], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Sky colour — set as scene background so WebGL clear matches */}
        <color attach="background" args={[skyColor]} />

        <ambientLight intensity={ambientIntensity} />

        {/* Directional light — position prop drives R3F reconciler, never ref-mutate */}
        <directionalLight
          position={lightPos}
          intensity={sunPosition && sunPosition.altitude > 0 ? 1.4 : 0.3}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={200}
          shadow-camera-left={-maxDim}
          shadow-camera-right={maxDim}
          shadow-camera-top={maxDim}
          shadow-camera-bottom={-maxDim}
        />

        <OrbitControls
          ref={orbitRef}
          target={[canvasW / 2, 0, canvasH / 2]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enableDamping
          dampingFactor={0.08}
        />

        {/* Ground plane */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[canvasW / 2, 0, canvasH / 2]}>
          <planeGeometry args={[canvasW, canvasH]} />
          <meshLambertMaterial color="#c8e6c9" />
        </mesh>

        {/* Grid */}
        <gridHelper
          args={[maxDim, maxDim, "#aaaaaa", "#dddddd"]}
          position={[canvasW / 2, 0.001, canvasH / 2]}
        />

        {/* Sun sphere — shows where light is coming from */}
        {sunPosition && sunPosition.altitude > 0 && (
          <mesh position={lightPos}>
            <sphereGeometry args={[1.8, 16, 10]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        )}

        {/* Shapes */}
        {shapes.map(s => (
          <GardenShape3D
            key={s.id}
            shape={s}
            isSelected={s.id === selectedId}
            transformMode={transformMode}
            orbitRef={orbitRef}
            onSelect={() => onSelect(s.id)}
            onChange={u => onShapeChange(s.id, u)}
          />
        ))}

        {/* Invisible deselect plane */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[canvasW / 2, -0.01, canvasH / 2]}
          onClick={() => onSelect(null)}
        >
          <planeGeometry args={[canvasW * 10, canvasH * 10]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Move / Rotate HUD */}
        <Html position={[canvasW / 2, 0, -2]} center>
          <div className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-xl px-2 py-1 shadow border border-rhozly-outline/20">
            <button
              data-testid="3d-mode-translate"
              onClick={() => setTransformMode("translate")}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${transformMode === "translate" ? "bg-rhozly-primary text-white" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface"}`}
            >
              Move
            </button>
            <button
              data-testid="3d-mode-rotate"
              onClick={() => setTransformMode("rotate")}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${transformMode === "rotate" ? "bg-rhozly-primary text-white" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface"}`}
            >
              Rotate
            </button>
          </div>
        </Html>

        {/* Orientation gizmo */}
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
