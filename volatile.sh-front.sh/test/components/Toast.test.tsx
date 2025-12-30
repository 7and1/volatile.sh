/**
 * Toast component tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../../components/Toast";
import { SettingsProvider } from "../../components/SettingsContext";

// Test component to use toast hook
function TestComponent() {
  const { showToast, toasts } = useToast();

  return (
    <div>
      <div data-testid="toast-count">{toasts.length}</div>
      <button onClick={() => showToast("success", "Success message")} data-testid="success-btn">
        Show Success
      </button>
      <button onClick={() => showToast("error", "Error message")} data-testid="error-btn">
        Show Error
      </button>
      <button onClick={() => showToast("warning", "Warning message")} data-testid="warning-btn">
        Show Warning
      </button>
      <button onClick={() => showToast("info", "Info message")} data-testid="info-btn">
        Show Info
      </button>
      <button
        onClick={() => showToast("success", "Custom duration", 200)}
        data-testid="duration-btn"
      >
        Show Custom Duration
      </button>
      <button
        onClick={() => showToast("success", "Permanent toast", 0)}
        data-testid="permanent-btn"
      >
        Show Permanent
      </button>
    </div>
  );
}

// Wrapper for providers
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <ToastProvider>{children}</ToastProvider>
    </SettingsProvider>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("should render toast provider without toasts", () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId("toast-count")).toHaveTextContent("0");
  });

  it("should show success toast", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("success-btn");
    await userEvent.click(button);

    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("should show error toast", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("error-btn");
    await userEvent.click(button);

    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should show warning toast", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("warning-btn");
    await userEvent.click(button);

    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should show info toast", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("info-btn");
    await userEvent.click(button);

    expect(screen.getByText("Info message")).toBeInTheDocument();
  });

  it("should remove toast after duration", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("duration-btn");
    await userEvent.click(button);

    expect(screen.getByText("Custom duration")).toBeInTheDocument();

    // Wait for toast to be removed (200ms duration + buffer)
    await waitFor(
      () => {
        expect(screen.queryByText("Custom duration")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("should not remove permanent toast", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    const button = screen.getByTestId("permanent-btn");
    await userEvent.click(button);

    expect(screen.getByText("Permanent toast")).toBeInTheDocument();

    // Wait a bit and confirm it's still there
    await waitFor(
      () => {
        expect(screen.getByText("Permanent toast")).toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  it("should show multiple toasts", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    await userEvent.click(screen.getByTestId("success-btn"));
    await userEvent.click(screen.getByTestId("error-btn"));
    await userEvent.click(screen.getByTestId("warning-btn"));

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should close toast on close button click", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    await userEvent.click(screen.getByTestId("success-btn"));

    const closeButton = screen.getByLabelText("Close notification");
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Success message")).not.toBeInTheDocument();
    });
  });

  it("should have correct ARIA attributes", async () => {
    render(
      <TestWrapper>
        <TestComponent />
      </TestWrapper>
    );

    await userEvent.click(screen.getByTestId("success-btn"));

    const region = screen.getByRole("region", { name: /notifications/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-live", "polite");

    const toast = screen.getByRole("alert");
    expect(toast).toHaveAttribute("aria-atomic", "true");
  });
});
