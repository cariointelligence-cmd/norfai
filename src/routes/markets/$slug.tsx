import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingPage, Paragraphs } from "@/components/marketing-page";
import { loc } from "@/lib/content/locale.ts";
import { MARKETS } from "@/lib/content/markets.ts";
import { useI18n } from "@/lib/i18n";
import { marketingHead } from "@/lib/seo/head.ts";
import { articleSchema } from "@/lib/seo/schema.ts";

export const Route = createFileRoute("/markets/$slug")({
  head: ({ params }) => {
    const m = MARKETS.find((x) => x.slug === params.slug);
    if (!m) return marketingHead({ title: "Not found", description: "Not found", path: `/markets/${params.slug}`, noindex: true });
    return marketingHead({
      title: `${loc(m.h1, "en")} | Norf`,
      description: loc(m.answer, "en"),
      path: `/markets/${m.slug}`,
    });
  },
  component: MarketPage,
});

function MarketPage() {
  const { slug } = Route.useParams();
  const { locale } = useI18n();
  const m = MARKETS.find((x) => x.slug === slug);
  if (!m) throw notFound();
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Sijainnit", en: "Locations" }, locale), to: "/locations" },
        { label: loc(m.title, locale) },
      ]}
      title={loc(m.h1, locale)}
      lead={loc(m.answer, locale)}
      jsonLd={articleSchema({ origin: "", title: loc(m.h1, locale), description: loc(m.answer, locale), path: `/markets/${m.slug}` })}
      related={[
        { path: `/locations/${m.city}`, label: m.city },
        { path: `/industries/${m.industry}`, label: m.industry },
      ]}
    >
      <Paragraphs lines={loc(m.body, locale)} />
    </MarketingPage>
  );
}
