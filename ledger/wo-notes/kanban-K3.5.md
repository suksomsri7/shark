# K3.5 — เครื่องมือ AI ครบ 8 + ปุ่ม AI ในหลังการ์ด (builder note)

> สัญญา: `ledger/KANBAN-RUN.md` §K3.5 · ข้อสอบ `scripts/qc-kanban-k3.5.mts` (21 ข้อ — สัญญาเขียนว่า 20) · ภาพแบบ `ledger/design-kanban/03-card-back.png` (แถบขวา "ผู้ช่วย AI")
> สถานะ: **ผ่าน 21/21 · tsc 0 error · fitness 23/23 · regressions เขียวทุกชุดที่รันได้ · ภาพ 4 ใบ (failures 0) · ข้อมูล QC คืนสภาพครบ (การ์ดรวม 38)**

## 1. ผลรัน (ตัวเลขจริง)

| ด่าน | ผล |
|---|---|
| ข้อสอบ K3.5 | `JSON_SUMMARY {"total":21,"passed":21,"findings":[]}` |
| typecheck | `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit -p tsconfig.json` → 0 error |
| fitness | `JSON_SUMMARY {"total":23,"passed":23,"findings":[]}` (F2.1 ไม่มีเส้นใหม่ · F5.1 raw prisma ไม่เพิ่ม · F13.4 op ทุกตัวมีข้อสอบ · F13.5 docs ตรง generator) |
| ภาพ | `visual-kanban.mts 3.5` → `JSON_SUMMARY {"wo":"3.5","user":"owner","shots":[4 ใบ],"failures":0}` |

### regressions ที่รันแล้วเขียว (ทั้งหมดบน `.env.qc` · host `ep-plain-art`)
| ชุด | ผล |
|---|---|
| `qc-kanban-k1.14` | 15/15 |
| `qc-kanban-k1.15` | 30/30 |
| `qc-kanban-k2.12` | 13/13 |
| `qc-kanban-k3.2` | 19/19 |
| `qc-kanban-k3.1` | 20/20 |
| `qc-kanban-k1.8` | 18/18 |
| `qc-kanban-k1.10` | 16/16 |
| `qc-ai-skills` | 23/23 (ข้อสอบ S6.3 สั่งให้ builder รัน) |

🔴 **ไม่ได้รัน `qc-ai-kanban-board.mts`** โดยเจตนา — หัวไฟล์บรรทัดที่ 2 คือ `process.loadEnvFile(".env")` แล้ว
`prisma.tenant.create(...)` ⇒ เป็นชุดที่ **สร้างร้านทดสอบบน prod DB** ([[reference_shark_qc_suites_hit_prod_db]] · กติกาในใบสั่งงาน:
"ชุดที่แตะ prod ห้ามรัน — บันทึกชื่อไว้") · สิ่งที่ชุดนั้นครอบคือ kind รุ่นเก่า `kanban_create_board` ซึ่ง WO นี้ไม่ได้แตะ
(เส้นทาง legacy ใน `proposals.dispatch` ยังเหมือนเดิมทุกบรรทัด) · เปลี่ยนแปลงเดียวที่ไปถึงมันคือ **พารามิเตอร์ที่เพิ่มแบบ optional**
(`executeProposal(..., opts.userId?)` / `dispatch(..., userId?)` / `runKind(..., userId?)`) ⇒ ผู้เรียกเดิมที่ไม่ส่งมาได้ `null` เท่าของเดิม
**ขอให้ Fable รันชุดนี้ตอน `qc:all` ของรอบปิดเฟส**

## 2. ไฟล์ที่แตะ

**ใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/modules/kanban/ai.ts` | `summarizeCard` · `suggestChecklist` · `acceptChecklistSuggestion` · `draftReply` · `isKanbanAiConfigured` · prompt อังกฤษทั้ง 3 ชุดอยู่ท้ายไฟล์ที่เดียว |
| `src/lib/ai/kanban-op-from-chat.ts` | op `cards.fromChat` + ตัวปรับ (prepare) ของ tool `kanban_card_from_chat` — **อยู่ชั้น AI ไม่ใช่ในโมดูล** (เหตุผลข้อ 3.1) |
| `src/lib/ai/kanban-adapter.ts` | ชนิด `KanbanToolAdapter` / `KanbanToolCall` (แยกไฟล์เพื่อไม่ให้ import ย้อนกลับเป็นวงกลม) |
| `src/components/kanban/CardAi.tsx` | กลุ่ม "ผู้ช่วย AI" 3 ปุ่ม + กล่องข้อเสนอเช็คลิสต์ + กล่องร่างคำตอบ (ไม่มีอีโมจิทั้งไฟล์) |
| `prisma/migrations/20261009000000_kanban_v2_s/` | `KanbanComment.aiGenerated` + enum `KanbanActivityType.AI_SUGGESTED` (additive ล้วน · เขียนมือจาก `migrate diff` เพราะ `migrate dev` สั่ง reset QC — ดูข้อ 3.5) |

**แก้**
| ไฟล์ | ที่แก้ |
|---|---|
| `prisma/schema/kanban.prisma` | `KanbanComment.aiGenerated Boolean @default(false)` · enum `AI_SUGGESTED` |
| `src/lib/modules/kanban/cards.ts` | `descriptionToText()` (HTML → ข้อความล้วน) · `getCardFullDetail()` (แหล่งความจริงเดียวของ REST `cards.detail` + prompt ของ `ai.ts`) · `getCardDetail` เพิ่ม `aiAvailable` |
| `src/lib/modules/kanban/comments.ts` | `addComment(ctx, cardId, body, { aiGenerated })` · DTO เพิ่ม `aiGenerated` |
| `src/lib/modules/kanban/activity.ts` | สายรวมส่ง `aiGenerated` ของความเห็นต่อให้จอ |
| `src/lib/modules/kanban/activity-text.ts` | ประโยคไทยของ `AI_SUGGESTED` (`ให้ผู้ช่วย AI สรุปการ์ดนี้` / `เพิ่มเช็คลิสต์จากข้อเสนอของผู้ช่วย AI (n รายการ)`) |
| `src/lib/modules/kanban/types.ts` | `CardFullDetailDto` · `KanbanCommentDto.aiGenerated` · `CardDetailDto.aiAvailable` · `KanbanActivityKind += AI_SUGGESTED` |
| `src/lib/modules/kanban/api/ops/cards.ts` | op ใหม่ `cards.detail` (GET `/cards/{id}/detail`) · `cards.setDue` (POST `/cards/{id}/due`) · test `K3.5-S2.1` / `K3.5-S3.1` |
| `src/lib/modules/kanban/api/actor.ts` | 🐛 `kanbanCtxOf` แยกกรณี actor `user` (ดูข้อ 4 — บั๊กจริงที่ K3.5 เป็นชุดแรกที่เดินเส้นนี้) |
| `src/lib/modules/kanban/actions.ts` | `summarizeCardAction` · `suggestChecklistAction` · `acceptChecklistSuggestionAction` · `draftReplyAction` |
| `src/lib/ai/kanban-ops.ts` | รวม `AI_ONLY_OPS` เข้า `kanbanToolOps()` · ตัวปรับ `cards.detail`/`cards.setDue` (รับ `cardNo + boardName`) · payload ของข้อเสนอมีค่า "แบน" (`cardId`, `dueAt`, …) · summary ของตัวปรับ · `prepareCall` รับ `systemId` |
| `src/lib/ai/proposals.ts` · `src/lib/ai/actions.ts` · `src/app/api/mobile/proposals/confirm/route.ts` | ส่ง `userId` ของคนกดยืนยันต่อลงไปถึง `dispatchKanbanKind` |
| `src/lib/ai/skills.ts` | สกิล `tasks` += 3 ชื่อ · summary (อังกฤษ) เพิ่ม card detail / set due / create a card from a chat thread |
| `src/lib/ai/tools-kanban.ts` | `kanbanToolCount()` = ทุก tool · เพิ่ม `kanbanRestToolCount()` (เฉพาะตัวที่มี REST) |
| `src/components/kanban/CardBack.tsx` | แทน placeholder 3 ปุ่มด้วย `<CardAi>` · ส่ง `aiAvailable` · ตัวนับ `reloadKey` ให้ Timeline |
| `src/components/kanban/Comments.tsx` | ความเห็น `aiGenerated` = หัวแถว "ผู้ช่วย AI" + ไอคอน spark + "· สั่งโดย {ชื่อคนกด}" |
| `src/components/kanban/Timeline.tsx` | prop `reloadKey` · ความเห็นของ AI แก้ไม่ได้ (ลบได้) |
| `docs/api/KANBAN-API.md` + `.claude/skills/shark-kanban-api/references/endpoints.md` | regen จากทะเบียน (87 op) |
| `scripts/visual-kanban.mts` | step ใหม่ `scrollTo` · spec `"3.5"` (3 สเปค / 4 ภาพ) + บล็อกเตรียม/คืนสภาพ K3.5 |

## 3. การตัดสินใจที่ควรรู้

### 3.1 `cards.fromChat` ไม่มี endpoint REST (ตั้งใจ)
สัญญาเขียนว่า op นี้ต้องอยู่ที่ชั้น `src/lib/ai/*` ไม่ใช่ในโมดูล kanban (เพราะ executor ต้องเรียก `chat/task-from-chat`
และด่าน F2 ห้าม kanban → chat) · ทะเบียน REST คือ `KANBAN_OPS` ของโมดูลล้วน ๆ ⇒ op ตัวนี้จึงถูกต่อเข้า **เฉพาะทาง tool**
ผ่าน `AI_ONLY_OPS` ใน `kanban-ops.ts`
⇒ **REST op รวม 87 ตัว** (เพิ่ม 2: `cards.detail`, `cards.setDue`) · **AI tool รวม 23 ตัว** = op ของ REST ที่ประกาศ `tool` 22 ตัว
+ `kanban_card_from_chat` อีก 1 ตัวที่ไม่มี REST คู่กัน (ก่อน WO นี้: REST 85 · tool 20)
ผลข้างเคียงที่ยอมรับ: `docs/api/KANBAN-API.md` / `endpoints.md` / OpenAPI **ไม่มี** `POST /cards/from-chat`
(ผู้เชื่อมต่อภายนอกที่อยากทำแบบเดียวกันใช้ปุ่มในหน้าแชท) · ถ้า Fable อยากให้ขึ้น REST ด้วย ต้องเปิดเส้น
`kanban→chat` หรือทำ port/registry ให้โมดูลรับ implementation จาก composition root — ทั้งสองทางเกินขอบเขต WO นี้

### 3.2 payload ของข้อเสนอมีค่า "แบน" เพิ่มขึ้น
ข้อสอบ (S3.1/S4.1) อ่าน `payload.cardId` / `payload.conversationId` / `payload.title` ตรง ๆ แต่รูปเดิมคือ
`{opId, input, params, systemId}` ⇒ เพิ่ม `flatPayload()` ที่แผ่ path param (ตามชื่ออาร์กิวเมนต์ เช่น `cardId`) + ฟิลด์
ของ input ขึ้นระดับบนสุด **โดยไม่ทับ 4 คีย์เดิม** · ตัวที่ลงมือจริงยังเป็น `input`/`params` เท่านั้น
(`dispatchKanbanKind` ตรวจสคีมาซ้ำจากคู่นั้นเสมอ) ⇒ ข้อเสนอเก่าที่ค้างใน DB ยังกดยืนยันได้เหมือนเดิม

### 3.3 `kanban_card_detail` / `kanban_set_due` รับ `cardNo + boardName` ได้
คนพูดกับผู้ช่วยด้วย "การ์ด #128 ในบอร์ดงานร้าน" ไม่ใช่ cuid ⇒ ตัวปรับ `cardTargetAdapter()` แปลงให้ที่ชั้น AI ที่เดียว
สคีมาของ tool = `op.input.extend(CARD_TARGET_ARGS)` (ไม่ลอกสคีมาซ้ำ — ถ้า input ของ op เปลี่ยน tool เปลี่ยนตาม)

### 3.4 พฤติกรรมของ executor `cards.fromChat` ต่างจากปุ่มในหน้าแชท 1 จุด
ส่ง `link: { conversation: true, party: false, copyAttachments: false }` (แผงในหน้าแชทมีติ๊ก 3 ช่องให้คนเลือก แต่คนที่
กดยืนยันข้อเสนอเห็นแค่ประโยคสรุป) ⇒ ผลข้างเคียงที่เขาไม่ได้เลือก (สร้างผู้ติดต่อใหม่ใน CRM · ก๊อปไฟล์แนบทั้งห้อง)
ต้องเป็น "น้อยที่สุดที่ยังทำงานได้" = ลิงก์ห้องแชทกลับไปหาต้นเรื่องเท่านั้น

### 3.5 ไมเกรชันเขียนมือ ไม่ได้ใช้ `migrate dev`
`pnpm exec prisma migrate dev` บน QC ตอบว่า *"migration ... was modified after it was applied → We need to reset the public schema"*
(ไมเกรชันบัญชี 4 ใบถูกแก้หลัง apply มาก่อนหน้านี้) ⇒ **ห้ามรีเซ็ต** จึงทำแบบเดียวกับ `kanban_v2_r`:
`migrate diff --from-config-datasource --to-schema --script` → ตรวจ SQL ด้วยตา → เขียนเป็น `20261009000000_kanban_v2_s`
(ใส่ `IF NOT EXISTS` ทั้งสองคำสั่ง) → `prisma migrate deploy` ✅ · **prod จะลงตอน Vercel build ตามปกติ**

### 3.6 เครดิต AI ลงช่อง `CHAT_SUGGEST`
enum `AiCreditSource` ยังไม่มีช่องของบอร์ดงาน (เพิ่มค่า = ไมเกรชันที่สัญญาไม่ได้สั่ง) ⇒ ใช้กระเป๋าเดียวกับ K3.2
("ทีมงานใช้ AI ตอนทำงานกับลูกค้า") พร้อม `note: "ผู้ช่วย AI ในหลังการ์ด (K3.5)"` — ดู "หนี้" ข้อ 6.1

## 4. 🐛 บั๊กเดิมที่ WO นี้จับได้ (แก้แล้ว) — คนกดยืนยันข้อเสนอกลายเป็น VIEWER ทุกบอร์ด

`dispatchKanbanKind` ไม่เคยถูกข้อสอบชุดไหนเดินผ่านมาก่อน (`grep` เจอผู้เรียกทางเดียวคือ `proposals.ts`)
`userActor()` สร้าง `ApiActor` ที่ `scopes: []` แล้ว `kanbanCtxOf()` แปลง actor เป็น `KanbanActor` ด้วย
`kanbanActorForKey({ scopes: [] })` ซึ่งให้ `apiRole: "VIEWER"` **บนทุกบอร์ด** และ `boardRole()` เชื่อ `apiRole` ก่อนเสมอ
⇒ เจ้าของร้านกดยืนยัน "ย้ายการ์ด / มอบหมาย / ตั้งกำหนดส่ง" ที่ผู้ช่วยเสนอ จะถูกปฏิเสธ **ทั้งที่เป็น OWNER**
(อาการ: 403 "ไม่มีสิทธิ์" ทั้งที่หน้าจอกดปุ่มเดียวกันได้ปกติ)

แก้: `kanbanCtxOf()` แยกกรณี `actor.kind === "user"` → ประกอบ `KanbanActor` จาก **Membership จริงของคนกด**
(ไม่ตั้ง `apiRole` ⇒ เดินกติกาบทบาทบอร์ดปกติของ K1.3) · ข้อสอบ S3.2/S3.3 คุมทั้งสองทาง (ไม่มีสิทธิ์ = ถูกปฏิเสธ · OWNER = ผ่าน)

พ่วงด้วย: `proposals.executeProposal/dispatch/runKind` ส่ง `userId` ของคนกดต่อลงไป (เดิมไม่มีช่องส่ง ⇒ ประวัติของบอร์ด
บันทึก `actorUserId = null` = "ระบบทำเอง" ทั้งที่คนกด และ `cards.fromChat` ที่ต้องมีตัวตนคนจริงจะทำไม่ได้เลย)

## 5. 🐛 บั๊กที่ "ด่านภาพ" จับได้ (แก้แล้ว) — กดปุ่ม AI แล้วจอเงียบ

ภาพรอบแรก step `waitFor [data-testid=comment-ai-author]` **หมดเวลาแม้ตั้ง 150 วินาที** แต่ภาพที่ถ่ายได้กลับมีความเห็นของ
ผู้ช่วย AI อยู่ ⇒ ไม่ใช่ "โมเดลช้า" แต่เป็น: `Timeline.tsx` เก็บ `items` ของตัวเองที่โหลดจาก server และ **ไม่ได้เรนเดอร์ตาม
prop `comments`** หลังเรนเดอร์แรก (prop นั้นเป็นแค่ค่าเริ่มต้นกันบล็อกกะพริบ) · ความเห็นที่ `CardAi` เขียนผ่าน action ของ
ตัวเองจึงไม่โผล่จนกว่าผู้ใช้จะสลับแท็บ = "กดปุ่มแล้วไม่มีอะไรเกิดขึ้น"
แก้ด้วยตัวนับ `reloadKey` (CardBack ขยับเมื่อ `CardAi` เขียนความเห็นสำเร็จ → Timeline โหลดสายใหม่) · รอบถัดมา `failures: 0`
**นี่คือกรณีที่รายงานว่า "ผ่าน" ได้ทั้งที่ผู้ใช้จริงเห็นจอเงียบ ถ้าไม่ได้กดปุ่มจริงบน production build**

## 6. ภาพ (4 ใบ · `.qc-shots/kanban/3.5/`) — เทียบภาพ 03

| ไฟล์ | สิ่งที่เห็น |
|---|---|
| `card-ai-rail-desktop.png` | แถบขวา: ติดตาม › การ์ดนี้ › ทำต่ออัตโนมัติ › **ผู้ช่วย AI** (สรุปการ์ดนี้ · แตกเป็นเช็คลิสต์ · ร่างข้อความตอบลูกค้า — ไอคอน spark ทั้ง 3) › ฟิลด์กำหนดเอง › เก็บเข้าคลัง · **ลำดับ/คำ/ไอคอนตรงภาพ 03 ทุกตัว** |
| `card-ai-rail-mobile.png` | 390px — แถบขวาไหลลงล่างเต็มความกว้าง กลุ่ม "ผู้ช่วย AI" ยังครบ 3 ปุ่ม |
| `card-ai-summary-comment-desktop.png` | กด "สรุปการ์ดนี้" จริง (โมเดลจริง) → ความเห็นใหม่ขึ้นหัว **"ผู้ช่วย AI · สั่งโดย เจ้าของร้าน (KB QC) · เมื่อครู่"** + ไอคอน spark วงกลม · เนื้อสรุปไทยเก็บตัวเลขครบ (12 คน · 9/3 · 24–26 ต.ค. · 15,000 · 15:00) · toast "ผู้ช่วย AI เขียนสรุปไว้ในความเห็นแล้ว" — เทียบภาพ 03 บล็อกความเห็นที่หัวแถวเป็น "ผู้ช่วย AI" |
| `card-ai-checklist-proposal-desktop.png` | กด "แตกเป็นเช็คลิสต์" จริง → กล่องข้อเสนอในแถบขวา: หัวข้อหนา + รายการเรียงเลข + บรรทัด "ข้อเสนอของผู้ช่วย AI — ยังไม่ได้เพิ่มลงการ์ด" + ปุ่ม "เพิ่มเช็คลิสต์นี้" / "ไม่เอา" · เช็คลิสต์เดิมของการ์ดยัง 1/3 (ยังไม่มีชุดใหม่) · สายกิจกรรมมีบรรทัด "เจ้าของร้าน (KB QC) **ให้ผู้ช่วย AI สรุปการ์ดนี้**" |

**deviation ที่ยอมรับ (เทียบภาพ 03)**
1. ภาพแบบมีปุ่มเล็ก **"สร้างเช็คลิสต์จากสรุปนี้"** อยู่ใต้ความเห็นของ AI — ยังไม่ทำ (ทางเข้าเดียวคือปุ่ม "แตกเป็นเช็คลิสต์"
   ในแถบขวา ซึ่งอ่านทั้งการ์ดรวมสรุปอยู่แล้ว) → หนี้ข้อ 7.2
2. กล่องข้อเสนอ/ร่างคำตอบวางอยู่ **ในแถบขวาใต้ปุ่ม** (ภาพแบบไม่ได้วาดสถานะนี้ไว้เลย — เป็นสถานะใหม่ที่ §8.3 บังคับให้มี)

## 7. หนี้ / ข้อจำกัด

1. **เครดิต AI ลงช่อง `CHAT_SUGGEST`** — เจ้าของแยกบิล "ผู้ช่วยในบอร์ดงาน" ออกจาก "AI ในแชทลูกค้า" ยังไม่ได้
   (ต้องเพิ่มค่า enum `AiCreditSource.KANBAN_ASSIST` = ไมเกรชัน 1 บรรทัดใน WO ถัดไป) · ตอนนี้แยกได้จาก `note` เท่านั้น
2. **ปุ่ม "สร้างเช็คลิสต์จากสรุปนี้" ใต้ความเห็น AI** ตามภาพ 03 — ยังไม่มี (ดู deviation ข้อ 1)
3. **`cards.fromChat` ไม่มี REST** (ข้อ 3.1) — ถ้าจะให้มี ต้องตัดสินเรื่องเส้น `kanban→chat` ก่อน
4. **`draftReply` ยังไม่รู้จักบทสนทนาที่การ์ดผูกอยู่เป็นพิเศษ** — ส่งชื่อ/หัวข้อของลิงก์ (K3.1) เข้า prompt เป็นบริบท
   แต่ยังไม่ได้ดึง "ข้อความล่าสุดในห้องแชท" มาด้วย (ต้องผ่านเส้น kanban→chat เหมือนข้อ 3) ⇒ ร่างจากเนื้อการ์ดล้วน
5. **`suggestChecklist` คืนได้ถึง 10 ข้อ** — ภาพจริงรอบทดสอบได้ 9 ข้อ (ยาวกว่าที่ภาพแบบวาดไว้) · ยังไม่ได้จำกัดให้สั้นกว่านี้
   เพราะจำนวนขั้นควรมาจากเนื้องาน ไม่ใช่จากพื้นที่บนจอ · ผู้ใช้ลบทิ้งทีหลังได้
6. **ความเห็นของ AI ลบได้แต่แก้ไม่ได้** (ตั้งใจ — แก้ได้ = ปลอมคำพูดของ AI ได้) · ต่างจากหนี้ K2.12 ที่ความเห็นของ "กฎ" ยังแก้ได้

## 8. คืนสภาพข้อมูล QC (ตรวจแล้วด้วย probe หลังรันทุกอย่าง)

```
cardsTotal 38  (ป่าตอง 24 · ซ่อมบำรุง 11 · กะตะลับ 3)
aiComments 0 · aiActivities 0 · checklists 0 · chatSystems 0 · aiProposals 0
cardNoSeq: ป่าตอง 24 · กะตะ 6 · ซ่อมบำรุง 158 (spec ภาพคืนค่าให้เท่าก่อนถ่ายทุกครั้ง)
```
- ข้อสอบ K3.5 ลบเอง: การ์ดที่สร้าง + ความเห็น + เช็คลิสต์ + ลิงก์ + ระบบแชทชั่วคราว + คืน `AppSystem.settings` (สวิตช์การเชื่อมต่อ)
- spec ภาพ `"3.5"` ลบการ์ดตัวอย่างทั้งใบ + ความเห็นของผู้ช่วย AI + ประวัติ `AI_SUGGESTED` + คืน `cardNoSeq` ของบอร์ดซ่อมบำรุง
- ไม่มีข้อแย้งข้อสอบ (ผ่าน 21/21 โดยไม่ต้องแก้ข้อสอบเลย) · หมายเหตุเดียว: สัญญาเขียนว่า "20 ข้อ" แต่ไฟล์ข้อสอบมี 21 ข้อจริง
