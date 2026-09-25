// crm-bridges/core.ts — สะพาน "โมดูลอื่น ⇄ CRM v2" (ใบ C1.8 · พิมพ์เขียว `docs/modules/20-crm-v2.md` §7.1 §7.2 §9 · มติ C11 C12)
//
// 🔴 ทำไมอยู่ที่ `src/lib/platform/` (composition root) ไม่ใช่ในโมดูล CRM: งานของไฟล์นี้คือ "อ่านของจริงจากโมดูลต้นทาง
//    (สมาชิก · บัญชี · แชท · ฟอร์ม) แล้วขอให้ CRM เขียน" ⇒ ถ้าอยู่ในโมดูล crm จะเป็นเส้น import crm→forms/chat/... เพิ่ม
//    ที่นี่อ่านโมดูลอื่นผ่าน **facade (`index.ts`) เท่านั้น** (ข้อสอบ C1.8-S0.5) และไม่เขียน MemberActivity/Customer เอง (member.recordOnce)
//
// 🔴 กติกาที่ถือทั้งโฟลเดอร์ (RESOLUTIONS R-D · R-E.14 · มติผู้คุมงาน C1.8)
//  1. **ประตูมาก่อนเสมอ** — ทุกสะพานอ่าน `settings.crm` ของระบบปลายทางก่อนเขียนอะไร: `bridgesEnabled = false` ⇒ ไม่ทำอะไร ·
//     `uiVersion = 1` ⇒ ไม่ทำอะไร (R-E.14) **ยกเว้น 2 ทางเดิมของ v1**: lead จากฟอร์ม (`forms.ts` · มติข้อ 1 — ร้านบน prod ทุกร้านเป็น v1)
//     และสะพานสมาชิก `onCrmDealWon` (`member-bridges.ts` — ไม่ผ่านไฟล์นี้)
//  2. **ของแถมใต้ `compose`** — ผู้เรียก (`outbox-consumers.ts`) ห่อทุกตัวเป็นขั้นเสริม: ล้ม = WARN ไม่ทำให้ event ล้ม ·
//     งานหลักล้ม = ขั้นเสริมยังวิ่ง ⇒ ที่นี่ "โยน" ได้ตามจริง (ไม่กลืน error เอง — ให้ WARN ของ compose บันทึก)
//  3. **ปักธงก่อน แล้วค่อยเขียน** (AUDIT-CLASS X4 · บทเรียน H5) — advisory lock + แถวธง/เงื่อนไขในธุรกรรมเดียวกับการเขียน
//  6. **ไม่เขียนตารางของโมดูลอื่นด้วย prisma ดิบ** (มติผู้คุมงาน C1.8 ข้อ 9) — ทุกการเขียนผ่าน facade ของเจ้าของตาราง (มี audit):
//     ผู้ติดต่อ/ดีล/บริษัท = บริการ crm · ChatContact = chat.linkChatContactParty · FormSubmission = forms facade (ใน tx ของ lead) ·
//     MemberActivity = member.recordOnce · ที่นี่ "อ่าน" ได้เพื่อตรวจร้าน/ประตูเท่านั้น
//  4. **ร้านเดียวเท่านั้น** (AUDIT-CLASS X1) — id ใน payload ถูกค้นด้วย `tenantId` ของ event เสมอ · ไม่พบ = event ของร้านอื่น/ของปลอม = ไม่ทำอะไร
//  5. **id ล้วน** (AUDIT-CLASS X8) — event ที่ยิงต่อจากที่นี่มีแต่ id/คีย์ · ข้อความ log ไม่มีชื่อ/เบอร์/อีเมล

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import * as member from "@/lib/modules/member";
import * as party from "@/lib/modules/party";

/** รูปของ event ที่ consumer ส่งเข้ามา (ตรงกับ `OutboxHandler` ของ `core/outbox`) */
export type BridgeEvent = {
  id: string;
  tenantId: string;
  type: string;
  payload: unknown;
  systemId: string | null;
  unitId: string | null;
};

// ───────────────────────── ตัวช่วย ─────────────────────────

