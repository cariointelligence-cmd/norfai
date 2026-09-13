import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingPage, Paragraphs } from "@/components/marketing-page";
import { loc } from "@/lib/content/locale.ts";
import { USE_CASES } from "@/lib/content/use-cases.ts";
import { useI18n } from "@/lib/i18n";
import { marketingHead } from "@/lib/seo/head.ts";
import { articleSchema } from "@/lib/seo/schema.ts";

export const Route = createFileRoute("/use-cases/$slug")({
  head: ({ params }) => {
    const u = USE_CASES.find((x) => x.slug === params.slug);
    if (!u) return marketingHead({ title: "Not found", description: "Not found", path: `/use-cases/${params.slug}`, noindex: true });
    return marketingHead({
      title: `${loc(u.h1, "en")} | Norf`,
      description: loc(u.answer, "en"),
      path: `/use-cases/${u.slug}`,
    });
  },
  component: UseCasePage,
});

function UseCasePage() {
  const { slug } = Route.useParams();
  const { locale } = useI18n();
  const u = USE_CASES.find((x) => x.slug === slug);
  if (!u) throw notFound();
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Käyttö", en: "Use cases" }, locale), to: "/use-cases" },
        { label: loc(u.title, locale) },
      ]}
      kicker={loc(u.audience, locale)}
      title={loc(u.h1, locale)}
      lead={loc(u.answer, locale)}
      jsonLd={articleSchema({ origin: "", title: loc(u.h1, locale), description: loc(u.answer, locale), path: `/use-cases/${u.slug}` })}
      related={u.related.map((s) => {
        const other = USE_CASES.find((x) => x.slug === s);
        return { path: `/use-cases/${s}`, label: other ? loc(other.title, locale) : s };
      })}
    >
      <Paragraphs lines={loc(u.body, locale)} />
    </MarketingPage>
  );
}
