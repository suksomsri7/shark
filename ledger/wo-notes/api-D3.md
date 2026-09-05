# WO D3 — WRITE งานปฏิบัติการ: กระทบยอดธนาคาร · นำเข้า CSV · คลังเอกสาร/กล่องขาเข้า · รายงานอีเมล

Builder: Sonnet · oracle: `scripts/qc-account-api-write-ops.mts` (Fable, ห้ามแตะ) · ผ่านรอบเดียว 29/29

## ไฟล์ที่แตะ

**ใหม่**
- `src/lib/modules/account/api/ops/reconcile-write.ts` — 9 op (`reconcile.*`)
- `src/lib/modules/account/api/ops/files-write.ts` — 5 op (`files.*` + `inbox.ingest`/`inbox.read`/`inbox.create-expense`)
- `src/lib/modules/account/api/ops/import.ts` — 4 op (`import.preview`/`.run`/`.template` + `reports.email`)
- `src/lib/modules/account/import-core.ts` — แกน `previewImportCore`/`runImportCore` (ย้ายออกจาก `import-actions.ts`; ดูหัวข้อ "บั๊กที่จับได้เอง" ด้านล่าง)

**แก้ (additive)**
- `src/lib/modules/account/api/registry.ts` — import + spread `RECONCILE_WRITE_OPS`/`FILES_WRITE_OPS`/`IMPORT_OPS` เข้า `ACCOUNT_OPS` (รวม 178 op)
- `src/lib/modules/account/attachment.ts` — เพิ่ม `getAttachmentRow(tenantId, systemId, id)` (แถวเดียวหลังแก้ ให้ `files.update`/`inbox.create-expense` ตอบกลับโดยไม่ต้องโหลดทั้งหน้า — ใช้ mapping เดียวกับ `listAttachmentsPaged`)
- `src/lib/modules/account/import-actions.ts` — เหลือแค่ server actions (`previewImportAction`/`runImportAction`) ที่ผูก session แล้ว re-export `previewImportCore`/`runImportCore`/types จาก `import-core.ts` (พฤติกรรม/ชื่อเดิมทุกประการ — `ImportWizard.tsx`, `scripts/qc-acc-v2-import.mts`, `scripts/qc-acc-v2-coa.mts` ใช้ได้เหมือนเดิม)
- `docs/api/ACCOUNT-API.md` — regenerate (`gen-account-api-docs.mts`) 137,205 → 150,954 ไบต์ (160→178 op)

## op → service map

| op id | service function | ไฟล์ service |
|---|---|---|
| `reconcile.preview-statement` | `previewStatementImport` | `reconcile.ts` |
| `reconcile.import-statement` | `importStatement` | `reconcile.ts` |
| `reconcile.auto-match` | `autoMatch` | `reconcile.ts` |
| `reconcile.match` | `manualMatch` | `reconcile.ts` |
| `reconcile.unmatch` | `unmatch` | `reconcile.ts` |
| `reconcile.skip` | `skipLine` | `reconcile.ts` |
| `reconcile.create-entry` | `createEntryFromLine` | `reconcile.ts` |
| `reconcile.confirm` | `confirmMonth` | `reconcile.ts` |
| `reconcile.reopen` | `reopenMonth` | `reconcile.ts` |
| `import.preview` | `previewImportCore` | `import-core.ts` (ใหม่) |
| `import.run` | `runImportCore` | `import-core.ts` (ใหม่) |
| `import.template` | `buildTemplateCsv` | `import-shared.ts` |
| `files.update` | `linkAttachment`/`unlinkAttachment`/`moveAttachment`/`setDocTypeHint`/`markNotAccounting`/`archiveAttachment`/`restoreAttachment` + `getAttachmentRow` (ใหม่) | `attachment.ts` |
| `files.bulk` | `moveAttachmentsBulk`/`archiveAttachmentsBulk` | `attachment.ts` |
| `inbox.ingest` | `ingestInboxFiles` | `inbox.ts` |
| `inbox.read` | `readBill` | `inbox-ai.ts` |
| `inbox.create-expense` | `createExpenseFromAttachment` + `getDocRef` | `inbox.ts` + `service.ts` |
| `reports.email` | `composeAccountReport` (+ `getPolicy`/`getSettings`/`dashboardSnapshot`/`fiscalYearOf` + lazy `sendEmail`/`emailEnabled`) | `email-report.ts` + `policy.ts`/`service.ts`/`dashboard.ts`/`@/lib/core/email`/`@/lib/env` |

