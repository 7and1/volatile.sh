import { handleApi } from "./api.js";
import { json, securityHeaders, withHeaders } from "./http.js";
import { generateSecurityTxt } from "./security.js";

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  // Serve security.txt
  if (url.pathname === "/.well-known/security.txt") {
    const content = generateSecurityTxt(env);
    return securityHeaders(
      new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      })
    );
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, env, url);
  }

  // Serve static assets (Cloudflare Workers Static Assets).
  if (env?.ASSETS && typeof env.ASSETS.fetch === "function") {
    // Some static backends (e.g. disk directory service bindings) don't map `/`
    // automatically to `/index.html`. Normalize for consistent behavior.
    let req = request;
    if (
      url.pathname === "/" &&
      (request.method === "GET" || request.method === "HEAD") &&
      wantsHtml(request)
    ) {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      indexUrl.search = "";
      req = new Request(indexUrl, request);
    }

    let res = await env.ASSETS.fetch(req);

    // SPA-ish fallback: serve the homepage for unknown HTML routes.
    if (
      res.status === 404 &&
      (request.method === "GET" || request.method === "HEAD") &&
      wantsHtml(request)
    ) {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      indexUrl.search = "";
      res = await env.ASSETS.fetch(new Request(indexUrl, request));
    }

    return securityHeaders(res);
  }

  // Fallback (should only happen in misconfigured environments).
  return securityHeaders(
    withHeaders(json({ error: "NOT_FOUND" }, { status: 404 }), {
      "Content-Type": "application/json; charset=utf-8",
    })
  );
}

function wantsHtml(request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") || accept.includes("*/*");
}
