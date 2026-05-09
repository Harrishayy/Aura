export function assetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.trim();
  if (!base) return path;
  const trimmedBase = base.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalized}`;
}
