"use server";

// server actions ของหน้า "สำรองรับ/จ่าย" (WO 5.2 · DESIGN-SPEC-V2 §10.3)
// เรียกตรงจาก client component (ไม่ผ่าน <form action>) แบบเดียวกับ transferFinanceActionDirect (WO 5.1)
// คืนผลลัพธ์เป็น object ให้ modal โชว์ error inline โดยไม่ทำให้ข้อมูลที่กรอกหาย

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  topUpPettyCash,
  reimbursePettyCash,
  listReimbursableExpensePayments,
  type ReimbursableExpenseRow,
} from "@/lib/modules/account/finance-overview";

export type SimpleResult = { ok: true } | { ok: false; reason: string };

export type TopUpPayload = { transferId: string; pettyId: string; sourceFinanceId: string; amount: number; date: string; note?: string };

export async function topUpPettyCashActionDirect(systemId: string, payload: TopUpPayload): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  if (!payload.amount || payload.amount <= 0) return { ok: false, reason: "จำนวนเงินต้องมากกว่า 0" };
  const res = await topUpPettyCash(tenantId, systemId, {
    pettyId: payload.pettyId,
    sourceFinanceId: payload.sourceFinanceId,
    amount: Math.round(payload.amount),
    date: new Date(payload.date),
    note: payload.note?.trim() || null,
    transferId: payload.transferId,
  });
  if (!res.ok) return res;
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: payload.pettyId, after: { pettyTopUp: payload.amount } });
  revalidatePath(`/app/sys/${systemId}/account/finance/petty-cash`);
  return { ok: true };
}

export async function listReimbursableExpensesAction(systemId: string, pettyId: string): Promise<ReimbursableExpenseRow[]> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  return listReimbursableExpensePayments({ tenantId, systemId }, pettyId);
}

export type ReimbursePayload = { paymentId: string; sourceFinanceId: string; date: string; note?: string };

export async function reimbursePettyCashActionDirect(systemId: string, payload: ReimbursePayload): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await reimbursePettyCash(tenantId, systemId, {
    paymentId: payload.paymentId,
    sourceFinanceId: payload.sourceFinanceId,
    date: new Date(payload.date),
    note: payload.note?.trim() || null,
  });
  if (!res.ok) return res;
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountDocumentPayment", targetId: payload.paymentId, after: { reimbursed: true } });
  revalidatePath(`/app/sys/${systemId}/account/finance/petty-cash`);
  return { ok: true };
}
