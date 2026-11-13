// probe-trips-w1.1-hunt-2.mts — W1.1a hunter: rate gate over HTTP · which headers mint buckets · miss bucket · view counter (HTTP, QC server)
import { boot, bucketCount, cleanup, clientKeyOf, freshIp, kind, line, median, mkDep, mkProd, mkTenant, mkUnit, opsCount, pmap, q, req, statRows, STAMP, sweepStale, titlesAll, useIp, viewsOf, ymdAt, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

boot("probe-w1.1-hunt-2");
const tally = (rs: Resp[]) => { const m: Record<string, number> = {}; for (const r of rs) m[kind(r)] = (m[kind(r)] ?? 0) + 1; return JSON.stringify(m); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  await sweepStale();
  const ops0 = await opsCount();
  const A = await mkTenant("a", "ACTIVE", "Hunt Rate Shop");
  const B = await mkTenant("b", "ACTIVE", "Hunt Other Shop");
  const uA = await mkUnit(A.id, "a");
  const uNY = await mkUnit(A.id, "ny", { settings: { timezone: "America/New_York" } });
  const uB = await mkUnit(B.id, "b");
  const pA = await mkProd("A", A.id, uA);
  const pNY = await mkProd("NY", A.id, uNY);
  const pB = await mkProd("B", B.id, uB);
  const draft = await mkProd("DRAFT", A.id, uA, { status: "DRAFT" });
  const d1 = new Date(Date.now() + 5 * 86_400_000); d1.setUTCHours(1, 0, 0, 0);
  await mkDep(pA, ymdAt(d1, 420), d1, { sold: 3 });
  const PA = `/book/${A.slug}/t/${pA.slug}`;
  const IDX = `/book/${A.slug}`;
  const bookKeys = async () => new Set((await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`])).map((r) => r.key.split(":").pop() ?? ""));

  // ── A. which header decides the bucket ──
  console.log("\n== A. header → bucket ==");
  const sock = [clientKeyOf("127.0.0.1"), clientKeyOf("::1")];
  const base = "100.88.7.9"; useIp(base); for (const x of ["9.9.9.9", "8.8.4.4", "7.7.7.7", "6.6.6.6", "5.5.5.5", "2001:db8:1:2::1", "2001:db8:1:3::1", "64:ff9b::6458:709", "::100.88.7.9"]) useIp(x);
  const cases: [string, Record<string, string | string[]>, string | null, string][] = [
    ["XFF plain", { "x-forwarded-for": base }, base, "baseline"],
    ["XFF ip:port", { "x-forwarded-for": `${base}:5555` }, base, "same bucket"],
    ["XFF ::ffff: mapped", { "x-forwarded-for": `::ffff:${base}` }, base, "same bucket"],
    ["XFF [::FFFF:ip]:443 upper", { "x-forwarded-for": `[::FFFF:${base}]:443` }, base, "same bucket"],
    ["XFF leading zero octet", { "x-forwarded-for": "100.088.7.9" }, base, "same bucket"],
    ["XFF padded spaces", { "x-forwarded-for": `   ${base}  ` }, base, "same bucket"],
    ["XFF v6 a", { "x-forwarded-for": "2001:db8:1:2::1" }, "2001:db8:1:2::1", "v6 /64"],
    ["XFF v6 same /64, other host, upper", { "x-forwarded-for": "2001:DB8:1:2:FFFF:1:2:3" }, "2001:db8:1:2::1", "same /64 bucket"],
    ["XFF v6 zone id", { "x-forwarded-for": "2001:db8:1:2::77%eth0" }, "2001:db8:1:2::1", "same /64 bucket"],
    ["XFF v6 next /64", { "x-forwarded-for": "2001:db8:1:3::1" }, "2001:db8:1:3::1", "new bucket (inherent)"],
    ["XFF list real-last (spoofed first)", { "x-forwarded-for": `9.9.9.9, ${base}` }, base, "trusted hop = last entry ⇒ same bucket"],
    ["XFF two header lines", { "x-forwarded-for": ["6.6.6.6", base] }, base, "trusted hop = last entry ⇒ same bucket"],
    ["X-Real-IP spoof + XFF real", { "x-real-ip": "8.8.4.4", "x-forwarded-for": base }, base, "client header must not override"],
    ["x-vercel-forwarded-for spoof + XFF real", { "x-vercel-forwarded-for": "5.5.5.5", "x-forwarded-for": base }, base, "client header must not override"],
    ["Forwarded: for= + XFF real", { forwarded: "for=7.7.7.7", "x-forwarded-for": base }, base, "ignored"],
    ["CF-Connecting-IP + True-Client-IP + XFF real", { "cf-connecting-ip": "7.7.7.7", "true-client-ip": "7.7.7.7", "x-forwarded-for": base }, base, "ignored"],
    ["no IP header at all", {}, null, "socket address or closed"],
    ["XFF garbage 'unknown'", { "x-forwarded-for": "unknown" }, null, "closed (RATE page, no bucket)"],
    ["XFF empty + nothing", { "x-forwarded-for": "" }, null, "socket/closed"],
    ["X-Real-IP garbage + XFF valid", { "x-real-ip": "not-an-ip", "x-forwarded-for": base }, null, "closed"],
    ["XFF decimal int", { "x-forwarded-for": "1683490569" }, null, "closed"],
  ];
  const keyName = new Map<string, string>();
  for (const ip of [base, "9.9.9.9", "8.8.4.4", "7.7.7.7", "6.6.6.6", "5.5.5.5", "2001:db8:1:2::1", "2001:db8:1:3::1", "127.0.0.1", "::1"]) { const k = clientKeyOf(ip); if (k) keyName.set(k, ip); }
  for (const [name, headers, expectIp, note] of cases) {
    const before = await q<{ key: string; count: number }>(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`]);
    const r = await req(IDX, { headers });
    const after = await q<{ key: string; count: number }>(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`]);
    const bm = new Map(before.map((x) => [x.key, Number(x.count)]));
    const touched = after.filter((x) => bm.get(x.key) !== Number(x.count)).map((x) => keyName.get(x.key.split(":").pop() ?? "") ?? "(other key)");
    const got = touched.length ? touched.join(",") : "(no bucket)";
    const exp = expectIp === null ? null : expectIp;
    const okFlag = exp === null ? true : got === exp;
    line(`HDR ${name}`, `${note}${exp ? ` → bucket of ${exp}` : ""}`, `${kind(r)} bucket of ${got}`, okFlag);
  }
  console.log(`  (socket keys known: 127.0.0.1 / ::1 = ${sock.map((k) => (k ?? "").slice(0, 10)).join(" / ")})`);

  // ── B. read limit ──
  console.log("\n== B. read limit (120 / 60 s / shop / client) ==");
  const ipR = freshIp();
  const t0 = Date.now();
  const rs = await pmap(Array.from({ length: 130 }, (_, i) => i), 8, () => req(IDX, { ip: ipR }));
  const okN = rs.filter((r) => kind(r) === "200/INDEX").length;
  line("READ-LIMIT", "exactly 120 pages then limited", `${tally(rs)} in ${Date.now() - t0} ms`, okN === 120);
  const lim = rs.find((r) => kind(r).endsWith("RATE")) as Resp;
  if (lim) {
    console.log(`  INFO  limited response: status=${lim.status} retry-after=${String(lim.headers["retry-after"] ?? "(none)")} cache-control=${String(lim.headers["cache-control"])} len=${lim.body.length} titles=${JSON.stringify(titlesAll(lim))}`);
    line("LIMITED-STATUS", "HTTP 429 (+ Retry-After) for a throttled client", `${lim.status}, retry-after ${String(lim.headers["retry-after"] ?? "(none)")}`, lim.status === 429);
    line("LIMITED-NO-SHOP-DATA", "limited page carries no shop data (brief §6)", `titles ${JSON.stringify(titlesAll(lim))} · shopNameInBody=${lim.body.includes("Hunt Rate Shop")}`, !lim.body.includes("Hunt Rate Shop"));
    const tl: number[] = [], tn: number[] = [];
    for (let i = 0; i < 15; i++) { tl.push((await req(IDX, { ip: ipR })).ms); tn.push((await req(IDX, { ip: freshIp() })).ms); }
    console.log(`  INFO  median ms: limited client ${median(tl).toFixed(1)} vs normal first view ${median(tn).toFixed(1)} (limited requests still resolve shop + run metadata catalogue reads + 1 gate write)`);
    const other = await req(`/book/${B.slug}`, { ip: ipR });
    line("LIMIT-PER-SHOP", "limit on shop A does not block shop B", kind(other), kind(other) === "200/INDEX");
    const prodLim = await req(PA, { ip: ipR });
    const v0 = await viewsOf(uA);
    line("LIMITED-NOT-COUNTED", "limited client's product request: RATE page, no view counted, no dedupe bucket", `${kind(prodLim)} views=${v0} viewBuckets=${await bucketCount(`trips:view:${uA}:%${clientKeyOf(ipR)}`)}`, kind(prodLim).endsWith("RATE") && v0 === 0);
  }
  // targeted lock-out through the trusted header
  const victim = freshIp();
  await pmap(Array.from({ length: 121 }, (_, i) => i), 8, () => req(IDX, { headers: { "x-forwarded-for": victim } }));
  const vr = await req(IDX, { ip: victim });
  line("LOCKOUT-VICTIM", "a third party cannot exhaust another visitor's bucket", `attacker sent 121 requests with X-Forwarded-For=<victim>; victim's own first request → ${kind(vr)}`, kind(vr) === "200/INDEX");
  // bypass: rotate header
  const rot = await pmap(Array.from({ length: 150 }, (_, i) => i), 8, () => req(IDX, { ip: freshIp() }));
  line("LIMIT-BYPASS-ROTATE", "one sender cannot exceed 120/min by rotating a client-supplied header", `150 requests with rotating X-Forwarded-For → ${tally(rot)}`, rot.filter((r) => kind(r) === "200/INDEX").length <= 120);

  // ── C. miss bucket ──
  console.log("\n== C. miss bucket (30 / 10 min / client) ==");
  const ipM = freshIp();
  const ms: Resp[] = [];
  for (let i = 0; i < 34; i++) ms.push(await req(i % 2 ? `/book/w11hunt-nope-${STAMP}-${i}` : `/book/${A.slug}/t/nope-${i}`, { ip: ipM }));
  line("MISS-LIMIT", "30 not-found then limited", tally(ms), ms.filter((r) => r.status === 404).length === 30 && ms.slice(30).every((r) => kind(r).endsWith("RATE")));
  const afterMiss = await req(IDX, { ip: ipM });
  const afterMissP = await req(PA, { ip: ipM });
  line("MISS-NO-LOCKOUT", "exhausted miss bucket does not block real pages of the same client", `${kind(afterMiss)} · ${kind(afterMissP)}`, kind(afterMiss) === "200/INDEX" && kind(afterMissP) === "200/PRODUCT");
  const dr = await req(`/book/${A.slug}/t/${draft.slug}`, { ip: ipM });
  const mr = await req(`/book/${A.slug}/t/nope-zz`, { ip: ipM });
  line("MISS-LIMITED-ORACLE", "after miss limit: draft and missing look the same", `${kind(dr)} vs ${kind(mr)}`, kind(dr) === kind(mr));
  console.log(`  INFO  miss-limited response status=${(ms[33] as Resp).status} (a guessed slug now answers 200 instead of 404)`);

  // ── D. view counter ──
  console.log("\n== D. view counter ==");
  const base0 = await viewsOf(uA);
  const ip1 = freshIp();
  for (let i = 0; i < 60; i++) await req(PA, { ip: ip1 });
  let v = await viewsOf(uA);
  line("VIEW-REFRESH-60", "+1", `+${v - base0}`, v - base0 === 1);
  let prev = v;
  const ip2 = freshIp();
  const par = await pmap(Array.from({ length: 100 }, (_, i) => i), 100, () => req(PA, { ip: ip2 }));
  v = await viewsOf(uA);
  line("VIEW-PARALLEL-100", "+1 (one client, 100 parallel first views)", `+${v - prev} · ${tally(par)}`, v - prev === 1);
  prev = v;
  const sp = await pmap(Array.from({ length: 60 }, (_, i) => i), 10, () => req(PA, { ip: freshIp() }));
  v = await viewsOf(uA);
  line("VIEW-SPOOF-60", "one sender cannot add 60 views with 60 requests", `+${v - prev} views for 60 requests (${tally(sp)}) ⇒ 1 request per fake view`, v - prev < 60);
  prev = v;
  const probes: [string, string, Parameters<typeof req>[1], number][] = [
    ["HEAD", PA, { method: "HEAD" }, 0],
    ["POST", PA, { method: "POST", body: "x=1", headers: { "content-type": "application/x-www-form-urlencoded" } }, 0],
    ["RSC fetch (?_rsc + RSC:1)", `${PA}?_rsc=abcde`, { headers: { rsc: "1" } }, 1],
    ["router prefetch (RSC:1 + Next-Router-Prefetch:1)", `${PA}?_rsc=abcdf`, { headers: { rsc: "1", "next-router-prefetch": "1" } }, 0],
    ["browser speculative prefetch (Sec-Purpose: prefetch)", PA, { headers: { "sec-purpose": "prefetch;prerender", purpose: "prefetch" } }, 0],
    ["crawler UA (Googlebot)", PA, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } }, 0],
    ["link-preview bot (facebookexternalhit)", PA, { headers: { "user-agent": "facebookexternalhit/1.1" } }, 0],
    ["not-found slug", `/book/${A.slug}/t/nope-view`, {}, 0],
    ["draft slug", `/book/${A.slug}/t/${draft.slug}`, {}, 0],
    ["shop index", IDX, {}, 0],
    ["?a=garbage long", `${PA}?a=${"A".repeat(5000)}`, {}, 1],
    ["?a=valid-shape unknown code", `${PA}?a=AGENT_${STAMP}`, {}, 1],
    ["?a=other shop's unit id &s=x", `${PA}?a=${encodeURIComponent(uB)}&s=${encodeURIComponent("'; DROP TABLE x;--")}`, {}, 1],
    ["?a with NUL/control", `${PA}?a=%00%0d%0a%1b&s=%00`, {}, 1],
    ["?a repeated", `${PA}?a=one&a=two`, {}, 1],
  ];
  for (const [name, path, o, expect] of probes) {
    const r = await req(path, { ...o, ip: freshIp() });
    v = await viewsOf(uA);
    const okFlag = r.status < 500 && v - prev === expect;
    line(`VIEW ${name}`, `+${expect} view, no 5xx`, `+${v - prev} · ${kind(r)}${r.status >= 300 && r.status < 400 ? ` → ${String(r.headers.location)}` : ""}`, okFlag);
    prev = v;
  }
  const rowsA = await statRows(uA);
  const bkkDay = ymdAt(new Date(), 420);
  line("STAT-ROWS", `exactly 1 TripLinkStat row for the unit (day ${bkkDay}, WEB, link null) — no attacker-keyed rows`, JSON.stringify(rowsA), rowsA.length === 1 && rowsA[0]?.day === bkkDay && rowsA[0]?.channel === "WEB" && rowsA[0]?.linkId === null);
  const vb = await bucketCount(`trips:view:${uA}:%`);
  const vbOdd = await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1 AND key NOT LIKE $2 LIMIT 3`, [`trips:view:${uA}:%`, `trips:view:${uA}:${bkkDay}:WEB:-:pc_%`]);
  line("VIEW-BUCKET-KEYS", "dedupe buckets keyed only by (unit, day, WEB, '-', client) — one per counted client", `${vb} buckets for ${v} views · odd keys: ${JSON.stringify(vbOdd.map((x) => x.key.slice(0, 80)))}`, vbOdd.length === 0 && vb === v);
  // time zone of the day
  const rNY = await req(`/book/${A.slug}/t/${pNY.slug}`, { ip: freshIp() });
  const rowsNY = await statRows(uNY);
  const nyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  line("STAT-DAY-TZ", `New York unit counts on its local day ${nyDay} (Bangkok day is ${bkkDay})`, `${kind(rNY)} ${JSON.stringify(rowsNY)}`, rowsNY.length === 1 && rowsNY[0]?.day === nyDay);
  console.log(`  INFO  product B untouched: views(uB)=${await viewsOf(uB)} (expected 0) · pB slug under shop A → ${kind(await req(`/book/${A.slug}/t/${pB.slug}`, { ip: freshIp() }))}`);

  await sleep(1500);
  const ops1 = await opsCount();
  line("OPS", "no trips.public OpsEvent (limiter never reported down)", `+${ops1 - ops0}`, ops1 === ops0);
  console.log(`  INFO  rows this probe created outside TripLinkStat: ChatRateBucket trips:book:<A> = ${await bucketCount(`trips:book:${A.id}:%`)}, trips:view:<uA> = ${vb} (all removed in cleanup)`);
} finally {
  await cleanup();
}
