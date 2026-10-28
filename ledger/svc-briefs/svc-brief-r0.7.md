# ใบสั่ง R0.7 — LINE (Flex · rich menu · รหัสผูก · postback) + ประตูส่งข้อความบริการ + ลิงก์เซ็น · ตรวจ **เข้ม** (ข้ามร้าน · ลิงก์สาธารณะ)

> แหล่งความจริง: `ledger/SVC-MASTER-PLAN.md` แถว R0.7 · `ledger/SVC-CORE-CONTRACT.md` (CC) §4 (+ §10 ข้อ 4–5 · ภาคต่อ 28 ต.ค.) · `ledger/DESIGN-BOOKING-QUEUE.md` §1 ข้อ 8 · BQ-6 · `ledger/DESIGN-DORM-HOTEL.md` §6 A6 · ภาพ `ledger/design-booking/06-customer-line.png` `ledger/design-dorm/05-line-tenant.png` (รูปข้อความ — ใบนี้ไม่มีจอ) · **`ledger/wo-notes/svc-r0.8-carry.md` ข้อ R0.7 (บังคับ)** · กติกา `ledger/SVC-RUN.md` §1
> มติเจ้าของ: ใช้ **LINE OA ของร้าน** (ร้านเชื่อมเองที่หน้าแชท) · ร้านไม่มี OA ⇒ **ลิงก์เว็บ** (SMS = ใบเลื่อน S.1) · ถ้อยคำมาจากค่าตั้ง (`rooms.msg.*` มีแล้ว · `booking.msg.*` มากับ B.0)
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-r0.7.mts» — 77 ข้อ (F4 K2 S8 L16 P5 X8 R6 N17 W6 Z5) · รับใบ = **ไม่มี FAIL · SKIP 0**
> รัน: `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-r0.7.mts` (เขียนฐาน qc-svc · ห้ามรันขนานกับข้อสอบเขียนฐานอื่น · ห้ามครอบ timeout · ห้าม kill — cleanup อยู่ใน finally)
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แก้ `prisma/`** (ตาราง `ChatLinkCode` `ServiceMessageLog` มีแล้วจาก R0.1) · **ห้ามยิง LINE จริง** · รายงานต่อข้อ (id → ผล)
> regression ที่ผู้คุมรันตอนรับ: `qc-svc-smoke.mts` · `qc-svc-r0.1.mts` · `qc-svc-r0.3.mts` · `qc-svc-r0.5.mts` (LINE_OA เสมือน) · ชุดแชท `qc-chat-security.mts` `qc-chat-security-scope.mts` `qc-chat-core-v2.mts` `qc-chat-notify-v2.mts` · `qc-crm-c1.8.mts` (linkChatContactParty) · `qc-member-m3.2.mts` `qc-member-m3.4.mts` (ส่ง LINE ของสมาชิก) · fitness 2 โหมด · tsc

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ)
| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/modules/chat/line-flex.ts» (ใหม่) | `pushFlexToParty` · `replyFlex` (§3.1) |
| «src/lib/modules/chat/line-richmenu.ts» (ใหม่) | `syncRichMenu` (§3.2) |
| «src/lib/modules/chat/link-code.ts» (ใหม่) | `issueLinkCode` · `consumeLinkCode` · `LINK_CODE_ALPHABET` (§3.3) |
| `src/lib/modules/chat/line.ts` | **เพิ่ม** `lineApiBase()` (§2) แล้วใช้แทน `const API` ทุกจุด — ห้ามเปลี่ยนพฤติกรรมอื่น |
| `src/lib/modules/chat/index.ts` | **เพิ่ม** export ชื่อใน §3.1–3.3 (+ type) · ของเดิมคงทุกตัว (รวม `notifyCustomer` ของ pos-seam) |
| `src/app/api/chat/webhook/[connectionId]/route.ts` | LINE: postback + ข้อความรหัส (§3.5) · ทางเดิมของข้อความทุกชนิดคงเดิม |
| «src/lib/platform/postback-routes.ts» (ใหม่) | ทะเบียน (ว่าง) + `parsePostbackData` · `dispatchPostback` · `handleLinkCodeText` (§3.4) |
| «src/lib/platform/notify-customer.ts» (ใหม่) | `notifyCustomer` (§3.6) — ประตูเดียวของข้อความบริการ |
| «src/lib/core/signed-link.ts» (ใหม่) | `signLink` · `verifyLink` · `SIGNED_LINK_MAX_MIN` (§3.7) |

