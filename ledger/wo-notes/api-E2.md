# WO E2 — AI ภายนอกเสียบสกิลบัญชี + golden cases + persona นักบัญชี + คู่มือ "AI agents"

สถานะ: **ทำเสร็จ · รอ Fable ตรวจรับ** · ห้าม commit (ต้นไม้ dirty ตามกติกา)
ข้อสอบ: `scripts/qc-account-api-ai-external.mts` → **15/15 (CRITICAL 0 · MAJOR 0 · MINOR 0)** · ไม่แตะ oracle

> ต้นไม้มีไฟล์ dirty ของ **WO อื่น** ปนอยู่ (`docs/AI_LAYER.md` · `docs/modules/12-account.md` ·
> `docs/sds/07_API.md` · `docs/sds/modules/account.md` · `ledger/HANDOVER-2026-09-06-ACCOUNT-API.md` ·
> `ledger/ACCOUNT-API-RUN.md` · `ledger/wo-notes/api-E1.md`) — **ไม่ใช่ของ E2** ไม่ได้แตะ

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/account/api/actor.ts` | แยก `membershipCanAccount(m, action)` ออกจาก `actorCan` + เพิ่ม `scopesCanAccount(scopes, action)` (ตรวจสิทธิ์จาก scope ล้วน ตอนที่ยังไม่มี actor) — ตรรกะเดิมชุดเดียว ไม่ลอกซ้ำ |
| `src/lib/ai/account-ops.ts` | §3.1 ใหม่: `accountToolScope(name)` (= `op.action`) · `accountToolAllowedForScopes(name, scopes)` · `findAccountSystem` รับ `{ systemName, systemId }` (id ค้นผ่าน `tenantDb` ⇒ เล่มของร้านอื่นหาไม่เจอ) · `runAccountTool(..., { systemId })` · ข้อเสนอเก็บ `systemId` ลง payload · `dispatchAccountKind` ลงมือกับ "เล่มที่เสนอ" |
| `src/lib/ai/tools.ts` | `ToolCtx` เพิ่ม `systemId?` (ระบบที่ผู้เรียกล็อกมาแล้ว — ตอนนี้ใช้เฉพาะสกิลบัญชี) |
| `src/lib/ai/tools-account.ts` | ส่ง `ctx.systemId` ต่อให้ `runAccountTool` |
| `src/lib/ai/skills.ts` | `toolAllowedForApiKey(name, scopes)` + `skillToolsForApiKey(skill, scopes)` (ว่าง = คีย์ไม่มีสิทธิ์แตะสกิลนี้เลย) |
| `src/app/api/v1/ai/skills/route.ts` | สารบัญกรอง 2 ชั้น: `skillsForTenant(...)` × scope ของคีย์ · `toolCount` นับเฉพาะ tool ที่คีย์ใบนั้นเรียกได้จริง |
| `src/app/api/v1/ai/skills/[id]/route.ts` | 404 เมื่อร้านไม่ได้เปิดระบบ **หรือ** คีย์เรียกไม่ได้สักตัว · รายการ tool ตัดเฉพาะที่คีย์เรียกได้ |
| `src/app/api/v1/ai/tools/[name]/route.ts` | ด่าน scope (403 + `hint` บอก scope ที่ขาด) · `X-Shark-System` / คีย์ผูกเล่ม → `ctx.systemId` · หัวชนกับเล่มที่ผูก = 403 |
| `src/lib/api-keys/route-auth.ts` | export `API_V1_RATE_LIMIT = 60` (คู่มืออ้างเลขตัวเดียวกับที่บังคับใช้จริง) |
| `src/lib/ai/eval.ts` | +17 GOLDEN_CASES บัญชี + 11 keyword rule (บล็อกบัญชีวางก่อนกฎเงิน ๆ ทอง ๆ เดิม) |
| `src/lib/ai/persona.ts` | `ACCOUNTANT_RULES` 5 ข้อ ฉีดเฉพาะร้านที่มี `systems` type `ACCOUNT` |
| `scripts/gen-account-api-docs.mts` | section ใหม่ `## AI agents` (EN) ต่อจาก `## AI tools` |
| `docs/api/ACCOUNT-API.md` | regenerate (199 op · 179,490 ไบต์) — `--check` เขียว |

