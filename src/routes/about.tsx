import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";
import { organizationSchema } from "@/lib/seo/schema.ts";

const meta = pageByPath("/about")!;

export const Route = createFileRoute("/about")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/about" }),
  component: About,
});

function About() {
  const { locale, t } = useI18n();
  return (
    <MarketingPage
      crumbs={[{ label: "Norf", to: "/" }, { label: t("navAbout") }]}
      title={t("aboutTitle")}
      lead={t("aboutBody")}
      jsonLd={organizationSchema("")}
      related={[
        { path: "/guides/website-quality-methodology", label: { fi: "Menetelmä", en: "Methodology" } },
        { path: "/faq", label: { fi: "UKK", en: "FAQ" } },
      ]}
    >
      <p>
        {loc(
          {
            fi: "Norf lukee virallisia yritysrekistereitä ja yritysten omia sivuja. Jokaisella kentällä on lähde. Emme myy vanhentuneita tiedostoja emmekä ota yhteyttä löydettyihin ihmisiin.",
            en: "Norf reads official company registers and company-controlled websites. Every field has a source. We do not sell stale files and we do not contact the people we find.",
          },
          locale,
        )}
      </p>
      <p>
        {loc(
          {
            fi: "Mainoskulutus, liikenne ja liikevaihto näytetään vain, kun luotettava lähde ne julkaisee. Muuten kenttä on tyhjä.",
            en: "Ad spend, traffic and revenue are shown only when a reliable source publishes them. Otherwise the field is empty.",
          },
          locale,
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <a href="https://www.cariointel.com" target="_blank" rel="noreferrer" className="border border-line bg-panel p-5 hover:border-line-strong">
          <div className="text-sm font-medium text-ink">CARIO Intelligence Oy</div>
          <div className="mt-1 text-sm">cariointel.com</div>
        </a>
        <a href="https://www.tajupalvelut.com" target="_blank" rel="noreferrer" className="border border-line bg-panel p-5 hover:border-line-strong">
          <div className="text-sm font-medium text-ink">TAJU</div>
          <div className="mt-1 text-sm">tajupalvelut.com</div>
        </a>
      </div>
      <p className="text-sm">
        {t("madeBy")} {t("madeBy2")}
      </p>
    </MarketingPage>
  );
}
