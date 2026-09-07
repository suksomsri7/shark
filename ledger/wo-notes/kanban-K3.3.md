# K3.3 — การ์ดเกิดจากที่อื่น (bridges) · โน้ตผู้ทำ

> สถานะ: **โค้ดครบตามสัญญา · ข้อสอบ 11/12 ที่รันได้ · ติดบั๊กของตัวข้อสอบเองที่ S8 (ดู "ข้อแย้งข้อสอบ")**
> เครื่อง: worktree `/root/projects/shark-kanban` branch `session/kanban` · ไม่มี migration (ไม่ได้แตะ Prisma schema)

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/platform/kanban-bridges.ts` **(ใหม่)** | สะพานขาเข้า 6 ตัว + `sweepUnattendedChats` — อ่านโมดูลต้นทางด้วย prisma (composition root) เขียนบอร์ดงานผ่าน facade `links.createCardFromExternal` + `moves.moveCard` เท่านั้น |
| `src/lib/outbox-consumers.ts` | เพิ่ม `compose(base, extra)` + `kanbanBridge(name)` (dynamic import กันวงกลม) · ต่อสะพานท้าย handler เดิมของ `forms.submission.received` · `approval.request.submitted/approved/rejected` · `account.document.approved` · `account.invoice.paid` · `pos.sale.voided` · **ลงทะเบียน `hr.leave.submitted` ใหม่** |
| `src/lib/modules/hr/service.ts` | `requestLeave` ยิง event ใหม่ `hr.leave.submitted` (key `hr.leave.submitted#{leaveId}`) |
| `src/lib/core/outbox.ts` | เพิ่ม `emitOutboxOutsideTx()` (เคอร์เนล) — ให้โมดูลที่เขียนผ่าน `tenantDb()` ยิง event ได้โดยไม่ต้องลาก raw prisma เข้าโมดูล (ดู §6 หนี้) |
| `src/lib/automation/labels.ts` | `AUTOMATION_EVENTS` + `{ value: "hr.leave.submitted", label: "เมื่อพนักงานยื่นใบลา" }` |
| `src/lib/webhooks/labels.ts` | คอมเมนต์ชี้ว่า `hr.leave.submitted` สมัครฮุคได้แล้ว (มาจาก spread ของ `AUTOMATION_EVENTS` — ห้ามประกาศซ้ำ ไม่งั้นช่องติ๊กซ้ำ 2 แถว) |
| `src/app/api/cron/hourly/route.ts` | เรียก `sweepUnattendedChats(new Date())` แบบ best-effort + คืน `kanbanChatCards` |
| `src/components/kanban/IntegrationsSettings.tsx` | เขียนใหม่แบบ data-driven — **6 สวิตช์เปิดได้จริง** (+ ช่อง "นาทีที่ค้าง" และ "ยอดขั้นต่ำ (บาท)") · เหลือ "การ์ดจากอีเมล" เป็น "เร็ว ๆ นี้" (K3.9) |
| `src/lib/modules/kanban/types.ts` | `BoardCardDto.sourceKind: "APPROVAL" \| "HR_LEAVE" \| "POS_SALE" \| null` |
| `src/lib/modules/kanban/service.ts` | `sourceKindOf(sourceKey)` + ใส่ค่าใน `toBoardCardDto` |
| `src/components/kanban/Card.tsx` | ชิปที่มาต่อยอด K1.13: `SOURCE_KIND_LABEL` (จากคำขออนุมัติ/จากใบลา/จากบิลยกเลิก) + `data-testid="card-source"` · **ไม่มีอีโมจิทั้งไฟล์** |
| `scripts/visual-kanban.mts` | spec `"3.3"` (2 สเปค × 2 อุปกรณ์ = 4 ภาพ) + บล็อกเตรียมข้อมูล + `wipeK33Cards()` + คืนสภาพใน `restoreSeed()` |

**ไม่ได้แตะ**: `prisma/schema/**` (ไม่มี migration) · `scripts/qc-kanban-k3.3.mts` (ข้อสอบ) · `scripts/fitness.mts` (ไม่ต้องเพิ่มเส้น — สะพานอยู่นอก `src/lib/modules/**`)

---

## 2. ผลข้อสอบ K3.3

```
JSON_SUMMARY {"total":12,"passed":11,"findings":["CRASH"]}
```