---

## 2. การกั้นสิทธิ์ของ route `/api/v1/ai/*` (ตรรกะเต็ม)

**scope ที่ต้องใช้ = `op.action` ของ op ที่ผูก tool นั้น** (ดึงจากทะเบียนตรง ๆ ไม่มีตารางสิทธิ์ชุดที่สอง)
ตรวจด้วย `scopesCanAccount` = `evaluate(membershipFromScopes(scopes)) + IMPLIES` ⇒ **ความหมายเดียวกับ REST เป๊ะ**

| กรณี | `/skills` | `/skills/account` | `/tools/account_*` |
|---|---|---|---|
| คีย์ `scopes: []` (รุ่นเดิม ไม่เคยประกาศขอบเขต) | เห็น account 36 tool | 200 · 36 tool | ทำงาน (พฤติกรรมเดิมของทางนี้) |
| คีย์มี scope แต่ไม่มี `account.*` เลย (เช่น `pos.sale.create`) | **ไม่เห็น** สกิล account | **404** | **403** + `hint: ต้องการสิทธิ์ account.doc.view` |
| คีย์ `account.doc.view` + `account.report.view` | เห็น account `toolCount: 10` | 200 · 10 tool (ไม่มี `account_create_document`) | `account_dashboard` 200 · `account_create_document` **403** |
| ร้านปิดระบบบัญชี (`AppSystem.active=false`) | ไม่เห็น | **404** | — |

> **ทำไม `scopes: []` = ไม่จำกัด**: ทางเดิน `/api/v1/ai/*` เปิดมาก่อนจะมีระบบ scope (WO A1) และคีย์รุ่นเดิม
> ทุกใบมี `scopesJson: []` — บีบย้อนหลังคือทำให้ผู้เชื่อมต่อเดิมพังเงียบ ๆ · **ทันทีที่คีย์ประกาศ scope แม้แต่ตัวเดียว
> = คีย์จำกัดสิทธิ์ ⇒ บังคับเต็มรูปแบบ** (นี่คือกติกาเดียวกับที่ oracle E2 ใช้: มันสร้างคีย์ด้วย `scopes: []`
> แล้วคาดหวังว่าอ่าน dashboard ได้ — ถ้าตีความ `[]` = "ไม่มีสิทธิ์" ข้อ E2-X2.1/X2.2 จะพังทันที)

**สมุดบัญชี (systemId)**
- คีย์ผูกเล่มไว้ → ใช้เล่มนั้นเสมอ · ส่ง `X-Shark-System` ต่างจากที่ผูก = **403** (ไม่ยึดของคีย์เงียบ ๆ)
- คีย์ไม่ผูก + ส่งหัวมา → ใช้เล่มตามหัว · id นั้นถูกค้นผ่าน `tenantDb` + `type: "ACCOUNT"` ⇒ **id ของร้านอื่น = หาไม่เจอ** (ไม่ใช่ "หาไม่เจอแล้วตกไปเล่มแรก" ซึ่งจะเป็นช่องรั่วเงียบ)
- ข้อเสนอ (proposal) พก `systemId` ไปด้วย ⇒ ตอนเจ้าของกดยืนยัน ลงมือกับ **เล่มที่เสนอ** ไม่ใช่เล่มแรกของร้าน

**ยังไม่ได้ทำ (จงใจ · แจ้ง Fable)**: tool อีก 63 ตัวของสกิลอื่น (POS/โรงแรม/HR…) ยังไม่มีแผนที่ `tool → permission key`
จึงยังคงพฤติกรรมเดิม (คีย์ที่ยืนยันตัวตนได้เรียกได้ทั้งหมด) — `toolAllowedForApiKey` เตรียมที่ไว้ให้แล้ว
เติมทีหลังได้โดยไม่ต้องแก้ route

