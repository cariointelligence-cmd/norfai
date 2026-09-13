import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminActivity } from "@/lib/norr/actions";
import { Pill } from "@/components/status";
import { formatStamp } from "@/lib/format.ts";

export const Route = createFileRoute("/admin/activity")({ component: AdminActivity });

function AdminActivity() {
  const q = useQuery({ queryKey: ["admin-activity"], queryFn: () => getAdminActivity(), refetchInterval: 12_000 });
  const d = q.data && q.data.ok ? q.data : null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          Searches, security events, audit log and new users. Same change-feed idea as workspace Changes, for the platform.
        </p>
      </div>
      <Feed title="Searches" empty="No searches yet." rows={(d?.searches ?? []).map((s: any) => ({
        id: s.id,
        when: s.created_at,
        title: s.name || String(s.id).slice(0, 8),
        meta: `${s.status} · ${s.discovered} companies · ${s.user_id}`,
        tone: s.status === "completed" ? "good" : s.status === "running" ? "warn" : "mute",
        href: `/search/${s.id}`,
      }))} />
      <Feed title="Security audit" empty="Quiet." rows={(d?.security ?? []).map((s: any) => ({
        id: s.id,
        when: s.created_at,
        title: s.action,
        meta: `${s.user_id}`,
        tone: s.risk === "high" || s.risk === "blocked" ? "bad" : s.risk === "suspicious" ? "warn" : "mute",
      }))} />
      <Feed title="System operations" empty="No audit rows." rows={(d?.audit ?? []).map((s: any) => ({
        id: s.id,
        when: s.created_at,
        title: s.action,
        meta: `${s.entity_type ?? ""} · ${s.user_id}`,
        tone: "mute" as const,
      }))} />
      <Feed title="New users" empty="No signups logged." rows={(d?.signups ?? []).map((s: any) => ({
        id: s.id,
        when: s.created_at,
        title: s.email || s.name || s.id,
        meta: s.name ?? "",
        tone: "info" as const,
      }))} />
      <p className="text-xs text-mute">Interfere from <Link className="underline" to="/admin/security">Security</Link> or <Link className="underline" to="/admin/search">Search health</Link>.</p>
    </div>
  );
}

function Feed({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; when?: string | null; title: string; meta: string; tone: "good" | "warn" | "bad" | "mute" | "info"; href?: string }> }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="border border-line">
        {rows.length === 0 ? <p className="px-3 py-3 text-sm text-mute">{empty}</p> : rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
            <span className="font-mono text-[11px] text-mute">{formatStamp(r.when)}</span>
            {r.href ? <Link className="min-w-0 truncate hover:underline" to="/search/$runId" params={{ runId: r.id }}>{r.title}</Link> : <span className="min-w-0 truncate">{r.title}</span>}
            <span className="text-xs text-mute">{r.meta}</span>
            <Pill tone={r.tone}>{r.tone === "mute" ? "event" : r.tone}</Pill>
          </div>
        ))}
      </div>
    </section>
  );
}
