export type OfferFamily =
  | "website"
  | "seo"
  | "marketing"
  | "erp"
  | "saas"
  | "recruitment"
  | "cyber"
  | "general";

export type RoleBucket =
  | "CEO"
  | "CFO"
  | "CIO"
  | "COO"
  | "CMO"
  | "HR"
  | "SALES"
  | "PRODUCTION"
  | "MARKETING"
  | "OTHER";

const TITLE_BUCKETS: Array<{ bucket: RoleBucket; re: RegExp }> = [
  { bucket: "CEO", re: /toimitusjohtaja|\bceo\b|managing director|\bvd\b|\btj\b|verkställande/i },
  { bucket: "CFO", re: /talousjohtaja|\bcfo\b|finance director|pääkirjanpitäjä/i },
  { bucket: "CIO", re: /tietohallinto|\bcio\b|\bcto\b|it-johtaja|teknologiajohtaja/i },
  { bucket: "COO", re: /operatiivinen johtaja|\bcoo\b|operations director/i },
  { bucket: "CMO", re: /markkinointijohtaja|\bcmo\b|marketing director/i },
  { bucket: "HR", re: /henkilöstöjohtaja|\bhr\b|talent|rekrytointi/i },
  { bucket: "SALES", re: /myyntijohtaja|commercial director|myyntipäällikkö|sales director/i },
  { bucket: "PRODUCTION", re: /tuotantojohtaja|production director|tehdaspäällikkö|plant manager/i },
  { bucket: "MARKETING", re: /markkinointi(?:päällikkö|johtaja)|growth lead/i },
];

export function offerFamilyFromText(text: string): OfferFamily {
  const t = text.toLowerCase();
  if (/verkkosiv|website|kotisiv|web agency|sivusto/.test(t)) return "website";
  if (/\bseo\b|hakukone/.test(t)) return "seo";
  if (/markkinoin|mainostoimist|paid media|ads?\b/.test(t)) return "marketing";
  if (/\berp\b|toiminnanohjaus/.test(t)) return "erp";
  if (/saas|ohjelmist|crm\b/.test(t)) return "saas";
  if (/rekry|henkilöstövuokraus|staffing/.test(t)) return "recruitment";
  if (/tietoturva|cyber|security/.test(t)) return "cyber";
  return "general";
}

export function roleBucketFromTitle(title: string | null | undefined): RoleBucket {
  const t = title ?? "";
  for (const row of TITLE_BUCKETS) if (row.re.test(t)) return row.bucket;
  return "OTHER";
}

const RELEVANCE: Record<OfferFamily, RoleBucket[]> = {
  website: ["CEO", "CMO", "MARKETING", "SALES"],
  seo: ["CEO", "CMO", "MARKETING"],
  marketing: ["CMO", "CEO", "MARKETING", "SALES"],
  erp: ["CEO", "CIO", "COO", "PRODUCTION", "CFO"],
  saas: ["CEO", "CIO", "COO", "CFO"],
  recruitment: ["CEO", "HR"],
  cyber: ["CEO", "CIO"],
  general: ["CEO", "SALES", "CFO"],
};

export function roleRelevance(opts: {
  offer: OfferFamily | string;
  title?: string | null;
}): { bucket: RoleBucket; rank: number; relevant: boolean } {
  const family = (["website", "seo", "marketing", "erp", "saas", "recruitment", "cyber", "general"] as OfferFamily[]).includes(opts.offer as OfferFamily)
    ? (opts.offer as OfferFamily)
    : offerFamilyFromText(opts.offer);
  const bucket = roleBucketFromTitle(opts.title);
  const order = RELEVANCE[family] ?? RELEVANCE.general;
  const idx = order.indexOf(bucket);
  return { bucket, rank: idx === -1 ? 99 : idx, relevant: idx !== -1 };
}

export function pickRelevantPerson<T extends { title?: string | null; fullName?: string | null }>(
  people: T[],
  offer: OfferFamily | string,
): T | null {
  if (!people.length) return null;
  const ranked = [...people].sort((a, b) => roleRelevance({ offer, title: a.title }).rank - roleRelevance({ offer, title: b.title }).rank);
  return ranked[0] ?? null;
}
