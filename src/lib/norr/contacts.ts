import { canonicalCompanyWebsite, normalizeDomain, normalizeName, normalizePhone, storedWebsiteUnusable } from "./normalize.ts";
import { isJunkEmailDomain } from "./junk-hosts.ts";

const ROLE_LOCAL = new Set([
  "info", "myynti", "sales", "office", "toimisto", "contact", "yhteys",
  "hallinto", "admin", "support", "tuki", "hello", "mail", "post",
  "webmaster", "noreply", "no-reply", "privacy", "gdpr", "hr", "rekry",
  "careers", "jobs", "apply", "viestinta", "communications", "press", "media",
  "billing", "laskutus", "invoice", "orders", "tilaukset",
  "asiakaspalvelu", "customerservice", "kirjaamo", "feedback",
]);

const PREFERRED_ROLE_LOCAL = new Set([
  "info", "myynti", "sales", "asiakaspalvelu", "customerservice",
  "yhteys", "contact", "office", "toimisto", "hello",
]);

const RECRUITING_LOCAL = new Set(["apply", "jobs", "careers", "rekry", "rekrytointi", "hr", "tyopaikat", "bewerbung", "jobb", "career"]);

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com",
]);

/** Personal / ISP mailboxes. Never treat these as a company website. */
const CONSUMER_MAILBOX_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.fi", "outlook.com", "outlook.fi",
  "live.com", "live.fi", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.fi", "ymail.com",
  "proton.me", "protonmail.com",
  "aol.com", "mail.com", "gmx.com", "gmx.de", "zoho.com",
  "yandex.com", "qq.com", "163.com",
  "suomi24.fi", "luukku.com",
  "elisa.net", "saunalahti.fi", "kolumbus.fi", "sci.fi",
  "dnainternet.net", "mbnet.fi", "inet.fi", "pp.inet.fi",
]);

const JUNK_EMAIL_DOMAINS = new Set([
  "example.com", "example.net", "example.org", "example.fi",
  "esimerkki.com", "esimerkki.fi", "esimerkki.net",
  "domain.com", "email.com", "sentry.io", "wixpress.com",
  "cloudflare.com", "jquery.com", "schema.org", "w3.org",
  "googleapis.com", "gstatic.com", "gravatar.com",
  "placeholder.local", "yourdomain.com", "company.com",
  "sentry-next.wixpress.com",
  "duckduckgo.com", "google.com", "bing.com", "yahoo.com",
  "wikipedia.org", "wikimedia.org",
  "vainu.com", "vainu.io", "finder.fi", "fonecta.fi",
  "k5a.io", "zaraz.com", "cloudflareinsights.com",
  "almamedia.fi", "almainights.fi", "almainsights.fi", "almatalent.fi", "kauppalehti.fi",
  "iltalehti.fi", "iltasanomat.fi", "is.fi", "hs.fi", "yle.fi",
  "aamulehti.fi", "talouselama.fi", "taloussanomat.fi", "uusisuomi.fi",
  "tekniikkatalous.fi", "tivi.fi", "mikrobitti.fi", "mtvuutiset.fi", "mtv.fi",
  "satakunnankansa.fi", "lapinkansa.fi", "kaleva.fi", "etuovi.com", "vuokraovi.com", "autotalli.com",
]);

function junkEmailHost(domain: string): boolean {
  return isJunkEmailDomain(domain);
}

const BILLING_EMAIL_DOMAINS = new Set([
  "kollektor.fi", "erin.posti.com", "posti.com",
  "fennoa.com", "fennoa.fi", "maventa.com", "maventa.fi",
  "apix.fi", "verkkolaskuosoite.fi", "logium.fi",
  "laskumappi.fi", "netbox.fi",
]);

const JUNK_EMAIL_LOCAL = new Set([
  "joku", "osoite", "nimi", "yourname", "name", "email", "test",
  "user", "username", "firstname.lastname", "example", "esimerkki",
  "toimipaik", "toimipaikka", "yhteystied", "yhteystieto", "luottotie",
  "content", "undefined", "null", "mailto", "http", "https", "www",
]);

const WORD_TLDS = new Set([
  "uutta", "tietoa", "sivut", "osoite", "yritys", "suomi", "koti", "infoa",
  "tasta", "tama", "tamaa", "tahan", "ota", "otaayhteytta", "yhteys",
]);

