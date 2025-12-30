import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

export type ConfirmMode = "single" | "double";
export type Theme = "terminal" | "high-contrast" | "dark";

export interface Settings {
  confirmMode: ConfirmMode;
  defaultTTL: number;
  theme: Theme;
  showPreview: boolean;
  autoCopyLink: boolean;
  textSize?: "small" | "medium" | "large";
}

interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  storageError: string | null;
  clearStorageError: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  confirmMode: "double",
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
  theme: "terminal",
  showPreview: false,
  autoCopyLink: true,
  textSize: "medium",
};

const STORAGE_KEY = "volatile-settings";

// Valid values for each setting
const VALID_CONFIRM_MODES: ConfirmMode[] = ["single", "double"];
const VALID_THEMES: Theme[] = ["terminal", "high-contrast", "dark"];
const VALID_TEXT_SIZES = ["small", "medium", "large"] as const;
const TTL_MIN = 5 * 60 * 1000; // 5 minutes
const TTL_MAX = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Validates and sanitizes settings loaded from localStorage
 * Returns sanitized settings with invalid values replaced by defaults
 */
function validateSettings(parsed: unknown): Settings {
  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_SETTINGS;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate confirmMode
  const confirmMode = VALID_CONFIRM_MODES.includes(obj.confirmMode as ConfirmMode)
    ? (obj.confirmMode as ConfirmMode)
    : DEFAULT_SETTINGS.confirmMode;

  // Validate defaultTTL - must be number within valid range
  let defaultTTL = DEFAULT_SETTINGS.defaultTTL;
  if (typeof obj.defaultTTL === "number" && !isNaN(obj.defaultTTL)) {
    defaultTTL = Math.max(TTL_MIN, Math.min(TTL_MAX, obj.defaultTTL));
  }

  // Validate theme
  const theme = VALID_THEMES.includes(obj.theme as Theme)
    ? (obj.theme as Theme)
    : DEFAULT_SETTINGS.theme;

  // Validate showPreview - must be boolean
  const showPreview =
    typeof obj.showPreview === "boolean" ? obj.showPreview : DEFAULT_SETTINGS.showPreview;

  // Validate autoCopyLink - must be boolean
  const autoCopyLink =
    typeof obj.autoCopyLink === "boolean" ? obj.autoCopyLink : DEFAULT_SETTINGS.autoCopyLink;

  // Validate textSize
  const textSize = VALID_TEXT_SIZES.includes(obj.textSize as (typeof VALID_TEXT_SIZES)[number])
    ? (obj.textSize as Settings["textSize"])
    : DEFAULT_SETTINGS.textSize;

  return {
    confirmMode,
    defaultTTL,
    theme,
    showPreview,
    autoCopyLink,
    textSize,
  };
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return validateSettings(parsed);
      }
    } catch {
      // Ignore storage errors during initialization
      // Also handles JSON.parse errors for corrupted data
    }
    return DEFAULT_SETTINGS;
  });

  const [storageError, setStorageError] = useState<string | null>(null);

  // Apply theme on mount and when changed
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  // Apply text size on mount and when changed
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("text-small", "text-medium", "text-large");
    if (settings.textSize) {
      root.classList.add(`text-${settings.textSize}`);
    }
  }, [settings.textSize]);

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
        setStorageError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        // Check if it's a quota exceeded error
        if (errorMsg.includes("quota") || errorMsg.includes("storage")) {
          setStorageError("Storage full - settings will not persist across sessions");
        } else {
          setStorageError("Settings could not be saved - browser storage may be disabled");
        }
      }
      return newSettings;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
      setStorageError(null);
    } catch (err) {
      setStorageError("Settings could not be reset - browser storage may be disabled");
    }
  };

  return (
    <SettingsContext.Provider
      value={{ settings, updateSetting, resetSettings, storageError, clearStorageError }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
