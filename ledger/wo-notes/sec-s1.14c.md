# WO S1.14c — ตั๋ว server ชุด 2 (push link /customers + tenantId · badges เส้นเดียว · can.aiSuggest)

> RUN "เลขา AI" · tree ผู้คุม `/root/projects/shark-sec` (`session/secretary`) · เลน b `/root/projects/shark-sec-b` branch `wip/sec-s1.14c` · 6 พ.ย. (UTC 5 พ.ย.)
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.14c.md` + COMMON + RESOLUTIONS §W (R-S2.13b/c) §W.2 (R-S2.13j) §X.2 (LOW-3)
> ข้อสอบ: `scripts/qc-sec-s1.14c.mts` (12 ข้อ · commit 8b14fa524 · builder ไม่แก้) · ไม่มี schema change · ไม่มี prisma generate

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/chat/routing.ts` | แก้ (payload เท่านั้น 3 บรรทัด) | `data.link` assigned/helper+handoff (`pushInbox`)/sla: `/inbox/<id>?e=` → `/customers/<id>?e=` · tenantId/systemId/conversationId มีอยู่แล้ว · ไม่แตะตรรกะ |
| `src/lib/core/push.ts` | แก้ 1 hunk | `sendPushToChatStaff` ค่าปริยาย `data = { link: /customers/<id>, tenantId, systemId, ...args.data }` (ผู้เรียกชนะ) · **ไม่ใส่ `conversationId`** (ดู §7) |
| `src/lib/modules/chat/service.ts` | ไม่แก้ | ส่ง `tenantId` เป็น args แรกอยู่แล้ว → ถึง `data.tenantId` ผ่านค่าปริยายของ push.ts (ตรวจแล้ว: N-4 ของ s1.17 พิมพ์ data จริง) |
| `src/app/api/mobile/secretary/badges/route.ts` | ใหม่ | GET badges · gate null · 60/นาที (`sec:badges:<tid>:<uid>`) · count/aggregate |
| `src/app/api/mobile/inbox/conversations/[id]/route.ts` | แก้ | `can.aiSuggest = can(c, {chat, chat.ai.suggest})` |
| `src/lib/mobile/inbox-dto.ts` | แก้ | `InboxConversationCan.aiSuggest: boolean` |
| `apps/mobile/src/api/inbox.ts` | แก้ (type เท่านั้น) | `ConvCan.aiSuggest?: boolean` |
| `docs/api/SECRETARY-API.md` | แก้ | แถว badges · can.aiSuggest · หมายเหตุลิงก์ push |

## 2. badges — นิยาม
`approvals` = `inboxCount(userId).canApprove` (ทุกกิจการ) · `customers` = Σ `unreadFor` ทุก CHAT active (ห้องที่ยังไม่อ่าน · ตัวเดียวกับ `inbox/unread` ที่แอปใช้ตอนนี้) · ไม่มี `chat.conversation.read` = 0 · `team.invites` = `staffInvite.count(acceptedAt null, expiresAt > now)` OWNER/MANAGER · `team.help` = `chatConversationHelper.count(userId=me, conversation.status OPEN)` · `team.support` = `unreadCaseTotalForUser` · `total` = ผลรวม

## 5. ผลรัน
(ดูรายงานส่งผู้คุม — วางบรรทัด JSON_SUMMARY ด้านล่าง)

## 7. ORACLE-EDIT / มติที่ขอ
1. **qc-sec-s1.14c L-3** — ตัวจับ `post` ในข้อสอบเป็น `async (_url, body) => …` แต่ transport จริงของ `core/push.ts` คือ `post(payloads: unknown[])` อาร์กิวเมนต์เดียว (push.ts:15 `PushDeps`, `deliverBatch` :62 `await post(payloads)`) ⇒ `body` = undefined → `(undefined).to` throw ใน post → `sendPushToUser` ดักแล้ว log ⇒ `pushes=0` ทั้งที่ push ถูกยิงจริง (helperRows=1 · helperErr ว่าง) · เทียบ s1.17:61 / s1.21:117 ใช้ `async (msgs) => { posts.push(...msgs); return { tickets: … } }` · ขอแก้: `const post = async (body: unknown) => { const arr = Array.isArray(body) ? body : [body]; …; return { tickets: arr.map(() => ({ status: "ok" })) }; }`
2. **qc-sec-s1.14c B-3** — คาด `customers ≥ 2 (unread 2)` แต่ fixture มีห้องเดียว (`staffUnreadCount: 2`) · ใบงานนิยาม `customers` = ผลรวม `unreadFor` ซึ่งนับ **ห้อง** (`staffUnreadCount > 0` · ตัวเดียวกับ `inbox/unread` ที่ badge โซนลูกค้าของแอปใช้อยู่) = 1 · ทำตามใบ (ไม่เปลี่ยนความหมาย badge) · ขอแก้เกณฑ์เป็น `=== 1` (หรือ ≥ 1) · ถ้าผู้คุมต้องการนับข้อความแทน = ต้องมีมติ (ตัวเลขจะต่างจาก inbox/unread)
3. **qc-sec-s1.17 N-4** (ใบที่รับแล้ว) — ตรวจ `data.link === /inbox/<id>` ของ `sendPushToChatStaff` = ขัดกับใบนี้ (R-S2.13j) · ขอแก้เป็น `/customers/${conv.id}`
4. **`conversationId` ใน push "ลูกค้าทักเข้ามา"** — ใบข้อ 1 บอก "ทุก payload มี data.conversationId" แต่ `qc-chat-notify-v2` NV-6.5 + `qc-chat-push-badge` CP-1.3 ห้ามคีย์นี้ (แอป 1.0 `(app)/_layout.tsx:168` อ่าน `conversationId` แล้วเปิด `/chat/<id>` = ห้องแชท AI) ⇒ push.ts ไม่ใส่ (มี `chatConversationId` อยู่แล้ว) · routing.ts มี conversationId มาตั้งแต่ S1.23 (คงเดิม)
