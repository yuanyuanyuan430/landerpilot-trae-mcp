import {
  renderDaisyuiThemeBlock,
  resolveIndustryTheme,
} from "./industry-themes/index.mjs";

const THEME_PRESETS = {
  default: {},
  ocean: {
    accent: "#2563eb",
    accentEnd: "#0ea5e9",
    heading: "#0f172a",
    body: "#475569",
    surface: "#f8fafc",
  },
  emerald: {
    accent: "#059669",
    accentEnd: "#10b981",
    heading: "#0f172a",
    body: "#475569",
    surface: "#f7fdf9",
  },
  slate: {
    accent: "#334155",
    accentEnd: "#0f172a",
    heading: "#111827",
    body: "#4b5563",
    surface: "#f9fafb",
  },
};

export function normalizeTheme(value) {
  if (!value) return { name: "default", tokens: {} };
  if (typeof value === "string") {
    const preset = THEME_PRESETS[value] || {};
    return { name: value, tokens: preset };
  }
  const name = typeof value.name === "string" ? value.name : "custom";
  const preset = THEME_PRESETS[name] || {};
  return {
    name,
    tokens: {
      ...preset,
      ...pickThemeTokens(value.tokens || value),
    },
  };
}

export function injectThemeCss(html, theme) {
  const normalized = normalizeTheme(theme);
  const tokens = normalized.tokens || {};
  if (Object.keys(tokens).length === 0) return html;

  const lines = [
    ":root{",
    cssVar("--ganhuo-accent", tokens.accent),
    cssVar("--ganhuo-accent-end", tokens.accentEnd || tokens.accent),
    cssVar("--ganhuo-heading", tokens.heading),
    cssVar("--ganhuo-body", tokens.body),
    cssVar("--ganhuo-surface", tokens.surface),
    cssVar("--ganhuo-surface-alt", tokens.surfaceAlt),
    cssVar("--ganhuo-text", tokens.text),
    cssVar("--ganhuo-text-muted", tokens.textMuted),
    cssVar("--ganhuo-radius", tokens.radius),
    cssVar("--primary", tokens.accent),
    cssVar("--primary-end", tokens.accentEnd || tokens.accent),
    tokens.accent ? cssVar("--gradient", `linear-gradient(135deg,${tokens.accent},${tokens.accentEnd || tokens.accent})`) : "",
    cssVar("--accent", tokens.accent),
    cssVar("--heading", tokens.heading || tokens.text),
    cssVar("--body", tokens.body || tokens.textMuted),
    cssVar("--bg-light", tokens.surfaceAlt || tokens.surface),
    cssVar("--radius", tokens.radius),
    "}",
    ".btn-gradient,.nav-cta{background:linear-gradient(135deg,var(--ganhuo-accent),var(--ganhuo-accent-end))!important}",
    ".nav-logo,.section-header a,.featured-card-rate,.store-card-name a,.store-card-rate,.category-card-name,.review-badge{color:var(--ganhuo-accent)!important}",
    ".btn-get-deal,.btn-deal,.store-cashback,.coupon-badge,.nav .nav-cta{background-color:var(--ganhuo-accent)!important}",
  ].filter(Boolean);
  const css = `<style data-ganhuo-theme="${escapeAttr(normalized.name)}">${lines.join("")}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${css}\n</head>`) : `${css}\n${html}`;
}

export function renderTailwindGlobalCss(theme, options = {}) {
  const normalized = normalizeTheme(theme);
  // V2 path: industry-driven DaisyUI theme. Producers that build out of the
  // component-based section library pass theme.industry to opt in.
  const industry = (theme && theme.industry) || normalized.industry;
  if (industry) {
    return renderIndustryGlobalCss(industry, normalized, options);
  }
  // V1 path: legacy custom-tokens. Preserved as-is for affiliate-review /
  // cashback blueprints and the existing test suite that asserts shadcn-style
  // --primary tokens flow through.
  const tokens = themeTokensWithDefaults(normalized.tokens || {});
  const componentCss = ensureCssList(options.componentCss);
  const layers = [
    `@import "tailwindcss";`,
    "",
    fontFaceBlock(),
    "",
    tailwindThemeBlock(),
    "",
    rootThemeBlock(tokens),
    "",
    baseLayer(),
  ];
  if (componentCss.length > 0) {
    layers.push("", componentLayer(componentCss));
  }
  return `${layers.join("\n").trim()}\n`;
}

