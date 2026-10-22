// QC — HR H0.5 · PIN เก็บเป็น hash (HMAC-SHA256 + pepper) · PIN ไม่ซ้ำในร้าน (partial unique) · facade verifyPin (C-8) ·
//      ทางเก่า (pinCode ตัวเปล่า) อัปเกรดเองตอนยืนยัน · สคริปต์ backfill (dry-run / --apply · ซ้ำได้)
// ⚠️ Oracle ภายใต้ change control — ผู้คุมงานเป็นเจ้าของ (brief: ledger/hr-briefs/hr-brief-H0.5.md §2 R1–R8 · §3)
//
// สัญญา (R1–R7):
// [S1] hashPin(tenantId, pin) = hex HMAC-SHA256(key = HR_PIN_PEPPER, msg = `${tenantId}\u001f${pin}`) · ไม่มี pepper = PinNotConfiguredError
//      (ข้อความไทยคงที่) และไม่มีการเขียน PIN ตัวเปล่าแทน
// [S2] setPin: 4–6 หลัก · หลังตั้ง pinHash+pinSetAt มีค่า pinCode = null · ว่าง = ล้างทั้งสาม · พ้นสภาพ/อีกระบบ HR = "ไม่พบพนักงาน" ·
//      audit hr.pin.set / hr.pin.clear ไม่มีตัวเลข PIN/hash
// [S3] ไม่ซ้ำ "ทั้งร้าน" (ข้ามระบบ HR) ด้วย index เท่านั้น — แข่ง 10 ทาง × 3 รอบ (2 process แยก · connection แยก) = สำเร็จ 1 ·
//      คนพ้นสภาพปล่อย PIN · คนละร้านใช้ซ้ำได้ · pg_indexes มี partial unique ตัวเดียว
// [S4] verifyPin({tenantId, pin, unitId?, systemId?}) → { ok, employeeId, systemId, userId } เท่านั้น · ผิด/รูปแบบผิด = "PIN ไม่ถูกต้อง" ·
//      ถังจำกัด hr-verifypin:<tenantId> 120/60 s · timingSafeEqual + dummy ตอนไม่เจอ
// [S5] ทางเก่า: แถวมีแต่ pinCode → ยืนยันได้ + อัปเกรดเป็น hash ในที่ · ซ้ำ 2 แถว = ไม่ยืนยัน ไม่แตะ · hasPin = pinHash || pinCode
// [S6] scripts/hr-backfill-pin-hash.mts --tenant <id> [--apply] (child process ผ่าน scripts/qc4.sh) · dry-run ไม่เขียน · apply ครั้งที่ 2 = 0
// [S7] kiosk (clockWithPin → verifyPinForEmployee) · createEmployee({ pin }) · พ้นสภาพแล้วกลับมาทำงานโดน PIN ซ้ำ = ล้าง PIN (pinCleared)
// [S8] static: ไม่มี pinCode/pinHash นอก hr/pin.ts (กระจก F16.5) · index.ts export verifyPin · migration · env.ts · DTO มีแค่ hasPin
// [S9] r3 (มติผู้คุมงาน R3.1–R3.4 · hunt F1/F2/F3/F6): verifyPin ต้องมี callerKey · นับเฉพาะครั้งที่ผิด 2 ถัง
//      (ร้าน hr-verifypin:<tenantId> 120/60 s + ผู้เรียก hr-verifypin:<tenantId>:<callerKey> 10 ผิด/10 นาที · peek ก่อน · ถูก = ไม่นับ) ·
//      audit hr.pin.locked 1 แถวต่อการล็อก · backfill โหมด prod ปฏิเสธ env ที่ตั้งไว้ก่อน · createEmployeeAction ไม่อ่าน pin
//
// รัน (VPS เท่านั้น · QC4):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.5.mts   (บังคับรันบนฐาน)
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.5.mts                  (SKIP exit 0 เมื่อยังไม่มี hr/pin.ts)
//   --list = พิมพ์ทะเบียนข้อสอบ ไม่แตะ DB
// 🔴 ข้อสอบนี้ห้ามพิมพ์ PIN · hash · pepper ออกจอเด็ดขาด — ทุกข้อความผ่าน scrub() (PIN ของ fixture → <pin> · hex 64 → <hex64>)
// DB: ร้านชั่วคราว 3 ร้าน slug qc-hr-h0.5-<stamp>[-o|-bf] · ลบทั้งหมดใน finally (รวม ChatRateBucket hr-verifypin:/hr-kiosk:/hr-setpin: และ AuditLog
//     ของร้าน — ลบ audit ก่อนร้าน เพราะ AuditLog.tenant = SetNull) · Z1 + บรรทัด RESIDUE tenants=<n>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"; // H0.5 r3 ▸ S9.6 ไฟล์ env ปลอมชั่วคราว ◂
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import ts from "typescript";

