# WO S1.21 + S1.24 — แชทลูกค้า API มือถือ (`/api/mobile/inbox/**`) · ผู้ดูแล/เรียกช่วย/กฎรับเรื่อง/เวร/SLA (`modules/chat/routing.ts`)

> RUN "เลขา AI" · ชุด S1-15 · เลน `/root/projects/shark-sec-c` branch `wip/sec-s1.21` (ตัดจาก session/secretary @ 9adb47a9) · 4–5 พ.ย. 2026 UTC
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.21.md` + COMMON + RESOLUTIONS (R-K13 R-K14 R-K8b R-K20 §M)
> ข้อสอบ: `scripts/qc-sec-s1.21.mts` (15 ข้อ · ของผู้คุม · **ไม่แก้** — ขอ ORACLE-EDIT 3 จุด §7)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/chat/routing.ts` | ใหม่ | `eligibleResponders` `canRespond` `listRules` `setRules` `isWithinBusinessHours` `assignIncoming` `callHelper` `handoff` `listHelpers` `setShift` `onDutyUsers` `listOnDuty` `sweepChatSla` · ค่าคงที่ `CHAT_REPLY_ACTION` `ROUTING_MODES` |
| `src/lib/modules/chat/sla-job.ts` | ใหม่ | ลงทะเบียนงานรายนาที `chat.sla` (ทุก 5 นาที) แบบ `room-jobs-job.ts` |
| `src/lib/modules/chat/service.ts` | แก้ (hunk) | (ก) **S1.12 `sendReply` clientMessageId/duplicate — คัดลอกตรงตัวจาก `wip/sec-s1.12` b3cd1734** (ไฟล์ใน tip ไม่มี — ดู §7 D-1) · (ข) `before?: Date` ใน `listConversations`/`getThread` · (ค) `assign(args, opts?: {requireReplyPermission})` · (ง) hook `autoAssignIncoming` ×2 (receiveInbound / receiveExternalInbound · ห้องยังไม่มีผู้ดูแล · catch → logOps) |
| `src/app/api/mobile/inbox/**` | ใหม่ | 16 ไฟล์ route (17 handler) + `_shared.ts` (ด่าน · ระบบ · ห้องที่มองเห็น · zod body ≤64KB · unread ตามหน่วย) |
| `src/lib/mobile/inbox-dto.ts` | ใหม่ | serializer allowlist (ไม่มี credentials/webhookKey/tokenPreview) · `aiMetaOf` (meta แบน `ai_*` §M → `meta.ai`) |
| `scripts/crm-cron.mts` · `src/app/api/cron/outbox/route.ts` | แก้ 1 บรรทัด | import `chat/sla-job` |
| `docs/api/SECRETARY-API.md` · `docs/modules/31-secretary.md` §5.24/§7 | แก้ | ตารางตรงของจริง |

ไม่แตะ prisma/ · ไม่ generate · ไม่มี event outbox ใหม่ · ไม่มีทางเรียกโมเดลใหม่.

## 3–5. ผลตรวจ
- `qc-sec-s1.21` (ไฟล์จริง) forced: **ล้มที่บรรทัด 101** — `prisma.chatConversation.create` ของข้อสอบเองชน unique `chat_conv_active` (1 ห้องที่ยังไม่ปิดต่อ contact) ⇒ ORACLE-EDIT R-3 (E-1 R-1 R-2 ผ่านก่อนล้ม)
- สำเนาที่ใส่ 3 hunk ที่ขอ (`scripts/qc-sec-s1.21.local.mts` ชั่วคราว · ไม่ commit · ลบแล้ว): forced #1 `JSON_SUMMARY {"total":15,"passed":15,"failed":[],"skipped":[],"findings":[]}` (17:2xZ) · forced #2 เหมือนกัน (17:39Z) · unforced เหมือนกัน (17:40Z) · residue 0 (tenant/user/pushDevice/contact `qcs121-*` = 0 หลังรอบที่ล้มด้วย)
- regressions (unforced เทียบ `sec-baseline-85751098.txt` = เท่ากันทุกชุด): core-v2 47/47 · security 38/38 · security-scope 20/20 · staff-perms 49/49 · notify 23 · notify-v2 30/30 · api-v1 89/89 · business-hours 73/73 · mobile-chat exit 0 (29/29) · attachments 37/37 · replies 60/60 · v2-quickreply 28/28 · member-autolink 11/11 · forced: qc-sec-s1.6 16/16 · qc-sec-s1.17 10/10
- typecheck (เต็ม · iso 8192/9500M): 0 error ในไฟล์ที่แตะ · 19 error ที่เหลือ = ข้อสอบใบที่ยังไม่เริ่ม (s1.10 s1.13 s1.22 s1.25) + **4 จุดใน `qc-sec-s1.21.mts` (`internal.body`/`hoMsg.body` possibly null)** ⇒ ORACLE-EDIT H-typing
- fitness: มี env 53/53 · `env -u DATABASE_URL -u DIRECT_URL` 53/53 (F5.1 ยัง 50 — ไฟล์ใหม่ใช้ `./db`/tenantDb)

