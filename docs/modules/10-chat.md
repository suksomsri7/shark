# ระบบ 10 — รวม Chat (Omni-channel Inbox: LINE · WhatsApp · Shopee · Lazada · Facebook · Instagram)

> 🔄 **REWRITE ทั้งไฟล์ 2026-07-11 ตามความต้องการใหม่ของเจ้าของ** — override สเปค 10-chat.md เดิมทั้งฉบับ
> ยึด: `../BLUEPRINT_SYSTEMS.md` (ทุกอย่างคือระบบ) · `_CONVENTIONS.md` (contracts v2 + โครง 12 หัวข้อ)
> ⚠️ scope ในตาราง `_CONVENTIONS §1` ที่เขียนว่า Chat = tenant ถูก **override เป็น system-scoped** ตาม BLUEPRINT_SYSTEMS §5
> คู่แฝดคนละตัว: ระบบ 11 Meeting = แชท**ภายในองค์กร** — คนละ inbox คนละ data model **ห้ามปนกันเด็ดขาด** (ดู §1.5)

---

## 1. ภาพรวม + ขอบเขต

### 1.1 ทำอะไร

**"รวม Chat" = inbox เดียว รวมแชทลูกค้าจาก 6 ช่องทางภายนอก + webchat ของแพลตฟอร์ม** — ร้านค้าไทยขายหลายช่องทาง (LINE OA, Facebook Page, IG, Shopee, Lazada, WhatsApp) ต้องเปิด 6 แอปสลับตอบ → ระบบนี้ดึงทุกข้อความมารวมจอเดียว ตอบกลับจากที่เดียว จากมือถือได้

- **ช่องทาง 7 ชนิด:** `WEBCHAT` (built-in บน storefront), `LINE` (OA / Messaging API), `FACEBOOK` (Messenger), `INSTAGRAM` (DM), `SHOPEE` (seller chat), `LAZADA` (IM), `WHATSAPP` (Business Cloud API)
- ทุกช่องทางวิ่งผ่าน **`ChannelAdapter` interface เดียว** (§8.1) — inbound webhook → contact/conversation กลาง, outbound → adapter ของช่องทางนั้น
- Inbox รวม: กรองตามช่องทาง/สถานะ/ผู้รับผิดชอบ/กิจการ, มอบหมายพนักงาน, quick reply, ส่งรูป, โปรไฟล์ลูกค้าข้างจอ, realtime SSE
- ผูกตัวตนลูกค้าแต่ละช่องทาง (`ChatContact`) เข้ากับ **ระบบ Member** ได้ → เห็นแต้ม/ประวัติซื้อระหว่างคุย และรู้ว่า "คุณสมชายใน LINE = คนเดียวกับใน Facebook"

### 1.2 Scope ใหม่ — ระบบ Chat เป็น AppSystem instance

| เรื่อง | กติกา |
|---|---|
| เก็บเป็น | `AppSystem` (kind **feature**, `SystemType.CHAT`) — **สร้างได้หลายชุด** เช่น "แชทร้าน A", "แชทสาขาออนไลน์" แต่ละชุด = inbox แยก + channel connection แยก |
| Scope ข้อมูล | **system-scoped**: ทุกตารางมี `tenantId + systemId`, unique = `@@unique([systemId, ...])` |
| เชื่อมระบบ business | ผ่าน `AppSystemUnit` (BLUEPRINT_SYSTEMS §3): 1 unit เชื่อมระบบ Chat ได้ 1 ชุด — หลาย unit เชื่อมชุดเดียวกัน = แชร์ inbox. unit ที่เชื่อมคือ (ก) แหล่ง tag `unitId` ของ conversation (ข) หน้า storefront ที่ webchat widget โผล่ |
| เชื่อมระบบ Member | opt-in ผ่าน `ChatSetting.memberSystemId` (feature↔feature link ของโมดูลเอง ตาม BLUEPRINT_SYSTEMS §3) — เชื่อมแล้วจึงผูก `ChatContact.customerId` เข้าโปรไฟล์สมาชิก + เห็นแผงข้างจอ; ไม่เชื่อม = แชทได้ปกติแบบ standalone |
| ไม่เชื่อมอะไรเลย | ระบบยังทำงานเดี่ยวได้เต็มรูป (หลักการ BLUEPRINT_SYSTEMS §1.3) — inbox + channel ทำงาน, แค่ไม่มี unit tag / member panel |
| UI | `/app/sys/[systemId]` ตามแบบระบบ feature อื่น (code: `src/lib/systems.ts` — CHAT no.10) |

### 1.3 ตารางเทียบ 6 ช่องทาง (ความจริงที่ adapter ต้องรองรับ)

> ⚠️ ข้อมูลแพลตฟอร์มภายนอกเปลี่ยนได้ — dev ต้อง verify กับ docs ทางการ ณ วัน implement ทุกครั้ง (ตัวเลข quota/อายุ token โดยเฉพาะ)

| | **LINE (OA)** | **Facebook Messenger** | **Instagram DM** | **Shopee** | **Lazada** | **WhatsApp (Cloud API)** |
|---|---|---|---|---|---|---|
| **Auth** | BYOK: channel access token (long-lived) + channel secret จาก LINE Developers Console (Messaging API channel ผูก OA ของร้าน) | Page access token ผ่าน **Meta App ของ SHARK** (Facebook Login for Business, สิทธิ์ `pages_messaging` + `pages_manage_metadata`) | เหมือน FB — IG professional account ต้องผูกกับ FB Page, สิทธิ์ `instagram_manage_messages` | Shopee Open Platform: SHARK เป็น partner app (partner_id + partner_key sign ทุก request), ร้านกด authorize → `access_token` (อายุสั้น ~4 ชม.) + `refresh_token` (~30 วัน) ต่อ shop_id | Lazada Open Platform: SHARK app, seller authorize → access_token + refresh_token (อายุจำกัด — อ่าน `expires_in` จริง) | Meta App + WABA (WhatsApp Business Account) + phone number ID + system-user token ถาวร |
| **รับข้อความ (inbound)** | Webhook URL ตั้งใน console, verify `x-line-signature` (HMAC-SHA256 base64 ด้วย channel secret) | Meta Webhooks `object=page field=messages`, verify token + `x-hub-signature-256` (HMAC app secret) | Meta Webhooks `object=instagram` (รวม story reply/mention) | Open Platform **Push Mechanism** (webhook กลางระดับ partner app → route ด้วย shop_id) — ⚠️ ต้องมี **polling fallback** (get_message API) เพราะ push ไม่การันตี | Webhook/Push ของ Open Platform (IM message push) — ⚠️ availability ต่างกันตาม region/สิทธิ์ app → เผื่อ polling fallback เช่นกัน | Meta Webhooks `messages` (เหมือน FB) |
| **ส่งออกได้** | text · sticker (ชุด LINE packageId/stickerId) · image (HTTPS URL) · video · Flex/quick reply. **Reply token ฟรีไม่จำกัด** (อายุสั้น ใช้ครั้งเดียว) · push นับโควต้าแผน OA | text · image · file · template/quick replies. sticker ส่งออก**ไม่ได้** (รับได้) | text · image · heart sticker เท่านั้น | text · image · **product card / order card** (sellerchat send_message) | text · image · product/order attachment (IM send API) | text · image · document · sticker(.webp) — free-form ในหน้าต่างเท่านั้น |
| **ข้อจำกัดหน้าต่างเวลา** | ไม่มี window — push ได้เสมอ (ติดโควต้าแผน) | **24-hour window** หลังข้อความล่าสุดของลูกค้า; เกิน → ต้องใช้ message tag (`HUMAN_AGENT` = 7 วัน, ต้องขอสิทธิ์) | **24-hour window**; `HUMAN_AGENT` 7 วัน (app ที่ได้รับอนุมัติ) | ตอบได้เฉพาะ buyer ที่มีความสัมพันธ์ (ทักมาก่อน/มี order) — เน้น **order-related**; ห้ามชวนออกนอกแพลตฟอร์ม | เหมือน Shopee — ตอบ buyer-initiated / order-related; ห้าม off-platform contact | **24-hour customer service window** — เกินแล้วต้องส่ง **template ที่ pre-approve** (มีค่าใช้จ่ายตามหมวด conversation) |
| **Rate limit / โควต้า** | API สูงมาก (พัน req/นาที) — คอขวดจริง = โควต้า push ของแผน OA (ไทย: Free ~300 broadcast/เดือน) | สูง (per page) — ไม่ใช่คอขวดของ use case ตอบแชท | สูง | จำกัดต่อ partner app (แชร์กันทุกร้านบน SHARK!) — ต้องมี central rate limiter + queue | จำกัดต่อ app เช่นกัน — queue กลาง | messaging tier ต่อเบอร์ (เริ่ม 1K conversation/วัน ขยายอัตโนมัติ) |
| **Media inbound** | ต้อง GET `/message/{id}/content` มาเก็บเอง (URL ไม่ถาวร) | CDN URL อายุจำกัด → ดาวน์โหลดเก็บ object storage | เหมือน FB | image URL จาก API → เก็บเอง | เหมือนกัน | ต้อง GET media id → download ภายใน ~30 นาที |

**ลำดับ implement แนะนำ (ตัดสินแล้ว — เรียงตามคุณค่าต่อร้านไทย × ความยาก):**

1. ✅ **LINE** ก่อน — ช่องทางหลักของลูกค้าไทย, BYOK ไม่ต้องรอ review ใคร, API เสถียร docs ดี (+ WEBCHAT built-in มาพร้อมกันเป็นช่องทางที่คุมเองได้ 100%)
2. 🔜 **Facebook + Instagram** — infra Meta ชุดเดียวกัน (webhook/signature/token เหมือนกัน ~80%) ทำคู่กันคุ้ม แต่ต้องผ่าน **Meta App Review** ก่อนใช้กับร้านทั่วไป (§11.13)
3. 🔜 **Shopee → Lazada** — คุณค่าสูงสำหรับร้าน e-commerce แต่ API ปิด/เอกสารอ่อน ต้องสมัคร partner + app approval + ทำ polling fallback
4. 🔜 **WhatsApp** ท้ายสุด — คนไทยใช้น้อยกว่า LINE มาก, มี template/pricing ซับซ้อน (เก็บไว้เสิร์ฟร้านที่มีลูกค้าต่างชาติ)

