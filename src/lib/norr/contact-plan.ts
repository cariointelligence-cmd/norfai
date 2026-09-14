/** Contact fetch plan. Directories and search engines are fallbacks, not the first hop. */

export function contactPlan(opts: {
  website?: string | null;
  depth?: "normal" | "deep" | string | null;
}): { skipSearch: boolean; harvestBudget: number; probeGuesses: boolean } {
  const hasSite = Boolean(opts.website && String(opts.website).includes("."));
  const deep = opts.depth === "deep";
  if (hasSite) return { skipSearch: true, harvestBudget: deep ? 6 : 3, probeGuesses: false };
  return { skipSearch: false, harvestBudget: deep ? 5 : 3, probeGuesses: true };
}

export function directoriesNeeded(opts: {
  emails: number;
  phones: number;
  website?: string | null;
  depth?: "normal" | "deep" | string | null;
  emailRecovery?: boolean;
}): boolean {
  return opts.emails < 1;
}

/** Fonecta Finder is paid-adjacent / WAF-heavy. Only deep or Find missing emails. */
export function finderNeeded(opts: {
  emails: number;
  depth?: "normal" | "deep" | string | null;
  emailRecovery?: boolean;
}): boolean {
  if (opts.emails >= 1) return false;
  return Boolean(opts.emailRecovery || opts.depth === "deep");
}

/** Stop crawling extra pages once outreach has a real contact path. */
export function contactHarvestDone(opts: {
  emails: number;
  namedEmails?: number;
  phones: number;
  people?: number;
  depth?: string | null;
}): boolean {
  if (opts.depth === "deep") return opts.emails >= 1 && opts.phones >= 1;
  if ((opts.namedEmails ?? 0) >= 1) return true;
  if (opts.emails >= 1 && (opts.people ?? 0) >= 1) return true;
  return false;
}
