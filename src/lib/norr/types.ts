export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type JsonMap = { [key: string]: Json };

export type Combinator = "and" | "or";

export type CriteriaField =
  | "country"
  | "municipality"
  | "postal_code"
  | "radius"
  | "industry"
  | "keyword"
  | "employee_min"
  | "employee_max"
  | "revenue_min"
  | "revenue_max"
  | "profitable"
  | "growth"
  | "founded_from"
  | "founded_to"
  | "legal_form"
  | "active_only"
  | "website_required"
  | "website_tech"
  | "website_weak"
  | "ecommerce"
  | "hiring"
  | "expansion"
  | "construction_signals"
  | "procurement"
  | "role"
  | "contact_email"
  | "contact_phone"
  | "freshness_days"
  | "confidence_min"
  | "business_id";

export type Criterion = {
  id: string;
  field: CriteriaField;
  op: "eq" | "neq" | "contains" | "gte" | "lte" | "in" | "exists" | "within_km";
  value: string | number | boolean | string[] | null;
};

export type CriteriaGroup = {
  id: string;
  combinator: Combinator;
  rules: Array<Criterion | CriteriaGroup>;
};

export type SearchMode = "quick" | "advanced" | "ai" | "deep" | "opportunity";

export type SearchCriteria = {
  country: string;
  groups: CriteriaGroup;
  maxResults: number;
  roles: string[];
  depth?: "normal" | "deep";
  mode?: SearchMode;
  prompt?: string;
  preset?: string;
  target?: import("./targeting/spec.ts").TargetSpec;
  sortBy?: string;
  /** Default true. Rank unseen companies ahead of ones this user already saw. */
  prioritizeNew?: boolean;
  /** Hard exclusion: do not return companies previously delivered to this user. */
  excludeSeen?: boolean;
  /** Hard exclusion: do not return companies this user already exported. */
  excludeExported?: boolean;
  /** Hard exclusion: companies on the uploaded customer / do-not-contact list. Default true. */
  excludeCustomers?: boolean;
};

export type SourceState =
  | "connected"
  | "optional_offline"
  | "missing_credentials"
  | "temporarily_unavailable"
  | "rate_limited"
  | "access_prohibited"
  | "not_implemented";

export type SourceType =
  | "official_register"
  | "open_government"
  | "eu_dataset"
  | "procurement"
  | "company_website"
  | "structured_web"
  | "licensed_api"
  | "search_api"
  | "dns_rdap"
  | "wikidata"
  | "user_upload";

export type AdapterHealth = {
  sourceId: string;
  state: SourceState;
  latencyMs?: number;
  detail?: string;
  checkedAt: string;
};

export type RateLimitState = {
  remaining: number | null;
  resetAt: string | null;
  note: string | null;
};

export type DiscoveredCompany = {
  businessId?: string | null;
  vatId?: string | null;
  lei?: string | null;
  euId?: string | null;
  name: string;
  tradingNames?: string[];
  country: string;
  legalForm?: string | null;
  legalFormCode?: string | null;
  registrationDate?: string | null;
  endDate?: string | null;
  businessStatus?: string | null;
  tradeRegisterStatus?: string | null;
  industryCode?: string | null;
  industryLabel?: string | null;
  street?: string | null;
  postalCode?: string | null;
  municipality?: string | null;
  municipalityCode?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  lastModified?: string | null;
  tradeRegistered?: boolean | null;
  prepaymentRegistered?: boolean | null;
  employerRegistered?: boolean | null;
  vatRegistered?: boolean | null;
  situations?: string[] | null;
};

export type ObservationInput = {
  field: string;
  rawValue: string | null;
  normalisedValue: string | null;
  confidence: number;
  sourceReliability: number;
  extractionMethod: string;
  evidence?: string | null;
  sourceUrl?: string | null;
  datasetId?: string | null;
  licence?: string | null;
  verificationStatus?: string;
};

export type AdapterResult<T> = {
  ok: true;
  data: T;
  observations: ObservationInput[];
  sourceUrl?: string;
} | {
  ok: false;
  error: string;
  state?: SourceState;
};

export type PersonHit = {
  fullName: string;
  title?: string | null;
  seniority?: string | null;
  department?: string | null;
  profileUrl?: string | null;
  sourcePage?: string | null;
  workEmail?: string | null;
  workPhone?: string | null;
  evidence?: string | null;
  confidence: number;
};

export type ContactHit = {
  kind: "email" | "phone" | "social";
  value: string;
  classification: "published" | "inferred" | "obfuscated";
  roleAddress?: boolean;
  evidence?: string | null;
  sourceUrl?: string | null;
  sourceId?: string | null;
  confidence: number;
  derivationMethod?: string | null;
  phoneRole?: "mobile" | "switchboard" | "direct" | "unknown";
};

export type SignalHit = {
  kind: string;
  title: string;
  detail?: string | null;
  sourceUrl?: string | null;
  confidence: number;
  evidence?: string | null;
};

export const ROLE_ALIASES: Record<string, string[]> = {
  ceo: ["ceo", "chief executive", "managing director", "toimitusjohtaja", "verkställande direktör", "vd", "tj", "varatoimitusjohtaja"],
  founder: ["founder", "co-founder", "perustaja", "medgrundare", "perustajajäsen"],
  owner: ["owner", "omistaja", "ägare", "yrittäjä"],
  chair: ["chair", "chairman", "chairperson", "puheenjohtaja", "ordförande"],
  board: ["board member", "hallituksen jäsen", "styrelseledamot", "director", "member of the executive board", "authorized signatory", "prokuristi", "nimenkirjoittaja", "ppa"],
  coo: ["coo", "chief operating", "operatiivinen johtaja"],
  cfo: ["cfo", "chief financial", "talousjohtaja", "finansdirektör", "talouspäällikkö"],
  cto: ["cto", "chief technology", "teknologiajohtaja"],
  cio: ["cio", "chief information", "tietohallintojohtaja"],
  ciso: ["ciso", "tietoturvajohtaja"],
  cmo: ["cmo", "chief marketing", "markkinointijohtaja", "markkinointipäällikkö"],
  sales_director: ["sales director", "head of sales", "myyntijohtaja", "försäljningsdirektör", "kaupallinen johtaja", "myyntipäällikkö", "asiakkuusjohtaja", "account director", "account manager"],
  marketing_director: ["marketing director", "markkinointijohtaja", "creative director", "luova johtaja", "art director"],
  procurement_director: ["procurement director", "purchasing manager", "hankintajohtaja", "inköpschef"],
  operations_director: ["operations director", "toimintajohtaja"],
  hr_director: ["hr director", "henkilöstöjohtaja", "hr-johtaja"],
  property_manager: ["property manager", "kiinteistöpäällikkö", "isännöitsijä"],
  project_director: ["project director", "projektijohtaja", "projektipäällikkö"],
  construction_manager: ["construction manager", "vastaava mestari", "työmaapäällikkö", "rakennuspäällikkö"],
  technical_director: ["technical director", "tekninen johtaja"],
  it_director: ["it director", "it-johtaja", "tietohallintopäällikkö"],
  partner: ["partner", "osakas", "partneri", "managing partner"],
};