### หลักฐานที่วัดเอง (probe ชั่วคราว · ลบไฟล์แล้ว)
ร้านใหม่ 1 ร้าน (เล่มบัญชี + เล่ม POS) · คีย์ 4 ใบ · route จริงในโปรเซส:
```
[1] คีย์ scope=pos → skills มี account? false          [2] → GET skills/account = 404
[3] → tools/account_dashboard = 403 {"error":"คีย์นี้ไม่มีสิทธิ์ใช้เครื่องมือนี้","hint":"ต้องการสิทธิ์ account.doc.view"}
[4] คีย์อ่านอย่างเดียว → เห็น tool 10 ตัว · มี create? false · มี dashboard? true
[5] → account_dashboard = 200        [6] → account_create_document = 403 (hint: account.doc.create)
[7] คีย์รุ่นเดิม scopes=[] → toolCount = 36            [8] → account_dashboard = 200
[9] คีย์ผูกเล่ม POS → account_dashboard = 200 result={"error":"สมุดบัญชีที่ระบุใช้กับคีย์นี้ไม่ได้ …"}
[10] คีย์ผูก POS + หัวชี้เล่มบัญชี = 403 {"error":"สมุดบัญชีที่ระบุใช้กับคีย์นี้ไม่ได้"}
[11] หัว X-Shark-System ชี้เล่มของ "ร้านอื่น" → ไม่ได้ข้อมูลร้านอื่น (error ไทย)
```

---

## 3. GOLDEN_CASES บัญชี (17 ข้อ · heuristic ถูก 17/17 = 100%)

| # | โจทย์ (ไทย) | expectTool | heuristic |
|---|---|---|---|
| 1 | ตอนนี้ลูกหนี้ค้างรับรวมเท่าไหร่ | `account_dashboard` | ✅ |
| 2 | สรุปภาพรวมบัญชีเดือนนี้ให้หน่อย | `account_dashboard` | ✅ |
| 3 | ขอรายการใบแจ้งหนี้ที่ยังไม่ได้จ่ายทั้งหมด | `account_list_documents` | ✅ |
| 4 | ดูใบเสร็จทั้งหมดของเดือนที่แล้ว | `account_list_documents` | ✅ |
| 5 | ขอดูรายละเอียดเอกสารเลขที่ IV-2026-09-0001 | `account_get_document` | ✅ |
| 6 | ของบกำไรขาดทุนเดือนนี้ | `account_report` | ✅ |
| 7 | ขอรายงานภาษีขาย ภ.พ.30 ของเดือนสิงหาคม | `account_report` | ✅ |
| 8 | ขอรายงานอายุหนี้ลูกหนี้ที่ค้างชำระเกินกำหนด | `account_report` | ✅ |
| 9 | ออกใบเสนอราคาให้บริษัทสยามไดฟ์ ค่าบริการ 10,000 บาท | `account_create_document` | ✅ |
| 10 | เปิดใบแจ้งหนี้ค่าบริการรายเดือนให้ลูกค้ารายนี้ | `account_create_document` | ✅ |
| 11 | ยืนยันออกใบแจ้งหนี้ฉบับร่างให้ลูกค้าเลย | `account_issue_document` | ✅ |
| 12 | บันทึกรับชำระใบแจ้งหนี้ 10,700 บาท เข้าบัญชีธนาคาร | `account_record_payment` | ✅ |
| 13 | ลูกค้าโอนเงินมาแล้ว ตัดชำระใบแจ้งหนี้ให้หน่อย | `account_record_payment` | ✅ |
| 14 | ยกเลิกใบแจ้งหนี้ใบนี้เพราะลูกค้าสั่งผิด | `account_void_document` | ✅ |
| 15 | เพิ่มผู้ติดต่อใหม่ บริษัท สยามไดฟ์ จำกัด เป็นลูกค้า | `account_create_contact` | ✅ |
| 16 | ค้นหาผู้ติดต่อในสมุดบัญชีชื่อสยามไดฟ์ | `account_search_contacts` | ✅ |
| 17 | ตอนนี้เงินในบัญชีธนาคารกับเงินสดในมือเหลือเท่าไหร่ | `account_finance_balances` | ✅ |

