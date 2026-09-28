// hunt-54a probe — pinned outboundFetch vs loopback in "production" transport mode (no DB writes)
import net from "node:net";
process.env.APP_ENV = "production";
delete process.env.WEBHOOK_ALLOW_PRIVATE;
const { outboundFetch } = await import("@/lib/webhooks/service");
let hits = 0;
const mk = (host: string) => new Promise<number>((res) => {
  const s = net.createServer((c) => { hits++; c.end("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok"); });
  s.listen(0, host, () => res((s.address() as net.AddressInfo).port));
});
const p4 = await mk("127.0.0.1");
const p6 = await mk("::1");
const targets = [
  `http://127.0.0.1.nip.io:${p4}/`, `https://127.0.0.1.nip.io:${p4}/`, `http://localtest.me:${p6}/`,
  `http://[::1]:${p6}/`, `http://[::ffff:127.0.0.1]:${p4}/`, `http://0x7f.1:${p4}/`, `http://2130706433:${p4}/`,
  `http://127.1:${p4}/`, `http://0:${p4}/`, `http://[::]:${p6}/`, `http://①②⑦.0.0.1:${p4}/`, `http://127.0.0.1%2e:${p4}/`,
  `http://u:p@127.0.0.1.nip.io:${p4}/`, `http://0.0.0.0.nip.io:${p4}/`, `http://[0:0:0:0:0:ffff:7f00:1]:${p4}/`,
  `http://LOCALHOST.:${p4}/`, `http://127.0.0.1.:${p4}/`, `http://[::127.0.0.1]:${p4}/`,
];
for (const t of targets) {
  const before = hits;
  let r = "";
  try { const res = await outboundFetch(t, { method: "POST", body: "{}", timeoutMs: 3000 }); r = `status=${res.status}`; }
  catch (e) { r = `blocked:${(e as Error).name}:${String((e as Error).message).slice(0, 40)}`; }
  console.log(`${hits > before ? "HIT " : "ok  "} ${t} → ${r}`);
}
// public sanity (positive control)
try { const res = await outboundFetch("https://example.com/", { method: "GET", timeoutMs: 5000 }); console.log("public example.com status", res.status); } catch (e) { console.log("public FAIL", (e as Error).message); }
console.log("TOTAL loopback hits", hits);
process.exit(0);
