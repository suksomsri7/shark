// probe-trips-t0.4-hunt.mts — นักล่า T0.4 ข้อ 3 (ย้ายที่ขนาน · วงจร 3 รอบ) + ข้อ 4 (ล่า deadlock ข้ามใบ 60 วิ) · untracked
import {
  DATE, NOW0, PUB, STAFF, addMin, asRec, basket, boot, brief, call, cleanup, fmt, fnOf, ikey, inTx, invCheck, mkDep, mkShop, mods, out, q, rawLeak, rng, sampler, setV, shutdown, unnamed,
  type Rec, type Shop,
} from "./probe-trips-t0.4-lib.mjs";

boot("probe-trips-t0.4-hunt");
const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  🔴 ${s}`); };
const deadlocks = async () => Number((await q<{ d: string }>(`SELECT deadlocks::text AS d FROM pg_stat_database WHERE datname = current_database()`))[0]?.d ?? -1);
const sumSold = async (ids: string[]) => (await q<{ s: number }>(`SELECT COALESCE(sum(sold),0)::int AS s FROM "TripDeparture" WHERE id = ANY($1::text[])`, [ids]))[0].s;

function lockMonitor() {
  let stop = false; let maxWaiting = 0; let maxWaitMs = 0; let n = 0;
  const loop = (async () => {
    while (!stop) {
      try {
        const r = (await q<{ n: number; ms: number }>(`SELECT count(*)::int AS n, COALESCE(max(EXTRACT(EPOCH FROM (clock_timestamp() - state_change)) * 1000), 0)::int AS ms FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`))[0];
        maxWaiting = Math.max(maxWaiting, r.n); maxWaitMs = Math.max(maxWaitMs, r.ms); n++;
      } catch { /* */ }
      await new Promise((res) => setTimeout(res, 50));
    }
  })();
  return async () => { stop = true; await loop; return { samples: n, maxWaiting, maxWaitMs }; };
}

// ═══════════ ข้อ 3 ย้าย ═══════════
async function moves(sh: Shop) {
  const r = rng(303);
  const A = await mkDep(sh, { capacity: 40, sold: 15 });
  const B = await mkDep(sh, { capacity: 40, sold: 15 });
  const dl0 = await deadlocks();
  const stopS = sampler([A, B]); const stopL = lockMonitor();
  const t0 = Date.now();
  const codes = new Map<string, number>(); const tally = (k: string, res: Rec) => { const kk = `${k}:${brief(res).slice(0, 40)}`; codes.set(kk, (codes.get(kk) ?? 0) + 1); if (rawLeak(res) || unnamed(res)) F(`moves ${k}: raw ${fmt(res).slice(0, 300)}`); };
  let soldConv = 0;
  const tasks: Promise<void>[] = [];
  for (let i = 0; i < 30; i++) {
    const [f, t] = i % 2 ? [A, B] : [B, A];
    const qty = r.int(1, 2);
    tasks.push(call("moveSold", STAFF(sh), { fromDepartureId: f, toDepartureId: t, qty }).then((x) => tally("move", x)));
    tasks.push(inTx(sh.tenantId, sh.unitId, async (tx) => { const { T } = await mods(); return fnOf(T, "moveSoldInTx")(tx, STAFF(sh), { fromDepartureId: t, toDepartureId: f, qty }); }).then((x) => tally("moveInTx", x)));
  }
  for (let i = 0; i < 20; i++) {
    const d = i % 2 ? A : B;
    tasks.push((async () => {
      const h = await call("placeHold", i % 4 < 2 ? STAFF(sh) : PUB(sh), { departureId: d, qty: r.int(1, 3), idempotencyKey: ikey(), ...(i % 4 < 2 ? {} : { capKey: basket() }) });
      tally("hold", h);
      if (h.ok === true && i % 3 === 0) { const { T } = await mods(); const c = await inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh), { holdId: String(asRec(h.value).holdId) })); tally("convert", c); if (c.ok === true) soldConv += Number(asRec(c.value).qty); }
    })());
  }
  await Promise.all(tasks);
  const ms = Date.now() - t0;
  const s = await stopS(); const l = await stopL();
  const dl = (await deadlocks()) - dl0;
  const total = await sumSold([A, B]);
  if (total !== 30 + soldConv) F(`moves: Σsold ${total} ≠ 30 + converted ${soldConv}`);
  for (const v of [...s.viol, ...(await invCheck([A, B])).viol]) F(`moves invariant ${v}`);
  out("moves A<->B", { ops: 80, ms, pgDeadlocks: dl, samples: s.n, locks: l, sumSold: total, codes: Object.fromEntries(codes) });
  // ปลายทางเต็ม / ปิด
  const full = await mkDep(sh, { capacity: 10, sold: 10, status: "FULL" });
  const closed = await mkDep(sh, { capacity: 10, sold: 2, status: "CLOSED" });
  const src = await mkDep(sh, { capacity: 10, sold: 5 });
  const m1 = await call("moveSold", STAFF(sh), { fromDepartureId: src, toDepartureId: full, qty: 1 });
  const m2 = await call("moveSold", STAFF(sh), { fromDepartureId: src, toDepartureId: closed, qty: 1 });
  const nearFull = await mkDep(sh, { capacity: 10, sold: 9, reserved: 1 });
  const m3 = await call("moveSold", STAFF(sh), { fromDepartureId: src, toDepartureId: nearFull, qty: 1 });
  const srcRow = (await invCheck([src])).rows[0];
  out("moves into full/closed/allotment-full", { full: brief(m1), closed: brief(m2), fullByReserved: brief(m3), srcSold: srcRow.sold });
  if (m1.ok === true || m2.ok === true || m3.ok === true || srcRow.sold !== 5) F(`moves into full/closed: ${brief(m1)} ${brief(m2)} ${brief(m3)} src sold ${srcRow.sold}`);
  // วงจร A→B, B→C, C→A ×10 ขนาน
  const X = await mkDep(sh, { capacity: 50, sold: 20 }), Y = await mkDep(sh, { capacity: 50, sold: 20 }), Z = await mkDep(sh, { capacity: 50, sold: 20 });
  const dl1 = await deadlocks(); const t1 = Date.now();
  const cyc: Promise<Rec>[] = [];
  for (let i = 0; i < 10; i++) for (const [f, t] of [[X, Y], [Y, Z], [Z, X]]) cyc.push(call("moveSold", STAFF(sh), { fromDepartureId: f, toDepartureId: t, qty: 1 }));
  const cr = await Promise.all(cyc);
  const cdl = (await deadlocks()) - dl1;
  const cc = new Map<string, number>(); for (const x of cr) { cc.set(brief(x), (cc.get(brief(x)) ?? 0) + 1); if (rawLeak(x)) F(`cycle raw ${fmt(x)}`); }
  const cs = await sumSold([X, Y, Z]);
  if (cs !== 60) F(`cycle Σsold ${cs} ≠ 60`);
  for (const v of (await invCheck([X, Y, Z])).viol) F(`cycle invariant ${v}`);
  out("moves 3-cycle", { ops: 30, ms: Date.now() - t1, pgDeadlocks: cdl, codes: Object.fromEntries(cc), sumSold: cs });
}

// ═══════════ ข้อ 4 ล่า deadlock ข้ามใบ 60 วิ ═══════════
async function hunt(sh: Shop) {
  const { T } = await mods();
  const r = rng(404);
  const tc = sh.tctx;
  const base = new Date("2027-03-02T12:00:00.000Z"); // หลังเวลาตัดสินขั้นต่ำของรอบ 3 มี.ค. · เว็บปิดแล้ว · หน้าร้านเปิด
  // ตัวเลือกที่สอง (ให้ปิดตัวเลือกแรกได้)
  const opt2 = await (await import("./probe-trips-t0.4-lib.mjs")).insertRow("TripOption", { tenantId: sh.tenantId, unitId: sh.unitId, productId: sh.prodId, name: JSON.stringify({ th: "ตัวเลือกสอง" }), durationMin: 240, sortOrder: 2, active: true, updatedAt: new Date() });
  // ทรัพยากร 6 ลำ · รอบผ่าน T0.3 createDeparture (ผูกเรือ) + รอบ SQL ดิบมีขั้นต่ำ
  const boats: string[] = [];
  for (let i = 0; i < 6; i++) { const x = await call("createResource", tc, { unitId: sh.unitId, kind: "BOAT", name: `เรือ ${i}`, seats: 30 }); if (x.ok === true) boats.push(String(x.id)); else F(`hunt setup resource ${brief(x)}`); }
  const deps: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = await call("createDeparture", tc, { unitId: sh.unitId, productId: sh.prodId, optionId: opt2, localDate: "2027-03-03", departTimeMin: 600 + i * 7, capacity: 30, minPax: 3, resourceIds: boats[i] ? [boats[i]] : [] }, { now: NOW0 });
    if (x.ok === true) deps.push(String(x.id)); else F(`hunt setup createDeparture ${brief(x)} ${fmt(x)}`);
  }
  for (let i = 0; i < 4; i++) deps.push(await mkDep(sh, { date: "2027-03-03", capacity: 30, sold: 2, minPax: 3, optId: opt2 }));
  const sch = await call("createSchedule", tc, { unitId: sh.unitId, productId: sh.prodId, optionId: opt2, rule: { kind: "DAILY" }, departTimeMin: 900, capacity: 20, minPax: 3, dateFrom: "2027-03-03", dateTo: "2027-03-12" }, { now: NOW0 });
  if (sch.ok !== true) F(`hunt setup schedule ${fmt(sch)}`);
  const holds: string[] = [];
  const codes = new Map<string, number>(); const lat = new Map<string, number>();
  let leaks40 = 0, busy = 0, throws = 0;
  const tally = (op: string, res: Rec, ms: number) => {
    const k = `${op}:${res.THROW ? "THROW" : res.ok === true ? "ok" : String(res.code)}`;
    codes.set(k, (codes.get(k) ?? 0) + 1);
    lat.set(op, Math.max(lat.get(op) ?? 0, ms));
    const txt = fmt(res);
    if (/40P01|deadlock/i.test(txt)) leaks40++;
    if (res.code === "BUSY") busy++;
    if (res.THROW) { throws++; if (throws <= 5) F(`hunt ${op} THROW ${String(res.THROW).slice(0, 300)}`); }
    else if (rawLeak(res) || unnamed(res)) F(`hunt ${op} raw/unnamed ${txt.slice(0, 300)}`);
  };
  const timed = async (op: string, p: () => Promise<Rec>) => { const t = Date.now(); const res: Rec = await p().catch((e: unknown): Rec => ({ THROW: String(e) })); tally(op, res, Date.now() - t); return res; };
  let tick = 0;
  const nowAt = () => addMin(base, (tick++) * 0.02);
  const all = () => [...deps];
  const dl0 = await deadlocks();
  const stopS = sampler(deps); const stopL = lockMonitor();
  const until = Date.now() + 60_000;
  let ops = 0;
  const ops1 = ["hold", "hold", "hold", "convert", "convert", "release", "sweep", "minpax", "waitlistJob", "materialize", "updateDep", "archive", "option", "capacity", "status"];
  const worker = async () => {
    while (Date.now() < until) {
      ops++;
      const now = nowAt();
      const op = r.pick(ops1);
      const d = r.pick(all());
      if (op === "hold") {
        const x = await timed(op, () => call("placeHold", STAFF(sh, now), { departureId: d, qty: r.int(1, 3), idempotencyKey: ikey(), purpose: r.next() < 0.3 ? "SHOP_CONFIRM" : "PAYMENT" }));
        if (x.ok === true) holds.push(String(asRec(x.value).holdId));
      } else if (op === "convert" && holds.length) {
        const h = r.pick(holds.slice(-12));
        await timed(op, () => inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh, now), { holdId: h })));
      } else if (op === "release" && holds.length) {
        await timed(op, () => call("releaseHold", STAFF(sh, now), { holdId: r.pick(holds.slice(-12)), reason: "hunt" }));
      } else if (op === "sweep") {
        await timed(op, () => call("runExpireHolds", addMin(now, 16), { tenantIds: [sh.tenantId] }).then((x) => (x.THROW ? x : asRec(x.failed).length ? { ok: false, code: "FAILED", x } : { ok: true })));
      } else if (op === "minpax") {
        await timed(op, () => call("runMinPaxCheck", now, { tenantIds: [sh.tenantId] }).then((x) => (x.THROW ? x : Array.isArray(x.failed) && x.failed.length ? { ok: false, code: "FAILED", x } : { ok: true })));
      } else if (op === "waitlistJob") {
        await timed(op, () => call("runWaitlistOffers", now, { tenantIds: [sh.tenantId] }).then((x) => (x.THROW ? x : Array.isArray(x.failed) && x.failed.length ? { ok: false, code: "FAILED", x } : { ok: true })));
      } else if (op === "materialize") {
        await timed(op, () => call("materializeSchedule", tc, { unitId: sh.unitId, scheduleId: String(sch.id) }, { now: NOW0 }).then((x) => (x.THROW ? x : x.ok === false ? x : { ok: true })));
      } else if (op === "updateDep") {
        await timed(op, () => call("updateDeparture", tc, { unitId: sh.unitId, departureId: d, departTimeMin: r.int(540, 700), confirm: true }, { now: base }));
      } else if (op === "archive") {
        const a = await timed(op, () => call("archiveProduct", tc, { unitId: sh.unitId, productId: sh.prodId, confirm: true, reason: "hunt archive test" }));
        if (a.ok === true) await timed("restore", () => call("restoreProduct", tc, { unitId: sh.unitId, productId: sh.prodId }));
      } else if (op === "option") {
        await timed(op, () => call("setOptionActive", tc, { unitId: sh.unitId, optionId: sh.optId, active: r.next() < 0.5 }));
      } else if (op === "capacity") {
        const row = (await invCheck([d])).rows[0];
        await timed(op, () => call("setDepartureCapacity", tc, { unitId: sh.unitId, departureId: d, capacity: row.sold + row.held + row.reserved + r.int(0, 8) }, { now: base }));
      } else if (op === "status") {
        await timed(op, () => call("setDepartureStatus", tc, { unitId: sh.unitId, departureId: d, status: r.pick(["CLOSED", "OPEN", "GUARANTEED"]) }, { now: base }));
      }
    }
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 24 }, worker));
  const ms = Date.now() - t0;
  const s = await stopS(); const l = await stopL();
  const dl = (await deadlocks()) - dl0;
  // หลังจบ: ตัวกวาดสุดท้าย + ค่าคงที่
  const matDeps = (await q<{ id: string }>(`SELECT id FROM "TripDeparture" WHERE "tenantId" = $1`, [sh.tenantId])).map((x) => x.id);
  const fin = await call("runExpireHolds", addMin(base, 60 * 24), { tenantIds: [sh.tenantId] });
  const end = await invCheck(matDeps);
  for (const v of [...s.viol, ...end.viol]) F(`hunt invariant ${v}`);
  const heldLeft = end.rows.reduce((a, x) => a + x.held, 0);
  if (heldLeft !== 0) F(`hunt: held ${heldLeft} left after final sweep`);
  out("hunt 60s", { workers: 24, ops, ms, pgDeadlocksDetected: dl, deadlockTextLeakedToCallers: leaks40, busy, throws, samples: s.n, locks: l, maxLatencyMsByOp: Object.fromEntries(lat), finalSweep: fin.THROW ?? { expired: fin.expired, failed: fin.failed }, departures: matDeps.length });
  out("hunt codes", Object.fromEntries([...codes.entries()].sort()));
  if (leaks40) F(`hunt: ${leaks40} results carried deadlock text`);
  void DATE;
}

try {
  const sh = await mkShop("hu");
  await setV(sh, [{ key: "trips.sell.cutoff", scope: "UNIT", scopeId: sh.unitId, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]);
  await moves(sh);
  await hunt(sh);
} catch (e) {
  F(`probe crashed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  try { await cleanup(); } catch (e) { console.log("cleanup err", e); }
  console.log(`\n=== hunt findings ${findings.length} ===`);
  for (const f of [...new Set(findings)]) console.log(" -", f);
  await shutdown();
}
