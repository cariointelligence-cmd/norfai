import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { PLANS, companiesLimitFor, companiesPerMonthFor, searchesLimitFor, type PlanId } from "@/lib/norr/platform";
import {
  adminCreateUser,
  adminGiftPlan,
  adminGrantAdmin,
  adminGrantQuota,
  adminInvite,
  adminListUsers,
  adminRevoke,
} from "@/lib/norr/actions";
import { formatWhen } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/team")({ component: AdminUsers });

const PLAN_OPTIONS = (Object.keys(PLANS) as PlanId[]).map((id) => ({ id, label: PLANS[id].label }));

function planLabel(id: string) {
  return PLANS[id as PlanId]?.label ?? id;
}

function QuotaCell({
  label, hint, used, cap, extra, warn,
}: {
  label: string;
  hint: string;
  used: number;
  cap: number;
  extra?: number;
  warn?: boolean;
}) {
  const unlimited = cap < 0;
  return (
    <td className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-faint lg:hidden">{label}</div>
      <div className={`whitespace-nowrap font-mono tabular ${warn ? "text-warn" : ""}`}>
        {unlimited ? `${used} · unlimited` : `${used} / ${cap}`}
      </div>
      <div className="max-w-[12rem] text-[10px] leading-snug text-mute">{hint}</div>
      {extra && extra > 0 ? <div className="text-[10px] text-mute">+{extra} extra granted</div> : null}
    </td>
  );
}

