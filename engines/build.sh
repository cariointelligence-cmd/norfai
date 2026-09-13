#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/bin"
mkdir -p "$BIN"

need() {
  src="$1"
  dest="$2"
  [ ! -e "$dest" ] || [ "$src" -nt "$dest" ]
}

if command -v rustc >/dev/null 2>&1 && need "$ROOT/extract.rs" "$BIN/extract"; then
  rustc -O -C debuginfo=0 -o "$BIN/extract" "$ROOT/extract.rs" 2>"$BIN/extract.build.log" || true
fi
if command -v gcc >/dev/null 2>&1 && need "$ROOT/fingerprint.c" "$BIN/fingerprint"; then
  gcc -O2 -o "$BIN/fingerprint" "$ROOT/fingerprint.c" 2>"$BIN/fingerprint.build.log" || true
fi
if command -v g++ >/dev/null 2>&1 && need "$ROOT/score.cpp" "$BIN/score"; then
  g++ -O2 -std=c++17 -o "$BIN/score" "$ROOT/score.cpp" 2>"$BIN/score.build.log" || true
fi
if command -v javac >/dev/null 2>&1 && need "$ROOT/MergeContacts.java" "$BIN/MergeContacts.class"; then
  javac -d "$BIN" "$ROOT/MergeContacts.java" 2>"$BIN/java.build.log" || true
fi
chmod +x "$ROOT/fi_parse.py" 2>/dev/null || true
echo "engines ready" > "$BIN/ready"
