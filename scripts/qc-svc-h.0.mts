// QC — SVC H.0 · migration `svc_h` (โรงแรม V2: ราคา · คืนรายแถว · folio · ทะเบียนแขก · audit · OTA) + backfill การจองเดิม + ด่าน type HOTEL + scope/registry
// oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes · ผู้คุมตัดสิน · ORACLE-EDIT เฉพาะผู้คุม)
// สัญญา: ledger/svc-briefs/svc-brief-h.0.md (ตาราง §2 ผูกตรงตัว · backfill §3 · migration §4 · scope §5 · ค่าตั้ง §6 · สิทธิ์ §7 · ด่าน §8 · regression §9 · เกณฑ์รับ §10)
//        ledger/SVC-HOTEL-PLAN.md §2 (มติเทคนิค 14 ข้อ) · ledger/SVC-RUN.md §1 (กติกาเหล็ก) §1.5 (กลุ่ม X) · แม่แบบ scripts/qc-svc-d.0.mts + harness scripts/qc-svc-d.19.mts
//
// กลุ่มข้อ:
//   PC  ตัวควบคุม (เขียวตั้งแต่ก่อนมีงาน): ฐาน QC ต่อได้ · ฟิกซ์เจอร์ H 3 แผน · HotelReservation มีคอลัมน์ P1 ครบ · service/settings เดิมโหลดได้ · enum/scope/สิทธิ์เดิม · storefront ตรวจ HOTEL แล้ว
//   T   ตารางใหม่ 17 ตัว (§2.4–2.14) + คอลัมน์ใหม่ HotelReservation/HotelRoomType/HotelRoom (§2.1–2.3) ตรงชุด (ชนิด · null · default) จาก information_schema · enum ต่อท้าย · เงิน integer · ไม่มี HotelChannelConnection/HotelRoomBlock
//   (มติ §12 ข้อ 10: HotelSeason.minNights Int? + CHECK IS NULL OR >= 1 — T-5 · C-3)
//   K   FK ตรงชุด + onDelete (Restrict/Cascade/SetNull) พิสูจน์จริง · C  CHECK ทุกตัวของ §2 (ค่าผิดถูกปฏิเสธ 23514 · ค่าถูกผ่าน) · U  unique/partial unique/NULLS NOT DISTINCT/ดัชนี (+ ไม่มี partial unique (roomId,date) บน BookingNight)
//   M   migration `<ts>_svc_h` ตัวเดียว (ts > 20261226000000) · additive · ALTER TYPE ADD VALUE 3 ค่าแยก statement · แตะเฉพาะตารางของใบ · SQL มือครบ · ลงฐานแล้ว · migrate diff ไม่เสนออะไรกับตารางของใบ · schema แตะเฉพาะไฟล์ของใบ
//   S   scope.ts 17 โมเดล = unit · fitness F1 (2 โหมด) · Prisma client มีโมเดล/ฟิลด์ใหม่ + boot assert
//   R   ทะเบียนค่าตั้ง (§6): เปิด PHASE_H · คีย์ใหม่ 17 ตัว (ชนิด/ค่าเริ่ม/chain/schema) · deposit FIXED_AMOUNT · cancelPolicy 7d/3d/0 · ota.* = CHANNEL_MANAGER · SNAPSHOTS.reservation · editPermission hotel.settings.edit · คีย์หอไม่เปลี่ยนแม้ไบต์เดียว (เทียบฐาน a9aad92d8)
//   RP  scope RATE_PLAN ใช้ได้จริง (setSettings/resolveSetting/refsFor/entitiesOfUnit/reset/diff · แผนร้าน B = ไม่พบ)
//   P   สิทธิ์ 13 คีย์ใหม่โมดูล hotel ป้ายไทย · คีย์เดิม 10 ตัวไม่เปลี่ยน (X9)
//   B   backfill scripts/svc-h0-backfill.mts (--dry · BACKFILL_SUMMARY 5 ฟิลด์ · BOOKED→CONFIRMED · nights · occupancy ผ่าน facade ไม่ทับ · folio+DEPOSIT · รันซ้ำ 0 · แยกร้าน)
//   D   ด่าน type HOTEL (actions ทุกตัว + 3 หน้า) · V  หน้า /app/u/<dorm>/hotel 404 (ต้องมี QC_BASE) · G  regression §9 (ลูกโพรเซส · --no-regression = SKIP)
//
// กลุ่ม X (SVC-RUN §1.5): X1 = RP-2/RP-3 (แผนร้าน B) + B-11 (backfill แถวใหม่ถือ tenantId/unitId ของร้านตัวเอง · ร้านที่ไม่มี BOOKED ไม่เปลี่ยน) · X9 = P-* (คีย์สิทธิ์ใหม่ลงทะเบียน)
//   X3 ไม่เกี่ยว (ใบนี้ไม่มีเส้นเขียนพร้อมกัน — createBooking/advisory lock = H.3) · X4/X5 ไม่เกี่ยว (ไม่มี consumer/งานตามเวลาใหม่ · backfill รันซ้ำ = B-10) · X6 ไม่เกี่ยว (ไม่มีนำเข้า/ไฟล์)
//   X7 ไม่เกี่ยว (ไม่มี endpoint สาธารณะใหม่) · X8 ไม่เกี่ยว (ไม่มีการส่งข้อความ · idNumberEnc = H.4) · X10 ไม่เกี่ยว (ไม่มี DTO/ไฟล์ใหม่)
//
// 🔴 ตัดสินโครงฐานจาก DB จริงด้วย `pg` (ไม่พึ่ง client) · service/settings/backfill ผ่านโค้ดจริง · ทุกแถวทดสอบอยู่ใต้ร้านชั่วคราว slug `svc-h0-*` (ผู้ใช้ `svc-h0-*@shark.local`) · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// 🔴 อ่านร้าน svcqc อย่างเดียว (V ใช้ session ของเจ้าของ svcqc แล้วลบ) · วันที่สัมพัทธ์กับวันไทยวันนี้ (ไม่มีวันที่ตายตัว)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.0.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill กลางคัน · `--no-regression` = G เป็น SKIP ไม่นับผ่าน · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
// ผลที่ถูกต้องก่อนมี H.0: PC เขียว · T/K/C/U/M/S/R/RP/P/B/D แดงด้วยเหตุผล "ยังไม่มี…" · G/V SKIP
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_RATES } from "./svc-qc-data.mjs";

type Any = any;
const SELF_PATH = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF_PATH), "..");
const LABEL = "qc-svc-h.0";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H0_NO_REGRESSION === "1";
const BASE_SHA = "a9aad92d8"; // tip ของ session/svc ก่อน H.0 (ฟิกซ์เจอร์ H ลงแล้ว) — ฐานเทียบของหมวด R/P/S/M
const PREV_MIG = "20261226000000_svc_b17";
const MIN_TS = "20261226000000";
const F = {
  hotelPrisma: "prisma/schema/hotel.prisma",
  integrationPrisma: "prisma/schema/integration.prisma",
  scope: "src/lib/core/scope.ts",
  rooms: "src/lib/core/settings/defs/rooms.ts",
  settingsService: "src/lib/core/settings/service.ts",
  permissions: "src/lib/core/permissions.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  hotelService: "src/lib/modules/hotel/service.ts",
  pages: ["src/app/app/u/[unitSlug]/hotel/page.tsx", "src/app/app/u/[unitSlug]/hotel/reservations/page.tsx", "src/app/app/u/[unitSlug]/hotel/setup/page.tsx"],
  backfill: "scripts/svc-h0-backfill.mts",
  fitness: "scripts/fitness.mts",
} as const;

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }

