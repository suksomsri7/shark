# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อัปเดตทุกครั้งที่สถานะเปลี่ยน · อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: 20 ก.ย. 2569 ~02:30 น. (ไทย) · ผู้คุมงาน Opus 5 · branch `session/crm`
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → ท้าย `ledger/CRM-RUN.md` §4 → brief ของใบที่กำลังทำ (มี "Controller addendum" = ข้อตัดสินผูกพัน)

## 1. สถานะใบ (ความจริง = MASTER-PLAN §12)
- ✅ ขึ้น prod แล้ว: C0.1–C0.5 · **เฟส C1 ครบ C1.1–C1.11** (C1.11 `02ba30bc` · dpl_AhGWw) (17/53)
- 📝 ข้อสอบพร้อม (commit แล้ว): C1.11 (66) · C2.0 (73) · C2.1 (84) · C2.2 (65)
- 🔨 **C2.0**: รวมเข้า tree หลักแล้ว (staged) · migration 2 ตัว **ลง QC1 + QC2 แล้ว** · client ของ tree หลัก generate แล้ว · unit `crm-c20-verify` (log `.qc-shots/crm/c20-verify.log`) · ผ่าน = commit + push (prod จะรัน migrate deploy เองใน vercel-build — additive ล้วน · ผู้คุมงานอ่านครบแล้ว)
- 🔨 **C2.1** builder ทำต่อใน `shark-crm-c20` (ต่อจาก c98d0d80 · งาน C2.1 = uncommitted) · QC2
- 📝 ข้อสอบ C2.3 (60) + C2.4 (78) commit แล้ว · ผู้เขียนข้อสอบ C2.5 + C2.6 ทำงานใน `/root/projects/shark-crm-c12a` (ฐาน 02ba30bc · อ่านสคีมา C2.0 จาก c20)

## 2. Worktree (ทุกตัว detached · node_modules = bind mount ของ tree หลัก)
| path | หน้าที่ | ฐาน QC |
|---|---|---|
| `/root/projects/shark-crm` | tree หลัก · ผู้คุมงานตรวจ/commit/push | QC1 |
| `/root/projects/shark-crm-c12a` | ผู้เขียนข้อสอบ C2.3/C2.4 | ไม่ใช้ DB |
| `/root/projects/shark-crm-c20` | C2.0 builder (node_modules = overlay) | QC2 |
| `/root/projects/shark-crm-c19` | อดีต C1.9 (commit แล้ว · มีไฟล์ค้างไม่ต้องใช้) | QC1 |
| `/root/projects/shark-crm-c111` | C1.11 builder | QC2 |
| `/root/projects/shark-crm-c110` | อดีต C1.10 (ว่าง) | QC2 |
🔴 ก่อนลบ worktree ใด: `umount <wt>/node_modules` แล้วเช็คว่าว่าง แล้ว `rmdir` ก่อน `git worktree remove` (ไม่งั้นลบ node_modules ของจริง)
🔴 agent ตายไปกับ session แต่ไฟล์ใน worktree ยังอยู่ — session ใหม่: `git -C <wt> status` ดูงานค้าง แล้ว spawn builder ใหม่ให้ "ทำต่อจากสภาพไฟล์ปัจจุบัน" พร้อม brief + addendum

## 3. ฐาน QC สองตัว
- QC1 = `ep-plain-art…` (`.env.qc`) · QC2 = `wo-crm-qc2` `ep-cool-shadow…` (`.env.qc2`, แตกจาก QC1 · ไม่ใช่ prod)
- `scripts/qc2.sh <cmd>` = ไป QC2 + ล็อก `/tmp/shark-gate-qc2.lock` · typecheck/build/serve ใช้ล็อกเครื่องเดียวเสมอ
- แต่ละ worktree ผูก branch เดียว · expected.json มาจากการ seed branch นั้น · ลบ QC2 ตอน C6.4

## 4. กติกาที่เพิ่มระหว่าง RUN (ผูกพันทุกใบ)
- ข้อสอบ/ด่าน D7 ทุกใบต้องมีกรณี **ร้าน uiVersion 1** (ทุกร้านบน prod เป็น 1) · หน้า v1 ต้องเหมือนเดิมทุกไบต์
- migration ห้ามมีคำสั่งที่ล้มได้กับข้อมูล prod เดิม (UNIQUE/NOT NULL/FK บนแถวเดิม → C6.1)
- ก่อน spawn agent: `cd` tree ที่ถูก + บอก path เต็มในคำสั่ง (agent รับ cwd)
- เจอแดงแปลก: เก็บ snapshot ข้อมูลก่อน reseed
- สวิตช์ v1↔v2 (C1.11) ซ่อนจากร้านจริงโดยปริยาย (`CRM_V2_SWITCH_TENANTS` / `CRM_V2_SWITCH`)

## 5. เรื่องรอเจ้าของ
- `ledger/CRM-OWNER-QUESTIONS.md` (Q5 rehearsal · Q6 payload webhook ดีลชนะ — ค่าเริ่มต้นเดินหน้า)
- ดิสก์ VPS (ตอนนี้ว่าง ~16 GB — มีคนเคลียร์แล้ว)
- เช็ค prod `/api/health` outboxPending (หลัง C1.8 ค้าง 1 นาน 30 นาที · 19 ก.ย. 04:51 UTC) — ถ้ายัง ≥1 วันถัดไป แจ้งเจ้าของ
- 🔴 ห้ามเปิด CRM v2 ให้ร้านนำร่องก่อน C6.1 ติด crontab รายชั่วโมง/รายวัน (กฎ C2.1 ขั้นรอ/ตามเวลาจะไม่ทำงาน)
- C6: ชื่อร้านนำร่อง · "ทำ" สำหรับ backfill บน prod · crontab