## error mapping

- **Line ops บนเดือนที่ยืนยันแล้ว → 409 `state_conflict`**: `reconcile.ts` คืนข้อความไทย "…แล้ว" (ยืนยันไปแล้ว/จับคู่ไปแล้ว/สร้างรายการไปแล้ว/กลับรายการไปแล้ว) ซึ่ง `mapError` กลางจับคำไม่ถึง (ไม่มี "ร่าง"/"สถานะ"/"ปิดงวด") ⇒ เขียน `failReconcile(reason)` เฉพาะไฟล์: `startsWith("ไม่พบ")` → 404 · `includes("แล้ว")` → 409 state_conflict · อื่น ๆ → โยนต่อให้ `mapError` (422 ทั่วไป) — ครอบทุกจุดในไฟล์เดียวกัน (แพทเทิร์นเดียวกับ `finance-write.ts`/`pettyCashReimburse`)
- `files-write.ts` มี `failFile(reason)` แบบเดียวกัน (ครอบ `linkAttachment`/`setDocTypeHint`/ฯลฯ ที่คืน "ไฟล์นี้ผูกกับเอกสารอยู่แล้ว"/"...ผูกกับเอกสารอยู่" ฯลฯ)
- `import.preview`/`import.run` ล้ม (`{ok:false,reason}`) → `ApiError(422, "unprocessable", ...)` · `kind` ที่ไม่รู้จักถูก zod enum ปฏิเสธเป็น 422 ก่อนถึง handler อยู่แล้ว (ไม่ต้องเช็คเอง)
- `import.run` ชนเพดาน "20/ชม./ระบบ" (`accountRateGuard("import", systemId)`) → `ApiError(429, "rate_limited", ...)` ก่อนเรียก `runImportCore`
- `inbox.read`: `readBill` ไม่ throw เอง — map เอง: `status:"DONE"` → 200 `{extracted,cached}` · `status:"SKIPPED"` (ไม่มี provider/เครดิตหมด/ชนเพดาน `aiBill`) → `ApiError(503,"upstream_unavailable",...)` · `status:"FAILED"` ที่ `reason==="ไม่พบไฟล์"` → 404 · `FAILED`/`UNSUPPORTED` อื่น → `ApiError(422,"unprocessable",...)` — **ไม่มีทาง 500**
- `reports.email` ไม่มี RESEND (`emailEnabled` เท็จ) หรือยังไม่ตั้งผู้รับ (`policy.emailReportRecipients.length===0`) → คืน 200 `{sent:0, skipped:1, reason}` (ไทย) เสมอ ไม่ throw · `kind` นอก `daily`/`weekly` → 422 (zod enum) · ชนเพดาน `emailReport` (20/วัน/ระบบ) → 429 `rate_limited`

## userId handling
ทุกจุดที่ service รับ `userId`/`createdById`/`actorId` ส่ง `null` เสมอ (คีย์ API ไม่ใช่ "คน" — ผู้ลงมือบันทึกใน audit log ของ `dispatch.ts` เองผ่าน `actorType:"API_KEY", actorId: keyId`)

## rate-limit keys reused
- `import.run` → `accountRateGuard("import", systemId)` = คีย์เดิม `acc:import:<systemId>` (20/ชม.) **ซ้อนบน** เพดาน write ของ REST เอง (`acct:api:write:<keyId>` 60/นาที)
- `inbox.read` → `readBill` เรียก `accountRateGuard("aiBill", tenantId)` **ภายในตัวมันเอง** อยู่แล้ว (200/วัน/ร้าน) — ไม่ต้องเรียกซ้ำที่ op layer
- `reports.email` → `accountRateGuard("emailReport", systemId)` = คีย์เดิม `acc:emailReport:<systemId>` (20/วัน) เรียกก่อนเช็คผู้รับ/RESEND

