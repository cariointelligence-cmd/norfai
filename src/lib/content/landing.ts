import type { Localized } from "./locale.ts";

export const LANDING = {
  kicker: {
    fi: "Yrityshaku myynnille",
    en: "Company search for people who sell",
    sv: "Bolagssökning för säljare",
  } satisfies Localized<string>,
  heroTitle: {
    fi: "Löydä yritykset, joihin kannattaa olla yhteydessä.",
    en: "Find the companies worth contacting.",
    sv: "Hitta bolagen som är värda att kontakta.",
  } satisfies Localized<string>,
  heroBody: {
    fi: "Hae yrityksiä julkaistun liikevaihdon, toimialan, sijainnin, sivuston mitattujen havaintojen ja julkisten rekrytointien perusteella, kun ne on oikeasti saatavilla. Tyhjä kenttä tarkoittaa Not found.",
    en: "Search companies by published revenue, industry, location, measured website facts and public job listings when those sources actually have data. Empty means Not found.",
    sv: "Sök bolag på publicerad omsättning, bransch, plats, mätta sajtfakta och publika jobbannonser när källorna faktiskt har data.",
  } satisfies Localized<string>,
  heroCta: { fi: "Hae yrityksiä", en: "Find companies", sv: "Sök bolag" } satisfies Localized<string>,
  heroSecondary: { fi: "Näin se toimii", en: "See how it works", sv: "Så fungerar det" } satisfies Localized<string>,
  demoKicker: { fi: "Esimerkkihaku", en: "Example search", sv: "Exempelsökning" } satisfies Localized<string>,
  demoTitle: {
    fi: "Hae sen mukaan, millä on merkitystä.",
    en: "Search by what actually matters.",
    sv: "Sök på det som faktiskt spelar roll.",
  } satisfies Localized<string>,
  demoCaption: {
    fi: "Esimerkki. Elävät määrät riippuvat rekistereistä hakuhetkellä. Norf ei täytä listaa satunnaisilla yhtiöillä.",
    en: "Example. Live counts depend on the registers at search time. Norf does not fill a list with random companies.",
    sv: "Exempel. Liveantal beror på registren vid sökögonblicket.",
  } satisfies Localized<string>,
  demoResult: { fi: "Esimerkkitulos", en: "Example result", sv: "Exempelresultat" } satisfies Localized<string>,
  demoCta: { fi: "Aja tämä haku", en: "Run this search", sv: "Kör den här sökningen" } satisfies Localized<string>,
  problemKicker: { fi: "Ongelma", en: "The problem", sv: "Problemet" } satisfies Localized<string>,
  problemTitle: {
    fi: "Useimmat liiditietokannat kertovat, kuka yritys on.",
    en: "Most lead databases tell you who a company is.",
    sv: "De flesta lead-databaser berättar vem bolaget är.",
  } satisfies Localized<string>,
  problemBody: {
    fi: "Norf auttaa ymmärtämään, kannattaako siihen olla yhteydessä. Yritys, jolla on julkaistu liikevaihto ja mitattuja sivustohavaintoja, on eri kohde kuin satunnainen nimi.",
    en: "Norf helps you understand whether they are worth contacting. A company with published revenue and measured website facts is a very different prospect from a random name in a database.",
    sv: "Norf hjälper dig förstå om de är värda ett samtal. Ett bolag med publicerad omsättning och mätta sajtfakta är ett annat case än ett slumpmässigt namn.",
  } satisfies Localized<string>,
  signalsTitle: {
    fi: "Mitä voit hakea",
    en: "What you can search",
    sv: "Vad du kan söka",
  } satisfies Localized<string>,
  oppKicker: { fi: "Opportunity", en: "Opportunity finder", sv: "Möjligheter" } satisfies Localized<string>,
  oppTitle: {
    fi: "Kerro Norfille, mitä myyt. Norf rakentaa kohteen.",
    en: "Tell Norf what you sell. Norf builds the target.",
    sv: "Berätta för Norf vad du säljer. Norf bygger målet.",
  } satisfies Localized<string>,
  howTitle: { fi: "Miten työ etenee", en: "How it works", sv: "Så arbetar du" } satisfies Localized<string>,
  trustTitle: { fi: "Mistä tiedot tulevat", en: "Where the data comes from", sv: "Var datan kommer ifrån" } satisfies Localized<string>,
  trustBody: {
    fi: "Viralliset rekisterit ja yritysten omat sivut. Jokaisella kentällä on lähde. Tyhjä tarkoittaa Not found, ei arvattua lukua. Mainoskulutusta ei keksitä.",
    en: "Official registers and company-controlled websites. Every field has a source. Empty means Not found, not a guessed figure. Ad spend is never invented.",
    sv: "Officiella register och bolagens egna sajter. Varje fält har en källa. Tomt betyder Not found.",
  } satisfies Localized<string>,
  ctaTitle: { fi: "Löydä seuraava asiakas.", en: "Find your next customer.", sv: "Hitta nästa kund." } satisfies Localized<string>,
  ctaBody: {
    fi: "Avaa työtila ja hae yrityksiä tilanteen, ei satunnaisen nimen, perusteella.",
    en: "Open a workspace and search companies by situation, not by a random name.",
    sv: "Öppna arbetsytan och sök bolag efter situation, inte efter ett slumpmässigt namn.",
  } satisfies Localized<string>,
};

