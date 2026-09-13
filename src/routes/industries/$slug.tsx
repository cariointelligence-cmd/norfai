import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingPage, Paragraphs } from "@/components/marketing-page";
import { INDUSTRIES } from "@/lib/content/industries.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { marketingHead } from "@/lib/seo/head.ts";
import { articleSchema } from "@/lib/seo/schema.ts";

export const Route = createFileRoute("/industries/$slug")({
  head: ({ params }) => {
    const i = INDUSTRIES.find((x) => x.slug === params.slug);
    if (!i) return marketingHead({ title: "Not found", description: "Not found", path: `/industries/${params.slug}`, noindex: true });
    return marketingHead({
      title: `${loc(i.h1, "en")} | Norf`,
      description: loc(i.answer, "en"),
      path: `/industries/${i.slug}`,
    });
  },
  component: IndustryPage,
});

function IndustryPage() {
  const { slug } = Route.useParams();
  const { locale } = useI18n();
  const i = INDUSTRIES.find((x) => x.slug === slug);
  if (!i) throw notFound();
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Toimialat", en: "Industries" }, locale), to: "/industries" },
        { label: loc(i.title, locale) },
      ]}
      title={loc(i.h1, locale)}
      lead={loc(i.answer, locale)}
      jsonLd={articleSchema({ origin: "", title: loc(i.h1, locale), description: loc(i.answer, locale), path: `/industries/${i.slug}` })}
      related={[
        ...i.related.map((s) => ({ path: `/industries/${s}`, label: s })),
        ...i.cities.map((c) => ({ path: `/locations/${c}`, label: c })),
      ]}
    >
      <Paragraphs lines={loc(i.body, locale)} />
    </MarketingPage>
  );
}