const GENERIC_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "io", "ai", "app", "dev", "info", "biz",
  "fi", "se", "no", "dk", "ee", "lv", "lt", "de", "uk", "eu", "fr", "nl", "es",
  "it", "pl", "cz", "at", "ch", "be", "ie", "pt", "is", "nu", "co", "us", "ca",
  "au", "nz", "jp", "kr", "in", "br", "mx", "online", "site", "store", "shop",
  "cloud", "tech", "pro", "xyz", "me", "tv", "cc", "ws", "asia", "name", "mobi",
  "group", "company", "email", "digital", "solutions", "agency", "studio",
  "media", "consulting", "international", "global", "world", "one", "life",
]);

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const OBFUSCATED_RE =
  /([a-zA-Z0-9._%+\-]+)\s*(?:\[|\()? *(?:at|ät) *(?:\]|\))?\s*([a-zA-Z0-9.\-]+)\s*(?:\[|\()? *(?:dot|piste) *(?:\]|\))?\s*([a-zA-Z]{2,})/gi;

export function isRoleAddress(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return ROLE_LOCAL.has(local) || local.endsWith(".info");
}

export function isDisposableDomain(email: string): boolean {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return DISPOSABLE.has(d);
}

export function isConsumerMailboxDomain(domain: string | null | undefined): boolean {
  const host = String(domain ?? "").toLowerCase().replace(/^www\./, "").split("/")[0] ?? "";
  if (!host) return false;
  if (CONSUMER_MAILBOX_DOMAINS.has(host)) return true;
  for (const c of CONSUMER_MAILBOX_DOMAINS) {
    if (host === c || host.endsWith(`.${c}`)) return true;
  }
  return false;
}

/**
 * Observed mailbox → company origin. Never gmail/ISP/directory.
 * Value class: DERIVED from OBSERVED, not invented.
 */
export function websiteFromPublishedEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const v = decodeEmailCandidate(email);
  if (!v.includes("@") || isJunkEmail(v) || isDisposableDomain(v) || isBillingEmail(v)) return null;
  const domain = (v.split("@")[1] ?? "").toLowerCase();
  if (!domain || !isPlausibleEmailDomain(domain) || isConsumerMailboxDomain(domain)) return null;
  return canonicalCompanyWebsite(`https://${domain}`);
}

export function websiteFromPublishedEmails(emails: Array<string | null | undefined>): string | null {
  const ranked = [...emails].filter(Boolean).sort(
    (a, b) => emailPreferenceRank(String(a)) - emailPreferenceRank(String(b)),
  );
  for (const e of ranked) {
    const w = websiteFromPublishedEmail(e);
    if (w) return w;
  }
  return null;
}

const GENERIC_EMAIL_NAME_TOKENS = new Set([
  "oy", "ab", "oyj", "ky", "ry", "tmi", "group", "holding", "finland", "suomi", "suomen",
  "toimisto", "studio", "palvelu", "palvelut", "consulting", "konsultointi",
  "arkkitehtitoimisto", "arkkitehti", "company", "corp", "ltd", "limited",
]);

export function distinctiveNameTokens(name: string | null | undefined): string[] {
  const n = normalizeName(String(name ?? ""));
  return n.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC_EMAIL_NAME_TOKENS.has(t));
}

/**
 * Mailbox belongs to this company, not a neighbour from a search snippet.
 * If a live company site is known, the domain must match it.
 * If the site is unknown, a distinctive name token must appear in the mailbox host.
 */
export function emailBelongsToCompany(
  email: string | null | undefined,
  opts: { name?: string | null; website?: string | null; extraDomains?: string[] },
): boolean {
  if (!email) return false;
  const v = decodeEmailCandidate(email);
  if (!v.includes("@") || isJunkEmail(v) || isDisposableDomain(v) || isBillingEmail(v) || isConsumerMailboxDomain(v.split("@")[1] ?? "")) {
    return false;
  }
  const domain = (v.split("@")[1] ?? "").toLowerCase();
  if (!domain || !isPlausibleEmailDomain(domain)) return false;
  const site = storedWebsiteUnusable(opts.website) ? null : normalizeDomain(opts.website ?? null);
  const owned = new Set<string>();
  if (site) owned.add(site);
  for (const extra of opts.extraDomains ?? []) {
    const n = normalizeDomain(extra);
    if (n && !storedWebsiteUnusable(n)) owned.add(n);
  }
  if (owned.size) {
    if ([...owned].some((s) => domain === s || domain.endsWith(`.${s}`) || s.endsWith(`.${domain}`))) return true;
  }
  const tokens = distinctiveNameTokens(opts.name);
  const label = domain.split(".")[0] ?? "";
  const labels = label.split(/[-_]/).filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.some((t) => t.length >= 4 && (label.includes(t) || (t.includes(label) && label.length >= 4)))) return true;
  if (tokens.some((t) => t.length >= 3 && labels.includes(t))) return true;
  return false;
}

