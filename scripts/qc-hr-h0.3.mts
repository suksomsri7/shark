// QC — HR H0.3 · ลงเวลา/kiosk ไม่รั่ว: ห้ามลงเวลาแทนคนอื่นโดยไม่มีสิทธิ์จัดการพนักงาน · ตัวจำกัดเดา PIN อยู่บน DB ·
//      แตะครั้งเดียว = แถวเดียว · AI pending_leaves คืนรหัสใบลา (D7a · D7b · D8 interim · D13a · D14 · X2)
// ⚠️ Oracle ภายใต้ change control — ผู้คุมงานเป็นเจ้าของ (brief: ledger/hr-briefs/hr-brief-H0.3.md §2 R1–R7 · §3)
//
// สัญญา (R1–R6):
// [S1] clockAction (ลงเวลาแทน) ต้องมี hr.employee.create เพิ่มจาก hr.attendance.clock · บัญชี kiosk (มีแต่ hr.attendance.clock) /
//      สมาชิกทั่วไป = ไม่เขียนอะไร · แถวที่ลงแทนมี note "ลงเวลาแทนโดย <ชื่อผู้กด>" · พนักงานพ้นสภาพ = ปฏิเสธ · หน้าจอซ่อนปุ่มจากคนไม่มีสิทธิ์
// [X2] พนักงานต้องเป็นของระบบ HR นี้ (clockAction · clock · kiosk)
// [S2] kiosk: checkRateLimitDb 2 ถัง — hr-kiosk:emp:<tenantId>:<employeeId> 5/60 s · hr-kiosk:sys:<tenantId>:<systemId> 60/60 s · ตรวจก่อนเทียบ PIN ·
//      ข้าม process ได้ (ถังอยู่ใน ChatRateBucket)
// [S3] setPinAction: hr-setpin:<tenantId>:<actorUserId> 10 ครั้ง/10 นาที
// [S4] clock = ธุรกรรมเดียว + pg_advisory_xact_lock('hr:clock:<employeeId>') · CLOCK_DEDUPE_SEC = 60 ·
//      kiosk: แถวล่าสุดอายุ < 60 s (ชนิดใดก็ได้) = ไม่เพิ่มแถว ตอบสำเร็จ "เพิ่งลงเวลา<เข้า/ออก>ไปเมื่อ hh:mm" · ทางตรง: ชนิดเดียวกัน < 60 s = ไม่เพิ่ม
// [S5] pending_leaves มี "รหัสใบลา" (ไม่มีเหตุผลการลา) → ป้อนให้ hr_decide_leave ได้ข้อเสนอของใบนั้น
// [S6] ด่านถอยหลัง: clockInDetail/judgeClockIn ไม่เปลี่ยน (hash) · ความเห็น HF-HR-0 ใน pending_leaves ยังอยู่ · ไม่มี checkRateLimit (in-memory) ใน hr/actions.ts
//
// รัน (VPS เท่านั้น · QC4):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.3.mts   (บังคับรันบนฐาน)
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.3.mts                  (SKIP exit 0 เมื่อยังไม่มีของ H0.3)
//   --list = พิมพ์ทะเบียนข้อสอบ ไม่แตะ DB
// action ถูกเรียกตัวจริงใน Next request scope จำลอง (workAsyncStorage + workUnitAsyncStorage + คุกกี้ session จริงในตาราง Session —
//   เทคนิคเดียวกับ qc-hf-o23 / qc-crm-v1) · ผู้ใช้แต่ละบทบาท = User + Membership + Session ชั่วคราวของร้านทดสอบ
// DB: ร้านชั่วคราว slug qc-hr-h0.3-<stamp> (ระบบ HR 3 ระบบ) · ลบทั้งหมดใน finally รวมแถว ChatRateBucket ที่ key มี id ของร้าน/ระบบ/พนักงาน/ผู้ใช้ · Z1 ตรวจไม่เหลือ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const SUITE = "qc-hr-h0.3";
const ROOT = process.cwd();
const MODE = process.argv[2] ?? "";
const LIST = MODE === "--list";
const FORCE = process.env.QC_FORCE === "1";
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h0.3-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ ทะเบียนข้อสอบ (id · กลุ่ม · ความรุนแรง · ฐานคาด · หัวข้อ) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Def = readonly [string, string, Sev, "RED" | "GREEN", string];
const D = (id: string, g: string, sev: Sev, base: "RED" | "GREEN", title: string): Def => [`H0.3-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  D("S1.1", "D7a", "MAJOR", "GREEN", "[action] OWNER ลงเวลาแทน (clockAction IN) → 1 แถวในระบบนี้"),
  D("S1.2", "D7a", "MAJOR", "GREEN", "[action] MANAGER ลงเวลาแทน → 1 แถว"),
  D("S1.3", "D7a", "MAJOR", "GREEN", "[action] STAFF ที่มี hr.employee.create (+ hr.attendance.clock) ลงเวลาแทน → 1 แถว"),
  D("S1.4", "D7a", "CRITICAL", "RED", "[action] 🔴 บัญชี kiosk (STAFF มีแต่ hr.attendance.clock) ลงเวลาแทน → ไม่มีแถว"),
  D("S1.5", "D7a", "CRITICAL", "GREEN", "[action] สมาชิกทั่วไป (ไม่มีคีย์ HR) ลงเวลาแทน → ไม่มีแถว"),
  D("S1.6", "D7a", "MAJOR", "RED", "[action] แถวที่ลงแทน (S1.1–S1.3) มี note \"ลงเวลาแทนโดย <ชื่อผู้กด>\""),
  D("S1.7", "R5", "MAJOR", "RED", "[action] พนักงานที่พ้นสภาพ (active=false) → ปฏิเสธ ไม่มีแถว"),
  D("S1.8", "D7a", "MAJOR", "RED", "[static] หน้าลงเวลา (HrAttendanceSection): ฟอร์ม clockAction อยู่หลังเงื่อนไขสิทธิ์จัดการพนักงาน (hr.employee.create / ตัวแปรสิทธิ์)"),
  D("X2.1", "X2", "CRITICAL", "RED", "[action] OWNER clockAction(ระบบ A, พนักงานของระบบ B) → ไม่มีแถว"),
  D("X2.2", "X2", "CRITICAL", "RED", "[service] clock(ctx ระบบ A, พนักงานของระบบ B) → ปฏิเสธ (throw/ไม่มี id) ไม่มีแถว"),
  D("X2.3", "X2", "MAJOR", "GREEN", "[action] kioskClockAction(ระบบ A, พนักงานของระบบ B, PIN ถูก) → error ไม่มีแถว"),
  D("S2.1", "D7b", "CRITICAL", "GREEN", "[action] kiosk: PIN ผิด 5 ครั้ง → ครั้งที่ 6 (PIN ถูก) ถูกปฏิเสธด้วย \"ลองใหม่ในอีก N วินาที\" ก่อนเทียบ PIN · ไม่มีแถว"),
  D("S2.2", "D7b", "CRITICAL", "RED", "[db] ถังอยู่ใน ChatRateBucket: key hr-kiosk:emp:<tenantId>:<employeeId> (count ≥ 5) + hr-kiosk:sys:<tenantId>:<systemId>"),
  D("S2.3", "D7b", "MAJOR", "RED", "[action] หลังหน้าต่างหมด (windowStart ของถังถูกย้อน 61 s) → PIN ถูกผ่าน · IN 1 แถว"),
  D("S2.4", "D7b", "CRITICAL", "RED", "[action] 🔴 ข้าม process: แม่ 3 ครั้ง + ลูก (tsx process แยก) 3 ครั้ง (ครั้งสุดท้าย PIN ถูก) → ผ่านตัวจำกัดรวม 5 · ครั้งที่ 6 ถูกปฏิเสธ · ไม่มีแถว"),
  D("S2.5", "D7b", "CRITICAL", "RED", "[action] 🔴 ถังระบบ: 60 ครั้งกระจาย 60 คน (ระบบ C) แล้วคนที่ 61 PIN ถูก → ถูกปฏิเสธ · ไม่มีแถว · ทั้งหมดภายใน 50 s"),
  D("S3.1", "D8", "CRITICAL", "RED", "[action] setPinAction ผู้กดคนเดียว 10 ครั้งผ่าน · ครั้งที่ 11 ถูกปฏิเสธ (status error · PIN ใน DB = ค่าครั้งที่ 10)"),
  D("S3.2", "D8", "MAJOR", "GREEN", "[action] ผู้กดอีกคน (OWNER) ทันทีหลัง S3.1 → ตั้ง PIN ได้ (ไม่โดนถังของคนอื่น)"),
  D("S3.3", "D8", "MAJOR", "RED", "[db] ถัง hr-setpin:<tenantId>:<actorUserId> อยู่ใน ChatRateBucket (count ≥ 10)"),
  D("S4.1", "D13a", "MAJOR", "GREEN", "[service] clockWithPin PIN ถูก 10 ครั้งพร้อมกัน × 3 รอบ → ทุกครั้งสำเร็จ · ไม่มีครั้งไหนตอบ OUT"),
  D("S4.2", "D13a", "CRITICAL", "RED", "[service] 🔴 หลัง S4.1 แต่ละรอบมี IN แถวเดียว (ไม่มี IN ซ้ำ ไม่มี OUT)"),
  D("S4.3", "D13a", "CRITICAL", "RED", "[service] 🔴 ข้าม process: 2 process × 5 ครั้งพร้อมกัน (นัดเวลาเดียวกัน) → แถวเดียว · ไม่มีใครตอบ OUT"),
  D("S4.4", "D13a", "CRITICAL", "RED", "[action] kiosk แตะซ้ำ 2 ครั้ง → ครั้งที่ 2 สำเร็จพร้อม \"เพิ่งลงเวลาเข้า…\" · แถวเดียว (ไม่กลายเป็น OUT)"),
  D("S4.5", "D13a", "MAJOR", "GREEN", "[service] พ้นหน้าต่างกันซ้ำ (แถวย้อน 61 s) → แตะอีกครั้งบันทึก OUT"),
  D("S4.6", "D13a", "CRITICAL", "RED", "[action] ทางตรง clockAction IN 10 ครั้งพร้อมกัน → IN แถวเดียว"),
  D("S4.7", "D13a", "MAJOR", "GREEN", "[action] ทางตรง IN แล้ว OUT ภายใน 60 s → บันทึกทั้งคู่ (ผู้จัดการแก้ได้)"),
  D("S4.8", "C.8", "MAJOR", "GREEN", "[service] process ลูก: pool ถูกจับไว้ 9/10 เส้น → clockWithPin ยังเสร็จใน 3 s และ commit จริง (ทุกคำสั่งในธุรกรรมใช้ tx client)"),
  D("S4.9", "D13a", "MAJOR", "RED", "[static] clock: tenantDb(ctx).$transaction + pg_advisory_xact_lock(hashtextextended('hr:clock:…')) · CLOCK_DEDUPE_SEC = 60"),
  D("S5.1", "D14", "CRITICAL", "RED", "[ai] pending_leaves: ทุกแถวมี รหัสใบลา = id ของใบลาที่รอ · ไม่มีเหตุผลการลา (คีย์/ข้อความ)"),
  D("S5.2", "D14", "CRITICAL", "RED", "[ai] ป้อน รหัสใบลา จาก pending_leaves ให้ hr_decide_leave → ข้อเสนอ (AiProposal) ของใบนั้น · summary มีชื่อพนักงาน"),
  D("S6.1", "R7", "CRITICAL", "GREEN", "[static] clockInDetail + judgeClockIn ไม่เปลี่ยน (sha256 เทียบฐาน afcb9bc3)"),
  D("S6.2", "D9", "CRITICAL", "GREEN", "[static] pending_leaves ยังมีความเห็น HF-HR-0 ▸ ไม่คืนเหตุผลการลา · ไม่อ่าน l.reason"),
  D("S6.3", "D14", "MAJOR", "RED", "[static] map ของ pending_leaves = พนักงาน/ประเภท/ตั้งแต่/ถึง/รหัสใบลา เท่านั้น · บรรทัด รหัสใบลา: l.id มีเครื่องหมาย HR H0.3 ▸"),
  D("S6.4", "D7b", "MAJOR", "RED", "[static] hr/actions.ts ไม่มี checkRateLimit (in-memory) · kiosk ใช้ checkRateLimitDb hr-kiosk:emp: + hr-kiosk:sys: ก่อน clockWithPin · setPinAction hr-setpin: ก่อน setPin"),
  D("S6.5", "D7a", "MAJOR", "RED", "[static] clockAction ตรวจ \"hr.employee.create\" (และยังตรวจ \"hr.attendance.clock\") ก่อน await clock("),
  D("Z1", "-", "CRITICAL", "GREEN", "คืนสภาพ: ร้าน qc-hr-h0.3-* ถูกลบ · ไม่เหลือ HrAttendance/HrEmployee/HrLeave/AiProposal ของร้าน · ไม่เหลือ ChatRateBucket ที่ key มี id ของเรา · ผู้ใช้/session ชั่วคราวถูกลบ"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · กลุ่ม · sev · ฐานคาด · หัวข้อ)`);
  for (const [id, g, sev, base, t] of CHECKS) console.log(`${id}\t${g}\t${sev}\t${base}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , , , t]) => [id, t]));
const SEV = new Map(CHECKS.map(([id, , sev]) => [id, sev]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `H0.3-${id}`;
  if (!TITLE.has(full) && id !== "Z1") throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const key = TITLE.has(full) ? full : id;
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(key, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${key}] ${TITLE.get(key)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const squash = (s: string) => s.replace(/\s+/g, " ");
const short = (v: unknown, n = 220) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
/** ตัวฟังก์ชันจากเครื่องหมายเริ่ม ถึง `\nexport ` ถัดไป */
function block(src: string, start: string, end = "\nexport "): string {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return src.slice(i, j < 0 ? undefined : j);
}
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 160);

const ACTIONS_FILE = "src/lib/modules/hr/actions.ts";
const SERVICE_FILE = "src/lib/modules/hr/service.ts";
const UI_FILE = "src/lib/modules/hr/ui.tsx";
const TOOLS_FILE = "src/lib/ai/tools.ts";
// sha256 ของ `export function clockInDetail(` … ปิดท้าย judgeClockIn (`\n}\n`) บนฐาน afcb9bc3 / f85f5455 (669 ตัวอักษร)
const JUDGE_SHA = "2f6f57a8bb705fde68d486a309c732c73874906c8be445e683f088be7ac0726f";

function runStatic(): void {
  // S1.8 — ปุ่มลงเวลาแทนซ่อนจากคนไม่มีสิทธิ์
  const ui = rd(UI_FILE);
  const sec = block(ui, "export async function HrAttendanceSection(");
  const formIdx = sec.indexOf("action={clockAction}");
  const right = /"hr\.employee\.create"|\b(canClockFor|clockFor|canOnBehalf|onBehalf|canManageEmployees|canAdminEmployees)\w*/i.exec(sec);
  const gated = !!right && formIdx > 0 && right.index < formIdx && /&&|\?/.test(sec.slice(right.index, formIdx));
  chk("S1.8", gated, "อ้างสิทธิ์ก่อนฟอร์ม clockAction + เงื่อนไข", sec ? `right=${right?.[0] ?? "ไม่มี"}@${right?.index ?? -1} form@${formIdx}` : "ไม่พบ HrAttendanceSection");

  // S4.9 — clock อยู่ในธุรกรรมเดียวพร้อม advisory lock
  const svc = rd(SERVICE_FILE);
  const clockFn = block(svc, "export async function clock(");
  const s49 = {
    tx: /tenantDb\(ctx\)\.\$transaction\(/.test(clockFn) || /\.\$transaction\(/.test(clockFn),
    lock: clockFn.includes("pg_advisory_xact_lock") && clockFn.includes("hashtextextended") && clockFn.includes("hr:clock:"),
    dedupe: /CLOCK_DEDUPE_SEC\s*=\s*60\b/.test(svc),
  };
  chk("S4.9", s49.tx && s49.lock && s49.dedupe, "tx + lock hr:clock: + CLOCK_DEDUPE_SEC = 60", short(s49));

  // S6.1 — คำตัดสินสาย/ตรงเวลาไม่เปลี่ยน
  const a = svc.indexOf("export function clockInDetail(");
  const b = svc.indexOf("export function judgeClockIn(");
  const e = b >= 0 ? svc.indexOf("\n}\n", b) : -1;
  const slice = a >= 0 && e > a ? svc.slice(a, e + 3) : "";
  const sha = createHash("sha256").update(slice).digest("hex");
  chk("S6.1", sha === JUDGE_SHA, JUDGE_SHA.slice(0, 16), `${sha.slice(0, 16)} len=${slice.length}`);

  // S6.2 / S6.3 — pending_leaves
  const tools = rd(TOOLS_FILE);
  const pl = block(tools, "const pendingLeaves: AiTool = {", "\n// ── 5)");
  chk("S6.2", pl.includes("HF-HR-0 ▸ ไม่คืนเหตุผลการลา") && !/l\.reason/.test(pl) && pl.length > 0, "ความเห็นอยู่ · ไม่มี l.reason", `len=${pl.length} comment=${pl.includes("HF-HR-0 ▸ ไม่คืนเหตุผลการลา")} reason=${/l\.reason/.test(pl)}`);
  const mapBody = block(pl, "leaves.map((l) => ({", "}))");
  const keys = [...mapBody.matchAll(/^\s*([฀-๿A-Za-z_]+)\s*:/gm)].map((m) => m[1]).sort();
  const want = ["ตั้งแต่", "ถึง", "ประเภท", "พนักงาน", "รหัสใบลา"].sort();
  const idLine = mapBody.split("\n").find((l) => /รหัสใบลา\s*:\s*l\.id\b/.test(l)) ?? "";
  const idx = mapBody.indexOf(idLine);
  const near = idLine ? mapBody.slice(Math.max(0, idx - 200), idx + idLine.length) : "";
  chk(
    "S6.3",
    JSON.stringify(keys) === JSON.stringify(want) && !!idLine && near.includes("HR H0.3 ▸"),
    want.join(","),
    `keys=${keys.join(",")} idLine=${idLine ? "มี" : "ไม่มี"} marker=${near.includes("HR H0.3 ▸")}`,
  );

  // S6.4 — ตัวจำกัดบน DB ใน hr/actions.ts
  const act = rd(ACTIONS_FILE);
  const kiosk = block(act, "export async function kioskClockAction(");
  const setp = block(act, "export async function setPinAction(");
  const inMem = /from "@\/lib\/core\/rate-limit"/.test(act) || /\bcheckRateLimit\(/.test(act);
  const kEmp = kiosk.indexOf("hr-kiosk:emp:");
  const kSys = kiosk.indexOf("hr-kiosk:sys:");
  const kPin = kiosk.indexOf("clockWithPin(");
  const sKey = setp.indexOf("hr-setpin:");
  const sCall = setp.indexOf("await setPin(");
  const s64 = {
    inMem,
    db: /checkRateLimitDb\(/.test(kiosk) && /checkRateLimitDb\(/.test(setp),
    kioskOrder: kEmp > 0 && kSys > 0 && kPin > Math.max(kEmp, kSys),
    setpinOrder: sKey > 0 && sCall > sKey,
  };
  chk("S6.4", !s64.inMem && s64.db && s64.kioskOrder && s64.setpinOrder, "{inMem:false,db:true,kioskOrder:true,setpinOrder:true}", short(s64));

  // S6.5 — clockAction ตรวจสิทธิ์จัดการพนักงาน
  const ca = block(act, "export async function clockAction(");
  const cIdx = ca.indexOf("await clock(");
  const eIdx = ca.indexOf('"hr.employee.create"');
  chk("S6.5", eIdx > 0 && cIdx > eIdx && ca.includes('"hr.attendance.clock"'), "hr.employee.create ก่อน clock(", `employee.create@${eIdx} clock@${cIdx} attendance.clock=${ca.includes('"hr.attendance.clock"')}`);
}

// ═════════════════════════ ของ H0.3 มีแล้วหรือยัง (ไม่มีเลย = SKIP เว้น QC_FORCE=1) ═════════════════════════
const skipReasons: string[] = [];
{
  const act = rd(ACTIONS_FILE);
  const svc = rd(SERVICE_FILE);
  const tools = rd(TOOLS_FILE);
  const present = act.includes("checkRateLimitDb") || svc.includes("hr:clock:") || /รหัสใบลา\s*:\s*l\.id\b/.test(tools);
  if (!present) skipReasons.push("ยังไม่มีของ H0.3 (hr/actions.ts ไม่มี checkRateLimitDb · service.ts ไม่มี hr:clock: · tools.ts ไม่มี รหัสใบลา: l.id)");
}

// ═════════════════════════ env (QC4 เท่านั้น) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc";
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env คือ production — ห้าม`);
  process.exit(4);
}
const { loadLegacyQcEnv } = await import("./qc-env-guard.mjs" as string);
loadLegacyQcEnv(SUITE);
{
  const bad = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["DIRECT_URL", process.env.DIRECT_URL ?? ""],
  ].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนแถวได้เฉพาะ QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
  if (!MODE.startsWith("--")) {
    let host = "?";
    try {
      host = new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      /* พิมพ์แค่ host — ไม่พิมพ์ URL */
    }
    console.log(`[${SUITE}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "ไม่ใช่ QC4"})`);
  }
}

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-v1) — ให้ requireTenant() อ่านคุกกี้ได้ในโปรเซส ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
let SCOPE_RUNS = 0;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope (next/dist/... โหลดไม่ได้)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.130" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  const out = await nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
  SCOPE_RUNS += 1;
  return out;
}

