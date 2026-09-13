import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addNote, addTag, addToList, deleteCompany, getCompany, listLists, reEnrichCompanies, saveProfile, startSearch } from "@/lib/norr/actions";
import {
  assignCompany,
  generateCallBrief,
  getCrmStatus,
  listActivity,
  listTeam,
  logActivity,
  lookalikeCompanies,
  pushToCrm,
  startLookalikeSearch,
} from "@/lib/norr/ops-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Pill, ProvenanceBadge } from "@/components/status";
import { IntelligencePanel, asCompanyIntel, scoreLabel } from "@/components/intel";
import { formatWhen } from "@/lib/format";
import { phoneRoleLabel, type PhoneRole } from "@/lib/norr/phones";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/companies/$companyId")({ component: CompanyDetail });

const OUTCOMES = [
  { id: "called", fi: "Soitettu", en: "Called", sv: "Ringd" },
  { id: "no_answer", fi: "Ei vastausta", en: "No answer", sv: "Inget svar" },
  { id: "lead", fi: "Liidi", en: "Lead", sv: "Lead" },
  { id: "not_fit", fi: "Ei sopiva", en: "Not a fit", sv: "Passar inte" },
  { id: "won", fi: "Voitettu", en: "Won", sv: "Vunnen" },
] as const;

