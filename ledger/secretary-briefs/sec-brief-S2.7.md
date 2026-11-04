# S2-7 — S2.7 B1/B2/B8 · S2.8 B3/B4/B5 · S2.9 B6/B7 (หน้าตั้งค่าทั้งชุด · Sonnet layout ได้ · `wip/sec-s2.7` · หลัง S2.1+S1.14 · light-check + ภาพคู่ผู้คุมดู)
Read COMMON · RESOLUTIONS §F · §C.6 (ไม่โชว์ดอลลาร์) · R-K3b (กฎ display-only · "ทำเองได้" ล็อก) · §L.2 R-S1.13g/i (quota shape · B8 cap 100%) · §K (log/undo) · §O (B7 after-hours) · S1.10/S1.15 (memories pending/lessons) · S1.16 (digest) · `sec-brief-S2.1.md`/S2.2 (`secretary-api.ts`) · `docs/api/SECRETARY-API.md` · plan rows S2.7–S2.9 · แบบ B1–B8 (`sec-b.jpg` หน้า 1–8 + dark) · spec `scripts/qc-sec-specs/s2.7.json`.
## หน้า (ทุกหน้า SecTopBar โซนเลขา · ปุ่มกลับ · OWNER-only ⇒ แสดงอ่านอย่างเดียว + ป้าย "เจ้าของเท่านั้น")
- `/secretary/settings` (เมนู): แถว → secretary (B2) · quota (B8) · access (B3) · rules (B4) · log (B5) · knowledge (B6) · customers (B7) · account (G4 — ใบ S2.22) · สลับกิจการ (B1 = `BusinessSwitcherSheet` ของ S2.1 เปิดจากแถว)
- B2 `settings/secretary`: `GET/PUT /secretary` ชื่อ · ลงท้าย (ครับ/ค่ะ/…) · น้ำเสียง (polite/friendly/brief) · ภาษา · สถิติ 4 ตัว (`GET /secretary/stats` ถ้ามี ไม่งั้นจาก quota+rooms: งานเดือนนี้ · รออนุมัติ · เสร็จ 7 วัน · ย้อนกลับ) · ตัวอย่างการพูดสด (template ฝั่งแอปจากชื่อ/ลงท้าย)
- B8 `settings/quota`: `GET /secretary/quota` → วงแหวน % (cap 100) · "ใช้ไป N/limit งาน · รีเซ็ต <วันที่>" · แถว assist "ผู้ช่วยวันนี้ usedMicro/capMicro" แสดงเป็น % ไม่ใช่เงิน · แพ็กเสียเงิน = การ์ดจางมีป้าย "เร็ว ๆ นี้" (7.1/7.3) · **ห้ามแสดง $/balance**
- B3 `settings/access`: `GET/PUT /secretary/access` ต่อโมดูลที่ร้านเปิด: 3 ระดับ ปิด/ดู/ร่าง (OFF/READ/DRAFT) + ขั้น "ทำเองได้" (AUTO) แสดงล็อก (ไม่มีใน API) · OWNER เท่านั้น
- B4 `settings/rules`: `GET/PUT /secretary/rules` 3 กฎ (chat.send/money.limit/pii.export) สวิตช์ + วงเงิน (บาท ↔ satang) · "ผู้อนุมัติ = เจ้าของ/ผู้จัดการ" (display) · OWNER เท่านั้น
- B5 `settings/log`: `GET /secretary/log?module&day` ไทม์ไลน์ (วัน · โมดูล · สรุป · ผู้สั่ง/ผู้อนุมัติ · ปุ่มย้อน ถ้า undoableUntil>now · ย้อนแล้ว = ขีดฆ่า) · ตัวกรองโมดูล/วัน · MANAGER เห็นเฉพาะที่ server ให้ (B5 note §K)
- B6 `settings/knowledge`: 3 ส่วน — กฎ/ข้อเท็จจริง (`memories` เดิม + pending ของ OWNER ยืนยัน/ลบ) · สิ่งที่ Shark เรียนรู้ (`lessons?status` ยืนยัน/ลบ · ที่มา = ห้อง) · ข้อมูลสดวันนี้ (`GET /secretary/digest` แสดงเป็นแถวตัวเลข ไม่ใช่ block)
- B7 `settings/customers`: `GET/PUT /secretary/after-hours` 2 สวิตช์ (นอกเวลาให้ Shark ตอบ · ส่งต่อคนเมื่อไม่แน่ใจ) + ข้อความเปิดเผย AI (ต้องมีคำ AI/ผู้ช่วย — validate ฝั่งแอปด้วย) · ลิงก์ "เวลาทำการ" → เว็บ (WebView `?open=`)
- testID ตาม spec · i18n `sec.settings.*` · fixture `s2.7.json` (OWNER) + `s2.7-staff.json` (STAFF อ่านอย่างเดียว ภาพเดี่ยว) · ภาพคู่ 7 หน้า × 2 ธีม
## Files you own
`app/(app)/secretary/settings/**` · `src/components/secretary/{SettingRow,LevelPicker,RuleRow,LogItem,QuotaRing}.tsx` · `secretary-api.ts` · i18n · fixtures · `ledger/wo-notes/sec-s2.7.md`
## Acceptance = `SPEC=scripts/qc-sec-specs/s2.7.json qc-sec-screen.mts` ×2 · ภาพคู่ · typecheck 0 · fitness ×2
