import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { neonPooledUrl, resolvePostgresUrl } from "./neon-url.ts";

describe("Neon / Vercel postgres URL", () => {
  it("rewrites a direct Neon host to the pooler", () => {
    const direct = "postgresql://u:p@ep-foo.eu-central-1.aws.neon.tech/neondb?sslmode=require";
    const pooled = neonPooledUrl(direct);
    assert.match(pooled, /ep-foo-pooler\.eu-central-1\.aws\.neon\.tech/);
    assert.equal(neonPooledUrl(pooled), pooled);
  });

  it("prefers an already-pooled Vercel/Neon URL", () => {
    const r = resolvePostgresUrl({
      DATABASE_URL: "postgresql://u:p@ep-foo.eu-central-1.aws.neon.tech/neondb",
      POSTGRES_PRISMA_URL: "postgresql://u:p@ep-foo-pooler.eu-central-1.aws.neon.tech/neondb?pgbouncer=true",
    });
    assert.equal(r.pooled, true);
    assert.equal(r.source, "POSTGRES_PRISMA_URL");
    assert.match(r.url ?? "", /pooler/);
  });

  it("treats empty DATABASE_URL as unset", () => {
    const r = resolvePostgresUrl({ DATABASE_URL: "   " });
    assert.equal(r.url, undefined);
  });
});
