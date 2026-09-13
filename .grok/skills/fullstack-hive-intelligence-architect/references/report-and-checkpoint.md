---
description: "Iteration report contract and checkpoint on interrupt."
connections: [audit-and-status, quality-security-eval]
---

# Report and checkpoint (Level 2)

## After each implementation slice

Copy `assets/iteration-report.md` to `docs/intelligence/reports/YYYY-MM-DD-N.md`.

Required sections

A. What the user can do better now
B. Which V1 gaps were fixed
C. Which new sources actually work (live or named BLOCKED)
D. Which engines were implemented and where they are wired
E. How shared processing improved
F. Which tests ran
G. Metrics before vs after (definitions, n, environment)
H. What remains unverified
I. Next highest-value change

Also keep planned / implemented / verified distinct.

Name files, tests, and environment (local, preview, prod).

## Checkpoint on interrupt

Write `docs/intelligence/checkpoint.yaml`.

Next session

1. read checkpoint and capability matrix
2. do not re-audit from zero unless the repo changed
3. resume next_action only
4. update checkpoint when that action finishes

## Honest language

Forbidden without evidence: production-ready, enterprise-grade, revolutionary, hive is alive, fully autonomous, Nx efficiency, world coverage.

Allowed: implemented in preview, verified against eval-set vN, blocked on missing API key NAME, preliminary (n=…).
