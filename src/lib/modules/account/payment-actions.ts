"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AccountDocType } from "@prisma/client";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, writeAudit } from "./access";
// 🔴 ไฟล์นี้ **ไม่ import prisma** — ทุกการแตะ DB ผ่านชั้น payment/service/expense (fitness F5)
import {
  approveReceiptWithPayments,
  paymentPanelData,
  recordPayments,
  voidPaymentAny,
  type PaymentDraft,
  type PaymentPanelData,
} from "./payment";
import { listDeductibleDeposits, setDocDeposits, refundDeposit } from "./service";
import { listDeductiblePaidDeposits, setExpenseDocDeposits } from "./expense";
import { editorDetailPath } from "./doc-editor-config";
// WO 5.5 — ลิงก์ชำระเงิน / QR PromptPay
import {
  createPaymentRequest,
  confirmStaticPaymentRequest,
  cancelPaymentRequest,
  type PaymentRequestView,
} from "./payment-request";
import { listFinanceAccounts } from "./finance";

// ─────────────────────────────────────────────────────────────
// payment-actions.ts — server actions ของส่วน D (เงินมัดจำ) และ F (รับชำระ/บันทึกจ่าย) · WO 1.4
//
// กติกาความปลอดภัยที่ทุก action ต้องทำ **ตามลำดับนี้เสมอ** (เหมือน editor-actions.ts):
//   1) loadAccountSystem(systemId)  → ผูก tenant + ยืนยันว่าระบบนี้เป็น ACCOUNT ของ tenant ที่ล็อกอิน
//   2) assertAccountCan(auth, …)    → สิทธิ์ (`account.payment.record` / `.void` / `account.doc.create`)
//   3) ทุก query ผูก { tenantId, systemId } — id จาก client เป็นแค่ "คำขอ"
//   4) ตัวเลขทั้งหมดคำนวณ/ตรวจใหม่ฝั่ง server (ยอดคงเหลือ · เพดานมัดจำ · ยอดเกิน)
// ─────────────────────────────────────────────────────────────

const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export type DepositOption = {
  id: string;
  docNo: string | null;
  issueDate: string;
  available: number;
  appliedHere: number;
};

/** รายการใบมัดจำที่ยังหักได้ของผู้ติดต่อนี้ (modal "+ เลือกเงินมัดจำ" §5.2 D) */
export async function listDepositOptionsAction(
  systemId: string,
  docType: string,
  contactId: string,
  docId?: string,
): Promise<DepositOption[]> {
  const { auth, tenantId } = await loadAccountSystem(trim(systemId, 40));
  assertAccountCan(auth, "account.doc.create");
  const cid = trim(contactId, 40);
  if (!cid) return [];
  const dt = trim(docType, 40) as AccountDocType;
  const id = docId ? trim(docId, 40) : undefined;
  const rows =
    dt === "PURCHASE" || dt === "EXPENSE"
      ? (await listDeductiblePaidDeposits(tenantId, systemId, cid, id)).map((d) => ({
          id: d.id,
          docNo: d.docNo,
          issueDate: d.issueDate.toISOString().slice(0, 10),
          available: d.available,
          appliedHere: d.appliedHere,
        }))
      : (await listDeductibleDeposits(tenantId, systemId, cid, id)).map((d) => ({
          id: d.id,
          docNo: d.docNo,
          issueDate: d.issueDate.toISOString().slice(0, 10),
          available: d.available,
          appliedHere: d.appliedHere,
        }));
  return rows;
}

