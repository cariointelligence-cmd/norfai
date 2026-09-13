import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createList, fillList, getList, listLists, listRuns, removeFromList, updateList } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Empty } from "@/components/status";
import { useState } from "react";
import { toast } from "sonner";
import { EMPTY_LIST_RULES, parseListRules, listRulesSummary, type ListRules } from "@/lib/norr/prefs";
import { INDUSTRIES, MUNICIPALITIES } from "@/lib/norr/finland";
import { asDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/lists")({ component: Lists });

type ListCopy = {
  industry: string;
  city: string;
  any: string;
  revenue: string;
  web: string;
  email: string;
  dm: string;
  phone: string;
  country: string;
  match: string;
  matchedOnly: string;
};

function RulesFields({
  value,
  onChange,
  copy,
  locale,
}: {
  value: ListRules;
  onChange: (r: ListRules) => void;
  copy: ListCopy;
  locale: string;
}) {
  const set = (patch: Partial<ListRules>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.industry}>
        <Select value={value.industry} onChange={(e) => set({ industry: e.target.value })}>
          <option value="">{copy.any} / Kaikki toimialat</option>
          {INDUSTRIES.map((i) => (
            <option key={i.code} value={i.code}>{i.code} {locale === "en" ? i.labelEn : i.labelFi}</option>
          ))}
        </Select>
      </Field>
      <Field label={copy.city}>
        <Select value={value.municipality} onChange={(e) => set({ municipality: e.target.value })}>
          <option value="">{copy.any}</option>
          {MUNICIPALITIES.map((m) => (
            <option key={m.code + m.name} value={m.name}>{locale === "sv" && m.nameSv ? m.nameSv : m.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={copy.revenue}>
        <Input
          type="number"
          min={0}
          value={value.minRevenue ?? ""}
          onChange={(e) => set({ minRevenue: e.target.value === "" ? null : Number(e.target.value) || null })}
        />
      </Field>
      <Field label={copy.country}>
        <Select value={value.country} onChange={(e) => set({ country: e.target.value })}>
          <option value="">{copy.any}</option>
          <option value="FI">FI</option>
          <option value="SE">SE</option>
          <option value="NO">NO</option>
          <option value="DK">DK</option>
        </Select>
      </Field>
      <Field label={copy.match}>
        <Input
          type="number"
          min={0}
          max={100}
          value={value.minMatchScore ?? ""}
          onChange={(e) => set({ minMatchScore: e.target.value === "" ? null : Number(e.target.value) || null })}
        />
      </Field>
      <div className="space-y-2 self-end text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.requireWebsite} onChange={(e) => set({ requireWebsite: e.target.checked })} />{copy.web}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.requireEmail} onChange={(e) => set({ requireEmail: e.target.checked })} />{copy.email}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.requirePhone} onChange={(e) => set({ requirePhone: e.target.checked })} />{copy.phone}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.requireDecisionMaker} onChange={(e) => set({ requireDecisionMaker: e.target.checked })} />{copy.dm}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={value.matchedOnly} onChange={(e) => set({ matchedOnly: e.target.checked })} />{copy.matchedOnly}</label>
      </div>
    </div>
  );
}

function Lists() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Listat",
        body: "Nimeä lista, aseta säännöt ja täytä se osumilla tai aiemmalla haulla.",
        name: "Listan nimi",
        desc: "Kuvaus",
        industry: "Toimiala",
        city: "Kunta",
        any: "Ei rajausta",
        web: "Verkkosivu pakollinen",
        email: "Sähköposti pakollinen",
        dm: "Päättäjä pakollinen",
        phone: "Puhelin pakollinen",
        country: "Maa",
        match: "Osuma vähintään",
        matchedOnly: "Vain hakuoosumat (ei hylättyjä)",
        revenue: "Liikevaihto vähintään (EUR)",
        create: "Luo lista",
        empty: "Ei listoja",
        emptyBody: "Luo lista, määritä säännöt ja täytä se yrityksillä.",
        members: "jäsentä",
        fillRules: "Täytä säännöillä",
        fillRun: "Täytä hausta",
        pickRun: "Valitse haku",
        saveRules: "Tallenna säännöt",
        added: "Lisätty",
        noneAdded: "Ei uusia rivejä",
        noMembers: "Ei jäseniä vielä.",
        remove: "Poista",
      },
      en: {
        title: "Lists",
        body: "Name a list, set rules, then fill it from matching companies or a previous search.",
        name: "List name",
        desc: "Description",
        industry: "Industry",
        city: "Municipality",
        any: "No filter",
        web: "Website required",
        email: "Email required",
        dm: "Decision-maker required",
        phone: "Phone required",
        country: "Country",
        match: "Match score at least",
        matchedOnly: "Matched companies only (skip rejects)",
        revenue: "Published revenue at least (EUR)",
        create: "Create list",
        empty: "No lists",
        emptyBody: "Create a list, define rules, then fill it with companies.",
        members: "members",
        fillRules: "Fill from rules",
        fillRun: "Fill from a search",
        pickRun: "Choose a search",
        saveRules: "Save rules",
        added: "Added",
        noneAdded: "No new rows",
        noMembers: "No members yet.",
        remove: "Remove",
      },
      sv: {
        title: "Listor",
        body: "Namnge listan, sätt regler och fyll den från matchande bolag eller en tidigare sökning.",
        name: "Listnamn",
        desc: "Beskrivning",
        industry: "Bransch",
        city: "Kommun",
        any: "Ingen filter",
        web: "Webbplats krävs",
        email: "E-post krävs",
        dm: "Beslutsfattare krävs",
        phone: "Telefon krävs",
        country: "Land",
        match: "Träff minst",
        matchedOnly: "Endast sökträffar",
        revenue: "Publicerad omsättning minst (EUR)",
        create: "Skapa lista",
        empty: "Inga listor",
        emptyBody: "Skapa en lista, definiera regler och fyll den med bolag.",
        members: "medlemmar",
        fillRules: "Fyll från regler",
        fillRun: "Fyll från sökning",
        pickRun: "Välj sökning",
        saveRules: "Spara regler",
        added: "Tillagda",
        noneAdded: "Inga nya rader",
        noMembers: "Inga medlemmar ännu.",
        remove: "Ta bort",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lists"], queryFn: () => listLists() });
  const runs = useQuery({ queryKey: ["runs-short"], queryFn: () => listRuns({ data: {} }) });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState<ListRules>(EMPTY_LIST_RULES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [runId, setRunId] = useState("");
  const detail = useQuery({
    queryKey: ["list", openId],
    queryFn: () => getList({ data: { listId: openId } }),
    enabled: Boolean(openId),
  });

  const create = useMutation({
    mutationFn: () => createList({ data: { name, description, rules } }),
    onSuccess: (r) => {
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setName("");
      setDescription("");
      setRules(EMPTY_LIST_RULES);
      setOpenId(r.id);
      void qc.invalidateQueries({ queryKey: ["lists"] });
    },
  });

  const rows = q.data?.lists ?? [];
  const runRows = (runs.data?.runs ?? []) as Array<{ id: string; name?: string | null; created_at?: string; stats?: Record<string, number> }>;
  const ruleCopy = { industry: copy.industry, city: copy.city, any: copy.any, revenue: copy.revenue, web: copy.web, email: copy.email, dm: copy.dm, phone: copy.phone, country: copy.country, match: copy.match, matchedOnly: copy.matchedOnly };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-mute">{copy.body}</p>
      </div>
      <form
        className="max-w-2xl space-y-3 border border-line bg-panel p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label={copy.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={copy.desc}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <RulesFields value={rules} onChange={setRules} copy={ruleCopy} locale={locale} />
        <Button type="submit" disabled={create.isPending || !name.trim()}>{copy.create}</Button>
      </form>
      {rows.length === 0 ? (
        <Empty title={copy.empty} body={copy.emptyBody} />
      ) : (
        <div className="border border-line">
          {rows.map((l: any) => {
            const parsed = parseListRules(l.rules);
            return (
              <button
                type="button"
                key={l.id}
                onClick={() => setOpenId(l.id)}
                className={`flex w-full items-center justify-between border-b border-line px-3 py-3 text-left text-sm last:border-0 ${openId === l.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
              >
                <span>
                  <span className="font-medium">{asDisplay(l.name)}</span>
                  <span className="mt-1 block text-xs text-mute">{listRulesSummary(parsed, locale)}</span>
                </span>
                <span className="font-mono text-mute">{asDisplay(l.n, "0")} {copy.members}</span>
              </button>
            );
          })}
        </div>
      )}
      {openId && detail.data?.ok ? (
        <section className="space-y-4 border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{asDisplay(detail.data.list.name)}</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await updateList({ data: { listId: openId, name: detail.data.list.name, description: detail.data.list.description, rules: detail.data.list.rules } });
                toast.message(ta("saved"));
                void qc.invalidateQueries({ queryKey: ["lists"] });
              }}
            >
              {copy.saveRules}
            </Button>
          </div>
          <RulesFields
            value={parseListRules(detail.data.list.rules)}
            onChange={(next) => {
              void qc.setQueryData(["list", openId], { ...detail.data, list: { ...detail.data.list, rules: next } });
            }}
            copy={ruleCopy}
            locale={locale}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const r = await fillList({ data: { listId: openId, rules: parseListRules(detail.data.list.rules) } });
                toast.message(r.added ? `${copy.added} ${r.added}` : copy.noneAdded);
                void qc.invalidateQueries({ queryKey: ["list", openId] });
                void qc.invalidateQueries({ queryKey: ["lists"] });
              }}
            >
              {copy.fillRules}
            </Button>
            <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="max-w-xs">
              <option value="">{copy.pickRun}</option>
              {runRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {asDisplay(r.name, String(r.id).slice(0, 8))} · {r.stats?.discovered ?? r.stats?.companies ?? 0} · {String(r.created_at ?? "").slice(0, 10)}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!runId}
              onClick={async () => {
                const r = await fillList({ data: { listId: openId, runId, rules: parseListRules(detail.data.list.rules) } });
                toast.message(r.added ? `${copy.added} ${r.added}${r.skipped ? ` · skip ${r.skipped}` : ""}` : copy.noneAdded);
                void qc.invalidateQueries({ queryKey: ["list", openId] });
                void qc.invalidateQueries({ queryKey: ["lists"] });
              }}
            >
              {copy.fillRun}
            </Button>
          </div>
          <div className="border border-line">
            {(detail.data.members ?? []).length === 0 ? (
              <p className="px-3 py-3 text-sm text-mute">{copy.noMembers}</p>
            ) : (detail.data.members ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
                <Link to="/companies/$companyId" params={{ companyId: m.id }} className="hover:underline">
                  {asDisplay(m.name)}
                  <span className="ml-2 text-xs text-mute">{[m.municipality, m.business_id].filter(Boolean).join(" · ")}</span>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await removeFromList({ data: { listId: openId, companyId: m.id } });
                    void qc.invalidateQueries({ queryKey: ["list", openId] });
                    void qc.invalidateQueries({ queryKey: ["lists"] });
                  }}
                >
                  {copy.remove}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
