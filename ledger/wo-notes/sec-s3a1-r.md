# WO S3a.1-R — เส้นโมเดลจริง 3 เส้น (docs/modules/31-secretary.md §1.5 · R-1 ของ qc-sec-s3a.1)

> RUN "เลขา AI" (SECRETARY) · เลน b `/root/projects/shark-sec-b` · สาขา `wip/sec-real` (จาก cee192f33) · 2026-11-06 05:29Z
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S3a.1-R.md` (+ COMMON) · ตัวขับ `scripts/qc-sec-real.mts` (ใหม่ · ไม่แตะโค้ดผลิตภัณฑ์ · ไม่แตะ `qc-sec-s3a.1.mts`)

## 0. สถานะสั้น
- **รอบโมเดลจริงยังไม่ได้รันในเลนนี้** — `.env.qc-sec` ของทรี b ไม่มีคีย์ (`grep -c '^SHARK_ANTHROPIC_KEY=' .env.qc-sec` = **0** · ไฟล์ลงวันที่ 4 พ.ย.) ส่วนไฟล์ของทรีผู้คุมมี 1 (ลงวันที่ 6 พ.ย. 04:37) · COMMON A.5 ระบุว่าขาดค่า = หยุดแล้วรายงาน ⇒ ไม่คัดลอก/อ่านไฟล์ env ของทรีอื่น
- ตัวขับพิสูจน์แล้วด้วย **โหมดแห้ง** (`SEC_REAL_DRY=1`) บนฐาน QC เลขา: route จริง (`POST /api/mobile/secretary/rooms` → worker → `sendMessage` → `AnthropicProvider` ตัวจริง) มีแค่ขั้น HTTP ไปยัง api.anthropic.com ที่ตอบด้วยสคริปต์ในเครื่อง → อนุมัติผ่าน route จริง → ตรวจผลในฐาน → ลบทั้งร้าน ⇒ **3/3 ผ่าน · residue 0 · ไม่มีคำขอออกนอกเครื่อง** · ต้นทุนจริง ฿0
- ผู้คุมรันโหมดจริงด้วยคำสั่งในใบได้ทันที (คีย์อยู่ในไฟล์ env ของผู้คุม ซึ่ง `loadLegacyQcEnv` โหลดให้)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `scripts/qc-sec-real.mts` | ใหม่ | ตัวขับ 3 เส้น (จริง/แห้ง/SKIP) · ตัวครอบ fetch (นับรอบ/เวลา/โมเดล/token แคช · เพดาน ฿30 · กันออกนอกเครื่อง) · LINE จำลอง 127.0.0.1 · ลบทั้งร้านใน finally |
| `ledger/wo-notes/sec-s3a1-r.md` | ใหม่ | ไฟล์นี้ |

## 2. วิธีรัน
- จริง (ผู้คุม): `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 AI_PROVIDER=anthropic SEC_REAL_MODEL=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-real.mts`
- แห้ง: `... env QC_FORCE=1 SEC_REAL_DRY=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-real.mts`
- ตัวเลือก: `SEC_REAL_ONLY=quote_line,refund` (รันบางเส้น) · `SEC_REAL_MAX_THB=<≤30>` (ลดเพดาน)
- ไม่มีธง/ไม่มีคีย์ ⇒ `SKIP` exit 0 พร้อม `JSON_SUMMARY {total:3, passed:0, skipped:[3 เส้น], reason}` (ตรวจแล้วทั้งสองแบบ)

## 3. การออกแบบตัวขับ
- **1 ร้านทดสอบต่อเส้น** (slug `qc-sec-real-<เส้น>-<stamp>` · ผู้ใช้ `secreal-*`) ⇒ ต้นทุนต่อห้องแยกขาด · สารบัญสกิลมีเฉพาะระบบที่เส้นนั้นใช้ · ลบด้วยการลบทุกตารางที่มี `tenantId` (แบบ `wipeTenant` ของ qc-pos-p1.8 · ตรวจ slug ก่อน) + ผู้ใช้/session/ถังกันซ้ำ
- ต่อรอบ: `POST rooms` (คำสั่ง + `context.chatConversationId` สำหรับเส้น 1) → worker รันในคำขอ (`after()` นอก request = รอจนจบ) → อ่าน `aiProposal` ทั้งห้อง → อนุมัติทุกใบที่รอผ่าน `proposals/[id]/approve` (`plans/[id]/approve` ถ้าเป็นแผน) ในฐานะ OWNER (เส้น 1 อนุมัติ `chat.send` หลังสุด) → ตรวจผลในฐาน
- **ลองซ้ำ ≤ 2** (ห้องใหม่ คำสั่งเดิม ไม่แก้คำสั่ง) เฉพาะเมื่อโมเดลไม่ได้เสนอ kind ที่คาด · ถ้าเสนอครบแล้วแต่ผลตก = ปัญหาฝั่งระบบ ⇒ ไม่ลองซ้ำ · จดทุกรอบ
- ต้นทุน = `AiCreditTxn` (USAGE · `conversationId` ของห้อง: micro, tokensIn/out, ป้ายโมเดลของผลิตภัณฑ์) · โมเดลที่ตอบจริง, จำนวนรอบ, ชื่อเครื่องมือ, เวลา, token แคช read/write = ตัวครอบ fetch (อ่านคำตอบอย่างเดียว)
- เพดาน ฿30 (`thbPerUsd()` ของผลิตภัณฑ์ = 36 ⇒ 833,333 micro): ก่อนยิงทุกครั้ง ถ้ายอดสะสมถึงเพดาน ตัวครอบตอบ 429 โดยไม่ออกนอกเครื่อง แล้วข้ามเส้นที่เหลือ (`capHit`)
- ออกนอกได้เฉพาะ api.anthropic.com (โหมดจริง) + `*.neon.tech` · LINE = เซิร์ฟเวอร์จำลอง (`LINE_API_BASE=http://127.0.0.1:<port>` ตามทางที่ `line.ts` เปิดไว้นอก prod) · อย่างอื่นตอบ 503 และจดใน `blocked`
- ถอด `SHARK_AI_MOCK`/`SHARK_AI_MODEL` ออกจาก env ของโพรเซสถ้ามี (routing เป็นของผลิตภัณฑ์)