function AdminUsers() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const users = useQuery({ queryKey: ["admin-users", q], queryFn: () => adminListUsers({ data: { q } }) });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<PlanId>("starter");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [giftPlan, setGiftPlan] = useState<Record<string, PlanId>>({});
  const [quotaDraft, setQuotaDraft] = useState<Record<string, { searches: string; leads: string }>>({});

  const create = useMutation({
    mutationFn: () =>
      adminCreateUser({
        data: { email, name, password, plan, makeAdmin },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.message("Account created");
      setCreated({ email: r.email, password: r.password });
      setEmail("");
      setName("");
      setPassword("");
      setMakeAdmin(false);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["admin-state"] });
    },
  });
  const invite = useMutation({
    mutationFn: () => adminInvite({ data: { email: inviteEmail } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.message("They become admin on next sign-in");
        setInviteEmail("");
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-state"] });
      } else toast.error(r.error);
    },
  });
  const gift = useMutation({
    mutationFn: (opts: { userId: string; plan: PlanId }) => adminGiftPlan({ data: opts }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.message(`${planLabel(r.plan)} gifted`);
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
      } else toast.error(r.error);
    },
  });
  const grantQ = useMutation({
    mutationFn: (opts: { userId: string; searches: number; leads: number }) => adminGrantQuota({ data: opts }),
    onSuccess: (r) => {
      if (r.ok) {
        const bits = [
          r.searches ? `+${r.searches} searches` : "",
          r.leads ? `+${r.leads} leads` : "",
        ].filter(Boolean);
        toast.message(bits.join(" · ") || "Quota added");
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
      } else toast.error(r.error);
    },
  });
  const grant = useMutation({
    mutationFn: (userId: string) => adminGrantAdmin({ data: { userId } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.message("Granted admin");
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-state"] });
      } else toast.error(r.error);
    },
  });
  const rev = useMutation({
    mutationFn: (userId: string) => adminRevoke({ data: { userId } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.message("Admin access revoked. Gifted plan stays.");
        void qc.invalidateQueries({ queryKey: ["admin-users"] });
        void qc.invalidateQueries({ queryKey: ["admin-state"] });
      } else toast.error(r.error);
    },
  });

  const rows = users.data?.ok ? users.data.users : [];
  const counts = useMemo(() => {
    const admins = rows.filter((u: { adminRole: string | null }) => u.adminRole).length;
    return { n: rows.length, admins };
  }, [rows]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Users</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          Create accounts, gift a plan, add searches or leads, or grant admin. Admin quota is unlimited while they stay admin.
          A gifted plan stays after you revoke admin. Extra searches and leads sit on top of the plan until used. Passwords are shown once.
        </p>
      </div>

      <section className="border border-line bg-panel p-4 md:p-5">
        <h2 className="text-sm font-medium">Create account</h2>
        <p className="mt-1 text-xs text-mute">They sign in with email and this password. Leave password blank to generate one.</p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Password">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to generate" autoComplete="off" />
          </Field>
          <Field label="Plan gift">
            <Select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
              {PLAN_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
            Make admin
          </label>
          <div className="self-end">
            <Button type="submit" disabled={create.isPending || !email.trim()}>
              {create.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
        {created ? (
          <div className="mt-4 border border-line bg-canvas p-3 text-sm">
            <div className="font-medium">Account ready</div>
            <p className="mt-1 text-mute">{created.email}</p>
            {created.password ? (
              <p className="mt-2 font-mono text-xs">
                One-time password: {created.password}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(created.password ?? "");
                    toast.message("Copied");
                  }}
                >
                  Copy
                </button>
              </p>
            ) : (
              <p className="mt-2 text-xs text-mute">They can sign in with the password you set. It is not shown again.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="border border-line bg-panel p-4 md:p-5">
        <h2 className="text-sm font-medium">Promote someone who already has an email</h2>
        <p className="mt-1 text-xs text-mute">If they have not signed in yet, they become admin on first sign-in.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="email@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <Button variant="secondary" onClick={() => invite.mutate()} disabled={!inviteEmail.trim() || invite.isPending}>
            Grant admin
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Everyone on the platform</h2>
            <p className="text-xs text-mute">{counts.n} users · {counts.admins} admins</p>
            <p className="mt-1 max-w-xl text-[11px] leading-snug text-mute">
              Searches = how many search runs exist this plan period. New companies = rows first stored after period start — they can exist without a billed search (import, list fill, or a run that did not debit). Stored = everything in the workspace. Yellow means over the monthly cap or companies without a matching search.
            </p>
          </div>
          <Input className="max-w-xs" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!users.data ? (
          <p className="text-sm text-mute">Loading users…</p>
        ) : !users.data.ok && users.data.error ? (
          <p className="text-sm text-bad">{users.data.error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-mute">No users match.</p>
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
                <tr>
                  <th className="border-b border-line px-3 py-2">User</th>
                  <th className="border-b border-line px-3 py-2">Plan / role</th>
                  <th className="border-b border-line px-3 py-2">
                    Searches
                    <div className="font-normal normal-case tracking-normal text-mute">used / cap this period</div>
                  </th>
                  <th className="border-b border-line px-3 py-2">
                    New companies
                    <div className="font-normal normal-case tracking-normal text-mute">this period / monthly cap</div>
                  </th>
                  <th className="border-b border-line px-3 py-2">
                    Stored companies
                    <div className="font-normal normal-case tracking-normal text-mute">workspace / stored cap</div>
                  </th>
                  <th className="border-b border-line px-3 py-2">Joined</th>
                  <th className="border-b border-line px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u: {
                  id: string;
                  email: string;
                  name: string;
                  plan: PlanId;
                  planSource: string | null;
                  adminRole: string | null;
                  companies: number;
                  companiesThisPeriod?: number;
                  searchesUsed?: number;
                  searchesThisPeriod?: number;
                  bonusSearches?: number;
                  bonusLeads?: number;
                  createdAt: string | null;
                  periodStart?: string | null;
                }) => {
                  const nextPlan = giftPlan[u.id] ?? u.plan;
                  const isAdm = Boolean(u.adminRole);
                  const extraS = Number(u.bonusSearches ?? 0);
                  const extraL = Number(u.bonusLeads ?? 0);
                  const cCap = companiesLimitFor(u.plan, isAdm);
                  const mCap = companiesPerMonthFor(u.plan, isAdm);
                  const sCap = searchesLimitFor(u.plan, isAdm);
                  const sShown = sCap >= 0 ? sCap + extraS : sCap;
                  const mShown = mCap >= 0 ? mCap + extraL : mCap;
                  const overMonth = mCap >= 0 && (u.companiesThisPeriod ?? 0) > (mShown < 0 ? Number.POSITIVE_INFINITY : mShown);
                  const runs = Number(u.searchesThisPeriod ?? 0);
                  const billed = Number(u.searchesUsed ?? 0);
                  const periodLabel = u.periodStart ? formatWhen(u.periodStart) : "this plan period";
                  const searchHint = runs === 0 && (u.companiesThisPeriod ?? 0) > 0
                    ? `No search run since ${periodLabel}. Companies below were stored another way (import, list fill) or a run did not debit quota.`
                    : runs !== billed
                      ? `${runs} runs started since ${periodLabel}. Billed counter is ${billed}.`
                      : `Runs started since ${periodLabel}`;
                  const newHint = runs === 0 && (u.companiesThisPeriod ?? 0) > 0
                    ? `First stored since ${periodLabel} — not from a billed search`
                    : `First stored since ${periodLabel}`;
                  const draft = quotaDraft[u.id] ?? { searches: "50", leads: "50" };
                  return (
                    <tr key={u.id} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-2">
                        <div className="break-all">{u.email}</div>
                        <div className="text-xs text-mute">{u.name || "—"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <Pill tone="ink">{planLabel(u.plan)}</Pill>
                          {isAdm ? <Pill tone="good">{u.adminRole}</Pill> : <Pill>member</Pill>}
                          {u.planSource === "admin_gift" ? <Pill>gift</Pill> : null}
                          {u.planSource === "stripe" ? <Pill tone="info">stripe</Pill> : null}
                        </div>
                      </td>
                      <QuotaCell
                        label="Searches"
                        hint={searchHint}
                        used={runs}
                        cap={sShown}
                        extra={extraS}
                        warn={runs === 0 && (u.companiesThisPeriod ?? 0) > 0}
                      />
                      <QuotaCell
                        label="New companies"
                        hint={newHint}
                        used={u.companiesThisPeriod ?? 0}
                        cap={mShown}
                        extra={extraL}
                        warn={overMonth || (runs === 0 && (u.companiesThisPeriod ?? 0) > 0)}
                      />
                      <QuotaCell
                        label="Stored companies"
                        hint="All companies in their workspace"
                        used={u.companies}
                        cap={cCap}
                      />
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-mute">{formatWhen(u.createdAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              className="h-9 border border-line bg-canvas px-2 text-xs"
                              value={nextPlan}
                              onChange={(e) => setGiftPlan((m) => ({ ...m, [u.id]: e.target.value as PlanId }))}
                            >
                              {PLAN_OPTIONS.map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={gift.isPending || nextPlan === u.plan}
                              onClick={() => gift.mutate({ userId: u.id, plan: nextPlan })}
                            >
                              Gift
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              className="h-9 w-16 border border-line bg-canvas px-2 text-xs tabular"
                              inputMode="numeric"
                              value={draft.searches}
                              onChange={(e) => setQuotaDraft((m) => ({ ...m, [u.id]: { ...draft, searches: e.target.value } }))}
                              aria-label="Searches to add"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={grantQ.isPending || !Number(draft.searches)}
                              onClick={() => grantQ.mutate({ userId: u.id, searches: Number(draft.searches) || 0, leads: 0 })}
                            >
                              Add searches
                            </Button>
                            <input
                              className="h-9 w-16 border border-line bg-canvas px-2 text-xs tabular"
                              inputMode="numeric"
                              value={draft.leads}
                              onChange={(e) => setQuotaDraft((m) => ({ ...m, [u.id]: { ...draft, leads: e.target.value } }))}
                              aria-label="Leads to add"
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={grantQ.isPending || !Number(draft.leads)}
                              onClick={() => grantQ.mutate({ userId: u.id, searches: 0, leads: Number(draft.leads) || 0 })}
                            >
                              Add leads
                            </Button>
                          </div>
                          {u.adminRole === "owner" ? (
                            <span className="text-xs text-faint">Owner seat</span>
                          ) : u.adminRole ? (
                            <button
                              type="button"
                              className="text-left text-xs text-mute hover:text-ink"
                              disabled={rev.isPending}
                              onClick={() => rev.mutate(u.id)}
                            >
                              Revoke admin
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-left text-xs text-mute hover:text-ink"
                              disabled={grant.isPending}
                              onClick={() => grant.mutate(u.id)}
                            >
                              Make admin
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
