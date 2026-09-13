import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing";
import { Breadcrumbs, CtaBand, JsonLd, RelatedLinks } from "@/components/seo";
import { LANDING } from "@/lib/content/landing.ts";
import { loc, type Localized } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";

export function MarketingPage({
  crumbs,
  kicker,
  title,
  lead,
  jsonLd,
  related,
  children,
}: {
  crumbs: Array<{ label: string; to?: string }>;
  kicker?: string;
  title: string;
  lead: string;
  jsonLd?: unknown | unknown[];
  related?: Array<{ path: string; label: Localized<string> | string }>;
  children?: ReactNode;
}) {
  const { locale } = useI18n();
  const blocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  return (
    <MarketingShell>
      {blocks.map((b, i) => (
        <JsonLd key={i} data={b} />
      ))}
      <article className="wrap section max-w-3xl">
        <Breadcrumbs items={crumbs} />
        {kicker ? <p className="kicker mt-6">{kicker}</p> : null}
        <h1 className={`${kicker ? "mt-3" : "mt-6"} display`}>{title}</h1>
        <p className="lede mt-5">{lead}</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-mute">{children}</div>
        <CtaBand
          title={loc(LANDING.ctaTitle, locale)}
          body={loc(LANDING.ctaBody, locale)}
          action={loc(LANDING.heroCta, locale)}
          href="/login"
        />
        {related?.length ? <RelatedLinks items={related} /> : null}
      </article>
    </MarketingShell>
  );
}

export function Paragraphs({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((p) => (
        <p key={p.slice(0, 48)}>{p}</p>
      ))}
    </>
  );
}

export function useLoc() {
  const { locale, t } = useI18n();
  return {
    locale,
    t,
    L: <T,>(bundle: Localized<T>) => loc(bundle, locale),
  };
}
