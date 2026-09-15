import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

export function VisitorBeacon() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!path || path.startsWith("/api")) return;
    const body = JSON.stringify({ path, referrer: document.referrer || "" });
    void fetch("/api/track/hit", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
    }).catch(() => undefined);
  }, [path]);
  return null;
}
