"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountChequeDirection } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  createCheque,
  depositCheque,
  clearCheque,
  bounceCheque,
  voidCheque,
} from "@/lib/modules/account/cheque";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const baht = (fd: FormData, k: string) => Math.round(Number(fd.get(k) ?? 0) * 100);
const dateOf = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? new Date(v) : undefined;
};
const base = (systemId: string) => `/app/sys/${systemId}/account/cheque`;

export async function createChequeAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.cheque.manage");
  const direction = (str(fd, "direction") as AccountChequeDirection) || "IN";
  const res = await createCheque({
    tenantId,
    systemId,
    direction,
    chequeNo: str(fd, "chequeNo"),
    bankName: str(fd, "bankName"),
    bankBranch: str(fd, "bankBranch") || null,
    chequeDate: dateOf(fd, "chequeDate") ?? new Date(),
    amount: baht(fd, "amount"),
    financeAccountId: str(fd, "financeAccountId") || null,
    note: str(fd, "note") || null,
    documentId: str(fd, "documentId") || null, // R-B: ผูกเอกสาร → ตัดหนี้จริง (ถ้าเลือก)
  });
  if (!res.ok) redirect(`${base(systemId)}?dir=${direction}&err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.cheque.manage",
    targetType: "AccountCheque",
    targetId: res.id,
    after: { direction, chequeNo: str(fd, "chequeNo"), amount: baht(fd, "amount") },
  });
  revalidatePath(base(systemId));
  redirect(`${base(systemId)}?dir=${direction}&ok=1`);
}

async function transition(
  fd: FormData,
  action: string,
  fn: (t: string, s: string, id: string, extra?: string) => Promise<{ ok: boolean; reason?: string }>,
) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const dir = str(fd, "dir") || "IN";
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.cheque.manage");
  const res = await fn(tenantId, systemId, id, str(fd, "reason") || undefined);
  if (!res.ok) redirect(`${base(systemId)}?dir=${dir}&err=${encodeURIComponent(res.reason ?? "")}`);
  await writeAudit({ tenantId, actorId: userId, action, targetType: "AccountCheque", targetId: id });
  revalidatePath(base(systemId));
  redirect(`${base(systemId)}?dir=${dir}&ok=1`);
}

export async function depositChequeAction(fd: FormData) {
  return transition(fd, "account.cheque.deposit", (t, s, id) => depositCheque(t, s, id));
}
export async function clearChequeAction(fd: FormData) {
  return transition(fd, "account.cheque.clear", (t, s, id) => clearCheque(t, s, id));
}
export async function bounceChequeAction(fd: FormData) {
  return transition(fd, "account.cheque.bounce", (t, s, id, reason) => bounceCheque(t, s, id, reason));
}
export async function voidChequeAction(fd: FormData) {
  return transition(fd, "account.cheque.void", (t, s, id, reason) => voidCheque(t, s, id, reason));
}