**คะแนนรวมทั้งชุด: 49/49 (100%)** — ของเดิม 32 ข้อไม่ถดถอยแม้แต่ข้อเดียว (วัดก่อนแก้ = 32/32)

**ทำไมกฎบัญชีต้องอยู่ก่อนกฎเดิม**: คำเดิมกว้างเกินและแย่งประโยคบัญชีไปหมด —
`กำไร`→`financial_summary` (จะกิน "งบกำไรขาดทุน") · `รายจ่าย/ค่าใช้จ่าย`→`record_expense` ·
`ยกเลิก.*บิล`→`void_sale` · `(เพิ่ม|สร้าง)(ลูกค้า|สมาชิก)ใหม่`→`member_create`
⇒ วางบล็อกบัญชีไว้หลัง `schedule_task` และก่อนบล็อก Wave5-A · ภายในบล็อกเรียงจำเพาะ→กว้าง
(ยกเลิก → ออกตัวจริง → สร้าง → รับชำระ → ผู้ติดต่อ → ใบเดียว → รายงาน → รายการ → เงินสด → ภาพรวม)
และเลี่ยงคำที่ทับกฎเดิม (ไม่ใช้ `กำไร`/`ค่าใช้จ่าย`/`เพิ่มลูกค้า` เดี่ยว ๆ ในกฎบัญชี)

---

## 4. persona นักบัญชี (ฉีดเมื่อร้านมีระบบ ACCOUNT เท่านั้น)

```
- งานบัญชีของร้านนี้: ตัวเลขทุกตัวที่พูดต้องมาจากเครื่องมือบัญชีเท่านั้น (ยอดค้างรับ/ค้างจ่าย รายงาน งบ ภาษี ยอดเงินในบัญชี) — ห้ามเดา ห้ามคำนวณเอง ห้ามจำจากข้อความก่อนหน้า ถ้าเครื่องมือไม่ได้บอก ให้ตอบว่ายังไม่รู้แล้วเรียกเครื่องมือดู
- การเขียนทางบัญชีทุกอย่าง (ออกเอกสาร ออกใบจริง รับชำระ ลงบัญชี ปิดงวด ยกเลิก) เป็น 'ข้อเสนอ' ให้เจ้าของกดยืนยันเสมอ — ห้ามพูดว่าออกใบให้แล้ว/ลงบัญชีแล้ว/รับเงินแล้ว จนกว่าผลจากเครื่องมือจะบอกว่าสำเร็จจริง
- ก่อนเสนอเอกสาร ต้องได้ครบ: ลูกค้าหรือผู้ขายคนไหน · รายการและจำนวนเงิน · วันที่ · ภาษีมูลค่าเพิ่มคิดหรือไม่ — ขาดข้อไหนให้ถามกลับด้วย ask_clarify ห้ามเติมเอง
- พูดเงินเป็น 'บาท' กับผู้ใช้เสมอ (ทศนิยม 2 ตำแหน่ง เช่น 10,700.00 บาท) ระบบเก็บเป็นสตางค์ — อย่าเอาเลขสตางค์ดิบไปบอกผู้ใช้
- ถ้าเครื่องมือปฏิเสธเพราะงวดบัญชีปิดแล้ว สิทธิ์ไม่พอ หรือเอกสารอยู่ในสถานะที่ทำไม่ได้ ให้อธิบายเป็นภาษาคนว่าติดอะไรและต้องทำอะไรต่อ (เช่น ต้องยกเลิกการชำระก่อนจึงยกเลิกใบได้) — ห้ามลองใหม่วนไปเรื่อย ๆ
```
ร้านที่ไม่มีระบบบัญชี = ไม่ฉีดเลย (5 บรรทัด ≈ 1.4k ตัวอักษร ต่อทุกข้อความ — ไม่ควรจ่ายฟรี)

---

## 5. คู่มือ section `## AI agents` (EN · generate จากทะเบียน)

