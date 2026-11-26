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

## รอบ 2 (มติ E1–E9)
- ตัวรับการลบ: `onBookerPartyErased` (pdpa.ts · facade index.ts) เรียกต่อท้ายตัวรับเดิม `member.erased` และ `crm.contact.erased` ใน `src/lib/outbox-consumers.ts` (บล็อกรั้ว 2 จุด) · UPDATE เดียว: `policySnapshot || {"booker":{"v":1,"erased":true}}` + version +1 ทุกการจองของ Party ในร้านที่ยังไม่ใช่ป้าย (ส่งซ้ำ = 0 แถว) · payload ไม่มี partyId ⇒ ไม่ทำอะไร
- ยืนยัน: มีคีย์ ⇒ เบอร์ที่พิมพ์เลขสำคัญ ≥ 8 เท่านั้น ไม่งั้น null · ไม่มีคีย์ ⇒ Party · `findBookReservation` คืน snapshot − booker · แฮช audit change / คำขอคืนเงิน ตัด booker
- ผล: w1.2b 67/67 · w1.3 119/120 (S-10 ขอบเขตชุดเก่า) · t0.7 150/150 · typecheck 0 · fitness 54/54

## รอบ 3 (มติ G1–G3)
- ตัวรับการลบ: รับ `partyId` + `partyIds` (เฉพาะสตริง · ไม่ใช่อาร์เรย์ ⇒ ไม่ใช้) · ไล่สาย `mergedIntoId` ด้วย WITH RECURSIVE (UNION กันวน · ร้านเดียวกัน) · `oldSha` คิดจากสำเนาที่ตัด booker (ไม่ delete บนแถว)
- ผล: w1.2b 72/72 · w1.3 119/120 (S-10 ขอบเขตชุดเก่า) · t0.7 150/150 · typecheck 0 · fitness 54/54
