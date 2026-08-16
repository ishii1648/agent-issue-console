import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_ISSUE_CONSOLE_HTML = readFileSync(
  resolve(fileURLToPath(new URL("..", import.meta.url)), "src/generated/app.txt"),
  "utf8",
);

const port = Number(process.env.AIC_PREVIEW_PORT ?? 8787);
createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:",
  });
  response.end(AGENT_ISSUE_CONSOLE_HTML);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Agent Issue Console preview: http://127.0.0.1:${port}\n`);
});
