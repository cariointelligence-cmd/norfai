/**
 * Single reject-list for hive sources, supercrawlers and export.
 * A news/directory/CDN/tracker host is never a company website or mailbox.
 */
const MEDIA = [
  "iltalehti.fi", "iltasanomat.fi", "is.fi", "hs.fi", "yle.fi", "mtv.fi", "mtvuutiset.fi",
  "aamulehti.fi", "kauppalehti.fi", "talouselama.fi", "taloussanomat.fi", "uusisuomi.fi",
  "tekniikkatalous.fi", "tivi.fi", "mikrobitti.fi", "satakunnankansa.fi", "lapinkansa.fi",
  "kaleva.fi", "karjalainen.fi", "savonsanomat.fi", "ksml.fi", "ess.fi", "ts.fi",
  "hbl.fi", "vasabladet.fi", "ilkkapohjalainen.fi", "pohjalainen.fi", "demokraatti.fi",
  "suomenmaa.fi", "verkkouutiset.fi", "suomenuutiset.fi", "seiska.fi", "apu.fi",
  "kotiliesi.fi", "meillakotona.fi", "nyt.fi", "nelonen.fi", "ruutu.fi", "sanoma.fi",
  "almamedia.fi", "almatalent.fi", "almainights.fi", "almainsights.fi", "alma.fi",
  "etuovi.com", "vuokraovi.com", "autotalli.com", "nettiauto.com", "nettiauto.fi",
  "tori.fi", "huuto.net", "oikotie.fi", "jokakoti.fi", "sttinfo.fi",
  "bbc.com", "bbc.co.uk", "cnn.com", "reuters.com", "bloomberg.com", "forbes.com",
  "ft.com", "wsj.com", "nytimes.com", "theguardian.com", "yahoo.com",
];

const DIRECTORIES = [
  "finder.fi", "fonecta.fi", "020202.fi", "ytj.fi", "prh.fi", "asiakastieto.fi",
  "profinder.fi", "allbiz.fi", "ytunnus.fi", "yritystieto.fi", "bisnode.fi", "bisnode.com",
  "creditsafe.com", "creditsafe.fi", "northdata.de", "northdata.com", "proff.fi", "proff.no",
  "merinfo.se", "allabolag.se", "hitta.se", "eniro.se", "gulesider.no", "krak.dk", "cvr.dk",
  "opencorporates.com", "dnb.com", "endole.co.uk", "companycheck.co.uk",
  "vainu.com", "vainu.io", "leadfeeder.com", "dealfront.com", "zoominfo.com",
  "apollo.io", "lusha.com", "kompass.com", "europages.com", "crunchbase.com",
  "yelp.fi", "yelp.com", "duunitori.fi", "monster.fi", "indeed.com", "glassdoor.com",
  "tyomarkkinatori.fi", "mol.fi", "te-palvelut.fi",
];

const SOCIAL_SEARCH = [
  "facebook.com", "fb.com", "instagram.com", "linkedin.com", "youtube.com", "youtu.be",
  "tiktok.com", "twitter.com", "x.com", "threads.net", "pinterest.com", "reddit.com",
  "wikipedia.org", "wikimedia.org", "wikidata.org", "web.archive.org",
  "google.com", "google.fi", "googleapis.com", "gstatic.com", "googleusercontent.com",
  "bing.com", "duckduckgo.com", "yahoo.com", "yandex.com", "baidu.com",
];

const CDN_TRACKER = [
  "cloudfront.net", "akamaized.net", "akamaihd.net", "fbcdn.net", "twimg.com",
  "imgix.net", "cloudinary.com", "wixstatic.com", "shopifycdn.com", "fastly.net",
  "jsdelivr.net", "unpkg.com", "typekit.net", "fonts.googleapis.com", "fonts.gstatic.com",
  "googletagmanager.com", "google-analytics.com", "doubleclick.net", "schema.org", "w3.org",
  "jquery.com", "cloudflare.com", "cloudflareinsights.com", "k5a.io", "zaraz.com",
  "abtasty.com", "sentry.io", "mixpanel.com", "intercom.io", "intercom.com",
  "hubspot.com", "hs-scripts.com", "hsforms.com", "optimizely.com", "fullstory.com",
  "cookieyes.com", "clarity.ms", "vwo.com", "nr-data.net", "datadoghq.com",
  "amplitude.com", "segment.com", "hotjar.com", "cookiebot.com", "onetrust.com",
  "cookielaw.org",
];

const PLACEHOLDER = [
  "example.com", "example.net", "example.org", "example.fi",
  "esimerkki.com", "esimerkki.fi", "esimerkki.net",
  "domain.com", "email.com", "yourdomain.com", "company.com", "placeholder.local",
  "wixpress.com", "sentry-next.wixpress.com", "gravatar.com",
];

export const JUNK_HOSTS: ReadonlySet<string> = new Set([
  ...MEDIA, ...DIRECTORIES, ...SOCIAL_SEARCH, ...CDN_TRACKER, ...PLACEHOLDER,
]);

const ASSET_HOST = /^(assets|cdn|static|img|images|media|static-assets|fonts|static-cdn|amp)\./i;

export function hostOf(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  try {
    if (s.includes("://") || s.startsWith("//")) {
      s = new URL(s.startsWith("//") ? `https:${s}` : s).hostname;
    }
  } catch {
    s = s.split("/")[0] ?? s;
  }
  return s.replace(/^www\./, "").split("/")[0] ?? "";
}

export function isJunkHost(raw: string | null | undefined): boolean {
  const host = hostOf(raw);
  if (!host) return false;
  if (ASSET_HOST.test(host)) return true;
  if (JUNK_HOSTS.has(host)) return true;
  for (const j of JUNK_HOSTS) {
    if (host === j || host.endsWith(`.${j}`)) return true;
  }
  if (/(^|\.)k5a\.io$/i.test(host)) return true;
  if (/^cl-eu\d+\./i.test(host)) return true;
  if (/\.googleapis\.com$|\.gstatic\.com$/i.test(host)) return true;
  return false;
}

export function isJunkEmailDomain(domain: string | null | undefined): boolean {
  const d = hostOf(domain);
  if (!d) return true;
  return isJunkHost(d);
}
