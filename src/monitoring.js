/**
 * Monitoring and observability utilities
 * Provides structured logging, error tracking, and performance metrics
 */

/**
 * Business metrics tracking (in-memory, resets on worker restart)
 */
const businessMetrics = {
  createAttempts: 0,
  createSuccesses: 0,
  createFailures: 0,
  readAttempts: 0,
  readSuccesses: 0,
  readFailures: 0,
  lastReset: Date.now(),
};

/**
 * Alert thresholds
 */
const ALERT_THRESHOLDS = {
  errorRate: 0.1, // 10% error rate triggers alert
  errorCount: 50, // 50 errors in window triggers alert
  blacklistRate: 0.05, // 5% blacklist rate triggers alert
};

/**
 * Alert state tracking
 */
const alertState = {
  lastAlertTime: 0,
  alertCooldownMs: 300_000, // 5 minutes between alerts
  recentErrors: [],
  errorWindowMs: 60_000, // 1 minute error window
};

/**
 * Enhanced structured logging with context enrichment
 */
export function log(level, message, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  console.log(JSON.stringify(logEntry));

  // Track errors for alerting
  if (level === "error" || level === "warn") {
    trackError(message, context);
  }
}

/**
 * Sentry error tracking integration
 * FIX: P0 - Sanitize stack traces to prevent information leakage
 * Note: Requires SENTRY_DSN environment variable to be set
 */
export async function captureException(error, context = {}, env = {}) {
  // FIX: P0 - Only include stack traces in non-production environments
  const isProduction = env.ENVIRONMENT === "production";

  // Log locally first with sanitized error data
  log("error", error.message, {
    error: error.message,
    // Only include stack in non-production
    stack: isProduction ? undefined : error.stack,
    ...context,
  });

  // Send to Sentry if configured
  if (env.SENTRY_DSN) {
    try {
      await sendToSentry(error, context, env);
    } catch (sentryError) {
      // Never let Sentry reporting break the application
      log("warn", "Failed to send error to Sentry", {
        error: sentryError.message,
      });
    }
  }
}

/**
 * Send error to Sentry
 * @private
 */
async function sendToSentry(error, context, env) {
  const sentryPayload = {
    timestamp: Date.now() / 1000,
    platform: "javascript",
    environment: env.ENVIRONMENT || "production",
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message,
          stacktrace: parseStackTrace(error.stack),
        },
      ],
    },
    contexts: {
      runtime: {
        name: "Cloudflare Workers",
        version: "unknown",
      },
    },
    extra: context,
  };

  const sentryUrl = parseSentryDsn(env.SENTRY_DSN);
  await fetch(sentryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": "Sentry sentry_version=7, sentry_client=volatile.sh/1.0",
    },
    body: JSON.stringify(sentryPayload),
  });
}

/**
 * Parse Sentry DSN into endpoint URL
 * @private
 */
function parseSentryDsn(dsn) {
  const match = dsn.match(/^https?:\/\/(.+)@(.+)\/(\d+)$/);
  if (!match) throw new Error("Invalid Sentry DSN");
  const [, key, host, projectId] = match;
  return "https://" + host + "/api/" + projectId + "/store/";
}

/**
 * Parse stack trace for Sentry
 * @private
 */
function parseStackTrace(stack) {
  if (!stack) return { frames: [] };

  const lines = stack.split("\n").slice(1);
  const frames = lines
    .map((line) => {
      const match = line.match(/at (.+?) \((.+?):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3], 10),
          colno: parseInt(match[4], 10),
        };
      }
      return null;
    })
    .filter(Boolean);

  return { frames };
}

/**
 * Performance metrics collector
 */
