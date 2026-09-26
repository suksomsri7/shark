# WO C3.6 — เชื่อมต่อทุกระบบ · ตัวตัดสินปลายทางตัวเดียว · widget PAGES · ทีมจริงในมุมมองสมาชิก (DRAFT ของ builder)

> RUN "CRM v2" · worktree `/root/projects/shark-crm-c23` (detached HEAD `d35d5bae`) · QC3 (`ep-weathered-river`) · 26 ก.ย. 2569 · builder: Opus
> สัญญา: `ledger/CRM-RUN.md` §2 C3.6 · `crm-brief-C3.6-C3.9.md` C3.6 + addendum (ยืนยันทั้งหมดโดยมติผู้คุมงาน) · COMMON · RESOLUTIONS (R-A HR link · R-D · R-E.14)
> ข้อสอบ: `scripts/qc-crm-c3.6.mts` (29 ข้อ · ผู้คุมงานแก้ ORACLE-EDIT C3.6-X1.2 แล้ว) · ผล QC3: 28/29 ×2 ก่อนแก้ → **29/29** (`oracle-3.log`) → หลังรอบรีวิว 2 (B1+S1–S6) **27/29** (`r2-qc-crm-c3.6.log`) — แดง 2 = S1.4 · X3.1 ตรึงสัญญาก่อนมติผู้ตรวจ S1/S3 (ขอ ORACLE-EDIT §8)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/integrations-shared.ts` | ใหม่ | บริสุทธิ์: `CRM_TARGET_KINDS` · `TARGET_TYPE/KEY/LABEL` · `crmTargetsOf` · `INTEGRATION_EVENTS` (24 รหัส · ทุกชื่อเป็นคีย์ของ outbox-consumers) · `INTEGRATION_HINTS` · `INTEGRATION_MAP_ORDER` · `IntegrationsError` |
| `src/lib/modules/crm/integrations.ts` | ใหม่ | `listTargetCandidates` (raw lookup ตัวเดียว) · `resolveCrmTargetsDetailed/resolveCrmTargets` · `getTargets/setTargets` · `targetPicker` · `integrationStatus` |
| `src/lib/modules/crm/integrations-actions.ts` | ใหม่ | server action บันทึกปลายทาง (assertCrmV2 → assertCanCrm `crm.settings.manage`) |
| `src/lib/modules/crm/widgets.ts` | ใหม่ | `myDeals` · `todayTasks` · `portalEntry` · `portalShopEntry` |
| `src/lib/modules/crm/settings.ts` | แก้ (บล็อก C3.6) | `setCrmTargetKeys` — jsonb_set คำสั่งเดียว merge `settings.crm.targets` + RETURNING |
| `src/lib/modules/crm/index.ts` | แก้ (บล็อก C3.6) | `export * as integrations` · `export * as widgets` |
| จุดเลือกปลายทาง 7 จุด | แก้ (บล็อก C3.6) | `member-bridges.ts#memberSystemForCrm` · `contacts.ts` convertOptions + convertContact · `consents.ts#memberSystemOf` · `deals.ts#inventoryItems` · `activities.ts#dealKanbanCards` · `companies.ts#crmAccountBook` · `automation.ts` SEND_LINE |
| `src/lib/modules/account/index.ts` | แก้ (บล็อก C3.6) | `accountSystemForCrm(…, { bookId })` |
| `src/lib/pages/registry.ts` · `service.ts` | แก้ (บล็อก C3.6) | `WidgetDef.data` + 3 คีย์ · `pageForRender`/`availableWidgets` ซ่อน widget ข้อมูลเมื่อ CRM ของกิจการไม่ใช่ v2 · `RenderWidget.data/systemId` · `pageViewer` |
| `src/app/p/[slug]/page.tsx` + `src/components/pages/CrmDataWidgets.tsx` | แก้/ใหม่ | โหลด widget ข้อมูลด้วย actor ของ session ผู้เปิด (หลัง accessFor) |
| `src/lib/modules/member/views.ts` · `list.ts` · `members-list-actions.ts` | แก้ (บล็อก C3.6) | teamId จริง · `savedViewAccessWhere` (ตัวกรองเดียวของ list + listMembers({viewId}) + แก้/ลบ) · `savedViewTeamIds` · `savedViewTeamOptions` · DTO ไม่เปลี่ยน |
| `src/components/member/MembersSavedViewsMenu.tsx` · `src/app/app/sys/[id]/member/members/page.tsx` | แก้ | ตัวเลือกทีม `member-view-team` · ป้ายทีมในรายการ · มุมมองที่ใช้ไม่ได้ใน URL = รายการไม่ใช้มุมมอง (ไม่ 500) |
| `src/lib/modules/hr/ui.tsx` | แก้ | การ์ด "ทีมขาย" → `/app/settings/teams` (`hr-link-sales-teams` · เฉพาะ OWNER/คีย์ crm.team.manage) |
| `src/app/app/sys/[id]/crm/settings/integrations/page.tsx` + `src/components/crm/integrations/*` | ใหม่ | หน้าภาพ 17 |
| `src/lib/modules/crm/nav.ts` · `src/app/app/layout.tsx` · `scripts/crm-ui-inventory.json` | แก้ | เมนูลึก (perm) · drawer (crmCan) · +9 แถว |

