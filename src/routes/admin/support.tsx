import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { adminGetTicket, adminListTickets, adminOpenTicket, adminReplyTicket, adminSetTicket } from "@/lib/norr/support-actions";
import { adminListUsers } from "@/lib/norr/actions";
import { formatWhen } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/support")({ component: AdminSupport });

function AdminSupport() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState("");
  const [reply, setReply] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"support" | "request">("support");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [userQ, setUserQ] = useState("");
  const list = useQuery({ queryKey: ["admin-tickets", status], queryFn: () => adminListTickets({ data: { status } }) });
  const users = useQuery({
    queryKey: ["admin-users", userQ],
    queryFn: () => adminListUsers({ data: { q: userQ } }),
  });
  const detail = useQuery({
    queryKey: ["admin-ticket", selected],
    queryFn: () => adminGetTicket({ data: { ticketId: selected } }),
    enabled: Boolean(selected),
  });
  const send = useMutation({
    mutationFn: () => adminReplyTicket({ data: { ticketId: selected, body: reply, status: "pending" } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message("Reply queued to the customer email");
      setReply("");
      void qc.invalidateQueries({ queryKey: ["admin-ticket", selected] });
      void qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });
  const close = useMutation({
    mutationFn: () => adminSetTicket({ data: { ticketId: selected, status: "closed" } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      void qc.invalidateQueries({ queryKey: ["admin-ticket", selected] });
    },
  });
  const open = useMutation({
    mutationFn: () => adminOpenTicket({ data: { email, name, subject, body, kind, priority } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message("Ticket opened. Customer was emailed.");
      setSubject("");
      setBody("");
      setSelected(r.ticket.id);
      setStatus("all");
      void qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });
  const tickets = list.data && list.data.ok ? list.data.tickets : [];
  const openCount = useMemo(() => tickets.filter((t) => t.status !== "closed").length, [tickets]);
  const t = detail.data && detail.data.ok ? detail.data : null;
  const userRows = users.data?.ok ? users.data.users.slice(0, 12) : [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-mute">
          Open a ticket or request with a customer. They get the email and can reply in the same thread.
        </p>
      </div>
      <section className="border border-line bg-panel p-4 md:p-5">
        <h2 className="text-sm font-medium">Open with a customer</h2>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            open.mutate();
          }}
        >
          <Field label="Customer email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="customer@company.fi"
            />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Find account">
            <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Search users" />
          </Field>
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "support" | "request")}>
              <option value="support">Support</option>
              <option value="request">Request / requirement</option>
            </Select>
          </Field>
          {userRows.length > 0 ? (
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {userRows.map((u: { id: string; email: string; name: string }) => (
                <button
                  key={u.id}
                  type="button"
                  className="border border-line px-2 py-1 text-xs hover:bg-canvas"
                  onClick={() => {
                    setEmail(u.email);
                    setName(u.name);
                  }}
                >
                  {u.email}
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={4} />
          </Field>
          <div className="md:col-span-2">
            <Field label="First message">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} required minLength={8} />
            </Field>
          </div>
          <div>
            <Button type="submit" size="sm" disabled={open.isPending}>Open ticket</Button>
          </div>
        </form>
      </section>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </Select>
        </Field>
        <div className="text-sm text-mute">{openCount} in this view</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="border border-line">
          {tickets.length === 0 ? <p className="px-3 py-4 text-sm text-mute">No tickets.</p> : null}
          {tickets.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row.id)}
              className={`block w-full border-b border-line px-3 py-3 text-left last:border-0 ${selected === row.id ? "bg-panel" : "hover:bg-panel"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{row.subject}</span>
                <Pill tone={row.status === "open" ? "warn" : row.status === "pending" ? "info" : "mute"}>{row.status}</Pill>
              </div>
              <div className="mt-1 font-mono text-[11px] text-mute">
                {row.origin === "admin" ? "admin · " : ""}{row.kind === "request" ? "request · " : ""}{row.email} · {formatWhen(row.updatedAt)}
              </div>
            </button>
          ))}
        </div>
        <div className="border border-line p-4">
          {!t ? <p className="text-sm text-mute">Pick a ticket.</p> : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-medium">{t.ticket.subject}</h2>
                <p className="mt-1 text-sm text-mute">
                  {t.ticket.name || "-"} · {t.ticket.email}
                  {t.ticket.origin === "admin" ? " · opened by admin" : ""}
                  {t.ticket.kind === "request" ? " · request" : ""}
                </p>
              </div>
              {t.messages.map((m) => (
                <article key={m.id} className="border border-line bg-panel p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{m.authorKind} · {formatWhen(m.createdAt)}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
                </article>
              ))}
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the customer" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={send.isPending || reply.trim().length < 2} onClick={() => send.mutate()}>Send reply</Button>
                <Button size="sm" variant="secondary" disabled={close.isPending} onClick={() => close.mutate()}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
