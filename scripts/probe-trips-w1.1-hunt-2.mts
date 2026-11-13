// probe-trips-w1.1-hunt-2.mts — W1.1a hunter: rate gate over HTTP · which headers mint buckets · miss bucket · view counter (HTTP, QC server)
// post-review round (attacks unchanged, expectations follow the rulings):
//   X2(ข)  no IP header / loopback header on the production QC server ⇒ CLOSED (rate page, no bucket) — never a 127.0.0.1 bucket
//   H-F1   spoofed / rotated forwarding headers still succeed on a bare `next start` ⇒ printed as KNOWN (accepted deployment precondition OQ28), not deleted
//   H-F2/7 rate-limited and not-found pages: no shop name in any title or in the body (X1) · HTTP 200 on the limited page = KNOWN (accepted debt)
//   H-F3   HEAD / POST / prefetch / crawler / link-preview / no-UA requests must NOT count (X6) · body-less non-GET with a browser UA = KNOWN debt, reported as observed
import { ACCEPTED, boot, bucketCount, cleanup, clientKeyOf, freshIp, kind, known, line, median, mkDep, mkProd, mkTenant, mkUnit, opsCount, pmap, q, req, statRows, STAMP, sweepStale, titlesAll, useIp, viewsOf, ymdAt, type Resp } from "./probe-trips-w1.1-hunt-lib.mjs";

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
  /** buckets of the server's own address under this shop / unit / the miss bucket — must never exist on a production server (X2 ข) */
  const loopBuckets = async () => { const ks = ["127.0.0.1", "::1"].map(clientKeyOf).filter((k): k is string => !!k); return (await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE 'trips:%' AND (key LIKE $1 OR key LIKE $2 OR key LIKE $3) AND right(key, 43) = ANY($4::text[])`, [`trips:book:${A.id}:%`, `trips:view:${uA}:%`, `trips:view:${uNY}:%`, ks])).map((r) => r.key.replace(/pc_.*/, "pc_…")); };
  const bookKeys = async () => new Set((await q<{ key: string }>(`SELECT key FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`])).map((r) => r.key.split(":").pop() ?? ""));

  // ── A. which header decides the bucket ──
  console.log("\n== A. header → bucket ==");
  const sock = [clientKeyOf("127.0.0.1"), clientKeyOf("::1")];
  const base = "100.88.7.9"; useIp(base); for (const x of ["9.9.9.9", "8.8.4.4", "7.7.7.7", "6.6.6.6", "5.5.5.5", "2001:db8:1:2::1", "2001:db8:1:3::1", "64:ff9b::6458:709", "::100.88.7.9"]) useIp(x);
  // expectIp: an IP = the bucket that must be touched · null = must be CLOSED (rate-limited page, no bucket touched) · 5th field = accepted-item note (a miss prints KNOWN)
  const cases: [string, Record<string, string | string[]>, string | null, string, string?][] = [
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
    ["XFF list real-last (spoofed first)", { "x-forwarded-for": `9.9.9.9, ${base}` }, base, "trusted hop = last entry ⇒ same bucket", ACCEPTED.OQ28],
    ["XFF two header lines", { "x-forwarded-for": ["6.6.6.6", base] }, base, "trusted hop = last entry ⇒ same bucket", ACCEPTED.OQ28],
    ["X-Real-IP spoof + XFF real", { "x-real-ip": "8.8.4.4", "x-forwarded-for": base }, base, "client header must not override", ACCEPTED.OQ28],
    ["x-vercel-forwarded-for spoof + XFF real", { "x-vercel-forwarded-for": "5.5.5.5", "x-forwarded-for": base }, base, "client header must not override", ACCEPTED.OQ28],
    ["Forwarded: for= + XFF real", { forwarded: "for=7.7.7.7", "x-forwarded-for": base }, base, "ignored"],
    ["CF-Connecting-IP + True-Client-IP + XFF real", { "cf-connecting-ip": "7.7.7.7", "true-client-ip": "7.7.7.7", "x-forwarded-for": base }, base, "ignored"],
    ["no IP header at all", {}, null, "X2(ข): production + no forwarded IP ⇒ closed (rate page), never a 127.0.0.1 bucket"],
    ["XFF = 127.0.0.1 (server's own address)", { "x-forwarded-for": "127.0.0.1" }, null, "X2(ข): loopback is not a client ⇒ closed"],
    ["XFF = ::1", { "x-forwarded-for": "::1" }, null, "X2(ข): loopback is not a client ⇒ closed"],
    ["XFF = ::ffff:127.0.0.1", { "x-forwarded-for": "::ffff:127.0.0.1" }, null, "X2(ข): loopback is not a client ⇒ closed"],
    ["X-Real-IP loopback + XFF real", { "x-real-ip": "127.0.0.1", "x-forwarded-for": base }, null, "X2(ข): first header decides; loopback ⇒ closed, no fall-through to the client header"],
    ["XFF garbage 'unknown'", { "x-forwarded-for": "unknown" }, null, "closed (RATE page, no bucket)"],
    ["XFF empty + nothing", { "x-forwarded-for": "" }, null, "X2(ข): closed (rate page), never a 127.0.0.1 bucket"],
    ["X-Real-IP garbage + XFF valid", { "x-real-ip": "not-an-ip", "x-forwarded-for": base }, null, "closed"],
    ["XFF decimal int", { "x-forwarded-for": "1683490569" }, null, "closed"],
  ];
  const keyName = new Map<string, string>();
  for (const ip of [base, "9.9.9.9", "8.8.4.4", "7.7.7.7", "6.6.6.6", "5.5.5.5", "2001:db8:1:2::1", "2001:db8:1:3::1", "127.0.0.1", "::1"]) { const k = clientKeyOf(ip); if (k) keyName.set(k, ip); }
  for (const [name, headers, expectIp, note, accepted] of cases) {
    const before = await q<{ key: string; count: number }>(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`]);
    const r = await req(IDX, { headers });
    const after = await q<{ key: string; count: number }>(`SELECT key, count FROM "ChatRateBucket" WHERE key LIKE $1`, [`trips:book:${A.id}:%`]);
    const bm = new Map(before.map((x) => [x.key, Number(x.count)]));
    const touched = after.filter((x) => bm.get(x.key) !== Number(x.count)).map((x) => keyName.get(x.key.split(":").pop() ?? "") ?? "(other key)");
    const got = touched.length ? touched.join(",") : "(no bucket)";
    const exp = expectIp === null ? null : expectIp;
    // closed = the rate-limited page and no bucket of any client touched (a 127.0.0.1 / ::1 bucket would show up here by name)
    const okFlag = exp === null ? kind(r) === "200/RATE" && got === "(no bucket)" && !titlesAll(r).some((t) => t.includes("Hunt Rate Shop")) : got === exp;
    const expText = `${note}${exp ? ` → bucket of ${exp}` : " → 200/RATE, no bucket, no shop title"}`;
    const gotText = `${kind(r)} bucket of ${got}${exp === null ? ` titles ${JSON.stringify(titlesAll(r))}` : ""}`;
    if (accepted) known(`HDR ${name}`, expText, gotText, okFlag, accepted); else line(`HDR ${name}`, expText, gotText, okFlag);
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
    known("LIMITED-STATUS", "HTTP 429 (+ Retry-After) for a throttled client", `${lim.status}, retry-after ${String(lim.headers["retry-after"] ?? "(none)")}`, lim.status === 429, ACCEPTED.STATUS_200);
    // X1 (H-F2): nothing of the shop on the limited page — not in any <title> (streamed ones included), not in the body, and no index data
    const limAll = rs.filter((r) => kind(r).endsWith("RATE"));
    const limLeak = limAll.filter((r) => r.body.includes("Hunt Rate Shop") || titlesAll(r).some((t) => t.includes("Hunt")) || r.body.includes(pA.slug) || r.body.includes("book-index"));
    line("LIMITED-NO-SHOP-DATA", "limited page carries no shop data — title, body, product list (X1 · brief §6)", `titles ${JSON.stringify(titlesAll(lim))} · shopNameInBody=${lim.body.includes("Hunt Rate Shop")} · ${limLeak.length} of ${limAll.length} limited responses carry shop data`, limLeak.length === 0);
    const tl: number[] = [], tn: number[] = [];
    for (let i = 0; i < 15; i++) { tl.push((await req(IDX, { ip: ipR })).ms); tn.push((await req(IDX, { ip: freshIp() })).ms); }
    console.log(`  INFO  median ms: limited client ${median(tl).toFixed(1)} vs normal first view ${median(tn).toFixed(1)} (after X1 a limited request should cost only: resolve shop + 1 gate write — no metadata/catalogue reads)`);
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
  known("LOCKOUT-VICTIM", "a third party cannot exhaust another visitor's bucket", `attacker sent 121 requests with X-Forwarded-For=<victim>; victim's own first request → ${kind(vr)}`, kind(vr) === "200/INDEX", ACCEPTED.OQ28);
  // bypass: rotate header
  const rot = await pmap(Array.from({ length: 150 }, (_, i) => i), 8, () => req(IDX, { ip: freshIp() }));
  known("LIMIT-BYPASS-ROTATE", "one sender cannot exceed 120/min by rotating a client-supplied header", `150 requests with rotating X-Forwarded-For → ${tally(rot)}`, rot.filter((r) => kind(r) === "200/INDEX").length <= 120, ACCEPTED.OQ28);
  // X2(ข): the same sender without any forwarding header gets nothing at all on the production server (no shared 127.0.0.1 bucket to burn)
  const bare = await pmap(Array.from({ length: 20 }, (_, i) => i), 5, (i) => req(i % 2 ? PA : IDX, {}));
  line("NO-HEADER-CLOSED", "20 requests without any IP header (index + product): all rate-limited page, no shop data, no view, no bucket of 127.0.0.1 / ::1", `${tally(bare)} · shop name in any: ${bare.some((r) => r.body.includes("Hunt Rate Shop"))} · loopback buckets: ${JSON.stringify(await loopBuckets())}`,
    bare.every((r) => kind(r) === "200/RATE" && !r.body.includes("Hunt Rate Shop")) && (await loopBuckets()).length === 0);

  // ── C. miss bucket ──
  console.log("\n== C. miss bucket (30 / 10 min / client) ==");
  const ipM = freshIp();
  const ms: Resp[] = [];
  for (let i = 0; i < 34; i++) ms.push(await req(i % 2 ? `/book/w11hunt-nope-${STAMP}-${i}` : `/book/${A.slug}/t/nope-${i}`, { ip: ipM }));
  line("MISS-LIMIT", "30 not-found then limited", tally(ms), ms.filter((r) => r.status === 404).length === 30 && ms.slice(30).every((r) => kind(r).endsWith("RATE")));
  const afterMiss = await req(IDX, { ip: ipM });
  const afterMissP = await req(PA, { ip: ipM });
  line("MISS-NO-LOCKOUT", "exhausted miss bucket does not block real pages of the same client", `${kind(afterMiss)} · ${kind(afterMissP)}`, kind(afterMiss) === "200/INDEX" && kind(afterMissP) === "200/PRODUCT");
  // X1 (H-F7): not-found under a real shop, and the miss-limited page, carry no shop name (title included)
  const nfLeak = ms.filter((r) => r.body.includes("Hunt Rate Shop") || titlesAll(r).some((t) => t.includes("Hunt")));
  line("NOTFOUND-NO-SHOP-DATA", "not-found / miss-limited pages carry no shop name in any title or in the body (X1)", `${nfLeak.length} of ${ms.length} responses carry the shop name · sample titles ${JSON.stringify(titlesAll(ms[0] as Resp))} · limited sample ${JSON.stringify(titlesAll(ms[33] as Resp))}`, nfLeak.length === 0);
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
  known("VIEW-SPOOF-60", "one sender cannot add 60 views with 60 requests", `+${v - prev} views for 60 requests (${tally(sp)}) ⇒ 1 request per fake view`, v - prev < 60, ACCEPTED.OQ28);
  prev = v;
  // X6: only a human browser GET of a page that really rendered counts. 5th field = accepted-debt note (a miss prints KNOWN with what was observed).
  const probes: [string, string, Parameters<typeof req>[1], number, string?][] = [
    ["plain browser GET (control)", PA, {}, 1],
    ["HEAD (browser UA)", PA, { method: "HEAD" }, 0, ACCEPTED.NO_METHOD],
    ["HEAD (no User-Agent)", PA, { method: "HEAD", ua: null }, 0],
    ["HEAD (curl UA)", PA, { method: "HEAD", ua: "curl/8.4.0" }, 0],
    ["GET without User-Agent", PA, { ua: null }, 0],
    ["POST", PA, { method: "POST", body: "x=1", headers: { "content-type": "application/x-www-form-urlencoded" } }, 0],
    ["POST body, no content-type", PA, { method: "POST", body: "x=1" }, 0],
    ["DELETE no body (browser UA)", PA, { method: "DELETE" }, 0, ACCEPTED.NO_METHOD],
    ["RSC fetch (?_rsc + RSC:1)", `${PA}?_rsc=abcde`, { headers: { rsc: "1" } }, 1],
    ["router prefetch (RSC:1 + Next-Router-Prefetch:1)", `${PA}?_rsc=abcdf`, { headers: { rsc: "1", "next-router-prefetch": "1" } }, 0],
    ["browser speculative prefetch (Sec-Purpose: prefetch)", PA, { headers: { "sec-purpose": "prefetch;prerender", purpose: "prefetch" } }, 0],
    ["Sec-Purpose: prefetch only", PA, { headers: { "sec-purpose": "prefetch" } }, 0],
    ["Purpose: prefetch only", PA, { headers: { purpose: "prefetch" } }, 0],
    ["crawler UA (Googlebot)", PA, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } }, 0],
    ["link-preview bot (facebookexternalhit)", PA, { headers: { "user-agent": "facebookexternalhit/1.1" } }, 0],
    ["link-preview bot (LINE: facebookexternalhit;line-poker)", PA, { ua: "facebookexternalhit/1.1;line-poker/1.0" }, 0],
    ["link-preview bot (Slackbot-LinkExpanding)", PA, { ua: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" }, 0],
    ["LINE in-app browser (a person)", PA, { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0" }, 1],
    ["not-found slug", `/book/${A.slug}/t/nope-view`, {}, 0],
    ["draft slug", `/book/${A.slug}/t/${draft.slug}`, {}, 0],
    ["shop index", IDX, {}, 0],
    ["?a=garbage long", `${PA}?a=${"A".repeat(5000)}`, {}, 1],
    ["?a=valid-shape unknown code", `${PA}?a=AGENT_${STAMP}`, {}, 1],
    ["?a=other shop's unit id &s=x", `${PA}?a=${encodeURIComponent(uB)}&s=${encodeURIComponent("'; DROP TABLE x;--")}`, {}, 1],
    ["?a with NUL/control", `${PA}?a=%00%0d%0a%1b&s=%00`, {}, 1],
    ["?a repeated", `${PA}?a=one&a=two`, {}, 1],
  ];
  for (const [name, path, o, expect, accepted] of probes) {
    const r = await req(path, { ...o, ip: freshIp() });
    v = await viewsOf(uA);
    const okFlag = r.status < 500 && v - prev === expect;
    const gotText = `+${v - prev} · ${kind(r)}${r.status >= 300 && r.status < 400 ? ` → ${String(r.headers.location)}` : ""}`;
    // an accepted-debt scenario reports what it observes; a 5xx is never covered by the debt
    if (accepted && r.status < 500) known(`VIEW ${name}`, `+${expect} view, no 5xx`, gotText, okFlag, accepted); else line(`VIEW ${name}`, `+${expect} view, no 5xx`, gotText, okFlag);
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
