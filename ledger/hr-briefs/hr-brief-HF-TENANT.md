# HF-TENANT — พอร์ตตัวตรวจ "ระบบ HR เป็นของร้านผู้เรียก" กลับไป `main` (hotfix แยก)

สถานะ: ร่างออกแบบ 17 พ.ย. 2026 (อ่านโค้ดอย่างเดียว ยังไม่ได้รันอะไร) · เจ้าของอนุมัติให้ทำ hotfix แยกแล้ว · **ต้องขอ GO เจ้าของก่อน push main / deploy / migration บน prod**
เลขบรรทัด = `origin/main` bda823d22 ยกเว้นระบุ "V2" (= `session/hr` ในเครื่อง)

## 0. main ต่างจากที่ RESUME จดไว้
- โมเดลอยู่ `prisma/schema/payroll.prisma` (HrSalaryProfile :55-70 · HrPayrollRun :72-94) และ `prisma/schema/hr.prisma` (HrEmployee :66) — ไม่มี `prisma/schema.prisma`
- "8 ปุ่มเงินเดือน + 4 ปุ่มพนักงาน" ตรงจริง · ไฟล์ปุ่มเงินเดือน V2 อีก 7 ไฟล์ + `createPayrollRunV2Action` `reverseRunV2Action` `payTarget` `hrTarget` `hrHomeTarget` `HrBranchError` `LIFE_TEXT` `assertRunAllBranches` ไม่มีบน main
- main ไม่มีคำปฏิเสธ "ไม่รู้จักระบบ" — รหัสระบบที่ไม่มีจริงถูกปฏิบัติเหมือนของร้านอื่น (เขียนแถว + audit) → "ตอบเหมือนไม่รู้จัก" เป็นพฤติกรรมใหม่ทั้งสองกรณี
- ปุ่มฟอร์มเงินเดือน 5 ตัว + ปุ่มพนักงาน 4 ตัวคืน `void` → ตัวตรวจ = `return;`
- `createEmployee` เขียน `Party` ก่อน (`service.ts:36`) → เรียกข้ามร้านวันนี้ได้ 2 แถว
- `scripts/vercel-build.sh:20-24` รัน `prisma migrate deploy` ก่อน `next build` → migration กับโค้ดขึ้นใน push เดียว · หัวไฟล์บอกว่า migration ต้อง additive — hotfix นี้ drop ดัชนี 2 ตัว (ปลอดภัยกับโค้ดเก่า แต่เป็นข้อยกเว้นที่ต้องระบุ)
- `session/hr` ยังไม่ได้รวม main ล่าสุด (merge-base 4d6ef6ee7 · migration `20261228000300…001000` ของ main ยังไม่อยู่ใน session/hr)

## 1. ปุ่มบน main ที่รับรหัสจากผู้เรียกโดยไม่ตรวจความเป็นเจ้าของ
`tenantId` มาจาก session · `systemId` มาจากฟอร์ม/อาร์กิวเมนต์ · `tenantDb(ctx)` กรอง `(tenantId, systemId)` แต่ไม่ตรวจว่าระบบเป็นของร้านนั้นหรือเป็นชนิด HR
ตัวตรวจทุกแถว: `if (!(await hrTargetOwned({ tenantId: auth.active.tenantId, systemId }, <ids>))) return <คำปฏิเสธ>;`

