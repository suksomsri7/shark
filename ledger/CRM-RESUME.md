# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อัปเดตทุกครั้งที่สถานะเปลี่ยน · อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: 20 ก.ย. 2569 ~03:30 น. (ไทย) · ผู้คุมงาน Opus 5 · branch `session/crm` · ⏸️ **หยุดพักตามคำสั่งเจ้าของ (ลิมิตใกล้เต็ม) — ทุก agent ถูกหยุดแล้ว**
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → ท้าย `ledger/CRM-RUN.md` §4 → brief ของใบที่กำลังทำ (มี "Controller addendum" = ข้อตัดสินผูกพัน)


## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · 20 ก.ย.)
1. **C2.0 (tree หลัก staged · migration ลง QC1+QC2+QC3 แล้ว)**: ดูผล `.qc-shots/crm/c20-verify.log` (unit `crm-c20-verify` ปล่อยรันต่อจนจบเอง) · ถ้ายังไม่มี `ALLDONE` หรือ unit ตาย → รัน `systemd-run --unit=crm-c20-verify2 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root bash /root/projects/shark-crm/scripts/pending/run-c20-verify.sh` · เขียว (ยกเว้นข้อภาพ) → เขียน `ledger/wo-notes/crm-C2.0.md` · revert `scripts/*expected*.json` + `scripts/fixtures/` · **typecheck** · commit · push session/crm + main (prod รัน migrate deploy เอง — additive ล้วน อ่านครบแล้ว sha 33e25d71 / 2e86c0fa) · poll dpl · tg · memory
2. **C2.1** = commit local `827ecbdb` ใน `/root/projects/shark-crm-c20` (84/84 · probe 14/14 · ผู้ตรวจไม่มี BLOCKER · แก้ SF ครบ) → หลัง C2.0 commit: `git -C shark-crm-c20 diff --binary c98d0d80 827ecbdb -- . ':!scripts/*expected*.json' > /tmp/c21.patch` → `git apply --index -3` ใน tree หลัก → ตรวจเองบน QC1 (qc-crm-c2.1 · probe-c21-builder · qc-automation · k2.9 · journeys สมาชิก · c1.8/c1.11/c2.0/v1 · ประตู · typecheck · fitness×2 · build · ภาพ 2.1 · m1.9) → commit/push
3. **C2.2** (ถูกหยุดกลางงาน · QC2): งานค้าง uncommitted ใน `shark-crm-c20` บน 827ecbdb (15 ไฟล์) · spawn builder ใหม่พร้อม prompt เดิม + "ทำต่อจากสภาพไฟล์ปัจจุบัน (ล่าสุดกำลัง wire bridges index + consumers)"
4. **C2.3** (ถูกหยุดกลางงาน · **QC3**): งานค้าง uncommitted ใน `shark-crm-c23` บน 827ecbdb (9 ไฟล์) · spawn builder ใหม่ "ทำต่อจากสภาพไฟล์ (ล่าสุดกำลังแก้ 2 จุด)"
5. **ข้อสอบ C2.5 / C2.6** (ถูกหยุด · `shark-crm-c12a`): C2.6 เขียนเสร็จ parse ผ่านแล้ว รอ typecheck · C2.5 ค้างกลางทาง · spawn ผู้เขียนใหม่ "ทำต่อจากไฟล์ที่มี" → รับมติ → copy ไป tree หลัก commit
6. หลัง C2.1–C2.3 เข้า: ถัดไป C2.4 (ข้อสอบพร้อม · R2 = CRM_ASSIST) · C2.5 · C2.6 …
⚠️ ก่อน session ใหม่เริ่ม: `systemctl list-units | grep -E "iso-|crm-"` ต้องว่าง (ยกเว้น verify) · ล็อก `/tmp/shark-gate*.lock` ไม่มีใครถือ

## 1. สถานะใบ (ความจริง = MASTER-PLAN §12)
- ✅ ขึ้น prod แล้ว: C0.1–C0.5 · **เฟส C1 ครบ C1.1–C1.11** (C1.11 `02ba30bc` · dpl_AhGWw) (17/53)
- 📝 ข้อสอบพร้อม (commit แล้ว): C1.11 (66) · C2.0 (73) · C2.1 (84) · C2.2 (65)
- 🔨 **C2.0**: รวมเข้า tree หลักแล้ว (staged) · migration 2 ตัว **ลง QC1 + QC2 แล้ว** · client ของ tree หลัก generate แล้ว · unit `crm-c20-verify` (log `.qc-shots/crm/c20-verify.log`) · ผ่าน = commit + push (prod จะรัน migrate deploy เองใน vercel-build — additive ล้วน · ผู้คุมงานอ่านครบแล้ว)
- ✅(builder) **C2.1**: แก้ผู้ตรวจครบ 84/84 + probe 14/14 · commit local `827ecbdb` ใน c20 (ห้าม push) · รอรวมหลัง C2.0 commit
- 🔨 **C2.2** builder ใน `shark-crm-c20` (ต่อจาก 827ecbdb · uncommitted) · QC2
- 🔨 **C2.3** builder ใน **`/root/projects/shark-crm-c23`** (ฐาน 827ecbdb · node_modules = overlay `/root/projects/.ovl-c23`) · **QC3**
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
