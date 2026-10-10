import { tenantDb } from "@/lib/core/db";
import { ciEquals } from "@/lib/core/ci-equals"; // CRM C5.5-fix2 ◂
import type { MemberActor } from "@/lib/modules/member";
import * as party from "@/lib/modules/party";
import { crmCan, CrmForbiddenError } from "./access";
import { visibleWhere, canSee } from "./visibility";
import type { CrmActivityType, Prisma } from "@prisma/client";
import { DEFAULT_PIPELINE, weightedForecast } from "./rules";
// CRM C1.5 ▸ ดีล v1 (สร้าง · ย้ายขั้น · ออกใบเสนอราคา) ย้ายไปบริการ v2 — ที่นี่เหลือตัวห่อที่ลายเซ็นเดิม ◂
import { createDealFromLegacy, issueQuotationFromLegacy, moveDealFromLegacy } from "./deals";
// CRM C1.4 ▸ การสร้างผู้ติดต่อย้ายไปบริการ v2 (Party ถูกผูกที่นั่น) ◂
import { createContactFromLegacy } from "./contacts";

// CRM (ระบบที่ 19) — service ชั้นประกอบ (systemId-scoped)
// ⚠️ กติกาทั้งหมดมาจาก rules.ts (สมอง FREEZE) — ที่นี่แค่เรียกใช้ + ผูก DB
//    ห้าม hardcode: ลำดับ pipeline · kind/closedAt ตอนย้าย stage · lifecycle · forecast
// scope: ใช้ tenantDb({ tenantId, systemId }) — inject tenantId+systemId ทุก query อัตโนมัติ
//    (defense-in-depth · Crm* ทุกตัวเป็น system-scoped ใน scope.ts)
//    nested write (stages) ไม่ผ่าน guard ชั้นนี้ → ใส่ tenantId/systemId ตรงเอง

// CRM C5.4-B ▸ hunter H5: ประตู "action/ข้อเสนอแบบ v1 ใช้ไม่ได้บนระบบนี้" (อ่านไม่ได้ = ปิด) — re-export ให้ facade (ai/proposals · crm_create_lead)
export { isCrmV1Closed } from "./ui-version";

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
  // CRM C1.4 ▸ ตัวห่อบาง ๆ ของ v1 (ฟอร์ม · เครื่องมือ AI crm_create_lead) รอบบริการ v2 `contacts.ts`
  //   ลายเซ็นเดิมทุกตัวอักษร · ได้ Party PERSON + first/last + event crm.contact.created + audit จากบริการ v2 ◂ CRM C1.4
  return createContactFromLegacy(ctx, input);
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
  // CRM C1.5 ▸ ตัวห่อบาง ๆ ของ v1 รอบบริการ v2 `deals.ts` — ลายเซ็นเดิมทุกตัวอักษร
  //   ได้แถวประวัติขั้นแรก + event crm.deal.created (ใน tx) + แคชบริษัท + audit จากบริการ v2 ◂ CRM C1.5
  return createDealFromLegacy(ctx, input);
}

// ย้ายดีลเข้า stage ใหม่ → sync kind + closedAt ตามกติกา · WON → contact เป็น CUSTOMER
// CRM C1.5 ▸ ตัวห่อบาง ๆ รอบ `deals.ts` (moveDealFromLegacy): event `crm.deal.won` ยังยิงใน transaction เดียวกับการเปลี่ยนขั้น
//   (🔴 AUDIT M12 — ย้ายไปอยู่ใน deals.ts#moveCore พร้อมล็อกแถวต่อดีล ⇒ ยิงครั้งเดียวต่อการเข้า WON แม้กดพร้อมกันข้ามโพรเซส) ◂ CRM C1.5
export async function moveDeal(ctx: Ctx, dealId: string, stageId: string): Promise<void> {
  await moveDealFromLegacy(ctx, dealId, stageId);
}

// ── Activity / Follow-up ──
export type AddActivityInput = {
  contactId?: string | null;
  dealId?: string | null;
  type: CrmActivityType;
  title: string;
  dueAt?: Date | null;
};

