import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
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

export default function GardenLayout3D({ shapes, selectedId, canvasW, canvasH, onSelect, onShapeChange, sunPosition }: Props) {
  const orbitRef = useRef<any>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null!);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");

  // Sun trajectory — update directional light position when sunPosition changes
  useEffect(() => {
    if (!sunPosition || !sunLightRef.current) return;
    const dist = 50;
    const lx = dist * Math.cos(sunPosition.altitude) * Math.sin(sunPosition.azimuth);
    const ly = dist * Math.sin(sunPosition.altitude);
    const lz = dist * Math.cos(sunPosition.altitude) * Math.cos(sunPosition.azimuth);
    sunLightRef.current.position.set(canvasW / 2 + lx, Math.max(1, ly), canvasH / 2 + lz);
  }, [sunPosition, canvasW, canvasH]);

  const maxDim = Math.max(canvasW, canvasH);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows="percentage"
        camera={{ position: [canvasW / 2, 20, canvasH + 15], fov: 45 }}
        style={{ background: "#e8f5e9", height: "100%", width: "100%" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          ref={sunLightRef}
          position={[canvasW, 30, 0]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={200}
          shadow-camera-left={-canvasW}
          shadow-camera-right={canvasW}
          shadow-camera-top={canvasH}
          shadow-camera-bottom={-canvasH}
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