ตรวจแล้ว: ตัว HMAC ของ CRM C0.4 (`src/lib/storage/private-links.ts`) **ใช้ร่วมไม่ได้** (เพดาน 15 นาที + ผูกผู้ดูพนักงาน) ⇒ เขียน «core/signed-link.ts» ใหม่ แต่ใช้แบบแผนเดียวกัน (กุญแจติดป้าย · ไม่มีค่าสำรอง · `safeEqualHex`/timing-safe)

## 2. ตัวจำลอง LINE (ไม่ยิงจริงในข้อสอบ)
- `lineApiBase()` คืน origin ของ Messaging API ที่ **อ่าน env ตอนเรียก**: ถ้า `process.env.APP_ENV !== "production"` **และ** `LINE_API_BASE` ขึ้นต้น `http://127.0.0.1:` หรือ `http://localhost:` ⇒ ใช้ค่านั้น · อื่น ๆ (prod · ค่าว่าง · host อื่น เช่น `https://evil.example`) ⇒ `https://api.line.me` (อัปโหลดรูป rich menu ⇒ `https://api-data.line.me` เฉพาะตอนไม่ใช่โหมดจำลอง)
- path คงตาม LINE จริงทุกตัว: `/v2/bot/message/push` · `/v2/bot/message/reply` · `/v2/bot/profile/{userId}` · `/v2/bot/info` · `/v2/bot/richmenu` · `/v2/bot/richmenu/{id}/content` · `/v2/bot/user/all/richmenu/{id}` · `/v2/bot/user/{userId}/richmenu/{id}` · `DELETE /v2/bot/richmenu/{id}`
- ข้อสอบเปิดเซิร์ฟเวอร์จำลองของตัวเอง (node:http) + ครอบ `fetch` ทุกคำขอที่ออกนอกเครื่อง — **คำขอถึง `*.line.me` ระหว่างข้อสอบ = FAIL** (ยกเว้นข้อ K ที่ตั้งใจพิสูจน์ด่าน prod)

## 3. สัญญา (ชื่อ/รูปต้องตรง · **ไม่ throw** เว้นที่ระบุ · ข้อความไทยไม่โทษผู้ใช้ · ไม่มีโทเคน/secret ในผลคืน/log/console)

### 3.1 Flex (`chat/line-flex.ts`)
```ts
type FlexFail = { ok: false; code: "NO_LINE_IDENTITY" | "NO_CONNECTION" | "VALIDATION" | "SEND_FAILED"; reason: string };
pushFlexToParty(ctx: ChatPartyCtx, { partyId, connectionId?, altText, contents }) → { ok: true; externalMessageId?: string } | FlexFail
replyFlex(ctx: ChatPartyCtx, { replyToken, connectionId, altText, contents }) → { ok: true } | FlexFail
```
- ผู้รับ = `ChatContact` ของร้าน (`tenantId` ผูกตรง) · `channel LINE` · `partyId` ตรง · `blockedAt null` · **ส่ง `connectionId` มา = เฉพาะผู้ติดต่อที่ `channelConnectionId === connectionId`** (OA อื่นของร้านเดียวกัน ⇒ `NO_LINE_IDENTITY` · ไม่ถอยไป OA อื่น) · ไม่ส่ง = ผู้ติดต่อล่าสุด (`lastSeenAt` desc) แล้วส่งด้วย OA ของผู้ติดต่อนั้น
- connection ต้องเป็น `ChatChannelConnection` ของร้านนี้ · type LINE · ไม่ `DISABLED` ⇒ ไม่ใช่ = `NO_CONNECTION` (ของร้านอื่น = `NO_CONNECTION` ไม่ยิงอะไรเลย)
- ตรวจก่อนยิง: `altText` 1–400 ตัว · `contents` เป็น object ที่ `type` ∈ `bubble|carousel` ⇒ ไม่ผ่าน = `VALIDATION` ไม่ยิง
- ยิง `POST {base}/v2/bot/message/push` `{ to: externalUserId, messages: [{ type: "flex", altText, contents }] }` (`Authorization: Bearer <channelAccessToken ของ connection นั้น>`) · reply = `/message/reply` `{ replyToken, messages:[…] }` · HTTP ไม่ 2xx/เครือข่ายล่ม = `SEND_FAILED` (reason ไม่มีเนื้อ response ดิบ/โทเคน)