## 2. ตัดสินใจของ builder (ให้ผู้คุมงานยืนยัน)
1. **บัญชีใน companies ใช้เฉพาะ target/link** (ไม่ใช้ลำดับ 3 "สมุดเดียวของร้าน"): ทางนี้เขียนผู้ติดต่อเข้าสมุดบัญชี — ใช้ลำดับ 3 ทำให้ C1.3-X4.4 แดง ("CRM ที่ไม่ได้เชื่อมบัญชีต้องไม่สร้าง AccountContact") และจะเขียนสมุดของร้านที่ไม่เคยเชื่อมเงียบ ๆ · ตัวตัดสินเองยังคืนลำดับ 3 ตามมติ (S2.1 เขียว) — companies อ่าน `via` จาก `resolveCrmTargetsDetailed`
2. `listTargetCandidates` คืนทุกระบบของชนิดนั้น (รวมที่ปิด · `active` บอกสถานะ) เรียง active ก่อน แล้ว createdAt asc — ทางอ่านแบบเดิมไล่ครบเหมือนเดิม · ตัวเลือกบนหน้าปิดตัวที่ไม่ active · setTargets ปฏิเสธตัวที่ไม่ active
3. convertOptions: ปลายทางจากตัวตัดสินขึ้นเป็นแถวแรก (โมดัลเลือกแถวแรกอยู่แล้ว) — DTO `ConvertOptions` ไม่เปลี่ยน · convertContact ไม่ส่ง systemId = ใช้ปลายทางจากตัวตัดสิน
4. dealKanbanCards/inventoryItems: มีปลายทาง = ระบบนั้นเท่านั้น · null = ไล่ทุกระบบแบบเดิม
5. SEND_LINE: ส่ง `systemId` = ปลายทางแชทให้ `pushToContact`/`sendLineToParty` (null = เดิม) — ไม่ต้องเพิ่มฟังก์ชันใน chat facade
6. มุมมองสมาชิก: OWNER เห็น TEAM ทุกทีม (แก้/ลบได้อยู่แล้ว · แบบ `crm/views.ts` ของ C3.2) · `loadEditable` ใช้ตัวกรองเดียวกัน (มุมมองที่มองไม่เห็น = NotFound แทน Forbidden)
7. widget portal บนหน้า Page = ทางเข้าพอร์ทัลของร้าน (`portalShopEntry` · ไม่ผูกคน เพราะ /p เป็น session พนักงาน) · `portalEntry(ctx,{contactId|partyId})` เคร่งตามสัญญา
8. setTargets: tx ล็อกแถว (`FOR UPDATE`) อ่านค่า "ก่อน" ให้ audit แล้วเขียนด้วย jsonb_set คำสั่งเดียว (ไม่เขียนค่าที่อ่านกลับ) · audit เฉพาะเมื่อค่าเปลี่ยนจริง

