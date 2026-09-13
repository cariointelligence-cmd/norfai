import type { Locale } from "@/lib/i18n";
import { absUrl } from "./site.ts";

export function marketingHead(opts: {
  title: string;
  description: string;
  path: string;
  locale?: Locale;
  noindex?: boolean;
  origin?: string;
}) {
  const url = absUrl(opts.path, opts.origin ?? "");
  const robots = opts.noindex ? "noindex, nofollow" : "index, follow";
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { name: "robots", content: robots },
      { name: "googlebot", content: robots },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function privateHead(title = "Norf") {
  return {
    meta: [
      { title },
      { name: "robots", content: "noindex, nofollow" },
      { name: "googlebot", content: "noindex, nofollow" },
    ],
  };
}
