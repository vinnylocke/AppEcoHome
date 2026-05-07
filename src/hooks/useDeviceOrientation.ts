import { useState, useEffect, useCallback, useRef } from "react";

export interface DeviceOrientationState {
  alpha: number;    // compass bearing (0=North, CW, degrees)
  beta: number;     // front-back tilt (0=flat, 90=vertical portrait, degrees)
  gamma: number;    // left-right tilt (degrees)
  granted: boolean;
  supported: boolean;
  error: string | null;
}

const DEFAULT_STATE: DeviceOrientationState = {
  alpha: 0,
  beta: 90,
  gamma: 0,
  granted: false,
  supported: false,
  error: null,
};

export interface UseDeviceOrientationResult extends DeviceOrientationState {
  requestPermission: () => Promise<void>;
}

export function useDeviceOrientation(): UseDeviceOrientationResult {
  const [state, setState] = useState<DeviceOrientationState>(DEFAULT_STATE);
  const cleanupRef = useRef<(() => void) | null>(null);

  const handleEvent = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha === null) return;
    setState((prev) => ({
      ...prev,
      alpha: e.alpha!,
      beta: e.beta ?? 90,
      gamma: e.gamma ?? 0,
      granted: true,
      supported: true,
      error: null,
    }));
  }, []);

  const attachListener = useCallback(() => {
    window.addEventListener("deviceorientation", handleEvent, true);
    const cleanup = () => window.removeEventListener("deviceorientation", handleEvent, true);
    cleanupRef.current = cleanup;
    return cleanup;
  }, [handleEvent]);

  useEffect(() => {
    if (!("DeviceOrientationEvent" in window)) {
      setState((prev) => ({
        ...prev,
        supported: false,
        error: "Device orientation not supported on this device",
      }));
      return;
    }

    // iOS 13+: requestPermission() must be called from a user gesture
    if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
      setState((prev) => ({ ...prev, supported: true }));
      return; // wait for explicit requestPermission call
    }

    // Android / non-iOS: start immediately
    setState((prev) => ({ ...prev, supported: true, granted: true }));
    return attachListener();
  }, [attachListener]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission !== "function") {
      // Already attached on non-iOS, nothing to do
      return;
    }
    try {
      const result = await (DeviceOrientationEvent as any).requestPermission();
      if (result === "granted") {
        attachListener();
        setState((prev) => ({ ...prev, granted: true, error: null }));
      } else {
        setState((prev) => ({
          ...prev,
          granted: false,
          error: "Orientation permission denied — sky dome view active",
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Could not request orientation permission",
      }));
    }
  }, [attachListener]);

  return { ...state, requestPermission };
}
