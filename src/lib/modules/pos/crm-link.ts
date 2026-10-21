// POS P3.6 ▸ crm-link.ts — ไฟล์เดียวของโมดูล POS ที่คุยกับ CRM ของงานใบ P3.6 (R1 R2 R10 R11 R14 · มติ 5 · CD-P36a) ◂
//
// 🔴 ทางไป CRM = facade `@/lib/modules/crm` (namespace `posSeam` + `payments.openDealsForParty` + `crmCan`) เท่านั้น — ไม่ import ไฟล์ย่อยของ CRM
// 🔴 แผ่นเลือกบริษัท: ประตู = pos.sale.create ที่สาขา (แคชเชียร์ที่ไม่มีคีย์ CRM ใช้ได้ · ⚠️6) · แถว = ชื่อ/เลขภาษี/สาขาของบริษัท (ไม่มีข้อมูลติดต่อ · R14)
// 🔴 ตัวเลือกดีล: ไม่มีคีย์ crm.deal.update = รายการว่าง (กติกา posOpenDeals ของ C2.7) · คีย์แถว {id systemId title valueSatang stageName} ·
//    มูลค่าดีลออกเฉพาะตัวเลือกดีลของผู้ขาย — ห้ามออกใบเสร็จ/หน้าบิล (PV1)
// 🔴 ตัวกวาด/ตัวรับคืนเงินไม่มี actor คน — ตัดสินขอบเขตร้านจาก tenantId ของบิล/event เท่านั้น (X1) · ผลเป็น id + สตางค์ (X8)
import type { OutboxHandler } from "@/lib/core/outbox";
import { evaluate, canAccessUnit } from "@/lib/core/rbac";
import * as crm from "@/lib/modules/crm";
import { prisma } from "./db";
import type { RegisterActor, RegisterCtx } from "./register-shared";

/** แถวบริษัทที่หน้าขายเห็น (= แถวของ seam) */
export type CompanyOption = { partyId: string; companyId: string; systemId: string; name: string; taxId: string | null; branchCode: string | null };
/** ตัวเลือกดีลบนหน้าขายใหม่ (รูปเดียวกับ PosDealOption ของหน้าขายเดิม) */
export type CrmDealOption = { id: string; systemId: string; title: string; valueSatang: number; stageName: string };
export type CrmLinkRefusal = { ok: false; code: "PERMISSION_DENIED" | "NOT_FOUND" | "VALIDATION" | "INTERNAL"; message: string };
export type CompanySearchResult = { ok: true; items: CompanyOption[] } | CrmLinkRefusal;
export type DealOptionsResult = { ok: true; items: CrmDealOption[] } | CrmLinkRefusal;

/** หน้าต่างย้อนหลังของตัวกวาด intent ดีล (มติ 5) */
export const DEAL_INTENT_WINDOW_DAYS = 7;
const SWEEP_BATCH = 500;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const MSG = {
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้",
  NOT_FOUND: "ไม่พบจุดขายนี้ในร้านที่เปิดอยู่",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
  INTERNAL: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
} as const;
const refuse = (code: CrmLinkRefusal["code"], message?: string): CrmLinkRefusal => ({ ok: false, code, message: message ?? MSG[code] });

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}
async function guard<T>(name: string, body: () => Promise<T>): Promise<T | CrmLinkRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/crm-link] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}
/** ขอบเขตหน้าขาย: ระบบ POS ของร้าน + สาขาผูกระบบนี้ + ผู้ขายเข้าสาขาได้และถือ pos.sale.create */
async function scopeOf(ctx: unknown, actorRaw: unknown): Promise<{ tenantId: string; systemId: string; unitId: string; actor: RegisterActor } | CrmLinkRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const actor = actorOf(actorRaw);
  if (!actor || !canAccessUnit(actor, ctx.unitId) || !evaluate(actor, { module: "pos", action: "pos.sale.create", unitId: ctx.unitId })) return refuse("PERMISSION_DENIED");
  const [sys, link] = await Promise.all([
    prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true } }),
    prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId: ctx.unitId, type: "POS" } }, select: { systemId: true } }),
  ]);
  if (!sys || link?.systemId !== ctx.systemId) return refuse("NOT_FOUND");
  return { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId, actor };
}
const isRefusal = (v: unknown): v is CrmLinkRefusal => isRecord(v) && v.ok === false;
async function memberPartyOf(tenantId: string, memberId: unknown): Promise<string | null> {
  if (!isId(memberId)) return null;
  const c = await prisma.customer.findFirst({ where: { id: memberId, tenantId }, select: { partyId: true } });
  return c?.partyId ?? null;
}
async function crmSystemIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return rows.map((r) => r.id);
}
const only = (r: CompanyOption): CompanyOption => ({ partyId: r.partyId, companyId: r.companyId, systemId: r.systemId, name: r.name, taxId: r.taxId, branchCode: r.branchCode });