export function needsEmailRecovery(
  email: string | null | undefined,
  opts: { name?: string | null; website?: string | null },
): boolean {
  if (!email || !String(email).trim()) return true;
  if (isJunkEmail(email) || isBillingEmail(email) || isRecruitingEmail(email)) return true;
  return !emailBelongsToCompany(email, opts);
}

export function isBillingEmail(email: string): boolean {
  const v = email.toLowerCase().trim();
  const local = v.split("@")[0] ?? "";
  const domain = v.split("@")[1] ?? "";
  if (!domain) return true;
  if (BILLING_EMAIL_DOMAINS.has(domain)) return true;
  if (domain.endsWith(".posti.com") || domain.endsWith(".kollektor.fi") || domain.endsWith(".fennoa.com") || domain.endsWith(".maventa.com") || domain.endsWith(".maventa.fi")) return true;
  if (/^(invoice|lasku|laskutus|billing|einvoice|e-invoice|verkkolasku|fennoa)([._+\-]|$)/i.test(local)) return true;
  if (local.includes("invoice") || local.includes("lasku") || local.startsWith("fennoa.")) return true;
  return false;
}

export function isRecruitingEmail(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  return RECRUITING_LOCAL.has(local);
}

/** Decode %20 / mailto / wrapping junk. Never keep URI encoding in a mailbox. */
export function decodeEmailCandidate(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^mailto:/i, "");
  s = s.split("?")[0] ?? s;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(s) && !s.includes("+")) break;
    try {
      s = decodeURIComponent(s.replace(/\+/g, "%20"));
    } catch {
      break;
    }
  }
  s = s.replace(/\s+/g, "");
  s = s.replace(/^[^A-Za-z0-9]+/, "");
  s = s.replace(/[^A-Za-z0-9.]+$/g, "");
  return s.toLowerCase();
}

export function isTemplateLocal(local: string): boolean {
  const l = local.toLowerCase();
  if (/etunimi|sukunimi|firstname|lastname|your.?name|nimi\.sukunimi|esimerkki/.test(l)) return true;
  return /^(etu(nimi)?[._\-]?suku(nimi)?|first(name)?[._\-]?last(name)?|your[._\-]?name|nimi[._\-]?sukunimi)$/i.test(l);
}

export function isTemplateEmail(email: string): boolean {
  return isTemplateLocal(email.split("@")[0] ?? "");
}

export function isPlausibleEmailDomain(domain: string): boolean {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return false;
  const tld = parts[parts.length - 1]!;
  if (WORD_TLDS.has(tld)) return false;
  if (tld.length === 2 && /^[a-z]{2}$/.test(tld)) return true;
  if (GENERIC_TLDS.has(tld)) return true;
  return false;
}

function asciiFoldToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Turn etunimi.sukunimi@domain into first.last@domain from a real person. */
export function materializeTemplateEmail(email: string, fullName: string | null | undefined): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  const local = email.split("@")[0] ?? "";
  if (!domain || !fullName || !isPlausibleEmailDomain(domain)) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const first = asciiFoldToken(parts[0]!);
  const last = asciiFoldToken(parts[parts.length - 1]!);
  if (first.length < 2 || last.length < 2) return null;
  const sep = local.includes("_") ? "_" : ".";
  const value = `${first}${sep}${last}@${domain}`;
  if (!validEmailSyntax(value) || isGarbageEmail(value)) return null;
  return value;
}

export function isGarbageEmail(email: string): boolean {
  const v = decodeEmailCandidate(email);
  const local = v.split("@")[0] ?? "";
  const domain = v.split("@")[1] ?? "";
  if (!domain) return true;
  if (v.includes("%") || v.includes(" ")) return true;
  if (junkEmailHost(domain)) return true;
  if (JUNK_EMAIL_LOCAL.has(local)) return true;
  if (isBillingEmail(v)) return true;
  if (!isPlausibleEmailDomain(domain)) return true;
  if (domain.endsWith(".png") || domain.endsWith(".jpg") || domain.endsWith(".gif") || domain.endsWith(".webp")) return true;
  if (local.includes("sentry") || domain.includes("sentry")) return true;
  if (/toimipaik|yhteystied|nimenkirjo|content_copy/.test(local)) return true;
  return false;
}