/** บันทึก "หักเงินมัดจำ" ของร่าง (หลายใบ · บางส่วนได้) → คืนยอดใหม่ให้ฟอร์มอัปเดตบล็อกสรุป */
export async function setDepositsAction(
  systemId: string,
  docId: string,
  picks: { depositId: string; amountSatang: number }[],
): Promise<{ ok: true; depositDeducted: number; grandTotal: number } | { ok: false; reason: string }> {
  const sys = trim(systemId, 40);
  const { auth, tenantId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.create");
  const id = trim(docId, 40);
  const clean = (Array.isArray(picks) ? picks : []).slice(0, 50).map((p) => ({
    depositId: trim(p.depositId, 40),
    amountSatang: Math.max(0, Math.round(Number(p.amountSatang) || 0)),
  }));
  // ชนิดเอกสารตัดสินจาก DB (ไม่เชื่อ client) — service/expense ตรวจซ้ำอีกชั้น
  const panel = await paymentPanelData(tenantId, sys, id);
  if (!panel) return { ok: false, reason: "ไม่พบเอกสาร" };
  const res =
    panel.docType === "PURCHASE" || panel.docType === "EXPENSE"
      ? await setExpenseDocDeposits(tenantId, sys, id, clean)
      : await setDocDeposits(tenantId, sys, id, clean);
  return res;
}

/** ข้อมูลตั้งต้นของแผง "รับชำระเงิน/บันทึกจ่าย" (ใช้ทั้งใน SlideOver และหน้าใบเสร็จ) */
export async function paymentPanelDataAction(systemId: string, docId: string): Promise<PaymentPanelData | null> {
  const sys = trim(systemId, 40);
  const { auth, tenantId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.view");
  return paymentPanelData(tenantId, sys, trim(docId, 40));
}

export type RecordPaymentsActionResult =
  | { ok: true; status: string; outstanding: number; certNos: string[]; recorded: number }
  | { ok: false; reason: string };

/** §5.2 F — บันทึกการรับชำระ/จ่ายหลายครั้งในคำสั่งเดียว */
export async function recordPaymentsAction(
  systemId: string,
  docId: string,
  payments: PaymentDraft[],
  idempotencyKey?: string,
): Promise<RecordPaymentsActionResult> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.record");
  const id = trim(docId, 40);
  const rows = (Array.isArray(payments) ? payments : []).slice(0, 30);
  const res = await recordPayments(tenantId, sys, id, rows, {
    userId,
    keyBase: idempotencyKey ? trim(idempotencyKey, 80) : null,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.record",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { recorded: res.recorded, status: res.status, certNos: res.certNos } : { error: res.reason },
  });
  if (!res.ok) return res;
  revalidatePath(`/app/sys/${sys}/account`, "layout");
  return { ok: true, status: res.status, outstanding: res.outstanding, certNos: res.certNos, recorded: res.recorded };
}

/** §5.2 F — "อนุมัติใบเสร็จรับเงิน" พร้อมรายการรับชำระที่กรอกไว้ (ภาพ g2) */
export async function approveReceiptWithPaymentsAction(
  systemId: string,
  docId: string,
  payments: PaymentDraft[],
  idempotencyKey?: string,
): Promise<{ ok: true; docNo: string; certNos: string[]; href: string } | { ok: false; reason: string }> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.doc.issue");
  assertAccountCan(auth, "account.payment.record");
  const id = trim(docId, 40);
  const res = await approveReceiptWithPayments(tenantId, sys, id, (Array.isArray(payments) ? payments : []).slice(0, 30), {
    userId,
    keyBase: idempotencyKey ? trim(idempotencyKey, 80) : null,
  });
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.doc.issue",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { docNo: res.docNo, certNos: res.certNos } : { error: res.reason },
  });
  if (!res.ok) return res;
  revalidatePath(`/app/sys/${sys}/account`, "layout");
  return { ok: true, docNo: res.docNo, certNos: res.certNos, href: editorDetailPath(`/app/sys/${sys}/account`, "RECEIPT", id) };
}

/** §5.2 F — ยกเลิกการชำระ (reversal ไม่ลบ · ยกเลิกใบภาษีหัก ณ ที่จ่ายตาม · ถอยสถานะ) */
export async function voidPaymentV2Action(
  systemId: string,
  docId: string,
  paymentId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.void");
  const id = trim(docId, 40);
  const pid = trim(paymentId, 40);
  const why = trim(reason, 200) || "ยกเลิกการชำระ";
  const res = await voidPaymentAny(tenantId, sys, id, pid, why);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.void",
    targetType: "AccountDocumentPayment",
    targetId: pid,
    after: res.ok ? { ok: true, reason: why } : { error: res.reason },
  });
  if (res.ok) revalidatePath(`/app/sys/${sys}/account`, "layout");
  return res;
}

/** §3 ทำรายการ — "คืนมัดจำ" เวอร์ชัน `<form action>` สำหรับ ConfirmDialog บนหน้าเอกสาร */
export async function refundDepositFormAction(formData: FormData) {
  const systemId = trim(formData.get("systemId"), 40);
  const docId = trim(formData.get("id"), 40);
  const res = await refundDepositAction(systemId, docId, trim(formData.get("reason"), 200));
  const path = `/app/sys/${systemId}/account/docs/${trim(formData.get("docType"), 40)}/${docId}`;
  redirect(res.ok ? path : `${path}?err=${encodeURIComponent(res.reason)}`);
}

