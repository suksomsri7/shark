# K3.4 — ย้อนกลับ outbound + หน้าโปรไฟล์ผู้ติดต่อ (โน้ต — builder ถูกหยุดก่อนเขียน · Fable รับงานเองต่อ 10 ก.ย.)

> สถานะ: **oracle 11/11 · tsc 0 · fitness 23/23 · regressions k3.3/k3.2/k3.1/k1.7/k2.9/k2.11/chat-v2-room เขียวหมด · ภาพ 3 ใบ Fable ดูแล้ว** · ไม่มี migration

## ไฟล์ที่แตะ (builder Opus 7 ก.ย. 21:00–21:20)
- ใหม่ `src/lib/platform/kanban-outbound.ts` — `cardCompleted(evt)`: CHAT_CONVERSATION → บันทึกภายใน 1 ข้อความต่อ key `kanban.card.completed#{cardId}#{completedAt}` (meta.kanbanKey) ผ่าน `sendReply` · ACCOUNT_DOC → activity CARD_UPDATED `{outbound:"ACCOUNT_DOC"}` 1 ครั้ง · archived → ไม่ทำ · try/catch + logOps WARN
- ใหม่ `src/app/app/party/[partyId]/page.tsx` — โปรไฟล์ผู้ติดต่อ (facade party · notFound ข้ามร้าน · ข้อมูลติดต่อเฉพาะ crm.*/member.*/OWNER/MANAGER · "งานที่เชื่อมกับผู้ติดต่อนี้" ผ่าน `listCardsForTarget` + visibleBoardsWhere)
- แก้ `outbox-consumers.ts` (compose kanban.card.completed) · `moves.ts` (payload +actorUserId) · `types.ts` · `link-resolvers.ts` · `party/index.ts`+`service.ts` (facade อ่าน party 1 ตัว) · `chat/service.ts` (sendReply meta) · `CardLinks.tsx` (บรรทัด "เมื่อปิดงาน ระบบจะแปะบันทึกในบทสนทนานี้ให้") · `visual-kanban.mts` spec "3.4"

## ภาพ (`.qc-shots/kanban/3.4/`)
- `party-profile-owner-desktop.png` — เจ้าของเห็นโทร/อีเมล/เลขภาษี/ที่อยู่ + งานที่เชื่อม 3 ใบ (รวมบอร์ดลับสาขากะตะ)
- `party-profile-thana-desktop.png` — ธนา (STAFF ไม่มี crm.*) เห็นแค่ชื่อ + ข้อความ "ข้อมูลติดต่อเปิดให้เฉพาะทีมที่ดูแลลูกค้าสัมพันธ์หรือสมาชิก" + งาน 2 ใบ (บอร์ดลับหายตาม visibleBoardsWhere) ✅
- `party-profile-owner-mobile.png` — 390px เรียงคอลัมน์เดียว ไม่ล้น

## หนี้
- ยังไม่มีปุ่ม "ดูใน CRM" (สัญญาระบุ "ถ้ามี sys ที่มีโมดูล crm") — เก็บใน K3.F
- ไม่มี REST op ของ outbound (ไม่ต้องมี — เป็น consumer)
