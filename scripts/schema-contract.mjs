#!/usr/bin/env node
/**
 * Fail the build when application SQL writes a column that migrations never
 * declared. This is the class of bug that crashed Find missing emails:
 * search_runs.updated_at.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseSchema(sql) {
  /** @type {Map<string, Set<string>>} */
  const tables = new Map();
  const add = (table, col) => {
    const t = table.toLowerCase();
    const c = col.toLowerCase();
    if (!tables.has(t)) tables.set(t, new Set());
    tables.get(t).add(c);
  };
  const create = /create table if not exists (\w+)\s*\(([\s\S]*?)\);/gi;
  let m;
  while ((m = create.exec(sql))) {
    const table = m[1];
    for (const line of m[2].split("\n")) {
      const col = line.trim().split(/\s+/)[0];
      if (col && /^[a-z_][a-z0-9_]*$/i.test(col) && !/^(primary|unique|constraint|check|foreign)$/i.test(col)) {
        add(table, col);
      }
    }
  }
  const alter = /alter table (\w+) add column if not exists (\w+)/gi;
  while ((m = alter.exec(sql))) add(m[1], m[2]);
  return tables;
}

function extractWrites(src) {
  /** @type {Array<{ table: string, column: string, file: string }>} */
  const out = [];
  const re = /update\s+(\w+)(?:\s+\w+)?\s+set\s+([\s\S]*?)(?:where|;|`)/gi;
  let m;
  while ((m = re.exec(src))) {
    const table = m[1].toLowerCase();
    const body = m[2];
    for (const part of body.split(",")) {
      const col = part.replace(/\$\{[\s\S]*?\}/g, "x").trim().split(/\s*=\s*/)[0]?.trim();
      if (col && /^[a-z_][a-z0-9_]*$/i.test(col)) out.push({ table, column: col.toLowerCase(), file: "" });
    }
  }
  return out;
}

export async function loadContract() {
  const dir = join(root, "migrations");
  const names = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
  let sql = "";
  for (const n of names) sql += `\n${await readFile(join(dir, n), "utf8")}`;
  return parseSchema(sql);
}

export async function scanWrites() {
  const { readdir: rd } = await import("node:fs/promises");
  const files = [];
  async function walk(d) {
    for (const ent of await rd(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        await walk(p);
      } else if (/\.(ts|tsx|mjs|js)$/.test(ent.name)) files.push(p);
    }
  }
  await walk(join(root, "src"));
  /** @type {Array<{ table: string, column: string, file: string }>} */
  const writes = [];
  for (const file of files) {
    const src = await readFile(file, "utf8");
    for (const w of extractWrites(src)) writes.push({ ...w, file: file.replace(root + "/", "") });
  }
  return writes;
}

export async function findDrift() {
  const schema = await loadContract();
  const writes = await scanWrites();
  const drift = [];
  for (const w of writes) {
    const cols = schema.get(w.table);
    if (!cols) continue;
    if (!cols.has(w.column)) drift.push(w);
  }
  return { schema, writes, drift };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { drift } = await findDrift();
  if (drift.length) {
    console.error("[schema-contract] writes to undeclared columns:");
    for (const d of drift) console.error(`  ${d.file}: ${d.table}.${d.column}`);
    process.exit(1);
  }
  console.log("[schema-contract] ok");
}
