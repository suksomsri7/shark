import { tenantDb } from "@/lib/core/db";
import type { CrmActivityType, Prisma } from "@prisma/client";
import {
  DEFAULT_PIPELINE,
  dealStateForStage,
  lifecycleAfterDealWon,
  weightedForecast,
} from "./rules";
// WO 3.1 — Party (INTEGRATION-MAP §F.1/§F.5): ตัวตนกลางระดับ tenant · เรียกผ่าน facade เท่านั้น (F2.2)
import * as party from "@/lib/modules/party";

// CRM (ระบบที่ 19) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกาทั้งหมดมาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่เรียกใช้ + ผูก DB
//    ห้าม hardcode: ลำดับ pipeline · kind/closedAt ตอนย้าย stage · lifecycle · forecast
// scope: ใช้ tenantDb({ tenantId, systemId }) — inject tenantId+systemId ทุก query อัตโนมัติ
//    (defense-in-depth · Crm* ทุกตัวเป็น system-scoped ใน scope.ts)
//    nested write (stages) ไม่ผ่าน guard ชั้นนี้ → ใส่ tenantId/systemId ตรงเอง

export type Ctx = { tenantId: string; systemId: string };

// ── ensureCrm — idempotent seed default pipeline ──
// เรียกซ้ำได้: ถ้ามี pipeline default อยู่แล้ว → คืนตัวเดิม ไม่งอกใหม่
export async function ensureCrm(ctx: Ctx) {
  const db = tenantDb(ctx);
  const existing = await db.crmPipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
  if (existing) return existing;

  return db.crmPipeline.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: DEFAULT_PIPELINE.name,
      isDefault: true,
      sortOrder: 0,
      stages: {
        // nested create ไม่ผ่าน scope guard → ผูก tenantId/systemId ตรง
        create: DEFAULT_PIPELINE.stages.map((s, i) => ({
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          name: s.name,
          kind: s.kind,
          probability: s.probability,
          sortOrder: i,
        })),
      },
    },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
}

// ── Contact ──
export type CreateContactInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source?: string | null;
  ownerUserId?: string | null;
};

export async function createContact(ctx: Ctx, input: CreateContactInput): Promise<{ id: string }> {
  const name = input.name.trim();
  // WO 3.1 (MAP §F.1): เชื่อม Party ตอนสร้างผู้ติดต่อ CRM — ล้มเหลว = partyId null (ไม่ throw)
  const partyId = await party.safeFindOrCreate(ctx.tenantId, {
    name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    kind: "PERSON",
  });
  const c = await tenantDb(ctx).crmContact.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      source: input.source?.trim() || null,
      ownerUserId: input.ownerUserId || null,
      partyId,
      // lifecycleStage เริ่มต้น LEAD (default ใน schema)
    },
  });
  return { id: c.id };
}

// ── Deal ──
export type CreateDealInput = {
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  valueSatang: number;
  expectedCloseAt?: Date | null;
};

export async function createDeal(ctx: Ctx, input: CreateDealInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  // อ่าน stage เพื่อสำเนา kind + คำนวณ closedAt จากกติกา (ห้ามตั้ง kind ตรง)
  const stage = await db.crmStage.findFirst({ where: { id: input.stageId } });
  if (!stage) throw new Error("ไม่พบขั้นตอนดีล");
  const state = dealStateForStage(stage.kind, new Date());

  const d = await db.crmDeal.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      title: input.title.trim(),
      valueSatang: Math.max(0, Math.round(input.valueSatang || 0)),
      kind: state.kind,
      closedAt: state.closedAt,
      expectedCloseAt: input.expectedCloseAt ?? null,
    },
  });
  return { id: d.id };
}

// ย้ายดีลเข้า stage ใหม่ → sync kind + closedAt ตามกติกา · WON → contact เป็น CUSTOMER
export async function moveDeal(ctx: Ctx, dealId: string, stageId: string): Promise<void> {
  const db = tenantDb(ctx);
  const [deal, stage] = await Promise.all([
    db.crmDeal.findFirst({ where: { id: dealId } }),
    db.crmStage.findFirst({ where: { id: stageId } }),
  ]);
  if (!deal || !stage) throw new Error("ไม่พบดีลหรือขั้นตอน");

  const state = dealStateForStage(stage.kind, new Date());
  await db.crmDeal.update({
    where: { id: deal.id },
    data: { stageId: stage.id, kind: state.kind, closedAt: state.closedAt },
  });

  // ปิดสำเร็จ (WON) → เลื่อน lifecycle ของ contact เป็น CUSTOMER (จากกติกา)
  if (stage.kind === "WON") {
    const contact = await db.crmContact.findFirst({ where: { id: deal.contactId } });
    if (contact) {
      const next = lifecycleAfterDealWon(contact.lifecycleStage);
      if (next !== contact.lifecycleStage) {
        await db.crmContact.update({
          where: { id: contact.id },
          data: { lifecycleStage: next },
        });
      }
    }
  }
}

