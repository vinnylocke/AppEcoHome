export const SHOPPING_CATEGORIES = [
  "Fertiliser",
  "Pest Control",
  "Tools",
  "Soil & Compost",
  "Pots & Planters",
  "Seeds & Bulbs",
  "Accessories",
] as const;

export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];
