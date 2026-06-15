// Bulk-paste plant-list parser for The Shed.
//
// UX review 2026-06-15 item 4.1 — Sam's persona told us he arrives with a
// list of 20-30 plants and the current Shed only supports one-at-a-time
// search-and-add. The Nursery has had this pattern for ages
// (`parseSeedPackets`); this module mirrors it for plants.
//
// Two paths:
//   - Sage+   → `parse-plant-list` edge function (Gemini)
//   - everyone else → `parsePlantListLocal` regex fallback
//
// Both return the same `ParsedPlant` shape so the review UI is identical
// across tiers.

import { supabase } from "./supabase";
import { Logger } from "./errorHandler";

export interface ParsedPlant {
  common_name: string;
  variety: string | null;
  quantity: number | null;
  notes: string | null;
}

// ── AI parser (Sage+) ────────────────────────────────────────────────────

export async function parsePlantListAi(
  homeId: string,
  text: string,
): Promise<ParsedPlant[]> {
  const { data, error } = await supabase.functions.invoke("parse-plant-list", {
    body: { homeId, text },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.plants) ? (data.plants as ParsedPlant[]) : [];
}

// ── Regex fallback ───────────────────────────────────────────────────────

const COMPOUND_NAME_LEADS = [
  "pak choi",
  "brussels sprout",
  "mustard greens",
  "sweet pea",
  "sweet potato",
  "spring onion",
  "spring greens",
  "bok choy",
  "swiss chard",
  "globe artichoke",
  "jerusalem artichoke",
  "calabrese broccoli",
] as const;

function extractQuantity(text: string): { quantity: number | null; rest: string } {
  // Patterns: "x3", "x 3", "× 3", "(3 plants)", "3x", "qty: 3"
  // Returns the quantity + the original text minus the matched token.
  const patterns: RegExp[] = [
    /\bx\s*(\d{1,3})\b/i,
    /\b×\s*(\d{1,3})\b/,
    /\b(\d{1,3})\s*x\b/i,
    /\bqty[:\s]+(\d{1,3})\b/i,
    /\bquantity[:\s]+(\d{1,3})\b/i,
    /\(\s*(\d{1,3})\s*plants?\s*\)/i,
    /\b(\d{1,3})\s*plants?\b/i,
    /\b(\d{1,3})\s*pots?\b/i,
    /\b(\d{1,3})\s*off\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 1000) {
        return { quantity: n, rest: text.replace(re, "").trim() };
      }
    }
  }
  return { quantity: null, rest: text };
}

function splitNameAndVariety(name: string): { common_name: string; variety: string | null } {
  // 1. Quoted variety wins: Lavender 'Hidcote', Rose "Munstead".
  const quoted = name.match(/^(.+?)\s+['""''](.+?)['""'']\s*$/);
  if (quoted) {
    return { common_name: quoted[1].trim(), variety: quoted[2].trim() };
  }

  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return { common_name: words[0], variety: null };
  }

  // 2. Compound names ("Pak Choi", "Brussels Sprout") — preserve as common_name.
  const lower = name.toLowerCase();
  const leadMatch = COMPOUND_NAME_LEADS.find((c) => lower.startsWith(c));
  if (leadMatch) {
    const common = name.slice(0, leadMatch.length);
    const rest = name.slice(leadMatch.length).trim();
    return { common_name: common, variety: rest || null };
  }

  // 3. Two-word names — treat last as variety. "Tomato Sungold" → Tomato + Sungold.
  if (words.length === 2) {
    return { common_name: words[0], variety: words[1] };
  }

  // 4. Three+ words — be conservative; if the trailing word(s) start with
  //    a capital, treat as variety, else leave variety null.
  const last = words[words.length - 1];
  if (/^[A-Z]/.test(last) && last.length >= 3) {
    return {
      common_name: words.slice(0, -1).join(" "),
      variety: last,
    };
  }

  return { common_name: name.trim(), variety: null };
}

/**
 * Best-effort regex parser. One plant per non-empty line.
 *
 * Accepted shapes (one per line):
 *   - Tomato
 *   - Tomato Sungold
 *   - Lavender 'Hidcote'
 *   - Rose "Munstead" x3
 *   - Pak Choi (12 plants, from RHS Wisley)
 *   - Calendula - hedging, mixed
 */
export function parsePlantListLocal(text: string): ParsedPlant[] {
  const out: ParsedPlant[] = [];
  if (!text || typeof text !== "string") return out;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const rawLine of lines) {
    if (out.length >= 60) break;

    // Split off a trailing parenthesised block as notes / quantity source.
    let line = rawLine;
    let parenNotes: string | null = null;
    const parenMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      line = parenMatch[1].trim();
      parenNotes = parenMatch[2].trim();
    }

    // Split off a trailing dash/colon block as notes.
    let dashNotes: string | null = null;
    const dashIdx = line.search(/\s[-—–:]\s/);
    if (dashIdx > 0) {
      dashNotes = line.slice(dashIdx + 3).trim();
      line = line.slice(0, dashIdx).trim();
    }

    // Extract quantity from the name region first, then the paren region.
    let quantity: number | null = null;
    const qFromName = extractQuantity(line);
    quantity = qFromName.quantity;
    line = qFromName.rest;
    if (quantity === null && parenNotes) {
      const qFromParen = extractQuantity(parenNotes);
      quantity = qFromParen.quantity;
      parenNotes = qFromParen.rest;
    }

    const { common_name, variety } = splitNameAndVariety(line);
    if (!common_name) continue;

    const notesParts: string[] = [];
    if (parenNotes && parenNotes.length > 0) notesParts.push(parenNotes);
    if (dashNotes && dashNotes.length > 0) notesParts.push(dashNotes);

    out.push({
      common_name: common_name.slice(0, 120),
      variety: variety ? variety.slice(0, 120) : null,
      quantity,
      notes: notesParts.length > 0 ? notesParts.join(" · ").slice(0, 400) : null,
    });
  }

  return out;
}

/**
 * Single entry point used by the modal. Routes Sage+ to the edge fn and
 * everyone else to the local regex parser. On AI failure we fall back to
 * regex so the user always gets a usable result.
 */
export async function parsePlantList(
  text: string,
  opts: { homeId: string; aiEnabled: boolean },
): Promise<{ plants: ParsedPlant[]; source: "ai" | "local" }> {
  if (opts.aiEnabled) {
    try {
      const plants = await parsePlantListAi(opts.homeId, text);
      if (plants.length > 0) {
        return { plants, source: "ai" };
      }
    } catch (err) {
      Logger.error("parsePlantList AI path failed — falling back", err, {
        homeId: opts.homeId,
      });
    }
  }
  return { plants: parsePlantListLocal(text), source: "local" };
}
