# WO D4 — WRITE ตั้งค่า/permissions/links/webhooks + event ที่เหลือ (Sonnet)

สัญญา: `ledger/ACCOUNT-API-RUN.md` §D4 · oracle: `scripts/qc-account-api-write-settings.mts` (ไม่แตะ)

## ไฟล์

### ใหม่
- `src/lib/modules/account/api/ops/settings-write.ts` — 15 op (S1 ข้อมูลกิจการ · S2 เอกสาร/เลขที่/แท็ก · S3 นโยบาย · S4 สิทธิ์ · S5 เชื่อมระบบ · S6 api-keys.list)
- `src/lib/modules/account/api/ops/webhooks.ts` — 6 op (list/create/update/delete/test/deliveries)

### แก้ (additive — services)
- `src/lib/modules/account/connections.ts` — `+linkedIdOfKind()` (คลี่ linkedId จาก kind สำหรับ `PATCH`/`DELETE /links/{kind}` ที่ไม่มี linkedId ในเส้นทาง) · `+isValidLinkTarget()` (`connect()` เดิมไม่ตรวจว่า linkedId เป็นระบบจริงของร้าน เพราะ UI ส่งจาก dropdown ที่กรองแล้ว — REST ต้องตรวจเอง กัน id ปลอม/ข้ามร้าน)
- `src/lib/modules/account/permissions-service.ts` — `listAccountUsers()` เพิ่มพารามิเตอร์ `opts?: { includeAll?: boolean }` (ไม่ส่ง = พฤติกรรมเดิมทุกประการ) เพราะ REST `settings.permissions.get` ต้องเห็น "ใครกำหนดบทบาทได้บ้างทั้งร้าน" ไม่ใช่แค่คนที่มีสิทธิ์บัญชีอยู่แล้วแบบหน้าจอ §9.4 (ข้อสอบ D4-S4.1 ตั้ง staff ที่ยัง `permissions:{}` แล้วคาดว่าเห็น 2 users ก่อนกำหนดบทบาทใด ๆ)
- `src/lib/modules/account/doc-settings.ts` — `validateTag()` ยอมรับรหัสสี HEX 6 หลัก (`#rrggbb`) เพิ่มจากพาเลตเดิม (`TAG_COLORS`) โดยไม่ตัดของเดิมออก (oracle D4-S2.5 ส่ง `#ff0000` — พาเลต 6 สีเดิมไม่พอสำหรับผู้เชื่อมต่อภายนอกที่มีสีแบรนด์เอง)
- `src/lib/modules/account/gl.ts` — `reopenPeriod()` รับ `tx?: Tx` เสริม (ไม่ส่ง = เปิด transaction ของตัวเองเหมือนเดิม) เพื่อให้ `reopenPeriodV2` ยิง `account.period.reopened` ในธุรกรรมเดียวกับการเปิดงวด
- `src/lib/webhooks/service.ts` — `+getEndpoint()` (ทวนสิทธิ์เจ้าของก่อนแก้/ลบ/ทดสอบ) · `+testEndpoint()` (ยิงทดสอบ endpoint เดียวแบบเจาะจง ไม่ผ่านตัวกรอง subscribe ของ `dispatchWebhooks`) · `listDeliveries()` เพิ่มพารามิเตอร์ `endpointId?` (ไม่ส่ง = พฤติกรรมเดิม)

