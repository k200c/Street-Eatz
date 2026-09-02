/**
 * Ordering and initial open/closed state for FoodOS module sections.
 *
 * The database owns both: foodos_module_settings.display_order and
 * .default_expanded. The UI sorts by the first and opens by the second. A
 * person's manual expand/collapse is remembered for the session only — it must
 * never write back to the column, because the column is Kyle's product
 * decision, not a per-user preference.
 */

export interface ModuleLayoutRow {
  module_key: string;
  domain: string;
  enabled: boolean;
  display_order: number | null;
  default_expanded: boolean | null;
}

export function sortModules<T extends ModuleLayoutRow>(modules: T[]): T[] {
  return [...modules].sort((a, b) => {
    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.module_key.localeCompare(b.module_key);
  });
}

export type ExpandedOverrides = Record<string, boolean>;

/** Session override wins, then the column, then open (safe for unknown rows). */
export function isExpanded(module: ModuleLayoutRow, overrides: ExpandedOverrides): boolean {
  if (module.module_key in overrides) return overrides[module.module_key];
  return module.default_expanded ?? true;
}

export function initialExpandedKeys(modules: ModuleLayoutRow[], overrides: ExpandedOverrides): string[] {
  return modules.filter((module) => isExpanded(module, overrides)).map((module) => module.module_key);
}

export function withOverride(overrides: ExpandedOverrides, key: string, expanded: boolean): ExpandedOverrides {
  return { ...overrides, [key]: expanded };
}
