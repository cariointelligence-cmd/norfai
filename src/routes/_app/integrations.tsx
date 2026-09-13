import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectCrm, getCrmStatus, saveCrmToken } from "@/lib/norr/ops-actions";
import { TAJU_DEFAULT_ENDPOINT, type CrmProvider } from "@/lib/norr/crm";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Pill } from "@/components/status";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integrations")({ component: Integrations });

function Integrations() {
  const { locale } = useI18n();
  const copy = loc(
    {
      fi: {
        title: "CRM",
        body: "Yksisuuntainen vienti. Liitä yksityinen API-avain. Avainta ei näytetä uudelleen. Norf ei merkitse yhteyttä, ennen kuin avain on tallennettu.",
        hubspot: "HubSpot-yksityinen sovellusavain",
        pipedrive: "Pipedrive API-token",
        taju: "TAJU CRM API-avain",
        tajuHint: "TAJU → Asetukset → API → New API Key. Ruksi leads:write. Kopioi avain heti. Älä käytä Webhooks-korttia, se on ulospäin Zapieriin ja Makeen. API-osoite on valmiina, jätä kenttä tyhjäksi jos TAJU näyttää saman URL:n.",
        tajuEndpoint: "API-osoite (valinnainen)",
        tajuOpen: "Avaa TAJU Asetukset",
        save: "Tallenna avain",
        disconnect: "Katkaise",
        notConnected: "Ei yhdistetty",
        connected: "Avain tallennettu",
        last4: "Päättyy",
        lastPush: "Viimeisin vienti",
        never: "Ei vielä",
        endpointSaved: "Osoite",
      },
      en: {
        title: "CRM",
        body: "One-way push. Paste a private API token. The token is not shown again. Norf never claims connected until a token is stored.",
        hubspot: "HubSpot private app token",
        pipedrive: "Pipedrive API token",
        taju: "TAJU CRM API key",
        tajuHint: "TAJU → Settings → API → New API Key. Grant leads:write. Copy the key immediately. Do not use the Webhooks card, that is outbound to Zapier and Make. Leave the URL blank unless TAJU shows a different one.",
        tajuEndpoint: "API endpoint (optional)",
        tajuOpen: "Open TAJU Settings",
        save: "Save token",
        disconnect: "Disconnect",
        notConnected: "Not connected",
        connected: "Token stored",
        last4: "Ends with",
        lastPush: "Last push",
        never: "Not yet",
        endpointSaved: "Endpoint",
      },
      sv: {
        title: "CRM",
        body: "Envägs export. Klistra in en privat API-nyckel. Nyckeln visas inte igen. Norf säger inte ansluten förrän en nyckel är sparad.",
        hubspot: "HubSpot privat app-nyckel",
        pipedrive: "Pipedrive API-token",
        taju: "TAJU CRM API-nyckel",
        tajuHint: "TAJU → Inställningar → API → New API Key. Ge leads:write. Kopiera nyckeln direkt. Använd inte Webhooks-kortet, det går utåt till Zapier. Lämna URL tom om TAJU visar samma adress.",
        tajuEndpoint: "API-adress (valfri)",
        tajuOpen: "Öppna TAJU Inställningar",
        save: "Spara nyckel",
        disconnect: "Koppla från",
        notConnected: "Inte ansluten",
        connected: "Nyckel sparad",
        last4: "Slutar med",
        lastPush: "Senaste export",
        never: "Inte ännu",
        endpointSaved: "Adress",
      },
    },
    locale,
  );
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["crm"], queryFn: () => getCrmStatus() });
  const [hub, setHub] = useState("");
  const [pipe, setPipe] = useState("");
  const [taju, setTaju] = useState("");
  const [tajuUrl, setTajuUrl] = useState("");

  function labelFor(provider: CrmProvider) {
    if (provider === "hubspot") return "HubSpot";
    if (provider === "pipedrive") return "Pipedrive";
    return "TAJU CRM";
  }

  function card(provider: CrmProvider, label: string, value: string, set: (v: string) => void) {
    const row = (q.data?.connections ?? []).find((c: { provider: string }) => c.provider === provider);
    const really = Boolean(row?.last4) || Boolean(row?.connected);
    const savedEndpoint = provider === "taju" ? (row?.portal || q.data?.tajuEndpoint || TAJU_DEFAULT_ENDPOINT) : null;
    return (
      <section className="space-y-3 border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{labelFor(provider)}</h2>
          <Pill tone={really ? "good" : "mute"}>{really ? copy.connected : copy.notConnected}</Pill>
        </div>
        {provider === "taju" ? (
          <p className="text-xs text-mute">
            {copy.tajuHint}{" "}
            <a className="underline decoration-line underline-offset-2" href="https://tajucrm.com/settings" target="_blank" rel="noreferrer">
              {copy.tajuOpen}
            </a>
          </p>
        ) : null}
        {really ? (
          <p className="text-xs text-mute">
            {row.last4 ? `${copy.last4} ••••${row.last4}. ` : null}
            {copy.lastPush}: {row.lastPushAt ? formatWhen(row.lastPushAt, copy.never, locale) : copy.never}
            {provider === "taju" && savedEndpoint ? (
              <span className="mt-1 block break-all text-faint">{copy.endpointSaved}: {savedEndpoint}</span>
            ) : null}
            {row.lastError ? <span className="block text-bad">{String(row.lastError)}</span> : null}
          </p>
        ) : (
          <p className="text-xs text-mute">{copy.notConnected}</p>
        )}
        <Field label={label}>
          <Input type="password" autoComplete="off" value={value} onChange={(e) => set(e.target.value)} />
        </Field>
        {provider === "taju" ? (
          <Field label={copy.tajuEndpoint}>
            <Input
              type="url"
              autoComplete="off"
              value={tajuUrl}
              onChange={(e) => setTajuUrl(e.target.value)}
              placeholder={savedEndpoint || TAJU_DEFAULT_ENDPOINT}
            />
          </Field>
        ) : null}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!value.trim()}
            onClick={() => {
              void saveCrmToken({
                data: {
                  provider,
                  token: value,
                  endpoint: provider === "taju" ? tajuUrl : undefined,
                },
              }).then((r) => {
                if (!r.ok) toast.error(r.error ?? copy.notConnected);
                else {
                  set("");
                  if (provider === "taju") setTajuUrl("");
                  toast.message(copy.connected);
                  void qc.invalidateQueries({ queryKey: ["crm"] });
                }
              });
            }}
          >
            {copy.save}
          </Button>
          {really ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void disconnectCrm({ data: { provider } }).then(() => {
                  void qc.invalidateQueries({ queryKey: ["crm"] });
                  toast.message(copy.disconnect);
                });
              }}
            >
              {copy.disconnect}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">{copy.body}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {card("taju", copy.taju, taju, setTaju)}
        {card("hubspot", copy.hubspot, hub, setHub)}
        {card("pipedrive", copy.pipedrive, pipe, setPipe)}
      </div>
    </div>
  );
}
