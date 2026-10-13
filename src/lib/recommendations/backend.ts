import "server-only";

/**
 * Resolves a path on the internal PR backend (`pr-backend` service).
 *
 * On Vercel, KGEO_BACKEND_URL is injected at runtime by the `pr-backend`
 * service binding declared in vercel.json; locally it comes from .env.local.
 * The base may carry a path, so it is normalised to end in "/" before the
 * relative path is resolved against it.
 */
export function backendUrl(path: string): URL | null {
  const base = process.env.KGEO_BACKEND_URL;
  if (!base) return null;
  const normalisedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(path.replace(/^\/+/, ""), normalisedBase);
}
