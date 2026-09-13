import type { Localized } from "./locale.ts";

export type MarketPage = {
  slug: string;
  city: string;
  industry: string;
  title: Localized<string>;
  h1: Localized<string>;
  answer: Localized<string>;
  body: Localized<string[]>;
};

export const MARKETS: MarketPage[] = [
  {
    slug: "helsinki-construction",
    city: "helsinki",
    industry: "construction",
    title: { fi: "Rakennusalan yritykset Helsingissä", en: "Construction companies in Helsinki" },
    h1: {
      fi: "Helsinkiläiset rakennusalan yritykset",
      en: "Helsinki construction companies",
    },
    answer: {
      fi: "Hae Helsingin rakennusyhtiöitä iän, sivuston laadun ja julkaistun liikevaihdon perusteella. Kunta tulee rekisteristä.",
      en: "Search Helsinki construction firms by age, website quality and published revenue. Municipality comes from the register.",
    },
    body: {
      fi: [
        "Helsingin rakennusala on kilpailtu. Erotu rajaamalla vakiintuneisiin yhtiöihin, joiden julkinen sivu ei tue tarjouspyyntöä tai rekrytointia.",
        "Älä aja koko maan rakentamista. Pidä haku Helsingissä, lisää tarvittaessa Espoo erillisenä ajona.",
      ],
      en: [
        "Helsinki construction is competitive. Stand out by bounding to established firms whose public site does not support a quote or a hire.",
        "Do not run nationwide construction. Keep the search in Helsinki and add Espoo as a separate run if needed.",
      ],
    },
  },
  {
    slug: "tampere-construction",
    city: "tampere",
    industry: "construction",
    title: { fi: "Rakennusalan yritykset Tampereella", en: "Construction companies in Tampere" },
    h1: { fi: "Tamperelaiset rakennusyritykset", en: "Tampere construction companies" },
    answer: {
      fi: "Hae Tampereen rakennusyhtiöitä iän, heikon sivuston ja julkaistun talouden perusteella.",
      en: "Search Tampere construction firms by age, weak website and published financials.",
    },
    body: {
      fi: [
        "Tampereen rakennus- ja talotekniikkakenttä on paikallinen. Hyvä lista on kymmeniä yhtiöitä, ei satoja. Rajaa iällä ja sivuston laadulla.",
      ],
      en: [
        "Tampere construction and building services are local. A useful list is dozens of firms, not hundreds. Bound it by age and website quality.",
      ],
    },
  },
  {
    slug: "helsinki-software",
    city: "helsinki",
    industry: "software",
    title: { fi: "Ohjelmistoyritykset Helsingissä", en: "Software companies in Helsinki" },
    h1: { fi: "Helsinkiläiset ohjelmistoyritykset", en: "Helsinki software companies" },
    answer: {
      fi: "Hae Helsingin ohjelmistoyhtiöitä koon, teknologian ja kasvun perusteella. ARR:ää ei arvata.",
      en: "Search Helsinki software firms by size, technology and growth. ARR is not guessed.",
    },
    body: {
      fi: [
        "Pääkaupunkiseudun ohjelmistokenttä on tiheä. Ilman rajauksia lista on myyntikelvoton. Käytä toimialaa, kuntaa ja julkisia kasvun merkkejä.",
      ],
      en: [
        "The capital-region software field is dense. Without bounds the list is unsellable. Use industry, municipality and public growth signs.",
      ],
    },
  },
  {
    slug: "tampere-manufacturing",
    city: "tampere",
    industry: "manufacturing",
    title: { fi: "Teollisuusyritykset Tampereella", en: "Manufacturing companies in Tampere" },
    h1: { fi: "Tamperelaiset teollisuusyritykset", en: "Tampere manufacturing companies" },
    answer: {
      fi: "Hae Tampereen valmistavaa teollisuutta iän, taseen ja digitaalisen kypsyyden perusteella.",
      en: "Search Tampere manufacturing by age, balance sheet and digital maturity.",
    },
    body: {
      fi: [
        "Tampereen teollisuus ostaa digitalisaatiota, kun yhtiö on vakiintunut. Heikko sivusto ei ole syy soittaa, jos yhtiö on juuri perustettu ja ilman julkaistua tulosta.",
      ],
      en: [
        "Tampere manufacturing buys digitalization when the firm is established. A weak site is not a reason to call if the company is brand new and has no published result.",
      ],
    },
  },
  {
    slug: "turku-logistics",
    city: "turku",
    industry: "logistics",
    title: { fi: "Logistiikkayritykset Turussa", en: "Logistics companies in Turku" },
    h1: { fi: "Turkulaiset logistiikkayritykset", en: "Turku logistics companies" },
    answer: {
      fi: "Hae Turun kuljetus- ja varastointiyrityksiä iän, sivuston ja julkaistun koon perusteella.",
      en: "Search Turku transport and warehousing firms by age, website and published size.",
    },
    body: {
      fi: [
        "Satama tekee Turusta logistiikkakaupungin. Pidä haku kunnassa. Lisää sivuston laatu, jos myyt näkyvyyttä tai järjestelmiä.",
      ],
      en: [
        "The port makes Turku a logistics city. Keep the search in the municipality. Add website quality if you sell visibility or systems.",
      ],
    },
  },
];
