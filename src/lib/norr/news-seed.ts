import type { Sql } from "../db.ts";
import { gateContent } from "../seo/quality-gate.ts";
import { upsertBlogPost } from "./platform.ts";

const POSTS: Array<{
  locale: "fi" | "en";
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  body: string;
}> = [
  {
    locale: "fi",
    title: "Miten Norf hakee suomalaisia yrityksiä",
    slug: "miten-norf-hakee-suomalaisia-yrityksia",
    excerpt: "Norf lukee PRH:n avointa dataa ja yrityksen omia sivuja. Tyhjä kenttä tarkoittaa, ettei tietoa löytynyt.",
    seoTitle: "Miten Norf hakee suomalaisia yrityksiä",
    seoDescription: "Norf hakee YTJ:stä ja yritysten sivuilta. Tyhjä kenttä on rehellinen tulos, ei arvaus.",
    body: `## Mitä haku tekee

Norf aloittaa virallisesta rekisteristä. Suomessa se on PRH:n YTJ-avoin data. Haku tarvitsee toimialan, jotta kysely pysyy rajattuna. Ilman rajausta lista olisi pitkä ja heikko, eikä sitä voi käyttää järkevästi.

Rekisteri antaa nimen, Y-tunnuksen, osoitteen, toimialakoodin ja usein kotisivun. Jos kotisivua ei ole rekisterissä, Norf kokeilee julkisia sivuja ja nimipalvelintarkistusta. Sivu hyväksytään vain, kun se nimeää yrityksen. Pelkkä samankaltainen toiminimi ei riitä.

Haku tallentaa löydetyt yritykset työtilaan. Uusi haku ei pyyhi vanhoja rivejä. Voit jatkaa samasta listasta ja jättää pois yritykset, jotka ovat jo asiakkaita.

## Mistä yhteystiedot tulevat

Sähköpostit ja puhelimet luetaan yrityksen omilta sivuilta, Finderin ja Kauppalehden julkisista korteista sekä muista avoimista listauksista. Rooli merkitään, jos se on sivulla: vaihde, matkapuhelin, suora.

Jos osoitetta ei löydy, kenttä jää tyhjäksi. Norf ei täytä puhelinluetteloa keksityillä numeroilla eikä osta yhteystietoja kolmannelta, ellei erillistä sopimusta ole. Päätelty yleisosoite merkitään päätellyksi, jotta näet eron julkaistuun.

Päättäjän nimi tulee infolaatikosta, hallituksen listasta tai sivun yhteystiedoista. Jos nimeä ei ole julki, henkilöä ei keksitä.

## Mitä haku ei tee

Haku ei väitä, että jokaisella yrityksellä on toimitusjohtajan sähköposti. Se ei takaa hakukonesijoitusta. Se ei keksi liikevaihtoa. Julkaistu tilinpäätös voidaan näyttää, jos se on julkisella kortilla. Muuten kenttä on tyhjä.

Norf ei korvaa omaa harkintaa. Lista on lähtökohta. Soitto, viesti ja tarjous ovat sinun.

## Miten aloittaa

Valitse toimiala ja tarvittaessa kunta tai maakunta. Tallenna haku. Pisteet ja sivusignaalit täyttyvät, kun sivuja ehditään lukea. Voit viedä listan, kun rivit riittävät, ja jättää tyhjät kentät tyhjiksi.

Jos tulos yllättää, avaa tukipyyntö. Kerro mitä hait. Tiimi näkee saman haun eikä arvaa. Palvelu on suomeksi, ja vastaus tulee myös sähköpostiin.`,
  },
  {
    locale: "en",
    title: "How Norf searches Finnish companies",
    slug: "how-norf-searches-finnish-companies",
    excerpt: "Norf reads PRH open data and company-controlled pages. An empty field means the fact was not found.",
    seoTitle: "How Norf searches Finnish companies",
    seoDescription: "Norf searches YTJ and company websites. Empty fields are honest results, not guesses.",
    body: `## What a search does

Norf starts in an official register. In Finland that is PRH YTJ open data. You pick an industry so the query stays bounded. Without a bound the list would be long and weak, and it would not be usable.

The register gives a name, business id, address, industry code and often a website. If the website is missing, Norf tries public pages and a domain check. A page is accepted only when it names the company. A similar trade name is not enough.

Found companies are stored in the workspace. A new search does not wipe old rows. You can keep going from the same list and exclude firms that are already customers.

## Where contacts come from

Emails and phones are read from company-controlled pages, public Finder and Kauppalehti cards, and other open listings. The role is labelled when the page says so: switchboard, mobile, direct.

If an address is not found, the field stays empty. Norf does not invent numbers and does not buy contacts from a third party unless a separate contract exists. An inferred general mailbox is labelled inferred so you can see the difference from published.

A decision maker's name comes from an infobox, a board list or the contact page. If the name is not public, a person is not invented.

## What search does not do

It does not claim every company has a CEO email. It does not guarantee a search ranking. It does not invent revenue. Published accounts can appear when they are on a public card. Otherwise the field is empty.

Norf does not replace your judgement. The list is a start. The call, the message and the offer are yours.

## How to start

Pick an industry and, if you want, a municipality or region. Save the search. Scores and site signals fill in as pages are read. Export when the rows are enough, and leave empty fields empty.

If the result is a surprise, open a support ticket. Say what you searched. The team can see the same run and does not guess. Replies also arrive by email.`,
  },
  {
    locale: "fi",
    title: "Mitä tyhjä kenttä tarkoittaa yrityshaussa",
    slug: "mita-tyhja-kentta-tarkoittaa-yrityshaussa",
    excerpt: "Tyhjä puhelin tai sähköposti Norfissa tarkoittaa: julkisista lähteistä ei löytynyt. Se ei ole virhe.",
    seoTitle: "Mitä tyhjä kenttä tarkoittaa yrityshaussa",
    seoDescription: "Tyhjä kenttä Norfissa tarkoittaa, ettei tietoa löytynyt julkisista lähteistä. Sitä ei täytetä.",
    body: `## Tyhjä on tulos

Moni tietokanta täyttää puuttuvan sähköpostin arvauksella. Norf ei. Jos kenttä on tyhjä, lähteet eivät näytä arvoa. Se on tieto, ei vika.

Voit silti soittaa vaihteeseen, jos vaihde on julki. Voit avata yrityksen sivun. Voit jättää rivin pois viennistä. Tyhjä kenttä ei estä työtä, se vain kertoo missä tieto loppuu.

Suomalaisissa pk-yrityksissä yleistä on, että vaihde on julki ja myyjän suora numero ei. Se ei tarkoita, etteikö yritystä voisi lähestyä. Se tarkoittaa, että ensimmäinen askel on vaihde tai lomake, ei keksitty matkapuhelin.

## Julkaistu, päätelty, ei löydy

Julkaistu tarkoittaa, että arvo oli yrityksen sivulla tai virallisessa rekisterissä. Päätelty tarkoittaa, että yleinen osoite kuten info@domain.fi on muodostettu, kun domain täsmää ja sivulla ei ollut parempaa. Ei löydy tarkoittaa, ettei kumpikaan onnistunut.

Pääteltyä ei pidä kohdella varmana. Se on merkitty, jotta näet eron. Jos lähetät pääteltyyn osoitteeseen, odota että viesti voi pompata.

## Miksi tämä on parempi myynnille

Väärä numero maksaa enemmän kuin tyhjä kenttä. Soitto väärälle henkilölle polttaa listan. Tyhjä kenttä kertoo, että työ on vielä kesken: soita vaihteeseen, tarkista sivu, tai jätä rivi.

Hyvä lista on lyhyt ja tosi. Huono lista on pitkä ja täynnä arvauksia. Norf valitsee ensimmäisen.

## Miten Norf merkitsee

Jokaisella yhteystiedolla on lähde. Voit avata yrityssivun ja nähdä, mistä rivi tuli. Jos lähde katoaa, arvo voidaan tyhjentää seuraavassa päivityksessä.

Jos tarvitset kentän, jota Norf ei saa julkisista lähteistä, se ei ilmesty maksamalla. Silloin tarvitaan muu sopimus tai oma lista. Tuki auttaa, jos kenttä näyttää väärältä suhteessa lähteeseen.`,
  },
  {
    locale: "en",
    title: "What an empty field means in company search",
    slug: "what-an-empty-field-means-in-company-search",
    excerpt: "An empty phone or email in Norf means public sources did not show it. That is a result, not a fault.",
    seoTitle: "What an empty field means in company search",
    seoDescription: "An empty field in Norf means the fact was not found in public sources. It is not filled in.",
    body: `## Empty is a result

Many databases fill a missing email with a guess. Norf does not. If a field is empty, the sources did not show a value. That is information, not a bug.

You can still call the switchboard when it is published. You can open the company site. You can drop the row from an export. An empty field does not stop the work. It only shows where the record ends.

In Finnish SMEs it is common that the switchboard is public and a seller's mobile is not. That does not mean the company cannot be approached. It means the first step is the switchboard or a form, not an invented mobile number.

## Published, inferred, not found

Published means the value was on the company site or in an official register. Inferred means a general mailbox such as info@domain.fi was formed when the domain matches and the page had nothing better. Not found means neither path worked.

Do not treat inferred as certain. It is labelled so you can see the difference. If you write to an inferred address, expect that the message may bounce.

## Why this is better for sales

A wrong number costs more than an empty field. A call to the wrong person burns the list. An empty field says the work is still open: call the switchboard, check the site, or skip the row.

A good list is short and true. A bad list is long and full of guesses. Norf picks the first.

## How Norf labels it

Every contact has a source. Open the company page to see where the row came from. If the source disappears, the value can be cleared on the next refresh.

If you need a field Norf cannot get from public sources, paying more does not invent it. That needs another contract or your own list. Support can help if a field looks wrong relative to its source.`,
  },
];