function renderIndustryGlobalCss(industryId, normalized, options) {
  const industryTheme = resolveIndustryTheme(industryId);
  const componentCss = ensureCssList(options?.componentCss);
  const customTokenOverride = renderCustomTokenOverride(normalized?.tokens);
  const layers = [
    `@import "tailwindcss";`,
    "",
    `@plugin "daisyui" {\n  themes: false;\n}`,
    "",
    renderDaisyuiThemeBlock(industryTheme, { isDefault: true }),
    "",
    fontFaceBlock(),
    "",
    daisyuiTailwindThemeBlock(),
    "",
    daisyuiRootAliases(),
  ];
  if (customTokenOverride) {
    layers.push("", customTokenOverride);
  }
  layers.push("", baseLayer());
  if (componentCss.length > 0) {
    layers.push("", componentLayer(componentCss));
  }
  return `${layers.join("\n").trim()}\n`;
}

function daisyuiTailwindThemeBlock() {
  return [
    "@theme inline {",
    "  --color-lp-accent: var(--color-primary);",
    "  --color-lp-accent-end: var(--color-secondary);",
    "  --color-lp-surface: var(--color-base-100);",
    "  --color-lp-surface-alt: var(--color-base-200);",
    "  --color-lp-text: var(--color-base-content);",
    "  --color-lp-muted: var(--ganhuo-text-muted);",
    "  --radius-lp: var(--radius-box);",
    '  --font-sans: "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;',
    '  --font-display: "Fraunces", ui-serif, Georgia, "Songti SC", "Times New Roman", serif;',
    "}",
  ].join("\n");
}

function daisyuiRootAliases() {
  return [
    ":root {",
    "  --ganhuo-accent: var(--color-primary);",
    "  --ganhuo-accent-end: var(--color-secondary);",
    "  --ganhuo-surface: var(--color-base-100);",
    "  --ganhuo-surface-alt: var(--color-base-200);",
    "  --ganhuo-text: var(--color-base-content);",
    "  --ganhuo-text-muted: color-mix(in srgb, var(--color-base-content) 58%, transparent);",
    "  --ganhuo-radius: var(--radius-box);",
    "  --border: color-mix(in srgb, var(--color-base-content) 12%, transparent);",
    "  --gradient: linear-gradient(135deg, var(--color-primary), var(--color-secondary));",
    "}",
  ].join("\n");
}

function renderCustomTokenOverride(tokens) {
  if (!tokens || Object.keys(tokens).length === 0) return "";
  const lines = [":root {"];
  const push = (name, value) => {
    if (value) lines.push(`  ${name}: ${value};`);
  };
  const primary = tokens.primary || tokens.accent;
  const secondary = tokens.secondary || tokens.accentEnd;
  const bg = tokens.background || tokens.surface;
  const fg = tokens.foreground || tokens.text || tokens.heading;
  const bgAlt = tokens.surfaceAlt || tokens.muted;
  if (primary) {
    push("--color-primary", primary);
    push("--primary", primary);
    push("--accent", primary);
  }
  if (secondary) {
    push("--color-secondary", secondary);
    push("--primary-end", secondary);
  }
  if (bg) {
    push("--color-base-100", bg);
    push("--background", bg);
  }
  if (fg) {
    push("--color-base-content", fg);
    push("--foreground", fg);
  }
  if (bgAlt) {
    push("--color-base-200", bgAlt);
    push("--bg-light", bgAlt);
  }
  if (tokens.textMuted || tokens.body) {
    push("--body", tokens.textMuted || tokens.body);
  }
  if (tokens.radius) {
    push("--radius-box", tokens.radius);
    push("--radius", tokens.radius);
  }
  if (lines.length === 1) return "";
  lines.push("}");
  return lines.join("\n");
}

function pickThemeTokens(value) {
  const out = {};
  for (const [key, raw] of Object.entries(value || {})) {
    const normalizedKey = normalizeThemeKey(key);
    if (
      [
        "accent",
        "accentEnd",
        "background",
        "foreground",
        "card",
        "cardForeground",
        "primary",
        "primaryForeground",
        "secondary",
        "muted",
        "mutedForeground",
        "border",
        "ring",
        "heading",
        "body",
        "surface",
        "surfaceAlt",
        "text",
        "textMuted",
      ].includes(normalizedKey)
    ) {
      const color = normalizeCssColor(raw);
      if (color) out[normalizedKey] = color;
      continue;
    }
    if (normalizedKey === "radius") {
      const radius = String(raw ?? "").trim();
      if (isSafeCssLength(radius)) out[normalizedKey] = radius;
    }
  }
  return out;
}

