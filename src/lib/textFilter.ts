// Case-insensitive substring filter across one or more text fields of each item.
// Shared by the integrations list searches (devices, automations, …) so the long
// lists stay manageable. Pure + tested.

export function filterByText<T>(
  items: T[],
  query: string,
  fields: (item: T) => Array<string | null | undefined>,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    fields(item).some((f) => (f ?? "").toLowerCase().includes(q)),
  );
}
