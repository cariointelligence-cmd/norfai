import type { WebsiteIntel } from "./targeting/website.ts";

export type WebsiteObservation = {
  id: string;
  kind: "TECHNICAL_FACT" | "SALES_INFERENCE";
  label: string;
  evidence: string;
};

export type WebsiteOpportunity = {
  observations: WebsiteOpportunityItem[];
  summary: string | null;
};

export type WebsiteOpportunityItem = {
  id: string;
  fact: string;
  inference: string;
};

export function websiteObservations(w: WebsiteIntel | null | undefined): WebsiteObservation[] {
  if (!w) return [];
  const out: WebsiteObservation[] = [];
  const fact = (id: string, label: string, evidence: string) =>
    out.push({ id, kind: "TECHNICAL_FACT", label, evidence });
  const inf = (id: string, label: string, evidence: string) =>
    out.push({ id, kind: "SALES_INFERENCE", label, evidence });

  if (w.https === false) fact("https", "No HTTPS", "The crawled URL was not served over HTTPS.");
  if (w.hasViewport === false) fact("viewport", "No viewport meta", "The HTML has no viewport meta tag.");
  if (w.hasTitle === false) fact("title", "Missing title", "The public page has no usable title.");
  if (w.hasMetaDescription === false) fact("meta", "Missing meta description", "No meta description on the crawled page.");
  if (w.hasH1 === false) fact("h1", "No H1", "The crawled page has no H1.");
  if (w.cms.length) fact("cms", `CMS: ${w.cms.join(", ")}`, `Detected from public HTML: ${w.cms.join(", ")}.`);
  if (w.frameworks.length) fact("fw", `Framework: ${w.frameworks.join(", ")}`, `Detected from public HTML.`);
  if (w.tech.includes("jquery") && !w.frameworks.length) fact("jquery", "jQuery without a modern framework", "Public HTML includes jQuery and no detected modern framework.");
  if (w.ecommerce) fact("ecom", "Ecommerce markers", "Public HTML includes commerce markers.");
  if (w.copyrightYear && w.copyrightYear <= 2016) fact("copy", `Copyright year ${w.copyrightYear}`, "Copyright year extracted from public HTML. It is not a proven last-redesign date.");
  if (w.formCount === 0) fact("form", "No form detected", "The crawled page has no HTML form.");
  if (w.contactVisible) fact("contact", "Contact path visible", "A contact path was found on the public site.");

  if (w.https === false || w.hasViewport === false || (w.copyrightYear != null && w.copyrightYear <= 2016) || w.likelyWeak) {
    inf("modernize", "Site may benefit from modernization", "Inference from measured technical facts. Not an aesthetic score and not proof of budget.");
  }
  return out;
}

export function websiteOpportunityFromIntel(w: WebsiteIntel | null | undefined): WebsiteOpportunity {
  const obs = websiteObservations(w);
  const facts = obs.filter((o) => o.kind === "TECHNICAL_FACT");
  const items: WebsiteOpportunityItem[] = facts
    .filter((f) => ["https", "viewport", "title", "meta", "jquery", "copy", "form"].includes(f.id))
    .map((f) => ({
      id: f.id,
      fact: f.label,
      inference: "Possible website or digitalization outreach angle. Not a quality score.",
    }));
  return {
    observations: items,
    summary: items.length
      ? `${items.length} measured website issue${items.length === 1 ? "" : "s"} on the public page.`
      : null,
  };
}
