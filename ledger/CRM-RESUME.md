# CRM v2 RUN — จุดต่องานของผู้คุมงาน (อ่านไฟล์นี้ก่อนเมื่อ session ใหม่)

> อัปเดตล่าสุด: **25 ก.ย. 2569 07:15 (ไทย · 00:15 UTC)** · ผู้คุมงาน **Fable 5.1** · branch `session/crm` · ▶️ กำลังเดิน
> ลำดับอ่าน: ไฟล์นี้ → `ledger/CRM-MASTER-PLAN.md` §12 → **ท้าย `ledger/CRM-RUN.md` §4 (บันทึก 23–24 ก.ย. สำคัญมาก)** → brief ของใบที่ทำ (มี "Controller ruling/addendum" = ผูกพัน)

## 0. ▶️ ทำต่อจากตรงนี้ (session ใหม่ · ทำตามลำดับ)

### 0.1 เช็กสภาพเครื่องก่อน
- `systemctl list-units --all | grep -E "iso-|crm-" | grep -v mount` — ถ้ามี **`crm-c21-verify3`** ยัง active = **ปล่อยให้จบ** (unit `--collect` รอดจาก session ตาย) · ห้าม stop กลาง suite
- ผลอยู่ที่ `.qc-shots/crm/c21-verify3.log` · ดูด้วย
  `awk '/^== /{n=$0} /^exit=/{print n" -> "$0}' .qc-shots/crm/c21-verify3.log` และ `grep JSON_SUMMARY`
- `ls /tmp/shark-gate*.lock` + `fuser /tmp/shark-gate.lock` ต้องไม่มีใครถือ

### 0.2–0.5 C2.1 … C2.7 — ✅ รับงานแล้ว 7 ใบ (25/53 = 47%) · commit ในทรีหลัก · 🔴 **ยังไม่ push** (session Fable ถูกตัวกรองสิทธิ์บล็อก — เจ้าของกด: `cd /root/projects/shark-crm && git push -u origin session/crm && git push origin HEAD:main`)
- หลัง deploy READY: เติม D12 ใน wo-notes C2.1–C2.5 (hash + dpl) · `tg` · 🔴 prod ต้องมี `RESEND_WEBHOOK_SECRET` (ไม่ตั้ง = webhook ปิด 401 ปลอดภัย) · Q7 ฟุตเตอร์ยกเลิกรับ (ค่าเริ่มต้น "มี")
- worktree c20/c23/c12a: รีเซ็ตเป็น HEAD ใหม่ก่อนใช้ (`git checkout -- . && git clean -fd -e .qc-shots -e node_modules -e '.env.*' && git checkout --detach <HEAD>`) · หลักฐาน `.qc-shots/c24*`, `.qc-shots/c25*` ยังอยู่
- ข้อสอบพร้อม: C2.6 (82 + web 34) · C2.7 (55 — **8 ข้อรอเคาะท้าย addendum brief C2.7**) · C2.8 (54) · C2.9 (47) · C2.10 (40) · C2.11 (47) · C3.0 (33) — ทุกใบยกเว้น C2.6/C2.7 เคาะแล้ว
- C2.6/C2.7 รับแล้ว 25 ก.ย. (commit ดูใน git log) · หลักฐาน builder ใน c20/c23 `.qc-shots/c26*` `.qc-shots/c27*` · probe ไม่ commit
- **กำลังเดิน**: C2.8 (c20/QC2 · ข้อสอบ 54 · ตอนรับต้อง ORACLE-EDIT `C2.1-S4.6`) ∥ C2.9 (c23/QC3 · 47) — spawn 25 ก.ย. ~00:20 UTC · ≤3 agent ขนาน
- ถัดไป: C2.10 → C2.11 → ปิดเฟส C2 (`qc:all` ส่ง DATABASE_URL/DIRECT_URL) → C3.0 migration
- วงจรที่ใช้ได้ผล (5 ใบ): builder (log ทุก suite) → **ผู้ตรวจอ่านอย่างเดียว opus** → ORACLE-EDIT + builder แก้ (before/after) → รวม (ไฟล์ร่วม: patch --fuzz + เช็คสมดุลวงเล็บ · inventory รวมตาม wo · docs regen ก่อน suite) → unit ตรวจรวม (ชื่อสคริปต์ใหม่ทุกรอบ · ถอยหลังรวม c1.11) → ภาพต้องมีข้อมูล → PARITY → wo-notes → commit

