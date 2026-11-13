// ─────────────────────────────────────────────────────────────
// pp30-filing.ts — ฝั่งเขียนของ ภ.พ.30 (ACC T1.3): ทำเครื่องหมายยื่น = เก็บภาพตัวเลขที่ยื่น · แบบยื่นเพิ่มเติม = ผลต่างกับยอดที่ยื่นล่าสุด ·
//   ร้านแก้เครดิตยกมา (เก็บประวัติทุกครั้ง ไม่ลบ)
// ตัวเลขทั้งหมดคิดจากสมุดด้วยตัวคิดเดียวกับหน้าจอ (reports.pp30 → pp30-return) — ไม่เชื่อยอดจากผู้เรียก
// ผลมี `warnings` รูป T0.4 (ไม่มีอะไรต้องกดยืนยัน — ไม่บล็อกด้วยเหตุผลกฎหมาย)
// design note ledger/wo-notes/T1.3.md
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { pp30 } from "./reports";
import { diffPp30Lines, isPp30PeriodKey, pp30HasDiff, type Pp30ExcessChoice, type Pp30LineKey, type Pp30Lines } from "./pp30-shared";
import { safeReason } from "./errors";
import { creditBroughtForwardOf } from "./pp30-return";
import { FILING_AUDIT, filingSnapshot } from "./filing-history";

type Ctx = { tenantId: string; systemId: string };
type Fail = { ok: false; reason: string };

const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * ทำเครื่องหมาย "ยื่น ภ.พ.30 แล้ว" + เก็บทุกช่องจากสมุด ณ ตอนนี้ (ภาพที่ยื่น)
 * `declared` (ไม่บังคับ · ของเดิมของ API/หน้าเก่า) = ยอดภาษีขาย/ซื้อที่ผู้ยื่นแจ้ง → เก็บในคอลัมน์เดิม · ไม่ตรงสมุด = คำเตือน (ไม่ปฏิเสธ)
 */
export async function fileVatReturn(
  ctx: Ctx,
  input: { periodKey: string; userId: string | null; note?: string | null; excessChoice?: Pp30ExcessChoice | null; declared?: { salesVat?: number | null; inputVat?: number | null }; /** ACC T1.7 ▸ ผู้ทำ (REST = API_KEY) — ประวัติแสดง "คีย์ API" ◂ */ actorType?: "USER" | "PLATFORM_USER" | "SYSTEM" | "API_KEY" },
): Promise<({ ok: true; lines: Pp30Lines; warnings: LegalWarning[] }) | Fail> {
  if (!isPp30PeriodKey(input.periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  const db = tenantDb(ctx);
  const existing = await db.accountVatFiling.findFirst({ where: { periodKey: input.periodKey } });
  if (existing && !existing.unmarkedAt) return { ok: false, reason: `งวด ${input.periodKey} ทำเครื่องหมายยื่นไปแล้ว — ถ้ายื่นผิดให้ยื่นแบบเพิ่มเติม` };
  const r = await pp30(ctx, input.periodKey, { excessChoice: input.excessChoice ?? null });
  const lines = r.ret.lines;
  const salesVat = input.declared?.salesVat ?? lines.outputVat;
  const inputVat = input.declared?.inputVat ?? lines.inputVat;
  const warnings: LegalWarning[] = r.ret.warnings.filter((w) => w.code !== "PP30_FILED_DIFFERS");
  if (salesVat !== lines.outputVat || inputVat !== lines.inputVat) {
    warnings.push(legalWarning("PP30_DECLARED_DIFFERS", { declaredOut: baht(salesVat), declaredIn: baht(inputVat), bookOut: baht(lines.outputVat), bookIn: baht(lines.inputVat) }));
  }
  const data = {
    filedById: input.userId,
    salesVatSatang: salesVat,
    inputVatSatang: inputVat,
    payableSatang: salesVat - inputVat,
    note: input.note ?? null,
    lines: lines as unknown as object,
    creditBroughtForwardSatang: lines.creditBroughtForward,
    excessChoice: lines.excessChoice,
    netSatang: lines.netPayable - lines.netExcess,
  };
  try {
    await db.$transaction(async (tx) => {
      // ACC T1.7 ▸ เคยยกเลิกเครื่องหมาย = ใช้แถวเดิม (unique ต่อเดือน) · ภาพตัวเลขเดิมเก็บใน AuditLog ก่อนเขียนทับ ◂
      const row = existing
        ? await tx.accountVatFiling.update({
            where: { id: existing.id },
            data: { ...data, filedAt: new Date(), unmarkedAt: null, unmarkedById: null, unmarkReason: null },
            select: { id: true },
          })
        : await tx.accountVatFiling.create({
            data: { ...data, tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: input.periodKey },
            select: { id: true },
          });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorType: input.actorType ?? "USER",
          actorId: input.userId,
          action: existing ? FILING_AUDIT.vatRefile : FILING_AUDIT.vatMark,
          targetType: "AccountVatFiling",
          targetId: row.id,
          before: existing ? (filingSnapshot(existing) as object) : undefined,
          after: { periodKey: input.periodKey, ...filingSnapshot({ ...data, filedAt: new Date() }) } as object,
        },
      });
    });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกการยื่นไม่สำเร็จ") };
  }
  return { ok: true, lines, warnings };
}

