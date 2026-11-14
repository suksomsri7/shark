// probe-trips-w1.1-hunt-5.mts — W1.1a hunter: concurrency — 300 parallel product pages from distinct clients; fail-closed behaviour under load
import { boot, bucketCount, cleanup, freshIp, kind, line, mkDep, mkProd, mkTenant, mkUnit, opsCount, pmap, q, req, sweepStale, viewsOf, ymdAt, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-5");
const tally = (rs: Resp[]) => { const m: Record<string, number> = {}; for (const r of rs) m[kind(r)] = (m[kind(r)] ?? 0) + 1; return JSON.stringify(m); };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return (s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(0); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  await sweepStale();
  const ops0 = await opsCount();
  const t0 = new Date();
  const A = await mkTenant("a", "ACTIVE", "Hunt Storm Shop");
  const uA = await mkUnit(A.id, "a");
  const pA = await mkProd("A", A.id, uA);
  for (const add of [2, 3, 4, 5, 6]) { const d = new Date(Date.now() + add * 86_400_000); d.setUTCHours(1, 0, 0, 0); await mkDep(pA, ymdAt(d, 420), d, { sold: add }); }
  const PA = `/book/${A.slug}/t/${pA.slug}`;
  await req(PA, { ip: freshIp() }); // warm
  const v0 = await viewsOf(uA);

  for (const [name, n, conc] of [["storm-1 (300 parallel, distinct clients)", 300, 300], ["storm-2 (300 parallel, distinct clients, repeat)", 300, 300]] as const) {
    const before = await viewsOf(uA);
    const s = Date.now();
    const rs = await pmap(Array.from({ length: n }, () => freshIp()), conc, (ip) => req(PA, { ip }));
    const wall = Date.now() - s;
    await sleep(500);
    const added = (await viewsOf(uA)) - before;
    const good = rs.filter((r) => kind(r) === "200/PRODUCT").length;
    const rate = rs.filter((r) => kind(r).endsWith("RATE")).length;
    const bad = rs.filter((r) => r.status >= 500 || r.err).length;
    console.log(`  INFO  ${name}: ${tally(rs)} · wall ${wall} ms · latency p50 ${pct(rs.map((r) => r.ms), 0.5)} p95 ${pct(rs.map((r) => r.ms), 0.95)} max ${pct(rs.map((r) => r.ms), 1)} ms · views +${added}`);
    line(`STORM ${name} errors`, "0 errors / 5xx", `${bad}`, bad === 0);
    line(`STORM ${name} fail-closed`, "no first-time visitor is shown the 'too many requests' notice", `${rate} of ${n} fresh clients got the rate-limited page`, rate === 0);
    line(`STORM ${name} counter`, `views +${good} (= pages served; each client is new)`, `+${added}`, added === good);
  }
  // mixed: 150 same-client + 150 distinct on the index (bucket row contention)
  const ipS = freshIp();
  const mix = await pmap(Array.from({ length: 300 }, (_, i) => i), 300, (i) => req(i % 2 ? `/book/${A.slug}` : PA, { ip: i % 2 ? ipS : freshIp() }));
  const sameClient = mix.filter((_, i) => i % 2);
  console.log(`  INFO  mixed storm: all ${tally(mix)} · same-client index (150 parallel): ${tally(sameClient)}`);
  line("STORM mixed errors", "0 errors / 5xx", `${mix.filter((r) => r.status >= 500 || r.err).length}`, mix.every((r) => r.status < 500 && !r.err));
  line("STORM same-client limit under parallel", "≤ 120 index pages for one client in the window", `${sameClient.filter((r) => kind(r) === "200/INDEX").length} served`, sameClient.filter((r) => kind(r) === "200/INDEX").length <= 120);

  await sleep(2500);
  const ops = await q<{ level: string; source: string; message: string; detail: string | null; n: string }>(`SELECT level::text, source, message, detail, count(*)::text AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND (source LIKE 'trips.public%' OR source = 'rate-limit-db') GROUP BY 1,2,3,4`, [t0]);
  line("STORM ops", "no limiter-down OpsEvent", `${JSON.stringify(ops)} (trips.public total +${(await opsCount()) - ops0})`, ops.length === 0);
  const rows = await q<{ n: string }>(`SELECT count(*)::text AS n FROM "TripLinkStat" WHERE "unitId" = $1`, [uA]);
  line("STORM stat rows", "1 TripLinkStat row (no duplicates from racing upserts)", `${rows[0]?.n} row(s), views total ${await viewsOf(uA)} (start ${v0})`, rows[0]?.n === "1");
  console.log(`  INFO  buckets created: book ${await bucketCount(`trips:book:${A.id}:%`)} · view ${await bucketCount(`trips:view:${uA}:%`)} (removed in cleanup)`);
  const after = await req(PA, { ip: freshIp() });
  line("STORM recovery", "page healthy after the storm", `${kind(after)} ${after.ms.toFixed(0)} ms`, kind(after) === "200/PRODUCT");
} finally {
  await cleanup();
}
