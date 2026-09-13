/** Spreadsheet-safe exporters. Prefix formula-like cells to block injection. */

export function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s) || s.startsWith("\t") || s.startsWith("\r")) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Array<Record<string, string | number | null>>): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const lines = [keys.map(escapeCsv).join(",")];
  for (const r of rows) lines.push(keys.map((k) => escapeCsv(r[k])).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function safeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return xmlEscape(s);
}

/** SpreadsheetML 2003 XML. Excel opens this. Formula injection is escaped. */
export function rowsToXlsx(rows: Array<Record<string, string | number | null>>): string {
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const header = keys
    .map((k) => `<Cell><Data ss:Type="String">${xmlEscape(k)}</Data></Cell>`)
    .join("");
  const body = rows
    .map((r) => {
      const cells = keys
        .map((k) => {
          const v = r[k];
          const t = typeof v === "number" ? "Number" : "String";
          return `<Cell><Data ss:Type="${t}">${safeCell(v)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Companies"><Table>
<Row>${header}</Row>
${body}
</Table></Worksheet>
</Workbook>`;
}

export function rowsToCrmCsv(rows: Array<{
  company: string;
  businessId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  emailClass: string;
  phone: string;
  website: string;
  city: string;
  country: string;
}>): string {
  return rowsToCsv(
    rows.map((r) => ({
      Company: r.company,
      BusinessId: r.businessId,
      FirstName: r.firstName,
      LastName: r.lastName,
      Title: r.title,
      Email: r.email,
      EmailClassification: r.emailClass,
      Phone: r.phone,
      Website: r.website,
      City: r.city,
      Country: r.country,
    })),
  );
}

export type CsvPreset = "basic" | "sales" | "financial" | "marketing" | "full";

export const CSV_PRESET_KEYS: Record<CsvPreset, readonly string[] | null> = {
  basic: [
    "name",
    "canonical_company_id",
    "business_id",
    "country",
    "municipality",
    "website",
    "industry_label",
    "match_score",
    "run_id",
    "exported_at",
  ],
  sales: [
    "name",
    "canonical_company_id",
    "business_id",
    "vat_id",
    "municipality",
    "website",
    "phone",
    "email_published",
    "email_inferred",
    "people",
    "opportunity_score",
    "match_score",
    "run_id",
    "exported_at",
  ],
  financial: [
    "name",
    "canonical_company_id",
    "business_id",
    "municipality",
    "industry_label",
    "revenue",
    "revenue_currency",
    "opportunity_score",
    "run_id",
    "exported_at",
  ],
  marketing: [
    "name",
    "canonical_company_id",
    "business_id",
    "website",
    "website_score",
    "seo_score",
    "opportunity_score",
    "email_published",
    "run_id",
    "exported_at",
  ],
  full: null,
};

export function projectCsvRows(
  rows: Array<Record<string, string | number | null>>,
  preset?: string | null,
): Array<Record<string, string | number | null>> {
  const key = (preset ?? "full") as CsvPreset;
  const cols = CSV_PRESET_KEYS[key];
  if (!cols) return rows;
  return rows.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const k of cols) {
      if (k in r) out[k] = r[k] ?? "";
    }
    return out;
  });
}
