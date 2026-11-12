// probe-trips-t0.4-scale.mts — นักล่า T0.4 ข้อ 7 (ตัวกวาด 20,000 hold / 2,000 รอบ / 3 ร้าน) + ข้อ 10 (pool อดตายของ *InTx) · untracked
import {
  NOW0, PUB, STAFF, addMin, asRec, boot, brief, call, cleanup, fmt, fnOf, hex, ikey, inTx, invCheck, mkShop, mods, out, q, shutdown,
  type Rec, type Shop,
} from "./probe-trips-t0.4-lib.mjs";

boot("probe-trips-t0.4-scale");
const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  🔴 ${s}`); };
const xacts = async () => Number((await q<{ x: string }>(`SELECT (xact_commit + xact_rollback)::text AS x FROM pg_stat_database WHERE datname = current_database()`))[0].x);

/** รอบ n รอบ × hold k ตัว (หมดอายุแล้ว) ด้วย SQL ก้อนเดียว · held ตั้งตรงกับ Σ */
async function bulk(sh: Shop, n: number, k: number, tag: string, off = 0): Promise<string[]> {
  const pfx = `trips-hunt4-bd-${tag}-${hex(3)}-`;
  await q(`INSERT INTO "TripDeparture" (id, "tenantId", "unitId", "productId", "optionId", "localDate", "startsAt", "endsAt", status, capacity, sold, held, reserved, "cutoffAt", version, "createdAt", "updatedAt")
    SELECT $1 || g, $2, $3, $4, $5, DATE '2027-03-10' + (g / 400), TIMESTAMP '2027-03-10 01:00:00' + ((g + $8::int) * interval '1 minute'), TIMESTAMP '2027-03-10 05:00:00' + ((g + $8::int) * interval '1 minute'), 'OPEN', 100, 0, $6, 0, TIMESTAMP '2027-03-10 00:00:00', 0, now(), now()
    FROM generate_series(1, $7::int) g`, [pfx, sh.tenantId, sh.unitId, sh.prodId, sh.optId, k, n, off]);
  await q(`INSERT INTO "TripHold" (id, "tenantId", "unitId", "departureId", channel, "qtyPublic", "qtyAllot", "unitIds", purpose, "capKeyHash", "requestHash", "idempotencyKey", status, "expiresAt", "createdAt", "updatedAt")
    SELECT $1 || 'h' || g || '-' || j, $2, $3, $1 || g, 'COUNTER', 1, 0, ARRAY[]::text[], 'PAYMENT', md5(g::text), md5(j::text), $1 || 'k' || g || '-' || j, 'ACTIVE', TIMESTAMP '2027-03-01 00:10:00', now(), now()
    FROM generate_series(1, $4::int) g, generate_series(1, $5::int) j`, [pfx, sh.tenantId, sh.unitId, n, k]);
  return (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE id LIKE $1`, [`${pfx}%`])).map((r) => r.id);
}