## 3. ORACLE-EDIT
- **C3.6-X1.2 (`noPerm`)** บรรทัด 771: `actor(uTH, "STAFF", { "crm.contact.read": true })` คาดว่า myDeals ปฏิเสธ แต่ `access.ts` (มติ C1.7 · บทเรียน K3.1 `CRM_IMPLICIT_READ`) ให้ STAFF ที่ถือคีย์ `crm.*` ใด ๆ อ่านดีลได้โดยนัย ⇒ `crmCan(…, "crm.deal.read") === true` (probe: true · actor ที่ไม่มีคีย์ crm เลย = false) · ผลจริง `noPerm=ok {total:2…}` · เสนอแก้เป็น `actor(uTH, "STAFF", { "member.customer.read": true })` (ไม่มีคีย์ crm เลย ⇒ FORBIDDEN) — ไม่สร้างตัวตัดสินคีย์ชุดที่สองเพื่อให้ข้อนี้เขียว

## 4. DEFERRED
- ภาพ 1440/390 ของหน้า `/crm/settings/integrations` + `/p/[slug]` (ต้อง build) → ผู้คุมงานถ่าย · M1.5-S4.3/S4.4 (ภาพสมาชิก) = ENV เดิม

## 5. เพิ่มหลังผู้คุมงานสั่ง
- การ์ด "เชื่อมต่อทุกระบบ" บนหน้ารวม `/crm/settings` (บล็อก `// CRM C3.6 ▸` · `show: crmCan(actor, "crm.settings.manage")` · testid `crm-settings-card-integrations` คลุมด้วยแถวแพตเทิร์น `crm-settings-card-*` เดิม) · qc-nav-functions 11/11 · qc-crm-c1.10 66/66

## 7. มติผู้คุมงาน (26 ก.ย.) — ตัดสินใจ 1–7 ของ builder รับทั้งหมด
- (1) บัญชีใน companies ใช้เฉพาะปลายทางที่ร้านเลือก/AccountSystemLink — ไม่ใช้ "สมุดเดียวของร้าน" (ลำดับ 3) เพราะทางนี้ **เขียน** AccountContact เข้าสมุด: ร้านที่ไม่เคยเชื่อม CRM↔บัญชีต้องไม่ถูกเขียนสมุดเงียบ ๆ (C1.3-X4.4) · ตัวตัดสินยังคืนลำดับ 3 (หน้า/สถานะใช้ได้) — companies อ่าน `via` จาก `resolveCrmTargetsDetailed`
- (4) `dealKanbanCards` / `inventoryItems`: มีปลายทาง = ระบบนั้นเท่านั้น (สินค้าของคลังอื่น = ไม่พบ) · null = ไล่ทุกระบบของชนิดนั้นแบบเดิมผ่าน `listTargetCandidates`
- (5) SEND_LINE ส่ง `systemId` = ปลายทางแชทเข้า `pushToContact` / `sendLineToParty` ของ facade แชทเดิม (null = พฤติกรรมเดิม) — ไม่เพิ่มฟังก์ชันใน chat facade
- (6) มุมมองสมาชิก: OWNER เห็นมุมมอง TEAM ทุกทีม (แก้/ลบได้อยู่แล้ว · แบบเดียวกับ `crm/views.ts` C3.2) · `loadEditable` ใช้ `savedViewAccessWhere` ตัวเดียวกัน ⇒ มุมมองที่มองไม่เห็น = NotFound

