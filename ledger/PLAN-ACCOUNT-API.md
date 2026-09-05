# PLAN-ACCOUNT-API — ระบบบัญชี SHARK: API ครอบทุกฟังก์ชัน + คู่มือ/สกิลสำหรับ AI agent และแอปภายนอก

> เขียนโดย Fable 5.1 · 5 ก.ย. 2026 · session บัญชี (worktree `shark-accounting`) · สถานะ: **เจ้าของเคาะ §8 ครบแล้ว (5 ก.ย. ~14:00 BKK) — พร้อมเริ่มเฟส A**
> คำสั่งเจ้าของ: "ตรวจสอบระบบบัญชี … ตั้งค่า/การเชื่อมต่อ/แอปภายนอก API … ทุกฟังก์ชันต้องมี API … วางแผนทำ API และคู่มือหรือ skill ให้ครอบคลุมทุกฟังก์ชัน" · เป้าหมายปลายทาง: **AI agent หรือแอปของลูกค้าอ่านคู่มือแล้วจัดการบัญชีของตัวเองได้ · และแอป SHARK จะมี AI ที่คุยแล้วจัดการทั้งกิจการได้**
> อ่านคู่กับ: `docs/modules/12-account.md` §5 (พิมพ์เขียว API เดิม) · `docs/sds/07_API.md` · `docs/AI_LAYER.md` · `docs/sds/03_AI_LAYER.md` · `ledger/ACCOUNT-V2-RUN.md`

---

## 0. สรุปสำหรับเจ้าของ (อ่านแค่หัวข้อนี้ก็พอ)

**สิ่งที่พบจากการตรวจ (5 ก.ย.)**
1. **ระบบบัญชียังไม่มี REST API สักเส้นเดียว** — โมดูลบัญชีมี 97 ไฟล์ / ~880 ฟังก์ชันที่ export · ทุกอย่างวิ่งผ่าน server action ของหน้าเว็บเท่านั้น · พิมพ์เขียว `12-account.md §5` ออกแบบ endpoint ไว้ 39 กลุ่ม (~70 เส้นทาง) ตั้งแต่ ก.ค. แต่ **ไม่เคยถูกสร้าง**
2. หน้า "ตั้งค่า › การเชื่อมต่อ › แอปภายนอก/API" ที่เจ้าของเห็น **ออกคีย์ได้จริง แต่คีย์นั้นเรียกได้เฉพาะ API กลางของแพลตฟอร์ม** (`/api/v1/me`, `/customers`, `/sales`, `/inventory/items` …) — **ไม่มีข้อมูลบัญชีเลย** ไม่มีใบแจ้งหนี้ ไม่มีงบ ไม่มีผู้ติดต่อฝั่งบัญชี
3. คีย์ API วันนี้ **ไม่มี scope และไม่ผูกสมุดบัญชี** — 1 คีย์ = อ่านได้ทุกอย่างที่ API กลางเปิด (ทั้งร้าน) · หมุนคีย์/ตั้งวันหมดอายุไม่ได้ · rate limit เป็น Map ในหน่วยความจำ (บน Vercel หลาย instance = แทบไม่กัน — โค้ดเองยอมรับไว้ในคอมเมนต์)
4. ชั้น AI ของแพลตฟอร์ม (`/api/v1/ai/skills` + `/api/v1/ai/tools/<name>`) **ออกแบบมาเพื่อ "ลูกค้าเอา AI ตัวเองมาเสียบ" ตรงกับที่เจ้าของต้องการเป๊ะ** และมีกติกาที่ดีมากอยู่แล้ว (อ่าน = ทำทันที · เขียน = สร้างข้อเสนอให้เจ้าของกดยืนยันในแอป) — แต่มี 20 สกิล 63 เครื่องมือ **ไม่มีสกิล "บัญชี"** มีแค่ `record_expense` (บันทึกค่าใช้จ่ายร่าง) กับ `financial_summary` (ประมาณการ) แค่ 2 ตัวจาก ~880 ฟังก์ชัน
5. Webhook ขาออกมีโครงดี (HMAC · retry 5 ครั้ง · เลือก event ได้) แต่ event บัญชีมีแค่ **4 ตัว** (อนุมัติเอกสาร · บันทึกรับ/จ่าย · ใบแจ้งหนี้จ่ายครบ · ปิดงวด) — ออกใบแจ้งหนี้/ยกเลิก/สร้างผู้ติดต่อ/PromptPay จ่ายแล้ว ฯลฯ ไม่มี event
6. ของดีที่ **ต่อยอดได้ทันทีโดยไม่ต้องรื้อ**: ฟังก์ชัน service ทุกตัวรับ `{tenantId, systemId, …}` เป็น JSON ล้วนอยู่แล้ว (ไม่ผูก FormData) · สิทธิ์ 36 คีย์ผ่านจุดเดียว `assertAccountCan` · GL มี chokepoint เดียว `commitEntry` · เงินเป็นสตางค์ Int · ทุก mutation เขียน AuditLog · มี oracle 227 ข้อกันถอยหลัง

**ข้อเสนอ (สั้น)**
- สร้าง **"ชั้นคำสั่งบัญชี" (Account Command Layer) ชุดเดียว** = ทะเบียนการทำงานทั้งหมด ~80 รายการ (ชื่อ · สิทธิ์ · สคีมา input/output · อ่าน/เขียน/อันตราย) แล้วให้ **3 ผิวหน้าใช้ทะเบียนเดียวกัน**:
  1. **REST `/api/v1/account/*`** — สำหรับแอปภายนอก/ระบบของลูกค้า (ทำจริงทันทีตาม scope ของคีย์)
  2. **AI skill `account`** ใน `/api/v1/ai/skills` — สำหรับ AI agent ภายนอก **และ AI ในแอป SHARK ในอนาคต** (อ่านทันที · เขียน = ข้อเสนอให้คนยืนยัน — กติกาเดิมของแพลตฟอร์ม)
  3. **คู่มือ + สกิล** — OpenAPI JSON + หน้า `/developers/account` + `docs/api/ACCOUNT-API.md` + `.claude/skills/shark-account-api/SKILL.md` — **generate จากทะเบียนเดียวกัน** ไม่มีเอกสารเขียนมือแยก (เอกสารไม่มีวันเน่าเพราะเป็นตัวเดียวกับโค้ด)
- ยกระดับคีย์ API: **scope + ผูกสมุดบัญชี + วันหมดอายุ + Idempotency-Key + rate limit บน DB** ก่อนเปิดเส้นเขียนใด ๆ
- ลำดับ: รากฐาน → อ่านทั้งหมด → เขียนเส้นเงินหลัก → เขียนขั้นสูง → AI skill → webhook/เอกสาร/สกิล · รวม **24 WO ≈ 6 เฟส** (ประเมิน §7)

**สิ่งที่ต้องเคาะจากเจ้าของก่อนเริ่ม (§8)** — 5 ข้อ ที่เหลือ Fable ตัดสินใจเองตามกติกา repo

---

## 1. สิ่งที่มีอยู่จริง (as-is audit · ยืนยันจากโค้ด 5 ก.ย. main `859f6c0`)

### 1.1 โมดูลบัญชี — ฟังก์ชันที่ "ต้องมี API" (นับจากโค้ด)
| กลุ่ม | ไฟล์หลัก | ฟังก์ชัน export | หมายเหตุ |
|---|---|---|---|
| เอกสารรายรับ (22 docType) | `service.ts` (116) · `doc-detail.ts` · `doc-numbering.ts` · `group.ts` (15) · `editor-actions.ts` | ~150 | create/update/issue/convert/void/recordPayment/voidPayment/refundDeposit/publicLink/ใบวางบิล/ใบรวมจ่าย/แท็ก/รายการโปรด |
| รายจ่าย/PO/สินทรัพย์ซื้อ | `expense.ts` (27) · `expense-actions.ts` (12) | ~40 | createExpenseDoc/issue/recordVendorPayment/PO submit→approve→convert/PTX receive |
| ผู้ติดต่อ + Party | `contacts-list.ts` (18) · `contact-profile.ts` · `contact-merge.ts` (7) · `contact-links.ts` · `dbd.ts` | ~40 | list/paged/profile 360°/merge/link/DBD lookup/กลุ่ม/ลูกค้าประจำ |
| สินค้า/หน่วย/คลัง | `product.ts` (46) · `product-actions.ts` (17) · `bundle.ts` · `inventory-link.ts` (8) | ~70 | CRUD/จัดชุด/เบิก-คืน/ปรับต้นทุน/ยอดยกมา/ผูก InvItem |
| การเงิน | `finance.ts` (20) · `finance-overview.ts` (7) · `payment.ts` (5) · `payment-request.ts` (12) · `reconcile.ts` (18) · `cheque.ts` (12) · `wht.ts` (17) · `bank-statement-csv.ts` | ~95 | ช่องทาง/โอน/petty cash/PromptPay/กระทบยอด/เช็ค/WHT 2 ขา/ภ.ง.ด. |
| บัญชี/GL | `gl.ts` (22) · `coa.ts` (17) · `coa-v2.ts` · `journal-v2.ts` (14) · `period-close.ts` (10) · `reports.ts` (10) · `report-drill.ts` · `asset.ts` (12) · `asset-v2.ts` | ~110 | ผังบัญชี/mapping/JV/reverse/ปิดงวด/งบ 5 ตัว+aging+ภ.พ.30/สินทรัพย์+ค่าเสื่อม |
| คลังเอกสาร/กล่องขาเข้า | `attachment.ts` (23) · `inbox.ts` (8) · `inbox-ai.ts` | ~35 | อัปโหลด/โฟลเดอร์/ผูก-แยก/archive · AI อ่านบิล |
| ตั้งค่า/นโยบาย/สิทธิ์/เชื่อมต่อ | `settings-actions.ts` · `doc-settings.ts` (16) · `policy.ts` (25) · `permissions-service.ts` (11) · `connections.ts` (8) · `connections-actions.ts` | ~80 | เลขรัน/เทมเพลต/นโยบายล็อกวันที่/ปีบัญชี/matrix สิทธิ์/เพดานอนุมัติ/AccountSystemLink/คีย์+webhook |
| อื่น ๆ | `dashboard*.ts` · `overview.ts` · `recurring-*.ts` · `import-*.ts` · `undo-stack.ts` · `quick-create-*.ts` · `email-report.ts` | ~90 | หน้าหลัก/เอกสารประจำ/นำเข้า CSV/เลิกทำ/⌘K/รายงานอีเมล |

