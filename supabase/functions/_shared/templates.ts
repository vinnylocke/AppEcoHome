const TEMPLATES: Record<string, string> = {
  consecutive_postponements:
    "Looks like {plant_name} watering has been pushed back {count} times in a row — might be worth adjusting the schedule.",
  neglected_plant:
    "{plant_name} hasn't had any attention in {days} days. A quick check-in might be due.",
  high_postpone_rate:
    "You've postponed {plant_name} tasks {rate}% of the time recently. A less frequent schedule might suit it better.",
  streak_broken:
    "You had a {streak}-day care streak going — nice work. {plant_name} is lucky to have you.",
};

export function buildMessage(
  insightKey: string,
  vars: Record<string, unknown>,
): string {
  const template = TEMPLATES[insightKey];
  if (!template) return `Pattern detected: ${insightKey}`;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(vars[key] ?? `{${key}}`),
  );
}