### 1.4 ไม่ทำอะไร (v1) — ประกาศชัดกันหลง

| เรื่อง | สถานะ |
|---|---|
| Broadcast / campaign หาลูกค้าเป็นกลุ่ม | 🔜 งาน Marketing — คิวหลัง adapter ครบ (ต้องเคารพ window + consent) |
| Chatbot / AI ตอบอัตโนมัติ | 🔜 — โครง `direction OUT + senderUserId null` รองรับไว้ |
| ตอบคอมเมนต์โพสต์ FB/IG, รีวิว Shopee/Lazada | ❌ v1 — คนละ API กับ DM (comment→DM 🔜) |
| Voice / video call | ❌ ไม่อยู่ใน roadmap ระบบนี้ |
| แชทภายในทีมงาน | ❌ → ระบบ 11 Meeting |
| ขายในแชท (สั่งซื้อ/ชำระเงิน) | ❌ v1 — ส่งลิงก์ storefront/POS แทน (rich card 🔜) |

### 1.5 ความต่างจาก Meeting (ระบบ 11) — ห้ามปน

| | **10 รวม Chat** | **11 Meeting** |
|---|---|---|
| คู่สนทนา | ลูกค้าภายนอก ↔ ทีมร้าน | ทีมงานภายใน ↔ ทีมงานภายใน |
| หน่วยข้อมูล | `ChatConversation` (OPEN/PENDING/RESOLVED + SLA) | `MeetingRoom` (channel ถาวร ไม่มีสถานะงาน) |
| ตาราง Prisma | prefix `Chat*` | prefix `Meeting*` |
| ตัวตนฝั่งส่ง | `ChatContact` (ลูกค้า) + `userId` (staff) | `userId` เท่านั้น |
| Retention | มี purge policy (§11.10) | เก็บถาวร |

ห้ามใช้ตารางร่วม / ยิงข้อความข้าม inbox — อยากส่งต่อเคสให้ทีมคุย → แชร์**ลิงก์** conversation ลง Meeting เท่านั้น

---

## 2. Persona & User Stories

| Persona | เกี่ยวข้องอย่างไร |
|---|---|
| **Owner** | สร้างระบบ Chat, เชื่อม 6 ช่องทาง (ถือ credentials), เชื่อม unit/Member, ดูรายงาน, ตั้ง SLA/retention |
| **Manager** | ดูแล inbox, มอบหมายพนักงาน, จัดการ quick reply, ดูรายงาน |
| **Staff** | ตอบลูกค้าทุกช่องทางจากจอเดียว (ส่วนใหญ่จากมือถือ), ใช้ quick reply, ผูกลูกค้าเข้า Member, ปิดเธรด |
| **Customer** | ทักร้านจากช่องทางที่ตัวเองใช้อยู่แล้ว (LINE/FB/IG/Shopee/Lazada/WA/เว็บ) — ไม่ต้องรู้จัก SHARK เลย |

User stories หลัก:

1. **เจ้าของร้านขายของออนไลน์:** "ร้านฉันมี LINE OA, เพจ Facebook, IG, ร้านใน Shopee กับ Lazada — เมื่อก่อนเปิด 5 แอปสลับตอบ ตอนนี้เปิด SHARK จอเดียว เห็นทุกข้อความเรียงตามเวลา รู้ว่าอันไหนยังไม่ได้ตอบ"
2. **Staff (มือถือ):** "ลูกค้าทักจาก Shopee ถามว่าของถึงไหน — ฉันเห็น order card ในแชท ตอบจากมือถือระหว่างแพ็คของ ไม่ต้องเปิดแอป Shopee"
3. **Staff (quick reply):** "คำถามซ้ำ ๆ เช่นค่าส่ง ฉันพิมพ์ `/ส่ง` แล้วข้อความสำเร็จรูปเด้งมา แก้นิดหน่อยแล้วส่ง — ส่งได้ทุกช่องทางเหมือนกัน"
4. **Manager:** "ฉันกรอง inbox เฉพาะ LINE ที่ยังไม่มีคนรับ มอบหมายให้น้องแอดมิน แล้วดูว่าช่องทางไหนตอบช้าสุด"
5. **Staff (ผูก member):** "ลูกค้า LINE คนนี้บอกเบอร์โทร ฉันค้นเจอสมาชิกเดิม กดผูก — เห็นเลยว่าเขามีแต้ม 500 และเคยซื้อ 3 ครั้ง แถมเป็นคนเดียวกับที่เคยทักทาง Facebook"
6. **Owner (หลายกิจการ):** "ร้านกาแฟกับร้านเบเกอรี่ของฉันเชื่อม 'แชทกลาง' ชุดเดียว — LINE OA ร้านกาแฟทักเข้ามา conversation ติดป้ายร้านกาแฟอัตโนมัติ"
7. **Owner (แยกระบบ):** "ธุรกิจสองแบรนด์ไม่อยากปนกัน — สร้างระบบ Chat 2 ชุด ทีมใครทีมมัน inbox ใครinboxมัน"

---

## 3. ฟังก์ชันทั้งหมด (MVP ✅ / Phase ถัดไป 🔜)

### 3.1 ช่องทาง (Channels)

- ✅ **WEBCHAT** built-in: widget บน storefront ของ unit ที่เชื่อมระบบนี้ (ปุ่มลอยมุมขวาล่าง, mobile = full-screen sheet, guest token cookie 90 วัน + pre-chat form optional)
- ✅ **LINE**: เชื่อม OA ด้วย channel access token + secret (BYOK), webhook รับ text/sticker/image/location, ส่ง text/sticker/image, ใช้ **reply token ก่อนเสมอ** (ฟรี) — หมดอายุค่อย fallback push (แจ้งจำนวน push ที่ใช้ใน settings)
- 🔜 **FACEBOOK**: OAuth ผ่าน Meta App ของ SHARK → เลือกเพจ → รับ/ส่งผ่าน Send API, บังคับ 24h window + `HUMAN_AGENT` tag
- 🔜 **INSTAGRAM**: ต่อจาก FB (บัญชี IG ที่ผูกเพจ), รวม story reply/mention เข้าเธรด
- 🔜 **SHOPEE**: authorize ร้าน → push + polling fallback, order/product card ในเธรด, ลิงก์ order ไปหน้า Shopee seller
- 🔜 **LAZADA**: เหมือน Shopee (IM API)
- 🔜 **WHATSAPP**: WABA + template จัดการใน settings, ตัวนับ 24h window บนหัวเธรด
- ✅ หลาย connection ต่อระบบได้ (เช่น LINE OA 2 บัญชี) — แต่ละ connection ตั้ง `defaultUnitId` เพื่อ tag ที่มาของ conversation
- ✅ หน้า "ช่องทาง" ใน settings: การ์ดละ connection + สถานะ (CONNECTED/EXPIRED/ERROR) + ปุ่มทดสอบ + วันหมดอายุ token

### 3.2 Inbox & Conversation

- ✅ กติกา: **1 `ChatContact` (ตัวตนต่อช่องทาง) มี conversation active ได้ 1 อัน** — ทักซ้ำ = ต่อเธรดเดิม, ทักหลัง RESOLVED = reopen ≤24 ชม. / เธรดใหม่ถ้าเกิน (§7.9)
- ✅ สถานะ `OPEN` → `PENDING` (รอลูกค้า — หยุด SLA) → `RESOLVED`
- ✅ มอบหมาย `assigneeUserId` รายคน (ทีม 🔜)
- ✅ ตัวกรอง: **ช่องทาง** · สถานะ · ผู้รับผิดชอบ (ของฉัน/ยังไม่มี/คนอื่น) · unit · tag อิสระ · ค้นชื่อลูกค้า — เรียง ล่าสุด / รอนานสุด
- ✅ unit tag ต่อ conversation (จาก widget หน้า unit หรือ `defaultUnitId` ของ connection) — staff ย้ายได้
- ✅ internal note (`isInternal=true`) เห็นเฉพาะทีม ไม่ถูกส่งออกช่องทางไหนทั้งสิ้น
- ✅ unread: `staffUnreadCount` ต่อ conversation + `ChatReadState` ต่อ staff + badge รวมบน sidebar
- 🔜 snooze, round-robin auto-assign, SLA escalation

### 3.3 การส่งข้อความ

- ✅ text (≤4,000 ตัวอักษร — adapter ตัดแบ่งตาม limit ช่องทางจริง เช่น LINE 5,000 / FB 2,000)
- ✅ รูปภาพ (jpg/png/webp ≤10MB) — upload ขึ้น object storage → adapter ส่งต่อรูปแบบที่ช่องทางรับ
- ✅ sticker: **รับ**จากทุกช่องทางที่มี (แสดงรูป/placeholder) — **ส่ง**ได้เฉพาะช่องทางที่รองรับ (LINE ✅ ชุด default, อื่น ๆ ปุ่ม sticker ซ่อน)
- ✅ `ORDER_CONTEXT`: ข้อความแนบบริบทออเดอร์จาก Shopee/Lazada (order card อ่านอย่างเดียว + ลิงก์ไป seller center)
- ✅ **Quick reply** (`ChatQuickReply`): เรียกด้วย `/` autocomplete, ตัวแปร `{{contact.name}}` `{{unit.name}}` `{{staff.name}}`, จำกัดต่อช่องทางได้
- ✅ สถานะส่งออก per message: `PENDING → SENT / FAILED` + ปุ่ม "ลองอีกครั้ง" — ส่งไม่ได้เพราะ window ปิด → บอกเหตุผลชัด ("เกิน 24 ชม. — ลูกค้าต้องทักมาใหม่ก่อน" / WhatsApp: เสนอส่ง template)
- ✅ idempotent send: `clientMessageId` กัน retry ซ้ำ
- 🔜 ไฟล์เอกสาร, reply-quote, rich card (สินค้า/ลิงก์จอง), template composer (WhatsApp)

