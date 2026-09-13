import { SITE_DESCRIPTION, SITE_EMAIL, SITE_LEGAL_NAME, SITE_NAME, absUrl } from "./site.ts";
import { FAQ_ITEMS } from "@/lib/content/faq.ts";
import { loc } from "@/lib/content/locale.ts";
import type { Locale } from "@/lib/i18n";
import { PLANS } from "@/lib/norr/platform.ts";

export function organizationSchema(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: origin || undefined,
    email: SITE_EMAIL,
    description: SITE_DESCRIPTION,
    brand: { "@type": "Brand", name: SITE_NAME },
    sameAs: ["https://www.cariointel.com", "https://www.tajupalvelut.com"],
  };
}

export function softwareSchema(origin: string) {
  const offers = Object.values(PLANS).map((p) => ({
    "@type": "Offer",
    name: p.label,
    price: String(p.priceEur),
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  }));
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: origin || undefined,
    offers,
  };
}

export function websiteSchema(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: origin || undefined,
    publisher: { "@type": "Organization", name: SITE_NAME },
  };
}

export function breadcrumbSchema(origin: string, crumbs: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.path, origin) || c.path,
    })),
  };
}

export function faqSchema(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: loc(item.q, locale),
      acceptedAnswer: { "@type": "Answer", text: loc(item.a, locale) },
    })),
  };
}

export function articleSchema(opts: {
  origin: string;
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.description,
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: absUrl(opts.path, opts.origin) || opts.path,
  };
}