### 3.2 rich menu (`chat/line-richmenu.ts`)
```ts
type RichMenuArea = { bounds: { x: number; y: number; width: number; height: number };
  action: { type: "postback"; data: string; displayText?: string } | { type: "uri"; uri: string } | { type: "message"; text: string } };
type RichMenuSpec = { name: string; chatBarText: string; size: { width: number; height: number }; areas: RichMenuArea[];
  image: { contentType: "image/png" | "image/jpeg"; data: Uint8Array }; selected?: boolean };
syncRichMenu(ctx, connectionId, spec, opts?: { chatContactIds?: string[] })
  → { ok: true; richMenuId: string; created: boolean } | { ok: false; code: "NO_CONNECTION" | "VALIDATION" | "SEND_FAILED"; reason: string }
```
- ตรวจก่อนยิง (ไม่ผ่าน = `VALIDATION` ไม่ยิงเลย): name 1–300 · chatBarText 1–14 · width 800–2500 · height ≥ 250 · width/height ≥ 1.45 · areas 1–20 · bounds ไม่ติดลบและอยู่ในกรอบ · postback `data` ต้องผ่าน `parsePostbackData` รูปแบบ §3.4 (ตรวจ regex ในไฟล์แชทเอง — แชท import platform ไม่ได้) และ ≤ 300 · uri ขึ้นต้น `https://` · image png/jpeg ไม่ว่าง ≤ 1 MB
- สำเร็จ = `POST /richmenu` (JSON: size · selected · name · chatBarText · areas) → `POST /richmenu/{id}/content` (Content-Type ตามรูป · body = ไบต์รูป) → `POST /user/all/richmenu/{id}` · จด `{ id, hash }` ใน `ChatChannelConnection.meta.richMenu` (hash = sha256 ของ spec รวมรูป)
- **idempotent**: spec เดิม (hash ตรง) ⇒ `{ ok:true, richMenuId: เดิม, created:false }` **ไม่มี POST /richmenu ใหม่** · spec เปลี่ยน ⇒ สร้างใหม่ + ตั้งค่าเริ่ม + `DELETE /richmenu/{เก่า}`
- `opts.chatContactIds`: ผูกรายคน `POST /user/{externalUserId}/richmenu/{id}` เฉพาะผู้ติดต่อของร้านนี้ **บน connection นี้** (อื่น ๆ ข้ามเงียบ)