### 3.4 Customer panel (ข้างจอ)

- ✅ ข้อมูล contact: ชื่อ/avatar จากช่องทาง + ช่องทางที่มา + connection ไหน
- ✅ ถ้าเชื่อมระบบ Member (`memberSystemId`) และ contact ผูก `customerId` แล้ว: โปรไฟล์/tier/แต้มคงเหลือ/ประวัติซื้อ 10 รายการล่าสุด (อ่านสดผ่าน read service — ไม่ copy เก็บ)
- ✅ **ช่องทางอื่นของลูกค้าคนเดียวกัน**: contact ทุกช่องทางที่ผูก `customerId` เดียวกัน + เธรดเก่า
- ✅ ปุ่ม "ผูกกับสมาชิก" (ค้นชื่อ/เบอร์/อีเมล) / "สร้างสมาชิกใหม่จากแชทนี้" (member.findOrCreate)
- 🔜 action ในแชท: ออกคูปอง, สร้างนัดหมาย

### 3.5 Realtime + Notification

- ✅ SSE staff: `GET /api/chat/:systemId/stream` — event `message.new`, `conversation.updated`, `badge` · topic `t:{tenantId}:sys:{systemId}:chat:{topic}` (ปรับ scheme กลาง _CONVENTIONS §2.8 เป็นระดับ system)
- ✅ SSE ลูกค้า (webchat เท่านั้น): `/api/store/.../chat/stream` — ช่องทางภายนอก ลูกค้าได้ notification จากแอปของแพลตฟอร์มนั้นเองอยู่แล้ว
- ✅ typing indicator + read receipt เฉพาะ WEBCHAT (ช่องทางภายนอกไม่มี event เหล่านี้ให้ bot)
- ✅ Notification (contract 2.5): แชทใหม่ไร้เจ้าของเกิน N นาที → `WEB` หา staff, ถูกมอบหมาย → `WEB`(+`EMAIL` ถ้า offline) — template class `TRANSACTIONAL`
- ✅ badge unread บน sidebar + poll fallback 60 วิ

### 3.6 SLA & รายงาน

- ✅ timestamp อัตโนมัติ: `firstCustomerMessageAt`, `firstResponseAt`, `resolvedAt` + `ChatConversationEvent` ทุกจุด
- ✅ เป้า first response (default 15 นาที) — inbox โชว์ป้าย "เกิน SLA"
- ✅ รายงาน §10: volume/FRT/resolved rate **แยกต่อช่องทาง** เป็น first-class dimension

### 3.7 Settings

- ✅ แท็บช่องทาง (connections + wizard §7.1–7.5), quick replies (CRUD), ทั่วไป (SLA, retention, เชื่อมระบบ Member, webchat widget config)
- ✅ การเชื่อม unit ดูที่หน้า unit (`/app/u/[slug]` ส่วน "การเชื่อมต่อ") ตามแบบแผนกลาง — หน้า settings ของ Chat แสดงรายชื่อ unit ที่เชื่อมอยู่ (read-only + ลิงก์ไป)

### 3.8 ⚠️ นโยบาย/ขั้นตอนแพลตฟอร์มที่ dev ต้องรู้ก่อนเริ่ม (เตือนล่วงหน้า)

| แพลตฟอร์ม | ต้องทำก่อนใช้งานจริง | ผลกระทบ timeline |
|---|---|---|
| **Meta (FB/IG/WA)** | สร้าง Meta App ระดับ Business + **Business Verification** + **App Review** สิทธิ์ `pages_messaging`, `instagram_manage_messages`, (`whatsapp_business_messaging`) + ขอ `HUMAN_AGENT` แยก | review หลักสัปดาห์–เดือน, ระหว่างรอใช้ได้เฉพาะบัญชี tester → **เริ่มยื่นก่อนเขียน code เสร็จ** (มี dossier เดิมจาก project_shark_meta_app_review) |
| **LINE** | ร้านสร้าง OA เอง (BYOK) — ไม่มี review ฝั่ง SHARK แต่ต้องมี **คู่มือ + wizard พาร้านกดใน LINE Developers** ให้จบเองได้; แผนราคา OA ไทย: reply ฟรี, push/broadcast ติดโควต้าแผน (Free ~300/เดือน) — UI ต้องโชว์การใช้ push | ไม่ block — เริ่มได้ทันที |
| **Shopee** | สมัคร Shopee Open Platform partner + สร้าง app + **ผ่านการอนุมัติ app** (ระบุ scope chat) แล้วร้านค่อย authorize; นโยบายห้ามส่ง contact/ลิงก์นอกแพลตฟอร์ม — **ต้องมี warning ใน composer** กันร้านโดนแบน | สมัคร partner ใช้เวลา — ยื่นล่วงหน้า |
| **Lazada** | เหมือน Shopee (Lazada Open Platform + สิทธิ์ IM API) — เอกสารอ่อนสุดใน 6 ช่องทาง เผื่อเวลา R&D + polling fallback | สูงสุดใน 6 ช่องทาง |
| **WhatsApp** | WABA + เบอร์เฉพาะ (เบอร์ที่ใช้แอป WhatsApp ปกติอยู่ใช้ไม่ได้) + template ต้อง approve รายใบ + ค่าใช้จ่ายต่อ conversation นอก service window — ต้องอธิบายให้ร้านเข้าใจก่อนเชื่อม | ตาม Meta review + template approval |

---

## 4. Data Model (Prisma)

> ทุก model มี `tenantId + systemId` (system-scoped — `systemId` → `AppSystem` type CHAT) + `createdAt/updatedAt` — id = cuid — ไม่มี hard delete ข้อความ (purge ตาม retention = tombstone) — ไม่มีเงินในระบบนี้

