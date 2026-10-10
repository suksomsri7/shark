// hunt-54a probe — pinned transport alone (skips targetProblem) + rebinding host through outboundFetch
import net from "node:net";
process.env.APP_ENV = "production";
delete process.env.WEBHOOK_ALLOW_PRIVATE;
const { pinnedFetch, outboundFetch } = await import("@/lib/webhooks/service");
let hits = 0;
const mk = (host: string) => new Promise<number>((res) => {
  const s = net.createServer((c) => { hits++; c.end("HTTP/1.1 302 Found\r\nlocation: http://169.254.169.254/\r\ncontent-length: 0\r\n\r\n"); });
  s.listen(0, host, () => res((s.address() as net.AddressInfo).port));
});
const p4 = await mk("127.0.0.1");
const p6 = await mk("::1");
for (const t of [`http://127.0.0.1.nip.io:${p4}/`, `https://127.0.0.1.nip.io:${p4}/`, `http://localtest.me:${p6}/`, `http://localhost:${p4}/`, `http://[::ffff:7f00:1]:${p4}/`]) {
  const b = hits; let r = "";
  try { const res = await pinnedFetch(t, { method: "GET", timeoutMs: 3000 }); r = `status=${res.status}`; } catch (e) { r = `err:${(e as Error).name}:${String((e as Error).message).slice(0, 30)}`; }
  console.log(`${hits > b ? "HIT " : "ok  "} pinned ${t} → ${r}`);
}
// rebinding: rbndr alternates 127.0.0.1 / 93.184.215.14 per query (TTL 0)
let passed = 0, blocked = 0, hitRb = 0;
for (let i = 0; i < 12; i++) {
  const b = hits;
  try { const res = await outboundFetch(`http://7f000001.5db8d70e.rbndr.us:${p4}/`, { method: "GET", timeoutMs: 2500 }); passed++; void res; } catch { blocked++; }
  if (hits > b) hitRb++;
}
console.log(`rebind: passed=${passed} blocked/failed=${blocked} loopbackHits=${hitRb}`);
console.log("TOTAL hits", hits);
process.exit(0);