const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const act = (await import("@/lib/modules/hr/actions" as string)) as Any;
const tools = (await import("@/lib/ai/tools")) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const kioskCall = (cookie: string, systemId: string, employeeId: string, pin: string): Promise<Any> =>
  inScope(cookie, `/app/sys/${systemId}/hr/kiosk`, () => act.kioskClockAction(systemId, { status: "idle" }, fd({ employeeId, pin }))).catch((e: unknown) => ({ status: "THROW", message: errText(e) }));
const limited = (r: Any) => typeof r?.message === "string" && /ลองใหม่ในอีก\s*\d+\s*วินาที/.test(r.message);

// ═════════════════════════ โหมดลูก (process แยก — connection/หน่วยความจำคนละชุดจริง) ═════════════════════════
if (MODE === "--tap-worker") {
  // แตะ PIN ถูก 5 ครั้งพร้อมกัน ณ เวลานัด
  const [, , , wT, wS, wE, wPin, wGo] = process.argv as string[];
  await P.$queryRaw`SELECT 1`;
  const late = Date.now() > Number(wGo);
  while (Date.now() < Number(wGo)) await sleep(2);
  const rs = await Promise.all(
    Array.from({ length: 5 }, () =>
      hr.clockWithPin({ tenantId: String(wT), systemId: String(wS) }, String(wE), String(wPin)).then(
        (r: Any) => ({ ok: !!r?.ok, kind: r?.ok ? r.kind : null, reason: r?.ok ? undefined : r?.reason }),
        (e: unknown) => ({ ok: false, kind: null, reason: `THROW ${errText(e)}` }),
      ),
    ),
  );
  console.log("TAP_RESULT " + JSON.stringify({ rs, late }));
  await P.$disconnect().catch(() => {});
  process.exit(0);
}
if (MODE === "--kiosk-worker") {
  // ลองบนจอ kiosk ต่อจากแม่ (ตัวจำกัด in-memory ของ process นี้ว่างเปล่า — ต้องพึ่งถังใน DB)
  const [, , , wS, wE, wPins] = process.argv as string[];
  const cookie = process.env.QC_H03_COOKIE ?? "";
  const out: { status: string; message: string; limited: boolean }[] = [];
  for (const pin of String(wPins).split(",")) {
    const r = await kioskCall(cookie, String(wS), String(wE), pin);
    out.push({ status: String(r?.status), message: String(r?.message ?? ""), limited: limited(r) });
  }
  console.log("KIOSK_RESULT " + JSON.stringify(out));
  await P.$disconnect().catch(() => {});
  process.exit(0);
}

