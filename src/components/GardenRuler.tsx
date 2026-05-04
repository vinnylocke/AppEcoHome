import React from "react";
import { Layer, Line, Text, Rect } from "react-konva";

interface Props {
  canvasWm: number;
  canvasHm: number;
  pxPerM: number;
  offsetX: number;
  offsetY: number;
}

const MAJOR = 1;     // major grid line every 1m
const MINOR = 0.5;   // minor grid line every 0.5m
const RULER_SIZE = 24; // px for ruler strip width

export default function GardenRuler({ canvasWm, canvasHm, pxPerM, offsetX, offsetY }: Props) {
  const majorLines: React.ReactNode[] = [];
  const minorLines: React.ReactNode[] = [];
  const rulerTopLabels: React.ReactNode[] = [];
  const rulerLeftLabels: React.ReactNode[] = [];

  const w = canvasWm * pxPerM;
  const h = canvasHm * pxPerM;

  // Vertical grid lines (x axis)
  for (let x = 0; x <= canvasWm; x += MINOR) {
    const isMajor = Math.abs(x % MAJOR) < 0.001;
    const px = x * pxPerM;
    const arr = isMajor ? majorLines : minorLines;
    arr.push(
      <Line
        key={`vl-${x}`}
        points={[px, 0, px, h]}
        stroke={isMajor ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)"}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />
    );
    if (isMajor && x > 0) {
      rulerTopLabels.push(
        <Text
          key={`rt-${x}`}
          x={px - 14}
          y={-RULER_SIZE + 6}
          text={`${x}m`}
          fontSize={9}
          fontStyle="bold"
          fill="rgba(0,0,0,0.35)"
          listening={false}
        />
      );
    }
  }

  // Horizontal grid lines (y axis)
  for (let y = 0; y <= canvasHm; y += MINOR) {
    const isMajor = Math.abs(y % MAJOR) < 0.001;
    const py = y * pxPerM;
    const arr = isMajor ? majorLines : minorLines;
    arr.push(
      <Line
        key={`hl-${y}`}
        points={[0, py, w, py]}
        stroke={isMajor ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)"}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />
    );
    if (isMajor && y > 0) {
      rulerLeftLabels.push(
        <Text
          key={`rl-${y}`}
          x={-RULER_SIZE + 2}
          y={py - 6}
          text={`${y}m`}
          fontSize={9}
          fontStyle="bold"
          fill="rgba(0,0,0,0.35)"
          listening={false}
        />
      );
    }
  }

  // Canvas border
  const border = (
    <Rect
      x={0}
      y={0}
      width={w}
      height={h}
      stroke="rgba(0,0,0,0.2)"
      strokeWidth={1}
      fill="rgba(255,255,255,0.9)"
      listening={false}
    />
  );

  return (
    <Layer x={offsetX} y={offsetY}>
      {border}
      {minorLines}
      {majorLines}
      {rulerTopLabels}
      {rulerLeftLabels}
    </Layer>
  );
}
