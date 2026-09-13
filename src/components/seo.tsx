import { Link } from "@tanstack/react-router";
import { loc } from "@/lib/content/locale.ts";
import type { Localized } from "@/lib/content/locale.ts";
import { useI18n } from "@/lib/i18n";

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="text-xs text-faint" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {item.to ? (
              <a href={item.to} className="hover:text-ink">
                {item.label}
              </a>
            ) : (
              <span className="text-mute">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function RelatedLinks({ items }: { items: Array<{ path: string; label: Localized<string> | string }> }) {
  const { locale } = useI18n();
  if (!items.length) return null;
  return (
    <aside className="mt-12 border-t border-line pt-8">
      <h2 className="text-sm font-medium">{loc({ fi: "Aiheeseen liittyvää", en: "Related", sv: "Relaterat" }, locale)}</h2>
      <ul className="mt-3 grid gap-2 text-sm">
        {items.map((item) => {
          const label = typeof item.label === "string" ? item.label : loc(item.label, locale);
          return (
            <li key={item.path}>
              <a href={item.path} className="text-mute hover:text-ink">
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function CtaBand({
  title,
  body,
  action,
  href,
}: {
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <section className="panel mt-12 p-6 md:p-8">
      <h2 className="title">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-mute">{body}</p>
      {href === "/login" ? (
        <Link to="/login" className="cta mt-5">
          {action}
        </Link>
      ) : (
        <a href={href} className="cta mt-5">
          {action}
        </a>
      )}
    </section>
  );
}
