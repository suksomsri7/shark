# TRIPS-RESUME — จุดต่องาน (บล็อกใหม่อยู่บนสุด)

## ▶️ 12 พ.ย. 2569 ~14:1xZ — **5/72 (7%)** · T0.1 ✅ T0.2 ✅ (171b9ebc8) · T0.3 รอบแก้ · T0.5 กำลังสร้าง
- 🔄 เลน l1 `wip/trips-t0.3` (WIP cdfa29102 + **merge session/trips ค้างกลางทาง มี conflict** ให้ผู้สร้างแก้): ผู้สร้าง T0.3 รอบแก้ r2 — รายการ A–I = `wo-notes/trips-T0.3-review.md` + `-hunt.md` + มติใน TRIPS-RUN §4 (14:1xZ) · ถ้าตัวแทนตาย: `git status` ในเลน → แก้ conflict → ทำต่อ
- 🔄 เลน l2 `wip/trips-t0.5`: ผู้สร้าง T0.5 🔴 (ข้อสอบ 130 · ใบสั่ง §12–§13)
- รับ T0.3: commit (ผู้คุม) → ผู้ตรวจเช็กซ้ำ → `/root/trips-runs/gate.sh /root/projects/shark-trips-l1 gate-t0.3 qc-trips-t0.3 qc-trips-t0.2 qc-trips-t0.1 qc-trips-p0.1 qc-svc-r0.3 qc-svc-smoke` + probe นักล่า (mat edge scale conc) → merge → seed ฐานหลัก → รันซ้ำ → tg 8% (6/72) → ผู้สร้าง T0.4 (เลน l1 · รันข้อสอบ t0.4 ยืนยันแดงก่อน · ใช้สูตรสถานะร่วมจาก T0.3 ข้อ G)
- รับ T0.5: ผู้ตรวจ + นักล่า → ด่านเดียวกัน (+ qc-trips-t0.5) → merge หลัง T0.3 (แก้ชน index.ts/seed/ฟิกซ์เจอร์)
- แล้ว: ใบสั่ง + ข้อสอบ T0.6 (ต้องอิงโค้ดจริงของ T0.4/T0.5)
- เครื่อง load 26 (14:07Z · RUN อื่น) · ON_MAIN ยังไม่เกิด

## ▶️ 12 พ.ย. 2569 ~13:1xZ — **4/72 (6%)** · T0.1 ✅ (836080029) · T0.2 ∥ T0.3 กำลังสร้าง
- 🔄 เลน l2 `wip/trips-t0.2`: ผู้สร้าง T0.2 (ข้อสอบ 84 ข้อ) · 🔄 เลน l1 `wip/trips-t0.3`: ผู้สร้าง T0.3 🔴 (ข้อสอบ 116 ข้อ · กลุ่ม seed R-… รอ T0.2) — งานอยู่บนดิสก์ ไม่ commit · ตัวแทนตาย = เปิดใหม่ "ทำต่อจากทรี"
- รับงาน: **T0.2 ก่อน** (ผู้คุมอ่าน diff หรือผู้ตรวจ 1 ตัว → ORACLE-EDIT p0.1 C-2 เป็น 3 หน่วย → ด่าน: oracle t0.2 + t0.1 + p0.1 + fitness ×2 + typecheck → merge → seed ฐานหลัก → รันซ้ำ) แล้ว **T0.3** (merge session/trips เข้าเลน l1 แก้ชน `trips/index.ts` + `seed-trips-qc.mts` → ผู้ตรวจ + นักล่า → F5 50→51 ORACLE-EDIT ถ้าขึ้น → ด่านแบบเดียวกัน + oracle t0.3) · แบบสคริปต์ด่าน `/root/trips-runs/gate-t0.1.sh`
- ถัดไป: T0.4 (ข้อสอบ 110 — ผู้คุมต้องรันยืนยันแดงก่อน เพราะผู้เขียนแก้ 2 จุดหลังรัน) → T0.5 (130) → เขียนใบสั่ง T0.6
- ทุกฐาน (หลัก · l1 · l2) มี migration trips แล้ว · ON_MAIN ยังไม่เกิด