## 4. X
- X1 ✅ ห้องหน่วยอื่น/ร้านอื่น = 404 (A-2) · staff?unitId ที่มองไม่เห็น = 404 · unread นับเฉพาะหน่วยที่เห็น
- X3 กันซ้ำ SLA = INSERT unique (clientMessageId ต่อห้อง) · reply ซ้ำ = แถวเดิม (S1.12 hunk รวม P2002) · assignIncoming ไม่ล็อกแถว (§8)
- X5 ✅ `chat.sla` บนราง minute-jobs (lease ของราง) · `now`/`deadline` ฉีดได้ · idempotent (S-1 รอบ 2 = 0)
- X7 ✅ Bearer+x-tenant-id · zod `.strict()` · 64KB · reply 60/นาที/ผู้ใช้ (A-5)
- X10 ✅ DTO allowlist · SECRET_RX ของ oracle เขียว (A-1/A-2)
- X2/X4/X6/X8/X9/X11: N-A (ไม่มีโมเดล · ไม่มี event ใหม่ · ไม่มีเงิน)

## 7. ข้อแย้ง / มติ
- **D-1 S1.12 ยังไม่ merge** — brief บอกว่า `sendReply` มี `clientMessageId`/`duplicate` แล้ว แต่ tip 9adb47a9 ไม่มี ⇒ คัดลอก hunk ของ `wip/sec-s1.12` b3cd1734 **ตรงไบต์** (`git diff` ไฟล์นี้เทียบ wip/sec-s1.12 = มีเฉพาะ hunk ของ S1.21) ⇒ merge ลำดับไหนก็ไม่ชน ถ้า S1.12 รอบ 2 ไม่แก้ hunk นี้ · ถ้าแก้ ⇒ ใช้ของ S1.12
- **D-2 คีย์ต่อเส้น** — brief: อ่าน=read · เขียน=send. ทำตามยกเว้นเส้นที่เว็บมีคีย์เฉพาะ (mobile/guard.ts: "แอปต้องใช้กติกาเดียวกับเว็บ"): status=`chat.conversation.setStatus` · read=`chat.conversation.markRead` · contact=`chat.customer.link` (brief เขียน `chat.contact.link` — ไม่มีในทะเบียน) · **assign = send หรือ assign** (oracle A-4 บังคับให้ STAFF ที่มีแค่ read+send มอบหมายได้ — สอดคล้องกับ handoff) ⇒ STAFF ที่มี send ได้สิทธิ์มอบหมายบนแอปเพิ่มจากเว็บ (เว็บต้อง `chat.conversation.assign`) — ผู้คุมตัดสิน
- **D-3 `CHAT_REPLY_ACTION`** ประกาศครั้งเดียวใน routing.ts (permissions.ts ไม่มีค่าคงที่ export · guard.ts ไม่ใช่ไฟล์ของใบนี้) — ทุก route import จากที่นี่
- **D-4 unread** = `unreadCount` เดิมเมื่อเห็นทุกหน่วย · จำกัดหน่วย = นับด้วย `unitAccessWhere` (ตัวเลขของหน่วยอื่นไม่รั่ว)
- **D-5 push link** `/inbox/<id>?e=helper|handoff|sla` — กันสแปม 60 วิของ notifyUser ผูก link (H-1 → H-2 ภายในวินาทีเดียวถึงคนเดิม) · ASSIGNED ไม่กรอง (ส่ง assigneeUserId = ผู้รับ) · OFF เคารพ · ไม่มีชื่อลูกค้า/โน้ตในข้อความ push
- **D-6 SLA ดีดัป** ใช้บันทึกภายใน (clientMessageId `sla:<เรื่อง>:<firstCustomerMessageAt ms>`) แทน ChatConversationEvent NOTE (enum ไม่มี NOTE · R-K14 ห้ามแตะ) · ดูย้อน 24 ชม. กันวันแรกปลุกห้องเก่าทั้งร้าน · ย้าย = MANAGER ห้องน้อยสุดก่อน แล้ว OWNER
- **D-7 thread ไม่ส่ง before** = หน้าใหม่สุด (route ส่ง `before = now+1 นาที`) · `getThread` ทางเดิม (ไม่ส่ง before) ไม่เปลี่ยน
- **D-8 contact POST** ตรวจว่า customerId เป็นสมาชิกของร้าน+ระบบสมาชิกที่เชื่อม ก่อน `linkCustomer` (เดิมไม่ตรวจ)
- **ORACLE-EDIT (ขอ · ไม่ได้แก้เอง)**
  - `S1.21-R3` บรรทัด 101: ห้อง LAST_ASSIGNEE ชน `chat_conv_active` (cA ยัง OPEN) — ใช้ contact ใหม่ที่มีห้องเก่า RESOLVED ของ a
  - `S1.21-R4` บรรทัด 108: fixture เวลาทำการรูป `{days:{mon:[["09:00","18:00"]]}}` ไม่ใช่รูปที่เก็บจริง (`validateBusinessHours`: `days:[{d,open,close}]`) ⇒ `readBusinessHours` = null = "ไม่ได้ตั้ง" ⇒ off_hours ไม่เกิด
  - `S1.21-H-typing` บรรทัด 123/129: `internal.body` / `hoMsg.body` เป็น `string | null` ⇒ tsc แดง (next build ตรวจ scripts/*.mts)
- ใครได้/เสียสิทธิ์: แอปได้กล่องแชทลูกค้า (ตามคีย์เว็บ + D-2) · OWNER/MANAGER ตั้งกฎรับเรื่อง · ผู้ตอบได้เข้าเวร · ระบบ `system:routing`/`system:sla` มอบหมายได้เฉพาะคนที่ตอบได้ (owner_fallback = OWNER คนแรก)

## 8. หนี้
| เรื่อง | เหตุผล | ใบ |
|---|---|---|
| `GET …/[id]/contact` (การ์ด shark) · `inbox/attachments` · `inbox/settings` | ไม่อยู่ในสัญญา S1.21 (ตารางเอกสารเดิมมี) | ใบ UI แชท (S2.x) |
| rate limit เส้นอื่นนอกจาก reply | brief กำหนดเฉพาะ reply | S3 |
| assignIncoming ไม่ล็อก (คนกดรับพร้อมกฎ = คนเขียนทีหลังชนะ) | `assign()` เดิมเขียนตรง | ถ้าต้องการ: `assign` opts `onlyIfUnassigned` |
| ห้องที่เปิดใหม่หลัง RESOLVED ใช้ firstCustomerMessageAt เดิม ⇒ SLA นับจากครั้งแรก | ตาม brief (waitingMin) | ทบทวนเมื่อมีข้อมูลจริง |
| `ChatRateBucket` key `mobile:inbox:reply:<tenantId>:qcs121-b` ค้างหลังข้อสอบ (หมดหน้าต่าง 60 วิ · ร้านของข้อสอบถูกลบแล้ว) | ตัวจำกัดเดิมไม่มีตัวลบ | – |

## 9. คืนสภาพฐาน
ข้อสอบ `finally` ลบตามร้าน + user `qcs121-*` + pushDevice — รวมรอบที่ล้มกลางทาง (try/finally) · routing ไม่เขียนแถวนอกร้านของข้อสอบ ยกเว้น `sweepChatSla` อ่านทุกร้านใน QC (เขียนเฉพาะห้องที่ถึงเกณฑ์ภายใน 24 ชม.)

## 10. รอบ merge tip (5 พ.ย.)
- merge `session/secretary` e40fbba3 (ORACLE-EDIT R3/R4/typing · S1.12 รอบ 2 · secretary_b) → conflict 2 จุดใน `sendReply` (lookup ซ้ำ) = เอาของ S1.12 (`direction: "OUT"`) · diff `service.ts` เทียบ tip = เหลือเฉพาะ hunk S1.21 · `aiMetaOf` อ่าน `ai_roomId/ai_proposalId/ai_approvedBy` ตรงกับ `proposals.ts:1489`
- forced #2 ที่รันห่าง #1 แค่ 57 วิ: A-3 `rpN` 429 — ถัง rate limit `mobile:inbox:reply:<userId>` ของ user คงที่ `qcs121-b` ยังเต็มจาก A-5 ของรอบก่อน ⇒ เปลี่ยน key เป็น `<tenantId>:<userId>` (ต่อ Membership · ร้านใหม่ทุกรอบ = แยกถัง) · ผู้ใช้หลายร้าน = 60/นาที/ร้าน
