export const CANONICAL_ORIGIN = "https://norfai.com";
export const SITE_NAME = "Norf";
export const SITE_LEGAL_NAME = "CARIO Intelligence Oy";
export const SITE_PARTNER = "TAJU";
export const SITE_EMAIL = "cariointelligence@gmail.com";
export const SITE_EMAIL_ALT = "tajubusiness@gmail.com";
/** Verified Resend sending domain. Outbound automations must use this, not Gmail. */
export const SITE_MAIL_DOMAIN = "norfai.com";
export const SITE_MAIL_FROM = `${SITE_NAME} <noreply@${SITE_MAIL_DOMAIN}>`;
export const SITE_DESCRIPTION =
  "Find Finnish B2B companies from official registers, then enrich with published contacts and measured website facts. Empty fields stay Not found.";
export const SITE_DESCRIPTION_FI =
  "Etsi suomalaisia B2B-yrityksiä virallisista rekistereistä ja täydennä julkaistuilla yhteystiedoilla ja mitatuilla sivustohavainnoilla. Tyhjä kenttä on Not found.";

export const PRIVATE_PATH_PREFIXES = [
  "/tickets",
  "/changes",
  "/accounts",
  "/team",
  "/integrations",
  "/overview",
  "/search",
  "/companies",
  "/people",
  "/profiles",
  "/schedules",
  "/lists",
  "/review",
  "/duplicates",
  "/sources",
  "/jobs",
  "/exports",
  "/quality",
  "/audit",
  "/security",
  "/billing",
  "/settings",
  "/privacy",
  "/onboarding",
  "/admin",
  "/api",
  "/login",
  "/account",
  "/integrations",
] as const;

export function isPrivatePath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/login") return true;
  return PRIVATE_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function originFromRequest(request?: Request | null): string {
  if (request) {
    try {
      const url = new URL(request.url);
      if (url.hostname && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        return `${url.protocol}//${url.host}`;
      }
      return `${url.protocol}//${url.host}`;
    } catch {
      /* ignore */
    }
  }
  const env = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return env || "";
}

export function absUrl(path: string, origin = ""): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!origin) return p;
  return `${origin.replace(/\/$/, "")}${p}`;
}
