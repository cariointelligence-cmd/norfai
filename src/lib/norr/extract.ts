import { extractEmails, extractPhones, isJunkEmail, decodeCfEmail, emailMatchesPerson } from "./contacts.ts";
import { ROLE_ALIASES } from "./types.ts";
import { normalizeName, normalizePhone } from "./normalize.ts";
import type { PersonHit } from "./types.ts";

export const PRIORITY_PATHS = [
  "yhteystiedot", "yhteydenotto", "ota-yhteytta", "ota-yhteyttä", "yhteys",
  "contact", "kontakt", "contacts", "impressum", "imprint",
  "meista", "meistä", "about", "about-us", "tietoa", "yritys", "company",
  "tiimi", "team", "henkilosto", "henkilöstö", "people", "staff",
  "johto", "hallitus", "management", "leadership", "organisation", "organization",
  "ledning", "styrelsen",
  "uutiset", "news", "press", "tiedotteet", "ajankohtaista",
  "ura", "careers", "jobs", "tyopaikat", "työpaikat", "open-positions",
  "referenssit", "references", "projektit", "projects",
  "palvelut", "services",
];

export const FAST_CONTACT_PATHS = [
  "/yhteystiedot",
  "/contact",
  "/tiimi",
  "/team",
  "/johto",
  "/henkilosto",
  "/henkilöstö",
  "/meista",
  "/meistä",
  "/hallitus",
  "/about",
  "/yhteydenotto",
];

export const CONTACT_SEED_PATHS = [
  "/yhteystiedot",
  "/ura",
  "/careers",
  "/jobs",
  "/tyopaikat",
  "/työpaikat",
  "/open-positions",
  "/rekrytointi",
  "/fi/ura",
  "/fi/careers",
  "/palvelut",
  "/fi/palvelut",
  "/fi/yhteystiedot",
  "/en/yhteystiedot",
  "/sv/yhteystiedot",
  "/yhteydenotto",
  "/ota-yhteytta",
  "/ota-yhteyttä",
  "/ota-yhteys",
  "/contact",
  "/fi/contact",
  "/en/contact",
  "/contact-us",
  "/contactus",
  "/kontakt",
  "/sv/kontakt",
  "/impressum",
  "/de/impressum",
  "/imprint",
  "/johto",
  "/fi/johto",
  "/hallitus",
  "/meista",
  "/meistä",
  "/yritys",
  "/about",
  "/about-us",
  "/aboutus",
  "/ueber-uns",
  "/über-uns",
  "/team",
  "/fi/team",
  "/en/team",
  "/people",
  "/staff",
  "/henkilosto",
  "/henkilöstö",
  "/management",
  "/leadership",
  "/organisation",
  "/organization",
  "/company",
  "/company/contact",
  "/asiakaspalvelu",
  "/info",
  "/yhteys",
  "/privacy",
  "/terms",
  "/yhteystiedot.html",
  "/contact.html",
  "/tietoa-meista",
  "/tietoa-meistä",
  "/yritys/yhteystiedot",
  "/fi/yritys",
  "/fi/yritys/yhteystiedot",
  "/fi/meista",
  "/en/about",
];

export function pathPriority(pathname: string): number {
  const p = pathname.toLowerCase();
  const idx = PRIORITY_PATHS.findIndex((k) => p.includes(k));
  return idx === -1 ? 50 : idx;
}

export type JsonLdJobPosting = {
  title?: string;
  url?: string;
  datePosted?: string;
  hiringOrganization?: string;
  identifier?: string;
};
export type JsonLdPerson = { name?: string; jobTitle?: string; email?: string; telephone?: string; url?: string };
export type JsonLdOrg = { name?: string; email?: string; telephone?: string; url?: string; address?: unknown };

function jsonLdType(n: Record<string, unknown>): string {
  const t = n["@type"];
  if (typeof t === "string") return t.toLowerCase();
  if (Array.isArray(t)) return t.map((x) => String(x).toLowerCase()).join(" ");
  return "";
}

function asText(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asText(item);
      if (s) return s;
    }
  }
  if (v && typeof v === "object") {
    const rec = v as Record<string, unknown>;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.url === "string") return rec.url;
    if (typeof rec["@value"] === "string") return rec["@value"] as string;
  }
  return undefined;
}

function personNameFromLd(rec: Record<string, unknown>): string | undefined {
  const given = asText(rec.givenName);
  const family = asText(rec.familyName);
  if (given && family) return `${given} ${family}`;
  return asText(rec.name);
}

