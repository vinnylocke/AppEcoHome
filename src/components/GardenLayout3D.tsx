import React, { useRef, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, GizmoHelper, GizmoViewport, Sky, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ShapeData } from "./GardenShapeProperties";
import type { ShapePreset } from "./GardenShapePanel";
import GardenShape3D from "./GardenShape3D";
import { SUN_CLASS_COLOR, SUN_CLASS_TEXT_COLOR, type ShapeSunResult, type SunClass } from "../lib/sunAnalysis";
import { getGrassTexture } from "../lib/garden/garden3DMaterials";

interface Props {
  shapes: ShapeData[];
  selectedId: string | null;
  canvasW: number;
  canvasH: number;
  northOffset: number;
  interactionMode: "draw" | "move" | "rotate";
  pendingPreset: ShapePreset | null;
  homeLatLng: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  onShapeChange: (id: string, updates: Partial<ShapeData>) => void;
  onDrawShape: (start: { x: number; y: number }, end: { x: number; y: number }) => void;
  sunPosition?: { altitude: number; azimuth: number };
  areaPlants: Record<string, import("../hooks/useShapeLiveState").PlantInArea[]>;
  areaLuxReadings: Array<{ area_id: string; lux_value: number; recorded_at: string }>;
  showLuxOverlay: boolean;
  sunAnalysisResults: ShapeSunResult[] | null;
  showSunOverlay: boolean;
  sunDateObj: Date;
  selectedTokenId?: string | null;
  onTokenSelect?: (itemId: string, plantName: string, currentSize: number, currentHeight: number) => void;
  onTokenMove?: (itemId: string, worldX: number, worldZ: number, heightM: number) => void;
}

const SUN_DIST = 50;

// World-space North arrow — orbits with the scene so orientation is always correct.
function NorthArrow({ northOffset, canvasW, canvasH }: { northOffset: number; canvasW: number; canvasH: number }) {
  const rad = -northOffset * Math.PI / 180;
  const arrowLen = 1.4;
  const px = Math.max(canvasW * 0.08, 1.5);
  const pz = Math.max(canvasH * 0.08, 1.5);
  return (
    <group position={[px, 0.02, pz]} rotation={[0, rad, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.1, 32]} />
        <meshBasicMaterial color="white" opacity={0.82} transparent />
      </mesh>
      <mesh position={[0, 0.04, -arrowLen * 0.45]}>
        <boxGeometry args={[0.14, 0.08, arrowLen * 0.9]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, 0.04, -arrowLen]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 0.45, 8]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, 0.04, arrowLen * 0.35]}>
        <boxGeometry args={[0.10, 0.06, arrowLen * 0.6]} />
        <meshBasicMaterial color="#9ca3af" />
      </mesh>
      <Html position={[0, 0.5, -arrowLen - 0.3]} center>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#ef4444", textShadow: "0 1px 3px rgba(255,255,255,0.9)", userSelect: "none" }}>N</span>
      </Html>
    </group>
  );
}