รวม **~880 export** — ในจำนวนนี้ที่เป็น "ความสามารถทางธุรกิจ" ที่คนภายนอกควรสั่งได้ (ตัดตัวช่วย UI/format/parse/label ออก) ≈ **80 การทำงาน** (ตาราง §4)

### 1.2 ชั้น API กลางของแพลตฟอร์ม (`/api/v1`) — สิ่งที่ API บัญชีจะต้องยืนบน
| ส่วน | ที่อยู่ | สภาพ |
|---|---|---|
| คีย์ API | `prisma/schema/api.prisma` `ApiKey{tenantId,name,keyHash,prefix,lastUsedAt,revokedAt}` · `src/lib/api-keys/service.ts` | ✅ ออก/เพิกถอน/hash sha256 · ❌ **ไม่มี scope · ไม่ผูก systemId · ไม่มี expiresAt · หมุนไม่ได้** |
| ยาม route | `src/lib/api-keys/route-auth.ts` `authenticateApiRequest()` | ✅ Bearer → tenantId · ❌ rate limit ใช้ `core/rate-limit.ts` (Map ในโปรเซส) · ❌ error เป็น `{error:"ไทย"}` ไม่มี code/requestId (07_API.md สัญญาไว้ว่าจะมี) |
| เส้นทางที่มี | `me · customers · sales · inventory/items · shop/orders · appointments · reservations · queue/tickets · tickets/orders · chat/*` (10 เส้น) + `ai/skills · ai/skills/[id] · ai/tools/[name]` | ✅ อ่านอย่างเดียว (ยกเว้น chat) · **ไม่มี `account/*`** |
| หน้าเอกสาร | `src/app/developers/page.tsx` | ✅ มี แต่เป็น array เขียนมือ (`ENDPOINTS[]`) ไม่ได้ generate — เพิ่ม endpoint ต้องแก้ 2 ที่ |
| ข้อสอบ | `scripts/qc-public-api.mts` · `qc-chat-api-v1.mts` · `qc-webhook.mts` | ✅ แพตเทิร์น: เรียก handler ตรง `GET(new Request(...))` บน Neon branch |
| หน้าตั้งค่าในบัญชี | `settings/connections?s=api` → `ConnectionsPanel.tsx` §"แอปภายนอก / API" + `connections-actions.ts` | ✅ ออกคีย์/เพิกถอน + เพิ่ม/แก้/ทดสอบ webhook · **คีย์เป็นของระดับร้าน** (`assertCan module "api"`) ไม่ใช่ของสมุดบัญชี |

### 1.3 ชั้น AI (`src/lib/ai/*`) — ประตูสำหรับ "AI agent ภายนอก" และ "AI ในแอป"
- `tools.ts`: 63 เครื่องมือ `AiTool{def{name,description,parameters}, action?, execute(ctx{tenantId,conversationId?}, args)}` · `skills.ts`: 20 สกิล (`id/label/summary(EN)/tools/systems`) + กติกา "ทุก tool ต้องอยู่ในสกิลพอดี 1 ที่" (`assertSkillRegistryComplete`)
- **เส้นเขียน = proposal เสมอ**: `proposals.ts` `createProposal → executeProposal(m: MembershipCtx, …)` ตรวจ `KIND_ACCESS[kind]` ด้วยสิทธิ์**คนกดยืนยัน** · DESTRUCTIVE ต้องยืนยัน 2 ชั้น · claim อะตอมมิก · TTL 24 ชม. (`docs/sds/03_AI_LAYER.md` กติกาถาวรข้อ 1: "mutation ทุกตัวของ AI = proposal เท่านั้น")
- ที่แตะบัญชีวันนี้: `record_expense` (→ `accountFacade.createExpenseDoc` ร่าง EXPENSE) · `financial_summary` (ประมาณการจาก POS ไม่ใช่งบ) · เท่านั้น
- แอปมือถือ: `/api/mobile/*` ใช้ Bearer session + `X-Tenant-Id` → `requireMobile()` คืน **membership จริง** (`src/lib/mobile/auth.ts:74`) และมี `mobile/proposals/confirm` อยู่แล้ว ⇒ AI ในแอปอนาคตใช้เส้น proposal เดิมได้ทันทีเมื่อมีเครื่องมือบัญชี

### 1.4 Webhook ขาออก
- `WebhookEndpoint{url,secret,eventsJson,active}` + `WebhookDelivery` · `dispatchWebhooks` ลายเซ็น `X-Shark-Signature` HMAC-SHA256 · retry ≤5
- event บัญชีที่ประกาศ (`webhooks/labels.ts`): `account.document.approved` · `account.payment.recorded` · `account.invoice.paid` · `account.period.closed` — ทั้ง 4 มี consumer no-op ใน `outbox-consumers.ts` (ถูกต้องตามกติกา "เพิ่ม event ต้องลงทะเบียน consumer")
- ที่ยิงจริง: `service.recordPayment` (payment.recorded + invoice.paid — เส้น V2 `payment.ts recordPayments` เรียก `service.recordPayment` ต่อ ⇒ ยิงด้วย ✅) · `expense-actions.ts:364` (document.approved — **เฉพาะ PO อนุมัติ**; ออกใบแจ้งหนี้/ใบเสร็จ **ไม่ยิงอะไร**) · `period-close.ts:250`
- ❌ ไม่มี: `document.issued` · `document.voided` · `contact.created/updated` · `payment_request.paid` (PromptPay) · `cheque.*` · `asset.*` · `reconcile.confirmed` · `recurring.run`

### 1.5 สิทธิ์ (สิ่งที่ scope ของคีย์ต้องล้อ)
`src/lib/core/permissions.ts:432-471` — 36 คีย์ `account.*` · บังคับผ่าน `assertAccountCan(auth, action)` ที่รับ **membership จาก session** เท่านั้น (`access.ts`) · มีตาราง IMPLIES (create⇒view · finance.manage⇒reconcile) · `rbac.evaluate()` รองรับ `permissions` เป็น map ของ string ⇒ **สร้าง MembershipCtx สังเคราะห์จาก scope ของคีย์ได้โดยไม่แก้ rbac**

### 1.6 ช่องว่างเทียบพิมพ์เขียว `12-account.md §5`
| พิมพ์เขียว | สภาพจริง | ตัดสินใจในแผนนี้ |
|---|---|---|
| base `/api/sys/[systemId]/account/...` (session + can()) | ไม่มี | เปลี่ยนเป็น `/api/v1/account/...` + systemId ผูกกับคีย์ (หรือ header) — ให้ตรงกับ API กลาง/หน้า developers/ข้อสอบที่มีอยู่ (§2.2) |
| `/api/pub/account/d/:token` (public) | มีเป็นหน้าเว็บ `/pay/[token]` · `/r/[token]` (ไม่ใช่ JSON) | คงหน้าเว็บ · **ไม่ทำ JSON public** ในรอบนี้ (ไม่มีผู้ใช้จริง) |
| `?format=csv` ทุกรายงาน | มี CSV เฉพาะ `tax/export` + ปุ่มฝั่ง client | REST คืน JSON เป็นหลัก · `Accept: text/csv` เฉพาะรายงาน 6 ตัว (§4.6) |
| `GET /exports/dbd` (DBD e-Filing) | ยังไม่ทำ (ประกาศไว้ใน §1.3 ของ 12-account) | นอกขอบเขต |

---

## 2. หลักออกแบบ (ตัดสินแล้ว — เปลี่ยนได้ที่ §8 เท่านั้น)

### 2.1 สถาปัตยกรรม "ทะเบียนเดียว 3 ผิวหน้า"
```
                       ┌──────────────────────────────────────────────┐
  หน้าเว็บ/มือถือ ───►│  server actions เดิม (ไม่แตะ)                   │
                       └───────────────┬──────────────────────────────┘
                                       │ เรียก service เดิม
  REST /api/v1/account/* ─┐            ▼
  (แอปภายนอก · ทำจริงตาม scope)   ┌────────────────────────────────┐        ┌───────────────┐
                           ├─────►│ account/api/  (Command Layer)  │──────►│ service.ts     │
  AI tools (skill "account") ─┘   │  registry.ts  ทะเบียน ~80 op    │        │ expense.ts …   │
  (อ่านทันที · เขียน=proposal)     │  commands/*.ts  zod in → out   │        │ gl.commitEntry │
                                  │  actor.ts  user | apikey        │        └───────────────┘
                                  └───────────┬────────────────────┘
                                              │ generate
                     ┌────────────────────────┼─────────────────────────┐
                     ▼                        ▼                         ▼
        GET /api/v1/account/openapi.json   /developers/account      .claude/skills/shark-account-api/SKILL.md
        (OpenAPI 3.1 · single source)      + docs/api/ACCOUNT-API.md   + GET /api/v1/ai/skills/account (manifest)
```
- **Command Layer** = โฟลเดอร์ใหม่ `src/lib/modules/account/api/` (อยู่ในโมดูลบัญชี ⇒ import service/gl ตรงได้ · ไม่ผิด F2.2) · **ห้ามมี logic ธุรกิจ** — แค่ validate (zod) → เรียก service เดิม → แปลงผลเป็น JSON มาตรฐาน (กติกาเดียวกับ route แชท: "ชั้น route ทำแค่ ตรวจตัวตน → แปลง body → เรียกชั้น 1")
- **ทุก op ในทะเบียนต้องมี**: `id` (เช่น `documents.issue`) · `method+path` · `action` (permission key เดิม 1 ตัว) · `kind` = `read | write | danger` · `input`/`output` zod schema · `summary` (EN สั้น สำหรับ LLM) + `label` (TH สำหรับคน) · `tool?` (ชื่อ AI tool ถ้าเปิดให้ AI) · `examples` · `test` (id ข้อสอบใน oracle — fitness ใหม่บังคับว่าห้ามว่าง)
- **route จริงมีไฟล์เดียว**: `src/app/api/v1/account/[...path]/route.ts` (catch-all) จับคู่ `method+path` กับทะเบียน ⇒ เพิ่ม op = เพิ่มในทะเบียน 1 แห่ง ครบทั้ง REST/OpenAPI/docs/tool (ไม่มีทางลืม)
- **AI tools ของสกิล `account`** สร้างจากทะเบียนเดียวกัน: op ที่ `tool` ไม่ว่าง → `read` = execute ทันที · `write/danger` = `propose(kind="account.<id>")` + `KIND_ACCESS` = `action` เดียวกัน + dispatch เรียก command เดียวกันด้วย membership ของคนกดยืนยัน

