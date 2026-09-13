import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPeople } from "@/lib/norr/actions";
import { Empty, Pill } from "@/components/status";

export const Route = createFileRoute("/_app/people/")({ component: People });

function People() {
  const q = useQuery({ queryKey: ["people"], queryFn: () => listPeople() });
  const rows = q.data?.people ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">Decision-makers</h1>
      <p className="text-sm text-mute">Only names extracted from public company pages (JSON-LD / HTML) or Wikidata P169. Employment is inherently uncertain.</p>
      {rows.length === 0 ? (
        <Empty title="No people stored" body="People appear after a company website is crawled or Wikidata returns a CEO. YTJ open data does not include officers." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border border-line text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>{["Name","Title","Company","Email","Confidence"].map((h) => <th key={h} className="border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((p: any) => (
                <tr key={p.id} className="border-b border-line hover:bg-panel-2">
                  <td className="px-3 py-2"><Link className="hover:underline" to="/people/$personId" params={{ personId: p.id }}>{p.full_name}</Link></td>
                  <td className="px-3 py-2 text-mute">{p.title ?? "Not found"}</td>
                  <td className="px-3 py-2"><Link className="hover:underline" to="/companies/$companyId" params={{ companyId: p.company_id }}>{p.company_name}</Link></td>
                  <td className="px-3 py-2 text-xs">{p.work_email ?? "Not found"} {p.work_email_class === "inferred" ? <Pill tone="warn">inferred</Pill> : null}</td>
                  <td className="px-3 py-2 font-mono">{p.confidence ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
