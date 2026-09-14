import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { CriteriaGroup, Criterion, SearchCriteria } from "@/lib/norr/types";
import { INDUSTRIES, LEGAL_FORMS, MUNICIPALITIES } from "@/lib/norr/finland";
import { ROLE_ALIASES } from "@/lib/norr/types";
import { nid } from "@/lib/utils";
import { BOOLEAN_FIELDS, defaultOpForField, estimateScope, FIELD_GROUPS, fieldLabel, opLabel } from "@/lib/norr/criteria";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { ENGINE_SEARCH_CEILING, clampRequestedLeads, isUnlimitedQuota } from "@/lib/norr/platform";

function updateRule(group: CriteriaGroup, id: string, patch: Partial<Criterion>): CriteriaGroup {
  return {
    ...group,
    rules: group.rules.map((r) => {
      if ("rules" in r) return updateRule(r, id, patch);
      if (r.id === id) return { ...r, ...patch };
      return r;
    }),
  };
}

function addRule(group: CriteriaGroup, rule: Criterion): CriteriaGroup {
  return { ...group, rules: [...group.rules, rule] };
}

function removeRule(group: CriteriaGroup, id: string): CriteriaGroup {
  return { ...group, rules: group.rules.filter((r) => ("id" in r ? r.id !== id : true)) };
}

const ROLE_I18N: Record<string, { fi: string; en: string; sv: string }> = {
  ceo: { fi: "Toimitusjohtaja", en: "CEO / Managing director", sv: "VD" },
  founder: { fi: "Perustaja", en: "Founder", sv: "Grundare" },
  owner: { fi: "Omistaja", en: "Owner", sv: "Ägare" },
  chair: { fi: "Puheenjohtaja", en: "Chair", sv: "Ordförande" },
  board: { fi: "Hallituksen jäsen", en: "Board member", sv: "Styrelseledamot" },
  coo: { fi: "Operatiivinen johtaja", en: "COO", sv: "Operativ chef" },
  cfo: { fi: "Talousjohtaja", en: "CFO", sv: "Ekonomichef" },
  cto: { fi: "Teknologiajohtaja", en: "CTO", sv: "Teknikchef" },
  cio: { fi: "Tietohallintojohtaja", en: "CIO", sv: "IT-chef" },
  ciso: { fi: "Tietoturvajohtaja", en: "CISO", sv: "Säkerhetschef" },
  cmo: { fi: "Markkinointijohtaja", en: "CMO", sv: "Marknadschef" },
  sales_director: { fi: "Myyntijohtaja", en: "Sales director", sv: "Försäljningschef" },
  marketing_director: { fi: "Markkinointijohtaja", en: "Marketing director", sv: "Marknadschef" },
  procurement_director: { fi: "Hankintajohtaja", en: "Procurement director", sv: "Inköpschef" },
  operations_director: { fi: "Toimintajohtaja", en: "Operations director", sv: "Verksamhetschef" },
  hr_director: { fi: "Henkilöstöjohtaja", en: "HR director", sv: "HR-chef" },
  property_manager: { fi: "Kiinteistöpäällikkö", en: "Property manager", sv: "Fastighetschef" },
  project_director: { fi: "Projektijohtaja", en: "Project director", sv: "Projektchef" },
  construction_manager: { fi: "Työmaapäällikkö", en: "Construction manager", sv: "Byggchef" },
  technical_director: { fi: "Tekninen johtaja", en: "Technical director", sv: "Teknisk chef" },
  it_director: { fi: "IT-johtaja", en: "IT director", sv: "IT-chef" },
  partner: { fi: "Osakas", en: "Partner", sv: "Partner" },
};

