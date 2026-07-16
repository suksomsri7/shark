import { tenantDb } from "@/lib/core/db";
import type { CrmActivityType } from "@prisma/client";
import {
  DEFAULT_PIPELINE,
  dealStateForStage,
  lifecycleAfterDealWon,
  weightedForecast,
} from "./rules";

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
  const c = await tenantDb(ctx).crmContact.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      source: input.source?.trim() || null,
      ownerUserId: input.ownerUserId || null,
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
