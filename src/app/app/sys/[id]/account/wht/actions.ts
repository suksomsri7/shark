"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { issueWhtCert, markFiled, unmarkFiled } from "@/lib/modules/account/wht";

export type SimpleResult = { ok: true } | { ok: false; reason: string };

// WO 5.4 (§10.5 · g11) — "ทำเครื่องหมายนำส่งแล้ว"/"ยกเลิกเครื่องหมาย" เรียกตรงจาก client component
// (แบบเดียวกับ reconcile/actions.ts) — คืน object ให้โชว์ error inline ใน modal แทน redirect
export async function markFiledAction(
  systemId: string,
  input: { form: 3 | 53; periodKey: string; note?: string },
): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.wht.manage");
  const res = await markFiled(tenantId, systemId, { ...input, filedById: userId });
  if (!res.ok) return res;
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.wht.manage",
    targetType: "AccountWhtFiling",
    targetId: `${systemId}:${input.form}:${input.periodKey}`,
    after: { form: input.form, periodKey: input.periodKey, certCount: res.certCount },
  });
  revalidatePath(`/app/sys/${systemId}/account/wht`);
  return { ok: true };
}

export async function unmarkFiledAction(systemId: string, input: { form: 3 | 53; periodKey: string }): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  // สิทธิ์ระดับเจ้าของ — เหมือน account.period.reopen (ดู reconcile/actions.ts)
  assertAccountCan(auth, "account.wht.unmark");
  const res = await unmarkFiled(tenantId, systemId, input);
  if (!res.ok) return res;
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.wht.unmark",
    targetType: "AccountWhtFiling",
    targetId: `${systemId}:${input.form}:${input.periodKey}`,
  });
  revalidatePath(`/app/sys/${systemId}/account/wht`);
  return { ok: true };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const wbase = (systemId: string) => `/app/sys/${systemId}/account/wht`;

export async function issueWhtCertAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.wht.manage");
  const rateStr = str(fd, "whtRateBp");
  const res = await issueWhtCert(tenantId, systemId, {
    paymentId: str(fd, "paymentId"),
    whtIncomeType: (str(fd, "whtIncomeType") as AccountWhtIncomeType) || "M40_8",
    whtRateBp: rateStr ? Number(rateStr) : null,
    createdById: userId,
  });
  if (!res.ok) redirect(`${wbase(systemId)}?err=${encodeURIComponent(res.reason)}`);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.wht.manage",
    targetType: "AccountDocument",
    targetId: res.certId,
    after: { whtCert: res.docNo, paymentId: str(fd, "paymentId") },
  });
  revalidatePath(wbase(systemId));
  redirect(`${wbase(systemId)}/${res.certId}/print`);
}
