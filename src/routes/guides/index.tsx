import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing";
import { GUIDES } from "@/lib/content/guides.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/guides")!;

export const Route = createFileRoute("/guides/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/guides" }),
  component: GuideIndex,
});

function GuideIndex() {
  const { locale } = useI18n();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{loc({ fi: "Oppaat", en: "Guides" }, locale)}</h1>
        <p className="mt-4 text-mute">
          {loc(
            {
              fi: "Vastaus ensin. Sitten tapa, jolla Norf sen tekee. Ei keksittyjä tilastoja.",
              en: "Answer first. Then the way Norf does it. No invented statistics.",
            },
            locale,
          )}
        </p>
        <div className="mt-10 divide-y divide-line border border-line">
          {GUIDES.map((g) => (
            <Link key={g.slug} to="/guides/$slug" params={{ slug: g.slug }} className="block px-4 py-5 hover:bg-panel">
              <div className="text-lg font-medium">{loc(g.title, locale)}</div>
              <p className="mt-1 text-sm text-mute">{loc(g.answer, locale)}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
