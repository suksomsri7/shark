# ระบบที่ 15: AI พนักงานส่วนตัว (AI Employee)

> ออกแบบโดย Fable 5 (2026-07-11) ตามวิชันเจ้าของ: "สั่งงานทางแชท เปรียบเสมือนพนักงานบัญชี พนักงานขาย พนักงานต้อนรับ — AI ไปศึกษาว่ามีระบบอะไร ทำอะไรได้ แล้วทำงานแทน แทนที่ user จะกรอกเอง"
> ไฟล์หมายเลข 16 (เลข 15 ถูกใช้โดย backoffice spec) — ในทะเบียนระบบ = **ระบบที่ 15**
> ใช้คู่กับ **ระบบที่ 16: Knowledge Base** (`17-knowledge-base.md`) — สมองความรู้ของ AI

---

## 1. หลักการ (การตัดสินใจสถาปัตยกรรม — FINAL)

1. **ไม่เทรน/ไม่ self-host model** — ใช้ Claude API + tool calling. เหตุผล: คุณภาพ tool-use frontier, จ่ายตามใช้ (ไม่มี GPU fixed cost), "รู้จักระบบของร้าน" คือ runtime context ไม่ใช่ weights
2. **AI ทุกบุคลิก = engine เดียว** ต่างกันแค่ system prompt (persona) + ชุด tools ที่เปิดให้
3. **AI ไม่แตะ DB ตรง** — เรียกผ่าน tools ที่ wrap service layer เดิม (`lib/modules/*/service.ts`) เท่านั้น → tenant isolation + audit ได้ฟรี
4. **เขียน = DRAFT + คนยืนยัน** (งานเงิน/ลบ = ยืนยันเสมอ) · อ่าน = ทำได้เลย
5. **Token = ต้นทุนขายที่ส่งต่อได้** — ขายเป็นแพ็กเกจ/เครดิต + BYOK สำหรับร้านใหญ่

## 2. สถาปัตยกรรม

```
User พิมพ์ในแชท AI (dashboard หรือ ระบบรวม Chat)
   ↓
Agent loop (server): Claude API (@anthropic-ai/sdk, TypeScript, tool runner)
   system prompt = persona + ทะเบียนระบบของ tenant (AppSystem+links) + สิทธิ์ role ของ user
   tools = registry ตามระบบที่ร้านเปิด + สิทธิ์ user   [cache_control บน system+tools]
   ↓ tool_use → เรียก service จริง (tenantId มาจาก session เสมอ ห้ามมาจาก model!)
   ↓ ผล → Claude → ตอบ / เสนอการ์ด DRAFT ให้กดยืนยัน
```

- **Model:** เริ่ม `claude-opus-4-8` วัดคุณภาพก่อน → route งาน routine ลง `claude-haiku-4-5` เมื่อมี traffic (ดู §7)
- **Prompt caching:** system prompt + tool definitions ต้อง byte-stable (ห้ามใส่ timestamp) — cache read ~10% ของราคา
- **Streaming** ตอบแบบพิมพ์สด (SSE เดิมของ SHARK)

## 3. Personas (Phase 2)

| Persona | ใช้ tools ของระบบ | ตัวอย่างสั่งงาน |
|---|---|---|
| 🤵 ผู้ช่วยทั่วไป (default) | ทุกระบบที่ user มีสิทธิ์ | "วันนี้ยอดเท่าไหร่" "มีนัดกี่คิว" |
| 💁 ต้อนรับ | Booking, Queue, Member, KB | "ลงนัดคุณสมชายพรุ่งนี้บ่ายสอง" "ลูกค้าถามว่าย้อมผมกี่บาท" |
| 💰 ขาย | POS, Member, Coupon, Reward | "เปิดบิลตัดผม+สระ ลูกค้าเบอร์ 081..." "แจกคูปองลูกค้า Gold" |
| 🧾 บัญชี | Account, POS | "ออกใบแจ้งหนี้บริษัท X 5,350 บาท" "เดือนนี้กำไรเท่าไหร่" |

## 4. Tool Registry (mapping ต่อระบบ — ขยายเมื่อระบบใหม่ LIVE)

| ระบบ | read tools (ทำเลย) | write tools (DRAFT+ยืนยัน) |
|---|---|---|
| Booking | find_slots, list_appointments | create_appointment, set_status |
| Member | search_customers, get_profile(+แต้ม/timeline) | create_customer, add_note |
| Point | get_balance, get_ledger | adjust (OWNER เท่านั้น, ยืนยัน) |
| POS | day_summary, list_sales, get_receipt | create_sale, void_sale (ยืนยัน 2 ชั้น) |
| Reward/Coupon | list, check_eligibility | issue/redeem (ยืนยัน) |
| Account | list_documents, get_report(P&L) | create_document(ทุกชนิด → DRAFT เสมอ) |
| Kanban | list_boards/cards | create_card, move_card |
| **KB (ระบบ 16)** | **search_kb, get_article** | suggest_article (ร่างให้คนตรวจ) |

