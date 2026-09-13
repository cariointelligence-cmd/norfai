import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { INDUSTRIES } from "@/lib/content/industries.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/industries")!;

export const Route = createFileRoute("/industries/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/industries" }),
  component: IndustryIndex,
});

function IndustryIndex() {
  const { locale } = useI18n();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{loc({ fi: "Toimialat", en: "Industries" }, locale)}</h1>
        <p className="mt-4 max-w-2xl text-mute">
          {loc(
            {
              fi: "Hae toimialan ja tilanteen perusteella. Nämä sivut eivät dumpaa yritystietokantaa julki.",
              en: "Search by industry and situation. These pages do not dump the company database in public.",
            },
            locale,
          )}
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((i) => (
            <Link key={i.slug} to="/industries/$slug" params={{ slug: i.slug }} className="border border-line bg-panel p-5 hover:border-line-strong">
              <h2 className="text-lg font-medium">{loc(i.title, locale)}</h2>
              <p className="mt-2 text-sm text-mute">{loc(i.h1, locale)}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
