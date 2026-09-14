import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONSTRUCTION_BANNER_UNTIL_MS, constructionBannerActive } from "./construction-banner.ts";

describe("construction banner self-destruct", () => {
  it("is visible before 16:00 Helsinki on 16 Sep 2026 and gone after", () => {
    assert.equal(constructionBannerActive(Date.parse("2026-09-16T15:59:59+03:00")), true);
    assert.equal(constructionBannerActive(CONSTRUCTION_BANNER_UNTIL_MS), false);
    assert.equal(constructionBannerActive(Date.parse("2026-09-16T16:00:00+03:00")), false);
    assert.equal(constructionBannerActive(Date.parse("2026-09-16T16:00:01+03:00")), false);
  });
});
