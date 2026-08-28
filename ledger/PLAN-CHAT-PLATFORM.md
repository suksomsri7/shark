# แผนแม่บท — SHARK Chat Platform (รวมแชท + ขายเป็นบริการแบบ LiveChat)

> เขียน 28 ส.ค. 2026 · ผู้วางแผน: Fable · ผู้ลงมือ: Opus 5 + sub agent
> ลูกค้ารายแรกของแผนนี้: **SiamDive** (บัญชี `siamdivethailand@gmail.com`)
> 🔴 อ่านไฟล์นี้ก่อนแตะงาน chat ทุกครั้ง · สถานะสดอยู่ท้ายไฟล์ (§12)

---

## §0 สิ่งที่ตัดสินใจไปแล้ว (ห้ามรื้อโดยไม่คุยกับเจ้าของ)

| # | คำตัดสิน | วันที่ | เหตุผล |
|---|---|---|---|
| D1 | ใช้ **แบบ B — headless** : SiamDive เก็บหน้าจอ/ตัวตน/ภาษา/push ของตัวเอง · SHARK เป็นเจ้าของข้อมูลแชทและ inbox | 28 ส.ค. | เลี่ยงคุกกี้ข้ามโดเมน · ไม่เสียของที่ SiamDive ทำไว้แล้ว |
| D2 | **เขียน API เป็นสาธารณะตั้งแต่วันแรก** ไม่ใช่ API ส่วนตัวของ SiamDive | 28 ส.ค. | widget ฝัง = ลูกค้าอีกรายของ API เดียวกัน ไม่ใช่ระบบคู่ขนาน |
| D3 | **ยังไม่เขียน widget ฝัง** ในรอบนี้ | 28 ส.ค. | ให้ SiamDive ใช้จริงจน API นิ่งก่อน (2–4 สัปดาห์) |
| D4 | **Ark AI ไม่ย้าย** — ต่อกันด้วยการส่งบทสนทนาเป็นข้อความ SYSTEM ตอนส่งต่อให้คน | 28 ส.ค. | Ark เป็น RAG เฉพาะทางดำน้ำ ไม่ใช่ของกลาง |
| D5 | **LINE เดินคู่ขนานได้เลย** ไม่ต้องรอเฟสอื่น | 28 ส.ค. | ของมีอยู่แล้วใน SHARK · SiamDive ไม่มีตัวรับ LINE เลยวันนี้ |

---

## §1 สภาพจริงวันนี้ (สำรวจจากโค้ด 28 ส.ค. 2026 — ไม่ใช่จากบันทึกเก่า)

### 1.1 SHARK — `/root/projects/shark-in-th`

**สิ่งที่ดีและต้องรักษาไว้**
- `src/lib/modules/chat/adapter.ts:46-99` — `ChannelAdapter` interface + registry เพิ่มช่องทาง = 1 ไฟล์ + 1 บรรทัด
- `service.ts:261-311` `getOrOpenConversation` — advisory lock `pg_advisory_xact_lock` ต่อ contact + partial unique index (`chat.prisma:165-168`) กัน conversation ซ้ำ 2 ชั้น
- `service.ts:359-418` `announceInbound` — flip unread แบบ atomic (`updateMany` where `staffUnreadCount: 0`) กันแจ้งเตือนซ้ำ
- `api/chat/webhook/[connectionId]/route.ts:71-84` — dedupe 2 ชั้น (`ChatWebhookLog @@unique` + `ChatMessage @@unique externalMessageId`)
- `src/lib/api-keys/route-auth.ts` — API key auth ครบ (sha256 hash เท่านั้น, 60 req/min, tenantId จากคีย์เสมอ)
- `src/lib/webhooks/service.ts:101` `dispatchWebhooks` — HMAC `X-Shark-Signature` (hex) + `X-Shark-Event` + retry 5 ครั้ง

**ช่องทางที่ใช้ได้จริง: LINE + WEBCHAT เท่านั้น** (`adapter.ts:86-89`)
`FACEBOOK/INSTAGRAM/SHOPEE/LAZADA/WHATSAPP` มีแค่ชื่อใน enum (`chat.prisma:12-17`) ไม่มี adapter
> โค้ด Meta เดิม (NestJS) ยังอยู่ที่ `/root/projects/shark/apps/api/src/modules/chat/meta.service.ts` (248 บรรทัด) — ยกมาแปลงได้

**ของที่ยังไม่มี**
| ขาด | หลักฐาน |
|---|---|
| `/api/v1/chat/*` | `src/app/api/v1/` มี 12 route ไม่มี chat เลย |
| CORS ทุกชนิด | grep `access-control` ทั้ง repo = 0 hit · `apiJson` ตั้งแต่ `content-type` อย่างเดียว (`route-auth.ts:11`) |
| outbox ตอนแอดมินตอบ | `sendReply` (`service.ts:604-701`) ไม่มี `emitOutbox` |
| REST upload | Bunny upload เป็น **server action** (`src/lib/storage/actions.ts:8`) ไม่มี REST route |
| widget ฝัง | `public/` ไม่มีไฟล์ js · widget วันนี้คือหน้าเต็ม `/chat/<connectionId>` (`src/app/(store)/chat/[connectionId]/page.tsx`) |
| realtime | staff inbox = `router.refresh()` ทุก 15 วิ (`app/sys/[id]/chat/page.tsx:28`) · widget polling 4 วิ (`ChatWidget.tsx:53`) |
| ระบบเก็บเงินร้าน | `Tenant.plan` + `limits` + `enabledModules` มีโครง แต่ไม่มีตัวตัดเงิน |

### 1.2 SiamDive — `/root/projects/siamdive2` (prod `www.siamdive.com`)

**แชท 3 ระบบแยกกัน**
1. **Support chat** — `SupportThread`/`SupportMessage` · ตัวตน = `deviceId` (`src/lib/device.ts:4-12`, key `sd2_device`) แล้วประทับ email ตอน OTP ผ่าน · กติกาการมองเห็น `src/lib/support-chat.ts:38-47`
2. **Booking chat** — `BookingRequest`/`BookingMessage` · ตัวตน = รู้ `requestId` เท่านั้น (capability)
3. **Ark AI** — `/api/ark-ai/chat` SSE · **ไม่มี tool ส่งต่อให้คน** (`src/lib/ark-ai/tools.ts:29-195`)

**ของดีที่ SHARK ยังไม่มี — ต้องไม่หายตอนย้าย**
- Rate limit บน **Postgres** (`RateLimitBucket`, `src/lib/rate-limit.ts`) ← ทนกว่า in-memory ของ SHARK มาก
- อัปโหลดไฟล์แบบ REST + MIME allowlist + 10 MB (`api/support-chat/upload/route.ts`)
- ประทับ email ยืนยันแล้ว + adopt เธรดของแขก (`api/user-plans/verify-otp/route.ts:44-50`)
- บริบทลูกค้า: `pageUrl` / `country` / `userAgent` / `lang`
- แท็บ "รอตอบ" เรียง**เก่าสุดก่อน** (`api/support-chat/admin/route.ts:9-10,24`)

**ข้อเท็จจริงที่ต้องแก้ความเข้าใจเดิม**
- 🔴 widget แชทรองรับ **5 ภาษา ไม่ใช่ 8** (`src/components/newweb/i18n.ts:7-14` = th/en/cn/ja/de)
  และ **ฟองแชทข้างในมีแค่ th/en** (`BookingChat.tsx:18-23`) → ผู้ใช้ cn/ja/de เห็นปุ่มเป็นอังกฤษ
