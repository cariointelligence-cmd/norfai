import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { loc } from "@/lib/content/locale.ts";
import { USE_CASES } from "@/lib/content/use-cases.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/use-cases")!;

export const Route = createFileRoute("/use-cases/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/use-cases" }),
  component: UseCaseIndex,
});

function UseCaseIndex() {
  const { locale } = useI18n();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{loc({ fi: "Kenelle Norf on tehty", en: "Who Norf is for" }, locale)}</h1>
        <p className="mt-4 max-w-2xl text-mute">
          {loc(
            {
              fi: "Sama tuote, eri tilanne. Valitse ostaja ja näe, millaisen listan Norf rakentaa.",
              en: "Same product, different situation. Pick a buyer and see the kind of list Norf builds.",
            },
            locale,
          )}
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {USE_CASES.map((u) => (
            <Link key={u.slug} to="/use-cases/$slug" params={{ slug: u.slug }} className="border border-line bg-panel p-6 hover:border-line-strong">
              <div className="text-[11px] uppercase tracking-[0.16em] text-faint">{loc(u.audience, locale)}</div>
              <h2 className="mt-2 text-lg font-medium">{loc(u.title, locale)}</h2>
              <p className="mt-2 text-sm text-mute">{loc(u.h1, locale)}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
