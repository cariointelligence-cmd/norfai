import { useLayoutEffect } from "react";

const CANONICAL = "www.norfai.com";

/** Apex and *.vercel.app 308 POSTs drop fetch. Keep the SPA on www. */
export function CanonicalHost() {
  useLayoutEffect(() => {
    const host = window.location.hostname.toLowerCase();
    if (host === CANONICAL) return;
    if (host !== "norfai.com" && !host.endsWith(".vercel.app")) return;
    window.location.replace(
      `https://${CANONICAL}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }, []);
  return null;
}