### 3.3 รหัสผูก (`chat/link-code.ts`) — carry R0.7: รหัส ≥ 8 ตัวผสม · HMAC มีกุญแจ · retry P2002
```ts
LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   // 31 ตัว ไม่มี 0 O 1 I L
issueLinkCode(ctx, { purpose, refId, ttlMin, connectionId? })
  → { ok: true; code: string; deepLink: string | null; expiresAt: Date } | { ok: false; error: "VALIDATION" | "NOT_FOUND" | "NOT_CONFIGURED"; message: string }
consumeLinkCode(ctx, { connectionId, chatContactId, text, resolveParty?: (a: { purpose: string; refId: string }) => Promise<string | null> })
  → { purpose: string; refId: string; partyId: string | null } | null
```
- รหัส 8 ตัวจาก `LINK_CODE_ALPHABET` (crypto สุ่ม) **ต้องมีตัวอักษร ≥1 และตัวเลข ≥1** (สุ่มใหม่ถ้าไม่ครบ) · purpose ∈ `DORM_LEASE|QUEUE_TICKET|APPOINTMENT` · refId 1–100 · ttlMin จำนวนเต็ม 1–43200 ⇒ อื่น = `VALIDATION` ไม่สร้างแถว
- `connectionId` (ถ้าส่ง) ต้องเป็น LINE ของร้านนี้ ⇒ ไม่ใช่ = `NOT_FOUND` · `SESSION_SECRET` ไม่มี/สั้นกว่า 32 ⇒ `NOT_CONFIGURED` (ไม่มีกุญแจสำรอง)
- เก็บ: `codeHash = HMAC-SHA256(key = "chat-link-code:v1:" + SESSION_SECRET, msg = tenantId + ":" + CODE).hex` · `codeLast4` = 4 ตัวท้าย · **ห้ามมีรหัสดิบที่ไหนในฐาน/log/audit/outbox** · ชน `@@unique([tenantId, codeHash])` (P2002) ⇒ สุ่มใหม่ ≤ 5 ครั้ง
- `deepLink`: connection มี `meta.basicId` (เช่น `@abc1234`) ⇒ `https://line.me/R/oaMessage/{basicId}/?{CODE}` (เข้ารหัส `@` เป็น `%40` ได้) · ไม่มี connectionId ⇒ `null` · ไม่มี basicId ⇒ `null` หรือดึงจาก `/v2/bot/info` แล้วจดใน meta (ทางเลือก) — ทางสำรองตาม CC §10.4 คือให้ลูกค้าพิมพ์รหัสเอง
- consume: normalize `text.trim().toUpperCase()` ตัด ช่องว่าง/`-`/`#` · ไม่ใช่รูปรหัส (8 ตัวจาก alphabet มีทั้งตัวอักษรและตัวเลข) ⇒ `null` ทันที (ไม่นับ rate limit · ไม่แตะ ChatLinkCode)
- รูปรหัส ⇒ นับ `checkRateLimitDb("chat-link:" + tenantId + ":" + chatContactId, { limit: 10, windowMs: 15 นาที })` **ก่อนค้น** · เกิน ⇒ `null` (รหัสไม่ถูกใช้)
- ผ่านเมื่อครบทุกข้อ: connection เป็น LINE ของ `ctx.tenantId` · chatContact เป็นของร้านนี้ + `channelConnectionId === connectionId` · แถว `(tenantId, codeHash)` · `usedAt null` · `expiresAt > now` · `row.connectionId` ว่างหรือ = connectionId ⇒ อ้างสิทธิ์แบบ atomic (`updateMany … where usedAt null` นับ 1) ตั้ง `usedAt` + `usedByChatContactId` · **ผิดข้อไหน = `null` เหมือนกันหมด**
- หลังอ้างสิทธิ์: `resolveParty` (ถ้ามี) → partyId ⇒ `linkChatContactParty` (มีแล้ว · Party ต้องเป็นของร้านนี้ · ผู้ติดต่อมี partyId แล้ว = ไม่ทับ) · คืน `partyId` = ค่าจริงในแถวผู้ติดต่อหลังผูก (null ได้)

### 3.4 ทะเบียน postback (`platform/postback-routes.ts`)
```ts
type PostbackCtx = { tenantId: string; connectionId: string; chatContactId: string; partyId: string | null; replyToken: string | null };
type PostbackEvent = { data: string; domain: "booking" | "dorm" | "hotel"; action: string; params: Record<string, string> };
type PostbackReply = { text?: string; flex?: { altText: string; contents: Record<string, unknown> } };
type PostbackRoute = { prefix: "booking." | "dorm." | "hotel.";
  resolveParty?: (ctx: { tenantId: string }, a: { purpose: string; refId: string }) => Promise<string | null>;
  onPostback?: (ctx: PostbackCtx, evt: PostbackEvent) => Promise<PostbackReply | void>;
  onLinked?: (ctx: PostbackCtx, a: { purpose: string; refId: string; partyId: string | null }) => Promise<PostbackReply | void> };
POSTBACK_ROUTES: PostbackRoute[]            // export แบบอาร์เรย์แก้ได้ · ใบนี้ = [] (B.9/D.9 เพิ่มบรรทัด) · ตัวแจกอ่านตอนเรียก
LINK_PURPOSE_PREFIX = { DORM_LEASE: "dorm.", QUEUE_TICKET: "booking.", APPOINTMENT: "booking." }
parsePostbackData(data: unknown) → PostbackEvent | null
dispatchPostback(ctx: PostbackCtx, data: string) → Promise<{ handled: boolean; reply?: PostbackReply }>
handleLinkCodeText(ctx: Omit<PostbackCtx, "partyId">, text: string) → Promise<{ matched: boolean; linked: boolean; reply?: PostbackReply }>
```
- `parsePostbackData`: string ≤ 300 · รูป `^(booking|dorm|hotel)\.[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*(\?.*)?$` · ไม่มีอักขระควบคุม · params ด้วย `URLSearchParams` ใส่ object ที่ **ไม่มี prototype** (`Object.create(null)`) · คีย์ `__proto__`/`constructor`/`prototype` หรือคีย์ซ้ำ หรือค่า > 200 ตัว ⇒ `null`
- `dispatchPostback`: route แรกที่ `prefix === domain + "."` และมี `onPostback` · ไม่มี ⇒ `{ handled:false }` · ตัวจัดการ throw ⇒ จับ คืน `{ handled:false }` (ไม่ throw ออก · ไม่ log ข้อความ error ดิบที่อาจมี PII)
- `handleLinkCodeText`: ไม่ใช่รูปรหัส ⇒ `{ matched:false, linked:false }` · รูปรหัส ⇒ `consumeLinkCode` (resolveParty = route ตาม `LINK_PURPOSE_PREFIX[purpose]`) · สำเร็จ ⇒ `onLinked` แล้ว `{ matched:true, linked:true, reply: ผลของ onLinked ?? { text: "ผูกบัญชี LINE เรียบร้อยแล้ว" } }` · ไม่สำเร็จ (รหัสผิด/หมดอายุ/ใช้แล้ว/ร้านอื่น/เกินโควตา) ⇒ `{ matched:true, linked:false, reply: { text: ข้อความกลางเดียวกันทุกกรณี } }` (X7)

