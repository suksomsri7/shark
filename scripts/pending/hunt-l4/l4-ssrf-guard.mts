// L4 probe (read-only, no DB writes): SSRF guard of outgoing webhooks — IPv6 literal forms + redirect following
import http from "node:http";
import { webhookTargetProblem } from "@/lib/webhooks/service";

const urls = [
  "http://127.0.0.1/", // control: must be blocked
  "http://[::1]/", // control
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:7f00:1]/",
  "http://[::ffff:a9fe:a9fe]/latest/meta-data/", // 169.254.169.254
  "http://[::ffff:0a00:0001]/", // 10.0.0.1
  "http://[::127.0.0.1]/", // IPv4-compatible
  "http://[64:ff9b::7f00:1]/", // NAT64
  "http://[fec0::1]/", // site-local (deprecated)
  "http://0x7f000001/",
  "http://2130706433/",
  "http://127.1/",
];
for (const u of urls) {
  let host = "";
  try { host = new URL(u).hostname; } catch { host = "(bad)"; }
  const p = await webhookTargetProblem(u, { lookup: async () => null });
  console.log(`${p ? "BLOCKED" : "ALLOWED"}  ${u}  → hostname=${host}`);
}

// does Node fetch actually reach loopback through the IPv4-mapped literal? (local listener only)
const srv = http.createServer((req, res) => { res.writeHead(200); res.end("hit " + req.url); });
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
const port = (srv.address() as { port: number }).port;
try {
  const r = await fetch(`http://[::ffff:7f00:1]:${port}/probe`, { signal: AbortSignal.timeout(3000) });
  console.log(`fetch via [::ffff:7f00:1]:${port} → ${r.status} ${await r.text()}`);
} catch (e) {
  console.log(`fetch via mapped literal failed: ${(e as Error).message}`);
}
// redirect follow: default fetch (as in webhooks/service deliver) follows 302 to loopback
const srv2 = http.createServer((req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${port}/internal-after-redirect` }); res.end(); });
await new Promise<void>((r) => srv2.listen(0, "127.0.0.1", () => r()));
const port2 = (srv2.address() as { port: number }).port;
const r2 = await fetch(`http://127.0.0.1:${port2}/start`, { method: "POST", body: "{}", signal: AbortSignal.timeout(3000) });
console.log(`default fetch POST → 302 → ${r2.status} ${await r2.text()} (redirected=${r2.redirected})`);
srv.close(); srv2.close();
process.exit(0);
