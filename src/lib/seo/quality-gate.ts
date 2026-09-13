import { hasEmDash } from "./copy-lint.ts";
import { BANNED_PUBLIC_PHRASES } from "./copy-lint.ts";

export type QualityVerdict = {
  ok: boolean;
  reasons: string[];
};

const HYPE = /\b(revolutionary|game-changing|unlock|supercharge|seamlessly|cutting-edge|next-generation|leverage|empower)\b/i;
const FAKE_STUDY = /\bwe analyzed\s+\d+[\d,]+\s+(finnish|nordic)?\s*(sme|companies|websites)\b/i;
const GUARANTEE = /\bguaranteed\s+(#?1|number one|top 1|google #1)\b/i;

export function gateContent(opts: {
  title: string;
  body: string;
  excerpt?: string;
  existingTitles?: string[];
}): QualityVerdict {
  const reasons: string[] = [];
  const title = opts.title.trim();
  const body = opts.body.trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  if (title.length < 15) reasons.push("Title is too short.");
  if (words < 350) reasons.push("Body is under 350 words.");
  if (!/^##\s+/m.test(body) && !/<h2/i.test(body)) reasons.push("No H2 headings.");
  if (hasEmDash(title) || hasEmDash(body) || hasEmDash(opts.excerpt ?? "")) {
    reasons.push("Contains an em dash.");
  }
  if (HYPE.test(title) || HYPE.test(body)) reasons.push("Contains hype language.");
  if (FAKE_STUDY.test(body)) reasons.push("Looks like an invented study.");
  if (GUARANTEE.test(body) || GUARANTEE.test(title)) reasons.push("Promises a guaranteed ranking.");
  const blob = `${title}\n${body}`.toLowerCase();
  for (const phrase of BANNED_PUBLIC_PHRASES) {
    if (blob.includes(phrase)) reasons.push(`Contains “${phrase}”.`);
  }
  if (opts.existingTitles?.some((t) => t.trim().toLowerCase() === title.toLowerCase())) {
    reasons.push("Duplicate of an existing title.");
  }
  return { ok: reasons.length === 0, reasons };
}