### 2.2 ตัวตน · สิทธิ์ · ขอบเขตของคีย์ (ต้องทำก่อนเปิดเส้นเขียนทุกเส้น)
| เรื่อง | ออกแบบ |
|---|---|
| คีย์ | ขยาย `ApiKey`: `scopesJson Json @default("[]")` · `systemId String?` (ผูกสมุดบัญชี 1 เล่ม · null = คีย์ระดับร้านแบบเดิม) · `expiresAt DateTime?` · `createdById` · `kind` (`PLATFORM` เดิม / `ACCOUNT`) — additive ทั้งหมด · คีย์เก่าทำงานเหมือนเดิม (`scopes=[]` = สิทธิ์เดิม: อ่าน API กลาง + AI proposal) |
| scope | ใช้ **permission key เดิมตรง ๆ** (`account.doc.view` …) ไม่ประดิษฐ์ชุดใหม่ + **bundle** ให้เลือกง่ายในหน้าตั้งค่า: `อ่านอย่างเดียว` (view/report/journal/tax) · `ออกเอกสาร+รับเงิน` (doc.create/issue/payment.record/contact/product) · `นักบัญชี` (journal.adjust/period/chart/wht/asset/cheque/finance/reconcile) · `อันตราย` (doc.void/payment.void/period.reopen/wht.unmark/contact.merge) · `ตั้งค่า` (settings/mapping/import) — bundle เป็นแค่ตัวช่วยติ๊ก เก็บเป็นคีย์รายตัว |
| การตรวจสิทธิ์ | `requireAccountApi(req, op)` → verify key → resolve `systemId` (จากคีย์ · หรือ header `X-Shark-System` ถ้าคีย์ระดับร้าน · ต้องเป็น AppSystem type ACCOUNT ของ tenant นี้) → สร้าง `MembershipCtx{role:"STAFF", unitAccess:[], permissions: scopes}` → `accountCan(ctx, op.action)` (ได้ IMPLIES ฟรี) → 403 `scope_missing` พร้อมบอกชื่อ scope ที่ขาด |
| actor ใน audit | `AuditLog.actorType` เพิ่มค่า `API_KEY` (enum เดิมมี USER/PLATFORM_USER/SYSTEM) · `actorId = keyId` · เก็บ `keyName` ใน meta ⇒ ประวัติแก้ไขบอกได้ว่า "คีย์ 'ระบบจอง SiamDive' ออกใบแจ้งหนี้" |
| กันซ้ำ | header `Idempotency-Key` (บังคับสำหรับ `write/danger`) → ตาราง `ApiIdempotency{keyId, idemKey, requestHash, status, responseJson, expiresAt}` unique `[keyId, idemKey]` · ซ้ำ+body เดิม = คืน response เดิม (200) · ซ้ำ+body ต่าง = 409 · อายุ 24 ชม. · **ระดับ service มีของเดิมอยู่แล้ว** (`refType/refId` บนเอกสาร · `idempotencyKey` บน JV) — ชั้น API ซ้อนอีกชั้นเพื่อกัน network retry |
| อันตราย | op `kind=danger` (void/reopen/unmark/merge/delete) ต้องมี scope + body `{"confirm": true}` + `reason` ≥ 5 ตัวอักษร · และ **ยิง event + audit เสมอ** |
| rate limit | ใช้ `core/rate-limit-db.ts` (Postgres · ทนข้าม instance — ตามบทเรียนใน `account/rate-limit.ts`) · ต่อคีย์: อ่าน 300/นาที · เขียน 60/นาที · รายงานหนัก (งบ/aging/ภ.พ.30) 30/นาที · fail-open ตามกติกาเดิม · ตัวเลขนี้คือค่าเริ่มต้นเพื่อคำนวณใหม่จากผู้ใช้จริงก่อนขึ้น prod (บทเรียน §12 ห้ามยกตัวเลขมาดื้อ ๆ) |
| ล็อกข้อมูล/ปิดงวด | ไม่ต้องทำอะไรเพิ่ม — `assertNotLocked`/`assertPeriodOpen` อยู่ใน chokepoint แล้ว · API แค่แปลง error ไทยเป็น `409 period_locked` |

### 2.3 รูปแบบข้อความ (สัญญาที่ AI agent อ่านครั้งเดียวแล้วใช้ได้ทุกเส้น)
- Base `https://shark.in.th/api/v1/account` · `Authorization: Bearer shark_…` · JSON UTF-8 · เวลา ISO-8601 · วันที่ `YYYY-MM-DD` (ตีความเป็นวันไทย) · **เงินเป็นสตางค์ Int** ในทุก field ที่ลงท้าย `Satang` + field คู่ `display` เป็นบาทสตริง (ตาม 07_API.md)
- ตอบสำเร็จ: `{ "data": …, "requestId": "req_…" }` · รายการ: `{ "data": [], "page": { "cursor": "…", "hasMore": true, "total"?: n }, "requestId" }` (cursor ตาม 07_API.md · ภายในใช้ `listDocumentsPaged` เดิมที่รับ page/pageSize → แปลง cursor = base64(page))
- error: `{ "error": { "code": "scope_missing", "message_th": "…", "message_en": "…", "hint"?: "…" }, "requestId" }` — code คงที่ ~20 ตัว (`unauthorized · scope_missing · not_found · validation · state_conflict · period_locked · duplicate · idempotency_conflict · rate_limited · confirm_required · upstream_unavailable · …`) · **message_th มาจาก error ไทยของ service เดิม** (`errors.ts safeReason` กรองข้อความภายในออกแล้ว)
- ทุก response มี header `X-Request-Id` · `X-RateLimit-Remaining` · เวอร์ชันผ่าน path `/v1` · เพิ่ม field = ไม่ขึ้นเวอร์ชัน · ลบ/เปลี่ยนความหมาย = `/v2`

### 2.4 กติกาที่ห้ามละเมิด (สืบทอดจาก repo)
1. route/command ห้ามมี logic ธุรกิจ · ห้ามแตะ prisma ตรง (F5 baseline) · ห้ามล้วง gl นอก service เดิม
2. เส้นเขียนของ AI = proposal เท่านั้น (03_AI_LAYER.md ข้อ 1) — REST เท่านั้นที่ทำจริง เพราะ **คีย์ REST คือการมอบสิทธิ์ล่วงหน้าโดยเจ้าของ** (ติ๊ก scope เอง) ส่วน AI คือผู้ช่วยที่เสนอ
3. tool result เป็น JSON จากข้อมูลจริง — LLM ห้ามเป็นแหล่งตัวเลข
4. ทุก op ใหม่มีข้อสอบใน oracle ก่อนโค้ด (Fable เขียน) · MockProvider ในข้อสอบ AI
5. tenant อื่นมองไม่เห็น (ทุก oracle มีข้อ cross-tenant) · systemId ต้องเป็นของ tenant ของคีย์เสมอ (ห้ามรับ tenantId จาก body)
6. เอกสาร = generate จากทะเบียน (ห้ามเขียน endpoint มือใน `developers/page.tsx` เพิ่ม)

---

## 3. ผิวหน้าสำหรับ AI agent (สิ่งที่ทำให้ "อ่านคู่มือแล้วใช้ได้เอง")

### 3.1 สกิล `account` ใน `/api/v1/ai/skills`
- `id: "account"` · `label: "บัญชี"` · `summary (EN)`: "Full Thai accounting: quotations→invoices→receipts/tax invoices, expenses & purchase orders, contacts, products, bank/cash accounts, payments & PromptPay links, WHT, cheques, journal, financial statements (P&L, balance sheet, trial balance, cash flow, VAT PP30, aging), period close, fixed assets. Use for any question about money owed/paid, revenue, expenses, taxes, or to create accounting documents." · `systems: ["ACCOUNT"]`
- เครื่องมือ (ชื่อ = `account_<op id>` ตามทะเบียน) — ชุดแรก 30 ตัว: อ่าน 16 · เขียน 11 · อันตราย 3 (ตาราง §4 คอลัมน์ "AI tool") · ทุกตัวขึ้นทะเบียนใน `SKILLS` (ด่าน `assertSkillRegistryComplete` + `qc-ai-skills`)
- proposal kind ใหม่ 14 ตัว (`account.documents.create` …) · DESTRUCTIVE_KINDS += void/reopen/merge · `KIND_ACCESS` = permission key ของ op · dispatch → command เดียวกับ REST · การ์ดยืนยันสรุปไทย (มีเลขที่/ชื่อผู้ติดต่อ/ยอดบาท/วันที่ — กติกา "ห้ามคลุมเครือ" ของแชท)
- **AI ในแอป SHARK (อนาคต)**: ไม่ต้องทำอะไรเพิ่ม — ผู้ช่วยในระบบ (`ai/service.ts` agent loop) โหลดสกิลนี้ผ่าน `load_skill` เหมือนสกิลอื่น · ยืนยันผ่านการ์ดในแชท/แอปมือถือ (`mobile/proposals/confirm`) ที่มีอยู่แล้ว ⇒ **"คุยแล้วจัดการบัญชีทั้งระบบ" = เฟส E ของแผนนี้**

