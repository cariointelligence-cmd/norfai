import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MarketingShell } from "@/components/marketing";
import { JsonLd } from "@/components/seo";
import { useI18n } from "@/lib/i18n";
import { getPublicPlans } from "@/lib/norr/public";
import { startCheckout } from "@/lib/norr/actions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { toast } from "sonner";
import type { PlanId } from "@/lib/norr/platform";
import { pageByPath } from "@/lib/seo/catalog.ts";
import { marketingHead } from "@/lib/seo/head.ts";
import { softwareSchema } from "@/lib/seo/schema.ts";

const meta = pageByPath("/pricing")!;

export const Route = createFileRoute("/pricing")({
  head: () => marketingHead({ title: meta.title, description: meta.description, path: "/pricing" }),
  component: Pricing,
});

const FEATURES: Record<string, string[]> = {
  free: ["50 searches / month", "50 new companies / month", "50 companies per search", "400 companies stored"],
  starter: ["1,000 searches / month", "1,500 new companies / month", "200 companies per search", "15,000 companies stored"],
  pro: ["5,000 searches / month", "5,000 new companies / month", "300 companies per search", "60,000 companies stored"],
  unlimited: ["No search cap", "No company cap", "No per-search cap", "Deep search and priority support"],
};

function Pricing() {
  const { t } = useI18n();
  const { user } = useCurrentUserState();
  const q = useQuery({ queryKey: ["plans"], queryFn: () => getPublicPlans() });
  const checkout = useMutation({
    mutationFn: (plan: PlanId) => startCheckout({ data: { plan, origin: window.location.origin } }),
    onSuccess: (r) => {
      if (r.ok) window.location.href = r.url;
      else toast.error(r.error);
    },
  });
  return (
    <MarketingShell>
      <JsonLd data={softwareSchema("")} />
      <div className="wrap section">
        <h1 className="display">{t("navPricing")}</h1>
        <p className="lede mt-4 max-w-2xl">{t("pricingLead")}</p>
        <p className="mt-2 text-sm text-faint">{t("priceVat")}</p>
        {!q.data?.stripeReady ? <p className="mt-3 text-sm text-faint">{t("stripeSoon")}</p> : null}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(q.data?.plans ?? []).map((p) => (
            <article key={p.id} className={`panel flex flex-col p-6 ${p.id === "pro" ? "border-line-strong" : ""}`}>
              <div className="kicker">{p.label}</div>
              <div className="mt-3 text-4xl font-medium tracking-tight">
                {p.priceEur ? `€${p.priceEur}` : t("planFree")}
                {p.priceEur ? <span className="text-sm text-mute"> / kk</span> : null}
              </div>
              <p className="mt-3 text-sm text-mute">
                {p.unlimited ? t("searchesUnlimited") : `${p.searchesPerMonth} ${t("searches")}`}
              </p>
              <ul className="mt-4 space-y-1 text-sm text-mute">
                {(FEATURES[p.id] ?? []).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="mt-8">
                {p.id === "free" ? (
                  <Link to="/login" className="cta w-full">{t("heroCta")}</Link>
                ) : (
                  <button
                    type="button"
                    className="cta-ghost w-full"
                    disabled={checkout.isPending}
                    onClick={() => {
                      if (!user) window.location.href = "/login";
                      else checkout.mutate(p.id);
                    }}
                  >
                    {t("planCta")}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </MarketingShell>
  );
}
