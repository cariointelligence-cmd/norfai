// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { scoped, teamSeatCap } from "./tenant.ts";
import { parseExclusionText } from "./exclusions.ts";
import { rankLookalikes, type LookalikeSeed } from "./lookalike.ts";
import { buildCallBriefPrompt, parseBriefText } from "./call-brief.ts";
import { pushCrm, tokenLast4, parseCrmProvider, tajuEndpointOk, tajuKeyOk, TAJU_DEFAULT_ENDPOINT, CRM_PROVIDERS } from "./crm.ts";
import { isoTime } from "../format.ts";
import { sanitizeUserText, boundedString } from "./security.ts";
import { emptyCriteria } from "./criteria.ts";
import { buildWeeklyDigest } from "./ops-store.ts";

function okErr(error: string) {
  return { ok: false as const, error };
}

export const listChanges = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  let rows = [];
  try {
    rows = await sql`
      select ch.id, ch.company_id, ch.field, ch.old_value, ch.new_value, ch.summary, ch.severity, ch.detected_at, ch.read_at, c.name
      from company_changes ch join companies c on c.id = ch.company_id
      where ch.user_id = ${uid} and c.deleted_at is null
      order by ch.detected_at desc
      limit 200`;
  } catch {
    rows = [];
  }
  let digest = null;
  try {
    digest = (await sql`select id, payload, created_at from digests where user_id = ${uid} order by created_at desc limit 1`)[0] ?? null;
  } catch { /* */ }
  return {
    changes: rows.map((r) => ({ ...r, detected_at: isoTime(r.detected_at), read_at: isoTime(r.read_at) })),
    digest: digest ? { ...digest, created_at: isoTime(digest.created_at) } : null,
  };
});

export const markChangesRead = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  try { await sql`update company_changes set read_at = now() where user_id = ${uid} and read_at is null`; } catch { /* */ }
  return { ok: true };
});

export const listExclusions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  try {
    const rows = await sql`select id, kind, value, label, source, created_at from account_exclusions where user_id = ${uid} order by created_at desc limit 2000`;
    return { rows: rows.map((r) => ({ ...r, created_at: isoTime(r.created_at) })), n: rows.length };
  } catch {
    return { rows: [], n: 0 };
  }
});

export const importExclusions = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const parsed = parseExclusionText(String(data.text ?? ""));
  if (!parsed.length) return { ok: false, error: "No valid business IDs, domains or names in the paste.", added: 0 };
  let added = 0;
  for (const row of parsed) {
    try {
      const ins = await sql`insert into account_exclusions (id, user_id, kind, value, value_normalized, label, source)
        values (${nid()}, ${uid}, ${row.kind}, ${row.value}, ${row.valueNormalized}, ${row.label ?? null}, ${"upload"})
        on conflict (user_id, kind, value_normalized) do nothing returning id`;
      if (ins[0]) added += 1;
    } catch { /* */ }
  }
  return { ok: true, added, parsed: parsed.length };
});

export const removeExclusion = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  await sql`delete from account_exclusions where id = ${boundedString(data.id, 64)} and user_id = ${uid}`;
  return { ok: true };
});

export const logActivity = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, actor } = await scoped(context);
  const companyId = boundedString(data.companyId, 64);
  const owned = (await sql`select id from companies where id = ${companyId} and user_id = ${uid} and deleted_at is null`)[0];
  if (!owned) return okErr("Not found");
  const kind = boundedString(data.kind ?? "called", 24);
  const outcome = boundedString(data.outcome ?? "", 24) || null;
  const body = sanitizeUserText(data.body ?? "", 500) || null;
  await sql`insert into company_activities (id, user_id, company_id, actor_id, kind, outcome, body)
    values (${nid()}, ${uid}, ${companyId}, ${actor}, ${kind}, ${outcome}, ${body})`;
  try {
    await sql`update companies set activity_outcome = ${outcome}, last_activity_at = now(),
      assigned_owner = coalesce(assigned_owner, ${actor})
      where id = ${companyId} and user_id = ${uid}`;
  } catch {
    await sql`update companies set assigned_owner = coalesce(assigned_owner, ${actor}) where id = ${companyId} and user_id = ${uid}`;
  }
  return { ok: true };
});

export const listActivity = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const companyId = boundedString(data.companyId, 64);
  try {
    const rows = await sql`select id, kind, outcome, body, actor_id, created_at from company_activities
      where user_id = ${uid} and company_id = ${companyId} order by created_at desc limit 50`;
    return { rows: rows.map((r) => ({ ...r, created_at: isoTime(r.created_at) })) };
  } catch {
    return { rows: [] };
  }
});

