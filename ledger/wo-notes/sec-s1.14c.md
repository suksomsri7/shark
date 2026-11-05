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
`approvals` = `inboxForUser(userId, { tenantId }).filter(canApprove).length` (เฉพาะกิจการนี้ · รอบ 2 R-S1.14c-b) · `customers` = Σ `unreadFor` ทุก CHAT active (ห้องที่ยังไม่อ่าน · ตัวเดียวกับ `inbox/unread` ที่แอปใช้ตอนนี้) · ไม่มี `chat.conversation.read` = 0 · `team.invites` = `staffInvite.count(acceptedAt null, expiresAt > now)` OWNER/MANAGER · `team.help` = `chatConversationHelper.count(userId=me, conversation.status OPEN)` · `team.support` = `unreadCaseTotalForUser` · `total` = ผลรวม

## 5. ผลรัน (หลัง merge da6468f8b · ทิป wip)
- oracle forced ×2 + unforced: `{"total":12,"passed":10,"failed":["L-3","B-3"]}` ทั้ง 3 รอบ (เหตุ = ข้อสอบ · §7 ข้อ 1–2) · residue: cleanup ของข้อสอบเอง
- positive control L-3 (สำเนาชั่วคราว แก้แค่ `post = async (body) =>` · ลบแล้ว ไม่ commit): `✅ [L-3]` · `{"total":10,"passed":9,"failed":["B-3"]}`
- regression: s1.21 19/19 · s1.22 14/14 · s1.14b 24/24 · s1.25 19/19 · s0.3 51/53 (skip D1.7/D4.3 เดิม) · qc-chat-notify-v2 30/30 · qc-chat-notify 23 · qc-chat-push-badge 48/48 · qc-chat-v2-realtime 26/26 · qc-chat-security 38/38 · qc-chat-staff-perms 49/49 (= baseline 049df880b) · **s1.17 9/10 (N-4 = §7 ข้อ 3)**
- typecheck (`tsc --noEmit` ใน iso) exit 0 · 0 error · fitness มี env (D-1/D-2) + `env -u DATABASE_URL` 53/53
- คำสั่ง: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.14c.mts`

## 7. ORACLE-EDIT / มติที่ขอ
1. **qc-sec-s1.14c L-3** — ตัวจับ `post` ในข้อสอบเป็น `async (_url, body) => …` แต่ transport จริงของ `core/push.ts` คือ `post(payloads: unknown[])` อาร์กิวเมนต์เดียว (push.ts:15 `PushDeps`, `deliverBatch` :62 `await post(payloads)`) ⇒ `body` = undefined → `(undefined).to` throw ใน post → `sendPushToUser` ดักแล้ว log ⇒ `pushes=0` ทั้งที่ push ถูกยิงจริง (helperRows=1 · helperErr ว่าง) · เทียบ s1.17:61 / s1.21:117 ใช้ `async (msgs) => { posts.push(...msgs); return { tickets: … } }` · ขอแก้: `const post = async (body: unknown) => { const arr = Array.isArray(body) ? body : [body]; …; return { tickets: arr.map(() => ({ status: "ok" })) }; }`
2. **qc-sec-s1.14c B-3** — คาด `customers ≥ 2 (unread 2)` แต่ fixture มีห้องเดียว (`staffUnreadCount: 2`) · ใบงานนิยาม `customers` = ผลรวม `unreadFor` ซึ่งนับ **ห้อง** (`staffUnreadCount > 0` · ตัวเดียวกับ `inbox/unread` ที่ badge โซนลูกค้าของแอปใช้อยู่) = 1 · ทำตามใบ (ไม่เปลี่ยนความหมาย badge) · ขอแก้เกณฑ์เป็น `=== 1` (หรือ ≥ 1) · ถ้าผู้คุมต้องการนับข้อความแทน = ต้องมีมติ (ตัวเลขจะต่างจาก inbox/unread)
3. **qc-sec-s1.17 N-4** (ใบที่รับแล้ว) — ตรวจ `data.link === /inbox/<id>` ของ `sendPushToChatStaff` = ขัดกับใบนี้ (R-S2.13j) · ขอแก้เป็น `/customers/${conv.id}`
4. **`conversationId` ใน push "ลูกค้าทักเข้ามา"** — ใบข้อ 1 บอก "ทุก payload มี data.conversationId" แต่ `qc-chat-notify-v2` NV-6.5 + `qc-chat-push-badge` CP-1.3 ห้ามคีย์นี้ (แอป 1.0 `(app)/_layout.tsx:168` อ่าน `conversationId` แล้วเปิด `/chat/<id>` = ห้องแชท AI) ⇒ push.ts ไม่ใส่ (มี `chatConversationId` อยู่แล้ว) · routing.ts มี conversationId มาตั้งแต่ S1.23 (คงเดิม)

## รอบ 2 (มติ §Y · ORACLE-EDIT e9dc9c778)
- merge tip `session/secretary` e9dc9c778 ด้วย SHA ตรง (891f2e5d0)
- R-S1.14c-b: `badges.approvals` = `inboxForUser(userId, { tenantId, take: 100 })` นับ `canApprove` — เฉพาะกิจการของ x-tenant-id (เลิกใช้ `inboxCount` ข้ามกิจการ) · total ตาม · docs แถว badges แก้ตาม
- R-S1.14c-a (customers = จำนวนห้อง) · R-S1.14c-c (push ลูกค้าทักไม่มี conversationId) = ยอมรับ ไม่ต้องแก้โค้ด
- ผล: qc-sec-s1.14c forced ×2 `{"total":12,"passed":12,"failed":[]}` ทั้งสองรอบ (D-1/D-2 fitness มี env ผ่านในตัว) · qc-sec-s1.17 `{"total":10,"passed":10,"failed":[]}` · fitness `env -u DATABASE_URL` 53/53 · typecheck `tsc --noEmit` exit 0 · 0 error