ผ่านทุกข้อที่รันถึง:
`S1.1 ✅ S1.2 ✅ S2.1 ✅ S2.2 ✅ S3.1 ✅ S4.1 ✅ S4.2 ✅ S5.1 ✅ S5.2 ✅ S6.1 ✅ S7.1 ✅`
แล้ว **CRASH ที่โค้ดเตรียมข้อมูลของ S8** (บรรทัด 122 ของข้อสอบ) ⇒ S8.1 / S8.2 / S9.1 / S9.2 ไม่ได้ถูกประเมิน

### 🔴 ข้อแย้งข้อสอบ (S8 — ต้องให้ Fable แก้ oracle)

**อาการ**: `scripts/qc-kanban-k3.3.mts:122` สร้าง `ChatConversation` ใบที่ 2 ด้วย `contactId` **ตัวเดียวกัน** กับใบแรก (ใช้ `contact.id` ทั้ง 3 ห้อง: `stale` / `fresh` / `assigned`) → Prisma โยน `P2002`

**หลักฐาน 1 — สคีมาประกาศไว้ตรง ๆ** (`prisma/schema/chat.prisma` ท้าย `model ChatConversation`):
```
// ⚠️ "1 contact = 1 conversation active" บังคับ 2 ชั้น:
//   (2) partial unique index (raw SQL หลัง db push):
//       CREATE UNIQUE INDEX chat_conv_active ON "ChatConversation" ("contactId") WHERE status <> 'RESOLVED';
```

**หลักฐาน 2 — index มีจริงบน DB QC** (`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='ChatConversation'`):
```
chat_conv_active :: CREATE UNIQUE INDEX chat_conv_active ON public."ChatConversation"
                    USING btree ("contactId") WHERE (status <> 'RESOLVED'::"ChatConversationStatus")
```

**หลักฐาน 3 — reproduce ตรง ๆ** (probe ชั่วคราวของ builder · ลบไฟล์แล้ว):
```
REPRO: ห้องที่ 2 ของ contact เดียวกัน → PrismaClientKnownRequestError
       Invalid `prisma.chatConversation.create()` invocation | Unique constraint failed on the fields: (`"contactId"`)
```

**ข้อเสนอแก้ oracle (แก้บรรทัดเดียวกัน 3 จุด)**: แยก `ChatContact` ต่อห้อง เช่น
```ts
const mkContact = async (name: string) => {
  const c = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE",
    externalUserId: `qc-k33-${name}-${Date.now()}`, displayName: name } });
  made.contacts.push(c.id); return c.id;
};
// stale ต้องคง displayName = "ลูกค้ารอคำตอบ" (S8.1 เช็ค /ลูกค้ารอคำตอบ/ ในชื่อการ์ด)
```
แล้วใช้ contact คนละใบกับ `stale` / `fresh` / `assigned` (ที่เหลือของ S8 ไม่ต้องแก้)

**พิสูจน์ว่าโค้ดฝั่ง builder ผ่าน S8.1 แล้ว** — รัน probe ที่จำลอง S8 เป๊ะแต่แยก contact:
```
SWEEP: { s1: 1, s2: 0, n: 1,
         title: 'ลูกค้ารอคำตอบ: ลูกค้ารอคำตอบ',
         desc: '<p>ขอราคาคอร์สหน่อยครับ</p>',
         sourceType: 'CHAT', board: true, col: true, link: 1, chatCards: 1 }
```
(ห้อง 5 นาที = ไม่สร้าง · ห้องที่มีคนรับ = ไม่สร้าง · รันซ้ำ = 0 · ลิงก์ `CHAT_CONVERSATION` 1 แถว · การ์ด CHAT ทั้งร้าน = 1 ใบ)

**S8.2 / S9.1 / S9.2 ตรวจด้วยเงื่อนไขเดียวกับ oracle เป๊ะ (static)**:
```
S8.2: true      (hourly route มี sweepUnattendedChats · brSrc มี kanban/links + kanban/integrations · ไม่มี ": any")
S9.1: true      (ฟอร์ม/อนุมัติ/ใบลา/บิลยกเลิก/เอกสาร/นาที/ยอดขั้นต่ำ + testid kanban-integrations ครบ)
S2.2 handlers: 7 true   (≥6 และทุกตัว getIntegrations|integrationsFor มาก่อน prisma. ตัวแรก)
S9.2: .qc-shots/kanban/3.3 มี .png 4 ใบ (≥2)
```
⇒ คาดว่าหลัง Fable แก้ oracle จะได้ **15/15** โดยไม่ต้องแก้โค้ดเพิ่ม

