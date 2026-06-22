/**
 * Head Gardener Estate Report — client-side types + pure presentation helpers
 * (section ordering, severity tone). No React, no side effects (unit-tested in
 * tests/unit/lib/managerReport.test.ts).
 */

export interface ReportSection {
  goal: string | null;
  title: string;
  body: string;
  severity: number; // 1..3
  recommendation: string | null;
  link: string | null;
}

export interface ReportGap {
  goal: string | null;
  title: string;
  detail: string;
  suggestion: string | null;
  link: string | null;
}

export interface YearPlan {
  thisMonth: string[];
  thisSeason: string[];
  comingUp: string[];
}

export interface ReportFollowUp {
  logId: string;
  title: string;
  status: string;
  note: string | null;
}

export interface ManagerReport {
  headline: string;
  greeting: string;
  sections: ReportSection[];
  gaps: ReportGap[];
  yearPlan: YearPlan;
  followUps: ReportFollowUp[];
  generatedAt: string;
  persona: string | null;
}

/** Highest-attention sections first; stable for equal severity (preserves AI order). */
export function sortSections(sections: ReportSection[]): ReportSection[] {
  return sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.severity ?? 1) - (a.s.severity ?? 1) || a.i - b.i)
    .map((x) => x.s);
}

/** Badge label + Tailwind classes for a section's severity. */
export function severityTone(severity: number): { label: string; cls: string } {
  if (severity >= 3) return { label: "Priority", cls: "bg-rose-50 text-rose-700" };
  if (severity === 2) return { label: "Worth doing", cls: "bg-amber-50 text-amber-700" };
  return { label: "On track", cls: "bg-emerald-50 text-emerald-700" };
}

/** True when the report has no substantive content to show. */
export function isReportEmpty(r: ManagerReport | null | undefined): boolean {
  if (!r) return true;
  return !r.headline && !r.greeting && (r.sections?.length ?? 0) === 0 && (r.gaps?.length ?? 0) === 0;
}
