---
description: "Inventory, real query trace, and status vocabulary. Read before changing sources."
connections: [intelligence-gap-map, report-and-checkpoint]
---

# Audit and status (Level 2)

Do not accept a prior iteration report as proof. Re-read code, schema, runnable jobs, and actual outputs.

## Inventory

Record in `docs/intelligence/baseline.yaml`

- purpose, users, top use cases
- frontend routes that search or show entities
- backend, workers, queues, timers
- database, migrations, search index, cache
- auth, tenants, roles
- connectors and env var names (not values)
- AI calls and cost notes
- tests, logs, metrics, hosting limits

## Trace real user paths

For each representative query walk

1. UI input and validation
2. API contract
3. query plan
4. sources actually called
5. raw payload persistence
6. parse / normalize
7. identity resolve
8. DB write and read
9. index / cache update
10. response shape
11. empty / error / partial / stale UI

Ask on every hop

- Does this engine run in the user path or only in a script?
- Is the UI result identical to backend state?
- Was a failed source call hidden inside a 200?
- Are scores computed from stored inputs or constants?
- Are cache, DB, and index mutually consistent?

Evidence is a file path, test name, captured payload, or explicit missing. A button is not evidence.

## Status vocabulary

- IMPLEMENTED — wired into a real caller
- VERIFIED — fixture suite plus at least one live smoke, or live blocked and named
- PARTIAL — some hops work
- BROKEN — wired but fails
- MOCK — invented or fixture data presented as live
- MISSING — no implementation
- BLOCKED — secret, network, worker, or permission missing
- UNUSED — code exists, no production caller

UNUSED is not a working feature.

## Capability matrix

Fill `docs/intelligence/capability-matrix.yaml`. Required columns

```
engine
user_value
entrypoint
input_contract
output_contract
dependencies
persistent_state
actual_callers
verification_evidence
known_failure_modes
status
```

One row per engine letter A–M and per hive role that exists in code. If there is no caller, status is UNUSED or MISSING.

## Distortion checklist

Fix before adding sources

- observation dropped between collector and DB
- parser maps the wrong field
- retrieved_at stored as occurred_at
- duplicate rows treated as independent confirmation
- merge of different legal entities
- empty source result coerced to success
- constant relevance or confidence
- index lag presented as current fact

## Decision after audit

- BROKEN or MOCK core chain → fix that first
- PARSER/IDENTITY distortion → fix the distortion, do not add sources or LLMs
- SOURCE_GAP after a working chain → need-map then one high-value connector
- no citations → provenance before enrichment
- engines L/M before A–C exist for one use case → stop
