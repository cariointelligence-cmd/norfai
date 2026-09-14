/** Decision-maker proximity extract. Never invent mailboxes. */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, emailMatchesPerson, isJunkEmail, isBillingEmail, isRecruitingEmail } from "../contacts.ts";
import { cleanPersonName, plausiblePersonName, extractJsonLd } from "../extract.ts";
import { normalizePhone } from "../normalize.ts";
import { isDecisionTitle } from "./decision-contacts.ts";
import type { Nation } from "../countries/env.ts";

export const EXEC_RE =
  /toimitusjohtaja|verkställande\s+direktör|verkställande|daglig\s+leder|administrerende\s+direktør|managing\s+director|\bceo\b|\bmd\b|\bvd\b|chair(?:man|person)?|puheenjohtaja|cfo|coo|cmo|cio|cto|talousjohtaja|myyntijohtaja|sales\s+director|country\s+manager|toimitusjohtaja/gi;

export function extractDecisionMakersFromHtml(html: string, sourceUrl: string, nation: Nation = "FI"): PersonHit[] {
  const slice = html.length > 90_000 ? html.slice(0, 90_000) : html;
  const people: PersonHit[] = [];
  const seen = new Set<string>();

  try {
    const ld = extractJsonLd(slice);
    for (const person of ld.persons) {
      const name = cleanPersonName(person.name);
      if (!name || !plausiblePersonName(name)) continue;
      if (!isDecisionTitle(person.jobTitle)) continue;
      push(people, seen, {
        fullName: name,
        title: person.jobTitle ?? "CEO",
        workEmail: cleanMail(person.email),
        workPhone: cleanTel(person.telephone, nation),
        sourcePage: sourceUrl,
        confidence: 86,
        seniority: "executive",
      });
    }
  } catch { /* optional */ }

  const text = slice
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a[^>]+href=["']mailto:([^"']+)["'][^>]*>/gi, " mailto:$1 ")
    .replace(/<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi, " tel:$1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

  const re = new RegExp(EXEC_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const i = m.index ?? 0;
    const title = (m[0] ?? "").replace(/\s+/g, " ").trim();
    const window = text.slice(Math.max(0, i - 280), Math.min(text.length, i + 360));
    const name = nameNearTitle(window, title);
    const emails = extractEmails(window).map((e) => e.value).filter((v) => cleanMail(v));
    const phones = extractPhones(window, nation).map((p) => cleanTel(p, nation)).filter(Boolean) as string[];
    if (!name && !emails.length) continue;
    const fullName = name ?? guessNameFromEmail(emails[0] ?? "");
    if (!fullName) continue;
    const workEmail = emails.find((e) => emailMatchesPerson(e, fullName)) ?? emails[0] ?? null;
    push(people, seen, {
      fullName,
      title,
      workEmail,
      workPhone: phones[0] ?? null,
      sourcePage: sourceUrl,
      confidence: workEmail ? 84 : 72,
      seniority: "executive",
      evidence: `Title '${title}' near published contact`,
    });
  }
  return people.slice(0, 8);
}

function push(into: PersonHit[], seen: Set<string>, p: PersonHit): void {
  if (/privacy|cookie|jane doe|john doe|lorem|example|copyright|subscribe|newsletter/i.test(p.fullName)) return;
  const k = p.fullName.toLowerCase();
  if (seen.has(k)) {
    const ex = into.find((x) => x.fullName.toLowerCase() === k);
    if (ex && !ex.workEmail && p.workEmail) ex.workEmail = p.workEmail;
    if (ex && !ex.workPhone && p.workPhone) ex.workPhone = p.workPhone;
    return;
  }
  seen.add(k);
  into.push(p);
}

function cleanMail(raw?: string | null): string | null {
  const v = (raw ?? "").replace(/^mailto:/i, "").trim().toLowerCase();
  if (!v.includes("@") || isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) return null;
  return v;
}
function cleanTel(raw?: string | null, nation: Nation = "FI"): string | null {
  const v = normalizePhone(raw ?? "", nation);
  if (!v) return null;
  if (nation === "FI" && !v.startsWith("+358")) return null;
  if (nation === "SE" && !v.startsWith("+46")) return null;
  if (nation === "NO" && !v.startsWith("+47")) return null;
  return v;
}
function nameNearTitle(window: string, title: string): string | null {
  const idx = window.toLowerCase().indexOf(title.toLowerCase());
  const before = idx >= 0 ? window.slice(0, idx) : window;
  const after = idx >= 0 ? window.slice(idx + title.length) : window;
  for (const blob of [before, after]) {
    const caps = blob.match(/([A-ZÅÄÖÆØÜ][\p{L}'-]+(?:\s+[A-ZÅÄÖÆØÜ][\p{L}'-]+){1,2})/gu) ?? [];
    for (const c of caps.reverse()) {
      const n = cleanPersonName(c);
      if (n && plausiblePersonName(n)) return n;
    }
  }
  return null;
}
function guessNameFromEmail(email: string): string | null {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter((p) => p.length > 1);
  if (parts.length < 2) return null;
  const name = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
  return plausiblePersonName(name) ? name : null;
}
