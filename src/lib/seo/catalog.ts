import { FAQ_ITEMS } from "../content/faq.ts";
import { GUIDES } from "../content/guides.ts";
import { INDUSTRIES } from "../content/industries.ts";
import { loc, wordCount } from "../content/locale.ts";
import { LOCATIONS } from "../content/locations.ts";
import { MARKETS } from "../content/markets.ts";
import { USE_CASES } from "../content/use-cases.ts";
import { lintCopy, type CopyIssue } from "./copy-lint.ts";
import { SITE_DESCRIPTION, SITE_DESCRIPTION_FI, SITE_NAME } from "./site.ts";

export type PageKind =
  | "home"
  | "product"
  | "use-case"
  | "industry"
  | "location"
  | "market"
  | "guide"
  | "tool"
  | "faq"
  | "legal"
  | "news";

export type PublicPage = {
  path: string;
  kind: PageKind;
  title: string;
  titleFi: string;
  description: string;
  descriptionFi: string;
  indexable: boolean;
  changefreq: "weekly" | "monthly" | "daily";
  priority: number;
  words: number;
  related: Array<{ path: string; label: string }>;
};

function page(p: PublicPage): PublicPage {
  return p;
}

export function staticPublicPages(): PublicPage[] {
  const pages: PublicPage[] = [
    page({
      path: "/",
      kind: "home",
      title: `${SITE_NAME} | Find B2B companies from official registers`,
      titleFi: `${SITE_NAME} | Etsi B2B-yrityksiä virallisista rekistereistä`,
      description: SITE_DESCRIPTION,
      descriptionFi: SITE_DESCRIPTION_FI,
      indexable: true,
      changefreq: "weekly",
      priority: 1,
      words: 650,
      related: [
        { path: "/use-cases/web-design", label: "Web design" },
        { path: "/pricing", label: "Pricing" },
        { path: "/faq", label: "FAQ" },
      ],
    }),
    page({
      path: "/pricing",
      kind: "product",
      title: `Company search pricing | ${SITE_NAME}`,
      titleFi: `Yrityshaun hinnasto | ${SITE_NAME}`,
      description: "Find better targets without spending hours researching them manually. Free, Starter, Pro and Unlimited plans.",
      descriptionFi: "Löydä paremmat kohteet ilman tuntien taustatyötä. Free, Starter, Pro ja Unlimited.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.8,
      words: 280,
      related: [{ path: "/faq", label: "FAQ" }, { path: "/", label: SITE_NAME }],
    }),
    page({
      path: "/about",
      kind: "product",
      title: `About Norf company search`,
      titleFi: `Tietoa Norf-yrityshausta`,
      description: "Norf is company intelligence for people who need better targets. Official registers, company websites, no invented rows.",
      descriptionFi: "Norf on yrityshaku ihmisille, jotka tarvitsevat parempia kohteita. Viralliset rekisterit, yritysten sivut, ei keksittyjä rivejä.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.6,
      words: 320,
      related: [{ path: "/faq", label: "FAQ" }, { path: "/guides/website-quality-methodology", label: "Methodology" }],
    }),
    page({
      path: "/faq",
      kind: "faq",
      title: `Company search FAQ | ${SITE_NAME}`,
      titleFi: `Yrityshaun UKK | ${SITE_NAME}`,
      description: "What Norf is, what you can search, where the data comes from, and how empty fields are handled.",
      descriptionFi: "Mikä Norf on, mitä voit hakea, mistä tiedot tulevat ja miten tyhjät kentät käsitellään.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.7,
      words: wordCount(FAQ_ITEMS.map((i) => loc(i.q, "en") + " " + loc(i.a, "en"))),
      related: [{ path: "/about", label: "About" }, { path: "/support", label: "Support" }],
    }),
    page({
      path: "/support",
      kind: "product",
      title: `Company search support | ${SITE_NAME}`,
      titleFi: `Yrityshaun asiakaspalvelu | ${SITE_NAME}`,
      description: "Write to the Norf team on business days for search, billing and data questions.",
      descriptionFi: "Kirjoita Norfin tiimille arkisin hausta, laskutuksesta ja tietosuojasta.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.4,
      words: 80,
      related: [{ path: "/faq", label: "FAQ" }],
    }),
    page({
      path: "/news",
      kind: "news",
      title: `Norf product news and research`,
      titleFi: `Norfin tuoteuutiset ja tutkimus`,
      description: "Product notes and research from Norf. No invented statistics.",
      descriptionFi: "Tuotehuomiot ja tutkimus Norfilta. Ei keksittyjä tilastoja.",
      indexable: true,
      changefreq: "weekly",
      priority: 0.5,
      words: 60,
      related: [{ path: "/guides/finnish-company-search", label: "Finnish company search" }],
    }),
    page({
      path: "/legal",
      kind: "legal",
      title: `Privacy policy | Norf B2B search`,
      titleFi: `Tietosuojaseloste | Norf B2B-haku`,
      description: "How Norf handles professional B2B data from public registers and company websites.",
      descriptionFi: "Miten Norf käsittelee ammatillista B2B-dataa julkisista rekistereistä ja yritysten sivuilta.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.3,
      words: 160,
      related: [{ path: "/terms", label: "Terms" }],
    }),
    page({
      path: "/terms",
      kind: "legal",
      title: `Terms of use | Norf B2B search`,
      titleFi: `Käyttöehdot | Norf B2B-haku`,
      description: "Terms for using Norf for lawful B2B company research and exported lists.",
      descriptionFi: "Ehdot Norfin käyttöön lainmukaiseen B2B-yritystutkimukseen ja vienteihin.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.3,
      words: 140,
      related: [{ path: "/legal", label: "Privacy" }],
    }),
    page({
      path: "/use-cases",
      kind: "use-case",
      title: `Use cases | ${SITE_NAME}`,
      titleFi: `Käyttötarkoitukset | ${SITE_NAME}`,
      description: "How website, SEO, marketing, recruiting, SaaS and consulting teams find better companies with Norf.",
      descriptionFi: "Miten sivusto-, SEO-, markkinointi-, rekry-, SaaS- ja konsulttitiimit löytävät parempia yrityksiä Norfilla.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.8,
      words: 180,
      related: USE_CASES.slice(0, 3).map((u) => ({ path: `/use-cases/${u.slug}`, label: loc(u.title, "en") })),
    }),
    page({
      path: "/industries",
      kind: "industry",
      title: `Industries | ${SITE_NAME}`,
      titleFi: `Toimialat | ${SITE_NAME}`,
      description: "Search construction, software, manufacturing and other Finnish industries by situation, not by name.",
      descriptionFi: "Hae rakentamista, ohjelmistoja, teollisuutta ja muita toimialoja tilanteen, ei nimen, perusteella.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.7,
      words: 140,
      related: INDUSTRIES.slice(0, 3).map((i) => ({ path: `/industries/${i.slug}`, label: loc(i.title, "en") })),
    }),
    page({
      path: "/locations",
      kind: "location",
      title: `Locations | ${SITE_NAME}`,
      titleFi: `Sijainnit | ${SITE_NAME}`,
      description: "Company search for Finland, Helsinki, Tampere, Turku, Oulu and Espoo.",
      descriptionFi: "Yrityshaku Suomeen, Helsinkiin, Tampereelle, Turkuun, Ouluun ja Espooseen.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.7,
      words: 120,
      related: LOCATIONS.slice(0, 4).map((l) => ({ path: `/locations/${l.slug}`, label: loc(l.title, "en") })),
    }),
    page({
      path: "/guides",
      kind: "guide",
      title: `Company search guides | ${SITE_NAME}`,
      titleFi: `Yrityshaun oppaat | ${SITE_NAME}`,
      description: "How to find companies by revenue, weak websites, advertising activity and Finnish registers.",
      descriptionFi: "Miten löydät yrityksiä liikevaihdon, heikkojen sivujen, mainonnan ja suomalaisten rekisterien perusteella.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.7,
      words: 120,
      related: GUIDES.slice(0, 3).map((g) => ({ path: `/guides/${g.slug}`, label: loc(g.title, "en") })),
    }),
    page({
      path: "/tools",
      kind: "tool",
      title: `Free tools | ${SITE_NAME}`,
      titleFi: `Ilmaiset työkalut | ${SITE_NAME}`,
      description: "Business ID lookup, website quality check and a company finder that leads into Norf.",
      descriptionFi: "Y-tunnushaku, sivuston laadun tarkistus ja yrityshaku, joka vie Norfiin.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.7,
      words: 140,
      related: [
        { path: "/tools/business-id", label: "Business ID" },
        { path: "/tools/website-quality", label: "Website quality" },
        { path: "/tools/company-finder", label: "Company finder" },
      ],
    }),
    page({
      path: "/tools/business-id",
      kind: "tool",
      title: `Finnish Business ID lookup | ${SITE_NAME}`,
      titleFi: `Y-tunnushaku | ${SITE_NAME}`,
      description: "Look up a Finnish Y-tunnus in the official YTJ register. Empty means not found.",
      descriptionFi: "Hae suomalainen Y-tunnus YTJ:stä. Tyhjä tarkoittaa, ettei yhtiötä löytynyt.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.6,
      words: 180,
      related: [{ path: "/tools/website-quality", label: "Website quality" }, { path: "/guides/finnish-company-search", label: "Finnish company search" }],
    }),
    page({
      path: "/tools/website-quality",
      kind: "tool",
      title: `Website quality checker | ${SITE_NAME}`,
      titleFi: `Sivuston laadun tarkistus | ${SITE_NAME}`,
      description: "Score a public company website from HTML signals. No guessed traffic or ad spend.",
      descriptionFi: "Pisteytä yrityksen julkinen sivu HTML-signaaleista. Ei arvattua liikennettä tai mainoskulutusta.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.6,
      words: 200,
      related: [{ path: "/guides/website-quality-methodology", label: "Methodology" }, { path: "/use-cases/web-design", label: "Web design" }],
    }),
    page({
      path: "/tools/company-finder",
      kind: "tool",
      title: `Company finder | ${SITE_NAME}`,
      titleFi: `Yrityshaku | ${SITE_NAME}`,
      description: "Describe the companies you want. Norf turns that into a bounded search in your workspace.",
      descriptionFi: "Kuvaile yritykset, joita haluat. Norf kääntää sen rajatuksi hauksi työtilassa.",
      indexable: true,
      changefreq: "monthly",
      priority: 0.6,
      words: 160,
      related: [{ path: "/use-cases/b2b-sales", label: "B2B sales" }, { path: "/pricing", label: "Pricing" }],
    }),
  ];

  for (const u of USE_CASES) {
    pages.push(
      page({
        path: `/use-cases/${u.slug}`,
        kind: "use-case",
        title: `${loc(u.h1, "en")} | ${SITE_NAME}`,
        titleFi: `${loc(u.h1, "fi")} | ${SITE_NAME}`,
        description: loc(u.answer, "en"),
        descriptionFi: loc(u.answer, "fi"),
        indexable: true,
        changefreq: "monthly",
        priority: 0.75,
        words: wordCount(loc(u.answer, "en"), loc(u.body, "en")),
        related: u.related.map((slug) => ({ path: `/use-cases/${slug}`, label: slug })),
      }),
    );
  }
  for (const i of INDUSTRIES) {
    pages.push(
      page({
        path: `/industries/${i.slug}`,
        kind: "industry",
        title: `${loc(i.h1, "en")} | ${SITE_NAME}`,
        titleFi: `${loc(i.h1, "fi")} | ${SITE_NAME}`,
        description: loc(i.answer, "en"),
        descriptionFi: loc(i.answer, "fi"),
        indexable: true,
        changefreq: "monthly",
        priority: 0.7,
        words: wordCount(loc(i.answer, "en"), loc(i.body, "en")),
        related: [
          ...i.related.map((slug) => ({ path: `/industries/${slug}`, label: slug })),
          ...i.cities.slice(0, 2).map((c) => ({ path: `/locations/${c}`, label: c })),
        ],
      }),
    );
  }
  for (const l of LOCATIONS) {
    pages.push(
      page({
        path: `/locations/${l.slug}`,
        kind: "location",
        title: `${loc(l.h1, "en")} | ${SITE_NAME}`,
        titleFi: `${loc(l.h1, "fi")} | ${SITE_NAME}`,
        description: loc(l.answer, "en"),
        descriptionFi: loc(l.answer, "fi"),
        indexable: true,
        changefreq: "monthly",
        priority: l.kind === "country" ? 0.8 : 0.65,
        words: wordCount(loc(l.answer, "en"), loc(l.body, "en")),
        related: l.industries.slice(0, 3).map((slug) => ({ path: `/industries/${slug}`, label: slug })),
      }),
    );
  }
  for (const m of MARKETS) {
    pages.push(
      page({
        path: `/markets/${m.slug}`,
        kind: "market",
        title: `${loc(m.h1, "en")} | ${SITE_NAME}`,
        titleFi: `${loc(m.h1, "fi")} | ${SITE_NAME}`,
        description: loc(m.answer, "en"),
        descriptionFi: loc(m.answer, "fi"),
        indexable: true,
        changefreq: "monthly",
        priority: 0.55,
        words: wordCount(loc(m.answer, "en"), loc(m.body, "en")),
        related: [
          { path: `/locations/${m.city}`, label: m.city },
          { path: `/industries/${m.industry}`, label: m.industry },
        ],
      }),
    );
  }
  for (const g of GUIDES) {
    pages.push(
      page({
        path: `/guides/${g.slug}`,
        kind: "guide",
        title: `${loc(g.h1, "en")} | ${SITE_NAME}`,
        titleFi: `${loc(g.h1, "fi")} | ${SITE_NAME}`,
        description: loc(g.answer, "en"),
        descriptionFi: loc(g.answer, "fi"),
        indexable: true,
        changefreq: "monthly",
        priority: 0.7,
        words: wordCount(loc(g.answer, "en"), loc(g.body, "en")),
        related: g.related.map((path) => ({ path, label: path })),
      }),
    );
  }
  return pages;
}

export function pageByPath(path: string): PublicPage | undefined {
  return staticPublicPages().find((p) => p.path === path);
}

export function lintPublicCatalog(): CopyIssue[] {
  const issues: CopyIssue[] = [];
  for (const p of staticPublicPages()) {
    issues.push(
      ...lintCopy(p.path, [p.title, p.titleFi, p.description, p.descriptionFi].join("\n")),
    );
  }
  return issues;
}
