import React, { useRef, useCallback } from "react";

interface Props {
  value: number;       // clockwise degrees from canvas-up to real-world North
  onChange: (deg: number) => void;
  size?: number;
}

export default function GardenCompass({ value, onChange, size = 96 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;
  const arrowLen = r - 4;
  const isDragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const getAngle = useCallback((clientX: number, clientY: number): number => {
    if (!svgRef.current) return value;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    return Math.round(((angle % 360) + 360) % 360);
  }, [value]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    onChange(getAngle(e.clientX, e.clientY));

    const onMove = (ev: PointerEvent) => {
      if (!isDragging.current) return;
      onChange(getAngle(ev.clientX, ev.clientY));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [getAngle, onChange]);

  const rad = (value * Math.PI) / 180;
  const tipX = cx + arrowLen * Math.sin(rad);
  const tipY = cy - arrowLen * Math.cos(rad);
  const tailX = cx - (arrowLen * 0.45) * Math.sin(rad);
  const tailY = cy + (arrowLen * 0.45) * Math.cos(rad);

  const cardinals = ["N", "E", "S", "W"];

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ cursor: "grab", userSelect: "none", touchAction: "none" }}
      onMouseDown={handleMouseDown}
      role="slider"
      aria-label="Garden north orientation"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={359}
    >
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="#f8faf8" stroke="#d1d5db" strokeWidth={1.5} />

      {/* Cardinal tick marks and labels */}
      {cardinals.map((label, i) => {
        const a = (i * 90 * Math.PI) / 180;
        const tx = cx + (r - 10) * Math.sin(a);
        const ty = cy - (r - 10) * Math.cos(a);
        const lx = cx + (r + 1) * Math.sin(a);
        const ly = cy - (r + 1) * Math.cos(a);
        return (
          <g key={label}>
            <line
              x1={cx + (r - 6) * Math.sin(a)} y1={cy - (r - 6) * Math.cos(a)}
              x2={cx + r * Math.sin(a)} y2={cy - r * Math.cos(a)}
              stroke="#9ca3af" strokeWidth={1.5}
            />
            <text x={tx} y={ty + 4} textAnchor="middle" fontSize={8} fontWeight="700" fill="#6b7280">
              {label}
            </text>
          </g>
        );
      })}

      {/* Fixed canvas-up reference marker */}
      <text x={cx} y={9} textAnchor="middle" fontSize={8} fill="#d1d5db" fontWeight="bold">▲</text>

      {/* South tail (grey) */}
      <line x1={cx} y1={cy} x2={tailX} y2={tailY} stroke="#9ca3af" strokeWidth={2.5} strokeLinecap="round" />
      {/* North arrow (primary colour) */}
      <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke="var(--color-rhozly-primary, #22c55e)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={tipX} cy={tipY} r={4} fill="var(--color-rhozly-primary, #22c55e)" />
      {/* Centre pivot */}
      <circle cx={cx} cy={cy} r={3} fill="#6b7280" />
    </svg>
  );
}
