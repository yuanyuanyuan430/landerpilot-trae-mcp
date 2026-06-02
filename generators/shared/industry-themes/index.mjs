import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const themesDir = dirname(fileURLToPath(import.meta.url));

const cache = new Map();

export function listIndustryThemes() {
  const files = readdirSync(themesDir).filter(
    (f) => f.endsWith(".json") && f !== "package.json"
  );
  return files.map((f) => loadIndustryTheme(f.replace(/\.json$/, "")));
}

export function loadIndustryTheme(id) {
  if (!id || typeof id !== "string") return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const raw = readFileSync(join(themesDir, `${id}.json`), "utf8");
    const parsed = JSON.parse(raw);
    cache.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function resolveIndustryTheme(value) {
  if (!value) return loadIndustryTheme("saas");
  if (typeof value === "string") {
    return loadIndustryTheme(value) || loadIndustryTheme("saas");
  }
  if (typeof value === "object" && value.id) {
    return loadIndustryTheme(value.id) || loadIndustryTheme("saas");
  }
  return loadIndustryTheme("saas");
}

const NON_COLOR_TOKENS = new Set([
  "radius-box",
  "radius-field",
  "radius-selector",
  "depth",
  "noise",
  "border",
  "size-field",
  "size-selector",
]);

export function renderDaisyuiThemeBlock(theme, { isDefault = true } = {}) {
  if (!theme || !theme.daisyui) return "";
  const lines = [
    `@plugin "daisyui/theme" {`,
    `  name: "ganhuo-${theme.id}";`,
    `  default: ${isDefault ? "true" : "false"};`,
    `  prefersdark: false;`,
    `  color-scheme: light;`,
  ];
  for (const [key, value] of Object.entries(theme.daisyui)) {
    if (value === undefined || value === null || value === "") continue;
    const prefix = NON_COLOR_TOKENS.has(key) ? "--" : "--color-";
    lines.push(`  ${prefix}${key}: ${value};`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function renderAllIndustryThemes(defaultId = "saas") {
  const themes = listIndustryThemes();
  return themes
    .map((t) => renderDaisyuiThemeBlock(t, { isDefault: t.id === defaultId }))
    .filter(Boolean)
    .join("\n\n");
}
