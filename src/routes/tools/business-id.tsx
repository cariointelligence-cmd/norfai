import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { lookupBusinessId } from "@/lib/norr/public";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/tools/business-id")!;

export const Route = createFileRoute("/tools/business-id")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/tools/business-id" }),
  component: BusinessIdTool,
});

function BusinessIdTool() {
  const { locale } = useI18n();
  const [id, setId] = useState("");
  const q = useMutation({ mutationFn: () => lookupBusinessId({ data: { businessId: id } }) });
  const company = q.data?.ok ? q.data.company : null;
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Työkalut", en: "Tools" }, locale), to: "/tools" },
        { label: loc({ fi: "Y-tunnus", en: "Business ID" }, locale) },
      ]}
      title={loc({ fi: "Y-tunnushaku", en: "Finnish Business ID lookup" }, locale)}
      lead={loc(
        {
          fi: "Hae yhtiö virallisesta YTJ-rekisteristä. Tyhjä tulos tarkoittaa, ettei tunnusta löytynyt. Lukuja ei arvata.",
          en: "Look up a company in the official YTJ register. Empty means the ID was not found. Figures are not guessed.",
        },
        locale,
      )}
    >
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          q.mutate();
        }}
      >
        <div className="flex-1">
          <Field label="Y-tunnus">
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="0112038-9" />
          </Field>
        </div>
        <Button type="submit" disabled={q.isPending || !id.trim()}>
          {q.isPending ? loc({ fi: "Haetaan", en: "Looking up" }, locale) : loc({ fi: "Hae", en: "Look up" }, locale)}
        </Button>
      </form>
      {q.data && !q.data.ok ? <p className="text-sm text-bad">{q.data.error}</p> : null}
      {company ? (
        <dl className="grid gap-3 border border-line bg-panel p-5 text-sm text-ink">
          <div><dt className="text-faint">Name</dt><dd>{company.name}</dd></div>
          <div><dt className="text-faint">Business ID</dt><dd>{company.businessId ?? "Not found"}</dd></div>
          <div><dt className="text-faint">Municipality</dt><dd>{company.municipality ?? "Not found"}</dd></div>
          <div><dt className="text-faint">Industry</dt><dd>{company.industry ?? "Not found"}</dd></div>
          <div><dt className="text-faint">Founded</dt><dd>{company.foundedOn ?? "Not found"}{company.ageYears != null ? ` (${company.ageYears} years)` : ""}</dd></div>
          <div><dt className="text-faint">Website</dt><dd>{company.website ?? "Not found"}</dd></div>
        </dl>
      ) : null}
      <p>
        {loc(
          {
            fi: "Laajempi haku (sivuston laatu, mainossignaalit, kohdelista) avautuu työtilassa.",
            en: "A wider search (website quality, ad signals, a target list) opens in the workspace.",
          },
          locale,
        )}{" "}
        <Link to="/login" className="text-ink underline">
          {loc({ fi: "Hae yrityksiä", en: "Find companies" }, locale)}
        </Link>
      </p>
    </MarketingPage>
  );
}
