import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || "127.0.0.1";
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/mini-app-engine.mjs", ["mini-app-engine.mjs", "text/javascript; charset=utf-8"]],
  ["/mini-app-ui.mjs", ["mini-app-ui.mjs", "text/javascript; charset=utf-8"]],
  ["/mini-app-studio.mjs", ["mini-app-studio.mjs", "text/javascript; charset=utf-8"]],
  ["/app.css", ["app.css", "text/css; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/icon.svg", ["icon.svg", "image/svg+xml"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]]
]);

http.createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }
    const route = new URL(request.url, `http://${host}:${port}`).pathname;
    const file = files.get(route);
    if (!file) { response.writeHead(404); response.end("Not found"); return; }
    const body = await readFile(path.join(root, file[0]));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Content-Length": body.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500);
    response.end("Unable to load the prototype");
  }
}).listen(port, host, () => console.log(`SAATHI local prototype: http://${host}:${port}`));
