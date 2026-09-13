/** Honest Face labels for contacts. Never invent a mailbox or person. */
export function contactFaceValue(
  value: string | null | undefined,
  opts?: { running?: boolean; recordStatus?: string | null },
): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (v) return v;
  const status = String(opts?.recordStatus ?? "").toLowerCase();
  const finished = status === "verified" || status === "enriched" || status === "rejected";
  if (opts?.running && !finished) return "Pending";
  return "Not found";
}

export function decisionMakerFace(
  name: string | null | undefined,
  title?: string | null,
  opts?: { running?: boolean; recordStatus?: string | null },
): string {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return contactFaceValue(null, opts);
  const t = typeof title === "string" ? title.trim() : "";
  return t ? `${n} · ${t}` : n;
}
