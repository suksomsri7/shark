# SHARK POS — วิธีสมัครและเปิดการเชื่อมต่อภายนอก (owner to-do)

สถานะวันนี้ (P3-SKEL): ทุกการเชื่อมต่อในหน้านี้เป็น **โครง** — ระบบพร้อมรับค่า แต่ทุกตัวตอบ "รอ credentials จากเจ้าของ" (`NOT_CONFIGURED`) และไม่ส่งอะไรออกไปจริง
สวิตช์เปิดใช้จริง = ใบงานตามต่อเมื่อเจ้าของส่งของในหน้านี้ครบ (W4 · W5 · W19 · W20 ใน `ledger/POS-OWNER-PENDING.md`) — ไม่ต้องเปลี่ยน schema หรือหน้าจอ

## 0. ก่อนวาง credentials ใด ๆ — ตั้งกุญแจเข้ารหัส `POS_CREDENTIALS_KEY`

- ผู้ดูแลระบบตั้ง env `POS_CREDENTIALS_KEY` บน production (Vercel → Settings → Environment Variables) เป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร เช่นผลของ `openssl rand -hex 32` (สั้นกว่านี้ระบบถือว่ายังไม่ตั้ง)
- ค่าลับทุกช่อง (client secret · partner key · webhook secret · API key) ถูกปิดกล่อง AES-256-GCM ด้วยกุญแจนี้ก่อนลงฐานข้อมูล · หน้าจอแสดงแบบปิดบัง `••••1234`
- ยังไม่ตั้ง = การ์ดตั้งค่าขึ้น "ยังไม่ตั้งกุญแจ" และบันทึกไม่ได้ (ไม่มีกุญแจสำรอง) · ห้ามใช้ค่าเดียวกับ `CHAT_CREDENTIALS_KEY` หรือ `SESSION_SECRET`
- เปลี่ยนกุญแจภายหลัง = ต้องวางค่าลับทุกช่องใหม่ (ระบบจะแจ้ง "กุญแจไม่ตรงกับที่ใช้ปิดข้อมูลเดิม")
- ผู้บันทึกได้: เจ้าของร้าน (OWNER) เท่านั้น · ผู้มีสิทธิ์จัดการช่องทาง/ตั้งค่าเห็นแบบปิดบัง

## 1. LINE MAN Wongnai (P3.1)

1. สมัคร LINE MAN Wongnai Partner (POS integration) ในนามบริษัท/ร้าน — ขอ sandbox/ร้านทดสอบ
2. สิ่งที่ต้องได้: `client_id` · `client_secret` · รหัสร้าน/สาขาบน LINE MAN (`restaurant_id`) ต่อสาขา · กุญแจลงลายเซ็น webhook (`webhookSecret`)
3. ที่ POS: ตั้งค่า → ช่องทางขาย → LINE MAN → วิธีรับออเดอร์ = API → วางค่าทั้ง 4 ช่อง
4. ให้ URL webhook จากการ์ด (`https://shark.in.th/api/pos/platform/LINEMAN/<channelId>`) กับ LINE MAN
- ⚠️ ชื่อฟิลด์มาจากเอกสาร partner สาธารณะตอนร่าง — ผู้ดูแล partner ของ LINE MAN ยืนยันตอนอนุมัติ
- ระหว่างรอ: พนักงานคีย์ออเดอร์จากแท็บเล็ตของ LINE MAN แบบเดิม (ช่องทาง MANUAL) ได้ตามปกติ

## 2. Grab (GrabFood · P3.2)

1. สมัคร GrabFood Partner API (OAuth2 client-credentials) — ขอ sandbox
2. สิ่งที่ต้องได้: `client_id` · `client_secret` · GrabFood `merchant_id` ต่อสาขา · `webhookSecret` = ความลับที่ **เรา** ออกให้ Grab ใช้เรียกเรา
3. ที่ POS: ช่องทาง Grab → API → วางค่า · ให้ URL webhook จากการ์ดกับ Grab
- โครงรองรับเฉพาะหัว `x-shark-signature` (hex HMAC-SHA256 ของเนื้อคำขอด้วย webhookSecret) — รูปแบบจริงของ Grab ตัดสินในใบ P3.2-real

## 3. Shopee · Lazada · TikTok Shop (P3.3)

- Shopee: `partner_id` · `partner_key` · `shop_id` + การอนุญาตร้านผ่าน OAuth ของ Shopee (ต้องมีแอปจริง — ไม่อยู่ในโครง)
- Lazada: `app_key` · `app_secret` · seller ID + seller token
- TikTok Shop: `app_key` · `app_secret` · shop id/cipher + token
- สมาชิกจาก marketplace = ยังไม่ทำ (มติ §10-7) — ข้อมูลผู้ซื้อมักถูกปิดบังและต้องมีความยินยอม

