import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { JsonLd } from "@/components/seo";
import { SearchDemo } from "@/components/search-demo";
import { HOW_STEPS, LANDING, OPP_CARDS, SEARCH_RECIPES, SIGNALS } from "@/lib/content/landing.ts";
import { loc } from "@/lib/content/locale.ts";
import { USE_CASES } from "@/lib/content/use-cases.ts";
import { useI18n } from "@/lib/i18n";
import { PLANS } from "@/lib/norr/platform";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { marketingHead } from "@/lib/seo/head.ts";
import { organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema.ts";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { SITE_NAME } from "@/lib/seo/site.ts";

const meta = pageByPath("/")!;

export const Route = createFileRoute("/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/" }),
  component: Landing,
});

function Landing() {
  const { t, locale } = useI18n();
  const { user, isPending } = useCurrentUserState();
  if (!isPending && user) {
    return <Navigate to="/overview" />;
  }
  const L = <T,>(b: { fi: T; en: T; sv?: T }) => loc(b, locale);
  return (
    <MarketingShell>
      <JsonLd data={organizationSchema("")} />
      <JsonLd data={softwareSchema("")} />
      <JsonLd data={websiteSchema("")} />
      <section className="norr-grid border-b border-line">
        <div className="wrap section">
          <p className="kicker">{L(LANDING.kicker)}</p>
          <h1 className="display mt-4 max-w-3xl">{L(LANDING.heroTitle)}</h1>
          <p className="lede mt-5 max-w-2xl">{L(LANDING.heroBody)}</p>
          <div className="cta-row mt-8">
            <Link to="/login" className="cta">
              {L(LANDING.heroCta)}
            </Link>
            <a href="#how" className="cta-ghost">
              {L(LANDING.heroSecondary)}
            </a>
          </div>
        </div>
      </section>

      <SearchDemo />

      <section className="border-b border-line">
        <div className="wrap section">
          <p className="kicker">{L(LANDING.problemKicker)}</p>
          <h2 className="title mt-3 max-w-3xl">{L(LANDING.problemTitle)}</h2>
          <p className="mt-4 max-w-2xl text-mute">{L(LANDING.problemBody)}</p>
        </div>
      </section>

      <section id="product" className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{L(LANDING.signalsTitle)}</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SIGNALS.map((s) => (
              <article key={L(s.title)} className="panel p-5">
                <h3 className="text-sm font-medium">{L(s.title)}</h3>
                <p className="mt-2 text-sm text-mute">{L(s.body)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap section">
          <p className="kicker">{L(LANDING.oppKicker)}</p>
          <h2 className="title mt-3 max-w-3xl">{L(LANDING.oppTitle)}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {OPP_CARDS.map((c) => (
              <article key={L(c.sell)} className="panel p-5">
                <h3 className="text-sm font-medium">{L(c.sell)}</h3>
                <p className="mt-2 text-sm text-mute">{L(c.find)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{t("navUseCases")}</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((u) => (
              <Link key={u.slug} to="/use-cases/$slug" params={{ slug: u.slug }} className="panel panel-hover p-5">
                <h3 className="text-sm font-medium">{loc(u.title, locale)}</h3>
                <p className="mt-2 text-sm text-mute">{loc(u.h1, locale)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{loc({ fi: "Esimerkkihakuja", en: "Search examples", sv: "Exempelsökningar" }, locale)}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SEARCH_RECIPES.map((r) => (
              <article key={L(r.title)} className="panel p-5">
                <h3 className="text-sm font-medium">{L(r.title)}</h3>
                <ul className="mt-3 space-y-1 text-sm text-mute">
                  {L(r.filters).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{L(LANDING.howTitle)}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {HOW_STEPS.map((s, i) => (
              <article key={L(s.title)} className="panel p-5">
                <div className="font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="mt-2 text-sm font-medium">{L(s.title)}</h3>
                <p className="mt-2 text-sm text-mute">{L(s.body)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{L(LANDING.trustTitle)}</h2>
          <p className="mt-4 max-w-2xl text-mute">{L(LANDING.trustBody)}</p>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="wrap section">
          <h2 className="title">{t("plansTitle")}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(PLANS).map((p) => (
              <article key={p.id} className="panel flex flex-col p-5">
                <div className="kicker">{p.label}</div>
                <div className="mt-3 text-3xl font-medium tracking-tight">
                  {p.priceEur ? `€${p.priceEur}` : t("planFree")}
                  {p.priceEur ? <span className="text-sm text-mute"> / kk</span> : null}
                </div>
                <p className="mt-3 text-sm text-mute">
                  {p.unlimited ? t("searchesUnlimited") : `${p.searchesPerMonth} ${t("searches")}`}
                </p>
                <Link to="/pricing" className="cta-ghost mt-6">
                  {t("planCta")}
                </Link>
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm text-faint">{t("priceVat")}</p>
        </div>
      </section>

      <section>
        <div className="wrap section">
          <h2 className="display max-w-3xl">{L(LANDING.ctaTitle)}</h2>
          <p className="mt-3 max-w-xl text-mute">{L(LANDING.ctaBody)}</p>
          <div className="cta-row mt-6">
            <Link to="/login" className="cta">
              {L(LANDING.heroCta)}
            </Link>
          </div>
          <p className="mt-8 text-xs text-faint">{SITE_NAME} does not guarantee a search-engine ranking.</p>
        </div>
      </section>
    </MarketingShell>
  );
}
