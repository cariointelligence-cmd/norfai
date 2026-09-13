import { Field, Input, Select } from "@/components/ui/field";
import type { SearchCriteria } from "@/lib/norr/types";
import type { CustomerType, TargetSpec } from "@/lib/norr/targeting/spec";
import { SIMPLE_AGE, SIMPLE_REVENUE, leadCountChoices } from "@/lib/norr/targeting/spec";
import { ENGINE_SEARCH_CEILING, clampRequestedLeads, isUnlimitedQuota } from "@/lib/norr/platform";
import { INDUSTRY_GROUPS, INDUSTRIES, groupForIndustryCodes } from "@/lib/norr/finland";
import { firstValue, setIndustryCodes, setMunicipality, valuesOf } from "@/lib/norr/criteria";

function setTarget(c: SearchCriteria, patch: TargetSpec): SearchCriteria {
  return {
    ...c,
    target: {
      ...c.target,
      ...patch,
      financial: { ...c.target?.financial, ...patch.financial },
      website: { ...c.target?.website, ...patch.website },
      company: { ...c.target?.company, ...patch.company },
      advertising: { ...c.target?.advertising, ...patch.advertising },
    },
  };
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "min-h-11 rounded-[var(--radius-sm)] border border-line-strong bg-panel-2 px-4 text-sm text-ink"
          : "min-h-11 rounded-[var(--radius-sm)] border border-line bg-canvas px-4 text-sm text-mute hover:border-line-strong hover:text-ink"
      }
    >
      {children}
    </button>
  );
}

function Question({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel p-4 md:p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs tabular text-faint">{String(n).padStart(2, "0")}</span>
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {hint ? <p className="mt-1 text-xs text-mute">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TargetingBuilder({
  value,
  onChange,
  perSearch = 50,
}: {
  value: SearchCriteria;
  onChange: (c: SearchCriteria) => void;
  perSearch?: number;
}) {
  const t = value.target ?? {};
  const counts = leadCountChoices(perSearch);
  const unlimited = isUnlimitedQuota(perSearch);
  const groupId = groupForIndustryCodes(valuesOf(value, "industry").map(String));
  const city = String(firstValue(value, "municipality") ?? "");
  const revenue = t.financial?.revenue;
  const age = t.company?.ageYears;
  const customer = t.customerType;

  return (
    <div className="space-y-4">
      <Question n={1} title="What industry?" hint="Optional. Kaikki toimialat does not filter the register. A city or keyword still bounds the search.">
        <Select
          value={groupId || "all"}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "all" || id === "") {
              onChange(setIndustryCodes(value, ["ALL"]));
              return;
            }
            const g = INDUSTRY_GROUPS.find((x) => x.id === id);
            if (g) {
              onChange(setIndustryCodes(value, g.codes));
              return;
            }
            onChange(setIndustryCodes(value, [id]));
          }}
        >
          <option value="all">Kaikki toimialat / All industries</option>
          <optgroup label="Common categories">
            {INDUSTRY_GROUPS.filter((g) => g.id !== "all").map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="All register industries (TOL)">
            {INDUSTRIES.map((i) => (
              <option key={i.code} value={i.code}>
                {i.code} · {i.labelEn} / {i.labelFi}
              </option>
            ))}
          </optgroup>
        </Select>
      </Question>

      <Question n={2} title="Who do they sell to?" hint="Used when you have not picked an industry. If you have, the industry wins.">
        <div className="flex flex-wrap gap-2">
          {([
            ["b2b", "B2B companies"],
            ["b2c", "B2C consumers"],
            ["b2g", "B2G public sector"],
          ] as Array<[CustomerType, string]>).map(([id, label]) => (
            <Choice
              key={id}
              on={customer === id}
              onClick={() => onChange(setTarget(value, { customerType: customer === id ? undefined : id }))}
            >
              {label}
            </Choice>
          ))}
        </div>
      </Question>

      <Question n={3} title="Where?" hint="Leave empty for all of Finland. A city is a starting point; if it is short of the count, the rest of Finland fills in.">
        <Input
          value={city}
          onChange={(e) => onChange(setMunicipality(value, e.target.value))}
          placeholder="All of Finland, or a city such as Helsinki"
        />
      </Question>

      <Question n={4} title="Published revenue?" hint="Most Finnish companies have no public revenue figure. Unknown stays in the list unless you require a published number.">
        <div className="flex flex-wrap gap-2">
          {SIMPLE_REVENUE.map((b) => {
            const on =
              b.id === "any"
                ? !revenue?.min && !revenue?.max
                : revenue?.min === b.min && revenue?.max === b.max;
            return (
              <Choice
                key={b.id}
                on={on}
                onClick={() =>
                  onChange(
                    setTarget(value, {
                      financial: {
                        revenue:
                          b.id === "any"
                            ? undefined
                            : { min: b.min, max: b.max, unknown: "allow" },
                      },
                    }),
                  )
                }
              >
                {b.label}
              </Choice>
            );
          })}
        </div>
      </Question>

      <Question n={5} title="How many companies?">
        <div className="flex flex-wrap gap-2">
          {counts.map((n) => (
            <Choice key={n} on={value.maxResults === n} onClick={() => onChange({ ...value, maxResults: n })}>
              {n.toLocaleString("en")}
            </Choice>
          ))}
          {unlimited ? (
            <Choice
              on={value.maxResults === ENGINE_SEARCH_CEILING}
              onClick={() => onChange({ ...value, maxResults: ENGINE_SEARCH_CEILING })}
            >
              Max
            </Choice>
          ) : null}
        </div>
        {unlimited ? (
          <label className="mt-3 block text-xs text-mute">
            Custom
            <input
              type="number"
              min={1}
              max={ENGINE_SEARCH_CEILING}
              className="mt-1 w-40 border border-line bg-panel px-2 py-1 text-sm text-ink"
              value={value.maxResults}
              onChange={(e) =>
                onChange({ ...value, maxResults: clampRequestedLeads(Number(e.target.value) || 100, perSearch) })
              }
            />
          </label>
        ) : null}
      </Question>

      <Question n={6} title="Anything else?" hint="Optional. These rank the list. They do not invent missing data.">
        <div className="flex flex-wrap gap-2">
          {SIMPLE_AGE.filter((b) => b.id !== "any").map((b) => {
            const on = age?.min === b.min && age?.max === b.max;
            return (
              <Choice
                key={b.id}
                on={on}
                onClick={() =>
                  onChange(
                    setTarget(value, {
                      company: { ageYears: on ? undefined : { min: b.min, max: b.max, unknown: "allow" } },
                    }),
                  )
                }
              >
                {b.label}
              </Choice>
            );
          })}
          <Choice
            on={Boolean(t.website?.highOpportunity) || (t.website?.qualityScore?.max != null && t.website.qualityScore.max <= 50)}
            onClick={() => {
              const on = Boolean(t.website?.highOpportunity);
              onChange(
                setTarget(value, {
                  website: on
                    ? { highOpportunity: false, qualityScore: undefined }
                    : { highOpportunity: true, qualityScore: { max: 48, unknown: "allow" } },
                }),
              );
            }}
          >
            Weak website
          </Choice>
          <Choice
            on={t.advertising?.meta === "ACTIVE_OR_RECENT"}
            onClick={() =>
              onChange(
                setTarget(value, {
                  advertising: { meta: t.advertising?.meta === "ACTIVE_OR_RECENT" ? undefined : "ACTIVE_OR_RECENT" },
                }),
              )
            }
          >
            Visible ads
          </Choice>
        </div>
      </Question>
    </div>
  );
}
