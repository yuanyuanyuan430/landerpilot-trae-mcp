export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateText(value, maxLength = 160) {
  const text = stripHtml(value);
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}...`;
}

export function toSentence(value, fallback) {
  const text = stripHtml(value || fallback || "");
  return /[.!?。！？]$/.test(text) ? text : `${text}.`;
}

export function safeJsonForInlineScript(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function htmlList(items, options = {}) {
  const tag = options.tag || "li";
  const className = options.className ? ` class="${escapeHtml(options.className)}"` : "";
  return ensureArray(items)
    .filter(Boolean)
    .map((item) => `<${tag}${className}>${escapeHtml(item)}</${tag}>`)
    .join("");
}

export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

export function uniqueValues(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value ?? "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function initials(value) {
  const parts = String(value ?? "")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "LP").slice(0, 2);
  return letters.toUpperCase();
}

export function placeholderLogoDataUri(label, options = {}) {
  const bg = options.background || "#f0ece4";
  const fg = options.foreground || "#1c1a17";
  const mark = escapeSvgText(initials(label));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">`,
    `<rect width="160" height="160" rx="32" fill="${bg}"/>`,
    `<text x="80" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="${fg}">${mark}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function placeholderVisualDataUri(label, options = {}) {
  const bg = options.background || "#f1ede4";
  const fg = options.foreground || "#1c1a17";
  const mark = escapeSvgText(label || "Preview");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">`,
    `<rect width="960" height="600" rx="32" fill="${bg}"/>`,
    `<rect x="84" y="78" width="792" height="444" rx="28" fill="#fff" opacity=".9"/>`,
    `<rect x="132" y="132" width="360" height="28" rx="14" fill="${fg}" opacity=".85"/>`,
    `<rect x="132" y="188" width="620" height="18" rx="9" fill="${fg}" opacity=".22"/>`,
    `<rect x="132" y="228" width="520" height="18" rx="9" fill="${fg}" opacity=".18"/>`,
    `<rect x="132" y="306" width="180" height="96" rx="18" fill="${fg}" opacity=".12"/>`,
    `<rect x="348" y="306" width="180" height="96" rx="18" fill="${fg}" opacity=".18"/>`,
    `<rect x="564" y="306" width="180" height="96" rx="18" fill="${fg}" opacity=".12"/>`,
    `<text x="480" y="482" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="${fg}">${mark}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