| เส้น | fixture | คำสั่ง | คาด | ผ่านเมื่อ |
|---|---|---|---|---|
| quote_line | ACCOUNT+CHAT+MEMBER · ลูกค้าสมาชิก "คุณสมชาย ใจดี" · ผู้ติดต่อบัญชีชื่อเดียวกัน · การเชื่อม LINE (โทเค็นปลอม) · ห้องแชท LINE ผูก `customerId` · แชท=DRAFT ผ่าน `PUT access` | ร่างใบเสนอราคาเครื่องชงกาแฟ 2 ชุด ชุดละ 4,500 บาท ให้คุณสมชาย แล้วส่งให้ลูกค้าทาง LINE | `account.*` + `chat.send` | อนุมัติทุกใบ ok · มี QUOTATION · ข้อความ OUT `SENT` · LINE จำลองได้รับ push ถึงผู้ใช้ LINE ของลูกค้า |
| pos_points | POS+MEMBER+POINT ผูกสาขาเดียว · สินค้า ลาเต้เย็น ฿85 / อเมริกาโน่ ฿65 · สมาชิก "คุณมานะ รักดี" 0899180001 · 25 บาท/แต้ม | เปิดบิลขายลาเต้เย็น 2 แก้ว แก้วละ 85 บาท จ่ายเงินสด ให้สมาชิกคุณมานะ เบอร์ 089-918-0001 แล้วสะสมแต้มให้ด้วย | `pos*` + แต้ม (`point_adjust` / `member.*point*`) | อนุมัติ ok · บิล PAID · ยอดแต้มสมาชิก > 0 |
| refund | สาขา BOOKING + POS + BOOKING · นัด "คุณสมศรี มีสุข" มัดจำ ฿500 รับผ่าน `recordDeposit` (ใบรับ POS จริง) แล้วยกเลิก ⇒ `REFUND_DUE` (ตรวจใน fixture) | คืนมัดจำนัดหมายของคุณสมศรีที่ยกเลิกไปแล้ว | `booking_refund_deposit` | อนุมัติ ok · PosDeposit `REFUNDED` 50000 · ใบคืน 1 ใบ |

## 4. ผลรอบแห้ง (ฐาน QC เลขา · 06 พ.ย. ~05:2xZ · exit 0)
`qc-sec-real: 3/3 ผ่าน · ต้นทุนรวม 207230 micro ≈ ฿7.46 (เพดาน ฿30) · residue 0 · ถูกกันออกนอก 0`

