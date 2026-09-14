import { Pill } from "@/components/status";
import type { CompanyIntel } from "@/lib/norr/targeting/scores";
import { hiringFaceLabel } from "@/lib/norr/hiring-signal";

export { contactFaceValue, decisionMakerFace } from "@/lib/norr/face-value";

export function scoreLabel(n: number | null | undefined, opts?: { pending?: boolean }): string {
  if (opts?.pending && (n == null || !Number.isFinite(Number(n)))) return "Pending";
  if (n == null || !Number.isFinite(Number(n))) return "Not evaluated";
  return String(Math.round(Number(n)));
}

export function formatEuro(n: number | string | null | undefined): string {
  if (n == null || n === "") return "UNKNOWN";
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "Not found";
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1000) return `€${Math.round(v / 1000)}k`;
  return `€${Math.round(v)}`;
}

export function metaAdLabel(state: string | null | undefined): string {
  if (!state || state === "UNKNOWN") return "Not found";
  if (state === "LIKELY") return "Likely (pixel on site)";
  if (state === "DETECTED") return "Detected on site";
  if (state === "NOT_DETECTED") return "Not detected";
  if (state === "ACTIVE" || state === "ACTIVE_OR_RECENT" || state === "RECENT") return "Pixel/tags on site";
  if (state === "NONE") return "Not detected";
  return "Not found";
}

export function asCompanyIntel(raw: unknown): CompanyIntel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Partial<CompanyIntel>;
  if (!o.match && !o.scores && !o.website) return null;
  return o as CompanyIntel;
}

export function ScoreBits({
  match,
  website,
  seo,
  opportunity,
  ageYears,
  metaAds,
  hasWebsite,
  hiring,
}: {
  match?: number | null;
  website?: number | null;
  seo?: number | null;
  opportunity?: number | null;
  ageYears?: number | null;
  metaAds?: string | null;
  hasWebsite?: boolean;
  hiring?: string[] | string | null;
}) {
  const item = (label: string, value: string) => (
    <span key={label} className="border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-mute">
      {label} <span className="font-mono tabular text-ink">{value}</span>
    </span>
  );
  const hire = Array.isArray(hiring) ? hiringFaceLabel(hiring) : hiring ? hiringFaceLabel([hiring]) : null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {item("Match", scoreLabel(match))}
      {item("Site", scoreLabel(website, { pending: Boolean(hasWebsite) }))}
      {item("SEO", scoreLabel(seo, { pending: Boolean(hasWebsite) }))}
      {item("Opp", scoreLabel(opportunity))}
      {ageYears != null ? item("Age", `${ageYears}y`) : item("Age", "Not found")}
      {metaAds ? item("Meta", metaAdLabel(metaAds)) : null}
      {hire ? item("Hiring", hire) : item("Hiring", "Unknown")}
    </div>
  );
}

function Meter({ label, value, hint }: { label: string; value: number | null | undefined; hint?: string }) {
  const n = value == null || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.min(100, Number(value)));
  return (
    <div className="border border-line bg-panel p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.12em] text-faint">{label}</div>
        <div className="font-mono text-sm tabular">{n == null ? "Not evaluated" : n}</div>
      </div>
      <div className="mt-2 h-1.5 bg-panel-2">
        {n == null ? null : <div className="h-full bg-ink" style={{ width: `${n}%` }} />}
      </div>
      {hint ? <p className="mt-2 text-xs text-mute">{hint}</p> : null}
    </div>
  );
}

export function IntelligencePanel({ intel }: { intel: CompanyIntel | null | undefined }) {
  if (!intel) {
    return (
      <section className="border border-line bg-panel p-4">
        <h2 className="text-sm font-medium">Intelligence</h2>
        <p className="mt-2 text-sm text-mute">Scores appear after scrape. Missing values stay Not evaluated — never filled with a default number.</p>
      </section>
    );
  }
  const scores = intel.scores ?? {
    commercialOpportunity: null,
    digitalOpportunity: null,
    marketingWaste: null,
    modernizationNeed: null,
    purchaseCapacity: null,
    growthReadiness: null,
  };
  const why = intel.match?.why?.filter(Boolean).slice(0, 6) ?? [];
  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Meter label="Commercial" value={scores.commercialOpportunity} />
        <Meter label="Digital" value={scores.digitalOpportunity} />
        <Meter label="Purchase capacity" value={scores.purchaseCapacity} />
        <Meter label="Financial growth" value={scores.growthReadiness} hint="Only from comparable published periods. Hiring is not growth." />
        <Meter label="Modernization" value={scores.modernizationNeed} />
        <Meter label="Marketing waste" value={scores.marketingWaste} />
        <Meter label="Evidence completeness" value={intel.evidenceCompleteness?.score ?? null} hint="How much of the company was actually observed. Not a fit score." />
      </div>
      <div className="border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-medium">Hiring</h2>
        <p className="text-sm text-mute">{hiringFaceLabel(intel.hiring?.evidence)}</p>
        {intel.hiring?.evidence?.includes("HIRING_SOURCE_FAILED") ? (
          <p className="mt-2 text-xs text-mute">Job-board search failed. That is not evidence the company is not hiring.</p>
        ) : null}
        {intel.hiring?.active === false && hiringFaceLabel(intel.hiring?.evidence) === "Unknown" ? (
          <p className="mt-2 text-xs text-mute">No confirmed listing and no on-site indication. Status stays unknown.</p>
        ) : null}
      </div>
      {intel.match?.status === "INSUFFICIENT_DATA" || intel.match?.status === "NOT_EVALUATED" ? (
        <div className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Match</h2>
          <p className="text-sm text-mute">{intel.match.explanation || "Ei riittävästi tietoa pisteytykseen"}</p>
        </div>
      ) : null}
      {why.length ? (
        <div className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Why this match</h2>
          <ul className="space-y-1 text-sm text-mute">
            {why.map((w) => <li key={w}>{w}</li>)}
          </ul>
          {intel.match?.unknown?.length ? (
            <p className="mt-3 text-xs text-mute">Unknown (not invented): {intel.match.unknown.join("; ")}</p>
          ) : null}
          {intel.match?.missed?.length ? (
            <p className="mt-2 text-xs text-mute">Missed: {intel.match.missed.join("; ")}</p>
          ) : null}
        </div>
      ) : null}
      {intel.website?.notes?.length ? (
        <div className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Website notes</h2>
          <ul className="space-y-1 text-sm text-mute">
            {intel.website.notes.slice(0, 8).map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      ) : null}
      {intel.specializations?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {intel.specializations.slice(0, 8).map((s) => <Pill key={s}>{s}</Pill>)}
        </div>
      ) : null}
    </section>
  );
}
