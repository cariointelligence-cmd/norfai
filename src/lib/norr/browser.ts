import { existsSync } from "node:fs";
import { BROWSER_UA } from "./ssrf.ts";

const CHROME_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
  "/opt/pw-browsers/chromium-1234/chrome-linux64/chrome",
].filter((p): p is string => Boolean(p));

type PwRoute = {
  request: () => { url: () => string };
  continue: () => Promise<void>;
  abort: (reason?: string) => Promise<void>;
};

type PwPage = {
  goto: (url: string, opts?: { waitUntil?: "domcontentloaded" | "load"; timeout?: number }) => Promise<{ status: () => number } | null>;
  content: () => Promise<string>;
  title: () => Promise<string>;
  evaluate: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  waitForTimeout: (ms: number) => Promise<void>;
  close: () => Promise<void>;
  locator: (sel: string) => { innerText: () => Promise<string> };
  route: (url: string, handler: (route: PwRoute) => Promise<void>) => Promise<void>;
};

type PwBrowser = {
  newPage: (opts?: { userAgent?: string }) => Promise<PwPage>;
  close: () => Promise<void>;
};

let browserPromise: Promise<PwBrowser | null> | null = null;
let launchFailed = false;
let chain: Promise<unknown> = Promise.resolve();

function chromePath(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function getBrowser(): Promise<PwBrowser | null> {
  if (launchFailed) return null;
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    try {
      const importer = new Function("m", "return import(m)") as (m: string) => Promise<typeof import("playwright")>;
      const pw = await importer("playwright");
      const exe = chromePath();
      const browser = await pw.chromium.launch({
        executablePath: exe ?? undefined,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
      return browser as unknown as PwBrowser;
    } catch (err) {
      console.error("[norf] Playwright launch failed", err instanceof Error ? err.message : err);
      launchFailed = true;
      browserPromise = null;
      return null;
    }
  })();
  return browserPromise;
}

async function dismissOverlays(page: PwPage) {
  try {
    await page.evaluate(() => {
      const root = document.getElementById("gravitoCMPRoot");
      if (root) root.remove();
      document.querySelectorAll('[class*="CMP"], [id*="cookie"], [class*="cookie-banner"]').forEach((el) => {
        if (el instanceof HTMLElement) el.style.display = "none";
      });
    });
  } catch {
    /* overlay is optional */
  }
}

/** Serialise Playwright so Finder's WAF is not hit with a burst of browsers. */
export function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function fetchRendered(url: string, opts: { waitMs?: number; timeoutMs?: number } = {}): Promise<{
  ok: boolean;
  status: number;
  url: string;
  title: string;
  html: string;
  text: string;
  error?: string;
}> {
  const timeoutMs = opts.timeoutMs ?? 18000;
  const waitMs = opts.waitMs ?? 1200;
  return withBrowserLock(async () => {
    const browser = await getBrowser();
    if (!browser) return { ok: false, status: 0, url, title: "", html: "", text: "", error: "Chromium unavailable" };
    const page = await browser.newPage({ userAgent: BROWSER_UA });
    try {
      const { assertSafeUrl } = await import("./ssrf.ts");
      await assertSafeUrl(url);
      await page.route("**/*", async (route) => {
        try {
          await assertSafeUrl(route.request().url());
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForTimeout(waitMs);
      await dismissOverlays(page);
      try {
        await page.evaluate(() => {
          const tab = document.getElementById("tab-decisionMakers");
          if (tab instanceof HTMLElement) tab.click();
        });
        await page.waitForTimeout(600);
      } catch {
        /* tab is optional */
      }
      const html = await page.content();
      const title = await page.title();
      let text = "";
      try {
        text = await page.locator("body").innerText();
      } catch {
        text = html.replace(/<[^>]+>/g, " ");
      }
      const status = resp?.status?.() ?? 0;
      return { ok: status > 0 && status < 500, status, url, title, html, text };
    } catch (err) {
      return { ok: false, status: 0, url, title: "", html: "", text: "", error: err instanceof Error ? err.message : "render failed" };
    } finally {
      await page.close().catch(() => undefined);
    }
  });
}

export { BROWSER_UA };

export function playwrightAvailable(): boolean {
  if (launchFailed) return false;
  return chromePath() !== null;
}
