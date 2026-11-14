// probe-trips-w1.1-hunt-6.mts — W1.1a hunter: cost of one public request (throughput per page kind, fresh connections) + payload weight
import { boot, cleanup, freshIp, kind, line, mkDep, mkProd, mkTenant, mkUnit, pmap, req, STAMP, sweepStale, ymdAt, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-6");
const tally = (rs: Resp[]) => { const m: Record<string, number> = {}; for (const r of rs) m[kind(r)] = (m[kind(r)] ?? 0) + 1; return JSON.stringify(m); };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return (s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(0); };
try {
  await sweepStale();
  const A = await mkTenant("a", "ACTIVE", "Hunt Cost Shop");
  const uA = await mkUnit(A.id, "a");
  const pA = await mkProd("A", A.id, uA);
  for (const add of [2, 3, 4, 5, 6]) { const d = new Date(Date.now() + add * 86_400_000); d.setUTCHours(1, 0, 0, 0); await mkDep(pA, ymdAt(d, 420), d, { sold: add }); }
  const PA = `/book/${A.slug}/t/${pA.slug}`;
  await req(PA, { ip: freshIp() });
  const N = 200;
  const out: Record<string, number> = {};
  for (const [name, path] of [["missing shop (404)", () => `/book/w11hunt-none-${STAMP}`], ["missing product (404)", () => `/book/${A.slug}/t/nope`], ["shop index", () => `/book/${A.slug}`], ["product page", () => PA], ["product page, month without departures", () => `${PA}?m=2027-05`]] as const) {
    const s = Date.now();
    const rs = await pmap(Array.from({ length: N }, () => freshIp()), N, (ip) => req(path(), { ip, fresh: true }));
    const wall = Date.now() - s;
    out[name] = wall;
    const bytes = rs.reduce((a, r) => a + Buffer.byteLength(r.body), 0) / rs.length;
    console.log(`  INFO  ${N} parallel fresh clients · ${name}: ${tally(rs)} · wall ${wall} ms (${(N / (wall / 1000)).toFixed(1)} req/s) · p50 ${pct(rs.map((r) => r.ms), 0.5)} p95 ${pct(rs.map((r) => r.ms), 0.95)} ms · avg body ${(bytes / 1024).toFixed(0)} KB`);
    line(`COST ${name} errors (fresh connections)`, "0 connection errors / 5xx", `${rs.filter((r) => r.err || r.status >= 500).length}`, rs.every((r) => !r.err && r.status < 500));
  }
  const ratio = (out["product page"] ?? 0) / Math.max(1, out["missing shop (404)"] ?? 1);
  line("COST product vs cheapest", "a public page that any header-rotating sender can request without limit should not cost far more than a 404", `product page wall ${out["product page"]} ms vs 404 ${out["missing shop (404)"]} ms (×${ratio.toFixed(1)}) for ${N} parallel`, ratio < 3);
  const one = await req(PA, { ip: freshIp(), headers: { "accept-encoding": "identity" } });
  const msgs = /"messages":\{/.test(one.body.replace(/\\"/g, '"'));
  console.log(`  INFO  product page weight: ${(Buffer.byteLength(one.body) / 1024).toFixed(0)} KB uncompressed · whole-app i18n message catalogue inlined by the root layout: ${msgs} (staff-side strings such as settings labels are shipped to anonymous visitors; pre-existing root layout, not W1.1a code)`);
} finally {
  await cleanup();
}
