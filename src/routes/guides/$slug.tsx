import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingPage, Paragraphs } from "@/components/marketing-page";
import { GUIDES } from "@/lib/content/guides.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { marketingHead } from "@/lib/seo/head.ts";
import { articleSchema } from "@/lib/seo/schema.ts";

export const Route = createFileRoute("/guides/$slug")({
  head: ({ params }) => {
    const g = GUIDES.find((x) => x.slug === params.slug);
    if (!g) return marketingHead({ title: "Not found", description: "Not found", path: `/guides/${params.slug}`, noindex: true });
    return marketingHead({
      title: `${loc(g.h1, "en")} | Norf`,
      description: loc(g.answer, "en"),
      path: `/guides/${g.slug}`,
    });
  },
  component: GuidePage,
});

function GuidePage() {
  const { slug } = Route.useParams();
  const { locale } = useI18n();
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw notFound();
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Oppaat", en: "Guides" }, locale), to: "/guides" },
        { label: loc(g.title, locale) },
      ]}
      title={loc(g.h1, locale)}
      lead={loc(g.answer, locale)}
      jsonLd={articleSchema({ origin: "", title: loc(g.h1, locale), description: loc(g.answer, locale), path: `/guides/${g.slug}` })}
      related={g.related.map((path) => ({ path, label: path }))}
    >
      <Paragraphs lines={loc(g.body, locale)} />
    </MarketingPage>
  );
}