export function extractJsonLd(html: string): { persons: JsonLdPerson[]; orgs: JsonLdOrg[]; jobPostings: JsonLdJobPosting[]; raw: unknown[] } {
  const persons: JsonLdPerson[] = [];
  const orgs: JsonLdOrg[] = [];
  const jobPostings: JsonLdJobPosting[] = [];
  const raw: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!.replace(/[\u0000]/g, ""));
      const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        raw.push(n);
        const rec = n as Record<string, unknown>;
        const type = jsonLdType(rec);
        if (/\bperson\b/.test(type)) {
          persons.push({
            name: personNameFromLd(rec),
            jobTitle: asText(rec.jobTitle) ?? asText(rec.roleName),
            email: asText(rec.email),
            telephone: asText(rec.telephone),
            url: asText(rec.url),
          });
        }
        if (/\bjobposting\b/.test(type)) {
          jobPostings.push({
            title: asText(rec.title),
            url: asText(rec.url),
            datePosted: asText(rec.datePosted),
            hiringOrganization: asText(rec.hiringOrganization),
            identifier: asText(rec.identifier),
          });
        }
        if (/\b(organization|corporation|localbusiness|ngo)\b/.test(type)) {
          const contact = rec.contactPoint && typeof rec.contactPoint === "object" ? (rec.contactPoint as Record<string, unknown>) : null;
          orgs.push({
            name: asText(rec.name),
            email: asText(rec.email) ?? (contact ? asText(contact.email) : undefined),
            telephone: asText(rec.telephone) ?? (contact ? asText(contact.telephone) : undefined),
            url: asText(rec.url),
            address: rec.address,
          });
          const emp = rec.employee ?? rec.founder ?? rec.member ?? rec.alumni;
          const people = Array.isArray(emp) ? emp : emp ? [emp] : [];
          for (const p of people) {
            if (!p || typeof p !== "object") continue;
            const pr = p as Record<string, unknown>;
            persons.push({
              name: personNameFromLd(pr),
              jobTitle: asText(pr.jobTitle),
              email: asText(pr.email),
              telephone: asText(pr.telephone),
              url: asText(pr.url),
            });
          }
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return { persons, orgs, jobPostings, raw };
}

export function decodeHtmlEntities(s: string): string {
  const named = (n: string) => `&${n};`;
  return s
    .replace(new RegExp(named("nbsp"), "gi"), " ")
    .replace(new RegExp(named("amp"), "gi"), "&")
    .replace(new RegExp(named("lt"), "gi"), "<")
    .replace(new RegExp(named("gt"), "gi"), ">")
    .replace(new RegExp(named("quot"), "gi"), '"')
    .replace(new RegExp(`${named("#39")}|${named("apos")}`, "gi"), "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = Number.parseInt(h, 16);
      return code >= 32 && code < 65535 ? String.fromCharCode(code) : " ";
    })
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code >= 32 && code < 65535 ? String.fromCharCode(code) : " ";
    });
}

export function decodeHref(raw: string): string {
  let s = decodeHtmlEntities(raw);
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  try {
    if (/%[0-9a-f]{2}/i.test(s)) s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  return s.trim();
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) out.title = stripTags(title).slice(0, 300);
  const re = /<meta\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1] ?? "";
    const name = /(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (name && content) out[name] = content;
  }
  const canon = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[0];
  const href = canon ? /href=["']([^"']+)["']/i.exec(canon)?.[1] : null;
  if (href) out.canonical = href;
  return out;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1]!, baseUrl).toString();
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function contactLinksFromHtml(html: string, baseUrl: string): string[] {
  return extractLinks(html, baseUrl).filter((u) => {
    try {
      const p = new URL(u).pathname.toLowerCase();
      return /yhteystiedot|contact|kontakt|impressum|imprint|johto|hallitus|meista|about|team|people|management|leadership|henkilost/i.test(p);
    } catch {
      return false;
    }
  });
}

