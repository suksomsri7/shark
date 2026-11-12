// probe-trips-t0.4-waitlist.mts — นักล่า T0.4 ข้อ 6 (รายการรอ + เสนอที่) · untracked
import {
  NOW0, STAFF, addMin, asRec, boot, brief, call, cleanup, fmt, fnOf, ikey, inTx, insertRow, invCheck, mkDep, mkShop, mods, out, q, rawLeak, setV, shutdown, unnamed,
  type Rec, type Shop,
} from "./probe-trips-t0.4-lib.mjs";

boot("probe-trips-t0.4-waitlist");
const findings: string[] = [];
const F = (s: string) => { findings.push(s); console.log(`  🔴 ${s}`); };
const AFTER_WEB = new Date("2027-03-09T12:00:00.000Z");
type W = { id: string; partyId: string; status: string; qty: number; offerHoldId: string | null; createdAt: Date };
const wl = async (dep: string) => q<W>(`SELECT id, "partyId", status, qty, "offerHoldId", "createdAt" FROM "TripWaitlist" WHERE "departureId" = $1 ORDER BY "createdAt", id`, [dep]);
const offered = async (dep: string) => (await wl(dep)).filter((w) => w.status === "OFFERED");
const chk = (tag: string, r: Rec) => { if (rawLeak(r) || unnamed(r)) F(`${tag}: raw/unnamed ${fmt(r).slice(0, 300)}`); return r; };

async function globalChecks(dep: string, tag: string) {
  const ws = await wl(dep);
  const byParty = new Map<string, number>();
  for (const w of ws) if (w.status === "OFFERED" || w.status === "WAITING") byParty.set(w.partyId, (byParty.get(w.partyId) ?? 0) + 1);
  for (const [p, n] of byParty) if (n > 1) F(`${tag}: party ${p.slice(-6)} has ${n} WAITING/OFFERED rows`);
  const offerHolds = await q<{ n: number; wid: string }>(`SELECT count(*)::int AS n, "idempotencyKey" AS wid FROM "TripHold" WHERE "departureId" = $1 AND purpose = 'WAITLIST_OFFER' GROUP BY "idempotencyKey" HAVING count(*) > 1`, [dep]);
  for (const x of offerHolds) F(`${tag}: ${x.n} offer holds for ${x.wid}`);
  const bad = await q<Rec>(`SELECT w.id, w.status, h.status AS hs FROM "TripWaitlist" w LEFT JOIN "TripHold" h ON h.id = w."offerHoldId" WHERE w."departureId" = $1 AND ((w.status = 'OFFERED' AND (h.status IS DISTINCT FROM 'ACTIVE')) OR (w.status = 'ACCEPTED' AND h.status IS DISTINCT FROM 'CONVERTED'))`, [dep]);
  for (const b of bad) F(`${tag}: waitlist/hold mismatch ${fmt(b)}`);
  const activeOffers = await q<Rec>(`SELECT h.id FROM "TripHold" h WHERE h."departureId" = $1 AND h.purpose = 'WAITLIST_OFFER' AND h.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "TripWaitlist" w WHERE w."offerHoldId" = h.id AND w.status = 'OFFERED')`, [dep]);
  for (const b of activeOffers) F(`${tag}: ACTIVE offer hold without OFFERED waitlist row ${fmt(b)}`);
  for (const v of (await invCheck([dep])).viol) F(`${tag}: invariant ${v}`);
}