### `src/lib/modules/hr/payroll-actions.ts`
| # | ปุ่ม (บรรทัด) | วันนี้ข้ามร้านแล้วเกิดอะไร | แทรกหลัง | ids / คำปฏิเสธ |
|---|---|---|---|---|
| P1 | `setSalaryProfileAction` :39-60 | สร้าง `HrSalaryProfile` (ร้านผู้เรียก · ระบบร้านอื่น · employee ใดก็ได้) · ถ้าเหยื่อมีโปรไฟล์แล้ว → P2002 (บอกว่ามีอยู่) · ถ้ายังไม่มี → จองกุญแจ เหยื่อสร้างทีหลังไม่ได้ | :45 | `{ employeeId }` / `return;` |
| P2 | `createPayrollRunAction` :63-74 | หลัง P1 จองโปรไฟล์ → สร้าง `HrPayrollRun` + items บนระบบเหยื่อ · unique เต็ม `(systemId, periodKey)` กันเหยื่อสร้างรอบงวดนั้น | :69 | – / `return;` |
| P3 | `approvePayrollRunAction` :77-94 | `writeAudit` :85-92 ไม่มีเงื่อนไข (`hr.payroll.approve` + runId ร้านอื่น) | :82 | – / `return;` |
| P4 | `reverseRunAction` :98-116 | `writeAudit` :107-114 ไม่มีเงื่อนไข | :103 | – / `return;` |
| P5 | `markPaidAction` :119-136 | `writeAudit` :127-134 ไม่มีเงื่อนไข · มีรอบจอง → ส่ง `hr.payroll.paid` ออก outbox พร้อมรหัสระบบร้านอื่น (`payroll.ts:582-588`) | :124 | – / `return;` |
| P6 | `requestAdjustmentAction` :159-196 | ถูกปฏิเสธเพราะค้นพนักงานไม่เจอ (`payroll.ts:130`) · มีพนักงานปลอมจาก E1 → สร้าง `HrPayAdjustment` บนระบบร้านอื่น | :171 | – / `return { status: "error", message: "ไม่พบพนักงาน" };` |
| P7 | `decideAdjustmentAction` :202-232 | "ไม่พบรายการ" (`payroll.ts:170`) · ถึงได้ผ่านแถวปลอมเท่านั้น | :209 | – / `return { ok: false, reason: "ไม่พบรายการ" };` |
| P8 | `cancelAdjustmentAction` :234-249 | เหมือน P7 (`payroll.ts:265`) | :239 | – / เหมือน P7 |

### `src/lib/modules/hr/actions.ts`
| # | ปุ่ม (บรรทัด) | วันนี้ข้ามร้าน | แทรกหลัง | คำปฏิเสธ |
|---|---|---|---|---|
| E1 | `createEmployeeAction` :45-59 | สร้าง `Party` + `HrEmployee` (ร้านผู้เรียก · ระบบร้านอื่น) → พนักงานปลอมผ่านด่าน "หาเจอ" ของปุ่มอื่นทั้งหมด | :50 | `return;` |
| E2 | `updateEmployeeAction` :75-88 | เขียนได้บนพนักงานปลอมจาก E1 | :81 | `return;` |
| E3 | `removeEmployeeAction` :91-99 | เหมือน E2 | :96 | `return;` |
| E4 | `restoreEmployeeAction` :101-109 | เหมือน E2 | :106 | `return;` |

หมายเหตุออกแบบ
- P3–P5 ตรวจระบบอย่างเดียว (ตามคำตัดสิน V2): รอบที่ไม่มีในระบบของตัวเองยังเขียน audit การปฏิเสธเหมือนเดิม
- P1 เปลี่ยนพฤติกรรมในร้านเดียวกันโดยตั้งใจ: ระบบตัวเอง + employee ไม่มีจริง วันนี้สร้างโปรไฟล์กำพร้า → หลังแก้ถูกปฏิเสธ (เหมือน V2)
- P6: บน main คำตอบผ่าน `adjustmentReplyForViewer` (:193) — ยังไม่ได้อ่านกิ่งผู้ไม่มีสิทธิ์เงินเดือน (`privacy.ts:201+`) · ถ้ามันแก้ข้อความ ให้คืนผ่านฟังก์ชันนั้นก่อน :180 แทน

**ผู้คุมตัดสิน (17 พ.ย.):** `clockAction` :62-72 และ `requestLeaveAction` :227-246 (เขียนแถวขยะในร้านผู้เรียกเองสำหรับรหัสระบบใดก็ได้ · ไม่มีกุญแจ unique · ไม่กระทบเหยื่อ) → **ใส่ตัวตรวจระบบอย่างเดียวด้วย** (บรรทัดเดียวต่อปุ่ม · ปิดช่องเดียวกันครบในรอบเดียว) รวมเป็น 14 ปุ่ม

