const PG_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL_POOLED",
  "NEON_DATABASE_URL",
] as const;

export function neonPooledUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/-pooler\./i.test(u.hostname) || /pgbouncer=true/i.test(url)) return url;
    if (!/\.neon\.tech$/i.test(u.hostname)) return url;
    u.hostname = u.hostname.replace(/^([^.]+)\./, "$1-pooler.");
    return u.toString();
  } catch {
    return url;
  }
}

export function resolvePostgresUrl(env: NodeJS.ProcessEnv = typeof process !== "undefined" ? process.env : {}): {
  url: string | undefined;
  pooled: boolean;
  source: string | null;
} {
  let found: { url: string; source: string } | null = null;
  for (const key of PG_URL_KEYS) {
    const v = env[key]?.trim();
    if (!v) continue;
    found = { url: v, source: key };
    if (/-pooler\.|pgbouncer=true/i.test(v)) {
      return { url: v, pooled: true, source: key };
    }
  }
  if (!found) return { url: undefined, pooled: false, source: null };
  const pooledUrl = neonPooledUrl(found.url);
  return {
    url: pooledUrl,
    pooled: pooledUrl !== found.url || /-pooler\./i.test(pooledUrl),
    source: found.source,
  };
}