### 3.2 คู่มือ 4 รูปแบบจากแหล่งเดียว
| รูปแบบ | ผู้ใช้ | ที่อยู่ | สร้างจาก |
|---|---|---|---|
| OpenAPI 3.1 JSON | นักพัฒนา/เครื่องมือ codegen/GPT Actions | `GET /api/v1/account/openapi.json` (ไม่ต้องใช้คีย์) | `registry.ts` → `openapi.ts` (zod → JSON Schema) |
| หน้าเว็บ | คน | `/developers/account` (+ `/developers` เพิ่มลิงก์) | render จาก OpenAPI + recipes |
| Markdown สำหรับ LLM | AI agent ภายนอก (Claude/GPT/Gemini อ่านตรง) | `GET /developers/account.md` + ไฟล์ `docs/api/ACCOUNT-API.md` (commit ใน repo) | generate ด้วยสคริปต์ `scripts/gen-account-api-docs.mts` · fitness ตรวจว่าไฟล์ตรงกับทะเบียน (ห้าม stale) |
| Claude skill | Claude Code/Agent SDK ของลูกค้า และของเราเอง | `.claude/skills/shark-account-api/SKILL.md` (repo) + คัดลอกไป `/root/.claude/skills/` | เขียนมือ **เฉพาะส่วน workflow/recipes** · ตาราง endpoint แทรกจาก generate |

เนื้อหาคู่มือ (ภาษาอังกฤษเป็นหลัก — LLM ประหยัด token 4 เท่า · คำศัพท์บัญชีไทยแนบ glossary): 1) auth + scopes + systemId 2) money/date/idempotency/error contract 3) **แผนที่งาน → endpoint** ("ลูกค้าจ่ายแล้ว" → `payments.record`; "ปิดเดือน" → checklist → `periods.close`) 4) state machine ต่อ docType (คัดจาก §3.0.2 ของ 12-account) 5) recipes 8 เรื่อง (ขายครบวงจร · มัดจำ · รายจ่าย+WHT · PO→ซื้อ · PromptPay · กระทบยอด · ปิดงวด · อ่านงบ) 6) safety: อะไรทำจริง อะไรต้องคน 7) webhook

---

## 4. ตารางครอบคลุมทุกฟังก์ชัน (ฟังก์ชัน ↔ service ↔ REST ↔ สิทธิ์ ↔ AI tool)

> คอลัมน์ "AI": ✅R = tool อ่าน · ✅W = tool เขียน (proposal) · ✅D = อันตราย (ยืนยัน 2 ชั้น) · — = REST เท่านั้น (AI ไม่ควรทำ เช่น ตั้งค่า/นำเข้า) · `kind` ของ REST อยู่ในวงเล็บหลัง path · path ทั้งหมดอยู่ใต้ `/api/v1/account`

### 4.1 หน้าหลัก + ภาพรวม
| ฟังก์ชัน (UI) | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| การ์ดสรุป ค้างรับ/ค้างจ่าย/พ้นกำหนด · เงินคุณอยู่ไหน · งานที่รอคุณ | `dashboard.ts dashboardSnapshot` · `dashboard-home.ts loadDashboardHome` · `pendingTasks` | `GET /dashboard` (read) | doc.view | ✅R `account_dashboard` |
| กราฟรายรับ-รายจ่าย 12 เดือน · โดนัทหมวด · อันดับลูกค้า/ผู้ขาย/สินค้า | `monthlySeries` · `categoryBreakdown` · `topCustomers/topVendors/topProducts` | `GET /dashboard/series?months=` · `GET /dashboard/top?kind=customers\|vendors\|products` (read) | doc.view | ✅R (รวมใน dashboard args) |
| ภาพรวมรายรับ/รายจ่าย (`overview/revenue`, `overview/expense`) | `overview.ts loadOverview` | `GET /overview?side=revenue\|expense&period=` (read) | doc.view | ✅R `account_overview` |

### 4.2 รายรับ + รายจ่าย (เอกสาร 22 ชนิด — engine เดียว)
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| รายการเอกสาร (แท็บ/ค้นหา/ตัวกรอง/แบ่งหน้า) ทั้งรายรับและรายจ่าย | `listDocumentsPaged` · `listExpenseDocsPaged` · `computeListTabCounts` · `listGoodsIssuePaged` | `GET /documents?type=&tab=&q=&contactId=&from=&to=&cursor=` (read) | doc.view | ✅R `account_list_documents` |
| รายละเอียดเอกสาร + บรรทัด + การชำระ + ความสัมพันธ์ + ไฟล์แนบ + JV | `getDocDetailData` · `getDocument` · `getExpenseDoc` · `listJournalEntriesForDocument` | `GET /documents/{id}` (read) | doc.view | ✅R `account_get_document` |
| สร้างร่าง (ทุก docType ที่สร้างตรงได้: QT/IV/DR/CN/DN/EX/PC/PO/APO/AP/PTX/DP/CNR/DNR) | `createDocument` · `createExpenseDoc` · `createPurchaseOrder` | `POST /documents` (write) body `{type, contactId?, issueDate, dueDate?, vatMode?, lines[], discountSatang?, note?, tags?, refType?, refId?}` | doc.create | ✅W `account_create_document` |
| แก้ร่าง | `updateDocument` · `updateExpenseDoc` | `PATCH /documents/{id}` (write · DRAFT เท่านั้น → 409 `state_conflict`) | doc.create | ✅W |
| ออกเอกสาร (จองเลข + โพสต์ GL) | `issueDocument` · `issueExpenseDoc` | `POST /documents/{id}/issue` (write) | doc.issue | ✅W `account_issue_document` |
| แปลงเอกสาร QT→IV/DR · IV→RE/TX/CN/DN · PO→PC/AP | `convertDocument` · `convertPurchaseOrder` | `POST /documents/{id}/convert` body `{toType, lineIds?, deposits?}` (write) | doc.create | ✅W `account_convert_document` |
| ตอบรับ/ปฏิเสธใบเสนอราคา (มือ) | `setQuotationResponse` | `POST /documents/{id}/respond` body `{accepted, note?}` (write) | doc.create | ✅W |
| อนุมัติ/ส่งอนุมัติ/ไม่อนุมัติ (PO/APO + เพดานวงเงิน) | `submitForApproval` · `approvePurchaseOrder` · `rejectPurchaseOrder` · `approveDocAction` · `approval-cap.ts` | `POST /documents/{id}/submit-approval` · `/approve` · `/reject` (write · เกินเพดาน → 403 `approval_cap`) | doc.approve | ✅W `account_approve_document` |
| ยกเลิกเอกสาร (reversal) | `voidDocument` · `voidExpenseDoc` | `POST /documents/{id}/void` body `{reason, confirm:true}` (danger) | doc.void | ✅D `account_void_document` |
| ยกเลิกร่าง (ไม่มีผลบัญชี) | `cancelDraft` | `DELETE /documents/{id}` (write · DRAFT เท่านั้น) | doc.create | ✅W |
| รับใบกำกับภาษีซื้อ (PTX มาแล้ว) · รับสินทรัพย์แล้ว | `receivePurchaseTaxInvoice` · `markAssetReceived` | `POST /documents/{id}/receive` (write) | payment.record | ✅W |
| หักมัดจำในใบแจ้งหนี้ / ตั้งมัดจำที่จะหัก | `listDeductibleDeposits` · `setDocDeposits` · `setExpenseDocDeposits` | `GET /documents/{id}/deposits` · `PUT /documents/{id}/deposits` (write) | doc.create | ✅W (ผ่าน create args) |
| ใบวางบิล (รวมหลาย IV) · ใบรวมจ่าย (รวมหลาย PC/EX) | `group.ts createGroupDoc` · `listGroupCandidates` · `recordGroupPayment` · `voidGroupPayment` | `POST /documents` `type=BILLING_NOTE\|COMBINED_PAYMENT` + `childIds[]` · `GET /documents/group-candidates?type=&contactId=` (write/read) | doc.create | ✅W `account_create_billing_note` |
| ลิงก์สาธารณะขอใบกำกับภาษี (QR) | `ensurePublicTaxInvoiceLink` · `getOrCreatePublicLinkAction` | `POST /documents/{id}/public-link` · `DELETE` (write) → คืน URL `/r/{token}` | doc.public_link | ✅W |
| แท็กเอกสาร · รายการโปรด | `listUsedTags` · `saveDocFavorite` · `getDocFavorites` | `GET /tags` · `GET /favorites` · `PUT /documents/{id}/tags` (read/write) | doc.create | — |
| ไฟล์แนบบนเอกสาร | `uploadDocAttachmentAction` · `listDocumentAttachmentFiles` · `deleteDocAttachmentAction` | `POST /documents/{id}/attachments` (multipart) · `GET` · `DELETE /attachments/{attId}` | doc.create | — |
| พิมพ์/PDF · ส่งอีเมลเอกสาร | `print/[docId]` (HTML) · `sendPaymentReminder` · `email.ts` | `GET /documents/{id}/print` (HTML A4 · read) · `POST /documents/{id}/email` body `{to, message?}` (write) | doc.view | ✅W `account_email_document` |
| เอกสารประจำ (รายเดือนอัตโนมัติ) | `listRecurringRules` · `createRecurringRule` · `updateRecurringRule` · `setRecurringRuleActive` · `deleteRecurringRule` · `runRecurringRules` · `listRecurringRuns` | `GET/POST /recurring` · `PATCH/DELETE /recurring/{id}` · `POST /recurring/{id}/run` (write) | doc.create | ✅W `account_create_recurring` |
| ⌘K สร้างด่วนจากประโยค ("ใบแจ้งหนี้ ณัฐพล 24900") | `quick-create-parse.ts parseQuickCreateQuery` | `POST /documents/parse` body `{text}` → ร่าง input ไม่บันทึก (read) | doc.view | ✅R `account_parse_quick_create` (ให้ AI ใช้ตีความก่อนสร้าง) |
| เตือนครบกำหนด (ส่งอีเมล/LINE) | `runAccountReminders` · `sendPaymentReminder` | `POST /documents/{id}/remind` (write) | doc.view | ✅W |
| นำเข้า CSV เอกสาร/ผู้ติดต่อ/สินค้า/ผังบัญชี | `import-actions.ts previewImportCore` · `runImportCore` | `POST /import/preview` · `POST /import/run` (multipart · write · rate 20/ชม.) | import | — |
| เลิกทำ 5 นาที | `undo-stack.ts` | ไม่เปิดเป็น API (ผูก UI) — API ใช้ `void`/`DELETE` แทน | — | — |