- 🔴 **support chat ไม่ส่ง push ให้ลูกค้าเลย** (มีแต่ booking chat — `api/booking-chat/[requestId]/route.ts:130`)
- 🔴 booking-chat ใช้ rate limit แบบ **in-memory Map** (`[requestId]/route.ts:27-34`) ซึ่งบน Vercel แทบไม่กันอะไร
- 🔴 `booking-chat/upload` **ไม่มี auth เลย** — รู้ `requestId` ก็อัปไฟล์ได้ (`upload/route.ts:34-35`)
- 🔴 OTP ที่กดจาก `AccountSheet` ยิงไป `maps.siamdive.com` ซึ่ง **ไม่ประทับ `DeviceProfile.email` ของ siamdive2** → `canAttach` ไม่พลิก (`mapsAccount.ts:139-159` เทียบ `user-plans/verify-otp/route.ts:44`)

---

## §2 สถาปัตยกรรมเป้าหมาย — 3 ชั้น

```
┌─ ชั้น 3: หน้าจอ (Surfaces) ─────────────────────────────────────────┐
│  เว็บ SiamDive   แอป SiamDive(RN)   inbox ทีม SHARK   [widget ฝัง — อนาคต]│
└───────────────┬──────────────────┬────────────────┬─────────────────┘
                │ REST (API key)   │ REST           │ server action
┌───────────────▼──────────────────▼────────────────▼─────────────────┐
│ ชั้น 2: Public API  /api/v1/chat/*                                   │
│  auth 2 ระดับ:  secret key (s2s)  ·  public widget key (เบราว์เซอร์)   │
│  CORS + origin allowlist + rate limit บน DB                          │
└───────────────┬─────────────────────────────────────────────────────┘
┌───────────────▼─────────────────────────────────────────────────────┐
│ ชั้น 1: Core  src/lib/modules/chat/service.ts + adapter registry     │
│  LINE ✅  WEBCHAT ✅  [FB · IG · WhatsApp · Shopee · Lazada — อนาคต]  │
│  outbox → webhook ขาออก (HMAC) → SiamDive ส่ง push ต่อ                │
└─────────────────────────────────────────────────────────────────────┘
```

**กฎเหล็ก 3 ข้อ**
1. ชั้น 2 ต้องไม่มี logic ธุรกิจ — เรียกชั้น 1 อย่างเดียว (ไม่งั้น widget กับ SiamDive จะได้พฤติกรรมต่างกัน)
2. `tenantId` มาจากกุญแจเสมอ ห้ามรับจาก body (กฎเดิมของ repo — `api/v1/ai/tools/[name]/route.ts:7`)
3. อะไรที่ SiamDive ต้องใช้ ให้ทำเป็น**ความสามารถของแพลตฟอร์ม** ไม่ใช่ทางลัดเฉพาะ SiamDive

---

## §3 สัญญา API v1 (ตัวเอกสารสำหรับทั้ง SiamDive และ widget อนาคต)

### 3.1 ตัวตน 2 ระดับ — 🔴 หัวใจของ D2

| ระดับ | รูปแบบ | ใครใช้ | ทำอะไรได้ |
|---|---|---|---|
| **Secret key** | `Authorization: Bearer shark_<64hex>` (ของเดิม `api-keys/service.ts:21`) | เซิร์ฟเวอร์ SiamDive | อ้างตัวแทนลูกค้าคนไหนก็ได้ (`externalUserId` มาจาก body) |
| **Public widget key** | `X-Shark-Widget: swk_<32hex>` + `Origin` ต้องอยู่ใน allowlist | เบราว์เซอร์ (widget อนาคต) | ทำได้เฉพาะในนามของ **guest token ที่เซิร์ฟเวอร์ออกให้** เท่านั้น |

> ⛔ ห้าม secret key โผล่ในเบราว์เซอร์เด็ดขาด · widget key อ่านข้อมูลของ contact อื่นไม่ได้แม้จะรู้ id

### 3.2 Endpoint

ทุกเส้นขึ้นต้น `/api/v1/chat` · error เป็น `{ error: "<ข้อความไทย>" }` ตามแบบเดิม (`route-auth.ts`)

| Method | Path | auth | คำอธิบาย |
|---|---|---|---|
| POST | `/identities` | secret | ออก/ผูก contact — body `{ externalUserId, displayName?, email?, phone?, lang?, meta? }` → `{ contactId, conversationId? }` |
| POST | `/messages` | secret / widget | ส่งข้อความจากลูกค้าเข้าระบบ — body `{ externalUserId, body?, attachments?[], clientMessageId?, context? }` |
| GET | `/thread` | secret / widget | `?externalUserId=&after=<ISO>&limit=` → `{ conversationId, status, messages[] }` |
| POST | `/read` | secret / widget | ลูกค้าอ่านแล้ว — body `{ externalUserId, lastReadMessageId? }` |
| GET | `/unread` | secret / widget | `?externalUserId=` → `{ unread }` |
| POST | `/attachments` | secret / widget | multipart → `{ url, name, mimeType, sizeBytes, width?, height? }` |
| POST | `/guest` | widget | ออก guest token ใหม่ (เฉพาะ widget key) → `{ guestToken }` |
| GET | `/config` | widget | `{ greeting, offlineMessage, locales[], theme, widgetEnabled }` |

**`messages[]` shape (ใช้ร่วมกันทุกเส้น — เปลี่ยนทีหลัง = ลูกค้าพัง)**
```jsonc
{
  "id": "cuid",
  "direction": "IN" | "OUT",
  "type": "TEXT" | "IMAGE" | "STICKER" | "FILE" | "SYSTEM",
  "body": "string | null",
  "attachments": [{ "url": "...", "name": "...", "mimeType": "...", "sizeBytes": 0, "width": null, "height": null }],
  "senderName": "string | null",   // ชื่อที่ลูกค้าควรเห็น (ไม่ใช่ชื่อพนักงานจริงถ้าร้านตั้งนามแฝง)
  "createdAt": "ISO"
}
```
🔴 ต้องมี `type` + `attachments` — ของเดิม `PublicMsg` (`service.ts:974`) มีแค่ 4 ฟิลด์ ทำให้รูป/สติกเกอร์แสดงเป็นช่องว่าง

### 3.3 `context` (บริบทลูกค้า) — ยกของดีจาก SiamDive มาเป็นของกลาง
```jsonc
{ "pageUrl": "...", "userAgent": "...", "country": "TH", "lang": "th", "referrer": "..." }
```
เก็บลง `ChatConversation.meta` — ทีมงานเห็นว่าลูกค้ากำลังดูหน้าไหนอยู่

### 3.4 Webhook ขาออก (SHARK → SiamDive)
| event | เมื่อไหร่ | payload |
|---|---|---|
| `chat.message.received` | ลูกค้าทัก (มีแล้ว) | `{ conversationId, channel, messageId }` |
| **`chat.message.sent`** 🆕 | แอดมินตอบ (ไม่รวม internal note) | `{ conversationId, messageId, externalUserId, channel, preview, senderName }` |

