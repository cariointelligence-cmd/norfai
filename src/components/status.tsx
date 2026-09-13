import { cn } from "@/lib/utils";

export function Pill({
  children,
  tone = "mute",
}: {
  children: React.ReactNode;
  tone?: "mute" | "good" | "warn" | "bad" | "info" | "ink";
}) {
  const map = {
    mute: "text-mute border-line",
    good: "text-good border-good/30",
    warn: "text-warn border-warn/30",
    bad: "text-bad border-bad/30",
    info: "text-info border-info/30",
    ink: "text-ink border-line-strong",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]", map[tone])}>
      {children}
    </span>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 px-5 py-8">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-prose text-sm text-mute">{body}</p>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="kicker">{label}</div>
      <div className="mt-2 font-mono text-2xl tabular text-ink">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mute">{hint}</div> : null}
    </div>
  );
}

export function ProvenanceBadge({ status }: { status?: string | null }) {
  const s = (status ?? "not_found").toLowerCase();
  const tone =
    s === "verified" || s === "published" ? "good" : s === "inferred" || s === "derived" ? "warn" : s === "failed" ? "bad" : "mute";
  const label =
    s === "published" ? "Published" : s === "verified" ? "Verified" : s === "inferred" ? "Inferred" : s === "derived" ? "Derived" : s === "failed" ? "Failed" : "Not found";
  return <Pill tone={tone as "good"}>{label}</Pill>;
}

export function SourceStatePill({ state }: { state: string }) {
  const s = state === "missing_credentials" ? "optional_offline" : state;
  const tone =
    s === "connected" ? "good"
    : s === "optional_offline" ? "mute"
    : s === "not_implemented" ? "mute"
    : s === "rate_limited" || s === "temporarily_unavailable" ? "warn"
    : s === "access_prohibited" ? "bad"
    : "mute";
  const label =
    s === "connected" ? "Online"
    : s === "optional_offline" ? "Standby"
    : s === "not_implemented" ? "Not in network"
    : s === "rate_limited" ? "Throttled"
    : s === "temporarily_unavailable" ? "Degraded"
    : s === "access_prohibited" ? "Blocked"
    : s.replaceAll("_", " ");
  return <Pill tone={tone as "good"}>{label}</Pill>;
}