### 3.5 webhook LINE (`route.ts`)
- ด่านลายเซ็นเดิม (ผิด = 401 · ไม่ประมวลอะไร) · ctx **มาจากแถว connection เสมอ** (`tenantId` · `connectionId`) — ห้ามอ่าน tenant/party จาก postback data
- event `postback`: dedupe ด้วย `recordWebhook(connection, webhookEventId)` (ซ้ำ = ข้าม · X4) → หา/สร้าง ChatContact ของ userId บน connection นี้ → `dispatchPostback` (partyId = ของผู้ติดต่อ) → มี reply ⇒ `replyFlex`/reply ข้อความ ด้วย `replyToken` ของ event
- event `message` ชนิด text: ทางเดิม (`receiveInbound`) คงเดิม + `handleLinkCodeText` ด้วย chatContactId ของผู้ส่ง · มี reply ⇒ ตอบด้วย replyToken (หรือ push ถ้า token ถูกใช้แล้ว)
- ตอบ 200 เสมอเมื่อลายเซ็นถูก (ตัวจัดการพังไม่ทำให้ 500)

### 3.6 ประตูส่งข้อความบริการ (`platform/notify-customer.ts`)
```ts
notifyCustomer(ctx: { tenantId: string }, input: {
  unitId: string; domain: "booking" | "rooms"; messageKey: string;            // แม่แบบ = ค่าตั้ง `${domain}.msg.${messageKey}` (type template)
  partyId?: string; chatContactId?: string; phone?: string;                    // phone สำหรับ SMS อนาคต — ห้ามเก็บ/log
  vars: Record<string, string>; buttons?: { label: string; kind: "postback" | "uri"; data: string }[];
  flex?: Record<string, unknown>; dedupeKey: string; at?: Date;                 // at = "ตอนนี้" ของการตัดสินเวลาเงียบ (ค่าเริ่ม new Date())
  bypassQuiet?: boolean;                                                         // ข้อความที่ลูกค้ารอทันที (ถึงคิว/ใบเสร็จ) — ผู้เรียกประกาศ
  link?: { purpose: string; subjectId: string; path: string; expMin: number };  // ลิงก์ส่วนตัว (signLink)
}) → Promise<{ channel: "LINE" | "SMS" | "NONE"; status: "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED";
               webLink?: string | null; retryAt?: Date; duplicate?: boolean; error?: "VALIDATION" | "NOT_FOUND" }>
```
- **ตรวจก่อน (ไม่เขียน log · ไม่ส่ง · คืน `{ channel:"NONE", status:"FAILED", error }`)**: `unitId` ต้องเป็น `BusinessUnit` ของร้าน ⇒ ไม่ใช่ `NOT_FOUND` · แม่แบบไม่มีในทะเบียน/ไม่ใช่ template ⇒ `VALIDATION` · `dedupeKey` (carry: **ประกอบจาก id เท่านั้น**) ต้อง 1–200 ตัว `^[A-Za-z0-9:._-]+$` และไม่มีเบอร์ไทย (`(\+?66|0)[689]\d{8}`) ⇒ ไม่ผ่าน `VALIDATION` · `link.path` ต้อง `^/[A-Za-z0-9/_-]*$`
- **dedupe** (`ServiceMessageLog @@unique([tenantId, dedupeKey])`): มีแถวสถานะ `SENT|SKIPPED_CONSENT|NO_CHANNEL` ⇒ คืน `{ duplicate:true, channel, status }` ของแถวเดิม ไม่ส่ง · สถานะ `SKIPPED_QUIET|FAILED` = ลองใหม่ได้ (อ้างสิทธิ์แถวเดิมแบบ atomic แล้วอัปเดต — ไม่สร้างแถวที่ 2) · ยิงพร้อมกัน N ทาง = ส่งจริง 1 ครั้ง แถว 1 แถว (X4/X5) · กลไกอ้างสิทธิ์เลือกเอง แต่จบแล้วแถวต้องเป็นหนึ่งใน 5 สถานะ
- **เวลาเงียบ**: `messaging.quietHours` (UNIT) + `inQuietWindow`/`nextQuietEnd` จาก `src/lib/core/quiet-hours.ts` ด้วย `at` · อยู่ในช่วงและไม่ `bypassQuiet` ⇒ `SKIPPED_QUIET` · `retryAt = nextQuietEnd(at, end)` · ไม่ส่งทุกช่องทาง · แถว log สถานะ `SKIPPED_QUIET`
- **ช่องทาง** ตาม `messaging.channelOrder` (UNIT) ทีละตัว:
  - `LINE`: connection = `messaging.lineConnectionId` (UNIT) **เท่านั้น** (null = ไม่มี LINE · ไม่เดา OA อื่น) ต้องเป็น LINE ของร้านนี้ไม่ DISABLED · ผู้รับ = `chatContactId` (ของร้านนี้ + บน connection นี้) หรือผู้ติดต่อของ `partyId` **บน connection นี้** · ไม่มี ⇒ ช่องถัดไป · ผู้ติดต่อ `blockedAt` หรือ optOut (ด้านล่าง) ⇒ จดว่า "ติดยินยอม" แล้วช่องถัดไป · ส่งสำเร็จ ⇒ `SENT` จบ · LINE ตอบผิด ⇒ จด FAILED แล้วช่องถัดไป
  - `SMS`: ยังไม่มีผู้ให้บริการ (S.1) ⇒ ข้าม
  - `WEB_LINK`: มี `link` ⇒ `webLink = link.path + signLink({ tenantId, purpose, subjectId, expMin })` · ไม่มี `link` ⇒ ข้าม