🔴 **ความหมายที่ตกลงแล้วของ `chat.message.sent` = "แอดมินตอบแล้ว" ไม่ใช่ "ถึงมือลูกค้าแล้ว"**
event ออกในทรานแซกชันเดียวกับการเขียนข้อความ (ข้อความรอด = event รอด) ส่วนการยิงออก LINE/FB
เป็น network call ที่ต้องอยู่นอกทรานแซกชัน (ไม่งั้น provider ตอบช้า = ถือ connection ของ Neon ค้าง → pool ตันทั้งแพลตฟอร์ม)
⇒ ส่งออกไม่สำเร็จ (`deliveryStatus=FAILED`) event ก็ออกไปแล้ว
**WO-C6 ต้องใช้ event นี้ยิง push ได้เลย** (SiamDive เป็น WEBCHAT ไม่มีขาส่งออกภายนอกอยู่แล้ว)
ถ้าอนาคตต้องการ "ยืนยันว่าถึงจริง" ต้องเพิ่ม event แยก (`chat.message.delivered`) ห้ามเปลี่ยนความหมายของตัวนี้
| **`chat.conversation.status`** 🆕 | ปิด/เปิดเธรด | `{ conversationId, status, externalUserId }` |
| **`chat.contact.linked`** 🆕 | ผูกกับสมาชิก | `{ contactId, customerId }` |

ลายเซ็นเดิม: `X-Shark-Signature: hex(hmacSHA256(secret, body))` + `X-Shark-Event`

---

## §4 การเปลี่ยน schema (migration)

| # | ตาราง | เปลี่ยน | เหตุผล |
|---|---|---|---|
| M1 | `ChatChannelConnection` | + `originAllowlist Json @default("[]")` · + `publicKeyHash String?` · + `publicKeyPrefix String?` | widget key + กันคนเอา id ไปแปะเว็บอื่น |
| M2 | `ChatContact` | + `lang String?` · + `externalRef String?` (id ฝั่งระบบต้นทาง) · + `verifiedEmail Boolean @default(false)` | ภาษา + ตัวตนที่ยืนยันแล้ว |
| M3 | `ChatConversation` | + `meta Json?` | เก็บ context (pageUrl/country/…) |
| M4 | `ChatMessage` | + `senderName String?` | ชื่อที่ลูกค้าเห็น (SiamDive ใช้ "ทีมงาน SiamDive") |
| M5 | `ChatSetting` | `greetingMessage`/`offlineMessage` → map ภาษาเปิด · + `senderAlias String?` · + `theme Json @default("{}")` | หลายภาษา + ตั้งหน้าตา widget อนาคต |
| M6 | ใหม่ `ChatRateBucket` | `key @unique` · `count` · `windowStart` | ย้าย rate limit ออกจาก memory (ลอกจาก siamdive2 `RateLimitBucket`) |

> ทุก migration ต้อง **additive** · `prisma migrate dev` บน Neon branch → merge → **`pnpm exec prisma migrate deploy` บน prod เอง** (Vercel ไม่รันให้ — `ledger/RESUME.md:555`)

---

## §5 บั๊ก/ช่องโหว่ที่เจอตอนสำรวจ — ต้องแก้ในรอบนี้

### SHARK
| ID | ความรุนแรง | เรื่อง | หลักฐาน |
|---|---|---|---|
| B1 | 🔴 CRITICAL | `getConnection(connectionId)` **ไม่มี tenant/system filter** — ใครรู้ id ก็ดึงแถวข้ามร้านได้ | `service.ts:73-76` |
| B2 | 🔴 CRITICAL | rate limit เป็น in-memory ต่อ process → บน Vercel หลาย instance = แทบไม่กัน | `chat/rate-limit.ts:1-3` · `core/rate-limit.ts:2` |
| B3 | 🟠 MAJOR | `getWebchatThread` คืน `PublicMsg` ที่ไม่มี `type`/`attachments` → รูป/สติกเกอร์แสดงเป็นช่องว่าง | `service.ts:963-974` เทียบ `ChatWidget.tsx:107` |
| B4 | 🟠 MAJOR | `sendReply` ไม่ยิง outbox → ระบบภายนอกไม่มีทางรู้ว่าแอดมินตอบ | `service.ts:604-701` |
| B5 | 🟠 MAJOR | `assign()` ไม่ตรวจว่า assignee เป็นสมาชิกของ tenant จริง | `service.ts:816-841` |
| B6 | 🟡 MINOR | `linkCustomer` ไม่มี `unitAccess` → ผูกลูกค้าข้าม unit ได้ | `service.ts:874` |
| B7 | 🟡 MINOR | LINE webhook URL ใช้ `connection.id` แต่ schema มี `webhookKey @unique` ที่ไม่เคยถูกใช้ → หมุนกุญแจไม่ได้ | `ui.tsx:301` เทียบ `chat.prisma:72` |
| B8 | 🟡 MINOR | `ChatSetting` 6 ฟิลด์ไม่เคยถูกอ่าน — **ปิดแล้ว 1** (`offlineMessage` มี `resolveLocale` พร้อมใช้) · **เหลือ 5**: `widgetEnabled` `preChatFormEnabled` `slaFirstResponseMin` `unassignedAlertMin` `retentionDays`<br>🔴 `retentionDays` = ข้อ PDPA ใน §11 → แยกเป็น **WO-C12** | grep ทั้ง repo |
| B9 | 🟡 MINOR | `unreadCount()` ไม่ถูกเรียกที่ไหนเลย | `service.ts:775` |
| B10 | 🟡 MINOR | `line.ts:26-27` fallback header เป็นของตายทั้งชุด — operand ที่ 3 ซ้ำ operand ที่ 1 (dead) และ operand ที่ 2 (`X-Line-Signature`) ไม่มีวันมีค่าเพราะ route lowercase คีย์ไปก่อนแล้ว (`webhook/route.ts:29`) ⇒ สื่อเจตนาผิดว่ารองรับ header ดิบ<br>_(แก้คำอธิบาย 28 ส.ค. — ฉบับแรกระบุเหตุผิดว่า operand ที่ 2 เข้าไม่ถึง)_ | `line.ts:26-27` |

### SiamDive (แก้ทีเดียวตอนย้าย)
| ID | ความรุนแรง | เรื่อง | หลักฐาน |
|---|---|---|---|
| S1 | 🔴 CRITICAL | `booking-chat/upload` **ไม่มี auth** — รู้ `requestId` ก็อัปไฟล์เข้า CDN ได้ | `booking-chat/upload/route.ts:34-35` |
| S2 | 🟠 MAJOR | booking-chat rate limit เป็น in-memory Map บน Vercel | `[requestId]/route.ts:27-34` |
| S3 | 🟠 MAJOR | OTP จาก `AccountSheet` ไม่ประทับ `DeviceProfile.email` → `canAttach` ไม่พลิก แนบไฟล์ไม่ได้ทั้งที่ยืนยันแล้ว | `mapsAccount.ts:139-159` |
| S4 | 🟠 MAJOR | support chat ไม่ส่ง push ให้ลูกค้าเลย | ไม่มี `sendPushToEmail` ใน `support-chat/*` |
| S5 | 🟡 MINOR | ฟองแชทมีแค่ th/en ทั้งที่เว็บรองรับ 5 ภาษา | `BookingChat.tsx:18-23` |
| S6 | 🟡 MINOR | `support-chat/[threadId]` GET ฝั่งลูกค้าไม่มี rate limit | `[threadId]/route.ts` |
| S7 | 🟡 MINOR | `adminNote` มีใน API + type + query แต่ไม่มีช่องกรอกใน UI | `ChatBoard.tsx` |

---

## §6 แผนงานเป็น Work Order

### แผนที่การพึ่งพา
```
WO-C0 (เปิดบัญชี) ──┐
                    ├─► WO-C1 (schema) ──► WO-C2 (core) ──► WO-C3 (API v1) ──► WO-C6 (SiamDive proxy) ──► WO-C7 (ย้ายข้อมูล) ──► WO-C8 (ปิดของเดิม)
WO-C4 (บั๊ก SHARK) ─┘                                    └─► WO-C5 (upload REST)
WO-C9  (LINE) ─────── ขนานได้ตลอด ไม่ขึ้นกับใคร
WO-C10 (บั๊ก SiamDive) ── ขนานได้ตลอด
WO-C11 (QC) ─────────── ต้องเขียน "ก่อน" โค้ดของแต่ละ WO (contract-first)
```

