"use server";

// server actions ของหน้าผังบัญชี V2 (WO 6.1 · DESIGN-SPEC-V2 §11.1 · เฟรม f8-chart-of-accounts.png)
// เรียกตรงจาก client component (แบบเดียวกับ saveFinanceAction/FinanceModal) — คืน object ให้ modal
// โชว์ error inline ใต้ช่องโดยข้อมูลที่กรอกไม่หาย (BLUEPRINT §0.3 ข้อ 9)
//
// ทุก action: loadAccountSystem (ผูก tenant) → assertAccountCan → ทำงาน → writeAudit → revalidatePath

import { revalidatePath } from "next/cache";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { createLedgerV2, updateLedgerV2, setLedgerActive, setMapping } from "@/lib/modules/account/coa";
import type { SaveLedgerInput, SaveLedgerResult } from "@/lib/modules/account/coa-v2";

export type LedgerFormPayload = SaveLedgerInput & {
  /** มี = แก้ไข · ไม่มี = เพิ่มใหม่ */
  id?: string;
};

export async function saveLedgerAction(systemId: string, p: LedgerFormPayload): Promise<SaveLedgerResult> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.chart.manage");
  const ctx = { tenantId, systemId };
  const input: SaveLedgerInput = {
    code: p.code,
    name: p.name,
    nameEn: p.nameEn ?? null,
    groupPrefix: p.groupPrefix,
    description: p.description ?? null,
    defaultWhtRateBp: p.defaultWhtRateBp ?? null,
    defaultWhtType: p.defaultWhtType ?? null,
    vatTreatment: p.vatTreatment ?? null,
  };
  const res = p.id ? await updateLedgerV2(ctx, p.id, input) : await createLedgerV2(ctx, input);
  if (res.ok) {
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.chart.manage",
      targetType: "AccountLedger",
      targetId: res.id,
      after: { code: res.code, name: input.name, mode: p.id ? "update" : "create" },
    });
    revalidatePath(`/app/sys/${systemId}/account/accounts`);
  }
  return res;
}

export async function setLedgerActiveAction(
  systemId: string,
  ledgerId: string,
  active: boolean,
): Promise<{ ok: true; active: boolean } | { ok: false; reason: string }> {
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.chart.manage");
  const res = await setLedgerActive({ tenantId, systemId }, ledgerId, active);
  if (res.ok) {
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.chart.manage",
      targetType: "AccountLedger",
      targetId: ledgerId,
      after: { active },
    });
    revalidatePath(`/app/sys/${systemId}/account/accounts`);
  }
  return res;
}

/** ผูกบัญชีอัตโนมัติ (§7.10) — ย้ายมาจากหน้าผังบัญชีเดิม ตอนนี้อยู่หน้า /accounts/mapping */
export async function setMappingFormAction(formData: FormData): Promise<void> {
  const systemId = String(formData.get("systemId") ?? "");
  const { auth, tenantId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.mapping.manage");
  const key = String(formData.get("key") ?? "");
  await setMapping({ tenantId, systemId }, key, String(formData.get("accountId") ?? ""));
  await writeAudit({
    tenantId,
    actorId: auth.user.id,
    action: "account.mapping.manage",
    targetType: "AccountMapping",
    targetId: key,
  });
  revalidatePath(`/app/sys/${systemId}/account/accounts/mapping`);
}