### 4.3 ผู้ติดต่อ
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| รายการ + ค้นหา + กลุ่ม + ยอดค้าง | `listContactsPage` · `outstandingBothByContacts` · `loadContactsSidebar` | `GET /contacts?q=&kind=&group=&cursor=` (read) | contact.manage (อ่าน: doc.view) | ✅R `account_search_contacts` |
| โปรไฟล์ 360° | `contactProfile` · `getContactDetail` | `GET /contacts/{id}` (read) | doc.view | ✅R `account_get_contact` |
| สร้าง/แก้/ซ่อน (+ตรวจซ้ำ + normalize เบอร์/เลขภาษี) | `createContact` · `updateContact` · `archiveContact` · `checkContactDuplicates` | `POST /contacts` · `PATCH /contacts/{id}` · `DELETE /contacts/{id}` (write · ซ้ำ → 409 `duplicate` + รายการที่ชน) | contact.manage | ✅W `account_create_contact` / `account_update_contact` |
| ตรวจเลขผู้เสียภาษี DBD | `dbd.ts lookupJuristic` | `GET /contacts/lookup-tax-id/{taxId}` (read · 503 ถ้าไม่มี key) | contact.manage | ✅R |
| กลุ่มผู้ติดต่อ | `createContactGroup` · `addContactsToGroup` · `removeContactFromGroup` | `GET/POST /contact-groups` · `POST /contact-groups/{id}/members` · `DELETE …/{contactId}` (write) | contact.manage | — |
| รวมผู้ติดต่อซ้ำ | `listMergeCandidates` · `mergeContacts` · `dismissMergeCandidate` | `GET /contacts/merge-candidates` · `POST /contacts/merge` body `{keepId, mergeId, confirm:true}` (danger) · `POST /contacts/merge-candidates/{pair}/dismiss` | contact.merge | ✅D `account_merge_contacts` |
| เชื่อมกับสมาชิก/CRM/แชท (Party) | `suggestLinks` · `linkContactTo` | `GET /contacts/{id}/link-suggestions` · `POST /contacts/{id}/links` (write) | contact.manage | — |
| ลูกค้าประจำ (กฎ) · ผู้ขายยอดนิยม | `saveRegularCustomerRule` · `insertPopularVendors` | `GET/PUT /contacts/regular-rule` · `POST /contacts/popular-vendors` (write) | settings.manage | — |

### 4.4 สินค้า/บริการ + คลัง
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| รายการสินค้า + สต็อก | `listProductsPaged` · `listProductsWithStock` · `productStockMap` | `GET /products?q=&kind=&cursor=` (read) | doc.view | ✅R `account_search_products` |
| รายละเอียด + ความเคลื่อนไหว | `productModalData` · `productMovements` · `getProduct` | `GET /products/{id}` · `GET /products/{id}/movements` (read) | doc.view | ✅R |
| สร้าง/แก้/ซ่อน (+ตรวจซ้ำ + รหัสอัตโนมัติ) | `createProduct` · `updateProduct` · `archiveProduct` · `checkProductDuplicates` | `POST /products` · `PATCH /products/{id}` · `DELETE /products/{id}` (write) | product.manage | ✅W `account_create_product` |
| หน่วยนับ · กลุ่มจัดประเภท | `listUnits/createUnit/renameUnit/archiveUnit` · `listCategories/createCategory/updateCategory/archiveCategory` | `GET/POST /units` · `PATCH/DELETE /units/{id}` · เดียวกันกับ `/categories` (write) | product.manage | — |
| จัดชุดสินค้า (bundle) | `listBundleItems` · `setBundleItems` | `GET/PUT /products/{id}/bundle` (write) | product.manage | — |
| ยอดยกมาหลาย lot | `listOpeningLots` · `addOpeningLot` | `GET/POST /products/{id}/opening-lots` (write) | product.manage | — |
| ใบเบิก/ใบส่งคืน/ใบปรับต้นทุน (โพสต์ GL) | `createGoodsMovement` · `approveGoodsMovement` · `createCostAdjustment` · `returnableQtyForIssue` | `POST /stock-documents` body `{type: GOODS_ISSUE\|GOODS_ISSUE_RETURN\|COST_ADJUSTMENT, lines[]}` · `POST /stock-documents/{id}/approve` (write) | product.manage | ✅W `account_issue_goods` |
| ผูก/แยกกับคลังกลาง InvItem | `linkProductToItem` · `unlinkProductFromItem` · `syncProductToItem` | `POST /products/{id}/link-inventory` · `DELETE` (write) | product.manage | — |

### 4.5 การเงิน
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| ช่องทางการเงิน + ยอดคงเหลือ | `financeBalances` · `listFinanceAccounts` · `groupFinanceAccounts` | `GET /finance-accounts` (read) | finance.manage (อ่าน: doc.view) | ✅R `account_finance_balances` |
| สร้าง/แก้/ซ่อน + ยอดยกมา | `createFinanceAccount` · `updateFinanceAccount` · `archiveFinanceAccount` · `addFinanceOpeningEntry` ฯลฯ | `POST /finance-accounts` · `PATCH/DELETE /finance-accounts/{id}` · `POST /finance-accounts/{id}/opening` (write) | finance.manage | — |
| statement ความเคลื่อนไหว | `financeStatement` | `GET /finance-accounts/{id}/statement?from=&to=` (read · CSV ได้) | finance.manage | ✅R |
| โอนระหว่างช่องทาง · เงินสดย่อย เติม/เบิกชดเชย | `transferBetweenFinance` · `pettyCashReplenish` · `topUpPettyCash` · `reimbursePettyCash` | `POST /finance-transfers` · `POST /petty-cash/top-up` · `POST /petty-cash/reimburse` (write) | finance.manage | ✅W `account_transfer_funds` |
| ภาพรวมการเงิน + ปฏิทินเงินสด | `financeOverview` · `financeDayDetail` · `cashCalendar` | `GET /finance/overview?month=` · `GET /finance/calendar?month=` (read) | finance.manage | ✅R |
| **รับ/จ่ายชำระ** (หลายเอกสาร/หลายช่องทาง/WHT/ค่าธรรมเนียม/เช็ค) | `payment.ts recordPayments` · `service.recordPayment` · `recordVendorPayment` · `approveReceiptWithPayments` | `POST /payments` body `{documentIds[], paidAt, channel, financeAccountId?, amountSatang, whtRateBp?, feeSatang?, cheque?}` (write · row-lock เดิม) | payment.record | ✅W `account_record_payment` |
| ยกเลิกการชำระ · คืนมัดจำ | `voidPaymentAny` · `voidPayment` · `refundDeposit` | `POST /payments/{id}/void` body `{reason, confirm:true}` (danger) · `POST /documents/{id}/refund-deposit` (write) | payment.void | ✅D `account_void_payment` |
| ลิงก์ชำระเงิน/QR PromptPay (+Beam) | `createPaymentRequest` · `listPaymentRequests` · `cancelPaymentRequest` · `confirmStaticPaymentRequest` | `POST /payment-requests` body `{documentId, expiresAt?}` → `{url, qrPayload}` · `GET /payment-requests?documentId=` · `POST /payment-requests/{id}/cancel` · `POST /payment-requests/{id}/confirm` (write · rate 60/ชม.) | payment.record | ✅W `account_create_payment_link` |
| กระทบยอดธนาคาร | `previewStatementImport` · `importStatement` · `autoMatch` · `manualMatch` · `unmatch` · `skipLine` · `createEntryFromLine` · `confirmMonth` · `reopenMonth` · `reconcilePageData` | `POST /reconcile/statements` (multipart CSV) · `GET /reconcile?financeAccountId=&period=` · `POST /reconcile/auto-match` · `POST /reconcile/lines/{id}/match` · `/unmatch` · `/skip` · `/create-entry` · `POST /reconcile/{period}/confirm` · `/reopen` (write) | reconcile | ✅R สถานะ · ✅W `account_auto_match_statement` |
| เช็ครับ/จ่าย lifecycle | `listChequesV2` · `createCheque` · `depositCheque` · `clearCheque` · `bounceCheque` · `voidCheque` · `chequeSummaryV2` | `GET/POST /cheques` · `POST /cheques/{id}/deposit` · `/clear` · `/bounce` · `/void` (write; void = danger) | cheque.manage + cheque.deposit/clear/bounce/void | ✅W `account_update_cheque` |
| WHT 2 ขา + 50 ทวิ + ภ.ง.ด.3/53 | `listWhtDeductions` · `listWhtCredits` · `issueWhtCert` · `issueWhtCreditCert(Standalone)` · `getWhtCert` · `pnd` · `pndCsv` · `whtCreditsCsv` · `markFiled` · `unmarkFiled` · `listWhtFilings` | `GET /wht?direction=&period=` · `POST /wht/certs` · `GET /wht/certs/{id}` (+`/print`) · `GET /wht/pnd?type=3\|53&period=` (JSON/CSV) · `POST /wht/filings` body `{period,type,certIds[]}` · `POST /wht/filings/{id}/unmark` (danger) | wht.manage · wht.unmark | ✅R `account_wht_summary` · ✅W `account_issue_wht_cert` |