function normalizeThemeKey(key) {
  const normalized = String(key || "").trim();
  const aliases = {
    "--accent": "accent",
    "--background": "background",
    "--foreground": "foreground",
    "--card": "card",
    "--card-foreground": "cardForeground",
    "--primary": "primary",
    "--primary-foreground": "primaryForeground",
    "--secondary": "secondary",
    "--muted": "muted",
    "--muted-foreground": "mutedForeground",
    "--border": "border",
    "--ring": "ring",
    "--radius": "radius",
    card_foreground: "cardForeground",
    cardForeground: "cardForeground",
    primary_foreground: "primaryForeground",
    primaryForeground: "primaryForeground",
    muted_foreground: "mutedForeground",
    mutedForeground: "mutedForeground",
    accent_end: "accentEnd",
    accentEnd: "accentEnd",
    surface_alt: "surfaceAlt",
    surfaceAlt: "surfaceAlt",
    text_muted: "textMuted",
    textMuted: "textMuted",
  };
  return aliases[normalized] || normalized.replace(/^--/, "");
}

function cssVar(name, value) {
  return value ? `${name}:${value};` : "";
}

function themeTokensWithDefaults(tokens) {
  // Defaults lean warm + editorial instead of the stock cold-slate / indigo
  // palette. Every token here is overridable from the user's theme.tokens.
  const accent = tokens.accent || tokens.primary || "#1f6f63";
  const accentEnd = tokens.accentEnd || tokens.accent || tokens.primary || "#2f9183";
  const surface = tokens.surface || tokens.background || "#ffffff";
  const surfaceAlt = tokens.surfaceAlt || tokens.secondary || tokens.muted || "#f6f4ef";
  const text = tokens.text || tokens.foreground || tokens.heading || "#1c1a17";
  const textMuted = tokens.textMuted || tokens.mutedForeground || tokens.body || "#6b655c";
  return {
    ...tokens,
    accent,
    accentEnd,
    surface,
    surfaceAlt,
    text,
    textMuted,
    heading: tokens.heading || text,
    body: tokens.body || textMuted,
    radius: tokens.radius || "12px",
    background: tokens.background || surface,
    foreground: tokens.foreground || text,
    card: tokens.card || surface,
    cardForeground: tokens.cardForeground || text,
    primary: tokens.primary || accent,
    primaryForeground: tokens.primaryForeground || "#ffffff",
    secondary: tokens.secondary || surfaceAlt,
    muted: tokens.muted || surfaceAlt,
    mutedForeground: tokens.mutedForeground || textMuted,
    border: tokens.border || "#e6e1d8",
    ring: tokens.ring || accent,
  };
}

/**
 * Self-hosted variable fonts bundled with the scaffold under public/fonts/.
 * Fraunces (display serif, optical character) + Hanken Grotesk (body sans)
 * give generated sites real typographic identity without a webfont CDN —
 * which also keeps them fast and reachable from mainland China.
 */
function fontFaceBlock() {
  return [
    "@font-face {",
    '  font-family: "Fraunces";',
    "  font-style: normal;",
    "  font-weight: 100 900;",
    "  font-display: swap;",
    '  src: url("/fonts/fraunces-variable.woff2") format("woff2");',
    "}",
    "@font-face {",
    '  font-family: "Fraunces";',
    "  font-style: italic;",
    "  font-weight: 100 900;",
    "  font-display: swap;",
    '  src: url("/fonts/fraunces-variable-italic.woff2") format("woff2");',
    "}",
    "@font-face {",
    '  font-family: "Hanken Grotesk";',
    "  font-style: normal;",
    "  font-weight: 100 900;",
    "  font-display: swap;",
    '  src: url("/fonts/hanken-grotesk-variable.woff2") format("woff2");',
    "}",
  ].join("\n");
}

function tailwindThemeBlock() {
  return [
    "@theme inline {",
    "  --color-lp-accent: var(--ganhuo-accent);",
    "  --color-lp-accent-end: var(--ganhuo-accent-end);",
    "  --color-lp-surface: var(--ganhuo-surface);",
    "  --color-lp-surface-alt: var(--ganhuo-surface-alt);",
    "  --color-lp-text: var(--ganhuo-text);",
    "  --color-lp-muted: var(--ganhuo-text-muted);",
    "  --color-background: var(--background);",
    "  --color-foreground: var(--foreground);",
    "  --color-card: var(--card);",
    "  --color-card-foreground: var(--card-foreground);",
    "  --color-primary: var(--primary);",
    "  --color-primary-foreground: var(--primary-foreground);",
    "  --color-secondary: var(--secondary);",
    "  --color-muted: var(--muted);",
    "  --color-muted-foreground: var(--muted-foreground);",
    "  --color-border: var(--border);",
    "  --color-ring: var(--ring);",
    "  --radius-lp: var(--ganhuo-radius);",
    "  --radius-lg: var(--radius);",
    '  --font-sans: "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;',
    '  --font-display: "Fraunces", ui-serif, Georgia, "Songti SC", "Times New Roman", serif;',
    "}",
  ].join("\n");
}

