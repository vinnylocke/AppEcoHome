// Client-side bulk-paste parser for The Nursery.
//
// Two paths:
//   - Sage+   → `parse-seed-packets` edge function (Gemini, see service wrapper)
//   - Sprout/ → `parseSeedPacketsLocal` regex fallback in this module
//     Botanist  matches the documented grammar:
//                 {name} ({vendor}, sow-by {date}, opened {date}, qty)
//
// Both return the same `ParsedSeedPacket` shape so the review UI is
// identical across tiers.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";

export interface ParsedSeedPacket {
  common_name: string;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
}

// ── AI parser (Sage+) ─────────────────────────────────────────────────────

export async function parseSeedPacketsAi(
  homeId: string,
  text: string,
): Promise<ParsedSeedPacket[]> {
  const { data, error } = await supabase.functions.invoke("parse-seed-packets", {
    body: { homeId, text },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.packets) ? (data.packets as ParsedSeedPacket[]) : [];
}

// ── Regex fallback (Sprout / Botanist) ────────────────────────────────────

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Parse a date phrase like "2027-12-15", "2027-12", "Dec 2027", "December 2027",
 * "May 2024" into an ISO YYYY-MM-DD string.
 *
 * @param phrase      The free-form date text.
 * @param fieldType   Determines month-fallback behaviour:
 *                      "purchased" / "opened" → first of the month
 *                      "sow_by"               → last day of the month
 *                                               (year-only → Dec 31)
 */
function parseDatePhrase(
  phrase: string,
  fieldType: "purchased" | "opened" | "sow_by",
): string | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  // Full ISO date.
  const isoFull = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoFull) {
    const y = Number(isoFull[1]);
    const m = Number(isoFull[2]);
    const d = Number(isoFull[3]);
    if (y >= 1980 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return null;
  }

  // ISO year-month.
  const isoYm = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoYm) {
    const y = Number(isoYm[1]);
    const m = Number(isoYm[2]);
    if (y >= 1980 && y <= 2100 && m >= 1 && m <= 12) {
      const day = fieldType === "sow_by" ? daysInMonth(y, m) : 1;
      return `${y}-${pad2(m)}-${pad2(day)}`;
    }
    return null;
  }

  // "MonthName Year" or "Year MonthName".
  const named = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$|^(\d{4})\s+([A-Za-z]+)$/);
  if (named) {
    const monthWord = (named[1] ?? named[4] ?? "").toLowerCase();
    const year = Number(named[2] ?? named[3]);
    const month = MONTH_BY_NAME[monthWord];
    if (month && year >= 1980 && year <= 2100) {
      const day = fieldType === "sow_by" ? daysInMonth(year, month) : 1;
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  // Year-only — only meaningful for sow_by (treat as Dec 31).
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    if (y >= 1980 && y <= 2100 && fieldType === "sow_by") {
      return `${y}-12-31`;
    }
  }

  return null;
}

/**
 * Parse the part of a packet line INSIDE the parentheses (the "details"
 * block). Accepts comma- and slash-separated key:value pairs. Extracts:
 *   - sow-by / sow by / sowby           → sow_by
 *   - opened / opened on                → opened_on
 *   - purchased / bought                → purchased_on
 *   - vendor / from                     → vendor
 *   - qty: 30 / ~30 seeds / 30 seeds    → quantity_remaining
 *
 * Anything that doesn't match a known key but looks like a vendor (no
 * digits, < 60 chars) is assumed to be a vendor when one isn't already set.
 */
