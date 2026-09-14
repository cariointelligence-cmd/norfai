/** Single client loader for workspace totals. Never replaces real counts with a zero fallback. */

export type BootstrapCounts = {
  companies: number;
  people: number;
  runs: number;
  openReview: number;
  jobsRunning: number;
  contacts: number;
  sourcesConnected: number;
  sourcesTotal: number;
};

export type Bootstrap = {
  ok: true;
  workspace: Record<string, unknown>;
  counts: BootstrapCounts;
  recentRuns: unknown[];
  recentCompanies: unknown[];
  isAdmin: boolean;
  plan: string;
  searchesUsed: number;
  searchesLimit: number;
  perSearch?: number;
  seedOpen?: boolean;
  hasStripeCustomer?: boolean;
  stripeReady?: boolean;
};

export async function fetchBootstrap(): Promise<Bootstrap> {
  const r = await fetch("/api/workspace/boot", {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (r.status === 401) throw new Error("Unauthorized");
  if (!r.ok) throw new Error("boot failed");
  const j = (await r.json()) as Bootstrap & { ok?: boolean; error?: string };
  if (!j?.ok) throw new Error(j?.error || "boot failed");
  return j;
}

export function mergeBootstrap(prev: Bootstrap | undefined, next: Bootstrap): Bootstrap {
  if (!prev?.counts) return next;
  const had = Number(prev.counts.companies ?? 0) + Number(prev.counts.people ?? 0);
  const now = Number(next.counts.companies ?? 0) + Number(next.counts.people ?? 0);
  if (had > 0 && now === 0) {
    return {
      ...next,
      counts: prev.counts,
      recentCompanies: next.recentCompanies?.length ? next.recentCompanies : prev.recentCompanies,
      recentRuns: next.recentRuns?.length ? next.recentRuns : prev.recentRuns,
      isAdmin: next.isAdmin || prev.isAdmin,
      plan: next.plan && next.plan !== "free" ? next.plan : prev.plan,
    };
  }
  return next;
}

export const BOOTSTRAP_QUERY = {
  queryKey: ["bootstrap"] as const,
  queryFn: fetchBootstrap,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: 1,
  placeholderData: (prev: Bootstrap | undefined) => prev,
  structuralSharing: (oldData: Bootstrap | undefined, newData: Bootstrap) => mergeBootstrap(oldData, newData),
};
