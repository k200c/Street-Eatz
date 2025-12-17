import { useState, useEffect, useCallback } from 'react';
import { useAppSettings } from './useAppSettings';

const DEV_MODE_KEY = 'dev_mode_bypass';

/**
 * Hook that provides store open/closed status with optional dev mode bypass.
 * When dev_mode_bypass is 'true' in localStorage, isStoreOpen always returns true.
 */
export function useStoreStatus() {
  const { data: appSettings, isLoading, error, refetch } = useAppSettings();
  const [devModeEnabled, setDevModeEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DEV_MODE_KEY) === 'true';
  });

  // Listen for localStorage changes (e.g., from other tabs or components)
  useEffect(() => {
    const handleStorageChange = () => {
      const value = localStorage.getItem(DEV_MODE_KEY) === 'true';
      setDevModeEnabled(value);
    };

    // Check on mount
    handleStorageChange();

    // Listen for custom event (for same-tab updates)
    window.addEventListener('devModeChanged', handleStorageChange);
    // Listen for storage event (for cross-tab updates)
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('devModeChanged', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Toggle dev mode and dispatch event
  const toggleDevMode = useCallback(() => {
    const newValue = !devModeEnabled;
    localStorage.setItem(DEV_MODE_KEY, newValue.toString());
    setDevModeEnabled(newValue);
    // Dispatch custom event for same-tab listeners
    window.dispatchEvent(new Event('devModeChanged'));
    return newValue;
  }, [devModeEnabled]);

  // Explicitly enable/disable dev mode
  const setDevMode = useCallback((enabled: boolean) => {
    localStorage.setItem(DEV_MODE_KEY, enabled.toString());
    setDevModeEnabled(enabled);
    window.dispatchEvent(new Event('devModeChanged'));
  }, []);

  // The effective store status - dev mode bypasses database value
  const dbStoreOpen = appSettings?.is_store_open ?? true;
  const isStoreOpen = devModeEnabled ? true : dbStoreOpen;

  return {
    // Core status
    isStoreOpen,
    isLoading,
    error,
    refetch,
    
    // Dev mode controls
    devModeEnabled,
    toggleDevMode,
    setDevMode,
    
    // Raw database value (for display purposes)
    dbStoreOpen,
    
    // App settings pass-through
    currentWaitTime: appSettings?.current_wait_time ?? '20 mins',
    appSettings,
  };
}
