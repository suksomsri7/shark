// probe-h7-review-a.mts — ผู้ตรวจรอบ 1 (เงิน: ลำดับขั้น · tx · idempotency · timezone) ใบ H.7 night audit
// ร้านชั่วคราว h7rv-* (ลบใน finally) · trigger จำลองล้ม h7rv_fail (ลบใน finally) · ไม่เรียก runDueAudits (สแกนทุกร้าน ⇒ จะแตะฉาก svcqc) — เส้น cron จำลองด้วย closeNightAudit(actor null) = closeCore เดียวกัน
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h7-review-a.mts
// จุดเน้น (นอกข้อสอบ qc-svc-h.7): ยิงพร้อมกัน 10 ทาง (มือ/ผู้ตรวจ/cron) · cron + มัดจำผ่าน POS (actor null) · tx ล้ม ⇒ ขั้น 3 ไม่ทำ · ปิดใหม่หลัง reopen ไม่ DIRTY ซ้ำ ·
//   คืนก่อนวันเริ่มใช้ + ไล่ปิดทีละวัน + H.5 postRoomNights ไม่ซ้ำ · H.5 postRoomNights ยิงพร้อม audit · Tokyo/Kiritimati · DST (pure) · ขอบเขตผู้ปิดวัน STAFF · reopen+undoNoShow+ปิดใหม่ ไม่ริบซ้ำ
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h7-review-a";
const SLUG = "h7rv-";
const TRIGGER = "h7rv_fail";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY;
const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const SET = (await import(`${R}/core/settings`)) as Any;
const NA = (await import(`${R}/modules/hotel/night-audit.ts`)) as Any;
const BD = (await import(`${R}/modules/hotel/business-date.ts`)) as Any;
const BK = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const FO = (await import(`${R}/modules/hotel/folio.ts`)) as Any;
const SV = (await import(`${R}/modules/hotel/service.ts`)) as Any;
const RTS = (await import(`${R}/modules/hotel/rates.ts`)) as Any;
const SYS = (await import(`${R}/modules/system/service`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const D = W(-1);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOfDb = (d: Any) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const tzYmd = (tz: string, d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const checks: { id: string; ok: boolean | null; note: string }[] = [];
const chk = (id: string, name: string, ok: boolean, note = "") => { checks.push({ id, ok, note }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${note ? ` — ${note}` : ""}`); };
const skp = (id: string, name: string, why: string) => { checks.push({ id, ok: null, note: why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const code = (r: Any) => (r?.ok === true ? "ok" : `${r?.code ?? "?"}${r?.reason ? ` (${String(r.reason).slice(0, 80)})` : ""}`);
const must = (r: Any, what: string) => { if (r?.ok !== true) throw new Error(`${what}: ${code(r)} ${J(r).slice(0, 200)}`); return r; };

const tenantIds: string[] = [];
async function dropTrigger() {
  try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "HotelNightAudit"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}_fn()`); } catch (e) { console.log(`  ⚠️ ลบ trigger: ${errMsg(e)}`); }
}
async function installTrigger(unitId: string) {
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${TRIGGER}_fn() RETURNS trigger AS $$ BEGIN IF NEW."unitId" = '${unitId.replace(/'/g, "")}' THEN RAISE EXCEPTION 'h7rv: simulated failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "HotelNightAudit"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${TRIGGER} BEFORE INSERT OR UPDATE ON "HotelNightAudit" FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}_fn()`);
}
async function cleanup() {
  await dropTrigger();
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
  await dropTrigger();

  // ═══ ร้านชั่วคราว ═══
  const tA = (await prisma.tenant.create({ data: { name: "RV H7 ร้าน A", slug: `${SLUG}${RUN}` } })).id as string;
  tenantIds.push(tA);
  const ctxA = { tenantId: tA };
  const mkUnit = async (name: string, settings: Record<string, unknown> = {}) => (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name, slug: `u-${uid()}`, settings } })).id as string;
  const UH = await mkUnit("RV H7 พร้อมกัน");
  const UCN = await mkUnit("RV H7 cron+มัดจำ");
  const UX = await mkUnit("RV H7 tx ล้ม");
  const UP = await mkUnit("RV H7 วันเริ่มใช้");
  const UQ = await mkUnit("RV H7 H.5 พร้อมกัน");
  const UT = await mkUnit("RV H7 โตเกียว", { timezone: "Asia/Tokyo" });
  const UK = await mkUnit("RV H7 คิริบาส", { timezone: "Pacific/Kiritimati" });
  const UO = await mkUnit("RV H7 หน่วยอื่น");
  const ALL = [UH, UCN, UX, UP, UQ, UT, UK, UO];
  const RT: Record<string, string> = {};
  const ROOMS: Record<string, string[]> = {};
  for (const u of ALL) {
    RT[u] = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: u, name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id;
    ROOMS[u] = [];
    for (let i = 1; i <= 5; i++) ROOMS[u].push((await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: u, number: `R${i}`, roomTypeId: RT[u], hkStatus: "CLEAN" } })).id);
  }
  const POS = (await SYS.createSystem(tA, "POS", "POS RV H7")).id as string;
  for (const u of ALL) await SYS.linkUnit(tA, POS, u);
  const mkMember = async (tag: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `RV h7 ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const MGR = await mkMember("mgr", "MANAGER", ALL, { "hotel.audit.run": true, "hotel.reports.read": true, "hotel.booking.manage": true });
  const FRONT = await mkMember("front", "STAFF", ALL, { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true });
  const AUD = await mkMember("aud", "STAFF", ALL.filter((u) => u !== UO), { "hotel.audit.run": true });
  const AUD1 = await mkMember("aud1", "STAFF", [UH], { "hotel.audit.run": true });
  const setUnit = async (k: string, value: unknown, unitId: string) => { const r = await SET.setSettings(OWNER, ctxA, [{ key: k, scope: "UNIT", scopeId: unitId, value }]); return r?.ok === true; };
  const STD: Record<string, string> = {};
  for (const u of ALL) {
    must(await RTS.listRatePlans(OWNER, ctxA, { unitId: u }), `listRatePlans ${u}`);
    STD[u] = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: u, code: "STANDARD" } })).id;
    must(await RTS.saveRates(OWNER, ctxA, { unitId: u, ratePlanId: STD[u], rows: [{ roomTypeId: RT[u], seasonId: null, priceWeekdaySatang: 120_000, priceWeekendSatang: 150_000, priceHolidaySatang: null }] }), `saveRates ${u}`);
    await setUnit("rooms.hotel.guest.requireRegistration", false, u);
    await setUnit("rooms.hotel.audit.autoClose", false, u); // กัน cron ของเลนอื่นปิดหน่วยทดสอบระหว่างรัน
  }
  const GUEST = { name: "แขกทดสอบ h7rv", phone: "0890000000" };
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
  const inhouse = async (unitId: string, ci: string, nights: number, dep = false) => { const r = await book(unitId, ci, nights); if (dep) await deposit(unitId, r.id); const roomId = await checkIn(unitId, r.id); return { id: r.id as string, code: r.code as string, roomId }; };
  const confirmedDep = async (unitId: string, ci: string, nights = 1) => { const r = await book(unitId, ci, nights); await deposit(unitId, r.id); return { id: r.id as string, code: r.code as string }; };
  const close = (actor: Actor | null, unitId: string, bd: string) => call(() => NA.closeNightAudit(actor, ctxA, { unitId, businessDate: bd }));
  const reopen = (actor: Actor, auditId: string) => call(() => NA.reopenNightAudit(actor, ctxA, { auditId, reason: "ผู้ตรวจทดสอบ" }));
  const roomItems = (unitId: string, ymd?: string) => prisma.hotelFolioItem.findMany({ where: { tenantId: tA, unitId, type: "ROOM", ...(ymd ? { businessDate: dbDate(ymd) } : {}) } }) as Promise<Any[]>;
  const live = (xs: Any[]) => xs.filter((x) => !x.voidedAt);
  const auditRow = (unitId: string, ymd: string) => prisma.hotelNightAudit.findFirst({ where: { tenantId: tA, unitId, businessDate: dbDate(ymd) } }) as Promise<Any>;
  const forfeitSales = async (rvId: string) => { const rv = await rvOf(rvId); const d = rv?.depositSaleId ? await prisma.posDeposit.findUnique({ where: { receiptSaleId: rv.depositSaleId } }) : null; return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` }, status: "PAID" } })) as Any[]) : []; };
  const logs = (action: RegExp, targetId?: string) => prisma.auditLog.findMany({ where: { tenantId: tA, ...(targetId ? { targetId } : {}) }, orderBy: { createdAt: "asc" } }).then((rs: Any[]) => rs.filter((r) => action.test(String(r.action))));
  const outbox = (type: string, unitId: string) => prisma.outboxEvent.findMany({ where: { tenantId: tA, type } }).then((rs: Any[]) => rs.filter((r) => (r.payload as Any)?.unitId === unitId));
  const hkOf = async (roomId: string) => (await prisma.hotelRoom.findUnique({ where: { id: roomId }, select: { hkStatus: true } }))?.hkStatus as string;
  const dirtyLogs = (roomId: string) => prisma.hotelHousekeepingLog.count({ where: { roomId, toStatus: "DIRTY" } }) as Promise<number>;
  const nightsOf = (rvId: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: rvId }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  console.log(`(ร้าน ${tA} · วันนี้ไทย ${T0} · D ${D})`);

  // ═══ ฉาก ═══
  const H_A = await inhouse(UH, W(-2), 3, true); // พักข้าม D
  const H_C = await confirmedDep(UH, D); // no-show มีมัดจำ
  const H_E = await confirmedDep(UH, D); // no-show มีมัดจำ ตัวที่ 2
  const CN_C = await confirmedDep(UCN, D); // cron + มัดจำ
  const CN_A = await inhouse(UCN, D, 2);
  const X_A = await inhouse(UX, W(-2), 3);
  const P_G = await inhouse(UP, W(-5), 5); // คืน W(-5)..W(-1)
  const P_N = await confirmedDep(UP, W(-3)); // no-show ของวันเริ่มใช้
  const Q_A = await inhouse(UQ, W(-2), 3);
  const tokyoToday = tzYmd("Asia/Tokyo", new Date());
  const kiriToday = tzYmd("Pacific/Kiritimati", new Date());
  const T_C = await confirmedDep(UT, addDays(tokyoToday, -1));
  const K_C = await confirmedDep(UK, addDays(kiriToday, -1));
  const O_C = await confirmedDep(UO, D);
  for (const u of ALL) for (const r of ROOMS[u]) await prisma.hotelRoom.update({ where: { id: r }, data: { hkStatus: "CLEAN" } });
  console.log("(ฉากพร้อม)");

  // ═══ C ยิงพร้อมกัน 10 ทาง (X3/X5) ═══
  console.log("\n── C ปิดวันเดียวกันพร้อมกัน 10 ทาง (มือ ×4 · STAFF audit ×3 · cron ×3) ──");
  {
    const rs = await Promise.all([...Array(4)].map(() => close(MGR, UH, D)).concat([...Array(3)].map(() => close(AUD, UH, D)), [...Array(3)].map(() => close(null, UH, D))));
    const oks = rs.filter((r) => r?.ok === true);
    const codes = rs.map((r) => (r?.ok ? "ok" : r?.code));
    chk("C-1", "10 ทางพร้อมกัน ⇒ ok 1 · ที่เหลือ ALREADY_CLOSED (ไม่มี FAILED/THROW)", oks.length === 1 && rs.every((r) => r?.ok === true || r?.code === "ALREADY_CLOSED"), J(codes));
    const rows = await prisma.hotelNightAudit.findMany({ where: { tenantId: tA, unitId: UH } });
    const itD = live(await roomItems(UH, D));
    chk("C-2", "แถว audit 1 · ROOM คืน D ของ A = 1 แถว (postedAuditId = แถวนั้น)", rows.length === 1 && itD.length === 1 && (await nightsOf(H_A.id)).find((n) => ymdOfDb(n.date) === D)?.postedAuditId === rows[0]?.id, `rows=${rows.length} roomD=${itD.length}`);
    const [fc, fe] = [await forfeitSales(H_C.id), await forfeitSales(H_E.id)];
    const [lc, le] = [await logs(/^hotel\.booking\.no_show$/, H_C.id), await logs(/^hotel\.booking\.no_show$/, H_E.id)];
    chk("C-3", "no-show ครั้งเดียวต่อใบ: บิลริบ C 1 · E 1 · AuditLog no_show C 1 · E 1 · สถานะ NO_SHOW", fc.length === 1 && fe.length === 1 && lc.length === 1 && le.length === 1 && (await rvOf(H_C.id)).status === "NO_SHOW" && (await rvOf(H_E.id)).status === "NO_SHOW", `forfeit ${fc.length}/${fe.length} log ${lc.length}/${le.length}`);
    const [ev, al] = [await outbox("hotel.audit.closed", UH), await logs(/^hotel\.audit\.closed$/)];
    chk("C-4", "outbox hotel.audit.closed 1 · AuditLog hotel.audit.closed 1", ev.length === 1 && al.filter((x: Any) => x.unitId === UH).length === 1, `ev=${ev.length} log=${al.filter((x: Any) => x.unitId === UH).length}`);
    chk("C-5", "ขั้น 3 ครั้งเดียว: ห้อง A DIRTY · log →DIRTY 1", (await hkOf(H_A.roomId)) === "DIRTY" && (await dirtyLogs(H_A.roomId)) === 1, `hk=${await hkOf(H_A.roomId)} logs=${await dirtyLogs(H_A.roomId)}`);
    const snapW = (rows[0]?.snapshot as Any)?.warnings ?? [];
    chk("C-6", "snapshot.warnings ไม่มีคำเตือนปลอม 'ตั้งไม่มา … ไม่สำเร็จ' (ใบที่ตั้งไม่มาสำเร็จโดยอีกทาง)", !snapW.some((w: string) => /ไม่สำเร็จ/.test(w)), J(snapW).slice(0, 240));
    const kc = (await auditRow(UH, D));
    chk("C-7", "KPI แถวเดียว noShowCount 2 · occupied 1 · revenue = ราคาคืน D ของ A", kc?.noShowCount === 2 && kc?.roomsOccupied === 1 && kc?.roomRevenueSatang === itD[0]?.amountSatang, J({ ns: kc?.noShowCount, occ: kc?.roomsOccupied, rev: kc?.roomRevenueSatang }));
  }

  // ═══ S เส้น cron (actor null) + มัดจำผ่าน POS ═══
  console.log("\n── S เส้น cron (actor null) · ริบมัดจำผ่าน POS · ผู้กระทำ ──");
  {
    const r = await close(null, UCN, D);
    const rv = await rvOf(CN_C.id);
    const fs = await forfeitSales(CN_C.id);
    chk("S-1", "closeNightAudit(null) ⇒ ok · no-show + บิลริบ PAID 1 (actorId module:hotel ไม่ทำให้ POS ล้ม) · warnings ว่าง", r?.ok === true && rv.status === "NO_SHOW" && fs.length === 1 && (r.warnings ?? []).length === 0, `${code(r)} st=${rv.status} forfeit=${fs.length} w=${J(r?.warnings)}`);
    const l = (await logs(/^hotel\.booking\.no_show$/, CN_C.id))[0];
    const ac = (await logs(/^hotel\.audit\.closed$/)).find((x: Any) => x.unitId === UCN);
    // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h7-s2) หนี้ H.3 (internal opts ให้ markNoShow รับผู้กระทำ SYSTEM) ⇒ SKIP จนกว่า H.3 เพิ่ม — เปิดกลับเมื่อแก้
    checks.push({ id: "S-2", ok: null as unknown as boolean, note: "SKIP หนี้ H.3" }); console.log("  ⏭️  [S-2] AuditLog ผู้กระทำ cron = SYSTEM — SKIP (หนี้ H.3 internal opts)"); if (false) chk("S-2", "AuditLog ผู้กระทำ cron: hotel.audit.closed actorType SYSTEM · hotel.booking.no_show actorType SYSTEM (ไม่ใช่ USER 'module:hotel')", ac?.actorType === "SYSTEM" && l?.actorType === "SYSTEM", `closed=${ac?.actorType}/${ac?.actorId} no_show=${l?.actorType}/${l?.actorId}`);
    const row = await auditRow(UCN, D);
    chk("S-3", "แถว cron closedById null (byCron)", row?.closedById === null, `closedById=${row?.closedById}`);
  }

  // ═══ X tx ล้ม ⇒ ย้อน 2/4/5 · ขั้น 3 ไม่ทำ · ปิดใหม่หลัง reopen ไม่ DIRTY ซ้ำ ═══
  console.log("\n── X tx ล้มกลางคัน · ขั้น 3 · reopen ──");
  {
    await installTrigger(UX);
    let r: Any;
    try { r = await close(MGR, UX, D); } finally { await dropTrigger(); }
    const n = (await nightsOf(X_A.id)).find((x) => ymdOfDb(x.date) === D);
    chk("X-1", "tx ล้ม ⇒ ok:false FAILED/BUSY · ไม่มีแถว audit · ROOM 0 · night.postedAuditId/folioItemId null · outbox 0", r?.ok === false && ["FAILED", "BUSY"].includes(r.code) && !(await auditRow(UX, D)) && (await roomItems(UX)).length === 0 && n?.postedAuditId == null && n?.folioItemId == null && (await outbox("hotel.audit.closed", UX)).length === 0, `${code(r)}`);
    chk("X-2", "tx ล้ม ⇒ ขั้น 3 ไม่ทำ (ห้อง CLEAN · log →DIRTY 0)", (await hkOf(X_A.roomId)) === "CLEAN" && (await dirtyLogs(X_A.roomId)) === 0, `hk=${await hkOf(X_A.roomId)} logs=${await dirtyLogs(X_A.roomId)}`);
    const r2 = await close(MGR, UX, D);
    chk("X-3", "ปิดใหม่ ⇒ ok · ROOM คืน D 1 · ห้อง DIRTY · log 1", r2?.ok === true && live(await roomItems(UX, D)).length === 1 && (await hkOf(X_A.roomId)) === "DIRTY" && (await dirtyLogs(X_A.roomId)) === 1, code(r2));
    await prisma.hotelRoom.update({ where: { id: X_A.roomId }, data: { hkStatus: "CLEAN" } }); // แม่บ้านทำแล้ว
    const k0 = await auditRow(UX, D);
    const ro = await reopen(MGR, k0.id);
    const r3 = await close(MGR, UX, D);
    const k1 = await auditRow(UX, D);
    chk("X-4", "reopen → ปิดใหม่: ok · ห้องยัง CLEAN (ไม่ DIRTY ซ้ำ) · ROOM คืน D ยัง 1 · KPI เท่าเดิม", ro?.ok === true && r3?.ok === true && (await hkOf(X_A.roomId)) === "CLEAN" && live(await roomItems(UX, D)).length === 1 && k1.roomRevenueSatang === k0.roomRevenueSatang && k1.roomsOccupied === k0.roomsOccupied, `${code(ro)} ${code(r3)} hk=${await hkOf(X_A.roomId)}`);
  }

  // ═══ P วันเริ่มใช้ · ไล่ปิดทีละวัน · H.5 ไม่ซ้ำ ═══
  console.log("\n── P วันเริ่มใช้ (คืนก่อนหน้าไม่ post ย้อน) · ลำดับวัน · H.5 postRoomNights หลัง audit ──");
  {
    const r1 = await close(MGR, UP, W(-3));
    const ns1 = await nightsOf(P_G.id);
    const posted1 = ns1.filter((n) => n.folioItemId).map((n) => ymdOfDb(n.date));
    chk("P-1", "ปิดวันแรก W(-3) ⇒ post เฉพาะคืน W(-3) (W(-5),W(-4) ไม่ post ย้อน) · no-show W(-3) ริบ 1", r1?.ok === true && J(posted1) === J([W(-3)]) && (await forfeitSales(P_N.id)).length === 1, `${code(r1)} posted=${J(posted1)}`);
    const rSkip = await close(MGR, UP, W(-1));
    chk("P-2", "ข้ามวัน W(-1) ⇒ PREVIOUS_OPEN", rSkip?.code === "PREVIOUS_OPEN", code(rSkip));
    const r2 = await close(MGR, UP, W(-2));
    const r3 = await close(MGR, UP, W(-1));
    const ns = await nightsOf(P_G.id);
    const a2 = await auditRow(UP, W(-2)), a3 = await auditRow(UP, W(-1)), a1 = await auditRow(UP, W(-3));
    const byDate = Object.fromEntries(ns.map((n) => [ymdOfDb(n.date), n]));
    chk("P-3", "ปิดทีละวัน W(-2), W(-1) ⇒ ok · แต่ละคืน post 1 ครั้ง postedAuditId = แถวของวันนั้น · W(-5),W(-4) ยังไม่ post",
      r2?.ok === true && r3?.ok === true && byDate[W(-3)]?.postedAuditId === a1?.id && byDate[W(-2)]?.postedAuditId === a2?.id && byDate[W(-1)]?.postedAuditId === a3?.id && !byDate[W(-5)]?.folioItemId && !byDate[W(-4)]?.folioItemId,
      `${code(r2)} ${code(r3)} ${J(ns.map((n) => [ymdOfDb(n.date), !!n.folioItemId, n.postedAuditId === a1?.id ? "a1" : n.postedAuditId === a2?.id ? "a2" : n.postedAuditId === a3?.id ? "a3" : n.postedAuditId]))}`);
    chk("P-4", "KPI วันเริ่มใช้ W(-3) revenue = ราคาคืน W(-3) เท่านั้น", a1?.roomRevenueSatang === byDate[W(-3)]?.priceSatang, `${a1?.roomRevenueSatang} vs ${byDate[W(-3)]?.priceSatang}`);
    const pr = await call(() => FO.postRoomNights(ctxA, { reservationId: P_G.id, upToDate: T0 }));
    const its = live(await roomItems(UP));
    const perNight = new Map<string, number>();
    for (const i of its) perNight.set(i.refId, (perNight.get(i.refId) ?? 0) + 1);
    chk("P-5", "H.5 postRoomNights(upTo วันนี้) หลัง audit ⇒ post เฉพาะ W(-5),W(-4) (2) · ROOM live 5 แถว · ทุกคืน ≤ 1", pr?.ok === true && pr.posted === 2 && its.length === 5 && [...perNight.values()].every((v) => v === 1), `${code(pr)} posted=${pr?.posted} items=${its.length}`);
    const kAfter = await auditRow(UP, W(-3));
    chk("P-6", "คืนที่ H.5 post ย้อน (W(-5),W(-4)) ไม่เปลี่ยน KPI ที่ freeze ของวันอื่น", kAfter?.roomRevenueSatang === a1?.roomRevenueSatang, `${kAfter?.roomRevenueSatang}`);
  }

  // ═══ Q H.5 postRoomNights ยิงพร้อม audit ═══
  console.log("\n── Q H.5 postRoomNights ×3 ‖ closeNightAudit ×2 ──");
  {
    const rs = await Promise.all([close(MGR, UQ, D), call(() => FO.postRoomNights(ctxA, { reservationId: Q_A.id, upToDate: T0 })), call(() => FO.postRoomNights(ctxA, { reservationId: Q_A.id, upToDate: T0 })), close(null, UQ, D), call(() => FO.postRoomNights(ctxA, { reservationId: Q_A.id, upToDate: T0 }))]);
    const its = live(await roomItems(UQ));
    const perNight = new Map<string, number>();
    for (const i of its) perNight.set(i.refId, (perNight.get(i.refId) ?? 0) + 1);
    const closedOk = [rs[0], rs[3]].filter((r) => r?.ok === true).length;
    chk("Q-1", "พร้อมกัน ⇒ ROOM คืน W(-2), D ของ Q คืนละ 1 (ไม่ซ้ำ) · audit ok 1 · ไม่มี THROW", its.length === 2 && [...perNight.values()].every((v) => v === 1) && closedOk === 1 && rs.every((r) => r?.code !== "THROW"), `${J(rs.map(code))} items=${its.length}`);
    const row = await auditRow(UQ, D);
    chk("Q-2", "KPI ของ D รวมคืน D (ไม่ว่าใคร post) · occupied 1", !!row && row.roomsOccupied === 1 && row.roomRevenueSatang === live(await roomItems(UQ, D)).reduce((s: number, i: Any) => s + i.amountSatang, 0) && row.roomRevenueSatang > 0, J({ occ: row?.roomsOccupied, rev: row?.roomRevenueSatang }));
  }

  // ═══ T timezone ═══
  console.log("\n── T timezone (Tokyo · Kiritimati · DST pure) ──");
  {
    const tooEarly = await close(MGR, UT, tokyoToday);
    const pv = await call(() => NA.auditPreview(MGR, ctxA, { unitId: UT }));
    const r = await close(AUD, UT, addDays(tokyoToday, -1));
    chk("T-1", `Tokyo: ปิดวันนี้ร้าน ${tokyoToday} ⇒ TOO_EARLY · preview = ${addDays(tokyoToday, -1)} · ปิดเมื่อวานร้าน ⇒ ok · no-show + ริบ 1`, tooEarly?.code === "TOO_EARLY" && pv?.businessDate === addDays(tokyoToday, -1) && r?.ok === true && (await rvOf(T_C.id)).status === "NO_SHOW" && (await forfeitSales(T_C.id)).length === 1, `${code(tooEarly)} pv=${pv?.businessDate} ${code(r)} w=${J(r?.warnings)}`);
    const tl = (await logs(/^hotel\.booking\.no_show$/, T_C.id))[0];
    chk("T-2", "no-show ผ่านการปิดวันของ STAFF ลงชื่อผู้ปิดวันจริง (actorId = auditor)", tl?.actorId === AUD.userId, `${tl?.actorType}/${tl?.actorId}`);
    const rk0 = await close(MGR, UK, kiriToday);
    const rk = await close(MGR, UK, addDays(kiriToday, -1));
    chk("T-3", `Kiritimati (+14): วันนี้ร้าน ${kiriToday} TOO_EARLY · ปิด ${addDays(kiriToday, -1)} ⇒ ok · markNoShow (ตัดวันไทย) ไม่ปฏิเสธ`, rk0?.code === "TOO_EARLY" && rk?.ok === true && (await rvOf(K_C.id)).status === "NO_SHOW" && (rk.warnings ?? []).length === 0, `${code(rk0)} ${code(rk)} w=${J(rk?.warnings)}`);
    // DST (pure)
    const due = BD.isAuditDue;
    const ny = "America/New_York";
    const fall = [due(ny, "01:30", new Date("2026-11-01T05:30:00Z"), "2026-10-30"), due(ny, "01:30", new Date("2026-11-01T06:30:00Z"), "2026-10-31")];
    const spring = [due(ny, "02:30", new Date("2026-03-08T06:59:00Z"), "2026-03-06"), due(ny, "02:30", new Date("2026-03-08T07:00:00Z"), "2026-03-06")];
    chk("T-4", "DST New York: วันถอยเวลา 01:30 ซ้ำ ⇒ due ครั้งแรก true · ครั้งที่สอง (ปิดแล้ว) false · วันเลื่อนเวลา 02:30 ไม่มีจริง ⇒ 01:59 false · 03:00 true", J(fall) === J([true, false]) && J(spring) === J([false, true]), J({ fall, spring }));
    const zs = BD.zonedDayStart;
    const z = { a: zs(ny, "2026-11-01").toISOString(), b: zs(ny, "2026-11-02").toISOString(), c: zs(ny, "2026-03-08").toISOString(), d: zs(ny, "2026-03-09").toISOString(), t: zs("Asia/Tokyo", "2026-11-08").toISOString(), k: zs("Asia/Kathmandu", "2026-11-08").toISOString() };
    chk("T-5", "zonedDayStart: NY 11-01 04:00Z · 11-02 05:00Z · 03-08 05:00Z · 03-09 04:00Z · Tokyo 11-08 = 11-07T15:00Z · Kathmandu (+5:45) = 11-07T18:15Z", z.a === "2026-11-01T04:00:00.000Z" && z.b === "2026-11-02T05:00:00.000Z" && z.c === "2026-03-08T05:00:00.000Z" && z.d === "2026-03-09T04:00:00.000Z" && z.t === "2026-11-07T15:00:00.000Z" && z.k === "2026-11-07T18:15:00.000Z", J(z));
    const sant = zs("America/Santiago", "2026-09-06").toISOString(); // ชิลีเลื่อนเวลาตอนเที่ยงคืน (00:00 ไม่มีจริง) ⇒ ต้นวันจริง = 01:00 -03 = 04:00Z
    chk("T-6", "zonedDayStart วันที่เที่ยงคืนไม่มีจริง (America/Santiago 2026-09-06) ⇒ อยู่ในวันนั้นของร้าน (ไม่ตกไปวันก่อน)", tzYmd("America/Santiago", new Date(sant)) === "2026-09-06", sant);
    const bad = [BD.businessDateOf("Mars/Olympus", new Date("2026-11-07T17:30:00Z")), BD.businessDateOf("", new Date("2026-11-07T17:30:00Z"))];
    chk("T-7", "timezone ผิด/ว่าง ⇒ ถอยเป็น Bangkok (2026-11-08) ไม่ throw", J(bad) === J(["2026-11-08", "2026-11-08"]), J(bad));
  }

  // ═══ G ขอบเขตผู้ปิดวัน (OWNER สังเคราะห์ใน markNoShow) ═══
  console.log("\n── G ขอบเขต STAFF hotel.audit.run (OWNER สังเคราะห์) ──");
  {
    const a = await close(AUD1, UO, D);
    const b = await call(() => NA.auditPreview(AUD1, ctxA, { unitId: UO }));
    chk("G-1", "STAFF unitAccess [UH] ปิด/preview หน่วยอื่น ⇒ NOT_FOUND · การจองหน่วยอื่นไม่ถูกตั้งไม่มา", a?.code === "NOT_FOUND" && b?.code === "NOT_FOUND" && (await rvOf(O_C.id)).status === "CONFIRMED", `${code(a)} ${code(b)}`);
    const direct = await call(() => BK.markNoShow(AUD1, ctxA, { unitId: UO, reservationId: O_C.id }));
    const direct2 = await call(() => BK.markNoShow(AUD, ctxA, { unitId: UO, reservationId: O_C.id }));
    chk("G-2", "markNoShow ตรงโดย STAFF ที่มีแค่ hotel.audit.run ⇒ ถูกปฏิเสธ (พลัง OWNER สังเคราะห์ไม่รั่วออกนอกการปิดวัน)", direct?.ok === false && direct2?.ok === false && (await rvOf(O_C.id)).status === "CONFIRMED", `${code(direct)} ${code(direct2)}`);
    const pv = await call(() => NA.closeNightAudit({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: AUD1.userId }, ctxA, { unitId: UO, businessDate: D }));
    console.log(`  ℹ️  [G-3] ข้อมูล: closeNightAudit เชื่อ actor ที่ผู้เรียกส่งมา (ไม่อ่าน Membership สด · แบบเดียวกับโมดูล hotel อื่น) — role ปลอม OWNER ⇒ ${code(pv)}`);
  }

  // ═══ U reopen + undoNoShow + ปิดใหม่ ═══
  console.log("\n── U reopen → undoNoShow → ปิดใหม่ (แบบ cron) ──");
  {
    const row = await auditRow(UH, D);
    const ro = await reopen(MGR, row.id);
    const un = await call(() => BK.undoNoShow(MGR, ctxA, { unitId: UH, reservationId: H_C.id }));
    const st1 = (await rvOf(H_C.id)).status;
    const rc = await close(null, UH, D);
    const st2 = (await rvOf(H_C.id)).status;
    const fs = await forfeitSales(H_C.id);
    chk("U-1", "reopen ok · undoNoShow ok ⇒ CONFIRMED · ปิดใหม่ (cron) ok · บิลริบ C ยัง 1 (ไม่ริบซ้ำ)", ro?.ok === true && un?.ok === true && st1 === "CONFIRMED" && rc?.ok === true && fs.length === 1, `${code(ro)} ${code(un)} st1=${st1} ${code(rc)} forfeit=${fs.length}`);
    chk("U-2", "หลังปิดใหม่ C ที่ผู้จัดการย้อน «ไม่มา» แล้ว ถูกตั้งไม่มาซ้ำโดยอัตโนมัติ (ข้อสังเกต · cron ปิดวัน REOPENED ภายใน ≤15 นาที)", st2 === "CONFIRMED", `status หลังปิดใหม่ = ${st2}`);
    const k = await auditRow(UH, D);
    chk("U-3", "KPI หลังปิดใหม่ noShowCount สอดคล้องสถานะจริง", k?.noShowCount === (st2 === "NO_SHOW" ? 2 : 1), `${k?.noShowCount}`);
  }
} catch (e) {
  chk("Z-0", "probe ไม่ throw", false, errMsg(e));
} finally {
  await cleanup();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  const trg: Any[] = await prisma.$queryRawUnsafe(`SELECT tgname FROM pg_trigger WHERE tgname = '${TRIGGER}'`);
  chk("Z-1", "ล้างแล้ว: tenant h7rv-* 0 · trigger 0", left === 0 && trg.length === 0, `tenant=${left} trigger=${trg.length}`);
  const total = checks.length, passed = checks.filter((c) => c.ok === true).length, skipped = checks.filter((c) => c.ok === null).length;
  console.log(`\nJSON_SUMMARY ${J({ suite: LABEL, total, passed, failed: total - passed - skipped, skipped, failedIds: checks.filter((c) => c.ok === false).map((c) => c.id) })}`);
  await prisma.$disconnect?.();
  process.exit(0);
}
