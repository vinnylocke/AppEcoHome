import React, { useRef, useMemo } from "react";
import { TransformControls, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ShapeData } from "./GardenShapeProperties";
import { getShapeCentre, SUN_CLASS_COLOR, SUN_CLASS_TEXT_COLOR, type ShapeSunResult } from "../lib/sunAnalysis";

interface Props {
  shape: ShapeData;
  isSelected: boolean;
  interactionMode: "draw" | "move" | "rotate";
  onSelect: () => void;
  onChange: (updates: Partial<ShapeData>) => void;
  plantedItems: Array<{ id: string; plant_name: string; nickname: string | null }>;
  luxReading: number | null;
  sunResult: ShapeSunResult | null;
  showSunOverlay: boolean;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export default function GardenShape3D({
  shape, isSelected, interactionMode, onSelect, onChange,
  plantedItems, luxReading, sunResult, showSunOverlay,
}: Props) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const extrude = shape.extrude_m ?? 0.3;
  const isTransparent = shape.dashed || shape.preset_id === "tree-canopy" || shape.preset_id === "pond";

  const material = (
    <meshLambertMaterial
      color={shape.color}
      transparent={isTransparent}
      opacity={isTransparent ? 0.65 : 1.0}
      emissive={isSelected ? "#3b82f6" : "#000000"}
      emissiveIntensity={isSelected ? 0.35 : 0}
    />
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

  const sunOverlay = showSunOverlay && sunResult ? (
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

  // ---- tree canopy (sphere) ----
  if (shape.preset_id === "tree-canopy") {
    const r = shape.radius_m ?? 2;
    return (
      <group>
        <mesh ref={meshRef} position={[shape.x_m, r, shape.y_m]} onClick={handleClick} castShadow receiveShadow>
          <sphereGeometry args={[r, 16, 12]} />
          {material}
        </mesh>
        {showTransform && (
          <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
        )}
        {plantBillboard}
        {luxBadge}
        {sunOverlay}
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
      </group>
    );
  }

  // ---- rect / path (default box) ----
  const w = shape.width_m ?? 1;
  const h = shape.height_m ?? 1;
  const depth = Math.max(0.02, extrude);
  const isWireframe = shape.preset_id === "garden-boundary";
  const rotY = -(shape.rotation * Math.PI) / 180;

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
      {showTransform && (
        <TransformControls object={meshRef} mode="translate" showY={false} translationSnap={0.1} onChange={handleTransformChange} />
      )}
      {plantBillboard}
      {luxBadge}
      {sunOverlay}
    </group>
  );
}