```prisma
// ───────────────────────── enums ─────────────────────────

enum ChatChannelType {
  WEBCHAT     // ✅ MVP — built-in ไม่ต้องมี connection
  LINE        // ✅ MVP
  FACEBOOK    // 🔜 เฟส 2 (Meta)
  INSTAGRAM   // 🔜 เฟส 2 (Meta)
  SHOPEE      // 🔜 เฟส 3
  LAZADA      // 🔜 เฟส 3
  WHATSAPP    // 🔜 เฟส 4
}

enum ChatConnectionStatus {
  CONNECTED
  EXPIRED     // token หมดอายุ/ถูก revoke — ต้อง re-auth (โชว์เตือนแดงใน settings + notify OWNER)
  ERROR       // ส่ง/รับพังต่อเนื่อง
  DISABLED    // ปิดชั่วคราวโดยร้าน
}

enum ChatConversationStatus {
  OPEN
  PENDING     // รอลูกค้า — หยุดนับ SLA ฝั่งร้าน
  RESOLVED
}

enum ChatMessageDirection {
  IN          // ลูกค้า → ร้าน
  OUT         // ร้าน → ลูกค้า (รวม system/auto ในอนาคต)
}

enum ChatMessageType {
  TEXT
  IMAGE
  STICKER
  FILE
  ORDER_CONTEXT   // การ์ดออเดอร์/สินค้า (Shopee/Lazada) — payload ใน orderContext
  SYSTEM          // ข้อความระบบในเธรด (มอบหมาย/เปลี่ยนสถานะ) — ไม่ส่งออกช่องทาง
}

enum ChatDeliveryStatus {
  PENDING     // OUT: เข้าคิว adapter
  SENT
  FAILED      // deliveryError บอกเหตุผล (window ปิด / token ตาย / rate limit)
}

// ─────────────── การเชื่อมช่องทาง (ต่อ system) ───────────────

model ChatChannelConnection {
  id                String               @id @default(cuid())
  tenantId          String
  systemId          String               // AppSystem (type CHAT)
  type              ChatChannelType      // ไม่มีแถวสำหรับ WEBCHAT (built-in)
  displayName       String               // "LINE OA ร้านกาแฟ A"
  externalAccountId String               // LINE bot userId / FB pageId / IG accountId / shop_id / seller_id / WA phoneNumberId
  credentials       Json                 // 🔐 เข้ารหัส AES-256-GCM ที่ service layer เท่านั้น — token/secret/refresh_token; ห้าม return เต็มออก API (masked)
  webhookKey        String               @unique @default(cuid())  // ประกอบ webhook URL กันเดาสุ่ม
  defaultUnitId     String?              // conversation จาก connection นี้ tag unit ไหน (unit ต้องเชื่อมระบบนี้ผ่าน AppSystemUnit)
  status            ChatConnectionStatus @default(CONNECTED)
  tokenExpiresAt    DateTime?            // Shopee/Lazada/FB — cron refresh ล่วงหน้า (§7.10)
  lastInboundAt     DateTime?
  lastErrorAt       DateTime?
  lastError         String?
  meta              Json?                // per-channel เช่น LINE quota used, WA template list cache
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  contacts      ChatContact[]
  conversations ChatConversation[]

  @@unique([systemId, type, externalAccountId])  // บัญชีเดียวกันเชื่อมซ้ำในระบบเดียวไม่ได้
  @@index([tenantId, systemId, status])
  @@index([tokenExpiresAt])                      // cron refresh
}

// ─────────────── ตัวตนลูกค้าต่อช่องทาง ───────────────

// 1 แถว = 1 ตัวตนบน 1 ช่องทาง (LINE userId / FB PSID / IG IGSID / wa_id / Shopee buyer / Lazada buyer / webchat guest)
// ลูกค้าคนเดียวหลายช่องทาง = หลาย ChatContact ชี้ customerId เดียวกัน (§7.8, §11.5)
model ChatContact {
  id                  String                 @id @default(cuid())
  tenantId            String
  systemId            String
  channel             ChatChannelType
  channelConnectionId String?                // null = WEBCHAT
  channelConnection   ChatChannelConnection? @relation(fields: [channelConnectionId], references: [id])
  externalUserId      String                 // id ฝั่ง provider; WEBCHAT = guest token
  displayName         String?                // จาก provider profile / pre-chat form
  avatarUrl           String?
  phone               String?                // WA = เบอร์จริง / webchat pre-chat / staff กรอกจากบทสนทนา
  email               String?
  customerId          String?                // Member id ในระบบ Member ที่เชื่อม (ChatSetting.memberSystemId) — nullable
  linkedByUserId      String?
  linkedAt            DateTime?
  blockedAt           DateTime?              // ร้าน block spam (หยุดสร้าง conversation ใหม่ — ข้อความเก็บลง log เงียบ ๆ)
  lastSeenAt          DateTime               @default(now())
  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  conversations ChatConversation[]

  @@unique([systemId, channel, channelConnectionId, externalUserId])
  @@index([systemId, customerId])
  @@index([systemId, channel, lastSeenAt])
  @@index([tenantId, phone])
}

// ─────────────── Conversation ───────────────

model ChatConversation {
  id                  String                 @id @default(cuid())
  tenantId            String
  systemId            String
  channel             ChatChannelType        // denormalize จาก contact เพื่อ filter เร็ว
  channelConnectionId String?
  channelConnection   ChatChannelConnection? @relation(fields: [channelConnectionId], references: [id])
  contactId           String
  contact             ChatContact            @relation(fields: [contactId], references: [id])
  unitId              String?                // tag ที่มา (unit ที่เชื่อมระบบนี้) — staff ย้ายได้
  status              ChatConversationStatus @default(OPEN)
  assigneeUserId      String?
  tags                Json                   @default("[]")   // ["ร้องเรียน","รอโอน"]

  // denormalized เพื่อ inbox list (อัปเดต transaction เดียวกับ insert message)
  lastMessageAt       DateTime?
  lastMessagePreview  String?                // 140 ตัวอักษร ไม่รวม internal note
  lastMessageDirection ChatMessageDirection?
  staffUnreadCount    Int                    @default(0)

  // หน้าต่างตอบกลับของช่องทาง (FB/IG/WA) — คำนวณจากข้อความ IN ล่าสุด เก็บไว้โชว์นาฬิกา
  replyWindowExpiresAt DateTime?

  // SLA
  firstCustomerMessageAt DateTime?
  firstResponseAt        DateTime?           // OUT แรกที่ไม่ internal/system
  resolvedAt             DateTime?
  reopenedCount          Int                 @default(0)

  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  messages   ChatMessage[]
  events     ChatConversationEvent[]
  readStates ChatReadState[]

  @@index([systemId, status, lastMessageAt(sort: Desc)])   // inbox หลัก
  @@index([systemId, channel, status])
  @@index([systemId, assigneeUserId, status])
  @@index([systemId, unitId, status])
  @@index([contactId])
}
// ⚠️ กติกา "1 contact = 1 conversation active" บังคับ 2 ชั้น:
//   (1) service: advisory lock ต่อ contactId ใน transaction ก่อนหา/สร้าง
//   (2) partial unique index (raw SQL migration):
//       CREATE UNIQUE INDEX chat_conv_active ON "ChatConversation" ("contactId")
//         WHERE status <> 'RESOLVED';

// ─────────────── Message ───────────────

model ChatMessage {
  id                String               @id @default(cuid())
  tenantId          String
  systemId          String
  conversationId    String
  conversation      ChatConversation     @relation(fields: [conversationId], references: [id])
  direction         ChatMessageDirection
  type              ChatMessageType      @default(TEXT)
  senderUserId      String?              // OUT: staff ผู้ส่ง (null = system/auto)
  body              String?              @db.Text
  stickerMeta       Json?                // { packageId, stickerId } / { url }
  orderContext      Json?                // { orderSn, itemName, imageUrl, amountText, deepLink } — snapshot จาก provider (freeze ได้ ไม่ใช่ข้อมูลเงินของเรา)
  isInternal        Boolean              @default(false)   // note ภายใน — ไม่ส่งออก ไม่นับ SLA/preview
  clientMessageId   String?              // idempotency ฝั่ง UI
  externalMessageId String?              // id ฝั่ง provider — dedupe webhook (IN) / delivery result (OUT)
  deliveryStatus    ChatDeliveryStatus   @default(SENT)    // IN = SENT เสมอ
  deliveryError     String?              // "REPLY_WINDOW_CLOSED" / "TOKEN_EXPIRED" / "RATE_LIMITED" / raw
  meta              Json?                // quickReplyId ที่ใช้ / replyToken / retry count
  purgedAt          DateTime?
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt

  attachments ChatAttachment[]

  @@unique([conversationId, clientMessageId])
  @@unique([conversationId, externalMessageId])   // webhook ซ้ำ = insert ชน → ข้ามเงียบ
  @@index([conversationId, createdAt])
  @@index([systemId, createdAt])                  // รายงาน + retention cron
  @@index([systemId, deliveryStatus])             // retry queue FAILED
}

model ChatAttachment {
  id         String          @id @default(cuid())
  tenantId   String
  systemId   String
  messageId  String
  message    ChatMessage     @relation(fields: [messageId], references: [id])
  kind       ChatMessageType // IMAGE | FILE | STICKER
  storageKey String          // ไฟล์เราเก็บเอง (inbound media ดาวน์โหลดมาเก็บทันที — URL provider ไม่ถาวร §1.3)
  url        String          // CDN/signed URL
  fileName   String
  mimeType   String
  sizeBytes  Int
  width      Int?
  height     Int?
  createdAt  DateTime        @default(now())
  updatedAt  DateTime        @updatedAt

  @@index([messageId])
  @@index([systemId, createdAt])
}

// ─────────────── Unread / read state (ฝั่ง staff ต่อคน) ───────────────

model ChatReadState {
  id                String           @id @default(cuid())
  tenantId          String
  systemId          String
  conversationId    String
  conversation      ChatConversation @relation(fields: [conversationId], references: [id])
  userId            String
  lastReadMessageId String?
  lastReadAt        DateTime         @default(now())
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@unique([conversationId, userId])
  @@index([systemId, userId])
}
// read receipt ฝั่งลูกค้า: เฉพาะ WEBCHAT (เก็บใน meta ของ conversation) — ช่องทางภายนอกไม่มี event ให้

// ─────────────── Event log (SLA + audit เธรด) ───────────────

enum ChatEventType {
  CREATED
  ASSIGNED         // meta: { fromUserId?, toUserId? }
  STATUS_CHANGED   // meta: { from, to }
  UNIT_CHANGED     // meta: { fromUnitId, toUnitId }
  CUSTOMER_LINKED  // meta: { contactId, customerId }  (+ UNLINKED ใช้ type เดิม meta.action)
  REOPENED
  DELIVERY_FAILED  // meta: { messageId, reason }
}

model ChatConversationEvent {
  id             String           @id @default(cuid())
  tenantId       String
  systemId       String
  conversationId String
  conversation   ChatConversation @relation(fields: [conversationId], references: [id])
  type           ChatEventType
  actorUserId    String?          // null = ระบบ/ลูกค้า trigger
  meta           Json?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@index([conversationId, createdAt])
  @@index([systemId, type, createdAt])
}

// ─────────────── Quick reply ───────────────

model ChatQuickReply {
  id              String    @id @default(cuid())
  tenantId        String
  systemId        String
  shortcut        String    // พิมพ์ /ส่ง
  title           String
  body            String    @db.Text   // {{contact.name}} {{unit.name}} {{staff.name}}
  channelTypes    Json      @default("[]")  // [] = ทุกช่องทาง; ["SHOPEE","LAZADA"] = เฉพาะ
  usageCount      Int       @default(0)
  createdByUserId String
  archivedAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([systemId, shortcut])
  @@index([systemId])
}

// ─────────────── Settings (1 แถว/ระบบ) ───────────────

model ChatSetting {
  id                  String   @id @default(cuid())
  tenantId            String
  systemId            String   @unique
  memberSystemId      String?  // 🔗 เชื่อมระบบ Member (AppSystem type MEMBER) — opt-in, ถอด/เปลี่ยนได้ (§11.6)
  widgetEnabled       Boolean  @default(true)   // WEBCHAT รวม (ปิดรายหน่วยใน widgetDisabledUnitIds)
  widgetDisabledUnitIds Json   @default("[]")
  greetingMessage     Json     @default("{}")   // { th, en }
  offlineMessage      Json     @default("{}")
  preChatFormEnabled  Boolean  @default(false)
  slaFirstResponseMin Int      @default(15)
  unassignedAlertMin  Int      @default(5)
  retentionDays       Int      @default(365)    // 90–730 (§11.10)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

// ─────────────── Webhook log (dedupe + debug) ───────────────

model ChatWebhookLog {
  id           String   @id @default(cuid())
  connectionId String?  // null = resolve ไม่ได้ (webhookKey ผิด)
  channelType  ChatChannelType
  eventKey     String   // event/message id ฝั่ง provider — dedupe ชั้นแรกก่อนถึง ChatMessage
  status       String   // RECEIVED | PROCESSED | DUPLICATE | FAILED
  error        String?
  payloadHash  String?  // ไม่เก็บ payload เต็ม (PII) — เก็บ hash + ฟิลด์ debug จำเป็นใน meta
  meta         Json?
  createdAt    DateTime @default(now())

  @@unique([connectionId, eventKey])
  @@index([createdAt])   // cron purge 30 วัน
}

// ─────────────── สถิติรายวัน ───────────────
// ไม่มีตาราง summary ของตัวเอง (_CONVENTIONS §2.8) — implement StatProvider ป้อน DailyStat กลาง (module=CHAT, มิติ systemId):
//   conversations_new, conversations_resolved, messages_in, messages_out,
//   frt_sum_sec, frt_count, frt_within_sla_count — breakdown ต่อ channel ใน DailyStat.meta
```

