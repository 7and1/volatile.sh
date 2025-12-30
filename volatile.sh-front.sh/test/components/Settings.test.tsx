/**
 * Settings component tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../components/Settings";
import { SettingsProvider, useSettings } from "../../components/SettingsContext";
import { ToastProvider } from "../../components/Toast";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Wrapper for providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <ToastProvider>{children}</ToastProvider>
    </SettingsProvider>
  );
}

describe("Settings Component", () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  // ==========================================================================
  // Rendering Tests
  // ==========================================================================

  it("should render settings modal", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("SYSTEM SETTINGS")).toBeInTheDocument();
  });

  it("should render all setting sections", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText("Confirmation Mode")).toBeInTheDocument();
    expect(screen.getByText("Default Expiration")).toBeInTheDocument();
    expect(screen.getByText("Display Theme")).toBeInTheDocument();
    expect(screen.getByText("Text Size")).toBeInTheDocument();
    expect(screen.getByText("Additional Options")).toBeInTheDocument();
  });

  it("should have close button", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const closeButton = screen.getByLabelText(/close settings/i);
    expect(closeButton).toBeInTheDocument();
  });

  // ==========================================================================
  // Confirmation Mode Tests
  // ==========================================================================

  it("should display confirmation mode options", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText("SINGLE CLICK")).toBeInTheDocument();
    expect(screen.getByText("DOUBLE CLICK")).toBeInTheDocument();
  });

  it("should have double click selected by default", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const doubleClickButton = screen.getByRole("radio", { name: /double click/i });
    expect(doubleClickButton).toHaveAttribute("aria-checked", "true");
  });

  it("should change confirmation mode on click", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const singleClickButton = screen.getByRole("radio", { name: /single click/i });
    await user.click(singleClickButton);

    expect(singleClickButton).toHaveAttribute("aria-checked", "true");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it("should toggle help text for confirmation mode", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    // Help should not be visible initially
    expect(screen.queryByText(/reveal secret immediately/i)).not.toBeInTheDocument();

    // Click help button
    const helpButton = screen.getByLabelText(/toggle help for confirmation mode/i);
    await user.click(helpButton);

    // Help text should be visible
    expect(screen.getByText(/reveal secret immediately/i)).toBeInTheDocument();
    expect(screen.getByText(/requires two confirmation steps/i)).toBeInTheDocument();
  });

  // ==========================================================================
  // Default TTL Tests
  // ==========================================================================

  it("should display TTL options", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText("5 MIN")).toBeInTheDocument();
    expect(screen.getByText("1 HOUR")).toBeInTheDocument();
    expect(screen.getByText("24 HOURS")).toBeInTheDocument();
    expect(screen.getByText("7 DAYS")).toBeInTheDocument();
  });

  it("should have 24 hours selected by default", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const ttlButton = screen.getByRole("radio", { name: /24 hours/i });
    expect(ttlButton).toHaveAttribute("aria-checked", "true");
  });

  it("should change default TTL on click", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const oneHourButton = screen.getByRole("radio", { name: /1 hour/i });
    await user.click(oneHourButton);

    expect(oneHourButton).toHaveAttribute("aria-checked", "true");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  // ==========================================================================
  // Theme Tests
  // ==========================================================================

  it("should display theme options", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText("TERMINAL")).toBeInTheDocument();
    expect(screen.getByText("HIGH CONTRAST")).toBeInTheDocument();
    expect(screen.getByText("DARK")).toBeInTheDocument();
  });

  it("should have terminal theme selected by default", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const terminalButton = screen.getByRole("radio", { name: /terminal/i });
    expect(terminalButton).toHaveAttribute("aria-checked", "true");
  });

  it("should change theme on click", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const darkButton = screen.getByRole("radio", { name: /^dark$/i });
    await user.click(darkButton);

    expect(darkButton).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  // ==========================================================================
  // Text Size Tests
  // ==========================================================================

  it("should display text size options", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByRole("radio", { name: /small/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /medium/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /large/i })).toBeInTheDocument();
  });

  it("should have medium selected by default", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const mediumButton = screen.getByRole("radio", { name: /medium/i });
    expect(mediumButton).toHaveAttribute("aria-checked", "true");
  });

  it("should change text size on click", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const largeButton = screen.getByRole("radio", { name: /large/i });
    await user.click(largeButton);

    expect(largeButton).toHaveAttribute("aria-checked", "true");
  });

  // ==========================================================================
  // Toggle Options Tests
  // ==========================================================================

  it("should display toggle options", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText(/show preview before encrypt/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-copy generated link/i)).toBeInTheDocument();
  });

  it("should toggle show preview option", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const previewSwitch = screen.getByRole("switch", { name: /show preview/i });
    expect(previewSwitch).toHaveAttribute("aria-checked", "false");

    await user.click(previewSwitch);

    expect(previewSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("should toggle auto-copy option", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const autoCopySwitch = screen.getByRole("switch", { name: /auto-copy/i });
    expect(autoCopySwitch).toHaveAttribute("aria-checked", "true"); // default is true

    await user.click(autoCopySwitch);

    expect(autoCopySwitch).toHaveAttribute("aria-checked", "false");
  });

  // ==========================================================================
  // Reset Settings Tests
  // ==========================================================================

  it("should have reset button", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(screen.getByText(/reset to defaults/i)).toBeInTheDocument();
  });

  it("should reset settings on reset button click", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    // Change a setting first
    const singleClickButton = screen.getByRole("radio", { name: /single click/i });
    await user.click(singleClickButton);
    expect(singleClickButton).toHaveAttribute("aria-checked", "true");

    // Reset
    const resetButton = screen.getByText(/reset to defaults/i);
    await user.click(resetButton);

    // Should be back to default (double click)
    const doubleClickButton = screen.getByRole("radio", { name: /double click/i });
    expect(doubleClickButton).toHaveAttribute("aria-checked", "true");
  });

  // ==========================================================================
  // Close Behavior Tests
  // ==========================================================================

  it("should call onClose when close button clicked", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const closeButton = screen.getByLabelText(/close settings/i);
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when backdrop clicked", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const backdrop = screen.getByRole("dialog");
    await user.click(backdrop);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should call onClose when Escape pressed", async () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should not close when clicking inside modal content", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const content = screen.getByText("SYSTEM SETTINGS");
    await user.click(content);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  it("should have proper dialog role", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "settings-title");
  });

  it("should focus close button on mount", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const closeButton = screen.getByLabelText(/close settings/i);
    expect(closeButton).toHaveFocus();
  });

  it("should prevent body scroll when open", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(document.body.style.overflow).toBe("hidden");
  });

  it("should restore body scroll on unmount", () => {
    const { unmount } = render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
  });

  it("should have proper radiogroup roles", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const radiogroups = screen.getAllByRole("radiogroup");
    expect(radiogroups.length).toBeGreaterThanOrEqual(4); // confirm mode, ttl, theme, text size
  });

  it("should have proper switch roles for toggles", () => {
    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBe(2); // show preview, auto-copy
  });

  // ==========================================================================
  // localStorage Persistence Tests
  // ==========================================================================

  it("should persist settings to localStorage", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    // Change a setting
    const singleClickButton = screen.getByRole("radio", { name: /single click/i });
    await user.click(singleClickButton);

    // Verify localStorage was called
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "volatile-settings",
      expect.stringContaining('"confirmMode":"single"')
    );
  });

  it("should load settings from localStorage on mount", () => {
    // Pre-populate localStorage
    localStorageMock.setItem(
      "volatile-settings",
      JSON.stringify({
        confirmMode: "single",
        defaultTTL: 3600000,
        theme: "dark",
        showPreview: true,
        autoCopyLink: false,
        textSize: "large",
      })
    );

    // Need to re-render with fresh provider
    const { rerender } = render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    // This test validates the provider reads from localStorage on init
    // The actual verification would require inspecting the context
    expect(localStorageMock.getItem).toHaveBeenCalledWith("volatile-settings");
  });

  it("should remove settings from localStorage on reset", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    const resetButton = screen.getByText(/reset to defaults/i);
    await user.click(resetButton);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("volatile-settings");
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  it("should handle localStorage errors gracefully", async () => {
    const user = userEvent.setup();

    // Make setItem throw an error
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });

    render(
      <TestWrapper>
        <Settings onClose={mockOnClose} />
      </TestWrapper>
    );

    // Should not throw when changing settings
    const singleClickButton = screen.getByRole("radio", { name: /single click/i });
    await user.click(singleClickButton);

    // Setting should still update in memory (UI should reflect change)
    expect(singleClickButton).toHaveAttribute("aria-checked", "true");
  });
});

describe("SettingsContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("should throw error when useSettings used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    function TestComponent() {
      useSettings();
      return null;
    }

    expect(() => render(<TestComponent />)).toThrow(
      "useSettings must be used within SettingsProvider"
    );

    consoleSpy.mockRestore();
  });

  it("should provide default settings", () => {
    function TestComponent() {
      const { settings } = useSettings();
      return (
        <div>
          <span data-testid="confirm-mode">{settings.confirmMode}</span>
          <span data-testid="theme">{settings.theme}</span>
          <span data-testid="text-size">{settings.textSize}</span>
        </div>
      );
    }

    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId("confirm-mode")).toHaveTextContent("double");
    expect(screen.getByTestId("theme")).toHaveTextContent("terminal");
    expect(screen.getByTestId("text-size")).toHaveTextContent("medium");
  });

  it("should update settings via updateSetting", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { settings, updateSetting } = useSettings();
      return (
        <div>
          <span data-testid="confirm-mode">{settings.confirmMode}</span>
          <button onClick={() => updateSetting("confirmMode", "single")}>Change</button>
        </div>
      );
    }

    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    expect(screen.getByTestId("confirm-mode")).toHaveTextContent("double");

    await user.click(screen.getByText("Change"));

    expect(screen.getByTestId("confirm-mode")).toHaveTextContent("single");
  });

  it("should reset settings via resetSettings", async () => {
    const user = userEvent.setup();

    function TestComponent() {
      const { settings, updateSetting, resetSettings } = useSettings();
      return (
        <div>
          <span data-testid="confirm-mode">{settings.confirmMode}</span>
          <button onClick={() => updateSetting("confirmMode", "single")}>Change</button>
          <button onClick={() => resetSettings()}>Reset</button>
        </div>
      );
    }

    render(
      <SettingsProvider>
        <TestComponent />
      </SettingsProvider>
    );

    // Change setting
    await user.click(screen.getByText("Change"));
    expect(screen.getByTestId("confirm-mode")).toHaveTextContent("single");

    // Reset
    await user.click(screen.getByText("Reset"));
    expect(screen.getByTestId("confirm-mode")).toHaveTextContent("double");
  });
});
