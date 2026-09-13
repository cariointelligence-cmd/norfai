import { lintPublicCatalog, staticPublicPages, type PublicPage } from "./catalog.ts";
import { hasEmDash } from "./copy-lint.ts";

export type SeoIssue = {
  path: string;
  severity: "critical" | "warn" | "info";
  code: string;
  what: string;
  why: string;
  action: string;
};

export type SeoNotice = "threat" | "warning" | "missing" | "info";

export function seoIssueNotice(issue: Pick<SeoIssue, "severity" | "code">): SeoNotice {
  if (issue.code === "title_short" || issue.code === "desc_short" || issue.code === "thin") return "missing";
  if (issue.severity === "critical" || issue.code.startsWith("dup_")) return "threat";
  if (issue.severity === "warn") return "warning";
  return "info";
}

export type SeoAudit = {
  health: number;
  geo: number;
  pages: number;
  indexable: number;
  issues: SeoIssue[];
  notices: { threat: number; warning: number; missing: number };
  generatedAt: string;
};

function unique(pages: PublicPage[], field: "title" | "description"): string[] {
  const seen = new Map<string, string[]>();
  for (const p of pages) {
    const v = p[field].trim().toLowerCase();
    seen.set(v, [...(seen.get(v) ?? []), p.path]);
  }
  return [...seen.values()].filter((v) => v.length > 1).flat();
}

export function auditPublicSite(extra: { newsCount?: number; drafts?: number } = {}): SeoAudit {
  const pages = staticPublicPages();
  const indexable = pages.filter((p) => p.indexable);
  const issues: SeoIssue[] = [];

  for (const p of indexable) {
    if (!p.title || p.title.length < 15) {
      issues.push({
        path: p.path,
        severity: "critical",
        code: "title_short",
        what: "Title is missing or too short.",
        why: "Search engines and AI answer systems use the title to understand the page.",
        action: "Write a specific title that matches the search intent.",
      });
    }
    if (p.title.length > 70) {
      issues.push({
        path: p.path,
        severity: "warn",
        code: "title_long",
        what: "Title is longer than 70 characters.",
        why: "Long titles get cut in search results.",
        action: "Shorten without stuffing keywords.",
      });
    }
    if (!p.description || p.description.length < 50) {
      issues.push({
        path: p.path,
        severity: "critical",
        code: "desc_short",
        what: "Meta description is thin.",
        why: "A weak description lowers click-through from search.",
        action: "Write a natural 50 to 160 character description.",
      });
    }
    if (p.words < 120 && p.kind !== "legal" && p.path !== "/news" && p.path !== "/support") {
      issues.push({
        path: p.path,
        severity: "warn",
        code: "thin",
        what: "Page copy is thin.",
        why: "Thin pages do not earn rankings or citations.",
        action: "Add a unique answer, not another template paragraph.",
      });
    }
    if (hasEmDash(`${p.title} ${p.description}`)) {
      issues.push({
        path: p.path,
        severity: "warn",
        code: "em_dash",
        what: "Copy contains an em dash.",
        why: "Em dashes make marketing copy look machine-written.",
        action: "Rewrite with a period or comma.",
      });
    }
  }

  for (const path of unique(indexable, "title")) {
    issues.push({
      path,
      severity: "critical",
      code: "dup_title",
      what: "Duplicate title.",
      why: "Duplicate titles compete with each other.",
      action: "Give each indexable URL a unique title.",
    });
  }
  for (const path of unique(indexable, "description")) {
    issues.push({
      path,
      severity: "warn",
      code: "dup_desc",
      what: "Duplicate meta description.",
      why: "Repeated descriptions look like doorway pages.",
      action: "Write a unique description for this URL.",
    });
  }

  for (const issue of lintPublicCatalog()) {
    if (issue.kind === "banned_phrase") {
      issues.push({
        path: issue.path,
        severity: "warn",
        code: "banned_phrase",
        what: `Public copy contains “${issue.excerpt}”.`,
        why: "Internal or hype language does not help a buyer.",
        action: "Rewrite in customer language.",
      });
    }
  }

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warn = issues.filter((i) => i.severity === "warn").length;
  const notices = {
    threat: issues.filter((i) => seoIssueNotice(i) === "threat").length,
    warning: issues.filter((i) => seoIssueNotice(i) === "warning").length,
    missing: issues.filter((i) => seoIssueNotice(i) === "missing").length,
  };
  let health = 100 - critical * 8 - warn * 3;
  if (indexable.length >= 20) health += 4;
  if ((extra.newsCount ?? 0) > 0) health += 2;
  health = Math.max(0, Math.min(100, health));

  const geoSignals = [
    indexable.some((p) => p.path === "/faq"),
    indexable.some((p) => p.path === "/guides/website-quality-methodology"),
    indexable.some((p) => p.path === "/about"),
    indexable.every((p) => p.description.length >= 40),
    !indexable.some((p) => hasEmDash(p.title)),
  ];
  const geo = Math.round((geoSignals.filter(Boolean).length / geoSignals.length) * 100);

  return {
    health,
    geo,
    pages: pages.length,
    indexable: indexable.length,
    issues: issues.slice(0, 80),
    notices,
    generatedAt: new Date().toISOString(),
  };
}