### รอบรีวิว 2 (26 ก.ย. · มติผู้ตรวจ 1 BLOCKER + 6 SHOULD-FIX + notes)
- B1 SEND_LINE ไม่บังคับระบบแชทอีกต่อไป: facade แชทได้ `preferSystemId` (`chat/push.ts` `systemOfExternalUser` · `chat/party-bridge.ts`) — หาผู้ติดต่อ LINE ในระบบปลายทางก่อน ไม่มี = ผู้ติดต่อล่าสุดระบบใดก็ได้ แล้วส่งด้วยระบบของผู้ติดต่อนั้น (`systemId` ที่ระบุตรงยังชนะ · ผู้เรียกเดิมไม่เปลี่ยน) · probe `.qc-shots/c36/b1-probe.mts` (`r2-b1-probe.log`) PASS
- S1 DTO งาน = `{ name, everyMinutes, lastRunAt, lastOkAt, failed, reason }` · `reason` = ข้อความไทยกลาง ๆ · ไม่มี `OpsEvent.detail` ถึงร้าน · หัวข้อ "งานเบื้องหลังของระบบ" (ของทั้งแพลตฟอร์ม)
- S2 outbox ย้อนหลัง 90 วัน (`INTEGRATION_WINDOW_DAYS`) + `SET LOCAL statement_timeout = 8000` ในธุรกรรม · UI "ไม่มีเหตุการณ์ใน 90 วัน" · 🔴 **ผู้สมัคร C6.1**: index `OutboxEvent(tenantId, type, createdAt)`
- S3 ปลายทางบัญชี = เฉพาะสมุดที่มี AccountSystemLink CRM เปิดอยู่กับ CRM นี้ (`account.crmLinkedBooks`) ทั้งตัวเลือก · validation · ตัวตัดสิน (ค่าเก่าที่เลิกเชื่อม = เมิน) · สลับสมุดที่ใช้จริงขณะบริษัทผูกผู้ติดต่อของเล่มอื่น = VALIDATION ไทย (`account.accountContactsInOtherBooks` + `companies.heldAccountContactIds`) · ไม่มีทาง rebind อัตโนมัติ
- S4 ค่าที่เลือกไว้แต่ใช้ไม่ได้ (`stale`) = เตือน + ตัวเลือกกดไม่ได้ + "ใช้อยู่" จากตัวตัดสิน · กลับ "อัตโนมัติ" ได้
- S5 +7 แถวทะเบียน (widget /p · `member-view-team` · `hr-link-sales-teams`) + `CRM_HOSTED_CONTROLS` ใน `scripts/fitness.mts` (บล็อก C3.6 — ไม่งั้นเป็นแถวผี F14.2)
- S6 ข้อความ: ไม่ได้เลือกและมีหลายระบบ = สะพานที่ต้องเขียน **ข้าม** เหตุการณ์ (ไม่รอ)
- notes: `resolveCrmTargets(t, crm, kinds?)` ถามเฉพาะชนิด (import บัญชีเฉพาะเมื่อถาม account) · todayTasks = วันนี้ → เลยกำหนด → เสร็จ · `loadEditable` OWNER แก้/ลบ PRIVATE ของคนอื่นได้แบบเดิม · หน้าสมาชิกตัด `?view=` ด้วย redirect · `/p` ใช้ `thaiDayStartMs` (facade) · action ปฏิเสธค่าไม่ใช่สตริง (VALIDATION) · ลิงก์ HR ซ่อนเมื่อร้านไม่มี CRM v2 · DTO probe `.qc-shots/c36/dto-probe.mts` (HEAD → ไฟล์ชั่วคราว · mtime ต่างกัน · jq diff ว่าง)
- §7 (เพิ่ม · รับตามมติ): ระบบที่ `active = false` ไม่ใช่ปลายทาง (ตัวตัดสิน/validation) แต่ทางอ่านแบบเดิม (null) ยังไล่ครบรวมตัวที่ปิด (`listTargetCandidates` คืนทุกตัว เรียงเปิดก่อน) — เดิม member-bridge นับทุกระบบ `take: 2` · ตัวตัดสินเลือก **ต่อระบบ CRM** ไม่ใช่ต่อสาขา (สาขาเป็นแค่ทางเดาลำดับ 2 เมื่อยังไม่เลือก)

