/**
 * scan-seed-packet — shared schema + prompt + normaliser.
 *
 * Mirrors `parseSeedPackets`'s shape (same `ParsedSeedPacket` field
 * surface) so the Nursery review UI is shared between text-paste and
 * photo-scan paths.
 *
 * Only difference: this returns ONE candidate (the packet in the photo)
 * plus a confidence signal so the UI can guide the user to retake when
 * the extraction was thin.
 */

export interface ScannedSeedPacket {
  common_name: string;
  variety: string | null;
  vendor: string | null;
  purchased_on: string | null;
  opened_on: string | null;
  sow_by: string | null;
  quantity_remaining: string | null;
  notes: string | null;
}

export type ScanConfidence = "high" | "medium" | "low";

export interface ScanResult {
  packet: ScannedSeedPacket | null;
  confidence: ScanConfidence;
  /** True when Gemini decided the image isn't readable as a seed packet. */
  unreadable?: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SCAN_PACKET_SCHEMA = {
  type: "OBJECT",
  properties: {
    unreadable: {
      type: "BOOLEAN",
      description:
        "Set TRUE only when the image is genuinely not a legible seed packet — blurry beyond recognition, not a packet at all, or text in an unsupported script. When unreadable is true, the packet object can be null.",
    },
    confidence: {
      type: "STRING",
      enum: ["high", "medium", "low"],
      description:
        "Self-rate based on how many of the standard packet fields you could extract:\n  high   = most fields extracted with high certainty (common_name + variety + at least one of vendor/sow-by)\n  medium = some fields extracted but you're guessing on others\n  low    = mostly blank or you're guessing on the basics",
    },
    packet: {
      type: "OBJECT",
      nullable: true,
      properties: {
        common_name: {
          type: "STRING",
          description:
            "Plant common name (e.g. \"Tomato\", \"Sunflower\"). Required when readable. Strip variety from this field — variety goes in its own column.",
        },
        variety: {
          type: "STRING",
          nullable: true,
          description:
            "Variety / cultivar name (e.g. \"Sungold\", \"Russian Giant\"). Null when only the species is named.",
        },
        vendor: {
          type: "STRING",
          nullable: true,
          description:
            "Vendor / brand. Use the most prominent brand name on the packet (Suttons, Mr Fothergill's, Real Seeds, Sainsbury's, etc.).",
        },
        purchased_on: {
          type: "STRING",
          nullable: true,
          description:
            "Purchase date as ISO YYYY-MM-DD. Usually NOT on the packet — leave null unless the user wrote it on. When only month-year is visible, use the first of the month.",
        },
        opened_on: {
          type: "STRING",
          nullable: true,
          description:
            "When the packet was opened, ISO YYYY-MM-DD. Almost never on the packet — leave null.",
        },
        sow_by: {
          type: "STRING",
          nullable: true,
          description:
            "Sow-by / best-before / use-by date. ISO YYYY-MM-DD. When the packet prints month-year (most common), use the LAST day of that month. When it prints year only, use Dec 31 of that year.",
        },
        quantity_remaining: {
          type: "STRING",
          nullable: true,
          description:
            "Approximate seed count printed on the packet — e.g. \"~30 seeds\", \"approx. 100\", \"50 seeds\". Free text; copy what's printed.",
        },
        notes: {
          type: "STRING",
          nullable: true,
          description:
            "Anything else interesting from the packet you couldn't fit in the other fields — F1 hybrid, heirloom, RHS award, etc. Keep under 200 chars.",
        },
      },
      required: ["common_name"],
    },
  },
  required: ["confidence"],
};

function safeIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!ISO_DATE_RE.test(value)) return null;
  const y = Number(value.slice(0, 4));
  if (!Number.isFinite(y) || y < 1980 || y > 2100) return null;
  return value;
}

function safeText(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function normaliseScanResult(raw: unknown): ScanResult {
  if (!raw || typeof raw !== "object") {
    return { packet: null, confidence: "low", unreadable: true };
  }
  const r = raw as Record<string, unknown>;
  const unreadable = r.unreadable === true;
  const confidence: ScanConfidence =
    r.confidence === "high" || r.confidence === "medium" || r.confidence === "low"
      ? r.confidence
      : "low";

  if (unreadable || !r.packet || typeof r.packet !== "object") {
    return { packet: null, confidence, unreadable: true };
  }

  const p = r.packet as Record<string, unknown>;
  const commonName = safeText(p.common_name, 120);
  if (!commonName) {
    return { packet: null, confidence: "low", unreadable: true };
  }

  return {
    packet: {
      common_name: commonName,
      variety: safeText(p.variety, 120),
      vendor: safeText(p.vendor, 120),
      purchased_on: safeIso(p.purchased_on),
      opened_on: safeIso(p.opened_on),
      sow_by: safeIso(p.sow_by),
      quantity_remaining: safeText(p.quantity_remaining, 80),
      notes: safeText(p.notes, 200),
    },
    confidence,
  };
}

export function buildScanPrompt(): string {
  return `You are extracting structured fields from a photo of a seed packet.

Look at the image (and the optional second image of the back if provided). Extract whatever you can read with reasonable confidence. Leave any field you can't read as null — DO NOT guess.

The packet might be in English, French, German, Spanish or Italian. Translate plant names to English in the common_name field; keep variety names verbatim.

DATE FORMATS:
  - When you see "Best before: 12/2027" or "Sow by: Dec 2027" → sow_by = "2027-12-31" (last day of the month).
  - When you see "Sow by: 2027" (year only) → sow_by = "2027-12-31".
  - When you see a precise date like "Best before: 15/12/2027" → use that exact day.

CONFIDENCE:
  - high   = common_name + variety + at least one of vendor or sow_by all clearly visible.
  - medium = some fields readable but you're guessing on others.
  - low    = mostly blank or you're guessing on the basics.

UNREADABLE:
  - Set unreadable=true ONLY when the image is blurry beyond use, not a seed packet at all, or in a script you can't read. Don't use it as a cop-out — partial info is still useful.

OUTPUT: JSON only, matching the schema. No prose, no markdown.`;
}