export function CriteriaBuilder({
  value,
  onChange,
  perSearch = 50,
}: {
  value: SearchCriteria;
  onChange: (c: SearchCriteria) => void;
  perSearch?: number;
}) {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        geography: "Sijainti",
        country: "Maa",
        municipality: "Kunta",
        radius: "Säde km (kunnasta)",
        any: "Kaikki",
        conditions: "Ehdot",
        and: "Kaikki ehdot (AND)",
        or: "Mikä tahansa ehto (OR)",
        field: "Kenttä",
        op: "Vertailu",
        value: "Arvo",
        add: "Lisää ehto",
        remove: "Poista",
        people: "Päättäjät ja määrä",
        max: "Yrityksiä tässä haussa enintään",
        depth: "Haun syvyys",
        normal: "Normaali (nopeampi)",
        deep: "Syvä (enemmän lähteitä ja sivuja)",
        scope: "Arvioitu laajuus",
        sources: "Lähteet jotka voivat käydä",
        limits: "Rajoitukset",
        identity: "Yritys",
        size: "Koko ja ikä",
        web: "Sivusto ja yhteystieto",
        signals: "Signaalit",
        hint: "Valitse kenttä arkikielellä. Julkaistu liikevaihto tulee tilinpäätöksestä. Tyhjä jää UNKNOWN.",
        countryHint: "YTJ-rekisteri on live Suomessa. NO/DK/SE täyttyvät avoimista rekistereistä jos ne löytävät osumia. GB/DE/US eivät ole rekisterihaku.",
      },
      en: {
        geography: "Geography",
        country: "Country",
        municipality: "Municipality",
        radius: "Radius km (from the city)",
        any: "Any",
        conditions: "Conditions",
        and: "All conditions (AND)",
        or: "Any condition (OR)",
        field: "Field",
        op: "Comparison",
        value: "Value",
        add: "Add condition",
        remove: "Remove",
        people: "Decision-makers and volume",
        max: "Max companies this run",
        depth: "Search depth",
        normal: "Normal (faster)",
        deep: "Deep (more sources and pages)",
        scope: "Estimated scope",
        sources: "Sources that can run",
        limits: "Limitations",
        identity: "Company",
        size: "Size and age",
        web: "Website and contact",
        signals: "Signals",
        hint: "Pick fields in plain language. Published revenue comes from accounts. Empty stays UNKNOWN.",
        countryHint: "YTJ register search is live for Finland. NO/DK/SE use open registers when they return hits. GB/DE/US are not register search.",
      },
      sv: {
        geography: "Geografi",
        country: "Land",
        municipality: "Kommun",
        radius: "Radie km (från staden)",
        any: "Alla",
        conditions: "Villkor",
        and: "Alla villkor (AND)",
        or: "Något villkor (OR)",
        field: "Fält",
        op: "Jämförelse",
        value: "Värde",
        add: "Lägg till villkor",
        remove: "Ta bort",
        people: "Beslutsfattare och volym",
        max: "Max bolag i denna körning",
        depth: "Sökdjup",
        normal: "Normal (snabbare)",
        deep: "Djup (fler källor och sidor)",
        scope: "Uppskattad omfattning",
        sources: "Källor som kan köras",
        limits: "Begränsningar",
        identity: "Bolag",
        size: "Storlek och ålder",
        web: "Sajt och kontakt",
        signals: "Signaler",
        hint: "Välj fält på vardagsspråk. Publicerad omsättning kommer från bokslut. Tomt förblir UNKNOWN.",
        countryHint: "YTJ-register är live för Finland. NO/DK/SE använder öppna register när de ger träffar. GB/DE/US är inte registerökning.",
      },
    },
    locale,
  );
  const groupLabel: Record<string, string> = {
    identity: copy.identity,
    size: copy.size,
    web: copy.web,
    signals: copy.signals,
  };
  const scope = estimateScope(value);
  const set = (patch: Partial<SearchCriteria>) => onChange({ ...value, ...patch });
  const industryLabel = (code: string, labelEn: string, labelFi?: string) =>
    locale === "en" ? `${code} ${labelEn}` : `${code} ${labelFi || labelEn}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <p className="text-xs text-mute">{copy.hint}</p>
        <section className="border border-line bg-panel p-4 md:p-5">
          <h2 className="mb-4 text-sm font-medium">{copy.geography}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={copy.country}>
              <Select value={value.country} onChange={(e) => set({ country: e.target.value })}>
                <option value="FI">Finland</option>
                <option value="NO">Norway</option>
                <option value="DK">Denmark</option>
                <option value="SE">Sweden</option>
                <option value="GB">United Kingdom</option>
                <option value="DE">Germany</option>
                <option value="US">United States</option>
                <option value="EU">EU (procurement + GLEIF)</option>
              </Select>
              {value.country && value.country !== "FI" ? (
                <p className="mt-1 text-xs text-mute">{copy.countryHint}</p>
              ) : null}
            </Field>
            <Field label={copy.municipality}>
              <Select
                value={String(value.groups.rules.find((r) => !("rules" in r) && r.field === "municipality") ? (value.groups.rules.find((r) => !("rules" in r) && r.field === "municipality") as Criterion).value ?? "" : "")}
                onChange={(e) => {
                  const rest = value.groups.rules.filter((r) => "rules" in r || r.field !== "municipality");
                  const rules = e.target.value
                    ? [...rest, { id: nid(), field: "municipality" as const, op: "eq" as const, value: e.target.value }]
                    : rest;
                  set({ groups: { ...value.groups, rules } });
                }}
              >
                <option value="">{copy.any}</option>
                {MUNICIPALITIES.map((m) => (
                  <option key={m.name + m.code} value={m.name}>
                    {locale === "sv" && m.nameSv ? m.nameSv : m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={copy.radius}>
              <Input
                type="number"
                min={0}
                placeholder="100"
                onChange={(e) => {
                  const rest = value.groups.rules.filter((r) => "rules" in r || r.field !== "radius");
                  const v = e.target.value;
                  const rules = v ? [...rest, { id: nid(), field: "radius" as const, op: "within_km" as const, value: Number(v) }] : rest;
                  set({ groups: { ...value.groups, rules } });
                }}
              />
            </Field>
          </div>
        </section>

        <section className="border border-line bg-panel p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{copy.conditions}</h2>
            <Select
              className="w-auto min-w-44"
              value={value.groups.combinator}
              onChange={(e) => set({ groups: { ...value.groups, combinator: e.target.value as "and" | "or" } })}
            >
              <option value="and">{copy.and}</option>
              <option value="or">{copy.or}</option>
            </Select>
          </div>
          <div className="space-y-3">
            {value.groups.rules.map((r) => {
              if ("rules" in r) return null;
              const isBool = BOOLEAN_FIELDS.has(r.field);
              const hideValue = r.op === "exists";
              return (
                <div key={r.id} className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <Field label={copy.field}>
                    <Select
                      value={r.field}
                      onChange={(e) => {
                        const field = e.target.value as Criterion["field"];
                        const op = defaultOpForField(field);
                        const next: Partial<Criterion> = { field, op };
                        if (BOOLEAN_FIELDS.has(field)) next.value = true;
                        set({ groups: updateRule(value.groups, r.id, next) });
                      }}
                    >
                      {FIELD_GROUPS.map((g) => (
                        <optgroup key={g.id} label={groupLabel[g.id] ?? g.id}>
                          {g.fields.map((f) => (
                            <option key={f} value={f}>{fieldLabel(f, locale)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </Field>
                  {isBool ? (
                    <Field label={copy.value}>
                      <Select
                        value={String(r.value ?? "true")}
                        onChange={(e) => set({ groups: updateRule(value.groups, r.id, { op: "eq", value: e.target.value === "true" }) })}
                      >
                        <option value="true">{ta("yes")}</option>
                        <option value="false">{ta("no")}</option>
                      </Select>
                    </Field>
                  ) : (
                    <Field label={copy.op}>
                      <Select value={r.op} onChange={(e) => set({ groups: updateRule(value.groups, r.id, { op: e.target.value as Criterion["op"] }) })}>
                        {(["eq", "neq", "contains", "gte", "lte", "exists"] as const).map((op) => (
                          <option key={op} value={op}>{opLabel(op, locale)}</option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {isBool ? <div /> : hideValue ? (
                    <p className="pb-3 text-xs text-mute">{opLabel("exists", locale)}</p>
                  ) : (
                    <Field label={copy.value}>
                      {r.field === "industry" ? (
                        <Select value={String(r.value ?? "")} onChange={(e) => set({ groups: updateRule(value.groups, r.id, { value: e.target.value }) })}>
                          <option value="">{copy.any} / Kaikki toimialat</option>
                          {INDUSTRIES.map((i) => (
                            <option key={i.code} value={i.code}>{industryLabel(i.code, i.labelEn, i.labelFi)}</option>
                          ))}
                        </Select>
                      ) : r.field === "legal_form" ? (
                        <Select value={String(r.value ?? "")} onChange={(e) => set({ groups: updateRule(value.groups, r.id, { value: e.target.value }) })}>
                          {LEGAL_FORMS.map((f) => <option key={f.code} value={f.ytj}>{locale === "en" ? f.labelEn : f.labelFi ?? f.labelEn}</option>)}
                        </Select>
                      ) : (
                        <Input value={String(r.value ?? "")} onChange={(e) => set({ groups: updateRule(value.groups, r.id, { value: e.target.value }) })} />
                      )}
                    </Field>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ groups: removeRule(value.groups, r.id) })}>
                    {copy.remove}
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => set({ groups: addRule(value.groups, { id: nid(), field: "keyword", op: "contains", value: "" }) })}
            >
              {copy.add}
            </Button>
          </div>
        </section>

        <section className="border border-line bg-panel p-4 md:p-5">
          <h2 className="mb-4 text-sm font-medium">{copy.people}</h2>
          <div className="flex flex-wrap gap-2">
            {Object.keys(ROLE_ALIASES).map((role) => {
              const on = value.roles.includes(role);
              const names = ROLE_I18N[role];
              const label = names ? (locale === "fi" ? names.fi : locale === "sv" ? names.sv : names.en) : role.replaceAll("_", " ");
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() =>
                    set({ roles: on ? value.roles.filter((r) => r !== role) : [...value.roles, role] })
                  }
                  className={
                    on
                      ? "border border-line-strong bg-panel-2 px-2 py-1 text-xs"
                      : "border border-line px-2 py-1 text-xs text-mute"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid max-w-lg gap-3 sm:grid-cols-2">
            <Field label={copy.max}>
              <Input
                type="number"
                min={1}
                max={isUnlimitedQuota(perSearch) ? ENGINE_SEARCH_CEILING : perSearch}
                value={value.maxResults}
                onChange={(e) =>
                  set({
                    maxResults: clampRequestedLeads(Number(e.target.value) || perSearch, perSearch),
                  })
                }
              />
            </Field>
            <Field label={copy.depth}>
              <Select value={value.depth ?? "normal"} onChange={(e) => set({ depth: e.target.value as "normal" | "deep" })}>
                <option value="normal">{copy.normal}</option>
                <option value="deep">{copy.deep}</option>
              </Select>
            </Field>
          </div>
        </section>
      </div>
      <aside className="h-fit border border-line bg-panel p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-faint">{copy.scope}</div>
        <p className="mt-2 text-sm text-ink">{scope.label}</p>
        <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-faint">{copy.sources}</div>
        <ul className="mt-2 space-y-1 text-xs text-mute">
          {scope.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div className="mt-4 text-[11px] uppercase tracking-[0.14em] text-faint">{copy.limits}</div>
        <ul className="mt-2 space-y-2 text-xs text-mute">
          {scope.limitations.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