- ข้อความ: แม่แบบผ่าน `resolveSetting(ctx, key, { unitId })` + `renderTemplate` · ภาษา `en` เมื่อ `ChatContact.lang` ขึ้นต้น `en` ไม่งั้น `th` · `flex` ⇒ ส่ง flex (altText = ข้อความที่เรนเดอร์ ตัด 400) · `buttons` ⇒ flex bubble (body = ข้อความ · footer = ปุ่ม postback `data` / uri) · ไม่มีทั้งคู่ ⇒ text message
- **สถานะสุดท้ายเมื่อไม่ได้ส่ง**: ติดยินยอม ⇒ `SKIPPED_CONSENT` · LINE ล้ม ⇒ `FAILED` · อื่น ⇒ `NO_CHANNEL` (channel `NONE`) — `webLink` คืนทุกครั้งที่มี `link` และ WEB_LINK อยู่ในลำดับ (ผู้เรียกแสดง/พิมพ์ให้ลูกค้า)
- **optOut (X8)**: `ChatContact.blockedAt` · หรือ `MemberConsent` ช่อง `"LINE"` ที่ `granted=false` และ `revokedAt` ไม่ว่าง ของ `Customer` ที่ `partyId` เดียวกัน (ร้านเดียวกัน) — ความยินยอมการตลาดที่ "ไม่เคยให้" **ไม่บล็อก** ข้อความบริการ (CC §4.4)
- log `ServiceMessageLog { tenantId, unitId, domain, messageKey, dedupeKey, channel, status, partyId (ของผู้รับ · null ได้), at }` — **ไม่มีเบอร์/ชื่อ/ข้อความ** · ไม่เขียน outbox/audit ที่มี vars

