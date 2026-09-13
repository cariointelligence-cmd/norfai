import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPerson } from "@/lib/norr/actions";
import { Pill, ProvenanceBadge } from "@/components/status";

export const Route = createFileRoute("/_app/people/$personId")({ component: Person });

function Person() {
  const { personId } = Route.useParams();
  const q = useQuery({ queryKey: ["person", personId], queryFn: () => getPerson({ data: { id: personId } }) });
  if (!q.data) return <p className="text-sm text-mute">Loading…</p>;
  if (!q.data.ok) return <p className="text-sm text-bad">{q.data.error}</p>;
  const p = q.data.person;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">{String(p.full_name)}</h1>
      <p className="text-sm text-mute">{String(p.title ?? "Title not found")}</p>
      {q.data.company ? (
        <p className="text-sm">
          Company: <Link className="underline" to="/companies/$companyId" params={{ companyId: q.data.company.id }}>{q.data.company.name}</Link>
        </p>
      ) : null}
      <div className="flex gap-2">
        <Pill>confidence {String(p.confidence ?? "-")}</Pill>
        <Pill tone="warn">employment uncertain</Pill>
      </div>
      <dl className="border border-line bg-panel divide-y divide-line">
        {[
          ["Source page", p.source_page],
          ["Profile URL", p.profile_url],
          ["Work email", p.work_email],
          ["Work phone", p.work_phone],
          ["Evidence", p.evidence],
          ["Discovered", p.discovered_at],
        ].map(([k, v]) => (
          <div key={String(k)} className="grid gap-1 px-4 py-3 md:grid-cols-[160px_1fr]">
            <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">{String(k)}</dt>
            <dd className="text-sm break-all">{v == null || v === "" ? "Not found" : String(v)}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h2 className="mb-2 text-sm font-medium">Contacts</h2>
        {q.data.contacts.length === 0 ? <p className="text-sm text-mute">Not found.</p> : q.data.contacts.map((c: any) => (
          <div key={String(c.id)} className="flex justify-between border border-line px-3 py-2 text-sm">
            <span className="font-mono text-xs">{String(c.value)}</span>
            <ProvenanceBadge status={String(c.classification)} />
          </div>
        ))}
      </div>
    </div>
  );
}
