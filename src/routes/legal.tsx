import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing-page";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/legal")!;

export const Route = createFileRoute("/legal")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/legal" }),
  component: Legal,
});

function Legal() {
  return (
    <MarketingPage
      crumbs={[{ label: "Norf", to: "/" }, { label: "Privacy" }]}
      title="Privacy"
      lead="Norf stores professional B2B data collected from public registers and company-controlled websites."
    >
      <p>Personal data is limited to names, titles and published work contacts. Automated outreach is out of scope. You must have a lawful basis for any outreach you do yourself.</p>
      <p>Controllers: CARIO Intelligence Oy and TAJU, operating as DAZVERIO in Fuusio. Contact cariointelligence@gmail.com.</p>
      <p>Workspaces, saved searches and company lists are private. They are not published as SEO pages.</p>
    </MarketingPage>
  );
}
