import type { Persona } from "./persona.ts";

// Pattern-insight wording, persona-tailored. A value is either one string (same
// for everyone) or per-persona variants. new = warm + encouraging; experienced =
// terse + numbers-forward; default = the balanced middle. Deterministic — no AI.
type Template = string | { default: string; new?: string; experienced?: string };

const TEMPLATES: Record<string, Template> = {
  consecutive_postponements: {
    default: "Looks like {plant_name} watering has been pushed back {count} times in a row — might be worth adjusting the schedule.",
    new: "Your {plant_name} watering has slipped {count} times in a row — no stress; nudging the schedule a little gentler usually does the trick.",
    experienced: "{plant_name}: {count} consecutive watering postponements — consider re-cadencing.",
  },
  neglected_plant: {
    default: "{plant_name} hasn't had any attention in {days} days. A quick check-in might be due.",
    new: "{plant_name} hasn't been checked in {days} days — pop out and give it a quick look when you get a chance.",
    experienced: "{plant_name}: {days}d since last logged care.",
  },
  high_postpone_rate: {
    default: "You've postponed {plant_name} tasks {rate}% of the time recently. A less frequent schedule might suit it better.",
    new: "You've been putting off {plant_name} tasks about {rate}% of the time — usually a sign the schedule's a touch too keen. Try easing it.",
    experienced: "{plant_name}: {rate}% postpone rate — schedule likely over-frequent.",
  },
  streak_broken:
    "You had a {streak}-day care streak going — nice work. {plant_name} is lucky to have you.",
  blueprint_postpone_rate: {
    default: "You've postponed '{task_name}' {count} times this month — it might be worth tweaking the schedule.",
    new: "'{task_name}' has slipped {count} times this month — totally normal; easing the schedule can help it stick.",
    experienced: "'{task_name}': {count} postponements this month — re-cadence.",
  },
  soil_drydown_watering: {
    default: "{plant_name} is in {area_name}, which dries out fast (~{rate}%/day). {advice}",
    experienced: "{plant_name} · {area_name}: ~{rate}%/day drydown. {advice}",
  },
  harvest_ready: {
    default: "{plant_name} is likely ready to harvest — about {days} days since you planted it. Worth a look.",
    new: "Exciting bit — your {plant_name} should be about ready to harvest (~{days} days in). Have a look and pick what's ripe!",
    experienced: "{plant_name}: ~{days}d since planting — within harvest window.",
  },
};

export function buildMessage(
  insightKey: string,
  persona: Persona,
  vars: Record<string, unknown>,
): string {
  const t = TEMPLATES[insightKey];
  if (!t) return `Pattern detected: ${insightKey}`;
  const template = typeof t === "string"
    ? t
    : persona === "new"
    ? (t.new ?? t.default)
    : persona === "experienced"
    ? (t.experienced ?? t.default)
    : t.default;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