### แก้ (emit points — 6 event ที่เหลือ)
- `src/lib/modules/account/events.ts` — เพิ่ม 6 type ใน `ACCOUNT_EVENT_TYPES` + emit helper: `emitChequeChanged` · `emitReconcileConfirmed` · `emitPeriodReopened` · `emitAssetDepreciated` · `emitAssetDisposed` · `emitRecurringRan`
- `src/lib/webhooks/labels.ts` — ป้ายไทยของทั้ง 6 (หมวด "บัญชี ชุดที่ 3")
- `src/lib/outbox-consumers.ts` — consumer no-op ของทั้ง 6 (ปิด event เป็น DONE + ให้ `withWebhooks` ยิงต่อ — เหมือนชุด C4)
- `src/lib/modules/account/cheque.ts` — `emitChequeChanged` ใน `depositCheque`(ห่อ `$transaction` ใหม่ — ของเดิมเป็น update เดี่ยว) `/clearCheque`/`bounceCheque`/`voidCheque` (มี tx อยู่แล้ว)
- `src/lib/modules/account/reconcile.ts` — `emitReconcileConfirmed` ใน `confirmMonth` (ห่อ `tenantDb(ctx).$transaction` ใหม่ — ของเดิมเป็น `updateMany` เดี่ยว)
- `src/lib/modules/account/period-close.ts` — `emitPeriodReopened` ใน `reopenPeriodV2` (ห่อ `tenantDb(ctx).$transaction` รวม `gl.reopenPeriod` + `reopenedAt` + emit เป็นก้อนเดียว)
- `src/lib/modules/account/asset.ts` — `emitAssetDepreciated` ใน `runDepreciation` (จุด "posted" ในทรานแซคชันเดิม) · `emitAssetDisposed` ใน `disposeAsset` (ในทรานแซคชันเดิม)
- `src/lib/modules/account/service.ts` — `emitRecurringRan` ใน `generateOneRecurringDocument` ผ่าน helper `finish()` ที่เรียกก่อน `return` ทุกจุด (mini-tx ของตัวเอง — ฟังก์ชันนี้ไม่มี tx ใหญ่ก้อนเดียวให้เกาะอยู่แล้ว เหมือน precedent `emitAccountEvent` ของ `account.period.closed`)

### อื่น
- `scripts/gen-account-api-docs.mts` — `WEBHOOK_EVENT_DOCS` เพิ่มตัวอย่าง body ของ 6 event ใหม่
- `docs/api/ACCOUNT-API.md` — regenerate (199 op รวม D4)
- `src/lib/modules/account/api/registry.ts` — ต่อ `SETTINGS_WRITE_OPS` + `WEBHOOKS_OPS` เข้า `ACCOUNT_OPS`

## op → service map

| op | service |
|---|---|
| `settings.update` | `getSettings`+`saveSettings` (อ่านค่าเดิมมา merge ก่อนเสมอ — `saveSettings` แทนที่ทั้งก้อน ไม่ใช่ patch) |
| `settings.documents.update` | `getDocSettings`+`saveDocSettings`+`docNumberingRows` (normalize pattern token ก่อนเสมอ) |
| `settings.documents.next-no` | `setDocNextNo`+`docNumberingRows` (อ่าน example กลับ) |
| `settings.tags.create` | `createDocTag` |
| `settings.policy.update` | `getPolicy`+`savePolicy` |
| `settings.permissions.get` | `getPermissionSettings`+`listAccountUsers(...,{includeAll:true})` |
| `settings.permissions.add-role` | `addRole` (ไม่ต้อง actorUserId) |
| `settings.permissions.save-role` | `saveRole` (actorUserId = OWNER) |
| `settings.permissions.assign` | `assignRole` (actorUserId = OWNER) |
| `settings.permissions.set-cap` | `setApprovalCap` (actorUserId = OWNER) |
| `settings.permissions.revoke` | `revokeAccountAccess` (actorUserId = OWNER · danger) |
| `links.connect` | `isValidLinkTarget`+`connect` |
| `links.update` | `linkedIdOfKind`+`setLinkOptions` |
| `links.disconnect` | `linkedIdOfKind`+`disconnect` (danger) |
| `api-keys.list` | `listApiKeys`+`bundleLabelForScopes` |
| `webhooks.list` | `listEndpoints` |
| `webhooks.create` | `createEndpoint` |
| `webhooks.update` | `getEndpoint`+`setEndpointEvents`/`setEndpointActive` |
| `webhooks.delete` | `getEndpoint`+`deleteEndpoint` (danger) |
| `webhooks.test` | `getEndpoint`+`testEndpoint` (ใหม่) |
| `webhooks.deliveries` | `getEndpoint`+`listDeliveries(...,endpointId)` |

## actorUserId handling (permissions-service)

