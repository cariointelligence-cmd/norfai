/**
 * Uses process.env.VERCEL_TOKEN (Grok project secret, available on the
 * published runtime — not the agent shell) to create/link the CARIO Norfai
 * project and attach production domains. Never logs or returns the token.
 */
const CARIO_TEAM_ID = "team_y0VGLTF65bnCdCu5jipSM6CN";
const CARIO_SLUG = "cario";
const PROJECT_NAME = "norfai";
const GITHUB_REPO = "cariointelligence-cmd/norfai";

const ENV_COPY = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CRON_SECRET",
  "INTERNAL_SERVICE_SECRET",
  "APIFY_API",
  "APIFY_API_TOKEN",
  "RESEND_API_KEY",
  "XAI_API_KEY",
  "GROK_AUTH_ISSUER",
  "GROK_AUTH_CLIENT_ID",
  "GROK_AUTH_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PUBLIC_SITE_URL",
] as const;

export type DomainAttach = {
  name: string;
  ok: boolean;
  verified: boolean | null;
  error: string | null;
  recommendedCname: string | null;
};

export type VercelProvisionResult = {
  tokenPresent: boolean;
  carioAccessible: boolean;
  teamId: string | null;
  teamSlug: string | null;
  projectId: string | null;
  projectName: string | null;
  created: boolean;
  envCopied: string[];
  domains: DomainAttach[];
  deployment: { id: string | null; url: string | null; readyState: string | null; created: boolean } | null;
  git: { repo: string; linked: boolean; error: string | null };
  error: string | null;
};

function token(): string | null {
  const t = process.env.VERCEL_TOKEN?.trim();
  return t && t.length > 8 ? t : null;
}

async function vercelApi(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const t = token();
  if (!t) return { ok: false, status: 0, json: { error: { message: "VERCEL_TOKEN absent in this runtime" } } };
  const url = path.startsWith("http") ? path : `https://api.vercel.com${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

function apiError(json: any, status: number): string {
  return String(json?.error?.message || json?.error?.code || json?.message || `HTTP ${status}`);
}

export function vercelTokenPresent(): boolean {
  return Boolean(token());
}

const SECRET_ENV = new Set([
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "CRON_SECRET",
  "INTERNAL_SERVICE_SECRET",
  "APIFY_API",
  "APIFY_API_TOKEN",
  "RESEND_API_KEY",
  "XAI_API_KEY",
  "GROK_AUTH_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

async function syncProjectEnv(projectId: string, teamId: string): Promise<string[]> {
  const copied: string[] = [];
  const listed = await vercelApi(
    `/v9/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}`,
  );
  const existing: any[] = listed.json?.envs ?? [];
  const byKey = new Map<string, any>();
  for (const row of existing) {
    if (row?.key && !byKey.has(row.key)) byKey.set(row.key, row);
  }

  const wanted: Record<string, string> = {};
  for (const key of ENV_COPY) {
    if (key === "PUBLIC_SITE_URL" || key === "BETTER_AUTH_URL") {
      wanted[key] = "https://www.norfai.com";
      continue;
    }
    const value = process.env[key]?.trim();
    if (value) wanted[key] = value;
  }
  wanted.VITE_AUTH_ENABLED = "true";
  if (!wanted.CRON_SECRET && !byKey.has("CRON_SECRET")) {
    wanted.CRON_SECRET = `nrf_cron_${crypto.randomUUID().replace(/-/g, "")}`;
  }

  for (const [key, value] of Object.entries(wanted)) {
    const type = SECRET_ENV.has(key) ? "sensitive" : "plain";
    const cur = byKey.get(key);
    if (cur?.id && cur.type === type && type === "sensitive") {
      copied.push(`${key}(kept)`);
      continue;
    }
    if (cur?.id && type === "plain" && cur.value === value && cur.type === "plain") {
      copied.push(`${key}(kept)`);
      continue;
    }
    if (cur?.id) {
      await vercelApi(
        `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(cur.id)}?teamId=${encodeURIComponent(teamId)}`,
        { method: "DELETE" },
      );
    }
    const put = await vercelApi(
      `/v10/projects/${encodeURIComponent(projectId)}/env?teamId=${encodeURIComponent(teamId)}&upsert=true`,
      {
        method: "POST",
        body: JSON.stringify({
          key,
          value,
          type,
          target: ["production", "preview", "development"],
        }),
      },
    );
    if (put.ok) copied.push(type === "sensitive" ? `${key}(sensitive)` : key);
  }
  return copied;
}

async function attachDomain(projectId: string, teamId: string, name: string, redirect?: string): Promise<DomainAttach> {
  const body: Record<string, unknown> = { name };
  if (redirect) {
    body.redirect = redirect;
    body.redirectStatusCode = 308;
  }
  const added = await vercelApi(
    `/v10/projects/${encodeURIComponent(projectId)}/domains?teamId=${encodeURIComponent(teamId)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const already =
    added.status === 409 ||
    /already/i.test(apiError(added.json, added.status)) ||
    added.json?.error?.code === "domain_already_in_use";
  const ok = added.ok || already;
  const cfg = await vercelApi(`/v6/domains/${encodeURIComponent(name)}/config?teamId=${encodeURIComponent(teamId)}`);
  const intended = cfg.json?.recommendedCNAME || cfg.json?.cnames;
  let recommendedCname: string | null = null;
  if (typeof intended === "string") recommendedCname = intended;
  else if (Array.isArray(cfg.json?.recommendedCNAME) && cfg.json.recommendedCNAME[0]) {
    recommendedCname = String(cfg.json.recommendedCNAME[0].value || cfg.json.recommendedCNAME[0]);
  }
  const verified = Boolean(added.json?.verified ?? cfg.json?.misconfigured === false);
  return {
    name,
    ok,
    verified: added.ok || already ? verified : false,
    error: ok ? null : apiError(added.json, added.status),
    recommendedCname,
  };
}