กติกา: ทุก tool (ก) รับ tenantId/สิทธิ์จาก session context ไม่ใช่จาก argument ของ model (ข) คืน JSON กระชับ (top-N, ไม่ dump) (ค) write คืน draftId ให้ UI render การ์ดยืนยัน

## 5. Guardrails (ห้ามลด)

1. **Confirm gate:** write ทุกตัวสร้าง `AiDraft` → UI การ์ด [ยืนยัน]/[แก้ไข]/[ยกเลิก] → ยืนยันแล้วค่อยเรียก service จริง (id ของ draft = idempotency key)
2. **สิทธิ์:** tools ถูก filter ด้วย `can()` ของ user ที่คุยอยู่ — AI ไม่มีสิทธิ์เกินคนสั่ง
3. **Audit:** ทุก tool call ลง `AiActionLog` (ใคร สั่งอะไร AI เรียกอะไร ผลอะไร) — เจ้าของร้านเปิดดูได้
4. **Prompt injection:** ข้อความจากลูกค้า (Phase 3 ผ่าน Chat) = untrusted — persona ลูกค้าได้เฉพาะ read tools ที่ปลอดภัย (slots, FAQ) + จองของตัวเองเท่านั้น ห้ามเห็นข้อมูลลูกค้าอื่น
5. **Rate limit ต่อ tenant** + เพดานเครดิต — กันบิลบาน
6. AI ห้ามสัญญาแทนร้าน ("จะติดต่อกลับ") และห้ามแต่งข้อมูลที่ไม่มีในระบบ — ไม่รู้ให้บอกไม่รู้/ส่งต่อคน

## 6. Data Model (Prisma — scope: ระบบ AI เป็น AppSystem type `AI`)

```prisma
model AiConversation { id, tenantId, systemId, userId?, customerId?, channel(DASHBOARD|CHAT), title?, createdAt }
model AiMessage      { id, tenantId, conversationId, role(USER|ASSISTANT|TOOL), content Json, tokensIn, tokensOut, model, createdAt }
model AiDraft        { id, tenantId, systemId, conversationId, toolName, payload Json, status(PENDING|CONFIRMED|CANCELLED), resultRef?, expiresAt }
model AiActionLog    { id, tenantId, systemId, conversationId, userId?, toolName, input Json, ok, latencyMs, createdAt }
model AiUsage        { id, tenantId, systemId, period(YYYYMM), tokensIn, tokensOut, credits, @@unique([systemId, period]) }
```
settings ใน `AppSystem.settings`: { persona defaults, creditLimit, byokKey(เข้ารหัส)?, model routing }

## 7. Token Economy (โมเดลธุรกิจ)

- **แพ็กเกจ:** ฟรี = N คำสั่ง/เดือน (ชิม) · AI Add-on ~299฿/เดือน = โควตาที่ margin ดี (ต้นทุนจริง Haiku ~0.3-0.7฿/คำสั่ง, Opus ~2-5฿/คำสั่ง) · BYOK = ไม่จำกัด (ร้านจ่าย Anthropic เอง)
- **Routing:** classifier เบา (หรือ heuristic ตามความยาว/persona) → Haiku สำหรับ lookup/กรอกง่าย, Opus สำหรับบัญชี/วิเคราะห์/หลายขั้น
- **Caching:** system+tools cached → ต้นทุนจริงต่อคำสั่งเหลือส่วน dynamic เท่านั้น
- **Batch API (-50%)** สำหรับงานหลังบ้าน: สรุปยอดรายวัน, ร่างบทความ KB, วิเคราะห์ลูกค้า
- แสดง usage ใน dashboard (คำสั่งที่ใช้/เหลือ) — โปร่งใส

## 8. Phasing

- **P1 — AI ผู้ช่วยใน dashboard:** ปุ่มแชทลอย ทุกหน้า · tools: Booking+Member+POS read + create_appointment/create_customer (DRAFT) · ไทย · caching + audit + confirm gate ครบ
- **P2 — Personas + Account + KB:** เลือกบุคลิก · Account document drafts · ต่อ search_kb (ระบบ 16) · credit/แพ็กเกจ + usage UI + routing Haiku
- **P3 — AI ต้อนรับหน้าร้าน (ลูกค้า):** เสียบเข้าระบบรวม Chat (LINE/webchat) — ตอบ FAQ จาก KB + เช็คคิวว่าง + จองให้ลูกค้า + **handoff to human** เมื่อไม่มั่นใจ/ลูกค้าขอ · guardrails ลูกค้า (ข้อ 5.4)
- 🔜 — เสียง/รูป (อ่านสลิป, ถ่ายบิลเข้า Account), proactive ("พรุ่งนี้คิวแน่น เปิดช่างเพิ่มไหม"), รายงานเชิงลึกอัตโนมัติ

