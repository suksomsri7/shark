// hunt-54a probe — does pinnedFetch settle when the peer trickles a body forever / exceeds maxBytes?
import net from "node:net";
process.env.APP_ENV = "preview"; // pinned transport, private allowed ONLY for this local probe
process.env.WEBHOOK_ALLOW_PRIVATE = "1";
const { pinnedFetch } = await import("@/lib/webhooks/service");
const trickle = net.createServer((c) => {
  c.write("HTTP/1.1 200 OK\r\ncontent-length: 100000\r\n\r\n");
  const t = setInterval(() => { try { c.write("x"); } catch { clearInterval(t); } }, 200);
  c.on("close", () => clearInterval(t));
});
const big = net.createServer((c) => { c.write("HTTP/1.1 200 OK\r\n\r\n"); const t = setInterval(() => { try { c.write(Buffer.alloc(65536, 120)); } catch { clearInterval(t); } }, 5); c.on("close", () => clearInterval(t)); c.on("error", () => {}); });
const port = (s: net.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as net.AddressInfo).port)));
const pt = await port(trickle), pb = await port(big);
const race = (p: Promise<unknown>, ms: number) => Promise.race([p.then((r) => `settled:${(r as Response).status}`, (e) => `rejected:${(e as Error).message.slice(0, 40)}`), new Promise((r) => setTimeout(() => r(`HUNG>${ms}ms`), ms))]);
const t0 = Date.now();
console.log("trickle timeout=1500:", await race(pinnedFetch(`http://127.0.0.1:${pt}/`, { method: "GET", timeoutMs: 1500 }), 8000), Date.now() - t0, "ms");
const t1 = Date.now();
console.log("oversize maxBytes=1000 timeout=5000:", await race(pinnedFetch(`http://127.0.0.1:${pb}/`, { method: "GET", timeoutMs: 5000, maxBytes: 1000 }), 12000), Date.now() - t1, "ms");
process.exit(0);