### 0.6 ถัดไปตามลำดับ
C2.4 (ข้อสอบ 78 · `CRM_ASSIST` พร้อมใช้จาก C2.0) → C2.5 ∥ C2.6 → C2.7 … C2.11 → ปิดเฟส C2 ด้วย `qc:all` (**ต้องส่ง DATABASE_URL/DIRECT_URL เข้าไปด้วย** ดู `scripts/pending/run-c1-qcall.sh`) → C3.0 (migration) …
- ข้อสอบที่พร้อมแล้ว (commit แล้วในทรีหลัก): C2.4 (78) · **C2.5 (94)** · **C2.6 (82)** · ยังอยู่ใน `shark-crm-c12a` รอ copy+commit: **`qc-crm-c2.6-web.mts` (34 · ตัว headless)** + **`qc-crm-c2.7.mts` (55)** พร้อม addendum ในสอง brief — **ต้อง typecheck ในทรีหลักก่อน commit**
- 🔴 C2.6 **ห้ามรับงานด้วยข้อสอบฝั่ง server ตัวเดียว** ต้องมีตัว headless ด้วย (คำตัดสิน 23 ก.ย. ท้าย brief C2.6)
- ข้อที่ผู้เขียนข้อสอบ C2.7 สารภาพว่า **ตั้งชื่อเอง ไม่มีเอกสารรองรับ** (13 ข้อ ท้าย brief C2.7) — ผู้คุมงานต้องเคาะก่อน spawn builder C2.7 · ข้อสำคัญ: `linkSaleToDeal` ต้องนับบิลที่จ่ายแล้วใน tx เดียวกัน (ไม่งั้นเงินไม่ถูกนับ) · ธง "เอกสารถูกยกเลิก" ใช้ `CrmDeal.tags` เพราะห้าม migration · ไม่มี `PosSale.dealId` (มติ C29) แม้ CRM-RUN §1 ยังเขียนว่ามี

## 0.9 🔴 โทเคน/โควตา (เจ้าของถาม 25 ก.ย.)
- โทเคนหลักอยู่ที่ sub-agent (builder 400–800k · ผู้ตรวจ ~250k · ผู้เขียนข้อสอบ ~300k ต่อรอบ) · session ควบคุมใช้ cache
- โควตา Opus ชนเพดานทุก ~4–5 ชม. เมื่อรัน 4 ตัวขนาน (24 ก.ย. ชน 3 ครั้ง: 08:00 · 13:00 · 18:00 UTC) ⇒ **รันขนานไม่เกิน 3 ตัว** · ก่อนชนเพดานให้ agent เซฟ log/หลักฐานเป็นระยะ (ทำอยู่แล้ว)
- ย้าย session ได้เฉพาะตอนไม่มี agent ค้าง (agent ตายพร้อม session) — จุดปลอดภัย = หลังรับใบ · RESUME นี้พอสำหรับเริ่มใหม่

### 0.10 สถานะ 25 ก.ย. 07:00 (Fable) — 27/53 (51%) · เลน C2.10 ∥ C2.11 กำลังเดิน
- main tree = C2.1–C2.9 ✅ · **push แล้ว 25 ก.ย. (`0d638f15` · prod `dpl_8aHf55…` 06:01 UTC)** · D12 C2.1–C2.9 เติมแล้ว · c20/c23 รีเซ็ตที่ `455623ec`
- ▶️ **C2.10 รอบแก้ 2** builder (opus) ใน c20/QC2 — log `.qc-shots/c210-r2/` · รอบ 1 ข้อสอบ 40/40 (หลัง ORACLE-EDIT S4.1/S1.4/S3.5) · reviewer พบ A1 (days กฎ≠stage ยิงซ้ำ) A2 (body ตัดลิงก์) B1–B5 · มติใน brief ท้ายไฟล์ · ข้อสอบตอนนี้ 41 (S1.6 static days) · 🔴 QC2/QC3 member seed เก่า — member suites รันบน QC1 เท่านั้น
- ✅ **C2.11 รอบ 1 จบ** (c23/QC3 · log `.qc-shots/c211/`) — ข้อสอบ 44/47 หลัง ORACLE-EDIT 4 จุด (Fable รันเอง) · เหลือ `notifications.prefs.get/set` 2 op (MUST จริง 32) รอรวม C2.10 → รอบ 2 · reviewer read-only กำลังอ่าน · ถอยหลัง m3.10 ต้องรันใน unit ที่มี server
- ลำดับรับ: C2.10 → reviewer read-only → แก้ → รวม main → (C2.11 รอบ 2 เติม 2 op บนทรีที่มี C2.10) → reviewer C2.11 → รวม → unit ตรวจรับรวม (ชื่อใหม่ `run-c210c211-verify.sh` · systemd-run path เต็ม) → ปิด C2 ด้วย `qc:all` → C3.0
- ENV ที่รู้จัก: `qc-member-m3.7` S6.2 อ่าน summary ของ visual-member 3.7

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