## บั๊กที่จับได้เอง (สำคัญ — อ่านก่อนแก้ WO ถัดไปที่แตะ `import-actions.ts`/`inbox-ai.ts`)
รอบแรก `pnpm fitness`/`gen-account-api-docs.mts --check` **พังทันทีที่ไม่มี env** (`SESSION_SECRET`/`DATABASE_URL` undefined จาก `src/lib/env.ts`) ทั้งที่ oracle D3 (ซึ่งมี env ครบผ่าน `loadLegacyQcEnv`) เขียวหมด — same class of bug ที่ B2 เจอกับ `contacts-read.ts`

สาเหตุ: `import.ts` เดิม import `previewImportCore`/`runImportCore` จาก `../../import-actions` ตรง ๆ — ไฟล์นั้นมี `"use server"` **และ** import `./guard` (`loadAccountSystem` → `requireTenant` → session/env) แบบ static ที่หัวไฟล์ ⇒ แค่ import โมดูล `import-actions.ts` เฉย ๆ (ไม่ต้องเรียกฟังก์ชัน) ก็ทำให้ `env.ts` parse แล้วโยนทันทีเมื่อไม่มี `.env`

แก้: ย้าย `previewImportCore`/`runImportCore` (และ helper ภายในทั้งหมด: `bkkDate`/`sideOfKind`/`checkFile`/`capRows`/`chunk`/`units_findId`) ไปไฟล์ใหม่ `import-core.ts` ที่**ไม่แตะ `./guard`/session เลย** (import เฉพาะ `service.ts`/`expense.ts`/`product.ts`/`coa.ts`/`access.ts`/`import-shared.ts` — ทุกตัวพิสูจน์แล้วว่า import เดี่ยว ๆ ไม่พังเมื่อไม่มี env) `import-actions.ts` เหลือแค่ `previewImportAction`/`runImportAction` (ผูก session) ที่ import กลับจาก `import-core.ts` แล้ว re-export ชื่อ/type เดิมทั้งหมด — `ImportWizard.tsx`/`scripts/qc-acc-v2-import.mts`/`scripts/qc-acc-v2-coa.mts` (เรียก `IA.previewImportCore`/`IA.runImportCore` ผ่าน `import-actions`) ยังทำงานเป๊ะ (รันซ้ำแล้ว 114/114 และ 105/105 ตามลำดับ)

ตรวจแยกทีละโมดูลด้วย `tsx` (ไม่มี env) ก่อนสรุปว่าแก้ครบ: `import-core`/`inbox-ai`/`rate-limit`/`policy`/`dashboard`/`email-report`/`service`/`attachment`/`inbox`/`reconcile` และ 3 ไฟล์ ops ใหม่ + `registry.ts` ทั้งหมด import สำเร็จโดยไม่มี env

## คำสั่งที่รันจริง + ผลสุดท้าย
```
export DATABASE_URL=... DIRECT_URL=... APP_ENV=development SHARK_AI_MOCK=1   # (+ SESSION_SECRET เฉพาะคำสั่งที่ import โมดูลเต็ม เช่น gen-docs)
echo "$DIRECT_URL" | grep -q ep-plain-art || exit 1

pnpm exec tsx scripts/qc-account-api-write-ops.mts     # 29/29 (CRITICAL 0 · MAJOR 0)
pnpm exec tsx scripts/qc-account-api-read-finance.mts  # 38/38
pnpm exec tsx scripts/qc-account-api-read-docs.mts     # 50/50
pnpm exec tsx scripts/qc-account-api-write-docs.mts    # 52/52
pnpm exec tsx scripts/qc-account-api-core.mts          # 64/64
pnpm exec tsx scripts/qc-account-api-openapi.mts       # 26/26 (หลัง regenerate docs)
pnpm exec tsx scripts/qc-account-cpa.mts               # 107/107
pnpm exec tsx scripts/qc-acc-v2-reconcile.mts          # 109/109
pnpm exec tsx scripts/qc-acc-v2-import.mts             # 114/114
pnpm exec tsx scripts/qc-acc-v2-inbox.mts              # 128/128
pnpm exec tsx scripts/qc-acc-v2-attachments.mts        # 66/66
pnpm exec tsx scripts/qc-acc-v2-reports-drill.mts      # 57/57
pnpm exec tsx scripts/qc-acc-v2-coa.mts                # 105/105 (regression เพิ่มหลังแก้ import-actions.ts)
pnpm exec tsx scripts/gen-account-api-docs.mts && pnpm exec tsx scripts/gen-account-api-docs.mts --check   # เขียน + ตรง (178 op)

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck   # 0 error
pnpm fitness                                             # 20/20 (ไม่มี env)
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness   # 20/20
```
ข้ามชุด: `qc-csv-import.mts` (โหลด `.env` prod ตรงหัวไฟล์) · `qc-report-builder.mts` (โหลด `.env` prod ตรงหัวไฟล์) · `qc-chat-attachments.mts`/`qc-chat-inbox-ui.mts` (คนละโมดูล — แชท ไม่ใช่บัญชี)

