// crm/index.ts — facade เดียวที่โค้ดนอกโมดูล CRM ได้รับอนุญาตให้ import (fitness F2.3 บังคับ)
// ใบงาน C0.2 — **re-export ล้วน ๆ ไม่มีตรรกะ** (ห้ามครอบ wrapper/ค่า default/ธงฟีเจอร์ที่นี่):
// ของที่เปิดออกไป = สิ่งที่โค้ดนอกโมดูลใช้อยู่จริงวันนี้เท่านั้น (ไล่จากโค้ด ไม่ใช่จากเอกสาร)
//   • createContact              ← src/lib/modules/forms/service.ts (lead จากฟอร์ม) · src/lib/ai/proposals.ts (crm_create_lead)
//   • listPartyIdsWithContact    ← src/lib/modules/account/contacts-list.ts (ป้าย "CRM" ในรายชื่อผู้ติดต่อ)
//   • findContactsForLink        ← src/lib/modules/account/contact-links.ts (บล็อก "คนเดียวกันไหม")
//   • setContactPartyId          ← src/lib/modules/account/contact-links.ts (ผูก CrmContact เข้า Party)
//   • findContactByPartyId       ← src/lib/modules/account/contact-profile.ts (การ์ด CRM ในโปรไฟล์)
//   • findLatestDealForContact   ← src/lib/modules/account/contact-profile.ts (ดีลล่าสุด)
//   • isCrmV1Closed              ← src/lib/ai/proposals.ts (crm_create_lead แบบเดิมห้ามยืนยันบนระบบ v2 · C5.4-B H5)
// 🔴 CrmHub **ไม่อยู่ที่นี่** (มติผู้คุมงาน addendum 3): `index.ts` = ผิวฝั่งเซิร์ฟเวอร์ · `ui.tsx` = ทางเข้าคอมโพเนนต์
//    เหมือนอีกสิบโมดูลที่ `src/app/app/sys/[id]/page.tsx` import Hub จาก `<module>/ui` (coupon · meeting · kanban ·
//    chat · inventory · hr · marketing · member · point · reward) — ถ้าดึง ./ui เข้ามาที่นี่ ทุกคนที่ import facade
//    จะลาก ui.tsx → @/lib/core/context → @/lib/env เข้ากราฟด้วย ⇒ ทะเบียน AI/บัญชี พังในโหมดไร้ env (ด่าน D5)
// ชนิดข้อมูลที่แนบมาด้วย = พารามิเตอร์ของฟังก์ชันข้างบน (ถูกลบทิ้งตอนคอมไพล์ จึงไม่ขยายผิวโมดูลตอนรัน)
// ภายในโมดูล CRM เองยังคง import กันเองแบบ relative ตามเดิม
export {
  createContact,
  findContactByPartyId,
  findContactsForLink,
  findLatestDealForContact,
  isCrmV1Closed,
  listPartyIdsWithContact,
  setContactPartyId,
} from "./service";
export type { Ctx, CreateContactInput } from "./service";

