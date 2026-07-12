# QC6 — ใบสั่งแก้รวม: บัญชี (CPA audit) + UI/UX ทั้งแอป — FINAL

> ที่มา: `QC6-account-cpa.md` (ตรวจระบบจริง 108 ข้อ — ผ่าน 90, findings 9 ต้นตอ) + `QC6-ui-audit.md` (140 findings) + `UI_STANDARD.md`
> จัดลำดับโดย Fable 5 (2026-07-12) — ผู้ execute: session Opus 4.8

## Gate 1 — บัญชี CRITICAL (แบบภาษียื่นผิด) — ทำก่อนทุกอย่าง
| # | อาการ | จุดแก้ |
|---|---|---|
| F-01 | ใบกำกับเต็มรูปจากใบเสร็จขายสด → **VAT นับซ้ำ** (+35) | `gl.ts postTaxInvoice` — ย้าย 2205→2200 เฉพาะเมื่อ VAT ยังพักอยู่จริง (เช็ค source doc ว่า VAT ลง 2200 ไปแล้วหรือยัง) |
| F-02 | ใบกำกับของใบแจ้งหนี้หักมัดจำ ย้าย VAT เต็มใบ (350 แทน 280) → **ภ.พ.30 นำส่งเกิน** + 2205 ค้างข้ามงวด | `service.ts convertDocument` — vatAmount ของใบกำกับ = VAT ใบแจ้งหนี้ − VAT ส่วนมัดจำที่เคยออกใบกำกับแล้ว |
| F-03 | **ภ.ง.ด.53 ออกเป็น ฿0** (ฐานใส่ผิดเป็นยอด WHT) | `expense.ts issueWhtCert` — ใช้มาตรฐานเดียวกับ `wht.ts` (subTotal=ฐานก่อน VAT, whtAmount=ยอดหัก) |
| F-08 | ฐานภาษีขาย ภ.พ.30 เกิน 53% (นับใบ void/CN เป็นบวก/มัดจำเต็มใบ) | `reports.ts` ภ.พ.30 — ฐานจากใบกำกับ ISSUED เท่านั้น, CN เป็นลบ, ใบกำกับมัดจำ=ฐานเฉพาะส่วน |

**เกณฑ์ผ่าน: รัน `pnpm exec tsx scripts/qc-account-cpa.mts` ซ้ำ ต้องได้ 108/108** แล้วค่อย deploy prod

## Gate 2 — บัญชี MAJOR
F-04 CN cap ต้องหักยอดชำระแล้ว (คงเหลือจริง) · F-05 กันรับเงินเกินหนี้หลัง CN · F-06 ยอดลูกหนี้หน้าจอต้อง = GL (หัก CN) · F-07 ใบเสร็จขายสดเลือกบัญชีเงิน (เงินสด 1000/ธนาคาร 1010) ได้ · F-09 รายได้ขายสินค้า → 4020 ไม่ใช่ 4030

## UI Fix — 5 Pass ตาม `UI_STANDARD.md` (ทำขนานกับ Gate 2 ได้)
- **Pass 0 (เร่ง — ครึ่งวัน):** แก้ token ผี (`--color-primary/success/fg/bg/hover`, `.btn-secondary` → token จริง) = ปุ่มล่องหนบน prod กลับมาเห็น + **ConfirmDialog/confirm ทุก destructive action ~30 จุด** (ปิดงวด/void เงิน/เช็คเอาท์/ลบ) + SubmitButton pending state ฟอร์มเงิน (กัน double-submit)
- **Pass 1:** สร้าง shared components 11 ตัว (`src/components/ui/`) + `.btn-sm`/`.input` ใน globals ตาม UI_STANDARD
- **Pass 2:** refactor account 26 หน้า + **เมนูใหม่ 8 หมวด** (`ACCOUNT_NAV` ใน UI_STANDARD) + StatusChip ป้ายไทย (เลิกโชว์ DRAFT/ISSUED ดิบ)
- **Pass 3:** unit modules (hotel/queue/ticket/booking/restaurant) — ปุ่มหน้างาน ≥44px, ตาราง responsive
- **Pass 4:** lib modules (meeting/kanban/coupon) + เก็บตก + คลิกทดสอบทุกหน้าบนมือถือ

## ที่ยืนยันแล้วว่าแข็งแรง (ห้าม regress ตอนแก้)
Double-entry 27/27 · งบทดลอง/P&L/งบดุลตรงเลขมือทุกบาท · tax point สินค้า/บริการ+ใบกำกับต่องวด · มัดจำ F2 posting · WHT posting · ค่าเสื่อม idempotent · void reversal · ปิดงวด — **harness `qc-account-cpa.mts` คือ regression suite ถาวร รันทุกครั้งที่แตะโมดูลบัญชี**
