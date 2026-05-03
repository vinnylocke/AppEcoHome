export interface YieldPromptContext {
  commonName: string;
  plantedAt: string | null;
  expectedHarvestDate: string | null;
  cycle: string | null;
  watering: string | null;
  careLevel: string | null;
  sunlight: string | null;
  pastYields: Array<{ value: number; unit: string; harvested_at: string }>;
  weatherSummary: string | null;
}

export function buildYieldPrompt(ctx: YieldPromptContext): string {
  const lines: string[] = [
    `You are an expert horticultural advisor. Predict the likely yield for the following plant instance.`,
    ``,
    `## Plant`,
    `Common name: ${ctx.commonName}`,
    ctx.cycle ? `Cycle: ${ctx.cycle}` : null,
    ctx.watering ? `Watering needs: ${ctx.watering}` : null,
    ctx.careLevel ? `Care level: ${ctx.careLevel}` : null,
    ctx.sunlight ? `Sunlight: ${ctx.sunlight}` : null,
    ctx.plantedAt ? `Planted: ${ctx.plantedAt}` : null,
    ctx.expectedHarvestDate
      ? `Expected harvest date: ${ctx.expectedHarvestDate}`
      : null,
    ``,
    `## Harvest History`,
  ].filter((l): l is string => l !== null);

  if (ctx.pastYields.length === 0) {
    lines.push("No harvest history available for this plant.");
  } else {
    ctx.pastYields.forEach((y) => {
      lines.push(
        `- ${y.value} ${y.unit} on ${new Date(y.harvested_at).toLocaleDateString("en-GB")}`,
      );
    });
  }

  if (ctx.weatherSummary) {
    lines.push(``, `## Recent & Forecast Weather`, ctx.weatherSummary);
  }

  lines.push(
    ``,
    `## Instructions`,
    `Based on the above, provide a yield prediction. Respond ONLY with valid JSON matching this schema exactly:`,
    `{`,
    `  "estimated_value": <number>,`,
    `  "unit": "<unit string matching past yields or a sensible default>",`,
    `  "confidence": "<low|medium|high>",`,
    `  "reasoning": "<1–2 sentence explanation>",`,
    `  "tips": ["<tip 1>", "<tip 2>"]`,
    `}`,
  );

  return lines.join("\n");
}
