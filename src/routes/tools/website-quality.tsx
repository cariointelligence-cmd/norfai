import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { MarketingPage } from "@/components/marketing-page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { loc } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";
import { checkWebsiteQuality } from "@/lib/norr/public";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/tools/website-quality")!;

export const Route = createFileRoute("/tools/website-quality")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/tools/website-quality" }),
  component: WebsiteQualityTool,
});

function WebsiteQualityTool() {
  const { locale } = useI18n();
  const [url, setUrl] = useState("");
  const q = useMutation({ mutationFn: () => checkWebsiteQuality({ data: { url } }) });
  const r = q.data?.ok ? q.data : null;
  return (
    <MarketingPage
      crumbs={[
        { label: "Norf", to: "/" },
        { label: loc({ fi: "Työkalut", en: "Tools" }, locale), to: "/tools" },
        { label: loc({ fi: "Sivuston laatu", en: "Website quality" }, locale) },
      ]}
      title={loc({ fi: "Sivuston laadun tarkistus", en: "Website quality checker" }, locale)}
      lead={loc(
        {
          fi: "Pisteytys tulee julkisesta HTML:stä. Liikennettä ja mainoskulutusta ei arvata.",
          en: "The score comes from public HTML. Traffic and ad spend are not guessed.",
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
          <Field label="Website">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.fi" />
          </Field>
        </div>
        <Button type="submit" disabled={q.isPending || !url.trim()}>
          {q.isPending ? loc({ fi: "Tarkistetaan", en: "Checking" }, locale) : loc({ fi: "Tarkista", en: "Check" }, locale)}
        </Button>
      </form>
      {q.data && !q.data.ok ? <p className="text-sm text-bad">{q.data.error}</p> : null}
      {r ? (
        <dl className="grid gap-3 border border-line bg-panel p-5 text-sm text-ink sm:grid-cols-2">
          <div><dt className="text-faint">Website quality</dt><dd className="font-mono text-2xl">{r.score ?? "Not found"}</dd></div>
          <div><dt className="text-faint">SEO</dt><dd className="font-mono text-2xl">{r.seoScore ?? "Not found"}</dd></div>
          <div><dt className="text-faint">Digital maturity</dt><dd>{r.digitalMaturity ?? "Not found"}</dd></div>
          <div><dt className="text-faint">Band</dt><dd>{r.band ?? "Not found"}</dd></div>
          <div><dt className="text-faint">HTTPS</dt><dd>{r.https ? "Yes" : "No"}</dd></div>
          <div><dt className="text-faint">Visible ad tags</dt><dd>{r.pixels.length ? r.pixels.join(", ") : "Not detected"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-faint">Notes</dt><dd>{r.notes.length ? r.notes.join(". ") : "No issues recorded."}</dd></div>
        </dl>
      ) : null}
      <p>
        {loc(
          {
            fi: "Säännöt ovat julkiset menetelmäsivulla. Listaa yrityksiä, ei yksittäisiä URL-osoitteita, työtilassa.",
            en: "The rules are public on the methodology page. List companies, not single URLs, in the workspace.",
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