export const SIGNALS: Array<{ title: Localized<string>; body: Localized<string> }> = [
  {
    title: { fi: "Talous", en: "Financials", sv: "Ekonomi" },
    body: { fi: "Liikevaihto, tulos, kate ja omavaraisuus, kun ne on julkaistu.", en: "Revenue, profit, margin and equity ratio when they are published.", sv: "Omsättning, resultat och soliditet när de är publicerade." },
  },
  {
    title: { fi: "Verkkosivu", en: "Website", sv: "Webbplats" },
    body: { fi: "Laatu, vanhuus ja se, tukeeko sivu tarjouspyyntöä.", en: "Quality, age and whether the site can take a quote request.", sv: "Kvalitet, ålder och om sajten tar emot en förfrågan." },
  },
  {
    title: { fi: "SEO", en: "SEO", sv: "SEO" },
    body: { fi: "Otsikko, kuvaus, H1 ja rakenne julkiselta sivulta.", en: "Title, description, H1 and structure from the public page.", sv: "Titel, beskrivning, H1 och struktur från den publika sidan." },
  },
  {
    title: { fi: "Mainonta", en: "Advertising", sv: "Annonsering" },
    body: { fi: "Julkisesti havaittavat tagit. Ei keksittyä budjettia.", en: "Publicly observable tags. No invented budget.", sv: "Publikt observerbara taggar. Ingen påhittad budget." },
  },
  {
    title: { fi: "Kasvu", en: "Growth", sv: "Tillväxt" },
    body: { fi: "Liikevaihdon muutos vain vertailukelpoisista tilikausista. Rekrytointi ei ole kasvua.", en: "Revenue change only from comparable filing periods. Hiring is not growth.", sv: "Omsättningsförändring endast från jämförbara perioder. Rekrytering är inte tillväxt." },
  },
  {
    title: { fi: "Rekrytointi", en: "Hiring", sv: "Rekrytering" },
    body: { fi: "Vahvistettu julkinen työpaikkailmoitus. Sivuston 'we are hiring' on vain viite.", en: "Confirmed public job listing. Website hiring language is only an indication.", sv: "Bekräftad publik jobbannons. Sajtspråk är bara en indikation." },
  },
  {
    title: { fi: "Teknologia", en: "Technology", sv: "Teknik" },
    body: { fi: "Julkinen pino: CMS, analytiikka, chat, kauppa.", en: "Public stack: CMS, analytics, chat, commerce.", sv: "Publik stack: CMS, analys, chatt, handel." },
  },
  {
    title: { fi: "Yrityksen ikä", en: "Company age", sv: "Bolagets ålder" },
    body: { fi: "Perustamisvuosi rekisteristä.", en: "Founding year from the register.", sv: "Grundår från registret." },
  },
  {
    title: { fi: "Toimiala ja sijainti", en: "Industry and location", sv: "Bransch och plats" },
    body: { fi: "Kunta ja toimiala rekisteristä, ei arvailtua osoitetta.", en: "Municipality and industry from the register, not a guessed address.", sv: "Kommun och bransch från registret." },
  },
];

export const OPP_CARDS: Array<{ sell: Localized<string>; find: Localized<string> }> = [
  {
    sell: { fi: "Myyt sivustoja.", en: "You sell websites.", sv: "Du säljer webbplatser." },
    find: {
      fi: "Norf etsii vakiintuneita, taloudellisesti terveitä yrityksiä, joiden sivu on heikko ja toiminta näkyvää.",
      en: "Norf finds established, financially healthy companies with weak websites and enough commercial activity.",
      sv: "Norf hittar etablerade, ekonomiskt sunda bolag med svaga sajter.",
    },
  },
  {
    sell: { fi: "Myyt SEO:ta.", en: "You sell SEO.", sv: "Du säljer SEO." },
    find: {
      fi: "Norf etsii yrityksiä, joilla on rahaa, heikko orgaaninen sivu ja tarpeeksi toimintaa, jotta investointi kannattaa.",
      en: "Norf finds companies with money, weak organic visibility and enough market activity to justify the work.",
      sv: "Norf hittar bolag med pengar och svag organisk synlighet.",
    },
  },
  {
    sell: { fi: "Myyt SaaSia.", en: "You sell SaaS.", sv: "Du säljer SaaS." },
    find: {
      fi: "Norf etsii yrityksiä, jotka sopivat ideaaliasiakkaaseen: koko, toimiala, teknologia ja ostokyky.",
      en: "Norf finds companies that match your ideal customer: size, industry, technology and purchase capacity.",
      sv: "Norf hittar bolag som matchar din idealkund.",
    },
  },
];

