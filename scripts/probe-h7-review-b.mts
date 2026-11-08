// probe-h7-review-b.mts — ผู้ตรวจรอบ 2 (เงิน: สูตร KPI · รายได้ net void · ริบมัดจำผ่าน POS · รายงานตรง GL ของบิล · CSV) ใบ H.7 night audit
// ร้านชั่วคราว h7rb-* (ลบใน finally) · ไม่เรียก runDueAudits (สแกนทุกร้าน) · autoClose=false ทุกหน่วยทดสอบ (กัน cron เลนอื่น)
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h7-review-b.mts
// จุดเน้น (นอกข้อสอบ qc-svc-h.7 + probe-h7-review-a):
//   K  สูตร KPI คำนวณมือ (ปัด BAHT_HALF_UP · bps · หาร 0) = preview = รายงานสด (ก่อนปิด) = แถว freeze = occupancyReport/auditHistory/getUnitKpi (หลังปิด) · รายเดือน
//   V  รายได้ net void ของวันที่ยังไม่ปิด: ROOM ที่โพสต์แล้วถูก void ⇒ รายงานสด = preview = revenueReport = ค่าหลังปิด
//   L  ค่าห้องที่โพสต์ทีหลังเข้าวันที่ปิดแล้ว (no-show อัตโนมัติ → undoNoShow → เช็กอิน → ปิดวันถัดไป) · Σ freeze = Σ revenueReport · เงินแขก (ริบ + เช็กเอาต์) = ค่าห้อง
//   R  คืนเงินการเข้าพัก (refundStay · บิล POS void) ⇒ revenueReport ไม่นับค่าห้องที่ GL กลับแล้ว
//   G  รายงานตรง GL ของบิลเช็กเอาต์ (INCLUSIVE · ส่วนลด · ค่าปรับ · บริการ) · ริบเงินประกันห้องไม่ปนกับมัดจำการจอง
//   C  CSV ตัวเลขตรงจอ · กันสูตรบนชื่อประเภทห้อง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h7-review-b";
const SLUG = "h7rb-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY;
const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const SET = (await import(`${R}/core/settings`)) as Any;
const NA = (await import(`${R}/modules/hotel/night-audit.ts`)) as Any;
const RP = (await import(`${R}/modules/hotel/reports.ts`)) as Any;
const BK = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const FO = (await import(`${R}/modules/hotel/folio.ts`)) as Any;
const CO = (await import(`${R}/modules/hotel/checkout.ts`)) as Any;
const SV = (await import(`${R}/modules/hotel/service.ts`)) as Any;
const RTS = (await import(`${R}/modules/hotel/rates.ts`)) as Any;
const SYS = (await import(`${R}/modules/system/service`)) as Any;
const ACC = (await import(`${R}/modules/account/service`)) as Any;
const GL = (await import(`${R}/modules/account/gl`)) as Any;
const OC = (await import(`${R}/outbox-consumers`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const checks: { id: string; ok: boolean | null; note: string }[] = [];
const chk = (id: string, name: string, ok: boolean, note = "") => { checks.push({ id, ok, note }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${note ? ` — ${note}` : ""}`); };
const skp = (id: string, name: string, why: string) => { checks.push({ id, ok: null, note: why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const code = (r: Any) => (r?.ok === true ? "ok" : `${r?.code ?? "?"}${r?.reason ? ` (${String(r.reason).slice(0, 100)})` : ""}`);
const must = (r: Any, what: string) => { if (r?.ok !== true) throw new Error(`${what}: ${code(r)} ${J(r).slice(0, 240)}`); return r; };
/** ปัดแบบ pricing.roundFraction (ตัวอ้างอิงอิสระ) */
const roundRef = (num: number, den: number, mode: string) => {
  if (!(den > 0)) return 0;
  const n = Math.max(0, Math.trunc(num));
  if (mode === "BAHT_DOWN") return Math.floor(n / (100 * den)) * 100;
  if (mode === "BAHT_HALF_UP") return Math.floor((2 * n + 100 * den) / (200 * den)) * 100;
  return Math.floor((2 * n + den) / (2 * den));
};
const bpsRef = (o: number, a: number) => (a > 0 ? Math.floor((o * 10_000) / a) : 0);

const tenantIds: string[] = [];
async function cleanup() {
  if (tenantIds.length) {
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    const tables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
    await prisma.roomOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    let pending = [...tables];
    for (let pass = 0; pass < 14 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด: ${pending.join(",")}`);
    try { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant: ${errMsg(e)}`); }
  }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; console.log(`(กวาดร้านค้าง ${stale.length})`); }

  // ═══ ร้านชั่วคราว (POS + บัญชี VAT 7%) ═══
  const tA = (await prisma.tenant.create({ data: { name: "RB H7 ร้าน A", slug: `${SLUG}${RUN}` } })).id as string;
  tenantIds.push(tA);
  const ctxA = { tenantId: tA };
  const mkUnit = async (name: string) => (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name, slug: `u-${uid()}`, settings: {} } })).id as string;
  const UK = await mkUnit("RB H7 สูตร KPI");
  const UV = await mkUnit("RB H7 void วันยังไม่ปิด");
  const UL = await mkUnit("RB H7 โพสต์ทีหลัง");
  const UR = await mkUnit("RB H7 คืนเงินการเข้าพัก");
  const UG = await mkUnit("RB H7 GL บิล");
  const ALL = [UK, UV, UL, UR, UG];
  const RT: Record<string, string> = {};
  const ROOMS: Record<string, string[]> = {};
  for (const u of ALL) {
    RT[u] = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: u, name: u === UG ? "=HYPERLINK(\"x\") ดีลักซ์" : "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id;
    ROOMS[u] = [];
    for (let i = 1; i <= 3; i++) ROOMS[u].push((await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: u, number: `R${i}`, roomTypeId: RT[u], hkStatus: "CLEAN" } })).id);
  }
  const POS = (await SYS.createSystem(tA, "POS", "POS RB H7")).id as string;
  for (const u of ALL) await SYS.linkUnit(tA, POS, u);
  const ACCS = (await SYS.createSystem(tA, "ACCOUNT", "บัญชี RB H7")).id as string;
  await ACC.saveSettings(tA, ACCS, { orgName: "โรงแรม RB จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 } as never);
  await GL.ensureAccounting({ tenantId: tA, systemId: ACCS });
  await prisma.accountSystemLink.create({ data: { tenantId: tA, systemId: ACCS, linkedKind: "POS", linkedId: POS } });
  const mkMember = async (tag: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `RB h7 ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const MGR_P = { "hotel.audit.run": true, "hotel.reports.read": true, "hotel.booking.manage": true, "hotel.folio.post": true, "hotel.folio.void": true, "hotel.reservation.checkOut": true, "hotel.reservation.checkIn": true, "hotel.reservation.create": true };
  const MGR = await mkMember("mgr", "MANAGER", ALL, MGR_P);
  const FRONT = await mkMember("front", "STAFF", ALL, { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true });
  const rctx = { tenantId: tA, actorUserId: MGR.userId };
  const setUnit = async (k: string, value: unknown, unitId: string) => { const r = await SET.setSettings(OWNER, ctxA, [{ key: k, scope: "UNIT", scopeId: unitId, value }]); return r?.ok === true; };
  const STD: Record<string, string> = {};
  const PRICE: Record<string, number> = { [UK]: 100_050 };
  for (const u of ALL) {
    must(await RTS.listRatePlans(OWNER, ctxA, { unitId: u }), `listRatePlans ${u}`);
    STD[u] = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: u, code: "STANDARD" } })).id;
    const p = PRICE[u] ?? 120_000;
    must(await RTS.saveRates(OWNER, ctxA, { unitId: u, ratePlanId: STD[u], rows: [{ roomTypeId: RT[u], seasonId: null, priceWeekdaySatang: p, priceWeekendSatang: p, priceHolidaySatang: null }] }), `saveRates ${u}`);
    await setUnit("rooms.hotel.guest.requireRegistration", false, u);
    await setUnit("rooms.hotel.audit.autoClose", false, u);
  }
  const ROUND = "BAHT_HALF_UP";
  if (!(await setUnit("rooms.money.rounding", ROUND, UK))) throw new Error("ตั้ง rooms.money.rounding ไม่ได้");
  const GUEST = { name: "แขกทดสอบ h7rb", phone: "0890000001" };
  const withClock = async <T,>(fn: () => Promise<T>): Promise<T> => { const prev = process.env.SVC_QC_CLOCK; process.env.SVC_QC_CLOCK = "1"; try { return await fn(); } finally { if (prev === undefined) delete process.env.SVC_QC_CLOCK; else process.env.SVC_QC_CLOCK = prev; } };
  const book = async (unitId: string, ci: string, nights: number) => withClock(async () => must(await BK.createBooking(FRONT, ctxA, { unitId, rooms: [{ roomTypeId: RT[unitId], adults: 2, children: 0 }], ratePlanId: STD[unitId], source: "PHONE", guest: GUEST, checkIn: ci, checkOut: addDays(ci, nights), at: `${ci}T03:00:00.000Z` }), `createBooking ${ci}`).reservations[0] as Any);
  const deposit = async (unitId: string, id: string) => must(await BK.takeBookingDeposit(FRONT, ctxA, { unitId, reservationId: id, payType: "PROMPTPAY" }), "takeBookingDeposit");
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const checkIn = async (unitId: string, id: string) => {
    const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, unitId, refType: "HotelReservation", refId: id, active: true }, select: { roomId: true } });
    const roomId = (await rvOf(id))?.roomId ?? occ?.roomId;
    if (!roomId) throw new Error("ไม่มีห้องให้เช็กอิน");
    must(await SV.checkIn(tA, unitId, id, roomId), "checkIn");
    return roomId as string;
  };
  const inhouse = async (unitId: string, ci: string, nights: number, dep = false) => { const r = await book(unitId, ci, nights); if (dep) await deposit(unitId, r.id); await checkIn(unitId, r.id); return { id: r.id as string, code: r.code as string }; };
  const close = (actor: Actor | null, unitId: string, bd: string) => call(() => NA.closeNightAudit(actor, ctxA, { unitId, businessDate: bd }));
  const preview = (unitId: string, bd: string) => call(() => NA.auditPreview(MGR, ctxA, { unitId, businessDate: bd }));
  const occRep = (unitId: string, from: string, to: string, groupBy = "day") => call(() => RP.occupancyReport(rctx, { unitId, from, to, groupBy }));
  const revRep = (unitId: string, from: string, to: string, groupBy = "source") => call(() => RP.revenueReport(rctx, { unitId, from, to, groupBy }));
  const auditRow = (unitId: string, ymd: string) => prisma.hotelNightAudit.findFirst({ where: { unitId, businessDate: dbDate(ymd) } }) as Promise<Any>;
  const nightsOf = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const itemsOf = (id: string, type?: string) => prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) as Promise<Any[]>;
  const forfeitSales = async (rv: Any) => { const d = rv?.depositSaleId ? await prisma.posDeposit.findUnique({ where: { receiptSaleId: rv.depositSaleId } }) : null; return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` } } })) as Any[]) : []; };
  const drain = async () => { for (let i = 0; i < 3; i++) await OC.drainAll(); };
  const glOf = async (saleId: string) => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId: ACCS, refType: "PosSale", refId: saleId }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: String(l.account.code), debit: Number(l.debit), credit: Number(l.credit) })));
  };
  const revenueOfGl = (ls: { code: string; debit: number; credit: number }[]) => sum(ls.filter((l) => l.code.startsWith("4")).map((l) => l.credit - l.debit));
  const checkout = async (id: string) => {
    const pr = must(await call(() => CO.prepareCheckout(FRONT, ctxA, { reservationId: id })), "prepareCheckout");
    const pay = Number(pr.payableSatang ?? 0);
    const r = must(await call(() => CO.settleAndCheckOut(FRONT, ctxA, { reservationId: id, shiftId: null, securityDeposit: "REFUND", payMethods: pay > 0 ? [{ type: "CASH", amountSatang: pay }] : [] })), "settleAndCheckOut");
    return { saleId: r.saleId as string | null, payable: pay, grand: Number(pr.grandTotalSatang ?? 0), deposit: Number(pr.depositSatang ?? 0) };
  };

  // ═══ K สูตร KPI (BAHT_HALF_UP · คำนวณมือ) ═══
  console.log("\n── K สูตร KPI คำนวณมือ (rounding BAHT_HALF_UP · ราคา 1,000.50) ──");
  const D = W(-1);
  {
    await inhouse(UK, D, 1);
    await inhouse(UK, D, 2);
    // มือ: total 3 · OOO 0 · available 3 · occupied 2 · revenue 2×100,050 = 200,100 · ADR 100,050 → ปัดบาทครึ่งขึ้น 100,100 · RevPAR 66,700 → 66,700 · bps 6666
    const hand = { roomsAvailable: 3, roomsOccupied: 2, roomRevenueSatang: 200_100, occupancyBps: bpsRef(2, 3), adrSatang: roundRef(200_100, 2, ROUND), revparSatang: roundRef(200_100, 3, ROUND) };
    const pv = await preview(UK, D);
    const live = await occRep(UK, D, D);
    const lr = live?.rows?.[0];
    const pick = (k: Any) => ({ roomsAvailable: k?.roomsAvailable ?? k?.available, roomsOccupied: k?.roomsOccupied ?? k?.occupied, roomRevenueSatang: k?.roomRevenueSatang ?? k?.revenueSatang, occupancyBps: k?.occupancyBps, adrSatang: k?.adrSatang, revparSatang: k?.revparSatang });
    chk("K-1", `preview.kpi (ก่อนปิด) = คำนวณมือ ${J(hand)}`, pv?.ok === true && J(pick(pv.kpi)) === J(hand), J(pick(pv?.kpi)));
    chk("K-2", "occupancyReport วันยังไม่ปิด (สด) = คำนวณมือ (ปัดตาม rooms.money.rounding เดียวกัน)", live?.ok === true && lr?.closed === false && J(pick(lr)) === J(hand), J(lr));
    const c = await close(MGR, UK, D);
    const row = await auditRow(UK, D);
    chk("K-3", "ปิดวัน ⇒ แถว freeze = คำนวณมือ (ADR 100,100 · RevPAR 66,700 · bps 6666)", c?.ok === true && J(pick(row)) === J(hand), `${code(c)} ${J(pick(row))}`);
    const after = await occRep(UK, D, D);
    const hist = await call(() => NA.auditHistory(ctxA, { unitId: UK, from: D, to: D }));
    const k = await call(() => RP.getUnitKpi(UK));
    const mon = await occRep(UK, D, D, "month");
    chk("K-4", "หลังปิด: occupancyReport (closed) = auditHistory = แถว · getUnitKpi.roomRevenueYesterdaySatang = 200,100 · รายเดือน ADR/RevPAR = มือ",
      J(pick(after?.rows?.[0])) === J(hand) && after?.rows?.[0]?.closed === true && J(pick(hist?.rows?.[0])) === J(hand) && k?.roomRevenueYesterdaySatang === 200_100 && mon?.rows?.[0]?.adrSatang === hand.adrSatang && mon?.rows?.[0]?.revparSatang === hand.revparSatang,
      `rep=${J(pick(after?.rows?.[0]))} hist=${J(pick(hist?.rows?.[0]))} kpi=${J(k)} month=${J(mon?.rows?.[0])}`);
    const z = NA.computeKpi({ rooms: [], blockedRoomIds: [], nights: [], roomRevenueSatang: 500, rounding: ROUND });
    chk("K-5", "หาร 0: ไม่มีห้องขายได้/ไม่มีผู้พัก ⇒ bps/ADR/RevPAR = 0 (ไม่ NaN/Infinity)", z.occupancyBps === 0 && z.adrSatang === 0 && z.revparSatang === 0, J(z));
  }

  // ═══ V รายได้ net void ของวันที่ยังไม่ปิด ═══
  console.log("\n── V ROOM ที่โพสต์แล้วถูก void (วันยังไม่ปิด) ──");
  {
    const A = await inhouse(UV, W(-2), 3); // คืน W-2 W-1 W0
    must(await call(() => FO.postRoomNights(ctxA, { reservationId: A.id, upToDate: T0 })), "postRoomNights");
    const rooms = await itemsOf(A.id, "ROOM");
    const itD = rooms.find((i: Any) => i.businessDate.toISOString().slice(0, 10) === D);
    const v = itD ? await call(() => FO.voidFolioItem(MGR, ctxA, { itemId: itD.id, reason: "ลดราคาให้แขก (ผู้ตรวจ)" })) : { ok: false, code: "NO_ITEM" };
    const pv = await preview(UV, D);
    const live = await occRep(UV, D, D);
    const rv = await revRep(UV, D, D);
    const liveRev = live?.rows?.[0]?.revenueSatang;
    chk("V-1", "void ROOM คืน D สำเร็จ · revenueReport(D) ห้อง = 0 (net void)", v?.ok === true && rv?.total?.roomRevenueSatang === 0, `${code(v)} rev=${J(rv?.total)}`);
    chk("V-2", "preview(D).kpi.roomRevenueSatang = 0 (net void)", pv?.kpi?.roomRevenueSatang === 0, `${pv?.kpi?.roomRevenueSatang}`);
    chk("V-3", "occupancyReport สด (D ยังไม่ปิด) รายได้ห้อง = preview = revenueReport = 0 (ไม่นับคืนที่ void แล้ว)", liveRev === 0, `สด=${liveRev} preview=${pv?.kpi?.roomRevenueSatang} revenueReport=${rv?.total?.roomRevenueSatang}`);
    const c = await close(MGR, UV, D);
    const after = await occRep(UV, D, D);
    chk("V-4", "ตัวเลขวัน D ไม่เปลี่ยนเมื่อปิดวัน (สดก่อนปิด = freeze หลังปิด)", c?.ok === true && after?.rows?.[0]?.revenueSatang === liveRev && after?.rows?.[0]?.adrSatang === live?.rows?.[0]?.adrSatang, `${code(c)} ก่อน=${liveRev}/${live?.rows?.[0]?.adrSatang} หลัง=${after?.rows?.[0]?.revenueSatang}/${after?.rows?.[0]?.adrSatang}`);
  }

  // ═══ L โพสต์ทีหลังเข้าวันที่ปิดแล้ว + เงินแขก ═══
  console.log("\n── L no-show อัตโนมัติ → undoNoShow → เช็กอิน → ปิดวันถัดไป → เช็กเอาต์ ──");
  {
    const D2 = W(-2);
    const X = await book(UL, D2, 2); // คืน W-2 W-1 ออกวันนี้
    await deposit(UL, X.id);
    const rv0 = await rvOf(X.id);
    const depReceived = rv0.depositSatang as number;
    const c1 = await close(MGR, UL, D2); // ขั้น 1 ⇒ ไม่มา + บิลริบ
    const rv1 = await rvOf(X.id);
    const fs1 = (await forfeitSales(rv1)).filter((s: Any) => s.status === "PAID");
    chk("L-1", "ปิด W−2 ⇒ X NO_SHOW · บิลริบ PAID 1 ใบ ยอด = มัดจำที่รับ · sourceModule HOTEL", c1?.ok === true && rv1.status === "NO_SHOW" && fs1.length === 1 && fs1[0].grandTotalSatang === depReceived && fs1[0].sourceModule === "HOTEL", `${code(c1)} ${rv1.status} forfeit=${J(fs1.map((s: Any) => [s.grandTotalSatang, s.sourceModule]))} dep=${depReceived}`);
    const un = await call(() => BK.undoNoShow(MGR, ctxA, { unitId: UL, reservationId: X.id }));
    let ci: Any = null;
    try { await checkIn(UL, X.id); ci = { ok: true }; } catch (e) { ci = { ok: false, code: errMsg(e) }; }
    const c2 = await close(MGR, UL, D);
    const ns = await nightsOf(X.id);
    const its = (await itemsOf(X.id, "ROOM")).filter((i: Any) => !i.voidedAt);
    const onClosed = its.filter((i: Any) => i.businessDate.toISOString().slice(0, 10) === D2);
    chk("L-2", "undoNoShow ok → เช็กอินได้ → ปิด W−1 ok (ฉากตั้งได้)", un?.ok === true && ci?.ok === true && c2?.ok === true, `${code(un)} ${code(ci)} ${code(c2)}`);
    const occ = await occRep(UL, D2, D);
    const rev = await revRep(UL, D2, D);
    const frozenSum = sum((occ?.rows ?? []).map((r: Any) => r.revenueSatang));
    chk("L-3", "ค่าห้องคืน W−2 ไม่ถูกโพสต์เข้าวันที่ปิดแล้วเงียบ ๆ (ROOM businessDate W−2 หลังปิด W−2 = 0 หรือ freeze W−2 ถูกปรับ)", onClosed.length === 0 || (occ?.rows?.[0]?.revenueSatang ?? 0) === sum(onClosed.map((i: Any) => i.amountSatang)), `ROOM บนวันปิดแล้ว ${onClosed.length} แถว ฿${sum(onClosed.map((i: Any) => i.amountSatang)) / 100} · freeze W−2 = ${occ?.rows?.[0]?.revenueSatang} occupied ${occ?.rows?.[0]?.occupied}`);
    chk("L-4", "Σ รายได้ห้อง occupancyReport (W−2..W−1) = revenueReport ห้อง (ช่วงเดียวกัน)", frozenSum === rev?.total?.roomRevenueSatang, `occupancy Σ=${frozenSum} revenue=${rev?.total?.roomRevenueSatang} · nights posted=${ns.filter((n: Any) => n.folioItemId).length}`);
    let co: Any = null;
    try { co = await checkout(X.id); } catch (e) { co = { err: errMsg(e) }; }
    const charges = sum(its.map((i: Any) => i.amountSatang));
    const fsAll = (await forfeitSales(await rvOf(X.id))).filter((s: Any) => s.status === "PAID");
    const forfeited = sum(fsAll.map((s: Any) => s.grandTotalSatang));
    const sale = co?.saleId ? await prisma.posSale.findUnique({ where: { id: co.saleId } }) : null;
    const pays = co?.saleId ? ((await prisma.posPayment.findMany({ where: { saleId: co.saleId } })) as Any[]) : [];
    const depUsed = sum(pays.filter((p: Any) => p.type === "DEPOSIT").map((p: Any) => p.amountSatang));
    const cash = sum(pays.filter((p: Any) => p.type !== "DEPOSIT").map((p: Any) => p.amountSatang));
    const guestPaid = depReceived + cash; // เงินที่แขกจ่ายจริงทั้งหมด (มัดจำ + เงินสดตอนออก)
    chk("L-5", "เงินแขกทั้งหมด (มัดจำ + เงินตอนเช็กเอาต์) = ค่าห้องที่พักจริง (ไม่จ่ายซ้ำ: มัดจำที่ถูกริบตอน no-show อัตโนมัติต้องกลับมาหักค่าห้อง/คืน)", !co?.err && guestPaid === charges,
      `${co?.err ?? "ok"} · ค่าห้อง ฿${charges / 100} · แขกจ่าย ฿${guestPaid / 100} (มัดจำ ${depReceived / 100} + เงินสด ${cash / 100}) · ใช้มัดจำในบิล ${depUsed / 100} · บิลริบยัง PAID ฿${forfeited / 100} · บิลเช็กเอาต์ ฿${(sale?.grandTotalSatang ?? 0) / 100}`);
    const dep = await call(() => RP.depositsReport(rctx, { unitId: UL, from: D2, to: T0 }));
    chk("L-6", "depositsReport.forfeitedSatang ไม่นับมัดจำของแขกที่มาพักจริง (ย้อนไม่มาแล้ว)", dep?.forfeitedSatang === 0, `forfeited=${dep?.forfeitedSatang}`);
  }

  // ═══ R คืนเงินการเข้าพัก ═══
  console.log("\n── R refundStay (บิลเช็กเอาต์ถูก void) ──");
  {
    const A = await inhouse(UR, D, 1);
    must(await close(MGR, UR, D), "close UR");
    const before = await revRep(UR, D, D);
    let co: Any = null;
    try { co = await checkout(A.id); } catch (e) { co = { err: errMsg(e) }; }
    const rf = co?.saleId ? await call(() => SV.refundStay(tA, UR, A.id)) : { ok: false, code: co?.err ?? "NO_SALE" };
    await drain();
    const glNet = co?.saleId ? revenueOfGl(await glOf(co.saleId)) : null;
    const after = await revRep(UR, D, D);
    const f = await prisma.hotelFolio.findUnique({ where: { reservationId: A.id } });
    chk("R-1", "ฉาก: ปิดวัน → เช็กเอาต์ → refundStay ok (status REFUNDED · folio VOID · GL รายได้สุทธิของบิล = 0)", before?.total?.roomRevenueSatang === 120_000 && rf?.ok === true && (await rvOf(A.id)).status === "REFUNDED" && f?.status === "VOID" && glNet === 0, `${code(rf)} folio=${f?.status} glNet=${glNet} before=${before?.total?.roomRevenueSatang}`);
    chk("R-2", "revenueReport หลังคืนเงินทั้งการเข้าพัก ไม่นับค่าห้องที่บัญชีกลับแล้ว (= GL 0)", after?.total?.roomRevenueSatang === 0, `revenueReport ห้อง = ${after?.total?.roomRevenueSatang} · GL = ${glNet}`);
  }

  // ═══ G รายงานตรง GL ของบิล ═══
  console.log("\n── G รายงาน ↔ GL ของบิลเช็กเอาต์ (INCLUSIVE · ส่วนลด · ค่าปรับ · บริการ) ──");
  {
    const A = await inhouse(UG, D, 1);
    must(await close(MGR, UG, D), "close UG");
    must(await call(() => FO.postFolioItem(MGR, ctxA, { reservationId: A.id, type: "DISCOUNT", description: "ส่วนลดสมาชิก", qty: 1, unitAmountSatang: -10_000 })), "DISCOUNT");
    must(await call(() => FO.postFolioItem(MGR, ctxA, { reservationId: A.id, type: "PENALTY", description: "เช็กเอาต์ล่าช้า", qty: 1, unitAmountSatang: 5_000 })), "PENALTY");
    must(await call(() => FO.postFolioItem(MGR, ctxA, { reservationId: A.id, type: "SERVICE", description: "ซักรีด", qty: 1, unitAmountSatang: 20_000 })), "SERVICE");
    const sec = await call(() => CO.takeSecurityDeposit(FRONT, ctxA, { reservationId: A.id, amountSatang: 50_000, payType: "CASH" }));
    let co: Any = null;
    try {
      const pr = must(await call(() => CO.prepareCheckout(FRONT, ctxA, { reservationId: A.id })), "prepareCheckout");
      const pay = Number(pr.payableSatang ?? 0);
      const r = must(await call(() => CO.settleAndCheckOut(MGR, ctxA, { reservationId: A.id, shiftId: null, securityDeposit: "FORFEIT", forfeitReason: "ทำของเสียหาย", payMethods: [{ type: "CASH", amountSatang: pay }] })), "settle");
      co = { saleId: r.saleId };
    } catch (e) { co = { err: errMsg(e) }; }
    await drain();
    const sale = co?.saleId ? await prisma.posSale.findUnique({ where: { id: co.saleId } }) : null;
    const gl = co?.saleId ? await glOf(co.saleId) : [];
    const glRev = revenueOfGl(gl);
    const rev = await revRep(UG, D, T0);
    const rep = rev?.total ?? {};
    chk("G-1", "ฉาก: บิลเช็กเอาต์ PAID ยอด = 1,200 + 200 + 50 − 100 = ฿1,350 (INCLUSIVE) · GL ลงแล้ว", sale?.status === "PAID" && sale?.grandTotalSatang === 135_000 && gl.length > 0, `${co?.err ?? ""} grand=${sale?.grandTotalSatang} gl=${gl.length}`);
    chk("G-2", "revenueReport รวม (ห้อง+อื่น) = ยอดบิล POS ของการเข้าพัก (ไม่ใส่ส่วนลด/ค่าปรับ ⇒ ไม่ตรง)", rep.totalSatang === sale?.grandTotalSatang, `รายงาน ห้อง ${rep.roomRevenueSatang} + อื่น ${rep.otherRevenueSatang} = ${rep.totalSatang} · บิล ${sale?.grandTotalSatang}`);
    // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h7-g3) มติ: รายได้ในรายงาน = ยอดที่เก็บแขกจริง (ราคาขาย · INCLUSIVE รวม VAT) ⇒ G-2 ยึดยอดบิล · รายงานต้องแยก vatSatang ให้กระทบ GL ได้ (รวม − VAT = รายได้ GL 4xxx)
    chk("G-3", "revenueReport รวม − vatSatang = รายได้ GL ของบิล (4xxx สุทธิ · ไม่รวม VAT)", typeof rep.vatSatang === "number" && rep.totalSatang - rep.vatSatang === glRev, `รายงาน ${rep.totalSatang} · vat ${rep.vatSatang} · GL รายได้ ${glRev}`);
    const csv = RP.exportCsv("revenue", (await revRep(UG, D, T0, "roomType"))?.rows ?? []);
    chk("C-1", "CSV รายได้ groupBy roomType: ชื่อประเภท '=HYPERLINK…' ถูกกันสูตร (ขึ้นต้น ') · BOM · ตัวเลขบาท 2 ตำแหน่ง", csv.startsWith("﻿") && !/(^|,)"?=HYPERLINK/m.test(csv) && /'=HYPERLINK/.test(csv) && /1200\.00/.test(csv), csv.replace(/﻿/, "").split("\r\n").slice(0, 2).join(" | "));
    const dep = await call(() => RP.depositsReport(rctx, { unitId: UG, from: D, to: T0 }));
    chk("G-4", "ริบเงินประกันห้อง (ค่าเสียหาย ฿500) ไม่ถูกนับเป็น «มัดจำที่ริบ» ของการจอง", sec?.ok === true && dep?.forfeitedSatang === 0, `sec=${code(sec)} forfeitedSatang=${dep?.forfeitedSatang}`);
  }

  // ═══ C CSV ตรงจอ ═══
  console.log("\n── C CSV ตัวเลขตรง DTO ──");
  {
    const rep = await occRep(UK, W(-3), T0);
    const csv = RP.exportCsv("occupancy", rep?.rows ?? []);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    const bad = (rep?.rows ?? []).filter((r: Any, i: number) => {
      const c = lines[i]?.split(",") ?? [];
      return c[0] !== r.period || Number(c[1]) !== r.occupied || Number(c[2]) !== r.available || c[3] !== (r.occupancyBps / 100).toFixed(1) || c[4] !== (r.revenueSatang / 100).toFixed(2) || c[5] !== (r.adrSatang / 100).toFixed(2) || c[6] !== (r.revparSatang / 100).toFixed(2);
    });
    chk("C-2", "CSV occupancy ทุกแถว = DTO (ช่วง · ห้อง · % 1 ตำแหน่ง · บาท 2 ตำแหน่ง)", rep?.ok === true && lines.length === rep.rows.length && bad.length === 0, `rows=${rep?.rows?.length} lines=${lines.length} bad=${J(bad).slice(0, 160)}`);
    const big = await occRep(UK, W(-365), T0);
    const over = await occRep(UK, W(-366), T0);
    chk("C-3", "ช่วง 366 วัน ok · 367 วัน INVALID_RANGE", big?.ok === true && big.rows.length === 366 && over?.code === "INVALID_RANGE", `${code(big)} ${big?.rows?.length} ${code(over)}`);
  }
} catch (e) {
  chk("Z-0", "probe ไม่ throw", false, errMsg(e));
} finally {
  await cleanup();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  chk("Z-1", "ล้างแล้ว: tenant h7rb-* 0", left === 0, `tenant=${left}`);
  const total = checks.length, passed = checks.filter((c) => c.ok === true).length, skipped = checks.filter((c) => c.ok === null).length;
  console.log(`\nJSON_SUMMARY ${J({ suite: LABEL, total, passed, failed: total - passed - skipped, skipped, failedIds: checks.filter((c) => c.ok === false).map((c) => c.id) })}`);
  await prisma.$disconnect?.();
  process.exit(0);
}
void skp;
