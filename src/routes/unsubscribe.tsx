import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing";
import { Button } from "@/components/ui/button";
import { lookupUnsubscribe, publicUnsubscribe } from "@/lib/norr/mail-actions";
import { marketingHead } from "@/lib/seo/head.ts";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === "string" ? s.token : "" }),
  head: () => marketingHead({
    title: "Unsubscribe | Norf",
    description: "Stop Norf reminder emails. Transactional billing and support mail still arrive.",
    path: "/unsubscribe",
    noindex: true,
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const q = useQuery({
    queryKey: ["unsub", token],
    queryFn: () => lookupUnsubscribe({ data: { token } }),
    enabled: Boolean(token),
  });
  const act = useMutation({
    mutationFn: () => publicUnsubscribe({ data: { token, reason: "user" } }),
  });
  return (
    <MarketingShell>
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-3xl font-medium tracking-tight">Unsubscribe</h1>
        <p className="mt-4 text-sm text-mute">
          This stops reminder and quota notes. Billing receipts and support replies still arrive.
        </p>
        {!token ? <p className="mt-6 text-sm">Missing link.</p> : null}
        {q.data && !q.data.ok ? <p className="mt-6 text-sm">This link is not valid.</p> : null}
        {q.data && q.data.ok && !act.data ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm">Stop notes to {q.data.email}?</p>
            <Button onClick={() => act.mutate()} disabled={act.isPending}>Unsubscribe</Button>
          </div>
        ) : null}
        {act.data?.ok ? <p className="mt-6 text-sm">Done. You will not get reminder mail at {act.data.email}.</p> : null}
      </div>
    </MarketingShell>
  );
}