### 3.7 ลิงก์เซ็น (`core/signed-link.ts` · ไม่ import modules/platform)
```ts
SIGNED_LINK_MAX_MIN = 129600   // 90 วัน
signLink({ tenantId, purpose, subjectId, expMin }) → string     // throw เมื่อ input ผิด/ไม่มีกุญแจ
verifyLink(token: unknown, purpose: string) → { tenantId: string; subjectId: string } | null   // ไม่ throw
```
- token = `P + "." + S` · `P = base64url(JSON {"v":1,"t":tenantId,"u":purpose,"s":subjectId,"e":expUnixSec,"n":base64url(16 ไบต์สุ่ม)})` · `S = base64url(HMAC-SHA256(key = "signed-link:v1:" + SESSION_SECRET, P))` (ข้อสอบปลอม/ตรวจด้วยสูตรนี้)
- sign: tenantId/purpose/subjectId ไม่ว่าง ≤ 100 · purpose `^[a-z][a-z0-9._-]*$` · expMin จำนวนเต็ม ≥ 1 (≤0/ทศนิยม/NaN = throw) · เกิน MAX = ตัดเหลือ MAX · `SESSION_SECRET` < 32 = throw
- verify: ไม่ใช่ string/รูปผิด/ลายเซ็นผิด (เทียบ timing-safe)/JSON ผิด/`v≠1`/purpose ไม่ตรง/`e ≤ now`/`e − now > MAX`/ไม่มีกุญแจ ⇒ **`null` ตัวเดียวกันทุกกรณี** (X7)

## 4. ห้าม
- ยิง LINE จริงจากข้อสอบ/สคริปต์ · โทเคน/secret/รหัสดิบ/เบอร์/ชื่อ ใน log · console · audit · outbox · ServiceMessageLog · ผลคืน
- แชท import platform/core-settings ที่ลากโดเมน (ตรวจ postback รูปแบบในแชทเอง) · platform import แชทผ่านไฟล์ย่อย (ใช้ `@/lib/modules/chat` facade)
- ค่าสำรองกุญแจ (`?? ""` · `|| "dev"`) · `any` · cron ใหม่ใน `vercel.json` · แก้ `defs/*` ของ R0.3/D.1 · แก้ไฟล์ข้อสอบ

## 5. ข้อที่ผู้คุมตัดสินเอง (CC ไม่ได้ระบุ — ข้อสอบยึดตามนี้)
1. **partyId ตอนผูกรหัส** มาจาก `resolveParty` ของ route ตาม purpose (ตาราง ChatLinkCode ไม่มีคอลัมน์ party · โดเมนรู้ว่า ref ของตนเป็นของใคร) · ใน R0.7 ทะเบียนว่าง ⇒ ผูกได้แต่ partyId = ของเดิมของผู้ติดต่อ
2. **รหัส 8 ตัว** (carry ≥8 ทับ CC §10.4 "6 ตัว") · alphabet ไม่มีตัวกำกวม · ต้องมีทั้งอักษรและตัวเลข (กันข้อความแชทธรรมดาถูกตีความเป็นรหัส) · rate limit 10 ครั้ง/15 นาที/ผู้ติดต่อ
3. **ธงข้ามเวลาเงียบ** เป็นพารามิเตอร์ `bypassQuiet` ของผู้เรียก (SettingDef ไม่มีช่องธง — ไม่แก้ R0.3)
4. **OA ต่อหน่วย = `messaging.lineConnectionId` ตรงตัว** · null = ไม่มี LINE (ไม่เดา OA เดียวของร้าน) — R0.4 ช่วยเลือกในหน้าตั้งค่า
5. **optOut** = ผู้ติดต่อถูกบล็อก หรือเพิกถอนยินยอมช่อง LINE อย่างชัดแจ้ง (ยังรอที่ปรึกษา PDPA J5 — ค่าปลอดภัยเอียงไม่ส่ง)
6. `webLink` เป็น path สัมพัทธ์ (โดเมนประกอบ origin เอง) · อายุสูงสุด 90 วัน
7. สถานะ `SKIPPED_QUIET`/`FAILED` ลองใหม่ได้ด้วย dedupeKey เดิม · ผู้ส่งซ้ำตามเวลา = minute-job ของโดเมน (B.9/D.9) ใช้ `retryAt`
8. ตัวจำลอง LINE อยู่ในตัวข้อสอบ (`LINE_API_BASE`) — ข้อสอบโดเมน (B.9/D.9) ลอกแบบเดียวกัน