### 4.6 บัญชี (GL · งบ · งวด · สินทรัพย์)
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| ผังบัญชี (tree/รายละเอียด/ยอด ณ วันที่) | `chartTree` · `ledgerDetail` · `ledgerRunning` · `listLedgers` | `GET /chart?asOf=` · `GET /chart/{id}?from=&to=` (read) | chart.manage (อ่าน: journal.view) | ✅R `account_chart_of_accounts` |
| เพิ่ม/แก้/เปิด-ปิดใช้บัญชี · ปักหมุด | `createLedgerV2` · `updateLedgerV2` · `setLedgerActive` · `archiveBlockReason` · `setPinnedLedgerAccounts` | `POST /chart` · `PATCH /chart/{id}` · `POST /chart/{id}/active` (write) | chart.manage | — |
| การผูกบัญชีอัตโนมัติ (mapping) · บัญชี default ต่อ docType | `listMappings` · `setMapping` · `listDocTypeAccounts` · `setDocTypeAccount` | `GET /mappings` · `PUT /mappings/{key}` · `GET/PUT /doc-type-accounts/{type}` (write) | mapping.manage | — |
| สมุดรายวัน (5 เล่ม · ⚑ needsReview) | `listJournalPaged` · `journalEntryDetail` · `toggleNeedsReview` | `GET /journal?book=&from=&to=&needsReview=&cursor=` · `GET /journal/{id}` · `POST /journal/{id}/flag` (read/write) | journal.view | ✅R `account_list_journal` |
| JV มือ · กลับรายการ | `createManualEntry` · `validateManualJv` · `reverseJournalEntry` · `postManualJV` | `POST /journal` body `{date, book?, lines[{accountId, debitSatang, creditSatang, memo?}], memo}` (write · Σdr≠Σcr → 422) · `POST /journal/{id}/reverse` body `{reason, confirm:true}` (danger) | journal.adjust | ✅W `account_post_journal` · ✅D |
| บัญชีแยกประเภท | `ledger/page.tsx` (prisma ตรง) → ย้ายเป็น service `generalLedger()` ใน WO B4 | `GET /reports/general-ledger?accountId=&from=&to=` (read · CSV) | journal.view | ✅R |
| งบทดลอง · กำไรขาดทุน · ฐานะการเงิน · กระแสเงินสด · ภ.พ.30 · aging AR/AP | `trialBalance` · `profitLoss` · `balanceSheet` · `cashFlow` · `pp30` · `pp30Csv` · `agingReport` | `GET /reports/trial-balance?from=&to=` · `/profit-loss?from=&to=&compare=1` · `/balance-sheet?asOf=` · `/cash-flow?from=&to=` · `/vat-pp30?period=&creditCarry=` · `/aging?direction=AR\|AP&asOf=` (read · `Accept: text/csv` ได้ทุกตัว · rate 30/นาที) | report.view · tax.view | ✅R `account_report` (arg `kind`) — **นี่คือหัวใจของ "ถาม AI เรื่องเงิน"** |
| drill-down รายงาน → บัญชี → เอกสาร | `report-drill.ts` | รวมใน response ของรายงาน (`rows[].accountId` + `href`) | report.view | ✅R |
| งวดบัญชี: เช็กลิสต์ · ปิด · เปิดใหม่ · ปิดอัตโนมัติ | `listPeriods` · `periodChecklist` · `closePeriodWithChecklist` · `reopenPeriodV2` · `markVatFiled` · `unmarkVatFiled` | `GET /periods` · `GET /periods/{key}/checklist` · `POST /periods/{key}/close` (write) · `POST /periods/{key}/reopen` body `{reason, confirm:true}` (danger) · `POST /periods/{key}/vat-filed` · `DELETE` (danger) | period.close · period.reopen | ✅R checklist · ✅W `account_close_period` · ✅D |
| ทะเบียนสินทรัพย์ + ค่าเสื่อม | `listAssets` · `assetDetail` · `registerAsset` · `previewDepreciation` · `runDepreciation` · `disposeAsset` · `listAssetSourceDocs` | `GET /assets` · `GET /assets/{id}` · `POST /assets` · `GET /assets/depreciation/preview?period=` · `POST /assets/depreciation/run` body `{period}` (idempotent) · `POST /assets/{id}/dispose` (write) | asset.manage · asset.register · asset.dispose · asset.writeoff | ✅R `account_assets` · ✅W `account_run_depreciation` |
| ตรวจสอบประวัติ (audit) | `listAuditLogs` · `listDocAuditLogs` | `GET /audit?targetId=&action=&cursor=` (read) | settings.manage | ✅R |

### 4.7 คลังเอกสาร + กล่องขาเข้า
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| รายการไฟล์ (แท็บ/โฟลเดอร์/ค้นหา) | `listAttachmentsPaged` · `listFolders` · `listAttachmentUploaders` | `GET /files?folder=&q=&status=&cursor=` (read) | document.manage | ✅R |
| อัปโหลด (sha256 dedupe · sniff MIME) | `createAttachment` · `validateAttachmentBytes` · `findAttachmentBySha256` | `POST /files` (multipart ≤ 20MB · write) | document.manage | ✅W `account_upload_file` (สำหรับ agent ที่ได้รูปบิลจากผู้ใช้) |
| ผูก/แยก/ย้าย/archive/restore/ไม่ใช่เอกสารบัญชี | `linkAttachment` · `unlinkAttachment` · `moveAttachment(sBulk)` · `archiveAttachment(sBulk)` · `restoreAttachment` · `markNotAccounting` · `setDocTypeHint` | `PATCH /files/{id}` body `{documentId?, folder?, archived?, notAccounting?, docTypeHint?}` · `POST /files/bulk` (write) | document.manage | — |
| กล่องขาเข้า + AI อ่านบิล → ร่างค่าใช้จ่าย | `inboxStats` · `ingestInboxFiles` · `inbox-ai.ts readBill` · `prefillFromExtract` · `createExpenseFromAttachment` | `GET /inbox` · `POST /inbox/{fileId}/read` (AI · rate 200/วัน · write เพราะเสียเครดิต) · `POST /inbox/{fileId}/create-expense` (write) | document.manage + doc.create | ✅W `account_read_bill_image` → ต่อด้วย `account_create_document` |
| รับอีเมล inbox@ (รอ infra) | `ingestInboundEmail` · `inboxEmailAddress` | `GET /inbox/email-address` (read) · webhook ขาเข้า `/api/inbox/email` (เดิม รอ provider) | document.manage | — |

### 4.8 ตั้งค่า
| ฟังก์ชัน | service | REST | สิทธิ์ | AI |
|---|---|---|---|---|
| ข้อมูลกิจการ/ภาษี/โลโก้ | `getSettings` · `saveSettings` | `GET /settings` · `PATCH /settings` (write) | settings.manage (อ่าน: doc.view — AI ต้องรู้ว่าจด VAT ไหม) | ✅R `account_settings` |
| เอกสารและเลขที่ (pattern/reset/เลขถัดไป/หมายเหตุ/วันครบกำหนด/ช่องทาง/แท็ก/ลิงก์สาธารณะ/ใบกำกับอัตโนมัติ/เทมเพลตพิมพ์) | `doc-settings.ts` 16 ฟังก์ชัน · `settings-actions.ts` 11 action | `GET /settings/documents` · `PATCH /settings/documents/{type}` · `POST /settings/documents/{type}/next-no` · `GET /settings/documents/{type}/gaps` (write) | settings.manage | — |
| นโยบายบัญชี (ปีบัญชี/VAT timing/WHT default/ล็อกก่อนวันที่/ชื่อซ้ำ/ปิดงวดอัตโนมัติ/รายงานอีเมล) | `getPolicy` · `savePolicy` · `validatePolicyPatch` | `GET /settings/policy` · `PATCH /settings/policy` (write) | settings.manage | ✅R (รวมใน `account_settings`) |
| สิทธิ์ผู้ใช้งาน matrix + เพดานอนุมัติ | `permissions-service.ts` 11 ฟังก์ชัน | `GET /settings/permissions` · `PUT /settings/permissions/roles/{key}` · `POST /settings/permissions/assign` · `PUT /settings/permissions/caps/{userId}` (write) | settings.manage (+`settings.staff.write` ชั้น 2 เดิม) | — |
| การเชื่อมต่อระบบใน SHARK (7 ชนิด + ตัวเลือก) | `connections.ts listLinks/connect/disconnect/setLinkOptions/buildConnectionCards` | `GET /links` · `POST /links` · `PATCH /links/{id}` · `DELETE /links/{id}` (write) | settings.manage | — |
| คีย์ API + webhook (ระดับร้าน) | `api-keys/service.ts` · `webhooks/service.ts` | `GET /api-keys` (ไม่คืน hash) · **ไม่เปิด POST ผ่าน API** (คีย์สร้างคีย์ = ยกระดับสิทธิ์) · `GET/POST /webhooks` · `PATCH/DELETE /webhooks/{id}` · `POST /webhooks/{id}/test` · `GET /webhooks/{id}/deliveries` (write) | settings.manage + `webhook.endpoint.*` | — |
| รายงานอีเมล (รายวัน/สัปดาห์) | `email-report.ts` · `runAccountEmailReports` | `POST /reports/email` body `{kind}` (write · rate 20/วัน) | report.view | ✅W |
| คู่มือในแอป `/help` · `HELP_TEXTS` | `help-texts.ts` | `GET /help/glossary` (read · ไม่ต้องใช้คีย์) — ให้ AI ใช้อธิบายศัพท์ | — | ✅R (core ของสกิล) |

### 4.9 นับรวม
| ประเภท | REST endpoint (นับ method+path) | AI tool |
|---|---|---|
| read | ~48 | 16 |
| write | ~62 | 11 |
| danger | ~9 | 3 |
| **รวม** | **~119 เส้นทาง / ~82 op ในทะเบียน** | **30** |

สิ่งที่ **ตั้งใจไม่เปิด**: `undo` (ผูก UI) · `dev-components` · `saveFavoriteLines` แบบ UI · `POST /api-keys` (คีย์สร้างคีย์) · `permissions` ผ่าน AI · `import` ผ่าน AI · public JSON ของ `/pay` `/r` (คงเป็นหน้าเว็บ)

---

