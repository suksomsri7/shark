// QC — SVC H.5 · folio (บิลระหว่างพัก) · ลงห้องจาก POS (chargeToRoom · consumer pos.sale.paid) · เช็กเอาต์ปิดบิล POS ใบเดียวด้วยวิธีจ่ายจริง + shiftId ·
//      แยกจ่าย · กลุ่มใบเดียว · เงินประกันห้อง · ภาษีบนบิลจริง (POS คิด VAT) · กันรายได้ซ้ำ (reverseRoomChargePosting) · GL เข้ม · สิทธิ์ 4 ระดับ · event 3 ทะเบียน · จอ folio
//      oracle ของผู้เขียนข้อสอบ — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes → ผู้คุม ORACLE-EDIT)
// สัญญา: ledger/svc-briefs/svc-brief-h.5.md (§0 หลัก · §1 ไฟล์ · §2 มติ 11 ข้อ · §3 สัญญาโค้ด · §4 จอ · §5 event · §6 ฉาก · §7 เกณฑ์รับ/GL)
//        ยืนบน H.3 (booking.ts: createBooking · takeBookingDeposit — ข้อสอบนี้ใช้สร้างการจอง/มัดจำ · checkIn เดิมของ service.ts รับ CONFIRMED) · H.1 (taxLines · depositFor) · H.0 (HotelFolio/HotelFolioItem 14 ชนิด)
//        ฟิกซ์เจอร์ scripts/svc-qc-data.mts บล็อก "SVC H.5" (SQC_HOTEL_FOLIO_SCENE · SQC_VISUAL_SPECS["h.5"] · frontdesk +folio.post/checkOut ไม่มี folio.void) + "SVC H.3" (SQC_HOTEL_BOOKING_SCENE · SQC_POS_EXTRA_UNITS)
//
// กลุ่มข้อ:
//   PC ตัวควบคุม (เขียวก่อนมีงาน): ฟิกซ์เจอร์ h.5 สอดคล้อง (balance 84,000 คำนวณได้) · hotel ผูก POS บนฐาน · frontdesk/maid · ฐานเลน l3 · def ค่าตั้ง/สิทธิ์ · ภาพ --list · ของที่ยืนบน · oracle ของ oracle (VAT/GL ref)
//   FO folio (getFolio DTO · postFolioItem 4 ชนิด · เพดาน · DISCOUNT ต้อง manage · balance = Σ · businessDate ไทย · TAX/SERVICE_CHARGE EXCLUSIVE)
//   VD void (reversal · reversalOfId · ชนิดห้าม void · ROOM audit แล้วต้อง manage · เหตุผล ≥3 · สิทธิ์ · FOLIO_CLOSED)
//   RN postRoomNights (idempotent · ข้ามคืนที่ post แล้ว · ราคาจาก nights.priceSatang · auditId)
//   RC room charge (บิล POS ROOM_CHARGE reference เลขห้อง/รหัสจอง ⇒ POS_CHARGE itemized · unmatched + event · attach · DUPLICATE · ข้ามหน่วย/ร้าน B · AMBIGUOUS · pos.sale.voided ⇒ reversal)
//   ST settle (prepareCheckout · TAX_CONFIG_MISMATCH · PAY_MISMATCH · PAY_METHODS_REQUIRED · บิลใบเดียว HOTEL · DEPOSIT{refSaleId}+แยกจ่าย · shiftId · PAYMENT · CHECKED_OUT/DIRTY/release · event · มัดจำเกิน/พอดี · กลุ่ม · ซ้ำ/พร้อมกัน 10)
//   GL เข้ม (Σdr=Σcr · รายได้ครั้งเดียว · 1100 = 0 · 2110 ลดเท่ามัดจำ · เงินสด/ธนาคาร · reverseRoomChargePosting idempotent · ร้านไม่เชื่อมบัญชี · refundStay หลัง settle)
//   SD ประกัน (takeSecurityDeposit hotel-secdep · amount 0 บน folio · คืนเต็ม · ริบเต็ม+PENALTY · สิทธิ์)
//   B ด่าน (X1 ข้ามร้าน · X9 4 ระดับ · X10 DTO · actions สถิต · AuditLog) · N event 3 ทะเบียน · U UI สถิต · F ไฟล์ที่แตะ · Q ฉาก svcqc · V ภาพ · Z ล้าง · G regression
//
// 🔴 ผลที่ถูกต้องก่อนมีงาน: PC เขียว · FO/VD/RN/RC/ST/GL/SD/B/N/U/F แดงเหตุผล "ยังไม่มี src/lib/modules/hotel/folio.ts|checkout.ts|room-charge.ts" (หรือ "ยังไม่มี booking.ts" เมื่อ H.3 ยังไม่ merge) · Q/V/G SKIP
// 🔴 ร้านชั่วคราว slug/email `svc-h5-*` (POS + บัญชี ของตัวเอง) ลบใน finally + กวาดค้างตอนเริ่ม · ไม่แตะ /tmp (log regression ลง /root/svc-runs)
// รัน: cd /root/projects/shark-svc-l3 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-h.5.mts [--no-regression]
//      (ห้าม timeout ครอบ · ห้าม kill · ห้าม export CI · QC_BASE=http://127.0.0.1:<port> เปิดหมวด V)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC_TENANT, SQC_UNITS, SQC_USERS, SQC_HOTEL_TYPES, SQC_HOTEL_RATES, SQC_HOTEL_BOOKING_SCENE, SQC_HOTEL_FOLIO_SCENE, SQC_POS_EXTRA_UNITS, SQC_VISUAL_SPECS, SQC_TODAY_BKK, sqcAddDays } from "./svc-qc-data.mjs";

type Any = any;
const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const LABEL = "qc-svc-h.5";
const SUITE = "qc-svc-h.5";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_H5_NO_REGRESSION === "1";
const SLUG = "svc-h5-";
const MAIL = "svc-h5-";
const LOG_DIR = "/root/svc-runs";
const F = {
  folio: "src/lib/modules/hotel/folio.ts",
  checkout: "src/lib/modules/hotel/checkout.ts",
  roomCharge: "src/lib/modules/hotel/room-charge.ts",
  booking: "src/lib/modules/hotel/booking.ts",
  service: "src/lib/modules/hotel/service.ts",
  index: "src/lib/modules/hotel/index.ts",
  actions: "src/lib/modules/hotel/actions.ts",
  rates: "src/lib/modules/hotel/rates.ts",
  pricing: "src/lib/modules/hotel/pricing.ts",
  account: "src/lib/modules/account/index.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  whLabels: "src/lib/webhooks/labels.ts",
  perms: "src/lib/core/permissions.ts",
  roomsDefs: "src/lib/core/settings/defs/rooms.ts",
  panel: "src/components/hotel/FolioPanel.tsx",
  itemRow: "src/components/hotel/FolioItemRow.tsx",
  postDlg: "src/components/hotel/PostItemDialog.tsx",
  voidDlg: "src/components/hotel/VoidItemDialog.tsx",
  checkoutDlg: "src/components/hotel/CheckoutDialog.tsx",
  splitPay: "src/components/hotel/SplitPayEditor.tsx",
  secCard: "src/components/hotel/SecurityDepositCard.tsx",
  unmatchedList: "src/components/hotel/UnmatchedChargesList.tsx",
  shared: "src/components/hotel/folio-shared.ts",
  detailPage: "src/app/app/u/[unitSlug]/hotel/reservations/[id]/page.tsx",
  unmatchedPage: "src/app/app/u/[unitSlug]/hotel/folio/unmatched/page.tsx",
  printPage: "src/app/app/u/[unitSlug]/hotel/reservations/[id]/folio/print/page.tsx",
  scene: "scripts/svc-qc-hotel-folio-scene.mts",
  sceneH3: "scripts/svc-qc-hotel-booking-scene.mts",
  sceneH1: "scripts/svc-qc-hotel-rates-scene.mts",
  sds: "docs/sds/modules/hotel.md",
} as const;

loadSvcQcEnv(LABEL);
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);

