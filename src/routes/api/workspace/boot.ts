import { createFileRoute } from "@tanstack/react-router";
import { inspectApiRequest, shieldHeaders } from "@/lib/norr/api-shield.ts";

export const maxDuration = 15;

export const Route = createFileRoute("/api/workspace/boot")({
  server: { handlers: { GET: handle } },
});

async function handle({ request }: { request: Request }) {
  const blocked = inspectApiRequest(request, { bucket: "boot", max: 180 });
  if (blocked) return blocked;
  const { auth } = await import("@/lib/auth/server");
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: shieldHeaders(request) });
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [companies, people, runs, contactRow, jobsRow, recentRuns, recentCompanies] = await Promise.all([
      sql`select count(*)::int as n from companies where user_id = ${userId} and deleted_at is null`.then((r) => r[0]),
      sql`select count(*)::int as n from people where user_id = ${userId} and deleted_at is null`.then((r) => r[0]),
      sql`select count(*)::int as n from search_runs where user_id = ${userId}`.then((r) => r[0]),
      sql`select count(*)::int as n from contacts where user_id = ${userId}`.then((r) => r[0]).catch(() => ({ n: 0 })),
      sql`select count(*)::int as n from jobs j join search_runs r on r.id = j.run_id
        where j.user_id = ${userId} and j.status = ${"running"} and r.status in ('running','queued')`.then((r) => r[0]).catch(() => ({ n: 0 })),
      sql`select id, status, created_at, name, new_leads_count, stats from search_runs where user_id = ${userId} order by created_at desc limit 8`.catch(() => []),
      sql`select id, name, municipality, industry_label, overall_confidence, record_status, website
        from companies where user_id = ${userId} and deleted_at is null order by updated_at desc limit 8`.catch(() => []),
    ]);
    let isAdmin = false;
    let plan = "free";
    let searchesUsed = 0;
    let searchesLimit = 50;
    try {
      const { readPlatformIdentity } = await import("@/lib/norr/platform.ts");
      const id = await readPlatformIdentity(sql, userId);
      isAdmin = Boolean(id.isAdmin);
      plan = isAdmin ? "unlimited" : (id.plan ?? "free");
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
        jobsRunning: Number(jobsRow?.n ?? 0),
        contacts: Number(contactRow?.n ?? 0),
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
    }, { headers: { ...shieldHeaders(request), "Cache-Control": "private, max-age=15" } });
  } catch (err) {
    console.error("[norf] workspace.boot", err);
    return Response.json({ ok: false, error: "boot failed" }, { status: 503, headers: shieldHeaders(request) });
  }
}