| เส้น | ผล | ต้นทุน (micro · บาท) ⚠️ ประมาณ | tokens in/out | ป้ายโมเดลของผลิตภัณฑ์ | เวลา | รอบโมเดล · เครื่องมือ | ผลในฐาน |
|---|---|---|---|---|---|---|---|
| quote_line #1 | ผ่าน | 37,433 · ฿1.35 | 36,743 / 138 | **fast tier** (ดู F3) | 1,147 ms | 3 · load_skill → account_create_document + send_customer_message | QUOTATION/DRAFT ฿9,630 (VAT แยก) · OUT SENT ลงชื่อ Shark · LINE push 1 |
| pos_points #1 | ผ่าน | 135,324 · ฿4.87 | 44,483 / 125 | smart tier | 782 ms | 3 · load_skill → pos_create_sale + point_adjust | SALE/PAID ฿170 **memberId ว่าง · pointEarned 0** · แต้ม ADJUST +6 ไม่มี ref (ดู F2) |
| refund #1 | ผ่าน | 34,473 · ฿1.24 | 11,121 / 74 | smart tier | 733 ms | 3 · load_skill → refund_booking_deposit (**id นัดใส่ให้ในสคริปต์** · ดู F1) | PosDeposit REFUNDED 50000 · ใบคืน 1 · audit 1 |

⚠️ รอบแห้ง: token ขาเข้า = ความยาวคำขอ/4 (ประมาณขนาด prompt+สคีมาเครื่องมือ — ภาษาไทยมักนับได้ต่ำกว่าจริง) · token ขาออก/ข้อความตอบ/เวลาไม่ใช่ของโมเดล · ไม่มีแคช ⇒ ใช้แค่ดูลำดับขนาด ไม่ใช่ต้นทุนจริง · ข้อความตอบ = สคริปต์
**ตารางโมเดลจริงยังว่าง** — ผู้คุมรันแล้วคัดลอกบรรทัด `| <เส้น> #n | …` จากผลลัพธ์ (ตัวขับพิมพ์ครบ: ผ่าน/ตก · micro+บาท · tokens in/out + cache r/w · โมเดลจริง [ป้ายผลิตภัณฑ์] · ms · รอบ+เครื่องมือ · ข้อความตอบย่อ) + `JSON_SUMMARY`