**หมายเหตุ schema:**
- `systemId`, `unitId`, `customerId`, `assigneeUserId` อ้างด้วย id + ตรวจใน service (ไม่ผูก FK ข้ามโมดูล — pattern กลาง)
- `credentials` เข้ารหัสด้วย key ระดับ platform (env `CHAT_CREDENTIALS_KEY`), decrypt เฉพาะใน adapter layer — API GET คืนแบบ masked (`token: "xxxx…89AB"`)
- รวม **10 models + 7 enums**

---

## 5. API Endpoints

> ทุกเส้น dashboard ตรวจ `can(user, { tenantId, systemId, module:'CHAT', action })` — context มี `systemId` ตาม contracts v2
> error กลาง `{ error: { code, message } }` — 401/403/404/409/422/429

### 5.1 Dashboard (staff) — ใต้ `/api/chat/[systemId]/…`

| # | Method + Path | ทำอะไร | Payload หลัก | สิทธิ์ |
|---|---|---|---|---|
| 1 | `GET /conversations` | list inbox | `status, channel, assignee(me\|none\|userId), unitId, tag, q, sort(latest\|longest_wait), cursor, limit≤50` | `chat.read` |
| 2 | `GET /conversations/:id` | รายละเอียด + contact + events ล่าสุด + replyWindow | — | `chat.read` |
| 3 | `GET /conversations/:id/messages` | ข้อความ (cursor ย้อนหลัง) | `cursor, limit≤50` | `chat.read` |
| 4 | `POST /conversations/:id/messages` | ส่งข้อความ/โน้ต → คิว adapter | `{ type, body?, attachmentIds?, stickerMeta?, isInternal?, clientMessageId }` | `chat.reply` |
| 5 | `POST /conversations/:id/messages/:msgId/retry` | ส่งซ้ำข้อความ FAILED | — | `chat.reply` |
| 6 | `PATCH /conversations/:id` | status / assignee / tags / unitId (ทุกฟิลด์ที่เปลี่ยน → event) | `{ status?, assigneeUserId?, tags?, unitId? }` | `chat.manage` (status ของเธรดที่ตนเป็น assignee = `chat.reply`) |
| 7 | `POST /conversations/:id/read` | mark read (ReadState + reset unread) | `{ lastReadMessageId }` | `chat.read` |
| 8 | `GET /contacts/:id` | โปรไฟล์ contact + ช่องทางอื่นของ customer เดียวกัน | — | `chat.read` |
| 9 | `POST /contacts/:id/link-customer` | ผูก/เปลี่ยน/ถอด member (§7.8) | `{ customerId \| null }` | `chat.manage` |
| 10 | `POST /contacts/:id/block` · `/unblock` | block spam | — | `chat.manage` |
| 11 | `GET /stream` | **SSE** (message.new / conversation.updated / badge) + `Last-Event-ID` resume | — | `chat.read` |
| 12 | `GET /unread-count` | badge poll fallback | — | `chat.read` |
| 13 | `POST /uploads` | presigned URL → `attachmentId` (pending — ไม่ถูกอ้างใน 1 ชม. cron ลบ) | `{ fileName, mimeType, sizeBytes }` | `chat.reply` |
| 14 | `GET/POST /quick-replies` · `PATCH/DELETE /quick-replies/:id` | CRUD (DELETE = archive) | `{ shortcut, title, body, channelTypes }` | อ่าน `chat.read` / เขียน `chat.settings` |
| 15 | `GET/PATCH /settings` | ตั้งค่า + เชื่อม `memberSystemId` | ฟิลด์ `ChatSetting` | `chat.settings` |
| 16 | `GET /connections` | list (credentials masked) | — | `chat.settings` |
| 17 | `POST /connections` | เริ่มเชื่อมช่องทาง — LINE: รับ token+secret ตรง; FB/IG/Shopee/Lazada: คืน authorize URL แล้วจบที่ callback | `{ type, displayName, defaultUnitId?, credentials? }` | `chat.connections` (OWNER) |
| 18 | `PATCH /connections/:id` · `DELETE` | แก้ displayName/defaultUnitId/disable · ถอด (DELETE = DISABLED + ลบ credentials, เธรดเก่าอยู่ครบ) | | `chat.connections` |
| 19 | `POST /connections/:id/test` | healthCheck ของ adapter | — | `chat.connections` |
| 20 | `GET /reports/summary` · `GET /reports/agents` | รายงาน §10 | `from, to, channel?, unitId?` | `chat.reports` |

### 5.2 Webhook (public — ไม่มี session)

| # | Method + Path | ทำอะไร |
|---|---|---|
| 21 | `GET /api/webhooks/chat/:channelType/:webhookKey` | verify challenge (Meta hub.challenge / Shopee-Lazada echo) |
| 22 | `POST /api/webhooks/chat/:channelType/:webhookKey` | inbound: resolve connection จาก `webhookKey` → `adapter.verifyWebhook` (signature) → `ChatWebhookLog` dedupe → `parseInbound` → core routing (§7.6) — **ตอบ 200 ภายใน 3 วิ เสมอ** (งานหนักโยน queue) |
| 23 | `GET /api/webhooks/chat/oauth/:channelType/callback` | OAuth/authorize callback (FB/IG/Shopee/Lazada) → แลก code เป็น token → สร้าง/อัปเดต connection → redirect กลับ settings |

### 5.3 Storefront webchat (ลูกค้า/guest — ใต้ tenant/unit resolver)

| # | Method + Path | ทำอะไร |
|---|---|---|
| 24 | `POST /api/store/[tenantSlug]/[unitSlug]/chat/session` | เริ่ม session → resolve ระบบ Chat ที่ unit เชื่อม → สร้าง/อ่าน contact WEBCHAT จาก cookie + pre-chat |
| 25 | `GET /api/store/…/chat/conversation` | เธรด active + ประวัติของตัวตนนี้ |
| 26 | `POST /api/store/…/chat/messages` | ลูกค้าส่ง (rate limit 10/นาที/ตัวตน) `{ type, body?, attachmentIds?, clientMessageId }` |
| 27 | `POST /api/store/…/chat/uploads` | presigned (เข้มกว่า staff) |
| 28 | `POST /api/store/…/chat/read` · `/typing` | receipt + typing (WEBCHAT เท่านั้น) |
| 29 | `GET /api/store/…/chat/stream` | SSE เฉพาะ conversation ของตัวตนนี้ |

รวม **~29 endpoints** (dashboard 20 · webhook 3 · storefront 6)

---

## 6. UI Screens

> ทุกหน้า: TH/EN, B&W minimal, **mobile-first จริงจัง** (persona หลักคือร้านตอบจากมือถือ), empty/loading/error ครบ

### 6.1 `/app/sys/[systemId]` — Inbox หลัก (หน้า default ของระบบ Chat)

- **Desktop 3 คอลัมน์** / **mobile ทีละคอลัมน์** (list → tap → ห้องแชท → customer panel = bottom sheet ปุ่ม ℹ️)
- **คอลัมน์ซ้าย — list:** แถบกรองบน: ชิปช่องทาง (ไอคอน LINE/FB/IG/Shopee/Lazada/WA/เว็บ — ขาวดำ) + สถานะ + ผู้รับผิดชอบ + unit + ค้นหา · การ์ด: avatar + **ไอคอนช่องทางมุม avatar** (บอกที่มาใน 0.1 วิ), ชื่อ, preview, เวลา, ชิป unit, unread dot+เลข, ป้าย "เกิน SLA" (ตัวหนา ไม่ใช้สี), ป้ายนาฬิกา window (FB/IG/WA: "เหลือ 5 ชม.") · เรียง ล่าสุด/รอนานสุด · infinite scroll
- **คอลัมน์กลาง — ห้องแชท:** header (ชื่อ + ไอคอนช่องทาง + ชิป unit + สถานะ dropdown + ปุ่มมอบหมาย + นาฬิกา reply window ถ้ามี) · เธรด: ฟองซ้าย IN / ขวา OUT, sticker แสดงเป็นรูป, ORDER_CONTEXT เป็นการ์ดออเดอร์ (เลขที่+สินค้า+ลิงก์ seller center), internal note พื้นลายจุด, system message เส้นกลางจอ, ข้อความ FAILED = ขอบประ + เหตุผล + ปุ่มลองใหม่ · ช่องพิมพ์: textarea + แนบรูป + sticker (เฉพาะช่องทางรองรับ) + toggle โน้ตภายใน + `/` quick reply autocomplete + Enter ส่ง · **composer ปิด + banner อธิบาย เมื่อ window ปิด** ("เกิน 24 ชม. — รอลูกค้าทักกลับ" / WA: ปุ่ม "ส่ง template" 🔜) · Shopee/Lazada: hint ใต้ช่องพิมพ์ "ห้ามส่งช่องทางติดต่อภายนอก — เสี่ยงโดนแพลตฟอร์มลงโทษ"
- **คอลัมน์ขวา — customer panel (§3.4):** contact info + ช่องทางอื่นของคนเดียวกัน + (ถ้าเชื่อม Member) แต้ม/tier/ประวัติซื้อ + ปุ่มผูก/สร้างสมาชิก; ไม่เชื่อม Member → แสดง CTA "เชื่อมระบบสมาชิกเพื่อเห็นโปรไฟล์ลูกค้า"
- **Empty state:** "ยังไม่มีแชท — เชื่อมช่องทางแรกของคุณ" + ปุ่มไป settings

### 6.2 `/app/sys/[systemId]/settings` — 3 แท็บ

1. **ช่องทาง:** การ์ดต่อ connection (ไอคอน + ชื่อ + สถานะ CONNECTED/EXPIRED/ERROR + lastInboundAt + defaultUnit + ปุ่มทดสอบ/แก้/ถอด) + ปุ่ม "เชื่อมช่องทางใหม่" → grid 6 ช่องทาง (ช่องที่ยังไม่รองรับ = "เร็วๆ นี้") → **wizard ต่อช่องทาง** (§7.1–7.5): step-by-step มีภาพหน้าจอ, ฟอร์มกรอก token (LINE) หรือปุ่ม authorize (อื่น ๆ), จบด้วย healthCheck อัตโนมัติ + "ส่งข้อความทดสอบหา OA ของคุณตอนนี้เพื่อยืนยัน"
2. **ข้อความสำเร็จรูป:** ตาราง shortcut/title/ช่องทาง/ครั้งที่ใช้ + CRUD modal
3. **ทั่วไป:** เชื่อมระบบ Member (dropdown ระบบ MEMBER ใน tenant + คำอธิบายผล §11.6) · SLA/แจ้งเตือน · retention · webchat widget (greeting/offline/pre-chat/ปิดรายหน่วย + ปุ่ม preview) · รายชื่อ unit ที่เชื่อม (read-only → ลิงก์ `/app/u/[slug]`)

