/**
 * CreateView component tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateView } from "../../components/CreateView";
import { SettingsProvider } from "../../components/SettingsContext";
import { ToastProvider } from "../../components/Toast";

// Wrapper for providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <ToastProvider>{children}</ToastProvider>
    </SettingsProvider>
  );
}

// Mock crypto API
const mockGenerateKey = vi.fn();
const mockEncrypt = vi.fn();
const mockExportKey = vi.fn();

const mockKey = { algorithm: { name: "AES-GCM" } } as unknown as CryptoKey;

vi.mock("../../utils/crypto", () => ({
  generateKey: () => mockGenerateKey(),
  encryptMessage: () => mockEncrypt(),
  exportKeyToB64Url: () => mockExportKey(),
  MAX_PLAINTEXT_CHARS: 1_000_000,
}));

// Mock API
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock window.location
const mockLocation = { origin: "http://localhost:3000", pathname: "/", search: "", hash: "" };
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  key: vi.fn(),
};
global.localStorage = localStorageMock as any;

describe("CreateView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateKey.mockResolvedValue(mockKey);
    mockEncrypt.mockResolvedValue({
      content: "encrypted-content",
      iv: "iv-string",
    });
    mockExportKey.mockResolvedValue("key-b64url");
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "test-id" }),
    });
  });

  function renderCreateView() {
    return render(<CreateView />, { wrapper: TestWrapper });
  }

  it("should render input field and button", () => {
    renderCreateView();

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
  });

  it("should show character count", () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });

    expect(screen.getByText(/5.*1,000,000 chars/)).toBeInTheDocument();
  });

  it("should disable button when input is empty", () => {
    renderCreateView();

    const button = screen.getByRole("button", { name: /generate/i });
    expect(button).toBeDisabled();
  });

  it("should enable button when text is entered", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");

    expect(button).not.toBeDisabled();
  });

  it("should show warning near character limit", () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "a".repeat(950_000) } });

    expect(screen.getByRole("img", { name: /warning/i })).toBeInTheDocument();
  });

  it("should display help section when toggle is clicked", async () => {
    renderCreateView();

    const helpButton = screen.getByRole("button", { name: /how it works/i });
    await userEvent.click(helpButton);

    expect(screen.getByText(/Zero-Knowledge Encryption/i)).toBeInTheDocument();
  });

  it("should select TTL option", async () => {
    renderCreateView();

    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "300000"); // 5 minutes

    expect(select).toHaveValue("300000");
  });

  it("should generate link on successful encryption", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockGenerateKey).toHaveBeenCalled();
      expect(mockEncrypt).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/secrets",
        expect.objectContaining({
          method: "POST",
        })
      );
    });
  });

  it("should display result link after successful creation", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/SECURE LINK GENERATED/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue(/http:\/\//)).toBeInTheDocument();
    });
  });

  it("should show error when text exceeds maximum", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    fireEvent.change(input, { target: { value: "a".repeat(1_000_001) } });
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/too large/i)).toBeInTheDocument();
    });
  });

  it("should show error message on API failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "RATE_LIMITED" }),
    });

    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/ERROR/i)).toBeInTheDocument();
    });
  });

  it("should copy link to clipboard", async () => {
    // Mock clipboard API
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", { name: /copy/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
      expect(screen.getByText(/COPIED/i)).toBeInTheDocument();
    });
  });

  it("should use fallback copy when clipboard not available", async () => {
    // Mock no clipboard
    Object.assign(navigator, { clipboard: undefined });

    const mockExecCommand = vi.fn().mockReturnValue(true);
    document.execCommand = mockExecCommand;

    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    const copyButton = screen.getByRole("button", { name: /copy/i });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(mockExecCommand).toHaveBeenCalledWith("copy");
    });
  });

  it("should handle Ctrl+Enter keyboard shortcut", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "test secret");

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(mockGenerateKey).toHaveBeenCalled();
    });
  });

  it("should handle Cmd+Enter keyboard shortcut", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "test secret");

    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(mockGenerateKey).toHaveBeenCalled();
    });
  });

  it("should show loading state during encryption", async () => {
    // Mock slow encryption
    mockEncrypt.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ content: "encrypted", iv: "iv" }), 100);
        })
    );

    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    expect(screen.getByText(/GENERATING_ENCRYPTION_KEY/i)).toBeInTheDocument();
  });

  it("should reset form to create new secret", async () => {
    renderCreateView();

    const input = screen.getByRole("textbox");
    const button = screen.getByRole("button", { name: /generate/i });

    await userEvent.type(input, "test secret");
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/SECURE LINK GENERATED/i)).toBeInTheDocument();
    });

    const newButton = screen.getByRole("button", { name: /encrypt/i });
    await userEvent.click(newButton);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
  });
});