export const payloadOf = (p: unknown): Record<string, unknown> => (p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {});
export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// ───────────────────────── ประตู (R-E.14 · bridgesEnabled) ─────────────────────────

export type CrmGate = { systemId: string; uiVersion: 1 | 2; bridgesEnabled: boolean; chatToLead: boolean };

/** สะพาน v2 เปิดให้ระบบนี้ไหม — uiVersion 2 **และ** bridgesEnabled */
export const bridgeOpen = (g: CrmGate | null | undefined): g is CrmGate => !!g && g.uiVersion === 2 && g.bridgesEnabled;

const gateFrom = (row: { id: string; settings: Prisma.JsonValue }): CrmGate => {
  const s = crm.parseCrmSettings(row.settings);
  return { systemId: row.id, uiVersion: s.uiVersion, bridgesEnabled: s.bridgesEnabled, chatToLead: s.chatToLead };
};

/** AUDIT-CLASS X1: ระบบ CRM ทุกใบของร้านนี้ (เก่าสุดก่อน) พร้อมค่าประตู — อ่านสดทุกครั้ง (สวิตช์ปิดต้องมีผลทันที) */
export async function crmGates(tenantId: string): Promise<CrmGate[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, settings: true } });
  return rows.map(gateFrom);
}

/** AUDIT-CLASS X1: ประตูของระบบ CRM ใบหนึ่ง — ต้องเป็นระบบชนิด CRM ของร้านนี้ (ของร้านอื่น/ชนิดอื่น = null) */
export async function crmGate(tenantId: string, systemId: string | null | undefined): Promise<CrmGate | null> {
  if (!systemId) return null;
  const row = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, settings: true } });
  return row ? gateFrom(row) : null;
}

/** ระบบ CRM ของร้านที่สะพาน v2 เปิดอยู่ (uiVersion 2 + bridgesEnabled) */
export async function openCrmSystems(tenantId: string): Promise<string[]> {
  return (await crmGates(tenantId)).filter(bridgeOpen).map((g) => g.systemId);
}

// 🔴 มติผู้คุมงาน C2.7 รอบ 2 (B2): **ไม่มี** ตัวช่วย "ระบบทุกใบแบบข้ามประตู" ที่นี่โดยเจตนา —
//    ทางถอนคืนของ `money.ts` เรียก `crmGates()` เองแล้วเลือกไม่กรองด้วย `bridgeOpen` ให้เห็นในที่เดียวกับที่ตัดสินใจ
//    (กติกาถาวรของใบ C1.11: ตัวรับ `on*` ทุกตัวต้อง "อ่านประตู" · การถอนคืนอ่านแล้วแต่ห้ามให้ประตูกลืนเงินที่เคยนับ)

// ───────────────────────── ไทม์ไลน์สมาชิก (MemberActivity) ─────────────────────────

/** สมาชิกที่ยังใช้งานของร้านนี้ (ถูกรวมไปแล้ว = ตัวที่เก็บไว้) — ไม่พบ = null (ไม่เขียนไทม์ไลน์ ไม่ throw) */
async function liveCustomer(tenantId: string, customerId: string | null | undefined): Promise<string | null> {
  let id = customerId ?? null;
  for (let i = 0; id && i < 5; i += 1) {
    const c = await prisma.customer.findFirst({ where: { id, tenantId }, select: { id: true, status: true, mergedIntoId: true } });
    if (!c) return null;
    if (c.status !== "MERGED") return c.id;
    id = c.mergedIntoId;
  }
  return null;
}

/**
 * แถวไทม์ไลน์ 1 แถวต่อ event ของผู้ติดต่อที่ผูกสมาชิก — ผ่าน `member.recordOnce` เท่านั้น
 * AUDIT-CLASS X4: recordOnce ถือ advisory lock ต่อ (สมาชิก, module, type, refId = id ของ event) + ตรวจก่อนเขียน
 *   ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = 1 แถว · ผู้ติดต่อไม่มีสมาชิก = ไม่เขียน ไม่ throw
 */
