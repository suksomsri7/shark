# S3a.1-R — เส้นโมเดลจริง 3 เส้น (docs/modules/31-secretary.md §1.5 · R-1 ของ qc-sec-s3a.1) · เลน b · สาขา `wip/sec-real` จาก dab5fb9f4
Read COMMON ก่อน · ห้ามอ่าน/แก้/พิมพ์ `.env*` (ตรวจชื่อคีย์ได้ด้วย `grep -c '^KEY=' .env.qc-sec` เท่านั้น) · ฐาน QC ผ่าน `scripts/qc-sec.sh` เท่านั้น · ห้าม CI=1 · ห้าม push · ห้ามติดตั้งแพ็กเกจ

## งาน
เขียน `scripts/qc-sec-real.mts` (ผู้คุมจะรันซ้ำเอง) ที่ขับ 3 เส้นด้วยโมเดลจริงผ่าน route จริง (ไม่ mock · `AI_PROVIDER=anthropic` · `SHARK_ANTHROPIC_KEY` มีใน .env.qc-sec แล้ว · ห้ามตั้ง SHARK_AI_MOCK) บน tenant ทดสอบที่สคริปต์สร้างเองและลบทิ้งตอนจบ (cleanup ใน finally):
1. **ใบเสนอราคา → ส่ง LINE ลูกค้า**: ห้องเลขาบริบทลูกค้า (ChatContact.customerId ผูก) สั่ง "ร่างใบเสนอราคา … แล้วส่งให้ลูกค้าทาง LINE" ⇒ คาด proposal `account.*` + `chat.send` (ชั้นต้องอนุมัติ) → อนุมัติ → ตรวจผล (ใบ DRAFT/ส่งออก · ข้อความ chat ออกผ่าน provider mock ของ LINE ถ้ามี · ไม่ส่งออกจริง)
2. **ขาย POS v2 + แต้มสมาชิก**: "เปิดบิลขาย … ให้สมาชิก … สะสมแต้ม" ⇒ `pos.*` + แต้ม → อนุมัติ → ตรวจบิล + แต้ม
3. **คืนมัดจำนัดหมาย**: "คืนมัดจำนัดหมายของคุณ…" ⇒ `booking.refund_deposit` (ALWAYS approve) → อนุมัติ → ตรวจ `bookingSvc.refundDeposit` ผล
ต่อเส้น: จด **ต้นทุนจริงต่อห้อง** จาก AiUsage/AiCreditTxn (micro + tokens in/out + โมเดลที่ใช้ fast/smart) · เวลาตอบ · จำนวนรอบ tool · ข้อความที่โมเดลตอบ (ย่อ 200 ตัวอักษร) · ผ่าน/ตก ต่อเส้น พร้อม "ทำไม" (เช่น โมเดลไม่เรียก tool ที่คาด = จด ไม่ใช่แก้ prompt เอง)
กติกา: ใช้ fixture/helper เดิมจาก `scripts/qc-sec-s3a.1.mts` (คัดลอกส่วนที่ต้องใช้ ไม่แก้ไฟล์นั้น) · retry ต่อเส้น ≤2 ถ้าโมเดลตอบไม่ตรง (จดทุกรอบ) · เพดานค่าใช้จ่ายรวม ≤ ฿30 (หยุดถ้าเกิน) · ห้ามแก้โค้ดผลิตภัณฑ์ในใบนี้ — พบบั๊ก = จดใน wo-note เป็น FINDING พร้อมหลักฐาน · รัน: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 AI_PROVIDER=anthropic SEC_REAL_MODEL=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-real.mts` (gate lock อาจรอ chain ของผู้คุม ~45 นาที — รอ ไม่ข้าม)
ส่งงาน: typecheck 0 · fitness · wo-note `ledger/wo-notes/sec-s3a1-r.md` (ตารางต้นทุน/ผลต่อเส้น + FINDING) · commit (ห้าม push) · รายงาน SHA + JSON_SUMMARY {total:3,…} + ต้นทุนรวม