// CRM C1.2b ▸ วัตถุกำหนดเอง (`objects.ts`) — namespace เดียว: create/update/archive/restore/reorder/list/get/warnings ·
//   records.{create,update,archive,get,list,move,bulk,import,export} · tabsFor · timelineFor · onRecordCreated (ตัวรับ event)
//   ผู้ใช้ถัดไป: C1.3/C1.4 (แท็บใน 360) · C1.9 (หน้า UI) · C1.10 (REST/tool) · outbox-consumers (ไทม์ไลน์สมาชิก)
//   ค่าคงที่/ชนิด/เทมเพลตสำหรับหน้า 'use client' อยู่ที่ `./objects-shared` (ไม่ลากกราฟ prisma)
export * as objects from "./objects";
// ◂ CRM C1.2b
// CRM C1.3 ▸ บริษัท (`companies.ts`) — namespace เดียว: createCompany/updateCompany/archiveCompany/setOwner/setParent · getCompany360 ·
//   listCompanies/exportCompanies · addContact/removeContact/setPrimary/setRole · findDuplicates/mergeCompanies ·
//   importCompanies/importFromAccount · recomputeCaches · onCompanyCreated (ตัวรับ event)
//   ผู้ใช้ถัดไป: C1.4 (บริษัทของผู้ติดต่อ) · C1.5 (recomputeCaches หลัง event ดีล) · C1.8 · C1.10 (REST/tool crm_company_360/crm_create_company)
//   ค่าคงที่/ชนิด/ตัวตรวจสำหรับหน้า 'use client' อยู่ที่ `./companies-shared` · ขอบเขตการอ่าน `./where` (companyWhere)
export * as companies from "./companies";
export { companyWhere } from "./where";
// ◂ CRM C1.3
// CRM C1.4 ▸ ผู้ติดต่อ (`contacts.ts`) — namespace เดียว: createContact/updateContact/getContact360/listContacts · convertContact ·
//   assignContact/bulkAssign · setLeadStatus/setLifecycle/setTags/setOptOut/archiveContact · findDuplicates/mergeContacts ·
//   importContacts/getImportJob/exportContacts · briefFor (การ์ดย่อจาก contactId/partyId ให้แชท/สมาชิก/บัญชี)
//   ความยินยอม (มติ C20 · `consents.ts`) — `consents.set/current/history/canContact` · `canContact` = ตัวตัดสินตัวเดียวของผู้ส่งทุกเส้นทาง
//   ค่าคงที่/ชนิด/ตัวตรวจสำหรับหน้า 'use client' อยู่ที่ `./contacts-shared` · ขอบเขตการอ่าน `./where` (contactWhere)
export * as contacts from "./contacts";
export * as consents from "./consents";
export { canContact } from "./consents";
export { contactWhere } from "./where";
//   บริษัท (namespace `companies` ข้างบน) ได้ทางเข้าที่เข้าร่วม tx ของผู้เรียกเพิ่ม 4 ตัว (มติ C1.4 Option A):
//   companies.createInTx · companies.linkContactInTx · companies.transferContactLinksInTx · companies.liveCompanyRefs
// ◂ CRM C1.4
// CRM C1.5 ▸ ดีล (`deals.ts`) — namespace เดียว: createDeal/moveDeal/reopenDeal/reassignDeal/setForecastCategory/setNextStep/
//   setCollaborators/updateDeal · setLines (+ lines.set) · issueQuotation/issueInvoice · getDeal360/listDeals/getBoard/forecast ·
//   bulkMove/bulkReassign/bulkTag/exportDeals · deleteDeal · changePipeline · applyDiscountDecision (ผลสายอนุมัติ crm.discount —
//   ผู้เรียก: src/lib/approval-effects.ts) · moveOpenDealsOfContact (C1.4 ผู้ติดต่อย้ายบริษัท)
//   ตั้งค่า pipeline/ขั้น (`pipelines.ts`) · เหตุผลที่แพ้ (`lost-reasons.ts`)
//   ค่าคงที่/ชนิด/ตัวคำนวณสำหรับหน้า 'use client' อยู่ที่ `./deals-shared` · ขอบเขตการอ่าน `./where` (dealWhere)
export * as deals from "./deals";
export * as pipelines from "./pipelines";
export * as lostReasons from "./lost-reasons";
export { dealWhere } from "./where";
// uiVersion gate: ตัวแปลง settings.crm (บริสุทธิ์) — ผู้เรียก: src/app/app/layout.tsx (เมนู CRM v2 โผล่เฉพาะระบบ uiVersion 2)
export { parseCrmSettings } from "./settings";
// ◂ CRM C1.5
// CRM C1.6 ▸ กิจกรรม v2 (`activities.ts`) — namespace เดียว: logActivity/completeActivity/rescheduleActivity/updateActivity/setPinned/
//   deleteActivity/getActivity/listActivities/calendar/listNotes/openTaskCard · mentionOptions/outcomeOptions · onKanbanCardCompleted
//   (ตัวรับ event) · dealKanbanCards · ไฟล์แนบ (`files.ts` · มติ C19 · ไฟล์ส่วนตัว C0.4) — attachFile/listFiles/removeFile
//   ผู้ใช้ถัดไป: outbox-consumers (kanban.card.completed) · บล็อก src/components/crm/{activity,files} (server) · C1.10 (REST/tool crm_log_activity)
//   ค่าคงที่/ชนิด/ตัวช่วยเวลาไทยสำหรับหน้า 'use client' อยู่ที่ `./activities-shared` · ขอบเขตการอ่าน `./where` (activityWhere · fileWhere)
export * as activities from "./activities";
export * as files from "./files";
export { activityWhere, fileWhere, recordWhere } from "./where";
// CRM C2.4 (รอบ 2) ▸ ตัวจัดรูปเวลาไทยของกิจกรรม เปิดผ่าน facade ให้บล็อกใน `src/components/crm/**` ใช้ได้
//   (ด่าน F2.3 ห้าม components import `./activities-shared` ตรง ๆ · ไฟล์นั้นบริสุทธิ์ ⇒ re-export ไม่ลากอะไรเข้ากราฟ)
//   🔴 ห้ามทำสูตรเวลาไทยชุดที่สองในคอมโพเนนต์ (ข้อที่เพี้ยนแล้วหาไม่เจอที่สุดคือเวลา) ⇒ ทางนี้ทางเดียว
export { thaiDateLabel, thaiTimeLabel } from "./activities-shared";
// ◂ CRM C1.6
// CRM C1.7 ▸ การมองเห็น OWN/TEAM/ALL (`visibility.ts`) — namespace เดียว: resolve · visibleWhere · canSee · visibleIdsAmong ·
//   visibleIdsForViewer (ผู้ดูจากโมดูลอื่น — การ์ดบอร์ดงาน) · policies.{list,set,remove} · คีย์สิทธิ์ (`access.ts`) ใช้ภายในโมดูล
//   ผู้ใช้: src/lib/modules/kanban/link-resolvers.ts (ลิงก์ DEAL/COMPANY/CRM_CONTACT/CUSTOM_RECORD) · C1.10 (REST/tool) · C3.x (รายงาน)
export * as visibility from "./visibility";
//   ตัวตัดสินคีย์ของ CRM (`access.ts`) — ผู้ใช้นอกโมดูล: หน้า core `/app/settings/teams` (ด่าน crm.team.manage) · drawer ใน layout
export { crmCan, CRM_ROLE_DEFAULTS } from "./access";
// ◂ CRM C1.7
// CRM C1.10 ▸ REST + AI ชุดแรก (`api/`) — namespace เดียว `crmApi`: dispatch/dispatchTeams (route `/api/v1/crm/*` · `/api/v1/teams/*`) ·
//   buildOpenApi · CRM_OPS · สะพานผู้ช่วย AI (crmToolInfos/runCrmTool/dispatchCrmKind/isCrmKind/crmKindAccess/crmToolAllowedForScopes …) ·
//   crmWebhookEvents · ผู้ใช้: route ของ REST · src/lib/ai/{tools-crm,skills,proposals}.ts (F2.3 — ห้ามล้วง crm/api ตรง)
export * as crmApi from "./api";
// ◂ CRM C1.10
// CRM C1.11 ▸ การ์ดย่อ CRM ของ Party (`brief.ts`) — ผู้ใช้: แผงข้างห้องแชท `src/lib/modules/chat/crm-panel-actions.ts` (เส้น chat→crm) ·
//   ประตูรุ่นหน้าจอ (`crmUiVersion`) ให้ผู้เรียกนอกโมดูลตัดสินเองก่อนแตะ CRM · สวิตช์ v1↔v2 ซ่อนจากร้านจริงโดยปริยาย (`isCrmV2SwitchAllowed`)
export { briefFor, crmPanelTarget, partyBriefs } from "./brief";
export type { CrmBrief, CrmBriefDeal, PartyCrmBrief } from "./brief";
export { crmUiVersion, isCrmV2SwitchAllowed } from "./ui-version";
// ◂ CRM C1.11
// CRM C2.1 ▸ กฎอัตโนมัติ CRM (`automation.ts` · scope CRM บนตัวรันกลาง `@/lib/automation/action-runner`) — namespace เดียว:
//   createRule/updateRule/toggleRule/deleteRule/listRules/listRuns/usageThisMonth/applyStarterRules/dryRun/builderOptions ·
//   runForCrmEvent (ผู้เรียก: src/lib/automation/engine.ts — lazy import แบบเดียวกับบอร์ดงาน) · runDueWaits/runCronTriggers
//   (ผู้เรียก: งานตามเวลา `src/lib/platform/minute-jobs.ts` crm.automation.*) · ทะเบียน trigger/action/กฎเริ่มต้นอยู่ที่ `./automation-shared`
export * as automation from "./automation";
// ◂ CRM C2.1
// CRM C2.2 ▸ ลำดับการติดตาม (`sequences.ts` · ตัวรันกลาง `@/lib/automation/action-runner`) — namespace เดียว:
//   createSequence/updateSequence/archiveSequence/listSequences/getSequence/sequenceOptions · enroll/bulkEnroll/stop/pause/resume ·
//   getEnrollment/listEnrollments/stats · ปฏิทิน calendarSettings/setBusinessDays/addHoliday/removeHoliday/importThaiHolidays ·
//   runDue (งานรายนาที "crm.sequences" — ลงทะเบียนตอน import) · stopFor = ทางเข้าเดียวของการหยุดอัตโนมัติ (R-A: C2.4/C2.5 เรียกตัวนี้ ·
//   ตัวรับ event ชนะ/แพ้/opt-out อยู่ที่ `src/lib/platform/crm-bridges/sequences.ts`) · ค่าคงที่/ตัวตรวจอยู่ที่ `./sequences-shared`
export * as sequences from "./sequences";
// ◂ CRM C2.2
// CRM C2.3 ▸ มอบหมาย lead อัตโนมัติ (`assignment.ts`) — namespace เดียว `assignment` = `assignmentFacade` ที่ประกาศในไฟล์นั้น:
//   pick (ผู้เรียก: contacts.ts ใน tx ของการสร้าง) · listRules/createRule/updateRule/toggleRule/deleteRule/reorderRules ·
//   getAssignmentSettings/setFallbackUser · simulate · pageData/assertAssignmentAccess (หน้า `/crm/settings/assignment`) ·
//   leaveSnapshot/notifyUnassigned (ทางสร้างผู้ติดต่อ) · ทะเบียนโหมด/เงื่อนไขสำหรับหน้า 'use client' อยู่ที่ `./assignment-shared`
//   🔴 `openLoadOf` ไม่อยู่บน facade (มติผู้คุมงาน 24 ก.ย. 2569 · ข้อ S5 ของผู้ตรวจ): ยังไม่มี actor/คีย์/ประตู/ตัวกรองการมองเห็น
//      และยังไม่มีผู้เรียกนอกโมดูล — C2.11/C3.2 จะเปิดให้พร้อม actor + คีย์ตอนที่ต้องใช้จริง (ยัง export จาก `assignment.ts`)
export { assignmentFacade as assignment } from "./assignment";
// ◂ CRM C2.3
// CRM C2.4 ▸ บันทึกการโทร + ผู้ช่วย AI ของสาย (`calls.ts`) — namespace เดียว:
//   logCall/attachRecording/getRecording/removeRecording/purgeRecordings (เสียงบนทางไฟล์ส่วนตัว C0.4) ·
//   callAiStatus/transcribeCall/pendingCallAiProposal/acceptCallAiProposal/rejectCallAiProposal (ถอดเสียง → สรุป → **ข้อเสนอ**) ·
//   scanBusinessCard/acceptLeadProposal (นามบัตร → ข้อเสนอ lead ของระบบนี้) · bookingLinkFor (R-A "จองผ่านระบบจองคิว")
//   ผู้ใช้ถัดไป: `calls-actions.ts` (หน้า v2) · C2.10 (ลงทะเบียน purgeRecordings เป็นงานรายวัน)
//   ค่าคงที่/ชนิด/ตัวปิดเบอร์-อีเมลสำหรับหน้า 'use client' และสะพานแชทอยู่ที่ `./calls-shared`
//   อะแดปเตอร์: `./transcriber` (CrmTranscriber — ทะเบียนว่างตาม R-B) · `./call-provider` (CrmCallProvider + ตัวตรวจ webhook บริสุทธิ์)
//   `reminders.ts` (เตือนงาน/นัดที่ถึงเวลา) อยู่บน facade ด้วย เพราะทะเบียนงานรายนาที (`platform/minute-jobs.ts`) อยู่นอกโมดูล
//   ⇒ ต้องเรียกผ่าน facade เหมือน C2.1/C2.2 (ด่าน F2.3 ห้ามโค้ดนอกโมดูล import ไฟล์ภายในของ CRM)
//   ⚠️ ผลพลอยได้: import facade = โหลดทะเบียนงานรายนาทีด้วย (reminders.ts import ทะเบียนไว้ให้ข้อสอบ S5.1) — ทะเบียนนั้น
//      พา prisma + ops มาเท่านั้น (ตัวงานโหลด CRM แบบ dynamic ตอนรัน) จึงไม่มีวงโหลดและไม่ลากกราฟเพิ่ม
export * as calls from "./calls";
export * as reminders from "./reminders";
// ◂ CRM C2.4
// CRM C2.5 ▸ ระบบอีเมล (`emails.ts`) — namespace เดียว: resolveRouting · getEmailSettings/setEmailSettings ·
//   getUserSetting/setUserSetting/listUserSettings · rotateInboundKey · sendEmail/sendAsSystem (ทางเข้าของ C2.1 SEND_EMAIL
//   และขั้น EMAIL ของ C2.2 — R-E.5) · runScheduled (งานรายนาที "crm.email.scheduled") · ingestInbound (route อีเมลขาเข้า
//   แยกทาง `crm+<key>@` มาที่นี่ก่อนบอร์ดงาน) · listThreads/getThread/attachmentUrl/attachToContact ·
//   listTemplates/saveTemplate/deleteTemplate · addDomain/refreshDomain/listDomains · sendTest ·
//   trackOpen/trackClick/trackRateKeys/trackGate/unsubscribe/providerWebhook (route `/t/o` `/t/c` `/u` webhook เรียกผ่าน
//   facade นี้เท่านั้น — fitness F2.3 จงใจไม่ยกเว้นโฟลเดอร์พวกนั้น) · purgeBodies (C2.10 ลงทะเบียนเป็นงานรายวัน — R-A)
//   ค่าคงที่/ชนิด/ตัวช่วยบริสุทธิ์สำหรับหน้า 'use client' อยู่ที่ `./emails-shared`
export * as emails from "./emails";
// ◂ CRM C2.5
// CRM C2.6 ▸ การติดตามเว็บ (`tracking.ts`) — namespace เดียว: ลิงก์ติดตาม (createLink/updateLink/deleteLink/listLinks/linkStats/
//   linkQrSvg) · ตั้งค่าเว็บ (getWebSettings/saveWebSettings) · สถิติ/ไทม์ไลน์ (webStats/webTimeline) · ฟอร์ม → CRM
//   (listFormTargets/saveFormTarget) · ทางสาธารณะที่ route เรียก (resolveSite/collect/recordConsent/identify/purgeWeb/
//   resolveLinkHit/linkUniqueCookie/trackerScript/corsOriginForPayload/corsOriginForPreflight/ticketedClickUrl) ·
//   ตั๋วระบุตัวตนของลิงก์ในอีเมล
//   (emailClickTicket/appendIdentifyTicket) · `ipHashFor` (ตัวแทนของ IP ตัวเดียวของโมดูล)
//   ผู้เรียกนอกโมดูล: route `/l/[code]` `/t/s/[script]` `/t/e` `/t/consent` `/t/c/[token]` (ใบ C2.5 · hunk ตั๋ว) ·
//   สะพานฟอร์ม `src/lib/platform/crm-bridges/forms.ts` · โมดูลฟอร์ม (`ipHashFor` ของคำตอบฟอร์ม) · C2.10 (ลงทะเบียน purgeWeb)
//   ค่าคงที่/ตัวช่วยบริสุทธิ์สำหรับหน้า 'use client' อยู่ที่ `./tracking-shared`
export * as tracking from "./tracking";
// ◂ CRM C2.6