// ═══════════════ harness (แบบ d.19) ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 220) ?? String(v); } catch { return String(v); } };
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
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const THAI = /[฀-๿]/;
const tryImport = async (spec: string): Promise<{ mod: Any; err: string }> => { try { return { mod: await import(spec), err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; } };
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
/** ไฟล์ที่ต่างจาก BASE (ไม่นับช่องว่าง) + ไฟล์ใหม่ที่ยังไม่ track ใต้ paths */
const changedFiles = (paths: string[]): string[] => {
  const a = git(["diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
/** บรรทัด +/- (ไม่นับคอมเมนต์ // และบรรทัดว่าง) ของไฟล์เดียวเทียบ BASE */
const diffLines = (file: string, sign: "+" | "-"): string[] =>
  git(["diff", "-w", "--ignore-blank-lines", "-U0", BASE_SHA, "--", file]).split("\n")
    .filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3)))
    .map((l) => l.slice(1).replace(/\/\/.*$/, "").trim()).filter(Boolean);
const DAY = 86_400_000;
const thaiYmd = (d: Date | string | number) => new Date(new Date(d).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const TODAY = thaiYmd(Date.now());
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ymdOfDb = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const STAMP = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const rid = (p: string) => `svch0_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const SLUG = "svc-h0-";
const EMAIL_PREFIX = "svc-h0-";
const pgCode = (e: unknown): string => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");

// ═══════════════ สเปก (ใบสั่ง §2 · §5 · §6 · §7) ═══════════════
const NEW_MODELS = [
  "HotelRatePlan", "HotelSeason", "HotelHoliday", "HotelRate", "HotelRateOverride", "HotelCancelRule", "HotelBookingNight", "HotelFolio", "HotelFolioItem",
  "HotelGuestRecord", "HotelHousekeepingLog", "HotelNightAudit", "ChannelRoomMap", "ChannelRateMap", "ChannelAriJob", "ChannelReservationInbox", "ChannelInventoryBuffer",
] as const;
const OLD_TOUCHED = ["HotelReservation", "HotelRoomType", "HotelRoom"] as const;
const FK_REF_OK = new Set(["HotelRatePlan", "HotelRoomType", "HotelSeason", "HotelReservation", "HotelFolio", "HotelRoom"]);
const OLD_STATUS = ["BOOKED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "REFUNDED"];
const NEW_STATUS = [...OLD_STATUS, "HOLD", "CONFIRMED", "NO_SHOW"];
const RESV_P1_COLS = ["id", "tenantId", "unitId", "code", "publicToken", "status", "guestName", "guestPhone", "guestEmail", "customerId", "roomTypeId", "roomId", "checkInDate", "checkOutDate", "nights", "adults", "children", "ratePerNightSatang", "totalSatang", "depositSatang", "depositPaidAt", "depositSaleId", "note", "checkedInAt", "checkedOutAt", "cancelledAt", "cancelReason", "refundedAt", "createdById", "partyId", "createdAt", "updatedAt"];
const ROOMTYPE_P1_COLS = ["id", "tenantId", "unitId", "name", "code", "description", "capacity", "baseRateSatang", "depositSatang", "active", "sortOrder", "monthlyRateSatang", "areaSqm", "rentMode", "amenities", "createdAt", "updatedAt"];
const ROOM_P1_COLS = ["id", "tenantId", "unitId", "roomTypeId", "number", "floor", "status", "active", "note", "buildingId", "floorNo", "rentMode", "hkStatus", "createdAt", "updatedAt"];
const NEW_PERMS: Record<string, string> = {
  "hotel.rates.read": "ดูราคาห้องพัก",
  "hotel.rates.write": "ตั้งราคา/ฤดู/แผนราคา",
  "hotel.settings.edit": "ตั้งค่าโรงแรม",
  "hotel.booking.manage": "จัดการการจอง (ย้าย/ต่อ/ย่น/ไม่มา)",
  "hotel.folio.post": "ลงรายการบิลห้อง",
  "hotel.folio.void": "ยกเลิกรายการบิลห้อง",
  "hotel.guest.register": "ลงทะเบียนผู้เข้าพัก (ร.ร.3/ตม.30)",
  "hotel.guest.viewId": "ดูเลขบัตร/พาสปอร์ตเต็ม",
  "hotel.housekeeping": "แม่บ้าน",
  "hotel.housekeeping.inspect": "ตรวจห้องแม่บ้าน",
  "hotel.audit.run": "ปิดวัน (night audit)",
  "hotel.reports.read": "รายงานโรงแรม",
  "hotel.channel.manage": "ช่องทาง OTA",
};
const OLD_PERMS: Record<string, string> = {
  "hotel.reservation.create": "สร้างการจองห้องพัก",
  "hotel.reservation.checkIn": "เช็คอิน",
  "hotel.reservation.checkOut": "เช็คเอาท์",
  "hotel.reservation.cancel": "ยกเลิกการจอง",
  "hotel.reservation.refund": "คืนเงินการจอง",
  "hotel.room.create": "เพิ่มห้องพัก",
  "hotel.room.delete": "ลบห้องพัก",
  "hotel.room.setStatus": "เปลี่ยนสถานะห้องพัก",
  "hotel.roomType.create": "เพิ่มประเภทห้องพัก",
  "hotel.roomType.delete": "ลบประเภทห้องพัก",
};
const SNAP_RESERVATION = [
  "rooms.hotel.checkInTime", "rooms.hotel.checkOutTime", "rooms.hotel.deposit", "rooms.hotel.cancelPolicy", "rooms.hotel.noShow", "rooms.hotel.holdMinutesOnline", "rooms.hotel.holdMinutesCounter",
  "rooms.hotel.minNights", "rooms.hotel.securityDeposit", "rooms.hotel.securityDeposit.enabled", "rooms.hotel.tax.mode", "rooms.hotel.tax.vatBp", "rooms.hotel.tax.serviceChargeBp", "rooms.money.rounding", "rooms.locale.docLanguage",
];
type KeySpec = { key: string; type: string; def: unknown; chain: string[]; money?: boolean; okVals: unknown[]; badVals: unknown[] };
const NEW_KEYS: KeySpec[] = [
  { key: "rooms.hotel.bookingMode", type: "enum", def: "DEPOSIT_REQUIRED", chain: ["UNIT"], okVals: ["AUTO_CONFIRM", "DEPOSIT_REQUIRED", "MANUAL_APPROVE"], badVals: ["HOLD", 1] },
  { key: "rooms.hotel.weekendDays", type: "table", def: [5, 6], chain: ["UNIT"], okVals: [[5, 6], [0], []], badVals: [[7], [-1], "5,6"] },
  { key: "rooms.hotel.dailyHousekeeping", type: "bool", def: true, chain: ["UNIT", "ROOM_TYPE"], okVals: [true, false], badVals: ["yes"] },
  { key: "rooms.hotel.inspectionRequired", type: "bool", def: false, chain: ["UNIT"], okVals: [true, false], badVals: [1] },
  { key: "rooms.hotel.maxAdvanceBookingDays", type: "int", def: 365, chain: ["UNIT"], okVals: [1, 730], badVals: [0, 731, 1.5] },
  { key: "rooms.hotel.codePrefix", type: "text", def: "HR", chain: ["UNIT"], okVals: ["H", "HOTEL1"], badVals: ["", "HOTEL12"] },
  { key: "rooms.hotel.tax.mode", type: "enum", def: "INCLUSIVE", chain: ["UNIT"], okVals: ["INCLUSIVE", "EXCLUSIVE"], badVals: ["NONE"] },
  { key: "rooms.hotel.tax.vatBp", type: "percent", def: 700, chain: ["UNIT"], money: true, okVals: [0, 700, 10_000], badVals: [-1, 10_001] },
  { key: "rooms.hotel.tax.serviceChargeBp", type: "percent", def: 0, chain: ["UNIT"], money: true, okVals: [0, 1000, 10_000], badVals: [-1, 10_001] },
  { key: "rooms.hotel.tax.invoiceFromPos", type: "bool", def: true, chain: ["UNIT"], okVals: [true, false], badVals: ["true"] },
  { key: "rooms.hotel.securityDeposit.enabled", type: "bool", def: false, chain: ["UNIT", "ROOM_TYPE"], okVals: [true, false], badVals: [0] },
  { key: "rooms.hotel.securityDeposit.appliesTo", type: "enum", def: "ALL", chain: ["UNIT"], okVals: ["ALL", "WALK_IN"], badVals: ["OTA"] },
  { key: "rooms.hotel.guest.retainYears", type: "int", def: 2, chain: ["UNIT"], okVals: [1, 10], badVals: [0, 11] },
  { key: "rooms.hotel.guest.maskIdForStaff", type: "bool", def: true, chain: ["UNIT"], okVals: [true, false], badVals: ["x"] },
  { key: "rooms.hotel.guest.aiIdReader", type: "bool", def: false, chain: ["UNIT"], okVals: [true, false], badVals: [null] },
  { key: "rooms.hotel.notify.channel", type: "enum", def: "EMAIL", chain: ["UNIT"], okVals: ["EMAIL", "LINE", "BOTH"], badVals: ["SMS"] },
  { key: "rooms.hotel.storefront.customDomain", type: "bool", def: false, chain: ["UNIT"], okVals: [true, false], badVals: ["on"] },
];

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SET: Any = (await tryImport("@/lib/core/settings")).mod;
const SETSVC: Any = (await tryImport("@/lib/core/settings/service")).mod;
const SCOPE: Any = (await tryImport("@/lib/core/scope")).mod;
const PERM: Any = (await tryImport("@/lib/core/permissions")).mod;
const HOTEL: Any = (await tryImport("@/lib/modules/hotel/service")).mod;
const CLIENT: Any = (await tryImport("@prisma/client")).mod;

// ═══════════════ pg (โครงฐานจริง) ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null; udt_name: string };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string, fresh = false) => {
  if (fresh || !colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default, udt_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [table]));
  return colCache.get(table) ?? [];
};
const tableExists = async (t: string) => (await cols(t)).length > 0;
const needTable = async (t: string) => { if (!(await tableExists(t))) throw new AssertFail(`ยังไม่มีตาราง ${t} (migration svc_h ยังไม่ลง)`); };
/** INSERT แถวด้วยค่าขั้นต่ำ — คอลัมน์ NOT NULL ที่ไม่มี default เติมค่ากลาง ๆ ให้ (ตารางไม่มี ⇒ AssertFail ตรงเหตุ) */
async function insertRow(table: string, vals: Record<string, unknown>, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  await needTable(table);
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? addDays(TODAY, 400) : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { if (e instanceof AssertFail) throw e; return pgCode(e) || errMsg(e); } };
const expectCodes = async (cases: [string, () => Promise<unknown>, string][]) => {
  const bad: string[] = [];
  for (const [what, f, want] of cases) { const got = await tryCode(f); if (got !== want) bad.push(`${what}: ได้ ${got || "สำเร็จ"} ต้อง ${want || "สำเร็จ"}`); }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
};
type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null; def: string; nnd: boolean; nexpr: number };
const ixOf = (table: string) => q<IxRow>(
  `SELECT i.relname AS name, ix.indisunique AS uniq, ix.indnullsnotdistinct AS nnd, pg_get_indexdef(ix.indexrelid) AS def,
          (SELECT count(*)::int FROM unnest(ix.indkey) k(n) WHERE k.n = 0) AS nexpr,
          ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
          pg_get_expr(ix.indpred, ix.indrelid) AS pred
     FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
const findIx = async (table: string, f: (r: IxRow) => boolean) => (await ixOf(table)).find(f);
const fkOf = (tables: readonly string[]) => q<{ src: string; dst: string; cols: string[]; del: string }>(
  `SELECT t.relname AS src, r.relname AS dst, c.confdeltype AS del,
          ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols
     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
    WHERE c.contype = 'f' AND ns.nspname = current_schema() AND t.relname = ANY($1::text[])`, [tables]);
const enumLabels = async (name: string) => (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [name])).map((r) => r.l);

// ═══════════════ ล้างร้านชั่วคราว ═══════════════
let tenantTables: string[] | null = null;
async function tablesWithTenant(): Promise<string[]> {
  if (tenantTables) return tenantTables;
  const rows = await q<{ t: string }>(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  tenantTables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  return tenantTables;
}
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  let pending = [...(await tablesWithTenant())];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [tids]); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup: ลบไม่หมด ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [tids]); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try {
    const us = (await q<{ id: string }>(`SELECT id FROM "User" WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])).map((r) => r.id);
    if (!us.length) return;
    for (const t of ["Membership", "Session"]) { try { await pool.query(`DELETE FROM "${t}" WHERE "userId" = ANY($1::text[])`, [us]); } catch { /* ไม่มีคอลัมน์ */ } }
    await pool.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [us]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}
const tenantIds: string[] = [];
const sessionIds: string[] = [];

// ═══════════════ PC ตัวควบคุม ═══════════════
console.log("\n── PC: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
await st("PC-1", "ฐาน QC ต่อได้ (pg + prisma) · host = qc-svc ของเลน", async () => {
  const [{ one }] = await q<{ one: number }>("SELECT 1::int AS one");
  eq(one, 1, "pg SELECT 1");
  const r: Any[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
  eq(r[0]?.one, 1, "prisma SELECT 1");
});
await st("PC-2", "ฟิกซ์เจอร์ H (SQC_HOTEL_RATES): แผน 3 ตัว รหัสไม่ซ้ำ · default 1 แผน (STANDARD) · หน่วย = hotel (bansuan-hotel) · depositKind อยู่ในชุด §2.4", () => {
  const plans = SQC_HOTEL_RATES.plans;
  eq(plans.length, 3, "จำนวนแผน");
  eq(new Set(plans.map((p) => p.code)).size, 3, "รหัสแผนไม่ซ้ำ");
  eq(plans.filter((p) => p.isDefault).map((p) => p.code), ["STANDARD"], "แผนเริ่มต้น");
  eq(SQC_UNITS[SQC_HOTEL_RATES.unit].slug, "bansuan-hotel", "หน่วย");
  ok(plans.every((p) => ["NONE", "FIRST_NIGHT", "FULL", "PERCENT", "FIXED_AMOUNT"].includes(p.depositKind)), "depositKind นอกชุด");
});
await st("PC-3", `HotelReservation เดิมมีคอลัมน์ P1 ครบ ${RESV_P1_COLS.length} ตัว · HotelRoomType ${ROOMTYPE_P1_COLS.length} · HotelRoom ${ROOM_P1_COLS.length} (ฐานก่อนเพิ่ม)`, async () => {
  const miss: string[] = [];
  for (const [t, want] of [["HotelReservation", RESV_P1_COLS], ["HotelRoomType", ROOMTYPE_P1_COLS], ["HotelRoom", ROOM_P1_COLS]] as const) {
    const have = new Set((await cols(t)).map((c) => c.column_name));
    for (const c of want) if (!have.has(c)) miss.push(`${t}.${c}`);
  }
  ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
});
await st("PC-4", "โค้ดเดิมโหลดได้: hotel service (createRoomType/createRoom/createReservation/recordDeposit/cancelReservation) · settings (setSettings/resolveSetting/refsFor/resetSetting/settingsDiff/snapshotPolicy/listDefs/SNAPSHOT_KEYS) · entitiesOfUnit · scopeOf · PERMISSIONS", () => {
  const miss: string[] = [];
  for (const n of ["createRoomType", "createRoom", "createReservation", "recordDeposit", "cancelReservation"]) if (typeof HOTEL?.[n] !== "function") miss.push(`hotel.${n}`);
  for (const n of ["setSettings", "resolveSetting", "refsFor", "resetSetting", "settingsDiff", "snapshotPolicy", "listDefs", "getDef"]) if (typeof SET?.[n] !== "function") miss.push(`settings.${n}`);
  if (!SET?.SNAPSHOT_KEYS) miss.push("settings.SNAPSHOT_KEYS");
  if (typeof SETSVC?.entitiesOfUnit !== "function") miss.push("service.entitiesOfUnit");
  if (typeof SCOPE?.scopeOf !== "function" || typeof SCOPE?.assertRegistryComplete !== "function") miss.push("scope.scopeOf/assertRegistryComplete");
  if (!Array.isArray(PERM?.PERMISSIONS)) miss.push("permissions.PERMISSIONS");
  ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
});
await st("PC-5", "enum HotelReservationStatus (DB) ขึ้นต้นด้วย 5 ค่าเดิมเรียงเดิม (BOOKED CHECKED_IN CHECKED_OUT CANCELLED REFUNDED) · HotelRoomStatus 4 ค่าเดิม", async () => {
  eq((await enumLabels("HotelReservationStatus")).slice(0, 5), OLD_STATUS, "5 ค่าแรก");
  eq(await enumLabels("HotelRoomStatus"), ["AVAILABLE", "OCCUPIED", "CLEANING", "OOO"], "HotelRoomStatus");
});
await st("PC-6", "scope เดิม: HotelRoomType/HotelRoom/HotelReservation/RoomOccupancy = unit · สิทธิ์เดิม hotel 10 คีย์ป้ายเดิม · storefront resolveHotelUnit ตรวจ \"HOTEL\" อยู่แล้ว (§8)", () => {
  for (const m of ["HotelRoomType", "HotelRoom", "HotelReservation", "RoomOccupancy"]) eq(SCOPE.scopeOf(m).axis, "unit", m);
  const byKey = new Map<string, Any>((PERM.PERMISSIONS as Any[]).map((p) => [p.key, p]));
  for (const [k, label] of Object.entries(OLD_PERMS)) { const p = byKey.get(k); ok(p && p.module === "hotel" && p.label === label, `${k}: ${J(p)}`); }
  ok(/resolvePublicUnit\(\s*tenantSlug\s*,\s*unitSlug\s*,\s*"HOTEL"\s*\)/.test(read(F.hotelService)), "resolveHotelUnit ไม่ได้ส่ง \"HOTEL\"");
});
await st("PC-7", "git: ฐานเทียบ a9aad92d8 อ่านได้และเป็นบรรพบุรุษของ HEAD · ก่อน H.0 ไม่มี migration หลัง svc_b17 นอกจาก _svc_*", () => {
  git(["cat-file", "-e", `${BASE_SHA}^{commit}`]);
  git(["merge-base", "--is-ancestor", BASE_SHA, "HEAD"]);
  const migs = readdirSync(join(ROOT, "prisma", "migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
  ok(migs.includes(PREV_MIG), `ไม่พบ ${PREV_MIG}`);
  const alien = migs.filter((d) => d > PREV_MIG && !/_svc_[a-z0-9]+$/.test(d));
  ok(alien.length === 0, `migration ที่ไม่ใช่ SVC หลัง svc_b17: ${alien.join(", ")}`);
});

// ═══════════════ M. migration ═══════════════
console.log("\n── M: migration svc_h (§4) ──");
const migDir = join(ROOT, "prisma", "migrations");
const migs = readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
const mH = migs.filter((d) => /^\d{14}_svc_h$/.test(d));
const migName = mH.length === 1 ? mH[0] : "";
let stmts: string[] = [];
if (migName) {
  const code = readFileSync(join(migDir, migName, "migration.sql"), "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  stmts = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const needMig = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") =>
  (migName ? st(id, name, fn, sev) : st(id, name, () => { throw new AssertFail("ยังไม่มีโฟลเดอร์ prisma/migrations/<ts>_svc_h"); }, sev));
await st("M-1", `มีโฟลเดอร์ \`<ts>_svc_h\` ตัวเดียว · ts 14 หลัก > ${MIN_TS} · เรียงหลัง ${PREV_MIG} · migration.sql ไม่ว่าง`, () => {
  ok(mH.length === 1, mH.length === 0 ? "ยังไม่มี migration svc_h" : `พบ ${mH.length}: ${mH.join(", ")}`);
  ok(migName.slice(0, 14) > MIN_TS && migName > PREV_MIG, `${migName} ต้อง > ${MIN_TS} และหลัง ${PREV_MIG}`);
  ok(stmts.length > 0, "migration.sql ว่าง");
});
await needMig("M-2", "SQL additive ล้วน: ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/NOT NULL ไร้ DEFAULT บนตารางเดิม/UPDATE/DELETE/INSERT/TRUNCATE · ALTER TYPE = ADD VALUE ต่อท้าย (ไม่มี BEFORE/AFTER)", () => {
  const bad: string[] = [];
  for (const s of stmts) {
    if (/\bDROP\b/i.test(s)) bad.push(`DROP: ${s.slice(0, 80)}`);
    if (/\bRENAME\b/i.test(s)) bad.push(`RENAME: ${s.slice(0, 80)}`);
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i.test(s)) bad.push(`เปลี่ยนชนิด: ${s.slice(0, 80)}`);
    if (/SET\s+NOT\s+NULL/i.test(s)) bad.push(`SET NOT NULL: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && !/ADD\s+VALUE/i.test(s)) bad.push(`ALTER TYPE: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && /\b(BEFORE|AFTER)\b/i.test(s)) bad.push(`ADD VALUE ไม่ต่อท้าย: ${s.slice(0, 80)}`);
    const t = s.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?(?:"?public"?\.)?"?(\w+)"?/i)?.[1];
    if (t && (OLD_TOUCHED as readonly string[]).includes(t)) for (const add of s.split(/,\s*(?=ADD\s+COLUMN)/i)) if (/ADD\s+COLUMN/i.test(add) && /NOT\s+NULL/i.test(add) && !/DEFAULT/i.test(add)) bad.push(`NOT NULL ไร้ DEFAULT บนตารางเดิม: ${add.slice(0, 80)}`);
    if (/^(DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(s)) bad.push(`แก้ข้อมูล: ${s.slice(0, 80)}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-3", "ALTER TYPE \"HotelReservationStatus\" ADD VALUE 3 statement แยกกัน = HOLD · CONFIRMED · NO_SHOW (ลำดับนี้) · ไม่มี ALTER TYPE อื่น", () => {
  const adds = stmts.filter((s) => /^ALTER\s+TYPE/i.test(s)).map((s) => `${s.match(/ALTER\s+TYPE\s+"?(\w+)"?/i)?.[1]}:${s.match(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'(\w+)'/i)?.[1]}`);
  eq(adds, ["HotelReservationStatus:HOLD", "HotelReservationStatus:CONFIRMED", "HotelReservationStatus:NO_SHOW"], "ALTER TYPE");
  ok(stmts.every((s) => !/^ALTER\s+TYPE/i.test(s) || !/ADD\s+VALUE[^;]*ADD\s+VALUE/i.test(s)), "ADD VALUE หลายค่าใน statement เดียว");
});
await needMig("M-4", "SQL แตะเฉพาะตารางของใบ: CREATE TABLE/INDEX บน 17 ตารางใหม่ · ALTER TABLE ตารางเดิม (HotelReservation/HotelRoomType/HotelRoom) = ADD COLUMN/ADD CONSTRAINT เท่านั้น · FK อ้างได้แค่ RatePlan/RoomType/Season/Reservation/Folio/Room", () => {
  const own = new Set<string>([...NEW_MODELS, ...OLD_TOUCHED]);
  const bad: string[] = [];
  for (const s of stmts) {
    if (/^ALTER\s+TYPE\s+"HotelReservationStatus"/i.test(s)) continue;
    const m = s.match(/^(?:ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?[\w]+"?\s+ON)\s+(?:ONLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?(\w+)"?/i);
    if (!m) { bad.push(`ไม่รู้จัก: ${s.slice(0, 70)}`); continue; }
    if (!own.has(m[1])) bad.push(`${m[1]}: ${s.slice(0, 60)}`);
    if (/^ALTER\s+TABLE/i.test(s) && (OLD_TOUCHED as readonly string[]).includes(m[1])) {
      const parts = s.replace(/^ALTER\s+TABLE\s+(?:ONLY\s+)?"?\w+"?\s*/i, "").split(/,\s*(?=ADD\s)/i);
      for (const p of parts) if (!/^ADD\s+(COLUMN|CONSTRAINT)/i.test(p.trim())) bad.push(`ALTER ตารางเดิมนอก ADD COLUMN/CONSTRAINT: ${p.slice(0, 60)}`);
    }
    for (const ref of [...s.matchAll(/REFERENCES\s+"?(\w+)"?/gi)].map((x) => x[1])) if (!FK_REF_OK.has(ref)) bad.push(`FK → ${ref}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-5", "SQL มือครบ: CHECK ≥ 20 จุด · partial unique RatePlan default (WHERE isDefault + status ACTIVE) · unique NULLS NOT DISTINCT ของ HotelRate และ HotelRateOverride · ไม่มี CONCURRENTLY/CREATE EXTENSION · ไม่มี HotelChannelConnection/HotelRoomBlock", () => {
  const bad: string[] = [];
  const checks = stmts.reduce((n, s) => n + (s.match(/\bCHECK\s*\(/gi)?.length ?? 0), 0);
  if (checks < 20) bad.push(`CHECK ${checks} จุด (ต้อง ≥ 20)`);
  if (!stmts.some((s) => /^CREATE\s+UNIQUE\s+INDEX[^]*"HotelRatePlan"[^]*WHERE[^]*isDefault[^]*ACTIVE/i.test(s))) bad.push("ไม่มี partial unique แผนเริ่มต้น (HotelRatePlan WHERE isDefault AND status = 'ACTIVE')");
  if (!stmts.some((s) => /^CREATE\s+UNIQUE\s+INDEX[^]*"HotelRate"\s*\([^]*NULLS\s+NOT\s+DISTINCT/i.test(s))) bad.push("ไม่มี unique NULLS NOT DISTINCT ของ HotelRate");
  if (!stmts.some((s) => /^CREATE\s+UNIQUE\s+INDEX[^]*"HotelRateOverride"[^]*NULLS\s+NOT\s+DISTINCT/i.test(s))) bad.push("ไม่มี unique NULLS NOT DISTINCT ของ HotelRateOverride");
  const forb = stmts.filter((s) => /CONCURRENTLY|CREATE\s+EXTENSION|HotelChannelConnection|HotelRoomBlock/i.test(s));
  if (forb.length) bad.push(`ต้องห้าม: ${forb.slice(0, 2).map((s) => s.slice(0, 60)).join(" | ")}`);
  ok(bad.length === 0, bad.join(" · "));
});
let migAt: Date | null = null;
await needMig("M-6", "migration svc_h ลงฐาน QC แล้ว (migrate deploy · finished · ไม่ rolled back) · migration ของใบหลัง (ถ้ามี) เป็น _svc_* เท่านั้น", async () => {
  const m = await q<{ finished_at: Date | null; rolled_back_at: Date | null }>(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, [migName]);
  ok(m.length === 1 && m[0].finished_at !== null && m[0].rolled_back_at === null, `แถว _prisma_migrations ${m.length} (ยังไม่ migrate deploy?)`);
  migAt = m[0].finished_at;
  const later = migs.slice(migs.indexOf(migName) + 1).filter((d) => !/_svc_[a-z0-9]+$/.test(d));
  ok(later.length === 0, `migration ที่ไม่ใช่ SVC หลัง svc_h: ${later.join(", ")}`);
});
await needMig("M-7", "prisma migrate diff --from-schema prisma/schema --to-url <ฐาน QC> --script: ไม่มี statement ใดแตะตาราง/ดัชนี/CHECK ของใบ (Hotel*/Channel*/HotelReservationStatus) — โดยเฉพาะไม่เสนอ DROP ดัชนี/constraint มือ (drift HR เดิมของฐานรายงานเป็นข้อมูล)", () => {
  const r = spawnSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-schema", "prisma/schema", "--to-url", process.env.DIRECT_URL ?? "", "--script"], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  ok(r.status === 0, `migrate diff exit=${r.status}: ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 200)}`);
  const ss = (r.stdout ?? "").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const mine = ss.filter((s) => /"(Hotel\w*|Channel\w*)"|HotelReservationStatus/.test(s));
  const other = ss.length - mine.length;
  if (other) console.log(`     ℹ️ drift อื่นของฐาน (ไม่ใช่ของใบ): ${other} statement — ${ss.filter((s) => !mine.includes(s)).slice(0, 2).map((s) => s.slice(0, 70)).join(" | ")}`);
  ok(mine.length === 0, `diff เสนอ ${mine.length} statement กับของใบ: ${mine.slice(0, 3).map((s) => s.slice(0, 90)).join(" | ")}`);
}, "MAJOR");
await st("M-8", "schema แตะเฉพาะ hotel.prisma (+ integration.prisma คอมเมนต์อย่างเดียว) · hotel.prisma ไม่ลบ/แก้บรรทัดเดิม (ไม่ prisma format ทั้งชุด)", () => {
  const ch = changedFiles(["prisma/schema"]).map((p) => p.split("/").pop() ?? p);
  ok(ch.includes("hotel.prisma"), "hotel.prisma ยังไม่เปลี่ยน (ยังไม่มีงาน)");
  const outside = ch.filter((f) => !["hotel.prisma", "integration.prisma"].includes(f));
  ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.join(", ")}`);
  const delH = diffLines(F.hotelPrisma, "-");
  ok(delH.length === 0, `hotel.prisma ลบ/แก้บรรทัดเดิม: ${delH.slice(0, 3).map((l) => l.slice(0, 60)).join(" | ")}`);
  const integ = [...diffLines(F.integrationPrisma, "+"), ...diffLines(F.integrationPrisma, "-")];
  ok(integ.length === 0, `integration.prisma มีบรรทัดโค้ด (ไม่ใช่คอมเมนต์) เปลี่ยน: ${integ.slice(0, 2).join(" | ")}`);
}, "MAJOR");
await st("M-9", "hotel.prisma: enum HotelReservationStatus = 5 เดิม + HOLD CONFIRMED NO_SHOW ต่อท้าย · model ใหม่ 17 ตัวชื่อ Hotel*/Channel* ไม่มี @@map · HotelRoom.hkStatus ยังเป็น String · HotelRoomStatus ไม่เปลี่ยน · ไม่มี HotelChannelConnection/HotelRoomBlock", () => {
  const src = read(F.hotelPrisma);
  const vals = (src.match(/enum HotelReservationStatus \{([\s\S]*?)\}/)?.[1] ?? "").split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  eq(vals, NEW_STATUS, "enum ใน schema");
  const miss = NEW_MODELS.filter((m) => !new RegExp(`^model\\s+${m}\\s*\\{`, "m").test(src));
  ok(miss.length === 0, `ยังไม่มี model: ${miss.join(", ")}`);
  ok(!/@@map\(/.test(src), "มี @@map (ห้ามเปลี่ยนชื่อโมเดล/ตาราง)");
  ok(/^\s*hkStatus\s+String\s/m.test(src), "hkStatus ไม่ใช่ String");
  const rs = (src.match(/enum HotelRoomStatus \{([\s\S]*?)\}/)?.[1] ?? "").split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  eq(rs, ["AVAILABLE", "OCCUPIED", "CLEANING", "OOO"], "HotelRoomStatus");
  ok(!/model\s+(HotelChannelConnection|HotelRoomBlock)\b/.test(src), "มี HotelChannelConnection/HotelRoomBlock");
});

// ═══════════════ T. ตาราง/คอลัมน์ ═══════════════
console.log("\n── T: ตาราง/คอลัมน์ (ใบสั่ง §2 · ตรงชุด) ──");
type Col = { t: string; n: boolean; d?: string };
const TS = "timestamp without time zone";
const S = (n = false, d?: string): Col => ({ t: "text", n, d });
const I = (n = false, d?: string): Col => ({ t: "integer", n, d });
const D = (n = false, d?: string): Col => ({ t: TS, n, d });
const DT = (n = false): Col => ({ t: "date", n });
const JB = (n = true): Col => ({ t: "jsonb", n });
const B = (n = false, d?: string): Col => ({ t: "boolean", n, d });
const NOW = "CURRENT_TIMESTAMP";
const base = (): Record<string, Col> => ({ id: S(), tenantId: S(), unitId: S(), createdAt: D(false, NOW), updatedAt: D() });
const ns = (...names: string[]): Record<string, Col> => Object.fromEntries(names.map((n) => [n, S(true)]));
const RESV_NEW: Record<string, Col> = {
  source: S(false, "WALK_IN"), ...ns("channelRef", "channelConnectionId", "ratePlanId", "groupId"), holdExpiresAt: D(true), policySnapshot: JB(), taxSnapshot: JB(),
  grossSatang: I(true), commissionSatang: I(true), netSatang: I(true), prepaidByChannel: B(false, "false"), noShowAt: D(true), securityDepositSatang: I(false, "0"), securityDepositSaleId: S(true),
};
const ROOMTYPE_NEW: Record<string, Col> = { baseOccupancy: I(false, "2"), maxOccupancy: I(true), extraBedAllowed: B(false, "false"), extraBedPriceSatang: I(false, "0"), bedType: S(true), images: JB(), archivedAt: D(true) };
const ROOM_NEW: Record<string, Col> = { hkNote: S(true), hkUpdatedAt: D(true) };
const SPEC: [string, string, Record<string, Col>][] = [
  ["T-4", "HotelRatePlan", { ...base(), name: S(), code: S(), includeBreakfast: B(false, "false"), minNights: I(true), maxNights: I(true), depositKind: S(false, "FIRST_NIGHT"), depositValue: I(false, "0"), isDefault: B(false, "false"), visibility: JB(), status: S(false, "ACTIVE"), sortOrder: I(false, "0"), description: S(true) }],
  ["T-5", "HotelSeason", { ...base(), name: S(), dateStart: DT(), dateEnd: DT(), priority: I(false, "0"), minNights: I(true), status: S(false, "ACTIVE") }], // minNights = มติ §12 ข้อ 10 (h.1 #4)
  ["T-6", "HotelHoliday", { ...base(), date: DT(), name: S() }],
  ["T-7", "HotelRate", { ...base(), ratePlanId: S(), roomTypeId: S(), seasonId: S(true), priceWeekdaySatang: I(), priceWeekendSatang: I(), priceHolidaySatang: I(true) }],
  ["T-8", "HotelRateOverride", { ...base(), roomTypeId: S(), ratePlanId: S(true), date: DT(), priceSatang: I(), ...ns("reason", "setById") }],
  ["T-9", "HotelCancelRule", { ...base(), ratePlanId: S(), daysBefore: I(), refundBp: I() }],
  ["T-10", "HotelBookingNight", { ...base(), reservationId: S(), roomTypeId: S(), roomId: S(true), date: DT(), priceSatang: I(), ratePlanId: S(true), priceSource: S(false, "RATE"), counted: B(false, "true"), ...ns("postedAuditId", "folioItemId") }],
  ["T-11", "HotelFolio", { ...base(), reservationId: S(), status: S(false, "OPEN"), balanceSatang: I(false, "0"), settledSaleId: S(true), settledAt: D(true) }],
  ["T-12", "HotelFolioItem", { ...base(), folioId: S(), type: S(), description: S(), qty: I(false, "1"), unitAmountSatang: I(), amountSatang: I(), businessDate: DT(), ...ns("refType", "refId", "postedById"), voidedAt: D(true), ...ns("voidReason", "reversalOfId") }],
  ["T-13", "HotelGuestRecord", { ...base(), reservationId: S(), partyId: S(true), fullName: S(), ...ns("nationality", "idType", "idNumberEnc", "idNumberLast4"), dob: DT(true), ...ns("arrivedFrom", "nextDestination", "idImageFileId", "signatureFileId"), isForeigner: B(false, "false"), tm30Status: S(false, "NOT_REQUIRED"), tm30DueAt: D(true), tm30Ref: S(true), tm30FiledAt: D(true), rr3SignedAt: D(true), retainUntil: DT(true) }],
  ["T-14", "HotelHousekeepingLog", { ...base(), roomId: S(), fromStatus: S(), toStatus: S(), ...ns("byUserId", "reservationId", "note") }],
  ["T-15", "HotelNightAudit", { ...base(), businessDate: DT(), status: S(false, "CLOSED"), roomsTotal: I(), roomsOOO: I(), roomsAvailable: I(), roomsOccupied: I(), occupancyBps: I(), roomRevenueSatang: I(), adrSatang: I(), revparSatang: I(), arrivals: I(false, "0"), departures: I(false, "0"), noShowCount: I(false, "0"), cancelledCount: I(false, "0"), snapshot: JB(), closedById: S(true), reopenedAt: D(true), reopenedById: S(true) }],
  ["T-16", "ChannelRoomMap", { ...base(), connectionId: S(), roomTypeId: S(), externalRoomId: S(), active: B(false, "true") }],
  ["T-17", "ChannelRateMap", { ...base(), connectionId: S(), ratePlanId: S(), externalRateId: S(), formula: JB() }],
  ["T-18", "ChannelAriJob", { ...base(), connectionId: S(), dateFrom: DT(), dateTo: DT(), payloadHash: S(), status: S(false, "PENDING"), attempts: I(false, "0"), lastError: S(true), sentAt: D(true) }],
  ["T-19", "ChannelReservationInbox", { ...base(), connectionId: S(), externalId: S(), version: I(), raw: JB(false), status: S(false, "RECEIVED"), ...ns("reservationId", "error") }],
  ["T-20", "ChannelInventoryBuffer", { ...base(), connectionId: S(), roomTypeId: S(), rooms: I(false, "0") }],
];
const checkCols = async (table: string, spec: Record<string, Col>, allowed: readonly string[]) => {
  const have = new Map((await cols(table, true)).map((c) => [c.column_name, c]));
  ok(have.size > 0, `ยังไม่มีตาราง ${table}`);
  const probs: string[] = [];
  for (const [c, w] of Object.entries(spec)) {
    const h = have.get(c);
    if (!h) { probs.push(`ขาด ${c}`); continue; }
    if (h.data_type !== w.t) probs.push(`${c}: ${h.data_type}≠${w.t}`);
    if ((h.is_nullable === "YES") !== w.n) probs.push(`${c}: ${w.n ? "ต้อง null ได้" : "ต้อง NOT NULL"}`);
    if (w.d && !(h.column_default ?? "").includes(w.d)) probs.push(`${c}: default ${h.column_default ?? "(ไม่มี)"}≠${w.d}`);
  }
  const extra = [...have.keys()].filter((c) => !(c in spec) && !allowed.includes(c));
  if (extra.length) probs.push(`คอลัมน์เกินใบสั่ง: ${extra.join(", ")}`);
  ok(probs.length === 0, probs.slice(0, 6).join(" · "));
};
await st("T-1", `HotelReservation เพิ่ม ${Object.keys(RESV_NEW).length} คอลัมน์ (§2.1 · nullable/default ทั้งหมด) · คอลัมน์ P1 ยังครบ · status ยังเป็น enum HotelReservationStatus`, async () => {
  await checkCols("HotelReservation", RESV_NEW, RESV_P1_COLS);
  const stc = (await cols("HotelReservation")).find((c) => c.column_name === "status");
  eq(stc?.udt_name, "HotelReservationStatus", "status udt");
});
await st("T-2", `HotelRoomType เพิ่ม ${Object.keys(ROOMTYPE_NEW).length} คอลัมน์ (§2.2) · คง active เดิม`, async () => { await checkCols("HotelRoomType", ROOMTYPE_NEW, ROOMTYPE_P1_COLS); });
await st("T-3", "HotelRoom เพิ่ม hkNote/hkUpdatedAt (§2.3) · hkStatus คง text default CLEAN · status คง enum HotelRoomStatus", async () => {
  await checkCols("HotelRoom", ROOM_NEW, ROOM_P1_COLS);
  const hk = (await cols("HotelRoom")).find((c) => c.column_name === "hkStatus");
  ok(hk?.data_type === "text" && (hk.column_default ?? "").includes("CLEAN"), `hkStatus ${hk?.data_type} default ${hk?.column_default}`);
  eq((await cols("HotelRoom")).find((c) => c.column_name === "status")?.udt_name, "HotelRoomStatus", "status udt");
});
for (const [id, table, spec] of SPEC) await st(id, `${table} (${Object.keys(spec).length} คอลัมน์ ตรงชุด)`, () => checkCols(table, spec, []));
await st("T-21", "enum HotelReservationStatus (DB) = 5 เดิม + HOLD CONFIRMED NO_SHOW ต่อท้าย (ยังมี BOOKED) · ค่าใหม่ใช้ INSERT ได้", async () => {
  eq(await enumLabels("HotelReservationStatus"), NEW_STATUS, "enum DB");
  const [{ ok: cast }] = await q<{ ok: boolean }>(`SELECT 'CONFIRMED'::"HotelReservationStatus" = 'CONFIRMED'::"HotelReservationStatus" AS ok`);
  ok(cast, "cast CONFIRMED");
});
await st("T-22", "เงินในตารางใหม่ + คอลัมน์ใหม่ = integer สตางค์ (ทุก *Satang integer · ไม่มี numeric/double/real/bigint/money ใน 17 ตาราง)", async () => {
  const rows = await q<{ table_name: string; column_name: string; data_type: string }>(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, [[...NEW_MODELS, "HotelReservation"]]);
  ok(rows.some((r) => (NEW_MODELS as readonly string[]).includes(r.table_name)), "ยังไม่มีตารางใหม่");
  const bad = rows.filter((r) => (/Satang$/.test(r.column_name) && r.data_type !== "integer") || ((NEW_MODELS as readonly string[]).includes(r.table_name) && ["numeric", "double precision", "real", "bigint", "money"].includes(r.data_type))).map((r) => `${r.table_name}.${r.column_name}=${r.data_type}`);
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
});
await st("T-23", "DB ไม่มีตาราง HotelChannelConnection / HotelRoomBlock (มติ §2 ข้อ 2 · 9) · ครบ 17 ตารางใหม่", async () => {
  const r = await q<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('HotelChannelConnection','HotelRoomBlock')`);
  eq(r.map((x) => x.t), [], "ตารางต้องห้าม");
  const miss: string[] = [];
  for (const m of NEW_MODELS) if (!(await tableExists(m))) miss.push(m);
  ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
});

// ═══════════════ ฟิกซ์เจอร์ร้านชั่วคราว (pg) ═══════════════
const RUN = STAMP;
const tA = rid("ta"); const tB = rid("tb"); const uA = rid("ua"); const uB = rid("ub"); const uDorm = rid("ud");
const RT = rid("rt"); const RT2 = rid("rt2"); const R1 = rid("r1"); const R2 = rid("r2"); const R3 = rid("r3"); const R4 = rid("r4"); const RTB = rid("rtb"); const RB1 = rid("rb1");
const now = () => new Date();
let fixtureOk = false;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`\n(กวาดร้านค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();
  for (const [t, n] of [[tA, "A"], [tB, "B"]] as const) {
    await insertRow("Tenant", { id: t, name: `QC SVC H.0 โรงแรม ${n}`, slug: `${SLUG}${n.toLowerCase()}-${RUN}`, updatedAt: now() });
    tenantIds.push(t);
  }
  await insertRow("BusinessUnit", { id: uA, tenantId: tA, type: "HOTEL", name: "โรงแรมทดสอบ H.0 A", slug: `svc-h0-hotel-${RUN}`, updatedAt: now() });
  await insertRow("BusinessUnit", { id: uDorm, tenantId: tA, type: "DORM", name: "หอทดสอบ H.0 A", slug: `svc-h0-dorm-${RUN}`, updatedAt: now() });
  await insertRow("BusinessUnit", { id: uB, tenantId: tB, type: "HOTEL", name: "โรงแรมทดสอบ H.0 B", slug: `svc-h0-hotel-${RUN}`, updatedAt: now() });
  await insertRow("HotelRoomType", { id: RT, tenantId: tA, unitId: uA, name: "ดีลักซ์ทดสอบ", baseRateSatang: 129_000, depositSatang: 50_000, updatedAt: now() });
  await insertRow("HotelRoomType", { id: RT2, tenantId: tA, unitId: uA, name: "ซูพีเรียทดสอบ", baseRateSatang: 99_000, updatedAt: now() });
  for (const [r, n, rt] of [[R1, "H01", RT], [R2, "H02", RT], [R3, "H03", RT], [R4, "H04", RT2]] as const) await insertRow("HotelRoom", { id: r, tenantId: tA, unitId: uA, roomTypeId: rt, number: `${n}-${RUN.slice(-3)}`, updatedAt: now() });
  await insertRow("HotelRoomType", { id: RTB, tenantId: tB, unitId: uB, name: "ดีลักซ์ B", baseRateSatang: 100_000, updatedAt: now() });
  await insertRow("HotelRoom", { id: RB1, tenantId: tB, unitId: uB, roomTypeId: RTB, number: `HB1-${RUN.slice(-3)}`, updatedAt: now() });
  fixtureOk = true;
} catch (e) { record("FIX", "สร้างร้านชั่วคราว (Tenant/BusinessUnit/HotelRoomType/HotelRoom)", "FAIL", errMsg(e), "CRITICAL"); }

// ตัวสร้างแถวตารางใหม่ (ค่าถูกต้องขั้นต่ำ · over ทับได้) — ตารางยังไม่มี ⇒ AssertFail "ยังไม่มีตาราง"
const dayN = (n: number) => addDays(TODAY, n);
const plan = (over: Record<string, unknown> = {}, c: pg.Pool | pg.PoolClient = pool) => insertRow("HotelRatePlan", { id: rid("rp"), tenantId: tA, unitId: uA, name: "แผนทดสอบ", code: rid("code"), updatedAt: now(), ...over }, c);
const season = (over: Record<string, unknown> = {}) => insertRow("HotelSeason", { id: rid("ss"), tenantId: tA, unitId: uA, name: "ฤดูทดสอบ", dateStart: dayN(100), dateEnd: dayN(130), updatedAt: now(), ...over });
const holiday = (over: Record<string, unknown> = {}) => insertRow("HotelHoliday", { id: rid("hd"), tenantId: tA, unitId: uA, date: dayN(200), name: "วันหยุดทดสอบ", updatedAt: now(), ...over });
const rate = (ratePlanId: string, over: Record<string, unknown> = {}) => insertRow("HotelRate", { id: rid("rt"), tenantId: tA, unitId: uA, ratePlanId, roomTypeId: RT, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, updatedAt: now(), ...over });
const override = (over: Record<string, unknown> = {}) => insertRow("HotelRateOverride", { id: rid("ov"), tenantId: tA, unitId: uA, roomTypeId: RT, ratePlanId: null, date: dayN(300), priceSatang: 169_000, updatedAt: now(), ...over });
const cancelRule = (ratePlanId: string, over: Record<string, unknown> = {}) => insertRow("HotelCancelRule", { id: rid("cr"), tenantId: tA, unitId: uA, ratePlanId, daysBefore: 3, refundBp: 10_000, updatedAt: now(), ...over });
const resv = (over: Record<string, unknown> = {}) => insertRow("HotelReservation", { id: rid("rv"), tenantId: tA, unitId: uA, code: `QH0-${rid("c").slice(-8)}`, guestName: "แขกทดสอบ", roomTypeId: RT, checkInDate: dayN(50), checkOutDate: dayN(52), nights: 2, updatedAt: now(), ...over });
const night = (reservationId: string, over: Record<string, unknown> = {}) => insertRow("HotelBookingNight", { id: rid("bn"), tenantId: tA, unitId: uA, reservationId, roomTypeId: RT, roomId: R1, date: dayN(50), priceSatang: 129_000, updatedAt: now(), ...over });
const folio = (reservationId: string, over: Record<string, unknown> = {}) => insertRow("HotelFolio", { id: rid("fo"), tenantId: tA, unitId: uA, reservationId, updatedAt: now(), ...over });
const folioItem = (folioId: string, over: Record<string, unknown> = {}) => insertRow("HotelFolioItem", { id: rid("fi"), tenantId: tA, unitId: uA, folioId, type: "ROOM", description: "ค่าห้อง", unitAmountSatang: 129_000, amountSatang: 129_000, businessDate: dayN(50), updatedAt: now(), ...over });
const guest = (reservationId: string, over: Record<string, unknown> = {}) => insertRow("HotelGuestRecord", { id: rid("gr"), tenantId: tA, unitId: uA, reservationId, fullName: "แขกทดสอบ", updatedAt: now(), ...over });
const hkLog = (over: Record<string, unknown> = {}) => insertRow("HotelHousekeepingLog", { id: rid("hk"), tenantId: tA, unitId: uA, roomId: R1, fromStatus: "DIRTY", toStatus: "CLEAN", updatedAt: now(), ...over });
const audit = (over: Record<string, unknown> = {}) => insertRow("HotelNightAudit", { id: rid("na"), tenantId: tA, unitId: uA, businessDate: dayN(-1), roomsTotal: 4, roomsOOO: 0, roomsAvailable: 4, roomsOccupied: 0, occupancyBps: 0, roomRevenueSatang: 0, adrSatang: 0, revparSatang: 0, updatedAt: now(), ...over });
const roomMap = (over: Record<string, unknown> = {}) => insertRow("ChannelRoomMap", { id: rid("crm"), tenantId: tA, unitId: uA, connectionId: rid("conn"), roomTypeId: RT, externalRoomId: rid("ext"), updatedAt: now(), ...over });
const rateMap = (ratePlanId: string, over: Record<string, unknown> = {}) => insertRow("ChannelRateMap", { id: rid("cra"), tenantId: tA, unitId: uA, connectionId: rid("conn"), ratePlanId, externalRateId: rid("ext"), updatedAt: now(), ...over });
const ariJob = (over: Record<string, unknown> = {}) => insertRow("ChannelAriJob", { id: rid("ari"), tenantId: tA, unitId: uA, connectionId: rid("conn"), dateFrom: dayN(10), dateTo: dayN(20), payloadHash: rid("h"), updatedAt: now(), ...over });
const inbox = (over: Record<string, unknown> = {}) => insertRow("ChannelReservationInbox", { id: rid("inb"), tenantId: tA, unitId: uA, connectionId: rid("conn"), externalId: rid("ext"), version: 1, raw: "{}", updatedAt: now(), ...over });
const buffer = (over: Record<string, unknown> = {}) => insertRow("ChannelInventoryBuffer", { id: rid("buf"), tenantId: tA, unitId: uA, connectionId: rid("conn"), roomTypeId: RT, updatedAt: now(), ...over });
const countOf = async (table: string, where: string, params: unknown[]) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, params))[0].n;

type Fx = { RP0: string; RV0: string; FO0: string; SS0: string };
let fx: Fx | null = null;
const FX = (): Fx => { if (!fx) throw new AssertFail("ไม่มี fixture ตารางใหม่ (K-0 ไม่ผ่าน)"); return fx; };

try {
  ok(fixtureOk, "ไม่มีร้านชั่วคราว");
  // ═══════════════ K. FK ═══════════════
  console.log("\n── K: FK (§2 \"FK ทั้งหมดของใบ\") ──");
  await st("K-0", "INSERT ค่าขั้นต่ำได้ทุกตารางใหม่ + ค่าเริ่มตามใบสั่ง (RatePlan FIRST_NIGHT/0/ACTIVE/false · Night RATE/counted · Folio OPEN/0 · Guest NOT_REQUIRED/false · Audit CLOSED · AriJob PENDING/0 · Inbox RECEIVED · Buffer 0 · Reservation source WALK_IN/prepaid false/security 0)", async () => {
    const RP0 = rid("RP0"); const RV0 = rid("RV0"); const FO0 = rid("FO0"); const SS0 = rid("SS0");
    await plan({ id: RP0, code: `STD-${RUN}` });
    await season({ id: SS0 });
    await holiday();
    await rate(RP0, { seasonId: SS0 });
    await override();
    await cancelRule(RP0);
    await resv({ id: RV0, ratePlanId: RP0 });
    await night(RV0);
    await folio(RV0, { id: FO0 });
    await folioItem(FO0);
    await guest(RV0);
    await hkLog();
    await audit();
    await roomMap();
    await rateMap(RP0);
    await ariJob();
    await inbox();
    await buffer();
    fx = { RP0, RV0, FO0, SS0 };
    const [p] = await q<Record<string, unknown>>(`SELECT "depositKind", "depositValue", status, "isDefault", "includeBreakfast", "sortOrder", "minNights" FROM "HotelRatePlan" WHERE id = $1`, [RP0]);
    eq(p, { depositKind: "FIRST_NIGHT", depositValue: 0, status: "ACTIVE", isDefault: false, includeBreakfast: false, sortOrder: 0, minNights: null }, "RatePlan ค่าเริ่ม");
    const [n] = await q<Record<string, unknown>>(`SELECT "priceSource", counted, "ratePlanId" FROM "HotelBookingNight" WHERE "reservationId" = $1`, [RV0]);
    eq(n, { priceSource: "RATE", counted: true, ratePlanId: null }, "Night ค่าเริ่ม");
    const [f] = await q<Record<string, unknown>>(`SELECT status, "balanceSatang" FROM "HotelFolio" WHERE id = $1`, [FO0]);
    eq(f, { status: "OPEN", balanceSatang: 0 }, "Folio ค่าเริ่ม");
    const [g] = await q<Record<string, unknown>>(`SELECT "tm30Status", "isForeigner" FROM "HotelGuestRecord" WHERE "reservationId" = $1`, [RV0]);
    eq(g, { tm30Status: "NOT_REQUIRED", isForeigner: false }, "Guest ค่าเริ่ม");
    const [r] = await q<Record<string, unknown>>(`SELECT source, "prepaidByChannel", "securityDepositSatang", "policySnapshot", "groupId" FROM "HotelReservation" WHERE id = $1`, [RV0]);
    eq(r, { source: "WALK_IN", prepaidByChannel: false, securityDepositSatang: 0, policySnapshot: null, groupId: null }, "Reservation ค่าเริ่ม");
  });
  await st("K-1", "FK ของตารางใหม่ตรงชุด 13 ตัว (Restrict=r · Cascade=c · SetNull=n) · ไม่มี FK อื่น", async () => {
    for (const m of NEW_MODELS) await needTable(m);
    const sig = (await fkOf(NEW_MODELS)).map((f) => `${f.src}.${f.cols.join("+")}->${f.dst}:${f.del}`).sort();
    eq(sig, [
      "ChannelInventoryBuffer.roomTypeId->HotelRoomType:r",
      "ChannelRateMap.ratePlanId->HotelRatePlan:r",
      "ChannelRoomMap.roomTypeId->HotelRoomType:r",
      "HotelBookingNight.reservationId->HotelReservation:c",
      "HotelCancelRule.ratePlanId->HotelRatePlan:c",
      "HotelFolio.reservationId->HotelReservation:c",
      "HotelFolioItem.folioId->HotelFolio:c",
      "HotelGuestRecord.reservationId->HotelReservation:c",
      "HotelHousekeepingLog.roomId->HotelRoom:r",
      "HotelRate.ratePlanId->HotelRatePlan:r",
      "HotelRate.roomTypeId->HotelRoomType:r",
      "HotelRate.seasonId->HotelSeason:n",
      "HotelRateOverride.roomTypeId->HotelRoomType:r",
    ], "FK");
  });
  await st("K-2", "HotelReservation.ratePlanId → HotelRatePlan ON DELETE SET NULL · FK เดิม roomTypeId→HotelRoomType / roomId→HotelRoom ยังอยู่ · ไม่มี FK ใหม่อื่นบน HotelReservation", async () => {
    const fks = (await fkOf(["HotelReservation"])).map((f) => `${f.cols.join("+")}->${f.dst}:${f.del}`).sort();
    eq(fks, ["ratePlanId->HotelRatePlan:n", "roomId->HotelRoom:n", "roomTypeId->HotelRoomType:r"], "FK HotelReservation");
  });
  await st("K-3", "CASCADE จริง: ลบการจอง ⇒ nights/folio/folio items/guest หายตาม · ลบแผน ⇒ cancel rules หาย", async () => {
    FX();
    const RV = rid("rvc"); const FO = rid("foc"); const RP = rid("rpc");
    await resv({ id: RV }); await night(RV); await folio(RV, { id: FO }); await folioItem(FO); await guest(RV);
    await plan({ id: RP }); await cancelRule(RP); await cancelRule(RP, { daysBefore: 0, refundBp: 0 });
    await pool.query(`DELETE FROM "HotelReservation" WHERE id = $1`, [RV]);
    await pool.query(`DELETE FROM "HotelRatePlan" WHERE id = $1`, [RP]);
    const left = [await countOf("HotelBookingNight", `"reservationId" = $1`, [RV]), await countOf("HotelFolio", `"reservationId" = $1`, [RV]), await countOf("HotelFolioItem", `"folioId" = $1`, [FO]), await countOf("HotelGuestRecord", `"reservationId" = $1`, [RV]), await countOf("HotelCancelRule", `"ratePlanId" = $1`, [RP])];
    eq(left, [0, 0, 0, 0, 0], "[nights, folio, items, guest, rules] ค้าง");
  });
  await st("K-4", "RESTRICT จริง: ลบแผนที่มี HotelRate/ChannelRateMap ⇒ 23001 · ลบประเภทห้องที่มี Rate/Override/ChannelRoomMap/InventoryBuffer ⇒ 23001 · ลบห้องที่มี HousekeepingLog ⇒ 23001 · อ้าง id ที่ไม่มี ⇒ 23503", async () => {
    const { RP0 } = FX();
    const RTX = rid("rtx"); const RX = rid("rx");
    await insertRow("HotelRoomType", { id: RTX, tenantId: tA, unitId: uA, name: `ชั่วคราว ${RUN}`, updatedAt: now() });
    await insertRow("HotelRoom", { id: RX, tenantId: tA, unitId: uA, roomTypeId: RTX, number: `HX-${RUN.slice(-3)}`, updatedAt: now() });
    await hkLog({ roomId: RX });
    await override({ roomTypeId: RTX });
    await expectCodes([
      ["ลบแผนมี Rate", () => pool.query(`DELETE FROM "HotelRatePlan" WHERE id = $1`, [RP0]), "23001"],
      ["ลบประเภทห้องมี Override", () => pool.query(`DELETE FROM "HotelRoomType" WHERE id = $1`, [RTX]), "23001"],
      ["ลบห้องมี HK log", () => pool.query(`DELETE FROM "HotelRoom" WHERE id = $1`, [RX]), "23001"],
      ["ลบประเภทห้องมี Rate/RoomMap/Buffer", () => pool.query(`DELETE FROM "HotelRoomType" WHERE id = $1`, [RT]), "23001"],
      ["Rate อ้างแผนที่ไม่มี", () => rate(rid("ghost")), "23503"],
      ["Night อ้างการจองที่ไม่มี", () => night(rid("ghost")), "23503"],
    ]);
  });
  await st("K-5", "SET NULL จริง: ลบฤดู ⇒ HotelRate.seasonId = null (แถวคง) · ลบแผน ⇒ HotelReservation.ratePlanId = null (การจองคง)", async () => {
    const SS = rid("ssn"); const RP = rid("rpn"); const RTE = rid("rten"); const RV = rid("rvn");
    await season({ id: SS }); await plan({ id: RP }); await rate(RP, { id: RTE, seasonId: SS }); await resv({ id: RV, ratePlanId: RP });
    await pool.query(`DELETE FROM "HotelSeason" WHERE id = $1`, [SS]);
    eq((await q<{ s: string | null }>(`SELECT "seasonId" AS s FROM "HotelRate" WHERE id = $1`, [RTE]))[0]?.s, null, "seasonId หลังลบฤดู");
    await pool.query(`DELETE FROM "HotelRate" WHERE id = $1`, [RTE]);
    await pool.query(`DELETE FROM "HotelRatePlan" WHERE id = $1`, [RP]);
    const r = await q<{ rp: string | null }>(`SELECT "ratePlanId" AS rp FROM "HotelReservation" WHERE id = $1`, [RV]);
    ok(r.length === 1 && r[0].rp === null, `การจอง ${r.length} แถว ratePlanId=${r[0]?.rp}`);
  });

  // ═══════════════ C. CHECK ═══════════════
  console.log("\n── C: CHECK constraint (§2 · ค่าผิด 23514 · ค่าถูกผ่าน) ──");
  await st("C-1", "HotelReservation.source: นอก WEB/WALK_IN/PHONE/LINE/OTA ⇒ 23514 · ทั้ง 5 ค่าผ่าน · status ใหม่ HOLD/CONFIRMED/NO_SHOW เขียนได้", async () => {
    ok((await cols("HotelReservation", true)).some((c) => c.column_name === "source"), "ยังไม่มีคอลัมน์ HotelReservation.source");
    await expectCodes([
      ["source=FAX", () => resv({ source: "FAX" }), "23514"],
      ["source ว่าง", () => resv({ source: "" }), "23514"],
      ["source 5 ค่า", async () => { for (const s of ["WEB", "WALK_IN", "PHONE", "LINE", "OTA"]) await resv({ source: s }); }, ""],
      ["status ใหม่ 3 ค่า", async () => { for (const s of ["HOLD", "CONFIRMED", "NO_SHOW"]) await resv({ status: s }); }, ""],
    ]);
  });
  await st("C-2", "HotelRatePlan: depositKind นอก NONE/FIRST_NIGHT/FULL/PERCENT/FIXED_AMOUNT ⇒ 23514 · status นอก ACTIVE/ARCHIVED ⇒ 23514 · ค่าถูกผ่านทั้งชุด", async () => {
    await expectCodes([
      ["depositKind=HALF", () => plan({ depositKind: "HALF" }), "23514"],
      ["status=DRAFT", () => plan({ status: "DRAFT" }), "23514"],
      ["depositKind 5 ค่า", async () => { for (const k of ["NONE", "FIRST_NIGHT", "FULL", "PERCENT", "FIXED_AMOUNT"]) await plan({ depositKind: k, depositValue: k === "PERCENT" ? 3000 : k === "FIXED_AMOUNT" ? 50_000 : 0 }); }, ""],
      ["ARCHIVED", () => plan({ status: "ARCHIVED" }), ""],
    ]);
  });
  await st("C-3", "HotelSeason: status นอกรายการ ⇒ 23514 · dateEnd < dateStart ⇒ 23514 · dateEnd = dateStart ผ่าน (รวมวันจบ) · minNights 0 / ติดลบ ⇒ 23514 · minNights null / 1 / 2 ผ่าน (มติ §12 ข้อ 10)", async () => {
    ok((await cols("HotelSeason", true)).some((c) => c.column_name === "minNights"), "ยังไม่มีคอลัมน์ HotelSeason.minNights");
    await expectCodes([
      ["status=DRAFT", () => season({ status: "DRAFT" }), "23514"],
      ["dateEnd<dateStart", () => season({ dateStart: dayN(120), dateEnd: dayN(119) }), "23514"],
      ["dateEnd=dateStart", () => season({ dateStart: dayN(120), dateEnd: dayN(120) }), ""],
      ["ARCHIVED", () => season({ status: "ARCHIVED" }), ""],
      ["minNights=0", () => season({ minNights: 0 }), "23514"],
      ["minNights=-1", () => season({ minNights: -1 }), "23514"],
      ["minNights null/1/2", async () => { await season({ minNights: null }); await season({ minNights: 1 }); await season({ minNights: 2 }); }, ""],
    ]);
  });
  await st("C-4", "HotelRate: ราคา 3 ช่องติดลบ ⇒ 23514 · 0 ผ่าน · holiday null ผ่าน", async () => {
    const RP = rid("rpc4"); await plan({ id: RP });
    await expectCodes([
      ["weekday=-1", () => rate(RP, { priceWeekdaySatang: -1, roomTypeId: RT2 }), "23514"],
      ["weekend=-1", () => rate(RP, { priceWeekendSatang: -1, roomTypeId: RT2 }), "23514"],
      ["holiday=-1", () => rate(RP, { priceHolidaySatang: -1, roomTypeId: RT2 }), "23514"],
      ["0/0/null", () => rate(RP, { priceWeekdaySatang: 0, priceWeekendSatang: 0, priceHolidaySatang: null, roomTypeId: RT2 }), ""],
    ]);
  });
  await st("C-5", "HotelRateOverride.priceSatang < 0 ⇒ 23514 · 0 ผ่าน", async () => {
    await expectCodes([["price=-1", () => override({ priceSatang: -1, date: dayN(301) }), "23514"], ["price=0", () => override({ priceSatang: 0, date: dayN(302) }), ""]]);
  });
  await st("C-6", "HotelCancelRule: daysBefore นอก 0..365 ⇒ 23514 · refundBp นอก 0..10000 ⇒ 23514 · ขอบ (0/365 · 0/10000) ผ่าน", async () => {
    const RP = rid("rpc6"); await plan({ id: RP });
    await expectCodes([
      ["daysBefore=-1", () => cancelRule(RP, { daysBefore: -1 }), "23514"],
      ["daysBefore=366", () => cancelRule(RP, { daysBefore: 366 }), "23514"],
      ["refundBp=-1", () => cancelRule(RP, { daysBefore: 10, refundBp: -1 }), "23514"],
      ["refundBp=10001", () => cancelRule(RP, { daysBefore: 11, refundBp: 10_001 }), "23514"],
      ["ขอบ", async () => { await cancelRule(RP, { daysBefore: 0, refundBp: 0 }); await cancelRule(RP, { daysBefore: 365, refundBp: 10_000 }); }, ""],
    ]);
  });
  await st("C-7", "HotelBookingNight: priceSatang < 0 ⇒ 23514 · priceSource นอก RATE/OVERRIDE/FALLBACK/MANUAL ⇒ 23514 · 4 ค่าผ่าน · counted=false ผ่าน", async () => {
    const RV = rid("rvc7"); await resv({ id: RV });
    await expectCodes([
      ["price=-1", () => night(RV, { priceSatang: -1 }), "23514"],
      ["priceSource=PROMO", () => night(RV, { priceSource: "PROMO", date: dayN(51) }), "23514"],
      ["priceSource 4 ค่า", async () => { let d = 60; for (const s of ["RATE", "OVERRIDE", "FALLBACK", "MANUAL"]) await night(RV, { priceSource: s, date: dayN(d++) }); }, ""],
      ["counted=false", () => night(RV, { counted: false, date: dayN(70) }), ""],
    ]);
  });
  await st("C-8", "HotelFolio.status นอก OPEN/SETTLED/VOID ⇒ 23514 · 3 ค่าผ่าน", async () => {
    const mk = async (status: string) => { const RV = rid("rvf"); await resv({ id: RV }); return folio(RV, { status }); };
    await expectCodes([["status=CLOSED", () => mk("CLOSED"), "23514"], ["3 ค่า", async () => { for (const s of ["OPEN", "SETTLED", "VOID"]) await mk(s); }, ""]]);
  });
  await st("C-9", "HotelFolioItem.type นอกรายการ 14 ชนิด ⇒ 23514 · ทั้ง 14 ผ่าน · amount ติดลบ (จ่าย/คืน) ผ่าน", async () => {
    const { FO0 } = FX();
    const TYPES = ["ROOM", "SERVICE", "POS_CHARGE", "MINIBAR", "DISCOUNT", "TAX", "SERVICE_CHARGE", "DEPOSIT", "PAYMENT", "REFUND", "PENALTY", "SECURITY_DEPOSIT", "SECURITY_REFUND", "VOID_REVERSAL"];
    await expectCodes([
      ["type=TIP", () => folioItem(FO0, { type: "TIP" }), "23514"],
      ["14 ชนิด", async () => { for (const t of TYPES) await folioItem(FO0, { type: t }); }, ""],
      ["PAYMENT ติดลบ", () => folioItem(FO0, { type: "PAYMENT", unitAmountSatang: -129_000, amountSatang: -129_000 }), ""],
    ]);
  });
  await st("C-10", "HotelGuestRecord: idType นอก PASSPORT/THAI_ID/OTHER ⇒ 23514 · tm30Status นอก NOT_REQUIRED/PENDING/FILED/LATE ⇒ 23514 · ค่าถูกผ่าน · idType null ผ่าน", async () => {
    const { RV0 } = FX();
    await expectCodes([
      ["idType=DRIVER", () => guest(RV0, { idType: "DRIVER" }), "23514"],
      ["tm30Status=DONE", () => guest(RV0, { tm30Status: "DONE" }), "23514"],
      ["ค่าถูก", async () => { for (const t of ["PASSPORT", "THAI_ID", "OTHER"]) await guest(RV0, { idType: t }); for (const s of ["NOT_REQUIRED", "PENDING", "FILED", "LATE"]) await guest(RV0, { tm30Status: s }); await guest(RV0, { idType: null }); }, ""],
    ]);
  });
  await st("C-11", "HotelNightAudit.status นอก CLOSED/REOPENED ⇒ 23514 · ChannelAriJob.status นอก PENDING/SENT/FAILED/SUPERSEDED ⇒ 23514 · ค่าถูกผ่าน", async () => {
    await expectCodes([
      ["audit status=OPEN", () => audit({ status: "OPEN", businessDate: dayN(-2) }), "23514"],
      ["audit REOPENED", () => audit({ status: "REOPENED", businessDate: dayN(-3) }), ""],
      ["ari status=DONE", () => ariJob({ status: "DONE" }), "23514"],
      ["ari 4 ค่า", async () => { for (const s of ["PENDING", "SENT", "FAILED", "SUPERSEDED"]) await ariJob({ status: s }); }, ""],
    ]);
  });
  await st("C-12", "ChannelReservationInbox.status นอก RECEIVED/APPLIED/NEEDS_ROOM/REJECTED ⇒ 23514 · ChannelInventoryBuffer.rooms < 0 ⇒ 23514 · ค่าถูกผ่าน", async () => {
    await expectCodes([
      ["inbox status=DONE", () => inbox({ status: "DONE" }), "23514"],
      ["inbox 4 ค่า", async () => { for (const s of ["RECEIVED", "APPLIED", "NEEDS_ROOM", "REJECTED"]) await inbox({ status: s }); }, ""],
      ["buffer rooms=-1", () => buffer({ rooms: -1 }), "23514"],
      ["buffer rooms=2", () => buffer({ rooms: 2 }), ""],
    ]);
  });

  // ═══════════════ U. unique / index ═══════════════
  console.log("\n── U: unique · partial unique · NULLS NOT DISTINCT · ดัชนี ──");
  await st("U-1", "HotelRatePlan @@unique(unitId, code) จริง: รหัสซ้ำในหน่วย ⇒ 23505 · หน่วยอื่น (ร้าน B) รหัสเดียวกันได้", async () => {
    const code = `DUP-${RUN}`;
    await expectCodes([["แผน 1", () => plan({ code }), ""], ["แผน 2 รหัสเดิม", () => plan({ code }), "23505"], ["ร้าน B รหัสเดิม", () => plan({ code, tenantId: tB, unitId: uB }), ""]]);
  });
  await st("U-2", "HotelRatePlan partial unique แผนเริ่มต้น: default ACTIVE 2 แผนในหน่วย ⇒ 23505 · default ARCHIVED เพิ่มได้ · หน่วยอื่น default ได้ (SQL มือ WHERE isDefault AND status='ACTIVE')", async () => {
    const ix = await findIx("HotelRatePlan", (r) => r.uniq && r.cols.join(",") === "unitId" && /isDefault/i.test(r.pred ?? "") && /ACTIVE/.test(r.pred ?? ""));
    ok(!!ix, "ไม่พบ partial unique (unitId) WHERE isDefault AND status = 'ACTIVE'");
    await expectCodes([
      ["default 1", () => plan({ isDefault: true }), ""],
      ["default 2", () => plan({ isDefault: true }), "23505"],
      ["default ARCHIVED", () => plan({ isDefault: true, status: "ARCHIVED" }), ""],
      ["ร้าน B default", () => plan({ isDefault: true, tenantId: tB, unitId: uB }), ""],
    ]);
  });
  await st("U-3", "HotelRate unique (ratePlanId, roomTypeId, seasonId) NULLS NOT DISTINCT: แถวปกติ (season null) ซ้ำ ⇒ 23505 · ฤดูเดียวกันซ้ำ ⇒ 23505 · ฤดูอื่น/ประเภทอื่นได้", async () => {
    ok(!!(await findIx("HotelRate", (r) => r.uniq && r.nnd && r.pred === null && r.cols.join(",") === "ratePlanId,roomTypeId,seasonId")), "ไม่พบ unique NULLS NOT DISTINCT ตรงคอลัมน์/ลำดับ");
    const RP = rid("rpu3"); const SS = rid("ssu3"); const SS2 = rid("ssu3b");
    await plan({ id: RP }); await season({ id: SS }); await season({ id: SS2 });
    await expectCodes([
      ["null 1", () => rate(RP, { seasonId: null }), ""],
      ["null 2", () => rate(RP, { seasonId: null }), "23505"],
      ["ฤดู 1", () => rate(RP, { seasonId: SS }), ""],
      ["ฤดู 1 ซ้ำ", () => rate(RP, { seasonId: SS }), "23505"],
      ["ฤดู 2", () => rate(RP, { seasonId: SS2 }), ""],
      ["ประเภทอื่น null", () => rate(RP, { seasonId: null, roomTypeId: RT2 }), ""],
    ]);
  });
  await st("U-4", "HotelRateOverride unique (roomTypeId, ratePlanId, date) NULLS NOT DISTINCT: ทุกแผน (null) วันเดียวกันซ้ำ ⇒ 23505 · แผนเจาะจงวันเดียวกันได้ · แผนเจาะจงซ้ำ ⇒ 23505", async () => {
    ok(!!(await findIx("HotelRateOverride", (r) => r.uniq && r.nnd && r.pred === null && r.cols.join(",") === "roomTypeId,ratePlanId,date")), "ไม่พบ unique NULLS NOT DISTINCT ตรงคอลัมน์/ลำดับ");
    const RP = rid("rpu4"); await plan({ id: RP }); const d = dayN(320);
    await expectCodes([
      ["null 1", () => override({ date: d }), ""],
      ["null 2", () => override({ date: d }), "23505"],
      ["แผน 1", () => override({ date: d, ratePlanId: RP }), ""],
      ["แผน 1 ซ้ำ", () => override({ date: d, ratePlanId: RP }), "23505"],
    ]);
  });
  await st("U-5", "HotelHoliday @@unique(unitId, date) · HotelCancelRule @@unique(ratePlanId, daysBefore) · HotelFolio reservationId unique · HotelNightAudit @@unique(unitId, businessDate) — ซ้ำ ⇒ 23505", async () => {
    const RP = rid("rpu5"); await plan({ id: RP }); const RV = rid("rvu5"); await resv({ id: RV });
    await expectCodes([
      ["holiday 1", () => holiday({ date: dayN(210) }), ""], ["holiday ซ้ำ", () => holiday({ date: dayN(210) }), "23505"],
      ["rule 1", () => cancelRule(RP, { daysBefore: 5 }), ""], ["rule ซ้ำ", () => cancelRule(RP, { daysBefore: 5, refundBp: 5000 }), "23505"],
      ["folio 1", () => folio(RV), ""], ["folio ซ้ำ", () => folio(RV), "23505"],
      ["audit 1", () => audit({ businessDate: dayN(-10) }), ""], ["audit ซ้ำ", () => audit({ businessDate: dayN(-10) }), "23505"],
    ]);
  });
  await st("U-6", "HotelBookingNight @@unique(reservationId, date) ⇒ 23505 · **ไม่มี** unique ใด ๆ บน (roomId, date) (มติ §2 ข้อ 2 — EXCLUDE ของ RoomOccupancy ตัดสินห้องจริง) · ห้องเดียวคืนเดียวกัน 2 การจอง INSERT ได้", async () => {
    const RV = rid("rvu6"); const RV2 = rid("rvu6b"); await resv({ id: RV }); await resv({ id: RV2 });
    const bad = (await ixOf("HotelBookingNight")).filter((r) => r.uniq && r.cols.includes("roomId"));
    ok(bad.length === 0, `มี unique บน roomId: ${bad.map((r) => r.name).join(", ")}`);
    await expectCodes([
      ["คืน 1", () => night(RV, { date: dayN(50), roomId: R2 }), ""],
      ["คืนเดิมซ้ำ", () => night(RV, { date: dayN(50), roomId: R3 }), "23505"],
      ["การจองอื่น ห้อง/คืนเดียวกัน", () => night(RV2, { date: dayN(50), roomId: R2 }), ""],
    ]);
  });
  await st("U-7", "Channel: RoomMap @@unique(connectionId, roomTypeId) + (connectionId, externalRoomId) · RateMap @@unique(connectionId, ratePlanId) · Inbox @@unique(connectionId, externalId, version) · InventoryBuffer @@unique(connectionId, roomTypeId) — ซ้ำ ⇒ 23505 · version ใหม่ได้", async () => {
    const conn = rid("conn"); const RP = rid("rpu7"); await plan({ id: RP }); const ext = rid("ext");
    await expectCodes([
      ["roomMap 1", () => roomMap({ connectionId: conn, externalRoomId: ext }), ""],
      ["roomMap roomType ซ้ำ", () => roomMap({ connectionId: conn, externalRoomId: rid("x") }), "23505"],
      ["roomMap external ซ้ำ", () => roomMap({ connectionId: conn, roomTypeId: RT2, externalRoomId: ext }), "23505"],
      ["rateMap 1", () => rateMap(RP, { connectionId: conn }), ""], ["rateMap ซ้ำ", () => rateMap(RP, { connectionId: conn }), "23505"],
      ["inbox v1", () => inbox({ connectionId: conn, externalId: ext, version: 1 }), ""], ["inbox v1 ซ้ำ", () => inbox({ connectionId: conn, externalId: ext, version: 1 }), "23505"], ["inbox v2", () => inbox({ connectionId: conn, externalId: ext, version: 2 }), ""],
      ["buffer 1", () => buffer({ connectionId: conn }), ""], ["buffer ซ้ำ", () => buffer({ connectionId: conn }), "23505"],
    ]);
  });
  const IDX: [string, string, string[], boolean][] = [
    ["U-8", "HotelReservation", ["unitId", "groupId"], false],
    ["U-9", "HotelReservation", ["status", "holdExpiresAt"], false],
    ["U-10", "HotelRatePlan", ["tenantId", "unitId", "status"], false],
    ["U-11", "HotelSeason", ["tenantId", "unitId", "dateStart", "dateEnd"], false],
    ["U-12", "HotelRate", ["tenantId", "unitId"], false],
    ["U-13", "HotelRateOverride", ["tenantId", "unitId", "date"], false],
    ["U-14", "HotelBookingNight", ["unitId", "roomTypeId", "date", "counted"], false],
    ["U-15", "HotelBookingNight", ["unitId", "roomId", "date"], false],
    ["U-16", "HotelFolio", ["tenantId", "unitId", "status"], false],
    ["U-17", "HotelFolioItem", ["folioId", "businessDate"], false],
    ["U-18", "HotelFolioItem", ["tenantId", "unitId", "refType", "refId"], false],
    ["U-19", "HotelGuestRecord", ["reservationId"], false],
    ["U-20", "HotelGuestRecord", ["tenantId", "unitId", "tm30Status", "tm30DueAt"], false],
    ["U-21", "HotelGuestRecord", ["retainUntil"], false],
    ["U-22", "HotelHousekeepingLog", ["tenantId", "unitId", "createdAt"], false],
    ["U-23", "HotelHousekeepingLog", ["roomId", "createdAt"], false],
    ["U-24", "ChannelAriJob", ["connectionId", "status", "createdAt"], false],
    ["U-25", "ChannelReservationInbox", ["tenantId", "unitId", "status"], false],
  ];
  for (const [id, table, c, u] of IDX) {
    await st(id, `${table} ${u ? "@@unique" : "@@index"}(${c.join(", ")})${id === "U-14" ? " — availability S:521" : ""}`, async () => {
      await needTable(table);
      const rows = await ixOf(table);
      ok(rows.some((r) => r.pred === null && r.nexpr === 0 && r.uniq === u && r.cols.join(",") === c.join(",")), "ไม่พบดัชนีตรงคอลัมน์/ลำดับ/ชนิด");
    });
  }
  await st("U-26", "ดัชนี/ข้อจำกัดเดิมยังอยู่: RoomOccupancy_no_overlap (EXCLUDE) · STAY partial unique · HotelReservation (unitId, code) · (unitId, roomTypeId, checkInDate, checkOutDate)", async () => {
    const ro = await ixOf("RoomOccupancy"); const rv = await ixOf("HotelReservation");
    ok(ro.some((r) => r.name === "RoomOccupancy_no_overlap"), "RoomOccupancy_no_overlap หาย");
    ok(ro.some((r) => r.uniq && r.cols.join(",") === "refType,refId" && /kind = 'STAY'/i.test(r.pred ?? "")), "STAY partial unique หาย");
    ok(rv.some((r) => r.uniq && r.cols.join(",") === "unitId,code"), "unique (unitId, code) หาย");
    ok(rv.some((r) => !r.uniq && r.cols.join(",") === "unitId,roomTypeId,checkInDate,checkOutDate"), "ดัชนี availability เดิมหาย");
  });

  // ═══════════════ S. scope · fitness · client ═══════════════
  console.log("\n── S: scope registry · fitness F1 · Prisma client ──");
  await st("S-1", "scope.ts: โมเดลใหม่ 17 ตัวลงทะเบียน axis = unit (scopeOf)", () => {
    const bad: string[] = [];
    for (const m of NEW_MODELS) { let ax = "(ไม่ลงทะเบียน)"; try { ax = SCOPE.scopeOf(m).axis; } catch { /* fail-closed */ } if (ax !== "unit") bad.push(`${m}=${ax}`); }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("S-2", "scope.ts เทียบฐาน: เพิ่มอย่างเดียว (ไม่ลบบรรทัด) · บรรทัดที่เพิ่มเป็น `<Model>: unit` ของ 17 ตัว (+ คอมเมนต์)", () => {
    const del = diffLines(F.scope, "-");
    ok(del.length === 0, `ลบ/แก้บรรทัดเดิม: ${del.slice(0, 3).join(" | ")}`);
    const plus = diffLines(F.scope, "+");
    ok(plus.length > 0, "scope.ts ยังไม่เปลี่ยน");
    const bad = plus.filter((l) => !/^(\w+):\s*unit,?$/.test(l) || !(NEW_MODELS as readonly string[]).includes(l.split(":")[0]));
    ok(bad.length === 0, `บรรทัดเพิ่มนอกใบ: ${bad.slice(0, 3).join(" | ")}`);
  }, "MAJOR");
  await st("S-3", "fitness (โหมดมี env): exit 0 และไม่มี finding F1.* (ทุก model ลงทะเบียน · ไม่มีตกค้าง)", () => {
    const r = spawnSync("pnpm", ["exec", "tsx", F.fitness], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
    ok(line, `fitness ไม่พิมพ์ JSON_SUMMARY (exit=${r.status}) ${out.split("\n").slice(-3).join(" | ").slice(0, 200)}`);
    const js = JSON.parse((line as string).slice(13)) as { findings: { id: string; detail: string }[] };
    const f1 = js.findings.filter((f) => f.id.startsWith("F1."));
    ok(f1.length === 0, f1.map((f) => `${f.id}: ${f.detail.slice(0, 120)}`).join(" | "));
    ok(r.status === 0, `fitness exit=${r.status}: ${js.findings.map((f) => f.id).join(", ")}`);
  });
  await st("S-4", "Prisma client generate แล้ว: โมเดลใหม่ 17 ตัว + ฟิลด์ใหม่ (Reservation.ratePlanId/groupId/policySnapshot · RoomType.baseOccupancy · Room.hkNote) + enum CONFIRMED · boot assert (assertRegistryComplete) ผ่าน", () => {
    ok(CLIENT?.Prisma?.dmmf?.datamodel, "import @prisma/client ไม่ได้");
    const dm = CLIENT.Prisma.dmmf.datamodel as { models: { name: string; fields: { name: string }[] }[] };
    const miss: string[] = NEW_MODELS.filter((m) => !dm.models.some((x) => x.name === m));
    const f = (m: string) => new Set(dm.models.find((x) => x.name === m)?.fields.map((x) => x.name) ?? []);
    for (const [m, k] of [["HotelReservation", "ratePlanId"], ["HotelReservation", "groupId"], ["HotelReservation", "policySnapshot"], ["HotelRoomType", "baseOccupancy"], ["HotelRoom", "hkNote"]] as const) if (!f(m).has(k)) miss.push(`${m}.${k}`);
    if (!Object.values(CLIENT.HotelReservationStatus ?? {}).includes("CONFIRMED")) miss.push("HotelReservationStatus.CONFIRMED");
    ok(miss.length === 0, `client ขาด: ${miss.join(", ")} (ยังไม่ prisma generate ในเลนนี้?)`);
    SCOPE.assertRegistryComplete(dm.models.map((m) => m.name));
  });

  // ═══════════════ R. ทะเบียนค่าตั้ง ═══════════════
  console.log("\n── R: ทะเบียนค่าตั้ง rooms.hotel.* (§6) ──");
  const defs: Any[] = SET.listDefs("rooms");
  const defOf = (key: string): Any => { const d = SET.getDef(key); if (!d) throw new AssertFail(`ยังไม่มีคีย์ ${key}`); return d; };
  const hotelDefs = defs.filter((d) => d.key.startsWith("rooms.hotel."));
  const parses = (schema: Any, v: unknown): boolean => { try { return schema.safeParse(v).success === true; } catch { return false; } };
  await st("R-1", "เปิดเฟส H: ไม่มีคีย์ rooms.hotel.* ใดมี hiddenUntil = PHASE_H (helper hotel() ถอดแล้ว) · คีย์โรงแรมเดิม 24 ตัวยังอยู่", () => {
    const hidden = hotelDefs.filter((d) => d.hiddenUntil === "PHASE_H").map((d) => d.key);
    ok(hidden.length === 0, `ยังซ่อน ${hidden.length} คีย์: ${hidden.slice(0, 4).join(", ")}…`);
    const old = ["checkInTime", "checkOutTime", "holdMinutesOnline", "holdMinutesCounter", "deposit", "cancelPolicy", "noShow", "securityDeposit", "baseRate", "dayOfWeekAdjustBp", "defaultRatePlan", "minNights", "closedToArrival", "housekeepingChecklist", "minibar", "nightAuditTime", "tm30ReminderHours", "rr3OnScreen", "ota.enabled", "ota.roomScope", "ota.buffer", "ota.markupBp", "ota.onConflict"];
    const miss = old.filter((k) => !SET.getDef(`rooms.hotel.${k}`));
    ok(miss.length === 0, `คีย์เดิมหาย: ${miss.join(", ")}`);
  });
  for (const [i, k] of NEW_KEYS.entries()) {
    await st(`R-K${i + 1}`, `${k.key}: type ${k.type} · ค่าเริ่ม ${J(k.def)} · chain ${k.chain.join("→")}${k.money ? " · MONEY" : ""} · ป้ายไทย · schema รับ ${J(k.okVals)} ปฏิเสธ ${J(k.badVals)}`, () => {
      const d = defOf(k.key);
      const probs: string[] = [];
      if (d.type !== k.type) probs.push(`type ${d.type}`);
      if (!isDeepStrictEqual(d.defaults?._fallback, k.def)) probs.push(`ค่าเริ่ม ${J(d.defaults?._fallback)}`);
      if (!isDeepStrictEqual([...d.chain], k.chain)) probs.push(`chain ${J(d.chain)}`);
      if (k.money && d.sensitivity !== "MONEY") probs.push(`sensitivity ${d.sensitivity ?? "(ไม่มี)"}`);
      if (!THAI.test(d.labelTh ?? "")) probs.push("labelTh ไม่ใช่ไทย");
      if (d.domain !== "rooms") probs.push(`domain ${d.domain}`);
      if (d.hiddenUntil) probs.push(`hiddenUntil ${d.hiddenUntil}`);
      if (!parses(d.schema, k.def)) probs.push("schema ไม่รับค่าเริ่มของตัวเอง");
      for (const v of k.okVals) if (!parses(d.schema, v)) probs.push(`schema ปฏิเสธ ${J(v)}`);
      for (const v of k.badVals) if (parses(d.schema, v)) probs.push(`schema รับ ${J(v)}`);
      ok(probs.length === 0, probs.join(" · "));
    });
  }
  await st("R-2", "rooms.hotel.deposit: schema รับ {kind:FIXED_AMOUNT, amountSatang} · ปฏิเสธ amountSatang ติดลบ/kind อื่น/คีย์แปลก · ค่าเริ่มคง {kind:FIRST_NIGHT} · chain U→RATE_PLAN · MONEY", () => {
    const d = defOf("rooms.hotel.deposit");
    const probs: string[] = [];
    if (!parses(d.schema, { kind: "FIXED_AMOUNT", amountSatang: 50_000 })) probs.push("ปฏิเสธ FIXED_AMOUNT+amountSatang");
    if (!parses(d.schema, { kind: "FIXED_AMOUNT" })) probs.push("amountSatang ควร optional (MONEY.optional())");
    if (!parses(d.schema, { kind: "PERCENT", percentBp: 3000 })) probs.push("ปฏิเสธ PERCENT เดิม");
    if (parses(d.schema, { kind: "FIXED_AMOUNT", amountSatang: -1 })) probs.push("รับ amountSatang ติดลบ");
    if (parses(d.schema, { kind: "HALF" })) probs.push("รับ kind แปลก");
    if (parses(d.schema, { kind: "FIRST_NIGHT", foo: 1 })) probs.push("รับคีย์แปลก (strict หาย)");
    if (!isDeepStrictEqual(d.defaults._fallback, { kind: "FIRST_NIGHT" })) probs.push(`ค่าเริ่ม ${J(d.defaults._fallback)}`);
    if (!isDeepStrictEqual([...d.chain], ["UNIT", "RATE_PLAN"]) || d.sensitivity !== "MONEY") probs.push(`chain/sensitivity ${J(d.chain)}/${d.sensitivity}`);
    ok(probs.length === 0, probs.join(" · "));
  });
  await st("R-3", "rooms.hotel.cancelPolicy ค่าเริ่ม = [{7,10000},{3,5000},{0,0}] (Q2) · chain RATE_PLAN · holdMinutesOnline คง 15 · holdMinutesCounter คง 1440", () => {
    const cp = defOf("rooms.hotel.cancelPolicy");
    eq(cp.defaults._fallback, [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }], "cancelPolicy");
    eq([...cp.chain], ["RATE_PLAN"], "chain cancelPolicy");
    eq(defOf("rooms.hotel.holdMinutesOnline").defaults._fallback, 15, "holdMinutesOnline");
    eq(defOf("rooms.hotel.holdMinutesCounter").defaults._fallback, 1440, "holdMinutesCounter");
  });
  await st("R-4", "requires.integration ของ rooms.hotel.ota.* = \"CHANNEL_MANAGER\" (ota.enabled ต้องมี) · ไม่มี def ใดใน rooms ที่ยัง requires \"OTA\"", () => {
    const ota = hotelDefs.filter((d) => d.key.startsWith("rooms.hotel.ota."));
    ok(ota.length >= 4, `คีย์ ota.* ${ota.length}`);
    const en = defOf("rooms.hotel.ota.enabled");
    eq(en.requires?.integration, "CHANNEL_MANAGER", "ota.enabled requires");
    const bad = ota.filter((d) => d.requires?.integration && d.requires.integration !== "CHANNEL_MANAGER").map((d) => `${d.key}=${d.requires.integration}`);
    ok(bad.length === 0, bad.join(" · "));
    const stillOta = defs.filter((d) => d.requires?.integration === "OTA").map((d) => d.key);
    ok(stillOta.length === 0, `ยัง requires OTA: ${stillOta.join(", ")}`);
  });
  await st("R-5", `SNAPSHOT_KEYS.reservation ตรงชุด §6.2 (${SNAP_RESERVATION.length} คีย์ · domain rooms) · ทุกคีย์ที่จดมี def จริง`, () => {
    const keys: string[] | undefined = SET.SNAPSHOT_KEYS?.reservation;
    ok(keys, "ยังไม่มี SNAPSHOTS.reservation");
    eq([...(keys as string[])].sort(), [...SNAP_RESERVATION].sort(), "ชุดคีย์");
    const miss = (keys as string[]).filter((k) => !SET.getDef(k));
    ok(miss.length === 0, `คีย์ไม่มี def: ${miss.join(", ")}`);
  });
  await st("R-6", "snapshotPolicy(\"reservation\", {unitId}) ทำงานจริงบนหน่วยชั่วคราว: domain rooms · values ครบทุกคีย์ (ค่าเริ่ม: tax.mode INCLUSIVE · vatBp 700 · serviceChargeBp 0 · cancelPolicy 7/3/0 · securityDeposit.enabled false · rounding SATANG) · fromSnapshot อ่านคืนได้", async () => {
    ok(SET.SNAPSHOT_KEYS?.reservation, "ยังไม่มี SNAPSHOTS.reservation (snapshotPolicy ไม่รู้จักชนิด reservation)");
    const snap = await SET.snapshotPolicy({ tenantId: tA }, "reservation", { unitId: uA });
    eq(snap.domain, "rooms", "domain");
    eq(Object.keys(snap.values).sort(), [...SNAP_RESERVATION].sort(), "values keys");
    eq([snap.values["rooms.hotel.tax.mode"], snap.values["rooms.hotel.tax.vatBp"], snap.values["rooms.hotel.tax.serviceChargeBp"], snap.values["rooms.hotel.securityDeposit.enabled"], snap.values["rooms.money.rounding"]], ["INCLUSIVE", 700, 0, false, "SATANG"], "ค่าเริ่ม");
    eq(snap.values["rooms.hotel.cancelPolicy"], [{ daysBefore: 7, refundBp: 10_000 }, { daysBefore: 3, refundBp: 5_000 }, { daysBefore: 0, refundBp: 0 }], "cancelPolicy ใน snapshot");
    eq(SET.fromSnapshot(snap, "rooms.hotel.checkInTime"), "14:00", "fromSnapshot");
  });
  await st("R-7", "editPermission: ทุกคีย์ rooms.hotel.* = hotel.settings.edit · คีย์ rooms อื่นทั้งหมด = dorm.settings.edit (เดิม)", () => {
    const badH = hotelDefs.filter((d) => d.editPermission !== "hotel.settings.edit").map((d) => `${d.key}=${d.editPermission}`);
    ok(badH.length === 0, `โรงแรม: ${badH.slice(0, 4).join(" · ")}`);
    const badD = defs.filter((d) => !d.key.startsWith("rooms.hotel.") && d.editPermission !== "dorm.settings.edit").map((d) => `${d.key}=${d.editPermission}`);
    ok(badD.length === 0, `หอ: ${badD.slice(0, 4).join(" · ")}`);
  });
  // เทียบกับนิยามฐาน a9aad92d8 (import ไฟล์เดิมโดยตรง · ไม่ลงทะเบียนซ้ำ)
  const SER_FIELDS = ["key", "domain", "group", "type", "labelTh", "helpTh", "defaults", "chain", "editPermission", "ownerOnly", "sensitivity", "legal", "requires", "effectiveDated", "templateVars", "hiddenUntil", "enumLabelsTh", "percentScale", "tableTh", "writeVia"];
  const ZOD: Any = (await tryImport("zod")).mod;
  const serDef = (d: Any, drop: string[] = []): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const f of SER_FIELDS) if (!drop.includes(f) && d[f] !== undefined) out[f] = JSON.parse(J(d[f]));
    out.legalInput = typeof d.legalInput === "function";
    try { out.schema = ZOD.toJSONSchema(d.schema, { unrepresentable: "any", io: "input" }); } catch (e) { out.schema = `(toJSONSchema ไม่ได้: ${errMsg(e).slice(0, 60)})`; }
    return out;
  };
  let baseMod: Any = null; let baseErr = "";
  try {
    const src = git(["show", `${BASE_SHA}:${F.rooms}`]);
    const abs = (rel: string) => pathToFileURL(join(ROOT, "src/lib/core/settings", rel)).href;
    const patched = src
      .replace(/from\s+"\.\.\/legal\/th-rental-2568"/g, `from "${abs("legal/th-rental-2568.ts")}"`)
      .replace(/from\s+"\.\.\/registry"/g, `from "${abs("registry.ts")}"`)
      .replace(/from\s+"\.\.\/types"/g, `from "${abs("types.ts")}"`)
      .replace(/defineSettings\("rooms",\s*withLabels\(DEFS\),[^;]*\);\s*$/m, "export const BASE_DEFS = withLabels(DEFS); export const BASE_SNAPSHOTS = SNAPSHOTS; export const BASE_TEMPLATES = ROOM_TEMPLATES;");
    ok(/export const BASE_DEFS/.test(patched), "แทนที่ defineSettings ในไฟล์ฐานไม่ได้");
    const dir = mkdtempSync(join(tmpdir(), "svc-h0-base-"));
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules")); // ให้ไฟล์ฐานหา zod/… ของทรีนี้ได้ (node เดินขึ้นหา node_modules)
    const file = join(dir, `rooms-base-${STAMP}.mts`);
    writeFileSync(file, patched);
    const m = await tryImport(pathToFileURL(file).href);
    baseMod = m.mod; baseErr = m.err;
  } catch (e) { baseErr = errMsg(e); }
  const needBase = (): Any => { if (!baseMod?.BASE_DEFS) throw new AssertFail(`โหลดนิยามฐาน a9aad92d8 ไม่ได้: ${baseErr}`); return baseMod; };
  await st("R-8", "คีย์หอ/ค่าเริ่มเดิมไม่เปลี่ยนแม้ไบต์เดียว: def ทุกคีย์ที่ไม่ใช่ rooms.hotel.* (ชนิด · ป้าย · ค่าเริ่ม · chain · schema · legal · editPermission) เท่ากับฐาน a9aad92d8 · จำนวน/ลำดับคีย์หอเท่าเดิม · SNAPSHOTS.lease + แม่แบบ 4 ตัวเท่าเดิม", () => {
    const bm = needBase();
    const baseDorm: Any[] = (bm.BASE_DEFS as Any[]).filter((d) => !d.key.startsWith("rooms.hotel."));
    const curDorm = defs.filter((d) => !d.key.startsWith("rooms.hotel."));
    eq(curDorm.map((d) => d.key), baseDorm.map((d) => d.key), "รายการ/ลำดับคีย์หอ");
    const diffs: string[] = [];
    for (const b of baseDorm) { const c = curDorm.find((d) => d.key === b.key); if (!c || !isDeepStrictEqual(serDef(c), serDef(b))) diffs.push(b.key); }
    ok(diffs.length === 0, `คีย์หอเปลี่ยน: ${diffs.slice(0, 5).join(", ")}`);
    eq(SET.SNAPSHOT_KEYS?.lease, bm.BASE_SNAPSHOTS.lease, "SNAPSHOTS.lease");
    eq((SET.TEMPLATES?.rooms ?? []).map((t: Any) => [t.key, t.version, t.labelTh]), (bm.BASE_TEMPLATES as Any[]).map((t) => [t.key, t.version, t.labelTh]), "แม่แบบ");
  });
  await st("R-9", "คีย์โรงแรมเดิม 24 ตัว: เปลี่ยนได้เฉพาะที่ใบสั่งระบุ (ถอด hiddenUntil · editPermission → hotel.settings.edit · deposit schema · cancelPolicy ค่าเริ่ม · ota.* requires) นอกนั้นเท่าฐาน · คีย์ใหม่ต่อท้ายหลังบล็อกโรงแรมเดิม", () => {
    const bm = needBase();
    const baseHotel: Any[] = (bm.BASE_DEFS as Any[]).filter((d) => d.key.startsWith("rooms.hotel."));
    const ALLOW_SCHEMA = new Set(["rooms.hotel.deposit"]);
    const ALLOW_DEFAULT = new Set(["rooms.hotel.cancelPolicy"]);
    const ALLOW_REQ = new Set(baseHotel.filter((d) => d.key.startsWith("rooms.hotel.ota.")).map((d) => d.key));
    const diffs: string[] = [];
    for (const b of baseHotel) {
      const c = hotelDefs.find((d) => d.key === b.key);
      if (!c) { diffs.push(`${b.key} หาย`); continue; }
      const drop = ["hiddenUntil", "editPermission", ...(ALLOW_REQ.has(b.key) ? ["requires"] : []), ...(ALLOW_DEFAULT.has(b.key) ? ["defaults"] : [])];
      const sb = serDef(b, drop); const sc = serDef(c, drop);
      if (ALLOW_SCHEMA.has(b.key)) { delete sb.schema; delete sc.schema; }
      if (!isDeepStrictEqual(sb, sc)) diffs.push(b.key);
    }
    ok(diffs.length === 0, `คีย์โรงแรมเดิมเปลี่ยนนอกใบสั่ง: ${diffs.slice(0, 5).join(", ")}`);
    const keysOrder = defs.map((d) => d.key);
    const lastOld = keysOrder.indexOf("rooms.hotel.rr3OnScreen");
    const before = NEW_KEYS.filter((k) => keysOrder.indexOf(k.key) >= 0 && keysOrder.indexOf(k.key) < lastOld).map((k) => k.key);
    ok(before.length === 0, `คีย์ใหม่ไม่ได้ต่อท้าย: ${before.join(", ")}`);
  }, "MAJOR");
  await st("R-10", "rooms.ts เทียบฐาน: บรรทัดที่ลบ/แก้ได้เฉพาะ helper hotel() (hiddenUntil) · deposit schema · cancelPolicy ค่าเริ่ม · requires OTA · คอมเมนต์ (ไม่แตะคีย์หอ/ไฟล์ defs อื่น)", () => {
    const minus = diffLines(F.rooms, "-");
    ok(changedFiles([F.rooms]).length === 1, "rooms.ts ยังไม่เปลี่ยน");
    const allowed = /hiddenUntil|PHASE_H|const hotel\s*=|z\.enum\(\["NONE", "FIRST_NIGHT", "FULL", "PERCENT"\]\)|percentBp|daysBefore: 3, refundBp: 10_000|integration: "OTA"|^const EDIT\b|editPermission/;
    const bad = minus.filter((l) => !allowed.test(l));
    ok(bad.length === 0, `ลบ/แก้บรรทัดนอกใบ: ${bad.slice(0, 3).map((l) => l.slice(0, 70)).join(" | ")}`);
    const others = changedFiles(["src/lib/core/settings/defs"]).filter((f) => f !== F.rooms);
    ok(others.length === 0, `แตะ defs อื่น: ${others.join(", ")}`);
  }, "MAJOR");

  // ═══════════════ RP. scope RATE_PLAN ═══════════════
  console.log("\n── RP: scope RATE_PLAN ใช้ได้จริง (§6.3) ──");
  const ctxA = { tenantId: tA };
  const mkOwner = async (tag: string, tenantId: string) => {
    const id = rid(`u${tag}`);
    await insertRow("User", { id, email: `${EMAIL_PREFIX}${tag}-${STAMP}@shark.local`, name: `เจ้าของ ${tag}`, updatedAt: now() });
    await insertRow("Membership", { id: rid(`mb${tag}`), userId: id, tenantId, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: now(), updatedAt: now() });
    return { role: "OWNER" as const, unitAccess: ["*"], permissions: {} as Record<string, unknown>, userId: id };
  };
  let OWNER_A: Any = null;
  try { OWNER_A = await mkOwner("owner", tA); } catch (e) { record("RP-0", "สร้างเจ้าของร้านชั่วคราว (User + Membership)", "FAIL", errMsg(e), "CRITICAL"); }
  const needOwner = (): Any => { if (!OWNER_A) throw new AssertFail("ไม่มีเจ้าของร้านชั่วคราว (RP-0)"); return OWNER_A; };
  const PLAN_A = rid("planA"); const PLAN_A2 = rid("planA2"); const PLAN_B = rid("planB");
  let plansReady = false;
  try {
    await plan({ id: PLAN_A, code: `RPA-${RUN}`, name: "แผน A" });
    await plan({ id: PLAN_A2, code: `RPA2-${RUN}`, name: "แผน A เก็บ", status: "ARCHIVED" });
    await plan({ id: PLAN_B, code: `RPB-${RUN}`, tenantId: tB, unitId: uB, name: "แผน B" });
    plansReady = true;
  } catch { /* ตารางยังไม่มี — ข้อ RP แดงพร้อมเหตุผล */ }
  const needPlans = () => { if (!plansReady) throw new AssertFail("สร้าง HotelRatePlan ไม่ได้ (ยังไม่มีตาราง)"); };
  const CP = "rooms.hotel.cancelPolicy";
  const CP_VAL = [{ daysBefore: 14, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }];
  await st("RP-1", "setSettings(OWNER, cancelPolicy @RATE_PLAN แผน A) ⇒ ok · resolveSetting refs {unitId, ratePlanId} = ค่านั้น source RATE_PLAN · ไม่ส่ง ratePlanId ⇒ ค่าเริ่ม FALLBACK · แผนอื่นของหน่วย ⇒ ค่าเริ่ม", async () => {
    needPlans(); const o = needOwner();
    const w = await SET.setSettings(o, ctxA, [{ key: CP, scope: "RATE_PLAN", scopeId: PLAN_A, value: CP_VAL }]);
    ok(w?.ok === true, `setSettings: ${J(w).slice(0, 200)}`);
    const r = await SET.resolveSetting(ctxA, CP, { unitId: uA, ratePlanId: PLAN_A });
    eq([r.value, r.source, r.scopeId], [CP_VAL, "RATE_PLAN", PLAN_A], "resolve แผน A");
    const r0 = await SET.resolveSetting(ctxA, CP, { unitId: uA });
    eq(r0.source, "FALLBACK", "ไม่ส่ง ratePlanId");
    const r2 = await SET.resolveSetting(ctxA, CP, { unitId: uA, ratePlanId: PLAN_A2 });
    eq(r2.source, "FALLBACK", "แผนอื่น");
  });
  await st("RP-2", "X1: แผนของร้าน B (scopeId จริงแต่คนละร้าน) ⇒ ok:false code NOT_FOUND (มติ §12 ข้อ 1) · id ที่ไม่มี ⇒ คำตอบเดียวกัน · ไม่มี SettingValue ถูกเขียน · ร้าน B อ่านค่าของร้าน A ไม่ได้", async () => {
    needPlans(); const o = needOwner();
    const isNF = (r: Any) => r?.ok === false && r.code === "NOT_FOUND"; // มติ §12 ข้อ 1: NOT_FOUND เท่านั้น (ไม่มี SCOPE_NOT_FOUND)
    const r1 = await SET.setSettings(o, ctxA, [{ key: CP, scope: "RATE_PLAN", scopeId: PLAN_B, value: CP_VAL }]);
    const r2 = await SET.setSettings(o, ctxA, [{ key: CP, scope: "RATE_PLAN", scopeId: rid("ghost"), value: CP_VAL }]);
    ok(isNF(r1), `แผนร้าน B: ${J(r1).slice(0, 160)}`);
    ok(isNF(r2), `id ไม่มี: ${J(r2).slice(0, 160)}`);
    eq(r1.code, r2.code, "code ต้องเหมือนกัน (ไม่บอกใบ้ว่ามีอยู่)");
    eq(await countOf("SettingValue", `"scopeId" = $1 OR "tenantId" = $2`, [PLAN_B, tB]), 0, "SettingValue ที่เขียนให้ร้าน B");
    const rb = await SET.resolveSetting({ tenantId: tB }, CP, { unitId: uB, ratePlanId: PLAN_A });
    ok(rb.source !== "RATE_PLAN", `ร้าน B อ่านค่า RATE_PLAN ของร้าน A ได้: ${J(rb).slice(0, 120)}`);
  });
  await st("RP-3", "entitiesOfUnit(หน่วย A) มี {RATE_PLAN, แผน A} (ACTIVE) · ไม่มีแผน ARCHIVED · ไม่มีแผนร้าน B · หน่วยหอของร้าน A ไม่มีแผน", async () => {
    needPlans();
    const ents: { scope: string; scopeId: string }[] = await SETSVC.entitiesOfUnit(prisma, tA, uA);
    const rp = ents.filter((e) => e.scope === "RATE_PLAN").map((e) => e.scopeId);
    eq(rp, [PLAN_A], "แผนของหน่วย A");
    const entsD: { scope: string; scopeId: string }[] = await SETSVC.entitiesOfUnit(prisma, tA, uDorm);
    eq(entsD.filter((e) => e.scope === "RATE_PLAN").length, 0, "หน่วยหอ");
  });
  await st("RP-4", "refsFor(\"RATE_PLAN\", แผน A) = {unitId A, ratePlanId} · chain U_RP (deposit) ตั้งที่ RATE_PLAN ชนะ UNIT · chain RT_RP (baseRate) ตั้งที่ RATE_PLAN ชนะ ROOM_TYPE · settingsDiff เห็นแถว RATE_PLAN", async () => {
    needPlans(); const o = needOwner();
    const refs = await SET.refsFor(ctxA, "RATE_PLAN", PLAN_A);
    eq([refs?.unitId, refs?.ratePlanId], [uA, PLAN_A], "refsFor");
    ok((await SET.setSettings(o, ctxA, [{ key: "rooms.hotel.deposit", scope: "UNIT", scopeId: uA, value: { kind: "FULL" } }, { key: "rooms.hotel.deposit", scope: "RATE_PLAN", scopeId: PLAN_A, value: { kind: "FIXED_AMOUNT", amountSatang: 30_000 } }]))?.ok === true, "ตั้ง deposit 2 ชั้น");
    const dep = await SET.resolveSetting(ctxA, "rooms.hotel.deposit", { unitId: uA, ratePlanId: PLAN_A });
    eq([dep.value, dep.source], [{ kind: "FIXED_AMOUNT", amountSatang: 30_000 }, "RATE_PLAN"], "deposit แผน A");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.deposit", { unitId: uA })).value, { kind: "FULL" }, "deposit หน่วย");
    ok((await SET.setSettings(o, ctxA, [{ key: "rooms.hotel.baseRate", scope: "ROOM_TYPE", scopeId: RT, value: 120_000 }, { key: "rooms.hotel.baseRate", scope: "RATE_PLAN", scopeId: PLAN_A, value: 111_000 }]))?.ok === true, "ตั้ง baseRate 2 ชั้น");
    const br = await SET.resolveSetting(ctxA, "rooms.hotel.baseRate", { unitId: uA, roomTypeId: RT, ratePlanId: PLAN_A });
    eq([br.value, br.source], [111_000, "RATE_PLAN"], "baseRate แผนชนะประเภท");
    eq((await SET.resolveSetting(ctxA, "rooms.hotel.baseRate", { unitId: uA, roomTypeId: RT })).value, 120_000, "baseRate ประเภท");
    const rows: Any[] = await SET.settingsDiff(ctxA, { unitId: uA, domain: "rooms" });
    ok(rows.some((r) => r.scope === "RATE_PLAN" && r.scopeId === PLAN_A && r.key === CP), "settingsDiff ไม่เห็นแถว RATE_PLAN");
  });
  await st("RP-5", "resetSetting(cancelPolicy @RATE_PLAN แผน A) ⇒ removed 1 · กลับเป็นค่าเริ่ม · ประวัติ (settingHistory) มีแถว scope RATE_PLAN", async () => {
    needPlans(); const o = needOwner();
    const r = await SET.resetSetting(o, ctxA, { key: CP, scope: "RATE_PLAN", scopeId: PLAN_A });
    eq([r?.ok, r?.removed], [true, 1], "reset");
    eq((await SET.resolveSetting(ctxA, CP, { unitId: uA, ratePlanId: PLAN_A })).source, "FALLBACK", "หลัง reset");
    const h: Any[] = await SET.settingHistory(ctxA, { unitId: uA, key: CP });
    ok(h.some((x) => x.scope === "RATE_PLAN" && x.scopeId === PLAN_A), "ไม่มีประวัติ RATE_PLAN");
  });
  await st("RP-6", "service.ts เทียบฐาน: เพิ่มอย่างเดียว · SUPPORTED_SCOPES มี RATE_PLAN · locateMany อ่าน hotelRatePlan · entitiesOfUnit อ่าน hotelRatePlan ACTIVE", () => {
    const src = stripComments(read(F.settingsService));
    const sup = src.match(/const SUPPORTED_SCOPES[^;]*;/)?.[0] ?? "";
    ok(/"RATE_PLAN"/.test(sup), "SUPPORTED_SCOPES ไม่มี RATE_PLAN");
    ok(/hotelRatePlan\.findMany/.test(src), "ไม่อ่าน hotelRatePlan");
    const ent = src.split("export async function entitiesOfUnit")[1]?.split("\nexport ")[0] ?? "";
    ok(/hotelRatePlan/.test(ent) && /ACTIVE/.test(ent), "entitiesOfUnit ไม่รวมแผน ACTIVE");
    const del = diffLines(F.settingsService, "-");
    const bad = del.filter((l) => !/SUPPORTED_SCOPES|const \[b, rt, rm, st, sv, dv, res\]|svcResource\.findMany|\.\.\.res\.map/.test(l));
    ok(bad.length === 0, `ลบ/แก้บรรทัดเดิม: ${bad.slice(0, 3).map((l) => l.slice(0, 70)).join(" | ")}`);
  }, "MAJOR");

  // ═══════════════ P. สิทธิ์ ═══════════════
  console.log("\n── P: สิทธิ์โมดูล hotel (§7 · X9) ──");
  const permByKey = new Map<string, Any>((PERM.PERMISSIONS as Any[]).map((p) => [p.key, p]));
  await st("P-1", `คีย์ใหม่ 13 ตัวลงทะเบียนในโมดูล hotel (PERMISSIONS · isPermissionKey · moduleOfPermissionKey = hotel)`, () => {
    const miss = Object.keys(NEW_PERMS).filter((k) => !permByKey.has(k));
    ok(miss.length === 0, `ยังไม่มี: ${miss.join(", ")}`);
    const bad = Object.keys(NEW_PERMS).filter((k) => permByKey.get(k).module !== "hotel" || PERM.isPermissionKey(k) !== true || PERM.moduleOfPermissionKey(k) !== "hotel");
    ok(bad.length === 0, `module/registry ผิด: ${bad.join(", ")}`);
  });
  await st("P-2", "ป้ายไทยตรงตัวตามใบสั่ง §7 ทั้ง 13 คีย์ (permissionLabel)", () => {
    const bad = Object.entries(NEW_PERMS).filter(([k, l]) => permByKey.get(k)?.label !== l || PERM.permissionLabel(k) !== l).map(([k]) => `${k}: «${permByKey.get(k)?.label ?? "(ไม่มี)"}»`);
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("P-3", "คีย์เดิม 10 ตัวไม่เปลี่ยน (ป้าย · โมดูล · group) · คีย์ใหม่อยู่ group เดียวกับโมดูล hotel เดิม (booking) · ต่อท้ายหลังคีย์เดิม", () => {
    const old = Object.keys(OLD_PERMS);
    const bad = old.filter((k) => permByKey.get(k)?.label !== OLD_PERMS[k] || permByKey.get(k)?.module !== "hotel");
    ok(bad.length === 0, `คีย์เดิมเปลี่ยน: ${bad.join(", ")}`);
    const g = permByKey.get(old[0])?.group;
    const badG = Object.keys(NEW_PERMS).filter((k) => permByKey.get(k)?.group !== g);
    ok(badG.length === 0, `group ไม่ตรง (${g}): ${badG.join(", ")}`);
    const keys = (PERM.PERMISSIONS as Any[]).map((p) => p.key);
    const lastOld = Math.max(...old.map((k) => keys.indexOf(k)));
    const before = Object.keys(NEW_PERMS).filter((k) => keys.indexOf(k) < lastOld);
    ok(before.length === 0, `คีย์ใหม่แทรกก่อนคีย์เดิม: ${before.join(", ")}`);
  }, "MAJOR");
  await st("P-4", "permissions.ts เทียบฐาน: เพิ่มอย่างเดียว (ไม่ลบบรรทัด) · บรรทัดที่เพิ่ม = คีย์ hotel.* 13 ตัว (+ planned/คอมเมนต์) เท่านั้น · PERMISSION_KEYS ไม่มีคีย์ซ้ำ", () => {
    const del = diffLines(F.permissions, "-");
    ok(del.length === 0, `ลบ/แก้บรรทัดเดิม: ${del.slice(0, 3).join(" | ")}`);
    const plus = diffLines(F.permissions, "+");
    ok(plus.length > 0, "permissions.ts ยังไม่เปลี่ยน");
    const bad = plus.filter((l) => !/^"hotel\.[\w.]+":\s*"[^"]+",?$/.test(l) && !/^(planned:\s*\[|\]|\],|"hotel\.[\w.]+",?)$/.test(l));
    ok(bad.length === 0, `บรรทัดเพิ่มนอกใบ: ${bad.slice(0, 3).map((l) => l.slice(0, 70)).join(" | ")}`);
    const keys = (PERM.PERMISSIONS as Any[]).map((p) => p.key);
    eq(keys.length, new Set(keys).size, "คีย์ซ้ำ");
  }, "MAJOR");
  await st("P-5", "evaluate: STAFF ที่มี hotel.settings.edit ผ่านด่าน editPermission ของคีย์ rooms.hotel.* (settings editIssueFor = null) · STAFF ที่มีแค่ dorm.settings.edit ⇒ NO_PERMISSION · ฟิกซ์เจอร์ frontdesk ถือ hotel.rates.read ที่ลงทะเบียนแล้ว", () => {
    const d = defOf("rooms.hotel.bookingMode");
    const staffH = { role: "STAFF", unitAccess: [uA], permissions: { "hotel.settings.edit": true }, userId: "x" };
    const staffD = { role: "STAFF", unitAccess: [uA], permissions: { "dorm.settings.edit": true }, userId: "y" };
    eq(SETSVC.editIssueFor(staffH, d, "UNIT", uA), null, "ถือ hotel.settings.edit");
    eq(SETSVC.editIssueFor(staffD, d, "UNIT", uA)?.code, "NO_PERMISSION", "ถือแค่ dorm.settings.edit");
    const fd = SQC_USERS.find((u) => u.key === "frontdesk");
    ok(fd && Object.keys(fd.permissions).every((k) => PERM.isPermissionKey(k)), `สิทธิ์ frontdesk มีคีย์ที่ไม่ลงทะเบียน: ${J(fd?.permissions)}`);
  });

  // ═══════════════ B. backfill ═══════════════
  console.log("\n── B: backfill scripts/svc-h0-backfill.mts (§3) ──");
  const BF = read(F.backfill);
  const runBackfill = (args: string[]) => {
    const r = spawnSync("pnpm", ["exec", "tsx", F.backfill, ...args], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const line = out.split("\n").reverse().find((l) => l.startsWith("BACKFILL_SUMMARY "));
    let sum: Record<string, unknown> | null = null;
    try { sum = line ? (JSON.parse(line.slice(17)) as Record<string, unknown>) : null; } catch { sum = null; }
    try { writeFileSync(`/tmp/svc-h0-backfill-${args[0] ?? "run"}-${STAMP}.log`, out); } catch { /* ไม่เป็นไร */ }
    return { status: r.status, out, sum, tail: out.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 240) };
  };
  const SUM_FIELDS = ["bookedToConfirmed", "nightsCreated", "occupancyClaimed", "occupancyConflict", "foliosCreated"];
  const sumOk = (s: Record<string, unknown> | null) => !!s && SUM_FIELDS.every((f) => typeof s[f] === "number");
  await st("B-1", "ไฟล์ backfill มีอยู่ · รองรับ --dry · พิมพ์ BACKFILL_SUMMARY · claim ห้องผ่าน facade @/lib/modules/rooms (claimRoom) ไม่เขียน roomOccupancy ตรง · ไม่มี `any` · ไม่ import .env/production", () => {
    ok(BF, `ยังไม่มี ${F.backfill}`);
    const code = stripComments(BF);
    const miss = [["--dry", /--dry/], ["BACKFILL_SUMMARY", /BACKFILL_SUMMARY/], ["claimRoom", /\bclaimRoom\b/], ["import @/lib/modules/rooms", /from\s+["']@\/lib\/modules\/rooms["']/]].filter(([, re]) => !(re as RegExp).test(code)).map(([n]) => n);
    ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
    ok(!/roomOccupancy\.(create|createMany|update|updateMany|upsert)\b/.test(code), "เขียน roomOccupancy ตรง (ต้องผ่าน facade)");
    ok(!/INSERT\s+INTO\s+"RoomOccupancy"/i.test(code), "INSERT RoomOccupancy ตรง");
    ok(!/\bany\b/.test(code.replace(/\/\/.*$/gm, "")), "มี any");
    ok(!/loadEnvFile\(\s*["']\.env["']\s*\)|QC_ENV_FILE\s*=\s*["']\.env["']/.test(code), "อ่าน .env (production) ตรง");
  }, "MAJOR");
  // ฉาก: การจอง BOOKED ชั่วคราวผ่าน hotel service เดิม (ร้าน A) + ร้าน B (CANCELLED)
  type Scene = { R1: string; R2: string; R3: string; R4: string; RB: string; inA: string; outA: string; in3: string; out3: string; dep: number; rate: number; r1Room: string | null; r3Room: string | null };
  let scene: Scene | null = null;
  const needScene = (): Scene => { if (!scene) throw new AssertFail("ไม่มีฉากการจอง (B-2 ไม่ผ่าน)"); return scene; };
  const resvRow = (id: string) => prisma.hotelReservation.findUnique({ where: { id } });
  await st("B-2", "ฉาก: ร้าน A จอง BOOKED 4 ใบผ่าน hotel.createReservation (R1 2 คืน+มัดจำจ่ายแล้ว standalone · roomId null · R2/R3 = การจองก่อน R0.8: roomId ตั้งไว้แต่ไม่มี occupancy · R3 ห้องถูก BLOCK ทับช่วง = ชน · R4 ยกเลิก) · ร้าน B จอง 1 ใบแล้วยกเลิก · ทุกใบ status เริ่ม BOOKED", async () => {
    const inA = addDays(TODAY, 20); const outA = addDays(TODAY, 22);
    const mk = async (tenantId: string, unitId: string, roomTypeId: string, ci: string, co: string, name: string) => {
      const r = await HOTEL.createReservation({ tenantId, unitId, roomTypeId, checkInDate: ci, checkOutDate: co, guestName: name });
      ok(r?.ok === true, `createReservation ${name}: ${J(r)}`);
      return String(r.id);
    };
    const R1 = await mk(tA, uA, RT, inA, outA, "แขก R1");
    const dep = await HOTEL.recordDeposit(tA, uA, R1);
    ok(dep?.ok === true, `recordDeposit: ${J(dep)}`);
    const R2 = await mk(tA, uA, RT, addDays(TODAY, 30), addDays(TODAY, 31), "แขก R2");
    const in3 = addDays(TODAY, 40); const out3 = addDays(TODAY, 42);
    const R3 = await mk(tA, uA, RT, in3, out3, "แขก R3");
    const R4 = await mk(tA, uA, RT2, addDays(TODAY, 50), addDays(TODAY, 51), "แขก R4");
    ok((await HOTEL.cancelReservation(tA, uA, R4, "ทดสอบ"))?.ok === true, "cancel R4");
    const RB = await mk(tB, uB, RTB, addDays(TODAY, 20), addDays(TODAY, 21), "แขก B");
    ok((await HOTEL.cancelReservation(tB, uB, RB, "ทดสอบ"))?.ok === true, "cancel RB");
    const r1 = await resvRow(R1);
    ok(r1?.depositPaidAt && r1.depositSaleId === null && r1.depositSatang === 50_000, `R1 มัดจำ: ${J({ paid: r1?.depositPaidAt, sale: r1?.depositSaleId, dep: r1?.depositSatang })}`);
    ok(r1?.roomId === null, `R1 roomId ควร null ตอนจอง (P1 ตั้งตอนเช็กอิน) ได้ ${r1?.roomId}`);
    // R2/R3 = การจองเดิมก่อน R0.8: roomId ตั้งไว้ตอนจอง (P1 รุ่นแรก) แต่ไม่มี RoomOccupancy — ย้ายห้องที่ถืออยู่ลง roomId แล้วถอด occupancy
    const heldRoom = async (id: string) => (await q<{ r: string }>(`SELECT "roomId" AS r FROM "RoomOccupancy" WHERE "refType" = 'HotelReservation' AND "refId" = $1 AND active`, [id]))[0]?.r ?? null;
    const room2 = await heldRoom(R2); const room3 = await heldRoom(R3);
    ok(room2 && room3, `R2/R3 ไม่มี occupancy จากการจอง: ${J([room2, room3])}`);
    await pool.query(`UPDATE "HotelReservation" SET "roomId" = CASE id WHEN $1 THEN $2 ELSE $3 END WHERE id IN ($1, $4)`, [R2, room2, room3, R3]);
    await pool.query(`DELETE FROM "RoomOccupancy" WHERE "refType" = 'HotelReservation' AND "refId" = ANY($1::text[])`, [[R2, R3]]);
    // R3: ห้องถูก BLOCK ทับช่วง ⇒ claim ต้องชน (ไม่ทับ)
    await insertRow("RoomOccupancy", { id: rid("blk"), tenantId: tA, unitId: uA, roomId: room3, startDate: in3, endDate: out3, kind: "BLOCK", refType: "QcBlock", refId: rid("qcb"), updatedAt: now() });
    const sts = await Promise.all([R1, R2, R3].map(async (id) => (await resvRow(id))?.status));
    eq(sts, ["BOOKED", "BOOKED", "BOOKED"], "status เริ่ม");
    const room1 = await heldRoom(R1); // มติ §12 ข้อ 7: R1 ไม่มี roomId แต่ถือห้องใน RoomOccupancy STAY active ⇒ nights.roomId = ห้องนั้น
    ok(room1, "R1 ไม่มี occupancy STAY active");
    scene = { R1, R2, R3, R4, RB, inA, outA, in3, out3, dep: 50_000, rate: 129_000, r1Room: room1, r3Room: room3 };
  });
  await st("B-3", "--dry: exit 0 · BACKFILL_SUMMARY 5 ฟิลด์ตัวเลข (bookedToConfirmed ≥ 3 · nightsCreated ≥ 6 · foliosCreated ≥ 3 · occupancyConflict ≥ 1) · ฐานไม่เปลี่ยน (status ยัง BOOKED · ไม่มี nights/folio · occupancy เท่าเดิม)", async () => {
    const sc = needScene();
    ok(BF, `ยังไม่มี ${F.backfill}`);
    const occBefore = await countOf("RoomOccupancy", `"tenantId" = ANY($1::text[])`, [[tA, tB]]);
    const r = runBackfill(["--dry"]);
    ok(r.status === 0, `exit=${r.status}: ${r.tail}`);
    ok(sumOk(r.sum), `BACKFILL_SUMMARY ไม่ครบ 5 ฟิลด์ตัวเลข: ${J(r.sum)}`);
    const s = r.sum as Record<string, number>;
    ok(s.bookedToConfirmed >= 3 && s.nightsCreated >= 6 && s.foliosCreated >= 3 && s.occupancyConflict >= 1, `ตัวเลข dry: ${J(s)}`);
    eq(await Promise.all([sc.R1, sc.R2, sc.R3].map(async (id) => (await resvRow(id))?.status)), ["BOOKED", "BOOKED", "BOOKED"], "status หลัง dry");
    eq([await countOf("HotelBookingNight", `"tenantId" = $1`, [tA]), await countOf("HotelFolio", `"tenantId" = $1`, [tA]), await countOf("RoomOccupancy", `"tenantId" = ANY($1::text[])`, [[tA, tB]])], [0, 0, occBefore], "[nights, folio, occupancy] หลัง dry");
  });
  let realSum: Record<string, number> | null = null;
  await st("B-4", "รันจริง: exit 0 · BACKFILL_SUMMARY ตัวเลข ≥ dry (bookedToConfirmed ≥ 3 · occupancyClaimed ≥ 1 · occupancyConflict ≥ 1 · foliosCreated ≥ 3)", () => {
    needScene();
    const r = runBackfill([]);
    ok(r.status === 0, `exit=${r.status}: ${r.tail}`);
    ok(sumOk(r.sum), `BACKFILL_SUMMARY: ${J(r.sum)}`);
    realSum = r.sum as Record<string, number>;
    ok(realSum.bookedToConfirmed >= 3 && realSum.occupancyClaimed >= 1 && realSum.occupancyConflict >= 1 && realSum.foliosCreated >= 3 && realSum.nightsCreated >= 6, `ตัวเลข: ${J(realSum)}`);
  });
  await st("B-5", "สถานะ: R1/R2/R3 BOOKED → CONFIRMED · R4 คง CANCELLED · ร้าน B คง CANCELLED · ไม่มีแถว BOOKED เหลือในฐาน (ข้ามร้าน §3 ข้อ 1) · policySnapshot ว่างคงว่าง", async () => {
    const sc = needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    eq(await Promise.all([sc.R1, sc.R2, sc.R3, sc.R4, sc.RB].map(async (id) => (await resvRow(id))?.status)), ["CONFIRMED", "CONFIRMED", "CONFIRMED", "CANCELLED", "CANCELLED"], "status");
    eq(await countOf("HotelReservation", `status::text = 'BOOKED'`, []), 0, "BOOKED ค้างทั้งฐาน");
    eq((await resvRow(sc.R1))?.policySnapshot ?? null, null, "policySnapshot R1");
  });
  await st("B-6", "nights R1: 2 แถว วันที่ [in, in+1] · counted=true · priceSource=MANUAL · priceSatang = ratePerNightSatang (129,000) · roomId ตามมติ §12 ข้อ 7 (R1 roomId null ⇒ ห้องจาก RoomOccupancy STAY active · R2 = reservation.roomId · R4 ไม่มี roomId/occupancy active ⇒ null) · roomTypeId/tenantId/unitId ตรง · ratePlanId null", async () => {
    const sc = needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    const rows = await q<Record<string, Any>>(`SELECT date, counted, "priceSource", "priceSatang", "roomId", "roomTypeId", "tenantId", "unitId", "ratePlanId" FROM "HotelBookingNight" WHERE "reservationId" = $1 ORDER BY date`, [sc.R1]);
    eq(rows.map((r) => ymdOfDb(r.date)), [sc.inA, addDays(sc.inA, 1)], "วันที่คืน");
    for (const r of rows) eq([r.counted, r.priceSource, r.priceSatang, r.roomId, r.roomTypeId, r.tenantId, r.unitId, r.ratePlanId], [true, "MANUAL", sc.rate, sc.r1Room, RT, tA, uA, null], `คืน ${ymdOfDb(r.date)}`);
    const r2 = await resvRow(sc.R2);
    const n2 = await q<{ roomId: string | null; counted: boolean; priceSource: string }>(`SELECT "roomId", counted, "priceSource" FROM "HotelBookingNight" WHERE "reservationId" = $1`, [sc.R2]);
    eq(n2, [{ roomId: r2?.roomId ?? null, counted: true, priceSource: "MANUAL" }], "คืนของ R2 (roomId = ห้องที่ตั้งไว้)");
    ok((await resvRow(sc.R4))?.roomId === null, "R4 ควรไม่มี roomId");
    eq((await q<{ roomId: string | null }>(`SELECT "roomId" FROM "HotelBookingNight" WHERE "reservationId" = $1`, [sc.R4])).map((x) => x.roomId), [null], "คืนของ R4 (legacy ไม่มี roomId/occupancy active ⇒ null)");
  });
  await st("B-7", "nights ของ CANCELLED (R4 ร้าน A · ร้าน B) สร้างเป็นประวัติ counted=false · nights ร้าน B ถือ tenantId/unitId ของร้าน B (X1) · การจอง CONFIRMED ทุกใบของร้าน A มี nights = จำนวนคืน", async () => {
    const sc = needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    const r4 = await q<{ counted: boolean }>(`SELECT counted FROM "HotelBookingNight" WHERE "reservationId" = $1`, [sc.R4]);
    ok(r4.length === 1 && r4[0].counted === false, `R4 nights: ${J(r4)}`);
    const rb = await q<{ counted: boolean; t: string; u: string }>(`SELECT counted, "tenantId" AS t, "unitId" AS u FROM "HotelBookingNight" WHERE "reservationId" = $1`, [sc.RB]);
    ok(rb.length === 1 && rb[0].counted === false && rb[0].t === tB && rb[0].u === uB, `ร้าน B nights: ${J(rb)}`);
    const rows = await q<{ id: string; nights: number; n: number }>(`SELECT r.id, r.nights, (SELECT count(*)::int FROM "HotelBookingNight" b WHERE b."reservationId" = r.id) AS n FROM "HotelReservation" r WHERE r."tenantId" = $1 AND r.status::text = 'CONFIRMED'`, [tA]);
    ok(rows.length === 3 && rows.every((r) => r.n === r.nights), `nights ต่อการจอง: ${J(rows)}`);
    eq(await countOf("HotelBookingNight", `"tenantId" = $1 AND "unitId" <> $2`, [tA, uA]), 0, "nights ข้ามหน่วยในร้าน A");
  });
  await st("B-8", "occupancy: R1 ยังมี STAY active 1 แถว (ไม่สร้างซ้ำ) · R2 ได้ STAY active ใหม่ผ่าน facade (ช่วงตรงการจอง · ห้องเดิม) · R3 ชน BLOCK ⇒ ไม่มี STAY · BLOCK ยังอยู่ (ไม่ทับ) · CANCELLED ไม่ได้ occupancy", async () => {
    const sc = needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    const occ = (id: string) => q<{ roomId: string; s: Date; e: Date; kind: string }>(`SELECT "roomId", "startDate" AS s, "endDate" AS e, kind FROM "RoomOccupancy" WHERE "refType" = 'HotelReservation' AND "refId" = $1 AND active`, [id]);
    const o1 = await occ(sc.R1); eq(o1.length, 1, "R1 STAY active");
    const o2 = await occ(sc.R2); const r2 = await resvRow(sc.R2);
    ok(o2.length === 1 && o2[0].kind === "STAY" && o2[0].roomId === r2?.roomId && ymdOfDb(o2[0].s) === ymdOfDb(r2?.checkInDate) && ymdOfDb(o2[0].e) === ymdOfDb(r2?.checkOutDate), `R2 occupancy: ${J(o2)} vs ${J({ room: r2?.roomId, ci: r2?.checkInDate, co: r2?.checkOutDate })}`);
    eq((await occ(sc.R3)).length, 0, "R3 ต้องไม่ได้ STAY (ชน)");
    eq(await countOf("RoomOccupancy", `"roomId" = $1 AND kind = 'BLOCK' AND active`, [sc.r3Room]), 1, "BLOCK ของ R3 ถูกแตะ");
    eq([(await occ(sc.R4)).length, (await occ(sc.RB)).length], [0, 0], "CANCELLED ได้ occupancy");
  });
  await st("B-9", "folio: R1/R2/R3 มี HotelFolio OPEN 1 ใบ · R1 (มัดจำจ่ายแล้ว) มี item DEPOSIT 1 แถว amount = −50,000 refType PosSale refId = depositSaleId (null) · R2/R3 ไม่มี item · R4/ร้าน B ไม่มี folio · folio ร้าน A อยู่หน่วย A", async () => {
    const sc = needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    for (const id of [sc.R1, sc.R2, sc.R3]) {
      const f = await q<{ id: string; status: string; unitId: string }>(`SELECT id, status, "unitId" FROM "HotelFolio" WHERE "reservationId" = $1`, [id]);
      ok(f.length === 1 && f[0].status === "OPEN" && f[0].unitId === uA, `folio ${id === sc.R1 ? "R1" : id === sc.R2 ? "R2" : "R3"}: ${J(f)}`);
      const items = await q<{ type: string; amountSatang: number; refType: string | null; refId: string | null }>(`SELECT type, "amountSatang", "refType", "refId" FROM "HotelFolioItem" WHERE "folioId" = $1`, [f[0].id]);
      if (id === sc.R1) eq(items, [{ type: "DEPOSIT", amountSatang: -sc.dep, refType: "PosSale", refId: null }], "item มัดจำ R1");
      else eq(items, [], `item ของ ${id === sc.R2 ? "R2" : "R3"}`);
    }
    eq([await countOf("HotelFolio", `"reservationId" = $1`, [sc.R4]), await countOf("HotelFolio", `"reservationId" = $1`, [sc.RB])], [0, 0], "folio ของ CANCELLED");
  });
  await st("B-10", "รันซ้ำ (idempotent): exit 0 · BACKFILL_SUMMARY ทุกตัว = 0 · จำนวนแถว nights/folio/items/occupancy เท่าเดิม", async () => {
    needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    const before = [await countOf("HotelBookingNight", "true", []), await countOf("HotelFolio", "true", []), await countOf("HotelFolioItem", "true", []), await countOf("RoomOccupancy", "active", [])];
    const r = runBackfill([]);
    ok(r.status === 0, `exit=${r.status}: ${r.tail}`);
    eq(r.sum, { bookedToConfirmed: 0, nightsCreated: 0, occupancyClaimed: 0, occupancyConflict: 0, foliosCreated: 0 }, "summary รอบ 2");
    eq([await countOf("HotelBookingNight", "true", []), await countOf("HotelFolio", "true", []), await countOf("HotelFolioItem", "true", []), await countOf("RoomOccupancy", "active", [])], before, "จำนวนแถว");
  });
  await st("B-11", "X1: backfill ไม่เขียนข้ามร้าน — ทุกแถวใหม่ (nights/folio/items) ของการจองร้าน B มี tenantId/unitId ร้าน B · ไม่มีแถวใดอ้างการจองของร้านอื่น · ร้านหอ (หน่วย DORM) ไม่มีแถวใหม่", async () => {
    needScene(); ok(realSum, "ยังไม่ได้รันจริง (B-4)");
    const bad = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "HotelBookingNight" b JOIN "HotelReservation" r ON r.id = b."reservationId" WHERE b."tenantId" <> r."tenantId" OR b."unitId" <> r."unitId"`);
    eq(bad[0].n, 0, "nights ที่ tenant/unit ไม่ตรงการจอง");
    const badF = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "HotelFolio" f JOIN "HotelReservation" r ON r.id = f."reservationId" WHERE f."tenantId" <> r."tenantId" OR f."unitId" <> r."unitId"`);
    eq(badF[0].n, 0, "folio ที่ tenant/unit ไม่ตรงการจอง");
    eq(await countOf("HotelBookingNight", `"unitId" = $1`, [uDorm]) + (await countOf("HotelFolio", `"unitId" = $1`, [uDorm])), 0, "แถวใหม่ในหน่วยหอ");
  });

  // ═══════════════ D. ด่าน type HOTEL ═══════════════
  console.log("\n── D: ด่าน type HOTEL (§8) ──");
  const ACT = read(F.actions);
  const actionBodies = (): { name: string; body: string }[] => {
    const parts = ACT.split(/(?=^export async function )/m).filter((p) => p.startsWith("export async function "));
    return parts.map((p) => ({ name: p.match(/^export async function (\w+)/)?.[1] ?? "?", body: p }));
  };
  const GATE = /unit\.type\s*!==\s*["']HOTEL["']|unit\.type\s*===\s*["']HOTEL["']|NOT_HOTEL_UNIT|assertHotelUnit|requireHotelUnit|hotelUnitGate/;
  await st("D-1", "actions.ts: ทุก export async function (11 ตัวเดิม) มีด่าน type HOTEL หลัง requireUnit และก่อนเรียก service (unit.type !== \"HOTEL\" / NOT_HOTEL_UNIT / helper เดียวที่ตรวจ \"HOTEL\")", () => {
    ok(ACT, `ไม่มี ${F.actions}`);
    const fns = actionBodies();
    ok(fns.length >= 11, `พบ action ${fns.length} ตัว (ต้อง ≥ 11)`);
    const helperOk = /function\s+(assertHotelUnit|requireHotelUnit|hotelUnitGate)\s*\([^)]*\)\s*\{[^}]*(type\s*!==\s*["']HOTEL["']|type\s*===\s*["']HOTEL["'])/.test(ACT);
    const bad: string[] = [];
    for (const f of fns) {
      const ru = f.body.search(/requireUnit\s*\(/);
      const g = f.body.search(GATE);
      const work = f.body.search(/\bhotel\.\w+\s*\(/);
      if (ru < 0) { bad.push(`${f.name}: ไม่มี requireUnit`); continue; }
      if (g < 0) { bad.push(`${f.name}: ไม่มีด่าน`); continue; }
      if (/assertHotelUnit|requireHotelUnit|hotelUnitGate/.test(f.body.slice(g, g + 40)) && !helperOk) { bad.push(`${f.name}: helper ไม่ได้ตรวจ \"HOTEL\"`); continue; }
      if (!(g > ru && (work < 0 || g < work))) bad.push(`${f.name}: ลำดับ requireUnit(${ru}) → ด่าน(${g}) → งาน(${work})`);
    }
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
  });
  await st("D-2", "createReservationAction (useActionState): หน่วยไม่ใช่ HOTEL ⇒ คืน {status:\"error\"} ตามแบบเดิมของไฟล์ (ไม่โยนออกไปหน้า) หรือ throw NOT_HOTEL_UNIT ที่จับไว้ · actions อื่นปฏิเสธก่อนแตะฐาน", () => {
    const f = actionBodies().find((x) => x.name === "createReservationAction");
    ok(f, "ไม่มี createReservationAction");
    const g = (f as { body: string }).body.search(GATE);
    ok(g >= 0, "ไม่มีด่านใน createReservationAction");
    const after = (f as { body: string }).body.slice(g, g + 400);
    ok(/status:\s*["']error["']|NOT_HOTEL_UNIT/.test(after), "ด่านไม่ตอบ {status:\"error\"}/NOT_HOTEL_UNIT");
  }, "MAJOR");
  await st("D-3", "3 หน้า (hotel · hotel/reservations · hotel/setup): requireUnit แล้ว `if (unit.type !== \"HOTEL\") notFound()` ก่อนอ่านข้อมูล", () => {
    const bad: string[] = [];
    for (const p of F.pages) {
      const src = read(p);
      if (!src) { bad.push(`${p}: ไม่มีไฟล์`); continue; }
      const ru = src.search(/requireUnit\s*\(/);
      const g = src.search(/unit\.type\s*!==\s*["']HOTEL["'][\s\S]{0,40}notFound\s*\(/);
      const work = src.search(/await\s+(dashboardData|listReservations|listRoomTypes|Promise\.all)\s*\(/);
      if (g < 0) bad.push(`${p.split("/").slice(-2).join("/")}: ไม่มีด่าน notFound`);
      else if (!(g > ru && (work < 0 || g < work))) bad.push(`${p.split("/").slice(-2).join("/")}: ลำดับผิด`);
    }
    ok(bad.length === 0, bad.join(" · "));
  });
  await st("D-4", "ด่านเพิ่ม \"บรรทัดเดียวต่อจุด\": actions.ts + หน้า 3 ไฟล์เปลี่ยนจากฐาน แต่ไม่ลบบรรทัดเดิม · hotel/service.ts ไม่ถูกแตะ (เส้นเงิน/จอง = H.3/H.5) · modules/rooms ไม่ถูกแตะ", () => {
    const bad: string[] = [];
    const untouched = [F.actions, ...F.pages].filter((f) => changedFiles([f]).length === 0);
    if (untouched.length) bad.push(`ยังไม่เปลี่ยน: ${untouched.map((f) => f.split("/").slice(-2).join("/")).join(", ")}`);
    for (const f of [F.actions, ...F.pages]) { const d = diffLines(f, "-"); if (d.length) bad.push(`${f.split("/").pop()} ลบ ${d.length} บรรทัด`); }
    const touched = changedFiles([F.hotelService, "src/lib/modules/rooms"]);
    if (touched.length) bad.push(`แตะ: ${touched.join(", ")}`);
    ok(bad.length === 0, bad.join(" · "));
  }, "MAJOR");
  await st("D-5", "ไม่มีโค้ดใน src/ (นอกไฟล์ที่ใบเป็นเจ้าของ) ถูกแตะเทียบฐาน a9aad92d8", () => {
    const own = new Set<string>([F.scope, F.rooms, F.settingsService, F.permissions, F.actions, ...F.pages]);
    const ch = changedFiles(["src"]).filter((f) => !own.has(f));
    ok(ch.length === 0, `แตะนอกใบ: ${ch.slice(0, 6).join(", ")}`);
  }, "MAJOR");

  // ═══════════════ V. หน้า 404 (ต้องมี QC server) ═══════════════
  console.log("\n── V: หน้า /app/u/<dorm>/hotel ⇒ 404 (QC server) ──");
  {
    const baseUrl = process.env.QC_BASE ?? "";
    const n1 = "เจ้าของ svcqc เปิด /app/u/bansuan-apartment/hotel · /hotel/reservations · /hotel/setup ⇒ HTTP 404 ทั้ง 3 · /app/u/bansuan-hotel/hotel ⇒ 200";
    if (!baseUrl) skip("V-1", n1, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
    else {
      await st("V-1", n1, async () => {
        const owner = SQC_USERS.find((u) => u.key === "owner");
        const row = await prisma.user.findUnique({ where: { email: owner?.email ?? "" }, select: { id: true } });
        ok(row, "ไม่พบผู้ใช้ owner ของ svcqc (seed ก่อน)");
        const { sha256 } = (await tryImport("@/lib/core/hash")).mod as { sha256: (s: string) => string };
        const token = `svch0${randomBytes(16).toString("hex")}`;
        const ttl = new Date(Date.now() + 15 * 60_000);
        const s = await prisma.session.create({ data: { userId: (row as { id: string }).id, tokenHash: sha256(token), userAgent: "qc-svc-h.0", idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
        sessionIds.push(s.id);
        const https = baseUrl.startsWith("https:");
        const cookie = `${https ? "__Host-shark_session" : "shark_session"}=${token}; shark_tenant=${SQC_TENANT.id}`;
        const get = async (p: string) => (await fetch(`${baseUrl}${p}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) })).status;
        const dorm = SQC_UNITS.dorm.slug; const hotel = SQC_UNITS.hotel.slug;
        const codes = [await get(`/app/u/${dorm}/hotel`), await get(`/app/u/${dorm}/hotel/reservations`), await get(`/app/u/${dorm}/hotel/setup`), await get(`/app/u/${hotel}/hotel`)];
        eq(codes, [404, 404, 404, 200], "[dorm×3, hotel]");
      }, "MAJOR");
    }
  }
} catch (e) {
  record("CRASH", `จบกลางทาง: ${errMsg(e)}`, "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { if (sessionIds.length) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } }); } catch { /* ไม่เป็นไร */ }
  try { await cleanup(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, [tenantIds]))[0].n : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch { /* ฐานหลุด */ }
  await pool.end();
}

// ═══════════════ G. regression (§9 · ลูกโพรเซส · หลังล้าง) ═══════════════
console.log("\n── G: regression (§9) ──");
const summaryOf = (out: string): { failed?: string[]; findings?: unknown[] } | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)) as { failed?: string[]; findings?: unknown[] }; } catch { return null; }
};
const judgeNoFail = (out: string) => (summaryOf(out)?.failed?.length ?? 1) === 0;
const judgeExit0 = (_out: string, code: number | null) => code === 0;
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge: (out: string, code: number | null) => boolean; note: string }[] = [
  { s: "qc-hotel-money", judge: judgeExit0, note: "exit 0 (oracle P1 — ต้องเขียวหลัง backfill · BOOKED ยังเขียนได้)" },
  { s: "qc-hotel-public", judge: judgeExit0, note: "exit 0" },
  { s: "qc-hotel-refund", judge: judgeExit0, note: "exit 0" },
  { s: "qc-svc-r0.8", judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-r0.9", judge: judgeNoFail, note: "ไม่มี FAIL (V ภาพ SKIP ได้)" },
  { s: "qc-svc-r0.3", judge: judgeNoFail, note: "ไม่มี FAIL (เครื่องยนต์ค่าตั้ง)" },
  { s: "qc-svc-r0.4", judge: judgeNoFail, note: "ไม่มี FAIL (หน้าค่าตั้ง)" },
  { s: "qc-svc-d.0", env: { SVC_D0_NO_REGRESSION: "1" }, judge: judgeNoFail, note: "ไม่มี FAIL (ตารางหอไม่เปลี่ยน)" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (ค่าตั้งหอไม่เปลี่ยน)" },
  { s: "qc-svc-smoke", judge: judgeNoFail, note: "ไม่มี FAIL" },
];
{
  const hasWork = !!migName && existsSync(join(ROOT, F.backfill));
  const why = !hasWork ? "ยังไม่มีงานของใบ (migration svc_h + backfill) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H0_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""} (${g.note})`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-h0-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge(all, r.status);
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
  const idF = `G-${REG.length + 1}`;
  const nameF = "fitness โหมดไร้ env (env -u DATABASE_URL/DIRECT_URL): exit 0 · ไม่มี finding F1.*";
  if (why) skip(idF, nameF, why);
  else {
    const env = { ...process.env } as Record<string, string | undefined>;
    delete env.DATABASE_URL; delete env.DIRECT_URL;
    const r = spawnSync("pnpm", ["exec", "tsx", F.fitness], { cwd: ROOT, env: env as NodeJS.ProcessEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const js = summaryOf(out) as { findings?: { id: string; detail?: string }[] } | null;
    const f1 = (js?.findings ?? []).filter((f) => f.id.startsWith("F1."));
    const pass = r.status === 0 && f1.length === 0 && !!js;
    record(idF, nameF, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status} · ${f1.map((f) => f.id).join(",") || (js ? "" : "ไม่มี JSON_SUMMARY")} · ${out.split("\n").filter((l) => /❌/.test(l)).slice(0, 2).join(" | ").slice(0, 160)}`, "CRITICAL");
  }
}

try { await prisma.$disconnect(); } catch { /* ไม่เป็นไร */ }
const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC H.0 · migration svc_h + backfill + scope/registry + ด่าน HOTEL =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: LABEL, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ ไม่มี SKIP (ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE — ผู้คุมรันครบก่อนรับ) · exit 1 เมื่อมี FAIL
process.exit(failed.length > 0 ? 1 : 0);