## JSON_SUMMARY
```
JSON_SUMMARY {"wo":"D3","opsAdded":18,"opsTotal":178,"oracle":{"total":29,"passed":29,"findings":[]}}
JSON_SUMMARY {"suite":"read-finance","total":38,"passed":38}
JSON_SUMMARY {"suite":"read-docs","total":50,"passed":50}
JSON_SUMMARY {"suite":"write-docs","total":52,"passed":52}
JSON_SUMMARY {"suite":"core","total":64,"passed":64}
JSON_SUMMARY {"suite":"openapi","total":26,"passed":26}
JSON_SUMMARY {"suite":"cpa","total":107,"passed":107}
JSON_SUMMARY {"suite":"acc-v2-reconcile","total":109,"passed":109}
JSON_SUMMARY {"suite":"acc-v2-import","total":114,"passed":114}
JSON_SUMMARY {"suite":"acc-v2-inbox","total":128,"passed":128}
JSON_SUMMARY {"suite":"acc-v2-attachments","total":66,"passed":66}
JSON_SUMMARY {"suite":"acc-v2-reports-drill","total":57,"passed":57}
JSON_SUMMARY {"suite":"acc-v2-coa","total":105,"passed":105}
JSON_SUMMARY {"typecheck":"0 errors"}
JSON_SUMMARY {"fitness_no_env":"20/20"}
JSON_SUMMARY {"fitness_env_u_db_direct_session":"20/20"}
```

## ทิ้งไว้ให้ Fable ตรวจรับ
- ทะเบียนรวม **178 op** (160 เดิม + 18 ของ D3)
- ทรี dirty ตามกติกา (ไม่ commit) — ไฟล์ที่เปลี่ยน: ดูหัวข้อ "ไฟล์ที่แตะ"
- จุดที่ควรพิจารณาตอน D4/E1 ต่อ: `readBill`/`inbox-ai.ts` ยังไม่มี op ที่ทำ "อ่านหลายไฟล์พร้อมกัน" (`readPendingInbox`) — ไม่อยู่ในสัญญา D3 จึงไม่ทำ ปล่อยไว้เป็นของ backlog เดิม


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. 22:05 น.)
- 🔴 **ถอด `export { previewImportCore, runImportCore } from "./import-core"` ออกจาก `import-actions.ts`** — ไฟล์นั้นเป็น `"use server"`: ทุก async function ที่ export = server action ที่ client เรียกตรงได้โดยส่ง tenantId ใดก็ได้ (ของเดิมก่อน D3 ก็เปิดอยู่แล้วเพราะ core นิยามในไฟล์นี้ — D3 ย้ายออกมาเป็นผลดี แต่ re-export กลับไปเปิดใหม่) ⇒ ข้อสอบ `qc-acc-v2-import`/`qc-acc-v2-coa` เปลี่ยนไป import จาก `import-core` · type re-export คงไว้ (ถูกลบตอน compile)
- probe ของ Fable (ลบแล้ว): fileUrl http → 422 · sourceRef ซ้ำ → duplicated 1 · ร้านอื่นแก้/อ่านบิล/สร้างรายจ่ายจากไฟล์เรา → 404 (bulk → count 0 ไม่แตะ) · files.update ว่าง → 422 · คีย์ accountant ไม่มี `account.import` → 403 ทั้ง template/run (ตามชุดสิทธิ์ A1)
- รันซ้ำเอง: write-ops 29 · read-docs 50 · write-docs 52 · core 64 · openapi 26 · acc-v2-import 114 · acc-v2-inbox 128 · acc-v2-coa · docs --check 178 op · typecheck 0 · fitness 20/20 ×2
