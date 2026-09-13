import type { Localized } from "./locale.ts";

export type FaqItem = {
  q: Localized<string>;
  a: Localized<string>;
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: { fi: "Mikä Norf on?", en: "What is Norf?", sv: "Vad är Norf?" },
    a: {
      fi: "Norf on yrityshaku ihmisille, jotka tarvitsevat parempia kohdeyrityksiä. Etsit yrityksiä sen mukaan, mitä niissä oikeasti tapahtuu: julkaistu liikevaihto, toimiala, sijainti, mitatut sivustohavainnot ja julkiset rekrytoinnit, kun lähde ne antaa.",
      en: "Norf is company search for people who need better targets. You find businesses by what is actually happening in them: published revenue, industry, location, measured website facts and public job listings when a source has them.",
      sv: "Norf är bolagssökning för dig som behöver bättre målbolag. Du hittar företag utifrån vad som faktiskt händer i dem.",
    },
  },
  {
    q: { fi: "Mitä yritystietoja voin hakea?", en: "What company data can I search?" },
    a: {
      fi: "Voit rajata hakua sijainnilla, toimialalla, yrityksen iällä ja julkaistulla liikevaihdolla sekä tuloksella. Sivustolta näytetään mitatut tekniset havainnot, ei esteettistä pistemäärää. Rekrytointi vaatii julkisen ilmoituksen. Tyhjä kenttä tarkoittaa Not found.",
      en: "You can filter by location, industry, company age and published revenue and profit. Website facts are measured from the public page, not an aesthetic score. Hiring requires a public listing. An empty field means Not found.",
    },
  },
  {
    q: { fi: "Voinko hakea yrityksiä liikevaihdon perusteella?", en: "Can I search companies by revenue?" },
    a: {
      fi: "Kyllä, kun luotettava lähde on julkaissut luvun. PRH:n avoin iXBRL kattaa vain osan yhtiöistä. Pörssiyhtiöiltä voidaan lukea ESEF-raportti LEI-tunnuksella. Norf ei arvaa liikevaihtoa. Jos lukua ei ole, kenttä jää tyhjäksi ja tiukka haarukka sulkee tuntemattomat pois.",
      en: "Yes, when a reliable source has published a figure. PRH open iXBRL covers only some companies. Listed companies may have ESEF filings keyed by LEI. Norf does not guess revenue. If no figure exists, the field stays empty and a strict range excludes unknowns.",
    },
  },
  {
    q: { fi: "Tunnistaako Norf heikot verkkosivut?", en: "Can Norf identify companies with poor websites?" },
    a: {
      fi: "Kyllä. Norf listaa julkiselta sivulta mitattuja asioita kuten HTTPS, otsikko, viewport, lomakkeet ja havaittu tekniikka. Tämä ei ole esteettinen pistemäärä eikä liikenteen arvio.",
      en: "Yes. Norf lists measured facts from the public page such as HTTPS, title, viewport, forms and detected technology. This is not an aesthetic score and not a traffic estimate.",
    },
  },
  {
    q: { fi: "Löydänkö yrityksiä, jotka mainostavat?", en: "Can I find companies that advertise?" },
    a: {
      fi: "Norf käyttää julkisesti havaittavia mainossignaaleja, esimerkiksi Meta- ja Google-tageja sivustolla. Tarkka mainosbudjetti näytetään vain, jos luotettava lähde sen julkaisee.",
      en: "Norf uses publicly observable advertising signals, such as Meta and Google tags on the site. Exact spend is shown only when a reliable source publishes it.",
    },
  },
  {
    q: { fi: "Mistä Norf saa tietonsa?", en: "Where does Norf get its information?" },
    a: {
      fi: "Virallisista yritysrekistereistä, kuten Suomen YTJ, sekä yritysten omilta sivuilta ja muista avoimista julkisista lähteistä. Norf ei keksi rivejä eikä osta vanhentuneita listoja.",
      en: "From official company registers such as the Finnish YTJ, from company-controlled websites, and from other open public sources. Norf does not invent rows or sell stale lists.",
    },
  },
  {
    q: { fi: "Löytääkö Norf rekrytoivat yritykset?", en: "Can Norf find companies that are hiring?" },
    a: {
      fi: "Kyllä, kun julkinen työpaikkailmoitus voidaan yhdistää yritykseen. Sivuston rekrytointikieli merkitään vain viitteeksi. Vanha ilmoitus ei ole miksi juuri nyt. Rekrytointi ei ole sama kuin taloudellinen kasvu.",
      en: "Yes, when a public job listing can be attached to the company. Website hiring language is only an indication. An old listing is not treated as why now. Hiring is not financial growth.",
    },
  },
  {
    q: { fi: "Voinko viedä tulokset?", en: "Can I export results?" },
    a: {
      fi: "Kyllä, työtilasta. Vienti kuuluu maksullisiin tasoihin suunnitelman mukaan. Vie vain aineisto, johon sinulla on lainmukainen peruste. Vienti ei kuluta hakuyksiköitä.",
      en: "Yes, from the workspace. Exports follow your plan. Export only data you have a lawful basis to process. CSV export does not consume search units.",
    },
  },
  {
    q: { fi: "Kuinka tarkkaa data on?", en: "How accurate is the data?" },
    a: {
      fi: "Jokaisella kentällä on lähde. Julkaistu arvo näytetään sellaisenaan. Jos tietoa ei löydy, näet Not found. Norf ei täytä aukkoja keksityillä numeroilla.",
      en: "Every field carries a source. Published values are shown as published. If nothing is found, you see Not found. Norf does not fill gaps with invented numbers.",
    },
  },
  {
    q: { fi: "Mitä maita tuetaan?", en: "What countries are supported?" },
    a: {
      fi: "Suomi on ydin. Haku kattaa myös Ruotsin, Norjan, Tanskan sekä avoimia lähteitä Isossa-Britanniassa, Saksassa ja Yhdysvalloissa. Kattavuus vaihtelee rekisterin mukaan.",
      en: "Finland is the core market. Search also covers Sweden, Norway, Denmark and open sources in the United Kingdom, Germany and the United States. Coverage follows what each register publishes.",
    },
  },
  {
    q: { fi: "Mitä Free-taso sisältää?", en: "What does the Free plan include?" },
    a: {
      fi: "Free on 50 hakua ja 50 uutta yritystä kuukaudessa, enintään 50 yritystä per haku ja 400 yritystä tallessa. Vienti ja syvä haku kuuluvat maksullisiin tasoihin. Haku kuluttaa hakuyksikön, vienti ei.",
      en: "Free is 50 searches and 50 new companies per month, 50 companies per search and 400 stored. Exports and deep search follow paid plans. A search uses a search unit. CSV export does not.",
    },
  },
  {
    q: { fi: "Voiko tiimi jakaa haut?", en: "Can a team share searches?" },
    a: {
      fi: "Kyllä. Kutsuttu jäsen näkee saman työtilan haut ja yritykset. Kiintiö kuuluu työtilan tilaukseen, ei jokaiselle jäsenelle erikseen Free-kertaa.",
      en: "Yes. An invited member sees the same workspace searches and companies. Quota belongs to the workspace subscription, not five times Free for five people.",
    },
  },
];
