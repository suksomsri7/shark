// ─────────────────────────────────────────────────────────────
// wht-filing.ts — ACC T3.4 · แบบยื่นเพิ่มเติม ภ.ง.ด. (หลังทำเครื่องหมายนำส่งต้นฉบับ) · design note ledger/wo-notes/T3.4.md
//   รายการปรับ = 50 ทวิ ที่ออก/ยกเลิกลงเดือนนั้นหลังเวลายื่นครั้งล่าสุด (ตัวผลต่างของ T1.7 `pndFiledDifferences`)
//   คำเตือน WHT_ADDITIONAL_FILING [S · ต้องยืนยัน] — skill ไม่พูดตรงเรื่องแบบเพิ่มเติมของ ภ.ง.ด. (เงินเพิ่ม ม.27 [V])
// ─────────────────────────────────────────────────────────────
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { legalAmbient } from "@/lib/core/legal-ambient";
import { isLegalAckRequiredError, legalWarning, type LegalAck, type LegalAckRequired, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { safeReason } from "./errors";
import { legalAckResult, legalGateInTx } from "./legal-gate";
import { pndFiledDifferences, type PndDiffRow } from "./filed-differences";
import { pnd } from "./wht";
import { PND_FORM_LABEL_TH, type PndFormNumber } from "./wht-forms";

type Ctx = { tenantId: string; systemId: string };

export type WhtAdditionalRow = { id: string; seq: number; filedAt: Date; filedById: string | null; totalBaseSatang: number; totalTaxSatang: number; rowCount: number; deltaTaxSatang: number; note: string | null };

export type WhtFilingState = {
  form: PndFormNumber;
  periodKey: string;
  filed: { filedAt: Date; filedById: string | null; totalTaxSatang: number; certCount: number } | null;
  additional: WhtAdditionalRow[];
  /** เวลาที่ยื่นครั้งล่าสุด (ต้นฉบับหรือเพิ่มเติม) */
  latestAt: Date | null;
  /** ยอดภาษีที่ยื่นไปครั้งล่าสุด */
  latestTaxSatang: number | null;
  /** ยอดภาษีของรายงานตอนนี้ */
  currentTaxSatang: number;
  /** รายการปรับทั้งหมดหลังยื่นต้นฉบับ · pending = หลังยื่นครั้งล่าสุด */
  changes: PndDiffRow[];
  pending: PndDiffRow[];
  /** ภาษีที่ต้องยื่นเพิ่ม (+) / ลด (−) จากครั้งล่าสุด */
  deltaTaxSatang: number;
};

const satangTh = (s: number) => `${s < 0 ? "−" : "+"}${(Math.abs(s) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function whtFilingState(ctx: Ctx, form: PndFormNumber, periodKey: string): Promise<WhtFilingState> {
  const [filing, additional, report, diffs] = await Promise.all([
    tenantDb(ctx).accountWhtFiling.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, form, periodKey, unmarkedAt: null }, select: { filedAt: true, filedById: true, totalTaxSatang: true, certCount: true } }),
    tenantDb(ctx).accountWhtAdditionalFiling.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, form, periodKey }, orderBy: { seq: "asc" } }),
    pnd(ctx.tenantId, ctx.systemId, { type: form, period: periodKey }),
    pndFiledDifferences(ctx, periodKey),
  ]);
  const add = filing ? additional.filter((a) => a.filedAt >= filing.filedAt) : [];
  const last = add.at(-1);
  const latestAt = last?.filedAt ?? filing?.filedAt ?? null;
  const latestTaxSatang = last?.totalTaxSatang ?? filing?.totalTaxSatang ?? null;
  const changes = filing ? diffs.rows.filter((r) => r.form === form) : [];
  const pending = latestAt ? changes.filter((r) => r.at > latestAt) : [];
  return {
    form,
    periodKey,
    filed: filing ?? null,
    additional: add.map((a) => ({ id: a.id, seq: a.seq, filedAt: a.filedAt, filedById: a.filedById, totalBaseSatang: a.totalBaseSatang, totalTaxSatang: a.totalTaxSatang, rowCount: a.rowCount, deltaTaxSatang: a.deltaTaxSatang, note: a.note })),
    latestAt,
    latestTaxSatang,
    currentTaxSatang: report.grandWht,
    changes,
    pending,
    deltaTaxSatang: latestTaxSatang == null ? 0 : report.grandWht - latestTaxSatang,
  };
}

export function whtAdditionalWarnings(form: PndFormNumber, periodKey: string, seq: number, delta: number): LegalWarning[] {
  return [legalWarning("WHT_ADDITIONAL_FILING", { form: PND_FORM_LABEL_TH[form], period: periodKey, n: seq, delta: satangTh(delta) })];
}

export type AdditionalResult =
  | { ok: true; id: string; seq: number; deltaTaxSatang: number; totalTaxSatang: number }
  | { ok: false; reason: string; code?: "NOT_FILED" | "NO_CHANGE"; legal?: LegalAckRequired };

/** บันทึกแบบยื่นเพิ่มเติมครั้งถัดไป — ภาพยอดของรายงานตอนนี้ + ผลต่างจากครั้งล่าสุด + รายการปรับ */
export async function recordWhtAdditionalFiling(
  ctx: Ctx,
  input: { form: PndFormNumber; periodKey: string; note?: string | null; actorId?: string | null; actorType?: "USER" | "API_KEY" | "SYSTEM" | "PLATFORM_USER"; ack?: LegalAck | null },
): Promise<AdditionalResult> {
  const ack = input.ack ?? legalAmbient()?.ack ?? null;
  try {
    const st = await whtFilingState(ctx, input.form, input.periodKey);
    if (!st.filed) return { ok: false, code: "NOT_FILED", reason: `${PND_FORM_LABEL_TH[input.form]} เดือนนี้ยังไม่ได้ทำเครื่องหมายนำส่ง — ทำเครื่องหมายนำส่งต้นฉบับก่อน` };
    if (st.pending.length === 0 && st.deltaTaxSatang === 0) return { ok: false, code: "NO_CHANGE", reason: "ไม่มีรายการเปลี่ยนหลังยื่นครั้งล่าสุด — ไม่ต้องยื่นเพิ่มเติม" };
    const report = await pnd(ctx.tenantId, ctx.systemId, { type: input.form, period: input.periodKey });
    return await tenantDb(ctx).$transaction(async (etx) => {
      const tx = etx as unknown as Prisma.TransactionClient;
      await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`acc:wht-add:${ctx.systemId}:${input.form}:${input.periodKey}`}))) l`;
      const prev = await tx.accountWhtAdditionalFiling.aggregate({ where: { systemId: ctx.systemId, form: input.form, periodKey: input.periodKey }, _max: { seq: true } });
      const seq = (prev._max.seq ?? 0) + 1;
      const created = await tx.accountWhtAdditionalFiling.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          form: input.form,
          periodKey: input.periodKey,
          seq,
          filedById: input.actorId ?? ack?.actorId ?? null,
          totalBaseSatang: report.grandBase,
          totalTaxSatang: report.grandWht,
          rowCount: report.rows.length,
          deltaTaxSatang: st.deltaTaxSatang,
          changes: st.pending.map((r) => ({ certId: r.certId, certNo: r.certNo, change: r.change, at: r.at.toISOString(), whtDelta: r.whtDelta })) as object,
          note: (input.note ?? "").trim().slice(0, 200) || null,
        },
        select: { id: true },
      });
      await legalGateInTx(tx, ctx.tenantId, whtAdditionalWarnings(input.form, input.periodKey, seq, st.deltaTaxSatang), ack, { op: "account.wht.filing.additional", targetType: "AccountWhtAdditionalFiling", targetId: created.id });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: input.actorType ?? ack?.actorType ?? "USER",
          actorId: input.actorId ?? ack?.actorId ?? null,
          action: "account.wht-filing.additional",
          targetType: "AccountWhtAdditionalFiling",
          targetId: created.id,
          after: { form: input.form, periodKey: input.periodKey, seq, totalTaxSatang: report.grandWht, deltaTaxSatang: st.deltaTaxSatang, changes: st.pending.length } as object,
        },
      });
      return { ok: true as const, id: created.id, seq, deltaTaxSatang: st.deltaTaxSatang, totalTaxSatang: report.grandWht };
    });
  } catch (e) {
    if (isLegalAckRequiredError(e)) return legalAckResult(e);
    return { ok: false, reason: safeReason(e, "บันทึกแบบยื่นเพิ่มเติมไม่สำเร็จ") };
  }
}
