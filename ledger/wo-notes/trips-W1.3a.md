# W1.3a — การจองของฉัน: ยืนยันเบอร์ · ยกเลิกก่อนจ่าย · คำขอคืนเงิน · สถานะคำขอ

ใบสั่ง + มติ K1–K16 · L1–L11: `ledger/trips-briefs/W1.3.md` · ข้อสอบ `scripts/qc-trips-w1.3.mts`

## รายการแก้ข้อความ (มติ L7 ญ · จากผู้ตรวจมุมลูกค้า r1) — คีย์ใต้ `self.*` ใน `src/messages/{th,en}/book.json`
| คีย์ | ข้อความที่ต้องเป็น |
|---|---|
| th cancel.step | ยกเลิกก่อนวันเดินทาง {days} วัน · ค่าทัวร์คืน {pct}% ตามเงื่อนไขตอนจอง |
| en cancel.step | {days} days before departure — your booking terms refund {pct}% of the trip price (แยกรูป 1 day) |
| ใหม่ cancel.passThrough | th: เงินที่ร้านเก็บแทน (เช่น ค่าอุทยาน) คืนเต็มจำนวน · en: Fees the shop collected on others' behalf (e.g. park fees) are refunded in full — แสดงพร้อมยอด |
| ใหม่ cancel.today | th: วันนี้เป็นวันเดินทาง · en: Today is the travel date |
| ใหม่ cancel.requestNote | th: นี่เป็นคำขอ ร้านเป็นผู้พิจารณา ระหว่างรอ การจองของคุณยังมีผลอยู่ · en: This is a request. The shop will review it; until then your booking stays active. |
| cancel.accept (UNPAID) | th: ฉันต้องการยกเลิกการจองนี้ และเข้าใจว่ายกเลิกแล้วย้อนกลับไม่ได้ · en: I want to cancel this booking and understand it can't be undone |
| cancel.accept (คำขอ) | th: ฉันต้องการยื่นคำขอยกเลิก และเข้าใจเงื่อนไขข้างต้น · en: I want to request cancellation and understand the terms above |
| cancel.unpaidDone | th: ยกเลิกการจองแล้ว ที่นั่งถูกปล่อยคืน กรุณาอย่าโอนเงินสำหรับการจองนี้ · en: Your booking is cancelled and the seats have been released. Please don't send any payment for it. |
| en cancel.done | All set |
| cancel.kept | th: ส่วนที่ไม่คืนตามเงื่อนไข · en: Non-refundable under your terms |
| en cancel.refund | Refund due |
| en cancel.requested | Refund request sent. The amount follows your booking terms; the shop will review it and send the refund. Questions? Contact {contact} (booking code {code}) |
| en ทุกคีย์ที่มีวลีติดต่อ | Contact {contact} and quote booking code {code} |
| en verify.title | Verify it's your booking |
| verify.help | th: กรอกเบอร์โทรที่ใช้ตอนจอง หลังยืนยันคุณมีเวลาทำรายการ 15 นาที ถ้าเปลี่ยนเครือข่ายอาจต้องยืนยันใหม่ · en: Enter the phone number used for the booking. You'll then have 15 minutes to make changes; switching networks may ask you to verify again. |
| verify.locked | th: พิมพ์เบอร์ไม่ตรงหลายครั้ง ลองใหม่ได้ภายใน 24 ชั่วโมง หรือติดต่อร้าน {contact} พร้อมรหัสการจอง {code} · en: Too many wrong numbers. You can try again within 24 hours, or contact {contact} (booking code {code}). |
| err.AMOUNT_CHANGED | th: ยอดคืนเปลี่ยนไป (เช่น เลยกำหนดของขั้นก่อนหน้า หรือมีการบันทึกการชำระเงิน) ยอดใหม่อยู่ด้านล่าง ตรวจแล้วกดยืนยันอีกครั้ง · en: The refund amount has changed (for example, a cancellation deadline passed or a payment was recorded). Check the new amount below and confirm again. |
| ใหม่ err.INVALID_PHONE | th: กรอกเบอร์โทรให้ถูกต้อง · en: Please enter a valid phone number |
| en err.INVALID | Something went wrong with the form — reload the page and try again |
| refund.DONE | th: ร้านบันทึกว่าคืนเงิน {amount} แล้ว หากยังไม่ได้รับเงิน ติดต่อร้าน {contact} พร้อมรหัสการจอง {code} · en: The shop has marked a refund of {amount} as sent. If you haven't received it, contact {contact} (booking code {code}). |
| ใหม่ refund.byShopRejected | th: คำขอคืนเงินของการจองนี้ถูกปิดโดยร้าน หากมีคำถาม ติดต่อร้าน {contact} · en: The shop closed a refund request for this booking. Questions? Contact {contact}. |
| en cancel.legal | …Your minimum rights are set by the 2020 refund notice of Thailand's Tourism Business and Guide Committee… (คงเนื้อหาเดิม ปรับวลีนี้) |