export function isJunkEmail(email: string): boolean {
  const v = decodeEmailCandidate(email);
  if (isGarbageEmail(v)) return true;
  if (isTemplateEmail(v)) return true;
  return false;
}

/** Decode + drop garbage. Templates are returned so callers can fill a real name. */
export function cleanExtractedEmail(raw: string): { value: string; template: boolean } | null {
  const v = decodeEmailCandidate(raw);
  if (!v.includes("@") || !validEmailSyntax(v)) return null;
  if (isGarbageEmail(v)) return null;
  return { value: v, template: isTemplateEmail(v) };
}

/** Lower is better. Billing/junk are excluded by callers. */
export function emailPreferenceRank(email: string, opts?: { personLinked?: boolean; companyDomain?: string | null }): number {
  const v = decodeEmailCandidate(email);
  if (isJunkEmail(v) || isBillingEmail(v) || isTemplateEmail(v)) return 100;
  const local = v.split("@")[0] ?? "";
  const domain = v.split("@")[1] ?? "";
  const onCompany = opts?.companyDomain ? domain === opts.companyDomain.replace(/^www\./, "") : false;
  if (isRecruitingEmail(v)) return 80;
  if (PREFERRED_ROLE_LOCAL.has(local) && onCompany) return 0;
  if (opts?.personLinked && !isRoleAddress(v)) return onCompany ? 2 : 5;
  if (!isRoleAddress(v)) return onCompany ? 3 : 6;
  if (PREFERRED_ROLE_LOCAL.has(local)) return 4;
  return 10;
}

export function validEmailSyntax(email: string): boolean {
  return /^[a-zA-Z0-9._+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email) && !email.includes("..") && !email.includes("%");
}

export function deobfuscateEmails(text: string): string[] {
  const out: string[] = [];
  OBFUSCATED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OBFUSCATED_RE.exec(text))) {
    out.push(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
  }
  return out;
}

export function extractEmails(text: string): { value: string; classification: "published" | "obfuscated" }[] {
  const seen = new Set<string>();
  const out: { value: string; classification: "published" | "obfuscated" }[] = [];
  const push = (raw: string, classification: "published" | "obfuscated") => {
    const cleaned = cleanExtractedEmail(raw);
    if (!cleaned || seen.has(cleaned.value)) return;
    seen.add(cleaned.value);
    out.push({ value: cleaned.value, classification });
  };
  for (const raw of text.match(EMAIL_RE) ?? []) push(raw, "published");
  for (const v of deobfuscateEmails(text)) push(v, "obfuscated");
  const mailRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mailRe.exec(text))) {
    let raw = mm[1] ?? "";
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep */
    }
    push(raw.split("?")[0] ?? raw, "published");
  }
  return out;
}

const PHONE_RE = /(?:\+|00)?(?:358|46|47|45|372|371|370)?[\s().\-]*\d(?:[\s().\-]*\d){6,13}/g;

export function extractPhones(text: string, country = "FI"): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (raw: string) => {
    const n = normalizePhone(raw, country);
    if (!n || seen.has(n)) return;
    if (country === "FI" && !n.startsWith("+358")) return;
    if (country === "FI" && /20(2[0-9])$/.test(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const raw of text.match(PHONE_RE) ?? []) take(raw);
  const telRe = /(?:tel|callto):([+\d][+\d\s().\-%]{6,20})/gi;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(text))) {
    let raw = m[1] ?? "";
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep */
    }
    take(raw);
  }
  return out;
}

export type InferredEmail = {
  value: string;
  classification: "inferred";
  derivationMethod: string;
  confidence: number | null;
};

/**
 * Infer only when the company domain is verified AND at least one published
 * mailbox on that domain reveals a pattern. Never labelled verified.
 */
