# AI Layer — ชั้น AI ของ SHARK (จากวิสัยทัศน์ "AI Business OS")

> **สถานะ:** Phase 1 กำลังสร้าง (WO-0014/0015) · Phase 2-3 วางแผนแล้ว
> **หลักคิดจากเจ้าของ:** เราไม่ได้ขาย software ไม่ได้ขายฟอร์ม — AI เป็นผู้ช่วยธุรกิจที่ user "สั่ง" ได้
> ทุก Account มี AI ตัวเดียว แต่เปลี่ยน persona ตามงาน

## ภาพรวม

```
ปุ่ม orb (AiDock) ─→ AiChat ─→ actions.ts (assertCan "ai.chat.send")
                                  │
                                  ▼
                            service.ts  ── guard: cost/วัน ต่อ tenant (AiUsage)
                                  │        history: AiConversation/AiMessage
                                  ▼
                            provider.ts ── resolveProvider()
                              ├─ OpenRouterProvider  (SHARK_AI_KEY — key ชื่อ "shark" เท่านั้น)
                              ├─ MockProvider        (SHARK_AI_MOCK=1 — oracle/dev ไม่เผาเงิน)
                              └─ null                (ยังไม่ใส่ key → UI แจ้งสุภาพ ไม่พัง)
```

**กฎเหล็ก**
1. **ห้ามใช้ key ข้ามโปรเจกต์** — env `SHARK_AI_KEY` ต้องเป็น OpenRouter key ที่สร้างชื่อ "shark" เท่านั้น
2. **ไม่มี key = ระบบยังทำงานปกติ** — ปุ่ม orb เปิดได้ แจ้ง "ผู้ช่วย AI กำลังจะเปิดใช้" ห้าม throw
3. **ทุก mutation ที่ AI ทำแทน user ต้องผ่าน server action เดิม + assertCan เดิม** — AI ไม่มีทางลัดเข้า DB
4. **cost guard ต่อ tenant ต่อวัน** (requests + tokens) — เกินแล้วตอบสุภาพ ไม่เงียบหาย
5. **oracle ใช้ MockProvider เสมอ** — ข้อสอบต้อง deterministic และรันได้โดยไม่มี key

## Env

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `SHARK_AI_KEY` | OpenRouter key ชื่อ "shark" | ไม่มี = ปิดชั้น AI อย่างสุภาพ |
| `SHARK_AI_MODEL` | default `anthropic/claude-haiku-4.5` | เปลี่ยนได้โดยไม่แตะโค้ด |
| `SHARK_AI_MOCK` | `1` = MockProvider | ใช้ใน oracle/dev |
| `SHARK_AI_DAILY_REQ` | default 300 | เพดาน request/tenant/วัน |
| `SHARK_AI_DAILY_TOKENS` | default 400000 | เพดาน tokens in+out/tenant/วัน |

## เฟส

**Phase 1 — ผู้ช่วยถาม-ตอบ (WO-0014 kernel + WO-0015 UI)**
persona "ผู้ช่วยประจำกิจการ": รู้ชื่อกิจการ + ระบบที่เปิด ตอบคำถามการใช้งาน/แนะนำระบบ
เก็บบทสนทนา (AiConversation/AiMessage, tenant-scoped) + cost guard (AiUsage)

**Phase 2 — M4: สัมภาษณ์ธุรกิจแบบพิมพ์อิสระ (WO-0016)**
LLM สกัด DnaFacts จากบทสนทนา → **compile เดิมยังเป็น deterministic** (LLM แค่ฟัง ไม่ได้ประกอบเอง)
ตรวจ ZDnaFacts ที่ boundary เสมอ — LLM มโนโครงสร้างไม่ได้

**Phase 3 v1 — อ่านข้อมูลจริง (WO-0018)**
tool registry read-only 5 ตัว (list_systems/sales_summary/low_stock/pending_leaves/member_count) + agent loop เพดาน 5 รอบ

**Phase 3.5 — ทำงานแทน user (WO-0020) 🔴 คำสั่งตรงจาก user 2026-07-16**
> "user บางคนไม่ทราบวิธีใช้ จะถามแล้วสั่งให้ทำแทน — AI ต้องแนะนำสิ่งที่ถูกต้อง ให้ user เป็นคนตัดสินว่าเลือกทิศทางไหน แล้ว AI ต้องทำงานแทนได้"

สถาปัตยกรรม **proposal → confirm → execute**:
1. AI เรียก action-tool → ระบบ**ไม่ execute ทันที** แต่สร้าง proposal (การกระทำ + พารามิเตอร์ + คำอธิบายไทย) เก็บฝั่ง server
2. UI แสดง confirm card ในแชท (สรุปว่าจะทำอะไร + ทางเลือก) — **user กดยืนยัน/ยกเลิก/เลือกทางอื่น**
3. ยืนยันแล้ว execute ผ่าน service เดิม + **assertCan ณ ตอน execute** (สิทธิ์ของ user คนที่กด ไม่ใช่ของ AI)
4. ห้ามเชื่อ payload จาก client — execute อ่าน proposal จาก DB ด้วย id เท่านั้น
5. persona: เสนอทางเลือก 2-3 ทางพร้อมเหตุผลเมื่อ user ไม่แน่ใจ — ไม่ตัดสินใจแทน

action-tools ชุดแรก (ปลอดภัย มีประโยชน์จริง): รับสินค้าเข้าสต็อก · อนุมัติ/ไม่อนุมัติใบลา · สร้างแคมเปญ (ฉบับร่าง — ส่งจริงยังกดใน UI)
persona เพิ่มตามโมดูล (บัญชี/สต็อก/การตลาด/HR) ตามวิสัยทัศน์ "AI ตัวเดียวเปลี่ยน persona"

## โครงไฟล์

```
src/lib/ai/            ← core layer (แบบเดียวกับ dna/ — ไม่ใช่ module ธุรกิจ)
  rules.ts             ← pure functions (dayKey BKK, overBudget, trimHistory) — oracle ยิงตรง
  provider.ts          ← AiProvider iface + OpenRouter + Mock + resolveProvider
  persona.ts           ← system prompt ต่อ persona (ไทย)
  service.ts           ← sendMessage/listMessages/getOrCreateConversation + guard + persist
  actions.ts           ← "use server" + assertCan("ai.chat.send")
src/components/app-shell/AiChat.tsx  ← client chat ใน sheet ของ AiDock
prisma/schema/ai.prisma              ← AiConversation/AiMessage/AiUsage
scripts/qc-ai.mts                    ← oracle (MockProvider + neon branch)
```

## ข้อสอบ (oracle qc-ai.mts)

- RULES: dayKey ข้ามเที่ยงคืน BKK ถูก · overBudget ครบ 3 แกน · trimHistory ตัดหัวเก็บท้าย
- SVC (Mock): ส่งข้อความ → ได้คำตอบ + persist 2 แถว · usage นับสะสม · เกิน budget → error สุภาพ
  · ไม่มี provider → ai_disabled ไม่ throw · conversation เดิมต่อได้ · tenant อื่นมองไม่เห็น (kernel guard)
