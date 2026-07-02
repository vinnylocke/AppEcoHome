export type Hemisphere = "northern" | "southern";

export function getFrequencyDays(wateringTerm: string): number {
  const term = wateringTerm?.toLowerCase() || "";
  if (term.includes("frequent")) return 3;
  if (term.includes("average")) return 7;
  if (term.includes("minimum")) return 21;
  return 7;
}

export function getHemisphere(
  country?: string,
  timezone?: string,
  lat?: number | null,
): Hemisphere {
  // Latitude is authoritative when known — the country list below is a
  // heuristic that misclassifies much of the southern hemisphere.
  if (typeof lat === "number" && Number.isFinite(lat) && lat !== 0) {
    return lat < 0 ? "southern" : "northern";
  }
  const southernCountries = [
    "australia",
    "new zealand",
    "brazil",
    "south africa",
    "argentina",
    "chile",
    "peru",
    "uruguay",
    "paraguay",
    "bolivia",
    "ecuador",
    "indonesia",
    "madagascar",
    "zimbabwe",
    "namibia",
    "botswana",
    "mozambique",
    "zambia",
    "malawi",
    "angola",
    "tanzania",
    "fiji",
    "papua new guinea",
    "samoa",
    "vanuatu",
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

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthRange(idx: number): { start: string; end: string } {
  const mm = String(idx + 1).padStart(2, "0");
  return { start: `${mm}-01`, end: `${mm}-${String(MONTH_DAYS[idx]).padStart(2, "0")}` };
}

export function getSinglePeriodRange(
  period: string,
  hemisphere: Hemisphere,
): { start: string; end: string } {
  const p = period.toLowerCase();

  // Month names from the plant providers (Perenual/Verdantly) are calibrated
  // to the northern hemisphere — shift them 6 months for southern users, or
  // an Australian tomato gets a midwinter "June harvest" blueprint (the
  // season names below were already shifted; explicit months were not).
  // Multiple month mentions ("June to August") span first→last instead of
  // truncating to the first match.
  const shift = hemisphere === "southern" ? 6 : 0;
  const mentioned = MONTH_KEYS
    .map((key, idx) => ({ idx, pos: p.indexOf(key) }))
    .filter((m) => m.pos >= 0)
    .sort((a, b) => a.pos - b.pos);
  if (mentioned.length > 0) {
    const startIdx = (mentioned[0].idx + shift) % 12;
    const endIdx = (mentioned[mentioned.length - 1].idx + shift) % 12;
    return { start: monthRange(startIdx).start, end: monthRange(endIdx).end };
  }

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
