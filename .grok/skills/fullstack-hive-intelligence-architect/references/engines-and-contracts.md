---
description: "Observation model, adaptive query plan, engines A-M, hive tasks."
connections: [connectors-and-contracts, quality-security-eval]
---

# Engines and contracts (Level 2)

Implement inside the existing app. Share one observation and claim model. A role is a function, worker, or agent only when needed.

## Shared observation

```
observation_id
tenant_id
entity_hint
field
value_raw
value_normalized
value_class          # OBSERVED | DERIVED | INFERRED | UNKNOWN | CONFLICTING | STALE
source_id
source_record_id
observed_at
published_at
retrieved_at
valid_from
valid_to
extracted_by
evidence_span
merge_key
confidence_inputs    # structured factors only
```

## Temporal claim

When the product states facts over time, persist `assets/temporal-claim.yaml` fields

```
claim_id entity_id predicate value unit
source_id source_record_id evidence_location
observed_at published_at valid_from valid_to retrieved_at
extraction_version evidence_status supersedes_claim_id
```

Disappear-from-source ≠ confirmed end. Separate dropped, corrected, expired, and confirmed-ended.

Do not treat today's fetch of an old page as a today event.

## Query plan (adaptive)

```
user_goal
must
should
must_not
sub_questions
seed_sources
followups
evidence_minimum
stop_rules
budget_calls
budget_tokens
budget_ms
```

Control flow

1. resolve identity first
2. fetch core fields from strongest applicable sources
3. list missing or conflicting fields
4. target follow-up only at those fields
5. measure whether the new observation improved the answer
6. stop when need is met or budget is exhausted

Name heuristic gain estimates as heuristics. Block endless rephrasing of the same query. Never drop must-clauses to grow hit count. Offer a separate broader search if the user wants it.

## Work item

```
task_id run_id tenant_id
input_references output_references evidence_references
status uncertainties cost duration next_action
owner lease_until heartbeat_at attempt idempotency_key
```

States: PLANNED → QUEUED → RUNNING → PARTIAL | SUCCEEDED | FAILED | CANCELLED

Deduplicate by hash(tenant, plan, source, locator). Duplicate delivery is normal; design upserts for it. Do not promise exactly-once without an end-to-end proof.

Shared workspace buckets: raw observations, reviewed claims, derived values, hypotheses, open tasks, rejected interpretations.

An engine conclusion must not re-enter as external evidence.

## Entity resolution V2

Separate candidate find from merge decision.

Use type-appropriate strong ids and record country, register, and validity window.

Keep distinct

- official name, marketing name, former name, alias
- parent, subsidiary, site
- same name, different organization

Do not collapse a group into one company. Do not truncate the candidate set before strong-id and exact-match checks.

Store method, version, and reasons. Support unlink and repair of dependent claims.

Test the inverse failure: one entity split into many.

## Contradiction resolution

Before declaring a conflict check same entity, same period, same unit/currency, same definition, original vs reprint, parse/normalize error.

If real

- keep competing claims
- show sources and times
- pick a primary value only with a named rule
- run a budgeted verification fetch when the field matters
- leave UNCLEAR when evidence is insufficient

LLM majority vote is not a fact.

## Resilience

Implement as the stack allows

- idempotency key
- bounded retries
- owner lease + heartbeat
- cancel
- checkpoint
- dead-letter
- controlled replay
- write conflict protection
- dependency failure propagation

If DB write and event emit must be atomic, use the environment's transactional outbox (or equivalent). A crashed worker must not drop finished work or present PARTIAL as SUCCEEDED.

## Active enrichment

Queue from real need: entities the user is looking at, decision-critical missing fields, stale core claims, conflicts, hot keys, source change notifications.

Freshness targets are per field type. Use vendor change feeds, timestamps, and conditional requests. Do not reparse an unchanged document hash.

A parser fix may reprocess that corpus only, not rebuild the whole database.

## Delivery contract

A new engine is not VERIFIED until this chain exists

INPUT → VALIDATION → AUTHORIZATION → EXECUTION → PERSISTENCE → API → UI → OBSERVABILITY → VERIFICATION

Before coding answer

- which user problem closes
- what starts the engine
- where the result is stored
- who consumes it
- how in-progress looks
- how failure recovers
- how auth is checked
- which test proves the user path

A script-only success is PARTIAL.

Show the user the result, sources, freshness, and material uncertainty. Keep agent-role theater in an ops view unless it helps the user act.

## Engine notes (V1 retained)

Query understanding — Finnish inflection when the product is FI. Do not strip legal suffixes before identifier match.

Source routing — coverage ∩ query, freshness, health, cost, prior precision. Never fan out to all sources.

Acquisition — bounded parallelism. Checkpoint each page. No scrape behind login.

Document intelligence — byte hash and page span. OCR only if text layer missing.

Normalization — raw beside canonical.

Search — structured filters first, full text second, embeddings optional, rank features visible.

Relationships — graph store only for a named traversal need.

Orchestration — one coordinator. Deterministic control flow.

Feedback — user corrections become labeled eval rows, not silent prompt edits.

## Anti-patterns

- microservice per engine
- LLM on every fetch
- embeddings without tenant prefix
- silent must-clause relaxation
- model-invented trust scores
- unused class marked VERIFIED