export async function timelineRow(
  evt: BridgeEvent,
  input: { customerId: string | null; type: string; summary: string; crmContactId: string | null; dealId?: string | null; crmCompanyId?: string | null; data?: Record<string, unknown>; refType?: string; refId?: string },
): Promise<boolean> {
  const tenantId = evt.tenantId;
  const customerId = await liveCustomer(tenantId, input.customerId);
  if (!customerId) return false;
  // เวลาของแถว = เวลาที่เหตุการณ์เกิด (createdAt ของ event ในคิว) ไม่ใช่เวลาที่คิวถูกระบาย · event สังเคราะห์ (ไม่มีแถว) = ตอนนี้
  const at = (await prisma.outboxEvent.findUnique({ where: { id: evt.id }, select: { createdAt: true } }))?.createdAt ?? null;
  const r = await member.recordOnce(
    { tenantId },
    {
      customerId,
      module: "crm",
      type: input.type,
      refType: input.refType ?? "OutboxEvent",
      refId: input.refId ?? evt.id,
      summary: input.summary,
      at,
      data: input.data ?? null,
      crmContactId: input.crmContactId,
      dealId: input.dealId ?? null,
      crmCompanyId: input.crmCompanyId ?? null,
    },
  );
  return r.created;
}

const ACTIVITY_TYPE_TH: Record<string, string> = {
  CALL: "โทร",
  MEETING: "นัดพบ",
  EMAIL: "อีเมล",
  LINE: "ไลน์",
  TASK: "งาน",
  NOTE: "โน้ต",
  CHAT: "แชท",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  VISIT: "เข้าพบ",
  WEB: "เว็บไซต์",
  PORTAL: "พอร์ทัลลูกค้า",
};

/**
 * event ของ CRM (§7.1 แถวที่ระบุ MemberActivity) → ไทม์ไลน์สมาชิก 1 แถวต่อ event
 *   crm.deal.created · crm.deal.stage.changed · crm.deal.reopened · crm.deal.reassigned · crm.activity.logged · crm.contact.assigned
 * ประตู: ระบบของ event ต้องเป็น uiVersion 2 + bridgesEnabled (R-E.14)
 */
export async function onCrmTimelineEvent(evt: BridgeEvent): Promise<void> {
  const gate = await crmGate(evt.tenantId, evt.systemId);
  if (!bridgeOpen(gate)) return;
  const p = payloadOf(evt.payload);
  const scope = { tenantId: evt.tenantId, systemId: gate.systemId };
  const dealOf = async (id: string | null) =>
    id ? prisma.crmDeal.findFirst({ where: { ...scope, id }, select: { id: true, contactId: true, companyId: true } }) : null;
  const contactOf = async (id: string | null) =>
    id ? prisma.crmContact.findFirst({ where: { ...scope, id }, select: { id: true, memberCustomerId: true } }) : null;

  if (evt.type.startsWith("crm.deal.")) {
    const deal = await dealOf(str(p.dealId));
    if (!deal) return;
    const contact = await contactOf(deal.contactId);
    if (!contact?.memberCustomerId) return;
    let type = "DEAL_UPDATED";
    let summary = "ดีลใน CRM มีการเปลี่ยนแปลง";
    if (evt.type === "crm.deal.created") {
      type = "DEAL_CREATED";
      summary = "เปิดดีลใหม่ใน CRM";
    } else if (evt.type === "crm.deal.stage.changed") {
      type = "DEAL_STAGE_CHANGED";
      const toId = str(p.toStageId);
      const st = toId ? await prisma.crmStage.findFirst({ where: { ...scope, id: toId }, select: { name: true } }) : null;
      summary = st ? `ดีลใน CRM ย้ายไปขั้น “${st.name}”` : "ดีลใน CRM ย้ายขั้น";
    } else if (evt.type === "crm.deal.reopened") {
      type = "DEAL_REOPENED";
      summary = "เปิดดีลที่ปิดแล้วกลับมาใหม่ใน CRM";
    } else if (evt.type === "crm.deal.reassigned") {
      type = "DEAL_REASSIGNED";
      summary = "เปลี่ยนผู้ดูแลดีลใน CRM";
    }
    await timelineRow(evt, { customerId: contact.memberCustomerId, type, summary, crmContactId: contact.id, dealId: deal.id, crmCompanyId: deal.companyId });
    return;
  }

  if (evt.type === "crm.activity.logged") {
    const id = str(p.activityId);
    if (!id) return;
    const act = await prisma.crmActivity.findFirst({ where: { ...scope, id }, select: { id: true, type: true, contactId: true, dealId: true, companyId: true } });
    if (!act) return;
    const contactId = act.contactId ?? (await dealOf(act.dealId))?.contactId ?? null;
    const contact = await contactOf(contactId);
    if (!contact?.memberCustomerId) return;
    await timelineRow(evt, {
      customerId: contact.memberCustomerId,
      type: "ACTIVITY_LOGGED",
      summary: `บันทึกกิจกรรมใน CRM: ${ACTIVITY_TYPE_TH[act.type] ?? act.type}`,
      crmContactId: contact.id,
      dealId: act.dealId,
      crmCompanyId: act.companyId,
      data: { activityId: act.id, activityType: act.type },
    });
    return;
  }

  if (evt.type === "crm.contact.assigned") {
    const contact = await contactOf(str(p.contactId));
    if (!contact?.memberCustomerId) return;
    await timelineRow(evt, { customerId: contact.memberCustomerId, type: "CONTACT_ASSIGNED", summary: "มอบหมายผู้ดูแลใน CRM", crmContactId: contact.id });
  }
}

