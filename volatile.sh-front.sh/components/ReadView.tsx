import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Skull,
  AlertTriangle,
  Eye,
  EyeOff,
  FileWarning,
  Lock,
  Clock,
  Calendar,
  Check,
} from "lucide-react";
import { TerminalButton } from "./TerminalButton";
import { importKeyFromB64Url, b64UrlToBytes } from "../utils/crypto";
import { API_BASE } from "../constants";
import { fetchWithRetry, getApiErrorMessage } from "../utils/api";
import { useToast } from "./Toast";
import { LoadingSpinner } from "./Loading";
import { useSettings } from "./SettingsContext";
import { formatTimeRemaining, formatTimestamp } from "../utils/format";

interface ReadViewProps {
  id: string;
}

interface SecretValidation {
  status: "ready" | "expired" | "burned";
  createdAt?: number;
  expiresAt?: number;
  ttl?: number;
}

export const ReadView: React.FC<ReadViewProps> = ({ id }) => {
  const { settings } = useSettings();
  const [validationStatus, setValidationStatus] = useState<
    "LOADING" | "READY" | "EXPIRED" | "BURNED" | "ERROR"
  >("LOADING");
  const [secretValidation, setSecretValidation] = useState<SecretValidation | null>(null);
  const [status, setStatus] = useState<
    "IDLE" | "CONFIRMING" | "FETCHING" | "DECRYPTING" | "REVEALED" | "ERROR" | "BURNED"
  >("IDLE");
  const [secretText, setSecretText] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [burnTimer, setBurnTimer] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const { showToast } = useToast();
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const abortButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap for confirmation dialog
  useEffect(() => {
    if (status === "CONFIRMING") {
      // Focus abort button when dialog opens
      abortButtonRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          handleCancelReveal();
          return;
        }

        if (e.key === "Tab" && confirmDialogRef.current) {
          const focusableElements = confirmDialogRef.current.querySelectorAll<HTMLElement>(
            'button, [tabindex]:not([tabindex="-1"])'
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
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [status]);

  // Validate secret before showing burn button
  const validateSecret = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/secrets/${id}/validate`);
      const data = await response.json();

      if (response.status === 404 || data.status === "burned") {
        setValidationStatus("BURNED");
        setSecretValidation(data);
      } else if (response.status === 410 || data.status === "expired") {
        setValidationStatus("EXPIRED");
        setSecretValidation(data);
      } else if (data.status === "ready") {
        setValidationStatus("READY");
        setSecretValidation(data);
      } else {
        setValidationStatus("ERROR");
        setErrorMsg("Unable to validate secret status");
      }
    } catch (err) {
      console.error("Validation error:", err);
      // If validation fails, still allow user to proceed
      setValidationStatus("READY");
      showToast("warning", "Could not validate secret - proceeding anyway");
    }
  }, [id, showToast]);

  useEffect(() => {
    validateSecret();
  }, [validateSecret]);

  const handleConfirmReveal = () => {
    // Single click mode: proceed directly to fetch
    if (settings.confirmMode === "single") {
      handleBurnAndReveal();
    } else {
      // Double click mode: show confirmation dialog
      setStatus("CONFIRMING");
    }
  };

  const handleCancelReveal = () => {
    setStatus("IDLE");
  };

  useEffect(() => {
    // Check if Hash Key exists immediately
    const hash = window.location.hash.substring(1);
    if (!hash) {
      setStatus("ERROR");
      setErrorMsg("MISSING DECRYPTION KEY IN URL FRAGMENT");
    }
  }, []);

  const handleBurnAndReveal = async () => {
    setStatus("FETCHING");
    setRetryCount(0);

    try {
      // 1. Fetch from API with retry logic
      const response = await fetchWithRetry(`${API_BASE}/secrets/${id}`, {
        retryConfig: {
          maxRetries: 3,
          initialDelay: 1000,
        },
        onRetry: (attempt, maxRetries, delay) => {
          setRetryCount(attempt);
          showToast(
            "warning",
            `Retrying fetch... (${attempt}/${maxRetries}) - waiting ${(delay / 1000).toFixed(1)}s`,
            2000
          );
        },
      });

      if (response.status === 404) {
        setStatus("BURNED");
        showToast("error", "Secret has already been accessed and destroyed");
        return;
      }

      if (!response.ok) {
        throw new Error(getApiErrorMessage(undefined, response));
      }

      const json = await response.json();

      setStatus("DECRYPTING");

      // 2. Get Key from Hash
      const hash = window.location.hash.substring(1);
      const key = await importKeyFromB64Url(hash);

      // 3. Decrypt
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64UrlToBytes(json.iv) },
        key,
        b64UrlToBytes(json.encrypted)
      );
      const plaintext = new TextDecoder().decode(decrypted);

      setSecretText(plaintext);
      setStatus("REVEALED");
      showToast("success", "Secret decrypted successfully!");

      // Start a local timer to hide/clear UI just for effect (Server data is already gone)
      let timeLeft = 60;
      setBurnTimer(timeLeft);
      const interval = setInterval(() => {
        timeLeft -= 1;
        setBurnTimer(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(interval);
          // Optional: Auto-clear from screen logic if desired
        }
      }, 1000);

      // Remove key from URL (keep query id so UI stays on this view)
      try {
        const clean = `${window.location.origin}${window.location.pathname}${window.location.search}`;
        history.replaceState(null, "", clean);
      } catch {}
    } catch (e) {
      console.error(e);
      setStatus("ERROR");
      const errorMsg =
        e instanceof Error ? e.message : "DECRYPTION FAILED. DATA CORRUPTED OR KEY INVALID.";
      setErrorMsg(errorMsg);
      showToast("error", errorMsg);
    } finally {
      setRetryCount(0);
    }
  };

  // b64UrlToBytes imported from ../utils/crypto (DRY - no duplication)

  // Show loading state while validating
  if (validationStatus === "LOADING") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-8 text-center">
        <div className="w-full max-w-md p-4 border border-term-green bg-term-green/5 glow-border">
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" />
            <p className="text-term-green font-mono text-sm">VALIDATING_SECRET_STATUS...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show expired/burned status from validation
  if (validationStatus === "BURNED") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-red-500 bg-red-900/10 p-6 animate-pulse glow-border shadow-red-500/20">
        <Skull className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
        <h2
          className="text-3xl font-bold text-red-500 mb-2 glow-text"
          style={{ textShadow: "0 0 5px rgba(239, 68, 68, 0.7)" }}
        >
          404 - BURNED
        </h2>
        <p className="text-red-400 font-mono">
          &gt; THE SECRET HAS BEEN VAPORIZED.
          <br />
          &gt; IT NO LONGER EXISTS IN THIS UNIVERSE.
        </p>
      </div>
    );
  }

  if (validationStatus === "EXPIRED") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-yellow-500 bg-yellow-900/10 p-6 glow-border shadow-yellow-500/20">
        <Clock className="w-16 h-16 text-yellow-500 mb-4" aria-hidden="true" />
        <h2 className="text-3xl font-bold text-yellow-500 mb-2 glow-text">410 - EXPIRED</h2>
        <p className="text-yellow-400 font-mono">
          &gt; THE SECRET HAS EXPIRED.
          <br />
          &gt; IT WAS AUTOMATICALLY DELETED FROM MEMORY.
        </p>
      </div>
    );
  }

  if (status === "BURNED") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-red-500 bg-red-900/10 p-6 animate-pulse glow-border shadow-red-500/20">
        <Skull className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
        <h2
          className="text-3xl font-bold text-red-500 mb-2 glow-text"
          style={{ textShadow: "0 0 5px rgba(239, 68, 68, 0.7)" }}
        >
          404 - BURNED
        </h2>
        <p className="text-red-400 font-mono">
          &gt; THE SECRET HAS BEEN VAPORIZED.
          <br />
          &gt; IT NO LONGER EXISTS IN THIS UNIVERSE.
        </p>
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-red-500 p-6 glow-border shadow-red-500/20">
        <FileWarning className="w-16 h-16 text-red-500 mb-4" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-red-500 mb-2">SYSTEM FAILURE</h2>
        <p className="text-red-400 font-mono">&gt; {errorMsg}</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 text-term-green underline hover:text-white"
        >
          [ RETURN TO BASE ]
        </button>
      </div>
    );
  }

  if (status === "REVEALED") {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end border-b-2 border-term-green pb-2">
          <h2 className="text-xl font-bold flex items-center gap-2 glow-text">
            <Eye className="w-5 h-5" aria-hidden="true" />
            DECRYPTED_PAYLOAD
          </h2>
          <span className="text-xs text-red-500 animate-pulse font-bold">
            LOCAL RAM CLEAR IN {burnTimer}s
          </span>
        </div>

        <div className="p-4 border border-term-green bg-term-green/5 min-h-[200px] whitespace-pre-wrap break-words font-mono text-lg glow-border">
          {secretText}
        </div>

        <div className="bg-red-900/20 border-l-4 border-red-500 p-4 text-sm text-red-400">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangle size={16} aria-hidden="true" />
            SERVER STATUS: DESTROYED
          </p>
          <p className="opacity-80 mt-1">
            The ciphertext has been deleted from the remote Volatile Vault. Reloading this page will
            result in a 404.
          </p>
        </div>

        <TerminalButton variant="danger" onClick={() => (window.location.href = "/")}>
          WIPE LOCAL MEMORY
        </TerminalButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] space-y-6 text-center">
      <div className="relative">
        <div
          className="absolute inset-0 bg-term-green blur-xl opacity-20 animate-pulse"
          aria-hidden="true"
        ></div>
        <Lock className="w-20 h-20 text-term-green relative z-10 glow-text" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-wider glow-text">ENCRYPTED SIGNAL DETECTED</h2>
        <p className="text-sm opacity-85 max-w-md mx-auto">
          &gt; You have received a secure volatile packet.
          <br />
          &gt; Proceeding will fetch the data and{" "}
          <span className="text-red-500 font-bold">PERMANENTLY DESTROY</span> it from the server.
        </p>
      </div>

      {/* Trust Indicators - Secret Status */}
      {validationStatus === "READY" && secretValidation && (
        <div
          className="w-full max-w-md p-4 border border-term-green/50 bg-term-green/5 glow-border"
          role="status"
          aria-live="polite"
        >
          <div className="space-y-3 text-left">
            <div className="flex items-center gap-2 text-term-green">
              <Check className="w-5 h-5" aria-hidden="true" />
              <span className="font-bold">SECRET_STATUS: READY_TO_READ</span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-term-green/70" aria-hidden="true" />
                <span className="text-term-green/70">CREATED:</span>
                <span className="text-term-green ml-auto">
                  {secretValidation.createdAt
                    ? formatTimestamp(secretValidation.createdAt)
                    : "Unknown"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-term-green/70" aria-hidden="true" />
                <span className="text-term-green/70">EXPIRES_IN:</span>
                <span className="text-term-green ml-auto">
                  {secretValidation.ttl ? formatTimeRemaining(secretValidation.ttl) : "Unknown"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-term-green/30 text-xs text-term-green/60">
              <Lock className="w-3 h-3 inline mr-1" aria-hidden="true" />
              Encrypted with AES-256-GCM. Key stored in URL fragment.
            </div>
          </div>
        </div>
      )}

      <div
        className="p-4 border border-red-500/50 bg-red-900/10 max-w-md glow-border shadow-red-500/10"
        role="alert"
      >
        <div className="flex items-start gap-3 text-left">
          <AlertTriangle className="text-red-500 w-6 h-6 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-red-400 text-xs">
            <strong className="block text-sm mb-1">WARNING: ONE-TIME ACCESS</strong>
            There is no undo. Once you click reveal, the server burns the data. Do not refresh the
            page after revealing.
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {status === "CONFIRMING" && (
        <div
          ref={confirmDialogRef}
          className="w-full max-w-md p-6 border-2 border-red-500 bg-red-900/20 glow-border animate-fade-in"
          role="alertdialog"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
        >
          <div className="text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" aria-hidden="true" />
            <h3 id="confirm-title" className="text-lg font-bold text-red-400">
              FINAL CONFIRMATION REQUIRED
            </h3>
            <p id="confirm-desc" className="text-sm text-red-300/80">
              This action is <strong>irreversible</strong>. The secret will be permanently destroyed
              from the server after you view it.
            </p>
            <p className="text-xs text-red-400/60">Press Escape to cancel</p>
            <div className="flex gap-3 justify-center pt-2">
              <TerminalButton
                ref={abortButtonRef}
                variant="secondary"
                onClick={handleCancelReveal}
                aria-label="Cancel and go back"
              >
                ABORT
              </TerminalButton>
              <TerminalButton
                variant="danger"
                onClick={handleBurnAndReveal}
                aria-label="Confirm and reveal secret"
              >
                CONFIRM BURN
              </TerminalButton>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {(status === "FETCHING" || status === "DECRYPTING") && (
        <div
          className="w-full max-w-md p-4 border border-term-green bg-term-green/5 glow-border animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" />
            <div className="flex-1 text-left">
              <p className="text-term-green font-mono text-sm">
                {status === "FETCHING" && "FETCHING_ENCRYPTED_DATA..."}
                {status === "DECRYPTING" && "DECRYPTING_PAYLOAD..."}
              </p>
              {retryCount > 0 && (
                <p className="text-yellow-500 text-xs mt-1">&gt; RETRY_ATTEMPT: {retryCount}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {status === "IDLE" && validationStatus === "READY" && (
        <TerminalButton onClick={handleConfirmReveal} aria-label="Initiate burn and reveal secret">
          INITIATE BURN & REVEAL
        </TerminalButton>
      )}
    </div>
  );
};
