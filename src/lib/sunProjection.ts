import SunCalc from "suncalc";

const DEG = Math.PI / 180;

// Typical rear-camera FOV for a mobile device
export const DEFAULT_HFOV_RAD = 62 * DEG;
export const DEFAULT_VFOV_RAD = 48 * DEG;

export interface SunProjection {
  x: number;         // 0..1 normalised screen x (left→right)
  y: number;         // 0..1 normalised screen y (top→bottom)
  visible: boolean;  // sun is within the camera frame and above horizon
  edgeAngle: number; // angle toward sun from screen centre (radians, for off-screen arrow)
}

/**
 * Project sun's sky position onto camera screen coordinates.
 *
 * @param sunAzimuthRad  - SunCalc azimuth (0=South, increasing westward)
 * @param sunAltitudeRad - SunCalc altitude above horizon (radians, negative = below horizon)
 * @param deviceAlphaRad - Compass bearing the camera is pointing (0=North, CW, radians)
 * @param cameraTiltRad  - Tilt above horizon (0=horizontal, π/2=pointing at zenith, radians)
 *                         Derive from DeviceOrientationEvent.beta: (beta − 90) × π/180
 * @param hFovRad        - Horizontal field of view (default 62°)
 * @param vFovRad        - Vertical field of view (default 48°)
 */
export function projectSunToScreen(
  sunAzimuthRad: number,
  sunAltitudeRad: number,
  deviceAlphaRad: number,
  cameraTiltRad: number,
  hFovRad: number = DEFAULT_HFOV_RAD,
  vFovRad: number = DEFAULT_VFOV_RAD,
): SunProjection {
  // SunCalc azimuth (0=S, +W) → compass bearing (0=N, +CW)
  const compassBearing =
    ((sunAzimuthRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  // Horizontal angular offset from camera's pointing direction
  let dAz = compassBearing - deviceAlphaRad;
  while (dAz > Math.PI) dAz -= 2 * Math.PI;
  while (dAz < -Math.PI) dAz += 2 * Math.PI;

  // Vertical angular offset
  const dEl = sunAltitudeRad - cameraTiltRad;

  // Normalised screen position (0..1)
  const x = 0.5 + Math.sin(dAz) / (2 * Math.sin(hFovRad / 2));
  const y = 0.5 - Math.sin(dEl) / (2 * Math.sin(vFovRad / 2));

  const visible =
    Math.abs(dAz) <= hFovRad / 2 &&
    Math.abs(dEl) <= vFovRad / 2 &&
    sunAltitudeRad > 0;

  // Direction toward sun from screen centre (used when sun is off-screen)
  const edgeAngle = Math.atan2(dAz, -dEl);

  return { x, y, visible, edgeAngle };
}

/**
 * Convert SunCalc azimuth to compass bearing in degrees (0=North, CW).
 */
export function sunCalcAzimuthToCompassDeg(azimuthRad: number): number {
  return (((azimuthRad + Math.PI) / (2 * Math.PI)) * 360 + 360) % 360;
}

/**
 * Shadow direction in compass degrees (opposite the sun).
 */
export function shadowBearingDeg(sunAzimuthRad: number): number {
  return (sunCalcAzimuthToCompassDeg(sunAzimuthRad) + 180) % 360;
}

/**
 * Approximate shadow-length multiplier = 1 / tan(altitude).
 * Clamped to [0.2, 20] to avoid explosion near sunrise/sunset.
 */
export function shadowLengthMultiplier(sunAltitudeRad: number): number {
  if (sunAltitudeRad <= 0) return 20;
  return Math.min(20, Math.max(0.2, 1 / Math.tan(sunAltitudeRad)));
}

/**
 * Sky-dome projection: converts sun bearing + altitude to a 2D point inside a
 * unit circle where the centre is the zenith and the edge is the horizon.
 *
 * @param compassBearingRad - Compass bearing (0=North, CW, radians)
 * @param altitudeRad       - Sun altitude (0=horizon, π/2=zenith)
 * @returns { nx, ny } normalised to the dome's radius (−1..1)
 */
export function projectSunToDome(
  compassBearingRad: number,
  altitudeRad: number,
): { nx: number; ny: number } {
  const r = 1 - altitudeRad / (Math.PI / 2); // 0 at zenith, 1 at horizon
  return {
    nx: Math.sin(compassBearingRad) * r,
    ny: -Math.cos(compassBearingRad) * r,
  };
}

/** Convenience wrapper: get current sun position for given lat/lng/date. */
export function getSunPosition(lat: number, lng: number, date: Date) {
  return SunCalc.getPosition(date, lat, lng);
}