async function sweeperScale() {
  const s1 = await mkShop("sc1"), s2 = await mkShop("sc2"), s3 = await mkShop("sc3");
  const t0 = Date.now();
  const d1 = await bulk(s1, 700, 10, "a"), d2 = await bulk(s2, 700, 10, "b"), d3 = await bulk(s3, 600, 10, "c");
  out("scale setup", { departures: d1.length + d2.length + d3.length, holds: (d1.length + d2.length + d3.length) * 10, ms: Date.now() - t0 });
  // ร้าน 2: ค่าตั้งเสีย (SettingValue ผิดชนิด) · ร้าน 3: รอบเดียวที่ held ถูกทำให้เพี้ยน (held 0 แต่มี hold ACTIVE 10)
  await q(`INSERT INTO "SettingValue" (id, "tenantId", key, scope, "scopeId", value, "updatedAt") VALUES ($1, $2, 'trips.sell.holdMinutes', 'UNIT', $3, '"สิบห้า"'::jsonb, now())`, [`trips-hunt4-sv-${hex(4)}`, s2.tenantId, s2.unitId]);
  const broken3 = d3[17];
  await q(`UPDATE "TripDeparture" SET held = 0 WHERE id = $1`, [broken3]);
  const now = addMin(NOW0, 30);
  const x0 = await xacts(); const t1 = Date.now();
  const r = await call("runExpireHolds", now, { tenantIds: [s1.tenantId, s2.tenantId, s3.tenantId] });
  const ms = Date.now() - t1; const xs = (await xacts()) - x0;
  const failed = Array.isArray(r.failed) ? (r.failed as Rec[]) : [];
  const byT = (t: string) => failed.filter((f) => f.tenantId === t);
  const left = async (ds: string[]) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = ANY($1::text[]) AND status = 'ACTIVE'`, [ds]))[0].n;
  const heldSum = async (ds: string[]) => (await q<{ n: number }>(`SELECT COALESCE(sum(held),0)::int AS n FROM "TripDeparture" WHERE id = ANY($1::text[])`, [ds]))[0].n;
  const res = {
    throw: r.THROW ?? null, expired: r.expired, departures: r.departures, ms, approxDbTransactions: xs,
    failedTotal: failed.length, failedCodes: [...new Set(failed.map((f) => `${String(f.tenantId).slice(13, 17)}:${String(f.code)}`))],
    t1: { activeLeft: await left(d1), held: await heldSum(d1), failed: byT(s1.tenantId).length },
    t2_brokenSetting: { activeLeft: await left(d2), held: await heldSum(d2), failed: byT(s2.tenantId).length },
    t3_oneCorrupt: { activeLeft: await left(d3), held: await heldSum(d3), failed: byT(s3.tenantId).map((f) => String(f.departureId) === broken3 ? `broken:${String(f.code)}` : `OTHER:${String(f.departureId)}:${String(f.code)}`) },
  };
  out("sweeper 20k", res);
  if (res.t1.activeLeft !== 0 || res.t1.held !== 0) F(`sweeper scale: healthy tenant not fully swept ${fmt(res.t1)}`);
  if (res.t3_oneCorrupt.activeLeft !== 10) F(`sweeper scale: tenant 3 left ${res.t3_oneCorrupt.activeLeft} (expected only the corrupt departure's 10)`);
  // ร้าน 2 ผลต่อ API อื่นเมื่อค่าตั้งเสีย
  const ph = await call("placeHold", STAFF(s2), { departureId: d2[0], qty: 1, idempotencyKey: ikey() });
  const av = await call("getAvailability", PUB(s2), { departureId: d2[0] });
  out("broken setting → other APIs", { placeHold: brief(ph), getAvailability: brief(av) });
  if (ph.THROW || av.THROW) F(`broken SettingValue (trips.sell.holdMinutes = "สิบห้า") makes placeHold/getAvailability THROW raw: ${String(ph.THROW ?? av.THROW).slice(0, 200)}`);

  // สองตัวกวาดพร้อมกัน บนชุดใหม่ 2,000 hold / 200 รอบ
  const d4 = await bulk(s1, 200, 10, "d", 5000);
  const t2 = Date.now();
  const [a, b] = await Promise.all([call("runExpireHolds", now, { tenantIds: [s1.tenantId] }), call("runExpireHolds", now, { tenantIds: [s1.tenantId] })]);
  const inv = await invCheck(d4);
  const viol = inv.viol;
  const exp4 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "TripHold" WHERE "departureId" = ANY($1::text[]) AND status = 'EXPIRED'`, [d4]))[0].n;
  out("two sweepers at once", { ms: Date.now() - t2, a: a.THROW ?? { expired: a.expired, failed: (a.failed as Rec[]).length }, b: b.THROW ?? { expired: b.expired, failed: (b.failed as Rec[]).length }, sumExpired: Number(a.expired) + Number(b.expired), rowsExpired: exp4, heldLeft: inv.rows.reduce((s, x) => s + x.held, 0), violations: viol.length });
  if (Number(a.expired) + Number(b.expired) !== 2000 || exp4 !== 2000 || viol.length) F(`two sweepers: ${Number(a.expired) + Number(b.expired)} / rows ${exp4} / viol ${viol.slice(0, 3).join(";")}`);
}

// ═══════════ ข้อ 10 pool อดตาย ═══════════
async function starvation() {
  const sh = await mkShop("pl");
  const { T } = await mods();
  const dep = (await bulk(sh, 1, 0, "p"))[0];
  await q(`UPDATE "TripDeparture" SET capacity = 1000, sold = 500 WHERE id = $1`, [dep]);
  const conns = async () => (await q<{ n: number; tx: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS tx FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend'`))[0];
  const runLevel = async (fnName: string, P: number, input: (i: number, hs: string[]) => Rec, needHolds: boolean, ctxOf: () => Rec) => {
    const hs: string[] = [];
    if (needHolds) for (let i = 0; i < P; i++) { const r = await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() }); hs.push(String(asRec(r.value).holdId)); }
    let maxConn = 0, maxTx = 0, stop = false;
    const mon = (async () => { while (!stop) { try { const c = await conns(); maxConn = Math.max(maxConn, c.n); maxTx = Math.max(maxTx, c.tx); } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); } })();
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: P }, (_, i) => {
      const s = Date.now();
      return inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, fnName)(tx, ctxOf(), input(i, hs)), {}).then((r) => ({ r, ms: Date.now() - s }));
    }));
    stop = true; await mon;
    const ms = Date.now() - t0;
    const codes = new Map<string, number>();
    for (const x of rs) { const k = x.r.THROW ? `THROW ${String(x.r.pgcode)} ${String(x.r.THROW).slice(30, 110)}` : x.r.ok === true ? "ok" : String(x.r.code); codes.set(k, (codes.get(k) ?? 0) + 1); }
    // ฟื้นไหม: คำขอปกติหลังจากนั้น
    const t1 = Date.now(); const after = await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() }); const afterMs = Date.now() - t1;
    const row = { fn: fnName, P, wallMs: ms, maxCallMs: Math.max(...rs.map((x) => x.ms)), ok: rs.filter((x) => x.r.ok === true).length, codes: Object.fromEntries(codes), dbClientConnsMax: maxConn, idleInTxMax: maxTx, recovery: `${brief(after)} ${afterMs}ms` };
    out("starvation", row);
    return row;
  };
  const stf = () => STAFF(sh);
  const results: Rec[] = [];
  results.push(await runLevel("convertHoldInTx", 30, (i, hs) => ({ holdId: hs[i] }), true, stf)); // ตัวควบคุม: ไม่ขอ connection ที่สอง
  for (const P of [5, 9, 10, 12, 30]) results.push(await runLevel("releaseHoldInTx", P, (i, hs) => ({ holdId: hs[i], reason: "pool test" }), true, stf));
  results.push(await runLevel("returnSoldInTx", 12, () => ({ departureId: dep, qty: 1 }), false, stf));
  results.push(await runLevel("rekeyHoldsToContactInTx", 12, (i, hs) => ({ holdIds: [hs[i]], contactKey: `contact:${hex(6)}` }), true, () => PUB(sh)));
  for (const r of results) if (r.fn !== "convertHoldInTx" && Number(r.ok) < Number(r.P)) F(`pool starvation: ${String(r.fn)} ×${String(r.P)} parallel in caller tx → ok ${String(r.ok)}/${String(r.P)} in ${String(r.wallMs)} ms ${fmt(r.codes)}`);
  for (const v of (await invCheck([dep])).viol) F(`starvation invariant ${v}`);
}

try {
  await sweeperScale();
  await starvation();
} catch (e) {
  F(`probe crashed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  try { await cleanup(); } catch (e) { console.log("cleanup err", e); }
  console.log(`\n=== scale findings ${findings.length} ===`);
  for (const f of [...new Set(findings)]) console.log(" -", f);
  await shutdown();
}
