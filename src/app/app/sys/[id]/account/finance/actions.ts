"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountFinanceType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import {
  createFinanceAccount,
  updateFinanceAccount,
  archiveFinanceAccount,
  transferBetweenFinance,
  pettyCashReplenish,
} from "@/lib/modules/account/finance";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const baht = (fd: FormData, k: string) => Math.round(Number(fd.get(k) ?? 0) * 100); // บาท → สตางค์
const dateOf = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? new Date(v) : undefined;
};
const base = (systemId: string) => `/app/sys/${systemId}/account/finance`;

export async function createFinanceAccountAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await createFinanceAccount({
    tenantId,
    systemId,
    type: (str(fd, "type") as AccountFinanceType) || "BANK",
    name: str(fd, "name"),
    bankName: str(fd, "bankName") || null,
    accountNo: str(fd, "accountNo") || null,
    promptpayId: str(fd, "promptpayId") || null,
    openingBalance: baht(fd, "openingBalance"),
    openingDate: dateOf(fd, "openingDate") ?? null,
    showOnDocuments: fd.get("showOnDocuments") === "on",
  });
  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.finance.manage",
    targetType: "AccountFinance",
    targetId: res.id,
    after: { type: str(fd, "type"), name: str(fd, "name") },
  });
  revalidatePath(base(systemId));
  redirect(base(systemId));
}

export async function updateFinanceAccountAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await updateFinanceAccount(tenantId, systemId, id, {
    name: str(fd, "name") || undefined,
    bankName: str(fd, "bankName") || null,
    accountNo: str(fd, "accountNo") || null,
    promptpayId: str(fd, "promptpayId") || null,
    showOnDocuments: fd.get("showOnDocuments") === "on",
  });
  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: id });
  revalidatePath(base(systemId));
  redirect(base(systemId));
}

export async function archiveFinanceAccountAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const id = str(fd, "id");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  await archiveFinanceAccount(tenantId, systemId, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", targetId: id, after: { archived: true } });
  revalidatePath(base(systemId));
  redirect(base(systemId));
}

export async function transferAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await transferBetweenFinance(tenantId, systemId, {
    fromId: str(fd, "fromId"),
    toId: str(fd, "toId"),
    amount: baht(fd, "amount"),
    date: dateOf(fd, "date"),
    note: str(fd, "note") || null,
  });
  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", after: { transfer: true, amount: baht(fd, "amount") } });
  revalidatePath(base(systemId));
  redirect(`${base(systemId)}?ok=transfer`);
}

export async function pettyReplenishAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.finance.manage");
  const res = await pettyCashReplenish(tenantId, systemId, {
    pettyId: str(fd, "pettyId"),
    counterFinanceId: str(fd, "counterFinanceId"),
    amount: baht(fd, "amount"),
    kind: (str(fd, "kind") as "TOPUP" | "REIMBURSE") || "TOPUP",
    date: dateOf(fd, "date"),
  });
  if (!res.ok) redirect(`${base(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({ tenantId, actorId: userId, action: "account.finance.manage", targetType: "AccountFinance", after: { pettyReplenish: true } });
  revalidatePath(base(systemId));
  redirect(`${base(systemId)}?ok=petty`);
}
