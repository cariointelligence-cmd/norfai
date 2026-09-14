import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminState } from "@/lib/norr/actions";
import { Pill } from "@/components/status";
import { NORF_BUILD } from "@/lib/norr/build-stamp.ts";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const q = useQuery({ queryKey: ["admin-state"], queryFn: () => getAdminState(), refetchInterval: 20_000 });
  const d = q.data;
  const findings = (d?.findings ?? []) as Array<{ severity: string; title: string; why: string; trail: string }>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Platform</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          Live operating picture: users, searches, queue and security. Open a finding to act.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={d?.userCount ?? d?.workspaceCount ?? "-"} />
        <Stat label="Workspaces" value={d?.workspaceCount ?? "-"} />
        <Stat label="Searches today" value={d?.searchesToday ?? 0} />
        <Stat label="Jobs running" value={d?.jobsLive ?? 0} />
        <Stat label="Jobs queued" value={d?.jobsQueued ?? 0} />
        <Stat label="Companies" value={d?.companiesTotal ?? 0} />
        <Stat label="Searches running" value={d?.searchesRunning ?? 0} />
        <Stat label="Security high 24h" value={d?.securityHigh ?? 0} />
        <Stat label="Admins" value={d?.admins?.length ?? "-"} />
      </div>
      <section>
        <h2 className="mb-2 text-sm font-medium">Findings</h2>
        <div className="border border-line">
          {findings.length === 0 ? (
            <p className="px-3 py-3 text-sm text-mute">No active warnings. Queue, searches and security look quiet.</p>
          ) : findings.map((f) => (
            <a key={f.title} href={f.trail} className="flex items-start justify-between gap-3 border-b border-line px-3 py-3 last:border-0 hover:bg-panel-2/60">
              <div>
                <div className="flex items-center gap-2">
                  <Pill tone={f.severity === "threat" ? "bad" : f.severity === "warning" ? "warn" : "mute"}>{f.severity}</Pill>
                  <span className="text-sm">{f.title}</span>
                </div>
                <p className="mt-1 text-xs text-mute">{f.why}</p>
              </div>
              <span className="text-xs text-faint">{f.trail}</span>
            </a>
          ))}
        </div>
      </section>
      {(d?.planMix ?? []).length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium">Plans</h2>
          <div className="flex flex-wrap gap-2">
            {(d?.planMix ?? []).map((p: { plan: string; n: number }) => (
              <Pill key={p.plan} tone="info">{p.plan} {p.n}</Pill>
            ))}
          </div>
        </section>
      ) : null}
      <p className="text-sm text-mute">
        Build {NORF_BUILD}. Seed signup: {d?.seedOpen ? "open for CARIO and TAJU emails" : "closed. Invite from Users."}
        {" "}Create accounts and gift plans under Users. Drain a stuck queue from Search health.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="border border-line px-3 py-2 hover:bg-panel-2" to="/admin/search">Search health</Link>
        <Link className="border border-line px-3 py-2 hover:bg-panel-2" to="/admin/security">Security</Link>
        <Link className="border border-line px-3 py-2 hover:bg-panel-2" to="/admin/activity">Activity</Link>
        <Link className="border border-line px-3 py-2 hover:bg-panel-2" to="/admin/team">Users</Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-panel p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mt-2 text-2xl tabular">{value}</div>
    </div>
  );
}
