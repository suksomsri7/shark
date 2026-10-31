// QC — SVC B.0 · migration `svc_b` (จองคิว + POS 2 จุด) + ค่าตั้งจองคิว defs/booking.ts · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.0.md (ตารางคีย์ §4 ผูกตรงตัว) · ledger/SVC-MASTER-PLAN.md แถว B.0 · CC §1.3 §1.6 §6.1 §8 §10 ข้อ 2
//        ledger/DESIGN-BOOKING-QUEUE.md §9 + ภาคผนวก ก (#1–#66 × แม่แบบ ตัดผม/สปา/คลินิก)
//
// กลุ่มข้อ:
//   D   ค่าตั้ง defs/booking.ts — ทุกแถวภาคผนวก ก × 3 แม่แบบ (ค่า · chain) · ข้อความ 10 ชนิด · type · _fallback · สิทธิ์ · snapshot · schema
//   V   validateGroup: ค่าเริ่มทุกแม่แบบไม่ขัด · จับคู่ขัด 5 แบบ
//   P   ไฟล์: facade โหลด defs · ชิ้นกลางที่ห้ามแตะ · โค้ด POS ไม่ถูกแตะ · คีย์สิทธิ์ใหม่ · setStatusAction ไม่รับสถานะใหม่
//   E   scripts/pos-qc-env.mts ยอม ep-mute-scene เฉพาะใต้ qc-svc.sh (ปลดหนี้ SVC-D1) · ด่าน prod เดิมคงอยู่
//   F   scope registry (fitness F1) + Prisma client
//   M   migration `<ts>_svc_b` ตัวเดียว เรียงหลัง svc_r0b · additive ล้วน · แตะเฉพาะตารางของใบ · POS เฉพาะ 3 คอลัมน์ · ลงฐานแล้ว · schema แตะเฉพาะไฟล์ของใบ
//   T I K CK N   ตาราง/คอลัมน์ · ดัชนี (+ partial unique) · FK · CHECK · enum ต่อท้าย
//   O   ข้อมูลเดิมยังอ่านได้ (Appointment/QueueTicket/PosHeldCart/PosSaleLine/PosStaffCommission) · แถวเดิม kind=BOOKED · partial unique บิลพัก (ยิงพร้อมกัน 10 ทาง ได้ 1)
//   S   ผ่านเครื่องยนต์ค่าตั้งจริง (applyTemplate · resolve · ชั้นช่าง/บริการ · validateGroup ตอนบันทึก · สิทธิ์เงิน · snapshotPolicy)
//   G   regression: qc-booking-* 4 · qc-hr-leave-booking · qc-queue-public · POS บิลพัก/ค่าคอมฯ (p1.5 p2.4 p3.5) · qc-svc-r0.3 · qc-svc-smoke
//
// ตัดสินจาก DB จริงด้วย `pg` (ไม่พึ่ง client) ยกเว้นหมวด F/O-3/S · ทุกแถวทดสอบอยู่ใต้ tenant ชั่วคราว slug `qc-svc-b0-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.0.mts
//      (ห้าม timeout ครอบ · หมวด G เรียกชุดอื่นต่อกันนานหลายนาที · ตั้ง SVC_B0_NO_REGRESSION=1 = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
// หมวด P (P-2…P-4) เทียบ git กับ BASE_SHA — ความหมายคือ "ตอนรับ B.0" · รันซ้ำหลัง merge ใบอื่นที่แตะไฟล์เหล่านั้นให้ผู้คุมตีความ (M-6/M-7 SKIP เองเมื่อมี migration SVC ใบหลัง)
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-svc-b.0";
const SVC_HOST = svcQcHostMark(); // ORACLE-EDIT (ผู้คุม 31 ต.ค. · ฐานต่อเลน) เดิม "ep-mute-scene"
const FORBIDDEN_HOSTS = ["ep-royal-night", "ep-plain-art", "ep-cool-shadow", "ep-weathered-river", "ep-frosty-lab", "ep-fragrant-thunder"];
const BASE_SHA = "8ff682d5"; // tip ของ session/svc ก่อน B.0 (schema หลัง R0.1/R0.3/R0.8)
const R0B = "20261221000001_svc_r0b";

