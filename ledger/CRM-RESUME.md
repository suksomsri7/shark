# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: **24 ก.ย. 2569 12:40 (ไทย · 05:40 UTC)** · ผู้คุมงาน **Fable 5.1** · branch `session/crm` · ▶️ กำลังเดิน
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → **ท้าย `ledger/CRM-RUN.md` §4 (บันทึก 23–24 ก.ย. สำคัญมาก)** → brief ของใบที่ทำ (มี "Controller ruling/addendum" = ผูกพัน)

## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · ทำตามลำดับ)

### 0.1 เช็กสภาพเครื่องก่อน
- `systemctl list-units --all | grep -E "iso-|crm-" | grep -v mount` — ถ้ามี **`crm-c21-verify3`** ยัง active = **ปล่อยให้จบ** (unit `--collect` รอดจาก session ตาย) · ห้าม stop กลาง suite
- ผลอยู่ที่ `.qc-shots/crm/c21-verify3.log` · ดูด้วย
  `awk '/^== /{n=$0} /^exit=/{print n" -> "$0}' .qc-shots/crm/c21-verify3.log` และ `grep JSON_SUMMARY`
- `ls /tmp/shark-gate*.lock` + `fuser /tmp/shark-gate.lock` ต้องไม่มีใครถือ

### 0.2–0.4 C2.1 · C2.2 · C2.3 — ✅ รับงานแล้วทั้ง 3 ใบ (21/53) · commit ในทรีหลัก · 🔴 **ยังไม่ push** (session Fable ถูกตัวกรองสิทธิ์บล็อก `git push` — เจ้าของต้องกด)
- คำสั่งที่เจ้าของต้องรัน: `cd /root/projects/shark-crm && git push -u origin session/crm && git push origin HEAD:main` แล้ว poll `dpl_` ที่ https://shark.in.th/login + `/api/health` (มีเจ้าของอนุมัติแล้วเท่านั้น · ห้ามใช้ session อื่น push แทน = permission laundering)
- หลัง deploy READY: เติม D12 ใน `wo-notes/crm-C2.1.md` `crm-C2.2.md` `crm-C2.3.md` (hash + dpl) · `tg`
- worktree `shark-crm-c20` (C2.2) และ `shark-crm-c23` (C2.3) มีงานที่รวมแล้ว + probe/หลักฐาน `.qc-shots/c22-r2` `.qc-shots/c23-r2` `.qc-shots/c23-r3` — ก่อนใช้ worktree ซ้ำสำหรับใบถัดไป: `git -C <wt> checkout -- . && git -C <wt> clean -fd -e .qc-shots -e node_modules` แล้ว `git -C <wt> checkout --detach <HEAD ใหม่ของทรีหลัก>` (node_modules เป็น bind mount ห้าม rm)

### 0.5 กำลังเดิน (spawn 24 ก.ย. 05:50 UTC · Fable)
- **C2.4** builder opus ใน `shark-crm-c20` (QC2) — brief R1–R13 (R2 = `CRM_ASSIST`) · ข้อสอบ 78 (+ORACLE-EDIT S2.3) · หลักฐาน `.qc-shots/c24/`
- **C2.5a ✅ builder จบ 07:20 UTC** (88/93 · แดง 5 = UI · ถอยหลัง 13 ชุดเขียว · TTL จริง 15 นาทีตรงข้อสอบ · ORACLE-EDIT `backdate` ทำแล้ว `7eaf67ad`) → **C2.5b (UI) builder ตัวเดิมทำต่อใน c23** (สั่ง 07:25 UTC) · หลัง b: ผู้ตรวจอ่านอย่างเดียวทั้ง a+b → รวมทรีหลัก (ไฟล์ร่วมกับ C2.4: `index.ts` `nav.ts` `settings.ts` `layout.tsx` `inventory` `visual-crm` `outbox-consumers` `minute-jobs` `crm-cron`) → unit ตรวจรวม C2.4+C2.5
- **ข้อสอบพร้อมแล้ว**: C2.8 (54 · `ba677eb1` · เคาะ 26 ข้อแล้ว) · C2.9 (47 · `0e585c10` · เคาะ 19 ข้อแล้ว) · ผู้เขียนข้อสอบตัวเดิมกำลังทำ **C2.10 → C2.11** ใน c12a
- ตอนรับ C2.8 ผู้คุมงานต้องทำ ORACLE-EDIT `C2.1-S4.6` (ADJUST_SCORE เลิกเป็น stub)
- ถ้า session ตาย: `git -C <wt> status` ดูงานค้าง + `.qc-shots/<wo>/` แล้ว spawn ใหม่ "ทำต่อจากสภาพไฟล์" พร้อม brief จากทรีหลัก
- วงจรรับงาน (ใช้ได้ผลกับ C2.2/C2.3): builder จบ → **ผู้ตรวจอ่านอย่างเดียว (opus) ยืนยันทุกข้อ + ล่าบั๊ก** → ORACLE-EDIT ปิดช่องที่ผู้ตรวจชี้ → builder แก้ (before/after) → รวมทรีหลัก (ไฟล์ใบเดียวก๊อปทับ · ไฟล์ร่วมเก็บทั้งสองบล็อก) → unit ตรวจรวม (สคริปต์ชื่อใหม่ทุกรอบ · ถอยหลังรวม c1.11) → ภาพต้องมีข้อมูลตัวอย่าง → PARITY ด้วยตา → wo-notes → commit