---

### WO-C0 — เปิดบ้านให้ SiamDive
**เจ้าของ:** เจ้าของกิจการ (ต้องกดเอง) · **เวลา:** ~1 ชม.
1. สมัคร tenant บน `shark.in.th` ด้วย `siamdivethailand@gmail.com`
2. สร้าง `AppSystem` type `CHAT` ชื่อ "แชทลูกค้า SiamDive"
3. ออก API key จากหน้า settings → เก็บเป็น `SHARK_CHAT_API_KEY` ใน Vercel ของ siamdive2
4. ตั้ง `CHAT_CREDENTIALS_KEY` บน prod ของ SHARK ให้แน่ใจว่ามี (`crypto.ts:9-13` — ไม่มี = throw ตอน production)

🔴 กุญแจต้องเป็นของ SiamDive แยกจากของ SHARK เอง ([[feedback_no_shared_credentials_across_projects]])

---

### WO-C1 — Schema + migration
**ไฟล์:** `prisma/schema/chat.prisma` · migration ใหม่ 1 ตัว
**เนื้อ:** M1–M6 ใน §4
**เสร็จเมื่อ:** `pnpm drift` เขียว · `pnpm fitness` เขียว (F8 ห้าม db push drift) · `pnpm typecheck` เขียว
**⚠️ ห้ามแตะ:** `prisma/schema/core.prisma` (แช่แข็งหลัง Stage A)

---

### WO-C2 — Core service รองรับของใหม่
**ไฟล์:** `src/lib/modules/chat/service.ts`, `adapter.ts`, `webchat.ts`
1. `receiveExternalInbound()` — ทางเข้าใหม่สำหรับ s2s (รับ `attachments`, `context`, `lang`, `verifiedEmail`)
   → **ต้องใช้ `getOrOpenConversation` + `announceInbound` ตัวเดิม** ห้าม fork logic
2. `publicThread()` — คืน `messages[]` ตาม §3.2 (มี `type` + `attachments` + `senderName`) → แก้ B3 ไปในตัว
3. `sendReply()` + `emitOutbox("chat.message.sent")` → แก้ B4
4. `setStatus()` + `emitOutbox("chat.conversation.status")`
5. `getSetting()` คืน greeting/offline แบบหลายภาษา + `resolveLocale(lang, fallback)`
6. `senderAlias` — ข้อความ OUT ที่ส่งออกให้ลูกค้าเห็นชื่อตามที่ร้านตั้ง
**เสร็จเมื่อ:** `pnpm qc:chat` + `qc:chat-notify` เดิมยังเขียว + suite ใหม่เขียว

---

### WO-C3 — Public API `/api/v1/chat/*`
**ไฟล์:** `src/app/api/v1/chat/**` + `src/lib/api-keys/route-auth.ts` (เพิ่ม widget key path)
1. ตัวตน 2 ระดับ §3.1 — `authenticateChatRequest(req)` คืน `{ mode: "secret" | "widget", tenantId, systemId, connectionId }`
2. CORS: `OPTIONS` handler + `Access-Control-Allow-Origin` **เฉพาะ origin ที่อยู่ใน allowlist ของ connection** (ห้าม `*` เมื่อมี credentials)
3. rate limit ใช้ `ChatRateBucket` (WO-C1/M6)
4. ทุกเส้นตาม §3.2
**เสร็จเมื่อ:** `qc-chat-api.mts` เขียวทุกข้อ (รวมข้อ negative: widget key อ่านของคนอื่นไม่ได้)

---

### WO-C4 — ปิดบั๊ก/ช่องโหว่ SHARK
B1, B2, B5, B6, B7, B10 (B3/B4 อยู่ใน WO-C2 แล้ว)
- B1: `getConnection(tenantId, systemId, connectionId)` — **เปลี่ยน signature** ต้องไล่แก้ผู้เรียกทุกจุด
- B2: ย้าย `chat/rate-limit.ts` + `core/rate-limit.ts` ไปใช้ `ChatRateBucket` (คง interface เดิมไว้ให้ผู้เรียกไม่ต้องแก้)
- B7: เปลี่ยน webhook URL ที่แสดงใน `ui.tsx:301` เป็น `webhookKey` + route รับทั้ง `id` และ `webhookKey` (ช่วงเปลี่ยนผ่าน)
**เสร็จเมื่อ:** `qc-chat-security.mts` เขียว (ต้องพิสูจน์ fail-before ทุกข้อ)

---

### WO-C5 — REST upload
**ไฟล์:** `src/app/api/v1/chat/attachments/route.ts` + `src/lib/storage/service.ts`
- ห่อ `uploadFile()` เดิม (ยังเป็น Bunny SG) เป็น REST · MIME allowlist ให้ตรงกับที่ SiamDive ใช้อยู่
  ⚠️ ของเดิม SHARK รับแค่ jpeg/png/webp/gif/pdf (`storage/service.ts:14-20`) · SiamDive รับ heic/heif/doc/docx/xlsx/txt ด้วย
  → ต้องขยาย allowlist **และ** แก้ตารางนามสกุลของ Bunny loader ที่ปัจจุบันตกเป็น `.bin` (`siamdive2/src/lib/bunny.ts:46` — ปัญหาเดียวกันจะเกิดฝั่ง SHARK)
- เพดาน 10 MB (ของเดิม SHARK 5 MB) — ตั้งเป็นค่าต่อแพ็กเกจใน `Tenant.limits`

---

### WO-C6 — SiamDive เปลี่ยนเป็นตัวส่งต่อ
**ไฟล์:** `siamdive2/src/app/api/support-chat/**`, `src/lib/support-chat.ts`, `+ src/lib/shark-chat.ts` (ใหม่)
1. `shark-chat.ts` — ตัวเรียก API ของ SHARK (retry + timeout + วงจรตัด)
2. `/api/support-chat/*` **คงสัญญาเดิมทุกฟิลด์** เพื่อไม่ต้องแก้ widget แม้แต่บรรทัดเดียว
3. **dual-write**: ช่วงเปลี่ยนผ่านเขียนทั้ง DB เดิมและ SHARK · อ่านจาก SHARK เป็นหลัก · SHARK ล่ม = ถอยมาอ่าน DB เดิม (สลับด้วย env `CHAT_BACKEND=shark|local|dual`)
4. รับ webhook `chat.message.sent` ที่ `/api/webhooks/shark-chat` → ตรวจ HMAC → `sendPushToEmail()` → **แก้ S4 ไปในตัว**
5. `externalUserId` = `deviceId` ของ siamdive2 · ส่ง `verifiedEmail` + `lang` + `context` ทุกครั้ง

---

### WO-C7 — ย้ายประวัติ
**ไฟล์:** `siamdive2/scripts/migrate-chat-to-shark.mts`
- `SupportThread` → `ChatContact` (`externalUserId = deviceId`) + `ChatConversation` + `ChatMessage`
- **รันซ้ำได้** — กุญแจกันซ้ำ `clientMessageId = "sd2:" + SupportMessage.id`
- ต้องมี `--dry-run` ที่พิมพ์จำนวนจริงก่อน แล้วเทียบจำนวนหลังย้าย (ห้ามเชื่อว่า "รันแล้วเสร็จ")
- 🔴 [[feedback_snapshot_not_reference_when_measuring]] — เก็บตัวเลขก่อน/หลังเป็นไฟล์

---

