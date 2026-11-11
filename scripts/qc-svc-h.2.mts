// QC — SVC H.2 · ปฏิทินห้อง (tape chart) · ลากย้ายห้อง/ยืดคืน · ปิดห้อง (BLOCK) · สัญญาหอบนแกนเดียว · อัตราเข้าพักรายคืน · KPI หน้าเคาน์เตอร์ (ภาพ 08)
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.2.md (§0 หลัก · §1 ไฟล์ · §2 มติ 9 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 ฉาก · §6 เกณฑ์รับ/G/X)
//        ยืนบน H.3: ledger/svc-briefs/svc-brief-h.3.md §3 (createBooking · takeBookingDeposit · assignRoom · extendBooking/shortenBooking · hotelAvailability.get · มติ 13 นาฬิกา `at` ใต้ SVC_QC_CLOCK=1)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.0 / H.1" + "SVC H.3 / H.2" (SQC_HOTEL_ROOMS 14 ห้อง · SQC_HOTEL_TAPE_SCENE expectToday/expectBars7d · SQC_VISUAL_SPECS["h.2"] · ผู้ใช้ frontdesk/maid)
//        แบบ: ledger/design-dorm/08-hotel-tape.body.html (คำอธิบายแถบ 6 แบบ · KPI 5 การ์ด · แถวอัตราเข้าพัก "ไม่นับรายเดือน/ซ่อม")
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฟิกซ์เจอร์สอดคล้อง (14 ห้อง · ประเภท 4/7+B205/2) · expectToday/expectBars7d คำนวณได้จากรายการฉากด้วยตัวอ้างอิง · ฉากไม่จองซ้อนห้องเดียวกัน · maid/frontdesk · ฐาน l3 · ภาพ --list
//   TC tapeChart (ร้านชั่วคราว svc-h2-* · การจองจริงผ่าน API ของ H.3): โครงผล · แถบ 6 แบบเทียบตัวอ้างอิงจากแถวในฐาน · from/to = วันเข้า/วันออกจริง (แถบจบกลางวันเช็กเอาต์ ⇒ แถบที่ checkOut = วันแรกของกริดยังแสดง) ·
//      หัวกลุ่มประเภท + ราคาวันนี้/เสาร์อาทิตย์จาก H.1 · แถว "ยังไม่กำหนดห้อง" · days 7/14/เดือน · ≤ 6 คิวรี
//   OC อัตราเข้าพักรายคืน occupied/sellable (HOLD counted นับ · ไม่นับ BLOCK/LEASE ใน sellable) · TD hotelToday KPI 5 ค่า + ชื่อ 2 คนแรก + ADR จาก nights.priceSatang
//   BL blockRoom/releaseBlock/listBlocks (ROOM_TAKEN+conflicts · INVALID_RANGE · OUT_OF_ORDER เมื่อครอบวันนี้ · คืน DIRTY · reason ลง HousekeepingLog+AuditLog · เตือนเกินจอง)
//   MV ย้าย/เลื่อน/ยืด (tx เดียว · ล้มเด้งกลับ · CHECKED_IN เลื่อนวันเข้าไม่ได้ · ย่นต่ำกว่าคืนที่ post แล้วไม่ได้) · X (X1 · X4 · X9 · X10) · P perf (100 ห้อง × 31 วัน < 1 วิ · availability 100 × 365 < 200 ms)
//   U UI สถิต · F ไฟล์ที่แตะ (accept-time) · Q ฉาก svcqc (SQC_HOTEL_TAPE_SCENE) · V ภาพ (QC_BASE) · Z ล้าง · G regression (--no-regression = SKIP)
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · TC/OC/TD/BL/MV/X/P/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/tape.ts" / "ยังไม่มี … booking.ts (H.3)" · Q/V/G SKIP · ร้านชั่วคราว `svc-h2-*` ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 นับคิวรี: ตั้ง globalThis.prisma = PrismaClient ที่ดัก $on("query") ก่อนโหลด @/lib/core/db (แบบ h.1)
// 🔴 นาฬิกาฉาก: ข้อสอบตั้ง SVC_QC_CLOCK=1 ในโปรเซสของตัวเองก่อนโหลดโมดูล เพื่อสร้างการจองอดีต (`at`) ผ่าน createBooking ตามมติ h.3 ข้อ 13 — ไม่แก้แถวตรง
// 🔴 ตัวอ้างอิง (reference): แถบ/อัตราเข้าพัก/KPI คำนวณจากแถว HotelReservation · HotelBookingNight · RoomOccupancy · HotelRoom ในฐาน แล้วเทียบผล tapeChart/hotelToday
//    กติกาอ้างอิง (ผู้เขียนข้อสอบตัดสิน · ผู้คุม ORACLE-EDIT ได้): kind = CHECKED_IN→STAY · HOLD→HOLD · CONFIRMED+source OTA→OTA · CONFIRMED→CONFIRMED · BLOCK/LEASE จาก RoomOccupancy
//    แถบการจองแสดงเมื่อ checkIn < to && checkOut >= from (ครึ่งวันเช็กเอาต์) · BLOCK/LEASE เมื่อ start < to && end > from · แถวห้อง = ห้อง active ที่ขายรายคืนได้ (NIGHTLY/BOTH · มติ 1)
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.2.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_TYPES, SQC_HOTEL_ROOMS, SQC_HOTEL_BUILDING, SQC_HOTEL_TAPE_SCENE, SQC_HOTEL_BOOKING_SCENE, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.2";
const SUITE = "qc-svc-h.2";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H2_NO_REGRESSION === "1";
const SLUG = "svc-h2-";
const MAIL = "svc-h2-";
const F = {
  tape: "src/lib/modules/hotel/tape.ts",
  block: "src/lib/modules/hotel/block.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  avail: "src/lib/modules/hotel/availability.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  service: "src/lib/modules/hotel/service.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  tapeChart: "src/components/hotel/TapeChart.tsx",
  tapeBar: "src/components/hotel/TapeBar.tsx",
  tapeKpis: "src/components/hotel/TapeKpis.tsx",
  blockDialog: "src/components/hotel/BlockDialog.tsx",
  moveDialog: "src/components/hotel/MoveConfirmDialog.tsx",
  tapeShared: "src/components/hotel/tape-shared.ts",
  hotelToday: "src/components/hotel/HotelToday.tsx",
  tabsShared: "src/components/hotel/hotel-tabs-shared.ts",
  calendarPage: "src/app/app/u/[unitSlug]/hotel/calendar/page.tsx",
  hotelPage: "src/app/app/u/[unitSlug]/hotel/page.tsx",
  scene: "scripts/svc-qc-hotel-tape-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sds: "docs/sds/modules/hotel.md",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก (มติ h.3 ข้อ 13) — เฉพาะโปรเซสข้อสอบ · ใช้สร้างการจองอดีตผ่าน createBooking({at})
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ ตัวช่วย harness (แบบ h.1) ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 300) ?? String(v); } catch { return String(v); } };
const J = (v: unknown): string => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const ok = (cond: unknown, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", e instanceof AssertFail ? e.message : `throw: ${errMsg(e)}`, sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const read = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const has = (rel: string) => existsSync(join(ROOT, rel));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const loadIf = async (rel: string) => (has(rel) ? tryImport(pathToFileURL(join(ROOT, rel)).href) : { mod: null, err: `ยังไม่มีไฟล์ «${rel}»` });
const fnOf = (load: { mod: Any; err: string }, name: string, rel: string): ((...a: Any[]) => Any) => {
  const f = load.mod?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f;
};
const valOf = (load: { mod: Any; err: string }, name: string, rel: string): Any => {
  const v = load.mod?.[name];
  if (v === undefined) throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return v;
};
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
/** วันในสัปดาห์ (0=อาทิตย์) · pure · ไม่ใช้ getDay */
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const atIso = (ymd: string, hhmm: string) => `${ymd}T${hhmm}:00+07:00`;
const daysInMonthOf = (ymd: string) => { const [y, m] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const walkKeys = (v: Any, keys: Set<string>) => { if (v instanceof Set || v instanceof Date) return; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } };

// ═══════════════ ตัวอ้างอิง (pure) — จากรายการฉาก และจากแถวในฐาน ═══════════════
type BarKind = "STAY" | "CONFIRMED" | "HOLD" | "OTA" | "BLOCK" | "LEASE";
const ACTIVE_RV = new Set(["HOLD", "CONFIRMED", "CHECKED_IN"]);
const kindOfRv = (status: string, source: string): BarKind | null => (status === "CHECKED_IN" ? "STAY" : status === "HOLD" ? "HOLD" : status === "CONFIRMED" ? (source === "OTA" ? "OTA" : "CONFIRMED") : null);
/** แถบการจองอยู่ในกริด [from, from+days) เมื่อ checkIn < to และ checkOut >= from (ครึ่งวันเช็กเอาต์ยังแสดง) */
const rvInGrid = (checkIn: string, checkOut: string, from: string, days: number) => checkIn < addDays(from, days) && checkOut >= from;
/** BLOCK/LEASE (ช่วงปลายไม่รวม) อยู่ในกริดเมื่อ start < to และ end > from */
const occInGrid = (start: string, end: string, from: string, days: number) => start < addDays(from, days) && end > from;
const covers = (start: string, end: string, d: string) => start <= d && d < end;
const sellsNightly = (roomRentMode: string | null | undefined, typeRentMode: string) => { const m = roomRentMode ?? typeRentMode; return m === "NIGHTLY" || m === "BOTH"; };

type SceneRow = (typeof SQC_HOTEL_TAPE_SCENE.bookings)[number];
const SCENE = SQC_HOTEL_TAPE_SCENE;
const TYPE_BY_NAME: Record<string, { id: string; name: string }> = Object.fromEntries(Object.values(SQC_HOTEL_TYPES).map((t) => [t.name, { id: t.id, name: t.name }]));
/** ตัวอ้างอิงจากรายการฉาก: นับแถบ 7 วัน + ตัวเลขวันนี้ (oracle ของ oracle) */
const refSceneBars7d = (today: string): Record<string, number> => {
  const out: Record<string, number> = { STAY: 0, CONFIRMED: 0, OTA: 0, HOLD: 0, BLOCK: 0 };
  for (const b of SCENE.bookings as readonly SceneRow[]) {
    const ci = addDays(today, b.checkInOffset), co = addDays(ci, b.nights);
    const k = kindOfRv(b.status, b.source);
    if (!k || !rvInGrid(ci, co, today, 7)) continue;
    out[k] += b.rooms;
  }
  for (const bl of SCENE.blocks) { const s = addDays(today, bl.fromOffset), e = addDays(s, bl.nights); if (occInGrid(s, e, today, 7)) out.BLOCK++; }
  return out;
};
const refSceneToday = (today: string) => {
  const rows = SCENE.bookings as readonly SceneRow[];
  const span = (b: SceneRow) => { const ci = addDays(today, b.checkInOffset); return { ci, co: addDays(ci, b.nights) }; };
  const arrivals = rows.filter((b) => b.status === "CONFIRMED" && span(b).ci === today);
  const departures = rows.filter((b) => b.status === "CHECKED_IN" && span(b).co === today);
  const inHouse = rows.filter((b) => (b.status === "CHECKED_IN" || b.status === "CONFIRMED") && covers(span(b).ci, span(b).co, today)).reduce((n, b) => n + b.rooms, 0);
  const holdTonight = rows.filter((b) => b.status === "HOLD" && covers(span(b).ci, span(b).co, today)).reduce((n, b) => n + b.rooms, 0);
  const blocked = SCENE.blocks.filter((bl) => covers(addDays(today, bl.fromOffset), addDays(today, bl.fromOffset + bl.nights), today)).length;
  const nightly = SQC_HOTEL_ROOMS.filter((r) => sellsNightly(r.rentMode, "NIGHTLY")).length;
  return { arrivals: arrivals.reduce((n, b) => n + b.rooms, 0), departures: departures.reduce((n, b) => n + b.rooms, 0), inHouseTonight: inHouse, occupiedBarTonight: inHouse + holdTonight, blocked, sellable: nightly - blocked, arrivalNames: arrivals.map((b) => b.guest), departureNames: departures.map((b) => b.guest) };
};

/** แถวในฐานที่ตัวอ้างอิงใช้ (ร้านชั่วคราว/ฉาก svcqc) */
type DbRoom = { id: string; number: string; roomTypeId: string; buildingId: string | null; floorNo: number | null; rentMode: string | null; hkStatus: string; active: boolean; roomType: { rentMode: string; name: string; sortOrder: number }; building: { sortOrder: number } | null };
type DbRv = { id: string; code: string; status: string; source: string; roomId: string | null; roomTypeId: string; checkInDate: Date; checkOutDate: Date; guestName: string; holdExpiresAt: Date | null };
type DbNight = { reservationId: string; roomId: string | null; roomTypeId: string; date: Date; counted: boolean; priceSatang: number };
type DbOcc = { id: string; roomId: string; kind: string; refType: string; refId: string; startDate: Date; endDate: Date; active: boolean; holdExpiresAt: Date | null };
type Snap = { rooms: DbRoom[]; rvs: DbRv[]; nights: DbNight[]; occ: DbOcc[] };
type RefBar = { kind: BarKind; refId: string; from: string; to: string };
const roomSort = (a: DbRoom, b: DbRoom) => (a.building?.sortOrder ?? 0) - (b.building?.sortOrder ?? 0) || (a.floorNo ?? 0) - (b.floorNo ?? 0) || a.number.localeCompare(b.number, "th", { numeric: true });
/** ห้องที่เป็นแถวของ tape chart (มติ 1: active · ขายรายคืนได้ NIGHTLY/BOTH) */
const tapeRooms = (s: Snap) => s.rooms.filter((r) => r.active && sellsNightly(r.rentMode, r.roomType.rentMode)).sort(roomSort);
const refBarsOfRoom = (s: Snap, roomId: string, from: string, days: number): RefBar[] => {
  const out: RefBar[] = [];
  for (const rv of s.rvs) { const k = kindOfRv(rv.status, rv.source); const ci = ymdOfDb(rv.checkInDate)!, co = ymdOfDb(rv.checkOutDate)!; if (k && rv.roomId === roomId && rvInGrid(ci, co, from, days)) out.push({ kind: k, refId: rv.id, from: ci, to: co }); }
  const now = Date.now();
  for (const o of s.occ) { const sd = ymdOfDb(o.startDate)!, ed = ymdOfDb(o.endDate)!; if (o.active && o.roomId === roomId && (o.kind === "BLOCK" || o.kind === "LEASE") && occInGrid(sd, ed, from, days) && !(o.holdExpiresAt && o.holdExpiresAt.getTime() <= now)) out.push({ kind: o.kind as BarKind, refId: o.refId, from: sd, to: ed }); }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.refId.localeCompare(b.refId)));
};
const refUnassigned = (s: Snap, roomTypeId: string, from: string, days: number): RefBar[] =>
  s.rvs.filter((rv) => rv.roomId === null && rv.roomTypeId === roomTypeId && ACTIVE_RV.has(rv.status) && rvInGrid(ymdOfDb(rv.checkInDate)!, ymdOfDb(rv.checkOutDate)!, from, days)).map((rv) => ({ kind: kindOfRv(rv.status, rv.source)!, refId: rv.id, from: ymdOfDb(rv.checkInDate)!, to: ymdOfDb(rv.checkOutDate)! })).sort((a, b) => a.refId.localeCompare(b.refId));
/** อัตราเข้าพักรายคืน (มติ 4): sellable = ห้องขายรายคืนได้ − BLOCK − LEASE ที่ครอบวัน · occupied = nights.counted ของการจอง active (มีห้องหรือไม่ก็นับ) */
const refOccupancyDay = (s: Snap, d: string) => {
  const rooms = tapeRooms(s);
  const blockedOrLeased = new Set(s.occ.filter((o) => o.active && (o.kind === "BLOCK" || o.kind === "LEASE") && covers(ymdOfDb(o.startDate)!, ymdOfDb(o.endDate)!, d)).map((o) => o.roomId));
  const sellable = rooms.filter((r) => !blockedOrLeased.has(r.id)).length;
  const active = new Set(s.rvs.filter((rv) => ACTIVE_RV.has(rv.status)).map((rv) => rv.id));
  const occupied = s.nights.filter((n) => n.counted && ymdOfDb(n.date) === d && active.has(n.reservationId)).length;
  return { date: d, occupied, sellable };
};
/** KPI หน้าเคาน์เตอร์ (มติ 5): สัปดาห์ = 7 วันนับจากวันนี้ · ADR = Σ priceSatang ของ nights.counted (การจอง active) ในสัปดาห์ ÷ จำนวนคืน (ปัดลง) */
const refToday = (s: Snap, today: string) => {
  const span = (rv: DbRv) => ({ ci: ymdOfDb(rv.checkInDate)!, co: ymdOfDb(rv.checkOutDate)! });
  const arrivals = s.rvs.filter((rv) => rv.status === "CONFIRMED" && span(rv).ci === today);
  const departures = s.rvs.filter((rv) => rv.status === "CHECKED_IN" && span(rv).co === today);
  const inHouse = s.rvs.filter((rv) => (rv.status === "CHECKED_IN" || rv.status === "CONFIRMED") && covers(span(rv).ci, span(rv).co, today)).length;
  const rooms = tapeRooms(s);
  const blocked = new Set(s.occ.filter((o) => o.active && o.kind === "BLOCK" && covers(ymdOfDb(o.startDate)!, ymdOfDb(o.endDate)!, today)).map((o) => o.roomId)).size;
  const leased = new Set(s.occ.filter((o) => o.active && o.kind === "LEASE" && covers(ymdOfDb(o.startDate)!, ymdOfDb(o.endDate)!, today)).map((o) => o.roomId)).size;
  const hkDirty = rooms.filter((r) => r.hkStatus === "DIRTY").length;
  const week = Array.from({ length: 7 }, (_, i) => refOccupancyDay(s, addDays(today, i)));
  const occ = week.reduce((n, d) => n + d.occupied, 0), sell = week.reduce((n, d) => n + d.sellable, 0);
  const active = new Set(s.rvs.filter((rv) => ACTIVE_RV.has(rv.status)).map((rv) => rv.id));
  const wk = s.nights.filter((n) => n.counted && active.has(n.reservationId) && ymdOfDb(n.date)! >= today && ymdOfDb(n.date)! < addDays(today, 7));
  return {
    arrivals: arrivals.length, departures: departures.length, inHouse, sellable: rooms.length - blocked - leased, blocked, leased, hkDirty,
    weekOccBps: sell ? Math.round((occ * 10_000) / sell) : 0,
    adrSatang: wk.length ? Math.floor(wk.reduce((n, x) => n + x.priceSatang, 0) / wk.length) : 0,
    arrivalNames: arrivals.map((rv) => rv.guestName), departureNames: departures.map((rv) => rv.guestName),
  };
};