### 0.6 ถัดไปตามลำดับ
C2.4 (ข้อสอบ 78 · `CRM_ASSIST` พร้อมใช้จาก C2.0) → C2.5 ∥ C2.6 → C2.7 … C2.11 → ปิดเฟส C2 ด้วย `qc:all` (**ต้องส่ง DATABASE_URL/DIRECT_URL เข้าไปด้วย** ดู `scripts/pending/run-c1-qcall.sh`) → C3.0 (migration) …
- ข้อสอบที่พร้อมแล้ว (commit แล้วในทรีหลัก): C2.4 (78) · **C2.5 (94)** · **C2.6 (82)** · ยังอยู่ใน `shark-crm-c12a` รอ copy+commit: **`qc-crm-c2.6-web.mts` (34 · ตัว headless)** + **`qc-crm-c2.7.mts` (55)** พร้อม addendum ในสอง brief — **ต้อง typecheck ในทรีหลักก่อน commit**
- 🔴 C2.6 **ห้ามรับงานด้วยข้อสอบฝั่ง server ตัวเดียว** ต้องมีตัว headless ด้วย (คำตัดสิน 23 ก.ย. ท้าย brief C2.6)
- ข้อที่ผู้เขียนข้อสอบ C2.7 สารภาพว่า **ตั้งชื่อเอง ไม่มีเอกสารรองรับ** (13 ข้อ ท้าย brief C2.7) — ผู้คุมงานต้องเคาะก่อน spawn builder C2.7 · ข้อสำคัญ: `linkSaleToDeal` ต้องนับบิลที่จ่ายแล้วใน tx เดียวกัน (ไม่งั้นเงินไม่ถูกนับ) · ธง "เอกสารถูกยกเลิก" ใช้ `CrmDeal.tags` เพราะห้าม migration · ไม่มี `PosSale.dealId` (มติ C29) แม้ CRM-RUN §1 ยังเขียนว่ามี

## 1. 🔴 กติกาที่เพิ่งได้มาจากคืน 23–24 ก.ย. (อ่านให้ครบ ไม่งั้นเสียเวลาซ้ำ)
1. **`qc-member-m1.1` ลบข้อมูล CRM ทั้งชุดด้วยตัวมันเอง** (ข้อ `M1.1-S3.4` รัน `seed-member-qc.mts` ซ้ำ = ลบร้านสร้างใหม่ · CRM ใช้ร้าน/slug เดียวกัน) ⇒ **วางได้ที่เดียว: หลัง reseed member และก่อน seed CRM** · พิสูจน์แล้วว่าย้ายแล้วเขียว
2. 🔴 **ห้ามห่อ build/typecheck/acc-v2-serve ด้วย flock เพิ่ม** — `with-gate-lock.sh` ถือ gate→qc2→qc3 ครบแล้ว ห่อซ้ำ = deadlock ทุก lane (Fable ทำพลาด 24 ก.ย. เสีย 40 นาที)
2b. **ห้ามแก้ไฟล์สคริปต์ที่ unit กำลังรันอยู่** — bash อ่านต่อจาก byte offset ⇒ unit ตายกลางทาง (เสีย build 10 นาที + suites ที่เหลือ) · ก๊อปเป็นชื่อใหม่ต่อรอบ (`run-x-v3.sh`) + `bash -n` ก่อนยิง
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