## 5. FINDING (จากโค้ด + หลักฐานรอบแห้ง · ไม่ได้แก้โค้ดผลิตภัณฑ์)
| # | ระดับ (เสนอ) | เรื่อง | หลักฐาน | ผลที่คาดในรอบจริง |
|---|---|---|---|---|
| F1 | MAJOR | **เส้น 3 โมเดลหา id นัดไม่ได้**: `refund_booking_deposit` ต้องการ `appointmentId` และคำอธิบายชี้ให้ใช้ `today_appointments`/`upcoming_schedule` แต่ทั้งสองตัวกรอง `status notIn [CANCELLED, NO_SHOW]` และไม่คืน id (คืนแค่ เวลา/ลูกค้า/บริการ/ช่าง) ⇒ มัดจำที่คืนได้มีเฉพาะนัด CANCELLED/NO_SHOW ซึ่งไม่มีเครื่องมืออ่านตัวไหนเห็น | `src/lib/ai/tools.ts:1497` (คำอธิบาย) · `:1302-1333` today_appointments · `:2117-2186` upcoming_schedule · digest ห้องเลขานับเฉพาะนัดพรุ่งนี้ที่ไม่ยกเลิก (`secretary/digest.ts:15`) | คำสั่งที่บอกแค่ชื่อลูกค้า ⇒ โมเดลถามกลับ/เดา id/ตอบว่าทำไม่ได้ ⇒ คาดว่า **ตก** · รอบแห้งผ่านเพราะสคริปต์ใส่ id ให้ |
| F2 | MAJOR | **บิล POS จากเลขาผูกสมาชิกไม่ได้ ⇒ ไม่สะสมแต้มตามกติกา**: `pos_create_sale` ไม่มีช่องสมาชิก · dispatch เรียก `posSvc.createSale` โดยไม่มี `memberId` ⇒ consumer `onPosSalePaid` ไม่ทำงาน (ไม่มีแต้มตามอัตรา 25 บาท/แต้ม · ยอดซื้อสะสม/ประวัติสมาชิกไม่อัปเดต) · ทางเดียวที่ได้แต้มคือข้อเสนอ `point_adjust` แยก ซึ่งโมเดลกำหนดจำนวนแต้มเอง และไม่ผูกบิล | `tools.ts:1070-1134` (สคีมา `additionalProperties:false` ไม่มี member) · `proposals.ts:818-853` · `member-bridges.ts:270` (return เมื่อไม่มี memberId) · รอบแห้ง: `SALE/PAID/17000/member=ไม่มี/earn=0` + `ADJUST:6:-` | เส้น 2 "ผ่าน" ได้แค่ในความหมาย "บิล + แต้มเพิ่ม" · จำนวนแต้มขึ้นกับโมเดล (อาจไม่ตรงกติกาของร้าน) · ควรเพิ่ม `memberId/phone` ใน `pos_create_sale` หรือเปิด `orders.create`/`sales.create` ที่รับสมาชิกเป็นเครื่องมือ (ผู้คุมตัดสิน) |
| F3 | MINOR→MAJOR | **routing เลือก fast tier ให้คำสั่ง "ร่างใบเสนอราคา…แล้วส่งให้ลูกค้า"**: `pickModel` เลือก smart เมื่อมีคำใน `ACTION_WORDS` หรือยาว > 120 ตัวอักษร — "ร่าง"/"ส่ง"/"ใบเสนอราคา" ไม่อยู่ในรายการ และคำสั่งยาว ~85 ตัวอักษร ⇒ งานเขียน 2 ข้อเสนอ (เอกสารเงิน + ข้อความถึงลูกค้า) ใช้ fast tier | `src/lib/ai/provider.ts` `ACTION_WORDS`/`pickModel` · รอบแห้ง `AiCreditTxn.model` ของห้องเส้น 1 = ป้าย fast tier · เส้น 2 ได้ smart เพราะมี "ขาย"/"เปิดบิล" · เส้น 3 ได้ smart เพราะบังเอิญมีคำว่า "ยกเลิก" ("คืน" ไม่อยู่ในรายการ — "คืนมัดจำนัดของคุณสมศรี" เฉย ๆ จะได้ fast) | คุณภาพการเรียกเครื่องมือหลายตัวของเส้น 1 อาจต่ำกว่า · ต้นทุนถูกกว่า · ผู้คุมดูผลจริงก่อนตัดสิน |
| F4 | MINOR | **ต้นทุนในบัญชีไม่ตรงบิลผู้ให้บริการเมื่อแคชทำงาน**: `parseAnthropicReply` รวม `cache_read` + `cache_creation` เข้า `tokensIn` แล้ว `costMicroUsd` คิดทุก token ขาเข้าราคาเดียว ⇒ token ที่อ่านจากแคชถูกคิดเต็มราคา (ราคาจริงต่ำกว่ามาก) · token ที่เขียนแคชคิดต่ำกว่าจริงเล็กน้อย | `provider.ts` `parseAnthropicReply` (tokensIn = input + cache_creation + cache_read) · `pricing.ts` `costMicroUsd` | `AiCreditTxn` น่าจะ **สูงกว่า** บิลจริงเมื่อมีหลายรอบในเทิร์นเดียว (แคช system+tools) · ตัวขับจด cache r/w แยกต่อรอบไว้ให้คำนวณเทียบ |
| F5 | MINOR | `scripts/sec-real-path.mts` (S1.14) สร้างนัด B ตรง ๆ (`depositPaidAt` โดยไม่มี `depositSaleId`/PosDeposit) ⇒ เครื่องมือเสนอได้แต่ตอนอนุมัติ `refundDepositByShop` → `refundOne` ตอบ BAD_STATE "มัดจำนี้ไม่ได้ออกใบรับในระบบขาย" ⇒ ตัวเลข/ผลเส้นคืนมัดจำจากสคริปต์นั้นตกเสมอที่ขั้นอนุมัติ | `scripts/sec-real-path.mts:130` · `booking/deposit.ts:766` | ตัวขับใหม่ใช้ `recordDeposit` (ใบรับ POS จริง) แทน |
| F6 | ข้อสังเกต | ข้อความ `chat.send` ถูกเสนอในเทิร์นเดียวกับใบเสนอราคาที่ยังไม่เกิด ⇒ ข้อความถึงลูกค้าใส่เลขที่/ลิงก์ใบไม่ได้ (ใบ DRAFT ยังไม่มีเลข · `documentId` ว่าง) | รอบแห้ง: ข้อความ OUT ไม่มีเลขใบ (`docNo` = null) | รอยืนยันกับรอบจริง (โมเดลอาจเขียน "ใบเสนอราคาแนบ" ทั้งที่ไม่มีลิงก์) |
| B1 | ตัวบล็อก | ไม่มี `SHARK_ANTHROPIC_KEY` ใน `.env.qc-sec` ของทรี b ⇒ รอบจริงในเลนนี้ทำไม่ได้ | `grep -c` = 0 (ทรี b) | ผู้คุมรันในทรีที่มีคีย์ หรือเพิ่มคีย์ในไฟล์ของทรี b แล้วสั่งเลนรันซ้ำ |

