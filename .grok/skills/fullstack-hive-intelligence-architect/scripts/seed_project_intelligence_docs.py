#!/usr/bin/env python3
"""Copy intelligence templates into a project docs/intelligence folder."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

SKILL_ASSETS = Path(__file__).resolve().parent.parent / "assets"
FILES = [
    ("project-baseline.yaml", "baseline.yaml"),
    ("source-registry.yaml", "source-registry.yaml"),
    ("need-map.yaml", "need-map.yaml"),
    ("gap-map.yaml", "gap-map.yaml"),
    ("capability-matrix.yaml", "capability-matrix.yaml"),
    ("source-assessment.yaml", "assessments/_template.yaml"),
    ("repo-decision.yaml", "repos/_template.yaml"),
    ("connector-contract.yaml", "connectors/_template.yaml"),
    ("temporal-claim.yaml", "claims/_template.yaml"),
    ("hive-task.yaml", "tasks/_template.yaml"),
    ("eval-set.yaml", "eval-set.yaml"),
    ("checkpoint.yaml", "checkpoint.yaml"),
    ("iteration-report.md", "reports/_template.md"),
]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: seed_project_intelligence_docs.py /path/to/project")
        return 1
    root = Path(argv[1])
    dest = root / "docs" / "intelligence"
    (dest / "reports").mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in FILES:
        src = SKILL_ASSETS / src_name
        target = dest / dest_name
        if target.exists():
            print(f"skip existing {target}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, target)
        print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
