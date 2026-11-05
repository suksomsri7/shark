import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
const [DIST, PORT] = process.argv.slice(2);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon" };
createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  let f = join(DIST, decodeURIComponent(u.pathname));
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }); res.end(readFileSync(f));
}).listen(Number(PORT), "127.0.0.1");