export function extractPageContacts(html: string, pageUrl: string): {
  emails: Array<{ value: string; classification: "published" | "inferred" | "obfuscated" }>;
  phones: Array<{ value: string }>;
  text: string;
} {
  const text = stripTags(html);
  const emails: Array<{ value: string; classification: "published" | "inferred" | "obfuscated" }> = [];
  const seenE = new Set<string>();
  const pushE = (value: string, classification: "published" | "inferred" | "obfuscated") => {
    const v = value.replace(/^mailto:/i, "").trim().toLowerCase();
    if (!v || seenE.has(v) || isJunkEmail(v)) return;
    seenE.add(v);
    emails.push({ value: v, classification });
  };
  const mailRe = /href=["']mailto:([^"'?]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(html))) pushE(decodeURIComponent(m[1] ?? ""), "published");
  for (const hex of html.matchAll(/data-cfemail=["']([0-9a-fA-F]+)["']/g)) {
    const decoded = decodeCfEmail(hex[1] ?? "");
    if (decoded) pushE(decoded, "obfuscated");
  }
  for (const attr of html.matchAll(/data-(?:email|mail)=["']([^"']+@[^"']+)["']/gi)) {
    pushE(attr[1] ?? "", "published");
  }
  for (const e of extractEmails(html + " " + text)) {
    pushE(e.value, e.classification === "obfuscated" ? "obfuscated" : "published");
  }
  try {
    const ld = extractJsonLd(html);
    for (const org of ld.orgs) {
      if (org.email) pushE(org.email, "published");
    }
    for (const person of ld.persons) {
      if (person.email) pushE(person.email, "published");
    }
  } catch { /* json-ld optional */ }

  const phones: Array<{ value: string }> = [];
  const seenP = new Set<string>();
  const pushP = (raw: string) => {
    const n = normalizePhone(raw) ?? raw.replace(/[^\d+]/g, "");
    if (!n || n.length < 8 || seenP.has(n)) return;
    seenP.add(n);
    phones.push({ value: n.startsWith("+") ? n : (normalizePhone(raw) ?? n) });
  };
  const telRe = /href=["']tel:([^"']+)/gi;
  while ((m = telRe.exec(html))) pushP(decodeURIComponent(m[1] ?? "").replace(/^tel:/i, ""));
  for (const p of extractPhones(text, "FI")) pushP(p);
  void pageUrl;
  return { emails, phones, text };
}

const NAME_STOP = new Set([
  "olemme", "suomen", "suomi", "meidän", "meidan", "yhteystiedot", "toimihenkilöstö",
  "toimihenkilosto", "henkilöstö", "henkilosto", "asiakaspalvelu", "myynti", "info",
  "yritys", "osakeyhtiö", "osakeyhtio", "limited", "company", "group", "holding",
  "mukaan", "mukaan:", "sekä", "seka", "tai", "the", "and", "for", "with",
  "ota", "yhteyttä", "yhteytta", "yhteys", "tervetuloa", "tutustu", "lue", "lisää",
  "lisaa", "contact", "team", "our", "about", "katso", "näytä", "nayta", "avaa",
  "comm", "communications", "agency", "consulting", "partners", "nordic",
  "solutions", "systems", "media", "digital", "studio", "design", "ltd", "oy",
]);

export function plausiblePersonName(name: string): boolean {
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  if (parts.some((p) => NAME_STOP.has(p.toLowerCase().replace(/[:.,]/g, "")))) return false;
  if (parts.some((p) => p.length < 2)) return false;
  if (parts.some((p) => /^[A-ZÅÄÖ]{2,4}$/.test(p))) return false;
  if (/\d/.test(cleaned)) return false;
  if (!/^[A-ZÅÄÖÜÉÈÁ][\p{L}'-]+(?:\s+[A-ZÅÄÖÜÉÈÁ][\p{L}'-]+)+$/u.test(cleaned)) return false;
  if (/toimihenkil|yhteystied|olemme|mukaan/i.test(cleaned)) return false;
  return true;
}

export function cleanPersonName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = stripTags(String(raw)).replace(/\s+/g, " ").trim();
  s = s.replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "");
  const flipped = s.match(/^([\p{L}'-]+),\s+([\p{L}][\p{L}'\s-]*)$/u);
  if (flipped) s = `${flipped[2]!.trim()} ${flipped[1]}`;
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 3) {
    const first = parts[0]!.toLowerCase();
    const last = parts[parts.length - 1]!.toLowerCase();
    if (first === last) s = parts.slice(0, -1).join(" ");
  }
  s = s.replace(/[,;:]+$/g, "").trim();
  if (!plausiblePersonName(s) && !/^[A-ZÅÄÖ][\p{L}'-]+\s+[A-ZÅÄÖ][\p{L}'-]+$/u.test(s)) {
    const two = s.split(" ").slice(0, 2).join(" ");
    if (plausiblePersonName(two)) return two;
    return plausiblePersonName(s) ? s : null;
  }
  return s || null;
}

function titleToRole(title: string): { role: string; seniority: string } | null {
  const t = title.toLowerCase();
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) {
      const seniority = /ceo|toimitusjohtaja|founder|chair|puheenjohtaja|owner|omistaja|c-level|johtaja|director|direktör/.test(t)
        ? "executive"
        : "manager";
      return { role, seniority };
    }
  }
  return null;
}