/**
 * C5.5-authz-sweep ▸ (v1) `contactId`/`dealId` มาจากฟอร์มของ client ⇒ ต้องเป็นของร้าน + ระบบ CRM นี้ก่อนเขียน
 *   (เดิมเขียน FK ดิบ ⇒ ร้าน A ผูกงานกับผู้ติดต่อ/ดีลของร้าน B ได้ถ้ารู้ id แล้วหน้ารายการงานของ A `include: { contact, deal }` ดึงแถวของ B มาโชว์)
 *   ประตู v2 ทำแบบเดียวกัน (`activities.logActivity` → เป้าหมายต้องมองเห็นได้ในระบบนี้) · ไม่ผ่าน = false (ผู้เรียกไม่เขียนอะไร) ◂
 */
export async function activityTargetsInSystem(ctx: Ctx, input: Pick<AddActivityInput, "contactId" | "dealId">): Promise<boolean> {
  const db = tenantDb(ctx);
  if (input.contactId && !(await db.crmContact.findFirst({ where: { id: input.contactId }, select: { id: true } }))) return false;
  if (input.dealId && !(await db.crmDeal.findFirst({ where: { id: input.dealId }, select: { id: true } }))) return false;
  return true;
}

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
// CRM C1.5 ▸ ตัวห่อบาง ๆ รอบ `deals.ts` (issueQuotationFromLegacy) — ลายเซ็น/รูปผลลัพธ์เดิม · ดีลที่มีรายการสินค้าได้ใบหลายบรรทัด ◂ CRM C1.5
export async function issueQuotation(
  ctx: Ctx,
  dealId: string,
): Promise<{ ok: true; docId: string; created: boolean } | { ok: false; reason: string }> {
  return issueQuotationFromLegacy(ctx, dealId);
}

/**
 * WO 3.2 — หน้าผู้ติดต่อบัญชี: ป้าย "CRM" (badge) มาจากแถว CrmContact ที่ partyId เดียวกับ AccountContact
 * (Party = ตัวตนกลางระดับ tenant จาก WO 3.1) · 1 query ไม่ N+1 · เส้น import account→crm ได้รับอนุมัติ
 * ล่วงหน้าตามใบสั่งงาน WO 3.2 (อ่านอย่างเดียว)
 */