### 6.3 `/app/sys/[systemId]/reports` — การ์ด KPI + กราฟ volume รายวัน **แยกเส้นต่อช่องทาง** + ตาราง per-channel / per-agent / per-unit + ช่วงวันที่ + export CSV

### 6.4 Storefront — webchat widget (เฉพาะหน้า unit ที่เชื่อมระบบนี้)

- launcher ปุ่มกลมดำ + badge · หน้าต่าง desktop 380×600 / mobile full-sheet · header ชื่อร้าน + "ปกติตอบภายใน ~N นาที" (FRT median 7 วัน) / นอกเวลา → offlineMessage · pre-chat form (ถ้าเปิด) · เธรด + typing + "อ่านแล้ว" + แนบรูป · ส่งพลาด → ปุ่มลองใหม่ (clientMessageId เดิม) · offline → banner reconnect

### 6.5 Badge sidebar — เมนูระบบ Chat มี badge = conversation ที่ `staffUnreadCount>0` ในระบบที่ user มีสิทธิ์ (SSE + poll fallback) + เลขบน tab title

รวม **5 กลุ่มหน้าจอ** (inbox · settings 3 แท็บ + wizard 6 ช่องทาง · reports · widget · badge)

---

## 7. Business Flows

### 7.1 Onboarding — LINE (✅ MVP, BYOK step-by-step ฝั่งร้าน)

1. ร้านกด "เชื่อม LINE" ใน settings → wizard อธิบาย: ต้องมี LINE OA ก่อน (ลิงก์ไปสมัครฟรี)
2. Wizard พาทีละจอ (มีภาพประกอบ): เข้า **LINE Developers Console** → สร้าง/เลือก Provider → สร้าง **Messaging API channel** ผูกกับ OA → ปิด auto-reply/greeting เดิมของ OA (กันตอบชนกัน — แจ้งเหตุผล)
3. ร้าน copy **Channel secret** + ออก **Channel access token (long-lived)** → paste ในฟอร์ม SHARK
4. SHARK แสดง **webhook URL** (`/api/webhooks/chat/LINE/{webhookKey}`) → ร้าน paste ใน console + เปิด "Use webhook"
5. กด "ทดสอบ" → `adapter.healthCheck` (get bot info) + รอ webhook verify → สถานะ CONNECTED → เลือก `defaultUnitId` (ถ้าเชื่อม unit ไว้)
   - **Failure:** token ผิด → บอกตำแหน่งที่มักพลาด; webhook ไม่ถึงใน 2 นาที → checklist (เปิด use webhook หรือยัง / URL ตรงไหม)

### 7.2 Onboarding — Facebook + Instagram (🔜 OAuth ฝั่ง SHARK)

