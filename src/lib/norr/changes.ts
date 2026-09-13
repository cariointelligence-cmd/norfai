export type Snapshot = {
  website: string | null;
  content_hash: string | null;
  decision_maker: string | null;
  revenue: string | null;
  profit: string | null;
  ads: string | null;
  people_hash: string | null;
  phone: string | null;
  email: string | null;
  business_status: string | null;
};

export type Change = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  summary: string;
  severity: "info" | "high";
};

function norm(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const LABELS: Record<string, string> = {
  website: "Website",
  content_hash: "Website content",
  decision_maker: "Decision-maker",
  revenue: "Published revenue",
  profit: "Published profit",
  ads: "Advertising signals",
  people_hash: "People on record",
  phone: "Phone",
  email: "Email",
  business_status: "Register status",
};

export function diffSnapshots(prev: Snapshot | null | undefined, next: Snapshot): Change[] {
  if (!prev) return [];
  const fields: Array<keyof Snapshot> = [
    "website",
    "content_hash",
    "decision_maker",
    "revenue",
    "profit",
    "ads",
    "people_hash",
    "phone",
    "email",
    "business_status",
  ];
  const out: Change[] = [];
  for (const field of fields) {
    const a = norm(prev[field]);
    const b = norm(next[field]);
    if (a === b) continue;
    if (!a && !b) continue;
    const label = LABELS[field] ?? field;
    let summary = `${label} changed`;
    let severity: "info" | "high" = "info";
    if (field === "content_hash") summary = a ? "Website content changed" : "Website crawled for the first time";
    else if (field === "decision_maker") {
      summary = b ? `Decision-maker is now ${b}` : "Decision-maker no longer listed";
      severity = "high";
    } else if (field === "business_status") {
      summary = `Register status ${a ?? "unknown"} → ${b ?? "unknown"}`;
      severity = "high";
    } else if (field === "revenue") {
      summary = b ? `Published revenue is now ${b}` : "Published revenue removed";
      severity = "high";
    } else if (field === "ads") {
      summary = b && b !== "NONE" && b !== "NOT_DETECTED" ? "Advertising signals appeared" : "Advertising signals changed";
    } else if (field === "website") summary = b ? `Website is now ${b}` : "Website missing";
    else if (a && b) summary = `${label}: ${a} → ${b}`;
    else if (b) summary = `${label} found: ${b}`;
    else summary = `${label} no longer listed`;
    out.push({ field, oldValue: a, newValue: b, summary, severity });
  }
  return out;
}

export function digestSummary(changes: Array<{ summary: string; severity: string; name?: string }>): {
  headline: string;
  lines: string[];
} {
  const high = changes.filter((c) => c.severity === "high");
  const n = changes.length;
  const headline = n === 0 ? "No changes this week" : `${n} change${n === 1 ? "" : "s"} on watched companies`;
  const lines = (high.length ? high : changes).slice(0, 12).map((c) => (c.name ? `${c.name}: ${c.summary}` : c.summary));
  return { headline, lines };
}
