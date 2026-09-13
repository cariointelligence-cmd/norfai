import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminSetAbuse, getSecurityCenter } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { useState } from "react";
import { toast } from "sonner";
import { formatStamp } from "@/lib/format.ts";

export const Route = createFileRoute("/admin/security")({ component: AdminSecurity });

function tone(risk: string): "good" | "warn" | "bad" | "mute" | "info" {
  if (risk === "blocked" || risk === "high") return "bad";
  if (risk === "suspicious") return "warn";
  if (risk === "normal") return "good";
  return "mute";
}

function AdminSecurity() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["security-center"], queryFn: () => getSecurityCenter(), refetchInterval: 15_000 });
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState("");
  const act = useMutation({
    mutationFn: (action: "throttle" | "suspend" | "clear") =>
      adminSetAbuse({ data: { userId: target.trim(), action, confirm } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message("Updated");
      setConfirm("");
      void qc.invalidateQueries({ queryKey: ["security-center"] });
    },
  });
  const d = q.data && q.data.ok ? q.data : null;
  const canAct = Boolean(target.trim()) && confirm === "ADMIN" && !act.isPending;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Security</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          Authentication, sessions, extraction abuse, crawler SSRF, exports and the event trail. Dates are rendered as text. Enforcement is server-side.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Rate / abuse events</div>
          <div className="mt-2 text-2xl tabular">{d?.rateBlocks ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Crawler SSRF blocks</div>
          <div className="mt-2 text-2xl tabular">{d?.ssrfBlocks ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Watched accounts</div>
          <div className="mt-2 text-2xl tabular">{d?.abuse.length ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Blocked now</div>
          <div className="mt-2 text-2xl tabular">{d?.blockedNow ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Live sessions</div>
          <div className="mt-2 text-2xl tabular">{d?.sessions ?? 0}</div>
        </div>
        <div className="border border-line bg-panel p-4">
          <div className="text-[11px] uppercase tracking-[0.16em] text-faint">Users</div>
          <div className="mt-2 text-2xl tabular">{d?.users ?? 0}</div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Extraction risk</h2>
        <p className="text-xs text-mute">Highest unique-company reads, export volume and enumeration scores. Throttle or suspend after investigation.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs text-mute">
            Account id
            <Input className="mt-1 w-72" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="user id" />
          </label>
          <label className="block text-xs text-mute">
            Type ADMIN to confirm
            <Input className="mt-1 w-40" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ADMIN" autoComplete="off" />
          </label>
          <Button variant="secondary" size="sm" disabled={!canAct} onClick={() => act.mutate("throttle")}>Throttle 2h</Button>
          <Button variant="danger" size="sm" disabled={!canAct} onClick={() => act.mutate("suspend")}>Suspend 24h</Button>
          <Button variant="secondary" size="sm" disabled={!canAct} onClick={() => act.mutate("clear")}>Clear</Button>
        </div>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                {["Account", "Score", "Class", "Companies", "Searches", "IP", ""].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d?.abuse ?? []).length === 0 ? (
                <tr><td className="px-3 py-4 text-mute" colSpan={7}>No abuse rows yet.</td></tr>
              ) : (d?.abuse ?? []).map((row: any) => (
                <tr key={row.user_id} className="border-b border-line">
                  <td className="px-3 py-2 font-mono text-xs">{String(row.user_id ?? "").slice(0, 12)}</td>
                  <td className="px-3 py-2 tabular">{row.score}</td>
                  <td className="px-3 py-2"><Pill tone={tone(row.classification)}>{row.classification}</Pill></td>
                  <td className="px-3 py-2 tabular">{row.unique_companies}</td>
                  <td className="px-3 py-2 tabular">{row.searches}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-mute">{row.last_ip ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-xs text-mute hover:text-ink" onClick={() => setTarget(row.user_id)}>Use</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Large exports</h2>
        <div className="border border-line">
          {(d?.exports ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-mute">No exports logged.</p> : (d?.exports ?? []).map((e: any, i: number) => (
            <div key={`${e.filename}-${i}`} className="flex justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0">
              <span className="truncate">{String(e.filename ?? "")}</span>
              <span className="font-mono text-xs text-mute">{e.row_count} · {e.format} · {formatStamp(e.created_at)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Security events</h2>
        <div className="border border-line">
          {(d?.events ?? []).length === 0 ? <p className="px-3 py-3 text-sm text-mute">Quiet.</p> : (d?.events ?? []).map((e: any) => (
            <div key={String(e.id)} className="grid grid-cols-[140px_1fr_80px] gap-2 border-b border-line px-3 py-2 text-xs last:border-0">
              <span className="font-mono text-mute">{formatStamp(e.created_at)}</span>
              <span>{String(e.action ?? "")}{e.ip ? ` · ${e.ip}` : ""}</span>
              <Pill tone={tone(e.risk)}>{e.risk}</Pill>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
