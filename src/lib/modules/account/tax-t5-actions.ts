"use server";

// tax-t5-actions.ts — server actions ของจอ ACC T5 (เลน 2): รหัสอากรแสตมป์ · ธงบวกกลับ · ตัดหนี้สูญ · ค่าเผื่อหนี้สงสัยจะสูญ
//   ตัวคิดเดียวกับ REST (tax-checks · tax-add-back · bad-debt) · สิทธิ์ตรงกับ op ของ REST
import { revalidatePath } from "next/cache";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { loadAccountSystem } from "./guard";
import { assertAccountCan } from "./access";
import { safeReason } from "./errors";
import { setDoubtfulAllowance, writeOffBadDebt, writeOffWarnings } from "./bad-debt";
import { setTaxAddBack } from "./tax-add-back";
import { setStampDutyRef } from "./tax-checks";

type Res = { ok: true; warnings?: LegalWarning[] } | { ok: false; reason: string; warnings?: LegalWarning[] };
const sid = (v: unknown) => String(v ?? "").slice(0, 40);
const bkkNoon = (ymd: unknown) => (typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(`${ymd}T12:00:00+07:00`) : undefined);

export async function setStampDutyRefAction(systemId: string, documentId: string, ref: string | null): Promise<Res> {
  try {
    const { auth, tenantId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.doc.create");
    const r = await setStampDutyRef({ tenantId, systemId: sid(systemId) }, sid(documentId), typeof ref === "string" ? ref.slice(0, 80) : null);
    if (!r.ok) return r;
    revalidatePath(`/app/sys/${sid(systemId)}/account/tax/calendar`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกรหัสอากรแสตมป์ไม่สำเร็จ") };
  }
}

export async function setTaxAddBackAction(systemId: string, ledgerId: string, section: string | null): Promise<Res> {
  try {
    const { auth, tenantId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.chart.manage");
    const r = await setTaxAddBack({ tenantId, systemId: sid(systemId) }, sid(ledgerId), typeof section === "string" ? section.slice(0, 20) : null);
    if (!r.ok) return r;
    revalidatePath(`/app/sys/${sid(systemId)}/account/reports/tax-add-back`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกธงบวกกลับไม่สำเร็จ") };
  }
}

/** ดูคำเตือนก่อนตัดหนี้สูญ (ฟอร์มแสดง + ช่องยืนยัน) */
export async function previewWriteOffAction(systemId: string, documentId: string, amountSatang: number | null, ymd: string): Promise<Res & { amount?: number; outstanding?: number }> {
  try {
    const { auth, tenantId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.journal.adjust");
    const r = await writeOffWarnings({ tenantId, systemId: sid(systemId) }, sid(documentId), typeof amountSatang === "number" ? amountSatang : null, bkkNoon(ymd) ?? new Date());
    if ("reason" in r) return { ok: false, reason: r.reason };
    return { ok: true, warnings: r.warnings, amount: r.amount, outstanding: r.outstanding };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านคำเตือนไม่สำเร็จ") };
  }
}

export async function writeOffBadDebtAction(systemId: string, input: { documentId: string; amountSatang: number | null; date: string; note: string; ack: string[] }): Promise<Res> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.journal.adjust");
    const r = await writeOffBadDebt(
      { tenantId, systemId: sid(systemId) },
      {
        documentId: sid(input.documentId),
        amount: typeof input.amountSatang === "number" ? input.amountSatang : null,
        date: bkkNoon(input.date),
        note: String(input.note ?? "").slice(0, 300),
        createdById: userId,
        ack: { codes: Array.isArray(input.ack) ? input.ack.map(String).slice(0, 10) : [], actorId: userId, actorType: "USER", via: "screen" },
      },
    );
    if (!r.ok) return { ok: false, reason: r.reason, warnings: r.legal?.warnings };
    revalidatePath(`/app/sys/${sid(systemId)}/account/aging/bad-debt`);
    return { ok: true, warnings: r.warnings };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตัดหนี้สูญไม่สำเร็จ") };
  }
}

export async function setDoubtfulAllowanceAction(systemId: string, input: { targetSatang: number; date: string; note: string }): Promise<Res> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.journal.adjust");
    const r = await setDoubtfulAllowance({ tenantId, systemId: sid(systemId) }, { target: Math.round(Number(input.targetSatang)), date: bkkNoon(input.date), note: String(input.note ?? "").slice(0, 300), postedById: userId });
    if (!r.ok) return r;
    revalidatePath(`/app/sys/${sid(systemId)}/account/aging/bad-debt`);
    return { ok: true, warnings: r.warnings };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตั้งค่าเผื่อไม่สำเร็จ") };
  }
}
