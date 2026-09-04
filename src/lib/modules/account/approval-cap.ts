// approval-cap.ts — เพดานอนุมัติเป็นบาท + การส่งต่อให้ผู้มีอำนาจสูงกว่า (WO 8.3 · SPEC §9.4 · เฟรม g13)
//
// 🔴 ที่เก็บเพดาน = `Membership.permissions._maxApproveSatang` (ของเดิมของแพลตฟอร์ม — ไม่ได้สร้างใหม่)
//    · ทะเบียนอยู่ที่ core/permissions.ts `PERMISSION_PARAMS` (unit บาท · factor 100 = สตางค์)
//    · ด่านห้ามยกระดับอยู่ที่ core/rbac.ts `canGrantPermissionValue` (แจกเพดานเกินของตัวเองไม่ได้)
//    · จุดบังคับใช้เดิม: `expense-actions.approvePOAction` → `expense.approvePurchaseOrder({maxSatang})`
//
// สิ่งที่ WO 8.3 เพิ่ม (ไม่แตะ 3 ข้อบน):
//    1) เกินเพดาน = **ไม่ใช่แค่ปฏิเสธ** — ยื่นเข้าสายอนุมัติของแพลตฟอร์ม (`approval.submitForApproval`)
//       เพื่อให้ "คนอื่นที่มีเพดานสูงกว่า" มากดอนุมัติแทน (เกณฑ์ผ่าน BLUEPRINT: เพดาน 50,000 → PO 60,000)
//    2) ห้ามอนุมัติเอกสารที่ตัวเองเป็นคนสร้างเมื่อยอดเกินเพดาน (self-approval)
//    3) ข้อความไทยบอกตัวเลขจริงทั้งเพดานและยอดเอกสาร + เขียน AuditLog ทุกครั้ง

import type { MembershipCtx } from "@/lib/core/rbac";
import { permissionValue } from "@/lib/core/rbac";
import { submitForApproval } from "@/lib/modules/approval/service";
import { APPROVE_CAP_KEY } from "./permissions-matrix";

/** entityType ที่ใช้กับโมดูล approval (ต้องคงที่ — ApprovalPolicy ของร้านผูกกับสตริงนี้) */
export const ACCOUNT_APPROVAL_ENTITY = "AccountDocument";

/** ชนิดเอกสารที่มี "เพดานอนุมัติ" (§9.4 — ฝั่งซื้อ/ค่าใช้จ่าย) */
export const CAPPED_DOC_TYPES = [
  "PURCHASE_ORDER",
  "ASSET_PURCHASE_ORDER",
  "PURCHASE",
  "EXPENSE",
  "ASSET_PURCHASE",
] as const;

export type CappedDocType = (typeof CAPPED_DOC_TYPES)[number];

export const isCappedDocType = (t: string): t is CappedDocType =>
  (CAPPED_DOC_TYPES as readonly string[]).includes(t);

/** เพดานของผู้ใช้คนนี้เป็นสตางค์ — undefined = ไม่จำกัด (OWNER/MANAGER ที่ไม่ได้ตั้งค่า) */
export function capOf(m: MembershipCtx): number | undefined {
  return permissionValue(m, APPROVE_CAP_KEY);
}

export const bahtText = (satang: number): string =>
  `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type CapDecision =
  | { ok: true }
  | { ok: false; reason: string; routed: boolean; capSatang: number };

/**
 * ตัดสินว่าคนนี้อนุมัติเอกสารยอดนี้ได้ไหม — เกิน = ยื่นเข้าสายอนุมัติแล้วปฏิเสธการกดครั้งนี้
 *
 * ผลลัพธ์ที่ผู้ใช้เห็น: เอกสารยัง "รออนุมัติ" เหมือนเดิม (ไม่เปลี่ยนสถานะ ไม่เสียเลขที่)
 * แต่มีคำขออนุมัติค้างอยู่ให้คนที่มีเพดานสูงกว่ามากด — ซึ่งเมื่ออนุมัติผ่านสายแล้ว
 * `approval-effects.ts` จะดันเอกสารเป็น APPROVED ให้เอง (idempotent · guard สถานะ)
 */
export async function checkApprovalCap(input: {
  m: MembershipCtx;
  ctx: { tenantId: string };
  systemId: string;
  docId: string;
  docType: string;
  amountSatang: number;
  approverUserId: string;
  /** ผู้สร้างเอกสาร — ใช้กันการอนุมัติงานของตัวเองเมื่อเกินเพดาน */
  createdById?: string | null;
}): Promise<CapDecision> {
  const cap = capOf(input.m);
  if (cap === undefined) return { ok: true }; // ไม่ตั้งเพดาน = ไม่จำกัด (พฤติกรรมเดิม)
  if (input.amountSatang <= cap) {
    // อยู่ในเพดาน — แต่ถ้าเป็นเอกสารของตัวเองและ "เกินเพดาน" ไม่เข้าเงื่อนไขนี้อยู่แล้ว
    return { ok: true };
  }

  const self = !!input.createdById && input.createdById === input.approverUserId;
  let routed = false;
  try {
    const res = await submitForApproval(input.ctx, {
      entityType: ACCOUNT_APPROVAL_ENTITY,
      entityId: input.docId,
      systemId: input.systemId,
      amountSatang: input.amountSatang,
      requestedById: input.approverUserId,
    });
    routed = !("autoApproved" in res);
  } catch {
    routed = false; // ยื่นไม่สำเร็จ = ยังต้องปฏิเสธการกดครั้งนี้อยู่ดี (fail-closed)
  }

  const head = self
    ? `เอกสารนี้คุณเป็นคนสร้างเอง และยอด ${bahtText(input.amountSatang)} เกินเพดานอนุมัติของคุณ (${bahtText(cap)})`
    : `ยอด ${bahtText(input.amountSatang)} เกินเพดานอนุมัติของคุณ (${bahtText(cap)} ต่อรายการ)`;
  const tail = routed
    ? " — ส่งให้ผู้มีอำนาจอนุมัติที่สูงกว่าแล้ว รออีกคนกดอนุมัติ"
    : " — ให้ผู้ที่มีเพดานสูงกว่าเป็นผู้อนุมัติแทน";
  return { ok: false, reason: head + tail, routed, capSatang: cap };
}
