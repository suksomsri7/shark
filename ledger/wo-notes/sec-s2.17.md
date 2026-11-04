# WO S2.17 + S2.18 + S2.19 (ชุด S2-17) — K1 รายการลูกค้า · K2 ห้องแชทลูกค้า · K3 ข้อมูลลูกค้า · K4/K5 ช่องทาง ตอบเร็ว แจ้งเตือน กฎรับเรื่อง เวร

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-c` branch `wip/sec-s2.17` (ฐาน = ทิปผู้คุม ba1f72f5 + merge `session/secretary` 040ed86e ตาม COMMON A.11) · 2026-11-04/05 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.17.md` (+ COMMON + RESOLUTIONS §F §M §N/§N.2 §O §P R-S1.25a §Q) · ภาพ K1 = `sec-k.jpg` หน้า 1 · K2 = หน้า 2 · K3 = หน้า 3 · K4 = หน้า 4 · K5 = หน้า 5 (+ `sec-dark-k.jpg` หน้าเดียวกัน)
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.17.json scripts/qc-sec-screen.mts` (**ไม่แก้ spec/oracle**) · สัญญาเซิร์ฟเวอร์: `docs/api/SECRETARY-API.md` แถว `/api/mobile/inbox/**` + `src/lib/mobile/inbox-dto.ts` (S1.21 merge แล้ว · อ่านอย่างเดียว) · `secretary/notify` + `POST secretary/rooms {context}` อ่านจาก `wip/sec-s1.14` (ยังไม่ merge)

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่ + ผู้ตรวจ 1 คน (3 แชทไม่ปน · PII)) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/src/api/inbox.ts` | ใหม่ (แทนชื่อ `src/lib/inbox-api.ts` ในใบ) | ตาราง PATH/PATH_ID ของ `/api/mobile/inbox/**` (+ `secretary/notify` · `member/search`) แบบเดียวกับ `src/api/secretary.ts` · type ตาม inbox-dto · `call()` = api() เดิม + เก็บ `Retry-After` (`InboxError.retryAfterSec`) + รับ FormData · `inboxUpload` · `maskPhone` · `replyWindowHours` · `isUnanswered` · ระบบแชทที่เลือก (K1 → K2/K3) · **ไม่มีเส้นห้องเลขา / mobile/chat/send** |
| `apps/mobile/app/(app)/customers/index.tsx` | เขียนใหม่ (แทน SecSkeleton) | K1 (ดู §2) |
| `apps/mobile/app/(app)/customers/[id]/index.tsx` | เขียนใหม่ | K2 (ดู §3) · `Composer` = ทางส่งถึงลูกค้าทางเดียว |
| `apps/mobile/app/(app)/customers/[id]/info.tsx` | เขียนใหม่ | K3 (ดู §4) |
| `apps/mobile/app/(app)/secretary/settings/customers.tsx` | แก้ (ต่อท้าย) | ส่วน B7 เดิมไม่แตะ · เพิ่ม `InboxSettings` K4/K5 ใต้ "เวลาทำการ" (ดู §5) |
| `apps/mobile/src/components/customers/parts.tsx` | ใหม่ | `ChannelBadge` · `Avatar` (ข้ามคำนำหน้า คุณ/ป้า/ลุง/พี่/น้อง) · เวลาไทย (`hhmm`/`useListTime`) · `StaffSheet` (มอบหมาย/ส่งต่อ/คนช่วย) · `ConfirmSheet` |
| `apps/mobile/src/components/customers/MessageBubble.tsx` | ใหม่ | ฟองแสดงผลอย่างเดียว: ลูกค้า/เรา/ส่งโดย Shark (meta.ai)/บันทึกภายใน @ชื่อ/ข้อความระบบ (🙋 🔁 `system:`)/สติกเกอร์/รูป/ไฟล์/เสียง/✕ ส่งใหม่ (เรียก onResend ของจอ) |
| `apps/mobile/src/components/airy/InputBar.tsx` | แก้ (เพิ่ม prop) | `plusTestID` `plusDisabled` `left` `multiline` `maxLength` `inputStyle` — ไม่ใส่ = เหมือนเดิม |
| `apps/mobile/src/components/airy/Tabs.tsx` | (merge) | testID ต่อแท็บ — S2.5 เพิ่มแบบเดียวกันแล้ว ใช้ของ session |
| `apps/mobile/src/components/secretary/SecTopBar.tsx` | แก้ | ซ่อนไอคอน "ลูกค้า" เมื่อ `useCustomersAccess()` = false |
| `apps/mobile/src/api/secretary.ts` | แก้ | `PostMap["secretary/rooms"].body.context?` · `refreshZoneBadges`: `inbox/unread` 403 ⇒ `setCustomersAccess(false)` · store `useCustomersAccess` (ล้างตอนเปลี่ยนผู้ใช้/กิจการ) |
| `apps/mobile/src/theme/{light,dark}.ts` | แก้ (เพิ่มคีย์) | `channel.*` (สีป้ายช่องทาง) · `cust.*` (แถบเขียว · บันทึกภายใน · Shark ม่วง · รอคน) |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +168 คีย์ `cust.*` (union กับ session · th/en 824 คีย์เท่ากัน · en ไม่มีอักษรไทย) |
| `apps/mobile/qc/fixtures/secretary/s2.17.json` | ใหม่ | 2 ระบบแชท · 6 ห้อง · ห้อง x1 10 ข้อความครบชนิด + ร่าง Shark · mock เขียนทุกเส้น |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` · `s2.7.json` | แก้ | expect ของ /customers* = testID จริง + mock เส้น inbox (ถ่ายชุดเดิมซ้ำได้ unmocked 0) |
| `scripts/sec-ui-inventory.json` | แก้ | +59 แถว S2.17 |

## 2. K1 `/customers`
- `GET inbox/systems` (ระบบ · ช่องทาง · unread · canReply) → ระบบ >1 = ชิปสลับระบบ (`cust-system-chip`) · 403 ⇒ จอ `cust-denied` + `setCustomersAccess(false)` (ไอคอนโซนลูกค้าหายทุกโซน) · canReply=false ⇒ ป้าย "ดูได้อย่างเดียว"
- `GET inbox/conversations?systemId&status&channel&assignee&q&before` → `{items, nextBefore}` · แท็บ: ทั้งหมด (ไม่กรอง) · ยังไม่ตอบ (OPEN ไม่มีคนรับ หรือ staffUnreadCount>0 — กรองในแอปเพราะเซิร์ฟเวอร์ OR ไม่ได้) · ของฉัน `assignee=me` · ปิดแล้ว `status=RESOLVED` · ชิปช่องทาง `channel=` · ค้นหา `q=` (หน่วง 400 ms) · หน้าต่อไป `before=<nextBefore>` (`cust-more`)
- แถว: อวตาร · ป้ายช่องทาง · ชื่อ · แท็ก (ถ้ามี `tags`) · "รอคน" · ตัวอย่าง · เวลา (วันนี้ HH:MM / เมื่อวาน / ว/ด เวลาไทย) · ยังไม่อ่าน · อวตารผู้ดูแล · "✨ Shark ร่างคำตอบไว้แล้ว" (aiDraft) · ไม่มีคนรับ = `cust-row-unassigned` + "ยังไม่มีคนรับ · รอ N นาที" (waitingMin) + "กฎ: …" (กฎแรกที่เปิด+ตรงช่องทางจาก `GET inbox/routing` · ROUND_ROBIN แสดงชื่อคนเข้าเวร)
- ตัวนับหัวจอ/แท็บ = นับจากหน้าแรกของแท็บทั้งหมด (ไม่ใช่ยอดจริงทั้งร้าน — หนี้ §8) · ดึงลง + poll 15 วิ (จออยู่ + AppState active)

## 3. K2 `/customers/[id]` — 3 แชทไม่ปน
- `GET inbox/conversations/[id]?systemId` (s จาก K1 · deep link ไม่มี s = ระบบแรก) · `POST …/read {lastReadMessageId}` ครั้งแรก + ทุกข้อความใหม่ · poll 5 วิ (focus + AppState · ออฟไลน์ถอยห่าง ×2 ถึง 60 วิ) · ไม่มี EventSource · ก่อนหน้า `before=` (`cust-room-more`)
- หัว: ชื่อ · ช่องทาง · ผู้ดูแล · "ตอบได้อีก N ชม." (FB/IG) · ปุ่ม 👥 (`cust-room-helper` → K3 `?open=helpers`) · ปุ่มข้อมูล (`cust-room-info`) · แถบเขียวถาวร `cust-room-banner` · ไม่มีคนรับ ⇒ "รับเรื่อง" (`cust-room-claim` → `POST …/assign {assigneeUserId: ตัวเอง}` · 409 = ข้อความไทยของเซิร์ฟเวอร์ + โหลดใหม่)
- ฟอง: `MessageBubble` (§1) · ป้าย Shark จาก `meta.ai` = "ส่งโดย Shark (ผู้ช่วย AI) · อนุมัติโดย<ชื่อ> เวลา" (approvedBy = userId ผู้อนุมัติ = senderUserId ของแถว → senderName) · รูป → ตัวดูเต็มจอ (`cust-image-viewer`) · ไฟล์/เสียง → `Linking.openURL` (ไม่มีไลบรารีเสียงในแอป · ห้ามติดตั้ง)
- **`Composer`** (ในไฟล์จอ — ทางส่งถึงลูกค้าทางเดียวของแอป): `run()` → `post()` → `POST inbox/conversations/[id]/reply {systemId, body?, attachments?, isInternal, clientMessageId}` · กันกดซ้ำด้วย ref · ล้ม = รหัสเดิมเมื่อเนื้อหาเดิม / รหัสใหม่เมื่อแก้ · 429 ⇒ รอ `Retry-After` (≤ 60 วิ) แล้วลองใหม่ **1 ครั้ง** รหัสเดิม · `duplicate` ⇒ แจ้ง "ส่งไปแล้ว" · `deliveryFailed` ⇒ ข้อความของเซิร์ฟเวอร์ · การ์ดร่างส่ง/แก้ และ "ส่งใหม่" ฟอง ✕ (`clientMessageId = resend:<messageId>`) ใช้ `run()` เดียวกัน
- สวิตช์บันทึกภายใน `cust-internal-toggle` · ตอบเร็ว `GET inbox/quick-replies` (กรองช่องทาง) → `POST quick-replies/[id]/apply {conversationId}` → ใส่ช่องพิมพ์ (ไม่ส่ง) · แนบ `expo-image-picker` (รูป/วิดีโอ · มีในแอปแล้ว) → ตรวจ ≤ 10 MB → `POST inbox/attachments` multipart `file` → ส่งพร้อมข้อความถัดไป
- หน้าต่าง 24 ชม. FB/IG หมด ⇒ แถบ `cust-room-window` + ตอบลูกค้าไม่ได้ (บันทึกภายในได้) · canReply=false ⇒ ไม่มีช่องพิมพ์/รับเรื่อง/การ์ดร่าง
- การ์ดร่าง Shark: เมื่อ `conversation.aiDraft` ⇒ `POST …/ai-suggest` ครั้งเดียวต่อการเปิด · **route นี้ยังไม่มีบนเซิร์ฟเวอร์** ⇒ 404 = ไม่มีการ์ด (prod วันนี้ไม่เห็นการ์ด) · fixture mock route เพื่อถ่ายภาพ · ปุ่ม "สั่งเลขาแก้ใบเสนอราคา" ของแบบ **ไม่ทำ** (ห้องเลขาเปิดจาก K3 เท่านั้น)

## 4. K3 `/customers/[id]/info`
- ติดต่อ (`cust-info-contact`): ชื่อ · ช่องทาง · ชื่อสมาชิก · เบอร์ **ปิดกลางในแอป** (`maskPhone` → 081-xxx-5678)
- ในระบบ SHARK (`cust-info-shark`): สมาชิกที่ผูก → `/member/<id>` (จอ 1.0) · ผูก/เปลี่ยน (`GET member/search?q` → `POST …/contact {customerId}`) · ถอด (`{customerId:null}`) · ดีล/เอกสาร: ไม่มีใน DTO (หนี้)
- ห้องนี้: ผู้ดูแล (`StaffSheet` → `…/assign`) · คนช่วย (`…/helpers {helperUserId, note?}`) · สถานะ (`…/status`) · แท็ก (อ่านอย่างเดียว) · ส่งต่อ (`…/handoff {toUserId, reason}` เหตุผลบังคับ · 409 = ข้อความในชีต + โหลดใหม่) · ปิดห้อง (ชีตยืนยัน → status RESOLVED · ห้องปิด = "เปิดอีกครั้ง")
- รายชื่อคน = `GET inbox/staff?systemId&unitId=<ห้อง>` (ตอบได้ในหน่วยนั้น) · ตัดตัวเอง/ผู้ดูแลปัจจุบัน/คนช่วยเดิมตามชีต
- **สั่ง Shark เรื่องลูกค้านี้** (`cust-info-ask-shark`) = ชีตพิมพ์คำสั่ง → `secPost("secretary/rooms", {instruction, clientMessageId, context:{chatConversationId, contactId}})` → `/secretary/room/<roomId>` · คำสั่งไม่ถูกเติมชื่อ/เบอร์ลูกค้า · 402/403/429 = ข้อความไทย
- สร้างงานบอร์ด (`cust-info-task`): ไม่มี route Bearer (เว็บเป็น server action) ⇒ **ซ่อน** (`TASK_ROUTE = null`) + หนี้

## 5. K4/K5 `/secretary/settings/customers` (ต่อท้าย B7 — ภาพบนสุดของหน้าเท่าเดิม ภาพคู่ B7 ยังตรง)
- ช่องทางที่เชื่อม `GET inbox/connections` (type/displayName/status เท่านั้น) · ลิงก์ไปเว็บ · ตอบเร็ว (รายการ + "เพิ่มบนเว็บ") · แจ้งเตือนแชท `Segment` ALL/ASSIGNED/OFF → `PUT secretary/notify {kind:"inbox", mode}` (ล้ม = คืนค่าเดิม)
- K5 กฎรับเรื่อง `GET inbox/routing` → แก้ในร่าง (สวิตช์ · ขึ้น/ลง · ช่องทาง · ลบ · เพิ่ม 3 โหมด) → บันทึก `PUT inbox/routing {systemId, rules}` (แทนทั้งชุด · ลำดับ = order) เฉพาะ OWNER/MANAGER (บทบาทอื่นอ่านอย่างเดียว · เซิร์ฟเวอร์ตรวจซ้ำ 403) · SLA อ่านอย่างเดียว · เข้าเวรวันนี้ (onDuty) + สวิตช์ของฉัน `POST inbox/shift {onDuty}` (เฉพาะ canReply)
- inbox/systems 403 ⇒ ไม่แสดงส่วน K4/K5

## 6. ผลข้อสอบ (ทิป a5b3d5b5 · หลัง merge session/secretary 040ed86e)
- spec s2.17 forced #1: `JSON_SUMMARY {"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec s2.17 forced #2: `JSON_SUMMARY {"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` exit 0 (R ×4 · X-1…X-4 · U-1 (ภาพคู่ K1/K2/K3 สว่าง+มืด · K4/K5 NO_PAIR) · M-1 typecheck mobile 0 · D-1/D-2 fitness มี env / ไม่มี env)
- spec forced ใบก่อน (หลัง merge · shots ใหม่): s2.2 11/11 · s2.4 7/7 · s2.5 9/9 · s2.7 16/16 · s2.10 10/10 — exit 0 ทั้งหมด
- `qc-sec-s2.1` forced 14/14 exit 0 · `qc-sec-s2.12` forced 13/13 exit 0
- regression unforced (`qc-sec.sh` + gate lock · SHARK_AI_MOCK=1) เทียบ `ledger/qc-baseline/sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix `{"total":12,"passed":12,"findings":[]}` exit 0 (= baseline)
- mobile typecheck 0 (แยก + M-1 ทุกรอบ) · pre-commit fitness ผ่านทุก commit

## 7. ภาพ
คำสั่ง:
```
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4725 ROUTES=/customers,/customers/x1,/customers/x1/info,/secretary/settings/customers FIXTURE=apps/mobile/qc/fixtures/secretary/s2.17.json node apps/mobile/qc/shoot-sec.mjs --both
bash scripts/parity-sec.sh k 1|2|3 apps/mobile/qc/shots-sec/<route>[-dark].png apps/mobile/qc/shots-sec/<route>[-dark]-k<n>-pair.png [--dark]
cp apps/mobile/qc/shots-sec/s2.17-interaction/README-click.mjs.txt <scratch>/s217-click.mjs && cp <8x8 png> /root/qc-shark-mobile-sec-c/qc-photo-s217.png && bash scripts/iso.sh node <scratch>/s217-click.mjs $PWD/apps/mobile/qc/fixtures/secretary/s2.17.json /root/qc-shark-mobile-sec-c/qc-photo-s217.png $PWD/apps/mobile/qc/shots-sec/s2.17-interaction
```
(รูปทดสอบต้องอยู่ใต้ /root — chromium แบบ snap มองไม่เห็น /tmp ของเครื่อง · วางหลัง export เพราะ rsync --delete ล้างสำเนา)
- ภาพคู่:
  - K1 ↔ `sec-k.jpg` หน้า 1: `apps/mobile/qc/shots-sec/customers-k1-pair.png` · มืด ↔ `sec-dark-k.jpg` หน้า 1: `apps/mobile/qc/shots-sec/customers-dark-k1-pair.png`
  - K2 ↔ `sec-k.jpg` หน้า 2: `apps/mobile/qc/shots-sec/customers-x1-k2-pair.png` · มืด: `apps/mobile/qc/shots-sec/customers-x1-dark-k2-pair.png`
  - K3 ↔ `sec-k.jpg` หน้า 3: `apps/mobile/qc/shots-sec/customers-x1-info-k3-pair.png` · มืด: `apps/mobile/qc/shots-sec/customers-x1-info-dark-k3-pair.png`
- ภาพเดี่ยว: `apps/mobile/qc/shots-sec/customers{,-dark}.png` · `customers-x1{,-dark}.png` · `customers-x1-info{,-dark}.png` · `secretary-settings-customers{,-dark}.png` (ส่วน B7 บนสุด · ไม่เปลี่ยนจากเดิม) — summary ok · overflow false · unmocked [] · missing [] ทั้ง 8
- K4/K5 (ภาพเดี่ยวจากการเลื่อนจริง): `apps/mobile/qc/shots-sec/s2.17-interaction/k4-channels-quick-notify.png` (↔ `sec-k.jpg` หน้า 4) · `apps/mobile/qc/shots-sec/s2.17-interaction/k5-routing.png` + `apps/mobile/qc/shots-sec/s2.17-interaction/k5-shift.png` (↔ หน้า 5)
- กดจริง `apps/mobile/qc/shots-sec/s2.17-interaction/` (ผลดิบ `result.json`): `k2-unassigned-claim.png` · `k2-internal-on.png` · `k2-attached.png` · `k2-image-viewer.png` · `k3-helper-sheet.png` · `k3-handoff-409.png` · `k3-close-confirm.png` · `k3-link-sheet.png` · `k3-ask-shark.png` · `k1-denied.png`

### ผลกดจริง (result.json)
- K1: แถว 5 + ไม่มีคนรับ 1 · หัวจอ "LINE 4 · เว็บแชท 2 · ยังไม่ตอบ 2 · ของฉัน 1" · ยังไม่ตอบ = 2 แถว · ของฉัน `?systemId=cs1&assignee=me` · ปิดแล้ว `?systemId=cs1&status=RESOLVED` · ค้นหา `q=สม` · แตะแถวไม่มีคนรับ → `/customers/x2?s=cs1`
- รับเรื่อง: `POST x2/read {lastReadMessageId:n1}` · `POST x2/assign {"systemId":"cs1","assigneeUserId":"u-qc-owner"}` + "รับเรื่องแล้ว…" · 409 ⇒ "ห้องนี้มีคนรับหรือย้ายไปแล้ว"
- K2: ฟอง in 5 · out 1 · ai 1 · internal 1 · system 2 · sticker 1 · image 1 · audio 1 · file 1 · ✕ส่งใหม่ 1 · ป้าย "ส่งโดย Shark (ผู้ช่วย AI) · อนุมัติโดยคุณสุข 9:57" · read `{lastReadMessageId:m10}` · ai-suggest 1
- ตอบ: `POST x1/reply {"systemId":"cs1","body":"เครดิต 45 วันได้ค่ะ","isInternal":false,"clientMessageId":"c-…"}` · POST ทั้งหมดของจอ = read · ai-suggest · reply · **`secretary/rooms` = 0**
- 429: แจ้ง "ส่งถี่เกินไป จะลองส่งอีกครั้งใน 1 วินาที" · 2 POST รหัสเดียวกัน ห่าง ~1.0 วิ · ช่องพิมพ์ว่างหลังสำเร็จ · 429 ซ้ำ ⇒ 2 POST แล้วหยุด + ข้อความของเซิร์ฟเวอร์ · กดส่งซ้ำ = รหัสเดิม (4 POST รหัสเดียว)
- บันทึกภายใน: placeholder เปลี่ยน · `{"body":"@ก้อง ช่วยดูห้องพักที","isInternal":true,…}` · ตอบเร็ว: `POST quick-replies/q2/apply {"systemId":"cs1","conversationId":"x1"}` → ช่องพิมพ์ = body (ไม่มี reply เพิ่ม) · ตอบเร็ว FB-only ถูกกรอง (4/5)
- การ์ดร่าง: แก้ → ช่องพิมพ์ = ร่าง + การ์ดหาย · ส่ง → reply body = ร่าง `isInternal:false` + การ์ดหาย · ส่งใหม่ ✕ → `clientMessageId:"resend:m7"`
- แนบ: เลือกไฟล์ → `POST inbox/attachments` 1 ครั้ง multipart · ชิปแนบ 1 · ส่ง → `attachments:[{url,mimeType:"image/png",fileName,sizeBytes,width,height}]` · ตัวดูรูปเปิด/ปิดได้
- K3: ปุ่ม 👥 → `/customers/x1/info?s=cs1&open=helpers` ชีตเปิดเอง · `POST helpers {"helperUserId":"u-qc-nam","note":"ช่วยดูเรื่องห้องพัก"}` · ส่งต่อ 409: body `{"toUserId":"u-qc-2","reason":"ลูกค้าถามเรื่องห้องพัก"}` → ข้อความในชีต + GET ห้อง 2→3 · มอบหมาย `{"assigneeUserId":"u-qc-kong"}` · สถานะ PENDING · ปิดห้อง: ก่อนยืนยันไม่มี RESOLVED → ยืนยัน `{"status":"RESOLVED"}` · แท็ก "ดีล" · ติดต่อ "081-xxx-5678" · ปุ่มสร้างงานบอร์ด 0 · ผูก `member/search?q=สม` → `{"customerId":"mem1"}` · ถอด `{"customerId":null}`
- สั่ง Shark: `POST secretary/rooms {"instruction":"สรุปประวัติการซื้อของลูกค้าคนนี้","clientMessageId":"m-…","context":{"chatConversationId":"x1","contactId":"ct1"}}` → `/secretary/room/r-cust1` · reply POST = 0
- K4/K5 (OWNER): `PUT inbox/routing` 3 กฎ (เปิดกฎ OWNER/LINE + เลื่อนขึ้น ⇒ order ใหม่) · `POST inbox/shift {"onDuty":true}` · `PUT secretary/notify {"kind":"inbox","mode":"ASSIGNED"}` · หน้าไม่มี accessToken/channelSecret/webhookKey · STAFF: ไม่มีปุ่มบันทึก/เพิ่มกฎ + "ตั้งได้เฉพาะเจ้าของร้านหรือผู้จัดการ"
- ไม่มีสิทธิ์ (inbox 403): `cust-denied` 1 · ไอคอนลูกค้า 0 (เลขา 1) · ในโซนเลขาเมื่อ inbox/unread 403: ไอคอนลูกค้า 0 · ดูได้อย่างเดียว (canReply false): ป้าย readonly · ช่องพิมพ์ 0 · การ์ดร่าง 0 · ไม่ยิง quick-replies

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| K1 | มีชิปสลับระบบแชท 2 ระบบ · ไม่มีชิป "Facebook · เร็ว ๆ นี้" | fixture 2 ระบบตามใบ · ชิปช่องทาง = ช่องทางที่เชื่อมจริงของระบบ |
| K1 | ตัวนับหัวจอ = นับจากหน้าที่โหลด | เซิร์ฟเวอร์ไม่ส่งยอดรวมต่อช่องทาง (หนี้) |
| K1 | กฎของแถวไม่มีคนรับ = รายชื่อคนเข้าเวรทั้งหมด (แบบ "→ น้ำ" คนเดียว) | เซิร์ฟเวอร์ไม่บอกคนถัดไปของการวน |
| K2 | ภาพเลื่อนไปท้ายห้อง (10 ข้อความ) · การ์ดร่างอยู่ท้ายไทม์ไลน์ | ห้อง x1 มีข้อความครบชนิดตามใบ · ร่างเป็นของข้อความล่าสุด |
| K2 | การ์ดร่างไม่มีปุ่ม "สั่งเลขาแก้ใบเสนอราคา" | 3 แชทไม่ปน: ห้องเลขาเปิดจาก K3 เท่านั้น |
| K2 | มีปุ่ม 🔒 ในช่องพิมพ์ · ป้าย "อ่านแล้ว" ไม่มี | ใบสั่ง (สวิตช์บันทึกภายใน) · DTO ไม่มีสถานะอ่านของลูกค้า |
| K3 | เป็นหน้าเต็ม (แบบ = ชีตบน K2) · ไม่มีแถว CRM ดีล/ใบเสนอราคา · ไม่มีปุ่ม "สร้างงานบอร์ด" · ปุ่มล่าง = ส่งต่อ + สั่ง Shark + ปิดห้อง · มีปุ่มผูก/ถอดสมาชิก | route แยก `/customers/[id]/info` ตาม S2.1 · DTO มีแค่ linkedMember · ไม่มี route task-from-chat · ใบสั่ง |
| K4 | เป็นส่วนต่อท้ายหน้า B7 (หัวหน้าเดิม "คุยกับลูกค้าแทนร้าน") · ไม่มีการ์ด "ให้ Shark เสนอคำตอบทุกข้อความ" · ไม่มี "ข้อความวันนี้ N" | ใบสั่ง "ขยายหน้าของ S2.7" · ไม่มีค่าตั้ง/ตัวนับนี้ใน API |
| K5 | กฎมีปุ่มขึ้น/ลง/ลบ/ช่องทาง + ปุ่มเพิ่ม 3 โหมด + บันทึก · ไม่มีแถว "นอกเวลาทำการ → Shark ตอบก่อน" · SLA อ่านอย่างเดียว | `PUT routing` แทนทั้งชุด · นอกเวลาอยู่ใน B7 · ไม่มีเส้นแก้ SLA |
| ทุกจอ | ตัวอักษร/ปุ่มใหญ่กว่าแบบตามสัดส่วน | R-UI1 |

## 8. หนี้ / คำขอ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| **PII**: `GET inbox/conversations/[id]` ส่ง `linkedMember.phone` เต็ม (แอปปิดกลางเอง) | inbox-dto/route ไม่ mask (เทียบ member/search ที่ส่ง phoneMasked) — เสนอ DTO-REQ `phoneMasked` ตามสิทธิ์ `booking.customer.phoneFull` | S1.21 fix-forward (ผู้คุมตัดสิน) |
| route `POST inbox/conversations/[id]/ai-suggest` ไม่มี · `…/reply` (strict) ไม่รับ `suggestionId` ⇒ ไม่มี `recordSuggestionOutcome` | การ์ดร่างซ่อนใน prod จนมี route · fixture mock route ไว้ถ่ายภาพ | S1.14/S1.22 |
| `tags` ไม่อยู่ใน ConversationDto · ไม่มีเส้นแก้แท็ก · "รอคน" แสดงเมื่อเซิร์ฟเวอร์ส่ง `tags` | หนี้ §N (M-2) | S1.21 |
| สร้างงานบอร์ดจากแชท: ไม่มี route Bearer | ปุ่มซ่อน (`TASK_ROUTE`) | ใบเซิร์ฟเวอร์ภายหลัง |
| ดีล/เอกสารใน "ในระบบ SHARK" | DTO ไม่มี | DTO ภายหลัง |
| ตัวนับต่อช่องทาง/แท็บ = จากหน้าที่โหลด | ไม่มีเส้นนับ | `inbox/settings`/count ภายหลัง |
| ข้อความเสียง = เปิดลิงก์ (ไม่เล่นในแอป) | ไม่มี expo-av/expo-audio · ห้ามติดตั้ง | S3 |
| แนบได้เฉพาะรูป/วิดีโอ (ไม่มี document picker) | ไม่มีแพ็กเกจ | S3 |
| `Toggle`/สวิตช์บนเว็บ QC ไม่มี `aria-checked` | ตรวจด้วย body ของ POST แทน (เหมือน S2.10) | — |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §7 → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.17.json pnpm exec tsx scripts/qc-sec-screen.mts`
