import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestsDir = dirname(fileURLToPath(import.meta.url));

const cache = new Map();
let manifestList = null;

export function listSectionManifests() {
  if (manifestList) return manifestList;
  const files = readdirSync(manifestsDir).filter(
    (f) => f.endsWith(".json") && !f.startsWith(".")
  );
  manifestList = files
    .map((f) => loadSectionManifest(f.replace(/\.json$/, "")))
    .filter(Boolean);
  return manifestList;
}

export function loadSectionManifest(id) {
  if (!id || typeof id !== "string") return null;
  if (cache.has(id)) return cache.get(id);
  try {
    const raw = readFileSync(join(manifestsDir, `${id}.json`), "utf8");
    const parsed = JSON.parse(raw);
    cache.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function listSectionsByCategory(category) {
  if (!category) return listSectionManifests();
  return listSectionManifests().filter((m) => m.category === category);
}

export function listSectionsForIndustry(industry) {
  if (!industry) return listSectionManifests();
  const id = String(industry).toLowerCase();
  return listSectionManifests().filter((m) => {
    const suits = Array.isArray(m.industries) ? m.industries : [];
    const notFor = Array.isArray(m.notSuitableFor) ? m.notSuitableFor : [];
    if (notFor.includes(id)) return false;
    return suits.includes("all") || suits.includes(id);
  });
}

/**
 * Filter sections by page role. Valid roles:
 *   landing | about | contact | pricing | product | blog-index | blog-post |
 *   header | footer | 404
 *
 * Compose with industry filter for the tightest catalog:
 *   listSectionsForPageRole('blog-index').filter(s => suitsIndustry(s, 'saas'))
 */
export function listSectionsForPageRole(role) {
  if (!role) return listSectionManifests();
  const target = String(role).toLowerCase();
  return listSectionManifests().filter((m) => {
    const roles = Array.isArray(m.pageRoles) ? m.pageRoles : [];
    return roles.includes(target);
  });
}

/** Cross-filter: matches both a page role AND an industry. */
export function listSectionsForPageRoleAndIndustry(role, industry) {
  const byRole = listSectionsForPageRole(role);
  if (!industry) return byRole;
  const id = String(industry).toLowerCase();
  return byRole.filter((m) => {
    const suits = Array.isArray(m.industries) ? m.industries : [];
    const notFor = Array.isArray(m.notSuitableFor) ? m.notSuitableFor : [];
    if (notFor.includes(id)) return false;
    return suits.includes("all") || suits.includes(id);
  });
}

/** Token-tight summary for LLM context (props become name + hint, not full schema). */
export function manifestForLlm(idOrManifest) {
  const m = typeof idOrManifest === "string" ? loadSectionManifest(idOrManifest) : idOrManifest;
  if (!m) return null;
  const props = {};
  for (const [name, def] of Object.entries(m.props || {})) {
    props[name] = {
      type: def.type,
      required: def.required ?? false,
      hint: def.hint,
      ...(def.default !== undefined && { default: def.default }),
      ...(def.values && { values: def.values }),
    };
  }
  return {
    id: m.id,
    category: m.category,
    displayName: m.displayName,
    description: m.description,
    industries: m.industries,
    notSuitableFor: m.notSuitableFor,
    props,
  };
}

/** Compact catalog the LLM can scan to pick sections. */
export function catalogForLlm({ industry } = {}) {
  const list = industry ? listSectionsForIndustry(industry) : listSectionManifests();
  return list.map((m) => ({
    id: m.id,
    category: m.category,
    displayName: m.displayName,
    description: m.description,
    industries: m.industries,
  }));
}

export function previewFor(id) {
  const m = loadSectionManifest(id);
  return m?.preview ?? null;
}
