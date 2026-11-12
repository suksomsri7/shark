// probe ผู้ตรวจ H.8 รอบ B (เงิน: สลิปมัดจำ ↔ ใบรับ POS · จ่ายช้า · คืนเงินเมื่อแขกยกเลิกตาม snapshot · กลุ่มหลายห้อง · ปัดเศษ · คูปอง)
//   แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {total,passed,failed,skipped}" (ผู้คุมยกเข้าทรีเป็น regression ได้)
//   ร้าน/ผู้ใช้ชั่วคราว prefix h8rb- ลบใน finally · ไม่แตะฉาก svcqc · ไม่ drain outbox ทั้งฐาน (เรียก consumer ตรง)
// รัน (cwd ทรี):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h8-review-b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from "node:crypto";
type Any = any;

import { loadSvcQcEnv } from "./svc-qc-env.mjs";
loadSvcQcEnv("probe-h8-review-b");
if (process.env.CI) { console.error("🔴 ห้าม export CI"); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error("🔴 APP_ENV=production"); process.exit(4); }
delete process.env.SVC_QC_CLOCK;

// ── harness ──
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: string; why: string }[] = [];
class AF extends Error {}
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const ok = (c: unknown, why: string) => { if (!c) throw new AF(why); };
const eq = (a: unknown, b: unknown, what: string) => ok(J(a) === J(b), `${what}: ได้ ${J(a)} ต้อง ${J(b)}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const st = async (id: string, sev: string, name: string, fn: () => Promise<unknown>) => {
  try { await fn(); cks.push({ id, res: "PASS", sev, why: "" }); console.log(`  ✅ [${id}] ${name}`); }
  catch (e) { const why = e instanceof AF ? e.message : `throw: ${errMsg(e)}`; cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] (${sev}) ${name} — ${why}`); }
};
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${r?.code ?? J(r)} ${r?.reason ?? ""}`); return r; };
const code = (r: Any) => (r?.ok === true ? "ok" : String(r?.code ?? J(r)));
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SLUG = "h8rb-";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const uid = () => randomBytes(6).toString("hex");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const withClock = async <T,>(fn: () => Promise<T>): Promise<T> => { process.env.SVC_QC_CLOCK = "1"; try { return await fn(); } finally { delete process.env.SVC_QC_CLOCK; } };

const { prisma } = (await import("@/lib/core/db")) as Any;
const HOTEL = (await import("@/lib/modules/hotel")) as Any;
const WEB = (await import("@/lib/platform/hotel-web")) as Any;
const SET = (await import("@/lib/core/settings")) as Any;
const SV = (await import("@/lib/payment/slip-verify")) as Any;
const SYS = (await import("@/lib/modules/system/service")) as Any;
const COUPON = (await import("@/lib/modules/coupon")) as Any;
const CONS = (await import("@/lib/outbox-consumers")) as Any;

const tenantIds: string[] = [];
const slugPairs: string[] = [];
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  for (const t of ["RoomOccupancy", "HotelBookingNight", "PaymentSlip"]) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { /* FK */ }
  }
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 16 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
}
async function cleanupBuckets() {
  for (const p of slugPairs) { try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `hw:%:${sha(p).slice(0, 12)}:%`); } catch { /* */ } }
}
async function cleanupUsers() { try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); } }

let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: Any) => t.id));
  await cleanupUsers();

  // ═══ ตั้งร้าน (POS + ผู้รับพร้อมเพย์ + คูปอง) ═══
  const slugA = `${SLUG}a-${RUN}`;
  const tA = (await prisma.tenant.create({ data: { name: "QC H8 review B", slug: slugA } })).id as string;
  tenantIds.push(tA);
  const ctxA = { tenantId: tA };
  const US = `h8rb-u-${RUN}`;
  slugPairs.push(`${slugA}/${US}`);
  const UH = (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name: "โรงแรมรีวิว B", slug: US } })).id as string;
  const mkType = async (name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UH, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const RT = { dlx: await mkType("ดีลักซ์", 129_000), one: await mkType("ห้องเดียว", 100_000) };
  for (let i = 1; i <= 8; i++) await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: `D${i}`, roomTypeId: RT.dlx, hkStatus: "CLEAN" } });
  await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: "S1", roomTypeId: RT.one, hkStatus: "CLEAN" } });
  const POS = (await SYS.createSystem(tA, "POS", "POS รีวิว B")).id as string;
  await SYS.linkUnit(tA, POS, UH);
  await prisma.paymentProfile.create({ data: { tenantId: tA, promptpayId: "0812345678", displayName: "โรงแรมรีวิว B" } });
  const CSYS = (await SYS.createSystem(tA, "COUPON", "คูปอง รีวิว B")).id as string;
  await SYS.linkUnit(tA, CSYS, UH);
  const CPN = `H8RB${RUN.toUpperCase()}`;
  okRes(await COUPON.createCoupon({ tenantId: tA, systemId: CSYS, code: CPN, name: "ลด 300", type: "FIXED", valueSatang: 30_000 }), "createCoupon");
  const uidO = `h8rb-owner-${RUN}`;
  await prisma.user.create({ data: { id: uidO, email: `${SLUG}owner-${RUN}@shark.local`, name: "QC h8rb owner" } });
  const mb = await prisma.membership.create({ data: { userId: uidO, tenantId: tA, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const OWNER = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: uidO, membershipId: mb.id };
  okRes(await HOTEL.listRatePlans(OWNER, ctxA, { unitId: UH }), "listRatePlans");
  const STD = (await prisma.hotelRatePlan.findFirst({ where: { unitId: UH, code: "STANDARD" } })).id as string;
  const Q2 = [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }];
  const rows = [{ roomTypeId: RT.dlx, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }, { roomTypeId: RT.one, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 120_000, priceHolidaySatang: null }];
  okRes(await HOTEL.saveRatePlan(OWNER, ctxA, { unitId: UH, id: STD, code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
  okRes(await HOTEL.saveRates(OWNER, ctxA, { unitId: UH, ratePlanId: STD, rows }), "saveRates");
  okRes(await HOTEL.saveCancelRules(OWNER, ctxA, { unitId: UH, ratePlanId: STD, rules: Q2 }), "saveCancelRules");
  // แผนคืน 33.33% (ทดสอบปัดเศษ)
  okRes(await HOTEL.saveRatePlan(OWNER, ctxA, { unitId: UH, code: "R33", name: "คืนหนึ่งในสาม", depositKind: "FIRST_NIGHT", depositValue: 0, visibility: ["WEB"] }), "R33");
  const R33 = (await prisma.hotelRatePlan.findFirst({ where: { unitId: UH, code: "R33" } })).id as string;
  okRes(await HOTEL.saveRates(OWNER, ctxA, { unitId: UH, ratePlanId: R33, rows }), "saveRates R33");
  okRes(await HOTEL.saveCancelRules(OWNER, ctxA, { unitId: UH, ratePlanId: R33, rules: [{ daysBefore: 0, refundBp: 3333 }] }), "rules R33");
  const setUnit = async (key: string, value: unknown) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: UH, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: UH }); } catch { /* */ } };
  console.log(`(ร้าน ${tA} · วันนี้ ${T0})`);

  // ── ตัวช่วย ──
  const base = { tenantSlug: slugA, unitSlug: US };
  const ip = () => `h8rb-ip-${uid()}`;
  const tick = () => WEB.holdFormStart(UH, new Date(Date.now() - 10_000));
  const EMAIL = `${SLUG}guest-${RUN}@qc.invalid`;
  const GUEST = { name: "แขกรีวิว h8rb", phone: "0897776600", email: EMAIL };
  const spec = (roomTypeId = RT.dlx, qty = 1, ratePlanId = STD) => ({ roomTypeId, qty, ratePlanId, adults: 2, children: 0 });
  const hold = (n: number, over: Any = {}) => call(() => WEB.publicCreateHold({ ...base, checkIn: W(n), checkOut: W(n + 1), adults: 2, children: 0, rooms: [spec()], guest: GUEST, locale: "th", spam: { hp: "", st: tick() }, idempotencyKey: `h8rb-${uid()}`, ...over }, { clientKey: ip() }));
  const holdOk = async (n: number, over: Any = {}) => okRes(await hold(n, over), `hold W+${n}`);
  const rvByToken = (t: string) => prisma.hotelReservation.findUnique({ where: { publicToken: t } }) as Promise<Any>;
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const status = (t: string) => call(() => WEB.publicStatus({ ...base, publicToken: t }, { clientKey: ip() }));
  const cancelPub = (t: string, confirmRefundSatang: number, email = EMAIL) => call(() => WEB.publicCancel({ ...base, publicToken: t, email, confirmRefundSatang }, { clientKey: ip() }));
  const png = () => Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]));
  const attach = (t: string) => call(() => WEB.publicAttachSlip({ ...base, publicToken: t, file: { data: png(), contentType: "image/png" }, idempotencyKey: `h8rb-slip-${uid()}` }, { clientKey: ip(), deps: { put: async () => {}, del: async () => 200 } }));
  const decide = (slipId: string, decision: string, extra: Any = {}) => call(() => SV.decideSlip({ userId: OWNER.userId }, ctxA, slipId, { decision, reason: "ตรวจกับแอปธนาคารแล้ว", ...(decision === "REJECT" ? {} : { transRef: `H8RB${uid()}`.toUpperCase() }), ...extra }));
  const runConsumer = async (slipId: string) => {
    const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: "payment.slip.approved" } })) as Any[];
    const ev = evs.find((e) => e.payload?.slipId === slipId);
    ok(ev, `ไม่มี event payment.slip.approved ของสลิป ${slipId}`);
    const r = await call(() => CONS.consumers["payment.slip.approved"]({ id: ev.id, tenantId: ev.tenantId, type: ev.type, payload: ev.payload, unitId: ev.unitId ?? null, systemId: ev.systemId ?? null }));
    return r;
  };
  const approve = async (slipId: string, extra: Any = {}, decision = "APPROVE") => { okRes(await decide(slipId, decision, extra), `decideSlip ${decision}`); return runConsumer(slipId); };
  const receiptsOf = (id: string) => prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-deposit-${id}` } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const refundsOf = (saleId: string) => prisma.posSale.findMany({ where: { tenantId: tA, docType: "REFUND", refSaleId: saleId } }) as Promise<Any[]>;
  const forfeitsOf = async (saleId: string) => { const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: saleId } }); return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` }, status: "PAID" } })) as Any[]) : []; };
  const slipPays = (slipId: string) => prisma.posPayment.findMany({ where: { reference: `slip:${slipId}` } }) as Promise<Any[]>;
  const eventsFor = async (rid: string) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tA } })) as Any[]).filter((e) => e.payload?.reservationId === rid || (Array.isArray(e.payload?.reservationIds) && e.payload.reservationIds.includes(rid)) || e.payload?.refId === rid).map((e) => e.type);
  /** HOLD → สลิป → อนุมัติ → CONFIRMED จ่ายแล้ว */
  const paidBooking = async (n: number, over: Any = {}) => {
    const h = await holdOk(n, over);
    const rv = await rvByToken(h.publicToken);
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    const c = await approve(sl.slipId);
    ok(c?.ok !== false, `consumer ${J(c)}`);
    const after = await rvOf(rv.id);
    eq([after.status, !!after.depositPaidAt], ["CONFIRMED", true], "ต้อง CONFIRMED จ่ายแล้ว");
    return { h, id: rv.id as string, rv: after, slipId: sl.slipId as string };
  };

  console.log("\n── ผู้ตรวจรอบ B (เงิน) ──");

  // B-1 สลิปค้างแล้วแขกยกเลิก HOLD ⇒ อนุมัติสลิปทีหลัง ⇒ เงินต้องไม่หายเงียบ
  await st("B-1", "MAJOR", "สลิปรอตรวจ + แขกยกเลิก HOLD เอง ⇒ (ก) ยกเลิกถูกกัน หรือ (ข) อนุมัติสลิปทีหลังแล้วเงินมีใบรับ+คืนอัตโนมัติ/ธงให้พนักงาน — ไม่ใช่ console.warn เงียบ", async () => {
    const h = await holdOk(26);
    const id = (await rvByToken(h.publicToken)).id;
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    const c = await cancelPub(h.publicToken, 0);
    if (c?.ok !== true) return; // (ก) กันไว้แล้ว
    const rv = await rvOf(id);
    const cons = await approve(sl.slipId);
    const rec = await receiptsOf(id);
    const pays = await slipPays(sl.slipId);
    const refunds = rec.length ? await refundsOf(rec[0].id) : [];
    const evs = await eventsFor(id);
    const flagged = evs.some((t) => /deposit_after_expiry|slip.*orphan|unapplied|needs_refund/i.test(t));
    ok((pays.length >= 1 && refunds.length >= 1) || flagged, `ยกเลิกได้ (${rv.status}/${rv.cancelReason}) · อนุมัติสลิป ⇒ consumer ${J(cons)} · ใบรับ ${rec.length} · PosPayment slip:${pays.length} · คืน ${refunds.length} · event ${J([...new Set(evs)])} — เงินที่แขกโอนไม่มีบันทึก/ไม่มีคืน`);
  });

  // B-2 รับมัดจำที่เคาน์เตอร์ระหว่างสลิปรอตรวจ ⇒ อนุมัติสลิป ⇒ เงินก้อนที่ 2 ต้องไม่หายเงียบ
  await st("B-2", "MINOR", "สลิปรอตรวจ + พนักงานรับมัดจำเงินสดก่อน ⇒ อนุมัติสลิป ⇒ consumer duplicated: เงินจากสลิปต้องมีใบรับ+คืน หรือธงให้พนักงาน (ไม่ใช่ deposit_paid ที่อ้างใบรับเงินสด)", async () => {
    const h = await holdOk(28);
    const id = (await rvByToken(h.publicToken)).id;
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    okRes(await call(() => HOTEL.takeBookingDeposit(OWNER, ctxA, { unitId: UH, reservationId: id, payType: "CASH" })), "takeBookingDeposit CASH");
    const cons = await approve(sl.slipId);
    const pays = await slipPays(sl.slipId);
    const dp = ((await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: "hotel.web.deposit_paid" } })) as Any[]).filter((e) => e.payload?.slipId === sl.slipId);
    const cashSale = (await rvOf(id)).depositSaleId;
    ok(pays.length >= 1 || !dp.some((e) => e.payload?.saleId === cashSale), `consumer ${J(cons)} · PosPayment slip:${pays.length} · event deposit_paid ของสลิปนี้อ้างใบรับเงินสด ${dp.map((e) => e.payload?.saleId === cashSale)} — เงินโอนก้อนที่ 2 ไม่มีบันทึก`);
  });

  // B-3 อนุมัติบางส่วน ⇒ ยอดสตางค์สอดคล้องทุกจุด
  await st("B-3", "MINOR", "APPROVE_PARTIAL (50,000 จากมัดจำเต็ม) ⇒ ใบรับ = 50,000 · หน้าสถานะ paidSatang = 50,000 · ยอดคืน (100%) = 50,000 · ชำระที่โรงแรม = รวม − 50,000 · และการจองยังไม่ CONFIRMED เต็ม (มัดจำไม่ครบ) หรือมีเครื่องหมายค้างชำระ", async () => {
    const h = await holdOk(24);
    const id = (await rvByToken(h.publicToken)).id;
    const req = h.depositRequiredSatang as number;
    ok(req > 50_000, `มัดจำ ${req}`);
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    const cons = await approve(sl.slipId, { amountSatang: 50_000 }, "APPROVE_PARTIAL");
    const rv = await rvOf(id);
    const rec = await receiptsOf(id);
    const s = await status(h.publicToken);
    const info = `consumer ${J(cons)} · status ${rv.status} · depositSatang ${rv.depositSatang} (เดิม ${req}) · ใบรับ ${J(rec.map((x) => x.grandTotalSatang))} · DTO deposit ${J(s?.deposit)} payAtHotel ${s?.payAtHotelSatang} total ${s?.totalSatang} refund ${J(s?.refund)}`;
    console.log(`     ℹ️ B-3 ${info}`);
    eq([rec.length, rec[0]?.grandTotalSatang, s?.deposit?.paidSatang, s?.refund?.refundSatang, s?.payAtHotelSatang], [1, 50_000, 50_000, 50_000, (s?.totalSatang ?? 0) - 50_000], "ยอดสอดคล้อง");
    ok(rv.status !== "CONFIRMED" || (s?.deposit?.requiredSatang ?? 0) > (s?.deposit?.paidSatang ?? 0), `จ่ายบางส่วนแต่ CONFIRMED และ requiredSatang ถูกเขียนทับเป็น ${s?.deposit?.requiredSatang} — ไม่เหลือร่องรอยว่ามัดจำขาด ${req - 50_000}`);
  });

  // B-4 ยกเลิกตาม policySnapshot ไม่ใช่นโยบายปัจจุบัน
  await st("B-4", "CRITICAL", "snapshot: จอง+จ่าย (กฎ 7 วัน 100%) แล้วร้านเปลี่ยนกฎยกเลิกของแผนเป็น 0% ⇒ หน้าสถานะยอดคืน = มัดจำเต็ม · ยกเลิก ⇒ ใบคืน = มัดจำเต็ม", async () => {
    const b = await paidBooking(20);
    const paid = b.rv.depositSatang as number;
    try {
      okRes(await HOTEL.saveCancelRules(OWNER, ctxA, { unitId: UH, ratePlanId: STD, rules: [{ daysBefore: 0, refundBp: 0 }] }), "เปลี่ยนกฎ");
      const s = await status(b.h.publicToken);
      eq(s?.refund?.refundSatang, paid, "ยอดคืนบนหน้าสถานะ");
      okRes(await cancelPub(b.h.publicToken, paid), "cancel");
      const ref = await refundsOf(b.rv.depositSaleId);
      eq([ref.length, ref[0]?.grandTotalSatang, (await forfeitsOf(b.rv.depositSaleId)).length], [1, paid, 0], "ใบคืน");
    } finally {
      okRes(await HOTEL.saveCancelRules(OWNER, ctxA, { unitId: UH, ratePlanId: STD, rules: Q2 }), "คืนกฎ");
    }
  });

  // B-5 ยกเลิกพร้อมกัน ⇒ คืนครั้งเดียว · consumer ซ้ำหลังคืน ⇒ ไม่มีใบรับ/คืนใหม่
  await st("B-5", "CRITICAL", "X3 publicCancel พร้อมกัน 4 ทาง (คนละ IP · ยอดถูก) ⇒ สำเร็จ 1 · ใบคืน 1 = มัดจำ · PosDeposit REFUNDED · consumer สลิปเดิมซ้ำหลังคืน ⇒ ใบรับยัง 1 ใบคืนยัง 1 · สถานะ CANCELLED", async () => {
    const b = await paidBooking(21);
    const paid = b.rv.depositSatang as number;
    const rs = await Promise.all(Array.from({ length: 4 }, () => cancelPub(b.h.publicToken, paid)));
    const codes = rs.map(code);
    eq(codes.filter((c) => c === "ok").length, 1, `สำเร็จ (${J(codes)})`);
    ok(!codes.includes("THROW") && !codes.includes("FAILED"), `รหัส ${J(codes)}`);
    const ref = await refundsOf(b.rv.depositSaleId);
    eq([ref.length, ref[0]?.grandTotalSatang, (await prisma.posDeposit.findUnique({ where: { receiptSaleId: b.rv.depositSaleId } }))?.status], [1, paid, "REFUNDED"], "ใบคืน");
    await runConsumer(b.slipId);
    eq([(await receiptsOf(b.id)).length, (await refundsOf(b.rv.depositSaleId)).length, (await rvOf(b.id)).status], [1, 1, "CANCELLED"], "consumer ซ้ำหลังคืน");
  });

  // B-6 กลุ่มหลายห้อง
  await st("B-6", "CRITICAL", "กลุ่ม 2 ห้อง: มัดจำรวม = 2× คืนแรก · สลิป expected = มัดจำรวม · อนุมัติ ⇒ ทั้ง 2 CONFIRMED · ใบรับ 1 = มัดจำรวม · หน้าสถานะ (token หัว) ยอดคืน = มัดจำรวม · ยกเลิก ⇒ ทั้ง 2 CANCELLED · ใบคืน 1 = มัดจำรวม · ไม่มีบิลริบ", async () => {
    const h = await holdOk(22, { rooms: [spec(RT.dlx, 2)] });
    const head = await rvByToken(h.publicToken);
    const grp = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId } })) as Any[];
    eq(grp.length, 2, "แถวกลุ่ม");
    const first = (await prisma.hotelReservation.findFirst({ where: { groupId: head.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] })) as Any;
    const nightDlx = (W(22) && [5, 6].includes(new Date(`${W(22)}T00:00:00Z`).getUTCDay())) ? 149_000 : 129_000;
    eq([first.depositSatang, h.depositRequiredSatang], [2 * nightDlx, 2 * nightDlx], "มัดจำรวมอยู่หัวกลุ่ม");
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    const slip = await prisma.paymentSlip.findUnique({ where: { id: sl.slipId } });
    eq(slip.expectedSatang, h.depositRequiredSatang, "expectedSatang ของสลิป");
    await approve(sl.slipId);
    const after = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId } })) as Any[];
    eq(after.map((r) => r.status).sort(), ["CONFIRMED", "CONFIRMED"], "สถานะกลุ่ม");
    const payer = after.find((r) => r.depositPaidAt);
    const rec = await receiptsOf(head.groupId);
    eq([rec.length, rec[0]?.grandTotalSatang, payer?.depositSatang], [1, h.depositRequiredSatang, h.depositRequiredSatang], "ใบรับกลุ่ม");
    const s = await status(h.publicToken);
    eq([s?.refund?.refundSatang, s?.deposit?.paidSatang], [h.depositRequiredSatang, h.depositRequiredSatang], "หน้าสถานะ");
    okRes(await cancelPub(h.publicToken, h.depositRequiredSatang), "cancel กลุ่ม");
    const fin = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId } })) as Any[];
    eq(fin.map((r) => r.status), ["CANCELLED", "CANCELLED"], "หลังยกเลิก");
    const ref = await refundsOf(payer.depositSaleId);
    eq([ref.length, ref[0]?.grandTotalSatang, (await forfeitsOf(payer.depositSaleId)).length], [1, h.depositRequiredSatang, 0], "ใบคืนกลุ่ม");
  });

  // B-7 ปัดเศษ (rooms.money.rounding BAHT_DOWN ใน snapshot) — หน้าสถานะ = ยอดคืนจริง · คืน + ริบ = จ่าย · จำนวนเต็ม
  await st("B-7", "MAJOR", "ปัดเศษ: BAHT_DOWN + กฎคืน 33.33% ⇒ คาด floor(floor(มัดจำ×3333/10000)/100)×100 · หน้าสถานะ = ยอดคืน · ใบคืน = ยอดนั้น · บิลริบ = จ่าย − คืน · จำนวนเต็มสตางค์ทุกจุด", async () => {
    await setUnit("rooms.money.rounding", "BAHT_DOWN");
    let b: Any;
    try { b = await paidBooking(23, { rooms: [spec(RT.dlx, 1, R33)] }); } finally { await resetUnit("rooms.money.rounding"); }
    const paid = b.rv.depositSatang as number;
    const exp = Math.floor(Math.floor((paid * 3333) / 10_000) / 100) * 100;
    const s = await status(b.h.publicToken);
    eq(s?.refund?.refundSatang, exp, `หน้าสถานะ (มัดจำ ${paid})`);
    okRes(await cancelPub(b.h.publicToken, exp), "cancel");
    const ref = await refundsOf(b.rv.depositSaleId);
    const ff = await forfeitsOf(b.rv.depositSaleId);
    eq([ref.length, ref[0]?.grandTotalSatang, sum(ff.map((x) => x.grandTotalSatang))], [1, exp, paid - exp], "คืน/ริบ");
    ok([paid, exp, ref[0]?.grandTotalSatang, ...ff.map((x) => x.grandTotalSatang)].every((v) => Number.isSafeInteger(v)), "ไม่ใช่จำนวนเต็ม");
  });

  // B-8 ปฏิเสธสลิป ⇒ HOLD คงอยู่จนหมดเวลา · แนบใหม่ได้
  await st("B-8", "MAJOR", "REJECT สลิป ⇒ การจองยัง HOLD · holdExpiresAt เดิม · ไม่มีใบรับ · หน้าสถานะยังมี QR ยอดเดิม · แนบสลิปใหม่ได้ (ไม่ใช่ alreadyPending) · อนุมัติใบใหม่ ⇒ CONFIRMED ใบรับ 1", async () => {
    const h = await holdOk(25);
    const rv0 = await rvByToken(h.publicToken);
    const s1 = await attach(h.publicToken); okRes(s1, "attach 1");
    okRes(await decide(s1.slipId, "REJECT"), "reject");
    const rv1 = await rvOf(rv0.id);
    eq([rv1.status, rv1.holdExpiresAt?.getTime(), (await receiptsOf(rv0.id)).length], ["HOLD", rv0.holdExpiresAt?.getTime(), 0], "หลังปฏิเสธ");
    const s = await status(h.publicToken);
    eq([s?.state, s?.pay?.amountSatang], ["HOLD", h.depositRequiredSatang], "หน้าสถานะ");
    const s2 = await attach(h.publicToken); okRes(s2, "attach 2");
    ok(!s2.alreadyPending && s2.slipId !== s1.slipId, `แนบใหม่ ${J(s2)}`);
    await approve(s2.slipId);
    eq([(await rvOf(rv0.id)).status, (await receiptsOf(rv0.id)).length], ["CONFIRMED", 1], "อนุมัติใบใหม่");
  });

  // B-9 แนบสลิปพร้อมกัน (คนละกุญแจ คนละรูป) ⇒ สลิปรอตรวจ ≤ 1
  await st("B-9", "MINOR", "แนบสลิปพร้อมกัน 3 ทาง (คนละกุญแจ · คนละรูป) ⇒ PaymentSlip รอตรวจของการจอง ≤ 1 (A-13 ตรวจนอก tx)", async () => {
    const h = await holdOk(27);
    const id = (await rvByToken(h.publicToken)).id;
    const rs = await Promise.all([attach(h.publicToken), attach(h.publicToken), attach(h.publicToken)]);
    const n = await prisma.paymentSlip.count({ where: { tenantId: tA, refId: id, status: { in: ["PENDING", "NEEDS_REVIEW"] } } });
    ok(n <= 1, `สลิปรอตรวจ ${n} ใบ (${J(rs.map((r) => [code(r), r?.alreadyPending ?? false]))}) — อนุมัติทั้งคู่ได้ ⇒ ใบที่ 2 duplicated เงียบ (ดู B-2)`);
  });

  // B-10 จ่ายช้า กลุ่ม 2 ห้อง ห้องหนึ่งถูกจองไปแล้ว ⇒ ไม่ re-book บางห้อง · คืนเต็ม
  await st("B-10", "CRITICAL", "จ่ายช้า กลุ่ม (ดีลักซ์ + ห้องเดียว) · หมดเวลา · เคาน์เตอร์จองห้องเดียวคืนนั้น ⇒ อนุมัติสลิป ⇒ ทั้งกลุ่มคง CANCELLED (ไม่ re-book แค่ดีลักซ์) · ใบรับ 1 + ใบคืน 1 เต็ม · event deposit_after_expiry · เคาน์เตอร์ไม่กระทบ", async () => {
    await setUnit("rooms.hotel.holdMinutesOnline", 1);
    try {
      const h = await holdOk(40, { rooms: [spec(RT.dlx, 1), spec(RT.one, 1)] });
      const head = await rvByToken(h.publicToken);
      const sl = await attach(h.publicToken); okRes(sl, "attach");
      await withClock(async () => HOTEL.sweepExpiredHolds({ now: new Date(Date.now() + 3 * 60_000) }));
      const g0 = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId } })) as Any[];
      eq(g0.map((r) => `${r.status}/${r.cancelReason}`), ["CANCELLED/HOLD_EXPIRED", "CANCELLED/HOLD_EXPIRED"], "หลัง sweep");
      const other = okRes(await call(() => HOTEL.createBooking(OWNER, ctxA, { unitId: UH, rooms: [{ roomTypeId: RT.one, adults: 2, children: 0 }], ratePlanId: STD, source: "PHONE", guest: { name: "เคาน์เตอร์ h8rb", phone: "0890000001" }, checkIn: W(40), checkOut: W(41) })), "เคาน์เตอร์");
      const cons = await approve(sl.slipId);
      const g1 = (await prisma.hotelReservation.findMany({ where: { groupId: head.groupId } })) as Any[];
      eq(g1.map((r) => r.status), ["CANCELLED", "CANCELLED"], `กลุ่มหลังอนุมัติ (consumer ${J(cons)})`);
      const rec = await receiptsOf(head.groupId);
      const ref = rec.length ? await refundsOf(rec[0].id) : [];
      eq([rec.length, ref.length, ref[0]?.grandTotalSatang], [1, 1, h.depositRequiredSatang], "ใบรับ/คืน");
      ok((await eventsFor(head.id)).includes("hotel.booking.deposit_after_expiry"), "ไม่มี deposit_after_expiry");
      eq((await rvOf(other.reservations[0].id)).status, "CONFIRMED", "เคาน์เตอร์");
    } finally { await resetUnit("rooms.hotel.holdMinutesOnline"); }
  });

  // B-11 คูปอง: มัดจำไม่หักส่วนลด (มติ §9.2) · ยอด "ชำระที่โรงแรม" ตรงกันระหว่างใบเสนอราคา/ผลจอง กับหน้าสถานะ
  await st("B-11", "MINOR", "คูปอง 300 บาท: มัดจำ = คืนแรกเต็ม (ไม่ลด) · policySnapshot.coupon.discountSatang 30,000 · publicQuote.payAtHotel (รวม − ส่วนลด − มัดจำ) = หน้าสถานะ payAtHotel (หรือหน้าสถานะแสดงส่วนลดคูปอง)", async () => {
    const h = await holdOk(29, { couponCode: CPN });
    const rv = await rvByToken(h.publicToken);
    eq([rv.policySnapshot?.coupon?.discountSatang, h.discountSatang], [30_000, 30_000], "snapshot คูปอง");
    eq(h.depositRequiredSatang, rv.depositSatang, "มัดจำ");
    const q = await call(() => WEB.publicQuote({ ...base, checkIn: W(29), checkOut: W(30), adults: 2, children: 0, rooms: [spec()], couponCode: CPN }, { clientKey: ip() }));
    okRes(q, "quote");
    const s = await status(h.publicToken);
    const showsCoupon = /coupon|discount/i.test(Object.keys(s ?? {}).join(" "));
    ok(s?.payAtHotelSatang === q.payAtHotelSatang || showsCoupon, `quote payAtHotel ${q.payAtHotelSatang} (หักคูปอง) ≠ หน้าสถานะ ${s?.payAtHotelSatang} และ DTO ไม่มีส่วนลดคูปอง`);
  });

  // B-12 ยอดคืนคิดใหม่ตอนยืนยัน: หน้าเห็น 0 (ยังไม่จ่าย) แล้วสลิปอนุมัติก่อนกดยกเลิก ⇒ REFUND_CHANGED
  await st("B-12", "MAJOR", "หน้าสถานะ HOLD ยอดคืน 0 → สลิปอนุมัติ (CONFIRMED จ่ายแล้ว) → publicCancel(confirm 0) ⇒ REFUND_CHANGED + refundSatang = มัดจำ · ไม่ยกเลิก · ไม่มีใบคืน", async () => {
    const h = await holdOk(31);
    const id = (await rvByToken(h.publicToken)).id;
    const s0 = await status(h.publicToken);
    eq(s0?.refund?.refundSatang, 0, "ก่อนจ่าย");
    const sl = await attach(h.publicToken); okRes(sl, "attach");
    await approve(sl.slipId);
    const c = await cancelPub(h.publicToken, 0);
    const rv = await rvOf(id);
    eq([code(c), c?.refundSatang, rv.status, (await refundsOf(rv.depositSaleId)).length], ["REFUND_CHANGED", rv.depositSatang, "CONFIRMED", 0], "ผล");
  });

  // B-13 AUTO_CONFIRM + มัดจำผ่านสลิป
  await st("B-13", "MAJOR", "AUTO_CONFIRM: CONFIRMED ทันที · หน้าสถานะเสนอ QR = มัดจำ · แนบสลิป · อนุมัติ ⇒ ยัง CONFIRMED · depositPaidAt · ใบรับ 1 = มัดจำ · หน้าสถานะ paid · ไม่มี QR ใหม่", async () => {
    await setUnit("rooms.hotel.bookingMode", "AUTO_CONFIRM");
    try {
      const h = await holdOk(32);
      const id = (await rvByToken(h.publicToken)).id;
      const s0 = await status(h.publicToken);
      const dep = (await rvOf(id)).depositSatang;
      eq([h.status, s0?.pay?.amountSatang], ["CONFIRMED", dep], "ก่อนจ่าย");
      const sl = await attach(h.publicToken); okRes(sl, "attach");
      await approve(sl.slipId);
      const rv = await rvOf(id);
      const rec = await receiptsOf(id);
      const s1 = await status(h.publicToken);
      eq([rv.status, !!rv.depositPaidAt, rec.length, rec[0]?.grandTotalSatang, s1?.deposit?.paid, s1?.pay], ["CONFIRMED", true, 1, dep, true, null], "หลังจ่าย");
    } finally { await resetUnit("rooms.hotel.bookingMode"); }
  });

  // B-14 สลิปของร้าน/การจองอื่น: payload ของ event อ้าง slip ที่ refId ไม่ใช่ HOTEL_DEPOSIT ⇒ ไม่ทำอะไร
  await st("B-14", "MAJOR", "consumer ได้ slipId ของ domain อื่น (BOOKING) แต่ payload domain=HOTEL (ปลอม) ⇒ ไม่รับมัดจำ · ไม่ throw", async () => {
    const h = await holdOk(33);
    const id = (await rvByToken(h.publicToken)).id;
    const fake = await prisma.paymentSlip.create({ data: { tenantId: tA, unitId: UH, domain: "BOOKING", refType: "BOOKING_DEPOSIT", refId: id, status: "APPROVED", expectedSatang: h.depositRequiredSatang, amountSatang: h.depositRequiredSatang, imageHash: sha(uid()), fileId: null, checks: {} } }).catch((e: unknown) => ({ err: errMsg(e) }));
    if ((fake as Any).err) { console.log(`     ℹ️ B-14 สร้างสลิปปลอมไม่ได้ (${(fake as Any).err}) — ทดสอบด้วย slipId มั่ว`); }
    const sid = (fake as Any).id ?? `nope${uid()}`;
    const r = await call(() => WEB.onHotelSlipApproved({ tenantId: tA, unitId: UH, payload: { slipId: sid, domain: "HOTEL", refType: "HOTEL_DEPOSIT", refId: id, amountSatang: h.depositRequiredSatang } }));
    eq([r?.code === "THROW", (await rvOf(id)).status, (await receiptsOf(id)).length], [false, "HOLD", 0], "ผล");
  });
} catch (e) {
  console.error(`🔴 probe ล้ม: ${errMsg(e)}`);
  exitCode = 2;
} finally {
  delete process.env.SVC_QC_CLOCK;
  await cleanup(tenantIds);
  await cleanupBuckets();
  await cleanupUsers();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  if (left) console.log(`  ⚠️ เหลือร้าน ${SLUG}* ${left}`);
  const total = cks.length, passed = cks.filter((c) => c.res === "PASS").length, failed = cks.filter((c) => c.res === "FAIL").length, skipped = cks.filter((c) => c.res === "SKIP").length;
  console.log(`JSON_SUMMARY ${J({ total, passed, failed, skipped, failedIds: cks.filter((c) => c.res === "FAIL").map((c) => `${c.id}(${c.sev})`) })}`);
  if (failed && !exitCode) exitCode = 1;
  await prisma.$disconnect?.();
  process.exit(exitCode);
}
