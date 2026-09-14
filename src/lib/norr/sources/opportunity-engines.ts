/**
 * Per-opportunity crawlers, isolated by FI/SE/NO.
 * 12 engines × 8 opportunities = 96 named crawlers per language.
 * Only the selected opportunity's top 6 actually run.
 */
import type { OpportunityPresetId } from "../targeting/spec.ts";
import { nationOf, type Nation } from "../countries/env.ts";

export type OppEngine = {
  id: string;
  nation: Nation;
  preset: OpportunityPresetId;
  path: string;
  detect: RegExp;
};

const FI: Record<OpportunityPresetId, Array<[string, string, RegExp]>> = {
  website_sales: [
    ["cms", "/tietosuoja", /wordpress|joomla|drupal|wix|squarespace/i],
    ["old", "/info", /jquery\/1\.|ua-compatible|flash/i],
    ["contact", "/yhteystiedot", /mailto:|tel:/i],
    ["about", "/yritys", /perustettu|vuodesta/i],
    ["https", "/", /content="http:/i],
    ["mobile", "/", /viewport/i],
    ["generator", "/", /<meta[^>]+generator/i],
    ["sitemap", "/sitemap.xml", /<urlset/i],
    ["robots", "/robots.txt", /sitemap:/i],
    ["careers", "/tyopaikat", /wordpress|wix/i],
    ["news", "/ajankohtaista", /<article/i],
    ["footer", "/", /yhteystiedot|copyright/i],
  ],
  digitalization: [
    ["crm", "/", /salesforce|hubspot|pipedrive|dynamics/i],
    ["chat", "/", /intercom|zendesk|tawk|crisp/i],
    ["form", "/yhteydenotto", /<form/i],
    ["login", "/login", /kirjaudu/i],
    ["portal", "/extranet", /portal|extranet/i],
    ["erp", "/", /sap|netsuite|visma/i],
    ["cookie", "/tietosuoja", /evaste|cookie/i],
    ["api", "/api", /openapi|swagger/i],
    ["app", "/sovellus", /app.store|play.google/i],
    ["booking", "/ajanvaraus", /ajanvaraus|booking/i],
    ["invoice", "/laskutus", /verkkolasku/i],
    ["docs", "/ohjeet", /tuki|support/i],
  ],
  marketing_sales: [
    ["ads", "/", /gtag|fbq\(|lintrk|adsbygoogle/i],
    ["pixel", "/", /facebook.net\/en_US\/fbevents/i],
    ["landing", "/kampanja", /kampanja|landing/i],
    ["utm", "/", /utm_/i],
    ["meta", "/", /og:image/i],
    ["banner", "/", /cookieyes|cookiebot/i],
    ["ga", "/", /G-[A-Z0-9]|UA-\d/i],
    ["linkedin", "/", /snap.licdn.com/i],
    ["tiktok", "/", /analytics.tiktok/i],
    ["offer", "/tarjous", /tarjous/i],
    ["cta", "/yhteystiedot", /pyydä tarjous|ota yhteyttä/i],
    ["lp", "/lp", /landing/i],
  ],
  seo: [
    ["title", "/", /<title>/i],
    ["desc", "/", /name="description"/i],
    ["h1", "/", /<h1/i],
    ["canon", "/", /rel="canonical"/i],
    ["og", "/", /property="og:/i],
    ["schema", "/", /application\/ld\+json/i],
    ["alt", "/", /<img[^>]+alt=/i],
    ["robotsmeta", "/", /name="robots"/i],
    ["hreflang", "/", /hreflang/i],
    ["sitemap", "/sitemap.xml", /<urlset/i],
    ["blog", "/blogi", /<article/i],
    ["thin", "/", /lorem ipsum/i],
  ],
  ai_automation: [
    ["chatbot", "/", /chatbot|intercom|drift/i],
    ["openai", "/", /openai|chatgpt/i],
    ["hiring", "/ura", /tekoäly|ai engineer|machine learning/i],
    ["docs", "/docs", /api/i],
    ["automation", "/", /zapier|make.com|n8n/i],
    ["career", "/tyopaikat", /automaatio|rpa/i],
    ["press", "/uutiset", /tekoäly|artificial/i],
    ["about", "/yritys", /innovaatio/i],
    ["product", "/tuotteet", /platform|alusta/i],
    ["login", "/app", /dashboard/i],
    ["status", "/status", /uptime/i],
    ["security", "/tietosuoja", /gdpr/i],
  ],
  fast_growing: [
    ["jobs", "/tyopaikat", /avaa|open position/i],
    ["news", "/uutiset", /kasvu|laajentaa/i],
    ["offices", "/toimipisteet", /uusi toimipiste/i],
    ["invest", "/sijoittajat", /osavuosi|kasvu/i],
    ["career", "/ura", /haemme/i],
    ["press", "/media", /lehdistö/i],
    ["about", "/yritys", /perustettu/i],
    ["partners", "/kumppanit", /kumppani/i],
    ["product", "/tuotteet", /uutuus/i],
    ["ir", "/sijoittajat", /raportti/i],
    ["blog", "/blogi", /kasvu/i],
    ["contact", "/yhteystiedot", /mailto:/i],
  ],
  financially_strong: [
    ["ir", "/sijoittajat", /liikevaihto|osavuosikatsaus/i],
    ["reports", "/raportit", /tilinpaatos|annual/i],
    ["news", "/uutiset", /tulos|voitto/i],
    ["about", "/yritys", /liikevaihto/i],
    ["governance", "/hallinnointi", /hallitus/i],
    ["numbers", "/avainluvut", /miljoona/i],
    ["pdf", "/sijoittajat", /\.pdf/i],
    ["press", "/media", /tulos/i],
    ["contact", "/yhteystiedot", /sijoittaja/i],
    ["esg", "/vastuullisuus", /esg|vastuu/i],
    ["calendar", "/sijoittajat", /kalenteri/i],
    ["stock", "/osake", /nasdaq|porssi/i],
  ],
  distressed: [
    ["news", "/uutiset", /yt-neuvottelu|irtisanom|tappio/i],
    ["ir", "/sijoittajat", /tappio|negatiiv/i],
    ["restruct", "/yritys", /järjestely|sanitation/i],
    ["jobs", "/tyopaikat", /yt /i],
    ["press", "/media", /konkurssi|vaikeuks/i],
    ["about", "/tietoa", /muutos/i],
    ["reports", "/raportit", /tappiollinen/i],
    ["contact", "/yhteystiedot", /mailto:/i],
    ["legal", "/juridiikka", /saatava/i],
    ["notice", "/tiedotteet", /varoit/i],
    ["owner", "/omistajat", /vaihdos/i],
    ["history", "/historia", /perustettu/i],
  ],
};

function localize(preset: OpportunityPresetId, rows: Array<[string, string, RegExp]>, nation: Nation): OppEngine[] {
  const swap: Record<Nation, (path: string) => string> = {
    FI: (p) => p,
    SE: (p) => p
      .replace("/yhteystiedot", "/kontakt")
      .replace("/yritys", "/om-oss")
      .replace("/tyopaikat", "/lediga-jobb")
      .replace("/tietosuoja", "/integritet")
      .replace("/uutiset", "/nyheter")
      .replace("/sijoittajat", "/investerare")
      .replace("/ura", "/karriar")
      .replace("/tuotteet", "/produkter")
      .replace("/blogi", "/blogg")
      .replace("/ajankohtaista", "/nyheter")
      .replace("/toimipisteet", "/kontor")
      .replace("/raportit", "/rapporter")
      .replace("/hallinnointi", "/bolagsstyrning")
      .replace("/avainluvut", "/nyckeltal")
      .replace("/vastuullisuus", "/hallbarhet")
      .replace("/tiedotteet", "/press")
      .replace("/tietoa", "/om-oss"),
    NO: (p) => p
      .replace("/yhteystiedot", "/kontakt")
      .replace("/yritys", "/om-oss")
      .replace("/tyopaikat", "/ledige-stillinger")
      .replace("/tietosuoja", "/personvern")
      .replace("/uutiset", "/nyheter")
      .replace("/sijoittajat", "/investor")
      .replace("/ura", "/karriere")
      .replace("/tuotteet", "/produkter")
      .replace("/blogi", "/blogg")
      .replace("/ajankohtaista", "/nyheter")
      .replace("/toimipisteet", "/kontorer")
      .replace("/raportit", "/rapporter")
      .replace("/hallinnointi", "/eierstyring")
      .replace("/avainluvut", "/nokkeltall")
      .replace("/vastuullisuus", "/barekraft")
      .replace("/tiedotteet", "/pressemeldinger")
      .replace("/tietoa", "/om-oss"),
  };
  return rows.map(([key, path, detect]) => ({
    id: `${nation.toLowerCase()}-${preset}-${key}`,
    nation,
    preset,
    path: swap[nation](path),
    detect,
  }));
}

const PRESETS = Object.keys(FI) as OpportunityPresetId[];

export const OPPORTUNITY_ENGINES: OppEngine[] = PRESETS.flatMap((preset) => {
  const rows = FI[preset];
  return [
    ...localize(preset, rows, "FI"),
    ...localize(preset, rows, "SE"),
    ...localize(preset, rows, "NO"),
  ];
});

export function opportunityEnginesFor(preset: OpportunityPresetId, country?: string | null): OppEngine[] {
  const nation = nationOf(country);
  return OPPORTUNITY_ENGINES.filter((e) => e.preset === preset && e.nation === nation);
}

export function opportunityEngineCount(nation?: Nation): { total: number; perLanguage: number; perOpportunity: number } {
  const perLanguage = OPPORTUNITY_ENGINES.filter((e) => !nation || e.nation === nation).length / (nation ? 1 : 3);
  return {
    total: OPPORTUNITY_ENGINES.length,
    perLanguage: nation ? OPPORTUNITY_ENGINES.filter((e) => e.nation === nation).length : OPPORTUNITY_ENGINES.filter((e) => e.nation === "FI").length,
    perOpportunity: FI.website_sales.length,
  };
}

export function extraPathsForPreset(preset: string | undefined, country?: string | null): string[] {
  if (!preset || !(preset in FI)) return [];
  return opportunityEnginesFor(preset as OpportunityPresetId, country).map((e) => e.path).slice(0, 8);
}