### ⚠️ ความเปราะของ S5.2 (ไม่ใช่บั๊ก แต่ควรรู้)
S5.2 ตั้งอยู่บนสมมติฐานว่า **บอร์ดป่าตองไม่มีคอลัมน์ `isDoneColumn`** — วันนี้จริงตาม DB QC
(ป่าตอง: `กล่องงานเข้า · รอทำ · กำลังทำ · รอตรวจ · เสร็จแล้ว` ไม่มีตัวไหนติดธง)
แต่ `scripts/seed-kanban-qc.mts:178` (แก้ 7 ก.ย. K2.F) สั่ง
`updateMany({ boardId: { in: [patong, maint] }, name: { in: ["เสร็จแล้ว","เสร็จ"] }, data: { isDoneColumn: true } })`
⇒ **ถ้าใครรัน seed ใหม่ ป่าตองจะมีคอลัมน์เสร็จ แล้ว S5.2 จะแดงทันที** (การ์ดจะถูกย้ายตามสัญญา)
ถ้าอยากให้ทน ควรให้ S5.2 ใช้บอร์ดที่ไม่มีคอลัมน์เสร็จจริง ๆ (กะตะ) หรือปิดธงชั่วคราวแล้วคืน

---

## 3. tsc / fitness / regressions

| อย่าง | ผล |
|---|---|
| `tsc --noEmit -p tsconfig.json` | **0 error** |
| `scripts/fitness.mts` | **23/23** (F2.1 53/56 เส้น — ไม่ได้เพิ่มเส้นใหม่ · F5.1 คงที่ 45 ไฟล์) |
| `qc-kanban-k3.2` | 19/19 |
| `qc-kanban-k3.1` | 20/20 |
| `qc-kanban-k2.9` | 26/26 |
| `qc-kanban-k2.11` | 30/30 |
| `qc-kanban-k1.13` | 16/16 |
| `qc-kanban-notify` | 12/12 |
| `qc-ai-kanban-board` | 3/3 |
| `qc-chat-v2-composer` | 54/54 |
| `qc-acc-v2-pos-lines` | 87/87 |

### ชุดที่ **ไม่ได้รัน** เพราะหัวไฟล์ `process.loadEnvFile(".env")` (= DB prod)
`qc-hr.mts` · `qc-hr-attendance.mts` · `qc-hr-leave-booking.mts` · `qc-hr-payadjust.mts` · `qc-hr-roster.mts` ·
`qc-approval.mts` · `qc-approval-edit.mts` · `qc-approval-wiring.mts` ·
`qc-form.mts` · `qc-forms-notify.mts` ·
`qc-pos-account.mts` · `qc-pos-closeday.mts` · `qc-pos-coupon.mts` · `qc-pos-inventory.mts` · `qc-pos-products.mts` · `qc-pos-register.mts` ·
`qc-booking-deposit.mts` · `qc-booking-hours-hr.mts` · `qc-ai-proposals.mts`
(อ้าง `reference_shark_qc_suites_hit_prod_db` — เปิดหัวไฟล์ดูก่อนรันทุกครั้ง)
🔴 **ชุดที่ควรให้ Fable รันบน env ปลอดภัย**: `qc-hr*` (แตะ `requestLeave` ตรง ๆ) และ `qc-approval*` / `qc-forms-notify` / `qc-pos-*` (consumer ถูกห่อด้วย `compose`)
พฤติกรรมเดิมไม่ควรเปลี่ยน: `compose` เรียก handler เดิม **ก่อน** เสมอ และ handler เดิมพังยังโยนต่อเหมือนเดิม (สะพานอยู่ใน try/catch แยก)

---

## 4. event ใหม่ลงทะเบียนครบ 3 ที่ (ยืนยันด้วย grep)