function rootThemeBlock(tokens) {
  return [
    ":root {",
    cssLine("--ganhuo-accent", tokens.accent),
    cssLine("--ganhuo-accent-end", tokens.accentEnd),
    cssLine("--ganhuo-heading", tokens.heading),
    cssLine("--ganhuo-body", tokens.body),
    cssLine("--ganhuo-surface", tokens.surface),
    cssLine("--ganhuo-surface-alt", tokens.surfaceAlt),
    cssLine("--ganhuo-text", tokens.text),
    cssLine("--ganhuo-text-muted", tokens.textMuted),
    cssLine("--ganhuo-radius", tokens.radius),
    cssLine("--background", tokens.background),
    cssLine("--foreground", tokens.foreground),
    cssLine("--card", tokens.card),
    cssLine("--card-foreground", tokens.cardForeground),
    cssLine("--primary", tokens.primary),
    cssLine("--primary-foreground", tokens.primaryForeground),
    cssLine("--secondary", tokens.secondary),
    cssLine("--muted", tokens.muted),
    cssLine("--muted-foreground", tokens.mutedForeground),
    cssLine("--border", tokens.border),
    cssLine("--ring", tokens.ring),
    cssLine("--primary-end", tokens.accentEnd),
    cssLine("--accent", tokens.accent),
    cssLine("--heading", tokens.heading),
    cssLine("--body", tokens.body),
    cssLine("--bg-light", tokens.surfaceAlt),
    cssLine("--radius", tokens.radius),
    cssLine("--gradient", `linear-gradient(135deg, ${tokens.accent}, ${tokens.accentEnd})`),
    "}",
  ].join("\n");
}

function baseLayer() {
  return [
    "@layer base {",
    "  html {",
    "    scroll-behavior: smooth;",
    "    -webkit-text-size-adjust: 100%;",
    "  }",
    "",
    "  body {",
    "    font-family: var(--font-sans);",
    "    color: var(--ganhuo-text);",
    "    background-color: var(--ganhuo-surface);",
    "    text-rendering: optimizeLegibility;",
    "    -webkit-font-smoothing: antialiased;",
    "  }",
    "",
    "  :where(h1, h2, h3, h4) {",
    "    font-family: var(--font-display);",
    "  }",
    "",
    "  ::selection {",
    "    background: color-mix(in srgb, var(--ganhuo-accent) 24%, transparent);",
    "    color: var(--ganhuo-text);",
    "  }",
    "}",
    "",
    "@keyframes lp-rise {",
    "  from { opacity: 0; transform: translateY(1.5rem); }",
    "  to { opacity: 1; transform: translateY(0); }",
    "}",
    "",
    "@media (prefers-reduced-motion: reduce) {",
    "  *, *::before, *::after {",
    "    animation-duration: 0.01ms !important;",
    "    animation-iteration-count: 1 !important;",
    "    transition-duration: 0.01ms !important;",
    "    scroll-behavior: auto !important;",
    "  }",
    "}",
  ].join("\n");
}

function componentLayer(componentCss) {
  return ["@layer components {", ...componentCss.map(indentCss), "}"].join("\n\n");
}

function ensureCssList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => String(item || "").trim()).filter(Boolean);
}

function indentCss(css) {
  return css
    .split("\n")
    .map((line) => (line.trim() ? `  ${line}` : ""))
    .join("\n");
}

function cssLine(name, value) {
  return value ? `  ${name}: ${value};` : "";
}

function normalizeCssColor(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (isSafeCssColor(value)) return value;
  if (/^\d+(?:\.\d+)?(?:deg|turn|rad)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%(?:\s*\/\s*(?:\d+(?:\.\d+)?%?|0?\.\d+))?$/.test(value)) {
    return `hsl(${value})`;
  }
  return "";
}

function isSafeCssColor(value) {
  return (
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^rgb(a)?\([0-9,.\s%]+\)$/i.test(value) ||
    /^hsl(a)?\([0-9,.\s%degturnrad/-]+\)$/i.test(value) ||
    /^oklch\([0-9,.\s%degturnrad/-]+\)$/i.test(value) ||
    /^[a-z]+$/i.test(value)
  );
}

function isSafeCssLength(value) {
  return /^0$/.test(value) || /^\d+(?:\.\d+)?(?:px|rem|em)$/.test(value);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/"/g, "&quot;");
}