export class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Record a timing metric
   */
  timing(name, value, tags = {}) {
    this.record("timing", name, value, tags);
  }

  /**
   * Record a counter metric
   */
  increment(name, value = 1, tags = {}) {
    this.record("counter", name, value, tags);
  }

  /**
   * Record a gauge metric
   */
  gauge(name, value, tags = {}) {
    this.record("gauge", name, value, tags);
  }

  /**
   * Record a metric
   * @private
   */
  record(type, name, value, tags) {
    const key = name + ":" + JSON.stringify(tags);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, { type, name, values: [], tags });
    }
    this.metrics.get(key).values.push(value);
  }

  /**
   * Flush metrics to logs
   */
  flush() {
    for (const [, metric] of this.metrics) {
      const value =
        metric.type === "timing"
          ? {
              min: Math.min(...metric.values),
              max: Math.max(...metric.values),
              avg: metric.values.reduce((a, b) => a + b, 0) / metric.values.length,
              count: metric.values.length,
            }
          : metric.values.reduce((a, b) => a + b, 0);

      log("metric", metric.name, {
        type: metric.type,
        value,
        tags: metric.tags,
      });
    }
    this.metrics.clear();
  }
}

/**
 * Create a request context with tracking information
 */
export function createRequestContext(request) {
  const url = new URL(request.url);
  return {
    requestId: crypto.randomUUID(),
    method: request.method,
    path: url.pathname,
    userAgent: request.headers.get("user-agent") || "unknown",
    cfRay: request.headers.get("cf-ray") || "unknown",
    cfCountry: request.headers.get("cf-ipcountry") || "unknown",
  };
}

/**
 * Track errors for alerting
 * @private
 */
function trackError(message, context) {
  const now = Date.now();

  // Clean old errors outside the window
  alertState.recentErrors = alertState.recentErrors.filter(
    (e) => now - e.timestamp < alertState.errorWindowMs
  );

  // Add new error
  alertState.recentErrors.push({
    timestamp: now,
    message,
    context,
  });

  // Check if we should trigger an alert
  checkAndTriggerAlert();
}

/**
 * Check alert thresholds and trigger alert if needed
 * @private
 */
function checkAndTriggerAlert() {
  const now = Date.now();

  // Respect alert cooldown
  if (now - alertState.lastAlertTime < alertState.alertCooldownMs) {
    return;
  }

  const errorCount = alertState.recentErrors.length;

  // Check error count threshold
  if (errorCount >= ALERT_THRESHOLDS.errorCount) {
    triggerAlert("high_error_count", {
      errorCount,
      threshold: ALERT_THRESHOLDS.errorCount,
      window: alertState.errorWindowMs,
    });
    return;
  }

  // Check error rate (at minimum 10 requests to avoid false positives)
  const totalRequests = businessMetrics.createAttempts + businessMetrics.readAttempts;
  const totalFailures = businessMetrics.createFailures + businessMetrics.readFailures;

  if (totalRequests >= 10) {
    const errorRate = totalFailures / totalRequests;
    if (errorRate >= ALERT_THRESHOLDS.errorRate) {
      triggerAlert("high_error_rate", {
        errorRate: (errorRate * 100).toFixed(2) + "%",
        failures: totalFailures,
        total: totalRequests,
      });
    }
  }
}

/**
 * Global env reference for webhook URL (set via setAlertEnv)
 */
let alertEnv = null;

/**
 * Set the environment for alert webhook
 * Call this from your worker to enable webhook alerts
 */
export function setAlertEnv(env) {
  alertEnv = env;
}

/**
 * Trigger an alert
 * @private
 */
async function triggerAlert(type, details) {
  alertState.lastAlertTime = Date.now();

  log("alert", `Alert triggered: ${type}`, details);

  // Send to webhook if configured
  await sendAlertToWebhook(type, details);
}

/**
 * Send alert to configured webhook (Slack, Discord, PagerDuty, etc.)
 * @private
 */
async function sendAlertToWebhook(type, details) {
  const webhookUrl = alertEnv?.ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    log("debug", "No ALERT_WEBHOOK_URL configured, skipping webhook notification");
    return;
  }

  try {
    const payload = buildWebhookPayload(type, details, webhookUrl);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      log("warn", "Failed to send alert to webhook", {
        status: response.status,
        statusText: response.statusText,
      });
    } else {
      log("info", "Alert sent to webhook successfully", { type });
    }
  } catch (error) {
    log("warn", "Error sending alert to webhook", {
      error: error.message,
    });
  }
}

/**
 * Build webhook payload based on webhook type (auto-detect Slack, Discord, or generic)
 * @private
 */
