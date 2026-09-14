/**
 * Named Vercel serverless intel engines. Each is a short, isolated function
 * the drain and /api/intel/$engine can run. No paid APIs.
 */
import { nationOf, type Nation } from "./countries/env.ts";
import { hypercrawlSite } from "./sources/hypercrawl.ts";
import { runNationFleet } from "./sources/nation-fleet.ts";
import { runDecisionMakerFleet } from "./sources/dm-fleet.ts";
import { extractDecisionMakersFromHtml } from "./sources/dm-extract.ts";
import { attachDecisionContacts } from "./sources/decision-contacts.ts";
import { norwayHelper, swedenHelper } from "./sources/nation-helpers.ts";
import { BROWSER_UA, safeFetch } from "./ssrf.ts";
import { canonicalCompanyWebsite } from "./normalize.ts";

export type IntelInput = {
  name?: string;
  website?: string | null;
  businessId?: string | null;
  municipality?: string | null;
  country?: string | null;
  html?: string | null;
};

export type IntelOutput = {
  engine: string;
  emails: string[];
  phones: string[];
  people: Array<{ name: string; title?: string | null; email?: string | null; phone?: string | null }>;
  website: string | null;
  ok: boolean;
};

function nation(raw?: string | null): Nation {
  return nationOf(raw);
}

async function homeHtml(website?: string | null): Promise<{ url: string; html: string } | null> {
  const w = canonicalCompanyWebsite(website ?? null);
  if (!w) return null;
  try {
    const res = await safeFetch(w, { timeoutMs: 1600, maxBytes: 140_000, headers: { "User-Agent": BROWSER_UA, Accept: "text/html" } });
    if (res.status >= 400 || res.body.length < 80) return null;
    return { url: w, html: res.body };
  } catch { return null; }
}

function out(engine: string, extra: Partial<IntelOutput> = {}): IntelOutput {
  return { engine, emails: [], phones: [], people: [], website: extra.website ?? null, ok: true, ...extra };
}

export const INTEL_ENGINES: Record<string, (input: IntelInput) => Promise<IntelOutput>> = {
  "dm-fi": (i) => dm("FI", i),
  "dm-se": (i) => dm("SE", i),
  "dm-no": (i) => dm("NO", i),
  "fleet-fi": (i) => fleet("FI", i),
  "fleet-se": (i) => fleet("SE", i),
  "fleet-no": (i) => fleet("NO", i),
  "hyper-fi": (i) => hyper("FI", i),
  "hyper-se": (i) => hyper("SE", i),
  "hyper-no": (i) => hyper("NO", i),
  "brreg-roller": async (i) => fleet("NO", { ...i, businessId: i.businessId }),
  "jsonld-person": async (i) => proximity(i),
  "mailto-scan": async (i) => proximity(i),
  "tel-scan": async (i) => proximity(i),
  "proximity": async (i) => proximity(i),
  "sitemap-dm": (i) => dm(nation(i.country), i),
  "wiki-person": (i) => fleet(nation(i.country), i),
  "humans": (i) => hyper(nation(i.country), i),
  "vcard": async (i) => proximity(i),
  "og-profile": async (i) => proximity(i),
  "ir-governance": (i) => dm(nation(i.country), i),
  "press-contact": (i) => hyper(nation(i.country), i),
  "schema-person": async (i) => proximity(i),
  "hcard": async (i) => proximity(i),
  "allabolag-styrelse": (i) => fleet("SE", i),
  "register-no": async (i) => {
    const h = await norwayHelper({ name: i.name || "", municipality: i.municipality });
    return out("register-no", { website: h.website, people: [] });
  },
  "register-se": async (i) => {
    const h = await swedenHelper({ name: i.name || "", municipality: i.municipality });
    return out("register-se", {
      website: h.website,
      emails: h.emails.map((e) => e.value),
      phones: h.phones.map((p) => p.value),
    });
  },
};

async function dm(n: Nation, i: IntelInput): Promise<IntelOutput> {
  const r = await runDecisionMakerFleet({ website: i.website, country: n });
  return out(`dm-${n.toLowerCase()}`, {
    website: i.website ?? null,
    people: r.people.map((p) => ({ name: p.fullName, title: p.title, email: p.workEmail, phone: p.workPhone })),
    emails: r.people.map((p) => p.workEmail).filter((x): x is string => Boolean(x)),
    phones: r.people.map((p) => p.workPhone).filter((x): x is string => Boolean(x)),
  });
}

async function fleet(n: Nation, i: IntelInput): Promise<IntelOutput> {
  const r = await runNationFleet({ country: n, name: i.name || "", businessId: i.businessId, municipality: i.municipality, website: i.website, limit: 6 });
  return out(`fleet-${n.toLowerCase()}`, {
    website: r.website,
    emails: r.emails.map((e) => e.value),
    phones: r.phones.map((p) => p.value),
    people: r.people.map((p) => ({ name: p.fullName, title: p.title, email: p.workEmail, phone: p.workPhone })),
  });
}

async function hyper(n: Nation, i: IntelInput): Promise<IntelOutput> {
  const r = await hypercrawlSite({ website: i.website, country: n, companyName: i.name });
  const linked = attachDecisionContacts({ people: r.people, emails: r.emails, phones: r.phones, website: i.website ?? null });
  return out(`hyper-${n.toLowerCase()}`, {
    website: i.website ?? null,
    emails: r.emails.map((e) => e.value),
    phones: r.phones.map((p) => p.value),
    people: linked.map((p) => ({ name: p.fullName, title: p.title, email: p.workEmail, phone: p.workPhone })),
  });
}

async function proximity(i: IntelInput): Promise<IntelOutput> {
  const page = i.html ? { url: i.website || "", html: i.html } : await homeHtml(i.website);
  if (!page) return out("proximity", { ok: false });
  const people = extractDecisionMakersFromHtml(page.html, page.url, nation(i.country));
  return out("proximity", {
    website: i.website ?? null,
    people: people.map((p) => ({ name: p.fullName, title: p.title, email: p.workEmail, phone: p.workPhone })),
    emails: people.map((p) => p.workEmail).filter((x): x is string => Boolean(x)),
    phones: people.map((p) => p.workPhone).filter((x): x is string => Boolean(x)),
  });
}

export function intelEngineIds(): string[] {
  return Object.keys(INTEL_ENGINES);
}

export async function runIntelEngine(engine: string, input: IntelInput): Promise<IntelOutput> {
  const fn = INTEL_ENGINES[engine];
  if (!fn) return out(engine, { ok: false });
  const n = nation(input.country);
  if (engine.endsWith("-fi") && n !== "FI") return out(engine, { ok: false });
  if (engine.endsWith("-se") && n !== "SE") return out(engine, { ok: false });
  if (engine.endsWith("-no") && n !== "NO") return out(engine, { ok: false });
  return fn(input);
}