## 6. ด่าน
- typecheck: `env NODE_OPTIONS=--max-old-space-size=9000 ISO_MEM=10000M bash scripts/iso.sh pnpm exec tsc --noEmit -p tsconfig.json` ⇒ **EXIT 0**
- fitness (มี env ผ่าน qc-sec.sh): `JSON_SUMMARY {"total":53,"passed":53,"findings":[]}` EXIT 0 · `env -u DATABASE_URL`: `{"total":53,"passed":53,"findings":[]}` EXIT 0
- รอบแห้ง: `JSON_SUMMARY {"total":3,"passed":3,"failed":[],"skipped":[],"mode":"dry","costMicro":207230,"costThb":7.46,...,"residue":0}` EXIT 0
- SKIP: ไม่มีธง ⇒ exit 0 `reason: ไม่ได้ตั้ง SEC_REAL_MODEL=1` · ธงจริงแต่ไม่มีคีย์ ⇒ exit 0 `reason: ไม่มี SHARK_ANTHROPIC_KEY`
- ค่าโมเดลที่ใช้จริงในใบนี้: **฿0** (ไม่มีคำขอออกนอกเครื่อง)

## 7. ตัดสินใจเองนอกใบ
1. 1 ร้านทดสอบต่อเส้น (ใบเขียน "tenant ทดสอบ") — แยกต้นทุนต่อห้อง + เลี่ยง `resolveUnit` "มีหลายสาขา" ของ `pos_create_sale` · ผลข้างเคียง: สารบัญสกิลเล็กกว่าร้านจริงที่เปิดทุกระบบ ⇒ ต้นทุนจริงอาจต่ำกว่าร้านจริงเล็กน้อย
2. ตีความ "retry ≤ 2" = ครั้งแรก + ลองซ้ำอีกไม่เกิน 2 (รวม ≤ 3 ห้อง/เส้น) · ไม่ส่งข้อความตามในห้องเดิม (ต่างจาก sec-real-path ที่ส่ง "ยืนยัน ทำตามนั้นเลย") เพื่อไม่ชี้นำโมเดล · ไม่ลองซ้ำเมื่อโมเดลเสนอครบแล้วแต่ผลตก
3. เพิ่มโหมดแห้ง `SEC_REAL_DRY=1` (ตอบ api.anthropic.com ด้วยสคริปต์ในเครื่อง · ใส่ค่าคีย์หลอกเฉพาะในโพรเซส) เพื่อพิสูจน์ตัวขับโดยไม่มีคีย์ — ไม่ใช่ MockProvider และไม่ตั้ง `SHARK_AI_MOCK`
4. เส้น 1 ใช้ช่องทาง LINE จริงในโค้ด (การเชื่อมต่อ + LINE จำลอง 127.0.0.1) แทน WEBCHAT ของ sec-real-path — ตรงคำว่า "ส่งให้ลูกค้าทาง LINE"
5. "ผ่าน" ของเส้น 2 = บิล PAID + แต้มสมาชิก > 0 (ไม่บังคับให้บิลผูกสมาชิก เพราะเครื่องมือทำไม่ได้ — จดเป็น F2)
6. ไม่เรียก `drainAll()` ของ outbox (กันไปประมวลผล event ของร้านอื่นในฐาน QC ร่วม) — POS ปลุก drain ในโพรเซสเองหลัง commit · ผลแต้มของเส้น 2 ไม่พึ่ง outbox อยู่แล้ว (F2)

## 8. ต่อ (ผู้คุม)
1. รันโหมดจริงด้วยคำสั่ง §2 ในทรีที่มีคีย์ → คัดลอกตาราง + `JSON_SUMMARY` ลง §4 (หรือส่งกลับให้เลน b เติม)
2. ตัดสิน F1–F4 (ใบแก้แยก)
