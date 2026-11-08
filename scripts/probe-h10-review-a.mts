// probe ผู้ตรวจ H.10 รอบ A — กันจองซ้อน · idempotency · race (ช่องทาง OTA ขาเข้า + ARI hook)
//   แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {total,passed,failed,skipped}" (ผู้คุมยกเข้าทรีเป็น regression ได้)
//   ร้าน/ผู้ใช้ชั่วคราว prefix h10rv- ลบใน finally · ไม่แตะฉาก svcqc · ตัวต่อ FAKE (INTEGRATIONS_FAKE=1)
// รัน (cwd ทรี):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h10-review-a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
type Any = any;

// ── env: ด่านฐาน QC ของ SVC (allowlist svc-qc-hosts) — ผู้คุมยกเข้าทรีเป็น regression ถาวร 7 พ.ย. ──
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
loadSvcQcEnv("probe-h10-review-a");
process.env.INTEGRATIONS_FAKE = "1";
if ((process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").length < 32) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

// ── harness ──
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: string; why: string }[] = [];
class AF extends Error {}
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const ok = (c: unknown, why: string) => { if (!c) throw new AF(why); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const st = async (id: string, sev: string, name: string, fn: () => Promise<unknown>) => {
  try { await fn(); cks.push({ id, res: "PASS", sev, why: "" }); console.log(`  ✅ [${id}] ${name}`); }
  catch (e) { const why = e instanceof AF ? e.message : `throw: ${errMsg(e)}`; cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] (${sev}) ${name} — ${why}`); }
};
const skip = (id: string, sev: string, name: string, why: string) => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${r?.code ?? J(r)} ${r?.reason ?? ""}`); return r; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SLUG = "h10rv-";

const { prisma } = (await import("@/lib/core/db")) as Any;
const INT = (await import("@/lib/core/integrations")) as Any;
const HOTEL = (await import("@/lib/modules/hotel")) as Any;
const CH = (await import("@/lib/modules/hotel/channel")) as Any;
const SVC = (await import("@/lib/modules/hotel/service")) as Any;

const tenantIds: string[] = [];
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  for (const t of ["RoomOccupancy", "HotelBookingNight", "ChannelRoomMap", "ChannelRateMap", "ChannelInventoryBuffer", "ChannelAriJob", "ChannelReservationInbox", "IntegrationCallLog", "TenantIntegration"]) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { /* FK */ }
  }
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
}
async function cleanupUsers() { try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); } }

