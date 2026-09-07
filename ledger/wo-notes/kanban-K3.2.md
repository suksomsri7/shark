# K3.2 — สร้างงานจากแชท (builder note)

> สัญญา: `ledger/KANBAN-RUN.md` §K3.2 · ข้อสอบ `scripts/qc-kanban-k3.2.mts` (19 ข้อ) · ภาพแบบ `ledger/design-kanban/09-from-chat.png`
> สถานะ: **ผ่านครบ 19/19 · tsc 0 error · fitness 23/23 · regressions เขียวทั้งหมด · ภาพ 4 ใบ · ข้อมูล QC คืนสภาพครบ**

## ผลรัน (ตัวเลขจริง)

| ด่าน | ผล |
|---|---|
| ข้อสอบ K3.2 | `JSON_SUMMARY {"total":19,"passed":19,"findings":[]}` |
| typecheck | `NODE_OPTIONS=--max-old-space-size=3584 pnpm exec tsc --noEmit -p tsconfig.json` → 0 error |
| fitness | `JSON_SUMMARY {"total":23,"passed":23,"findings":[]}` (รวม F2.1 เส้น `chat→kanban` · F5.1 raw prisma ไม่เพิ่ม · F13.4 op ทุกตัวมีข้อสอบ) |
| ภาพ | `visual-kanban.mts 3.2` → `JSON_SUMMARY {"wo":"3.2","user":"owner","shots":[4 ใบ],"failures":0}` |

### regressions ที่รันแล้วเขียว
| ชุด | ผล |
|---|---|
| `qc-kanban-k3.1` | 20/20 |
| `qc-kanban-k2.9` | 26/26 |
| `qc-kanban-k1.15` | 30/30 |
| `qc-chat-inbox-ui` | 55/55 |
| `qc-chat-v2-room` | 42/42 |
| `qc-chat-v2-shell` | 26/26 |
| `qc-chat-v2-context` | 53/53 |
| `qc-chat-v2-list` | 41/41 |
| `qc-chat-v2-composer` | 54/54 |
| `qc-chat-v2-icons` | 35/35 |
| `qc-chat-core-v2` | 47/47 |

🔴 **ไม่ได้รัน `qc-chat-security.mts`** โดยเจตนา — หัวไฟล์ `process.loadEnvFile(".env")` แล้ว "สร้าง tenant ทดสอบ → ขับ service จริงกับ Neon"
คือชุดที่แตะ **prod DB** ([[reference_shark_qc_suites_hit_prod_db]]) · ชุดนี้ไม่เกี่ยวกับหัวห้อง/inbox ที่ WO นี้แตะ

## ไฟล์ที่แตะ

