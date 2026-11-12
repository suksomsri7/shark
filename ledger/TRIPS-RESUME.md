# TRIPS-RESUME — จุดต่องาน (บล็อกใหม่อยู่บนสุด)

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
