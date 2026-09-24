# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: **24 ก.ย. 2569 ~01:30 (ไทย)** · ผู้คุมงาน Opus 5 · branch `session/crm` · ⏸️ **หยุดพักตามคำสั่งเจ้าของ**
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → **ท้าย `ledger/CRM-RUN.md` §4 (บันทึก 23–24 ก.ย. สำคัญมาก)** → brief ของใบที่ทำ (มี "Controller ruling/addendum" = ผูกพัน)

## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · ทำตามลำดับ)

### 0.1 เช็กสภาพเครื่องก่อน
- `systemctl list-units --all | grep -E "iso-|crm-" | grep -v mount` — ถ้ามี **`crm-c21-verify3`** ยัง active = **ปล่อยให้จบ** (unit `--collect` รอดจาก session ตาย) · ห้าม stop กลาง suite
- ผลอยู่ที่ `.qc-shots/crm/c21-verify3.log` · ดูด้วย
  `awk '/^== /{n=$0} /^exit=/{print n" -> "$0}' .qc-shots/crm/c21-verify3.log` และ `grep JSON_SUMMARY`
- `ls /tmp/shark-gate*.lock` + `fuser /tmp/shark-gate.lock` ต้องไม่มีใครถือ

### 0.2 ปิดใบ C2.1 (เหลือแค่ตรวจผล + commit + push)
งานทั้งหมดของ C2.1 **อยู่ในทรีหลักแล้ว** (apply จาก `shark-crm-c20` `c98d0d80..827ecbdb` เรียบร้อย · staged) พร้อม ACCEPTANCE-FIX เมนู + ORACLE-EDIT 3 ใบ
1. อ่าน `c21-verify3.log` ให้ครบ · ที่ต้องเขียว: `qc-crm-c2.1` **84/84** · `probe-c21-builder` · `qc-automation` · `qc-kanban-k2.9` (ยอมให้ `K2.9-S11.7` แดง = ข้อภาพ คลาส E) · `qc-member-fix-s2/s3` · `qc-crm-c1.8` · `qc-crm-c1.11` · **`qc-crm-c2.0` 73/73** · `qc-crm-v1` 17/17 · `qc-crm-c0.2` **26/27** (`C0.2-S3.6` MINOR = 0 ผู้ติดต่อ CRM ที่มี partyId · ข้อนี้แดงมาก่อน C2.1 ตรวจแล้วไม่ใช่ของใบนี้) · `qc-nav-functions` **11/11** · `probe-uiversion-gate` 14/14 · typecheck · fitness ×2 · build · **ภาพ 2.1** · `qc-member-m1.9` 26/26
2. **ก่อน commit: `git checkout -- scripts/crm-expected.json scripts/member-expected.json`** (สองไฟล์นี้เป็นผลพลอยได้ของ seed ห้าม commit · **ยังไม่ revert ตอนพัก เพราะ verify3 กำลังใช้อยู่**)
3. เขียน `ledger/wo-notes/crm-C2.1.md` · อัปเดต MASTER-PLAN §12 (แถว C2.1) · commit · **push session/crm + main** · poll `dpl_` ที่ https://shark.in.th/login (รอบก่อน 444 วิ) + `/api/health` · `tg` · memory

### 0.3 รวม C2.2 (ผ่านผู้ตรวจแล้ว · รอผู้คุมงานตรวจเอง)
- งานอยู่ **uncommitted ใน `/root/projects/shark-crm-c20`** (32 ไฟล์ · ฐาน `827ecbdb`) · ข้อสอบ `qc-crm-c2.2` **65/65** (ตัวเลขของ builder — **ต้องรันเอง**)
- ผู้ตรวจอิสระ: ไม่มี BLOCKER · SHOULD-FIX 8 + NOTE 4 → builder แก้ครบพร้อมหลักฐาน "ทำบั๊กเดิมเกิดซ้ำแล้วแสดงว่าหาย" · **คำตัดสินผูกพันอยู่ท้าย `ledger/crm-briefs/crm-brief-C2.2.md`**
- วิธีรวม: `git -C /root/projects/shark-crm-c20 diff --binary 827ecbdb -- . ':!scripts/*expected*.json' ':!scripts/qc-prisma.sh' ':!scripts/with-gate-lock.sh' ':!scripts/qc3.sh' ':!scripts/qc-owner-guard.mts' ':!scripts/seed-*.mts' ':!scripts/qc-crm-c0.5.mts' > /tmp/c22.patch` → `git apply --index -3 /tmp/c22.patch` ในทรีหลัก
  (ไฟล์ที่ยกเว้น = ของผู้คุมงานที่ก๊อปเข้าไป หรือผลพลอยได้ของ seed — ทรีหลักมีของจริงอยู่แล้ว)
- ⚠️ C2.2 กับ C2.3 แตกจากฐานเดียวกันและแตะไฟล์ร่วมกันหลายตัว (`crm/index.ts` · `settings.ts` · `nav.ts` · `layout.tsx` · `crm-ui-inventory.json` · `visual-crm.mts`) ⇒ **รวม C2.2 ก่อน แล้วค่อย C2.3 ด้วย `-3`** และตรวจ conflict ทีละไฟล์
- แล้วรันตรวจเอง (แบบเดียวกับ C2.1) + ภาพ spec `"2.2"` + PARITY กับ mockup 07 (ล่าง) ใน `ledger/design-crm/`

