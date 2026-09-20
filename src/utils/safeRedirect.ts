export function getSafeNextPath(fallback: string, allowedPrefixes: readonly string[]): string {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return allowedPrefixes.some((prefix) => next === prefix || next.startsWith(`${prefix}/`)) ? next : fallback;
}