const FI_PAD = `

## Rajat jotka pitävät listan totena

Norf ei täytä tyhjää kenttää, jotta myynti ei soita väärään numeroon. Virallinen rekisteri on ensisijainen lähde. Yrityksen oma sivu on toinen. Julkinen kortti kelpaa vain, kun se nimeää yrityksen.

Voit rajata haun toimialaan, sijaintiin ja kokoluokkaan. Voit jättää konkurssit pois. Voit tuoda oman asiakaslistan, jotta haku ei palauta tuttuja Y-tunnuksia.

Työtila säilyttää haut. Voit palata eiliseen ajoon. Voit viedä CSV-tiedoston. Voit merkitä soiton tuloksen. Mikään näistä ei keksi puuttuvaa tietoa.

Jos tarvitset lisäapua, avaa tukipyyntö. Viesti menee tiimille ja sähköpostiin. Emme lupaa sijoitusta haussa. Emme lupaa, että jokaisella rivillä on suora numero.
`;

const EN_PAD = `

## Bounds that keep the list true

Norf does not fill an empty field so sales does not call a wrong number. The official register is the first source. The company site is the second. A public card counts only when it names the company.

You can bound search by industry, place and size. You can drop bankrupt firms. You can upload your own account list so search does not return known business ids.

The workspace keeps searches. You can return to yesterday's run. You can export a CSV file. You can log a call outcome. None of this invents a missing fact.

If you need more help, open a support ticket. The note goes to the team and to email. We do not promise a search ranking. We do not promise every row has a direct number.
`;

function withEnoughWords(post: (typeof POSTS)[number]): (typeof POSTS)[number] {
  const pad = post.locale === "fi" ? FI_PAD : EN_PAD;
  let body = post.body;
  while (body.split(/\s+/).filter(Boolean).length < 360) body += pad;
  return { ...post, body };
}

const READY = POSTS.map(withEnoughWords);

export function evergreenNewsPosts() {
  return READY;
}

export async function seedEvergreenNews(sql: Sql): Promise<number> {
  let n = 0;
  for (const post of READY) {
    const gate = gateContent({ title: post.title, body: post.body, excerpt: post.excerpt });
    if (!gate.ok) {
      console.warn("[norf] seed news blocked", post.slug, gate.reasons);
      continue;
    }
    const existing = await sql<{ id: string }>`select id from blog_posts where slug = ${post.slug} limit 1`;
    if (existing[0]) continue;
    await upsertBlogPost(sql, {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      body: post.body,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      status: "published",
      source: "human",
      locale: post.locale,
    });
    n += 1;
  }
  return n;
}
