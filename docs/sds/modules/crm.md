# CRM / ลูกค้า-ดีล (AS-BUILT 2026-07-16)

## หน้าที่ · ผู้ใช้ · ตำแหน่งในชั้น (อ้าง 02)
Lead → Prospect → Customer + Pipeline/Deal + Follow-up + weighted forecast + ออกใบเสนอราคาเข้าบัญชี. ผู้ใช้: ทีมขาย. **Layer 4: Advanced** (feature no.19) — scope=system (AppSystem type CRM). CrmContact = ตัวตนฝั่งขาย (คนละตัวกับ Customer สมาชิก).
โค้ด: `src/lib/modules/crm/{service,actions,rules,ui}.ts` · schema `prisma/schema/crm.prisma`.

## Data model (prisma/schema/crm.prisma) — tenantId+systemId
- **CrmContact** — `name/phone/email` `company?` `lifecycleStage`(LEAD/PROSPECT/CUSTOMER/LOST) `source?` `ownerUserId?` `memberCustomerId?`(ผูก Customer เมื่อโปรโมต) `archivedAt?`.
- **CrmPipeline** — `name` `isDefault` · **CrmStage** — `name` `kind`(OPEN/WON/LOST) `probability`(0-100 % สำหรับ weighted forecast) `sortOrder`.
- **CrmDeal** — `contactId` `pipelineId` `stageId` `title` `valueSatang` `kind`(สำเนา stage.kind ณ ปัจจุบัน — sync ตอนย้าย stage, ห้ามตั้ง status ตรง) `expectedCloseAt?` `closedAt?`(ตั้งเมื่อ WON/LOST) `quotationDocId?`(hook AccountDocument). index `[systemId,kind]`,`[systemId,stageId]`.
- **CrmActivity** — `type`(CALL/MEETING/EMAIL/LINE/TASK/NOTE) `title` `dueAt?` `doneAt?`(null=ค้าง). index `[systemId,doneAt,dueAt]`.

## Service API (src/lib/modules/crm/service.ts) — ctx {tenantId,systemId}
- `ensureCrm(ctx)` — seed default pipeline+stages.
- `createContact(ctx, input)` · `listContacts`.
- `createDeal(ctx, input)` · `moveDeal(ctx, dealId, stageId)` — ย้าย stage → sync deal.kind + closedAt + เลื่อน lifecycle (rules.lifecycleAfterDealWon) · `listDeals`.
- `addActivity(ctx, input)` · `completeActivity(ctx, activityId)` · `listPendingActivities`.
- `forecast(ctx)` — weighted forecast (rules.weightedForecast: Σ value×probability ของ deal OPEN).
- `getBoard(ctx)` — pipeline board.
- `issueQuotation(...)` — ออกใบเสนอราคาผ่านบัญชี (account.createExternalQuotation) แทนทำ quotation ซ้ำ.
- **rules.ts** (Fable): `dealStateForStage` · `lifecycleAfterDealWon` · `canAdvanceLifecycle` · `weightedForecast` — pure.

## การเชื่อมต่อ
- **ออก → Account (ตารางเชื่อม #3)**: `issueQuotation` → AccountSystemLink linkedKind=CRM → account.createExternalQuotation (ออก AccountDocument QUOTATION). เก็บ quotationDocId hook.
- **Member**: memberCustomerId ผูก Customer เมื่อ Deal ชนะ (ไม่ auto ใน MVP).
- ไม่มี outbox event.

## Permissions (assertCan ใน actions.ts)
`crm.contact.create` · `crm.deal.create` · `crm.deal.move` · `crm.deal.quote` · `crm.activity.create` · `crm.activity.complete`.

## UI
- `/app/sys/[id]` (type=CRM, CrmContent) — pipeline board + contacts + activities.

## การทดสอบ
- `scripts/qc-crm.mts` (Fable oracle, WO-0009) — Lead→Prospect→Customer + Pipeline/Deal + Follow-up + forecast. ส่วน RULES เขียวตั้งแต่ต้น, ส่วน SVC (Builder) fail-before แดง.

## ข้อจำกัด/หนี้ที่รู้ + WO อนาคต
- company เป็น freeform (ยังไม่แยกตาราง Company).
- โปรโมต contact → member ยังไม่ auto.
- WO-0054 Form builder (submissions → CRM lead) · WO-0059 Vendor Portal.