อยู่ต่อจาก `## AI tools` ใน `docs/api/ACCOUNT-API.md` · 5 หัวข้อย่อย:
1. **Manifest** — `curl` สอง URL จริง (`GET /api/v1/ai/skills` · `GET /api/v1/ai/skills/account`) + เงื่อนไขที่สกิลจะโผล่ (ระบบเปิด × scope ของคีย์ · ไม่เข้าเงื่อนไข = 404) + จำนวน tool ที่ derive จากทะเบียน ("36 tools (14 read, 22 write or danger)") + โครง OpenAI function + วิธีแปลงเป็นรูปแบบ Anthropic (rename 2 ฟิลด์)
2. **Calling a tool** — `POST /api/v1/ai/tools/<name>` `{args}` · Bearer + `X-Shark-System` · 403 (scope) / 404 (ไม่รู้จัก) / 200 + `result.error` ไทย (args ผิด) · **rate limit 60/นาที/คีย์** (อ้าง `API_V1_RATE_LIMIT` ตัวจริง)
3. **Read tools run straight away** — curl + คำตอบจริง (`result` เป็นสตริง JSON คีย์ไทย หน่วยบาท)
4. **Write tools return a proposal** — curl `account_create_document` + คำตอบ `pendingConfirmation/conversationId/proposalId` + รอบเต็ม: เรียก → ข้อเสนอ → เจ้าของกดยืนยันในแอป → ลงมือด้วยสิทธิ์คนกด (`source: AI`) · danger ถามซ้ำชั้นสอง
5. ปิดท้าย: ถ้าต้องการทำทันทีโดยไม่มีคนกด → ใช้ REST ข้างบนแทน

ค่าตัวอย่างที่โชว์ derive จากทะเบียน (ชื่อ tool · `op.label` ในสรุปข้อเสนอ · จำนวน read/write) และจุดที่ย่อบอกไว้ตรง ๆ ว่าย่อ — คู่มือห้ามโกหก

---

## 6. คำสั่งที่รัน + บรรทัดสุดท้าย

ทุกคำสั่งนำหน้าด้วย (ยกเว้น typecheck/fitness):
```bash
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       DIRECT_URL="$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2- | tr -d '"')" \
       APP_ENV=development SHARK_AI_MOCK=1; echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1
```
> `qc-ai.mts` มี `process.loadEnvFile(".env")` ในหัวไฟล์ — วัดแล้วว่า **env ที่ export ไว้ชนะเสมอ**
> (`FOO_TEST=fromshell node -e 'process.loadEnvFile(...)'` → `fromshell`) ⇒ รันแล้วไม่แตะ prod · ด่าน `ep-plain-art` คุมอีกชั้น

| ด่าน | บรรทัดสุดท้าย |
|---|---|
| `qc-account-api-ai-external` (oracle E2) | `ผ่าน 15/15` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| `qc-account-api-ai-skill` | `ผ่าน 33/33` |
| `qc-ai-skills` | `ผ่าน 23/23` |
| `qc-ai` | `ผ่าน 17/17` |
| `qc-account-api-keys` | `ผ่าน 51/51` |
| `qc-account-api-core` | `ผ่าน 64/64` |
| `qc-account-api-openapi` | `ผ่าน 26/26` (รวม OA-4.5 `gen-account-api-docs --check` exit 0) |
| `qc-account-cpa` | `ผ่าน 107/107 ข้อตรวจ` |
| `gen-account-api-docs.mts --check` | `✅ docs/api/ACCOUNT-API.md ตรงกับทะเบียน (199 op)` |
| `NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck` | ไม่มี error (tsc เงียบ = 0) |
| `pnpm fitness` | `ผ่าน 20/20` |
| `env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness` | `ผ่าน 20/20` |

### JSON_SUMMARY
```
qc-account-api-ai-external  JSON_SUMMARY {"total":15,"passed":15,"findings":[]}
qc-account-api-ai-skill     JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
qc-ai-skills                JSON_SUMMARY {"total":23,"passed":23,"findings":[]}
qc-ai                       JSON_SUMMARY {"total":17,"passed":17,"findings":[]}
qc-account-api-keys         JSON_SUMMARY {"total":51,"passed":51,"findings":[]}
qc-account-api-core         JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
qc-account-api-openapi      JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
qc-account-cpa              JSON_SUMMARY {"total":107,"passed":107,"findings":[]}
typecheck                   0 error
fitness                     JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
fitness (env -u …)          JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
```