## 8. ORACLE-EDIT (รอบรีวิว 2)
- **C3.6-S1.4** บรรทัด 531–532 ตรึง `lastError` = รายละเอียด OpsEvent (`includes("boom ${TAG}")`) ซึ่งมติ S1 ห้ามส่งถึงร้าน · เสนอ: `badOk` ใช้ `jb.failed === true && typeof jb.reason === "string" && !j(jb).includes(\`boom ${TAG}\`)` · `okOk` ใช้ `jo.failed === false` (แทน `lastError` null) — ผลจริง `failed:true, reason:"รอบล่าสุดไม่สำเร็จ…"`
- **C3.6-X3.1** รอบ 0 ตั้ง `accountSystemId: accA` ที่ไม่มี AccountSystemLink กับ crmA — มติ S3 ปฏิเสธ (VALIDATION) · เสนอเพิ่มก่อนลูป X3.1 (~บรรทัด 604): `await P.accountSystemLink.create({ data: { tenantId: tidA, systemId: accA, linkedKind: "CRM", linkedId: crmA } });` (ไม่กระทบข้ออื่น: S2.1/X9.1 รันก่อน · บรรทัด 634 ตั้ง account = null · S2.2/S2.3/U.1 คนละร้าน/ระบบ) — รอบ 1 ของ X3.1 เขียวอยู่แล้ว

### รอบรีวิว 3 (26 ก.ย. · SF1–SF3 + notes)
- SF1 `todayTasks`: ลำดับ findMany ตรงกับตัวแปรแล้ว ⇒ items = **วันนี้ (dueAt asc) → เลยกำหนด (dueAt asc) → เสร็จวันนี้ (doneAt desc)** ตัดที่ `limit` · counts ไม่ขึ้นกับ limit · 🔎 C3.6-S3.2 ตรวจแค่ "ชุด" ของ id (`idsOf` เรียงก่อนเทียบ) — **ไม่ตรวจลำดับ** จึงไม่จับบั๊กนี้ (ไม่ขอแก้ข้อสอบ · ถ้าจะตรึงลำดับ: เทียบ `items.map(id)` ตรง ๆ กับ `[aT1, aT2, aT3, aT4]`)
- SF2 สถิติเหตุการณ์ = `$transaction(… set_config('statement_timeout', ms, true) …).catch(() => null)` ⇒ `eventsUnavailable: true` + ข้อความ "โหลดสถิติเหตุการณ์ไม่ทัน — ลองใหม่ภายหลัง" · `minuteJobs().catch(() => [])` (แบบหน้ากฎอัตโนมัติ) · ไม่มี `$executeRawUnsafe`
- SF3 บัญชี `via === "only"` = "ยังไม่ได้เชื่อมสมุดกับ CRM นี้ — CRM จะไม่เขียนสมุดบัญชี" (ไม่ขึ้น "ใช้อยู่")
- notes: เหตุผลไทยแยก `CUSTOMER_CHAT_NOT_CONNECTED` เมื่อระบบแชทของลูกค้ายังไม่เชื่อม (เฉพาะทาง preferSystemId — ผู้เรียกเดิมได้ข้อความเดิม) · probe เพิ่มกรณี "ผู้ติดต่ออยู่ทั้ง A และ B + prefer A ⇒ A" · `Object.hasOwn` · `accountSystemForCrm({ bookId })` ตรวจ AccountSystemLink CRM ที่เปิดอยู่ภายใน · `crmLinkedBooks` = คำสั่ง SQL เดียว (JOIN AppSystem · `createdAt, id` asc) · `targetPicker` เรียกครั้งเดียวแล้วส่งให้ตัวตัดสิน (`linkedBooksHint`) · `checkAccountSwitch` อยู่ในธุรกรรม FOR UPDATE และอ่านผ่าน tx เดียวกันทั้งหมด (ค่า "ก่อน" = ค่าที่ล็อกไว้ · ไม่ขอ connection เพิ่มระหว่างถือล็อก) · convertOptions เรียงก่อนตัด · ลิงก์ HR ชี้กติกาต้นฉบับ `crm/access.ts`