## 2. พอร์ต `hr-target.ts`
- คัดลอก `src/lib/modules/hr/hr-target.ts` ของ V2 (17 บรรทัด) **ทุกตัวอักษร** (แก้แม้คอมเมนต์ = ชน add/add ตอน session/hr รวม main)
- ไม่พึ่งโค้ดเฉพาะ V2 · import แค่ `tenantDb` · โมเดลที่แตะลงทะเบียนบน main แล้ว (`scope.ts`: AppSystem :315 · HrEmployee :178 · HrPayrollRun :269 · HrPayAdjustment :271)
- ห้ามมี `"use server"` และห้าม re-export จากไฟล์ปุ่ม
- import เพิ่ม: `payroll-actions.ts` หลัง :21 · `actions.ts` หลัง :24
- ตอน merge กลับ: 12–14 จุดจะชนใน session/hr → เลือกฝั่ง V2 เสมอ
- ยังไม่ตรวจ: fitness ของ main นับไฟล์ใหม่ใน `hr/` ไหม → รัน `fitness*` หลังเพิ่มไฟล์

## 3. Migration ของ hotfix (main)
ดัชนีเดิม (จาก `20260716150542_payroll`): `HrSalaryProfile_systemId_employeeId_key` · `HrPayrollRun_systemId_periodKey_key` (unique เต็ม · main ไม่มี partial / ไม่มี `reversedAt`)
schema: `payroll.prisma:68` → `@@unique([tenantId, systemId, employeeId])` · `:92` → `@@unique([tenantId, systemId, periodKey])`
โฟลเดอร์ใหม่ `prisma/migrations/20261229000000_hr_hf_tenant_unique_keys/migration.sql`

```sql
-- HF-TENANT: unique keys of HrSalaryProfile / HrPayrollRun become tenant-scoped. Index statements only.
-- Create-before-drop; idempotent; no-op on databases that already carry the HR V2 indexes.

CREATE UNIQUE INDEX IF NOT EXISTS "HrSalaryProfile_tenantId_systemId_employeeId_key"
  ON "HrSalaryProfile"("tenantId", "systemId", "employeeId");
DROP INDEX IF EXISTS "HrSalaryProfile_systemId_employeeId_key";

-- Only where main's FULL unique still exists (= V2's 20261202000000 has not run).
-- On a V2 database a full unique would break "re-run after REVERSED".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname = current_schema() AND tablename = 'HrPayrollRun'
               AND indexname = 'HrPayrollRun_systemId_periodKey_key') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "HrPayrollRun_tenantId_systemId_periodKey_key"
      ON "HrPayrollRun"("tenantId", "systemId", "periodKey");
    DROP INDEX "HrPayrollRun_systemId_periodKey_key";
  END IF;
END $$;
```

- ข้อมูลซ้ำทำให้สร้างดัชนีใหม่พังไหม: ไม่ — กุญแจใหม่ = กุญแจเดิม + `tenantId` นำหน้า
- ล็อก: `CREATE UNIQUE INDEX` บล็อกการเขียนชั่วครู่ (ตารางเล็ก) · `DROP INDEX` ต้องล็อก exclusive สั้น ๆ — ความเสี่ยงจริงคือรอคิวหลังธุรกรรมเงินเดือนยาว (สูงสุด 30 วิ) → ทำนอกเวลาทำเงินเดือน · `SET lock_timeout = '5s'` ยังไม่ได้ยืนยันกับ Prisma

