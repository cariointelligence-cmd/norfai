---
description: "Named gaps and root-cause classes. Read before adding sources."
connections: [audit-and-status, sources-and-repos]
---

# Intelligence gap map

Turn "add intelligence" into named gaps. Store in `docs/intelligence/gap-map.yaml`.

## Per use case

Record

- user_question
- required_fields
- current_sources
- observed_coverage (what the path actually returns)
- missing_fields
- incorrect_or_ambiguous_hits
- freshness_need
- current_cost_and_latency (measured or marked estimate)
- user_impact if the gap remains

Coverage is observed, not hoped. Mark estimates as `estimate: true`.

## Root-cause classes

Assign exactly one primary class

- SOURCE_GAP — no admissible source for the field
- ROUTING_GAP — source exists but is never selected
- COLLECTION_GAP — selected but not fetched (auth, pagination, budget)
- PARSING_GAP — fetched but fields lost or misread
- IDENTITY_GAP — right records attached to the wrong entity, or split
- INDEXING_GAP — stored but not findable
- REASONING_GAP — facts present, derived answer wrong
- FRESHNESS_GAP — value exists but older than target
- PERMISSION_GAP — tenant or license blocks the field
- PRESENTATION_GAP — backend knows, UI hides or mislabels

Do not treat a parse bug as a source shortage. Do not treat a merge bug as a need for another model call.

## Prioritization

Score each gap on

- user-decision impact
- quality risk if left open
- implementation effort
- ongoing cost (calls, tokens, storage, review)

Ship the highest impact / acceptable cost item that unblocks a visible user path.

## Anti-patterns

- adding twenty RSS feeds to hide a broken company-id parser
- widening must-clauses to inflate recall
- calling every unused engine "planned intelligence"
