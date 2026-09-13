/** Scoring is blocked until enrich (and scrape, if queued) have actually run.
 * Extra crawl/signals jobs must not hold scoring or the whole search open.
 */

export type JobSlice = { type?: string | null; status?: string | null };

export type ScoreGate = "score" | "wait" | "enqueue_scrape";

const LIVE = new Set(["queued", "running"]);
const SCRAPE_DONE = new Set(["done", "failed"]);

export function scoreMayProceed(jobs: JobSlice[] | null | undefined): ScoreGate {
  const list = jobs ?? [];
  const scrape = list.filter((j) => j.type === "scrape");
  const enrich = list.filter((j) => j.type === "enrich");
  if (enrich.some((j) => LIVE.has(String(j.status ?? "")))) return "wait";
  if (enrich.some((j) => String(j.status ?? "") === "done")) return "score";
  if (scrape.some((j) => LIVE.has(String(j.status ?? "")))) return "wait";
  if (scrape.some((j) => SCRAPE_DONE.has(String(j.status ?? "")))) return "score";
  return "enqueue_scrape";
}

export function scrapeHasFinished(jobs: JobSlice[] | null | undefined): boolean {
  return (jobs ?? []).some((j) => j.type === "scrape" && SCRAPE_DONE.has(String(j.status ?? "")));
}
