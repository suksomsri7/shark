# wo-notes W1.2b-1 — เบอร์ที่ผู้จองพิมพ์ยืนยันตัวตนได้ (ผู้สร้าง · 26 พ.ย. 2569)

ทรี `shark-trips-l1` · กิ่ง `wip/trips-w1.2b` · ไม่ commit · ทางเลือก ก (C-1 `policySnapshot.booker`)

## ผล
- `qc-trips-w1.2b` 42/42 · `qc-trips-w1.3` 117/120 (แดง S-5 V-5 = รอ ORACLE-EDIT C-2 · S-10 = ขอบเขตไฟล์ของชุดเก่า) · `qc-trips-w1.2` 97/99 (C-12 = KNOWN_RED รอ ORACLE-EDIT · S-10 ขอบเขตไฟล์ของชุดเก่า) · typecheck 0 · fitness 54/54
- log: `scratchpad/w1.2b/*.log`

## ไฟล์ (+/− เทียบ merge-base · งบ)
booking.ts +4/−1 (≤+10/−2) · public-booking.ts +7/−3 (≤+8/−3) · pdpa.ts +2/−1 (≤+2/−1) · booking-screens.ts +8/−4 (≤+12/−4) · manifest.ts +4/−3 (≤+8/−3) · booking-view-core.ts +11/−0 (≤+24/−0) · รวม +36/−12

## ตัวอย่างค่าที่เก็บ (ปิดเบอร์)
สาธารณะ: `{"v":1,"name":"สมชาย ใจดี","phone":"+6681xxxx678","email":"x@example.com"}` · STAFF 0066: `{"v":1,"name":"…","phone":"006681xxxx678","email":null}` · STAFF partyId ⇒ ไม่มีคีย์

## ลำดับล็อก
`finalizeCoreInTx` ไม่เปลี่ยน: p: → e: → `safeFindOrCreate(c.tenantId, { name, phone, email }, t)` → เลขจอง · ค่าที่พิมพ์คำนวณหลังได้ Party (ไม่มีคิวรี/ล็อกเพิ่ม) · S-2 ผ่าน

## grep log/audit/outbox
บรรทัดที่เพิ่มใน `src/` ที่ตรง `console.|logOps(|auditBooking(|auditTx(|emitOutbox|emitTx(|emitBooking(` = 0 (S-5 ผ่าน)