## 4. Beam (PromptPay/บัตรผ่าน Beam · กระทบยอด P3.10)

- ใช้ merchant ของ **SHARK เอง** เท่านั้น (ห้ามใช้ของโปรเจกต์อื่น) — env `BEAM_MERCHANT_ID` · `BEAM_API_KEY` · `BEAM_WEBHOOK_SECRET` บน production
- ตั้ง webhook ของ Beam ไปที่ `https://shark.in.th/api/payment/beam/webhook`
- ⚠️ ยืนยันรูปแบบลายเซ็น webhook ตอนเรียก sandbox ครั้งแรก (โค้ดวันนี้ = hex HMAC-SHA256 ของเนื้อคำขอด้วย secret ดิบ · ระบบอื่นที่เคยเห็น = base64 ด้วย secret ที่ถอด base64) — แก้ที่ `src/lib/payment/beam.ts` (ของแพลตฟอร์ม ใช้ร่วม AI/บัญชี)
- ส่งไฟล์ settlement ตัวอย่าง 1 ไฟล์ — ปุ่มนำเข้าตอบ "ยังไม่เปิด" จนกว่าจะรู้รูปคอลัมน์ · รายงานกระทบยอดใบขอรับเงิน (ต่อวัน/ชนิด + CSV) พร้อมฝั่งระบบแล้ว (หน้าจอ = ใบ P3-SKEL U)
- สลิปโอน: ฝั่งระบบพร้อม (ปุ่มแนบ/แผ่นยืนยัน = ใบ P3-SKEL U · เก็บแบบไฟล์ส่วนตัว · ค่าปริยาย 5 ปี ขั้นต่ำ 90 วัน — W19) · ผู้จัดการยืนยัน ไม่ใช่ผู้แนบ · ตรวจสลิปอัตโนมัติ (SlipOK / EasySlip / API ธนาคาร) รอเจ้าของเลือก (W20)

## 5. e-Tax Invoice by Email (P3.11a)

- เลือกผู้ให้บริการที่ได้รับอนุญาตจากกรมสรรพากร (เช่น INET · Leceipt …) + สมัคร e-Tax Invoice by Email ของร้านผ่านผู้ให้บริการ (W20)
- สิ่งที่ต้องได้ (ตัวแทน — ผู้ให้บริการยืนยันชื่อจริง): API user / API key / seller id
- วันนี้: บิลที่ออกใบกำกับเต็มรูปและมีอีเมลผู้ซื้อ ดูตัวอย่าง XML (ขมธอ. 3-2560 ส่วนย่อย) ได้ · ปุ่มส่งตอบ "รอผู้ให้บริการ"
- สถานะการส่ง (`AccountDocument.etaxStatus/etaxMeta`) เจ้าของโมดูลบัญชีเป็นผู้ต่อสายเมื่อเลือกผู้ให้บริการแล้ว

## 6. ตัวช่วยพิมพ์ LAN — print agent (P3.11b)

เบราว์เซอร์ (รวม iPad) เปิดพอร์ต 9100 ของเครื่องพิมพ์ไม่ได้ ⇒ ใช้ **ตัวช่วยพิมพ์ (agent)** บนเครื่องใดก็ได้ใน LAN ของร้านที่ต่อ "ออก" หา SHARK:

1. ตั้งค่าเครื่อง → ตัวช่วยพิมพ์ LAN (การ์ดหน้าจอ = ใบ P3-SKEL U) → ลงทะเบียน (ใส่ชื่อ + เครื่องพิมพ์ `ชื่อ · IP · พอร์ต 9100–9102 หรือ 515 · งาน kitchen/receipt` — agent ที่มีเครื่องเดียวไม่ต้องระบุงาน) → **คัดลอกโทเคน (แสดงครั้งเดียว)**
2. บนเครื่องในร้าน (PC / Raspberry Pi / Android Termux · Node ≥ 18): คัดลอกไฟล์ `tools/pos-print-agent/agent.mjs` แล้วรัน
   `SHARK_POS_URL=https://shark.in.th SHARK_PRINT_AGENT_TOKEN=<โทเคน> node agent.mjs`
3. agent ต่อเครื่องพิมพ์ได้เฉพาะที่อยู่ใน LAN (10.x · 172.16–31.x · 192.168.x · 127.x · *.local) และพอร์ต 9100–9102/515
4. เพิกถอนในหน้าตั้งค่า = โทเคนใช้ไม่ได้ทันที · งานพิมพ์ค้างเกิน 10 นาทีหมดอายุเอง
- ทดสอบกับเครื่องพิมพ์จริง (ตัดกระดาษ · ลิ้นชัก · โค้ดเพจไทย) = W5