`saveRole`/`assignRole`/`setApprovalCap`/`revokeAccountAccess` เขียนผ่าน `staff/service.updateStaffAccess` ซึ่ง **ต้องมี `actorUserId` ที่เป็น Membership จริงของร้านนี้** (ด่าน `checkNoEscalation` + ลำดับชั้นบทบาทอ่านจาก membership ของผู้สั่งจริง) — คีย์ API ไม่ใช่ผู้ใช้ จึงส่ง `null` ไม่ได้ (พารามิเตอร์เป็น `string` บังคับ ไม่ใช่ `string | null`)

**ตัดสินใจ**: ใช้ `userId` ของ OWNER คนแรกของร้าน (`ownerActorId()` ใน `settings-write.ts`, หาโดย `listAccountUsers(ctx).find(u => u.role === "OWNER")`) แทนคีย์ที่เรียก — ปลอดภัยเพราะ (1) OWNER มีสิทธิ์ทุกอย่างอยู่แล้ว ผ่าน `canGrantPermission`/`canAssignRole` ทุกกรณี ไม่มีทางถูกบล็อกด้วยด่านยกระดับสิทธิ์ (2) การเรียกมาถึง handler นี้ได้ต้องมี scope `account.settings.manage` ผ่านมาแล้วที่ชั้น dispatch อยู่ก่อน · `addRole` ไม่ต้องใช้ actorUserId เลย (แค่เพิ่มนิยามบทบาท ยังไม่เขียนสิทธิ์ให้ใคร)

## error mapping

ส่วนใหญ่ใช้แพตเทิร์นเดิมของ D1–D3: `throw new Error(res.reason)` แล้วปล่อยให้ `mapError()` (respond.ts) จับคำไทยเอง (`ไม่พบ`→404 · `ปิดแล้ว/ปิดงวด/ล็อก`→409 period_locked · `ร่าง/สถานะ`→409 state_conflict · `ซ้ำ`→409 duplicate · อื่น ๆ→422) ยกเว้นจุดที่ข้อความไม่มีคำที่จับได้แต่ความหมายคือสถานะไม่ให้ทำ:
- `settings.documents.next-no`: reason มีคำ "แล้ว" (ตั้งเลขถอยหลังต่ำกว่าที่ออกแล้ว) → `ApiError(409, state_conflict)` ตรง ๆ
- `links.connect`: `linkedId` ไม่ใช่ระบบจริงของร้าน (ตรวจเองก่อนเรียก `connect()`) → `ApiError(404, not_found)`
- `webhooks.*`: event ที่ไม่รู้จัก → `ApiError(422, validation)` พร้อม `details[{path:"events",message}]` · endpoint ข้ามร้าน/ไม่มีจริง → `ApiError(404, not_found)`
- `settings.update`/`settings.documents.update`: `stampUrl`/`signatureUrl`/`logoUrl` ไม่อยู่ใน schema + `.strict()` → zod ปฏิเสธเป็น 422 อัตโนมัติ (ไม่ต้องเขียนด่านเพิ่ม)

## event → emit-point map (6 ที่เหลือ)

| event | emit จาก | idempotencyKey |
|---|---|---|
| `account.cheque.changed` | `cheque.ts`: `depositCheque`/`clearCheque`/`bounceCheque`/`voidCheque` | `#<chequeId>#<status>` |
| `account.reconcile.confirmed` | `reconcile.ts`: `confirmMonth` | `#<financeId>#<periodKey>` |
| `account.period.reopened` | `period-close.ts`: `reopenPeriodV2` | `#<systemId>#<periodKey>#<reopenedAt.getTime()>` |
| `account.asset.depreciated` | `asset.ts`: `runDepreciation` (ต่อสินทรัพย์ที่โพสต์สำเร็จ) | `#<assetId>#<periodKey>` |
| `account.asset.disposed` | `asset.ts`: `disposeAsset` | `#<assetId>` |
| `account.recurring.ran` | `service.ts`: `generateOneRecurringDocument` (ทุกจุด return ผ่าน `finish()`) | `#<ruleId>#<runDate:YYYY-MM-DD>` |

