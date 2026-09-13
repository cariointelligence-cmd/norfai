/** Contact fetch plan. Directories and search engines are fallbacks, not the first hop. */

export function contactPlan(opts: {
  website?: string | null;
  depth?: "normal" | "deep" | string | null;
}): { skipSearch: boolean; harvestBudget: number; probeGuesses: boolean } {
  const hasSite = Boolean(opts.website && String(opts.website).includes("."));
  const deep = opts.depth === "deep";
  if (hasSite) return { skipSearch: true, harvestBudget: deep ? 5 : 2, probeGuesses: false };
  return { skipSearch: false, harvestBudget: deep ? 4 : 2, probeGuesses: true };
}

export function directoriesNeeded(opts: {
  emails: number;
  phones: number;
  website?: string | null;
  depth?: "normal" | "deep" | string | null;
  emailRecovery?: boolean;
}): boolean {
  if (opts.emailRecovery || opts.depth === "deep") return opts.emails < 1;
  return opts.emails < 1 && opts.phones < 1;
}

/** Stop crawling extra pages once outreach has a real contact path. */
export function contactHarvestDone(opts: {
  emails: number;
  phones: number;
  people?: number;
  depth?: string | null;
}): boolean {
  if (opts.depth === "deep") return opts.emails >= 1 && opts.phones >= 1;
  return opts.emails >= 1;
}
