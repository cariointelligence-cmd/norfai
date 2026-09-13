import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CriteriaBuilder } from "@/components/criteria-builder";
import { TargetingBuilder } from "@/components/targeting-builder";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { emptyCriteria, firstValue, valuesOf } from "@/lib/norr/criteria";
import { applyOpportunityPreset, getBootstrap, importSeeds, interpretPrompt, saveProfile } from "@/lib/norr/actions";
import { OPPORTUNITY_PRESETS, type OpportunityPresetId } from "@/lib/norr/targeting/spec";
import { clampRequestedLeads, perSearchFromBoot } from "@/lib/norr/platform";
import { BEGINNER_QUESTIONS } from "@/lib/norr/icp-compiler";
import type { SearchCriteria } from "@/lib/norr/types";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { loc } from "@/lib/content/locale";

function starterCriteria(): SearchCriteria {
  const c = emptyCriteria();
  c.maxResults = 100;
  c.mode = "quick";
  return c;
}

function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/load failed|failed to fetch|networkerror|abort|timed out|timeout/i.test(raw)) {
    return "Connection dropped before the search finished. Try again.";
  }
  return raw || fallback;
}

async function startViaHttp(criteria: SearchCriteria, name: string): Promise<{ ok: boolean; runId: string; error?: string; upgrade?: boolean }> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch("/api/search/start", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ criteria, name }),
      signal: ac.signal,
    });
    if (res.status === 401) {
      window.location.assign("/login");
      return { ok: false, runId: "", error: "Sign in again" };
    }
    const json = (await res.json().catch(() => null)) as { ok?: boolean; runId?: string; error?: string } | null;
    if (json?.ok && json.runId) return { ok: true, runId: json.runId };
    if (!res.ok && !json?.runId) {
      const latest = await fetch("/api/search/start", { credentials: "include" }).then((r) => r.json()).catch(() => null);
      if (latest?.ok && latest.runId) return { ok: true, runId: latest.runId };
    }
    return { ok: false, runId: json?.runId ?? "", error: json?.error || `Search failed (${res.status})` };
  } catch (err) {
    const latest = await fetch("/api/search/start", { credentials: "include" }).then((r) => r.json()).catch(() => null);
    if (latest?.ok && latest.runId) return { ok: true, runId: latest.runId };
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export const Route = createFileRoute("/_app/search/new")({ component: NewSearch });

function NewSearch() {
  const { locale } = useI18n();
  const adv = loc(
    {
      fi: {
        title: "Tarkemmat ehdot",
        body: "Lisäehdot arkikielellä. Toimiala on virallinen rekisterikoodi. Liikevaihto on vain julkaistu tilinpäätös.",
      },
      en: {
        title: "Advanced filters",
        body: "Extra conditions in plain language. Industry uses the official register code. Revenue is published accounts only.",
      },
      sv: {
        title: "Avancerade filter",
        body: "Extra villkor på vardagsspråk. Bransch är den officiella registerkoden. Omsättning är endast publicerat bokslut.",
      },
    },
    locale,
  );
  const nav = useNavigate();
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: () => getBootstrap() });
  const perSearch = perSearchFromBoot(boot.data);
  const [criteria, setCriteria] = useState<SearchCriteria>(starterCriteria);
  const [name, setName] = useState("Finnish companies worth contacting");
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [seeds, setSeeds] = useState("");
  const [prompt, setPrompt] = useState("");
  const [summary, setSummary] = useState<string[]>([]);
  const [icpRows, setIcpRows] = useState<Array<{ criterion: string; value: string; origin: string; supported: boolean; reason: string }>>([]);
  const [icpIssues, setIcpIssues] = useState<Array<{ code: string; message: string; blocking: boolean }>>([]);
  const [beginner, setBeginner] = useState<Record<string, string>>({ sell: "", buyer: "", value: "", where: "", good: "" });

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("norf-target-prompt");
      if (saved) setPrompt(saved);
      const dup = window.sessionStorage.getItem("norf-duplicate-criteria");
      if (dup) {
        const parsed = JSON.parse(dup) as SearchCriteria;
        if (parsed && parsed.groups) setCriteria({ ...parsed, prioritizeNew: parsed.prioritizeNew !== false, excludeSeen: parsed.excludeSeen !== false });
        window.sessionStorage.removeItem("norf-duplicate-criteria");
      }
      const dupName = window.sessionStorage.getItem("norf-duplicate-name");
      if (dupName) {
        setName(dupName);
        window.sessionStorage.removeItem("norf-duplicate-name");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!boot.data) return;
    const cap = perSearchFromBoot(boot.data);
    setCriteria((c) => {
      const next = clampRequestedLeads(c.maxResults, cap);
      return next === c.maxResults ? c : { ...c, maxResults: next };
    });
  }, [boot.data?.perSearch, boot.data?.plan, boot.data?.isAdmin]);

  async function interpret() {
    setBusy(true);
    try {
      const r = await interpretPrompt({ data: { prompt, country: criteria.country } });
      setCriteria({ ...r.criteria, maxResults: criteria.maxResults || r.criteria.maxResults, prompt });
      setSummary(r.summary);
      setIcpRows(Array.isArray(r.icp?.criteriaList) ? r.icp.criteriaList : []);
      setIcpIssues(Array.isArray(r.icp?.issues) ? r.icp.issues : []);
      if (!r.ok) toast.error(r.error ?? "Add a place or pick an industry (Kaikki toimialat is allowed).");
      else toast.message("Read the brief below, then start search.");
    } catch (err) {
      toast.error(friendlyError(err, "Could not read the brief"));
    } finally {
      setBusy(false);
    }
  }

  async function pickPreset(id: OpportunityPresetId) {
    try {
      const r = await applyOpportunityPreset({
        data: {
          preset: id,
          country: criteria.country,
          municipality: String(firstValue(criteria, "municipality") ?? "") || undefined,
          industry: valuesOf(criteria, "industry").map(String),
        },
      });
      if (!r.ok) {
        toast.error(r.error ?? "Preset could not be applied.");
        return;
      }
      setCriteria({ ...r.criteria, maxResults: criteria.maxResults || 100 });
      setName(r.label);
      setSummary([r.blurb, "Industry is optional. Kaikki toimialat searches every register line."]);
    } catch (err) {
      toast.error(friendlyError(err, "Preset could not be applied"));
    }
  }

  async function run() {
    setBusy(true);
    try {
      let next = { ...criteria, prompt: prompt.trim() || criteria.prompt };
      if (prompt.trim()) {
        try {
          const r = await Promise.race([
            interpretPrompt({ data: { prompt: prompt.trim(), country: criteria.country } }),
            new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timed out")), 4000)),
          ]);
          if (r.ok) {
            next = { ...r.criteria, maxResults: criteria.maxResults || r.criteria.maxResults, prompt: prompt.trim() };
            setCriteria(next);
            setSummary(r.summary);
          }
        } catch {
          /* brief is optional — start with the form filters */
        }
      }
      const res = await startViaHttp(next, name);
      if (!res.ok || !res.runId) {
        toast.error(res.error || "Search could not start. Try again.");
        if (res.upgrade) {
          toast.message("Quota reached. Open Plan to upgrade, or Support to send feedback.");
        }
        return;
      }
      window.location.assign(`/search/${res.runId}`);
    } catch (err) {
      toast.error(friendlyError(err, "Search failed"));
    } finally {
      setBusy(false);
    }
  }

  async function runSeeds() {
    const identifiers = seeds.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const res = await importSeeds({ data: { identifiers, filename: "pasted" } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.message(`Seed list resolved ${res.discovered} companies from YTJ`);
      nav({ to: "/search/$runId", params: { runId: res.runId } });
    } catch (err) {
      toast.error(friendlyError(err, "Import failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="title">Find companies worth contacting</h1>
          <p className="mt-1 text-sm text-mute">
            Six questions. Industry is optional — pick Kaikki toimialat, or leave it open and bound the search with a city. Missing figures stay Not found.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? "Starting search…" : `Find ${criteria.maxResults} companies`}
        </Button>
      </div>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Field label="Search name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 self-end text-sm text-mute">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          Recur daily
        </label>
      </div>

      <TargetingBuilder value={criteria} onChange={setCriteria} perSearch={perSearch} />

      <section className="space-y-3 border border-line bg-panel p-4 md:p-5">
        <h2 className="text-sm font-medium">Repeated searches</h2>
        <p className="text-xs text-mute">Already shown companies are skipped. The search keeps reading the register until it finds new matches.</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={criteria.prioritizeNew !== false}
            onChange={(e) => setCriteria({ ...criteria, prioritizeNew: e.target.checked, excludeSeen: e.target.checked ? true : criteria.excludeSeen })}
          />
          <span>Find companies I have not seen yet. Do not fill the list with repeats.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={criteria.excludeSeen !== false}
            onChange={(e) => setCriteria({ ...criteria, excludeSeen: e.target.checked })}
          />
          <span>Exclude companies I have already seen</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(criteria.excludeExported)}
            onChange={(e) => setCriteria({ ...criteria, excludeExported: e.target.checked })}
          />
          <span>Exclude previously exported companies</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={criteria.excludeCustomers !== false}
            onChange={(e) => setCriteria({ ...criteria, excludeCustomers: e.target.checked })}
          />
          <span>Exclude uploaded customers and the blocklist. <Link className="underline" to="/accounts">Manage list</Link></span>
        </label>
      </section>

      <details className="border border-line bg-panel p-4 md:p-5" open>
        <summary className="cursor-pointer text-sm font-medium">Beginner — describe who you sell to</summary>
        <p className="mt-2 text-xs text-mute">Answer in business language. Norf proposes filters. Proposed rows are not facts until you keep them.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {BEGINNER_QUESTIONS.map((q) => (
            <Field key={q.id} label={locale === "fi" ? q.fi : q.en}>
              <Input
                value={beginner[q.id] ?? ""}
                onChange={(e) => setBeginner((b) => ({ ...b, [q.id]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => {
              const blob = BEGINNER_QUESTIONS.map((q) => beginner[q.id]).filter(Boolean).join(". ");
              if (!blob.trim()) return;
              setPrompt(blob);
              void (async () => {
                setBusy(true);
                try {
                  const r = await interpretPrompt({ data: { prompt: blob, country: criteria.country } });
                  setCriteria({ ...r.criteria, maxResults: criteria.maxResults || r.criteria.maxResults, prompt: blob });
                  setSummary(r.summary);
                  setIcpRows(Array.isArray(r.icp?.criteriaList) ? r.icp.criteriaList : []);
                  setIcpIssues(Array.isArray(r.icp?.issues) ? r.icp.issues : []);
                  if (!r.ok) toast.error(r.error ?? "Add a place or pick an industry (Kaikki toimialat is allowed).");
                  else toast.message("Read the proposed brief, then start search.");
                } catch (err) {
                  toast.error(friendlyError(err, "Could not read the brief"));
                } finally {
                  setBusy(false);
                }
              })();
            }}
            disabled={busy || !Object.values(beginner).some((v) => v.trim())}
          >
            Build the search from this
          </Button>
        </div>
      </details>

      <details className="border border-line bg-panel p-4 md:p-5">
        <summary className="cursor-pointer text-sm">Expert — describe it in your own words</summary>
        <div className="mt-3 space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Finnish marketing agencies, €1M to €10M if published, weak websites"
          />
          <Button variant="secondary" onClick={() => void interpret()} disabled={busy || !prompt.trim()}>
            Fill the brief from this
          </Button>
          {summary.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-mute">
              {summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          {icpRows.length ? (
            <div className="overflow-x-auto border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-panel-2 text-[10px] uppercase tracking-[0.12em] text-faint">
                  <tr>
                    <th className="px-2 py-1">Criterion</th>
                    <th className="px-2 py-1">Value</th>
                    <th className="px-2 py-1">Origin</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {icpRows.map((row) => (
                    <tr key={row.criterion + row.value} className="border-t border-line">
                      <td className="px-2 py-1">{row.criterion}</td>
                      <td className="px-2 py-1">{row.value}</td>
                      <td className="px-2 py-1">{row.origin}</td>
                      <td className="px-2 py-1">{row.supported ? "Used" : "Not a filter"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-2 py-2 text-[11px] text-mute">AI-derived rows are proposals, not facts. Unsupported rows stay visible and are not silently applied.</p>
            </div>
          ) : null}
          {icpIssues.length ? (
            <ul className="space-y-1 text-sm text-mute">
              {icpIssues.map((i) => (
                <li key={i.message}>{i.blocking ? "Blocked: " : "Note: "}{i.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Opportunity</h2>
          <p className="mt-1 text-xs text-mute">Eight starting points. Still pick an industry above. Unknown finances stay Not found.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(OPPORTUNITY_PRESETS) as OpportunityPresetId[]).map((id) => {
            const p = OPPORTUNITY_PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => void pickPreset(id)}
                className="border border-line bg-panel p-4 text-left hover:border-line-strong"
              >
                <div className="text-sm font-medium">{p.label}</div>
                <p className="mt-1 text-xs text-mute">{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      <details className="border border-line bg-panel p-4 md:p-5">
        <summary className="cursor-pointer text-sm font-medium">{adv.title}</summary>
        <p className="mt-2 text-xs text-mute">{adv.body}</p>
        <div className="mt-4">
          <CriteriaBuilder value={criteria} onChange={setCriteria} perSearch={perSearch} />
        </div>
      </details>

      <section className="space-y-3 border border-line bg-panel p-4 md:p-5">
        <div>
          <h2 className="text-sm font-medium">Already have Y-tunnus values?</h2>
          <p className="mt-1 text-xs text-mute">Paste identifiers. They are resolved against the Finnish Trade Register, not guessed.</p>
        </div>
        <Textarea
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          rows={3}
          placeholder="0112038-9, 2203605-5"
        />
        <Button variant="secondary" onClick={() => void runSeeds()} disabled={busy || !seeds.trim()}>
          Resolve against YTJ
        </Button>
      </section>

      <Button className="w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
        {busy ? "Finding companies" : `Find ${criteria.maxResults} companies`}
      </Button>
    </div>
  );
}