export function inferEmail(opts: {
  domain: string | null;
  fullName: string;
  publishedEmails: string[];
}): InferredEmail | null {
  const domain = normalizeDomain(opts.domain);
  if (!domain) return null;
  const onDomain = opts.publishedEmails
    .map((e) => decodeEmailCandidate(e))
    .filter((e) => e.toLowerCase().endsWith(`@${domain}`));
  const templates = onDomain.filter((e) => isTemplateEmail(e));
  const personal = onDomain.filter((e) => !isRoleAddress(e) && !isTemplateEmail(e) && !isGarbageEmail(e));
  const parts = opts.fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  let method: string | null = null;
  if (templates.length) {
    const loc = templates[0]!.split("@")[0] ?? "";
    method = loc.includes("_") ? "firstname_lastname" : "firstname.lastname";
  } else {
    if (!personal.length) return null;
    const patterns = personal.map((e) => e.split("@")[0] ?? "");
    if (patterns.some((p) => p.includes("."))) method = "firstname.lastname";
    else if (patterns.some((p) => p.includes("_"))) method = "firstname_lastname";
    else if (patterns.some((p) => /^[a-z]\.?[a-z]+$/.test(p))) method = "flastname";
  }
  if (!method) return null;
  let local = "";
  if (method === "firstname.lastname") local = `${first}.${last}`;
  else if (method === "firstname_lastname") local = `${first}_${last}`;
  else local = `${first[0]}${last}`;
  const value = `${local}@${domain}`;
  if (onDomain.includes(value)) return null;
  if (!validEmailSyntax(value) || isGarbageEmail(value)) return null;
  return {
    value,
    classification: "inferred",
    derivationMethod: templates.length
      ? `pattern:template ${method} from site placeholder on ${domain}`
      : `pattern:${method} from published mailbox on ${domain}`,
    confidence: null,
  };
}

export function decodeCfEmail(hex: string): string | null {
  const h = hex.trim();
  if (h.length < 4 || h.length % 2) return null;
  const key = parseInt(h.slice(0, 2), 16);
  if (Number.isNaN(key)) return null;
  let out = "";
  for (let i = 2; i < h.length; i += 2) {
    const c = parseInt(h.slice(i, i + 2), 16);
    if (Number.isNaN(c)) return null;
    out += String.fromCharCode(c ^ key);
  }
  const v = decodeEmailCandidate(out);
  return v.includes("@") ? v : null;
}

export const GENERAL_MAILBOX_LOCALS = [
  "info", "myynti", "yhteys", "office", "hello", "contact", "asiakaspalvelu", "toimisto",
];

export function foldPersonName(fullName: string): { first: string; last: string } | null {
  const parts = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .trim()
    .split(/[\s-]+/)
    .filter((p) => p.length >= 2);
  if (parts.length < 2) return null;
  return { first: parts[0]!, last: parts[parts.length - 1]! };
}

export function nameToEmailLocals(fullName: string): string[] {
  const n = foldPersonName(fullName);
  if (!n) return [];
  return [
    `${n.first}.${n.last}`,
    `${n.first}${n.last}`,
    `${n.first}_${n.last}`,
    `${n.first[0]}${n.last}`,
    `${n.first[0]}.${n.last}`,
  ];
}

export function emailMatchesPerson(email: string, fullName: string): boolean {
  const local = decodeEmailCandidate(email).split("@")[0] ?? "";
  return nameToEmailLocals(fullName).includes(local);
}

/** Finnish default: etunimi.sukunimi@domain when MX is known. Never labelled published. */
export function inferPersonMailbox(fullName: string, domain: string): InferredEmail | null {
  const host = normalizeDomain(domain);
  const n = foldPersonName(fullName);
  if (!host || !n) return null;
  const value = `${n.first}.${n.last}@${host}`;
  if (!validEmailSyntax(value) || isGarbageEmail(value)) return null;
  return {
    value,
    classification: "inferred",
    derivationMethod: `finnish_firstname_lastname on ${host}`,
    confidence: null,
  };
}

export function inferGeneralMailbox(domain: string, published: string[]): InferredEmail | null {
  const host = normalizeDomain(domain);
  if (!host) return null;
  const onDomain = published.map((e) => decodeEmailCandidate(e)).filter((e) => e.endsWith(`@${host}`));
  if (onDomain.some((e) => PREFERRED_ROLE_LOCAL.has(e.split("@")[0] ?? ""))) return null;
  const local = GENERAL_MAILBOX_LOCALS.find((l) => !onDomain.includes(`${l}@${host}`)) ?? "info";
  if (onDomain.includes(`${local}@${host}`)) return null;
  const value = `${local}@${host}`;
  if (!validEmailSyntax(value)) return null;
  return {
    value,
    classification: "inferred",
    derivationMethod: `typical Finnish role mailbox ${local}@ on live domain ${host}`,
    confidence: null,
  };
}
