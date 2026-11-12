// probe ผู้ตรวจ H.10 รอบ B — ARI ไม่ขายเกิน · hook ARI ครบเหตุ · inbound หลายห้อง/แก้ไขขยาย-ย่อ · inbound ‖ เว็บ · เปลี่ยนแม็ป/ถอดตัวต่อกลางทาง · เงินจาก OTA · ข้ามร้าน
//   แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {total,passed,failed,skipped}" (ผู้คุมยกเข้าทรีเป็น regression ได้)
//   ร้านชั่วคราว prefix h10rv- ลบใน finally · ไม่แตะฉาก svcqc · ไม่เรียก sweepExpiredHolds (กวาดทุกร้านบนฐานร่วม) · ตัวต่อ FAKE (INTEGRATIONS_FAKE=1)
// รัน (cwd ทรี):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h10-review-b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
type Any = any;

import { loadSvcQcEnv } from "./svc-qc-env.mjs";
loadSvcQcEnv("probe-h10-review-b");
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
class SK extends Error {}
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const ok = (c: unknown, why: string) => { if (!c) throw new AF(why); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const st = async (id: string, sev: string, name: string, fn: () => Promise<unknown>) => {
  try { await fn(); cks.push({ id, res: "PASS", sev, why: "" }); console.log(`  ✅ [${id}] ${name}`); }
  catch (e) {
    if (e instanceof SK) { cks.push({ id, res: "SKIP", sev, why: e.message }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${e.message}`); return; }
    const why = e instanceof AF ? e.message : `throw: ${errMsg(e)}`; cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] (${sev}) ${name} — ${why}`);
  }
};
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${r?.code ?? J(r)} ${r?.reason ?? ""}`); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SLUG = "h10rv-";

const { prisma } = (await import("@/lib/core/db")) as Any;
const INT = (await import("@/lib/core/integrations")) as Any;
const HOTEL = (await import("@/lib/modules/hotel")) as Any;
const CH = (await import("@/lib/modules/hotel/channel")) as Any;
const SVC = (await import("@/lib/modules/hotel/service")) as Any;
const ROOMS = (await import("@/lib/modules/rooms")) as Any;
const OC = (await import("@/lib/outbox-consumers")) as Any;
const FOLIO = (await import("@/lib/modules/hotel/folio")) as Any;

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

  // ═══ ตั้งร้าน A (โรงแรม) + ร้าน B (ข้ามร้าน) ═══
  const tA = (await prisma.tenant.create({ data: { name: "QC H10 review B-A", slug: `${SLUG}ba-${RUN}` } })).id as string;
  tenantIds.push(tA);
  const tB = (await prisma.tenant.create({ data: { name: "QC H10 review B-B", slug: `${SLUG}bb-${RUN}` } })).id as string;
  tenantIds.push(tB);
  const ctxA = { tenantId: tA };
  const mkUnit = async (tenantId: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name, slug: `h10rv-${RUN}-${randomBytes(2).toString("hex")}` } })).id as string;
  const UH = await mkUnit(tA, "โรงแรมรีวิว B");
  const UB = await mkUnit(tB, "โรงแรมร้าน B");
  const mkType = async (tenantId: string, unitId: string, name: string, base: number) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const RT = { dlx: await mkType(tA, UH, "ดีลักซ์", 129_000), sup: await mkType(tA, UH, "ซูพีเรีย", 99_000), one: await mkType(tA, UH, "ห้องเดี่ยว", 80_000), ste: await mkType(tA, UH, "สวีท", 0) };
  const RTB = await mkType(tB, UB, "ร้าน B ดีลักซ์", 129_000);
  const ROOM: Record<string, string> = {};
  for (const n of ["D1", "D2", "D3"]) ROOM[n] = await mkRoom(tA, UH, n, RT.dlx);
  for (const n of ["S1", "S2"]) ROOM[n] = await mkRoom(tA, UH, n, RT.sup);
  ROOM.O1 = await mkRoom(tA, UH, "O1", RT.one);
  for (const n of ["E1", "E2"]) ROOM[n] = await mkRoom(tA, UH, n, RT.ste);
  ROOM.B1 = await mkRoom(tB, UB, "B1", RTB);
  const mkMember = async (tag: string, role: string, unitAccess: string[], permissions: Record<string, unknown> = {}) => {
    const id = `h10rv-b-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}b-${tag}-${RUN}@shark.local`, name: `QC h10rv-b ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  okRes(await HOTEL.listRatePlans(OWNER, ctxA, { unitId: UH }), "listRatePlans");
  const STD = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } })).id as string;
  okRes(await HOTEL.saveRatePlan(OWNER, ctxA, { unitId: UH, id: STD, code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
  okRes(await HOTEL.saveRates(OWNER, ctxA, { unitId: UH, ratePlanId: STD, rows: [RT.dlx, RT.sup, RT.one].map((roomTypeId) => ({ roomTypeId, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 100_000, priceHolidaySatang: null })) }), "saveRates");
  const sv = await INT.saveIntegration(ctxA, OWNER, { create: true, kind: "CHANNEL_MANAGER", provider: "FAKE", label: "OTA rv-b", unitIds: [UH], fields: { apiKey: `h10rv-b-key-${RUN}`, accountId: `h10rv-b-acc-${RUN}`, mode: "OK" } });
  okRes(sv, "saveIntegration");
  const CONN = sv.integration.id as string;
  okRes(await INT.testIntegration(ctxA, OWNER, { id: CONN }), "testIntegration");
  const MAPS: [string, string][] = [[RT.dlx, "DLX"], [RT.sup, "SUP"], [RT.one, "ONE"], [RT.ste, "STE"]];
  for (const [rt, ext] of MAPS) okRes(await CH.saveRoomMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: rt, externalRoomId: ext }), `map ${ext}`);
  okRes(await CH.saveRateMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, ratePlanId: STD, externalRateId: "STD", markupBp: 1_500 }), "map STD");
  console.log(`(ร้าน A ${tA} · ร้าน B ${tB} · ตัวต่อ ${CONN} · วันนี้ ${T0})`);

  // ── ตัวช่วย ──
  const ACTIVE = ["HOLD", "CONFIRMED", "CHECKED_IN"];
  type InbOpt = { rooms?: number; nights?: number; rate?: string | null; gross?: number; commission?: number; net?: number; prepaid?: boolean; extra?: Record<string, unknown> };
  const inb = (ext: string, ver: number, status: string, room: string, ci: string, o: InbOpt = {}) => {
    const nights = o.nights ?? 1;
    const gross = o.gross ?? 230_000 * nights * (o.rooms ?? 1);
    const commission = o.commission ?? Math.round(gross * 0.15);
    const row: Any = { externalId: ext, version: ver, status, externalRoomId: room, checkIn: ci, checkOut: addDays(ci, nights), rooms: o.rooms ?? 1, adults: 2 * (o.rooms ?? 1), children: 0, guest: { name: `แขก ${ext}`, phone: "0890000000", email: `${SLUG}g@qc.invalid` }, grossSatang: gross, commissionSatang: commission, netSatang: o.net ?? gross - commission, prepaid: o.prepaid ?? true, ...(o.extra ?? {}) };
    if (o.rate !== null) row.externalRateId = o.rate ?? "STD";
    return row;
  };
  const ingest = async (rows: Any[]) => okRes(await CH.ingestInbound(CONN, rows), "ingestInbound");
  const inbox = (ext: string, ver: number) => prisma.channelReservationInbox.findFirst({ where: { connectionId: CONN, externalId: ext, version: ver } });
  const apply = async (ext: string, ver: number) => { const row = await inbox(ext, ver); ok(row, `ไม่มี inbox ${ext} v${ver}`); return call(() => CH.applyInbound(row.id)); };
  const activeOf = (ext: string) => prisma.hotelReservation.findMany({ where: { tenantId: tA, channelConnectionId: CONN, channelRef: ext, status: { in: ACTIVE } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const counterBook = (typeId: string, ci: string, nights = 1, rooms = 1) => call(() => HOTEL.createBooking(OWNER, ctxA, { unitId: UH, rooms: Array.from({ length: rooms }, () => ({ roomTypeId: typeId, adults: 2, children: 0 })), ratePlanId: STD, source: "PHONE", guest: { name: "เคาน์เตอร์ rv-b", phone: "0890000011" }, checkIn: ci, checkOut: addDays(ci, nights) }));
  const webHold = (typeId: string, ci: string, nights = 1) => call(() => HOTEL.createBooking(null, ctxA, { unitId: UH, rooms: [{ roomTypeId: typeId, adults: 2, children: 0 }], source: "WEB", hold: "ONLINE", guest: { name: "เว็บ rv-b", phone: "0890000022" }, checkIn: ci, checkOut: addDays(ci, nights) }));
  const nightsOn = (typeId: string, date: string) => prisma.hotelBookingNight.count({ where: { tenantId: tA, unitId: UH, roomTypeId: typeId, date: new Date(`${date}T00:00:00Z`), counted: true } });
  const avail = async (typeId: string, d: string) => { const r = await HOTEL.hotelAvailability.get(ctxA, { unitId: UH, from: d, to: addDays(d, 1) }); return r?.ok ? r.byDate[d]?.[typeId]?.available : `ERR ${r?.code}`; };
  const ariCell = async (ext: string, d: string) => { const a = await CH.buildAri(CONN, d, d, UH); return a?.byDate?.[d]?.[ext]; };
  const status = (r: Any) => (r?.ok ? r.status : `${r?.code}`);
  // ระบายเหตุของร้าน A ผ่าน consumer จริง (outbox-consumers) — เฉพาะแถวที่ยังไม่เคยระบายในโพรบนี้
  const seen = new Set<string>();
  const consumers = OC.consumers as Record<string, (e: Any) => Promise<void>>;
  const drain = async () => {
    for (let round = 0; round < 3; round++) {
      const evs: Any[] = await prisma.outboxEvent.findMany({ where: { tenantId: tA }, orderBy: { createdAt: "asc" } });
      const fresh = evs.filter((e) => !seen.has(e.id));
      if (!fresh.length) return;
      for (const e of fresh) {
        seen.add(e.id);
        const c = consumers[e.type];
        if (typeof c !== "function") continue;
        try { await c({ id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload, unitId: e.unitId ?? null, systemId: e.systemId ?? null }); } catch { /* consumer ล้ม = เหมือนคิว retry */ }
      }
    }
  };
  const clearJobs = () => prisma.channelAriJob.updateMany({ where: { connectionId: CONN, status: "PENDING" }, data: { status: "SUPERSEDED" } });
  const jobCovers = (d: string) => prisma.channelAriJob.count({ where: { connectionId: CONN, status: "PENDING", dateFrom: { lte: new Date(`${d}T00:00:00Z`) }, dateTo: { gte: new Date(`${d}T00:00:00Z`) } } });
  const evTypesSince = async (since: Date) => [...new Set(((await prisma.outboxEvent.findMany({ where: { tenantId: tA, createdAt: { gte: since } }, select: { type: true } })) as Any[]).map((e) => e.type))];
  /** ทำ op แล้วระบายเหตุ ⇒ มีงาน ARI PENDING ครอบวัน d ไหม */
  const hookAfter = async (d: string, op: () => Promise<unknown>) => {
    await drain(); await clearJobs();
    const t0 = new Date(Date.now() - 1000);
    const r = await op();
    await drain();
    return { covered: (await jobCovers(d)) > 0, r, types: await evTypesSince(t0) };
  };
  const callLogs = async (re: RegExp) => ((await prisma.integrationCallLog.findMany({ where: { integrationId: CONN } })) as Any[]).filter((l) => re.test(String(l.op))).length;

  console.log("\n── ARI ห้องว่างจริง (ไม่ขายเกิน) ──");
  await st("RB-1", "CRITICAL", "ARI available = availability − buffer: HOLD เว็บที่ยังไม่หมดอายุ หักจากที่ส่งช่องทาง (DLX 3 ห้อง ⇒ HOLD 1 ⇒ ARI 2 = hotelAvailability) · buffer 1 ⇒ 1", async () => {
    const d = W(30);
    const a0 = (await ariCell("DLX", d))?.available;
    const h = await webHold(RT.dlx, d);
    okRes(h, "จองเว็บ HOLD");
    ok(h.reservations?.[0]?.status === "HOLD", `สถานะเว็บ ${h.reservations?.[0]?.status}`);
    const a1 = (await ariCell("DLX", d))?.available;
    okRes(await CH.saveBuffer(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, rooms: 1 }), "buffer 1");
    const a2 = (await ariCell("DLX", d))?.available;
    okRes(await CH.saveBuffer(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.dlx, rooms: 0 }), "buffer 0");
    ok(a0 === 3 && a1 === 2 && a1 === (await avail(RT.dlx, d)) && a2 === 1, `ARI ก่อน ${a0} · หลัง HOLD ${a1} (avail ${await avail(RT.dlx, d)}) · buffer1 ${a2}`);
  });

  await st("RB-2", "CRITICAL", "ARI หัก BLOCK (blockRoom) + ปิดซ่อม OOO (setRoomStatus) + การจองกลุ่ม 2 ห้อง: DLX วัน d ⇒ 3 → BLOCK 1 ⇒ 2 · SUP 2 ห้อง OOO 1 ⇒ 1 · DLX วัน d2 จองกลุ่ม 2 ห้อง ⇒ 1 · stopSell เมื่อ 0", async () => {
    const d = W(32), d2 = W(33);
    const b = await call(() => HOTEL.blockRoom(OWNER, ctxA, { unitId: UH, roomId: ROOM.D1, from: d, to: addDays(d, 1), reason: "ซ่อมแอร์ rv-b" }));
    okRes(b, "blockRoom");
    const dBlock = (await ariCell("DLX", d))?.available;
    await SVC.setRoomStatus(tA, UH, ROOM.S1, "OOO");
    const sOoo = (await ariCell("SUP", d))?.available;
    await SVC.setRoomStatus(tA, UH, ROOM.S1, "AVAILABLE");
    okRes(await counterBook(RT.dlx, d2, 1, 2), "กลุ่ม 2 ห้อง");
    const g = await ariCell("DLX", d2);
    okRes(await counterBook(RT.dlx, d2, 1, 1), "ห้องที่ 3");
    const g0 = await ariCell("DLX", d2);
    ok(dBlock === 2 && sOoo === 1 && g?.available === 1 && g0?.available === 0 && g0?.stopSell === true, `BLOCK ${dBlock} · OOO ${sOoo} · กลุ่ม ${J(g)} · เต็ม ${J(g0)}`);
  });

  console.log("\n── hook ARI: ทุกเหตุที่เปลี่ยนห้องว่างต้องทำให้งาน ARI ครอบวันนั้น ──");
  await st("RB-3", "MAJOR", "positive control: จองเคาน์เตอร์ · ยกเลิก · ย่นคืน · blockRoom · ไม่มา (markNoShow) ⇒ ระบายเหตุ ⇒ มีงาน ARI PENDING ครอบวันที่กระทบ", async () => {
    const out: Record<string, string> = {};
    const d = W(36);
    let rid = "";
    let h = await hookAfter(d, async () => { const r = await counterBook(RT.sup, d, 2); rid = r?.reservations?.[0]?.id ?? ""; return r; });
    out.create = h.covered ? "ok" : `ไม่มีงาน ${J(h.types)}`;
    h = await hookAfter(addDays(d, 1), () => call(() => HOTEL.shortenBooking(OWNER, ctxA, { unitId: UH, id: rid, newCheckOut: addDays(d, 1) })));
    out.shorten = h.covered ? "ok" : `ไม่มีงาน ${status(h.r)} ${J(h.types)}`;
    h = await hookAfter(d, () => call(() => HOTEL.cancelBooking(OWNER, ctxA, { unitId: UH, reservationId: rid, reason: "rv-b" })));
    out.cancel = h.covered ? "ok" : `ไม่มีงาน ${status(h.r)} ${J(h.types)}`;
    h = await hookAfter(W(37), () => call(() => HOTEL.blockRoom(OWNER, ctxA, { unitId: UH, roomId: ROOM.D2, from: W(37), to: W(38), reason: "rv-b" })));
    out.block = h.covered ? "ok" : `ไม่มีงาน ${status(h.r)} ${J(h.types)}`;
    const ns = await counterBook(RT.sup, T0, 1);
    const nsId = ns?.reservations?.[0]?.id ?? "";
    h = await hookAfter(T0, () => call(() => HOTEL.markNoShow(OWNER, ctxA, { unitId: UH, id: nsId })));
    out.noShow = h.covered ? "ok" : `ไม่มีงาน ${status(h.r)} ${J(h.types)}`;
    ok(Object.values(out).every((v) => v === "ok"), J(out));
  });

  await st("RB-4", "MAJOR", "ย้อน «ไม่มา» (undoNoShow) = คืนกลับมานับ (ห้องว่างลด) ⇒ ต้องมีงาน ARI ครอบวันนั้น (ไม่งั้นช่องทางเห็นห้องว่างเกิน = ขายเกิน)", async () => {
    const ns: Any = await prisma.hotelReservation.findFirst({ where: { tenantId: tA, unitId: UH, status: "NO_SHOW" }, orderBy: { createdAt: "desc" } });
    ok(ns, "ไม่มีการจอง NO_SHOW จาก RB-3");
    const before = await nightsOn(RT.sup, T0);
    const h = await hookAfter(T0, () => call(() => HOTEL.undoNoShow(OWNER, ctxA, { unitId: UH, id: ns.id })));
    okRes(h.r, "undoNoShow");
    const after = await nightsOn(RT.sup, T0);
    ok(after === before + 1, `nights ก่อน ${before} หลัง ${after} (undo ไม่ได้นับคืน)`);
    ok(h.covered, `undoNoShow นับคืนกลับ (SUP ${T0} ว่าง ${await avail(RT.sup, T0)}) แต่ไม่มีงาน ARI — เหตุที่ออก ${J(h.types)} (hotel.booking.confirmed ไม่อยู่ในรายการ hook)`);
  });

  await st("RB-5", "MAJOR", "ปิดซ่อมห้อง (hotel setRoomStatus OOO · rooms.setHkStatus OUT_OF_ORDER) = ห้องขายได้ลด ⇒ ต้องมีงาน ARI", async () => {
    const d = W(40);
    const out: Record<string, string> = {};
    let h = await hookAfter(d, () => SVC.setRoomStatus(tA, UH, ROOM.D3, "OOO"));
    out.setRoomStatus = h.covered ? "ok" : `ไม่มีงาน (ARI DLX ${d} ตอนนี้ ${J((await ariCell("DLX", d))?.available)} · เหตุ ${J(h.types)})`;
    await SVC.setRoomStatus(tA, UH, ROOM.D3, "AVAILABLE");
    // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h10-rb5b) H.6 ตอบ USE_BLOCK เมื่อแม่บ้านสั่ง OUT_OF_ORDER (ปิดซ่อม = blockRoom ⇒ ครอบแล้วที่ RB-2 + syncBlockedRooms ยิง hotel.hk.changed) ⇒ ข้อนี้เหลือเส้น setRoomStatus
    await call(() => ROOMS.setHkStatus(ctxA, { unitId: UH, roomId: ROOM.D3, hkStatus: "CLEAN" }));
    await SVC.setRoomStatus(tA, UH, ROOM.D3, "AVAILABLE");
    ok(Object.values(out).every((v) => v === "ok"), J(out));
  });

  await st("RB-6", "MAJOR", "ถอดตัวต่อ (DISABLED) ระหว่างนั้นห้องสุดท้ายถูกจอง → ต่อกลับ (CONNECTED) ⇒ ต้องมีงาน ARI ครอบวันที่เปลี่ยนระหว่างถอด (ไม่งั้นช่องทางยังเห็นห้องว่างเก่า)", async () => {
    const d = W(42);
    await drain(); await clearJobs();
    await prisma.tenantIntegration.update({ where: { id: CONN }, data: { status: "DISABLED" } });
    try {
      okRes(await counterBook(RT.one, d), "จองห้องสุดท้ายระหว่างถอด");
      await drain();
    } finally {
      await prisma.tenantIntegration.update({ where: { id: CONN }, data: { status: "CONNECTED" } });
    }
    await drain();
    const cov = await jobCovers(d);
    ok(cov > 0, `ต่อกลับแล้วไม่มีงาน ARI ครอบ ${d} (ห้องเดี่ยวว่างจริง ${await avail(RT.one, d)} · ARI ล่าสุดที่ช่องทางรู้ = ก่อนถอด) — ไม่มี full resync ตอนต่อกลับ/ตามรอบ`);
  });

  await st("RB-7", "minor", "ARI hook เหตุอื่นที่เปลี่ยนห้องว่าง (ตรวจโค้ด): checkout ก่อนกำหนด (hotel.checked_out ปล่อยคืนอนาคต) · สัญญาหอ LEASE (dorm) · สร้าง/เก็บห้อง · ค่าตั้ง ota.buffer/markupBp ⇒ มี hook หรือ full resync ตามรอบ", async () => {
    const oc = readFileSync(new URL("../src/lib/outbox-consumers.ts", import.meta.url), "utf8");
    const lease = readFileSync(new URL("../src/lib/modules/dorm/lease.ts", import.meta.url), "utf8");
    const svc = readFileSync(new URL("../src/lib/modules/hotel/service.ts", import.meta.url), "utf8");
    const mj = readFileSync(new URL("../src/lib/platform/minute-jobs.ts", import.meta.url), "utf8");
    const miss: string[] = [];
    if (!/"hotel\.checked_out"[^\n]*ariDirty|ariDirtyFromBooking[\s\S]{0,400}hotel\.checked_out|hotel\.checked_out[\s\S]{0,200}ariDirty/.test(oc)) miss.push("hotel.checked_out");
    // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h10-rb7) สัญญาหอยิง rooms.occupancy.changed ⇒ ariDirtyFromOccupancy (hook ใน outbox-consumers) — ตรวจ hook แทนข้อความใน lease.ts
    if (!/rooms\.occupancy\.changed[\s\S]{0,300}ariDirtyFromOccupancy|ariDirtyFromOccupancy[\s\S]{0,300}rooms\.occupancy\.changed/.test(oc)) miss.push("rooms.occupancy.changed (สัญญาหอ)"); void lease;
    if (!/emitAriDirty|ari\.dirty/.test(svc)) miss.push("hotel/service.ts (createRoom/archiveRoom/setRoomStatus/updateRoomType)");
    if (!/full|resync|reconcile|ทั้งช่วง/i.test(mj.slice(mj.indexOf("channel-ari"), mj.indexOf("channel-ari") + 1500))) miss.push("ไม่มี full resync ตามรอบ");
    ok(!miss.length, `ไม่มี hook: ${miss.join(" · ")}`);
  });

  console.log("\n── inbound หลายห้อง / แก้ไขขยาย-ย่อ ──");
  await st("RB-8", "CRITICAL", "ฉบับเดียว 3 ห้อง (DLX) 2 คืน · คืนที่ 2 เหลือ 2 ห้อง ⇒ ทั้งฉบับ NEEDS_ROOM · ไม่มีการจองของเลขนี้ · nights ทั้งสองคืนไม่เพิ่ม (ไม่ลงครึ่งใบ)", async () => {
    const d = W(50);
    okRes(await counterBook(RT.dlx, addDays(d, 1)), "เคาน์เตอร์คืนที่ 2");
    const n0 = [await nightsOn(RT.dlx, d), await nightsOn(RT.dlx, addDays(d, 1))];
    await ingest([inb("RB8", 1, "NEW", "DLX", d, { rooms: 3, nights: 2 })]);
    const a = await apply("RB8", 1);
    const ib = await inbox("RB8", 1);
    const act = await activeOf("RB8");
    const n1 = [await nightsOn(RT.dlx, d), await nightsOn(RT.dlx, addDays(d, 1))];
    ok(ib.status === "NEEDS_ROOM" && act.length === 0 && J(n0) === J(n1), `inbox ${ib.status} (${status(a)}) · การจอง ${act.length} · nights ${J(n0)}→${J(n1)}`);
  });

  await st("RB-9", "MAJOR", "ฉบับเดียว 2 ห้องสำเร็จ ⇒ การจอง 2 แถว CONFIRMED · Σgross/Σcommission ตรงช่องทาง · Σnet = net ที่ช่องทางส่ง (ช่องทางหักภาษีค่าคอมฯ ⇒ net ≠ gross − commission ต้องเก็บตรงตัว §10.5)", async () => {
    const d = W(52);
    const gross = 460_001, commission = 69_000, net = 386_170; // net = gross − commission × 1.07 (ภาษีค่าคอมฯ) − ปัด
    await ingest([inb("RB9", 1, "NEW", "DLX", d, { rooms: 2, gross, commission, net })]);
    const a = await apply("RB9", 1);
    okRes(a, "apply");
    const act = await activeOf("RB9");
    ok(act.length === 2 && act.every((r) => r.status === "CONFIRMED"), `การจอง ${act.length} ${J(act.map((r) => r.status))}`);
    const sum = (k: string) => act.reduce((s, r) => s + (r[k] ?? 0), 0);
    ok(sum("grossSatang") === gross && sum("commissionSatang") === commission, `Σgross ${sum("grossSatang")}/${gross} · Σcommission ${sum("commissionSatang")}/${commission}`);
    ok(sum("netSatang") === net, `Σnet เก็บ ${sum("netSatang")} แต่ช่องทางส่ง ${net} (booking.ts คำนวณ net = gross − commission ทิ้งค่า netSatang ของช่องทาง)`);
  });

  await st("RB-10", "CRITICAL", "MODIFIED ขยายคืน (1→3 คืน) ขณะคืนที่ต่อเต็ม ⇒ NEEDS_ROOM · การจองเดิมยัง active วันเดิม · nights เดิมคง (ไม่ยกเลิกก่อนแล้วสร้างไม่ได้)", async () => {
    const d = W(54);
    await ingest([inb("RB10", 1, "NEW", "ONE", d)]);
    okRes(await apply("RB10", 1), "v1");
    okRes(await counterBook(RT.one, addDays(d, 1)), "เคาน์เตอร์คืนที่ต่อ");
    const orig = (await activeOf("RB10"))[0];
    await ingest([inb("RB10", 2, "MODIFIED", "ONE", d, { nights: 3 })]);
    const a = await apply("RB10", 2);
    const ib = await inbox("RB10", 2);
    const act = await activeOf("RB10");
    ok(ib.status === "NEEDS_ROOM" && act.length === 1 && act[0].id === orig.id && ymdOf(act[0].checkOutDate) === addDays(d, 1) && (await nightsOn(RT.one, d)) === 1, `v2 ${ib.status} (${status(a)}) · active ${act.length} ${J(act.map((x) => [ymdOf(x.checkInDate), ymdOf(x.checkOutDate)]))} · nights ${await nightsOn(RT.one, d)}`);
  });

  await st("RB-11", "CRITICAL", "MODIFIED เปลี่ยนประเภท (SUP → ONE ที่เต็ม) ⇒ NEEDS_ROOM · การจองเดิม (SUP) ยัง active", async () => {
    const d = W(56);
    okRes(await counterBook(RT.one, d), "ONE เต็ม");
    await ingest([inb("RB11", 1, "NEW", "SUP", d)]);
    okRes(await apply("RB11", 1), "v1");
    await ingest([inb("RB11", 2, "MODIFIED", "ONE", d)]);
    const a = await apply("RB11", 2);
    const ib = await inbox("RB11", 2);
    const act = await activeOf("RB11");
    ok(ib.status === "NEEDS_ROOM" && act.length === 1 && act[0].roomTypeId === RT.sup && (await nightsOn(RT.sup, d)) === 1, `v2 ${ib.status} (${status(a)}) · active ${act.length} type ${act[0]?.roomTypeId === RT.sup ? "SUP" : act[0]?.roomTypeId}`);
  });

  await st("RB-12", "CRITICAL", "MODIFIED ย่นคืน (3→1 คืน) ⇒ APPLIED · active 1 checkOut ใหม่ · คืนที่ตัดถูกปล่อย (nights counted ของเลขนี้ = 0 · ห้องว่างกลับ) · ARI ของคืนที่ตัดถูก dirty", async () => {
    const d = W(58);
    await ingest([inb("RB12", 1, "NEW", "ONE", d, { nights: 3 })]);
    okRes(await apply("RB12", 1), "v1");
    const cut = addDays(d, 2);
    const av0 = await avail(RT.one, cut);
    await drain(); await clearJobs();
    await ingest([inb("RB12", 2, "MODIFIED", "ONE", d, { nights: 1 })]);
    const a = await apply("RB12", 2);
    await drain();
    const act = await activeOf("RB12");
    const ids = act.map((x) => x.id);
    const left = await prisma.hotelBookingNight.count({ where: { tenantId: tA, reservationId: { in: ids }, date: { gte: new Date(`${addDays(d, 1)}T00:00:00Z`) }, counted: true } });
    const av1 = await avail(RT.one, cut);
    const cov = await jobCovers(cut);
    ok(a?.ok && a.status === "APPLIED" && act.length === 1 && ymdOf(act[0].checkOutDate) === addDays(d, 1) && left === 0 && av0 === 0 && av1 === 1 && cov > 0, `v2 ${status(a)} · active ${act.length} co ${act[0] ? ymdOf(act[0].checkOutDate) : "-"} · nights ค้าง ${left} · ว่าง ${av0}→${av1} · งาน ARI ${cov}`);
  });

  await st("RB-13", "CRITICAL", "inbound ‖ เว็บ HOLD (createBooking WEB ONLINE) ห้องสุดท้ายพร้อมกัน 6 รอบ ⇒ ทุกคืนสำเร็จรวม 1 · nights ≤ 1 · inbox ตรงผล (เว็บชนะ ⇒ NEEDS_ROOM)", async () => {
    const bad: string[] = [];
    for (let k = 0; k < 6; k++) {
      const d = W(60 + k);
      const ext = `RB13-${k}`;
      await ingest([inb(ext, 1, "NEW", "ONE", d)]);
      const row = await inbox(ext, 1);
      const [w, a] = await Promise.all([webHold(RT.one, d), k % 2 ? call(() => CH.applyInbound(row.id)) : new Promise((r) => setTimeout(r, 10)).then(() => call(() => CH.applyInbound(row.id)))]);
      const n = await nightsOn(RT.one, d);
      const ib = await inbox(ext, 1);
      const wins = (w?.ok ? 1 : 0) + (ib.status === "APPLIED" ? 1 : 0);
      if (n !== 1 || wins !== 1 || (w?.ok && ib.status !== "NEEDS_ROOM")) bad.push(`${d}: nights=${n} web=${w?.ok ? "ok" : w?.code} inbox=${ib.status} apply=${status(a)}`);
    }
    ok(!bad.length, bad.join(" | "));
  });

  console.log("\n── เปลี่ยนแม็ป / ถอดตัวต่อกลางทาง ──");
  await st("RB-14", "MAJOR", "ยกเลิกแม็ปห้อง/แผนขณะมี inbox RECEIVED ⇒ apply ไม่ throw · REJECTED UNMAPPED_ROOM / UNMAPPED_RATE · ไม่มีการจอง", async () => {
    await ingest([inb("RB14R", 1, "NEW", "SUP", W(70)), inb("RB14P", 1, "NEW", "DLX", W(70))]);
    okRes(await CH.saveRoomMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.sup, externalRoomId: "" }), "เลิกแม็ป SUP");
    const r1 = await apply("RB14R", 1);
    okRes(await CH.saveRoomMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, roomTypeId: RT.sup, externalRoomId: "SUP" }), "แม็ป SUP คืน");
    const unr = await call(() => CH.saveRateMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, ratePlanId: STD, externalRateId: "", markupBp: null }));
    let r2: Any = null;
    try { r2 = await apply("RB14P", 1); } finally { okRes(await CH.saveRateMap(OWNER, ctxA, { unitId: UH, connectionId: CONN, ratePlanId: STD, externalRateId: "STD", markupBp: 1_500 }), "แม็ปแผนคืน"); }
    const i1 = await inbox("RB14R", 1), i2 = await inbox("RB14P", 1);
    ok(r1?.code !== "THROW" && r2?.code !== "THROW", `throw ${J([r1, r2])}`);
    ok(i1.status === "REJECTED" && /UNMAPPED_ROOM/.test(i1.error ?? "") && (await activeOf("RB14R")).length === 0, `ห้อง: ${i1.status} ${i1.error}`);
    ok(!unr?.ok || (i2.status === "REJECTED" && /UNMAPPED_RATE/.test(i2.error ?? "") && (await activeOf("RB14P")).length === 0), `แผน: เลิกแม็ป ${unr?.ok ? "ok" : unr?.code} · ${i2.status} ${i2.error}`);
  });

  await st("RB-15", "MAJOR", "ตัวต่อ DISABLED: inbox RECEIVED ค้างไม่หาย · applyInbound ไม่ throw ไม่ลง · pullAll ไม่เรียกดึง · pushAriJobs ไม่ส่ง · ต่อกลับ ⇒ pullAll ลงแถวที่ค้าง (APPLIED)", async () => {
    await ingest([inb("RB15", 1, "NEW", "DLX", W(72))]);
    await CH.enqueueAri(tA, UH, W(72), W(72));
    await prisma.tenantIntegration.update({ where: { id: CONN }, data: { status: "DISABLED" } });
    let a: Any, pull0 = 0, pull1 = 0, push0 = 0, push1 = 0, mid = "";
    try {
      a = await apply("RB15", 1);
      pull0 = await callLogs(/pull/i); push0 = await callLogs(/push/i);
      await CH.pullAll(new Date(), 20_000, { tenantId: tA });
      await CH.pushAriJobs(new Date(), 20_000);
      pull1 = await callLogs(/pull/i); push1 = await callLogs(/push/i);
      mid = (await inbox("RB15", 1)).status;
    } finally { await prisma.tenantIntegration.update({ where: { id: CONN }, data: { status: "CONNECTED" } }); }
    ok(a?.code !== "THROW" && mid === "RECEIVED" && pull1 === pull0 && push1 === push0 && (await activeOf("RB15")).length === 0, `ถอด: apply ${status(a)} · inbox ${mid} · pull +${pull1 - pull0} · push +${push1 - push0}`);
    await CH.pullAll(new Date(), 20_000, { tenantId: tA });
    const ib = await inbox("RB15", 1);
    ok(ib.status === "APPLIED" && (await activeOf("RB15")).length === 1, `ต่อกลับ: ${ib.status} ${ib.error ?? ""}`);
  });

  console.log("\n── เงินจาก OTA ──");
  await st("RB-16", "MAJOR", "NO_RATE หลายห้อง (สวีท 2 ห้อง 2 คืน gross 300,001 สตางค์) ⇒ APPLIED · Σราคาคืนทุกห้อง = gross ตรงสตางค์ · Σ totalSatang = gross · Σgross = gross", async () => {
    const gross = 300_001;
    await ingest([inb("RB16", 1, "NEW", "STE", W(74), { rooms: 2, nights: 2, gross, commission: 45_000 })]);
    const a = await apply("RB16", 1);
    okRes(a, "apply");
    ok(a.status === "APPLIED", `inbox ${a.status} ${a.reason}`);
    const act = await activeOf("RB16");
    const nights: Any[] = await prisma.hotelBookingNight.findMany({ where: { tenantId: tA, reservationId: { in: act.map((x) => x.id) } } });
    const sN = nights.reduce((s, n) => s + n.priceSatang, 0);
    const sT = act.reduce((s, r) => s + r.totalSatang, 0);
    const sG = act.reduce((s, r) => s + r.grossSatang, 0);
    ok(act.length === 2 && sN === gross && sT === gross && sG === gross, `การจอง ${act.length} · Σnights ${sN} · Σtotal ${sT} · Σgross ${sG}`);
  });

  await st("RB-17", "MAJOR", "prepaid ⇒ ไม่เก็บค่าห้องซ้ำ: การจอง OTA prepaid เข้าพักแล้ว · postRoomNights (night audit) ⇒ folio ยอดค้างชำระที่เคาน์เตอร์ต้องเป็น 0 หรือมีเครื่องหมาย prepaid/PLATFORM (หนี้ H.5b)", async () => {
    // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h10-rb17) prepaid ไม่เก็บค่าห้องซ้ำ = หนี้ H.5b (เงื่อนไขก่อนเปิดตัวต่อเจ้าจริง H2) ⇒ SKIP จนกว่า H.5b ปิด
    throw new SK("หนี้ H.5b — prepaidByChannel ใน folio/checkout (ต้องปิดก่อน H2)");
    const act = await activeOf("RB9");
    const rv = act[0];
    ok(rv?.prepaidByChannel === true, "ไม่มีการจอง prepaid จาก RB-9");
    await prisma.hotelReservation.update({ where: { id: rv.id }, data: { status: "CHECKED_IN" } });
    const p = await call(() => FOLIO.postRoomNights(ctxA, { reservationId: rv.id, upToDate: addDays(ymdOf(rv.checkOutDate), 0) }));
    if (!p?.ok) throw new SK(`postRoomNights ${p?.code} ${p?.reason ?? ""}`);
    const f: Any = await prisma.hotelFolio.findFirst({ where: { tenantId: tA, reservationId: rv.id } });
    const items: Any[] = f ? await prisma.hotelFolioItem.findMany({ where: { folioId: f.id } }) : [];
    const room = items.filter((i) => i.type === "ROOM").reduce((s, i) => s + (i.amountSatang ?? i.unitAmountSatang * (i.qty ?? 1)), 0);
    const bal = f?.balanceSatang ?? null;
    ok(!(bal > 0), `prepaid (OTA เก็บ gross ${rv.grossSatang} แล้ว) แต่ folio โพสต์ค่าห้อง ${room} · ยอดค้าง ${bal} — เช็กเอาต์จะเก็บเงินแขกซ้ำ (checkout/folio ไม่รู้จัก prepaidByChannel · H.5b)`);
  });

  console.log("\n── ข้ามร้าน ──");
  await st("RB-18", "CRITICAL", "payload inbound ปลอม tenantId/unitId/roomTypeId (ของร้าน B) ⇒ inbox อยู่ร้าน A หน่วย UH · การจองอยู่ร้าน A เท่านั้น · ร้าน B ไม่มีการจอง/nights", async () => {
    await ingest([inb("RB18", 1, "NEW", "DLX", W(76), { extra: { tenantId: tB, unitId: UB, roomTypeId: RTB, channelConnectionId: "x" } })]);
    const ib = await inbox("RB18", 1);
    const a = await apply("RB18", 1);
    const act = await activeOf("RB18");
    const bRes = await prisma.hotelReservation.count({ where: { tenantId: tB } });
    const bN = await prisma.hotelBookingNight.count({ where: { tenantId: tB } });
    ok(ib.tenantId === tA && ib.unitId === UH && a?.ok && a.status === "APPLIED" && act.length === 1 && act[0].unitId === UH && act[0].roomTypeId === RT.dlx && bRes === 0 && bN === 0, `inbox ${ib.tenantId === tA ? "A" : ib.tenantId}/${ib.unitId === UH ? "UH" : ib.unitId} · ${status(a)} · การจอง ${J(act.map((x) => [x.unitId === UH, x.roomTypeId === RT.dlx]))} · ร้าน B ${bRes}/${bN}`);
  });

  await st("RB-19", "CRITICAL", "แม็ปปลอม (แทรกฐาน) ตัวต่อ A → ประเภทห้องร้าน B ⇒ buildAri ไม่มีรหัสนั้น (ไม่อ่านห้องร้าน B) · inbound ⇒ REJECTED · ร้าน B ไม่มีการจอง", async () => {
    let ins = false;
    try {
      await prisma.channelRoomMap.create({ data: { tenantId: tA, unitId: UH, connectionId: CONN, roomTypeId: RTB, externalRoomId: "XB", active: true } });
      ins = true;
    } catch (e) { throw new SK(`แทรกแม็ปปลอมไม่ได้ (ฐานกันเอง) ${errMsg(e).slice(0, 120)}`); }
    try {
      const cell = await ariCell("XB", W(78));
      await ingest([inb("RB19", 1, "NEW", "XB", W(78))]);
      const a = await apply("RB19", 1);
      const ib = await inbox("RB19", 1);
      const bRes = await prisma.hotelReservation.count({ where: { tenantId: tB } });
      ok(cell === undefined && ib.status === "REJECTED" && (await activeOf("RB19")).length === 0 && bRes === 0, `ARI XB ${J(cell)} · inbox ${ib.status} ${ib.error} (${status(a)}) · ร้าน B ${bRes}`);
    } finally { if (ins) await prisma.channelRoomMap.deleteMany({ where: { tenantId: tA, externalRoomId: "XB" } }); }
  });

  await st("RB-20", "CRITICAL", "งาน ARI ปลอม (แทรกฐาน) ร้าน A ตัวต่อ A แต่ unitId = หน่วยร้าน B ⇒ pushAriJobs ไม่ส่ง (ไม่ SENT · call log push +0)", async () => {
    await clearJobs();
    const j = await prisma.channelAriJob.create({ data: { tenantId: tA, unitId: UB, connectionId: CONN, dateFrom: new Date(`${W(80)}T00:00:00Z`), dateTo: new Date(`${W(81)}T00:00:00Z`), payloadHash: "", status: "PENDING" } });
    const p0 = await callLogs(/push/i);
    await CH.pushAriJobs(new Date(), 20_000);
    const p1 = await callLogs(/push/i);
    const after = await prisma.channelAriJob.findUnique({ where: { id: j.id } });
    ok(after.status !== "SENT" && p1 === p0, `งาน ${after.status} · push +${p1 - p0}`);
  });

  await st("RB-21", "CRITICAL", "ทั้งร้านหลังทุกข้อ: ทุก (ประเภท, คืน) nights counted ≤ ห้องจริงของประเภท · occupancy active ไม่ชี้การจองที่ไม่ active", async () => {
    const over: Any[] = await prisma.$queryRawUnsafe(`SELECT n."roomTypeId", n."date", count(*)::int AS c FROM "HotelBookingNight" n WHERE n."tenantId" = $1 AND n."counted" GROUP BY 1,2 HAVING count(*) > (SELECT count(*) FROM "HotelRoom" r WHERE r."roomTypeId" = n."roomTypeId" AND r."active")`, tA);
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
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "probe-h10-review-b", total: cks.length, passed: cks.filter((c) => c.res === "PASS").length, failed, skipped, bySev: Object.fromEntries(cks.filter((c) => c.res === "FAIL").map((c) => [c.id, c.sev])) })}`);
await prisma.$disconnect?.();
process.exit(exitCode || (failed.length ? 1 : 0));