// CRM C2.7 ▸ ทางเดินเงิน (`payments.ts`) — namespace เดียว `payments`:
//   ทางเข้าของสะพาน (ไม่มี actor คน · ผู้เรียกตัดสินประตูมาแล้ว): recordDocPayment · onInvoiceFullyPaid · reverseDocPayment ·
//     flagDocumentVoided · countPosSale · reversePosSale · countedWonValueOf
//   ทางเข้าของคน (actor + คีย์ + การมองเห็น): linkSaleToDeal (ปุ่มผูกบิลของแคชเชียร์) · openDealsForParty (ช่อง "ดีล" บนหน้าขาย ·
//     ไม่มีคีย์ = รายการว่าง ไม่ throw) · dealForDoc (บล็อกดีลบนหน้าเอกสารบัญชี) · dealMoney
//   ผู้เรียก: `src/lib/platform/crm-bridges/money.ts` (6 ตัวรับ event) · `src/lib/modules/pos/register.ts` (เส้น pos→crm) ·
//     `src/lib/actions/pos.ts` (ผูกบิลหลังขายสำเร็จ — ห่อไว้ ล้มแล้วบิลไม่ล้ม) · `crm/doc-block.tsx` (หน้าเอกสารบัญชี)
//   ค่าคงที่/ชนิดบริสุทธิ์ (DEAL_VOIDED_TAG · POS_LINK_LIMIT · MONEY_REF_TYPES) อยู่ที่ `./payments-shared`
export * as payments from "./payments";
export { DEAL_VOIDED_TAG, POS_LINK_LIMIT, MONEY_REF_TYPES } from "./payments-shared";
export type { DealForDoc, DealMoney, OpenDealOption } from "./payments-shared";
// ◂ CRM C2.7

