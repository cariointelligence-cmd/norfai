#!/usr/bin/env python3
"""Finnish company identifiers: Y-tunnus checksum, phone E.164, name core."""
import json
import re
import sys

WEIGHTS = [7, 9, 10, 5, 8, 4, 2]
SUFFIX = re.compile(
    r"(?:\s+(?:oyj|oy|abp|ab|ky|ay|tmi|osk|ry|rf|ltd|plc|gmbh|inc|llc|oy\s+ab))+$",
    re.I,
)


def normalize_bid(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"[\s-]", "", raw)
    if not re.fullmatch(r"\d{8}", digits):
        return None
    body, check = digits[:7], int(digits[7])
    s = sum(int(ch) * w for ch, w in zip(body, WEIGHTS))
    rem = s % 11
    expected = 0 if rem == 0 else 11 - rem
    if expected == 10 or expected != check:
        return None
    return f"{body}-{digits[7]}"


def normalize_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    d = re.sub(r"[^\d+]", "", raw)
    if d.startswith("00"):
        d = "+" + d[2:]
    if d.startswith("0") and len(d) >= 9:
        d = "+358" + d[1:]
    if d.startswith("358") and not d.startswith("+"):
        d = "+" + d
    if d.startswith("+358"):
        rest = d[4:].lstrip("0")
        d = "+358" + rest
        if 8 <= len(d) <= 15:
            return d
    return None


def normalize_name(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    s = re.sub(r"[.,]", "", s)
    s = re.sub(r"\s+", " ", s)
    s = SUFFIX.sub("", s).strip()
    return s


def main() -> None:
    data = json.load(sys.stdin)
    bids = data.get("bids") or []
    phones = data.get("phones") or []
    names = data.get("names") or []
    out = {
        "bids": [normalize_bid(x) for x in bids],
        "phones": [normalize_phone(x) for x in phones],
        "names": [normalize_name(x) for x in names],
    }
    json.dump(out, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
