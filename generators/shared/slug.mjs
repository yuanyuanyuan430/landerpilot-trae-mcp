export function slugify(value, fallback = "item") {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return slug || fallback;
}

export function createUniqueSlug(value, fallback, used) {
  const base = slugify(value, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = appendSlugSuffix(base, suffix);
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function normalizeUrl(value, fallback = "") {
  const text = String(value ?? "").trim().replace(/[),.;]+$/g, "");
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(text)) return `https://${text}`;
  return fallback;
}

export function domainFromUrl(value) {
  const url = normalizeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function siteUrlFromDomain(domain, fallback = "https://example.com") {
  const text = String(domain ?? "").trim();
  if (!text) return fallback;
  return normalizeUrl(text, fallback).replace(/\/+$/g, "");
}

export function routeToOutputPage(route) {
  const normalized = normalizeRoute(route);
  return normalized === "index" ? "index.html" : `${normalized}/index.html`;
}

export function normalizeRoute(route) {
  const text = String(route ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html$/i, "");
  const normalized = text || "index";
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return "index";
  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("\0") ||
      !/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(segment)
    ) {
      throw new Error(`Unsafe LanderPilot route segment: ${segment}`);
    }
  }
  return segments.join("/");
}

function appendSlugSuffix(base, suffix) {
  const tail = `-${suffix}`;
  const trimmed = base.slice(0, Math.max(1, 72 - tail.length)).replace(/-+$/g, "");
  return `${trimmed || "item"}${tail}`;
}
