"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AccountWhtIncomeType } from "@prisma/client";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { issueWhtCert, markFiled, unmarkFiled } from "@/lib/modules/account/wht";
import { screenAck, withScreenLegal } from "@/lib/modules/account/legal-gate";
import type { PndFormNumber } from "@/lib/modules/account/wht-forms";
import { markWhtCreditReceived, replaceWhtCert } from "@/lib/modules/account/wht-cert";

export type SimpleResult = { ok: true } | { ok: false; reason: string };

// WO 5.4 (§10.5 · g11) — "ทำเครื่องหมายนำส่งแล้ว"/"ยกเลิกเครื่องหมาย" เรียกตรงจาก client component
// (แบบเดียวกับ reconcile/actions.ts) — คืน object ให้โชว์ error inline ใน modal แทน redirect
export async function markFiledAction(
  systemId: string,
  input: { form: PndFormNumber; periodKey: string; note?: string },
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

export async function unmarkFiledAction(systemId: string, input: { form: PndFormNumber; periodKey: string; reason?: string }): Promise<SimpleResult> {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  // สิทธิ์ระดับเจ้าของ — เหมือน account.period.reopen (ดู reconcile/actions.ts)
  assertAccountCan(auth, "account.wht.unmark");
  // ACC T1.7 ▸ ไม่ลบแถว — เก็บใคร/เมื่อไร/เหตุผล ◂
  const res = await unmarkFiled(tenantId, systemId, { form: input.form, periodKey: input.periodKey, userId, reason: input.reason ?? null });
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
  const res = await withScreenLegal(screenAck(fd.getAll("ack"), userId), () =>
    issueWhtCert(tenantId, systemId, {
      paymentId: str(fd, "paymentId"),
      whtIncomeType: (str(fd, "whtIncomeType") as AccountWhtIncomeType) || "M40_8",
      whtRateBp: rateStr ? Number(rateStr) : null,
      createdById: userId,
    }),
  );
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

// ── ACC T3.3 ยกเลิก 50 ทวิ แล้วออกใบแทน (ปุ่มบนหน้าพิมพ์) ──
export async function replaceWhtCertAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const certId = str(fd, "certId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.wht.manage");
  const cond = Number(str(fd, "whtCondition"));
  const res = await withScreenLegal(screenAck(fd.getAll("ack"), userId), () =>
    replaceWhtCert({ tenantId, systemId }, certId, {
      reason: str(fd, "reason"),
      whtIncomeType: (str(fd, "whtIncomeType") as AccountWhtIncomeType) || null,
      whtCondition: cond === 1 || cond === 2 || cond === 3 || cond === 4 ? cond : null,
      refreshPayee: str(fd, "refreshPayee") === "1",
      actorId: userId,
      ack: screenAck(fd.getAll("ack"), userId),
    }),
  );
  if (!res.ok) redirect(`${wbase(systemId)}/${certId}/print?err=${encodeURIComponent(res.reason)}`);
  revalidatePath(wbase(systemId));
  redirect(`${wbase(systemId)}/${res.certId}/print`);
}

// ── ACC T3.5 ได้รับ 50 ทวิ จากลูกค้าแล้ว / ยกเลิกเครื่องหมาย (หน้า WHT ฝั่งถูกหัก) ──
export async function markWhtReceivedAction(fd: FormData) {
  const systemId = str(fd, "systemId");
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.wht.manage");
  const received = str(fd, "received") !== "0";
  const ids = fd.getAll("certId").map((v) => String(v)).filter(Boolean).slice(0, 200);
  let err = "";
  for (const certId of ids) {
    const r = await markWhtCreditReceived({ tenantId, systemId }, certId, { received, note: str(fd, "note") || null, actorId: userId });
    if (!r.ok) err = r.reason;
  }
  revalidatePath(wbase(systemId));
  const rawBack = str(fd, "back");
  const back = rawBack.startsWith(`${wbase(systemId)}?`) ? rawBack.replace(/[&?](ok|err)=[^&]*/g, "") : `${wbase(systemId)}?tab=credit`;
  const sep = back.includes("?") ? "&" : "?";
  redirect(`${back}${sep}${err ? `err=${encodeURIComponent(err)}` : `ok=${encodeURIComponent(received ? "ทำเครื่องหมายได้รับ 50 ทวิ แล้ว" : "ยกเลิกเครื่องหมายแล้ว")}`}`);
}