### 0.4 C2.3 (builder เสร็จ · **ยังไม่มีผู้ตรวจอิสระ** — ตัวที่ปล่อยไว้ตายไปกับ session)
- งาน **uncommitted ใน `/root/projects/shark-crm-c23`** (22 ไฟล์ · ฐาน `827ecbdb`) · ข้อสอบ **59/60 → 60/60 หลัง ORACLE-EDIT C2.3-S4.1 ที่ผู้คุมงานทำแล้ว** (ไฟล์ข้อสอบในทรีหลักและใน c23 แก้แล้วทั้งคู่)
- 🔴 **ต้อง spawn ผู้ตรวจอิสระใหม่ (model: opus)** ก่อนรับงาน · โฟกัส: `contacts.ts` (ไฟล์ที่สร้างลีดทุกเส้นรวมทั้งร้าน v1 + เครื่องมือ AI `crm_create_lead`) · round-robin/เพดานใต้การยิงพร้อมกัน · advisory lock ครอบช่วง read-decide-write และแยกต่อระบบ · `Party.address` (จังหวัด) ต้องไม่หลุดออกไปใน payload/log/แจ้งเตือน
- ที่ builder แจ้งไว้และผู้คุมงานยังไม่ตัดสิน: (ก) server actions อยู่ที่ `src/app/app/sys/[id]/crm/settings/assignment/actions.ts` ไม่ใช่ `crm/assignment-actions.ts` ตาม R12 (อ้างว่าติดด่าน F2.3) — ให้ผู้ตรวจยืนยันว่าเหตุผลจริงและไม่มีอะไรรั่วไปฝั่ง client · (ข) `pageData` คืน `contactFields` เพิ่ม (1 query) — ต้องเช็กว่า scope ตามร้านและตรวจสิทธิ์
- ไฟล์หลักฐานที่ builder ทิ้งไว้ลบได้: `/root/projects/shark-crm-c23/scripts/probe-c23-s41.mts`

### 0.5 ถัดไปตามลำดับ
C2.4 (ข้อสอบ 78 · `CRM_ASSIST` พร้อมใช้จาก C2.0) → C2.5 ∥ C2.6 → C2.7 … C2.11 → ปิดเฟส C2 ด้วย `qc:all` (**ต้องส่ง DATABASE_URL/DIRECT_URL เข้าไปด้วย** ดู `scripts/pending/run-c1-qcall.sh`) → C3.0 (migration) …
- ข้อสอบที่พร้อมแล้ว (commit แล้วในทรีหลัก): C2.4 (78) · **C2.5 (94)** · **C2.6 (82)** · ยังอยู่ใน `shark-crm-c12a` รอ copy+commit: **`qc-crm-c2.6-web.mts` (34 · ตัว headless)** + **`qc-crm-c2.7.mts` (55)** พร้อม addendum ในสอง brief — **ต้อง typecheck ในทรีหลักก่อน commit**
- 🔴 C2.6 **ห้ามรับงานด้วยข้อสอบฝั่ง server ตัวเดียว** ต้องมีตัว headless ด้วย (คำตัดสิน 23 ก.ย. ท้าย brief C2.6)
- ข้อที่ผู้เขียนข้อสอบ C2.7 สารภาพว่า **ตั้งชื่อเอง ไม่มีเอกสารรองรับ** (13 ข้อ ท้าย brief C2.7) — ผู้คุมงานต้องเคาะก่อน spawn builder C2.7 · ข้อสำคัญ: `linkSaleToDeal` ต้องนับบิลที่จ่ายแล้วใน tx เดียวกัน (ไม่งั้นเงินไม่ถูกนับ) · ธง "เอกสารถูกยกเลิก" ใช้ `CrmDeal.tags` เพราะห้าม migration · ไม่มี `PosSale.dealId` (มติ C29) แม้ CRM-RUN §1 ยังเขียนว่ามี

## 1. 🔴 กติกาที่เพิ่งได้มาจากคืน 23–24 ก.ย. (อ่านให้ครบ ไม่งั้นเสียเวลาซ้ำ)
1. **`qc-member-m1.1` ลบข้อมูล CRM ทั้งชุดด้วยตัวมันเอง** (ข้อ `M1.1-S3.4` รัน `seed-member-qc.mts` ซ้ำ = ลบร้านสร้างใหม่ · CRM ใช้ร้าน/slug เดียวกัน) ⇒ **วางได้ที่เดียว: หลัง reseed member และก่อน seed CRM** · พิสูจน์แล้วว่าย้ายแล้วเขียว
2. **ห้ามแก้ไฟล์สคริปต์ที่ unit กำลังรันอยู่** — bash อ่านต่อจาก byte offset ⇒ unit ตายกลางทาง (เสีย build 10 นาที + suites ที่เหลือ) · ก๊อปเป็นชื่อใหม่ต่อรอบ (`run-x-v3.sh`) + `bash -n` ก่อนยิง
3. ตัวเลขที่ agent รายงานไม่ใช่หลักฐาน — แต่ **หลักฐานที่ดีคือ "ทำบั๊กเดิมให้เกิดซ้ำ แล้วแสดงว่าของใหม่ไม่เป็น"** (ใช้กับ C2.2 ได้ผลมาก) สั่ง builder ให้ส่งของแบบนี้
4. ด่านใหม่ `scripts/qc-owner-guard.mts`: worktree อื่นห้าม reseed QC1 (exit 5) · ทรีหลักไม่ถูกขวาง · ห่อ qc2/qc3 ไม่ถูกขวาง
5. ก่อนโทษ agent ว่าทำฐานข้อมูลเสีย: `grep -l seed-member-qc scripts/qc-*.mts` ก่อน

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
