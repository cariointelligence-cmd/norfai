#!/usr/bin/env python3
"""Validate intelligence docs: registry plus Level-2 companions."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

REQUIRED_SOURCE = [
    "source_id",
    "name",
    "source_family",
    "base_url",
    "authentication_type",
    "license_or_usage_constraints",
    "status",
]

VALID_STATUS = {
    "discovered",
    "documented",
    "assessed",
    "trial",
    "validated",
    "implemented",
    "verified",
    "healthy",
    "degraded",
    "blocked",
    "retired",
    "rejected",
    "production",
}

VALID_COUNTS = {
    "DISCOVERED",
    "DOCUMENTED",
    "IMPLEMENTED",
    "VERIFIED",
    "HEALTHY",
    "DEGRADED",
    "BLOCKED",
    "RETIRED",
}

VALID_ENGINE_STATUS = {
    "IMPLEMENTED",
    "VERIFIED",
    "PARTIAL",
    "BROKEN",
    "MOCK",
    "MISSING",
    "BLOCKED",
    "UNUSED",
}

VALID_ROOT_CAUSE = {
    "SOURCE_GAP",
    "ROUTING_GAP",
    "COLLECTION_GAP",
    "PARSING_GAP",
    "IDENTITY_GAP",
    "INDEXING_GAP",
    "REASONING_GAP",
    "FRESHNESS_GAP",
    "PERMISSION_GAP",
    "PRESENTATION_GAP",
}

MATRIX_FIELDS = [
    "engine",
    "user_value",
    "entrypoint",
    "input_contract",
    "output_contract",
    "dependencies",
    "persistent_state",
    "actual_callers",
    "verification_evidence",
    "known_failure_modes",
    "status",
]

SECRET_MARKERS = ("sk-", "api_key=", "BEGIN ", "-----BEGIN")


def fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def load_yaml(path: Path):
    text = path.read_text(encoding="utf-8")
    if yaml is None:
        return None, text
    return yaml.safe_load(text) or {}, text


def looks_like_secret(value: object) -> bool:
    s = str(value)
    return any(token in s for token in SECRET_MARKERS)


def validate_registry(path: Path) -> list[str]:
    errors: list[str] = []
    data, text = load_yaml(path)
    if data is None:
        if "sources:" not in text:
            return [f"{path} has no sources key"]
        print("WARN: PyYAML not installed; shallow registry check only")
        return []
    if "sources" not in data or not isinstance(data["sources"], list):
        return ["sources must be a list"]
    counts = data.get("counts") or {}
    for key in VALID_COUNTS:
        if key not in counts:
            print(f"WARN: counts.{key} missing")
    ids: set[str] = set()
    for i, src in enumerate(data["sources"]):
        if not isinstance(src, dict):
            errors.append(f"source[{i}] is not a mapping")
            continue
        for field in REQUIRED_SOURCE:
            if not src.get(field):
                errors.append(f"source[{i}] missing {field}")
        sid = str(src.get("source_id", f"index-{i}"))
        if sid in ids:
            errors.append(f"duplicate source_id {sid}")
        ids.add(sid)
        status = str(src.get("status", "")).lower()
        if status and status not in VALID_STATUS:
            errors.append(f"{sid} invalid status {src.get('status')}")
        if src.get("secret_reference") and looks_like_secret(src.get("secret_reference")):
            errors.append(f"{sid} looks like a raw secret in secret_reference")
        for banned in ("password", "api_key", "token"):
            if banned in src and src[banned]:
                errors.append(f"{sid} must not store {banned} in registry")
        if status in {"verified", "production", "healthy"} and src.get("value_demonstrated") is False:
            print(f"WARN: {sid} is {status} but value_demonstrated is false")
    print(f"OK registry: {len(data['sources'])} sources in {path}")
    return errors


def validate_matrix(path: Path) -> list[str]:
    errors: list[str] = []
    data, text = load_yaml(path)
    if data is None:
        if "engines:" not in text:
            return [f"{path} has no engines key"]
        print("WARN: PyYAML not installed; skipped matrix schema")
        return []
    engines = data.get("engines")
    if not isinstance(engines, list):
        return ["capability-matrix.engines must be a list"]
    for i, row in enumerate(engines):
        if not isinstance(row, dict):
            errors.append(f"engine[{i}] is not a mapping")
            continue
        for field in MATRIX_FIELDS:
            if field not in row:
                errors.append(f"engine[{i}] missing {field}")
        status = str(row.get("status", "")).upper()
        if status and status not in VALID_ENGINE_STATUS:
            errors.append(f"engine[{i}] invalid status {row.get('status')}")
        callers = row.get("actual_callers") or []
        if status == "VERIFIED" and not callers:
            errors.append(f"{row.get('engine')} VERIFIED but actual_callers empty")
        if status == "VERIFIED" and not row.get("verification_evidence"):
            errors.append(f"{row.get('engine')} VERIFIED but verification_evidence empty")
    print(f"OK matrix: {len(engines)} engines in {path}")
    return errors


def validate_gaps(path: Path) -> list[str]:
    errors: list[str] = []
    data, text = load_yaml(path)
    if data is None:
        if "gaps:" not in text:
            return [f"{path} has no gaps key"]
        print("WARN: PyYAML not installed; skipped gap schema")
        return []
    gaps = data.get("gaps")
    if not isinstance(gaps, list):
        return ["gap-map.gaps must be a list"]
    for i, gap in enumerate(gaps):
        if not isinstance(gap, dict):
            errors.append(f"gap[{i}] is not a mapping")
            continue
        cause = gap.get("root_cause")
        if cause and cause not in VALID_ROOT_CAUSE:
            errors.append(f"gap[{i}] invalid root_cause {cause}")
        if gap.get("user_question") and not gap.get("required_fields"):
            print(f"WARN: gap[{i}] has a question but no required_fields")
    print(f"OK gaps: {len(gaps)} rows in {path}")
    return errors


def resolve_targets(arg: Path) -> dict[str, Path]:
    if arg.is_dir():
        return {
            "registry": arg / "source-registry.yaml",
            "matrix": arg / "capability-matrix.yaml",
            "gaps": arg / "gap-map.yaml",
        }
    return {"registry": arg, "matrix": Path(), "gaps": Path()}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        return fail(
            "usage: validate_intelligence_registry.py path/to/source-registry.yaml"
            " | path/to/docs/intelligence"
        )
    targets = resolve_targets(Path(argv[1]))
    registry = targets["registry"]
    if not registry.is_file():
        return fail(f"missing file {registry}")
    errors = validate_registry(registry)
    matrix = targets["matrix"]
    if matrix.is_file():
        errors.extend(validate_matrix(matrix))
    gaps = targets["gaps"]
    if gaps.is_file():
        errors.extend(validate_gaps(gaps))
    for err in errors:
        print(f"FAIL: {err}")
    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
