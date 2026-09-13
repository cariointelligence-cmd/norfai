import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { loc } from "@/lib/content/locale.ts";
import { LOCATIONS } from "@/lib/content/locations.ts";
import { MARKETS } from "@/lib/content/markets.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/locations")!;

export const Route = createFileRoute("/locations/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/locations" }),
  component: LocationIndex,
});

function LocationIndex() {
  const { locale } = useI18n();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{loc({ fi: "Sijainnit", en: "Locations" }, locale)}</h1>
        <p className="mt-4 max-w-2xl text-mute">
          {loc(
            {
              fi: "Pidä haku kunnassa. Koko maan lista ilman toimialaa on liian laaja myyntiviikolle.",
              en: "Keep the search in a municipality. A nationwide list with no industry is too wide for a selling week.",
            },
            locale,
          )}
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOCATIONS.map((l) => (
            <Link key={l.slug} to="/locations/$slug" params={{ slug: l.slug }} className="border border-line bg-panel p-5 hover:border-line-strong">
              <h2 className="text-lg font-medium">{loc(l.title, locale)}</h2>
              <p className="mt-2 text-sm text-mute">{loc(l.h1, locale)}</p>
            </Link>
          ))}
        </div>
        <h2 className="mt-16 text-2xl font-medium">{loc({ fi: "Kaupunki ja toimiala", en: "City and industry" }, locale)}</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {MARKETS.map((m) => (
            <a key={m.slug} href={`/markets/${m.slug}`} className="border border-line bg-panel p-5 hover:border-line-strong">
              <h3 className="text-sm font-medium">{loc(m.title, locale)}</h3>
              <p className="mt-2 text-sm text-mute">{loc(m.h1, locale)}</p>
            </a>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
