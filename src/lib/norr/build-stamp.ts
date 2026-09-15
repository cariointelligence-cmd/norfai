export const NORF_BUILD = "2026-09-16-quota-explain";

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
    resendReady: Boolean(env.RESEND_API_KEY?.trim()),
    stripeReady: Boolean(env.STRIPE_SECRET_KEY?.trim()),
    stripeWebhookReady: Boolean(env.STRIPE_WEBHOOK_SECRET?.trim()),
    xaiReady: Boolean(env.XAI_API_KEY?.trim()),
  };
}