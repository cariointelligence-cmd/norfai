import { SITE_EMAIL, SITE_NAME } from "../seo/site.ts";
import { CAMPAIGN_KIND, type MailCampaign } from "./mailer.ts";

export type MailLocale = "fi" | "en";

export type RenderedMail = { subject: string; text: string; html: string };

function wrapHtml(opts: { title: string; bodyHtml: string; footerHtml: string }): string {
  return `<!doctype html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f1ea;color:#1b1914;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #ddd6c6;">
        <tr><td style="padding:20px 28px 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#7a7468;">${SITE_NAME}</td></tr>
        <tr><td style="padding:8px 28px 0;font-size:22px;line-height:1.3;">${opts.title}</td></tr>
        <tr><td style="padding:16px 28px 24px;font-size:15px;line-height:1.55;color:#3f3a32;">${opts.bodyHtml}</td></tr>
        <tr><td style="padding:0 28px 24px;font-size:12px;line-height:1.5;color:#7a7468;border-top:1px solid #eee8da;">${opts.footerHtml}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function p(s: string): string {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  const safe = s.replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
  return `<p style="margin:0 0 12px;white-space:pre-wrap;">${safe}</p>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:20px 0 8px;"><a href="${href}" style="display:inline-block;background:#1b1914;color:#fffdf8;text-decoration:none;padding:10px 16px;font-size:13px;">${label}</a></p>`;
}

export type CopyCtx = {
  locale: MailLocale;
  name?: string | null;
  origin: string;
  unsubUrl?: string;
  ticketUrl?: string;
  planLabel?: string;
  runName?: string | null;
  count?: number;
  contacts?: number;
  headline?: string | null;
  items?: string[];
  inviterName?: string | null;
  customerEmail?: string | null;
  ctaUrl?: string;
};

function greet(locale: MailLocale, name?: string | null): string {
  const n = (name || "").trim().split(/\s+/)[0];
  if (locale === "en") return n ? `Hi ${n},` : "Hi,";
  return n ? `Hei ${n},` : "Hei,";
}

function footer(locale: MailLocale, ctx: CopyCtx, marketing: boolean): string {
  const support = `${ctx.origin}/support`;
  const bits: string[] = [];
  if (locale === "en") {
    bits.push(`Norf is company search from public registers and company websites. ${SITE_EMAIL}`);
    bits.push(`Help: <a href="${support}">${support}</a>`);
    if (marketing && ctx.unsubUrl) bits.push(`<a href="${ctx.unsubUrl}">Unsubscribe from these notes</a>`);
  } else {
    bits.push(`Norf hakee yrityksiä julkisista rekistereistä ja yritysten sivuilta. ${SITE_EMAIL}`);
    bits.push(`Tuki: <a href="${support}">${support}</a>`);
    if (marketing && ctx.unsubUrl) bits.push(`<a href="${ctx.unsubUrl}">Peru nämä muistutukset</a>`);
  }
  return bits.map((b) => `<p style="margin:8px 0 0;">${b}</p>`).join("");
}

