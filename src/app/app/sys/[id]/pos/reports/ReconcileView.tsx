"use client";

// ReconcileView.tsx — POS P3-SKEL U ▸ CD-SKELU-10: แท็บ "กระทบยอดรับเงิน" ของหน้ารายงาน (08) — ไม่ใช่ ReportKind (แขนงของตัวเองใน ReportsClient)
//   ทีละสาขา (โหมดทุกสาขา = ให้เลือกสาขาก่อน · ร้านสาขาเดียวใช้สาขานั้น) · ช่วง ≤ 92 วัน (เกิน = ข้อความ ไม่เรียกเซิร์ฟเวอร์) ·
//   reconcileReportAction → การ์ดต่อวัน + แถวต่อใบขอรับเงิน (วันที่ · ชนิด · สถานะ · ยืนยันโดย · ยอด · เลขใบเสร็จ · สลิป · ป้ายผล) · CSV = reconcileCsvAction → ดาวน์โหลด
//   PDF ปิดพร้อมเหตุผล · นำเข้า settlement ของ Beam ปิด (รอไฟล์ตัวอย่าง W4) · ไม่มีสิทธิ์ = การ์ดปฏิเสธ
// 🔴 อ่านอย่างเดียว ไม่มีผลเงิน · fact promptpayReconcile คง false · ไม่มีข้อมูลลูกค้า
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { reconcileCsvAction, reconcileReportAction } from "@/lib/modules/pos/platform-ui-actions";
import type { ReconcileDay, ReconcileRow } from "@/lib/modules/pos/payment-reconcile";
import { moneyText } from "@/lib/modules/pos/register-shared";

const DAY_MS = 86_400_000;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const FLAGS = new Set(["REFUND_NEEDED", "LATE", "SALE_REVERSED", "AMOUNT_MISMATCH", "NEEDS_CHECK", "OK"]);
const KINDS = new Set(["PROMPTPAY_STATIC", "PROMPTPAY_BEAM", "CARD_BEAM"]);

type Props = { systemId: string; unitId: string; from: string; to: string; maxDays: number };
type Loaded = { days: ReconcileDay[]; rows: ReconcileRow[] };

