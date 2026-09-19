# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อัปเดตทุกครั้งที่สถานะเปลี่ยน · อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: 20 ก.ย. 2569 ~00:30 น. (ไทย) · ผู้คุมงาน Opus 5 · branch `session/crm`
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → ท้าย `ledger/CRM-RUN.md` §4 → brief ของใบที่กำลังทำ (มี "Controller addendum" = ข้อตัดสินผูกพัน)

## 1. สถานะใบ (ความจริง = MASTER-PLAN §12)
- ✅ ขึ้น prod แล้ว: C0.1–C0.5 · C1.1–C1.9 · C1.10 (`41c8d2a0` · dpl_57Wdn) (16/53)
- 📝 ข้อสอบพร้อม (commit แล้ว): C1.11 (66) · C2.0 (73) · C2.1 (84) · C2.2 (65)
- 🔨 **C1.11**: รวมใน tree หลักแล้ว (staged) · ตรวจเดี่ยวผ่านครบ · qc:all 305/345 · รันเดี่ยวซ้ำแล้วยังแดง 39 ชุด (`c1-reds.log`) — ส่วนใหญ่อ่านภาพ `.qc-shots/member|kanban` ที่ถูกลบ / ไฟล์สกิล `.claude/skills` (gitignore) ที่ worktree ไม่มี · **debugger กำลังจำแนก E/R** → ผลที่ `ledger/crm-c1-close-reds.md` · ⚠️ acc-v2-security S5 (บันทึกชำระจาก webhook ไม่สำเร็จ) อาจเป็นบั๊กจริงจาก C1.x
- ✅(builder) **C2.0** เสร็จบน QC2 · ใน `/root/projects/shark-crm-c20` เป็น **commit local (ห้าม push)**: `da4a43a2` = C1.11 · `c98d0d80` = C2.0 · migration 2 ตัวลง QC2 แล้ว QC1 ยังไม่ลง
- 🔨 **C2.1** builder ทำต่อใน `shark-crm-c20` (ต่อจาก c98d0d80 · งาน C2.1 = uncommitted) · QC2
- 📝 ข้อสอบ C2.3 (60) + C2.4 (78) commit แล้ว `e8f25aca` (R2 ของ C2.4 → เครดิต CRM_ASSIST)

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
- C6: ชื่อร้านนำร่อง · "ทำ" สำหรับ backfill บน prod · crontab
