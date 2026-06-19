// Shape of `user_profiles.voice_settings` (jsonb) + a merge helper.
//
// The whole jsonb is replaced on write, so the auto-read toggle and the voice
// picker must MERGE their patch into the existing object — otherwise saving one
// would wipe the other.

export interface VoiceSettings {
  auto_read_assistant_replies?: boolean;
  preferred_voice?: string;
}

export function mergeVoiceSettings(
  prev: VoiceSettings | null | undefined,
  patch: Partial<VoiceSettings>,
): VoiceSettings {
  return { ...(prev ?? {}), ...patch };
}
