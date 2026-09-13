import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getQuality, saveLeadPrefs } from "@/lib/norr/actions";
import { Stat } from "@/components/status";
import { Button } from "@/components/ui/button";
import { LeadPrefsForm } from "@/components/lead-prefs-form";
import { DEFAULT_LEAD_PREFS, parseLeadPrefs, type LeadPrefs } from "@/lib/norr/prefs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

export const Route = createFileRoute("/_app/quality")({ component: Quality });

function Quality() {
  const { locale, ta } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "Datalaatu",
        body: "Jokainen luku on COUNT(*) tästä työtilasta. Nolla on rehellinen. Määritä, millainen on hyvä liidi.",
        companies: "Yritykset",
        avg: "Keskimääräinen luottamus",
        avgHint: "Tyhjä kunnes yritys on pisteytetty",
        missingWeb: "Puuttuva sivusto",
        missingEmail: "Puuttuva sähköposti",
        published: "Julkaistut yhteystiedot",
        inferred: "Arvaillut yhteystiedot",
        inferredHint: "Ei merkitä varmennetuksi",
        rejected: "Hylätyt",
        observations: "Havainnot",
        matching: "Sopivat kriteereihisi",
        matchingHint: "Laskettu tallennetuista ehdoista",
        settings: "Tilin asetukset",
      },
      en: {
        title: "Data quality",
        body: "Every number is a COUNT(*) against this workspace. Zero is honest. Define what a good lead looks like.",
        companies: "Companies",
        avg: "Avg confidence",
        avgHint: "Null until a company is scored",
        missingWeb: "Missing website",
        missingEmail: "Missing email",
        published: "Published contacts",
        inferred: "Inferred contacts",
        inferredHint: "Never labelled verified",
        rejected: "Rejected records",
        observations: "Observations",
        matching: "Matching your lead rules",
        matchingHint: "Counted from the saved definition",
        settings: "Account settings",
      },
      sv: {
        title: "Datakvalitet",
        body: "Varje tal är COUNT(*) mot den här arbetsytan. Noll är ärligt. Definiera vad ett bra lead är.",
        companies: "Bolag",
        avg: "Snittillförlitlighet",
        avgHint: "Tom tills bolaget poängsatts",
        missingWeb: "Saknad sajt",
        missingEmail: "Saknad e-post",
        published: "Publicerade kontakter",
        inferred: "Gissade kontakter",
        inferredHint: "Märks aldrig som verifierade",
        rejected: "Avvisade",
        observations: "Observationer",
        matching: "Matchar dina regler",
        matchingHint: "Räknat från den sparade definitionen",
        settings: "Kontoinställningar",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["quality"], queryFn: () => getQuality() });
  const [prefs, setPrefs] = useState<LeadPrefs>(DEFAULT_LEAD_PREFS);
  useEffect(() => {
    if (q.data?.prefs) setPrefs(parseLeadPrefs(q.data.prefs));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () => saveLeadPrefs({ data: { prefs: { ...prefs, locale } } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.message(ta("saved"));
        void qc.invalidateQueries({ queryKey: ["quality"] });
        void qc.invalidateQueries({ queryKey: ["bootstrap"] });
      }
    },
  });
  const d = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-mute">{copy.body}</p>
      </div>
      {d ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={copy.companies} value={d.companies} />
          <Stat label={copy.avg} value={d.avgConfidence ?? "-"} hint={copy.avgHint} />
          <Stat label={copy.missingWeb} value={d.missingWebsite} />
          <Stat label={copy.missingEmail} value={d.missingEmail} />
          <Stat label={copy.published} value={d.publishedContacts} />
          <Stat label={copy.inferred} value={d.inferredContacts} hint={copy.inferredHint} />
          <Stat label={copy.rejected} value={d.rejected} />
          <Stat label={copy.observations} value={d.observations} />
          <Stat label={copy.matching} value={d.matchingPrefs ?? 0} hint={copy.matchingHint} />
        </div>
      ) : <p className="text-sm text-mute">{ta("loading")}</p>}
      <LeadPrefsForm value={prefs} onChange={setPrefs} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{ta("save")}</Button>
        <Link to="/settings" className="tap text-sm text-mute hover:text-ink">{copy.settings}</Link>
      </div>
    </div>
  );
}
