import type { CompanyIntel } from "./targeting/scores.ts";
import { hiringLabel, whyNowHiring, type HiringCategory, type HiringFreshness, type HiringLevel } from "./hiring-signal.ts";
import { pickRelevantPerson, type OfferFamily } from "./role-relevance.ts";
import { explainMatch } from "./match-explain.ts";

export type SalesBrief = {
  who: string;
  why: string[];
  whyNow: string[];
  contact: string | null;
  nextAction: string | null;
  unknown: string[];
  facts: string[];
  signals: string[];
  inferences: string[];
  possibleAngle: string | null;
  risks: string[];
};

export function buildSalesBrief(opts: {
  name: string;
  industryLabel?: string | null;
  municipality?: string | null;
  email?: string | null;
  phone?: string | null;
  decisionMaker?: string | null;
  decisionMakerTitle?: string | null;
  people?: Array<{ fullName?: string | null; title?: string | null }>;
  intel?: CompanyIntel | null;
  hiringLevel?: HiringLevel;
  hiringCategory?: HiringCategory;
  hiringFreshness?: HiringFreshness;
  hiringTitle?: string | null;
  offer?: OfferFamily | string;
}): SalesBrief {
  const intel = opts.intel ?? null;
  const facts: string[] = [];
  const signals: string[] = [];
  const inferences: string[] = [];
  const unknown: string[] = [];
  const why: string[] = [];
  const whyNow: string[] = [];
  const risks: string[] = [];

  const who = [opts.name, opts.industryLabel, opts.municipality].filter(Boolean).join(" · ") || opts.name;

  for (const m of intel?.match?.matched ?? []) {
    why.push(m);
    facts.push(m);
  }
  for (const u of intel?.match?.unknown ?? []) unknown.push(u);

  const nowLine = whyNowHiring({
    level: opts.hiringLevel ?? "HIRING_UNKNOWN",
    freshness: opts.hiringFreshness,
    category: opts.hiringCategory,
    title: opts.hiringTitle,
  });
  if (nowLine) {
    whyNow.push(nowLine);
    signals.push(nowLine);
  } else if (opts.hiringLevel === "HIRING_CONFIRMED" && (opts.hiringFreshness === "STALE" || opts.hiringFreshness === "HISTORICAL")) {
    signals.push("Job listing is outside the freshness window");
    inferences.push("An old listing is not treated as a current hiring event.");
  } else if (opts.hiringLevel === "HIRING_INDICATED") {
    signals.push(hiringLabel(opts.hiringLevel));
    inferences.push("Website hiring language may indicate a staffing need. It is not confirmed company growth.");
  }

  if (intel?.website?.likelyWeak) {
    signals.push("Public website quality flags are present");
    inferences.push("A weak public site can be a website or digitalization outreach angle. It is not proof of budget.");
  }

  if (intel?.revenue != null && intel.revenueYear) {
    facts.push(`Published revenue €${Math.round(intel.revenue).toLocaleString("fi-FI")} (${intel.revenueYear}, ${intel.revenueSource ?? "source recorded"})`);
  } else if (intel?.match?.unknown.some((u) => /revenue/i.test(u))) {
    unknown.push("Revenue not published");
  }

  const person = opts.people?.length
    ? pickRelevantPerson(opts.people, opts.offer ?? "general")
    : opts.decisionMaker
      ? { fullName: opts.decisionMaker, title: opts.decisionMakerTitle }
      : null;
  const contact = person?.fullName
    ? `${person.fullName}${person.title ? ` · ${person.title}` : ""}${opts.email ? ` · ${opts.email}` : opts.phone ? ` · ${opts.phone}` : ""}`
    : opts.email || opts.phone || null;

  let possibleAngle: string | null = null;
  if (nowLine && opts.hiringCategory === "SALES_HIRING") {
    possibleAngle = "The company is publicly hiring salespeople, so expanding sales capacity may be timely.";
  } else if (intel?.website?.likelyWeak) {
    possibleAngle = "Measured website issues can justify a modernization conversation. Do not claim they have a broken business.";
  } else if (why.length) {
    possibleAngle = "Open with the matched published facts. Do not invent a pain point.";
  }

  if (!contact) risks.push("No published person or mailbox yet.");
  if (intel?.match?.unknown.length) risks.push("Some requested criteria are unpublished.");
  if (opts.hiringLevel === "HIRING_INDICATED") risks.push("Hiring is indicated, not confirmed.");

  let nextAction: string | null = null;
  if (contact && why.length) {
    nextAction = "Contact the published person or mailbox with the matched criteria as the opening.";
  } else if (why.length && !contact) {
    nextAction = "Criteria matched but no published contact yet. Open the company page and check official sources before outreach.";
  } else if (!why.length) {
    nextAction = null;
  }

  const explained = explainMatch({ intel, hiringLevel: opts.hiringLevel });
  for (const s of explained.matchedSignals) if (!signals.includes(s)) signals.push(s);
  for (const i of explained.inferences) if (!inferences.includes(i)) inferences.push(i);

  return { who, why, whyNow, contact, nextAction, unknown, facts, signals, inferences, possibleAngle, risks };
}

export function angleIsSafe(text: string): boolean {
  return !/ongelmia myynnissä|sales problems|cannot sell|failing commercially/i.test(text);
}