// ═══════════ แผ่นเลือกบริษัท (R1 · CP1–CP4) ═══════════
/** ค้นบริษัทของร้านด้วยชื่อ/เลขผู้เสียภาษี (≤ 20 แถว) */
export async function registerCompanySearch(ctx: RegisterCtx, actor: RegisterActor, input: { q: string }): Promise<CompanySearchResult> {
  return guard("registerCompanySearch", async (): Promise<CompanySearchResult> => {
    const s = await scopeOf(ctx, actor);
    if (isRefusal(s)) return s;
    const q = isRecord(input) && typeof input.q === "string" ? input.q.trim() : "";
    if (q.length > 100) return refuse("VALIDATION", "คำค้นยาวเกินไป");
    const items = await crm.posSeam.companiesForPos({ tenantId: s.tenantId, q });
    return { ok: true, items: items.map(only) };
  });
}

/** บริษัทของสมาชิกในบิล (ผู้ติดต่อ CRM ของ Party สมาชิก → บริษัทที่ยังทำงานอยู่) */
export async function registerMemberCompanies(ctx: RegisterCtx, actor: RegisterActor, input: { memberId: string }): Promise<CompanySearchResult> {
  return guard("registerMemberCompanies", async (): Promise<CompanySearchResult> => {
    const s = await scopeOf(ctx, actor);
    if (isRefusal(s)) return s;
    const partyId = await memberPartyOf(s.tenantId, isRecord(input) ? input.memberId : null);
    if (!partyId) return { ok: true, items: [] };
    const items = await crm.posSeam.companiesOfParty({ tenantId: s.tenantId, partyId });
    return { ok: true, items: items.map(only) };
  });
}

// ═══════════ ตัวเลือกดีล (R10 · DL3 DL4) ═══════════
/**
 * ดีลที่ยังเปิดของบริษัทในบิล และ/หรือสมาชิกในบิล ที่ผู้ขายมองเห็น — ไม่มีคีย์ crm.deal.update = [] (ไม่ใช่ error) · ≤ POS_LINK_LIMIT
 * submitRegisterSale ใช้ตัวนี้ตรวจซ้ำตอนส่ง (crmDealId ไม่อยู่ในรายการ = DEAL_INVALID ไม่มีบิล)
 */
export async function registerDealOptions(ctx: RegisterCtx, actor: RegisterActor, input: { memberId?: string | null; customerPartyId?: string | null }): Promise<DealOptionsResult> {
  return guard("registerDealOptions", async (): Promise<DealOptionsResult> => {
    const s = await scopeOf(ctx, actor);
    if (isRefusal(s)) return s;
    if (!crm.crmCan(s.actor, "crm.deal.update")) return { ok: true, items: [] };
    const parties: string[] = [];
    if (isRecord(input) && isId(input.customerPartyId)) parties.push(input.customerPartyId);
    const mp = await memberPartyOf(s.tenantId, isRecord(input) ? input.memberId : null);
    if (mp && !parties.includes(mp)) parties.push(mp);
    if (!parties.length) return { ok: true, items: [] };
    const out: CrmDealOption[] = [];
    const seen = new Set<string>();
    for (const systemId of await crmSystemIds(s.tenantId)) {
      for (const partyId of parties) {
        const rows = await crm.payments.openDealsForParty({ tenantId: s.tenantId, systemId }, s.actor, partyId).catch(() => []);
        for (const d of rows) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          out.push({ id: d.id, systemId, title: d.title, valueSatang: d.valueSatang, stageName: d.stageName });
        }
      }
      if (out.length >= crm.POS_LINK_LIMIT) break;
    }
    return { ok: true, items: out.slice(0, crm.POS_LINK_LIMIT) };
  });
}

// ═══════════ ตัวกวาด intent ดีล (R10 · DL6 · งานรายชั่วโมง) ═══════════
/**
 * บิล PAID/REFUNDED ที่มี crmDealId ภายใน 7 วัน → ผูก + นับเข้าดีลผ่าน seam (สะพาน pos.sale.paid เป็นของแถม WARN — ตัวนี้เก็บที่พลาด) ·
 * idempotent (ปักธงก่อน · แถวมีแล้ว = ไม่ทำอะไร) · deadline = หยุดเมื่อเลยเวลา · ล้มรายบิล = ข้าม (รอบหน้าเก็บต่อ)
 */
