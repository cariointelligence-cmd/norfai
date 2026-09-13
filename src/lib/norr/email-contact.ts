/** Dedicated email-contact engine. Exhausts first-party pages before NO_DATA. */

export const EMAIL_TERMINAL = [
  "EMAIL_FOUND_PUBLISHED",
  "EMAIL_FOUND_INFERRED",
  "NO_PUBLIC_EMAIL_FOUND",
  "NO_VALID_DOMAIN",
  "COMPANY_WEBSITE_UNAVAILABLE",
  "AMBIGUOUS_COMPANY_IDENTITY",
  "SOURCE_FAILED",
  "RETRYABLE_FAILURE",
] as const;
export type EmailTerminal = (typeof EMAIL_TERMINAL)[number];

export const EMAIL_ENGINE_VERSION = "email_contact_v2";

export function classifyEmailTerminal(opts: {
  published: number;
  inferred: number;
  website?: string | null;
  domainTried: boolean;
  pagesTried: number;
  sourceFailed?: boolean;
  retryable?: boolean;
}): EmailTerminal {
  if (opts.published > 0) return "EMAIL_FOUND_PUBLISHED";
  if (opts.inferred > 0) return "EMAIL_FOUND_INFERRED";
  if (opts.retryable) return "RETRYABLE_FAILURE";
  if (opts.sourceFailed && opts.pagesTried === 0) return "SOURCE_FAILED";
  if (!opts.website && !opts.domainTried) return "NO_VALID_DOMAIN";
  if (opts.website && opts.pagesTried === 0) return "COMPANY_WEBSITE_UNAVAILABLE";
  return "NO_PUBLIC_EMAIL_FOUND";
}

export function emailJobPriority(type: string): number {
  if (type === "email") return 0;
  if (type === "discover") return 1;
  if (type === "enrich") return 2;
  if (type === "scrape") return 3;
  if (type === "score") return 4;
  if (type === "crawl") return 5;
  if (type === "signals") return 6;
  return 7;
}
