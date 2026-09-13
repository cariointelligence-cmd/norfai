---
name: fullstack-hive-intelligence-architect
description: "Upgrade an existing Grok Build fullstack app into a verified intelligence layer. Use when the user asks for sources, search quality, entity resolution, provenance, hive mind, connectors, RSS, open data, GitHub adapters, hakuketju, lähderekisteri, tyhjä tulos, empty-result diagnosis, production readiness, herätä henkiin, datapisteet, or to fix thin unreliable results. Do not use for isolated CSS or one-file bugfixes."
type: workflow
lifecycle: active
metadata:
  version: "3.1"
  supersedes: "3.0"
  language: fi-en
  companion: hive-system
---

# Fullstack Hive Intelligence Architect

Grow an existing fullstack app into a verified intelligence layer. Hive mind means shared-model engines, not agent swarms or extra LLM loops.

Do not ship a plan-only answer. Audit, implement, test, measure, report.

Companion: [[hive-system:]] when present. Use Sensors, Memory, Cortex, Nerve, Immune, Face. Do not invent parallel metaphors.

## Activate

Activate when the open project is a Builder fullstack app and the ask covers sources, data, search, integrations, intelligence, or production readiness — including Finnish phrasing (herätä henkiin, datapisteet, hakuketju, tyhjä tulos).

Project open = map context. Wide implementation needs the user's task. Do not turn a CSS tweak into a rebuild.

If no project is open, finish this skill and wait. Do not invent an app.

When a wide task is authorised, proceed. Do not ask permission for ordinary reversible work.

## Hard limits

- Do not call a source integrated because a URL was found.
- Do not count mirrors, syndicates, or extra endpoints of one API as independent confirmations.
- Do not invent APIs, docs, coverage numbers, or confidence scores.
- Do not replace UNKNOWN with a typical default.
- Do not silently relax must-clauses.
- Do not start mass collection as a GET side effect.
- Do not store secrets in the registry or repo.
- Do not bypass login, paywall, or ToS.
- Do not send source secrets or needless personal data to models.
- Do not say PRODUCTION READY unless the gates in [[quality-security-eval]] hold.
- Do not build a parallel stack beside the existing app.
- Do not treat an unused class as a working engine.
- Do not feed an engine's inference back as new external evidence.
- Do not treat today's fetch of an old page as a today event.
- Do not merge group companies on display name.
- Do not fix a parser bug by adding sources, or an identity bug with more LLM calls.
- Do not drop diagnosis codes in an API sanitizer. A Cortex note the Face never sees is not a diagnosis.

## Cycle

AUDIT → GAP MAP → PRIORITIZE → IMPLEMENT → CONNECT → VERIFY → MEASURE → IMPROVE

Priority: (1) broken core paths and false data (2) highest-value sources (3) identity, evidence, time (4) search quality (5) visible user benefit (6) cost and resilience.

Start with one end-to-end path. Do not scaffold ten empty engines.

Read on demand from [[INDEX]]. Seed project docs:

```bash
python .grok/skills/fullstack-hive-intelligence-architect/scripts/seed_project_intelligence_docs.py /workspace
python .grok/skills/fullstack-hive-intelligence-architect/scripts/validate_intelligence_registry.py /workspace/docs/intelligence
```

Fall back to `/root/.grok/server-skills/fullstack-hive-intelligence-architect/scripts/` if the workspace copy is missing.

## Project order

1. Re-audit from code, DB, jobs, live or fixture+smoke. Do not trust the last report.
2. Trace UI → API → plan → source → raw → normalize → resolve → DB → API → UI.
3. Fill need-map, capability matrix, gap map.
4. Fix the critical distortion before new layers.
5. Hunt sources and repos only for named gaps.
6. Ship one full slice: model, migration if needed, backend, UI, tests.
7. Test success and the relevant error paths.
8. Compare to baseline. Continue to the next justified slice.

Status vocabulary: IMPLEMENTED, VERIFIED, PARTIAL, BROKEN, MOCK, MISSING, BLOCKED.

Counts stay separate: DISCOVERED, DOCUMENTED, IMPLEMENTED, VERIFIED, HEALTHY, DEGRADED, BLOCKED, RETIRED.

A missing secret = BLOCKED for that source. Continue independent work.

## Engines (implement only what the gap map needs)

A Query understanding · B Source routing · C Acquisition · D Document intelligence · E Normalization · F Entity resolution · G Evidence · H Search · I Enrichment · J Relationship/signal · K Quality · L Orchestration · M Feedback.

L2 roles map onto those: PLANNER, SOURCE_SCOUT, COLLECTOR, PARSER, IDENTITY_RESOLVER, EVIDENCE_REVIEWER, CONTRADICTION_REVIEWER, SYNTHESIZER, QUALITY_AUDITOR.

Shared observation and claim models live in [[engines-and-contracts]]. Connector methods: discover, search, fetch, normalize, healthcheck — see [[connectors-and-contracts]].

Work states: PLANNED → QUEUED → RUNNING → PARTIAL | SUCCEEDED | FAILED | CANCELLED.

Value classes: OBSERVED, DERIVED, INFERRED, UNKNOWN, CONFLICTING, STALE.

Empty-result codes: NO_MATCH, SOURCE_UNAVAILABLE, FORBIDDEN, OUT_OF_COVERAGE, PARTIAL, FILTER_EXCLUDED_ALL.

## Search must show up in results

Synonyms, Finnish inflection, identifiers, legal suffixes, geo/number/time, explainable rank, empty-result diagnosis. Must-clauses stay must under semantic search.

UI must distinguish no match, source silence, missing permission, out of coverage, partial, and user-filter exclusion.

Persist `code` on the source report. Return it from the run API after sanitizing. Render distinct Face copy per code. Honest zero is not a broken product.

## Persistence of this skill

Install paths for this environment:

| Path | What it does |
|---|---|
| `.grok/skills/fullstack-hive-intelligence-architect/` | Project snapshot. Future turns on this app load it. |
| `/root/.grok/server-skills/fullstack-hive-intelligence-architect/` | This sandbox session. |
| `/opt/app-template/.grok/skills/fullstack-hive-intelligence-architect/` | This sandbox's new-app template only. |
| Grok Build global skill store | Not writable from here. Do not claim all future Builder apps auto-install it. |

Update `AGENTS.md` Skills routing so intelligence/search/source asks open this skill before code.

## Report

After each slice fill `docs/intelligence/reports/YYYY-MM-DD-N.md` from `assets/iteration-report.md`. Separate planned / implemented / verified. No invented efficiency multiples.

On interrupt write `docs/intelligence/checkpoint.yaml`.

## Knowledge Graph

Start at `references/INDEX.md`.

### Cross-Skill Connections

- [[hive-system:]] — Sensors Memory Cortex Nerve Immune Face
- [[auth:]] — tenant user_id on every query
- [[neon:]] — durable rows when the app already uses Postgres