// Ghost preview of shape being drawn in 3D
function DrawGhost({ preset, start, end }: {
  preset: ShapePreset;
  start: { x: number; z: number };
  end: { x: number; z: number };
}) {
  const x1 = Math.min(start.x, end.x), x2 = Math.max(start.x, end.x);
  const z1 = Math.min(start.z, end.z), z2 = Math.max(start.z, end.z);
  const w = Math.max(0.1, x2 - x1);
  const h = Math.max(0.1, z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const extrude = preset.extrude_m ?? 0.3;

  if (preset.shapeType === "circle") {
    const r = Math.max(0.05, Math.min(w, h) / 2);
    return (
      <mesh position={[cx, extrude / 2, cz]}>
        <cylinderGeometry args={[r, r, extrude, 32]} />
        <meshBasicMaterial color={preset.color} opacity={0.4} transparent />
      </mesh>
    );
  }
  return (
    <mesh position={[cx, extrude / 2, cz]}>
      <boxGeometry args={[w, extrude, h]} />
      <meshBasicMaterial color={preset.color} opacity={0.4} transparent />
    </mesh>
  );
}

export default function GardenLayout3D({
  shapes, selectedId, canvasW, canvasH, northOffset,
  interactionMode, pendingPreset,
  onSelect, onShapeChange, onDrawShape, sunPosition,
  areaPlants, areaLuxReadings, showLuxOverlay,
  sunAnalysisResults, showSunOverlay, sunDateObj,
  selectedTokenId, onTokenSelect, onTokenMove,
}: Props) {
  const orbitRef = useRef<any>(null);
  const draw3DStart = useRef<{ x: number; z: number } | null>(null);
  const [draw3DCurrent, setDraw3DCurrent] = useState<{ x: number; z: number } | null>(null);

  const maxDim = Math.max(canvasW, canvasH);

  // Procedural grass texture (Wave 3A)
  const grassTexture = useMemo(() => getGrassTexture(canvasW, canvasH), [canvasW, canvasH]);

  // Subtle vertex displacement for the ground plane — natural soil/grass undulation.
  const undulatedGroundGeometry = useMemo(() => {
    const segs = Math.max(20, Math.min(80, Math.round(Math.max(canvasW, canvasH) * 2)));
    const geom = new THREE.PlaneGeometry(canvasW, canvasH, segs, segs);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Two sine bands at different frequencies + amplitudes, kept very low so shapes still sit flat.
      const h =
        Math.sin(x * 0.6) * 0.04 +
        Math.cos(y * 0.45) * 0.04 +
        Math.sin((x + y) * 0.9) * 0.025;
      pos.setZ(i, h);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    return geom;
  }, [canvasW, canvasH]);

  const lightPos = useMemo<[number, number, number]>(() => {
    if (!sunPosition) return [canvasW / 2 + maxDim * 0.6, maxDim * 0.6, canvasH / 2 - maxDim * 0.3];
    const lx = SUN_DIST * Math.cos(sunPosition.altitude) * Math.sin(sunPosition.azimuth);
    const ly = SUN_DIST * Math.sin(sunPosition.altitude);
    const lz = SUN_DIST * Math.cos(sunPosition.altitude) * Math.cos(sunPosition.azimuth);
    return [canvasW / 2 + lx, Math.max(2, ly), canvasH / 2 + lz];
  }, [sunPosition, canvasW, canvasH, maxDim]);

  const skyColor = useMemo(() => {
    if (!sunPosition) return "#d4e8d4";
    const alt = sunPosition.altitude;
    if (alt > 0.35) return "#87ceeb";
    if (alt > 0.08) return "#f5a623";
    if (alt > 0)    return "#ff6b35";
    return "#1a1a2e";
  }, [sunPosition]);

  const ambientIntensity = useMemo(() => {
    if (!sunPosition) return 0.6;
    const alt = sunPosition.altitude;
    if (alt <= 0) return 0.15;
    return 0.15 + 0.55 * Math.min(alt / 0.5, 1);
  }, [sunPosition]);

  // Match lux readings to the current time slider (±30 min)
  const luxByArea = useMemo(() => {
    const windowMs = 30 * 60 * 1000;
    const centre = sunDateObj.getTime();
    const out: Record<string, number> = {};
    for (const r of areaLuxReadings) {
      if (Math.abs(new Date(r.recorded_at).getTime() - centre) <= windowMs) {
        if (!(r.area_id in out)) out[r.area_id] = r.lux_value;
      }
    }
    return out;
  }, [areaLuxReadings, sunDateObj]);

  // Ground plane pointer handlers for draw mode.
  // e.point gives the world-space intersection — x/z map directly to the 2D canvas coords.
  const handleGroundDown = (e: ThreeEvent<PointerEvent>) => {
    if (interactionMode !== "draw" || !pendingPreset) return;
    e.stopPropagation();
    draw3DStart.current = { x: e.point.x, z: e.point.z };
    setDraw3DCurrent({ x: e.point.x, z: e.point.z });
  };
  const handleGroundMove = (e: ThreeEvent<PointerEvent>) => {
    if (interactionMode !== "draw" || !draw3DStart.current) return;
    e.stopPropagation();
    setDraw3DCurrent({ x: e.point.x, z: e.point.z });
  };
  const handleGroundUp = (e: ThreeEvent<PointerEvent>) => {
    if (interactionMode !== "draw" || !draw3DStart.current) return;
    e.stopPropagation();
    const s = draw3DStart.current;
    const end = { x: e.point.x, z: e.point.z };
    // Map 3D x/z → 2D x_m/y_m (z = y_m in 2D)
    onDrawShape({ x: s.x, y: s.z }, { x: end.x, y: end.z });
    draw3DStart.current = null;
    setDraw3DCurrent(null);
  };

  const cursorStyle = interactionMode === "draw" ? "crosshair" : interactionMode === "move" ? "default" : "grab";

  return (
    <div style={{ position: "absolute", inset: 0, cursor: cursorStyle }}>
      <Canvas
        shadows="percentage"
        camera={{ position: [canvasW / 2, 20, canvasH + 15], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={[skyColor]} />
        {/* Sky dome + distance fog soften the canvas edges (Wave 3D) */}
        {sunPosition && sunPosition.altitude > 0 && (
          <Sky
            distance={4500}
            sunPosition={[lightPos[0], lightPos[1], lightPos[2]]}
            inclination={Math.max(0.05, Math.min(0.5, sunPosition.altitude / Math.PI))}
            azimuth={0.25}
            turbidity={6}
            rayleigh={2}
          />
        )}
        <fog attach="fog" args={[skyColor, maxDim * 1.4, maxDim * 4]} />
        <ambientLight intensity={ambientIntensity} />

        <directionalLight
          position={lightPos}
          intensity={sunPosition && sunPosition.altitude > 0 ? 1.4 : 0.3}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={SUN_DIST * 4}
          shadow-camera-left={-(SUN_DIST + maxDim)}
          shadow-camera-right={SUN_DIST + maxDim}
          shadow-camera-top={SUN_DIST + maxDim}
          shadow-camera-bottom={-(SUN_DIST + maxDim)}
        />

        {/* OrbitControls only mounted in rotate (view) mode.
            Unmounting removes all DOM event listeners so they cannot
            intercept pointer events needed by draw / move modes. */}
        {interactionMode === "rotate" && (
          <OrbitControls
            makeDefault
            ref={orbitRef}
            target={[canvasW / 2, 0, canvasH / 2]}
            maxPolarAngle={Math.PI / 2 - 0.05}
            enableDamping
            dampingFactor={0.08}
          />
        )}

        {/* Sky environment — gives pond / glass surfaces real reflections */}
        <Environment preset="park" />

        {/* Ground plane — procedural grass texture + subtle undulation (Wave 3A + 3D extras) */}
        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[canvasW / 2, 0, canvasH / 2]}
          geometry={undulatedGroundGeometry}
          onPointerDown={handleGroundDown}
          onPointerMove={handleGroundMove}
          onPointerUp={handleGroundUp}
        >
          <meshStandardMaterial map={grassTexture} roughness={1} metalness={0} />
        </mesh>

        <gridHelper
          args={[maxDim, maxDim, "#aaaaaa", "#dddddd"]}
          position={[canvasW / 2, 0.001, canvasH / 2]}
        />

        <NorthArrow northOffset={northOffset} canvasW={canvasW} canvasH={canvasH} />

        {sunPosition && sunPosition.altitude > 0 && (
          <mesh position={lightPos}>
            <sphereGeometry args={[1.8, 16, 10]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        )}

        {/* 3D draw ghost */}
        {interactionMode === "draw" && pendingPreset && draw3DStart.current && draw3DCurrent && (
          <DrawGhost
            preset={pendingPreset}
            start={draw3DStart.current}
            end={draw3DCurrent}
          />
        )}

        {shapes.map(s => (
          <GardenShape3D
            key={s.id}
            shape={s}
            isSelected={s.id === selectedId}
            interactionMode={interactionMode}
            onSelect={() => onSelect(s.id)}
            onChange={u => onShapeChange(s.id, u)}
            plantedItems={s.area_id ? (areaPlants[s.area_id] ?? []) : []}
            luxReading={showLuxOverlay && s.area_id ? (luxByArea[s.area_id] ?? null) : null}
            sunResult={sunAnalysisResults?.find(r => r.shapeId === s.id) ?? null}
            showSunOverlay={showSunOverlay}
            selectedTokenId={selectedTokenId}
            onTokenSelect={onTokenSelect}
            onTokenMove={onTokenMove}
          />
        ))}

        {/* Sun classification legend */}
        {showSunOverlay && sunAnalysisResults && (
          <Html position={[0, 0, 0]} style={{ pointerEvents: "none" }}>
            <div style={{
              position: "fixed", bottom: 12, left: 12,
              background: "white", borderRadius: 12,
              padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}>
              {(Object.entries(SUN_CLASS_COLOR) as [SunClass, string][]).map(([label, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  <span style={{ fontSize: 10, fontWeight: 900, color: SUN_CLASS_TEXT_COLOR[label] }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </Html>
        )}

        {/* Invisible wide deselect plane — only active in move mode */}
        {interactionMode === "move" && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[canvasW / 2, -0.01, canvasH / 2]}
            onClick={() => onSelect(null)}
          >
            <planeGeometry args={[canvasW * 10, canvasH * 10]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        )}

        {/* Gizmo only useful when orbiting */}
        {interactionMode === "rotate" && (
          <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
            <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
          </GizmoHelper>
        )}
      </Canvas>
    </div>
  );
}
