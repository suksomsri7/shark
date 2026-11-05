# WO S1.14b — ตั๋ว server รวม (S1.14 follow-up · ก่อน S2.14/S3a)

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุม `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.14b` · 5 พ.ย. 2026 (UTC) · builder: เลน b
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.14b.md` (+ COMMON + RESOLUTIONS §N §S §T §U §V)
> ข้อสอบ: `scripts/qc-sec-s1.14b.mts` (22 ข้อ · commit test: 3e8728d82 · **แก้หลัง commit: ไม่**) · ไม่มี migration · ไม่แตะ `prisma/` · ไม่แตะตรรกะ `src/lib/modules/chat/**`

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร (ข้อในใบ) |
|---|---|---|
| `src/app/api/mobile/secretary/invites/pending/route.ts` | ใหม่ | ข้อ 1 · `userGate` · 30/นาที · `pendingInvitesForUser` → `{ items:[{inviteId, tenantName, role, expiresAt}] }` |
| `src/app/api/mobile/secretary/staff/invite/route.ts` | แก้ | ข้อ 2 · รับ `levels`/`chat`/`extraPermissions` (+ `permissions` เดิม) · แปลง `{}` → `permissionsForLevel` → `permissionsForChat` → รวม · 422 `bad_module`/`bad_level`/`sensitive_key{keys}` ก่อนสร้างใบ |
| `src/lib/staff/levels.ts` | แก้ | ข้อ 3 · `SENSITIVE_KEYS` (8 คีย์ W-12 · exact · ตัวพิมพ์เล็ก) ใน `isSensitiveKey` · **+ `export` ให้ `permissionsForChat` (base ปริยาย `{}`)** — ดู §4 ข้อ 1 |
| `src/lib/mobile/inbox-dto.ts` | แก้ | ข้อ 4 · `tags` (`parseTags`) ใน `conversationDto` (รายการ+ห้อง) · type `InboxConversationDetailDto` / `InboxConversationCan` / `InboxLinkedMemberDto` · pure `replyWindowEndsAtOf(hours, lastInAt)` |
| `src/app/api/mobile/inbox/conversations/[id]/route.ts` | แก้ | ข้อ 4 · `replyWindowEndsAt` (query ข้อความ IN ล่าสุดเฉพาะช่องทางที่มีหน้าต่าง) · `can{reply,assign,setStatus,linkCustomer}` จาก `can(c, …)` · `linkedMember{id,name,phoneMasked}` (`maskPhone` · เบอร์ว่าง ⇒ null) |
| `src/app/api/mobile/inbox/conversations/route.ts` | ไม่แก้ | `tags` มาจาก `conversationDto` ร่วม |
| `src/app/api/mobile/inbox/conversations/[id]/ai-suggest/route.ts` | ใหม่ | ข้อ 5 · gate `[REPLY]` · ห้องมองไม่เห็น 404 · 10/นาที · lib ปฏิเสธ ⇒ 200 `{ok:false, reason}` · options allowlist `{id, body, warn}` · throw ⇒ 500 + logOps |
| `src/app/api/mobile/inbox/conversations/[id]/reply/route.ts` | แก้ | ข้อ 6 · `suggestionId?` (≤80) · หลังได้ messageId (ไม่ใช่บันทึกภายใน) ⇒ ตรวจว่าร่างเป็นของห้องนี้ → `recordSuggestionOutcome` (try/catch) · คืน `suggestionOutcome` · ดู §4 ข้อ 2 (clientMessageId) |
| `src/app/api/mobile/inbox/conversations/[id]/task/route.ts` | ใหม่ | ข้อ 7 · gate `[REPLY]` · 30/นาที · `chatTaskButtonConfig` null ⇒ 404 `not_configured` · `createTaskFromChat` (บอร์ด/คอลัมน์ตามค่าตั้ง · link conversation+party · ไม่คัดลอกไฟล์แนบ) · ข้อความไทยของ lib ⇒ 422 `task_failed` · อื่น ⇒ 500 + logOps |
| `src/app/api/mobile/me/route.ts` | แก้ (ฟิลด์เดียว) | ข้อ 8 · `user.appleLinked: true \| null` (privaterelay) |
| `src/app/api/mobile/inbox/shift/route.ts` | แก้ | ข้อ 9 · `GET` gate `[READ]` → `{onDuty, onDutyAt}` |
| `apps/mobile/src/api/inbox.ts` | แก้ (type + ตารางเส้น) | `ConvItem.tags` · `ConvDetail` (replyWindowEndsAt/can) · `LinkedMember{phoneMasked, phone?(deprecated)}` · `SuggestRes` · `TaskFromChatRes` · `ShiftState` (GET+POST) · reply body `suggestionId?` · **PATH_ID เพิ่ม `inbox/conversations/[id]/task`** (ชนิดของ `inboxPostId` ต้องมีชื่อเส้นในตาราง) · ไม่แตะจอ |
| `docs/api/SECRETARY-API.md` | แก้ | ตาราง route จริงอยู่ไฟล์นี้: แถวใหม่ invites/pending · ai-suggest · task · GET shift + ฟิลด์ใหม่ /me · invite · list/detail · reply |
| `docs/modules/31-secretary.md` | แก้ | §5.23 `SENSITIVE_KEYS` + เชิญด้วยระดับ + `permissionsForChat` export · หมายเหตุใต้ตารางคีย์อ่อนไหว · §7 แถว inbox (ด่านเส้นใหม่) |

## 2. ผล
- oracle `qc-sec-s1.14b` forced #1 (06:4xZ ก่อน merge): `JSON_SUMMARY {"total":22,"passed":22,"failed":[],"skipped":[],"findings":[]}` exit 0
- regression (forced · ก่อน merge tip · เท่า baseline `sec-baseline-049df880b.txt`): qc-sec-s1.14 13/13 · s1.21 19/19 · s1.22 14/14 · s1.25 19/19 · qc-mobile-chat exit 0 · qc-mobile-authz-hotfix 12/12 · qc-chat-ai-suggest 44/44 · qc-chat-staff-perms 49/49 · qc-chat-v2-composer 54/54 · context 53/53 · icons 35/35 · list 41/41 · quickreply 28/28 · realtime 26/26 · room 42/42 · shell 26/26 · voice 50/50 (exit 0 ทุกตัว)
- typecheck เว็บ (`NODE_OPTIONS=--max-old-space-size=9000 ISO_MEM=10500M bash scripts/iso.sh pnpm exec tsc --noEmit`) exit 0 · 0 error · มือถือ (`apps/mobile` `npm run typecheck` · heap 5632) exit 0 (รอบแรก heap ปริยาย OOM 134 — ไม่ใช่ error ของโค้ด)

## 3. หนี้ (ข้อ 11 · ไม่ทำในใบนี้ → S3a)
| หนี้ | เหตุ |
|---|---|
| `AiMessage.clientMessageId` คอลัมน์ (secretary_c) แทนแถว ChatRateBucket | ต้องมี migration (A.8 ห้ามแตะ prisma/) |
| step-up OTP ก่อนลบบัญชี | นอกขอบเขต |
| platform-actor undo | นอกขอบเขต |
| สวิตช์ suspend จริง (ตอนนี้ = revoke) | ต้องมีคอลัมน์สถานะ |
| `plans[]` ใน `rooms/[id]` (DTO-REQ-2 ของ S2.4) | นอกขอบเขต |
| `appleLinked` = null สำหรับบัญชีที่ผูก Apple ด้วยอีเมลจริง | ยังไม่มีคอลัมน์ identity (ข้อ 8) |
| จอ `customers/[id]/info.tsx` ยังเรียก `maskPhone(member?.phone)` ⇒ ตอนนี้ไม่แสดงเบอร์ (server ไม่ส่ง `phone`) | ห้ามแตะจอในใบนี้ — S2.14 เปลี่ยนเป็น `member.phoneMasked` (type มีแล้ว) |
| จอ `customers/[id]/index.tsx` อ่าน `r.suggestionId ?? r.options[0].id` / `r.body` (รูปเดิม) | ใช้ได้กับรูปใหม่ (`options[0].id/body`) แต่ควรเช็ก `ok` · ส่ง `suggestionId` ตอน reply — S2.14 |

## 4. ข้อที่ทำต่างจากใบ / คำถามให้ผู้คุมตัดสิน
1. **`permissionsForChat` ไม่ได้ export** ใน levels.ts (ใบให้แก้แค่ SENSITIVE_KEYS+isSensitiveKey) — เติม `export` + ค่าปริยาย `base = {}` (ไม่เปลี่ยนตรรกะ) เพื่อใช้ตัวเดียวกับ `setStaffLevels` ไม่เขียนซ้ำใน route
2. **reply ไม่มี clientMessageId** — oracle S-2 ส่ง `{systemId, body, suggestionId}` ไม่มี `clientMessageId` (เดิมบังคับ) ⇒ ทำ `clientMessageId` เป็น optional **เฉพาะเมื่อมี `suggestionId`** แล้วใช้คีย์กันซ้ำ `sugg:<suggestionId>` (ส่งร่างเดียวกันซ้ำ = duplicate แถวเดิม) · ไม่มีทั้งคู่ ⇒ 422 invalid เหมือนเดิม · ทางเลือก: ORACLE-EDIT S-2 ให้ส่ง clientMessageId แล้วคืนให้บังคับเหมือนเดิม
3. **ด่าน ai-suggest = `chat.message.send`** ตามใบ · เว็บ (`suggestReplyAction`) ใช้ `chat.ai.suggest` — แอปจึงเปิดร่างได้กว้างกว่าเว็บ (STAFF ที่ตอบได้แต่ไม่มี `chat.ai.suggest`) · ถ้าต้องตรงเว็บ: ด่าน `[REPLY]` + เช็ก `chat.ai.suggest` เพิ่ม (oracle S-1 ใช้ STAFF ที่ไม่มีคีย์นี้ ⇒ ต้อง ORACLE-EDIT ด้วย)
4. **429 ของ `/api/mobile/inbox/**`** — `limited()` ใน `inbox/_shared.ts` (ไม่อยู่ในไฟล์ที่ใบให้แก้) คืน `{error:"rate_limited", message}` + หัว `Retry-After` **ไม่มี `retryAfterSec` ใน body** ต่างจาก secretary (R-S1.14g) · เส้นใหม่ของ inbox ใช้ `limited` ตามแบบเดิม · ขออนุญาตแก้ `limited` 1 บรรทัดหรือให้ใบถัดไป
5. **GET shift เลือกแถวเปิด "แรก" (`onDutyAt asc`)** ไม่ใช่ล่าสุด — ให้ตรงกับที่ `setShift` (POST) คืน (แถวแรกถูกเก็บ ที่เหลือปิด) ⇒ GET/POST เวลาเดียวกัน · ปกติมีแถวเปิดแถวเดียว
6. **`sensitive_key` ตรวจทุกคีย์ที่ส่งมา ไม่ดูค่า** (`{"pos.staff.manage": false}` ก็ 422) ตามตัวอักษรใบ · และใช้กับ `permissions` เดิมด้วย (backward-compat: ไคลเอนต์เก่าที่ส่งคีย์อ่อนไหวผ่าน permissions จะโดน 422 — ตั้งใจตาม W-12)
7. `linkedMember.phoneMasked` = `null` เมื่อสมาชิกไม่มีเบอร์ (ไม่ส่ง "xxx-xxx-xxxx" ปลอม) · RESOLUTIONS §U พูดถึง "เบอร์เต็มเฉพาะมี booking.customer.phoneFull" — ใบนี้สั่ง "ไม่มี phone เต็ม" จึงไม่ทำเส้นเบอร์เต็ม
8. `replyWindowEndsAt` คำนวณจาก adapter ตามใบ (ตอนนี้ registry มีแค่ LINE/WEBCHAT ⇒ null เสมอ) · ตาราง ChatConversation มีคอลัมน์ `replyWindowExpiresAt` (FB/IG/WA) อยู่แล้ว — เมื่อมี adapter Meta ควรพิจารณาใช้คอลัมน์นั้น
9. docs: ตาราง route ของเส้นมือถืออยู่ที่ `docs/api/SECRETARY-API.md` (31-secretary §2.3 = ตารางจอของแอป) — แก้ที่ SECRETARY-API + §5.23/§7 ของ 31-secretary

## 5. ผลก่อนส่ง (A.11)
- merge `session/secretary` @ e663d01c9 (SHA ตรง · ledger ล้วน · ไม่ชน) → 7f45d7a11
- oracle หลัง merge: forced #1 07:03Z / forced #2 07:03Z / unforced: `JSON_SUMMARY {"total":22,"passed":22,"failed":[],"skipped":[],"findings":[]}` exit 0 ×3 (cleanup ใน finally ของข้อสอบ)
- fitness: มี env (qc-sec.sh) 53/53 exit 0 · `env -u DATABASE_URL` 53/53 exit 0
- trailer commit: `Co-Authored-By: Claude <noreply@anthropic.com>` (ไม่มีชื่อโมเดล · R-S2.13e) — commit แรกแก้ข้อความด้วย amend ก่อน merge (ยังไม่ push)

## 6. รอบ 2 (มติผู้คุม RESOLUTIONS §X · 860b424cb)
- merge `session/secretary` @ 860b424cb (SHA ตรง · RESOLUTIONS §W.2/§X + ORACLE-EDIT `qc-sec-s1.14b.mts` STAFF ได้ `chat.ai.suggest`) → 190c38106 · ไม่ชน
- **R-S1.14b-a** `…/[id]/ai-suggest/route.ts`: ด่าน `[AI_SUGGEST]` = `{ module:"chat", action:"chat.ai.suggest" }` (ค่าคงที่ในไฟล์ route — `chat/guard-keys.ts` ไม่มีคีย์นี้และห้ามแตะ chat/**) · S-3 (มีแค่ read) ยัง 403
- **R-S1.14b-c** `inbox/_shared.ts` `limited()`: body + `retryAfterSec` (1 บรรทัด · header เดิม) · ทำเพิ่มในไฟล์ของใบ: ถัง 429 ของ `reply/route.ts` (ไม่ผ่าน `limited`) ใส่ `retryAfterSec` ด้วย ⇒ inbox/** รูป 429 เดียวกันทุกเส้น
- **R-S1.14b-e** `[id]/route.ts`: `replyWindowEndsAt = isoOrNull(conversation.replyWindowExpiresAt)` · ลบ query ข้อความ IN + import adapter · ลบ `replyWindowEndsAtOf` ออกจาก inbox-dto.ts
- docs: SECRETARY-API (ด่าน ai-suggest · replyWindowEndsAt · กติกา 429 ข้อ 3) · 31-secretary §7
- ผล: `qc-sec-s1.14b` forced #1 `{"total":22,"passed":22,"failed":[],"skipped":[],"findings":[]}` exit 0 · forced #2 เหมือนกัน exit 0 · `qc-sec-s1.21` 19/19 exit 0 · `qc-chat-ai-suggest` 44/44 exit 0 · tsc เว็บ (heap 9000) exit 0 · 0 error · fitness มี env 53/53 · `env -u DATABASE_URL` 53/53
- ข้อ Q2/Q4/export/PATH_ID/docs/shift/phoneMasked = ผู้คุมรับแล้ว (§X) · ส่งต่อ S2.14 ตาม §X

## 7. รอบ 3 (ผู้ตรวจ Y · มติ RESOLUTIONS §X.2 · d9212c2a9)
- merge `session/secretary` @ d9212c2a9 (SHA ตรง · ORACLE-EDIT V-5 + S-4) → e90223cb9 · ไม่ชน
- **R-S1.14b-f (MAJOR-2)** `staff/invite/route.ts` `buildPermissions`: `isWildcardKey` (`*` หรือลงท้าย `.*`) ⇒ นับเป็น `sensitive_key` (422 · ไม่สร้างใบ) · ไม่แตะ `isSensitiveKey`
- **R-S1.14b-g** `reply/route.ts`: `suggestionId` ต้องเป็นของห้อง+ระบบ+ร้านนี้ (`suggestionInConv`) ⇒ ไม่ใช่ ⇒ 422 `bad_suggestion` ก่อนส่ง (ก่อน rate-limit/sendReply) · `isInternal:true` ไม่ได้คีย์ `sugg:` (ไม่มี clientMessageId ⇒ 422 invalid เดิม) · `outcomeOf` ไม่ตรวจซ้ำแล้ว (ตรวจก่อนส่ง)
- **R-S1.14b-h** `task/route.ts`: error ที่มี `status` 403/404 (KanbanForbiddenError/KanbanNotFoundError — duck-typed ไม่ import) ⇒ 403 `forbidden` / 404 `not_found` (ข้อความไทยของ lib หรือข้อความปริยายไทย) · ไทยอื่น ⇒ 422 `task_failed` · ระบบ ⇒ 500
- docs: SECRETARY-API (invite wildcard · reply bad_suggestion/isInternal · task 403/404) · 31-secretary §5.23 (wildcard)
- ผล: `qc-sec-s1.14b` forced #1 `{"total":24,"passed":24,"failed":[],"skipped":[],"findings":[]}` exit 0 · forced #2 เหมือนกัน exit 0 · `qc-sec-s1.25` 19/19 exit 0 · `qc-chat-ai-suggest` 44/44 exit 0 · tsc เว็บ (heap 9000) exit 0 · 0 error · fitness มี env 53/53 · `env -u DATABASE_URL` 53/53
