/** Safe display helpers. Never return objects to React children. */

export function isoTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : value.slice(0, 32);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === "object" && typeof (value as { toISOString?: unknown }).toISOString === "function") {
    try {
      const s = (value as { toISOString: () => unknown }).toISOString();
      return typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s : null;
    } catch {
      return null;
    }
  }
  return null;
}

function localeTag(locale?: string): string {
  if (locale === "fi" || locale === "fi-FI") return "fi-FI";
  if (locale === "sv" || locale === "sv-SE") return "sv-SE";
  if (locale === "en" || locale === "en-GB" || locale === "en-US") return "en-GB";
  return "en-GB";
}

export function formatWhen(value: unknown, empty = "-", locale?: string): string {
  const iso = isoTime(value);
  if (!iso) return empty;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return empty;
  try {
    return d.toLocaleString(localeTag(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export function formatStamp(value: unknown, empty = "-"): string {
  const iso = isoTime(value);
  if (!iso || typeof iso !== "string") return empty;
  return iso.slice(0, 19).replace("T", " ");
}

export function asDisplay(value: unknown, empty = ""): string {
  if (value == null) return empty;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  const iso = isoTime(value);
  if (iso) return iso;
  return empty;
}