export function renderCampaign(campaign: MailCampaign, ctx: CopyCtx): RenderedMail {
  const fi = ctx.locale !== "en";
  const hi = greet(ctx.locale, ctx.name);
  const origin = ctx.origin.replace(/\/$/, "");
  const billing = `${origin}/billing`;
  const pricing = `${origin}/pricing`;
  const search = `${origin}/search/new`;
  const tickets = `${origin}/tickets`;
  const support = `${origin}/support`;
  const overview = `${origin}/overview`;
  const marketing = CAMPAIGN_KIND[campaign] === "marketing";

  const pack = (title: string, subject: string, paras: string[], button?: { href: string; label: string }, extraText: string[] = []): RenderedMail => {
    const bodyHtml = [p(hi), ...paras.map(p), button ? cta(button.href, button.label) : ""].join("");
    const text = [hi, "", ...paras.map((x) => x.replace(/<[^>]+>/g, "")), "", button ? `${button.label}: ${button.href}` : "", ...extraText].filter(Boolean).join("\n");
    return {
      subject,
      text,
      html: wrapHtml({ title, bodyHtml, footerHtml: footer(ctx.locale, ctx, marketing) }),
    };
  };

  switch (campaign) {
    case "welcome":
      return pack(
        fi ? "Tervetuloa Norfiin" : "Welcome to Norf",
        fi ? "Tervetuloa. Ensimmäinen haku kannattaa rajata toimialaan." : "Welcome. Start with a bounded industry search.",
        fi
          ? [
              "Norf hakee yrityksiä virallisista rekistereistä ja yritysten omilta sivuilta. Tyhjä kenttä tarkoittaa, ettei tietoa löytynyt. Rivejä ei keksitä.",
              "Aloita valitsemalla toimiala ja alue. Laaja kansallinen haku ilman rajausta ei ole käytössä, koska se tuottaa heikon listan.",
            ]
          : [
              "Norf finds companies in official registers and on company-controlled websites. An empty field means not found. Rows are not invented.",
              "Start with an industry and a place. An unbounded national scan is blocked because it produces a weak list.",
            ],
        { href: search, label: fi ? "Aloita haku" : "Start a search" },
      );
    case "day3_checkin":
      return pack(
        fi ? "Miten Norf on toiminut?" : "How has Norf been working?",
        fi ? "Kolme päivää rekisteröitymisestä. Miten haku on sujunut?" : "Three days in. How is search going?",
        fi
          ? [
              "Rekisteröitymisestä on kolme päivää. Jos haku jätti kenttiä tyhjiksi, se on rehellinen tulos: tietoa ei ollut julki.",
              "Jos jokin kitkasi, vastaa tähän tai avaa tukipyyntö. Palaute menee suoraan tiimille, ei bottijonoon.",
            ]
          : [
              "It has been three days since you signed up. Empty fields are honest: the fact was not published.",
              "If something jammed, reply here or open a support ticket. Feedback goes to the team, not a bot queue.",
            ],
        { href: support, label: fi ? "Lähetä palaute" : "Send feedback" },
      );
    case "quota_search":
      return pack(
        fi ? "Hakukiintiö täynnä tälle jaksolle" : "Search quota reached for this period",
        fi ? "Free-suunnitelman haut on käytetty. Päivitä tai kerro, jos jokin jäi kesken." : "Free-plan searches are used up. Upgrade, or tell us if something jammed.",
        fi
          ? [
              "Tämän jakson haut on käytetty. Aiemmin löydetyt yritykset säilyvät työtilassa.",
              "Starter alkaa 149 eurosta (ALV 0 %). Jos kiintiö loppui kesken kokeilun, avaa tukipyyntö. Emme arvaile, miksi haku ei riittänyt.",
            ]
          : [
              "This period's searches are used. Companies already in the workspace stay.",
              "Starter starts at 149 EUR (VAT 0%). If the cap hit mid-trial, open a ticket. We do not guess why search was not enough.",
            ],
        { href: billing, label: fi ? "Avaa tilaus" : "Open billing" },
      );
    case "quota_companies":
      return pack(
        fi ? "Yrityskiintiö täynnä" : "Company quota reached",
        fi ? "Uusia yrityksiä ei voi enää tallentaa tälle jaksolle. Vanhat rivit säilyvät." : "New companies cannot be stored this period. Existing rows stay.",
        fi
          ? [
              "Suunnitelman yrityskatto tuli vastaan. Haku ei poista vanhoja rivejä.",
              "Päivitä suunnitelmaa tai poista asiakaslistalta turhat. Jos katto yllätti, kerro tukipyynnössä mitä hait.",
            ]
          : [
              "The plan's company cap was reached. Search does not delete old rows.",
              "Upgrade, or trim accounts you do not need. If the cap surprised you, say what you were searching in a ticket.",
            ],
        { href: billing, label: fi ? "Avaa tilaus" : "Open billing" },
      );
    case "quota_nudge_80":
      return pack(
        fi ? "Hakikiintiöstä on käytetty suurin osa" : "Most of this period's searches are used",
        fi ? "Noin 80 % hauista on käytetty. Päivitä ennen kuin katto tulee vastaan." : "About 80% of searches are used. Upgrade before the cap hits.",
        fi
          ? [
              "Free-suunnitelmassa haut ovat rajallisia. Kun katto tulee vastaan, uudet haut odottavat seuraavaa jaksoa tai päivitystä.",
              "Jos lista on jo tuottanut, Starter pitää tahdin. Jos ei, kerro tukipyynnössä mikä jäi uupumaan.",
            ]
          : [
              "The Free plan caps searches. When the cap hits, new searches wait for the next period or an upgrade.",
              "If the list already pays off, Starter keeps the pace. If not, tell us in a ticket what was missing.",
            ],
        { href: pricing, label: fi ? "Katso hinnat" : "See pricing" },
      );
    case "winback_1":
      return pack(
        fi ? "Teimmekö jotain väärin?" : "Did we get something wrong?",
        fi ? "Kaksi viikkoa ilman käyntiä. Teimmekö jotain väärin?" : "Two weeks without a visit. Did we get something wrong?",
        fi
          ? [
              "Et ole kirjautunut kahteen viikkoon. Jos haku tuotti tyhjää tai lista oli väärä, se on meidän korjattava, ei sinun arvattava.",
              "Lyhyt palaute riittää. Voit myös avata työtilan ja jatkaa siitä mihin jäit.",
            ]
          : [
              "You have not signed in for two weeks. If search came back empty or the list was wrong, that is ours to fix.",
              "A short note is enough. You can also open the workspace and pick up where you left off.",
            ],
        { href: support, label: fi ? "Lähetä palaute" : "Send feedback" },
      );
    case "winback_2":
      return pack(
        fi ? "Työtila odottaa, yritykset ovat tallella" : "Your workspace is still here",
        fi ? "Löydetyt yritykset ovat tallella. Muistutus Norfista." : "Companies you found are still stored. A note from Norf.",
        fi
          ? [
              "Edellisestä käynnistä on kolme viikkoa. Työtilan yritykset, listat ja haut eivät ole kadonneet.",
              "Jos et tarvitse Norfia juuri nyt, ei hätää. Jos tarvitset, haku on valmiina.",
            ]
          : [
              "It has been three weeks. Companies, lists and searches in the workspace are still there.",
              "If you do not need Norf right now, that is fine. If you do, search is ready.",
            ],
        { href: overview, label: fi ? "Avaa työtila" : "Open workspace" },
      );
    case "winback_3":
      return pack(
        fi ? "Viimeinen muistutus tältä erää" : "Last reminder for now",
        fi ? "Viimeinen muistutus. Emme jatka tätä ketjua, ellet palaa." : "Last reminder. We will stop this chain unless you come back.",
        fi
          ? [
              "Neljä viikkoa ilman käyntiä. Tämä on kolmas ja viimeinen viesti tässä ketjussa.",
              "Jos Norf ei sopinut, kerro lyhyesti miksi. Jos sopi, muistathan että työtila on tallella.",
            ]
          : [
              "Four weeks without a visit. This is the third and last note in this chain.",
              "If Norf was not a fit, a short why helps. If it was, the workspace is still there.",
            ],
        { href: support, label: fi ? "Kerro miksi" : "Tell us why" },
      );
    case "first_search":
      return pack(
        fi ? "Ensimmäinen haku on tallessa" : "Your first search is stored",
        fi ? "Ensimmäinen haku on valmis. Avaa yritykset ja tarkista tyhjät kentät." : "Your first search is in. Open companies and check empty fields.",
        fi
          ? [
              "Haku on tallennettu. Pisteet ja yhteystiedot täyttyvät, kun sivuja ehditään lukea.",
              "Tyhjä puhelin tai sähköposti tarkoittaa, ettei sitä löytynyt julkisista lähteistä. Sitä ei täytetä arvauksella.",
            ]
          : [
              "The search is stored. Scores and contacts fill in as pages are read.",
              "An empty phone or email means it was not found in public sources. It is not guessed.",
            ],
        { href: overview, label: fi ? "Avaa yhteenveto" : "Open overview" },
      );
    case "no_search_day1":
      return pack(
        fi ? "Ensimmäinen haku odottaa" : "Your first search is waiting",
        fi ? "Vuorokausi rekisteröitymisestä. Rajattu haku on paras alku." : "A day since signup. A bounded search is the best start.",
        fi
          ? [
              "Tili on valmis, mutta hakua ei ole vielä ajettu. Valitse toimiala ja alue. Koko maan avoin haku on estetty, koska se tuottaa heikon listan.",
              "Tyhjä tulos on rehellinen: ehtoja ei täytetty tai lähde ei palauttanut osumia. Rivejä ei keksitä.",
            ]
          : [
              "The account is ready, but no search has run yet. Pick an industry and a place. An unbounded national scan is blocked because it produces a weak list.",
              "An empty result is honest: the filters did not match, or the source returned none. Rows are not invented.",
            ],
        { href: search, label: fi ? "Aloita haku" : "Start a search" },
      );
    case "search_complete": {
      const n = ctx.count ?? 0;
      const contacts = ctx.contacts ?? 0;
      const run = (ctx.runName || "").trim() || (fi ? "Haku" : "Search");
      return pack(
        fi ? `Haku valmis: ${n} yritystä` : `Search finished: ${n} companies`,
        fi ? `${run} on valmis. ${n} yritystä tallennettu.` : `${run} is done. ${n} companies stored.`,
        fi
          ? [
              `${run} päättyi. Työtilassa on ${n} yritystä${contacts ? ` ja ${contacts} yhteystietoa` : ""}.`,
              "Pisteet täyttyvät, kun sivuja ehditään lukea. Tyhjä kenttä tarkoittaa, ettei tietoa ollut julki.",
            ]
          : [
              `${run} finished. The workspace now has ${n} companies${contacts ? ` and ${contacts} contacts` : ""}.`,
              "Scores fill in as pages are read. An empty field means it was not published.",
            ],
        { href: ctx.ctaUrl || overview, label: fi ? "Avaa haku" : "Open the search" },
      );
    }
    case "search_empty": {
      const run = (ctx.runName || "").trim() || (fi ? "Haku" : "Search");
      return pack(
        fi ? "Haku ei löytänyt yrityksiä" : "Search found no companies",
        fi ? `${run} päättyi ilman rivejä. Se on rehellinen tulos.` : `${run} finished with no rows. That is an honest result.`,
        fi
          ? [
              "Ehdot eivät täyttyneet tai lähde ei palauttanut osumia. Rivejä ei täytetä arvauksella.",
              "Kokeile kapeampaa toimialaa, toista aluetta tai tarkempaa nimeä. Jos jokin kitkasi, avaa tukipyyntö.",
            ]
          : [
              "The filters did not match, or the source returned none. Rows are not guessed.",
              "Try a tighter industry, another place, or a more precise name. If something jammed, open a ticket.",
            ],
        { href: search, label: fi ? "Uusi haku" : "New search" },
      );
    }
    case "weekly_digest": {
      const n = ctx.count ?? 0;
      const extra = (ctx.items ?? []).slice(0, 8);
      return pack(
        fi ? `Viikon muutokset: ${n}` : `This week's changes: ${n}`,
        ctx.headline || (fi ? `${n} muutosta yrityksissä tällä viikolla.` : `${n} company changes this week.`),
        fi
          ? [
              n === 0
                ? "Tällä viikolla ei havaittu julkisia muutoksia seuratuissa yrityksissä."
                : `Seuratuissa yrityksissä on ${n} julkista muutosta. Muutokset tulevat rekistereistä ja sivuilta, ei arvauksesta.`,
              ...extra,
            ]
          : [
              n === 0
                ? "No public changes were detected on followed companies this week."
                : `${n} public changes on followed companies. Changes come from registers and sites, not guesses.`,
              ...extra,
            ],
        { href: `${origin}/changes`, label: fi ? "Avaa muutokset" : "Open changes" },
      );
    }
    case "billing_thanks":
      return pack(
        fi ? `Tilaus vahvistettu${ctx.planLabel ? `: ${ctx.planLabel}` : ""}` : `Subscription confirmed${ctx.planLabel ? `: ${ctx.planLabel}` : ""}`,
        fi ? `Maksu vahvistettu. Käytössä ${ctx.planLabel ?? "maksettu suunnitelma"}.` : `Payment confirmed. ${ctx.planLabel ?? "Paid plan"} is active.`,
        fi
          ? [
              "Stripe vahvisti maksun. Kiintiö nollautuu jakson alussa. Laskut ja kortin vaihto ovat Stripen portaalissa.",
              "Jos summa tai suunnitelma ei täsmää, vastaa tähän. Emme muuta tilausta ilman sinua.",
            ]
          : [
              "Stripe confirmed the payment. The quota resets at the start of a period. Invoices and card changes live in the Stripe portal.",
              "If the amount or plan is wrong, reply to this. We do not change the subscription without you.",
            ],
        { href: billing, label: fi ? "Hallitse tilausta" : "Manage billing" },
      );
    case "billing_failed":
      return pack(
        fi ? "Maksu ei onnistunut" : "Payment did not go through",
        fi ? "Stripe ei saanut veloitettua. Kortti voi olla vanhentunut." : "Stripe could not charge. The card may be expired.",
        fi
          ? [
              "Maksu hylättiin. Suunnitelma pysyy ennallaan, kunnes Stripe saa veloituksen tai tilaus päättyy.",
              "Avaa billing ja vaihda kortti Stripen portaalissa. Emme muuta tilausta ilman sinua.",
            ]
          : [
              "The charge was declined. The plan stays until Stripe collects or the subscription ends.",
              "Open billing and update the card in the Stripe portal. We do not change the subscription without you.",
            ],
        { href: billing, label: fi ? "Avaa billing" : "Open billing" },
      );
    case "plan_ended":
      return pack(
        fi ? "Tilaus päättyi. Free on käytössä." : "Subscription ended. Free is active.",
        fi ? "Stripe merkitsi tilauksen päättyneeksi. Yritykset säilyvät työtilassa." : "Stripe marked the subscription ended. Companies stay in the workspace.",
        fi
          ? [
              "Maksettu suunnitelma ei ole enää voimassa. Haut noudattavat Free-kattoa. Aiemmin löydetyt yritykset eivät katoa.",
              "Jos tämä oli virhe, vastaa tähän tai avaa Stripe-portaali.",
            ]
          : [
              "The paid plan is no longer active. Searches follow the Free cap. Companies already stored are not deleted.",
              "If this was a mistake, reply here or open the Stripe portal.",
            ],
        { href: billing, label: fi ? "Avaa billing" : "Open billing" },
      );
    case "plan_gifted":
      return pack(
        fi ? `Suunnitelma päivitetty${ctx.planLabel ? `: ${ctx.planLabel}` : ""}` : `Plan updated${ctx.planLabel ? `: ${ctx.planLabel}` : ""}`,
        fi ? `Ylläpito asetti työtilan suunnitelmaksi ${ctx.planLabel ?? "maksettu"}. Kiintiö nollautui.` : `An admin set the workspace plan to ${ctx.planLabel ?? "paid"}. Quota reset.`,
        fi
          ? [
              "Tämä ei ole Stripe-veloitusta. Jos suunnitelma ei täsmää, vastaa tähän.",
              "Haku ja yrityskatto noudattavat uutta suunnitelmaa heti.",
            ]
          : [
              "This is not a Stripe charge. If the plan is wrong, reply here.",
              "Search and company caps follow the new plan immediately.",
            ],
        { href: overview, label: fi ? "Avaa työtila" : "Open workspace" },
      );
    case "team_invite": {
      const who = (ctx.inviterName || "").trim() || (fi ? "Työtilan omistaja" : "The workspace owner");
      return pack(
        fi ? "Kutsu Norf-työtilaan" : "Invite to a Norf workspace",
        fi ? `${who} kutsui sinut Norf-työtilaan.` : `${who} invited you to a Norf workspace.`,
        fi
          ? [
              `${who} kutsui sinut samaan työtilaan. Näet samat listat, haut ja yritykset. Kirjaudu tai luo tili tällä sähköpostilla.`,
              "Jos et odottanut kutsua, jätä tämä viesti huomiotta.",
            ]
          : [
              `${who} invited you to the same workspace. You will see the same lists, searches and companies. Sign in or create an account with this email.`,
              "If you did not expect this invite, ignore this message.",
            ],
        { href: `${origin}/login`, label: fi ? "Kirjaudu" : "Sign in" },
      );
    }
    case "account_ready":
      return pack(
        fi ? "Norf-tili on valmis" : "Your Norf account is ready",
        fi ? "Ylläpito loi Norf-tilin tälle sähköpostille." : "An admin created a Norf account for this email.",
        fi
          ? [
              "Kirjaudu samalla osoitteella. Jos salasanaa ei asetettu itse, se tulee ylläpidolta erillisessä kanavassa. Emme lähetä salasanaa tähän viestiin.",
              "Aloita rajattu haku toimialaan ja alueeseen.",
            ]
          : [
              "Sign in with this address. If you did not set a password, the admin who created the account will share it on another channel. We do not put passwords in this email.",
              "Start with a bounded industry and place search.",
            ],
        { href: `${origin}/login`, label: fi ? "Kirjaudu" : "Sign in" },
      );
    case "signup_admin":
      return pack(
        "New Norf signup",
        `New user: ${ctx.customerEmail || ctx.name || "unknown"}`,
        [
          `${ctx.customerEmail || "A new address"} just created a workspace.`,
          "Plan starts on Free. Welcome mail is queued to them on the same path.",
        ],
        { href: `${origin}/admin`, label: "Open admin" },
      );
    case "ticket_received":
      return pack(
        fi ? "Tukipyyntö vastaanotettu" : "We received your request",
        fi ? "Tukipyyntö vastaanotettu. Vastaamme tähän ketjuun." : "Support request received. We will reply on this thread.",
        fi
          ? [
              "Viestisi on tallessa. Voit seurata ketjua linkistä. Vastaus tulee myös sähköpostiin.",
              "Älä lähetä salasanoja tai Stripe-avaimia tähän ketjuun.",
            ]
          : [
              "Your message is stored. Follow the thread from the link. The reply also arrives by email.",
              "Do not send passwords or Stripe keys on this thread.",
            ],
        { href: ctx.ticketUrl || tickets, label: fi ? "Avaa tiketti" : "Open ticket" },
      );
    case "ticket_admin":
      return pack(
        "New support ticket",
        `New Norf ticket: ${(ctx.ticketUrl || "support").slice(-24)}`,
        [
          "A customer opened or updated a support ticket. Reply in admin so they get the email too.",
        ],
        { href: ctx.ticketUrl || `${origin}/admin/support`, label: "Open in admin" },
      );
    case "ticket_reply": {
      const quote = (ctx.items ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
      return pack(
        fi ? "Vastaus tukipyyntöösi" : "A reply to your request",
        fi ? "Norf vastasi tukipyyntöösi" : "Norf replied to your support request",
        fi
          ? [
              "Tiimi vastasi tukipyyntöösi:",
              ...quote,
              "Voit jatkaa samaan tikettiin linkistä. Älä lähetä salasanoja tähän ketjuun.",
            ]
          : [
              "The team replied to your request:",
              ...quote,
              "Continue on the same ticket from the link. Do not send passwords on this thread.",
            ],
        { href: ctx.ticketUrl || tickets, label: fi ? "Lue ketju ja vastaa" : "Read the thread and reply" },
      );
    }
    case "ticket_opened": {
      const quote = (ctx.items ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
      return pack(
        fi ? "Norf avasi ketjun kanssasi" : "Norf opened a thread with you",
        fi ? "Norf avasi tukipyynnön / vaatimuksen kanssasi" : "Norf opened a support request with you",
        fi
          ? [
              "Tiimi avasi ketjun kanssasi:",
              ...quote,
              "Vastaa samaan tikettiin linkistä. Älä lähetä salasanoja tai Stripe-avaimia tähän ketjuun.",
            ]
          : [
              "The team opened a thread with you:",
              ...quote,
              "Reply on the same ticket from the link. Do not send passwords or Stripe keys on this thread.",
            ],
        { href: ctx.ticketUrl || tickets, label: fi ? "Avaa ketju" : "Open the thread" },
      );
    }
    case "ticket_closed":
      return pack(
        fi ? "Tukipyyntö suljettu" : "Support request closed",
        fi ? "Tukipyyntö merkittiin valmiiksi." : "The support request was marked done.",
        fi
          ? [
              "Ketju on suljettu. Voit avata sen uudelleen vastaamalla samaan tikettiin.",
              "Jos asia jäi kesken, kirjoita uusi viesti linkistä.",
            ]
          : [
              "The thread is closed. You can reopen it by replying on the same ticket.",
              "If something was left open, write a new message from the link.",
            ],
        { href: ctx.ticketUrl || tickets, label: fi ? "Avaa tiketti" : "Open ticket" },
      );
    case "admin_test":
      return pack(
        fi ? "Norf-postin testi" : "Norf mail test",
        fi ? "Norf testiviesti. Jos luet tämän, posti toimii." : "Norf test email. If you can read this, mail works.",
        fi
          ? [
              "Tämä on admin-testi. Viesti lähti Norfin omasta postijonosta.",
              "Jos tämä tuli perille, welcome-, tuki- ja kiintiöviestit käyttävät samaa reittiä.",
            ]
          : [
              "This is an admin test. It left through Norf's own mail queue.",
              "If it arrived, welcome, support and quota mail use the same path.",
            ],
        { href: ctx.ticketUrl || `${origin}/admin/mail`, label: fi ? "Avaa posti" : "Open mail" },
      );
    default:
      return pack(SITE_NAME, SITE_NAME, [fi ? "Viesti Norfilta." : "A note from Norf."], { href: origin, label: SITE_NAME });
  }
}

export function campaignLabel(campaign: string): string {
  const map: Record<string, string> = {
    welcome: "Welcome",
    day3_checkin: "Day 3 check-in",
    no_search_day1: "No search day 1",
    quota_search: "Search quota",
    quota_companies: "Company quota",
    quota_nudge_80: "Quota 80%",
    winback_1: "Winback 1",
    winback_2: "Winback 2",
    winback_3: "Winback 3",
    first_search: "First search",
    search_complete: "Search complete",
    search_empty: "Search empty",
    weekly_digest: "Weekly digest",
    billing_thanks: "Billing thanks",
    billing_failed: "Billing failed",
    plan_ended: "Plan ended",
    plan_gifted: "Plan gifted",
    team_invite: "Team invite",
    account_ready: "Account ready",
    signup_admin: "Signup admin",
    ticket_received: "Ticket received",
    ticket_admin: "Ticket admin",
    ticket_reply: "Ticket reply",
    ticket_opened: "Ticket opened",
    ticket_closed: "Ticket closed",
    admin_test: "Admin test",
  };
  return map[campaign] ?? campaign;
}