// CRM C2.8 ▸ คะแนนผู้ติดต่อ (`scoring.ts`) — namespace เดียว `scoring`:
//   seedSystemRules (กฎเริ่มต้น 8 ข้อจากข้อมูลกลางของ C1.11) · listRules/createRule/updateRule/toggleRule/deleteRule/reorderRules ·
//   onEvent (ทางเข้าการให้คะแนนทางเดียว — สะพาน `crm-bridges/scoring.ts` เรียกตัวนี้) · adjust (ADJUST_SCORE ของ C2.1 ·
//   `FormDef.scoreOnSubmit` ของ C2.6 · คนกดเอง) · decay/applyInactivity/runDailyScoring (งานรายวัน `crm.scoring.decay` —
//   ทะเบียนอยู่ที่ `src/lib/platform/minute-jobs.ts` จึงต้องเรียกผ่าน facade เหมือน C2.1/C2.2) · explain (เหตุผล 3 ข้อล่าสุด ·
//   ภาพ 05) · recompute (ทั้งร้าน = การกระทำอันตราย) · get/setScoringSettings · assertScoringAccess (ด่านของหน้า/action)
//   ค่าคงที่/ชนิด/`bandOf` สำหรับหน้า 'use client' อยู่ที่ `./scoring-shared`
export * as scoring from "./scoring";
// ◂ CRM C2.8
// CRM C2.10 ▸ แจ้งเตือนพนักงาน (`notifications.ts`) — namespace เดียว `notifications`:
//   notifyStaff (จุดเดียวที่ CRM v2 แจ้งเตือนคน) · runFanout (งานรายชั่วโมง `crm.notify.fanout` — เก็บส่งของที่เลื่อน
//   เพราะ quiet hours) · getNotificationSettings/setTemplate/setNotificationSettings (ค่าของร้าน · คีย์ `crm.settings.manage`) ·
//   getMyPrefs/setMyPrefs (ค่าของแต่ละคนใน `CrmUserPref` — ไม่ต้องมีคีย์ · ไม่มีทางเขียนของคนอื่น)
//   ทะเบียนเทมเพลต 10 ตัว/ช่องทาง 3 ตัว/ตัวตรวจค่า สำหรับหน้า 'use client' อยู่ที่ `./notifications-shared`
//   ผู้เรียกอื่นในใบนี้: `deals.markStale` (สรุปดีลนิ่งรายวัน) · ทะเบียนงานของ C0.5 (`platform/minute-jobs.ts`)
export * as notifications from "./notifications";
// ◂ CRM C2.10
// CRM C3.3 ▸ export * as commissions from "./commissions" ◂
//   คอมมิชชัน → เงินเดือน (`commissions.ts`) — namespace เดียว `commissions`:
//   ทางเข้าของสะพาน (ไม่มี actor คน): onPaid · onWon · reverse · syncPayroll · afterPaymentCounted/afterPaymentsReversed (ทางเดินเงิน
//   payments.ts) · afterDealMoved (deals.ts) · applyApprovalDecision (src/lib/approval-effects.ts · entityType `crm.commission`) ·
//   onPayrollPaid (`hr.payroll.paid`) · advanceById (ตัวรับ event ของตัวเอง) · runPayrollSync (งานรายนาที `crm.commissions.payroll`)
//   ทางเข้าของคน: listRules/createRule/updateRule (crm.settings.manage) · approve/approveMany/reject (crm.commission.approve + เพดาน) ·
//   mine (ทุกคน) · list (crm.commission.view) · pending (crm.commission.approve) · report (crm.report.view | crm.commission.view)
//   สูตรเงิน/ค่าคงที่/ชนิดสำหรับหน้า 'use client' อยู่ที่ `./commissions-shared` (บริสุทธิ์)
export * as commissions from "./commissions";
// ◂ CRM C3.3
// CRM C3.2 ▸ โควตา · หน้าแรก (KPI 6 · leaderboard · ที่มา lead · "ไม่มีเจ้าของ") · มุมมองที่บันทึกของ contact/company/deal
//   `quotas` (`quotas.ts`): setQuota/listQuotas/progress/checkReached/quotaBoard · reachedAfterCommit (ทางเดินเงิน/ย้ายเข้า WON หลัง commit) ·
//     onReached (ตัวรับ event `crm.quota.reached` ใน outbox-consumers) — ตัวช่วยงวดเวลาไทยบริสุทธิ์อยู่ที่ `./quotas-shared`
//   `home` (`home-data.ts` — ไม่ใช่ `home.ts` ที่จะชน `./home` ของ ui.tsx): kpis/leaderboard/leadSources/unowned/homeData
//   `views` (`views.ts`): listViews/createView/updateView/deleteView (+ ตัวช่วยของหน้ารายการ) — มุมมองสมาชิก (`member/views.ts`) ไม่เกี่ยว
export * as quotas from "./quotas";
export * as home from "./home-data";
export * as views from "./views";
// ◂ CRM C3.2
// CRM C3.1 ▸ รายงาน (`reports.ts`) — namespace เดียว `reports`: 8 แท็บ overview/forecast/funnel/reps/activities/lostReasons/
//   sources/scores · getReport (ตัวแจกงานตัวเดียว — C3.4 `crm_reports` ใช้ตัวนี้) · ส่งออก CSV เป็นงาน async
//   startExport/runExportJobs/getExport (`CrmImportJob` kind REPORT_EXPORT + lease · งานรายนาที `crm.reports.exports`) ·
//   ตารางส่งอีเมล listSchedules/saveSchedule/deleteSchedule (ใน `settings.crm.reportSchedules[]` — R-E.6) · runScheduled
//   (ตัวงานรายวัน `crm.reports.scheduled` ของ C2.10 — ทะเบียนอยู่ที่ `src/lib/platform/minute-jobs.ts` จึงเรียกผ่าน facade)
//   🔴 namespace `lostReasons` ข้างบนคือบริการตั้งค่าเหตุผลที่แพ้ (C1.5) — แท็บรายงานคือ `reports.lostReasons` (คนละ namespace)
//   ค่าคงที่/ชนิด/ตัวช่วยเวลาไทยสำหรับหน้า 'use client' อยู่ที่ `./reports-shared`
export * as reports from "./reports";
// ◂ CRM C3.1
// CRM C3.5 ▸ พอร์ทัลลูกค้าองค์กร `/b/<slug>/*` (`portal.ts`) — namespace เดียว `portal`:
//   ลูกค้า (token ดิบก่อนเสมอ): portalShopBySlug/acceptInvite/requestOtp/verifyOtp/loginWithLine/switchCompany/logout/requirePortal ·
//     home/myCompanies/me · listQuotations/getQuotation/respondQuotation · listInvoices/getInvoice/payLink/uploadSlip · listReceipts ·
//     listDocuments/getRecord/requestRecordChange · listRequests/getRequest/createRequest · listContacts
//   พนักงาน (ctx, actor · crm.portal.manage): invite/revoke/listAccess/listCompanyRequests/decideRequest · getPortalSettings/savePortalSettings
//   ระบบ: eraseContact (PDPA — C3.9 เรียก) · onApprovalDecided (approval-effects) · onPortalEvent (สะพาน crm-bridges/portal.ts)
//   ผิว session (`cp_` · คุกกี้ shark_portal) อยู่ที่ member/customer-session.ts (R-C.5) และถูกส่งต่อจาก portal.ts
//   ค่าคงที่/DTO/ตัวแปลงบริสุทธิ์ (PORTAL_BASE_PATH ตัวเดียว) อยู่ที่ `./portal-shared` — ผู้เรียกนอกโมดูลใช้ผ่าน re-export ข้างล่าง
export * as portal from "./portal";
export {
  PORTAL_BASE_PATH,
  portalPath,
  portalBaht,
  portalDate,
  PORTAL_ROLE_LABEL,
  PORTAL_ROLES,
  PORTAL_REQUEST_KIND_LABEL,
  PORTAL_DOC_STATUS_LABEL,
  PORTAL_DOC_TYPE_LABEL,
  PortalError,
  portalCanChangeData,
  portalCanPay,
  portalCanRespond,
} from "./portal-shared";
export type {
  PortalHomeDto,
  PortalQuotationDto,
  PortalInvoiceDto,
  PortalReceiptDto,
  PortalDocumentItem,
  PortalRecordDto,
  PortalRequestDto,
  PortalContactDto,
  PortalFileDto,
  PortalCompanyRef,
  PortalSettings,
} from "./portal-shared";
// ◂ CRM C3.5
// CRM C3.7 ▸ แอปพนักงาน ส่วน CRM (`mobile.ts` · route `src/app/api/mobile/crm/**` · ภาพ 13) — namespace เดียว `mobile`:
//   resolveSystem (`?systemId=` หรือระบบ uiVersion 2 ใบแรก · v1 ⇒ 409 CRM_V2_DISABLED) · myDeals/dealDetail · todayTasks/completeTask ·
//   callPrompt · callOnce (กันบันทึกสายซ้ำด้วย idempotencyKey — ตัวบันทึกจริงยังเป็น `calls.logCall`) · mobileErrorOf (error → JSON ไทย)
//   ผู้เรียก: `src/lib/mobile/crm-routes.ts` + route ทั้ง 7 เส้น (นามบัตรเรียก `calls.scanBusinessCard`/`acceptLeadProposal` ตรง)
export * as mobile from "./mobile";
// ◂ CRM C3.7
// CRM C3.6 ▸ เชื่อมต่อทุกระบบ (`integrations.ts`) + widget ของหน้า PAGES (`widgets.ts`)
//   `integrations`: integrationStatus (สถานะ 24 ระบบ + งานรายนาที) · getTargets/setTargets (`settings.crm.targets`) · targetPicker ·
//     resolveCrmTargets/resolveCrmTargetsDetailed = ตัวตัดสินปลายทาง **ตัวเดียว** (ผู้เรียกนอกโมดูล: src/lib/member-bridges.ts#onCrmDealWon) ·
//     listTargetCandidates = raw lookup ตัวเดียวของระบบปลายทาง · ค่าคงที่/ชนิดบริสุทธิ์อยู่ที่ `./integrations-shared`
//   `widgets`: myDeals · todayTasks · portalEntry · portalShopEntry — ผู้เรียก: src/lib/pages/service.ts + src/app/p/[slug]/page.tsx
export * as integrations from "./integrations";
export * as widgets from "./widgets";
//   ขอบวันไทย (00:00 +07:00) ให้หน้า `/p/[slug]` จัดกลุ่มงานวันนี้/เลยกำหนด — สูตรเดียวของโมดูล (ไฟล์บริสุทธิ์)
export { thaiDayStartMs } from "./activities-shared";
// ◂ CRM C3.6
// CRM C3.4 ▸ ผู้ช่วย AI ในหน้า + สะพานห้องทีม (MEETING) + คลังความรู้ (KB) (`ai-bridges.ts`) — namespace เดียว `aiBridges`:
//   runAssist (ปุ่ม AI 9 ปุ่มบนดีล/ผู้ติดต่อ/บริษัท/หน้าแรก) · atRiskDeals (ชุด "ดีลเสี่ยงเดือนนี้" ตัวเดียว — tool crm_deals_at_risk ใช้ด้วย) ·
//   confirmProposal/cancelProposal (ประตูเดียวของข้อเสนอ CRM · addendum ข้อ 9) + confirmProposalById/cancelProposalById/isCrmDoorKind
//   (ทางเข้าของประตูทั่วไป `ai/proposals.ts` · `ai/actions.ts` · `/api/mobile/proposals/reject`) ·
//   onDealWonTeamRoom/onHotLeadTeamRoom (ของแถมใต้ compose ใน outbox-consumers) · postStaleDigest (งานรายวัน `crm.teamroom.stale` ใน
//   platform/minute-jobs.ts) · unfurlDealLink (การ์ดลิงก์ดีลในห้องแชท) · renderKbTokens (`{{kb:<articleId>}}`) · setTeamRoom/teamRoomOptions
//   ค่าคงที่/ชนิดบริสุทธิ์อยู่ที่ `./ai-bridges-shared` · ไปถึง MEETING/KB ผ่าน facade ของสองโมดูลนั้นเท่านั้น (เส้น crm→meeting · crm→kb)
export * as aiBridges from "./ai-bridges";
// ◂ CRM C3.4
// CRM C3.9 ▸ PDPA ฝั่ง CRM (`privacy.ts`) + เพดานของระบบ (`limits.ts`)
//   `privacy`: eraseContact (ลบตามคำขอ · danger · idempotent) · exportContact (ชุดข้อมูลของคนหนึ่งคน) · exportTenant/runExportJobs/getExport/
//     listMyExports (ไฟล์ส่งออกทั้งระบบ = งาน CRM_EXPORT บนเลนของ C3.1 · ไฟล์ส่วนตัว) · purge/purgeExports/retentionLeads (อายุเก็บ ·
//     งานรายวัน `crm.purge.exports` · `crm.retention.leads` — ทะเบียนอยู่ที่ `platform/minute-jobs.ts`) · onMemberErased (ตัวรับ
//     `member.erased` ผ่านสะพาน `crm-bridges/privacy.ts`) · retentionSettings — ค่าคงที่/ชนิดสำหรับหน้า 'use client' อยู่ที่ `./privacy-shared`
//   `limits`: CRM_LIMITS (19 คีย์ §11.9) · crmLimits/crmUsage/assertCrmLimit/noteCrmUsage/limitStatus · CRM_PARAM_CAPS · CRM_HARD_CAPS —
//     ค่าคงที่/ชนิด/ป้ายไทยสำหรับหน้า 'use client' อยู่ที่ `./limits-shared`
export * as privacy from "./privacy";
export * as limits from "./limits";
// ◂ CRM C3.9