export function ReconcileView({ systemId, unitId, from, to, maxDays }: Props) {
  const t = useTranslations("pos.report.reconcile");
  const locale = useLocale();
  const [data, setData] = useState<Loaded | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErr, setCsvErr] = useState(false);
  const rangeBad = !isDate(from) || !isDate(to) || from > to || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1 > maxDays;

  useEffect(() => {
    if (!unitId || rangeBad) return;
    let live = true;
    setLoading(true);
    setCode(null);
    reconcileReportAction({ systemId, unitId, from, to })
      .then((r) => {
        if (!live) return;
        if (r.ok === true) setData({ days: r.days, rows: r.rows });
        else {
          setData(null);
          setCode(r.code);
        }
      })
      .catch(() => live && setCode("UNKNOWN"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [systemId, unitId, from, to, rangeBad, tick]);

  const csv = async () => {
    if (csvBusy || !unitId || rangeBad) return;
    setCsvBusy(true);
    setCsvErr(false);
    try {
      const r = await reconcileCsvAction({ systemId, unitId, from, to });
      if (r.ok !== true) return setCsvErr(true);
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setCsvErr(true);
    } finally {
      setCsvBusy(false);
    }
  };

  const day = (d: string) => new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));
  const card = "card flex min-w-0 flex-col gap-3";
  if (!unitId)
    return (
      <section data-testid="pos-reports-reconcile" data-state="pick-unit" className={card}>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-[color:var(--color-muted)]">{t("pickUnit")}</p>
      </section>
    );
  if (rangeBad)
    return (
      <section data-testid="pos-reports-reconcile" data-state="too-long" className={card}>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p role="alert" className="text-sm text-[color:var(--color-danger)]">
          {t("tooLong")}
        </p>
      </section>
    );
  if (code === "PERMISSION_DENIED")
    return (
      <div role="alert" className="rounded-xl border p-3 text-sm text-[color:var(--color-muted)]" data-testid="pos-reports-reconcile-denied">
        {t("denied")}
      </div>
    );

  // การ์ดต่อวัน: รวมทุกชนิดของวันนั้น
  const byDay = new Map<string, { n: number; amount: number; webhook: number; manual: number; late: number; open: number }>();
  for (const d of data?.days ?? []) {
    const cur = byDay.get(d.date) ?? { n: 0, amount: 0, webhook: 0, manual: 0, late: 0, open: 0 };
    cur.n += d.webhookPaid + d.manualPaid;
    cur.amount += d.amountSatang;
    cur.webhook += d.webhookPaid;
    cur.manual += d.manualPaid;
    cur.late += d.lateWebhook;
    cur.open += d.paidNotConsumed;
    byDay.set(d.date, cur);
  }
  const rows = data?.rows ?? [];
  const dates = [...new Set(rows.map((r) => r.date))].sort().reverse();
  const flagText = (f: string) => (FLAGS.has(f) ? t(`flag.${f}`) : f);
  const kindText = (k: string) => (KINDS.has(k) ? t(`kind.${k}`) : k);
  const statusText = (s: string) => (s === "PAID" || s === "CONSUMED" ? t(`status.${s}`) : s);
  const viaText = (v: string | null) => (v === "WEBHOOK" || v === "MANUAL" ? t(`via.${v}`) : "—");
  const slipText = (s: string | null) => (s === "UPLOADED" || s === "CONFIRMED" || s === "REJECTED" ? t(`slip.${s}`) : t("slip.none"));
  let n = -1;

  return (
    <section data-testid="pos-reports-reconcile" data-state={code ? "error" : loading || !data ? "loading" : "ready"} aria-busy={loading} className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold">{t("title")}</h2>
        <button data-testid="pos-reports-reconcile-csv" type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={csvBusy || loading || !!code} onClick={() => void csv()}>
          {csvBusy ? t("csvBusy") : t("csv")}
        </button>
        <button data-testid="pos-reports-reconcile-pdf" type="button" className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-50" disabled title={t("noPdf")}>
          PDF
        </button>
        <button data-testid="pos-reports-reconcile-settlement" type="button" className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-50" disabled title={t("settlementPending")}>
          {t("settlement")}
        </button>
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">
        {t("note")} · {t("noPdf")} · {t("settlementPending")}
      </p>
      {csvErr && (
        <p role="alert" className="text-sm text-[color:var(--color-danger)]">
          {t("error")}
        </p>
      )}
      {code ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
          <span>{t("error")}</span>
          <button data-testid="pos-reports-reconcile-retry" type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={() => setTick((x) => x + 1)}>
            {t("retry")}
          </button>
        </div>
      ) : loading || !data ? (
        <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p data-testid="pos-reports-reconcile-empty" className="py-6 text-center text-sm text-[color:var(--color-muted)]">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {dates.map((d) => {
            const sum = byDay.get(d);
            return (
              <div key={d} data-testid={`pos-reports-reconcile-day-${d}`} className="flex min-w-0 flex-col gap-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <b className="text-sm">{day(d)}</b>
                  {sum ? <span className="text-sm tabular-nums">{t("dayLine", { n: sum.n, amount: moneyText(sum.amount) })}</span> : null}
                  {sum ? <span className="text-xs text-[color:var(--color-muted)]">{t("dayCounts", { webhook: sum.webhook, manual: sum.manual, late: sum.late, open: sum.open })}</span> : null}
                </div>
                <ul className="flex flex-col divide-y">
                  {rows
                    .filter((r) => r.date === d)
                    .map((r) => {
                      n++;
                      return (
                        <li key={r.intentId} data-testid={`pos-reports-reconcile-row-${n}`} data-flag={r.flag} className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 py-2 text-[13px] sm:grid-cols-[1fr_1fr_1fr_auto]">
                          <span className="min-w-0 truncate">{kindText(r.kind)}</span>
                          <span className="min-w-0 truncate text-[color:var(--color-ink-soft)]">
                            {statusText(r.status)} · {viaText(r.confirmedVia)}
                          </span>
                          <span className="min-w-0 truncate text-[color:var(--color-ink-soft)]">
                            {r.receiptNo ?? "—"} · {slipText(r.slipStatus)}
                          </span>
                          <span className="flex items-center justify-end gap-2 tabular-nums">
                            <b>{moneyText(r.amountSatang)}</b>
                            <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-[7px] border px-2 text-[11.5px] ${r.flag === "OK" ? "text-[color:var(--color-ink-soft)]" : "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"}`}>{flagText(r.flag)}</span>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
