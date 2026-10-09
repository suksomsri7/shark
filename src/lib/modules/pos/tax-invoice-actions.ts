"use server";
// tax-invoice-actions.ts — server action ของใบกำกับภาษีเต็มรูป (POS P1.13 · R3–R6) · เปลือกบาง: session → ctx/actor → tax-invoice.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ tax-invoice.ts / tax-invoice-shared.ts
// 🔴 ร้าน/ผู้ใช้ (role · unitAccess · permissions) มาจาก SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน tax-invoice.ts
//    ด่านสิทธิ์ชั้นแรกระดับร้าน (assertCan · fitness F6.1) — สิทธิ์ต่อสาขาตัดสินในบริการ (ยกเว้น buyerProfileForMember ที่ตัดสินที่นี่ · มติ 14)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = INTERNAL · redirect ของ Next ผ่านออกไปได้ (unstable_rethrow)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
import {
  buyerProfileForMember,
  issueFromTaxInvoiceRequest,
  issueFullTaxInvoice,
  lookupBuyerByTaxId,
  rejectTaxInvoiceRequest,
  type BuyerProfileResult,
  type TaxInvoiceCtx,
  type TaxInvoiceIssueResult,
  type TaxInvoiceLookupResult,
  type TaxInvoiceRejectResult,
} from "./tax-invoice";
import type { RegisterActor } from "./register-shared";
import { taxInvoiceRefuse, type TaxInvoiceRefusal } from "./tax-invoice-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;

/** ด่านระดับร้าน: มีคีย์ใดคีย์หนึ่ง (ไม่ระบุสาขา) */
function canAny(m: MembershipCtx, actions: string[]): boolean {
  for (const action of actions) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      /* ลองคีย์ถัดไป */
    }
  }
  return false;
}

/** ด่านที่สาขา (assertCan ระบุ unitId) */
function canAt(m: MembershipCtx, action: string, unitId: string): boolean {
  try {
    assertCan(m, { module: "pos", action, unitId });
    return true;
  } catch {
    return false;
  }
}

function unexpected(where: string, e: unknown): TaxInvoiceRefusal {
  console.error(`[pos/tax-invoice-actions] ${where}`, e instanceof Error ? e.name : "Error");
  return taxInvoiceRefuse("INTERNAL");
}

/** session → ctx + actor (systemId/unitId จากคำขอ — บริการตรวจซ้ำกับ DB) */
function fromSession(auth: Session, args: unknown): { ctx: TaxInvoiceCtx; actor: RegisterActor; m: MembershipCtx } {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const m = posMembership(auth.active);
  return {
    ctx: { tenantId: auth.active.tenantId, systemId: typeof a.systemId === "string" ? a.systemId : "", unitId: typeof a.unitId === "string" ? a.unitId : "" },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
    m,
  };
}

/** ออกใบกำกับภาษีเต็มรูปให้บิลที่ชำระแล้ว (ลิ้นชักบิล / หลังชำระ) */
export async function issueFullTaxInvoiceAction(args: { systemId: string; unitId: string; saleId: string; buyer: unknown; requestId?: string; rememberBuyer?: boolean }): Promise<TaxInvoiceIssueResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.taxinvoice.issue"])) return taxInvoiceRefuse("PERMISSION_DENIED");
    return await issueFullTaxInvoice(s.ctx, s.actor, {
      saleId: typeof args?.saleId === "string" ? args.saleId : "",
      buyer: args?.buyer,
      ...(args?.requestId !== undefined ? { requestId: args.requestId } : {}),
      ...(args?.rememberBuyer !== undefined ? { rememberBuyer: args.rememberBuyer } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("issueFullTaxInvoiceAction", e);
  }
}

/** ออกเต็มรูปจากคำขอของลูกค้า (ใบเสร็จออนไลน์ P1.11) */
export async function issueFromTaxInvoiceRequestAction(args: { systemId: string; unitId: string; requestId: string; rememberBuyer?: boolean }): Promise<TaxInvoiceIssueResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.taxinvoice.issue"])) return taxInvoiceRefuse("PERMISSION_DENIED");
    return await issueFromTaxInvoiceRequest(s.ctx, s.actor, {
      requestId: typeof args?.requestId === "string" ? args.requestId : "",
      ...(args?.rememberBuyer !== undefined ? { rememberBuyer: args.rememberBuyer } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("issueFromTaxInvoiceRequestAction", e);
  }
}

/** ปฏิเสธคำขอใบกำกับเต็มรูป (เหตุผลบังคับ) */
export async function rejectTaxInvoiceRequestAction(args: { systemId: string; unitId: string; requestId: string; reason: string }): Promise<TaxInvoiceRejectResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.taxinvoice.issue"])) return taxInvoiceRefuse("PERMISSION_DENIED");
    return await rejectTaxInvoiceRequest(s.ctx, s.actor, {
      requestId: typeof args?.requestId === "string" ? args.requestId : "",
      reason: typeof args?.reason === "string" ? args.reason : "",
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("rejectTaxInvoiceRequestAction", e);
  }
}

/** ค้นนิติบุคคลจากเลขผู้เสียภาษี (จอชำระ · ไม่มีกุญแจ = DBD_NOT_CONFIGURED → จอให้กรอกเอง) */
export async function lookupBuyerByTaxIdAction(args: { systemId: string; unitId: string; taxId: string }): Promise<TaxInvoiceLookupResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!canAny(s.m, ["pos.sale.create"])) return taxInvoiceRefuse("PERMISSION_DENIED");
    return await lookupBuyerByTaxId(s.ctx, s.actor, { taxId: typeof args?.taxId === "string" ? args.taxId : "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("lookupBuyerByTaxIdAction", e);
  }
}

/**
 * ผู้ซื้อที่จำไว้ของสมาชิก (เติมฟอร์มบนจอชำระ) — มติ 14: ตรวจ pos.sale.create ที่สาขาของคำขอ + สาขาเป็นของร้าน/ระบบ POS นี้
 * สมาชิกร้านอื่น = profile null (บริการกรองร้านอีกชั้น)
 */
export async function buyerProfileForMemberAction(args: { systemId: string; unitId: string; memberId: string }): Promise<BuyerProfileResult> {
  try {
    const auth = await requireTenant();
    const s = fromSession(auth, args);
    if (!s.ctx.unitId || !s.ctx.systemId) return taxInvoiceRefuse("PERMISSION_DENIED");
    if (!canAt(s.m, "pos.sale.create", s.ctx.unitId)) return taxInvoiceRefuse("PERMISSION_DENIED");
    // สาขาต้องผูกกับระบบ POS ของคำขอในร้านนี้ (กันส่ง systemId/unitId ของร้านอื่น)
    const link = await prisma.appSystemUnit.findFirst({ where: { tenantId: s.ctx.tenantId, systemId: s.ctx.systemId, unitId: s.ctx.unitId, type: "POS" }, select: { unitId: true } });
    if (!link) return taxInvoiceRefuse("PERMISSION_DENIED");
    return await buyerProfileForMember({ tenantId: s.ctx.tenantId }, { memberId: typeof args?.memberId === "string" ? args.memberId : "" });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("buyerProfileForMemberAction", e);
  }
}