export const assignCompany = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, actor } = await scoped(context);
  const companyId = boundedString(data.companyId, 64);
  const owner = data.ownerId === "" || data.ownerId == null ? null : boundedString(data.ownerId, 128);
  await sql`update companies set assigned_owner = ${owner ?? actor} where id = ${companyId} and user_id = ${uid}`;
  return { ok: true };
});

export const lookalikeCompanies = createServerFn({ method: "GET" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const id = boundedString(data.companyId, 64);
  const seedRow = (await sql`
    select id, name, industry_code, municipality, revenue, website_score, employee_count, country
    from companies where id = ${id} and user_id = ${uid} and deleted_at is null`)[0];
  if (!seedRow) return { ok: false, error: "Not found", matches: [] };
  const pool = await sql`
    select id, name, industry_code, municipality, revenue, website_score, employee_count, country, website, business_id
    from companies where user_id = ${uid} and deleted_at is null and id <> ${id} limit 800`;
  const ranked = rankLookalikes(seedRow as LookalikeSeed, pool as LookalikeSeed[], 25);
  const byId = new Map(pool.map((p) => [p.id, p]));
  return {
    ok: true,
    seed: { id: seedRow.id, name: seedRow.name, industry_code: seedRow.industry_code, municipality: seedRow.municipality },
    matches: ranked.map((r) => ({ ...r, ...(byId.get(r.id) ?? {}) })),
  };
});

export const startLookalikeSearch = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const id = boundedString(data.companyId, 64);
  const seed = (await sql`select name, industry_code, municipality, country from companies where id = ${id} and user_id = ${uid} and deleted_at is null`)[0];
  if (!seed) return okErr("Not found");
  if (!seed.industry_code) return okErr("This company has no industry code, so a similar search cannot be bounded.");
  const c = emptyCriteria();
  c.country = seed.country || "FI";
  c.maxResults = 50;
  c.prioritizeNew = true;
  c.excludeSeen = true;
  c.excludeCustomers = true;
  c.groups.rules = [
    { id: nid(), field: "country", op: "eq", value: c.country },
    { id: nid(), field: "industry", op: "eq", value: String(seed.industry_code).slice(0, 2) },
    { id: nid(), field: "active_only", op: "eq", value: true },
  ];
  if (seed.municipality) c.groups.rules.push({ id: nid(), field: "municipality", op: "eq", value: seed.municipality });
  return { ok: true, criteria: c, name: `Similar to ${seed.name}` };
});

export const generateCallBrief = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const companyId = boundedString(data.companyId, 64);
  const co = (await sql`select * from companies where id = ${companyId} and user_id = ${uid} and deleted_at is null`)[0];
  if (!co) return okErr("Not found");
  const person = (await sql`select full_name, title from people where user_id = ${uid} and company_id = ${companyId} and deleted_at is null order by confidence desc nulls last limit 1`)[0];
  const changes = await sql`select summary from company_changes where user_id = ${uid} and company_id = ${companyId} order by detected_at desc limit 5`.catch(() => []);
  const hiring = (await sql`select id from signals where user_id = ${uid} and company_id = ${companyId} and kind = 'hiring' limit 1`)[0];
  const procurement = (await sql`select id from signals where user_id = ${uid} and company_id = ${companyId} and kind = 'procurement' limit 1`)[0];
  const facts = {
    name: String(co.name),
    businessId: co.business_id ?? null,
    municipality: co.municipality ?? null,
    industry: co.industry_label ?? co.industry_code ?? null,
    website: co.website ?? null,
    revenue: co.revenue != null ? String(co.revenue) : null,
    profit: co.profit != null ? String(co.profit) : null,
    decisionMaker: person?.full_name ?? co.decision_maker ?? null,
    decisionTitle: person?.title ?? co.decision_title ?? null,
    phone: co.phone ?? null,
    email: co.general_email ?? null,
    websiteScore: co.website_score ?? null,
    ads: co.meta_ads ?? null,
    hiring: Boolean(hiring),
    procurement: Boolean(procurement),
    changes: (changes ?? []).map((c) => String(c.summary)),
    parentName: co.parent_name ?? null,
  };
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Call brief is not available in this environment." };
  const prompt = buildCallBriefPrompt(facts);
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.2,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return { ok: false, error: "Brief could not be written. Try again." };
  const body = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content ?? "";
  const lines = parseBriefText(text);
  if (!lines.length) return { ok: false, error: "Brief came back empty." };
  const brief = { lines, generatedAt: new Date().toISOString(), model: "grok-4.5" };
  try {
    await sql`update companies set call_brief = ${JSON.stringify(brief)}::jsonb where id = ${companyId} and user_id = ${uid}`;
  } catch { /* */ }
  return { ok: true, brief };
});

