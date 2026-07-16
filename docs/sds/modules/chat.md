# Chat / Omni-channel Inbox (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
กล่องข้อความรวมลูกค้า — WEBCHAT (built-in) + LINE (P1 MVP). รับ inbound (webhook) → เธรด → staff ตอบ (sendReply → adapter ส่งออกช่องทาง) + assign/สถานะ/ผูกลูกค้า. ผู้ใช้: staff (ตอบแชท) + ลูกค้า (webchat widget/LINE). **Layer 2: Core** (feature no.10) — scope=system (AppSystem type CHAT). คนละ inbox กับ Meeting (แชทภายใน).
โค้ด: `src/lib/modules/chat/{service,actions,adapter,line,webchat,crypto,rate-limit}.ts` · schema `prisma/schema/chat.prisma`.

## Data model (prisma/schema/chat.prisma) — tenantId+systemId ทุกตาราง
- **ChatChannelConnection** — การเชื่อมช่องทาง: `type`(WEBCHAT/LINE/FACEBOOK/INSTAGRAM/SHOPEE/LAZADA/WHATSAPP) `externalAccountId` `credentials`(🔐 AES-256-GCM, ไม่ return เต็ม) `webhookKey`(unique) `defaultUnitId?` `status`(CONNECTED/EXPIRED/ERROR/DISABLED) `tokenExpiresAt?`. unique `[systemId,type,externalAccountId]`.
- **ChatContact** — ตัวตนลูกค้าต่อช่องทาง: `externalUserId`(WEBCHAT=guest token) `customerId?`(ผูก Member) `linkedByUserId/linkedAt`. unique `[systemId,channel,channelConnectionId,externalUserId]`.
- **ChatConversation** — เธรด: `status`(OPEN/PENDING/RESOLVED) `assigneeUserId?` `unitId?`(tag) denormalized `lastMessage*`/`staffUnreadCount` + SLA fields. ⚠️ **1 contact = 1 conversation active** บังคับ 2 ชั้น: (1) advisory lock ต่อ contactId ใน tx (2) partial unique `chat_conv_active WHERE status<>'RESOLVED'` (raw SQL).
- **ChatMessage** — `direction`(IN/OUT) `type`(TEXT/IMAGE/STICKER/FILE/ORDER_CONTEXT/SYSTEM) `senderUserId?` `body` `isInternal` `deliveryStatus`(PENDING/SENT/FAILED) `clientMessageId`/`externalMessageId`(dedupe, unique ต่อ conversation).
- **ChatAttachment** · **ChatReadState**(unread ต่อ staff, unique `[conversationId,userId]`) · **ChatConversationEvent**(SLA+audit: CREATED/ASSIGNED/STATUS_CHANGED/CUSTOMER_LINKED/REOPENED/DELIVERY_FAILED) · **ChatQuickReply** · **ChatSetting**(1/ระบบ: `memberSystemId?` link Member, greeting/offline, SLA, retentionDays) · **ChatWebhookLog**(dedupe unique `[connectionId,eventKey]`, ไม่เก็บ payload เต็ม-PII).

## Service API (src/lib/modules/chat/service.ts — คัดสำคัญ)
- `listStaff` · `credsOf/maskedConnection`(mask credentials) · `listConnections/getConnection`.
- `ensureWebchatConnection(...)` — สร้าง WEBCHAT connection (built-in) ถ้ายังไม่มี.
- `connectLine({...})` — สร้าง/อัปเดต LINE connection (เก็บ credentials เข้ารหัส).
- `setConnectionStatus(...)` · `getSetting/setMemberSystem(...)`.
- `receiveInbound(args)` / `receiveWebchatInbound(args)` — รับ webhook: dedupe (ChatWebhookLog), advisory lock contactId, หา/สร้าง conversation active, เขียน message IN, อัปเดต SLA/unread.
- `sendReply(args)` — ตรวจสิทธิ์ unit (canAccessConvUnit), เขียน message OUT, เรียก adapter ส่งออก; FAILED → event DELIVERY_FAILED.
- `canAccessConvUnit(unitAccess, unitId)` — RBAC ระดับ unit (M11).
- `listConversations/getThread/unreadCount` · `setStatus/assign/markRead/linkCustomer` · `getLinkedMember` · `getWebchatThread`.
- **rate-limit.ts**: `rateLimit(key,limit,windowMs)` · `clientIp(headers)` (M9). **crypto.ts**: `encryptCreds/decryptCreds`(AES-256-GCM) · `mask` (M10). **adapter.ts**: `getAdapter(type)`/`isSupported(type)`; **line.ts/webchat.ts** = channel adapters.

## การเชื่อมต่อ
- **ขาเข้า/ออก ช่องทางภายนอก**: LINE/webhook ผ่าน adapter (line.ts) · webchat widget.
- **Member**: ChatContact.customerId + ChatSetting.memberSystemId (opt-in) — linkCustomer เขียน event CUSTOMER_LINKED.
- ไม่มี outbox event (แต่ conversation event log ภายในเป็น type string CREATED/ASSIGNED/... ใน ChatConversationEvent).

## Permissions (assertCan ใน actions.ts)
`chat.connection.create` · `chat.connection.disable` · `chat.conversation.assign` · `chat.customer.link` · `chat.message.send`. + RBAC ระดับ unit (canAccessConvUnit) กัน IDOR ข้าม unit.

## UI
- Staff inbox: `/app/sys/[id]/chat` (type=CHAT, ChatContent).
- Public: `/(store)/chat/[connectionId]` (webchat) · API `POST /api/chat/webhook/[connectionId]` (inbound provider) · `POST /api/chat/webchat/[connectionId]` (webchat inbound).

## การทดสอบ
- `scripts/qc-chat-security.mts` (QC7, ~26 assertion) — M9 rate limit · M10 CSPRNG token/mask credentials · M11 unit RBAC (IDOR leak) · M12 race lock (1 contact=1 conversation). fail-before/pass-after ด้วย git stash M9-M12.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- P1: WEBCHAT+LINE. FACEBOOK/INSTAGRAM (เฟส 2 Meta) · SHOPEE/LAZADA (เฟส 3) · WHATSAPP (เฟส 4) — enum จองไว้.
- แจ้งลูกค้า outbound เชิงรุก (จอง/คิว/แต้ม) ผ่าน LINE → WO-0067.
- retentionDays (purge PII) เป็น setting — cron purge ต่อ WO-0042 (PDPA).