## 5. Webhook — event ที่ต้องเพิ่ม (ให้แอปภายนอกไม่ต้อง poll)
ทุกตัว: ประกาศใน `webhooks/labels.ts` + consumer ใน `outbox-consumers.ts` + ยิงจากจุด service เดิม (ใน tx เดียวกับงานหลัก) + `idempotencyKey` ตามแพตเทิร์น `account.<event>#<id>`
| event | ยิงจาก | payload หลัก |
|---|---|---|
| `account.document.issued` | `issueDocument` · `issueExpenseDoc` (ทุก docType) | `{documentId, type, docNo, contactId, grandTotalSatang, issueDate}` |
| `account.document.voided` | `voidDocument` · `voidExpenseDoc` | `{documentId, type, docNo, reason}` |
| `account.document.approved` (มีแล้ว — ขยายให้ครอบ APO/approval flow ทุกชนิด) | `approvePurchaseOrder` · `approveDocAction` | เดิม |
| `account.quotation.responded` | `setQuotationResponse` + หน้า public | `{documentId, accepted}` |
| `account.payment.recorded` (มี) · `account.invoice.paid` (มี) · `account.payment.voided` (ใหม่) | `recordPayment` · `voidPaymentAny` | เดิม + `{paymentId, reason}` |
| `account.payment_request.paid` · `.expired` | `handleBeamPaid` · `confirmStaticPaymentRequest` · `expireRequests` | `{requestId, documentId, amountSatang, provider}` |
| `account.contact.created` · `.updated` · `.merged` | `createContact` · `updateContact` · `mergeContacts` | `{contactId, code, name, taxId}` |
| `account.product.created` · `.updated` | `createProduct` · `updateProduct` | `{productId, code, name}` |
| `account.cheque.changed` | ทุก transition | `{chequeId, from, to}` |
| `account.reconcile.confirmed` | `confirmMonth` | `{financeAccountId, period}` |
| `account.period.closed` (มี) · `account.period.reopened` (ใหม่) | `reopenPeriodV2` | `{period, reason}` |
| `account.asset.depreciated` · `.disposed` | `runDepreciation` · `disposeAsset` | `{assetId?, period, amountSatang}` |
| `account.recurring.ran` | `runRecurringRules` | `{ruleId, documentId}` |

---

## 6. ความปลอดภัย — เกณฑ์ผ่านก่อนเปิดใช้บน prod
1. **cross-tenant**: ทุก op มีข้อสอบ "คีย์ร้าน A เรียกด้วย id ของร้าน B → 404 ไม่ใช่ 403" (ไม่บอกว่ามีอยู่)
2. **cross-system**: คีย์ผูกสมุด X เรียก header ระบุสมุด Y → 403 `system_mismatch`
3. **scope**: ทุก write ทดสอบ "คีย์อ่านอย่างเดียว → 403 scope_missing" · danger ไม่มี `confirm` → 409 `confirm_required`
4. **idempotency**: ยิง `POST /documents/{id}/issue` ซ้ำ 2 ครั้งพร้อมกัน (Promise.all) → เลขที่เดียว · JV 1 ใบ (บทเรียน "ตัวนับร่วมต้องจบใน SQL คำสั่งเดียว")
5. **ล็อกงวด/วันที่**: ทุก write ที่มีวันที่ทดสอบ 409 `period_locked`
6. **input**: zod ทุก body · `additionalProperties:false` · เงินต้องเป็น Int สตางค์ ≥0 · qty Decimal(12,4) · วันที่ valid · ไม่รับ `tenantId`/`systemId` ใน body
7. **secrets**: response ห้ามมี `keyHash`/`secret`/`publicToken` ของเอกสารอื่น · log ห้ามมี Bearer
8. **rate limit**: DB-based · ทดสอบ 429 + `Retry-After` · fail-open เมื่อ DB ล่ม (มี log ops)
9. **CSV injection** (บทเรียน 9.2): ทุก CSV ผ่าน sanitizer เดิม
10. **audit**: ทุก write มี AuditLog actorType `API_KEY` + keyName · ตรวจใน oracle ว่าจำนวน AuditLog เพิ่มเท่ากับจำนวน write
11. **AI lane**: ทุก tool เขียนต้องเป็น proposal (ข้อสอบ: เรียก `/api/v1/ai/tools/account_issue_document` → `pendingConfirmation:true` และ DB ไม่เปลี่ยน)
12. หน้าเอกสาร `/developers/account` + `openapi.json` เปิดสาธารณะได้ แต่ **ห้ามมีข้อมูลร้านใด ๆ** (ตัวอย่างเป็น fixture)

---

## 7. แผนงาน (WO) — 6 เฟส · 24 WO · Fable คุม/เขียนข้อสอบ · Opus สร้าง · Sonnet เอกสาร

> ประเมินเป็น "วันงาน agent" (1 วัน ≈ 1 sub-agent ทำต่อเนื่อง + Fable ตรวจ) · ทำทีละ WO ตามกติกาเครื่อง (งานหนักทีละ 1) · ทุก WO จบด้วย `pnpm qc:all` + oracle ใหม่เขียว + typecheck + push · migration additive เท่านั้น

### เฟส A — รากฐาน (ต้องเสร็จก่อนเปิดเส้นใด ๆ) ≈ 4–5 วัน
| WO | งาน | ผู้ทำ | เกณฑ์ผ่าน |
|---|---|---|---|
| A1 | migration `ApiKey` + `scopesJson/systemId/expiresAt/kind/createdById` · `ActorType.API_KEY` · ตาราง `ApiIdempotency` · `api-keys/service.ts` รองรับ scope/หมดอายุ/หมุน (`rotateApiKey` = สร้างใหม่+เพิกถอนเก่าใน tx) · คีย์เก่า = พฤติกรรมเดิมเป๊ะ | Opus | `qc-public-api` เดิมเขียว + ข้อสอบใหม่ `qc-account-api-keys` (scope/expiry/rotate/ผูก system) |
| A2 | หน้า "ตั้งค่า › การเชื่อมต่อ › แอปภายนอก/API" ในบัญชี: สร้างคีย์ **ผูกสมุดนี้** + เลือก bundle/scope รายตัว + วันหมดอายุ + หมุน + แสดง scope ในตาราง · ลิงก์ไป `/developers/account` · หน้า `/app/settings/api` เดิมเพิ่มคอลัมน์ scope | Opus | ภาพจริงเทียบเฟรม g14 (Fable ดูตา) · `qc-acc-v2-permissions` เขียว |
| A3 | `account/api/`: `actor.ts` (MembershipCtx สังเคราะห์) · `requireAccountApi()` · `respond.ts` (envelope/error code/requestId/rate headers) · `idempotency.ts` · `registry.ts` (ชนิด + validator) · catch-all route · error mapping จาก Thai errors → code · rate limit DB | Opus | oracle `qc-account-api-core` (401/403/404/409/422/429 · idempotency · cross-tenant/system) |
| A4 | generator: `openapi.ts` (zod→JSON Schema) · `GET /api/v1/account/openapi.json` · `scripts/gen-account-api-docs.mts` → `docs/api/ACCOUNT-API.md` · fitness ใหม่ **F10**: ทุก op ในทะเบียนมี `test` id ที่มีจริงในสคริปต์ oracle + doc ไม่ stale | Opus | `pnpm fitness` เขียว · `openapi.json` validate ผ่าน (spectral/openapi-typescript) |

### เฟส B — อ่านทั้งหมด (ปลอดภัย ใช้ได้ทันที) ≈ 4 วัน
| WO | งาน | เกณฑ์ผ่าน |
|---|---|---|
| B1 | เอกสาร: `GET /documents` · `/documents/{id}` · `/print` · tags/favorites/attachments list · `/documents/parse` · recurring list | oracle เทียบกับ `acc-v2-expected.json` (เฉลยชุดเดิม!) — ตัวเลขต้องตรง UI เป๊ะ |
| B2 | ผู้ติดต่อ/สินค้า/หน่วย/กลุ่ม/merge-candidates/DBD/link-suggestions (read) | เดียวกัน |
| B3 | การเงิน: finance-accounts/statement/overview/calendar/payment-requests/reconcile status/cheques/wht (read) | เดียวกัน |
| B4 | บัญชี: chart/journal/**general-ledger (ย้าย prisma ตรงจาก `ledger/page.tsx` เป็น service — หนี้เดิม)**/รายงาน 6 ตัว JSON+CSV/periods+checklist/assets/audit/settings/policy/links/files/inbox/help-glossary · dashboard/overview | รายงานเทียบ `qc-account-cpa` (107 ข้อ) ตัวเลขเดียวกัน |

### เฟส C — เขียนเส้นเงินหลัก ≈ 5–6 วัน
| WO | งาน | เกณฑ์ผ่าน |
|---|---|---|
| C1 | เอกสาร: create/patch/delete draft/issue/convert/respond/deposits/public-link/tags/attachments upload/email/remind (รายรับ+รายจ่าย+PO+PTX receive+asset receive+approval flow) | oracle "ขายครบวงจร QT→IV→รับเงิน→RE+TX" ผ่าน REST ล้วน แล้ว GL ตรง `qc-account-cpa` · idempotency ยิงซ้ำ |
| C2 | payments record/void · refund-deposit · payment-requests create/cancel/confirm · group docs (billing note/combined payment) | row-lock ทดสอบยิงพร้อมกัน (บทเรียน 9.2 ข้อ 12) |
| C3 | contacts/products/units/categories/bundle/opening-lots/stock-documents/link-inventory (write) · contact-groups | ตรวจซ้ำ → 409 พร้อมรายการ · สต็อกตัดใน tx เดียว (`qc-acc-v2-products`) |
| C4 | webhook event ชุด §5 (issued/voided/quotation/payment.voided/payment_request/contact/product) + consumer + labels | `qc-webhook` + ข้อสอบ "event ค้าง PENDING = 0" (บทเรียน 30 ส.ค.) |

