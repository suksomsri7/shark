// probe-trips-t0.6-r2.mts — นักล่า T0.6 รอบ 2 (หลัง baebccfe1): SW ตัวกวาด/หมดเวลาจริง · Z อนุมัติเมื่อไม่มียอดตอนจอง · CH แก้/เลื่อนวัน (โจมตีของใหม่)
// ใช้: bash scripts/iso.sh bash scripts/qc-trips.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-trips-t0.6-r2.mts [--only=SW,Z,CH] [--moves=50]
// 🔴 SW ใช้นาฬิกาจริง + hold 1 นาทีจากค่าตั้งของร้านตัวเอง · ตัวกวาด = runExpireHolds(now จริง, { tenantIds: [ร้านตัวเอง] }) เท่านั้น
import {
  boot, mods, fnOf, call, code, stats, out, fmt, asRec, asArr, hex, rid, sleep, q, pool, R, insertRow,
  mkShop, mkDep, mkProd, setV, staff, pub, withNow, line, booker, quote, hold, confirm, confirmBody, bookNow, refs,
  allInv, invTenant, positiveControls, dbStats, connSampler, cleanup, sweepStale, shutdown, findings, finding,
  type Rec, type Shop, type H,
} from "./probe-trips-t0.6-lib.mjs";

boot("probe-trips-t0.6-r2");
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const ONLY = new Set(arg("only", "PC,SW,Z,CH").split(","));
const MOVES = Number(arg("moves", "50"));
const ops: Record<string, number> = {};
const bump = (w: string, n = 1) => { ops[w] = (ops[w] ?? 0) + n; };
const violations: Rec[] = [];
async function check(w: string, sh: Shop, deps: string[], ctx = "") {
  const b = await allInv(sh, deps);
  if (b.length) { violations.push({ w, ctx, b: b.slice(0, 10) }); out(`VIOL ${w}`, ctx, b.slice(0, 6)); }
  return b;
}
const par = <T,>(n: number, f: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => f(i)));
const tally = (rs: Rec[]) => { const m: Record<string, number> = {}; for (const r of rs) m[code(r)] = (m[code(r)] ?? 0) + 1; return m; };
const dep = async (id: string) => (await q<Rec>(`SELECT capacity, sold, held, reserved, status FROM "TripDeparture" WHERE id = $1`, [id]))[0] ?? {};
const bk = async (id: unknown) => (await q<Rec>(`SELECT id, status, version, "departureId", "grossSatang", "discountSatang" FROM "TripBooking" WHERE id = $1`, [String(id)]))[0] ?? {};
const holdsOf = async (bookingId: unknown) => q<Rec>(`SELECT id, status, purpose, "expiresAt" FROM "TripHold" WHERE "bookingId" = $1 ORDER BY "createdAt"`, [String(bookingId)]);
const mkRule = (sh: Shop, code0: string, maxUses = 10) => insertRow("TripPriceRule", { id: rid("ru"), tenantId: sh.tenantId, unitId: sh.unitId, productId: null, kind: "PROMO_CODE", code: code0, params: JSON.stringify({ kind: "PROMO_CODE", code: code0, discountBp: 1000, maxUses }), priority: 0, active: true, usedCount: 0, updatedAt: new Date() });
const ruleRow = async (id: string) => (await q<Rec>(`SELECT "usedCount", (SELECT count(*)::int FROM "TripPromoRedemption" x WHERE x."ruleId" = r.id AND x.status = 'ACTIVE') act FROM "TripPriceRule" r WHERE id = $1`, [id]))[0];
const RES: Rec = {};