export const HOW_STEPS: Array<{ title: Localized<string>; body: Localized<string> }> = [
  {
    title: { fi: "Hae", en: "Search", sv: "Sök" },
    body: { fi: "Kuvaile kohde tai valitse valmis tilanne.", en: "Describe the target or pick a ready situation.", sv: "Beskriv målet eller välj en färdig situation." },
  },
  {
    title: { fi: "Rajaa", en: "Filter", sv: "Filtrera" },
    body: { fi: "Talous, sivu, mainonta, ikä, toimiala, sijainti.", en: "Financials, site, ads, age, industry, location.", sv: "Ekonomi, sajt, annonser, ålder, bransch, plats." },
  },
  {
    title: { fi: "Priorisoi", en: "Prioritize", sv: "Prioritera" },
    body: { fi: "Järjestä kaupallisen tilaisuuden, ei satunnaisen nimen, mukaan.", en: "Sort by commercial opportunity, not by a random name.", sv: "Sortera efter affärsmöjlighet, inte efter ett slumpmässigt namn." },
  },
  {
    title: { fi: "Ota yhteyttä", en: "Contact", sv: "Kontakta" },
    body: { fi: "Soitot teet sinä. Norf ei lähetä viestejä löydetyille ihmisille.", en: "You make the calls. Norf does not message the people it finds.", sv: "Du ringer. Norf mejlar inte personerna den hittar." },
  },
];

export const SEARCH_RECIPES: Array<{
  title: Localized<string>;
  filters: Localized<string[]>;
}> = [
  {
    title: { fi: "Sivustoprojekti, 5 to 50 k€", en: "Website project, €5k to €50k", sv: "Webbprojekt, 5 to 50 k€" },
    filters: {
      fi: ["Liikevaihto €1M–€10M jos julkaistu", "Heikkoja julkaistuja verkkosivusignaaleja jos mitattu", "Ikä 10+ vuotta", "Suomi"],
      en: ["Revenue €1M–€10M if published", "Weak published website signals if measured", "Age 10+ years", "Finland"],
      sv: ["Omsättning €1M–€10M om publicerad", "Svaga publicerade sajtsignaler om mätta", "Ålder 10+ år", "Finland"],
    },
  },
  {
    title: { fi: "Mainonta ilman konversiota", en: "Ads without conversion", sv: "Annonser utan konvertering" },
    filters: {
      fi: ["Meta-tagi sivulla", "Laskeutumissivu heikko", "Ei chattia", "Aktiivinen yhtiö"],
      en: ["Meta tag on site", "Weak landing page", "No chat", "Active company"],
      sv: ["Meta-tagg på sajten", "Svag landningssida", "Ingen chatt", "Aktivt bolag"],
    },
  },
  {
    title: { fi: "Kasvu, heikko digi", en: "Growth, weak digital", sv: "Tillväxt, svag digital" },
    filters: {
      fi: ["Kasvun merkit", "Digitaalinen kypsyys matala", "Toimiala: teollisuus", "Tampere"],
      en: ["Growth signs", "Low digital maturity", "Industry: manufacturing", "Tampere"],
      sv: ["Tillväxttecken", "Låg digital mognad", "Bransch: industri", "Tammerfors"],
    },
  },
];

export const DEMO_FILTERS: Array<{
  id: string;
  label: Localized<string>;
  weight: number;
}> = [
  { id: "fi", label: { fi: "Suomi", en: "Finland", sv: "Finland" }, weight: 40 },
  { id: "rev", label: { fi: "Liikevaihto €1M to €10M", en: "Revenue €1M to €10M", sv: "Omsättning €1M to €10M" }, weight: 18 },
  { id: "web", label: { fi: "Mitattu heikko sivusto", en: "Measured weak website", sv: "Uppmätt svag sajt" }, weight: 22 },
  { id: "profit", label: { fi: "Kannattava", en: "Profitable", sv: "Lönsamt" }, weight: 10 },
  { id: "meta", label: { fi: "Aktiivinen Meta-mainonta", en: "Active Meta advertising", sv: "Aktiv Meta-annonsering" }, weight: 12 },
  { id: "con", label: { fi: "Rakentaminen", en: "Construction", sv: "Bygg" }, weight: 16 },
  { id: "age", label: { fi: "Perustettu 10+ vuotta sitten", en: "Founded 10+ years ago", sv: "Grundat för 10+ år sedan" }, weight: 14 },
];