### เฟส D — เขียนขั้นสูง (นักบัญชี) ≈ 4–5 วัน
| WO | งาน | เกณฑ์ผ่าน |
|---|---|---|
| D1 | finance-accounts CRUD/opening · transfers · petty cash · cheques lifecycle · WHT certs/pnd/filings(+unmark) | `qc-cheque-audit` · `qc-tax-print-audit` เขียว |
| D2 | journal JV/reverse/flag · chart CRUD/active/pin · mappings · doc-type-accounts · periods close/reopen/vat-filed · assets register/depreciation/dispose | `qc-account-cpa` ปิดงวดผ่าน REST ได้ผลเท่า UI |
| D3 | reconcile (statement upload/auto-match/manual/confirm/reopen) · recurring CRUD/run · import preview/run · files PATCH/bulk · inbox read/create-expense · reports/email | `qc-acc-v2-reconcile` · rate limit AI bill 200/วัน |
| D4 | settings PATCH · settings/documents · policy · permissions · links · webhooks CRUD/test/deliveries · api-keys list · webhook events ที่เหลือ (cheque/reconcile/period.reopened/asset/recurring) | `qc-acc-v2-settings*` เขียว |

### เฟส E — AI skill `account` (ทำให้ "คุยแล้วจัดการได้") ≈ 3–4 วัน
| WO | งาน | เกณฑ์ผ่าน |
|---|---|---|
| E1 | `ai/tools-account.ts` generate 30 tools จากทะเบียน (read → execute · write → proposal) · สกิล `account` ใน `SKILLS` · `KIND_ACCESS` + `DESTRUCTIVE_KINDS` + dispatch → command layer · การ์ดยืนยันสรุปไทย | `qc-ai-skills` (ทะเบียนครบพอดี 1 ที่) · ข้อสอบ MockProvider: "ออกใบแจ้งหนี้ให้ณัฐพล 24,900" → proposal → confirm → เอกสาร ISSUED + JV · "กำไรเดือนนี้เท่าไหร่" → tool `account_report` ตัวเลขเท่า `profitLoss` |
| E2 | `GET /api/v1/ai/skills/account` ให้ AI ภายนอกดึงสคีมา · `POST /api/v1/ai/tools/account_*` (อ่านทันที · เขียน pendingConfirmation) · eval golden cases 12 ข้อในหมวดบัญชี (`ai/eval.ts`) · persona "นักบัญชี" (`persona.ts`) | ข้อสอบ §6 ข้อ 11 · golden cases ≥ 90% |
| E3 | (ถ้าเจ้าของเคาะ §8 ข้อ 4) เปิดสกิลบัญชีในแอปมือถือ: ไม่มีโค้ดใหม่ฝั่งแอป — ทดสอบ `mobile/proposals/confirm` กับ kind ใหม่ · render การ์ด | เทสเครื่องจริงโดยเจ้าของ |

### เฟส F — คู่มือ/สกิล/ปิดงาน ≈ 2–3 วัน
| WO | งาน | ผู้ทำ | เกณฑ์ผ่าน |
|---|---|---|---|
| F1 | `/developers/account` (render จาก OpenAPI + recipes 8 เรื่อง + glossary) · `/developers/account.md` · `/developers` เดิมเพิ่มหมวดบัญชี+อธิบาย scope | Sonnet | Fable อ่านทั้งหน้าในฐานะ "agent ที่ไม่รู้อะไรเลย" แล้วทำ recipe ได้ |
| F2 | `.claude/skills/shark-account-api/SKILL.md` (+ `references/endpoints.md` generate · `references/recipes.md` · `references/state-machines.md`) · คัดลอกไป `/root/.claude/skills/` · ทดสอบจริง: ให้ Claude อีก session อ่านสกิลแล้วทำ 5 งานบน tenant QC ผ่าน REST **โดยไม่บอกอะไรเพิ่ม** | Sonnet+Fable | 5/5 งานสำเร็จ (ออกใบแจ้งหนี้ · รับเงิน · ดู aging · สร้างผู้ติดต่อ · ปิดงวดล้มเพราะ checklist ไม่ผ่าน ต้องรายงานเหตุผลถูก) |
| F3 | อัปเดตเอกสาร: `docs/sds/07_API.md` (as-built) · `docs/modules/12-account.md §5` (แทนที่ด้วยตารางจริง) · `docs/sds/modules/account.md` · `docs/AI_LAYER.md` (สกิล account) · HANDOVER สำหรับเจ้าของ | Sonnet | doc refs ไม่ตาย (fitness) |
| F4 | verify prod: deploy → สร้างคีย์จริงบนร้านทดสอบ → ยิง 10 เส้นทางด้วย curl จาก VPS → webhook ถึงปลายทางทดสอบ → ลบร้านทดสอบ · แจ้งเจ้าของ | Fable | Vercel READY + ผลจริง |

**รวม ≈ 22–27 วันงาน agent** (≈ 3–4 สัปดาห์ปฏิทินถ้าทำต่อเนื่องแบบ RUN บัญชี V2 ที่จบ 46 WO ใน 3 วัน — ตัวเลขวันเป็นกรอบ ไม่ใช่สัญญา ประเมินจาก run ก่อนที่ 46 WO ≈ 60 ชม. เครื่อง)

ลำดับที่ทำได้ทันทีโดยไม่รอเจ้าของ: A1→A3→A4→B1–B4 (อ่านล้วน ไม่มีความเสี่ยงเงิน) · เส้นเขียน (C+) รอเคาะ §8 ข้อ 1–2

---

## 8. คำตอบเจ้าของ (5 ก.ย. 2026 ~14:00 BKK) — ✅ เคาะครบ ใช้เป็นกติกาของ run
| # | คำถาม | คำตอบ | ผลต่อแผน |
|---|---|---|---|
| 1 | คีย์ REST ทำจริงทันทีตาม scope | **ตกลง** | เฟส C/D เขียนตรง ไม่ผ่าน proposal · ยึด §2.2 |
| 2 | op อันตรายผ่าน REST | **เปิดได้ ถ้ามี scope "อันตราย" + `confirm:true`** | คง kind=danger ตาม §2.2 (scope + confirm + reason + audit + event) |
| 3 | default คีย์จากหน้าบัญชี = bundle "ออกเอกสาร+รับเงิน" · หมดอายุ 1 ปี | **ตกลง** | A2 ใช้ค่านี้ |
| 4 | AI ในแอป SHARK | **จบงานนี้แล้วไปพัฒนา AI ในแอป SHARK ต่อ** | เฟส E ทำ E1+E2 (สกิล `account` พร้อมใช้ทั้ง AI ภายนอกและในแอป) · **E3 ตัดออกจาก run นี้** → เป็นงานถัดไป "AI ในแอป SHARK" ซึ่งจะใช้สกิลนี้เป็นฐาน |
| 5 | ภาษาคู่มือ | **อังกฤษเป็นหลัก** (+ glossary ไทย) | F1/F2 ตามนี้ · `summary`/`description` ของ tool เป็นอังกฤษ · `label`/การ์ดยืนยัน/error `message_th` ยังไทย |

### (เดิม) คำถามที่ถาม
1. **คีย์ REST ทำจริงทันทีตาม scope** (ไม่ผ่านการยืนยันในแอป) — ยืนยันตามที่ออกแบบ? (ทางเลือก: บังคับทุก write ของ REST เป็น proposal ด้วย = ปลอดภัยกว่าแต่แอปภายนอกจะ "ออกใบแจ้งหนี้อัตโนมัติ" ไม่ได้)
2. **op อันตราย** (void/reopen/unmark/merge) เปิดให้คีย์ REST ทำได้ถ้าติ๊ก scope "อันตราย" + `confirm:true` — หรือ **ปิดถาวรสำหรับ REST** ให้ทำในแอปเท่านั้น?
3. **ค่าเริ่มต้นเมื่อสร้างคีย์จากหน้าบัญชี**: bundle "ออกเอกสาร+รับเงิน" (ไม่มีอันตราย/ตั้งค่า) · หมดอายุ 1 ปี — โอเค?
4. **เปิดสกิลบัญชีให้ AI ในแอป SHARK ตั้งแต่เฟส E** (ผู้ช่วยในระบบจะเริ่มเสนอออกเอกสาร/รับเงินได้ผ่านการ์ดยืนยัน) — หรือให้ AI ภายนอกใช้ก่อนแล้วค่อยเปิดในแอป?
5. **ภาษาคู่มือ**: อังกฤษเป็นหลัก + glossary ไทย (ประหยัด token ของ AI ทุกค่าย · นักพัฒนาต่างชาติของลูกค้าอ่านได้) — หรือไทยเป็นหลัก?

สิ่งที่ Fable ตัดสินเองแล้ว (ไม่ต้องตอบ): path `/api/v1/account` · scope = permission key เดิม · Idempotency-Key บังคับสำหรับ write · rate limit บน DB · เอกสาร generate จากทะเบียน · undo/public JSON/DBD e-Filing ไม่อยู่ในขอบเขต

---

## 9. ความเสี่ยงที่รู้ตัว
- **ทะเบียน ~82 op = พื้นที่โจมตีใหญ่ขึ้น 10 เท่า** — ลดด้วย: เปิดอ่านก่อน (B) · scope default แคบ · danger ต้อง confirm · oracle §6 ทุก op · audit ทุก write
- **service บางตัวโยน error เป็นข้อความไทยหลายรูปแบบ** — mapping → code อาจไม่ครบวันแรก · กันด้วย default `unprocessable` + message_th จาก `safeReason` · เก็บ log ops เพื่อไล่เพิ่ม code
- **catch-all route กับ Next 16.2** — ต้องอ่าน `node_modules/next/dist/docs/` เรื่อง route handlers/dynamic segments ก่อนเขียน (กติกา AGENTS.md) · fallback = generate ไฟล์ route ต่อ resource จากทะเบียน (สคริปต์) ถ้า catch-all มีข้อจำกัด
- **เงื่อนไข proposal ของ AI ต้องรู้ systemId** — วันนี้ `resolveSystem(tenantId,"ACCOUNT")` เลือกเล่มแรก · ร้านที่มีหลายสมุดบัญชีต้องให้ tool รับ `systemName` (แพตเทิร์น `resolveUnit` ที่มี)
- **โควตาเครื่อง** — งานหนักทีละ 1 (บทเรียน 3 ก.ย.) · oracle ชุดใหม่รวมเข้า `qc:all` ทีละชุด
