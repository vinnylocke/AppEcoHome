// Companion planting lookup — common UK/US species pairs.
// Used by the Garden Layout overlay (Wave 8B) to mark compatible/incompatible
// adjacent shapes. Not exhaustive — for unknown pairs we fall back to "Neutral".

export type CompanionRelation = "Beneficial" | "Harmful" | "Neutral";

interface CompanionRule {
  a: string;
  b: string;
  relation: "Beneficial" | "Harmful";
  reason: string;
}

const RULES: CompanionRule[] = [
  // Beneficial pairs
  { a: "tomato",    b: "basil",       relation: "Beneficial", reason: "Basil repels tomato hornworm and improves tomato flavour." },
  { a: "tomato",    b: "carrot",      relation: "Beneficial", reason: "Carrots loosen soil for tomato roots." },
  { a: "tomato",    b: "marigold",    relation: "Beneficial", reason: "Marigold repels nematodes that attack tomatoes." },
  { a: "carrot",    b: "onion",       relation: "Beneficial", reason: "Onions deter carrot fly." },
  { a: "carrot",    b: "leek",        relation: "Beneficial", reason: "Leeks deter carrot fly; carrots deter leek moth." },
  { a: "lettuce",   b: "radish",      relation: "Beneficial", reason: "Radish breaks soil and draws pests away." },
  { a: "lettuce",   b: "carrot",      relation: "Beneficial", reason: "Spacing pattern works, mutual benefit." },
  { a: "cucumber",  b: "nasturtium",  relation: "Beneficial", reason: "Nasturtium repels cucumber beetles." },
  { a: "cucumber",  b: "dill",        relation: "Beneficial", reason: "Dill attracts beneficial wasps." },
  { a: "bean",      b: "corn",        relation: "Beneficial", reason: "Beans fix nitrogen for corn; corn supports vines (three sisters)." },
  { a: "bean",      b: "squash",      relation: "Beneficial", reason: "Classic three sisters — squash shades soil, beans feed nitrogen." },
  { a: "corn",      b: "squash",      relation: "Beneficial", reason: "Three sisters — mutual support." },
  { a: "strawberry", b: "borage",     relation: "Beneficial", reason: "Borage attracts pollinators and strengthens strawberries." },
  { a: "rose",      b: "garlic",      relation: "Beneficial", reason: "Garlic repels aphids on roses." },
  { a: "cabbage",   b: "mint",        relation: "Beneficial", reason: "Mint repels cabbage white butterfly." },
  { a: "cabbage",   b: "rosemary",    relation: "Beneficial", reason: "Rosemary deters cabbage moth." },
  { a: "potato",    b: "horseradish", relation: "Beneficial", reason: "Horseradish improves potato disease resistance." },

  // Harmful pairs
  { a: "tomato",    b: "cabbage",     relation: "Harmful", reason: "Cabbage stunts tomato growth." },
  { a: "tomato",    b: "potato",      relation: "Harmful", reason: "Share blight and pests; planting nearby spreads disease." },
  { a: "tomato",    b: "fennel",      relation: "Harmful", reason: "Fennel inhibits most vegetables including tomato." },
  { a: "tomato",    b: "corn",        relation: "Harmful", reason: "Same pests (corn earworm = tomato fruitworm)." },
  { a: "carrot",    b: "dill",        relation: "Harmful", reason: "Dill stunts mature carrots." },
  { a: "bean",      b: "onion",       relation: "Harmful", reason: "Onions inhibit bean growth." },
  { a: "bean",      b: "garlic",      relation: "Harmful", reason: "Allium family inhibits legumes." },
  { a: "cabbage",   b: "strawberry",  relation: "Harmful", reason: "Mutual stunting." },
  { a: "cucumber",  b: "sage",        relation: "Harmful", reason: "Sage inhibits cucumber growth." },
  { a: "potato",    b: "tomato",      relation: "Harmful", reason: "Blight and shared pests." },
  { a: "potato",    b: "cucumber",    relation: "Harmful", reason: "Potato bug also targets cucumber." },
  { a: "lettuce",   b: "celery",      relation: "Harmful", reason: "Celery inhibits lettuce." },
  { a: "fennel",    b: "bean",        relation: "Harmful", reason: "Fennel inhibits legumes." },
];

function normalise(name: string): string {
  const lower = (name || "").toLowerCase().trim();
  // strip trailing 's' for common plurals (tomatoes → tomato)
  if (lower.endsWith("oes")) return lower.slice(0, -2);
  if (lower.endsWith("es") && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
  return lower;
}

/** Returns the relation between two species names, or Neutral if unknown. */
export function getCompanionRelation(speciesA: string, speciesB: string): { relation: CompanionRelation; reason?: string } {
  const a = normalise(speciesA);
  const b = normalise(speciesB);
  if (!a || !b) return { relation: "Neutral" };

  for (const r of RULES) {
    const ra = r.a.toLowerCase();
    const rb = r.b.toLowerCase();
    if ((a.includes(ra) && b.includes(rb)) || (a.includes(rb) && b.includes(ra))) {
      return { relation: r.relation, reason: r.reason };
    }
  }
  return { relation: "Neutral" };
}

/**
 * For a group of plant species names in one bed, find the worst relation
 * to any species in the other bed. Returns Neutral if all pairs are Neutral.
 */
export function getCompanionRelationForGroups(
  speciesGroupA: string[],
  speciesGroupB: string[],
): { relation: CompanionRelation; reason?: string } {
  let best: { relation: CompanionRelation; reason?: string } = { relation: "Neutral" };
  for (const a of speciesGroupA) {
    for (const b of speciesGroupB) {
      const r = getCompanionRelation(a, b);
      if (r.relation === "Harmful") return r;
      if (r.relation === "Beneficial" && best.relation !== "Harmful") best = r;
    }
  }
  return best;
}
