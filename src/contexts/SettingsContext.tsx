import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Settings, DEFAULT_SETTINGS } from '../types';

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  resetSettings: () => void;
  updateAppearance: (updates: Partial<Settings['appearance']>) => void;
  updateBehavior: (updates: Partial<Settings['behavior']>) => void;
  updatePerformance: (updates: Partial<Settings['performance']>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = 'unbox-settings';

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      return {
        appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
        behavior: { ...DEFAULT_SETTINGS.behavior, ...parsed.behavior },
        performance: { ...DEFAULT_SETTINGS.performance, ...parsed.performance },
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...parsed.shortcuts },
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Save settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(prev => ({
      ...prev,
      ...updates,
      appearance: { ...prev.appearance, ...(updates.appearance || {}) },
      behavior: { ...prev.behavior, ...(updates.behavior || {}) },
      performance: { ...prev.performance, ...(updates.performance || {}) },
      shortcuts: { ...prev.shortcuts, ...(updates.shortcuts || {}) },
    }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const updateAppearance = (updates: Partial<Settings['appearance']>) => {
    setSettings(prev => ({
      ...prev,
      appearance: { ...prev.appearance, ...updates },
    }));
  };

  const updateBehavior = (updates: Partial<Settings['behavior']>) => {
    setSettings(prev => ({
      ...prev,
      behavior: { ...prev.behavior, ...updates },
    }));
  };

  const updatePerformance = (updates: Partial<Settings['performance']>) => {
    setSettings(prev => ({
      ...prev,
      performance: { ...prev.performance, ...updates },
    }));
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        updateAppearance,
        updateBehavior,
        updatePerformance,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