// pool ของ PrismaPg (db.ts ส่งแค่ connectionString) = ค่าปริยายของ pg.Pool = 10 เส้น
// 🔴 ห้ามหา N ด้วยการเปิดธุรกรรมจนเปิดไม่ได้: คำขอที่หมด maxWait ยังค้างในคิวของ pg.Pool แล้วได้ connection ทีหลัง
//    ⇒ connection นั้นค้าง "idle in transaction" ใน pool · คำสั่งเขียนถัดไปที่ได้มันไปหายเงียบ (วัดจริงบน QC4 7 ต.ค.: เขียน 1 แถว อ่านเห็นใน
//    process เดียวกัน แต่ commit ไม่ถึง DB) ⇒ ถือ POOL_MAX−1 เส้นพอดี (maxWait กว้าง) และทำใน process ลูกเท่านั้น
const POOL_MAX = 10;
if (MODE === "--pool-worker") {
  const [, , , wT, wS, wE, wPin] = process.argv as string[];
  const holders: { done: Promise<unknown>; release: () => void }[] = [];
  let failedStart = 0;
  for (let k = 0; k < POOL_MAX - 1; k++) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: (v: boolean) => void;
    const s = new Promise<boolean>((r) => (started = r));
    const done = P.$transaction(
      async (tx: Any) => {
        await tx.$queryRaw`SELECT 1`;
        started(true);
        await gate;
      },
      { maxWait: 10_000, timeout: 40_000 },
    ).catch(() => started(false));
    if (!(await s)) {
      failedStart++;
      break;
    }
    holders.push({ done, release });
  }
  await sleep(300);
  const t0 = Date.now();
  const p = hr.clockWithPin({ tenantId: String(wT), systemId: String(wS) }, String(wE), String(wPin)).then(
    (r: Any) => (r?.ok ? "ok" : `no ${r?.reason}`),
    (e: unknown) => `THROW ${errText(e)}`,
  );
  const v = failedStart ? "SKIP pool < 10" : await Promise.race([p, sleep(3_000).then(() => "TIMEOUT 3s")]);
  const ms = Date.now() - t0;
  for (const h of holders) h.release();
  await Promise.allSettled(holders.map((h) => h.done));
  const final = await p;
  console.log("POOL_RESULT " + JSON.stringify({ held: holders.length, failedStart, v, ms, final }));
  await P.$disconnect().catch(() => {});
  process.exit(0);
}

