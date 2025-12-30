/**
 * ReadView component tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadView } from "../../components/ReadView";
import { SettingsProvider } from "../../components/SettingsContext";
import { ToastProvider } from "../../components/Toast";

// Wrapper for providers - note: ErrorBoundary is intentionally excluded from tests
// to avoid catching test errors and showing error screens instead of actual component output
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <ToastProvider>
        <div>{children}</div>
      </ToastProvider>
    </SettingsProvider>
  );
}

// Mock API
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock crypto
const mockImportKey = vi.fn();
const mockDecrypt = vi.fn();

vi.mock("../../utils/crypto", () => ({
  importKeyFromB64Url: () => mockImportKey(),
  b64UrlToBytes: (str: string) => new Uint8Array(Buffer.from(str, "base64")),
}));

// Mock window.location
const mockLocation = {
  origin: "http://localhost:3000",
  pathname: "/",
  search: "?id=test-id",
  hash: "#test-key",
};
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Mock history.replaceState
const mockReplaceState = vi.fn();
Object.defineProperty(window, "history", {
  value: { replaceState: mockReplaceState },
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

describe("ReadView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    mockImportKey.mockResolvedValue({} as CryptoKey);
    mockDecrypt.mockResolvedValue(new TextEncoder().encode("secret message"));

    // Mock both the main secret fetch and the validate endpoint
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/validate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "ready" as const,
              createdAt: Date.now(),
              expiresAt: Date.now() + 3600000,
              ttl: 3600000,
            }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            encrypted: "encrypted-data",
            iv: "iv-data",
          }),
      });
    });
  });

  function renderReadView(id: string = "test-id") {
    return render(<ReadView id={id} />, { wrapper: TestWrapper });
  }

  it("should render initial view with confirm button", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByText(/ENCRYPTED SIGNAL DETECTED/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show error when hash key is missing", async () => {
    // Mock location without hash
    Object.defineProperty(window, "location", {
      value: { ...mockLocation, hash: "" },
      writable: true,
    });

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByText(/MISSING DECRYPTION KEY/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show confirmation dialog on confirm click", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    expect(screen.getByText(/FINAL CONFIRMATION REQUIRED/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abort/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("should return to idle on abort", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const abortButton = screen.getByRole("button", { name: /abort/i });
    await userEvent.click(abortButton);

    expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
  });

  it("should fetch and decrypt secret on confirm", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "http://localhost:3000/api/secrets/test-id",
          expect.objectContaining({
            method: "GET",
          })
        );
      },
      { timeout: 5000 }
    );
  });

  it("should display decrypted secret", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/DECRYPTED_PAYLOAD/i)).toBeInTheDocument();
        expect(screen.getByText("secret message")).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show burned status after 404", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/validate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "ready" as const,
              createdAt: Date.now(),
              expiresAt: Date.now() + 3600000,
              ttl: 3600000,
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "SECRET_NOT_FOUND" }),
      });
    });

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/404 - BURNED/i)).toBeInTheDocument();
        expect(screen.getByText(/vaporized/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show error on decryption failure", async () => {
    mockDecrypt.mockRejectedValue(new Error("Decryption failed"));

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/SYSTEM FAILURE/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show error on network failure", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/validate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "ready" as const,
              createdAt: Date.now(),
              expiresAt: Date.now() + 3600000,
              ttl: 3600000,
            }),
        });
      }
      return Promise.reject(new Error("Network error"));
    });

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/SYSTEM FAILURE/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should clean URL hash after decryption", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(mockReplaceState).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );
  });

  it("should start burn timer after reveal", async () => {
    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/LOCAL RAM CLEAR IN 60s/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });

  it("should show loading state during fetch", async () => {
    let resolveFetch: (value: any) => void;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/validate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "ready" as const,
              createdAt: Date.now(),
              expiresAt: Date.now() + 3600000,
              ttl: 3600000,
            }),
        });
      }
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/FETCHING_ENCRYPTED_DATA/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Clean up - resolve the pending promise
    if (resolveFetch) {
      resolveFetch({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ encrypted: "data", iv: "iv" }),
      });
    }
  });

  it("should show decrypting state during decryption", async () => {
    let resolveDecrypt: (value: any) => void;
    mockDecrypt.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDecrypt = resolve;
        })
    );

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        expect(screen.getByText(/DECRYPTING_PAYLOAD/i)).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Clean up - resolve the pending promise
    if (resolveDecrypt) {
      resolveDecrypt(new TextEncoder().encode("secret"));
    }
  });

  it("should return to base on error click", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/validate")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: "ready" as const,
              createdAt: Date.now(),
              expiresAt: Date.now() + 3600000,
              ttl: 3600000,
            }),
        });
      }
      return Promise.reject(new Error("Error"));
    });

    // Mock window.location.href
    const mockHref = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...mockLocation, href: "" },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: mockHref,
      get: () => "",
    });

    renderReadView();

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /initiate/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    const button = screen.getByRole("button", { name: /initiate/i });
    await userEvent.click(button);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    await userEvent.click(confirmButton);

    await waitFor(
      () => {
        const returnButton = screen.getByRole("button", { name: /return/i });
        expect(returnButton).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
  });
});
