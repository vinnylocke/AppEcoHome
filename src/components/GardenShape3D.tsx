import React, { useRef, useMemo } from "react";
import { TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ShapeData } from "./GardenShapeProperties";
import { getShapeCentre, SUN_CLASS_COLOR, SUN_CLASS_TEXT_COLOR, type ShapeSunResult } from "../lib/sunAnalysis";
import { splitHexAlpha, getSunTimeTint, SUN_LIT_TEXT_COLOR, SUN_SHADE_TEXT_COLOR } from "../lib/garden/overlayTints";
import { getMaterialForPreset, getWoodTexture } from "../lib/garden/garden3DMaterials";
import { getPlantTokenColor, computeTokenGrid, MAX_VISIBLE_TOKENS } from "../lib/garden/plantTokens";
import { getPlantFamily, type PlantFamily } from "../constants/plantFamilies";
import type { PlantInArea } from "../hooks/useShapeLiveState";

/** Pick a 3D primitive that suits the plant family. Returns a JSX node positioned at origin. */
function PlantToken3D({ familyName, colour, size }: { familyName: PlantFamily; colour: string; size: number }) {
  const r = size / 2;
  // Vegetable family — Solanaceae / Cucurbitaceae / Apiaceae: tall stalk + small fruit / leaf cluster on top
  if (familyName === "Solanaceae" || familyName === "Cucurbitaceae" || familyName === "Apiaceae" || familyName === "Brassicaceae" || familyName === "Fabaceae" || familyName === "Chenopodiaceae") {
    const stalkH = r * 1.8;
    return (
      <group>
        <mesh position={[0, stalkH / 2, 0]} castShadow>
          <cylinderGeometry args={[r * 0.12, r * 0.18, stalkH, 6]} />
          <meshStandardMaterial color="#3f6212" roughness={0.85} />
        </mesh>
        <mesh position={[0, stalkH + r * 0.55, 0]} castShadow>
          <sphereGeometry args={[r * 0.8, 10, 8]} />
          <meshStandardMaterial color={colour} roughness={0.65} />
        </mesh>
      </group>
    );
  }
  // Herbs / Lamiaceae — small bushy cluster of 3 tiny spheres
  if (familyName === "Lamiaceae" || familyName === "Alliaceae") {
    return (
      <group>
        <mesh position={[-r * 0.3, r * 0.5, 0]} castShadow>
          <sphereGeometry args={[r * 0.5, 10, 8]} />
          <meshStandardMaterial color={colour} roughness={0.7} />
        </mesh>
        <mesh position={[r * 0.3, r * 0.45, 0]} castShadow>
          <sphereGeometry args={[r * 0.45, 10, 8]} />
          <meshStandardMaterial color={colour} roughness={0.7} />
        </mesh>
        <mesh position={[0, r * 0.65, r * 0.3]} castShadow>
          <sphereGeometry args={[r * 0.4, 10, 8]} />
          <meshStandardMaterial color={colour} roughness={0.7} />
        </mesh>
      </group>
    );
  }
  // Flowers / Asteraceae / Rosaceae — narrow stem + bright bloom spheroid
  if (familyName === "Asteraceae" || familyName === "Rosaceae") {
    const stemH = r * 2;
    return (
      <group>
        <mesh position={[0, stemH / 2, 0]} castShadow>
          <cylinderGeometry args={[r * 0.06, r * 0.08, stemH, 6]} />
          <meshStandardMaterial color="#15803d" roughness={0.8} />
        </mesh>
        <mesh position={[0, stemH + r * 0.3, 0]} castShadow>
          <sphereGeometry args={[r * 0.45, 8, 6]} />
          <meshStandardMaterial color={colour} emissive={colour} emissiveIntensity={0.15} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  // Default — generic foliage sphere (Other / unknown)
  return (
    <mesh position={[0, r, 0]} castShadow>
      <sphereGeometry args={[r * 0.9, 12, 8]} />
      <meshStandardMaterial color={colour} roughness={0.7} />
    </mesh>
  );
}

interface Props {
  shape: ShapeData;
  isSelected: boolean;
  interactionMode: "draw" | "move" | "rotate";
  onSelect: () => void;
  onChange: (updates: Partial<ShapeData>) => void;
  plantedItems: PlantInArea[];
  luxReading: number | null;
  sunResult: ShapeSunResult | null;
  showSunOverlay: boolean;
  /** Live sun mode: true = lit at slider time, false = shaded. Null = day mode. */
  litState: boolean | null;
  /** Atmospheric overlay tint ("#rrggbbaa") — frost/wind/pH/moisture. Null = none. */
  overlayTint: string | null;
  selectedTokenId?: string | null;
  onTokenSelect?: (itemId: string, plantName: string, currentSize: number, currentHeight: number) => void;
  onTokenMove?: (itemId: string, xLocalM: number, yLocalM: number, heightM: number) => void;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Wraps a single plant token in a selectable + draggable group.
 *
 * Positions are expressed in the rotated shape-local frame whose origin sits
 * at the bed's centre on top of the soil (the same frame the token-grid uses).
 * When the token is selected, TransformControls attaches and the user can drag
 * along X/Z (soil plane) and Y (height above the soil).
 *
 * `centreWorld` is the world X/Z of the bed's centre, used so the persisted
 * display_x_m / display_y_m end up in the same world-metric coordinate space
 * the 2D renderer already uses.
 */
function DraggableToken({
  plant, family, colour, size,
  defaultLocalX, defaultLocalZ,
  centreWorld, soilWorldY,
  isSelected, onSelect, onMove,
}: {
  plant: PlantInArea;
  family: PlantFamily;
  colour: string;
  size: number;
  defaultLocalX: number; // auto-grid local X (relative to shape centre, no rotation)
  defaultLocalZ: number;
  centreWorld: { x: number; z: number };
  soilWorldY: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (worldX: number, worldZ: number, heightM: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Convert stored world position to shape-local (relative to centre).
  const initialLocalX = plant.display_x_m != null ? plant.display_x_m - centreWorld.x : defaultLocalX;
  const initialLocalZ = plant.display_y_m != null ? plant.display_y_m - centreWorld.z : defaultLocalZ;
  const initialY = plant.display_height_m ?? 0;

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    onSelect();
  };

  const handleTransform = () => {
    const g = groupRef.current;
    if (!g) return;
    // group.position is local to its parent (the rotated bed centre group),
    // so x and z here are already shape-local metres. Convert back to world
    // before persisting so the value matches what the 2D path stores.
    const worldX = round3(centreWorld.x + g.position.x);
    const worldZ = round3(centreWorld.z + g.position.z);
    const heightM = Math.max(0, round3(g.position.y));
    onMove(worldX, worldZ, heightM);
  };

  return (
    <>
      <group
        ref={groupRef}
        position={[initialLocalX, initialY, initialLocalZ]}
        onClick={handlePointerDown}
      >
        <PlantToken3D familyName={family} colour={colour} size={size} />
      </group>
      {isSelected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode="translate"
          showX
          showY
          showZ
          translationSnap={0.1}
          onObjectChange={handleTransform}
        />
      )}
      {/* Tag soilWorldY to satisfy lint — used for future height clamping */}
      <group visible={false} position={[0, soilWorldY, 0]} />
    </>
  );
}

export default function GardenShape3D({
  shape, isSelected, interactionMode, onSelect, onChange,
  plantedItems, luxReading, sunResult, showSunOverlay, litState, overlayTint,
  selectedTokenId, onTokenSelect, onTokenMove,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const extrude = shape.extrude_m ?? 0.3;
  const isTransparent = shape.dashed || shape.preset_id === "tree-canopy" || shape.preset_id === "pond";

  // Material library (Wave 3B) — wood/glass/water/stone/foliage per preset.
  // We feed React the material as a primitive so we get full control over physical materials.
  const presetMaterial = useMemo(
    () => getMaterialForPreset(shape.preset_id ?? null, shape.color, isSelected),
    [shape.preset_id, shape.color, isSelected],
  );

  const material = (
    <primitive object={presetMaterial} attach="material" />
  );

  const polyShape = useMemo(() => {
    const pts = shape.points;
    if (!pts || pts.length < 3) return null;
    const s = new THREE.Shape();
    s.moveTo(pts[0].x + shape.x_m, pts[0].y + shape.y_m);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x + shape.x_m, pts[i].y + shape.y_m);
    s.closePath();
    return s;
  }, [shape.points, shape.x_m, shape.y_m]);

  const handleClick = (e: any) => {
    if (interactionMode === "rotate") return;
    e.stopPropagation();
    onSelect();
  };

  const handleTransformChange = () => {
    if (!meshRef.current) return;
    const p = meshRef.current.position;
    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      const w = shape.width_m ?? 1;
      const h = shape.height_m ?? 1;
      onChange({ x_m: round3(p.x - w / 2), y_m: round3(p.z - h / 2) });
    } else {
      onChange({ x_m: round3(p.x), y_m: round3(p.z) });
    }
  };

  const showTransform = isSelected && interactionMode === "move";

  // Overlay helpers — computed once and reused in every shape branch
  const centre = getShapeCentre(shape);
  const topY = shape.preset_id === "tree-canopy"
    ? 2 * (shape.radius_m ?? 2) + 0.1
    : Math.max(0.02, extrude) + 0.1;

  const plantBillboard = plantedItems.length > 0 ? (
    <Html position={[centre.x, topY, centre.z]} center style={{ pointerEvents: "none" }}>
      <div style={{
        background: "rgba(255,255,255,0.93)", border: "1px solid #bbf7d0",
        borderRadius: 8, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: "#166534",
      }}>
        {plantedItems.slice(0, 3).map(p => (
          <div key={p.id}>🌱 {p.nickname ?? p.plant_name}</div>
        ))}
        {plantedItems.length > 3 && (
          <div style={{ color: "#9ca3af" }}>+{plantedItems.length - 3} more</div>
        )}
      </div>
    </Html>
  ) : null;

  const luxBadge = luxReading !== null ? (
    <Html
      position={[centre.x, topY + (plantedItems.length > 0 ? 0.55 : 0), centre.z]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div style={{
        background: "rgba(255,237,213,0.95)", border: "1px solid #fed7aa",
        borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 900, color: "#c2410c",
      }}>
        ☀️ {luxReading.toLocaleString()} lx
      </div>
    </Html>
  ) : null;

  const sunOverlayGeom = useMemo(() => {
    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      return <planeGeometry args={[shape.width_m ?? 1, shape.height_m ?? 1]} />;
    }
    if (shape.shape_type === "circle" || shape.preset_id === "tree-canopy") {
      return <circleGeometry args={[shape.radius_m ?? 0.5, 32]} />;
    }
    if (shape.shape_type === "ellipse") {
      return <planeGeometry args={[shape.width_m ?? 2, shape.height_m ?? 1]} />;
    }
    if (shape.shape_type === "polygon" && shape.points) {
      const xs = shape.points.map(p => p.x + shape.x_m);
      const zs = shape.points.map(p => p.y + shape.y_m);
      const bw = Math.max(...xs) - Math.min(...xs);
      const bh = Math.max(...zs) - Math.min(...zs);
      return <planeGeometry args={[Math.max(0.1, bw), Math.max(0.1, bh)]} />;
    }
    return <planeGeometry args={[shape.width_m ?? 1, shape.height_m ?? 1]} />;
  }, [shape.shape_type, shape.preset_id, shape.width_m, shape.height_m, shape.radius_m, shape.points, shape.x_m, shape.y_m]);

  // Sun overlay — Live mode (lit/shade at slider time) wins over Day mode
  // (daily classification). Both render as a flat tinted plane + label.
  const sunOverlay = showSunOverlay && litState !== null ? (
    <>
      <mesh position={[centre.x, 0.02, centre.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        {sunOverlayGeom}
        <meshBasicMaterial
          color={getSunTimeTint(litState)}
          transparent opacity={0.45} depthWrite={false}
        />
      </mesh>
      <Html position={[centre.x, 0.05, centre.z]} center style={{ pointerEvents: "none" }}>
        <span style={{
          fontSize: 9, fontWeight: 900,
          color: litState ? SUN_LIT_TEXT_COLOR : SUN_SHADE_TEXT_COLOR,
          textShadow: "0 1px 2px rgba(255,255,255,0.9)", whiteSpace: "nowrap",
        }}>
          {litState ? "Lit" : "Shade"}
        </span>
      </Html>
    </>
  ) : showSunOverlay && sunResult ? (
    <>
      <mesh position={[centre.x, 0.02, centre.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        {sunOverlayGeom}
        <meshBasicMaterial
          color={SUN_CLASS_COLOR[sunResult.classification]}
          transparent opacity={0.45} depthWrite={false}
        />
      </mesh>
      <Html position={[centre.x, 0.05, centre.z]} center style={{ pointerEvents: "none" }}>
        <span style={{
          fontSize: 9, fontWeight: 900,
          color: SUN_CLASS_TEXT_COLOR[sunResult.classification],
          textShadow: "0 1px 2px rgba(255,255,255,0.9)", whiteSpace: "nowrap",
        }}>
          {sunResult.classification}
        </span>
      </Html>
    </>
  ) : null;

  // Atmospheric tint (frost/wind/pH/moisture) — hidden while the sun overlay
  // is tinting so the two never fight for the same plane (sun wins, same
  // priority the 2D stage applies).
  const atmosphericOverlay = !sunOverlay && overlayTint ? (() => {
    const { color, opacity } = splitHexAlpha(overlayTint);
    return (
      <mesh position={[centre.x, 0.02, centre.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        {sunOverlayGeom}
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    );
  })() : null;

  // ---- tree canopy (cluster of foliage spheres + trunk) ----
  if (shape.preset_id === "tree-canopy") {
    const r = shape.radius_m ?? 2;
    const trunkHeight = r * 0.85;
    const trunkRadius = Math.max(0.08, r * 0.12);
    return (
      <group>
        {/* Trunk */}
        <mesh
          position={[shape.x_m, trunkHeight / 2, shape.y_m]}
          castShadow
          receiveShadow
          onClick={handleClick}
        >
          <cylinderGeometry args={[trunkRadius, trunkRadius * 1.2, trunkHeight, 12]} />
          <meshStandardMaterial map={getWoodTexture()} roughness={0.85} />
        </mesh>
        {/* Main canopy sphere (the selectable mesh for transform controls) */}
        <mesh ref={meshRef} position={[shape.x_m, trunkHeight + r * 0.6, shape.y_m]} onClick={handleClick} castShadow receiveShadow>
          <sphereGeometry args={[r, 16, 12]} />
          {material}
        </mesh>
        {/* 3 secondary foliage spheres for a cluster look */}
        <mesh position={[shape.x_m + r * 0.5, trunkHeight + r * 0.45, shape.y_m + r * 0.1]} castShadow>
          <sphereGeometry args={[r * 0.55, 12, 10]} />
          {material}
        </mesh>
        <mesh position={[shape.x_m - r * 0.4, trunkHeight + r * 0.55, shape.y_m + r * 0.3]} castShadow>
          <sphereGeometry args={[r * 0.5, 12, 10]} />
          {material}
        </mesh>
        <mesh position={[shape.x_m, trunkHeight + r * 0.45, shape.y_m - r * 0.4]} castShadow>
          <sphereGeometry args={[r * 0.5, 12, 10]} />
          {material}
        </mesh>
        {showTransform && (
          <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
        )}
        {plantBillboard}
        {luxBadge}
        {sunOverlay}
        {atmosphericOverlay}
      </group>
    );
  }

  // ---- circle / pond ----
  if (shape.shape_type === "circle") {
    const r = shape.radius_m ?? 0.5;
    const h = Math.max(0.02, extrude);
    return (
      <group>
        <mesh ref={meshRef} position={[shape.x_m, h / 2, shape.y_m]} onClick={handleClick} castShadow receiveShadow>
          <cylinderGeometry args={[r, r, h, 64]} />
          {shape.preset_id === "pond"
            ? <meshPhongMaterial color={shape.color} transparent opacity={0.85} shininess={120} />
            : material}
        </mesh>
        {showTransform && (
          <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
        )}
        {plantBillboard}
        {luxBadge}
        {sunOverlay}
        {atmosphericOverlay}
      </group>
    );
  }

  // ---- ellipse ----
  if (shape.shape_type === "ellipse") {
    const w = shape.width_m ?? 2;
    const h = shape.height_m ?? 1;
    const depth = Math.max(0.02, extrude);
    return (
      <group>
        <mesh ref={meshRef} position={[shape.x_m, depth / 2, shape.y_m]} scale={[w / 2, 1, h / 2]} onClick={handleClick} castShadow receiveShadow>
          <cylinderGeometry args={[1, 1, depth, 32]} />
          {material}
        </mesh>
        {showTransform && (
          <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
        )}
        {plantBillboard}
        {luxBadge}
        {sunOverlay}
        {atmosphericOverlay}
      </group>
    );
  }

  // ---- polygon ----
  if (shape.shape_type === "polygon") {
    if (!polyShape) return null;
    const depth = Math.max(0.02, extrude);
    const handlePolyChange = () => {
      if (!meshRef.current) return;
      const dx = meshRef.current.position.x;
      const dz = meshRef.current.position.z;
      meshRef.current.position.set(0, 0, 0);
      onChange({ points: (shape.points ?? []).map(p => ({ x: round3(p.x + dx), y: round3(p.y + dz) })) });
    };
    return (
      <group>
        <mesh ref={meshRef} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick} castShadow receiveShadow>
          <extrudeGeometry args={[polyShape, { depth, bevelEnabled: false }]} />
          {material}
        </mesh>
        {showTransform && (
          <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handlePolyChange} />
        )}
        {plantBillboard}
        {luxBadge}
        {sunOverlay}
        {atmosphericOverlay}
      </group>
    );
  }

  // ---- rect / path (default box) ----
  const w = shape.width_m ?? 1;
  const h = shape.height_m ?? 1;
  const depth = Math.max(0.02, extrude);
  const isWireframe = shape.preset_id === "garden-boundary";
  const isFramedBed = shape.preset_id === "raised-bed" || shape.preset_id === "planter-box";
  const rotY = -(shape.rotation * Math.PI) / 180;

  // Wood frame thickness as a fraction of the smaller side, clamped.
  const frameThickness = isFramedBed ? Math.min(0.08, Math.min(w, h) * 0.1) : 0;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[shape.x_m + w / 2, depth / 2, shape.y_m + h / 2]}
        rotation={[0, rotY, 0]}
        onClick={handleClick}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, depth, h]} />
        {isWireframe
          ? <meshBasicMaterial color={shape.color} wireframe />
          : material}
      </mesh>

      {/* 3D plant tokens (Wave 7A 3D + family-aware shapes; selectable + draggable) */}
      {isFramedBed && plantedItems.length > 0 && (() => {
        const tokens = plantedItems.slice(0, MAX_VISIBLE_TOKENS);
        const grid = computeTokenGrid(tokens.length, w, h);
        const centreWorld = { x: shape.x_m + w / 2, z: shape.y_m + h / 2 };
        return (
          <group position={[centreWorld.x, depth, centreWorld.z]} rotation={[0, rotY, 0]}>
            {tokens.map((p, i) => {
              const pos = grid.positions[i];
              if (!pos) return null;
              const colour = getPlantTokenColor({ ...p, plant_id: null, sunlight: null });
              const family = getPlantFamily(p.plant_name);
              const tokenSize = p.display_size_m ?? grid.diameterM;
              const defaultLocalX = pos.x - w / 2;
              const defaultLocalZ = pos.y - h / 2;
              const isSel = selectedTokenId === p.id;
              return (
                <DraggableToken
                  key={`token3d-${p.id}`}
                  plant={p}
                  family={family}
                  colour={colour}
                  size={tokenSize}
                  defaultLocalX={defaultLocalX}
                  defaultLocalZ={defaultLocalZ}
                  centreWorld={centreWorld}
                  soilWorldY={depth}
                  isSelected={isSel}
                  onSelect={() => onTokenSelect?.(p.id, p.nickname ?? p.plant_name, tokenSize, p.display_height_m ?? 0)}
                  onMove={(worldX, worldZ, heightM) => onTokenMove?.(p.id, worldX, worldZ, heightM)}
                />
              );
            })}
          </group>
        );
      })()}

      {/* Wood frame planks for raised beds / planter boxes (Wave 3C) */}
      {isFramedBed && frameThickness > 0.005 && (
        <group position={[shape.x_m + w / 2, depth + 0.02, shape.y_m + h / 2]} rotation={[0, rotY, 0]}>
          {/* Top plank */}
          <mesh castShadow receiveShadow position={[0, frameThickness / 2, -h / 2 + frameThickness / 2]}>
            <boxGeometry args={[w, frameThickness * 1.2, frameThickness]} />
            <meshStandardMaterial map={getWoodTexture()} roughness={0.7} />
          </mesh>
          {/* Bottom plank */}
          <mesh castShadow receiveShadow position={[0, frameThickness / 2, h / 2 - frameThickness / 2]}>
            <boxGeometry args={[w, frameThickness * 1.2, frameThickness]} />
            <meshStandardMaterial map={getWoodTexture()} roughness={0.7} />
          </mesh>
          {/* Left plank */}
          <mesh castShadow receiveShadow position={[-w / 2 + frameThickness / 2, frameThickness / 2, 0]}>
            <boxGeometry args={[frameThickness, frameThickness * 1.2, h]} />
            <meshStandardMaterial map={getWoodTexture()} roughness={0.7} />
          </mesh>
          {/* Right plank */}
          <mesh castShadow receiveShadow position={[w / 2 - frameThickness / 2, frameThickness / 2, 0]}>
            <boxGeometry args={[frameThickness, frameThickness * 1.2, h]} />
            <meshStandardMaterial map={getWoodTexture()} roughness={0.7} />
          </mesh>
        </group>
      )}

      {showTransform && (
        <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
      )}
      {plantBillboard}
      {luxBadge}
      {sunOverlay}
      {atmosphericOverlay}
    </group>
  );
}