async function main() {
  await sweepStale();
  const { T } = await mods();
  const s0 = await dbStats();
  const sampler = connSampler();

  // ═══ PC ═══
  if (ONLY.has("PC")) {
    const sh = await mkShop("pc");
    const d = await mkDep(sh, { date: "2027-03-15" });
    const pc = `PC${hex(2)}`.toUpperCase(); const rule = await mkRule(sh, pc);
    const h = await hold(staff(sh), [line(sh.P, d, { promo: pc })]);
    const c = await confirm(h, { pay: "PAY_NOW" });
    await bookNow(staff(sh), [line(sh.P, d)]);
    RES.pc = { base: code(c), clean: await allInv(sh, [d]), controls: await positiveControls(sh, d, String(refs(c)[0]?.bookingId ?? ""), rule) };
    out("PC", RES.pc);
  }

  // ═══ SW: real short holds lapse → per-tenant sweeper → seats back, promo back ═══
  if (ONLY.has("SW")) {
    const sh = await mkShop("sw");
    await setV(sh, [{ key: "trips.sell.holdMinutes", scope: "UNIT", scopeId: sh.unitId, value: 1 }]);
    await setV(sh, [{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: sh.P2.id, value: "SHOP_CONFIRMS" }]);
    const now = () => new Date().toISOString();
    const cap = 6;
    const d = await mkDep(sh, { date: "2027-05-10", capacity: cap });
    const d2 = await mkDep(sh, { date: "2027-05-10", capacity: cap, P: sh.P2 });
    const pc = `SW${hex(2)}`.toUpperCase(); const rule = await mkRule(sh, pc);
    // HOLD bookings: 2 PUBLIC (one with promo) + 1 STAFF PAY_NOW (KEEP) · an open basket · PENDING on P2 (SHOP_CONFIRM, expiry pulled in via SQL in own tenant)
    const hp1 = await hold(pub(sh, { now: now() }), [line(sh.P, d, { a: 2, promo: pc })]);
    const cp1 = await confirm(hp1, { ctx: withNow(hp1.ctx, now()) });
    const hp2 = await hold(pub(sh, { now: now() }), [line(sh.P, d)]);
    const cp2 = await confirm(hp2, { ctx: withNow(hp2.ctx, now()) });
    const hs = await hold(staff(sh, { now: now() }), [line(sh.P, d)]);
    const cs = await confirm(hs, { ctx: withNow(hs.ctx, now()), pay: "PAY_NOW" });
    const ho = await hold(pub(sh, { now: now() }), [line(sh.P, d)]); // open basket, never confirmed
    const hpend = await hold(pub(sh, { now: now() }), [line(sh.P2, d2, { a: 2 })]);
    const cpend = await confirm(hpend, { ctx: withNow(hpend.ctx, now()) });
    bump("SW", 9);
    const ids = [cp1, cp2, cs, cpend].map((r) => String(refs(r)[0]?.bookingId ?? ""));
    const statuses = await Promise.all(ids.map(async (i) => (await bk(i)).status));
    const pendHold = (await holdsOf(ids[3]))[0];
    await q(`UPDATE "TripHold" SET "expiresAt" = now() + interval '50 seconds' WHERE id = $1 AND "tenantId" = $2`, [String(pendHold?.id), sh.tenantId]);
    const before = { d: await dep(d), d2: await dep(d2), rule: await ruleRow(rule), statuses, created: [cp1, cp2, cs, cpend, ho.r].map(code) };
    out("SW before", before);
    // guards while live
    const relBound = await call("releaseHold", staff(sh, { now: now() }), { holdId: String((await holdsOf(ids[1]))[0]?.id), reason: "x" });
    const extBound = await call("extendHold", staff(sh, { now: now() }), { holdId: String((await holdsOf(ids[1]))[0]?.id) });
    const relOpen = await call("releaseHold", staff(sh, { now: now() }), { holdId: String((ho.v.holdIds as string[])[0]), reason: "x" });
    const hoAgain = await hold(pub(sh, { now: now() }), [line(sh.P, d)]); // open basket again (keeps one unbound hold to expire)
    bump("SW", 4);
    out("SW guards", { releaseBoundHold: code(relBound), extendBoundHold: code(extBound), releaseOpenBasketHold: code(relOpen), newOpen: code(hoAgain.r) });
    // sold-out check before expiry
    const fullBefore = (await bookNow(staff(sh, { now: now() }), [line(sh.P, d, { a: 2 })])).r;
    bump("SW");
    const holdExp = Math.max(...[hp1, hp2, hs, hoAgain].map((h) => new Date(String(h.v.expiresAt)).getTime()), Date.now() + 55_000);
    const waitMs = Math.max(0, holdExp - Date.now()) + 5_000;
    out("SW wait", `${Math.round(waitMs / 1000)} s for real expiry`);
    await sleep(waitMs);
    // expired but not yet swept: confirm/approve must refuse
    const lateConfirm = await confirm(hoAgain, { ctx: withNow(hoAgain.ctx, now()) });
    bump("SW");
    const sweep = fnOf(T, "runExpireHolds");
    const sw = asRec(await sweep(new Date(), { tenantIds: [sh.tenantId] }));
    const sw2 = asRec(await sweep(new Date(), { tenantIds: [sh.tenantId] }));
    bump("SW", 2);
    const after = { d: await dep(d), d2: await dep(d2), bookings: await Promise.all(ids.map(async (i) => ({ st: (await bk(i)).status, holds: (await holdsOf(i)).map((h) => h.status) }))), rule: await ruleRow(rule) };
    const ev = await q<Rec>(`SELECT payload->>'bookingId' b FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.booking.expired'`, [sh.tenantId]);
    // consumer (event shape as delivered by outbox) for every expired booking
    const cons: string[] = [];
    for (const e of ev) cons.push(code(await call("onTripBookingExpired", { tenantId: sh.tenantId, unitId: sh.unitId, type: "trips.booking.expired", payload: { bookingId: e.b, unitId: sh.unitId } })));
    const ruleAfter = await ruleRow(rule);
    // seats sellable again
    const refill = (await bookNow(staff(sh, { now: now() }), [line(sh.P, d, { a: cap })])).r;
    const refill2 = (await bookNow(staff(sh, { now: now() }), [line(sh.P2, d2, { a: cap })])).r;
    bump("SW", 2 + ev.length);
    RES.sw = { before, fullBeforeExpiry: code(fullBefore), lateConfirmAfterExpiryBeforeSweep: code(lateConfirm), sweep: sw, sweepAgain: sw2, after, expiredEvents: ev.length, consumer: cons, ruleAfterConsumer: ruleAfter, refillAllSeats: code(refill), refillP2: code(refill2), inv: await check("SW", sh, [d, d2], "after") };
    out("SW", RES.sw);
    const a = asRec(after);
    const stuck = Number(asRec(a.d).held) !== 0 || Number(asRec(a.d2).held) !== 0 || asArr(a.bookings).some((b) => b.st !== "EXPIRED") || refill.ok !== true || refill2.ok !== true;
    if (stuck) finding("SW-stuck", "BLOCKER", "unpaid bookings did not expire / seats not returned after real expiry + tenant-scoped sweep", RES.sw);
    if (Number(asRec(ruleAfter).usedCount) !== 0 || Number(asRec(ruleAfter).act) !== 0) finding("SW-promo", "MAJOR", "promo not released after expiry handler", ruleAfter);
  }

  // ═══ Z: approve with nothing due at booking ═══
  if (ONLY.has("Z")) {
    const sh = await mkShop("z");
    const P3 = await mkProd(sh.tenantId, sh.unitId, "z3");
    let mode = "deposit0";
    try {
      await setV(sh, [{ key: "trips.sell.confirmMode", scope: "PRODUCT", scopeId: P3.id, value: "SHOP_CONFIRMS" }]);
      await setV(sh, [{ key: "trips.pay.balanceDueDaysBefore", scope: "PRODUCT", scopeId: P3.id, value: 3 }, { key: "trips.pay.depositPct", scope: "PRODUCT", scopeId: P3.id, value: 0 }]);
    } catch (e) { mode = `settings failed: ${String(e).slice(0, 120)}`; }
    const pc = `ZZ${hex(2)}`.toUpperCase(); const rule = await mkRule(sh, pc, 50);
    const mkPend = async (d: string, a = 1, promo = true): Promise<Rec> => { const h = await hold(pub(sh), [line(P3, d, { a, ...(promo ? { promo: pc } : {}) })]); const c = await confirm(h); bump("Z", 2); return { ...asRec(refs(c)[0]), r: c }; };
    const d = await mkDep(sh, { date: "2027-05-20", capacity: 40, P: P3 });
    const p0 = await mkPend(d, 2);
    const snap = (await q<Rec>(`SELECT "policySnapshot"->'paymentSchedule' s FROM "TripBooking" WHERE id = $1`, [String(p0.bookingId)]))[0]?.s;
    const before = await dep(d);
    const ap = await call("approveTripBooking", staff(sh), { bookingId: String(p0.bookingId), expectedVersion: 0, decision: "APPROVE" });
    const ap2 = await call("approveTripBooking", staff(sh), { bookingId: String(p0.bookingId), expectedVersion: 0, decision: "APPROVE" });
    const after = await dep(d);
    const b0 = await bk(p0.bookingId);
    const h0 = await holdsOf(p0.bookingId);
    const evC = (await q<{ n: number }>(`SELECT count(*)::int n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = 'trips.booking.confirmed' AND payload->>'bookingId' = $2`, [sh.tenantId, String(p0.bookingId)]))[0].n;
    const red0 = await q<Rec>(`SELECT status FROM "TripPromoRedemption" WHERE "bookingId" = $1`, [String(p0.bookingId)]);
    bump("Z", 2);
    RES.z = { mode, pendingStatus: p0.status, created: code(asRec(p0.r)), schedule: snap, approve: code(ap), approveAgain: code(ap2), booking: b0, holds: h0.map((h) => h.status), depBefore: before, depAfter: after, confirmedEvents: evC, redemptions: red0 };
    out("Z approve-nothing-due", RES.z);
    if (ap.ok === true && (b0.status !== "CONFIRMED" || h0.some((h) => h.status !== "CONVERTED") || Number(after.sold) !== Number(before.sold) + 2 || Number(after.held) !== Number(before.held) - 2)) finding("Z-approve", "MAJOR", "approve with nothing due did not convert cleanly", RES.z);
    // races: ×5 parallel APPROVE same version on 6 bookings; approve∥reject∥cancel on 6 more
    const ps = await Promise.all(Array.from({ length: 6 }, () => mkPend(d)));
    const dbl = await Promise.all(ps.map((p) => Promise.all(Array.from({ length: 5 }, () => call("approveTripBooking", staff(sh), { bookingId: String(p.bookingId), expectedVersion: 0, decision: "APPROVE" })))));
    bump("Z", 30);
    const dblWinners = dbl.map((rs) => rs.filter((r) => r.ok === true).length);
    const qs = await Promise.all(Array.from({ length: 6 }, () => mkPend(d)));
    const tri = await Promise.all(qs.map((p) => Promise.all([
      call("approveTripBooking", staff(sh), { bookingId: String(p.bookingId), expectedVersion: 0, decision: "APPROVE" }),
      call("approveTripBooking", staff(sh), { bookingId: String(p.bookingId), expectedVersion: 0, decision: "REJECT", reason: "race" }),
      call("cancelTripBooking", staff(sh), { bookingId: String(p.bookingId), mode: "EXECUTE", reason: "race", idempotencyKey: `x${hex(6)}` }),
    ])));
    bump("Z", 18);
    const triRes = tri.map((rs) => rs.map(code));
    const triWin = tri.map((rs) => rs.filter((r) => r.ok === true).length);
    const reds = await q<Rec>(`SELECT "bookingId", status, count(*)::int n FROM "TripPromoRedemption" WHERE "tenantId" = $1 GROUP BY "bookingId", status`, [sh.tenantId]);
    RES.zRaces = { doubleApproveWinners: dblWinners, approveRejectCancel: triRes, triWinners: triWin, redemptionRows: reds.length, multi: reds.filter((r) => Number(r.n) > 1), rule: await ruleRow(rule), dep: await dep(d) };
    out("Z races", RES.zRaces);
    if (dblWinners.some((n) => n !== 1)) finding("Z-double", "BLOCKER", "double approve: not exactly one winner", dblWinners);
    if (tri.some((rs) => rs[0].ok === true && rs[1].ok === true)) finding("Z-ar", "BLOCKER", "approve and reject both succeeded", triRes);
    // approve(CONFIRMED)∥cancel: cancel after CONFIRMED must be REFUND_REQUIRED
    await check("Z", sh, [d], "z");
    // approve after option disabled ⇒ refused (R8)
    const p9 = await mkPend(d, 1, false);
    const tctx = { tenantId: sh.tenantId, actorUserId: sh.userId };
    const off = await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: P3.opt, active: false });
    const ap9 = await call("approveTripBooking", staff(sh), { bookingId: String(p9.bookingId), expectedVersion: 0, decision: "APPROVE" });
    const rj9 = await call("approveTripBooking", staff(sh), { bookingId: String(p9.bookingId), expectedVersion: 0, decision: "REJECT", reason: "option closed" });
    await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: P3.opt, active: true });
    bump("Z", 4);
    RES.zOption = { disable: code(off), approve: code(ap9), rejectAfter: code(rj9) };
    out("Z option", RES.zOption);
    await check("Z", sh, [d], "z-option");
  }

  // ═══ CH: change attacks ═══
  if (ONLY.has("CH")) {
    const sh = await mkShop("ch");
    const tctx = { tenantId: sh.tenantId, actorUserId: sh.userId };
    const res: Rec = {};
    const changeReq = async (ctx: Rec, bookingId: string, ln: Rec, extra: Rec = {}) => {
      const b = await bk(bookingId);
      const qr = await call("quoteTrips", ctx, { lines: [ln] }, {});
      if (qr.ok !== true) return { ...qr, __stage: "quote" } as Rec;
      return { bookingId, expectedVersion: Number(b.version), line: ln, quoteId: asRec(qr.value).quoteId, quoteExpiresAt: asRec(qr.value).expiresAt, idempotencyKey: `g${hex(6)}`, ...extra } as Rec;
    };
    const change = async (ctx: Rec, req: Rec) => (req.__stage ? req : call("changeTripBooking", ctx, req, {}));
    // target option disabled mid-change (session advisory lock on the booking's change key blocks the tx after prepare)
    {
      const A = await mkDep(sh, { date: "2027-06-01" });
      const B = await mkDep(sh, { date: "2027-06-02" });
      await q(`UPDATE "TripDeparture" SET "optionId" = $2 WHERE id = $1`, [B, sh.P.opt2]);
      const b = refs((await bookNow(staff(sh), [line(sh.P, A)])).r)[0];
      const rq = await changeReq(staff(sh), String(b?.bookingId), line(sh.P, B, { opt: sh.P.opt2 }));
      const c = await pool().connect();
      await c.query("BEGIN");
      await c.query(`SELECT pg_advisory_xact_lock(hashtext('trips.booking.v1'), hashtext('change:' || $1::text))`, [String(b?.bookingId)]); // xact-level: pgbouncer pins the server connection for the tx
      const pr = change(staff(sh), rq);
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) { const r = await q<{ n: number }>(`SELECT count(*)::int n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`); blocked = r[0].n > 0; if (!blocked) await sleep(100); }
      const off = await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt2, active: false });
      await c.query("COMMIT"); c.release();
      const r = await pr;
      await call("setOptionActive", tctx, { unitId: sh.unitId, optionId: sh.P.opt2, active: true });
      bump("CH", 4);
      res.optionDisabledMidChange = `blocked=${blocked} disable=${code(off)} change=${code(r)} booking=${(await bk(b?.bookingId)).departureId === B ? "MOVED" : "stayed"}`;
      if (r.ok === true && off.ok === true) finding("CH-option", "MAJOR", "change moved a booking onto a departure whose option was disabled before the change tx locked products", res.optionDisabledMidChange);
      await check("CH", sh, [A, B], "option");
    }
    // too many passengers after shrink
    {
      const A = await mkDep(sh, { date: "2027-06-03" });
      const b = refs((await bookNow(staff(sh), [line(sh.P, A, { a: 2 })], { extra: { passengers: [{ name: "หนึ่ง", paxTypeId: sh.P.pt.ADULT }, { name: "สอง", paxTypeId: sh.P.pt.ADULT }] } })).r)[0];
      res.shrinkWithPassengers = code(await change(staff(sh), await changeReq(staff(sh), String(b?.bookingId), line(sh.P, A, { a: 1 }))));
      res.swapPaxTypeWithPassengers = code(await change(staff(sh), await changeReq(staff(sh), String(b?.bookingId), line(sh.P, A, { a: 0, c: 2 }))));
      bump("CH", 4);
    }
    // PART_PAID / PAID / HOLD refused
    {
      const A = await mkDep(sh, { date: "2027-06-04" });
      for (const st of ["PART_PAID", "PAID"]) {
        const b = refs((await bookNow(staff(sh), [line(sh.P, A)])).r)[0];
        await q(`UPDATE "TripBooking" SET status = $2 WHERE id = $1 AND "tenantId" = $3`, [String(b?.bookingId), st, sh.tenantId]);
        res[`change ${st}`] = code(await change(staff(sh), await changeReq(staff(sh), String(b?.bookingId), line(sh.P, A, { a: 2 }))));
        await q(`UPDATE "TripBooking" SET status = 'CONFIRMED' WHERE id = $1 AND "tenantId" = $2`, [String(b?.bookingId), sh.tenantId]);
        bump("CH", 3);
      }
      const hb = refs(await confirm(await hold(pub(sh), [line(sh.P, A)])))[0];
      res["change HOLD booking"] = code(await change(staff(sh), await changeReq(staff(sh), String(hb?.bookingId), line(sh.P, A, { a: 2 }))));
      bump("CH", 3);
      await check("CH", sh, [A], "states");
    }
    // 50 random moves between 3 departures (random pax 1–3), concurrent per wave
    {
      const deps = [await mkDep(sh, { date: "2027-06-10", capacity: 14 }), await mkDep(sh, { date: "2027-06-11", capacity: 14 }), await mkDep(sh, { date: "2027-06-12", capacity: 14 })];
      const bks: string[] = [];
      for (let i = 0; i < 12; i++) { const r = (await bookNow(staff(sh), [line(sh.P, deps[i % 3], { a: 1 + (i % 2) })])).r; if (r.ok === true) bks.push(String(refs(r)[0]?.bookingId)); bump("CH"); }
      let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
      const all: Rec[] = [];
      let done = 0; const dl0 = (await dbStats()).deadlocks;
      while (done < MOVES) {
        const wave = Math.min(10, MOVES - done);
        const pick = Array.from({ length: wave }, () => bks[rnd(bks.length)]);
        const rs = await Promise.all(pick.map(async (id) => change(staff(sh), await changeReq(staff(sh), id, line(sh.P, deps[rnd(3)], { a: 1 + rnd(3) })))));
        all.push(...rs); done += wave; bump("CH", wave * 2);
        const v = await check("CH", sh, deps, `moves ${done}`);
        if (v.length) break;
      }
      res.randomMoves = { n: all.length, tally: tally(all), deps: await Promise.all(deps.map(dep)), deadlocksDbWideDelta: (await dbStats()).deadlocks - dl0 };
      out("CH moves", res.randomMoves);
      if (all.some((r) => r.ok === "THROW" || r.code === "BUSY")) finding("CH-moves", "MAJOR", "random moves threw/BUSY", tally(all));
    }
    // dropPromo:true releases redemption; then the code can be used again
    {
      const A = await mkDep(sh, { date: "2027-06-05" });
      const pc = `CP${hex(2)}`.toUpperCase(); const rule = await mkRule(sh, pc, 1);
      const b = refs((await bookNow(staff(sh), [line(sh.P, A, { a: 2, promo: pc })])).r)[0];
      const second0 = (await bookNow(staff(sh), [line(sh.P, A, { promo: pc })])).r;
      const r1 = await change(staff(sh), await changeReq(staff(sh), String(b?.bookingId), line(sh.P, A, { a: 2 }), { dropPromo: true }));
      const r1b = await change(staff(sh), await changeReq(staff(sh), String(b?.bookingId), line(sh.P, A, { a: 2 }), { dropPromo: true }));
      const second1 = (await bookNow(staff(sh), [line(sh.P, A, { promo: pc })])).r;
      bump("CH", 7);
      res.dropPromo = { firstUse: "ok", secondBeforeDrop: code(second0), change: code(r1), changeAgainNoPromo: code(r1b), secondAfterDrop: code(second1), rule: await ruleRow(rule), booking: await bk(b?.bookingId) };
      out("CH dropPromo", res.dropPromo);
      await check("CH", sh, [A], "dropPromo");
    }
    RES.ch = res;
    out("CH", res);
  }

  const sm = await sampler();
  const s1 = await dbStats();
  console.log("\n===== SUMMARY =====");
  console.log(JSON.stringify({ ops, stats, violations, findings, RES, pool: { ...sm, deadlocksDbWideDelta: s1.deadlocks - s0.deadlocks } }, null, 1));
}

let rc = 0;
try { await main(); } catch (e) { console.error("probe crashed", e); rc = 2; }
finally { try { await cleanup(); } catch (e) { console.error("cleanup", e); } await shutdown(); }
process.exit(rc);
