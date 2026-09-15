import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getVisitorFeed } from "@/lib/norr/actions";
import { Pill } from "@/components/status";
import { formatWhen } from "@/lib/format";

export const Route = createFileRoute("/admin/visitors")({ component: AdminVisitors });

function identTone(c: string): "good" | "warn" | "info" | "mute" {
  if (c === "session") return "good";
  if (c === "cookie_linked") return "info";
  if (c === "ip_linked") return "warn";
  return "mute";
}

function AdminVisitors() {
  const q = useQuery({
    queryKey: ["visitor-feed"],
    queryFn: () => getVisitorFeed(),
    refetchInterval: 8_000,
  });
  const d = q.data && q.data.ok ? q.data : null;
  const sessions = d?.sessions ?? [];
  const hits = d?.hits ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Visitors</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          First-party cookie and IP engines on norfai.com. Email and name appear only when the visitor is signed in, or when the same cookie or IP later signed in. Unknown stays unknown.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Hits 24h</div>
          <div className="mt-2 text-2xl tabular">{d?.last24h ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Identified 24h</div>
          <div className="mt-2 text-2xl tabular">{d?.identified24h ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Live cookies</div>
          <div className="mt-2 text-2xl tabular">{sessions.length}</div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Sessions (30 days)</h2>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                {["IP", "Email", "Name", "How", "Last page", "Geo", "Device", "Hits", "Last seen"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td className="px-3 py-3 text-mute" colSpan={9}>No visitors yet. Open the site in another tab.</td></tr>
              ) : sessions.map((s: Record<string, unknown>) => (
                <tr key={String(s.vid)} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{String(s.ip ?? "")}</td>
                  <td className="px-3 py-2">{s.email ? String(s.email) : <span className="text-mute">Unknown</span>}</td>
                  <td className="px-3 py-2">{s.name ? String(s.name) : <span className="text-mute">—</span>}</td>
                  <td className="px-3 py-2"><Pill tone={identTone(String(s.identity_class ?? "unknown"))}>{String(s.identity_class ?? "unknown")}</Pill></td>
                  <td className="px-3 py-2 font-mono text-xs">{String(s.path ?? "/")}</td>
                  <td className="px-3 py-2 text-xs">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs">{[s.device, s.os].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2 font-mono tabular">{Number(s.hits ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-mute">{formatWhen(s.last_seen as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Recent page hits</h2>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                {["When", "IP", "Path", "Email", "Identity", "Geo"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hits.map((h: Record<string, unknown>) => (
                <tr key={String(h.id)} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-xs text-mute">{formatWhen(h.created_at as string)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(h.ip ?? "")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{String(h.path ?? "/")}</td>
                  <td className="px-3 py-2">{h.email ? String(h.email) : <span className="text-mute">Unknown</span>}</td>
                  <td className="px-3 py-2"><Pill tone={identTone(String(h.identity_class ?? "unknown"))}>{String(h.identity_class ?? "unknown")}</Pill></td>
                  <td className="px-3 py-2 text-xs">{[h.city, h.country].filter(Boolean).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
