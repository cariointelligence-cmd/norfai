import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { saveOnboarding } from "@/lib/norr/actions";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { LeadPrefsForm } from "@/components/lead-prefs-form";
import { DEFAULT_LEAD_PREFS, type LeadPrefs } from "@/lib/norr/prefs";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/onboarding")({ component: Onboarding });

function Onboarding() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Aseta tämä työtila",
        body: "Kirjaa, miksi työtila käsittelee ammatillista dataa. Norf ei lähetä viestejä löydetyille ihmisille.",
        name: "Työtilan nimi",
        basis: "Oikeusperuste",
        li: "Oikeutettu etu (B2B-prospektointi)",
        contract: "Sopimus",
        legal: "Lakivelvoite",
        consent: "Suostumus",
        purpose: "Tarkoitus",
        retention: "Säilytys (päivää)",
        saving: "Tallennetaan…",
        continue: "Jatka",
        fail: "Tallennus ei onnistunut",
      },
      en: {
        title: "Set up this workspace",
        body: "Document why this workspace processes professional data. Norf never emails discovered people. Contacting is a separate workflow you run yourself.",
        name: "Workspace name",
        basis: "Lawful basis",
        li: "Legitimate interest (B2B prospecting)",
        contract: "Contract",
        legal: "Legal obligation",
        consent: "Consent",
        purpose: "Purpose",
        retention: "Retention (days)",
        saving: "Saving…",
        continue: "Continue",
        fail: "Could not save",
      },
      sv: {
        title: "Ställ in arbetsytan",
        body: "Dokumentera varför arbetsytan behandlar yrkesdata. Norf mejlar inte personerna den hittar.",
        name: "Arbetsytans namn",
        basis: "Rättslig grund",
        li: "Berättigat intresse (B2B-prospektering)",
        contract: "Avtal",
        legal: "Rättslig förpliktelse",
        consent: "Samtycke",
        purpose: "Ändamål",
        retention: "Lagring (dagar)",
        saving: "Sparar…",
        continue: "Fortsätt",
        fail: "Kunde inte spara",
      },
    },
    locale,
  );
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("Workspace");
  const [lawfulBasis, setLawfulBasis] = useState("legitimate_interest");
  const [purpose, setPurpose] = useState("B2B prospecting against public company registers");
  const [retentionDays, setRetentionDays] = useState(730);
  const [prefs, setPrefs] = useState<LeadPrefs>({ ...DEFAULT_LEAD_PREFS, locale });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveOnboarding({ data: { name, lawfulBasis, purpose, retentionDays, locale, prefs: { ...prefs, locale } } });
      await qc.invalidateQueries({ queryKey: ["bootstrap"] });
      nav({ to: "/overview" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : copy.fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
      <p className="text-sm text-mute">{copy.body}</p>
      <Field label={copy.name}>
        <Input id="workspace-name" name="workspaceName" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label={copy.basis}>
        <Select value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)}>
          <option value="legitimate_interest">{copy.li}</option>
          <option value="contract">{copy.contract}</option>
          <option value="legal_obligation">{copy.legal}</option>
          <option value="consent">{copy.consent}</option>
        </Select>
      </Field>
      <Field label={copy.purpose}>
        <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
      </Field>
      <Field label={copy.retention}>
        <Input type="number" min={30} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} />
      </Field>
      <LeadPrefsForm value={prefs} onChange={setPrefs} />
      <Button type="submit" disabled={busy}>{busy ? copy.saving : copy.continue}</Button>
    </form>
  );
}