// ═══════════════ 0. ด่านฐานข้อมูล (ในตัวข้อสอบเสมอ) ═══════════════
{
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const u = process.env[n] ?? "";
    if (!u) { console.error(`🔴 ${LABEL}: ไม่มี ${n} — รันผ่าน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.0.mts`); process.exit(4); }
    const bad = FORBIDDEN_HOSTS.find((h) => u.includes(h));
    if (bad) { console.error(`🔴 ${LABEL}: ${n} ชี้ฐานต้องห้าม (${bad}) — หยุด`); process.exit(4); }
    let hn = "";
    try { hn = new URL(u).hostname; } catch { /* อ่านไม่ได้ = ปฏิเสธ */ }
    if (!hn.startsWith(SVC_HOST)) { console.error(`🔴 ${LABEL}: ${n} host ไม่ใช่ qc-svc (${SVC_HOST}) — หยุด`); process.exit(4); }
  }
  if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: APP_ENV=production`); process.exit(4); }
}

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 160) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const pgCode = (e: unknown): string => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");
const rid = (p: string) => `svcb0_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
/** ไฟล์ที่ต่างจาก BASE (ไม่นับช่องว่าง) + ไฟล์ใหม่ที่ยังไม่ track ใต้ paths */
const changedFiles = (paths: string[]): string[] => {
  const a = git(["diff", "-w", "--ignore-blank-lines", "--name-only", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean);
  const b = git(["ls-files", "--others", "--exclude-standard", "--", ...paths]).split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
};
/** ไฟล์ที่มีบรรทัดถูกลบ/แก้ (ไม่นับช่องว่าง) เทียบ BASE */
const deletedLines = (paths: string[]): string[] =>
  git(["diff", "-w", "--ignore-blank-lines", "--numstat", BASE_SHA, "--", ...paths]).split("\n").filter(Boolean)
    .map((l) => l.split("\t")).filter(([, d]) => d !== "-" && Number(d) > 0).map(([, d, f]) => `${f}(-${d})`);

// ═══════════════ สเปก: ภาคผนวก ก → คีย์ (ใบสั่ง §4 · ตรงตัว) ═══════════════
const TPLS = ["BARBER", "SPA", "CLINIC"] as const;
type Row = { n: string; key: string; type: string; chain: string[]; v: readonly [unknown, unknown, unknown] };
const x3 = (v: unknown) => [v, v, v] as const;
const MSG_KINDS = ["confirmation", "reminder", "checkedIn", "ticketIssued", "nearTurn", "yourTurn", "delayed", "noShowRebook", "rebookInvite", "courseExpiry"] as const;
const msgOn = (off: string[]) => Object.fromEntries(MSG_KINDS.map((k) => [k, !off.includes(k)]));
const CAT: Row[] = [
  { n: "01", key: "booking.general.shopType", type: "enum", chain: ["UNIT"], v: ["BARBER", "SPA", "CLINIC"] },
  { n: "02", key: "booking.general.providerLabel", type: "text", chain: ["UNIT"], v: ["ช่าง", "หมอนวด", "แพทย์"] },
  { n: "03", key: "booking.general.resourceLabel", type: "text", chain: ["UNIT"], v: ["เก้าอี้", "เตียง/ห้อง", "ห้องตรวจ"] },
  { n: "04", key: "booking.general.customerLocales", type: "table", chain: ["UNIT"], v: [["th", "en"], ["th", "en"], ["th"]] },
  { n: "05", key: "booking.general.defaultHours", type: "table", chain: ["UNIT"], v: [{ openMin: 600, closeMin: 1200 }, { openMin: 600, closeMin: 1260 }, { openMin: 540, closeMin: 1020 }] },
  { n: "06", key: "booking.staff.hoursSource", type: "table", chain: ["STAFF"], v: x3(["HR_SHIFT", "STAFF_WEEKLY", "UNIT_HOURS"]) },
  { n: "07", key: "booking.staff.weeklySchedule", type: "enum", chain: ["STAFF"], v: ["UNIT_HOURS", "UNIT_HOURS", "OWN_SCHEDULE"] },
  { n: "08", key: "booking.staff.maxJobsPerDay", type: "int", chain: ["UNIT", "STAFF"], v: [null, 6, null] },
  { n: "09", key: "booking.staff.minBreakMin", type: "minutes", chain: ["UNIT", "STAFF"], v: [0, 10, 0] },
  { n: "10", key: "booking.staff.customerCanChoose", type: "bool", chain: ["STAFF"], v: x3(true) },
  { n: "11", key: "booking.staff.servicesMode", type: "enum", chain: ["STAFF"], v: ["ALL", "ALL", "ASSIGNED"] },
  { n: "12", key: "booking.service.durationSource", type: "enum", chain: ["SERVICE"], v: x3("CATALOG") },
  { n: "13", key: "booking.service.cleanupMin", type: "minutes", chain: ["UNIT", "SERVICE", "RESOURCE"], v: [0, 10, 5] },
  { n: "14", key: "booking.service.resourceRule", type: "enum", chain: ["SERVICE"], v: ["STAFF_CHAIR", "PER_SERVICE", "EXAM_ROOM"] },
  { n: "15", key: "booking.service.staffCount", type: "int", chain: ["SERVICE"], v: x3(1) },
  { n: "16", key: "booking.service.onlineBookable", type: "bool", chain: ["SERVICE"], v: x3(true) },
  { n: "17", key: "booking.service.walkIn", type: "table", chain: ["SERVICE"], v: [{ enabled: true, closeAtOrAboveMin: 90 }, { enabled: true, closeAtOrAboveMin: null }, { enabled: true, closeAtOrAboveMin: null }] },
  { n: "18", key: "booking.service.rebookAfterDays", type: "days", chain: ["UNIT", "SERVICE"], v: [28, 30, null] },
  { n: "19", key: "booking.booking.horizonDays", type: "days", chain: ["UNIT"], v: [30, 30, 60] },
  { n: "20", key: "booking.booking.minLeadMin", type: "minutes", chain: ["UNIT", "SERVICE"], v: [60, 60, 120] },
  { n: "21", key: "booking.booking.slotStepMin", type: "minutes", chain: ["UNIT"], v: [15, 30, 15] },
  { n: "22", key: "booking.booking.requireConfirm", type: "bool", chain: ["UNIT", "SERVICE"], v: [false, false, true] },
  { n: "23", key: "booking.booking.anyStaffOption", type: "bool", chain: ["UNIT"], v: x3(true) },
  { n: "24", key: "booking.booking.onlineSharePct", type: "percent", chain: ["UNIT", "STAFF"], v: [60, 60, 80] },
  { n: "25", key: "booking.booking.maxOpenPerPhone", type: "int", chain: ["UNIT"], v: [2, 2, 1] },
  { n: "26", key: "booking.booking.extraFields", type: "enum", chain: ["UNIT", "SERVICE"], v: [null, "MASSAGE_NOTE", "SYMPTOM_OPTIONAL"] },
  { n: "27", key: "booking.late.graceMin", type: "minutes", chain: ["UNIT"], v: [10, 15, 15] },
  { n: "28", key: "booking.late.afterGrace", type: "enum", chain: ["UNIT"], v: ["RELEASE_REQUEUE", "RELEASE_REQUEUE", "WAIT_NOTIFY_COUNTER"] },
  { n: "29", key: "booking.late.noShowAfterMin", type: "minutes", chain: ["UNIT"], v: [30, 30, 60] },
  { n: "30", key: "booking.late.freeChangeBeforeMin", type: "minutes", chain: ["UNIT", "SERVICE"], v: [180, 720, 120] },
  { n: "31", key: "booking.late.selfRescheduleMax", type: "int", chain: ["UNIT"], v: [2, 2, 1] },
  { n: "32", key: "booking.late.repeatNoShow", type: "table", chain: ["UNIT"], v: [{ count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" }, { count: 2, windowDays: 90, action: "REQUIRE_DEPOSIT" }, { count: 3, windowDays: 180, action: "PHONE_ONLY" }] },
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · B.8 · ย้ายจาก B.7 Q1): ยกเลิกเลยเวลาฟรี = BLOCK (ค่าเริ่มทุกแม่แบบ · คุ้มครองผู้บริโภค) / FORFEIT (ยอมเสียมัดจำตาม % ไม่มา)
  { n: "32b", key: "booking.late.lateCancelMode", type: "enum", chain: ["UNIT"], v: ["BLOCK", "BLOCK", "BLOCK"] },
  { n: "33", key: "booking.deposit.method", type: "enum", chain: ["UNIT"], v: ["PROMPTPAY_SLIP", "PROMPTPAY_SLIP", "NONE"] },
  { n: "34", key: "booking.deposit.amount", type: "table", chain: ["UNIT", "SERVICE"], v: [{ mode: "PERCENT", bp: 2000, minDurationMin: 90 }, { mode: "PER_SERVICE" }, null] },
  { n: "35", key: "booking.deposit.payWithinMin", type: "minutes", chain: ["UNIT"], v: [15, 30, null] },
  { n: "36", key: "booking.deposit.forfeitPct", type: "percent", chain: ["UNIT"], v: [100, 100, null] },
  { n: "37", key: "booking.deposit.memberExemptTier", type: "text", chain: ["UNIT"], v: [null, "GOLD", null] },
  { n: "38", key: "booking.queue.order", type: "enum", chain: ["UNIT"], v: ["SINGLE_LINE_BY_TIME", "SINGLE_LINE_BY_TIME", "APPOINTMENT_FIRST"] },
  { n: "39", key: "booking.queue.walkInFillGaps", type: "bool", chain: ["UNIT"], v: [true, true, false] },
  { n: "40", key: "booking.queue.safetyMin", type: "minutes", chain: ["UNIT"], v: [5, 10, 0] },
  { n: "41", key: "booking.queue.walkInCloseWaitMin", type: "minutes", chain: ["UNIT"], v: [120, 90, 180] },
  { n: "42", key: "booking.queue.remoteTicket", type: "table", chain: ["UNIT"], v: [{ enabled: true, maxWaitMin: 90 }, { enabled: true, maxWaitMin: 60 }, { enabled: true, maxWaitMin: null }] },
  { n: "43", key: "booking.queue.skipAfterMin", type: "minutes", chain: ["UNIT"], v: [10, 10, 15] },
  { n: "44", key: "booking.queue.walkInPickStaff", type: "bool", chain: ["UNIT", "DEVICE"], v: [true, true, false] },
  { n: "45", key: "booking.queue.priorityGroups", type: "table", chain: ["UNIT"], v: [[], [], ["ELDERLY", "MONK", "DISABLED"]] },
  { n: "46", key: "booking.queue.prefixes", type: "table", chain: ["UNIT"], v: [{ walkIn: "A", appointment: "P", priority: null }, { walkIn: "A", appointment: "P", priority: null }, { walkIn: "A", appointment: "P", priority: "B" }] },
  { n: "48", key: "booking.notify.reminderOffsetsMin", type: "table", chain: ["UNIT"], v: [[1440, 120], [1440, 180], [1440]] },
  { n: "49", key: "booking.notify.nearTurnAhead", type: "int", chain: ["UNIT"], v: [2, 2, 3] },
  { n: "50", key: "booking.notify.delayAlertMin", type: "minutes", chain: ["UNIT"], v: [15, 15, 30] },
  // ORACLE-EDIT (ผู้คุม 30 ต.ค. · B.9 มติ Q2): ซ่อนชื่อบริการในข้อความแจ้งเตือน — แม่แบบ CLINIC เปิด (ทุกนโยบายร้าน = ค่าตั้ง)
  { n: "50b", key: "booking.notify.hideServiceName", type: "bool", chain: ["UNIT"], v: [false, false, true] },
  { n: "51", key: "booking.msg.enabled", type: "table", chain: ["UNIT"], v: [msgOn(["courseExpiry"]), msgOn([]), msgOn(["rebookInvite", "courseExpiry"])] },
  { n: "52", key: "booking.display.tvShow", type: "table", chain: ["DEVICE"], v: [{ label: "PROVIDER", showCustomerName: false }, { label: "PROVIDER", showCustomerName: false }, { label: "RESOURCE", showCustomerName: false }] },
  { n: "53", key: "booking.display.voice", type: "table", chain: ["DEVICE"], v: [["th", "en"], ["th"], ["th"]] },
  { n: "54", key: "booking.display.nextCount", type: "int", chain: ["DEVICE"], v: [3, 3, 5] },
  { n: "55", key: "booking.kiosk.services", type: "enum", chain: ["DEVICE"], v: ["WALKIN_ENABLED", "ALL", "ALL"] },
  { n: "56", key: "booking.kiosk.phone", type: "enum", chain: ["DEVICE"], v: ["OPTIONAL", "OPTIONAL", "REQUIRED"] },
  { n: "57", key: "booking.kiosk.paperTicket", type: "bool", chain: ["DEVICE"], v: [false, false, true] },
  { n: "58", key: "booking.kiosk.pinLock", type: "bool", chain: ["DEVICE"], v: x3(true) },
  { n: "59", key: "booking.money.onDone", type: "enum", chain: ["UNIT"], v: x3("POS_HELD_BILL") },
  { n: "60", key: "booking.money.commissionTo", type: "enum", chain: ["UNIT"], v: ["PERFORMER", "PERFORMER", "OFF"] },
  { n: "61", key: "booking.money.commissionRate", type: "table", chain: ["UNIT", "SERVICE", "STAFF"], v: [{ serviceBp: 0, productBp: 0 }, { serviceBp: 0, productBp: 0 }, null] },
  { n: "62", key: "booking.money.commissionToPayroll", type: "bool", chain: ["UNIT"], v: [true, true, false] },
  { n: "63", key: "booking.course.enabled", type: "bool", chain: ["UNIT"], v: [false, true, false] },
  { n: "64", key: "booking.course.policy", type: "table", chain: ["UNIT", "COURSE"], v: [null, { validityMonths: 6, extendMonths: 1, crossBranch: false, transferable: false, noShowDeductSessions: 1, refund: { mode: "REMAINING_PRORATA", feeBp: 1000 }, expiryWarnDays: 30 }, null] },
  { n: "66", key: "booking.privacy.walkInRetentionDays", type: "days", chain: ["TENANT"], v: [180, 180, null] },
  // ORACLE-EDIT (ผู้คุม 31 ต.ค. · b16-R1/R2): B.16 ฟิลด์สมาชิกบนการ์ดงาน — ชั้น TENANT · กลุ่ม privacy (ownerOnly) · SPA = ฟิลด์เทมเพลตสมาชิก salon
  { n: "66b", key: "booking.privacy.jobCardFields", type: "table", chain: ["TENANT"], v: [[], ["pressurePref", "chemicalAllergy"], []] },
  // นอกภาคผนวก (สัญญา): CC §6.1 โหมดแถวเดียว · มติ B.2 (overrunExtendMin)
  { n: "X1", key: "booking.queue.singleLine", type: "bool", chain: ["UNIT"], v: x3(true) },
  { n: "X2", key: "booking.queue.overrunExtendMin", type: "minutes", chain: ["UNIT"], v: x3(5) },
];
const MSG_KEYS = MSG_KINDS.map((k) => `booking.msg.${k}`);
const ALL_KEYS = [...CAT.map((r) => r.key), ...MSG_KEYS];
// ORACLE-EDIT B.0-R1 (มติผู้คุม 28 ต.ค. /root/svc-runs/fix/b0.md ข้อ 1): _fallback = พฤติกรรมระบบจองรุ่นแรก (8ff682d5) ทีละคีย์
//   ที่มา: slots.ts SLOT_STEP_MIN=15 · อดีตเท่านั้นที่ปิด (ไม่มีเวลาจองล่วงหน้าขั้นต่ำ) · public-booking.tsx nextDays(14) · ไม่มีเพดานต่อเบอร์/ต่อช่าง ·
//   ไม่มีสาย/ไม่มาอัตโนมัติ (พนักงานกด NO_SHOW เอง แล้วริบมัดจำเต็ม = forfeit 100 คงเดิม) · ไม่มีข้อความ/เตือน · มัดจำพนักงานบันทึกเอง (ไม่เก็บออนไลน์) ·
//   ไม่มีลิงก์จัดการนัด (เลื่อนเองไม่ได้) · กรอบเวลา = เวลาร้านเท่านั้น · ค่าคอมฯ ตามคนขาย (ไม่ใช่ผู้ให้บริการ) · ไม่ลบข้อมูลลูกค้า · คีย์ที่ไม่อยู่ในนี้ = BARBER (ไม่มีผลกับรุ่นแรก)
const FALLBACK_OVERRIDE: Record<string, unknown> = {
  "booking.staff.hoursSource": ["UNIT_HOURS"], // getAvailableSlots รุ่นแรก: กรอบ = เวลาร้าน − ลา (ไม่อ่าน BookingStaffHours/กะ HR)
  "booking.service.walkIn": { enabled: true, closeAtOrAboveMin: null }, // ไม่ตัดตามความยาวบริการ (walk-in ไม่มีผลเมื่อ singleLine=false)
  "booking.service.rebookAfterDays": null,
  "booking.booking.horizonDays": 14,
  "booking.booking.minLeadMin": 0,
  "booking.booking.onlineSharePct": 100,
  "booking.booking.maxOpenPerPhone": null,
  "booking.late.afterGrace": "WAIT_NOTIFY_COUNTER",
  "booking.late.noShowAfterMin": null,
  "booking.late.selfRescheduleMax": 0,
  "booking.late.repeatNoShow": null,
  "booking.deposit.method": "NONE",
  "booking.deposit.amount": { mode: "PER_SERVICE" },
  "booking.deposit.payWithinMin": null,
  "booking.notify.reminderOffsetsMin": [],
  "booking.notify.delayAlertMin": null,
  "booking.msg.enabled": Object.fromEntries(MSG_KINDS.map((k) => [k, false])),
  "booking.money.commissionTo": "OFF",
  "booking.money.commissionToPayroll": false,
  "booking.privacy.walkInRetentionDays": null,
  "booking.queue.singleLine": false, // ไม่รวมคิว ⇒ queue.* อื่นไม่มีผล คงค่า BARBER
};
const SNAP_REQUIRED = [
  "booking.deposit.method", "booking.deposit.amount", "booking.deposit.payWithinMin", "booking.deposit.forfeitPct",
  "booking.late.graceMin", "booking.late.afterGrace", "booking.late.noShowAfterMin", "booking.late.freeChangeBeforeMin", "booking.late.selfRescheduleMax",
  "booking.booking.requireConfirm",
];

// ═══════════════ ชนิดกว้าง (ข้อสอบล้ำหน้าโค้ด ⇒ dynamic import) ═══════════════
type ZodLike = { safeParse: (v: unknown) => { success: boolean } };
type DefLike = {
  key: string; domain: string; group: string; type: string; chain: readonly string[]; editPermission: string; defaults: Record<string, unknown>;
  ownerOnly?: boolean; sensitivity?: string; templateVars?: readonly string[]; hiddenUntil?: string; labelTh?: string; schema: ZodLike;
};
type Issue = { key?: string; code: string; messageTh?: string };
type TemplateLike = { key: string; version: number; labelTh?: string; hiddenUntil?: unknown };
type RegistryApi = {
  getDef: (key: string) => DefLike | undefined;
  listDefs: (domain: string, group?: string) => DefLike[];
  TEMPLATES: Record<string, readonly TemplateLike[]>;
  SNAPSHOT_KEYS: Record<string, readonly string[]>;
  validateGroup: (domain: string, group: string, values: Record<string, unknown>) => Issue[];
  snapshotDomain?: (kind: string) => string | undefined;
};
type TemplateApi = { checkTemplate: (def: DefLike, value: unknown) => Issue[]; templateVarsUsed: (value: unknown) => string[] };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type Ctx = { tenantId: string };
type Refs = { unitId: string; staffId?: string; serviceId?: string };
type Resolved = { value: unknown; source: string; templateKey: string | null };
type SetRes = { ok: boolean; saved?: number; removed?: number; code?: string; issues?: Issue[] };
type Snapshot = { v: number; domain: string; template: { key: string; version: number }; values: Record<string, unknown> };
type SettingsApi = {
  resolveSetting: (ctx: Ctx, key: string, refs: Refs) => Promise<Resolved>;
  resolveSettings: (ctx: Ctx, keys: string[], refs: Refs) => Promise<Record<string, Resolved>>;
  setSettings: (actor: Actor, ctx: Ctx, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: Ctx, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  snapshotPolicy: (ctx: Ctx, kind: string, refs: Refs) => Promise<Snapshot>;
};
type ModelApi = { findMany: (a?: unknown) => Promise<Record<string, unknown>[]>; create: (a: unknown) => Promise<Record<string, unknown>>; deleteMany: (a?: unknown) => Promise<unknown> };
type Db = Record<string, ModelApi> & { $disconnect: () => Promise<void> };

const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try { return { mod: (await import(spec)) as T, err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

// ═══════════════ D/V. ค่าตั้ง (pure) ═══════════════
console.log("\n── D/V: defs/booking.ts ตามภาคผนวก ก × 3 แม่แบบ (ใบสั่ง §4) ──");
const DEFS_REL = "src/lib/core/settings/defs/booking.ts";
const defsLoad = existsSync(join(ROOT, DEFS_REL)) ? await tryImport<unknown>(fileUrl(DEFS_REL)) : { mod: null, err: `ยังไม่มี «${DEFS_REL}»` };
const regLoad = await tryImport<RegistryApi>(fileUrl("src/lib/core/settings/registry.ts"));
const tplLoad = await tryImport<TemplateApi>(fileUrl("src/lib/core/settings/template.ts"));
const REG = (): RegistryApi => {
  if (!defsLoad.mod) throw new AssertFail(`โหลด defs/booking.ts ไม่ได้ (${defsLoad.err})`);
  if (!regLoad.mod) throw new AssertFail(`โหลด registry ไม่ได้ (${regLoad.err})`);
  return regLoad.mod;
};
const DEF = (key: string): DefLike => {
  const d = REG().getDef(key);
  if (!d) throw new AssertFail(`ไม่มี def ${key}`);
  return d;
};
const dflt = (d: DefLike, t: string): unknown => (hasOwn(d.defaults, t) ? d.defaults[t] : d.defaults._fallback);

await st("D-00", "defs/booking.ts pure (import ได้เฉพาะ zod · ../registry · import type) + โหลดผ่าน defineSettings ไม่โยน", () => {
  ok(existsSync(join(ROOT, DEFS_REL)), `ยังไม่มี «${DEFS_REL}»`);
  const src = readFileSync(join(ROOT, DEFS_REL), "utf8");
  const imps = [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]);
  const bad = imps.filter((p) => !(p === "zod" || p === "../registry"));
  ok(bad.length === 0, `import ต้องห้าม: ${bad.join(", ")}`);
  ok(!/@prisma|core\/db|from\s+["']next/.test(src), "อ้าง prisma/db/next");
  REG();
});
await st("D-TPL", "แม่แบบ booking = BARBER · SPA · CLINIC (version ≥1 · labelTh) · CLINIC มี hiddenUntil · BARBER/SPA ไม่มี", () => {
  const t = REG().TEMPLATES.booking ?? [];
  eq(t.map((x) => x.key).sort(), ["BARBER", "CLINIC", "SPA"], "แม่แบบ");
  for (const x of t) {
    ok(Number.isInteger(x.version) && x.version >= 1, `${x.key} version`);
    ok(typeof x.labelTh === "string" && x.labelTh.trim().length > 0, `${x.key} labelTh`);
  }
  const h = (k: string) => t.find((x) => x.key === k)?.hiddenUntil;
  ok(typeof h("CLINIC") === "string" && String(h("CLINIC")).length > 0, `CLINIC.hiddenUntil = ${fmt(h("CLINIC"))}`);
  ok(h("BARBER") === undefined && h("SPA") === undefined, "BARBER/SPA ต้องไม่ซ่อน");
});
await st("D-KEYS", `คีย์ booking ครบตามตาราง (${ALL_KEYS.length} คีย์) และไม่มีคีย์นอกตาราง`, () => {
  const have = REG().listDefs("booking").map((d) => d.key);
  const miss = ALL_KEYS.filter((k) => !have.includes(k));
  const extra = have.filter((k) => !ALL_KEYS.includes(k));
  ok(miss.length === 0 && extra.length === 0, `${miss.length ? `ขาด ${miss.length}: ${miss.slice(0, 6).join(", ")} ` : ""}${extra.length ? `เกิน: ${extra.slice(0, 6).join(", ")}` : ""}`);
});
for (const r of CAT) {
  await st(`D-${r.n}`, `${r.n.startsWith("X") ? "สัญญา" : `#${Number(r.n)}`} ${r.key} — chain [${r.chain.join("→")}] · ${TPLS.map((t, i) => `${t}=${fmt(r.v[i])}`).join(" · ")}`, () => {
    const d = DEF(r.key);
    eq(d.domain, "booking", "domain");
    eq(d.group, r.key.split(".")[1], "group");
    eq([...d.chain], r.chain, "chain");
    TPLS.forEach((t, i) => eq(dflt(d, t), r.v[i], t));
  });
}
await st("D-47", "#47 ลำดับช่องทาง = messaging.channelOrder เดิม (ไม่สร้างคีย์ booking ซ้ำ)", () => {
  ok(!!REG().getDef("messaging.channelOrder") || existsSync(join(ROOT, "src/lib/core/settings/defs/messaging.ts")), "ไม่มี messaging.channelOrder");
  const dup = REG().listDefs("booking").filter((d) => /channel/i.test(d.key));
  ok(dup.length === 0, `คีย์ซ้ำ: ${dup.map((d) => d.key).join(", ")}`);
});
await st("D-65", "#65 สิทธิ์ต่อบทบาท = permissions.ts (B.11) · ไม่มี def booking เรื่องบทบาท/สิทธิ์", () => {
  const dup = REG().listDefs("booking").filter((d) => /role|perm|access/i.test(d.key));
  ok(dup.length === 0, `def ที่ไม่ควรมี: ${dup.map((d) => d.key).join(", ")}`);
});
await st("D-MSG-1", "#51 ข้อความ 10 ชนิด booking.msg.<ชนิด> · type template · chain [UNIT] · {th ไม่ว่าง} ทุกแม่แบบ", () => {
  for (const k of MSG_KEYS) {
    const d = DEF(k);
    eq(d.type, "template", `${k}.type`);
    eq([...d.chain], ["UNIT"], `${k}.chain`);
    for (const t of TPLS) {
      const v = dflt(d, t);
      ok(typeof v === "object" && v !== null && !Array.isArray(v), `${k} ${t} ต้องเป็น {th, en?}`);
      const th = (v as Record<string, unknown>).th;
      ok(typeof th === "string" && th.trim().length > 0, `${k} ${t} th ว่าง`);
    }
  }
});
await st("D-MSG-2", "#51 ตัวแปรในข้อความทุกแม่แบบอยู่ใน templateVars (checkTemplate ผ่าน)", () => {
  if (!tplLoad.mod) throw new AssertFail(`โหลด template.ts ไม่ได้ (${tplLoad.err})`);
  for (const k of MSG_KEYS) {
    const d = DEF(k);
    for (const t of [...TPLS, "_fallback"]) {
      const iss = tplLoad.mod.checkTemplate(d, dflt(d, t));
      ok(iss.length === 0, `${k} ${t}: ${iss.map((i) => i.messageTh ?? i.code).join(" · ")}`);
    }
  }
});
await st("D-MSG-3", "#51 reminder มี {เวลา} · ticketIssued/yourTurn มี {เลขคิว} (ทุกแม่แบบ)", () => {
  if (!tplLoad.mod) throw new AssertFail(`โหลด template.ts ไม่ได้ (${tplLoad.err})`);
  const need: [string, string][] = [["booking.msg.reminder", "เวลา"], ["booking.msg.ticketIssued", "เลขคิว"], ["booking.msg.yourTurn", "เลขคิว"]];
  for (const [k, v] of need) for (const t of TPLS) ok(tplLoad.mod.templateVarsUsed(dflt(DEF(k), t)).includes(v), `${k} ${t} ไม่มี {${v}}`);
});
await st("D-MSG-4", "#51 แม่แบบคลินิก: ไม่มี {บริการ} ในข้อความใดเลย", () => {
  if (!tplLoad.mod) throw new AssertFail(`โหลด template.ts ไม่ได้ (${tplLoad.err})`);
  const bad = MSG_KEYS.filter((k) => tplLoad.mod!.templateVarsUsed(dflt(DEF(k), "CLINIC")).includes("บริการ") || JSON.stringify(dflt(DEF(k), "CLINIC")).includes("{บริการ}"));
  ok(bad.length === 0, `มี {บริการ}: ${bad.join(", ")}`);
});
await st("D-TYPE", "type ของทุกคีย์ตามตาราง (ตัววาดหน้าตั้งค่า R0.4 เลือกจาก type)", () => {
  const bad = CAT.filter((r) => REG().getDef(r.key)?.type !== r.type).map((r) => `${r.key}=${REG().getDef(r.key)?.type ?? "ไม่มี"}≠${r.type}`);
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
}, "MAJOR");
await st("D-FB", "_fallback (ร้านเดิมที่ยังไม่เลือกแม่แบบ) = พฤติกรรมระบบจองรุ่นแรกทีละคีย์ (จอง 14 วัน · ไม่มีขั้นต่ำ · ไม่จำกัดต่อเบอร์ · ไม่มาไม่อัตโนมัติ · ไม่ส่งข้อความ · มัดจำไม่เก็บออนไลน์ · ค่าคอมฯ ไม่ตามผู้ให้บริการ · ไม่ลบข้อมูล · ไม่รวมแถว) · คีย์อื่น = BARBER", () => {
  const bad: string[] = [];
  for (const k of ALL_KEYS) {
    const d = DEF(k);
    ok(hasOwn(d.defaults, "_fallback"), `${k} ไม่มี _fallback`);
    const want = hasOwn(FALLBACK_OVERRIDE, k) ? FALLBACK_OVERRIDE[k] : dflt(d, "BARBER");
    if (!isDeepStrictEqual(d.defaults._fallback, want)) bad.push(`${k}: ${fmt(d.defaults._fallback)} ≠ ${fmt(want)}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});
await st("D-PERM", "สิทธิ์: deposit/money = booking.settings.money + MONEY · privacy = PRIVACY + ownerOnly · อื่น = booking.settings.edit", () => {
  const bad: string[] = [];
  for (const d of REG().listDefs("booking")) {
    const g = d.group;
    const want = g === "deposit" || g === "money" ? { p: "booking.settings.money", s: "MONEY", o: false } : g === "privacy" ? { p: "booking.settings.edit", s: "PRIVACY", o: true } : { p: "booking.settings.edit", s: undefined, o: false };
    if (d.editPermission !== want.p) bad.push(`${d.key}.editPermission=${d.editPermission}`);
    if (d.sensitivity !== want.s) bad.push(`${d.key}.sensitivity=${String(d.sensitivity)}`);
    if ((d.ownerOnly === true) !== want.o) bad.push(`${d.key}.ownerOnly=${String(d.ownerOnly)}`);
  }
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
});
await st("D-PERM-2", "คีย์สิทธิ์ booking.settings.edit / booking.settings.money อยู่ในทะเบียน (PERMISSION_KEYS) + ป้ายไทย", async () => {
  const p = await tryImport<{ PERMISSION_KEYS: ReadonlySet<string>; permissionLabel: (k: string) => string }>(fileUrl("src/lib/core/permissions.ts"));
  if (!p.mod) throw new AssertFail(`โหลด permissions.ts ไม่ได้ (${p.err})`);
  for (const k of ["booking.settings.edit", "booking.settings.money"]) {
    ok(p.mod.PERMISSION_KEYS.has(k), `${k} ไม่อยู่ใน PERMISSION_KEYS`);
    const l = p.mod.permissionLabel(k);
    ok(l !== k && /[฀-๿]/.test(l), `${k} ไม่มีป้ายไทย (${l})`);
  }
});
await st("D-SNAP", "SNAPSHOT_KEYS.appointment ⊇ มัดจำ · เลื่อน/ยกเลิกฟรี · ผ่อนผัน · ไม่มา · ร้านยืนยันก่อน (CC §1.6) · คีย์ booking ล้วน", () => {
  const s = REG().SNAPSHOT_KEYS.appointment ?? [];
  const miss = SNAP_REQUIRED.filter((k) => !s.includes(k));
  ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
  ok(s.every((k) => k.startsWith("booking.")), `มีคีย์นอก booking: ${s.filter((k) => !k.startsWith("booking.")).join(", ")}`);
  const sd = REG().snapshotDomain;
  if (typeof sd === "function") eq(sd("appointment"), "booking", "snapshotDomain(appointment)");
});
await st("D-SCH", "schema ปฏิเสธค่าผิด (% นอกช่วง · นาทีติดลบ/ทศนิยม · slotStep 7 · prefix ผิดรูป · bp > 10000 · offset ≤ 0 · enum นอกรายการ) และรับค่าถูก", () => {
  const cases: [string, unknown, boolean][] = [
    ["booking.booking.onlineSharePct", 101, false], ["booking.booking.onlineSharePct", -1, false], ["booking.booking.onlineSharePct", 0, true],
    ["booking.late.graceMin", -1, false], ["booking.late.graceMin", 1.5, false], ["booking.late.graceMin", 20, true],
    ["booking.booking.slotStepMin", 7, false], ["booking.booking.slotStepMin", 20, true],
    ["booking.queue.prefixes", { walkIn: "a", appointment: "P", priority: null }, false], ["booking.queue.prefixes", { walkIn: "AB", appointment: "P", priority: null }, false],
    ["booking.money.commissionRate", { serviceBp: 10001, productBp: 0 }, false], ["booking.money.commissionRate", { serviceBp: 1000, productBp: 500 }, true],
    ["booking.deposit.amount", { mode: "PERCENT", bp: 10001, minDurationMin: null }, false], ["booking.deposit.amount", { mode: "PERCENT", bp: 5000, minDurationMin: null }, true],
    ["booking.notify.reminderOffsetsMin", [0], false], ["booking.notify.reminderOffsetsMin", [60], true],
    ["booking.general.shopType", "SALON", false], ["booking.deposit.method", "CASH", false],
    // ORACLE-EDIT B.0-R2 (มติ 28 ต.ค. ข้อ 2): นโยบายปิดได้ + เพดาน
    ["booking.late.repeatNoShow", null, true], ["booking.booking.maxOpenPerPhone", null, true], ["booking.late.noShowAfterMin", null, true],
    ["booking.notify.delayAlertMin", null, true], ["booking.notify.delayAlertMin", 0, false], ["booking.notify.delayAlertMin", 1, true],
    ["booking.queue.skipAfterMin", null, true], ["booking.queue.skipAfterMin", 0, false], ["booking.queue.skipAfterMin", 1, true],
    ["booking.deposit.payWithinMin", 1440, true], ["booking.deposit.payWithinMin", 1441, false],
    ["booking.late.graceMin", 1440, true], ["booking.late.graceMin", 1441, false],
    ["booking.late.noShowAfterMin", 1440, true], ["booking.late.noShowAfterMin", 1441, false],
    ["booking.late.freeChangeBeforeMin", 1440, true], ["booking.late.freeChangeBeforeMin", 1441, false],
  ];
  const bad = cases.filter(([k, v, want]) => DEF(k).schema.safeParse(v).success !== want).map(([k, v, want]) => `${k}=${fmt(v)} ควร${want ? "ผ่าน" : "ไม่ผ่าน"}`);
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});

// ── V: validateGroup ──
const groupVals = (group: string, tpl: string, over: Record<string, unknown> = {}): Record<string, unknown> => {
  const o: Record<string, unknown> = {};
  for (const d of REG().listDefs("booking", group)) o[d.key] = tpl === "_fallback" ? d.defaults._fallback : dflt(d, tpl);
  return { ...o, ...over };
};
const vg = (group: string, vals: Record<string, unknown>) => REG().validateGroup("booking", group, vals);
const hasIssue = (iss: Issue[], code: string, keys: string[]) => iss.some((i) => i.code === code && (!i.key || keys.includes(i.key)));
await st("V-0", "ค่าเริ่มของทุกแม่แบบ (+_fallback) ไม่ติด validateGroup กลุ่มใดเลย", () => {
  const groups = [...new Set(REG().listDefs("booking").map((d) => d.group))];
  const bad: string[] = [];
  for (const t of [...TPLS, "_fallback"]) for (const g of groups) for (const i of vg(g, groupVals(g, t))) bad.push(`${t}/${g}: ${i.code}`);
  ok(bad.length === 0, bad.slice(0, 5).join(" · "));
});
await st("V-1", "late: ไม่มาหลัง ≤ ผ่อนผัน ⇒ NO_SHOW_BEFORE_GRACE (เท่ากันก็ขัด) · 10/30 ไม่ขัด", () => {
  const K = ["booking.late.noShowAfterMin", "booking.late.graceMin"];
  ok(hasIssue(vg("late", groupVals("late", "BARBER", { "booking.late.graceMin": 30, "booking.late.noShowAfterMin": 30 })), "NO_SHOW_BEFORE_GRACE", K), "30/30 ไม่ถูกจับ");
  ok(hasIssue(vg("late", groupVals("late", "BARBER", { "booking.late.graceMin": 40 })), "NO_SHOW_BEFORE_GRACE", K), "40/30 ไม่ถูกจับ");
  ok(!hasIssue(vg("late", groupVals("late", "BARBER", { "booking.late.graceMin": 29 })), "NO_SHOW_BEFORE_GRACE", K), "29/30 ถูกจับผิด");
});
await st("V-2", "booking: ต้องจองก่อน ≥ จองล่วงหน้าได้×1440 ⇒ LEAD_BEYOND_HORIZON · 1439 นาที/1 วัน ไม่ขัด", () => {
  const K = ["booking.booking.minLeadMin", "booking.booking.horizonDays"];
  ok(hasIssue(vg("booking", groupVals("booking", "BARBER", { "booking.booking.horizonDays": 1, "booking.booking.minLeadMin": 1440 })), "LEAD_BEYOND_HORIZON", K), "1440/1 วัน ไม่ถูกจับ");
  ok(!hasIssue(vg("booking", groupVals("booking", "BARBER", { "booking.booking.horizonDays": 1, "booking.booking.minLeadMin": 1439 })), "LEAD_BEYOND_HORIZON", K), "1439/1 วัน ถูกจับผิด");
});
await st("V-3", "deposit: เก็บมัดจำแต่ไม่กำหนดเวลาจ่าย ⇒ DEPOSIT_DEADLINE_REQUIRED · NONE + null ไม่ขัด", () => {
  const K = ["booking.deposit.payWithinMin", "booking.deposit.method"];
  ok(hasIssue(vg("deposit", groupVals("deposit", "BARBER", { "booking.deposit.payWithinMin": null })), "DEPOSIT_DEADLINE_REQUIRED", K), "PROMPTPAY_SLIP + null ไม่ถูกจับ");
  ok(!hasIssue(vg("deposit", groupVals("deposit", "CLINIC")), "DEPOSIT_DEADLINE_REQUIRED", K), "NONE + null ถูกจับผิด");
});
await st("V-4", "queue: รับบัตรมือถือรอได้นานกว่าเกณฑ์ปิดรับ walk-in ⇒ REMOTE_WAIT_OVER_CLOSE · ปิดบัตรมือถือ/ไม่จำกัด ไม่ขัด", () => {
  const K = ["booking.queue.remoteTicket", "booking.queue.walkInCloseWaitMin"];
  ok(hasIssue(vg("queue", groupVals("queue", "BARBER", { "booking.queue.remoteTicket": { enabled: true, maxWaitMin: 150 } })), "REMOTE_WAIT_OVER_CLOSE", K), "150 > 120 ไม่ถูกจับ");
  ok(!hasIssue(vg("queue", groupVals("queue", "BARBER", { "booking.queue.remoteTicket": { enabled: false, maxWaitMin: 150 } })), "REMOTE_WAIT_OVER_CLOSE", K), "ปิดแล้วยังถูกจับ");
  ok(!hasIssue(vg("queue", groupVals("queue", "BARBER", { "booking.queue.remoteTicket": { enabled: true, maxWaitMin: 120 } })), "REMOTE_WAIT_OVER_CLOSE", K), "120 = 120 ถูกจับผิด");
});
await st("V-5", "queue: ตัวอักษรนำเลขบัตรซ้ำ ⇒ QUEUE_PREFIX_DUPLICATE (A/A · P/P) · A/P/B ไม่ขัด", () => {
  const K = ["booking.queue.prefixes"];
  ok(hasIssue(vg("queue", groupVals("queue", "BARBER", { "booking.queue.prefixes": { walkIn: "A", appointment: "A", priority: null } })), "QUEUE_PREFIX_DUPLICATE", K), "A/A ไม่ถูกจับ");
  ok(hasIssue(vg("queue", groupVals("queue", "CLINIC", { "booking.queue.prefixes": { walkIn: "A", appointment: "P", priority: "P" } })), "QUEUE_PREFIX_DUPLICATE", K), "P/P ไม่ถูกจับ");
  ok(!hasIssue(vg("queue", groupVals("queue", "CLINIC")), "QUEUE_PREFIX_DUPLICATE", K), "A/P/B ถูกจับผิด");
});

// ORACLE-EDIT B.0-R3 (มติ 28 ต.ค. ข้อ 2–3): ไม่มาแบบปิด (null) ไม่ขัด · กฎใหม่ 3 ข้อ
await st("V-6", "late: noShowAfterMin = null (ไม่ตั้งไม่มาอัตโนมัติ) ⇒ ไม่ติด NO_SHOW_BEFORE_GRACE", () => {
  ok(!hasIssue(vg("late", groupVals("late", "BARBER", { "booking.late.noShowAfterMin": null })), "NO_SHOW_BEFORE_GRACE", ["booking.late.noShowAfterMin", "booking.late.graceMin"]), "null ถูกจับผิด");
});
await st("V-7", "queue: มีสิทธิ์คิวก่อนแต่ไม่มีตัวอักษรนำ ⇒ PRIORITY_PREFIX_REQUIRED · มีตัวอักษร/ไม่มีกลุ่ม ไม่ขัด", () => {
  const K = ["booking.queue.prefixes", "booking.queue.priorityGroups"];
  ok(hasIssue(vg("queue", groupVals("queue", "CLINIC", { "booking.queue.prefixes": { walkIn: "A", appointment: "P", priority: null } })), "PRIORITY_PREFIX_REQUIRED", K), "CLINIC + priority null ไม่ถูกจับ");
  ok(!hasIssue(vg("queue", groupVals("queue", "CLINIC")), "PRIORITY_PREFIX_REQUIRED", K), "CLINIC A/P/B ถูกจับผิด");
  ok(!hasIssue(vg("queue", groupVals("queue", "BARBER")), "PRIORITY_PREFIX_REQUIRED", K), "BARBER ไม่มีกลุ่ม ถูกจับผิด");
});
await st("V-8", "course: เปิดขายคอร์สแต่ไม่มีนโยบาย ⇒ COURSE_POLICY_REQUIRED · ปิด + null ไม่ขัด", () => {
  const K = ["booking.course.policy", "booking.course.enabled"];
  ok(hasIssue(vg("course", groupVals("course", "BARBER", { "booking.course.enabled": true })), "COURSE_POLICY_REQUIRED", K), "enabled + null ไม่ถูกจับ");
  ok(!hasIssue(vg("course", groupVals("course", "SPA")), "COURSE_POLICY_REQUIRED", K), "SPA ถูกจับผิด");
  ok(!hasIssue(vg("course", groupVals("course", "BARBER")), "COURSE_POLICY_REQUIRED", K), "ปิด + null ถูกจับผิด");
});
await st("V-9", "money: ค่าคอมฯ ตามผู้ให้บริการแต่ไม่มีอัตรา ⇒ COMMISSION_RATE_REQUIRED · OFF + null ไม่ขัด", () => {
  const K = ["booking.money.commissionRate", "booking.money.commissionTo"];
  ok(hasIssue(vg("money", groupVals("money", "BARBER", { "booking.money.commissionRate": null })), "COMMISSION_RATE_REQUIRED", K), "PERFORMER + null ไม่ถูกจับ");
  ok(!hasIssue(vg("money", groupVals("money", "CLINIC")), "COMMISSION_RATE_REQUIRED", K), "OFF + null ถูกจับผิด");
});
// ORACLE-EDIT B.0-R4 (มติ 28 ต.ค. ข้อ 4): helpTh
await st("D-HELP", "helpTh: walkIn · singleLine ตามถ้อยคำมติ · cleanupMin/onlineBookable (บริการใหม่) · defaultHours (สาขาใหม่) บอกว่าเป็นค่าตั้งต้น", () => {
  const h = (k: string) => String((DEF(k) as DefLike & { helpTh?: unknown }).helpTh ?? "");
  ok(h("booking.service.walkIn").includes("ปิดรับ walk-in สำหรับบริการที่ยาวตั้งแต่กี่นาที"), `walkIn: ${h("booking.service.walkIn")}`);
  ok(h("booking.queue.singleLine").includes("รวมคิว walk-in เข้ากับนัดในแถวเดียว"), `singleLine: ${h("booking.queue.singleLine")}`);
  for (const [k, w] of [["booking.service.cleanupMin", "บริการใหม่"], ["booking.service.onlineBookable", "บริการใหม่"], ["booking.general.defaultHours", "สาขาใหม่"]] as const)
    ok(h(k).includes("ค่าตั้งต้น") && h(k).includes(w), `${k}: ต้องมี "ค่าตั้งต้น" + "${w}" (ได้ ${h(k) || "ว่าง"})`);
});

// ═══════════════ P. ไฟล์ ═══════════════
console.log("\n── P: ไฟล์ของใบ · ชิ้นกลาง/POS ที่ห้ามแตะ ──");
await st("P-1", "facade core/settings/index.ts import \"./defs/booking\"", () => {
  ok(/^\s*import\s+["']\.\/defs\/booking["'];?/m.test(readFileSync(join(ROOT, "src/lib/core/settings/index.ts"), "utf8")), "ไม่พบ import \"./defs/booking\"");
});
// ORACLE-EDIT B.0-G1 (ผู้คุม 28 ต.ค.): หมวด P ตรวจ "ตอนรับ B.0" เท่านั้น — เมื่อใบหลังแก้ไฟล์ชิ้นกลางเหล่านั้นแล้ว (มี commit หลัง 270897ec แตะไฟล์) ⇒ SKIP พร้อมเหตุผล
const laterTouch = (() => { try { return git(["log", "--format=%h", "270897ec..HEAD", "--", "src/lib/core/settings", "src/lib/core/permissions.ts", "src/lib/core/scope.ts"]).trim(); } catch { return ""; } })();
const acceptOnlyP = async (id: string, name: string, fn: () => void, sev: Sev = "CRITICAL") =>
  laterTouch ? skip(id, name, `ใบหลังแก้ไฟล์ชิ้นกลางแล้ว (${laterTouch.split("\n")[0]}) — ข้อนี้ตรวจเฉพาะตอนรับ B.0`, sev) : st(id, name, fn, sev);
await acceptOnlyP("P-2", "ชิ้นกลางที่ห้ามแตะไม่เปลี่ยน (service/registry/template.ts · legal/ · defs rooms/payments/messaging/_fixture)", () => {
  const ch = changedFiles([
    "src/lib/core/settings/service.ts", "src/lib/core/settings/registry.ts", "src/lib/core/settings/template.ts", "src/lib/core/settings/legal",
    "src/lib/core/settings/defs/rooms.ts", "src/lib/core/settings/defs/payments.ts", "src/lib/core/settings/defs/messaging.ts", "src/lib/core/settings/defs/_fixture.ts",
  ]);
  ok(ch.length === 0, `แตะ: ${ch.join(", ")}`);
});
// ORACLE-EDIT B.0-R5 (มติ 28 ต.ค. ข้อ 5): types.ts ยอมแก้บรรทัด `export type TemplateDef` บรรทัดเดียว (รวม hiddenUntil) · อื่นเพิ่มอย่างเดียว
await acceptOnlyP("P-3", "index.ts / permissions.ts / scope.ts เพิ่มอย่างเดียว · types.ts ลบ/แก้ได้เฉพาะบรรทัด `export type TemplateDef`", () => {
  const d = deletedLines(["src/lib/core/settings/index.ts", "src/lib/core/permissions.ts", "src/lib/core/scope.ts"]);
  const removed = git(["diff", "-w", "--ignore-blank-lines", "-U0", BASE_SHA, "--", "src/lib/core/settings/types.ts"]).split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim()).filter(Boolean);
  const badTypes = removed.filter((l) => !/^export type TemplateDef\s*=/.test(l));
  ok(d.length === 0 && badTypes.length === 0, [...d, ...badTypes.map((l) => `types.ts ลบ: ${l.slice(0, 60)}`)].join(", "));
}, "MAJOR");
await st("P-5", "TemplateDef มี `hiddenUntil?: string` ในชนิดเดียว · ไม่มี TemplateDefHidden ในทรี", () => {
  const t = readFileSync(join(ROOT, "src/lib/core/settings/types.ts"), "utf8");
  const m = t.match(/export type TemplateDef\s*=\s*\{([^}]*)\}/);
  ok(!!m && /hiddenUntil\?\s*:\s*string/.test(m[1]), `TemplateDef = ${m?.[0] ?? "ไม่พบ"}`);
  const hits = (spawnSync("grep", ["-rl", "TemplateDefHidden", join(ROOT, "src")], { encoding: "utf8" }).stdout ?? "").split("\n").filter(Boolean);
  ok(hits.length === 0, `ยังอ้าง TemplateDefHidden: ${hits.join(", ")}`);
});
await acceptOnlyP("P-4", "โค้ด POS ไม่ถูกแตะ (ฟังก์ชันเป็นของ B.10) · pos-prod-writer-guard (allowlist เขียน prod) ไม่เปลี่ยน", () => {
  const src = changedFiles(["src"]).filter((f) => /(^|\/)pos([-_./]|$)/i.test(f));
  const guard = changedFiles(["scripts/lib/pos-prod-writer-guard.mts"]);
  ok(src.length === 0 && guard.length === 0, `แตะ: ${[...src, ...guard].slice(0, 6).join(", ")}`);
});
await st("N-4", "setStatusAction รับเฉพาะ 6 สถานะเดิม (ไม่ใช้ z.nativeEnum(AppointmentStatus)) — QUEUED/IN_SERVICE/LATE เข้าทางเดิมไม่ได้", () => {
  const src = readFileSync(join(ROOT, "src/lib/actions/booking.ts"), "utf8");
  ok(!/nativeEnum\(\s*AppointmentStatus\s*\)/.test(src), "ยังใช้ z.nativeEnum(AppointmentStatus)");
  const lists = [...src.matchAll(/z\.enum\(\s*\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/["']([A-Z_]+)["']/g)].map((x) => x[1]).sort().join(","));
  ok(lists.includes(["ARRIVED", "CANCELLED", "CONFIRMED", "DONE", "NO_SHOW", "PENDING"].join(",")), "ไม่พบ z.enum([6 สถานะเดิม]) ใน actions/booking.ts");
});

// ═══════════════ E. scripts/pos-qc-env.mts (ปลดหนี้ SVC-D1) ═══════════════
console.log("\n── E: pos-qc-env ยอม ep-mute-scene เฉพาะใต้ qc-svc.sh ──");
{
  const probe = `/tmp/svc-b0-envprobe-${process.pid}.mts`;
  const envFile = pathToFileURL(join(ROOT, "scripts", "pos-qc-env.mts")).href;
  writeFileSync(probe, `const m = await import(${JSON.stringify(envFile)});\nconsole.log("MARK=" + String(m.POS_QC_HOST_MARK));\nif (process.argv.includes("--load")) { m.loadPosQcEnv("svc-b0-probe"); console.log("LOADED"); }\n`);
  const run = (extra: Record<string, string>, load = false) => {
    const env = {} as NodeJS.ProcessEnv;
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    delete env.QC_BRANCH; delete env.POS_QC_ALLOW_HOST; delete env.APP_ENV;
    Object.assign(env, { QC_ENV_FILE: "/nonexistent/svc-b0-no-env-file" }, extra);
    const r = spawnSync(process.execPath, [...process.execArgv, probe, ...(load ? ["--load"] : [])], { cwd: ROOT, env, encoding: "utf8", timeout: 60_000 });
    return { code: r.status, mark: (r.stdout ?? "").match(/MARK=(\S+)/)?.[1] ?? "", loaded: (r.stdout ?? "").includes("LOADED") };
  };
  try {
    const svc = { QC_BRANCH: "qc-svc", POS_QC_ALLOW_HOST: SVC_HOST };
    await st("E-1", "ใต้ qc-svc.sh (QC_BRANCH=qc-svc + POS_QC_ALLOW_HOST=ep-mute-scene) ⇒ POS_QC_HOST_MARK = ep-mute-scene", () => {
      const r = run(svc); eq(r.mark, SVC_HOST, `exit=${r.code}`);
    });
    await st("E-2", "ไม่มี QC_BRANCH=qc-svc (ALLOW อย่างเดียว) ⇒ ยังเป็น ep-frosty-lab", () => { eq(run({ POS_QC_ALLOW_HOST: SVC_HOST }).mark, "ep-frosty-lab", "mark"); });
    await st("E-3", "QC_BRANCH=qc-svc แต่ ALLOW ว่าง/ไม่ตรงตัว ⇒ ยังเป็น ep-frosty-lab", () => {
      eq(run({ QC_BRANCH: "qc-svc" }).mark, "ep-frosty-lab", "ALLOW ว่าง");
      eq(run({ QC_BRANCH: "qc-svc", POS_QC_ALLOW_HOST: "ep-mute-scene-x" }).mark, "ep-frosty-lab", "ALLOW ไม่ตรงตัว");
    });
    await st("E-4", "ด่าน prod เดิมยังอยู่: ใต้ env ของ qc-svc แต่ DATABASE_URL ชี้ production ⇒ loadPosQcEnv exit 4", () => {
      const prod = "postgresql://qc:qc@ep-royal-night-x1-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
      const r = run({ ...svc, DATABASE_URL: prod, DIRECT_URL: prod }, true);
      ok(r.code === 4 && !r.loaded, `exit=${r.code} loaded=${r.loaded}`);
    });
  } finally {
    try { unlinkSync(probe); } catch { /* ไม่มีก็ได้ */ }
  }
}

// ═══════════════ F. scope + client ═══════════════
console.log("\n── F: scope registry + Prisma client ──");
const NEW_MODELS = ["BookingStaffService", "SvcResource"];
await st("F-1", "โมเดลใหม่ BookingStaffService · SvcResource อยู่ใน prisma/schema", () => {
  const all = readdirSync(join(ROOT, "prisma/schema")).filter((f) => f.endsWith(".prisma")).map((f) => readFileSync(join(ROOT, "prisma/schema", f), "utf8")).join("\n");
  const miss = NEW_MODELS.filter((m) => !new RegExp(`^model\\s+${m}\\s*\\{`, "m").test(all));
  ok(miss.length === 0, `ขาด: ${miss.join(", ")}`);
});
await st("F-2", "scope.ts: BookingStaffService · SvcResource = unit (fitness F1)", async () => {
  const scope = await tryImport<{ scopeOf: (m: string) => { axis: string } }>("@/lib/core/scope");
  if (!scope.mod) throw new AssertFail(`โหลด scope.ts ไม่ได้ (${scope.err})`);
  const bad: string[] = [];
  for (const m of NEW_MODELS) { let a = "(ไม่ลงทะเบียน)"; try { a = scope.mod.scopeOf(m).axis; } catch { /* โยน */ } if (a !== "unit") bad.push(`${m}=${a}`); }
  ok(bad.length === 0, bad.join(" · "));
});
await st("F-3", "Prisma client generate แล้ว: โมเดลใหม่ + Appointment.kind/policySnapshot · QueueTicket.etaAt · PosHeldCart.serviceJobId · PosSaleLine.performerEmployeeId · PosStaffCommission.employeeId + boot assert ผ่าน", async () => {
  const c = await tryImport<{ Prisma: { dmmf: { datamodel: { models: { name: string; fields: { name: string }[] }[]; enums: { name: string; values: { name: string }[] }[] } } } }>("@prisma/client");
  if (!c.mod) throw new AssertFail(`import @prisma/client ไม่ได้ (${c.err})`);
  const dm = c.mod.Prisma.dmmf.datamodel;
  const f = (m: string) => new Set(dm.models.find((x) => x.name === m)?.fields.map((x) => x.name) ?? []);
  const need: [string, string][] = [["Appointment", "kind"], ["Appointment", "policySnapshot"], ["Appointment", "manageTokenHash"], ["QueueTicket", "etaAt"], ["PosHeldCart", "serviceJobId"], ["PosSaleLine", "performerEmployeeId"], ["PosStaffCommission", "employeeId"]];
  const miss = [...NEW_MODELS.filter((m) => !dm.models.some((x) => x.name === m)), ...need.filter(([m, k]) => !f(m).has(k)).map(([m, k]) => `${m}.${k}`)];
  // ORACLE-EDIT B.0-F3 (ผู้คุม 28 ต.ค.): Prisma 7.8 ให้ dmmf.datamodel.enums ว่างเสมอ ⇒ อ่านจาก export enum ของ client แทน
  const enumObj = (c.mod as unknown as { AppointmentStatus?: Record<string, string> }).AppointmentStatus ?? {};
  const st3 = Object.values(enumObj);
  if (!["QUEUED", "IN_SERVICE", "LATE"].every((v) => st3.includes(v))) miss.push("AppointmentStatus ค่าใหม่");
  ok(miss.length === 0, `client ขาด: ${miss.join(", ")}`);
  const scope = await tryImport<{ assertRegistryComplete: (m: string[]) => void }>("@/lib/core/scope");
  if (!scope.mod) throw new AssertFail(`โหลด scope.ts ไม่ได้ (${scope.err})`);
  scope.mod.assertRegistryComplete(dm.models.map((m) => m.name));
});

// ═══════════════ M. migration ═══════════════
console.log("\n── M: migration svc_b ──");
const migDir = join(ROOT, "prisma", "migrations");
const migs = readdirSync(migDir).filter((d) => /^\d{14}_/.test(d)).sort();
const mB = migs.filter((d) => /^\d{14}_svc_b$/.test(d));
const migName = mB.length === 1 ? mB[0] : "";
const OWN_TABLES = new Set(["Appointment", "BookingStaffService", "SvcResource", "QueueTicket", "PosHeldCart", "PosSaleLine", "PosStaffCommission"]);
let stmts: string[] = [];
const laterSvc = migName ? migs.slice(migs.indexOf(migName) + 1) : [];
await st("M-1", "มีโฟลเดอร์ `<ts>_svc_b` ตัวเดียว · ts มากกว่า svc_r0b · หลังจากนี้มีได้แค่ migration ของ SVC ใบหลัง (`_svc_*`)", () => {
  ok(mB.length === 1, `พบ ${mB.length}: ${mB.join(", ")}`);
  ok(migName > R0B, `${migName} ต้องเรียงหลัง ${R0B}`);
  const alien = laterSvc.filter((d) => !/_svc_[a-z0-9]+$/.test(d));
  ok(alien.length === 0, `มี migration ที่ไม่ใช่ SVC หลัง svc_b: ${alien.join(", ")}`);
});
// ข้อที่เทียบ git กับ BASE ใช้ตอนรับ B.0 · มี migration SVC ใบหลังแล้ว ⇒ SKIP พร้อมเหตุผล (แบบ R0.1 M-4)
const acceptOnly = async (id: string, name: string, fn: () => void, sev: Sev = "CRITICAL") =>
  laterSvc.length ? skip(id, name, `มี migration SVC ใบหลังแล้ว (${laterSvc[0]}) — ข้อนี้ตรวจเฉพาะตอนรับ B.0`, sev) : st(id, name, fn, sev);
if (migName) {
  const code = readFileSync(join(migDir, migName, "migration.sql"), "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  stmts = code.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const needMig = async (id: string, name: string, fn: () => void, sev: Sev = "CRITICAL") => (migName ? st(id, name, fn, sev) : skip(id, name, "ไม่มี migration svc_b", sev));
await needMig("M-2", "SQL additive ล้วน (ไม่มี DROP/RENAME/เปลี่ยนชนิด/SET NOT NULL/NOT NULL ไร้ DEFAULT/UPDATE/DELETE · ALTER TYPE = ADD VALUE ต่อท้ายเท่านั้น)", () => {
  const bad: string[] = [];
  for (const s of stmts) {
    if (/\bDROP\b/i.test(s)) bad.push(`DROP: ${s.slice(0, 80)}`);
    if (/\bRENAME\b/i.test(s)) bad.push(`RENAME: ${s.slice(0, 80)}`);
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE/i.test(s)) bad.push(`เปลี่ยนชนิด: ${s.slice(0, 80)}`);
    if (/SET\s+NOT\s+NULL/i.test(s)) bad.push(`SET NOT NULL: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && !/ADD\s+VALUE/i.test(s)) bad.push(`ALTER TYPE: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TYPE/i.test(s) && /\b(BEFORE|AFTER)\b/i.test(s)) bad.push(`ADD VALUE ไม่ต่อท้าย: ${s.slice(0, 80)}`);
    if (/^ALTER\s+TABLE/i.test(s)) for (const add of s.split(/,\s*(?=ADD\s+COLUMN)/i)) if (/ADD\s+COLUMN/i.test(add) && /NOT\s+NULL/i.test(add) && !/DEFAULT/i.test(add)) bad.push(`NOT NULL ไร้ DEFAULT: ${add.slice(0, 80)}`);
    if (/^(DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(s)) bad.push(`แก้ข้อมูล: ${s.slice(0, 80)}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-3", "SQL แตะเฉพาะตารางของใบ (Appointment · BookingStaffService · SvcResource · QueueTicket · PosHeldCart · PosSaleLine · PosStaffCommission) + type AppointmentStatus (diff ผิดฐาน/drift HR ⇒ แดง)", () => {
  const bad: string[] = [];
  for (const s of stmts) {
    if (/^ALTER\s+TYPE\s+"AppointmentStatus"/i.test(s)) continue;
    const m = s.match(/^(?:ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?"?[\w]+"?\s+ON)\s+(?:ONLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/i);
    if (!m) { bad.push(`ไม่รู้จัก: ${s.slice(0, 70)}`); continue; }
    if (!OWN_TABLES.has(m[1])) bad.push(`${m[1]}: ${s.slice(0, 60)}`);
    const ref = s.match(/REFERENCES\s+"?(\w+)"?/i)?.[1];
    if (ref && !["BookingStaff", "BookingService"].includes(ref)) bad.push(`FK → ${ref}`);
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" | "));
});
await needMig("M-4", "enum AppointmentStatus: ADD VALUE 'QUEUED' · 'IN_SERVICE' · 'LATE' ตามลำดับ", () => {
  const adds = stmts.filter((s) => /^ALTER\s+TYPE\s+"AppointmentStatus"\s+ADD\s+VALUE/i.test(s)).map((s) => s.match(/ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'(\w+)'/i)?.[1]);
  eq(adds, ["QUEUED", "IN_SERVICE", "LATE"], "ADD VALUE");
});
await needMig("M-POS", "POS ใน SQL มีแค่ 3 คอลัมน์ (serviceJobId · performerEmployeeId · employeeId) + partial unique บิลพัก + ดัชนีค่าคอมฯ · ไม่มีดัชนีบน PosSaleLine", () => {
  const allow: RegExp[] = [
    /^ALTER TABLE "PosHeldCart" ADD COLUMN "serviceJobId" TEXT$/i,
    /^ALTER TABLE "PosSaleLine" ADD COLUMN "performerEmployeeId" TEXT$/i,
    /^ALTER TABLE "PosStaffCommission" ADD COLUMN "employeeId" TEXT$/i,
    /^CREATE UNIQUE INDEX (IF NOT EXISTS )?"?\w+"? ON "PosHeldCart" ?\("serviceJobId"\) WHERE .+$/i,
    /^CREATE INDEX (IF NOT EXISTS )?"?\w+"? ON "PosStaffCommission" ?\("tenantId", ?"employeeId", ?"periodKey"\)$/i,
  ];
  const pos = stmts.filter((s) => /"Pos\w+"/.test(s));
  const bad = pos.filter((s) => !allow.some((r) => r.test(s)));
  ok(bad.length === 0, `POS นอกที่อนุญาต: ${bad.slice(0, 3).map((s) => s.slice(0, 90)).join(" | ")}`);
  ok(pos.length === 5, `POS ต้อง 5 statement พอดี (ได้ ${pos.length})`);
});
await acceptOnly("M-6", "schema แตะเฉพาะ booking.prisma · queue.prisma · pos.prisma + ไม่ลบ/แก้บรรทัดเดิม (ไม่ prisma format ทั้งชุด)", () => {
  const ch = changedFiles(["prisma/schema"]).map((p) => p.split("/").pop() ?? p);
  const outside = ch.filter((f) => !["booking.prisma", "queue.prisma", "pos.prisma"].includes(f));
  const del = deletedLines(["prisma/schema"]);
  ok(ch.length > 0, "schema ยังไม่ถูกแก้");
  ok(outside.length === 0 && del.length === 0, `${outside.length ? `ไฟล์นอกใบ: ${outside.join(", ")} ` : ""}${del.length ? `ลบบรรทัด: ${del.join(", ")}` : ""}`);
}, "MAJOR");
await acceptOnly("M-7", "pos.prisma: บรรทัดเพิ่มอ้างแค่ serviceJobId · performerEmployeeId · employeeId (+คอมเมนต์/ดัชนี)", () => {
  const diff = git(["diff", "-w", "--ignore-blank-lines", "-U0", BASE_SHA, "--", "prisma/schema/pos.prisma"]);
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).replace(/\/\/.*$/, "").trim()).filter(Boolean);
  const bad = added.filter((l) => !/^(serviceJobId|performerEmployeeId|employeeId)\s+String\?/.test(l) && !/^@@index\(\[tenantId,\s*employeeId,\s*periodKey\]\)$/.test(l));
  ok(added.length >= 3, `บรรทัดเพิ่มใน pos.prisma ${added.length} (ต้องมี 3 คอลัมน์)`);
  ok(bad.length === 0, `บรรทัด POS นอกที่อนุญาต: ${bad.slice(0, 3).join(" | ")}`);
});

// ═══════════════ ต่อฐาน ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
async function insertRow(table: string, vals: Record<string, unknown>, client: pg.Pool | pg.PoolClient = pool): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : t === "USER-DEFINED" ? null : null;
  }
  const keys = Object.keys(v);
  await client.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const tryCode = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return pgCode(e) || errMsg(e); } };

const SLUG = "qc-svc-b0-";
const USER_MAIL = "qc-svc-b0-";
const tenantIds: string[] = [];
const CLEAN_TABLES = ["SettingChange", "SettingValue", "SettingProfile", "OutboxEvent", "AuditLog", "Membership", "Appointment", "BookingStaffService", "SvcResource", "BookingStaffHours", "BookingStaff", "BookingService", "PosHeldCart", "BusinessUnit"];
async function cleanup(ids: string[]) {
  if (!ids.length) return;
  const existing = new Set((await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).map((r) => r.table_name));
  for (const t of CLEAN_TABLES) {
    if (!existing.has(t)) continue;
    try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ ${t}: ${errMsg(e)}`); }
  }
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [ids]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupUsers() {
  try { await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]); await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]); } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

let db: Db | null = null;
try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`\n(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ═══════════════ T. ตาราง/คอลัมน์ ═══════════════
  console.log("\n── T: ตาราง/คอลัมน์ (ใบสั่ง §2) ──");
  type Col = { t: string; n: boolean; d?: string };
  const TS = "timestamp without time zone";
  const S = (n = false, d?: string): Col => ({ t: "text", n, d });
  const I = (n = false, d?: string): Col => ({ t: "integer", n, d });
  const D = (n = false, d?: string): Col => ({ t: TS, n, d });
  const SPEC: [string, string, Record<string, Col>, boolean][] = [
    ["T-1", "Appointment (คอลัมน์ใหม่ 19)", {
      kind: S(false, "BOOKED"), assignMode: S(false, "SPECIFIC"), channel: S(true), checkedInAt: D(true), startedAt: D(true), doneAt: D(true), lateAt: D(true), plannedStartAt: D(true),
      plannedStaffId: S(true), resourceId: S(true), groupId: S(true), queueTicketId: S(true), manageTokenHash: S(true), heldCartId: S(true), rescheduledFromId: S(true),
      rescheduleCount: I(false, "0"), cancelReason: S(true), policySnapshot: { t: "jsonb", n: true },
    }, false],
    ["T-3", "BookingStaffService (ตารางใหม่)", { id: S(), tenantId: S(), unitId: S(), staffId: S(), serviceId: S(), durationMin: I(true), priceSatang: I(true), createdAt: D(false, "CURRENT_TIMESTAMP"), updatedAt: D() }, true],
    ["T-4", "SvcResource (ตารางใหม่)", { id: S(), tenantId: S(), unitId: S(), kind: S(), name: S(), capacity: I(false, "1"), cleanupMin: I(false, "0"), active: { t: "boolean", n: false, d: "true" }, sortOrder: I(false, "0"), createdAt: D(false, "CURRENT_TIMESTAMP"), updatedAt: D() }, true],
    ["T-5", "QueueTicket.etaAt", { etaAt: D(true) }, false],
    ["T-6", "PosHeldCart.serviceJobId (POS จุดที่ 1)", { serviceJobId: S(true) }, false],
    ["T-7", "PosSaleLine.performerEmployeeId (POS จุดที่ 2)", { performerEmployeeId: S(true) }, false],
    ["T-8", "PosStaffCommission.employeeId (CC §10 ข้อ 2)", { employeeId: S(true) }, false],
  ];
  for (const [id, name, spec, exact] of SPEC) {
    const table = name.split(/[ .]/)[0];
    await st(id, name, async () => {
      const have = new Map((await cols(table)).map((c) => [c.column_name, c]));
      ok(have.size > 0, `ไม่มีตาราง ${table}`);
      const probs: string[] = [];
      for (const [c, w] of Object.entries(spec)) {
        const h = have.get(c);
        if (!h) { probs.push(`ขาด ${c}`); continue; }
        if (h.data_type !== w.t) probs.push(`${c}: ${h.data_type}≠${w.t}`);
        if ((h.is_nullable === "YES") !== w.n) probs.push(`${c}: ${w.n ? "ต้อง null ได้" : "ต้อง NOT NULL"}`);
        if (w.d && !(h.column_default ?? "").includes(w.d)) probs.push(`${c}: default ${h.column_default ?? "(ไม่มี)"}≠${w.d}`);
      }
      if (exact) { const extra = [...have.keys()].filter((c) => !(c in spec)); if (extra.length) probs.push(`คอลัมน์เกินใบสั่ง: ${extra.join(", ")}`); }
      ok(probs.length === 0, probs.slice(0, 5).join(" · "));
    });
  }
  await st("T-2", "Appointment คอลัมน์เดิมคงครบ + ชนิดเดิม (staffId ยัง NOT NULL · status enum · priceSatang default -1)", async () => {
    const have = new Map((await cols("Appointment")).map((c) => [c.column_name, c]));
    const probs: string[] = [];
    const want: [string, string, boolean][] = [["id", "text", false], ["tenantId", "text", false], ["unitId", "text", false], ["customerId", "text", true], ["staffId", "text", false], ["serviceId", "text", false],
      ["startAt", TS, false], ["endAt", TS, false], ["status", "USER-DEFINED", false], ["customerName", "text", false], ["customerPhone", "text", false], ["source", "text", false],
      ["priceSatang", "integer", false], ["depositSatang", "integer", false], ["depositPaidAt", TS, true], ["depositSaleId", "text", true], ["idempotencyKey", "text", true], ["stampEventId", "text", true], ["partyId", "text", true]];
    for (const [c, t, n] of want) { const h = have.get(c); if (!h) probs.push(`หาย ${c}`); else if (h.data_type !== t || (h.is_nullable === "YES") !== n) probs.push(`${c} เปลี่ยน`); }
    ok((have.get("priceSatang")?.column_default ?? "").includes("-1"), "priceSatang default เปลี่ยน");
    ok(probs.length === 0, probs.join(", "));
  });

  // ═══════════════ I. ดัชนี ═══════════════
  console.log("\n── I: ดัชนี ──");
  type IxRow = { name: string; uniq: boolean; cols: string[]; pred: string | null };
  const ixOf = (table: string) => q<IxRow>(
    `SELECT i.relname AS name, ix.indisunique AS uniq,
            ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
            pg_get_expr(ix.indpred, ix.indrelid) AS pred
       FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
      WHERE t.relname = $1 AND ns.nspname = current_schema()`, [table]);
  const IDX: [string, string, string[], boolean][] = [
    ["I-1", "BookingStaffService", ["staffId", "serviceId"], true],
    ["I-2", "BookingStaffService", ["tenantId", "unitId"], false],
    ["I-3", "SvcResource", ["unitId", "name"], true],
    ["I-4", "SvcResource", ["tenantId", "unitId"], false],
    ["I-5", "Appointment", ["manageTokenHash"], true],
    ["I-6", "Appointment", ["groupId"], false],
    ["I-7", "Appointment", ["queueTicketId"], false],
    ["I-8", "PosStaffCommission", ["tenantId", "employeeId", "periodKey"], false],
  ];
  for (const [id, table, c, u] of IDX) {
    await st(id, `${table} ${u ? "@@unique" : "@@index"}(${c.join(", ")})`, async () => {
      const rows = await ixOf(table);
      ok(rows.some((r) => r.pred === null && r.uniq === u && r.cols.join(",") === c.join(",")), rows.length ? "ไม่พบดัชนีตรงคอลัมน์/ลำดับ" : "ไม่มีตาราง");
    });
  }
  await st("I-9", "PosHeldCart partial unique (serviceJobId) WHERE status = 'HELD' AND serviceJobId IS NOT NULL", async () => {
    const rows = await ixOf("PosHeldCart");
    ok(rows.some((r) => r.uniq && r.cols.join(",") === "serviceJobId" && /HELD/.test(r.pred ?? "") && /"serviceJobId" IS NOT NULL/i.test(r.pred ?? "")), "ไม่พบ");
  });
  await st("I-10", "PosSaleLine ไม่มีดัชนีใหม่บน performerEmployeeId (ตารางใหญ่ — ห้ามใน migration)", async () => {
    const rows = await ixOf("PosSaleLine");
    ok(!rows.some((r) => r.cols.includes("performerEmployeeId")), "มีดัชนีบน performerEmployeeId");
  }, "MAJOR");

  // ═══════════════ K. FK ═══════════════
  await st("K-1", "FK: BookingStaffService.staffId→BookingStaff (CASCADE) · serviceId→BookingService (CASCADE) · ไม่มี FK อื่นจากตาราง/คอลัมน์ใหม่", async () => {
    const fks = await q<{ src: string; dst: string; cols: string[]; del: string }>(
      `SELECT t.relname AS src, r.relname AS dst, c.confdeltype AS del,
              ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace ns ON ns.oid = t.relnamespace
        WHERE c.contype = 'f' AND ns.nspname = current_schema() AND t.relname = ANY($1::text[])`,
      [[...OWN_TABLES]]);
    const NEWCOLS = new Set(["kind", "assignMode", "channel", "plannedStaffId", "resourceId", "groupId", "queueTicketId", "manageTokenHash", "heldCartId", "rescheduledFromId", "etaAt", "serviceJobId", "performerEmployeeId", "employeeId"]);
    const rel = fks.filter((f) => NEW_MODELS.includes(f.src) || f.cols.some((c) => NEWCOLS.has(c)));
    const sig = rel.map((f) => `${f.src}.${f.cols.join("+")}->${f.dst}:${f.del}`).sort();
    eq(sig, ["BookingStaffService.serviceId->BookingService:c", "BookingStaffService.staffId->BookingStaff:c"], "FK");
  });

  // ═══════════════ N. enum ═══════════════
  await st("N-1", "AppointmentStatus = 6 ค่าเดิมคงลำดับ + QUEUED · IN_SERVICE · LATE ต่อท้าย", async () => {
    const en = (await q<{ l: string }>(`SELECT e.enumlabel AS l FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AppointmentStatus' ORDER BY e.enumsortorder`)).map((r) => r.l);
    eq(en, ["PENDING", "CONFIRMED", "ARRIVED", "DONE", "NO_SHOW", "CANCELLED", "QUEUED", "IN_SERVICE", "LATE"], "enum");
  });
  await st("N-2", "booking.prisma: 3 ค่าใหม่อยู่ท้าย enum AppointmentStatus · Appointment.status ค่าเริ่ม CONFIRMED เดิม", async () => {
    const src = readFileSync(join(ROOT, "prisma/schema/booking.prisma"), "utf8");
    const vals = (src.match(/enum AppointmentStatus \{([\s\S]*?)\}/)?.[1] ?? "").split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
    eq(vals.slice(-3), ["QUEUED", "IN_SERVICE", "LATE"], "ท้าย enum");
    const d = (await cols("Appointment")).find((c) => c.column_name === "status")?.column_default ?? "";
    ok(d.includes("CONFIRMED"), `status default = ${d}`);
  });

  // ═══════════════ M-5 ลงฐาน ═══════════════
  let migAt: Date | null = null;
  if (migName) {
    await st("M-5", `migration ${migName} ลง qc-svc แล้ว (migrate deploy · finished · ไม่ rolled back)`, async () => {
      const m = await q<{ finished_at: Date | null; rolled_back_at: Date | null }>(`SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1`, [migName]);
      ok(m.length === 1 && m[0].finished_at !== null && m[0].rolled_back_at === null, `แถว ${m.length}`);
      migAt = m[0].finished_at;
    });
  } else skip("M-5", "migration svc_b ลง qc-svc แล้ว", "ไม่มี migration svc_b");

  // ═══════════════ fixture ═══════════════
  const tA = rid("ta");
  const uA = rid("ua");
  const ST1 = rid("st1");
  const ST2 = rid("st2");
  const SV1 = rid("sv1");
  await insertRow("Tenant", { id: tA, name: "QC SVC B.0 ร้านตัดผม", slug: `${SLUG}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, updatedAt: new Date() });
  tenantIds.push(tA);
  await insertRow("BusinessUnit", { id: uA, tenantId: tA, type: "BOOKING", name: "สาขาทดสอบ B.0", slug: `u-b0-${Date.now().toString(36)}`, updatedAt: new Date() });
  await insertRow("BookingStaff", { id: ST1, tenantId: tA, unitId: uA, name: "ช่างเอก", updatedAt: new Date() });
  await insertRow("BookingStaff", { id: ST2, tenantId: tA, unitId: uA, name: "ช่างบี", updatedAt: new Date() });
  await insertRow("BookingService", { id: SV1, tenantId: tA, unitId: uA, name: "ตัดผมชาย", durationMin: 30, updatedAt: new Date() });
  const t0 = new Date(Date.now() + 3 * 86_400_000);
  const oldAppt = (extra: Record<string, unknown> = {}, client: pg.Pool | pg.PoolClient = pool) => {
    const id = rid("ap");
    return insertRow("Appointment", { id, tenantId: tA, unitId: uA, staffId: ST1, serviceId: SV1, startAt: t0, endAt: new Date(t0.getTime() + 1_800_000), customerName: "QC ลูกค้า", customerPhone: "+66800000000", updatedAt: new Date(), ...extra }, client).then(() => id);
  };

  // ═══════════════ CK. CHECK ═══════════════
  console.log("\n── CK: CHECK constraint (SQL มือ) ──");
  await st("CK-1", "Appointment.kind นอก BOOKED/WALKIN ⇒ 23514 · WALKIN ได้", async () => {
    eq(await tryCode(() => oldAppt({ kind: "VIP" })), "23514", "kind=VIP");
    eq(await tryCode(() => oldAppt({ kind: "WALKIN" })), "", "kind=WALKIN");
  });
  await st("CK-2", "Appointment.assignMode นอก SPECIFIC/ANY ⇒ 23514 · ANY ได้", async () => {
    eq(await tryCode(() => oldAppt({ assignMode: "RANDOM" })), "23514", "assignMode=RANDOM");
    eq(await tryCode(() => oldAppt({ assignMode: "ANY" })), "", "assignMode=ANY");
  });
  await st("CK-3", "Appointment.rescheduleCount < 0 ⇒ 23514", async () => { eq(await tryCode(() => oldAppt({ rescheduleCount: -1 })), "23514", "rescheduleCount=-1"); });
  await st("CK-4", "BookingStaffService: durationMin ≤ 0 ⇒ 23514 · priceSatang < 0 ⇒ 23514 · null ได้", async () => {
    eq(await tryCode(() => insertRow("BookingStaffService", { id: rid("m"), tenantId: tA, unitId: uA, staffId: ST1, serviceId: SV1, durationMin: 0, updatedAt: new Date() })), "23514", "durationMin=0");
    eq(await tryCode(() => insertRow("BookingStaffService", { id: rid("m"), tenantId: tA, unitId: uA, staffId: ST1, serviceId: SV1, priceSatang: -1, updatedAt: new Date() })), "23514", "priceSatang=-1");
    eq(await tryCode(() => insertRow("BookingStaffService", { id: rid("m"), tenantId: tA, unitId: uA, staffId: ST2, serviceId: SV1, updatedAt: new Date() })), "", "null/null");
  });
  await st("CK-5", "SvcResource: capacity < 1 ⇒ 23514 · cleanupMin < 0 ⇒ 23514", async () => {
    eq(await tryCode(() => insertRow("SvcResource", { id: rid("r"), tenantId: tA, unitId: uA, kind: "BED", name: `เตียง ${rid("n")}`, capacity: 0, updatedAt: new Date() })), "23514", "capacity=0");
    eq(await tryCode(() => insertRow("SvcResource", { id: rid("r"), tenantId: tA, unitId: uA, kind: "BED", name: `เตียง ${rid("n")}`, cleanupMin: -5, updatedAt: new Date() })), "23514", "cleanupMin=-5");
  });

  // ═══════════════ O. ข้อมูลเดิม + พฤติกรรม ═══════════════
  console.log("\n── O: ข้อมูลเดิมยังอ่านได้ · ค่าเริ่มของแถวแบบเดิม · บิลพัก 1 งาน = 1 ใบ ──");
  await st("O-1", "INSERT แบบโค้ดเดิม (ไม่ส่งคอลัมน์ใหม่) ⇒ kind=BOOKED · assignMode=SPECIFIC · rescheduleCount=0 · status=CONFIRMED · ที่เหลือ null", async () => {
    const id = await oldAppt();
    const [r] = await q<Record<string, unknown>>(`SELECT kind, "assignMode", "rescheduleCount", status::text AS status, channel, "policySnapshot", "manageTokenHash", "plannedStartAt" FROM "Appointment" WHERE id = $1`, [id]);
    eq(r, { kind: "BOOKED", assignMode: "SPECIFIC", rescheduleCount: 0, status: "CONFIRMED", channel: null, policySnapshot: null, manageTokenHash: null, plannedStartAt: null }, "แถว");
  });
  await st("O-2", "แถวที่มีก่อน migration: Appointment ทุกแถว kind=BOOKED/assignMode=SPECIFIC/สถานะเดิม · QueueTicket.etaAt · PosHeldCart.serviceJobId · PosSaleLine.performerEmployeeId · PosStaffCommission.employeeId เป็น null", async () => {
    ok(migAt !== null, "ไม่รู้เวลา migration (M-5)");
    const at = migAt as unknown as Date;
    const [a] = await q<{ n: number; bad: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE kind <> 'BOOKED' OR "assignMode" <> 'SPECIFIC' OR "rescheduleCount" <> 0 OR status::text IN ('QUEUED','IN_SERVICE','LATE') OR "policySnapshot" IS NOT NULL)::int AS bad FROM "Appointment" WHERE "createdAt" < $1`, [at]);
    const [qt] = await q<{ n: number; bad: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE "etaAt" IS NOT NULL)::int AS bad FROM "QueueTicket" WHERE "createdAt" < $1`, [at]);
    const [hc] = await q<{ n: number; bad: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE "serviceJobId" IS NOT NULL)::int AS bad FROM "PosHeldCart" WHERE "createdAt" < $1`, [at]);
    const [sl] = await q<{ n: number; bad: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE l."performerEmployeeId" IS NOT NULL)::int AS bad FROM "PosSaleLine" l JOIN "PosSale" s ON s.id = l."saleId" WHERE s."createdAt" < $1`, [at]);
    const [cm] = await q<{ n: number; bad: number }>(`SELECT count(*)::int AS n, count(*) FILTER (WHERE "employeeId" IS NOT NULL)::int AS bad FROM "PosStaffCommission" WHERE "createdAt" < $1`, [at]);
    console.log(`     ℹ️ แถวเดิม: นัด ${a.n} · บัตรคิว ${qt.n} · บิลพัก ${hc.n} · บรรทัดขาย ${sl.n} · ค่าคอมฯ ${cm.n}`);
    eq([a.bad, qt.bad, hc.bad, sl.bad, cm.bad], [0, 0, 0, 0, 0], "แถวเดิมที่ค่าใหม่ไม่ใช่ค่าเริ่ม [นัด, บัตร, บิลพัก, บรรทัด, ค่าคอมฯ]");
  });
  await st("O-3", "Prisma client อ่านข้อมูลเดิมได้ทุกตาราง (Appointment+staff/service · QueueTicket · PosHeldCart · PosSaleLine · PosStaffCommission)", async () => {
    const m = await tryImport<{ prisma: unknown }>("@/lib/core/db");
    if (!m.mod) throw new AssertFail(`โหลด @/lib/core/db ไม่ได้ (${m.err})`);
    db = m.mod.prisma as Db;
    const reads: [string, () => Promise<unknown>][] = [
      ["appointment", () => db!.appointment.findMany({ take: 50, orderBy: { createdAt: "asc" }, include: { staff: true, service: true } })],
      ["queueTicket", () => db!.queueTicket.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
      ["posHeldCart", () => db!.posHeldCart.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
      ["posSaleLine", () => db!.posSaleLine.findMany({ take: 50 })],
      ["posStaffCommission", () => db!.posStaffCommission.findMany({ take: 50, orderBy: { createdAt: "asc" } })],
    ];
    const bad: string[] = [];
    for (const [n, f] of reads) { try { await f(); } catch (e) { bad.push(`${n}: ${errMsg(e).slice(0, 120)}`); } }
    ok(bad.length === 0, bad.join(" | "));
    const rows = await db.appointment.findMany({ where: { tenantId: tA }, take: 5 });
    ok(rows.length > 0 && rows.every((r) => typeof r.kind === "string"), "client ไม่คืน kind");
  });
  await st("O-4", "สถานะใหม่ใช้ได้ (QUEUED/IN_SERVICE/LATE) และไม่กระทบแถวสถานะเดิม", async () => {
    for (const s of ["QUEUED", "IN_SERVICE", "LATE"]) eq(await tryCode(() => oldAppt({ status: s, kind: "WALKIN", assignMode: "ANY" })), "", s);
    const [r] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND status::text = 'CONFIRMED'`, [tA]);
    ok(r.n >= 1, "แถว CONFIRMED หาย");
  });
  await st("O-5", "manageTokenHash ซ้ำ ⇒ 23505 · null หลายแถวได้", async () => {
    const h = rid("tok");
    eq(await tryCode(() => oldAppt({ manageTokenHash: h })), "", "ใบ 1");
    eq(await tryCode(() => oldAppt({ manageTokenHash: h })), "23505", "ใบ 2 hash เดียวกัน");
    eq(await tryCode(() => oldAppt({ manageTokenHash: null })), "", "null");
  });
  const held = (job: string | null, extra: Record<string, unknown> = {}, client: pg.Pool | pg.PoolClient = pool) =>
    insertRow("PosHeldCart", { id: rid("hc"), tenantId: tA, unitId: uA, systemId: rid("sys"), cartJson: "{}", lineCount: 1, approxTotalSatang: 90000, heldByUserId: "qc", serviceJobId: job, ...extra }, client);
  await st("O-6", "บิลพัก: งานเดียวกัน HELD 2 ใบ ⇒ 23505 · RECALLED/DISCARDED ซ้ำได้ · serviceJobId null หลายใบได้", async () => {
    const j = rid("job");
    eq(await tryCode(() => held(j)), "", "HELD ใบ 1");
    eq(await tryCode(() => held(j)), "23505", "HELD ใบ 2");
    eq(await tryCode(() => held(j, { status: "RECALLED" })), "", "RECALLED");
    eq(await tryCode(() => held(j, { status: "DISCARDED" })), "", "DISCARDED");
    eq(await tryCode(() => held(null)), "", "null 1");
    eq(await tryCode(() => held(null)), "", "null 2");
  });
  await st("O-7", "บิลพัก: ยิงพร้อมกัน 10 ทาง งานเดียวกัน ⇒ HELD 1 ใบ (X3)", async () => {
    const j = rid("job");
    const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
    let res: PromiseSettledResult<void>[] = [];
    try { res = await Promise.allSettled(clients.map((c) => held(j, {}, c))); } finally { for (const c of clients) c.release(); }
    const okN = res.filter((r) => r.status === "fulfilled").length;
    const dupN = res.filter((r) => r.status === "rejected" && pgCode(r.reason) === "23505").length;
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "PosHeldCart" WHERE "serviceJobId" = $1 AND status = 'HELD'`, [j]);
    eq([okN, dupN, n], [1, 9, 1], "[สำเร็จ, 23505, แถว HELD]");
  });
  await st("O-8", "BookingStaffService: คู่ช่าง×บริการซ้ำ ⇒ 23505 · ลบช่าง ⇒ แถวผูกหายตาม (CASCADE)", async () => {
    const st3 = rid("st3");
    await insertRow("BookingStaff", { id: st3, tenantId: tA, unitId: uA, name: "ช่างชั่วคราว", updatedAt: new Date() });
    eq(await tryCode(() => insertRow("BookingStaffService", { id: rid("m"), tenantId: tA, unitId: uA, staffId: st3, serviceId: SV1, priceSatang: 30000, updatedAt: new Date() })), "", "แถว 1");
    eq(await tryCode(() => insertRow("BookingStaffService", { id: rid("m"), tenantId: tA, unitId: uA, staffId: st3, serviceId: SV1, updatedAt: new Date() })), "23505", "แถวซ้ำ");
    await pool.query(`DELETE FROM "BookingStaff" WHERE id = $1`, [st3]);
    const [{ n }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "BookingStaffService" WHERE "staffId" = $1`, [st3]);
    eq(n, 0, "แถวค้างหลังลบช่าง");
  });

  // ═══════════════ S. ผ่านเครื่องยนต์ค่าตั้งจริง ═══════════════
  console.log("\n── S: ผ่านเครื่องยนต์ค่าตั้ง (applyTemplate · resolve · validateGroup ตอนบันทึก · สิทธิ์เงิน · snapshot) ──");
  const svc = defsLoad.mod ? await tryImport<SettingsApi>("@/lib/core/settings") : { mod: null, err: `ยังไม่มี defs/booking.ts` };
  const S_ = (): SettingsApi => { if (!svc.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${svc.err})`); return svc.mod; };
  const ctx: Ctx = { tenantId: tA };
  const RUN = Date.now().toString(36);
  const ownerId = `qc-b0-owner-${RUN}`;
  await insertRow("User", { id: ownerId, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B0 owner", updatedAt: new Date() }).catch((e) => console.log(`  ⚠️ สร้าง user: ${errMsg(e)}`));
  await insertRow("Membership", { id: rid("mb"), userId: ownerId, tenantId: tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() }).catch((e) => console.log(`  ⚠️ สร้าง membership: ${errMsg(e)}`));
  const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ownerId };
  const STAFF_EDIT: Actor = { role: "STAFF", unitAccess: [uA], permissions: { "booking.settings.edit": true }, userId: `qc-b0-staff-${RUN}` };
  const refs: Refs = { unitId: uA };
  const resolveAll = async (r: Refs) => S_().resolveSettings(ctx, ALL_KEYS, r);
  const expectTpl = (res: Record<string, Resolved>, tpl: string) => {
    const bad: string[] = [];
    for (const k of ALL_KEYS) {
      const want = dflt(DEF(k), tpl);
      if (!res[k]) bad.push(`${k}: ไม่มีผล`);
      else if (!isDeepStrictEqual(res[k].value, want)) bad.push(`${k}: ${fmt(res[k].value)}≠${fmt(want)}`);
    }
    return bad;
  };
  await st("S-1", "ร้านยังไม่เลือกแม่แบบ ⇒ resolve ได้ _fallback (ร้านเดิมไม่เปลี่ยนพฤติกรรม: singleLine=false · onlineSharePct=100)", async () => {
    const r = await resolveAll(refs);
    eq([r["booking.queue.singleLine"]?.value, r["booking.booking.onlineSharePct"]?.value, r["booking.queue.singleLine"]?.source], [false, 100, "FALLBACK"], "fallback");
  });
  await st("S-2", "applyTemplate BARBER ⇒ ทุกคีย์ resolve = ค่าตัดผมตามภาคผนวก (source TEMPLATE)", async () => {
    const a = await S_().applyTemplate(OWNER, ctx, { unitId: uA, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    ok(a.ok, `applyTemplate: ${a.code} ${fmt(a.issues)}`);
    const r = await resolveAll(refs);
    const bad = expectTpl(r, "BARBER");
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
    eq(r["booking.late.graceMin"]?.source, "TEMPLATE", "source");
  });
  await st("S-3", "applyTemplate SPA (RESET_ALL) ⇒ ทุกคีย์ = ค่าสปา", async () => {
    const a = await S_().applyTemplate(OWNER, ctx, { unitId: uA, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
    ok(a.ok, `applyTemplate: ${a.code} ${fmt(a.issues)}`);
    const bad = expectTpl(await resolveAll(refs), "SPA");
    ok(bad.length === 0, bad.slice(0, 4).join(" · "));
    const b = await S_().applyTemplate(OWNER, ctx, { unitId: uA, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
    ok(b.ok, "คืน BARBER ไม่ได้");
  });
  await st("S-4", "ชั้นช่าง/บริการ: % ออนไลน์ช่างเอก 0 (ช่างบียัง 60) · เลื่อนฟรีของบริการ 60 นาที (บริการอื่นยัง 180)", async () => {
    const r = await S_().setSettings(OWNER, ctx, [
      { key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: ST1, value: 0 },
      { key: "booking.late.freeChangeBeforeMin", scope: "SERVICE", scopeId: SV1, value: 60 },
    ]);
    ok(r.ok, `setSettings: ${r.code} ${fmt(r.issues)}`);
    const a = await S_().resolveSetting(ctx, "booking.booking.onlineSharePct", { unitId: uA, staffId: ST1 });
    const b = await S_().resolveSetting(ctx, "booking.booking.onlineSharePct", { unitId: uA, staffId: ST2 });
    const c = await S_().resolveSetting(ctx, "booking.late.freeChangeBeforeMin", { unitId: uA, serviceId: SV1 });
    const d = await S_().resolveSetting(ctx, "booking.late.freeChangeBeforeMin", { unitId: uA });
    eq([a.value, a.source, b.value, c.value, c.source, d.value], [0, "STAFF", 60, 60, "SERVICE", 180], "[เอก, ชั้น, บี, บริการ, ชั้น, สาขา]");
  });
  await st("S-5", "บันทึกค่าขัด (ผ่อนผัน 40 > ไม่มา 30) ⇒ ok:false VALIDATION + NO_SHOW_BEFORE_GRACE · แก้คู่กันในชุดเดียว (40/60) ⇒ ผ่าน", async () => {
    const bad = await S_().setSettings(OWNER, ctx, [{ key: "booking.late.graceMin", scope: "UNIT", scopeId: uA, value: 40 }]);
    ok(!bad.ok && bad.code === "VALIDATION" && (bad.issues ?? []).some((i) => i.code === "NO_SHOW_BEFORE_GRACE"), `ได้ ${fmt(bad)}`);
    eq((await S_().resolveSetting(ctx, "booking.late.graceMin", refs)).value, 10, "ค่าไม่ถูกเขียน");
    const good = await S_().setSettings(OWNER, ctx, [
      { key: "booking.late.graceMin", scope: "UNIT", scopeId: uA, value: 40 },
      { key: "booking.late.noShowAfterMin", scope: "UNIT", scopeId: uA, value: 60 },
    ]);
    ok(good.ok, `คู่ที่ถูกต้อง: ${fmt(good)}`);
  });
  await st("S-6", "สิทธิ์: พนักงานที่มี booking.settings.edit แก้ค่าทั่วไปได้ แต่แก้ค่ามัดจำ (MONEY) ไม่ได้ ⇒ PERMISSION", async () => {
    const a = await S_().setSettings(STAFF_EDIT, ctx, [{ key: "booking.queue.skipAfterMin", scope: "UNIT", scopeId: uA, value: 12 }]);
    ok(a.ok, `ค่าทั่วไป: ${fmt(a)}`);
    const b = await S_().setSettings(STAFF_EDIT, ctx, [{ key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: uA, value: 60 }]);
    ok(!b.ok && b.code === "PERMISSION", `ค่ามัดจำ: ${fmt(b)}`);
    eq((await S_().resolveSetting(ctx, "booking.deposit.payWithinMin", refs)).value, 15, "ค่ามัดจำต้องไม่เปลี่ยน");
  });
  await st("S-7", "snapshotPolicy(appointment) จดคีย์ SNAPSHOT_KEYS.appointment ครบ · ค่าตรงค่าปัจจุบันของสาขา · template BARBER", async () => {
    const s = await S_().snapshotPolicy(ctx, "appointment", refs);
    eq([s.v, s.domain, s.template?.key], [1, "booking", "BARBER"], "หัว snapshot");
    const miss = SNAP_REQUIRED.filter((k) => !hasOwn(s.values, k));
    ok(miss.length === 0, `ขาด ${miss.join(", ")}`);
    eq([s.values["booking.late.graceMin"], s.values["booking.late.noShowAfterMin"], s.values["booking.deposit.payWithinMin"]], [40, 60, 15], "ค่าที่จด");
  });
} catch (e) {
  record("CRASH", "จบกลางทาง: " + errMsg(e), "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  try {
    const left = tenantIds.length ? (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, [tenantIds]))[0].n : 0;
    console.log(`\n(ล้างแถวทดสอบ: tenant ค้าง ${left})`);
  } catch { /* ฐานหลุด */ }
  await pool.end();
  const dbx = db as Db | null;
  if (dbx) { try { await dbx.$disconnect(); } catch { /* ไม่เป็นไร */ } }
}

// ═══════════════ G. regression (process แยกทีละชุด · env เดียวกับข้อสอบนี้ = qc-svc) ═══════════════
console.log("\n── G: regression booking/queue + POS บิลพัก/ค่าคอมฯ + ชิ้นกลาง ──");
const REG_SUITES = ["qc-booking-deposit", "qc-booking-race", "qc-booking-edit-schedule", "qc-booking-hours-hr", "qc-hr-leave-booking", "qc-queue-public", "qc-pos-p1.5", "qc-pos-p2.4", "qc-pos-p3.5", "qc-svc-r0.3", "qc-svc-smoke"];
{
  const why = !migName ? "ยังไม่มี migration svc_b — regression รันเมื่อมีงานของใบให้ทดสอบ" : process.env.SVC_B0_NO_REGRESSION === "1" ? "ตั้ง SVC_B0_NO_REGRESSION=1" : "";
  for (const [i, s] of REG_SUITES.entries()) {
    const id = `G-${i + 1}`;
    const name = `${s} exit 0`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${s}.mts`], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const log = `/tmp/svc-b0-reg-${s}.log`;
    try { writeFileSync(log, `${r.stdout ?? ""}\n${r.stderr ?? ""}`); } catch { /* ไม่เป็นไร */ }
    const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, r.status === 0 ? "PASS" : "FAIL", r.status === 0 ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.0 · migration svc_b + defs/booking =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
