# WO S1.12 — send_customer_message + kind chat.send (ส่งถึงลูกค้าผ่าน sendReply · ลงชื่อ Shark ผู้ช่วย AI · เฉพาะลูกค้าที่ผูก · กันส่งซ้ำ)

> RUN "เลขา AI" · tree ผู้คุม `/root/projects/shark-sec` · เลน `shark-sec-d` branch `wip/sec-s1.12` · 2026-11-04 (UTC)
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S1.12.md` (+ COMMON + RESOLUTIONS R-K14 R-K15 R-K3 R-K3b §K §B.5)
> ข้อสอบ `scripts/qc-sec-s1.12.mts` (14 ข้อ · commit 87c216bf · builder ไม่ได้แก้ — ดู §7 ORACLE-EDIT)
> 🔴 ฐานของเลนนี้ยังไม่มี S1.7/S1.8 รอบ 2 (`kind-tables.ts` · `secretary/kind-class.ts` · `secretary/actions.ts` ไม่มี) ⇒ kind เพิ่มใน `STATIC_KIND_ACCESS` ของ proposals.ts (ย้ายไป kind-tables ตอน merge — 2 บรรทัด) · K-4/E-5 SKIP · K-2 แดงจนกว่า S1.7 merge

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | COMMON §D |
|---|---|---|---|
| `src/lib/ai/proposals.ts` | แก้ | `StaticProposalKind` + `STATIC_KIND_ACCESS`: `chat.send` (chat · chat.message.send) · `booking_refund_deposit` (booking · booking.deposit.refund) · 2 สาขาใน `dispatch` → `dispatchChatSend` / `dispatchBookingRefundDeposit` · const `CHAT_SEND_SENDER_NAME` `CHAT_SEND_MAX_CHARS` | ใช่ (hunk เล็ก 4 จุด) |
| `src/lib/modules/chat/service.ts` | แก้ | `sendReply`: arg `clientMessageId?` · ตรวจแถวเดิมก่อน + จับ P2002 ⇒ `{ ok:true, messageId, duplicate:true }` · return type + `duplicate?` · ผู้เรียกเดิมไม่ส่ง = เดิมทุกไบต์ | – |
| `src/lib/ai/tools.ts` | แก้ | tool `send_customer_message` (เสนอเท่านั้น) + ลงทะเบียน | ใช่ |
| `src/lib/ai/tool-access.ts` | แก้ | `HAND_ACTION_KIND.send_customer_message = "chat.send"` (1 บรรทัด) | ใช่ |
| `src/lib/ai/skills.ts` | แก้ | skill `chat` (มีอยู่แล้ว) + `send_customer_message` · summary อังกฤษ | ใช่ |
| `src/lib/ai/persona.ts` | แก้ | `CUSTOMER_CHAT_RULE` ฉีดเมื่อมีระบบ CHAT และระดับ chat ยอมให้เขียน (ไม่ส่ง access ⇒ ตามด่าน membership) · ไม่เข้าเงื่อนไข = prompt เดิม (qc-sec-s1.2 P-1 เขียว) | – |
| `docs/modules/31-secretary.md` | แก้ | §5.7 แก้ชื่อ kind คืนมัดจำ · §5.7a ใหม่ (สัญญา chat.send · คีย์ meta แบนสำหรับ S1.21) · §9 ตาราง kind ใหม่ | – |

## 2. migration — ไม่มี (คอลัมน์ `ChatMessage.clientMessageId` + unique `[conversationId, clientMessageId]` มีอยู่แล้ว chat.prisma:254)

## 4. ช่องว่าง kinds ของเส้นสาธิต (brief §4 · R-K16)
| เส้น | ต้องใช้ | มีแล้ว | เพิ่มในใบนี้ |
|---|---|---|---|
| 1 ใบเสนอราคา → LINE | ร่างใบ + ส่งลิงก์ให้ลูกค้า | `account.*` จากทะเบียน op (tool `account_create_document` / `account_issue_document` / `account_email_document`) · CRM `crm_issue_quotation` | **`chat.send`** (tool `send_customer_message` kind `quote` · refs.documentId) |
| 2 ตามลูกค้าเงียบ (การ์ดติดตาม) | การ์ดงาน/กิจกรรม + ข้อความติดตาม | `kanban.*` (`kanban_create_card` · `kanban_card_from_chat`) · `crm.*` (`crm_log_activity` · `crm_create_task_card` · `crm_set_next_step` · `crm_stale_deals`) | **`chat.send`** kind `followup` |
| 3 คืนมัดจำนัดหมาย | คืนมัดจำของนัดที่ยกเลิก/ไม่มา | `cancel_appointment` (ยกเลิกนัด) · ไม่มี kind คืนมัดจำ · ไม่มีทะเบียน op ของ booking (`bookingToolOps` ไม่มี) | **`booking_refund_deposit`** `{ appointmentId, reason? }` → `refundDepositByShop` (booking/deposit.ts:727 — ทางเดียวกับปุ่มคิวมัดจำ: สิทธิ์สดของคนกด `booking.deposit.refund` + สาขา · ล็อกแถวนัด · ใบคืนของ POS · audit `booking.deposit.refund` · event `booking.deposit_refunded`) · ต้องรู้ userId ผู้อนุมัติ · ไม่ใส่ `DESTRUCTIVE_KINDS` (ไม่ลบข้อมูล · classOfKind จับ `refund` = money ⇒ ต้องอนุมัติเสมอ) · ยังไม่มี tool เขียนมือ (เสนอได้ทาง `propose_plan` ด้วยชื่อ kind) |
- เลือก `refundDepositByShop` แทน `bookingSvc.refundDeposit` (ที่ docs เดิมระบุ): ตัวเดิมไม่มีตัวคน (`actorId: "module:booking"`) และไม่ตรวจสถานะ REFUND_DUE · ข้อเสีย: มัดจำแบบเก่าที่ไม่มีใบรับ POS ⇒ ปฏิเสธ "คืนที่หน้าบิลแบบเดิม" (ข้อความของ service)
- ชื่อ kind: `booking_refund_deposit` (ตัวเลือก legacy ในใบสั่ง) — docs เดิมเขียน `booking.refund_deposit` แก้แล้ว

## 5. ผลข้อสอบ
- `qc-sec-s1.12` (ข้อสอบจริง) forced #1 / #2 / unforced (unforced รันเต็มเพราะ tools.ts มี send_customer_message แล้ว) — เหมือนกันทั้ง 3: `JSON_SUMMARY {"total":14,"passed":8,"failed":["K-2","E-2","E-3","E-4"],"skipped":["K-4","E-5"]}` · exit 1 · เหตุ: K-2 = ไม่มี kind-class (S1.7) · E-2/E-3/E-4 = fixture ไม่เปิดระดับ chat (ORACLE-EDIT §7)
- สำเนาในเครื่องที่ใส่ hunk ของ ORACLE-EDIT (ไม่ commit · ลบแล้ว) forced: `JSON_SUMMARY {"total":14,"passed":11,"failed":["K-2"],"skipped":["K-4","E-5"]}`
- residue หลังรัน: `{"tenants":0,"users":0,"contacts":0}`
- regressions (forced): qc-sec-s1.2 28/28 (P-1 snapshot เท่าเดิม) · qc-sec-s1.4 28/28 · qc-sec-s1.6 16/16
- regressions (unforced) = baseline 85751098: qc-ai-tools 18/18 · qc-ai-skills 23/23 · qc-ai-phase-b1 9/9 · qc-chat-core-v2 47/47 · qc-chat-replies 60/60 · qc-chat-security 38/38
- typecheck: 0 error ใน src (แดงเหลือเฉพาะ scripts/qc-sec-s1.{7,10,11,12,13,21,22,25}.mts ของใบที่ยังไม่ build/merge — ทราบอยู่แล้ว) · fitness มี env + `env -u DATABASE_URL -u DIRECT_URL` = D-1/D-2 เขียวทุกรอบของข้อสอบ
- persona: CHAT + ไม่ส่ง access ⇒ มีบรรทัด · chat READ / map ค่าเริ่มต้น ⇒ ไม่มี · chat DRAFT ⇒ มี · ไม่มีระบบ CHAT ⇒ ไม่มี

## 7. ข้อแย้ง / มติ
- **ORACLE-EDIT S1.12-E2 (ฐานข้อมูล fixture)**: ร้านในข้อสอบไม่มีแถว `AiSystemAccess` ⇒ ระดับ chat = ค่าเริ่มต้น **READ** (`DEFAULT_OVERRIDES` access-rules.ts:31 "แชทลูกค้าเริ่มที่ดูอย่างเดียวจนกว่าเจ้าของจะเปิด") ⇒ `executeProposal` → `accessLevelGate` ปฏิเสธ chat.send ทุกใบ ⇒ E-2 แดง และลาม E-3 (ไม่มีแถวแรกให้ซ้ำ) / E-4 (note เป็นเรื่องระดับ ไม่มี 'ผูก'). พฤติกรรมนี้ถูกตามแบบ — ไม่ควรเลี่ยงด่าน. ขอ hunk: หลังสร้างผู้ใช้ `await (prisma as AnyMod).aiSystemAccess.create({ data: { tenantId: tid, module: "chat", level: "DRAFT", setById: U.owner } });` + เพิ่ม `"aiSystemAccess"` หน้า list ใน `cleanup`. ทดลองด้วยสำเนาในเครื่อง (ไม่ commit) ⇒ 11/14 · แดงเหลือ K-2 · SKIP K-4/E-5
- K-2 ต้องการ `secretary/kind-class.ts` ของ S1.7 รอบ 2 — ตรวจด้วยตา: `CUSTOMER_KINDS` มี `chat.send` · kind อยู่ใน KIND_ACCESS ⇒ known · ไม่อยู่ใน DESTRUCTIVE ⇒ เขียวหลัง merge ถ้าย้าย 2 บรรทัดของ STATIC_KIND_ACCESS ไป kind-tables
- `conv.status` CLOSED/ARCHIVED ในใบสั่งไม่มีใน enum (OPEN/PENDING/RESOLVED) ⇒ ใช้ RESOLVED (ตรงข้อสอบ E-4)
- tool ปฏิเสธห้อง RESOLVED ตั้งแต่ตอนเสนอด้วย (ไม่ได้สั่ง แต่ไม่ให้เกิดข้อเสนอที่อนุมัติแล้วล้มแน่นอน)
- `unitAccess` ที่ส่ง sendReply: OWNER = `["*"]` (OWNER เห็นแชททั้งร้าน แบบ chat_unread_conversations) · อื่น = ของผู้อนุมัติ
- ผลส่งออกช่องทางล้ม (sendReply ok:false หลังสร้างแถว) ⇒ ข้อเสนอ FAILED + เหตุผล · แถวข้อความ FAILED มีปุ่มส่งซ้ำในกล่องแชทเดิม
- ทางที่เรียกโมเดลเพิ่ม: ไม่มี
- ใครได้/เสียสิทธิ์: ผู้มี `chat.message.send` ได้เครื่องมือเสนอส่งถึงลูกค้า **เฉพาะเมื่อเจ้าของตั้ง chat = DRAFT** (ค่าเริ่มต้น READ ⇒ ไม่ยื่นในห้องผู้ช่วย) · ผู้อนุมัติต้องมี `chat.message.send` (assertCan) · คีย์ API กลางเสนอได้ (kind เขียนมือ — กติกาเดิม) แต่คนต้องกดยืนยัน · คืนมัดจำ: ผู้มี `booking.deposit.refund` + สาขาของนัด

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| ย้าย `chat.send` + `booking_refund_deposit` จาก STATIC_KIND_ACCESS ไป `kind-tables.ts` | S1.7 รอบ 2 ยังไม่ merge (คำสั่งผู้คุม) | merge S1-10 (ผู้คุม) |
| log/undo ของ chat.send (`recordAction` payload ids ไม่มี body · ไม่อยู่ใน UNDOABLE_KINDS) + `{note, entity}` ตาม §B.5 | `actions.ts` ไม่มีในฐาน · dispatch ยังคืน string — ตรวจ E-5/K-4 หลัง merge (`payloadIdsOf` ของ wip/sec-s1.7 เก็บเฉพาะคีย์ id ⇒ body ไม่ลง payload) · ⚠️ แต่ `AiActionLog.summary` = summary ของข้อเสนอ ซึ่งมีชื่อลูกค้า + ข้อความ 80 ตัวแรก (ผ่าน maskPiiPatterns เฉพาะเบอร์/อีเมล) — ผู้คุมตัดสินว่ารับได้หรือให้ log ใช้ summary สั้น | merge S1-10 |
| ด่านอนุมัติห้องเลขา (OWNER/MANAGER) ใช้กับ chat.send | อยู่ใน S1.7 | S1.7 |
| tool เขียนมือของ `booking_refund_deposit` | ใบสั่งให้เพิ่ม kind เท่านั้น | S1.14 (เส้นสาธิต) ถ้าต้องการ |
| `AiApprovalRule chat.send` ปิดได้โดย OWNER | R-K3b รุ่นแรกมีผลแค่ข้อความ "ทำไมต้องอนุมัติ" | – |

## 9. คืนสภาพฐาน — ข้อสอบ `finally` ลบร้าน `qc-sec-s112-*` + ผู้ใช้ `qcs112-*`

## 10. รอบ 2 — merge ทิปผู้คุม (S1.7/S1.8 รอบ 2 @38632d7f + ORACLE-EDIT S1.12-E2 @4a1e955d)
- ความขัดแย้ง: `proposals.ts` 2 hunk (บล็อก `StaticProposalKind` + `STATIC_KIND_ACCESS` ที่ S1.7 ย้ายออก) ⇒ ใช้ฝั่ง session ทั้งคู่ · ย้าย 4 บรรทัดของใบนี้ (`chat.send` · `booking_refund_deposit` ใน union + ตาราง) ไป `src/lib/ai/kind-tables.ts` · `docs/modules/31-secretary.md` §5.7 ⇒ ใช้ §5.7 ของ S1.7 + บรรทัด kind ใหม่ของใบนี้ + §5.7a คงไว้
- สัญญา S1.8 ของจริงคือ out-param (`DispatchOut` · R-S1.8a — handler คืน string เหมือนเดิม) ไม่ใช่ค่าคืน `{note, entity}`: `dispatchChatSend` ตั้ง `out.entity = { type: "chat.message", id: messageId }` (ส่งซ้ำ = แถวเดิม) · `dispatchBookingRefundDeposit` ตั้ง `{ type: "booking.appointment", id, unitId }` · ทั้งคู่ไม่อยู่ใน `UNDOABLE_KINDS` ⇒ `undoableUntil` null
- มติผู้คุม: summary ของ log (ชื่อลูกค้า + 80 ตัวแรก) รับได้ เพราะ `recordAction` ผ่าน maskPiiDeep (R-S1.8f)
- ผลรอบ 2: `qc-sec-s1.12` forced #1 / #2 / unforced = `{"total":14,"passed":14,"failed":[],"skipped":[]}` ×3 (K-4 · E-5 รันจริง) · fitness ×2 (D-1/D-2) เขียว · qc-sec-s1.7 forced 27/27 · qc-sec-s1.2 28/28 · qc-ai-tools 18/18 · qc-ai-skills 23/23 · qc-chat-replies 60/60 · typecheck: src 0 error (เหลือ scripts ของ S1.10/11/13/21/22/25 ที่ยังไม่ build)
