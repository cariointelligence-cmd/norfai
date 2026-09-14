export const NORF_BUILD = "2026-09-14-admin-quota-fast";

export function vercelDeployProbe() {
  const env = process.env;
  return {
    vercel: Boolean(env.VERCEL),
    env: env.VERCEL_ENV ?? null,
    region: env.VERCEL_REGION ?? null,
    url: env.VERCEL_URL ?? null,
    gitSha: (env.VERCEL_GIT_COMMIT_SHA ?? env.GIT_SHA ?? "").slice(0, 12) || null,
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
    cronConfigured: Boolean(env.CRON_SECRET?.trim()),
    drainRoute: "/api/jobs/drain",
    tokenPresent: Boolean(env.VERCEL_TOKEN?.trim()),
  };
}
