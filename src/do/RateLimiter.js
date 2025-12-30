export class RateLimiter {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/check" && request.method === "POST") {
      return this.check(request);
    }
    return new Response("Not found", { status: 404 });
  }

  async check(request) {
    const { key, limit, windowMs } = await request.json();
    if (typeof key !== "string" || !key) return json({ allowed: false, error: "BAD_KEY" }, 400);

    const now = Date.now();
    const max = Number.isFinite(Number(limit)) ? Number(limit) : 0;
    const window = Number.isFinite(Number(windowMs)) ? Number(windowMs) : 0;
    if (max <= 0 || window <= 0) return json({ allowed: false, error: "BAD_LIMIT" }, 400);

    const entry = await this.storage.get(key);
    let count = entry?.count || 0;
    let resetAt = entry?.resetAt || 0;

    if (!resetAt || now >= resetAt) {
      count = 0;
      resetAt = now + window;
    }

    count += 1;
    const allowed = count <= max;
    const remaining = Math.max(0, max - count);

    await this.storage.put(key, { count, resetAt }, { expiration: Math.ceil(resetAt / 1000) });

    return json({ allowed, limit: max, remaining, resetAt, count }, allowed ? 200 : 429);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