/** `custom.record.created` → ไทม์ไลน์ของแม่ (ตัวเขียนเดิมของ C1.2b `crm.objects.onRecordCreated`) — ประตู uiVersion ของ C1.2b ข้อ 7 อยู่ที่นี่ */
export async function onCustomRecordCreated(evt: BridgeEvent): Promise<void> {
  const gate = await crmGate(evt.tenantId, evt.systemId);
  if (!bridgeOpen(gate)) return;
  await crm.objects.onRecordCreated(evt);
}

// ───────────────────────── สมาชิก → CRM ─────────────────────────

/**
 * `member.created` { customerId, partyId } → ผู้ติดต่อที่ยังใช้งานใน CRM v2 ของร้านที่ Party เดียวกันและยังไม่ผูกสมาชิก ⇒ `memberCustomerId`
 * (ผูกแล้วกับสมาชิกคนอื่น = ไม่ทับ) · AUDIT-CLASS X4: advisory lock ต่อ (ระบบ, Party) + updateMany แบบมีเงื่อนไข ใน `contacts.linkMemberFromBridge`
 * AUDIT-CLASS X1: สมาชิกต้องเป็นของร้านนี้ (ค้นด้วย tenantId ของ event) — ของร้านอื่น = ไม่ทำอะไร
 */