## 8b. "พนักงาน 24 ชม." — ฝั่งที่ AI ทำงานเองไม่ต้องรอสั่ง (เพิ่ม 2026-07-11 ตามวิชันเจ้าของ: "คู่แข่งให้ฟอร์มใช้ฟรี แต่ SHARK ให้พนักงานที่ทำงานแทนคุณ 24 ชม.")

1. **Daily Brief (เช้าทุกวัน)** — AI สรุปให้ก่อนเปิดร้าน: นัดวันนี้/คิวแน่นช่วงไหน, ยอดเมื่อวาน vs ค่าเฉลี่ย, ใบแจ้งหนี้ครบกำหนด, สต็อกใกล้หมด, ลูกค้าประจำที่หายไป — ส่งทาง LINE/อีเมล/แชท AI · รันด้วย cron + **Batch API (-50%)** = ต้นทุนต่ำมาก
2. **Proactive Alerts** — เหตุการณ์ trigger AI คิด+เสนอ (ไม่ใช่แค่แจ้ง): "พรุ่งนี้คิวเต็ม 90% — เปิดเวลาช่างเพิ่มไหม?" · "ลูกค้า Gold 12 คนไม่มา 60 วัน — ร่างข้อความ+คูปองดึงกลับให้แล้ว [ส่ง]" · "ยอดสัปดาห์นี้ตก 20% — วิเคราะห์สาเหตุ..." — ทุกข้อจบด้วย action ที่กดยืนยันได้
3. **ถ่ายรูป = บันทึก (Vision)** — ถ่ายสลิปโอน/บิลซื้อของ/ใบกำกับ → AI อ่าน (Claude vision) → สร้างรายการค่าใช้จ่าย/รับชำระ DRAFT ให้กดยืนยัน — งานบัญชีที่ SME เกลียดสุด หายไป (จุดฆ่า FlowAccount/Peak ที่เป็น OCR เฉยๆ: ของเราอ่านแล้ว "ลงบัญชีให้เลย")
4. **AI Onboarding (คุยแทนกรอก)** — ร้านสมัครใหม่ไม่ต้องตั้งค่าเอง แค่พิมพ์: "ผมเปิดร้านตัดผม มีช่าง 2 คน เอ กับ บี เปิด 10 โมงถึง 2 ทุ่ม ตัดผม 150 สระ 100" → AI สร้างระบบ+บริการ+พนักงาน+เวลาทำการให้ครบ (DRAFT ให้ตรวจ) — first impression ที่ตรงวิชัน "แทนที่จะกรอก แค่บอก" ที่สุด
5. **Persona ที่ 5: 📣 นักการตลาด** — วิเคราะห์ Member/Point/ยอดขาย → เสนอ segment + ร่างแคมเปญ/คูปอง/ข้อความ broadcast (ผูกระบบ Coupon + Chat) — ทุกอย่าง DRAFT + consent gate ตาม PDPA
6. **Memory ต่อร้าน** — AI จดสิ่งที่เรียนรู้ (กติกาเฉพาะร้าน, ลูกค้า VIP ชอบอะไร, คำที่เจ้าของใช้) ลง KB หมวด internal → ฉลาดขึ้นเรื่อยๆ เหมือนพนักงานที่ทำงานนาน

Phasing เพิ่ม: Daily Brief + Alerts = **P2** (ใช้ cron+Batch) · Vision บันทึกบิล = **P2** (คู่กับ Account) · AI Onboarding = **P2** (impact สูง/สร้างง่าย — tools มีครบแล้ว) · นักการตลาด + Memory = **P3**

## 9. เกณฑ์วัด (QC)

- ความแม่น tool call ≥95% บนชุดคำสั่งไทยทดสอบ (สร้าง eval set 50 คำสั่ง/persona)
- ห้ามมี write ใดเกิดโดยไม่ผ่าน confirm gate (เทส)
- Isolation: AI ของ tenant A ต้องไม่เห็นข้อมูล tenant B (เทสเหมือน tenantDb)
- ต้นทุน/คำสั่ง วัดจริง < ราคาแพ็กเกจ/โควตา