ตรวจก่อนบน prod (อ่านอย่างเดียว · ชื่อตาราง `AppSystem`/`AuditLog` ต้องเทียบ schema ก่อนรัน)
```sql
-- A. ดัชนีเดิมมีและ valid (คาด 2 แถว indisvalid = t)
SELECT c.relname, i.indisvalid, pg_get_indexdef(i.indexrelid)
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname IN ('HrSalaryProfile_systemId_employeeId_key','HrPayrollRun_systemId_periodKey_key');
-- B. ซ้ำภายใต้กุญแจใหม่ (คาด 0)
SELECT "tenantId","systemId","employeeId",count(*) FROM "HrSalaryProfile" GROUP BY 1,2,3 HAVING count(*)>1;
SELECT "tenantId","systemId","periodKey",count(*)  FROM "HrPayrollRun"    GROUP BY 1,2,3 HAVING count(*)>1;
-- C. ขนาด
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('HrSalaryProfile','HrPayrollRun');
-- D. ร่องรอยการถูกใช้ช่องโหว่: แถวที่ระบบหาย / ไม่ใช่ HR / เป็นของร้านอื่น (ทำซ้ำกับ HrPayrollRun, HrPayrollItem, HrEmployee, HrPayAdjustment, HrAttendance, HrLeave)
SELECT p.id, p."tenantId", p."systemId", s."tenantId" AS system_tenant, s.type::text
FROM "HrSalaryProfile" p LEFT JOIN "AppSystem" s ON s.id = p."systemId"
WHERE s.id IS NULL OR s."tenantId" <> p."tenantId" OR s.type::text <> 'HR';
-- E. audit ของรอบที่ไม่ใช่ของร้านตัวเอง (จะรวมกรณีสุจริต เช่น audit ของรอบที่ลบแล้ว)
SELECT a.id, a."tenantId", a.action, a."targetId", a."createdAt"
FROM "AuditLog" a LEFT JOIN "HrPayrollRun" r ON r.id = a."targetId" AND r."tenantId" = a."tenantId"
WHERE a."targetType" = 'HrPayrollRun'
  AND a.action IN ('hr.payroll.approve','hr.payroll.reverse','hr.payroll.pay') AND r.id IS NULL;
```
แถวจาก D ไม่ขวาง migration — เป็นหลักฐานให้เจ้าของตัดสิน · hotfix ไม่ลบอะไร

## 4. แก้ migration ของ V2 ตาม (บน `session/hr`)
`20261202000000_hr_payroll_run_live_unique/migration.sql` บรรทัด 13 →
```sql
-- DropIndex (HF-TENANT: prod has the hotfix index instead of the original one)
DROP INDEX IF EXISTS "HrPayrollRun_systemId_periodKey_key";
DROP INDEX IF EXISTS "HrPayrollRun_tenantId_systemId_periodKey_key";
```
(บรรทัด 9-10, 16-19 ไม่แตะ · h0.6 S8.3 รับ `IF EXISTS` อยู่แล้ว)

`20270112000000_hr_tenant_scoped_unique_keys/migration.sql`
```sql
-- line 10
CREATE UNIQUE INDEX IF NOT EXISTS "HrSalaryProfile_tenantId_systemId_employeeId_key" ON "HrSalaryProfile"("tenantId", "systemId", "employeeId");
-- line 14
CREATE UNIQUE INDEX IF NOT EXISTS "HrPayrollRun_tenantId_systemId_periodKey_live_key" ON "HrPayrollRun"("tenantId", "systemId", "periodKey") WHERE "status" <> 'REVERSED';
-- after line 15
DROP INDEX IF EXISTS "HrPayrollRun_tenantId_systemId_periodKey_key";
```
⚠ priv-3 S6 ตรึงเนื้อหา migration 20270112 ไว้ที่ 95fb5ad171abc2e3 (แก้ 17 พ.ย.) → การแก้นี้ต้อง ORACLE-EDIT ค่าตรึงตาม

| ฐาน | ลำดับ | ผล |
|---|---|---|
| prod (ลง hotfix แล้ว) | 20261202 ถอด unique เต็มของ hotfix + สร้าง live partial · 20270112 ข้ามโปรไฟล์ + สลับกุญแจรอบ | สถานะปลาย V2 |
| ฐานใหม่ | 20261202 เดิม · hotfix สลับโปรไฟล์ บล็อกรอบ = no-op · 20270112 ข้ามโปรไฟล์ | สถานะปลาย V2 |
| เลน 1, 3/4, QC4 | hotfix สลับโปรไฟล์อย่างเดียว · 20270112 ข้าม | สถานะปลาย V2 |
| เลน 2/5 | hotfix = no-op | เดิม |
(17 พ.ย.: เลน 1, 3/4 ลง 20270112 แล้ว · QC4 กำลังลงในรอบถ่ายภาพ r4 → ทุกฐานจะเป็นกรณี "no-op")

