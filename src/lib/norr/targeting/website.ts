import { detectEcommerce, extractJsonLd, extractMeta, isParkingPage, looksLikeSpa, stripTags } from "../extract.ts";
import type { AdPlatformState, DigitalBand, QualityBand, TrafficBand } from "./spec.ts";

export type WebsiteIntel = {
  score: number | null;
  band: QualityBand | null;
  opportunityScore: number | null;
  seoScore: number | null;
  digitalMaturity: number | null;
  digitalBand: DigitalBand | null;
  estimatedGeneration: string | null;
  estimatedGenerationConfidence: number | null;
  copyrightYear: number | null;
  https: boolean | null;
  hasViewport: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  hasH1: boolean;
  hasCanonical: boolean;
  hasSchema: boolean;
  hasOpenGraph: boolean;
  formCount: number;
  hasChat: boolean;
  hasAnalytics: boolean;
  pixels: string[];
  cms: string[];
  frameworks: string[];
  ecommerce: boolean;
  ctaHints: boolean;
  contactVisible: boolean;
  notes: string[];
  likelyWeak: boolean;
  tech: string[];
  trafficScore: number | null;
  trafficBand: TrafficBand | null;
  adPlatforms: {
    meta: AdPlatformState;
    google_ads: AdPlatformState;
    linkedin: AdPlatformState;
    tiktok: AdPlatformState;
    microsoft_ads: AdPlatformState;
  };
  adActivityScore: number | null;
  adIntensity: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | null;
  social: Record<string, boolean>;
  socialScore: number | null;
  evidence: string[];
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function qualityBand(score: number | null): QualityBand | null {
  if (score == null) return null;
  if (score < 35) return "very_weak";
  if (score < 50) return "weak";
  if (score < 65) return "average";
  if (score < 80) return "good";
  return "excellent";
}

function digitalBand(score: number | null): DigitalBand | null {
  if (score == null) return null;
  if (score >= 80) return "digital_leader";
  if (score >= 65) return "advanced";
  if (score >= 50) return "average";
  if (score >= 35) return "underdeveloped";
  return "digital_laggard";
}

export function detectPixels(html: string): string[] {
  const out = new Set<string>();
  if (/connect\.facebook\.net|fbevents\.js|\bfbq\s*\(/i.test(html)) out.add("meta");
  if (/googletagmanager\.com\/gtag\/js|googleadservices\.com\/pagead|gtag\(\s*['"]config['"]/i.test(html)) out.add("google_ads");
  if (/www\.google-analytics\.com|gtag\/js\?id=G-|UA-\d+/i.test(html)) out.add("google_analytics");
  if (/snap\.licdn\.com|linkedin\.com\/insight/i.test(html)) out.add("linkedin");
  if (/analytics\.tiktok\.com|ttq\s*\(/i.test(html)) out.add("tiktok");
  if (/bat\.bing\.com|uetq/i.test(html)) out.add("microsoft_ads");
  if (/cdn\.matomo\.|matomo\.js|_paq/i.test(html)) out.add("matomo");
  return [...out];
}

function detectChat(html: string): boolean {
  return /tawk\.to|intercomcdn|crisp\.chat|drift\.com|hubspot-messages|zendesk|livechat|tidio|chatwidget|messenger_customer_chat/i.test(html);
}

function detectCmsAndFrameworks(html: string, headers?: Headers): { cms: string[]; frameworks: string[]; tech: string[] } {
  const cms = new Set<string>();
  const frameworks = new Set<string>();
  const tech = new Set<string>();
  if (/wp-content|wordpress/i.test(html)) { cms.add("wordpress"); tech.add("wordpress"); }
  if (/cdn\.shopify|shopify/i.test(html)) { cms.add("shopify"); tech.add("shopify"); }
  if (/woocommerce/i.test(html)) { cms.add("woocommerce"); tech.add("woocommerce"); }
  if (/wix\.com|wixpress/i.test(html)) { cms.add("wix"); tech.add("wix"); }
  if (/squarespace/i.test(html)) { cms.add("squarespace"); tech.add("squarespace"); }
  if (/webflow/i.test(html)) { cms.add("webflow"); tech.add("webflow"); }
  if (/drupal\.js|sites\/default\/files/i.test(html)) { cms.add("drupal"); tech.add("drupal"); }
  if (/joomla/i.test(html)) { cms.add("joomla"); tech.add("joomla"); }
  if (/next\/static|_next\//i.test(html)) { frameworks.add("nextjs"); tech.add("nextjs"); }
  if (/__NEXT_DATA__/i.test(html)) { frameworks.add("nextjs"); tech.add("react"); }
  if (/nuxt/i.test(html)) { frameworks.add("nuxt"); tech.add("vue"); }
  if (/jquery/i.test(html)) tech.add("jquery");
  const gen = headers?.get("x-powered-by") ?? "";
  if (/php/i.test(gen)) tech.add("php");
  if (/express/i.test(gen)) tech.add("express");
  return { cms: [...cms], frameworks: [...frameworks], tech: [...tech] };
}

function extractCopyrightYear(html: string): number | null {
  const m = html.match(/©\s*(20\d{2}|19\d{2})|&copy;\s*(20\d{2}|19\d{2})|copyright\s*(20\d{2}|19\d{2})/i);
  if (!m) return null;
  const y = Number(m[1] ?? m[2] ?? m[3]);
  return y >= 1990 && y <= 2035 ? y : null;
}

function estimateGeneration(opts: { copyrightYear: number | null; tech: string[]; html: string }): { label: string | null; confidence: number } {
  const signals: Array<{ gen: string; w: number }> = [];
  if (opts.tech.includes("nextjs") || opts.tech.includes("webflow")) signals.push({ gen: "2020–2026", w: 8 });
  if (opts.tech.includes("wordpress") && /wp-block|wp-json/i.test(opts.html)) signals.push({ gen: "2016–2022", w: 5 });
  if (/<table[^>]*width|<font\b|spacer\.gif/i.test(opts.html)) signals.push({ gen: "2005–2012", w: 8 });
  if (opts.copyrightYear) {
    if (opts.copyrightYear <= 2012) signals.push({ gen: "2005–2012", w: 10 });
    else if (opts.copyrightYear <= 2016) signals.push({ gen: "2010–2016", w: 10 });
    else if (opts.copyrightYear <= 2020) signals.push({ gen: "2016–2022", w: 8 });
    else signals.push({ gen: "2020–2026", w: 8 });
  }
  if (!signals.length) return { label: null, confidence: 0 };
  const tally = new Map<string, number>();
  for (const s of signals) tally.set(s.gen, (tally.get(s.gen) ?? 0) + s.w);
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  return { label: best[0], confidence: clamp((best[1] / Math.max(total, 1)) * 70 + Math.min(20, signals.length * 5)) };
}

export function extractFinancialMentions(text: string): { revenue: number | null; profit: number | null; evidence: string[] } {
  const evidence: string[] = [];
  let revenue: number | null = null;
  let profit: number | null = null;
  const scale = (n: number, unit: string | undefined) => (/milj|million|meur|m€|^m$/i.test(unit ?? "") ? n * 1_000_000 : n);
  const parseFig = (raw: string): number | null => {
    const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const rev = text.match(/liikevaihto[^\d]{0,24}(\d[\d\s,]*(?:[.,]\d+)?)\s*(milj(?:\.|oonaa)?|meur|m€|million|m)?/i)
    ?? text.match(/(?:turnover|revenue|omsättning)[^\d]{0,24}(?:eur|€)?\s*(\d[\d\s,]*(?:[.,]\d+)?)\s*(million|milj(?:\.|oonaa)?|meur|m€|m)?/i)
    ?? text.match(/(\d[\d\s,]*(?:[.,]\d+)?)\s*(milj(?:\.|oonaa)?|meur|m€|million)\s*(?:eur(?:o)?a?|€)?[^\n]{0,24}liikevaihto/i);
  if (rev) {
    const n = parseFig(rev[1] ?? "");
    if (n != null) {
      const scaled = scale(n, rev[2]);
      if (scaled >= 10_000 && scaled <= 50_000_000_000) {
        revenue = scaled;
        evidence.push(`Published revenue figure ≈ ${scaled}`);
      }
    }
  }
  const prof = text.match(/(?:liikevoitto|nettotulos|operating profit|net profit|liiketulos)[^\d]{0,24}(-?\d[\d\s,]*(?:[.,]\d+)?)\s*(milj(?:\.|oonaa)?|meur|m€|million|m)?/i);
  if (prof) {
    const n = Number(String(prof[1]).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n !== 0) {
      const scaled = scale(Math.abs(n), prof[2]) * (n < 0 ? -1 : 1);
      if (Math.abs(scaled) >= 1000 && Math.abs(scaled) <= 10_000_000_000) {
        profit = scaled;
        evidence.push(`Published profit figure ≈ ${scaled}`);
      }
    }
  }
  return { revenue, profit, evidence };
}

export function analyzeWebsite(opts: {
  html: string;
  url?: string;
  status?: number;
  headers?: Headers;
}): WebsiteIntel {
  const html = opts.html ?? "";
  const url = opts.url ?? "";
  const https = url.startsWith("https:");
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const text = stripTags(html);
  const title = meta.title ?? meta["og:title"] ?? "";
  const desc = meta.description ?? meta["og:description"] ?? "";
  const hasViewport = /name=["']viewport["']/i.test(html);
  const hasTitle = title.trim().length >= 3;
  const hasMetaDescription = desc.trim().length >= 20;
  const hasH1 = /<h1[\s>]/i.test(html);
  const hasCanonical = /rel=["']canonical["']/i.test(html);
  const hasSchema = jsonLd.raw.length > 0 || /application\/ld\+json/i.test(html) || /itemtype=/i.test(html);
  const hasOpenGraph = /property=["']og:/i.test(html);
  const formCount = (html.match(/<form[\s>]/gi) ?? []).length;
  const parking = isParkingPage(html, title);
  const spa = looksLikeSpa(html);
  const pixels = detectPixels(html);
  const stack = detectCmsAndFrameworks(html, opts.headers);
  const hasChat = detectChat(html);
  const hasAnalytics = pixels.includes("google_analytics") || pixels.includes("matomo") || stack.tech.includes("hubspot");
  const ecommerce = detectEcommerce(html);
  const contactVisible = /yhteystiedot|contact|mailto:|tel:/i.test(html);
  const ctaHints = /pyydä tarjous|ota yhteyttä|contact us|get a quote|request a demo|book a call|lataa esite/i.test(html);
  const copyrightYear = extractCopyrightYear(html);
  const gen = estimateGeneration({ copyrightYear, tech: stack.tech, html });
  const notes: string[] = [];
  const evidence: string[] = [];
  const tableShell = /<table[^>]*width/i.test(html) && /<font\b/i.test(html);

  if (!https) notes.push("Not served over HTTPS");
  if ((opts.status ?? 200) >= 400) notes.push(`HTTP ${opts.status}`);
  if (!hasTitle) notes.push("Missing title");
  if (!hasViewport) notes.push("No mobile viewport");
  if (parking) notes.push("Looks like a parking page");
  if (spa) notes.push("Thin SPA shell with little public text");
  if (tableShell) notes.push("Table-layout / font markup typical of older sites");
  if (copyrightYear && copyrightYear < 2016) notes.push(`Copyright year ${copyrightYear}`);

  let score = 0;
  if (https) score += 16;
  if (hasViewport) score += 12;
  if (hasTitle) score += 10;
  if (hasMetaDescription) score += 8;
  if (hasH1) score += 6;
  if (hasCanonical) score += 6;
  if (hasSchema) score += 8;
  if (hasOpenGraph) score += 5;
  if (formCount) score += 4;
  if (contactVisible) score += 4;
  if (ctaHints) score += 4;
  if (stack.frameworks.includes("nextjs") || stack.tech.includes("nextjs")) score += 6;
  if (text.length > 800) score += 6;
  if (parking) score -= 30;
  if (spa) score -= 10;
  if (tableShell) score -= 16;
  if (copyrightYear && copyrightYear < 2016) score -= 8;
  score = clamp(score);

  let seo = 0;
  if (hasTitle) seo += 18;
  if (hasMetaDescription) seo += 20;
  if (hasH1) seo += 14;
  if (hasCanonical) seo += 14;
  if (hasSchema) seo += 14;
  if (hasOpenGraph) seo += 10;
  if (https) seo += 10;
  seo = clamp(seo);

  let digital = 0;
  if (https) digital += 16;
  if (hasViewport) digital += 14;
  if (stack.frameworks.length) digital += 18;
  if (stack.cms.length) digital += 10;
  if (hasAnalytics) digital += 10;
  if (hasChat) digital += 8;
  if (ecommerce) digital += 10;
  if (tableShell) digital -= 14;
  digital = clamp(digital);

  const opportunity = clamp(Math.round((100 - score) * 0.55 + (100 - digital) * 0.25 + (100 - seo) * 0.2));

  const adPlatforms = {
    meta: (pixels.includes("meta") ? "LIKELY" : "NOT_DETECTED") as AdPlatformState,
    google_ads: (pixels.includes("google_ads") ? "LIKELY" : "NOT_DETECTED") as AdPlatformState,
    linkedin: (pixels.includes("linkedin") ? "LIKELY" : "NOT_DETECTED") as AdPlatformState,
    tiktok: (pixels.includes("tiktok") ? "LIKELY" : "NOT_DETECTED") as AdPlatformState,
    microsoft_ads: (pixels.includes("microsoft_ads") ? "LIKELY" : "NOT_DETECTED") as AdPlatformState,
  };
  const adHits = Object.values(adPlatforms).filter((s) => s === "LIKELY" || s === "DETECTED").length;
  const campaignUrls = /utm_source=|utm_campaign=|fbclid=/i.test(html);
  let adActivity = adHits * 22 + (campaignUrls ? 18 : 0) + (pixels.includes("meta") && campaignUrls ? 12 : 0);
  adActivity = adHits ? clamp(adActivity) : 0;
  const adIntensity = adActivity >= 80 ? "VERY_HIGH" : adActivity >= 55 ? "HIGH" : adActivity >= 28 ? "MEDIUM" : adActivity > 0 ? "LOW" : null;

  const social: Record<string, boolean> = {
    linkedin: /linkedin\.com\/(company|in)\//i.test(html),
    facebook: /facebook\.com\//i.test(html) && !/facebook\.net/i.test(html),
    instagram: /instagram\.com\//i.test(html),
    youtube: /youtube\.com\/|youtu\.be\//i.test(html),
    tiktok: /tiktok\.com\/@/i.test(html),
    x: /(?:twitter|x)\.com\//i.test(html),
  };
  const socialN = Object.values(social).filter(Boolean).length;
  const socialScore = socialN ? clamp(20 + socialN * 16) : 0;

  if (pixels.includes("meta")) evidence.push("Meta pixel or Facebook events script on the company site");
  if (pixels.includes("google_ads")) evidence.push("Google Ads conversion tag on the company site");
  if (hasChat) evidence.push("Public chat widget detected");
  if (copyrightYear) evidence.push(`Copyright year ${copyrightYear}`);
  if (gen.label) evidence.push(`Design generation estimate ${gen.label}`);

  return {
    score,
    band: qualityBand(score),
    opportunityScore: opportunity,
    seoScore: seo,
    digitalMaturity: digital,
    digitalBand: digitalBand(digital),
    estimatedGeneration: gen.label,
    estimatedGenerationConfidence: gen.confidence || null,
    copyrightYear,
    https,
    hasViewport,
    hasTitle,
    hasMetaDescription,
    hasH1,
    hasCanonical,
    hasSchema,
    hasOpenGraph,
    formCount,
    hasChat,
    hasAnalytics,
    pixels,
    cms: stack.cms,
    frameworks: stack.frameworks,
    ecommerce,
    ctaHints,
    contactVisible,
    notes,
    likelyWeak: notes.length >= 2 || score < 45,
    tech: stack.tech,
    trafficScore: null,
    trafficBand: null,
    adPlatforms,
    adActivityScore: adHits ? adActivity : null,
    adIntensity,
    social,
    socialScore: socialN ? socialScore : null,
    evidence,
  };
}
