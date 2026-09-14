/** Construction notice ends 16 Sep 2026 16:00 Europe/Helsinki (EEST, UTC+3). */
export const CONSTRUCTION_BANNER_UNTIL_MS = Date.parse("2026-09-16T16:00:00+03:00");

export function constructionBannerActive(now = Date.now()): boolean {
  return now < CONSTRUCTION_BANNER_UNTIL_MS;
}
