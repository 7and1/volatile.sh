import React, { useState, useEffect } from "react";
import {
  Lock,
  Copy,
  Check,
  Terminal,
  Flame,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  Calendar,
  Clock,
} from "lucide-react";
import { TerminalButton } from "./TerminalButton";
import {
  generateKey,
  encryptMessage,
  exportKeyToB64Url,
  MAX_PLAINTEXT_CHARS,
} from "../utils/crypto";
import { API_BASE } from "../constants";
import { fetchWithRetry, getApiErrorMessage } from "../utils/api";
import { useToast } from "./Toast";
import { LoadingSpinner } from "./Loading";
import { useSettings } from "./SettingsContext";
import { formatTimeRemaining, formatTimestamp } from "../utils/format";

// Maximum encrypted size (base64url encoded ~1MB)
const MAX_ENCRYPTED_CHARS = 1_400_000;

export const CreateView: React.FC = () => {
  const { settings, updateSetting } = useSettings();
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ encrypted: string; iv: string } | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<CryptoKey | null>(null);
  const [creationTime, setCreationTime] = useState<number>(Date.now());

  // Initialize TTL from settings
  const [ttlMs, setTtlMs] = useState<number>(settings.defaultTTL);

  // Update TTL when settings change
  useEffect(() => {
    setTtlMs(settings.defaultTTL);
  }, [settings.defaultTTL]);

  // Auto-copy link when generated if setting is enabled
  useEffect(() => {
    if (resultLink && settings.autoCopyLink) {
      copyToClipboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultLink]);

  const { showToast } = useToast();

  // Keyboard shortcut: Ctrl+Enter or Cmd+Enter to encrypt
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (settings.showPreview && previewData) {
        handleFinalizeUpload();
      } else {
        handleEncrypt();
      }
    }
  };

  // Reset to create new secret (without page reload)
  const handleReset = () => {
    setText("");
    setResultLink(null);
    setCopied(false);
    setError(null);
    setShowPreview(false);
    setPreviewData(null);
    setGeneratedId(null);
    setGeneratedKey(null);
    setRetryCount(0);
    setCreationTime(Date.now());
    showToast("info", "Ready for a new secret");
  };

  // Regenerate with new encryption key (keeps same text)
  const handleRegenerate = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);
    setPreviewData(null);
    setGeneratedId(null);
    setGeneratedKey(null);

    try {
      // Generate new key
      setLoadingStatus("GENERATING_KEY");
      const key = await generateKey();
      setGeneratedKey(key);

      // Encrypt with new key
      setLoadingStatus("ENCRYPTING");
      const encryptedPayload = await encryptMessage(text, key);

      setPreviewData({
        encrypted: encryptedPayload.content,
        iv: encryptedPayload.iv,
      });
      setShowPreview(true);
      setLoadingStatus("");
      showToast("success", "New encryption key generated");
    } catch (err) {
      console.error(err);
      const errorMsg = getApiErrorMessage(err);
      setError(errorMsg);
      showToast("error", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Preview mode: encrypt locally first
  const handlePreviewEncrypt = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (text.length > MAX_PLAINTEXT_CHARS) {
        const errorMsg = `Text too large (${text.toLocaleString()} chars). Maximum is ${MAX_PLAINTEXT_CHARS.toLocaleString()} chars.`;
        setError(errorMsg);
        showToast("error", errorMsg);
        setIsLoading(false);
        return;
      }

      setLoadingStatus("GENERATING_KEY");
      const key = await generateKey();
      setGeneratedKey(key);

      setLoadingStatus("ENCRYPTING");
      const encryptedPayload = await encryptMessage(text, key);

      setPreviewData({
        encrypted: encryptedPayload.content,
        iv: encryptedPayload.iv,
      });
      setShowPreview(true);
      setLoadingStatus("");
      showToast("success", "Preview ready - click confirm to upload");
    } catch (err) {
      console.error(err);
      const errorMsg = getApiErrorMessage(err);
      setError(errorMsg);
      showToast("error", errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Finalize upload (from preview state)
  const handleFinalizeUpload = async () => {
    if (!previewData || !generatedKey) return;

    setIsLoading(true);
    setError(null);

    try {
      setLoadingStatus("UPLOADING");
      const response = await fetchWithRetry(`${API_BASE}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted: previewData.encrypted,
          iv: previewData.iv,
          ttl: ttlMs,
        }),
        retryConfig: {
          maxRetries: 3,
          initialDelay: 1000,
        },
        onRetry: (attempt, maxRetries, delay) => {
          setRetryCount(attempt);
          showToast(
            "warning",
            `Retrying upload... (${attempt}/${maxRetries}) - waiting ${(delay / 1000).toFixed(1)}s`,
            2000
          );
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.error === "SECRET_TOO_LARGE") {
          throw new Error("Secret too large - please reduce the text size");
        }
        if (data.error === "RATE_LIMITED") {
          throw new Error("Too many requests - please wait a moment");
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const { id } = await response.json();
      setGeneratedId(id);

      setLoadingStatus("FINALIZING");
      const hash = await exportKeyToB64Url(generatedKey);
      const link = `${window.location.origin}/?id=${id}#${hash}`;
      setResultLink(link);
      setShowPreview(false);
      showToast("success", "Secure link generated successfully!");
    } catch (err) {
      console.error(err);
      const errorMsg = getApiErrorMessage(err);
      setError(errorMsg);
      showToast("error", errorMsg);
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
      setRetryCount(0);
    }
  };

  const handleEncrypt = async () => {
    if (!text.trim()) return;

    // Use preview mode if enabled in settings
    if (settings.showPreview) {
      await handlePreviewEncrypt();
      return;
    }

    setIsLoading(true);
    setError(null);
    setRetryCount(0);

    try {
      // 1. Validate size before encryption
      if (text.length > MAX_PLAINTEXT_CHARS) {
        const errorMsg = `Text too large (${text.toLocaleString()} chars). Maximum is ${MAX_PLAINTEXT_CHARS.toLocaleString()} chars.`;
        setError(errorMsg);
        showToast("error", errorMsg);
        setIsLoading(false);
        return;
      }

      // 2. Generate Key
      setLoadingStatus("GENERATING_KEY");
      const key = await generateKey();
      setGeneratedKey(key);

      // 3. Encrypt Locally
      setLoadingStatus("ENCRYPTING");
      const encryptedPayload = await encryptMessage(text, key);

      // 4. Check encrypted size
      if (encryptedPayload.content.length > MAX_ENCRYPTED_CHARS) {
        const errorMsg = "Encrypted data too large. Please reduce input text.";
        setError(errorMsg);
        showToast("error", errorMsg);
        setIsLoading(false);
        return;
      }

      // 5. Send to Server with retry logic
      setLoadingStatus("UPLOADING");
      const response = await fetchWithRetry(`${API_BASE}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted: encryptedPayload.content,
          iv: encryptedPayload.iv,
          ttl: ttlMs,
        }),
        retryConfig: {
          maxRetries: 3,
          initialDelay: 1000,
        },
        onRetry: (attempt, maxRetries, delay) => {
          setRetryCount(attempt);
          showToast(
            "warning",
            `Retrying upload... (${attempt}/${maxRetries}) - waiting ${(delay / 1000).toFixed(1)}s`,
            2000
          );
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.error === "SECRET_TOO_LARGE") {
          throw new Error("Secret too large - please reduce the text size");
        }
        if (data.error === "RATE_LIMITED") {
          throw new Error("Too many requests - please wait a moment");
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const { id } = await response.json();
      setGeneratedId(id);

      // 6. Export Key for URL
      setLoadingStatus("FINALIZING");
      const hash = await exportKeyToB64Url(key);

      // 7. Construct Link
      const link = `${window.location.origin}/?id=${id}#${hash}`;
      setResultLink(link);
      showToast("success", "Secure link generated successfully!");
    } catch (err) {
      console.error(err);
      const errorMsg = getApiErrorMessage(err);
      setError(errorMsg);
      showToast("error", errorMsg);
    } finally {
      setIsLoading(false);
      setLoadingStatus("");
      setRetryCount(0);
    }
  };

  const copyToClipboard = async () => {
    if (!resultLink) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(resultLink);
        setCopied(true);
        showToast("success", "Link copied to clipboard!");
        setTimeout(() => setCopied(false), 4000);
      } else {
        fallbackCopy(resultLink);
      }
    } catch (err) {
      console.error("Clipboard error:", err);
      fallbackCopy(resultLink);
    }
  };

  const fallbackCopy = (value: string) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.setAttribute("aria-label", "Temporary clipboard textarea");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.left = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        setCopied(true);
        showToast("success", "Link copied to clipboard!");
        setTimeout(() => setCopied(false), 4000);
      } else {
        showToast("info", "Please copy the link manually");
      }
    } catch (err) {
      showToast("info", "Please copy the link manually");
    }
  };

  // Preview mode UI
  if (showPreview && previewData) {
    return (
      <div className="space-y-6">
        <div className="border-2 border-yellow-500 p-4 bg-yellow-900/10 glow-border">
          <div className="flex items-center gap-2 mb-4 text-yellow-500">
            <Eye className="w-6 h-6" aria-hidden="true" />
            <h2 className="text-xl font-bold tracking-wider">PREVIEW MODE</h2>
          </div>
          <p className="text-sm text-yellow-400/80 mb-4">
            Your message has been encrypted locally. Review the details below, then confirm to
            upload to the volatile server.
          </p>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono mb-4">
            <div className="p-2 border border-term-green/30">
              <span className="text-term-green/60">ENCRYPTED SIZE:</span>
              <span className="text-term-green ml-2">
                {previewData.encrypted.length.toLocaleString()} chars
              </span>
            </div>
            <div className="p-2 border border-term-green/30">
              <span className="text-term-green/60">TTL:</span>
              <span className="text-term-green ml-2">
                {ttlMs === 5 * 60 * 1000 && "5 MINUTES"}
                {ttlMs === 60 * 60 * 1000 && "1 HOUR"}
                {ttlMs === 24 * 60 * 60 * 1000 && "24 HOURS"}
                {ttlMs === 7 * 24 * 60 * 60 * 1000 && "7 DAYS"}
              </span>
            </div>
          </div>

          <div className="bg-term-green/5 p-3 border border-term-green/30 mb-4">
            <p className="text-xs text-term-green/70">
              <strong className="text-term-green">NOTE:</strong> The encrypted data is only stored
              locally. Click "CONFIRM & UPLOAD" to send it to the server.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <TerminalButton
              variant="secondary"
              onClick={() => {
                setShowPreview(false);
                setPreviewData(null);
              }}
              className="flex-1"
            >
              <EyeOff size={16} className="mr-2 inline" aria-hidden="true" />
              CANCEL
            </TerminalButton>
            <TerminalButton onClick={handleFinalizeUpload} isLoading={isLoading} className="flex-1">
              CONFIRM & UPLOAD
            </TerminalButton>
          </div>
        </div>
      </div>
    );
  }

  if (resultLink) {
    const expiresAt = creationTime + ttlMs;
    const timeRemaining = expiresAt - Date.now();

    return (
      <div className="space-y-6 animate-crt-flicker">
        <div className="border-2 border-term-green p-4 bg-term-green/5 glow-border">
          <div className="flex items-center gap-2 mb-4 text-term-green glow-text">
            <Check className="w-6 h-6" aria-hidden="true" />
            <h2 className="text-xl font-bold tracking-wider">SECURE LINK GENERATED</h2>
          </div>

          <div className="mb-4 text-sm font-mono space-y-1 opacity-90">
            <p>&gt; PAYLOAD ENCRYPTED IN RAM.</p>
            <p>&gt; DECRYPTION KEY EMBEDDED IN FRAGMENT.</p>
            <p className="text-red-500 font-bold bg-red-900/10 inline-block px-1 mt-1 border border-red-500/30">
              WARNING: LINK WILL SELF-DESTRUCT AFTER ONE VIEW.
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="mb-4 p-3 border border-term-green/30 bg-term-green/5 space-y-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-term-green/70" aria-hidden="true" />
              <span className="text-term-green/70">ENCRYPTION:</span>
              <span className="text-term-green ml-auto">AES-256-GCM ✓</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-term-green/70" aria-hidden="true" />
              <span className="text-term-green/70">CREATED:</span>
              <span className="text-term-green ml-auto">{formatTimestamp(creationTime)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-term-green/70" aria-hidden="true" />
              <span className="text-term-green/70">EXPIRES_IN:</span>
              <span className="text-term-green ml-auto">{formatTimeRemaining(timeRemaining)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <textarea
                readOnly
                value={resultLink}
                onClick={(e) => e.currentTarget.select()}
                className="w-full min-h-[80px] bg-black border border-term-green/50 p-3 text-term-green/70 font-mono text-xs resize-none focus:outline-none focus:ring-1 focus:ring-term-green overflow-auto"
                aria-label="Generated secure link"
                rows={3}
              />
              <span className="absolute bottom-2 right-2 text-term-green/40 text-xs">
                Click to select all
              </span>
            </div>

            <TerminalButton
              onClick={copyToClipboard}
              className={`w-full flex items-center justify-center gap-2 text-lg py-4 ${copied ? "bg-term-green text-black" : ""}`}
              aria-label={copied ? "Link copied" : "Copy link to clipboard"}
            >
              {copied ? (
                <>
                  <Check size={20} aria-hidden="true" />
                  COPIED_TO_CLIPBOARD
                </>
              ) : (
                <>
                  <Copy size={20} aria-hidden="true" />
                  &gt; COPY_SECURE_LINK_
                </>
              )}
            </TerminalButton>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleReset}
            className="text-xs text-term-green/50 hover:text-term-green hover:underline flex items-center gap-1 transition-colors px-4 py-2 border border-term-green/30 hover:border-term-green/60"
          >
            <Terminal size={14} aria-hidden="true" />[ ENCRYPT NEW PAYLOAD ]
          </button>
          {text && (
            <button
              onClick={handleRegenerate}
              disabled={isLoading}
              className="text-xs text-term-green/50 hover:text-term-green hover:underline flex items-center gap-1 transition-colors px-4 py-2 border border-term-green/30 hover:border-term-green/60 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
              [ REGENERATE WITH NEW KEY ]
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <label
          htmlFor="secret-input"
          className="text-sm font-bold flex items-center gap-2 glow-text"
        >
          <Terminal size={16} aria-hidden="true" />
          INPUT_PAYLOAD_
          <span className="animate-blink block w-2 h-4 bg-term-green" aria-hidden="true"></span>
        </label>
        <span className="text-xs text-term-green/60" aria-live="polite">
          {text.length.toLocaleString()} / {MAX_PLAINTEXT_CHARS.toLocaleString()} chars
          {text.length > MAX_PLAINTEXT_CHARS * 0.9 && (
            <span className="text-red-500 ml-1" role="img" aria-label="Warning">
              ⚠️
            </span>
          )}
        </span>
      </div>

      {/* How it works explainer */}
      <button
        type="button"
        onClick={() => setShowHelp(!showHelp)}
        className="flex items-center gap-2 text-xs text-term-green/60 hover:text-term-green transition-colors w-full justify-start"
        aria-expanded={showHelp}
        aria-controls="how-it-works"
      >
        <HelpCircle size={14} aria-hidden="true" />
        <span>How it works</span>
        {showHelp ? (
          <ChevronUp size={14} aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
      </button>

      {showHelp && (
        <div
          id="how-it-works"
          className="p-4 border border-term-green/30 bg-term-green/5 text-xs space-y-3 animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-term-green shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-term-green">Zero-Knowledge Encryption</strong>
              <p className="opacity-70 mt-1">
                Your secret is encrypted <em>in your browser</em> using AES-256-GCM before leaving
                your device. We never see the plaintext.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Lock size={16} className="text-term-green shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-term-green">Key in URL Fragment</strong>
              <p className="opacity-70 mt-1">
                The decryption key is stored after the # in the URL. Browsers never send this part
                to servers (RFC 3986).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Flame size={16} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="text-red-400">Burn After Reading</strong>
              <p className="opacity-70 mt-1">
                The encrypted data is deleted from our servers the moment it's retrieved. One view,
                then it's gone forever.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <textarea
          id="secret-input"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="> INPUT_PAYLOAD_ (Ctrl+Enter to encrypt)"
          maxLength={MAX_PLAINTEXT_CHARS}
          className="w-full min-h-[280px] max-h-[60vh] sm:max-h-[60vh] bg-black border-2 border-term-green p-5 text-term-green font-mono text-xl resize-y placeholder-term-green/20 focus:outline-none focus:shadow-[0_0_15px_rgba(51,255,0,0.3)] transition-shadow glow-border"
          disabled={isLoading}
          aria-describedby="char-count keyboard-hint"
          aria-label="Secret message input"
        />
        <div id="keyboard-hint" className="text-xs text-term-green/40 mt-1 text-right">
          Press Ctrl+Enter to encrypt
        </div>
      </div>

      {error && (
        <div
          className="p-3 border border-red-500 text-red-500 bg-red-900/10 text-sm font-bold glow-border shadow-red-900/20 animate-fade-in"
          role="alert"
          aria-live="assertive"
        >
          &gt; ERROR: {error}
        </div>
      )}

      {/* Loading status indicator */}
      {isLoading && (
        <div
          className="p-4 border border-term-green bg-term-green/5 glow-border animate-fade-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" />
            <div className="flex-1">
              <p className="text-term-green font-mono text-sm">
                {loadingStatus === "GENERATING_KEY" && "GENERATING_ENCRYPTION_KEY..."}
                {loadingStatus === "ENCRYPTING" && "ENCRYPTING_PAYLOAD..."}
                {loadingStatus === "UPLOADING" && "UPLOADING_TO_VAULT..."}
                {loadingStatus === "FINALIZING" && "FINALIZING_SECURE_LINK..."}
              </p>
              {retryCount > 0 && (
                <p className="text-yellow-500 text-xs mt-1">&gt; RETRY_ATTEMPT: {retryCount}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center pt-4">
        <div className="text-xs max-w-xs opacity-70">
          <div className="flex items-center gap-1 mb-1">
            <Lock size={12} aria-hidden="true" />
            <span>Client-side Encryption</span>
          </div>
          <div className="flex items-center gap-1">
            <Flame size={12} aria-hidden="true" />
            <span>Volatile Memory Storage</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="ttl-select" className="text-xs opacity-70 flex items-center gap-2">
            EXPIRES_IN
            <select
              id="ttl-select"
              value={ttlMs}
              onChange={(e) => setTtlMs(parseInt(e.target.value, 10))}
              className="bg-black border border-term-green/50 px-2 py-1 text-term-green text-xs focus:outline-none focus:ring-1 focus:ring-term-green"
              disabled={isLoading}
              aria-label="Select expiration time"
            >
              <option value={5 * 60 * 1000}>5 MIN</option>
              <option value={60 * 60 * 1000}>1 HOUR</option>
              <option value={24 * 60 * 60 * 1000}>24 HOURS</option>
              <option value={7 * 24 * 60 * 60 * 1000}>7 DAYS</option>
            </select>
          </label>
        </div>
        <TerminalButton
          onClick={handleEncrypt}
          disabled={!text || isLoading}
          isLoading={isLoading}
          aria-label="Generate secure link"
        >
          GENERATE LINK
        </TerminalButton>
      </div>
    </div>
  );
};
