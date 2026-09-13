---
description: "Need map, source lifecycle, independence rule, repo cards."
connections: [connectors-and-contracts, intelligence-gap-map]
---

# Sources and repos (Level 2)

## Need map first

Fill `docs/intelligence/need-map.yaml` before hunting URLs.

Per need: user question, decision supported, required fields, freshness target, acceptable unknown, candidate families.

## Source expansion process

Search only for mapped gaps. Useful places

- official service documentation
- open-data catalogs
- public register dataset descriptions
- regulator and industry-body publications
- regional and municipal data services
- public RSS/Atom feeds
- sitemaps and document archives
- public bulk dumps
- official SDKs and documented integrations
- source lists inside relevant open-source projects

Hunt both geographic breadth and domain depth. Do not grow to hundreds of sources unless the product can operate and retire them.

Keep these identities separate in the registry

- source organization
- dataset
- interface (REST, dump, feed, HTML)
- endpoint
- document
- original observation
- republished copy

## Independence

Build a dependency map. Two services that republish the same register are not independent confirmations.

Do not count as separate sources

- origin mirrors
- syndicated copies
- extra endpoints of one API
- CDN caches of the same document

## Lifecycle and counts

discovered → assessed → trial → validated → production → degraded/retired

Never mix counts. A discovered URL is not VERIFIED.

## Registry fields

source_id, name, source_family, organization, dataset, interface, base_url, documentation_url, supported_queries, geographic_coverage, entity_types, available_fields, authentication_type, secret_reference (name only), license_or_usage_constraints, rate_limits, pagination_strategy, incremental_sync_strategy, freshness_target, last_success_at, last_error_at, health_state, parser_version, estimated_cost, observed_latency, provenance_policy, derived_from, independence_group, status

Never store secret values.

## Value test before production

Promote a source only when at least one is demonstrated

- new relevant entities
- new correct fields
- newer observations
- missing geo or domain coverage
- a real contradiction resolved

Also record added latency, cost, errors, and duplicates. Reject net-negative sources.

## Assessment card

Copy `assets/source-assessment.yaml` per candidate.

## Repo evaluation (Repository Intelligence V2)

Search GitHub only for a named gap. For each candidate fill `assets/repo-decision.yaml`

```
PROBLEM
CANDIDATE
PRIMARY_SOURCE
LICENSE
PINNED_VERSION_OR_COMMIT
RUNTIME_COMPATIBILITY
DEPENDENCY_COST
SECURITY_REVIEW
ALTERNATIVES
INTEGRATION_BOUNDARY
EXPECTED_GAIN
VERIFICATION_RESULT
```

Stars and marketing copy are not selection criteria.

Run a bounded trial on this app's representative data. Compare to the current path.

Accept only if the gap closes and maintenance cost is lower than the gain.

Do not run install or migrate scripts unread. Do not send project secrets to third-party eval services.

Save the exact search queries and reject reasons.
