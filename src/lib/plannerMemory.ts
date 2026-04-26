import { supabase } from "./supabase";

export async function saveMemoryEvent(
  homeId: string,
  planId: string,
  eventType: string,
  extra: Record<string, any> = {},
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("planner_ai_memory").insert({
      home_id: homeId,
      user_id: user?.id,
      plan_id: planId,
      event_type: eventType,
      raw_data: extra,
    });
  } catch (err) {
    console.warn("Memory event save failed (non-critical):", err);
  }
}

export async function saveInitialPromptMemory(
  homeId: string,
  planId: string,
  formData: any,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    await supabase.from("planner_ai_memory").insert({
      home_id: homeId,
      user_id: userId,
      plan_id: planId,
      event_type: "initial_prompt",
      raw_data: formData,
    });

    const prefs: any[] = [];
    const base = { home_id: homeId, user_id: userId };

    if (formData.aesthetic)
      prefs.push({ ...base, entity_type: "aesthetic", entity_name: formData.aesthetic, sentiment: "positive", reason: null });
    if (formData.difficulty)
      prefs.push({ ...base, entity_type: "difficulty", entity_name: formData.difficulty, sentiment: "positive", reason: null });
    if (formData.maintenance)
      prefs.push({ ...base, entity_type: "maintenance", entity_name: formData.maintenance, sentiment: "positive", reason: null });

    formData.wildlife
      ?.split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .forEach((w: string) =>
        prefs.push({ ...base, entity_type: "wildlife", entity_name: w, sentiment: "positive", reason: "User specified wildlife goal" }),
      );

    formData.inclusivePlants
      ?.split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .forEach((p: string) =>
        prefs.push({ ...base, entity_type: "plant", entity_name: p, sentiment: "positive", reason: "Explicitly requested by user" }),
      );

    formData.exclusivePlants
      ?.split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .forEach((p: string) =>
        prefs.push({ ...base, entity_type: "plant", entity_name: p, sentiment: "negative", reason: "Explicitly excluded by user" }),
      );

    if (prefs.length > 0) {
      await supabase.from("planner_preferences").insert(prefs);
    }
  } catch (err) {
    console.warn("Memory save failed (non-critical):", err);
  }
}
