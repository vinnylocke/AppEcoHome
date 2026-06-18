// True when at least one row carries a finite numeric value for `key`. Used to
// decide whether to render a chart series (e.g. only show the EC graph for
// sensors that actually report electrical conductivity). Pure + tested.

export function hasSeries(rows: Array<Record<string, unknown>>, key: string): boolean {
  return rows.some((r) => {
    const v = r[key];
    return typeof v === "number" && Number.isFinite(v);
  });
}
