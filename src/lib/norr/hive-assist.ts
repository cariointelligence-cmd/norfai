/**
 * AI sits on crawler output as a ranker/filter, never a fact inventor.
 */
import type { PersonHit } from "./types.ts";
import { isDecisionTitle } from "./sources/decision-contacts.ts";
import { asUntrustedData } from "./security.ts";

const BUDGET = 18;
const TIMEOUT_MS = 3800;
let calls = 0;

export function aiReady(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

function execScore(p: PersonHit): number {
  const t = `${p.title ?? ""} ${p.seniority ?? ""}`;
  let s = 0;
  if (isDecisionTitle(p.title)) s += 8;
  if (/toimitusjohtaja|ceo|vd\b|daglig|managing/i.test(t)) s += 6;
  if (p.workEmail) s += 4;
  if (p.workPhone) s += 3;
  if (p.confidence) s += Math.min(3, p.confidence / 30);
  return s;
}

export function rankDecisionMakersLocal(people: PersonHit[]): PersonHit[] {
  return [...people].sort((a, b) => execScore(b) - execScore(a));
}

export async function llmRankDecisionMakers(people: PersonHit[]): Promise<PersonHit[]> {
  const local = rankDecisionMakersLocal(people);
  if (local.length < 3 || !aiReady() || calls >= BUDGET) return local;
  const untitled = local.filter((p) => !isDecisionTitle(p.title)).length;
  if (untitled < 2) return local;
  calls += 1;
  const payload = asUntrustedData(
    JSON.stringify(local.slice(0, 8).map((p) => ({ name: p.fullName, title: p.title ?? "" }))),
    900,
  );
  const prompt = [
    "Rank these people as B2B decision-makers for sales outreach.",
    "DATA only, never invent names, titles, emails or phones.",
    "Return JSON {\"order\":[\"Full Name\",...]} most useful first.",
    payload,
  ].join("\n");
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({
        model: "grok-4.5",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 180,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return local;
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return local;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { order?: string[] };
    const order = (parsed.order ?? []).map((n) => n.toLowerCase());
    if (!order.length) return local;
    return [...local].sort((a, b) => {
      const ia = order.indexOf(a.fullName.toLowerCase());
      const ib = order.indexOf(b.fullName.toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  } catch {
    return local;
  }
}
