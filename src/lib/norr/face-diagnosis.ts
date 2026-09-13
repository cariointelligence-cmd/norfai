/**
 * Face mapping for register empty-result codes.
 * Cortex writes the code; this module only chooses user-visible copy.
 */
import {
  isRegisterReasonCode,
  parseRegisterReasonNote,
  type RegisterReasonCode,
} from "./sources/register-plan.ts";

export type FaceDiagnosis = {
  code: RegisterReasonCode;
  title: string;
  detail: string;
  tone: "info" | "warn" | "bad";
};

export type SourceReportLike = {
  source?: string;
  ok?: boolean;
  error?: string | null;
  hits?: number;
  note?: string | null;
  code?: string;
  skipped?: boolean;
};

const COPY: Record<RegisterReasonCode, { title: string; fallback: string; tone: FaceDiagnosis["tone"] }> = {
  NO_MATCH: {
    title: "No companies matched these filters",
    fallback: "Official register and custom directories returned no row that passed the gate.",
    tone: "info",
  },
  SOURCE_UNAVAILABLE: {
    title: "A register did not respond",
    fallback: "The official register was unavailable. Try again later. Matching filters were not relaxed.",
    tone: "bad",
  },
  FORBIDDEN: {
    title: "This source is not allowed",
    fallback: "The source forbids this kind of query. Norf does not bypass robots or login walls.",
    tone: "warn",
  },
  OUT_OF_COVERAGE: {
    title: "Outside register coverage",
    fallback: "No register adapter covers this country yet.",
    tone: "warn",
  },
  PARTIAL: {
    title: "Partial results",
    fallback: "The register filled some, not all, of the requested count. The slice continues or the register is exhausted.",
    tone: "info",
  },
  FILTER_EXCLUDED_ALL: {
    title: "Filters excluded every candidate",
    fallback: "Candidates existed but none passed industry, legal form, or skip-seen rules. Filters were not relaxed.",
    tone: "info",
  },
};

const RANK: Record<RegisterReasonCode, number> = {
  SOURCE_UNAVAILABLE: 0,
  FORBIDDEN: 1,
  OUT_OF_COVERAGE: 2,
  FILTER_EXCLUDED_ALL: 3,
  NO_MATCH: 4,
  PARTIAL: 5,
};

function rowCode(row: SourceReportLike): RegisterReasonCode | null {
  if (isRegisterReasonCode(row.code)) return row.code;
  return parseRegisterReasonNote(row.note ?? undefined)?.code ?? null;
}

function rowText(row: SourceReportLike): string {
  const parsed = parseRegisterReasonNote(row.note ?? undefined);
  if (parsed?.text) return parsed.text;
  if (row.note && !parsed) return String(row.note);
  return "";
}

function toFace(code: RegisterReasonCode, detail?: string): FaceDiagnosis {
  const copy = COPY[code];
  return {
    code,
    title: copy.title,
    detail: (detail && detail.trim()) || copy.fallback,
    tone: copy.tone,
  };
}

/** Hide Cortex NO_MATCH written by an unfinished slice. Face must not diagnose while still searching. */
export function dropPrematureDiagnosis<T extends { source?: string; code?: string | null }>(
  report: T[] | null | undefined,
  status: string,
): T[] {
  const rows = Array.isArray(report) ? report : [];
  const live = status === "running" || status === "queued";
  if (!live) return rows;
  return rows.filter((row) => {
    const src = String(row.source ?? "");
    const code = String(row.code ?? "");
    if (code !== "NO_MATCH" && code !== "FILTER_EXCLUDED_ALL") return true;
    return src !== "Search diagnosis" && src !== "register_plan";
  });
}

export function faceRegisterDiagnosis(
  report: SourceReportLike[] | null | undefined,
  opts: { companyCount: number; status: string },
): FaceDiagnosis | null {
  const status = String(opts.status ?? "");
  if (status === "running" || status === "queued") return null;
  const rows = Array.isArray(report) ? report : [];
  const found: Array<{ code: RegisterReasonCode; text: string }> = [];
  for (const row of rows) {
    const code = rowCode(row);
    if (code) found.push({ code, text: rowText(row) });
  }
  found.sort((a, b) => RANK[a.code] - RANK[b.code]);
  if (opts.companyCount > 0) {
    const partial = found.find((f) => f.code === "PARTIAL");
    return partial ? toFace(partial.code, partial.text) : null;
  }
  if (found.length) return toFace(found[0]!.code, found[0]!.text);
  if (opts.companyCount > 0) return null;
  const failed = rows.filter((r) => r.ok === false || r.skipped);
  if (failed.length && rows.length && failed.length === rows.length) {
    return toFace("SOURCE_UNAVAILABLE", failed.find((r) => r.error)?.error ?? undefined);
  }
  if (status === "failed") {
    return toFace("SOURCE_UNAVAILABLE");
  }
  if (status === "completed" || status === "paused" || status === "cancelled") {
    return toFace("NO_MATCH");
  }
  return null;
}

export function searchRunEmptyCopy(opts: {
  status: string;
  skipSeen: boolean;
  emptyNewMessage?: string;
  diagnosis: FaceDiagnosis | null;
  jobsLive?: boolean;
}): { title: string; detail: string } {
  if (opts.jobsLive || opts.status === "running" || opts.status === "queued") {
    return {
      title: opts.skipSeen ? "Still searching" : "Searching the register",
      detail: opts.skipSeen
        ? "Still searching the register for companies you have not seen yet."
        : "Discovery is still reading the register.",
    };
  }
  if (opts.diagnosis) {
    return { title: opts.diagnosis.title, detail: opts.diagnosis.detail };
  }
  if (opts.status === "failed") {
    return { title: "Search failed", detail: "Search failed. Try again." };
  }
  if (opts.emptyNewMessage) {
    return { title: "No new companies currently match these filters.", detail: opts.emptyNewMessage };
  }
  return {
    title: "No companies matched these filters",
    detail: "If discovery finished with zero, the register returned no matches, not demo data.",
  };
}