### WO-C8 — ปิด inbox เดิม
- `/backoffice/chat` เปลี่ยนเป็นหน้าลิงก์ไป SHARK (ยังไม่ลบตาราง — เก็บ 90 วัน)
- Sidebar badge ดึงจาก `/api/v1/chat/unread` แทน

---

### WO-C9 — เปิด LINE OA `@siamdive` (ขนานได้ทันที)
1. เจ้าของหา **Channel access token (long-lived)** + **Channel secret** จาก LINE Developers Console
2. ใส่ในหน้า `/app/sys/<id>/chat/channels` ของ SHARK → กด "เชื่อม" (`connectLine` จะเรียก `/v2/bot/info` ตรวจให้)
3. เอา Webhook URL ที่หน้าแสดง ไปวางใน LINE Console + เปิด "Use webhook"
4. ทดสอบ: ทักจากมือถือจริง → ต้องเห็นใน inbox + ตอบกลับถึง
🔴 [[feedback_browser_is_the_only_oracle_for_oauth]] — อย่าตัดสินด้วย curl จาก VPS

---

### WO-C10 — ปิดบั๊ก SiamDive (ขนานได้)
S1 (auth ของ upload), S2 (rate limit → DB), S3 (OTP ประทับ email), S5 (ภาษาในฟองแชท), S6, S7

---

### WO-C12 — 🆕 บังคับ `retentionDays` ให้ทำงานจริง (PDPA)
**เหตุ:** `ChatSetting.retentionDays` (ค่าเริ่มต้น 365) **ไม่มีใครอ่านเลย** → ข้อความลูกค้าอยู่ในระบบตลอดกาล
ขัดกับ §11 ที่ยกเป็นความเสี่ยง PDPA และขัดกับสิ่งที่หน้า `/privacy` ของทั้งสองเว็บจะต้องประกาศ
**เนื้อ:** cron รายวัน (`/api/cron/tick` มีอยู่แล้ว) → ลบ/ปกปิดข้อความที่เกินอายุ ใช้ฟิลด์ `ChatMessage.purgedAt` ที่ schema มีอยู่แล้วแต่ไม่เคยถูกใช้
**ลำดับ:** ทำก่อน WO-C8 (ปิดของเดิม) เพราะเป็นสิ่งที่ต้องบอกลูกค้าก่อนย้ายข้อมูลจริง

---

### WO-C11 — QC (เขียน "ก่อน" โค้ด)
ตามแบบของ repo: `scripts/qc-*.mts`, ถูกค้นอัตโนมัติ (`qc-all.mts:39-41`) — สร้างไฟล์ = เป็นด่านทันที
โครงบังคับ: header `// QC — … · Fable oracle, Builder ห้ามแตะ` + `สัญญา:` + `process.loadEnvFile` + `chk()` + `JSON_SUMMARY` + `exit(CRITICAL>0)`
ใช้ `await import("@/path" as string).catch(() => null)` เพื่อให้ typecheck ผ่านตอนโค้ดยังไม่มี

| ไฟล์ | คุม |
|---|---|
| `qc-chat-api.mts` | สัญญา §3 ทุกเส้น · shape ของ `messages[]` · error เป็นภาษาไทย |
| `qc-chat-security-scope.mts` ✅ | B1 ข้ามร้าน · B5 assign คนนอก · B6 ผูกลูกค้าข้าม unit · B10 — **20 ข้อ เขียวแล้ว**<br>🔴 **ห้ามเขียนทับ `qc-chat-security.mts`** — เป็นด่านเดิมของ M9–M12 (race lock/contact cap/CSPRNG/unit RBAC) และต่อ Neon จริง |
| `qc-chat-widget-auth.mts` (ยังไม่เขียน) | widget key อ่านของคนอื่นไม่ได้ · origin นอก allowlist ต้อง 403 · secret key ห้ามใช้ผ่าน `X-Shark-Widget` |
| `qc-chat-outbox.mts` | B4 · `chat.message.sent` ยิงจริง + ไม่ยิงตอน internal note · HMAC ตรวจได้ |
| `qc-chat-i18n.mts` | greeting/offline หลายภาษา + fallback ไม่กลืนสตริงว่างที่ตั้งใจ ([[feedback_render_all_locales_before_ship]]) |
| `qc-chat-ratelimit.mts` | B2 — ต้องพิสูจน์ว่าทนข้าม process (นับจากแถวใน DB ไม่ใช่จาก memory) |
| `qc-chat-migrate.mts` | WO-C7 รันซ้ำแล้วจำนวนไม่บวมและไม่หาย |

🔴 ทุกข้อต้องพิสูจน์ **fail-before** (ย้อนโค้ดกลับ → ต้องแดงตรงข้อที่ควรแดง) ไม่งั้นเป็นด่านหลอก

---

## §7 การแบ่งงานให้ sub agent (กันชนไฟล์)

**รอบที่ 1 — ขนานได้จริง 4 สาย (ไม่มีไฟล์ทับกัน)**
| สาย | WO | ไฟล์ที่แตะ |
|---|---|---|
| A | C1 schema | `prisma/schema/chat.prisma` + migration |
| B | C9 LINE | ไม่แตะโค้ด (งานตั้งค่า) |
| C | C10 บั๊ก SiamDive | `siamdive2/src/app/api/**`, `siamdive2/src/lib/**` |
| D | C11 QC (เขียนด่านก่อน) | `scripts/qc-chat-*.mts` เท่านั้น |

**รอบที่ 2 — หลัง A เสร็จ**
| สาย | WO | ไฟล์ |
|---|---|---|
| E | C2 core | `src/lib/modules/chat/service.ts` ← **สายเดียวที่แตะไฟล์นี้** |
| F | C4 บั๊ก (เฉพาะ B2 rate limit + B7 webhookKey) | `chat/rate-limit.ts`, `core/rate-limit.ts`, `ui.tsx` |
| G | C5 upload | `src/lib/storage/*`, `api/v1/chat/attachments/*` |

> B1/B5/B6 อยู่ใน `service.ts` → **ต้องรวมเข้าสาย E** ห้ามแยก (ไม่งั้น 2 agent แก้ไฟล์เดียวกันชนกัน)

**รอบที่ 3** — C3 (API v1) → **รอบที่ 4** — C6 (SiamDive proxy) → **รอบที่ 5** — C7 ย้ายข้อมูล → C8 ปิดของเดิม

**หน้าที่ Fable ทุกรอบ:** ประกอบ → `pnpm typecheck` + `pnpm fitness` + `pnpm qc:all` → ตรวจว่า QC ที่เขียวเป็นด่านจริง (fail-before) → เขียนสถานะลง §12

---

## §8 ย้ายข้อมูล + ถอยกลับ

| ขั้น | ทำอะไร | ถอยยังไง |
|---|---|---|
| 1 | `CHAT_BACKEND=dual` — เขียน 2 ที่ อ่านของเดิม | ตั้งเป็น `local` |
| 2 | รัน WO-C7 `--dry-run` แล้วรันจริง | ข้อมูลเดิมไม่ถูกแตะ |
| 3 | `CHAT_BACKEND=shark` — อ่านจาก SHARK | ตั้งกลับเป็น `dual` |
| 4 | เฝ้า 2 สัปดาห์ | — |
| 5 | `CHAT_BACKEND=shark` อย่างเดียว หยุด dual-write | กลับ `dual` แล้วย้ายส่วนต่างซ้ำ |
| 6 | ครบ 90 วันค่อยลบตารางเดิม | ไม่มีทางถอยแล้ว — ต้องมั่นใจ |

---