**ใหม่**
| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/modules/kanban/integrations.ts` | ทะเบียนสวิตช์รายร้าน 7 ตัวใน `AppSystem.settings.integrations` (zod · ปริยายปิดทุกตัว) · `getIntegrations` / `setIntegrations` / `chatTaskButtonConfig` / `listTaskTargetBoards` |
| `src/lib/modules/chat/task-from-chat.ts` | `draftFromMessages` (pure) · `draftTaskFromChat` (AI + fallback) · `createTaskFromChat` (ประตูเดียวไป kanban) |
| `src/lib/modules/chat/task-from-chat-actions.ts` | `"use server"` — `draftTaskFromChatAction(conversationId)` · `createTaskFromChatAction(input)` |
| `src/lib/modules/chat/task-from-chat-panel.tsx` | แผงขวา 380px ตามภาพ 09 (มือถือเต็มจอ) |
| `src/lib/modules/chat/db.ts` | chokepoint prisma ของโมดูลแชท (เหตุผลด้านล่าง) |
| `src/components/kanban/IntegrationsSettings.tsx` | บล็อก "การเชื่อมต่อ" ในหน้าตั้งค่าบอร์ดงาน |

**แก้**
| ไฟล์ | ที่แก้ |
|---|---|
| `src/lib/modules/kanban/links.ts` | `createCardFromExternal` เพิ่ม `party?` / `attachments?` / `checklist?` / `checklistTitle?` · ผลลัพธ์เพิ่ม `cardNo` + `partyId` · เพิ่มด่าน "ผู้เรียกที่เป็นคน (`ctx.actor`) ต้องเป็น EDITOR ของบอร์ดปลายทาง" |
| `src/lib/modules/kanban/actions.ts` | `setIntegrationsAction` · `loadIntegrationsAction` |
| `src/app/app/sys/[id]/kanban/settings/page.tsx` | เรนเดอร์ `<IntegrationsSettings>` |
| `src/lib/modules/chat/ui.tsx` | อ่าน `chatTaskButtonConfig(tenantId)` แล้วส่งเป็น prop `taskButton` |
| `src/lib/modules/chat/inbox-client.tsx` | ปุ่ม `chat-create-task` ในหัวห้อง · แผง · toast "สร้างการ์ด #n แล้ว" + ลิงก์เปิดการ์ด · `<section>` เป็น `relative` |
| `scripts/fitness.mts` | `ALLOWED_EDGES` += `"chat→kanban"` พร้อมคอมเมนต์อ้าง K3.2 |
| `scripts/visual-kanban.mts` | spec `"3.2"` (4 ใบ) + ฮุก `before` ต่อสเปค + บล็อกเตรียม/คืนสภาพ K3.2 |

**ไม่มี migration** (เก็บใน `AppSystem.settings` ตามสัญญา) · **ไม่มี REST op ใหม่** (สัญญา K3.2 ไม่ระบุ — ดู "หนี้")

## การตัดสินใจที่ควรรู้

1. **`chat/db.ts` (ไฟล์ใหม่ที่สัญญาไม่ได้สั่ง)** — ด่าน fitness F5.1 นับ "ไฟล์ในโมดูลที่ `import { prisma } from "@/lib/core/db"`" แบบ ratchet และวันนี้เต็มเพดานพอดี (45/45) ⇒ ไฟล์ใหม่ 2 ไฟล์ของโมดูลแชทจะทำให้ F5.1 แดงทันที
   ทางออกคือแพตเทิร์นเดียวกับ `kanban/db.ts` ที่ K1.2 วางไว้แล้ว (`export { prisma } from …` ไม่ใช่ `import`) — ไฟล์เดิมของโมดูลแชทไม่ถูกแตะ ทยอยย้ายมาได้ทีหลัง
2. **ด่านบทบาทบอร์ดอยู่ใน facade ไม่ใช่ในโมดูลแชท** — คนกดเลือก "ลงบอร์ด" เองได้จากแผง ⇒ ถ้าไม่ตรวจ จะยิง `boardId` ของบอร์ดที่ตัวเองไม่มีสิทธิ์เขียนได้ · แก้โดยให้ `createCardFromExternal` บังคับ `assertBoardRole(EDITOR)` **เมื่อ `ctx.actor` ถูกส่งมา** (ผู้เรียกที่เป็น cron/consumer ยังไม่มี actor เหมือนเดิม — ด่านของเส้นนั้นคือสวิตช์รายร้าน) ⇒ K3.1 ไม่กระทบ (oracle 20/20 ยังเขียว)
3. **`setIntegrations` บังคับ ADMIN ของบอร์ดปลายทาง** (ไม่ใช่ EDITOR) — สวิตช์นี้เท่ากับ "ยกบอร์ดใบนี้ให้ระบบเขียนการ์ดลงได้ตลอดไป" คนที่แค่แก้การ์ดได้ไม่ควรชี้บอร์ดของทีมอื่นแทนเจ้าของบอร์ด
4. **merge แบบลึกรายคีย์ย่อย** — ส่ง `{ openTaskFromChat: { enabled: false } }` แล้ว `boardId`/`columnId` เดิมยังอยู่ (ปิดชั่วคราวไม่ควรเสียการตั้งค่า) · คีย์ที่ไม่ได้ส่งมาไม่ถูกทับด้วย `undefined`
5. **ไฟล์แนบไม่อัปโหลดซ้ำ** — บันทึก `FileAsset` ที่ชี้ `cdnUrl` เดิมของแชท + `KanbanAttachment` (ไม่ใช้ `attachments.addAttachment` ที่รับไบต์แล้วอัปใหม่: จ่ายที่เก็บสองรอบ + เป็น network call ที่ล้มแล้วจะพา "กดสร้างงาน" ล้มไปด้วย) · ไฟล์ชิ้นใดชิ้นหนึ่งพัง = ข้ามชิ้นนั้น การ์ดยังเกิด
6. **เช็คลิสต์เขียนตรงใน facade** ไม่ผ่าน `checklists.createChecklist` เพราะตัวนั้นบังคับ `assertCardRole(EDITOR)` ซึ่งผู้เรียกที่เป็นระบบ (`actorUserId = null`) ผ่านไม่ได้ — จะทำให้ K3.3/K3.9 ใช้ `checklist` ไม่ได้เลย
7. **`draftTaskFromChatAction(conversationId)` รับแค่ id เดียวตามสัญญา** — `systemId` หาเอาจาก `ChatConversation` โดยกรอง `tenantId` ของ session (ไม่รับ systemId จากหน้าจอ = ปิดช่องยิงห้องของระบบอื่นในร้านเดียวกัน)

## 🐛 บั๊กที่เจอตอนทดสอบจริง (แก้แล้ว) — เพดาน token ตัด JSON ของ AI กลางคัน

ภาพรอบแรกได้ร่างจาก AI สวยงาม แต่รอบที่ 2–3 กลับเป็นตัวร่างสำรอง (ชื่อการ์ด = ข้อความดิบของลูกค้า) ทั้งที่คีย์และเครดิตปกติ
โพรบ provider ตรง ๆ ด้วย prompt ตัวเดียวกัน:

```
ms 8445  model anthropic/claude-sonnet-5  tokens 481 700
RAW>>> {"title":"…","summary":"…","dueAt":"2026-09-11T23:59:00+07:00","checklist":["…","…","…","…","ส่งใบเส   ← ตัดกลางคัน
```

`tokensOut = 700` = **ชนเพดาน `maxTokens: 700` พอดี** ⇒ JSON ไม่ปิดวงเล็บ → zod ไม่ผ่าน → ตกไปใช้ตัวร่างสำรอง **เงียบ ๆ ทั้งที่จ่ายค่าโมเดลไปแล้ว**
(ต้นเหตุ = ผลลัพธ์เป็นภาษาไทยล้วน ซึ่งกิน token ~4 เท่าของอังกฤษ — [[reference_llm_thai_token_cost]] ใช้กับ **ขาออก** ด้วย ไม่ใช่แค่ prompt)
แก้เป็น `maxTokens: 1500` แล้วถ่ายภาพใหม่ → ได้ร่างจาก AI จริงบนจอ (ดูภาพ `task-from-chat-panel-desktop.png`)

## ภาพจริง (`.qc-shots/kanban/3.2/`) — เทียบภาพ 09 ทีละใบ

| ไฟล์ | เห็นอะไร | ต่างจากภาพ 09 ตรงไหน |
|---|---|---|
| `task-from-chat-panel-desktop.png` | แผงขวาซ้อนบนหน้าแชทจริง · หัว "สร้างงานจากบทสนทนานี้" + × · กล่องฟ้า "ผู้ช่วย AI เตรียมให้แล้ว / อ่าน 3 ข้อความล่าสุด → …" · ชื่อการ์ด = **ข้อความที่ AI ร่างจริง** ("จัดทำใบเสนอราคาทริปดำน้ำบริษัท 12 คน 24–26 ต.ค.") · ลงบอร์ด "ซ่อมบำรุงอุปกรณ์" / คอลัมน์ "แจ้งเข้า" · ผู้รับผิดชอบ · กำหนดส่ง "ศ. 11 ก.ย. 2569 · 23:59 น." + ชิป `AI` · ป้ายกำกับของบอร์ด · รายละเอียด (สรุปจากแชท) · เชื่อมอัตโนมัติ 3 ติ๊กแรก · ท้ายแผง "ปุ่มนี้เปิด/ปิดได้ที่ ตั้งค่า › การเชื่อมต่อ" + ยกเลิก / สร้างการ์ด | (ก) **ติ๊กที่ 4 "สร้างใบเสนอราคาร่างในระบบบัญชีด้วย (เร็ว ๆ นี้)" + บรรทัด "เมื่อการ์ดถูกปิด…" ต้องเลื่อนลงนิดเดียวถึงจะเห็น** — เนื้อแผงสูงกว่ากรอบกล่องแชทที่จอ 1440×900 (กรอบสูง ~732px · เนื้อ ~760px) · ภาพ 09 วาดบน canvas สูงกว่า (~975px) จึงพอดี · บีบระยะห่างลงแล้วรอบหนึ่ง (ได้มาอีก ~45px) เหลือส่วนเกินจากความสูงจอล้วน ๆ ไม่ใช่จากเลย์เอาต์ (ข) ป้ายกำกับเป็นป้าย **จริงของบอร์ดที่เลือก** (อุปกรณ์/ด่วน/เรือ) ไม่ใช่ "งานขาย/ด่วน" ในภาพ และยังไม่มีปุ่ม "+ เพิ่ม" (สัญญาเขียนว่า "ป้ายกำกับ (ของบอร์ดที่เลือก)" — การสร้างป้ายใหม่อยู่ที่ตั้งค่าบอร์ด) (ค) ผู้รับผิดชอบปริยาย = "ยังไม่ระบุ" (ภาพวาด "ธนา" ไว้ — สัญญาไม่ได้กำหนดค่าปริยาย) |
| `task-from-chat-panel-mobile.png` | แผงกางเต็มจอ 390×844 · ทุกบล็อกเรียงเหมือนเดสก์ท็อป · ท้ายแผงตรึงอยู่ล่างจอ | ภาพ 09 ไม่มีแบบมือถือให้เทียบ (สัญญาเขียนแค่ "มือถือ: แผงเต็มจอ") |
| `task-from-chat-created-desktop.png` | หลังกด "สร้างการ์ด" จริง → toast **"สร้างการ์ด #53 แล้ว · เปิดการ์ด"** ล่างจอ + **บันทึกภายในสีเหลือง "โน้ตภายใน · ลูกค้าไม่เห็น"** โผล่ในห้องทันที (`สร้างงาน #53 "…" จากบทสนทนานี้ · ดูงาน /app/sys/…/kanban/b/…?card=…`) | ภาพ 09 ไม่ได้วาดสถานะนี้ (สัญญาสั่งให้ถ่าย) |
| `task-from-chat-switch-off-desktop.png` | ห้องเดิมหลังปิดสวิตช์ — หัวห้องเหลือ "รับเรื่องเอง · ⌕ · ⋮" **ไม่มีปุ่ม "สร้างงาน" อีกเลย** | ภาพ 09 ไม่ได้วาดสถานะนี้ (สัญญาสั่งให้ถ่าย) |

## ข้อแย้งข้อสอบ

**ไม่มี** — ข้อสอบทั้ง 19 ข้อสมเหตุสมผลและจับของจริงได้ทุกข้อ (S2.4 ที่ตรวจ "prompt ไม่มี PII" บังคับให้ตัวประกอบ prompt ถูกยุบไว้ที่เดียวท้ายไฟล์ ซึ่งกลายเป็นโครงที่อ่านง่ายกว่าที่ตั้งใจไว้ตอนแรกจริง ๆ)

## คืนสภาพข้อมูล QC (ตรวจแล้วหลังรันทุกอย่าง)

```
KANBAN settings = {}            ← กลับเป็นค่าเดิม (สวิตช์ปิดหมด)
ระบบ CHAT ค้าง = 0
ห้องแชทค้าง = 0 · ผู้ติดต่อแชทค้าง = 0
การ์ด sourceType=CHAT ค้าง = 0
Party ชื่อสมชาย ค้าง = 0
FileAsset cdn.example.test ค้าง = 0
การ์ดรวมทั้ง 3 บอร์ด = 38        ← เท่าชุด seed เดิม
```

## หนี้ / ข้อจำกัด (ส่งต่อ)

1. 🔴 **เครดิต AI ลงช่อง `CHAT_SUGGEST`** — `enum AiCreditSource` ยังไม่มีค่าที่หมายถึง "ร่างการ์ดจากแชท" และการเพิ่มค่า enum = migration ซึ่งสัญญา K3.2 บอกว่าไม่ต้องมี ⇒ ใช้กระเป๋าที่ใกล้ที่สุด ("ทีมงานใช้ AI ตอนคุยกับลูกค้า") · ถ้าเจ้าของอยากแยกบิลได้จริง ต้องเพิ่ม `CHAT_TASK_DRAFT` ใน WO ที่มี migration อยู่แล้ว
2. **ไม่มี REST op / AI tool ของ K3.2** — สัญญา §K3.2 ไม่ได้ระบุ op (ต่างจาก K3.1 ที่ระบุ 3 ตัว) และ F13.4 บังคับว่า op ทุกตัวต้องมี test id ในข้อสอบ ⇒ ถ้าจะเปิด `integrations.get/set` + `cards.createFromChat` ทาง REST ต้องมีข้อสอบรองรับก่อน (เสนอทำใน K3.3 ซึ่งเปิดสวิตช์ครบ 6 ตัวอยู่แล้ว)
3. **`unassignedMinutes` เก็บค่าได้แต่ยังไม่มีใครใช้** — เป็นของ K3.3 (`sweepUnattendedChats`) ตามสัญญา · หน้าตั้งค่ายังไม่มีช่องกรอกให้ (K3.3 จะเติมพร้อมสวิตช์อีก 5 ตัวที่ตอนนี้ขึ้น "เร็ว ๆ นี้")
4. **แผงเลือกผู้รับผิดชอบได้ 1 คน** (service รองรับหลายคน) — ภาพ 09 วาดช่องเดียว ถ้าต้องการหลายคนให้เพิ่มเป็น multi-select ทีหลัง
5. **`checklist` ที่ส่งไปสร้างการ์ดคือชุดที่ AI ร่างมา** — แผงยังไม่ให้แก้/ติ๊กออกรายข้อก่อนบันทึก (ภาพ 09 ก็ไม่ได้วาดบล็อกเช็คลิสต์ในแผง) · แก้ได้ในหลังการ์ดหลังสร้าง
6. **ฮุก `before` ใน `visual-kanban.mts`** เป็นของใหม่ที่ WO นี้เพิ่ม (ต้องมีเพื่อพิสูจน์ "ปิดสวิตช์แล้วปุ่มหาย" ในรอบถ่ายเดียว) — สเปคอื่นไม่ได้รับผลกระทบ (ไม่มีใครใส่ `before`)
