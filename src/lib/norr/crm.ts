import { FETCH_UA, safeFetch } from "./ssrf.ts";

export const CRM_PROVIDERS = ["hubspot", "pipedrive", "taju"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

/** Public TAJU CRM inbound webhook. Override per workspace if Settings → API shows another URL. */
export const TAJU_DEFAULT_ENDPOINT = "https://wapvbkhkotroygwmsiee.supabase.co/functions/v1/api-webhook";

export type CrmCompany = {
  name: string;
  businessId?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  description?: string | null;
  personName?: string | null;
  personTitle?: string | null;
  email?: string | null;
  industry?: string | null;
};

export function parseCrmProvider(raw: unknown): CrmProvider | null {
  const v = String(raw ?? "").toLowerCase().trim();
  return (CRM_PROVIDERS as readonly string[]).includes(v) ? (v as CrmProvider) : null;
}

export function tajuEndpointOk(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** TAJU keys are taju_ plus 32 alphanumeric chars. Loose enough if they lengthen the suffix. */
export function tajuKeyOk(raw: string | null | undefined): boolean {
  const s = String(raw ?? "").trim();
  return /^taju_[A-Za-z0-9]{20,}$/.test(s);
}

function last4(token: string): string {
  const t = token.trim();
  return t.length <= 4 ? t : t.slice(-4);
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return `••••${last4(token)}`;
}

export function tokenLast4(token: string): string {
  return last4(token);
}

function parseJson(body: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Fields TAJU actually inserts on leads. Extra columns (city, Y-tunnus) go into notes. */
export function tajuLeadBody(company: CrmCompany): Record<string, unknown> {
  const contact = (company.personName || company.name).trim();
  const notes = [
    company.businessId ? `Y-tunnus ${company.businessId}` : "",
    company.city || "",
    company.country && company.country !== "FI" ? company.country : "",
    company.personTitle ? company.personTitle : "",
    company.description ? String(company.description).slice(0, 400) : "",
  ].filter(Boolean).join(". ");
  return {
    event: "lead.create",
    company_name: company.name,
    contact_person: contact,
    email: company.email || null,
    phone: company.phone || null,
    website: company.website || null,
    industry: company.industry || null,
    source: "Norf",
    notes: notes || null,
    status: "new",
  };
}

export async function pushHubspot(token: string, company: CrmCompany): Promise<{ ok: true; remoteId: string } | { ok: false; error: string }> {
  const res = await safeFetch("https://api.hubapi.com/crm/v3/objects/companies", {
    method: "POST",
    timeoutMs: 15000,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": FETCH_UA,
    },
    body: JSON.stringify({
      properties: {
        name: company.name,
        domain: company.website ? company.website.replace(/^https?:\/\//, "").split("/")[0] : undefined,
        website: company.website ?? undefined,
        phone: company.phone ?? undefined,
        city: company.city ?? undefined,
        country: company.country ?? undefined,
        description: company.description ?? undefined,
      },
    }),
  });
  const body = parseJson(res.body);
  if (res.status < 200 || res.status >= 300 || typeof body.id !== "string") {
    const msg = typeof body.message === "string" ? body.message : `HubSpot ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, remoteId: body.id };
}

export async function pushPipedrive(token: string, company: CrmCompany): Promise<{ ok: true; remoteId: string } | { ok: false; error: string }> {
  const url = `https://api.pipedrive.com/v1/organizations?api_token=${encodeURIComponent(token.trim())}`;
  const res = await safeFetch(url, {
    method: "POST",
    timeoutMs: 15000,
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": FETCH_UA },
    body: JSON.stringify({
      name: company.name,
      address: [company.city, company.country].filter(Boolean).join(", ") || undefined,
    }),
  });
  const body = parseJson(res.body);
  const data = body.data && typeof body.data === "object" ? (body.data as { id?: number }) : null;
  if (res.status < 200 || res.status >= 300 || !data?.id) {
    const msg = typeof body.error === "string" ? body.error : `Pipedrive ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, remoteId: String(data.id) };
}

export async function pushTaju(
  token: string,
  company: CrmCompany,
  endpoint = TAJU_DEFAULT_ENDPOINT,
): Promise<{ ok: true; remoteId: string } | { ok: false; error: string }> {
  const url = tajuEndpointOk(endpoint) ?? TAJU_DEFAULT_ENDPOINT;
  const res = await safeFetch(url, {
    method: "POST",
    timeoutMs: 15000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": token.trim(),
      "User-Agent": FETCH_UA,
    },
    body: JSON.stringify(tajuLeadBody(company)),
  });
  const body = parseJson(res.body);
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "TAJU hylkäsi avaimen. Luo avain leads:write-oikeudella TAJU → Asetukset → API → New API Key." };
  }
  if (res.status < 200 || res.status >= 300) {
    const msg =
      typeof body.error === "string" ? body.error
      : typeof body.message === "string" ? body.message
      : `TAJU ${res.status}`;
    return { ok: false, error: msg };
  }
  const nested = body.data && typeof body.data === "object" ? (body.data as { id?: unknown }) : null;
  const lead = body.lead && typeof body.lead === "object" ? (body.lead as { id?: unknown }) : null;
  const id = body.id ?? body.lead_id ?? nested?.id ?? lead?.id ?? company.name;
  return { ok: true, remoteId: String(id) };
}

export async function pushCrm(
  provider: CrmProvider,
  token: string,
  company: CrmCompany,
  opts?: { endpoint?: string | null },
) {
  if (provider === "hubspot") return pushHubspot(token, company);
  if (provider === "pipedrive") return pushPipedrive(token, company);
  return pushTaju(token, company, opts?.endpoint ?? TAJU_DEFAULT_ENDPOINT);
}