ความเสี่ยงค้าง
- ดัชนี live ข้ามร้านชั่วคราวบน prod ระหว่าง 20261202 → 20270112: พังเฉพาะเมื่อสองร้านมีรอบ live ของระบบ+งวดเดียวกัน (ต้องมีรอบจองก่อน hotfix) → ก่อน deploy V2 รัน
  `SELECT "systemId","periodKey",count(*) FROM "HrPayrollRun" WHERE status <> 'REVERSED' GROUP BY 1,2 HAVING count(*)>1;`
- priv-3 S6 อาจนับโฟลเดอร์ hotfix เป็น migration ใหม่ตัวที่สองหลังรวม main → ORACLE-EDIT
- `payroll.prisma` จะชนที่ `@@unique` สองบรรทัด → เลือก V2

## 5. แผนทดสอบ `scripts/qc-hr-hf-tenant.mts` (ฐาน main)
- เครื่องมือ: พอร์ต `inScope` (~10 บรรทัด) จาก V2 `scripts/qc-hr-priv-3-lib.mts:127-133` + `scripts/qc-env-guard.mts` ของ main
- ข้อมูล: ร้าน A (เหยื่อ: ระบบ SA · eA1 มีโปรไฟล์ · eA2 ไม่มี · รอบ rA1 DRAFT, rA2 APPROVED · รายการปรับรอ 1) · ร้าน B (ผู้โจมตี: OWNER XO · STAFF XP ถือ `hr.payroll.*` `hr.payadjust.*` `hr.employee.create` · ระบบ SB · ระบบไม่ใช่ HR SN) · U = รหัสระบบรูปถูกแต่ไม่มีจริง · แถวตกค้างจำลองการถูกโจมตีในอดีต (โปรไฟล์ (B,SA,eA2) · รอบ (B,SA,P2) · พนักงาน (B,SA))
- ภาพถ่ายก่อน/หลังทุกครั้ง: แถวต่อร้านของ HrSalaryProfile, HrPayrollRun, HrPayrollItem, HrPayAdjustment, HrEmployee, Party, HrAttendance, HrLeave, AuditLog, OutboxEvent + นับ `systemId = SA AND tenantId <> A`
- แดงบน main วันนี้: T1 setSalaryProfile (XO, XP × SA{ไม่มี emp, eA2, eA1} / U / SN) ไม่เขียนอะไร · T2 createPayrollRun (มีโปรไฟล์ตกค้าง) ไม่มีรอบ/items · T3 approve/reverse/markPaid ไม่มี AuditLog/outbox · T4 request/decide/cancel adjustment ไม่เขียน/ไม่ลบ คำตอบ = ของ U · T5 พนักงาน 4 ปุ่ม ไม่มี HrEmployee/Party · T6 ผลของ SA = U = SN ทุกปุ่ม · T7 static: ทุกปุ่มเรียก `hrTargetOwned` ก่อน await อื่น (ยกเว้น `requireTenant`) · `hr-target.ts` ไม่มี `"use server"` · sha = ไฟล์ V2 · **T8 (เพิ่มตามคำตัดสิน): clock + requestLeave บน SA/U/SN ไม่เขียน HrAttendance/HrLeave**
- เขียวทั้งก่อนและหลัง: C1 เจ้าของ A + พนักงานเงินเดือน A ขับทุกปุ่มด้วยฟอร์มครบ ถึงการเขียนจริง (บทเรียน R11) · C2 ระบบตัวเอง + runId ไม่มี ยังเขียน audit ปฏิเสธ · C3 ระบบตัวเอง + employee ไม่มี บน set-profile ไม่เขียน (เปลี่ยนโดยตั้งใจ → แดงก่อน)
- ฐาน: M1 ชื่อ/นิยามดัชนีใหม่ ไม่มีชื่อเก่า · M2 มีแถวตกค้างแล้วเจ้าของ A ยังสร้างโปรไฟล์ eA2 + รอบ P2 ได้ (แดงก่อน migration) · M3 ซ้ำในร้าน A ยัง P2002 · M4 แถวตกค้างไม่เปลี่ยน · M5 `pnpm drift` = 0
- **ฐานที่ใช้:** ใช้ฐานเลน/QC4 ไม่ได้ (มี schema V2 · บล็อกรอบของ hotfix เป็น no-op) → Neon branch ว่างใหม่ migrate จากศูนย์ด้วย `prisma migrate deploy` จากทรี hotfix · ข้อสอบปฏิเสธถ้ามีคอลัมน์ `HrPayrollRun.reversedAt`
- ผู้คุมจัดให้: (1) ทรีจาก `origin/main` สาขา `hotfix/hr-hf-tenant` (2) Neon branch ว่าง + `.env.qc-hf` (3) `scripts/qc-hf.sh` (คัดจาก `qc4.sh` · ตรึง host ใหม่ · ปฏิเสธ host prod · gate lock ของตัวเอง) (4) branch ที่สองสำหรับซ้อม migration
- ซ้อม migration (ผู้คุม): R1 ลูกโซ่ main → ลงแถวตกค้าง → hotfix (M2 ก่อน/หลังจริง) · R2 บนฐานนั้น `migrate deploy` จาก session/hr (รวม main + แก้ข้อ 4) แล้วรัน h0.6 S2.4 / h1.3 S1.10 / 3b M1, X6–X8 · R3 ลูกโซ่ session/hr เต็มบนฐานว่าง · R4 `migrate deploy` บนฐานเลน · ไม่ทำ: branch จาก prod (มีข้อมูลส่วนบุคคล — ต้อง GO เจ้าของ)

