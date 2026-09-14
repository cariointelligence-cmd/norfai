import { createFileRoute } from "@tanstack/react-router";

export const maxDuration = 15;

export const Route = createFileRoute("/api/workspace/boot")({
  server: { handlers: { GET: handle } },
});

async function handle({ request }: { request: Request }) {
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [companies] = await sql`select count(*)::int as n from companies where user_id = ${userId} and deleted_at is null`;
    const [people] = await sql`select count(*)::int as n from people where user_id = ${userId} and deleted_at is null`;
    const [runs] = await sql`select count(*)::int as n from search_runs where user_id = ${userId}`;
    let contacts = 0;
    try {
      const [row] = await sql`select count(*)::int as n from contacts where user_id = ${userId}`;
      contacts = Number(row?.n ?? 0);
    } catch { contacts = 0; }
    const recentRuns = await sql`
      select id, status, created_at, name, new_leads_count, stats
      from search_runs where user_id = ${userId}
      order by created_at desc limit 8`;
    const recentCompanies = await sql`
      select id, name, municipality, industry_label, overall_confidence, record_status, website
      from companies where user_id = ${userId} and deleted_at is null
      order by updated_at desc limit 8`;
    let isAdmin = false;
    let plan = "free";
    let searchesUsed = 0;
    let searchesLimit = 50;
    try {
      const { readPlatformIdentity } = await import("@/lib/norr/platform.ts");
      const id = await readPlatformIdentity(sql, userId);
      isAdmin = Boolean(id.isAdmin);
      plan = id.plan ?? "free";
      searchesUsed = Number(id.searchesUsed ?? 0);
      searchesLimit = Number(id.searchesLimit ?? 50);
    } catch { /* identity optional */ }
    return Response.json({
      ok: true,
      workspace: { id: userId, name: "Workspace", onboarded_at: "1", lawful_basis: null, purpose: null, retention_days: 730, country_allowlist: "FI" },
      counts: {
        companies: Number(companies?.n ?? 0),
        people: Number(people?.n ?? 0),
        runs: Number(runs?.n ?? 0),
        openReview: 0,
        jobsRunning: 0,
        contacts,
        sourcesConnected: 8,
        sourcesTotal: 8,
      },
      recentRuns,
      recentCompanies,
      isAdmin,
      plan,
      searchesUsed,
      searchesLimit,
      perSearch: isAdmin || plan === "unlimited" ? -1 : 50,
      seedOpen: true,
      hasStripeCustomer: false,
      stripeReady: false,
    });
  } catch (err) {
    console.error("[norf] workspace.boot", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message.slice(0, 180) : "boot failed" }, { status: 500 });
  }
}
