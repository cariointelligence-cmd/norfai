import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { createMyTicket, listMyTickets } from "@/lib/norr/support-actions";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tickets/")({ component: TicketsPage });

function tone(status: string): "good" | "warn" | "mute" | "info" {
  if (status === "open") return "warn";
  if (status === "pending") return "info";
  return "mute";
}

function TicketsPage() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Tuki",
        body: "Avoimet ja vastatut tukipyynnöt. Vastaus tulee myös sähköpostiin.",
        subject: "Aihe",
        message: "Viesti",
        send: "Lähetä",
        empty: "Ei tikettejä vielä.",
        sent: "Tukipyyntö avattu",
      },
      en: {
        title: "Support",
        body: "Open and answered requests. Replies also arrive by email.",
        subject: "Subject",
        message: "Message",
        send: "Send",
        empty: "No tickets yet.",
        sent: "Request opened",
      },
      sv: {
        title: "Support",
        body: "Öppna och besvarade ärenden. Svar kommer också till e-post.",
        subject: "Ämne",
        message: "Meddelande",
        send: "Skicka",
        empty: "Inga ärenden ännu.",
        sent: "Ärende öppnat",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-tickets"], queryFn: () => listMyTickets() });
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useMutation({
    mutationFn: () => createMyTicket({ data: { subject, body, locale } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message(copy.sent);
      setSubject("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
  });
  const tickets = q.data?.tickets ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">{copy.body}</p>
      </div>
      <form
        className="max-w-xl space-y-3 border border-line bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={copy.subject}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={4} />
        </Field>
        <Field label={copy.message}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={8} />
        </Field>
        <Button type="submit" disabled={create.isPending}>{copy.send}</Button>
      </form>
      <div className="border border-line">
        {tickets.length === 0 ? <p className="px-3 py-4 text-sm text-mute">{copy.empty}</p> : null}
        {tickets.map((t) => (
          <Link key={t.id} to="/tickets/$ticketId" params={{ ticketId: t.id }} className="flex items-center justify-between gap-3 border-b border-line px-3 py-3 last:border-0 hover:bg-panel">
            <div>
              <div className="text-sm">{t.subject}</div>
              <div className="font-mono text-[11px] text-mute">{formatWhen(t.updatedAt, "-", locale)}</div>
            </div>
            <Pill tone={tone(t.status)}>{t.status}</Pill>
          </Link>
        ))}
      </div>
    </div>
  );
}
