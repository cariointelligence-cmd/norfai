import type { Sql } from "@/lib/db";

export type SourceFlag = {
  id: string;
  enabled: boolean;
  state: string;
};

/** Kill-switch. Missing row means the Sensor stays on. Caller seeds source_health. */
export async function loadSourceFlags(sql: Sql, userId: string): Promise<Map<string, SourceFlag>> {
  try {
    const rows = await sql<{ source_id: string; enabled: boolean | null; state: string | null }>`
      select source_id, enabled, state from source_health where user_id = ${userId}`;
    const map = new Map<string, SourceFlag>();
    for (const row of rows) {
      map.set(row.source_id, {
        id: row.source_id,
        enabled: row.enabled !== false,
        state: String(row.state ?? "connected"),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

export function sourceAllowed(flags: Map<string, SourceFlag> | null | undefined, id: string): boolean {
  const flag = flags?.get(id);
  if (!flag) return true;
  return flag.enabled !== false;
}

export function disabledSourceIds(flags: Map<string, SourceFlag>): Set<string> {
  const out = new Set<string>();
  for (const [id, flag] of flags) {
    if (!flag.enabled) out.add(id);
  }
  return out;
}