function parseDetailsBlock(details: string): Omit<ParsedSeedPacket, "common_name" | "variety" | "notes"> & { notes: string | null } {
  const out: {
    vendor: string | null;
    purchased_on: string | null;
    opened_on: string | null;
    sow_by: string | null;
    quantity_remaining: string | null;
    notes: string | null;
  } = {
    vendor: null,
    purchased_on: null,
    opened_on: null,
    sow_by: null,
    quantity_remaining: null,
    notes: null,
  };

  const unhandled: string[] = [];

  for (const rawPart of details.split(/[,/]/)) {
    const part = rawPart.trim();
    if (!part) continue;

    // Quantity heuristics — try first since "30 seeds" looks like junk to the kv extractor.
    if (!out.quantity_remaining) {
      const qtyMatch = part.match(/^~?\s*(\d+)\s*(seeds?|x|pkt|packets?)?$/i);
      if (qtyMatch) {
        out.quantity_remaining = part;
        continue;
      }
      const altQty = part.match(/^(half|quarter|few|several|lots)\b/i);
      if (altQty) {
        out.quantity_remaining = part;
        continue;
      }
    }

    // Key-value extractors.
    const kv = part.match(/^([a-z][a-z\s-]+?)\s*[:\s]+(.*)$/i);
    if (kv) {
      const key = kv[1].toLowerCase().trim();
      const value = kv[2].trim();
      if (/^sow[-\s]?by$/.test(key) || key === "sow by") {
        out.sow_by ??= parseDatePhrase(value, "sow_by");
        continue;
      }
      if (key === "opened" || key === "opened on" || key === "opened-on") {
        out.opened_on ??= parseDatePhrase(value, "opened");
        continue;
      }
      if (key === "purchased" || key === "bought" || key === "purchased on") {
        out.purchased_on ??= parseDatePhrase(value, "purchased");
        continue;
      }
      if (key === "vendor" || key === "from") {
        out.vendor ??= value;
        continue;
      }
      if (key === "qty" || key === "quantity") {
        out.quantity_remaining ??= value;
        continue;
      }
    }

    // No recognised key — if it looks like a clean vendor name, use it once.
    if (!out.vendor && /^[A-Za-z][A-Za-z'\s&.]{1,58}$/.test(part)) {
      out.vendor = part;
      continue;
    }

    unhandled.push(part);
  }

  if (unhandled.length > 0) {
    out.notes = unhandled.join(", ");
  }
  return out;
}

/**
 * Pure regex parser. Best-effort; one packet per non-empty line that
 * matches `{name} ({details})` or `{name} - {details}`.
 *
 * Lines that don't match return nothing — the UI surfaces a count so
 * the user knows when they need to clean up the paste.
 */
export function parseSeedPacketsLocal(text: string): ParsedSeedPacket[] {
  const out: ParsedSeedPacket[] = [];
  if (!text || typeof text !== "string") return out;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    if (out.length >= 60) break;

    // Style 1 — `{name} ({details})`
    const paren = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    let name: string;
    let details: string | null;
    if (paren) {
      name = paren[1].trim();
      details = paren[2].trim();
    } else {
      // Style 2 — `{name} - {details}` or `{name}: {details}` or just `{name}`.
      const dashIdx = line.search(/\s[-—–:]\s/);
      if (dashIdx > 0) {
        name = line.slice(0, dashIdx).trim();
        details = line.slice(dashIdx + 3).trim();
      } else {
        name = line.trim();
        details = null;
      }
    }
    if (!name) continue;

    // Split name into common_name + variety (variety in 'quotes' OR everything
    // after the first word when there are 2+ words AND no obvious sentence).
    let common_name = name;
    let variety: string | null = null;

    const quoted = name.match(/^(.+?)\s+['""](.+?)['""]\s*$/);
    if (quoted) {
      common_name = quoted[1].trim();
      variety = quoted[2].trim();
    } else {
      // "Tomato Sungold" → common_name "Tomato", variety "Sungold".
      // We only split when there are exactly 2 words, OR when 3 words where
      // the last two look varietal. Be conservative — false positives are
      // worse than missing a variety.
      const words = name.split(/\s+/);
      if (words.length === 2) {
        common_name = words[0];
        variety = words[1];
      } else if (words.length >= 3) {
        // "Pak Choi" stays whole. Heuristic — if the first word(s) are a
        // common compound (Pak Choi, Brussels Sprout, Mustard Greens), keep
        // them as common_name. Otherwise treat last word as variety.
        const lower = name.toLowerCase();
        const compoundLeads = [
          "pak choi",
          "brussels sprout",
          "mustard greens",
          "sweet pea",
          "sweet potato",
          "spring onion",
          "spring greens",
          "bok choy",
          "swiss chard",
        ];
        const leadMatch = compoundLeads.find((c) => lower.startsWith(c));
        if (leadMatch) {
          common_name = name.slice(0, leadMatch.length);
          variety = name.slice(leadMatch.length).trim() || null;
        }
        // Otherwise leave variety null — too ambiguous for regex.
      }
    }

    let pickedDetails = details ? parseDetailsBlock(details) : {
      vendor: null,
      purchased_on: null,
      opened_on: null,
      sow_by: null,
      quantity_remaining: null,
      notes: null,
    };

    out.push({
      common_name: common_name.slice(0, 120),
      variety: variety ? variety.slice(0, 120) : null,
      vendor: pickedDetails.vendor ? pickedDetails.vendor.slice(0, 120) : null,
      purchased_on: pickedDetails.purchased_on,
      opened_on: pickedDetails.opened_on,
      sow_by: pickedDetails.sow_by,
      quantity_remaining: pickedDetails.quantity_remaining
        ? pickedDetails.quantity_remaining.slice(0, 80)
        : null,
      notes: pickedDetails.notes ? pickedDetails.notes.slice(0, 400) : null,
    });
  }
  return out;
}

/**
 * Single entry point used by the modal. Routes Sage+ to the edge fn and
 * everyone else to the local regex parser. On AI failure we fall back to
 * regex so the user always gets a usable result.
 */
export async function parseSeedPackets(
  text: string,
  opts: { homeId: string; aiEnabled: boolean },
): Promise<{ packets: ParsedSeedPacket[]; source: "ai" | "local" }> {
  if (opts.aiEnabled) {
    try {
      const packets = await parseSeedPacketsAi(opts.homeId, text);
      if (packets.length > 0) {
        return { packets, source: "ai" };
      }
    } catch (err) {
      Logger.error("parseSeedPackets AI path failed — falling back", err, {
        homeId: opts.homeId,
      });
    }
  }
  return { packets: parseSeedPacketsLocal(text), source: "local" };
}