## 6. ลำดับขึ้นจริง + ถอย
ลำดับ migration/โค้ดปลอดภัยทั้งสองทาง → push เดียวพอ
1. ด่าน: ข้อสอบเขียวบนฐาน hotfix · R1–R4 เขียว · ชุด HR ของ main (`qc-hr*` `qc-payroll*` `qc-hf-hr-privacy`) + tsc + fitness เขียว · ผู้ตรวจผ่าน · **GO เจ้าของ**
2. ตรวจก่อน: รัน SQL ข้อ 3 บน prod เก็บผล · หยุดถ้า A ไม่ใช่ 2 แถว valid หรือ B ไม่ว่าง · รายงาน D, E ให้เจ้าของ
3. ขึ้น: นอกเวลาทำเงินเดือน merge เข้า `main`
4. ตรวจหลัง: ดัชนีตาม M1 · แถว `_prisma_migrations` จบ · เจ้าของจริงเปิดหน้าเงินเดือน + บันทึกโปรไฟล์เดิมซ้ำ (ไม่สร้างรอบ)
5. ก่อน V2 ขึ้น prod: รวม main เข้า session/hr + แก้ข้อ 4 + `migrate deploy` ทุกฐาน + รัน h0.6, h1.3, priv-3, priv-3b ซ้ำ

ถอย: โค้ด = Vercel instant rollback (ปล่อยดัชนีไว้ โค้ดเก่าใช้ได้) · migration พังตอน build = deployment เดิมยังให้บริการ → `prisma migrate resolve --rolled-back 20261229000000_hr_hf_tenant_unique_keys` + ตรวจดัชนีด้วยมือ (แถวที่พังจะขวาง deploy ถัดไปทั้งหมดจนกว่าจะ resolve) · ถอนดัชนี = ไม่แนะนำ

## ยังไม่ได้ยืนยัน
วิธีที่ Prisma รันไฟล์ migration (ธุรกรรมเดียว?) + `SET lock_timeout` · ชื่อตารางจริงของ `AppSystem`/`AuditLog` · กิ่งผู้ไม่มีสิทธิ์เงินเดือนของ `adjustmentReplyForViewer` (P6) · fitness ของ main กับไฟล์ใหม่ใน `hr/` · `newMigs()` / `LAST_HR_MIG` ของ priv-3 S6 หลังรวม main · เลขเวลา migration ชนกับสาขา session อื่นไหม · Next internals ที่ `inScope` ใช้ตรงกับ main ไหม
