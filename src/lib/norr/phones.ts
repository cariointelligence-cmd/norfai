import { normalizePhone } from "./normalize.ts";

export type PhoneRole = "mobile" | "switchboard" | "direct" | "unknown";

/** Numbers seen on many unrelated firms — directory / CDN / shared switchboard leaks. */
const SHARED_DIRECTORY_PHONES = new Set([
  "+35810665100",
  "+35810665101",
]);

export function isJunkCompanyPhone(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  if (!n) return true;
  if (SHARED_DIRECTORY_PHONES.has(n)) return true;
  if (n.startsWith("+35810665")) return true;
  return false;
}

export function phoneUsedTooWidely(otherCompanyCount: number): boolean {
  return otherCompanyCount >= 2;
}


const SWITCHBOARD_HINT = /\b(vaihde|vaihtenumero|keskus|switchboard|reception|vastaanotto|puhelinvaihde)\b/i;
const MOBILE_HINT = /\b(gsm|matkapuhelin|mobiili|mobile|cell|suora\s*gsm)\b/i;
const DIRECT_HINT = /\b(suora|direct\s*line|suoranumero)\b/i;

/** Finnish +358 mobiles: 4x (040–049) and 50. */
export function finnishMobile(e164: string): boolean {
  if (!e164.startsWith("+358")) return false;
  const rest = e164.slice(4);
  return rest.startsWith("4") || rest.startsWith("50");
}

export function classifyPhoneRole(raw: string, evidence?: string | null): PhoneRole {
  const n = normalizePhone(raw) ?? raw;
  const blob = `${evidence ?? ""}`;
  if (SWITCHBOARD_HINT.test(blob)) return "switchboard";
  if (finnishMobile(n) || MOBILE_HINT.test(blob)) return "mobile";
  if (DIRECT_HINT.test(blob)) return "direct";
  if (n.startsWith("+358")) {
    const rest = n.slice(4);
    if (rest.startsWith("9") || rest.startsWith("2") || rest.startsWith("3") || rest.startsWith("5") && !rest.startsWith("50") || rest.startsWith("6") || rest.startsWith("8") || rest.startsWith("13") || rest.startsWith("14") || rest.startsWith("15") || rest.startsWith("16") || rest.startsWith("17") || rest.startsWith("18") || rest.startsWith("19")) {
      return "switchboard";
    }
  }
  return "unknown";
}

export function phoneRoleLabel(role: PhoneRole, locale: string = "en"): string {
  const map = {
    fi: { mobile: "Matkapuhelin", switchboard: "Vaihde", direct: "Suora", unknown: "Numero" },
    en: { mobile: "Mobile", switchboard: "Switchboard", direct: "Direct", unknown: "Number" },
    sv: { mobile: "Mobil", switchboard: "Växel", direct: "Direkt", unknown: "Nummer" },
  } as const;
  const row = locale === "fi" ? map.fi : locale === "sv" ? map.sv : map.en;
  return row[role];
}

export function extractPhonesWithRole(text: string, html?: string): Array<{ value: string; role: PhoneRole; evidence: string }> {
  const source = `${html ?? ""} ${text}`;
  const re = /(?:\+|00)?(?:358)?[\s().\-]*\d(?:[\s().\-]*\d){6,13}/g;
  const telRe = /(?:tel|callto):([+\d][+\d\s().\-%]{6,20})/gi;
  const seen = new Set<string>();
  const out: Array<{ value: string; role: PhoneRole; evidence: string }> = [];
  const take = (raw: string, idx: number) => {
    const n = normalizePhone(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    const start = Math.max(0, idx - 48);
    const evidence = source.slice(start, idx + raw.length + 48).replace(/\s+/g, " ").slice(0, 140);
    out.push({ value: n, role: classifyPhoneRole(n, evidence), evidence });
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) take(m[0] ?? "", m.index);
  while ((m = telRe.exec(source))) take(m[1] ?? "", m.index);
  return out;
}

export function pickCompanyPhone(phones: Array<{ value: string; role?: string | null; personId?: string | null }>): { value: string; role: PhoneRole } | null {
  if (!phones.length) return null;
  const rank = (r: string | null | undefined, person: boolean) => {
    const role = (r as PhoneRole) || "unknown";
    if (person && role === "mobile") return 0;
    if (!person && role === "switchboard") return 1;
    if (role === "direct") return 2;
    if (role === "mobile") return 3;
    return 4;
  };
  const sorted = [...phones].sort((a, b) => rank(a.role, Boolean(a.personId)) - rank(b.role, Boolean(b.personId)));
  const top = sorted[0]!;
  return { value: top.value, role: (top.role as PhoneRole) || classifyPhoneRole(top.value) };
}
