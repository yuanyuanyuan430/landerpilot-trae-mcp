import { escapeHtml } from "./html.mjs";

const SECTION_RE = /\{\{\s*([#^])\s*([A-Za-z0-9_.-]+)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g;
const TRIPLE_RE = /\{\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}\}/g;
const DOUBLE_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

export function renderTemplate(template, data, options = {}) {
  const missing = new Set();
  let html = String(template ?? "");
  let previous;
  do {
    previous = html;
    SECTION_RE.lastIndex = 0;
    html = html.replace(SECTION_RE, (_match, mode, key, body) => {
      const value = lookup(data, key);
      const truthy = isTruthy(value);
      if (mode === "^") return truthy ? "" : renderTemplate(body, data, options).html;
      if (!truthy) return "";
      if (Array.isArray(value)) {
        return value
          .map((item) => renderTemplate(body, mergeContext(data, item), options).html)
          .join("");
      }
      if (isRecord(value)) return renderTemplate(body, mergeContext(data, value), options).html;
      return renderTemplate(body, data, options).html;
    });
  } while (html !== previous);

  html = html.replace(TRIPLE_RE, (_match, key) => {
    const value = lookup(data, key);
    if (value === undefined || value === null) {
      missing.add(key);
      return "";
    }
    return String(value);
  });

  html = html.replace(DOUBLE_RE, (_match, key) => {
    const value = lookup(data, key);
    if (value === undefined || value === null) {
      missing.add(key);
      return "";
    }
    if (isRawKey(key)) return String(value);
    return escapeHtml(value);
  });

  if (options.stripUnknown !== false) {
    html = html.replace(/\{\{\{?\s*[^}]+?\s*\}?\}\}/g, "");
  }

  return { html, missing: [...missing].sort() };
}

export function collectTemplateVariables(template) {
  const variables = new Set();
  for (const match of String(template ?? "").matchAll(/\{\{\{?\s*([#^/]?)([A-Za-z0-9_.-]+)\s*\}?\}\}/g)) {
    if (match[1] === "/") continue;
    variables.add(`${match[1] || ""}${match[2]}`);
  }
  return [...variables].sort();
}

function lookup(context, key) {
  if (key === ".") return context["."];
  const parts = key.split(".");
  let value = context;
  for (const part of parts) {
    if (!isRecord(value) && !Array.isArray(value)) return undefined;
    value = value[part];
  }
  return value;
}

function mergeContext(parent, value) {
  if (isRecord(value)) return { ...parent, ...value };
  return { ...parent, ".": value };
}

function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRawKey(key) {
  return (
    /(^|_)html$/i.test(key) ||
    /(^|_)json$/i.test(key) ||
    /_(bars|cards|items|sections|specs|list)$/i.test(key) ||
    /^[A-Z0-9_]+_(BARS|CARDS|ITEMS|SECTIONS|SPECS|LIST|JSON)$/.test(key)
  );
}
