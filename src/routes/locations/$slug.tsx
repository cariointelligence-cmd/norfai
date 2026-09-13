import { createFileRoute, notFound } from "@tanstack/react-router";
import { MarketingPage, Paragraphs } from "@/components/marketing-page";
import { loc } from "@/lib/content/locale.ts";
import { LOCATIONS } from "@/lib/content/locations.ts";
import { useI18n } from "@/lib/i18n";
import { marketingHead } from "@/lib/seo/head.ts";
import { articleSchema } from "@/lib/seo/schema.ts";

export const Route = createFileRoute("/locations/$slug")({
  head: ({ params }) => {
    const l = LOCATIONS.find((x) => x.slug === params.slug);
    if (!l) return marketingHead({ title: "Not found", description: "Not found", path: `/locations/${params.slug}`, noindex: true });
    return marketingHead({
      title: `${loc(l.h1, "en")} | Norf`,
      description: loc(l.answer, "en"),
      path: `/locations/${l.slug}`,
    });
  },
  component: LocationPage,
});

function LocationPage() {
  const { slug } = Route.useParams();
  const { locale } = useI18n();
  const l = LOCATIONS.find((x) => x.slug === slug);
  if (!l) throw notFound();
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Sijainnit", en: "Locations" }, locale), to: "/locations" },
        { label: loc(l.title, locale) },
      ]}
      title={loc(l.h1, locale)}
      lead={loc(l.answer, locale)}
      jsonLd={articleSchema({ origin: "", title: loc(l.h1, locale), description: loc(l.answer, locale), path: `/locations/${l.slug}` })}
      related={l.industries.map((s) => ({ path: `/industries/${s}`, label: s }))}
    >
      <Paragraphs lines={loc(l.body, locale)} />
    </MarketingPage>
  );
}
