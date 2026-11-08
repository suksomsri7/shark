// qc-svc-h.9-iso.mts — ใบ H.9 §0 ข้อ 4 · isolation 2 ร้าน × 2 หน่วยโรงแรม (A1 A2 · B1 B2) ทุก facade สาธารณะ/ภายในของ H.1–H.10
//   เหยื่อ = หน่วย A1 (ราคา/ฤดู/วันหยุด/override · การจองพัก+ยืนยัน+เว็บ HOLD+สลิป · ผู้พักต่างชาติ (ตม.30/ร.ร.3) · folio · BLOCK · log แม่บ้าน ·
//            วันปิดแล้ว · บิลลงห้องที่ไม่ผูก · ตัวต่อ OTA + แม็ป + inbox) · slug หน่วย B1 = slug หน่วย A1 (ชนโดยตั้งใจ)
//   รูปแบบการโจมตี (ต่อ facade ตามที่มีพารามิเตอร์):
//     P1 ร้าน B (เจ้าของ B · ctx B) อ้างหน่วย A1 + id ของ A1        P2 ร้าน B อ้างหน่วยตัวเอง B1 + id ของ A1
//     P3 ผู้จัดการ A2 (unitAccess [A2] · สิทธิ์โรงแรมครบ) อ้างหน่วย A1   P4 เจ้าของ A อ้างหน่วย A2 + id ของ A1 (หน่วย/วัตถุไม่ตรงกัน)
//   ผ่าน = ok:false NOT_FOUND|FORBIDDEN (หรือ null / ผลว่างสำหรับตัวอ่านที่ไม่รับผู้กระทำ) · ไม่มีชื่อ/เบอร์/รหัสจอง/id ของ A1 ที่ผู้เรียกไม่ได้ส่งมาในคำตอบ ·
//         ทุกตาราง (ที่มี tenantId) ของร้าน A/B ไม่เปลี่ยนเลยหลังเรียก (แฮชทั้งแถว ต่อ facade · ยกเว้นถัง rate-limit)
// แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {suite,total,passed,failed,skipped}" · ร้าน/ผู้ใช้ prefix h9iso- ลบใน finally · INTEGRATIONS_FAKE=1
// รัน (cwd ทรี): bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.9-iso.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const SUITE = "qc-svc-h.9-iso";
const SLUG = "h9iso-";
loadSvcQcEnv(SUITE);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${SUITE}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY;
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").trim().length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
const T_START = Date.now();
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

// ── harness ──
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; why: string }[] = [];
const J = (v: unknown) => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const line = (id: string, res: Res, name: string, why = "") => { cks.push({ id, res, why }); console.log(`  ${res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ "} [${id}] ${name}${why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`); };
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { if (r?.ok !== true) throw new Error(`${what}: ${r?.code ?? J(r).slice(0, 200)} ${r?.reason ?? ""}`); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const withClock = async <T,>(fn: () => Promise<T>): Promise<T> => { process.env.SVC_QC_CLOCK = "1"; try { return await fn(); } finally { delete process.env.SVC_QC_CLOCK; } };

const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const SET = (await import(`${R}/core/settings`)) as Any;
const H = (await import(`${R}/modules/hotel`)) as Any;
const WEB = (await import(`${R}/platform/hotel-web`)) as Any;
const SV = (await import(`${R}/payment/slip-verify`)) as Any;
const SYS = (await import(`${R}/modules/system/service`)) as Any;
const POS = (await import(`${R}/modules/pos/service`)) as Any;
const INT = (await import(`${R}/core/integrations`)) as Any;
const OC = (await import(`${R}/outbox-consumers`)) as Any;

const tenantIds: string[] = [];
let TABLES: string[] = [];
async function cleanup() {
  const stale = (await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } })).map((t: Any) => t.id as string);
  const ids = [...new Set([...tenantIds, ...stale])];
  if (ids.length) {
    for (const t of ["RoomOccupancy", "HotelBookingNight", "PaymentSlip", "ChannelRoomMap", "ChannelRateMap", "ChannelInventoryBuffer", "ChannelAriJob", "ChannelReservationInbox", "IntegrationCallLog"]) {
      try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, ids); } catch { /* FK */ }
    }
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
    for (let pass = 0; pass < 16 && pending.length; pass++) {
      const next: string[] = [];
      for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, ids); } catch { next.push(t); } }
      pending = next;
    }
    if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
    try { await prisma.tenant.deleteMany({ where: { id: { in: ids } } }); } catch (e) { console.log(`  ⚠️ ลบ tenant ${errMsg(e)}`); }
  }
  try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); }
}
/** แฮชทุกแถวของร้าน A/B ทุกตารางที่มี tenantId (คำสั่งเดียว) — ยกเว้นถัง rate-limit ของหน้าเว็บ */
const SKIP_TABLES = new Set(["Tenant", "ChatRateBucket"]);
async function snapshot(): Promise<Map<string, string>> {
  const sql = TABLES.map((t) => `SELECT '${t}' AS t, count(*)::int AS n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '') AS h FROM "${t}" x WHERE x."tenantId" = ANY($1::text[])`).join(" UNION ALL ");
  const rows: { t: string; n: number; h: string }[] = await prisma.$queryRawUnsafe(sql, tenantIds);
  return new Map(rows.map((r) => [r.t, `${r.n}:${r.h}`]));
}
const diff = (a: Map<string, string>, b: Map<string, string>) => [...b.entries()].filter(([t, v]) => a.get(t) !== v).map(([t, v]) => `${t}(${a.get(t)?.split(":")[0]}→${v.split(":")[0]})`);
async function drain() { for (let i = 0; i < 3; i++) await OC.drainAll(); }

