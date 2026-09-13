import { createContext, useContext } from "react";
import { ta, type AppMsg } from "./app-copy.ts";

export type Locale = "fi" | "en" | "sv";
export const LOCALES: Locale[] = ["fi", "en", "sv"];

const dict = {
  fi: {
    brand: "Norf",
    tagline: "Löydä yritykset, joihin kannattaa olla yhteydessä.",
    navProduct: "Tuote",
    navPricing: "Hinnasto",
    navAbout: "Tietoa",
    navNews: "Ajankohtaista",
    navSupport: "Asiakaspalvelu",
    navLogin: "Kirjaudu",
    navApp: "Työtila",
    navStart: "Aloita",
    navUseCases: "Käyttö",
    navFaq: "UKK",
    navTools: "Työkalut",
    heroKicker: "Yrityshaku myynnille",
    heroTitle: "Löydä yritykset, joihin kannattaa olla yhteydessä.",
    heroBody:
      "Hae yrityksiä julkaistun liikevaihdon, toimialan, sijainnin, sivuston mitattujen havaintojen ja julkisten rekrytointien perusteella, kun ne on oikeasti saatavilla. Tyhjä kenttä tarkoittaa Not found.",
    heroCta: "Hae yrityksiä",
    heroSecondary: "Näin se toimii",
    proof1: "Julkaistu liikevaihto, kun lähde sen antaa",
    proof2: "Sivuston laatu kerätyistä signaaleista",
    proof3: "Tyhjä kenttä tarkoittaa Not found",
    howTitle: "Miten työ etenee",
    how1t: "Hae",
    how1: "Kuvaile kohde tai valitse valmis tilanne.",
    how2t: "Rajaa ja priorisoi",
    how2: "Talous, sivu, mainonta ja ikä samassa listassa.",
    how3t: "Ota yhteyttä itse",
    how3: "Norf ei lähetä viestejä löydetyille ihmisille. Haku jatkuu palvelimella.",
    plansTitle: "Neljä tasoa, selkeä käyttö.",
    planFree: "Free",
    planPro: "Pro",
    planScale: "Unlimited",
    planCta: "Valitse",
    planCurrent: "Nykyinen",
    searches: "hakua / kk",
    searchesUnlimited: "Rajaton haku",
    companiesUnlimited: "Rajaton yrityskanta",
    priceVat: "Hinnat ALV 0 % (B2B).",
    madeBy: "Sovelluksen on tehnyt Fuusiossa DAZVERIO.",
    madeBy2: "Yritykset CARIO Intelligence Oy ja TAJU.",
    footerLegal: "Tietosuoja",
    footerTerms: "Käyttöehdot",
    footerProduct: "Tuote",
    footerExplore: "Sisältö",
    aboutTitle: "Norf on työkalu parempiin kohteisiin.",
    aboutBody:
      "Et osta listaa. Ostat tavan löytää yritykset, joihin kannattaa olla yhteydessä, ennen kuin käytät tunnin soittoon.",
    supportTitle: "Asiakaspalvelu",
    supportBody: "Kirjoita meille. Vastaamme arkisin.",
    newsTitle: "Ajankohtaista",
    newsEmpty: "Ei julkaistuja kirjoituksia vielä.",
    pricingLead: "Löydä paremmat kohteet ilman tuntien taustatyötä. Free 50 hakua, Starter 1 000, Pro 5 000, Unlimited ilman kattoa.",
    stripeSoon: "Maksulliset tasot avautuvat, kun Stripe on kytketty. Free toimii heti.",
    quota: "Kuukauden haut",
    langFi: "Suomi",
    langEn: "English",
    langSv: "Svenska",
    admin: "Hallinta",
    billing: "Laskutus",
  },
  en: {
    brand: "Norf",
    tagline: "Find the companies worth contacting.",
    navProduct: "Product",
    navPricing: "Pricing",
    navAbout: "About",
    navNews: "News",
    navSupport: "Support",
    navLogin: "Sign in",
    navApp: "Workspace",
    navStart: "Find companies",
    navUseCases: "Use cases",
    navFaq: "FAQ",
    navTools: "Tools",
    heroKicker: "Company search for people who sell",
    heroTitle: "Find the companies worth contacting.",
    heroBody:
      "Search companies by published revenue, industry, location, measured website facts and public job listings when those sources actually have data. Empty means Not found.",
    heroCta: "Find companies",
    heroSecondary: "See how it works",
    proof1: "Published revenue, when a source provides it",
    proof2: "Website quality from collected signals",
    proof3: "Empty means Not found",
    howTitle: "How it works",
    how1t: "Search",
    how1: "Describe the target or pick a ready situation.",
    how2t: "Filter and prioritize",
    how2: "Financials, website, ads and age on one list.",
    how3t: "You make the call",
    how3: "Norf does not message the people it finds. The search keeps running on the server.",
    plansTitle: "Four plans. Clear usage.",
    planFree: "Free",
    planPro: "Pro",
    planScale: "Unlimited",
    planCta: "Choose",
    planCurrent: "Current",
    searches: "searches / month",
    searchesUnlimited: "Unlimited searches",
    companiesUnlimited: "Unlimited companies",
    priceVat: "Prices excl. VAT (B2B).",
    madeBy: "Built in Fuusio by DAZVERIO.",
    madeBy2: "CARIO Intelligence Oy and TAJU.",
    footerLegal: "Privacy",
    footerTerms: "Terms",
    footerProduct: "Product",
    footerExplore: "Explore",
    aboutTitle: "Norf is a tool for better targets.",
    aboutBody:
      "You are not buying a list. You are buying a way to find the companies worth contacting before you spend an hour on the call.",
    supportTitle: "Support",
    supportBody: "Write to us. We reply on business days.",
    newsTitle: "News",
    newsEmpty: "No published posts yet.",
    pricingLead: "Find better targets without spending hours researching them manually. Free is 50 searches, Starter 1,000, Pro 5,000, Unlimited has no cap.",
    stripeSoon: "Paid plans go live once Stripe is connected. Free works now.",
    quota: "Monthly searches",
    langFi: "Suomi",
    langEn: "English",
    langSv: "Svenska",
    admin: "Admin",
    billing: "Billing",
  },
  sv: {
    brand: "Norf",
    tagline: "Hitta bolagen som är värda att kontakta.",
    navProduct: "Produkt",
    navPricing: "Priser",
    navAbout: "Om oss",
    navNews: "Aktuellt",
    navSupport: "Support",
    navLogin: "Logga in",
    navApp: "Arbetsyta",
    navStart: "Sök bolag",
    navUseCases: "Användning",
    navFaq: "FAQ",
    navTools: "Verktyg",
    heroKicker: "Bolagssökning för säljare",
    heroTitle: "Hitta bolagen som är värda att kontakta.",
    heroBody:
      "Sök bolag på publicerad omsättning, bransch, plats, mätta sajtfakta och publika jobbannonser när källorna faktiskt har data. Tomt betyder Not found.",
    heroCta: "Sök bolag",
    heroSecondary: "Så fungerar det",
    proof1: "Publicerad omsättning när en källa ger den",
    proof2: "Sajtkvalitet från insamlade signaler",
    proof3: "Tomt betyder Not found",
    howTitle: "Så arbetar du",
    how1t: "Sök",
    how1: "Beskriv målet eller välj en färdig situation.",
    how2t: "Filtrera och prioritera",
    how2: "Ekonomi, sajt, annonser och ålder på samma lista.",
    how3t: "Du tar kontakten",
    how3: "Norf mejlar inte personerna den hittar. Sökningen fortsätter på servern.",
    plansTitle: "Fyra nivåer. Tydlig användning.",
    planFree: "Free",
    planPro: "Pro",
    planScale: "Unlimited",
    planCta: "Välj",
    planCurrent: "Nuvarande",
    searches: "sökningar / mån",
    searchesUnlimited: "Obegränsad sökning",
    companiesUnlimited: "Obegränsad bolagsbas",
    priceVat: "Priser exkl. moms (B2B).",
    madeBy: "Byggt i Fuusio av DAZVERIO.",
    madeBy2: "CARIO Intelligence Oy och TAJU.",
    footerLegal: "Integritet",
    footerTerms: "Villkor",
    footerProduct: "Produkt",
    footerExplore: "Utforska",
    aboutTitle: "Norf är ett verktyg för bättre målbolag.",
    aboutBody:
      "Du köper inte en lista. Du köper ett sätt att hitta bolagen som är värda ett samtal innan du lägger en timme på det.",
    supportTitle: "Support",
    supportBody: "Skriv till oss. Vi svarar vardagar.",
    newsTitle: "Aktuellt",
    newsEmpty: "Inga publicerade inlägg ännu.",
    pricingLead: "Hitta bättre mål utan timmar av manuell research. Free ger 50 sökningar, Starter 1 000, Pro 5 000, Unlimited utan tak.",
    stripeSoon: "Betalplaner aktiveras när Stripe är kopplat. Free fungerar nu.",
    quota: "Månadens sökningar",
    langFi: "Suomi",
    langEn: "English",
    langSv: "Svenska",
    admin: "Admin",
    billing: "Fakturering",
  },
} as const;

export type Msg = keyof (typeof dict)["fi"];

export function t(locale: Locale, key: Msg): string {
  return dict[locale][key] ?? dict.en[key] ?? key;
}

export const I18nContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: "fi",
  setLocale: () => undefined,
});

export function useI18n() {
  const ctx = useContext(I18nContext);
  return {
    locale: ctx.locale,
    setLocale: ctx.setLocale,
    t: (key: Msg) => t(ctx.locale, key),
    ta: (key: AppMsg) => ta(ctx.locale, key),
  };
}

export function readLocale(): Locale {
  if (typeof window === "undefined") return "fi";
  const stored = window.localStorage.getItem("norf-locale");
  if (stored === "en" || stored === "sv" || stored === "fi") return stored;
  const nav = window.navigator.language.toLowerCase();
  if (nav.startsWith("sv")) return "sv";
  if (nav.startsWith("en")) return "en";
  return "fi";
}

export function collectI18nText(): string {
  return JSON.stringify(dict);
}