export const saveCrmToken = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, isOwner } = await scoped(context);
  if (!isOwner) return okErr("Only the workspace owner can connect CRM.");
  const provider = parseCrmProvider(data.provider);
  if (!provider) return okErr("Unknown CRM.");
  const token = String(data.token ?? "").trim();
  if (token.length < 8) return okErr("Paste a private API token.");
  if (provider === "taju" && /^https?:\/\//i.test(token)) {
    return okErr("That is the API URL. Create a key with New API Key and paste the key that starts with taju_.");
  }
  if (provider === "taju" && !tajuKeyOk(token)) {
    return okErr("TAJU keys start with taju_. Create one in TAJU → Settings → API → New API Key with leads:write.");
  }
  await sql`insert into workspace_secrets (id, user_id, source_id, key_name, secret_value)
    values (${nid()}, ${uid}, ${provider}, ${"api_token"}, ${token})
    on conflict (user_id, source_id, key_name) do update set secret_value = excluded.secret_value, updated_at = now()`;
  let portal = null;
  if (provider === "taju") {
    portal = tajuEndpointOk(data.endpoint) ?? TAJU_DEFAULT_ENDPOINT;
    await sql`insert into workspace_secrets (id, user_id, source_id, key_name, secret_value)
      values (${nid()}, ${uid}, ${provider}, ${"endpoint"}, ${portal})
      on conflict (user_id, source_id, key_name) do update set secret_value = excluded.secret_value, updated_at = now()`;
  }
  try {
    await sql`insert into crm_connections (id, user_id, provider, token_last4, portal)
      values (${nid()}, ${uid}, ${provider}, ${tokenLast4(token)}, ${portal})
      on conflict (user_id, provider) do update set token_last4 = excluded.token_last4, portal = excluded.portal, last_error = null`;
  } catch {
    try {
      await sql`insert into crm_connections (id, user_id, provider, token_last4)
        values (${nid()}, ${uid}, ${provider}, ${tokenLast4(token)})
        on conflict (user_id, provider) do update set token_last4 = excluded.token_last4, last_error = null`;
    } catch { /* */ }
  }
  return { ok: true, last4: tokenLast4(token) };
});

export const getCrmStatus = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const conns = [];
  try {
    const rows = await sql`select provider, token_last4, portal, last_push_at, last_error from crm_connections where user_id = ${uid}`;
    for (const r of rows) conns.push({ provider: r.provider, last4: r.token_last4, portal: r.portal ?? null, lastPushAt: isoTime(r.last_push_at), lastError: r.last_error, connected: true });
  } catch {
    try {
      const rows = await sql`select provider, token_last4, last_push_at, last_error from crm_connections where user_id = ${uid}`;
      for (const r of rows) conns.push({ provider: r.provider, last4: r.token_last4, portal: null, lastPushAt: isoTime(r.last_push_at), lastError: r.last_error, connected: true });
    } catch { /* */ }
  }
  for (const p of CRM_PROVIDERS) {
    if (!conns.some((c) => c.provider === p)) {
      const sec = (await sql`select id from workspace_secrets where user_id = ${uid} and source_id = ${p} and key_name = ${"api_token"} limit 1`)[0];
      conns.push({ provider: p, last4: null, portal: p === "taju" ? TAJU_DEFAULT_ENDPOINT : null, connected: Boolean(sec), lastPushAt: null, lastError: null });
    }
  }
  const tajuRow = conns.find((c) => c.provider === "taju");
  return { connections: conns, tajuEndpoint: tajuRow?.portal || TAJU_DEFAULT_ENDPOINT };
});

export const disconnectCrm = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, isOwner } = await scoped(context);
  if (!isOwner) return okErr("Only the workspace owner can disconnect CRM.");
  const provider = parseCrmProvider(data.provider);
  if (!provider) return okErr("Unknown CRM.");
  await sql`delete from workspace_secrets where user_id = ${uid} and source_id = ${provider}`;
  try { await sql`delete from crm_connections where user_id = ${uid} and provider = ${provider}`; } catch { /* */ }
  return { ok: true };
});