1. กด "เชื่อม Facebook" → redirect Facebook Login for Business (Meta App ของ SHARK, scope `pages_messaging`, `pages_manage_metadata`, +IG `instagram_manage_messages`)
2. ร้านเลือกเพจ → callback (§5.2 #23) แลก Page access token → subscribe เพจกับ webhook app → สร้าง connection (FACEBOOK) + ถ้าเพจผูก IG professional → เสนอสร้าง connection INSTAGRAM ต่อทันที
3. healthCheck (อ่านชื่อเพจ) → CONNECTED
   - **เงื่อนไข:** ใช้ได้จริงต่อเมื่อ Meta App ผ่าน review แล้ว (§3.8) — ก่อนหน้านั้นเฉพาะเพจของ tester

### 7.3 Onboarding — Shopee (🔜)

1. กด "เชื่อม Shopee" → SHARK สร้าง authorize link (partner app) → ร้าน login Shopee Seller ยืนยันสิทธิ์
2. callback รับ `code + shop_id` → แลก access_token + refresh_token → connection (SHOPEE, `externalAccountId=shop_id`, `tokenExpiresAt` ~4 ชม.)
3. ลงทะเบียนรับ push ของ shop นี้ + เปิด polling fallback (ทุก 1 นาทีเมื่อ push เงียบผิดปกติ)
4. Wizard เตือนนโยบาย: "ห้ามส่งเบอร์/LINE/ลิงก์นอก Shopee ในแชท — บัญชีร้านเสี่ยงโดนลงโทษ"

### 7.4 Onboarding — Lazada (🔜) — เหมือน Shopee: authorize → token → IM push/polling · ⚠️ ตรวจสิทธิ์ IM API ของ app ก่อน (ไม่ใช่ทุก app ได้)

### 7.5 Onboarding — WhatsApp (🔜)

1. ต้องมี: Meta Business + เบอร์ใหม่ (ไม่เคยใช้แอป WhatsApp) — wizard เช็คลิสต์ก่อนเริ่ม
2. Embedded Signup ของ Meta → สร้าง WABA + phone number ID → system-user token → connection
3. อธิบาย pricing: ตอบในหน้าต่าง 24 ชม. = service (ฟรี), นอกหน้าต่างต้อง template (มีค่าใช้จ่าย — v1 ยังไม่รองรับส่ง template → composer ปิดเมื่อ window หมด)

### 7.6 Inbound — รับข้อความทุกช่องทาง (core routing เส้นเดียว)

1. `POST /api/webhooks/chat/:channelType/:webhookKey` → resolve connection (ไม่พบ/DISABLED → 200 เงียบ + log)
2. `adapter.verifyWebhook(rawBody, headers, credentials)` — signature ผิด → 401 + log
3. **dedupe ชั้น 1:** insert `ChatWebhookLog` (`@@unique([connectionId, eventKey])`) — ชน → DUPLICATE, จบ
4. ตอบ **200 ทันที** → งานต่อเข้า queue: `adapter.parseInbound` → ต่อข้อความ:
   a. upsert `ChatContact` จาก `externalUserId` (+ดึง profile ชื่อ/avatar ถ้ายังไม่มี) — contact `blockedAt` → เก็บ log ไม่สร้างเธรด
   b. advisory lock contactId → หา conversation active — ไม่มี → สร้าง (`unitId = connection.defaultUnitId`, `firstCustomerMessageAt=now`, event CREATED) / RESOLVED ≤24 ชม. → reopen
   c. media → ดาวน์โหลดจาก provider เก็บ object storage ทันที (URL ต้นทางหมดอายุ) → `ChatAttachment`
   d. insert `ChatMessage` (IN, dedupe ชั้น 2 ด้วย `externalMessageId`) + อัปเดต denormalized + `staffUnreadCount+1` + คำนวณ `replyWindowExpiresAt` ตามช่องทาง (transaction เดียว)
5. SSE `message.new` + `badge` → ครบ `unassignedAlertMin` ไม่มีคนรับ → notify WEB หา staff ที่มี `chat.reply`
   - **Failure:** queue ล้ม → retry with backoff; parse ไม่ได้ (payload แบบใหม่) → WebhookLog FAILED + แจ้ง ops — **ไม่ throw ใส่ provider** (กันโดนปิด webhook)

### 7.7 Outbound — staff ตอบ

1. `POST …/messages` → ตรวจ `clientMessageId` ซ้ำ → insert `ChatMessage` (OUT, `deliveryStatus=PENDING`; WEBCHAT/internal = SENT ทันที) → SSE ให้ทีมเห็นก่อน
2. queue → adapter ของช่องทาง: LINE ใช้ replyToken ถ้ายังไม่หมดอายุ (ฟรี) ไม่งั้น push · FB/IG/WA ตรวจ window ก่อน — ปิดแล้ว → FAILED `REPLY_WINDOW_CLOSED` ไม่ยิง API
3. สำเร็จ → SENT + เก็บ `externalMessageId` · fail ชั่วคราว (rate limit/network) → retry backoff สูงสุด 3 · fail ถาวร → FAILED + event `DELIVERY_FAILED` + SSE (ฟองขอบประ+ปุ่มลองใหม่) · fail ต่อเนื่องทั้ง connection → `status=ERROR/EXPIRED` + notify OWNER
4. ข้อความ OUT แรก (ไม่ internal) → set `firstResponseAt`

### 7.8 ผูกลูกค้าเข้า Member (identity link)

เงื่อนไข: `ChatSetting.memberSystemId` ต้องตั้งแล้ว
1. staff เปิด customer panel → "ผูกกับสมาชิก" → ค้นด้วยชื่อ/เบอร์/อีเมล (`member.getProfile`/search ใน member system นั้น) หรือ "สร้างใหม่" → `member.findOrCreate({ …, source:'CHAT' })`
2. `POST /contacts/:id/link-customer { customerId }` → ตรวจ customer ∈ memberSystem → set `contact.customerId` + event `CUSTOMER_LINKED` + `AuditLog`
3. panel refresh: แต้ม/ประวัติ + contact ช่องทางอื่นที่ `customerId` เดียวกันโผล่เป็น "ช่องทางอื่นของลูกค้าคนนี้"
   - **หมายเหตุ:** link ที่ระดับ **contact** ไม่ใช่ conversation — ทุกเธรดของ contact นี้ (อดีต+อนาคต) เห็น member เดียวกัน · ผูกผิด → เปลี่ยน/ถอดได้ (event เก็บประวัติ)

### 7.9 ปิดเธรด / reopen

- staff → `RESOLVED` (+system message; WEBCHAT ลูกค้าเห็น "จบการสนทนา — พิมพ์เพื่อเริ่มใหม่ได้", ช่องทางภายนอกไม่ส่งอะไรออก — ไม่ spam ลูกค้า)
- ลูกค้าพิมพ์เข้า PENDING → กลับ OPEN · เข้า RESOLVED ≤24 ชม. → reopen เธรดเดิม (`reopenedCount+1`, ล้าง `resolvedAt`, FRT ไม่นับใหม่) · >24 ชม. → เธรดใหม่

### 7.10 Token lifecycle (cron ทุก 15 นาที)

1. connection ที่ `tokenExpiresAt < now + 1h` → `adapter.refreshToken` (Shopee/Lazada/FB long-lived exchange) → อัปเดต credentials
2. refresh fail (ร้าน revoke/เปลี่ยนรหัส) → `status=EXPIRED` + notify OWNER (WEB+EMAIL: "LINE OA ร้าน A หลุดการเชื่อมต่อ — กดเชื่อมใหม่") + banner ใน inbox
3. ระหว่าง EXPIRED: inbound อาจยังเข้า (webhook ไม่ตาย) → รับปกติ; outbound → FAILED `TOKEN_EXPIRED`

### 7.11 Retention purge (cron รายวัน 04:00 Asia/Bangkok)

เหมือนแบบแผนเดิม: purge `ChatMessage` ของเธรด RESOLVED ที่เกิน `retentionDays` → ลบไฟล์ storage → tombstone (`purgedAt`, body=null) · contact ที่ไม่ผูก customer + เงียบ >90 วัน + ไม่มีเธรด active → ล้าง PII · `ChatWebhookLog` เกิน 30 วัน → ลบ · สรุปลง AuditLog

---

## 8. Integration (contracts v2 จาก `_CONVENTIONS` §2 — เพิ่ม `systemId` ใน context)

### 8.1 ChannelAdapter interface (หัวใจของระบบ — ทุกช่องทาง implement ตัวนี้)

```ts
// lib/modules/chat/channel-adapter.ts
export interface InboundMessage {
  externalUserId: string            // LINE userId / FB PSID / IG IGSID / wa_id / buyer id
  externalMessageId: string         // idempotency ฝั่ง provider
  profile?: { displayName?: string; avatarUrl?: string }
  type: 'TEXT' | 'IMAGE' | 'STICKER' | 'FILE' | 'ORDER_CONTEXT'
  body?: string
  stickerMeta?: Json
  orderContext?: Json               // Shopee/Lazada order/product card
  media?: { fetch: () => Promise<{ buffer: Buffer; mimeType: string }> }[]  // lazy — โหลดตอน routing เก็บ storage
  sentAt: Date
}

export interface ChannelAdapter {
  readonly type: ChatChannelType
  readonly capabilities: {
    sendSticker: boolean
    sendFile: boolean
    replyWindowHours: number | null   // LINE/WEBCHAT=null, FB/IG/WA=24 (HUMAN_AGENT ขยาย — adapter จัดการเอง)
    typing: boolean                   // WEBCHAT เท่านั้น
  }

  /** ตรวจ signature webhook (x-line-signature / x-hub-signature-256 / Shopee-Lazada sign) */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>, credentials: Json): boolean
  /** ตอบ challenge ตอน register (Meta hub.challenge ฯลฯ) — null ถ้าช่องทางไม่มี */
  verifyChallenge?(query: Record<string, string>, credentials: Json): string | null
  /** แปลง payload → ข้อความมาตรฐาน (1 webhook อาจมีหลายข้อความ) */
  parseInbound(payload: unknown, credentials: Json): InboundMessage[]
  /** ส่งออก — โยน ChannelDeliveryError { retryable, reason } เมื่อพัง (reason: REPLY_WINDOW_CLOSED ฯลฯ) */
  sendMessage(args: {
    credentials: Json
    externalUserId: string
    message: { type: ChatMessageType; body?: string; stickerMeta?: Json; attachments?: ChatAttachment[] }
    context?: { replyToken?: string }   // LINE: ใช้ reply token ฟรีก่อน push
  }): Promise<{ externalMessageId?: string }>
  /** ดึงโปรไฟล์ contact (ชื่อ/avatar) */
  fetchProfile?(credentials: Json, externalUserId: string): Promise<{ displayName?: string; avatarUrl?: string }>
  /** ตรวจ credentials (ปุ่มทดสอบ + หลัง onboarding) */
  healthCheck(credentials: Json): Promise<{ ok: boolean; detail?: string }>
  /** ต่ออายุ token (Shopee/Lazada/FB) — ช่องทาง token ถาวรไม่ต้องมี */
  refreshToken?(credentials: Json): Promise<Json>
  /** ช่องทางที่ push ไม่การันตี (Shopee/Lazada) — ดึงข้อความย้อนหลังเทียบ dedupe */
  pollMessages?(credentials: Json, since: Date): Promise<InboundMessage[]>
}
```

Core routing เขียนครั้งเดียว (v1 ให้ WEBCHAT+LINE วิ่งผ่าน) — เพิ่มช่องทาง = เพิ่มไฟล์ adapter เดียว **ห้ามแตะ core** · rate limiter กลางต่อ `(channelType, connectionId)` + คิว outbound แยกต่อ connection (Shopee/Lazada limit ระดับ partner app — ต้อง throttle รวมทุกร้าน §1.3)

### 8.2 Member (contract 2.6) — ผ่าน `memberSystemId` เท่านั้น

- `member.getProfile / member.findOrCreate({ systemId: memberSystemId, … })` — Chat ไม่ copy ชื่อ/เบอร์เก็บเอง (ยกเว้นข้อมูลที่ provider ให้บน `ChatContact` ซึ่งเป็น identity ของช่องทาง ไม่ใช่ master data)
- ไม่ได้เชื่อม Member → ปุ่มผูก/แผงโปรไฟล์ซ่อน — ทุกอย่างอื่นทำงานปกติ

### 8.3 อ่านประวัติซื้อ (read-only, panel ข้างจอ)

`pos.getRecentSales` / `booking.getRecentAppointments` ฯลฯ ผ่าน read service ภายใน — เรียกเฉพาะระบบที่ unit ของเธรดเชื่อมอยู่จริง (resolve ผ่าน `AppSystemUnit`); ระบบไหนไม่ได้เชื่อม → ซ่อน section (ไม่ error)

### 8.4 Notification (contract 2.5) — `chat.unassigned` / `chat.assigned_to_you` / `chat.connection_expired` = class `TRANSACTIONAL`; Chat ไม่ส่งอีเมลเอง

### 8.5 Activity timeline (contract 2.7) — เมื่อ contact ผูก customer แล้ว: ยิง `activity.log({ module:'CHAT', type:'conversation.resolved', refType:'ChatConversation', … })` ผ่าน outbox

### 8.6 AuditLog กลาง — เชื่อม/ถอด/แก้ connection (ไม่เก็บค่า credentials), link/unlink customer, เปลี่ยน retention/memberSystemId, block contact, retention purge run

### 8.7 DailyStat กลาง — `StatProvider.collectDailyStats()` (module=CHAT, มิติ systemId, breakdown channel ใน meta) — ห้ามมีตาราง summary เอง

---

## 9. Permissions

> Chat เป็นระบบ (AppSystem) — สิทธิ์ตัดที่**ระดับระบบ**: user ที่มีสิทธิ์โมดูล CHAT ของระบบนั้นเห็นทั้ง inbox ของระบบนั้น (อยากแยกทีมแยกร้าน = สร้างระบบ Chat แยกชุด — ตรงหลัก "ทุกอย่างคือระบบ") · การกรองราย unit ใน inbox เป็น**ตัวกรอง UX ไม่ใช่กำแพงสิทธิ์** (🔜 unit-visibility gate ถ้ามี demand จริง)

| Action | คำอธิบาย | OWNER | MANAGER | STAFF | Custom |
|---|---|---|---|---|---|
| `chat.read` | เห็น inbox/อ่านเธรด/รายงาน badge | ✅ | ✅ | ✅ | ✅ |
| `chat.reply` | ส่งข้อความ/โน้ต/รูป/retry + เปลี่ยนสถานะเธรดที่ตนเป็น assignee | ✅ | ✅ | ✅ | ✅ |
| `chat.manage` | มอบหมายคนอื่น, ย้าย unit tag, ผูก/ถอด customer, block contact, เปลี่ยนสถานะเธรดคนอื่น | ✅ | ✅ | ❌ | ✅ |
| `chat.settings` | quick replies / SLA / retention / widget / เชื่อม memberSystemId | ✅ | ✅ | ❌ | ✅ |
| `chat.connections` | เชื่อม/ถอด/แก้ channel connection (**ถือ credentials**) | ✅ | ❌ | ❌ | ✅ (ระวังมาก) |
| `chat.reports` | ดูรายงาน + export | ✅ | ✅ | ❌ | ✅ |

- ลูกค้า/guest (webchat): ไม่มี RBAC — ตรวจ ownership ต่อ contact token/session เท่านั้น
- credentials ใน API: masked เสมอ แม้ OWNER — ค่าเต็มมีชีวิตเฉพาะใน adapter layer

---

## 10. Reports & Metrics

แหล่งข้อมูล: `DailyStat` กลาง (module=CHAT, systemId) + query สดจาก raw สำหรับวันปัจจุบัน/median/P90 — **channel เป็น dimension หลักทุกรายงาน** (โจทย์ omni-channel: ร้านอยากรู้ว่าลูกค้ามาจากไหน ช่องไหนตอบช้า)

| รายงาน | นิยาม |
|---|---|
| **Volume ต่อช่องทาง** | conversations ใหม่ + ข้อความเข้า/ออก รายวัน แยกเส้นต่อ channel (กราฟ + ตาราง) |
| **First Response Time** | avg = `frt_sum_sec/frt_count` · median/P90 จาก raw · % ภายใน SLA — แยก per-channel |
| **Resolved rate** | resolved ในช่วง ÷ ใหม่ในช่วง + avg resolution time + reopen rate |
| **Delivery health** | ข้อความ OUT FAILED ต่อช่องทาง + เหตุผลยอดนิยม (window/token/rate) — ชี้ปัญหา connection |
| **Per-agent** | เธรดที่รับ, ข้อความส่ง, FRT ของเธรดที่ตน first-respond, resolved count |
| **Per-unit** | ทุก metric แยกตาม unit tag |
| **แชทค้าง (สด)** | การ์ดบน `/app`: เธรด OPEN ไร้ assignee + เกิน SLA ตอนนี้ ของทุกระบบ Chat ที่ user เห็น |
| Export | CSV ทุกตาราง (`chat.reports`) |

---

## 11. Edge Cases & Rules

1. **Webhook ซ้ำ (dedupe 2 ชั้น)** — provider ยิงซ้ำเป็นเรื่องปกติ (retry เมื่อเราตอบช้า): ชั้น 1 `ChatWebhookLog @@unique([connectionId, eventKey])` · ชั้น 2 `ChatMessage @@unique([conversationId, externalMessageId])` — ชนแล้วข้ามเงียบ ตอบ 200 เสมอ
2. **Token หมดอายุ/ถูก revoke** — cron refresh ล่วงหน้า (§7.10); ตายจริง → `EXPIRED` + notify OWNER + banner; outbound FAILED `TOKEN_EXPIRED` เก็บไว้ retry ได้หลัง re-auth; **inbound ไม่ทิ้ง** (webhook มักยังมา)
3. **Reply window ปิด (FB/IG/WA)** — ตรวจ**ก่อน**ยิง API (จาก `replyWindowExpiresAt`) → composer ปิด + อธิบาย; ยิงแล้วโดน reject (clock skew) → FAILED เหตุผลเดียวกัน — ห้าม retry อัตโนมัติ (ไม่มีวันสำเร็จ)
4. **Race สร้าง conversation** — advisory lock ต่อ contactId + partial unique index (§4) เป็น safety net
5. **ลูกค้าคนเดียวหลายช่องทาง** — ไม่ merge contact record (identity ฝั่ง provider คนละอัน) แต่ผูก `customerId` เดียวกัน → panel รวมทุกช่องทาง + timeline member เดียว; ผูกผิด → เปลี่ยน/ถอด (event log ครบ); **ไม่ auto-merge ด้วยชื่อ/เบอร์ที่เดาเอง** — staff ยืนยันเสมอ
6. **เปลี่ยน/ถอด `memberSystemId`** — confirm modal เตือน: `customerId` เดิมทั้งหมดจะถูกล้าง (อ้าง member ระบบเก่า ใช้ต่อไม่ได้) — ต้องพิมพ์ชื่อระบบยืนยัน + AuditLog
7. **ถอด channel connection** — DELETE = `DISABLED` + ลบ credentials; contact/conversation/message เก่าอยู่ครบ (อ่านได้ ตอบไม่ได้ — composer แจ้ง "ช่องทางถูกถอด"); เชื่อมบัญชีเดิมกลับ → `externalAccountId` เดิม match → contact เดิมกลับมาใช้ต่อ
8. **Shopee/Lazada push ไม่การันตี** — `pollMessages` fallback: connection ที่ `lastInboundAt` เงียบผิดปกติ (มี order ใหม่แต่ไม่มีแชท) → poll ทุก 1 นาที เทียบ dedupe ชั้น 2 · นโยบายห้าม off-platform contact: hint ถาวรใน composer + 🔜 warning ตรวจ regex เบอร์/LINE id ก่อนส่ง
9. **LINE push quota หมด (แผน Free)** — reply token หมดอายุ + โควต้า push เต็ม → FAILED `QUOTA_EXCEEDED` + แนะนำร้านอัปเกรดแผน OA ใน error message — **ตอบไว = ฟรี** ให้ UI เน้นตอบภายในอายุ reply token
10. **Retention** — default 365 วัน (90–730): purge เฉพาะเธรด RESOLVED, tombstone คงไว้ให้รายงานตรง, ไฟล์ลบจริงจาก storage, ลดค่า → confirm modal บอกจำนวนที่จะหาย
11. **Cross-tenant / cross-system isolation** — webhookKey เดา URL ไม่ได้ + signature ต่อ connection; SSE ตรวจ systemId ทุก event; attachment = signed URL อายุสั้น; ทุก query ผ่าน guard `tenantId+systemId`
12. **Spam webchat** — rate limit: session 5/นาที/IP, ข้อความ 10/นาที/ตัวตน, upload 5/ชม. → 429 · ช่องทางภายนอก: ปุ่ม block contact (`blockedAt`)
13. **Meta App Review ยังไม่ผ่าน** — FB/IG connection สร้างได้เฉพาะเพจ tester → หน้า connect แสดงสถานะ "รอ Meta อนุมัติ" ระดับ platform (ไม่ใช่ bug ของร้าน) — flag กลาง `platformFlags.metaReviewApproved`
14. **unitId tag ต้องเป็น unit ที่เชื่อมระบบนี้** — validate กับ `AppSystemUnit` ตอน set/ย้าย; unit ถอดการเชื่อมภายหลัง → เธรดเก่าคง tag ไว้ (ป้าย "ไม่ได้เชื่อมแล้ว"), เธรดใหม่ไม่ tag
15. **ห้ามปนกับ Meeting** — ไม่มี FK/JOIN/import ข้าม `Chat*` ↔ `Meeting*` — code review reject ทันที

---

## 12. QC Checklist (เกณฑ์ตรวจรับ)

**Functional — core**
- [ ] สร้างระบบ Chat 2 ชุดใน tenant เดียว → inbox/connection/quick reply แยกขาดกันสนิท (ทดสอบทุกตาราง)
- [ ] unit เชื่อมระบบ Chat → widget โผล่บน storefront + conversation จาก widget/connection tag `unitId` ถูก; unit ไม่เชื่อม → ไม่มี widget
- [ ] ทักซ้ำระหว่าง OPEN/PENDING → เธรดเดิม; RESOLVED ≤24 ชม. → reopen; >24 ชม. → เธรดใหม่ (ทดสอบทั้ง WEBCHAT และ LINE)
- [ ] `firstResponseAt` เซ็ตครั้งเดียวจาก OUT แรกไม่ internal; internal note ไม่ส่งออกช่องทาง ไม่ขึ้น preview ไม่ notify
- [ ] มอบหมาย/เปลี่ยนสถานะ/ย้าย unit/ผูก customer/delivery fail → `ChatConversationEvent` + system message ครบ
- [ ] Quick reply: `/` autocomplete, ตัวแปรแทนค่า, จำกัด channelTypes แล้วไม่โผล่ในช่องทางอื่น
- [ ] Badge + unread ตรงจริงหลัง: ข้อความใหม่ / mark read / หลาย staff อ่านสลับกัน / reconcile cron

**Functional — channel (รันซ้ำต่อทุก adapter ที่เปิด)**
- [ ] Onboarding wizard จบได้จริงโดยคนไม่เทคนิค (ทดสอบกับร้านจริง 1 ราย/ช่องทาง) + healthCheck จับ credentials ผิดได้
- [ ] Webhook ยิงซ้ำ 3 ครั้ง → ข้อความเกิด 1 (dedupe 2 ชั้น) + ตอบ 200 ใน <3 วิ ทุกครั้ง
- [ ] Inbound media ถูกดาวน์โหลดเก็บ storage เอง — เปิดดูได้หลัง URL ต้นทางหมดอายุ
- [ ] LINE: ตอบภายในอายุ reply token → ใช้ reply (ฟรี); ช้า → fallback push; sticker รับ/ส่งแสดงถูก
- [ ] FB/IG/WA: window ปิด → composer ปิด + FAILED `REPLY_WINDOW_CLOSED` ไม่ยิง API + ไม่ auto-retry
- [ ] Shopee/Lazada: ORDER_CONTEXT แสดงการ์ดออเดอร์ + ลิงก์ seller center; polling fallback เก็บข้อความที่ push หาย โดยไม่ duplicate
- [ ] Token expiry: จำลอง revoke → status EXPIRED + notify OWNER + outbound FAILED + re-auth แล้วกลับมาส่งได้
- [ ] ถอด connection → เธรดเก่าอ่านได้/ตอบไม่ได้; เชื่อมบัญชีเดิมกลับ → contact เดิม resume

**Isolation & Security**
- [ ] User ที่ไม่มีสิทธิ์ระบบ Chat ชุด B เรียกทุก endpoint ด้วย systemId B → 403/404 (รวม SSE/upload/attachment URL)
- [ ] Tenant B ยิง webhookKey ของ tenant A ด้วย signature ตัวเอง → 401
- [ ] credentials ไม่หลุดใน API response / log / SSE / error message (ตรวจ masked ทุกจุด)
- [ ] Guest webchat token อ่านเธรดคนอื่น → 403; rate limit ทำงาน (429)
- [ ] AuditLog ครบทุก action ใน §8.6; ไม่มี import/JOIN ข้าม `Chat*`↔`Meeting*`

**Reports & Retention**
- [ ] FRT avg/median/P90, resolved rate, per-channel/agent/unit ตรงข้อมูลดิบชุดทดสอบ; DailyStat (module=CHAT) ตรง timezone ร้าน
- [ ] Retention cron: purge เฉพาะ RESOLVED เกินอายุ, ไฟล์หายจาก storage จริง, tombstone อยู่, contact PII ถูกล้าง, WebhookLog >30 วันหาย

**i18n & UI**
- [ ] ทุก string TH/EN (dashboard + widget + wizard + อีเมล) — ป้ายเหตุผล FAILED เป็นภาษาคน ไม่ใช่ code
- [ ] Mobile: inbox ทีละคอลัมน์, ตอบ+แนบรูป+quick reply จบได้บนมือถือจอ 360px, customer panel = bottom sheet
- [ ] ไอคอนช่องทาง B&W แยกกันออกใน 0.1 วิ; สถานะ/SLA/window ใช้ badge+น้ำหนักตัวอักษร ไม่พึ่งสี
- [ ] Empty/loading/error ครบทุกจอ รวมสถานะ connection EXPIRED/ERROR banner