async function run(sh: Shop) {
  const { T } = await mods();
  const parties: string[] = [];
  for (let i = 0; i < 14; i++) parties.push(await insertRow("Party", { tenantId: sh.tenantId, name: `ผู้รอ ${i}`, updatedAt: new Date() }));
  // รอบ: ความจุ 6 ขาย 5 + STAFF hold 1 (ไว้ปล่อยด้วยตัวกวาด) → เต็ม
  const dep = await mkDep(sh, { capacity: 6, sold: 5 });
  const sweepHold = String(asRec((await call("placeHold", STAFF(sh), { departureId: dep, qty: 1, idempotencyKey: ikey() })).value).holdId);
  const st0 = (await invCheck([dep])).rows[0];
  out("wl setup", { c: st0.capacity, s: st0.sold, h: st0.held, status: st0.status });
  // 12 คนฝากชื่อพร้อมกัน (4 คนแรกส่งสองครั้ง)
  const joins: Promise<Rec>[] = [];
  for (let i = 0; i < 12; i++) {
    joins.push(call("joinWaitlist", STAFF(sh), { departureId: dep, qty: 1, partyId: parties[i], idempotencyKey: ikey() }));
    if (i < 4) joins.push(call("joinWaitlist", STAFF(sh), { departureId: dep, qty: 1, partyId: parties[i], idempotencyKey: ikey() }));
  }
  const jr = await Promise.all(joins);
  jr.forEach((r) => chk("join", r));
  const ws = await wl(dep);
  const dupOk = jr.filter((r) => r.ok === true && asRec(r.value).duplicated === true).length;
  out("wl join 12 (+4 dup) parallel", { rows: ws.length, ok: jr.filter((r) => r.ok === true).length, duplicated: dupOk, codes: [...new Set(jr.map(brief))] });
  if (ws.length !== 12 || dupOk !== 4) F(`waitlist join: rows ${ws.length} dup ${dupOk} (expected 12 / 4)`);
  const order = ws.map((w) => w.id);
  const l1 = asRec((await call("listWaitlist", STAFF(sh), { departureId: dep })).value);
  const l2 = asRec((await call("listWaitlist", STAFF(sh), { departureId: dep })).value);
  if (fmt(l1) !== fmt(l2)) F("waitlist list not stable");
  const listOrder = (l1.items as Rec[]).map((x) => String(x.id));
  if (fmt(listOrder) !== fmt(order)) F(`waitlist list order ≠ (createdAt,id)`);
  let headIdx = 0;
  const expectOffer = async (tag: string, n = 1) => {
    const off = await offered(dep);
    const want = order.slice(headIdx, headIdx + n);
    const got = off.map((w) => w.id).filter((id) => want.includes(id));
    if (got.length !== n) F(`${tag}: expected offer to ${want.map((x) => order.indexOf(x) + 1).join(",")} got OFFERED positions ${off.map((w) => order.indexOf(w.id) + 1).join(",")}`);
    headIdx += n;
    await globalChecks(dep, tag);
    const d = (await invCheck([dep])).rows[0];
    return { off: off.map((w) => order.indexOf(w.id) + 1), held: d.held, sold: d.sold, status: d.status };
  };
  // (1) ตัวกวาดปล่อย STAFF hold (PAYMENT 15 นาที) → เสนอหัวคิว
  const sw1 = await call("runExpireHolds", addMin(NOW0, 16), { tenantIds: [sh.tenantId] });
  out("wl (1) sweeper frees 1", { sweep: { expired: sw1.expired, offered: sw1.offered, failed: sw1.failed }, ...(await expectOffer("wl-sweeper")) });
  void sweepHold;
  // (2) return 1 ที่ขาย → เสนอคนที่ 2
  chk("return", await call("returnSold", STAFF(sh, addMin(NOW0, 17)), { departureId: dep, qty: 1 }));
  out("wl (2) returnSold frees 1", await expectOffer("wl-return"));
  // (3) ความจุ +1 → ไม่เสนอทันที · ทริกเกอร์ซ้ำ ×5 ⇒ ข้อเสนอเดียว
  const cap = await call("setDepartureCapacity", sh.tctx, { unitId: sh.unitId, departureId: dep, capacity: 7 }, { now: addMin(NOW0, 18) });
  const afterCap = (await offered(dep)).length;
  const trig = await Promise.all(Array.from({ length: 5 }, () => fnOf(T, "onWaitlistTrigger")({ tenantId: sh.tenantId, payload: { departureId: dep } }).then(() => "ok", (e: unknown) => `THROW ${String(e).slice(0, 200)}`)));
  out("wl (3) capacity+1 then trigger x5", { cap: brief(cap), offeredRightAfterCap: afterCap, triggers: trig, ...(await expectOffer("wl-capacity+trigger")) });
  for (const t of trig) if (t !== "ok") F(`wl trigger: ${t}`);
  // (4) ปล่อย hold (STAFF ถือ 1 ที่ตอนว่าง) — สร้างที่ว่างด้วยความจุ +1 แล้วให้ STAFF ถือก่อนงาน แล้วปล่อย
  await call("setDepartureCapacity", sh.tctx, { unitId: sh.unitId, departureId: dep, capacity: 8 }, { now: addMin(NOW0, 19) });
  const staffH = await call("placeHold", STAFF(sh, addMin(NOW0, 19)), { departureId: dep, qty: 1, idempotencyKey: ikey() });
  out("wl (4a) seat freed by capacity → STAFF jumps the queue?", { staffHold: brief(staffH), waiting: (await wl(dep)).filter((w) => w.status === "WAITING").length });
  if (staffH.ok === true) {
    chk("release", await call("releaseHold", STAFF(sh, addMin(NOW0, 20)), { holdId: String(asRec(staffH.value).holdId), reason: "free for waitlist" }));
    out("wl (4) release hold frees 1", await expectOffer("wl-release"));
  }
  // (5) ข้อเสนอหัวคิวแรกหมดเวลา (T9 30 นาที จาก +16) → คนถัดไป (ใน tx ของตัวกวาด)
  const offBefore = await offered(dep);
  const sw2 = await call("runExpireHolds", addMin(NOW0, 16 + 30), { tenantIds: [sh.tenantId] });
  const offAfter = await offered(dep);
  out("wl (5) first offer lapses", { sweep: { expired: sw2.expired, offered: sw2.offered }, offeredBefore: offBefore.map((w) => order.indexOf(w.id) + 1), offeredAfter: offAfter.map((w) => order.indexOf(w.id) + 1) });
  headIdx += Number(sw2.offered ?? 0);
  if (Number(sw2.expired) < 1 || Number(sw2.offered) !== Number(sw2.expired)) F(`wl lapse: expired ${String(sw2.expired)} offered ${String(sw2.offered)} (each lapsed seat should go to next)`);
  await globalChecks(dep, "wl-lapse");
  // (6) ผู้ได้ข้อเสนอ convert vs ข้อเสนอหมดเวลา ณ เวลาเดียวกัน (×N ที่มีอยู่)
  const offs = await offered(dep);
  const exps = await q<{ id: string; e: Date }>(`SELECT id, "expiresAt" AS e FROM "TripHold" WHERE id = ANY($1::text[])`, [offs.map((w) => w.offerHoldId)]);
  const raceRes = await Promise.all(exps.map((x) => Promise.all([
    inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh, new Date(new Date(x.e).getTime() - 1)), { holdId: x.id })),
    call("runExpireHolds", new Date(x.e), { tenantIds: [sh.tenantId] }),
  ])));
  const wsAfter = await wl(dep);
  const conv = raceRes.map((p, i) => ({ convert: brief(p[0]), wl: wsAfter.find((w) => w.offerHoldId === exps[i].id)?.status }));
  out("wl (6) offered convert vs lapse same instant", conv);
  for (const c of conv) if (!((c.convert === "ok" && c.wl === "ACCEPTED") || (c.convert === "HOLD_EXPIRED" && c.wl === "EXPIRED"))) F(`wl convert-vs-lapse: ${fmt(c)}`);
  await globalChecks(dep, "wl-convert-vs-lapse");
  // (7) ปฏิเสธข้อเสนอ → คนถัดไป
  let off7 = await offered(dep);
  if (!off7.length) { await call("setDepartureCapacity", sh.tctx, { unitId: sh.unitId, departureId: dep, capacity: (await invCheck([dep])).rows[0].capacity + 1 }, { now: addMin(NOW0, 60) }); await call("runWaitlistOffers", addMin(NOW0, 60), { tenantIds: [sh.tenantId] }); off7 = await offered(dep); }
  if (off7.length) {
    const dec = await call("declineWaitlistOffer", STAFF(sh, addMin(NOW0, 61)), { waitlistId: off7[0].id });
    out("wl (7) decline", { decline: brief(dec), offeredNext: (dec.ok === true ? asRec(dec.value).offered : null), offeredNow: (await offered(dep)).map((w) => order.indexOf(w.id) + 1) });
    await globalChecks(dep, "wl-decline");
  }
  // (8) หลังปิดรับเว็บ: คืนที่ → ไม่เสนอ · งานเปลี่ยน WAITING → EXPIRED · ข้อเสนอที่ยังค้าง?
  const waitingBefore = (await wl(dep)).filter((w) => w.status === "WAITING").length;
  const offeredBefore8 = (await offered(dep)).length;
  const ret8 = await call("returnSold", STAFF(sh, AFTER_WEB), { departureId: dep, qty: 1 });
  const offeredAfterRet = (await offered(dep)).length;
  const job8 = await call("runWaitlistOffers", AFTER_WEB, { tenantIds: [sh.tenantId] });
  const ws8 = await wl(dep);
  out("wl (8) after web cutoff", { return: brief(ret8), waitingBefore, offeredBefore: offeredBefore8, offeredAfterReturn: offeredAfterRet, job: { offered: job8.offered, expired: job8.expired }, statuses: ws8.reduce<Record<string, number>>((a, w) => ({ ...a, [w.status]: (a[w.status] ?? 0) + 1 }), {}) });
  if (offeredAfterRet > offeredBefore8) F(`wl: offer made after web cutoff`);
  if (ws8.some((w) => w.status === "WAITING")) F(`wl: WAITING rows remain after cutoff job`);
  await globalChecks(dep, "wl-cutoff");
  // ข้อเสนอค้างตอนปิดรับ → หมดเวลา → ที่กลับเข้ากอง
  const fin = await call("runExpireHolds", addMin(AFTER_WEB, 60 * 24), { tenantIds: [sh.tenantId] });
  const dEnd = (await invCheck([dep])).rows[0];
  out("wl end", { finalSweep: { expired: fin.expired, offered: fin.offered }, dep: { c: dEnd.capacity, s: dEnd.sold, h: dEnd.held, status: dEnd.status }, offeredLeft: (await offered(dep)).length });
  if (dEnd.held !== 0) F(`wl: held ${dEnd.held} after all offers lapsed`);
  await globalChecks(dep, "wl-end");

  // (9) รอบยกเลิก (ตั้งด้วย SQL) + ที่ว่าง → งานไม่เสนอ · WAITING → EXPIRED
  const dc = await mkDep(sh, { capacity: 3, sold: 3, status: "FULL" });
  for (let i = 0; i < 3; i++) await call("joinWaitlist", STAFF(sh), { departureId: dc, qty: 1, partyId: parties[i], idempotencyKey: ikey() });
  await q(`UPDATE "TripDeparture" SET status = 'CANCELLED', sold = 0 WHERE id = $1`, [dc]);
  const job9 = await call("runWaitlistOffers", addMin(NOW0, 70), { tenantIds: [sh.tenantId] });
  const ws9 = await wl(dc);
  out("wl (9) cancelled departure", { job: { offered: job9.offered, expired: job9.expired, failed: job9.failed }, statuses: ws9.map((w) => w.status) });
  if (ws9.some((w) => w.status === "OFFERED")) F("wl: offer on cancelled departure");
  // (10) FIFO เคร่ง: หัวคิวขอ 2 · ว่าง 1 → ไม่ข้ามไปคนที่ขอ 1
  const df = await mkDep(sh, { capacity: 4, sold: 4, status: "FULL" });
  await call("joinWaitlist", STAFF(sh), { departureId: df, qty: 2, partyId: parties[12], idempotencyKey: ikey() });
  await call("joinWaitlist", STAFF(sh), { departureId: df, qty: 1, partyId: parties[13], idempotencyKey: ikey() });
  await call("returnSold", STAFF(sh), { departureId: df, qty: 1 });
  const offF = await offered(df);
  const pubAfter = await call("placeHold", { ...STAFF(sh), channel: "WEB", actor: { kind: "PUBLIC", clientKey: "ckfifo" } }, { departureId: df, qty: 1, idempotencyKey: ikey(), capKey: "basket:fifotest123" });
  const joinNew = await call("joinWaitlist", STAFF(sh), { departureId: df, qty: 1, partyId: parties[11], idempotencyKey: ikey() });
  out("wl (10) strict FIFO head needs 2, 1 free", { offered: offF.length, publicHoldTakesSeatAheadOfQueue: brief(pubAfter), newJoinWhileSeatFree: `${brief(joinNew)} ${fmt(joinNew.details ?? "")}` });
  // (11) ปล่อยสอง hold พร้อมกันบนคิวยาว → ข้อเสนอสองคนต่างกัน
  const dd = await mkDep(sh, { capacity: 4, sold: 2 });
  const hA = String(asRec((await call("placeHold", STAFF(sh), { departureId: dd, qty: 1, idempotencyKey: ikey() })).value).holdId);
  const hB = String(asRec((await call("placeHold", STAFF(sh), { departureId: dd, qty: 1, idempotencyKey: ikey() })).value).holdId);
  for (let i = 0; i < 6; i++) await call("joinWaitlist", STAFF(sh), { departureId: dd, qty: 1, partyId: parties[i], idempotencyKey: ikey() });
  const rr = await Promise.all([call("releaseHold", STAFF(sh), { holdId: hA, reason: "a" }), call("releaseHold", STAFF(sh), { holdId: hB, reason: "b" }), fnOf(T, "onWaitlistTrigger")({ tenantId: sh.tenantId, payload: { departureId: dd } }).then(() => ({ ok: true }))]);
  const o11 = await offered(dd);
  const ord11 = (await wl(dd)).map((w) => w.id);
  out("wl (11) two releases in parallel", { rel: rr.map((x) => brief(x as Rec)), offeredPositions: o11.map((w) => ord11.indexOf(w.id) + 1) });
  if (o11.length !== 2 || !o11.every((w) => ord11.indexOf(w.id) < 2)) F(`wl parallel releases: offered ${o11.map((w) => ord11.indexOf(w.id) + 1).join(",")}`);
  await globalChecks(dd, "wl-parallel");
  // (12) leave ขณะ OFFERED พร้อม convert ของข้อเสนอเดียวกัน
  const o12 = (await offered(dd))[0];
  if (o12?.offerHoldId) {
    const [lv, cv] = await Promise.all([call("leaveWaitlist", STAFF(sh), { waitlistId: o12.id }), inTx(sh.tenantId, sh.unitId, (tx) => fnOf(T, "convertHoldInTx")(tx, STAFF(sh), { holdId: String(o12.offerHoldId) }))]);
    const w12 = (await wl(dd)).find((w) => w.id === o12.id);
    const h12 = (await q<{ status: string }>(`SELECT status FROM "TripHold" WHERE id = $1`, [o12.offerHoldId]))[0];
    out("wl (12) leave vs convert of same offer", { leave: brief(lv), convert: brief(cv), waitlist: w12?.status, hold: h12?.status });
    if ((lv.ok === true) === (cv.ok === true)) F(`wl leave-vs-convert: both or neither succeeded leave=${brief(lv)} convert=${brief(cv)} wl=${w12?.status} hold=${h12?.status}`);
    await globalChecks(dd, "wl-leave-vs-convert");
  }
}

try {
  const sh = await mkShop("wl");
  await setV(sh, [{ key: "trips.sell.cutoff", scope: "UNIT", scopeId: sh.unitId, value: { daysBefore: 1, atMin: 1080, perChannel: { COUNTER: { daysBefore: 0, atMin: 420 } } } }]);
  await run(sh);
} catch (e) {
  F(`probe crashed: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  try { await cleanup(); } catch (e) { console.log("cleanup err", e); }
  console.log(`\n=== waitlist findings ${findings.length} ===`);
  for (const f of [...new Set(findings)]) console.log(" -", f);
  await shutdown();
}
