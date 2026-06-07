// ─── noteHelpers ────────────────────────────────────────────────────────
//
// Pure helpers for Notes (Wave 22.0001-B). Kept React-free so they can
// be unit-tested in isolation.

export type NoteTargetType =
  | "plant_instance"
  | "plant"
  | "location"
  | "area"
  | "plan"
  | "ailment"
  | "seed_packet";

export interface NoteLinkRef {
  target_type: NoteTargetType;
  target_id: string;
}

export const NOTE_TARGET_LABELS: Record<NoteTargetType, string> = {
  plant_instance: "Plant",
  plant: "Plant (catalogue)",
  location: "Location",
  area: "Area",
  plan: "Plan",
  ailment: "Ailment",
  seed_packet: "Seed packet",
};

/**
 * Walk a TipTap document JSON tree and return the first image URL we
 * find. Used to choose the cover image for note list tiles without
 * forcing the user to pick one explicitly.
 */
export function firstImageInDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null;
  const stack: any[] = [doc];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "image" && typeof node.attrs?.src === "string") {
      return node.attrs.src as string;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
  return null;
}

/**
 * Project a TipTap document to plain text. Used for the `body_text`
 * column (client-side search). Skips images, code blocks are kept verbatim.
 */
export function docToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const out: string[] = [];
  const stack: Array<{ node: any; depth: number }> = [{ node: doc, depth: 0 }];
  while (stack.length > 0) {
    const { node } = stack.pop()!;
    if (!node || typeof node !== "object") continue;
    if (typeof node.text === "string") {
      out.push(node.text);
    }
    if (Array.isArray(node.content)) {
      // Push in reverse so we walk in document order.
      for (let i = node.content.length - 1; i >= 0; i--) {
        stack.push({ node: node.content[i], depth: 0 });
      }
    }
    // Add a space between block siblings so words don't run together.
    if (
      node.type === "paragraph"
      || node.type === "heading"
      || node.type === "listItem"
      || node.type === "taskItem"
    ) {
      out.push(" ");
    }
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

export function isDocEmpty(doc: unknown): boolean {
  return docToPlainText(doc).length === 0 && firstImageInDoc(doc) === null;
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
