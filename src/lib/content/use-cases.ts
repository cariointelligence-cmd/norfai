import type { Localized } from "./locale.ts";

export type UseCase = {
  slug: string;
  title: Localized<string>;
  h1: Localized<string>;
  answer: Localized<string>;
  body: Localized<string[]>;
  audience: Localized<string>;
  related: string[];
};

export const USE_CASES: UseCase[] = [
  {
    slug: "web-design",
    title: { fi: "Verkkosivutoimistot", en: "Web design agencies", sv: "Webbyråer" },
    h1: {
      fi: "Löydä yritykset, joiden sivut ovat vanhat ja rahaa korjaukseen on.",
      en: "Find companies with outdated websites and money to fix them.",
    },
    answer: {
      fi: "Rajaa haku kannattaviin, vakiintuneisiin yrityksiin, joiden julkinen sivusto on heikko. Norf näyttää sivuston laadun, iän ja julkaistun talouden samassa listassa.",
      en: "Filter for established, financially viable companies whose public website is weak. Norf puts website quality, company age and published financials on the same list.",
    },
    body: {
      fi: [
        "Satunnainen yrityslista ei kerro, kuka oikeasti ostaa uuden sivuston. Yritys, jolla on usean miljoonan liikevaihto, kymmenen vuotta vanha sivusto ja aktiivista mainontaa, on eri kohde kuin nimi hakemistossa.",
        "Kerro Norfille, että myyt sivustoja. Se hakee toimivia yhtiöitä, arvioi julkisen sivun ja jättää julkaisemattomat luvut tyhjiksi. Saat listan, jota kannattaa soittaa, ei sataa sattumanvaraista riviä.",
        "Voit rajata hakua toimialalla, kaupungilla, yrityksen iällä ja sillä, saako tuntematon liikevaihto jäädä mukaan.",
      ],
      en: [
        "A random company list does not tell you who will buy a new website. A firm with several million in revenue, a ten-year-old site and active ads is a different prospect from a name in a directory.",
        "Tell Norf you sell websites. It finds active companies, scores the public site, and leaves unpublished figures empty. You get a list worth calling, not a hundred random rows.",
        "Bound the search by industry, city, company age and whether unknown revenue is allowed.",
      ],
    },
    audience: { fi: "Sivustotoimistot ja digitoimistot", en: "Website and digital agencies" },
    related: ["seo", "marketing-agencies", "b2b-sales"],
  },
  {
    slug: "seo",
    title: { fi: "SEO-toimistot", en: "SEO agencies" },
    h1: {
      fi: "Löydä kannattavat yritykset, joiden orgaaninen näkyvyys on heikko.",
      en: "Find profitable companies with weak organic visibility.",
    },
    answer: {
      fi: "Hae yrityksiä, joilla on rahaa investoida ja julkinen sivu ilman kunnollista otsikkoa, kuvausta, H1:tä tai rakennetta. Norf pisteyttää SEO-signaalit sivulta, ei arvaa sijoituksia.",
      en: "Search for companies that can invest and whose public page is missing a proper title, description, H1 or structure. Norf scores SEO signals from the page. It does not guess rankings.",
    },
    body: {
      fi: [
        "SEO-myynti kaatuu usein siihen, että lista on väärä. Heikko sivu ilman kassavirtaa ei osta. Vahva tulos ja ohut sivu ostaa todennäköisemmin.",
        "Norf ei lupaa Googlen ykkössijaa kenellekään. Se näyttää, miltä julkinen sivu näyttää tänään: puuttuuko otsikko, onko kuvaus olemassa, onko sivu mobiilissa luettava.",
        "Yhdistä heikko SEO julkaistuun tulokseen, toimialaan ja sijaintiin. Saat kohteet, joille työ oikeasti kannattaa tarjota.",
      ],
      en: [
        "SEO sales often fail because the list is wrong. A weak site with no cash flow will not buy. A strong result and a thin site is more likely to buy.",
        "Norf does not promise anyone a number one Google ranking. It shows what the public page looks like today: missing title, missing description, unreadable on mobile.",
        "Combine weak SEO with published profit, industry and location. You get accounts worth pitching.",
      ],
    },
    audience: { fi: "SEO- ja sisältötoimistot", en: "SEO and content agencies" },
    related: ["web-design", "marketing-agencies"],
  },
  {
    slug: "marketing-agencies",
    title: { fi: "Markkinointitoimistot", en: "Marketing agencies" },
    h1: {
      fi: "Löydä yritykset, jotka mainostavat, mutta sivu ei konvertoi.",
      en: "Find businesses already spending on ads but losing conversions.",
    },
    answer: {
      fi: "Norf näyttää julkisesti havaittavat mainostagit ja sivuston laadun yhdessä. Näet, kuka näyttää mainostavan nyt, ja kenen laskeutumissivu on heikko.",
      en: "Norf shows publicly observable ad tags and website quality together. You see who appears to be advertising now, and whose landing page is weak.",
    },
    body: {
      fi: [
        "Mainostava yritys, jonka sivu on vanha, on usein valmis kuuntelemaan. Norf ei näytä keksittyä mainosbudjettia. Se näyttää, mitä sivulla on: Meta-tagi, Google-tagi, lomake, chat.",
        "Voit etsiä myös yrityksiä, joiden mainossignaalit ovat hiljenneet. Se on eri keskustelu kuin aggressiivinen kampanja juuri nyt.",
        "Rajaa toimialalla ja kaupungilla, jotta lista pysyy soitettavana.",
      ],
      en: [
        "A company that is advertising on a dated site is often ready to listen. Norf does not invent ad spend. It shows what is on the page: a Meta tag, a Google tag, a form, a chat widget.",
        "You can also look for companies whose ad signals have gone quiet. That is a different conversation from an aggressive campaign running now.",
        "Bound the list by industry and city so it stays callable.",
      ],
    },
    audience: { fi: "Mediatoimistot ja performance-tiimit", en: "Media and performance teams" },
    related: ["web-design", "seo", "saas-sales"],
  },
  {
    slug: "recruitment",
    title: { fi: "Rekrytointi", en: "Recruitment" },
    h1: {
      fi: "Löydä yritykset, jotka kasvavat ja palkkaavat.",
      en: "Find companies that are actively hiring and growing.",
    },
    answer: {
      fi: "Hae yrityksiä, joilla on julkisia rekrytointisignaaleja ja kasvun merkkejä. Norf ei soita löydetyille ihmisille. Se antaa sinulle yritykset, joihin rekrytointikeskustelu kannattaa avata.",
      en: "Search companies with public hiring signals and growth signs. Norf does not call the people it finds. It gives you the firms worth opening a recruiting conversation with.",
    },
    body: {
      fi: [
        "Rekrytointi ilman tilannekuvaa on arvailua. Kasvava yhtiö, jolla on avoimia rooleja, ostaa todennäköisemmin kuin staattinen lista toimialalta.",
        "Norf kerää vain julkaistua tietoa. Jos rekrytointisivua ei ole, kenttä on tyhjä. Et saa keksittyä 'hiring now' -leimaa.",
      ],
      en: [
        "Recruiting without a situation picture is guesswork. A growing company with open roles is more likely to buy than a static industry list.",
        "Norf collects published information only. If there is no careers page, the field is empty. You do not get an invented hiring badge.",
      ],
    },
    audience: { fi: "Henkilöstöpalvelut ja executive search", en: "Staffing and executive search" },
    related: ["b2b-sales", "consulting"],
  },
  {
    slug: "saas-sales",
    title: { fi: "SaaS-myynti", en: "SaaS sales" },
    h1: {
      fi: "Löydä yritykset, jotka sopivat ideaaliasiakkaaseen.",
      en: "Find companies that match your ideal customer profile.",
    },
    answer: {
      fi: "Kuvaile kenelle myyt. Norf rajaa koon, toimialan, iän, teknologian ja ostokyvyn julkaistuista signaaleista. Saat yritykset, joilla on syy ja kyky ostaa, ei satunnaista CRM-täytettä.",
      en: "Describe who you sell to. Norf bounds size, industry, age, technology and purchase capacity from published signals. You get companies with a reason and the means to buy, not random CRM filler.",
    },
    body: {
      fi: [
        "SaaS-pipeline täyttyy liian usein nimistä, joilla ei ole budjettia tai tarvetta. Norf kääntää ideaaliasiakkaan suodattimiksi.",
        "Voit vaatia julkaistun liikevaihdon tai sallia tuntemattomat. Voit etsiä vanhaa teknologiaa, puuttuvaa chattia tai heikkoa digitalisaatiota. Jokainen suodatin perustuu kerättyyn signaaliin.",
      ],
      en: [
        "SaaS pipelines fill up with names that have no budget and no need. Norf turns an ideal customer into filters.",
        "You can require published revenue or allow unknowns. You can look for dated technology, a missing chat, or low digital maturity. Every filter sits on a collected signal.",
      ],
    },
    audience: { fi: "B2B SaaS -myynti", en: "B2B SaaS sales" },
    related: ["b2b-sales", "consulting", "web-design"],
  },
  {
    slug: "b2b-sales",
    title: { fi: "B2B-myynti", en: "B2B sales" },
    h1: {
      fi: "Tiedä keneen kannattaa olla yhteydessä ennen soittoa.",
      en: "Know who is worth contacting before you make the call.",
    },
    answer: {
      fi: "Norf auttaa valitsemaan yritykset tilanteen perusteella, ei pelkän nimen. Yhdistä talous, sijainti, sivusto ja kasvu, ja saat listan, jota voi priorisoida.",
      en: "Norf helps you choose companies by situation, not by name alone. Combine financials, location, website and growth, and you get a list you can actually prioritize.",
    },
    body: {
      fi: [
        "Useimmat liiditietokannat kertovat, kuka yritys on. Ne harvoin kertovat, kannattaako siihen käyttää tunti.",
        "Norf ei korvaa myyjää. Se vähentää manuaalista taustatyötä. Saat selityksen, miksi yritys osui hakuun, ja näet mitkä kentät ovat tyhjiä.",
      ],
      en: [
        "Most lead databases tell you who a company is. They rarely tell you whether an hour on that account is worth it.",
        "Norf does not replace the salesperson. It cuts manual research. You get an explanation of why the company matched, and you see which fields are empty.",
      ],
    },
    audience: { fi: "B2B-myyntitiimit", en: "B2B sales teams" },
    related: ["saas-sales", "consulting", "web-design"],
  },
  {
    slug: "consulting",
    title: { fi: "Konsultointi", en: "Consulting" },
    h1: {
      fi: "Löydä yritykset, joilla on tilanne ja kyky ostaa työtä.",
      en: "Find companies with a situation and the capacity to buy work.",
    },
    answer: {
      fi: "Konsultointi myydään tilanteeseen. Norf etsii kasvavia, vakiintuneita tai taloudeltaan vahvoja yhtiöitä ja näyttää, missä julkinen digitaalinen läsnäolo ontuu.",
      en: "Consulting is sold into a situation. Norf finds growing, established or financially strong firms and shows where the public digital presence is weak.",
    },
    body: {
      fi: [
        "Hyvä konsulttihaku ei ole 'kaikki metallialan osakeyhtiöt'. Se on yhtiö, jolla on ikää, julkaistu tulos ja selvä kohta, jossa ulkopuolinen työ auttaa.",
        "Käytä opportunity-hakuja: digitalisaatio, vahva tase, nopea kasvu. Jokainen osuma perustelee itsensä signaaleilla.",
      ],
      en: [
        "A good consulting search is not 'every limited company in metals'. It is a firm with age, a published result and a clear place where outside work helps.",
        "Use opportunity searches: digitalization, strong balance sheet, fast growth. Every match explains itself with signals.",
      ],
    },
    audience: { fi: "Liikkeenjohdon ja IT-konsultointi", en: "Management and IT consulting" },
    related: ["saas-sales", "b2b-sales", "recruitment"],
  },
];
