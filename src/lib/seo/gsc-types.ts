export type GscMode = "oauth" | "service_account";

export type GscSite = { siteUrl: string; permissionLevel: string };

export type GscMetricRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  errors: number;
  warnings: number;
  isPending: boolean;
};

export type GscSnapshot = {
  range: { startDate: string; endDate: string };
  totals: GscTotals;
  queries: GscMetricRow[];
  pages: GscMetricRow[];
  countries: GscMetricRow[];
  devices: GscMetricRow[];
  sitemaps: GscSitemap[];
  fetchedAt: string;
};

export type GscPublicView = {
  connected: boolean;
  reason: string;
  clientConfigured: boolean;
  clientIdHint: string | null;
  redirectUri: string | null;
  mode: GscMode | null;
  googleEmail: string | null;
  serviceAccountEmail: string | null;
  siteUrl: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  sites: GscSite[];
  snapshot: GscSnapshot | null;
};
