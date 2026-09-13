import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RUNTIME } from "./runtime.ts";

const ROOT = join(process.cwd(), "engines");
const BIN = join(ROOT, "bin");
const EXTRACT_URL = "http://127.0.0.1:18765";

export type EngineExtract = {
  ok: boolean;
  title: string;
  emails: string[];
  phones: string[];
  engine: "rust" | "ts";
};

export function fnv1a64(text: string): string {
  let h = 0xcbf29ce484222325n;
  const buf = Buffer.from(text, "utf8");
  for (const b of buf) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function clampScore(earned: number, weight: number): number {
  if (!Number.isFinite(earned) || !Number.isFinite(weight) || weight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((100 * earned) / weight)));
}

export async function poolMap<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const n = Math.max(1, Math.min(Math.round(limit) || 1, RUNTIME.poolCap));
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  if (!items.length) return out;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return out;
}

function runBin(cmd: string, args: string[], input: string, timeoutMs = 800): string | null {
  try {
    const r = spawnSync(cmd, args, {
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 2_000_000,
      windowsHide: true,
    });
    if (r.status !== 0 || !r.stdout) return null;
    return String(r.stdout);
  } catch {
    return null;
  }
}

export function fingerprintNative(text: string): string {
  const bin = join(BIN, "fingerprint");
  if (existsSync(bin) && text.length > 2048) {
    const out = runBin(bin, [], text, 400);
    const hex = out?.trim().toLowerCase();
    if (hex && /^[0-9a-f]{16}$/.test(hex)) return hex;
  }
  return fnv1a64(text);
}

/** Product scoring is TypeScript (targeting/scores.ts + scoring.ts). This binary is RETIRED from the product path. */
export function scoreNative(parts: Array<{ earned: number }>, totalWeight: number): number {
  const bin = join(BIN, "score");
  const earned = parts.reduce((s, p) => s + (Number(p.earned) || 0), 0);
  if (existsSync(bin) && parts.length >= 4) {
    const input = parts.map((p, i) => `p${i} ${p.earned}`).join("\n") + `\ntotal_weight ${totalWeight}\n`;
    const out = runBin(bin, [], input, 400);
    if (out) {
      try {
        const j = JSON.parse(out) as { score?: number };
        if (typeof j.score === "number") return j.score;
      } catch {
        /* fall through */
      }
    }
  }
  return clampScore(earned, totalWeight);
}

export function parseFinnishBatch(input: { bids?: string[]; phones?: string[]; names?: string[] }): {
  bids: Array<string | null>;
  phones: Array<string | null>;
  names: string[];
} {
  const py = join(ROOT, "fi_parse.py");
  const fallback = {
    bids: (input.bids ?? []).map(() => null as string | null),
    phones: (input.phones ?? []).map(() => null as string | null),
    names: (input.names ?? []).map((n) => n.trim().toLowerCase()),
  };
  if (!existsSync(py)) return fallback;
  const out = runBin("python3", [py], JSON.stringify(input), 900);
  if (!out) return fallback;
  try {
    const j = JSON.parse(out) as typeof fallback;
    return {
      bids: Array.isArray(j.bids) ? j.bids : fallback.bids,
      phones: Array.isArray(j.phones) ? j.phones : fallback.phones,
      names: Array.isArray(j.names) ? j.names : fallback.names,
    };
  } catch {
    return fallback;
  }
}

export function mergeContactsNative(items: Array<{ value: string; classification?: string }>): Array<{ value: string; classification: string }> {
  const tsMerge = () => {
    const best = new Map<string, string>();
    for (const it of items) {
      const v = String(it.value ?? "").trim().toLowerCase();
      if (!v) continue;
      const cls = it.classification || "inferred";
      const prev = best.get(v);
      if (!prev || cls === "published" || (cls === "obfuscated" && prev !== "published")) best.set(v, cls);
    }
    return [...best.entries()].map(([value, classification]) => ({ value, classification }));
  };
  const cls = join(BIN, "MergeContacts.class");
  if (existsSync(cls) && items.length >= 8) {
    const out = runBin("java", ["-cp", BIN, "MergeContacts"], JSON.stringify({ items }), 700);
    if (out) {
      try {
        const j = JSON.parse(out) as { items?: Array<{ value: string; classification: string }> };
        if (Array.isArray(j.items)) return j.items;
      } catch {
        /* fall through */
      }
    }
  }
  return tsMerge();
}

let extractBooted = false;

export function bootExtractDaemon(): void {
  if (extractBooted || typeof window !== "undefined") return;
  extractBooted = true;
  try {
    mkdirSync(BIN, { recursive: true });
  } catch {
    /* */
  }
  const bin = join(BIN, "extract");
  if (!existsSync(bin)) return;
  try {
    const child = spawn(bin, [], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* */
  }
}

export async function extractViaEngine(html: string): Promise<EngineExtract | null> {
  if (!html || html.length < 40) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 700);
    const res = await fetch(`${EXTRACT_URL}/extract`, {
      method: "POST",
      body: html.slice(0, 1_400_000),
      signal: ctrl.signal,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; emails?: string[]; phones?: string[] };
    return {
      ok: true,
      title: String(j.title ?? ""),
      emails: Array.isArray(j.emails) ? j.emails.map(String).slice(0, 24) : [],
      phones: Array.isArray(j.phones) ? j.phones.map(String).slice(0, 16) : [],
      engine: "rust",
    };
  } catch {
    return null;
  }
}

export async function engineHealth(): Promise<{ rust: boolean }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 250);
    const res = await fetch(`${EXTRACT_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return { rust: res.ok };
  } catch {
    return { rust: false };
  }
}
