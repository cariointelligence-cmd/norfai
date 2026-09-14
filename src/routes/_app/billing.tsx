import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { startBillingPortal, startCheckout, startCreditCheckout, confirmBilling } from "@/lib/norr/actions";
import { BOOTSTRAP_QUERY } from "@/lib/client/bootstrap";
import { PLANS, formatSearchQuota, isUnlimitedQuota, perSearchFromBoot, type PlanId } from "@/lib/norr/platform";
import { CREDIT_CENTS, CREDIT_MIN_EUR, CREDIT_MIN_QTY, LEADS_PER_CREDIT_MIN, LEADS_PER_CREDIT_MAX, parseCreditQuantity } from "@/lib/norr/credits";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/billing")({ component: Billing });

function Billing() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const qc = useQueryClient();
  const boot = useQuery(BOOTSTRAP_QUERY);
  const success = search.includes("billing=success") || search.includes("credits=success");
  const [creditQty, setCreditQty] = useState(String(CREDIT_MIN_QTY));
  useEffect(() => {
    if (!success) return;
    void confirmBilling().then(() => qc.invalidateQueries({ queryKey: ["bootstrap"] }));
  }, [success, qc]);
  const checkout = useMutation({
    mutationFn: (plan: PlanId) => startCheckout({ data: { plan, origin: window.location.origin } }),
    onSuccess: (r) => {
      if (r.ok) window.location.href = r.url;
      else toast.error(r.error);
    },
  });
  const portal = useMutation({
    mutationFn: () => startBillingPortal({ data: { origin: window.location.origin } }),
    onSuccess: (r) => {
      if (r.ok) window.location.href = r.url;
      else toast.error(r.error);
    },
  });
  const buyCredits = useMutation({
    mutationFn: (credits: number) => startCreditCheckout({ data: { credits, origin: window.location.origin } }),
    onSuccess: (r) => {
      if (r.ok) window.location.href = r.url;
      else toast.error(r.error);
    },
  });
  const parsedCredits = parseCreditQuantity(creditQty);
  const plan = (boot.data?.plan ?? "free") as PlanId;
  const used = boot.data?.searchesUsed ?? 0;
  const limit = boot.data?.searchesLimit ?? 50;
  const admin = Boolean(boot.data?.isAdmin);
  const quota = admin || isUnlimitedQuota(limit) ? "Unlimited" : `${used}/${formatSearchQuota(limit)}`;
  const companiesUsed = boot.data?.companiesUsed ?? 0;
  const companiesThisPeriod = boot.data?.companiesThisPeriod ?? companiesUsed;
  const companiesLimit = boot.data?.companiesLimit ?? 400;
  const companiesMonth = boot.data?.companiesPerMonth ?? 50;
  const perSearch = perSearchFromBoot(boot.data);
  const stripeReady = Boolean(boot.data?.stripeReady);
  const paid = plan !== "free" || Boolean(boot.data?.hasStripeCustomer);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium tracking-tight">Plan</h1>
      <p className="text-sm text-mute">
        {admin ? "Admin · Unlimited" : `${PLANS[plan]?.label ?? plan} · ${quota} searches this period`}
      </p>
      {!admin ? (
        <p className="text-sm text-mute">
          Companies stored {companiesUsed}{companiesLimit >= 0 ? ` / ${companiesLimit}` : ""}.
          New this period {companiesThisPeriod}{companiesMonth < 0 ? "" : ` / ${companiesMonth}`}.
          Each search stores at most {perSearch < 0 ? "no per-search cap" : perSearch} new companies. Existing records stay.
        </p>
      ) : null}
      <p className="text-sm text-faint">Hinnat ALV 0 % (B2B). Admineilla on aina rajaton kiintiö.</p>
      {success ? (
        <p className="border border-line bg-panel px-3 py-2 text-sm">
          {plan !== "free" ? `Maksu vahvistettu. Käytössä ${PLANS[plan]?.label ?? plan}.` : "Maksu vastaanotettu. Vahvistetaan Stripesta."}
        </p>
      ) : null}
      {!stripeReady ? (
        <p className="text-sm text-mute">Stripe-avaimet puuttuvat tältä ympäristöltä. Tallennetut salaisuudet tulevat voimaan seuraavassa julkaisussa.</p>
      ) : null}
      {paid && !admin ? (
        <Button variant="secondary" size="sm" disabled={portal.isPending} onClick={() => portal.mutate()}>
          Hallitse tilausta Stripessä
        </Button>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(PLANS).map((p) => (
          <article key={p.id} className="border border-line bg-panel p-4">
            <div className="text-[11px] uppercase tracking-[0.16em] text-faint">{p.label}</div>
            <div className="mt-2 text-2xl">{p.priceEur ? `€${p.priceEur}` : "Free"}</div>
            <p className="mt-2 text-sm text-mute">
              {p.unlimited ? "Unlimited searches / month" : `${p.searchesPerMonth} searches / month`}
            </p>
            <p className="mt-1 text-xs text-faint">
              {p.unlimited ? "No company cap · no per-search cap" : `${p.companies.toLocaleString("en")} stored · ${p.companiesPerMonth.toLocaleString("en")} new / month · ${p.perSearch} per search`}
            </p>
            {p.id === plan || (admin && p.id === "unlimited") ? (
              <div className="mt-4 text-xs uppercase tracking-[0.14em] text-faint">Current</div>
            ) : p.id === "free" ? (
              <Link to="/pricing" className="mt-4 inline-block text-sm text-mute">Details</Link>
            ) : (
              <Button className="mt-4" size="sm" disabled={checkout.isPending || admin || !stripeReady} onClick={() => checkout.mutate(p.id)}>
                Upgrade
              </Button>
            )}
          </article>
        ))}
      </div>
      {!admin ? (
        <section className="border border-line bg-panel p-4 space-y-3">
          <h2 className="text-sm font-medium">Buy extra credits</h2>
          <p className="text-sm text-mute">
            €{(CREDIT_CENTS / 100).toFixed(2)} per credit. One credit typically covers {LEADS_PER_CREDIT_MIN}–{LEADS_PER_CREDIT_MAX} extra leads, depending on public data.
            Minimum purchase €{CREDIT_MIN_EUR} ({CREDIT_MIN_QTY} credits). Credits are added only after Stripe confirms payment.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Credits
              <input
                className="mt-1 block h-9 w-28 border border-line bg-canvas px-2 text-sm tabular"
                inputMode="numeric"
                value={creditQty}
                onChange={(e) => setCreditQty(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={buyCredits.isPending || !parsedCredits.ok}
              onClick={() => parsedCredits.ok && buyCredits.mutate(parsedCredits.credits)}
            >
              {parsedCredits.ok
                ? `Pay €${(parsedCredits.amountCents / 100).toFixed(2)}`
                : `Min €${CREDIT_MIN_EUR}`}
            </Button>
          </div>
          {!parsedCredits.ok ? <p className="text-xs text-warn">{parsedCredits.error}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
