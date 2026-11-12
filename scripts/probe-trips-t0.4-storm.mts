// probe-trips-t0.4-storm.mts — นักล่า T0.4 ข้อ 1 (พายุผสมบนรอบเดียว) + ข้อ 8 (ความจริงของที่ว่าง) · untracked
// รัน: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.4-storm.mts
import {
  BKK, DATE, NOW0, PUB, STAFF, SYS, addMin, asRec, basket, boot, brief, call, cleanup, fmt, ikey, inTx, invCheck, mkDep, mkProd, mkShop, mods, fnOf, out, q, rawLeak, rng, sampler, shutdown, unnamed,
  type Rec, type Shop,
} from "./probe-trips-t0.4-lib.mjs";

boot("probe-trips-t0.4-storm");
const OPS = 300;
const PAR = 40;
const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  🔴 ${s}`); };

type H = { id: string; qty: number; purpose: string };
type Rep = { ctx: Rec; input: Rec; holdId: string };

async function storm(sh: Shop, seed: number, withReserved: boolean) {
  const r = rng(seed);
  const initSold = 4, initRes = withReserved ? 6 : 0;
  const dep = await mkDep(sh, { capacity: 24, sold: initSold, reserved: initRes });
  const holds: H[] = [];
  const reps: Rep[] = [];
  const converted = new Set<string>();
  let soldDelta = 0, resDelta = 0;
  const codes = new Map<string, number>();
  const tally = (op: string, res: Rec) => { const k = `${op}:${res.THROW ? "THROW" : res.ok === true ? "ok" : String(res.code)}`; codes.set(k, (codes.get(k) ?? 0) + 1); };
  let tick = 0;
  const leaks: string[] = [];
  const check = (op: string, res: Rec) => {
    tally(op, res);
    if (rawLeak(res) && leaks.length < 20) leaks.push(`${op} ${fmt(res).slice(0, 300)}`);
    if (unnamed(res) && leaks.length < 20) leaks.push(`${op} UNNAMED ${fmt(res).slice(0, 200)}`);
  };
  const { T } = await mods();
  const tc = sh.tctx;
  const stop = sampler([dep]);
  const t0 = Date.now();
  const opsList = ["placeStaff", "placeStaff", "placeStaff", "placeStaff", "placePub", "placePub", "placePub", "replay", "replay", "conflict", "extend", "release", "release", "release",
    "convert", "convert", "convert", "convert", "convert", "return", "sweep", "sweep", "cap", "cap", "status", "stopSell", ...(withReserved ? ["reserve", "unreserve", "unreserve"] : [])];
  let next = 0;
  const worker = async () => {
    while (next < OPS) {
      next++;
      const now = addMin(NOW0, (tick++) * 0.06);
      const op = r.pick(opsList);
      const anyHold = () => (holds.length ? (r.next() < 0.8 ? r.pick(holds.slice(-8)) : r.pick(holds)) : null);
      if (op === "placeStaff" || op === "placePub") {
        const qty = r.int(1, 6);
        const pub = op === "placePub";
        const ctx = pub ? PUB(sh, now) : STAFF(sh, now);
        const input: Rec = { departureId: dep, qty, idempotencyKey: ikey(), ...(pub ? { capKey: basket() } : { purpose: r.next() < 0.3 ? "SHOP_CONFIRM" : "PAYMENT" }) };
        const res = await call("placeHold", ctx, input);
        check(op, res);
        if (res.ok === true) {
          const v = asRec(res.value);
          holds.push({ id: String(v.holdId), qty, purpose: String(v.purpose) });
          if (v.duplicated === true) F(`storm ${seed}: fresh key returned duplicated ${fmt(v)}`);
          reps.push({ ctx, input, holdId: String(v.holdId) });
        }
      } else if (op === "replay" || op === "conflict") {
        if (!reps.length) continue;
        const rp = r.pick(reps);
        const input = op === "replay" ? rp.input : { ...rp.input, qty: (Number(rp.input.qty) % 6) + 1 };
        const ctx = { ...rp.ctx, now };
        const res = await call("placeHold", ctx, input);
        check(op, res);
        if (op === "replay" && !(res.ok === true && asRec(res.value).holdId === rp.holdId && asRec(res.value).duplicated === true)) F(`storm ${seed}: replay of ${rp.holdId} → ${fmt(res).slice(0, 250)}`);
        if (op === "conflict" && !(res.ok === false && res.code === "IDEMPOTENCY_CONFLICT")) F(`storm ${seed}: conflicting replay → ${fmt(res).slice(0, 250)}`);
      } else if (op === "extend") {
        const h = anyHold(); if (!h) continue;
        check(op, await call("extendHold", STAFF(sh, now), { holdId: h.id }));
      } else if (op === "release") {
        const h = anyHold(); if (!h) continue;
        check(op, await call("releaseHold", STAFF(sh, now), { holdId: h.id, reason: "hunt storm" }));
      } else if (op === "convert") {
        const h = anyHold(); if (!h) continue;
        const res = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh, now), { holdId: h.id }));
        check(op, res);
        if (res.ok === true) {
          const v = asRec(res.value);
          if (converted.has(h.id)) F(`storm ${seed}: hold ${h.id} converted twice`);
          converted.add(h.id);
          soldDelta += Number(v.qty);
          if (Number(v.qty) !== h.qty) F(`storm ${seed}: convert qty ${String(v.qty)} ≠ hold qty ${h.qty}`);
        }
      } else if (op === "return") {
        const n = r.int(1, 3);
        const res = await call("returnSold", STAFF(sh, now), { departureId: dep, qty: n });
        check(op, res);
        if (res.ok === true) soldDelta -= n;
      } else if (op === "sweep") {
        const res = await call("runExpireHolds", now, { tenantIds: [sh.tenantId] });
        check(op, res.THROW ? res : { ok: true });
        if (!res.THROW && Array.isArray(res.failed) && res.failed.length) F(`storm ${seed}: sweeper failed ${fmt(res.failed)}`);
      } else if (op === "cap") {
        const cur = (await q<Rec>(`SELECT sold, held, reserved FROM "TripDeparture" WHERE id = $1`, [dep]))[0];
        const used = Number(cur.sold) + Number(cur.held) + Number(cur.reserved);
        const cap = Math.max(1, used + r.int(-1, 10));
        check(op, await call("setDepartureCapacity", tc, { unitId: sh.unitId, departureId: dep, capacity: cap }, { now }));
      } else if (op === "status") {
        const to = r.pick(["CLOSED", "OPEN", "GUARANTEED", "OPEN", "OPEN", "OPEN"]);
        const res = await call("setDepartureStatus", tc, { unitId: sh.unitId, departureId: dep, status: to }, { now });
        check(op, res);
      } else if (op === "stopSell") {
        const on = r.next() < 0.5;
        check(op, await call("setDepartureStopSell", tc, { unitId: sh.unitId, departureId: dep, stopSell: on ? { channels: ["WEB"], reason: "hunt" } : null }, { now }));
      } else if (op === "reserve" || op === "unreserve") {
        const n = r.int(1, 3);
        const res = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, op === "reserve" ? "reserveSeatsInTx" : "unreserveSeatsInTx")(tx, SYS(sh, now), { departureId: dep, qty: n }));
        check(op, res);
        if (res.ok === true) resDelta += op === "reserve" ? n : -n;
      }
    }
  };
  await Promise.all(Array.from({ length: PAR }, worker));
  const ms = Date.now() - t0;
  const s = await stop();
  const mid = await invCheck([dep]);
  for (const v of [...s.viol, ...mid.viol]) F(`storm ${seed}${withReserved ? "R" : ""}: invariant ${v}`);
  for (const l of leaks) F(`storm ${seed}${withReserved ? "R" : ""}: raw/unnamed ${l}`);
  // ข้อ 8 ระหว่างทาง (ยังมี hold ค้าง)
  await availTruth(sh, dep, `storm${seed}${withReserved ? "R" : ""}-mid`);
  // กวาดท้าย: ทุก hold ที่ยังไม่แปลงต้องหลุด → held = 0
  const fin = await call("runExpireHolds", addMin(NOW0, 60 * 24 * 7), { tenantIds: [sh.tenantId] });
  const end = await invCheck([dep]);
  for (const v of end.viol) F(`storm ${seed}: end invariant ${v}`);
  const row = end.rows[0];
  const conv = (await q<{ n: number; s: number }>(`SELECT count(*)::int AS n, COALESCE(sum("qtyPublic"),0)::int AS s FROM "TripHold" WHERE "departureId" = $1 AND status = 'CONVERTED'`, [dep]))[0];
  if (row.held !== 0) F(`storm ${seed}: held ${row.held} after final sweep`);
  if (row.sold !== initSold + soldDelta) F(`storm ${seed}: sold ${row.sold} ≠ expected ${initSold + soldDelta}`);
  if (conv.n !== converted.size) F(`storm ${seed}: CONVERTED rows ${conv.n} ≠ convert-ok ${converted.size}`);
  if (withReserved && row.reserved !== initRes + resDelta) F(`storm ${seed}: reserved ${row.reserved} ≠ expected ${initRes + resDelta}`);
  await availTruth(sh, dep, `storm${seed}${withReserved ? "R" : ""}-end`);
  out(`storm ${seed}${withReserved ? "R" : ""}`, { ops: OPS, par: PAR, ms, samples: s.n, holds: holds.length, converted: converted.size, soldDelta, resDelta, final: { c: row.capacity, s: row.sold, h: row.held, r: row.reserved, st: row.status, v: row.version }, finalSweep: brief(fin) === "THROW" ? fin.THROW : { expired: fin.expired, failed: fin.failed } });
  out(`codes ${seed}${withReserved ? "R" : ""}`, Object.fromEntries([...codes.entries()].sort()));
}

/** ข้อ 8: getAvailability / listAvailability เทียบสูตร R2 จากแถวจริง (ตอนนิ่ง) */
async function availTruth(sh: Shop, dep: string, tag: string) {
  const row = (await invCheck([dep])).rows[0];
  const ss = asRec(row.stopSell);
  const ssCh = Array.isArray(ss.channels) ? (ss.channels as string[]) : null;
  const left = row.capacity - row.sold - row.held - row.reserved;
  const cases: { ctx: Rec; ch: string; at: string }[] = [];
  for (const at of ["open", "afterWeb"]) {
    const now = at === "open" ? NOW0 : new Date("2027-03-09T12:00:00.000Z");
    for (const ch of ["WEB", "LIFF", "COUNTER"]) cases.push({ ctx: STAFF(sh, now, ch), ch, at });
    for (const ch of ["WEB", "EMBED"]) cases.push({ ctx: PUB(sh, now, ch), ch, at });
  }
  let n = 0;
  for (const c of cases) {
    const g = await call("getAvailability", c.ctx, { departureId: dep });
    const l = await call("listAvailability", c.ctx, { productId: sh.prodId, from: DATE, to: DATE });
    n++;
    if (g.ok !== true || l.ok !== true) { F(`avail ${tag}: ${c.ch}/${c.at} get=${brief(g)} list=${brief(l)}`); continue; }
    const gv = asRec(g.value);
    const lv = (l.value as Rec[]).map(asRec).find((x) => x.slotId === dep);
    if (!lv || fmt(lv) !== fmt(gv)) F(`avail ${tag}: list≠get ${c.ch}/${c.at} get=${fmt(gv)} list=${fmt(lv)}`);
    let expBlock: string | null = null;
    if (row.status === "CLOSED" || row.status === "CANCELLED") expBlock = "STATUS";
    else if (c.at === "afterWeb" && c.ch !== "COUNTER") expBlock = "CUTOFF";
    else if (ssCh && (ssCh.length === 0 || ssCh.includes(c.ch))) expBlock = "STOP_SELL";
    const expLeft = expBlock === null ? left : 0;
    if (gv.saleBlock !== expBlock || gv.publicLeft !== expLeft) F(`avail ${tag}: ${c.ch}/${c.at} status=${row.status} c${row.capacity} s${row.sold} h${row.held} r${row.reserved} stop=${fmt(ssCh)} → got block=${String(gv.saleBlock)} left=${String(gv.publicLeft)} expected block=${String(expBlock)} left=${expLeft}`);
    if (gv.status !== row.status) F(`avail ${tag}: status ${String(gv.status)} ≠ row ${row.status}`);
  }
  return n;
}

/** ข้อ 8 ส่วนสินค้า DRAFT / ARCHIVED / ตัวเลือกปิด */
async function productStates(sh: Shop) {
  for (const kind of ["DRAFT", "ARCHIVED", "OPTION_OFF"]) {
    const p = await mkProd(sh.tenantId, sh.unitId, kind === "OPTION_OFF" ? "ACTIVE" : kind);
    if (kind === "OPTION_OFF") await q(`UPDATE "TripOption" SET active = false WHERE id = $1`, [p.opt]);
    const dep = await mkDep(sh, { prodId: p.id, optId: p.opt, capacity: 10 });
    const ga = await call("getAvailability", PUB(sh), { departureId: dep });
    const la = await call("listAvailability", PUB(sh), { productId: p.id, from: DATE, to: DATE });
    const hp = await call("placeHold", PUB(sh), { departureId: dep, qty: 1, idempotencyKey: ikey(), capKey: basket() });
    const hs = await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() });
    const gv = asRec(ga.value);
    out(`product ${kind}`, { avail: { ok: ga.ok, publicLeft: gv.publicLeft, saleBlock: gv.saleBlock }, list: Array.isArray(la.value) ? (la.value as Rec[]).length : brief(la), placePublic: brief(hp), placeStaff: brief(hs) });
    const sellable = hp.ok === true;
    if (gv.publicLeft !== undefined && Number(gv.publicLeft) > 0 && gv.saleBlock === null && !sellable) F(`avail product ${kind}: availability says ${String(gv.publicLeft)} left / saleBlock null but PUBLIC placeHold → ${brief(hp)}`);
    if (kind === "DRAFT" && sellable) F(`product DRAFT: PUBLIC placeHold succeeded on an unpublished (DRAFT) product's departure`);
  }
}

try {
  const sh = await mkShop("st");
  // cutoff ต่อช่องทาง: เว็บปิด 1 วันก่อน 18:00 · หน้าร้าน 0 วัน 07:00 (เหมือนข้อสอบ)
  const { S } = await mods();
  void S;
  await (await import("./probe-trips-t0.4-lib.mjs")).setV(sh, [{ key: "trips.sell.cutoff", scope: "UNIT", scopeId: sh.unitId, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]);
  void BKK;
  for (const seed of [11, 22, 33]) await storm(sh, seed, false);
  for (const seed of [44, 55]) await storm(sh, seed, true);
  await productStates(sh);
} catch (e) {
  F(`probe crashed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  try { await cleanup(); } catch (e) { console.log("cleanup err", e); }
  console.log(`\n=== storm findings ${findings.length} ===`);
  for (const f of [...new Set(findings)]) console.log(" -", f);
  await shutdown();
}
