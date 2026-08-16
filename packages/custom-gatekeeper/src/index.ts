export * from "./custom.js";
export * from "./core-client.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ service: "agent-issue-console", status: "ok" });
    }
    const { AGENT_ISSUE_CONSOLE_HTML } = await import("./ui.js");
    return new Response(AGENT_ISSUE_CONSOLE_HTML, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  },
};