## §9 ต่อยอดอนาคต (ออกแบบเผื่อไว้แล้ว ยังไม่ทำ)

| ลำดับ | ของ | พึ่งอะไร | ประเมิน |
|---|---|---|---|
| F1 | **widget ฝัง 1 บรรทัด** | §3.1 widget key + CORS + `/config` | 1–2 สัปดาห์ |
| F2 | **AI ตอบก่อนคน** (`kb_search` + `AiCreditWallet` มีแล้ว) | API v1 นิ่ง | 1 สัปดาห์ — **จุดขายที่แพงที่สุดของ LiveChat** |
| F3 | realtime SSE | ต้องคิดเรื่องต้นทุน connection ค้างบน Vercel (อาจต้องแยกไป VPS) | 1 สัปดาห์ |
| F4 | **Facebook + Instagram** | ยก `meta.service.ts` จาก repo เก่า + **Meta App Review 1–2 สัปดาห์** | 3–4 วัน + รอ |
| F5 | **WhatsApp** | Meta Business verified + เบอร์เฉพาะ + ค่าข้อความ | 4–5 วัน + รอ |
| F6 | Shopee / Lazada | สมัคร Open Platform แต่ละเจ้า | 5 วัน/ตัว + รอ |
| F7 | ระบบเก็บเงินร้าน | `Tenant.plan`/`limits` มีโครง · Beam ยังขาด `MERCHANT_ID` | แยกโครงการ |
| F8 | typing indicator / read receipt / โอนสาย-แผนก | F3 | ตามหลัง |

🔴 F4–F6 คอขวดคือ**การอนุมัติของแพลตฟอร์ม ไม่ใช่โค้ด** — อย่าสัญญาวันกับเจ้าของ

---

## §10 สิ่งที่ต้องให้เจ้าของทำ (ไม่มีทางทำแทนได้)

1. WO-C0 — สมัคร tenant + ออก API key
2. WO-C9 — Channel access token + secret ของ LINE OA `@siamdive`
3. ตัดสินว่า inbox ของทีมจะใช้ภาษาอะไร (จอ SHARK เป็นไทยล้วนวันนี้)
4. ยืนยันว่าย้ายแล้ว **ยอมให้ข้อมูลแชทลูกค้าอยู่ในฐานข้อมูลของ SHARK** (คนละ tenant แต่ DB เดียวกัน) — เกี่ยวกับ PDPA และหน้า `/privacy` ของ SiamDive ต้องอัปเดต

---

## §11 ความเสี่ยง

| ความเสี่ยง | ผลถ้าเกิด | กัน |
|---|---|---|
| SHARK ล่ม = SiamDive ไม่มีแชท | ลูกค้าทักไม่ได้ | `CHAT_BACKEND` สลับกลับ local ได้ทันที + วงจรตัดใน `shark-chat.ts` |
| Vercel timeout ตอน proxy | ข้อความหาย | timeout 5 วิ + คิวเขียนซ้ำ + `clientMessageId` กันซ้ำ |
| Neon connection pool ตัน | ทั้งแพลตฟอร์มช้า | SHARK อยู่ Neon SG + Vercel `sin1` แล้ว · เฝ้า p95 |
| PDPA — ข้อมูลลูกค้า SiamDive ไปอยู่ระบบอื่น | ปัญหากฎหมาย | §10 ข้อ 4 + `retentionDays` ต้องถูกใช้จริง (B8) |
| ทำ widget เร็วเกินไปแล้ว API ยังไม่นิ่ง | ต้องรื้อ 2 รอบ | D3 — ห้ามเริ่มก่อน SiamDive ใช้จริง 2–4 สัปดาห์ |

---

## §12 สถานะสด

| WO | สถานะ | หมายเหตุ |
|---|---|---|
| C0 | ⏳ รอเจ้าของ | สมัคร tenant + API key |
| **C1 schema** | ✅ **เสร็จ 28 ส.ค.** | M1–M6 ครบ · migration `20260828120000_chat_platform_v1` (additive ล้วน) · `prisma validate`/`generate`/`typecheck`/`fitness 17/17` เขียว · **ยังไม่ `migrate deploy` บน prod** |
| **C4 (บางส่วน) + C11** | ✅ **เสร็จ 28 ส.ค.** | B1/B5/B6/B10 · `qc-chat-security-scope.mts` **20/20** (พิสูจน์ fail-before: ก่อนแก้ 8/20 · CRITICAL 11) · `typecheck` + `fitness 17/17` เขียว |
| **C10 (บางส่วน)** | ✅ **เสร็จ 28 ส.ค.** | S1/S2/S6 · `bunx tsc --noEmit` EXIT=0 (มี positive control) · `bun run build` ผ่าน · **ยังไม่ push/deploy** |
| **C2 core** | ✅ **เสร็จ 28 ส.ค.** | `receiveExternalInbound` · `publicThread` (แก้ B3) · outbox ขาออก (แก้ B4) · หลายภาษา + `senderAlias` · `qc-chat-core-v2.mts` **41/41** (fail-before 8 รอบ) |
| **C3 + C5 + B2** | ✅ **เสร็จ 28 ส.ค.** | API v1 ครบ 8 เส้น · ตัวตน 2 ระดับ · CORS ผูก origin · REST upload · rate limit บน DB · `qc-chat-api-v1.mts` **89/89** (fail-before 12 รอบ) |
| C6–C9 | 📋 ยังไม่เริ่ม | **C6 (SiamDive proxy) เป็นตัวถัดไป** |
| **C13** 🆕 | 📋 ยังไม่เริ่ม | schema รอบ 2: `ChatConversation.customerLastReadAt` — เลิกใช้ `ChatReadState.userId = "contact:<id>"` |
| **C14** 🆕 | 📋 ยังไม่เริ่ม | หน้าจอออก/เพิกถอน widget key + ตั้ง originAllowlist (service มีครบแล้ว) — **ต้องมีก่อนใครฝัง widget ได้** |
| **C15** 🆕 | 📋 ยังไม่เริ่ม | ลบไฟล์จริงบน Bunny CDN ตามคิว (`ChatAttachment` ที่ `url=""` แต่ `storageKey` ยังอยู่) |
| **C12** 🆕 | ✅ **เสร็จ 28 ส.ค.** | `retentionDays` ถูกอ่านจริงแล้ว — `chat/retention.ts` + cron `chatPurged` + ช่องตั้งค่าในหน้า channels · `qc-chat-retention.mts` **37/37** (fail-before 8 รอบ) · ⚠️ **หนี้: ไฟล์จริงบน Bunny CDN ยังไม่ถูกลบ** |

**บันทึกความคืบหน้า**
- 28 ส.ค. 2026 — สำรวจโค้ดจริงทั้ง 2 ฝั่งด้วย sub agent 3 ตัว · เขียนแผนฉบับนี้ · พบบั๊กที่มีอยู่แล้ว 17 ข้อ (SHARK 10 · SiamDive 7)
- 28 ส.ค. 2026 — **C1 เสร็จ** · 🔴 บทเรียน: ตารางใหม่ทุกตัวต้องลงทะเบียนใน `src/lib/core/scope.ts` ด้วย
  ไม่งั้น `pnpm fitness` แดง F1.1 (CRITICAL) และ **query จะ throw ตอน runtime** — `ChatRateBucket` ใช้ `g()`
  เพราะสร้าง bucket ก่อนรู้ tenant (ตั้งใจไม่มี `tenantId`) เหมือน `ChatWebhookLog`