function FieldRow({ label, value, obs }: { label: string; value: unknown; obs?: Array<Record<string, unknown>> }) {
  const related = (obs ?? []).filter((o) => o.field === label);
  const fromObs = related.find((o) => o.normalised_value != null && String(o.normalised_value).length)?.normalised_value;
  const display = value == null || value === "" ? (fromObs != null ? String(fromObs) : "Not found") : String(value);
  return (
    <div className="grid gap-1 border-b border-line py-3 md:grid-cols-[160px_minmax(0,1fr)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{label.replaceAll("_", " ")}</div>
      <div>
        <div className="text-sm">{display}</div>
        {related.length === 0 && (value == null || value === "") ? (
          <p className="mt-1 text-xs text-mute">No observation. Sources that could fill this were queried or do not publish the field.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {related.slice(0, 6).map((o) => (
              <li key={String(o.id)} className="flex flex-wrap items-center gap-2 text-xs text-mute">
                <ProvenanceBadge status={String(o.verification_status)} />
                <span>{String(o.source ?? o.source_id ?? "Norf")}</span>
                {o.source_url ? (
                  <a className="underline decoration-line underline-offset-2" href={String(o.source_url)} target="_blank" rel="noreferrer">
                    source
                  </a>
                ) : null}
                <span className="font-mono">c{String(o.confidence)}</span>
                {o.evidence ? <span className="text-faint">{String(o.evidence).slice(0, 140)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CompanyDetail() {
  const { companyId } = Route.useParams();
  const { locale } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company", companyId], queryFn: () => getCompany({ data: { id: companyId } }) });
  const lists = useQuery({ queryKey: ["lists"], queryFn: () => listLists() });
  const activity = useQuery({ queryKey: ["activity", companyId], queryFn: () => listActivity({ data: { companyId } }) });
  const likes = useQuery({ queryKey: ["lookalike", companyId], queryFn: () => lookalikeCompanies({ data: { companyId } }) });
  const team = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });
  const crm = useQuery({ queryKey: ["crm"], queryFn: () => getCrmStatus() });
  const [note, setNote] = useState("");
  const [tag, setTag] = useState("");
  const [listId, setListId] = useState("");
  const [activityNote, setActivityNote] = useState("");
  const reenrich = useMutation({
    mutationFn: () => reEnrichCompanies({ data: { ids: [companyId] } }),
    onSuccess: (r) => {
      if ("ok" in r && r.ok === false) {
        toast.error("error" in r && typeof r.error === "string" ? r.error : "Re-enrich was refused.");
        return;
      }
      toast.message(r.queued ? "Re-running YTJ, Wikipedia, Wikidata, DuckDuckGo, OSM and the company site for URL, people, email and phone" : "Nothing queued");
      void qc.invalidateQueries({ queryKey: ["company", companyId] });
      void qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
  const saveNote = useMutation({
    mutationFn: () => addNote({ data: { entityType: "company", entityId: companyId, body: note } }),
    onSuccess: () => { setNote(""); void qc.invalidateQueries({ queryKey: ["company", companyId] }); },
  });
  const brief = useMutation({
    mutationFn: () => generateCallBrief({ data: { companyId } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error ?? "Call brief is not available.");
      else {
        toast.message("Call card ready");
        void qc.invalidateQueries({ queryKey: ["company", companyId] });
      }
    },
  });
  const similarSearch = useMutation({
    mutationFn: async () => {
      const r = await startLookalikeSearch({ data: { companyId } });
      if (!r.ok) throw new Error(r.error ?? "Could not bound a similar search.");
      const saved = await saveProfile({ data: { name: r.name, criteria: r.criteria } });
      if (!saved.ok) throw new Error(saved.error ?? "Could not save profile.");
      const res = await startSearch({ data: { criteria: r.criteria, profileId: saved.id, name: r.name } });
      if (!res.ok) throw new Error(res.error ?? "Search failed");
      return res.runId as string;
    },
    onSuccess: (runId) => {
      toast.message("Similar search started from published industry and city only.");
      nav({ to: "/search/$runId", params: { runId } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Similar search failed"),
  });

  if (!q.data) return <p className="text-sm text-mute">Loading company…</p>;
  if (!q.data.ok) return <p className="text-sm text-bad">{q.data.error}</p>;
  const c = q.data.company;
  const obs = q.data.observations as Array<Record<string, unknown>>;
  const score = q.data.scores[0] as { score?: number; explanation?: { text?: string; matched?: string[]; missed?: string[]; uncertain?: string[]; signals?: string[] } } | undefined;
  const intel = asCompanyIntel(c.intel) ?? asCompanyIntel((score?.explanation as { intel?: unknown } | undefined)?.intel);
  const phones = (q.data.contacts as Array<{ id: string; kind: string; value: string; classification: string; phone_role?: string | null }>).filter((ct) => ct.kind === "phone");
  const otherContacts = (q.data.contacts as Array<{ id: string; kind: string; value: string; classification: string; phone_role?: string | null }>).filter((ct) => ct.kind !== "phone");
  const briefLines = Array.isArray((c.call_brief as { lines?: string[] } | null)?.lines) ? (c.call_brief as { lines: string[] }).lines : [];
  const outcomeLabel = (id: string) => {
    const row = OUTCOMES.find((o) => o.id === id);
    if (!row) return id;
    return locale === "fi" ? row.fi : locale === "sv" ? row.sv : row.en;
  };
  const crmOn = (provider: string) => Boolean((crm.data?.connections ?? []).find((x: { provider: string; last4?: string | null; connected?: boolean }) => x.provider === provider && (x.last4 || x.connected)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">{String(c.name)}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{String(c.record_status)}</Pill>
            <Pill tone="info">{String(c.country)}</Pill>
            {c.match_score != null || c.overall_confidence != null ? (
              <Pill tone="ink">match {scoreLabel((c.match_score as number | null) ?? (c.overall_confidence as number | null))}</Pill>
            ) : (
              <Pill>unscored</Pill>
            )}
            {c.website_score != null ? <Pill>site {String(c.website_score)}</Pill> : null}
            {c.commercial_opportunity != null ? <Pill>opp {String(c.commercial_opportunity)}</Pill> : null}
            {c.activity_outcome ? <Pill tone="info">{outcomeLabel(String(c.activity_outcome))}</Pill> : null}
            {c.phone_class ? <Pill>{phoneRoleLabel(String(c.phone_class) as PhoneRole, locale)}</Pill> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => reenrich.mutate()} disabled={reenrich.isPending}>
            {reenrich.isPending ? "Searching…" : "Find URL / people / email / phone"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => deleteCompany({ data: { id: companyId } }).then(() => toast.message("Soft-deleted"))}>Delete</Button>
        </div>
      </div>

      <IntelligencePanel intel={intel} />

      {intel?.evidenceCompleteness?.state === "EVALUATED" ? (
        <section className="border border-line bg-panel p-4 space-y-2">
          <h2 className="text-sm font-medium">Evidence completeness</h2>
          <p className="text-sm text-mute">
            {intel.evidenceCompleteness.score}% of the usual fields were observed. Missing evidence is not a bad company.
          </p>
          {intel.evidenceCompleteness.present.length ? (
            <p className="text-xs text-mute">Observed: {intel.evidenceCompleteness.present.join(", ")}</p>
          ) : null}
          {intel.evidenceCompleteness.missing.length ? (
            <p className="text-xs text-mute">Missing: {intel.evidenceCompleteness.missing.join(", ")}</p>
          ) : null}
          {intel.personalized?.contributions?.length ? (
            <p className="text-xs text-mute">Offer-weighted ranking: {intel.personalized.contributions.join("; ")}</p>
          ) : null}
        </section>
      ) : null}

      {q.data.brief ? (
        <section className="border border-line bg-panel p-4 space-y-2">
          <h2 className="text-sm font-medium">Why this company</h2>
          <p className="text-sm">{q.data.brief.who}</p>
          {q.data.explanation?.matchedFacts?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Matched facts</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mute">{q.data.explanation.matchedFacts.map((w: string) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : q.data.brief.why.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Matched</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mute">{q.data.brief.why.map((w: string) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : null}
          {q.data.explanation?.matchedSignals?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Matched signals</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mute">{q.data.explanation.matchedSignals.map((w: string) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : null}
          {q.data.brief.whyNow.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Why now</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mute">{q.data.brief.whyNow.map((w: string) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : null}
          {q.data.brief.possibleAngle ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Possible angle — inference</div>
              <p className="mt-1 text-sm text-mute">{q.data.brief.possibleAngle}</p>
            </div>
          ) : null}
          <p className="text-sm"><span className="text-mute">Contact: </span>{q.data.brief.contact ?? "Not found"}</p>
          {q.data.brief.nextAction ? <p className="text-sm text-mute">{q.data.brief.nextAction}</p> : null}
          {q.data.brief.inferences.length || q.data.explanation?.inferences?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-faint">Inference — not a fact</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-mute">{(q.data.explanation?.inferences?.length ? q.data.explanation.inferences : q.data.brief.inferences).map((w: string) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : null}
          {q.data.brief.unknown.length || q.data.explanation?.unknown?.length ? (
            <p className="text-xs text-mute">Unknown: {(q.data.explanation?.unknown?.length ? q.data.explanation.unknown : q.data.brief.unknown).join("; ")}</p>
          ) : null}
          {q.data.explanation?.conflicting?.length ? (
            <p className="text-xs text-mute">Conflicting: {q.data.explanation.conflicting.join("; ")}</p>
          ) : null}
          {Array.isArray(q.data.brief.risks) && q.data.brief.risks.length ? (
            <p className="text-xs text-mute">Risks: {q.data.brief.risks.join("; ")}</p>
          ) : null}
        </section>
      ) : null}

      {q.data.websiteOpportunity?.summary ? (
        <section className="border border-line bg-panel p-4 space-y-2">
          <h2 className="text-sm font-medium">Website opportunity</h2>
          <p className="text-sm text-mute">{q.data.websiteOpportunity.summary}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-mute">
            {q.data.websiteOpportunity.observations.map((o: { id: string; fact: string; inference: string }) => (
              <li key={o.id}><span className="text-ink">{o.fact}</span> — {o.inference}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-line bg-panel px-4">
        {["name","business_id","vat_id","eu_id","lei","legal_form","registration_date","business_status","industry_code","industry_label","street","postal_code","municipality","website","general_email","phone","employee_count","revenue","previous_revenue","profit","equity","assets","equity_ratio","financial_period","financial_source","financial_conflict","description","vat_register","employer_register","prepayment_register","trade_register","situation"].map((k) => (
          <FieldRow key={k} label={k} value={c[k]} obs={obs} />
        ))}
        <FieldRow label="group" value={c.parent_name ? `${c.parent_name}${c.group_role ? ` · ${c.group_role}` : ""}${c.parent_business_id ? ` · ${c.parent_business_id}` : ""}` : null} obs={obs} />
        <FieldRow label="phone_class" value={c.phone_class ? phoneRoleLabel(String(c.phone_class) as PhoneRole, locale) : null} />
      </section>

      {score?.explanation ? (
        <section className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Score explanation</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm text-mute">{score.explanation.text}</pre>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium">Decision-makers</h2>
        <div className="border border-line">
          {q.data.people.length === 0 ? <p className="px-3 py-4 text-sm text-mute">Not found on crawled pages, Wikipedia, Wikidata or DuckDuckGo. YTJ does not publish officers.</p> : q.data.people.map((p: { id: string; full_name: string; title?: string; confidence?: number }) => (
            <Link key={String(p.id)} to="/people/$personId" params={{ personId: String(p.id) }} className="flex justify-between border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-panel-2">
              <span>{String(p.full_name)} <span className="text-mute">{String(p.title ?? "")}</span></span>
              <Pill>{String(p.confidence ?? "-")}</Pill>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Phones</h2>
        <div className="border border-line">
          {phones.length === 0 ? (
            <p className="px-3 py-4 text-sm text-mute">Not found. Switchboard, mobile and direct are labelled only when a published source or a Finnish number pattern supports it.</p>
          ) : phones.map((ct) => (
            <div key={String(ct.id)} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">{String(ct.value)}</span>
              <div className="flex gap-2">
                <Pill>{phoneRoleLabel((ct.phone_role as PhoneRole) || "unknown", locale)}</Pill>
                <ProvenanceBadge status={String(ct.classification)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Other contacts</h2>
        <div className="border border-line">
          {otherContacts.length === 0 ? <p className="px-3 py-4 text-sm text-mute">Not found.</p> : otherContacts.map((ct) => (
            <div key={String(ct.id)} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
              <span className="font-mono text-xs">{String(ct.value)}</span>
              <div className="flex gap-2">
                <Pill>{String(ct.kind)}</Pill>
                <ProvenanceBadge status={String(ct.classification)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Finnish call card</h2>
          <Button size="sm" variant="secondary" onClick={() => brief.mutate()} disabled={brief.isPending}>
            {brief.isPending ? "Writing…" : "Write call card"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-mute">Private brief for the caller. Facts only. Norf does not message the company.</p>
        {briefLines.length ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {briefLines.map((line) => <li key={line}>{line}</li>)}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-mute">No card yet. Write one from stored facts when you are about to call.</p>
        )}
      </section>

      <section className="border border-line bg-panel p-4">
        <h2 className="mb-2 text-sm font-medium">Activity</h2>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant={c.activity_outcome === o.id ? "primary" : "secondary"}
              onClick={() => {
                void logActivity({ data: { companyId, kind: "called", outcome: o.id, body: activityNote } }).then((r) => {
                  if (!r.ok) toast.error(r.error ?? "Could not log");
                  else {
                    setActivityNote("");
                    void qc.invalidateQueries({ queryKey: ["company", companyId] });
                    void qc.invalidateQueries({ queryKey: ["activity", companyId] });
                  }
                });
              }}
            >
              {outcomeLabel(o.id)}
            </Button>
          ))}
        </div>
        <Input className="mt-3" value={activityNote} onChange={(e) => setActivityNote(e.target.value)} placeholder={locale === "fi" ? "Lyhyt muistiinpano soitosta" : "Short note from the call"} />
        <div className="mt-3 space-y-2">
          {(activity.data?.rows ?? []).length === 0 ? <p className="text-sm text-mute">No activity logged.</p> : (activity.data?.rows ?? []).map((a: { id: string; outcome?: string; body?: string; created_at: string }) => (
            <div key={a.id} className="border-b border-line py-2 text-sm last:border-0">
              <div className="flex items-center gap-2">
                {a.outcome ? <Pill tone="info">{outcomeLabel(a.outcome)}</Pill> : null}
                <span className="text-xs text-faint">{formatWhen(a.created_at, "-", locale)}</span>
              </div>
              {a.body ? <p className="mt-1 text-mute">{a.body}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Owner</h2>
          <select
            className="h-10 w-full border border-line bg-canvas px-3 text-sm"
            value={String(c.assigned_owner ?? "")}
            onChange={(e) => {
              void assignCompany({ data: { companyId, ownerId: e.target.value } }).then(() => void q.refetch());
            }}
          >
            <option value="">Unassigned</option>
            {(team.data?.members ?? []).map((m: { member_user_id?: string; email: string }) => (
              m.member_user_id ? <option key={m.member_user_id} value={m.member_user_id}>{m.email}</option> : null
            ))}
            {team.data?.actor ? <option value={team.data.actor}>Me</option> : null}
          </select>
        </div>
        <div className="border border-line bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium">Push to CRM</h2>
          <p className="mb-2 text-xs text-mute">One-way. Connect a token first. Nothing is marked connected without one.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!crmOn("taju")} onClick={() => {
              void pushToCrm({ data: { provider: "taju", ids: [companyId] } }).then((r) => {
                toast[r.ok ? "message" : "error"](r.ok ? `TAJU CRM ${r.pushed}` : r.error ?? "TAJU refused");
              });
            }}>TAJU CRM</Button>
            <Button size="sm" variant="secondary" disabled={!crmOn("hubspot")} onClick={() => {
              void pushToCrm({ data: { provider: "hubspot", ids: [companyId] } }).then((r) => {
                toast[r.ok ? "message" : "error"](r.ok ? `HubSpot ${r.pushed}` : r.error ?? "HubSpot refused");
              });
            }}>HubSpot</Button>
            <Button size="sm" variant="secondary" disabled={!crmOn("pipedrive")} onClick={() => {
              void pushToCrm({ data: { provider: "pipedrive", ids: [companyId] } }).then((r) => {
                toast[r.ok ? "message" : "error"](r.ok ? `Pipedrive ${r.pushed}` : r.error ?? "Pipedrive refused");
              });
            }}>Pipedrive</Button>
            <Link to="/integrations" className="tap text-xs text-mute underline">Connect CRM</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">More like this</h2>
          <Button size="sm" variant="secondary" onClick={() => similarSearch.mutate()} disabled={similarSearch.isPending}>
            Search similar from registers
          </Button>
        </div>
        <p className="mb-2 text-xs text-mute">Workspace companies in the same 2-digit industry. New names are never invented.</p>
        <div className="border border-line">
          {(likes.data?.matches ?? []).length === 0 ? (
            <p className="px-3 py-4 text-sm text-mute">No similar companies in this workspace yet, or this row has no industry code.</p>
          ) : (likes.data?.matches ?? []).map((m: { id: string; name?: string; score: number; reasons: string[]; municipality?: string }) => (
            <Link key={m.id} to="/companies/$companyId" params={{ companyId: m.id }} className="flex justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-0 hover:bg-panel-2">
              <span>{m.name ?? m.id}<span className="block text-xs text-mute">{m.municipality ?? ""} · {(m.reasons ?? []).join(", ")}</span></span>
              <span className="font-mono text-xs">{m.score}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Signals & crawl evidence</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-line">
            {q.data.signals.length === 0 ? <p className="px-3 py-4 text-sm text-mute">No signals stored.</p> : q.data.signals.map((s: { id: string; title: string; kind: string; source_url?: string }) => (
              <div key={String(s.id)} className="border-b border-line px-3 py-2 last:border-0">
                <div className="text-sm">{String(s.title)}</div>
                <div className="text-xs text-mute">{String(s.kind)} {s.source_url ? <a className="underline" href={String(s.source_url)} target="_blank" rel="noreferrer">source</a> : null}</div>
              </div>
            ))}
          </div>
          <div className="border border-line">
            {q.data.pages.length === 0 ? <p className="px-3 py-4 text-sm text-mute">No pages crawled yet, or the website is missing.</p> : q.data.pages.map((p: { id: string; url: string; error?: string; status_code?: number; excerpt?: string }) => (
              <div key={String(p.id)} className="border-b border-line px-3 py-2 text-xs last:border-0">
                <div className="flex justify-between gap-2">
                  <a className="truncate underline" href={String(p.url)} target="_blank" rel="noreferrer">{String(p.url)}</a>
                  <span>{p.error ? <span className="text-bad">{String(p.error)}</span> : String(p.status_code ?? "")}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-mute">{p.excerpt ? String(p.excerpt) : "No excerpt"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <form className="border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); saveNote.mutate(); }}>
          <h2 className="mb-2 text-sm font-medium">Notes</h2>
          {(q.data.notes ?? []).length ? (
            <ul className="mb-3 space-y-2">
              {(q.data.notes as Array<{ id: string; body: string; created_at: string }>).map((n) => (
                <li key={n.id} className="border-b border-line pb-2 text-sm last:border-0">
                  <p>{n.body}</p>
                  <p className="text-xs text-faint">{formatWhen(n.created_at, "-", locale)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mb-2 text-xs text-mute">No notes yet.</p>}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} required />
          <Button className="mt-2" size="sm" type="submit">Save note</Button>
        </form>
        <form className="border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); addTag({ data: { companyId, name: tag } }).then(() => { setTag(""); void q.refetch(); }); }}>
          <h2 className="mb-2 text-sm font-medium">Tags</h2>
          <div className="mb-3 flex flex-wrap gap-1">
            {(q.data.tags ?? []).length === 0 ? <span className="text-xs text-mute">No tags.</span> : (q.data.tags as Array<{ id: string; name: string }>).map((t) => (
              <Pill key={t.id}>{t.name}</Pill>
            ))}
          </div>
          <Input value={tag} onChange={(e) => setTag(e.target.value)} />
          <Button className="mt-2" size="sm" type="submit">Add tag</Button>
        </form>
        <form className="border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); if (listId) addToList({ data: { listId, companyId } }).then(() => toast.message("Added to list")); }}>
          <h2 className="mb-2 text-sm font-medium">Add to list</h2>
          <select className="h-10 w-full border border-line bg-canvas px-3 text-sm" value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">Select list</option>
            {(lists.data?.lists ?? []).map((l: { id: string; name: string }) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <Button className="mt-2" size="sm" type="submit">Add</Button>
        </form>
      </section>
    </div>
  );
}
