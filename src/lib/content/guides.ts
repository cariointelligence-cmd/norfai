import type { Localized } from "./locale.ts";

export type GuidePage = {
  slug: string;
  title: Localized<string>;
  h1: Localized<string>;
  answer: Localized<string>;
  body: Localized<string[]>;
  related: string[];
};

export const GUIDES: GuidePage[] = [
  {
    slug: "find-companies-by-revenue",
    related: ["/industries/construction", "/use-cases/b2b-sales", "/tools/company-finder"],
    title: { fi: "Miten löydän yrityksiä liikevaihdon perusteella", en: "How to find companies by revenue" },
    h1: { fi: "Miten löydät yrityksiä liikevaihdon perusteella", en: "How to find companies by revenue" },
    answer: {
      fi: "Voit hakea suomalaisia yrityksiä liikevaihdon perusteella yritysrekistereistä ja Norfin kaltaisista hakutyökaluista. Aseta minimi ja maksimi, yhdistä toimiala ja sijainti, ja salli tai vaadi julkaistu luku.",
      en: "You can search Finnish companies by revenue using company registers and tools such as Norf. Set a minimum and maximum, combine industry and location, then allow or require a published figure.",
    },
    body: {
      fi: [
        "Liikevaihto on hyödyllinen suodatin vain, kun se on julkaistu. Moni pk-yritys ei näytä lukua sivullaan. Jos vaadit luvun, lista pienenee. Jos sallit tuntemattoman, saat enemmän yhtiöitä ja vähemmän varmuutta.",
        "Älä hae koko Suomen miljoonaluokkaa ilman kaupunkia tai toimialaa. Yhdistä esimerkiksi €1M to €10M, rakentaminen ja Tampere.",
        "Norf ei arvaa liikevaihtoa Wikidatan tai sivutekstin ulkopuolelta. Jos lukua ei ole, näet Not found.",
      ],
      en: [
        "Revenue is a useful filter only when it is published. Many SMEs never show a figure on their site. If you require a figure, the list shrinks. If you allow unknown, you get more firms and less certainty.",
        "Do not search the whole country for a million-euro band with no city or industry. Combine, for example, €1M to €10M, construction and Tampere.",
        "Norf does not guess revenue beyond what Wikidata or on-page text actually states. If there is no figure, you see Not found.",
      ],
    },
  },
  {
    slug: "find-companies-with-weak-websites",
    related: ["/use-cases/web-design", "/tools/website-quality", "/use-cases/seo"],
    title: { fi: "Miten löydän yrityksiä, joilla on huonot sivut", en: "How to find companies with bad websites" },
    h1: { fi: "Löydä yritykset, joilla on heikot verkkosivut", en: "Find companies with weak websites" },
    answer: {
      fi: "Arvioi julkinen sivu merkeistä: HTTPS, mobiili, otsikko, kuvaus, lomake, vanha tekniikka ja pysäköity domain. Norf tekee tämän automaattisesti ja jättää arvailun pois.",
      en: "Judge the public site from signals: HTTPS, mobile, title, description, form, dated technology and a parked domain. Norf does this automatically and skips the guesswork.",
    },
    body: {
      fi: [
        "Heikko sivu yksin ei ole ostosignaali. Heikko sivu plus vakiintunut yhtiö plus julkaistu tulos on.",
        "Voit tarkistaa yksittäisen sivun Norfin sivuston laatutyökalulla. Laajempi lista syntyy työtilan haussa.",
      ],
      en: [
        "A weak site alone is not a buying signal. A weak site plus an established firm plus a published result is.",
        "You can check a single site with the Norf website quality tool. A wider list comes from a workspace search.",
      ],
    },
  },
  {
    slug: "find-companies-advertising-on-meta",
    related: ["/use-cases/marketing-agencies", "/use-cases/web-design"],
    title: { fi: "Miten löydän yrityksiä, jotka mainostavat Metassa", en: "How to find companies advertising on Meta" },
    h1: { fi: "Löydä yritykset, jotka näyttävät mainostavan Metassa", en: "Find companies that appear to advertise on Meta" },
    answer: {
      fi: "Julkinen sivu voi sisältää Meta-pikselin tai tagin. Se on havaittava signaali, ei budjetti. Norf merkitsee tagin, kun se on sivulla, ja jättää kulutuksen tyhjäksi ellei lähde sitä julkaise.",
      en: "A public page can contain a Meta pixel or tag. That is an observable signal, not a budget. Norf marks the tag when it is on the page and leaves spend empty unless a source publishes it.",
    },
    body: {
      fi: [
        "Mainostava yritys heikolla laskeutumissivulla on usein valmis kuuntelemaan. Älä väitä euromäärää, jota et ole nähnyt.",
        "Norf ei selaa Meta Ads Librarya laittomasti. Se lukee, mitä yritys on itse laittanut sivulleen.",
      ],
      en: [
        "A company advertising onto a weak landing page is often ready to listen. Do not claim a euro amount you have not seen.",
        "Norf does not scrape the Meta Ads Library unlawfully. It reads what the company put on its own site.",
      ],
    },
  },
  {
    slug: "finnish-company-search",
    related: ["/locations/finland", "/tools/business-id", "/faq"],
    title: { fi: "Suomalainen yrityshaku", en: "Finnish company search" },
    h1: { fi: "Suomalainen yrityshaku: rekisteri, sivu ja tilanne", en: "Finnish company search: register, site and situation" },
    answer: {
      fi: "Suomalainen yrityshaku alkaa YTJ:stä. Y-tunnus yksilöi yhtiön. Norf lisää sivuston, päättäjän ja julkaistut signaalit, ja jättää puuttuvan tiedon tyhjäksi.",
      en: "Finnish company search starts with YTJ. The business ID identifies the company. Norf adds the website, decision-maker and published signals, and leaves missing data empty.",
    },
    body: {
      fi: [
        "Hakemistot sekoittavat toimipaikat ja yhtiöt. Sama brändi, eri Y-tunnus, on eri yhtiö. Sama Y-tunnus, eri toimipiste, on sama yhtiö.",
        "Hyvä haku vastaa tilanteeseen: heikko sivu, kasvu, mainonta, ikä. Pelkkä nimi ei riitä.",
      ],
      en: [
        "Directories mix branches and companies. Same brand, different business ID, is a different company. Same business ID, different site, is the same company.",
        "A useful search answers a situation: weak site, growth, advertising, age. A name is not enough.",
      ],
    },
  },
  {
    slug: "company-database-with-financial-filters",
    related: ["/guides/find-companies-by-revenue", "/pricing", "/use-cases/b2b-sales"],
    title: { fi: "Yritystietokanta taloussuodattimilla", en: "Company database with financial filters" },
    h1: { fi: "Yrityshaku talousluvuilla, ilman keksittyjä rivejä", en: "Company search with financial filters, without invented rows" },
    answer: {
      fi: "Taloussuodattimet toimivat, kun luku on julkaistu. Norf antaa minimin, maksimin ja säännön tuntemattomille. Se ei täytä tuloslaskelmaa arvaamalla.",
      en: "Financial filters work when the figure is published. Norf gives you a minimum, a maximum and a rule for unknowns. It does not fill an income statement by guessing.",
    },
    body: {
      fi: [
        "Ostokyky on eri asia kuin liikevaihto. Julkaistu voitto, omavaraisuus ja ikä kertovat, voiko yhtiö ostaa 10k to 50k euron työn.",
        "Jos lukua ei ole, näet sen. Voit silti pitää yhtiön listalla.",
      ],
      en: [
        "Purchase capacity is not the same as revenue. Published profit, equity ratio and age tell you whether a firm can buy a €10k to €50k project.",
        "If there is no figure, you see that. You can still keep the company on the list.",
      ],
    },
  },
  {
    slug: "website-quality-methodology",
    related: ["/tools/website-quality", "/use-cases/web-design", "/about"],
    title: { fi: "Miten Norf arvioi verkkosivun laadun", en: "How Norf scores website quality" },
    h1: { fi: "Sivuston laadun menetelmä", en: "Website quality methodology" },
    answer: {
      fi: "Norf pisteyttää julkisen HTML:n. HTTPS, otsikko, kuvaus, H1, kehys, lomake, vanha tekniikka ja pysäköity sivu liikuttavat pisteitä. Mainoskulutusta ei keksitä.",
      en: "Norf scores public HTML. HTTPS, title, description, H1, viewport, forms, dated technology and a parked page move the score. Ad spend is not invented.",
    },
    body: {
      fi: [
        "Pisteet ovat 0 to 100 ja deterministisiä. Sama sivu antaa saman luvun. Puuttuva HTTPS laskee. Mobiilikehys nostaa. Pysäköity domain laskee voimakkaasti.",
        "SEO-pisteet ovat erilliset: otsikko, kuvaus, H1, kanoninen, schema. Digitalisaatio katsoo analytiikkaa, chattia, lomakkeita ja pinon ikää.",
        "Tämä sivu on tarkoitettu siteerattavaksi. Luvut ovat sääntöjä, ei otantatutkimusta. Emme julkaise keksittyjä toimialakeskiarvoja.",
      ],
      en: [
        "Scores are 0 to 100 and deterministic. The same page yields the same number. Missing HTTPS lowers it. A mobile viewport raises it. A parked domain drops it hard.",
        "SEO scores are separate: title, description, H1, canonical, schema. Digital maturity looks at analytics, chat, forms and stack age.",
        "This page is meant to be citable. The numbers are rules, not a sample study. We do not publish invented industry averages.",
      ],
    },
  },
];
