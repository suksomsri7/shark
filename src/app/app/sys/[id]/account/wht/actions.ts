"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { issueWhtCert } from "@/lib/modules/account/wht";

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