```
$ grep -rn "hr.leave.submitted" src/ | grep -v kanban-bridges
src/lib/modules/hr/service.ts:      type: "hr.leave.submitted",
src/lib/modules/hr/service.ts:      idempotencyKey: `hr.leave.submitted#${l.id}`,
src/lib/automation/labels.ts:  { value: "hr.leave.submitted", label: "เมื่อพนักงานยื่นใบลา" },
src/lib/webhooks/labels.ts:  // 🔴 K3.3 — `hr.leave.submitted` … ประกาศอยู่ที่ AUTOMATION_EVENTS (spread ไว้ข้างบน)
src/lib/outbox-consumers.ts:  "hr.leave.submitted": withAutomation(compose(async () => {}, kanbanBridge("onLeaveSubmitted"))),
```
- **consumer** ✅ `outbox-consumers.ts`
- **AUTOMATION_EVENTS** ✅ `automation/labels.ts`
- **WEBHOOK_EVENTS** ✅ โดย `WEBHOOK_EVENTS = [...AUTOMATION_EVENTS, …]` — **ตั้งใจไม่ประกาศซ้ำ** ตามคอมเมนต์เตือนในไฟล์นั้นเอง ("ประกาศซ้ำ = หน้าตั้งค่าฮุคมีช่องติ๊ก 2 แถวต่อ event เดียว")
  ยืนยันด้วย oracle S1.1 (เช็ค `read(automation/labels) + read(webhooks/labels)`) ✅ และ `qc-kanban-k2.9` 26/26 (ตัวสร้างกฎอ่าน `KANBAN_AUTOMATION_EVENTS` แยก จึง dropdown บอร์ดงานยังเหลือ 8 ตัวเท่าเดิม)

---

## 5. ภาพ (4 ใบ · `.qc-shots/kanban/3.3/`) — **เปิดดูครบทุกใบแล้ว**

| ไฟล์ | เห็นอะไร |
|---|---|
| `integrations-six-switches-desktop.png` | ตั้งค่า › การเชื่อมต่อ — สวิตช์ติ๊กครบ 6 ตัว: สร้างงานจากแชท (บอร์ด "ซ่อมบำรุงอุปกรณ์" / คอลัมน์ "แจ้งเข้า" / **นาทีที่ค้าง = 30**) · การ์ดจากฟอร์ม (บอร์ด+คอลัมน์) · การ์ดติดตามคำขออนุมัติ (บอร์ด) · ปิดการ์ดเมื่อเอกสารบัญชีอนุมัติ/จ่ายแล้ว (ไม่มีบอร์ด + บรรทัดอธิบาย "ใช้กับการ์ดที่ผูกเอกสารไว้แล้วในทุกบอร์ด") · การ์ดหาคนแทนเมื่อมีใบลา (บอร์ด) · การ์ดตรวจสอบบิลยกเลิก (บอร์ด + **ยอดขั้นต่ำ (บาท) = 1000**) · แถวเส้นประ "การ์ดจากอีเมลที่ส่งเข้าบอร์ด — เร็ว ๆ นี้" · ไม่มีอีโมจิ ไอคอนมาจาก KanbanIcon |
| `integrations-six-switches-mobile.png` | 390px — บล็อกเดียวกัน เรียงเป็นคอลัมน์เดียว ช่องเลือกไม่ล้น ตัวหนังสือไม่ตัดคำผิด |
| `cards-source-chips-desktop.png` | บอร์ดซ่อมบำรุง คอลัมน์ "แจ้งเข้า" มีการ์ดที่ระบบเปิดให้ 5 ใบ ชิปที่มาต่างกันครบ: **จากฟอร์ม** (`ฟอร์ม: ฟอร์มจองทริป (ภาพ K3.3) — คุณนิดา ทองดี` + ชิป 🔗1) · **จากคำขออนุมัติ** (`คำขออนุมัติ: ใบสั่งซื้อ ฿25,000`) · **จากใบลา** (`หาคนแทน: พี่ก้อง ช่างซ่อม ลาป่วย 3 ต.ค.–4 ต.ค.`) · **จากบิลยกเลิก** (`ตรวจสอบบิลยกเลิก R-1042 ฿2,500`) · **จากแชท** (`ลูกค้ารอคำตอบ: คุณสมชาย (บริษัท เอบีซี)`) — การ์ดใบฟอร์มเกิดจากการยิง `consumers["forms.submission.received"]` จริง |
| `cards-source-chips-mobile.png` | 390px — ชิปที่มายังอ่านออกครบทุกใบบนการ์ดแนวตั้ง |

---

## 6. หนี้ / ข้อจำกัด / deviation ที่ขอให้ Fable รับทราบ

1. **`emitOutboxOutsideTx()` ตัวใหม่ในเคอร์เนล** — จำเป็นเพราะ `hr/service.ts` เขียน DB ผ่าน `tenantDb(ctx)` ทั้งไฟล์
   - ส่ง `tenantDb(ctx)` เข้า `emitOutbox` ตรง ๆ **ไม่ผ่าน tsc**: `DynamicClientExtensionThis<…>` ไม่ assignable กับ `Prisma.TransactionClient` (ชนที่ `$transaction`) — ลองแล้ว error TS2345
   - ลาก `prisma` ดิบเข้า `hr/service.ts` ก็ไม่ได้: fitness **F5.1 แดงทันที** (46 > baseline 45) — และผิดคำสั่ง "raw prisma ให้ทำใน platform"
   - ⚠️ **ไม่ atomic กับแถวใบลา** (คอมเมนต์กำกับไว้แล้ว) — พลาดแล้วแค่ "การ์ดหาคนแทนไม่เกิด" ใบลายังอยู่ในระบบ HR · **ห้ามเอาไปใช้กับ event ที่ผูกเงิน/เอกสารบัญชี**
2. **`WEBHOOK_EVENTS` ไม่ได้ประกาศ `hr.leave.submitted` ซ้ำ** (มาจาก spread) — ตามคอมเมนต์เตือนในไฟล์ ไม่ใช่การข้ามสัญญา
3. **มอบหมายการ์ดใบลา**: สัญญาบอกให้ใช้ MANAGER ที่ `unitAccess` ครอบ unit ของระบบ HR (`AppSystemUnit`) — แต่ oracle สร้าง `AppSystemUnit` โดย**ไม่ส่ง `tenantId`/`type` ที่ schema บังคับ** และห่อ `.catch(() => null)` ⇒ แถวนั้นไม่เกิดจริง
   ⇒ สะพานจึง **fallback ไปใช้สาขาของบอร์ดปลายทาง** เมื่อระบบต้นทางไม่ได้ผูก unit ไว้ (ตรรกะ: "สาขาของงานนี้") — S6.1 ผ่านด้วยทางนี้ · ถ้า Fable อยากให้เดินทาง `AppSystemUnit` จริง ต้องแก้ oracle ให้สร้างแถวนั้นสำเร็จก่อน
4. **`onApprovalDecided` ใช้สวิตช์ `cardFromApproval.enabled` เป็นด่าน** (ไม่ดูบอร์ด) — ปิดสวิตช์แล้วผลอนุมัติจะไม่ไปแปะการ์ดเก่าอีก ตั้งใจให้ "ปิดแล้วเงียบจริง"
5. **ความเห็นของระบบเขียนแถว `KanbanComment` ตรงที่ composition root** — `comments.addComment` บังคับผู้เขียนเป็นคนที่ล็อกอิน + EDITOR ของบอร์ด (สะพานไม่มีคน) จึงลงชื่อ `card.createdById` → ตกไปที่ OWNER คนแรก แบบเดียวกับ `automation.ts#writeAutomationComment` · **ไม่ยิง `kanban.comment.added`** โดยตั้งใจ (กันกฎที่ฟัง "มีความเห็นใหม่" วิ่งใส่ตัวเอง)
6. **`closeCard` ใช้ `moveCard(..., force: true)`** — คอลัมน์เสร็จที่ตั้งเพดาน WIP ไว้ ไม่ควรบล็อกการปิดงานอัตโนมัติ (ถ้า Fable ไม่เห็นด้วย เอา `force` ออกได้ ไม่กระทบข้อสอบ)
7. **`sourceKind` ของ DTO** อ่านจาก prefix ของ `sourceKey` (`approval:` / `hrleave:` / `possale:`) ไม่ได้เพิ่มคอลัมน์ — สัญญาเขียนว่า "ชิปจาก sourceType" แต่ sourceType ตัวเดียว (`AUTOMATION`) แยกใบลา/อนุมัติ/บิล ไม่ได้ · **ตาราง K2.1 (`TableRowDto`) ยังไม่ได้ต่อชิปนี้** (หนี้เล็ก)
8. **REST op / AI tool ของสะพาน** ยังไม่มี (สัญญาไม่ได้ขอ) — ค้างอยู่กับหนี้ K3.2 (`integrations.get/set`) ที่ K3.F/K3.5 จะเก็บ
9. `cardFromEmail` ยังปิดตายเป็น "เร็ว ๆ นี้" รอ K3.9

---

## 7. คืนสภาพข้อมูล QC — ตรวจแล้วครบ

หลังรันข้อสอบ + ภาพ + regressions ทั้งหมด (query ตรงบน `.env.qc`):
```
cards 38                                   ← เท่า seed (3 บอร์ด)
systems [{"type":"KANBAN","name":"บอร์ดงาน","settings":{}}]   ← settings กลับเป็นก้อนว่าง สวิตช์ปิดหมด · ไม่มีระบบชั่วคราวค้าง
forms 0  submissions 0
chatConv 0  chatContact 0
posSale 0  hrEmp 0  hrLeave 0
approvalReq 0  policies 0
outbox pending 0
cards with sourceKey 0                     ← ไม่มีการ์ดที่สะพาน/ภาพสร้างค้างไว้
```
เซิร์ฟเวอร์ QC (พอร์ต 3215) **ปิดแล้ว** · probe ชั่วคราวของ builder (`scripts/_k33-*.mts`) ลบแล้ว · ไม่ได้ `git add`/commit/push อะไรเลย