export const pushToCrm = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  const provider = parseCrmProvider(data.provider);
  if (!provider) return { ok: false, error: "Unknown CRM.", pushed: 0 };
  const ids: string[] = Array.isArray(data.ids) ? data.ids.map((x) => boundedString(x, 64)).filter(Boolean).slice(0, 50) : [];
  const secret = (await sql`select secret_value from workspace_secrets where user_id = ${uid} and source_id = ${provider} and key_name = ${"api_token"} limit 1`)[0];
  if (!secret?.secret_value) return { ok: false, error: "Connect the CRM first.", pushed: 0 };
  let endpoint = provider === "taju" ? TAJU_DEFAULT_ENDPOINT : null;
  if (provider === "taju") {
    const ep = (await sql`select secret_value from workspace_secrets where user_id = ${uid} and source_id = ${provider} and key_name = ${"endpoint"} limit 1`)[0];
    endpoint = tajuEndpointOk(ep?.secret_value) ?? TAJU_DEFAULT_ENDPOINT;
  }
  const companies = ids.length
    ? await sql`select id, name, business_id, website, phone, municipality, country, description, general_email, industry_label from companies where user_id = ${uid} and deleted_at is null and id = any(${ids})`
    : [];
  if (!companies.length) return { ok: false, error: "Select at least one company.", pushed: 0 };
  let pushed = 0;
  let lastError = null;
  for (const c of companies) {
    const person = (await sql`select full_name, title from people where user_id = ${uid} and company_id = ${c.id} and deleted_at is null limit 1`)[0];
    const r = await pushCrm(provider, secret.secret_value, {
      name: c.name,
      businessId: c.business_id,
      website: c.website,
      phone: c.phone,
      city: c.municipality,
      country: c.country,
      description: c.description,
      personName: person?.full_name,
      personTitle: person?.title,
      email: c.general_email,
      industry: c.industry_label,
    }, { endpoint });
    try {
      await sql`insert into crm_pushes (id, user_id, company_id, provider, remote_id, status, error)
        values (${nid()}, ${uid}, ${c.id}, ${provider}, ${r.ok ? r.remoteId : null}, ${r.ok ? "ok" : "failed"}, ${r.ok ? null : r.error})`;
    } catch { /* */ }
    if (r.ok) pushed += 1;
    else lastError = r.error;
  }
  try {
    await sql`update crm_connections set last_push_at = now(), last_error = ${lastError} where user_id = ${uid} and provider = ${provider}`;
  } catch { /* */ }
  return { ok: pushed > 0, pushed, error: pushed ? null : lastError };
});

export const listTeam = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid, actor, isOwner, identity } = await scoped(context);
  const cap = teamSeatCap(identity.plan, identity.isAdmin);
  let members = [];
  try {
    members = await sql`select id, email, role, status, member_user_id, invited_at, joined_at from workspace_members where owner_user_id = ${uid} order by invited_at`;
  } catch { members = []; }
  return {
    isOwner,
    actor,
    seatCap: cap,
    seatsUsed: 1 + members.filter((m) => m.status === "active" || m.status === "invited").length,
    members: members.map((m) => ({
      ...m,
      invited_at: isoTime(m.invited_at),
      joined_at: isoTime(m.joined_at),
    })),
    plan: identity.plan,
  };
});

export const inviteMember = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, isOwner, identity } = await scoped(context);
  if (!isOwner) return okErr("Only the workspace owner can invite.");
  const cap = teamSeatCap(identity.plan, identity.isAdmin);
  if (cap <= 1) return okErr("Team seats start on Starter.");
  const email = String(data.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return okErr("Enter a valid email.");
  const used = 1 + ((await sql`select count(*)::int as n from workspace_members where owner_user_id = ${uid} and status in ('invited','active')`)[0]?.n ?? 0);
  if (used >= cap) return okErr(`Seat limit is ${cap} on this plan.`);
  const role = data.role === "admin" ? "admin" : "member";
  try {
    await sql`insert into workspace_members (id, owner_user_id, email, role, status)
      values (${nid()}, ${uid}, ${email}, ${role}, ${"invited"})
      on conflict (owner_user_id, email) do update set role = excluded.role, status = ${"invited"}`;
  } catch (err) {
    return okErr("Could not invite.");
  }
  try {
    const { queueTeamInvite } = await import("./mail-automations.ts");
    await queueTeamInvite(sql, { email, inviterUserId: uid, inviterName: identity.email });
  } catch (err) {
    console.error("[norf] team invite mail", err);
  }
  return { ok: true };
});

export const removeMember = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((d) => d).handler(async ({ context, data }): Promise<any> => {
  const { sql, uid, isOwner } = await scoped(context);
  if (!isOwner) return okErr("Only the workspace owner can remove members.");
  await sql`delete from workspace_members where id = ${boundedString(data.id, 64)} and owner_user_id = ${uid}`;
  return { ok: true };
});

export const rebuildDigest = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }): Promise<any> => {
  const { sql, uid } = await scoped(context);
  try {
    const d = await buildWeeklyDigest(sql, uid);
    return { ok: true, digest: d };
  } catch (err) {
    return { ok: false, error: "Digest could not be built yet. Changes appear after companies are refreshed." };
  }
});
