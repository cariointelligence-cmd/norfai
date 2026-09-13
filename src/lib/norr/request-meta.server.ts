import { getRequest } from "@tanstack/react-start/server";

export function clientIp(): string | null {
  try {
    const request = getRequest();
    if (!request) return null;
    const xf = request.headers.get("x-forwarded-for");
    if (xf) return xf.split(",")[0]!.trim().slice(0, 64);
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
    return null;
  } catch {
    return null;
  }
}

export function requestOrigin(): string | null {
  try {
    const request = getRequest();
    if (!request) return null;
    return request.headers.get("origin");
  } catch {
    return null;
  }
}