const SUITE = "qc-hr-h0.5";
const ROOT = process.cwd();
const MODE = process.argv[2] ?? "";
const LIST = MODE === "--list";
const WORKER = MODE.endsWith("-worker");
const FORCE = process.env.QC_FORCE === "1";
const QC4_HOST_MARK = "ep-frosty-lab";
const SLUG_PREFIX = "qc-hr-h0.5-";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ ทะเบียนข้อสอบ (id · กลุ่ม · ความรุนแรง · ฐานคาด · หัวข้อ) ═════════════════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Def = readonly [string, string, Sev, "RED" | "GREEN", string];
const D = (id: string, g: string, sev: Sev, base: "RED" | "GREEN", title: string): Def => [`H0.5-${id}`, g, sev, base, title] as const;
const CHECKS: readonly Def[] = [
  D("S1.1", "R2", "CRITICAL", "RED", "[hash] hashPin: คนละร้าน PIN เดียวกัน = hash ต่างกัน · ค่าเดิม = hash เดิม · hex 64 ตัวพิมพ์เล็ก"),
  D("S1.2", "R2", "CRITICAL", "RED", "[hash] hashPin = HMAC-SHA256(key = HR_PIN_PEPPER, msg = tenantId + U+001F + pin) เป๊ะ (POS/backfill ต้องได้ค่าเดียวกัน)"),
  D("S1.3", "R2", "MAJOR", "RED", "[hash] process ลูกที่ pepper ต่าง → hash ต่างจากของแม่ (และตรงสูตรกับ pepper ของตัวเอง)"),
  D("S1.4", "R2", "CRITICAL", "RED", "[hash] process ลูกที่ไม่มี HR_PIN_PEPPER → hashPin โยน PinNotConfiguredError ข้อความไทยคงที่"),
  D("S1.5", "R2", "CRITICAL", "RED", "[hash] ไม่มี pepper → setPin/verifyPin ปฏิเสธด้วยข้อความเดียวกัน · แถวไม่มี PIN ตัวเปล่าหรือ hash"),
  D("S2.1", "R2", "MAJOR", "GREEN", "[setPin] PIN 4 / 5 / 6 หลัก → ok ทั้งสาม"),
  D("S2.2", "R2", "MAJOR", "GREEN", "[setPin] \"123\" / \"1234567\" / \"12a4\" → \"PIN ต้องเป็นตัวเลข 4-6 หลัก\" ทั้งสาม"),
  D("S2.3", "R2", "CRITICAL", "RED", "[setPin] 🔴 หลังตั้ง: pinHash = hash ตามสูตร · pinSetAt มีค่า · pinCode = null"),
  D("S2.4", "R2", "MAJOR", "RED", "[setPin] PIN ว่าง → ok · pinHash / pinSetAt / pinCode = null ทั้งสาม"),
  D("S2.5", "R2", "MAJOR", "RED", "[setPin] พนักงานพ้นสภาพ → \"ไม่พบพนักงาน\" · ไม่มี PIN"),
  D("X2.1", "X2", "CRITICAL", "GREEN", "[setPin] ctx ระบบ A + พนักงานของระบบ B (ร้านเดียวกัน) → \"ไม่พบพนักงาน\" · ไม่มี PIN"),
  D("S2.6", "R2", "MAJOR", "RED", "[audit] มี hr.pin.set และ hr.pin.clear ของพนักงานนั้น · ไม่มีตัวเลข PIN และ hash ใน before/after"),
  D("S3.1", "HQ3", "CRITICAL", "RED", "[unique] 🔴 PIN เดียวกัน 2 คน คนละระบบ HR ร้านเดียวกัน → คนที่สองได้ข้อความ D8 เป๊ะ · ไม่มี hash"),
  D("S3.2", "X6", "CRITICAL", "RED", "[race] 🔴 setPin PIN เดียวกัน 10 คนพร้อมกัน (2 process × 5 · connection แยก) × 3 รอบ → สำเร็จ 1 ต่อรอบ · ที่เหลือ D8"),
  D("S3.3", "X6", "CRITICAL", "RED", "[race] DB หลังแข่ง: ต่อรอบมี hash นั้น 1 แถว · ไม่มี PIN ตัวเปล่า"),
  D("S3.4", "R4", "MAJOR", "RED", "[unique] คนพ้นสภาพปล่อย PIN → คนที่ยังทำงานตั้ง PIN เดียวกันได้ (hash ตามสูตร)"),
  D("S3.5", "HQ3", "MAJOR", "RED", "[unique] อีกร้านใช้ PIN เดียวกันได้ (hash ของร้านนั้น)"),
  D("S3.6", "R1", "CRITICAL", "RED", "[db] pg_indexes: HrEmployee_tenantId_pinHash_active_key UNIQUE (tenantId, pinHash) WHERE active = true AND pinHash IS NOT NULL · ตัวเดียวที่แตะ pinHash"),
  D("S4.1", "C-8", "CRITICAL", "RED", "[verifyPin] PIN ถูก → { ok, employeeId, systemId, userId } เท่านั้น · userId = ผู้ใช้ที่ผูกไว้"),
  D("S4.2", "C-8", "MAJOR", "RED", "[verifyPin] พนักงานอีกระบบ HR ที่ไม่ผูกผู้ใช้ → ok · systemId ของระบบนั้น · userId = null"),
  D("S4.3", "C-8", "CRITICAL", "RED", "[verifyPin] PIN ผิด → { ok:false, reason:\"PIN ไม่ถูกต้อง\" } เท่านั้น"),
  D("S4.4", "C-8", "MAJOR", "RED", "[verifyPin] รูปแบบผิด (\"12\" · \"abcd\" · 7 หลัก · ว่าง) → ข้อความเดียวกับ PIN ผิด"),
  D("S4.5", "C-8", "CRITICAL", "RED", "[verifyPin] เจ้าของ PIN พ้นสภาพ → ไม่ยืนยัน"),
  D("X2.2", "X2", "CRITICAL", "RED", "[verifyPin] PIN ของอีกร้าน → ไม่ยืนยันในร้านนี้ (และยืนยันได้ในร้านของมัน)"),
  D("S4.6", "Q2", "MAJOR", "RED", "[verifyPin] systemId เป็นตัวกรอง (ระบบอื่น = ไม่ยืนยัน · ระบบตัวเอง = ok) · unitId รับแล้วไม่สนใจ"),
  D("S4.7", "C.9", "CRITICAL", "RED", "[verifyPin] ครั้งที่ 121 ใน 60 s ของร้านเดียว → \"ลองใหม่ในอีก N วินาที\" (PIN ถูกก็ไม่ผ่าน) · ถัง ChatRateBucket hr-verifypin:<tenantId>"),
  D("S4.8", "C-8", "CRITICAL", "RED", "[verifyPin] ทุกผลที่คืนไม่มี PIN · hash · ชื่อพนักงาน"),
  D("S4.9", "C-8", "MAJOR", "RED", "[static] hr/pin.ts ใช้ crypto timingSafeEqual + เทียบกับ dummy ตอนไม่เจอ (ตัวแปรชื่อมี dummy)"),
  D("S5.1", "HQ4", "CRITICAL", "RED", "[legacy] แถวมีแต่ pinCode (ตัวเปล่า) → verifyPin ok · employeeId ถูกคน"),
  D("S5.2", "HQ4", "CRITICAL", "RED", "[legacy] หลังยืนยัน: pinHash ตามสูตร · pinSetAt มีค่า · pinCode = null (อัปเกรดในที่)"),
  D("S5.3", "HQ4", "MAJOR", "RED", "[legacy] ยืนยันครั้งที่ 2 (ทาง hash) → ok คนเดิม"),
  D("S5.4", "HQ3", "CRITICAL", "RED", "[legacy] 🔴 PIN ตัวเปล่าซ้ำ 2 แถวในร้าน → ไม่ยืนยัน · ทั้งสองแถวไม่ถูกแตะ"),
  D("S5.5", "R3", "MAJOR", "GREEN", "[roster] kioskRoster: hasPin จริงทั้งแถว PIN ตัวเปล่าและแถว hash · เท็จเมื่อไม่มี PIN · คีย์ = id/name/position/hasPin เท่านั้น"),
  D("S5.6", "R2", "MAJOR", "RED", "[hasPin] hasPin(row) = !!pinHash || !!pinCode"),
  D("S5.7", "X6", "MAJOR", "RED", "[legacy] verifyPin พร้อมกัน 10 ครั้งบนแถวตัวเปล่า → ok ทั้ง 10 (คนเดียวกัน) · จบที่ hash ตามสูตร pinCode = null"),
  D("S6.1", "R6", "MAJOR", "RED", "[static] scripts/hr-backfill-pin-hash.mts มี · ใช้ loadQcEnv · กัน ep-royal-night เว้น HR_BACKFILL_PROD=1 · มี --apply / --tenant"),
  D("S6.2", "R6", "CRITICAL", "RED", "[backfill] dry-run exit 0 · JSON_SUMMARY ของร้าน = plain 4 · duplicates 2 · hashed 1 · toUpdate 2 (inactive 1) · changed 0"),
  D("S6.3", "R6", "CRITICAL", "RED", "[backfill] dry-run ไม่เขียนอะไร (6 แถวเหมือนก่อนรันทุกช่อง)"),
  D("S6.4", "R6", "CRITICAL", "RED", "[backfill] --apply exit 0 · changed 4 · ตัวเดี่ยว+พ้นสภาพ = hash ตามสูตร pinCode null · ซ้ำ = pinCode null pinHash null · แถว hash เดิมไม่เปลี่ยน · ไม่มี PIN ไม่เปลี่ยน"),
  D("S6.5", "R6", "MAJOR", "RED", "[backfill] audit hr.pin.backfill ของร้านนั้นพร้อมตัวเลข · ไม่มี PIN/hash"),
  D("S6.6", "R6", "CRITICAL", "RED", "[backfill] --apply ครั้งที่ 2 → exit 0 · changed 0 · ไม่มีแถวเปลี่ยน"),
  D("S6.7", "R7", "CRITICAL", "RED", "[backfill] output ทั้ง 3 รอบไม่มี PIN ของ fixture · hash · pepper · ชื่อเต็ม · dry-run ระบุ id ของแถวซ้ำ"),
  D("S7.1", "R3", "CRITICAL", "RED", "[kiosk] clockWithPin PIN ถูกบนแถวที่เป็น hash (pinCode null) → IN 1 แถว · มี verifyPinForEmployee"),
  D("S7.2", "R3", "MAJOR", "GREEN", "[kiosk] clockWithPin PIN ผิด → \"PIN ไม่ถูกต้อง\" · ไม่มีแถวเพิ่ม"),
  D("S7.3", "R3", "MAJOR", "GREEN", "[kiosk] พนักงานไม่มี PIN → \"<ชื่อ> ยังไม่มี PIN — ให้เจ้าของตั้งที่หน้าพนักงาน\" (ข้อความเดิม)"),
  D("S7.4", "R3", "CRITICAL", "RED", "[create] createEmployee({ pin }) → hash ตามสูตร · pinCode null"),
  D("S7.5", "R3", "MAJOR", "RED", "[create] createEmployee PIN ซ้ำ → สร้างพนักงานได้ · pinSet:false + ข้อความ D8 · ไม่มี PIN"),
  D("S7.6", "R4", "MAJOR", "RED", "[reactivate] A พ้นสภาพ → ตั้ง PIN เดิมของ A ให้ B (อีกระบบ) ได้"),
  D("S7.7", "R4", "CRITICAL", "RED", "[reactivate] 🔴 A กลับมาทำงาน → ok · pinCleared:true · A active · pinHash/pinSetAt null · B ยังถือ PIN"),
  D("S7.8", "R4", "MAJOR", "RED", "[reactivate] audit hr.pin.clear ของ A มีเหตุผล REACTIVATE_DUPLICATE"),
  D("S8.1", "F16.5", "CRITICAL", "RED", "[static] ไม่มี pinCode (src/** ทั้งหมด) / pinHash (hr · หน้า hr|kiosk|payroll · ai) นอก hr/pin.ts + seed-review-shop สะอาด (AST แบบ F16.5)"),
  D("S8.2", "R3", "MAJOR", "RED", "[static] hr/index.ts re-export verifyPin + ชนิดผลลัพธ์จาก ./pin พร้อมความเห็น C-8 · ยังไม่มี DB"),
  D("S8.3", "R1", "CRITICAL", "RED", "[static] migration 20261201000000_hr_pin_hash: ADD COLUMN pinHash/pinSetAt + partial unique · ไม่มี DROP · ความเห็นไทย · hr.prisma มี pinHash/pinSetAt และยังมี pinCode"),
  D("S8.4", "R5", "MAJOR", "RED", "[static] env.ts: HR_PIN_PEPPER: z.string().min(32).optional() บรรทัดมีเครื่องหมาย HR H0.5 ▸ · export hasPinPepper"),
  D("S8.5", "R7", "CRITICAL", "GREEN", "[static] privacy-shared.ts มี hasPin และไม่มี pinCode/pinHash ใน AST"),
  D("S8.6", "F16.5", "MAJOR", "RED", "[static] fitness-hr F165_BASELINE ว่าง · scanPinReaders() ว่าง · hr/pin.ts มีจริง"),
  D("S8.7", "R7", "MAJOR", "RED", "[static] hr/pin.ts: createHmac sha256 · ข้อความคงที่ (ไม่ได้ตั้งค่า / PIN ไม่ถูกต้อง / D8) · ไม่คืน e.message · ไม่มี console.*"),
  // ── r3 (S9) — มติผู้คุมงาน R3.1–R3.4 ──
  D("S9.1", "R3.1", "CRITICAL", "RED", "[verifyPin] ผู้เรียก A ผิด 10 ครั้ง → ครั้งที่ 11 (ผิด) และ PIN ถูกของ A = \"ลองใหม่ในอีก N วินาที\" · ถัง hr-verifypin:<tenantId>:<callerKey> · ผู้เรียก B (ร้านเดียวกัน) PIN ถูก ณ ตอนนั้น → ok (F3)"),
  D("S9.2", "R3.1", "CRITICAL", "RED", "[verifyPin] นับเฉพาะครั้งที่ผิด: ผู้เรียกเดียว PIN ถูก 130 ครั้งใน 60 s → ok ทั้งหมด · ไม่มีถังของร้าน/ผู้เรียกถูกนับ"),
  D("S9.3", "R3.1", "CRITICAL", "RED", "[verifyPin] ถังร้านนับความผิดข้ามผู้เรียก: ถูก 10 (ไม่นับ) + 12 ผู้เรียก × ผิด 10 = ผิดทั้ง 120 · ถังร้าน = 120 · ผู้เรียกที่ 13 ผิดครั้งแรก และผู้เรียกใหม่ PIN ถูก → ข้อความ limitedText (ไม่ใช่ PIN ไม่ถูกต้อง)"),
  D("S9.4", "R3.2", "MAJOR", "RED", "[audit] หลัง S9.1 มี hr.pin.locked ของผู้เรียก A ในร้านนั้น 1 แถวพอดี · มี callerKey + count · ไม่มี PIN / เลข 4–6 หลัก / id พนักงาน · ผิดครั้งที่ 12 แล้วยัง 1 แถว"),
  D("S9.5", "R3.1", "CRITICAL", "RED", "[verifyPin] ไม่มี callerKey (ไม่ส่ง / ว่าง) แม้ PIN ถูก → { ok:false, reason:\"PIN ไม่ถูกต้อง\" } · ไม่มีแถวถัง hr-verifypin:<tenantId>* เกิดขึ้น"),
  D("S9.6", "R3.3", "CRITICAL", "RED", "[backfill] HR_BACKFILL_PROD=1: ตั้ง HR_PIN_PEPPER ไว้ก่อน / ตั้ง DATABASE_URL ไว้ก่อน / ไม่มี HR_BACKFILL_ENV_FILE → exit 1 · stderr ข้อความไทยระบุชื่อตัวแปร · ไม่มี JSON_SUMMARY · แถว QC4 ไม่เปลี่ยน (ไฟล์ env ปลอม)"),
  D("S9.7", "R3.4", "MAJOR", "RED", "[action] createEmployeeAction ส่ง pin มาด้วย (PIN ว่าง และ PIN ที่คนอื่นถือ) → สร้างพนักงาน · ไม่มี PIN (pinHash/pinCode/pinSetAt null) · ไม่มีข้อความ D8 · pinSet ไม่เป็น true"),
  D("Z1", "-", "CRITICAL", "GREEN", "คืนสภาพ: ร้าน qc-hr-h0.5-* ถูกลบ · ไม่เหลือแถว HR/audit ของร้าน · ไม่เหลือ ChatRateBucket ของร้าน · ผู้ใช้ชั่วคราวถูกลบ"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · กลุ่ม · sev · ฐานคาด · หัวข้อ)`);
  for (const [id, g, sev, base, t] of CHECKS) console.log(`${id}\t${g}\t${sev}\t${base}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ ค่าคงที่ของสัญญา ═════════════════════════
const T_D8 = "PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น";
const T_FORMAT = "PIN ต้องเป็นตัวเลข 4-6 หลัก";
const T_NOTFOUND = "ไม่พบพนักงาน";
const T_WRONG = "PIN ไม่ถูกต้อง";
const T_NOCONF = "ระบบยังไม่ได้ตั้งค่าความปลอดภัยของ PIN — แจ้งผู้ดูแลระบบ";
const RE_LIMIT = /^ลองใหม่ในอีก \d+ วินาที$/;
const T_NOPIN = (name: string) => `${name} ยังไม่มี PIN — ให้เจ้าของตั้งที่หน้าพนักงาน`;

// PIN ทดสอบ (ห้ามพิมพ์ — scrub() แทนด้วย <pin>) · ทุกตัวไม่ซ้ำกันในร้านเดียวกัน
const PINS = {
  h: "1234", // S1 (คำนวณ hash อย่างเดียว ไม่ลง DB)
  noPep: "246813",
  p4: "4826", p5: "48261", p6: "482613", inact: "590417", otherSys: "590418",
  s31: "617283", race: ["701101", "702202", "703303"], s34: "640640",
  v4a: "835201", v4b: "835202", v4c: "835203", v4o: "835204", vWrong: "835209", vTimeWrong: "835299", vRateWrong: "835298",
  l51: "926401", l52: "926402", l53: "926403", l54: "926404",
  bfDup: "583927", bfInact: "640218", bfUniq: "719364", bfHashed: "802157",
  k71: "157301", k7w: "157309", c72: "157302", re: "2468",
} as const;
const SECRET_PINS = new Set<string>(Object.values(PINS).flatMap((v) => (Array.isArray(v) ? v : [v as string])));
// H0.5 r3 ▸ PIN ของ S9 (ห้ามพิมพ์เหมือนกัน) ◂
const PINS9 = { wrong: "835297", createFree: "157303" } as const;
for (const p of Object.values(PINS9)) SECRET_PINS.add(p);
const PEPPER = process.env.HR_PIN_PEPPER ?? "";
const specHash = (tenantId: string, pin: string, pepper = PEPPER) => createHmac("sha256", pepper).update(`${tenantId}\u001f${pin}`).digest("hex");

/** ลบความลับออกจากข้อความก่อนพิมพ์ — pepper · hex 64 · PIN ของ fixture */
function scrub(s: unknown): string {
  let o = typeof s === "string" ? s : (() => {
    try {
      return JSON.stringify(s) ?? String(s);
    } catch {
      return String(s);
    }
  })();
  const pep = process.env.HR_PIN_PEPPER ?? PEPPER;
  if (pep) o = o.split(pep).join("<pepper>");
  o = o.replace(/[0-9a-f]{64}/gi, "<hex64>");
  for (const p of [...SECRET_PINS].sort((a, b) => b.length - a.length)) o = o.split(p).join("<pin>");
  return o;
}

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , , , t]) => [id, t]));
const SEV = new Map(CHECKS.map(([id, , sev]) => [id, sev]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = `H0.5-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: scrub(String(expected)), actual: scrub(String(actual)).slice(0, 400) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const failAll = (ids: string[], why: string) => {
  for (const id of ids) chk(id, false, "ถูกตรวจ", why);
};
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const squash = (s: string) => s.replace(/\s+/g, " ");
const short = (v: unknown, n = 220) => scrub(v).slice(0, n);
const errText = (e: unknown) => scrub((e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, " ")).slice(0, 200);
const keysOf = (o: unknown) => (o && typeof o === "object" ? Object.keys(o as object).sort().join(",") : `(${typeof o})`);
async function safe<T>(f: () => Promise<T> | T): Promise<T | { THROW: string }> {
  try {
    return await f();
  } catch (e) {
    return { THROW: errText(e) };
  }
}
const isThrow = (r: unknown): r is { THROW: string } => !!r && typeof r === "object" && "THROW" in (r as object);

const PIN_FILE = "src/lib/modules/hr/pin.ts";
const BACKFILL_FILE = "scripts/hr-backfill-pin-hash.mts";
const MIGRATION_FILE = "prisma/migrations/20261201000000_hr_pin_hash/migration.sql";
const INDEX_FILE = "src/lib/modules/hr/index.ts";
const ENV_FILE = "src/lib/env.ts";
const SCHEMA_FILE = "prisma/schema/hr.prisma";
const PRIVACY_SHARED = "src/lib/modules/hr/privacy-shared.ts";
const PRIVACY_FILE = "src/lib/modules/hr/privacy.ts";
const SEED_REVIEW = "scripts/seed-review-shop.mts";
const INDEX_NAME = "HrEmployee_tenantId_pinHash_active_key";

// ═════════════════════════ static ═════════════════════════
function walk(dir: string, filter: (p: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}
const posix = (p: string) => p.split(sep).join("/");
/** จุดแตะชื่อช่อง (ชนิด node เดียวกับ F16.5 ของ fitness-hr — property access · ["x"] · { x: … } · { x } = · สตริงที่มีชื่อ) · คอมเมนต์ไม่นับ */
function fieldHits(abs: string, text: string, names: ReadonlySet<string>): { line: number; name: string }[] {
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: { line: number; name: string }[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const re = new RegExp(`\\b(${[...names].join("|")})\\b`);
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) && names.has(n.name.text)) hits.push({ line: at(n), name: n.name.text });
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && names.has(n.argumentExpression.text)) hits.push({ line: at(n), name: n.argumentExpression.text });
    else if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && names.has(n.name.text)) hits.push({ line: at(n), name: n.name.text });
    else if (ts.isBindingElement(n)) {
      const k = n.propertyName ?? n.name;
      if ((ts.isIdentifier(k) || ts.isStringLiteral(k)) && names.has(k.text)) hits.push({ line: at(n), name: k.text });
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && re.test(n.text)) {
      const p = n.parent;
      const counted = (ts.isPropertyAssignment(p) && p.name === n) || (ts.isElementAccessExpression(p) && p.argumentExpression === n) || (ts.isBindingElement(p) && p.propertyName === n);
      if (!counted) hits.push({ line: at(n), name: (re.exec(n.text) ?? ["?"])[0] });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

let staticDone = false;
async function runStatic(): Promise<void> {
  if (staticDone) return;
  staticDone = true;
  const pin = rd(PIN_FILE);

  // S4.9 — timingSafeEqual + dummy
  const tse = (pin.match(/timingSafeEqual\s*\(/g) ?? []).length;
  const dummy = /\b\w*dummy\w*\b/i.test(pin.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  chk("S4.9", !!pin && tse >= 1 && dummy, "timingSafeEqual( ≥1 · ตัวแปร *dummy*", pin ? `timingSafeEqual×${tse} dummy=${dummy}` : `ไม่มี ${PIN_FILE}`);

  // S6.1 — สคริปต์ backfill
  const bf = rd(BACKFILL_FILE);
  const s61 = {
    exists: !!bf,
    loadQcEnv: /loadQcEnv\s*\(/.test(bf),
    prodGuard: bf.includes("ep-royal-night") && bf.includes("HR_BACKFILL_PROD"),
    apply: bf.includes("--apply"),
    tenant: bf.includes("--tenant"),
  };
  chk("S6.1", Object.values(s61).every(Boolean), "exists·loadQcEnv·prodGuard·--apply·--tenant", short(s61));

  // S8.1 — กระจก F16.5 (pinCode ทั้ง src · pinHash เฉพาะพื้นที่ HR)
  const files = walk(join(ROOT, "src"), (p) => /\.(ts|tsx|mts)$/.test(p) && !p.endsWith(".d.ts"));
  const hrArea = (rel: string) =>
    rel.startsWith("src/lib/modules/hr/") || rel.startsWith("src/lib/ai/") || (rel.startsWith("src/app/") && rel.split("/").some((s) => s === "hr" || s === "kiosk" || s === "payroll"));
  const offenders: string[] = [];
  for (const abs of [...files, join(ROOT, SEED_REVIEW)]) {
    if (!existsSync(abs)) continue;
    const rel = posix(relative(ROOT, abs));
    if (rel === PIN_FILE) continue;
    const text = readFileSync(abs, "utf8");
    if (!text.includes("pinCode") && !text.includes("pinHash")) continue;
    const names = new Set<string>(["pinCode"]);
    if (hrArea(rel) || rel === SEED_REVIEW) names.add("pinHash");
    const hits = fieldHits(abs, text, names);
    if (hits.length) offenders.push(`${rel}:${hits.map((h) => `${h.line}(${h.name})`).join(",")}`);
  }
  chk("S8.1", offenders.length === 0 && !!pin, `0 จุดนอก ${PIN_FILE} · ${PIN_FILE} มีจริง`, offenders.length ? `${offenders.length} ไฟล์: ${offenders.join(" · ")}` : `สะอาด · pin.ts=${!!pin}`);

  // S8.2 — facade
  const idx = rd(INDEX_FILE);
  const s82 = {
    verifyPin: /export\s*\{[^}]*\bverifyPin\b[^}]*\}\s*from\s*["']\.\/pin["']/.test(idx),
    resultType: /export\s+type\s*\{[^}]*VerifyPin\w*[^}]*\}\s*from\s*["']\.\/pin["']/i.test(idx),
    c8: /C-8/.test(idx),
    noDb: !/from\s*["']@\/lib\/core\/db["']/.test(idx) && !/new\s+PrismaClient/.test(idx),
  };
  chk("S8.2", Object.values(s82).every(Boolean), "{verifyPin,resultType,c8,noDb}=true", short(s82));

  // S8.3 — migration + schema
  const mig = rd(MIGRATION_FILE);
  const migCode = mig.replace(/--.*$/gm, "");
  const block = (() => {
    const s = rd(SCHEMA_FILE);
    const i = s.indexOf("model HrEmployee {");
    return i < 0 ? "" : s.slice(i, s.indexOf("\n}", i));
  })();
  const s83 = {
    file: !!mig,
    addHash: /ADD\s+COLUMN\s+"pinHash"\s+TEXT/i.test(migCode),
    addSetAt: /ADD\s+COLUMN\s+"pinSetAt"\s+TIMESTAMP\(3\)/i.test(migCode),
    index: new RegExp(
      `CREATE\\s+UNIQUE\\s+INDEX\\s+"${INDEX_NAME}"\\s+ON\\s+"HrEmployee"\\s*\\(\\s*"tenantId"\\s*,\\s*"pinHash"\\s*\\)\\s*WHERE\\s+"active"\\s*=\\s*true\\s+AND\\s+"pinHash"\\s+IS\\s+NOT\\s+NULL`,
      "i",
    ).test(migCode),
    noDrop: !/\bDROP\b/i.test(migCode),
    thaiComment: /--[^\n]*[฀-๿]/.test(mig),
    schemaHash: /\n\s*pinHash\s+String\?/.test(block),
    schemaSetAt: /\n\s*pinSetAt\s+DateTime\?/.test(block),
    schemaKeepsCode: /\n\s*pinCode\s+String\?/.test(block),
  };
  chk("S8.3", Object.values(s83).every(Boolean), "ทุกช่อง true", short(s83, 400));

  // S8.4 — env
  const env = rd(ENV_FILE);
  const lines = env.split("\n");
  const li = lines.findIndex((l) => /HR_PIN_PEPPER\s*:\s*z\.string\(\)\.min\(32\)\.optional\(\)/.test(l));
  const marked = li >= 0 && (lines[li]!.includes("HR H0.5 ▸") || (lines[li - 1] ?? "").includes("HR H0.5 ▸"));
  const s84 = { schema: li >= 0, marked, hasPinPepper: /export\s+const\s+hasPinPepper\b/.test(env) };
  chk("S8.4", Object.values(s84).every(Boolean), "{schema,marked,hasPinPepper}=true", short(s84));

  // S8.5 — DTO
  const ps = rd(PRIVACY_SHARED);
  const psHits = ps ? fieldHits(join(ROOT, PRIVACY_SHARED), ps, new Set(["pinCode", "pinHash"])) : [];
  const priv = rd(PRIVACY_FILE);
  chk(
    "S8.5",
    !!ps && /\bhasPin\b/.test(ps) && psHits.length === 0,
    "hasPin มี · pinCode/pinHash 0 จุด",
    `hasPin=${/\bhasPin\b/.test(ps)} hits=${psHits.map((h) => `${h.line}(${h.name})`).join(",") || 0} · privacy.ts ใช้ hasPin( จาก ./pin=${/hasPin\s*\(/.test(priv) && /from\s*["']\.\/pin["']/.test(priv)} [info]`,
  );

  // S8.6 — ratchet F16.5
  let s86 = "";
  let ok86 = false;
  try {
    const fh = (await import("./fitness-hr.mjs" as string)) as Any;
    const base = fh.F165_BASELINE as Map<string, unknown>;
    const scan = fh.scanPinReaders(ROOT) as Map<string, unknown[]>;
    ok86 = base.size === 0 && scan.size === 0 && existsSync(join(ROOT, PIN_FILE));
    s86 = `baseline=${base.size} scan=${scan.size}${scan.size ? ` (${[...scan.keys()].join(",")})` : ""} pin.ts=${existsSync(join(ROOT, PIN_FILE))}`;
  } catch (e) {
    s86 = `import fitness-hr ล้ม: ${errText(e)}`;
  }
  chk("S8.6", ok86, "baseline=0 scan=0 pin.ts=true", s86);

  // S8.7 — สุขอนามัยของ pin.ts
  const code = pin.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const s87 = {
    exists: !!pin,
    hmac: /createHmac\(\s*["']sha256["']/.test(pin),
    noconfText: pin.includes(T_NOCONF),
    wrongText: pin.includes(T_WRONG),
    d8Text: pin.includes(T_D8),
    noErrMessage: !/\b(e|err|error)\.message\b/.test(code),
    noConsole: !/\bconsole\.\w+\(/.test(code),
  };
  chk("S8.7", Object.values(s87).every(Boolean), "ทุกช่อง true", short(s87));
}

// ═════════════════════════ ของ H0.5 มีแล้วหรือยัง (ไม่มี hr/pin.ts = SKIP เว้น QC_FORCE=1) ═════════════════════════
const missing: string[] = [];
if (!existsSync(join(ROOT, PIN_FILE))) missing.push(`ยังไม่มี ${PIN_FILE}`);
if (!existsSync(join(ROOT, BACKFILL_FILE))) missing.push(`ยังไม่มี ${BACKFILL_FILE}`);
if (!existsSync(join(ROOT, MIGRATION_FILE))) missing.push(`ยังไม่มี ${MIGRATION_FILE}`);
const PIN_PRESENT = existsSync(join(ROOT, PIN_FILE));
if (!PIN_PRESENT && !FORCE && !WORKER) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของ H0.5 ยังไม่มี (hr/pin.ts คือด่าน)`);
  for (const r of missing) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], findings: [], skipped: true, reason: missing, registered: CHECKS.length })}`);
  process.exit(0);
}

// ═════════════════════════ env (QC4 เท่านั้น) ═════════════════════════
// โหมดลูก: env มาจากแม่ทั้งก้อน (ไม่โหลดไฟล์ซ้ำ — ไม่งั้น loadEnvFile เติม HR_PIN_PEPPER คืนให้ลูกที่ตั้งใจไม่มี pepper)
if (!WORKER) {
  process.env.QC_ENV_FILE ??= ".env.qc";
  if (process.env.QC_ENV_FILE === ".env") {
    console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env คือ production — ห้าม`);
    process.exit(4);
  }
  const { loadLegacyQcEnv } = await import("./qc-env-guard.mjs" as string);
  loadLegacyQcEnv(SUITE);
}
{
  const bad = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    ["DIRECT_URL", process.env.DIRECT_URL ?? ""],
  ].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนแถวได้เฉพาะ QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
  if (!WORKER) {
    let host = "?";
    try {
      host = new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      /* พิมพ์แค่ host */
    }
    console.log(`[${SUITE}] DB host = ${host} (${host.includes(QC4_HOST_MARK) ? "QC4 ✓" : "ไม่ใช่ QC4"})`);
    console.log(`[${SUITE}] ${(process.env.HR_PIN_PEPPER?.length ?? 0) >= 32 ? "pepper present" : "pepper MISSING (HR_PIN_PEPPER < 32 ตัว/ไม่มี)"}`);
  }
}
// ค่า pepper ของแม่ (อ่านหลังโหลด env — ค่าคงที่ PEPPER ด้านบนอ่านก่อนโหลด)
const PEP = process.env.HR_PIN_PEPPER ?? "";
const spec = (tenantId: string, pin: string) => specHash(tenantId, pin, PEP);

// H0.5 r3 ▸ S9.7 เรียก server action ใน Next request scope จำลอง — AsyncLocalStorage ต้องอยู่บน globalThis ก่อนโมดูล next ตัวแรกโหลด
//   (ไม่งั้น next ใช้ตัวปลอมที่โยน "Invariant: AsyncLocalStorage accessed in runtime where it is not available") · ไม่กระทบ S1–S8 ◂
{
  const { AsyncLocalStorage } = await import("node:async_hooks");
  (globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
}
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const { Prisma } = (await import("@prisma/client")) as Any;
const sys = (await import("@/lib/modules/system/service")) as Any;
const hr = (await import("@/lib/modules/hr/service")) as Any;
const idx = (await import("@/lib/modules/hr" as string).catch(() => ({}))) as Any;
let pinImportErr = "";
const pinMod = (await import("@/lib/modules/hr/pin" as string).catch((e: unknown) => {
  pinImportErr = existsSync(join(ROOT, PIN_FILE)) ? `import ล้ม: ${errText(e)}` : "module absent: hr/pin.ts";
  return null;
})) as Any;
const HR_FIELDS: string[] = (Prisma?.dmmf?.datamodel?.models ?? []).find((m: Any) => m.name === "HrEmployee")?.fields?.map((f: Any) => f.name) ?? [];
const HAS_HASH = HR_FIELDS.includes("pinHash") && HR_FIELDS.includes("pinSetAt");
const setPinFn: Any = pinMod?.setPin ?? hr.setPin;
const verifyFn: Any = idx?.verifyPin ?? pinMod?.verifyPin ?? null;

// ═════════════════════════ โหมดลูก ═════════════════════════
if (MODE === "--pepper-worker") {
  // แม่ส่ง env ทั้งก้อน: kind=other → HR_PIN_PEPPER ใหม่ · kind=missing → ไม่มี HR_PIN_PEPPER · พิมพ์แค่ boolean
  const [, , , kind, wT, wS, wE] = process.argv as string[];
  const out: Any = { pepperAbsent: process.env.HR_PIN_PEPPER === undefined, module: !!pinMod?.hashPin };
  if (pinMod?.hashPin) {
    if (kind === "other") {
      const h = await safe(() => String(pinMod.hashPin(wT, PINS.h)));
      out.threw = isThrow(h);
      out.sameAsParent = !isThrow(h) && h === process.env.QC_H05_EXPECT;
      out.spec = !isThrow(h) && h === specHash(String(wT), PINS.h, process.env.HR_PIN_PEPPER ?? "");
      out.hex64 = !isThrow(h) && /^[0-9a-f]{64}$/.test(h as string);
    } else {
      try {
        pinMod.hashPin(wT, PINS.h);
        out.hash = { threw: false };
      } catch (e) {
        out.hash = {
          threw: true,
          name: (e as Error)?.name ?? "?",
          text: (e as Error)?.message === T_NOCONF,
          inst: typeof pinMod.PinNotConfiguredError === "function" && e instanceof pinMod.PinNotConfiguredError,
        };
      }
      const r = await safe(() => setPinFn({ tenantId: wT, systemId: wS }, wE, PINS.noPep));
      out.setPin = isThrow(r) ? { threw: true, noconf: r.THROW.includes(T_NOCONF) || /PinNotConfigured/.test(r.THROW) } : { ok: (r as Any)?.ok === true, text: (r as Any)?.reason === T_NOCONF };
      if (verifyFn) {
        const v = await safe(() => verifyFn({ tenantId: wT, pin: PINS.noPep }));
        out.verify = isThrow(v) ? { threw: true, noconf: v.THROW.includes(T_NOCONF) || /PinNotConfigured/.test(v.THROW) } : { ok: (v as Any)?.ok === true, text: (v as Any)?.reason === T_NOCONF };
      } else out.verify = { absent: true };
    }
  }
  console.log("PEPPER_RESULT " + JSON.stringify(out));
  await P.$disconnect().catch(() => {});
  process.exit(0);
}
if (MODE === "--race-worker") {
  // setPin PIN เดียวกันพร้อมกัน ณ เวลานัด · อุ่น pool ให้มี connection แยก ≥ 5 เส้นก่อน
  const spec0 = JSON.parse(Buffer.from(String(process.argv[3]), "base64url").toString("utf8")) as { tid: string; rounds: { go: number; r: number; emps: { s: string; e: string }[] }[] };
  const warm = (await Promise.all(Array.from({ length: 5 }, () => P.$queryRaw`SELECT pg_backend_pid()::int AS pid, (SELECT 1 FROM pg_sleep(0.5))::int AS z`))) as Any[];
  const pids = new Set(warm.map((w: Any) => w?.[0]?.pid)).size;
  const rounds: Any[] = [];
  for (const rr of spec0.rounds) {
    const late = Date.now() > rr.go;
    while (Date.now() < rr.go) await sleep(2);
    const rs = await Promise.all(rr.emps.map((x) => safe(() => setPinFn({ tenantId: spec0.tid, systemId: x.s }, x.e, PINS.race[rr.r]!))));
    rounds.push({ r: rr.r, late, rs: rs.map((x: Any) => (isThrow(x) ? { ok: false, d8: false, t: "THROW" } : { ok: x?.ok === true, d8: x?.reason === T_D8, t: x?.ok ? "" : String(x?.reason ?? "") })) });
  }
  console.log("RACE_RESULT " + JSON.stringify({ pids, rounds }));
  await P.$disconnect().catch(() => {});
  process.exit(0);
}

if (FORCE && missing.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด: ${missing.join(" · ")} (คาด: แดงตามเหตุผล ไม่ crash)`);
console.log(`[${SUITE}] hr/pin.ts=${pinMod ? "โหลดได้" : pinImportErr} · facade verifyPin=${idx?.verifyPin ? "มี" : "ไม่มี"} · Prisma HrEmployee.pinHash=${HAS_HASH ? "มี" : "ไม่มี"} · setPin จาก ${pinMod?.setPin ? "hr/pin" : "hr/service (ของเดิม)"}`);

// ═════════════════════════ fixture ═════════════════════════
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tids: string[] = [];
const users: string[] = [];
const ids: string[] = [];
let T1 = "";
let T2 = "";
let T3 = "";

type EmpOpt = { pinCode?: string | null; active?: boolean; linkedUserId?: string | null; pinHash?: string | null; pinSetAt?: Date | null };
async function mkEmp(tenantId: string, systemId: string, name: string, o: EmpOpt = {}): Promise<string> {
  const data: Any = { tenantId, systemId, name, pinCode: o.pinCode ?? null, active: o.active ?? true, linkedUserId: o.linkedUserId ?? null };
  if (HAS_HASH && o.pinHash !== undefined) {
    data.pinHash = o.pinHash;
    data.pinSetAt = o.pinSetAt ?? null;
  }
  const e = await P.hrEmployee.create({ data, select: { id: true } });
  ids.push(e.id);
  return e.id as string;
}
type PinSt = { exists: boolean; active: boolean | null; code: string | null; hash: string | null | undefined; setAt: Date | null | undefined };
async function st(id: string): Promise<PinSt> {
  const select: Any = HAS_HASH ? { pinCode: true, pinHash: true, pinSetAt: true, active: true } : { pinCode: true, active: true };
  const r = await P.hrEmployee.findUnique({ where: { id }, select });
  return { exists: !!r, active: r ? !!r.active : null, code: r?.pinCode ?? null, hash: HAS_HASH ? (r?.pinHash ?? null) : undefined, setAt: HAS_HASH ? (r?.pinSetAt ?? null) : undefined };
}
/** ข้อความอธิบายสถานะ PIN แบบไม่เปิดค่า */
const desc = (s: PinSt, t?: string, pin?: string) =>
  `${s.exists ? "" : "ไม่มีแถว "}active=${s.active} plain=${s.code === null ? "none" : pin && s.code === pin ? "SET(=pin)" : "SET"} hash=${
    s.hash === undefined ? "n/a(ไม่มีคอลัมน์)" : s.hash === null ? "none" : t && pin && s.hash === spec(t, pin) ? "match" : "other"
  } setAt=${s.setAt === undefined ? "n/a" : s.setAt ? "Y" : "N"}`;
const hashedOk = (s: PinSt, t: string, pin: string) => s.exists && s.code === null && typeof s.hash === "string" && s.hash === spec(t, pin) && s.setAt instanceof Date;
const noPin = (s: PinSt) => s.exists && s.code === null && (s.hash === null || s.hash === undefined) && (s.setAt === null || s.setAt === undefined);
const noPinStrict = (s: PinSt) => s.exists && s.code === null && s.hash === null && s.setAt === null;
const snapKey = (s: PinSt) => JSON.stringify([s.exists, s.active, s.code, s.hash ?? null, s.setAt instanceof Date ? s.setAt.toISOString() : null]);
const rowsOf = (employeeId: string): Promise<Any[]> => P.hrAttendance.findMany({ where: { employeeId }, select: { id: true, kind: true } });
const resetVerifyBucket = (t: string) => P.chatRateBucket.deleteMany({ where: { key: { startsWith: `hr-verifypin:${t}` } } });
async function audits(tenantId: string, actions: string[]): Promise<Any[]> {
  return P.auditLog.findMany({ where: { tenantId, action: { in: actions } }, select: { action: true, targetId: true, targetType: true, before: true, after: true }, orderBy: { createdAt: "asc" } });
}
/** before/after ไม่มี PIN หรือ hash (ตัด id ที่รู้จักออกก่อน — cuid อาจมีเลขบังเอิญ) */
function auditClean(rows: Any[], pins: string[], hashes: string[]): boolean {
  for (const r of rows) {
    let s = JSON.stringify({ b: r.before ?? null, a: r.after ?? null });
    for (const x of [...tids, ...ids, ...users]) s = s.split(x).join("<id>");
    if (pins.some((p) => s.includes(p)) || hashes.some((h) => h && s.includes(h)) || (PEP && s.includes(PEP))) return false;
  }
  return true;
}
const auditOf = (rows: Any[], empId: string, action: string) => rows.filter((r) => r.action === action && (r.targetId === empId || JSON.stringify([r.before, r.after]).includes(empId)));

function spawnSelf(args: string[], tag: string, env: Record<string, string | undefined>): Promise<Any> {
  return new Promise((res) => {
    const c = spawn("pnpm", ["exec", "tsx", "scripts/qc-hr-h0.5.mts", ...args], { env: env as NodeJS.ProcessEnv });
    let o = "";
    let er = "";
    const kill = setTimeout(() => c.kill("SIGKILL"), 240_000);
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (er += String(d)));
    c.on("error", (e) => res({ error: errText(e) }));
    c.on("close", () => {
      clearTimeout(kill);
      const m = new RegExp(`${tag} (.*)`).exec(o);
      try {
        res(m ? JSON.parse(m[1]!) : { error: `ไม่มี ${tag}: ${scrub((o + er).replace(/\s+/g, " ")).slice(-300)}` });
      } catch (e) {
        res({ error: errText(e) });
      }
    });
  });
}
const envWith = (extra: Record<string, string>, drop: string[] = []) => {
  const e: Record<string, string | undefined> = { ...process.env, ...extra };
  for (const k of drop) delete e[k];
  return e;
};

/** สคริปต์ backfill เป็น process ลูกผ่าน scripts/qc4.sh (ด่าน host) — ไม่ซ้อน iso.sh (ทิ้ง env) / with-gate-lock (แม่ถือล็อก qc4 อยู่ = รอตัวเอง) */
function runBackfill(extra: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((res) => {
    const c = spawn("bash", ["scripts/qc4.sh", "pnpm", "exec", "tsx", BACKFILL_FILE, "--tenant", T3, ...extra], { env: process.env });
    let o = "";
    const kill = setTimeout(() => c.kill("SIGKILL"), 240_000);
    c.stdout.on("data", (d) => (o += String(d)));
    c.stderr.on("data", (d) => (o += String(d)));
    c.on("error", (e) => res({ code: -1, out: `spawn error ${errText(e)}` }));
    c.on("close", (code) => {
      clearTimeout(kill);
      res({ code, out: o });
    });
  });
}
/** แถวสรุปของร้านจาก JSON_SUMMARY บรรทัดสุดท้าย: { tenants:[{tenantId,…}] } หรือ { tenantId,… } */
function bfEntry(out: string, tenantId: string): Any | null {
  const lines = out.split("\n").filter((l) => l.startsWith("JSON_SUMMARY "));
  if (!lines.length) return null;
  try {
    const j = JSON.parse(lines[lines.length - 1]!.slice("JSON_SUMMARY ".length));
    const t = Array.isArray(j?.tenants) ? j.tenants.find((x: Any) => x?.tenantId === tenantId) : j?.tenantId === tenantId ? j : null;
    return t ? { ...t, mode: j.mode } : null;
  } catch {
    return null;
  }
}
const num = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : NaN);

async function runDb(): Promise<void> {
  // ── setup: 3 ร้าน · T1 มีระบบ HR 2 ระบบ (A, B) · T2 = อีกร้าน · T3 = ร้านของ backfill (นับเป๊ะ) ──
  const mkTenant = async (name: string, suffix: string) => {
    const t = await P.tenant.create({ data: { name, slug: `${SLUG}${suffix}` } });
    tids.push(t.id);
    return t.id as string;
  };
  T1 = await mkTenant("QC HR H0.5 PIN", "");
  T2 = await mkTenant("QC HR H0.5 อีกร้าน", "-o");
  T3 = await mkTenant("QC HR H0.5 backfill", "-bf");
  const sA = (await sys.createSystem(T1, "HR", "ทีม A")).id as string;
  const sB = (await sys.createSystem(T1, "HR", "ทีม B")).id as string;
  const sO = (await sys.createSystem(T2, "HR", "ทีมอีกร้าน")).id as string;
  const sX = (await sys.createSystem(T3, "HR", "ทีม backfill")).id as string;
  ids.push(sA, sB, sO, sX);
  const ctxA = { tenantId: T1, systemId: sA };
  const ctxB = { tenantId: T1, systemId: sB };
  const ctxO = { tenantId: T2, systemId: sO };
  const u = await P.user.create({ data: { email: `${SLUG}-link@qc.invalid`, name: `QC ผูกบัญชี ${stamp}` } });
  users.push(u.id);

  // แข่ง (S3.2) — สร้างพนักงานก่อน แล้วปล่อย 2 process ลูกล่วงหน้า (นัดเวลา) เพื่อไม่ต้องรอ tsx บูต
  const raceEmps: { s: string; e: string }[][] = [];
  for (let r = 0; r < 3; r++) {
    const list: { s: string; e: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const s = i % 2 === 0 ? sA : sB;
      list.push({ s, e: await mkEmp(T1, s, `แข่ง ${r}-${i} ${stamp}`) });
    }
    raceEmps.push(list);
  }
  const goBase = Date.now() + 55_000;
  const raceSpec = (half: number) =>
    Buffer.from(JSON.stringify({ tid: T1, rounds: raceEmps.map((list, r) => ({ r, go: goBase + r * 5_000, emps: list.filter((_, i) => (i < 5 ? 0 : 1) === half) })) })).toString("base64url");
  const raceP = Promise.all([0, 1].map((h) => spawnSelf(["--race-worker", raceSpec(h)], "RACE_RESULT", envWith({}))));

  // ═══ S1 hash ═══
  console.log("── [S1] hashPin + pepper ──");
  const ePep = await mkEmp(T1, sA, `ไม่มีpepper ${stamp}`);
  if (!pinMod?.hashPin) {
    failAll(["S1.1", "S1.2", "S1.3", "S1.4", "S1.5"], pinImportErr || "hr/pin.ts ไม่มี hashPin");
  } else {
    const h1 = await safe(() => String(pinMod.hashPin(T1, PINS.h)));
    const h1b = await safe(() => String(pinMod.hashPin(T1, PINS.h)));
    const h2 = await safe(() => String(pinMod.hashPin(T2, PINS.h)));
    const hex = (h: unknown) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);
    chk("S1.1", hex(h1) && hex(h2) && h1 === h1b && h1 !== h2, "hex64 · เดิม=เดิม · คนละร้าน≠", `hex=${hex(h1)}/${hex(h2)} same=${h1 === h1b} diffTenant=${h1 !== h2}${isThrow(h1) ? ` THROW ${h1.THROW}` : ""}`);
    chk("S1.2", PEP.length >= 32 && h1 === spec(T1, PINS.h) && h2 === spec(T2, PINS.h), "ตรงสูตร HMAC ทั้งสองร้าน", `pepper=${PEP.length >= 32 ? "present" : "missing"} T1=${h1 === spec(T1, PINS.h)} T2=${h2 === spec(T2, PINS.h)}`);
    const other = randomBytes(32).toString("hex");
    const wO = await spawnSelf(["--pepper-worker", "other", T1, sA, ePep], "PEPPER_RESULT", envWith({ HR_PIN_PEPPER: other, QC_H05_EXPECT: isThrow(h1) ? "" : h1 }));
    chk("S1.3", !wO?.error && wO.module && wO.threw === false && wO.sameAsParent === false && wO.spec === true && wO.hex64 === true, "ลูก: hash ≠ แม่ · ตรงสูตรกับ pepper ของลูก", short(wO));
    const wM = await spawnSelf(["--pepper-worker", "missing", T1, sA, ePep], "PEPPER_RESULT", envWith({}, ["HR_PIN_PEPPER", "QC_H05_EXPECT"]));
    chk(
      "S1.4",
      !wM?.error && wM.pepperAbsent === true && wM.hash?.threw === true && wM.hash.text === true && (wM.hash.name === "PinNotConfiguredError" || wM.hash.inst === true),
      "ลูกไม่มี pepper (ตรวจแล้ว) · โยน PinNotConfiguredError ข้อความคงที่",
      short(wM),
    );
    const sPep = await st(ePep);
    const refused = (x: Any) => !!x && ((x.threw === true && x.noconf === true) || (x.ok === false && x.text === true));
    chk("S1.5", !wM?.error && wM.pepperAbsent === true && refused(wM.setPin) && refused(wM.verify) && noPin(sPep), "setPin/verifyPin ปฏิเสธด้วยข้อความ · แถวไม่มี PIN", `${short({ setPin: wM?.setPin, verify: wM?.verify })} · ${desc(sPep)}`);
  }

  // ═══ S2 setPin ═══
  console.log(`── [S2] setPin (${pinMod?.setPin ? "hr/pin" : "hr/service ของเดิม"}) ──`);
  const E2 = await mkEmp(T1, sA, `ตั้งPIN ${stamp}`);
  const r4 = await safe(() => setPinFn(ctxA, E2, PINS.p4));
  const r5 = await safe(() => setPinFn(ctxA, E2, PINS.p5));
  const r6 = await safe(() => setPinFn(ctxA, E2, PINS.p6));
  chk("S2.1", [r4, r5, r6].every((r: Any) => r?.ok === true), "ok ×3", short([r4, r5, r6]));
  const s6 = await st(E2);
  const bad = await Promise.all(["123", "1234567", "12a4"].map((p) => safe(() => setPinFn(ctxA, E2, p))));
  const sBad = await st(E2);
  chk("S2.2", bad.every((r: Any) => r?.ok === false && r?.reason === T_FORMAT) && snapKey(sBad) === snapKey(s6), `"${T_FORMAT}" ×3 · แถวไม่เปลี่ยน`, `${short(bad)} · unchanged=${snapKey(sBad) === snapKey(s6)}`);
  chk("S2.3", hashedOk(s6, T1, PINS.p6), "hash=match plain=none setAt=Y", desc(s6, T1, PINS.p6));
  const rc = await safe(() => setPinFn(ctxA, E2, ""));
  const sClr = await st(E2);
  chk("S2.4", (rc as Any)?.ok === true && noPinStrict(sClr), "ok · plain=none hash=none setAt=N", `${short(rc)} · ${desc(sClr)}`);
  const E2i = await mkEmp(T1, sA, `พ้นสภาพ ${stamp}`, { active: false });
  const ri = await safe(() => setPinFn(ctxA, E2i, PINS.inact));
  const sI = await st(E2i);
  chk("S2.5", (ri as Any)?.ok === false && (ri as Any)?.reason === T_NOTFOUND && noPin(sI), `"${T_NOTFOUND}" · ไม่มี PIN`, `${short(ri)} · ${desc(sI)}`);
  const E2b = await mkEmp(T1, sB, `ระบบB ${stamp}`);
  const rx = await safe(() => setPinFn(ctxA, E2b, PINS.otherSys));
  const sX2 = await st(E2b);
  chk("X2.1", (rx as Any)?.ok === false && (rx as Any)?.reason === T_NOTFOUND && noPin(sX2), `"${T_NOTFOUND}" · ไม่มี PIN`, `${short(rx)} · ${desc(sX2)}`);
  const a2 = await audits(T1, ["hr.pin.set", "hr.pin.clear"]);
  const aSet = auditOf(a2, E2, "hr.pin.set");
  const aClr = auditOf(a2, E2, "hr.pin.clear");
  chk(
    "S2.6",
    aSet.length >= 1 && aClr.length >= 1 && auditClean([...aSet, ...aClr], [PINS.p4, PINS.p5, PINS.p6], [spec(T1, PINS.p4), spec(T1, PINS.p5), spec(T1, PINS.p6)]),
    "set ≥1 · clear ≥1 · ไม่มี PIN/hash",
    `set=${aSet.length} clear=${aClr.length} clean=${auditClean([...aSet, ...aClr], [PINS.p4, PINS.p5, PINS.p6], [spec(T1, PINS.p4), spec(T1, PINS.p5), spec(T1, PINS.p6)])}`,
  );

  // ═══ S3 uniqueness ═══
  console.log("── [S3] PIN ไม่ซ้ำทั้งร้าน ──");
  const E31a = await mkEmp(T1, sA, `ซ้ำA ${stamp}`);
  const E31b = await mkEmp(T1, sB, `ซ้ำB ${stamp}`);
  const ra = await safe(() => setPinFn(ctxA, E31a, PINS.s31));
  const rb = await safe(() => setPinFn(ctxB, E31b, PINS.s31));
  const s31a = await st(E31a);
  const s31b = await st(E31b);
  chk(
    "S3.1",
    (ra as Any)?.ok === true && (rb as Any)?.ok === false && (rb as Any)?.reason === T_D8 && noPin(s31b) && hashedOk(s31a, T1, PINS.s31),
    "คนแรก ok (hash) · คนที่สอง D8 ไม่มี PIN",
    `${short([ra, rb])} · A ${desc(s31a, T1, PINS.s31)} · B ${desc(s31b, T1, PINS.s31)}`,
  );
  const E34x = await mkEmp(T1, sA, `ปล่อยPIN ${stamp}`);
  const E34y = await mkEmp(T1, sB, `รับPIN ${stamp}`);
  const r34a = await safe(() => setPinFn(ctxA, E34x, PINS.s34));
  const off = await safe(() => hr.setEmployeeActive(ctxA, E34x, false));
  const r34b = await safe(() => setPinFn(ctxB, E34y, PINS.s34));
  const s34y = await st(E34y);
  chk("S3.4", (r34a as Any)?.ok === true && (off as Any)?.ok === true && (r34b as Any)?.ok === true && hashedOk(s34y, T1, PINS.s34), "ok · พ้นสภาพ · ok (hash)", `${short([r34a, off, r34b], 160)} · ${desc(s34y, T1, PINS.s34)}`);
  const E35 = await mkEmp(T2, sO, `อีกร้าน ${stamp}`);
  const r35 = await safe(() => setPinFn(ctxO, E35, PINS.s31));
  const s35 = await st(E35);
  chk("S3.5", (r35 as Any)?.ok === true && hashedOk(s35, T2, PINS.s31), "ok · hash ของร้านนั้น", `${short(r35)} · ${desc(s35, T2, PINS.s31)}`);
  const idxRows = (await P.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'HrEmployee' AND indexdef ILIKE '%pinHash%'`) as Any[];
  const def = squash(String(idxRows[0]?.indexdef ?? ""));
  const idxOk =
    idxRows.length === 1 &&
    idxRows[0].indexname === INDEX_NAME &&
    /^CREATE UNIQUE INDEX/i.test(def) &&
    /\("tenantId", "pinHash"\)/.test(def) &&
    /WHERE \(\(active = true\) AND \("pinHash" IS NOT NULL\)\)/.test(def);
  chk("S3.6", idxOk, `1 index ${INDEX_NAME} UNIQUE (tenantId,pinHash) WHERE active AND pinHash IS NOT NULL`, idxRows.length ? idxRows.map((r) => `${r.indexname}: ${squash(String(r.indexdef))}`).join(" | ") : "ไม่มี index ที่แตะ pinHash");

  // ═══ S4 verifyPin ═══
  console.log("── [S4] verifyPin (facade C-8) ──");
  const E4a = await mkEmp(T1, sA, `ยืนยันA ${stamp}`, { linkedUserId: u.id });
  const E4b = await mkEmp(T1, sB, `ยืนยันB ${stamp}`);
  const E4c = await mkEmp(T1, sA, `ยืนยันพ้น ${stamp}`);
  const E4o = await mkEmp(T2, sO, `ยืนยันอีกร้าน ${stamp}`);
  await safe(() => setPinFn(ctxA, E4a, PINS.v4a));
  await safe(() => setPinFn(ctxB, E4b, PINS.v4b));
  await safe(() => setPinFn(ctxA, E4c, PINS.v4c));
  await safe(() => hr.setEmployeeActive(ctxA, E4c, false));
  await safe(() => setPinFn(ctxO, E4o, PINS.v4o));
  const S4_IDS = ["S4.1", "S4.2", "S4.3", "S4.4", "S4.5", "X2.2", "S4.6", "S4.7", "S4.8"];
  const NAMES = [`ยืนยันA ${stamp}`, `ยืนยันB ${stamp}`, `ยืนยันพ้น ${stamp}`, `ยืนยันอีกร้าน ${stamp}`];
  if (!verifyFn) {
    failAll(S4_IDS, `facade missing: hr/index.ts ไม่มี verifyPin${pinMod ? "" : ` · ${pinImportErr}`}`);
  } else {
    await resetVerifyBucket(T1);
    await resetVerifyBucket(T2);
    const all: Any[] = [];
    const V = async (a: Any) => {
      const r = await safe(() => verifyFn(a));
      all.push(r);
      return r as Any;
    };
    const okKeys = "employeeId,ok,systemId,userId";
    const v1 = await V({ tenantId: T1, pin: PINS.v4a });
    chk("S4.1", v1?.ok === true && keysOf(v1) === okKeys && v1.employeeId === E4a && v1.systemId === sA && v1.userId === u.id, `keys=${okKeys} · คน A · userId ผูก`, `${keysOf(v1)} emp=${v1?.employeeId === E4a} sys=${v1?.systemId === sA} user=${v1?.userId === u.id} · ${short(v1, 120)}`);
    const v2 = await V({ tenantId: T1, pin: PINS.v4b });
    chk("S4.2", v2?.ok === true && keysOf(v2) === okKeys && v2.employeeId === E4b && v2.systemId === sB && v2.userId === null, "ok · ระบบ B · userId null", `${keysOf(v2)} emp=${v2?.employeeId === E4b} sys=${v2?.systemId === sB} user=${short(v2?.userId, 30)}`);
    const v3 = await V({ tenantId: T1, pin: PINS.vWrong });
    const isWrong = (r: Any) => r?.ok === false && r?.reason === T_WRONG && keysOf(r) === "ok,reason";
    chk("S4.3", isWrong(v3), `{ ok:false, reason:"${T_WRONG}" }`, short(v3));
    const v4 = await Promise.all(["12", "abcd", "1234567", "", "12 34"].map((p) => V({ tenantId: T1, pin: p })));
    chk("S4.4", v4.every(isWrong), `"${T_WRONG}" ×5`, short(v4));
    const v5 = await V({ tenantId: T1, pin: PINS.v4c });
    chk("S4.5", isWrong(v5), "ไม่ยืนยัน", short(v5));
    const vx = await V({ tenantId: T1, pin: PINS.v4o });
    const vxo = await V({ tenantId: T2, pin: PINS.v4o });
    chk("X2.2", isWrong(vx) && vxo?.ok === true && vxo.employeeId === E4o, "ร้านนี้ไม่ยืนยัน · ร้านของมัน ok", `${short(vx, 80)} · own=${vxo?.ok === true && vxo?.employeeId === E4o}`);
    const vs1 = await V({ tenantId: T1, pin: PINS.v4a, systemId: sB });
    const vs2 = await V({ tenantId: T1, pin: PINS.v4a, systemId: sA });
    const vu = await V({ tenantId: T1, pin: PINS.v4a, unitId: "qc-unit-ignored" });
    chk(
      "S4.6",
      vs1?.ok !== true && vs2?.ok === true && vs2.employeeId === E4a && vu?.ok === true && vu.employeeId === E4a,
      "systemId อื่น ไม่ยืนยัน · systemId ตัวเอง ok · unitId ok",
      `other=${short(vs1, 60)} own=${vs2?.ok} unit=${vu?.ok}`,
    );
    // [info] เวลา — median 50 ผิด vs 50 ถูก (ไม่ใช่ข้อสอบ — ด่านจริงคือ S4.9 static)
    await resetVerifyBucket(T1);
    const tm = async (pin: string) => {
      const ms: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        await safe(() => verifyFn({ tenantId: T1, pin }));
        ms.push(performance.now() - t0);
      }
      ms.sort((a, b) => a - b);
      return ms[25]!;
    };
    const mOk = await tm(PINS.v4a);
    const mBad = await tm(PINS.vTimeWrong);
    const ratio = Math.max(mOk, mBad) / Math.max(0.001, Math.min(mOk, mBad));
    console.log(`  [info] เวลา verifyPin median ถูก ${mOk.toFixed(1)} ms · ผิด ${mBad.toFixed(1)} ms · อัตราส่วน ${ratio.toFixed(2)}× (${ratio < 3 ? "< 3× ✓" : "≥ 3× — ดู"})`);
    // S4.7 — ถังร้าน 120/60 s
    await resetVerifyBucket(T1);
    const first: Any[] = [];
    for (let b = 0; b < 120; b += 10) first.push(...(await Promise.all(Array.from({ length: 10 }, () => safe(() => verifyFn({ tenantId: T1, pin: PINS.vRateWrong }))))));
    const v121 = await V({ tenantId: T1, pin: PINS.v4a });
    const bk = await P.chatRateBucket.findUnique({ where: { key: `hr-verifypin:${T1}` }, select: { count: true } });
    const nLimited = first.filter((r: Any) => typeof r?.reason === "string" && RE_LIMIT.test(r.reason)).length;
    chk(
      "S4.7",
      nLimited === 0 && first.every(isWrong) && v121?.ok === false && RE_LIMIT.test(String(v121?.reason ?? "")) && (bk?.count ?? 0) >= 121,
      "120 ครั้งไม่โดนจำกัด · ครั้งที่ 121 (PIN ถูก) ลองใหม่ในอีก N วินาที · ถัง count ≥ 121",
      `limited120=${nLimited} wrong120=${first.filter(isWrong).length} 121=${short(v121, 80)} bucket=${bk?.count ?? "ไม่มีแถว hr-verifypin:<tenantId>"}`,
    );
    await resetVerifyBucket(T1);
    const allTxt = JSON.stringify(all);
    const leak = {
      pin: [PINS.v4a, PINS.v4b, PINS.v4c, PINS.v4o, PINS.vWrong].filter((p) => allTxt.includes(p)).length,
      hash: [spec(T1, PINS.v4a), spec(T1, PINS.v4b), spec(T2, PINS.v4o)].filter((h) => allTxt.includes(h)).length,
      name: NAMES.filter((n) => allTxt.includes(n)).length,
      pepper: !!PEP && allTxt.includes(PEP),
    };
    chk("S4.8", all.length > 0 && leak.pin === 0 && leak.hash === 0 && leak.name === 0 && !leak.pepper && !all.some(isThrow), "0 PIN · 0 hash · 0 ชื่อ · ไม่ throw", `n=${all.length} ${JSON.stringify(leak)} throws=${all.filter(isThrow).length}${all.find(isThrow) ? ` (${short(all.find(isThrow), 120)})` : ""}`);
  }

  // ═══ S5 ทางเก่า ═══
  console.log("── [S5] ทางเก่า (pinCode ตัวเปล่า → อัปเกรด) ──");
  const L1 = await mkEmp(T1, sA, `เก่า1 ${stamp}`, { pinCode: PINS.l51 });
  const L2a = await mkEmp(T1, sA, `เก่าซ้ำA ${stamp}`, { pinCode: PINS.l52 });
  const L2b = await mkEmp(T1, sB, `เก่าซ้ำB ${stamp}`, { pinCode: PINS.l52 });
  const L3 = await mkEmp(T1, sA, `เก่าโรสเตอร์ ${stamp}`, { pinCode: PINS.l53 });
  const L4 = await mkEmp(T1, sA, `เก่าแข่ง ${stamp}`, { pinCode: PINS.l54 });
  if (!verifyFn) {
    failAll(["S5.1", "S5.2", "S5.3", "S5.4", "S5.7"], `facade missing: verifyPin ไม่มี${pinMod ? "" : ` · ${pinImportErr}`}`);
  } else {
    await resetVerifyBucket(T1);
    const w1 = (await safe(() => verifyFn({ tenantId: T1, pin: PINS.l51 }))) as Any;
    chk("S5.1", w1?.ok === true && w1.employeeId === L1 && w1.systemId === sA, "ok · คน L1", short(w1, 120));
    const sL1 = await st(L1);
    chk("S5.2", hashedOk(sL1, T1, PINS.l51), "hash=match plain=none setAt=Y", desc(sL1, T1, PINS.l51));
    const w2 = (await safe(() => verifyFn({ tenantId: T1, pin: PINS.l51 }))) as Any;
    const sL1b = await st(L1);
    chk("S5.3", w2?.ok === true && w2.employeeId === L1 && hashedOk(sL1b, T1, PINS.l51), "ok คนเดิม · ยังเป็น hash", `${short(w2, 100)} · ${desc(sL1b, T1, PINS.l51)}`);
    const w3 = (await safe(() => verifyFn({ tenantId: T1, pin: PINS.l52 }))) as Any;
    const sa = await st(L2a);
    const sb = await st(L2b);
    const untouched = (s: PinSt) => s.code === PINS.l52 && (s.hash === null || s.hash === undefined) && (s.setAt === null || s.setAt === undefined);
    chk("S5.4", w3?.ok === false && untouched(sa) && untouched(sb), "ไม่ยืนยัน · ทั้งสองแถวยังเป็นตัวเปล่าเดิม", `${short(w3, 80)} · A ${desc(sa, T1, PINS.l52)} · B ${desc(sb, T1, PINS.l52)}`);
    const w4 = await Promise.all(Array.from({ length: 10 }, () => safe(() => verifyFn({ tenantId: T1, pin: PINS.l54 }))));
    const sL4 = await st(L4);
    chk("S5.7", w4.every((r: Any) => r?.ok === true && r.employeeId === L4) && hashedOk(sL4, T1, PINS.l54), "10/10 ok คน L4 · hash ตามสูตร", `ok=${w4.filter((r: Any) => r?.ok === true && r.employeeId === L4).length}/10 ${short(w4.find((r: Any) => r?.ok !== true), 90)} · ${desc(sL4, T1, PINS.l54)}`);
    await resetVerifyBucket(T1);
  }
  const roster = (await safe(() => hr.kioskRoster(ctxA))) as Any;
  const rr = Array.isArray(roster) ? roster : [];
  const find = (id: string) => rr.find((x: Any) => x?.id === id);
  const keysOk = rr.length > 0 && rr.every((x: Any) => keysOf(x) === "hasPin,id,name,position");
  chk(
    "S5.5",
    find(L3)?.hasPin === true && find(E31a)?.hasPin === true && find(E2)?.hasPin === false && keysOk,
    "ตัวเปล่า=true · hash=true · ไม่มี=false · คีย์ 4 ตัว",
    `plain=${find(L3)?.hasPin} hashed=${find(E31a)?.hasPin} none=${find(E2)?.hasPin} keys=${keysOk ? "ok" : short(rr.map(keysOf).filter((k: string) => k !== "hasPin,id,name,position").slice(0, 3))}${isThrow(roster) ? ` ${roster.THROW}` : ""}`,
  );
  if (typeof pinMod?.hasPin !== "function") chk("S5.6", false, "hasPin()", pinImportErr || "hr/pin.ts ไม่มี hasPin");
  else {
    const hp = [pinMod.hasPin({ pinHash: null, pinCode: "x" }), pinMod.hasPin({ pinHash: "h", pinCode: null }), pinMod.hasPin({ pinHash: null, pinCode: null })];
    chk("S5.6", hp[0] === true && hp[1] === true && hp[2] === false, "true,true,false", hp.join(","));
  }

  // ═══ S3.2/S3.3 ผลแข่ง (process ลูกเริ่มไว้ตั้งแต่ต้น) ═══
  console.log("── [S3] ผลแข่ง setPin 10 ทาง × 3 รอบ ──");
  const race = await raceP;
  const raceErr = race.find((x: Any) => x?.error);
  const perRound = [0, 1, 2].map((r) => {
    const rs = race.flatMap((x: Any) => (Array.isArray(x?.rounds) ? (x.rounds.find((y: Any) => y.r === r)?.rs ?? []) : []));
    const late = race.some((x: Any) => x?.rounds?.find((y: Any) => y.r === r)?.late);
    return { n: rs.length, ok: rs.filter((y: Any) => y.ok).length, d8: rs.filter((y: Any) => !y.ok && y.d8).length, other: rs.filter((y: Any) => !y.ok && !y.d8).map((y: Any) => y.t), late };
  });
  const pids = race.map((x: Any) => x?.pids ?? 0);
  chk(
    "S3.2",
    !raceErr && perRound.every((p) => p.n === 10 && p.ok === 1 && p.d8 === 9 && !p.late),
    "ทุกรอบ: 10 คำขอ · ok 1 · D8 9 · ตรงเวลา",
    raceErr ? `ERR ${short(raceErr.error, 200)}` : `${perRound.map((p, i) => `r${i}: n=${p.n} ok=${p.ok} d8=${p.d8}${p.other.length ? ` other=${short([...new Set(p.other)], 60)}` : ""}${p.late ? " LATE" : ""}`).join(" · ")} · pids/process=${pids.join("/")}`,
  );
  const dbRound: string[] = [];
  let dbOk = !raceErr;
  for (let r = 0; r < 3; r++) {
    const ss = await Promise.all(raceEmps[r]!.map((x) => st(x.e)));
    const h = ss.filter((s) => s.hash === spec(T1, PINS.race[r]!)).length;
    const plain = ss.filter((s) => s.code !== null).length;
    if (h !== 1 || plain !== 0) dbOk = false;
    dbRound.push(`r${r}: hash=${h} plain=${plain}`);
  }
  chk("S3.3", dbOk, "ทุกรอบ hash=1 plain=0", dbRound.join(" · "));

  // ═══ S6 backfill ═══
  console.log("── [S6] scripts/hr-backfill-pin-hash.mts ──");
  const S6_IDS = ["S6.2", "S6.3", "S6.4", "S6.5", "S6.6", "S6.7"];
  if (!existsSync(join(ROOT, BACKFILL_FILE))) failAll(S6_IDS, `script missing: ${BACKFILL_FILE}`);
  else if (!HAS_HASH) failAll(S6_IDS, "schema: Prisma HrEmployee ไม่มี pinHash/pinSetAt (ต้อง prisma generate หลัง migration)");
  else {
    const NM = { dA: `ซ้ำหนึ่ง ${stamp}`, dB: `ซ้ำสอง ${stamp}`, iN: `พ้นสภาพเก่า ${stamp}`, hH: `มีhashแล้ว ${stamp}`, uU: `เดี่ยว ${stamp}`, nN: `ไม่มีPIN ${stamp}` };
    const fixedAt = new Date("2026-01-02T03:04:05.000Z");
    const B = {
      dA: await mkEmp(T3, sX, NM.dA, { pinCode: PINS.bfDup }),
      dB: await mkEmp(T3, sX, NM.dB, { pinCode: PINS.bfDup }),
      iN: await mkEmp(T3, sX, NM.iN, { pinCode: PINS.bfInact, active: false }),
      hH: await mkEmp(T3, sX, NM.hH, { pinHash: spec(T3, PINS.bfHashed), pinSetAt: fixedAt }),
      uU: await mkEmp(T3, sX, NM.uU, { pinCode: PINS.bfUniq }),
      nN: await mkEmp(T3, sX, NM.nN),
    };
    const snap = async () => {
      const o: Record<string, PinSt> = {};
      for (const [k, id] of Object.entries(B)) o[k] = await st(id);
      return o;
    };
    const diff = (a: Record<string, PinSt>, b: Record<string, PinSt>) => Object.keys(a).filter((k) => snapKey(a[k]!) !== snapKey(b[k]!));
    const s0 = await snap();
    const dry = await runBackfill([]);
    const e0 = bfEntry(dry.out, T3);
    const s1 = await snap();
    chk(
      "S6.2",
      dry.code === 0 && !!e0 && num(e0.plain) === 4 && num(e0.duplicates) === 2 && num(e0.hashed) === 1 && num(e0.toUpdate) === 2 && num(e0.toUpdateInactive) === 1 && num(e0.changed) === 0,
      "exit 0 · plain 4 · duplicates 2 · hashed 1 · toUpdate 2 · toUpdateInactive 1 · changed 0",
      e0 ? `exit=${dry.code} ${short({ plain: num(e0.plain), duplicates: num(e0.duplicates), hashed: num(e0.hashed), toUpdate: num(e0.toUpdate), toUpdateInactive: num(e0.toUpdateInactive), changed: num(e0.changed), mode: e0.mode })}` : `exit=${dry.code} ไม่มี JSON_SUMMARY ของร้าน · tail: ${scrub(dry.out.replace(/\s+/g, " ")).replace(/\d{4,}/g, "#").slice(-240)}`,
    );
    chk("S6.3", diff(s0, s1).length === 0, "0 แถวเปลี่ยน", `เปลี่ยน: ${diff(s0, s1).join(",") || "ไม่มี"}`);
    const ap = await runBackfill(["--apply"]);
    const e1 = bfEntry(ap.out, T3);
    const s2 = await snap();
    const st64 = {
      uU: hashedOk(s2.uU!, T3, PINS.bfUniq),
      iN: hashedOk(s2.iN!, T3, PINS.bfInact) && s2.iN!.active === false,
      dA: noPinStrict(s2.dA!),
      dB: noPinStrict(s2.dB!),
      hH: snapKey(s2.hH!) === snapKey(s0.hH!),
      nN: snapKey(s2.nN!) === snapKey(s0.nN!),
    };
    chk("S6.4", ap.code === 0 && !!e1 && num(e1.changed) === 4 && Object.values(st64).every(Boolean), "exit 0 · changed 4 · ทุกแถวตามสัญญา", `exit=${ap.code} changed=${e1 ? num(e1.changed) : "ไม่มี JSON_SUMMARY"} ${JSON.stringify(st64)}`);
    const ab = await audits(T3, ["hr.pin.backfill"]);
    const abNum = ab.some((r) => /\d/.test(JSON.stringify([r.before, r.after])));
    const bfPins = [PINS.bfDup, PINS.bfInact, PINS.bfUniq, PINS.bfHashed];
    const bfHashes = bfPins.map((p) => spec(T3, p));
    chk("S6.5", ab.length >= 1 && abNum && auditClean(ab, bfPins, bfHashes), "≥1 แถว · มีตัวเลข · ไม่มี PIN/hash", `rows=${ab.length} numbers=${abNum} clean=${auditClean(ab, bfPins, bfHashes)}`);
    const ap2 = await runBackfill(["--apply"]);
    const e2 = bfEntry(ap2.out, T3);
    const s3 = await snap();
    chk("S6.6", ap2.code === 0 && !!e2 && num(e2.changed) === 0 && diff(s2, s3).length === 0, "exit 0 · changed 0 · 0 แถวเปลี่ยน", `exit=${ap2.code} changed=${e2 ? num(e2.changed) : "ไม่มี JSON_SUMMARY"} เปลี่ยน=${diff(s2, s3).join(",") || "ไม่มี"}`);
    const outs = [dry.out, ap.out, ap2.out].join("\n");
    const runs = new Set(outs.match(/\d+/g) ?? []);
    const leak = {
      pin: bfPins.filter((p) => runs.has(p)).length,
      hash: bfHashes.filter((h) => outs.includes(h)).length,
      pepper: !!PEP && outs.includes(PEP),
      fullName: Object.values(NM).filter((n) => outs.includes(n)).length,
      dupIds: dry.out.includes(B.dA) && dry.out.includes(B.dB),
    };
    chk("S6.7", leak.pin === 0 && leak.hash === 0 && !leak.pepper && leak.fullName === 0 && leak.dupIds, "0 PIN · 0 hash · ไม่มี pepper · 0 ชื่อเต็ม · มี id แถวซ้ำ", JSON.stringify(leak));
  }

  // ═══ S7 kiosk + create + reactivate ═══
  console.log("── [S7] kiosk · createEmployee · กลับมาทำงาน ──");
  const K1 = await mkEmp(T1, sA, `kioskHash ${stamp}`);
  await safe(() => setPinFn(ctxA, K1, PINS.k71));
  const sK1 = await st(K1);
  const c1 = (await safe(() => hr.clockWithPin(ctxA, K1, PINS.k71))) as Any;
  const rK1 = await rowsOf(K1);
  chk(
    "S7.1",
    hashedOk(sK1, T1, PINS.k71) && c1?.ok === true && c1.kind === "IN" && rK1.length === 1 && typeof pinMod?.verifyPinForEmployee === "function",
    "แถว hash (plain none) · ok IN · 1 แถว · verifyPinForEmployee มี",
    `${desc(sK1, T1, PINS.k71)} · ${short(c1, 90)} · ${rK1.length} แถว · vpfe=${typeof pinMod?.verifyPinForEmployee}`,
  );
  const c2 = (await safe(() => hr.clockWithPin(ctxA, K1, PINS.k7w))) as Any;
  const rK1b = await rowsOf(K1);
  chk("S7.2", c2?.ok === false && c2.reason === T_WRONG && rK1b.length === 1, `"${T_WRONG}" · ยัง 1 แถว`, `${short(c2, 80)} · ${rK1b.length} แถว`);
  const K2name = `kioskไม่มีPIN ${stamp}`;
  const K2 = await mkEmp(T1, sA, K2name);
  const c3 = (await safe(() => hr.clockWithPin(ctxA, K2, PINS.k71))) as Any;
  chk("S7.3", c3?.ok === false && c3.reason === T_NOPIN(K2name), "ข้อความเดิม", short(c3, 120));
  const ce = (await safe(() => hr.createEmployee(ctxA, { name: `สร้างมีPIN ${stamp}`, pin: PINS.c72 }))) as Any;
  if (ce?.id) ids.push(ce.id);
  const sCe = ce?.id ? await st(ce.id) : null;
  chk("S7.4", !!ce?.id && !!sCe && hashedOk(sCe, T1, PINS.c72), "สร้างแล้ว · hash=match plain=none", `${short(ce, 80)} · ${sCe ? desc(sCe, T1, PINS.c72) : "ไม่มีแถว"}`);
  const ce2 = (await safe(() => hr.createEmployee(ctxB, { name: `สร้างPINซ้ำ ${stamp}`, pin: PINS.c72 }))) as Any;
  if (ce2?.id) ids.push(ce2.id);
  const sCe2 = ce2?.id ? await st(ce2.id) : null;
  chk("S7.5", !!ce2?.id && !!sCe2 && sCe2.active === true && ce2.pinSet === false && ce2.reason === T_D8 && noPin(sCe2), "สร้างแล้ว · pinSet:false · D8 · ไม่มี PIN", `${short(ce2, 120)} · ${sCe2 ? desc(sCe2, T1, PINS.c72) : "ไม่มีแถว"}`);
  const A7 = await mkEmp(T1, sA, `กลับมาA ${stamp}`);
  const B7 = await mkEmp(T1, sB, `รับต่อB ${stamp}`);
  const ra7 = await safe(() => setPinFn(ctxA, A7, PINS.re));
  const offA = await safe(() => hr.setEmployeeActive(ctxA, A7, false));
  const rb7 = await safe(() => setPinFn(ctxB, B7, PINS.re));
  const sB7 = await st(B7);
  chk("S7.6", (ra7 as Any)?.ok === true && (offA as Any)?.ok === true && (rb7 as Any)?.ok === true && hashedOk(sB7, T1, PINS.re), "A ok · A พ้น · B ok (hash)", `${short([ra7, offA, rb7], 160)} · B ${desc(sB7, T1, PINS.re)}`);
  const back = (await safe(() => hr.setEmployeeActive(ctxA, A7, true))) as Any;
  const sA7 = await st(A7);
  const sB7b = await st(B7);
  chk(
    "S7.7",
    back?.ok === true && back.pinCleared === true && sA7.active === true && noPinStrict(sA7) && hashedOk(sB7b, T1, PINS.re),
    "ok · pinCleared:true · A active ไม่มี PIN · B ยังถือ",
    `${short(back, 100)} · A ${desc(sA7, T1, PINS.re)} · B ${desc(sB7b, T1, PINS.re)}`,
  );
  const a7 = auditOf(await audits(T1, ["hr.pin.clear"]), A7, "hr.pin.clear");
  chk("S7.8", a7.some((r) => JSON.stringify([r.before, r.after]).includes("REACTIVATE_DUPLICATE")) && auditClean(a7, [PINS.re], [spec(T1, PINS.re)]), "hr.pin.clear มี REACTIVATE_DUPLICATE · ไม่มี PIN/hash", `rows=${a7.length} reason=${a7.some((r) => JSON.stringify([r.before, r.after]).includes("REACTIVATE_DUPLICATE"))}`);

  // ═══ S9 r3 — มติผู้คุมงาน R3.1–R3.4 (hunt F1/F2/F3/F6) ═══
  // ใช้ร้าน T1 ต่อ (Z1 นับ 3 ร้าน) · ล้างถัง hr-verifypin:<T1>* ก่อนแต่ละข้อ · ถังผู้เรียกมี tenantId ใน key ⇒ cleanup เดิมลบให้ (key contains tid)
  console.log("── [S9] r3: ตัวจำกัด 2 ถังนับเฉพาะครั้งที่ผิด · audit ล็อก · backfill env · createEmployeeAction ไม่รับ pin ──");
  const ck = (tag: string) => `qc9:${tag}:${stamp}`;
  // ตัวจริงจาก facade โดยตรง (ไม่ผ่านตัวห่อใด ๆ ของ S1–S8) — S9.5 ต้องเห็นการเรียกที่ "ไม่มี callerKey" จริง
  const verify9: Any = idx?.verifyPin ?? pinMod?.verifyPin ?? null;
  const V9 = async (pin: string, callerKey?: string, extra: Any = {}): Promise<Any> =>
    (await safe(() => verify9({ tenantId: T1, pin, ...(callerKey === undefined ? {} : { callerKey }), ...extra }))) as Any;
  const isWrong9 = (r: Any) => r?.ok === false && r?.reason === T_WRONG;
  const isLimited9 = (r: Any) => r?.ok === false && RE_LIMIT.test(String(r?.reason ?? ""));
  const okA9 = (r: Any) => r?.ok === true && r.employeeId === E4a;
  const one9 = (r: Any) => (isThrow(r) ? `THROW ${String(r.THROW).slice(0, 80)}` : okA9(r) ? "ok(คน A)" : r?.ok === true ? "ok(คนอื่น)" : isLimited9(r) ? "limited" : isWrong9(r) ? "wrong" : short(r, 60));
  const bucketOf = async (key: string): Promise<number | null> => ((await P.chatRateBucket.findUnique({ where: { key }, select: { count: true } })) as Any)?.count ?? null;
  const tKey = `hr-verifypin:${T1}`;
  const cKey = (c: string) => `hr-verifypin:${T1}:${c}`;
  const tag9 = (rs: Any[]) => {
    const o: Record<string, number> = {};
    for (const r of rs) {
      const k = isThrow(r) ? "THROW" : r?.ok === true ? "ok" : isLimited9(r) ? "limited" : isWrong9(r) ? "wrong" : `other`;
      o[k] = (o[k] ?? 0) + 1;
    }
    return JSON.stringify(o);
  };
  const lockedRows = async (c: string): Promise<Any[]> =>
    ((await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.pin.locked" }, select: { action: true, actorId: true, targetType: true, targetId: true, before: true, after: true }, orderBy: { createdAt: "asc" } })) as Any[]).filter((r) =>
      JSON.stringify(r).includes(c),
    );

  // S9.6 — process ลูก 3 ตัว (ไฟล์ env ปลอม · env ขั้นต่ำ ไม่มี URL จริง) เริ่มก่อน เพื่อไม่ต้องรอ tsx บูตทีละตัว
  const S96_PEPPER_FAKE = "qc-fake-pepper-not-a-secret-0000000000000000"; // ≥ 32 ตัว — ถ้ายาวไม่ถึง ฐานจะหยุดที่ exit 2 (ผิดเหตุผล)
  const S96_URL_FAKE = "postgresql://qcfake:qcfake@127.0.0.1:1/qcfake?connect_timeout=2"; // พอร์ต 1 = ต่อไม่ได้ทันที · ไม่มีวันถึง QC4/prod
  let tmp9 = "";
  const s96Before = { emp: await P.hrEmployee.count({ where: { tenantId: T3 } }), plain: await P.hrEmployee.count({ where: { tenantId: T3, NOT: { pinCode: null } } }), audit: await P.auditLog.count({ where: { tenantId: T3 } }) };
  const runBackfillEnv = (env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> =>
    new Promise((res) => {
      const c = spawn(join(ROOT, "node_modules/.bin/tsx"), [BACKFILL_FILE, "--tenant", T3], { cwd: ROOT, env: env as NodeJS.ProcessEnv });
      let o = "";
      let er = "";
      const kill = setTimeout(() => c.kill("SIGKILL"), 240_000);
      c.stdout.on("data", (d) => (o += String(d)));
      c.stderr.on("data", (d) => (er += String(d)));
      c.on("error", (e) => res({ code: -1, out: o, err: `spawn error ${errText(e)}` }));
      c.on("close", (code) => {
        clearTimeout(kill);
        res({ code, out: o, err: er });
      });
    });
  let s96P: Promise<{ code: number | null; out: string; err: string }[]> = Promise.resolve([]);
  try {
    tmp9 = mkdtempSync(join(tmpdir(), "qc-hr-h05-s96-"));
    const envFile = join(tmp9, "fake.env");
    writeFileSync(envFile, `# ค่าปลอมของข้อสอบ qc-hr-h0.5 S9.6 — ไม่ใช่ความลับ\nDATABASE_URL=${S96_URL_FAKE}\nDIRECT_URL=${S96_URL_FAKE}\nHR_PIN_PEPPER=${S96_PEPPER_FAKE}\n`, { mode: 0o600 });
    // env ขั้นต่ำ — ไม่ส่ง env ของแม่ (มี DATABASE_URL ของ QC4 / pepper จริง) ให้ลูก
    const base9: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/root", TMPDIR: tmpdir(), HR_BACKFILL_PROD: "1" };
    s96P = Promise.all([
      runBackfillEnv({ ...base9, HR_BACKFILL_ENV_FILE: envFile, HR_PIN_PEPPER: "qc-preset-pepper-from-shell-not-a-secret-000" }),
      runBackfillEnv({ ...base9, HR_BACKFILL_ENV_FILE: envFile, DATABASE_URL: "postgresql://qcpreset:qcpreset@127.0.0.1:1/qcpreset?connect_timeout=2" }),
      runBackfillEnv({ ...base9 }),
    ]);
  } catch (e) {
    s96P = Promise.resolve([{ code: -2, out: "", err: `setup ${errText(e)}` }]);
  }

  if (!verify9) {
    failAll(["S9.1", "S9.2", "S9.3", "S9.4", "S9.5"], `facade missing: hr/index.ts ไม่มี verifyPin${pinMod ? "" : ` · ${pinImportErr}`}`);
  } else {
    // S9.1 — ผู้เรียก A ผิด 10 → ครั้งที่ 11 ถูกปฏิเสธ · B ยังผ่าน
    await resetVerifyBucket(T1);
    const cA = ck("A");
    const cB = ck("B");
    const a10: Any[] = [];
    for (let i = 0; i < 10; i++) a10.push(await V9(PINS9.wrong, cA));
    const a11 = await V9(PINS9.wrong, cA);
    const aOk = await V9(PINS.v4a, cA);
    const bOk = await V9(PINS.v4a, cB);
    const bkA = await bucketOf(cKey(cA));
    chk(
      "S9.1",
      a10.every(isWrong9) && isLimited9(a11) && isLimited9(aOk) && okA9(bOk) && (bkA ?? 0) >= 10,
      "A: ผิด 10 = PIN ไม่ถูกต้อง · ครั้งที่ 11 + PIN ถูกของ A = ลองใหม่ในอีก N วินาที · B PIN ถูก = ok · ถังผู้เรียก A ≥ 10",
      `A×10=${tag9(a10)} A#11=${one9(a11)} A(ถูก)=${one9(aOk)} B(ถูก)=${one9(bOk)} bucket(${"hr-verifypin:<T1>:<A>"})=${bkA ?? "ไม่มีแถว"} tenant=${(await bucketOf(tKey)) ?? "ไม่มีแถว"}`,
    );
    // S9.4 — audit hr.pin.locked 1 แถวต่อการล็อก
    const l1 = await lockedRows(cA);
    const a12 = await V9(PINS9.wrong, cA);
    const l2 = await lockedRows(cA);
    const empIds = ((await P.hrEmployee.findMany({ where: { tenantId: T1 }, select: { id: true } })) as Any[]).map((e) => e.id as string);
    const payloadOk = (r: Any) => {
      const pay = JSON.stringify({ b: r.before ?? null, a: r.after ?? null });
      return pay.includes("callerKey") && pay.includes(cA) && /"count"\s*:/.test(pay);
    };
    const cleanRow = (r: Any) => {
      let s = JSON.stringify(r);
      if (empIds.some((id) => s.includes(id))) return false;
      s = s.split(cA).join("<ck>");
      s = s.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<ts>"); // เวลาแบบ ISO ไม่นับเป็นเลข PIN
      for (const x of [...tids, ...users]) s = s.split(x).join("<id>");
      return ![...SECRET_PINS].some((p) => s.includes(p)) && !/(^|\D)\d{4,6}(\D|$)/.test(s) && !(PEP && s.includes(PEP));
    };
    chk(
      "S9.4",
      l1.length === 1 && payloadOk(l1[0]) && cleanRow(l1[0]) && isLimited9(a12) && l2.length === 1,
      "หลัง S9.1: 1 แถว · มี callerKey (= A) + count · ไม่มี PIN/เลข 4–6 หลัก/id พนักงาน · ผิดครั้งที่ 12 (ถูกปฏิเสธ) แล้วยัง 1 แถว",
      `rows=${l1.length} payload=${l1[0] ? payloadOk(l1[0]) : "-"} clean=${l1[0] ? cleanRow(l1[0]) : "-"} A#12=${one9(a12)} rowsAfter12=${l2.length}`,
    );
    // S9.2 — ถูก 130 ครั้ง ผู้เรียกเดียว ใน 60 s → ok ทั้งหมด · ไม่นับ
    await resetVerifyBucket(T1);
    const cS = ck("S");
    const t92 = Date.now();
    const s130: Any[] = [];
    for (let b = 0; b < 130; b += 10) s130.push(...(await Promise.all(Array.from({ length: 10 }, () => V9(PINS.v4a, cS)))));
    const el92 = Date.now() - t92;
    const bT92 = await bucketOf(tKey);
    const bC92 = await bucketOf(cKey(cS));
    chk(
      "S9.2",
      s130.length === 130 && s130.every(okA9) && !bT92 && !bC92 && el92 < 60_000,
      "130/130 ok คน A · ถังร้าน/ผู้เรียก ไม่มีแถวหรือ 0 · ภายใน 60 s",
      `${tag9(s130)} ms=${el92} tenantBucket=${bT92 ?? "ไม่มีแถว"} callerBucket=${bC92 ?? "ไม่มีแถว"}`,
    );
    // S9.3 — ถังร้านนับความผิดข้ามผู้เรียก
    await resetVerifyBucket(T1);
    const t93 = Date.now();
    const pre10: Any[] = [];
    for (let i = 0; i < 10; i++) pre10.push(await V9(PINS.v4a, ck("pre")));
    const callers = Array.from({ length: 12 }, (_, i) => ck(`c${i + 1}`));
    const w120: Any[] = [];
    for (let round = 0; round < 10; round++) w120.push(...(await Promise.all(callers.map((c) => V9(PINS9.wrong, c)))));
    const bT93 = await bucketOf(tKey);
    const c13 = await V9(PINS9.wrong, ck("c13"));
    const fresh = await V9(PINS.v4a, ck("fresh"));
    const el93 = Date.now() - t93;
    chk(
      "S9.3",
      pre10.every(okA9) && w120.length === 120 && w120.every(isWrong9) && bT93 === 120 && isLimited9(c13) && isLimited9(fresh) && el93 < 60_000,
      "ถูก 10 ok · ผิด 120 = PIN ไม่ถูกต้องทั้งหมด · ถังร้าน 120 · ผู้เรียกที่ 13 (ผิด) + ผู้เรียกใหม่ (ถูก) = ลองใหม่ในอีก N วินาที · ภายใน 60 s",
      `pre10=${tag9(pre10)} w120=${tag9(w120)} tenantBucket=${bT93 ?? "ไม่มีแถว"} c13=${one9(c13)} fresh=${one9(fresh)} ms=${el93}`,
    );
    // S9.5 — ไม่มี callerKey = ผิดทันที ไม่แตะ DB ถัง
    await resetVerifyBucket(T1);
    const n1 = await V9(PINS.v4a);
    const n2 = await V9(PINS.v4a, "");
    const nb = await P.chatRateBucket.count({ where: { key: { startsWith: tKey } } });
    chk(
      "S9.5",
      isWrong9(n1) && isWrong9(n2) && keysOf(n1) === "ok,reason" && nb === 0,
      `ไม่ส่ง / ว่าง → { ok:false, reason:"${T_WRONG}" } · ถัง hr-verifypin:<T1>* = 0 แถว`,
      `none=${one9(n1)} empty=${one9(n2)} keys=${keysOf(n1)} buckets=${nb}`,
    );
    await resetVerifyBucket(T1);
  }

  // S9.6 — ผล backfill env guard
  try {
    const rs = await s96P;
    const s96After = { emp: await P.hrEmployee.count({ where: { tenantId: T3 } }), plain: await P.hrEmployee.count({ where: { tenantId: T3, NOT: { pinCode: null } } }), audit: await P.auditLog.count({ where: { tenantId: T3 } }) };
    const thaiWith = (s: string, v: string) => s.split("\n").some((l) => l.includes(v) && /[฀-๿]/.test(l));
    const NAMES96 = ["HR_PIN_PEPPER", "DATABASE_URL", "HR_BACKFILL_ENV_FILE"];
    const per = NAMES96.map((v, i) => {
      const r = rs[i];
      if (!r) return { v, ok: false, d: "ไม่มีผล" };
      const ok = r.code === 1 && thaiWith(r.err, v) && !r.out.includes("JSON_SUMMARY");
      const tail = scrub((r.err || r.out).replace(/\s+/g, " ")).replace(/postgres\S*/g, "<url>").slice(-60);
      return { v, ok, d: `exit=${r.code} thai+${v}=${thaiWith(r.err, v)} summary=${r.out.includes("JSON_SUMMARY")} · ${tail}` };
    });
    const same = JSON.stringify(s96Before) === JSON.stringify(s96After);
    chk(
      "S9.6",
      per.every((x) => x.ok) && same,
      "3 กรณี: exit 1 · stderr ไทยระบุตัวแปร · ไม่มี JSON_SUMMARY · แถว QC4 ของร้าน backfill ไม่เปลี่ยน",
      `rowsSame=${same} · ${per.map((x) => `[${x.v}] ${x.d}`).join(" | ")}`,
    );
  } finally {
    if (tmp9) {
      try {
        rmSync(tmp9, { recursive: true, force: true }); // ลบเฉพาะโฟลเดอร์ที่ข้อสอบสร้าง
      } catch {
        /* ignore */
      }
    }
  }

  // S9.7 — createEmployeeAction ตัวจริงใน Next request scope (เทคนิค qc-hr-h0.3) · OWNER ชั่วคราว
  {
    let s97 = "";
    let ok97 = false;
    try {
      const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
      const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
      const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
      const coreHash = (await import("@/lib/core/hash" as string)) as Any;
      const act = (await import("@/lib/modules/hr/actions" as string)) as Any;
      const inScope = async <T,>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> => {
        const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.150" } });
        const jar = new nextCookies.RequestCookies(req.headers);
        const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
        const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
        return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
      };
      const ow = await P.user.create({ data: { email: `${SLUG}-owner9@qc.invalid`, name: `QC เจ้าของ S9 ${stamp}` } });
      users.push(ow.id);
      await P.membership.create({ data: { userId: ow.id, tenantId: T1, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
      const token = coreHash.randomToken(32) as string;
      const DAY = 86_400_000;
      await P.session.create({ data: { userId: ow.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
      const cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T1}`;
      const post = (name: string, pin: string) => {
        const f = new FormData();
        for (const [k, v] of Object.entries({ systemId: sA, name, phone: "", position: "", pin })) f.set(k, v);
        return safe(() => inScope(cookie, `/app/sys/${sA}/hr/employees`, () => act.createEmployeeAction(f)));
      };
      const nmFree = `S9สร้างPINว่าง ${stamp}`;
      const nmDup = `S9สร้างPINซ้ำ ${stamp}`;
      const rFree = (await post(nmFree, PINS9.createFree)) as Any;
      const rDup = (await post(nmDup, PINS.v4a)) as Any; // PIN ที่ E4a (ยังทำงาน) ถืออยู่
      const rowOf = async (name: string) => {
        const r = (await P.hrEmployee.findFirst({ where: { tenantId: T1, name }, select: { id: true, active: true } })) as Any;
        if (r?.id) ids.push(r.id);
        return r?.id ? { id: r.id as string, s: await st(r.id) } : null;
      };
      const eFree = await rowOf(nmFree);
      const eDup = await rowOf(nmDup);
      const resOk = (r: Any) => !isThrow(r) && !JSON.stringify(r ?? null).includes(T_D8) && (r ?? {}).pinSet !== true;
      ok97 = !!eFree && !!eDup && eFree.s.active === true && eDup.s.active === true && noPinStrict(eFree.s) && noPinStrict(eDup.s) && resOk(rFree) && resOk(rDup);
      s97 = `free: ${eFree ? desc(eFree.s, T1, PINS9.createFree) : "ไม่มีแถว"} res=${short(rFree ?? "void", 80)} · dup: ${eDup ? desc(eDup.s, T1, PINS.v4a) : "ไม่มีแถว"} res=${short(rDup ?? "void", 80)}`;
    } catch (e) {
      s97 = `harness: ${errText(e)}`;
    }
    chk("S9.7", ok97, "ทั้งสองแถวถูกสร้าง · plain=none hash=none setAt=N · ผลไม่มี D8 / pinSet:true", s97);
  }
}

// ═════════════════════════ คืนสภาพ ═════════════════════════
const BUCKET_PREFIXES = ["hr-verifypin:", "hr-kiosk:", "hr-setpin:"];
async function cleanup(): Promise<void> {
  const d = async (n: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.log(`  ⚠ cleanup ${n}: ${errText(e).slice(0, 80)}`);
    }
  };
  for (const tid of tids) {
    const emps = (await P.hrEmployee.findMany({ where: { tenantId: tid }, select: { id: true } }).catch(() => [])) as Any[];
    const all = [...new Set([tid, ...emps.map((e) => e.id as string)])];
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
    await d("user", () => P.user.delete({ where: { id: uid } }));
  }
}

let crashed = "";
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = scrub((e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e));
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const residue: string[] = [];
for (const tid of tids) {
  for (const m of ["hrAttendance", "hrEmployee", "auditLog", "outboxEvent", "party", "appSystem"]) {
    const n = await P[m].count({ where: { tenantId: tid } }).catch(() => -1);
    if (n !== 0) residue.push(`${m}=${n}`);
  }
}
{
  const all = [...new Set([...tids, ...ids])];
  let nb = 0;
  for (let i = 0; i < all.length; i += 50) {
    nb += await P.chatRateBucket
      .count({ where: { AND: [{ OR: BUCKET_PREFIXES.map((p) => ({ key: { startsWith: p } })) }, { OR: all.slice(i, i + 50).map((x) => ({ key: { contains: x } })) }] } })
      .catch(() => -1000);
  }
  if (nb !== 0) residue.push(`chatRateBucket=${nb}`);
}
const leftUsers = users.length ? await P.user.count({ where: { id: { in: users } } }).catch(() => -1) : 0;
if (leftUsers !== 0) residue.push(`user=${leftUsers}`);
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
if (leftTenants !== 0) residue.push(`tenant(${SLUG_PREFIX}*)=${leftTenants}`);
console.log(`RESIDUE tenants=${leftTenants} ${residue.length ? residue.join(",") : "none"} (สร้าง ${tids.length} ร้าน · ผู้ใช้ ${users.length})`);
chk("Z1", residue.length === 0 && tids.length === 3, "ไม่เหลือแถว", `${residue.join(",") || "none"} · tenants created=${tids.length}`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id.replace(/^H0\.5-/, ""), false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 120)})` : "ไม่ถึง");
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
    missing,
  })}`,
);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