export function extractPeopleFromText(text: string, sourcePage: string, roles: string[] = []): PersonHit[] {
  const wanted = new Set(roles.length ? roles : Object.keys(ROLE_ALIASES));
  const out: PersonHit[] = [];
  const seen = new Set<string>();
  const blob = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");

  const titleFirst: Array<{ title: string; role: string }> = [];
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (!wanted.has(role)) continue;
    for (const a of aliases) titleFirst.push({ title: a, role });
  }
  titleFirst.sort((a, b) => b.title.length - a.title.length);

  const push = (nameRaw: string, title: string, evidence: string, confidence: number) => {
    const fullName = cleanPersonName(nameRaw);
    if (!fullName || !plausiblePersonName(fullName)) return;
    const key = normalizeName(fullName);
    if (seen.has(key)) return;
    seen.add(key);
    const mapped = titleToRole(title);
    out.push({
      fullName,
      title,
      seniority: mapped?.seniority ?? "unknown",
      sourcePage,
      evidence,
      confidence,
    });
  };

  for (const { title } of titleFirst) {
    const re = new RegExp(
      `(?:${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s*[:\\-–]?\\s+([A-ZÅÄÖÜ][\\p{L}'-]+(?:\\s+[A-ZÅÄÖÜ][\\p{L}'-]+){1,3})`,
      "giu",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob))) {
      push(m[1] ?? "", title, `Title-first match “${title}”`, 74);
    }
    const re2 = new RegExp(
      `([A-ZÅÄÖÜ][\\p{L}'-]+(?:\\s+[A-ZÅÄÖÜ][\\p{L}'-]+){1,2})\\s*[,\\-–]\\s*(?:${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "giu",
    );
    while ((m = re2.exec(blob))) {
      push(m[1] ?? "", title, `Name-then-title “${title}”`, 70);
    }
  }

  return out.slice(0, 16);
}

export function extractPeopleFromHtml(html: string, sourcePage: string): PersonHit[] {
  const out: PersonHit[] = [...extractPeopleFromText(stripTags(html), sourcePage)];
  const seen = new Set(out.map((p) => normalizeName(p.fullName)));
  const push = (nameRaw: string, title: string | null, email: string | null, phone: string | null, evidence: string, confidence: number) => {
    const fullName = cleanPersonName(nameRaw);
    if (!fullName || !plausiblePersonName(fullName)) return;
    const key = normalizeName(fullName);
    if (seen.has(key)) {
      const existing = out.find((p) => normalizeName(p.fullName) === key);
      if (existing && email && !existing.workEmail) existing.workEmail = email;
      if (existing && title && !existing.title) existing.title = title;
      return;
    }
    seen.add(key);
    out.push({
      fullName,
      title,
      seniority: title && /johtaja|ceo|director|partner|omistaja|founder/i.test(title) ? "executive" : title ? "manager" : "unknown",
      sourcePage,
      evidence,
      confidence,
      workEmail: email,
      workPhone: phone,
    });
  };

  const itemRe = /itemtype=["'][^"']*Person[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/(?:div|article|li|section)>/gi;
  let block: RegExpExecArray | null;
  while ((block = itemRe.exec(html))) {
    const chunk = block[1] ?? "";
    const name = /itemprop=["']name["'][^>]*>([^<]+)/i.exec(chunk)?.[1]
      ?? /itemprop=["']name["'][^>]*content=["']([^"']+)/i.exec(chunk)?.[1];
    const title = /itemprop=["']jobTitle["'][^>]*>([^<]+)/i.exec(chunk)?.[1]
      ?? /itemprop=["']jobTitle["'][^>]*content=["']([^"']+)/i.exec(chunk)?.[1];
    const email = /mailto:([^"'?\s]+)/i.exec(chunk)?.[1] ?? /itemprop=["']email["'][^>]*>([^<]+)/i.exec(chunk)?.[1];
    const phone = /itemprop=["']telephone["'][^>]*>([^<]+)/i.exec(chunk)?.[1];
    if (name) push(name, title?.trim() ?? null, email ? email.toLowerCase() : null, phone ? normalizePhone(phone) : null, "HTML Person microdata", 80);
  }

  const headingRe = /<h([1-4])[^>]*>\s*([^<]{3,80})\s*<\/h\1>\s*(?:<(?:p|span|div|h[2-6]|small)[^>]*>\s*)([^<]{3,80})/gi;
  while ((block = headingRe.exec(html))) {
    const maybeName = stripTags(block[2] ?? "");
    const maybeTitle = stripTags(block[3] ?? "");
    if (plausiblePersonName(maybeName) && titleToRole(maybeTitle)) {
      push(maybeName, maybeTitle, null, null, "Heading name + title", 72);
    } else if (plausiblePersonName(maybeTitle) && titleToRole(maybeName)) {
      push(maybeTitle, maybeName, null, null, "Heading title + name", 70);
    }
  }

  const mailNameRe = />([A-ZÅÄÖ][^<]{2,40})<\/(?:a|span|div|p|h[1-6])>[\s\S]{0,180}?mailto:([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,})/gi;
  while ((block = mailNameRe.exec(html))) {
    const nm = stripTags(block[1] ?? "");
    const em = (block[2] ?? "").toLowerCase();
    if (plausiblePersonName(nm) && emailMatchesPerson(em, nm)) {
      push(nm, null, em, null, "Name next to mailto", 76);
    }
  }

  return out.slice(0, 24);
}

export function isParkingPage(html: string, title?: string | null): boolean {
  const blob = `${title ?? ""} ${stripTags(html).slice(0, 1500)}`.toLowerCase();
  return /domain is for sale|buy this domain|parked free|this domain is registered|sedoparking|godaddy.com\/forsale|hugedomains|afternic|domain parking/.test(blob);
}

export function looksLikeSpa(html: string): boolean {
  const text = stripTags(html);
  if (text.length > 400) return false;
  const scripts = (html.match(/<script/gi) ?? []).length;
  return scripts >= 4 && text.length < 280;
}

export function detectEcommerce(html: string): boolean {
  return /add to cart|ostoskori|woocommerce|shopify|data-product|ecommerce|verkkokauppa/i.test(html);
}

export function detectHiring(text: string): boolean {
  return /we(?:'| a)?re hiring|haemme|haetaan|open positions|open roles|avoimet työpaikat|avoimet tyopaikat|työpaikkailmoit|rekrytointi|join our team|careers\b|karriär|stellenangebot|now hiring|recent hiring/i.test(text);
}

export function detectLanguage(text: string): string {
  const sample = text.slice(0, 2500).toLowerCase();
  const fi = (sample.match(/ ja | että | on | ei | sekä /g) ?? []).length;
  const sv = (sample.match(/ och | att | är | för /g) ?? []).length;
  const de = (sample.match(/ und | der | die | das | für /g) ?? []).length;
  const en = (sample.match(/ the | and | of | for | with /g) ?? []).length;
  const scores = { fi, sv, de, en };
  const best = (Object.entries(scores) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 2 ? best[0] : "und";
}

export function detectTechnologies(html: string, headers?: Headers): string[] {
  const out = new Set<string>();
  if (/wp-content|wordpress/i.test(html)) out.add("wordpress");
  if (/cdn\.shopify|shopify/i.test(html)) out.add("shopify");
  if (/woocommerce/i.test(html)) out.add("woocommerce");
  if (/wix\.com|wixpress/i.test(html)) out.add("wix");
  if (/squarespace/i.test(html)) out.add("squarespace");
  if (/webflow/i.test(html)) out.add("webflow");
  if (/next\/static|_next\//i.test(html)) out.add("nextjs");
  if (/react/i.test(html) && /__NEXT_DATA__|root/i.test(html)) out.add("react");
  const gen = headers?.get("x-powered-by") ?? "";
  if (/php/i.test(gen)) out.add("php");
  if (/express/i.test(gen)) out.add("express");
  return [...out];
}

export function websiteQuality(opts: {
  html: string;
  status: number;
  https: boolean;
  title?: string | null;
  language?: string;
}): { likelyWeak: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!opts.https) notes.push("Site is not served over HTTPS");
  if (opts.status >= 400) notes.push(`HTTP ${opts.status}`);
  if (!opts.title || opts.title.length < 3) notes.push("Missing title");
  if (isParkingPage(opts.html, opts.title)) notes.push("Looks like a parking page");
  const textLen = stripTags(opts.html).length;
  if (textLen < 200) notes.push("Very little public text");
  if (looksLikeSpa(opts.html)) notes.push("Likely a client-rendered shell");
  return { likelyWeak: notes.length >= 2, notes };
}
