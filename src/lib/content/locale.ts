import type { Locale } from "@/lib/i18n";

export type Localized<T> = { fi: T; en: T; sv?: T };

export function loc<T>(bundle: Localized<T>, locale: Locale | string): T {
  if (locale === "en") return bundle.en;
  if (locale === "sv") return bundle.sv ?? bundle.fi;
  return bundle.fi;
}

export function wordCount(...parts: Array<string | string[] | undefined>): number {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []))
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
