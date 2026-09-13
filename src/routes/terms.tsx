import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/terms")!;

export const Route = createFileRoute("/terms")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/terms" }),
  component: Terms,
});

function Terms() {
  return (
    <MarketingPage
      crumbs={[{ label: "Norf", to: "/" }, { label: "Terms" }]}
      title="Terms"
      lead="Norf is provided for lawful B2B research. You must have a lawful basis for processing professional contacts."
    >
      <p>Free plan is limited to 50 searches per month. Paid plans renew until cancelled via Stripe. Prices are exclusive of VAT for B2B customers.</p>
      <p>Norf does not guarantee a specific search-engine ranking, a specific number of matching companies, or that every register field is populated. Empty means not found.</p>
      <p>You may not use Norf to spam, scrape paywalled sources, or invent records for resale.</p>
    </MarketingPage>
  );
}
