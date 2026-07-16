# 02 — Architecture: 5 ชั้น + การเชื่อมต่อทุกโมดูล

## ผังชั้น (ของจริงที่รันอยู่ ไม่ใช่ภาพฝัน)

```
┌─ Layer 5: Marketplace (แผน — WO-0064)  plugin/theme/template registry ต่อ tenant
├─ Layer 4: Advanced   Accounting· Finance· Procurement· Subscription· Marketing· Loyalty(Point/Reward/Coupon)
│                      Automation· Approval(แผน)· Builder ต่าง ๆ(แผน)· BI(แผน)· Portal(แผน)· WhiteLabel(แผน)
├─ Layer 3: Business   Hotel· Restaurant· Booking· Queue· Ticket· POS· E-commerce(แผน)· Rental(แผน)· School(แผน)· Healthcare(แผน)
├─ Layer 2: Core       Auth(OTP/magic)· Tenant+Membership+RBAC· BusinessUnit· AppSystem· Member(Customer กลาง)
│                      Chat· Meeting· Kanban· HR· Inventory· CRM· Notification· Support· Announce· Dashboard· i18n· Storage· Payment· Domain
├─ Layer 1: AI         provider(OpenRouter)· persona· tools(13)· proposals(confirm-execute)· interview(M4)· growth
└─ Layer 0: Kernel     prisma+tenantDb(scope guard)· outbox· cron· fitness ratchet· oracle suite· PlatformUser/backoffice
```

## กติกา dependency (บังคับโดย fitness F-series)
1. **module → core ได้ · core → module ห้าม** — ของกลางที่โมดูลใช้ร่วมอยู่ `src/lib/core` เท่านั้น
2. **module → module ห้าม import ตรง** — เชื่อมผ่าน 4 ช่องทางที่อนุญาตเท่านั้น (ตารางล่าง)
3. composition roots (นอกกฎข้อ 2): `outbox-consumers.ts` · `app/**/page.tsx` · `src/lib/ai/*` (AI เรียก service ทุกโมดูลได้ — คือหน้าที่มัน) · `src/lib/dna/*` · `src/lib/dashboard/*`
4. ทุก model ต้องลงทะเบียน `src/lib/core/scope.ts` (axis: global/tenant/unit/system/platform) — ไม่ลงทะเบียน = query โยนทันที (fail-closed)

## ช่องทางเชื่อมต่อระหว่างโมดูล (Connection Matrix)

| ช่องทาง | กลไก | ตัวอย่างจริงในระบบ |
|---|---|---|
| **1. Outbox event** (async·ทนพัง·idempotent) | `emitOutbox` ใน tx เดียวกับงานหลัก → `outbox-consumers.ts` map type→handler → cron เก็บตก | `pos.sale.paid` → account-bridge ลงบัญชี · ทุก event → Automation engine |
| **2. Service call ผ่าน composition root** | page/AI/dna เรียก service ข้ามโมดูล (โมดูลกันเองห้าม) | AI tools เรียก inventory/hr/member · DNA apply เรียก createSystem |
| **3. ตารางเชื่อมเฉพาะ** | ตาราง link มี scope ชัด | `AccountSystemLink` (POS↔Account) · `AppSystemUnit` (system↔หน้างาน) |
| **4. Customer กลาง (Member)** | ทุกโมดูลอ้าง `Customer.id` เดียวกัน (memberSystemId scope) + `MemberActivity` timeline | POS.memberId · Booking · Subscription.customerId · CRM |

**เส้นเงิน (สำคัญสุด — แตะต้องมี oracle บัญชีเขียว 107/107 เสมอ):**
`ทุกระบบธุรกิจ → PosSale (sourceModule ระบุที่มา) → outbox "pos.sale.paid" → account-bridge → AccountDocument+GL`
Hotel/Restaurant/Ticket/Booking/Coupon เข้าเส้นเดียวกันหมด — โมดูลใหม่ที่มีเงิน**ต้องเข้าเส้นนี้ ห้ามเปิดเส้นใหม่**

**เส้น AI:** user ↔ AiChat ↔ service(agent loop ≤5 รอบ) ↔ tools → (read: query ตรง scope-safe · act: AiProposal PENDING) → user ยืนยัน → executeProposal → assertCan สิทธิ์คนกด → **service เดิมของโมดูล** (ห้ามลัด DB)

**เส้น DNA:** interview(LLM)/wizard → DnaFacts (ZDnaFacts validate) → compile (deterministic!) → Blueprint → apply (idempotent ต่อ step) → CREATE_SYSTEM/LINK_UNIT/ACCOUNT_SETTINGS

**เส้น Platform:** backoffice (PlatformUser·bo_session แยกขาด) → prisma ตรงเฉพาะใน `src/lib/platform/**` + PlatformAuditLog append-only ทุก mutation

## Multi-tenancy (หัวใจความปลอดภัย — ดู 04 ประกอบ)
- ทุกแถวมี `tenantId` · `tenantDb(ctx)` inject filter อัตโนมัติทุก operation · โมดูลห้ามใช้ prisma ดิบ (fitness F5 ratchet)
- system-scoped model (InvItem, HrLeave, MktCampaign, …) ต้องมี `systemId` ใน ctx — ข้ามระบบใน tenant เดียวกันก็มองไม่เห็นกัน
- **บทเรียนที่เป็นกติกา**: create ผ่าน tenantDb ใส่ tenantId(+systemId) ตรง ๆ ใน data (type ไม่รู้จัก guard) · `tenantDb().upsert()` ใช้ไม่ได้ → find→update/create หรือ updateMany เงื่อนไขสถานะ

## การตัดสินใจสถาปัตยกรรมที่ล็อกแล้ว (ADR ย่อ)
| # | ตัดสินใจ | เหตุผล |
|---|---|---|
| A1 | Modular monolith บน Next (ไม่ microservices) | ทีม=AI 1+2 · แยก service = ต้นทุน ops มหาศาลโดยไม่มีผู้ใช้ระดับนั้น · outbox เตรียมทางแยกไว้แล้ว |
| A2 | Prisma+Neon (PG) row-level tenantId | พิสูจน์แล้ว 107 ข้อบัญชี · branch ต่อ WO ใช้เทส |
| A3 | LLM ผ่าน OpenRouter (SHARK_AI_KEY) + MockProvider เทส | สลับ model ด้วย env · ข้อสอบ deterministic |
| A4 | compile DNA เป็น deterministic — LLM แค่สกัด facts | ตรวจสอบได้ ผลซ้ำได้ ไม่มโน |
| A5 | proposal→confirm→execute สำหรับ mutation ของ AI ทุกตัว | user ตัดสินใจเสมอ + audit ได้ |
| A6 | host-routing โดเมนลูกค้า = ชั้น app ไม่ใช่ proxy (จนกว่าจะย้าย adapter-neon) | ข้อจำกัด Vercel runtime + pg TCP (ดู WO-0025 log) |