ร้านไม่มีเบอร์/LINE: ทุกข้อความที่มี {contact} ต้องมีรูปไม่มีช่องทาง (มติ L8)

## รับงาน (ผู้คุม · 26 พ.ย.)
- ลำดับ: ผู้ร่าง → ผู้ตรวจออกแบบ/ความปลอดภัย (มติ K1–K16 · แยก a / a2 / b) → r1 → ผู้ตรวจ 2 FIX FIRST (L1–L12) → r2 → ผู้ตรวจรอบ 2 พบ action ทิ้งช่องฟอร์ม (P1–P4 · ข้อสอบผ่าน action/FormData จริง) → r3 → build + ภาพ 16 ใบ (ผู้คุมดูเอง) + นักล่า HTTP ~130 โพรบ (V1–V5: ปิด JS = 500 · แบนเนอร์หลังร้านปฏิเสธ · `e=LOCKED` ปลอม) → r4 → ผู้คุมรัน 119/120 · build ใหม่ · ยิงโพรบเบราว์เซอร์ซ้ำ (ปิด JS: ยืนยันเบอร์/ยกเลิก/หน้าชำระ W1.2 = 303 พร้อม Origin จริง) · ชุดถดถอยเต็ม 26 พ.ย.: ไม่มีแดงจากโค้ด · ไม่มีระเบิดเวลา
- สิ่งที่ได้: ลูกค้าถือลิงก์ + พิมพ์เบอร์ผู้จอง ⇒ สิทธิ์ 15 นาที (ผูก IP) ⇒ ยกเลิกก่อนจ่ายทันที / ยื่นคำขอคืนเงินหรือคำขอยกเลิกให้ร้านอนุมัติ · สถานะคำขอ · เพดานลองผิด 20 ครั้ง/24 ชม. (atomic) · ทุกอย่างผูกกับสิ่งที่ลูกค้าเห็น (รุ่น · ชนิด · ยอด ตรวจใต้ล็อก) · ไม่มีการอนุมัติอัตโนมัติ · ไม่ส่งข้อความ · ใช้ได้โดยไม่มี JS
- **แก้บั๊กของ W1.2a ไปด้วย:** หน้าชำระ `c/[basket]` ยืนยันการจองแบบปิด JS ไม่ได้ (metadata no-referrer ⇒ Origin:null) — แก้แล้ว
- ไม่ได้ถ่ายภาพ 16 ใบซ้ำหลัง r4 (r4 แก้ตรรกะแบนเนอร์/จอล็อก · ข้อสอบ V2/V3 เรนเดอร์หน้าจริง) · โพรบเก็บใน `ledger/trips-probes/w1.3/*.txt` (เครื่องนี้ไม่มี Playwright — ใช้ puppeteer-core จาก /root/dive3d)
- **หนี้ → W1.3b / ใบอื่น:** หลังลูกค้ายกเลิกเอง หน้าขึ้น "ทำรายการแล้ว" ตามด้วย "จัดการผ่านหน้านี้ไม่ได้แล้ว" (ถูกแต่ชวนตกใจ) · ป้าย "ลูกค้ายื่นเอง" บนจอร้าน + `by` ใน payload ของ `trips.refund.requested` + แจ้งพนักงาน (OQ41) · ผู้ถือลิงก์ล็อกเจ้าของได้ 24 ชม. · การคืนสิทธิ์ลองผิดไม่ผูกหน้าต่าง (เกิน 1 ครั้งได้) · การค้นส่งซ้ำ/`cancelledBySelf` สแกน audit ไม่มีดัชนี (tenantId, targetId) · ทดสอบเฉพาะ Chromium (ไม่ได้ลอง Firefox/Safari) · อายุ grant 15 นาทีพิสูจน์ด้วยนาฬิกาจำลอง · รูปแบบ "มีช่องทางติดต่อ" ของข้อความยังไม่ได้ดูด้วยตา (ร้าน seed ไม่มี X30 · ข้อสอบ L7/L8 ครอบ) · **W1.2b ต้องปิด C-12 ก่อนหมุด M1** (ลูกค้าบางรายยืนยันเบอร์ไม่ผ่าน) · W1.3a2 (เลื่อนรอบ · รอ OQ37) · W1.3b (ขอลิงก์ใหม่ + เครื่องมือร้านออกลิงก์)
- คำถามเจ้าของ: OQ37–OQ41