// ═══════════════ harness ═══════════════
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
const codeOf = (r: Any) => (r?.ok === true ? "ok" : r?.code ?? r?.error ?? J(r)?.slice(0, 80));
const failCode = (r: Any): string | null => (r && r.ok === false ? String(r.code ?? r.error ?? "") : null);
const DENIED = new Set(["FORBIDDEN", "NO_PERMISSION", "PERMISSION", "PERMISSION_DENIED"]);
const isDenied = (r: Any) => { const c = failCode(r); return c !== null && DENIED.has(c); };
const isFail = (r: Any, ...codes: string[]) => { const c = failCode(r); return c !== null && (codes.length === 0 || codes.includes(c)); };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${codeOf(r)} ${r?.reason ?? r?.message ?? ""}`.trim()); return r; };
/** เรียกฟังก์ชันของใบ — throw ดิบ = บันทึกเป็น {ok:false, code:"THROW"} (ข้อสอบนับว่าผิดสัญญา "0 throw ดิบ") */
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const ymdOfDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOfDay(dayNo(ymd) + n);
const dowOf = (ymd: string) => (((dayNo(ymd) + 4) % 7) + 7) % 7;
const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ymdOfDb = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);
const nightsOf = (ci: string, co: string) => { const out: string[] = []; for (let d = ci; d < co; d = addDays(d, 1)) out.push(d); return out; };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const groupOf = (id: string) => id.split("-")[0];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ═══════════════ ตัวอ้างอิง (oracle ของ oracle · pure) ═══════════════
type Cell = { weekday: number; weekend: number };
const WEEKEND = [5, 6];
const refNightPrice = (cell: Cell, date: string) => (WEEKEND.includes(dowOf(date)) ? cell.weekend : cell.weekday);
const refStay = (cell: Cell, ci: string, co: string) => nightsOf(ci, co).map((d) => ({ date: d, priceSatang: refNightPrice(cell, d) }));
const refTotal = (cell: Cell, ci: string, co: string) => sum(refStay(cell, ci, co).map((n) => n.priceSatang));
/** VAT ในราคา (สูตรเดียวกับ src/lib/money/vat.ts splitIncludedVat — PC-7 ตรวจว่าตรงกับของจริง) */
const refVat = (gross: number, bp = 700) => { if (!(bp > 0)) return { base: gross, vat: 0 }; const den = 10_000 + bp; const base = Math.floor((2 * gross * 10_000 + den) / (2 * den)); return { base, vat: gross - base }; };
/** เครื่องหมายบน folio (ใบ §0 · H.0 §2.11): charge บวก · PAYMENT/DEPOSIT/REFUND(ลบ? — ใบ §2.1 REFUND บวก)/DISCOUNT ลบ · SECURITY_* 0 · VOID_REVERSAL ตรงข้ามของเดิม */
const NEG_TYPES = new Set(["PAYMENT", "DEPOSIT", "DISCOUNT"]);
const ZERO_TYPES = new Set(["SECURITY_DEPOSIT", "SECURITY_REFUND"]);
const ITEM_TYPES = ["ROOM", "SERVICE", "POS_CHARGE", "MINIBAR", "DISCOUNT", "TAX", "SERVICE_CHARGE", "DEPOSIT", "PAYMENT", "REFUND", "PENALTY", "SECURITY_DEPOSIT", "SECURITY_REFUND", "VOID_REVERSAL"];
const refBalance = (items: { amountSatang: number }[]) => sum(items.map((i) => i.amountSatang));
/** ราคาคืนของฉาก svcqc จาก SQC_HOTEL_RATES (STANDARD · ไม่มี breakfast) — ใช้เฉพาะ PC-1 */
const refScenePrice = (typeName: string, ymd: string): number => {
  const R = SQC_HOTEL_RATES;
  const base = R.base[typeName];
  const mmdd = ymd.slice(5);
  const [, m, d] = ymd.split("-").map(Number);
  if (typeName === R.override.roomType && d === R.override.dayOfMonth) return R.override.priceSatang;
  const inRange = (s: string, e: string) => (s <= e ? mmdd >= s && mmdd <= e : mmdd >= s || mmdd <= e);
  const seasons = [...R.seasons].filter((s) => inRange(s.start, s.end)).sort((a, b) => b.priority - a.priority);
  const s = seasons[0];
  const isHoliday = R.holidays.some((h) => h.date === mmdd);
  if (s?.fixed) { const f = s.fixed[typeName]; return isHoliday && f.holiday != null ? f.holiday : WEEKEND.includes(dowOf(ymd)) ? f.weekend : f.weekday; }
  const bucket = isHoliday && base.holiday != null ? base.holiday : WEEKEND.includes(dowOf(ymd)) ? base.weekend : base.weekday;
  const adj = s?.adjustBp ?? 0;
  void m;
  return Math.round((bucket * (10_000 + adj)) / 10_000);
};
const PII_KEY = /guest(Name|Phone|Email)|^phone$|^email$|idNumber|passport/i;
const walkKeys = (v: Any, keys = new Set<string>()): Set<string> => { if (v instanceof Set || v instanceof Date) return keys; if (Array.isArray(v)) v.forEach((x) => walkKeys(x, keys)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walkKeys(x, keys); } return keys; };

// ═══════════════ โหลดโมดูล (หลัง env) ═══════════════
const dbL = await tryImport("@/lib/core/db");
const prisma: Any = dbL.mod?.prisma;
if (!prisma) { console.error(`🔴 ${LABEL}: โหลด prisma ไม่ได้ (${dbL.err})`); process.exit(4); }
const SET = (await tryImport("@/lib/core/settings")).mod as Any;
const PERM = (await tryImport("@/lib/core/permissions")).mod as Any;
const vatL = await tryImport("@/lib/money/vat");
const hotelL = await loadIf(F.index);
const ratesL = await loadIf(F.rates);
const pricingL = await loadIf(F.pricing);
const serviceL = await loadIf(F.service);
const bookL = await loadIf(F.booking);
const folioL = await loadIf(F.folio);
const checkoutL = await loadIf(F.checkout);
const rcL = await loadIf(F.roomCharge);
const accountL = await loadIf(F.account);
const glL = await tryImport("@/lib/modules/account/gl");
const accSvcL = await tryImport("@/lib/modules/account/service");
const sysL = await tryImport("@/lib/modules/system/service");
const posL = await tryImport("@/lib/modules/pos/service");
const posDepL = await tryImport("@/lib/modules/pos/deposit");
const consumersL = await loadIf(F.consumers);
const autoL = await loadIf(F.autoLabels);
const whL = await loadIf(F.whLabels);
const RT = (name: string) => fnOf(ratesL, name, F.rates);
const BK = (name: string) => fnOf(bookL, name, F.booking);
const FO = (name: string) => fnOf(folioL, name, F.folio);
const CO = (name: string) => fnOf(checkoutL, name, F.checkout);
const RC = (name: string) => fnOf(rcL, name, F.roomCharge);
const AC = (name: string) => fnOf(accountL, name, F.account);
const needBooking = () => { if (!bookL.mod?.createBooking) throw new AssertFail(`ยังไม่มี ${F.booking} (H.3 ยังไม่ merge: ${bookL.err})`); };
const needFolio = () => { if (!folioL.mod) throw new AssertFail(`ยังไม่มี ${F.folio} (${folioL.err})`); };
const needCheckout = () => { if (!checkoutL.mod) throw new AssertFail(`ยังไม่มี ${F.checkout} (${checkoutL.err})`); };
const needRc = () => { if (!rcL.mod) throw new AssertFail(`ยังไม่มี ${F.roomCharge} (${rcL.err})`); };

// ═══════════════ ฐานข้อมูล: ตาราง H.0 · ล้าง ═══════════════
const H0_TABLES = ["HotelBookingNight", "HotelFolio", "HotelFolioItem", "HotelHousekeepingLog", "HotelRatePlan", "HotelCancelRule"];
let H0_OK = false;
let H0_WHY = "";
try {
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`, H0_TABLES);
  const have = new Set(rows.map((r) => r.t));
  const miss = H0_TABLES.filter((t) => !have.has(t));
  const col: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'HotelReservation' AND column_name IN ('securityDepositSatang','securityDepositSaleId','groupId','policySnapshot','taxSnapshot','source')`);
  const colOk = Number(col[0]?.n ?? 0) === 6;
  H0_OK = miss.length === 0 && colOk && typeof prisma.hotelFolioItem?.findMany === "function";
  H0_WHY = miss.length ? `ยังไม่มีตาราง H.0 บนฐาน l3: ${miss.join(", ")}` : !colOk ? "HotelReservation ยังไม่มีคอลัมน์ H.0 ครบ (securityDeposit*)" : typeof prisma.hotelFolioItem?.findMany !== "function" ? "Prisma client ยังไม่มี model HotelFolioItem" : "";
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

// ═══════════════ ตัวช่วยสถิต (UI) ═══════════════
const EN_ALLOW = /^(VAT|SC|OTA|LINE|PDPA|POS|ID|QR|AI|SHARK|HR|EDC|WEB|px|rem|em|svg|a|x|PromptPay|folio|Folio)$/;
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
const SERVER_FILES = /^src\/lib\/modules\/hotel\/(rates|hotel-settings|service|booking|availability|folio|checkout|room-charge|tape)\.ts$|^src\/lib\/modules\/(rooms|pos|account)\//;
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
      if (SERVER_FILES.test(r) || r === "src/lib/core/db.ts") { bad.push([...path, rel, r].join(" → ")); continue; }
      walk(r, [...path, rel]);
    }
  };
  walk(startRel, []);
  return bad;
};
const nearWrite = (src: string, literal: string, guard: RegExp) => { const i = src.indexOf(literal); if (i < 0) return false; return guard.test(src.slice(Math.max(0, i - 800), i)); };

console.log(`\n(ฐาน ${process.env.SVC_QC_HOST ?? "?"} · ตาราง H.0 ${H0_OK ? "มี" : `ยังไม่มี (${H0_WHY})`} · booking.ts ${bookL.mod ? "โหลดได้" : "ยังไม่มี"} · folio.ts ${folioL.mod ? "โหลดได้" : "ยังไม่มี"} · checkout.ts ${checkoutL.mod ? "โหลดได้" : "ยังไม่มี"} · room-charge.ts ${rcL.mod ? "โหลดได้" : "ยังไม่มี"})`);

// ═══════════════ ฟิกซ์เจอร์ฉาก → ตัวช่วย ═══════════════
const FS = SQC_HOTEL_FOLIO_SCENE;
const BS = SQC_HOTEL_BOOKING_SCENE;
const TYPE_NAME_TO_KEY: Record<string, keyof typeof SQC_HOTEL_TYPES> = { "ซูพีเรีย": "superior", "ดีลักซ์": "deluxe", "แฟมิลี": "family" };

try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length})`); await cleanup(stale.map((t: { id: string }) => t.id)); }
  await cleanupMisc();

  // ═══════════════ PC ตัวควบคุม ═══════════════
  console.log("\n── PC ตัวควบคุม ──");
  await st("PC-1", "ฟิกซ์เจอร์ h.5 สอดคล้องกันเอง: target = inhouse-web ของฉาก h.3 (CHECKED_IN · ดีลักซ์ · 3 คืน · เข้า −1 · มัดจำ PAID) · roomNightsPosted 1 = คืนที่ผ่าน · POS_CHARGE 2 บรรทัด = 64,000 · manual 4 (void 1) · itemsByType ตรงนับจากรายการ · balance 84,000 = ROOM(คืน −1 จาก pricing ref) + 64,000 + 12,000 + 18,000 + 18,000 − 18,000 − 10,000 − DEPOSIT(FIRST_NIGHT = คืนแรก = คืน −1) · securityHeld = ประกัน · unmatched 1 · mark", () => {
    const t = BS.bookings.find((b) => b.key === FS.target.key);
    ok(t, `ไม่มี ${FS.target.key} ในฉาก h.3`);
    eq([t!.status, t!.guest, t!.roomType, t!.nights, t!.checkInOffset, t!.deposit, t!.rooms, t!.plan], ["CHECKED_IN", FS.target.guest, "ดีลักซ์", 3, -1, "PAID", 1, "standard"], "target");
    eq(FS.roomNightsPosted, Math.min(t!.nights, -t!.checkInOffset), "roomNightsPosted");
    const food = sum(FS.roomChargeSale.lines.map((l) => l.qty * l.unitPriceSatang));
    eq([FS.roomChargeSale.lines.length, food], [2, 64_000], "บิลร้านอาหาร");
    const manual = FS.manual;
    const byType: Record<string, number> = { ROOM: FS.roomNightsPosted, POS_CHARGE: FS.roomChargeSale.lines.length, DEPOSIT: 1, SECURITY_DEPOSIT: 1, VOID_REVERSAL: manual.filter((m) => m.voidReason).length };
    for (const m of manual) byType[m.type] = (byType[m.type] ?? 0) + 1;
    eq(byType, { ...FS.expect.itemsByType }, "itemsByType");
    ok(manual.filter((m) => m.type === "DISCOUNT").every((m) => m.unitAmountSatang < 0) && manual.filter((m) => m.type !== "DISCOUNT").every((m) => m.unitAmountSatang > 0 && m.qty >= 1), "เครื่องหมาย manual");
    const plan = SQC_HOTEL_RATES.plans.find((p) => p.key === t!.plan)!;
    eq(plan.depositKind, "FIRST_NIGHT", "มัดจำแผน");
    const ci = sqcAddDays(SQC_TODAY_BKK, t!.checkInOffset);
    const roomPosted = nightsOf(ci, sqcAddDays(SQC_TODAY_BKK, 0)).slice(0, FS.roomNightsPosted).map((d) => refScenePrice(t!.roomType, d));
    const deposit = refScenePrice(t!.roomType, ci);
    const manualSum = sum(manual.map((m) => m.qty * m.unitAmountSatang)) - sum(manual.filter((m) => m.voidReason).map((m) => m.qty * m.unitAmountSatang));
    eq(sum(roomPosted) + food + manualSum - deposit, FS.expect.balanceSatang, "balance");
    eq(FS.expect.balanceSatang, 84_000, "84,000");
    eq([FS.expect.securityHeldSatang, FS.securityDeposit.amountSatang, FS.securityDeposit.payType], [100_000, 100_000, "CASH"], "ประกัน");
    eq([FS.expect.unmatched, FS.expect.folioStatus, FS.mark, FS.unit], [1, "OPEN", "SvcQcScene:h5", "hotel"], "ค่าคงที่");
    ok(FS.unmatchedSale.reference && !BS.bookings.some((b) => b.key === FS.unmatchedSale.reference), "reference ของบิล unmatched ต้องไม่ตรงอะไร");
    ok(TYPE_NAME_TO_KEY[t!.roomType], "ประเภทห้อง");
  });
  await st("PC-2", "ฟิกซ์เจอร์ผู้ใช้/หน่วย: frontdesk STAFF หน่วย hotel มี hotel.folio.post + hotel.reservation.checkOut + booking.manage · ไม่มี hotel.folio.void · maid มีเฉพาะ hotel.housekeeping · SQC_POS_EXTRA_UNITS มี hotel · บนฐาน (seed แล้ว): membership ตรง · หน่วย hotel svcqc ผูก AppSystemUnit type POS", async () => {
    const fd = SQC_USERS.find((u) => u.key === "frontdesk")!, md = SQC_USERS.find((u) => u.key === "maid")!;
    ok(["hotel.folio.post", "hotel.reservation.checkOut", "hotel.booking.manage", "hotel.reservation.checkIn"].every((p) => fd.permissions[p] === true) && !fd.permissions["hotel.folio.void"] && fd.role === "STAFF" && fd.unitAccess.includes(SQC_UNITS.hotel.id), `frontdesk ${J(fd)}`);
    eq([md.role, Object.keys(md.permissions)], ["STAFF", ["hotel.housekeeping"]], "maid");
    ok((SQC_POS_EXTRA_UNITS as readonly string[]).includes("hotel"), "SQC_POS_EXTRA_UNITS ไม่มี hotel");
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    if (!t) throw new AssertFail("ร้าน svcqc ยังไม่ seed บนฐาน l3 — ผู้คุมรัน seed ก่อน");
    const mb = await prisma.membership.findUnique({ where: { id: fd.membershipId }, select: { permissions: true } });
    ok(mb && (mb.permissions as Any)?.["hotel.folio.post"] === true && (mb.permissions as Any)?.["hotel.reservation.checkOut"] === true && !(mb.permissions as Any)?.["hotel.folio.void"], `membership frontdesk บนฐานยังไม่ตรง H.5 (reseed): ${J(mb)}`);
    const pos = await prisma.appSystemUnit.findFirst({ where: { tenantId: SQC_TENANT.id, unitId: SQC_UNITS.hotel.id, type: "POS" } });
    ok(pos, "หน่วย hotel svcqc ไม่ผูก POS บนฐาน (reseed)");
  }, "MAJOR");
  await st("PC-3", "ฐาน QC ต่อได้ (SELECT 1 · host = เลน l3 ep-royal-bar) · ตาราง H.0 (HotelFolio/HotelFolioItem/HousekeepingLog) + คอลัมน์ securityDeposit* บนฐาน · Prisma client มี hotelFolioItem", async () => {
    const r: { one: number }[] = await prisma.$queryRawUnsafe("SELECT 1::int AS one");
    eq(r[0]?.one, 1, "SELECT 1");
    ok(/^(ep-mute-scene|ep-royal-lake|ep-weathered-mode|ep-royal-bar)/.test(process.env.SVC_QC_HOST ?? ""), `host ${process.env.SVC_QC_HOST} ไม่ใช่ฐาน QC ของ SVC`); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · h5-PC3-anylane): ข้อสอบต้องรันได้ทุกเลน/ฐานหลัก (builder อาจอยู่เลนอื่น · regression/H.9)
    ok(H0_OK, H0_WHY);
  });
  await st("PC-4", "def ค่าตั้งที่ H.5 พึ่ง: rooms.hotel.tax.mode INCLUSIVE/EXCLUSIVE ค่าเริ่ม INCLUSIVE · tax.vatBp 700 · tax.serviceChargeBp 0 · tax.invoiceFromPos true · securityDeposit 100,000 · securityDeposit.enabled false · rooms.money.rounding SATANG · ทะเบียนสิทธิ์มี hotel.folio.post/void · hotel.reservation.checkOut · hotel.booking.manage ป้ายไทย", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k}`); return x; };
    eq(d("rooms.hotel.tax.mode").defaults._fallback, "INCLUSIVE", "tax.mode");
    ok(["INCLUSIVE", "EXCLUSIVE"].every((v) => d("rooms.hotel.tax.mode").schema.safeParse(v).success), "tax.mode enum");
    eq([d("rooms.hotel.tax.vatBp").defaults._fallback, d("rooms.hotel.tax.serviceChargeBp").defaults._fallback, d("rooms.hotel.tax.invoiceFromPos").defaults._fallback], [700, 0, true], "tax");
    eq([d("rooms.hotel.securityDeposit").defaults._fallback, d("rooms.hotel.securityDeposit.enabled").defaults._fallback, d("rooms.money.rounding").defaults._fallback], [100_000, false, "SATANG"], "ประกัน/ปัด");
    const src = read(F.perms);
    for (const k of ["hotel.folio.post", "hotel.folio.void", "hotel.reservation.checkOut", "hotel.booking.manage"]) ok(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[^"]*[฀-๿]`).test(src), `ไม่มีป้ายไทย ${k}`);
    ok(PERM, "โหลด permissions.ts ไม่ได้");
  });
  await st("PC-5", "ภาพ: SQC_VISUAL_SPECS[\"h.5\"] = unmatched เสมอ (+3 เมื่อ SVC_VIS_H5_RES_ID: folio ?tab=money · checkout ?tab=money&checkout=1 · print) · path ใต้ /hotel · visual-svc h.5 --list พิมพ์ครบ", () => {
    const specs = SQC_VISUAL_SPECS["h.5"] ?? [];
    ok(specs.some((s) => s.name === "hotel-folio-unmatched" && s.path.endsWith("/hotel/folio/unmatched")), "ไม่มี unmatched");
    ok(specs.every((s) => s.path.startsWith(`/app/u/${SQC_UNITS.hotel.slug}/hotel/`)), "path");
    const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.5", "--list"], { cwd: ROOT, env: { ...process.env, QC_BASE: "", SVC_VIS_H5_RES_ID: "RESID" }, encoding: "utf8" });
    const out = r.stdout ?? "";
    ok(r.status === 0 && out.includes("/hotel/folio/unmatched") && out.includes("reservations/RESID?tab=money") && out.includes("tab=money&checkout=1") && out.includes("RESID/folio/print"), `--list exit ${r.status}: ${out.slice(0, 200)}`);
  }, "MAJOR");
  await st("PC-6", "ของที่ H.5 ยืนบน โหลดได้จริง: pos/service มี createSale/voidSale/saleStatusByKey · pos/deposit มี moduleTakeDeposit/moduleRefundDeposit/moduleForfeitDeposit/moduleDepositForBill · account/index มี applyExternalSale + (gl) reverseFor/ensureAccounting · hotel facade มี taxLines/depositFor/quoteStay · system/service มี createSystem/linkUnit/systemForUnit · PosPayType มี ROOM_CHARGE/DEPOSIT · consumers มี pos.sale.paid/pos.sale.voided/hotel.checked_out", () => {
    ok(posL.mod, posL.err);
    eq(["createSale", "voidSale", "saleStatusByKey"].filter((n) => typeof posL.mod[n] !== "function"), [], "pos/service");
    ok(posDepL.mod, posDepL.err);
    eq(["moduleTakeDeposit", "moduleRefundDeposit", "moduleForfeitDeposit", "moduleDepositForBill"].filter((n) => typeof posDepL.mod[n] !== "function"), [], "pos/deposit");
    ok(accountL.mod, accountL.err);
    ok(typeof accountL.mod.applyExternalSale === "function", "account applyExternalSale");
    ok(glL.mod && typeof glL.mod.reverseFor === "function" && typeof glL.mod.ensureAccounting === "function", "gl");
    ok(hotelL.mod, hotelL.err);
    eq(["taxLines", "depositFor", "quoteStay"].filter((n) => typeof hotelL.mod[n] !== "function"), [], "hotel facade");
    ok(sysL.mod && ["createSystem", "linkUnit", "systemForUnit"].every((n) => typeof sysL.mod[n] === "function"), "system/service");
    const pos = read("prisma/schema/pos.prisma");
    ok(/enum PosPayType\s*\{[\s\S]*ROOM_CHARGE[\s\S]*\}/.test(pos) && /enum PosPayType\s*\{[\s\S]*DEPOSIT[\s\S]*\}/.test(pos), "PosPayType");
    const cons = consumersL.mod?.consumers;
    ok(cons && ["pos.sale.paid", "pos.sale.voided", "hotel.checked_out"].every((e) => typeof cons[e] === "function"), "consumers เดิม");
  });
  await st("PC-7", "oracle ของ oracle: refVat ตรง splitIncludedVat ของจริง (0/1/107,000/129,000/64,000/84,000 · bp 700 · bp 0) · refBalance เครื่องหมายตามสเปก · refNightPrice/dowOf ไม่ใช้ getDay (ศ./ส. = สุดสัปดาห์) · nightsOf · refScenePrice ตรง expect ของ h.1 (ดีลักซ์ override วันที่ 14 = 169,000 · ปีใหม่ 31 ธ.ค. = 199,000)", () => {
    ok(vatL.mod?.splitIncludedVat, "โหลด @/lib/money/vat ไม่ได้");
    for (const g of [0, 1, 107_000, 129_000, 64_000, 84_000, 298_000, 100_000]) {
      const real = vatL.mod.splitIncludedVat(g, 700);
      eq([refVat(g).base, refVat(g).vat], [real.baseSatang, real.vatSatang], `vat ${g}`);
      eq(refVat(g, 0), { base: g, vat: 0 }, `vat0 ${g}`);
    }
    eq(refVat(107_000).base, 100_000, "107,000 → 100,000");
    eq(refBalance([{ amountSatang: 129_000 }, { amountSatang: 64_000 }, { amountSatang: -129_000 }, { amountSatang: -10_000 }]), 54_000, "balance");
    eq([dowOf("2026-11-06"), dowOf("2026-11-07"), dowOf("2026-11-08")], [5, 6, 0], "dow");
    eq([refNightPrice({ weekday: 1, weekend: 2 }, "2026-11-06"), refNightPrice({ weekday: 1, weekend: 2 }, "2026-11-09")], [2, 1], "สุดสัปดาห์");
    eq(nightsOf("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01"], "nightsOf");
    eq([refScenePrice("ดีลักซ์", "2026-11-14"), refScenePrice("ดีลักซ์", "2026-12-31"), refScenePrice("ดีลักซ์", "2026-11-09"), refScenePrice("ดีลักซ์", "2026-11-07")], [169_000, 199_000, 129_000, 149_000], "scene price");
    ok(ITEM_TYPES.length === 14 && NEG_TYPES.size === 3 && ZERO_TYPES.size === 2, "ชนิด");
  });

  // ═══════════════ ร้านชั่วคราว (POS + บัญชี ของตัวเอง) ═══════════════
  console.log("\n── ตั้งร้านชั่วคราว svc-h5-* ──");
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("QC H5 ร้าน A");
  const tB = await mkTenant("QC H5 ร้าน B");
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรมทดสอบ H5");
  const UH2 = await mkUnit(tA, "HOTEL", "โรงแรมที่สอง H5");
  const UR = await mkUnit(tA, "RESTAURANT", "ห้องอาหาร H5");
  const UD = await mkUnit(tA, "DORM", "หอทดสอบ H5");
  const UHB = await mkUnit(tB, "HOTEL", "โรงแรมร้าน B H5");
  type TypeSpec = { name: string; base: number; cap: number };
  const mkType = async (tenantId: string, unitId: string, s: TypeSpec) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: s.name, rentMode: "NIGHTLY", baseRateSatang: s.base, capacity: s.cap, baseOccupancy: 2, maxOccupancy: s.cap } })).id as string;
  const mkRoom = async (tenantId: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const SPEC: Record<string, TypeSpec> = { dlx: { name: "ดีลักซ์", base: 129_000, cap: 3 }, sup: { name: "ซูพีเรีย", base: 99_000, cap: 2 } };
  const CELL: Record<string, Cell> = { dlx: { weekday: 129_000, weekend: 149_000 }, sup: { weekday: 99_000, weekend: 99_000 } };
  const RTA: Record<string, string> = {};
  for (const [k, s] of Object.entries(SPEC)) RTA[k] = await mkType(tA, UH, s);
  const ROOM: Record<string, string> = {};
  for (let i = 1; i <= 14; i++) { const n = `DLX${String(i).padStart(2, "0")}`; ROOM[n] = await mkRoom(tA, UH, n, RTA.dlx); }
  for (const n of ["SUP01", "SUP02"]) ROOM[n] = await mkRoom(tA, UH, n, RTA.sup);
  const RT_U2 = await mkType(tA, UH2, SPEC.dlx);
  const ROOM_U2 = await mkRoom(tA, UH2, "DLX01", RT_U2); // เลขห้องซ้ำ UH โดยตั้งใจ (AMBIGUOUS_ROOM)
  const RT_B = await mkType(tB, UHB, SPEC.dlx);
  const ROOM_B = await mkRoom(tB, UHB, "DLX01", RT_B);
  // POS ระบบเดียวของร้าน A ผูก UH + UH2 + UR (ลงห้องข้ามหน่วยในร้าน) · บัญชีผูก POS (จด VAT 7%) — แบบ qc-hotel-money
  const POS_A = (await sysL.mod.createSystem(tA, "POS", "POS ร้าน A H5")).id as string;
  for (const u of [UH, UH2, UR]) await sysL.mod.linkUnit(tA, POS_A, u);
  const ACC_A = (await sysL.mod.createSystem(tA, "ACCOUNT", "บัญชี A H5")).id as string;
  await accSvcL.mod.saveSettings(tA, ACC_A, { orgName: "โรงแรม H5 จำกัด", taxId: "0105561177639", vatRegistered: true, vatRateBp: 700 } as never);
  await glL.mod.ensureAccounting({ tenantId: tA, systemId: ACC_A });
  await prisma.accountSystemLink.create({ data: { tenantId: tA, systemId: ACC_A, linkedKind: "POS", linkedId: POS_A } });
  // ร้าน B: POS ไม่เชื่อมบัญชี (posted:false)
  const POS_B = (await sysL.mod.createSystem(tB, "POS", "POS ร้าน B H5")).id as string;
  await sysL.mod.linkUnit(tB, POS_B, UHB);
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `svc-h5-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${MAIL}${tag}-${RUN}@shark.local`, name: `QC h5 ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const MGR = await mkMember("mgr", tA, "MANAGER", [UH, UH2, UR]);
  const FD_PERMS = { "hotel.reservation.create": true, "hotel.reservation.cancel": true, "hotel.booking.manage": true, "hotel.reservation.checkIn": true, "hotel.rates.read": true, "hotel.folio.post": true, "hotel.reservation.checkOut": true }; // = ฟิกซ์เจอร์ frontdesk (ไม่มี folio.void)
  const FRONT = await mkMember("front", tA, "STAFF", [UH, UH2], FD_PERMS);
  const POSTER = await mkMember("poster", tA, "STAFF", [UH], { "hotel.folio.post": true });
  const VOIDER = await mkMember("voider", tA, "STAFF", [UH], { "hotel.folio.void": true });
  const CASHIER = await mkMember("cashier", tA, "STAFF", [UH], { "hotel.reservation.checkOut": true });
  const MAID = await mkMember("maid", tA, "STAFF", [UH], { "hotel.housekeeping": true });
  const NONE = await mkMember("none", tA, "STAFF", [UH], { "hotel.rates.read": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  const T0 = bkkToday();
  const W = (n: number) => addDays(T0, n);
  const ids: Record<string, string> = {};
  const rowsFor = (cells: Record<string, Cell>, rt: Record<string, string>) => Object.entries(cells).map(([k, c]) => ({ roomTypeId: rt[k], seasonId: null, priceWeekdaySatang: c.weekday, priceWeekendSatang: c.weekend, priceHolidaySatang: null }));
  let SETUP_OK = false;
  let SETUP_WHY = "";
  try {
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH }), "list");
    const std = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "STANDARD" } });
    ok(std, "ไม่มีแผน STANDARD");
    ids.std = std.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rows: rowsFor(CELL, RTA) }), "saveRates STANDARD");
    okRes(await RT("saveCancelRules")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.std, rules: [{ daysBefore: 3, refundBp: 10_000 }, { daysBefore: 0, refundBp: 0 }] }), "cancelRules");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "BIGDEP", name: "มัดจำก้อนใหญ่", depositKind: "FIXED_AMOUNT", depositValue: 300_000, visibility: ["COUNTER"] }), "BIGDEP");
    ids.bigdep = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "BIGDEP" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.bigdep, rows: rowsFor(CELL, RTA) }), "saveRates BIGDEP");
    okRes(await RT("saveRatePlan")(OWNER, ctxA, { unitId: UH, code: "FULLDEP", name: "จ่ายเต็มตอนจอง", depositKind: "FULL", depositValue: 0, visibility: ["COUNTER"] }), "FULLDEP");
    ids.fulldep = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH, code: "FULLDEP" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH, ratePlanId: ids.fulldep, rows: rowsFor(CELL, RTA) }), "saveRates FULLDEP");
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH2 }), "list U2");
    ids.stdU2 = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH2, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH2, ratePlanId: ids.stdU2, rows: [{ roomTypeId: RT_U2, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }] }), "saveRates U2");
    okRes(await RT("listRatePlans")(OWNER_B, ctxB, { unitId: UHB }), "list B");
    ids.stdB = (await prisma.hotelRatePlan.findFirst({ where: { tenantId: tB, unitId: UHB, code: "STANDARD" } }))!.id;
    okRes(await RT("saveRates")(OWNER_B, ctxB, { unitId: UHB, ratePlanId: ids.stdB, rows: [{ roomTypeId: RT_B, seasonId: null, priceWeekdaySatang: 129_000, priceWeekendSatang: 149_000, priceHolidaySatang: null }] }), "saveRates B");
    SETUP_OK = true;
  } catch (e) { SETUP_WHY = `ตั้งร้านชั่วคราวไม่สำเร็จ (H.1): ${errMsg(e)}`; console.log(`  ❌ ${SETUP_WHY}`); }
  const needSetup = () => ok(SETUP_OK, SETUP_WHY);
  const setUnit = async (key: string, value: unknown, unitId = UH, actor: Actor = OWNER, ctx: Record<string, unknown> = ctxA) => okRes(await SET.setSettings(actor, ctx, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string, unitId = UH) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: unitId }); } catch { /* ไม่มีค่า */ } };
  const GUEST = { name: "ผู้เข้าพักทดสอบ h5", phone: "0897654321", email: "svc-h5-guest@qc.invalid" };
  const PII_TEXT = /ผู้เข้าพักทดสอบ|0897654321|svc-h5-guest/;

  // ── ตัวช่วยอ่านฐาน ──
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const nightsOfRv = (id: string) => prisma.hotelBookingNight.findMany({ where: { reservationId: id }, orderBy: { date: "asc" } }) as Promise<Any[]>;
  const occOfRv = (id: string, active?: boolean) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, ...(active === undefined ? {} : { active }) } }) as Promise<Any[]>;
  const folioOf = (id: string) => prisma.hotelFolio.findUnique({ where: { reservationId: id } }) as Promise<Any>;
  const itemsOf = async (id: string, type?: string) => (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: id }, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })) as Any[];
  const liveItems = (items: Any[]) => items.filter((i) => !i.voidedAt);
  const eventsOf = async (type: string, pred?: (p: Any) => boolean, tid = tA) => ((await prisma.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: { createdAt: "asc" } })) as Any[]).filter((e) => !pred || pred(e.payload ?? {}));
  const auditsOf = (action: string, tid = tA) => prisma.auditLog.findMany({ where: { tenantId: tid, action }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const saleByKey = (key: string, tid = tA) => prisma.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId: tid, idempotencyKey: key } } }) as Promise<Any>;
  const saleOf = (id: string) => prisma.posSale.findUnique({ where: { id } }) as Promise<Any>;
  const payOf = (saleId: string) => prisma.posPayment.findMany({ where: { saleId }, orderBy: { amountSatang: "desc" } }) as Promise<Any[]>;
  const linesOf = (saleId: string) => prisma.posSaleLine.findMany({ where: { saleId } }) as Promise<Any[]>;
  const refundSalesOf = (receiptSaleId: string, tid = tA) => prisma.posSale.findMany({ where: { tenantId: tid, docType: "REFUND", refSaleId: receiptSaleId } }) as Promise<Any[]>;
  const forfeitSalesOf = async (receiptSaleId: string) => { const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId } }); return d ? ((await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: `dep-forfeit:${d.id}` }, status: "PAID" } })) as Any[]) : []; };
  const drain = async () => { const w = consumersL.mod; ok(w?.drainAll, "ไม่มี drainAll"); for (let i = 0; i < 3; i++) await w.drainAll(); };
  // GL (ตารางบัญชีของสมุด ACC_A · refType PosSale)
  type Line = { code: string; debit: number; credit: number; refId: string; entryId: string; reversalOfId: string | null };
  const glLines = async (refIds?: string[], systemId = ACC_A): Promise<Line[]> => {
    const es = (await prisma.accountJournalEntry.findMany({ where: { systemId, refType: "PosSale", ...(refIds ? { refId: { in: refIds } } : {}) }, include: { lines: { include: { account: { select: { code: true } } } } } })) as Any[];
    return es.flatMap((e) => e.lines.map((l: Any) => ({ code: l.account.code, debit: l.debit, credit: l.credit, refId: e.refId, entryId: e.id, reversalOfId: e.reversalOfId ?? null })));
  };
  const net = (ls: Line[], code: string) => sum(ls.filter((l) => l.code === code).map((l) => l.credit - l.debit)); // Cr − Dr
  const dr = (ls: Line[], code: string) => sum(ls.filter((l) => l.code === code).map((l) => l.debit));
  const balanced = (ls: Line[]) => sum(ls.map((l) => l.debit)) === sum(ls.map((l) => l.credit)) && ls.length > 0;
  const reversalsOf = (refId: string, systemId = ACC_A) => prisma.accountJournalEntry.count({ where: { systemId, refType: "PosSale", refId, reversalOfId: { not: null } } }) as Promise<number>;

  // ── ตัวช่วยเรียกใบ ──
  type Over = Record<string, unknown>;
  const book = (actor: Actor | null, over: Over, unitId = UH, ctx: Record<string, unknown> = ctxA) => BK("createBooking")(actor, ctx, { unitId, rooms: [{ roomTypeId: RTA.dlx, adults: 2, children: 0 }], ratePlanId: ids.std, source: "PHONE", guest: GUEST, checkIn: W(0), checkOut: W(2), ...over });
  const takeDeposit = (actor: Actor, over: Over) => BK("takeBookingDeposit")(actor, ctxA, { unitId: UH, payType: "PROMPTPAY", ...over });
  const checkInSvc = (tid: string, unitId: string, id: string, roomId: string) => fnOf(serviceL, "checkIn", F.service)(tid, unitId, id, roomId);
  /** จอง → มัดจำ (ถ้าขอ) → เช็กอิน (checkIn เดิม · ห้องที่ระบบถือ) ⇒ CHECKED_IN วันนี้ */
  const inhouse = async (over: Over & { deposit?: boolean; payType?: string; unitId?: string; roomTypeId?: string }) => {
    needSetup(); needBooking();
    const { deposit = true, payType = "PROMPTPAY", unitId = UH, roomTypeId, ...rest } = over;
    const r = okRes(await book(FRONT, { ...(roomTypeId ? { rooms: [{ roomTypeId, adults: 2, children: 0 }] } : {}), ...rest }, unitId), "createBooking");
    const x = r.reservations[0];
    if (deposit) okRes(await takeDeposit(FRONT, { unitId, reservationId: x.id, payType }), "takeBookingDeposit");
    const occ = (await occOfRv(x.id, true))[0];
    const rv0 = await rvOf(x.id);
    const roomId = rv0?.roomId ?? occ?.roomId;
    ok(roomId, "การจองไม่มีห้องให้เช็กอิน");
    okRes(await checkInSvc(tA, unitId, x.id, roomId), "checkIn");
    const rv = await rvOf(x.id);
    eq(rv.status, "CHECKED_IN", "สถานะหลังเช็กอิน");
    return { id: x.id as string, code: x.code as string, roomId: roomId as string, groupId: (r.groupId ?? null) as string | null, rv, reservations: r.reservations as Any[] };
  };
  const roomNo = async (roomId: string) => (await prisma.hotelRoom.findUnique({ where: { id: roomId } }))?.number as string;
  const getFolio = (actor: Actor, id: string, ctx: Record<string, unknown> = ctxA) => call(() => FO("getFolio")(actor, ctx, { reservationId: id }));
  const post = (actor: Actor, id: string, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => FO("postFolioItem")(actor, ctx, { reservationId: id, type: "SERVICE", description: "ซักรีด", qty: 1, unitAmountSatang: 18_000, ...over }));
  const voidItem = (actor: Actor, itemId: string, reason = "บันทึกซ้ำ", ctx: Record<string, unknown> = ctxA) => call(() => FO("voidFolioItem")(actor, ctx, { itemId, reason }));
  const prepare = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => CO("prepareCheckout")(actor, ctx, over));
  const settle = (actor: Actor, over: Over, ctx: Record<string, unknown> = ctxA) => call(() => CO("settleAndCheckOut")(actor, ctx, { shiftId: null, securityDeposit: "REFUND", ...over }));
  /** บิล POS บนหน่วยร้านอาหาร (ผู้เรียกโมดูล · ไม่มี shiftId) */
  const posSale = (over: Over, unitId = UR, systemId = POS_A, tid = tA) => posL.mod.createSale({ tenantId: tid, unitId, systemId, sourceModule: "POS", idempotencyKey: `svc-h5-sale-${uid()}`, lines: [{ name: "ต้มยำกุ้ง", qty: 1, unitPriceSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitPriceSatang: 32_000 }], payMethods: [{ type: "CASH", amountSatang: 64_000 }], ...over });
  const roomChargeSale = (reference: string, over: Over = {}) => posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference }], ...over });
  const chargeToRoom = (input: Over) => call(() => RC("chargeToRoom")(input));
  const unmatched = (actor: Actor, unitId = UH, ctx: Record<string, unknown> = ctxA) => call(() => RC("listUnmatchedRoomCharges")(actor, ctx, { unitId }));
  const attach = (actor: Actor, saleId: string, reservationId: string, ctx: Record<string, unknown> = ctxA) => call(() => RC("attachRoomCharge")(actor, ctx, { saleId, reservationId }));
  const unmatchedRows = (r: Any): Any[] => (Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : Array.isArray(r?.items) ? r.items : []);
  const expectedCharges = (items: Any[]) => sum(liveItems(items).filter((i) => !["PAYMENT", "DEPOSIT", "REFUND", "SECURITY_DEPOSIT", "SECURITY_REFUND", "TAX", "SERVICE_CHARGE"].includes(i.type)).map((i) => i.amountSatang));
  const depositOf = (items: Any[]) => -sum(liveItems(items).filter((i) => i.type === "DEPOSIT").map((i) => i.amountSatang));

  // ═══════════════ FO folio ═══════════════
  console.log("\n── FO folio (getFolio · postFolioItem · balance) ──");
  const MAIN = { id: "", code: "", roomId: "", dep: 0, nights: [] as { date: string; priceSatang: number }[] };
  await st("FO-1", "ตั้งต้น: จอง (createBooking PHONE ดีลักซ์ วันนี้ 2 คืน) → takeBookingDeposit PROMPTPAY → checkIn เดิม ⇒ CHECKED_IN · folio OPEN · มี item DEPOSIT 1 แถว amount = −มัดจำ (FIRST_NIGHT = ราคาคืนนี้) refType PosSale refId depositSaleId (H.3 โพสต์ผ่าน folio.postDeposit — ใบ §2.1) · balance cache = Σ = −มัดจำ · getFolio(frontdesk) ok", async () => {
    needFolio();
    const r = await inhouse({});
    MAIN.id = r.id; MAIN.code = r.code; MAIN.roomId = r.roomId;
    MAIN.nights = refStay(CELL.dlx, W(0), W(2));
    MAIN.dep = MAIN.nights[0].priceSatang;
    eq(r.rv.depositSatang, MAIN.dep, "มัดจำแถว");
    const f = await folioOf(r.id);
    eq(f?.status, "OPEN", "folio");
    const items = await itemsOf(r.id);
    eq(items.map((i) => [i.type, i.amountSatang, i.refType, i.refId]), [["DEPOSIT", -MAIN.dep, "PosSale", r.rv.depositSaleId]], "item DEPOSIT");
    eq(f.balanceSatang, refBalance(items), "cache = Σ");
    const g = await getFolio(FRONT, r.id);
    okRes(g, "getFolio");
    eq([g.folio?.status, g.folio?.balanceSatang, g.folio?.items?.length], ["OPEN", -MAIN.dep, 1], "DTO");
  });
  await st("FO-2", "postFolioItem 4 ชนิด (poster มี folio.post · DISCOUNT ใช้ manager): MINIBAR 120 · SERVICE ซักรีด 180 · PENALTY 50 qty 2 · DISCOUNT −100 ⇒ แถว HotelFolioItem: type/description/qty/unitAmount/amount = qty×unit · businessDate = วันนี้ไทย · postedById = ผู้โพสต์ · refType/refId null (manual) · voidedAt null · unitId/tenantId ตรง · ผลคืน {ok, itemId, balanceSatang} ตรง cache · balance cache = Σ ทุกครั้ง (ตรวจหลังทุก post)", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const specs: [Actor, Over][] = [
      [POSTER, { type: "MINIBAR", description: "มินิบาร์ · น้ำอัดลม 2", qty: 1, unitAmountSatang: 12_000 }],
      [POSTER, { type: "SERVICE", description: "ซักรีด", qty: 1, unitAmountSatang: 18_000 }],
      [POSTER, { type: "PENALTY", description: "ค่าปรับคืนกุญแจช้า", qty: 2, unitAmountSatang: 5_000 }],
      [MGR, { type: "DISCOUNT", description: "ส่วนลดแขกประจำ", qty: 1, unitAmountSatang: -10_000 }],
    ];
    for (const [a, s] of specs) {
      const r = okRes(await post(a, MAIN.id, s), `post ${s.type}`);
      ok(typeof r.itemId === "string" && r.itemId, "itemId");
      const row = await prisma.hotelFolioItem.findUnique({ where: { id: r.itemId } });
      ok(row, "ไม่มีแถว");
      eq([row.type, row.description, row.qty, row.unitAmountSatang, row.amountSatang, ymdOfDb(row.businessDate), row.postedById, row.refType ?? null, row.voidedAt ?? null, row.tenantId, row.unitId], [s.type, s.description, s.qty, s.unitAmountSatang, (s.qty as number) * (s.unitAmountSatang as number), T0, a.userId, null, null, tA, UH], `แถว ${s.type}`);
      const items = await itemsOf(MAIN.id);
      const f = await folioOf(MAIN.id);
      eq([f.balanceSatang, r.balanceSatang], [refBalance(items), refBalance(items)], `balance หลัง ${s.type}`);
    }
    const items = await itemsOf(MAIN.id);
    eq(refBalance(items), -MAIN.dep + 12_000 + 18_000 + 10_000 - 10_000, "Σ");
    ids.foMinibar = items.find((i) => i.type === "MINIBAR").id;
    ids.foService = items.find((i) => i.type === "SERVICE").id;
    ids.foDiscount = items.find((i) => i.type === "DISCOUNT").id;
  });
  await st("FO-3", "ด่านอินพุต (ไม่สร้างแถว · ไม่ throw): เพดาน manualItemMaxSatang (ค่าเริ่ม 5,000,000) ⇒ unitAmount 5,000,001 ปฏิเสธ · qty 0 / −1 / 1.5 ปฏิเสธ · description ว่าง ปฏิเสธ · unitAmount ไม่ใช่จำนวนเต็ม ปฏิเสธ · SERVICE/MINIBAR/PENALTY ค่าติดลบ ปฏิเสธ · DISCOUNT ค่าบวก ปฏิเสธ · type นอก 4 ชนิด (ROOM/POS_CHARGE/PAYMENT/DEPOSIT/TAX/VOID_REVERSAL/SECURITY_DEPOSIT) ปฏิเสธ · reservationId มั่ว ⇒ NOT_FOUND", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const n0 = (await itemsOf(MAIN.id)).length;
    const bad: string[] = [];
    const tryBad = async (label: string, over: Over, actor: Actor = MGR) => { const r = await post(actor, MAIN.id, over); if (!isFail(r) || failCode(r) === "THROW") bad.push(`${label}=${codeOf(r)}${failCode(r) === "THROW" ? ` ${r.reason}` : ""}`); };
    await tryBad("เพดาน", { unitAmountSatang: 5_000_001 });
    await tryBad("qty0", { qty: 0 }); await tryBad("qty-1", { qty: -1 }); await tryBad("qty1.5", { qty: 1.5 });
    await tryBad("descว่าง", { description: "  " });
    await tryBad("ทศนิยม", { unitAmountSatang: 100.5 });
    await tryBad("SERVICEติดลบ", { unitAmountSatang: -100 });
    await tryBad("DISCOUNTบวก", { type: "DISCOUNT", unitAmountSatang: 100 });
    for (const t of ["ROOM", "POS_CHARGE", "PAYMENT", "DEPOSIT", "TAX", "VOID_REVERSAL", "SECURITY_DEPOSIT", "REFUND", "SERVICE_CHARGE", "SECURITY_REFUND", "FOO"]) await tryBad(`type ${t}`, { type: t });
    eq(bad, [], "ไม่ปฏิเสธ");
    eq(failCode(await post(MGR, "ไม่มี-id", {})), "NOT_FOUND", "id มั่ว");
    eq((await itemsOf(MAIN.id)).length, n0, "สร้างแถว");
  });
  await st("FO-4", "DISCOUNT ต้องมี hotel.booking.manage (ใบ §2.1): poster (folio.post เท่านั้น) โพสต์ DISCOUNT ⇒ FORBIDDEN ไม่สร้างแถว · frontdesk (post+manage) ⇒ ok · MANAGER ⇒ ok · เพดานใช้กับ DISCOUNT ด้วย (|−5,000,001| ⇒ ปฏิเสธ)", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const n0 = (await itemsOf(MAIN.id)).length;
    const r = await post(POSTER, MAIN.id, { type: "DISCOUNT", description: "ลดเอง", unitAmountSatang: -1_000 });
    ok(isDenied(r), `poster ลดได้ ${codeOf(r)}`);
    eq((await itemsOf(MAIN.id)).length, n0, "สร้างแถว");
    const a = okRes(await post(FRONT, MAIN.id, { type: "DISCOUNT", description: "ส่วนลดพนักงานหน้าเคาน์เตอร์", unitAmountSatang: -1_000 }), "frontdesk");
    ids.foDiscount2 = a.itemId;
    ok(isFail(await post(MGR, MAIN.id, { type: "DISCOUNT", description: "ลดเกินเพดาน", unitAmountSatang: -5_000_001 })) , "เพดาน DISCOUNT");
    eq((await itemsOf(MAIN.id)).length, n0 + 1, "แถวเพิ่ม 1");
  });
  await st("FO-5", "getFolio DTO (ใบ §3.1): {ok, folio:{id,status,balanceSatang,items[],tax:{mode,lines,vatIncludedSatang},deposit:{paidSatang,saleId},security:{heldSatang,saleId,state},canPost,canVoid,canSettle}} · items เรียงเวลา มีคีย์ id/type/description/qty/unitAmountSatang/amountSatang/businessDate/voidedAt/reversalOfId · INCLUSIVE ⇒ tax.mode INCLUSIVE · tax.lines [] · vatIncludedSatang = taxLines(Σ charge, {INCLUSIVE,700,0}).vatIncludedSatang · deposit.paidSatang = มัดจำ · ไม่มี PII (ชื่อ/เบอร์/อีเมลแขก) · canVoid: frontdesk false · voider true · canSettle: frontdesk true · poster false", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const g = okRes(await getFolio(FRONT, MAIN.id), "getFolio").folio;
    for (const k of ["id", "status", "balanceSatang", "items", "tax", "deposit", "security", "canPost", "canVoid", "canSettle"]) ok(k in g, `DTO ไม่มี ${k}`);
    const items = await itemsOf(MAIN.id);
    eq(g.items.length, items.length, "จำนวน items");
    for (const k of ["id", "type", "description", "qty", "unitAmountSatang", "amountSatang", "businessDate"]) ok(k in g.items[0], `item DTO ไม่มี ${k}`);
    ok("voidedAt" in g.items[0] && "reversalOfId" in g.items[0], "item DTO ไม่มี voidedAt/reversalOfId");
    eq(g.items.map((i: Any) => i.id), items.map((i) => i.id), "ลำดับ");
    const charge = expectedCharges(items);
    const tl = fnOf(hotelL, "taxLines", F.index)(charge, { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, "SATANG");
    eq([g.tax.mode, g.tax.lines, g.tax.vatIncludedSatang], ["INCLUSIVE", [], tl.vatIncludedSatang], "tax");
    eq(g.tax.vatIncludedSatang, refVat(charge).vat, "vatIncluded = VAT ในราคา");
    eq([g.deposit.paidSatang, g.deposit.saleId], [MAIN.dep, (await rvOf(MAIN.id)).depositSaleId], "deposit");
    eq([g.security.heldSatang, g.security.saleId ?? null], [0, null], "security ว่าง");
    ok(!PII_TEXT.test(J(g)) && ![...walkKeys(g)].some((k) => PII_KEY.test(k)), "PII ใน DTO");
    eq([g.canPost, g.canVoid, g.canSettle], [true, false, true], "สิทธิ์ frontdesk");
    const v = okRes(await getFolio(VOIDER, MAIN.id), "voider").folio;
    const p = okRes(await getFolio(POSTER, MAIN.id), "poster").folio;
    eq([v.canVoid, p.canSettle, p.canPost], [true, false, true], "สิทธิ์ voider/poster");
  });
  await st("FO-6", "businessDate วันนี้ไทย (ไม่ใช่ UTC · มติ 10): item ทุกแถวที่ไม่ใช่ ROOM businessDate = bkkYmd(now) · โค้ด folio.ts/checkout.ts/room-charge.ts ไม่ใช้ getDay()/getDate() ดิบ · ใช้ bkkYmd/bkkParts หรือ todayBkk", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const items = (await itemsOf(MAIN.id)).filter((i) => i.type !== "ROOM");
    eq([...new Set(items.map((i) => ymdOfDb(i.businessDate)))], [T0], "businessDate");
    const src = [F.folio, F.checkout, F.roomCharge].map((f) => stripComments(read(f))).join("\n");
    ok(!/\.getDay\(\)|\.getDate\(\)|toISOString\(\)\.slice\(0,\s*10\)/.test(src), "ใช้วันดิบ (getDay/getDate/toISOString.slice)");
    ok(/bkkYmd|bkkParts|todayBkk|toYmd/.test(src), "ไม่ใช้ตัวช่วยวันไทย");
  });
  await st("FO-7", "EXCLUSIVE (ใบ §2.1 · บนหน่วย UH2): ตั้ง tax.mode EXCLUSIVE + serviceChargeBp 1000 · โพสต์ SERVICE 10,000 ⇒ folio มี TAX + SERVICE_CHARGE ตาม taxLines(Σ charge) · โพสต์เพิ่ม 10,000 ⇒ แถว TAX/SERVICE_CHARGE คำนวณใหม่ (ค่าเก่าไม่ซ้อน · live 1 แถวต่อชนิด) · getFolio.tax.lines = 2 แถวตรงฐาน · balance cache = Σ รวม TAX/SERVICE_CHARGE · INCLUSIVE (UH) ไม่มีแถว TAX/SERVICE_CHARGE", async () => {
    needFolio();
    await setUnit("rooms.hotel.tax.mode", "EXCLUSIVE", UH2);
    await setUnit("rooms.hotel.tax.serviceChargeBp", 1000, UH2);
    const r = await inhouse({ unitId: UH2, roomTypeId: RT_U2, ratePlanId: ids.stdU2, deposit: false, checkOut: W(1) });
    ids.u2 = r.id; ids.u2Room = r.roomId;
    const check = async (expectCharge: number) => {
      const items = await itemsOf(r.id);
      const live = liveItems(items);
      const tl = fnOf(hotelL, "taxLines", F.index)(expectCharge, { mode: "EXCLUSIVE", vatBp: 700, serviceChargeBp: 1000 }, "SATANG");
      const want = Object.fromEntries(tl.lines.map((l: Any) => [l.type, l.amountSatang]));
      const got = Object.fromEntries(live.filter((i) => i.type === "TAX" || i.type === "SERVICE_CHARGE").map((i) => [i.type, i.amountSatang]));
      eq(got, want, `TAX/SERVICE_CHARGE (charge ${expectCharge})`);
      eq(live.filter((i) => i.type === "TAX").length, 1, "TAX ซ้อน");
      eq((await folioOf(r.id)).balanceSatang, refBalance(live), "cache");
      return tl;
    };
    okRes(await post(MGR, r.id, { type: "SERVICE", description: "สปา", unitAmountSatang: 10_000 }), "post 1");
    await check(10_000);
    okRes(await post(MGR, r.id, { type: "SERVICE", description: "สปา 2", unitAmountSatang: 10_000 }), "post 2");
    const tl = await check(20_000);
    const g = okRes(await getFolio(MGR, r.id), "getFolio").folio;
    eq([g.tax.mode, g.tax.lines.length, sum(g.tax.lines.map((l: Any) => l.amountSatang))], ["EXCLUSIVE", 2, sum(tl.lines.map((l: Any) => l.amountSatang))], "DTO tax");
    eq((await itemsOf(MAIN.id)).filter((i) => i.type === "TAX" || i.type === "SERVICE_CHARGE").length, 0, "INCLUSIVE มีแถวภาษี");
  });

  // ═══════════════ VD void ═══════════════
  console.log("\n── VD void ──");
  await st("VD-1", "voidFolioItem (voider มี folio.void) บน SERVICE ซักรีด ⇒ {ok, reversalId, balanceSatang} · แถวใหม่ VOID_REVERSAL amount = −18,000 · reversalOfId = แถวเดิม · businessDate วันนี้ · description อ้างของเดิม · แถวเดิม voidedAt/voidReason ตั้ง (ไม่ลบ · amount เดิมคง) · balance cache = Σ (ลด 18,000) · AuditLog hotel.folio.voided before/after ไม่มี PII · outbox hotel.folio.voided", async () => {
    needFolio(); ok(ids.foService, "ไม่มี FO-2");
    const b0 = (await folioOf(MAIN.id)).balanceSatang;
    const r = okRes(await voidItem(VOIDER, ids.foService, "บันทึกซ้ำ"), "void");
    const rev = await prisma.hotelFolioItem.findUnique({ where: { id: r.reversalId } });
    ok(rev, "ไม่มีแถว reversal");
    eq([rev.type, rev.amountSatang, rev.reversalOfId, ymdOfDb(rev.businessDate), rev.voidedAt ?? null, rev.postedById], ["VOID_REVERSAL", -18_000, ids.foService, T0, null, VOIDER.userId], "reversal");
    const orig = await prisma.hotelFolioItem.findUnique({ where: { id: ids.foService } });
    ok(orig.voidedAt && orig.voidReason === "บันทึกซ้ำ" && orig.amountSatang === 18_000, `แถวเดิม ${J({ v: orig.voidedAt, r: orig.voidReason, a: orig.amountSatang })}`);
    const items = await itemsOf(MAIN.id);
    eq([(await folioOf(MAIN.id)).balanceSatang, r.balanceSatang], [refBalance(items), b0 - 18_000], "balance");
    const a = (await auditsOf("hotel.folio.voided")).filter((x) => x.targetId === ids.foService || x.targetId === MAIN.id || J(x.after).includes(ids.foService));
    ok(a.length >= 1 && !PII_TEXT.test(J(a)), `AuditLog ${a.length}`);
    eq((await eventsOf("hotel.folio.voided", (p) => p.reservationId === MAIN.id || p.itemId === ids.foService)).length, 1, "outbox");
  });
  await st("VD-2", "ชนิดห้าม void (ใบ §2.2): DEPOSIT · VOID_REVERSAL (ของ VD-1) · void ซ้ำแถวที่ void แล้ว ⇒ ok:false ไม่สร้างแถว ไม่ throw · เหตุผล < 3 ตัวอักษร (\"ซ\" · ว่าง) ⇒ INVALID_INPUT · itemId มั่ว ⇒ NOT_FOUND", async () => {
    needFolio(); ok(MAIN.id, "ไม่มี FO-1");
    const items = await itemsOf(MAIN.id);
    const n0 = items.length;
    const dep = items.find((i) => i.type === "DEPOSIT"), rev = items.find((i) => i.type === "VOID_REVERSAL");
    const bad: string[] = [];
    for (const [label, id] of [["DEPOSIT", dep?.id], ["VOID_REVERSAL", rev?.id], ["ซ้ำ", ids.foService]] as [string, string][]) { const r = await voidItem(MGR, id); if (!isFail(r) || failCode(r) === "THROW") bad.push(`${label}=${codeOf(r)}`); }
    eq(bad, [], "void ได้ทั้งที่ห้าม");
    eq(failCode(await voidItem(MGR, ids.foMinibar, "ซ")), "INVALID_INPUT", "เหตุผลสั้น");
    eq(failCode(await voidItem(MGR, ids.foMinibar, "")), "INVALID_INPUT", "เหตุผลว่าง");
    eq(failCode(await voidItem(MGR, "ไม่มี-item")), "NOT_FOUND", "itemId มั่ว");
    eq((await itemsOf(MAIN.id)).length, n0, "สร้างแถว");
  });
  await st("VD-3", "สิทธิ์ (ใบ §2.8 · S §12 \"Front desk void folio ไม่ได้\"): frontdesk (post+checkOut+manage ไม่มี folio.void) void MINIBAR ⇒ FORBIDDEN · poster/maid/none ⇒ FORBIDDEN · MANAGER ⇒ ok · แถว MINIBAR ถูก void จริง · DISCOUNT void ได้ (reversal +10,000)", async () => {
    needFolio(); ok(ids.foMinibar, "ไม่มี FO-2");
    const bad: string[] = [];
    for (const [n, a] of [["frontdesk", FRONT], ["poster", POSTER], ["maid", MAID], ["none", NONE]] as [string, Actor][]) { const r = await voidItem(a, ids.foMinibar, "ทดสอบสิทธิ์"); if (!isDenied(r)) bad.push(`${n}=${codeOf(r)}`); }
    eq(bad, [], "void ผ่านทั้งที่ไม่มีสิทธิ์");
    ok(!(await prisma.hotelFolioItem.findUnique({ where: { id: ids.foMinibar } })).voidedAt, "ถูก void ไปแล้ว");
    okRes(await voidItem(MGR, ids.foMinibar, "แขกไม่ได้ใช้"), "MANAGER");
    ok((await prisma.hotelFolioItem.findUnique({ where: { id: ids.foMinibar } })).voidedAt, "ไม่ถูก void");
    const r = okRes(await voidItem(MGR, ids.foDiscount2, "ให้ส่วนลดผิด"), "void DISCOUNT");
    eq((await prisma.hotelFolioItem.findUnique({ where: { id: r.reversalId } })).amountSatang, 1_000, "reversal ของส่วนลด = +1,000");
    eq((await folioOf(MAIN.id)).balanceSatang, refBalance(await itemsOf(MAIN.id)), "cache");
  });

  // ═══════════════ RN postRoomNights ═══════════════
  console.log("\n── RN postRoomNights ──");
  const RN = { id: "", roomId: "" };
  await st("RN-1", "postRoomNights(ctx,{reservationId, upToDate}) บนการจอง 3 คืน (วันนี้→+3 · CHECKED_IN): upToDate = +1 ⇒ {posted:1} · ROOM 1 แถว refType HotelBookingNight refId = night.id · amount = unitAmount = night.priceSatang (ราคาจากตารางคืน ไม่คิดใหม่) · qty 1 · businessDate = วันของคืน · night.folioItemId = แถว · postedAuditId null (ไม่ส่ง auditId) · balance cache = Σ", async () => {
    needFolio();
    const r = await inhouse({ checkOut: W(3), deposit: false });
    RN.id = r.id; RN.roomId = r.roomId;
    const nights = await nightsOfRv(r.id);
    eq(nights.length, 3, "nights");
    // ราคาคืนแก้มือบนตาราง (ให้ต่างจากราคาตั้ง) เพื่อยืนยันว่า ROOM อ่าน nights.priceSatang
    await prisma.hotelBookingNight.update({ where: { id: nights[1].id }, data: { priceSatang: 111_111, priceSource: "MANUAL" } });
    const p = okRes(await call(() => FO("postRoomNights")(ctxA, { reservationId: r.id, upToDate: W(1) })), "postRoomNights");
    eq(p.posted, 1, "posted");
    const rooms = await itemsOf(r.id, "ROOM");
    eq(rooms.map((i) => [i.refType, i.refId, i.amountSatang, i.unitAmountSatang, i.qty, ymdOfDb(i.businessDate)]), [["HotelBookingNight", nights[0].id, nights[0].priceSatang, nights[0].priceSatang, 1, W(0)]], "ROOM");
    const n0 = await prisma.hotelBookingNight.findUnique({ where: { id: nights[0].id } });
    eq([n0.folioItemId, n0.postedAuditId ?? null], [rooms[0].id, null], "night.folioItemId");
    eq((await folioOf(r.id)).balanceSatang, refBalance(await itemsOf(r.id)), "cache");
  });
  await st("RN-2", "idempotent/ข้ามคืนที่ post แล้ว (ใบ §3.3): เรียกซ้ำ upToDate +1 ⇒ posted 0 · upToDate +3 ⇒ posted 2 (คืน +1 ราคาแก้มือ 111,111 · คืน +2) · เรียกซ้ำ ⇒ 0 · ROOM รวม 3 แถว ราคาตรงตารางคืน · upToDate = +2 หลังจากนั้น ⇒ 0 (ไม่ถอน) · auditId ส่งมา ⇒ postedAuditId ตั้งบนคืนที่ post ในรอบนั้นเท่านั้น", async () => {
    needFolio(); ok(RN.id, "ไม่มี RN-1");
    eq((await call(() => FO("postRoomNights")(ctxA, { reservationId: RN.id, upToDate: W(1) })))?.posted, 0, "ซ้ำ");
    const p = okRes(await call(() => FO("postRoomNights")(ctxA, { reservationId: RN.id, upToDate: W(3), auditId: `audit-${RUN}` })), "post +3");
    eq(p.posted, 2, "posted 2");
    eq((await call(() => FO("postRoomNights")(ctxA, { reservationId: RN.id, upToDate: W(3) })))?.posted, 0, "ซ้ำ 2");
    eq((await call(() => FO("postRoomNights")(ctxA, { reservationId: RN.id, upToDate: W(2) })))?.posted, 0, "ย้อน");
    const nights = await nightsOfRv(RN.id);
    const rooms = await itemsOf(RN.id, "ROOM");
    eq(rooms.map((i) => [i.refId, i.amountSatang]), nights.map((n) => [n.id, n.priceSatang]), "ROOM 3 แถวตรงตารางคืน");
    eq(rooms.map((i) => i.amountSatang), [nights[0].priceSatang, 111_111, nights[2].priceSatang], "ราคาแก้มือ");
    eq(nights.map((n) => n.postedAuditId ?? null), [null, `audit-${RUN}`, `audit-${RUN}`], "postedAuditId");
    eq(nights.map((n) => n.folioItemId), rooms.map((i) => i.id), "folioItemId");
  });
  await st("RN-3", "ROOM ที่ audit แล้ว void ต้อง MANAGER (ใบ §2.2): voider (folio.void ไม่มี manage) void ROOM คืน +1 (postedAuditId ≠ null) ⇒ FORBIDDEN · void ROOM คืน 0 (ยังไม่ audit) ⇒ ok reversal −ราคา · MANAGER void ROOM คืน +1 ⇒ ok · night.folioItemId คงอ้างแถวเดิม (ประวัติ) · balance = Σ", async () => {
    needFolio(); ok(RN.id, "ไม่มี RN-1");
    const rooms = await itemsOf(RN.id, "ROOM");
    const r1 = await voidItem(VOIDER, rooms[1].id, "ลดราคาให้แขก");
    ok(isDenied(r1), `voider void ROOM audit แล้วได้ ${codeOf(r1)}`);
    const r0 = okRes(await voidItem(VOIDER, rooms[0].id, "ออกก่อนกำหนด"), "void ROOM ยังไม่ audit");
    eq((await prisma.hotelFolioItem.findUnique({ where: { id: r0.reversalId } })).amountSatang, -rooms[0].amountSatang, "reversal");
    okRes(await voidItem(MGR, rooms[1].id, "ผู้จัดการอนุมัติคืน"), "MANAGER void ROOM audit");
    eq((await nightsOfRv(RN.id))[1].folioItemId, rooms[1].id, "night ยังอ้างแถวเดิม");
    eq((await folioOf(RN.id)).balanceSatang, refBalance(await itemsOf(RN.id)), "cache");
  });
  await st("RN-4", "ด่าน: ctx ร้าน B ⇒ NOT_FOUND/posted 0 ไม่สร้างแถว · reservationId มั่ว ⇒ NOT_FOUND · upToDate ผิดรูป ⇒ ok:false/0 ไม่ throw · การจอง CONFIRMED (ยังไม่เช็กอิน · +30) ⇒ posted 0 (post เฉพาะ CHECKED_IN · S §7.7 ข้อ 3)", async () => {
    needFolio(); ok(RN.id, "ไม่มี RN-1");
    const n0 = (await itemsOf(RN.id, "ROOM")).length;
    const b = await call(() => FO("postRoomNights")(ctxB, { reservationId: RN.id, upToDate: W(3) }));
    ok(b?.ok === false || b?.posted === 0, `ร้าน B ${J(b)}`);
    eq((await itemsOf(RN.id, "ROOM")).length, n0, "ร้าน B สร้างแถว");
    const m = await call(() => FO("postRoomNights")(ctxA, { reservationId: "ไม่มี-id", upToDate: W(3) }));
    ok(m?.ok === false || m?.posted === 0, `id มั่ว ${J(m)}`);
    const w = await call(() => FO("postRoomNights")(ctxA, { reservationId: RN.id, upToDate: "ผิด" }));
    ok((w?.ok === false && w.code !== "THROW") || w?.posted === 0, `upToDate ผิด ${J(w)}`);
    const c = okRes(await book(FRONT, { checkIn: W(30), checkOut: W(32) }), "จองล่วงหน้า");
    ids.conf = c.reservations[0].id;
    eq((await call(() => FO("postRoomNights")(ctxA, { reservationId: ids.conf, upToDate: W(32) })))?.posted ?? -1, 0, "CONFIRMED post");
  });

  // ═══════════════ RC room charge ═══════════════
  console.log("\n── RC ลงห้องจาก POS (chargeToRoom · consumer pos.sale.paid) ──");
  const RCS: Record<string, string> = {};
  await st("RC-1", "บิลร้านอาหาร (หน่วย UR · POS เดียวกับโรงแรม) จ่าย ROOM_CHARGE 640 reference = เลขห้องของ MAIN → drain pos.sale.paid ⇒ FolioItem POS_CHARGE itemized 2 แถว (ต้มยำกุ้ง 320 · ข้าวผัดปู 320) refType PosSale refId = saleId · businessDate วันนี้ · amount = lineTotal · balance cache = Σ · บิลร้านยัง PAID (ไม่แตะ POS) · บัญชี: JV ของบิลร้าน Dr 1100 = 640 (ลูกหนี้) · outbox hotel.folio.posted", async () => {
    needRc(); ok(MAIN.id, "ไม่มี FO-1");
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: await roomNo(MAIN.roomId) }] });
    RCS.main = s.saleId;
    await drain();
    const pc = await itemsOf(MAIN.id, "POS_CHARGE");
    eq(pc.map((i) => [i.refType, i.refId, i.amountSatang, ymdOfDb(i.businessDate), i.voidedAt ?? null]), [["PosSale", s.saleId, 32_000, T0, null], ["PosSale", s.saleId, 32_000, T0, null]], "POS_CHARGE");
    ok(pc.some((i) => i.description.includes("ต้มยำกุ้ง")) && pc.some((i) => i.description.includes("ข้าวผัดปู")), `description ${J(pc.map((i) => i.description))}`);
    eq((await folioOf(MAIN.id)).balanceSatang, refBalance(await itemsOf(MAIN.id)), "cache");
    eq((await saleOf(s.saleId)).status, "PAID", "บิลร้าน");
    const ls = await glLines([s.saleId]);
    eq([dr(ls, "1100"), -net(ls, "4000") === 0 ? 0 : net(ls, "4000")], [64_000, refVat(64_000).base], "JV บิลร้าน (Dr 1100 · Cr 4000 ฐาน)");
    ok((await eventsOf("hotel.folio.posted", (p) => p.reservationId === MAIN.id)).length >= 1, "outbox posted");
  });
  await st("RC-2", "reference = รหัสจอง (code) ⇒ ผูกได้เช่นกัน · บิล 1 บรรทัด (กาแฟ 2×80) ⇒ POS_CHARGE 1 แถว qty 2 unitAmount 8,000 amount 16,000 · idempotent: drain ซ้ำ / เรียก consumer เดิมอีกรอบ ⇒ แถวไม่เพิ่ม (ต่อ saleId)", async () => {
    needRc(); ok(MAIN.id, "ไม่มี FO-1");
    const s = await posSale({ lines: [{ name: "กาแฟ", qty: 2, unitPriceSatang: 8_000 }], payMethods: [{ type: "ROOM_CHARGE", amountSatang: 16_000, reference: MAIN.code }] });
    RCS.byCode = s.saleId;
    await drain();
    const pc = (await itemsOf(MAIN.id, "POS_CHARGE")).filter((i) => i.refId === s.saleId);
    eq(pc.map((i) => [i.qty, i.unitAmountSatang, i.amountSatang]), [[2, 8_000, 16_000]], "POS_CHARGE");
    const n0 = (await itemsOf(MAIN.id, "POS_CHARGE")).length;
    await drain();
    const ev = (await eventsOf("pos.sale.paid", (p) => p.saleId === s.saleId))[0];
    ok(ev, "ไม่มี event pos.sale.paid ของบิล");
    await call(() => consumersL.mod.consumers["pos.sale.paid"](ev));
    await call(() => RC("onPosSalePaidRoomCharge")(ev));
    eq((await itemsOf(MAIN.id, "POS_CHARGE")).length, n0, "ซ้ำ");
  });
  await st("RC-3", "unmatched (ใบ §0): reference ผิด (B999) ⇒ ไม่มี POS_CHARGE · outbox hotel.folio.charge_unmatched {saleId, unitId, reason} ไม่มี PII · reference = รหัสจอง CONFIRMED (ยังไม่เช็กอิน) ⇒ unmatched reason NOT_CHECKED_IN · listUnmatchedRoomCharges(frontdesk · UH) มีทั้ง 2 บิล {saleId, receiptNo, amountSatang, reference, paidAt, reason} · บิลที่ผูกแล้ว (RC-1/2) ไม่อยู่ในคิว · consumer อื่นของ pos.sale.paid ยังทำงาน (JV บิลร้านลงบัญชี)", async () => {
    needRc(); ok(ids.conf, "ไม่มี RN-4");
    const s1 = await roomChargeSale("B999");
    const conf = await rvOf(ids.conf);
    const s2 = await roomChargeSale(conf.code);
    RCS.un1 = s1.saleId; RCS.un2 = s2.saleId;
    await drain();
    eq(await prisma.hotelFolioItem.count({ where: { tenantId: tA, refType: "PosSale", refId: { in: [s1.saleId, s2.saleId] } } }), 0, "โพสต์ทั้งที่ไม่ควร");
    const ev1 = await eventsOf("hotel.folio.charge_unmatched", (p) => p.saleId === s1.saleId);
    const ev2 = await eventsOf("hotel.folio.charge_unmatched", (p) => p.saleId === s2.saleId);
    eq([ev1.length, ev2.length], [1, 1], "event unmatched");
    ok(ev1[0].payload.reason && ev2[0].payload.reason && /NOT_CHECKED_IN/.test(String(ev2[0].payload.reason)), `reason ${J([ev1[0].payload.reason, ev2[0].payload.reason])}`);
    ok(!PII_TEXT.test(J([ev1[0].payload, ev2[0].payload])), "PII");
    const rows = unmatchedRows(await unmatched(FRONT));
    const ids2 = new Set(rows.map((r: Any) => r.saleId));
    ok(ids2.has(s1.saleId) && ids2.has(s2.saleId), `คิวขาด ${J([...ids2])}`);
    ok(!ids2.has(RCS.main) && !ids2.has(RCS.byCode), "บิลที่ผูกแล้วยังอยู่คิว");
    const row = rows.find((r: Any) => r.saleId === s1.saleId);
    for (const k of ["saleId", "receiptNo", "amountSatang", "reference", "paidAt", "reason"]) ok(k in row, `แถวคิวไม่มี ${k}`);
    eq([row.amountSatang, row.reference], [64_000, "B999"], "แถวคิว");
    ok(dr(await glLines([s1.saleId]), "1100") === 64_000, "JV บิลร้าน unmatched ไม่ลง (consumer อื่นล้ม?)");
  });
  await st("RC-4", "attachRoomCharge (frontdesk · folio.post): ผูกบิล B999 กับ MAIN ⇒ ok · POS_CHARGE 2 แถว refId = saleId · หายจากคิว · attach ซ้ำ ⇒ DUPLICATE (หรือ ok ไม่สร้างซ้ำ) แถวไม่เพิ่ม · attach บิลที่ไม่ใช่ ROOM_CHARGE (บิลเงินสด) ⇒ ปฏิเสธ · attach กับ CONFIRMED ⇒ NOT_CHECKED_IN · poster ที่ไม่มีสิทธิ์ (none) ⇒ FORBIDDEN · AuditLog", async () => {
    needRc(); ok(RCS.un1, "ไม่มี RC-3");
    okRes(await attach(FRONT, RCS.un1, MAIN.id), "attach");
    const pc = (await itemsOf(MAIN.id, "POS_CHARGE")).filter((i) => i.refId === RCS.un1);
    eq(pc.map((i) => i.amountSatang), [32_000, 32_000], "POS_CHARGE");
    ok(!unmatchedRows(await unmatched(FRONT)).some((r: Any) => r.saleId === RCS.un1), "ยังอยู่คิว");
    const again = await attach(FRONT, RCS.un1, MAIN.id);
    ok(again?.ok === true || failCode(again) === "DUPLICATE", `ซ้ำ ${codeOf(again)}`);
    eq((await itemsOf(MAIN.id, "POS_CHARGE")).filter((i) => i.refId === RCS.un1).length, 2, "ซ้ำสร้างแถว");
    const cash = await posSale({});
    ok(isFail(await attach(FRONT, cash.saleId, MAIN.id)) && failCode(await attach(FRONT, cash.saleId, MAIN.id)) !== "THROW", "บิลเงินสด attach ได้");
    eq(failCode(await attach(FRONT, RCS.un2, ids.conf)), "NOT_CHECKED_IN", "CONFIRMED");
    ok(isDenied(await attach(NONE, RCS.un2, MAIN.id)), "none attach ได้");
    ok((await auditsOf("hotel.folio.posted")).some((a) => J(a.after ?? a.before).includes(RCS.un1)) || (await auditsOf("hotel.folio.attached")).length >= 1, "AuditLog attach");
  });
  await st("RC-5", "chargeToRoom ตรง (facade S §8.3): {tenantId, hotelUnitId, folioRef:{reservationId}, lines[{name,qty,unitAmountSatang}], sourceSaleId=บิลเงินสด} ⇒ {ok, folioItemIds[2]} แถว POS_CHARGE refId = sourceSaleId · เรียกซ้ำ sourceSaleId เดิม ⇒ DUPLICATE ไม่สร้างแถว · folioRef {bookingCode} / {roomNumber} ⇒ ok ตัวเดียวกัน (ใช้บิลเงินสดใบใหม่) · lines ว่าง/ติดลบ ⇒ INVALID_INPUT · export จาก facade hotel/index.ts (hotel.chargeToRoom)", async () => {
    needRc(); ok(MAIN.id, "ไม่มี FO-1");
    const s = await posSale({});
    const lines = [{ name: "ต้มยำกุ้ง", qty: 1, unitAmountSatang: 32_000 }, { name: "ข้าวผัดปู", qty: 1, unitAmountSatang: 32_000 }];
    const r = okRes(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { reservationId: MAIN.id }, lines, sourceSaleId: s.saleId, byUserId: FRONT.userId }), "chargeToRoom");
    eq(r.folioItemIds?.length, 2, "folioItemIds");
    eq((await itemsOf(MAIN.id, "POS_CHARGE")).filter((i) => i.refId === s.saleId).map((i) => i.amountSatang), [32_000, 32_000], "แถว");
    eq(failCode(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { reservationId: MAIN.id }, lines, sourceSaleId: s.saleId })), "DUPLICATE", "ซ้ำ");
    eq((await itemsOf(MAIN.id, "POS_CHARGE")).filter((i) => i.refId === s.saleId).length, 2, "ซ้ำสร้างแถว");
    const s2 = await posSale({});
    okRes(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { bookingCode: MAIN.code }, lines: [lines[0]], sourceSaleId: s2.saleId }), "bookingCode");
    const s3 = await posSale({});
    okRes(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { roomNumber: await roomNo(MAIN.roomId) }, lines: [lines[0]], sourceSaleId: s3.saleId }), "roomNumber");
    const s4 = await posSale({});
    ok(isFail(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { reservationId: MAIN.id }, lines: [], sourceSaleId: s4.saleId }), "INVALID_INPUT"), "lines ว่าง");
    ok(isFail(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { reservationId: MAIN.id }, lines: [{ name: "x", qty: 1, unitAmountSatang: -5 }], sourceSaleId: s4.saleId }), "INVALID_INPUT"), "ติดลบ");
    ok(typeof hotelL.mod?.chargeToRoom === "function", "facade ไม่ export chargeToRoom");
    ids.rcDirect = s.saleId;
  });
  await st("RC-6", "ข้ามหน่วย/ร้าน (ใบ §2.9): chargeToRoom ข้ามหน่วยในร้านเดียว (hotelUnitId ไม่ส่ง · folioRef bookingCode ของ MAIN) ⇒ ok · เลขห้อง DLX01 มีแขก CHECKED_IN ทั้ง UH และ UH2 ⇒ ไม่ส่ง hotelUnitId = AMBIGUOUS_ROOM · ส่ง hotelUnitId UH ⇒ ok · ร้าน B (tenantId tB) อ้างห้อง/รหัสจองของร้าน A ⇒ ROOM_NOT_FOUND/NOT_FOUND ไม่มีแถว ไม่หลุด id · hotelUnitId = หน่วยหอ (DORM) ⇒ NOT_FOUND · บิล ROOM_CHARGE reference DLX01 ผ่าน consumer ⇒ unmatched reason AMBIGUOUS_ROOM", async () => {
    needRc(); ok(MAIN.id && ids.u2, "ไม่มี FO-1/FO-7");
    const line = [{ name: "น้ำดื่ม", qty: 1, unitAmountSatang: 2_000 }];
    const sA = await posSale({});
    okRes(await chargeToRoom({ tenantId: tA, folioRef: { bookingCode: MAIN.code }, lines: line, sourceSaleId: sA.saleId }), "ข้ามหน่วยในร้าน");
    // ห้อง DLX01 ของ UH ต้องมีแขกอยู่ (ถ้า MAIN ไม่ได้ DLX01 ให้เช็กอินใบใหม่ลง DLX01 — ย้ายผ่าน checkIn เดิม)
    if ((await roomNo(MAIN.roomId)) !== "DLX01") {
      const occ = await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, unitId: UH, roomId: ROOM.DLX01, active: true } });
      if (!occ) { const extra = okRes(await book(FRONT, { checkOut: W(1) }), "จองเสริม"); okRes(await checkInSvc(tA, UH, extra.reservations[0].id, ROOM.DLX01), "เช็กอิน DLX01"); ids.dlx01 = extra.reservations[0].id; }
    }
    ok(await prisma.roomOccupancy.findFirst({ where: { tenantId: tA, unitId: UH2, roomId: ROOM_U2, active: true } }), "UH2 DLX01 ไม่มีแขก (FO-7)");
    const sB1 = await posSale({});
    eq(failCode(await chargeToRoom({ tenantId: tA, folioRef: { roomNumber: "DLX01" }, lines: line, sourceSaleId: sB1.saleId })), "AMBIGUOUS_ROOM", "กำกวม");
    okRes(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { roomNumber: "DLX01" }, lines: line, sourceSaleId: sB1.saleId }), "ระบุหน่วย");
    const sX = await posSale({});
    const n0 = await prisma.hotelFolioItem.count({ where: { tenantId: tA } });
    const x1 = await chargeToRoom({ tenantId: tB, folioRef: { bookingCode: MAIN.code }, lines: line, sourceSaleId: sX.saleId });
    const x2 = await chargeToRoom({ tenantId: tB, folioRef: { roomNumber: await roomNo(MAIN.roomId) }, lines: line, sourceSaleId: sX.saleId });
    const x3 = await chargeToRoom({ tenantId: tA, hotelUnitId: UD, folioRef: { reservationId: MAIN.id }, lines: line, sourceSaleId: sX.saleId });
    for (const x of [x1, x2, x3]) ok(isFail(x) && ["ROOM_NOT_FOUND", "NOT_FOUND"].includes(failCode(x)!), `ข้ามร้าน/หน่วยผ่าน ${codeOf(x)}`);
    ok(!J([x1, x2, x3]).includes(MAIN.id), "หลุด id");
    eq(await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), n0, "ข้ามร้านสร้างแถว");
    const amb = await roomChargeSale("DLX01");
    await drain();
    const ev = await eventsOf("hotel.folio.charge_unmatched", (p) => p.saleId === amb.saleId);
    ok(ev.length === 1 && /AMBIGUOUS_ROOM/.test(String(ev[0].payload.reason)), `unmatched กำกวม ${J(ev.map((e) => e.payload))}`);
    RCS.amb = amb.saleId;
  });
  await st("RC-7", "pos.sale.voided ⇒ reversal อัตโนมัติ (ใบ §2.2): การจองใบใหม่ (CHECKED_IN) รับบิลร้าน ROOM_CHARGE 640 → POS_CHARGE 2 แถว → pos.voidSale บิลร้าน → drain ⇒ VOID_REVERSAL 2 แถว reversalOfId อ้างแถว POS_CHARGE amount −320 · แถวเดิม voidedAt ตั้ง · balance กลับเท่าก่อนบิล · drain ซ้ำไม่สร้างซ้ำ · บัญชี: JV บิลร้านถูกกลับ (1100 สุทธิ 0)", async () => {
    needRc();
    const r = await inhouse({ checkOut: W(1), deposit: false });
    ids.rcVoid = r.id;
    const b0 = (await folioOf(r.id)).balanceSatang;
    const s = await roomChargeSale(await roomNo(r.roomId));
    await drain();
    const pc = (await itemsOf(r.id, "POS_CHARGE")).filter((i) => i.refId === s.saleId);
    eq(pc.length, 2, "POS_CHARGE");
    await posL.mod.voidSale(tA, UR, s.saleId);
    await drain();
    const rev = (await itemsOf(r.id, "VOID_REVERSAL"));
    eq(rev.map((i) => [i.reversalOfId, i.amountSatang]).sort(), pc.map((i) => [i.id, -32_000]).sort(), "reversal");
    ok((await itemsOf(r.id, "POS_CHARGE")).filter((i) => i.refId === s.saleId).every((i) => i.voidedAt), "แถวเดิมไม่ถูกทำเครื่องหมาย void");
    eq((await folioOf(r.id)).balanceSatang, b0, "balance กลับ");
    await drain();
    eq((await itemsOf(r.id, "VOID_REVERSAL")).length, 2, "reversal ซ้อน");
    eq(net(await glLines([s.saleId]), "1100"), 0, "1100 ของบิลร้านที่ void สุทธิ");
  });
  await st("RC-8", "แต้ม (ใบ §0 · Q-H5-3): บิลร้านที่จ่าย ROOM_CHARGE ไม่ earn แต้ม (pointEarned 0 · ไม่มี memberId) · outbox-consumers.ts: บรรทัด \"pos.sale.paid\" ต่อ onPosSalePaidRoomCharge/room-charge ชั้นนอกสุด ห่อ try/catch (ล้มไม่ล้ม consumer อื่น) · เส้น consumer ลงห้อง = ตัวเดียวกับ facade chargeToRoom (room-charge.ts เรียก chargeToRoom)", async () => {
    needRc();
    const s = await roomChargeSale("B999");
    eq(s.pointEarned ?? 0, 0, "pointEarned");
    const src = stripComments(read(F.consumers));
    const line = src.split("\n").find((l) => /"pos\.sale\.paid"\s*:/.test(l)) ?? "";
    ok(/onPosSalePaidRoomCharge|roomCharge|room-charge/i.test(line) || /onPosSalePaidRoomCharge/.test(src), "pos.sale.paid ไม่ต่อชั้นลงห้อง");
    const idx = src.indexOf("onPosSalePaidRoomCharge");
    ok(idx >= 0 && /try\s*\{[\s\S]{0,400}onPosSalePaidRoomCharge/.test(src.slice(Math.max(0, idx - 400), idx + 60)) || /catch/.test(src.slice(idx, idx + 600)), "ไม่ห่อ try/catch");
    const rc = stripComments(read(F.roomCharge));
    ok(/export\s+async\s+function\s+onPosSalePaidRoomCharge/.test(rc) && /chargeToRoom\s*\(/.test(rc.slice(rc.indexOf("onPosSalePaidRoomCharge"))), "consumer ไม่เรียก chargeToRoom");
    RCS.un3 = s.saleId;
  });

  // ═══════════════ ST settle / เช็กเอาต์ ═══════════════
  console.log("\n── ST settleAndCheckOut (2 tx + POS นอก tx) ──");
  const mkShift = async (unitId: string, status: "OPEN" | "CLOSED", n: number) => (await prisma.posShift.create({ data: { tenantId: tA, unitId, systemId: POS_A, deviceId: `svc-h5-dev-${RUN}`, deviceLabel: "เคาน์เตอร์ QC", shiftNo: 9000 + n, status, openedByUserId: FRONT.userId, floatSatang: 100_000, ...(status === "CLOSED" ? { closedAt: new Date(), closedByUserId: FRONT.userId } : {}) } })).id as string;
  const STM = { grand: 0, payable: 0, saleId: "" };
  await st("ST-1", "prepareCheckout(frontdesk · MAIN): {ok, lines[], grandTotalSatang, depositSatang, payableSatang, security, openShifts[], taxOk, warnings} · grandTotal = Σ charge ที่ไม่ void (ROOM ยังไม่ post 2 คืน รวมเข้ามาแบบจะ post ตอน settle) · deposit = มัดจำ · payable = grand − deposit · taxOk true · openShifts [] (ยังไม่มีกะ) → เปิดกะ 1 ⇒ openShifts มี {id,label} · lines ไม่มียอดติดลบ (DISCOUNT แยกเป็นส่วนลด) · ไม่เปลี่ยนสถานะ/ไม่สร้างบิล", async () => {
    needCheckout(); ok(MAIN.id, "ไม่มี FO-1");
    const items = await itemsOf(MAIN.id);
    const roomsUnposted = (await nightsOfRv(MAIN.id)).filter((n) => !n.folioItemId).map((n) => n.priceSatang);
    STM.grand = expectedCharges(items) + sum(roomsUnposted);
    STM.payable = STM.grand - MAIN.dep;
    const p = okRes(await prepare(FRONT, { reservationId: MAIN.id }), "prepare");
    for (const k of ["lines", "grandTotalSatang", "depositSatang", "payableSatang", "security", "openShifts", "taxOk", "warnings"]) ok(k in p, `ไม่มี ${k}`);
    eq([p.grandTotalSatang, p.depositSatang, p.payableSatang, p.taxOk, p.openShifts], [STM.grand, MAIN.dep, STM.payable, true, []], "ยอด");
    ok(Array.isArray(p.lines) && p.lines.length >= 3 && p.lines.every((l: Any) => (l.unitPriceSatang ?? l.unitAmountSatang ?? l.amountSatang) >= 0 && (l.qty ?? 1) >= 1), `lines ${J(p.lines).slice(0, 200)}`);
    ids.shiftOpen = await mkShift(UH, "OPEN", 1);
    ids.shiftClosed = await mkShift(UH, "CLOSED", 2);
    const p2 = okRes(await prepare(FRONT, { reservationId: MAIN.id }), "prepare 2");
    eq(p2.openShifts.map((s: Any) => s.id), [ids.shiftOpen], "openShifts");
    ok(typeof p2.openShifts[0].label === "string", "label");
    eq([(await rvOf(MAIN.id)).status, await saleByKey(`hotel-sale-${MAIN.id}`)], ["CHECKED_IN", null], "prepare แก้ของ");
  });
  await st("ST-2", "TAX_CONFIG_MISMATCH (ใบ §0 ภาษี): ตั้ง rooms.hotel.tax.vatBp = 1000 บน UH (POS/สมุด = 700) ⇒ prepareCheckout.taxOk false + warnings ไทย · settle ⇒ ok:false TAX_CONFIG_MISMATCH reason ไทย · ไม่สร้างบิล ไม่เปลี่ยนสถานะ · คืนค่า 700 ⇒ taxOk true", async () => {
    needCheckout(); ok(MAIN.id, "ไม่มี FO-1");
    await setUnit("rooms.hotel.tax.vatBp", 1000);
    try {
      const p = okRes(await prepare(FRONT, { reservationId: MAIN.id }), "prepare");
      ok(p.taxOk === false && Array.isArray(p.warnings) && p.warnings.some((w: Any) => THAI.test(String(w?.message ?? w))), `taxOk ${p.taxOk} warnings ${J(p.warnings)}`);
      const r = await settle(FRONT, { reservationId: MAIN.id, payMethods: [{ type: "CASH", amountSatang: STM.payable }] });
      eq(failCode(r), "TAX_CONFIG_MISMATCH", `settle ${codeOf(r)}`);
      ok(THAI.test(String(r.reason ?? "")), "reason ไม่ไทย");
      eq([(await rvOf(MAIN.id)).status, await saleByKey(`hotel-sale-${MAIN.id}`), (await folioOf(MAIN.id)).status], ["CHECKED_IN", null, "OPEN"], "เปลี่ยนของ");
    } finally { await resetUnit("rooms.hotel.tax.vatBp"); }
    eq((await prepare(FRONT, { reservationId: MAIN.id }))?.taxOk, true, "คืนค่า");
  });
  await st("ST-3", "PAY_MISMATCH / ด่านอินพุต: Σ payMethods ≠ payable (ขาด 1 สตางค์ · เกิน) ⇒ PAY_MISMATCH · payMethods > 6 แถว ⇒ ปฏิเสธ · ชนิดต้องห้าม ROOM_CHARGE/ON_ACCOUNT/PLATFORM/GIFT_CARD/STORE_CREDIT ⇒ ปฏิเสธ (ใบ §2.7) · amount ติดลบ/ทศนิยม ⇒ ปฏิเสธ · securityDeposit นอก REFUND|FORFEIT ⇒ ปฏิเสธ · ไม่สร้างบิล · สถานะคง CHECKED_IN", async () => {
    needCheckout(); ok(MAIN.id, "ไม่มี FO-1");
    const bad: string[] = [];
    const tryBad = async (label: string, over: Over, codes: string[] = []) => { const r = await settle(FRONT, { reservationId: MAIN.id, ...over }); if (!isFail(r) || failCode(r) === "THROW" || (codes.length && !codes.includes(failCode(r)!))) bad.push(`${label}=${codeOf(r)}`); };
    await tryBad("ขาด1", { payMethods: [{ type: "CASH", amountSatang: STM.payable - 1 }] }, ["PAY_MISMATCH"]);
    await tryBad("เกิน", { payMethods: [{ type: "CASH", amountSatang: STM.payable + 100 }] }, ["PAY_MISMATCH"]);
    await tryBad("7แถว", { payMethods: Array.from({ length: 7 }, () => ({ type: "CASH", amountSatang: 1 })) });
    for (const t of ["ROOM_CHARGE", "ON_ACCOUNT", "PLATFORM", "GIFT_CARD", "STORE_CREDIT", "DEPOSIT"]) await tryBad(t, { payMethods: [{ type: t, amountSatang: STM.payable }] });
    await tryBad("ติดลบ", { payMethods: [{ type: "CASH", amountSatang: -STM.payable }] });
    await tryBad("ทศนิยม", { payMethods: [{ type: "CASH", amountSatang: STM.payable + 0.5 }] });
    await tryBad("security", { payMethods: [{ type: "CASH", amountSatang: STM.payable }], securityDeposit: "KEEP" });
    eq(bad, [], "ไม่ปฏิเสธ");
    eq([(await rvOf(MAIN.id)).status, await saleByKey(`hotel-sale-${MAIN.id}`)], ["CHECKED_IN", null], "เปลี่ยนของ");
  });
  await st("ST-4", "PAY_METHODS_REQUIRED (ใบ §1 · §2.11): checkOut เดิมของ P1 (service.ts · ไม่มี payMethods) บนการจองใบใหม่ ⇒ {ok:false, code|reason PAY_METHODS_REQUIRED} (allowLegacyCash ค่าเริ่ม false) · สถานะคง CHECKED_IN · ไม่มีบิล · settleAndCheckOut ไม่ส่ง payMethods ⇒ PAY_METHODS_REQUIRED เช่นกัน · เปิด rooms.hotel.checkout.allowLegacyCash ⇒ checkOut เดิมผ่าน: บิล hotel-sale-<id> จ่าย DEPOSIT{refSaleId} + CASH ส่วนที่เหลือ · PAYMENT โพสต์ · CHECKED_OUT (เส้น P1/oracle HT-1.2 หลัง ORACLE-EDIT)", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1) });
    ids.legacy = r.id;
    const co = fnOf(serviceL, "checkOut", F.service);
    const x = await call(() => co(tA, UH, r.id));
    ok(x?.ok === false && /PAY_METHODS_REQUIRED/.test(`${x.code ?? ""} ${x.reason ?? ""}`), `checkOut เดิม ${J(x)}`);
    eq([(await rvOf(r.id)).status, await saleByKey(`hotel-sale-${r.id}`)], ["CHECKED_IN", null], "P1 เปลี่ยนของ");
    const y = await settle(FRONT, { reservationId: r.id, payMethods: undefined });
    eq(failCode(y), "PAY_METHODS_REQUIRED", `settle ไม่ส่ง payMethods ${codeOf(y)}`);
    await setUnit("rooms.hotel.checkout.allowLegacyCash", true);
    try {
      okRes(await call(() => co(tA, UH, r.id)), "checkOut เดิมหลังเปิด");
      const s = await saleByKey(`hotel-sale-${r.id}`);
      ok(s?.status === "PAID", "ไม่มีบิล");
      const rv = await rvOf(r.id);
      const pays = await payOf(s.id);
      const dep = pays.find((p) => p.type === "DEPOSIT"), cash = pays.find((p) => p.type === "CASH");
      eq([dep?.refSaleId, dep?.amountSatang, cash?.amountSatang, sum(pays.map((p) => p.amountSatang))], [rv.depositSaleId, rv.depositSatang, s.grandTotalSatang - rv.depositSatang, s.grandTotalSatang], "วิธีจ่าย legacy");
      eq([rv.status, (await folioOf(r.id)).status, (await itemsOf(r.id, "PAYMENT")).length], ["CHECKED_OUT", "SETTLED", 1], "ปลาย");
    } finally { await resetUnit("rooms.hotel.checkout.allowLegacyCash"); }
  });
  await st("ST-5", "settle MAIN (frontdesk · CASH รับ 10,000 เกิน): {ok, saleId, receiptNo, changeSatang = 10,000, folios[{id,status SETTLED}]} · PosSale: sourceModule HOTEL · sourceId = reservationId · idempotencyKey hotel-sale-<id> · status PAID · grandTotal = Σ charge · unitId UH · systemId POS_A · shiftId null · memberId null · discountSatang ≥ Σ|DISCOUNT| · Σ lineTotal − discount = grandTotal · ไม่มีบรรทัดราคาติดลบ · บรรทัดค่าห้องสรุป (ชื่อมี \"ค่าห้อง\") · บรรทัดอาหาร/มินิบาร์ itemized · PosPayment: DEPOSIT{refSaleId = depositSaleId, amount = มัดจำ} + CASH payable (tenderedSatang · changeSatang) · ROOM 2 คืน post ครบ · PAYMENT item amount = −grandTotal refType PosSale refId saleId · balance 0", async () => {
    needCheckout(); ok(MAIN.id && STM.payable > 0, "ไม่มี ST-1");
    const r = okRes(await settle(FRONT, { reservationId: MAIN.id, payMethods: [{ type: "CASH", amountSatang: STM.payable, cashTenderedSatang: STM.payable + 10_000 }] }), "settle");
    STM.saleId = r.saleId;
    ok(typeof r.saleId === "string" && r.folios?.[0]?.status === "SETTLED" && r.changeSatang === 10_000, `ผลคืน ${J(r)}`);
    ok(typeof r.receiptNo === "string" && r.receiptNo, "receiptNo");
    const s = await saleByKey(`hotel-sale-${MAIN.id}`);
    ok(s && s.id === r.saleId, "บิลไม่ตรงคีย์");
    const rv = await rvOf(MAIN.id);
    eq([s.sourceModule, s.sourceId, s.status, s.grandTotalSatang, s.unitId, s.systemId, s.shiftId ?? null, s.memberId ?? null, s.docType], ["HOTEL", MAIN.id, "PAID", STM.grand, UH, POS_A, null, null, "SALE"], "PosSale");
    const items = await itemsOf(MAIN.id);
    const discount = -sum(liveItems(items).filter((i) => i.type === "DISCOUNT").map((i) => i.amountSatang));
    ok(s.discountSatang >= discount, `discountSatang ${s.discountSatang} < ${discount}`);
    const lines = await linesOf(s.id);
    eq(sum(lines.map((l) => l.lineTotalSatang)) - s.discountSatang, s.grandTotalSatang, "Σ lineTotal − discount");
    ok(lines.every((l) => l.unitPriceSatang >= 0 && l.qty >= 1 && l.lineTotalSatang >= 0), "บรรทัดติดลบ");
    ok(lines.some((l) => /ค่าห้อง/.test(l.name)), "ไม่มีบรรทัดค่าห้อง");
    ok(lines.some((l) => /ต้มยำกุ้ง/.test(l.name)) && lines.some((l) => /มินิบาร์|ซักรีด|ค่าปรับ/.test(l.name)), `บรรทัด itemized ${J(lines.map((l) => l.name))}`);
    const pays = await payOf(s.id);
    const dep = pays.find((p) => p.type === "DEPOSIT"), cash = pays.find((p) => p.type === "CASH");
    eq([pays.length, dep?.refSaleId, dep?.amountSatang, cash?.amountSatang, cash?.tenderedSatang, cash?.changeSatang], [2, rv.depositSaleId, MAIN.dep, STM.payable, STM.payable + 10_000, 10_000], "PosPayment");
    eq((await itemsOf(MAIN.id, "ROOM")).map((i) => i.amountSatang), MAIN.nights.map((n) => n.priceSatang), "ROOM post ครบ");
    const pay = await itemsOf(MAIN.id, "PAYMENT");
    eq(pay.map((i) => [i.amountSatang, i.refType, i.refId]), [[-STM.grand, "PosSale", s.id]], "PAYMENT");
    eq([(await folioOf(MAIN.id)).balanceSatang, refBalance(await itemsOf(MAIN.id))], [0, 0], "balance 0");
  });
  await st("ST-6", "สถานะหลัง settle (tx B): folio SETTLED settledSaleId = saleId settledAt · reservation CHECKED_OUT checkedOutAt · ห้อง hkStatus DIRTY (+ status CLEANING P1) · HotelHousekeepingLog แถวใหม่ toStatus DIRTY reservationId · occupancy ไม่ active (releaseStay ใน tx) · outbox hotel.checked_out payload มี saleId + reservationId ไม่มี PII · hotel.folio.settled {reservationId, groupId, folioId, saleId, amountSatang} · AuditLog · event ทั้งคู่ idempotencyKey ไม่ซ้ำ", async () => {
    needCheckout(); ok(STM.saleId, "ไม่มี ST-5");
    const f = await folioOf(MAIN.id);
    ok(f.status === "SETTLED" && f.settledSaleId === STM.saleId && f.settledAt, `folio ${J({ s: f.status, sid: f.settledSaleId, at: f.settledAt })}`);
    const rv = await rvOf(MAIN.id);
    ok(rv.status === "CHECKED_OUT" && rv.checkedOutAt, "reservation");
    const room = await prisma.hotelRoom.findUnique({ where: { id: MAIN.roomId } });
    eq(room.hkStatus, "DIRTY", "hkStatus");
    const hk = await prisma.hotelHousekeepingLog.findMany({ where: { roomId: MAIN.roomId, toStatus: "DIRTY" } });
    ok(hk.some((h: Any) => h.reservationId === MAIN.id), `HousekeepingLog ${hk.length}`);
    eq((await occOfRv(MAIN.id, true)).length, 0, "occupancy ยัง active");
    const co = await eventsOf("hotel.checked_out", (p) => p.reservationId === MAIN.id);
    eq([co.length, co[0]?.payload?.saleId], [1, STM.saleId], "hotel.checked_out");
    const se = await eventsOf("hotel.folio.settled", (p) => p.reservationId === MAIN.id);
    eq(se.length, 1, "hotel.folio.settled");
    eq([se[0].payload.saleId, se[0].payload.folioId, se[0].payload.amountSatang, "groupId" in se[0].payload], [STM.saleId, f.id, STM.grand, true], "payload settled");
    ok(!PII_TEXT.test(J([co[0].payload, se[0].payload])), "PII");
    ok((await auditsOf("hotel.folio.settled")).some((a) => a.targetId === MAIN.id || J(a.after).includes(STM.saleId)) || (await auditsOf("hotel.checked_out")).some((a) => a.targetId === MAIN.id), "AuditLog");
  });
  await st("ST-7", "FOLIO_CLOSED / NOT_CHECKED_IN (ใบ §2.3): หลัง settle MAIN: postFolioItem ⇒ FOLIO_CLOSED · voidFolioItem (MGR) ⇒ FOLIO_CLOSED · chargeToRoom ⇒ FOLIO_CLOSED · บิล ROOM_CHARGE reference เลขห้องเดิม (ไม่มีแขก) ⇒ unmatched · settle ซ้ำ ⇒ ok:false (NOT_CHECKED_IN) ไม่สร้างบิลใบ 2 · settle การจอง CONFIRMED (+30) ⇒ NOT_CHECKED_IN · prepareCheckout CONFIRMED ⇒ ok:false", async () => {
    needCheckout(); ok(STM.saleId && ids.conf, "ไม่มี ST-5/RN-4");
    eq(failCode(await post(MGR, MAIN.id, {})), "FOLIO_CLOSED", "post");
    const live = liveItems(await itemsOf(MAIN.id)).find((i) => i.type === "PENALTY");
    eq(failCode(await voidItem(MGR, live.id, "หลังปิดบิล")), "FOLIO_CLOSED", "void");
    const s = await posSale({});
    eq(failCode(await chargeToRoom({ tenantId: tA, hotelUnitId: UH, folioRef: { reservationId: MAIN.id }, lines: [{ name: "x", qty: 1, unitAmountSatang: 100 }], sourceSaleId: s.saleId })), "FOLIO_CLOSED", "chargeToRoom");
    const n0 = await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: "hotel-sale-" } } });
    const dup = await settle(FRONT, { reservationId: MAIN.id, payMethods: [{ type: "CASH", amountSatang: STM.payable }] });
    ok(dup?.ok === false && failCode(dup) !== "THROW", `settle ซ้ำ ${codeOf(dup)}`);
    eq(await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: "hotel-sale-" } } }), n0, "บิลใบ 2");
    eq(failCode(await settle(FRONT, { reservationId: ids.conf, payMethods: [] })), "NOT_CHECKED_IN", "CONFIRMED");
    ok(isFail(await prepare(FRONT, { reservationId: ids.conf })), "prepare CONFIRMED");
  });
  await st("ST-8", "แยกจ่าย + กะ (ใบ §2.4 §2.7): การจองใบใหม่ (มัดจำ CASH) · settle shiftId = กะเปิด · payMethods CASH + PROMPTPAY (2 แถว Σ = payable) ⇒ PosSale.shiftId = กะ · PosPayment 3 แถว (DEPOSIT + CASH + PROMPTPAY) ยอดตรง · กะปิด ⇒ SHIFT_CLOSED ไม่สร้างบิล · กะมั่ว ⇒ SHIFT_REQUIRED · กะของหน่วยอื่น (UH2) ⇒ SHIFT_REQUIRED", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1), payType: "CASH" });
    ids.split = r.id;
    const items = await itemsOf(r.id);
    const grand = expectedCharges(items) + sum((await nightsOfRv(r.id)).filter((n) => !n.folioItemId).map((n) => n.priceSatang));
    const payable = grand - r.rv.depositSatang;
    ok(payable > 1, "payable");
    const half = Math.floor(payable / 2);
    const bad: string[] = [];
    for (const [label, sid, code] of [["ปิด", ids.shiftClosed, "SHIFT_CLOSED"], ["มั่ว", `ไม่มี-${RUN}`, "SHIFT_REQUIRED"], ["หน่วยอื่น", await mkShift(UH2, "OPEN", 3), "SHIFT_REQUIRED"]] as [string, string, string][]) {
      const x = await settle(FRONT, { reservationId: r.id, shiftId: sid, payMethods: [{ type: "CASH", amountSatang: payable }] });
      if (failCode(x) !== code) bad.push(`${label}=${codeOf(x)}`);
    }
    eq(bad, [], "กะ");
    eq(await saleByKey(`hotel-sale-${r.id}`), null, "สร้างบิลทั้งที่กะผิด");
    okRes(await settle(FRONT, { reservationId: r.id, shiftId: ids.shiftOpen, payMethods: [{ type: "CASH", amountSatang: half }, { type: "PROMPTPAY", amountSatang: payable - half }] }), "settle แยกจ่าย");
    const s = await saleByKey(`hotel-sale-${r.id}`);
    eq([s?.status, s?.shiftId, s?.grandTotalSatang], ["PAID", ids.shiftOpen, grand], "PosSale");
    const pays = await payOf(s.id);
    eq(pays.map((p) => [p.type, p.amountSatang]).sort(), [["CASH", half], ["DEPOSIT", r.rv.depositSatang], ["PROMPTPAY", payable - half]].sort(), "PosPayment 3 แถว");
    eq((await rvOf(r.id)).status, "CHECKED_OUT", "ปลาย");
  });
  await st("ST-9", "มัดจำเกินยอด (ใบ §2.5): แผน BIGDEP มัดจำ FIXED 300,000 · 1 คืนดีลักซ์ (< 300,000) · ไม่มีรายการเพิ่ม ⇒ balance ติดลบก่อน settle · settle payMethods [] ⇒ ok · บิล grandTotal = ยอดค่าห้อง · PosPayment DEPOSIT = ยอด (เท่าบิล · ไม่มีเงินสด) · ส่วนเกินคืนผ่าน POS: ใบคืน REFUND อ้างใบรับมัดจำ ยอด = 300,000 − ยอด · PosDeposit ไม่ OPEN (ใช้+คืน = 300,000) · PAYMENT item = −ยอด · balance 0 · REFUND item (บวก) หรือ DEPOSIT ปรับ — Σ ทุกแถว = 0", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1), ratePlanId: ids.bigdep });
    ids.bigdepRv = r.id;
    eq(r.rv.depositSatang, 300_000, "มัดจำ");
    const total = refNightPrice(CELL.dlx, W(0));
    ok(total < 300_000, "ยอดต้องน้อยกว่ามัดจำ");
    ok((await folioOf(r.id)).balanceSatang < 0, "balance ก่อน settle ต้องติดลบ");
    okRes(await settle(FRONT, { reservationId: r.id, payMethods: [] }), "settle");
    const s = await saleByKey(`hotel-sale-${r.id}`);
    eq([s?.status, s?.grandTotalSatang], ["PAID", total], "บิล");
    eq((await payOf(s.id)).map((p) => [p.type, p.amountSatang, p.refSaleId]), [["DEPOSIT", total, r.rv.depositSaleId]], "DEPOSIT = ยอด");
    const refunds = await refundSalesOf(r.rv.depositSaleId);
    eq(refunds.map((x) => x.grandTotalSatang), [300_000 - total], "ใบคืนส่วนเกิน");
    const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: r.rv.depositSaleId } });
    eq([d.status !== "OPEN", d.usedSatang + d.refundedSatang], [true, 300_000], "PosDeposit");
    eq((await itemsOf(r.id, "PAYMENT")).map((i) => i.amountSatang), [-total], "PAYMENT");
    eq([(await folioOf(r.id)).balanceSatang, refBalance(await itemsOf(r.id)), (await rvOf(r.id)).status], [0, 0, "CHECKED_OUT"], "ปลาย");
  });
  await st("ST-10", "มัดจำพอดี (ใบ §2.5): แผน FULLDEP มัดจำ FULL · 1 คืน · payable 0 ⇒ settle payMethods [] ยัง createSale (ใบเสร็จต้องมี): บิล PAID grandTotal = ยอด · PosPayment DEPOSIT อย่างเดียว = grandTotal · receiptNo มี · PAYMENT item · CHECKED_OUT · changeSatang 0", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1), ratePlanId: ids.fulldep });
    const total = refNightPrice(CELL.dlx, W(0));
    eq(r.rv.depositSatang, total, "มัดจำ = ยอด");
    eq((await prepare(FRONT, { reservationId: r.id }))?.payableSatang, 0, "payable 0");
    const x = okRes(await settle(FRONT, { reservationId: r.id, payMethods: [] }), "settle");
    const s = await saleByKey(`hotel-sale-${r.id}`);
    eq([s?.status, s?.grandTotalSatang, typeof s?.receiptNo, x.changeSatang], ["PAID", total, "string", 0], "บิล");
    eq((await payOf(s.id)).map((p) => [p.type, p.amountSatang]), [["DEPOSIT", total]], "DEPOSIT อย่างเดียว");
    eq([(await itemsOf(r.id, "PAYMENT")).length, (await rvOf(r.id)).status, (await folioOf(r.id)).balanceSatang], [1, "CHECKED_OUT", 0], "ปลาย");
  });
  await st("ST-11", "กลุ่ม (ใบ §2.6): createBooking 3 ห้อง (groupId) · มัดจำหัวกลุ่ม (FIRST_NIGHT × 3) · เช็กอิน 2 ห้อง (ห้อง 3 คง CONFIRMED) · post SERVICE ห้องแรก 5,000 · settle({groupId}) payMethods CASH = Σ(2 ห้อง) − มัดจำ ⇒ บิล POS ใบเดียว key hotel-sale-<groupId> grandTotal = Σ 2 folio · PAYMENT แยกลงแต่ละ folio ตามยอดของตัวเอง (−ยอดห้องนั้น) · 2 folio SETTLED settledSaleId เดียวกัน · 2 reservation CHECKED_OUT · ห้องที่ 3 ไม่ถูกแตะ (CONFIRMED · folio OPEN) · มัดจำหัวกลุ่มใช้ทั้งกลุ่ม (PosPayment DEPOSIT = มัดจำทั้งก้อน) · folios[] 2 รายการ · hotel.folio.settled 2 แถว", async () => {
    needCheckout(); needBooking();
    const r = okRes(await book(FRONT, { rooms: [1, 2, 3].map(() => ({ roomTypeId: RTA.dlx, adults: 2, children: 0 })), checkOut: W(1) }), "จองกลุ่ม");
    const gid = r.groupId as string;
    ok(gid && r.reservations.length === 3, "กลุ่ม");
    const head = r.reservations[0];
    okRes(await takeDeposit(FRONT, { reservationId: head.id }), "มัดจำหัวกลุ่ม");
    const headRv = await rvOf(head.id);
    const depAll = headRv.depositSatang;
    eq(depAll, 3 * refNightPrice(CELL.dlx, W(0)), "มัดจำ ×3");
    const inIds: string[] = [];
    for (const x of r.reservations.slice(0, 2)) { const rv = await rvOf(x.id); const occ = (await occOfRv(x.id, true))[0]; okRes(await checkInSvc(tA, UH, x.id, rv.roomId ?? occ.roomId), "เช็กอินกลุ่ม"); inIds.push(x.id); }
    okRes(await post(POSTER, inIds[0], { description: "ซักรีดกลุ่ม", unitAmountSatang: 5_000 }), "post");
    const third = r.reservations[2].id;
    const perFolio = async (id: string) => expectedCharges(await itemsOf(id)) + sum((await nightsOfRv(id)).filter((n) => !n.folioItemId).map((n) => n.priceSatang));
    const totals = [await perFolio(inIds[0]), await perFolio(inIds[1])];
    const grand = sum(totals);
    const payable = grand - depAll;
    ok(payable > 0, `payable ${payable}`);
    const x = okRes(await settle(FRONT, { groupId: gid, payMethods: [{ type: "CASH", amountSatang: payable }] }), "settle กลุ่ม");
    eq(x.folios?.length, 2, "folios[]");
    const s = await saleByKey(`hotel-sale-${gid}`);
    eq([s?.status, s?.grandTotalSatang, s?.sourceModule], ["PAID", grand, "HOTEL"], "บิลใบเดียว");
    eq((await payOf(s.id)).map((p) => [p.type, p.amountSatang]).sort(), [["CASH", payable], ["DEPOSIT", depAll]].sort(), "วิธีจ่าย");
    for (const [i, id] of inIds.entries()) {
      const f = await folioOf(id);
      eq([f.status, f.settledSaleId, f.balanceSatang], ["SETTLED", s.id, 0], `folio ${i}`);
      eq((await itemsOf(id, "PAYMENT")).map((p) => p.amountSatang), [-totals[i]], `PAYMENT ${i}`);
      eq((await rvOf(id)).status, "CHECKED_OUT", `สถานะ ${i}`);
    }
    eq([(await rvOf(third)).status, (await folioOf(third)).status], ["CONFIRMED", "OPEN"], "ห้องที่ 3");
    eq(await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-sale-${gid}` } } }), 1, "บิลกลุ่มซ้อน");
    eq((await eventsOf("hotel.folio.settled", (p) => p.groupId === gid)).length, 2, "event settled");
    ids.group = gid;
  });
  await st("ST-12", "X3/X4 ซ้ำ/พร้อมกัน 10 ทาง (ใบ §2.4): การจองใบใหม่ · ยิง settleAndCheckOut 10 ครั้งพร้อมกัน (payMethods เดียวกัน) ⇒ ไม่มี throw ดิบ · สำเร็จ ≥ 1 (saleId เดียวกันทุกตัวที่ ok) · ที่เหลือ ok:false รหัสสถานะ · PosSale hotel-sale-<id> 1 ใบ · PAYMENT item 1 · outbox hotel.checked_out 1 · hotel.folio.settled 1 · HousekeepingLog DIRTY 1 · balance 0", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1) });
    const items = await itemsOf(r.id);
    const grand = expectedCharges(items) + sum((await nightsOfRv(r.id)).filter((n) => !n.folioItemId).map((n) => n.priceSatang));
    const payable = grand - r.rv.depositSatang;
    const rs = await Promise.all(Array.from({ length: 10 }, () => settle(FRONT, { reservationId: r.id, payMethods: [{ type: "CASH", amountSatang: payable }] })));
    eq(rs.filter((x) => failCode(x) === "THROW").map((x) => x.reason), [], "throw ดิบ");
    const oks = rs.filter((x) => x?.ok === true);
    ok(oks.length >= 1, `สำเร็จ ${oks.length}`);
    eq(new Set(oks.map((x) => x.saleId)).size, 1, "saleId ต่างกัน");
    eq(await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-sale-${r.id}` } } }), 1, "บิล");
    eq((await itemsOf(r.id, "PAYMENT")).length, 1, "PAYMENT");
    eq([(await eventsOf("hotel.checked_out", (p) => p.reservationId === r.id)).length, (await eventsOf("hotel.folio.settled", (p) => p.reservationId === r.id)).length], [1, 1], "event");
    eq(await prisma.hotelHousekeepingLog.count({ where: { roomId: r.roomId, reservationId: r.id, toStatus: "DIRTY" } }), 1, "HousekeepingLog");
    eq([(await folioOf(r.id)).balanceSatang, (await rvOf(r.id)).status], [0, "CHECKED_OUT"], "ปลาย");
  });
  await st("ST-13", "taxInvoice ส่งผ่าน (ใบ §0): settle ส่ง taxInvoice {kind:\"COMPANY\", name, taxId 0105561177639, branchCode \"00000\", address} ⇒ PosSale.taxInvoice บันทึก (name/taxId) · ไม่มีบรรทัด TAX/SERVICE_CHARGE ส่งเป็น line (INCLUSIVE · lines ไม่มีชื่อ \"ภาษี\"/\"VAT\") · PosSale.vatSatang = VAT ในราคา (POS คิด) = refVat(grandTotal).vat", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1) });
    const items = await itemsOf(r.id);
    const grand = expectedCharges(items) + sum((await nightsOfRv(r.id)).filter((n) => !n.folioItemId).map((n) => n.priceSatang));
    const payable = grand - r.rv.depositSatang;
    okRes(await settle(FRONT, { reservationId: r.id, payMethods: [{ type: "CASH", amountSatang: payable }], taxInvoice: { kind: "COMPANY", name: "บริษัท ทดสอบ H5 จำกัด", taxId: "0105561177639", branchCode: "00000", address: "123 ถนนทดสอบ กรุงเทพฯ 10110" } }), "settle");
    const s = await saleByKey(`hotel-sale-${r.id}`);
    const ti = J(s.taxInvoice ?? null);
    ok(ti.includes("0105561177639") && ti.includes("ทดสอบ H5"), `taxInvoice ${ti.slice(0, 120)}`);
    const lines = await linesOf(s.id);
    ok(!lines.some((l) => /ภาษี|VAT|ค่าบริการ/.test(l.name)), `บรรทัดภาษีหลุด ${J(lines.map((l) => l.name))}`);
    eq(s.vatSatang, refVat(grand).vat, "vatSatang POS");
    ids.taxInv = r.id;
  });
  await st("ST-14", "ไม่ผูก POS ⇒ POS_UNLINKED (ใบ §3.4): หน่วยโรงแรม UH3 ใหม่ในร้าน A ไม่มี AppSystemUnit POS · จอง (ไม่มัดจำ) → เช็กอิน → settle ⇒ ok:false POS_UNLINKED reason ไทย · สถานะคง CHECKED_IN · ไม่มีบิล", async () => {
    needCheckout(); needBooking();
    const UH3 = await mkUnit(tA, "HOTEL", "โรงแรมไม่ผูก POS H5");
    const rt = await mkType(tA, UH3, SPEC.dlx);
    await mkRoom(tA, UH3, "X01", rt);
    okRes(await RT("listRatePlans")(OWNER, ctxA, { unitId: UH3 }), "list UH3");
    const plan = await prisma.hotelRatePlan.findFirst({ where: { tenantId: tA, unitId: UH3, code: "STANDARD" } });
    okRes(await RT("saveRates")(OWNER, ctxA, { unitId: UH3, ratePlanId: plan.id, rows: [{ roomTypeId: rt, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 100_000, priceHolidaySatang: null }] }), "rates UH3");
    const r = okRes(await book(OWNER, { rooms: [{ roomTypeId: rt, adults: 2, children: 0 }], ratePlanId: plan.id, checkOut: W(1) }, UH3), "จอง UH3");
    const id = r.reservations[0].id;
    const occ = (await occOfRv(id, true))[0];
    okRes(await checkInSvc(tA, UH3, id, (await rvOf(id)).roomId ?? occ.roomId), "เช็กอิน UH3");
    const x = await settle(OWNER, { reservationId: id, payMethods: [{ type: "CASH", amountSatang: 100_000 }] });
    eq(failCode(x), "POS_UNLINKED", `settle ${codeOf(x)}`);
    ok(THAI.test(String(x.reason ?? "")), "reason ไทย");
    eq([(await rvOf(id)).status, await saleByKey(`hotel-sale-${id}`)], ["CHECKED_IN", null], "เปลี่ยนของ");
  });

  // ═══════════════ GL บัญชี (เข้ม) ═══════════════
  console.log("\n── GL บัญชี (สมุด ACC_A · ตรวจแถว AccountJournalEntry/Line) ──");
  await st("GL-1", "หลัง settle MAIN (ใบ §7): drain คิว ⇒ JV ของ 3 บิล (ใบรับมัดจำ · บิลร้าน ROOM_CHARGE ของ RC-1 · บิล settle) Σdr = Σcr ทั้งสมุด · บิล settle ลงบัญชีแล้ว (มี JV PosSale#<settle>) · บิล settle: Dr 1000 เงินสด = payable · Dr 2110 = มัดจำ − VAT ของมัดจำ · Cr 2200 = VAT(grand) − VAT(มัดจำ) · Cr 4000 = ฐาน(grand) (ค่าห้อง+อาหารรับรู้ครั้งเดียว ฐานหลังถอด VAT)", async () => {
    needCheckout(); ok(STM.saleId, "ไม่มี ST-5");
    await drain();
    const all = await glLines();
    ok(balanced(all), `Σdr ${sum(all.map((l) => l.debit))} ≠ Σcr ${sum(all.map((l) => l.credit))}`);
    const ls = await glLines([STM.saleId]);
    ok(ls.length >= 3, "ไม่มี JV บิล settle");
    const G = STM.grand, D = MAIN.dep;
    eq([dr(ls, "1000"), dr(ls, "2110"), net(ls, "2200"), net(ls, "4000") + net(ls, "4030")], [STM.payable, D - refVat(D).vat, refVat(G).vat - refVat(D).vat, refVat(G).base], "JV settle");
  });
  await st("GL-2", "กันรายได้ซ้ำ (ใบ §0 · Q-H5-1): บิลร้าน RC-1 (640 ลงห้อง · รวมในบิล settle แล้ว) ถูกกลับรายการ: มี entry reversalOfId ของ JV บิลร้าน · รวม 3 บิล + บิลร้านทั้ง 4 ใบที่ลงห้อง MAIN (RC-1/2/4/5 ตรง) ⇒ 1100 ลูกหนี้สุทธิ 0 · อาหาร 640 รับรู้ครั้งเดียว: Σ 4000+4030 (Cr−Dr) ของทุก refId ที่เกี่ยว MAIN = ฐาน(grand) พอดี · 2110 สุทธิ 0 (ลดเท่ามัดจำที่ใช้) · เงินสด 1000 Dr = payable · ธนาคาร 1010 Dr = มัดจำ (PROMPTPAY)", async () => {
    needCheckout(); ok(STM.saleId, "ไม่มี ST-5");
    const rv = await rvOf(MAIN.id);
    const posCharge = [...new Set(liveItems(await itemsOf(MAIN.id)).filter((i) => i.type === "POS_CHARGE").map((i) => i.refId as string))];
    const rcSales = (await prisma.posSale.findMany({ where: { id: { in: posCharge } }, select: { id: true, grandTotalSatang: true } })) as Any[];
    const rcRoomCharge = (await prisma.posPayment.findMany({ where: { saleId: { in: posCharge }, type: "ROOM_CHARGE" } })) as Any[];
    ok(rcRoomCharge.some((p) => p.saleId === RCS.main), "ไม่มีบิล ROOM_CHARGE ของ RC-1 บน folio");
    eq(await reversalsOf(RCS.main), 1, "reversal ของบิลร้าน RC-1");
    const refIds = [rv.depositSaleId, STM.saleId, ...posCharge];
    const ls = await glLines(refIds);
    ok(balanced(ls), "Σdr≠Σcr");
    eq(net(ls, "1100"), 0, "1100 สุทธิ");
    // บิลเงินสดที่ลงห้องตรง (RC-5 ตรง · ไม่ใช่ ROOM_CHARGE) รายได้ของมันคงอยู่ที่บิลร้าน (ไม่กลับ) — นับแยก
    const cashDirect = rcSales.filter((s) => !rcRoomCharge.some((p) => p.saleId === s.id));
    const expectedRevenue = refVat(STM.grand).base + sum(cashDirect.map((s) => refVat(s.grandTotalSatang).base));
    eq(net(ls, "4000") + net(ls, "4030"), expectedRevenue, "รายได้รวม (ครั้งเดียว)");
    eq(net(ls, "2110"), 0, "2110 สุทธิ");
    eq([dr(ls, "1000"), dr(ls, "1010")], [STM.payable + sum(cashDirect.map((s) => s.grandTotalSatang)), MAIN.dep], "เงินสด/ธนาคาร");
  });
  await st("GL-3", "reverseRoomChargePosting (account/index.ts · ใบ §1): เรียกตรง {tenantId, posSystemId: POS_A, saleId: RC-1, settleSaleId, reason} ซ้ำ ⇒ {posted:true} · entry reversal ยัง 1 (idempotent · ไม่กลับตัวกลับ) · เรียกกับบิลเงินสดที่ไม่มี JV ค้าง (RC-1 แล้ว) ซ้ำอีก ⇒ ไม่เพิ่ม · saleId มั่ว ⇒ {posted:false} ไม่ throw · ฟังก์ชันอยู่ท้ายไฟล์ในบล็อก // SVC H.5 ▸ … ◂ · ห่อ reverseFor(ctx,\"PosSale\",saleId,…)", async () => {
    ok(accountL.mod, accountL.err);
    const f = AC("reverseRoomChargePosting");
    const n0 = await reversalsOf(RCS.main);
    const r = await call(() => f({ tenantId: tA, posSystemId: POS_A, saleId: RCS.main, settleSaleId: STM.saleId, reason: "ทดสอบซ้ำ" }));
    ok(r && r.posted === true && failCode(r) !== "THROW", `ผล ${J(r)}`);
    eq(await reversalsOf(RCS.main), n0, "reversal เพิ่ม");
    eq(net(await glLines([RCS.main]), "1100"), 0, "1100");
    const m = await call(() => f({ tenantId: tA, posSystemId: POS_A, saleId: "ไม่มี-sale", settleSaleId: STM.saleId, reason: "x" }));
    ok(m && m.posted === false && failCode(m) !== "THROW", `saleId มั่ว ${J(m)}`);
    const src = read(F.account);
    const blk = /SVC H\.5 ▸([\s\S]*?)◂/.exec(src)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.5 ▸ … ◂ ใน account/index.ts");
    ok(/export\s+async\s+function\s+reverseRoomChargePosting/.test(blk) && /export\s+async\s+function\s+restoreRoomChargePosting/.test(blk), "2 ฟังก์ชันไม่อยู่ในบล็อก");
    ok(/reverseFor\s*\(/.test(blk), "ไม่ใช้ reverseFor");
    ok(src.indexOf("SVC H.5 ▸") > src.length * 0.8, "บล็อกไม่อยู่ท้ายไฟล์");
  });
  await st("GL-4", "ร้านไม่เชื่อมบัญชี (ร้าน B · POS_B ไม่มี AccountSystemLink): บิล ROOM_CHARGE บน UHB ลงห้องแขก B (CHECKED_IN) ⇒ POS_CHARGE โพสต์ปกติ · reverseRoomChargePosting({tenantId: tB, posSystemId: POS_B, …}) ⇒ {posted:false} ไม่ throw · settle แขก B ⇒ ok (ไม่มี JV ใด ๆ ของร้าน B · ไม่มี event hotel.folio.posting_warn)", async () => {
    needCheckout(); needRc(); needBooking();
    const r = okRes(await book(OWNER_B, { rooms: [{ roomTypeId: RT_B, adults: 2, children: 0 }], ratePlanId: ids.stdB, checkOut: W(1) }, UHB, ctxB), "จอง B");
    const id = r.reservations[0].id;
    okRes(await checkInSvc(tB, UHB, id, (await rvOf(id)).roomId ?? (await occOfRv(id, true))[0].roomId), "เช็กอิน B");
    ids.rvB = id;
    const s = await posSale({ payMethods: [{ type: "ROOM_CHARGE", amountSatang: 64_000, reference: r.reservations[0].code }] }, UHB, POS_B, tB);
    await drain();
    eq((await itemsOf(id, "POS_CHARGE")).length, 2, "POS_CHARGE ร้าน B");
    const x = await call(() => AC("reverseRoomChargePosting")({ tenantId: tB, posSystemId: POS_B, saleId: s.saleId, settleSaleId: "ยังไม่มี", reason: "x" }));
    ok(x && x.posted === false && failCode(x) !== "THROW", `posted:false ${J(x)}`);
    const grand = 64_000 + refNightPrice(CELL.dlx, W(0));
    okRes(await settle(OWNER_B, { reservationId: id, payMethods: [{ type: "CASH", amountSatang: grand }] }, ctxB), "settle B");
    eq(await prisma.accountJournalEntry.count({ where: { tenantId: tB } }), 0, "JV ร้าน B");
    eq((await eventsOf("hotel.folio.posting_warn", undefined, tB)).length, 0, "posting_warn");
    ids.saleB = (await saleByKey(`hotel-sale-${id}`, tB))?.id;
  });
  await st("GL-5", "refundStay หลัง settle (ใบ §1 service.ts): การจองใบใหม่ + บิลร้าน ROOM_CHARGE 640 → settle (CASH) → drain → refundStay(เดิม) ⇒ ok saleVoided · บิล settle VOIDED · reservation REFUNDED · folio VOID · GL: JV ของบิล settle สุทธิ 0 ทุกบัญชี · บิลร้าน: restoreRoomChargePosting คืนสภาพ ⇒ 1100 ของบิลร้าน = 640 (ลูกหนี้กลับมาค้าง) · รายได้อาหาร 4000 ของบิลร้าน = ฐาน(640) · Σdr=Σcr ทั้งสมุด · มัดจำคืนเต็ม (ใบคืน REFUND ของใบรับ) · refundStay ซ้ำ ⇒ ok:false ไม่กลับเบิ้ล", async () => {
    needCheckout(); needRc();
    const r = await inhouse({ checkOut: W(1) });
    const s = await roomChargeSale(await roomNo(r.roomId));
    await drain();
    eq((await itemsOf(r.id, "POS_CHARGE")).length, 2, "POS_CHARGE");
    const grand = 64_000 + refNightPrice(CELL.dlx, W(0));
    okRes(await settle(FRONT, { reservationId: r.id, payMethods: [{ type: "CASH", amountSatang: grand - r.rv.depositSatang }] }), "settle");
    await drain();
    const settleSale = await saleByKey(`hotel-sale-${r.id}`);
    eq(net(await glLines([s.saleId]), "1100"), 0, "ก่อน refund 1100 ของบิลร้านต้อง 0");
    const rf = await call(() => fnOf(serviceL, "refundStay", F.service)(tA, UH, r.id));
    ok(rf?.ok === true && rf.saleVoided === true, `refundStay ${J(rf)}`);
    await drain();
    eq([(await saleOf(settleSale.id)).status, (await rvOf(r.id)).status, (await folioOf(r.id)).status], ["VOIDED", "REFUNDED", "VOID"], "สถานะ");
    const lsSettle = await glLines([settleSale.id]);
    for (const code of [...new Set(lsSettle.map((l) => l.code))]) eq(net(lsSettle, code), 0, `บิล settle ${code} สุทธิ`);
    const lsFood = await glLines([s.saleId]);
    eq([net(lsFood, "1100"), net(lsFood, "4000") + net(lsFood, "4030")], [-64_000, refVat(64_000).base], "บิลร้านคืนสภาพ (Dr 1100 640 · Cr 4000)");
    ok(balanced(await glLines()), "Σdr≠Σcr");
    eq((await refundSalesOf(r.rv.depositSaleId)).map((x) => x.grandTotalSatang), [r.rv.depositSatang], "คืนมัดจำ");
    const n = await prisma.accountJournalEntry.count({ where: { systemId: ACC_A } });
    ok((await call(() => fnOf(serviceL, "refundStay", F.service)(tA, UH, r.id)))?.ok === false, "refund ซ้ำผ่าน");
    await drain();
    eq(await prisma.accountJournalEntry.count({ where: { systemId: ACC_A } }), n, "JV เบิ้ล");
    ids.refunded = r.id; RCS.refundFood = s.saleId;
  });
  await st("GL-6", "restoreRoomChargePosting idempotent: เรียกซ้ำ {tenantId, posSystemId, saleId: บิลร้าน GL-5} ⇒ posted true/false ไม่ throw · จำนวน entry ของบิลร้านไม่เพิ่ม · 1100 ยัง −640 (Dr) · reverse → restore → reverse อีกรอบ ⇒ สุทธิ 0 แล้วหยุด (ไม่กลับตัวกลับ) · entry ของบิลร้านไม่เกิน 4 (เดิม/กลับ/คืน/กลับ)", async () => {
    needCheckout(); ok(accountL.mod, accountL.err); ok(RCS.refundFood, "ไม่มี GL-5");
    const cnt = () => prisma.accountJournalEntry.count({ where: { systemId: ACC_A, refType: "PosSale", refId: RCS.refundFood } });
    const n0 = await cnt();
    const x = await call(() => AC("restoreRoomChargePosting")({ tenantId: tA, posSystemId: POS_A, saleId: RCS.refundFood, settleSaleId: null, reason: "ทดสอบซ้ำ" }));
    ok(x && typeof x.posted === "boolean" && failCode(x) !== "THROW", `restore ซ้ำ ${J(x)}`);
    eq(await cnt(), n0, "entry เพิ่ม");
    eq(net(await glLines([RCS.refundFood]), "1100"), -64_000, "1100");
    const y = await call(() => AC("reverseRoomChargePosting")({ tenantId: tA, posSystemId: POS_A, saleId: RCS.refundFood, settleSaleId: "x", reason: "กลับอีกรอบ" }));
    ok(y && failCode(y) !== "THROW", `reverse ${J(y)}`);
    eq(net(await glLines([RCS.refundFood]), "1100"), 0, "หลังกลับอีกรอบ");
    ok((await cnt()) <= 4, `entry ${await cnt()} > 4`);
    ok(balanced(await glLines()), "Σdr≠Σcr");
  });
  await st("GL-7", "บิล settle ทุกใบของร้าน A ลงบัญชีครบ (hotel-sale-* PAID ทุกใบมี JV PosSale#id#PAID · บิล VOIDED มี reversal) · ใบคืนมัดจำทุกใบมี JV · ไม่มี event pos.sale.paid ค้าง PENDING/FAILED ของร้าน A · Σdr=Σcr ทั้งสมุด", async () => {
    needCheckout();
    await drain();
    const sales = (await prisma.posSale.findMany({ where: { tenantId: tA, idempotencyKey: { startsWith: "hotel-sale-" } } })) as Any[];
    ok(sales.length >= 5, `บิล settle ${sales.length}`);
    const miss: string[] = [];
    for (const s of sales) {
      const ls = await glLines([s.id]);
      if (!ls.length) { miss.push(`${s.idempotencyKey} ไม่มี JV`); continue; }
      if (s.status === "VOIDED" && !ls.some((l) => l.reversalOfId)) miss.push(`${s.idempotencyKey} void แต่ไม่มี reversal`);
    }
    eq(miss, [], "บิลขาด JV");
    const refunds = (await prisma.posSale.findMany({ where: { tenantId: tA, docType: "REFUND" } })) as Any[];
    eq(refunds.length > 0 ? (await Promise.all(refunds.map(async (r) => (await glLines([r.id])).length > 0))).every(Boolean) : true, true, "ใบคืนไม่มี JV");
    eq(await prisma.outboxEvent.count({ where: { tenantId: tA, type: { in: ["pos.sale.paid", "pos.sale.voided"] }, status: { not: "DONE" } } }), 0, "คิวค้าง");
    ok(balanced(await glLines()), "Σdr≠Σcr");
  });

  // ═══════════════ SD เงินประกันห้อง ═══════════════
  console.log("\n── SD เงินประกันห้อง ──");
  const SD = { refund: "", forfeit: "", secSale: "" };
  await st("SD-1", "takeSecurityDeposit (ใบ §0 ประกัน · เปิด rooms.hotel.securityDeposit.enabled บน UH): OWNER รับ 100,000 CASH ⇒ {ok, saleId} · PosSale key hotel-secdep-<id> sourceModule POS_DEPOSIT PAID grandTotal 100,000 · PosPayment CASH · PosDeposit OPEN 100,000 · reservation securityDepositSatang/SaleId · FolioItem SECURITY_DEPOSIT amount 0 (ข้อมูล · unitAmount 0 · description/refId บอกยอด/บิล) · balance ไม่เปลี่ยน · getFolio.security {heldSatang 100,000, saleId, state HELD-ish} · outbox hotel.security_deposit.taken ไม่มี PII · รับซ้ำ ⇒ idempotent (ใบรับเดิม · ไม่สร้างแถวซ้ำ)", async () => {
    needCheckout();
    await setUnit("rooms.hotel.securityDeposit.enabled", true);
    const r = await inhouse({ checkOut: W(1) });
    SD.refund = r.id;
    const b0 = (await folioOf(r.id)).balanceSatang;
    const x = okRes(await call(() => CO("takeSecurityDeposit")(OWNER, ctxA, { reservationId: r.id, amountSatang: 100_000, payType: "CASH" })), "take");
    const s = await saleByKey(`hotel-secdep-${r.id}`);
    ok(s && s.id === x.saleId, `บิล ${J(s?.id)} ≠ ${x.saleId}`);
    eq([s.sourceModule, s.status, s.grandTotalSatang], ["POS_DEPOSIT", "PAID", 100_000], "PosSale");
    eq((await payOf(s.id)).map((p) => [p.type, p.amountSatang]), [["CASH", 100_000]], "PosPayment");
    const d = await prisma.posDeposit.findUnique({ where: { receiptSaleId: s.id } });
    eq([d?.status, d?.amountSatang], ["OPEN", 100_000], "PosDeposit");
    const rv = await rvOf(r.id);
    eq([rv.securityDepositSatang, rv.securityDepositSaleId], [100_000, s.id], "แถวการจอง");
    const it = await itemsOf(r.id, "SECURITY_DEPOSIT");
    eq(it.map((i) => [i.amountSatang, i.unitAmountSatang, i.refType, i.refId]), [[0, 0, "PosSale", s.id]], "SECURITY_DEPOSIT");
    eq((await folioOf(r.id)).balanceSatang, b0, "balance เปลี่ยน");
    const g = okRes(await getFolio(FRONT, r.id), "getFolio").folio;
    eq([g.security.heldSatang, g.security.saleId], [100_000, s.id], "DTO security");
    ok(typeof g.security.state === "string" && g.security.state, "state");
    const ev = await eventsOf("hotel.security_deposit.taken", (p) => p.reservationId === r.id);
    eq(ev.length, 1, "event"); ok(!PII_TEXT.test(J(ev[0].payload)), "PII");
    const again = await call(() => CO("takeSecurityDeposit")(OWNER, ctxA, { reservationId: r.id, amountSatang: 100_000, payType: "CASH" }));
    ok(again?.ok === true || isFail(again), `ซ้ำ ${codeOf(again)}`);
    eq([await prisma.posSale.count({ where: { tenantId: tA, idempotencyKey: { startsWith: `hotel-secdep-${r.id}` }, status: "PAID", docType: "SALE" } }), (await itemsOf(r.id, "SECURITY_DEPOSIT")).length], [1, 1], "ซ้อน");
    SD.secSale = s.id;
  });
  await st("SD-2", "คืนเต็มตอนเช็กเอาต์ (securityDeposit:\"REFUND\"): settle SD-1 (CASH) ⇒ ok · ใบคืน REFUND อ้างใบรับประกัน ยอด 100,000 (เงินสดเหมือนตอนรับ) · PosDeposit REFUNDED/ไม่ OPEN · FolioItem SECURITY_REFUND amount 0 refId = ใบคืน · บิล settle ไม่รวมประกัน (grandTotal = ค่าห้อง · ไม่มีแถวจ่าย DEPOSIT อ้างใบรับประกัน) · outbox hotel.security_deposit.refunded · getFolio.security.state เป็นคืนแล้ว · GL: ใบรับประกัน Cr 2110 ฐาน · ใบคืน Dr 2110 ⇒ 2110 สุทธิของ 2 ใบ = 0 · ไม่มีรายได้จากประกัน (4000 ของ 2 ใบ = 0)", async () => {
    needCheckout(); ok(SD.refund, "ไม่มี SD-1");
    const r = await rvOf(SD.refund);
    const grand = refNightPrice(CELL.dlx, W(0));
    okRes(await settle(FRONT, { reservationId: SD.refund, payMethods: [{ type: "CASH", amountSatang: grand - r.depositSatang }], securityDeposit: "REFUND" }), "settle");
    const rf = await refundSalesOf(SD.secSale);
    eq(rf.map((x) => [x.grandTotalSatang, x.status]), [[100_000, "PAID"]], "ใบคืนประกัน");
    eq((await payOf(rf[0].id)).map((p) => p.type), ["CASH"], "คืนเงินสด");
    ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: SD.secSale } })).status !== "OPEN", "PosDeposit ยัง OPEN");
    eq((await itemsOf(SD.refund, "SECURITY_REFUND")).map((i) => [i.amountSatang, i.refId]), [[0, rf[0].id]], "SECURITY_REFUND");
    const s = await saleByKey(`hotel-sale-${SD.refund}`);
    eq(s.grandTotalSatang, grand, "บิล settle รวมประกัน");
    ok(!(await payOf(s.id)).some((p) => p.refSaleId === SD.secSale), "ใช้ประกันจ่ายบิล");
    eq((await eventsOf("hotel.security_deposit.refunded", (p) => p.reservationId === SD.refund)).length, 1, "event");
    await drain();
    const ls = await glLines([SD.secSale, rf[0].id]);
    eq([net(ls, "2110"), net(ls, "4000") + net(ls, "4030"), balanced(ls)], [0, 0, true], "GL ประกัน");
  });
  await st("SD-3", "ริบเต็ม (securityDeposit:\"FORFEIT\" + forfeitReason · ใบ §0): การจองใบใหม่ + ประกัน 100,000 CASH · cashier (มีแค่ hotel.reservation.checkOut · ไม่มี booking.manage) ริบ ⇒ FORBIDDEN ไม่เปลี่ยนอะไร · forfeitReason ว่าง ⇒ INVALID_INPUT · MANAGER ริบ ⇒ ok · บิลริบ (dep-forfeit:<depositId> PAID 100,000) · PosDeposit ไม่ OPEN · FolioItem PENALTY อ้างบิลริบ (เหตุผลใน description) · outbox hotel.security_deposit.forfeited · เงินที่แขกจ่ายจริงรวม = ค่าห้อง + ประกันที่ริบ (ไม่เก็บซ้ำ): Σ จ่ายจริงบิล settle + มัดจำที่ใช้ + ประกันริบ = ค่าห้อง + 100,000 · GL: รายได้ 4000 ของ (บิล settle + ใบรับประกัน + บิลริบ) = ฐาน(ค่าห้อง) + ฐาน(100,000) · 2110 สุทธิ 0", async () => {
    needCheckout();
    const r = await inhouse({ checkOut: W(1) });
    SD.forfeit = r.id;
    const take = okRes(await call(() => CO("takeSecurityDeposit")(OWNER, ctxA, { reservationId: r.id, amountSatang: 100_000, payType: "CASH" })), "take");
    const grand = refNightPrice(CELL.dlx, W(0));
    const pay = [{ type: "CASH", amountSatang: grand - r.rv.depositSatang }];
    const f1 = await settle(CASHIER, { reservationId: r.id, payMethods: pay, securityDeposit: "FORFEIT", forfeitReason: "ผ้าเช็ดตัวหาย 2 ผืน" });
    ok(isDenied(f1), `cashier ริบได้ ${codeOf(f1)}`);
    eq([(await rvOf(r.id)).status, await saleByKey(`hotel-sale-${r.id}`)], ["CHECKED_IN", null], "cashier เปลี่ยนของ");
    eq(failCode(await settle(MGR, { reservationId: r.id, payMethods: pay, securityDeposit: "FORFEIT", forfeitReason: "" })), "INVALID_INPUT", "เหตุผลว่าง");
    okRes(await settle(MGR, { reservationId: r.id, payMethods: pay, securityDeposit: "FORFEIT", forfeitReason: "ผ้าเช็ดตัวหาย 2 ผืน" }), "ริบ");
    const ff = await forfeitSalesOf(take.saleId);
    eq(ff.map((x) => x.grandTotalSatang), [100_000], "บิลริบ");
    ok((await prisma.posDeposit.findUnique({ where: { receiptSaleId: take.saleId } })).status !== "OPEN", "PosDeposit ยัง OPEN");
    const pen = await itemsOf(r.id, "PENALTY");
    ok(pen.length >= 1 && pen.some((i) => i.refId === ff[0].id || /ผ้าเช็ดตัว/.test(i.description)), `PENALTY ${J(pen.map((i) => [i.amountSatang, i.refId, i.description]))}`);
    eq((await eventsOf("hotel.security_deposit.forfeited", (p) => p.reservationId === r.id)).length, 1, "event");
    const s = await saleByKey(`hotel-sale-${r.id}`);
    const pays = await payOf(s.id);
    const realPaid = sum(pays.filter((p) => p.type !== "DEPOSIT").map((p) => p.amountSatang));
    const depUsed = sum(pays.filter((p) => p.type === "DEPOSIT").map((p) => p.amountSatang));
    eq(realPaid + depUsed + 100_000, grand + 100_000, "แขกจ่ายรวม (ไม่เก็บซ้ำ)");
    await drain();
    const ls = await glLines([s.id, take.saleId, ff[0].id, r.rv.depositSaleId]);
    eq([net(ls, "4000") + net(ls, "4030"), net(ls, "2110"), balanced(ls)], [refVat(s.grandTotalSatang).base + refVat(100_000).base, 0, true], "GL ริบ");
    eq((await rvOf(r.id)).status, "CHECKED_OUT", "ปลาย");
  });
  await st("SD-4", "refundSecurityDeposit/forfeitSecurityDeposit แยก (ใบ §3.5): การจองใบใหม่ + ประกัน · refundSecurityDeposit(MGR) ⇒ {ok, saleId = ใบคืน} ใบคืน 100,000 · SECURITY_REFUND item · ซ้ำ ⇒ ok idempotent/ok:false ไม่มีใบคืนใบ 2 · forfeitSecurityDeposit หลังคืนแล้ว ⇒ ok:false · การจองใบใหม่ 2 + ประกัน: forfeitSecurityDeposit(FRONT ที่มี manage · reason) ⇒ ok บิลริบ · reason สั้น ⇒ INVALID_INPUT · ไม่มีประกัน ⇒ ok:false (NOT_FOUND/NO_SECURITY) · settle หลังจากนั้นด้วย REFUND ⇒ ok ไม่คืนซ้ำ", async () => {
    needCheckout();
    const a = await inhouse({ checkOut: W(1) });
    const ta = okRes(await call(() => CO("takeSecurityDeposit")(OWNER, ctxA, { reservationId: a.id, amountSatang: 100_000, payType: "CASH" })), "take a");
    const rf = okRes(await call(() => CO("refundSecurityDeposit")(MGR, ctxA, { reservationId: a.id })), "refund");
    const refunds = await refundSalesOf(ta.saleId);
    eq([refunds.length, refunds[0]?.grandTotalSatang, rf.saleId === refunds[0]?.id], [1, 100_000, true], "ใบคืน");
    eq((await itemsOf(a.id, "SECURITY_REFUND")).length, 1, "SECURITY_REFUND");
    const again = await call(() => CO("refundSecurityDeposit")(MGR, ctxA, { reservationId: a.id }));
    ok(again?.ok === true || isFail(again), `ซ้ำ ${codeOf(again)}`);
    eq((await refundSalesOf(ta.saleId)).length, 1, "ใบคืนใบ 2");
    ok(isFail(await call(() => CO("forfeitSecurityDeposit")(MGR, ctxA, { reservationId: a.id, reason: "คืนไปแล้วริบไม่ได้" }))), "ริบหลังคืน");
    const b = await inhouse({ checkOut: W(1) });
    const tb = okRes(await call(() => CO("takeSecurityDeposit")(OWNER, ctxA, { reservationId: b.id, amountSatang: 100_000, payType: "CASH" })), "take b");
    eq(failCode(await call(() => CO("forfeitSecurityDeposit")(FRONT, ctxA, { reservationId: b.id, reason: "ซ" }))), "INVALID_INPUT", "reason สั้น");
    okRes(await call(() => CO("forfeitSecurityDeposit")(FRONT, ctxA, { reservationId: b.id, reason: "ทำเฟอร์นิเจอร์เสียหาย" })), "forfeit");
    eq((await forfeitSalesOf(tb.saleId)).length, 1, "บิลริบ");
    ok(isFail(await call(() => CO("forfeitSecurityDeposit")(MGR, ctxA, { reservationId: a.id, reason: "ไม่มีประกันแล้ว" }))), "ไม่มีประกัน");
    const grandB = refNightPrice(CELL.dlx, W(0));
    okRes(await settle(FRONT, { reservationId: b.id, payMethods: [{ type: "CASH", amountSatang: grandB - b.rv.depositSatang }], securityDeposit: "REFUND" }), "settle b");
    eq((await refundSalesOf(tb.saleId)).length, 0, "คืนทั้งที่ริบแล้ว");
    okRes(await settle(FRONT, { reservationId: a.id, payMethods: [{ type: "CASH", amountSatang: grandB - a.rv.depositSatang }], securityDeposit: "REFUND" }), "settle a");
    eq((await refundSalesOf(ta.saleId)).length, 1, "คืนซ้ำตอน settle");
    await resetUnit("rooms.hotel.securityDeposit.enabled");
  });

  // ═══════════════ B ด่าน/สิทธิ์ ═══════════════
  console.log("\n── B ด่าน (X1 · X9 · X10) ──");
  await st("B-1", "X1 ข้ามร้าน: เจ้าของร้าน B (ctx tB) เรียก getFolio/postFolioItem/voidFolioItem/prepareCheckout/settleAndCheckOut/takeSecurityDeposit/refundSecurityDeposit/forfeitSecurityDeposit/attachRoomCharge/postRoomNights ด้วย id ของร้าน A ⇒ NOT_FOUND ทุกตัว (ไม่ FORBIDDEN · ไม่หลุดว่ามี) · listUnmatchedRoomCharges(ctx tB · unitId UH) ⇒ NOT_FOUND/ว่าง · คำตอบไม่มีชื่อ/เบอร์แขก · ไม่มีแถวเปลี่ยน", async () => {
    needFolio(); needCheckout(); needRc(); ok(RN.id && ids.conf, "ไม่มี RN-1/RN-4");
    const live = liveItems(await itemsOf(RN.id)).find((i) => i.type === "ROOM");
    const n0 = await prisma.hotelFolioItem.count({ where: { tenantId: tA } });
    const ops: [string, () => Promise<Any>][] = [
      ["getFolio", () => getFolio(OWNER_B, RN.id, ctxB)],
      ["post", () => post(OWNER_B, RN.id, {}, ctxB)],
      ["void", () => voidItem(OWNER_B, live.id, "ข้ามร้าน", ctxB)],
      ["prepare", () => prepare(OWNER_B, { reservationId: RN.id }, ctxB)],
      ["settle", () => settle(OWNER_B, { reservationId: RN.id, payMethods: [{ type: "CASH", amountSatang: 1 }] }, ctxB)],
      ["takeSec", () => call(() => CO("takeSecurityDeposit")(OWNER_B, ctxB, { reservationId: RN.id, amountSatang: 100_000, payType: "CASH" }))],
      ["refundSec", () => call(() => CO("refundSecurityDeposit")(OWNER_B, ctxB, { reservationId: RN.id }))],
      ["forfeitSec", () => call(() => CO("forfeitSecurityDeposit")(OWNER_B, ctxB, { reservationId: RN.id, reason: "ข้ามร้าน" }))],
      ["attach", () => attach(OWNER_B, RCS.un2, RN.id, ctxB)],
      ["postRoomNights", () => call(() => FO("postRoomNights")(ctxB, { reservationId: RN.id, upToDate: W(3) }))],
    ];
    const bad: string[] = [];
    for (const [n, f] of ops) { const r = await f(); if (!(failCode(r) === "NOT_FOUND" || (n === "postRoomNights" && r?.posted === 0))) bad.push(`${n}=${codeOf(r)}`); if (PII_TEXT.test(J(r))) bad.push(`${n} PII`); }
    eq(bad, [], "ข้ามร้าน");
    const um = await unmatched(OWNER_B, UH, ctxB);
    ok(failCode(um) === "NOT_FOUND" || unmatchedRows(um).length === 0, `unmatched ข้ามร้าน ${J(um).slice(0, 100)}`);
    eq(await prisma.hotelFolioItem.count({ where: { tenantId: tA } }), n0, "แถวเปลี่ยน");
  });
  await st("B-2", "X9 สิทธิ์ 4 ระดับ (ใบ §2.8): none/maid ⇒ FORBIDDEN ทุกตัว (getFolio · post · void · prepare · settle · takeSec · attach · unmatched) · poster (folio.post) ⇒ getFolio/post/attach/unmatched ได้ · void/prepare/settle FORBIDDEN · cashier (checkOut) ⇒ getFolio/prepare/settle ได้ · post/void FORBIDDEN · voider (folio.void) ⇒ void ได้ · post/settle FORBIDDEN · frontdesk (ฟิกซ์เจอร์) ⇒ post/prepare/settle/attach ได้ · void FORBIDDEN · MANAGER/OWNER ⇒ ได้ครบ · STAFF unitAccess [UH2] (MGR ของ UH2 ไม่มี) ⇒ NOT_FOUND บน UH", async () => {
    needFolio(); needCheckout(); needRc();
    const r = await inhouse({ checkOut: W(1), deposit: false });
    ids.perm = r.id;
    const seed = okRes(await post(MGR, r.id, { description: "แถวไว้ void" }), "seed");
    const seed2 = okRes(await post(MGR, r.id, { description: "แถวไว้ void 2" }), "seed2");
    const rs = (await rvOf(r.id));
    void rs;
    const probe = async (a: Actor) => ({
      getFolio: await getFolio(a, r.id),
      post: await post(a, r.id, { description: "สิทธิ์" }),
      void: await voidItem(a, seed.itemId, "ทดสอบสิทธิ์"),
      prepare: await prepare(a, { reservationId: r.id }),
      settle: await settle(a, { reservationId: r.id, payMethods: [{ type: "CASH", amountSatang: 1 }] }), // ยอดผิด ⇒ ถ้าผ่านสิทธิ์จะได้ PAY_MISMATCH
      attach: await attach(a, RCS.un3 ?? RCS.un2, r.id),
      unmatched: await unmatched(a, UH),
    });
    const denied = (x: Any) => isDenied(x);
    const passedGate = (x: Any) => !isDenied(x) && failCode(x) !== "THROW" && failCode(x) !== "NOT_FOUND";
    const bad: string[] = [];
    for (const [n, a] of [["none", NONE], ["maid", MAID]] as [string, Actor][]) { const p = await probe(a); for (const [k, v] of Object.entries(p)) if (!denied(v)) bad.push(`${n}.${k}=${codeOf(v)}`); }
    {
      const p = await probe(POSTER);
      for (const k of ["getFolio", "post", "unmatched"]) if (!passedGate(p[k as keyof typeof p])) bad.push(`poster.${k}=${codeOf(p[k as keyof typeof p])}`);
      ok(p.attach?.ok === true || (failCode(p.attach) !== null && !isDenied(p.attach)), `poster.attach=${codeOf(p.attach)}`);
      for (const k of ["void", "prepare", "settle"]) if (!denied(p[k as keyof typeof p])) bad.push(`poster.${k}=${codeOf(p[k as keyof typeof p])}`);
    }
    {
      const p = await probe(CASHIER);
      for (const k of ["getFolio", "prepare"]) if (!passedGate(p[k as keyof typeof p])) bad.push(`cashier.${k}=${codeOf(p[k as keyof typeof p])}`);
      if (failCode(p.settle) !== "PAY_MISMATCH") bad.push(`cashier.settle=${codeOf(p.settle)} (ต้องผ่านสิทธิ์แล้วติด PAY_MISMATCH)`);
      for (const k of ["post", "void"]) if (!denied(p[k as keyof typeof p])) bad.push(`cashier.${k}=${codeOf(p[k as keyof typeof p])}`);
    }
    {
      const p = await probe(VOIDER);
      if (p.void?.ok !== true) bad.push(`voider.void=${codeOf(p.void)}`);
      for (const k of ["post", "settle"]) if (!denied(p[k as keyof typeof p])) bad.push(`voider.${k}=${codeOf(p[k as keyof typeof p])}`);
    }
    {
      const p = await probe(FRONT);
      for (const k of ["getFolio", "post", "prepare"]) if (!passedGate(p[k as keyof typeof p])) bad.push(`frontdesk.${k}=${codeOf(p[k as keyof typeof p])}`);
      if (failCode(p.settle) !== "PAY_MISMATCH") bad.push(`frontdesk.settle=${codeOf(p.settle)}`);
      if (!denied(p.void)) bad.push(`frontdesk.void=${codeOf(p.void)}`);
    }
    for (const [n, a] of [["mgr", MGR], ["owner", OWNER]] as [string, Actor][]) {
      const v = await voidItem(a, n === "mgr" ? seed2.itemId : (okRes(await post(a, r.id, { description: "owner void" }), "owner post")).itemId, "ทดสอบสิทธิ์");
      if (v?.ok !== true) bad.push(`${n}.void=${codeOf(v)}`);
      if (!passedGate(await prepare(a, { reservationId: r.id }))) bad.push(`${n}.prepare`);
    }
    const MGR2 = await mkMember("mgr2", tA, "MANAGER", [UH2]);
    for (const [k, v] of Object.entries({ getFolio: await getFolio(MGR2, r.id), post: await post(MGR2, r.id, {}), prepare: await prepare(MGR2, { reservationId: r.id }) })) if (failCode(v) !== "NOT_FOUND") bad.push(`mgr2.${k}=${codeOf(v)}`);
    eq(bad, [], "สิทธิ์");
  });
  await st("B-3", "X10 DTO/ประวัติ: listUnmatchedRoomCharges แถวไม่มีชื่อ/เบอร์ (reference/receiptNo เท่านั้น) · prepareCheckout DTO ไม่มี PII · getFolio ไม่มี publicToken/token/secret/idNumber · AuditLog ของการกระทำเงิน (hotel.folio.posted · hotel.folio.voided · hotel.folio.settled|hotel.checked_out · hotel.security_deposit.*) มี before/after ไม่มี PII ≥ 1 แถวต่อชนิดในร้าน A", async () => {
    needFolio(); needCheckout(); needRc(); ok(ids.perm, "ไม่มี B-2");
    const um = unmatchedRows(await unmatched(FRONT));
    ok(um.length >= 1 && !PII_TEXT.test(J(um)) && ![...walkKeys(um)].some((k) => PII_KEY.test(k)), "unmatched PII");
    const p = okRes(await prepare(FRONT, { reservationId: ids.perm }), "prepare");
    ok(!PII_TEXT.test(J(p)) && ![...walkKeys(p)].some((k) => PII_KEY.test(k) || /publicToken|secret|token$/i.test(k)), "prepare PII");
    const g = okRes(await getFolio(FRONT, ids.perm), "getFolio");
    ok(![...walkKeys(g)].some((k) => /publicToken|secret|^token$|idNumber|passport/i.test(k)), "getFolio ความลับ");
    const need: Record<string, string[]> = { posted: ["hotel.folio.posted"], voided: ["hotel.folio.voided"], settled: ["hotel.folio.settled", "hotel.checked_out"], security: ["hotel.security_deposit.taken", "hotel.security_deposit.refunded", "hotel.security_deposit.forfeited"] };
    const miss: string[] = [];
    for (const [k, acts] of Object.entries(need)) {
      const rows = (await Promise.all(acts.map((a) => auditsOf(a)))).flat();
      if (!rows.length) { miss.push(`${k} ไม่มี AuditLog`); continue; }
      if (!rows.some((x) => x.before !== null || x.after !== null)) miss.push(`${k} ไม่มี before/after`);
      if (PII_TEXT.test(J(rows.map((x) => [x.before, x.after])))) miss.push(`${k} PII`);
    }
    eq(miss, [], "AuditLog");
  });
  await st("B-4", "actions.ts สถิต (ใบ §3.7): บล็อก // SVC H.5 ▸ … ◂ มี 8 action (postFolioItem/voidFolioItem/prepareCheckout/settleAndCheckOut/takeSecurityDeposit/refundSecurityDeposit/forfeitSecurityDeposit/attachRoomCharge) ทุกตัว requireUnit + ด่าน HOTEL + assertHotelCan/canHotel · ใช้คีย์ hotel.folio.post / hotel.folio.void / hotel.reservation.checkOut / hotel.booking.manage · permissions.ts: hotel.folio.post และ hotel.folio.void ออกจาก planned · \"use server\" ไม่ export type/const ใหม่ (นอก ReservationFormState เดิม)", () => {
    const s = read(F.actions);
    ok(s, "ยังไม่มี actions.ts");
    const blk = /SVC H\.5 ▸([\s\S]*?)◂/.exec(s)?.[1] ?? "";
    ok(blk, "ไม่มีบล็อก // SVC H.5 ▸ … ◂ ใน actions.ts (ยังไม่มีงาน H.5)");
    const names = ["postFolioItemAction", "voidFolioItemAction", "prepareCheckoutAction", "settleAndCheckOutAction", "takeSecurityDepositAction", "refundSecurityDepositAction", "forfeitSecurityDepositAction", "attachRoomChargeAction"];
    eq(names.filter((n) => !new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(blk)), [], "action ขาด/นอกบล็อก");
    const fns = blk.split(/export\s+async\s+function\s+/).slice(1);
    eq(fns.filter((b) => !/requireUnit\s*\(/.test(b) || !/HOTEL/.test(b) || !/assertHotelCan\s*\(|canHotel\s*\(/.test(b)).map((b) => b.split("(")[0]), [], "action ไม่มีด่าน");
    for (const k of ["hotel.folio.post", "hotel.folio.void", "hotel.reservation.checkOut", "hotel.booking.manage"]) ok(blk.includes(k), `ไม่ใช้คีย์ ${k}`);
    const perms = stripComments(read(F.perms));
    const planned = /planned[^[]*\[([\s\S]*?)\]/i.exec(perms)?.[1] ?? "";
    ok(!planned.includes("hotel.folio.post") && !planned.includes("hotel.folio.void"), "hotel.folio.post/void ยังอยู่ planned");
    ok(/^\s*["']use server["']/m.test(s), "ไม่มี \"use server\"");
    ok(!/^export\s+(type|interface|const|let|class)\b/m.test(stripComments(s).split("\n").filter((l) => !/ReservationFormState/.test(l)).join("\n")), "export ที่ไม่ใช่ async function");
  });

  // ═══════════════ N event 3 ทะเบียน ═══════════════
  console.log("\n── N event 3 ทะเบียน ──");
  const EVENTS = ["hotel.folio.posted", "hotel.folio.voided", "hotel.folio.settled", "hotel.folio.charge_unmatched", "hotel.folio.posting_warn", "hotel.security_deposit.taken", "hotel.security_deposit.refunded", "hotel.security_deposit.forfeited"];
  await st("N-1", "ทะเบียน 3 ที่ (CC §7 · กติกาเหล็ก 15): outbox-consumers.ts มี consumer ทั้ง 8 · automation/labels.ts AUTOMATION_EVENTS มีทั้ง 8 ป้ายไทย · webhooks WEBHOOK_EVENTS มีทั้ง 8 ผ่าน spread (ไม่ประกาศซ้ำ) · hotel.checked_out คงอยู่", () => {
    const cons = consumersL.mod?.consumers ?? consumersL.mod?.default;
    ok(cons && typeof cons === "object", `โหลด consumers ไม่ได้ ${consumersL.err}`);
    eq(EVENTS.filter((e) => typeof cons[e] !== "function"), [], "consumer ขาด");
    const auto = (autoL.mod?.AUTOMATION_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !auto.some((x) => x.value === e && THAI.test(x.label ?? ""))), [], "automation label ขาด/ไม่ไทย");
    const wh = (whL.mod?.WEBHOOK_EVENTS ?? []) as Any[];
    eq(EVENTS.filter((e) => !wh.some((x) => x.value === e)), [], "webhook ขาด");
    eq(EVENTS.filter((e) => wh.filter((x) => x.value === e).length > 1), [], "ซ้ำใน webhook");
    ok(!EVENTS.some((e) => stripComments(read(F.whLabels)).includes(`"${e}"`)), "ประกาศซ้ำใน webhooks/labels.ts");
    ok(typeof cons["hotel.checked_out"] === "function" && auto.some((x) => x.value === "hotel.checked_out"), "hotel.checked_out หาย");
  });
  await st("N-2", "payload (X8/X10): ทุกชนิด (ยกเว้น posting_warn ที่ไม่เกิดในฉากปกติ) มี ≥ 1 แถวในร้าน A · payload ⊆ {tenantId,unitId,reservationId,groupId,folioId,saleId,settleSaleId,itemId,reversalId,amountSatang,type,reason} ไม่มีชื่อ/เบอร์/อีเมล · unitId บนแถว · idempotencyKey ไม่ซ้ำทั้งร้าน · settled มี saleId/amountSatang · charge_unmatched มี saleId/unitId/reason", async () => {
    const ALLOWED = new Set(["tenantId", "unitId", "reservationId", "groupId", "folioId", "saleId", "settleSaleId", "itemId", "reversalId", "amountSatang", "type", "reason", "code", "status"]);
    const bad: string[] = [];
    for (const t of EVENTS.filter((e) => e !== "hotel.folio.posting_warn")) {
      const evs = await eventsOf(t);
      if (!evs.length) { bad.push(`${t} ไม่มีแถว`); continue; }
      for (const e of evs.slice(0, 20)) {
        const extra = Object.keys(e.payload ?? {}).filter((k) => !ALLOWED.has(k));
        if (extra.length) bad.push(`${t}: คีย์นอกสัญญา ${extra.join(",")}`);
        if (PII_TEXT.test(J(e.payload)) || [...walkKeys(e.payload)].some((k) => PII_KEY.test(k))) bad.push(`${t}: PII`);
        if (!e.unitId) bad.push(`${t}: ไม่มี unitId บนแถว`);
      }
    }
    const settled = (await eventsOf("hotel.folio.settled"))[0];
    if (settled && !(settled.payload.saleId && typeof settled.payload.amountSatang === "number")) bad.push("settled ไม่มี saleId/amountSatang");
    const um = (await eventsOf("hotel.folio.charge_unmatched"))[0];
    if (um && !(um.payload.saleId && um.payload.unitId !== undefined && um.payload.reason)) bad.push("charge_unmatched payload");
    eq([...new Set(bad)].slice(0, 8), [], "payload");
    const all = await prisma.outboxEvent.findMany({ where: { tenantId: tA }, select: { idempotencyKey: true } });
    eq(new Set(all.map((e: Any) => e.idempotencyKey)).size, all.length, "idempotencyKey ซ้ำ");
  });
  await st("N-3", "consumer เรียกได้ไม่โยน: consumers[type](event) กับแถวจริง 1 แถวต่อชนิด ⇒ resolve · hotel.folio.posting_warn ด้วย event สังเคราะห์ {saleId, settleSaleId} ⇒ ไม่โยน · event ของร้าน A ไม่ค้าง PENDING/FAILED หลัง drain", async () => {
    const cons = consumersL.mod?.consumers;
    ok(cons, "ไม่มี consumers");
    const bad: string[] = [];
    for (const t of EVENTS) {
      const ev = (await eventsOf(t))[0] ?? (t === "hotel.folio.posting_warn" ? { id: "synthetic", tenantId: tA, type: t, payload: { saleId: RCS.main, settleSaleId: STM.saleId }, systemId: null, unitId: UH } : null);
      if (!ev) { bad.push(`${t} ไม่มีแถว`); continue; }
      try { await cons[t](ev); } catch (e) { bad.push(`${t}: ${errMsg(e)}`); }
    }
    eq(bad, [], "consumer โยน");
    await drain();
    eq(await prisma.outboxEvent.count({ where: { tenantId: tA, type: { startsWith: "hotel." }, status: { not: "DONE" } } }), 0, "event ค้าง");
  });

  // ═══════════════ U UI สถิต ═══════════════
  console.log("\n── U UI สถิต ──");
  const COMPS = [F.panel, F.itemRow, F.postDlg, F.voidDlg, F.checkoutDlg, F.splitPay, F.secCard, F.unmatchedList];
  const PAGES = [F.detailPage, F.unmatchedPage, F.printPage];
  await st("U-1", "ไฟล์ของใบครบ (§1): folio.ts · checkout.ts · room-charge.ts · 8 คอมโพเนนต์ + folio-shared.ts · หน้า unmatched · หน้า print · ฉาก svc-qc-hotel-folio-scene.mts · docs/sds/modules/hotel.md §folio", () => {
    eq([F.folio, F.checkout, F.roomCharge, ...COMPS, F.shared, ...PAGES, F.scene].filter((f) => !has(f)), [], "ขาด");
    ok(/folio|เช็กเอาต์|settle/i.test(read(F.sds)) && /reverseRoomChargePosting|กันรายได้ซ้ำ/.test(read(F.sds)), "sds ไม่มี §folio/กันรายได้ซ้ำ");
  });
  await st("U-2", "ไทยทั้งหมด (§4): ข้อความที่ผู้ใช้เห็นใน 8 คอมโพเนนต์ + 3 หน้า ไม่มีคำอังกฤษ (ยกเว้น POS/QR/VAT/PromptPay/EDC/folio) · ป้ายสำคัญมี: บิลระหว่างพัก · ค่าห้อง · ลงห้องจาก POS · ยอดชำระ · เงินประกันห้อง · ลงรายการ · แยกจ่าย · ขอใบกำกับภาษีเต็มรูป · เช็กเอาต์ · รอทำความสะอาด · บิลลงห้องที่ยังไม่ผูกห้อง", () => {
    const bad: string[] = [];
    for (const f of [...COMPS, ...PAGES]) { const s = read(f); if (!s) { bad.push(`${f}: ยังไม่มี`); continue; } const en = englishInJsx(s); if (en.length) bad.push(`${f}: ${en.slice(0, 6).join(", ")}`); }
    eq(bad, [], "อังกฤษ");
    const all = [...COMPS, ...PAGES, F.shared].map((f) => read(f)).join("\n");
    eq(["บิลระหว่างพัก", "ค่าห้อง", "ลงห้องจาก POS", "ยอดชำระ", "เงินประกันห้อง", "ลงรายการ", "แยกจ่าย", "ขอใบกำกับภาษีเต็มรูป", "เช็กเอาต์", "รอทำความสะอาด", "ยังไม่ผูกห้อง"].filter((w) => !all.includes(w)), [], "ป้ายขาด");
  });
  await st("U-3", "ตัวเลขทศนิยม 2 + จุลภาค (§4): folio-shared/คอมโพเนนต์ จัดรูปเงินด้วย minimumFractionDigits: 2 / toFixed(2) / toLocaleString(\"th-TH\") จากสตางค์ ÷ 100 · ไม่มี Math.round(x/100) โชว์เป็นบาทไม่มีทศนิยม", () => {
    ok(has(F.shared) && COMPS.every(has), "ยังไม่มีคอมโพเนนต์/folio-shared.ts");
    const all = COMPS.concat([F.shared]).map((f) => stripComments(read(f))).join("\n");
    ok(/minimumFractionDigits:\s*2|toFixed\(2\)|maximumFractionDigits:\s*2/.test(all), "ไม่มีการจัดรูปทศนิยม 2");
    ok(/\/\s*100/.test(all), "ไม่มีการแปลงสตางค์→บาท");
    ok(!/Math\.round\([^)]*\/\s*100\)\s*\.toLocaleString\(\)/.test(all), "ปัดเป็นบาทโชว์ไม่มีทศนิยม");
  });
  await st("U-4", "ปุ่มเขียน/void ซ่อนเมื่อไม่มีสิทธิ์ (§4 · S §12): FolioPanel/FolioItemRow ปุ่ม void อยู่ใต้ canVoid · ปุ่ม «ลงรายการ» ใต้ canPost · ปุ่มเช็กเอาต์ ใต้ canSettle · prop ใช้เป็นเงื่อนไข render จริง · ริบประกัน (CheckoutDialog) ใต้ canManage/canForfeit", () => {
    const guard = /canVoid|canPost|canSettle|canManage|canForfeit|readOnly/;
    const panel = stripComments(read(F.panel)), row = stripComments(read(F.itemRow)), dlg = stripComments(read(F.checkoutDlg));
    ok(panel && row && dlg, "ยังไม่มี FolioPanel/FolioItemRow/CheckoutDialog");
    ok(/canVoid/.test(panel + row) && /canPost/.test(panel) && /canSettle/.test(panel), "ไม่มี prop สิทธิ์");
    const bad: string[] = [];
    if (!nearWrite(panel, "ลงรายการ", /canPost/)) bad.push("ลงรายการ ไม่อยู่ใต้ canPost");
    if (!nearWrite(panel, "เช็กเอาต์", /canSettle/)) bad.push("เช็กเอาต์ ไม่อยู่ใต้ canSettle");
    if (!(nearWrite(row, "ยกเลิก", /canVoid/) || nearWrite(panel, "ยกเลิก", /canVoid/) || nearWrite(row, "void", /canVoid/))) bad.push("ปุ่ม void ไม่อยู่ใต้ canVoid");
    if (!nearWrite(dlg, "ริบ", /canManage|canForfeit/)) bad.push("ริบ ไม่อยู่ใต้ canManage/canForfeit");
    eq(bad, [], "เงื่อนไข");
    ok(/(canVoid|canPost|canSettle|canManage|canForfeit)\s*[?&]|!readOnly/.test(panel + row + dlg) && guard.test(panel), "ไม่มีการใช้ prop เป็นเงื่อนไข render");
  });
  await st("U-5", "'use client' ไม่ลาก prisma (กติกา 14): 8 คอมโพเนนต์มี 'use client' และกราฟ import (ค่า) ไม่ถึง @/lib/core/db · @prisma/client · folio/checkout/room-charge/service/booking/rates · rooms/pos/account (หยุดที่ \"use server\") · folio-shared pure (ไม่มี import ค่า · ไม่มี directive)", () => {
    const bad: string[] = [];
    for (const f of COMPS) { const s = read(f); if (!s) { bad.push(`${f} ยังไม่มี`); continue; } if (!/^\s*["']use client["']/m.test(s)) bad.push(`${f} ไม่มี 'use client'`); bad.push(...clientReach(f)); }
    eq(bad, [], "เส้นลากถึง server");
    const sh = read(F.shared);
    ok(sh, "ยังไม่มี folio-shared.ts");
    eq(importSpecs(sh).filter((i) => !i.typeOnly).map((i) => i.spec), [], "folio-shared import ค่า");
    ok(!/["']use (client|server)["']/.test(stripComments(sh)), "folio-shared มี directive");
  });
  await st("U-6", "มือถือ 390 (§4): data-scroll-hint บนตารางรายการ folio (FolioPanel) และคิว unmatched (UnmatchedChargesList) + overflow-x-auto · ไดอะล็อกเช็กเอาต์เต็มจอบนมือถือ (คลาส sm:/max-w/inset หรือ h-full)", () => {
    const p = read(F.panel), u = read(F.unmatchedList), d = read(F.checkoutDlg);
    ok(p && u && d, "ยังไม่มีคอมโพเนนต์");
    ok(/data-scroll-hint/.test(p) && /overflow-x-auto/.test(p), "FolioPanel ไม่มี data-scroll-hint/overflow-x-auto");
    ok(/data-scroll-hint/.test(u), "UnmatchedChargesList ไม่มี data-scroll-hint");
    ok(/sm:|max-w|inset-0|h-full|h-screen/.test(d), "CheckoutDialog ไม่มีคลาสเต็มจอ/responsive");
  });
  await st("U-7", "หน้า (§4 · ฟิกซ์เจอร์ภาพ): รายละเอียดการจอง อ่าน searchParams tab (=money เปิดแท็บเงิน) และ checkout (=1 เปิดไดอะล็อก) · ฝัง FolioPanel · ปุ่มเช็กเอาต์ P1 (checkOutAction เดิม) ไม่อยู่ในหน้าแล้ว · หน้า unmatched: requireUnit + \"HOTEL\" + notFound + UnmatchedChargesList + listUnmatchedRoomCharges ผ่าน facade · หน้า print: requireUnit + HOTEL + getFolio ผ่าน facade · ไม่มีหน้าใด import ไฟล์ server ของ hotel ตรง (booking/folio/checkout/room-charge/service)", () => {
    const d = stripComments(read(F.detailPage)), u = stripComments(read(F.unmatchedPage)), pr = stripComments(read(F.printPage));
    ok(d && u && pr, "ยังไม่มีหน้า");
    const bad: string[] = [];
    if (!/tab/.test(d) || !/money/.test(d)) bad.push("detail ไม่อ่าน ?tab=money");
    if (!/checkout/.test(d)) bad.push("detail ไม่อ่าน ?checkout=1");
    if (!/FolioPanel/.test(d)) bad.push("detail ไม่ฝัง FolioPanel");
    if (/checkOutAction\b/.test(d)) bad.push("detail ยังใช้ checkOutAction ของ P1");
    for (const [n, s] of [["unmatched", u], ["print", pr]] as [string, string][]) for (const w of ["requireUnit", "\"HOTEL\"", "notFound"]) if (!s.includes(w)) bad.push(`${n}: ${w}`);
    if (!/UnmatchedChargesList/.test(u) || !/listUnmatchedRoomCharges/.test(u)) bad.push("unmatched ไม่ใช้ list/คอมโพเนนต์");
    if (!/getFolio/.test(pr)) bad.push("print ไม่ใช้ getFolio");
    for (const [n, s] of [["detail", d], ["unmatched", u], ["print", pr]] as [string, string][]) if (/@\/lib\/modules\/hotel\/(booking|folio|checkout|room-charge|service|rates)["']/.test(s)) bad.push(`${n}: import ไฟล์ server ตรง`);
    eq(bad, [], "หน้า");
  });
  await st("U-8", "facade hotel/index.ts export H.5 (บล็อก // SVC H.5 ▸ … ◂): getFolio · postFolioItem · voidFolioItem · postRoomNights · prepareCheckout · settleAndCheckOut · takeSecurityDeposit · refundSecurityDeposit · forfeitSecurityDeposit · chargeToRoom · onPosSalePaidRoomCharge · listUnmatchedRoomCharges · attachRoomCharge · ของ H.1/H.3 ยังครบ (quoteStay · taxLines · createBooking)", () => {
    ok(hotelL.mod, hotelL.err);
    const names = ["getFolio", "postFolioItem", "voidFolioItem", "postRoomNights", "prepareCheckout", "settleAndCheckOut", "takeSecurityDeposit", "refundSecurityDeposit", "forfeitSecurityDeposit", "chargeToRoom", "onPosSalePaidRoomCharge", "listUnmatchedRoomCharges", "attachRoomCharge", "quoteStay", "taxLines", "createBooking"];
    eq(names.filter((n) => typeof hotelL.mod[n] !== "function"), [], "ขาด");
    ok(/SVC H\.5 ▸[\s\S]*◂/.test(read(F.index)), "ไม่มีบล็อก // SVC H.5 ▸ … ◂");
  });
  await st("U-9", "ค่าตั้งใหม่ (§1 defs/rooms.ts เพิ่มคีย์อย่างเดียว): rooms.hotel.checkout.allowLegacyCash bool ค่าเริ่ม false · rooms.hotel.folio.manualItemMaxSatang int ค่าเริ่ม 5,000,000 · ป้ายไทย · sensitivity MONEY · unitTypes/scope HOTEL (hotel(...) helper) · def เดิมไม่หาย (tax.mode · securityDeposit.enabled)", () => {
    const d = (k: string) => { const x = SET?.getDef?.(k); ok(x, `ไม่มี def ${k} (ยังไม่มีงาน H.5)`); return x; };
    const a = d("rooms.hotel.checkout.allowLegacyCash"), m = d("rooms.hotel.folio.manualItemMaxSatang");
    eq([a.defaults._fallback, m.defaults._fallback], [false, 5_000_000], "ค่าเริ่ม");
    ok(THAI.test(a.labelTh ?? "") && THAI.test(m.labelTh ?? ""), "ป้ายไทย");
    ok(a.schema.safeParse(true).success && !a.schema.safeParse("x").success && m.schema.safeParse(100).success && !m.schema.safeParse(-1).success, "schema");
    ok(m.sensitivity === "MONEY", "manualItemMax ไม่ MONEY");
    const src = stripComments(read(F.roomsDefs));
    ok(/hotel\(\s*\{[^}]*key:\s*"rooms\.hotel\.checkout\.allowLegacyCash"/.test(src.replace(/\n/g, " ")) || /key:\s*"rooms\.hotel\.checkout\.allowLegacyCash"/.test(src), "ไม่ใช่ def โรงแรม");
    ok(SET.getDef("rooms.hotel.tax.mode") && SET.getDef("rooms.hotel.securityDeposit.enabled"), "def เดิมหาย");
  });
  await st("U-10", "service.ts (§1 แก้เฉพาะ): checkOut เดิมเรียก settleAndCheckOut (ไม่มี CASH ตายตัว · ไม่มี `type: \"CASH\"` ใน checkOut) · refundStay เรียก restoreRoomChargePosting/void folio · ไม่มี import @/lib/modules/account ตรงใน folio.ts/checkout.ts/room-charge.ts ยกเว้น checkout.ts/service.ts เรียก reverse/restoreRoomChargePosting ผ่าน facade @/lib/modules/account · folio.ts ไม่ import pos (เงินผ่าน checkout.ts เท่านั้น) · checkout.ts เรียก createSale นอก $transaction (ไม่อยู่ใน callback ของ prisma.$transaction)", () => {
    const svc = stripComments(read(F.service)), co = stripComments(read(F.checkout)), fo = stripComments(read(F.folio)), rc = stripComments(read(F.roomCharge));
    ok(co && fo && rc, "ยังไม่มีไฟล์ของใบ");
    const coFn = /export async function checkOut\(([\s\S]*?)\n\}\n/.exec(svc)?.[0] ?? "";
    ok(coFn && /settleAndCheckOut/.test(coFn) && !/type:\s*["']CASH["']/.test(coFn), "checkOut เดิมยังมี CASH ตายตัว/ไม่เรียก settleAndCheckOut");
    const rfFn = /export async function refundStay\(([\s\S]*?)\n\}\n/.exec(svc)?.[0] ?? "";
    ok(/restoreRoomChargePosting|VOID/.test(rfFn + co), "refundStay ไม่คืนสภาพ room charge/void folio");
    ok(!/@\/lib\/modules\/account\/(index|gl|service)["']/.test(fo + co + rc + svc), "import ไฟล์ใน account ตรง (ต้องผ่าน facade @/lib/modules/account)");
    ok(!/@\/lib\/modules\/pos/.test(fo), "folio.ts import pos");
    const txIdx = [...co.matchAll(/\$transaction\s*\(\s*(?:async\s*)?\(/g)].map((m) => m.index ?? 0);
    const saleIdx = co.indexOf("createSale(");
    ok(saleIdx >= 0, "checkout.ts ไม่เรียก createSale");
    const inside = txIdx.some((i) => { const seg = co.slice(i, saleIdx); return seg.length < 4000 && (seg.match(/\{/g)?.length ?? 0) > (seg.match(/\}/g)?.length ?? 0); });
    ok(!inside, "createSale อยู่ใน callback ของ $transaction (ต้องนอก tx · ใบ §2.4 ขั้น 3)");
  });

  // ═══════════════ F ไฟล์ที่แตะ (git · ตอนรับใบ) ═══════════════
  console.log("\n── F ไฟล์ที่แตะ (git) ──");
  const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
  const diffLines = (f: string) => git(["diff", "-U0", "HEAD", "--", f]).split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const OWN = new Set<string>([F.folio, F.checkout, F.roomCharge, F.service, F.index, F.actions, F.account, F.consumers, F.autoLabels, F.whLabels, F.roomsDefs, F.perms, ...COMPS, F.shared, ...PAGES, F.scene, F.sds, "scripts/qc-svc-h.5.mts", "scripts/probe-h5-b.mts", "src/lib/modules/hotel/booking.ts"]);
  {
    const ch = dirty(["src", "prisma", "public", "scripts", "docs"]).filter((f) => f !== "scripts/qc-svc-h.5.mts" && f !== "scripts/probe-h5-b.mts");
    const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${F.folio}`]); return true; } catch { return false; } })();
    if (ch.length === 0 && headHas) skip("F-1", "แตะเฉพาะไฟล์ของใบ (§1)", "H.5 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ (git status ของทรีงาน)");
    else await st("F-1", "แตะเฉพาะไฟล์ของใบ (§1 · git status ตอนรับใบ): folio/checkout/room-charge/service/index/actions · account/index.ts · 3 ทะเบียน event · defs/rooms.ts · permissions.ts · 8 คอมโพเนนต์ + shared · หน้า [id]/unmatched/print · ฉาก · sds (+ booking.ts เฉพาะเรียก folio.postDeposit) — ไม่แตะอื่น", () => {
      ok(ch.length > 0, "ยังไม่มีงาน (git status ว่าง) — ยังไม่มี folio.ts");
      eq(ch.filter((f) => !OWN.has(f)).slice(0, 10), [], "ไฟล์นอกใบ");
    });
  }
  await st("F-2", "ไม่แตะชิ้นต้องห้าม (§1): prisma/** · modules/pos/** · modules/rooms/** · availability.ts/tape.ts · rates.ts/pricing.ts/hotel-settings.ts · svc-qc-data.mts · ข้อสอบอื่น (qc-svc-h.0/h.1/h.2/h.3 · qc-hotel-*) · src/lib/core (ยกเว้น permissions.ts · settings/defs/rooms.ts) — ตรวจเมื่อมีงาน (folio.ts)", () => {
    ok(has(F.folio), `ยังไม่มี ${F.folio} — ตรวจตอนรับใบ`);
    const banned = dirty(["prisma", "src/lib/modules/rooms", "src/lib/modules/pos", "src/lib/modules/hotel/availability.ts", "src/lib/modules/hotel/tape.ts", F.rates, F.pricing, "src/lib/modules/hotel/hotel-settings.ts", "scripts/svc-qc-data.mts", "scripts/qc-svc-h.0.mts", "scripts/qc-svc-h.1.mts", "scripts/qc-svc-h.2.mts", "scripts/qc-svc-h.3.mts", "scripts/qc-hotel-money.mts", "scripts/qc-hotel-refund.mts", "scripts/qc-hotel-public.mts", "src/lib/core"]).filter((f) => f !== F.perms && f !== F.roomsDefs);
    eq(banned, [], "ไฟล์ต้องห้าม");
  });
  await st("F-3", "account/index.ts เพิ่ม 2 ฟังก์ชันท้ายไฟล์เท่านั้น (§1): diff เทียบ HEAD ไม่มีบรรทัดถูกลบ · บรรทัดเพิ่มทั้งหมดอยู่หลังบรรทัดสุดท้ายเดิม (ยกเว้น import/export ของ gl ที่เพิ่มในบล็อก import เดิม ≤ 3 บรรทัด) · defs/rooms.ts/ทะเบียน event/index/actions ไม่ลบบรรทัดเดิม · service.ts ลบได้เฉพาะในฟังก์ชัน checkOut/refundStay", () => {
    ok(has(F.folio), `ยังไม่มี ${F.folio} — ตรวจตอนรับใบ`);
    if (!dirty([F.account]).length) throw new AssertFail("account/index.ts ไม่มีการเปลี่ยน (ยังไม่มี reverseRoomChargePosting)");
    const head = git(["show", `HEAD:${F.account}`]).split("\n");
    const cur = read(F.account).split("\n");
    const removed = diffLines(F.account).filter((l) => l.startsWith("-") && l.slice(1).trim());
    eq(removed.slice(0, 5), [], "ลบบรรทัดใน account/index.ts");
    const headLast = head.filter((l) => l.trim()).at(-1) ?? "";
    const idx = cur.findIndex((l) => l === headLast);
    ok(idx >= 0, "หาบรรทัดสุดท้ายเดิมไม่พบ");
    const hunks = git(["diff", "-U0", "HEAD", "--", F.account]).split("\n").filter((l) => l.startsWith("@@"));
    const addedBefore = hunks.map((h) => { const m = /\+(\d+)(?:,(\d+))?/.exec(h); return m ? { start: Number(m[1]), n: Number(m[2] ?? 1) } : null; }).filter((h): h is { start: number; n: number } => !!h && h.start <= idx + 1);
    ok(sum(addedBefore.map((h) => h.n)) <= 3, `บรรทัดเพิ่มก่อนท้ายไฟล์ ${J(addedBefore)} (> 3)`);
    const rm = (f: string) => diffLines(f).filter((l) => l.startsWith("-") && l.slice(1).trim()).length;
    const bad: string[] = [];
    for (const f of [F.roomsDefs, F.actions, F.index, F.consumers, F.autoLabels, F.whLabels]) if (dirty([f]).length && rm(f) > 0) bad.push(`${f} ลบ ${rm(f)}`);
    eq(bad, [], "ลบบรรทัด");
    const svcHead = git(["show", `HEAD:${F.service}`]);
    const fnBody = (src: string, name: string) => { const m = new RegExp(`export async function ${name}\\(([\\s\\S]*?)\\n\\}\\n`).exec(src); return m ? m[0] : ""; };
    const strip = (s: string) => s.replace(fnBody(s, "checkOut"), "").replace(fnBody(s, "refundStay"), "");
    const headRest = strip(svcHead).split("\n").filter((l) => l.trim());
    const curRest = new Set(strip(read(F.service)).split("\n").filter((l) => l.trim()));
    eq(headRest.filter((l) => !curRest.has(l)).slice(0, 5), [], "service.ts ลบบรรทัดนอก checkOut/refundStay");
  }, "MAJOR");
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  try { await cleanup(tenantIds); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupMisc();
  await st("Z-1", "หลังล้าง: tenant `svc-h5-*` 0 · แถวของร้านทดสอบ 0 ทุกตาราง (รวม Hotel*/PosSale/PosDeposit/PosShift/AccountJournal*/OutboxEvent/AuditLog) · ผู้ใช้ทดสอบ 0", async () => {
    eq(await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } }), 0, "tenant");
    const left: string[] = [];
    if (tenantIds.length) for (const t of await tablesWithTenant()) { const r: { n: bigint }[] = await prisma.$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); if (Number(r[0]?.n ?? 0)) left.push(t); }
    eq(left, [], "ตารางที่ค้าง");
    eq(await prisma.user.count({ where: { email: { startsWith: MAIL } } }), 0, "user");
  }, "MAJOR");
}

// ═══════════════ Q ฉาก svcqc ═══════════════
console.log("\n── Q ฉาก svcqc (svc-qc-hotel-folio-scene) ──");
{
  let why = "";
  let unitId = "";
  try {
    const t = await prisma.tenant.findUnique({ where: { id: SQC_TENANT.id }, select: { id: true } });
    const u = t ? await prisma.businessUnit.findFirst({ where: { tenantId: SQC_TENANT.id, slug: SQC_UNITS.hotel.slug, type: "HOTEL" }, select: { id: true } }) : null;
    const nt = u ? await prisma.hotelRoomType.count({ where: { tenantId: SQC_TENANT.id, unitId: u.id } }) : 0;
    if (!t || !u || nt < 3) why = "ร้าน svcqc/หน่วย hotel ยังไม่ seed บนฐาน l3 (scripts/seed-svc-qc.mts)";
    else if (!H0_OK) why = H0_WHY;
    else if (!bookL.mod) why = `ยังไม่มี ${F.booking} (H.3)`;
    else if (!folioL.mod || !checkoutL.mod || !rcL.mod) why = `ยังไม่มี ${F.folio}/${F.checkout}/${F.roomCharge}`;
    else if (!has(F.sceneH1) || !has(F.sceneH3)) why = `ยังไม่มีฉาก ${F.sceneH1}/${F.sceneH3}`;
    else if (!has(F.scene)) why = `ยังไม่มี ${F.scene}`;
    else unitId = u.id;
  } catch (e) { why = `อ่าน svcqc ไม่ได้: ${errMsg(e)}`; }
  const runScript = (rel: string, args: string[] = [], env: Record<string, string> = {}) => spawnSync("pnpm", ["exec", "tsx", rel, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const summary = (out: string) => { const l = out.split("\n").reverse().find((x) => x.startsWith("SCENE_SUMMARY ")); try { return l ? JSON.parse(l.slice(14)) : null; } catch { return null; } };
  const target = () => prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: BS.mark }, guestName: FS.target.guest, status: "CHECKED_IN" } }) as Promise<Any>;
  const itemsByType = async (rid: string) => { const rows = (await prisma.hotelFolioItem.findMany({ where: { folio: { reservationId: rid } } })) as Any[]; const by: Record<string, number> = {}; for (const r of rows) by[r.type] = (by[r.type] ?? 0) + 1; return { by, rows }; };
  const unmatchedCount = async () => { const pays = (await prisma.posPayment.findMany({ where: { tenantId: SQC_TENANT.id, type: "ROOM_CHARGE" }, select: { saleId: true } })) as Any[]; let n = 0; for (const p of pays) if (!(await prisma.hotelFolioItem.count({ where: { tenantId: SQC_TENANT.id, refType: "PosSale", refId: p.saleId } }))) n++; return n; };
  const otherSig = async () => J([await prisma.hotelReservation.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelFolioItem.count({ where: { NOT: { tenantId: SQC_TENANT.id } } }), await prisma.hotelRoom.count({ where: { tenantId: SQC_TENANT.id, unitId } })]);
  const n1 = `ฉาก ${F.scene}: (ฉาก h.1 → h.3 --clear → h.3 → h.5) รัน exit 0 · SCENE_SUMMARY {created,updated,removed} + reservationId ของ inhouse-web (SVC_VIS_H5_RES_ID) · folio ของ inhouse-web: itemsByType ตาม expect (ROOM 1 · POS_CHARGE 2 · MINIBAR 1 · SERVICE 2 · VOID_REVERSAL 1 · DISCOUNT 1 · DEPOSIT 1 · SECURITY_DEPOSIT 1) · balance 84,000 (cache = Σ) · securityDepositSatang 100,000 (ใบรับ hotel-secdep) · folio OPEN · บิล ROOM_CHARGE B999 อยู่คิว unmatched (1) · inhouse-ota ไม่มีรายการเพิ่ม · ร้านอื่น/แถวนอก mark ไม่เปลี่ยน`;
  const n2 = "รันฉากซ้ำ ⇒ SCENE_SUMMARY 0/0/0 · itemsByType/balance/unmatched เท่าเดิม";
  const n3 = "--clear ⇒ item ที่ description มี mark หาย (folio กลับ DEPOSIT อย่างเดียว) · บิล POS ของฉาก (ร้านอาหาร/ประกัน) VOIDED/คืน · unmatched 0 · แถวนอก mark คงเดิม · รันคืน ⇒ expect เดิม";
  if (why) { for (const [id, n] of [["Q-1", n1], ["Q-2", n2], ["Q-3", n3]]) skip(id, n, why, "MAJOR"); }
  else {
    const state = async () => { const t = await target(); ok(t, "ไม่มี inhouse-web CHECKED_IN"); const { by, rows } = await itemsByType(t.id); const f = await prisma.hotelFolio.findUnique({ where: { reservationId: t.id } }); return { t, by, rows, f, un: await unmatchedCount() }; };
    await st("Q-1", n1, async () => {
      ok(runScript(F.sceneH1).status === 0, "ฉาก h.1 ล้ม");
      if (has("scripts/svc-qc-hotel-tape-scene.mts")) runScript("scripts/svc-qc-hotel-tape-scene.mts", ["--clear"]);
      runScript(F.scene, ["--clear"]);
      runScript(F.sceneH3, ["--clear"]);
      ok(runScript(F.sceneH3).status === 0, "ฉาก h.3 ล้ม");
      const o0 = await otherSig();
      const a = runScript(F.scene);
      const sum0 = summary(`${a.stdout}`);
      ok(a.status === 0 && sum0 && ["created", "updated", "removed"].every((k) => typeof sum0[k] === "number"), `exit=${a.status} ${sum0 ? fmt(sum0) : `${a.stdout}${a.stderr}`.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
      const s = await state();
      ok(J(sum0).includes(s.t.id), "SCENE_SUMMARY ไม่พิมพ์ reservationId ของ inhouse-web");
      eq(s.by, { ...FS.expect.itemsByType }, "itemsByType");
      eq([s.f.balanceSatang, refBalance(s.rows), s.f.status], [FS.expect.balanceSatang, FS.expect.balanceSatang, FS.expect.folioStatus], "balance/status");
      eq(s.t.securityDepositSatang, FS.expect.securityHeldSatang, "ประกัน");
      ok(s.t.securityDepositSaleId && (await prisma.posSale.findUnique({ where: { id: s.t.securityDepositSaleId } }))?.status === "PAID", "ใบรับประกัน");
      eq(s.un, FS.expect.unmatched, "unmatched");
      const ota = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, unitId, note: { contains: BS.mark }, source: "OTA", status: "CHECKED_IN" } });
      if (ota) eq((await itemsByType(ota.id)).by, { DEPOSIT: 1 }, "inhouse-ota มีรายการเพิ่ม");
      eq(await otherSig(), o0, "ร้านอื่น/แถวนอก mark เปลี่ยน");
    }, "MAJOR");
    await st("Q-2", n2, async () => {
      const s0 = await state();
      const b = runScript(F.scene);
      eq(summary(`${b.stdout}`), { created: 0, updated: 0, removed: 0 }, "รอบสอง");
      const s1 = await state();
      eq([s1.by, s1.f.balanceSatang, s1.un], [s0.by, s0.f.balanceSatang, s0.un], "เปลี่ยน");
    }, "MAJOR");
    await st("Q-3", n3, async () => {
      const o0 = await otherSig();
      const s0 = await state();
      const cl = runScript(F.scene, ["--clear"]);
      ok(cl.status === 0, `--clear exit=${cl.status}`);
      const s1 = await state();
      eq(Object.keys(s1.by).sort(), ["DEPOSIT"], `item ค้าง ${J(s1.by)}`);
      eq(s1.un, 0, "unmatched ค้าง");
      const posIds = [...new Set(s0.rows.filter((r: Any) => r.type === "POS_CHARGE").map((r: Any) => r.refId as string))];
      ok((await prisma.posSale.findMany({ where: { id: { in: posIds } } })).every((x: Any) => x.status === "VOIDED"), "บิลร้านของฉากไม่ VOIDED");
      eq(await otherSig(), o0, "ลบเกิน");
      const back = runScript(F.scene);
      ok(back.status === 0, "รันคืน");
      eq((await state()).by, { ...FS.expect.itemsByType }, "คืนแล้วไม่ตรง expect");
    }, "MAJOR");
  }
}

// ═══════════════ V ภาพ ═══════════════
console.log("\n── V ภาพ ──");
{
  const base = process.env.QC_BASE ?? "";
  const name = "visual-svc h.5 ด้วย owner และ frontdesk · folio (?tab=money) · checkout (?tab=money&checkout=1) · print · unmatched [SVC_VIS_H5_RES_ID จาก SCENE_SUMMARY] × 1440/390 · HTTP < 400 · ไม่ล้นแนวนอน — ผู้คุมตรวจ PARITY ภาพ 09 ขวา (frontdesk ไม่เห็นปุ่ม void)";
  if (!base) skip("V-1", name, "ไม่มี QC_BASE — ผู้คุม build QC ผ่าน iso + reseed + ฉาก h.1/h.3/h.5 แล้วรันซ้ำด้วย QC_BASE=http://127.0.0.1:<port>", "MAJOR");
  else {
    const bad: string[] = [];
    let env: Record<string, string> = {};
    try { const t = await prisma.hotelReservation.findFirst({ where: { tenantId: SQC_TENANT.id, note: { contains: BS.mark }, guestName: FS.target.guest }, select: { id: true } }); if (t) env = { SVC_VIS_H5_RES_ID: t.id }; } catch { /* */ }
    for (const user of ["owner", "frontdesk"]) {
      const r = spawnSync("pnpm", ["exec", "tsx", "scripts/visual-svc.mts", "h.5", "--user", user, "--base", base], { cwd: ROOT, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) bad.push(`${user} exit=${r.status} ${`${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => l.includes("❌")).slice(0, 2).join(" | ").slice(0, 200)}`);
    }
    record("V-1", name, bad.length ? "FAIL" : "PASS", bad.join(" · "), "MAJOR");
  }
}

// ═══════════════ G regression ═══════════════
console.log("\n── G: regression ──");
const summaryOf = (out: string): Any | null => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return null;
  try { return JSON.parse(line.slice(13)); } catch { return null; }
};
const judgeNoFail = (out: string) => { const s = summaryOf(out); return !!s && Array.isArray(s.failed) && s.failed.length === 0; };
const judgeLegacy = (out: string, code: number | null) => { const s = summaryOf(out); return code === 0 && !!s && (!s.findings || s.findings.length === 0); };
// 🔴 ORACLE-EDIT ที่ใบนี้คาด (§2.11): qc-hotel-money HT-1.2/HT-2.1–2.3 และ qc-hotel-refund RF-1.1–RF-5.2 เรียก checkOut เดิมโดยไม่ส่ง payMethods ⇒ หลัง H.5 ได้ PAY_METHODS_REQUIRED
//    (allowLegacyCash ค่าเริ่ม false) — ผู้คุมต้องเปิด rooms.hotel.checkout.allowLegacyCash ในร้านทดสอบของ oracle P1 (หรือส่ง payMethods) · ตัวเลข HT-2.2 (Cr 4000 = 100,000) คงเดิม
const REG: { s: string; args?: string[]; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-h.3", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL (ฐานของ H.5)" },
  { s: "qc-svc-h.1", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-h.0", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-hotel-money", judge: judgeLegacy, note: "P1 checkOut เดิม — ต้อง ORACLE-EDIT HT-1.2/HT-2.x: เปิด allowLegacyCash ในร้านทดสอบ หรือส่ง payMethods (PAY_METHODS_REQUIRED) · HT-2.2 Cr 4000 = 100,000 คงจริง" },
  { s: "qc-hotel-public", judge: judgeLegacy },
  { s: "qc-hotel-refund", judge: judgeLegacy, note: "ต้อง ORACLE-EDIT RF-1.1–RF-5.2 (สาย checkOut เดิม ⇒ PAY_METHODS_REQUIRED) · refundStay หลัง settle ใบใหม่ net 0" },
  { s: "qc-pos-p2.9b", judge: (out) => { const s = summaryOf(out); return !!s && (s.skipped === true || (Array.isArray(s.failed) && s.failed.length === 0)); }, note: "มัดจำ POS (DEPOSIT{refSaleId}) ไม่มี FAIL" },
  { s: "qc-pos-p5.1", judge: (out) => { const s = summaryOf(out); return !!s && Array.isArray(s.failed) && s.failed.length === 0; }, note: "มัดจำโมดูล/บิลโรงแรม ไม่มี FAIL" },
  { s: "qc-acc-v2-pos-lines", note: "applyExternalSale เส้น POS exit 0" },
  { s: "qc-svc-r0.4", judge: judgeNoFail, note: "หน้าค่าตั้ง (def ใหม่) ไม่มี FAIL" },
  { s: "qc-svc-d.13", args: ["--no-regression"], judge: judgeNoFail, note: "ไม่มี FAIL" },
  { s: "qc-svc-smoke" },
  { s: "qc-svc-b.0", judge: judgeNoFail, note: "ทะเบียน event ไม่มี FAIL" },
];
{
  const hasWork = typeof folioL.mod?.postFolioItem === "function" && typeof checkoutL.mod?.settleAndCheckOut === "function" && typeof rcL.mod?.chargeToRoom === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (folio.ts/checkout.ts/room-charge.ts) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_H5_NO_REGRESSION=1" : "";
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ไม่เป็นไร */ }
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.args?.length ? ` ${g.args.join(" ")}` : ""}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `${LOG_DIR}/svc-h5-reg-${g.s}.log`;
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
console.log(`\n===== QC SVC H.5 · folio · ลงห้องจาก POS · เช็กเอาต์ POS ใบเดียว · เงินประกัน =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`กลุ่ม: ${Object.entries(byGroup).map(([g, v]) => `${g} ${v.passed}/${v.total}${v.skipped ? ` (skip ${v.skipped})` : ""}`).join(" · ")}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id), byGroup })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · V-1 ไม่มี QC_BASE · Q-* svcqc ยังไม่ seed/ยังไม่มีฉาก · F-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
