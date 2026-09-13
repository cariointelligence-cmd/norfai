import type { Sql } from "@/lib/db";
import type { CompanyCapability, EngineStatus } from "./engine-contract.ts";

export async function recordCapability(
  sql: Sql,
  userId: string,
  companyId: string,
  capability: CompanyCapability,
  status: EngineStatus,
  extra?: { error?: string | null; durationMs?: number | null; evidence?: unknown },
): Promise<void> {
  try {
    await sql`
      insert into company_capabilities (user_id, company_id, capability, status, evidence, last_error, duration_ms, observed_at)
      values (
        ${userId}, ${companyId}, ${capability}, ${status},
        ${JSON.stringify(extra?.evidence ?? {})}::jsonb,
        ${extra?.error ?? null},
        ${extra?.durationMs ?? null},
        now()
      )
      on conflict (user_id, company_id, capability) do update set
        status = excluded.status,
        evidence = excluded.evidence,
        last_error = excluded.last_error,
        duration_ms = excluded.duration_ms,
        observed_at = now()`;
  } catch {
    /* table may not exist until migrate — never block enrich */
  }
}