let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: Any) => t.id));
  await cleanupUsers();

  // ═══ ตั้งร้าน ═══
  const tA = (await prisma.tenant.create({ data: { name: "QC H10 review A", slug: `${SLUG}a-${RUN}` } })).id as string;
  tenantIds.push(tA);
  const ctxA = { tenantId: tA };
  const mkUnit = async (name: string) => (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name, slug: `h10rv-${RUN}-${randomBytes(2).toString("hex")}` } })).id as string;
  const UH = await mkUnit("โรงแรมรีวิว H10");
  const UH2 = await mkUnit("สาขาสอง รีวิว H10");
  const mkType = async (unitId: string, name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const mkRoom = async (unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const RT = { one: await mkType(UH, "ห้องเดี่ยว", 100_000), dlx: await mkType(UH, "ดีลักซ์", 129_000), d2: await mkType(UH2, "ดีลักซ์ สาขาสอง", 129_000) };
  const ROOM = { one: await mkRoom(UH, "ONE1", RT.one), dlx1: await mkRoom(UH, "DLX1", RT.dlx), dlx2: await mkRoom(UH, "DLX2", RT.dlx), d2: await mkRoom(UH2, "S2-1", RT.d2) };
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `h10rv-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `QC h10rv ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h10-r8) หลังรวม H.4 เช็กอินต้องลงทะเบียนผู้พักก่อน (GUEST_REQUIRED) ⇒ ปิด requireRegistration ของหน่วยทดสอบ (probe นี้ตรวจ race ช่องทาง ไม่ใช่ทะเบียน)
  { const ST = (await import("@/lib/core/settings/service")) as Any; const r = await ST.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.guest.requireRegistration", scope: "UNIT", scopeId: UH, value: false }]); if (r?.ok === false) throw new Error(`ตั้ง requireRegistration: ${r.code ?? ""} ${r.reason ?? ""}`); }
  const MANAGER = await mkMember("manager", "MANAGER", [UH]);
  const FRONT = await mkMember("front", "STAFF", [UH], { "hotel.booking.manage": true, "hotel.reservation.create": true, "hotel.reservation.cancel": true });
  const MAID = await mkMember("maid", "STAFF", [UH], { "hotel.housekeeping": true });
  const GRANT = await mkMember("grant", "STAFF", [UH], { "hotel.channel.manage": true });
  const plans: Record<string, string> = {};
  for (const [u, types] of [[UH, [RT.one, RT.dlx]], [UH2, [RT.d2]]] as const) {
    okRes(await HOTEL.listRatePlans(OWNER, ctxA, { unitId: u }), "listRatePlans");
    plans[u] = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: u, code: "STANDARD" } })).id;
    okRes(await HOTEL.saveRatePlan(OWNER, ctxA, { unitId: u, id: plans[u], code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
    okRes(await HOTEL.saveRates(OWNER, ctxA, { unitId: u, ratePlanId: plans[u], rows: types.map((roomTypeId) => ({ roomTypeId, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 120_000, priceHolidaySatang: null })) }), "saveRates");
  }
  // ตัวต่อ FAKE ครอบ 2 หน่วย (ทดสอบ X1 ข้ามหน่วยของตัวต่อเดียว) — ศูนย์เชื่อมต่อไม่ยอม ⇒ ใช้หน่วยเดียว + SKIP R-9
  let MULTI = true;
  let CONN = "";
  {
    const save = async (unitIds: string[]) => INT.saveIntegration(ctxA, OWNER, { create: true, kind: "CHANNEL_MANAGER", provider: "FAKE", label: `OTA rv ${unitIds.length}`, unitIds, fields: { apiKey: `h10rv-key-${RUN}`, accountId: `h10rv-acc-${RUN}`, mode: "OK" } });
    let r = await save([UH, UH2]);
    if (!r?.ok) { MULTI = false; console.log(`  (ตัวต่อหลายหน่วยไม่ได้: ${r?.code} ${r?.reason ?? ""})`); r = await save([UH]); }
    okRes(r, "saveIntegration");
    CONN = r.integration.id;
    okRes(await INT.testIntegration(ctxA, OWNER, { id: CONN }), "testIntegration");
  }
  okRes(await CH.saveRoomMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.one, externalRoomId: "ONE" }), "map ONE");
  okRes(await CH.saveRoomMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, externalRoomId: "DLX" }), "map DLX");
  okRes(await CH.saveRateMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, ratePlanId: plans[UH], externalRateId: "STD", markupBp: 1_500 }), "map STD");
  if (MULTI) { const r = await CH.saveRoomMap(OWNER, ctxA, { unitId: UH2, connectionId: CONN, roomTypeId: RT.d2, externalRoomId: "D2" }); if (!r?.ok) { MULTI = false; console.log(`  (แม็ปหน่วยสองไม่ได้ ${r?.code})`); } }
  console.log(`(ร้าน ${tA} · ตัวต่อ ${CONN} · หลายหน่วย ${MULTI} · วันนี้ ${T0})`);

  // ── ตัวช่วย ──
  const ACTIVE = ["HOLD", "CONFIRMED", "CHECKED_IN"];
  const inb = (ext: string, ver: number, status: string, room: string, ci: string, nights = 1, rate: string | null = "STD") => {
    const row: Any = { externalId: ext, version: ver, status, externalRoomId: room, checkIn: ci, checkOut: addDays(ci, nights), rooms: 1, adults: 2, children: 0, guest: { name: `แขก ${ext}`, phone: "0890000000", email: `${SLUG}g@qc.invalid` }, grossSatang: 230_000 * nights, commissionSatang: 34_500 * nights, netSatang: 195_500 * nights, prepaid: true };
    if (rate) row.externalRateId = rate;
    return row;
  };
  const ingest = async (rows: Any[]) => okRes(await CH.ingestInbound(CONN, rows), "ingestInbound");
  const inbox = (ext: string, ver: number) => prisma.channelReservationInbox.findFirst({ where: { connectionId: CONN, externalId: ext, version: ver } });
  const apply = async (ext: string, ver: number) => { const row = await inbox(ext, ver); ok(row, `ไม่มี inbox ${ext} v${ver}`); return call(() => CH.applyInbound(row.id)); };
  const activeOf = (ext: string) => prisma.hotelReservation.findMany({ where: { tenantId: tA, channelConnectionId: CONN, channelRef: ext, status: { in: ACTIVE } } }) as Promise<Any[]>;
  const counterBook = (typeId: string, ci: string, nights = 1) => call(() => HOTEL.createBooking(OWNER, ctxA, { unitId: UH, rooms: [{ roomTypeId: typeId, adults: 2, children: 0 }], ratePlanId: plans[UH], source: "PHONE", guest: { name: "เคาน์เตอร์ rv", phone: "0890000011" }, checkIn: ci, checkOut: addDays(ci, nights) }));
  const nightsOn = async (typeId: string, date: string) => prisma.hotelBookingNight.count({ where: { tenantId: tA, unitId: UH, roomTypeId: typeId, date: new Date(`${date}T00:00:00Z`), counted: true } });
  const activeOcc = (refId: string) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId, active: true } }) as Promise<Any[]>;
  const status = (r: Any) => (r?.ok ? r.status : `${r?.code}`);
  console.log("\n── R ผู้ตรวจรอบ A ──");

  // R-1 inbound × เคาน์เตอร์ พร้อมกัน ห้องสุดท้าย
  await st("R-1", "CRITICAL", "กันจองซ้อน: ห้องเดี่ยว (1 ห้อง) · inbound กับการจองเคาน์เตอร์ยิงพร้อมกัน 6 รอบ ⇒ ทุกคืนมีการจองนับ ≤ 1 · สำเร็จรวม = 1 · inbox ตรงผู้ชนะ (เคาน์เตอร์ชนะ ⇒ NEEDS_ROOM)", async () => {
    const bad: string[] = [];
    for (let k = 0; k < 6; k++) {
      const d = W(40 + k);
      const ext = `R1-${k}`;
      await ingest([inb(ext, 1, "NEW", "ONE", d)]);
      const row = await inbox(ext, 1);
      const [c, a] = await Promise.all([counterBook(RT.one, d), k % 2 ? call(() => CH.applyInbound(row.id)) : sleep(15).then(() => call(() => CH.applyInbound(row.id)))]);
      const n = await nightsOn(RT.one, d);
      const ib = await inbox(ext, 1);
      const wins = (c?.ok ? 1 : 0) + (ib.status === "APPLIED" ? 1 : 0);
      if (n !== 1 || wins !== 1 || (c?.ok && ib.status !== "NEEDS_ROOM")) bad.push(`${d}: nights=${n} counter=${c?.ok ? "ok" : c?.code} inbox=${ib.status} apply=${status(a)}`);
    }
    ok(!bad.length, bad.join(" | "));
  });

  // R-2 apply แถวเดียว 5 ทาง (ห้องสุดท้าย) — ผลที่คืนต้องตรงสถานะจริง
  await st("R-2", "MINOR", "idempotency: inbox แถวเดียว applyInbound 5 ทางพร้อมกัน (ห้องเดี่ยวเหลือ 1) ⇒ การจอง 1 · inbox APPLIED · ผลที่คืนทุกทาง = APPLIED (ไม่รายงาน NEEDS_ROOM ทั้งที่แถว APPLIED)", async () => {
    const d = W(50);
    await ingest([inb("R2", 1, "NEW", "ONE", d)]);
    const row = await inbox("R2", 1);
    const rs = await Promise.all(Array.from({ length: 5 }, () => call(() => CH.applyInbound(row.id))));
    const rv = await activeOf("R2");
    const ib = await inbox("R2", 1);
    ok(rv.length === 1 && ib.status === "APPLIED" && (await nightsOn(RT.one, d)) === 1, `การจอง ${rv.length} · inbox ${ib.status}`);
    ok(rs.every((r) => r?.ok && r.status === "APPLIED"), `ผลที่คืน ${J(rs.map(status))} (แถวจริง APPLIED)`);
  });

  // R-3 ingest ซ้ำพร้อมกัน 5 ทาง
  await st("R-3", "CRITICAL", "idempotency: ingest แถวเดิม (externalId+version เดิม) 5 ทางพร้อมกัน ⇒ inbox 1 แถว · event received 1", async () => {
    const rows = [inb("R3", 1, "NEW", "DLX", W(52))];
    const rs = await Promise.all(Array.from({ length: 5 }, () => call(() => CH.ingestInbound(CONN, rows))));
    ok(rs.every((r) => r?.ok), `ingest ${J(rs.map((r) => r?.code ?? "ok"))}`);
    const n = await prisma.channelReservationInbox.count({ where: { connectionId: CONN, externalId: "R3" } });
    const row = await inbox("R3", 1);
    const ev = await prisma.outboxEvent.count({ where: { tenantId: tA, type: "channel.reservation.received", payload: { path: ["inboxId"], equals: row?.id } } });
    ok(n === 1 && ev === 1, `inbox ${n} · event ${ev}`);
  });

  // R-4 ลำดับสลับ: v3 MODIFIED ก่อน v2
  await st("R-4", "CRITICAL", "version สลับลำดับ: v1 NEW → v3 MODIFIED (+2 วัน) → v2 MODIFIED (+1 วัน) มาทีหลัง ⇒ v2 REJECTED STALE · การจอง active 1 = วันของ v3 (ไม่ย้อนเป็นข้อมูลเก่า)", async () => {
    await ingest([inb("R4", 1, "NEW", "DLX", W(54))]);
    okRes(await apply("R4", 1), "v1");
    await ingest([inb("R4", 3, "MODIFIED", "DLX", W(56))]);
    okRes(await apply("R4", 3), "v3");
    await ingest([inb("R4", 2, "MODIFIED", "DLX", W(55))]);
    const r2 = await apply("R4", 2);
    const ib2 = await inbox("R4", 2);
    const act = await activeOf("R4");
    ok(ib2.status === "REJECTED" && ib2.error === "STALE", `v2 ${ib2.status} ${ib2.error} (${status(r2)})`);
    ok(act.length === 1 && act[0].checkInDate.toISOString().slice(0, 10) === W(56), `active ${act.length} ${J(act.map((x) => x.checkInDate))}`);
  });

  // R-5 CANCELLED ก่อนฉบับเก่า / ยกเลิกของที่ไม่มี
  await st("R-5", "CRITICAL", "CANCELLED ของการจองที่ไม่เคยมี ⇒ ไม่ throw · APPLIED เปล่า · ไม่มีการจอง · แล้ว v1 NEW/v2 MODIFIED ที่มาทีหลัง ⇒ REJECTED STALE (ไม่ฟื้นการจองที่ยกเลิกแล้ว)", async () => {
    await ingest([inb("R5", 3, "CANCELLED", "DLX", W(58))]);
    const r3 = await apply("R5", 3);
    ok(r3?.ok && r3.status === "APPLIED", `v3 ${status(r3)} ${r3?.reason ?? ""}`);
    await ingest([inb("R5", 1, "NEW", "DLX", W(58)), inb("R5", 2, "MODIFIED", "DLX", W(59))]);
    await apply("R5", 1);
    await apply("R5", 2);
    const [i1, i2] = [await inbox("R5", 1), await inbox("R5", 2)];
    ok(i1.status === "REJECTED" && i2.status === "REJECTED", `v1 ${i1.status} v2 ${i2.status}`);
    eq0((await activeOf("R5")).length, "active R5");
  });
  function eq0(n: number, what: string) { ok(n === 0, `${what} = ${n} (ต้อง 0)`); }

  // R-6 race MODIFIED v2 ‖ CANCELLED v3 (ผู้ประมวลผล 2 ทาง: pullAll ซ้อน / retry ของพนักงาน)
  const DELAYS = [0, 10, 25, 40, 60, 90, 130, 180, 250, 350];
  await st("R-6", "MAJOR", "race: การจอง v1 อยู่ · MODIFIED v2 กับ CANCELLED v3 ถูก apply พร้อมกัน (หน่วง 0–350 ms) ⇒ จบที่ v3 = ไม่เหลือการจอง active ของเลขนี้ (ยกเลิกต้องไม่หายเพราะ v2 สร้างการจองใหม่หลังจาก v3 อ่านรายการ)", async () => {
    const bad: string[] = [];
    for (let k = 0; k < DELAYS.length; k++) {
      const ext = `R6-${k}`;
      const d = W(70 + 3 * k);
      await ingest([inb(ext, 1, "NEW", "DLX", d)]);
      okRes(await apply(ext, 1), `${ext} v1`);
      await ingest([inb(ext, 2, "MODIFIED", "DLX", addDays(d, 1)), inb(ext, 3, "CANCELLED", "DLX", d)]);
      const [i2, i3] = [await inbox(ext, 2), await inbox(ext, 3)];
      const [a2, a3] = await Promise.all([call(() => CH.applyInbound(i2.id)), sleep(DELAYS[k]).then(() => call(() => CH.applyInbound(i3.id)))]);
      const act = await activeOf(ext);
      if (act.length) bad.push(`หน่วง ${DELAYS[k]}ms: active ${act.length} (v2 ${status(a2)} · v3 ${status(a3)})`);
    }
    ok(!bad.length, `ยกเลิกหาย ${bad.length}/${DELAYS.length}: ${bad.join(" | ")}`);
  });

  // R-7 race NEW v1 ‖ CANCELLED v2 (ยังไม่มีการจอง)
  await st("R-7", "MAJOR", "race: NEW v1 กับ CANCELLED v2 apply พร้อมกัน (ยังไม่มีการจอง · หน่วง 0–350 ms) ⇒ ไม่เหลือการจอง active (CANCELLED เปล่าต้องไม่ APPLIED ทั้งที่ v1 สร้างการจองหลังจากอ่านรายการ)", async () => {
    const bad: string[] = [];
    for (let k = 0; k < DELAYS.length; k++) {
      const ext = `R7-${k}`;
      const d = W(110 + 2 * k);
      await ingest([inb(ext, 1, "NEW", "DLX", d), inb(ext, 2, "CANCELLED", "DLX", d)]);
      const [i1, i2] = [await inbox(ext, 1), await inbox(ext, 2)];
      // v2 ออกก่อนเล็กน้อย/หลังเล็กน้อย สลับกัน
      const [a1, a2] = await Promise.all([call(() => CH.applyInbound(i1.id)), sleep(DELAYS[k]).then(() => call(() => CH.applyInbound(i2.id)))]);
      const act = await activeOf(ext);
      if (act.length) bad.push(`หน่วง ${DELAYS[k]}ms: active ${act.length} (v1 ${status(a1)} · v2 ${status(a2)})`);
    }
    ok(!bad.length, `ยกเลิกหาย ${bad.length}/${DELAYS.length}: ${bad.join(" | ")}`);
  });

  // R-8 เช็กอินแล้ว ⇒ OTA CANCELLED / MODIFIED ไม่ยกเลิกเงียบ
  await st("R-8", "CRITICAL", "การจองเช็กอินแล้ว: OTA CANCELLED ⇒ ไม่ยกเลิก (inbox NEEDS_ROOM MANUAL_REQUIRED + event needs_room) · OTA MODIFIED ⇒ NEEDS_ROOM · การจองคง CHECKED_IN + occupancy active 1", async () => {
    const d = W(140);
    await ingest([inb("R8", 1, "NEW", "DLX", d)]);
    const a = okRes(await apply("R8", 1), "v1");
    const rid = a.reservationId;
    const ci = await SVC.checkIn(tA, UH, rid, ROOM.dlx1);
    ok(ci?.ok, `checkIn ${J(ci)}`);
    await ingest([inb("R8", 2, "MODIFIED", "DLX", addDays(d, 1)), inb("R8", 3, "CANCELLED", "DLX", d)]);
    const r2 = await apply("R8", 2);
    const r3 = await apply("R8", 3);
    const [i2, i3] = [await inbox("R8", 2), await inbox("R8", 3)];
    const rv = await prisma.hotelReservation.findUnique({ where: { id: rid } });
    const occ = await activeOcc(rid);
    ok(rv.status === "CHECKED_IN" && occ.length === 1, `การจอง ${rv.status} occ ${occ.length}`);
    ok(i2.status === "NEEDS_ROOM" && i3.status === "NEEDS_ROOM" && i3.error === "MANUAL_REQUIRED", `v2 ${i2.status}/${i2.error} (${status(r2)}) · v3 ${i3.status}/${i3.error} (${status(r3)})`);
    const ev = await prisma.outboxEvent.count({ where: { tenantId: tA, type: "channel.reservation.needs_room", payload: { path: ["inboxId"], equals: i3.id } } });
    ok(ev === 1, `event needs_room ของ v3 = ${ev}`);
    (globalThis as Any).__r8 = rid;
  });

  // R-9 เช็กอิน ‖ MODIFIED พร้อมกัน
  await st("R-9", "CRITICAL", "race H.3: checkIn ของเคาน์เตอร์กับ OTA MODIFIED (เลื่อน +1 วัน) ยิงพร้อมกัน 5 รอบ ⇒ การจอง active ของเลขนี้ = 1 · occupancy active เฉพาะการจอง active · เช็กอินสำเร็จ ⇒ MODIFIED ไม่ APPLIED · MODIFIED APPLIED ⇒ การจองเดิม CANCELLED ไม่มีห้อง", async () => {
    const bad: string[] = [];
    for (let k = 0; k < 5; k++) {
      const ext = `R9-${k}`;
      const d = W(150 + 3 * k);
      await ingest([inb(ext, 1, "NEW", "DLX", d)]);
      const a = okRes(await apply(ext, 1), `${ext} v1`);
      const rid = a.reservationId;
      await ingest([inb(ext, 2, "MODIFIED", "DLX", addDays(d, 1))]);
      const i2 = await inbox(ext, 2);
      const [c, m] = await Promise.all([call(() => SVC.checkIn(tA, UH, rid, ROOM.dlx2)), sleep(k * 20).then(() => call(() => CH.applyInbound(i2.id)))]);
      const all = await prisma.hotelReservation.findMany({ where: { tenantId: tA, channelRef: ext } });
      const act = all.filter((x: Any) => ACTIVE.includes(x.status));
      const occBad: string[] = [];
      for (const x of all) { const o = await activeOcc(x.id); if (o.length && !ACTIVE.includes(x.status)) occBad.push(`${x.status} มี occ ${o.length}`); if (o.length > 1) occBad.push(`occ ${o.length}`); }
      const ib2 = await inbox(ext, 2);
      const old = all.find((x: Any) => x.id === rid);
      const why: string[] = [];
      if (act.length !== 1) why.push(`active ${act.length}`);
      if (occBad.length) why.push(occBad.join(","));
      if (c?.ok && ib2.status === "APPLIED") why.push("เช็กอินสำเร็จแต่ MODIFIED APPLIED");
      if (ib2.status === "APPLIED" && old.status !== "CANCELLED") why.push(`MODIFIED APPLIED แต่เดิม ${old.status}`);
      if (why.length) bad.push(`รอบ ${k}: ${why.join(" · ")} (checkIn ${c?.ok ? "ok" : c?.reason ?? c?.code} · mod ${status(m)})`);
    }
    ok(!bad.length, bad.join(" | "));
  });

  // R-10 ตัวต่อหลายหน่วย: MODIFIED ย้ายหน่วย
  if (!MULTI) skip("R-10", "MAJOR", "ตัวต่อครอบ 2 หน่วย: MODIFIED ย้ายห้องไปหน่วยอื่น", "ศูนย์เชื่อมต่อไม่ยอมตัวต่อหลายหน่วย");
  else await st("R-10", "MAJOR", "X1 ตัวต่อเดียวครอบ 2 หน่วย: v1 NEW ห้อง DLX (หน่วย 1) APPLIED → v2 MODIFIED ห้อง D2 (หน่วย 2) ⇒ การจอง active ของเลขนี้ทั้งร้าน ≤ 1 (ไม่ค้างการจองเดิมในหน่วย 1) · v1 ที่มาซ้ำทีหลังต้อง STALE", async () => {
    const d = W(170);
    await ingest([inb("R10", 1, "NEW", "DLX", d, 1, null)]);
    okRes(await apply("R10", 1), "v1");
    await ingest([inb("R10", 2, "MODIFIED", "D2", d, 1, null)]);
    const r2 = await apply("R10", 2);
    const i2 = await inbox("R10", 2);
    const act = await prisma.hotelReservation.findMany({ where: { tenantId: tA, channelRef: "R10", status: { in: ACTIVE } }, select: { unitId: true, status: true } });
    ok(act.length <= 1, `active ${act.length} ${J(act.map((x: Any) => x.unitId === UH ? "หน่วย1" : "หน่วย2"))} · v2 ${i2.status}/${i2.unitId === UH2 ? "หน่วย2" : "หน่วย1"} (${status(r2)})`);
  });

  // R-11 NEEDS_ROOM ค้างเมื่อฉบับใหม่ APPLIED แล้ว
  await st("R-11", "MINOR", "คิวต้องจัดห้อง: v1 NEW NEEDS_ROOM (ห้องเต็ม) แล้ว v2 MODIFIED APPLIED (วันอื่น) ⇒ v1 ไม่ควรค้างใน listNeedsRoom (พนักงานไม่ควรย้ายแขกเพื่อฉบับที่ถูกแทนแล้ว) · retry v1 ⇒ REJECTED STALE ไม่สร้างการจอง", async () => {
    const d = W(180);
    okRes(await counterBook(RT.one, d), "เคาน์เตอร์เต็ม");
    await ingest([inb("R11", 1, "NEW", "ONE", d)]);
    const a1 = await apply("R11", 1);
    ok(a1?.status === "NEEDS_ROOM", `v1 ${status(a1)}`);
    await ingest([inb("R11", 2, "MODIFIED", "ONE", addDays(d, 1))]);
    okRes(await apply("R11", 2), "v2");
    const i1 = await inbox("R11", 1);
    const r = await retryInbound();
    async function retryInbound() { return call(() => CH.retryInbound(OWNER, ctxA, { unitId: UH, inboxId: i1.id })); }
    const i1b = await inbox("R11", 1);
    ok(i1b.status === "REJECTED" && (await activeOf("R11")).length === 1, `retry v1 ${status(r)} ${i1b.status}`);
    // ตรวจคิวก่อน retry ด้วยแถวใหม่
    await ingest([inb("R11b", 1, "NEW", "ONE", d), inb("R11b", 2, "MODIFIED", "ONE", addDays(d, 2))]);
    await apply("R11b", 1);
    okRes(await apply("R11b", 2), "R11b v2");
    const q = await CH.listNeedsRoom(OWNER, ctxA, { unitId: UH });
    const stale = (q?.items ?? []).filter((x: Any) => x.externalId === "R11b");
    ok(stale.length === 0, `listNeedsRoom ยังมี R11b v${J(stale.map((x: Any) => x.version))} ทั้งที่ v2 APPLIED แล้ว`);
  });

  // R-12 buffer หักเฉพาะ ARI ไม่หักขาเข้า
  await st("R-12", "MAJOR", "buffer (ตาราง ChannelInventoryBuffer ชนะค่าตั้ง): ดีลักซ์ buffer 2 (= ทุกห้อง) ⇒ buildAri DLX available 0 + stopSell · ขาเข้า DLX ยัง APPLIED (buffer ไม่กระทบ availability จริง · ใบ §0) · คืน buffer 0", async () => {
    const d = W(190);
    okRes(await CH.saveBuffer(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, rooms: 2 }), "buffer 2");
    try {
      const ari = await CH.buildAri(CONN, d, d, UH);
      const cell = ari?.byDate?.[d]?.DLX;
      ok(cell && cell.available === 0 && cell.stopSell === true, `ARI DLX ${J(cell)}`);
      await ingest([inb("R12", 1, "NEW", "DLX", d)]);
      const a = await apply("R12", 1);
      ok(a?.ok && a.status === "APPLIED", `inbound ${status(a)}`);
    } finally { await CH.saveBuffer(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, rooms: 0 }); }
  });

  // R-13 hook ARI ใน tx ที่ย้อน ⇒ ไม่มี outbox
  await st("R-13", "MAJOR", "emitAriDirty ใน tx ที่ย้อน ⇒ ไม่มี channel.ari.dirty หลุด · tx ที่ commit ⇒ +1 (positive control) · saveRates ที่ถูกปฏิเสธ (ราคาติดลบ) ⇒ +0", async () => {
    const cnt = () => prisma.outboxEvent.count({ where: { tenantId: tA, type: "channel.ari.dirty" } });
    const n0 = await cnt();
    try { await prisma.$transaction(async (tx: Any) => { await CH.emitAriDirty({ tenantId: tA }, { unitId: UH, roomTypeIds: [RT.dlx] }, tx); throw new Error("ย้อน"); }); } catch { /* ตั้งใจ */ }
    const n1 = await cnt();
    await prisma.$transaction(async (tx: Any) => { await CH.emitAriDirty({ tenantId: tA }, { unitId: UH, roomTypeIds: [RT.dlx] }, tx); });
    const n2 = await cnt();
    const bad = await call(() => HOTEL.saveRates(OWNER, ctxA, { unitId: UH, ratePlanId: plans[UH], rows: [{ roomTypeId: RT.dlx, seasonId: null, priceWeekdaySatang: -1, priceWeekendSatang: -1, priceHolidaySatang: null }] }));
    const n3 = await cnt();
    ok(n1 === n0 && n2 === n0 + 1 && !bad?.ok && n3 === n2, `ย้อน ${n1 - n0} · commit ${n2 - n1} · saveRates ผิด (${bad?.ok ? "ok" : bad?.code}) ${n3 - n2}`);
  });

  // R-14 สิทธิ์ hotel.channel.manage
  await st("R-14", "CRITICAL", "สิทธิ์ hotel.channel.manage: owner/manager ⇒ ok · หน้าเคาน์เตอร์/แม่บ้าน ⇒ FORBIDDEN/NOT_FOUND (listNeedsRoom · retryInbound · rejectInbound · saveBuffer) · STAFF ที่ได้สิทธิ์ตรง ⇒ ok", async () => {
    const q = (a: Any) => call(() => CH.listNeedsRoom(a, ctxA, { unitId: UH }));
    const res: Record<string, string> = {};
    for (const [n, a] of [["owner", OWNER], ["manager", MANAGER], ["front", FRONT], ["maid", MAID], ["grant", GRANT]] as const) res[n] = (await q(a))?.ok ? "ok" : (await q(a))?.code;
    const i = await inbox("R11", 1);
    for (const [n, a] of [["front", FRONT], ["maid", MAID]] as const) {
      res[`${n}.retry`] = (await call(() => CH.retryInbound(a, ctxA, { unitId: UH, inboxId: i.id })))?.code ?? "ok";
      res[`${n}.reject`] = (await call(() => CH.rejectInbound(a, ctxA, { unitId: UH, inboxId: i.id, reason: "x" })))?.code ?? "ok";
      res[`${n}.buffer`] = (await call(() => CH.saveBuffer(a, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, rooms: 1 })))?.code ?? "ok";
    }
    const denied = (v: string) => /FORBIDDEN|NOT_FOUND/.test(v);
    ok(res.owner === "ok" && res.manager === "ok" && res.grant === "ok" && Object.entries(res).filter(([k]) => /^(front|maid)/.test(k)).every(([, v]) => denied(v)), J(res));
    const buf = await prisma.channelInventoryBuffer.findFirst({ where: { connectionId: CONN, roomTypeId: RT.dlx } });
    ok(!buf || buf.rooms === 0, `buffer ถูกแก้โดยผู้ไม่มีสิทธิ์ ${buf?.rooms}`);
  });

  // R-15 สรุปทั้งร้าน: ไม่มีคืนเกินห้องจริง · ไม่มี occupancy ซ้อนห้อง
  await st("R-15", "CRITICAL", "ทั้งร้านหลังทุกข้อ: ทุก (ประเภท, คืน) จำนวน nights counted ≤ ห้องขายของประเภท · occupancy active ไม่ซ้อนห้องเดียวกันวันเดียวกัน · occupancy active ชี้การจองที่ไม่ active = 0", async () => {
    const over: Any[] = await prisma.$queryRawUnsafe(`SELECT n."roomTypeId", n."date", count(*)::int AS c, (SELECT count(*)::int FROM "HotelRoom" r WHERE r."roomTypeId" = n."roomTypeId" AND r."active") AS rooms FROM "HotelBookingNight" n WHERE n."tenantId" = $1 AND n."counted" GROUP BY 1,2 HAVING count(*) > (SELECT count(*) FROM "HotelRoom" r WHERE r."roomTypeId" = n."roomTypeId" AND r."active")`, tA);
    const orphan: Any[] = await prisma.$queryRawUnsafe(`SELECT o."id", r."status" FROM "RoomOccupancy" o JOIN "HotelReservation" r ON r."id" = o."refId" WHERE o."tenantId" = $1 AND o."active" AND o."refType" = 'HotelReservation' AND r."status" NOT IN ('HOLD','CONFIRMED','CHECKED_IN')`, tA);
    ok(!over.length && !orphan.length, `เกินห้อง ${J(over)} · occ ค้าง ${J(orphan)}`);
  });
} catch (e) {
  console.log(`🔴 probe ล้มนอกข้อ: ${errMsg(e)}`);
  exitCode = 3;
} finally {
  await cleanup(tenantIds);
  await cleanupUsers();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  console.log(`(ล้างร้านชั่วคราว · เหลือ ${left})`);
}
const failed = cks.filter((c) => c.res === "FAIL").map((c) => c.id);
const skipped = cks.filter((c) => c.res === "SKIP").map((c) => c.id);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "probe-h10-review-a", total: cks.length, passed: cks.filter((c) => c.res === "PASS").length, failed, skipped, bySev: Object.fromEntries(cks.filter((c) => c.res === "FAIL").map((c) => [c.id, c.sev])) })}`);
await prisma.$disconnect?.();
process.exit(exitCode || (failed.length ? 1 : 0));
