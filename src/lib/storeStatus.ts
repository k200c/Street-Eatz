export interface StoreStatusSettings {
  is_store_open: boolean;
  current_wait_time: string | null;
}

export interface DerivedStoreStatus {
  dbStoreOpen: boolean;
  devModeEnabled: boolean;
  isStatusAvailable: boolean;
  isStoreOpen: boolean;
  currentWaitTime: string | null;
}

export function deriveStoreStatus(
  settings: StoreStatusSettings | null | undefined,
  devModeRequested: boolean,
  allowDevMode: boolean,
): DerivedStoreStatus {
  const isStatusAvailable = Boolean(settings);
  const dbStoreOpen = settings?.is_store_open ?? false;
  const devModeEnabled = allowDevMode && devModeRequested;
  const currentWaitTime = isStatusAvailable && settings?.current_wait_time?.trim()
    ? settings.current_wait_time.trim()
    : null;

  return {
    dbStoreOpen,
    devModeEnabled,
    isStatusAvailable,
    isStoreOpen: devModeEnabled ? true : dbStoreOpen,
    currentWaitTime,
  };
}
