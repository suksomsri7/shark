"use server";

// server actions ของหน้าช่องทางการเงิน V2 (WO 5.1 · DESIGN-SPEC-V2 §10.1 · ภาพ g9)
// เรียกตรงจาก client component (ไม่ผ่าน <form action>) แบบเดียวกับ saveContactAction/ContactModal —
// คืนผลลัพธ์เป็น object ให้ modal โชว์ error inline โดยไม่ทำให้ข้อมูลที่กรอกหาย (BLUEPRINT §0.3 ข้อ 9)

import type { AccountFinanceType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  createFinanceAccount,
  updateFinanceAccount,
  archiveFinanceAccount,
  transferBetweenFinance,
  addFinanceOpeningEntry,
  updateFinanceOpeningEntry,
  removeFinanceOpeningEntry,
  type BankSubtype,
} from "@/lib/modules/account/finance";

export type FinanceOpeningEntryPayload = { seq?: number; date: string; amount: number; note?: string };

export type FinanceFormPayload = {
  /** มี = แก้ไข · ไม่มี = เพิ่มใหม่ */
  id?: string;
  type: AccountFinanceType;
  code: string;
  name: string;
  bankSubtype?: BankSubtype;
  bankName?: string;
  bankBranch?: string;
  accountNo?: string;
  accountName?: string;
  promptpayId?: string;
  note?: string;
  useForReceive: boolean;
  useForPay: boolean;
  showOnDocuments: boolean;
  holderUserId?: string;
  limitSatang?: number;
  /** เฉพาะตอนเพิ่มใหม่ — แก้ไขยอดยกมาทำผ่าน saveOpeningEntryAction/removeOpeningEntryAction แยก */
  openingEntries?: { date: string; amount: number; note?: string }[];
};

export type SaveFinanceResult =
  | { ok: true; id: string; code: string }
  | { ok: false; error: "validation"; fields: Record<string, string> }
  | { ok: false; error: "other"; reason: string };

const MAXLEN = { name: 40, note: 500, bankBranch: 100, accountNo: 34, accountName: 100, promptpayId: 20 };

function validate(p: FinanceFormPayload): Record<string, string> {
  const f: Record<string, string> = {};
  if (!p.name.trim()) f.name = "จำเป็นต้องกรอก";
  for (const [k, max] of Object.entries(MAXLEN)) {
    const v = String((p as unknown as Record<string, string>)[k] ?? "");
    if (v.length > max) f[k] = `ยาวเกิน ${max} ตัวอักษร`;
  }
  if (p.limitSatang != null && p.limitSatang < 0) f.limitSatang = "วงเงินต้องไม่ติดลบ";
  for (const e of p.openingEntries ?? []) {
    if (!e.date) f.openingEntries = "กรอกวันที่ยอดยกมาให้ครบทุกแถว";
    if (e.note && e.note.length > 100) f.openingEntries = "หมายเหตุยอดยกมายาวเกิน 100 ตัวอักษร";
  }
  return f;
}

export async function saveFinanceAction(systemId: string, payload: FinanceFormPayload): Promise<SaveFinanceResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");

  const fields = validate(payload);
  if (Object.keys(fields).length > 0) return { ok: false, error: "validation", fields };

  const common = {
    type: payload.type,
    name: payload.name.trim(),
    code: payload.code.trim() || undefined,
    bankSubtype: payload.type === "BANK" ? payload.bankSubtype ?? "SAVINGS" : null,
    bankName: payload.bankName?.trim() || null,
    bankBranch: payload.bankBranch?.trim() || null,
    accountNo: payload.accountNo?.trim() || null,
    accountName: payload.accountName?.trim() || null,
    promptpayId: payload.promptpayId?.trim() || null,
    note: payload.note?.trim() || null,
    useForReceive: payload.useForReceive,
    useForPay: payload.useForPay,
    showOnDocuments: payload.showOnDocuments,
    holderUserId: payload.holderUserId?.trim() || null,
    limitSatang: payload.limitSatang != null ? Math.round(payload.limitSatang) : null,
  };

  if (payload.id) {
    const res = await updateFinanceAccount(tenantId, systemId, payload.id, common);
    if (!res.ok) return { ok: false, error: "other", reason: res.reason };
    await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: payload.id, after: common });
    return { ok: true, id: payload.id, code: payload.code };
  }

  const res = await createFinanceAccount({
    tenantId,
    systemId,
    ...common,
    openingEntries: (payload.openingEntries ?? [])
      .filter((e) => e.amount !== 0)
      .map((e) => ({ date: new Date(e.date), amountSatang: Math.round(e.amount), note: e.note?.trim() || null })),
  });
  if (!res.ok) return { ok: false, error: "other", reason: res.reason };
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: res.id, after: { type: payload.type, name: payload.name } });
  return { ok: true, id: res.id, code: res.code };
}

export type OpeningEntryResult = { ok: true } | { ok: false; reason: string };

export async function saveOpeningEntryAction(
  systemId: string,
  financeId: string,
  input: { seq?: number; date: string; amount: number; note?: string },
): Promise<OpeningEntryResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const date = new Date(input.date);
  const note = input.note?.trim() || null;
  const res = input.seq
    ? await updateFinanceOpeningEntry(tenantId, systemId, financeId, input.seq, { date, amountSatang: Math.round(input.amount), note })
    : await addFinanceOpeningEntry(tenantId, systemId, financeId, { date, amountSatang: Math.round(input.amount), note });
  if (!res.ok) return { ok: false, reason: res.reason };
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: financeId, after: { openingEntry: input } });
  return { ok: true };
}

export async function removeOpeningEntryAction(systemId: string, financeId: string, seq: number): Promise<OpeningEntryResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await removeFinanceOpeningEntry(tenantId, systemId, financeId, seq);
  if (!res.ok) return { ok: false, reason: res.reason };
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: financeId, after: { removedOpeningSeq: seq } });
  return { ok: true };
}

export type SimpleResult = { ok: true } | { ok: false; reason: string };

export async function archiveFinanceActionDirect(systemId: string, id: string): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await archiveFinanceAccount(tenantId, systemId, id);
  if (!res.ok) return { ok: false, reason: res.reason };
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: id, after: { archived: true } });
  return { ok: true };
}

/** เวอร์ชัน FormData → redirect — ใช้กับ RowActions `submit` (⋮ "ปิดใช้งาน") ตรง ๆ ไม่ต้องห่อ inline action เพิ่ม */
export async function archiveFinanceFormAction(fd: FormData): Promise<void> {
  const { redirect } = await import("next/navigation");
  const { revalidatePath } = await import("next/cache");
  const systemId = String(fd.get("systemId") ?? "");
  const id = String(fd.get("id") ?? "");
  const base = `/app/sys/${systemId}/account/finance`;
  const res = await archiveFinanceActionDirect(systemId, id);
  if (!res.ok) redirect(`${base}?err=${encodeURIComponent(res.reason)}`);
  revalidatePath(base);
  redirect(base);
}

export type TransferPayload = { transferId: string; fromId: string; toId: string; amount: number; date: string; note?: string };

export async function transferFinanceActionDirect(systemId: string, payload: TransferPayload): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await transferBetweenFinance(tenantId, systemId, {
    transferId: payload.transferId,
    fromId: payload.fromId,
    toId: payload.toId,
    amount: Math.round(payload.amount),
    date: new Date(payload.date),
    note: payload.note?.trim() || null,
    createdById: userId,
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", after: { transfer: true, amount: payload.amount } });
  return { ok: true };
}
