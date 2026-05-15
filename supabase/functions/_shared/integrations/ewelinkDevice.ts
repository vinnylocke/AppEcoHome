const DEFAULT_DURATION_SECONDS = 1800;

export function resolveEffectiveDuration(
  durationSeconds: number | undefined,
  meta: Record<string, unknown>,
): number {
  if (durationSeconds !== undefined) return durationSeconds;
  if (typeof meta.default_duration_seconds === "number") return meta.default_duration_seconds;
  return DEFAULT_DURATION_SECONDS;
}

export function buildControlPayload(
  meta: Record<string, unknown>,
  command: "turn_on" | "turn_off",
  durationSeconds: number,
  externalDeviceId?: string,
): { apiPath: string; payload: Record<string, unknown> } {
  const switchState = command === "turn_on" ? "on" : "off";

  // Sub-devices: address the valve directly by its own device ID.
  // The eWeLink cloud routes through the bridge transparently.
  if (meta.use_sub_device) {
    const targetId = externalDeviceId ?? meta.sub_device_id ?? meta.parent_device_id;
    return {
      apiPath: "/v2/device/thing/status",
      payload: {
        type: 1,
        id: targetId,
        params: {
          switch: switchState,
          ...(command === "turn_on" ? { countdown: durationSeconds } : {}),
        },
      },
    };
  }

  return {
    apiPath: "/v2/device/thing/status",
    payload: {
      type: 1,
      id: meta.direct_device_id,
      params: {
        switch: switchState,
        ...(command === "turn_on" ? { countdown: durationSeconds } : {}),
      },
    },
  };
}

export function parseDeviceState(
  stateJsonData: Record<string, unknown>,
): "on" | "off" {
  const params = (stateJsonData?.params ?? {}) as Record<string, unknown>;
  const switches = params.switches as Array<Record<string, unknown>> | undefined;
  const raw: string = (params.switch as string) ?? (switches?.[0]?.switch as string) ?? "off";
  return raw === "on" ? "on" : "off";
}
