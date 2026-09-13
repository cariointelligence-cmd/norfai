import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing";
import { JsonLd } from "@/components/seo";
import { getPublishedPost } from "@/lib/norr/public";
import { articleSchema } from "@/lib/seo/schema.ts";
import { marketingHead } from "@/lib/seo/head.ts";

export const Route = createFileRoute("/news/$slug")({
  head: ({ params }) =>
    marketingHead({
      title: `${String(params.slug ?? "note").replace(/-/g, " ")} | Norf news`.slice(0, 70),
      description: "Product notes and research from Norf. No invented statistics. Empty fields stay empty.",
      path: `/news/${params.slug}`,
    }),
  component: NewsPost,
});

function NewsPost() {
  const { slug } = Route.useParams();
  const q = useQuery({ queryKey: ["news-post", slug], queryFn: () => getPublishedPost({ data: { slug } }) });
  if (!q.data) return <MarketingShell><p className="px-4 py-16 text-sm text-mute">Loading…</p></MarketingShell>;
  if (!q.data.ok) return <MarketingShell><p className="px-4 py-16 text-sm text-mute">Not found</p></MarketingShell>;
  const p = q.data.post;
  return (
    <MarketingShell>
      <JsonLd
        data={articleSchema({
          origin: "",
          title: p.seo_title || p.title,
          description: p.seo_description || p.excerpt,
          path: `/news/${p.slug}`,
        })}
      />
      <article className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-[11px] uppercase tracking-[0.16em] text-faint">{p.locale}</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">{p.title}</h1>
        <p className="mt-4 text-mute">{p.excerpt}</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-ink whitespace-pre-wrap">{p.body}</div>
      </article>
    </MarketingShell>
  );
}