## ▶️ 12 พ.ย. 2569 ~13:5xZ — **3/72 (4%)** · T0.1 รอบแก้ r2 · ใบสั่ง+ข้อสอบ T0.2–T0.5 พร้อม
- 🔄 เลน l1 `wip/trips-t0.1` (WIP 26b601500): **ผู้สร้าง T0.1 รอบแก้ r2** — รายการแก้ = ผู้ตรวจ (`wo-notes/trips-T0.1-review.md`) + นักล่า (`-hunt.md`) + คอลัมน์จาก T0.4/T0.5 (TRIPS-RUN §4 12:3x–13:4xZ) · งานบนดิสก์ยังไม่ commit · ถ้าตัวแทนตาย เปิดใหม่ให้อ่านสองรายงาน + §4 แล้วทำต่อ
- รับ T0.1 (ผู้คุม): commit → ผู้ตรวจเช็กซ้ำเฉพาะจุดแก้ → รันเองในเลน: oracle t0.1 (96 หรือ +ORACLE-EDIT 34 ตาราง) · probe ของนักล่า scale2/settings/db · fitness ×2 · typecheck (heap 12288 · ISO_MEM 14000M) · SVC r0.3 r0.4 d.1 smoke + b.0 เทียบฐานก่อนแก้ → merge → `migrate deploy` ฐานหลัก + l2 → oracle ซ้ำบนฐานหลัก → tg 6% (4/72)
- แล้ว: ผู้สร้าง T0.2 (l2) ∥ T0.3 (l1) → T0.4 → T0.5 → ใบสั่ง T0.6
- เลน l2 ว่าง · ON_MAIN ยังไม่เกิด (ตั้งเตือน 17:40Z — ข้อความในตัวเตือนเป็นของเก่า ใช้แค่ตรวจ main)

## ▶️ 12 พ.ย. 2569 ~10:3xZ — **3/72 (4%)** · เจ้าของอนุญาตสร้างโดยไม่รอ ON_MAIN
- 🔄 เลน l1 `wip/trips-t0.1`: **ผู้สร้าง T0.1** (ห้าม commit · สคริปต์ที่ `scratchpad/t0.1-build/`) — ถ้าตัวแทนตาย: เปิดใหม่ "ทำต่อจากทรี" (งานอยู่บนดิสก์ ยังไม่ commit) · รับงาน: ผู้ตรวจ + นักล่า (ใบ 🔴) → ผู้คุมรัน oracle 96 ข้อ + regression SVC 5 ชุด (r0.3 r0.4 d.1 b.0 smoke) + fitness 2 โหมด + typecheck (heap 12288 · ISO_MEM 14000M) → merge → `migrate deploy` ฐานหลัก + l2 → รันซ้ำบนฐานหลัก
- 🔄 เลน l2 `wip/trips-t0.2`: ผู้เขียนใบสั่ง + ข้อสอบ T0.2 (ฐาน l2 seed แล้ว)
- เครื่องโหลดสูงมาก (load 27 ตอน 10:29Z · RUN อื่น) → งานหนักทีละ 1 · ไม่เปิดเลนที่ 3
- ON_MAIN ยังไม่เกิด — เมื่อเกิด merge origin/main หนึ่งครั้ง (ตั้งเตือนตัวเองไว้ 17:40Z)

## ⏸ 12 พ.ย. 2569 ~09:5xZ — **3/72 (4%)** · เตรียมครบ · **รอ ON_MAIN** (ไม่มีตัวแทนเปิดอยู่)
- พร้อมปล่อย: T0.1 = ใบสั่ง `ledger/trips-briefs/T0.1.md` (มติ §8) + ข้อสอบ 96 ข้อ (แดง 90) · เลน l1 อยู่ที่ `wip/trips-t0.1` = session/trips
- เมื่อ `ON_MAIN` + prod ปกติ: (1) `git merge origin/main` เข้า session/trips (2) `migrate status` บนฐาน 3 ตัว — ถ้า main มี migration ใหม่ให้ `migrate deploy` ผ่าน qc-trips.sh ทุกฐาน (3) seed ฐาน l2 (4) ปล่อยผู้สร้าง T0.1 ในเลน l1 (ใบ 🔴: ผู้ตรวจ + นักล่า ก่อนด่าน) (5) ระหว่างนั้นเลน l2 = ใบสั่ง+ข้อสอบ T0.2/T0.3
- ทำได้โดยไม่รอ main (ยังไม่ได้ทำ): ใบสั่ง+ข้อสอบ T0.2 · T0.3 (เขียนบนสัญญา) · รอบแก้สัญญาเล็ก (หนี้เอกสารใน TRIPS-RUN §4 ล่าสุด)

