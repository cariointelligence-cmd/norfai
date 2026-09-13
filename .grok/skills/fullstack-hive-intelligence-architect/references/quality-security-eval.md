---
description: "Epistemic rules, eval set, production-ready gates."
connections: [engines-and-contracts, report-and-checkpoint]
---

# Quality, security, evaluation (Level 2)

## Epistemic rules

UNKNOWN is a stored value. Do not fill gaps with industry defaults.

If scoring exists, persist formula id and inputs. Uncalibrated scores are not probabilities.

Copies of one press release are one observation family.

Commercial fit, retrieval relevance, and source reliability are separate axes.

Missing field ≠ condition satisfied. Unverifiable must-clauses produce a distinct bucket, not a pass.

## Search quality V2

Evaluate separately

- candidate discovery
- must-clause satisfaction
- identity correctness
- ranking
- user-visible rationale

Find the hop where the right hit dropped.

Use as needed: fielded text search, domain vocabularies, multilingual expansion, exact numeric/temporal filters, semantic candidate gen, evidence-based rerank.

Show why a hit matches and what is still unknown.

## Search UX reason codes

NO_MATCH · SOURCE_UNAVAILABLE · FORBIDDEN · OUT_OF_COVERAGE · PARTIAL · FILTER_EXCLUDED_ALL · CONFLICTING · STALE · UNCLEAR

A code is not Face-complete until it is stored on the source report, survives the API sanitizer, and the search-run UI renders distinct copy. A Cortex `note` that the sanitizer drops is still MISSING.

## Security minimum

- tenant_id on every query, cache key, and vector namespace
- secrets only in env / secret store
- SSRF allowlist; block link-local and metadata IPs after DNS resolve; no off-allowlist redirects
- max download bytes and content types
- quota per tenant and per source
- audit who searched what (metadata, not secrets)
- retention and delete path
- reversible migrations
- no tenant history in another tenant's memory

## System memory

Persist as data, not folklore

- architecture decisions
- source capabilities and health
- run traces
- verified fixes (error, root cause, patch, proving test, scope, optional expiry)
- eval results
- development hypotheses

A single user preference is not a global fact. Learning here means measured changes to rules, routing, vocabularies, eval, or an accepted model config. Do not claim weight training unless that pipeline exists.

## Performance and cost

Profile before optimizing. Measure per stage: source wait, transfer, parse, resolve, DB, index, model, render.

Fix real bottlenecks: N+1, missing indexes, repeat fetches, extra model calls, unbounded fan-out, huge payloads, heavy work on the synchronous request.

Budgets per search, tenant, and background job. Cache keys include authz, query, and data version.

Cheaper-but-wrong is not an improvement.

## Automated audit / regression

Repeatable checks for

- field coverage collapse
- empty-result rate rise
- duplicate rise
- false merges
- claims without evidence
- stale pile-up
- stuck jobs
- index/DB split
- latency and cost rise
- authz regressions

Alerts name the fault class, an example, user impact, and likely hop.

Auto-remediation only inside preset bounds (isolate a breaker-open connector, safe retry). Code and policy changes go through tests.

## Eval protocol

Compare L2 to the saved L1 baseline. Use a representative set and a held-out set. Do not tune only on demo queries.

Ablations

- without the new source
- without the new engine
- with vs without follow-up search
- reviewer vs no reviewer
- multi-role vs single workflow

Report only measured metrics. Define each metric, dataset size, and environment.

```
precision_at_k
recall_on_labeled_dataset
field_accuracy
incorrect_merge_rate
duplicate_rate
evidence_coverage
freshness_compliance
successful_task_rate
p50_latency
p95_latency
cost_per_successful_task
```

Small n → call the result preliminary. Do not generalize a fixture slice to "world coverage".

## Error paths to test

- source returns the wrong shape
- source slows or rate-limits
- credential expires
- work delivered twice
- worker dies mid-write
- user cancels
- budget exhausted
- same entity updated concurrently
- document contains instruction-shaped untrusted text
- tenant uses another tenant's id
- evidence disappears or is corrected
- cache holds a stale answer

Partial, error, and unknown must stay distinct from backend through UI.

## Production-ready gate

All true for the scoped use case and named environment

1. one live source → memory → face path
2. provenance on visible claims
3. tenant isolation test pass
4. eval set run recorded
5. healthcheck can disable a bad source
6. no MOCK on that path
7. rollback path documented
8. capability matrix row is VERIFIED with a caller
9. error paths above do not present PARTIAL as success

Otherwise UNVERIFIED or BLOCKED, and name the missing gate.
