// QC — SVC R0.8 · แกนห้อง + RoomOccupancy · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/svc-briefs/svc-brief-r0.8.md · ledger/SVC-CORE-CONTRACT.md §5 · ledger/SVC-MASTER-PLAN.md แถว R0.8 · ledger/wo-notes/svc-r0.8-carry.md
//
// กลุ่มข้อ:
//   S  โครงสร้าง: ไฟล์/facade/ขอบโมดูล/fitness/สคริปต์ล้าง QC (occupancy ก่อนห้อง)/3 ทะเบียน event/minute-job/CLI backfill
//   C  claimRoom: เขียนถูก · ชน ⇒ ROOM_TAKEN ไม่รั่ว ref · ติดกันได้ · วันไทย/exclusiveEnd · ข้ามร้าน/ข้ามหน่วย ⇒ ปฏิเสธ · SAVEPOINT · rollback · X3 10 ทาง
//   H  HOLD: กันจอง · หมดเวลาแล้วจองได้ · expireHolds · X5 ซ้อน 2 รอบ · minute-job
//   R  release/move/resize: สำเร็จ/ชน/ข้ามร้าน/inactive · แถวเดิมไม่เปลี่ยนเมื่อล้ม
//   E  event rooms.occupancy.changed: payload 4 คีย์ · ใน tx · ไม่มีเมื่อล้ม · ไม่ซ้ำ
//   B  อาคาร/ชั้น/rentMode/hkStatus CRUD + แมป status↔hkStatus
//   V  availability · W roomBoard
//   T  จองห้องเดียวช่วงซ้อนจาก 3 ทางพร้อมกัน (สัญญาหอจำลอง · เคาน์เตอร์ · ออนไลน์) ⇒ สำเร็จ 1 (5 รอบ)
//   P  โรงแรม P1 เขียน/ปล่อย occupancy ใน tx เดียวกับการจอง · ชนห้องที่หอถือ ⇒ ปฏิเสธ
//   K  backfill (dry-run ไม่เขียน · apply · ซ้ำ = 0 · ชนรายงานไม่ throw · เฉพาะ tenant)
//   Z  มติหลังผู้ตรวจ 27 ต.ค.: การจองนับเป็นภาระเสมอ (+LEASE/BLOCK/HOLD · legacy) · affected (รวม setRoomStatus OOO) · checkOut ปล่อยหลัง POS · ตัวนับตลอดช่วง · best-fit · dry-run ไม่ล็อก · expire 300 · requireRentMode · RELEASE SAVEPOINT · แข่ง 30 ทาง
//   G  regression qc-hotel-money/public/refund (ลูกโพรเซส) + ไม่มี occupancy กำพร้า
//
// ข้อมูลทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-r08-*` · ลบใน finally (occupancy ก่อนห้อง) + กวาดของค้างรอบก่อนตอนเริ่ม
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.8.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-r0.8";
const SVC_HOST = "ep-mute-scene";
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const RUN_CMD = "bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.8.mts";

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบเสมอ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: ${RUN_CMD}`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.includes(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
  if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
}

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const pass = (id: string, name: string) => { cks.push({ id, res: "PASS", sev: "CRITICAL", why: "" }); console.log(`  ✅ [${id}] ${name}`); };
const fail = (id: string, name: string, why: string, sev: Sev) => { cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] ${name} — ${why}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 260);
const J = (x: unknown) => { try { return JSON.stringify(x) ?? String(x); } catch { return String(x); } };

// ═══════════════ โหลดโมดูล ═══════════════
const { prisma } = (await import("@/lib/core/db")) as { prisma: any };
const hotel = (await import("@/lib/modules/hotel/service" as string)) as any;
const ROOMS_IDX = join(ROOT, "src/lib/modules/rooms/index.ts");
let rooms: any = null;
let roomsWhy = "";
if (!existsSync(ROOMS_IDX)) roomsWhy = "ยังไม่มี src/lib/modules/rooms/index.ts";
else {
  try { rooms = await import(pathToFileURL(ROOMS_IDX).href); } catch (e) { roomsWhy = `import rooms ล้ม: ${errMsg(e)}`; }
}
const fn = (name: string): ((...a: any[]) => any) | null => (rooms && typeof rooms[name] === "function" ? rooms[name] : null);

// ตัวรันข้อ: needs = ชื่อฟังก์ชัน rooms ที่ข้อนี้ต้องใช้ (ไม่มี ⇒ SKIP พร้อมเหตุผล) · fn คืน [ok, รายละเอียด]
async function T(id: string, name: string, needs: string[], body: () => Promise<[boolean, string?]>, sev: Sev = "CRITICAL") {
  const miss = needs.filter((n) => !fn(n));
  if (miss.length) return skip(id, name, rooms ? `facade rooms ไม่มี ${miss.join(", ")}` : roomsWhy, sev);
  try {
    const [ok, why] = await body();
    if (ok) pass(id, name); else fail(id, name, why ?? "ไม่ตรง", sev);
  } catch (e) {
    fail(id, name, `throw: ${errMsg(e)}`, sev);
  }
}

// ═══════════════ วันที่ ═══════════════
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const D = (n: number) => addDays("2031-01-01", n); // อนาคตไกล (createReservation ปฏิเสธอดีต)
const ymdOf = (d: Date | string | null | undefined) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? "").slice(0, 10));
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const EV = "rooms.occupancy.changed";

// ═══════════════ ล้างข้อมูล (occupancy ก่อนห้อง · FK RESTRICT) ═══════════════
async function cleanup(tids: string[]) {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } };
  for (const tenantId of tids) {
    await d(() => prisma.outboxEvent.deleteMany({ where: { tenantId } }));
    await d(() => prisma.roomOccupancy.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelReservation.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelRoom.deleteMany({ where: { tenantId } }));
    await d(() => prisma.roomBuilding.deleteMany({ where: { tenantId } }));
    await d(() => prisma.hotelRoomType.deleteMany({ where: { tenantId } }));
    for (const m of ["posPayment", "posSaleLine", "posSale", "posReceiptCounter", "appSystemUnit", "appSystem"]) await d(() => prisma[m].deleteMany({ where: { tenantId } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await d(() => prisma.tenant.deleteMany({ where: { id: tenantId } }));
  }
}

const tenantIds: string[] = [];
try {
  // กวาดของค้างรอบก่อน
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: "qc-svc-r08-" } }, select: { id: true } });
  if (stale.length) { console.log(`  (กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }

  // ═══════════════ S. โครงสร้าง (ไม่ต้องใช้ฐาน) ═══════════════
  console.log("\n── S โครงสร้าง ──");
  const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
  const RFILES = ["src/lib/modules/rooms/index.ts", "src/lib/modules/rooms/service.ts", "src/lib/modules/rooms/occupancy.ts"];
  {
    const miss = RFILES.filter((p) => !existsSync(join(ROOT, p)));
    if (miss.length === 0) pass("S-1", "มีไฟล์ rooms/{index,service,occupancy}.ts"); else fail("S-1", "มีไฟล์ rooms/{index,service,occupancy}.ts", `ขาด ${miss.join(", ")}`, "CRITICAL");
  }
  const API = ["claimRoom", "releaseOccupancy", "moveOccupancy", "resizeOccupancy", "expireHolds", "exclusiveEnd", "availability", "roomBoard",
    "createBuilding", "updateBuilding", "deleteBuilding", "listBuildings", "setRoomLayout", "setHkStatus", "setRoomTypeRent", "backfillHotelOccupancy"];
  {
    const miss = API.filter((n) => !fn(n));
    if (!miss.length) pass("S-2", `facade export ครบ ${API.length} ชื่อ`); else fail("S-2", `facade export ครบ ${API.length} ชื่อ`, rooms ? `ขาด ${miss.join(", ")}` : roomsWhy, "CRITICAL");
  }
  {
    const hotelSrc = readdirSync(join(ROOT, "src/lib/modules/hotel")).filter((f) => /\.tsx?$/.test(f)).map((f) => read(`src/lib/modules/hotel/${f}`)).join("\n");
    const viaFacade = /from\s+["']@\/lib\/modules\/rooms["']|import\(\s*["']@\/lib\/modules\/rooms["']\s*\)/.test(hotelSrc);
    const deep = /["']@\/lib\/modules\/rooms\/|["']\.\.\/rooms/.test(hotelSrc);
    if (viaFacade && !deep) pass("S-3", "hotel import rooms ผ่าน facade `@/lib/modules/rooms` เท่านั้น");
    else fail("S-3", "hotel import rooms ผ่าน facade `@/lib/modules/rooms` เท่านั้น", `ผ่าน facade=${viaFacade} ล้วง subpath=${deep}`, "CRITICAL");
  }
  {
    const fit = read("scripts/fitness.mts");
    const edge = /["']hotel→rooms["']/.test(fit);
    const rsrc = RFILES.map(read).join("\n");
    const out = [...rsrc.matchAll(/(?:from\s+|import\(\s*)["']@\/lib\/modules\/([a-z-]+)/g)].map((m) => m[1]).filter((m) => m !== "rooms");
    if (edge && out.length === 0) pass("S-4", "fitness ALLOWED_EDGES มี hotel→rooms · rooms ไม่ import โมดูลอื่น");
    else fail("S-4", "fitness ALLOWED_EDGES มี hotel→rooms · rooms ไม่ import โมดูลอื่น", `edge=${edge} rooms→${[...new Set(out)].join(",") || "—"}`, "MAJOR");
  }
  {
    const rsrc = RFILES.map(read).join("\n");
    const nested = /room\s*:\s*\{\s*connect/.test(rsrc);
    const anyUse = /:\s*any\b|as\s+any\b|<any>/.test(rsrc);
    const getDay = /\.getDay\(\)/.test(rsrc);
    if (rsrc.trim() && !nested && !anyUse && !getDay) pass("S-5", "rooms: ไม่มี nested room.connect · ไม่มี any · ไม่มี getDay() ดิบ");
    else fail("S-5", "rooms: ไม่มี nested room.connect · ไม่มี any · ไม่มี getDay() ดิบ", rsrc.trim() ? `connect=${nested} any=${anyUse} getDay=${getDay}` : "ยังไม่มีไฟล์", "MAJOR");
  }
  {
    // carry: สคริปต์ล้าง QC ทุกตัวที่ลบ hotelRoom ต้องลบ roomOccupancy ก่อน
    const bad: string[] = [];
    const files = readdirSync(join(ROOT, "scripts")).filter((f) => /\.(mts|ts|mjs)$/.test(f) && f !== "qc-svc-r0.8.mts" && f !== "qc-svc-r0.1.mts" && f !== "qc-svc-d.0.mts" /* ORACLE-EDIT R0.8-G2: d.0 ลบ HotelRoom โดยตั้งใจให้ล้ม (ทดสอบ RESTRICT) */);
    for (const f of files) {
      const src = read(`scripts/${f}`);
      const m = /["']hotelRoom["']|hotelRoom\.deleteMany|DELETE\s+FROM\s+"HotelRoom"/.exec(src);
      if (!m) continue;
      const occ = /["']roomOccupancy["']|roomOccupancy\.deleteMany|DELETE\s+FROM\s+"RoomOccupancy"/.exec(src);
      if (!occ || occ.index > m.index) bad.push(f);
    }
    if (!bad.length) pass("S-6", "สคริปต์ล้าง QC ที่ลบ hotelRoom ลบ roomOccupancy ก่อนทุกไฟล์");
    else fail("S-6", "สคริปต์ล้าง QC ที่ลบ hotelRoom ลบ roomOccupancy ก่อนทุกไฟล์", `ยังไม่แก้: ${bad.join(", ")}`, "MAJOR");
  }
  {
    let why = "";
    try {
      const oc = (await import("@/lib/outbox-consumers" as string)) as any;
      const al = (await import("@/lib/automation/labels" as string)) as any;
      const wl = (await import("@/lib/webhooks/labels" as string)) as any;
      const a = typeof oc.consumers?.[EV] === "function";
      const b = Array.isArray(al.AUTOMATION_EVENTS) && al.AUTOMATION_EVENTS.some((e: { value: string }) => e.value === EV);
      const c = Array.isArray(wl.WEBHOOK_EVENTS) && wl.WEBHOOK_EVENTS.some((e: { value: string }) => e.value === EV);
      if (!(a && b && c)) why = `consumers=${a} automation=${b} webhooks=${c}`;
    } catch (e) { why = `import ทะเบียนล้ม: ${errMsg(e)}`; }
    if (!why) pass("S-7", `event ${EV} ลง 3 ทะเบียน`); else fail("S-7", `event ${EV} ลง 3 ทะเบียน`, why, "MAJOR");
  }
  let expireJob: any = null;
  {
    let why = "";
    try {
      await import("@/lib/platform/minute-jobs" as string);
      const reg = (globalThis as any)[Symbol.for("shark.platform.minute-jobs.registry")] as Map<string, any> | undefined;
      expireJob = reg?.get("rooms.expireHolds") ?? null;
      if (!expireJob) why = "ไม่มีงาน rooms.expireHolds ในทะเบียน minute-jobs";
      else if (expireJob.everyMinutes !== 1 || (expireJob.cadence ?? "minute") !== "minute" || expireJob.vpsOnly) why = `everyMinutes=${expireJob.everyMinutes} cadence=${expireJob.cadence} vpsOnly=${expireJob.vpsOnly}`;
    } catch (e) { why = `import minute-jobs ล้ม: ${errMsg(e)}`; }
    if (!why) pass("S-8", "minute-job rooms.expireHolds ทุก 1 นาที (cadence minute)"); else fail("S-8", "minute-job rooms.expireHolds ทุก 1 นาที (cadence minute)", why, "MAJOR");
  }
  {
    const cli = read("scripts/svc-backfill-room-occupancy.mts");
    const ok = !!cli && cli.includes("--apply") && /dryRun/.test(cli) && cli.includes("backfillHotelOccupancy");
    if (ok) pass("S-9", "CLI backfill มี (ค่าปริยาย dry-run · --apply · เรียก backfillHotelOccupancy)");
    else fail("S-9", "CLI backfill มี (ค่าปริยาย dry-run · --apply · เรียก backfillHotelOccupancy)", cli ? "ไม่พบ --apply/dryRun/backfillHotelOccupancy" : "ยังไม่มี scripts/svc-backfill-room-occupancy.mts", "MAJOR");
  }

  // ═══════════════ fixtures ═══════════════
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tA = await prisma.tenant.create({ data: { name: "QC R08 A", slug: `qc-svc-r08-a-${stamp}` } }); tenantIds.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC R08 B", slug: `qc-svc-r08-b-${stamp}` } }); tenantIds.push(tB.id);
  const A = tA.id, B = tB.id;
  const HA = (await prisma.businessUnit.create({ data: { tenantId: A, type: "HOTEL", name: "โรงแรม A", slug: `r08ha-${stamp}` } })).id;
  const DA = (await prisma.businessUnit.create({ data: { tenantId: A, type: "DORM", name: "หอ A", slug: `r08da-${stamp}` } })).id;
  const HB = (await prisma.businessUnit.create({ data: { tenantId: B, type: "HOTEL", name: "โรงแรม B", slug: `r08hb-${stamp}` } })).id;
  const ctxA = { tenantId: A }, ctxB = { tenantId: B };

  const mkType = async (tenantId: string, unitId: string, name: string, rentMode = "NIGHTLY") =>
    (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, capacity: 2, baseRateSatang: 100000, depositSatang: 0, rentMode } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, roomTypeId: string, number: string, extra: Record<string, unknown> = {}) =>
    (await prisma.hotelRoom.create({ data: { tenantId, unitId, roomTypeId, number, ...extra } })).id as string;

  const tMain = await mkType(A, HA, "หลัก");
  const M: Record<number, string> = {};
  for (let i = 101; i <= 112; i++) M[i] = await mkRoom(A, HA, tMain, `M${i}`);
  const I901 = await mkRoom(A, HA, tMain, "I901", { active: false });
  const tRace = await mkType(A, HA, "แข่ง (1 ห้อง)", "BOTH");
  const R201 = await mkRoom(A, HA, tRace, "R201");
  const tSolo = await mkType(A, HA, "เดี่ยว (1 ห้อง)", "BOTH");
  const S301 = await mkRoom(A, HA, tSolo, "S301");
  const tPair = await mkType(A, HA, "คู่ (2 ห้อง)");
  const P401 = await mkRoom(A, HA, tPair, "P401");
  const P402 = await mkRoom(A, HA, tPair, "P402");
  const tMixed = await mkType(A, HA, "ผสม");
  const X501 = await mkRoom(A, HA, tMixed, "X501");
  const X502 = await mkRoom(A, HA, tMixed, "X502", { rentMode: "MONTHLY" });
  const tLegacy = await mkType(A, HA, "เก่า");
  const L601 = await mkRoom(A, HA, tLegacy, "L601");
  const L602 = await mkRoom(A, HA, tLegacy, "L602");
  const tBoth = await mkType(A, HA, "ได้ทั้งสอง", "BOTH");
  const B701 = await mkRoom(A, HA, tBoth, "B701");
  const tMonthly = await mkType(A, HA, "รายเดือน", "MONTHLY");
  const N801 = await mkRoom(A, HA, tMonthly, "N801");
  const tDorm = await mkType(A, DA, "หอ", "MONTHLY");
  const D101 = await mkRoom(A, DA, tDorm, "D101");
  const tTypeB = await mkType(B, HB, "ร้านอื่น");
  const Z101 = await mkRoom(B, HB, tTypeB, "Z101");

  const tx = (f: (t: any) => Promise<any>): Promise<any> => prisma.$transaction(f);
  const claim = (a: Record<string, unknown>): Promise<any> => tx((t) => fn("claimRoom")!(t, a));
  const base = (roomId: string, start: string | Date, end: string | Date, refId: string, kind = "LEASE", refType = "DormLease", extra: Record<string, unknown> = {}) =>
    ({ tenantId: A, unitId: HA, roomId, start, end, kind, refType, refId, ...extra });
  const occOf = (id: string) => prisma.roomOccupancy.findUnique({ where: { id } });
  const occByRef = (refId: string, refType?: string) => prisma.roomOccupancy.findMany({ where: { tenantId: A, refId, ...(refType ? { refType } : {}) } });
  const rawOcc = (roomId: string, s: string, e: string, kind: string, refId: string, extra: Record<string, unknown> = {}, unitId = HA, tenantId = A) =>
    prisma.roomOccupancy.create({ data: { tenantId, unitId, roomId, startDate: dbDate(s), endDate: dbDate(e), kind, refType: kind === "LEASE" ? "DormLease" : "QcRaw", refId, ...extra } });
  const events = async (roomId?: string) => {
    const rows = await prisma.outboxEvent.findMany({ where: { tenantId: A, type: EV }, orderBy: { createdAt: "asc" } });
    return rows.filter((r: any) => !roomId || r.payload?.roomId === roomId);
  };
  const isFail = (r: any, ...codes: string[]) => r && r.ok === false && codes.includes(r.code);
  const HOUR = 3_600_000;

  // ═══════════════ C. claimRoom ═══════════════
  console.log("\n── C claimRoom ──");
  let c1Id = "";
  await T("C-1", "claim LEASE ⇒ ok + แถวตรงทุกช่อง ([start,end) · active)", ["claimRoom"], async () => {
    const r = await claim(base(M[101], D(0), D(5), "lease-c1"));
    if (r?.ok !== true || !r.occupancyId) return [false, J(r)];
    c1Id = r.occupancyId;
    const o = await occOf(c1Id);
    const ok = o && o.tenantId === A && o.unitId === HA && o.roomId === M[101] && ymdOf(o.startDate) === D(0) && ymdOf(o.endDate) === D(5) && o.kind === "LEASE" && o.refType === "DormLease" && o.refId === "lease-c1" && o.active === true;
    return [!!ok, J(o)];
  });
  await T("C-2", "ช่วงซ้อน ⇒ ROOM_TAKEN · conflict={kind,refType} เท่านั้น · ไม่บอก refId/occupancyId ของคนอื่น · ไม่มีแถว", ["claimRoom"], async () => {
    const r = await claim(base(M[101], D(3), D(8), "rv-c2", "STAY", "HotelReservation"));
    const s = J(r);
    const keys = r?.conflict ? Object.keys(r.conflict).sort().join(",") : "";
    const rows = (await occByRef("rv-c2")).length;
    const ok = isFail(r, "ROOM_TAKEN") && r.conflict?.kind === "LEASE" && r.conflict?.refType === "DormLease" && keys === "kind,refType" && !s.includes("lease-c1") && !(c1Id && s.includes(c1Id)) && rows === 0;
    return [ok, `${s} · แถว=${rows}`];
  });
  await T("C-3", "ช่วงติดกัน (จบ=เริ่ม) ได้ทั้งก่อนและหลัง", ["claimRoom"], async () => {
    const a = await claim(base(M[101], D(5), D(7), "lease-c3a"));
    const b = await claim(base(M[101], D(-2), D(0), "lease-c3b"));
    return [a?.ok === true && b?.ok === true, `${J(a)} / ${J(b)}`];
  });
  await T("C-4", "exclusiveEnd: 31 ม.ค. ⇒ 1 ก.พ. · 28 ก.พ. ปีอธิกสุรทิน ⇒ 29 ก.พ. · 31 ธ.ค. ⇒ 1 ม.ค.", ["exclusiveEnd"], async () => {
    const e = fn("exclusiveEnd")!;
    const got = [e("2031-01-31"), e("2032-02-28"), e("2031-12-31"), e("2031-02-28")];
    return [J(got) === J(["2031-02-01", "2032-02-29", "2032-01-01", "2031-03-01"]), J(got)];
  }, "MAJOR");
  await T("C-5", "Date เข้า ⇒ แปลงเป็นวันไทยก่อนเก็บ (17:30Z = วันถัดไปของไทย)", ["claimRoom"], async () => {
    const r = await claim(base(M[102], new Date("2031-03-31T17:30:00Z"), new Date("2031-04-02T16:59:00Z"), "lease-c5"));
    if (r?.ok !== true) return [false, J(r)];
    const o = await occOf(r.occupancyId);
    return [ymdOf(o?.startDate) === "2031-04-01" && ymdOf(o?.endDate) === "2031-04-02", `${ymdOf(o?.startDate)}→${ymdOf(o?.endDate)}`];
  });
  await T("C-6", "ช่วงว่าง/กลับด้าน ⇒ INVALID_RANGE ไม่มีแถว (ไม่ throw 23514)", ["claimRoom"], async () => {
    const a = await claim(base(M[102], D(10), D(10), "c6"));
    const b = await claim(base(M[102], D(12), D(10), "c6"));
    const rows = (await occByRef("c6")).length;
    return [isFail(a, "INVALID_RANGE") && isFail(b, "INVALID_RANGE") && rows === 0, `${J(a)} / ${J(b)} · แถว=${rows}`];
  });
  await T("C-7", "kind นอกชุด · HOLD ไม่มี holdExpiresAt · refId ว่าง ⇒ INVALID_INPUT", ["claimRoom"], async () => {
    const a = await claim(base(M[102], D(14), D(15), "c7a", "FOO"));
    const b = await claim(base(M[102], D(14), D(15), "c7b", "HOLD", "Qc"));
    const c = await claim(base(M[102], D(14), D(15), ""));
    const rows = (await prisma.roomOccupancy.count({ where: { tenantId: A, roomId: M[102], startDate: dbDate(D(14)) } }));
    return [isFail(a, "INVALID_INPUT") && isFail(b, "INVALID_INPUT") && isFail(c, "INVALID_INPUT") && rows === 0, `${J(a)} / ${J(b)} / ${J(c)} · แถว=${rows}`];
  }, "MAJOR");
  await T("C-8", "X1 roomId ของร้านอื่น ⇒ ROOM_NOT_FOUND · ไม่มีแถวในทั้งสองร้าน", ["claimRoom"], async () => {
    const a = await claim({ ...base(Z101, D(0), D(2), "c8a") }); // ctx A + ห้องร้าน B
    const b = await claim({ tenantId: B, unitId: HB, roomId: M[103], start: D(0), end: D(2), kind: "LEASE", refType: "DormLease", refId: "c8b" }); // ctx B + ห้องร้าน A
    const rows = await prisma.roomOccupancy.count({ where: { refId: { in: ["c8a", "c8b"] } } });
    const leak = J(b).includes("M103") || J(a).includes("Z101");
    return [isFail(a, "ROOM_NOT_FOUND") && isFail(b, "ROOM_NOT_FOUND") && rows === 0 && !leak, `${J(a)} / ${J(b)} · แถว=${rows}`];
  });
  await T("C-9", "unitId ไม่ตรงหน่วยของห้อง (ร้านเดียวกัน) ⇒ ปฏิเสธ · ไม่มีแถว", ["claimRoom"], async () => {
    const a = await claim({ ...base(M[103], D(0), D(2), "c9a"), unitId: DA });
    const b = await claim({ ...base(D101, D(0), D(2), "c9b"), unitId: HA });
    const rows = await prisma.roomOccupancy.count({ where: { refId: { in: ["c9a", "c9b"] } } });
    return [isFail(a, "ROOM_NOT_FOUND", "UNIT_MISMATCH") && isFail(b, "ROOM_NOT_FOUND", "UNIT_MISMATCH") && rows === 0, `${J(a)} / ${J(b)} · แถว=${rows}`];
  });
  await T("C-10", "roomId ไม่มีจริง ⇒ ROOM_NOT_FOUND", ["claimRoom"], async () => {
    const a = await claim(base("no-such-room-r08", D(0), D(2), "c10"));
    return [isFail(a, "ROOM_NOT_FOUND"), J(a)];
  });
  await T("C-11", "ห้อง active=false ⇒ ROOM_INACTIVE", ["claimRoom"], async () => {
    const a = await claim(base(I901, D(0), D(2), "c11"));
    return [isFail(a, "ROOM_INACTIVE") && (await occByRef("c11")).length === 0, J(a)];
  }, "MAJOR");
  await T("C-12", "หลัง ROOM_TAKEN tx ของผู้เรียกยังใช้ต่อ + commit ได้ (SAVEPOINT)", ["claimRoom"], async () => {
    const out = await tx(async (t) => {
      const r1 = await fn("claimRoom")!(t, base(M[101], D(1), D(2), "c12a"));
      const r2 = await fn("claimRoom")!(t, base(M[101], D(20), D(22), "c12b"));
      return [r1, r2];
    });
    const rows = await occByRef("c12b");
    return [isFail(out[0], "ROOM_TAKEN") && out[1]?.ok === true && rows.length === 1 && rows[0].active === true, `${J(out)} · แถว c12b=${rows.length}`];
  });
  await T("C-13", "claim อยู่ใน tx ผู้เรียก: tx ล้ม ⇒ ไม่มีแถว · ไม่มี event", ["claimRoom"], async () => {
    const before = (await events(M[104])).length;
    let thrown = false;
    try { await tx(async (t) => { const r = await fn("claimRoom")!(t, base(M[104], D(30), D(31), "c13")); if (r?.ok !== true) throw new Error(`claim ไม่ ok ${J(r)}`); throw new Error("ROLLBACK_ME"); }); }
    catch (e) { thrown = errMsg(e).includes("ROLLBACK_ME"); }
    const rows = (await occByRef("c13")).length;
    const after = (await events(M[104])).length;
    return [thrown && rows === 0 && after === before, `rollback=${thrown} แถว=${rows} event ${before}→${after}`];
  });
  let c14Winner = "";
  await T("C-14", "X3 ยิงพร้อมกัน 10 ทาง ห้อง/ช่วงเดียวกัน ⇒ ok 1 · ROOM_TAKEN 9 · ไม่มี throw · แถว active 1", ["claimRoom"], async () => {
    const res = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => claim(base(M[105], D(40), D(45), `c14-${i}`))));
    const ok = res.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok === true);
    const taken = res.filter((r) => r.status === "fulfilled" && isFail(r.value, "ROOM_TAKEN")).length;
    const thrown = res.filter((r) => r.status === "rejected").map((r) => errMsg((r as PromiseRejectedResult).reason));
    const act = await prisma.roomOccupancy.count({ where: { roomId: M[105], active: true } });
    if (ok.length === 1) c14Winner = ((ok[0] as PromiseFulfilledResult<any>).value).occupancyId;
    return [ok.length === 1 && taken === 9 && thrown.length === 0 && act === 1, `ok=${ok.length} taken=${taken} throw=${thrown.length} ${thrown[0] ?? ""} active=${act}`];
  });
  await T("C-15", "occupancy ที่ปล่อยแล้ว (inactive) ไม่กันการจองใหม่ช่วงเดิม", ["claimRoom", "releaseOccupancy"], async () => {
    if (!c14Winner) return [false, "C-14 ไม่มีผู้ชนะ"];
    const rel = await tx((t) => fn("releaseOccupancy")!(t, { tenantId: A, unitId: HA, occupancyId: c14Winner, reason: "qc" }));
    const r = await claim(base(M[105], D(40), D(45), "c15"));
    return [rel?.ok === true && r?.ok === true, `${J(rel)} / ${J(r)}`];
  });

  // ═══════════════ E. event ═══════════════
  console.log("\n── E event ──");
  await T("E-1", "claim ⇒ event rooms.occupancy.changed · payload ตรง 4 คีย์ {unitId,roomId,from,to} · แถว outbox unitId ถูก", ["claimRoom"], async () => {
    const evs = (await events(M[101])).filter((e: any) => e.payload?.from === D(0));
    if (evs.length !== 1) return [false, `event ของ C-1 = ${evs.length}`];
    const e = evs[0];
    const keys = Object.keys(e.payload ?? {}).sort().join(",");
    return [keys === "from,roomId,to,unitId" && e.payload.unitId === HA && e.payload.roomId === M[101] && e.payload.to === D(5) && e.unitId === HA, `keys=${keys} ${J(e.payload)} unitId=${e.unitId}`];
  });
  await T("E-2", "claim ล้ม (ROOM_TAKEN/ข้ามร้าน/ช่วงผิด) ⇒ ไม่มี event", ["claimRoom"], async () => {
    const before = (await events()).length;
    await claim(base(M[101], D(3), D(4), "e2a"));
    await claim(base(Z101, D(3), D(4), "e2b"));
    await claim(base(M[101], D(9), D(8), "e2c"));
    const after = (await events()).length;
    return [after === before, `${before}→${after}`];
  });
  await T("E-3", "payload ไม่มี PII/ref (ไม่มีชื่อ เบอร์ refId) ทุก event ของร้าน", ["claimRoom"], async () => {
    const evs = await events();
    const bad = evs.filter((e: any) => Object.keys(e.payload ?? {}).sort().join(",") !== "from,roomId,to,unitId" || /lease-|rv-|DormLease|HotelReservation/.test(J(e.payload)));
    return [evs.length > 0 && bad.length === 0, `event=${evs.length} ผิด=${bad.length} ${bad[0] ? J(bad[0].payload) : ""}`];
  });

  // ═══════════════ H. HOLD ═══════════════
  console.log("\n── H HOLD ──");
  await T("H-1", "HOLD ยังไม่หมดเวลา กัน LEASE (ROOM_TAKEN · conflict.kind HOLD)", ["claimRoom"], async () => {
    const h = await claim(base(M[106], D(50), D(52), "h1", "HOLD", "QcHold", { holdExpiresAt: new Date(Date.now() + HOUR) }));
    const l = await claim(base(M[106], D(50), D(52), "h1-lease"));
    return [h?.ok === true && isFail(l, "ROOM_TAKEN") && l.conflict?.kind === "HOLD", `${J(h)} / ${J(l)}`];
  });
  await T("H-2", "HOLD หมดเวลาแล้ว (ยัง active · ยังไม่มีใครรันงาน) ⇒ claim ได้ทันที + hold ถูกปิด", ["claimRoom"], async () => {
    const h = await rawOcc(M[106], D(53), D(55), "HOLD", "h2", { holdExpiresAt: new Date(Date.now() - 60_000) });
    const l = await claim(base(M[106], D(53), D(55), "h2-lease"));
    const hh = await occOf(h.id);
    return [l?.ok === true && hh?.active === false, `${J(l)} · hold active=${hh?.active}`];
  });
  await T("H-3", "expireHolds: HOLD/CHANNEL_HOLD หมดเวลา ⇒ ปิด · ยังไม่หมด/LEASE/BLOCK ไม่แตะ · event ต่อแถวที่ปิด", ["expireHolds"], async () => {
    const past = { holdExpiresAt: new Date(Date.now() - 60_000) };
    const hExp = await rawOcc(M[107], D(60), D(61), "HOLD", "h3a", past);
    const cExp = await rawOcc(M[107], D(61), D(62), "CHANNEL_HOLD", "h3b", past);
    const hFut = await rawOcc(M[107], D(62), D(63), "HOLD", "h3c", { holdExpiresAt: new Date(Date.now() + HOUR) });
    const lPast = await rawOcc(M[107], D(63), D(64), "LEASE", "h3d", past);
    const bPast = await rawOcc(M[107], D(64), D(65), "BLOCK", "h3e", past);
    const ev0 = (await events(M[107])).length;
    const r = await fn("expireHolds")!(new Date());
    const st = await Promise.all([hExp, cExp, hFut, lPast, bPast].map((o) => occOf(o.id)));
    const ev1 = (await events(M[107])).length;
    const act = st.map((o: any) => o?.active);
    return [J(act) === J([false, false, true, true, true]) && typeof r?.expired === "number" && r.expired >= 2 && ev1 - ev0 === 2, `active=${J(act)} r=${J(r)} event +${ev1 - ev0}`];
  });
  await T("H-4", "X5 expireHolds ซ้อน 2 ตัวพร้อมกัน ⇒ ทุก hold ปิด · event แถวละ 1 พอดี", ["expireHolds"], async () => {
    const past = { holdExpiresAt: new Date(Date.now() - 60_000) };
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await rawOcc(M[108], D(70 + 2 * i), D(71 + 2 * i), i % 2 ? "CHANNEL_HOLD" : "HOLD", `h4-${i}`, past)).id);
    const ev0 = (await events(M[108])).length;
    const now = new Date();
    const rs = await Promise.allSettled([fn("expireHolds")!(now), fn("expireHolds")!(now)]);
    const rows = await prisma.roomOccupancy.findMany({ where: { id: { in: ids } } });
    const ev1 = (await events(M[108])).length;
    const thrown = rs.filter((r) => r.status === "rejected").length;
    return [rows.every((o: any) => o.active === false) && ev1 - ev0 === 6 && thrown === 0, `ปิด ${rows.filter((o: any) => !o.active).length}/6 · event +${ev1 - ev0} · throw=${thrown}`];
  });
  await T("H-5", "minute-job rooms.expireHolds.run(now) ปิด hold ที่หมดเวลาจริง", [], async () => {
    if (!expireJob) return [false, "ไม่มีงานในทะเบียน (S-8)"];
    const h = await rawOcc(M[108], D(90), D(91), "HOLD", "h5", { holdExpiresAt: new Date(Date.now() - 60_000) });
    const ac = new AbortController();
    await expireJob.run(new Date(), 20_000, { signal: ac.signal, deadline: Date.now() + 20_000 });
    const o = await occOf(h.id);
    return [o?.active === false, `active=${o?.active}`];
  }, "MAJOR");

  // ═══════════════ R. release / move / resize ═══════════════
  console.log("\n── R release/move/resize ──");
  const rel = (a: Record<string, unknown>): Promise<any> => tx((t) => fn("releaseOccupancy")!(t, a));
  const mv = (a: Record<string, unknown>): Promise<any> => tx((t) => fn("moveOccupancy")!(t, a));
  const rs = (a: Record<string, unknown>): Promise<any> => tx((t) => fn("resizeOccupancy")!(t, a));
  const sameRow = (a: any, b: any) => a && b && a.roomId === b.roomId && ymdOf(a.startDate) === ymdOf(b.startDate) && ymdOf(a.endDate) === ymdOf(b.endDate) && a.active === b.active;
  await T("R-1", "release ⇒ active=false + event 1 · ปล่อยซ้ำ ⇒ ok (noop) ไม่มี event เพิ่ม", ["claimRoom", "releaseOccupancy"], async () => {
    const c = await claim(base(M[109], D(100), D(103), "r1"));
    const e0 = (await events(M[109])).length;
    const a = await rel({ tenantId: A, unitId: HA, occupancyId: c.occupancyId, reason: "ยกเลิก" });
    const e1 = (await events(M[109])).length;
    const b = await rel({ tenantId: A, unitId: HA, occupancyId: c.occupancyId, reason: "ยกเลิก" });
    const e2 = (await events(M[109])).length;
    const o = await occOf(c.occupancyId);
    const ev = (await events(M[109])).at(-1);
    return [a?.ok === true && b?.ok === true && o?.active === false && e1 - e0 === 1 && e2 === e1 && ev?.payload?.from === D(100) && ev?.payload?.to === D(103), `${J(a)} / ${J(b)} active=${o?.active} event +${e1 - e0},+${e2 - e1}`];
  });
  await T("R-2", "X1 release ด้วย ctx ร้านอื่น/หน่วยอื่น ⇒ NOT_FOUND · ยัง active", ["claimRoom", "releaseOccupancy"], async () => {
    const c = await claim(base(M[109], D(110), D(112), "r2"));
    const a = await rel({ tenantId: B, unitId: HB, occupancyId: c.occupancyId, reason: "x" });
    const b = await rel({ tenantId: A, unitId: DA, occupancyId: c.occupancyId, reason: "x" });
    const o = await occOf(c.occupancyId);
    return [isFail(a, "NOT_FOUND") && isFail(b, "NOT_FOUND") && o?.active === true, `${J(a)} / ${J(b)} active=${o?.active}`];
  });
  await T("R-3", "move ไปห้องว่าง ⇒ ห้องใหม่ วันเดิม · event 2 (ห้องเดิม + ห้องใหม่ ช่วงเดิม)", ["claimRoom", "moveOccupancy"], async () => {
    const c = await claim(base(M[110], D(120), D(124), "r3"));
    const e10 = (await events(M[110])).length, e11 = (await events(M[111])).length;
    const r = await mv({ tenantId: A, unitId: HA, occupancyId: c.occupancyId, toRoomId: M[111] });
    const o = await occOf(c.occupancyId);
    const a = (await events(M[110])).slice(e10), b = (await events(M[111])).slice(e11);
    const okEv = a.length === 1 && b.length === 1 && a[0].payload.from === D(120) && a[0].payload.to === D(124) && b[0].payload.from === D(120) && b[0].payload.to === D(124);
    return [r?.ok === true && o?.roomId === M[111] && ymdOf(o?.startDate) === D(120) && ymdOf(o?.endDate) === D(124) && o?.active === true && okEv, `${J(r)} room=${o?.roomId === M[111]} event ${a.length}+${b.length}`];
  });
  let r4Y = "";
  await T("R-4", "move ไปห้องที่ไม่ว่าง ⇒ ROOM_TAKEN ไม่รั่ว ref · แถวเดิมไม่เปลี่ยน", ["claimRoom", "moveOccupancy"], async () => {
    await claim(base(M[111], D(130), D(134), "r4-blocker"));
    const y = await claim(base(M[110], D(130), D(132), "r4-y"));
    r4Y = y.occupancyId;
    const before = await occOf(y.occupancyId);
    const r = await mv({ tenantId: A, unitId: HA, occupancyId: y.occupancyId, toRoomId: M[111] });
    const after = await occOf(y.occupancyId);
    return [isFail(r, "ROOM_TAKEN") && !J(r).includes("r4-blocker") && sameRow(before, after), `${J(r)} คงเดิม=${sameRow(before, after)}`];
  });
  await T("R-5", "move ไปห้องร้านอื่น/หน่วยอื่น/ห้องปิด ⇒ ปฏิเสธ · แถวเดิมไม่เปลี่ยน", ["moveOccupancy"], async () => {
    if (!r4Y) return [false, "R-4 ไม่มีแถว"];
    const before = await occOf(r4Y);
    const a = await mv({ tenantId: A, unitId: HA, occupancyId: r4Y, toRoomId: Z101 });
    const b = await mv({ tenantId: A, unitId: HA, occupancyId: r4Y, toRoomId: D101 });
    const c = await mv({ tenantId: A, unitId: HA, occupancyId: r4Y, toRoomId: I901 });
    const after = await occOf(r4Y);
    return [isFail(a, "ROOM_NOT_FOUND") && isFail(b, "ROOM_NOT_FOUND", "UNIT_MISMATCH") && isFail(c, "ROOM_INACTIVE") && sameRow(before, after), `${J(a)} / ${J(b)} / ${J(c)} คงเดิม=${sameRow(before, after)}`];
  });
  let qId = "";
  await T("R-6", "resize ยืดชน ⇒ ROOM_TAKEN แถวเดิมไม่เปลี่ยน · ยืดถึงขอบ (จบ=เริ่มคนถัดไป) ได้ · event ช่วง union", ["claimRoom", "resizeOccupancy"], async () => {
    const q = await claim(base(M[112], D(140), D(143), "r6-q"));
    qId = q.occupancyId;
    await claim(base(M[112], D(145), D(147), "r6-blocker"));
    const before = await occOf(qId);
    const a = await rs({ tenantId: A, unitId: HA, occupancyId: qId, end: D(146) });
    const mid = await occOf(qId);
    const e0 = (await events(M[112])).length;
    const b = await rs({ tenantId: A, unitId: HA, occupancyId: qId, end: D(145) });
    const after = await occOf(qId);
    const ev = (await events(M[112])).slice(e0);
    return [isFail(a, "ROOM_TAKEN") && !J(a).includes("r6-blocker") && sameRow(before, mid) && b?.ok === true && ymdOf(after?.endDate) === D(145) && ev.length === 1 && ev[0].payload.from === D(140) && ev[0].payload.to === D(145),
      `${J(a)} คงเดิม=${sameRow(before, mid)} / ${J(b)} end=${ymdOf(after?.endDate)} event=${J(ev.map((e: any) => e.payload))}`];
  });
  await T("R-7", "resize ย่อ ⇒ ok + event (resize 2 ครั้ง = 2 event) · start>=end ⇒ INVALID_RANGE ไม่เปลี่ยน", ["resizeOccupancy"], async () => {
    if (!qId) return [false, "R-6 ไม่มีแถว"];
    const e0 = (await events(M[112])).length;
    const a = await rs({ tenantId: A, unitId: HA, occupancyId: qId, start: D(141) });
    const mid = await occOf(qId);
    const b = await rs({ tenantId: A, unitId: HA, occupancyId: qId, start: D(145) });
    const after = await occOf(qId);
    const e1 = (await events(M[112])).length;
    return [a?.ok === true && ymdOf(mid?.startDate) === D(141) && isFail(b, "INVALID_RANGE") && sameRow(mid, after) && e1 - e0 === 1, `${J(a)} / ${J(b)} start=${ymdOf(after?.startDate)} event +${e1 - e0}`];
  });
  await T("R-8", "move/resize occupancy ที่ปล่อยแล้ว ⇒ INACTIVE", ["releaseOccupancy", "moveOccupancy", "resizeOccupancy"], async () => {
    if (!qId) return [false, "R-6 ไม่มีแถว"];
    await rel({ tenantId: A, unitId: HA, occupancyId: qId, reason: "qc" });
    const a = await mv({ tenantId: A, unitId: HA, occupancyId: qId, toRoomId: M[109] });
    const b = await rs({ tenantId: A, unitId: HA, occupancyId: qId, end: D(150) });
    const o = await occOf(qId);
    return [isFail(a, "INACTIVE") && isFail(b, "INACTIVE") && o?.active === false && o?.roomId === M[112], `${J(a)} / ${J(b)}`];
  }, "MAJOR");
  await T("R-9", "X1 move/resize ด้วย ctx ร้านอื่น ⇒ NOT_FOUND · แถวไม่เปลี่ยน", ["claimRoom", "moveOccupancy", "resizeOccupancy"], async () => {
    const c = await claim(base(M[112], D(150), D(151), "r9"));
    const before = await occOf(c.occupancyId);
    const a = await mv({ tenantId: B, unitId: HB, occupancyId: c.occupancyId, toRoomId: Z101 });
    const b = await rs({ tenantId: B, unitId: HB, occupancyId: c.occupancyId, end: D(152) });
    const after = await occOf(c.occupancyId);
    return [isFail(a, "NOT_FOUND") && isFail(b, "NOT_FOUND") && sameRow(before, after), `${J(a)} / ${J(b)}`];
  });

  // ═══════════════ B. อาคาร/ชั้น/rentMode/hkStatus ═══════════════
  console.log("\n── B อาคาร/ชั้น/rentMode/hkStatus ──");
  let bldA = "", bldDorm = "";
  await T("B-1", "createBuilding ok · floors<1/ชื่อว่าง/หน่วยร้านอื่น ⇒ ok:false · listBuildings เฉพาะหน่วย/ร้าน", ["createBuilding", "listBuildings"], async () => {
    const a = await fn("createBuilding")!(ctxA, { unitId: HA, name: "ตึก A", floors: 5, sortOrder: 1 });
    bldA = a?.id ?? "";
    const d = await fn("createBuilding")!(ctxA, { unitId: DA, name: "ตึกหอ", floors: 3 });
    bldDorm = d?.id ?? "";
    const bad1 = await fn("createBuilding")!(ctxA, { unitId: HA, name: "ศูนย์ชั้น", floors: 0 });
    const bad2 = await fn("createBuilding")!(ctxA, { unitId: HA, name: "   ", floors: 2 });
    const bad3 = await fn("createBuilding")!(ctxA, { unitId: HB, name: "แอบสร้าง", floors: 2 });
    const listA = await fn("listBuildings")!(ctxA, { unitId: HA });
    const listX = await fn("listBuildings")!(ctxB, { unitId: HA });
    const cntB = await prisma.roomBuilding.count({ where: { unitId: HB } });
    const ok = a?.ok === true && d?.ok === true && bad1?.ok === false && bad2?.ok === false && bad3?.ok === false && cntB === 0
      && Array.isArray(listA) && listA.length === 1 && listA[0].id === bldA && Array.isArray(listX) && listX.length === 0;
    return [ok, `${J(a)} ${J(bad1)} ${J(bad2)} ${J(bad3)} listA=${listA?.length} listX=${listX?.length} แถวHB=${cntB}`];
  }, "MAJOR");
  await T("B-2", "setRoomLayout: อาคารหน่วยอื่น ⇒ ปฏิเสธ · floorNo เกินจำนวนชั้น ⇒ ปฏิเสธ · ค่าถูก ⇒ บันทึก", ["setRoomLayout"], async () => {
    const x = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: B701, buildingId: bldDorm });
    const y = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: B701, buildingId: bldA, floorNo: 6 });
    const z = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: B701, buildingId: bldA, floorNo: 3, rentMode: "BOTH" });
    const r = await prisma.hotelRoom.findUnique({ where: { id: B701 } });
    return [x?.ok === false && y?.ok === false && z?.ok === true && r?.buildingId === bldA && r?.floorNo === 3 && r?.rentMode === "BOTH", `${J(x)} ${J(y)} ${J(z)} → ${r?.buildingId === bldA}/${r?.floorNo}/${r?.rentMode}`];
  }, "MAJOR");
  await T("B-3", "setRoomLayout rentMode นอกชุด ⇒ ปฏิเสธ · null = ตามประเภท · ห้องร้านอื่น ⇒ ปฏิเสธ", ["setRoomLayout"], async () => {
    const a = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: B701, rentMode: "WEEKLY" });
    const b = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: B701, rentMode: null });
    const c = await fn("setRoomLayout")!(ctxB, { unitId: HB, roomId: B701, floorNo: 1 });
    const r = await prisma.hotelRoom.findUnique({ where: { id: B701 } });
    return [a?.ok === false && b?.ok === true && r?.rentMode === null && c?.ok === false && r?.floorNo === 3, `${J(a)} ${J(b)} ${J(c)} rentMode=${r?.rentMode} floor=${r?.floorNo}`];
  }, "MAJOR");
  await T("B-4", "setRoomTypeRent: MONTHLY + ค่าเช่าสตางค์ · ติดลบ/ทศนิยม/ร้านอื่น ⇒ ปฏิเสธ", ["setRoomTypeRent"], async () => {
    const a = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tMonthly, rentMode: "MONTHLY", monthlyRateSatang: 450000 });
    const b = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tMonthly, rentMode: "MONTHLY", monthlyRateSatang: -1 });
    const c = await fn("setRoomTypeRent")!(ctxA, { unitId: HA, roomTypeId: tMonthly, rentMode: "MONTHLY", monthlyRateSatang: 1.5 });
    const d = await fn("setRoomTypeRent")!(ctxB, { unitId: HB, roomTypeId: tMonthly, rentMode: "BOTH", monthlyRateSatang: 1 });
    const t = await prisma.hotelRoomType.findUnique({ where: { id: tMonthly } });
    return [a?.ok === true && b?.ok === false && c?.ok === false && d?.ok === false && t?.monthlyRateSatang === 450000 && t?.rentMode === "MONTHLY", `${J(a)} ${J(b)} ${J(c)} ${J(d)} → ${t?.rentMode}/${t?.monthlyRateSatang}`];
  }, "MAJOR");
  await T("B-5", "setHkStatus: OUT_OF_ORDER ⇒ status OOO · CLEAN ⇒ AVAILABLE · ค่าผิด/ร้านอื่น ⇒ ปฏิเสธ (hkStatus = แหล่งความจริง)", ["setHkStatus"], async () => {
    const a = await fn("setHkStatus")!(ctxA, { unitId: HA, roomId: B701, hkStatus: "OUT_OF_ORDER" });
    const r1 = await prisma.hotelRoom.findUnique({ where: { id: B701 } });
    const b = await fn("setHkStatus")!(ctxA, { unitId: HA, roomId: B701, hkStatus: "CLEAN" });
    const r2 = await prisma.hotelRoom.findUnique({ where: { id: B701 } });
    const c = await fn("setHkStatus")!(ctxA, { unitId: HA, roomId: B701, hkStatus: "BROKEN" });
    const d = await fn("setHkStatus")!(ctxB, { unitId: HB, roomId: B701, hkStatus: "DIRTY" });
    const r3 = await prisma.hotelRoom.findUnique({ where: { id: B701 } });
    return [a?.ok === true && r1?.hkStatus === "OUT_OF_ORDER" && r1?.status === "OOO" && b?.ok === true && r2?.hkStatus === "CLEAN" && r2?.status === "AVAILABLE" && c?.ok === false && d?.ok === false && r3?.hkStatus === "CLEAN",
      `${r1?.hkStatus}/${r1?.status} → ${r2?.hkStatus}/${r2?.status} · ${J(c)} ${J(d)} → ${r3?.hkStatus}`];
  }, "MAJOR");
  await T("B-6", "hotel.setRoomStatus แมป hkStatus: CLEANING→DIRTY · OOO→OUT_OF_ORDER · AVAILABLE→CLEAN", [], async () => {
    const seq: string[] = [];
    for (const s of ["CLEANING", "OOO", "AVAILABLE"]) {
      await hotel.setRoomStatus(A, HA, B701, s);
      seq.push((await prisma.hotelRoom.findUnique({ where: { id: B701 } }))?.hkStatus);
    }
    return [J(seq) === J(["DIRTY", "OUT_OF_ORDER", "CLEAN"]), J(seq)];
  }, "MAJOR");
  await T("B-7", "deleteBuilding: มีห้องผูก ⇒ BUILDING_IN_USE · ว่าง ⇒ ลบได้ · ร้านอื่น ⇒ ปฏิเสธ", ["createBuilding", "deleteBuilding", "updateBuilding"], async () => {
    const a = await fn("deleteBuilding")!(ctxA, { unitId: HA, buildingId: bldA });
    const e = await fn("createBuilding")!(ctxA, { unitId: HA, name: "ตึกว่าง", floors: 1 });
    const u = await fn("updateBuilding")!(ctxA, { unitId: HA, buildingId: e?.id, name: "ตึกว่าง 2", floors: 2 });
    const x = await fn("deleteBuilding")!(ctxB, { unitId: HB, buildingId: e?.id });
    const b = await fn("deleteBuilding")!(ctxA, { unitId: HA, buildingId: e?.id });
    const left = await prisma.roomBuilding.count({ where: { id: { in: [bldA, e?.id ?? "-"] } } });
    return [isFail(a, "BUILDING_IN_USE") && u?.ok === true && x?.ok === false && b?.ok === true && left === 1, `${J(a)} ${J(u)} ${J(x)} ${J(b)} เหลือ=${left}`];
  }, "MAJOR");

  // ═══════════════ V. availability · W. roomBoard ═══════════════
  console.log("\n── V availability · W roomBoard ──");
  let vReady = false;
  if (fn("claimRoom")) {
    try {
      await claim(base(M[102], D(301), D(302), "v-lease"));                         // M102 ไม่ว่าง
      await claim(base(M[103], D(303), D(305), "v-adj"));                           // M103 ติดขอบ = ว่าง
      await prisma.hotelRoom.update({ where: { id: M[104] }, data: { hkStatus: "OUT_OF_ORDER" } }); // M104 ปิดซ่อม
      await rawOcc(M[106], D(300), D(303), "HOLD", "v-exp", { holdExpiresAt: new Date(Date.now() - 60_000) }); // hold หมดเวลา = ว่าง
      await claim(base(M[107], D(300), D(302), "w-stay", "STAY", "HotelReservation"));
      await claim(base(M[108], D(301), D(302), "w-block", "BLOCK", "Maintenance"));
      await claim(base(M[109], D(301), D(302), "w-hold", "HOLD", "QcHold", { holdExpiresAt: new Date(Date.now() + 24 * HOUR) }));
      await claim(base(M[110], D(299), D(301), "w-ended"));                         // จบวัน D(301) = ว่างวันนั้น
      vReady = true;
    } catch (e) { console.log(`  ⚠️ เตรียม V/W ล้ม: ${errMsg(e)}`); }
  }
  const av = (ctx: object, a: Record<string, unknown>) => fn("availability")!(ctx, a);
  const mapOf = (rows: any[]) => new Map((Array.isArray(rows) ? rows : []).map((r) => [r.roomId, r.free]));
  await T("V-1", "availability NIGHTLY: ห้องของหน่วย NIGHTLY|BOTH · ไม่ว่างเมื่อซ้อน · ติดขอบ/hold หมดเวลา = ว่าง · ปิดซ่อม = ไม่ว่าง · ไม่มีห้องปิด/รายเดือน/ร้านอื่น/หน่วยอื่น", ["availability"], async () => {
    if (!vReady) return [false, "เตรียมข้อมูลไม่สำเร็จ"];
    const m = mapOf(await av(ctxA, { unitId: HA, start: D(300), end: D(303), rentMode: "NIGHTLY" }));
    const want: [string, boolean | undefined][] = [[M[101], true], [M[102], false], [M[103], true], [M[104], false], [M[106], true], [B701, true]];
    const absent = [N801, X502, I901, Z101, D101];
    const bad = want.filter(([id, f]) => m.get(id) !== f).map(([id]) => id).concat(absent.filter((id) => m.has(id)));
    return [bad.length === 0, `ผิด ${bad.length} ห้อง · ${J(want.map(([id]) => m.get(id)))} · absent มี=${absent.filter((id) => m.has(id)).length}`];
  });
  await T("V-2", "availability MONTHLY: มีห้อง MONTHLY|BOTH (รวม override ระดับห้อง) · ไม่มีห้อง NIGHTLY", ["availability"], async () => {
    const m = mapOf(await av(ctxA, { unitId: HA, start: D(300), end: D(303), rentMode: "MONTHLY" }));
    return [m.has(N801) && m.has(X502) && m.has(B701) && !m.has(M[101]) && !m.has(X501), `N801=${m.has(N801)} X502=${m.has(X502)} B701=${m.has(B701)} M101=${m.has(M[101])} X501=${m.has(X501)}`];
  });
  await T("V-3", "availability กรอง roomTypeId · ctx ร้านอื่น ⇒ []", ["availability"], async () => {
    const a = await av(ctxA, { unitId: HA, roomTypeId: tMonthly, start: D(300), end: D(303), rentMode: "MONTHLY" });
    const x = await av(ctxB, { unitId: HA, start: D(300), end: D(303), rentMode: "NIGHTLY" });
    return [Array.isArray(a) && a.length === 1 && a[0].roomId === N801 && Array.isArray(x) && x.length === 0, `${J(a)} / ร้านอื่น=${J(x)?.slice(0, 80)}`];
  });
  const board = (ctx: object, a: Record<string, unknown>) => fn("roomBoard")!(ctx, a);
  await T("W-1", "roomBoard: ห้อง active ของหน่วยครบ ห้องละ 1 ช่อง · ไม่มีห้องปิด/ร้านอื่น/หน่วยอื่น", ["roomBoard"], async () => {
    const cells = await board(ctxA, { unitId: HA, date: D(301) });
    const ids = (Array.isArray(cells) ? cells : []).map((c: any) => c.roomId);
    const want = (await prisma.hotelRoom.findMany({ where: { tenantId: A, unitId: HA, active: true }, select: { id: true } })).map((r: any) => r.id).sort();
    return [J([...ids].sort()) === J(want) && !ids.includes(I901), `ได้ ${ids.length} ช่อง · ควร ${want.length} · ซ้ำ=${ids.length !== new Set(ids).size}`];
  });
  await T("W-2", "roomBoard use: LEASE→LEASED · STAY→GUEST · HOLD→HOLD · BLOCK→BLOCKED · ว่าง/จบวันนี้→VACANT · hkStatus จริง · finance=null", ["roomBoard"], async () => {
    if (!vReady) return [false, "เตรียมข้อมูลไม่สำเร็จ"];
    const cells = await board(ctxA, { unitId: HA, date: D(301) });
    const c = new Map((Array.isArray(cells) ? cells : []).map((x: any) => [x.roomId, x]));
    const exp: [string, string][] = [[M[102], "LEASED"], [M[107], "GUEST"], [M[109], "HOLD"], [M[108], "BLOCKED"], [M[101], "VACANT"], [M[110], "VACANT"], [M[103], "VACANT"]];
    const bad = exp.filter(([id, u]) => (c.get(id) as any)?.use !== u).map(([id, u]) => `${u}≠${(c.get(id) as any)?.use}`);
    const hk = (c.get(M[104]) as any)?.hkStatus === "OUT_OF_ORDER";
    const fin = [...c.values()].every((x: any) => x.finance === null);
    const vac = (c.get(M[101]) as any)?.occupancy === null;
    return [bad.length === 0 && hk && fin && vac, `${bad.join(" ") || "use ครบ"} · hk=${hk} finance=${fin} vacant.occupancy=null:${vac}`];
  });
  await T("W-3", "roomBoard occupancy ของช่อง = {occupancyId,kind,refType,refId,startDate,endDate} วันที่เป็น YYYY-MM-DD · ช่องมี number/roomTypeId/rentMode จริง", ["roomBoard"], async () => {
    const cells = await board(ctxA, { unitId: HA, date: D(301) });
    const x = (Array.isArray(cells) ? cells : []).find((y: any) => y.roomId === M[102]);
    const o = x?.occupancy;
    const ok = o && o.kind === "LEASE" && o.refType === "DormLease" && o.refId === "v-lease" && o.startDate === D(301) && o.endDate === D(302) && typeof o.occupancyId === "string"
      && x.number === "M102" && x.roomTypeId === tMain && x.rentMode === "NIGHTLY";
    const b = (Array.isArray(cells) ? cells : []).find((y: any) => y.roomId === B701);
    return [!!ok && b?.rentMode === "BOTH" && b?.buildingId === bldA && b?.floorNo === 3, `${J(x)?.slice(0, 220)} · B701=${b?.rentMode}/${b?.floorNo}`];
  }, "MAJOR");
  await T("W-4", "X1 roomBoard ctx ร้านอื่น ⇒ []", ["roomBoard"], async () => {
    const x = await board(ctxB, { unitId: HA, date: D(301) });
    return [Array.isArray(x) && x.length === 0, J(x)?.slice(0, 120)];
  });

  // ═══════════════ T. 3 ทางพร้อมกัน ═══════════════
  console.log("\n── T จองห้องเดียวจาก 3 ทางพร้อมกัน ──");
  await T("T-1", "สัญญาหอจำลอง + เคาน์เตอร์ + ออนไลน์ ห้อง/ช่วงเดียวกัน พร้อมกัน ⇒ สำเร็จ 1 ทุกรอบ (5 รอบ) · ไม่มี throw · ไม่มีการจองค้าง", ["claimRoom"], async () => {
    const log: string[] = [];
    let good = true;
    for (let k = 0; k < 5; k++) {
      const s = D(400 + 10 * k), e = D(403 + 10 * k);
      const res = await Promise.allSettled([
        claim(base(R201, s, e, `race-lease-${k}`)),
        hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tRace, checkInDate: s, checkOutDate: e, guestName: `เคาน์เตอร์${k}`, createdById: "qc-staff-r08" }),
        hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tRace, checkInDate: s, checkOutDate: e, guestName: `ออนไลน์${k}` }),
      ]);
      const okIdx = res.map((r, i) => (r.status === "fulfilled" && (r.value as any)?.ok === true ? i : -1)).filter((i) => i >= 0);
      const thrown = res.filter((r) => r.status === "rejected").map((r) => errMsg((r as PromiseRejectedResult).reason));
      const occ = await prisma.roomOccupancy.count({ where: { roomId: R201, active: true, startDate: { lt: dbDate(e) }, endDate: { gt: dbDate(s) } } });
      const rv = await prisma.hotelReservation.count({ where: { tenantId: A, roomTypeId: tRace, status: { in: ["BOOKED", "CHECKED_IN"] }, checkInDate: dbDate(s) } });
      const wantRv = okIdx.length === 1 && okIdx[0] > 0 ? 1 : 0;
      const ok = okIdx.length === 1 && thrown.length === 0 && occ === 1 && rv === wantRv;
      if (!ok) good = false;
      log.push(`r${k}: ok=${J(okIdx)} throw=${thrown.length}${thrown[0] ? `(${thrown[0]})` : ""} occ=${occ} rv=${rv}`);
    }
    return [good, log.join(" | ")];
  });
  await T("T-2", "ผู้แพ้ไม่เห็น ref/ชื่อของผู้ชนะ (สัญญาหอ/การจองโรงแรม)", ["claimRoom"], async () => {
    const s = D(460), e = D(462);
    const res = await Promise.allSettled([
      claim(base(R201, s, e, "race-secret-lease")),
      hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tRace, checkInDate: s, checkOutDate: e, guestName: "คุณลับมาก", createdById: "qc-staff-r08" }),
      hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tRace, checkInDate: s, checkOutDate: e, guestName: "คุณลับสุด" }),
    ]);
    const vals = res.map((r) => (r.status === "fulfilled" ? r.value : { thrown: errMsg((r as PromiseRejectedResult).reason) }));
    const winners = vals.filter((v: any) => v?.ok === true);
    const losers = vals.filter((v: any) => v?.ok !== true).map((v) => J(v));
    const secrets = ["race-secret-lease", "คุณลับมาก", "คุณลับสุด", ...winners.map((w: any) => w.id ?? w.occupancyId ?? "-"), ...winners.map((w: any) => w.code ?? "-")].filter((x) => x && x !== "-");
    const leak = losers.filter((l) => secrets.some((sx) => l.includes(sx)));
    return [winners.length === 1 && losers.length === 2 && leak.length === 0, `ชนะ=${winners.length} รั่ว=${leak.length} ${leak[0] ?? ""}`];
  });

  // ═══════════════ P. โรงแรม P1 ═══════════════
  console.log("\n── P โรงแรม P1 เขียน/ปล่อย occupancy ──");
  const hotelOcc = async (rvId: string) => prisma.roomOccupancy.findMany({ where: { tenantId: A, refType: "HotelReservation", refId: rvId } });
  const activeOcc = async (rvId: string) => (await hotelOcc(rvId)).filter((o: any) => o.active);
  let p1 = "", p11 = "";
  await T("P-1", "createReservation ⇒ occupancy STAY · refType HotelReservation · refId=การจอง · ห้องของประเภท · วันตรง · active", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tPair, checkInDate: D(500), checkOutDate: D(502), guestName: "P1" });
    if (r?.ok !== true) return [false, J(r)];
    p1 = r.id;
    const o = await activeOcc(p1);
    const ok = o.length === 1 && o[0].kind === "STAY" && [P401, P402].includes(o[0].roomId) && ymdOf(o[0].startDate) === D(500) && ymdOf(o[0].endDate) === D(502) && o[0].unitId === HA;
    return [ok, `occupancy=${o.length} ${o[0] ? `${o[0].kind}/${ymdOf(o[0].startDate)}→${ymdOf(o[0].endDate)}` : ""}`];
  });
  await T("P-2", "จองที่ 2 ช่วงเดียวกัน (ประเภท 2 ห้อง) ⇒ คนละห้อง", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tPair, checkInDate: D(500), checkOutDate: D(502), guestName: "P2" });
    if (r?.ok !== true) return [false, J(r)];
    p11 = r.id;
    const a = await activeOcc(p1), b = await activeOcc(p11);
    return [a.length === 1 && b.length === 1 && a[0].roomId !== b[0].roomId, `${a[0]?.roomId === b[0]?.roomId ? "ห้องซ้ำ" : "ต่างห้อง"} (${a.length}/${b.length})`];
  });
  await T("P-3", "จองโรงแรมชนห้องที่หอถือ (LEASE) ⇒ ok:false · ไม่มีการจองค้าง · ข้อความไม่บอก ref หอ · ตัวนับว่าง = 0", [], async () => {
    await rawOcc(S301, D(510), D(520), "LEASE", "dorm-p3-secret");
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tSolo, checkInDate: D(512), checkOutDate: D(514), guestName: "ชนหอ" });
    const n = await prisma.hotelReservation.count({ where: { tenantId: A, roomTypeId: tSolo } });
    const pub = await hotel.listPublicAvailability(A, HA, D(512), D(514));
    const freePub = pub.find((x: any) => x.id === tSolo)?.free;
    const av2 = await hotel.availability(A, HA, D(512), D(514));
    const freeAv = (av2.find((x: any) => x.roomTypeId === tSolo)?.days ?? []).map((d: any) => d.free);
    return [r?.ok === false && n === 0 && !J(r).includes("dorm-p3-secret") && freePub === 0 && freeAv.length === 2 && freeAv.every((f: number) => f === 0), `${J(r)} · การจอง=${n} · public free=${freePub} · availability=${J(freeAv)}`];
  });
  await T("P-4", "ช่วงติดขอบสัญญาหอ (เริ่ม = วันจบสัญญา) ⇒ จองโรงแรมได้", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tSolo, checkInDate: D(520), checkOutDate: D(522), guestName: "ติดขอบ" });
    return [r?.ok === true && (r?.id ? (await activeOcc(r.id)).length === 1 : false), J(r)];
  });
  let p5 = "", p5Room = "", p5Other = "";
  await T("P-5", "checkIn เข้าห้องที่หอถือ ⇒ ok:false · ยัง BOOKED · occupancy เดิมไม่ขยับ", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tPair, checkInDate: D(530), checkOutDate: D(532), guestName: "P5" });
    if (r?.ok !== true) return [false, J(r)];
    p5 = r.id;
    const o0 = await activeOcc(p5);
    if (o0.length !== 1) return [false, `occupancy ของการจอง=${o0.length}`];
    p5Room = o0[0].roomId; p5Other = p5Room === P401 ? P402 : P401;
    await rawOcc(p5Other, D(530), D(540), "LEASE", "dorm-p5");
    const ci = await hotel.checkIn(A, HA, p5, p5Other);
    const rv = await prisma.hotelReservation.findUnique({ where: { id: p5 } });
    const o1 = await activeOcc(p5);
    return [ci?.ok === false && rv?.status === "BOOKED" && o1.length === 1 && o1[0].roomId === p5Room, `${J(ci)} status=${rv?.status} occ=${o1.map((o: any) => o.roomId === p5Room)}`];
  });
  await T("P-6", "checkIn ห้องเดิมของ occupancy ⇒ CHECKED_IN · roomId = ห้องนั้น · occupancy active 1", [], async () => {
    if (!p5) return [false, "P-5 ไม่มีการจอง"];
    const ci = await hotel.checkIn(A, HA, p5, p5Room);
    const rv = await prisma.hotelReservation.findUnique({ where: { id: p5 } });
    const o = await activeOcc(p5);
    return [ci?.ok === true && rv?.status === "CHECKED_IN" && rv?.roomId === p5Room && o.length === 1 && o[0].roomId === p5Room, `${J(ci)} ${rv?.status} occ=${o.length}`];
  });
  let p7 = "", p7To = "";
  await T("P-7", "checkIn ห้องว่างอื่นของประเภท ⇒ ย้าย occupancy ไปห้องนั้น (active 1 แถว) · ห้องเดิมว่าง", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tPair, checkInDate: D(550), checkOutDate: D(552), guestName: "P7" });
    if (r?.ok !== true) return [false, J(r)];
    p7 = r.id;
    const from = (await activeOcc(p7))[0]?.roomId;
    p7To = from === P401 ? P402 : P401;
    const ci = await hotel.checkIn(A, HA, p7, p7To);
    const o = await activeOcc(p7);
    const fromBusy = await prisma.roomOccupancy.count({ where: { roomId: from, active: true, startDate: { lt: dbDate(D(552)) }, endDate: { gt: dbDate(D(550)) } } });
    return [ci?.ok === true && o.length === 1 && o[0].roomId === p7To && fromBusy === 0, `${J(ci)} occ=${o.length} ย้าย=${o[0]?.roomId === p7To} ห้องเดิมไม่ว่าง=${fromBusy}`];
  });
  await T("P-8", "cancelReservation ⇒ occupancy ถูกปล่อย (active=false) ใน tx เดียวกับ CANCELLED", [], async () => {
    if (!p1) return [false, "P-1 ไม่มีการจอง"];
    const c = await hotel.cancelReservation(A, HA, p1, "qc");
    const rv = await prisma.hotelReservation.findUnique({ where: { id: p1 } });
    const o = await hotelOcc(p1);
    return [c?.ok === true && rv?.status === "CANCELLED" && o.length >= 1 && o.every((x: any) => x.active === false), `${J(c)} ${rv?.status} occ active=${J(o.map((x: any) => x.active))}`];
  });
  await T("P-9", "checkOut ⇒ occupancy ถูกปล่อย · ห้อง hkStatus DIRTY (+ status CLEANING เดิม)", [], async () => {
    if (!p7) return [false, "P-7 ไม่มีการจอง"];
    const co = await hotel.checkOut(A, HA, p7);
    const o = await hotelOcc(p7);
    const room = await prisma.hotelRoom.findUnique({ where: { id: p7To } });
    return [co?.ok === true && o.length >= 1 && o.every((x: any) => x.active === false) && room?.hkStatus === "DIRTY" && room?.status === "CLEANING", `${J(co)} occ=${J(o.map((x: any) => x.active))} hk=${room?.hkStatus} status=${room?.status}`];
  });
  await T("P-10", "การจองเดิม (ก่อน R0.8 · ไม่มี occupancy) checkIn ⇒ สร้าง occupancy STAY ห้องที่เลือก", [], async () => {
    const rv = await prisma.hotelReservation.create({ data: { tenantId: A, unitId: HA, code: `QC-R08-L-${stamp}`, guestName: "เก่า", roomTypeId: tLegacy, checkInDate: dbDate(D(560)), checkOutDate: dbDate(D(562)), nights: 2, status: "BOOKED" } });
    const ci = await hotel.checkIn(A, HA, rv.id, L601);
    const o = await activeOcc(rv.id);
    return [ci?.ok === true && o.length === 1 && o[0].roomId === L601 && o[0].kind === "STAY" && ymdOf(o[0].startDate) === D(560) && ymdOf(o[0].endDate) === D(562), `${J(ci)} occ=${o.length}`];
  }, "MAJOR");
  await T("P-11", "ห้อง rentMode MONTHLY (override) ไม่ถูกขายรายคืน: ประเภท 2 ห้อง (1 รายเดือน) ⇒ ว่าง 1 · จองที่ 2 ล้ม", [], async () => {
    const pub = await hotel.listPublicAvailability(A, HA, D(570), D(571));
    const free = pub.find((x: any) => x.id === tMixed)?.free;
    const a = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tMixed, checkInDate: D(570), checkOutDate: D(571), guestName: "มิกซ์1" });
    const b = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tMixed, checkInDate: D(570), checkOutDate: D(571), guestName: "มิกซ์2" });
    const o = a?.ok ? await activeOcc(a.id) : [];
    return [free === 1 && a?.ok === true && b?.ok === false && o.length === 1 && o[0].roomId === X501, `free=${free} ${J(a)?.slice(0, 60)} / ${J(b)?.slice(0, 80)} occRoom=X501:${o[0]?.roomId === X501}`];
  }, "MAJOR");
  await T("P-12", "assignableRooms ตัดห้องที่หอถือช่วงซ้อน", [], async () => {
    const r = await hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: tPair, checkInDate: D(580), checkOutDate: D(582), guestName: "P12" });
    if (r?.ok !== true) return [false, J(r)];
    const mine = (await activeOcc(r.id))[0]?.roomId;
    const other = mine === P401 ? P402 : P401;
    await rawOcc(other, D(581), D(590), "LEASE", "dorm-p12");
    const list = (await hotel.assignableRooms(A, HA, r.id)).map((x: any) => x.id);
    return [list.includes(mine) && !list.includes(other), `ได้ ${J(list.map((id: string) => (id === mine ? "ของตัวเอง" : id === other ? "ห้องหอ" : id)))}`];
  }, "MAJOR");

  // ═══════════════ K. backfill ═══════════════
  console.log("\n── K backfill ──");
  const mkRv = (tenantId: string, unitId: string, roomTypeId: string, code: string, s: string, e: string, status: string, roomId: string | null) =>
    prisma.hotelReservation.create({ data: { tenantId, unitId, code: `${code}-${stamp}`, guestName: code, roomTypeId, roomId, checkInDate: dbDate(s), checkOutDate: dbDate(e), nights: 1, status } });
  const k1 = await mkRv(A, HA, tLegacy, "K1", D(600), D(603), "CHECKED_IN", L601);
  const k2 = await mkRv(A, HA, tLegacy, "K2", D(600), D(602), "BOOKED", null);
  const k3 = await mkRv(A, HA, tLegacy, "K3", D(605), D(606), "CANCELLED", L602);
  const todayBkk = new Date(Date.now() + 7 * HOUR).toISOString().slice(0, 10); // วันไทยวันนี้ (F11: ห้ามวันที่ตายตัว)
  const k4 = await mkRv(A, HA, tLegacy, "K4", addDays(todayBkk, -400), addDays(todayBkk, -398), "CHECKED_OUT", L601);
  const k4b = await mkRv(A, HA, tLegacy, "K4B", addDays(todayBkk, -300), addDays(todayBkk, -298), "BOOKED", L601); // อดีตทั้งช่วง (ค้าง BOOKED) ⇒ ข้าม
  await rawOcc(L602, D(610), D(615), "LEASE", "dorm-k5");
  const k5 = await mkRv(A, HA, tLegacy, "K5", D(611), D(612), "BOOKED", L602);
  const kB = await mkRv(B, HB, tTypeB, "KB", D(600), D(601), "BOOKED", Z101);
  const counts = async () => ({
    occ: await prisma.roomOccupancy.count({ where: { tenantId: { in: [A, B] } } }),
    ev: await prisma.outboxEvent.count({ where: { tenantId: { in: [A, B] } } }),
    rvUpd: (await prisma.hotelReservation.findMany({ where: { id: { in: [k1.id, k2.id, k5.id] } }, select: { updatedAt: true, roomId: true } })).map((r: any) => `${r.updatedAt.getTime()}:${r.roomId}`).join(","),
  });
  let dry: any = null;
  await T("K-1", "backfill dryRun ⇒ ไม่เขียนอะไรเลย (occupancy · outbox · การจอง) · รายงาน 3 รายการ (2 สร้าง + 1 ชน)", ["backfillHotelOccupancy"], async () => {
    const c0 = await counts();
    dry = await fn("backfillHotelOccupancy")!({ tenantId: A, dryRun: true });
    const c1 = await counts();
    const n = (dry?.toCreate ?? -1) + (Array.isArray(dry?.conflicts) ? dry.conflicts.length : 0);
    return [J(c0) === J(c1) && n === 3 && dry?.created === 0, `เขียน=${J(c0) !== J(c1)} ${J(dry)}`];
  });
  let applied: any = null;
  await T("K-2", "backfill apply ⇒ created 2 · K1 อยู่ห้องเดิม (L601) · K2 (ไม่มีห้อง) ได้ห้องว่าง L602 · STAY วันตรง", ["backfillHotelOccupancy"], async () => {
    applied = await fn("backfillHotelOccupancy")!({ tenantId: A, dryRun: false });
    const o1 = await activeOcc(k1.id), o2 = await activeOcc(k2.id);
    const ok = applied?.created === 2 && o1.length === 1 && o1[0].roomId === L601 && o1[0].kind === "STAY" && ymdOf(o1[0].endDate) === D(603) && o2.length === 1 && o2[0].roomId === L602 && ymdOf(o2[0].startDate) === D(600);
    return [ok, `${J(applied)} k1=${o1.length}/${o1[0]?.roomId === L601} k2=${o2.length}/${o2[0]?.roomId === L602}`];
  });
  await T("K-3", "backfill ชน (การจองเดิมทับสัญญาหอ) ⇒ อยู่ใน conflicts · ไม่ throw · ไม่สร้าง · สัญญาหอคงเดิม", ["backfillHotelOccupancy"], async () => {
    const inConf = Array.isArray(applied?.conflicts) && applied.conflicts.some((c: any) => c?.reservationId === k5.id);
    const o5 = await activeOcc(k5.id);
    const lease = await prisma.roomOccupancy.findFirst({ where: { tenantId: A, refId: "dorm-k5" } });
    return [inConf && o5.length === 0 && lease?.active === true, `conflicts=${J(applied?.conflicts)} k5 occ=${o5.length} lease=${lease?.active}`];
  });
  await T("K-4", "backfill ข้าม CANCELLED/CHECKED_OUT/อดีตทั้งช่วง", ["backfillHotelOccupancy"], async () => {
    const n = (await Promise.all([k3, k4, k4b].map((k) => hotelOcc(k.id)))).map((x) => x.length);
    return [J(n) === J([0, 0, 0]), J(n)];
  }, "MAJOR");
  await T("K-5", "backfill ซ้ำ ⇒ created 0 (idempotent)", ["backfillHotelOccupancy"], async () => {
    const again = await fn("backfillHotelOccupancy")!({ tenantId: A, dryRun: false });
    return [again?.created === 0, J(again)];
  });
  await T("K-6", "backfill เฉพาะ tenant ที่ระบุ — การจองร้านอื่นไม่ถูกแตะ", ["backfillHotelOccupancy"], async () => {
    const n = await prisma.roomOccupancy.count({ where: { tenantId: B } });
    return [n === 0, `occupancy ร้าน B=${n} (${kB.id.slice(0, 6)})`];
  });

  // ═══════════════ Z. มติหลังผู้ตรวจ 27 ต.ค. (ORACLE-EDIT R0.8-Z) ═══════════════
  console.log("\n── Z มติหลังผู้ตรวจ ──");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const pubFree = async (typeId: string, s: string, e: string) => (await hotel.listPublicAvailability(A, HA, s, e)).find((x: any) => x.id === typeId)?.free;
  const book = (typeId: string, s: string, e: string, name: string): Promise<any> => hotel.createReservation({ tenantId: A, unitId: HA, roomTypeId: typeId, checkInDate: s, checkOutDate: e, guestName: name });
  // Z-1 [BLOCKER]: ห้องที่ถูกจองแล้วถูกปิด/เปลี่ยนเป็นรายเดือน ⇒ การจองเดิมยังนับเป็นภาระของประเภท
  const z1 = async (label: string, setBad: (roomId: string) => Promise<unknown>, needs: string[]) =>
    T(`Z-1${label}`, `[BLOCKER] ประเภท 2 ห้อง · A จองได้ห้อง X · X ถูกตั้ง ${label === "a" ? "OOO (hotel.setRoomStatus)" : label === "b" ? "OUT_OF_ORDER (setHkStatus)" : "MONTHLY (setRoomLayout)"} ⇒ ว่าง 0 · B จองช่วงเดียวกัน ⇒ ล้ม`, needs, async () => {
      const t = await mkType(A, HA, `Z1${label}`);
      await mkRoom(A, HA, t, `Z1${label}-1`); await mkRoom(A, HA, t, `Z1${label}-2`);
      const a = await book(t, D(740), D(742), `Z1${label}A`);
      if (a?.ok !== true) return [false, `A จองไม่ได้ ${J(a)}`];
      const x = (await activeOcc(a.id))[0]?.roomId;
      if (!x) return [false, "A ไม่มี occupancy"];
      await setBad(x);
      const free = await pubFree(t, D(740), D(742));
      const b = await book(t, D(740), D(742), `Z1${label}B`);
      const n = await prisma.hotelReservation.count({ where: { tenantId: A, roomTypeId: t, status: { in: ["BOOKED", "CHECKED_IN"] } } });
      return [free === 0 && b?.ok === false && n === 1, `free=${free} B=${J(b)?.slice(0, 120)} การจอง active=${n}`];
    });
  await z1("a", (x) => hotel.setRoomStatus(A, HA, x, "OOO"), []);
  await z1("b", (x) => fn("setHkStatus")!(ctxA, { unitId: HA, roomId: x, hkStatus: "OUT_OF_ORDER" }), ["setHkStatus"]);
  await z1("c", (x) => fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: x, rentMode: "MONTHLY" }), ["setRoomLayout"]);
  // Z-1d: occupancy ที่ไม่ใช่การจองโรงแรม (LEASE/BLOCK/HOLD ที่ยังไม่หมดเวลา) กินห้องของประเภทต่อคืน
  await T("Z-1d", "ประเภท 4 ห้อง · LEASE/BLOCK/HOLD(ยังไม่หมดเวลา) ถือคนละห้องตลอดช่วง ⇒ ว่าง 1 · จอง 1 ได้ ⇒ ว่าง 0 · จองที่ 2 ล้ม", [], async () => {
    const t = await mkType(A, HA, "Z1d non-hotel", "BOTH");
    const r = [await mkRoom(A, HA, t, "Z1d-1"), await mkRoom(A, HA, t, "Z1d-2"), await mkRoom(A, HA, t, "Z1d-3"), await mkRoom(A, HA, t, "Z1d-4")];
    await rawOcc(r[0], D(744), D(760), "LEASE", "z1d-lease");
    await rawOcc(r[1], D(744), D(747), "BLOCK", "z1d-block");
    await rawOcc(r[2], D(744), D(747), "HOLD", "z1d-hold", { holdExpiresAt: new Date(Date.now() + 3_600_000) });
    const f0 = await pubFree(t, D(745), D(747));
    const a = await book(t, D(745), D(747), "Z1dA");
    const f1 = await pubFree(t, D(745), D(747));
    const b = await book(t, D(745), D(747), "Z1dB");
    const aRoom = a?.ok ? (await activeOcc(a.id))[0]?.roomId : undefined;
    return [f0 === 1 && a?.ok === true && aRoom === r[3] && f1 === 0 && b?.ok === false, `ว่างก่อน=${f0} A=${a?.ok}(${aRoom === r[3] ? "ห้องว่าง" : aRoom ?? "—"}) ว่างหลัง=${f1} B=${J(b)?.slice(0, 120)}`];
  });
  // Z-1e: การจองเก่าที่ยังไม่มีห้อง (ไม่มี occupancy) ยังหักจากตัวนับช่วงวัน
  await T("Z-1e", "ประเภท 2 ห้อง + การจอง BOOKED เก่าไม่มีห้อง/ไม่มี occupancy ซ้อนช่วง ⇒ ว่าง 1 · จอง 1 ได้ · จองที่ 2 ล้ม", [], async () => {
    const t = await mkType(A, HA, "Z1e legacy");
    await mkRoom(A, HA, t, "Z1e-1"); await mkRoom(A, HA, t, "Z1e-2");
    await mkRv(A, HA, t, "Z1E-L", D(746), D(749), "BOOKED", null);
    const f0 = await pubFree(t, D(746), D(748));
    const a = await book(t, D(746), D(748), "Z1eA");
    const b = await book(t, D(747), D(749), "Z1eB");
    return [f0 === 1 && a?.ok === true && b?.ok === false, `ว่าง=${f0} A=${a?.ok} B=${J(b)?.slice(0, 120)}`];
  });

  // Z-2: ตั้งปิดซ่อม/เปลี่ยนโหมดบนห้องที่มี STAY/LEASE อนาคต ⇒ ok + affected (ไม่บล็อก · occupancy ยัง active)
  await T("Z-2", "ปิดซ่อม/รายเดือน/รายคืน บนห้องที่มี STAY/LEASE อนาคต ⇒ ok:true + affected[] มี occupancy ที่กระทบ · occupancy ยัง active", ["setHkStatus", "setRoomLayout", "claimRoom"], async () => {
    const t = await mkType(A, HA, "Z2", "BOTH");
    const r1 = await mkRoom(A, HA, t, "Z2-1"), r2 = await mkRoom(A, HA, t, "Z2-2"), r3 = await mkRoom(A, HA, t, "Z2-3");
    const s1 = await claim(base(r1, D(750), D(752), "z2-stay1", "STAY", "HotelReservation"));
    const s2 = await claim(base(r2, D(750), D(752), "z2-stay2", "STAY", "HotelReservation"));
    const l3 = await claim(base(r3, D(750), D(780), "z2-lease"));
    const a = await fn("setHkStatus")!(ctxA, { unitId: HA, roomId: r1, hkStatus: "OUT_OF_ORDER" });
    const b = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: r2, rentMode: "MONTHLY" });
    const c = await fn("setRoomLayout")!(ctxA, { unitId: HA, roomId: r3, rentMode: "NIGHTLY" });
    const has = (r: any, id: string) => r?.ok === true && Array.isArray(r?.affected) && r.affected.some((x: any) => x?.occupancyId === id && typeof x?.kind === "string" && typeof x?.startDate === "string" && typeof x?.endDate === "string");
    const still = (await prisma.roomOccupancy.findMany({ where: { id: { in: [s1.occupancyId, s2.occupancyId, l3.occupancyId] } } })).every((o: any) => o.active);
    return [has(a, s1.occupancyId) && has(b, s2.occupancyId) && has(c, l3.occupancyId) && still, `hk=${J(a)?.slice(0, 120)} · monthly=${J(b)?.slice(0, 120)} · nightly=${J(c)?.slice(0, 120)} · ยัง active=${still}`];
  }, "MAJOR");
  await T("Z-2b", "hotel.setRoomStatus(OOO) บนห้องที่มีการจอง (STAY) อนาคต ⇒ ok:true + affected มี occupancy นั้น · ยัง active · ตั้ง AVAILABLE ⇒ affected ว่าง", [], async () => {
    const t = await mkType(A, HA, "Z2b");
    await mkRoom(A, HA, t, "Z2b-1");
    const r = await book(t, D(754), D(756), "Z2b");
    if (r?.ok !== true) return [false, `จองไม่ได้ ${J(r)}`];
    const o = (await activeOcc(r.id))[0];
    if (!o) return [false, "ไม่มี occupancy"];
    const a = await hotel.setRoomStatus(A, HA, o.roomId, "OOO");
    const back = await hotel.setRoomStatus(A, HA, o.roomId, "AVAILABLE");
    const still = (await occOf(o.id))?.active === true;
    const hit = a?.ok === true && Array.isArray(a?.affected) && a.affected.some((x: any) => x?.occupancyId === o.id && x?.refId === r.id);
    return [hit && still && back?.ok === true && Array.isArray(back?.affected) && back.affected.length === 0, `OOO=${J(a)?.slice(0, 160)} · AVAILABLE=${J(back)?.slice(0, 80)} · active=${still}`];
  }, "MAJOR");

  // Z-4: ตัวนับแบบช่วง = ห้องที่ว่างตลอดช่วง (ห้องแตกช่วง P/Q/R)
  const FRAG_MSG = "ไม่มีห้องเดียวที่ว่างตลอดช่วง ลองเลื่อนวัน";
  let tFrag = "";
  await T("Z-4", "ห้องแตกช่วง (P ไม่ว่างคืน 1 · Q คืน 2 · R คืน 3) ⇒ listPublicAvailability free=0 · createReservation ล้มด้วยข้อความ \"ไม่มีห้องเดียวที่ว่างตลอดช่วง ลองเลื่อนวัน\" · จอง 1 คืนได้", [], async () => {
    tFrag = await mkType(A, HA, "Z4 แตกช่วง");
    const p = await mkRoom(A, HA, tFrag, "Z4-P"), q = await mkRoom(A, HA, tFrag, "Z4-Q"), r = await mkRoom(A, HA, tFrag, "Z4-R");
    await rawOcc(p, D(770), D(771), "LEASE", "z4-p"); await rawOcc(q, D(771), D(772), "LEASE", "z4-q"); await rawOcc(r, D(772), D(773), "LEASE", "z4-r");
    const free = await pubFree(tFrag, D(770), D(773));
    const res = await book(tFrag, D(770), D(773), "แตกช่วง");
    const n = await prisma.hotelReservation.count({ where: { tenantId: A, roomTypeId: tFrag } });
    const one = await book(tFrag, D(770), D(771), "คืนเดียว");
    return [free === 0 && res?.ok === false && res?.reason === FRAG_MSG && n === 0 && one?.ok === true, `free=${free} ${J(res)} การจองค้าง=${n} 1คืน=${one?.ok}`];
  });

  // Z-5: best-fit
  await T("Z-5", "เลือกห้อง best-fit: ห้องที่ช่องว่างพอดีกับช่วงที่สุดถูกเลือกก่อน (แม้เลขห้องมาทีหลัง)", [], async () => {
    const t = await mkType(A, HA, "Z5 bestfit");
    const wide = await mkRoom(A, HA, t, "Z5-1"), fit = await mkRoom(A, HA, t, "Z5-2");
    await rawOcc(fit, D(780), D(790), "LEASE", "z5-before"); await rawOcc(fit, D(792), D(800), "LEASE", "z5-after");
    const r = await book(t, D(790), D(792), "bestfit");
    const o = r?.ok ? await activeOcc(r.id) : [];
    return [r?.ok === true && o.length === 1 && o[0].roomId === fit, `${J(r)?.slice(0, 80)} ห้อง=${o[0]?.roomId === fit ? "พอดี" : o[0]?.roomId === wide ? "ว่างยาว" : "—"}`];
  }, "MAJOR");

  // Z-6: backfill dry-run ไม่ถือล็อก HotelRoomType
  await T("Z-6", "backfill dryRun ไม่ล็อก HotelRoomType (มีอีก tx ถือ FOR UPDATE อยู่ ⇒ dry-run จบได้ ไม่รอ ไม่ throw)", ["backfillHotelOccupancy"], async () => {
    await mkRv(A, HA, tLegacy, "Z6", D(650), D(652), "BOOKED", null);
    let release: () => void = () => {};
    let locked: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const isLocked = new Promise<void>((r) => { locked = r; });
    const holder = prisma.$transaction(async (t: any) => { await t.$queryRawUnsafe(`SELECT id FROM "HotelRoomType" WHERE id = $1 FOR UPDATE`, tLegacy); locked(); await gate; });
    await isLocked;
    const dryP = fn("backfillHotelOccupancy")!({ tenantId: A, dryRun: true });
    const first = await Promise.race([dryP.then((v: unknown) => ({ v }), (e: unknown) => ({ e })), sleep(8000).then(() => "TIMEOUT" as const)]);
    release();
    await holder.catch(() => {});
    await Promise.resolve(dryP).catch(() => {});
    return [first !== "TIMEOUT" && !(first as any).e, first === "TIMEOUT" ? "dry-run รอล็อก > 8 วิ" : J(first).slice(0, 160)];
  }, "MAJOR");

  // Z-7: expireHolds 300 แถว
  await T("Z-7", "expireHolds: hold หมดเวลา 300 แถวพร้อมกัน ⇒ ปิดครบในการเรียกครั้งเดียว · event 300 · ไม่ throw", ["expireHolds"], async () => {
    const room = await mkRoom(A, HA, tMain, "Z7-EH");
    const past = new Date(Date.now() - 60_000);
    await prisma.roomOccupancy.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ tenantId: A, unitId: HA, roomId: room, startDate: dbDate(D(1000 + i)), endDate: dbDate(D(1001 + i)), kind: i % 2 ? "CHANNEL_HOLD" : "HOLD", refType: "QcRaw", refId: `z7-${i}`, holdExpiresAt: past })) });
    const e0 = (await events(room)).length;
    const r = await fn("expireHolds")!(new Date());
    const left = await prisma.roomOccupancy.count({ where: { roomId: room, active: true } });
    const e1 = (await events(room)).length;
    return [left === 0 && e1 - e0 === 300, `${J(r)} ยัง active=${left} event +${e1 - e0}`];
  }, "MAJOR");

  // Z-8: requireRentMode + OUT_OF_ORDER
  await T("Z-8", "claimRoom requireRentMode: ห้องผิดโหมด ⇒ RENT_MODE_MISMATCH · ตรง/BOTH ⇒ ok · LEASE/STAY บนห้อง OUT_OF_ORDER ⇒ ROOM_INACTIVE · BLOCK บน OUT_OF_ORDER ได้", ["claimRoom"], async () => {
    const a = await claim(base(M[101], D(900), D(930), "z8a", "LEASE", "DormLease", { requireRentMode: "MONTHLY" }));     // NIGHTLY
    const b = await claim(base(N801, D(900), D(930), "z8b", "LEASE", "DormLease", { requireRentMode: "MONTHLY" }));      // MONTHLY
    const c = await claim(base(R201, D(900), D(902), "z8c", "STAY", "HotelReservation", { requireRentMode: "NIGHTLY" })); // BOTH
    const d = await claim(base(N801, D(940), D(942), "z8d", "STAY", "HotelReservation", { requireRentMode: "NIGHTLY" }));
    const e = await claim(base(M[104], D(900), D(930), "z8e"));                                                         // M104 OUT_OF_ORDER (เตรียมใน V)
    const f = await claim(base(M[104], D(931), D(932), "z8f", "STAY", "HotelReservation"));
    const g = await claim(base(M[104], D(933), D(934), "z8g", "BLOCK", "Maintenance"));
    const hk = (await prisma.hotelRoom.findUnique({ where: { id: M[104] } }))?.hkStatus;
    return [hk === "OUT_OF_ORDER" && isFail(a, "RENT_MODE_MISMATCH") && b?.ok === true && c?.ok === true && isFail(d, "RENT_MODE_MISMATCH") && isFail(e, "ROOM_INACTIVE") && isFail(f, "ROOM_INACTIVE") && g?.ok === true,
      `hk=${hk} a=${a?.code ?? a?.ok} b=${b?.code ?? b?.ok} c=${c?.code ?? c?.ok} d=${d?.code ?? d?.ok} e=${e?.code ?? e?.ok} f=${f?.code ?? f?.ok} g=${g?.code ?? g?.ok}`];
  }, "MAJOR");

  // Z-8b/c: SAVEPOINT ต้องถูกปล่อยหลังย้อน (ชนซ้ำหลายครั้งใน tx เดียว)
  await T("Z-8b", "ใน tx เดียว ชน ROOM_TAKEN 70 ครั้ง แล้ว claim ห้องว่าง ⇒ ok · commit แล้วแถวอยู่ · แถวที่ชนไม่รั่ว", ["claimRoom"], async () => {
    const room = await mkRoom(A, HA, tMain, "Z8B");
    await rawOcc(room, D(1400), D(1410), "BLOCK", "z8b-wall");
    const out = await prisma.$transaction(async (t: any) => {
      let lost = 0;
      for (let i = 0; i < 70; i++) { const r = await fn("claimRoom")!(t, base(room, D(1401), D(1402), `z8b-x${i}`, "BLOCK", "Maintenance")); if (isFail(r, "ROOM_TAKEN")) lost++; }
      const ok = await fn("claimRoom")!(t, base(room, D(1420), D(1421), "z8b-ok", "BLOCK", "Maintenance"));
      return { lost, ok };
    }, { timeout: 60_000, maxWait: 10_000 });
    const rows = await prisma.roomOccupancy.findMany({ where: { roomId: room, refId: { startsWith: "z8b-" } } });
    const leaked = rows.filter((r: any) => r.refId.startsWith("z8b-x")).length;
    return [out.lost === 70 && out.ok?.ok === true && rows.some((r: any) => r.refId === "z8b-ok" && r.active) && leaked === 0, `ชน=${out.lost} ok=${out.ok?.ok} รั่ว=${leaked}`];
  }, "MAJOR");
  {
    const src = read("src/lib/modules/rooms/occupancy.ts");
    const i = src.indexOf("ROLLBACK TO SAVEPOINT");
    const good = i >= 0 && /RELEASE SAVEPOINT/.test(src.slice(i, i + 300));
    if (good) pass("Z-8c", "ROLLBACK TO SAVEPOINT ตามด้วย RELEASE SAVEPOINT (ไม่ค้างซ้อนใน tx ผู้เรียก)");
    else fail("Z-8c", "ROLLBACK TO SAVEPOINT ตามด้วย RELEASE SAVEPOINT", i < 0 ? "ไม่พบ ROLLBACK TO SAVEPOINT" : "ไม่พบ RELEASE หลัง ROLLBACK TO", "MINOR");
  }

  // Z-9: แข่งหนัก 30 ทาง ประเภท 3 ห้อง
  await T("Z-9", "createReservation แข่ง 30 ทาง ประเภท 3 ห้อง ⇒ ไม่มี throw (P2028 แปลงเป็น ok:false) · สำเร็จ 1..3 · การจอง/occupancy active = จำนวนสำเร็จ", [], async () => {
    const t = await mkType(A, HA, "Z9 แข่งหนัก");
    for (let i = 1; i <= 3; i++) await mkRoom(A, HA, t, `Z9-${i}`);
    const res = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => book(t, D(950), D(952), `แข่ง${i}`)));
    const ok = res.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok === true).length;
    const lose = res.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok === false).length;
    const thrown = res.filter((r) => r.status === "rejected").map((r) => errMsg((r as PromiseRejectedResult).reason));
    const rv = await prisma.hotelReservation.count({ where: { tenantId: A, roomTypeId: t, status: { in: ["BOOKED", "CHECKED_IN"] } } });
    const rooms3 = (await prisma.hotelRoom.findMany({ where: { roomTypeId: t }, select: { id: true } })).map((x: any) => x.id);
    const occ = await prisma.roomOccupancy.count({ where: { roomId: { in: rooms3 }, active: true } });
    return [thrown.length === 0 && ok >= 1 && ok <= 3 && ok + lose === 30 && rv === ok && occ === ok, `ok=${ok} แพ้=${lose} throw=${thrown.length} ${thrown[0] ?? ""} การจอง=${rv} occ=${occ}`];
  });

  // Z-3: checkOut ปล่อยห้องหลัง POS สำเร็จเท่านั้น (ทำท้ายสุด: ผูก POS กับหน่วย HA)
  await T("Z-3", "checkOut + POS ล้ม (SHIFT_REQUIRED) ⇒ ยัง CHECKED_IN · occupancy ไม่เคยถูกปล่อย (แถวไม่ถูกแตะ · ไม่มี event)", [], async () => {
    const sys = (await import("@/lib/modules/system/service" as string)) as any;
    const pos = await sys.createSystem(A, "POS", "ขาย R08");
    await sys.linkUnit(A, pos.id, HA);
    await prisma.appSystem.update({ where: { id: pos.id }, data: { settings: { pos: { shift: { required: { register: false, otherSources: true } } } } } });
    const t = await mkType(A, HA, "Z3 POS");
    const room = await mkRoom(A, HA, t, "Z3-1");
    const r = await book(t, D(960), D(962), "Z3");
    if (r?.ok !== true) return [false, `จองไม่ได้ ${J(r)}`];
    const ci = await hotel.checkIn(A, HA, r.id, room);
    if (ci?.ok !== true) return [false, `เช็คอินไม่ได้ ${J(ci)}`];
    const o0 = (await activeOcc(r.id))[0];
    const e0 = (await events(room)).length;
    let outcome = "";
    try { outcome = J(await hotel.checkOut(A, HA, r.id)); } catch (e) { outcome = `throw ${errMsg(e)}`; }
    const rv = await prisma.hotelReservation.findUnique({ where: { id: r.id } });
    const o1 = o0 ? await occOf(o0.id) : null;
    const e1 = (await events(room)).length;
    const untouched = !!o0 && !!o1 && o1.active === true && o1.updatedAt.getTime() === o0.updatedAt.getTime();
    return [rv?.status === "CHECKED_IN" && untouched && e1 === e0, `checkOut=${outcome.slice(0, 120)} · status=${rv?.status} · occupancy ไม่ถูกแตะ=${untouched} · event +${e1 - e0}`];
  }, "CRITICAL");

  // ═══════════════ G. regression ═══════════════
  console.log("\n── G regression (ลูกโพรเซส · env เดียวกัน) ──");
  for (const [id, f] of [["G-1", "qc-hotel-money"], ["G-2", "qc-hotel-public"], ["G-3", "qc-hotel-refund"]] as const) {
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${f}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const summ = (out.match(/ผ่าน \d+\/\d+/) ?? [""])[0];
    if (r.status === 0) pass(id, `regression ${f} เขียว (${summ})`);
    else fail(id, `regression ${f} เขียว`, `exit=${r.status} ${summ} · ${out.split("\n").filter((l) => l.includes("❌")).slice(0, 3).join(" | ").slice(0, 300)}`, "CRITICAL");
  }
  {
    const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "RoomOccupancy" o WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = o."tenantId")`) as { n: number }[];
    const n = rows[0]?.n ?? -1;
    if (n === 0) pass("G-4", "ไม่มี RoomOccupancy กำพร้า (tenant ถูกลบแต่ occupancy ค้าง) หลังรัน regression");
    else fail("G-4", "ไม่มี RoomOccupancy กำพร้า หลังรัน regression", `กำพร้า ${n} แถว (สคริปต์ล้างลบห้อง/occupancy ไม่ครบ)`, "MAJOR");
  }
} catch (e) {
  fail("CRASH", "จบกลางทาง", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? await prisma.tenant.count({ where: { id: { in: tenantIds } } }) : 0;
    const occLeft = tenantIds.length ? await prisma.roomOccupancy.count({ where: { tenantId: { in: tenantIds } } }) : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left} · occupancy ค้าง ${occLeft})`);
  } catch { /* ฐานหลุด */ }
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC R0.8 · แกนห้อง + RoomOccupancy =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
