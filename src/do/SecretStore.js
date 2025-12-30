export class SecretStore {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/store" && request.method === "POST") {
      return this.store(request);
    }

    if (url.pathname === "/read" && request.method === "GET") {
      return this.read();
    }

    if (url.pathname === "/validate" && request.method === "GET") {
      return this.validate();
    }

    return new Response("Not found", { status: 404 });
  }

  async store(request) {
    const { encrypted, iv, expiresAt } = await request.json();
    const createdAt = Date.now();

    const res = await this.storage.transaction(async (txn) => {
      const existing = await txn.get("secret");
      if (existing) return { status: 409, body: { error: "Secret ID collision" } };
      await txn.put("secret", { encrypted, iv, expiresAt, createdAt });
      return { status: 200, body: { ok: true } };
    });

    if (res.status === 409) return json(res.body, 409);

    await this.state.storage.setAlarm(expiresAt);
    return json(res.body, 200);
  }

  async read() {
    const res = await this.storage.transaction(async (txn) => {
      const secret = await txn.get("secret");
      if (!secret)
        return {
          status: 404,
          body: { error: "Secret not found or already read" },
        };

      if (Date.now() > secret.expiresAt) {
        await txn.delete("secret");
        return { status: 410, body: { error: "Secret expired" } };
      }

      await txn.delete("secret");
      return {
        status: 200,
        body: { encrypted: secret.encrypted, iv: secret.iv },
      };
    });

    if (res.status === 200) {
      await this.state.storage.deleteAlarm();
    }

    return json(res.body, res.status);
  }

  async alarm() {
    await this.storage.delete("secret");
  }

  async validate() {
    const secret = await this.storage.get("secret");

    if (!secret) {
      return json({ error: "Secret not found or already burned" }, 404);
    }

    const now = Date.now();
    if (now > secret.expiresAt) {
      await this.storage.delete("secret");
      return json({ error: "Secret expired", status: "expired" }, 410);
    }

    const ttl = secret.expiresAt - now;
    return json({
      status: "ready",
      createdAt: secret.createdAt,
      expiresAt: secret.expiresAt,
      ttl,
    });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
