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
