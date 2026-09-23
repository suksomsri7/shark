# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อัปเดตทุกครั้งที่สถานะเปลี่ยน · อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: 23 ก.ย. 2569 · ผู้คุมงาน Opus 5 · branch `session/crm` · ▶️ **RUN กำลังเดิน**
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → ท้าย `ledger/CRM-RUN.md` §4 → brief ของใบที่กำลังทำ (มี "Controller addendum" = ข้อตัดสินผูกพัน)


## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · 23 ก.ย.)
1. **C2.1 รวมเข้าทรีหลัก** (ทำทันทีหลัง C2.0 push): `git -C /root/projects/shark-crm-c20 diff --binary c98d0d80 827ecbdb -- . ':!scripts/*expected*.json' > /tmp/c21.patch` → `git apply --index -3 /tmp/c21.patch` ในทรีหลัก → ผู้คุมงานตรวจเองบน QC1 (reseed → `qc-crm-c2.1` · `probe-c21-builder` · `qc-automation` · `qc-kanban-k2.9` · journeys สมาชิก · `qc-crm-c1.8`/`c1.11`/`c2.0`/`qc-crm-v1` · ประตู uiVersion · typecheck · fitness ×2 · build · ภาพ 2.1 · `qc-member-m1.9`) → wo-notes → MASTER-PLAN §12 → commit → push → poll dpl → tg
2. **C2.2** builder ทำงานอยู่ใน `/root/projects/shark-crm-c20` (ฐาน `827ecbdb` · QC2) — รอผล แล้ว spawn ผู้ตรวจอิสระอ่าน diff ก่อนผู้คุมงานตรวจเอง
3. **C2.3** builder ทำงานอยู่ใน `/root/projects/shark-crm-c23` (ฐาน `827ecbdb` · **QC3**) — เหมือนกัน
4. **ข้อสอบ C2.5 + C2.6** ผู้เขียนทำงานอยู่ใน `/root/projects/shark-crm-c12a` (ไม่แตะ DB) → รับมติ → copy ไปทรีหลัก commit
5. ถัดไปหลัง C2.2/C2.3 เข้า: **C2.4** (ข้อสอบพร้อม 78 ข้อ · R2 = `CRM_ASSIST` ซึ่ง C2.0 ลง enum ให้แล้ว) → C2.5 ∥ C2.6 → C2.7 … C2.11 → ปิดเฟส C2 ด้วย `qc:all` (ต้องส่ง DATABASE_URL/DIRECT_URL เข้าไปด้วย — ดู `scripts/pending/run-c1-qcall.sh`)
⚠️ ก่อน session ใหม่เริ่ม: `systemctl list-units | grep -E "iso-|crm-"` ต้องว่าง · ล็อก `/tmp/shark-gate*.lock` ไม่มีใครถือ
🔴 `.qc-shots/member` + `.qc-shots/kanban` ถูกลบตอนเคลียร์ดิสก์ ⇒ ข้อ "ภาพ …" ของชุดสมาชิก/บอร์ดงานจะแดงเสมอ = **คลาส E** (`ledger/crm-c1-close-reds.md`) ไม่ใช่บั๊กของใบที่กำลังทำ

## 1. สถานะใบ (ความจริง = MASTER-PLAN §12)
- ✅ ขึ้น prod แล้ว: C0.1–C0.5 · **เฟส C1 ครบ C1.1–C1.11** · **C2.0** (18/53)
- 📝 ข้อสอบพร้อม (commit แล้ว): C2.0 (73) · C2.1 (84) · C2.2 (65) · C2.3 (60) · C2.4 (78)
- ✅(builder) **C2.1**: 84/84 + probe 14/14 · ผู้ตรวจไม่มี BLOCKER · commit local `827ecbdb` ใน `shark-crm-c20` (**ห้าม push commit local**) · รอผู้คุมงานรวม+ตรวจเอง
- 🔨 **C2.2** builder ใน `shark-crm-c20` (ต่อจาก `827ecbdb` · QC2)
- 🔨 **C2.3** builder ใน `/root/projects/shark-crm-c23` (ฐาน `827ecbdb` · QC3 · node_modules = overlay `/root/projects/.ovl-c23`)
- 🔨 ข้อสอบ **C2.5 + C2.6** ใน `/root/projects/shark-crm-c12a`

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

## 3. ฐาน QC สามตัว
- QC1 = `ep-plain-art…` (`.env.qc`) · QC2 = `wo-crm-qc2` `ep-cool-shadow…` (`.env.qc2`, แตกจาก QC1 · ไม่ใช่ prod)
- QC3 = `wo-crm-qc3` `br-bold-cherry-aox2mvxk` `ep-weathered-river…` (`.env.qc3`, แตกจาก QC2 20 ก.ย. · มี C2.0 แล้ว) · `scripts/qc3.sh` · ล็อก `/tmp/shark-gate-qc3.lock` · ลบตอน C6.4
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