/**
 * แบบยื่นเพิ่มเติมของเดือนที่ยื่นแล้ว — ตัวเลขใหม่จากสมุด + ผลต่างกับยอดที่ยื่นล่าสุด (ต้นฉบับหรือแบบเพิ่มเติมก่อนหน้า)
 * ไม่มีผลต่าง = ปฏิเสธ · ภาษีสุทธิต้องชำระเพิ่ม > 0 = คำเตือนเงินเพิ่ม/เบี้ยปรับ (ระบบไม่คำนวณ)
 */
export async function fileVatAdditional(
  ctx: Ctx,
  input: { periodKey: string; userId: string | null; note?: string | null; excessChoice?: Pp30ExcessChoice | null },
): Promise<({ ok: true; seq: number; lines: Pp30Lines; diff: Record<Pp30LineKey, number>; warnings: LegalWarning[] }) | Fail> {
  if (!isPp30PeriodKey(input.periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  const r = await pp30(ctx, input.periodKey, { excessChoice: input.excessChoice ?? null });
  const st = r.ret.filed;
  if (!st.filed || !st.latest) return { ok: false, reason: `งวด ${input.periodKey} ยังไม่ได้ทำเครื่องหมายยื่น — ยื่นแบบปกติก่อน` };
  const lines = r.ret.lines;
  const diff = diffPp30Lines(lines, st.latest.lines);
  if (!pp30HasDiff(diff)) return { ok: false, reason: "ยอดในสมุดตรงกับที่ยื่นล่าสุดแล้ว — ไม่มีอะไรต้องยื่นเพิ่มเติม" };
  const warnings: LegalWarning[] = r.ret.warnings.filter((w) => w.code !== "PP30_FILED_DIFFERS");
  if (diff.netPayable > 0) warnings.push(legalWarning("PP30_ADDITIONAL_SURCHARGE", { amount: baht(diff.netPayable) }));
  const seq = (st.records.filter((x) => x.kind === "ADDITIONAL").at(-1)?.seq ?? 0) + 1;
  try {
    await tenantDb(ctx).accountVatAdditionalFiling.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        periodKey: input.periodKey,
        seq,
        filedById: input.userId,
        note: input.note ?? null,
        lines: lines as unknown as object,
        diff: diff as unknown as object,
        excessChoice: lines.excessChoice,
        netSatang: lines.netPayable - lines.netExcess,
        diffNetSatang: diff.netPayable - diff.netExcess,
      },
    });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกแบบยื่นเพิ่มเติมไม่สำเร็จ") };
  }
  return { ok: true, seq, lines, diff, warnings };
}

/** ร้านแก้เครดิตยกมาของเดือน (แถวใหม่ทุกครั้ง = ประวัติ) · amountSatang = null → กลับไปใช้ค่าที่ระบบคิด */
export async function setVatCreditCarry(
  ctx: Ctx,
  input: { periodKey: string; amountSatang: number | null; reason: string; userId: string | null },
): Promise<{ ok: true; amountSatang: number; source: string } | Fail> {
  if (!isPp30PeriodKey(input.periodKey)) return { ok: false, reason: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)" };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, reason: "ต้องระบุเหตุผลที่แก้เครดิตยกมา" };
  if (input.amountSatang !== null && (!Number.isInteger(input.amountSatang) || input.amountSatang < 0)) {
    return { ok: false, reason: "เครดิตยกมาต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ" };
  }
  await tenantDb(ctx).accountVatCreditCarry.create({
    data: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: input.periodKey, amountSatang: input.amountSatang, reason: reason.slice(0, 500), setById: input.userId },
  });
  const c = await creditBroughtForwardOf(ctx, input.periodKey);
  return { ok: true, amountSatang: c.amount, source: c.source };
}