- 28 ส.ค. 2026 — **C10 (S1/S2/S6) เสร็จ** · S1 เลือกทางสองชั้น: พิสูจน์เจ้าของได้ (deviceId ของแผน
  หรืออีเมลที่เซิร์ฟเวอร์ยืนยัน) → 30 ไฟล์/ชม. · มีแค่ลิงก์แผน → 6 ไฟล์/ชม. **ไม่บล็อก 403**
  เพราะ `/plan/[shortId]` แจก `bookingRequestId` ให้ทุกคนที่มีลิงก์ และลิงก์ถูกแชร์กันจริง
  🔴 บทเรียน: **ย้าย rate limit จาก memory ไป DB = เพดานจริงเข้มขึ้นหลายเท่าโดยไม่ตั้งใจ**
  (ของเดิมนับต่อ instance ⇒ เพดานจริง = ที่ตั้ง × จำนวน instance) ต้องคำนวณผู้ใช้จริงใหม่ทุกครั้ง
  🔴 Fable ตัดเพดาน "ต่อห้อง" ของ GET ออก เหลือต่อ IP อย่างเดียว — ลดการเขียน `RateLimitBucket`
  ครึ่งหนึ่งทุก poll โดยไม่เสียการป้องกัน (requestId เป็น cuid เดาไม่ได้) เพราะ Supabase มีเพดานอยู่แล้ว
  ⚠️ ค้าง: `RateLimitBucket` **ไม่มี job ล้างแถวเก่า** (มีมาก่อนรอบนี้) — ควรมี sweeper
- 28 ส.ค. 2026 — **C4 + C11 เสร็จ** · B1 (`getConnection` ไม่มี tenant filter) **ยังไม่มีผู้เรียกเลยทั้ง repo**
  ⇒ ไม่เคยถูกใช้โจมตี แต่เป็นระเบิดเวลาที่ WO-C3 กำลังจะไปเหยียบพอดี — ปิดทันก่อน
  · B6 เจอเพิ่ม: `ChatContact` ไม่มี `unitId` (unit อยู่ที่ conversation) → ตัดสินสิทธิ์ด้วยเธรดล่าสุด
  เหมือน `getThread`/`sendReply` และ **ขาถอด (unlink) ก็ต้องกั้นด้วย** ไม่ใช่แค่ขาผูก
  🔴 บทเรียน: **ข้อสอบที่ต่อ DB จริงเขียนไม่ได้ในงานที่ห้ามแตะ prod** — วิธีที่ใช้แทนคือยัด fake prisma
  ลง `require.cache` ของ `src/lib/core/db.ts` + ทับ `DATABASE_URL` ให้ต่อไม่ติด แล้วตรวจ **where ที่ยิงจริง**
  (ไม่ใช่ regex หาคำ) · มีข้อสอบข้อหนึ่งคอยตรวจว่าไม่มี query หลุดออก DB จริงด้วย
  🔴 กับดักที่เกือบพลาด: `qc-chat-security.mts` **มีอยู่ก่อนแล้ว** — ถ้าเขียนทับตามชื่อในแผนฉบับแรก
  = ลบด่าน M9–M12 ทิ้งทั้งชุดโดยไม่มีใครรู้ → ต้อง `ls scripts/qc-*.mts` ก่อนตั้งชื่อไฟล์ใหม่เสมอ
- 28 ส.ค. 2026 — **C2 เสร็จ** (41 ข้อสอบ · fail-before 8 รอบ) · แก้แผน 4 จุดที่ไม่ตรงโค้ดจริง:
  §3.2 attachments เป็น 6 ฟิลด์ (เพิ่ม `width`/`height` — widget ต้องใช้กันภาพกระตุก) ·
  §3.4 นิยามความหมาย `chat.message.sent` · §5 B8 เหลือ 5 ฟิลด์ · เพิ่ม **WO-C12** (PDPA) ·
  §6 WO-C2 ไม่ต้องแตะ `adapter.ts`/`webchat.ts` (route เรียก service ตรง เหมือน `receiveWebchatInbound`)
  🔴 บทเรียนสถาปัตยกรรม: **network call ห้ามอยู่ในทรานแซกชัน** แต่ **event ต้องอยู่ในทรานแซกชันเดียวกับข้อมูล**
  → บังคับให้ `chat.message.sent` แปลว่า "แอดมินตอบ" ไม่ใช่ "ถึงมือลูกค้า" (แลกอย่างตั้งใจ)
  🔴 บทเรียนการทำข้อสอบ: prisma ปลอมต้อง **เติมค่า default ของ schema ตอน create** ไม่งั้น
  `updateMany where staffUnreadCount: 0` ของ `announceInbound` หาแถวไม่เจอ = **ข้อสอบเขียวแบบผลลวง**
  ⚠️ พฤติกรรมที่รับไว้อย่างตั้งใจ: `senderName` ที่เป็น null จะ resolve จาก `senderAlias` ตอนอ่าน
  ⇒ **ร้านแก้นามแฝงแล้วข้อความเก่าเปลี่ยนชื่อตามย้อนหลัง** (ตรงตามเจตนาใน `chat.prisma:190`
  เพราะเป็นนามแฝงระดับร้าน ไม่ใช่ชื่อบุคคล) ถ้าเจ้าของอยากได้ความถูกต้องเชิงประวัติ แก้ที่เดียวใน `sendReply`
- 28 ส.ค. 2026 — **C12 เสร็จ** (37 ข้อสอบ · fail-before 8 รอบ) · `src/lib/modules/chat/retention.ts`
  🔴 **ตัดสินใจ: "ลบ" = ปกปิดเนื้อหา (redact) เก็บแถวไว้ ไม่ใช่ลบแถวทิ้ง** — เพราะ (1) `purgedAt`
  มีในสคีมาอยู่แล้ว = แถวที่ถูกลบถือ timestamp ไม่ได้ (2) `@@unique([conversationId, externalMessageId])`
  คือสมุดกัน webhook ซ้ำ — ลบแถว = ของเก่ายิงซ้ำเด้งกลับเข้า inbox ได้ (3) SLA/สถิติเธรดจะโกหก
  (4) `ChatAttachment → ChatMessage` ไม่มี `onDelete: Cascade` ⇒ ลบตรง ๆ ชน FK จริง
  🔴 **ช่องโหว่ที่มองไม่เห็นและต้องปิดคู่กันเสมอ**: `ChatConversation.lastMessagePreview` เป็น denorm
  ที่ **เก็บสำเนาเนื้อความไว้อีกที่** — ปกปิดข้อความอย่างเดียวแล้วเนื้อหายังโผล่ในหน้ารายการ inbox
  ⚠️ **หนี้ค้าง (สำคัญ)**: **ไฟล์จริงบน Bunny CDN ยังลบไม่ได้ในรอบนี้** (ตัวลบต้องอยู่ `src/lib/storage/**`
  ซึ่งรอบนี้ห้ามแตะ) → จึง **จงใจไม่ลบ `ChatAttachment.storageKey`** เพราะเป็น handle เดียวที่จะไปลบ
  วัตถุจริงได้ทีหลัง (ลบแถว = ไฟล์กำพร้าบน CDN ตลอดกาล) · แถวที่ `url = ""` แต่ `storageKey != ""`
  = **คิวรอลบไฟล์** ของ WO ถัดไป · `FileAsset` ของไฟล์แชทก็ยังไม่ถูกกวาดเช่นกัน
  ⚠️ `pnpm fitness` F5 baseline ขยับ 44 → 45 (retention.ts ใช้ raw prisma เพราะกวาดข้ามร้าน
  เหมือน `sweepExpiringLots`) — ตามแบบ 10 รายการก่อนหน้าที่จดเหตุผลไว้ในคอมเมนต์ BASELINE
