const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

export const BANNED_PUBLIC_PHRASES = [
  "entity resolution",
  "source network",
  "orchestrator",
  "scoring model",
  "confidence algorithm",
  "missing credentials",
  "api key",
  "super-seo",
  "hyper-geo",
  "game-changing",
  "revolutionary",
  "supercharge",
  "seamlessly",
  "cutting-edge",
  "next-generation",
  "unlock your",
  "transform your business",
  "in today's fast-paced",
];

export const BANNED_INTERNAL_ON_PUBLIC = [
  "adapter",
  "fallback",
  "implementation",
  "crawler",
  "pipeline",
];

export type CopyIssue = {
  path: string;
  kind: "em_dash" | "en_dash" | "banned_phrase" | "internal_term";
  excerpt: string;
};

export function lintCopy(path: string, text: string): CopyIssue[] {
  const issues: CopyIssue[] = [];
  if (text.includes(EM_DASH)) {
    issues.push({ path, kind: "em_dash", excerpt: snippet(text, text.indexOf(EM_DASH)) });
  }
  if (text.includes(EN_DASH)) {
    issues.push({ path, kind: "en_dash", excerpt: snippet(text, text.indexOf(EN_DASH)) });
  }
  const lower = text.toLowerCase();
  for (const phrase of BANNED_PUBLIC_PHRASES) {
    if (lower.includes(phrase)) {
      issues.push({ path, kind: "banned_phrase", excerpt: phrase });
    }
  }
  return issues;
}

function snippet(text: string, at: number): string {
  const start = Math.max(0, at - 24);
  return text.slice(start, start + 48).replace(/\s+/g, " ");
}

export function hasEmDash(text: string): boolean {
  return text.includes(EM_DASH);
}