function emptyResult(): VercelProvisionResult {
  return {
    tokenPresent: vercelTokenPresent(),
    carioAccessible: false,
    teamId: null,
    teamSlug: null,
    projectId: null,
    projectName: null,
    created: false,
    envCopied: [],
    domains: [],
    deployment: null,
    git: { repo: GITHUB_REPO, linked: false, error: null },
    error: null,
  };
}

export async function provisionCarioNorfai(): Promise<VercelProvisionResult> {
  const empty = emptyResult();
  if (!empty.tokenPresent) {
    empty.error = "VERCEL_TOKEN absent in this runtime";
    return empty;
  }

  const teams = await vercelApi("/v2/teams");
  if (!teams.ok) {
    empty.error = apiError(teams.json, teams.status);
    return empty;
  }
  const teamList: any[] = teams.json?.teams ?? [];
  const cario =
    teamList.find((t) => t?.id === CARIO_TEAM_ID) ||
    teamList.find((t) => String(t?.slug || "").toLowerCase() === CARIO_SLUG);
  if (!cario) {
    empty.error = `CARIO team not in token scope (teams=${teamList.length})`;
    return empty;
  }
  empty.carioAccessible = true;
  empty.teamId = cario.id;
  empty.teamSlug = cario.slug ?? CARIO_SLUG;

  const listed = await vercelApi(`/v9/projects?teamId=${encodeURIComponent(cario.id)}&limit=50`);
  if (!listed.ok) {
    empty.error = apiError(listed.json, listed.status);
    return empty;
  }
  const projects: any[] = listed.json?.projects ?? [];
  let project = projects.find((p) => p?.name === PROJECT_NAME || p?.id === PROJECT_NAME);

  if (!project) {
    const created = await vercelApi(`/v11/projects?teamId=${encodeURIComponent(cario.id)}`, {
      method: "POST",
      body: JSON.stringify({
        name: PROJECT_NAME,
        framework: null,
        ssoProtection: { deploymentType: "preview" },
        buildCommand: "npm run build",
        installCommand: "npm install",
        outputDirectory: ".vercel/output",
      }),
    });
    if (!created.ok) {
      empty.error = apiError(created.json, created.status);
      return empty;
    }
    project = created.json;
    empty.created = true;
  }

  empty.projectId = project?.id ?? null;
  empty.projectName = project?.name ?? PROJECT_NAME;
  if (!empty.projectId) {
    empty.error = "project created/listed without id";
    return empty;
  }

  await vercelApi(`/v9/projects/${encodeURIComponent(empty.projectId)}?teamId=${encodeURIComponent(cario.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ssoProtection: { deploymentType: "preview" },
      buildCommand: "npm run build",
      installCommand: "npm install",
    }),
  });

  empty.envCopied = await syncProjectEnv(empty.projectId, cario.id);

  empty.domains.push(await attachDomain(empty.projectId, cario.id, "www.norfai.com"));
  empty.domains.push(await attachDomain(empty.projectId, cario.id, "norfai.com", "www.norfai.com"));

  const link = await vercelApi(
    `/v9/projects/${encodeURIComponent(empty.projectId)}/link?teamId=${encodeURIComponent(cario.id)}`,
    {
      method: "POST",
      body: JSON.stringify({ type: "github", repo: GITHUB_REPO }),
    },
  );
  empty.git.linked = link.ok || link.status === 409;
  if (!empty.git.linked) empty.git.error = apiError(link.json, link.status);

  const existing = await vercelApi(
    `/v6/deployments?projectId=${encodeURIComponent(empty.projectId)}&teamId=${encodeURIComponent(cario.id)}&limit=8`,
  );
  const deps: any[] = existing.json?.deployments ?? [];
  const inFlight = deps.find((d) =>
    ["READY", "INITIALIZING", "BUILDING", "QUEUED", "PENDING"].includes(String(d?.readyState || d?.state || "")),
  );
  const ready = deps.find((d) => d?.readyState === "READY" || d?.state === "READY");
  if (ready) {
    empty.deployment = {
      id: ready.uid || ready.id || null,
      url: ready.url || null,
      readyState: ready.readyState || ready.state || null,
      created: false,
    };
    if (empty.deployment.id) {
      for (const alias of ["www.norfai.com", "norfai.com"]) {
        await vercelApi(
          `/v2/deployments/${encodeURIComponent(empty.deployment.id)}/aliases?teamId=${encodeURIComponent(cario.id)}`,
          { method: "POST", body: JSON.stringify({ alias }) },
        );
      }
    }
  } else if (inFlight) {
    empty.deployment = {
      id: inFlight.uid || inFlight.id || null,
      url: inFlight.url || null,
      readyState: inFlight.readyState || inFlight.state || null,
      created: false,
    };
  } else {
    const createdDep = await vercelApi(`/v13/deployments?teamId=${encodeURIComponent(cario.id)}`, {
      method: "POST",
      body: JSON.stringify({
        name: PROJECT_NAME,
        project: empty.projectId,
        target: "production",
        gitSource: {
          type: "github",
          org: "cariointelligence-cmd",
          repo: "norfai",
          ref: "main",
        },
      }),
    });
    if (createdDep.ok) {
      empty.deployment = {
        id: createdDep.json?.id || createdDep.json?.uid || null,
        url: createdDep.json?.url || null,
        readyState: createdDep.json?.readyState || "QUEUED",
        created: true,
      };
    } else {
      empty.deployment = {
        id: deps[0]?.uid || null,
        url: deps[0]?.url || null,
        readyState: deps[0]?.readyState || null,
        created: false,
      };
      if (!empty.error) empty.error = `deploy: ${apiError(createdDep.json, createdDep.status)}`;
    }
  }

  const domainFail = empty.domains.find((d) => !d.ok);
  if (domainFail && !empty.error) empty.error = `${domainFail.name}: ${domainFail.error}`;
  return empty;
}
