import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Settings as SettingsIcon,
  X,
  Shield,
  Clock,
  Moon,
  Sun,
  Monitor,
  Check,
  HelpCircle,
  AlertCircle,
  Type,
  Zap,
} from "lucide-react";
import { TerminalButton } from "./TerminalButton";
import { useSettings } from "./SettingsContext";
import { useToast } from "./Toast";

interface SettingsProps {
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { settings, updateSetting, resetSettings, storageError, clearStorageError } = useSettings();
  const { showToast } = useToast();

  const [showHelp, setShowHelp] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    // Focus close button on mount
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Tab trap
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Show storage error toast when error exists
  useEffect(() => {
    if (storageError) {
      showToast("warning", storageError, 8000);
      clearStorageError();
    }
  }, [storageError, showToast, clearStorageError]);

  const handleConfirmModeChange = (value: "single" | "double") => {
    updateSetting("confirmMode", value);
  };

  const handleDefaultTTLChange = (value: number) => {
    updateSetting("defaultTTL", value);
  };

  const handleThemeChange = (value: "terminal" | "high-contrast" | "dark") => {
    updateSetting("theme", value);
    document.documentElement.setAttribute("data-theme", value);
  };

  const handleShowPreviewChange = (value: boolean) => {
    updateSetting("showPreview", value);
  };

  const handleAutoCopyChange = (value: boolean) => {
    updateSetting("autoCopyLink", value);
  };

