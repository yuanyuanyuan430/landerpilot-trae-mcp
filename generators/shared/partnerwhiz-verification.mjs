export const PARTNERWHIZ_META_NAME = "partnerwhiz-verify";
const TOKEN = /^pw_[A-Za-z0-9_-]{1,200}$(?![\s\S])/;
const INPUT_KEYS = ["partnerWhizVerificationToken", "partnerwhiz_verification"];
const INVALID = "Expected a pw_ token or one PartnerWhiz meta tag containing only quoted name and content attributes.";

// This is deliberately a small allowlist grammar, not a general HTML parser.
// Never pass the supplied HTML through: only its validated token is retained.
export function parsePartnerWhizToken(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error(INVALID);
  const source = value.trim();
  if (TOKEN.test(source)) return source;
  const tag = /^<meta(?=[\t\n\f\r ])([\s\S]*?)(?:\/?>)$/i.exec(source);
  if (!tag) throw new Error(INVALID);
  const attributes = new Map();
  let rest = tag[1];
  while (!/^[\t\n\f\r ]*$/.test(rest)) {
    const attribute = /^[\t\n\f\r ]+([a-z]+)[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"<>]*)"|'([^'<>]*)')/i.exec(rest);
    if (!attribute) throw new Error(INVALID);
    const key = attribute[1].toLowerCase();
    if (!["name", "content"].includes(key) || attributes.has(key)) throw new Error(INVALID);
    attributes.set(key, attribute[2] ?? attribute[3]);
    rest = rest.slice(attribute[0].length);
  }
  const token = attributes.get("content");
  if (attributes.size !== 2 || attributes.get("name")?.toLowerCase() !== PARTNERWHIZ_META_NAME || !TOKEN.test(token || "")) {
    throw new Error(INVALID);
  }
  return token;
}

export function partnerWhizTokenFromInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Generation input must be an object.");
  const tokens = INPUT_KEYS.filter((key) => Object.hasOwn(input, key))
    .map((key) => parsePartnerWhizToken(input[key]));
  if (new Set(tokens).size > 1) throw new Error("Conflicting PartnerWhiz verification inputs.");
  return tokens[0] || null;
}

export function canonicalPartnerWhizInput(input, token) {
  const normalized = { ...input };
  for (const key of INPUT_KEYS) delete normalized[key];
  if (token) normalized.partnerWhizVerificationToken = parsePartnerWhizToken(token);
  return normalized;
}

export function renderPartnerWhizMeta(token) {
  return `<meta name="${PARTNERWHIZ_META_NAME}" content="${parsePartnerWhizToken(token)}">`;
}

// Validate generator-owned build output in both URL-first and token-first flows.
// An absent token must never turn into a placeholder verification tag.
export function assertPartnerWhizArtifact(html, token = null, page = "HTML document") {
  const expected = token === null ? null : renderPartnerWhizMeta(token);
  const head = /^\s*(?:<!doctype html>\s*)?<html\b[^>]*>\s*<head\s*>([\s\S]*?)<\/head\s*>/i.exec(html);
  if (!head) throw new Error(`Built page requires an explicit document head: ${page}`);
  const tags = [];
  const markup = /<!--[\s\S]*?-->|<(script|style|title|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  for (const match of html.matchAll(markup)) {
    if (!/^<meta\b/i.test(match[0])) continue;
    const attributes = /([a-z_:][-a-z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;
    for (const attribute of match[0].slice(5, -1).matchAll(attributes)) {
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
      if (attribute[1].toLowerCase() === "name" && value.toLowerCase() === PARTNERWHIZ_META_NAME) {
        tags.push(match);
        break;
      }
    }
  }
  if (expected === null) {
    if (tags.length) throw new Error(`Built page must not contain PartnerWhiz verification before a token is configured: ${page}`);
  } else if (tags.length !== 1 || tags[0][0] !== expected || tags[0].index >= head[0].length) {
    throw new Error(`Built page must contain exactly one canonical PartnerWhiz tag in its head: ${page}`);
  }
}

// Only generator-owned complete documents are supported here. Keep Astro's
// frontmatter byte-identical; metadata belongs in the actual document head.
export function injectPartnerWhizMeta(source, token) {
  const meta = renderPartnerWhizMeta(token);
  const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)?.[0] || "";
  const document = source.slice(frontmatter.length);
  const opening = /^\s*(?:<!doctype html>\s*)?<html\b[^>]*>\s*<head\s*>/i.exec(document);
  if (!opening) throw new Error("PartnerWhiz verification requires a generated document with an explicit head.");
  // All shipped producers generate this head shape. Skip comments and raw text
  // so escaped examples in metadata/scripts cannot be mistaken for real tags.
  const rest = document.slice(opening[0].length);
  const tags = /<!--[\s\S]*?-->|<(script|style|title|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>|<template\b|<\/head\s*>|<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let head = "";
  let cursor = 0;
  for (const match of rest.matchAll(tags)) {
    const text = match[0];
    if (/^<template\b/i.test(text)) {
      throw new Error("PartnerWhiz verification does not support templates inside generated heads.");
    }
    if (/^<\/head/i.test(text)) {
      head += rest.slice(cursor, match.index);
      return frontmatter + opening[0] + meta + head + rest.slice(match.index);
    }
    if (/^<meta\b/i.test(text) && /[\t\n\f\r ]name\s*=\s*["']partnerwhiz-verify["']/i.test(text)) {
      // Producers can supply a canonical tag already; regeneration replaces it
      // and any duplicates rather than accumulating additional verification tags.
      parsePartnerWhizToken(text);
      head += rest.slice(cursor, match.index);
      cursor = match.index + text.length;
    }
  }
  throw new Error("PartnerWhiz verification requires a closing head tag.");
}