export async function onMemberCreated(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const customerId = str(p.customerId);
  if (!customerId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const cust = await prisma.customer.findFirst({ where: { id: customerId, tenantId: evt.tenantId, status: { not: "MERGED" } }, select: { id: true, partyId: true } });
  if (!cust) return;
  const raw = [...new Set([cust.partyId, str(p.partyId)].filter((x): x is string => !!x))];
  if (raw.length === 0) return;
  const partyIds = [...new Set([...raw, ...(await Promise.all(raw.map((x) => party.resolveCanonical(evt.tenantId, x))))])].sort();
  // ผู้เขียน CrmContact = บริการผู้ติดต่อ (conditional update + event + audit ในที่เดียว)
  for (const systemId of systems) await crm.contacts.linkMemberFromBridge({ tenantId: evt.tenantId, systemId }, { customerId: cust.id, partyIds });
}

/**
 * `member.merged` { keepId, mergedId } → ผู้ติดต่อที่ชี้สมาชิกที่ถูกรวม ⇒ ชี้สมาชิกที่เก็บไว้ (หนี้ C1.4 — `consents.canContact` อ่าน
 * ความยินยอมของสมาชิกที่เหลืออยู่) · AUDIT-CLASS X1: สมาชิกที่เก็บไว้ต้องเป็นของร้านนี้ · AUDIT-CLASS X4: updateMany แบบมีเงื่อนไข (ซ้ำ = 0 แถว)
 */
export async function onMemberMerged(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const keepId = str(p.keepId);
  const mergedId = str(p.mergedId);
  if (!keepId || !mergedId || keepId === mergedId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const keep = await prisma.customer.findFirst({ where: { id: keepId, tenantId: evt.tenantId, status: { not: "MERGED" } }, select: { id: true } });
  if (!keep) return;
  for (const systemId of systems) await crm.contacts.repointMemberFromBridge({ tenantId: evt.tenantId, systemId }, { keepId: keep.id, mergedId });
}

// ───────────────────────── บัญชี → CRM ─────────────────────────

const accountFacade = () => import("@/lib/modules/account");

/**
 * `account.quotation.responded` { documentId, accepted } → ดีลที่เปิดอยู่ที่ผูกใบนั้น ย้ายไปขั้นที่ pipeline ตั้งไว้ (ผ่านบริการดีล)
 * AUDIT-CLASS X1: เอกสารต้องเป็นใบเสนอราคาของร้านนี้ (อ่านผ่าน facade บัญชี `docLinkInfo`) · AUDIT-CLASS X4: ธงต่อ (เอกสาร, คำตอบ) ในบริการดีล
 */
export async function onQuotationResponded(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const documentId = str(p.documentId);
  if (!documentId || typeof p.accepted !== "boolean") return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const info = await (await accountFacade()).docLinkInfo(evt.tenantId, documentId);
  if (!info || info.docType !== "QUOTATION") return;
  let firstError: unknown = null;
  for (const systemId of systems) {
    try {
      await crm.deals.applyQuotationResponse({ tenantId: evt.tenantId, systemId }, { documentId: info.docId, accepted: p.accepted });
    } catch (e) {
      firstError ??= e;
    }
  }
  if (firstError) throw firstError;
}

const INVOICE_TYPES = new Set(["INVOICE", "TAX_INVOICE"]);

/**
 * `account.document.issued` { documentId } → ใบแจ้งหนี้ที่แปลงจากใบเสนอราคาของดีล (`sourceDocId`) ⇒ `CrmDeal.invoiceDocId`
 * AUDIT-CLASS X1: เอกสารอ่านผ่าน facade บัญชีด้วย tenantId ของ event · AUDIT-CLASS X4: conditional update ในบริการดีล (มีแล้ว = ไม่ทับ)
 */
export async function onDocumentIssued(evt: BridgeEvent): Promise<void> {
  const documentId = str(payloadOf(evt.payload).documentId);
  if (!documentId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const info = await (await accountFacade()).docLinkInfo(evt.tenantId, documentId);
  if (!info || !info.sourceDocId || !INVOICE_TYPES.has(info.docType)) return;
  for (const systemId of systems) {
    await crm.deals.linkInvoiceFromBridge({ tenantId: evt.tenantId, systemId }, { quotationDocId: info.sourceDocId, invoiceDocId: info.docId });
  }
}

/**
 * `account.contact.merged` { keepId, mergedId } → `CrmCompany.accountContactId` ที่ชี้ผู้ติดต่อบัญชีที่ถูกรวม ⇒ ชี้ตัวที่เก็บไว้ (R-A)
 * AUDIT-CLASS X1: ผู้ติดต่อบัญชีที่เก็บไว้ต้องเป็นของร้านนี้ · บริษัทค้นด้วยร้าน + ระบบ · AUDIT-CLASS X4: updateMany แบบมีเงื่อนไข (ซ้ำ = 0 แถว)
 * (`account.contact.created` = no-op ตาม R-A — ไม่มีสะพาน)
 */
export async function onAccountContactMerged(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const keepId = str(p.keepId);
  const mergedId = str(p.mergedId);
  if (!keepId || !mergedId || keepId === mergedId) return;
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const keep = await prisma.accountContact.findFirst({ where: { id: keepId, tenantId: evt.tenantId }, select: { id: true } });
  if (!keep) return;
  // ผู้เขียน CrmCompany มีที่เดียว = บริการบริษัท (หนี้ C1.3 · single writer)
  for (const systemId of systems) await crm.companies.repointAccountContactFromBridge({ tenantId: evt.tenantId, systemId }, { keepId: keep.id, mergedId });
}
