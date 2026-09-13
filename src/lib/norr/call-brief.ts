export type BriefFacts = {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  industry?: string | null;
  website?: string | null;
  revenue?: string | null;
  profit?: string | null;
  decisionMaker?: string | null;
  decisionTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteScore?: number | null;
  ads?: string | null;
  hiring?: boolean;
  procurement?: boolean;
  changes?: string[];
  parentName?: string | null;
};

export function buildCallBriefPrompt(facts: BriefFacts): string {
  const lines = [
    `Company: ${facts.name}`,
    facts.businessId ? `Business ID: ${facts.businessId}` : null,
    facts.municipality ? `City: ${facts.municipality}` : null,
    facts.industry ? `Industry: ${facts.industry}` : null,
    facts.website ? `Website: ${facts.website}` : null,
    facts.revenue ? `Published revenue: ${facts.revenue}` : "Published revenue: Not found",
    facts.profit ? `Published profit: ${facts.profit}` : "Published profit: Not found",
    facts.decisionMaker ? `Person on record: ${facts.decisionMaker}${facts.decisionTitle ? ` (${facts.decisionTitle})` : ""}` : "Person on record: Not found",
    facts.phone ? `Phone: ${facts.phone}` : "Phone: Not found",
    facts.email ? `Email: ${facts.email}` : "Email: Not found",
    facts.websiteScore != null ? `Website quality score: ${facts.websiteScore}` : null,
    facts.ads ? `Ad signals: ${facts.ads}` : null,
    facts.hiring ? "SIGNAL: public hiring language or job listing (not financial growth)" : null,
    facts.procurement ? "SIGNAL: public procurement notice matched the name (name-match, not a business-id join unless stated)" : null,
    facts.parentName ? `Group mention: ${facts.parentName}` : null,
    facts.changes?.length ? `Recent changes: ${facts.changes.join("; ")}` : null,
  ].filter(Boolean);

  return `Write a Finnish B2B call card for a salesperson. 6 to 8 short lines.
Use ONLY the facts below. If a field is Not found, say so. Never invent revenue, people, phone, email, spend, traffic, or growth.
Do not write an email to send to the company. Do not greet the company. This is a private brief for the caller.
Separate verified facts from signals. A hiring signal is not company growth. A pixel is not ad spend.
Structure:
1. Who they are (name, city, industry)
2. Who to ask for, or say the person is not on record
3. How to reach them, or Not found
4. Why now, only from listed signals, labelled as signals
5. What not to claim

FACTS:
${lines.join("\n")}`;
}

export type CallBrief = {
  lines: string[];
  generatedAt: string;
  model: string;
};

export function parseBriefText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter((l) => l.length > 0)
    .slice(0, 10);
}
