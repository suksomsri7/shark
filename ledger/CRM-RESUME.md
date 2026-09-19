# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อัปเดตทุกครั้งที่สถานะเปลี่ยน · อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: 19 ก.ย. 2569 ~10:40 น. (ไทย) · ผู้คุมงาน Opus 5 · branch `session/crm`
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → ท้าย `ledger/CRM-RUN.md` §4 → brief ของใบที่กำลังทำ (มี "Controller addendum" = ข้อตัดสินผูกพัน)

## 1. สถานะใบ (ความจริง = MASTER-PLAN §12)
- ✅ ขึ้น prod แล้ว: C0.1–C0.5 · C1.1–C1.7 · C1.8 (`526895b` · กำลัง poll deploy) (14/53)
- 🔨 **C1.9** (UI วัตถุกำหนดเอง): แก้ครบ · รวมเข้า tree หลักแล้ว · รอบตรวจ unit crm-c19-verify · ต้นทางใน worktree **`/root/projects/shark-crm-c19`** (ฐาน = HEAD + C1.8 ที่แก้แล้ว) · ใช้ **QC1** · ข้อสอบ `qc-crm-c1.9` 45 ข้อ
- 🔨 **C1.10** (REST 63 op + AI 14 tools): 66/66 บน QC2 · ผู้ตรวจกำลังอ่าน · รวมเข้า tree หลักด้วย patch เทียบ `526895b` (ฐาน C1.8) หลัง C1.9 commit · builder ใน **`/root/projects/shark-crm-c110`** · ใช้ **QC2** (ทุกคำสั่ง DB ผ่าน `scripts/qc2.sh`) · ข้อสอบ `qc-crm-c1.10` 66 ข้อ
- 📝 ข้อสอบพร้อม (commit แล้ว): C1.11 (66) · C2.0 (73) · C2.1 (84) · C2.2 (65)
- ⏸️ C1.11 builder เริ่มหลัง C1.9+C1.10 commit · C2.0 builder เริ่มหลังปิดเฟส C1 (migration แตะฐาน QC + Prisma client ที่ใช้ร่วม)

## 2. Worktree (ทุกตัว detached · node_modules = bind mount ของ tree หลัก)
| path | หน้าที่ | ฐาน QC |
|---|---|---|
| `/root/projects/shark-crm` | tree หลัก · ผู้คุมงานตรวจ/commit/push | QC1 |
| `/root/projects/shark-crm-c12a` | อดีตที่ทำ C1.8 (ตอนนี้ว่าง · มีสำเนา C1.8 ล่าสุด) | QC1 |
| `/root/projects/shark-crm-c19` | C1.9 builder | QC1 |
| `/root/projects/shark-crm-c110` | C1.10 builder | QC2 |
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
- C6: ชื่อร้านนำร่อง · "ทำ" สำหรับ backfill บน prod · crontab
