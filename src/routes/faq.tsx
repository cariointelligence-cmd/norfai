import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";
import { FAQ_ITEMS } from "@/lib/content/faq.ts";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { faqSchema } from "@/lib/seo/schema.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/faq")!;

export const Route = createFileRoute("/faq")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/faq" }),
  component: FaqPage,
});

function FaqPage() {
  const { locale } = useI18n();
  return (
    <MarketingPage
      crumbs={[{ label: "Norf", to: "/" }, { label: loc({ fi: "UKK", en: "FAQ" }, locale) }]}
      title={loc({ fi: "Kysymyksiä Norfista", en: "Questions about Norf" }, locale)}
      lead={loc(
        {
          fi: "Lyhyet vastaukset. Jos kenttä on tyhjä tuotteessa, se tarkoittaa Not found.",
          en: "Short answers. If a field is empty in the product, it means Not found.",
        },
        locale,
      )}
      jsonLd={faqSchema(locale)}
    >
      <div className="space-y-6">
        {FAQ_ITEMS.map((item) => (
          <section key={loc(item.q, locale)} className="border-b border-line pb-5 last:border-0">
            <h2 className="text-base font-medium text-ink">{loc(item.q, locale)}</h2>
            <p className="mt-2">{loc(item.a, locale)}</p>
          </section>
        ))}
      </div>
    </MarketingPage>
  );
}
