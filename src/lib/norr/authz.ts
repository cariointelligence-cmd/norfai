/**
 * Capability-based authorization. Roles are a convenience; every sensitive
 * operation checks a capability on the server. Tenant identity is derived from
 * the authenticated session — never from a client-supplied tenant_id.
 */

import type { PlanId } from "./platform.ts";

export const ROLES = [
  "USER",
  "TEAM_MEMBER",
  "TEAM_ADMIN",
  "ANALYST",
  "ENTERPRISE_USER",
  "SUPPORT",
  "ADMIN",
  "SYSTEM_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  "company.search",
  "company.deep_search",
  "company.export",
  "company.bulk_export",
  "company.reenrich",
  "watchlist.create",
  "workspace.manage",
  "admin.source_network",
  "admin.users",
  "admin.billing",
  "admin.security_logs",
  "admin.security_act",
  "api.token.create",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPS: Record<Role, readonly Capability[]> = {
  USER: ["company.search", "company.export", "company.reenrich", "watchlist.create", "workspace.manage", "api.token.create"],
  TEAM_MEMBER: ["company.search", "company.export", "company.reenrich", "watchlist.create"],
  TEAM_ADMIN: [
    "company.search",
    "company.deep_search",
    "company.export",
    "company.bulk_export",
    "company.reenrich",
    "watchlist.create",
    "workspace.manage",
    "api.token.create",
  ],
  ANALYST: [
    "company.search",
    "company.deep_search",
    "company.export",
    "company.reenrich",
    "watchlist.create",
    "workspace.manage",
    "api.token.create",
  ],
  ENTERPRISE_USER: [
    "company.search",
    "company.deep_search",
    "company.export",
    "company.bulk_export",
    "company.reenrich",
    "watchlist.create",
    "workspace.manage",
    "api.token.create",
  ],
  SUPPORT: ["company.search", "admin.security_logs"],
  ADMIN: CAPABILITIES,
  SYSTEM_ADMIN: CAPABILITIES,
};

export function roleFromIdentity(opts: { isAdmin: boolean; plan: PlanId; adminRole?: string | null }): Role {
  if (opts.isAdmin) {
    if (opts.adminRole === "owner" || opts.adminRole === "system") return "SYSTEM_ADMIN";
    return "ADMIN";
  }
  switch (opts.plan) {
    case "unlimited":
      return "ENTERPRISE_USER";
    case "pro":
      return "ENTERPRISE_USER";
    case "starter":
      return "ANALYST";
    default:
      return "USER";
  }
}

export function hasCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPS[role].includes(cap);
}

export function assertCapability(
  role: Role,
  cap: Capability,
): { ok: true } | { ok: false; error: string } {
  if (hasCapability(role, cap)) return { ok: true };
  return { ok: false, error: "This action is not included in the current plan or role." };
}

/** Deep search is a paid/analyst capability; admins always pass. */
export function canDeepSearch(role: Role, plan: PlanId, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (plan === "free") return false;
  return hasCapability(role, "company.deep_search");
}

export function canBulkExport(role: Role, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return hasCapability(role, "company.bulk_export");
}

export type TenantContext = {
  userId: string;
  tenantId: string;
  role: Role;
  plan: PlanId;
  isAdmin: boolean;
};

/** Tenant is the workspace owner. Never accept tenant_id from the client. */
export function tenantFromSession(userId: string, workspaceId: string | null | undefined): string {
  return workspaceId && workspaceId.trim() ? workspaceId : userId;
}

export function deny(message = "Not found"): { ok: false; error: string } {
  return { ok: false, error: message };
}
