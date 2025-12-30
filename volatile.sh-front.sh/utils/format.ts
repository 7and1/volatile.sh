/**
 * Shared formatting utilities
 * FIX: P0 - Extracted from CreateView.tsx and ReadView.tsx to eliminate code duplication
 */

/**
 * Format milliseconds to human readable time remaining
 * @param ms - Time in milliseconds
 * @returns Human readable string like "5 minutes" or "2 days"
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Expired";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ${minutes % 60} min`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return `${seconds} second${seconds > 1 ? "s" : ""}`;
}

/**
 * Format timestamp to localized date/time string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Localized date/time string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
