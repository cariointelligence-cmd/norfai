import type { Localized } from "./locale.ts";

export type LocationPage = {
  slug: string;
  kind: "country" | "city";
  title: Localized<string>;
  h1: Localized<string>;
  answer: Localized<string>;
  body: Localized<string[]>;
  industries: string[];
};

export const LOCATIONS: LocationPage[] = [
  {
    slug: "finland",
    kind: "country",
    industries: ["construction", "software", "manufacturing", "healthcare", "logistics"],
    title: { fi: "Suomalaiset yritykset", en: "Finnish companies" },
    h1: { fi: "Suomalainen yrityshaku", en: "Finnish company search" },
    answer: {
      fi: "Norf hakee suomalaisia osakeyhtiöitä ja muita rekisteröityjä yhtiöitä YTJ:stä ja yritysten omilta sivuilta. Rajaa aina toimialalla tai kaupungilla, jotta haku pysyy hallittavana.",
      en: "Norf searches Finnish limited companies and other registered firms from YTJ and company websites. Always bound the search by industry or city so it stays manageable.",
    },
    body: {
      fi: [
        "Suomen yrityskanta on julkinen rekistereissä, mutta se ei ole valmis myyntilista. Norf lisää sivuston, laadun, mainossignaalit ja julkaistun talouden päälle.",
        "Koko maan haku ilman rajauksia ei ole hyvä idea. Valitse kaupunki, toimiala tai molemmat. Tuntematon liikevaihto kannattaa usein sallia, koska harva pk-yritys julkaisee lukua sivullaan.",
        "Y-tunnus on avain. Saman merkin toimipisteet yhdistetään, ellei kyseessä ole eri yhtiö.",
      ],
      en: [
        "The Finnish company population is public in registers, but it is not a ready-made sales list. Norf adds website, quality, ad signals and published financials on top.",
        "A nationwide search with no bounds is a bad idea. Pick a city, an industry, or both. Unknown revenue is often worth allowing, because few SMEs publish a figure on their site.",
        "The business ID is the key. Same-brand branches merge unless they are a different company.",
      ],
    },
  },
  {
    slug: "helsinki",
    kind: "city",
    industries: ["construction", "software", "healthcare", "real-estate"],
    title: { fi: "Helsingin yritykset", en: "Companies in Helsinki" },
    h1: { fi: "Yrityshaku Helsingissä", en: "Company search in Helsinki" },
    answer: {
      fi: "Hae helsinkiläisiä yrityksiä toimialan, iän, sivuston laadun ja julkaistun talouden perusteella. Norf käyttää kuntaa rekisteristä, ei arvailtua osoitetta.",
      en: "Search Helsinki companies by industry, age, website quality and published financials. Norf uses the municipality from the register, not a guessed address.",
    },
    body: {
      fi: [
        "Helsinki on tihein B2B-markkina Suomessa. Ilman suodatinta lista on liian suuri. Toimiala plus sivuston laatu plus ikä tuottaa soitettavan joukon.",
        "Espoo ja Vantaa ovat eri kuntia. Jos haluat pääkaupunkiseudun, aja erilliset haut tai laajenna säteellä työtilassa.",
      ],
      en: [
        "Helsinki is the densest B2B market in Finland. Without a filter the list is too large. Industry plus website quality plus age produces a callable set.",
        "Espoo and Vantaa are different municipalities. If you want the capital region, run separate searches or expand by radius in the workspace.",
      ],
    },
  },
  {
    slug: "tampere",
    kind: "city",
    industries: ["construction", "manufacturing", "software", "industrial"],
    title: { fi: "Tampereen yritykset", en: "Companies in Tampere" },
    h1: { fi: "Yrityshaku Tampereella", en: "Company search in Tampere" },
    answer: {
      fi: "Hae tamperelaisia yrityksiä toimialan, teollisen taustan, sivuston ja julkaistun liikevaihdon perusteella.",
      en: "Search Tampere companies by industry, industrial background, website and published revenue.",
    },
    body: {
      fi: [
        "Tampere yhdistää teollisuuden, rakentamisen ja ohjelmistot. Paikallinen myynti toimii, kun lista on rajattu eikä koko maakunta.",
        "Tyypillinen haku: tamperelaiset rakennus- tai teollisuusyhtiöt, yli 5 vuotta vanhoja, heikko sivusto. Tuntematon tulos sallitaan.",
      ],
      en: [
        "Tampere combines manufacturing, construction and software. Local selling works when the list is bounded, not the whole region.",
        "A typical search: Tampere construction or industrial firms, older than 5 years, weak website. Unknown profit allowed.",
      ],
    },
  },
  {
    slug: "turku",
    kind: "city",
    industries: ["logistics", "manufacturing", "construction"],
    title: { fi: "Turun yritykset", en: "Companies in Turku" },
    h1: { fi: "Yrityshaku Turussa", en: "Company search in Turku" },
    answer: {
      fi: "Hae turkulaisia yrityksiä satama- ja teollisuustaustan, iän ja sivuston perusteella.",
      en: "Search Turku companies by port and industrial background, age and website.",
    },
    body: {
      fi: [
        "Turku on logistiikan ja teollisuuden kaupunki. Hyvä B2B-haku alkaa toimialasta ja kunnasta, ei koko Varsinais-Suomesta.",
        "Jos myyt paikallisesti, pidä lista Turussa. Laajenna naapurikuntiin vasta, kun ensimmäinen lista on käyty.",
      ],
      en: [
        "Turku is a logistics and industrial city. A useful B2B search starts from industry and municipality, not all of Southwest Finland.",
        "If you sell locally, keep the list in Turku. Expand to neighbouring municipalities only after the first list is worked.",
      ],
    },
  },
  {
    slug: "oulu",
    kind: "city",
    industries: ["software", "industrial", "construction"],
    title: { fi: "Oulun yritykset", en: "Companies in Oulu" },
    h1: { fi: "Yrityshaku Oulussa", en: "Company search in Oulu" },
    answer: {
      fi: "Hae oululaisia yrityksiä teknologia-, teollisuus- ja rakennustaustan perusteella. Sivuston laatu erottaa soitettavat yhtiöt nimilistasta.",
      en: "Search Oulu companies by technology, industrial and construction background. Website quality separates callable firms from a name list.",
    },
    body: {
      fi: [
        "Oulu on teknologian ja teollisuuden kaupunki. Koko Pohjois-Suomen haku on liian harva ja liian laaja samaan aikaan. Pidä kunta rajauksena.",
      ],
      en: [
        "Oulu is a technology and industrial city. A search of all of Northern Finland is both too sparse and too wide. Keep municipality as the bound.",
      ],
    },
  },
  {
    slug: "espoo",
    kind: "city",
    industries: ["software", "construction", "healthcare"],
    title: { fi: "Espoon yritykset", en: "Companies in Espoo" },
    h1: { fi: "Yrityshaku Espoossa", en: "Company search in Espoo" },
    answer: {
      fi: "Hae espoolaisia yrityksiä toimialan ja sivuston perusteella. Espoo on eri kunta kuin Helsinki.",
      en: "Search Espoo companies by industry and website. Espoo is a different municipality from Helsinki.",
    },
    body: {
      fi: [
        "Espoossa on paljon ohjelmisto- ja asiantuntijayhtiöitä. Älä sekoita sitä Helsingin hakuun, jos haluat tarkkuutta. Aja kaksi hakua ja vertaa.",
      ],
      en: [
        "Espoo has many software and professional firms. Do not mix it into a Helsinki search if you want precision. Run two searches and compare.",
      ],
    },
  },
];