export async function sweepDealIntents(opts: { tenantId?: string; now?: Date; deadline?: Date | number } = {}): Promise<{ ok: true; scanned: number; linked: number; failed: number }> {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const deadlineMs = opts.deadline instanceof Date ? opts.deadline.getTime() : typeof opts.deadline === "number" ? opts.deadline : Number.POSITIVE_INFINITY;
  const since = new Date(now.getTime() - DEAL_INTENT_WINDOW_DAYS * 86_400_000);
  // fix2 H6: รอบละ SWEEP_BATCH บิลที่ "ยังไม่ถูกผูก/นับ" — ไล่หน้าละ SWEEP_BATCH ตามลำดับเวลา แล้วตัดบิลที่ดีลมีแถว POS_SALE (ไม่ใช่ LINKED) ออก
  //   (เดิมเอา 500 ใบแรกเสมอ ⇒ บิลที่ผูกแล้วกินโควตา · บิลดีล > 500/สัปดาห์ = ใบหลัง ๆ ไม่ถูกเก็บ)
  const bills: { id: string; tenantId: string; crmDealId: string | null }[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 40 && bills.length < SWEEP_BATCH && Date.now() <= deadlineMs; page++) {
    const rows: { id: string; tenantId: string; crmDealId: string | null }[] = await prisma.posSale.findMany({
      where: { ...(isId(opts.tenantId) ? { tenantId: opts.tenantId } : {}), docType: "SALE", status: { in: ["PAID", "REFUNDED"] }, crmDealId: { not: null }, paidAt: { gte: since, lte: now } },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }],
      take: SWEEP_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, tenantId: true, crmDealId: true },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1]!.id;
    const byTenant = new Map<string, string[]>();
    for (const r of rows) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r.id]);
    const done = new Set<string>();
    for (const [tenantId, saleIds] of byTenant) for (const x of await crm.posSeam.posSaleDealRows({ tenantId, saleIds })) if (x.status !== "LINKED") done.add(x.saleId);
    for (const r of rows) if (!done.has(r.id) && bills.length < SWEEP_BATCH) bills.push(r);
    if (rows.length < SWEEP_BATCH) break;
  }
  const systemsOf = new Map<string, string[]>();
  let linked = 0;
  let failed = 0;
  for (const b of bills) {
    if (Date.now() > deadlineMs) break;
    if (!b.crmDealId) continue;
    let systems = systemsOf.get(b.tenantId);
    if (!systems) {
      systems = await crmSystemIds(b.tenantId);
      systemsOf.set(b.tenantId, systems);
    }
    for (const systemId of systems) {
      try {
        const r = await crm.posSeam.linkPosSaleSystem({ tenantId: b.tenantId, systemId }, { dealId: b.crmDealId, saleId: b.id });
        if (r.linked) {
          linked++;
          break;
        }
      } catch (e) {
        failed++;
        console.error("[pos/crm-link] sweepDealIntents", b.id, (e as Error)?.message ?? e);
      }
    }
  }
  return { ok: true, scanned: bills.length, linked, failed };
}

// ═══════════ คืนเงิน → ดีล (R11 · DL5 · งานหลักของ pos.sale.refunded) ═══════════
/** ตัวรับ `pos.sale.refunded {saleId, refundSaleId}` — วนทุกระบบ CRM ของร้าน (ไม่มีประตูสะพาน · เหมือนการถอนคืน) · ล้ม = โยน (คิวลองใหม่ · idempotent) */
export const dealOnSaleRefunded: OutboxHandler = async (evt) => {
  const p = isRecord(evt.payload) ? evt.payload : {};
  const saleId = isId(p.saleId) ? p.saleId : null;
  const refundSaleId = isId(p.refundSaleId) ? p.refundSaleId : null;
  if (!saleId || !refundSaleId) return;
  const systems = await crmSystemIds(evt.tenantId);
  let err: unknown = null;
  for (const systemId of systems) {
    try {
      await crm.posSeam.onPosSaleRefunded({ tenantId: evt.tenantId, systemId }, { saleId, refundSaleId, satang: typeof p.amountSatang === "number" ? p.amountSatang : undefined });
    } catch (e) {
      err ??= e;
    }
  }
  if (err) throw err;
};

/** POS P3.6 fix2 H5 ▸ R12 "หรือแถว POS_SALE ที่ดีลนับแล้ว": บิลนี้ถูกนับเข้าดีล CRM แล้วไหม (ทางเก่า register-ui ผูกหลัง commit) — อ่านอย่างเดียว ◂ */
export async function saleCountedByDeal(tenantId: string, saleId: string): Promise<boolean> {
  if (!isId(tenantId) || !isId(saleId)) return false;
  return (await crm.posSeam.posSaleDealRows({ tenantId, saleIds: [saleId] })).some((x) => x.status === "COUNTED");
}
