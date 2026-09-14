#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CRON = { path: "/api/cron/tick", schedule: "*/2 * * * *" };
const path = ".vercel/output/config.json";
if (!existsSync(path)) process.exit(0);
const config = JSON.parse(readFileSync(path, "utf8"));
const key = (c) => `${c?.path}|${c?.schedule}`;
const seen = new Set([key(CRON)]);
const rest = (Array.isArray(config.crons) ? config.crons : []).filter((c) => {
  const k = key(c);
  if (!k || seen.has(k)) return false;
  seen.add(k);
  return true;
});
config.crons = [CRON, ...rest];
config.fluid = true;
writeFileSync(path, JSON.stringify(config, null, 2));
console.log("[vercel-config] crons=1 fluid=true path=/api/cron/tick schedule=*/2");