หมายเหตุ atomicity: 4/6 ยิงในทรานแซคชันเดียวกับงานหลักจริง (cheque × 4 transitions, asset × 2). `reconcile.confirmMonth`/`period-close.reopenPeriodV2` เดิมไม่มี raw `prisma` import (ใช้ `tenantDb(ctx)` เท่านั้น — เพิ่ม raw prisma import จะเพิ่ม baseline F5.1) จึงห่อด้วย **`tenantDb(ctx).$transaction(...)`** แทน (ยืนยันด้วยสคริปต์ทดลองจริงบน QC DB ว่า extended client ยังปิดขอบเขต tenantId/systemId ให้ในทรานแซคชันเหมือนเดิม) แล้ว cast `tx as unknown as Prisma.TransactionClient` ตอนส่งให้ `events.ts`/`gl.reopenPeriod` (แพตเทิร์นเดียวกับ `contact-merge.ts`) — เป็นทรานแซคชันจริงเดียวกับงานหลัก ไม่ใช่ mini-tx แยก. `service.generateOneRecurringDocument` ไม่มีทรานแซคชันใหญ่ก้อนเดียวให้เกาะอยู่แล้ว (สร้างเอกสาร → บันทึก run row → แจ้งเตือน → ออกอัตโนมัติ เป็นคนละ call แยกกันมาแต่เดิม) ⇒ ใช้ mini-tx ของตัวเอง (`prisma.$transaction` แค่ห่อ emit) เหมือน precedent `emitAccountEvent` ที่ใช้กับ `account.period.closed` อยู่แล้วในไฟล์เดียวกัน — ถือว่าเป็นข้อยกเว้นที่มีเหตุผลเดียวกับของเดิม ไม่ใช่ผมเปิดช่องใหม่

## registry — 21 op ใหม่ (รวม 199)

15 ใน `settings-write.ts` + 6 ใน `webhooks.ts` — ทุกตัว `action: "account.settings.manage"` · danger 3 ตัว (`settings.permissions.revoke` · `links.disconnect` · `webhooks.delete`) · **ไม่มี `POST /api-keys`** (ไม่ลงทะเบียน op = `matchOp` เจอแค่ GET ที่ path นี้ ⇒ POST ได้ 405 จาก `allowedMethods()` อัตโนมัติ ไม่ต้องเขียนด่านกันเอง)

## ตีกลับระหว่างทำ (แก้เองก่อนส่ง Fable ตรวจ — ไม่ใช่ตีกลับจาก Fable)

รอบแรกรัน oracle ได้ 37/39 (CRITICAL 1 · MAJOR 1):
1. `D4-S2.5` (MAJOR) — ส่ง `color:"#ff0000"` แต่ `validateTag()` เดิมจำกัดแค่พาเลต 6 สี → เพิ่มการยอมรับ HEX (ดูหัวข้อไฟล์ที่แก้ด้านบน)
2. `D4-S4.1` (CRITICAL) — `listAccountUsers()` กรองเฉพาะคนที่มีสิทธิ์บัญชีอยู่แล้วตามพฤติกรรมหน้าจอเดิม แต่ REST ต้องเห็นทุกคนในร้าน → เพิ่ม `opts.includeAll`

ระหว่างพัฒนา เจอ (ไม่ใช่ตีกลับ แค่บันทึกไว้กันคนต่อไปเจอซ้ำ):
- `tenantDb(ctx).$transaction()` ให้ extended client type คนละชนิดกับ `Prisma.TransactionClient` แม้ทำงานเหมือนกันทุกอย่าง (ยืนยันด้วยสคริปต์ทดลองจริง) — ต้อง cast `as unknown as Prisma.TransactionClient` แบบเดียวกับที่ `contact-merge.ts` ทำไว้แล้ว
- `s.statementId` (property แคบแล้วด้วย `if` ก่อนหน้า) ไม่ narrow ทะลุเข้า closure ของ `$transaction` — ต้องดึงเป็นตัวแปร local ก่อน
- `formatDocNo()` จำเฉพาะ token ตัวพิมพ์ใหญ่/ไทย — เพิ่ม `normalizePattern()` แปล token แบบที่ผู้เรียก REST พิมพ์ง่ายกว่า (`{yyyy}`/`{seq4}` ฯลฯ) ก่อนบันทึกเสมอ