// ── Activity / Follow-up ──
export type AddActivityInput = {
  contactId?: string | null;
  dealId?: string | null;
  type: CrmActivityType;
  title: string;
  dueAt?: Date | null;
};

export async function addActivity(ctx: Ctx, input: AddActivityInput): Promise<{ id: string }> {
  const a = await tenantDb(ctx).crmActivity.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      contactId: input.contactId || null,
      dealId: input.dealId || null,
      type: input.type,
      title: input.title.trim(),
      dueAt: input.dueAt ?? null,
      // doneAt = null → งานค้าง
    },
  });
  return { id: a.id };
}

export async function completeActivity(ctx: Ctx, activityId: string): Promise<void> {
  await tenantDb(ctx).crmActivity.updateMany({
    where: { id: activityId, doneAt: null },
    data: { doneAt: new Date() },
  });
}

// ── forecast (ถ่วงน้ำหนัก) — ดึงดีลทั้งหมด map แล้วส่งให้กติกาคำนวณ (ห้ามคำนวณเอง) ──
export async function forecast(ctx: Ctx): Promise<number> {
  const deals = await tenantDb(ctx).crmDeal.findMany({ include: { stage: true } });
  return weightedForecast(
    deals.map((d) => ({
      valueSatang: d.valueSatang,
      kind: d.kind,
      probability: d.stage.probability,
    })),
  );
}

// ── reads (สำหรับ UI) ──
export async function getBoard(ctx: Ctx) {
  await ensureCrm(ctx); // idempotent — การันตีมี default pipeline
  const db = tenantDb(ctx);
  const pipeline = await db.crmPipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });
  if (!pipeline) throw new Error("ไม่พบไปป์ไลน์ CRM");
  const deals = await db.crmDeal.findMany({
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });
  return { pipeline, deals };
}