## ▶️ 12 พ.ย. 2569 ~08:5xZ — **3/72 (4%)** · P0 ครบ · รอ ON_MAIN ก่อน T0.1
- ✅ P0.1 · P0.2 · P0.3 (สัญญารอบ 2 · ผู้ตรวจ READY) · หนี้สัญญา N-1…N-11 มีด่านใน TRIPS-RUN §3 — ตัวแทนผู้ร่างกำลังแก้รอบ 3 (เอกสารอย่างเดียว · ถ้าตาย: เปิดใหม่ให้อ่าน `wo-notes/trips-P0.3-review-r2.md` แล้วแก้ N-1…N-11)
- ถัดไป (ทำได้ระหว่างรอ main): ใบสั่ง `ledger/trips-briefs/T0.1.md` + ข้อสอบ `scripts/qc-trips-t0.1.mts` (ผู้เขียนข้อสอบแยกคน · เลน l1) — **ห้ามปล่อยผู้สร้าง T0.1 จน ON_MAIN + prod ปกติ** แล้ว merge origin/main เข้า session/trips ก่อน
- คำถามเจ้าของ OQ1–OQ17 (`TRIPS-OWNER-QUESTIONS.md`) ใช้ค่าปลอดภัยอยู่

## ▶️ 12 พ.ย. 2569 ~07:4xZ — **1/72 (1%)** · P0.1 ✅ · `session/trips` a37370401+
- ✅ P0.1 รับแล้ว (ข้อสอบ 56/56 บนฐานหลัก) · ฐาน l2 ยังไม่ได้ seed (`seed-trips-qc.mts` ก่อนใช้)
- 🧪 P0.2 `ledger/TRIPS-DEFAULTS.md` + P0.3 `ledger/TRIPS-CORE-CONTRACT.md` (ร่าง · มีหัว L = คำถามเปิด 49 ข้อ) → **ผู้ตรวจอิสระกำลังรัน** ผลที่ `scratchpad/p0.3-review/REVIEW.md` → ผู้คุมตัดสิน L-1…L-49 + แก้ไฟล์ → รับ P0.2/P0.3 (3/72)
- ภาพ 16–20 วาดและ commit แล้ว (e6b3a7a9f) · คำถามเจ้าของ OQ1–OQ11 ใน `TRIPS-OWNER-QUESTIONS.md` (ทำต่อด้วยค่าปลอดภัย)
- ถัดไป: ใบสั่ง + ข้อสอบ T0.1 (ยังไม่สร้างจน ON_MAIN) · ตรวจ ON_MAIN ทุกครั้งที่กลับมา

## (เก่า) 12 พ.ย. 2569 ~07:1xZ — **0/72 (0%)** · ขั้นเตรียม P0 · `session/trips` (ฐาน release/svc-to-main fda23269c)
- **ยังห้าม T0.1** (migration) จนกว่า `ON_MAIN` + production ปกติ — ตรวจด้วยคำสั่งใน TRIPS-RUN §1 ข้อ 1 · เมื่อ ON_MAIN: merge origin/main เข้า session/trips หนึ่งครั้ง
- ✅ P0.1 ส่วนโครง: ทรี `shark-trips` + เลน `-l1` `-l2` · Neon `wo-trips-qc` / `-l1` / `-l2` (198 migrations up to date) · `scripts/qc-trips.sh` · `trips-qc-hosts.mts` · `trips-qc-env.mts` · node_modules แยกต่อทรี — ตาราง host อยู่ใน TRIPS-RUN §1 ข้อ 4
- 🔄 ตัวแทนที่เปิดอยู่ (ถ้า session ตาย ให้เปิดใหม่ "ทำต่อจากทรี"):
  - P0.1 ฟิกซ์เจอร์ร้านตัวอย่าง — เลน l1 `wip/trips-p0.1` → `scripts/trips-fixture.mts` + `scripts/seed-trips-qc.mts`
  - P0.2 ตารางค่าเริ่มต้น → `ledger/TRIPS-DEFAULTS.md` (เขียนในทรีหลัก · เอกสารอย่างเดียว)
  - P0.3 ร่าง `ledger/TRIPS-CORE-CONTRACT.md` (เขียนในทรีหลัก · เอกสารอย่างเดียว) → แล้วผู้ตรวจอิสระ 1 รอบ
  - ภาพชุด M1 (TA §12.3) → `ledger/design-trips/16+`
- ถัดไป: รับ P0.1–P0.3 → ใบสั่ง + ข้อสอบ T0.1 (เตรียมได้ · ยังไม่สร้าง) → รอ ON_MAIN
- ของที่รอเจ้าของ: O1 push svc ขึ้น main (ผู้ทำ release ทำอยู่) · O4 LINE OA ทดสอบ (W2.1) · O5 ข้อมูลผู้ให้บริการของ SiamDive (S1.1) · O6 บัญชีคู่ค้า (C1.2/C1.3)
