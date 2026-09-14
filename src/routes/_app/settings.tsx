import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBootstrap, saveLeadPrefs, saveWorkspace } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { LeadPrefsForm } from "@/components/lead-prefs-form";
import { DEFAULT_LEAD_PREFS, parseLeadPrefs, type LeadPrefs } from "@/lib/norr/prefs";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Työtilan asetukset",
        name: "Nimi",
        countries: "Sallitut maat",
        retention: "Säilytyspäivät",
        basis: "Oikeusperuste",
        purpose: "Tarkoitus",
        sessions: "Istunnot ja tunnukset",
        note: "Norf hakee avoimista rekistereistä ja yritysten sivustoilta automaattisesti.",
      },
      en: {
        title: "Workspace settings",
        name: "Name",
        countries: "Country allowlist",
        retention: "Retention days",
        basis: "Lawful basis",
        purpose: "Purpose",
        sessions: "Sessions & tokens",
        note: "Norf searches open registers and company websites automatically. Licensed connectors, if any, are configured by the platform, never in this workspace.",
      },
      sv: {
        title: "Arbetsytans inställningar",
        name: "Namn",
        countries: "Tillåtna länder",
        retention: "Lagringsdagar",
        basis: "Rättslig grund",
        purpose: "Ändamål",
        sessions: "Sessioner och token",
        note: "Norf söker i öppna register och bolagens sajter automatiskt.",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bootstrap"], queryFn: () => getBootstrap({ data: {} }) });
  const [name, setName] = useState("Workspace");
  const [retentionDays, setRetentionDays] = useState(730);
  const [countryAllowlist, setCountryAllowlist] = useState("FI");
  const [purpose, setPurpose] = useState("");
  const [lawfulBasis, setLawfulBasis] = useState("");
  const [prefs, setPrefs] = useState<LeadPrefs>({ ...DEFAULT_LEAD_PREFS, locale });
  useEffect(() => {
    if (!q.data) return;
    setName(q.data.workspace.name);
    setRetentionDays(q.data.workspace.retention_days);
    setCountryAllowlist(q.data.workspace.country_allowlist);
    setPurpose(q.data.workspace.purpose ?? "");
    setLawfulBasis(q.data.workspace.lawful_basis ?? "");
    setPrefs(parseLeadPrefs({ locale, ...q.data.workspace.preferences }));
  }, [q.data, locale]);
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
      <div className="flex items-center gap-3">
        <UserButton />
        <Link to="/security" className="text-sm text-mute hover:text-ink">{copy.sessions}</Link>
        <Link to="/tickets" className="text-sm text-mute hover:text-ink">Support</Link>
      </div>
      <Field label={copy.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={copy.countries}><Input value={countryAllowlist} onChange={(e) => setCountryAllowlist(e.target.value)} /></Field>
      <Field label={copy.retention}><Input type="number" value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} /></Field>
      <Field label={copy.basis}><Input value={lawfulBasis} onChange={(e) => setLawfulBasis(e.target.value)} /></Field>
      <Field label={copy.purpose}><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
      <LeadPrefsForm value={prefs} onChange={setPrefs} />
      <Button onClick={async () => {
        await saveWorkspace({ data: { name, retentionDays, countryAllowlist, purpose, lawfulBasis, prefs: { ...prefs, locale } } });
        await saveLeadPrefs({ data: { prefs: { ...prefs, locale } } });
        toast.message(ta("saved"));
        void qc.invalidateQueries({ queryKey: ["bootstrap"] });
        void qc.invalidateQueries({ queryKey: ["quality"] });
      }}>{ta("save")}</Button>
      <p className="text-xs text-mute">{copy.note}</p>
    </div>
  );
}
