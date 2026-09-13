import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/tools/company-finder")!;

export const Route = createFileRoute("/tools/company-finder")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/tools/company-finder" }),
  component: CompanyFinder,
});

function CompanyFinder() {
  const { locale } = useI18n();
  const [prompt, setPrompt] = useState(
    "Find Finnish construction companies in Tampere with outdated websites, revenue €1M to €10M if published, and Meta advertising tags.",
  );
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Työkalut", en: "Tools" }, locale), to: "/tools" },
        { label: loc({ fi: "Yrityshaku", en: "Company finder" }, locale) },
      ]}
      title={loc({ fi: "Kuvaile yritykset, joita haluat", en: "Describe the companies you want" }, locale)}
      lead={loc(
        {
          fi: "Norf kääntää kuvauksen suodattimiksi työtilassa. Rekisterihaku vaatii kirjautumisen, jotta kiintiö ja yksityisyys pysyvät kunnossa.",
          en: "Norf turns the description into filters in the workspace. Register search requires a sign-in so quota and privacy stay intact.",
        },
        locale,
      )}
    >
      <Field label={loc({ fi: "Kohde", en: "Target" }, locale)}>
        <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <p className="text-xs text-faint">
        {loc(
          {
            fi: "Esimerkki tallennetaan selaimeen ja avataan haussa kirjautumisen jälkeen.",
            en: "The example is stored in the browser and opened in search after you sign in.",
          },
          locale,
        )}
      </p>
      <Button
        type="button"
        onClick={() => {
          try {
            window.sessionStorage.setItem("norf-target-prompt", prompt);
          } catch {
            /* ignore */
          }
          window.location.assign("/login");
        }}
      >
        {loc({ fi: "Jatka hakuun", en: "Continue to search" }, locale)}
      </Button>
      <p>
        <Link to="/use-cases/$slug" params={{ slug: "web-design" }} className="underline">
          {loc({ fi: "Sivustotoimistot", en: "Web design" }, locale)}
        </Link>
        {" · "}
        <Link to="/guides/$slug" params={{ slug: "find-companies-by-revenue" }} className="underline">
          {loc({ fi: "Haku liikevaihdolla", en: "Search by revenue" }, locale)}
        </Link>
      </p>
    </MarketingPage>
  );
}
