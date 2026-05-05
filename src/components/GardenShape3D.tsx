import React, { useRef, useMemo } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { ShapeData } from "./GardenShapeProperties";

interface Props {
  shape: ShapeData;
  isSelected: boolean;
  transformMode: "translate" | "rotate";
  orbitRef: React.RefObject<any>;
  onSelect: () => void;
  onChange: (updates: Partial<ShapeData>) => void;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export default function GardenShape3D({ shape, isSelected, transformMode, orbitRef, onSelect, onChange }: Props) {
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

  // Pre-compute polygon shape — always called (hooks rule), only used when shape_type === polygon
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

  const handleRotateChange = () => {
    if (!meshRef.current) return;
    const deg = (meshRef.current.rotation.y * 180) / Math.PI;
    onChange({ rotation: round3(-deg) });
  };

  const transformControls = isSelected ? (
    <TransformControls
      object={meshRef}
      mode={transformMode}
      showY={false}
      translationSnap={0.1}
      rotationSnap={Math.PI / 12}
      onMouseDown={() => { if (orbitRef.current) orbitRef.current.enabled = false; }}
      onMouseUp={() => { if (orbitRef.current) orbitRef.current.enabled = true; }}
      onChange={transformMode === "rotate" ? handleRotateChange : handleTransformChange}
    />
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
        {transformControls}
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
        {transformControls}
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
        {transformControls}
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
        {isSelected && (
          <TransformControls
            object={meshRef}
            mode="translate"
            showY={false}
            translationSnap={0.1}
            onMouseDown={() => { if (orbitRef.current) orbitRef.current.enabled = false; }}
            onMouseUp={() => { if (orbitRef.current) orbitRef.current.enabled = true; }}
            onChange={handlePolyChange}
          />
        )}
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
      {transformControls}
    </group>
  );
}
