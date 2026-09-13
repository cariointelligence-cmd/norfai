import { cn } from "@/lib/utils";

export function ProgressRail({
  value,
  label,
  running,
  hint,
}: {
  value: number;
  label: string;
  running?: boolean;
  hint?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="kicker">{label}</span>
        <span className="font-mono text-xs tabular text-mute">{Math.round(pct)}%</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={label}
      >
        <div
          className={cn("progress-fill", running && pct < 100 && "progress-fill-live")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <p className="text-xs text-mute">{hint}</p> : null}
    </div>
  );
}

export function ProgressRailPulse({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <span className="kicker">{label}</span>
      <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill progress-fill-indet" />
      </div>
    </div>
  );
}