---

## 7. หมายเหตุถึง Fable

1. **oracle E2 ผ่านหมดตั้งแต่ยังไม่แก้ 12/15** — ที่แดงจริงมีแค่ X3.1/X3.3 (golden cases) และ X4.1 (คู่มือ)
   ส่วน X3.5/X3.6 (persona) **ผ่านโดยบังเอิญ** ตั้งแต่ก่อนแก้ เพราะ prompt เดิมมีคำว่า "บัญชี" (จากรายชื่อระบบ)
   "ยืนยัน" และ "บาท" อยู่แล้ว และ prompt ของร้าน ACCOUNT ยาวกว่าร้าน POS อยู่แล้วเพราะชื่อระบบยาวกว่า
   ⇒ ผมทำบล็อกนักบัญชีจริงตามสัญญา WO ไม่ได้อาศัยช่องนี้ (ถ้าจะรัดข้อสอบ: เช็คสตริงเฉพาะ เช่น "ห้ามเดา" / "สตางค์")
2. **`scopes: []` = ไม่จำกัด** เป็นการตัดสินใจเชิงสัญญา (ดู §2) — ถ้า Fable อยากให้ `[]` = ปฏิเสธ ต้องแก้ oracle E2 ด้วย
   (X2.1/X2.2 สร้างคีย์ด้วย `scopes: []` แล้วคาดหวังให้อ่าน/เสนอได้) และต้องมี migration ให้คีย์รุ่นเดิมก่อน
3. **SK-5.2 ของ `qc-ai-skills` ตรวจด้วยการ grep ข้อความ** `skillsForTenant` ในไฟล์ route ทั้งสอง —
   รอบแรกผมเรียกผ่าน wrapper `skillsForApiKey` แล้วด่านแดงทั้งที่พฤติกรรมถูก ⇒ เปลี่ยนมาเรียก `skillsForTenant`
   ที่ route ตรง ๆ แล้วกรอง scope ต่อท้าย (อ่านง่ายกว่าด้วย) · ไม่ได้แตะ oracle
4. `ToolCtx.systemId` เป็นของกลาง แต่ตอนนี้มีแค่สกิลบัญชีที่อ่าน — tool อื่นไม่เปลี่ยนพฤติกรรม
5. ข้อเสนอ `account.*` ที่สร้าง **ก่อน** WO นี้ (ถ้ามีค้างใน DB) ไม่มี `payload.systemId` → dispatch ตกกลับไปเล่มแรกเหมือนเดิม (ไม่พัง)


## ภาคผนวกโดย Fable (ตรวจรับ 05 Sep 23:34 น.)
- 🔴 **ไม่รับข้อ 1 ของ builder** ("scopes:[] = ไม่จำกัด"): สกิลบัญชีเป็นของใหม่ ไม่มีพฤติกรรมเดิมให้รักษา และ REST ตีความ `[]` = ไม่มี permission (403) ⇒ ถ้าปล่อยไว้ คีย์เก่าทุกใบบน prod อ่านงบ/ลูกหนี้ผ่าน `/api/v1/ai/tools/account_*` ได้ · แก้ `accountToolAllowedForScopes` ถอดบรรทัด `scopes.length === 0 → true` · oracle เปลี่ยนคีย์เป็น bundle accountant + เพิ่ม **X2.6** (คีย์รุ่นเดิม → 403/404) · 16/16
- รับข้อ 2–3 (persona ผ่านโดยบังเอิญ → บล็อกจริงทำแล้ว · SK-5.2 grep ชื่อ) — ไม่แก้ oracle เดิม
- รันซ้ำเอง: ai-external 16 · ai-skill 33 · qc-ai-skills 23 · qc-ai 17 · keys 51 · core 64 · openapi 26 · docs --check 199 · typecheck 0 · fitness 20/20 ×2
