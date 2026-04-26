export type Hemisphere = "northern" | "southern";

export function getFrequencyDays(wateringTerm: string): number {
  const term = wateringTerm?.toLowerCase() || "";
  if (term.includes("frequent")) return 3;
  if (term.includes("average")) return 7;
  if (term.includes("minimum")) return 21;
  return 7;
}

export function getHemisphere(country?: string, timezone?: string): Hemisphere {
  const southernCountries = [
    "australia",
    "new zealand",
    "brazil",
    "south africa",
    "argentina",
    "chile",
    "peru",
  ];
  const searchString = `${country || ""} ${timezone || ""}`.toLowerCase();
  return southernCountries.some((c) => searchString.includes(c))
    ? "southern"
    : "northern";
}

export function normalizePeriods(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap((i) => normalizePeriods(i));
  if (typeof input === "string") {
    return input
      .split(/,|\band\b|&/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function getSinglePeriodRange(
  period: string,
  hemisphere: Hemisphere,
): { start: string; end: string } {
  const p = period.toLowerCase();
  if (p.includes("jan")) return { start: "01-01", end: "01-31" };
  if (p.includes("feb")) return { start: "02-01", end: "02-28" };
  if (p.includes("mar")) return { start: "03-01", end: "03-31" };
  if (p.includes("apr")) return { start: "04-01", end: "04-30" };
  if (p.includes("may")) return { start: "05-01", end: "05-31" };
  if (p.includes("jun")) return { start: "06-01", end: "06-30" };
  if (p.includes("jul")) return { start: "07-01", end: "07-31" };
  if (p.includes("aug")) return { start: "08-01", end: "08-31" };
  if (p.includes("sep")) return { start: "09-01", end: "09-30" };
  if (p.includes("oct")) return { start: "10-01", end: "10-31" };
  if (p.includes("nov")) return { start: "11-01", end: "11-30" };
  if (p.includes("dec")) return { start: "12-01", end: "12-31" };
  if (p.includes("spring"))
    return hemisphere === "northern"
      ? { start: "03-01", end: "05-31" }
      : { start: "09-01", end: "11-30" };
  if (p.includes("summer"))
    return hemisphere === "northern"
      ? { start: "06-01", end: "08-31" }
      : { start: "12-01", end: "02-28" };
  if (p.includes("fall") || p.includes("autumn"))
    return hemisphere === "northern"
      ? { start: "09-01", end: "11-30" }
      : { start: "03-01", end: "05-31" };
  if (p.includes("winter"))
    return hemisphere === "northern"
      ? { start: "12-01", end: "02-28" }
      : { start: "06-01", end: "08-31" };
  return { start: "01-01", end: "12-31" };
}
