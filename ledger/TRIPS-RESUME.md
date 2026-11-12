# TRIPS-RESUME — จุดต่องาน (บล็อกใหม่อยู่บนสุด)

## ▶️ 12 พ.ย. 2569 ~07:1xZ — **0/72 (0%)** · ขั้นเตรียม P0 · `session/trips` (ฐาน release/svc-to-main fda23269c)
- **ยังห้าม T0.1** (migration) จนกว่า `ON_MAIN` + production ปกติ — ตรวจด้วยคำสั่งใน TRIPS-RUN §1 ข้อ 1 · เมื่อ ON_MAIN: merge origin/main เข้า session/trips หนึ่งครั้ง
- ✅ P0.1 ส่วนโครง: ทรี `shark-trips` + เลน `-l1` `-l2` · Neon `wo-trips-qc` / `-l1` / `-l2` (198 migrations up to date) · `scripts/qc-trips.sh` · `trips-qc-hosts.mts` · `trips-qc-env.mts` · node_modules แยกต่อทรี — ตาราง host อยู่ใน TRIPS-RUN §1 ข้อ 4
- 🔄 ตัวแทนที่เปิดอยู่ (ถ้า session ตาย ให้เปิดใหม่ "ทำต่อจากทรี"):
  - P0.1 ฟิกซ์เจอร์ร้านตัวอย่าง — เลน l1 `wip/trips-p0.1` → `scripts/trips-fixture.mts` + `scripts/seed-trips-qc.mts`
  - P0.2 ตารางค่าเริ่มต้น → `ledger/TRIPS-DEFAULTS.md` (เขียนในทรีหลัก · เอกสารอย่างเดียว)
  - P0.3 ร่าง `ledger/TRIPS-CORE-CONTRACT.md` (เขียนในทรีหลัก · เอกสารอย่างเดียว) → แล้วผู้ตรวจอิสระ 1 รอบ
  - ภาพชุด M1 (TA §12.3) → `ledger/design-trips/16+`
- ถัดไป: รับ P0.1–P0.3 → ใบสั่ง + ข้อสอบ T0.1 (เตรียมได้ · ยังไม่สร้าง) → รอ ON_MAIN
- ของที่รอเจ้าของ: O1 push svc ขึ้น main (ผู้ทำ release ทำอยู่) · O4 LINE OA ทดสอบ (W2.1) · O5 ข้อมูลผู้ให้บริการของ SiamDive (S1.1) · O6 บัญชีคู่ค้า (C1.2/C1.3)