let exitCode = 0;
try {
  await cleanup();
  console.log(`(ฐาน ${process.env.SVC_QC_HOST} · วันนี้ไทย ${T0} · run ${RUN})`);

  // ═══ ตั้ง 2 ร้าน × 2 หน่วยโรงแรม ═══
  const mkTenant = async (tag: string) => { const t = await prisma.tenant.create({ data: { name: `H9 iso ร้าน ${tag}`, slug: `${SLUG}${tag.toLowerCase()}-${RUN}` } }); tenantIds.push(t.id); return { id: t.id as string, slug: t.slug as string }; };
  const TA = await mkTenant("A"), TB = await mkTenant("B");
  const tA = TA.id, tB = TB.id;
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const SHARED_SLUG = `${SLUG}hotel-${RUN}`; // A1 และ B1 ใช้ slug หน่วยเดียวกัน
  const mkUnit = async (tenantId: string, name: string, slug: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name, slug } })).id as string;
  const A1 = await mkUnit(tA, "โรงแรม A1", SHARED_SLUG), A2 = await mkUnit(tA, "โรงแรม A2", `${SLUG}a2-${RUN}`);
  const B1 = await mkUnit(tB, "โรงแรม B1", SHARED_SLUG), B2 = await mkUnit(tB, "โรงแรม B2", `${SLUG}b2-${RUN}`);
  const UNITS: Record<string, { t: string; u: string; tag: string }> = { A1: { t: tA, u: A1, tag: "A1" }, A2: { t: tA, u: A2, tag: "A2" }, B1: { t: tB, u: B1, tag: "B1" }, B2: { t: tB, u: B2, tag: "B2" } };
  const TYPE: Record<string, string> = {}, ROOMS: Record<string, string[]> = {}, ROOMNO: Record<string, string[]> = {};
  for (const [k, x] of Object.entries(UNITS)) {
    TYPE[k] = (await prisma.hotelRoomType.create({ data: { tenantId: x.t, unitId: x.u, name: `ดีลักซ์ ${k}-${RUN}`, rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id;
    ROOMS[k] = []; ROOMNO[k] = [];
    for (let i = 1; i <= 4; i++) { const no = `${k}R${i}x${RUN.slice(-4)}`; ROOMNO[k].push(no); ROOMS[k].push((await prisma.hotelRoom.create({ data: { tenantId: x.t, unitId: x.u, number: no, roomTypeId: TYPE[k], hkStatus: "CLEAN" } })).id); }
  }
  const posA = (await SYS.createSystem(tA, "POS", "POS iso A")).id as string;
  for (const u of [A1, A2]) await SYS.linkUnit(tA, posA, u);
  const posB = (await SYS.createSystem(tB, "POS", "POS iso B")).id as string;
  for (const u of [B1, B2]) await SYS.linkUnit(tB, posB, u);
  for (const t of [tA, tB]) await prisma.paymentProfile.create({ data: { tenantId: t, promptpayId: "0812345678", displayName: "iso" } });
  const ALLP = { "hotel.audit.run": true, "hotel.reports.read": true, "hotel.booking.manage": true, "hotel.folio.post": true, "hotel.folio.void": true, "hotel.reservation.checkOut": true, "hotel.reservation.checkIn": true, "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.guest.register": true, "hotel.guest.viewId": true, "hotel.housekeeping": true, "hotel.housekeeping.inspect": true, "hotel.rates.read": true, "hotel.rates.write": true, "hotel.settings.write": true, "hotel.channel.manage": true, "payments.slip.review": true };
  const mkMember = async (tag: string, tenantId: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `H9 iso ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER_A = await mkMember("owner-a", tA, "OWNER", ["*"]);
  const MGR_A2 = await mkMember("mgr-a2", tA, "MANAGER", [A2], ALLP);
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const ownerOf = (t: string) => (t === tA ? OWNER_A : OWNER_B);
  const setUnit = async (t: string, u: string, key: string, value: unknown) => okRes(await SET.setSettings(ownerOf(t), { tenantId: t }, [{ key, scope: "UNIT", scopeId: u, value }]), `ตั้ง ${key}`);
  const PLAN: Record<string, string> = {};
  for (const [k, x] of Object.entries(UNITS)) {
    const c = { tenantId: x.t }, o = ownerOf(x.t);
    okRes(await H.listRatePlans(o, c, { unitId: x.u }), `listRatePlans ${k}`);
    PLAN[k] = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: x.t, unitId: x.u, code: "STANDARD" } })).id;
    okRes(await H.saveRatePlan(o, c, { unitId: x.u, id: PLAN[k], code: "STANDARD", name: `มาตรฐาน ${k}`, visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
    okRes(await H.saveRates(o, c, { unitId: x.u, ratePlanId: PLAN[k], rows: [{ roomTypeId: TYPE[k], seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 120_000, priceHolidaySatang: null }] }), "saveRates");
    await setUnit(x.t, x.u, "rooms.hotel.audit.autoClose", false);
    await setUnit(x.t, x.u, "rooms.hotel.minibar", [{ key: "water", name: "น้ำ", priceSatang: 2_000 }]);
    await setUnit(x.t, x.u, "rooms.hotel.holdMinutesOnline", 120);
  }
  // ── วัตถุของเหยื่อ A1 ──
  const V: Record<string, Any> = {};
  const oA = OWNER_A;
  const GNAME = `H9ISO VICTIM ${RUN.toUpperCase()}`, BNAME = `ผู้จองเหยื่อ ${RUN}`, PHONE = "0897770123", EMAIL = `${SLUG}victim-${RUN}@qc.invalid`;
  V.season = okRes(await H.saveSeason(oA, ctxA, { unitId: A1, name: `ฤดูเหยื่อ ${RUN}`, dateStart: W(30), dateEnd: W(40), priority: 5 }), "saveSeason").season.id;
  okRes(await H.saveHolidays(oA, ctxA, { unitId: A1, dates: [W(31)], name: `หยุดเหยื่อ ${RUN}` }), "saveHolidays");
  okRes(await H.setOverride(oA, ctxA, { unitId: A1, roomTypeId: TYPE.A1, ratePlanId: PLAN.A1, date: W(32), priceSatang: 150_000, reason: "เหยื่อ override" }), "setOverride");
  okRes(await H.saveCancelRules(oA, ctxA, { unitId: A1, ratePlanId: PLAN.A1, rules: [{ daysBefore: 3, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }] }), "cancelRules");
  const guest = { name: BNAME, phone: PHONE, email: EMAIL };
  const ci = okRes(await withClock(() => H.createBooking(oA, ctxA, { unitId: A1, rooms: [{ roomTypeId: TYPE.A1, adults: 2, children: 0 }], ratePlanId: PLAN.A1, source: "PHONE", guest, checkIn: W(-1), checkOut: W(2), at: `${W(-1)}T03:00:00.000Z` })), "จองพัก").reservations[0];
  V.rvCI = ci.id; V.codeCI = ci.code;
  const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, refType: "HotelReservation", refId: V.rvCI, active: true } });
  V.roomCI = (await prisma.hotelReservation.findUnique({ where: { id: V.rvCI } })).roomId ?? occ?.roomId;
  const GDEU = { fullName: GNAME, nationality: "DEU", idType: "PASSPORT", idNumber: `H9I${RUN.slice(-6).toUpperCase()}`, dob: "1980-01-02", sex: "M", occupation: "Engineer", address: "Berlin", visaType: "TR", visaNo: "H9ISOV1", arrivalDate: W(-1), portOfEntry: "BKK", tm6No: "H9ISOTM6" };
  const cin = okRes(await H.checkInV2(oA, ctxA, { reservationId: V.rvCI, roomId: V.roomCI, guests: [GDEU] }), "checkInV2");
  V.guest = cin.guestIds[0];
  V.item = okRes(await H.postFolioItem(oA, ctxA, { reservationId: V.rvCI, type: "SERVICE", description: "ซักรีดเหยื่อ", qty: 1, unitAmountSatang: 10_000 }), "postFolioItem").itemId;
  const cf = okRes(await H.createBooking(oA, ctxA, { unitId: A1, rooms: [{ roomTypeId: TYPE.A1, adults: 2, children: 0 }], ratePlanId: PLAN.A1, source: "PHONE", guest, checkIn: W(10), checkOut: W(12) }), "จองล่วงหน้า");
  V.rvCF = cf.reservations[0].id; V.codeCF = cf.reservations[0].code; V.groupCF = cf.groupId ?? null;
  okRes(await H.takeBookingDeposit(oA, ctxA, { unitId: A1, reservationId: V.rvCF, payType: "CASH" }), "มัดจำ CF");
  const tick = () => WEB.holdFormStart(A1, new Date(Date.now() - 10_000));
  const hold = okRes(await WEB.publicCreateHold({ tenantSlug: TA.slug, unitSlug: SHARED_SLUG, checkIn: W(14), checkOut: W(15), adults: 2, children: 0, rooms: [{ roomTypeId: TYPE.A1, qty: 1, ratePlanId: PLAN.A1 }], guest, locale: "th", spam: { hp: "", st: tick() }, idempotencyKey: `${SLUG}idem-${uid()}` }, { clientKey: `${SLUG}ip-${uid()}` }), "เว็บ HOLD");
  V.token = hold.publicToken; V.codeWeb = hold.code;
  V.rvWeb = (await prisma.hotelReservation.findUnique({ where: { publicToken: V.token } })).id;
  const png = () => Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]));
  const deps = { put: async () => {}, del: async () => 200 };
  V.slip = okRes(await WEB.publicAttachSlip({ tenantSlug: TA.slug, unitSlug: SHARED_SLUG, publicToken: V.token, file: { data: png(), contentType: "image/png" }, idempotencyKey: `${SLUG}slip-${uid()}` }, { clientKey: `${SLUG}ip-${uid()}`, deps }), "สลิป").slipId;
  V.block = okRes(await H.blockRoom(oA, ctxA, { unitId: A1, roomId: ROOMS.A1[3], from: W(20), to: W(21), reason: "ซ่อมแอร์เหยื่อ" }), "blockRoom");
  V.blockId = V.block.blockId ?? V.block.id ?? (await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, unitId: A1, kind: "BLOCK", active: true } }))?.refId;
  okRes(await H.hkSetStatus(oA, ctxA, { roomId: ROOMS.A1[2], to: "DIRTY", idempotencyKey: `${SLUG}hk-${uid()}` }), "hkSetStatus");
  okRes(await H.closeNightAudit(oA, ctxA, { unitId: A1, businessDate: W(-1) }), "closeNightAudit");
  V.audit = (await prisma.hotelNightAudit.findFirst({ where: { tenantId: tA, unitId: A1 } })).id;
  const sale = await POS.createSale({ tenantId: tA, unitId: A1, systemId: posA, sourceModule: "POS", idempotencyKey: `${SLUG}rc-${uid()}`, lines: [{ name: "กาแฟเหยื่อ", qty: 1, unitPriceSatang: 8_000 }], payMethods: [{ type: "ROOM_CHARGE", amountSatang: 8_000, reference: "ไม่มีห้องนี้" }] });
  V.sale = sale?.saleId ?? sale?.id ?? sale?.sale?.id;
  const connOf = async (t: string, u: string, tag: string) => {
    const o = ownerOf(t), c = { tenantId: t };
    const sv = okRes(await INT.saveIntegration(c, o, { create: true, kind: "CHANNEL_MANAGER", provider: "FAKE", label: `OTA ${tag}`, unitIds: [u], fields: { apiKey: `h9iso-${tag}-${RUN}`, accountId: `acc-${tag}-${RUN}`, mode: "OK" } }), `saveIntegration ${tag}`);
    okRes(await INT.testIntegration(c, o, { id: sv.integration.id }), "test");
    okRes(await H.saveRoomMap(o, c, { unitId: u, connectionId: sv.integration.id, roomTypeId: TYPE[tag], externalRoomId: "DLX" }), "map room");
    okRes(await H.saveRateMap(o, c, { unitId: u, connectionId: sv.integration.id, ratePlanId: PLAN[tag], externalRateId: "STD", markupBp: 0 }), "map rate");
    return sv.integration.id as string;
  };
  V.conn = await connOf(tA, A1, "A1");
  V.connB = await connOf(tB, B1, "B1");
  okRes(await H.ingestInbound(V.conn, [{ externalId: `ISO-${RUN}`, version: 1, status: "NEW", externalRoomId: "DLX", externalRateId: "STD", checkIn: W(-3), checkOut: W(-2), rooms: 1, adults: 2, children: 0, guest: { name: BNAME, phone: PHONE, email: EMAIL }, grossSatang: 100_000, commissionSatang: 15_000, netSatang: 85_000, prepaid: false }]), "ingest");
  V.inbox = (await prisma.channelReservationInbox.findFirst({ where: { connectionId: V.conn } })).id;
  await drain();
  const victimRows = { rv: await prisma.hotelReservation.count({ where: { unitId: A1 } }), guest: await prisma.hotelGuestRecord.count({ where: { unitId: A1 } }) };
  console.log(`(เหยื่อ A1: การจอง ${victimRows.rv} · ผู้พัก ${victimRows.guest} · audit ${V.audit} · block ${V.blockId} · slip ${V.slip} · บิลไม่ผูก ${V.sale} · inbox ${V.inbox})`);
  // ฉากต้องครบก่อนทดสอบ (ไม่ครบ = ข้อทดสอบไร้ความหมาย)
  for (const k of ["season", "rvCI", "roomCI", "guest", "item", "rvCF", "token", "slip", "blockId", "audit", "sale", "conn", "inbox"]) if (!V[k]) throw new Error(`ฉากเหยื่อไม่ครบ: ${k}`);

  const rows0: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  TABLES = rows0.map((r) => r.t).filter((t) => !SKIP_TABLES.has(t)).sort();
  const t1 = Date.now(); await snapshot(); console.log(`(แฮช ${TABLES.length} ตาราง ต่อครั้ง ${Date.now() - t1} ms)`);

  // ── เครื่องหมายรั่ว (PII + ชื่อเฉพาะของ A1) + id ของ A1 (นับเฉพาะที่ผู้เรียกไม่ได้ส่งมา) ──
  const PII = [GNAME, BNAME, PHONE, EMAIL, V.codeCI, V.codeCF, V.codeWeb, `ฤดูเหยื่อ ${RUN}`, `หยุดเหยื่อ ${RUN}`, "ซักรีดเหยื่อ", "กาแฟเหยื่อ", "ซ่อมแอร์เหยื่อ", GDEU.idNumber, ...ROOMNO.A1, `ดีลักซ์ A1-${RUN}`];
  const IDS = [A1, TYPE.A1, PLAN.A1, ...ROOMS.A1, V.rvCI, V.rvCF, V.rvWeb, V.guest, V.item, V.season, V.blockId, V.audit, V.slip, V.sale, V.conn, V.inbox, V.token];
  let LAST_IN = "";
  const rec = <T,>(o: T): T => { LAST_IN += J(o); return o; };
  const leaks = (r: unknown) => { const s = J(r); return [...PII.filter((m) => s.includes(m)), ...IDS.filter((m) => s.includes(m) && !LAST_IN.includes(m)).map((m) => `id:${m.slice(0, 10)}…`)]; };
  const DENY = new Set(["NOT_FOUND", "FORBIDDEN", "PERMISSION_DENIED"]); // PERMISSION_DENIED = คำของ payment/slip-verify (ด่านหน่วยของสลิป)
  type Pat = "P1" | "P2" | "P3" | "P4";
  type P = { pat: Pat; actor: Any; ctx: Any; unitId: string; tenantId: string; slug: string };
  const PATS: Record<Pat, P> = {
    P1: { pat: "P1", actor: OWNER_B, ctx: ctxB, unitId: A1, tenantId: tB, slug: TB.slug },
    P2: { pat: "P2", actor: OWNER_B, ctx: ctxB, unitId: B1, tenantId: tB, slug: TB.slug },
    P3: { pat: "P3", actor: MGR_A2, ctx: ctxA, unitId: A1, tenantId: tA, slug: TA.slug },
    P4: { pat: "P4", actor: OWNER_A, ctx: ctxA, unitId: A2, tenantId: tA, slug: TA.slug },
  };
  const isEmptyish = (r: Any): boolean => {
    if (r === null || r === undefined || r === false || r === 0) return true;
    if (Array.isArray(r)) return r.length === 0;
    if (typeof r !== "object") return false;
    const arrs = Object.values(r).filter(Array.isArray) as unknown[][];
    if (r.byDate && typeof r.byDate === "object") return Object.values(r.byDate).every((d: Any) => !d || Object.keys(d).length === 0);
    return arrs.length > 0 && arrs.every((a) => a.length === 0);
  };
  /** kind: W = เขียน (ต้องถูกปฏิเสธ) · R = อ่าน (ปฏิเสธ หรือ ผลว่าง/null) */
  type Case = { id: string; name: string; kind: "W" | "R"; pats: Pat[]; fn: (p: P) => Promise<Any>; after?: () => Promise<string | null> };
  const cases: Case[] = [];
  const add = (id: string, name: string, kind: "W" | "R", pats: Pat[], fn: (p: P) => Promise<Any>, after?: () => Promise<string | null>) => cases.push({ id, name, kind, pats, fn, after });
  const ALL4: Pat[] = ["P1", "P2", "P3", "P4"];
  const U3: Pat[] = ["P1", "P3"]; // อ้างหน่วยเป้าหมายอย่างเดียว (ไม่มีวัตถุ) — P2/P4 = ดูหน่วยตัวเอง (ไม่ใช่การข้าม)
  const NOU: Pat[] = ["P1", "P3"]; // ไม่มี unitId ในอินพุต (หน่วยมาจากวัตถุ)
  const CTX: Pat[] = ["P1", "P2", "P4"]; // ไม่รับผู้กระทำ (ด่านอยู่ที่หน้า) — ข้ามร้าน/หน่วยไม่ตรงวัตถุเท่านั้น
  const CTXU: Pat[] = ["P1"]; // ไม่รับผู้กระทำ + ไม่มีวัตถุ (อ่านทั้งหน่วย) — ข้ามร้านเท่านั้น
  const RPT: Pat[] = ["P1", "P3"]; // รายงาน (ด่านสมาชิกในรายงานเอง)
  const rctx = (p: P) => ({ tenantId: p.ctx.tenantId, actorUserId: p.actor.userId });
  const GUESTIN = { ...GDEU, fullName: "H9ISO INTRUDER", idNumber: "H9INTRUDE1" };

  // ═══ H.1 ราคา ═══
  add("H1-01", "listRatePlans", "R", U3, (p) => H.listRatePlans(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H1-02", "saveRatePlan (แก้แผน A1 ด้วย id)", "W", ALL4, (p) => H.saveRatePlan(p.actor, p.ctx, rec({ unitId: p.unitId, id: PLAN.A1, code: "STANDARD", name: "ถูกแก้", visibility: ["WEB"] })));
  add("H1-03", "archiveRatePlan", "W", ALL4, (p) => H.archiveRatePlan(p.actor, p.ctx, rec({ unitId: p.unitId, id: PLAN.A1 })));
  add("H1-04", "saveCancelRules", "W", ALL4, (p) => H.saveCancelRules(p.actor, p.ctx, rec({ unitId: p.unitId, ratePlanId: PLAN.A1, rules: [{ daysBefore: 0, refundBp: 10_000 }] })));
  add("H1-05", "listSeasons", "R", U3, (p) => H.listSeasons(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H1-06", "saveSeason (แก้ฤดู A1 ด้วย id)", "W", ALL4, (p) => H.saveSeason(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.season, name: "ถูกแก้", dateStart: W(30), dateEnd: W(41), priority: 9 })));
  add("H1-07", "archiveSeason", "W", ALL4, (p) => H.archiveSeason(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.season })));
  add("H1-08", "saveHolidays (หน่วย A1)", "W", ["P1", "P3"], (p) => H.saveHolidays(p.actor, p.ctx, rec({ unitId: p.unitId, dates: [W(33)], name: "แทรก" })));
  add("H1-09", "removeHoliday (หน่วย A1)", "W", ["P1", "P3"], (p) => H.removeHoliday(p.actor, p.ctx, rec({ unitId: p.unitId, date: W(31) })));
  add("H1-10", "getRateMatrix (แผน A1)", "R", ALL4, (p) => H.getRateMatrix(p.actor, p.ctx, rec({ unitId: p.unitId, ratePlanId: PLAN.A1 })));
  add("H1-11", "saveRates (แผน/ประเภท A1)", "W", ALL4, (p) => H.saveRates(p.actor, p.ctx, rec({ unitId: p.unitId, ratePlanId: p.unitId === A1 ? PLAN.A1 : PLAN[p.unitId === B1 ? "B1" : "A2"], rows: [{ roomTypeId: TYPE.A1, seasonId: null, priceWeekdaySatang: 1, priceWeekendSatang: 1, priceHolidaySatang: null }] })));
  add("H1-12", "setOverride (ประเภท A1)", "W", ALL4, (p) => H.setOverride(p.actor, p.ctx, rec({ unitId: p.unitId, roomTypeId: TYPE.A1, ratePlanId: null, date: W(34), priceSatang: 1, reason: "แทรก" })));
  add("H1-13", "clearOverride (ประเภท A1)", "W", ALL4, (p) => H.clearOverride(p.actor, p.ctx, rec({ unitId: p.unitId, roomTypeId: TYPE.A1, ratePlanId: PLAN.A1, date: W(32) })));
  add("H1-14", "loadPricingContext(ctx, หน่วย A1)", "R", CTXU, (p) => H.loadPricingContext(p.ctx, rec(p.unitId), { from: W(30), to: W(35) }));
  add("H1-15", "ratePreview(ctx, หน่วย A1)", "R", CTXU, (p) => H.ratePreview(p.ctx, rec(p.unitId), { from: W(30), to: W(35) }));
  add("H1-16", "loadRatesScreen", "R", U3, (p) => H.loadRatesScreen(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H1-17", "loadHotelSettings", "R", U3, (p) => H.loadHotelSettings(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H1-18", "saveHotelSettings (หน่วย A1)", "W", ["P1", "P3"], (p) => H.saveHotelSettings(p.actor, p.ctx, rec({ unitId: p.unitId, changes: [{ key: "rooms.hotel.holdMinutesOnline", scope: "UNIT", scopeId: A1, value: 99 }] })));
  add("H1-19", "saveHotelSettings (หน่วยตัวเอง แต่ scopeId = A1 / แผน A1)", "W", ["P2", "P4"], (p) => H.saveHotelSettings(p.actor, p.ctx, rec({ unitId: p.unitId, changes: [{ key: "rooms.hotel.holdMinutesOnline", scope: "UNIT", scopeId: A1, value: 99 }, { key: "rooms.hotel.deposit", scope: "RATE_PLAN", scopeId: PLAN.A1, value: { kind: "NONE" } }] })));
  add("H1-20", "resetHotelSetting (ค่าตั้งหน่วย A1)", "W", ALL4, (p) => H.resetHotelSetting(p.actor, p.ctx, rec({ unitId: p.unitId, key: "rooms.hotel.holdMinutesOnline", scope: "UNIT", scopeId: A1 })));
  // ═══ H.2 tape / BLOCK ═══
  add("H2-01", "tapeChart(ctx, หน่วย A1)", "R", CTXU, (p) => H.tapeChart(p.ctx, rec({ unitId: p.unitId, from: W(-1), days: 14 })));
  add("H2-02", "hotelToday(ctx, หน่วย A1)", "R", CTXU, (p) => H.hotelToday(p.ctx, rec({ unitId: p.unitId })));
  add("H2-03", "previewMove (การจอง A1)", "R", CTX, (p) => H.previewMove(p.ctx, rec({ unitId: p.unitId, id: V.rvCF, roomId: ROOMS.A1[1], checkIn: W(10), checkOut: W(12) })));
  add("H2-04", "blockRoom (ห้อง A1)", "W", ALL4, (p) => H.blockRoom(p.actor, p.ctx, rec({ unitId: p.unitId, roomId: ROOMS.A1[0], from: W(25), to: W(26), reason: "แทรก" })));
  add("H2-05", "releaseBlock (BLOCK ของ A1)", "W", ALL4, (p) => H.releaseBlock(p.actor, p.ctx, rec({ unitId: p.unitId, blockId: V.blockId })));
  add("H2-06", "listBlocks", "R", U3, (p) => H.listBlocks(p.actor, p.ctx, rec({ unitId: p.unitId, from: W(0), to: W(30) })));
  // ═══ H.3 จอง ═══
  add("H3-01", "createBooking (ประเภท/แผน A1)", "W", ALL4, (p) => H.createBooking(p.actor, p.ctx, rec({ unitId: p.unitId, rooms: [{ roomTypeId: TYPE.A1, adults: 2, children: 0 }], ratePlanId: PLAN.A1, source: "PHONE", guest: { name: "ผู้บุกรุก", phone: "0800000000" }, checkIn: W(50), checkOut: W(51) })));
  add("H3-02", "getBooking", "R", ALL4, (p) => H.getBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCI, reservationId: V.rvCI })));
  add("H3-03", "listBookings", "R", U3, (p) => H.listBookings(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H3-04", "confirmBooking (เว็บ HOLD A1)", "W", ALL4, (p) => H.confirmBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvWeb, reservationId: V.rvWeb })));
  add("H3-05", "extendBooking", "W", ALL4, (p) => H.extendBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, newCheckOut: W(13) })));
  add("H3-06", "shortenBooking", "W", ALL4, (p) => H.shortenBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, newCheckOut: W(11) })));
  add("H3-07", "assignRoom", "W", ALL4, (p) => H.assignRoom(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, roomId: ROOMS.A1[1] })));
  add("H3-08", "rescheduleBooking", "W", ALL4, (p) => H.rescheduleBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, checkIn: W(11), checkOut: W(13) })));
  add("H3-09", "moveBooking", "W", ALL4, (p) => H.moveBooking(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, roomId: ROOMS.A1[1] })));
  add("H3-10", "quoteExtension", "R", ALL4, (p) => H.quoteExtension(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF, newCheckOut: W(13) })));
  add("H3-11", "assignableRoomsFor", "R", ALL4, (p) => H.assignableRoomsFor(p.actor, p.ctx, rec({ unitId: p.unitId, id: V.rvCF })));
  add("H3-12", "takeBookingDeposit (เว็บ HOLD A1)", "W", ALL4, (p) => H.takeBookingDeposit(p.actor, p.ctx, rec({ unitId: p.unitId, reservationId: V.rvWeb, payType: "CASH" })));
  add("H3-13", "hotelAvailability.get(ctx, หน่วย A1)", "R", CTXU, (p) => H.hotelAvailability.get(p.ctx, rec({ unitId: p.unitId, from: W(10), to: W(12) })));
  add("H3-14", "hotelAvailability.get(ctx, หน่วยตัวเอง + roomTypeId A1)", "R", ["P2", "P4"], (p) => H.hotelAvailability.get(p.ctx, rec({ unitId: p.unitId, from: W(10), to: W(12), roomTypeId: TYPE.A1 })));
  // ═══ H.4 เช็กอิน / ทะเบียน / ตม.30 ═══
  add("H4-01", "assignableRooms(ctx, การจอง A1)", "R", ["P1", "P2"], (p) => H.assignableRooms(p.ctx, rec({ reservationId: V.rvCF })));
  add("H4-02", "checkinView(ctx)", "R", CTX, (p) => H.checkinView(p.ctx, rec({ unitId: p.unitId, reservationId: V.rvCF })));
  add("H4-03", "checkInV2 (การจอง+ห้อง A1)", "W", NOU, (p) => H.checkInV2(p.actor, p.ctx, rec({ reservationId: V.rvCF, roomId: ROOMS.A1[1], guests: [GUESTIN], earlyOverride: { reason: "ทดสอบข้ามร้าน" } })));
  add("H4-04", "undoCheckIn", "W", NOU, (p) => H.undoCheckIn(p.actor, p.ctx, rec({ reservationId: V.rvCI, reason: "ทดสอบข้ามร้าน" })));
  add("H4-05", "upsertGuestRecord (เพิ่มผู้พักในการจอง A1)", "W", NOU, (p) => H.upsertGuestRecord(p.actor, p.ctx, rec({ reservationId: V.rvCI, guest: GUESTIN })));
  add("H4-06", "upsertGuestRecord (แก้ผู้พัก A1 ด้วย guestId)", "W", NOU, (p) => H.upsertGuestRecord(p.actor, p.ctx, rec({ reservationId: V.rvCI, guestId: V.guest, guest: GUESTIN })));
  add("H4-07", "deleteGuestRecord", "W", NOU, (p) => H.deleteGuestRecord(p.actor, p.ctx, rec({ guestId: V.guest })));
  add("H4-08", "listGuests", "R", U3, (p) => H.listGuests(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H4-09", "listGuests (หน่วยตัวเอง + reservationId A1)", "R", ["P2", "P4"], (p) => H.listGuests(p.actor, p.ctx, rec({ unitId: p.unitId, reservationId: V.rvCI })));
  add("H4-10", "revealGuestId", "R", NOU, (p) => H.revealGuestId(p.actor, p.ctx, rec({ guestId: V.guest })));
  add("H4-11", "signRr3", "W", NOU, (p) => H.signRr3(p.actor, p.ctx, rec({ guestId: V.guest, method: "PAPER", note: "แทรก" })));
  add("H4-12", "rr3Card(ctx)", "R", ["P1"], (p) => H.rr3Card({ ...p.ctx, userId: p.actor.userId }, rec({ guestId: V.guest })));
  add("H4-13", "rr4Register(ctx, หน่วย A1)", "R", CTXU, (p) => H.rr4Register(p.ctx, rec({ unitId: p.unitId, from: W(-5), to: W(5) })));
  add("H4-14", "rr4RegistrarCopy", "R", U3, (p) => H.rr4RegistrarCopy(p.actor, p.ctx, rec({ unitId: p.unitId, from: W(-5), to: W(5) })));
  add("H4-15", "tm30Queue(ctx, หน่วย A1)", "R", CTXU, (p) => H.tm30Queue(p.ctx, rec({ unitId: p.unitId })));
  add("H4-16", "tm30Export (ผู้พัก A1)", "R", ALL4, (p) => H.tm30Export(p.actor, p.ctx, rec({ unitId: p.unitId, guestIds: [V.guest], format: "csv" })));
  add("H4-17", "markTm30Filed (ผู้พัก A1)", "W", NOU, (p) => H.markTm30Filed(p.actor, p.ctx, rec({ guestIds: [V.guest], tm30Ref: "TM30-INTRUDE" })));
  // ═══ H.5 folio / เช็กเอาต์ / ลงห้อง ═══
  add("H5-01", "getFolio", "R", NOU, (p) => H.getFolio(p.actor, p.ctx, rec({ reservationId: V.rvCI })));
  add("H5-02", "postFolioItem", "W", NOU, (p) => H.postFolioItem(p.actor, p.ctx, rec({ reservationId: V.rvCI, type: "SERVICE", description: "แทรก", qty: 1, unitAmountSatang: 1 })));
  add("H5-03", "voidFolioItem", "W", NOU, (p) => H.voidFolioItem(p.actor, p.ctx, rec({ itemId: V.item, reason: "แทรกข้ามร้าน" })));
  add("H5-04", "postRoomNights(ctx)", "W", ["P1"], (p) => H.postRoomNights(p.ctx, rec({ reservationId: V.rvCI, upToDate: W(1) })));
  add("H5-05", "folioForGroup", "R", NOU, (p) => H.folioForGroup(p.actor, p.ctx, rec({ groupId: V.groupCF ?? V.rvCF })));
  add("H5-06", "prepareCheckout", "R", NOU, (p) => H.prepareCheckout(p.actor, p.ctx, rec({ reservationId: V.rvCI })));
  add("H5-07", "takeSecurityDeposit", "W", NOU, (p) => H.takeSecurityDeposit(p.actor, p.ctx, rec({ reservationId: V.rvCI, amountSatang: 100, payType: "CASH" })));
  add("H5-08", "refundSecurityDeposit", "W", NOU, (p) => H.refundSecurityDeposit(p.actor, p.ctx, rec({ reservationId: V.rvCI })));
  add("H5-09", "forfeitSecurityDeposit", "W", NOU, (p) => H.forfeitSecurityDeposit(p.actor, p.ctx, rec({ reservationId: V.rvCI, reason: "แทรกข้ามร้าน" })));
  add("H5-10", "chargeToRoom (ร้าน B อ้าง reservationId/ห้อง/รหัสจอง ของ A1)", "W", ["P1"], async () => {
    const out: Any[] = [];
    for (const folioRef of [{ reservationId: V.rvCI }, { roomNumber: ROOMNO.A1.find((n, i) => ROOMS.A1[i] === V.roomCI) }, { bookingCode: V.codeCI }]) out.push(await call(() => H.chargeToRoom(rec({ tenantId: tB, folioRef, lines: [{ name: "แทรก", qty: 1, unitAmountSatang: 1 }], sourceSaleId: `iso-${uid()}` }))));
    out.push(await call(() => H.chargeToRoom(rec({ tenantId: tB, hotelUnitId: A1, folioRef: { reservationId: V.rvCI }, lines: [{ name: "แทรก", qty: 1, unitAmountSatang: 1 }], sourceSaleId: `iso-${uid()}` }))));
    return out.find((r) => r?.ok !== false) ?? out[0];
  });
  add("H5-11", "chargeToRoom (ร้าน A ระบุหน่วย A2 + การจอง A1)", "W", ["P4"], () => H.chargeToRoom(rec({ tenantId: tA, hotelUnitId: A2, folioRef: { reservationId: V.rvCI }, lines: [{ name: "แทรก", qty: 1, unitAmountSatang: 1 }], sourceSaleId: `iso-${uid()}` })));
  add("H5-12", "listUnmatchedRoomCharges", "R", U3, (p) => H.listUnmatchedRoomCharges(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H5-12b", "listUnmatchedRoomCharges หน่วย A2 เห็นบิลไม่ผูกของ A1 (POS ร่วม)", "R", [], async () => null);
  add("H5-13", "attachRoomCharge (บิลไม่ผูกของ A1 → การจอง A1)", "W", NOU, (p) => H.attachRoomCharge(p.actor, p.ctx, rec({ saleId: V.sale, reservationId: V.rvCI })));
  add("H5-14", "postDeposit(ctx หน่วย B1/A2, การจอง A1) ภายใน", "W", ["P2", "P4"], (p) => H.postDeposit({ tenantId: p.ctx.tenantId, unitId: p.unitId }, rec({ reservationId: V.rvCI, saleId: `iso-${uid()}`, amountSatang: 1 })).then((r: Any) => (r?.posted ? { ok: true, posted: true } : { ok: false, code: "NOT_FOUND" })));
  add("H5-15", "settleAndCheckOut (ท้ายสุดของหมวดเงิน)", "W", NOU, (p) => H.settleAndCheckOut(p.actor, p.ctx, rec({ reservationId: V.rvCI, shiftId: null, securityDeposit: "REFUND", payMethods: [{ type: "CASH", amountSatang: 100 }] })));
  // ═══ H.6 แม่บ้าน ═══
  const hkKey = () => `${SLUG}k-${uid()}`;
  add("H6-01", "hkSetStatus (ห้อง A1)", "W", NOU, (p) => H.hkSetStatus(p.actor, p.ctx, rec({ roomId: ROOMS.A1[2], to: "CLEAN", idempotencyKey: hkKey() })));
  add("H6-02", "hkStart", "W", NOU, (p) => H.hkStart(p.actor, p.ctx, rec({ roomId: ROOMS.A1[2] })));
  add("H6-03", "hkRelease", "W", NOU, (p) => H.hkRelease(p.actor, p.ctx, rec({ roomId: ROOMS.A1[2] })));
  add("H6-04", "hkFinish", "W", NOU, (p) => H.hkFinish(p.actor, p.ctx, rec({ roomId: ROOMS.A1[2], checklist: [], idempotencyKey: hkKey() })));
  add("H6-05", "hkInspect", "W", NOU, (p) => H.hkInspect(p.actor, p.ctx, rec({ roomId: ROOMS.A1[1], pass: true, idempotencyKey: hkKey() })));
  add("H6-06", "postMinibar (ห้องที่มีแขก A1)", "W", NOU, (p) => H.postMinibar(p.actor, p.ctx, rec({ roomId: V.roomCI, items: [{ key: "water", qty: 1 }], idempotencyKey: hkKey() })));
  add("H6-07", "setGuestRequest", "W", NOU, (p) => H.setGuestRequest(p.actor, p.ctx, rec({ roomId: V.roomCI, text: "แทรก" })));
  add("H6-08", "reportDefect (BLOCK)", "W", NOU, (p) => H.reportDefect(p.actor, p.ctx, rec({ roomId: ROOMS.A1[1], text: "แทรก", action: "BLOCK", blockDays: 1, idempotencyKey: hkKey() })));
  add("H6-09", "reportDefect (REPAIR)", "W", NOU, (p) => H.reportDefect(p.actor, p.ctx, rec({ roomId: ROOMS.A1[1], text: "แทรก", action: "REPAIR", idempotencyKey: hkKey() })));
  add("H6-10", "hkBoard(ctx, หน่วย A1)", "R", CTXU, (p) => H.hkBoard(p.ctx, rec({ unitId: p.unitId })));
  add("H6-11", "hkRoom(ctx, ห้อง A1)", "R", CTX, (p) => H.hkRoom(p.ctx, rec({ unitId: p.unitId, roomId: ROOMS.A1[2] })));
  add("H6-12", "hkLogs(ctx, หน่วย A1 / ไม่ระบุหน่วย)", "R", ["P1", "P2"], async (p) => { const a = await H.hkLogs(p.ctx, rec({ unitId: p.unitId })); const b = await H.hkLogs(p.ctx, rec({})); return { a, b, ok: a?.ok === false && b?.ok === false ? false : true, code: a?.code ?? b?.code, rows: [...(a?.rows ?? []), ...(b?.rows ?? [])] }; });
  add("H6-13", "syncBlockedRooms(ctx, หน่วย A1)", "W", CTXU, (p) => H.syncBlockedRooms(p.ctx, rec({ unitId: p.unitId, businessDate: T0 })));
  add("H6-14", "markStayoversDirty(ctx, หน่วย A1)", "W", CTXU, (p) => H.markStayoversDirty(p.ctx, rec({ unitId: p.unitId, businessDate: W(-1) })));
  add("H6-15", "minibarItemsOf(ร้าน B, หน่วย A1) ภายใน", "R", CTXU, (p) => H.minibarItemsOf(p.ctx.tenantId, rec(p.unitId)));
  // ═══ H.7 ปิดวัน / รายงาน ═══
  add("H7-01", "auditPreview", "R", U3, (p) => H.auditPreview(p.actor, p.ctx, rec({ unitId: p.unitId, businessDate: T0 })));
  add("H7-02", "closeNightAudit (หน่วย A1 วันถัดไป)", "W", ["P1", "P3"], (p) => H.closeNightAudit(p.actor, p.ctx, rec({ unitId: p.unitId, businessDate: T0 })));
  add("H7-03", "closeNightAudit แบบ cron (actor null · ctx ร้าน B · หน่วย A1)", "W", ["P1"], (p) => H.closeNightAudit(null, p.ctx, rec({ unitId: p.unitId, businessDate: T0 })));
  add("H7-04", "reopenNightAudit (auditId ของ A1)", "W", ALL4, (p) => H.reopenNightAudit(p.actor, p.ctx, rec({ unitId: p.unitId, auditId: V.audit, reason: "แทรกข้ามร้าน" })));
  add("H7-05", "reopenNightAudit (ไม่ส่ง unitId)", "W", NOU, (p) => H.reopenNightAudit(p.actor, p.ctx, rec({ auditId: V.audit, reason: "แทรกข้ามร้าน" })));
  add("H7-06", "auditHistory(ctx, หน่วย A1)", "R", CTXU, (p) => H.auditHistory(p.ctx, rec({ unitId: p.unitId })));
  add("H7-07", "pendingAuditDays(ctx, หน่วย A1)", "R", CTXU, (p) => H.pendingAuditDays(p.ctx, rec({ unitId: p.unitId })));
  for (const [i, fn] of (["occupancyReport", "revenueReport", "bookingFunnel", "forecast30", "housekeepingReport", "depositsReport"] as const).entries()) add(`H7-${String(8 + i).padStart(2, "0")}`, `${fn}`, "R", RPT, (p) => H[fn](rctx(p), rec({ unitId: p.unitId, from: W(-3), to: W(3) })));
  add("H7-14", "getUnitKpi(unitId) ภายใน", "R", [], async () => null);
  // ═══ H.8 หน้าเว็บ / สลิป ═══
  const pub = (p: P, unitSlug: string, extra: Record<string, unknown> = {}) => rec({ tenantSlug: p.slug, unitSlug, ...extra });
  const wopts = () => ({ clientKey: `${SLUG}ip-${uid()}`, deps });
  // P1 = slug ร้าน B + slug หน่วยเดียวกับ A1 (B1 ชน slug) · P4 = slug ร้าน A + หน่วย A2
  const WEBP: Pat[] = ["P1", "P4"];
  const unitSlugOf = (p: P) => (p.pat === "P4" ? `${SLUG}a2-${RUN}` : SHARED_SLUG);
  add("H8-01", "publicStatus (token A1)", "R", WEBP, (p) => WEB.publicStatus(pub(p, unitSlugOf(p), { publicToken: V.token }), wopts()));
  add("H8-02", "publicPayDeposit (token A1)", "R", WEBP, (p) => WEB.publicPayDeposit(pub(p, unitSlugOf(p), { publicToken: V.token }), wopts()));
  add("H8-03", "publicAttachSlip (token A1)", "W", WEBP, (p) => WEB.publicAttachSlip(pub(p, unitSlugOf(p), { publicToken: V.token, file: { data: png(), contentType: "image/png" }, idempotencyKey: `${SLUG}s-${uid()}` }), wopts()));
  add("H8-04", "publicCancel (token A1)", "W", WEBP, (p) => WEB.publicCancel(pub(p, unitSlugOf(p), { publicToken: V.token, email: EMAIL, confirmRefundSatang: 0 }), wopts()));
  add("H8-05", "publicLookup (รหัสจอง+อีเมล A1)", "R", WEBP, (p) => WEB.publicLookup(pub(p, unitSlugOf(p), { code: V.codeWeb, email: EMAIL }), wopts()));
  add("H8-06", "publicQuote (ประเภท A1 ใต้หน่วยอื่น)", "R", WEBP, (p) => WEB.publicQuote(pub(p, unitSlugOf(p), { checkIn: W(16), checkOut: W(17), adults: 2, children: 0, rooms: [{ roomTypeId: TYPE.A1, qty: 1 }] }), wopts()));
  add("H8-07", "publicCreateHold (ประเภท/แผน A1 ใต้หน่วยอื่น)", "W", WEBP, (p) => WEB.publicCreateHold(pub(p, unitSlugOf(p), { checkIn: W(16), checkOut: W(17), adults: 2, children: 0, rooms: [{ roomTypeId: TYPE.A1, qty: 1, ratePlanId: PLAN.A1 }], guest: { name: "ผู้บุกรุก", phone: "0800000001", email: `${SLUG}x@qc.invalid` }, locale: "th", spam: { hp: "", st: WEB.holdFormStart(p.pat === "P4" ? A2 : B1, new Date(Date.now() - 10_000)) }, idempotencyKey: `${SLUG}i-${uid()}` }), wopts()));
  add("H8-08", "publicSearch (หน่วยชน slug) ไม่เห็นห้อง/ราคา A1", "R", ["P1"], (p) => WEB.publicSearch(pub(p, SHARED_SLUG, { checkIn: W(16), checkOut: W(17), adults: 2, rooms: 1 }), wopts()).then((r: Any) => (r?.ok ? { ok: true, roomTypes: (r.roomTypes ?? []).filter((t: Any) => t.id === TYPE.A1) } : r)));
  add("H8-09", "decideSlip (สลิป A1)", "W", NOU, (p) => SV.decideSlip({ userId: p.actor.userId }, p.ctx, rec(V.slip), { decision: "APPROVE", reason: "แทรกข้ามร้าน", transRef: `ISO${uid()}`.toUpperCase() }));
  add("H8-10", "onHotelSlipApproved (event ร้าน B อ้างสลิป/การจอง A1)", "W", ["P1"], async () => { await WEB.onHotelSlipApproved({ tenantId: tB, unitId: B1, payload: rec({ slipId: V.slip, domain: "HOTEL", refType: "HOTEL_DEPOSIT", refId: V.rvWeb, amountSatang: 100_000 }) }); return { ok: false, code: "NOT_FOUND" }; });
  add("H8-11", "cancelBookingAsGuest(ctx ร้าน B, การจอง A1) ภายใน", "W", CTX, (p) => H.cancelBookingAsGuest(p.ctx, rec({ unitId: p.unitId, reservationId: V.rvWeb, reason: "แทรก" })));
  add("H8-12", "webBookingFacts/webBookingByCode(ร้าน B, หน่วย B1, token/รหัส A1) ภายใน", "R", ["P2"], async () => { const a = await H.webBookingFacts(tB, B1, rec(V.token)); const b = await H.webBookingByCode(tB, B1, rec(V.codeWeb)); return a || b ? { ok: true, a, b } : null; });
  // ═══ H.10 ช่องทาง ═══
  add("H10-01", "listChannelConnections", "R", U3, (p) => H.listChannelConnections(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H10-02", "channelDetail (ตัวต่อ A1)", "R", ALL4, (p) => H.channelDetail(p.actor, p.ctx, rec({ unitId: p.unitId, connectionId: V.conn })));
  add("H10-03", "saveRoomMap (ตัวต่อ/ประเภท A1)", "W", ALL4, (p) => H.saveRoomMap(p.actor, p.ctx, rec({ unitId: p.unitId, connectionId: V.conn, roomTypeId: TYPE.A1, externalRoomId: "HACK" })));
  add("H10-04", "saveRoomMap (ตัวต่อตัวเอง B1 + ประเภท A1)", "W", ["P2"], (p) => H.saveRoomMap(p.actor, p.ctx, rec({ unitId: p.unitId, connectionId: V.connB, roomTypeId: TYPE.A1, externalRoomId: "HACK" })));
  add("H10-05", "saveRateMap (ตัวต่อ/แผน A1)", "W", ALL4, (p) => H.saveRateMap(p.actor, p.ctx, rec({ unitId: p.unitId, connectionId: V.conn, ratePlanId: PLAN.A1, externalRateId: "HACK", markupBp: 0 })));
  add("H10-06", "saveBuffer (ตัวต่อ/ประเภท A1)", "W", ALL4, (p) => H.saveBuffer(p.actor, p.ctx, rec({ unitId: p.unitId, connectionId: V.conn, roomTypeId: TYPE.A1, rooms: 2 })));
  add("H10-07", "listNeedsRoom", "R", U3, (p) => H.listNeedsRoom(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H10-08", "listInbox", "R", U3, (p) => H.listInbox(p.actor, p.ctx, rec({ unitId: p.unitId })));
  add("H10-09", "retryInbound (inbox A1)", "W", ALL4, (p) => H.retryInbound(p.actor, p.ctx, rec({ unitId: p.unitId, inboxId: V.inbox })));
  add("H10-10", "rejectInbound (inbox A1)", "W", ALL4, (p) => H.rejectInbound(p.actor, p.ctx, rec({ unitId: p.unitId, inboxId: V.inbox, reason: "แทรก" })));
  add("H10-11", "channelMappingFor(ตัวต่อ A1, หน่วย B1/A2) ภายใน", "R", ["P2", "P4"], (p) => H.channelMappingFor(rec(V.conn), p.unitId));
  add("H10-12", "buildAri(ตัวต่อ B1, หน่วย A1) ไม่อ่านห้อง A1", "R", ["P1"], () => H.buildAri(V.connB, W(10), W(11), rec(A1)));
  add("H10-13", "emitAriDirty(ctx ร้าน B, หน่วย A1) → drain ⇒ ไม่มีงาน ARI ของตัวต่อ A1", "W", ["P1"], async (p) => { await H.emitAriDirty(p.ctx, rec({ unitId: A1, from: W(10), to: W(11) })); await drain(); return { ok: false, code: "NOT_FOUND" }; });
  add("H10-14", "ingestInbound(ตัวต่อ B1) payload ปลอม tenantId/unitId/roomTypeId ของ A1", "W", ["P2"], async () => { const r = await H.ingestInbound(V.connB, rec([{ externalId: `ISO-SPOOF-${RUN}`, version: 1, status: "NEW", externalRoomId: "DLX", externalRateId: "STD", checkIn: W(60), checkOut: W(61), rooms: 1, adults: 2, children: 0, guest: { name: "spoof", phone: "0800000002" }, grossSatang: 1, commissionSatang: 0, netSatang: 1, prepaid: false, tenantId: tA, unitId: A1, roomTypeId: TYPE.A1 }])); const ib = await prisma.channelReservationInbox.findFirst({ where: { connectionId: V.connB, externalId: `ISO-SPOOF-${RUN}` } }); const ap = ib ? await H.applyInbound(ib.id) : null; return { ok: false, code: "NOT_FOUND", ingest: r?.ok, apply: ap?.status }; }, async () => { const a = await prisma.hotelReservation.count({ where: { tenantId: tA, channelRef: `ISO-SPOOF-${RUN}` } }); const b = await prisma.hotelReservation.findFirst({ where: { tenantId: tB, channelRef: `ISO-SPOOF-${RUN}` } }); await prisma.$executeRawUnsafe(`DELETE FROM "RoomOccupancy" WHERE "tenantId" = $1 AND "refId" = $2`, tB, b?.id ?? "-"); return a ? `การจองรั่วเข้าร้าน A ${a}` : b && b.unitId !== B1 ? `การจองร้าน B อยู่หน่วย ${b.unitId}` : null; });

  const SKIPWHY: Record<string, string> = {
    "H7-14": "getUnitKpi รับ id หน่วยอย่างเดียวโดยออกแบบ (ผู้เรียก = หน้า reports ที่ resolve หน่วยจากร้านของ session) — ไม่มีพารามิเตอร์ร้านให้ข้าม",
    "H5-12b": "ตามออกแบบ h.5 §2.9 (ลงห้องข้ามหน่วยในร้านเดียวได้) — คิวบิลไม่ผูกคิดต่อ POS system ⇒ หน่วย A2 ที่ใช้ POS ร่วมกับ A1 เห็นบิลของ A1 (เลขบิล/ยอด/เลขอ้างอิง) · ข้ามร้านถูกกันแล้ว (H5-12) — ผู้คุมตัดสินว่ายอมรับหรือต้องกรองตามหน่วยผู้ขาย",
  };
  // ═══ ตัวควบคุมบวก: ผู้กระทำแต่ละรูปแบบทำงานได้บนหน่วยของตัวเอง (ปฏิเสธใน matrix = เพราะข้ามจริง ไม่ใช่ไร้สิทธิ์) ═══
  {
    const pc: string[] = [];
    const chk = async (n: string, f: () => Promise<Any>) => { const r = await call(f); if (!(r?.ok === true || (Array.isArray(r) && r.length >= 0 && r?.ok === undefined && r !== null && typeof r === "object") || (r && r.ok === undefined && !Array.isArray(r) && typeof r === "object" && !("code" in r)))) pc.push(`${n}=${r?.code ?? J(r).slice(0, 60)}`); };
    await chk("MGR_A2 listRatePlans A2", () => H.listRatePlans(MGR_A2, ctxA, { unitId: A2 }));
    await chk("MGR_A2 listBookings A2", () => H.listBookings(MGR_A2, ctxA, { unitId: A2 }));
    await chk("MGR_A2 listGuests A2", () => H.listGuests(MGR_A2, ctxA, { unitId: A2 }));
    await chk("MGR_A2 auditPreview A2", () => H.auditPreview(MGR_A2, ctxA, { unitId: A2, businessDate: T0 }));
    await chk("MGR_A2 revenueReport A2", () => H.revenueReport({ tenantId: tA, actorUserId: MGR_A2.userId }, { unitId: A2 }));
    await chk("MGR_A2 listBlocks A2", () => H.listBlocks(MGR_A2, ctxA, { unitId: A2, from: W(0), to: W(5) }));
    await chk("MGR_A2 listUnmatched A2", () => H.listUnmatchedRoomCharges(MGR_A2, ctxA, { unitId: A2 }));
    await chk("MGR_A2 hkSetStatus ห้อง A2", () => H.hkSetStatus(MGR_A2, ctxA, { roomId: ROOMS.A2[0], to: "DIRTY", idempotencyKey: `${SLUG}pc-${uid()}` }));
    await chk("MGR_A2 listChannelConnections A2", () => H.listChannelConnections(MGR_A2, ctxA, { unitId: A2 }));
    await chk("OWNER_B listBookings B1", () => H.listBookings(OWNER_B, ctxB, { unitId: B1 }));
    await chk("OWNER_B channelDetail B1", () => H.channelDetail(OWNER_B, ctxB, { unitId: B1, connectionId: V.connB }));
    await chk("OWNER_B tapeChart B1", () => H.tapeChart(ctxB, { unitId: B1, from: T0, days: 7 }));
    await chk("OWNER_A getBooking A1 (เจ้าของจริง)", () => H.getBooking(OWNER_A, ctxA, { unitId: A1, id: V.rvCI }));
    await chk("OWNER_A getFolio A1", () => H.getFolio(OWNER_A, ctxA, { reservationId: V.rvCI }));
    await chk("เว็บ publicStatus token A1 ผ่านร้าน A", () => WEB.publicStatus({ tenantSlug: TA.slug, unitSlug: SHARED_SLUG, publicToken: V.token }, { clientKey: `${SLUG}ip-${uid()}` }));
    line("PC-1", pc.length ? "FAIL" : "PASS", "ตัวควบคุมบวก: MGR_A2 ทำงานบน A2 ได้ (อ่าน/ปิดวัน/รายงาน/แม่บ้าน/ช่องทาง) · OWNER_B บน B1 ได้ · OWNER_A อ่านวัตถุ A1 ได้ · token A1 ผ่าน slug ร้าน A ได้", pc.join(" · "));
  }

  // ═══ รัน matrix ═══
  console.log(`\n── ${cases.length} facade × รูปแบบ P1–P4 ──`);
  const SPOOF_OK = new Set(["H10-14"]); // ข้อนี้ตั้งใจเขียนในร้าน B เอง (ตัวต่อ B1) — ตรวจด้วย after() แทนแฮช
  for (const c of cases) {
    if (!c.pats.length) { line(c.id, "SKIP", c.name, SKIPWHY[c.id] ?? "-"); continue; }
    const before = await snapshot();
    const caseStart = new Date(Date.now() - 2000);
    const bad: string[] = [];
    const got: string[] = [];
    for (const pat of c.pats) {
      const p = PATS[pat];
      LAST_IN = "";
      const r = await call(() => c.fn(p));
      const code = r === null || r === undefined ? "null" : Array.isArray(r) ? `[${r.length}]` : r?.ok === true ? "ok" : r?.code !== undefined ? String(r.code) : `obj${J(r).slice(0, 60)}`;
      got.push(`${pat}:${code}`);
      const lk = leaks(r);
      if (lk.length) bad.push(`${pat} รั่ว ${lk.slice(0, 4).join(",")}`);
      // มติผู้คุม 8 พ.ย. (h9-iso-h416): tm30Export ตอบ INVALID_INPUT ข้อความเดียวกับกรณีเลือกแขกไทย/แจ้งแล้ว ⇒ ไม่บอกว่ามีแขกอยู่ (ไม่มีไฟล์ · ไม่มีแถวเปลี่ยน) ⇒ นับเป็นการปฏิเสธ · หนี้ minor H.9: ให้คืน NOT_FOUND
      const denied = r === null || r === undefined || (r?.ok === false && (DENY.has(String(r.code)) || (c.id === "H4-16" && String(r.code) === "INVALID_INPUT")));
      if (!denied) {
        if (c.kind === "W") bad.push(`${pat} ไม่ถูกปฏิเสธ (${code}${r?.reason ? ` ${String(r.reason).slice(0, 80)}` : ""})`);
        else if (r?.ok === false) bad.push(`${pat} รหัส ${code}${r?.reason ? ` (${String(r.reason).slice(0, 80)})` : ""} ไม่ใช่ NOT_FOUND/FORBIDDEN`);
        else if (!isEmptyish(r) && lk.length === 0 && !(r && typeof r === "object" && r.ok === true && Object.keys(r).length <= 2)) bad.push(`${pat} อ่านได้ผลไม่ว่าง (${J(r).slice(0, 100)})`);
      }
    }
    const after = await snapshot();
    const changed = SPOOF_OK.has(c.id) ? [] : diff(before, after);
    // OutboxEvent ใหม่ = เหตุความปลอดภัย/สัญญาณของฟังก์ชันเอง (เช่น lookup_failed) ยอมได้ถ้า payload ไม่มีข้อมูล A1 ที่ผู้เรียกไม่ได้ส่งมา
    const evOnly = changed.length > 0 && changed.every((x) => x.startsWith("OutboxEvent("));
    if (evOnly) {
      const evs = (await prisma.outboxEvent.findMany({ where: { tenantId: { in: tenantIds }, createdAt: { gte: caseStart } }, select: { tenantId: true, type: true, payload: true } })) as Any[];
      const lk = evs.flatMap((e) => leaks(e.payload).map((m) => `${e.type}:${m}`));
      if (lk.length) bad.push(`event ใหม่มีข้อมูล A1 ${lk.slice(0, 3).join(",")}`);
      else got.push(`ℹ️event ${[...new Set(evs.map((e) => `${e.tenantId === tA ? "A" : "B"}:${e.type}`))].join(",")}`);
    } else if (changed.length) bad.push(`แถวเปลี่ยน ${changed.slice(0, 6).join(" ")}`);
    if (c.after) { const a = await c.after(); if (a) bad.push(a); }
    line(c.id, bad.length ? "FAIL" : "PASS", `${c.name} [${got.join(" ")}]`, bad.join(" | "));
  }

  // ═══ ภาพรวมหลัง matrix ═══
  const z1 = { rv: await prisma.hotelReservation.count({ where: { unitId: A1 } }), guest: await prisma.hotelGuestRecord.count({ where: { unitId: A1 } }) };
  const rvCI = await prisma.hotelReservation.findUnique({ where: { id: V.rvCI } });
  const rvWeb = await prisma.hotelReservation.findUnique({ where: { id: V.rvWeb } });
  const leakB = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HotelReservation" WHERE "tenantId" = $1 AND ("roomTypeId" = $2 OR "ratePlanId" = $3 OR "roomId" = ANY($4::text[]))`, tB, TYPE.A1, PLAN.A1, ROOMS.A1)) as Any[];
  const ok1 = J(z1) === J(victimRows) && rvCI?.status === "CHECKED_IN" && rvWeb?.status === "HOLD" && leakB[0]?.n === 0;
  line("Z-1", ok1 ? "PASS" : "FAIL", "เหยื่อ A1 คงสภาพ (จำนวนการจอง/ผู้พักเท่าเดิม · พักอยู่ยัง CHECKED_IN · เว็บยัง HOLD) · ร้าน B ไม่มีการจองที่อ้างประเภท/แผน/ห้องของ A1", ok1 ? "" : `${J(z1)} vs ${J(victimRows)} · CI ${rvCI?.status} · web ${rvWeb?.status} · B อ้าง A1 ${leakB[0]?.n}`);
} catch (e) {
  console.log(`🔴 สคริปต์ล้มนอกข้อ: ${errMsg(e)}`);
  cks.push({ id: "Z-0", res: "FAIL", why: errMsg(e) });
  exitCode = 3;
} finally {
  await cleanup();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  const leftU = await prisma.user.count({ where: { email: { startsWith: SLUG } } });
  line("Z-2", left || leftU ? "FAIL" : "PASS", `ล้างร้าน/ผู้ใช้ ${SLUG}*`, left || leftU ? `เหลือ ${left}/${leftU}` : "");
}
const total = cks.length, passed = cks.filter((c) => c.res === "PASS").length, failed = cks.filter((c) => c.res === "FAIL").length, skipped = cks.filter((c) => c.res === "SKIP").length;
console.log(`\nJSON_SUMMARY ${J({ suite: SUITE, total, passed, failed, skipped, failedIds: cks.filter((c) => c.res === "FAIL").map((c) => c.id), sec: Math.round((Date.now() - T_START) / 1000) })}`);
void createHash;
await prisma.$disconnect?.();
process.exit(exitCode || (failed ? 1 : 0));
