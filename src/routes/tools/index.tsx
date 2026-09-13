import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/tools")!;

export const Route = createFileRoute("/tools/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/tools" }),
  component: ToolsIndex,
});

const TOOLS = [
  {
    to: "/tools/business-id" as const,
    title: { fi: "Y-tunnushaku", en: "Business ID lookup" },
    body: { fi: "Hae yhtiö YTJ:stä Y-tunnuksella.", en: "Look up a company in YTJ by Finnish business ID." },
  },
  {
    to: "/tools/website-quality" as const,
    title: { fi: "Sivuston laatu", en: "Website quality checker" },
    body: { fi: "Pisteytä julkinen sivu. Ei arvattua liikennettä.", en: "Score a public page. No guessed traffic." },
  },
  {
    to: "/tools/company-finder" as const,
    title: { fi: "Yrityshaku", en: "Company finder" },
    body: { fi: "Kuvaile kohde. Jatka työtilassa.", en: "Describe the target. Continue in the workspace." },
  },
];

function ToolsIndex() {
  const { locale } = useI18n();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{loc({ fi: "Ilmaiset työkalut", en: "Free tools" }, locale)}</h1>
        <p className="mt-4 text-mute">
          {loc(
            {
              fi: "Oikeita tarkistuksia, ei tekaistuja laskureita. Laajempi lista syntyy kirjautuneessa haussa.",
              en: "Real checks, not fake calculators. A wider list comes from a signed-in search.",
            },
            locale,
          )}
        </p>
        <div className="mt-10 grid gap-4">
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} className="border border-line bg-panel p-5 hover:border-line-strong">
              <h2 className="text-lg font-medium">{loc(t.title, locale)}</h2>
              <p className="mt-2 text-sm text-mute">{loc(t.body, locale)}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
