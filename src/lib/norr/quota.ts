function unlimited(n: number): boolean {
  return !Number.isFinite(n) || n < 0;
}

export class CompanyQuotaError extends Error {
  readonly code = "company_quota" as const;
  constructor(message: string) {
    super(message);
    this.name = "CompanyQuotaError";
  }
}

export function isCompanyQuotaError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && (e as { name?: string }).name === "CompanyQuotaError");
}

export function remainingCompanySlots(opts: {
  totalCap: number;
  monthlyCap: number;
  perSearch: number;
  stored: number;
  storedThisPeriod: number;
}): {
  totalCap: number;
  monthlyCap: number;
  perSearch: number;
  remainingTotal: number;
  remainingMonthly: number;
  remaining: number;
  blocked: "total" | "monthly" | null;
} {
  const remainingTotal = unlimited(opts.totalCap) ? Number.POSITIVE_INFINITY : Math.max(0, opts.totalCap - Math.max(0, opts.stored));
  const remainingMonthly = unlimited(opts.monthlyCap)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, opts.monthlyCap - Math.max(0, opts.storedThisPeriod));
  const remaining = Math.min(remainingTotal, remainingMonthly);
  let blocked: "total" | "monthly" | null = null;
  if (remaining <= 0) {
    blocked = remainingMonthly <= 0 && !unlimited(opts.monthlyCap) ? "monthly" : "total";
  }
  return {
    totalCap: opts.totalCap,
    monthlyCap: opts.monthlyCap,
    perSearch: opts.perSearch,
    remainingTotal,
    remainingMonthly,
    remaining,
    blocked,
  };
}
