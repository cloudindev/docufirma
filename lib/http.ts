import "server-only";

/** Client IP as seen by Vercel (x-real-ip) or a generic proxy (first x-forwarded-for hop). */
export function clientIpFrom(headers: Headers): string | null {
  const ip =
    headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!ip) return null;
  // Basic sanity check so garbage never reaches the inet column.
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export function geoFrom(headers: Headers) {
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    country: headers.get("x-vercel-ip-country"),
    region: decode(headers.get("x-vercel-ip-country-region")),
    city: decode(headers.get("x-vercel-ip-city")),
  };
}