// ═══════════════ โหลดโมดูล (หลัง env) — ตัวดักคิวรีก่อน db ═══════════════
const SQL_LOG: string[] = [];
let spyInstalled = false;
{
  const pc = await tryImport("@prisma/client");
  const ad = await tryImport("@prisma/adapter-pg");
  if (pc.mod?.PrismaClient && ad.mod?.PrismaPg && !(globalThis as Any).prisma) {
    try {
      const spy = new pc.mod.PrismaClient({ adapter: new ad.mod.PrismaPg({ connectionString: process.env.DATABASE_URL }), transactionOptions: { timeout: 30_000, maxWait: 10_000 }, log: [{ emit: "event", level: "query" }] });
      spy.$on("query", (e: Any) => SQL_LOG.push(String(e?.query ?? "")));
      (globalThis as Any).prisma = spy;
      spyInstalled = true;
    } catch (e) { console.log(`  ⚠️ ติดตั้งตัวดักคิวรีไม่ได้: ${errMsg(e)}`); }
  }
}
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
if (spyInstalled && prisma !== (globalThis as Any).prisma) spyInstalled = false;
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const roomsL = await tryImport("@/lib/modules/rooms");
const svcL = await loadIf(F.service);
const ratesL = await loadIf(F.rates);
const pricingL = await loadIf(F.pricing);
const tapeL = await loadIf(F.tape);
const blockL = await loadIf(F.block);
const bookingL = await loadIf(F.booking);
const availL = await loadIf(F.avail);
const hotelL = await loadIf(F.index);
const tabsSharedL = await loadIf(F.tabsShared);
const tapeSharedL = await loadIf(F.tapeShared);
const TAPE = (name: string) => fnOf(tapeL, name, F.tape);
const BLK = (name: string) => fnOf(blockL, name, F.block);
const BK = (name: string) => fnOf(bookingL, name, F.booking);
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const needTape = () => ok(typeof tapeL.mod?.tapeChart === "function" && typeof tapeL.mod?.hotelToday === "function", tapeL.mod ? `«${F.tape}» ยังไม่มี export tapeChart/hotelToday` : `ยังไม่มี ${F.tape} (H.2): ${tapeL.err}`);
const needBlock = () => ok(typeof blockL.mod?.blockRoom === "function", blockL.mod ? `«${F.block}» ยังไม่มี export blockRoom` : `ยังไม่มี ${F.block} (H.2): ${blockL.err}`);
const H3_WHY = typeof bookingL.mod?.createBooking === "function" && typeof bookingL.mod?.assignRoom === "function" ? "" : bookingL.mod ? `«${F.booking}» ยังไม่มี export createBooking/assignRoom (H.3)` : `ยังไม่มี ${F.booking} (H.3 กำลังเขียนบนเลนอื่น): ${bookingL.err}`;
const needH3 = () => ok(!H3_WHY, H3_WHY);
const sqlCount = (from: number) => SQL_LOG.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE|SET |SAVEPOINT|RELEASE)/i.test(q)).length;

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelRatePlan", "HotelRate", "HotelBookingNight", "HotelHousekeepingLog", "RoomOccupancy"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  H0_OK = miss.length === 0 && typeof prisma.hotelBookingNight?.findMany === "function" && typeof prisma.hotelHousekeepingLog?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l3: ${miss.join(", ")}` : !H0_OK ? "Prisma client ของเลนนี้ยังไม่มี model HotelBookingNight/HotelHousekeepingLog" : "";
} catch (e) { H0_WHY = `อ่าน information_schema ไม่ได้: ${errMsg(e)}`; }
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupMisc() {
  try { await prisma.user.deleteMany({ where: { email: { startsWith: MAIL } } }); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string; membershipId?: string };

// ═══════════════ ตัวช่วยสถิต (UI) — แบบ h.1 ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|STANDARD|BREAKFAST|NONREF|WEB|COUNTER|ADR|RevPAR|TM|RR|px|rem|em|svg|a|x|Agoda|Booking\.com)$/;
const englishInJsx = (src: string): string[] => {
  const s = stripComments(src);
  const texts: string[] = [];
  for (const m of s.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) texts.push(m[1]);
  for (const m of s.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']*)["']/g)) texts.push(m[1]);
  const bad: string[] = [];
  for (const t of texts) for (const w of t.match(/[A-Za-z][A-Za-z.'-]{1,}/g) ?? []) if (!EN_ALLOW.test(w) && !/^[A-Z]{2,5}$/.test(w)) bad.push(w);
  return [...new Set(bad)];
};
const importSpecs = (src: string): { spec: string; typeOnly: boolean }[] => {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of stripComments(src).matchAll(/import\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|export\s+(type\s+)?[^'";]*?from\s*["']([^"']+)["']/g)) {
    const spec = m[2] ?? m[3] ?? m[5];
    if (spec) out.push({ spec, typeOnly: !!(m[1] || m[4]) });
  }
  return out;
};
const resolveSpec = (fromRel: string, spec: string): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(join(ROOT, dirname(fromRel)), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith("/")) { try { if (readFileSync(c, "utf8") !== undefined) return c.slice(ROOT.length + 1); } catch { /* โฟลเดอร์ */ } }
  return null;
};
/** เดินกราฟ import (ค่า) จากไฟล์ client จนถึงขอบ "use server" — คืนเส้นที่ลากถึง prisma/db/โมดูล server ของโรงแรม/แกนห้อง */
const clientReach = (startRel: string): string[] => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (rel: string, path: string[]) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel);
    if (!src) return;
    if (rel !== startRel && /^\s*["']use server["']/m.test(src)) return;
    for (const { spec, typeOnly } of importSpecs(src)) {
      if (typeOnly) continue;
      if (spec === "@prisma/client" || spec === "server-only" || spec === "@/lib/core/db" || /^@prisma\//.test(spec)) { bad.push([...path, rel, spec].join(" → ")); continue; }
      const r = resolveSpec(rel, spec);
      if (!r) continue;
      if (/^src\/lib\/modules\/hotel\/(tape|block|booking|availability|rates|hotel-settings|service)\.ts$/.test(r) || /^src\/lib\/modules\/rooms\//.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; }
      walk(r, [...path, rel]);
    }
  };
  walk(startRel, []);
  return bad;
};
const nearWrite = (src: string, literal: string, guard: RegExp) => { const i = src.indexOf(literal); if (i < 0) return false; return guard.test(src.slice(Math.max(0, i - 600), i)); };
const DRAG_LIBS = /["'](react-dnd|@dnd-kit\/[a-z-]+|react-beautiful-dnd|@hello-pangea\/dnd|interactjs|@interactjs\/[a-z-]+|react-draggable|react-grid-layout|sortablejs|react-sortablejs|framer-motion|motion\/react)["']/;

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตัวดักคิวรี ${spyInstalled ? "ติดตั้งแล้ว" : "ไม่ได้ติดตั้ง"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · tape.ts ${tapeL.mod ? "มี" : "ยังไม่มี"} · block.ts ${blockL.mod ? "มี" : "ยังไม่มี"} · booking.ts (H.3) ${bookingL.mod ? "มี" : "ยังไม่มี"})`);

const TODAY = bkkToday();
const D = (n: number) => addDays(TODAY, n);
const ownerU = SQC_USERS.find((u) => u.key === "owner")!;
const fdU = SQC_USERS.find((u) => u.key === "frontdesk")!;
const maidU = SQC_USERS.find((u) => u.key === "maid")!;

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ห้องโรงแรม: 14 ห้อง อาคาร B 2 ชั้น · ซูพีเรีย 4 (B101–B104) · ดีลักซ์ 8 = nightly 7 (B105–B107 · B201–B204) + B205 MONTHLY · แฟมิลี 2 (B206–B207) · ราคาฐาน 99,000/129,000/189,000 · เลขห้องไม่ซ้ำ · floorNo ตรงหลักที่สอง", () => {
    eq(SQC_HOTEL_ROOMS.length, 14, "จำนวนห้อง");
    eq([SQC_HOTEL_BUILDING.id, SQC_HOTEL_BUILDING.floors], ["svcqc-bld-b", 2], "อาคาร");
    const byType = (id: string) => SQC_HOTEL_ROOMS.filter((r) => r.typeId === id).map((r) => r.number);
    eq(byType(SQC_HOTEL_TYPES.superior.id), ["B101", "B102", "B103", "B104"], "ซูพีเรีย");
    eq(byType(SQC_HOTEL_TYPES.deluxe.id), ["B105", "B106", "B107", "B201", "B202", "B203", "B204", "B205"], "ดีลักซ์");
    eq(byType(SQC_HOTEL_TYPES.family.id), ["B206", "B207"], "แฟมิลี");
    eq(SQC_HOTEL_ROOMS.filter((r) => r.rentMode === "MONTHLY").map((r) => r.number), ["B205"], "รายเดือน");
    eq(SQC_HOTEL_ROOMS.filter((r) => sellsNightly(r.rentMode, "NIGHTLY")).length, 13, "ห้องขายรายคืนได้");
    eq(new Set(SQC_HOTEL_ROOMS.map((r) => r.number)).size, 14, "เลขห้องซ้ำ");
    ok(SQC_HOTEL_ROOMS.every((r) => r.floorNo === Number(r.number[1])), "floorNo");
    eq([SQC_HOTEL_TYPES.superior.baseRateSatang, SQC_HOTEL_TYPES.deluxe.baseRateSatang, SQC_HOTEL_TYPES.family.baseRateSatang], [99_000, 129_000, 189_000], "ราคาฐาน");
    ok(Object.values(SQC_HOTEL_TYPES).every((t) => t.rentMode === "NIGHTLY"), "ประเภทโรงแรมต้อง NIGHTLY");
  });
  await st("PC-2", "oracle ของ oracle: ตัวอ้างอิงจากรายการฉาก SQC_HOTEL_TAPE_SCENE (11 รายการ · 13 แถว · 1 BLOCK) ให้ expectToday (เข้า 2 · ออก 1 · พักอยู่ 4 · แถบคืนนี้ 5 · ปิดซ่อม 1 · ขายได้ 12 · ชื่อ) และ expectBars7d (STAY 3 · CONFIRMED 7 · OTA 2 · HOLD 1 · BLOCK 1) ตรงฟิกซ์เจอร์ · mark SvcQcScene:h2 · ค่าคงที่ไม่ขึ้นกับวัน (ลอง 14 วันถัดไป)", () => {
    eq(SCENE.bookings.length, 11, "รายการ");
    eq(SCENE.bookings.reduce((n, b) => n + b.rooms, 0), 13, "แถว");
    eq(SCENE.blocks.map((b) => [b.room, b.fromOffset, b.nights]), [["B103", 0, 3]], "BLOCK");
    eq(SCENE.mark, "SvcQcScene:h2", "mark");
    ok((SCENE.mark as string) !== (SQC_HOTEL_BOOKING_SCENE.mark as string), "mark ต้องต่างจากฉาก h.3"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-tsc): ชนิด literal ไม่ซ้อนกัน
    eq(refSceneBars7d(TODAY), { ...SCENE.expectBars7d }, "expectBars7d");
    eq(refSceneToday(TODAY), { ...SCENE.expectToday, arrivalNames: [...SCENE.expectToday.arrivalNames], departureNames: [...SCENE.expectToday.departureNames] }, "expectToday");
    for (let i = 1; i <= 14; i++) { eq(refSceneBars7d(D(i)), { ...SCENE.expectBars7d }, `bars วัน +${i}`); eq(refSceneToday(D(i)).inHouseTonight, SCENE.expectToday.inHouseTonight, `inHouse วัน +${i}`); }
    eq(SQC_TODAY_BKK, TODAY, "SQC_TODAY_BKK = วันนี้ไทย");
    eq(sqcAddDays(TODAY, 3), D(3), "sqcAddDays");
  });
  await st("PC-3", "ฉากสอดคล้องกันเอง: ห้องที่ปัก (pinRooms) เป็นห้องของประเภทนั้น · ไม่ปัก B103 (BLOCK)/B205 (รายเดือน) · ห้องเดียวกันไม่ซ้อนคืน (B203 ออกวันนี้ + HOLD คืนนี้ = ต่อกันพอดี) · จำนวนห้องปัก = rooms · HOLD เดียว = COUNTER · ไม่มีรายการเกินจำนวนห้องของประเภทในคืนใด", () => {
    const typeOf = Object.fromEntries(SQC_HOTEL_ROOMS.map((r) => [r.number, r.typeId]));
    const bad: string[] = [];
    const spans: { room: string; from: number; to: number; key: string }[] = [];
    for (const b of SCENE.bookings as readonly SceneRow[]) {
      const pins = b.pinRooms ?? [];
      if (pins.length !== b.rooms) bad.push(`${b.key} ปัก ${pins.length} ≠ rooms ${b.rooms}`);
      for (const p of pins) {
        if (typeOf[p] !== TYPE_BY_NAME[b.roomType]?.id) bad.push(`${b.key} ห้อง ${p} ไม่ใช่ ${b.roomType}`);
        if (p === "B103" || p === "B205") bad.push(`${b.key} ปัก ${p}`);
        spans.push({ room: p, from: b.checkInOffset, to: b.checkInOffset + b.nights, key: b.key });
      }
      if (b.hold && b.hold !== "COUNTER") bad.push(`${b.key} hold ${b.hold}`);
      if (b.status === "HOLD" && b.hold !== "COUNTER") bad.push(`${b.key} HOLD ไม่ใช่ COUNTER`);
    }
    for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) { const a = spans[i], c = spans[j]; if (a.room === c.room && a.from < c.to && c.from < a.to) bad.push(`${a.key}/${c.key} ซ้อนห้อง ${a.room}`); }
    // ต่อประเภท/คืน: แถวที่ counted (ทุกสถานะในฉาก) ≤ ห้องขายได้ของประเภท − BLOCK
    for (let d = -3; d <= 10; d++) for (const [tn, t] of Object.entries(TYPE_BY_NAME)) {
      const used = (SCENE.bookings as readonly SceneRow[]).filter((b) => b.roomType === tn && b.checkInOffset <= d && d < b.checkInOffset + b.nights).reduce((n, b) => n + b.rooms, 0);
      const blocked = SCENE.blocks.filter((bl) => typeOf[bl.room] === t.id && bl.fromOffset <= d && d < bl.fromOffset + bl.nights).length;
      const cap = SQC_HOTEL_ROOMS.filter((r) => r.typeId === t.id && sellsNightly(r.rentMode, "NIGHTLY")).length - blocked;
      if (used > cap) bad.push(`${tn} วัน ${d}: ใช้ ${used} > ${cap}`);
    }
    eq(bad, [], "ขัดกัน");
  });
  await st("PC-4", "ผู้ใช้ฟิกซ์เจอร์: maid มี hotel.housekeeping เท่านั้น (ไม่มี booking.manage/reservation.*) · frontdesk มี hotel.booking.manage + reservation.create/cancel/checkIn + rates.read ไม่มี rates.write/settings.edit · ทั้งคู่ STAFF หน่วย hotel · owner OWNER [*] · ทะเบียนสิทธิ์มีคีย์ hotel.housekeeping/hotel.booking.manage/hotel.reservation.create", () => {
    eq(Object.keys(maidU.permissions), ["hotel.housekeeping"], "maid");
    eq([maidU.role, maidU.unitAccess], ["STAFF", [SQC_UNITS.hotel.id]], "maid role/unit");
    ok(fdU.permissions["hotel.booking.manage"] === true && fdU.permissions["hotel.reservation.create"] === true && fdU.permissions["hotel.reservation.cancel"] === true && fdU.permissions["hotel.reservation.checkIn"] === true && fdU.permissions["hotel.rates.read"] === true, `frontdesk ${J(fdU.permissions)}`);
    ok(!fdU.permissions["hotel.rates.write"] && !fdU.permissions["hotel.settings.edit"] && !fdU.permissions["hotel.housekeeping"], "frontdesk มีสิทธิ์เกิน");
    eq([fdU.role, fdU.unitAccess], ["STAFF", [SQC_UNITS.hotel.id]], "frontdesk role/unit");
    eq([ownerU.role, ownerU.unitAccess], ["OWNER", ["*"]], "owner");
    for (const k of ["hotel.housekeeping", "hotel.booking.manage", "hotel.reservation.create"]) {
      ok(PERM?.isPermissionKey?.(k) === true, `ทะเบียนสิทธิ์ไม่มี ${k}`);
      ok(THAI.test(String(PERM?.permissionLabel?.(k) ?? "")), `ป้าย ${k} ไม่ไทย`);
    }
  });
  await st("PC-5", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l3 ep-royal-bar) · ตัวดักคิวรีติดตั้งก่อน db · ตาราง H.0 ครบ (HotelBookingNight · HotelHousekeepingLog · RoomOccupancy)", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar|ep-square-heart|ep-late-union)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-PC3-anylane): regression/H.9 รันทุกเลน
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง (TC/P นับคิวรีไม่ได้)");
    ok(H0_OK, H0_WHY);
  });
  await st("PC-6", "seed svcqc บนฐาน l3 ตรงฟิกซ์เจอร์: หน่วย bansuan-hotel HOTEL · 14 ห้อง active (เลข/ประเภท/ชั้น/อาคาร) · B205 rentMode MONTHLY · membership frontdesk มี booking.manage · maid มี hotel.housekeeping อย่างเดียว (reseed ตามใบ §6)", async () => {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    ok(t, "ร้าน svcqc ยังไม่ seed บนฐาน l3 — ผู้คุมรัน scripts/seed-svc-qc.mts ก่อน");
    const u = await prisma.businessUnit.findFirst({ where: { id: SQC_UNITS.hotel.id, tenantId: SQC_TENANT.id }, select: { type: true, slug: true } });
    eq([u?.type, u?.slug], ["HOTEL", SQC_UNITS.hotel.slug], "หน่วย");
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, active: true }, select: { number: true, roomTypeId: true, floorNo: true, rentMode: true, buildingId: true }, orderBy: { number: "asc" } });
    eq(rooms.map((r: Any) => [r.number, r.roomTypeId, r.floorNo, r.rentMode, r.buildingId]), SQC_HOTEL_ROOMS.map((r) => [r.number, r.typeId, r.floorNo, r.rentMode, SQC_HOTEL_BUILDING.id]), "ห้องบนฐาน");
    const fd = await prisma.membership.findUnique({ where: { id: fdU.membershipId }, select: { permissions: true, unitAccess: true, role: true } });
    ok(fd && (fd.permissions as Any)?.["hotel.booking.manage"] === true && fd.role === "STAFF", `membership frontdesk บนฐานยังไม่มี hotel.booking.manage (reseed): ${J(fd)}`);
    const md = await prisma.membership.findUnique({ where: { id: maidU.membershipId }, select: { permissions: true, unitAccess: true, role: true } });
    ok(md, "membership maid ยังไม่มีบนฐาน (reseed — ใบ h.2 §6 เพิ่ม maid ในฟิกซ์เจอร์แล้ว)");
    eq([Object.keys(md!.permissions as Any), md!.unitAccess, md!.role], [["hotel.housekeeping"], [SQC_UNITS.hotel.id], "STAFF"], "maid บนฐาน");
  }, "MAJOR");
  await st("PC-7", "ภาพ: SQC_VISUAL_SPECS[\"h.2\"] = 4 ใบ (/hotel/calendar · ?view=2w · ?view=month · /hotel) · visual-svc h.2 --list พิมพ์ครบ (ไม่ต่อ server) · SQC_VISUAL_USERS มี maid", () => {
    const specs = SQC_VISUAL_SPECS["h.2"] ?? [];
    eq(specs.map((s) => s.name), ["hotel-calendar-week", "hotel-calendar-2w", "hotel-calendar-month", "hotel-today"], "ชื่อภาพ");
    eq(specs.map((s) => s.path), [`/app/u/${SQC_UNITS.hotel.slug}/hotel/calendar`, `/app/u/${SQC_UNITS.hotel.slug}/hotel/calendar?view=2w`, `/app/u/${SQC_UNITS.hotel.slug}/hotel/calendar?view=month`, `/app/u/${SQC_UNITS.hotel.slug}/hotel`], "path");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.2", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "" }, encoding: "utf8" });
    ok(r.status === 0 && (r.stdout ?? "").includes("/hotel/calendar?view=month") && (r.stdout ?? "").includes("hotel-today"), `--list exit ${r.status} ${(r.stderr ?? "").slice(0, 120)}`);
    ok(SQC_USERS.some((u) => u.key === "maid"), "ไม่มี maid ใน SQC_USERS (SQC_VISUAL_USERS)");
  }, "MAJOR");

  // ═══════════════ ร้านชั่วคราว (TC/OC/TD/BL/MV/X/P) ═══════════════
  console.log("\n── ร้านชั่วคราว svc-h2-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H2 ร้าน A");
  const tB = await mkTenant("QC H2 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H2");
  const UP = await mkUnit(tA, "HOTEL", "โรงแรม 100 ห้อง H2");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H2");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H2");
  const mkBuilding = async (tenantId: string, unitId: string, name: string, floors: number, sortOrder: number) => (await prisma.roomBuilding.create({ data: { tenantId, unitId, name, floors, sortOrder } })).id as string;
  const mkType = async (tenantId: string, unitId: string, name: string, base: number, sortOrder: number) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name, rentMode: "NIGHTLY", baseRateSatang: base, sortOrder, baseOccupancy: 2, maxOccupancy: 4 } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string, buildingId: string, floorNo: number, rentMode: string | null = null) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, buildingId, floorNo, floor: String(floorNo), rentMode } })).id as string;
  const BLD = await mkBuilding(tA, UH, "อาคารทดสอบ", 2, 1);
  const RTA: Record<string, string> = { sup: await mkType(tA, UH, "ซูพีเรีย", 99_000, 1), dlx: await mkType(tA, UH, "ดีลักซ์", 129_000, 2), fam: await mkType(tA, UH, "แฟมิลี", 189_000, 3), suite: await mkType(tA, UH, "สวีท", 250_000, 4) };
  const PRICE: Record<string, [number, number]> = { sup: [99_000, 99_000], dlx: [129_000, 149_000], fam: [189_000, 219_000], suite: [250_000, 250_000] };
  /** ห้อง: ชั้น 1 = SUP1–3 · DLX1–4 · ชั้น 2 = FAM1 · SUITE1–2 · MIX1 (ดีลักซ์ rentMode BOTH · จะมีสัญญาหอ LEASE) */
  const R: Record<string, string> = {};
  for (const [n, t, f] of [["SUP1", "sup", 1], ["SUP2", "sup", 1], ["SUP3", "sup", 1], ["DLX1", "dlx", 1], ["DLX2", "dlx", 1], ["DLX3", "dlx", 1], ["DLX4", "dlx", 1], ["FAM1", "fam", 2], ["SUITE1", "suite", 2], ["SUITE2", "suite", 2]] as [string, string, number][]) R[n] = await mkRoom(tA, UH, n, RTA[t], BLD, f);
  R.MIX1 = await mkRoom(tA, UH, "MIX1", RTA.dlx, BLD, 2, "BOTH");
  const ROOM_BY_ID = Object.fromEntries(Object.entries(R).map(([n, id]) => [id, n]));
  const RT_B = await mkType(tB, UHB, "ดีลักซ์", 129_000, 1);
  const BLD_B = await mkBuilding(tB, UHB, "อาคารร้าน B", 1, 1);
  const ROOM_B = await mkRoom(tB, UHB, "B1", RT_B, BLD_B, 1);
  const RT_D = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UD, name: "ห้องหอ", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 450_000 } })).id as string;
  const BLD_D = await mkBuilding(tA, UD, "อาคารหอ", 1, 1);
  const ROOM_D = await mkRoom(tA, UD, "D101", RT_D, BLD_D, 1);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h2-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h2 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH, UP], { ...fdU.permissions });
  const MAID = await mkMember("maid", tA, "STAFF", [UH, UP], { ...maidU.permissions });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "pos.sale.create": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const auditCount = (tid: string) => prisma.auditLog.count({ where: { tenantId: tid } }) as Promise<number>;
  const auditsSince = (tid: string, since: Date) => prisma.auditLog.findMany({ where: { tenantId: tid, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  /** ราคาผ่าน H.1 (แผน default STANDARD สร้างอัตโนมัติ · matrix ตาม PRICE) — ล้ม ⇒ RATE_WHY (ไม่ throw) */
  let RATE_WHY = "";
  let PLAN_ID = "";
  const setupRates = async (unitId: string, types: Record<string, string>) => {
    const lp = await RT("listRatePlans")(OWNER, ctxA, { unitId });
    if (lp?.ok !== true) throw new Error(`listRatePlans ${codeOf(lp)} ${lp?.reason ?? ""}`);
    const plan = (lp.plans as Any[]).find((p) => p.isDefault) ?? lp.plans[0];
    if (!plan) throw new Error("ไม่มีแผนราคา default");
    const sv = await RT("saveRatePlan")(OWNER, ctxA, { unitId, id: plan.id, code: plan.code, name: plan.name, depositKind: "FIRST_NIGHT", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D1): H.3 ถือห้อง HOLD เฉพาะเมื่อต้องมีมัดจำ (booking.ts) — แผน NONE ทำให้ H1 เป็น CONFIRMED
    if (sv?.ok !== true) throw new Error(`saveRatePlan ${codeOf(sv)} ${sv?.reason ?? ""}`);
    const rows = Object.entries(types).map(([k, roomTypeId]) => ({ roomTypeId, seasonId: null, priceWeekdaySatang: PRICE[k]?.[0] ?? 100_000, priceWeekendSatang: PRICE[k]?.[1] ?? 100_000, priceHolidaySatang: null }));
    try { await SET.setSettings(OWNER, ctxA, [{ key: "rooms.hotel.guest.requireRegistration", scope: "UNIT", scopeId: unitId, value: false }]); } catch { /* ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-legacy-checkin): H.4 ทำให้ checkIn เดิมต้องมีผู้พักเมื่อ rooms.hotel.guest.requireRegistration เปิด — ปิดที่หน่วยทดสอบ (try/catch: ก่อน H.4 merge คีย์ยังไม่มี) */ }
    const sr = await RT("saveRates")(OWNER, ctxA, { unitId, ratePlanId: plan.id, rows });
    if (sr?.ok !== true) throw new Error(`saveRates ${codeOf(sr)} ${sr?.reason ?? ""}`);
    return plan.id as string;
  };
  try { PLAN_ID = await setupRates(UH, RTA); } catch (e) { RATE_WHY = `ตั้งราคาผ่าน H.1 ไม่ได้: ${errMsg(e)}`; }
  const needRates = () => ok(!RATE_WHY, RATE_WHY);

  // ───────── การจองจริงผ่าน API ของ H.3 (สัญญา h.3 §3 · `at` ใต้ SVC_QC_CLOCK=1) ─────────
  type Bk = { id: string; code: string; status: string; roomId: string | null };
  const RV: Record<string, Bk> = {};
  const CODE_OF: Record<string, string> = {};
  const PHONE = "0812345678";
  const readRv = async (id: string): Promise<Bk> => { const r = await prisma.hotelReservation.findUnique({ where: { id }, select: { id: true, code: true, status: true, roomId: true } }); if (!r) throw new Error(`ไม่พบการจอง ${id}`); return r; };
  /** createBooking → (assignRoom pin) → สถานะปลาย (CHECKED_IN = service.checkIn เดิม · CONFIRMED จาก HOLD = takeBookingDeposit) */
  const mkBooking = async (key: string, o: { unitId?: string; type: string; checkIn: string; nights: number; source: string; guest: string; want: "CONFIRMED" | "HOLD" | "CHECKED_IN"; pin?: string; hold?: "ONLINE" | "COUNTER" | null; at?: string; channelRef?: string; rooms?: number }) => {
    const unitId = o.unitId ?? UH;
    const input: Any = { unitId, rooms: Array.from({ length: o.rooms ?? 1 }, () => ({ roomTypeId: o.type, adults: 2, children: 0 })), checkIn: o.checkIn, checkOut: addDays(o.checkIn, o.nights), source: o.source, guest: { name: o.guest, phone: PHONE }, note: `qc-h2:${key}` };
    if (o.hold !== undefined) input.hold = o.hold;
    if (o.channelRef) input.channelRef = o.channelRef;
    if (o.at) input.at = o.at;
    const r = await BK("createBooking")(OWNER, ctxA, input);
    if (r?.ok !== true) throw new Error(`createBooking ${key}: ${codeOf(r)} ${r?.reason ?? ""} ${r?.dates ? J(r.dates) : ""}`);
    const first = r.reservations?.[0];
    if (!first?.id) throw new Error(`createBooking ${key}: ไม่มี reservations[0].id (${J(r).slice(0, 160)})`);
    if (o.pin) { const a = await BK("assignRoom")(OWNER, ctxA, { unitId, id: first.id, roomId: o.pin, ...(o.at ? { at: o.at } : {}) }); if (a?.ok !== true) throw new Error(`assignRoom ${key}→${ROOM_BY_ID[o.pin] ?? o.pin}: ${codeOf(a)} ${a?.reason ?? ""}`); }
    let cur = await readRv(first.id);
    if (o.want !== "HOLD" && cur.status === "HOLD") {
      const d = await BK("takeBookingDeposit")(OWNER, ctxA, { unitId, reservationId: first.id, payType: "PROMPTPAY", ...(o.at ? { at: o.at } : {}) });
      if (d?.ok !== true) throw new Error(`takeBookingDeposit ${key}: ${codeOf(d)} ${d?.reason ?? ""}`);
      cur = await readRv(first.id);
    }
    if (o.want === "CHECKED_IN") {
      const roomId = o.pin ?? cur.roomId;
      if (!roomId) throw new Error(`checkIn ${key}: ไม่มีห้อง`);
      const c = await fnOf(svcL, "checkIn", F.service)(tA, unitId, first.id, roomId);
      if (c?.ok !== true) throw new Error(`checkIn ${key}: ${J(c).slice(0, 160)}`);
      cur = await readRv(first.id);
    }
    if (cur.status !== o.want) throw new Error(`${key}: สถานะ ${cur.status} ≠ ${o.want}`);
    RV[key] = cur;
    CODE_OF[key] = cur.code;
    return cur;
  };
  /** ฉากร้านชั่วคราว (ยืนบน H.3): S1/S2 พักอยู่ · C1/C5 เข้าวันนี้ · C2 OTA · C3 อนาคต · H1 HOLD เคาน์เตอร์ · สวีท A/B/C (C ไม่มีห้อง) · C4 ยกเลิก · BLOCK SUP3 วันนี้ 3 คืน · LEASE MIX1 */
  let FX_WHY = "";
  let BLOCK0: Any = null;
  const buildFixture = async () => {
    needH3(); needRates();
    await mkBooking("S1", { type: RTA.sup, checkIn: D(-1), nights: 2, source: "WALK_IN", guest: "คุณสมหญิง (พักอยู่)", want: "CHECKED_IN", pin: R.SUP1, at: atIso(D(-1), "10:00") });
    await mkBooking("S2", { type: RTA.dlx, checkIn: D(-1), nights: 1, source: "PHONE", guest: "คุณเก่ง (ออกวันนี้)", want: "CHECKED_IN", pin: R.DLX1, at: atIso(D(-1), "10:00") });
    await mkBooking("C1", { type: RTA.sup, checkIn: D(0), nights: 1, source: "WALK_IN", guest: "คุณประเสริฐ (walk-in)", want: "CONFIRMED", pin: R.SUP2 });
    await mkBooking("C5", { type: RTA.dlx, checkIn: D(0), nights: 1, source: "LINE", guest: "คุณปิ่น (LINE)", want: "CONFIRMED", pin: R.DLX1, hold: null });
    await mkBooking("C2", { type: RTA.dlx, checkIn: D(1), nights: 2, source: "OTA", guest: "Agoda · Mr. Tanaka", want: "CONFIRMED", pin: R.DLX2, channelRef: "AGD-QC-1" });
    await mkBooking("C3", { type: RTA.dlx, checkIn: D(3), nights: 2, source: "PHONE", guest: "คุณอรวรรณ (อนาคต)", want: "CONFIRMED", pin: R.DLX3 });
    await mkBooking("H1", { type: RTA.fam, checkIn: D(0), nights: 1, source: "PHONE", guest: "คุณนก (รอโอน)", want: "HOLD", pin: R.FAM1, hold: "COUNTER" });
    await mkBooking("SA", { type: RTA.suite, checkIn: D(0), nights: 1, source: "WALK_IN", guest: "สวีท ก", want: "CONFIRMED", pin: R.SUITE1 });
    await mkBooking("SB", { type: RTA.suite, checkIn: D(1), nights: 1, source: "WALK_IN", guest: "สวีท ข", want: "CONFIRMED", pin: R.SUITE2 });
    await mkBooking("SC", { type: RTA.suite, checkIn: D(0), nights: 2, source: "PHONE", guest: "สวีท ค (ยังไม่มีห้อง)", want: "CONFIRMED" });
    await mkBooking("C4", { type: RTA.fam, checkIn: D(5), nights: 1, source: "WEB", guest: "คุณพลอย (ยกเลิก)", want: "CONFIRMED", pin: R.FAM1, hold: null });
    const cx = await BK("cancelBooking")(OWNER, ctxA, { unitId: UH, reservationId: RV.C4.id, reason: "ลูกค้าขอยกเลิก" });
    if (cx?.ok !== true) throw new Error(`cancelBooking C4: ${codeOf(cx)} ${cx?.reason ?? ""}`);
    RV.C4 = await readRv(RV.C4.id);
    // LEASE บน MIX1 (แสดงอย่างเดียว · ผ่าน facade แกนห้องเหมือนที่หอทำ)
    await prisma.$transaction(async (tx: Any) => {
      const c = await fnOf(roomsL, "claimRoom", "@/lib/modules/rooms")(tx, { tenantId: tA, unitId: UH, roomId: R.MIX1, start: D(-3), end: D(30), kind: "LEASE", refType: "DormLease", refId: `qc-h2-lease-${RUN}`, requireRentMode: "MONTHLY" });
      if (c?.ok !== true) throw new Error(`claimRoom LEASE: ${codeOf(c)} ${c?.message ?? ""}`);
    });
    if (typeof blockL.mod?.blockRoom === "function") {
      BLOCK0 = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.SUP3, from: D(0), to: D(3), reason: "แอร์เสีย รอช่าง" });
      if (BLOCK0?.ok !== true) throw new Error(`blockRoom SUP3: ${codeOf(BLOCK0)} ${BLOCK0?.reason ?? BLOCK0?.message ?? ""}`);
    }
  };
  try { await buildFixture(); console.log(`  (ฉากร้านชั่วคราวพร้อม: ${Object.keys(RV).length} การจอง${BLOCK0 ? " + BLOCK" : " · ยังไม่มี block.ts"})`); } catch (e) { FX_WHY = e instanceof AssertFail ? e.message : `สร้างฉากผ่าน API H.3 ไม่ได้: ${errMsg(e)}`; console.log(`  (ฉากร้านชั่วคราวไม่พร้อม: ${FX_WHY})`); }
  const needFx = () => ok(!FX_WHY, FX_WHY);
  const needBlock0 = () => { needBlock(); ok(BLOCK0?.ok === true, `blockRoom ตอนสร้างฉากล้ม: ${J(BLOCK0).slice(0, 160)}`); };
  const snap = async (unitId: string): Promise<Snap> => {
    const [rooms, rvs, nights, occ] = await Promise.all([
      prisma.hotelRoom.findMany({ where: { tenantId: tA, unitId }, select: { id: true, number: true, roomTypeId: true, buildingId: true, floorNo: true, rentMode: true, hkStatus: true, active: true, roomType: { select: { rentMode: true, name: true, sortOrder: true } }, building: { select: { sortOrder: true } } } }),
      prisma.hotelReservation.findMany({ where: { tenantId: tA, unitId }, select: { id: true, code: true, status: true, source: true, roomId: true, roomTypeId: true, checkInDate: true, checkOutDate: true, guestName: true, holdExpiresAt: true } }),
      prisma.hotelBookingNight.findMany({ where: { tenantId: tA, unitId }, select: { reservationId: true, roomId: true, roomTypeId: true, date: true, counted: true, priceSatang: true } }),
      prisma.roomOccupancy.findMany({ where: { tenantId: tA, unitId }, select: { id: true, roomId: true, kind: true, refType: true, refId: true, startDate: true, endDate: true, active: true, holdExpiresAt: true } }),
    ]);
    return { rooms, rvs, nights, occ };
  };
  const barPick = (b: Any): RefBar => ({ kind: b?.kind, refId: b?.refId, from: b?.from, to: b?.to });
  const sortBars = (bs: RefBar[]) => [...bs].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.refId.localeCompare(b.refId)));
  const tape = (unitId: string, from: string, days: number, ctx: Any = ctxA) => TAPE("tapeChart")(ctx, { unitId, from, days });
  const roomOf = (t: Any, roomId: string): Any => (t?.groups ?? []).flatMap((g: Any) => g.rooms ?? []).find((r: Any) => r.roomId === roomId);
  const allBars = (t: Any): Any[] => (t?.groups ?? []).flatMap((g: Any) => [...(g.rooms ?? []).flatMap((r: Any) => r.bars ?? []), ...(g.unassigned ?? [])]);

  // ═══════════════ TC tapeChart ═══════════════
  console.log("\n── TC tapeChart (tape.ts) ──");
  await st("TC-1", "tape.ts มี export tapeChart + hotelToday (ฟังก์ชัน) · facade hotel/index.ts re-export tapeChart · hotelToday · blockRoom · releaseBlock · listBlocks (โหลดได้จริง)", () => {
    needTape();
    ok(hotelL.mod, hotelL.err);
    eq(["tapeChart", "hotelToday", "blockRoom", "releaseBlock", "listBlocks"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "facade ขาด");
  });
  await st("TC-2", "โครงผล §3.1 บนฉาก: days = 7 วันเรียงจาก from · groups[] {roomTypeId,name,rateTodaySatang,rateWeekendSatang,rooms[],unassigned[]} · rooms[] {roomId,number,hkStatus,bars[]} · occupancy[] 7 แถว {date,occupied,sellable} วันตรง days · legend มี 6 แบบ (STAY CONFIRMED OTA HOLD BLOCK LEASE)", async () => {
    needTape(); needFx();
    const t = await tape(UH, D(0), 7);
    ok(t && t.ok !== false, `tapeChart ${codeOf(t)} ${t?.reason ?? ""}`);
    eq(t.days, Array.from({ length: 7 }, (_, i) => D(i)), "days");
    ok(Array.isArray(t.groups) && t.groups.length === 4, `groups ${t.groups?.length}`);
    for (const g of t.groups) {
      ok(typeof g.roomTypeId === "string" && typeof g.name === "string" && Number.isInteger(g.rateTodaySatang) && Number.isInteger(g.rateWeekendSatang) && Array.isArray(g.rooms) && Array.isArray(g.unassigned), `group ${J(g).slice(0, 120)}`);
      for (const r of g.rooms) ok(typeof r.roomId === "string" && typeof r.number === "string" && typeof r.hkStatus === "string" && Array.isArray(r.bars), `room ${J(r).slice(0, 120)}`);
    }
    ok(Array.isArray(t.occupancy) && t.occupancy.length === 7, `occupancy ${t.occupancy?.length}`);
    eq(t.occupancy.map((o: Any) => o.date), t.days, "occupancy.date");
    ok(t.occupancy.every((o: Any) => Number.isInteger(o.occupied) && Number.isInteger(o.sellable)), "occupied/sellable ไม่ใช่จำนวนเต็ม");
    const lg = J(t.legend ?? "");
    eq(["STAY", "CONFIRMED", "OTA", "HOLD", "BLOCK", "LEASE"].filter((k) => !lg.includes(k)), [], "legend ขาด");
  });
  await st("TC-3", "แถวห้อง = ห้อง active ขายรายคืนได้ทุกห้องของหน่วย (11 ห้อง รวม MIX1 rentMode BOTH ที่มีสัญญาหอ) · กลุ่มเรียงตาม sortOrder ประเภท (ซูพีเรีย ดีลักซ์ แฟมิลี สวีท) · ห้องในกลุ่มเรียง อาคาร→ชั้น→เลขห้อง · hkStatus ตรงฐาน · ไม่มีห้องซ้ำ/หลุด", async () => {
    needTape(); needFx();
    const s = await snap(UH);
    const t = await tape(UH, D(0), 7);
    eq((t.groups ?? []).map((g: Any) => g.name), ["ซูพีเรีย", "ดีลักซ์", "แฟมิลี", "สวีท"], "ลำดับกลุ่ม");
    const rooms = tapeRooms(s);
    const got = (t.groups ?? []).flatMap((g: Any) => g.rooms.map((r: Any) => r.roomId));
    eq(got.length, rooms.length, "จำนวนแถว");
    eq(new Set(got).size, got.length, "ห้องซ้ำ");
    for (const g of t.groups) {
      const exp = rooms.filter((r) => r.roomTypeId === g.roomTypeId).map((r) => r.number);
      eq(g.rooms.map((r: Any) => r.number), exp, `ลำดับห้องกลุ่ม ${g.name}`);
      for (const r of g.rooms) eq(r.hkStatus, rooms.find((x) => x.id === r.roomId)?.hkStatus, `hkStatus ${r.number}`);
    }
  });
  await st("TC-4", "แถบทุกห้องเทียบตัวอ้างอิงจากแถวในฐาน (7 วัน): kind/refId/from/to ตรงทุกแถบ (STAY S1 S2 · CONFIRMED C1 C5 C3 SA SB · OTA C2 · HOLD H1 · BLOCK SUP3 · LEASE MIX1) · ไม่มีแถบเกิน · CANCELLED (C4) ไม่โผล่", async () => {
    needTape(); needFx(); needBlock0();
    const s = await snap(UH);
    const t = await tape(UH, D(0), 7);
    const bad: string[] = [];
    for (const r of tapeRooms(s)) {
      const row = roomOf(t, r.id);
      if (!row) { bad.push(`${r.number}: ไม่มีแถว`); continue; }
      const exp = refBarsOfRoom(s, r.id, D(0), 7), got = sortBars((row.bars as Any[]).map(barPick));
      if (!isDeepStrictEqual(got, exp)) bad.push(`${r.number}: ได้ ${J(got)} คาด ${J(exp)}`);
    }
    eq(bad.slice(0, 4), [], "แถบ");
    ok(!J(allBars(t)).includes(RV.C4.id), "CANCELLED โผล่");
    const kinds = allBars(t).map((b) => b.kind);
    eq(["STAY", "CONFIRMED", "OTA", "HOLD", "BLOCK", "LEASE"].filter((k) => !kinds.includes(k)), [], "แบบที่ไม่ปรากฏ");
  });
  await st("TC-5", "รายละเอียดแถบ: STAY/CONFIRMED มี guestName+label (ไทย/ชื่อแขก) · OTA มี source \"OTA\" · HOLD มี holdExpiresAt (ISO อนาคต) · BLOCK label มี reason «แอร์เสีย รอช่าง» · LEASE มี label «รายเดือน» · กลุ่ม WEDDING ไม่มีที่นี่ ⇒ groupId null/undefined · refId = id การจอง/blockId", async () => {
    needTape(); needFx(); needBlock0();
    const t = await tape(UH, D(0), 7);
    const by = (key: string) => allBars(t).find((b) => b.refId === RV[key]?.id);
    const s1 = by("S1"), c2 = by("C2"), h1 = by("H1"), c1 = by("C1");
    ok(s1 && s1.kind === "STAY" && typeof s1.label === "string" && s1.label.includes("คุณสมหญิง"), `S1 ${J(s1)}`);
    ok(c1 && c1.kind === "CONFIRMED" && (c1.guestName ?? c1.label ?? "").includes("ประเสริฐ"), `C1 ${J(c1)}`);
    ok(c2 && c2.kind === "OTA" && c2.source === "OTA", `C2 ${J(c2)}`);
    ok(h1 && h1.kind === "HOLD" && typeof h1.holdExpiresAt === "string" && !Number.isNaN(Date.parse(h1.holdExpiresAt)) && Date.parse(h1.holdExpiresAt) > Date.now(), `H1 ${J(h1)}`);
    const bl = allBars(t).find((b) => b.kind === "BLOCK");
    ok(bl && bl.refId === BLOCK0.blockId && String(bl.label ?? "").includes("แอร์เสีย"), `BLOCK ${J(bl)} (blockId ${BLOCK0.blockId})`);
    const le = allBars(t).find((b) => b.kind === "LEASE");
    ok(le && /รายเดือน/.test(String(le.label ?? "")), `LEASE ${J(le)}`);
    ok(allBars(t).every((b) => !b.groupId), "groupId ควรว่างเมื่อไม่ใช่กลุ่ม");
  });
  await st("TC-6", "ขอบแถบ (มติ 1 เริ่มกลางวันเข้า/จบกลางวันออก): from = วันเข้าจริง · to = วันออกจริง ไม่ตัดตามกริด (S1 from = เมื่อวาน) · S2 (ออกวันนี้) ยังอยู่ในกริดที่เริ่มวันนี้ · กริดเริ่มพรุ่งนี้ ⇒ S2/C1 หาย C2 อยู่ · กริดที่จบก่อนวันเข้า C3 ⇒ C3 ไม่โผล่", async () => {
    needTape(); needFx();
    const t0 = await tape(UH, D(0), 7);
    const s1 = allBars(t0).find((b) => b.refId === RV.S1.id), s2 = allBars(t0).find((b) => b.refId === RV.S2.id);
    eq([s1?.from, s1?.to], [D(-1), D(1)], "S1 from/to จริง");
    eq([s2?.from, s2?.to], [D(-1), D(0)], "S2 ออกวันนี้ยังแสดง");
    const t1 = await tape(UH, D(1), 7);
    const ids1 = allBars(t1).map((b) => b.refId);
    ok(!ids1.includes(RV.S2.id) && ids1.includes(RV.C1.id) && ids1.includes(RV.C2.id) && ids1.includes(RV.S1.id), `กริดพรุ่งนี้ ${J(ids1.map((i) => Object.entries(RV).find(([, v]) => v.id === i)?.[0] ?? i))}`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D3): C1 ออก D1 = วันแรกของกริด ⇒ ยังแสดงครึ่งวัน (มติ §7 ข้อ 5 · กติกาเดียวกับ S2 ในกริด D0)
    const t2 = await tape(UH, D(0), 3);
    ok(!allBars(t2).map((b) => b.refId).includes(RV.C3.id), "C3 (เข้า +3) โผล่ในกริด 3 วัน");
  });
  await st("TC-7", "หัวกลุ่ม: rateTodaySatang = resolveNightPrice(แผน default, วันนี้) ของ H.1 · rateWeekendSatang = ราคาวันสุดสัปดาห์ถัดไป (weekendDays จาก H.1) ⇒ ซูพีเรีย 99,000/99,000 · ดีลักซ์ 129,000/149,000 · แฟมิลี 189,000/219,000 · สวีท 250,000/250,000 (ไม่มีฤดู/override ในร้านทดสอบ)", async () => {
    needTape(); needFx();
    const pc = await RT("loadPricingContext")(ctxA, UH, { from: D(0), to: D(8) });
    ok(pc && Array.isArray(pc.plans), "loadPricingContext ไม่คืน ctx");
    const plan = pc.plans.find((p: Any) => p.isDefault) ?? pc.plans[0];
    const night = fnOf(pricingL, "resolveNightPrice", F.pricing);
    const wd = Array.isArray(pc.weekendDays) ? pc.weekendDays : [5, 6];
    const nextWeekend = Array.from({ length: 7 }, (_, i) => D(i)).find((d) => wd.includes(dowOf(d)))!;
    const t = await tape(UH, D(0), 7);
    for (const [k, id] of Object.entries(RTA)) {
      const g = (t.groups ?? []).find((x: Any) => x.roomTypeId === id);
      ok(g, `ไม่มีกลุ่ม ${k}`);
      eq([g.rateTodaySatang, g.rateWeekendSatang], [night(pc, { roomTypeId: id, ratePlanId: plan.id, date: D(0) })?.priceSatang, night(pc, { roomTypeId: id, ratePlanId: plan.id, date: nextWeekend })?.priceSatang], `ราคา ${k}`);
      eq([g.rateTodaySatang, g.rateWeekendSatang], [dowOf(D(0)) === 5 || dowOf(D(0)) === 6 ? PRICE[k][1] : PRICE[k][0], PRICE[k][1]], `ราคาตามตาราง ${k}`);
    }
  });
  await st("TC-8", "แถว «ยังไม่กำหนดห้อง» (มติ 1): สวีท ค (2 คืน · ห้องแตกกระจาย ⇒ roomId null) อยู่ใน groups[สวีท].unassigned kind CONFIRMED refId ตรง · ไม่อยู่ใน bars ของห้องใด · กลุ่มอื่น unassigned ว่าง · ตัวอ้างอิง refUnassigned ตรง", async () => {
    needTape(); needFx();
    const s = await snap(UH);
    eq(RV.SC.roomId, null, "SC ควรไม่มีห้อง (ถ้า H.3 เลือกห้องให้ = ฉากแตกกระจายไม่เกิด — ดู wo-notes)");
    const t = await tape(UH, D(0), 7);
    const g = (t.groups ?? []).find((x: Any) => x.roomTypeId === RTA.suite);
    eq(sortBars((g?.unassigned ?? []).map(barPick)), refUnassigned(s, RTA.suite, D(0), 7), "unassigned สวีท");
    ok((g?.unassigned ?? []).some((b: Any) => b.refId === RV.SC.id && b.kind === "CONFIRMED"), "SC ไม่อยู่ใน unassigned");
    ok(!(t.groups ?? []).flatMap((x: Any) => x.rooms).flatMap((r: Any) => r.bars).some((b: Any) => b.refId === RV.SC.id), "SC โผล่ในแถวห้อง");
    eq((t.groups ?? []).filter((x: Any) => x.roomTypeId !== RTA.suite).map((x: Any) => x.unassigned.length), [0, 0, 0], "กลุ่มอื่น");
  });
  await st("TC-9", "days 14 และเดือน: days=14 ⇒ 14 วัน + occupancy 14 · days=จำนวนวันของเดือน from (เดือนไทยปฏิทิน) ⇒ ตรง · แถบ C3 (เข้า +3) อยู่ครบทั้งสอง · days 7/14 ให้แถบวันนี้ชุดเดียวกัน", async () => {
    needTape(); needFx();
    const t14 = await tape(UH, D(0), 14);
    eq([t14.days?.length, t14.occupancy?.length, t14.days?.[13]], [14, 14, D(13)], "14 วัน");
    const first = D(0).slice(0, 8) + "01";
    const n = daysInMonthOf(first);
    const tm = await tape(UH, first, n);
    eq([tm.days?.length, tm.days?.[0], tm.days?.[n - 1]], [n, first, addDays(first, n - 1)], "เดือน");
    ok(allBars(t14).some((b) => b.refId === RV.C3.id) && allBars(tm).some((b) => b.refId === RV.C3.id), "C3 หาย");
    const t7 = await tape(UH, D(0), 7);
    eq(sortBars(allBars(t7).filter((b) => covers(b.from, addDays(b.to, 1), D(0))).map(barPick)), sortBars(allBars(t14).filter((b) => covers(b.from, addDays(b.to, 1), D(0))).map(barPick)), "แถบวันนี้ 7 vs 14");
  });
  await st("TC-10", "ประสิทธิภาพเชิงคิวรี (มติ 6): tapeChart 7 วันบนฉาก ≤ 6 คิวรี (ห้อง · occupancy · reservation · nights · lease · hk) · days=31 ก็ ≤ 6 (ไม่ขึ้นกับจำนวนวัน/ห้อง)", async () => {
    needTape(); needFx();
    ok(spyInstalled, "ตัวดักคิวรีไม่ได้ติดตั้ง");
    await tape(UH, D(0), 7);
    const a = SQL_LOG.length; await tape(UH, D(0), 7); const n7 = sqlCount(a);
    const b = SQL_LOG.length; await tape(UH, D(0), 31); const n31 = sqlCount(b);
    ok(n7 <= 6 && n31 <= 6, `คิวรี 7 วัน = ${n7} · 31 วัน = ${n31} (เพดาน 6)`);
  });
  await st("TC-11", "input ผิดไม่ throw: from ไม่ใช่ ymd · days 0/ลบ/ไม่ใช่จำนวนเต็ม · unitId ว่าง ⇒ {ok:false} (INVALID_RANGE/INVALID_INPUT/NOT_FOUND) หรือผลว่าง (groups [] · days []) · ไม่มีคิวรีเขียน", async () => {
    needTape();
    const bad: string[] = [];
    for (const [n, inp] of [["from ผิด", { unitId: UH, from: "2026-13-45", days: 7 }], ["days 0", { unitId: UH, from: D(0), days: 0 }], ["days ลบ", { unitId: UH, from: D(0), days: -3 }], ["days ทศนิยม", { unitId: UH, from: D(0), days: 7.5 }], ["unitId ว่าง", { unitId: "", from: D(0), days: 7 }]] as [string, Any][]) {
      try {
        const r = await TAPE("tapeChart")(ctxA, inp);
        const empty = r && r.ok !== false && Array.isArray(r.groups) && r.groups.length === 0;
        if (!(r?.ok === false || empty)) bad.push(`${n}: ${J(r).slice(0, 80)}`);
      } catch (e) { bad.push(`${n}: throw ${errMsg(e)}`); }
    }
    eq(bad, [], "input ผิด");
  }, "MAJOR");
  await st("TC-12", "tapeChart อ่านอย่างเดียว: เรียกแล้วไม่มี INSERT/UPDATE/DELETE ใน SQL · ไม่เปลี่ยนแถว HotelRoom/RoomOccupancy/HotelReservation (ลายเซ็น updatedAt เท่าเดิม)", async () => {
    needTape(); needFx();
    const sig = async () => J([await prisma.hotelRoom.aggregate({ where: { unitId: UH }, _max: { updatedAt: true } }), await prisma.roomOccupancy.aggregate({ where: { unitId: UH }, _max: { updatedAt: true }, _count: true }), await prisma.hotelReservation.aggregate({ where: { unitId: UH }, _max: { updatedAt: true } })]);
    const s0 = await sig();
    const a = SQL_LOG.length;
    await tape(UH, D(0), 14);
    await TAPE("hotelToday")(ctxA, { unitId: UH });
    const writes = SQL_LOG.slice(a).filter((q) => /^\s*(INSERT|UPDATE|DELETE)/i.test(q));
    eq(writes.length, 0, `คิวรีเขียน ${writes.slice(0, 2).join(" | ").slice(0, 160)}`);
    eq(await sig(), s0, "แถวเปลี่ยน");
  });

  // ═══════════════ OC อัตราเข้าพักรายคืน ═══════════════
  console.log("\n── OC อัตราเข้าพักรายคืน (occupied/sellable) ──");
  await st("OC-1", "occupancy 7 วันเทียบตัวอ้างอิงทุกวัน: sellable = ห้องขายรายคืนได้ (11) − BLOCK ที่ครอบวัน − LEASE ที่ครอบวัน · occupied = nights.counted ของการจอง HOLD/CONFIRMED/CHECKED_IN (มีห้องหรือไม่ก็นับ) · ไม่นับ BLOCK/LEASE เป็น occupied", async () => {
    needTape(); needFx(); needBlock0();
    const s = await snap(UH);
    const t = await tape(UH, D(0), 7);
    eq(t.occupancy.map((o: Any) => ({ date: o.date, occupied: o.occupied, sellable: o.sellable })), Array.from({ length: 7 }, (_, i) => refOccupancyDay(s, D(i))), "occupancy");
  });
  await st("OC-2", "วันนี้ตัวเลขตามฉาก: sellable 9 (11 − BLOCK SUP3 − LEASE MIX1) · occupied 6 (S1 · C1 · C5 · H1 counted · สวีท ก · สวีท ค ไม่มีห้อง) · S2 ออกวันนี้ไม่นับคืนนี้ · วันที่ +3 (BLOCK จบแล้ว) sellable 10", async () => {
    needTape(); needFx(); needBlock0();
    const t = await tape(UH, D(0), 7);
    eq([t.occupancy[0].occupied, t.occupancy[0].sellable], [6, 9], "วันนี้");
    eq(t.occupancy[3].sellable, 10, "+3 (BLOCK จบ · LEASE ยังอยู่)");
  });
  await st("OC-3", "HOLD counted นับ (มติ 4 · S:1119): ยกเลิกไม่ได้ ⇒ ใช้ H1 (HOLD เคาน์เตอร์ ยังไม่หมดอายุ) — nights ของ H1 counted=true และ occupied วันนี้รวม H1 · เทียบ: ถ้าตัด H1 ออกจากตัวอ้างอิง ตัวเลขต้องลด 1 (positive control)", async () => {
    needTape(); needFx();
    const s = await snap(UH);
    const nh = s.nights.filter((n) => n.reservationId === RV.H1.id);
    ok(nh.length === 1 && nh[0].counted, `nights H1 ${J(nh)}`);
    const t = await tape(UH, D(0), 7);
    const ref = refOccupancyDay(s, D(0));
    const without = refOccupancyDay({ ...s, rvs: s.rvs.filter((r) => r.id !== RV.H1.id) }, D(0));
    eq(ref.occupied - without.occupied, 1, "positive control");
    eq(t.occupancy[0].occupied, ref.occupied, "occupied วันนี้");
  });
  await st("OC-4", "ปิดห้องเพิ่มแล้วอัตราเปลี่ยนทันที (tape chart = มุมมองของ RoomOccupancy): block DLX4 วัน +5..+6 ⇒ sellable วัน +5 ลด 1 · วัน +4/+6 เท่าเดิม · ปล่อย block ⇒ กลับเท่าเดิม", async () => {
    needTape(); needFx(); needBlock();
    const before = (await tape(UH, D(0), 7)).occupancy.map((o: Any) => o.sellable);
    const b = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.DLX4, from: D(5), to: D(6), reason: "ทาสีห้อง" });
    okRes(b, "blockRoom DLX4");
    try {
      const mid = (await tape(UH, D(0), 7)).occupancy.map((o: Any) => o.sellable);
      eq(mid, before.map((v: number, i: number) => (i === 5 ? v - 1 : v)), "ระหว่าง block");
    } finally {
      okRes(await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: b.blockId }), "releaseBlock DLX4");
    }
    eq((await tape(UH, D(0), 7)).occupancy.map((o: Any) => o.sellable), before, "หลังปล่อย");
  });

  // ═══════════════ TD hotelToday (KPI หน้าเคาน์เตอร์) ═══════════════
  console.log("\n── TD hotelToday ──");
  const todayKpi = (unitId: string, extra: Any = {}, ctx: Any = ctxA) => TAPE("hotelToday")(ctx, { unitId, ...extra });
  await st("TD-1", "โครงผล §3.3: arrivals · departures · inHouse · sellable · blocked · leased · hkDirty · weekOccBps · adrSatang เป็นจำนวนเต็ม ≥ 0 · มีรายชื่อ (arrivalNames/departureNames หรือ names.*) เป็น array", async () => {
    needTape(); needFx();
    const k = await todayKpi(UH);
    ok(k && k.ok !== false, `hotelToday ${codeOf(k)}`);
    const miss = ["arrivals", "departures", "inHouse", "sellable", "blocked", "leased", "hkDirty", "weekOccBps", "adrSatang"].filter((f) => !(Number.isInteger(k[f]) && k[f] >= 0));
    eq(miss, [], `ฟิลด์ตัวเลขขาด/ผิดชนิด (${J(k).slice(0, 200)})`);
    const an = k.arrivalNames ?? k.names?.arrivals, dn = k.departureNames ?? k.names?.departures;
    ok(Array.isArray(an) && Array.isArray(dn), "ไม่มีรายชื่อ arrivalNames/departureNames (หรือ names.arrivals/departures)");
  });
  const namesOf = (k: Any) => ({ arr: (k.arrivalNames ?? k.names?.arrivals ?? []) as string[], dep: (k.departureNames ?? k.names?.departures ?? []) as string[] });
  await st("TD-2", "ตัวเลขวันนี้เทียบตัวอ้างอิงจากฐาน: เข้าวันนี้ 2 (C1 · C5 CONFIRMED checkIn=วันนี้) · ออกวันนี้ 1 (S2 CHECKED_IN checkOut=วันนี้) · พักอยู่คืนนี้ 5 (S1 C1 C5 สวีท ก สวีท ค · ไม่รวม HOLD) · ขายได้ 9 · ปิดซ่อม 1 · รายเดือน 1", async () => {
    needTape(); needFx(); needBlock0();
    const s = await snap(UH);
    const ref = refToday(s, D(0));
    const k = await todayKpi(UH);
    eq([k.arrivals, k.departures, k.inHouse, k.sellable, k.blocked, k.leased], [ref.arrivals, ref.departures, ref.inHouse, ref.sellable, ref.blocked, ref.leased], "KPI");
    eq([k.arrivals, k.departures, k.inHouse, k.sellable, k.blocked, k.leased], [4, 1, 5, 9, 1, 1], "ตัวเลขฉาก"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D4): เข้าวันนี้ = C1 · C5 · SA · SC (สวีททั้งสองเข้า D0) = 4 ตรงตัวอ้างอิง refToday
  });
  await st("TD-3", "ชื่อ: เข้าวันนี้ = ชื่อ 2 คนแรก {คุณประเสริฐ (walk-in), คุณปิ่น (LINE)} (ชุดเดียวกันไม่สนลำดับ · ≤ 2 ชื่อ) · ออกวันนี้ = [คุณเก่ง (ออกวันนี้)] · ไม่มีเบอร์โทรในรายชื่อ", async () => {
    needTape(); needFx();
    const k = await todayKpi(UH);
    const { arr, dep } = namesOf(k);
    eq([...arr].sort(), ["คุณประเสริฐ (walk-in)", "คุณปิ่น (LINE)"].sort(), "เข้าวันนี้");
    ok(arr.length <= 2, "เกิน 2 ชื่อ");
    eq(dep, ["คุณเก่ง (ออกวันนี้)"], "ออกวันนี้");
    ok(!J(k).includes(PHONE), "เบอร์โทรรั่ว");
  });
  await st("TD-4", "แม่บ้านรอทำ = จำนวนห้อง hkStatus DIRTY: ตั้ง FAM1 DIRTY ผ่าน rooms.setHkStatus ⇒ hkDirty +1 · คืน CLEAN ⇒ กลับเท่าเดิม", async () => {
    needTape(); needFx();
    const k0 = (await todayKpi(UH)).hkDirty;
    okRes(await fnOf(roomsL, "setHkStatus", "@/lib/modules/rooms")(ctxA, { unitId: UH, roomId: R.FAM1, hkStatus: "DIRTY" }), "DIRTY");
    try { eq((await todayKpi(UH)).hkDirty, k0 + 1, "หลัง DIRTY"); }
    finally { okRes(await fnOf(roomsL, "setHkStatus", "@/lib/modules/rooms")(ctxA, { unitId: UH, roomId: R.FAM1, hkStatus: "CLEAN" }), "CLEAN"); }
    eq((await todayKpi(UH)).hkDirty, k0, "หลังคืน");
  });
  await st("TD-5", "สัปดาห์นี้ % + ADR (มติ 5): weekOccBps = Σoccupied/Σsellable ของ 7 วันนับจากวันนี้ (bp ปัดใกล้) · adrSatang = Σ nights.priceSatang (counted · การจอง active · ในสัปดาห์) ÷ จำนวนคืน ปัดลง · ราคาคืนมาจาก H.1 (ดีลักซ์ 129,000/149,000 ฯลฯ) ⇒ ADR อยู่ระหว่าง 99,000 ถึง 250,000", async () => {
    needTape(); needFx(); needBlock0();
    const s = await snap(UH);
    const ref = refToday(s, D(0));
    const k = await todayKpi(UH);
    eq([k.weekOccBps, k.adrSatang], [ref.weekOccBps, ref.adrSatang], "สัปดาห์/ADR");
    ok(k.adrSatang >= 99_000 && k.adrSatang <= 250_000, `ADR ${k.adrSatang} นอกช่วงราคาฉาก`);
    ok(k.weekOccBps > 0 && k.weekOccBps < 10_000, `weekOccBps ${k.weekOccBps}`);
  });
  await st("TD-6", "now (§3.3): hotelToday({now: พรุ่งนี้ 09:00 ไทย}) ⇒ เข้า = ตัวอ้างอิงของพรุ่งนี้ (C2 OTA · สวีท ข) · ออก = 0 (S1 ออกพรุ่งนี้แต่ยัง CHECKED_IN ⇒ 1) · พักอยู่ตามวันนั้น · ไม่ throw", async () => {
    needTape(); needFx();
    const s = await snap(UH);
    const ref = refToday(s, D(1));
    const k = await todayKpi(UH, { now: atIso(D(1), "09:00") });
    eq([k.arrivals, k.departures, k.inHouse], [ref.arrivals, ref.departures, ref.inHouse], "KPI พรุ่งนี้");
    eq([k.arrivals, k.departures], [2, 1], "ตัวเลขฉากพรุ่งนี้ (C2 · สวีท ข เข้า · S1 ออก)");
  });

  // ═══════════════ BL ปิดห้อง (block.ts) ═══════════════
  console.log("\n── BL blockRoom / releaseBlock / listBlocks ──");
  const occBlockRows = (roomId: string) => prisma.roomOccupancy.findMany({ where: { tenantId: tA, unitId: UH, roomId, kind: "BLOCK" }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const hkOf = async (roomId: string) => (await prisma.hotelRoom.findUnique({ where: { id: roomId }, select: { hkStatus: true } }))?.hkStatus as string;
  const hkLogs = (roomId: string, since: Date) => prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA, unitId: UH, roomId, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  await st("BL-1", "block.ts export blockRoom/releaseBlock/listBlocks · BLOCK ของฉาก (SUP3 วันนี้ 3 คืน): {ok:true, blockId} · RoomOccupancy 1 แถว kind BLOCK · refType \"HotelRoomBlock\" · refId = blockId · active · วันตรง · listBlocks(unitId) มีรายการนี้พร้อม roomId/from/to/reason", async () => {
    needBlock(); needFx(); needBlock0();
    eq(["blockRoom", "releaseBlock", "listBlocks"].filter((n) => typeof blockL.mod[n] !== "function"), [], "export ขาด");
    ok(typeof BLOCK0.blockId === "string" && BLOCK0.blockId.length >= 8, `blockId ${J(BLOCK0)}`);
    const rows = (await occBlockRows(R.SUP3)).filter((o) => o.active);
    eq(rows.map((o) => [o.kind, o.refType, o.refId, ymdOfDb(o.startDate), ymdOfDb(o.endDate)]), [["BLOCK", "HotelRoomBlock", BLOCK0.blockId, D(0), D(3)]], "RoomOccupancy");
    const ls = await BLK("listBlocks")(OWNER, ctxA, { unitId: UH, from: D(0), to: D(7) });
    const list: Any[] = Array.isArray(ls) ? ls : ls?.blocks ?? ls?.items ?? [];
    ok(ls?.ok !== false && Array.isArray(list), `listBlocks ${J(ls).slice(0, 120)}`);
    const me = list.find((b) => b.blockId === BLOCK0.blockId || b.id === BLOCK0.blockId);
    ok(me && me.roomId === R.SUP3 && me.from === D(0) && me.to === D(3) && String(me.reason ?? "").includes("แอร์เสีย"), `รายการ ${J(me)}`);
  });
  await st("BL-2", "BLOCK ครอบวันนี้ ⇒ hkStatus SUP3 = OUT_OF_ORDER (ผ่าน setHkStatus) · HotelHousekeepingLog มีแถว toStatus OUT_OF_ORDER + note มี reason · AuditLog action hotel.* targetId = blockId · after มี reason/roomId · ไม่มีเบอร์โทร", async () => {
    needBlock(); needFx(); needBlock0();
    eq(await hkOf(R.SUP3), "OUT_OF_ORDER", "hkStatus");
    const logs = await prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA, unitId: UH, roomId: R.SUP3, toStatus: "OUT_OF_ORDER" } });
    ok(logs.length >= 1 && logs.some((l: Any) => String(l.note ?? "").includes("แอร์เสีย")), `HousekeepingLog ${J(logs.map((l: Any) => [l.fromStatus, l.toStatus, l.note]))}`);
    const au = await prisma.auditLog.findMany({ where: { tenantId: tA, targetId: BLOCK0.blockId } });
    ok(au.length >= 1 && au.every((a: Any) => /^hotel\./.test(a.action)) && au.some((a: Any) => J(a.after ?? {}).includes("แอร์เสีย") && J(a.after ?? {}).includes(R.SUP3)), `AuditLog ${J(au.map((a: Any) => [a.action, a.after]))}`.slice(0, 300));
    ok(!J(au).includes(PHONE), "เบอร์โทรใน AuditLog");
  });
  await st("BL-3", "BLOCK อนาคต (DLX4 วัน +10..+12 · ไม่ครอบวันนี้) ⇒ ok · hkStatus DLX4 คง CLEAN · ไม่มี HousekeepingLog OUT_OF_ORDER ใหม่ · AuditLog มี · listBlocks ช่วง +9..+13 เห็น · ช่วง +0..+7 ไม่เห็น", async () => {
    needBlock(); needFx();
    const since = new Date();
    const hk0 = await hkOf(R.DLX4);
    const a0 = await auditCount(tA);
    const b = okRes(await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.DLX4, from: D(10), to: D(12), reason: "ปิดซ่อมท่อ" }), "blockRoom อนาคต");
    try {
      eq(await hkOf(R.DLX4), hk0, "hkStatus เปลี่ยน");
      eq((await hkLogs(R.DLX4, since)).filter((l) => l.toStatus === "OUT_OF_ORDER").length, 0, "HK log OOO ทั้งที่ยังไม่ถึงวัน");
      ok((await auditCount(tA)) > a0, "ไม่มี AuditLog");
      const inRange = await BLK("listBlocks")(OWNER, ctxA, { unitId: UH, from: D(9), to: D(13) });
      const out = await BLK("listBlocks")(OWNER, ctxA, { unitId: UH, from: D(0), to: D(7) });
      const L = (x: Any): Any[] => (Array.isArray(x) ? x : x?.blocks ?? x?.items ?? []);
      ok(L(inRange).some((x) => (x.blockId ?? x.id) === b.blockId) && !L(out).some((x) => (x.blockId ?? x.id) === b.blockId), "listBlocks กรองช่วงผิด");
    } finally { await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: b.blockId }); }
  });
  await st("BL-4", "ชนการจองที่ assign แล้ว (S:1118): block DLX2 วัน +1..+2 (C2 OTA อยู่) ⇒ {ok:false, code:ROOM_TAKEN, conflicts:[{code, guestName}]} มีรหัส C2 · ไม่มีแถว BLOCK ใหม่ · hkStatus ไม่เปลี่ยน · ไม่มี AuditLog เพิ่ม", async () => {
    needBlock(); needFx();
    const n0 = (await occBlockRows(R.DLX2)).length, a0 = await auditCount(tA), hk0 = await hkOf(R.DLX2);
    const r = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.DLX2, from: D(1), to: D(2), reason: "ทดสอบชน" });
    eq(failCode(r), "ROOM_TAKEN", `ผล ${J(r).slice(0, 160)}`);
    ok(Array.isArray(r.conflicts) && r.conflicts.some((c: Any) => c.code === CODE_OF.C2 && typeof c.guestName === "string"), `conflicts ${J(r.conflicts)}`);
    eq([(await occBlockRows(R.DLX2)).length, await auditCount(tA), await hkOf(R.DLX2)], [n0, a0, hk0], "ผลข้างเคียง");
  });
  await st("BL-5", "INVALID_RANGE: to <= from · วันไม่ใช่ ymd · reason ว่าง ⇒ INVALID_INPUT/INVALID_RANGE (ไม่ throw · ไม่มีแถว) · ห้องของหน่วยอื่น (D101 หอ) ⇒ NOT_FOUND · roomId มั่ว ⇒ NOT_FOUND", async () => {
    needBlock(); needFx();
    const n0 = await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } });
    const bad: string[] = [];
    for (const [n, inp, codes] of [["to=from", { roomId: R.DLX4, from: D(10), to: D(10) }, ["INVALID_RANGE"]], ["to<from", { roomId: R.DLX4, from: D(12), to: D(10) }, ["INVALID_RANGE"]], ["ymd ผิด", { roomId: R.DLX4, from: "10/11/2026", to: D(12) }, ["INVALID_RANGE", "INVALID_INPUT"]], ["reason ว่าง", { roomId: R.DLX4, from: D(10), to: D(12), reason: "" }, ["INVALID_INPUT", "INVALID_RANGE", "VALIDATION"]], ["ห้องหอ", { roomId: ROOM_D, from: D(10), to: D(12) }, ["NOT_FOUND"]], ["id มั่ว", { roomId: "ไม่มี-ห้อง", from: D(10), to: D(12) }, ["NOT_FOUND"]]] as [string, Any, string[]][]) {
      try { const r = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, reason: "x", ...inp }); const c = failCode(r); if (c === null || !codes.includes(c)) bad.push(`${n}=${codeOf(r)}`); } catch (e) { bad.push(`${n}: throw ${errMsg(e)}`); }
    }
    eq(bad, [], "input ผิด");
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } }), n0, "แถวใหม่");
  });
  await st("BL-6", "releaseBlock(BLOCK ของฉาก SUP3): occupancy active=false · hkStatus SUP3 = DIRTY (คืน DIRTY มติ 3) · HousekeepingLog OUT_OF_ORDER→DIRTY · AuditLog · listBlocks ไม่เห็นแล้ว · tapeChart ไม่มีแถบ BLOCK ของ SUP3 · ปล่อยซ้ำ ⇒ ok(noop) หรือ NOT_FOUND ไม่ throw · (ปิดกลับให้ฉากต่อไปด้วย block ใหม่)", async () => {
    needBlock(); needFx(); needBlock0();
    const since = new Date();
    const a0 = await auditCount(tA);
    okRes(await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: BLOCK0.blockId }), "releaseBlock");
    const row = await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, refType: "HotelRoomBlock", refId: BLOCK0.blockId } });
    eq(row?.active, false, "occupancy ยัง active");
    eq(await hkOf(R.SUP3), "DIRTY", "hkStatus หลังปล่อย");
    const logs = await hkLogs(R.SUP3, since);
    ok(logs.some((l) => l.fromStatus === "OUT_OF_ORDER" && l.toStatus === "DIRTY"), `HK log ${J(logs.map((l) => [l.fromStatus, l.toStatus]))}`);
    ok((await auditCount(tA)) > a0, "ไม่มี AuditLog ตอนปล่อย");
    const L = (x: Any): Any[] => (Array.isArray(x) ? x : x?.blocks ?? x?.items ?? []);
    ok(!L(await BLK("listBlocks")(OWNER, ctxA, { unitId: UH, from: D(0), to: D(7) })).some((x) => (x.blockId ?? x.id) === BLOCK0.blockId), "listBlocks ยังเห็น");
    ok(!allBars(await tape(UH, D(0), 7)).some((b) => b.kind === "BLOCK" && b.refId === BLOCK0.blockId), "แถบ BLOCK ยังอยู่");
    const again = await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: BLOCK0.blockId });
    ok(again && (again.ok === true || failCode(again) === "NOT_FOUND"), `ปล่อยซ้ำ ${J(again)}`);
    // ปิดกลับให้ข้อถัดไป (OC/TD/Q ใช้ตัวเลข 9/1)
    okRes(await fnOf(roomsL, "setHkStatus", "@/lib/modules/rooms")(ctxA, { unitId: UH, roomId: R.SUP3, hkStatus: "CLEAN" }), "คืน CLEAN");
    BLOCK0 = okRes(await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.SUP3, from: D(0), to: D(3), reason: "แอร์เสีย รอช่าง" }), "blockRoom ใหม่");
  });
  await st("BL-7", "เตือนเกินจอง (มติ 3 · S:1118 ไม่ยกเลิกอัตโนมัติ): block SUITE1 วัน +1..+2 (ห้องว่าง) แต่สวีทคืน +1 มี nights counted 2 (สวีท ข + สวีท ค ไม่มีห้อง) เหลือห้องขาย 1 ⇒ ok:true พร้อมคำเตือน «เกินจอง 1 คืน» (ข้อความหรือฟิลด์ overbook*/warning มี 1) · การจองไม่ถูกยกเลิก · ปล่อยแล้วเตือนหาย", async () => {
    needBlock(); needFx();
    const r = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.SUITE1, from: D(1), to: D(2), reason: "ทดสอบเกินจอง" });
    okRes(r, "blockRoom SUITE1");
    try {
      const js = J(r);
      const keys = new Set<string>(); walkKeys(r, keys);
      const warnKey = [...keys].find((k) => /overbook|oversold|warning|warn/i.test(k));
      ok(js.includes("เกินจอง") || warnKey, `ไม่มีคำเตือนเกินจองในผล ${js.slice(0, 200)}`);
      ok(/เกินจอง\s*1\s*คืน/.test(js) || (warnKey && J((r as Any)[warnKey]).includes("1")), `จำนวนคืนเกินจองไม่ใช่ 1: ${js.slice(0, 200)}`);
      eq((await readRv(RV.SB.id)).status, "CONFIRMED", "สวีท ข ถูกยกเลิก");
      eq((await readRv(RV.SC.id)).status, "CONFIRMED", "สวีท ค ถูกยกเลิก");
    } finally { await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: r.blockId }); }
    const r2 = await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.SUITE1, from: D(3), to: D(4), reason: "ไม่เกินจอง" });
    try { ok(r2?.ok === true && !J(r2).includes("เกินจอง") && !/"(overbook|oversold)[^"]*":\s*(?!0|\[\]|null|false)/i.test(J(r2)), `ช่วงว่างยังเตือน ${J(r2).slice(0, 160)}`); }
    finally { if (r2?.ok) await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: r2.blockId }); }
  });
  await st("BL-8", "BLOCK ลด availability ของ H.3 (สูตรเดียว S §4.2): hotelAvailability.get ซูพีเรีย วันนี้ ⇒ blocked 1 (SUP3) · available = total − blocked − counted · ห้อง BLOCK ไม่ถูก createBooking เลือก (จองซูพีเรียวันนี้อีก 1 ⇒ AVAILABILITY_CHANGED เพราะ SUP1/SUP2 ใช้แล้ว SUP3 ปิด)", async () => {
    needBlock(); needFx(); needBlock0();
    const av = valOf(availL, "hotelAvailability", F.avail);
    const r = await av.get(ctxA, { unitId: UH, roomTypeId: RTA.sup, from: D(0), to: D(1) });
    const cell = r?.byDate?.[D(0)]?.[RTA.sup];
    ok(cell, `byDate ${J(r).slice(0, 160)}`);
    eq([cell.total - cell.blocked, cell.counted, cell.available], [2, 2, 0], "ซูพีเรียวันนี้"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D5): H.3 availability ตัดห้อง OUT_OF_ORDER ออกจาก total (isSellableNightly) ⇒ [2,0,2,0] · ยอมทั้งสองการแทน · สาระ = ขายได้สุทธิ 2 · นับ 2 · ว่าง 0
    const c = await BK("createBooking")(OWNER, ctxA, { unitId: UH, rooms: [{ roomTypeId: RTA.sup, adults: 1, children: 0 }], checkIn: D(0), checkOut: D(1), source: "WALK_IN", guest: { name: "ทดสอบเต็ม" } });
    eq(failCode(c), "AVAILABILITY_CHANGED", `จองทับ ${J(c).slice(0, 120)}`);
  });
  await st("BL-9", "ห้องที่ปิดซ่อม (OUT_OF_ORDER จาก BLOCK วันนี้) ⇒ assignRoom การจองไปห้องนั้นไม่ได้ (ROOM_INACTIVE/ROOM_TAKEN) · ห้อง BLOCK อนาคต (DLX4 +10..+12) ⇒ assignRoom ช่วงอื่นได้ปกติ แต่ช่วงทับ BLOCK ⇒ ROOM_TAKEN", async () => {
    needBlock(); needFx(); needBlock0();
    const a = await BK("assignRoom")(OWNER, ctxA, { unitId: UH, id: RV.C1.id, roomId: R.SUP3 });
    ok(a?.ok === false && ["ROOM_INACTIVE", "ROOM_TAKEN", "ROOM_BUSY"].includes(String(a.code)), `assign ไปห้อง OOO ${J(a).slice(0, 120)}`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D6): assignRoom ของ H.3 แปลง ROOM_TAKEN ของแกนห้องเป็น ROOM_BUSY
    const b = okRes(await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.DLX4, from: D(10), to: D(12), reason: "ปิดซ่อมท่อ" }), "block DLX4");
    try {
      const p = await mkBooking("P1", { type: RTA.dlx, checkIn: D(10), nights: 1, source: "PHONE", guest: "ทดสอบทับ BLOCK", want: "CONFIRMED" });
      const r = await BK("assignRoom")(OWNER, ctxA, { unitId: UH, id: p.id, roomId: R.DLX4 });
      ok(["ROOM_TAKEN", "ROOM_BUSY"].includes(failCode(r) ?? ""), `assign ทับ BLOCK ${J(r).slice(0, 120)}`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D6)
      eq((await readRv(p.id)).roomId !== R.DLX4, true, "ห้องถูกตั้งเป็น DLX4");
    } finally { await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: b.blockId }); }
  });

  // ═══════════════ MV ลากย้าย/เลื่อน/ยืด (ฝั่ง server ที่ action เรียก) ═══════════════
  console.log("\n── MV ย้ายห้อง/เลื่อนวัน/ยืดคืน ──");
  const MOVE_WHY = (() => { if (typeof hotelL.mod?.moveBooking === "function" || typeof tapeL.mod?.moveBooking === "function" || typeof blockL.mod?.moveBooking === "function") return ""; if (typeof bookingL.mod?.rescheduleBooking === "function") return ""; return `ยังไม่มีฟังก์ชันฝั่ง server ของการลาก: moveBooking (hotel facade/tape.ts/block.ts) หรือ rescheduleBooking (booking.ts · ใบ h.2 §3.4) — action อย่างเดียวทดสอบจาก oracle ไม่ได้ (ต้อง session)`; })();
  const MOVE = (): ((...a: Any[]) => Any) => { const f = hotelL.mod?.moveBooking ?? tapeL.mod?.moveBooking ?? blockL.mod?.moveBooking ?? bookingL.mod?.rescheduleBooking; if (typeof f !== "function") throw new AssertFail(MOVE_WHY); return f; };
  const needMove = () => ok(!MOVE_WHY, MOVE_WHY);
  const rvState = async (id: string) => { const rv = await prisma.hotelReservation.findUnique({ where: { id }, select: { roomId: true, checkInDate: true, checkOutDate: true, nights: true, status: true } }); const nights = await prisma.hotelBookingNight.findMany({ where: { reservationId: id, counted: true }, orderBy: { date: "asc" }, select: { date: true, roomId: true, counted: true } }); const occ = await prisma.roomOccupancy.findMany({ where: { tenantId: tA, refType: "HotelReservation", refId: id, active: true }, select: { roomId: true, startDate: true, endDate: true, kind: true } }); return { roomId: rv?.roomId, ci: ymdOfDb(rv?.checkInDate), co: ymdOfDb(rv?.checkOutDate), status: rv?.status, nights: nights.map((n: Any) => [ymdOfDb(n.date), n.roomId, n.counted]), occ: occ.map((o: Any) => [o.roomId, ymdOfDb(o.startDate), ymdOfDb(o.endDate), o.kind]) }; }; // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D8): H.3 เก็บแถวคืนเดิมที่เลิกนับไว้ (counted=false · roomId null) แบบเดียวกับ shortenBooking ⇒ เทียบเฉพาะคืนที่นับ
  await st("MV-1", "มีฟังก์ชันฝั่ง server ของการลาก (moveBooking ใน facade/tape.ts/block.ts หรือ rescheduleBooking ใน booking.ts — §3.4) · actions.ts มี moveBookingAction/resizeBookingAction ที่เรียกมันใน tx เดียว (ไม่เรียก assignRoom แล้วค่อย extend แยก tx)", () => {
    needMove();
    const s = stripComments(read(F.actions));
    ok(/export\s+async\s+function\s+moveBookingAction\b/.test(s) && /export\s+async\s+function\s+resizeBookingAction\b/.test(s), "actions ขาด moveBookingAction/resizeBookingAction");
    ok(/moveBooking\s*\(|rescheduleBooking\s*\(/.test(s), "moveBookingAction ไม่เรียก moveBooking/rescheduleBooking");
  });
  await st("MV-2", "ย้ายห้องอย่างเดียว (แนวตั้ง): C3 (DLX3 · +3..+5) → DLX4 ⇒ ok · reservation.roomId = DLX4 · nights.roomId ทุกคืน = DLX4 · occupancy active ของ C3 อยู่ DLX4 ช่วงเดิม · DLX3 ว่าง (ไม่มี occupancy active) · tapeChart แถบย้ายตาม · AuditLog มี", async () => {
    needMove(); needFx(); needTape();
    const a0 = await auditCount(tA);
    const r = await MOVE()(OWNER, ctxA, { unitId: UH, id: RV.C3.id, roomId: R.DLX4 });
    okRes(r, "move C3→DLX4");
    const s = await rvState(RV.C3.id);
    eq([s.roomId, s.ci, s.co], [R.DLX4, D(3), D(5)], "reservation");
    eq(s.nights, [[D(3), R.DLX4, true], [D(4), R.DLX4, true]], "nights");
    eq(s.occ.map((o: Any) => [o[0], o[1], o[2]]), [[R.DLX4, D(3), D(5)]], "occupancy"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-tsc)
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, roomId: R.DLX3, active: true, refType: "HotelReservation", refId: RV.C3.id } }), 0, "DLX3 ยังถูกถือ"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D7): นับเฉพาะของ C3 (P1 จาก BL-9 อาจได้ DLX3 จากระบบ)
    const t = await tape(UH, D(0), 7);
    ok(roomOf(t, R.DLX4)?.bars.some((b: Any) => b.refId === RV.C3.id) && !roomOf(t, R.DLX3)?.bars.some((b: Any) => b.refId === RV.C3.id), "แถบไม่ย้าย");
    ok((await auditCount(tA)) > a0, "ไม่มี AuditLog");
  });
  await st("MV-3", "ย้าย + เลื่อนวันใน tx เดียว: C3 → DLX3 วัน +4..+6 ⇒ ok · nights = +4,+5 บน DLX3 · occupancy DLX3 +4..+6 เดียว · ล้ม = เด้งกลับ: C3 → DLX2 วัน +1..+3 (ชน C2) ⇒ ROOM_TAKEN/AVAILABILITY_CHANGED และทุกอย่าง (roomId · วัน · nights · occupancy) เท่าก่อนเรียก", async () => {
    needMove(); needFx();
    okRes(await MOVE()(OWNER, ctxA, { unitId: UH, id: RV.C3.id, roomId: R.DLX3, checkIn: D(4), checkOut: D(6) }), "move+shift");
    const s = await rvState(RV.C3.id);
    eq([s.roomId, s.ci, s.co, s.nights, s.occ.map((o: Any) => [o[0], o[1], o[2]])], [R.DLX3, D(4), D(6), [[D(4), R.DLX3, true], [D(5), R.DLX3, true]], [[R.DLX3, D(4), D(6)]]], "หลังย้าย+เลื่อน");
    const before = await rvState(RV.C3.id);
    const r = await MOVE()(OWNER, ctxA, { unitId: UH, id: RV.C3.id, roomId: R.DLX2, checkIn: D(1), checkOut: D(3) });
    ok(r?.ok === false && ["ROOM_TAKEN", "AVAILABILITY_CHANGED", "ROOM_BUSY"].includes(String(r.code)), `ชน ${J(r).slice(0, 120)}`);
    eq(await rvState(RV.C3.id), before, "เด้งกลับไม่ครบ");
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, refType: "HotelReservation", refId: RV.C3.id, active: true } }), 1, "occupancy เกิน");
  });
  await st("MV-4", "CHECKED_IN เลื่อนวันเข้าไม่ได้ (มติ 2): S1 (พักอยู่ · เข้าเมื่อวาน) ขอ checkIn = วันนี้ ⇒ ok:false (ไม่ throw) · สถานะ/วัน/ห้องคงเดิม · แต่ S1 ยืดคืน checkOut +2 ผ่าน extendBooking ⇒ ok · nights 3 · occupancy end +2 · ย่นกลับ +1 ⇒ ok", async () => {
    needMove(); needFx();
    const before = await rvState(RV.S1.id);
    const r = await MOVE()(OWNER, ctxA, { unitId: UH, id: RV.S1.id, checkIn: D(0) });
    ok(r?.ok === false, `เลื่อนวันเข้าของ CHECKED_IN ผ่าน ${J(r).slice(0, 100)}`);
    eq(await rvState(RV.S1.id), before, "มีผลข้างเคียง");
    okRes(await BK("extendBooking")(OWNER, ctxA, { unitId: UH, id: RV.S1.id, newCheckOut: D(2) }), "extend");
    const e = await rvState(RV.S1.id);
    eq([e.co, e.nights.length, e.occ.map((o: Any) => o[2])], [D(2), 3, [D(2)]], "หลังยืด"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-tsc)
    okRes(await BK("shortenBooking")(OWNER, ctxA, { unitId: UH, id: RV.S1.id, newCheckOut: D(1) }), "shorten กลับ");
    const sh = await rvState(RV.S1.id);
    eq([sh.co, sh.nights.filter((n: Any) => n[2]).length, sh.occ.map((o: Any) => o[2])], [D(1), 2, [D(1)]], "หลังย่น (คืนตัด counted=false)");
  });
  await st("MV-5", "ย่นต่ำกว่าคืนที่ post แล้วไม่ได้ (มติ 2 · S:923): ตั้ง postedAuditId บนคืน +0 ของ S1 แล้ว shorten ให้ checkOut = +0 (ตัดคืนที่ post) ⇒ ok:false · nights/วันคงเดิม · ล้าง postedAuditId ⇒ ย่นเดิมได้ (ok) แล้วยืดคืน", async () => {
    needFx(); needH3();
    const night0 = await prisma.hotelBookingNight.findFirst({ where: { reservationId: RV.S1.id, date: new Date(`${D(0)}T00:00:00.000Z`) } });
    ok(night0, "ไม่มีคืน +0 ของ S1");
    await prisma.hotelBookingNight.update({ where: { id: night0.id }, data: { postedAuditId: `qc-h2-posted-${RUN}` } });
    try {
      const before = await rvState(RV.S1.id);
      const r = await BK("shortenBooking")(OWNER, ctxA, { unitId: UH, id: RV.S1.id, newCheckOut: D(0) });
      ok(r?.ok === false, `ย่นตัดคืนที่ post แล้วผ่าน ${J(r).slice(0, 100)}`);
      eq(await rvState(RV.S1.id), before, "มีผลข้างเคียง");
    } finally { await prisma.hotelBookingNight.update({ where: { id: night0.id }, data: { postedAuditId: null } }); }
    const r2 = await BK("shortenBooking")(OWNER, ctxA, { unitId: UH, id: RV.S1.id, newCheckOut: D(0) });
    ok(r2?.ok === false || r2?.ok === true, `shorten ถึงวันนี้ ${J(r2).slice(0, 100)}`);
    if (r2?.ok === true) okRes(await BK("extendBooking")(OWNER, ctxA, { unitId: UH, id: RV.S1.id, newCheckOut: D(1) }), "ยืดคืน");
    eq((await rvState(RV.S1.id)).co, D(1), "S1 กลับสภาพเดิม");
  });

  // ═══════════════ R ข้อเพิ่มจากผู้ตรวจ H.2 (ORACLE-EDIT ผู้คุม 7 พ.ย. · h2-R-reviewer · ขยายเท่านั้น) ═══════════════
  console.log("\n── R ข้อเพิ่มจากผู้ตรวจ (MAJOR 1–2 · block พร้อมกัน) ──");
  await st("MV-6", "ย้ายแขกที่พักอยู่ (S1 CHECKED_IN · SUP1) ไปห้อง DLX4 ⇒ ok · rv.roomId=DLX4 · nights ที่นับทุกคืน=DLX4 · occupancy active 1 แถวที่ DLX4 · ห้องเดิม SUP1 status CLEANING + hkStatus DIRTY · ห้องใหม่ DLX4 status OCCUPIED (ผู้ตรวจ MAJOR 1 · probe C10)", async () => {
    needMove(); needFx();
    okRes(await MOVE()(OWNER, ctxA, { unitId: UH, id: RV.S1.id, roomId: R.DLX4 }), "move S1");
    const s = await rvState(RV.S1.id);
    ok(s.roomId === R.DLX4 && s.nights.every((n: Any) => n[1] === R.DLX4) && s.occ.length === 1 && s.occ[0][0] === R.DLX4, `หลังย้าย ${J(s).slice(0, 200)}`);
    const rooms = await prisma.hotelRoom.findMany({ where: { id: { in: [R.SUP1, R.DLX4] } }, select: { id: true, status: true, hkStatus: true } });
    const oldR = rooms.find((r: Any) => r.id === R.SUP1), newR = rooms.find((r: Any) => r.id === R.DLX4);
    eq([oldR?.status, oldR?.hkStatus, newR?.status], ["CLEANING", "DIRTY", "OCCUPIED"], "สถานะห้องเดิม/ใหม่");
  });
  await st("MV-7", "previewMove ข้ามประเภท + เพิ่มคืน (ผู้ตรวจ MAJOR 2 · probe C9.1): จอง PV ซูพีเรีย +40 1 คืน → preview {roomId: DLX4, checkOut: +42} (ช่วงไม่ชน X-3 ที่ใช้ DLX4 +20..+21) ⇒ ok · addedNights 1 · keptSatang+addedSatang=totalSatang · แล้ว moveBooking เดียวกัน ⇒ Σ priceSatang ของคืนที่นับ (2 คืน) = totalSatang ของ preview ทุกสตางค์", async () => {
    needMove(); needFx();
    const PREV = tapeL.mod?.previewMove ?? hotelL.mod?.previewMove;
    ok(typeof PREV === "function", "ไม่มี previewMove ใน tape.ts/facade");
    const pv = await mkBooking("PV", { type: RTA.sup, checkIn: D(40), nights: 1, source: "PHONE", guest: "ทดสอบ preview", want: "CONFIRMED" });
    const p = okRes(await PREV(ctxA, { unitId: UH, id: pv.id, roomId: R.DLX4, checkIn: D(40), checkOut: D(42) }), "previewMove");
    ok(Array.isArray(p.addedNights) && p.addedNights.length === 1 && Number.isInteger(p.totalSatang) && Number.isInteger(p.addedSatang) && Number.isInteger(p.keptSatang) && p.keptSatang + p.addedSatang === p.totalSatang && p.addedSatang > 0, `รูป preview ${J(p).slice(0, 200)}`);
    okRes(await MOVE()(OWNER, ctxA, { unitId: UH, id: pv.id, roomId: R.DLX4, checkIn: D(40), checkOut: D(42) }), "move PV");
    const nights = await prisma.hotelBookingNight.findMany({ where: { reservationId: pv.id, counted: true }, select: { priceSatang: true, roomId: true } });
    eq([nights.length, nights.reduce((a: number, n: Any) => a + n.priceSatang, 0), nights.every((n: Any) => n.roomId === R.DLX4)], [2, p.totalSatang, true], "preview ≠ ที่บันทึกจริง");
  });
  await st("X-6", "X4 ปิดห้องพร้อมกัน 4 คน ห้อง FAM1 ช่วง +30..+32 ⇒ สำเร็จ 1 · ที่เหลือ ROOM_TAKEN · ไม่มี throw · BLOCK active ช่วงนั้น 1 แถว (ผู้ตรวจ C1)", async () => {
    needBlock(); needFx();
    const rs = await Promise.all(Array.from({ length: 4 }, (_, i) => BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.FAM1, from: D(30), to: D(32), reason: `แข่ง ${i}` }).catch((e: unknown) => ({ ok: false, code: "THROW", reason: errMsg(e) }))));
    const oks = rs.filter((r: Any) => r?.ok === true);
    try {
      eq(oks.length, 1, `สำเร็จ ${oks.length} (${J(rs.map(codeOf))})`);
      ok(rs.every((r: Any) => r?.ok === true || ["ROOM_TAKEN", "ROOM_BUSY", "BUSY"].includes(String(r?.code))), `โค้ดแปลก ${J(rs.map(codeOf))}`);
      eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, roomId: R.FAM1, kind: "BLOCK", active: true, startDate: { lt: new Date(`${D(32)}T00:00:00.000Z`) }, endDate: { gt: new Date(`${D(30)}T00:00:00.000Z`) } } }), 1, "BLOCK active");
    } finally { for (const o of oks) await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: o.blockId }); }
  });

  // ═══════════════ X ขอบเขต · พร้อมกัน · สิทธิ์ · PII ═══════════════
  console.log("\n── X (X1 · X4 · X9 · X10) ──");
  const leak = (v: Any) => { const js = J(v); return [UH, R.SUP1, "SUP1", "DLX2", RV.C2?.id ?? "∅", "คุณสมหญิง"].filter((x) => js.includes(x)); };
  await st("X-1", "X1 ข้ามร้าน/หน่วย ⇒ NOT_FOUND ไม่มีข้อมูลหลุด: ร้าน B ขอ tapeChart/hotelToday/listBlocks ของหน่วย A ⇒ ok:false NOT_FOUND หรือผลว่าง · ไม่มี id ห้อง/การจอง/ชื่อแขกของ A · blockRoom โดยเจ้าของ B บนห้อง A ⇒ NOT_FOUND ไม่มีแถว · เจ้าของ A ขอหน่วยร้าน B ⇒ NOT_FOUND · หน่วย DORM ⇒ NOT_FOUND/ว่าง", async () => {
    needTape(); needBlock(); needFx();
    const bad: string[] = [];
    for (const [n, f] of [["tape B→A", () => tape(UH, D(0), 7, ctxB)], ["today B→A", () => todayKpi(UH, {}, ctxB)], ["listBlocks B→A", () => BLK("listBlocks")(OWNER_B, ctxB, { unitId: UH, from: D(0), to: D(7) })], ["tape A→B", () => tape(UHB, D(0), 7)], ["tape DORM", () => tape(UD, D(0), 7)], ["today DORM", () => todayKpi(UD)]] as [string, () => Promise<Any>][]) {
      try {
        const r = await f();
        const emptyOk = r && r.ok !== false && ((Array.isArray(r.groups) && r.groups.length === 0) || (Array.isArray(r) && r.length === 0) || (Array.isArray(r.blocks) && r.blocks.length === 0) || (Number.isInteger(r.arrivals) && r.arrivals === 0 && r.inHouse === 0 && r.sellable === 0));
        if (!(failCode(r) === "NOT_FOUND" || emptyOk)) bad.push(`${n}: ${J(r).slice(0, 80)}`);
        if (leak(r).length) bad.push(`${n} รั่ว ${leak(r).join(",")}`);
      } catch (e) { bad.push(`${n}: throw ${errMsg(e)}`); }
    }
    const n0 = await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } });
    const b = await BLK("blockRoom")(OWNER_B, ctxB, { unitId: UH, roomId: R.DLX4, from: D(20), to: D(21), reason: "ข้ามร้าน" });
    if (failCode(b) !== "NOT_FOUND") bad.push(`blockRoom B→A ${codeOf(b)}`);
    const b2 = await BLK("blockRoom")(OWNER_B, ctxB, { unitId: UHB, roomId: R.DLX4, from: D(20), to: D(21), reason: "ห้องร้าน A ในหน่วย B" });
    if (failCode(b2) !== "NOT_FOUND") bad.push(`blockRoom ห้อง A ใต้หน่วย B ${codeOf(b2)}`);
    if ((await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } })) !== n0) bad.push("มีแถว BLOCK ใหม่");
    eq(bad, [], "ข้ามร้าน");
  });
  await st("X-2", "X4 ลากพร้อมกัน 2 คนห้องเดียว = สำเร็จ 1: จอง P/Q ดีลักซ์ +8..+9 แล้ว assignRoom ทั้งคู่ไป DLX4 พร้อมกัน ⇒ ok 1 · อีกตัว ROOM_TAKEN/AVAILABILITY_CHANGED · occupancy active บน DLX4 ที่ครอบ +8 = 1 แถว · ไม่มี 40P01/throw ดิบ", async () => {
    needFx(); needH3();
    const p = await mkBooking("XP", { type: RTA.dlx, checkIn: D(8), nights: 1, source: "PHONE", guest: "แข่ง ก", want: "CONFIRMED" });
    const q = await mkBooking("XQ", { type: RTA.dlx, checkIn: D(8), nights: 1, source: "PHONE", guest: "แข่ง ข", want: "CONFIRMED" });
    const rs = await Promise.all([p, q].map((x) => BK("assignRoom")(FRONT, ctxA, { unitId: UH, id: x.id, roomId: R.DLX4 }).catch((e: unknown) => ({ ok: false, code: "THROW", reason: errMsg(e) }))));
    const oks = rs.filter((r) => r?.ok === true).length;
    eq(oks, 1, `สำเร็จ ${oks} (${J(rs.map(codeOf))})`);
    ok(rs.every((r) => r?.ok === true || ["ROOM_TAKEN", "ROOM_BUSY", "AVAILABILITY_CHANGED"].includes(String(r?.code))), `โค้ดแปลก ${J(rs.map(codeOf))}`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D6)
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, roomId: R.DLX4, active: true, startDate: { lte: new Date(`${D(8)}T00:00:00.000Z`) }, endDate: { gt: new Date(`${D(8)}T00:00:00.000Z`) } } }), 1, "occupancy DLX4 คืน +8");
  });
  await st("X-3", "X9 สิทธิ์ 3 ระดับ: owner/frontdesk (hotel.booking.manage) ปิดห้อง/ปล่อยได้ · maid (hotel.housekeeping) ⇒ FORBIDDEN ทั้ง blockRoom/releaseBlock (ไม่มีแถว) · STAFF ไม่มีสิทธิ์โรงแรม ⇒ FORBIDDEN · STAFF ของหน่วยอื่น (unitAccess UP เท่านั้น) ⇒ NOT_FOUND/ปฏิเสธ", async () => {
    needBlock(); needFx();
    const n0 = await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } });
    const bad: string[] = [];
    for (const [n, a] of [["maid", MAID], ["none", NONE]] as [string, Actor][]) {
      const r = await BLK("blockRoom")(a, ctxA, { unitId: UH, roomId: R.DLX4, from: D(20), to: D(21), reason: "ทดสอบสิทธิ์" });
      if (!isDenied(r)) bad.push(`${n} block=${codeOf(r)}`);
      const rl = await BLK("releaseBlock")(a, ctxA, { unitId: UH, blockId: BLOCK0?.blockId ?? "x" });
      if (!isDenied(rl)) bad.push(`${n} release=${codeOf(rl)}`);
    }
    const other: Actor = { ...FRONT, unitAccess: [UP] };
    const ro = await BLK("blockRoom")(other, ctxA, { unitId: UH, roomId: R.DLX4, from: D(20), to: D(21), reason: "หน่วยอื่น" });
    if (ro?.ok !== false) bad.push(`staff หน่วยอื่น=${codeOf(ro)}`);
    eq(bad, [], "สิทธิ์");
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK" } }), n0, "แถวใหม่จากผู้ไม่มีสิทธิ์");
    const f = okRes(await BLK("blockRoom")(FRONT, ctxA, { unitId: UH, roomId: R.DLX4, from: D(20), to: D(21), reason: "โดยหน้าเคาน์เตอร์" }), "frontdesk block");
    okRes(await BLK("releaseBlock")(FRONT, ctxA, { unitId: UH, blockId: f.blockId }), "frontdesk release");
    const o = okRes(await BLK("blockRoom")(OWNER, ctxA, { unitId: UH, roomId: R.DLX4, from: D(20), to: D(21), reason: "โดยเจ้าของ" }), "owner block");
    okRes(await BLK("releaseBlock")(OWNER, ctxA, { unitId: UH, blockId: o.blockId }), "owner release");
    eq(await prisma.roomOccupancy.count({ where: { tenantId: tA, kind: "BLOCK", active: true, roomId: R.DLX4 } }), 0, "BLOCK DLX4 ค้าง");
  });
  await st("X-4", "X10 DTO ไม่มี PII เกินจำเป็น: JSON ของ tapeChart · hotelToday · listBlocks ไม่มีคีย์ phone/email/idNumber/passport/customerId/policySnapshot/taxSnapshot/depositSaleId · ไม่มีเบอร์ 0812345678 · guestName/label มีได้ (ชื่อบนแถบ)", async () => {
    needTape(); needBlock(); needFx();
    const blobs = [await tape(UH, D(0), 14), await todayKpi(UH), await BLK("listBlocks")(OWNER, ctxA, { unitId: UH, from: D(0), to: D(14) })];
    const keys = new Set<string>(); walkKeys(blobs, keys);
    eq([...keys].filter((k) => /phone|email|idNumber|passport|customerId|policySnapshot|taxSnapshot|depositSaleId|guestEmail/i.test(k)), [], "คีย์ PII/เกินจำเป็น");
    ok(!J(blobs).includes(PHONE), "เบอร์โทรรั่ว");
  });
  await st("X-5", "X1 ภายในร้าน: tapeChart หน่วย UP (โรงแรมอีกหน่วยของร้าน A) ไม่มีห้อง/การจองของ UH · hotelToday UP ไม่นับการจองของ UH (inHouse 0 ก่อนฉาก perf) — ทุกคิวรีผูก unitId", async () => {
    needTape(); needFx();
    const t = await tape(UP, D(0), 7);
    eq(leak(t).filter((x) => x !== UH), [], "ข้อมูล UH ใน UP");
    ok(!(t.groups ?? []).some((g: Any) => g.rooms.some((r: Any) => ROOM_BY_ID[r.roomId])), "ห้องของ UH โผล่ใน UP");
  });

  // ═══════════════ P ประสิทธิภาพ (มติ 6 · S:1158–1159) บนฉาก 100 ห้องชั่วคราว ═══════════════
  console.log("\n── P ประสิทธิภาพ ──");
  let PERF_WHY = "";
  let PERF_BOOKINGS = 0;
  try {
    needH3(); needRates();
    const B100 = await mkBuilding(tA, UP, "อาคาร 100", 4, 1);
    const T100: Record<string, string> = {};
    for (const [i, n] of ["สแตนดาร์ด", "ซูพีเรีย", "ดีลักซ์", "สวีท"].entries()) T100[n] = await mkType(tA, UP, n, 100_000 + i * 20_000, i + 1);
    const typeIds = Object.values(T100);
    const roomRows = Array.from({ length: 100 }, (_, i) => ({ tenantId: tA, unitId: UP, number: `P${String(i + 1).padStart(3, "0")}`, roomTypeId: typeIds[i % 4], buildingId: B100, floorNo: Math.floor(i / 25) + 1, floor: String(Math.floor(i / 25) + 1) }));
    await prisma.hotelRoom.createMany({ data: roomRows });
    await setupRates(UP, Object.fromEntries(typeIds.map((id, i) => [`t${i}`, id])));
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; };
    for (let i = 0; i < 100; i++) {
      const ci = D(rnd(27)), nights = 1 + rnd(3);
      const r = await BK("createBooking")(OWNER, ctxA, { unitId: UP, rooms: [{ roomTypeId: typeIds[rnd(4)], adults: 2, children: 0 }], checkIn: ci, checkOut: addDays(ci, nights), source: ["WALK_IN", "PHONE", "OTA"][(seed % 3)], ...((seed % 3) === 2 ? { channelRef: `OTA-PERF-${i + 1}` } : {}), guest: { name: `แขก perf ${i + 1}` }, note: "qc-h2:perf" }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D2): OTA ต้องมี channelRef (H.3 booking.ts INVALID_INPUT) · ใช้ค่า rnd เดิม (seed หลังเรียก rnd(3)) ไม่เปลี่ยนลำดับสุ่ม
      if (r?.ok === true) PERF_BOOKINGS++;
      else if (failCode(r) !== "AVAILABILITY_CHANGED") throw new Error(`createBooking perf #${i}: ${codeOf(r)} ${r?.reason ?? ""}`);
    }
    console.log(`  (ฉาก perf: 100 ห้อง · การจอง ${PERF_BOOKINGS})`);
  } catch (e) { PERF_WHY = e instanceof AssertFail ? e.message : `สร้างฉาก 100 ห้องไม่ได้: ${errMsg(e)}`; }
  const needPerf = () => ok(!PERF_WHY, PERF_WHY);
  const timeIt = async (f: () => Promise<Any>, n = 3) => { const ts: number[] = []; let last: Any = null; for (let i = 0; i < n; i++) { const t0 = performance.now(); last = await f(); ts.push(performance.now() - t0); } return { ms: Math.round(median(ts)), all: ts.map((x) => Math.round(x)), last }; };
  await st("P-1", "tapeChart 100 ห้อง × 31 วัน (การจอง ≥ 80) < 1,000 ms (median 3 รอบหลังอุ่น) · ≤ 6 คิวรี · groups 4 · rooms 100 · occupancy 31", async () => {
    needTape(); needPerf();
    ok(PERF_BOOKINGS >= 80, `การจองในฉาก ${PERF_BOOKINGS} < 80`);
    await tape(UP, D(0), 31);
    const a = SQL_LOG.length;
    const r = await timeIt(() => tape(UP, D(0), 31));
    const q = sqlCount(a) / 3;
    const rooms = (r.last.groups ?? []).reduce((n: number, g: Any) => n + g.rooms.length, 0);
    eq([r.last.groups?.length, rooms, r.last.occupancy?.length], [4, 100, 31], "โครง");
    ok(r.ms < 1000, `median ${r.ms} ms (${r.all.join("/")}) ≥ 1000`);
    ok(q <= 6, `คิวรี/รอบ ${q} > 6`);
    console.log(`     tapeChart 100×31: ${r.ms} ms (${r.all.join("/")}) · ${q} คิวรี/รอบ`);
  });
  await st("P-2", "hotelAvailability.get (H.3 · วัดที่นี่ S:1158) 100 ห้อง × 365 วัน < 200 ms (median 3 รอบหลังอุ่น) · byDate 365 วัน × 4 ประเภท · ≤ 4 คิวรี", async () => {
    needPerf();
    const av = valOf(availL, "hotelAvailability", F.avail);
    await av.get(ctxA, { unitId: UP, from: D(0), to: D(365) });
    const a = SQL_LOG.length;
    const r = await timeIt(() => av.get(ctxA, { unitId: UP, from: D(0), to: D(365) }));
    const q = sqlCount(a) / 3;
    const days = Object.keys(r.last?.byDate ?? {});
    eq(days.length, 365, "จำนวนวัน");
    ok(Object.keys(r.last.byDate[days[0]] ?? {}).length === 4, "ประเภทใน byDate");
    ok(r.ms < 200, `median ${r.ms} ms (${r.all.join("/")}) ≥ 200`);
    ok(q <= 4, `คิวรี/รอบ ${q} > 4`);
    console.log(`     availability 100×365: ${r.ms} ms (${r.all.join("/")}) · ${q} คิวรี/รอบ`);
  });
  await st("P-3", "hotelToday บนฉาก 100 ห้อง < 500 ms (median 3) · ≤ 8 คิวรี · ตัวเลขตรงตัวอ้างอิงจากฐาน (inHouse/sellable/weekOccBps/adrSatang)", async () => {
    needTape(); needPerf();
    await todayKpi(UP);
    const a = SQL_LOG.length;
    const r = await timeIt(() => todayKpi(UP));
    const q = sqlCount(a) / 3;
    const ref = refToday(await snap(UP), D(0));
    eq([r.last.inHouse, r.last.sellable, r.last.weekOccBps, r.last.adrSatang], [ref.inHouse, ref.sellable, ref.weekOccBps, ref.adrSatang], "KPI");
    ok(r.ms < 500 && q <= 8, `median ${r.ms} ms · ${q} คิวรี`);
  }, "MAJOR");

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  const UI_FILES = [F.tapeChart, F.tapeBar, F.tapeKpis, F.blockDialog, F.moveDialog];
  await st("U-1", "ไฟล์ของใบครบ (§1): tape.ts · block.ts · TapeChart · TapeBar · TapeKpis · BlockDialog · MoveConfirmDialog · tape-shared.ts · HotelToday.tsx · hotel/calendar/page.tsx · ฉาก svc-qc-hotel-tape-scene.mts · docs/sds/modules/hotel.md", () => {
    const need = [F.tape, F.block, ...UI_FILES, F.tapeShared, F.hotelToday, F.calendarPage, F.scene, F.sds];
    eq(need.filter((f) => !has(f)), [], "ขาด");
  });
  await st("U-2", "ไทยทั้งหมด: ข้อความที่ผู้ใช้เห็นใน 5 คอมโพเนนต์ + HotelToday + หน้า calendar + หน้า /hotel ไม่มีคำอังกฤษ (ยกเว้น OTA · ADR · LINE · VAT ฯลฯ)", () => {
    const bad: string[] = [];
    for (const f of [...UI_FILES, F.hotelToday, F.calendarPage, F.hotelPage]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
  });
  await st("U-3", "'use client' ไม่ลาก prisma: 5 คอมโพเนนต์ + HotelToday มี 'use client' (หรือ HotelToday เป็น server component ที่ไม่ import tape.ts ตรง) · เดินกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · tape.ts/block.ts/booking.ts/service.ts · rooms/** (หยุดที่ขอบ \"use server\")", () => {
    const bad: string[] = [];
    for (const f of UI_FILES) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (!/^\s*["']use client["']/m.test(s)) bad.push(`${f} ไม่มี 'use client'`); bad.push(...clientReach(f)); }
    const ht = read(F.hotelToday);
    if (!ht) bad.push(`${F.hotelToday} ยังไม่มี`); else if (/^\s*["']use client["']/m.test(ht)) bad.push(...clientReach(F.hotelToday));
    eq(bad, [], "เส้นลากถึง server");
  });
  await st("U-4", "ลากด้วย pointer events ไม่มีไลบรารี (§1): TapeChart/TapeBar มี onPointerDown + onPointerMove + onPointerUp (หรือ setPointerCapture) · ไม่ import react-dnd/@dnd-kit/react-beautiful-dnd/interactjs/react-draggable/framer-motion · package.json ไม่เพิ่มไลบรารีลาก", () => {
    const s = read(F.tapeChart) + read(F.tapeBar);
    ok(s, "ยังไม่มี TapeChart/TapeBar");
    ok(/onPointerDown/.test(s) && /onPointerMove/.test(s) && (/onPointerUp/.test(s) || /onPointerCancel/.test(s)), "ไม่ใช้ pointer events ครบ down/move/up");
    ok(!/onMouseDown|onTouchStart|draggable=\{?true|onDragStart/.test(stripComments(s)), "ใช้ mouse/touch/HTML5 drag แทน pointer events");
    const srcAll = [...UI_FILES, F.tapeShared].map(read).join("\n");
    ok(!DRAG_LIBS.test(srcAll), "import ไลบรารีลาก");
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-D9): @dnd-kit/* อยู่ใน package.json ก่อน RUN (โมดูลอื่นใช้) — ตรวจเฉพาะบรรทัดที่ "เพิ่ม" เทียบฐานใบ e02e7e5a2 (H.3 merge)
    const pkgDiff = execFileSync("git", ["diff", "e02e7e5a2", "--", "package.json"], { encoding: "utf8" });
    ok(!/^\+.*"(react-dnd|@dnd-kit\/[a-z-]+|react-beautiful-dnd|@hello-pangea\/dnd|interactjs|react-draggable|sortablejs)"/m.test(pkgDiff), "package.json เพิ่มไลบรารีลาก");
  });
  await st("U-5", "read-only ไม่ render handle (มติ 7): TapeChart/TapeBar มี prop สิทธิ์ (canEdit|canDrag|readOnly|canManage) · handle ลาก/ยืดใช้ attribute ชื่อตายตัว data-drag-handle และ data-resize-handle และอยู่ใต้เงื่อนไข prop นั้น (600 ตัวอักษรก่อนหน้า) · onPointerDown ก็อยู่ใต้เงื่อนไขหรือ return เมื่อ read-only", () => {
    const s = stripComments(read(F.tapeChart) + "\n" + read(F.tapeBar));
    ok(s.trim(), "ยังไม่มี TapeChart/TapeBar");
    const guard = /canEdit|canDrag|readOnly|canManage|editable/;
    ok(guard.test(s), "ไม่มี prop สิทธิ์เขียน (canEdit/canDrag/readOnly/canManage)");
    for (const a of ["data-drag-handle", "data-resize-handle"]) { ok(s.includes(a), `ไม่มี attribute ${a} (ชื่อตายตัวตาม oracle)`); ok(nearWrite(s, a, guard), `${a} ไม่มีเงื่อนไขสิทธิ์ใกล้เคียง`); }
    ok(/(canEdit|canDrag|canManage|editable)\s*(&&|\?)|!readOnly\s*&&|readOnly\s*\?|if\s*\(\s*(!canEdit|!canDrag|readOnly|!canManage|!editable)\s*\)\s*return/.test(s), "ไม่มีการใช้ prop เป็นเงื่อนไข render/return");
  });
  await st("U-6", "มือถือ 390 (มติ 9): มีทางมือถือ (md:hidden/sm:hidden/lg:hidden หรือ matchMedia) เป็นรายการรายวันพร้อมปุ่ม «ย้ายห้อง»/«เลื่อน» เปิดไดอะล็อก · กริดเดสก์ท็อปอยู่ใน overflow-x-auto + data-scroll-hint · มีแถบเล็กสัปดาห์ (mini/strip) หรือข้อความ «สัปดาห์»", () => {
    const s = read(F.tapeChart) + read(F.tapeBar);
    ok(s, "ยังไม่มี TapeChart");
    ok(/(md|sm|lg):hidden|matchMedia|useMediaQuery|innerWidth/.test(s), "ไม่มีทางมือถือ");
    ok(/ย้ายห้อง/.test(s) && /เลื่อน/.test(s), "ไม่มีปุ่ม «ย้ายห้อง»/«เลื่อน» สำหรับมือถือ");
    ok(/overflow-x-auto/.test(s), "ไม่มี overflow-x-auto");
    ok(/data-scroll-hint/.test(s), "ไม่มี data-scroll-hint (ชื่อตายตัว)");
    ok(/สัปดาห์/.test(s), "ไม่มีแถบสัปดาห์/คำว่าสัปดาห์");
  });
  await st("U-7", "แท็บ: hotel-tabs-shared calendar available:true (แก้ค่าเดียว) · แท็บอื่นเท่าเดิม (การจอง/หน้าเคาน์เตอร์/ราคา/ตั้งค่า true · แม่บ้าน/รายงาน false) · hotelTabsFor frontdesk ⇒ [ปฏิทินห้อง · การจอง · หน้าเคาน์เตอร์ · ราคา] · ยัง pure", () => {
    const tabs = valOf(tabsSharedL, "HOTEL_TABS", F.tabsShared) as Any[];
    eq(tabs.map((t) => [t.key, t.available]), [["calendar", true], ["reservations", true], ["frontdesk", true], ["housekeeping", true], ["rates", true], ["reports", true], ["settings", true]], "available"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-U7-hk): H.6 เปิดแท็บแม่บ้าน // ORACLE-EDIT (ผู้คุม 8 พ.ย. · h7-tabs) H.7 เปิดแท็บรายงาน
    const f = fnOf(tabsSharedL, "hotelTabsFor", F.tabsShared);
    eq((f({ ratesRead: true, settingsEdit: false }, "/app/u/x") as Any[]).map((t) => t.labelTh), ["ปฏิทินห้อง", "การจอง", "หน้าเคาน์เตอร์", "แม่บ้าน", "ราคา"], "frontdesk"); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h2-U7-hk)
    eq((f({ ratesRead: true, settingsEdit: false }, "/app/u/x") as Any[])[0].href, "/app/u/x/hotel/calendar", "href");
    const s = stripComments(read(F.tabsShared));
    ok(!/["']use (client|server)["']/.test(s) && !/^\s*import\s/m.test(s), "shared ต้อง pure");
  });
  await st("U-8", "หน้า /hotel/calendar: requireUnit · \"HOTEL\" · notFound · สิทธิ์ดู = hotel.reservation.create ∨ hotel.booking.manage ∨ hotel.housekeeping (3 คีย์ในซอร์ส) · canEdit จาก hotel.booking.manage · อ่าน view (week|2w|month) + from จาก searchParams · import ผ่าน facade @/lib/modules/hotel (ไม่ชี้ tape.ts/block.ts ตรง) · ไม่อ่านสิทธิ์จาก URL", () => {
    const s = stripComments(read(F.calendarPage));
    ok(s, "ยังไม่มี calendar/page.tsx");
    const miss = ["requireUnit", "\"HOTEL\"", "notFound", "hotel.reservation.create", "hotel.booking.manage", "hotel.housekeeping", "searchParams", "week", "2w", "month"].filter((w) => !s.includes(w));
    eq(miss, [], "ขาด");
    ok(!/@\/lib\/modules\/hotel\/(tape|block|booking|availability|service)["']/.test(s), "import ตรงไฟล์ server (ต้องผ่าน facade)");
    ok(/tapeChart/.test(s), "ไม่เรียก tapeChart");
    ok(!/searchParams[^\n]*(perm|canEdit)|(perm|canEdit)[^\n]*searchParams/.test(s), "อ่านสิทธิ์จาก URL");
  });
  await st("U-9", "actions.ts: บล็อก // SVC H.2 ▸ … ◂ มี 4 action export async function (moveBookingAction · resizeBookingAction · blockRoomAction · releaseBlockAction) · ทุกตัวมีด่าน HOTEL + assertHotelCan(hotel.booking.manage) · ไม่ export type/const ในบล็อก · ไม่รับ `at` (มติ h.3 ข้อ 13)", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    const blk = /SVC H\.2 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.2 ▸ … ◂");
    const names = ["moveBookingAction", "resizeBookingAction", "blockRoomAction", "releaseBlockAction"];
    eq(names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/อยู่นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    eq(fns.filter((b) => !/assertHotelCan\s*\(|canHotel\s*\(/.test(b) || !/HOTEL/.test(b)).map((b) => b.split("(")[0]), [], "action ไม่มีด่าน HOTEL/assertHotelCan");
    ok(/hotel\.booking\.manage/.test(blk), "ไม่ใช้สิทธิ์ hotel.booking.manage");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(blk)), "export ที่ไม่ใช่ async function ในบล็อก");
    ok(!/\bat\s*[:?]/.test(stripComments(blk)), "action รับพารามิเตอร์ at");
  });
  await st("U-10", "หน้าเคาน์เตอร์ D1 (ภาพ 08 แถบบน): hotel/page.tsx ใช้ hotelToday (ผ่าน facade) + HotelToday.tsx · ไม่มี ModuleTabs ซ้อน · KPI 5 การ์ด «เข้าวันนี้» «ออกวันนี้» «พักอยู่คืนนี้» «แม่บ้าน» «สัปดาห์นี้» + «ADR» + «ปิดซ่อม» «รายเดือน» · คง checkInAction/checkOutAction · ตัวเลขจุลภาค (toLocaleString/Intl/จัดรูป)", () => {
    const p = stripComments(read(F.hotelPage)), c = read(F.hotelToday);
    ok(c, "ยังไม่มี HotelToday.tsx");
    ok(/hotelToday/.test(p + c), "ไม่ใช้ hotelToday");
    ok(!/ModuleTabs/.test(p + stripComments(c)), "ยังมี ModuleTabs");
    ok(!/@\/lib\/modules\/hotel\/tape["']/.test(p + c), "import tape.ts ตรง");
    eq(["เข้าวันนี้", "ออกวันนี้", "พักอยู่คืนนี้", "แม่บ้าน", "สัปดาห์นี้", "ADR", "ปิดซ่อม", "รายเดือน"].filter((w) => !(p + c).includes(w)), [], "ข้อความขาด");
    ok(/checkInAction/.test(p + c) && /checkOutAction/.test(p + c), "action เช็กอิน/เอาต์หาย");
    ok(/toLocaleString|Intl\.NumberFormat|fmtBaht|formatSatang|satangToBaht/.test(p + c), "ไม่จัดรูปตัวเลข");
  });
  await st("U-11", "tape-shared.ts pure (ไม่มี directive/import ถึง server): คำอธิบายแถบ 6 แบบ «พักอยู่» «จองแล้ว» «มาจาก OTA» «ถือไว้ รอมัดจำ» «ปิดซ่อม» «เช่ารายเดือน (ระบบหอ)» · ป้าย «ไม่นับรายเดือน/ซ่อม» · หมายเหตุ OTA «คีย์เอง» · ข้อความแถวว่าง «ยังไม่กำหนดห้อง» · ป้ายรายเดือน «ปล่อยรายเดือน (ระบบหอ)» · kind 6 ค่า", () => {
    const s = read(F.tapeShared);
    ok(s, "ยังไม่มี tape-shared.ts");
    ok(!/["']use (client|server)["']/.test(s), "มี directive");
    ok(!/@\/lib\/(core\/db|modules)/.test(stripComments(s)), "import ถึง server");
    const need = ["พักอยู่", "จองแล้ว", "มาจาก OTA", "รอมัดจำ", "ปิดซ่อม", "เช่ารายเดือน (ระบบหอ)", "ไม่นับรายเดือน/ซ่อม", "คีย์เอง", "ยังไม่กำหนดห้อง", "ปล่อยรายเดือน (ระบบหอ)"];
    eq(need.filter((w) => !s.replace(/\s+/g, " ").includes(w)), [], "ข้อความขาด");
    eq(["STAY", "CONFIRMED", "OTA", "HOLD", "BLOCK", "LEASE"].filter((k) => !s.includes(`"${k}"`)), [], "kind ขาด");
  });
  await st("U-12", "ลิงก์หอ (มติ 8): หน้า calendar/TapeChart ตัดสินด้วย dorm.view (คำว่า dorm.view ในซอร์ส) และ href รูป /dorm/tenants?room= · ไม่มีสิทธิ์ ⇒ ข้อความเฉย ๆ (เงื่อนไข prop/ฟิลด์ href ว่าง)", () => {
    const s = read(F.calendarPage) + read(F.tapeChart) + read(F.tapeBar) + read(F.tape);
    ok(read(F.calendarPage) || read(F.tape), "ยังไม่มีหน้า/tape.ts");
    ok(/dorm\.view/.test(s), "ไม่มี dorm.view");
    ok(/\/dorm\/tenants\?room=/.test(s), "ไม่มีลิงก์ /dorm/tenants?room=");
    ok(/href\s*(\?|&&|\?\?)|href\s*\?\s*<|\{href\s*\?/.test(read(F.tapeBar) + read(F.tapeChart)), "แถบ LEASE ไม่มีเงื่อนไข href");
  });
  await st("U-13", "ฝั่ง server: tape.ts/block.ts ใช้ tenantDb (ไม่ import { prisma } ดิบ) · block.ts ใช้ claimRoom/releaseOccupancy/setHkStatus/affectedByOutOfOrder จาก facade \"@/lib/modules/rooms\" (ไม่ล้วง subpath) + hotelHousekeepingLog + audit ใน $transaction · tape.ts อ่านอย่างเดียว (ไม่มี .create(/.update(/.delete() · refType \"HotelRoomBlock\" · ไม่แก้ booking.ts/availability.ts (ใช้ของ H.3)", () => {
    const t = stripComments(read(F.tape)), b = stripComments(read(F.block));
    ok(t && b, "ยังไม่มี tape.ts/block.ts");
    const bad: string[] = [];
    if (/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["']@\/lib\/core\/db["']/.test(t + b)) bad.push("import prisma ดิบ");
    if (!/tenantDb\s*\(/.test(t) || !/tenantDb\s*\(/.test(b)) bad.push("ไม่ใช้ tenantDb");
    if (/\.(create|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(t)) bad.push("tape.ts มีคิวรีเขียน");
    for (const w of ["claimRoom", "releaseOccupancy", "setHkStatus", "affectedByOutOfOrder"]) if (!b.includes(w)) bad.push(`block.ts ไม่ใช้ ${w}`);
    if (!/from\s*["']@\/lib\/modules\/rooms["']/.test(b)) bad.push("block.ts ไม่ import ผ่าน facade rooms");
    if (/@\/lib\/modules\/rooms\/(occupancy|service)/.test(t + b)) bad.push("ล้วง subpath rooms");
    if (!/hotelHousekeepingLog/.test(b)) bad.push("block.ts ไม่เขียน HousekeepingLog");
    if (!/writeAudit\s*\(|auditLog\.create\s*\(/.test(b)) bad.push("block.ts ไม่มี AuditLog");
    if (!/\$transaction\s*\(/.test(b)) bad.push("block.ts ไม่มี $transaction");
    if (!/HotelRoomBlock/.test(b)) bad.push("ไม่ใช้ refType HotelRoomBlock");
    eq(bad, [], "server");
  });
  await st("U-14", "docs/sds/modules/hotel.md §ปฏิทินห้อง: นิยามแถบ 6 แบบ (STAY CONFIRMED OTA HOLD BLOCK LEASE) · กติกาลาก (CHECKED_IN เลื่อนวันเข้าไม่ได้) · BLOCK (HotelRoomBlock · OUT_OF_ORDER · DIRTY) · สูตร occupied/sellable", () => {
    const s = read(F.sds);
    ok(/ปฏิทินห้อง/.test(s), "ไม่มี §ปฏิทินห้อง");
    const sec = s.slice(s.indexOf("ปฏิทินห้อง"));
    eq(["STAY", "CONFIRMED", "OTA", "HOLD", "BLOCK", "LEASE", "HotelRoomBlock", "OUT_OF_ORDER", "DIRTY", "sellable", "CHECKED_IN"].filter((w) => !sec.includes(w)), [], "ขาด");
  }, "MINOR");
  await st("U-15", "ฉาก svc-qc-hotel-tape-scene.mts: อ่าน SQC_HOTEL_TAPE_SCENE จากฟิกซ์เจอร์ (ไม่มีตัวเลขฉากในสคริปต์: ไม่มี \"B103\"/ชื่อแขก) · รองรับ --clear · พิมพ์ SCENE_SUMMARY · เขียนผ่าน createBooking/assignRoom/takeBookingDeposit/blockRoom/checkIn (ไม่ hotelReservation.create/roomOccupancy.create ตรง) · ตั้ง SVC_QC_CLOCK=1 เอง · loadSvcQcEnv", () => {
    const s = read(F.scene);
    ok(s, `ยังไม่มี ${F.scene}`);
    const sc = stripComments(s);
    const bad: string[] = [];
    if (!/SQC_HOTEL_TAPE_SCENE/.test(sc)) bad.push("ไม่อ่าน SQC_HOTEL_TAPE_SCENE");
    if (/["']B103["']|คุณวิชัย|งานแต่งคุณเมย์/.test(sc)) bad.push("ตัวเลข/ชื่อฉากฝังในสคริปต์");
    if (!/--clear/.test(s)) bad.push("ไม่มี --clear");
    if (!/SCENE_SUMMARY/.test(s)) bad.push("ไม่พิมพ์ SCENE_SUMMARY");
    for (const w of ["createBooking", "assignRoom", "takeBookingDeposit", "blockRoom", "checkIn"]) if (!sc.includes(w)) bad.push(`ไม่เรียก ${w}`);
    if (/hotelReservation\.create|hotelBookingNight\.create|roomOccupancy\.create/.test(sc)) bad.push("insert ตาราง Hotel*/RoomOccupancy ตรง");
    if (!/SVC_QC_CLOCK/.test(sc)) bad.push("ไม่ตั้ง SVC_QC_CLOCK");
    if (!/loadSvcQcEnv/.test(sc)) bad.push("ไม่มี loadSvcQcEnv");
    eq(bad, [], "ฉาก");
  });
  await st("U-16", "ไดอะล็อก: MoveConfirmDialog แสดง ห้องเดิม→ใหม่ · วันเดิม→ใหม่ · ราคาใหม่ (quote) · «ไม่คิดส่วนต่างเมื่อย้ายประเภท» · ปุ่มยืนยัน/ยกเลิก · BlockDialog มีช่องเหตุผล (reason) + วันเริ่ม/จบ + เตือน «เกินจอง» · ทั้งคู่ 'use client'", () => {
    const m = read(F.moveDialog), b = read(F.blockDialog);
    ok(m && b, "ยังไม่มี MoveConfirmDialog/BlockDialog");
    eq(["ห้องเดิม", "ไม่คิดส่วนต่าง", "ยืนยัน", "ยกเลิก"].filter((w) => !m.replace(/\s+/g, "").includes(w.replace(/\s+/g, ""))), [], "MoveConfirmDialog ขาด");
    ok(/quote|ราคาใหม่|ราคา/.test(m), "ไม่แสดงราคาใหม่");
    eq(["เหตุผล", "เกินจอง", "ปิดห้อง"].filter((w) => !b.includes(w)), [], "BlockDialog ขาด");
    ok(/reason/.test(b), "BlockDialog ไม่มีฟิลด์ reason");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.tape, F.block, F.index, F.actions, ...UI_FILES, F.tapeShared, F.hotelToday, F.tabsShared, F.calendarPage, F.hotelPage, F.scene, F.sds]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs", "package.json", "pnpm-lock.yaml"]).filter((f) => f !== "scripts/qc-svc-h.2.mts");
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.tape}`]); return true; } catch { return false; } })();
    if (!has(F.tape) && !headHas) record("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "FAIL", `ยังไม่มีงาน (${F.tape}) — ข้อนี้ตรวจ git status ของทรีงานตอนรับใบ`, "CRITICAL");
    else if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.2 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): tape · block · index · actions · 5 คอมโพเนนต์ · tape-shared · HotelToday · hotel-tabs-shared · calendar/page · hotel/page · ฉาก · sds — ไม่แตะ package.json/lockfile", () => {
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
    await st("F-2", "แก้ไฟล์ร่วมแบบเพิ่มอย่างเดียว: index.ts/actions.ts ไม่ลบบรรทัด · hotel-tabs-shared.ts เปลี่ยนบรรทัดเดียว (calendar available) · hotel/page.tsx แก้ได้ (D1 ใหม่) แต่ยังมี checkInAction/checkOutAction", () => {
      ok(has(F.tape) || headHas, `ยังไม่มีงาน (${F.tape})`);
      const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
      const bad: string[] = [];
      for (const f of [F.index, F.actions]) if (dirty([f]).length && rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
      if (dirty([F.tabsShared]).length) { const minus = diffLines(F.tabsShared).filter((l) => l.startsWith("-")); if (minus.length !== 1 || !/calendar/.test(minus[0])) bad.push(`hotel-tabs-shared เปลี่ยน ${minus.length} บรรทัด: ${minus.join(" | ").slice(0, 120)}`); }
      eq(bad, [], "ไฟล์ร่วม");
    }, "MAJOR");
    await st("F-3", "ไม่แตะชิ้นต้องห้าม (§1): booking.ts · availability.ts · prisma/** · src/lib/modules/rooms/** · src/lib/core/** · หน้าหอ (src/app/app/u/[unitSlug]/dorm · components/dorm) · svc-qc-data.mts · ข้อสอบอื่น (qc-svc-h.0/h.1/h.3) · ฉาก h.3", () => {
      ok(has(F.tape) || headHas, `ยังไม่มีงาน (${F.tape})`);
      const banned = dirty([F.booking, F.avail, "prisma", "src/lib/modules/rooms", "src/lib/core", "src/app/app/u/[unitSlug]/dorm", "src/components/dorm", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.3.mts", F.sceneH3]);
      eq(banned, [], "ไฟล์ต้องห้าม");
    });
  }
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h2-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/RoomOccupancy/HousekeepingLog/AuditLog) · ผู้ใช้ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc (SQC_HOTEL_TAPE_SCENE · ภาพ 08) ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-tape-scene) ──");
{
  let why = "";
  const unitId = SQC_UNITS.hotel.id;
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const nr = t ? await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId, active: true } }) : 0;
    const plans = t && H0_OK ? await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId, status: "ACTIVE" } }) : 0;
    if (!t || nr !== 14) why = `ร้าน svcqc/หน่วย hotel ยังไม่ seed ครบบนฐาน l3 (ห้อง ${nr}/14 — scripts/seed-svc-qc.mts)`;
    else if (!H0_OK) why = H0_WHY;
    else if (H3_WHY) why = H3_WHY;
    else if (typeof tapeL.mod?.tapeChart !== "function" || typeof blockL.mod?.blockRoom !== "function") why = `ยังไม่มี ${F.tape}/${F.block} (H.2)`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else if (plans === 0) why = `ฉาก h.1 (แผนราคา) ยังไม่รันบน svcqc — รัน ${F.sceneH1} ก่อน (createBooking ต้องมีราคา)`;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runTsx = (rel: string, args: string[] = []) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, SVC_QC_CLOCK: "1" }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const n1 = `ฉาก ${F.scene}: (--clear ฉาก h.3 ก่อน) รันได้ exit 0 · SCENE_SUMMARY มี id ต่อ key + blockId · HotelReservation ที่ note มี mark 13 แถว (สถานะ CHECKED_IN 3 · CONFIRMED 9 · HOLD 1) · ห้องตาม pinRooms · BLOCK B103 วันนี้ 3 คืน active · B103 hkStatus OUT_OF_ORDER · ร้านอื่นไม่เปลี่ยน`;
  const n2 = "hotelToday บนฉาก = expectToday (เข้า 2 · ออก 1 · พักอยู่ 4 · ปิดซ่อม 1 · ขายได้ 12 · ชื่อเข้า/ออกตามฟิกซ์เจอร์)";
  const n3 = "tapeChart 7 วันบนฉาก: นับแถบตาม kind = expectBars7d (STAY 3 · CONFIRMED 7 · OTA 2 · HOLD 1 · BLOCK 1) · occupancy คืนนี้ 5/12 · แถว 13 ห้อง (B205 รายเดือนไม่อยู่ในแถว) · กลุ่ม 3 ประเภทพร้อมราคา H.1 (99,000 · 129,000/149,000 · 189,000/219,000)";
  const n4 = "รันฉากซ้ำ ⇒ idempotent (SCENE_SUMMARY เท่าเดิม · แถว mark ยัง 13 · BLOCK ยัง 1)";
  const n5 = "--clear ⇒ แถว mark 0 · BLOCK B103 inactive · hkStatus B103 ไม่ใช่ OUT_OF_ORDER · ห้อง/ประเภท/แผนราคาคงเดิม · แล้วรันคืนให้ถ่ายภาพ";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3], ["Q-4", n4], ["Q-5", n5]]) skip(id, n, why, "MAJOR"); }
  else {
    const c = { tenantId: SQC_TENANT.id };
    const markRows = () => prisma.hotelReservation.findMany({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: SCENE.mark } }, select: { id: true, status: true, roomId: true, guestName: true, room: { select: { number: true } } } }) as Promise<Any[]>;
    const b103 = async () => prisma.hotelRoom.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, number: "B103" }, select: { id: true, hkStatus: true } }) as Promise<Any>;
    const blocksOn = async (roomId: string) => prisma.roomOccupancy.findMany({ where: { tenantId: SQC_TENANT.id, unitId, roomId, kind: "BLOCK", active: true } }) as Promise<Any[]>;
    const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.roomOccupancy.count({ where: { NOT: { tenantId: SQC_TENANT.id } } })]);
    let firstSum: Any = null;
    await st("Q-1", n1, async () => {
      if (has(F.sceneH3)) runTsx(F.sceneH3, ["--clear"]);
      runTsx(F.scene, ["--clear"]);
      const o0 = await otherSig();
      const a = runTsx(F.scene);
      firstSum = summary(`${a.stdout}`);
      ok(a.status === 0 && firstSum && typeof firstSum === "object", `exit=${a.status} ${firstSum ? fmt(firstSum) : `${a.stdout}${a.stderr}`.split("\n").slice(-3).join(" | ").slice(0, 240)}`);
      ok(typeof firstSum.blockId === "string" || typeof firstSum.blocks?.B103 === "string" || J(firstSum).includes("block"), `SCENE_SUMMARY ไม่มี blockId: ${fmt(firstSum)}`);
      const rows = await markRows();
      eq(rows.length, 13, "แถว mark");
      const by: Record<string, number> = {}; for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
      eq(by, { CHECKED_IN: 3, CONFIRMED: 9, HOLD: 1 }, "สถานะ");
      const pinned = (SCENE.bookings as readonly SceneRow[]).flatMap((b) => (b.pinRooms ?? []).map((p) => [b.guest, p]));
      for (const [guest, room] of pinned) ok(rows.some((r) => r.guestName === guest && r.room?.number === room), `${guest} ไม่ได้ห้อง ${room}`);
      const r103 = await b103();
      const bl = await blocksOn(r103.id);
      eq(bl.map((o) => [ymdOfDb(o.startDate), ymdOfDb(o.endDate), o.refType]), [[D(0), D(3), "HotelRoomBlock"]], "BLOCK B103");
      eq(r103.hkStatus, "OUT_OF_ORDER", "hkStatus B103");
      eq(await otherSig(), o0, "ร้านอื่นเปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const k = await TAPE("hotelToday")(c, { unitId });
      const E = SCENE.expectToday;
      eq([k.arrivals, k.departures, k.inHouse, k.blocked, k.sellable], [E.arrivals, E.departures, E.inHouseTonight, E.blocked, E.sellable], "KPI");
      const arr = (k.arrivalNames ?? k.names?.arrivals ?? []) as string[], dep = (k.departureNames ?? k.names?.departures ?? []) as string[];
      eq([[...arr].sort(), dep], [[...E.arrivalNames].sort(), [...E.departureNames]], "ชื่อ");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const t = await TAPE("tapeChart")(c, { unitId, from: D(0), days: 7 });
      const bars: Any[] = (t.groups ?? []).flatMap((g: Any) => [...g.rooms.flatMap((r: Any) => r.bars), ...g.unassigned]);
      const cnt: Record<string, number> = { STAY: 0, CONFIRMED: 0, OTA: 0, HOLD: 0, BLOCK: 0 };
      for (const b of bars) if (b.kind in cnt) cnt[b.kind]++;
      eq(cnt, { ...SCENE.expectBars7d }, "แถบ 7 วัน");
      eq([t.occupancy?.[0]?.occupied, t.occupancy?.[0]?.sellable], [SCENE.expectToday.occupiedBarTonight, SCENE.expectToday.sellable], "คืนนี้");
      const nums = (t.groups ?? []).flatMap((g: Any) => g.rooms.map((r: Any) => r.number));
      eq(nums.length, 13, `แถว ${J(nums)}`);
      ok(!nums.includes("B205"), "B205 (MONTHLY) อยู่ในแถว");
      eq((t.groups ?? []).map((g: Any) => [g.name, g.rateTodaySatang, g.rateWeekendSatang]), [["ซูพีเรีย", 99_000, 99_000], ["ดีลักซ์", dowOf(D(0)) >= 5 ? 149_000 : 129_000, 149_000], ["แฟมิลี", dowOf(D(0)) >= 5 ? 219_000 : 189_000, 219_000]], "หัวกลุ่ม (ฉาก h.1 ไม่มีฤดู/แก้มือในสัปดาห์นี้ · ถ้าวันที่ 14 อยู่ในสัปดาห์ ดีลักซ์อาจต่าง — ดู wo-notes)");
    }, "MAJOR");
    await st("Q-4", n4, async () => {
      const b = runTsx(F.scene);
      const s2 = summary(`${b.stdout}`);
      ok(b.status === 0 && s2, `exit=${b.status}`);
      eq(J(s2), J(firstSum), "SCENE_SUMMARY ต่าง");
      eq((await markRows()).length, 13, "แถวเพิ่ม");
      eq((await blocksOn((await b103()).id)).length, 1, "BLOCK เพิ่ม");
    }, "MAJOR");
    await st("Q-5", n5, async () => {
      const nt = await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId } }), nr = await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), np = await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId } });
      const cl = runTsx(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      eq((await markRows()).length, 0, "แถว mark ค้าง");
      const r103 = await b103();
      eq((await blocksOn(r103.id)).length, 0, "BLOCK ค้าง");
      ok(r103.hkStatus !== "OUT_OF_ORDER", `hkStatus B103 ${r103.hkStatus}`);
      eq([await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } }), await prisma.hotelRatePlan.count({ where: { tenantId: SQC_TENANT.id, unitId } })], [nt, nr, np], "ลบเกิน");
      const back = runTsx(F.scene);
      ok(back.status === 0 && (await markRows()).length === 13, "รันคืน");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.2 ด้วย owner · frontdesk (ลากได้) · maid (อ่านอย่างเดียว ไม่มี handle) · 4 ใบ × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมเทียบ PARITY ภาพ 08 (ปฏิทิน) + แถบ KPI บนหน้าเคาน์เตอร์";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1 → h.3 --clear → h.2 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
  else {
    const bad: string[] = [];
    for (const user of ["owner", "frontdesk", "maid"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.2", "--user", user, "--base", base], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression (หลังล้างข้อมูล) ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): { failed: string[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed: string[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed.length ?? 1) === 0;
const judgeAllow = (allow: string[]) => (out: string) => { const f = summaryOf(out)?.failed; return Array.isArray(f) && f.every((id) => allow.includes(id)); };
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (ฐานของการลาก)" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeAllow(["U-4"]), note: "ไม่มี FAIL ยกเว้น U-4 (แท็บ calendar เปิด — ใบ h.2 §6 ให้ผู้คุม ORACLE-EDIT h.1 U-4 ตอนรับใบ)" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.8", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (แกนห้อง)" },
  { s: "qc-svc-r0.9", args: ["--no-regression"], judge: judgeAllow(["G-1"]), note: "ไม่มี FAIL ยกเว้น G-1 (ยอมตามใบ)" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (หอไม่เปลี่ยน)" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof tapeL.mod?.tapeChart === "function" && typeof blockL.mod?.blockRoom === "function";
  const why = !hasWork ? `ยังไม่มีงานของใบ (${F.tape} tapeChart / ${F.block} blockRoom) — regression รันเมื่อมีงาน` : NO_REG ? "--no-regression / SVC_H2_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", `ไม่มีไฟล์ชุด scripts/${g.s}.mts`, "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h2-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const byGroup: Record<string, { total: number; passed: number; failed: number; skipped: number }> = {};
for (const c of cks) { const g = (byGroup[groupOf(c.id)] ??= { total: 0, passed: 0, failed: 0, skipped: 0 }); g.total++; if (c.res === "PASS") g.passed++; else if (c.res === "FAIL") g.failed++; else g.skipped++; }
console.log(`\n===== QC SVC H.2 · ปฏิทินห้อง (tape chart) + ปิดห้อง + KPI หน้าเคาน์เตอร์ =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