// ═════════════════════════ SKIP gate ═════════════════════════
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของ H0.3 ยังไม่มี`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect().catch(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด: ${skipReasons.join(" · ")} (คาด: แดงตามเหตุผล ไม่ crash)`);

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
let tid = "";
const users: string[] = [];
const ids: string[] = []; // id ที่อาจไปอยู่ใน key ของ ChatRateBucket (ระบบ/พนักงาน/ผู้ใช้)

type Who = { id: string; name: string; cookie: string };
async function mkUser(tag: string, name: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, boolean>): Promise<Who> {
  const u = await P.user.create({ data: { email: `${SLUG}-${tag}@qc.invalid`, name } });
  users.push(u.id);
  ids.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: role === "STAFF" ? [] : ["*"], permissions, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  const DAY = 86_400_000;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  return { id: u.id, name, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}` };
}
async function mkEmp(systemId: string, name: string, pinCode: string | null = null, active = true): Promise<string> {
  const e = await P.hrEmployee.create({ data: { tenantId: tid, systemId, name, pinCode, active } });
  ids.push(e.id);
  return e.id as string;
}
const rowsOf = (employeeId: string): Promise<Any[]> => P.hrAttendance.findMany({ where: { employeeId }, orderBy: { at: "asc" }, select: { id: true, kind: true, at: true, note: true, systemId: true } });
const clockCall = (who: Who, systemId: string, employeeId: string, kind: string): Promise<Any> =>
  inScope(who.cookie, `/app/sys/${systemId}/hr/attendance`, () => act.clockAction(fd({ systemId, employeeId, kind }))).then(
    () => "returned",
    (e: unknown) => `THROW ${errText(e)}`,
  );
const setPinCall = (who: Who, systemId: string, employeeId: string, pin: string): Promise<Any> =>
  inScope(who.cookie, `/app/sys/${systemId}/hr/employees`, () => act.setPinAction(systemId, employeeId, { status: "idle" }, fd({ pin }))).catch((e: unknown) => ({ status: "THROW", message: errText(e) }));
const bucket = (key: string): Promise<Any> => P.chatRateBucket.findUnique({ where: { key }, select: { count: true, windowStart: true } });

function spawnWorker(args: string[], tag: string, extraEnv: Record<string, string> = {}): Promise<Any> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-hr-h0.3.mts", ...args], { env: { ...process.env, ...extraEnv } });
    let o = "";
    let er = "";
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (er += String(d)));
    c.on("error", (e) => res({ error: errText(e) }));
    c.on("close", () => {
      const m = new RegExp(`${tag} (.*)`).exec(o);
      try {
        res(m ? JSON.parse(m[1]!) : { error: `ไม่มี ${tag}: ${(o + er).replace(/\s+/g, " ").slice(-240)}` });
      } catch (e) {
        res({ error: errText(e) });
      }
    });
  });
}

async function runDb(): Promise<void> {
  // ใกล้เที่ยงคืนเวลาไทย = nextClockKind ตัดวัน ⇒ รอให้พ้นก่อน (ข้อสอบไม่ขึ้นกับวันที่)
  for (;;) {
    const m = hr.bkkParts(new Date()).minOfDay as number;
    if (m >= 4 && m <= 1430) break;
    console.log(`  · ใกล้เที่ยงคืนเวลาไทย (นาทีที่ ${m}) — รอ 30 s`);
    await sleep(30_000);
  }

  // ── setup: ร้านชั่วคราว + ระบบ HR 3 ระบบ (A = หลัก · B = อีกระบบของร้านเดียวกัน · C = ถังระบบ kiosk) ──
  const t = await P.tenant.create({ data: { name: "QC HR H0.3 ลงเวลา/kiosk", slug: SLUG } });
  tid = t.id;
  const sA = await sys.createSystem(tid, "HR", "ทีมงาน A");
  await sleep(30); // pending_leaves เลือกระบบ HR ที่สร้างก่อน (createdAt asc) ⇒ A
  const sB = await sys.createSystem(tid, "HR", "ทีมงาน B");
  const sC = await sys.createSystem(tid, "HR", "ทีมงาน C");
  ids.push(sA.id, sB.id, sC.id);
  const ctxA = { tenantId: tid, systemId: sA.id };

  const U = {
    owner: await mkUser("owner", `QC เจ้าของ ${stamp}`, "OWNER", {}),
    manager: await mkUser("manager", `QC ผู้จัดการ ${stamp}`, "MANAGER", {}),
    hrAdmin: await mkUser("hradmin", `QC แอดมินHR ${stamp}`, "STAFF", { "hr.attendance.clock": true, "hr.employee.create": true }),
    kiosk: await mkUser("kiosk", `QC แท็บเล็ต ${stamp}`, "STAFF", { "hr.attendance.clock": true }),
    member: await mkUser("member", `QC สมาชิก ${stamp}`, "STAFF", {}),
  };

  // ข้าม process (S4.3) — เริ่มก่อนเพื่อไม่ต้องรอ tsx บูต · นัดเวลา +40 s
  const eTapX = await mkEmp(sA.id, `แตะข้ามprocess ${stamp}`, "4321");
  const tapGoAt = Date.now() + 40_000;
  const tapP = Promise.all([0, 1].map(() => spawnWorker(["--tap-worker", tid, sA.id, eTapX, "4321", String(tapGoAt)], "TAP_RESULT")));

  // ═══ S1 ลงเวลาแทน ═══
  console.log("── [S1] ลงเวลาแทน (clockAction) ──");
  const eOwn = await mkEmp(sA.id, `แทน-เจ้าของ ${stamp}`);
  const eMgr = await mkEmp(sA.id, `แทน-ผู้จัดการ ${stamp}`);
  const eAdm = await mkEmp(sA.id, `แทน-แอดมิน ${stamp}`);
  const eKio = await mkEmp(sA.id, `แทน-kiosk ${stamp}`);
  const eMem = await mkEmp(sA.id, `แทน-สมาชิก ${stamp}`);
  const eOff = await mkEmp(sA.id, `พ้นสภาพ ${stamp}`, null, false);
  const eB = await mkEmp(sB.id, `ระบบB ${stamp}`, "2468");
  const c11 = await clockCall(U.owner, sA.id, eOwn, "IN");
  const c12 = await clockCall(U.manager, sA.id, eMgr, "IN");
  const c13 = await clockCall(U.hrAdmin, sA.id, eAdm, "IN");
  const c14 = await clockCall(U.kiosk, sA.id, eKio, "IN");
  const c15 = await clockCall(U.member, sA.id, eMem, "IN");
  const r11 = await rowsOf(eOwn);
  const r12 = await rowsOf(eMgr);
  const r13 = await rowsOf(eAdm);
  const one = (rs: Any[]) => rs.length === 1 && rs[0].kind === "IN" && rs[0].systemId === sA.id;
  chk("S1.1", one(r11), "1 แถว IN ระบบ A", `${r11.length} แถว · ${c11} · scope=${SCOPE_RUNS}`);
  chk("S1.2", one(r12), "1 แถว IN", `${r12.length} แถว · ${c12}`);
  chk("S1.3", one(r13), "1 แถว IN", `${r13.length} แถว · ${c13}`);
  const r14 = await rowsOf(eKio);
  chk("S1.4", r14.length === 0, "0 แถว", `${r14.length} แถว · ${c14}`);
  const r15 = await rowsOf(eMem);
  chk("S1.5", r15.length === 0, "0 แถว", `${r15.length} แถว · ${c15}`);
  const noteOk = (rs: Any[], who: Who) => rs.length === 1 && typeof rs[0].note === "string" && rs[0].note.startsWith("ลงเวลาแทนโดย") && rs[0].note.includes(who.name);
  chk(
    "S1.6",
    noteOk(r11, U.owner) && noteOk(r12, U.manager) && noteOk(r13, U.hrAdmin),
    `"ลงเวลาแทนโดย <ชื่อ>" ×3`,
    short([r11[0]?.note ?? null, r12[0]?.note ?? null, r13[0]?.note ?? null]),
  );
  const c17 = await clockCall(U.owner, sA.id, eOff, "IN");
  const r17 = await rowsOf(eOff);
  chk("S1.7", r17.length === 0, "0 แถว", `${r17.length} แถว · ${c17}`);

  // ═══ X2 พนักงานต้องเป็นของระบบนี้ ═══
  console.log("── [X2] พนักงานของอีกระบบ HR ในร้านเดียวกัน ──");
  const cx1 = await clockCall(U.owner, sA.id, eB, "IN");
  const nx1 = (await rowsOf(eB)).length;
  chk("X2.1", nx1 === 0, "0 แถว", `${nx1} แถว · ${cx1}`);
  let x22 = "";
  try {
    const r = await hr.clock(ctxA, { employeeId: eB, kind: "OUT" });
    x22 = r?.id ? `คืน id ${String(r.id).slice(0, 8)}` : `คืน ${short(r, 80)}`;
  } catch (e) {
    x22 = `THROW ${errText(e)}`;
  }
  const nx2 = (await rowsOf(eB)).length - nx1;
  chk("X2.2", nx2 === 0 && !x22.startsWith("คืน id"), "ปฏิเสธ · +0 แถว", `+${nx2} แถว · ${x22}`);
  const before23 = (await rowsOf(eB)).length;
  const kx3 = await kioskCall(U.kiosk.cookie, sA.id, eB, "2468");
  const nx3 = (await rowsOf(eB)).length - before23;
  chk("X2.3", kx3?.status === "error" && nx3 === 0, "error · +0 แถว", `${short(kx3, 120)} · +${nx3}`);

  // ═══ S2 ตัวจำกัด kiosk ═══
  console.log("── [S2] ตัวจำกัดเดา PIN บนจอ kiosk ──");
  const eK1 = await mkEmp(sA.id, `kiosk-1 ${stamp}`, "1357");
  const k5: Any[] = [];
  for (let i = 0; i < 5; i++) k5.push(await kioskCall(U.kiosk.cookie, sA.id, eK1, "0000"));
  const k6 = await kioskCall(U.kiosk.cookie, sA.id, eK1, "1357");
  const rK1 = await rowsOf(eK1);
  chk(
    "S2.1",
    k5.every((r) => r?.status === "error" && !limited(r)) && k6?.status === "error" && limited(k6) && rK1.length === 0,
    "5× PIN ผิด (ไม่ใช่ลองใหม่) · ครั้งที่ 6 ลองใหม่ในอีก N วินาที · 0 แถว",
    `${short(k5.map((r) => r?.message), 120)} · 6=${short(k6?.message, 60)} · ${rK1.length} แถว`,
  );
  const bEmp = await bucket(`hr-kiosk:emp:${tid}:${eK1}`);
  const bSys = await bucket(`hr-kiosk:sys:${tid}:${sA.id}`);
  const ourBuckets = await P.chatRateBucket.count({ where: { key: { contains: tid } } });
  chk("S2.2", (bEmp?.count ?? 0) >= 5 && !!bSys, "emp count ≥ 5 · sys มี", `emp=${bEmp?.count ?? "ไม่มี"} sys=${bSys?.count ?? "ไม่มี"} แถวที่มี tenantId=${ourBuckets}`);
  // S2.3 — ย้อนหน้าต่างของถังเราทั้งหมด 61 s (แทนการรอ)
  const back = await P.chatRateBucket.updateMany({ where: { key: { contains: tid } }, data: { windowStart: new Date(Date.now() - 61_000) } });
  const k7 = await kioskCall(U.kiosk.cookie, sA.id, eK1, "1357");
  const rK1b = await rowsOf(eK1);
  chk("S2.3", k7?.status === "ok" && rK1b.length === 1 && rK1b[0].kind === "IN", "ok · IN 1 แถว", `ย้อน ${back.count} ถัง · ${short(k7, 100)} · ${rK1b.length} แถว`);
  // S2.4 — ข้าม process
  const eK2 = await mkEmp(sA.id, `kiosk-2 ${stamp}`, "8642");
  const kp: Any[] = [];
  for (let i = 0; i < 3; i++) kp.push(await kioskCall(U.kiosk.cookie, sA.id, eK2, `000${i + 1}`));
  const kc = await spawnWorker(["--kiosk-worker", sA.id, eK2, "0004,0005,8642"], "KIOSK_RESULT", { QC_H03_COOKIE: U.kiosk.cookie });
  const rK2 = await rowsOf(eK2);
  const childArr: Any[] = Array.isArray(kc) ? kc : [];
  const allowed = kp.filter((r) => !limited(r)).length + childArr.filter((r) => !r.limited).length;
  chk(
    "S2.4",
    childArr.length === 3 && allowed === 5 && childArr[2]?.limited === true && rK2.length === 0,
    "ผ่านตัวจำกัดรวม 5 · ลูกครั้งที่ 3 ลองใหม่ · 0 แถว",
    `allowed=${allowed} parent=${short(kp.map((r) => r?.message), 90)} child=${short(Array.isArray(kc) ? kc.map((r: Any) => r.message) : kc, 140)} · ${rK2.length} แถว`,
  );
  // S2.5 — ถังระบบ (ระบบ C · 61 คน)
  await P.hrEmployee.createMany({ data: Array.from({ length: 61 }, (_, i) => ({ tenantId: tid, systemId: sC.id, name: `C-${String(i).padStart(3, "0")} ${stamp}`, pinCode: "1111" })) });
  const cEmps = (await P.hrEmployee.findMany({ where: { systemId: sC.id }, orderBy: { name: "asc" }, select: { id: true } })).map((e: Any) => e.id as string);
  ids.push(...cEmps);
  const t25 = Date.now();
  const k60: Any[] = [];
  for (let b = 0; b < 60; b += 10) k60.push(...(await Promise.all(cEmps.slice(b, b + 10).map((id: string) => kioskCall(U.kiosk.cookie, sC.id, id, "9999")))));
  const k61 = await kioskCall(U.kiosk.cookie, sC.id, cEmps[60]!, "1111");
  const ms25 = Date.now() - t25;
  const r61 = await rowsOf(cEmps[60]!);
  const lim60 = k60.filter((r) => limited(r)).length;
  chk(
    "S2.5",
    cEmps.length === 61 && lim60 === 0 && limited(k61) && r61.length === 0 && ms25 < 50_000,
    "60 ครั้งผ่านตัวจำกัด · คนที่ 61 ลองใหม่ · 0 แถว · < 50 s",
    `emps=${cEmps.length} lim60=${lim60} 61=${short(k61, 90)} · ${r61.length} แถว · ${ms25} ms`,
  );

  // ═══ S3 ตัวจำกัดตั้ง PIN ═══
  console.log("── [S3] ตัวจำกัดตั้ง PIN ──");
  const eP = await mkEmp(sA.id, `ตั้งPIN ${stamp}`);
  const sp: Any[] = [];
  for (let i = 1; i <= 11; i++) sp.push(await setPinCall(U.hrAdmin, sA.id, eP, String(80000 + i)));
  const pin11 = (await P.hrEmployee.findUnique({ where: { id: eP }, select: { pinCode: true } }))?.pinCode;
  chk(
    "S3.1",
    sp.slice(0, 10).every((r) => r?.status === "ok") && sp[10]?.status === "error" && pin11 === "80010",
    "10× ok · ครั้งที่ 11 error · PIN 80010",
    `${sp.map((r) => r?.status).join(",")} · 11=${short(sp[10]?.message, 60)} · pin=${pin11}`,
  );
  const sp2 = await setPinCall(U.owner, sA.id, eP, "80012");
  const pin12 = (await P.hrEmployee.findUnique({ where: { id: eP }, select: { pinCode: true } }))?.pinCode;
  chk("S3.2", sp2?.status === "ok" && pin12 === "80012", "ok · PIN 80012", `${short(sp2, 80)} · pin=${pin12}`);
  const bPin = await bucket(`hr-setpin:${tid}:${U.hrAdmin.id}`);
  chk("S3.3", (bPin?.count ?? 0) >= 10, "count ≥ 10", `count=${bPin?.count ?? "ไม่มีแถว"}`);

  // ═══ S4 แตะครั้งเดียว = แถวเดียว ═══
  console.log("── [S4] แตะรัว / กันซ้ำ ──");
  const rounds: { e: string; rs: Any[] }[] = [];
  for (let r = 0; r < 3; r++) {
    const e = await mkEmp(sA.id, `แตะรัว ${r} ${stamp}`, "5555");
    const rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        hr.clockWithPin(ctxA, e, "5555").then(
          (x: Any) => ({ ok: !!x?.ok, kind: x?.ok ? x.kind : null, reason: x?.ok ? undefined : x?.reason }),
          (err: unknown) => ({ ok: false, kind: null, reason: `THROW ${errText(err)}` }),
        ),
      ),
    );
    rounds.push({ e, rs });
  }
  chk(
    "S4.1",
    rounds.every((x) => x.rs.every((y) => y.ok && y.kind === "IN")),
    "30/30 ok · kind IN",
    rounds.map((x) => `${x.rs.filter((y) => y.ok).length}ok/${x.rs.filter((y) => y.kind === "OUT").length}OUT${x.rs.find((y) => !y.ok) ? ` ${short(x.rs.find((y) => !y.ok)?.reason, 60)}` : ""}`).join(" · "),
  );
  const rr: Any[][] = [];
  for (const x of rounds) rr.push(await rowsOf(x.e));
  chk("S4.2", rr.every((rs) => rs.length === 1 && rs[0].kind === "IN"), "1 IN ต่อรอบ", rr.map((rs) => rs.map((y: Any) => y.kind).join("+") || "0").join(" · "));
  // S4.4 — kiosk แตะซ้ำผ่าน action
  const eDT = await mkEmp(sA.id, `แตะซ้ำ ${stamp}`, "2222");
  const a1 = await kioskCall(U.kiosk.cookie, sA.id, eDT, "2222");
  const a2 = await kioskCall(U.kiosk.cookie, sA.id, eDT, "2222");
  const rDT = await rowsOf(eDT);
  chk(
    "S4.4",
    a1?.status === "ok" && a2?.status === "ok" && /เพิ่งลงเวลาเข้า/.test(`${a2?.message ?? ""} ${a2?.detail ?? ""}`) && rDT.length === 1 && rDT[0].kind === "IN",
    "ok · ok \"เพิ่งลงเวลาเข้า…\" · IN 1 แถว",
    `1=${short(a1?.message, 60)} · 2=${short(`${a2?.message ?? ""} | ${a2?.detail ?? ""}`, 80)} · ${rDT.map((y: Any) => y.kind).join("+")}`,
  );
  // S4.5 — พ้นหน้าต่างกันซ้ำ (ย้อนแถวของรอบแรก 61 s)
  const e0 = rounds[0]!.e;
  await P.hrAttendance.updateMany({ where: { employeeId: e0 }, data: { at: new Date(Date.now() - 61_000) } });
  const n0 = (await rowsOf(e0)).length;
  const r45 = await hr.clockWithPin(ctxA, e0, "5555").catch((err: unknown) => ({ ok: false, reason: `THROW ${errText(err)}` }));
  const rows45 = await rowsOf(e0);
  chk("S4.5", r45?.ok === true && r45.kind === "OUT" && rows45.length === n0 + 1 && rows45[rows45.length - 1].kind === "OUT", "OUT · +1 แถว", `${short(r45, 80)} · ${n0}→${rows45.length}`);
  // S4.6 — ทางตรง IN ×10 พร้อมกัน
  const eX = await mkEmp(sA.id, `ทางตรงรัว ${stamp}`);
  const c46 = await Promise.all(Array.from({ length: 10 }, () => clockCall(U.owner, sA.id, eX, "IN")));
  const r46 = await rowsOf(eX);
  chk("S4.6", r46.length === 1 && r46[0].kind === "IN", "IN 1 แถว", `${r46.length} แถว · ${short([...new Set(c46)], 80)}`);
  // S4.7 — ทางตรง IN แล้ว OUT
  const eY = await mkEmp(sA.id, `ทางตรงเข้าออก ${stamp}`);
  const c47a = await clockCall(U.owner, sA.id, eY, "IN");
  const c47b = await clockCall(U.owner, sA.id, eY, "OUT");
  const r47 = await rowsOf(eY);
  chk("S4.7", r47.map((y: Any) => y.kind).join("+") === "IN+OUT", "IN+OUT", `${r47.map((y: Any) => y.kind).join("+") || "0"} · ${c47a}/${c47b}`);
  // S4.3 — ผลจาก 2 process
  const taps = await tapP;
  const rTap = await rowsOf(eTapX);
  const tapRs: Any[] = taps.flatMap((x: Any) => (Array.isArray(x?.rs) ? x.rs : []));
  chk(
    "S4.3",
    taps.every((x: Any) => x && !x.error && x.late === false) && tapRs.length === 10 && tapRs.every((y) => y.ok && y.kind === "IN") && rTap.length === 1,
    "2 process ตรงเวลา · 10/10 ok IN · 1 แถว",
    `${short(taps.map((x: Any) => (x?.error ? `ERR ${x.error}` : `late=${x.late} ${x.rs.map((y: Any) => (y.ok ? y.kind : "no")).join("")}`)), 160)} · ${rTap.length} แถว`,
  );
  // S4.8 — pool ถูกจับไว้ N−1 เส้น ใน process ลูก (กันการ์ด pool ของ process แม่เสีย — ดู --pool-worker)
  const eZ = await mkEmp(sA.id, `poolเดียว ${stamp}`, "7777");
  const pw = await spawnWorker(["--pool-worker", tid, sA.id, eZ, "7777"], "POOL_RESULT");
  const rZ = await rowsOf(eZ);
  chk(
    "S4.8",
    !pw?.error && pw.held === POOL_MAX - 1 && pw.v === "ok" && pw.ms < 3_000 && rZ.length === 1,
    `ถือ ${POOL_MAX - 1} เส้น · ok < 3000 ms · 1 แถว`,
    `${short(pw, 140)} · ${rZ.length} แถว`,
  );

  // ═══ S5 AI รหัสใบลา ═══
  console.log("── [S5] AI pending_leaves → hr_decide_leave ──");
  const REASON = `ปวดหัวมาก QC-REASON-${stamp}`;
  const eLname = `ลาทดสอบ ${stamp}`;
  const eL = await mkEmp(sA.id, eLname);
  const l1 = (await hr.requestLeave(ctxA, { employeeId: eL, type: "SICK", fromDate: "2027-03-01", toDate: "2027-03-02", reason: REASON })).id as string;
  const l2 = (await hr.requestLeave(ctxA, { employeeId: eL, type: "PERSONAL", fromDate: "2027-04-05", toDate: "2027-04-05", reason: REASON })).id as string;
  const out1 = String(await tools.runTool({ tenantId: tid }, "pending_leaves", {}));
  let rows1: Any[] = [];
  try {
    rows1 = (JSON.parse(out1)?.["ใบลารออนุมัติ"] ?? []) as Any[];
  } catch {
    rows1 = [];
  }
  const got = rows1.map((r) => r?.["รหัสใบลา"]).filter(Boolean).map(String).sort();
  const reasonKey = rows1.some((r) => Object.keys(r ?? {}).some((k) => k.includes("เหตุผล")));
  chk(
    "S5.1",
    JSON.stringify(got) === JSON.stringify([l1, l2].sort()) && rows1.length === 2 && !out1.includes(REASON) && !reasonKey,
    "รหัสใบลา = [l1,l2] · ไม่มีเหตุผล",
    `rows=${rows1.length} ids=${got.length}/${2} match=${JSON.stringify(got) === JSON.stringify([l1, l2].sort())} reasonText=${out1.includes(REASON)} reasonKey=${reasonKey} · ${short(out1, 140)}`,
  );
  const conv = await P.aiConversation.create({ data: { tenantId: tid, title: "qc h0.3" } });
  const fed = rows1[0]?.["รหัสใบลา"];
  const out2 = String(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "hr_decide_leave", { leaveId: fed, decision: "APPROVED" }));
  let j2: Any = {};
  try {
    j2 = JSON.parse(out2);
  } catch {
    j2 = {};
  }
  const prop = j2?.proposalId ? await P.aiProposal.findUnique({ where: { id: String(j2.proposalId) }, select: { kind: true, payload: true, summary: true } }) : null;
  chk(
    "S5.2",
    !!fed && [l1, l2].includes(String(fed)) && prop?.kind === "hr_decide_leave" && prop?.payload?.leaveId === String(fed) && String(prop?.summary ?? "").includes(eLname),
    "ข้อเสนอ hr_decide_leave ของใบนั้น · summary มีชื่อ",
    `fed=${fed === undefined ? "undefined" : String(fed).slice(0, 10)} · ${short(out2, 120)} · prop=${short(prop, 100)}`,
  );
}

// ═════════════════════════ คืนสภาพ ═════════════════════════
async function cleanup(): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 80)}`);
    }
  };
  if (tid) {
    const emps = (await P.hrEmployee.findMany({ where: { tenantId: tid }, select: { id: true } }).catch(() => [])) as Any[];
    const all = [...new Set([tid, ...ids, ...emps.map((e) => e.id as string)])];
    for (let i = 0; i < all.length; i += 50) {
      const part = all.slice(i, i + 50);
      await d("chatRateBucket", () => P.chatRateBucket.deleteMany({ where: { OR: part.map((x) => ({ key: { contains: x } })) } }));
    }
    for (const m of [
      "approvalDecision", "approvalRequest", "approvalStep", "approvalPolicy",
      "hrPayrollItem", "hrPayrollRun", "hrPayAdjustment", "hrSalaryProfile",
      "hrEmployeeDoc", "hrAttendance", "hrLeave", "hrWorkSchedule", "hrEmployee",
      "outboxEvent", "appNotification", "webhookDelivery", "auditLog", "aiProposal", "aiPlan", "aiMessage", "aiConversation",
      "party", "membership", "appSystemUnit", "appSystem",
    ]) {
      if (P[m]?.deleteMany) await d(m, () => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d("tenant", () => P.tenant.delete({ where: { id: tid } }));
  }
  for (const uid of users) {
    await d("session", () => P.session.deleteMany({ where: { userId: uid } }));
    await d("appNotification(user)", () => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d("membership(user)", () => P.membership.deleteMany({ where: { userId: uid } }));
    await d("user", () => P.user.delete({ where: { id: uid } }));
  }
}

let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const residue: string[] = [];
if (tid) {
  for (const m of ["hrAttendance", "hrEmployee", "hrLeave", "aiProposal", "aiConversation", "outboxEvent", "membership", "appSystem"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
  const all = [...new Set([tid, ...ids])];
  let nb = 0;
  for (let i = 0; i < all.length; i += 50) nb += await P.chatRateBucket.count({ where: { OR: all.slice(i, i + 50).map((x) => ({ key: { contains: x } })) } }).catch(() => -1000);
  if (nb !== 0) residue.push(`chatRateBucket=${nb}`);
}
const leftUsers = users.length ? await P.user.count({ where: { id: { in: users } } }).catch(() => -1) : 0;
const leftSessions = users.length ? await P.session.count({ where: { userId: { in: users } } }).catch(() => -1) : 0;
if (leftUsers !== 0) residue.push(`user=${leftUsers}`);
if (leftSessions !== 0) residue.push(`session=${leftSessions}`);
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
if (leftTenants !== 0) residue.push(`tenant(${SLUG_PREFIX}*)=${leftTenants}`);
console.log(`RESIDUE ${residue.length ? residue.join(",") : "none"} (tenant=${tid ? "สร้างแล้ว" : "ไม่ได้สร้าง"} users=${users.length})`);
chk("Z1", residue.length === 0 && !!tid, "ไม่เหลือแถว", `${residue.join(",") || "none"}`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H0\.3-/, ""), false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${crashed ? " · CRASHED" : ""}`);
console.log(
  `JSON_SUMMARY ${JSON.stringify({
    suite: SUITE,
    total: results.size,
    passed: results.size - failed.length,
    failed,
    findings: failed.map((id) => ({ id, sev: SEV.get(id) ?? "CRITICAL" })),
    skipped: false,
    forced: FORCE,
    crashed: !!crashed,
    missing: skipReasons,
  })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