## คำสั่งที่รันจริง (ทั้งหมดผ่าน QC env `ep-plain-art`)

```
pnpm exec tsx scripts/gen-account-api-docs.mts
pnpm exec tsx scripts/qc-account-api-write-settings.mts   → 39/39
pnpm exec tsx scripts/qc-account-api-webhooks.mts         → 22/22
pnpm exec tsx scripts/qc-account-api-keys.mts             → 51/51
pnpm exec tsx scripts/qc-webhook-ui.mts                   → 11/11 (ไม่แตะ DB — ปลอดภัยไม่ต้องผ่าน QC env)
pnpm exec tsx scripts/qc-account-api-read-docs.mts        → 50/50
pnpm exec tsx scripts/qc-account-api-write-finance.mts    → 33/33
pnpm exec tsx scripts/qc-account-api-write-gl.mts         → 35/35
pnpm exec tsx scripts/qc-account-api-core.mts             → 64/64
pnpm exec tsx scripts/qc-account-api-openapi.mts          → 26/26
pnpm exec tsx scripts/qc-account-cpa.mts                  → 107/107
pnpm exec tsx scripts/qc-acc-v2-permissions.mts           → 160/160
NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck     → 0 errors
pnpm fitness                                              → 20/20
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness → 20/20
```

**ข้ามโดยตั้งใจ**: `scripts/qc-webhook.mts` — header โหลด `.env` ตรง (`process.loadEnvFile(".env")`) = ต่อ prod จริง ตามกติกา "ห้ามรัน QC ที่โหลด .env ตรง" · ไม่มี `qc-acc-v2-settings*.mts` ในโปรเจกต์ (ข้ามเพราะไม่มีไฟล์)

`pnpm qc:all` เต็มรอบ **ไม่ได้รัน** (นโยบายเดิมของ run นี้: รันเดี่ยวชุดที่เกี่ยวพอ · เต็มรอบรันตอนปิดเฟส D โดย Fable)

## JSON_SUMMARY

JSON_SUMMARY {"wo":"D4","opsAdded":21,"opsTotal":199,"eventsAdded":6,"eventsTotal":21,"filesNew":2,"filesEdited":14,"gates":{"qc-account-api-write-settings":"39/39","qc-account-api-webhooks":"22/22","qc-webhook-ui":"11/11","qc-account-api-keys":"51/51","qc-account-api-read-docs":"50/50","qc-account-api-write-finance":"33/33","qc-account-api-write-gl":"35/35","qc-account-api-core":"64/64","qc-account-api-openapi":"26/26","qc-account-cpa":"107/107","qc-acc-v2-permissions":"160/160"},"typecheck":"0 errors","fitness":"20/20","fitness_no_env":"20/20"}


## ภาคผนวกโดย Fable (ตรวจรับ 5 ก.ย. 23:15 น.)
- รับการตัดสินใจ actorUserId = OWNER คนแรก: ขอบเขตจริงที่ยกระดับได้ = เขียน cell สิทธิ์ `account.*` ให้ membership STAFF เท่านั้น (`updateStaffAccess` · บทบาทระบบ OWNER/MANAGER แก้ไม่ได้ D4-S4.5 · ถอด OWNER ไม่ได้ probe P4) และคีย์ต้องมี `account.settings.manage` อยู่แล้ว ⇒ ไม่เกินขอบเขตที่คีย์ตั้งค่าควรทำได้
- probe ของ Fable (ลบแล้ว): assign/revoke ข้ามร้าน → 422 ข้อมูลไม่ขยับ · webhooks.list ไม่มี secret · api-keys.list ไม่มี keyHash · `POST /api-keys` → 405 · PATCH settings logoUrl → 422 · ร้านอื่นลบ webhook เรา → 404
- รันซ้ำเอง: write-settings 39 · webhooks 22 · keys 51 · core 64 · openapi 26 · read-docs 50 · docs --check 199 op · typecheck 0 · fitness 20/20 ×2
