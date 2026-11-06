# S3a.1-R2 — แก้ผลเส้นโมเดลจริง (RESOLUTIONS §Z.6 R-Z41…R-Z45) · เลน c · ต่อจากทิปผู้คุมล่าสุด (merge SHA ตรง)
Read COMMON · §Z.6 ทั้งหมด · `ledger/wo-notes/sec-s3a1-r.md` (FINDING F1–F6 พร้อมบรรทัดอ้างอิง) · `scripts/qc-sec-real.mts` (ตัวขับ · อ่านเพื่อรู้ว่าอะไรถูกตรวจ ห้ามแก้)
## งาน
1. R-Z41 นัดหมาย: `today_appointments`/`upcoming_schedule` คืน id + `includeCancelled` + ข้อมูลมัดจำ · คำอธิบาย `refund_booking_deposit`
2. R-Z42 POS: `pos_create_sale.memberId` → `posSvc.createSale({memberId})` · `customer_search` คืน id · คำอธิบาย point_adjust
3. R-Z43 routing: ACTION_WORDS
4. R-Z44 ราคาแคช: pricing.ts · provider.ts (AiReply cacheWrite/cacheRead · parseAnthropicReply) · credit.ts chargeUsage · ทุกจุดที่เรียก costMicroUsd ยังคอมไพล์
5. R-Z45 ส่งใบเสนอราคา: คำอธิบาย tool สร้างเอกสาร (account-ops) + `dispatchChatSend` เติมเลขที่/ลิงก์จากใบ EXECUTED ล่าสุดในห้อง · ล้มด้วยข้อความไทยถ้ายังไม่มี
## ข้อสอบ
เขียน `scripts/qc-sec-s3a1-r2.mts` (ผู้คุมจะทบทวน): T1 today/upcoming คืน id · includeCancelled รวม NO_SHOW พร้อมมัดจำ · ปริยายไม่รวม · T2 pos_create_sale ผ่าน runTool + execute ⇒ บิลมี memberId · ระบายคิวร้านทดสอบ ⇒ แต้ม > 0 ตามอัตราร้าน · ไม่ส่ง memberId = เหมือนเดิม · customer_search มี id · T3 pickModel("ร่างใบเสนอราคาให้…") = smart · "ยอดขายวันนี้" = fast (เดิม) · T4 costMicroUsd(sonnet, 1000, 100, {write 40000, read 70000}) = ค่าที่คำนวณมือ · parseAnthropicReply แยกแคช · chargeUsage หักตามจริง (AiCreditTxn) · T5 chat.send kind=quote ไม่มี documentId: ไม่มีใบ ⇒ ล้มไทย+ใบคง PENDING · มีใบ EXECUTED ในห้อง ⇒ ข้อความมีเลขที่+ลิงก์ · ใบของห้องอื่น ⇒ ไม่หยิบ
regression: qc-sec-s3a1-s2 · qc-sec-s3a.1 · qc-sec-s1.12 · qc-sec-s1.19 · qc-ai-credit · qc-chat-api-v1 · qc-booking-deposit · qc-pos-p6.1 ถ้ารันบนฐานนี้ได้ (ถ้าปฏิเสธฐาน = จด) · typecheck 0 · fitness ×2 · docs: `docs/modules/31-secretary.md` §1.5 เพิ่มหมายเหตุ 3 บรรทัด (ส่งใบในเทิร์นเดียว · แต้มจากบิล · includeCancelled) · wo-note `ledger/wo-notes/sec-s3a1-r2.md` · commit (ห้าม push) · ห้ามเรียกโมเดลจริง (ไม่มีคีย์ในทรีนี้ — ผู้คุมรันเอง)
