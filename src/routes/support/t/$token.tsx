import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MarketingShell } from "@/components/marketing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { getPublicTicket, replyPublicTicket } from "@/lib/norr/support-actions";
import { formatWhen } from "@/lib/format";
import { marketingHead } from "@/lib/seo/head.ts";
import { toast } from "sonner";

export const Route = createFileRoute("/support/t/$token")({
  head: () => marketingHead({
    title: "Support thread | Norf",
    description: "Follow a Norf support ticket. Replies also arrive by email.",
    path: "/support",
    noindex: true,
  }),
  component: PublicTicket,
});

function PublicTicket() {
  const { token } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["public-ticket", token], queryFn: () => getPublicTicket({ data: { token } }) });
  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyPublicTicket({ data: { token, body } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setBody("");
      void qc.invalidateQueries({ queryKey: ["public-ticket", token] });
    },
  });
  if (q.isPending) return <MarketingShell><p className="px-4 py-16 text-sm text-mute">Loading…</p></MarketingShell>;
  if (!q.data || !q.data.ok) return <MarketingShell><p className="px-4 py-16 text-sm text-mute">Not found</p></MarketingShell>;
  const t = q.data.ticket;
  return (
    <MarketingShell>
      <div className="mx-auto max-w-2xl px-4 py-16 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-medium tracking-tight">{t.subject}</h1>
          <Pill tone={t.status === "open" ? "warn" : "mute"}>{t.status}</Pill>
        </div>
        {q.data.messages.map((m) => (
          <article key={m.id} className="border border-line bg-panel p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{m.authorKind} · {formatWhen(m.createdAt)}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
          </article>
        ))}
        {t.status !== "closed" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              reply.mutate();
            }}
          >
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={2} />
            <Button type="submit" disabled={reply.isPending}>Reply</Button>
          </form>
        ) : null}
      </div>
    </MarketingShell>
  );
}
