import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listProfiles, setSchedule, startSearch } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Empty, Pill } from "@/components/status";
import type { SearchCriteria } from "@/lib/norr/types";
import { toast } from "sonner";
import { useState } from "react";
import { formatWhen } from "@/lib/format";

export const Route = createFileRoute("/_app/profiles")({ component: Profiles });

function Profiles() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["profiles"], queryFn: () => listProfiles() });
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = (q.data?.profiles ?? []) as Array<{
    id: string; name: string; criteria: SearchCriteria; schedule_enabled: boolean; updated_at: string;
    recentRuns?: Array<{ id: string; status: string; name?: string | null; created_at?: string; discovered?: number }>;
  }>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">Saved search profiles</h1>
      {rows.length === 0 ? (
        <Empty title="No profiles" body="Profiles are created when you start a search." />
      ) : (
        <div className="border border-line">
          {rows.map((p) => {
            const open = openId === p.id;
            const c = p.criteria ?? {};
            return (
              <div key={p.id} className="border-b border-line last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <button type="button" className="text-left" onClick={() => setOpenId(open ? null : p.id)}>
                    <div className="text-sm hover:underline">{p.name}</div>
                    <div className="text-xs text-mute">
                      cap {c.maxResults} · {c.country}
                      {c.mode ? ` · ${c.mode}` : ""}
                      {c.preset ? ` · ${String(c.preset).replaceAll("_", " ")}` : ""}
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {p.schedule_enabled ? <Pill tone="info">scheduled</Pill> : null}
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await setSchedule({ data: { id: p.id, enabled: !p.schedule_enabled } });
                      void q.refetch();
                    }}>{p.schedule_enabled ? "Unschedule" : "Schedule daily"}</Button>
                    <Button size="sm" variant="secondary" onClick={async () => {
                      const r = await startSearch({ data: { criteria: p.criteria, profileId: p.id, name: p.name } });
                      if (!r.ok) toast.error(r.error);
                      else nav({ to: "/search/$runId", params: { runId: r.runId } });
                    }}>Run</Button>
                  </div>
                </div>
                {open ? (
                  <div className="space-y-3 border-t border-line bg-panel px-3 py-3 text-sm">
                    <p className="text-xs text-mute">{typeof c.target === "string" ? c.target : JSON.stringify(c.target ?? c)}</p>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-faint">Past runs</div>
                      {(p.recentRuns ?? []).length === 0 ? (
                        <p className="text-xs text-mute">No runs stored for this profile yet.</p>
                      ) : (p.recentRuns ?? []).map((r) => (
                        <Link key={r.id} to="/search/$runId" params={{ runId: r.id }} className="flex justify-between border-b border-line py-1.5 last:border-0 hover:underline">
                          <span>{r.name || r.id.slice(0, 8)}</span>
                          <span className="text-xs text-mute">{r.status} · {r.discovered ?? 0} · {formatWhen(r.created_at)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