function buildWebhookPayload(type, details, webhookUrl) {
  const timestamp = new Date().toISOString();
  const alertTitle = `Alert: ${type.replace(/_/g, " ").toUpperCase()}`;
  const environment = alertEnv?.ENVIRONMENT || "unknown";

  // Slack webhook format
  if (webhookUrl.includes("hooks.slack.com")) {
    return {
      text: alertTitle,
      attachments: [
        {
          color: type.includes("error") ? "danger" : "warning",
          title: alertTitle,
          fields: [
            {
              title: "Environment",
              value: environment,
              short: true,
            },
            {
              title: "Timestamp",
              value: timestamp,
              short: true,
            },
            {
              title: "Details",
              value: "```" + JSON.stringify(details, null, 2) + "```",
              short: false,
            },
          ],
          footer: "volatile.sh monitoring",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  // Discord webhook format
  if (webhookUrl.includes("discord.com/api/webhooks")) {
    return {
      content: alertTitle,
      embeds: [
        {
          title: alertTitle,
          color: type.includes("error") ? 0xff0000 : 0xffaa00,
          fields: [
            {
              name: "Environment",
              value: environment,
              inline: true,
            },
            {
              name: "Timestamp",
              value: timestamp,
              inline: true,
            },
            {
              name: "Details",
              value: "```json\n" + JSON.stringify(details, null, 2) + "\n```",
              inline: false,
            },
          ],
          footer: {
            text: "volatile.sh monitoring",
          },
        },
      ],
    };
  }

  // PagerDuty Events API v2 format
  if (webhookUrl.includes("events.pagerduty.com")) {
    return {
      routing_key: alertEnv?.PAGERDUTY_ROUTING_KEY || "",
      event_action: "trigger",
      dedup_key: `volatile-sh-${type}-${environment}`,
      payload: {
        summary: alertTitle,
        severity: type.includes("error") ? "critical" : "warning",
        source: `volatile.sh-${environment}`,
        timestamp: timestamp,
        custom_details: details,
      },
    };
  }

  // Generic webhook format
  return {
    type: "alert",
    alertType: type,
    title: alertTitle,
    environment: environment,
    timestamp: timestamp,
    details: details,
    source: "volatile.sh",
  };
}

/**
 * Track business metrics
 */
export function trackMetric(operation, status) {
  switch (operation) {
    case "create":
      businessMetrics.createAttempts++;
      if (status === "success") {
        businessMetrics.createSuccesses++;
      } else if (status === "failure") {
        businessMetrics.createFailures++;
      }
      break;
    case "read":
      businessMetrics.readAttempts++;
      if (status === "success") {
        businessMetrics.readSuccesses++;
      } else if (status === "failure") {
        businessMetrics.readFailures++;
      }
      break;
  }
}

/**
 * Get current business metrics
 */
export function getBusinessMetrics() {
  const uptime = Date.now() - businessMetrics.lastReset;

  return {
    create: {
      attempts: businessMetrics.createAttempts,
      successes: businessMetrics.createSuccesses,
      failures: businessMetrics.createFailures,
      successRate:
        businessMetrics.createAttempts > 0
          ? ((businessMetrics.createSuccesses / businessMetrics.createAttempts) * 100).toFixed(2) +
            "%"
          : "N/A",
    },
    read: {
      attempts: businessMetrics.readAttempts,
      successes: businessMetrics.readSuccesses,
      failures: businessMetrics.readFailures,
      successRate:
        businessMetrics.readAttempts > 0
          ? ((businessMetrics.readSuccesses / businessMetrics.readAttempts) * 100).toFixed(2) + "%"
          : "N/A",
    },
    uptime: {
      ms: uptime,
      seconds: Math.floor(uptime / 1000),
      formatted: formatDuration(uptime),
    },
    errors: {
      recentCount: alertState.recentErrors.length,
      windowMs: alertState.errorWindowMs,
    },
  };
}

/**
 * Format duration in human-readable format
 * @private
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Reset business metrics (for testing or manual reset)
 */
export function resetMetrics() {
  businessMetrics.createAttempts = 0;
  businessMetrics.createSuccesses = 0;
  businessMetrics.createFailures = 0;
  businessMetrics.readAttempts = 0;
  businessMetrics.readSuccesses = 0;
  businessMetrics.readFailures = 0;
  businessMetrics.lastReset = Date.now();
  alertState.recentErrors = [];
}
