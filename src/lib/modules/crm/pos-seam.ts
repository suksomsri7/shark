// POS P3.6 ▸ pos-seam.ts — ทางเดียวที่หน้าขาย (POS) ใช้อ่าน/ผูกข้อมูลของ CRM (R1 R10 R11 R14 · มติ 5 · CD-P36a) ◂
//
// 🔴 ไฟล์ของโมดูล CRM ที่เลน POS เขียน (owner line OP §"แจ้งเจ้าของโมดูล CRM") — export ต่อผ่านบล็อกท้าย `crm/index.ts` เท่านั้น
// 🔴 ไม่มี raw SQL · ไม่เขียนตารางเองในไฟล์นี้ (ข้อสอบ ST3) — การเขียนเงินของดีลผ่านบล็อก POS P3.6 ใน `payments.ts` (ล็อก/ปักธงเดิมของ CRM)
// 🔴 ความเป็นส่วนตัว (R14 · CRM X8): แถวบริษัทให้หน้าขาย = {partyId, companyId, systemId, name, taxId, branchCode} เท่านั้น —
//    ไม่มีเบอร์/อีเมล/ผู้ติดต่อ/ยอดเงินของบริษัท · แคชเชียร์ที่ไม่มีคีย์ CRM ใช้ได้ (ประตูสิทธิ์อยู่ที่ pos/crm-link.ts = pos.sale.create)
// 🔴 ขอบเขตร้าน (X1): ทุกคำค้นผูก tenantId · บริษัทที่เก็บแล้ว/ถูกรวมไม่ออก · ระบบ CRM ทุกใบของร้าน
import { prisma } from "./db";
import { linkPosSaleIntent, netPosSaleRefund, type MoneyCtx, type PosIntentLinkResult, type PosRefundNetResult } from "./payments";

/** แถวบริษัทที่หน้าขายเห็น (แผ่นเลือกบริษัท · ชิปบริษัท) */
export type PosCompanyOption = { partyId: string; companyId: string; systemId: string; name: string; taxId: string | null; branchCode: string | null };

/** เพดานแถวต่อคำค้น (ปริยาย = เพดาน) */
export const POS_COMPANY_LIMIT = 20;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
const SELECT = { id: true, partyId: true, systemId: true, name: true, taxId: true, branchCode: true } as const;
const rowOf = (c: { id: string; partyId: string; systemId: string; name: string; taxId: string | null; branchCode: string | null }): PosCompanyOption => ({
  partyId: c.partyId,
  companyId: c.id,
  systemId: c.systemId,
  name: c.name,
  taxId: c.taxId,
  branchCode: c.branchCode,
});

async function crmSystemIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * ค้นบริษัทของร้าน (ชื่อ — ไม่สนตัวพิมพ์ · เลขผู้เสียภาษีขึ้นต้นด้วย) และ/หรือ partyIds — ไม่เก็บ/ไม่ถูกรวม · ทุกระบบ CRM ของร้าน · ≤ 20
 * ไม่ส่งทั้ง q และ partyIds = บริษัทที่แก้ล่าสุด (ไม่เกินเพดาน)
 */
export async function companiesForPos(input: { tenantId: string; q?: string | null; partyIds?: readonly string[] | null; limit?: number | null }): Promise<PosCompanyOption[]> {
  const tenantId = input?.tenantId;
  if (!isId(tenantId)) return [];
  const raw = typeof input.limit === "number" && Number.isInteger(input.limit) ? input.limit : POS_COMPANY_LIMIT;
  const take = Math.min(POS_COMPANY_LIMIT, Math.max(1, raw));
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 100) : "";
  const partyIds = Array.isArray(input.partyIds) ? [...new Set(input.partyIds.filter(isId))].slice(0, 200) : null;
  if (partyIds && partyIds.length === 0) return [];
  const systems = await crmSystemIds(tenantId);
  if (!systems.length) return [];
  const rows = await prisma.crmCompany.findMany({
    where: {
      tenantId,
      systemId: { in: systems },
      archivedAt: null,
      mergedIntoId: null,
      ...(partyIds ? { partyId: { in: partyIds } } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { taxId: { startsWith: q } }] } : {}),
    },
    orderBy: q || partyIds ? [{ name: "asc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }],
    take,
    select: SELECT,
  });
  return rows.map(rowOf);
}

/** บริษัทที่ Party (บุคคล · เช่นสมาชิกของบิล) ทำงานอยู่ตอนนี้: CrmContact ของ party → CrmCompanyContact ที่ยังไม่สิ้นสุด (endedAt ว่าง) */
export async function companiesOfParty(input: { tenantId: string; partyId: string }): Promise<PosCompanyOption[]> {
  const tenantId = input?.tenantId;
  const partyId = input?.partyId;
  if (!isId(tenantId) || !isId(partyId)) return [];
  const systems = await crmSystemIds(tenantId);
  if (!systems.length) return [];
  const contacts = await prisma.crmContact.findMany({ where: { tenantId, systemId: { in: systems }, partyId }, select: { id: true }, take: 50 });
  if (!contacts.length) return [];
  const links = await prisma.crmCompanyContact.findMany({
    where: { tenantId, contactId: { in: contacts.map((c) => c.id) }, endedAt: null, company: { tenantId, archivedAt: null, mergedIntoId: null } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    take: POS_COMPANY_LIMIT * 2,
    select: { company: { select: SELECT } },
  });
  const seen = new Set<string>();
  const out: PosCompanyOption[] = [];
  for (const l of links) {
    if (seen.has(l.company.id)) continue;
    seen.add(l.company.id);
    out.push(rowOf(l.company));
    if (out.length >= POS_COMPANY_LIMIT) break;
  }
  return out;
}

/** ผูก + นับบิลเข้าดีลตาม intent ของบิล (ไม่มี actor · ล็อก/ปักธงเดียวกับ linkSaleToDeal · ดีลต้องเป็นของระบบ ctx) — idempotent */
export async function linkPosSaleSystem(ctx: MoneyCtx, input: { dealId: string; saleId: string }): Promise<PosIntentLinkResult> {
  return linkPosSaleIntent(ctx, input);
}

/**
 * คืนเงินบิลหน้าร้าน → แถวติดลบ POS_REFUND (refId = ใบคืน) บนดีลที่นับบิลนั้นไว้ · Σ ≥ −ยอดที่นับ · ส่งซ้ำ = ไม่มีแถวเพิ่ม ·
 * satang ของผู้เรียกใช้เป็นแค่ข้อมูลประกอบ — ยอดจริงอ่านจากใบคืนในฐาน (X6)
 */
export async function onPosSaleRefunded(ctx: MoneyCtx, input: { saleId: string; refundSaleId: string; satang?: number }): Promise<PosRefundNetResult> {
  return netPosSaleRefund(ctx, { saleId: input?.saleId, refundSaleId: input?.refundSaleId });
}
