import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing";
import { useI18n } from "@/lib/i18n";
import { listPublishedPosts } from "@/lib/norr/public";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";

const meta = pageByPath("/news")!;

export const Route = createFileRoute("/news/")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/news" }),
  component: NewsIndex,
});

function NewsIndex() {
  const { t, locale } = useI18n();
  const q = useQuery({ queryKey: ["news", locale], queryFn: () => listPublishedPosts({ data: { locale } }) });
  const posts = q.data?.posts ?? [];
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-medium tracking-tight">{t("newsTitle")}</h1>
        <div className="mt-10 divide-y divide-line border border-line">
          {posts.length === 0 ? <p className="px-4 py-8 text-sm text-mute">{t("newsEmpty")}</p> : null}
          {posts.map((p) => (
            <Link key={p.id} to="/news/$slug" params={{ slug: p.slug }} className="block px-4 py-5 hover:bg-panel">
              <div className="text-lg font-medium">{p.title}</div>
              <p className="mt-1 text-sm text-mute">{p.excerpt}</p>
            </Link>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
