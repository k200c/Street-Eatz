import { useCallback, useMemo, useState } from 'react';
import { useFoodOSModules } from './useFoodOSModules';
import {
  sortModules,
  isExpanded as isExpandedRule,
  initialExpandedKeys,
  withOverride,
  type ExpandedOverrides,
  type ModuleLayoutRow,
} from '@/lib/moduleLayout';

const STORAGE_KEY = 'foodos-module-expanded';

function readOverrides(): ExpandedOverrides {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ExpandedOverrides) : {};
  } catch {
    return {};
  }
}

function writeOverrides(value: ExpandedOverrides) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage — the session override simply does not persist.
  }
}

/**
 * Modules for a domain, sorted by display_order, with open/closed state that
 * starts from default_expanded and remembers manual toggles for the session.
 * Nothing here writes to foodos_module_settings.
 */
export function useModuleLayout(domain?: string) {
  const query = useFoodOSModules();
  const [overrides, setOverrides] = useState<ExpandedOverrides>(() =>
    typeof window === 'undefined' ? {} : readOverrides(),
  );

  const modules = useMemo(() => {
    const rows = (query.data ?? []) as unknown as ModuleLayoutRow[];
    const filtered = domain ? rows.filter((row) => row.domain === domain) : rows;
    return sortModules(filtered);
  }, [query.data, domain]);

  const enabledModules = useMemo(() => modules.filter((module) => module.enabled), [modules]);

  const expandedKeys = useMemo(() => initialExpandedKeys(enabledModules, overrides), [enabledModules, overrides]);

  const isExpanded = useCallback(
    (key: string) => {
      const module = modules.find((row) => row.module_key === key);
      return module ? isExpandedRule(module, overrides) : true;
    },
    [modules, overrides],
  );

  const setExpanded = useCallback((key: string, expanded: boolean) => {
    setOverrides((current) => {
      const next = withOverride(current, key, expanded);
      writeOverrides(next);
      return next;
    });
  }, []);

  /** For an Accordion type="multiple": the full list of open keys. */
  const setExpandedKeys = useCallback(
    (keys: string[]) => {
      setOverrides((current) => {
        let next = current;
        for (const module of enabledModules) {
          next = withOverride(next, module.module_key, keys.includes(module.module_key));
        }
        writeOverrides(next);
        return next;
      });
    },
    [enabledModules],
  );

  return {
    modules,
    enabledModules,
    expandedKeys,
    isExpanded,
    setExpanded,
    setExpandedKeys,
    isLoading: query.isLoading,
    error: query.error,
  };
}