export async function listPartyIdsWithContact(ctx: Ctx, partyIds: string[], viewer?: CrmViewerArg): Promise<Set<string>> {
  if (partyIds.length === 0) return new Set();
  // C5.4 (L1-M3 · รอบ 2): ป้าย "CRM" ในรายการผู้ติดต่อบัญชี — ตามสิทธิ์อ่าน + การมองเห็นของผู้ดู (ไม่ส่ง = ไม่เห็น)
  const scope = await contactScope(ctx, viewer);
  if (scope === null) return new Set();
  const rows = await tenantDb(ctx).crmContact.findMany({
    where: { AND: [scope, { partyId: { in: partyIds } }] },
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
  viewer?: CrmViewerArg,
): Promise<{ id: string; name: string; company: string | null } | null> {
  // C5.4 (L1-M3): การ์ด CRM ในโปรไฟล์บัญชี — ต้องถือ crm.contact.read และเห็นแถว (ดู `CrmLinkViewer`)
  const scope = await contactScope(ctx, viewer);
  if (scope === null) return null;
  return tenantDb(ctx).crmContact.findFirst({
    where: { AND: [scope, { partyId }] },
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
  viewer?: CrmViewerArg,
): Promise<{ id: string; title: string; stageName: string; valueSatang: number } | null> {
  // C5.4 (L1-M3): ชื่อดีล/ขั้น = ข้อมูลการขาย — ต้องถือ crm.deal.read และเห็นดีลนั้น (ดู `CrmLinkViewer`)
  if (viewer === undefined || viewer === null) return null;
  if (viewer !== CRM_SYSTEM_VIEWER && !crmCan(viewer, "crm.deal.read")) return null;
  const scope: Prisma.CrmDealWhereInput = viewer === CRM_SYSTEM_VIEWER ? {} : await visibleWhere(ctx, viewer, "DEAL");
  const d = await tenantDb(ctx).crmDeal.findFirst({
    where: { AND: [scope, { contactId }] },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, valueSatang: true, stage: { select: { name: true } } },
  });
  if (!d) return null;
  return { id: d.id, title: d.title, stageName: d.stage?.name ?? "—", valueSatang: d.valueSatang };
}

/**
 * C5.4 (L1-M3) — "ใครถาม" ของ facade ที่โมดูลอื่น (บัญชี) ใช้อ่าน/ผูกผู้ติดต่อ CRM · **fail-closed**
 *   - `MemberActor` = คน/คีย์ที่กดจากหน้าจอหรือ REST ของโมดูลนั้น ⇒ ต้องผ่านคีย์ CRM (`crmCan`) + การมองเห็น (v2) เหมือนหน้า CRM เอง
 *   - `null` หรือ **ไม่ส่ง** = ไม่มีสิทธิ์ CRM ⇒ ไม่เห็นอะไร / ผูกไม่ได้ (ลืมส่ง = ปิด ไม่ใช่เปิด)
 *   - `CRM_SYSTEM_VIEWER` ("system") = งานระบบที่ไม่มีผู้ใช้ (สคริปต์/สะพาน) ต้องประกาศชัด ๆ จึงเห็นทุกแถว
 * 🔴 ก่อน C5.4 ทางบัญชีส่งแค่ ctx ⇒ พนักงานบัญชีที่ไม่มีคีย์ CRM เลยค้นเบอร์แล้วได้ชื่อ/บริษัท/เบอร์ของผู้ติดต่อ CRM ทุกทีม
 *    และผูก Party ของผู้ติดต่อ CRM ใหม่ได้ (Party ผิดคน ⇒ สะพานปิดดีลเขียนไทม์ไลน์สมาชิกของอีกคน)
 */
export type CrmLinkViewer = MemberActor;
export const CRM_SYSTEM_VIEWER = "system" as const;
type CrmViewerArg = CrmLinkViewer | typeof CRM_SYSTEM_VIEWER | null;

/** ขอบเขตผู้ติดต่อที่ viewer อ่านได้ — null = อ่านไม่ได้เลย (ไม่ส่ง/null/ไม่มีคีย์) · system = ทั้งระบบ */
async function contactScope(ctx: Ctx, viewer: CrmViewerArg | undefined): Promise<Prisma.CrmContactWhereInput | null> {
  if (viewer === undefined || viewer === null) return null;
  if (viewer === CRM_SYSTEM_VIEWER) return {};
  if (!crmCan(viewer, "crm.contact.read")) return null;
  return visibleWhere(ctx, viewer, "CONTACT");
}

/**
 * WO 3.3 — บล็อก "เชื่อมกับ › CRM" ของ modal ผู้ติดต่อ (SPEC §7.2 · ภาพ g5)
 * หาผู้ติดต่อ CRM ที่ "น่าจะเป็นคนเดียวกัน" จากเบอร์ (ทุกรูปแบบที่ผู้เรียกส่งมา) / อีเมล / partyId
 * อ่านอย่างเดียว · 1 query · ≤5 แถว · ข้ามรายที่ปิดใช้งานแล้ว
 * C5.4 (L1-M3): `viewer` ต้องถือ `crm.contact.read` และเห็นแถวนั้น (OWN/TEAM ของ v2) — ไม่งั้นได้ 0 แถว (ดู `CrmLinkViewer`)
 */
export async function findContactsForLink(
  ctx: Ctx,
  keys: { phoneVariants?: string[]; email?: string | null; partyId?: string | null },
  viewer?: CrmViewerArg,
): Promise<{ id: string; name: string; phone: string | null; email: string | null; company: string | null; partyId: string | null }[]> {
  const scope = await contactScope(ctx, viewer);
  if (scope === null) return [];
  const or: Prisma.CrmContactWhereInput[] = [];
  const phones = [...new Set((keys.phoneVariants ?? []).map((p) => p.trim()).filter(Boolean))];
  if (phones.length > 0) or.push({ phone: { in: phones } });
  if (keys.email?.trim()) or.push({ email: ciEquals(keys.email.trim()) }); // CRM C5.5-fix2 ▸ ไม่มี wildcard ◂
  if (keys.partyId) or.push({ partyId: keys.partyId });
  if (or.length === 0) return [];
  return tenantDb(ctx).crmContact.findMany({
    where: { AND: [scope, { archivedAt: null, OR: or }] },
    select: { id: true, name: true, phone: true, email: true, company: true, partyId: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
}

/** C5.4 (L1-M3): ผู้ติดต่อ CRM ผูกกับ Party อื่นอยู่แล้ว — ไม่เขียนทับ (ข้อความไทยพร้อมทางแก้ · ผู้เรียกแสดงได้ตรง ๆ) */
export class CrmPartyConflictError extends Error {
  readonly code = "CONFLICT" as const;
  constructor() {
    super("ผู้ติดต่อ CRM รายนี้ผูกกับบุคคลอื่นอยู่แล้ว ระบบจึงไม่ผูกทับให้ — ถ้าเป็นคนเดียวกันจริง ให้รวมรายชื่อซ้ำก่อน แล้วค่อยเชื่อมอีกครั้ง");
    this.name = "CrmPartyConflictError";
  }
}

/**
 * WO 3.3 — ปุ่ม "ใช่ คนเดียวกัน": ผูกผู้ติดต่อ CRM รายนี้เข้ากับ Party เดียวกับผู้ติดต่อบัญชี
 * 🔴 เขียนผ่านฟังก์ชันนี้เท่านั้น · ผูก tenant+systemId เสมอ · id ของร้านอื่น = 0 แถว = false (กัน IDOR)
 * C5.4 (L1-M3) — สัญญาคืนค่าเดิม (true = ผูกแล้ว · false = ไม่พบ/มองไม่เห็น) + โยนเมื่อถูกปฏิเสธ:
 *   - `viewer` ต้องถือ `crm.contact.update` (ไม่ผ่าน/`null` = โยน `CrmForbiddenError`) และเห็นผู้ติดต่อรายนั้น (มองไม่เห็น = false
 *     เหมือนไม่มีอยู่)
 *   - **ไม่เขียนทับ Party อื่นที่ผูกอยู่แล้ว** (หลังตามสายการรวม) = โยน `CrmPartyConflictError` — เขียนทับเงียบ ๆ =
 *     ประวัติ/สมาชิก/แชทของอีกคนตามมาผิดคน (สะพานปิดดีลเขียนไทม์ไลน์ของลูกค้าผิดคน) · เขียนแบบมีเงื่อนไข (partyId ยังเป็นค่าที่อ่านมา)
 */
export async function setContactPartyId(ctx: Ctx, contactId: string, partyId: string, viewer?: CrmViewerArg): Promise<boolean> {
  if (viewer === undefined || viewer === null) throw new CrmForbiddenError("crm.contact.update");
  const db = tenantDb(ctx);
  const row = await db.crmContact.findFirst({ where: { id: contactId }, select: { id: true, partyId: true } });
  if (!row) return false;
  if (viewer !== CRM_SYSTEM_VIEWER) {
    if (!(await canSee(ctx, viewer, "CONTACT", contactId))) return false;
    if (!crmCan(viewer, "crm.contact.update")) throw new CrmForbiddenError("crm.contact.update");
  }
  if (row.partyId && row.partyId !== partyId) {
    const [have, want] = await Promise.all([party.resolveCanonical(ctx.tenantId, row.partyId), party.resolveCanonical(ctx.tenantId, partyId)]);
    if (have !== want) throw new CrmPartyConflictError();
  }
  const res = await db.crmContact.updateMany({ where: { id: contactId, partyId: row.partyId }, data: { partyId } });
  if (res.count === 0) throw new CrmPartyConflictError(); // มีคนเปลี่ยน Party ของแถวนี้ระหว่างทาง
  return true;
}