  const handleTextSizeChange = (value: "small" | "medium" | "large") => {
    updateSetting("textSize", value);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-term-panel border-2 border-term-green w-full max-w-lg max-h-[90vh] overflow-y-auto glow-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b-2 border-term-green p-4 flex items-center justify-between sticky top-0 bg-term-panel z-10">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-term-green" aria-hidden="true" />
            <h2 id="settings-title" className="text-xl font-bold text-term-green glow-text">
              SYSTEM SETTINGS
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="text-term-green hover:text-term-green-dim transition-colors p-1 focus:outline-none focus:ring-2 focus:ring-term-green"
            aria-label="Close settings (Press Escape)"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Confirmation Mode */}
          <section aria-labelledby="confirm-mode-label">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-term-green" aria-hidden="true" />
              <h3
                id="confirm-mode-label"
                className="text-sm font-bold text-term-green uppercase tracking-wider"
              >
                Confirmation Mode
              </h3>
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="text-term-green/60 hover:text-term-green transition-colors ml-auto"
                aria-label="Toggle help for confirmation mode"
              >
                <HelpCircle className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {showHelp && (
              <div className="mb-3 p-3 border border-term-green/30 bg-term-green/5 text-xs text-term-green/80 animate-fade-in">
                <p className="mb-2">
                  <strong>Single Click:</strong> Reveal secret immediately after clicking the
                  button.
                </p>
                <p>
                  <strong>Double Click:</strong> Requires two confirmation steps before revealing
                  (more secure).
                </p>
              </div>
            )}

            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-labelledby="confirm-mode-label"
            >
              <button
                onClick={() => handleConfirmModeChange("single")}
                className={`p-3 border-2 transition-all text-left font-mono text-sm ${
                  settings.confirmMode === "single"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.confirmMode === "single"}
              >
                <div className="flex items-center gap-2">
                  {settings.confirmMode === "single" && (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>SINGLE CLICK</span>
                </div>
                <p className="text-xs opacity-70 mt-1">Quick reveal</p>
              </button>
              <button
                onClick={() => handleConfirmModeChange("double")}
                className={`p-3 border-2 transition-all text-left font-mono text-sm ${
                  settings.confirmMode === "double"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.confirmMode === "double"}
              >
                <div className="flex items-center gap-2">
                  {settings.confirmMode === "double" && (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>DOUBLE CLICK</span>
                </div>
                <p className="text-xs opacity-70 mt-1">More secure</p>
              </button>
            </div>
          </section>

          {/* Default TTL */}
          <section aria-labelledby="default-ttl-label">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-term-green" aria-hidden="true" />
              <h3
                id="default-ttl-label"
                className="text-sm font-bold text-term-green uppercase tracking-wider"
              >
                Default Expiration
              </h3>
            </div>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              role="radiogroup"
              aria-labelledby="default-ttl-label"
            >
              {[
                { label: "5 MIN", value: 5 * 60 * 1000 },
                { label: "1 HOUR", value: 60 * 60 * 1000 },
                { label: "24 HOURS", value: 24 * 60 * 60 * 1000 },
                { label: "7 DAYS", value: 7 * 24 * 60 * 60 * 1000 },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => handleDefaultTTLChange(option.value)}
                  className={`p-2 border-2 transition-all font-mono text-xs ${
                    settings.defaultTTL === option.value
                      ? "border-term-green bg-term-green/20 text-term-green"
                      : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                  }`}
                  role="radio"
                  aria-checked={settings.defaultTTL === option.value}
                >
                  {settings.defaultTTL === option.value && (
                    <Check className="w-3 h-3 inline mr-1" aria-hidden="true" />
                  )}
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {/* Theme */}
          <section aria-labelledby="theme-label">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-5 h-5 text-term-green" aria-hidden="true" />
              <h3
                id="theme-label"
                className="text-sm font-bold text-term-green uppercase tracking-wider"
              >
                Display Theme
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="theme-label">
              <button
                onClick={() => handleThemeChange("terminal")}
                className={`p-3 border-2 transition-all text-center font-mono text-xs ${
                  settings.theme === "terminal"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.theme === "terminal"}
              >
                <Monitor className="w-5 h-5 mx-auto mb-1" aria-hidden="true" />
                <div>TERMINAL</div>
              </button>
              <button
                onClick={() => handleThemeChange("high-contrast")}
                className={`p-3 border-2 transition-all text-center font-mono text-xs ${
                  settings.theme === "high-contrast"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.theme === "high-contrast"}
              >
                <Sun className="w-5 h-5 mx-auto mb-1" aria-hidden="true" />
                <div>HIGH CONTRAST</div>
              </button>
              <button
                onClick={() => handleThemeChange("dark")}
                className={`p-3 border-2 transition-all text-center font-mono text-xs ${
                  settings.theme === "dark"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.theme === "dark"}
              >
                <Moon className="w-5 h-5 mx-auto mb-1" aria-hidden="true" />
                <div>DARK</div>
              </button>
            </div>
          </section>

          {/* Text Size */}
          <section aria-labelledby="text-size-label">
            <div className="flex items-center gap-2 mb-3">
              <Type className="w-5 h-5 text-term-green" aria-hidden="true" />
              <h3
                id="text-size-label"
                className="text-sm font-bold text-term-green uppercase tracking-wider"
              >
                Text Size
              </h3>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-labelledby="text-size-label"
            >
              <button
                onClick={() => handleTextSizeChange("small")}
                className={`p-3 border-2 transition-all text-center font-mono text-xs ${
                  settings.textSize === "small"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.textSize === "small"}
              >
                <div className="text-xs">SMALL</div>
              </button>
              <button
                onClick={() => handleTextSizeChange("medium")}
                className={`p-3 border-2 transition-all text-center font-mono text-sm ${
                  settings.textSize === "medium"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.textSize === "medium"}
              >
                <div>MEDIUM</div>
              </button>
              <button
                onClick={() => handleTextSizeChange("large")}
                className={`p-3 border-2 transition-all text-center font-mono text-base ${
                  settings.textSize === "large"
                    ? "border-term-green bg-term-green/20 text-term-green"
                    : "border-term-green/30 text-term-green/60 hover:border-term-green/60"
                }`}
                role="radio"
                aria-checked={settings.textSize === "large"}
              >
                <div className="text-base">LARGE</div>
              </button>
            </div>
          </section>

          {/* Toggle Options */}
          <section aria-labelledby="options-label" className="space-y-3">
            <h3
              id="options-label"
              className="text-sm font-bold text-term-green uppercase tracking-wider"
            >
              Additional Options
            </h3>

            {/* Show Preview Toggle */}
            <div className="flex items-center justify-between p-3 border border-term-green/30">
              <span id="preview-toggle-label" className="text-sm font-mono">
                Show preview before encrypt
              </span>
              <button
                onClick={() => handleShowPreviewChange(!settings.showPreview)}
                role="switch"
                aria-checked={settings.showPreview}
                aria-labelledby="preview-toggle-label"
                className={`w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black ${
                  settings.showPreview ? "bg-term-green" : "bg-term-green/20"
                }`}
              >
                <span
                  className={`block w-5 h-5 bg-black rounded-full transition-transform duration-200 ${
                    settings.showPreview ? "translate-x-6" : "translate-x-0.5"
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* Auto Copy Link Toggle */}
            <div className="flex items-center justify-between p-3 border border-term-green/30">
              <span id="autocopy-toggle-label" className="text-sm font-mono">
                Auto-copy generated link
              </span>
              <button
                onClick={() => handleAutoCopyChange(!settings.autoCopyLink)}
                role="switch"
                aria-checked={settings.autoCopyLink}
                aria-labelledby="autocopy-toggle-label"
                className={`w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-term-green focus:ring-offset-2 focus:ring-offset-black ${
                  settings.autoCopyLink ? "bg-term-green" : "bg-term-green/20"
                }`}
              >
                <span
                  className={`block w-5 h-5 bg-black rounded-full transition-transform duration-200 ${
                    settings.autoCopyLink ? "translate-x-6" : "translate-x-0.5"
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>

          {/* Reset Button */}
          <div className="pt-4 border-t border-term-green/30">
            <TerminalButton variant="secondary" onClick={resetSettings} className="w-full text-xs">
              RESET TO DEFAULTS
            </TerminalButton>
          </div>
        </div>
      </div>
    </div>
  );
};
