import { Field, Input } from "@/components/ui/field";
import { loc } from "@/lib/content/locale";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_LEAD_PREFS, type LeadPrefs } from "@/lib/norr/prefs";

function useCopy() {
  const { locale } = useI18n();
  return loc(
    {
      fi: {
        title: "Millainen on hyvä liidi?",
        body: "Nämä ehdot pysyvät tililläsi. Voit muuttaa niitä asetuksissa. Haku ei keksitytä puuttuvia tietoja.",
        requireWebsite: "Verkkosivu on pakollinen",
        requireEmail: "Sähköposti on pakollinen",
        requireDecisionMaker: "Päättäjän nimi on pakollinen",
        preferPublishedRevenue: "Julkaistu liikevaihto on plussaa",
        websiteWeakOk: "Heikko sivusto on hyväksyttävä (myyntitilanne)",
        prioritizeNew: "Uudet yritykset ensin, jos olen hakenut ennen",
        minConfidence: "Vähimmäissopivuus (0–100)",
        minRevenue: "Julkaistu liikevaihto vähintään (EUR, tyhjä = ei rajaa)",
      },
      en: {
        title: "What makes a good lead?",
        body: "These rules stay on your account. You can change them in settings. Missing figures stay Not found.",
        requireWebsite: "Website is required",
        requireEmail: "Email is required",
        requireDecisionMaker: "A named decision-maker is required",
        preferPublishedRevenue: "Published revenue is a plus",
        websiteWeakOk: "A weak website is acceptable (sales situation)",
        prioritizeNew: "New companies first when I have searched before",
        minConfidence: "Minimum match score (0–100)",
        minRevenue: "Published revenue at least (EUR, empty = no floor)",
      },
      sv: {
        title: "Vad är ett bra lead?",
        body: "Reglerna sparas på kontot. Du kan ändra dem i inställningarna. Saknade tal förblir Not found.",
        requireWebsite: "Webbplats krävs",
        requireEmail: "E-post krävs",
        requireDecisionMaker: "Namngiven beslutsfattare krävs",
        preferPublishedRevenue: "Publicerad omsättning är ett plus",
        websiteWeakOk: "En svag sajt är acceptabel (säljsituation)",
        prioritizeNew: "Nya bolag först när jag sökt tidigare",
        minConfidence: "Minsta matchningspoäng (0–100)",
        minRevenue: "Publicerad omsättning minst (EUR, tom = ingen gräns)",
      },
    },
    locale,
  );
}

export function LeadPrefsForm({
  value,
  onChange,
  heading = true,
}: {
  value: LeadPrefs;
  onChange: (next: LeadPrefs) => void;
  heading?: boolean;
}) {
  const copy = useCopy();
  const set = (patch: Partial<LeadPrefs>) => onChange({ ...DEFAULT_LEAD_PREFS, ...value, ...patch });
  return (
    <fieldset className="space-y-3 border border-line bg-panel p-4">
      {heading ? (
        <legend className="px-1 text-sm font-medium">{copy.title}</legend>
      ) : (
        <div className="text-sm font-medium">{copy.title}</div>
      )}
      <p className="text-xs text-mute">{copy.body}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.requireWebsite} onChange={(e) => set({ requireWebsite: e.target.checked })} />
        <span>{copy.requireWebsite}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.requireEmail} onChange={(e) => set({ requireEmail: e.target.checked })} />
        <span>{copy.requireEmail}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.requireDecisionMaker} onChange={(e) => set({ requireDecisionMaker: e.target.checked })} />
        <span>{copy.requireDecisionMaker}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.preferPublishedRevenue} onChange={(e) => set({ preferPublishedRevenue: e.target.checked })} />
        <span>{copy.preferPublishedRevenue}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.websiteWeakOk} onChange={(e) => set({ websiteWeakOk: e.target.checked })} />
        <span>{copy.websiteWeakOk}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.prioritizeNew} onChange={(e) => set({ prioritizeNew: e.target.checked })} />
        <span>{copy.prioritizeNew}</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={copy.minConfidence}>
          <Input
            type="number"
            min={0}
            max={100}
            value={value.minConfidence}
            onChange={(e) => set({ minConfidence: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          />
        </Field>
        <Field label={copy.minRevenue}>
          <Input
            type="number"
            min={0}
            value={value.minRevenue ?? ""}
            placeholder=""
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ minRevenue: e.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : n });
            }}
          />
        </Field>
      </div>
    </fieldset>
  );
}