export async function listContacts(ctx: Ctx, take = 100) {
  return tenantDb(ctx).crmContact.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function listDeals(ctx: Ctx, take = 100) {
  return tenantDb(ctx).crmDeal.findMany({
    include: { contact: true, stage: true },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// งานค้าง (follow-up ที่ยังไม่ปิด) เรียงตามกำหนดนัด
export async function listPendingActivities(ctx: Ctx, take = 50) {
  return tenantDb(ctx).crmActivity.findMany({
    where: { doneAt: null },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    include: { contact: true, deal: true },
    take,
  });
}

// งานติดตามของดีล/ผู้ติดต่อ (ทั้งหมด) — แยก ค้าง(pending)/เสร็จ(done)
// ค้างเรียงตามกำหนดนัด(dueAt) · เสร็จเรียงล่าสุดก่อน · ไม่ระบุ filter = ทั้งระบบ
export async function listActivities(
  ctx: Ctx,
  filter: { dealId?: string; contactId?: string } = {},
  take = 200,
) {
  const where: Prisma.CrmActivityWhereInput = {};
  if (filter.dealId) where.dealId = filter.dealId;
  if (filter.contactId) where.contactId = filter.contactId;
  const rows = await tenantDb(ctx).crmActivity.findMany({
    where,
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    include: { contact: true, deal: true },
    take,
  });
  return {
    pending: rows.filter((r) => r.doneAt === null),
    done: rows
      .filter((r) => r.doneAt !== null)
      .sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)),
  };
}

// ── สะพาน CRM → บัญชี (WO-0010): Deal ออกใบเสนอราคาผ่าน account facade ──
// CRM ไม่รู้เรื่องเลขบัญชี/VAT — ส่งลูกค้า+มูลค่าให้บัญชีจัดการ · idempotent ฝั่ง facade
import { createExternalQuotation } from "@/lib/modules/account";

export async function issueQuotation(
  ctx: Ctx,
  dealId: string,
): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  const db = tenantDb(ctx);
  const deal = await db.crmDeal.findFirst({ where: { id: dealId }, include: { contact: true } });
  if (!deal) return { ok: false, reason: "ไม่พบดีล" };
  if (deal.valueSatang <= 0) return { ok: false, reason: "ดีลยังไม่มีมูลค่า — ใส่มูลค่าก่อนออกใบเสนอราคา" };

  const res = await createExternalQuotation({
    tenantId: ctx.tenantId,
    sourceSystemId: ctx.systemId,
    sourceKind: "CRM",
    refType: "CrmDeal",
    refId: deal.id,
    title: deal.title,
    valueSatang: deal.valueSatang,
    customer: { name: deal.contact.name, phone: deal.contact.phone, email: deal.contact.email },
    // WO 3.1 (MAP §F.5): ส่ง partyId ของ CrmContact ต้นทาง → account ใช้เป็นกุญแจจับคู่ตัวแรก
    partyId: deal.contact.partyId,
    sourceContactId: deal.contact.id,
  });
  if (!res.ok) return res;

  if (deal.quotationDocId !== res.docId) {
    await db.crmDeal.update({ where: { id: deal.id }, data: { quotationDocId: res.docId } });
  }
  return res;
}

/**
 * WO 3.2 — หน้าผู้ติดต่อบัญชี: ป้าย "CRM" (badge) มาจากแถว CrmContact ที่ partyId เดียวกับ AccountContact
 * (Party = ตัวตนกลางระดับ tenant จาก WO 3.1) · 1 query ไม่ N+1 · เส้น import account→crm ได้รับอนุมัติ
 * ล่วงหน้าตามใบสั่งงาน WO 3.2 (อ่านอย่างเดียว)
 */
export async function listPartyIdsWithContact(ctx: Ctx, partyIds: string[]): Promise<Set<string>> {
  if (partyIds.length === 0) return new Set();
  const rows = await tenantDb(ctx).crmContact.findMany({
    where: { partyId: { in: partyIds } },
    select: { partyId: true },
  });
  return new Set(rows.map((r) => r.partyId).filter((x): x is string => !!x));
}

/**
 * WO 3.4 — การ์ด "CRM" ในแท็บ **การเชื่อมต่อ** ของโปรไฟล์ผู้ติดต่อ 360° (SPEC §7.1 · ภาพ g6)
 * อ่านอย่างเดียว · 1 query · ผู้ติดต่อ CRM ที่ผูก Party เดียวกับผู้ติดต่อบัญชี (ไม่มี = null)
 */
export async function findContactByPartyId(
  ctx: Ctx,
  partyId: string,
): Promise<{ id: string; name: string; company: string | null } | null> {
  return tenantDb(ctx).crmContact.findFirst({
    where: { partyId },
    select: { id: true, name: true, company: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * WO 3.4 — ดีลล่าสุดของผู้ติดต่อ CRM รายนั้น (g6: ดีล “ทริปโลซิน ต.ค.” · ขั้น เสนอราคา)
 * อ่านอย่างเดียว · 1 query (ดึงชื่อ stage มาด้วยผ่าน select ของ relation to-one)
 */
export async function findLatestDealForContact(
  ctx: Ctx,
  contactId: string,
): Promise<{ id: string; title: string; stageName: string; valueSatang: number } | null> {
  const d = await tenantDb(ctx).crmDeal.findFirst({
    where: { contactId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, valueSatang: true, stage: { select: { name: true } } },
  });
  if (!d) return null;
  return { id: d.id, title: d.title, stageName: d.stage?.name ?? "—", valueSatang: d.valueSatang };
}

/**
 * WO 3.3 — บล็อก "เชื่อมกับ › CRM" ของ modal ผู้ติดต่อ (SPEC §7.2 · ภาพ g5)
 * หาผู้ติดต่อ CRM ที่ "น่าจะเป็นคนเดียวกัน" จากเบอร์ (ทุกรูปแบบที่ผู้เรียกส่งมา) / อีเมล / partyId
 * อ่านอย่างเดียว · 1 query · ≤5 แถว · ข้ามรายที่ปิดใช้งานแล้ว
 */
export async function findContactsForLink(
  ctx: Ctx,
  keys: { phoneVariants?: string[]; email?: string | null; partyId?: string | null },
): Promise<{ id: string; name: string; phone: string | null; email: string | null; company: string | null; partyId: string | null }[]> {
  const or: Prisma.CrmContactWhereInput[] = [];
  const phones = [...new Set((keys.phoneVariants ?? []).map((p) => p.trim()).filter(Boolean))];
  if (phones.length > 0) or.push({ phone: { in: phones } });
  if (keys.email?.trim()) or.push({ email: { equals: keys.email.trim(), mode: "insensitive" } });
  if (keys.partyId) or.push({ partyId: keys.partyId });
  if (or.length === 0) return [];
  return tenantDb(ctx).crmContact.findMany({
    where: { archivedAt: null, OR: or },
    select: { id: true, name: true, phone: true, email: true, company: true, partyId: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
}

/**
 * WO 3.3 — ปุ่ม "ใช่ คนเดียวกัน": ผูกผู้ติดต่อ CRM รายนี้เข้ากับ Party เดียวกับผู้ติดต่อบัญชี
 * 🔴 เขียนผ่านฟังก์ชันนี้เท่านั้น · ผูก tenant+systemId เสมอ · id ของร้านอื่น = 0 แถว = false (กัน IDOR)
 */
export async function setContactPartyId(ctx: Ctx, contactId: string, partyId: string): Promise<boolean> {
  const res = await tenantDb(ctx).crmContact.updateMany({ where: { id: contactId }, data: { partyId } });
  return res.count > 0;
}