/** §3 ทำรายการ — "คืนมัดจำ" (DR/DP): กลับรายการ JV ของใบมัดจำ + ปิดใบ */
export async function refundDepositAction(
  systemId: string,
  docId: string,
  reason: string,
): Promise<{ ok: true; refunded: number } | { ok: false; reason: string }> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.void");
  const id = trim(docId, 40);
  const why = trim(reason, 200) || "คืนเงินมัดจำให้ผู้ติดต่อ";
  const res = await refundDeposit(tenantId, sys, id, why);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.payment.void",
    targetType: "AccountDocument",
    targetId: id,
    after: res.ok ? { refunded: res.refunded, reason: why } : { error: res.reason },
  });
  if (res.ok) revalidatePath(`/app/sys/${sys}/account`, "layout");
  return res;
}

// ─────────────────────────────────────────────────────────────
// WO 5.5 · §0.3 ข้อ 5 — ลิงก์ชำระเงิน / QR PromptPay (หน้าเอกสาร)
// ด่านเดียวกับการรับชำระจริง: `account.payment.record` (สร้างลิงก์ = ตั้งใจจะรับเงิน)
// ─────────────────────────────────────────────────────────────

export type PaymentRequestActionResult =
  | { ok: true; request: PaymentRequestView; reused: boolean }
  | { ok: false; reason: string };

/** สร้าง (หรือคืนใบเดิม) ลิงก์+QR เก็บเงินของเอกสารนี้ — คืนค่าตรง ๆ ให้ modal ใช้ ไม่ redirect */
export async function createPaymentRequestAction(
  systemId: string,
  docId: string,
  financeId: string,
  expiresInDays?: number,
): Promise<PaymentRequestActionResult> {
  const sys = trim(systemId, 40);
  const { auth, tenantId, userId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.record");
  const res = await createPaymentRequest({ tenantId, systemId: sys }, trim(docId, 40), {
    financeId: trim(financeId, 40),
    expiresInDays,
    userId,
  });
  if (res.ok) revalidatePath(`/app/sys/${sys}/account`, "layout");
  return res;
}

/** ช่องทางที่ใช้รับเงินได้ (dropdown ในโมดัล) */
export async function listReceiveChannelsAction(
  systemId: string,
): Promise<{ id: string; name: string; hasPromptPay: boolean }[]> {
  const sys = trim(systemId, 40);
  const { auth, tenantId } = await loadAccountSystem(sys);
  assertAccountCan(auth, "account.payment.record");
  const rows = await listFinanceAccounts(tenantId, sys);
  return rows
    .filter((r) => r.useForReceive)
    .map((r) => ({ id: r.id, name: r.name, hasPromptPay: !!r.promptpayId }));
}

/** "ยืนยันรับเงินแล้ว" ของคำขอโหมด QR นิ่ง → บันทึกรับชำระ + JV เส้นทางเดียวกับ webhook */
export async function confirmPaymentRequestAction(formData: FormData): Promise<void> {
  const systemId = trim(formData.get("systemId"), 40);
  const requestId = trim(formData.get("requestId"), 40);
  const docType = trim(formData.get("docType"), 40);
  const docId = trim(formData.get("docId"), 40);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await confirmStaticPaymentRequest({ tenantId, systemId }, requestId, { userId });
  // encode ค่าที่มาจากฟอร์ม — กันคนแก้ hidden field ให้ redirect ออกนอกเส้นทางที่ตั้งใจ
  const path = `/app/sys/${systemId}/account/docs/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}`;
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account`, "layout");
  redirect(res.ok ? `${path}?msg=${encodeURIComponent("บันทึกรับเงินแล้ว")}` : `${path}?err=${encodeURIComponent(res.reason)}`);
}

/** ยกเลิกลิงก์ที่ยังรอชำระ (ลิงก์ที่ส่งออกไปแล้วใช้ไม่ได้ทันที) */
export async function cancelPaymentRequestAction(formData: FormData): Promise<void> {
  const systemId = trim(formData.get("systemId"), 40);
  const requestId = trim(formData.get("requestId"), 40);
  const docType = trim(formData.get("docType"), 40);
  const docId = trim(formData.get("docId"), 40);
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.payment.record");
  const res = await cancelPaymentRequest({ tenantId, systemId }, requestId, userId);
  const path = `/app/sys/${systemId}/account/docs/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}`;
  if (res.ok) revalidatePath(`/app/sys/${systemId}/account`, "layout");
  redirect(res.ok ? `${path}?msg=${encodeURIComponent("ยกเลิกลิงก์แล้ว")}` : `${path}?err=${encodeURIComponent(res.reason)}`);
}