- 🔴 **ค้างต้องทำก่อนใช้งานจริง**: `pnpm exec prisma migrate deploy` บน prod (Vercel ไม่รันให้ — `RESUME.md:555`)
- 28 ส.ค. 2026 — **C3 + C5 + B2 เสร็จ (89 ข้อสอบ · fail-before 12 รอบ)** — ชั้น 2 ครบแล้ว
  🔴 ข้อสอบจับบั๊กจริงของผู้เขียนเอง 3 ข้อระหว่างทาง รวมถึง **บทเรียน §12 ซ้ำรอยเป๊ะ**:
  fake prisma ตั้ง `lastReadAt` เป็นค่าคงที่ตอนโหลดไฟล์แทนที่จะเป็น `now()` → `/unread` ไม่เป็น 0
  ⇒ **ค่าเวลาใน fake ต้องเป็น thunk เสมอ** ไม่งั้นได้ผลลวงคนละทิศ
  🔴 ตัวเลข rate limit ต้องเลือก**แกนที่นับ**ให้ถูก ไม่ใช่แค่ตัวเลข:
  · secret = นับ **ต่อคีย์** เพราะคำขอออกจาก IP ของ Vercel ไม่กี่ตัว นับต่อ IP ไร้ความหมาย
  · widget = นับ **ต่อ guest** ไม่ใช่ต่อ IP เพราะมือถือไทยอยู่หลัง CGNAT ร่วม IP กันเป็นร้อยคน
    (นับต่อ IP = ตัดคนบริสุทธิ์ทิ้ง) · 1 คำขอ = เขียนถังครั้งเดียว ห้ามซ้อนชั้น
  🔴 `__resetRateLimit()` ที่ไม่ระบุ key เปลี่ยนเป็น **ไม่ทำอะไร** — เพราะ `qc-chat-security.mts`
  ต่อ Neon prod จริง การล้างทั้งตาราง = รีเซ็ตเพดานของทุกร้านบน prod
  ⚠️ **หนี้ที่รับไว้อย่างตั้งใจ**: schema ไม่มีที่เก็บ "ลูกค้าอ่านถึงไหน" → ใช้ `ChatReadState`
  ร่วมโดยตั้ง `userId = "contact:<contactId>"` (ชนกับ userId จริงไม่ได้เพราะ cuid ไม่มี `:`)
  **ห้ามเอา `staffUnreadCount` มาใช้แทน** — นั่นเป็นแบดจ์ของทีม ลูกค้าเปิดอ่านแล้วงานจะหายจากกล่อง "รอตอบ"
  → แก้ให้สะอาดใน **WO-C13**
- 28 ส.ค. 2026 — Fable ต่อ `sweepRateBuckets()` เข้า cron รายวัน (ปิดหนี้ที่ 2 สายส่งต่อกันไม่ได้
  เพราะต่างฝ่ายต่างถูกห้ามแตะไฟล์ของอีกฝ่าย) · `ChatRateBucket` โตตามจำนวน key ที่ไม่ซ้ำ ถ้าไม่กวาดจะโตไม่จำกัด
- 28 ส.ค. 2026 — **ยืนยันรวมงาน 2 สาย**: `typecheck` EXIT=0 · `fitness 17/17` ·
  `qc-chat-api-v1 89/89` · `qc-chat-core-v2 41/41` · `qc-chat-security-scope 20/20` · `qc-chat-retention 37/37`
  = **187 ข้อสอบเขียวทั้งหมด**
- 🔴 **ยังพิสูจน์ไม่ได้จนกว่าจะ `migrate deploy`**: `qc-chat-notify.mts` และ `qc-chat-security.mts`
  ต่อ Neon prod จริง → แดงด้วย `ChatChannelConnection.originAllowlist does not exist`
  **นี่คืออาการที่ถูกต้อง** ของ prod ที่ยังไม่ได้รับ migration (โค้ดใหม่ยังไม่ push จึงยังไม่กระทบผู้ใช้)
- 28 ส.ค. 2026 — ✅ **`migrate deploy` ลง prod แล้ว** (`20260828120000_chat_platform_v1`) · `pnpm drift` = No difference
  → ข้อสอบ 2 ชุดที่ต่อ Neon จริงกลับมารันได้: `qc-chat-notify 23/23`
  🔴 **และมันจับบั๊กจริงทันที** — `qc-chat-security` M9 แดง 2 ข้อ · วัดด้วยสคริปต์บน Neon prod:
  ```
  ยิงพร้อมกัน 20 ครั้งบน key ใหม่ → ผ่าน 15/20 · count ใน DB = 15 · ครั้งที่ 21 ยังผ่าน  ❌
  ยิงเรียงกัน  20 ครั้ง          → ผ่าน 20/20 · count = 20 · ครั้งที่ 21 ถูกบล็อก      ✅
  ```
  **ผิดสองทางพร้อมกัน**: ปฏิเสธผู้ใช้ที่ยังไม่ถึงเพดาน 5 ครั้ง **และ** นับหาย 5 ครั้งทำให้เพดานรั่ว
  เหตุ: `checkRateLimitDb` เดิมแตกเป็น 4 คำสั่ง (updateMany → updateMany → findUnique → create + กู้ P2002)
  ทุกคำขอเห็น "ยังไม่มีแถว" พร้อมกัน → แข่งกันสร้าง → ตัวที่แพ้ต้องไปนับใหม่ = read-then-write ที่ไม่ atomic
  **แก้**: `INSERT … ON CONFLICT DO UPDATE … RETURNING` คำสั่งเดียว (ยกวิธีจาก siamdive2 `src/lib/rate-limit.ts`
  ที่พิสูจน์บน prod มาแล้ว) → วัดซ้ำ **20/20 ทั้งยิงพร้อมกันและเรียงกัน** · ครั้งที่ 21 บล็อกถูกต้อง
  🔴 **บทเรียนที่ต้องจำ**: `updateMany` ที่ใส่เงื่อนไขใน WHERE **atomic เฉพาะคำสั่งนั้น** —
  ไม่ได้แปลว่าลำดับหลายคำสั่งจะ atomic · ตัวนับที่ใช้ร่วมกันต้องจบใน **คำสั่งเดียว** เสมอ
  🔴 **บทเรียนวิธีทำงาน**: ข้อสอบที่ใช้ prisma ปลอมพิสูจน์เรื่องนี้ไม่ได้เลย (fake ไม่มี concurrency จริง)
  — **ของแบบนี้ต้องวัดบน DB จริงเท่านั้น** · fake ก็ต้องตามแก้ให้จำลอง `$queryRaw` ของจริง
  ไม่งั้นได้เขียวแบบผลลวง (CA-6.* ทั้งชุดวัดอะไรไม่ได้ตอน fake คืน 0 เฉย ๆ)
  ⚠️ ปรับ CA-6.1 ให้เลิกล็อกว่า count ต้องเท่าจำนวนที่ผ่านเป๊ะ — ตัวนับ atomic เพิ่มค่าทุกคำขอ
  รวมที่ถูกปฏิเสธ (ไม่กระทบการตัดสิน · CA-6.2 คุมพฤติกรรมที่ผู้ใช้เห็นอยู่แล้ว)
  การล็อกค่าเป๊ะ = บังคับให้กลับไปใช้แบบหลายคำสั่งที่นับพลาด
- 28 ส.ค. 2026 — **ยืนยันรวมทั้งหมด 233 ข้อเขียว**: api-v1 89 · security 23 (DB จริง) · notify 23 (DB จริง)
  · core-v2 41 · security-scope 20 · retention 37 · `typecheck` EXIT=0 · `fitness 17/17`
