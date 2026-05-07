import { describe, it, expect } from "vitest";
import {
  projectSunToScreen,
  sunCalcAzimuthToCompassDeg,
  shadowBearingDeg,
  shadowLengthMultiplier,
  projectSunToDome,
  DEFAULT_HFOV_RAD,
  DEFAULT_VFOV_RAD,
} from "../../../src/lib/sunProjection";

const DEG = Math.PI / 180;

describe("sunCalcAzimuthToCompassDeg", () => {
  it("converts SunCalc 0 (South) to 180°", () => {
    expect(sunCalcAzimuthToCompassDeg(0)).toBeCloseTo(180, 1);
  });
  it("converts SunCalc π (North) to 0°", () => {
    expect(sunCalcAzimuthToCompassDeg(Math.PI)).toBeCloseTo(0, 1);
  });
  it("converts SunCalc π/2 (West) to 270°", () => {
    expect(sunCalcAzimuthToCompassDeg(Math.PI / 2)).toBeCloseTo(270, 1);
  });
  it("converts SunCalc -π/2 (East) to 90°", () => {
    expect(sunCalcAzimuthToCompassDeg(-Math.PI / 2)).toBeCloseTo(90, 1);
  });
});

describe("shadowBearingDeg", () => {
  it("shadow from southern sun points north (0°)", () => {
    // Sun at south (azimuth=0) → shadow points north (0°)
    expect(shadowBearingDeg(0)).toBeCloseTo(0, 0);
  });
  it("shadow from northern sun points south (180°)", () => {
    expect(shadowBearingDeg(Math.PI)).toBeCloseTo(180, 0);
  });
});

describe("shadowLengthMultiplier", () => {
  it("returns max 20 for sun at horizon or below", () => {
    expect(shadowLengthMultiplier(0)).toBe(20);
    expect(shadowLengthMultiplier(-0.1)).toBe(20);
  });
  it("returns ~1 for sun at 45°", () => {
    expect(shadowLengthMultiplier(45 * DEG)).toBeCloseTo(1, 1);
  });
  it("returns shorter shadow for higher sun", () => {
    const low = shadowLengthMultiplier(20 * DEG);
    const high = shadowLengthMultiplier(60 * DEG);
    expect(low).toBeGreaterThan(high);
  });
});

describe("projectSunToScreen", () => {
  // Camera facing due North (alpha=0), horizontal (tilt=0)
  const northFacing = { alphaRad: 0, cameraTilt: 0 };

  it("sun due north at 15° altitude → visible, centre-top of screen", () => {
    // Camera horizontal (tilt=0) has ±24° vertical FOV; 15° is within that range
    const proj = projectSunToScreen(
      Math.PI,
      15 * DEG,
      northFacing.alphaRad,
      northFacing.cameraTilt,
    );
    expect(proj.x).toBeCloseTo(0.5, 1); // horizontally centred
    expect(proj.y).toBeLessThan(0.5);   // above centre (upward)
    expect(proj.visible).toBe(true);
  });

  it("sun at 30° altitude is off-screen when camera faces level (exceeds ±24° VFOV)", () => {
    const proj = projectSunToScreen(
      Math.PI,
      30 * DEG,
      northFacing.alphaRad,
      northFacing.cameraTilt,
    );
    expect(proj.visible).toBe(false);
  });

  it("sun due south is off-screen when camera faces north", () => {
    // Sun at South (azimuth=0), camera faces North
    const proj = projectSunToScreen(
      0,
      30 * DEG,
      northFacing.alphaRad,
      northFacing.cameraTilt,
    );
    expect(proj.visible).toBe(false);
  });

  it("sun below horizon is never visible", () => {
    const proj = projectSunToScreen(
      Math.PI, // North
      -5 * DEG, // below horizon
      northFacing.alphaRad,
      northFacing.cameraTilt,
    );
    expect(proj.visible).toBe(false);
  });

  it("sun at exact camera direction is centred on screen", () => {
    const alpha = 45 * DEG; // camera faces NE
    const tilt = 20 * DEG;  // tilted 20° above horizon
    // Sun at NE (compass 45° = SunCalc azimuth? 45° compass → azimuth = 45-180 = -135° → -135*DEG)
    // compassBearing = ((az + π) mod 2π) → to get compass=45°:
    // 45*DEG = ((az + π) % 2π + 2π) % 2π → az = 45*DEG - π
    const sunAzimuth = 45 * DEG - Math.PI;
    const proj = projectSunToScreen(sunAzimuth, tilt, alpha, tilt);
    expect(proj.x).toBeCloseTo(0.5, 1);
    expect(proj.y).toBeCloseTo(0.5, 1);
    expect(proj.visible).toBe(true);
  });

  it("x grows rightward when sun is east of camera heading", () => {
    // Camera faces North, sun at NE
    const sunAzimuth = -Math.PI / 2 + 0.2; // roughly east-ish
    const proj = projectSunToScreen(sunAzimuth, 30 * DEG, 0, 0);
    expect(proj.x).toBeGreaterThan(0.5);
  });
});

describe("projectSunToDome", () => {
  it("sun at zenith (altitude π/2) maps to centre", () => {
    const pd = projectSunToDome(0, Math.PI / 2);
    expect(pd.nx).toBeCloseTo(0, 5);
    expect(pd.ny).toBeCloseTo(0, 5);
  });

  it("sun at horizon (altitude 0) maps to edge (r=1)", () => {
    const pd = projectSunToDome(0, 0);
    const r = Math.sqrt(pd.nx * pd.nx + pd.ny * pd.ny);
    expect(r).toBeCloseTo(1, 5);
  });

  it("sun at North horizon maps to top of dome (ny=-1)", () => {
    const pd = projectSunToDome(0, 0); // North bearing = 0, altitude = 0
    expect(pd.nx).toBeCloseTo(0, 5);
    expect(pd.ny).toBeCloseTo(-1, 5);
  });

  it("sun at East horizon maps to right of dome (nx=1)", () => {
    const pd = projectSunToDome(Math.PI / 2, 0);
    expect(pd.nx).toBeCloseTo(1, 5);
    expect(pd.ny).toBeCloseTo(0, 5);
  });
});
