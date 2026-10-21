// QC — POS RUN ใบ P3.5 S: HR — PIN ตามตารางงาน · ค่าคอมฯ พนักงาน · ชั่วโมงทำงานจากกะ (C-8 v2)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (บัญชี A · 16 ต.ค. 2026 · ฐาน 72669941)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.5.md ⚠️1–8 · §0 · §2 R1–R14 · §3 · §4 · §10 มติ 1–13 (มติชนะ §2/§4 เมื่อขัดกัน)
//        + pos-brief-COMMON · pos-brief-LANE-RULES · โน้ต: ledger/wo-notes/pos-P3.5-oracle.md (ตารางชื่อ · ผังข้อมูลทดสอบ ·
//        ความคลาดเคลื่อน · ORACLE-EDIT · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ที่นี่และลงตารางชื่อในโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//   ฝั่ง U (13A/13B ชิป · แผ่น override · สวิตช์ในแท็บพนักงาน · การ์ดค่าคอมฯ · 07 ชั่วโมง · แท็บ 08) = ใบ P3.5U + visual — ไม่อยู่ในข้อสอบนี้
//
// ของที่ใบ P3.5 S ต้องส่ง (ย่อ — ตารางเต็มอยู่ในโน้ต):
//   HR (ไฟล์ของ HR ที่เลนนี้เขียน · มติ 5): src/lib/modules/hr/pos-seam.ts export onShiftToday · workedMinutesBetween · clockSelf · adjustmentStatuses
//     + บล็อก `// POS P3.5 ▸ … ◂` ต่อท้าย `// ◂ CRM C3.3` ใน hr/index.ts (re-export จาก "./pos-seam" ล้วน) · เขียนตาราง HR ผ่าน clock() เท่านั้น
//   POS: pos/hr-link.ts (ทางเดียวไป `@/lib/modules/hr`) export posClockForShift(ctx, {kind, deviceId, staffToken, shiftId}) ·
//          shiftHoursForOwner(ctx, actor, {shiftIds}) → {ok:true, items:[{shiftId, durationMin, workedMin|null, warnings[]}]}
//        pos/hr-link-actions.ts ("use server" · async ล้วน · assertCan) export posClockAction
//        pos/staff-commission-shared.ts (บริสุทธิ์) export resolveStaffCommissionRate · staffCommissionAmount · staffCommissionBases · staffCommissionRefundShare
//        pos/staff-commission.ts (ตัวเขียนเดียวของ PosStaffCommission) export syncStaffCommissionToPayroll({tenantId?, now, deadline}) + ตัวรับ 3 event
//        settings-shared.ts export posScheduleGate(settings) · posStaffCommission(settings) (ข้าง posAnomalyThresholds)
//        staff-pin.ts: verifyStaffPin(ctx, input, client?, opts?: {now?: Date}) · listStaffForDevice(ctx, input, client?, opts?: {now?: Date}) ·
//          input ใหม่ managerUserId + managerPin (override) · ผล OFF_SCHEDULE {reason, window?}
//        reports.ts: REPORT_KINDS ต่อท้าย "commission" · CSV_HEADERS.commission · export reportStaffCommission(ctx, actor, input)
//        register-shared RegisterRefusalCode += OFF_SCHEDULE ALREADY_CLOCKED NO_EMPLOYEE · audit pos.staff.schedule_override / pos.staff.schedule_denied
//        schema: model PosStaffCommission + enum PosStaffCommissionKind {ACCRUE REVERSE} + PosStaffCommissionStatus {OPEN SENT} ·
//          migration 20261217100000_pos_p35_staff_commission (CREATE ล้วน) · scope.ts PosStaffCommission: sys() · pos-qc-env POS_MODELS posStaffCommission
//        outbox-consumers: ขั้นค่าคอมฯ เป็น "งานหลัก" ของ pos.sale.paid / .voided / .refunded (ไม่ใช่ของแถม compose) · minute-jobs เรียก syncStaffCommissionToPayroll
//        fitness ALLOWED_EDGES + "pos→hr" (1 บรรทัด · POS P3.5) · pos-integrations HR facts → true
//
// ขอบเขต: ST สถิต · SG ด่านตารางงาน · LS รายชื่อจอล็อก · CM คณิตบริสุทธิ์ · CL สมุดค่าคอมฯ · PY ส่งเข้างวดเงินเดือน · HC ชั่วโมง ·
//         PV ความเป็นส่วนตัว · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.15/p2.10): SKIP เมื่อของ P3.5 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB ไม่ import อะไร · --no-db = ข้อสถิต ST1–ST3 PV4 + คณิตบริสุทธิ์ CM1–CM6 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab) · ร้านชั่วคราว `qc-p35-<rand>` (+ HR) และ `qc-p35-<rand>-t2` (ไม่มี HR)
//    ผู้ใช้ชั่วคราว `qc-p35-<rand>-*@qc.invalid` · ลบทั้งสองร้าน + ผู้ใช้ใน finally (Z1 = 0 แถว) · ร้าน QC ของ seed ไม่ถูกเขียน (Z2)
//    🔴 ไม่ seed: พนักงาน HR / ตาราง / ใบลา / โปรไฟล์เงินเดือน / รอบจ่าย สร้างด้วยฟังก์ชันของ HR (createEmployee · setSchedule ·
//       setEmployeeActive · requestLeave+decideLeave · setSalaryProfile · createPayrollRun) — ยกเว้น linkedUserId (ฐานไม่มีตัวเขียน — ทางเดียวกับ
//       qc-crm-c3.3 :472 · CONTROLLER-DECISION ในโน้ต) · SQL ดิบใช้แค่เลื่อนเวลา (PosShift.openedAt/closedAt) · ลบแถวของร้านชั่วคราว
//    🔴 ไม่มีเครือข่าย: globalThis.fetch ถูกแทนด้วยตัวกั้น (503 + นับ) ตลอดช่วง DB
//    🔴 เวลา: ด่านตารางงานใช้ opts.now (ไม่ sleep) · การส่งเข้างวดใช้ now ของต้นเดือนหน้า (เดือนนี้ = "จบแล้ว") · ไม่ฮาร์ดโค้ดวันที่
//    โมดูล/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch · `(prisma as any).posStaffCommission?.…`) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const SUITE = "qc-pos-p3.5";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** หมุดของเลน (มติ 11): ต้นไม้ที่ข้อสอบนี้เขียนเทียบ — session/pos 72669941 (ต้นไม้ผลิตภัณฑ์ = c5fc223b) */
const LANE_PIN = "9cfa81bb";
// ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.5 ST2): ต้นไม้ของงานพี่น้องที่ merge แล้วแต่ไม่มีที่หมุด (ไม่มี P3.5 ทั้งคู่) — ไฟล์ห้ามแตะที่ "ไบต์เท่าต้นไม้พี่น้อง" = hunk ของพี่น้อง ไม่ใช่ของใบนี้
//   db4b444b = ทิป P3.4 S (72669941 + P3.4 · = 0617d17b^2 · บล็อก POS P3.4 ▸ ใน register.ts/service.ts) · 3b8a228d = merge HF-FU2 (refund-consumer.ts ACC-1 · หมุด 72669941 อยู่ก่อน HF-FU2)
//   เทียบไบต์กับต้นไม้พี่น้องแทน "ตัดบล็อก P3.4" เพราะ P3.4 ลบบรรทัดเดิมบางบรรทัด (register −6 · service −2) ซึ่งการตัดบล็อกคืนให้ไม่ได้ — รับเฉพาะสิ่งที่พี่น้อง merge จริง
const SIB_REVS = (process.env.P35_SIBS || "db4b444b,3b8a228d").split(",").map((x) => x.trim()).filter(Boolean);

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต/ความเป็นส่วนตัว · X3 สิทธิ์ · X4 เงิน · X5 ผลข้างเคียงครบทุกทาง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.5-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 R2 มติ 5 11] hr/pos-seam.ts export 4 ชื่อ (onShiftToday workedMinutesBetween clockSelf adjustmentStatuses) ไม่มี .create/.update/.delete/.upsert/$executeRaw/prisma ดิบ (เขียนผ่าน clock( เท่านั้น) · hr/index.ts = ของเดิมทุกไบต์ + บล็อก // POS P3.5 ▸ … ◂ หลัง // ◂ CRM C3.3 re-export 4 ชื่อจาก ./pos-seam (ไม่มีทางเข้า DB) · POS import HR เฉพาะ \"@/lib/modules/hr\" จาก pos/hr-link.ts + hr-link-actions.ts เท่านั้น (ไม่มี subpath/relative) · fitness ALLOWED_EDGES มี \"pos→hr\" 1 บรรทัด (POS P3.5) · hr-link-actions \"use server\" async ล้วน + assertCan + posClockAction · hr-link export posClockForShift shiftHoursForOwner"),
  D("ST2", "S", "[มติ 11 · หมุด 72669941] shift.ts ไบต์เท่าหมุด (p1.9 ST8) · ไม่มี hunk/ไฟล์ใหม่ใน pos/register*.ts(x) service.ts refund*.ts (รวม refund-consumer.ts) held-cart.ts (ยกเว้น register-shared.ts: ชนิด/รหัส/คีย์ข้อความ · export เดิมครบ — CD-1) · schema prisma เพิ่มอย่างเดียว (ไม่มีบรรทัดถูกลบ) · migration ใหม่มีแค่ 20261217100000_pos_p35_staff_commission"),
  D("ST3", "S", "[R3 R6 R7 R9 R11 R13 R14 §3] model PosStaffCommission ครบคอลัมน์ R7 + enum ACCRUE|REVERSE · OPEN|SENT + sourceKey @unique + @@index([tenantId,userId,status,periodKey]) + @@index([saleId]) · migration CREATE ล้วน (เฉพาะ PosStaffCommission*) · scope.ts sys() · POS_MODELS · staff-commission(-shared) export ครบ (shared ไม่ import prisma/db) · minute-jobs เรียก syncStaffCommissionToPayroll ในบล็อก POS P3.5 · REPORT_KINDS ต่อท้าย commission + CSV_HEADERS.commission + reportStaffCommission + canViewPayroll · settings-shared posScheduleGate/posStaffCommission · รหัส OFF_SCHEDULE ALREADY_CLOCKED NO_EMPLOYEE · audit schedule_override/schedule_denied · ข้อความ th/en 6 กลุ่ม · pos-integrations HR facts true"),
  // ── SG ด่านตารางงาน (verifyStaffPin) ──
  D("SG1", "-", "[R3 มติ 12] ค่าปริยาย posScheduleGate = {enabled:false, earlyMin 30, lateMin 30, overrideTtlMin 240} · ด่านปิด ⇒ ทุกคนผ่านเหมือนวันนี้ (C3 วันหยุด · C5 ลาออก · C4 ลา ผ่าน · โทเคน 12 ชม.) · ไม่มี audit schedule_*"),
  D("SG2", "X3", "[R4 มติ 3] เปิดด่าน: C1 (09:00–17:00) เวลา 12:00 ✓ expiresAt = 17:30 พอดี (min(12 ชม., end+late)) · 08:00 ✗ OFF_SCHEDULE reason OUTSIDE_HOURS + window {startMin 540, endMin 1020} ไม่มีโทเคน · 08:30 ✓ (ขอบ early) · 17:31 ✗ OUTSIDE_HOURS"),
  D("SG3", "-", "[R4 NO_SCHEDULE] C2 ไม่มีแถวตาราง + ใบลา PENDING วันนี้ ⇒ ✓ (ไม่กล่าวหาจากข้อมูลที่ไม่มี) · expiresAt = now + 12 ชม. (ไม่มีเพดานกะ)"),
  D("SG4", "X3", "[R4] C3 (dayOff ทุกวัน) ⇒ OFF_SCHEDULE reason DAY_OFF · ไม่มีโทเคน"),
  D("SG5", "X3", "[R4] C4 ใบลา APPROVED วันนี้ ⇒ OFF_SCHEDULE reason LEAVE · ไม่มีโทเคน"),
  D("SG6", "X3", "[R4] C5 (HrEmployee active=false) ⇒ OFF_SCHEDULE reason INACTIVE · C6 (ไม่มีพนักงาน HR) ⇒ ✓ fallback (expiresAt now + 12 ชม.)"),
  D("SG7", "X3", "[R4] MANAGER (มีตาราง 09–17) และ OWNER เวลา 03:00 ⇒ ✓ (ยกเว้นตามบทบาท) · ตัวควบคุม: C1 เวลาเดียวกัน ⇒ OUTSIDE_HOURS"),
  D("SG8", "X5", "[R4 มติ 4] override: C1 08:00 + managerUserId MGR + managerPin ⇒ ✓ expiresAt = 08:00 + 240 นาที · audit pos.staff.schedule_override 1 แถว {userId C1, byUserId MGR, reason OUTSIDE_HOURS, deviceId} · audit schedule_denied ต่อการปฏิเสธหลัง PIN ถูกที่ระบุคน 1:1 (C1 08:00 · C1 17:31 · C3 · C4 · C5 · C1 03:00) · audit ไม่มี PIN · C2 อ้างเป็น \"ผู้จัดการ\" ⇒ PERMISSION_DENIED ไม่มีโทเคน/override"),
  D("SG9", "X3", "[R4 P1.15 F2] override ด้วย managerPin ผิด ⇒ PIN_INVALID · failedCount ของ MGR +1 · ของ C1 ไม่เปลี่ยน · ไม่มีโทเคน · ไม่มี audit override เพิ่ม"),
  D("SG10", "X2", "[R4 มติ 6 R13] PIN แบบไม่ระบุคนของ C3 (วันหยุด) ⇒ PIN_INVALID ข้อความเดียวกับ PIN ผิดจริง ไม่มี reason/window · ร้าน T2 (ไม่มีระบบ HR · ด่านเปิด) 03:00 ⇒ ✓ · refusalMessageKey(OFF_SCHEDULE ALREADY_CLOCKED NO_EMPLOYEE) ไม่ใช่ errors.unknown · ไม่ซ้ำ · th ไทย / en มี"),
  D("SG11", "X2", "[fix2 N5 = R1-F2 · ORACLE-ADD ผู้คุม 17 ต.ค.] PIN แบบไม่ระบุคนของ C3 (นอกตาราง) ×N ที่เครื่องเดียว ⇒ PIN_INVALID ทุกครั้ง + แถว pos.staff.pin_failed N แถวของเครื่องนั้น (ตัวนับเห็นเหมือน PIN ผิด) · ครั้งที่ N+1 (PIN C1 ถูก · ในเวลา) ⇒ PIN_THROTTLED"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N5)
  D("SG12", "X3", "[fix2 N6 · ORACLE-ADD ผู้คุม 17 ต.ค.] ตารางข้ามเที่ยงคืน: C2 วันนี้ 16:00–23:45 · พรุ่งนี้ DAY_OFF ⇒ พรุ่งนี้ 00:05 ✓ (แถวเมื่อวาน +1440 · late 30 · expiresAt 00:15) · วันนี้ 23:00 ✓ (แถว DAY_OFF ของพรุ่งนี้ไม่บล็อก) · ตัวควบคุม พรุ่งนี้ 01:00 ⇒ DAY_OFF"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N6)
  D("SG13", "X3", "[fix2 R1-F3 · ORACLE-ADD ผู้คุม 17 ต.ค.] ตัดสิน OWNER/MANAGER ก่อนอ่าน HR: ตัวอ่าน HR ที่ฉีดให้ throw (opts.hrItem) ⇒ OWNER และ MANAGER ยังได้โทเคน 12 ชม. · ตัวฉีดไม่ถูกเรียกในทางของสองบทบาทนี้ · STAFF ที่ผูก HR (C1 12:00) ⇒ ไม่ได้โทเคน (INTERNAL) · ตัวฉีดถูกเรียก"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 F3)
  // ── LS รายชื่อจอล็อก ──
  D("LS1", "-", "[R5 R1] listStaffForDevice(…, {now 12:00}): C1 hr {schedule {540,1020}, onLeave false, inSchedule true} · C2 {schedule null, onLeave false (PENDING ไม่นับ), inSchedule null} · C3/C5 inSchedule false · C4 onLeave true inSchedule false · C6 ไม่มี hr หรือ {null,false,null} · facade onShiftToday: hrLinked true · C1 {employeeId, active true, onLeave false, schedule {540,1020,15,dayOff false}} · C6 ไม่อยู่ใน items · T2 hrLinked false items []"),
  D("LS2", "X2", "[R5 privacy L] รายการจอล็อกไม่มีชนิด/เหตุผลการลา/เงิน: hr มีแค่ schedule onLeave inSchedule · schedule มีแค่ startMin endMin · ไม่มีคีย์ /ommission|salary|satang|reason|leaveType/ ทั้งก้อน · ร้าน T2 (ไม่มี HR) ไม่มีคีย์ hr"),
  // ── CM คณิตบริสุทธิ์ ──
  D("CM1", "X4", "[R6 มติ 1] resolveStaffCommissionRate: product > category > default · สินค้าที่มีแค่ fixedSatang ชนะหมวด (bp 0) · ไม่มีสินค้า/หมวด = default · source PRODUCT|CATEGORY|DEFAULT"),
  D("CM2", "X4", "[R7 มติ 8] staffCommissionAmount ปัดครึ่งขึ้น: (5,1000bp)=1 · (15,1000)=2 · (14,1000)=1 · (3,5000)=2 · (1,4999)=0 · (9999,1000)=1000 · (0,·)=0 · 200 สุ่มตรงสูตรอ้างอิง"),
  D("CM3", "X4", "[R7] fixedSatang × qty: (10000,{0,250},3)=750 · (10000,{1000,250},2)=1500 · (10000,{0,0},5)=0"),
  D("CM4", "X4", "[R7 มติ 8] staffCommissionBases(lineTotals, SC, grand) = lineNets ของบัญชีทุกสตางค์ (200 สุ่ม) · Σ(total − base) = ส่วนลดระดับบิลพอดี · ค่าบริการไม่ถูกเกลี่ย"),
  D("CM5", "X4", "[R8 มติ 9] staffCommissionRefundShare 3 ใบ (200 สุ่ม): ใบที่ยังไม่ครบ = min(halfUp(accrual × refund / net), ที่เหลือ) · ใบที่ครบ = เศษที่เหลือ · Σ = accrual พอดี · ไม่ติดลบ"),
  D("CM6", "-", "[R3 R6] ตัวอ่านค่าตั้ง: posScheduleGate clamp early/late 0–180 · ttl 0–720 · ไม่ใช่จำนวนเต็ม = ค่าปริยาย · คีย์แปลกไม่ออก · posStaffCommission ค่าปริยาย {false,0,{},{},[STAFF,MANAGER]} · bp 0–5000 · fixed 0–100000 · ≤ 500 แถว · บทบาทแปลกถูกตัด · คีย์บนสุด ⊆ 5 คีย์"),
  D("CM7", "X4", "[fix2 N4 · ORACLE-ADD ผู้คุม 17 ต.ค.] staffCommissionRefundShare บรรทัดสุทธิ ≤ 0 (ของแถม · ค่าคอมฯ คงที่ต่อชิ้น) แบ่งตามจำนวน halfUp(acc×q/Q): fixed 500×4 = 2000 คืน 1+1+2 ⇒ 500 · 500 · 1000 · 200 สุ่ม Σ = accrual · ไม่ติดลบ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N4)
  // ── CL สมุดค่าคอมฯ ──
  D("CL1", "X5", "[R7 R8] pos.sale.paid ⇒ ACCRUE 1 แถวต่อบรรทัด (4 บรรทัด · ส่วนลดท้ายบิล ฿10 เกลี่ย) · sourceKey PAID:<sale>:<line> · base = lineNets · rateBp/fixedSatang snapshot · amount ตามสูตร · periodKey = เดือนไทยของ paidAt · OPEN · userId = soldBy · unit/system/sale/line ตรง"),
  D("CL2", "X1", "[R8 มติ 9] drain ซ้ำ 2 รอบ + consumers[pos.sale.paid] เล่นซ้ำ ×2 ⇒ แถวเท่าเดิมทุกไบต์ (4 แถว)"),
  D("CL3", "X1", "[R8] voidSale ⇒ REVERSE −accrual ต่อบรรทัด sourceKey VOID:<sale>:<line> · สุทธิ 0 · เล่น consumers[pos.sale.voided] ซ้ำ ×2 ไม่เพิ่ม"),
  D("CL4", "X4", "[R8 มติ 9] คืน 1/3/1/3/1/3 ของบรรทัด qty 3 (accrual 1000): REVERSE −333 −333 −334 sourceKey REFUND:<refundSaleId>:<refLineId> · สุทธิ 0 · เล่น consumers[pos.sale.refunded] ซ้ำ ×2 ไม่เพิ่ม"),
  D("CL5", "X2", "[R7] ไม่มีสิทธิ์ได้ค่าคอมฯ ⇒ 0 แถว: ผู้ขาย = คีย์ API · ไม่มีผู้ขาย · ใบรับมัดจำ (POS_DEPOSIT) · บิลขายบัตรกำนัล (MEMBER) · ผู้ขาย OWNER (ไม่อยู่ใน sellerRoles) · ค่าตั้งปิด ‖ ตัวควบคุมบวก: ผู้ขาย MANAGER ⇒ 1 แถว"),
  D("CL6", "X4", "[R6 snapshot] แก้อัตราหลังขาย ⇒ แถวเก่าไม่เปลี่ยน (rateBp/amount) · บิลใหม่ใช้อัตราใหม่"),
  D("CL7", "X1", "[มติ 9 hunter] ลำดับแข่ง: บิลถูก void ก่อน consumer paid ทำงาน (ขับ consumers[pos.sale.voided] ก่อน แล้ว drain) ⇒ สุทธิของบิล 0 · เล่น paid ซ้ำหลังจากนั้นยัง 0"),
  D("CL8", "X5", "[R8 มติ 9] งานหลัก: ขั้นค่าคอมฯ อยู่ในคีย์ pos.sale.paid/.voided/.refunded ของ outbox-consumers และไม่เป็นอาร์กิวเมนต์ของแถม compose · ล้มกลางทาง (ข้อสอบลบแถวของบิล) → ขับ consumers[pos.sale.paid] อีกครั้ง ⇒ แถวกลับมาครบตรงเดิม · JV ของบิลเท่าเดิม"),
  // ── PY ส่งเข้างวดเงินเดือน ──
  D("PY1", "X4", "[R9 มติ 8] syncStaffCommissionToPayroll({tenantId, now ตอนนี้}) ⇒ เดือนปัจจุบัน (ยังไม่จบ) ไม่ถูกส่ง · HrPayAdjustment 0 · แถว OPEN ทั้งหมด"),
  D("PY2", "X5", "[R9] now = ต้นเดือนหน้า ⇒ C1: HrPayAdjustment 1 ใบ PENDING COMMISSION amount = Σ แถว OPEN ของ C1 · periodKey = เดือนนี้ · พนักงานของ C1 · note มี POS · แถวของ C1 SENT + hrPayAdjustmentId + sentAt"),
  D("PY3", "X1", "[R9 มติ 9] ส่งซ้ำ 2 รอบ + พร้อมกัน 2 ทาง ⇒ ยัง 1 ใบของ C1 · ไม่มีใบใหม่ในร้าน · แถวยัง SENT ใบเดิม"),
  D("PY4", "X4", "[R9] งวดเดือนนี้มีรอบจ่ายแล้ว (createPayrollRun) ⇒ C2 ขายใหม่ → ส่ง ⇒ periodKey = เดือนถัดไป (เดือนแรกที่ไม่มีรอบ) COMMISSION 500"),
  D("PY5", "X4", "[R9] void บิลที่ส่งแล้ว ⇒ REVERSE เดือนนี้ → ส่ง ⇒ C1 ใบใหม่ DEDUCTION amount = |Σ| (บวก) · periodKey เดือนถัดไป · ไม่แตะใบเดิม"),
  D("PY6", "X2", "[R9 R11] C6 (ไม่มีพนักงาน) + MGR (มีพนักงานแต่ไม่มีโปรไฟล์เงินเดือน) ⇒ แถวยัง OPEN · รายงาน commission noEmployee true · แถวรายงานตรงสมุด (accrued reversed net sent open) · ทุกใบของ POS crmCommissionId null · adjustmentStatuses คืน PENDING runId null"),
  D("PY7", "X4", "[fix2 N1 · ORACLE-ADD ผู้คุม 17 ต.ค.] รอบจ่ายถูกสร้างระหว่างส่งกับอนุมัติ: ใบ PENDING ของ C2 (งวด M1) → createPayrollRun(M1) → decideAdjustment APPROVED ⇒ ใบย้ายไปเดือนแรกที่ยังไม่มีรอบ (M2) · APPROVED · runId null · adjustmentStatuses (POS) เห็น periodKey M2"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N1)
  D("PY8", "X4", "[fix2 N1 · ORACLE-ADD ผู้คุม 17 ต.ค.] ตัวกวาดรายการค้าง: ใบ DEDUCTION PENDING ของ C1 (งวด M1 ที่เพิ่งมีรอบใน PY7) + ใบ COMMISSION เดิมของ C1 (งวดนี้ที่มีรอบตั้งแต่ PY4) → syncStaffCommissionToPayroll ⇒ ย้ายไป M2 · ยัง PENDING · ไม่มีใบ POS ที่ค้างในงวดที่มีรอบ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N1)
  D("PY9", "X5", "[fix2 N2 = R1-F1 · ORACLE-ADD ผู้คุม 17 ต.ค.] 600 คู่ (ร้าน · ผู้ใช้) ที่ไม่มีพนักงาน HR และเรียงอยู่หน้า (userId 0p35…) ไม่บล็อกรอบส่ง: C2 ขายใหม่ 300 ⇒ ใบ COMMISSION 300 ใหม่ของ C2 · 600 คู่ยัง OPEN"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N2)
  D("PY10", "X4", "[fix2 N3 · ORACLE-ADD ผู้คุม 17 ต.ค.] แถว OPEN ของเดือนเก่า (6 เดือนก่อน · ไม่มีรอบ) ขณะที่เดือนหลังมีรอบแล้ว ⇒ งวดเป้าหมาย = max(เดือนของแถว, เดือนถัดจากรอบล่าสุด) — ไม่ใช่เดือนเก่าที่จะไม่มีวันมีรอบ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N3)
  D("PY11", "X4", "[fix3 N9 · ORACLE-ADD ผู้คุม 17 ต.ค.] รอบจ่ายล่วงหน้า (8 เดือนข้างหน้า) ไม่ดันงวดเป้าหมาย: แถว OPEN 555 ของ C1 (เดือนนี้ · จบแล้ว) ⇒ งวด = เดือนถัดจากรอบล่าสุดที่ ≤ เดือนปัจจุบัน — ไม่ใช่เดือนถัดจากรอบล่วงหน้า"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix3 N9)
  D("PY12", "X5", "[fix3 N8 · ORACLE-ADD ผู้คุม 17 ต.ค.] ตัวกวาดมีเวลาของตัวเอง + ลำดับหมุน: 600 ร้าน (สมมุติ) ที่มีแถว SENT เรียงอยู่หน้า · ไม่มีระบบ HR · ร้านนี้มีใบ POS ค้างในงวดที่เพิ่งมีรอบ ⇒ รอบส่งแบบทั้งระบบ (ไม่ระบุร้าน) ≤ 2 รอบ ย้ายใบค้างของร้านนี้ครบ · แถวสมมุติถูกลบท้ายข้อ"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix3 N8)
  // ── HC ชั่วโมง ──
  D("HC1", "X5", "[R12 R1] posClockForShift IN (โทเคน C1 · กะของ C1) ⇒ {ok, kind IN} · HrAttendance +1 IN ของพนักงาน C1 · note มี #<shiftNo>"),
  D("HC2", "X1", "[R12] กดซ้ำ IN ⇒ ALREADY_CLOCKED · HrAttendance ยัง +1"),
  D("HC3", "X3", "[R12] C6 (ไม่มีพนักงาน HR) ⇒ NO_EMPLOYEE · ไม่มี HrAttendance · โทเคนมั่ว ⇒ STAFF_TOKEN_INVALID"),
  D("HC4", "-", "[R12] shiftHoursForOwner (OWNER): กะ C1 (IN+OUT ในกะ) warnings [] · workedMin = workedMinutes(IN,OUT) · กะ C3 (เปิด −100 นาที ปิด −40 นาที · IN ทีหลัง) durationMin 60 · warnings = {NO_CLOCK_IN, NO_CLOCK_OUT} · กะ C6 warnings [NO_EMPLOYEE] workedMin null"),
  // ── PV ความเป็นส่วนตัว ──
  D("PV1", "X3", "[R11 มติ 7] รายงาน commission (JSON + CSV): OWNER ✓ · STAFF ที่มี pos.report.view + hr.payroll.read ✓ · MANAGER ✗ PERMISSION_DENIED · STAFF ที่มี pos.report.view ✗ · ร้าน T2 ⇒ NOT_FOUND · CSV หัว = CSV_HEADERS.commission"),
  D("PV2", "X2", "[R11 มติ 7] ไม่มีคีย์ /ommission/ ใน reportStaff · REST /reports/staff (JSON) · receiptPayload · listStaffForDevice · displayStateSchema · CSV staff ของ REST หัวเท่าเดิม · billDetail ไม่มีคีย์ staffCommission"),
  D("PV3", "X3", "[R12 มติ 7] shiftHoursForOwner: MANAGER ✗ · STAFF ✗ (PERMISSION_DENIED) · STAFF ที่มี hr.payroll.read ✓"),
  D("PV4", "S", "[R11 มติ 7] ไม่มีไฟล์ \"use client\" import pos/staff-commission · pos/hr-link · @/lib/modules/hr · REST ops/reports ไม่มี op commission · CSV_HEADERS.staff เท่าหมุด (qc-pos-p1.17 :212) · StaffRow ไม่มีฟิลด์ /ommission/"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว 2 ร้านเหลือ 0 แถวทุกตารางที่มี tenantId (PosStaffCommission HrAttendance HrPayAdjustment AuditLog OutboxEvent PosStaffPin …) + Tenant ถูกลบ + ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวของร้าน QC POS (seed) ก่อน = หลัง (นับ + hash · รวม HrEmployee HrAttendance HrPayAdjustment PosStaffPin + PosStaffCommission)"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.5-") ? id : `P3.5-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)!.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const P8 = (p: string[]) => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "");
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : "UNKNOWN");
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
const MISSING = "ยังไม่มีโมดูล/โมเดล";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ฟังก์ชัน ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
/** เรียกฟังก์ชันบริสุทธิ์ (ไม่ await) — ไม่มี = undefined + เหตุผล */
function pure(mod: Any, name: string, ...args: unknown[]): { v: Any; err: string } {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { v: undefined, err: `${MISSING} ${name}` };
  try {
    return { v: fn(...args), err: "" };
  } catch (e) {
    return { v: undefined, err: `${name} throw ${(e as Error).message.slice(0, 60)}` };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const THAI = /[ก-๛]/;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const HOUR = 3_600_000;
const MIN = 60_000;
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** ปัดครึ่งขึ้นของ a/b (a ≥ 0 · b > 0) — สูตรอ้างอิงของข้อสอบ (ไม่ใช้ของผู้สร้าง) */
const hu = (a: number, b: number) => (b > 0 && a > 0 ? Math.floor((2 * a + b) / (2 * b)) : 0);
/** คีย์ทุกระดับของค่า (ใช้ตรวจ "ไม่มีคีย์ค่าคอมฯ") */
function deepKeys(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || v === null || typeof v !== "object") return out;
  if (Array.isArray(v)) for (const x of v) deepKeys(x, out, depth + 1);
  else for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out.push(k);
    deepKeys(x, out, depth + 1);
  }
  return out;
}
const commissionKeys = (v: unknown) => [...new Set(deepKeys(v).filter((k) => /ommission/i.test(k)))];

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
const firstStmt = (src: string) => src.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s+)*/, "");
const isUseClient = (src: string) => /^["']use client["']/.test(firstStmt(src));
const isUseServer = (src: string) => /^["']use server["']/.test(firstStmt(src));
/** specifier ทุกตัวของ import / export from / import() */
const specsOf = (src: string): string[] => [...stripComments(src).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)].map((m) => m[1]!);
/** specifier → path ใต้รีโป (ไม่มีนามสกุล) · แพ็กเกจภายนอก = "" */
function resolveSpec(file: string, spec: string): string {
  let p = "";
  if (spec.startsWith("@/")) p = `src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) p = posix.normalize(posix.join(posix.dirname(file), spec));
  else return "";
  return p.replace(/\.(tsx?|mjs|mts|js)$/, "").replace(/\/index$/, "");
}
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
const atPin = (f: string): string | null => git(["show", `${LANE_PIN}:${f}`]);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const POS_DIR = "src/lib/modules/pos";
const HR_DIR = "src/lib/modules/hr";
const F = {
  seam: `${HR_DIR}/pos-seam.ts`,
  hrIndex: `${HR_DIR}/index.ts`,
  link: `${POS_DIR}/hr-link.ts`,
  linkAct: `${POS_DIR}/hr-link-actions.ts`,
  comm: `${POS_DIR}/staff-commission.ts`,
  commShared: `${POS_DIR}/staff-commission-shared.ts`,
  settingsShared: `${POS_DIR}/settings-shared.ts`,
  staffPin: `${POS_DIR}/staff-pin.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  reports: `${POS_DIR}/reports.ts`,
  restReports: `${POS_DIR}/api/ops/reports.ts`,
  shift: `${POS_DIR}/shift.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  minuteJobs: "src/lib/platform/minute-jobs.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  fitness: "scripts/fitness.mts",
  integrations: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const MIG_NAME = "20261217100000_pos_p35_staff_commission";
const MIG = `prisma/migrations/${MIG_NAME}/migration.sql`;
const SEAM_FNS = ["onShiftToday", "workedMinutesBetween", "clockSelf", "adjustmentStatuses"] as const;
const SHARED_FNS = ["resolveStaffCommissionRate", "staffCommissionAmount", "staffCommissionBases", "staffCommissionRefundShare"] as const;
const LEDGER_COLS = ["id", "tenantId", "systemId", "unitId", "saleId", "lineId", "userId", "kind", "sourceKey", "baseSatang", "rateBp", "fixedSatang", "amountSatang", "periodKey", "status", "hrSystemId", "hrPayAdjustmentId", "sentAt", "createdAt"] as const;
const NEW_CODES = ["OFF_SCHEDULE", "ALREADY_CLOCKED", "NO_EMPLOYEE"] as const;
const AUDIT = { override: "pos.staff.schedule_override", denied: "pos.staff.schedule_denied" } as const;
/** หมุด qc-pos-p1.17 :212 = reports.ts :1670 (หัว CSV ของรายงานพนักงาน — ห้ามเพิ่มคอลัมน์ค่าคอมฯ · ⚠️5) */
const STAFF_CSV_PIN = ["รหัสผู้ใช้", "ชื่อ", "จำนวนบิล", "ยอดขายสุทธิ", "ส่วนลด", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"];
/** กลุ่มข้อความใหม่ (R13 · drift: namespace จริงของรีโป = shift / report ไม่ใช่ shifts / reports) */
const MSG_GROUPS = ["register.lock.schedule", "settings.staff.scheduleGate", "settings.staff.commission", "shift.hours", "report.commission"] as const;
const MSG_LEAVES = ["report.kinds.commission"] as const;

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "PV4"].map((x) => `P3.5-${x}`);
const PURE_IDS = ["CM1", "CM2", "CM3", "CM4", "CM5", "CM6", "CM7" /* ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N4) */].map((x) => `P3.5-${x}`);
const skipReasons: string[] = [];
for (const [f, label] of [[F.seam, "hr/pos-seam.ts"], [F.link, "pos/hr-link.ts"], [F.comm, "pos/staff-commission.ts"], [F.commShared, "pos/staff-commission-shared.ts"]] as const)
  if (!existsSync(join(ROOT, f))) skipReasons.push(`${label} ยังไม่มี`);
for (const n of SEAM_FNS) if (existsSync(join(ROOT, F.seam)) && !exportsFn(srcOf(F.seam), n)) skipReasons.push(`ยังไม่มี export ${n} (hr/pos-seam.ts)`);
if (!exportsFn(srcOf(F.comm), "syncStaffCommissionToPayroll")) skipReasons.push("ยังไม่มี export syncStaffCommissionToPayroll (pos/staff-commission.ts)");
if (!existsSync(join(ROOT, MIG))) skipReasons.push(`ยังไม่มี migration ${MIG_NAME}`);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · ไม่โหลดโมดูลของแอป) ═════════════════════════
function runStatic(): void {
  console.log("\n── ข้อสถิต (ไม่แตะ DB) ──");
  // ST1 รอยต่อ HR ↔ POS
  {
    const p: string[] = [];
    const seam = rd(F.seam);
    const seamS = stripComments(seam);
    if (!seam) p.push("ไม่มี hr/pos-seam.ts");
    else {
      for (const n of SEAM_FNS) if (!exportsFn(seamS, n)) p.push(`pos-seam ไม่มี export ${n}`);
      const w = /\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(|\$executeRaw|\$queryRawUnsafe/.exec(seamS);
      if (w) p.push(`pos-seam เขียน/SQL ดิบเอง (${w[0]})`);
      if (!/\bclock\s*\(/.test(seamS)) p.push("pos-seam ไม่เรียก clock( (ทางเขียนเดียวที่อนุญาต)");
      if (specsOf(seam).some((s) => s === "@/lib/core/db" || s === "@prisma/client" || /modules\/pos/.test(s))) p.push("pos-seam import prisma ดิบ/โมดูล POS");
      if (isUseServer(seam)) p.push("pos-seam เป็น \"use server\"");
    }
    const idx = rd(F.hrIndex);
    const base = atPin(F.hrIndex);
    if (base === null) p.push(`อ่าน hr/index.ts ที่หมุด ${LANE_PIN} ไม่ได้`);
    else if (!idx.startsWith(base.replace(/\s+$/, ""))) p.push("hr/index.ts: ส่วนเดิมถูกแก้ (ต้องต่อท้ายอย่างเดียว)");
    const at = idx.indexOf("// POS P3.5 ▸");
    const crm = idx.indexOf("// ◂ CRM C3.3");
    if (at < 0) p.push("hr/index.ts ไม่มีบล็อก // POS P3.5 ▸");
    else {
      if (crm < 0 || at < crm) p.push("บล็อก POS P3.5 ไม่อยู่หลัง // ◂ CRM C3.3");
      const hEnd = idx.indexOf("\n", at) < 0 ? idx.length : idx.indexOf("\n", at);
      const end = idx.indexOf("◂", hEnd);
      const body = stripComments(end > 0 ? idx.slice(at, end) : idx.slice(at));
      for (const n of SEAM_FNS) if (!new RegExp(`\\b${n}\\b`).test(body)) p.push(`บล็อก POS P3.5 ไม่ re-export ${n}`);
      if (!/from\s+["']\.\/pos-seam["']/.test(body)) p.push("บล็อก POS P3.5 ไม่ re-export จาก ./pos-seam");
      if (/\b(function|const|let|await)\b/.test(body)) p.push("บล็อก POS P3.5 มีตรรกะ (ต้อง re-export ล้วน)");
      if (end < 0) p.push("บล็อก POS P3.5 ไม่ปิดด้วย ◂");
    }
    if (specsOf(idx).some((s) => s === "@/lib/core/db" || s === "@prisma/client") || /\btenantDb\b|new\s+PrismaClient/.test(stripComments(idx))) p.push("hr/index.ts มีทางเข้า DB");
    // POS → HR
    const posFiles = [...walk(POS_DIR), ...walk("src/app/app/sys/[id]/pos"), ...walk("src/components/pos")];
    const allowed = new Set([F.link, F.linkAct]);
    let linkUses = 0;
    for (const f of posFiles) {
      const src = rd(f);
      for (const s of specsOf(src)) {
        const r = resolveSpec(f, s);
        if (!(r === HR_DIR || r.startsWith(`${HR_DIR}/`))) continue;
        if (s !== "@/lib/modules/hr") p.push(`${f.replace(/^src\//, "")} import HR ข้าม facade (${s})`);
        else if (!allowed.has(f)) p.push(`${f.replace(/^src\//, "")} import @/lib/modules/hr (อนุญาตเฉพาะ hr-link.ts/hr-link-actions.ts)`);
        else if (f === F.link) linkUses++;
      }
    }
    if (!linkUses) p.push("pos/hr-link.ts ไม่ import \"@/lib/modules/hr\"");
    const fit = rd(F.fitness);
    const edgeLines = fit.split("\n").filter((l) => /["']pos→hr["']/.test(l));
    if (edgeLines.length !== 1) p.push(`fitness มี "pos→hr" ${edgeLines.length} บรรทัด (คาด 1)`);
    else if (!/POS P3\.5/.test(edgeLines[0]!)) p.push("บรรทัด \"pos→hr\" ไม่มีป้าย POS P3.5");
    const act = rd(F.linkAct);
    if (!act) p.push("ไม่มี pos/hr-link-actions.ts");
    else {
      if (!isUseServer(act)) p.push("hr-link-actions ไม่ใช่ \"use server\"");
      const actS = stripComments(act);
      const bad = [...actS.matchAll(/^\s*export\s+(?!async\s+function\b)(\S+\s*\S*)/gm)].map((m) => m[1]!.trim());
      if (bad.length) p.push(`hr-link-actions export ที่ไม่ใช่ async function (${bad.slice(0, 3).join(",")})`);
      if (!exportsFn(actS, "posClockAction")) p.push("hr-link-actions ไม่มี export posClockAction");
      if (!/\bassertCan\s*\(/.test(actS)) p.push("hr-link-actions ไม่เรียก assertCan(");
    }
    const link = rd(F.link);
    if (!link) p.push("ไม่มี pos/hr-link.ts");
    else {
      if (isUseServer(link)) p.push("hr-link.ts เป็น \"use server\" (ต้องเป็นไฟล์บริการ)");
      for (const n of ["posClockForShift", "shiftHoursForOwner"]) if (!exportsFn(stripComments(link), n)) p.push(`hr-link.ts ไม่มี export ${n}`);
    }
    chk("ST1", p.length === 0, "seam 4 ชื่อ · index ต่อท้าย · POS→HR ผ่าน facade จาก hr-link เท่านั้น · fitness pos→hr · actions", P8(p) || `ครบ (${posFiles.length} ไฟล์ POS)`);
  }
  // ST2 หมุดของเลน
  {
    const p: string[] = [];
    const pinShift = atPin(F.shift);
    if (pinShift === null) p.push(`อ่าน shift.ts ที่หมุด ${LANE_PIN} ไม่ได้`);
    else if (sha(pinShift) !== sha(rd(F.shift))) p.push("shift.ts ไม่เท่าหมุด (p1.9 ST8 · มติ 11)");
    const changed = (git(["diff", "--name-only", LANE_PIN, "--", POS_DIR]) ?? "").split("\n").filter(Boolean);
    const untracked = (git(["ls-files", "--others", "--exclude-standard", "--", POS_DIR]) ?? "").split("\n").filter(Boolean);
    if (git(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`]) === null) p.push(`ไม่มี commit หมุด ${LANE_PIN}`);
    const FORBID = /^(register[^/]*\.tsx?|service\.ts|refund[^/]*\.ts|held-cart\.ts)$/;
    // CONTROLLER-DECISION CD-1 (โน้ต): register-shared.ts = ชนิด/รหัส/คีย์ข้อความล้วน (R5 StaffListItem.hr? · R13 รหัส + refusalMessageKey) ⇒ แก้ได้
    //   แต่ export เดิมต้องอยู่ครบ — ไฟล์ register*.ts อื่นยังห้ามแตะ
    const SHARED_OK = "register-shared.ts";
    for (const f of [...changed, ...untracked]) {
      const b = f.split("/").pop()!;
      if (!f.startsWith(`${POS_DIR}/`) || f.slice(POS_DIR.length + 1).includes("/") || !FORBID.test(b)) continue;
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.5 CD-B2): register.ts อนุญาต hunk เดียว — 3 บรรทัดที่เพิ่มใน REG_MESSAGE (OFF_SCHEDULE · ALREADY_CLOCKED · NO_EMPLOYEE ·
      //   บรรทัดแรกมีป้าย `// POS P3.5 ▸ CD-B2 REG_MESSAGE ◂`) · ไม่มีบรรทัดถูกลบ · อื่นใดใน register.ts = แดงเหมือนเดิม
      if (b === "register.ts" && changed.includes(f)) {
        // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.5 ST2): กฎ CD-B2 เดิมทุกข้อ เทียบหมุด หรือเทียบทิป P3.4 S (register.ts ที่มีบล็อก P3.4 แล้ว) — ผ่านอันใดอันหนึ่ง
        let p35RegDesc = "";
        const cdB2 = (rev: string): boolean => {
          const d = (git(["diff", "--no-color", "-U0", rev, "--", f]) ?? "").split("\n");
          const added = d.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
          const removed = d.filter((l) => l.startsWith("-") && !l.startsWith("---"));
          const hunks = d.filter((l) => l.startsWith("@@"));
          const cur = rd(f);
          const i = cur.indexOf("const REG_MESSAGE");
          const j = i >= 0 ? cur.indexOf("\n};", i) : -1;
          const body = i >= 0 && j > i ? cur.slice(i, j) : "";
          const ok =
            hunks.length === 1 && removed.length === 0 && added.length === 3 &&
            /^\+\s*OFF_SCHEDULE:\s*"[^"]*",\s*\/\/ POS P3\.5 ▸ CD-B2 REG_MESSAGE ◂\s*$/.test(added[0]!) &&
            /^\+\s*ALREADY_CLOCKED:\s*"[^"]*",\s*$/.test(added[1]!) &&
            /^\+\s*NO_EMPLOYEE:\s*"[^"]*",\s*$/.test(added[2]!) &&
            added.every((l) => body.includes(l.slice(1)));
          if (!ok && rev === LANE_PIN) p35RegDesc = `${hunks.length} hunk · +${added.length} −${removed.length}`;
          return ok;
        };
        if (!cdB2(LANE_PIN) && !SIB_REVS.some((rv) => git(["rev-parse", "--verify", "-q", `${rv}^{commit}`]) !== null && cdB2(rv))) p.push(`register.ts มี hunk นอก CD-B2 (${p35RegDesc})`);
        continue;
      }
      if (b === SHARED_OK && changed.includes(f)) {
        const names = (src: string) => new Set([...stripComments(src).matchAll(/export\s+(?:async\s+)?(?:function|const|type|class|interface|let)\s+(\w+)/g)].map((m) => m[1]!));
        const before = names(atPin(f) ?? ""), now = names(rd(f));
        const lost = [...before].filter((n) => !now.has(n));
        if (lost.length) p.push(`register-shared.ts export หาย ${lost.slice(0, 4).join(",")}`);
        continue;
      }
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.5 ST2): ไบต์เท่าต้นไม้พี่น้อง (P3.4 S / HF-FU2) = ไม่ใช่ hunk ของใบนี้
      if (changed.includes(f) && SIB_REVS.some((rv) => { const at = git(["show", `${rv}:${f}`]); return at !== null && sha(at) === sha(rd(f)); })) continue;
      p.push(`${b} มี hunk/ไฟล์ใหม่ (ห้ามแตะ · มติ 11)`);
    }
    const schemaDiff = git(["diff", "--no-color", "-U0", LANE_PIN, "--", "prisma/schema"]) ?? "";
    const removed = schemaDiff.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---") && l.slice(1).trim() !== "");
    if (removed.length) p.push(`schema มีบรรทัดถูกลบ/แก้ ${removed.length} (${short(removed[0], 60)})`);
    const pinMigs = new Set((git(["ls-tree", "--name-only", `${LANE_PIN}:prisma/migrations`]) ?? "").split("\n").filter(Boolean));
    const nowMigs = existsSync(join(ROOT, "prisma/migrations")) ? readdirSync(join(ROOT, "prisma/migrations")) : [];
    // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.5 ST2): migration ที่มีอยู่ในต้นไม้พี่น้อง (*_pos_p34_offline ของ P3.4 S) ไม่ใช่ "ใหม่ที่ไม่ใช่ของใบนี้"
    for (const rv of SIB_REVS) for (const x of (git(["ls-tree", "--name-only", `${rv}:prisma/migrations`]) ?? "").split("\n").filter(Boolean)) if (x !== MIG_NAME) pinMigs.add(x);
    const extra = nowMigs.filter((d) => !pinMigs.has(d) && d !== MIG_NAME);
    if (pinMigs.size === 0) p.push("อ่านรายชื่อ migration ที่หมุดไม่ได้");
    if (extra.length) p.push(`migration ใหม่ที่ไม่ใช่ของใบนี้: ${extra.join(",")}`);
    chk("ST2", p.length === 0, "shift.ts = หมุด · ไม่มี hunk ในไฟล์ห้ามแตะ · schema เพิ่มอย่างเดียว · migration เดียว", P8(p) || `ครบ (เทียบ ${LANE_PIN} · ${changed.length + untracked.length} ไฟล์ POS เปลี่ยน)`);
  }
  // ST3 schema · migration · ลงทะเบียน · ชื่อ · ข้อความ
  {
    const p: string[] = [];
    const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
    const b = prismaBlock(schemaSrc, "model", "PosStaffCommission");
    if (!b) p.push("ไม่มี model PosStaffCommission");
    else {
      const miss = LEDGER_COLS.filter((c) => !fieldLine(b, c));
      if (miss.length) p.push(`PosStaffCommission ขาด ${miss.join(",")}`);
      if (!/^sourceKey\s+String\s+@unique/.test(fieldLine(b, "sourceKey")) && !/@@unique\(\[\s*sourceKey\s*\]\)/.test(b)) p.push("sourceKey ไม่ใช่ @unique");
      if (!/^kind\s+PosStaffCommissionKind\b/.test(fieldLine(b, "kind"))) p.push("kind ไม่ใช่ PosStaffCommissionKind");
      if (!/^status\s+PosStaffCommissionStatus\b/.test(fieldLine(b, "status"))) p.push("status ไม่ใช่ PosStaffCommissionStatus");
      for (const c of ["baseSatang", "rateBp", "fixedSatang", "amountSatang"]) if (fieldLine(b, c) && !new RegExp(`^${c}\\s+Int\\b`).test(fieldLine(b, c))) p.push(`${c} ไม่ใช่ Int`);
      for (const c of ["hrSystemId", "hrPayAdjustmentId", "sentAt"]) if (fieldLine(b, c) && !/\?/.test(fieldLine(b, c).split(/\s+/)[1] ?? "")) p.push(`${c} ไม่ใช่ optional`);
      if (!/@@index\(\[\s*tenantId\s*,\s*userId\s*,\s*status\s*,\s*periodKey\s*\]\)/.test(b)) p.push("ไม่มี @@index([tenantId, userId, status, periodKey])");
      if (!/@@index\(\[\s*saleId\s*\]\)/.test(b)) p.push("ไม่มี @@index([saleId])");
    }
    const ek = prismaBlock(schemaSrc, "enum", "PosStaffCommissionKind");
    const es = prismaBlock(schemaSrc, "enum", "PosStaffCommissionStatus");
    if (!/\bACCRUE\b/.test(ek) || !/\bREVERSE\b/.test(ek)) p.push("enum PosStaffCommissionKind ไม่ใช่ ACCRUE|REVERSE");
    if (!/\bOPEN\b/.test(es) || !/\bSENT\b/.test(es)) p.push("enum PosStaffCommissionStatus ไม่ใช่ OPEN|SENT");
    const sql = rd(MIG).replace(/--.*$/gm, "");
    if (!sql) p.push(`ไม่มี ${MIG}`);
    else {
      const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
      for (const s of stmts) {
        const ok = /^CREATE\s+(TYPE|TABLE|UNIQUE\s+INDEX|INDEX)\b/i.test(s) || /^ALTER\s+TABLE\s+"PosStaffCommission"\s+ADD\s+CONSTRAINT\b/i.test(s);
        if (!ok) p.push(`migration มีคำสั่งที่ไม่ใช่ CREATE (${short(s, 60)})`);
        const names = [...s.matchAll(/^(?:CREATE\s+(?:TYPE|TABLE)|ALTER\s+TABLE)\s+"([A-Za-z]+)"/gi)].map((m) => m[1]!);
        const onTbl = /\bON\s+"([A-Za-z]+)"/i.exec(s)?.[1];
        for (const n of [...names, ...(onTbl ? [onTbl] : [])]) if (!/^PosStaffCommission/.test(n)) p.push(`migration แตะ ${n} (คาดเฉพาะ PosStaffCommission*)`);
      }
      if (!/CREATE\s+TABLE\s+"PosStaffCommission"/i.test(sql)) p.push('migration ไม่มี CREATE TABLE "PosStaffCommission"');
      if (!/CREATE\s+UNIQUE\s+INDEX[^;]*"PosStaffCommission"\s*\(\s*"sourceKey"\s*\)/i.test(sql)) p.push("migration ไม่มี unique index sourceKey");
    }
    if (!/\bPosStaffCommission\s*:\s*sys\(\)/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosStaffCommission: sys()");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposStaffCommission\s*:/.test(pm)) p.push("pos-qc-env POS_MODELS ไม่มี posStaffCommission");
    const comm = srcOf(F.comm);
    if (!comm) p.push("ไม่มี pos/staff-commission.ts");
    else if (!exportsFn(comm, "syncStaffCommissionToPayroll")) p.push("staff-commission.ts ไม่มี export syncStaffCommissionToPayroll");
    const sh = rd(F.commShared);
    if (!sh) p.push("ไม่มี pos/staff-commission-shared.ts");
    else {
      for (const n of SHARED_FNS) if (!exportsFn(stripComments(sh), n)) p.push(`staff-commission-shared ไม่มี export ${n}`);
      if (specsOf(sh).some((s) => s === "@/lib/core/db" || s === "@prisma/client" || /\/(db|staff-commission|hr-link)$/.test(s) || s === "server-only")) p.push("staff-commission-shared import ของเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    }
    // ตัวเขียนเดียวของสมุด
    for (const f of walk("src")) {
      if (f === F.comm) continue;
      if (/\bposStaffCommission\s*\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(|(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"PosStaffCommission"/i.test(srcOf(f))) p.push(`${f.replace(/^src\//, "")} เขียน PosStaffCommission (ตัวเขียนเดียว = staff-commission.ts)`);
    }
    const mj = rd(F.minuteJobs);
    const mjAt = mj.indexOf("// POS P3.5 ▸");
    if (mjAt < 0) p.push("minute-jobs ไม่มีบล็อก // POS P3.5 ▸");
    else {
      const hEnd = mj.indexOf("\n", mjAt) < 0 ? mj.length : mj.indexOf("\n", mjAt);
      const close = mj.indexOf("◂", hEnd);
      const blk = stripComments(close > 0 ? mj.slice(mjAt, close) : mj.slice(mjAt));
      if (!/registerMinuteJob\s*\(/.test(blk) || !/syncStaffCommissionToPayroll/.test(blk)) p.push("บล็อก minute-jobs ไม่ registerMinuteJob → syncStaffCommissionToPayroll");
    }
    const rep = srcOf(F.reports);
    const kinds = /export const REPORT_KINDS\s*=\s*\[([^\]]*)\]/.exec(rep)?.[1] ?? "";
    const kindList = [...kinds.matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]!);
    // ORACLE-EDIT ผู้คุม POS (B) 21 ต.ค. (CD-P36-B3 · P3.6 R9 ต่อท้าย credit): เดิม "ตัวสุดท้าย = commission" ⇒ ต้องมี commission · ถ้ามี credit ต้องอยู่หลัง commission ◂
    const iCommission = kindList.indexOf("commission");
    const iCredit = kindList.indexOf("credit");
    if (iCommission < 0) p.push(`REPORT_KINDS ไม่มี "commission" (${kindList.slice(-2).join(",")})`);
    else if (iCredit >= 0 && iCredit < iCommission) p.push(`REPORT_KINDS: "credit" อยู่ก่อน "commission" (${kindList.slice(-3).join(",")})`);
    if (!/\n\s*commission\s*:\s*\[/.test(rep.slice(rep.indexOf("export const CSV_HEADERS")))) p.push("CSV_HEADERS ไม่มี commission");
    if (!exportsFn(rep, "reportStaffCommission")) p.push("reports.ts ไม่มี export reportStaffCommission");
    if (!/\bcanViewPayroll\b/.test(rep)) p.push("reports.ts ไม่ใช้ canViewPayroll (มติ 7)");
    const ss = srcOf(F.settingsShared);
    for (const n of ["posScheduleGate", "posStaffCommission"]) if (!exportsFn(ss, n)) p.push(`settings-shared ไม่มี export ${n}`);
    const rs = srcOf(F.regShared);
    const union = rs.slice(rs.indexOf("export type RegisterRefusalCode"), rs.indexOf(";", rs.indexOf("export type RegisterRefusalCode")));
    for (const c of NEW_CODES) if (!new RegExp(`["']${c}["']`).test(union)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
    const auditSrc = srcOf(F.staffPin) + srcOf(F.link);
    for (const a of Object.values(AUDIT)) if (!auditSrc.includes(`"${a}"`) && !auditSrc.includes(`'${a}'`)) p.push(`ไม่มี audit "${a}" ใน staff-pin.ts/hr-link.ts`);
    // ข้อความ
    let th: Any = null, en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
      en = JSON.parse(rd(F.msgEn) || "null");
    } catch {
      p.push("อ่าน messages ไม่ได้");
    }
    const get = (o: Any, path: string) => path.split(".").reduce((a: Any, k) => (isRecord(a) ? a[k] : undefined), o);
    const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : isRecord(v) ? Object.values(v).flatMap(strings) : []);
    for (const g of [...MSG_GROUPS, ...MSG_LEAVES]) {
      const a = strings(get(th, g)), e = strings(get(en, g));
      if (!a.length) p.push(`th ไม่มี pos.${g}`);
      else if (!a.every((s) => THAI.test(s))) p.push(`th pos.${g} มีข้อความที่ไม่ใช่ไทย`);
      if (!e.length) p.push(`en ไม่มี pos.${g}`);
      else if (e.some((s) => THAI.test(s))) p.push(`en pos.${g} มีอักษรไทย`);
    }
    const integ = srcOf(F.integrations);
    const hrRow = /\bHR\s*:\s*\[([^\n]*)\]\s*,?\s*\n/.exec(integ)?.[1] ?? "";
    for (const k of ["shiftPinSchedule", "salesCommission", "leaveHidesShift"]) if (!new RegExp(`\\[\\s*["']${k}["']\\s*,\\s*true\\b`).test(hrRow)) p.push(`pos-integrations HR ${k} ยังไม่ true (R14)`);
    chk("ST3", p.length === 0, "schema + migration CREATE + ลงทะเบียน + ชื่อ + ข้อความ + facts", P8(p) || "ครบ");
  }
  // PV4 ความเป็นส่วนตัว (สถิต)
  {
    const p: string[] = [];
    let clientFiles = 0;
    for (const f of walk("src")) {
      const src = rd(f);
      if (!isUseClient(src)) continue;
      clientFiles++;
      for (const s of specsOf(src)) {
        const r = resolveSpec(f, s);
        if (/^src\/lib\/modules\/pos\/(staff-commission|hr-link)$/.test(r) || r === HR_DIR || r.startsWith(`${HR_DIR}/pos-seam`)) p.push(`${f.replace(/^src\//, "")} ("use client") import ${s}`);
      }
    }
    const ops = srcOf(F.restReports);
    if (/["']reports\.commission["']|\/reports\/commission|reportStaffCommission/.test(ops)) p.push("REST ops/reports เปิด commission (มติ 7: ไม่เปิดใน P3.5)");
    const rep = srcOf(F.reports);
    const hdr = rep.slice(rep.indexOf("export const CSV_HEADERS"));
    const staffHdr = /\n\s*staff\s*:\s*\[([^\]]*)\]/.exec(hdr)?.[1] ?? "";
    const staffList = [...staffHdr.matchAll(/["']([^"']*)["']/g)].map((m) => m[1]!);
    if (JSON.stringify(staffList) !== JSON.stringify(STAFF_CSV_PIN)) p.push(`CSV_HEADERS.staff ไม่เท่าหมุด (${short(staffList, 80)})`);
    const sr = rep.slice(rep.indexOf("export type StaffRow"), rep.indexOf("};", rep.indexOf("export type StaffRow")));
    if (!sr) p.push("ไม่พบ type StaffRow");
    else if (/ommission/i.test(sr)) p.push("StaffRow มีฟิลด์ค่าคอมฯ");
    chk("PV4", p.length === 0, "ไม่มี client import ของค่าคอมฯ/HR · REST ไม่เปิด · CSV staff เท่าหมุด · StaffRow สะอาด", P8(p) || `ครบ (${clientFiles} ไฟล์ "use client")`);
  }
}

// ═════════════════════════ 1a. คณิตบริสุทธิ์ (โหลดเฉพาะไฟล์ -shared + refund-math · ไม่โหลด prisma) ═════════════════════════
/** สุ่มแบบกำหนดเมล็ด (ผลซ้ำได้ทุกรอบ) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
async function runPure(): Promise<void> {
  console.log("\n── คณิตบริสุทธิ์ (CM) ──");
  const sh = existsSync(join(ROOT, F.commShared)) ? await tryImport("@/lib/modules/pos/staff-commission-shared") : null;
  const ss = await tryImport("@/lib/modules/pos/settings-shared");
  const rm = await tryImport("@/lib/modules/pos/refund-math");
  const NS = sh ? "" : `${MISSING} staff-commission-shared.ts · `;
  const cfgLit = { enabled: true, defaultBp: 300, byCategory: { c1: { bp: 500 } }, byProduct: { p1: { bp: 1000 }, p2: { fixedSatang: 250 } }, sellerRoles: ["STAFF", "MANAGER"] };
  const parsed = pure(ss, "posStaffCommission", { pos: { staffCommission: cfgLit } });
  const cfg = parsed.v && isRecord(parsed.v) ? parsed.v : cfgLit;
  // CM1
  {
    const p: string[] = [];
    const cases: [Any, number, number, string][] = [
      [{ productId: "p1", categoryId: "c1" }, 1000, 0, "PRODUCT"],
      [{ productId: "p9", categoryId: "c1" }, 500, 0, "CATEGORY"],
      [{ productId: "p9", categoryId: null }, 300, 0, "DEFAULT"],
      [{ productId: null, categoryId: null }, 300, 0, "DEFAULT"],
      [{ productId: "p2", categoryId: "c1" }, 0, 250, "PRODUCT"],
      [{ productId: null, categoryId: "c1" }, 500, 0, "CATEGORY"],
    ];
    for (const [line, bp, fixed, src] of cases) {
      const r = pure(sh, "resolveStaffCommissionRate", cfg, line);
      if (r.err) {
        p.push(r.err);
        break;
      }
      if (Number(r.v?.bp) !== bp || Number(r.v?.fixedSatang ?? 0) !== fixed || r.v?.source !== src) p.push(`${short(line, 50)} → ${short(r.v, 70)} (คาด bp ${bp} fixed ${fixed} ${src})`);
    }
    chk("CM1", NS === "" && p.length === 0, "product > category > default", NS + (P8(p) || `ครบ ${cases.length} กรณี${parsed.err ? " (ใช้ค่าตั้งตรง — ตัวอ่านยังไม่มี)" : ""}`));
  }
  // CM2
  {
    const p: string[] = [];
    const cases: [number, number, number][] = [[5, 1000, 1], [15, 1000, 2], [14, 1000, 1], [3, 5000, 2], [1, 4999, 0], [9999, 1000, 1000], [0, 3000, 0], [25, 2000, 5]];
    for (const [base, bp, want] of cases) {
      const r = pure(sh, "staffCommissionAmount", base, { bp, fixedSatang: 0 }, 1);
      if (r.err) {
        p.push(r.err);
        break;
      }
      if (r.v !== want) p.push(`(${base},${bp}) → ${short(r.v)} (คาด ${want})`);
    }
    const R = rng(3501);
    for (let i = 0; i < 200 && !p.length; i++) {
      const base = Math.floor(R() * 2_000_000), bp = Math.floor(R() * 5001), qty = 1 + Math.floor(R() * 9);
      const r = pure(sh, "staffCommissionAmount", base, { bp, fixedSatang: 0 }, qty);
      if (r.v !== hu(base * bp, 10_000)) p.push(`สุ่ม (${base},${bp},${qty}) → ${short(r.v)} (คาด ${hu(base * bp, 10_000)})`);
    }
    chk("CM2", NS === "" && p.length === 0, "ปัดครึ่งขึ้น · 200 สุ่ม", NS + (P8(p) || `ครบ ${cases.length} + 200`));
  }
  // CM3
  {
    const p: string[] = [];
    const cases: [number, number, number, number, number][] = [[10_000, 0, 250, 3, 750], [10_000, 1000, 250, 2, 1500], [10_000, 0, 0, 5, 0], [0, 0, 100_000, 2, 200_000]];
    for (const [base, bp, fixed, qty, want] of cases) {
      const r = pure(sh, "staffCommissionAmount", base, { bp, fixedSatang: fixed }, qty);
      if (r.err) {
        p.push(r.err);
        break;
      }
      if (r.v !== want) p.push(`(${base},${bp},${fixed},${qty}) → ${short(r.v)} (คาด ${want})`);
    }
    chk("CM3", NS === "" && p.length === 0, "fixed × qty", NS + (P8(p) || `ครบ ${cases.length}`));
  }
  // CM4
  {
    const p: string[] = [];
    if (typeof rm?.lineNets !== "function") p.push("ไม่มี refund-math.lineNets (ตัวอ้างอิง)");
    const R = rng(3504);
    for (let i = 0; i < 200 && !p.length; i++) {
      const n = 1 + Math.floor(R() * 6);
      const totals = Array.from({ length: n }, () => Math.floor(R() * 50_000));
      const sc = R() < 0.3 ? Math.floor(R() * 2_000) : 0;
      const d = Math.floor(R() * Math.max(1, sum(totals) * 0.4));
      const grand = sum(totals) + sc - d;
      const want = rm.lineNets(totals, sc, grand) as number[];
      const r = pure(sh, "staffCommissionBases", totals, sc, grand);
      if (r.err) {
        p.push(r.err);
        break;
      }
      if (JSON.stringify(r.v) !== JSON.stringify(want)) p.push(`(${totals.join("/")} sc ${sc} grand ${grand}) → ${short(r.v, 60)} (คาด ${want.join("/")})`);
      else if (sum(totals.map((t, k) => t - (r.v as number[])[k]!)) !== d) p.push(`Σ ส่วนลดไม่เท่า ${d}`);
    }
    chk("CM4", NS === "" && p.length === 0, "= lineNets · Σ = ส่วนลดบิล (200 สุ่ม)", NS + (P8(p) || "ครบ 200"));
  }
  // CM5
  {
    const p: string[] = [];
    if (typeof rm?.refundLineAmount !== "function") p.push("ไม่มี refund-math.refundLineAmount (ตัวอ้างอิง)");
    const R = rng(3505);
    for (let i = 0; i < 200 && !p.length; i++) {
      const Q = 3 + Math.floor(R() * 4);
      const net = 1 + Math.floor(R() * 90_000);
      const accrual = Math.floor(R() * 20_000);
      const q1 = 1 + Math.floor(R() * (Q - 2)), q2 = 1 + Math.floor(R() * (Q - q1 - 1));
      const parts = [q1, q2, Q - q1 - q2];
      let prevQ = 0, prevAmt = 0, prevS = 0;
      for (let k = 0; k < 3; k++) {
        const amt = rm.refundLineAmount(net, Q, prevQ, prevAmt, parts[k]!) as number;
        const done = k === 2;
        const r = pure(sh, "staffCommissionRefundShare", accrual, net, amt, prevS, done);
        if (r.err) {
          p.push(r.err);
          break;
        }
        const want = done ? accrual - prevS : Math.min(hu(accrual * amt, net), accrual - prevS);
        if (r.v !== want || r.v < 0) {
          p.push(`(acc ${accrual} net ${net} refund ${amt} prev ${prevS} ${done ? "ครบ" : ""}) → ${short(r.v)} (คาด ${want})`);
          break;
        }
        prevQ += parts[k]!;
        prevAmt += amt;
        prevS += r.v as number;
      }
      if (!p.length && prevS !== accrual) p.push(`Σ ${prevS} ≠ accrual ${accrual}`);
    }
    chk("CM5", NS === "" && p.length === 0, "Σ ใบคืน = accrual (200 สุ่ม · 3 ใบ)", NS + (P8(p) || "ครบ 200"));
  }
  // CM6
  {
    const p: string[] = [];
    const g0 = pure(ss, "posScheduleGate", undefined);
    if (g0.err) p.push(g0.err);
    else if (JSON.stringify(g0.v) !== JSON.stringify({ enabled: false, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 })) p.push(`posScheduleGate(undefined) → ${short(g0.v, 90)}`);
    const g1 = pure(ss, "posScheduleGate", { pos: { staff: { scheduleGate: { enabled: true, earlyMin: 999, lateMin: -5, overrideTtlMin: 5000, junk: 1 } } } });
    if (!g1.err && JSON.stringify(g1.v) !== JSON.stringify({ enabled: true, earlyMin: 180, lateMin: 0, overrideTtlMin: 720 })) p.push(`clamp → ${short(g1.v, 90)} (คาด {true,180,0,720} ไม่มี junk)`);
    const g2 = pure(ss, "posScheduleGate", { pos: { staff: { scheduleGate: { enabled: "yes", earlyMin: 12.5, lateMin: "10", overrideTtlMin: null } } } });
    if (!g2.err && JSON.stringify(g2.v) !== JSON.stringify({ enabled: false, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 })) p.push(`ชนิดผิด → ${short(g2.v, 90)} (คาดค่าปริยาย)`);
    const c0 = pure(ss, "posStaffCommission", {});
    if (c0.err) p.push(c0.err);
    else if (JSON.stringify(c0.v) !== JSON.stringify({ enabled: false, defaultBp: 0, byCategory: {}, byProduct: {}, sellerRoles: ["STAFF", "MANAGER"], skipDealBills: true })) p.push(`posStaffCommission({}) → ${short(c0.v, 110)}`); // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.6 R12 มติ 10): ค่าปริยาย + skipDealBills: true
    const many: Record<string, Any> = {};
    for (let i = 0; i < 600; i++) many[`px${i}`] = { bp: 100 };
    const c1 = pure(ss, "posStaffCommission", { pos: { staffCommission: { enabled: true, defaultBp: 9000, byCategory: { cneg: { bp: -1 } }, byProduct: { pBig: { bp: 7000 }, pFix: { fixedSatang: 200_000 }, pBad: { bp: "x" } }, sellerRoles: ["OWNER", "X", "STAFF"], junk: true } } });
    const c2 = pure(ss, "posStaffCommission", { pos: { staffCommission: { enabled: true, byProduct: many } } });
    if (!c2.err) {
      const v2: Any = c2.v;
      const n2 = Object.keys(v2?.byProduct ?? {}).length + Object.keys(v2?.byCategory ?? {}).length;
      if (!isRecord(v2) || n2 > 500 || n2 === 0) p.push(`600 แถว → ${n2} (คาด 1–500)`);
    }
    if (!c1.err && isRecord(c1.v)) {
      const v = c1.v;
      const extraKeys = Object.keys(v).filter((k) => !["enabled", "defaultBp", "byCategory", "byProduct", "sellerRoles", "skipDealBills"].includes(k)); // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.6 R12 มติ 10): + skipDealBills (ปริยาย true) — เดิม 5 คีย์
      if (extraKeys.length) p.push(`คีย์แปลกหลุด ${extraKeys.join(",")}`);
      if (v.defaultBp !== 5000) p.push(`defaultBp 9000 → ${short(v.defaultBp)} (คาด 5000)`);
      if (!Array.isArray(v.sellerRoles) || v.sellerRoles.includes("X") || !v.sellerRoles.includes("STAFF")) p.push(`sellerRoles → ${short(v.sellerRoles)}`);
      const rate = (pid: string | null, cid: string | null) => pure(sh, "resolveStaffCommissionRate", v, { productId: pid, categoryId: cid }).v;
      if (sh) {
        if (Number(rate("pBig", null)?.bp) !== 5000) p.push(`bp 7000 → ${short(rate("pBig", null))} (คาด 5000)`);
        if (Number(rate("pFix", null)?.fixedSatang) !== 100_000) p.push(`fixed 200000 → ${short(rate("pFix", null))} (คาด 100000)`);
        const neg = rate(null, "cneg");
        if (neg && Number(neg.bp) < 0) p.push(`bp −1 → ${short(neg)}`);
      }
    } else if (c1.err) p.push(c1.err);
    else p.push(`posStaffCommission → ${short(c1.v, 60)}`);
    chk("CM6", p.length === 0, "clamp · ค่าปริยาย · คีย์แปลก · ≤500 · บทบาท", P8(p) || "ครบ (gate 3 แบบ · commission 2 แบบ)");
  }
  // CM7 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N4): บรรทัดที่สุทธิ ≤ 0 แบ่งค่าคอมฯ ที่กลับรายการตามจำนวน (อาร์กิวเมนต์ที่ 6 {q, Q} · เพิ่มล้วน)
  {
    const p: string[] = [];
    let prev = 0;
    const got: number[] = [];
    for (const [q, done] of [[1, false], [1, false], [2, true]] as const) {
      const r = pure(sh, "staffCommissionRefundShare", 2000, 0, 0, prev, done, { q, Q: 4 });
      if (r.err) {
        p.push(r.err);
        break;
      }
      got.push(Number(r.v));
      prev += Number(r.v);
    }
    if (!p.length && JSON.stringify(got) !== JSON.stringify([500, 500, 1000])) p.push(`ของแถม 1/1/2 จาก 4 → ${got.join(",")} (คาด 500,500,1000)`);
    const R = rng(3507);
    for (let i = 0; i < 200 && !p.length; i++) {
      const Q = 2 + Math.floor(R() * 8);
      const acc = Math.floor(R() * 20_000);
      const lineNet = -Math.floor(R() * 500);
      let left = Q, prevS = 0, cum = 0;
      while (left > 0 && !p.length) {
        const q = Math.max(1, Math.min(left, 1 + Math.floor(R() * left)));
        cum += q;
        left -= q;
        const done = left === 0;
        const r = pure(sh, "staffCommissionRefundShare", acc, lineNet, 0, prevS, done, { q, Q });
        const want = done ? acc - prevS : Math.min(hu(acc * q, Q), acc - prevS);
        if (r.err || r.v !== want || r.v < 0) {
          p.push(`(acc ${acc} net ${lineNet} q ${q}/${Q} prev ${prevS}${done ? " ครบ" : ""}) → ${short(r.v ?? r.err)} (คาด ${want})`);
          break;
        }
        prevS += r.v as number;
      }
      if (!p.length && prevS !== acc) p.push(`Σ ${prevS} ≠ accrual ${acc}`);
    }
    chk("CM7", NS === "" && p.length === 0, "สุทธิ ≤ 0 แบ่งตามจำนวน · Σ = accrual", NS + (P8(p) || "ครบ (ของแถม 1/1/2 + 200 สุ่ม)"));
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + คณิตบริสุทธิ์)`);
  let crashedS = "";
  try {
    runStatic();
    await runPure();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const TIDS = envMod.PQC_TENANT_IDS as string[];
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const PSC: Any = typeof P.posStaffCommission?.findMany === "function" ? P.posStaffCommission : null;
if (!PSC) skipReasons.push("Prisma client ยังไม่มี delegate posStaffCommission (R7)");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'PosStaffCommission'`)) as Any[];
  for (const r of rows) dbCols.add(String(r.column_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
{
  const miss = LEDGER_COLS.filter((c) => !dbCols.has(c));
  if (miss.length === LEDGER_COLS.length) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosStaffCommission");
  else if (miss.length) skipReasons.push(`ตาราง PosStaffCommission ขาดคอลัมน์ ${miss.join(",")}`);
}

const FP_MODELS = ["posSale", "posShift", "posDevice", "posStaffPin", "appSystem", "membership", "hrEmployee", "hrAttendance", "hrPayAdjustment", "hrWorkSchedule", "hrLeave", "auditLog"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: TIDS } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${sha(JSON.stringify(rows))}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  try {
    out.posStaffCommission = String(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PosStaffCommission" WHERE "tenantId" = ANY($1::text[])`, TIDS)) as Any[])[0]?.n ?? 0);
  } catch {
    out.posStaffCommission = "absent";
  }
  try {
    const t = (await P.$queryRawUnsafe(`SELECT id, name, slug, limits, "updatedAt" FROM "Tenant" WHERE id = ANY($1::text[]) ORDER BY id`, TIDS)) as Any[];
    out.tenant = `${t.length}:${sha(JSON.stringify(t))}`;
  } catch (e) {
    out.tenant = `err:${(e as Error).message.slice(0, 40)}`;
  }
  return out;
}

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.5 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const staffMod = await tryImport("@/lib/modules/pos/staff-pin");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const linkMod = ex(F.link) ? await tryImport("@/lib/modules/pos/hr-link") : null;
const commMod = ex(F.comm) ? await tryImport("@/lib/modules/pos/staff-commission") : null;
const hrFacade = await tryImport("@/lib/modules/hr");
const hrSvc = await tryImport("@/lib/modules/hr/service");
const hrPay = await tryImport("@/lib/modules/hr/payroll");
const hrRules = await tryImport("@/lib/modules/hr/rules");
const svc = await tryImport("@/lib/modules/pos/service");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const catMod = await tryImport("@/lib/modules/pos/catalog");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const refundMath = await tryImport("@/lib/modules/pos/refund-math");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const receiptMod = await tryImport("@/lib/modules/pos/receipt");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const displayShared = await tryImport("@/lib/modules/pos/display-shared");
const sysSvc = await tryImport("@/lib/modules/system/service");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const consMod = await tryImport("@/lib/outbox-consumers");
const route = existsSync(join(ROOT, "src/app/api/v1/pos/[...path]/route.ts")) ? await tryImport("@/app/api/v1/pos/[...path]/route") : null;

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p3.5-${RAND}`;
const T_SLUG = `qc-p35-${RAND}`;
const T2_SLUG = `qc-p35-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `p35-${RAND}`;
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
let T = "";
let T2 = "";

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ── เวลาไทย ──
const BKK = 7 * HOUR;
const todayBkk = new Date(Date.now() + BKK).toISOString().slice(0, 10);
const bkkAt = (hm: string, d = todayBkk) => new Date(`${d}T${hm}:00+07:00`);
const monthOf = (d: Date) => new Date(d.getTime() + BKK).toISOString().slice(0, 7);
const nextMonth = (pk: string) => {
  const [y, m] = pk.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const NOW0 = bkkAt("12:00");
const MONTH = todayBkk.slice(0, 7);
const M1 = nextMonth(MONTH);
const NEXT_MONTH_NOW = new Date(`${M1}-01T03:00:00+07:00`);

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && !PURE_IDS.includes(id) && id !== "P3.5-Z1" && id !== "P3.5-Z2");

async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} · วันนี้ (ไทย) ${todayBkk} · งวด ${MONTH} → ${M1} ──`);
  console.log("   T: สาขา A (POS-A · เครื่อง 1–4) · สาขา B · HR (พนักงาน C1–C5 + MGR ผูกผู้ใช้ · C6 ไม่มี) · T2: POS ไม่มี HR");
  let fx = "";
  const fxNote = (s: string) => {
    if (!fx) fx = s;
    console.log(`  ⚠️  fixture: ${s}`);
  };
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  let HRS = "";
  type UserFx = { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; tenant: string };
  const US: Record<string, UserFx> = {};
  try {
    const t = await P.tenant.create({ data: { name: `QC P3.5 HR/ค่าคอมฯ ${RAND}`, slug: T_SLUG, limits: { posDevices: 10 } } });
    T = t.id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    S.A = (await sysSvc.createSystem(T, "POS", "POS-A")).id;
    S.B = (await sysSvc.createSystem(T, "POS", "POS-B")).id;
    await sysSvc.linkUnit(T, S.A, U.A);
    await sysSvc.linkUnit(T, S.B, U.B);
    HRS = (await sysSvc.createSystem(T, "HR", `ทีมงาน ${TAG}`)).id;
    const t2 = await P.tenant.create({ data: { name: `QC P3.5 T2 ${RAND}`, slug: T2_SLUG, limits: { posDevices: 10 } } });
    T2 = t2.id;
    U.A2 = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขา T2`, slug: `${T2_SLUG}-a` } })).id;
    S.A2 = (await sysSvc.createSystem(T2, "POS", "POS-T2")).id;
    await sysSvc.linkUnit(T2, S.A2, U.A2);
  } catch (e) {
    fxNote(`ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`);
  }
  const SELL = { "pos.sale.create": true, "pos.sale.read": true, "pos.sale.void": true, "pos.sale.refund": true, "pos.shift.operate": true };
  if (!fx) {
    try {
      const spec: [string, string, string, string[], Record<string, boolean>][] = [
        ["OWNER", T, "OWNER", ["*"], {}],
        ["MGR", T, "MANAGER", [U.A!, U.B!], {}],
        ["C1", T, "STAFF", [U.A!], SELL],
        ["C2", T, "STAFF", [U.A!], { ...SELL, "pos.report.view": true }],
        ["C3", T, "STAFF", [U.A!], SELL],
        ["C4", T, "STAFF", [U.A!], SELL],
        ["C5", T, "STAFF", [U.A!], SELL],
        ["C6", T, "STAFF", [U.A!], SELL],
        ["PAYV", T, "STAFF", [U.A!], { "pos.report.view": true, "hr.payroll.read": true, "pos.sale.read": true, "pos.shift.operate": true }],
        ["OWNER2", T2, "OWNER", ["*"], {}],
        ["C7", T2, "STAFF", [U.A2!], SELL],
      ];
      for (const [k, tid, role, unitAccess, perms] of spec) {
        const email = `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`;
        const u = await P.user.create({ data: { email, name: `${k} พนักงานคิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess, perms, tenant: tid };
      }
    } catch (e) {
      fxNote(`ผู้ใช้:${(e as Error).message.slice(0, 140)}`);
    }
  }
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const DEV = [1, 2, 3, 4].map((i) => `qc35${RAND}d${i}`);
  const DEVT2 = `qc35${RAND}t2`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.A, unitId: U.A, ...(dev ? { deviceId: dev } : {}) });
  const ctxT2 = (dev?: string): Any => ({ tenantId: T2, systemId: S.A2, unitId: U.A2, ...(dev ? { deviceId: dev } : {}) });
  const hrCtx = () => ({ tenantId: T, systemId: HRS });
  // ── เครื่อง + PIN ──
  const PIN: Record<string, string> = { OWNER: "3715", MGR: "2604", C1: "4826", C2: "5937", C3: "6048", C4: "7159", C5: "8260", C6: "9371", C7: "4826", OWNER2: "3715" };
  if (!fx) {
    for (const d of DEV) {
      const rg = await call(devMod, "registerDevice", ctxA(), A("OWNER"), { name: `เครื่อง QC ${d.slice(-2)}`, deviceCode: d });
      if (rg?.ok !== true) fxNote(`registerDevice ${d}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    }
    const rg2 = await call(devMod, "registerDevice", ctxT2(), A("OWNER2"), { name: "เครื่อง QC T2", deviceCode: DEVT2 });
    if (rg2?.ok !== true) fxNote(`registerDevice T2: ${codeOf(rg2)}`);
    for (const k of ["OWNER", "MGR", "C1", "C2", "C3", "C4", "C5", "C6"]) {
      const r = await call(staffMod, "setStaffPin", ctxA(), A("OWNER"), { userId: uid(k), pin: PIN[k] });
      if (r?.ok !== true) fxNote(`setStaffPin ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    }
    for (const k of ["OWNER2", "C7"]) {
      const r = await call(staffMod, "setStaffPin", ctxT2(), A("OWNER2"), { userId: uid(k), pin: PIN[k] });
      if (r?.ok !== true) fxNote(`setStaffPin ${k}: ${codeOf(r)}`);
    }
  }
  // ── HR: พนักงาน · ผูกผู้ใช้ · ตาราง · ใบลา · โปรไฟล์เงินเดือน (ฟังก์ชันของ HR) ──
  const EMP: Record<string, string> = {};
  const week = (o: { dayOff?: boolean }) => Array.from({ length: 7 }, (_, wd) => ({ weekday: wd, dayOff: !!o.dayOff, startMin: 540, endMin: 1020, graceMin: 15 }));
  if (!fx) {
    try {
      for (const k of ["C1", "C2", "C3", "C4", "C5", "MGR"]) {
        const e = await hrSvc.createEmployee(hrCtx(), { name: `พนักงาน ${k} ${TAG}` });
        EMP[k] = e.id;
        // ฐาน 72669941 ไม่มีตัวเขียน linkedUserId ของ HR — ทางเดียวกับ qc-crm-c3.3 :472 (CONTROLLER-DECISION ในโน้ต)
        await P.hrEmployee.updateMany({ where: { id: e.id, tenantId: T }, data: { linkedUserId: uid(k) } });
      }
      for (const k of ["C1", "C4", "C5", "MGR"]) {
        const r = await hrSvc.setSchedule(hrCtx(), EMP[k], week({}));
        if (!r?.ok) fxNote(`setSchedule ${k}: ${short(r)}`);
      }
      const r3 = await hrSvc.setSchedule(hrCtx(), EMP.C3, week({ dayOff: true }));
      if (!r3?.ok) fxNote(`setSchedule C3: ${short(r3)}`);
      const r5 = await hrSvc.setEmployeeActive(hrCtx(), EMP.C5, false);
      if (!r5?.ok) fxNote(`setEmployeeActive C5: ${short(r5)}`);
      const l4 = await hrSvc.requestLeave(hrCtx(), { employeeId: EMP.C4, type: "PERSONAL", fromDate: todayBkk, toDate: todayBkk, reason: "ธุระส่วนตัว (QC)" });
      await hrSvc.decideLeave(hrCtx(), l4.id, "APPROVED");
      await hrSvc.requestLeave(hrCtx(), { employeeId: EMP.C2, type: "SICK", fromDate: todayBkk, toDate: todayBkk, reason: "ไม่สบาย (QC)" });
      for (const k of ["C1", "C2"]) await hrPay.setSalaryProfile(hrCtx(), { employeeId: EMP[k], baseSalarySatang: 3_000_000 });
    } catch (e) {
      fxNote(`HR:${(e as Error).message.slice(0, 160)}`);
    }
  }
  // ── แคตตาล็อก ──
  const PR: Record<string, string> = {};
  let CAT = "";
  if (!fx) {
    try {
      const cctx = { tenantId: T, systemId: S.A, actorUserId: uid("OWNER") };
      CAT = (await catMod.createCategory(cctx, { name: `หมวดค่าคอม ${RAND}` })).id;
      PR.P1 = (await catMod.createProduct(cctx, { name: `สินค้า P1 ${RAND}`, basePriceSatang: 10_000 })).id;
      PR.P2 = (await catMod.createProduct(cctx, { name: `สินค้า P2 ${RAND}`, basePriceSatang: 5_000, categoryId: CAT })).id;
      PR.P3 = (await catMod.createProduct(cctx, { name: `สินค้า P3 ${RAND}`, basePriceSatang: 2_000, categoryId: CAT })).id;
    } catch (e) {
      fxNote(`แคตตาล็อก:${(e as Error).message.slice(0, 140)}`);
    }
  }
  // กะของเจ้าของที่เครื่อง 1 (การคืนเงิน)
  if (!fx) {
    const o1 = await call(shiftMod, "openShift", ctxA(DEV[0]), A("OWNER"), { deviceId: DEV[0], deviceLabel: "เครื่อง QC 1", floatSatang: 0 });
    if (o1?.ok !== true) fxNote(`เปิดกะเครื่อง 1: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NL = NEED([linkMod, "pos/hr-link.ts"]);
  const NC = NEED([commMod, "pos/staff-commission.ts"], [PSC || dbCols.has("id"), "PosStaffCommission"]);

  // ── ค่าตั้ง (fixture เขียน JSON ของระบบ POS ตรง — แบบ qc-pos-p1.15 :639) ──
  const readSettings = async (sys: string): Promise<Any> => ((await P.appSystem.findUnique({ where: { id: sys }, select: { settings: true } }))?.settings ?? {}) as Any;
  const setPos = async (sys: string, fn: (pos: Record<string, Any>) => Record<string, Any>) => {
    const cur = await readSettings(sys);
    const pos = fn(isRecord(cur.pos) ? { ...cur.pos } : {});
    await P.appSystem.update({ where: { id: sys }, data: { settings: { ...cur, pos } } });
  };
  const setGate = (sys: string, gate: Any) => setPos(sys, (pos) => ({ ...pos, staff: { ...(isRecord(pos.staff) ? pos.staff : {}), scheduleGate: gate } }));
  const setComm = (cfg: Any) => setPos(S.A!, (pos) => ({ ...pos, staffCommission: cfg }));
  const GATE_ON = { enabled: true, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 };

  // ── ตัวอ่าน ──
  const audits = async (action: string): Promise<Any[]> => (T ? ((await P.auditLog.findMany({ where: { tenantId: T, action }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const pinRow = async (k: string): Promise<Any> => (T ? await P.posStaffPin.findFirst({ where: { tenantId: T, unitId: U.A, userId: uid(k) } }).catch(() => null) : null);
  const ledger = async (where: { saleId?: string; userId?: string } = {}): Promise<Any[]> => {
    if (!T) return [];
    try {
      if (PSC) return (await PSC.findMany({ where: { tenantId: T, ...where }, orderBy: [{ createdAt: "asc" }, { sourceKey: "asc" }] })) as Any[];
      const conds = [`"tenantId" = $1`];
      const args: unknown[] = [T];
      if (where.saleId) conds.push(`"saleId" = $${args.push(where.saleId)}`);
      if (where.userId) conds.push(`"userId" = $${args.push(where.userId)}`);
      return (await P.$queryRawUnsafe(`SELECT * FROM "PosStaffCommission" WHERE ${conds.join(" AND ")} ORDER BY "createdAt", "sourceKey"`, ...args)) as Any[];
    } catch {
      return [];
    }
  };
  const net = (rows: Any[]) => sum(rows.map((r) => Number(r.amountSatang ?? 0)));
  const rowsFp = (rows: Any[]) => sha(JSON.stringify([...rows].sort((a, b) => String(a.sourceKey).localeCompare(String(b.sourceKey))).map((r) => [r.id, r.sourceKey, r.kind, r.amountSatang, r.baseSatang, r.rateBp, r.fixedSatang, r.status, r.periodKey, r.hrPayAdjustmentId ?? null])));
  const adjustments = async (): Promise<Any[]> => (T ? ((await P.hrPayAdjustment.findMany({ where: { tenantId: T }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  const attendance = async (k: string): Promise<Any[]> => (EMP[k] ? ((await P.hrAttendance.findMany({ where: { tenantId: T, employeeId: EMP[k] }, orderBy: { at: "asc" } }).catch(() => [])) as Any[]) : []);
  const eventsOf = async (type: string, pred: (pl: Any) => boolean): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && pred(e.payload));
  const replay = async (type: string, evs: Any[], times = 2): Promise<string[]> => {
    const errs: string[] = [];
    const h = consMod?.consumers?.[type];
    if (typeof h !== "function") return [`ไม่มี consumers[${type}]`];
    if (!evs.length) return [`ไม่มี event ${type}`];
    for (let i = 0; i < times; i++)
      for (const ev of evs)
        try {
          await h(ev);
        } catch (e) {
          errs.push(`เล่น ${type} ซ้ำ throw ${(e as Error).message.slice(0, 50)}`);
        }
    return errs;
  };

  // ════════ SG ด่านตารางงาน ════════
  const verify = (k: string, at: Date | null, extra: Any = {}, dev = DEV[0]!): Promise<Any> =>
    call(staffMod, "verifyStaffPin", ctxA(dev), { unitId: U.A, deviceId: dev, pin: PIN[k], userId: uid(k), ...extra }, undefined, at ? { now: at } : undefined);
  const offSched = (r: Any, reason: string) => r?.ok === false && r.code === "OFF_SCHEDULE" && r.reason === reason && !r.threw && !r.staffToken;
  const expNear = (r: Any, want: number, tol = 1500) => r?.ok === true && Math.abs(ms(r.expiresAt) - want) <= tol;
  const ttl12 = (r: Any, from: number) => expNear(r, from + 12 * HOUR, 5 * MIN);
  const ssMod = await tryImport("@/lib/modules/pos/settings-shared");
  const gatePure = (settings: Any) => pure(ssMod, "posScheduleGate", settings);
  // SG1 ด่านปิด (ค่าปริยาย)
  {
    const p: string[] = [];
    const g = gatePure(await readSettings(S.A!));
    if (g.err) p.push(g.err);
    else if (JSON.stringify(g.v) !== JSON.stringify({ enabled: false, earlyMin: 30, lateMin: 30, overrideTtlMin: 240 })) p.push(`ค่าปริยาย ${short(g.v, 90)}`);
    const t0 = Date.now();
    for (const k of ["C1", "C3", "C4", "C5"]) {
      const r = await verify(k, null);
      if (!ttl12(r, t0)) p.push(`${k} → ${codeOf(r)} exp ${short(r?.expiresAt)} (คาด ✓ 12 ชม.)`);
    }
    const anon = await call(staffMod, "verifyStaffPin", ctxA(DEV[0]), { unitId: U.A, deviceId: DEV[0], pin: PIN.C3 });
    if (anon?.ok !== true || anon.userId !== uid("C3")) p.push(`ไม่ระบุคน C3 → ${codeOf(anon)}`);
    const sAll = [...(await audits(AUDIT.denied)), ...(await audits(AUDIT.override))];
    if (sAll.length) p.push(`มี audit schedule_* ${sAll.length} แถวทั้งที่ด่านปิด`);
    chk("SG1", !fx && p.length === 0, "ค่าปริยายปิด · ทุกคนผ่าน 12 ชม.", FX(P8(p) || "ครบ"));
  }
  if (S.A) await setGate(S.A, GATE_ON);
  if (S.A2) await setGate(S.A2, GATE_ON);
  const deniedBy: string[] = [];
  // SG2
  {
    const p: string[] = [];
    const a = await verify("C1", NOW0);
    if (!expNear(a, bkkAt("17:30").getTime())) p.push(`12:00 → ${codeOf(a)} exp ${short(a?.expiresAt)} (คาด ✓ 17:30)`);
    const b = await verify("C1", bkkAt("08:00"));
    if (!offSched(b, "OUTSIDE_HOURS")) p.push(`08:00 → ${codeOf(b)} reason ${short(b?.reason)} (คาด OFF_SCHEDULE OUTSIDE_HOURS)`);
    else {
      deniedBy.push("C1");
      if (Number(b.window?.startMin) !== 540 || Number(b.window?.endMin) !== 1020) p.push(`window ${short(b.window)} (คาด 540/1020)`);
    }
    const c = await verify("C1", bkkAt("08:30"));
    if (c?.ok !== true) p.push(`08:30 → ${codeOf(c)} (คาด ✓ ขอบ early 30)`);
    const d = await verify("C1", bkkAt("17:31"));
    if (!offSched(d, "OUTSIDE_HOURS")) p.push(`17:31 → ${codeOf(d)} ${short(d?.reason)}`);
    else deniedBy.push("C1");
    chk("SG2", !fx && p.length === 0, "ในเวลา ✓ 17:30 · นอกเวลา OUTSIDE_HOURS · ขอบ 08:30", FX(P8(p) || "ครบ"));
  }
  // SG3
  {
    const p: string[] = [];
    const r = await verify("C2", NOW0);
    if (!expNear(r, NOW0.getTime() + 12 * HOUR)) p.push(`C2 → ${codeOf(r)} ${short(r?.reason ?? r?.expiresAt)} (คาด ✓ now+12 ชม.)`);
    chk("SG3", !fx && p.length === 0, "ไม่มีตาราง + ใบลา PENDING ⇒ ✓", FX(P8(p) || "ครบ"));
  }
  // SG4–SG5
  for (const [id, k, reason] of [["SG4", "C3", "DAY_OFF"], ["SG5", "C4", "LEAVE"]] as const) {
    const r = await verify(k, NOW0);
    if (offSched(r, reason)) deniedBy.push(k);
    chk(id, !fx && offSched(r, reason), `${k} ⇒ OFF_SCHEDULE ${reason}`, FX(`${codeOf(r)} reason ${short(r?.reason)}${r?.staffToken ? " (มีโทเคน!)" : ""}`));
  }
  // SG6
  {
    const p: string[] = [];
    const r5 = await verify("C5", NOW0);
    if (!offSched(r5, "INACTIVE")) p.push(`C5 → ${codeOf(r5)} ${short(r5?.reason)} (คาด INACTIVE)`);
    else deniedBy.push("C5");
    const r6 = await verify("C6", NOW0);
    if (!expNear(r6, NOW0.getTime() + 12 * HOUR)) p.push(`C6 → ${codeOf(r6)} ${short(r6?.reason ?? r6?.expiresAt)} (คาด ✓ fallback)`);
    chk("SG6", !fx && p.length === 0, "C5 INACTIVE · C6 fallback ✓", FX(P8(p) || "ครบ"));
  }
  // SG7
  {
    const p: string[] = [];
    for (const k of ["MGR", "OWNER"]) {
      const r = await verify(k, bkkAt("03:00"));
      if (r?.ok !== true) p.push(`${k} 03:00 → ${codeOf(r)} ${short(r?.reason)}`);
    }
    // ตัวควบคุม: เวลาเดียวกัน C1 ต้องถูกปฏิเสธ (ด่านทำงานจริง ไม่ใช่ผ่านเพราะไม่มีด่าน)
    const c = await verify("C1", bkkAt("03:00"));
    if (!offSched(c, "OUTSIDE_HOURS")) p.push(`(ตัวควบคุม) C1 03:00 → ${codeOf(c)} (คาด OUTSIDE_HOURS)`);
    else deniedBy.push("C1");
    chk("SG7", !fx && p.length === 0, "MANAGER/OWNER ยกเว้น · C1 เวลาเดียวกันถูกปฏิเสธ", FX(P8(p) || "ครบ"));
  }
  // SG8
  {
    const p: string[] = [];
    const ov0 = (await audits(AUDIT.override)).length;
    const at = bkkAt("08:00");
    const r = await verify("C1", at, { managerUserId: uid("MGR"), managerPin: PIN.MGR });
    if (!expNear(r, at.getTime() + 240 * MIN)) p.push(`override → ${codeOf(r)} exp ${short(r?.expiresAt)} (คาด ✓ 08:00+240 นาที)`);
    else if (r.userId !== uid("C1")) p.push(`userId ${short(r.userId)} (คาด C1)`);
    const ov = await audits(AUDIT.override);
    const row = ov[ov.length - 1];
    if (ov.length !== ov0 + 1) p.push(`audit override ${ov0} → ${ov.length} (คาด +1)`);
    else {
      const af = row?.after ?? {};
      if (af.userId !== uid("C1") || af.byUserId !== uid("MGR") || af.reason !== "OUTSIDE_HOURS" || af.deviceId !== DEV[0]) p.push(`override.after ${short(af, 120)}`);
    }
    const den = await audits(AUDIT.denied);
    const want = deniedBy.length;
    if (den.length !== want) p.push(`audit denied ${den.length} (คาด ${want}: ${deniedBy.join(",")})`);
    else {
      const byUser = den.map((a) => a.after?.userId);
      for (const k of new Set(deniedBy)) if (byUser.filter((x) => x === uid(k)).length !== deniedBy.filter((x) => x === k).length) p.push(`denied ของ ${k} ไม่ตรง`);
      if (den.some((a) => !a.after?.reason || a.after?.deviceId !== DEV[0])) p.push("denied ไม่มี reason/deviceId");
    }
    const leak = [...ov, ...den].filter((a) => Object.values(PIN).some((pin) => short({ b: a.before, a: a.after }, 10_000).includes(`"${pin}"`)));
    if (leak.length) p.push(`audit มี PIN ${leak.length} แถว`);
    const c2 = await verify("C1", at, { managerUserId: uid("C2"), managerPin: PIN.C2 });
    if (!(c2?.ok === false && c2.code === "PERMISSION_DENIED" && !c2.staffToken)) p.push(`C2 เป็นผู้จัดการ → ${codeOf(c2)} (คาด PERMISSION_DENIED)`);
    if ((await audits(AUDIT.override)).length !== ov.length) p.push("มี audit override จากคำขอของ C2");
    chk("SG8", !fx && p.length === 0, "override ✓ 240 นาที · audit override/denied ครบ · C2 ✗", FX(P8(p) || "ครบ"));
  }
  // SG9
  {
    const p: string[] = [];
    const m0 = Number((await pinRow("MGR"))?.failedCount ?? -1);
    const c0 = Number((await pinRow("C1"))?.failedCount ?? -1);
    const ov0 = (await audits(AUDIT.override)).length;
    const r = await verify("C1", bkkAt("08:00"), { managerUserId: uid("MGR"), managerPin: "0909" });
    if (!(r?.ok === false && r.code === "PIN_INVALID" && !r.staffToken)) p.push(`PIN ผู้จัดการผิด → ${codeOf(r)} (คาด PIN_INVALID)`);
    const m1 = Number((await pinRow("MGR"))?.failedCount ?? -1);
    const c1 = Number((await pinRow("C1"))?.failedCount ?? -1);
    if (m1 !== m0 + 1) p.push(`failedCount MGR ${m0} → ${m1} (คาด +1)`);
    if (c1 !== c0) p.push(`failedCount C1 ${c0} → ${c1} (คาดเท่าเดิม)`);
    if ((await audits(AUDIT.override)).length !== ov0) p.push("มี audit override เพิ่ม");
    chk("SG9", !fx && p.length === 0, "PIN_INVALID · MGR +1 · C1 เท่าเดิม", FX(P8(p) || "ครบ"));
    await call(staffMod, "unlockStaffPin", ctxA(), A("OWNER"), { userId: uid("MGR") });
  }
  // SG10
  {
    const p: string[] = [];
    const anon = await call(staffMod, "verifyStaffPin", ctxA(DEV[0]), { unitId: U.A, deviceId: DEV[0], pin: PIN.C3 }, undefined, { now: NOW0 });
    const wrong = await call(staffMod, "verifyStaffPin", ctxA(DEV[0]), { unitId: U.A, deviceId: DEV[0], pin: "9182" }, undefined, { now: NOW0 });
    if (!(anon?.ok === false && anon.code === "PIN_INVALID")) p.push(`ไม่ระบุคน C3 → ${codeOf(anon)} (คาด PIN_INVALID)`);
    else {
      if ("reason" in anon || "window" in anon) p.push(`รั่วเหตุผล ${short({ reason: anon.reason, window: anon.window })}`);
      if (wrong?.code === "PIN_INVALID" && anon.message !== wrong.message) p.push(`ข้อความต่างจาก PIN ผิดจริง (${short(anon.message, 40)} ≠ ${short(wrong.message, 40)})`);
    }
    const t2 = await call(staffMod, "verifyStaffPin", ctxT2(DEVT2), { unitId: U.A2, deviceId: DEVT2, pin: PIN.C7, userId: uid("C7") }, undefined, { now: bkkAt("03:00") });
    if (t2?.ok !== true) p.push(`T2 (ไม่มี HR) 03:00 → ${codeOf(t2)} ${short(t2?.reason)}`);
    const fn = regShared?.refusalMessageKey;
    let th: Any = null, en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
      en = JSON.parse(rd(F.msgEn) || "null");
    } catch {
      p.push("อ่าน messages ไม่ได้");
    }
    const msgAt = (json: Any, key: string): string => {
      const get = (o: Any, path: string[]) => path.reduce((a: Any, k) => (isRecord(a) ? a[k] : undefined), o);
      for (const base of [["register"], []]) {
        const v = get(json, [...base, ...key.split(".")]);
        if (typeof v === "string" && v.trim()) return v;
      }
      return "";
    };
    if (typeof fn !== "function") p.push("ไม่มี refusalMessageKey");
    else {
      const keys = NEW_CODES.map((c) => [c, String(fn(c))] as const);
      for (const [c, k] of keys) {
        if (k === "errors.unknown") p.push(`${c} → errors.unknown`);
        else {
          if (!THAI.test(msgAt(th, k))) p.push(`${c} (${k}) ไม่มีข้อความไทย`);
          if (!msgAt(en, k)) p.push(`${c} (${k}) ไม่มีข้อความอังกฤษ`);
        }
      }
      if (new Set(keys.map(([, k]) => k)).size !== keys.length) p.push("คีย์ข้อความซ้ำกัน");
    }
    chk("SG10", !fx && p.length === 0, "ไม่ระบุคน = PIN_INVALID ไม่รั่ว · T2 ✓ · ข้อความ 3 รหัส", FX(P8(p) || "ครบ"));
  }
  // SG11 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N5): ปฏิเสธนอกตารางแบบไม่ระบุคน ต้องกินโควตาด่านกันเดาเหมือน PIN ผิด
  {
    const p: string[] = [];
    const dev = DEV[2]!;
    const N = typeof regShared?.STAFF_PIN_DEVICE_THROTTLE_AFTER === "number" ? (regShared.STAFF_PIN_DEVICE_THROTTLE_AFTER as number) : 10;
    for (let i = 0; i < N; i++) {
      const r = await call(staffMod, "verifyStaffPin", ctxA(dev), { unitId: U.A, deviceId: dev, pin: PIN.C3 }, undefined, { now: NOW0 });
      if (!(r?.ok === false && r.code === "PIN_INVALID" && !r.staffToken)) {
        p.push(`ครั้งที่ ${i + 1} → ${codeOf(r)} (คาด PIN_INVALID)`);
        break;
      }
    }
    const failedRows = ((await P.auditLog.findMany({ where: { tenantId: T, action: "pos.staff.pin_failed" } }).catch(() => [])) as Any[]).filter((a) => a.after?.deviceId === dev);
    if (failedRows.length !== N) p.push(`แถว pin_failed ของเครื่อง ${failedRows.length} (คาด ${N})`);
    const next = await call(staffMod, "verifyStaffPin", ctxA(dev), { unitId: U.A, deviceId: dev, pin: PIN.C1 }, undefined, { now: NOW0 });
    if (!(next?.ok === false && next.code === "PIN_THROTTLED")) p.push(`ครั้งที่ ${N + 1} (PIN C1 ถูก) → ${codeOf(next)} (คาด PIN_THROTTLED)`);
    chk("SG11", !fx && p.length === 0, "นอกตารางแบบไม่ระบุคน = กินโควตาเหมือน PIN ผิด", FX(P8(p) || `ครบ (N = ${N})`));
  }
  // SG12 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N6): แถวเมื่อวาน (นาที + 1440) / พรุ่งนี้ (นาที − 1440) · C2 ถูกตั้งตารางชั่วคราวแล้วคืนเป็น "ไม่มีแถว" (LS1 ใช้)
  {
    const p: string[] = [];
    const wd = new Date(NOW0.getTime() + BKK).getUTCDay();
    const TOMORROW = new Date(Date.parse(`${todayBkk}T00:00:00Z`) + 24 * HOUR).toISOString().slice(0, 10);
    const set = EMP.C2 ? await hrSvc.setSchedule(hrCtx(), EMP.C2, [
      { weekday: wd, dayOff: false, startMin: 960, endMin: 1425, graceMin: 0 },
      { weekday: (wd + 1) % 7, dayOff: true, startMin: 540, endMin: 1020, graceMin: 0 },
    ]) : null;
    if (!set?.ok) p.push(`(fixture) setSchedule C2 ${short(set)}`);
    else {
      const cap = bkkAt("00:15", TOMORROW).getTime();
      const a = await verify("C2", bkkAt("00:05", TOMORROW));
      if (!expNear(a, cap)) p.push(`พรุ่งนี้ 00:05 → ${codeOf(a)} ${short(a?.reason ?? a?.expiresAt)} (คาด ✓ หมด 00:15)`);
      const b = await verify("C2", bkkAt("23:00"));
      if (!expNear(b, cap)) p.push(`วันนี้ 23:00 → ${codeOf(b)} ${short(b?.reason ?? b?.expiresAt)} (คาด ✓ หมด 00:15)`);
      const c = await verify("C2", bkkAt("01:00", TOMORROW));
      if (!offSched(c, "DAY_OFF")) p.push(`(ตัวควบคุม) พรุ่งนี้ 01:00 → ${codeOf(c)} ${short(c?.reason)} (คาด DAY_OFF)`);
    }
    if (EMP.C2) await hrSvc.setSchedule(hrCtx(), EMP.C2, []);
    chk("SG12", !fx && p.length === 0, "ข้ามเที่ยงคืนด้วยแถวเมื่อวาน/พรุ่งนี้", FX(P8(p) || "ครบ"));
  }
  // SG13 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 F3): HR อ่านไม่ได้ต้องไม่ล็อกหน้าขายของเจ้าของ/ผู้จัดการ (opts.hrItem = ตะเข็บทดสอบฝั่งเซิร์ฟเวอร์)
  {
    const p: string[] = [];
    let calls = 0;
    const boom = async () => {
      calls++;
      throw new Error("QC P3.5 SG13: HR อ่านไม่ได้ (ฉีด)");
    };
    for (const k of ["OWNER", "MGR"]) {
      const at = bkkAt("03:00");
      const r = await call(staffMod, "verifyStaffPin", ctxA(DEV[0]), { unitId: U.A, deviceId: DEV[0], pin: PIN[k], userId: uid(k) }, undefined, { now: at, hrItem: boom });
      if (!ttl12(r, at.getTime())) p.push(`${k} → ${codeOf(r)} ${short(r?.expiresAt)} (คาด ✓ 12 ชม.)`);
    }
    if (calls !== 0) p.push(`ตัวฉีดถูกเรียก ${calls} ครั้งในทางของ OWNER/MANAGER (คาด 0)`);
    const s = await call(staffMod, "verifyStaffPin", ctxA(DEV[0]), { unitId: U.A, deviceId: DEV[0], pin: PIN.C1, userId: uid("C1") }, undefined, { now: NOW0, hrItem: boom });
    if (!(s?.ok === false && !s.staffToken)) p.push(`C1 (HR อ่านไม่ได้) → ${codeOf(s)}${s?.staffToken ? " (มีโทเคน!)" : ""} (คาด ไม่ได้โทเคน)`);
    if (calls === 0) p.push("ตัวฉีดไม่ถูกเรียกในทางของ STAFF");
    chk("SG13", !fx && p.length === 0, "OWNER/MANAGER ก่อนอ่าน HR · STAFF ล้มแบบปิด", FX(P8(p) || "ครบ"));
  }

  // ════════ LS รายชื่อจอล็อก ════════
  {
    const p: string[] = [];
    const q: string[] = [];
    const r = await call(staffMod, "listStaffForDevice", ctxA(DEV[0]), { unitId: U.A }, undefined, { now: NOW0 });
    const items: Any[] = r?.ok === true && Array.isArray(r.items) ? r.items : [];
    if (r?.ok !== true) p.push(`listStaffForDevice → ${codeOf(r)}`);
    const it = (k: string) => items.find((x) => x.userId === uid(k));
    const hrOf = (k: string) => it(k)?.hr;
    const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (items.length) {
      if (!eq(hrOf("C1"), { schedule: { startMin: 540, endMin: 1020 }, onLeave: false, inSchedule: true })) p.push(`C1.hr ${short(hrOf("C1"), 90)}`);
      if (!eq(hrOf("C2"), { schedule: null, onLeave: false, inSchedule: null })) p.push(`C2.hr ${short(hrOf("C2"), 90)}`);
      for (const k of ["C3", "C5"]) if (hrOf(k)?.inSchedule !== false) p.push(`${k}.hr.inSchedule ${short(hrOf(k)?.inSchedule)} (คาด false)`);
      if (hrOf("C4")?.onLeave !== true || hrOf("C4")?.inSchedule !== false) p.push(`C4.hr ${short(hrOf("C4"), 90)}`);
      const h6 = hrOf("C6");
      if (!(h6 === undefined || h6 === null || eq(h6, { schedule: null, onLeave: false, inSchedule: null }))) p.push(`C6.hr ${short(h6, 80)}`);
      // LS2
      for (const x of items) {
        const h = x.hr;
        if (h !== undefined && h !== null) {
          const extra = Object.keys(h).filter((k) => !["schedule", "onLeave", "inSchedule"].includes(k));
          if (extra.length) q.push(`${x.userId === uid("C4") ? "C4" : "item"}.hr มีคีย์ ${extra.join(",")}`);
          if (isRecord(h.schedule) && Object.keys(h.schedule).some((k) => !["startMin", "endMin"].includes(k))) q.push(`schedule มีคีย์ ${Object.keys(h.schedule).join(",")}`);
        }
      }
      const bad = [...new Set(deepKeys(items).filter((k) => /ommission|salary|satang|reason|leaveType/i.test(k)))];
      if (bad.length) q.push(`คีย์ต้องห้าม ${bad.join(",")}`);
    } else q.push("ไม่มีรายการให้ตรวจ");
    const fac = await call(hrFacade, "onShiftToday", { tenantId: T, at: NOW0, userIds: [uid("C1"), uid("C2"), uid("C6")] });
    if (fac?.hrLinked !== true || !Array.isArray(fac?.items)) p.push(`onShiftToday → ${short(fac, 90)}`);
    else {
      const f1 = fac.items.find((x: Any) => x.userId === uid("C1"));
      if (!f1 || f1.employeeId !== EMP.C1 || f1.active !== true || f1.onLeave !== false || !eq(f1.schedule, { startMin: 540, endMin: 1020, graceMin: 15, dayOff: false })) p.push(`onShiftToday C1 ${short(f1, 120)}`);
      if (fac.items.some((x: Any) => x.userId === uid("C6"))) p.push("onShiftToday มี C6 (ไม่มีพนักงาน)");
    }
    const fac2 = await call(hrFacade, "onShiftToday", { tenantId: T2, at: NOW0, userIds: [uid("C7")] });
    if (!(fac2?.hrLinked === false && Array.isArray(fac2?.items) && fac2.items.length === 0)) p.push(`onShiftToday T2 → ${short(fac2, 80)}`);
    const r2 = await call(staffMod, "listStaffForDevice", ctxT2(DEVT2), { unitId: U.A2 }, undefined, { now: NOW0 });
    const items2: Any[] = r2?.ok === true && Array.isArray(r2.items) ? r2.items : [];
    if (!items2.length) q.push(`T2 listStaffForDevice → ${codeOf(r2)} ${items2.length} รายการ`);
    if (items2.some((x) => "hr" in x)) q.push("T2 (ไม่มี HR) มีคีย์ hr");
    chk("LS1", !fx && p.length === 0, "hr ต่อคนตรงผัง · facade onShiftToday", FX(P8(p) || `ครบ (${items.length} รายการ)`));
    chk("LS2", !fx && q.length === 0 && items.some((x) => x.hr), "ไม่มีชนิด/เหตุผลการลา/เงิน · T2 ไม่มี hr", FX(P8(q) || (items.some((x) => x.hr) ? "ครบ" : "ยังไม่มีคีย์ hr ในรายการ (R5)")));
  }

  // ════════ CL สมุดค่าคอมฯ ════════
  if (S.A) await setGate(S.A, { ...GATE_ON, enabled: false });
  const COMM = { enabled: true, defaultBp: 300, byCategory: { [CAT || "none"]: { bp: 500 } }, byProduct: { [PR.P1 || "none1"]: { bp: 1000 }, [PR.P3 || "none3"]: { fixedSatang: 250 } }, sellerRoles: ["STAFF", "MANAGER"] };
  if (S.A) await setComm(COMM);
  let keyN = 0;
  type SaleOut = { id: string; r: Any; lines: Record<string, Any>; grand: number };
  const sale = async (o: { seller?: string | null; lines: [string, number, number, string | null][]; bill?: number; source?: string }): Promise<SaleOut> => {
    const lines = o.lines.map(([name, qty, unit, productId]) => ({ name: `${name} ${RAND}`, qty, unitPriceSatang: unit, ...(productId ? { productId } : {}) }));
    const grand = sum(o.lines.map(([, q, u]) => q * u)) - (o.bill ?? 0);
    const input: Any = {
      tenantId: T, unitId: U.A, systemId: S.A, idempotencyKey: `${KEY_PREFIX}-s${++keyN}`, lines,
      payMethods: [{ type: "CASH", amountSatang: grand }],
      ...(o.bill ? { billDiscountSatang: o.bill } : {}),
      ...(o.seller ? { soldByUserId: o.seller } : {}),
      ...(o.source ? { sourceModule: o.source } : {}),
    };
    const r = fx ? { ok: false, code: "FIXTURE" } : await call(svc, "createSale", input);
    const id = typeof r?.saleId === "string" ? r.saleId : "";
    const L: Record<string, Any> = {};
    if (id) for (const l of (await P.posSaleLine.findMany({ where: { saleId: id } }).catch(() => [])) as Any[]) L[String(l.name).replace(` ${RAND}`, "")] = l;
    if (!id) console.log(`  ⚠️  createSale ${short(o.lines.map((x) => x[0]))}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { id, r, lines: L, grand };
  };
  const paidMonth = async (saleId: string) => {
    const s = await P.posSale.findUnique({ where: { id: saleId }, select: { paidAt: true, createdAt: true } }).catch(() => null);
    return s ? monthOf(new Date(s.paidAt ?? s.createdAt)) : MONTH;
  };
  /** แถวที่ข้อสอบคาด (สูตรอ้างอิง) ของบิลหนึ่ง */
  const expectRows = (s: SaleOut, spec: { name: string; qty: number; bp: number; fixed: number }[], bill: number) => {
    const names = spec.map((x) => x.name);
    const totals = names.map((n) => Number(s.lines[n]?.lineTotalSatang ?? 0));
    const nets: number[] = typeof refundMath?.lineNets === "function" ? refundMath.lineNets(totals, 0, sum(totals) - bill) : totals;
    return spec.map((x, i) => ({ lineId: String(s.lines[x.name]?.id ?? ""), base: nets[i]!, bp: x.bp, fixed: x.fixed, amount: hu(nets[i]! * x.bp, 10_000) + x.fixed * x.qty }));
  };
  // CL1
  const S1 = await sale({ seller: uid("C1"), bill: 1000, lines: [["L1", 1, 10_000, PR.P1 ?? null], ["L2", 2, 5_000, PR.P2 ?? null], ["L3", 3, 2_000, PR.P3 ?? null], ["L4", 1, 3_333, null]] });
  await drain();
  const S1_EXP = expectRows(S1, [{ name: "L1", qty: 1, bp: 1000, fixed: 0 }, { name: "L2", qty: 2, bp: 500, fixed: 0 }, { name: "L3", qty: 3, bp: 0, fixed: 250 }, { name: "L4", qty: 1, bp: 300, fixed: 0 }], 1000);
  let s1Fp = "";
  {
    const p: string[] = [];
    if (!S1.id) p.push(`บิล S1 → ${codeOf(S1.r)}`);
    const rows = S1.id ? await ledger({ saleId: S1.id }) : [];
    s1Fp = rowsFp(rows);
    const pk = S1.id ? await paidMonth(S1.id) : MONTH;
    if (rows.length !== 4) p.push(`แถว ${rows.length} (คาด 4)`);
    for (const e of S1_EXP) {
      const row = rows.find((x) => x.lineId === e.lineId);
      if (!row) {
        if (rows.length) p.push(`ไม่มีแถวของบรรทัด ${e.lineId.slice(-6)}`);
        continue;
      }
      const want = { kind: "ACCRUE", sourceKey: `PAID:${S1.id}:${e.lineId}`, userId: uid("C1"), unitId: U.A, systemId: S.A, saleId: S1.id, baseSatang: e.base, rateBp: e.bp, fixedSatang: e.fixed, amountSatang: e.amount, periodKey: pk, status: "OPEN" };
      const diff = Object.entries(want).filter(([k, v]) => row[k] !== v).map(([k, v]) => `${k} ${short(row[k], 40)}≠${short(v, 40)}`);
      if (row.hrPayAdjustmentId) diff.push("hrPayAdjustmentId ไม่ว่าง");
      if (diff.length) p.push(`บรรทัด ${e.amount}: ${diff.slice(0, 3).join(" ")}`);
    }
    chk("CL1", NC === "" && !fx && p.length === 0, `ACCRUE 4 แถว ${S1_EXP.map((e) => e.amount).join("+")}`, FX(NC + (P8(p) || `ครบ (Σ ${net(rows)})`)));
  }
  // CL2
  {
    const p: string[] = [];
    await drain();
    p.push(...(await replay("pos.sale.paid", S1.id ? await eventsOf("pos.sale.paid", (pl) => pl.saleId === S1.id) : [])));
    const rows = S1.id ? await ledger({ saleId: S1.id }) : [];
    if (rowsFp(rows) !== s1Fp || rows.length !== 4) p.push(`แถว ${rows.length} · fingerprint ${s1Fp} → ${rowsFp(rows)}`);
    chk("CL2", NC === "" && !fx && p.length === 0, "เล่นซ้ำไม่เปลี่ยน", FX(NC + (P8(p) || "ครบ")));
  }
  // CL3
  {
    const p: string[] = [];
    const S2 = await sale({ seller: uid("C1"), lines: [["V1", 1, 4_000, PR.P1 ?? null]] });
    await drain();
    const acc = S2.id ? await ledger({ saleId: S2.id }) : [];
    if (acc.length !== 1 || net(acc) !== 400) p.push(`ก่อน void ${acc.length} แถว Σ ${net(acc)} (คาด 1 · 400)`);
    if (S2.id) {
      try {
        await svc.voidSale(T, U.A, S2.id);
      } catch (e) {
        p.push(`voidSale throw ${(e as Error).message.slice(0, 60)}`);
      }
    }
    await drain();
    const rows = S2.id ? await ledger({ saleId: S2.id }) : [];
    const rev = rows.filter((r) => r.kind === "REVERSE");
    const lineId = String(S2.lines.V1?.id ?? "");
    if (rev.length !== 1 || rev[0]?.sourceKey !== `VOID:${S2.id}:${lineId}` || Number(rev[0]?.amountSatang) !== -400) p.push(`REVERSE ${short(rev.map((r) => [r.sourceKey, r.amountSatang]), 120)}`);
    if (net(rows) !== 0) p.push(`สุทธิ ${net(rows)}`);
    const fp = rowsFp(rows);
    p.push(...(await replay("pos.sale.voided", S2.id ? await eventsOf("pos.sale.voided", (pl) => pl.saleId === S2.id) : [])));
    if (rowsFp(S2.id ? await ledger({ saleId: S2.id }) : []) !== fp) p.push("เล่น voided ซ้ำแล้วแถวเปลี่ยน");
    chk("CL3", NC === "" && !fx && p.length === 0, "REVERSE −400 · สุทธิ 0 · เล่นซ้ำไม่เพิ่ม", FX(NC + (P8(p) || "ครบ")));
  }
  // CL4
  {
    const p: string[] = [];
    const S3 = await sale({ seller: uid("C1"), lines: [["R1", 3, 3_333, PR.P1 ?? null]] });
    await drain();
    const acc = S3.id ? await ledger({ saleId: S3.id }) : [];
    if (net(acc) !== 1000) p.push(`accrual ${net(acc)} (คาด 1000)`);
    const line = S3.lines.R1;
    const lineNet = Number(line?.lineTotalSatang ?? 0);
    const refundIds: string[] = [];
    let prevQ = 0, prevAmt = 0;
    for (let k = 0; k < 3 && S3.id && line; k++) {
      const amt = typeof refundMath?.refundLineAmount === "function" ? (refundMath.refundLineAmount(lineNet, 3, prevQ, prevAmt, 1) as number) : 3333;
      const req = { saleId: S3.id, lines: [{ lineId: line.id, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: amt }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ (QC)", idempotencyKey: `${KEY_PREFIX}-r${k}` };
      const r = await call(refundMod, "refundSale", ctxA(DEV[0]), A("OWNER"), req);
      const rid = String(r?.refund?.id ?? r?.refundSaleId ?? "");
      if (r?.ok === false || !rid) p.push(`refund ${k + 1} → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      else refundIds.push(rid);
      prevQ += 1;
      prevAmt += amt;
      await drain();
    }
    const rows = S3.id ? await ledger({ saleId: S3.id }) : [];
    const rev = rows.filter((r) => r.kind === "REVERSE");
    const want = [-333, -333, -334];
    const got = refundIds.map((rid) => rev.find((r) => String(r.sourceKey).startsWith(`REFUND:${rid}:`)));
    got.forEach((r, i) => {
      if (!r) p.push(`ไม่มี REVERSE ของใบคืน ${i + 1}`);
      else if (Number(r.amountSatang) !== want[i]) p.push(`ใบคืน ${i + 1} ${r.amountSatang} (คาด ${want[i]})`);
    });
    if (rev.some((r) => !/^REFUND:[^:]+:[^:]+$/.test(String(r.sourceKey)))) p.push(`sourceKey ${short(rev.map((r) => r.sourceKey), 120)}`);
    if (rev.length !== 3) p.push(`REVERSE ${rev.length} แถว (คาด 3)`);
    if (net(rows) !== 0) p.push(`สุทธิ ${net(rows)}`);
    const fp = rowsFp(rows);
    p.push(...(await replay("pos.sale.refunded", S3.id ? await eventsOf("pos.sale.refunded", (pl) => pl.saleId === S3.id) : [])));
    if (rowsFp(S3.id ? await ledger({ saleId: S3.id }) : []) !== fp) p.push("เล่น refunded ซ้ำแล้วแถวเปลี่ยน");
    chk("CL4", NC === "" && !fx && p.length === 0, "−333 −333 −334 · สุทธิ 0 · เล่นซ้ำไม่เพิ่ม", FX(NC + (P8(p) || "ครบ")));
  }
  // CL5
  {
    const p: string[] = [];
    let apiKeyId = "";
    try {
      const scopes: string[] = typeof scopesMod?.expandBundles === "function" ? scopesMod.expandBundles(["pos-read"]) : [];
      const k = await akSvc.createApiKey({ tenantId: T }, `QC P3.5 seller ${RAND}`, { scopes, systemId: S.A });
      apiKeyId = String(k.id);
    } catch (e) {
      p.push(`(fixture) createApiKey ${(e as Error).message.slice(0, 60)}`);
    }
    const run = async (label: string, mk: () => Promise<SaleOut>, wantRows: number) => {
      const s = await mk();
      await drain();
      if (!s.id) {
        p.push(`${label}: สร้างบิลไม่ได้ ${codeOf(s.r)} ${short(s.r?.message ?? "", 50)}`);
        return;
      }
      const n = (await ledger({ saleId: s.id })).length;
      if (n !== wantRows) p.push(`${label}: ${n} แถว (คาด ${wantRows})`);
    };
    if (apiKeyId) await run("คีย์ API", () => sale({ seller: apiKeyId, lines: [["K1", 1, 2_000, PR.P1 ?? null]] }), 0);
    await run("ไม่มีผู้ขาย", () => sale({ lines: [["K2", 1, 2_000, PR.P1 ?? null]] }), 0);
    await run("มัดจำ", () => sale({ seller: uid("C1"), source: "POS_DEPOSIT", lines: [["K3", 1, 2_000, null]] }), 0);
    await run("บัตรกำนัล", () => sale({ seller: uid("C1"), source: "MEMBER", lines: [["K4", 1, 2_000, null]] }), 0);
    await run("OWNER", () => sale({ seller: uid("OWNER"), lines: [["K5", 1, 2_000, PR.P1 ?? null]] }), 0);
    await run("MANAGER (ตัวควบคุมบวก)", () => sale({ seller: uid("MGR"), lines: [["K6", 1, 2_000, PR.P1 ?? null]] }), 1);
    if (S.A) await setComm({ ...COMM, enabled: false });
    await run("ค่าตั้งปิด", () => sale({ seller: uid("C1"), lines: [["K7", 1, 2_000, PR.P1 ?? null]] }), 0);
    if (S.A) await setComm(COMM);
    chk("CL5", NC === "" && !fx && p.length === 0, "ไม่มีสิทธิ์ = 0 แถว · MANAGER = 1", FX(NC + (P8(p) || "ครบ 7 กรณี")));
  }
  // CL6
  let S6id = "";
  {
    const p: string[] = [];
    const l1 = S1_EXP[0];
    if (S.A) await setComm({ ...COMM, byProduct: { ...COMM.byProduct, [PR.P1 || "none1"]: { bp: 2000 } } });
    await drain();
    const old = S1.id ? (await ledger({ saleId: S1.id })).find((r) => r.lineId === l1?.lineId) : null;
    if (!old || Number(old.rateBp) !== 1000 || Number(old.amountSatang) !== l1?.amount) p.push(`แถวเก่า ${short(old ? [old.rateBp, old.amountSatang] : null)} (คาด 1000 · ${l1?.amount})`);
    const S6 = await sale({ seller: uid("C1"), lines: [["N1", 1, 3_000, PR.P1 ?? null]] });
    S6id = S6.id;
    await drain();
    const nw = S6.id ? await ledger({ saleId: S6.id }) : [];
    if (nw.length !== 1 || Number(nw[0]?.rateBp) !== 2000 || Number(nw[0]?.amountSatang) !== 600) p.push(`บิลใหม่ ${short(nw.map((r) => [r.rateBp, r.amountSatang]))} (คาด 2000 · 600)`);
    if (S.A) await setComm(COMM);
    chk("CL6", NC === "" && !fx && p.length === 0, "snapshot: เก่าไม่เปลี่ยน · ใหม่ใช้อัตราใหม่", FX(NC + (P8(p) || "ครบ")));
  }
  // CL7
  {
    const p: string[] = [];
    const S7 = await sale({ seller: uid("C1"), lines: [["O1", 1, 4_000, PR.P1 ?? null]] });
    if (S7.id) {
      try {
        await svc.voidSale(T, U.A, S7.id);
      } catch (e) {
        p.push(`voidSale throw ${(e as Error).message.slice(0, 60)}`);
      }
      p.push(...(await replay("pos.sale.voided", await eventsOf("pos.sale.voided", (pl) => pl.saleId === S7.id), 1)));
      await drain();
      if (net(await ledger({ saleId: S7.id })) !== 0) p.push(`หลัง drain สุทธิ ${net(await ledger({ saleId: S7.id }))} (คาด 0)`);
      p.push(...(await replay("pos.sale.paid", await eventsOf("pos.sale.paid", (pl) => pl.saleId === S7.id), 1)));
      const rows = await ledger({ saleId: S7.id });
      if (net(rows) !== 0) p.push(`เล่น paid หลัง void สุทธิ ${net(rows)} (${rows.length} แถว)`);
    } else p.push(`บิล S7 → ${codeOf(S7.r)}`);
    chk("CL7", NC === "" && !fx && p.length === 0, "void ก่อน paid ⇒ สุทธิ 0", FX(NC + (P8(p) || "ครบ")));
  }
  // CL8
  {
    const p: string[] = [];
    const cons = rd(F.consumers);
    const entryOf = (key: string): string => {
      const i = cons.indexOf(`"${key}":`);
      if (i < 0) return "";
      const rest = cons.slice(i + key.length + 3);
      const j = rest.search(/\n {2}"[a-z][\w.]*":/);
      return stripComments(j < 0 ? rest : rest.slice(0, j));
    };
    const REF = /staffCommission\w*|staff-commission/;
    const EXTRA = /,\s*(?:\(\s*await\s+import\([^)]*staff-commission[^)]*\)\s*\)\s*\.\s*\w+|staffCommission\w*)\s*\)/;
    for (const key of ["pos.sale.paid", "pos.sale.voided", "pos.sale.refunded"]) {
      const e = entryOf(key);
      if (!REF.test(e)) p.push(`"${key}" ไม่มีขั้นค่าคอมฯ`);
      else if (/\bcompose\s*\(/.test(e) && EXTRA.test(e)) p.push(`"${key}": ค่าคอมฯ เป็นของแถมของ compose (ล้มแล้วถูกกลืน)`);
    }
    if (S1.id) {
      const before = await ledger({ saleId: S1.id });
      const jv0 = Number(await P.accountJournalEntry?.count?.({ where: { tenantId: T, refType: "PosSale", refId: S1.id } }).catch(() => -1));
      try {
        await P.$executeRawUnsafe(`DELETE FROM "PosStaffCommission" WHERE "tenantId" = $1 AND "saleId" = $2`, T, S1.id);
      } catch {
        /* ตารางยังไม่มี */
      }
      p.push(...(await replay("pos.sale.paid", await eventsOf("pos.sale.paid", (pl) => pl.saleId === S1.id), 1)));
      const after = await ledger({ saleId: S1.id });
      const key = (rows: Any[]) => JSON.stringify(rows.map((r) => [r.sourceKey, r.kind, r.amountSatang, r.rateBp, r.fixedSatang, r.baseSatang]).sort());
      if (!before.length || key(before) !== key(after)) p.push(`แถวหลังขับซ้ำ ${after.length} (เดิม ${before.length}) ${key(before) === key(after) ? "" : "ไม่ตรง"}`);
      const jv1 = Number(await P.accountJournalEntry?.count?.({ where: { tenantId: T, refType: "PosSale", refId: S1.id } }).catch(() => -1));
      if (jv0 !== jv1) p.push(`JV ของบิล ${jv0} → ${jv1}`);
    } else p.push("ไม่มีบิล S1");
    chk("CL8", NC === "" && !fx && p.length === 0, "งานหลัก 3 คีย์ · ขับซ้ำหลังล้มได้แถวคืนครบ · JV เท่าเดิม", FX(NC + (P8(p) || "ครบ")));
  }

  // ════════ PY ส่งเข้างวดเงินเดือน ════════
  const sync = (now: Date) => call(commMod, "syncStaffCommissionToPayroll", { tenantId: T, now, deadline: Date.now() + 120_000 });
  const posAdj = async () => (await adjustments()).filter((a) => /POS/.test(String(a.note ?? "")));
  let adjC1 = "";
  // PY1
  {
    const p: string[] = [];
    const r = await sync(new Date());
    if (r?.ok === false || r?.missing) p.push(`sync → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const adj = await adjustments();
    if (adj.length) p.push(`HrPayAdjustment ${adj.length} ใบ (คาด 0 — เดือนนี้ยังไม่จบ)`);
    const all = await ledger();
    if (!all.length) p.push("ไม่มีแถวในสมุด");
    if (all.some((x) => x.status !== "OPEN")) p.push(`แถวที่ไม่ OPEN ${all.filter((x) => x.status !== "OPEN").length}`);
    chk("PY1", NC === "" && !fx && p.length === 0, "เดือนปัจจุบันไม่ถูกส่ง", FX(NC + (P8(p) || `ครบ (${all.length} แถว OPEN)`)));
  }
  // PY2
  {
    const p: string[] = [];
    const c1Open = (await ledger({ userId: uid("C1") })).filter((x) => x.status === "OPEN");
    const want = net(c1Open);
    const r = await sync(NEXT_MONTH_NOW);
    if (r?.ok === false || r?.missing) p.push(`sync → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const adj = (await adjustments()).filter((a) => a.employeeId === EMP.C1);
    if (adj.length !== 1) p.push(`ใบของ C1 ${adj.length} (คาด 1)`);
    const a = adj[0];
    if (a) {
      adjC1 = String(a.id);
      const diff = Object.entries({ kind: "COMMISSION", status: "PENDING", amountSatang: want, periodKey: MONTH, systemId: HRS }).filter(([k, v]) => a[k] !== v).map(([k, v]) => `${k} ${short(a[k], 30)}≠${short(v, 30)}`);
      if (diff.length) p.push(diff.join(" "));
      if (!/POS/.test(String(a.note ?? ""))) p.push(`note ${short(a.note, 60)}`);
      if (a.crmCommissionId) p.push("crmCommissionId ไม่ว่าง");
    }
    const after = await ledger({ userId: uid("C1") });
    const bad = after.filter((x) => c1Open.some((o) => o.id === x.id) && (x.status !== "SENT" || x.hrPayAdjustmentId !== adjC1 || !x.sentAt));
    if (bad.length) p.push(`แถว C1 ที่ยังไม่ SENT/ผูกใบ ${bad.length}/${c1Open.length}`);
    chk("PY2", NC === "" && !fx && p.length === 0, `1 ใบ PENDING COMMISSION ${want} งวด ${MONTH}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY3
  {
    const p: string[] = [];
    const n0 = (await adjustments()).length;
    await sync(NEXT_MONTH_NOW);
    await sync(NEXT_MONTH_NOW);
    await Promise.all([sync(NEXT_MONTH_NOW), sync(NEXT_MONTH_NOW)]);
    const adj = await adjustments();
    if (adj.length !== n0) p.push(`ใบในร้าน ${n0} → ${adj.length}`);
    if (adj.filter((a) => a.employeeId === EMP.C1).length !== 1) p.push(`ใบของ C1 ${adj.filter((a) => a.employeeId === EMP.C1).length}`);
    const c1 = await ledger({ userId: uid("C1") });
    if (c1.some((x) => x.status === "SENT" && x.hrPayAdjustmentId !== adjC1)) p.push("แถว SENT ผูกใบอื่น");
    chk("PY3", NC === "" && !fx && adjC1 !== "" && p.length === 0, "ซ้ำ/พร้อมกัน ⇒ 1 ใบ", FX(NC + (P8(p) || (adjC1 ? "ครบ" : "ไม่มีใบของ C1 ให้ตรวจ"))));
  }
  // PY4
  {
    const p: string[] = [];
    const run = await call(hrPay, "createPayrollRun", hrCtx(), { periodKey: MONTH, payDate: new Date(`${M1}-01T03:00:00+07:00`) });
    if (!run?.id) p.push(`(fixture) createPayrollRun ${codeOf(run)} ${short(run?.message ?? "", 60)}`);
    const S8 = await sale({ seller: uid("C2"), lines: [["Q1", 1, 5_000, PR.P1 ?? null]] });
    await drain();
    if (S8.id && net(await ledger({ saleId: S8.id })) !== 500) p.push(`C2 accrual ${net(await ledger({ saleId: S8.id }))} (คาด 500)`);
    await sync(NEXT_MONTH_NOW);
    const adj = (await adjustments()).filter((a) => a.employeeId === EMP.C2);
    if (adj.length !== 1 || adj[0]?.periodKey !== M1 || adj[0]?.kind !== "COMMISSION" || adj[0]?.amountSatang !== 500) p.push(`ใบของ C2 ${short(adj.map((a) => [a.periodKey, a.kind, a.amountSatang]), 100)} (คาด ${M1} COMMISSION 500)`);
    chk("PY4", NC === "" && !fx && p.length === 0, `งวดมีรอบ ⇒ ${M1}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY5
  {
    const p: string[] = [];
    const s1Acc = S1_EXP.reduce((a, e) => a + e.amount, 0);
    if (S1.id) {
      try {
        await svc.voidSale(T, U.A, S1.id);
      } catch (e) {
        p.push(`voidSale S1 throw ${(e as Error).message.slice(0, 60)}`);
      }
    }
    await drain();
    const rev = S1.id ? (await ledger({ saleId: S1.id })).filter((r) => r.kind === "REVERSE") : [];
    if (net(rev) !== -s1Acc) p.push(`REVERSE ของ S1 ${net(rev)} (คาด −${s1Acc})`);
    if (rev.some((r) => r.periodKey !== MONTH)) p.push(`periodKey REVERSE ${short([...new Set(rev.map((r) => r.periodKey))])} (คาด ${MONTH})`);
    await sync(NEXT_MONTH_NOW);
    const adj = (await adjustments()).filter((a) => a.employeeId === EMP.C1);
    const ded = adj.filter((a) => a.id !== adjC1);
    if (ded.length !== 1 || ded[0]?.kind !== "DEDUCTION" || ded[0]?.amountSatang !== s1Acc || ded[0]?.periodKey !== M1 || ded[0]?.status !== "PENDING") p.push(`ใบใหม่ของ C1 ${short(ded.map((a) => [a.kind, a.amountSatang, a.periodKey, a.status]), 120)} (คาด DEDUCTION ${s1Acc} ${M1})`);
    const first = adj.find((a) => a.id === adjC1);
    if (adjC1 && (!first || first.kind !== "COMMISSION" || first.status !== "PENDING")) p.push("ใบเดิมถูกแตะ");
    if (rev.length && (await ledger({ saleId: S1.id })).some((r) => r.kind === "REVERSE" && r.status !== "SENT")) p.push("REVERSE ยังไม่ SENT");
    chk("PY5", NC === "" && !fx && p.length === 0, `DEDUCTION ${s1Acc} งวด ${M1}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY6
  {
    const p: string[] = [];
    const S9 = await sale({ seller: uid("C6"), lines: [["X1", 1, 5_000, PR.P1 ?? null]] });
    await drain();
    await sync(NEXT_MONTH_NOW);
    for (const k of ["C6", "MGR"]) {
      const rows = await ledger({ userId: uid(k) });
      if (!rows.length) p.push(`${k} ไม่มีแถว`);
      else if (rows.some((r) => r.status !== "OPEN" || r.hrPayAdjustmentId)) p.push(`${k} มีแถวที่ไม่ OPEN`);
    }
    if (!S9.id) p.push(`บิล C6 → ${codeOf(S9.r)}`);
    const rep = await call(reportsMod, "reportStaffCommission", { tenantId: T, systemId: S.A }, A("OWNER"), { from: todayBkk, to: todayBkk });
    const rows: Any[] = rep?.ok === true && Array.isArray(rep.report?.rows) ? rep.report.rows : [];
    if (rep?.ok !== true) p.push(`reportStaffCommission → ${codeOf(rep)} ${short(rep?.message ?? "", 50)}`);
    else {
      const all = await ledger();
      for (const k of ["C1", "C6", "MGR"]) {
        const row = rows.find((r) => r.userId === uid(k));
        const mine = all.filter((x) => x.userId === uid(k));
        const acc = sum(mine.filter((x) => x.kind === "ACCRUE").map((x) => Number(x.amountSatang)));
        const rv = -sum(mine.filter((x) => x.kind === "REVERSE").map((x) => Number(x.amountSatang)));
        const sent = sum(mine.filter((x) => x.status === "SENT").map((x) => Number(x.amountSatang)));
        const open = sum(mine.filter((x) => x.status === "OPEN").map((x) => Number(x.amountSatang)));
        const want = { accruedSatang: acc, reversedSatang: rv, netSatang: acc - rv, sentSatang: sent, openSatang: open, noEmployee: k !== "C1" };
        if (!row) p.push(`รายงานไม่มีแถว ${k}`);
        else {
          const diff = Object.entries(want).filter(([f, v]) => row[f] !== v).map(([f, v]) => `${f} ${short(row[f], 20)}≠${v}`);
          if (diff.length) p.push(`${k}: ${diff.slice(0, 3).join(" ")}`);
        }
      }
    }
    const adj = await adjustments();
    if (adj.some((a) => a.crmCommissionId)) p.push("มีใบที่ crmCommissionId ไม่ว่าง");
    if ((await posAdj()).length !== adj.length) p.push("มีใบที่ note ไม่มี POS");
    const st = await call(hrFacade, "adjustmentStatuses", { tenantId: T, ids: adj.map((a) => a.id) });
    const list: Any[] = Array.isArray(st) ? st : Array.isArray(st?.items) ? st.items : [];
    if (list.length !== adj.length || list.some((x) => x.status !== "PENDING" || (x.runId ?? null) !== null)) p.push(`adjustmentStatuses → ${short(st, 100)}`);
    chk("PY6", NC === "" && !fx && p.length === 0, "ไม่มีพนักงาน ⇒ OPEN · รายงานตรงสมุด · crmCommissionId null · statuses", FX(NC + (P8(p) || "ครบ")));
  }
  // PY7 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N1): รายการของระบบ (POS · crmCommissionId null · requestedById null) ย้ายงวดตอนอนุมัติเหมือนคอมมิชชัน CRM
  const M2 = nextMonth(M1);
  {
    const p: string[] = [];
    const target = (await posAdj()).find((a) => a.employeeId === EMP.C2 && a.periodKey === M1 && a.status === "PENDING");
    if (!target) p.push(`(fixture) ไม่มีใบ PENDING ของ C2 งวด ${M1}`);
    else {
      const run = await call(hrPay, "createPayrollRun", hrCtx(), { periodKey: M1, payDate: new Date(`${M2}-01T03:00:00+07:00`) });
      if (!run?.id) p.push(`(fixture) createPayrollRun ${M1} → ${codeOf(run)} ${short(run?.message ?? "", 60)}`);
      const d = await call(hrPay, "decideAdjustment", hrCtx(), target.id, "APPROVED", { userId: uid("OWNER"), isOwner: true });
      if (d?.ok !== true) p.push(`decideAdjustment → ${short(d, 80)}`);
      const row = (await adjustments()).find((a) => a.id === target.id);
      if (!row || row.periodKey !== M2 || row.status !== "APPROVED" || row.runId) p.push(`ใบหลังอนุมัติ ${short(row && [row.periodKey, row.status, row.runId], 80)} (คาด ${M2} APPROVED runId null)`);
      const st = await call(hrFacade, "adjustmentStatuses", { tenantId: T, ids: [target.id] });
      const list: Any[] = Array.isArray(st) ? st : Array.isArray(st?.items) ? st.items : [];
      const x = list.find((y) => y.id === target.id);
      if (!x || x.status !== "APPROVED" || x.periodKey !== M2) p.push(`adjustmentStatuses → ${short(x ?? st, 80)} (คาด APPROVED · periodKey ${M2})`);
    }
    chk("PY7", NC === "" && !fx && p.length === 0, `อนุมัติหลังรอบ ${M1} ⇒ ย้ายไป ${M2}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY8 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N1): รายการของระบบที่ค้างในงวดที่มีรอบแล้ว ถูกย้ายไปงวดแรกที่ยังไม่มีรอบ (ตัวกวาดของ HR ที่รอบส่งของ POS เรียก)
  {
    const p: string[] = [];
    const ded = (await posAdj()).find((a) => a.employeeId === EMP.C1 && a.kind === "DEDUCTION");
    if (!ded || ded.periodKey !== M1 || ded.status !== "PENDING") p.push(`(fixture) ใบหักของ C1 ${short(ded && [ded.periodKey, ded.status], 60)} (คาด ${M1} PENDING)`);
    await sync(NEXT_MONTH_NOW);
    const runs = new Set(((await P.hrPayrollRun.findMany({ where: { tenantId: T }, select: { periodKey: true } }).catch(() => [])) as Any[]).map((r) => r.periodKey));
    const all = await posAdj();
    const d2 = all.find((a) => ded && a.id === ded.id);
    if (!d2 || d2.periodKey !== M2 || d2.status !== "PENDING" || d2.runId) p.push(`ใบหักของ C1 หลังกวาด ${short(d2 && [d2.periodKey, d2.status, d2.runId], 60)} (คาด ${M2} PENDING)`);
    const stuck = all.filter((a) => !a.runId && (a.status === "PENDING" || a.status === "APPROVED") && runs.has(a.periodKey));
    if (stuck.length) p.push(`ใบ POS ยังค้างในงวดที่มีรอบ ${stuck.length}: ${short(stuck.map((a) => [a.kind, a.periodKey]), 80)}`);
    chk("PY8", NC === "" && !fx && p.length === 0, `ตัวกวาด ⇒ ${M2}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY9 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N2): คู่ที่ค้างถาวรต้องไม่กินคิวของรอบส่ง (แถว 600 คู่ = ข้อมูลทดสอบในร้านชั่วคราว · เขียนตรงด้วย prisma ของข้อสอบ)
  {
    const p: string[] = [];
    const S10 = await sale({ seller: uid("C2"), lines: [["Q2", 1, 3_000, PR.P1 ?? null]] });
    await drain();
    if (S10.id && net(await ledger({ saleId: S10.id })) !== 300) p.push(`(fixture) C2 accrual ${net(await ledger({ saleId: S10.id }))} (คาด 300)`);
    const stuckRows = Array.from({ length: 600 }, (_, i) => ({
      tenantId: T, systemId: S.A, unitId: U.A, saleId: `qc35stuck${RAND}`, lineId: `qc35stuck${RAND}l${i}`, userId: `0p35${RAND}u${String(i).padStart(4, "0")}`,
      kind: "ACCRUE", sourceKey: `QCSTUCK:${RAND}:${i}`, baseSatang: 100, rateBp: 100, fixedSatang: 0, amountSatang: 1, periodKey: MONTH, status: "OPEN",
    }));
    try {
      if (PSC) await PSC.createMany({ data: stuckRows });
    } catch (e) {
      p.push(`(fixture) แถวค้าง ${(e as Error).message.slice(0, 60)}`);
    }
    const before = (await posAdj()).filter((a) => a.employeeId === EMP.C2).map((a) => a.id);
    await sync(NEXT_MONTH_NOW);
    const fresh = (await posAdj()).filter((a) => a.employeeId === EMP.C2 && !before.includes(a.id));
    if (fresh.length !== 1 || fresh[0]?.kind !== "COMMISSION" || fresh[0]?.amountSatang !== 300) p.push(`ใบใหม่ของ C2 ${short(fresh.map((a) => [a.kind, a.amountSatang, a.periodKey]), 100)} (คาด COMMISSION 300 ใบเดียว)`);
    const stillOpen = PSC ? Number(await PSC.count({ where: { tenantId: T, sourceKey: { startsWith: `QCSTUCK:${RAND}:` }, status: "OPEN" } })) : -1;
    if (stillOpen !== 600) p.push(`แถวค้าง OPEN ${stillOpen} (คาด 600)`);
    chk("PY9", NC === "" && !fx && p.length === 0, "600 คู่ค้างไม่บล็อก C2", FX(NC + (P8(p) || "ครบ")));
  }
  // PY10 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix2 N3): งวดเป้าหมายไม่ย้อนไปก่อนประวัติรอบจ่ายของ HR
  {
    const p: string[] = [];
    let OLD = MONTH;
    for (let i = 0; i < 6; i++) {
      const [y, m] = OLD.split("-").map(Number) as [number, number];
      OLD = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    }
    try {
      if (PSC) await PSC.createMany({ data: [{ tenantId: T, systemId: S.A, unitId: U.A, saleId: `qc35old${RAND}`, lineId: `qc35old${RAND}l`, userId: uid("C1"), kind: "ACCRUE", sourceKey: `QCOLD:${RAND}`, baseSatang: 7_770, rateBp: 1000, fixedSatang: 0, amountSatang: 777, periodKey: OLD, status: "OPEN" }] });
    } catch (e) {
      p.push(`(fixture) แถวเก่า ${(e as Error).message.slice(0, 60)}`);
    }
    const runs = ((await P.hrPayrollRun.findMany({ where: { tenantId: T }, select: { periodKey: true } }).catch(() => [])) as Any[]).map((r) => String(r.periodKey)).sort();
    const want = runs.length ? nextMonth(runs[runs.length - 1]!) : OLD;
    await sync(NEXT_MONTH_NOW);
    const adj = (await posAdj()).filter((a) => a.employeeId === EMP.C1 && a.amountSatang === 777);
    if (adj.length !== 1 || adj[0]?.periodKey !== want || adj[0]?.kind !== "COMMISSION") p.push(`ใบ 777 ของ C1 ${short(adj.map((a) => [a.kind, a.periodKey]), 80)} (คาด COMMISSION ${want} · ไม่ใช่ ${OLD})`);
    chk("PY10", NC === "" && !fx && p.length === 0, `เดือนเก่า ${OLD} ⇒ ${want}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY11 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix3 N9): รอบในอนาคตไม่นับเป็นเพดานล่างของงวด (freeFrom + PERIOD_CLOSED ยังข้ามให้)
  {
    const p: string[] = [];
    let FUT = MONTH;
    for (let i = 0; i < 8; i++) FUT = nextMonth(FUT);
    const run = await call(hrPay, "createPayrollRun", hrCtx(), { periodKey: FUT, payDate: new Date(`${nextMonth(FUT)}-01T03:00:00+07:00`) });
    if (!run?.id) p.push(`(fixture) createPayrollRun ${FUT} → ${codeOf(run)} ${short(run?.message ?? "", 60)}`);
    try {
      if (PSC) await PSC.createMany({ data: [{ tenantId: T, systemId: S.A, unitId: U.A, saleId: `qc35fut${RAND}`, lineId: `qc35fut${RAND}l`, userId: uid("C1"), kind: "ACCRUE", sourceKey: `QCFUT:${RAND}`, baseSatang: 5_550, rateBp: 1000, fixedSatang: 0, amountSatang: 555, periodKey: MONTH, status: "OPEN" }] });
    } catch (e) {
      p.push(`(fixture) แถว 555 ${(e as Error).message.slice(0, 60)}`);
    }
    const cur = M1; // เดือนไทยของ NEXT_MONTH_NOW
    const runs = ((await P.hrPayrollRun.findMany({ where: { tenantId: T }, select: { periodKey: true } }).catch(() => [])) as Any[]).map((r) => String(r.periodKey));
    const past = runs.filter((k) => k <= cur).sort();
    let want = past.length ? nextMonth(past[past.length - 1]!) : MONTH;
    while (runs.includes(want)) want = nextMonth(want);
    await sync(NEXT_MONTH_NOW);
    const adj = (await posAdj()).filter((a) => a.employeeId === EMP.C1 && a.amountSatang === 555);
    if (adj.length !== 1 || adj[0]?.periodKey !== want) p.push(`ใบ 555 ของ C1 ${short(adj.map((a) => [a.kind, a.periodKey]), 80)} (คาด ${want} · ไม่ใช่ ${nextMonth(FUT)})`);
    chk("PY11", NC === "" && !fx && p.length === 0, `รอบล่วงหน้า ${FUT} ไม่ดันงวด ⇒ ${want}`, FX(NC + (P8(p) || "ครบ")));
  }
  // PY12 — ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix3 N8): ร้านที่อยู่หลังในลำดับยังได้กวาด (แถวสมมุติ 600 ร้าน = id หลวมในสมุด ไม่มีแถว Tenant · ลบท้ายข้อ + ใน wipe)
  {
    const p: string[] = [];
    const M2x = nextMonth(M1);
    const runM = await call(hrPay, "createPayrollRun", hrCtx(), { periodKey: M2x, payDate: new Date(`${nextMonth(M2x)}-01T03:00:00+07:00`) });
    if (!runM?.id) p.push(`(fixture) createPayrollRun ${M2x} → ${codeOf(runM)} ${short(runM?.message ?? "", 60)}`);
    const runsNow = new Set(((await P.hrPayrollRun.findMany({ where: { tenantId: T }, select: { periodKey: true } }).catch(() => [])) as Any[]).map((r) => String(r.periodKey)));
    const stuck0 = (await posAdj()).filter((a) => !a.runId && (a.status === "PENDING" || a.status === "APPROVED") && runsNow.has(a.periodKey));
    if (!stuck0.length) p.push("(fixture) ไม่มีใบ POS ค้างในงวดที่มีรอบ");
    const fake = Array.from({ length: 600 }, (_, i) => ({
      tenantId: `0p35${RAND}t${String(i).padStart(4, "0")}`, systemId: "qc35fake", unitId: "qc35fake", saleId: `qc35sweep${RAND}`, lineId: `qc35sweep${RAND}l${i}`, userId: "qc35fake",
      kind: "ACCRUE", sourceKey: `QCSWEEP:${RAND}:${i}`, baseSatang: 100, rateBp: 100, fixedSatang: 0, amountSatang: 1, periodKey: MONTH, status: "SENT", hrPayAdjustmentId: `qc35fakeadj${i}`, sentAt: new Date(),
    }));
    try {
      if (PSC) await PSC.createMany({ data: fake });
      for (let k = 0; k < 2; k++) {
        await call(commMod, "syncStaffCommissionToPayroll", { now: NEXT_MONTH_NOW, deadline: Date.now() + 120_000 });
        const left = (await posAdj()).filter((a) => !a.runId && (a.status === "PENDING" || a.status === "APPROVED") && runsNow.has(a.periodKey));
        if (!left.length) break;
        if (k === 1) p.push(`ใบ POS ยังค้างหลัง 2 รอบ ${left.length}: ${short(left.map((a) => [a.kind, a.periodKey]), 80)}`);
      }
    } finally {
      await P.$executeRawUnsafe(`DELETE FROM "PosStaffCommission" WHERE "sourceKey" LIKE $1`, `QCSWEEP:${RAND}:%`).catch(() => 0);
    }
    chk("PY12", NC === "" && !fx && p.length === 0, "ร้านหลังในลำดับยังได้กวาด ≤ 2 รอบ", FX(NC + (P8(p) || `ครบ (${stuck0.length} ใบย้ายแล้ว)`)));
  }

  // ════════ HC ชั่วโมง ════════
  const token = async (k: string, dev: string): Promise<string> => {
    try {
      return String((await staffMod.issueStaffToken(ctxA(dev), { unitId: U.A, deviceId: dev, userId: uid(k) })).staffToken);
    } catch {
      return "";
    }
  };
  const SH: Record<string, string> = {};
  const TK: Record<string, string> = {};
  if (!fx) {
    for (const [k, dev] of [["C1", DEV[1]!], ["C3", DEV[2]!], ["C6", DEV[3]!]] as const) {
      TK[k] = await token(k, dev);
      const o = await call(shiftMod, "openShift", ctxA(dev), A("OWNER"), { deviceId: dev, deviceLabel: `เครื่อง QC ${k}`, floatSatang: 0, staffToken: TK[k] });
      if (o?.ok === true) SH[k] = String(o.shift?.id ?? "");
      else fxNote(`openShift ${k}: ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
    }
  }
  const DEVOF: Record<string, string> = { C1: DEV[1]!, C3: DEV[2]!, C6: DEV[3]! };
  const clockFor = (k: string, kind: "IN" | "OUT", tok = TK[k]) => call(linkMod, "posClockForShift", ctxA(DEVOF[k]), { kind, deviceId: DEVOF[k], staffToken: tok, shiftId: SH[k] });
  const shiftRow = async (k: string): Promise<Any> => (SH[k] ? await P.posShift.findUnique({ where: { id: SH[k] } }).catch(() => null) : null);
  // HC1
  {
    const p: string[] = [];
    const a0 = (await attendance("C1")).length;
    const r = await clockFor("C1", "IN");
    if (!(r?.ok === true && r.kind === "IN")) p.push(`IN → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const rows = await attendance("C1");
    const no = (await shiftRow("C1"))?.shiftNo;
    if (rows.length !== a0 + 1 || rows[rows.length - 1]?.kind !== "IN") p.push(`HrAttendance ${a0} → ${rows.length}`);
    else if (!String(rows[rows.length - 1]?.note ?? "").includes(`#${no}`)) p.push(`note ${short(rows[rows.length - 1]?.note, 60)} (คาดมี #${no})`);
    chk("HC1", NL === "" && !fx && p.length === 0, "IN 1 แถว · note มีเลขกะ", FX(NL + (P8(p) || "ครบ")));
  }
  // HC2
  {
    const p: string[] = [];
    const a0 = (await attendance("C1")).length;
    const r = await clockFor("C1", "IN");
    if (!(r?.ok === false && r.code === "ALREADY_CLOCKED" && !r.threw)) p.push(`IN ซ้ำ → ${codeOf(r)}`);
    if ((await attendance("C1")).length !== a0) p.push("มีแถวเพิ่ม");
    chk("HC2", NL === "" && !fx && p.length === 0, "ALREADY_CLOCKED · ไม่เพิ่ม", FX(NL + (P8(p) || "ครบ")));
  }
  // HC3
  {
    const p: string[] = [];
    const n0 = Number(await P.hrAttendance.count({ where: { tenantId: T } }).catch(() => -1));
    const r = await clockFor("C6", "IN");
    if (!(r?.ok === false && r.code === "NO_EMPLOYEE" && !r.threw)) p.push(`C6 → ${codeOf(r)} (คาด NO_EMPLOYEE)`);
    const bad = await clockFor("C1", "OUT", "garbage.token");
    if (!(bad?.ok === false && bad.code === "STAFF_TOKEN_INVALID")) p.push(`โทเคนมั่ว → ${codeOf(bad)} (คาด STAFF_TOKEN_INVALID)`);
    if (Number(await P.hrAttendance.count({ where: { tenantId: T } }).catch(() => -1)) !== n0) p.push("มี HrAttendance เพิ่ม");
    chk("HC3", NL === "" && !fx && p.length === 0, "NO_EMPLOYEE · STAFF_TOKEN_INVALID · ไม่มีแถว", FX(NL + (P8(p) || "ครบ")));
  }
  // HC4 + PV3
  {
    const p: string[] = [];
    const q: string[] = [];
    const out = await clockFor("C1", "OUT");
    if (out?.ok !== true) p.push(`C1 OUT → ${codeOf(out)}`);
    const in3 = await clockFor("C3", "IN");
    if (in3?.ok !== true) p.push(`C3 IN → ${codeOf(in3)}`);
    for (const k of ["C1", "C3", "C6"]) {
      if (!SH[k]) continue;
      const c = await call(shiftMod, "closeShift", ctxA(DEVOF[k]), A("OWNER"), { shiftId: SH[k], countedCashSatang: 0, idempotencyKey: `${KEY_PREFIX}-close-${k}` });
      if (c?.ok !== true) p.push(`(fixture) closeShift ${k} ${codeOf(c)} ${short(c?.message ?? "", 50)}`);
    }
    const now = Date.now();
    if (SH.C3) await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $2, "closedAt" = $3 WHERE id = $1 AND "tenantId" = $4`, SH.C3, new Date(now - 100 * MIN), new Date(now - 40 * MIN), T);
    const ids = [SH.C1, SH.C3, SH.C6].filter(Boolean) as string[];
    const r = await call(linkMod, "shiftHoursForOwner", ctxA(), A("OWNER"), { shiftIds: ids });
    const items: Any[] = r?.ok === true && Array.isArray(r.items) ? r.items : [];
    if (r?.ok !== true) p.push(`shiftHoursForOwner → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    else {
      const of = (k: string) => items.find((x) => x.shiftId === SH[k]);
      const sameSet = (a: unknown, b: string[]) => Array.isArray(a) && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      const a = of("C1");
      const att = await attendance("C1");
      const sh1 = await shiftRow("C1");
      const wantWorked = typeof hrRules?.workedMinutes === "function" ? hrRules.workedMinutes(att.filter((x) => ms(x.at) >= ms(sh1?.openedAt) - 15 * MIN && ms(x.at) <= ms(sh1?.closedAt ?? new Date()) + MIN).map((x) => ({ kind: x.kind, at: new Date(x.at) }))) : NaN;
      const dur1 = sh1?.closedAt ? (ms(sh1.closedAt) - ms(sh1.openedAt)) / MIN : NaN;
      if (!a) p.push("ไม่มีกะ C1");
      else {
        if (!sameSet(a.warnings, [])) p.push(`C1 warnings ${short(a.warnings)}`);
        if (a.workedMin !== wantWorked) p.push(`C1 workedMin ${short(a.workedMin)} (คาด ${wantWorked})`);
        if (!(a.durationMin === Math.floor(dur1) || a.durationMin === Math.round(dur1))) p.push(`C1 durationMin ${short(a.durationMin)} (คาด ${dur1.toFixed(2)})`);
      }
      const c = of("C3");
      if (!c) p.push("ไม่มีกะ C3");
      else {
        if (c.durationMin !== 60) p.push(`C3 durationMin ${short(c.durationMin)} (คาด 60)`);
        if (!sameSet(c.warnings, ["NO_CLOCK_IN", "NO_CLOCK_OUT"])) p.push(`C3 warnings ${short(c.warnings)} (คาด NO_CLOCK_IN NO_CLOCK_OUT)`);
      }
      const d = of("C6");
      if (!d) p.push("ไม่มีกะ C6");
      else if (!sameSet(d.warnings, ["NO_EMPLOYEE"]) || d.workedMin !== null) p.push(`C6 ${short([d.warnings, d.workedMin])} (คาด [NO_EMPLOYEE] null)`);
      if (commissionKeys(items).length) p.push("ผลชั่วโมงมีคีย์ค่าคอมฯ");
    }
    chk("HC4", NL === "" && !fx && p.length === 0, "duration · workedMin · warnings ตรงผัง", FX(NL + (P8(p) || `ครบ (${items.length} กะ)`)));
    for (const k of ["MGR", "C1"]) {
      const x = await call(linkMod, "shiftHoursForOwner", ctxA(), A(k), { shiftIds: ids });
      if (!(x?.ok === false && x.code === "PERMISSION_DENIED")) q.push(`${k} → ${codeOf(x)} (คาด PERMISSION_DENIED)`);
    }
    const y = await call(linkMod, "shiftHoursForOwner", ctxA(), A("PAYV"), { shiftIds: ids });
    if (y?.ok !== true) q.push(`hr.payroll.read → ${codeOf(y)} (คาด ✓)`);
    chk("PV3", NL === "" && !fx && q.length === 0, "MANAGER/STAFF ✗ · hr.payroll.read ✓", FX(NL + (P8(q) || "ครบ")));
  }

  // ════════ PV ความเป็นส่วนตัว ════════
  const ctxR = { tenantId: T, systemId: S.A };
  const range = { from: todayBkk, to: todayBkk };
  // PV1
  {
    const p: string[] = [];
    const json = (k: string, ctx: Any = ctxR) => call(reportsMod, "reportStaffCommission", ctx, A(k), range);
    const csv = (k: string, ctx: Any = ctxR) => call(reportsMod, "reportCsv", ctx, A(k), { kind: "commission", ...range });
    for (const k of ["OWNER", "PAYV"]) {
      const j = await json(k);
      if (j?.ok !== true || !Array.isArray(j.report?.rows) || !j.report.rows.length) p.push(`${k} JSON → ${codeOf(j)} ${short(j?.message ?? "", 40)}`);
      const c = await csv(k);
      if (c?.ok !== true) p.push(`${k} CSV → ${codeOf(c)}`);
      else {
        const head = String(c.body ?? "").replace(/^﻿/, "").split("\n")[0] ?? "";
        const want = (reportsMod?.CSV_HEADERS?.commission ?? null) as string[] | null;
        if (!want || head.split(",").length !== want.length || !want.every((h) => head.includes(h))) p.push(`${k} CSV หัว ${short(head, 80)}`);
      }
    }
    for (const k of ["MGR", "C2"]) {
      const j = await json(k);
      if (!(j?.ok === false && j.code === "PERMISSION_DENIED")) p.push(`${k} JSON → ${codeOf(j)} (คาด PERMISSION_DENIED)`);
      const c = await csv(k);
      if (!(c?.ok === false && c.code === "PERMISSION_DENIED")) p.push(`${k} CSV → ${codeOf(c)} (คาด PERMISSION_DENIED)`);
    }
    const t2 = await call(reportsMod, "reportStaffCommission", { tenantId: T2, systemId: S.A }, A("OWNER2"), range);
    if (!(t2?.ok === false && t2.code === "NOT_FOUND")) p.push(`T2 → ${codeOf(t2)} (คาด NOT_FOUND)`);
    chk("PV1", NC === "" && !fx && p.length === 0, "OWNER + hr.payroll.read ✓ · MANAGER/STAFF ✗ · T2 NOT_FOUND", FX(NC + (P8(p) || "ครบ")));
  }
  // PV2
  {
    const p: string[] = [];
    const st = await call(reportsMod, "reportStaff", ctxR, A("OWNER"), range);
    if (st?.ok !== true) p.push(`reportStaff → ${codeOf(st)}`);
    else if (commissionKeys(st).length) p.push(`reportStaff มีคีย์ ${commissionKeys(st).join(",")}`);
    // REST
    let raw = "";
    try {
      const scopes: string[] = typeof scopesMod?.expandBundles === "function" ? scopesMod.expandBundles(["pos-read"]) : [];
      raw = String((await akSvc.createApiKey({ tenantId: T }, `QC P3.5 rest ${RAND}`, { scopes, systemId: S.A })).rawKey ?? "");
    } catch (e) {
      p.push(`(fixture) createApiKey ${(e as Error).message.slice(0, 60)}`);
    }
    const get = async (accept?: string): Promise<{ status: number; text: string }> => {
      const fn = route?.GET;
      if (typeof fn !== "function") return { status: 0, text: "" };
      const path = `/reports/staff?from=${todayBkk}&to=${todayBkk}`;
      try {
        const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method: "GET", headers: { authorization: `Bearer ${raw}`, ...(accept ? { accept } : {}) } }), { params: Promise.resolve({ path: ["reports", "staff"] }) });
        return { status: res.status, text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer())) };
      } catch (e) {
        return { status: -1, text: (e as Error).message };
      }
    };
    if (raw) {
      const j = await get();
      let body: Any = null;
      try {
        body = JSON.parse(j.text);
      } catch {
        /* ไม่ใช่ JSON */
      }
      if (j.status !== 200 || !body) p.push(`REST /reports/staff → ${j.status} ${short(j.text, 60)}`);
      else if (commissionKeys(body).length) p.push(`REST มีคีย์ ${commissionKeys(body).join(",")}`);
      const c = await get("text/csv");
      const head = c.text.replace(/^﻿/, "").split("\n")[0] ?? "";
      if (c.status !== 200 || head !== STAFF_CSV_PIN.join(",")) p.push(`REST CSV หัว ${c.status} ${short(head, 80)}`);
    }
    // บิลที่ยัง PAID และมีแถวค่าคอมฯ (S6 · S1 ถูก void ใน PY5)
    const rc = S6id ? await call(receiptMod, "receiptPayload", ctxA(DEV[0]), A("OWNER"), { saleId: S6id }) : null;
    if (!rc || rc.ok === false) p.push(`receiptPayload → ${codeOf(rc)}`);
    else if (commissionKeys(rc).length) p.push(`ใบเสร็จมีคีย์ ${commissionKeys(rc).join(",")}`);
    const ls = await call(staffMod, "listStaffForDevice", ctxA(DEV[0]), { unitId: U.A });
    if (ls?.ok !== true) p.push(`listStaffForDevice → ${codeOf(ls)}`);
    else if (commissionKeys(ls).length) p.push(`จอล็อกมีคีย์ ${commissionKeys(ls).join(",")}`);
    const bd = S6id ? await call(billsMod, "billDetail", ctxA(DEV[0]), A("OWNER"), { unitId: U.A, saleId: S6id }) : null;
    if (!bd || bd.ok === false) p.push(`billDetail → ${codeOf(bd)}`);
    else if (deepKeys(bd).some((k) => /staff_?commission/i.test(k))) p.push("ลิ้นชักบิลมีคีย์ staffCommission");
    const ds = displayShared?.displayStateSchema?.safeParse?.({ v: 1, phase: "cart", lines: [{ name: "x", qty: 1, totalSatang: 100, staffCommissionSatang: 5 }], staffCommissionSatang: 9 });
    if (ds?.success && commissionKeys(ds.data).length) p.push(`displayStateSchema ปล่อยคีย์ ${commissionKeys(ds.data).join(",")}`);
    chk("PV2", !fx && p.length === 0, "ไม่มีคีย์ค่าคอมฯ บนพื้นผิวที่ไม่ใช่ผู้ดูเงินเดือน", FX(P8(p) || "ครบ (reportStaff · REST JSON/CSV · ใบเสร็จ · จอล็อก · ลิ้นชัก · จอลูกค้า)"));
  }
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสองร้าน + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG], [T2, T2_SLUG]] as const).filter(([id]) => id);
  const ok: string[] = [];
  for (const [id, slug] of targets) {
    try {
      const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, id)) as Any[];
      if (t.length && t[0].slug !== slug) rep.err = [rep.err, `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`].filter(Boolean).join(" · ");
      else ok.push(id);
    } catch (e) {
      rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    }
  }
  // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.5 fix3 N8): แถวสมมุติของ PY12 (tenantId หลวม · ไม่อยู่ในร้านชั่วคราว) — ลบเสมอแม้ข้อสอบล้มกลางทาง
  await P.$executeRawUnsafe(`DELETE FROM "PosStaffCommission" WHERE "sourceKey" LIKE $1`, `QCSWEEP:${RAND}:%`).catch(() => 0);
  if (ok.length) {
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    let pending = [...tables];
    for (let pass = 0; pass < 10 && pending.length; pass++) {
      const next: string[] = [];
      for (const tb of pending) {
        try {
          await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = ANY($1::text[])`, ok);
        } catch {
          next.push(tb);
        }
      }
      pending = next;
    }
    for (const [id, slug] of targets) {
      if (!ok.includes(id)) continue;
      try {
        await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, id, slug);
      } catch (e) {
        rep.err = [rep.err, `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
      }
    }
    for (const tb of tables) {
      try {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = ANY($1::text[])`, ok)) as Any[])[0]?.n ?? 0);
        if (n) rep.left[tb] = n;
      } catch {
        rep.left[tb] = -1;
      }
    }
    rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = ANY($1::text[])`, ok)) as Any[])[0]?.n ?? 0);
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  runStatic();
  await runPure();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${[T, T2].filter(Boolean).join(" + ") || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ร้าน QC ก่อน = หลัง (นับ + ลายนิ้วมือ)",
  fpDrift.length ? `ลายนิ้วมือ: ${fpDrift.join(", ")}` : `ลายนิ้วมือเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => (v.startsWith("err") ? `${k}=${v}` : `${k}=${v.split(":")[0]}`)).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · DB ids ${DB_IDS.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, crashed: !!crashed, missing: skipReasons, guardHits: guardHits.length, z: { fpDrift, tempLeft } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.5 S: ฝั่ง U ทั้งหมด (P3.5U) · รวม PIN HR↔POS (มติ 6 · W10) · ช่างต่อบรรทัด (มติ 1) · roster/สาขาของ HR (H1–H2) · labor % (H4.2) ·
// offboarding (H4.4) · กฎจุดผิดปกติของ override (P3.9) · ดูค่าคอมฯ ของตัวเอง (HR "ของฉัน") · ตัวเขียนค่าตั้ง (updatePos*Settings — ข้อสอบเขียน JSON ตรง)
