import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listCompanies } from "@/lib/norr/actions";
import { Empty } from "@/components/status";
import { Button } from "@/components/ui/button";

export function CountryDesk({ country, title, body }: { country: "SE" | "NO"; title: string; body: string }) {
  const q = useQuery({
    queryKey: ["companies", country],
    queryFn: () => listCompanies({ data: { country, limit: 80 } }),
  });
  const rows = q.data?.companies ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-mute">{body}</p>
      </div>
      <div className="flex gap-2">
        <Link to="/search/new">
          <Button>New search</Button>
        </Link>
      </div>
      {!rows.length ? (
        <Empty title="No companies yet" body="Start a search with this country. Finnish registers are not used here." />
      ) : (
        <ul className="divide-y divide-line border border-line">
          {rows.map((c: { id: string; name: string; municipality?: string | null; website?: string | null; general_email?: string | null }) => (
            <li key={c.id} className="px-3 py-2 text-sm">
              <Link to="/companies/$companyId" params={{ companyId: c.id }} className="font-medium">
                {c.name}
              </Link>
              <p className="text-xs text-mute">{[c.municipality, c.website, c.general_email].filter(Boolean).join(" · ") || "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
