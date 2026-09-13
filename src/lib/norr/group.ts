export type GroupHit = {
  parentName: string;
  parentBusinessId?: string | null;
  role: "subsidiary" | "parent" | "independent";
  evidence: string;
  confidence: number;
};

const PARENT_RES: Array<{ re: RegExp; confidence: number }> = [
  { re: /osa\s+(.{3,80}?)\s*-?\s*konsern/i, confidence: 78 },
  { re: /kuuluu\s+(.{3,80}?)\s*-?\s*konserniin/i, confidence: 78 },
  { re: /part of\s+(?:the\s+)?(.{3,80}?)\s+group/i, confidence: 74 },
  { re: /tytäryhtiö\s+(?:of|\/)?\s*(.{3,80})/i, confidence: 72 },
  { re: /subsidiary of\s+(.{3,80})/i, confidence: 80 },
  { re: /emoyhtiö[:\s]+(.{3,80})/i, confidence: 82 },
  { re: /parent company[:\s]+(.{3,80})/i, confidence: 80 },
];

function cleanName(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.|•].*$/, "")
    .replace(/["”]/g, "")
    .trim()
    .slice(0, 80);
}

export function extractParentMention(text: string): GroupHit | null {
  const blob = text.slice(0, 80_000);
  for (const { re, confidence } of PARENT_RES) {
    const m = blob.match(re);
    const name = m?.[1] ? cleanName(m[1]) : "";
    if (name.length < 3) continue;
    if (/^(the|a|our|this|meidän|tämän)$/i.test(name)) continue;
    return {
      parentName: name,
      role: "subsidiary",
      evidence: (m?.[0] ?? "").slice(0, 160),
      confidence,
    };
  }
  return null;
}
