import type { Localized } from "./locale.ts";

export type IndustryPage = {
  slug: string;
  title: Localized<string>;
  h1: Localized<string>;
  answer: Localized<string>;
  body: Localized<string[]>;
  codes: string[];
  related: string[];
  cities: string[];
};

export const INDUSTRIES: IndustryPage[] = [
  {
    slug: "construction",
    codes: ["41", "42", "43"],
    cities: ["helsinki", "tampere", "turku"],
    related: ["hvac", "roofing", "industrial"],
    title: { fi: "Rakennusalan yritykset", en: "Construction companies" },
    h1: {
      fi: "Rakennusalan yrityshaku Suomessa",
      en: "Search Finnish construction companies",
    },
    answer: {
      fi: "Voit hakea suomalaisia rakennusalan yrityksiä liikevaihdon, iän, sijainnin ja sivuston laadun perusteella. Norf lukee YTJ:n ja yrityksen oman sivun, eikä täytä puuttuvia lukuja.",
      en: "You can search Finnish construction companies by revenue, age, location and website quality. Norf reads the YTJ and the company's own site, and does not fill missing figures.",
    },
    body: {
      fi: [
        "Rakennusala ostaa sivustoja, SEO:ta, rekrytointia ja ohjelmistoja, kun yhtiöllä on työtä ja kassaa. Pelkkä toimialakoodi ei kerro, kuka niistä on valmis keskusteluun.",
        "Hyvä haku yhdistää vakiintuneen yhtiön (usein yli 10 vuotta), julkaistun liikevaihdon jos se on saatavilla, ja heikon tai vanhentuneen sivuston. Urakoitsija, joka mainostaa Metassa vanhalla sivulla, on eri kohde kuin vastaperustettu toiminimi.",
        "Norf ei julkaise koko rakennusalan tietokantaa avoimesti. Aja haku työtilassa. Rajaa kaupungilla, jotta lista pysyy hallittavana.",
      ],
      en: [
        "Construction buys websites, SEO, recruiting and software when the firm has work and cash. An industry code alone does not tell you who is ready for a conversation.",
        "A useful search combines an established company (often 10+ years), published revenue when available, and a weak or dated website. A contractor advertising on Meta with an old site is a different target from a brand-new sole trader.",
        "Norf does not publish the full construction database. Run the search in your workspace. Bound it by city so the list stays manageable.",
      ],
    },
  },
  {
    slug: "software",
    codes: ["62", "63"],
    cities: ["helsinki", "tampere"],
    related: ["ecommerce", "industrial"],
    title: { fi: "Ohjelmistoalan yritykset", en: "Software companies" },
    h1: { fi: "Ohjelmistoyritysten haku", en: "Find software companies" },
    answer: {
      fi: "Hae ohjelmisto- ja IT-yrityksiä sijainnin, koon, teknologian ja kasvun perusteella. Julkaistut talousluvut näytetään. Muuten kenttä on tyhjä.",
      en: "Search software and IT companies by location, size, technology and growth. Published financials are shown. Otherwise the field is empty.",
    },
    body: {
      fi: [
        "Ohjelmistoyhtiöt ostavat eri tavalla kuin teollisuus. Kasvu, rekrytointi ja tekninen pino kertovat usein enemmän kuin vanha liikevaihtorivi.",
        "Norf näkee julkiselta sivulta teknologiaa, chatin, analytiikan ja mainostagit. Se ei väitä tuntevansa ARR:ää, jota yhtiö ei ole julkaissut.",
      ],
      en: [
        "Software firms buy differently from industry. Growth, hiring and the public tech stack often say more than an old revenue line.",
        "Norf can see technology, chat, analytics and ad tags on the public site. It does not claim ARR the company has not published.",
      ],
    },
  },
  {
    slug: "manufacturing",
    codes: ["10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33"],
    cities: ["tampere", "helsinki", "turku"],
    related: ["industrial", "logistics"],
    title: { fi: "Teollisuusyritykset", en: "Manufacturing companies" },
    h1: { fi: "Suomalaiset teollisuusyritykset", en: "Finnish manufacturing companies" },
    answer: {
      fi: "Etsi valmistavan teollisuuden yhtiöitä iän, sijainnin, julkaistun talouden ja digitaalisen kypsyyden perusteella.",
      en: "Find manufacturing companies by age, location, published financials and digital maturity.",
    },
    body: {
      fi: [
        "Teollisuus ostaa digitalisaatiota, sivustoja ja myynnin työkaluja, kun tase kestää. Heikko sivusto ja vahva tulos on tyypillinen Norf-haku.",
        "Toimialakoodi yksin tuottaa liian laajan listan. Lisää kaupunki, ikä ja sivuston laatu. Jätä tuntematon liikevaihto mukaan, jos et halua menettää yhtiöitä, jotka eivät julkaise lukua.",
      ],
      en: [
        "Manufacturers buy digitalization, websites and sales tools when the balance sheet can carry it. A weak site and a strong result is a typical Norf search.",
        "Industry code alone produces too wide a list. Add city, age and website quality. Allow unknown revenue if you do not want to drop firms that never publish a figure.",
      ],
    },
  },
  {
    slug: "healthcare",
    codes: ["86", "87", "88"],
    cities: ["helsinki", "tampere"],
    related: ["software"],
    title: { fi: "Terveydenhuollon yritykset", en: "Healthcare companies" },
    h1: { fi: "Terveydenhuollon yrityshaku", en: "Healthcare company search" },
    answer: {
      fi: "Hae yksityisen terveydenhuollon ja hoiva-alan yrityksiä sijainnin, iän ja julkisen sivuston perusteella. Yhteystiedot tulevat yrityksen omilta sivuilta.",
      en: "Search private healthcare and care companies by location, age and public website. Contacts come from the company's own pages.",
    },
    body: {
      fi: [
        "Hoiva- ja terveyspalveluissa ostaja on usein vakiintunut yhtiö, jolla on useita toimipisteitä. Norf yhdistää saman Y-tunnuksen toimipaikat yhdeksi yhtiöksi.",
        "Älä odota potilastietoja. Norf käsittelee vain ammatillista B2B-dataa.",
      ],
      en: [
        "In care and health services the buyer is often an established company with several sites. Norf collapses same-business-ID branches into one company.",
        "Do not expect patient data. Norf handles professional B2B information only.",
      ],
    },
  },
  {
    slug: "logistics",
    codes: ["49", "50", "51", "52", "53"],
    cities: ["turku", "helsinki"],
    related: ["industrial", "manufacturing"],
    title: { fi: "Logistiikka-alan yritykset", en: "Logistics companies" },
    h1: { fi: "Logistiikkayritysten haku", en: "Find logistics companies" },
    answer: {
      fi: "Hae kuljetus- ja varastointiyrityksiä sijainnin, koon ja sivuston perusteella. Julkaistu tulos näytetään, jos lähde sen antaa.",
      en: "Search transport and warehousing companies by location, size and website. Published profit is shown when a source provides it.",
    },
    body: {
      fi: [
        "Logistiikka ostaa järjestelmiä, rekrytointia ja näkyvyyttä. Vanha sivu ja aktiivinen kalusto on usein parempi signaali kuin pelkkä toimialalista.",
        "Rajaa haku satama- ja kasvukaupunkeihin, jos myyt paikallisesti.",
      ],
      en: [
        "Logistics buys systems, recruiting and visibility. An old site and an active fleet is often a better signal than an industry list alone.",
        "Bound the search to port and growth cities if you sell locally.",
      ],
    },
  },
  {
    slug: "ecommerce",
    codes: ["47"],
    cities: ["helsinki", "tampere"],
    related: ["software", "marketing-agencies"],
    title: { fi: "Verkkokaupat", en: "Ecommerce companies" },
    h1: { fi: "Löydä verkkokaupat heikolla konversiokokemuksella", en: "Find ecommerce companies with a weak conversion experience" },
    answer: {
      fi: "Hae kauppaa käyviä yhtiöitä, joiden sivu paljastaa kaupan alustan, mainostagit ja heikon käyttökokemuksen. Liikennettä ei arvata.",
      en: "Search trading companies whose site reveals a commerce platform, ad tags and a weak experience. Traffic is not guessed.",
    },
    body: {
      fi: [
        "Verkkokaupan 'korkea liikenne, heikko konversio' on hyödyllinen hypoteesi vain, jos signaalit ovat julkisia. Norf näkee alustan, pikselit, lomakkeet ja sivun rakenteen. Se ei keksi kävijämäärää.",
        "Shopify, WooCommerce tai vanha räätälöity kauppa yhdessä aktiivisten mainostagien kanssa on konkreettinen myyntikeskustelu.",
      ],
      en: [
        "High traffic and poor conversion is only a useful hypothesis when the signals are public. Norf sees the platform, pixels, forms and page structure. It does not invent visitor counts.",
        "Shopify, WooCommerce or a dated custom store plus active ad tags is a concrete sales conversation.",
      ],
    },
  },
  {
    slug: "real-estate",
    codes: ["68"],
    cities: ["helsinki", "tampere", "turku"],
    related: ["construction"],
    title: { fi: "Kiinteistöalan yritykset", en: "Real estate companies" },
    h1: { fi: "Kiinteistöalan yrityshaku", en: "Real estate company search" },
    answer: {
      fi: "Hae kiinteistö- ja isännöintiyrityksiä sijainnin, iän ja julkisen sivuston perusteella.",
      en: "Search real estate and property management companies by location, age and public website.",
    },
    body: {
      fi: [
        "Isännöinti ja kiinteistöpalvelut ostavat sivustoja, asiakasportaleja ja markkinointia. Vakiintunut yhtiö vanhalla sivulla on tyypillinen kohde.",
        "Toimipaikkoja ei räjäytetä erillisiksi yhtiöiksi, jos Y-tunnus on sama.",
      ],
      en: [
        "Property management buys websites, portals and marketing. An established firm on an old site is a typical target.",
        "Branch offices are not exploded into separate companies when the business ID is the same.",
      ],
    },
  },
  {
    slug: "industrial",
    codes: ["33", "25", "28"],
    cities: ["tampere", "helsinki"],
    related: ["manufacturing", "hvac"],
    title: { fi: "Teolliset palvelut", en: "Industrial services" },
    h1: { fi: "Teollisten palveluyritysten haku", en: "Find industrial service companies" },
    answer: {
      fi: "Hae kunnossapidon, konepajan ja teollisten palveluiden yhtiöitä iän, talouden ja digitaalisen kypsyyden perusteella.",
      en: "Search maintenance, workshop and industrial service companies by age, financials and digital maturity.",
    },
    body: {
      fi: [
        "Teolliset palvelut ovat usein pitkäikäisiä, paikallisia ja huonosti verkossa. Se on tilaisuus, jos yhtiöllä on varaa ostaa.",
        "Yhdistä ikä, sijainti ja heikko sivusto. Älä väitä kannattavuutta, jos tuloslaskelmaa ei ole julkaistu.",
      ],
      en: [
        "Industrial services are often long-lived, local and weak online. That is an opportunity if the firm can afford to buy.",
        "Combine age, location and a weak site. Do not claim profitability if no result has been published.",
      ],
    },
  },
  {
    slug: "hvac",
    codes: ["4322", "43"],
    cities: ["helsinki", "tampere"],
    related: ["construction", "roofing"],
    title: { fi: "LVI-yritykset", en: "HVAC companies" },
    h1: { fi: "LVI-yritysten haku Suomessa", en: "Find HVAC companies in Finland" },
    answer: {
      fi: "Hae LVI-urakoitsijoita kaupungin, iän, sivuston laadun ja julkaistun liikevaihdon perusteella.",
      en: "Search HVAC contractors by city, age, website quality and published revenue.",
    },
    body: {
      fi: [
        "LVI-yhtiöt ostavat sivustoja, Google-näkyvyyttä ja rekrytointia. Paikallinen, yli kymmenen vuotta toiminut urakoitsija heikolla sivulla on usein oikea soitto.",
        "Pidä haku kaupungissa. Koko Suomen LVI-lista on liian laaja myyntiviikolle.",
      ],
      en: [
        "HVAC firms buy websites, Google visibility and recruiting. A local contractor older than ten years with a weak site is often the right call.",
        "Keep the search in a city. A nationwide HVAC list is too wide for a selling week.",
      ],
    },
  },
  {
    slug: "roofing",
    codes: ["4391", "43"],
    cities: ["helsinki", "tampere", "turku"],
    related: ["construction", "hvac"],
    title: { fi: "Kattoalan yritykset", en: "Roofing companies" },
    h1: { fi: "Kattoalan yrityshaku", en: "Find roofing companies" },
    answer: {
      fi: "Hae kattourakoitsijoita sijainnin, iän ja sivuston perusteella. Mainostagit kertovat, kuka panostaa näkyvyyteen juuri nyt.",
      en: "Search roofing contractors by location, age and website. Ad tags show who is investing in visibility right now.",
    },
    body: {
      fi: [
        "Kattoala on sesonkipainotteinen ja paikallinen. Hyvä kohde on vakiintunut urakoitsija, jonka sivu ei tue tarjouspyyntöä.",
        "Norf ei arvioi työn laatua. Se arvioi, miltä julkinen läsnäolo näyttää ja mitä rekisteri kertoo yhtiöstä.",
      ],
      en: [
        "Roofing is seasonal and local. A useful target is an established contractor whose site does not support a quote request.",
        "Norf does not judge workmanship. It judges what the public presence looks like and what the register says about the firm.",
      ],
    },
  },
];
