import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { getMyTicket, replyMyTicket } from "@/lib/norr/support-actions";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tickets/$ticketId")({ component: TicketDetail });

function TicketDetail() {
  const { ticketId } = Route.useParams();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-ticket", ticketId], queryFn: () => getMyTicket({ data: { ticketId } }) });
  const [body, setBody] = useState("");
  const reply = useMutation({
    mutationFn: () => replyMyTicket({ data: { ticketId, body } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setBody("");
      void qc.invalidateQueries({ queryKey: ["my-ticket", ticketId] });
    },
  });
  if (q.isPending) return <p className="text-sm text-mute">…</p>;
  if (!q.data || !q.data.ok) return <p className="text-sm text-mute">Not found</p>;
  const t = q.data.ticket;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/tickets" className="text-sm text-mute hover:text-ink">←</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">{t.subject}</h1>
          <p className="mt-1 font-mono text-[11px] text-mute">{formatWhen(t.createdAt, "-", locale)}</p>
        </div>
        <Pill tone={t.status === "open" ? "warn" : t.status === "pending" ? "info" : "mute"}>{t.status}</Pill>
      </div>
      <div className="space-y-3">
        {q.data.messages.map((m) => (
          <article key={m.id} className="border border-line bg-panel p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-faint">
              {m.authorKind} · {formatWhen(m.createdAt, "-", locale)}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
          </article>
        ))}
      </div>
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
  );
}
