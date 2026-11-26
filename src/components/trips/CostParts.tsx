"use client";
// TRIPS T1.7a1 ▸ ชิ้นส่วนร่วมของเงินระดับรอบ: ตัวจัดรูป % จาก bp (ตัวเดียว) · ป้ายประมาณการ · การ์ดเงินในแผงรอบ (ภาพ 11 :56–:57)
//   🔴 แสดงผลเท่านั้น — ทุกตัวเลขจาก VM (ตัวคิดเดียวที่ costs.ts) · เงินผ่าน formatBaht เท่านั้น · ช่อง null (ไม่มีสิทธิ์ต้นทุน) ไม่แสดง
//   🔴 ทุกจอที่มีตัวเลขมีบรรทัด "ตัวเลขบริหาร" + ป้ายประมาณการ · บรรทัด VAT / คำว่า "ก่อน VAT" ตาม vatShown (Σ VAT ของรอบ > 0 · Q11)
//   🔴 รอบยังไม่มีแถวต้นทุน (noCosts) ⇒ ไม่แสดงกำไร ("—" + ยังไม่หักต้นทุนรอบ · Q2) · ขาดทุน ⇒ คำ "ขาดทุนขั้นต้น" + ยอดไม่มีเครื่องหมาย (Q14)
import { useTranslations } from "next-intl";
import type { DepartureMoneyVM } from "@/lib/modules/trips";
import { formatBaht } from "./trips-shared";

/** bp → "62.50%" (สตริงล้วน · ไม่ผ่านทศนิยมลอย) · null ⇒ "—" */
export function pctText(bp: number | null): string {
  if (bp === null || !Number.isFinite(bp)) return "—";
  const v = Math.trunc(bp);
  const abs = Math.abs(v);
  return `${v < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
}
/** ยอดไม่มีเครื่องหมาย (ข้อความ "ขาดทุนขั้นต้น" บอกทิศเอง · ไม่พึ่งสี) — ตัดเครื่องหมายจากสตริงของ formatBaht */
export function bahtUnsigned(satang: number): string {
  return formatBaht(satang).replace(/^-/, "");
}
/**
 * Q11 (C12 ชนะ N8): ตัวเลขตาม snapshot ของแต่ละการจอง — บรรทัด VAT และคำว่า "ก่อน VAT" แสดงเมื่อ Σ VAT ของรอบ > 0 (ไม่ใช่ตามค่าตั้งปัจจุบัน)
 * ตัวตัดสินตัวเดียวของทุกจอ (VM ตรึงรูปไว้ 29 ช่อง — ไม่เพิ่มธง)
 */
export function vatShown(m: { vatSatang: number }): boolean {
  return m.vatSatang > 0;
}
export const ESTIMATE_PILL = "inline-flex w-fit items-center whitespace-nowrap rounded-md border border-dashed border-[color:var(--color-ink)] px-2 py-0.5 text-sm text-[color:var(--color-ink)]";
export const MGMT_LINE = "text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]";
export const WARN_LINE = "rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]";

/** ข้อความคำเตือนของเงิน (มี n เฉพาะบางรหัส) */
export function useMoneyWarnText() {
  const t = useTranslations("trips");
  return (w: DepartureMoneyVM["warnings"][number]) => t(`costs.warn.${w.code}`, { n: w.n ?? 0 });
}

/** เนื้อการ์ดเงินในแผงรอบ — บรรทัดหลักยอดจอง + บรรทัดรอง (เก็บแทน · ต้นทุน · คอมมิชชัน · กำไรขั้นต้น) + VAT + ป้าย + เรื่องที่ต้องรู้ */
export function CostMoneyCard({ money }: { money: DepartureMoneyVM }) {
  const t = useTranslations("trips");
  const warnText = useMoneyWarnText();
  const m = money;
  const parts: string[] = [];
  if (m.passThroughSatang > 0) parts.push(t("departures.money.detailPt", { amount: formatBaht(m.passThroughSatang) }));
  if (m.costSatang !== null) parts.push(m.noCosts === true ? t("departures.money.noCost") : t("departures.money.detailCost", { amount: formatBaht(m.costSatang) }));
  if (m.commissionCostSatang !== null) parts.push(t("departures.money.detailCommission", { amount: formatBaht(m.commissionCostSatang) }));
  if (m.noCosts === true) parts.push(t("departures.money.detailNoCost"));
  else if (m.grossProfitSatang !== null && m.grossProfitSatang < 0) parts.push(t("departures.money.detailLoss", { amount: bahtUnsigned(m.grossProfitSatang) }));
  else if (m.grossProfitSatang !== null) parts.push(t(vatShown(m) ? "departures.money.detailProfit" : "departures.money.detailProfitNoVat", { amount: formatBaht(m.grossProfitSatang) }));
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <b className="text-base text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{t("departures.money.sales", { amount: formatBaht(m.salesSatang) })}</b>
        <span data-testid="trips-dep-money-estimate" className={ESTIMATE_PILL}>
          {t("departures.money.estimate")}
        </span>
      </div>
      {parts.length ? (
        <p data-testid="trips-dep-money-detail" aria-label={t("departures.money.detail")} className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {parts.join(" · ")}
        </p>
      ) : null}
      {!vatShown(m) ? null : (
        <p data-testid="trips-dep-money-vat" className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {t("departures.money.vat")} <b className="whitespace-nowrap tabular-nums text-[color:var(--color-ink)]">{formatBaht(m.vatSatang)}</b>
        </p>
      )}
      {m.agentCollectBookings > 0 ? (
        <p data-testid="trips-dep-money-agent" className="text-sm text-[color:var(--color-ink-soft)]">
          {t("departures.money.agentCollect", { n: m.agentCollectBookings })}
        </p>
      ) : null}
      {m.pendingRefundBookings > 0 ? (
        <p data-testid="trips-dep-money-pending-refund" className="text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {t("departures.money.pendingRefund", { n: m.pendingRefundBookings, amount: formatBaht(m.heldSatang) })}
        </p>
      ) : null}
      {m.noShowUnpaid > 0 ? (
        <p data-testid="trips-dep-money-noshow" className="text-sm text-[color:var(--color-ink-soft)]">
          {t("departures.money.noShowUnpaid", { n: m.noShowUnpaid })}
        </p>
      ) : null}
      {m.warnings.map((w) => (
        <p key={w.code} role="note" data-testid={`trips-dep-money-warn-${w.code}`} className={WARN_LINE}>
          {warnText(w)}
        </p>
      ))}
      <p data-testid="trips-dep-money-mgmt" className={MGMT_LINE}>
        {t("departures.money.mgmt")}
      </p>
    </>
  );
}
