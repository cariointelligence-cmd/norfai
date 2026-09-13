import { PLANS, normalizePlanId, type PlanId } from "./platform.ts";
import { randomBytes } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(raw: unknown): raw is PlanId {
  return typeof raw === "string" && (PLAN_IDS as string[]).includes(raw);
}

export function generateTempPassword(): string {
  return randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x").slice(0, 16);
}

export function parseAdminEmail(raw: unknown): string | null {
  const email = String(raw ?? "").toLowerCase().trim();
  if (!EMAIL_RE.test(email) || email.length > 180) return null;
  return email;
}

export type CreateUserInput = {
  email: string;
  name: string;
  password: string | null;
  plan: PlanId;
  makeAdmin: boolean;
};

export function parseCreateUserInput(data: Record<string, unknown>): { ok: true; value: CreateUserInput } | { ok: false; error: string } {
  const email = parseAdminEmail(data.email);
  if (!email) return { ok: false, error: "Enter a valid email." };
  const name = String(data.name ?? "").trim().slice(0, 80) || email.split("@")[0] || "Analyst";
  const rawPass = String(data.password ?? "");
  let password: string | null = rawPass;
  if (!rawPass.trim()) password = null;
  else if (rawPass.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  else if (rawPass.length > 128) return { ok: false, error: "Password is too long." };
  const plan = isPlanId(data.plan) ? data.plan : normalizePlanId(String(data.plan ?? "free"));
  const makeAdmin = data.makeAdmin === true || data.makeAdmin === "true";
  return { ok: true, value: { email, name, password, plan, makeAdmin } };
}
