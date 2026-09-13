---
description: "Connector methods, timeouts, circuit breaker, parser version."
connections: [engines-and-contracts, sources-and-repos]
---

# Connector factory and contract tests

New integrations must be repeatable. Prefer one shared runtime plus source-specific config over dozens of near-duplicate files.

## Shared runtime

Handle for every connector

- timeout, retry/backoff on idempotent reads only
- rate limit and circuit breaker
- pagination and resume checkpoint
- idempotent upsert
- tenant-scoped cache keys
- typed errors vs empty result
- max bytes and content-type allowlist
- SSRF allowlist after DNS resolve
- parser_version on each observation
- safe fallback that stores UNKNOWN

## Source-specific layer

Handle semantics only

- query mapping
- field map
- empty-vs-error rules for that vendor
- login-page-in-200 detection
- silent field disappearance
- incremental cursor if the vendor has one
- retirement switch

## Families to template

REST/JSON · GraphQL when the source is GraphQL · RSS/Atom · CSV/JSON/XML dumps · documented bulk download · public HTML · PDF documents

Do not invent a GraphQL client for a REST-only source.

## Required methods

- discover() — capabilities
- search(plan) — candidate hits
- fetch(locator) — raw payload
- normalize(raw) — canonical observation
- healthcheck() — HEALTHY | DEGRADED | BLOCKED

## Contract tests (minimum)

- supported queries return the documented shape
- pagination resumes after interrupt
- empty list ≠ transport error
- HTTP 200 login wall or HTML error page is BLOCKED/DEGRADED, not success
- dropped fields bump parser health
- provenance url + retrieved_at always set
- disable path stops routing within one plan

Record the contract in `docs/intelligence/connectors/<source_id>.yaml` from `assets/connector-contract.yaml`.

## Disable and retire

A broken connector is isolated, not deleted from history. Observations already stored keep their source_id. New plans skip DEGRADED/BLOCKED sources unless the user explicitly requests a retry.
