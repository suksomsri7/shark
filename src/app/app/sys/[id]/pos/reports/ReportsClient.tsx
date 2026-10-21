"use client";

// ReportsClient.tsx — POS P1.17 U จอรายงาน 7 ชุด (ภาพ 08 บางส่วน): แท็บชนิด · ช่วงวันที่ · สาขา · ตาราง + แถวรวม · CSV · กราฟแท่งรายวัน
// 🔴 เงินเป็นสตางค์ Int จากเซิร์ฟเวอร์ — จอแค่จัดรูป (MoneyText ทศนิยม 2 ตำแหน่ง) ไม่คำนวณยอดเอง
// 🔴 คำปฏิเสธแสดงด้วยคีย์ pos.report.errors.* ตามรหัส (ไม่แสดง message ไทยของเซิร์ฟเวอร์ · ไม่แสดงรหัสดิบ)
// 🔴 CSV: เนื้อไฟล์มี BOM มาจากเซิร์ฟเวอร์แล้ว — ห้ามเติมซ้ำ
// สถานะอยู่ใน URL (?kind=&from=&to=&unit=) ผ่าน history.replaceState — ไม่โหลดหน้าใหม่
// R4 (ภาพ 08): kind=overview (ค่าเริ่ม) = แดชบอร์ด ReportsOverview · หัวหน้า (ชื่อ · ช่วงวันที่ · สาขา · ข้อมูลถึง/เทียบกับ · ส่งออก CSV) ใช้ร่วมทุกชนิด
// POS P2.11U ▸ มติ 7: ชนิด "channels" (ช่องทางการขาย) = ตาราง ช่องทาง · บิล · ยอดสุทธิ (ยอดขาย − คืน) · ค่าคอมมิชชัน (+ VAT ค่าคอมฯ) · กำไรขั้นต้น (net ของเซิร์ฟเวอร์) · % +
//   แถวรวม · CSV ปุ่มเดิม (posReportCsvAction kind channels) · ตัวเลือกสาขาเดิม (P1.17) ใช้เหมือนชนิดอื่น ◂
// POS P2.12U ▸ แท็บใหม่ต่อท้าย (testid pos-reports-tab-<kind>): "รายชั่วโมง" (มติ 2 · ตาราง 24 ชั่วโมง + แถวรวม + CSV · ช่วงเกิน HOURLY_MAX_DAYS = แท็บปิด +
//   ข้อความ "เลือกช่วงไม่เกิน 31 วัน" ไม่เรียกเซิร์ฟเวอร์) · "เปรียบเทียบสาขา" (มติ 3 · เห็น ≥ 2 สาขา · ตาราง 13 คอลัมน์ + แถวรวมจาก totals
//   (ตัวหนาเพราะเป็นแถวรวม ไม่ใช่เพราะข้อความ) + CSV · กำไรอยู่การ์ดภาพรวม) · "จุดผิดปกติของพนักงาน" (มติ 4 · เฉพาะผู้มี pos.report.anomaly ที่สาขาใดสาขาหนึ่ง —
//   หน้าบอก canAnomaly · กลุ่มกฎ A1–A10 ตามลำดับ ป้าย pos.report.anomaly.rules.* · ค่า: เงิน A1 A2 A8 A9 (A8 + คำ ขาด/เกิน จาก totals.a8SignedSatang) ·
//   % A3 A4 (bp) · จำนวนที่เหลือ · สาขา = totals.unitNames[unitId] ?? unitId · ว่าง = anomaly.empty · ไม่มีคีย์ = การ์ด anomaly.denied ·
//   ถูกตัดแถว (totals.rowCount > rows.length) = บรรทัดแจ้ง) — ตัวเลขทั้งหมดจาก DTO ◂
// POS P3.5U ▸ มติ 8: แท็บ "ค่าคอมฯ พนักงาน" (pos-reports-tab-commission) ต่อท้าย — เฉพาะเมื่อหน้าส่ง canPayroll (canViewPayroll) · ไม่มี = ไม่มีแท็บ และ
//   ?kind=commission = การ์ดปฏิเสธ report.commission.denied (ไม่เรียกเซิร์ฟเวอร์ · CSV/PDF ปิด) · ตาราง report.commission.cols ต่อผู้ขาย + แถวรวมจาก totals ·
//   ชิป "ยังไม่ผูกพนักงาน HR" · สถานะใน HR · CSV/PDF ปุ่มเดิม (P2.12U) · ตัวเลขค่าคอมฯ มีที่นี่ที่เดียว ◂

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MoneyText } from "@/components/ui/MoneyText";
import { DATE_OVERLAY_INPUT, DateOverlay, openDatePicker } from "@/components/pos/DateOverlay";
import { formatBaht } from "@/lib/ui/money";
import { posReportAction, posReportCsvAction } from "@/lib/modules/pos/report-actions";
import { bkkHm, Icon, prevRangeOf, rangeLabel, ReportsOverview } from "./ReportsOverview";
import { channelDisplayName } from "@/components/pos/settings/channel-text"; // POS P2.11U ◂
// POS P3.8U ▸ CD-P38U-7: ปุ่ม "สร้างงานในบอร์ด" + ชิปการ์ดของแถวจุดผิดปกติ (กุญแจ posBoardKeys.anomaly · ตัวอ่านชิป posBoardCardsAction) ◂
import { createAnomalyCardAction } from "@/lib/pos-board-actions";
import { posBoardCardsAction } from "@/lib/pos-board-ui-actions";
import { posBoardKeys } from "@/lib/modules/pos/board-settings-shared";
import type {
  AnyReportResult,
  ChannelRow, // POS P2.11U ◂
  CommissionRow, // POS P3.5U ◂
  CommissionTotals, // POS P3.5U ◂
  ChannelTotals, // POS P2.11U ◂
  AnomalyRow, // POS P2.12U ◂
  AnomalyTotals, // POS P2.12U ◂
  BranchRow, // POS P2.12U ◂
  BranchTotals, // POS P2.12U ◂
  HourlyRow, // POS P2.12U ◂
  HourlyTotals, // POS P2.12U ◂
  DailyRow,
  DailyTotals,
  MarginRow,
  MarginTotals,
  PaymentRow,
  PaymentTotals,
  ProductRow,
  ProductTotals,
  Report,
  ReportKind,
  ShiftRow,
  ShiftTotals,
  StaffRow,
  StaffTotals,
  TaxRow,
  TaxTotals,
} from "@/lib/modules/pos/reports";

type Unit = { id: string; name: string };
/** R4 — "overview" = แดชบอร์ดภาพ 08 (ไม่ใช่ชนิดรายงานของเซิร์ฟเวอร์ · CSV ของภาพรวม = daily) */
export type ViewKind = ReportKind | "overview";
type View = { kind: ViewKind; from: string; to: string; unitId: string };
type Props = {
  systemId: string;
  units: Unit[];
  initial: View;
  today: string;
  maxDays: number;
  /** POS P2.12U ▸ มติ 2: HOURLY_MAX_DAYS ของเซิร์ฟเวอร์ (ส่งจากหน้า — client ไม่ import reports.ts) · เวลาตัดวัน (นาที) ของระบบ ◂ */
  hourlyMaxDays: number;
  cutoffMinutes: number;
  /** POS P2.12U ▸ มติ 4: ผู้ใช้มี pos.report.anomaly ที่สาขาใดสาขาหนึ่ง (ไม่มี = ไม่มีแท็บ "จุดผิดปกติ") ◂ */
  canAnomaly: boolean;
  /** POS P2.12U ▸ มติ 5: เกณฑ์ A3 (bp) ของระบบจาก posAnomalyThresholds ฝั่งเซิร์ฟเวอร์ · ปิดการตรวจ = null (ไม่มีป้าย) ◂ */
  discountFlagBp: number | null;
  /** POS P3.5U ▸ มติ 8: ผู้ดูเงินเดือน (canViewPayroll ฝั่งหน้า) — ไม่มี = ไม่มีแท็บค่าคอมฯ ◂ */
  canPayroll?: boolean;
  /** POS P3.8U ▸ CD-P38U-7/8: บอร์ดงานของหน้าขายเปิด (posBoardSettings(sys.settings).enabled ฝั่งหน้า) — ปิด = ไม่มีปุ่ม/ชิปการ์ด ◂ */
  boardOn?: boolean;
};
type T = (key: string, values?: Record<string, string | number>) => string;
type Loaded = Exclude<AnyReportResult, { ok: false }>["report"];

/** ลำดับแท็บตามสเปก: overview (R4) · daily · products · staff · payments · margin · shifts · tax */
const KINDS: readonly ViewKind[] = ["overview", "daily", "products", "staff", "payments", "margin", "shifts", "tax", "channels"]; // POS P2.11U ▸ มติ 7: + channels ◂
/** POS P2.12U ▸ แท็บใหม่ (ต่อท้าย · testid pos-reports-tab-<kind>) ◂ */
type NewKind = "branches" | "hourly" | "anomalies" | "commission"; // POS P3.5U ▸ + commission ◂
/** ไอคอนจากภาพ 08 (ปฏิทิน · ร้าน · ส่งออก) */
const I_CAL = ["M6 5h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 6 5Z", "M3.5 10h17M8 3v4M16 3v4"] as const;
const I_SHOP = ["M4 9V4h16v5", "M3 9h18l-1.4 11a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z", "M9.5 13h5"] as const;
const I_OUT = ["M12 20V7", "m6.5 12.5 5.5-5.5 5.5 5.5", "M4 3h16"] as const;
const I_FILE = ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z", "M14 3v5h5"] as const; // POS P2.12U ▸ ไอคอนเอกสาร (ภาพ 08 ปุ่ม PDF) ◂
const DAY_MS = 86_400_000;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const spanDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
/** รหัสปฏิเสธ → คีย์ใต้ pos.report (INTERNAL/อื่น ๆ = unknown) */
const REFUSAL_KEY: Record<string, string> = { VALIDATION: "errors.validation", NOT_FOUND: "errors.notFound", PERMISSION_DENIED: "errors.permissionDenied" };
const refusalKey = (code: string) => (Object.prototype.hasOwnProperty.call(REFUSAL_KEY, code) ? REFUSAL_KEY[code]! : "errors.unknown");
const METHOD_KEYS = new Set(["CASH", "CARD", "PROMPTPAY", "TRANSFER", "DEPOSIT", "ROOM_CHARGE", "GIFT_CARD", "STORE_CREDIT"]); // POS P2.9 ▸ R1 ◂
/** เวลาไทยสั้น ๆ (วัน/เดือน ชม:นาที) */
const bkkTime = (iso: string | null, locale: string) =>
  iso ? new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
/** YYYY-MM-DD → วันที่สั้นตามภาษาจอ (ไม่เลื่อนวัน: ตีความเป็น UTC เที่ยงวัน) */
const shortDate = (d: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
// POS P2.14 ▸ U2 O-8: YYYY-MM-DD → วันที่ตามภาษาจอพร้อมปี (th = พ.ศ. · ไม่เลื่อนวัน) — ช่วงของรายงานและช่องวันที่ในตาราง ◂
const dayDate = (d: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const HR_STATUS_KEYS = new Set(["PENDING", "APPROVED", "REJECTED", "IN_RUN"]); // POS P3.5U ▸ สถานะใน HR ที่มีป้าย (report.commission.hrStatus.*) ◂
const pct = (bp: number | null) => (bp === null ? "—" : `${(bp / 100).toFixed(2)}%`);

// ═══════════ ตารางกลาง ═══════════
type Col<R> = { key: string; header: string; num?: boolean; cell: (r: R) => React.ReactNode };

function Table<R>({ cols, rows, rowKey, total, minWidth, testId }: { cols: Col<R>[]; rows: R[]; rowKey: (r: R, i: number) => string; total?: React.ReactNode[]; minWidth: number; testId: string }) {
  return (
    <div className="relative w-full min-w-0 overflow-x-auto" data-testid={testId /* POS P2.12U ▸ fix1 F6: relative = กล่องอ้างอิงของลูก absolute (sr-only) ให้ถูกตัดในกรอบเลื่อน ไม่ดันความกว้างหน้า ◂ */}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap border-b px-3 pb-2 text-xs font-medium text-[color:var(--color-muted)] ${c.num ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => (
                <td key={c.key} className={`border-b border-[color:var(--color-line)] px-3 py-2 ${c.num ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="bg-[color:var(--color-surface-2)] font-semibold" data-testid={`${testId}-total`}>
              {total.map((v, i) => (
                <td key={cols[i]?.key ?? i} className={`px-3 py-2 ${cols[i]?.num ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const M = (v: number | null | undefined) => (v === null || v === undefined ? "—" : <MoneyText satang={v} decimals />);

// ═══════════ กราฟแท่งรายวัน (CSS ล้วน · ไม่มีไลบรารีกราฟ) ═══════════
function DailyChart({ rows, t, locale }: { rows: DailyRow[]; t: T; locale: string }) {
  const max = Math.max(0, ...rows.map((r) => r.netSalesSatang));
  // ป้ายแกน X: วันแรก · กลาง · สุดท้าย (ไม่ล้นจอแคบแม้ 92 แท่ง)
  const ticks = rows.length <= 2 ? rows : [rows[0]!, rows[Math.floor((rows.length - 1) / 2)]!, rows[rows.length - 1]!];
  return (
    <div className="flex flex-col gap-2" data-testid="pos-report-chart">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t("chartTitle")}</h2>
        <span className="text-xs text-[color:var(--color-muted)] tabular-nums">{formatBaht(max)}</span>
      </div>
      {/* R2 (ภาพจริง): แท่งกว้างสุด 64px + ช่องว่าง — ช่วง 1–3 วันเคยเป็นก้อนดำเต็มกรอบ · ≤ 14 แท่งโชว์ตัวเลขบนหัวแท่งเหมือนภาพ 08 */}
      <div className={`flex h-40 items-end gap-1 border-b border-[color:var(--color-line)] ${rows.length <= 14 ? "gap-2" : "gap-px"}`} role="img" aria-label={t("chartTitle")}>
        {rows.map((r) => (
          <div key={r.businessDate} className="flex h-full min-w-0 max-w-16 flex-1 flex-col items-center justify-end" title={`${shortDate(r.businessDate, locale)} · ${formatBaht(r.netSalesSatang, { decimals: true })}`}>
            {rows.length <= 14 && r.netSalesSatang > 0 ? <span className="mb-1 text-[10px] font-semibold tabular-nums">{formatBaht(r.netSalesSatang)}</span> : null}
            <div className="w-full rounded-t-sm bg-[color:var(--color-ink)]" style={{ height: max > 0 ? `${Math.max(2, (r.netSalesSatang / max) * (rows.length <= 14 ? 80 : 100))}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-2 text-[10px] text-[color:var(--color-muted)] tabular-nums">
        {ticks.map((r) => (
          <span key={r.businessDate} className="whitespace-nowrap">
            {shortDate(r.businessDate, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ═══════════ POS P2.12U ▸ มติ 4: จุดผิดปกติ — กลุ่มต่อกฎ (A1 → A10) ◂ ═══════════
const ANOMALY_RULES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as const; // POS P3.9 ▸ R11: + A11 ◂
const ANOMALY_MONEY = new Set<string>(["A1", "A2", "A8", "A9"]);
const ANOMALY_BP = new Set<string>(["A3", "A4"]);
const bpText = (bp: number) => `${(bp / 100).toFixed(2)}%`;
function AnomalyBody({ rep, t, systemId, locale = "th", boardOn = false }: { rep: Report<"anomalies", AnomalyRow, AnomalyTotals>; t: T; systemId: string; /** POS P2.14 ▸ U2 O-8 ◂ */ locale?: string; /** POS P3.8U ▸ CD-P38U-7: settings.pos.board.enabled (หน้าอ่านด้วยตัวอ่านบริสุทธิ์) ◂ */ boardOn?: boolean }) {
  const tt = rep.totals;
  // POS P3.8U ▸ CD-P38U-7: วันของแถว = businessDate ของแถว ?? (ช่วงวันเดียว = วันนั้น) · ไม่มี = ปุ่มปิด toCard.oneDay ·
  //   ตอนโหลด (boardOn) อ่านชิปครั้งเดียวด้วย posBoardCardsAction · กดแล้ว = ผลของแถวนั้น (ไม่มีวนถาม · ไม่มีชื่อคนในชิป) ◂
  const cardDate = (r: AnomalyRow) => r.businessDate ?? (rep.from === rep.to ? rep.from : null);
  const cardKey = (r: AnomalyRow) => {
    const d = cardDate(r);
    return d ? posBoardKeys.anomaly(r.rule, r.unitId, d, r.refId ?? r.userId ?? "unit") : null;
  };
  const keyList = boardOn ? [...new Set(rep.rows.map(cardKey).filter((k): k is string => !!k))] : [];
  const keysSig = keyList.join("|");
  const [cards, setCards] = useState<Record<string, { cardNo: number | null; href: string; completed: boolean }>>({});
  const [rowCard, setRowCard] = useState<Record<number, { busy?: boolean; reason?: string; retry?: boolean; cardNo?: number | null; created?: boolean; href?: string }>>({});
  useEffect(() => {
    if (!boardOn || !keysSig) return;
    let live = true;
    void posBoardCardsAction({ systemId, keys: keysSig.split("|") })
      .then((res) => {
        if (live && res.ok) setCards(Object.fromEntries(res.cards.map((c) => [c.key, { cardNo: c.cardNo, href: c.href, completed: c.completed }])));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [boardOn, systemId, keysSig]);
  const pressCard = async (n: number, r: AnomalyRow) => {
    const d = cardDate(r);
    if (!d || rowCard[n]?.busy) return;
    setRowCard((x) => ({ ...x, [n]: { busy: true } }));
    try {
      const res = await createAnomalyCardAction({ systemId, row: { unitId: r.unitId, rule: r.rule, businessDate: d, refType: r.refType, refId: r.refId } });
      if (res.ok) {
        const k = cardKey(r);
        const got = k ? await posBoardCardsAction({ systemId, keys: [k] }).catch(() => null) : null;
        const href = got && got.ok ? got.cards.find((c) => c.key === k)?.href : undefined;
        setRowCard((x) => ({ ...x, [n]: { cardNo: res.cardNo, created: res.created, ...(href ? { href } : {}) } }));
      } else {
        const reason = res.code === "PERMISSION_DENIED" ? "denied" : res.code === "NO_BOARD" ? "noBoard" : res.code === "NOT_FOUND" ? "stale" : "failed";
        setRowCard((x) => ({ ...x, [n]: { reason, retry: res.code === "UNKNOWN" } }));
      }
    } catch {
      setRowCard((x) => ({ ...x, [n]: { reason: "failed", retry: true } }));
    }
  };
  const cardCell = (r: AnomalyRow, n: number) => {
    if (!boardOn) return null;
    const k = cardKey(r);
    const have = k ? cards[k] : undefined;
    const st = rowCard[n];
    const chipCls = "inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-[color:var(--color-accent)] hover:underline";
    if (have && !st?.cardNo)
      return (
        <a data-testid={`pos-reports-anomaly-card-chip-${n}`} href={have.href} className={chipCls}>
          {have.completed ? t("anomaly.toCard.chipDone", { n: have.cardNo ?? 0 }) : t("anomaly.toCard.chip", { n: have.cardNo ?? 0 })}
        </a>
      );
    if (st && st.cardNo !== undefined) {
      const text = st.created ? t("anomaly.toCard.created", { n: st.cardNo ?? 0 }) : t("anomaly.toCard.exists", { n: st.cardNo ?? 0 });
      return st.href ? (
        <a data-testid={`pos-reports-anomaly-card-chip-${n}`} href={st.href} className={chipCls}>
          {text}
        </a>
      ) : (
        <span data-testid={`pos-reports-anomaly-card-done-${n}`} role="status" className="inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-[color:var(--color-ink-soft)]">
          {text}
        </span>
      );
    }
    const noDay = cardDate(r) === null;
    const reason = noDay ? "oneDay" : st?.reason;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <button
          data-testid={`pos-reports-anomaly-card-${n}`}
          type="button"
          className="btn btn-ghost min-h-[44px] whitespace-nowrap px-3 text-[13px] disabled:opacity-50"
          disabled={noDay || !!st?.busy || (!!st?.reason && !st.retry)}
          onClick={() => void pressCard(n, r)}
        >
          {st?.busy ? t("anomaly.toCard.creating") : t("anomaly.toCard.create")}
        </button>
        {reason ? (
          <span data-testid={`pos-reports-anomaly-card-reason-${n}`} className="whitespace-normal text-[12px] text-[color:var(--color-muted)]">
            {t(`anomaly.toCard.${reason}`)}
          </span>
        ) : null}
      </span>
    );
  };
  // ◂ POS P3.8U
  if (rep.rows.length === 0) return <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-empty">{t("anomaly.empty")}</p>;
  const index = new Map(rep.rows.map((r, i) => [r, i]));
  const unitName = (id: string) => tt.unitNames?.[id] ?? id;
  const valueCell = (r: AnomalyRow) => {
    if (r.rule === "A8") {
      const signed = r.refId ? tt.a8SignedSatang?.[r.refId] : undefined;
      if (signed === undefined || signed === 0) return M(r.value);
      return (
        <span className={signed < 0 ? "text-[color:var(--color-danger)]" : undefined}>
          {`${signed < 0 ? t("anomaly.short") : t("anomaly.over")} ${signed < 0 ? "\u2212" : "+"}`}
          <MoneyText satang={Math.abs(signed)} decimals />
        </span>
      );
    }
    return ANOMALY_MONEY.has(r.rule) ? M(r.value) : ANOMALY_BP.has(r.rule) ? bpText(r.value) : r.value.toLocaleString("th-TH");
  };
  const thresholdText = (rule: string, th: Record<string, number>) =>
    Object.entries(th)
      .map(([f, v]) => (f === "satang" ? `\u2265 ${formatBaht(v, { decimals: true })}` : f === "bp" ? `${rule === "A3" ? ">" : "\u2265"} ${bpText(v)}` : `\u2265 ${v.toLocaleString("th-TH")}`))
      .join(` ${t("anomaly.or")} `);
  const groups = ANOMALY_RULES.map((rule) => ({ rule, rows: rep.rows.filter((r) => r.rule === rule) })).filter((g) => g.rows.length > 0);
  const ac = (k: string) => t(`anomaly.cols.${k}`);
  const TH = "whitespace-nowrap border-b px-3 pb-2 text-left text-xs font-medium text-[color:var(--color-muted)]";
  const TD = "border-b border-[color:var(--color-line)] px-3 py-2 align-top";
  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="pos-reports-anomalies">
      {groups.map((g) => (
        <section key={g.rule} className="flex min-w-0 flex-col gap-2" data-testid={`pos-reports-anomaly-group-${g.rule}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">
              <span className="mr-1.5 rounded-md border px-1.5 py-0.5 text-xs tabular-nums text-[color:var(--color-ink-soft)]">{g.rule}</span>
              {t(`anomaly.rules.${g.rule}`)}
            </h3>
            <span className="text-xs text-[color:var(--color-muted)] tabular-nums">{t("anomaly.groupCount", { n: tt.byRule?.[g.rule] ?? g.rows.length })}</span>
            <span className="text-xs text-[color:var(--color-muted)] tabular-nums">{t("anomaly.threshold", { text: thresholdText(g.rule, g.rows[0]!.threshold) })}</span>
          </div>
          {/* POS P2.12U ▸ fix1 F6 (390): ต้นเหตุล้น = <span sr-only> (absolute) ในหัวคอลัมน์สุดท้ายอ้างกล่องนอกกรอบเลื่อน ⇒ ไม่ถูกตัด ดัน html กว้าง 583 px · relative บนกรอบเลื่อน = ถูกตัด/เลื่อนในตาราง ◂ */}
          <div className="relative w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className={TH}>{ac("unit")}</th>
                  <th scope="col" className={TH}>{ac("date")}</th>
                  <th scope="col" className={TH}>{ac("staff")}</th>
                  <th scope="col" className={`${TH} text-right`}>{ac("value")}</th>
                  <th scope="col" className={`${TH} text-right`}>{ac("count")}</th>
                  <th scope="col" className={TH}><span className="sr-only">{ac("ref")}</span></th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => {
                  const n = index.get(r)!;
                  return (
                    <tr key={n} data-testid={`pos-reports-anomaly-row-${n}`}>
                      <td className={TD}>{unitName(r.unitId)}</td>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{r.businessDate ? dayDate(r.businessDate, locale) : t("anomaly.wholeRange") /* POS P2.14 ▸ U2 O-8 ◂ */}</td>
                      <td className={TD}>{r.userId === null ? "\u2014" : (r.userName ?? <span className="text-[color:var(--color-muted)]">{t("anomaly.unnamed")}</span>)}</td>
                      <td className={`${TD} whitespace-nowrap text-right font-semibold tabular-nums`}>{valueCell(r)}</td>
                      <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{r.count.toLocaleString("th-TH")}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {r.refType === "PosSale" && r.refId ? (
                          <a data-testid={`pos-reports-anomaly-bill-${n}`} href={`/app/sys/${systemId}/pos/sales?${new URLSearchParams({ unit: r.unitId, bill: r.refId }).toString()}`} className="inline-flex min-h-[44px] items-center px-1 text-[13px] font-semibold text-[color:var(--color-accent)] hover:underline">
                            {t("anomaly.viewBill")}
                          </a>
                        ) : null}
                        {cardCell(r, n) /* POS P3.8U ▸ CD-P38U-7 ◂ */}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {tt.rowCount > rep.rows.length ? (
        <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-reports-anomaly-notice">
          {t("rowLimit", { shown: rep.rows.length, total: tt.rowCount })}
        </p>
      ) : null}
    </div>
  );
}

// ═══════════ ตารางต่อชนิด (คอลัมน์ตามลำดับ R5–R10) ═══════════
function ReportBody({ rep, t, tc, locale, cutoffMinutes, systemId, boardOn = false /* POS P3.8U ▸ CD-P38U-7 ◂ */ }: { rep: Loaded; t: T; tc: T; locale: string; cutoffMinutes: number; systemId: string; boardOn?: boolean }) {
  const tch = useTranslations("pos.channel"); // POS P2.11U ◂
  const c = (k: string) => t(`cols.${k}`);
  const empty = <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-empty">{t("empty")}</p>;
  const limited = (shown: number, total: number) =>
    shown < total ? <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-row-limit">{t("rowLimit", { shown, total })}</p> : null;

  switch (rep.kind) {
    case "daily": {
      const x = rep as Report<"daily", DailyRow, DailyTotals>;
      if (x.totals.billCount === 0 && x.totals.voidCount === 0) return empty;
      const cols: Col<DailyRow>[] = [
        { key: "date", header: c("date"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{dayDate(r.businessDate, locale) /* POS P2.14 ▸ U2 O-8 ◂ */}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("gross"), num: true, cell: (r) => M(r.grossSatang) },
        { key: "discount", header: c("discount"), num: true, cell: (r) => M(r.discountSatang) },
        { key: "service", header: c("serviceCharge"), num: true, cell: (r) => M(r.serviceChargeSatang) },
        { key: "net", header: c("netSales"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "vat", header: c("vat"), num: true, cell: (r) => M(r.vatSatang) },
        { key: "exvat", header: c("netExVat"), num: true, cell: (r) => M(r.netExVatSatang) },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidTotal", header: c("voidTotal"), num: true, cell: (r) => M(r.voidTotalSatang) },
        { key: "avg", header: c("avgBill"), num: true, cell: (r) => M(r.avgBillSatang) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-4">
          <DailyChart rows={x.rows} t={t} locale={locale} />
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.businessDate}
            minWidth={1080}
            total={[t("total"), tt.billCount, M(tt.grossSatang), M(tt.discountSatang), M(tt.serviceChargeSatang), M(tt.netSalesSatang), M(tt.vatSatang), M(tt.netExVatSatang), M(tt.tipSatang), tt.voidCount, M(tt.voidTotalSatang), M(tt.avgBillSatang)]}
          />
        </div>
      );
    }
    case "products": {
      const x = rep as Report<"products", ProductRow, ProductTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<ProductRow>[] = [
        { key: "name", header: c("product"), cell: (r) => r.name },
        { key: "qty", header: c("qty"), num: true, cell: (r) => r.qty },
        { key: "weight", header: c("weight"), num: true, cell: (r) => (r.weightGrams > 0 ? r.weightGrams.toLocaleString("th-TH") : "—") },
        { key: "lines", header: c("lines"), num: true, cell: (r) => r.lineCount },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("fullPrice"), num: true, cell: (r) => M(r.grossSatang) },
        { key: "ldisc", header: c("lineDiscount"), num: true, cell: (r) => M(r.lineDiscountSatang) },
        { key: "sales", header: c("sales"), num: true, cell: (r) => <b>{M(r.salesSatang)}</b> },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.key}
            minWidth={760}
            total={[t("total"), tt.qty, tt.weightGrams > 0 ? tt.weightGrams.toLocaleString("th-TH") : "—", tt.lineCount, tt.billCount, M(tt.grossSatang), M(tt.lineDiscountSatang), M(tt.salesSatang)]}
          />
          {limited(x.rows.length, tt.rowCount)}
        </div>
      );
    }
    case "staff": {
      const x = rep as Report<"staff", StaffRow, StaffTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<StaffRow>[] = [
        { key: "name", header: c("staff"), cell: (r) => (r.userId === null ? <span className="text-[color:var(--color-muted)]">{t("unknownSeller")}</span> : (r.name ?? r.userId)) },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "net", header: c("netSales"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "discount", header: c("discount"), num: true, cell: (r) => M(r.discountSatang) },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidTotal", header: c("voidTotal"), num: true, cell: (r) => M(r.voidTotalSatang) },
        { key: "avg", header: c("avgBill"), num: true, cell: (r) => M(r.avgBillSatang) },
      ];
      const tt = x.totals;
      return (
        <Table
          testId="pos-report-table"
          cols={cols}
          rows={x.rows}
          rowKey={(r) => r.userId ?? "∅"}
          minWidth={760}
          total={[t("total"), tt.billCount, M(tt.netSalesSatang), M(tt.discountSatang), M(tt.tipSatang), tt.voidCount, M(tt.voidTotalSatang), M(tt.avgBillSatang)]}
        />
      );
    }
    case "payments": {
      const x = rep as Report<"payments", PaymentRow, PaymentTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<PaymentRow>[] = [
        // POS P2.1U ▸ มติ 5: PLATFORM = "แพลตฟอร์ม" (คำสั้นของรายงาน pos.report.closeDay.method.PLATFORM — ป้ายยาว "รอแพลตฟอร์มโอน" อยู่ที่จอกะ) ◂
        { key: "method", header: c("method"), cell: (r) => (r.type === "PLATFORM" ? t("closeDay.method.PLATFORM") : METHOD_KEYS.has(r.type) ? tc(`method.${r.type}`) : r.label) },
        { key: "count", header: c("payments"), num: true, cell: (r) => r.count },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "amount", header: c("amount"), num: true, cell: (r) => <b>{M(r.amountSatang)}</b> },
        { key: "tendered", header: c("tendered"), num: true, cell: (r) => M(r.cashTenderedSatang) },
        { key: "change", header: c("change"), num: true, cell: (r) => M(r.changeSatang) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.type}
            minWidth={620}
            total={[t("total"), x.rows.reduce((s, r) => s + r.count, 0) /* R2 F3: แสดงผลอย่างเดียว — แถววิธีชำระไม่ถูกตัด (≤ 6 แถว) */, tt.billCount, M(tt.totalPaidSatang), "", ""]}
          />
          <p className="text-xs text-[color:var(--color-muted)] tabular-nums" data-testid="pos-report-summary">
            {t("summary.salesPlusTip", { sales: formatBaht(tt.salesSatang, { decimals: true }), tip: formatBaht(tt.tipSatang, { decimals: true }), paid: formatBaht(tt.totalPaidSatang, { decimals: true }) })}
          </p>
        </div>
      );
    }
    case "margin": {
      const x = rep as Report<"margin", MarginRow, MarginTotals>;
      if (x.rows.length === 0) return empty;
      const tag = (label: string) => <span className="ml-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs text-[color:var(--color-muted)]">{label}</span>;
      const cols: Col<MarginRow>[] = [
        { key: "name", header: c("product"), cell: (r) => r.name },
        { key: "qty", header: c("qty"), num: true, cell: (r) => r.qty },
        { key: "revenue", header: c("revenue"), num: true, cell: (r) => M(r.revenueSatang) },
        {
          key: "cost",
          header: c("cost"),
          num: true,
          cell: (r) =>
            r.costSatang === null ? (
              <span className="text-[color:var(--color-muted)]">{t("noCost")}</span>
            ) : (
              <>
                {M(r.costSatang)}
                {r.estimatedCostSatang > 0 ? tag(t("estimated")) : null}
              </>
            ),
        },
        { key: "est", header: c("estimatedCost"), num: true, cell: (r) => (r.estimatedCostSatang > 0 ? M(r.estimatedCostSatang) : "—") },
        { key: "uncosted", header: c("uncosted"), num: true, cell: (r) => r.uncostedLineCount },
        { key: "margin", header: c("margin"), num: true, cell: (r) => <b>{M(r.marginSatang)}</b> },
        { key: "pct", header: c("marginPct"), num: true, cell: (r) => pct(r.marginBp) },
      ];
      const tt = x.totals;
      const line = (label: string, v: number, id: string) => (
        <div className="flex justify-between gap-2 border-b py-1.5 text-sm last:border-0" data-testid={id}>
          <span className="text-[color:var(--color-muted)]">{label}</span>
          <MoneyText satang={v} decimals />
        </div>
      );
      return (
        <div className="flex flex-col gap-4">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.key}
            minWidth={860}
            total={[t("total"), "—" /* R2 F2: ยอดรวมมาจากเซิร์ฟเวอร์เท่านั้น — แถวกำไรถูกตัดที่ 200 จึงไม่รวม qty ฝั่งจอ */, M(tt.revenueSatang), M(tt.costSatang), tt.estimatedCostSatang > 0 ? M(tt.estimatedCostSatang) : "—", tt.uncostedLineCount, M(tt.grossMarginSatang), pct(tt.grossMarginBp)]}
          />
          {x.rows.length >= 200 ? <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-row-limit">{t("rowLimitAtLeast", { shown: 200 })}</p> : null}
          <div className="rounded-xl border p-3" data-testid="pos-report-summary">
            {line(t("summary.costedRevenue"), tt.costedRevenueSatang, "pos-report-margin-costed")}
            {line(t("summary.uncostedRevenue"), tt.uncostedRevenueSatang, "pos-report-margin-uncosted")}
            {line(t("summary.netExVat"), tt.netExVatSatang, "pos-report-margin-netexvat")}
            {line(t("summary.netMargin"), tt.netMarginSatang, "pos-report-margin-net")}
          </div>
        </div>
      );
    }
    case "shifts": {
      const x = rep as Report<"shifts", ShiftRow, ShiftTotals>;
      if (x.rows.length === 0) return empty;
      const status = (s: string) => (s === "OPEN" ? tc("statusOpen") : s === "FORCE_CLOSED" ? tc("statusForced") : tc("statusClosed"));
      const cols: Col<ShiftRow>[] = [
        { key: "no", header: c("shiftNo"), num: true, cell: (r) => r.shiftNo },
        { key: "z", header: c("zNo"), num: true, cell: (r) => r.zNumber ?? "—" },
        { key: "unit", header: c("unit"), cell: (r) => r.unitName ?? r.unitId },
        { key: "device", header: c("device"), cell: (r) => r.deviceLabel ?? r.deviceId },
        { key: "status", header: c("status"), cell: (r) => <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs">{status(r.status)}</span> },
        { key: "by", header: c("openedBy"), cell: (r) => r.openedByName ?? r.openedByUserId },
        { key: "openedAt", header: c("openedAt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{bkkTime(r.openedAt, locale)}</span> },
        { key: "closedAt", header: c("closedAt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{bkkTime(r.closedAt, locale)}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "sales", header: c("sales"), num: true, cell: (r) => <b>{M(r.salesTotalSatang)}</b> },
        { key: "tip", header: c("tip"), num: true, cell: (r) => M(r.tipSatang) },
        { key: "expected", header: c("expectedCash"), num: true, cell: (r) => M(r.expectedCashSatang) },
        { key: "counted", header: c("countedCash"), num: true, cell: (r) => M(r.countedCashSatang) },
        {
          key: "overShort",
          header: c("overShort"),
          num: true,
          cell: (r) => (
            <span className={r.overShortSatang !== null && r.overShortSatang < 0 ? "text-[color:var(--color-danger)]" : undefined}>
              {M(r.overShortSatang)}
              {r.recountVarianceSatang !== null ? (
                <span className="block text-xs text-[color:var(--color-muted)]">
                  {c("recount")} <MoneyText satang={r.recountVarianceSatang} decimals />
                </span>
              ) : null}
            </span>
          ),
        },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.shiftId}
            minWidth={1240}
            total={[t("total"), "", "", "", "", "", "", "", tt.billCount, M(tt.salesTotalSatang), M(tt.tipSatang), "", "", M(tt.overShortSatang)]}
          />
          <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-summary">
            {t("summary.shiftCounts", { shifts: tt.shiftCount, short: tt.shortCount, over: tt.overCount, forced: tt.forcedCount, open: tt.openCount })}
          </p>
        </div>
      );
    }
    // POS P3.5U ▸ มติ 8: ค่าคอมฯ พนักงานขายต่อผู้ขาย (ผู้ดูเงินเดือน) ◂
    case "commission": {
      const x = rep as Report<"commission", CommissionRow, CommissionTotals>;
      if (x.rows.length === 0) return empty;
      const cc = (k: string) => t(`commission.cols.${k}`);
      const hrText = (st: string | undefined) => (st && HR_STATUS_KEYS.has(st) ? t(`commission.hrStatus.${st}`) : "—");
      const cols: Col<CommissionRow>[] = [
        {
          key: "seller",
          header: cc("seller"),
          cell: (r) => (
            <span className="flex flex-col gap-0.5">
              <span>{r.name ?? r.userId}</span>
              {r.noEmployee ? (
                <span className="w-fit whitespace-nowrap rounded-full border border-[color:var(--color-danger)] px-2 py-0.5 text-xs text-[color:var(--color-danger)]" data-testid={`pos-reports-commission-noemp-${r.userId}`}>
                  {t("commission.noEmployee")}
                </span>
              ) : null}
            </span>
          ),
        },
        { key: "accrued", header: cc("accrued"), num: true, cell: (r) => M(r.accruedSatang) },
        { key: "reversed", header: cc("reversed"), num: true, cell: (r) => M(r.reversedSatang) },
        { key: "net", header: cc("net"), num: true, cell: (r) => <b>{M(r.netSatang)}</b> },
        { key: "sent", header: cc("sent"), num: true, cell: (r) => M(r.sentSatang) },
        { key: "open", header: cc("open"), num: true, cell: (r) => M(r.openSatang) },
        { key: "hrStatus", header: cc("hrStatus"), cell: (r) => <span className="whitespace-nowrap">{hrText(r.hrStatus)}</span> },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2" data-testid="pos-reports-commission">
          <p className="text-xs text-[color:var(--color-muted)]">{t("commission.desc")}</p>
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.userId}
            minWidth={860}
            total={[t("total"), M(tt.accruedSatang), M(tt.reversedSatang), M(tt.netSatang), M(tt.sentSatang), M(tt.openSatang), ""]}
          />
        </div>
      );
    }
    // POS P2.11U ▸ มติ 7 ◂
    case "channels": {
      const x = rep as Report<"channels", ChannelRow, ChannelTotals>;
      if (x.rows.length === 0) return <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-empty">{t("channels.empty")}</p>;
      const tcol = (k: string) => t(`channels.cols.${k}`);
      const pct1 = (v: number) => `${v.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
      const cols: Col<ChannelRow>[] = [
        { key: "channel", header: tcol("channel"), cell: (r) => channelDisplayName(r.channelCode, r.name, tch) },
        { key: "bills", header: tcol("bills"), num: true, cell: (r) => r.billCount },
        { key: "net", header: tcol("net"), num: true, cell: (r) => M(r.grossSatang - r.refundSatang) },
        { key: "commission", header: tcol("commission"), num: true, cell: (r) => M(r.commissionSatang + r.commissionVatSatang) },
        { key: "gross", header: tcol("gross"), num: true, cell: (r) => <b>{M(r.netSatang)}</b> },
        { key: "share", header: tcol("share"), num: true, cell: (r) => pct1(r.sharePct) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table
            testId="pos-report-table"
            cols={cols}
            rows={x.rows}
            rowKey={(r) => r.channelCode}
            minWidth={680}
            total={[t("total"), tt.billCount, M(tt.grossSatang - tt.refundSatang), M(tt.commissionSatang + tt.commissionVatSatang), M(tt.netSatang), ""]}
          />
          <p className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-summary">
            {t("channels.footnote")}
          </p>
        </div>
      );
    }
    // POS P2.12U ▸ มติ 4 ◂
    case "anomalies":
      return <AnomalyBody rep={rep as Report<"anomalies", AnomalyRow, AnomalyTotals>} t={t} systemId={systemId} locale={locale} /* POS P2.14 ▸ U2 O-8 ◂ */ boardOn={boardOn} key={rep.generatedAt} /* POS P3.8U ▸ CD-P38U-7: รายงานใหม่ = สถานะปุ่มต่อแถวใหม่ ◂ */ />;
    // POS P2.12U ▸ มติ 3: เปรียบเทียบสาขา — แถวต่อสาขาที่มีเอกสาร/กะที่นับเงินในช่วง (ชื่อจาก DTO) + แถวรวมของทั้งขอบเขต (totals) ◂
    case "branches": {
      const x = rep as Report<"branches", BranchRow, BranchTotals>;
      if (x.rows.length === 0) return empty;
      const bc = (k: string) => t(`branches.cols.${k}`);
      const os = (v: number) => <span className={v < 0 ? "text-[color:var(--color-danger)]" : undefined}>{M(v)}</span>;
      const cols: Col<BranchRow>[] = [
        { key: "unit", header: c("unit"), cell: (r) => r.name || r.unitId },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "net", header: c("netSales"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "avg", header: c("avgBill"), num: true, cell: (r) => M(r.avgBillSatang) },
        { key: "refunds", header: bc("refunds"), num: true, cell: (r) => r.refundCount },
        { key: "refundTotal", header: bc("refundTotal"), num: true, cell: (r) => M(r.refundTotalSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidTotal", header: c("voidTotal"), num: true, cell: (r) => M(r.voidTotalSatang) },
        { key: "cash", header: bc("cash"), num: true, cell: (r) => M(r.cashSatang) },
        { key: "platform", header: bc("platform"), num: true, cell: (r) => M(r.platformSatang) },
        { key: "commission", header: bc("commission"), num: true, cell: (r) => M(r.commissionSatang) },
        { key: "commissionVat", header: bc("commissionVat"), num: true, cell: (r) => M(r.commissionVatSatang) },
        { key: "overShort", header: c("overShort"), num: true, cell: (r) => os(r.overShortSatang) },
      ];
      const tt = x.totals;
      return (
        <Table
          testId="pos-report-table"
          cols={cols}
          rows={x.rows}
          rowKey={(r) => r.unitId}
          minWidth={1240}
          total={[t("branches.total"), tt.billCount, M(tt.netSalesSatang), M(tt.avgBillSatang), tt.refundCount, M(tt.refundTotalSatang), tt.voidCount, M(tt.voidTotalSatang), M(tt.cashSatang), M(tt.platformSatang), M(tt.commissionSatang), M(tt.commissionVatSatang), os(tt.overShortSatang)]}
        />
      );
    }
    // POS P2.12U ▸ มติ 2: รายชั่วโมง = 24 แถวของวันธุรกิจ (ป้ายจาก DTO) + แถวรวม · หมายเหตุคาดการณ์/ชั่วโมงพับ ◂
    case "hourly": {
      const x = rep as Report<"hourly", HourlyRow, HourlyTotals>;
      if (x.totals.billCount === 0 && x.totals.netSalesSatang === 0 && x.totals.forecastSatang === 0) return empty;
      const hc = (k: string) => t(`hourly.cols.${k}`);
      const cols: Col<HourlyRow>[] = [
        { key: "hour", header: hc("hour"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{`${r.label}:00`}</span> },
        { key: "bills", header: hc("bills"), num: true, cell: (r) => r.billCount },
        { key: "net", header: hc("net"), num: true, cell: (r) => <b>{M(r.netSalesSatang)}</b> },
        { key: "forecast", header: hc("forecast"), num: true, cell: (r) => M(r.forecastSatang) },
      ];
      const tt = x.totals;
      return (
        <div className="flex flex-col gap-2">
          <Table testId="pos-report-table" cols={cols} rows={x.rows} rowKey={(r) => String(r.hour)} minWidth={420} total={[t("total"), tt.billCount, M(tt.netSalesSatang), M(tt.forecastSatang)]} />
          <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]" data-testid="pos-report-summary">
            <p>{t("hourly.forecastNote")}</p>
            {cutoffMinutes % 60 !== 0 ? <p>{t("hourly.foldNote")}</p> : null}
          </div>
        </div>
      );
    }
    case "tax": {
      const x = rep as Report<"tax", TaxRow, TaxTotals>;
      if (x.rows.length === 0) return empty;
      const cols: Col<TaxRow>[] = [
        { key: "date", header: c("date"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{dayDate(r.businessDate, locale) /* POS P2.14 ▸ U2 O-8 ◂ */}</span> },
        { key: "unit", header: c("unit"), cell: (r) => r.unitName },
        { key: "first", header: c("firstReceipt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.firstReceiptNo ?? "—"}</span> },
        { key: "last", header: c("lastReceipt"), cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.lastReceiptNo ?? "—"}</span> },
        { key: "bills", header: c("bills"), num: true, cell: (r) => r.billCount },
        { key: "gross", header: c("taxGross"), num: true, cell: (r) => <b>{M(r.grossSatang)}</b> },
        { key: "vat", header: c("vat"), num: true, cell: (r) => M(r.vatSatang) },
        { key: "base", header: c("taxBase"), num: true, cell: (r) => M(r.baseSatang) },
        { key: "vatable", header: c("vatable"), num: true, cell: (r) => M(r.vatableGrossSatang) },
        { key: "nonVat", header: c("nonVat"), num: true, cell: (r) => M(r.nonVatGrossSatang) },
        { key: "voids", header: c("voids"), num: true, cell: (r) => r.voidCount },
        { key: "voidNos", header: c("voidReceipts"), cell: (r) => <span className="tabular-nums">{r.voidReceiptNos.length > 0 ? r.voidReceiptNos.join(" ") : "—"}</span> },
      ];
      const tt = x.totals;
      return (
        <Table
          testId="pos-report-table"
          cols={cols}
          rows={x.rows}
          rowKey={(r) => `${r.businessDate}|${r.unitId}`}
          minWidth={1160}
          total={[t("total"), "", "", "", tt.billCount, M(tt.grossSatang), M(tt.vatSatang), M(tt.baseSatang), M(tt.vatableGrossSatang), M(tt.nonVatGrossSatang), tt.voidCount, ""]}
        />
      );
    }
  }
}

// ═══════════ จอหลัก ═══════════
export function ReportsClient({ systemId, units, initial, today, maxDays, hourlyMaxDays, cutoffMinutes, canAnomaly, discountFlagBp, canPayroll = false, boardOn = false /* POS P3.8U ◂ */ }: Props) {
  const t = useTranslations("pos.report");
  const tc = useTranslations("pos.shift"); // ป้ายวิธีชำระ + สถานะกะ (ใช้ร่วมกับจอกะ)
  const [view, setView] = useState<View>(initial);
  const [report, setReport] = useState<Loaded | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvErrorCode, setCsvErrorCode] = useState<string | null>(null);
  const locale = useLocale();
  const seq = useRef(0);

  // ตรวจช่วงที่จอ (สเปก: 92 วัน ฝั่งจอ + คำปฏิเสธของเซิร์ฟเวอร์ก็แสดง)
  const baseRangeError = !isDate(view.from) || !isDate(view.to) ? "errors.validation" : view.from > view.to ? "errors.rangeOrder" : spanDays(view.from, view.to) > maxDays ? "errors.rangeTooLong" : null;
  // POS P2.12U ▸ มติ 2: รายชั่วโมงเกิน HOURLY_MAX_DAYS = ข้อความในการ์ด (ไม่เรียกเซิร์ฟเวอร์ · CSV/PDF ปิด) · แท็บปิดเมื่อช่วงยาวเกิน ◂
  const hourlyTooLong = !baseRangeError && spanDays(view.from, view.to) > hourlyMaxDays;
  const rangeError = baseRangeError ?? (view.kind === "hourly" && hourlyTooLong ? "hourly.tooLong" : null);
  // POS P3.5U ▸ มติ 8: ไม่ใช่ผู้ดูเงินเดือน + ?kind=commission = การ์ดปฏิเสธ (ไม่เรียกเซิร์ฟเวอร์) ◂
  const commissionDenied = view.kind === "commission" && !canPayroll;
  // ภาพรวมไม่ใช่ชนิดของเซิร์ฟเวอร์ ⇒ CSV ของภาพรวม = daily (R4 §2)
  const target = useCallback((v: View) => ({ systemId, kind: (v.kind === "overview" ? "daily" : v.kind) as ReportKind, from: v.from, to: v.to, ...(v.unitId ? { unitId: v.unitId } : {}) }), [systemId]);
  const [ovGeneratedAt, setOvGeneratedAt] = useState<string | null>(null);

  const load = useCallback(
    async (v: View) => {
      const my = ++seq.current; // คำขอเก่าที่ตอบช้ากว่าห้ามทับผลใหม่
      setLoading(true);
      setErrorCode(null);
      try {
        const r = await posReportAction(target(v));
        if (my !== seq.current) return;
        if (r.ok) setReport(r.report);
        else {
          setReport(null);
          setErrorCode(r.code);
        }
      } catch {
        if (my === seq.current) {
          setReport(null);
          setErrorCode("INTERNAL");
        }
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [target],
  );

  // เปลี่ยนมุมมอง → เขียน URL (ไม่โหลดหน้าใหม่) + โหลดรายงาน (ช่วงผิดที่จอ = ไม่เรียกเซิร์ฟเวอร์)
  useEffect(() => {
    const q = new URLSearchParams({ kind: view.kind, from: view.from, to: view.to });
    if (view.unitId) q.set("unit", view.unitId);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
    } catch {
      /* URL เป็นแค่ความสะดวก — พังไม่กระทบรายงาน */
    }
    if (rangeError || view.kind === "overview" || commissionDenied) {
      // ภาพรวมโหลดการ์ดของตัวเอง (ReportsOverview) — ตารางชนิดเดียวไม่ต้องเรียก
      seq.current++;
      setReport(null);
      setLoading(false);
      return;
    }
    void load(view);
  }, [view, rangeError, load, commissionDenied]);

  const downloadCsv = async () => {
    if (csvBusy || rangeError || commissionDenied) return;
    setCsvBusy(true);
    setCsvErrorCode(null);
    try {
      const r = await posReportCsvAction(target(view));
      if (!r.ok) {
        setCsvErrorCode(r.code);
        return;
      }
      // เนื้อไฟล์มี BOM แล้ว (Excel ไทย) — ส่งต่อทั้งก้อน ไม่เติมซ้ำ
      const url = URL.createObjectURL(new Blob([r.body], { type: r.contentType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setCsvErrorCode("INTERNAL");
    } finally {
      setCsvBusy(false);
    }
  };

  const set = (patch: Partial<View>) => {
    setCsvErrorCode(null); // ข้อความ CSV เป็นของมุมมองเดิม
    setView((v) => ({ ...v, ...patch }));
  };
  const shownError = rangeError ? t(rangeError) : errorCode ? t(refusalKey(errorCode)) : null;
  const overview = view.kind === "overview";
  // POS P2.12U ▸ แท็บใหม่ที่ผู้ใช้นี้เห็น ◂
  const newKinds: NewKind[] = [...(units.length > 1 ? (["branches"] as const) : []), "hourly", ...(canAnomaly ? (["anomalies"] as const) : []), ...(canPayroll ? (["commission"] as const) : [])]; // POS P3.5U ▸ + commission ◂
  const seeAll = (k: ReportKind) => set({ kind: k }); // "ดูทั้งหมด" ในการ์ดภาพรวม → แท็บชนิดนั้น (ช่วง/สาขาเดิม)
  const prev = !rangeError ? prevRangeOf(view.from, view.to) : null;
  const dateCls = "min-h-[44px] w-full min-w-0 bg-transparent text-sm font-semibold tabular-nums outline-none sm:w-[8.75rem]";
  // POS P2.12U ▸ มติ 1: PDF = หน้าพิมพ์ pos/reports/print ในแท็บใหม่ ด้วยตัวกรองเดียวกับจอ (ภาพรวม = เอกสารสรุปหลายส่วน) · ช่วงผิด = ปุ่มปิด ◂
  const pdfHref = rangeError || commissionDenied
    ? null
    : `/app/sys/${systemId}/pos/reports/print?${new URLSearchParams({ kind: view.kind, from: view.from, to: view.to, ...(view.unitId ? { unit: view.unitId } : {}), locale: locale.startsWith("en") ? "en" : "th" }).toString()}`;
  const infoText = prev ? `${ovGeneratedAt ? `${t("overview.upToDate", { time: bkkHm(ovGeneratedAt, locale) })} · ` : ""}${t("overview.compare", { range: rangeLabel(prev.from, prev.to, locale) })}` : "";

  return (
    <div className="flex w-full min-w-0 flex-col gap-5" data-testid="pos-reports">
      {/* หัวหน้าแบบภาพ 08: ชื่อ · ช่วงวันที่ · สาขา · ข้อมูลถึง/เทียบกับ · ส่งออก CSV (ขวาสุด) */}
      {/* R6 V4: ปุ่ม CSV อยู่แถวเดียวกับชื่อเสมอ (ภาพ 08) — ≥ xl ทุกอย่างแถวเดียว ข้อความสถานะตัดท้าย (title = เต็ม) · < xl ตัวกรอง + สถานะลงแถวถัดไป */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3" data-testid="pos-report-header">
        <h2 className="order-1 text-2xl font-bold tracking-tight">{overview ? t("overview.title") : t("title")}</h2>
        <button data-testid="pos-report-csv" type="button" className="btn btn-ghost order-2 ml-auto min-h-[44px] shrink-0 whitespace-nowrap text-sm xl:order-3" disabled={csvBusy || !!rangeError || commissionDenied || (!overview && loading)} onClick={() => void downloadCsv()}>
          <Icon d={I_OUT} className="h-[18px] w-[18px]" />
          {csvBusy ? t("downloading") : t("overview.exportCsv")}
        </button>
        {/* POS P2.12U ▸ มติ 1: ปุ่ม PDF ข้าง CSV ทุกแท็บ (ภาพ 08 "ส่งออก CSV | PDF") ◂ */}
        <a
          data-testid="pos-reports-pdf"
          href={pdfHref ?? undefined}
          target="_blank"
          rel="noopener"
          aria-disabled={!pdfHref}
          className={`btn btn-ghost order-2 inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap text-sm xl:order-3 ${pdfHref ? "" : "pointer-events-none opacity-50"}`}
        >
          <Icon d={I_FILE} className="h-[18px] w-[18px]" />
          {t("print.button")}
        </a>
        <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-3 sm:gap-4 xl:order-2 xl:ml-2 xl:w-auto xl:flex-1 xl:flex-nowrap">
          <div className="flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-xl border bg-[color:var(--color-surface)] px-3 sm:w-auto xl:shrink-0" role="group" aria-label={t("overview.dateRange")}>
            <Icon d={I_CAL} className="h-[18px] w-[18px] text-[color:var(--color-muted)]" />
            {/* POS P1.18U ▸ มติ 9 (Q9): ป้ายวันที่ตามภาษาจอ + ช่องวันที่ของเบราว์เซอร์ซ้อนโปร่งใส (ไม่ขึ้นกับรูปแบบ mm/dd/yyyy ของเบราว์เซอร์) ◂ */}
            <DateOverlay value={view.from} className={dateCls}>
              <input data-testid="pos-report-from" type="date" aria-label={t("from")} className={DATE_OVERLAY_INPUT} value={view.from} max={view.to || today} onClick={openDatePicker} onChange={(e) => set({ from: e.target.value })} />
            </DateOverlay>
            <span className="text-[color:var(--color-muted)]" aria-hidden="true">–</span>
            <DateOverlay value={view.to} className={dateCls}>
              <input data-testid="pos-report-to" type="date" aria-label={t("to")} className={DATE_OVERLAY_INPUT} value={view.to} min={view.from || undefined} onClick={openDatePicker} onChange={(e) => set({ to: e.target.value })} />
            </DateOverlay>
          </div>
          <div className="flex min-h-[48px] w-full min-w-0 items-center gap-2 rounded-xl border bg-[color:var(--color-surface)] px-3 sm:w-auto xl:shrink-0">
            <Icon d={I_SHOP} className="h-[18px] w-[18px] text-[color:var(--color-muted)]" />
            <select data-testid="pos-report-unit" aria-label={t("unit")} className="min-h-[44px] w-full min-w-0 bg-transparent text-sm font-semibold outline-none sm:w-auto" value={view.unitId} onChange={(e) => set({ unitId: e.target.value })}>
              <option value="">{t("allUnits")}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          {overview && prev ? (
            <span className="min-w-0 basis-full text-[13px] text-[color:var(--color-muted)] sm:basis-auto xl:flex-1 xl:truncate" title={infoText} data-testid="pos-report-ov-info">
              {infoText}
            </span>
          ) : null}
        </div>
      </div>
      {!overview ? <p className="-mt-2 text-xs text-[color:var(--color-muted)]">{t("rangeHint")}</p> : null}

      {/* แท็บชนิดรายงาน: ภาพรวม + 7 ชนิด — มือถือเลื่อนแนวนอนในแถบเอง */}
      {/* POS P2.12U ▸ fix1 F6: แถบชนิดรายงาน (11 ชนิด) = กรอบเลื่อนแนวนอนของตัวเอง (relative · ซ่อนแถบเลื่อน · ปุ่ม ≥ 44 px) ◂ */}
      <div role="tablist" aria-label={t("kindsLabel")} className="relative -mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="pos-report-kinds">
        {KINDS.map((k) => {
          const on = view.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              data-testid={`pos-report-kind-${k}`}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-4 text-sm ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"}`}
              onClick={() => set({ kind: k })}
            >
              {k === "overview" ? t("overview.tab") : t(`kinds.${k}`)}
            </button>
          );
        })}
        {newKinds.map((k) => {
          const on = view.kind === k;
          const off = k === "hourly" && hourlyTooLong && !on;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              aria-disabled={off || undefined}
              disabled={off}
              title={off ? t("hourly.tooLong") : undefined}
              aria-describedby={off ? "pos-reports-hourly-off" : undefined /* POS P2.12U ▸ fix1 F4 ◂ */}
              data-testid={`pos-reports-tab-${k}`}
              className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-4 text-sm disabled:opacity-50 ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"}`}
              onClick={() => set({ kind: k })}
            >
              {t(`kinds.${k}`)}
            </button>
          );
        })}
      </div>
      {/* POS P2.12U ▸ fix1 F4 (มติ 3): แท็บรายชั่วโมงปิด = ข้อความเล็กที่มองเห็นใต้แถบแท็บ (title อย่างเดียวไม่ขึ้นบนจอสัมผัส iPad/390) ◂ */}
      {newKinds.includes("hourly") && hourlyTooLong && view.kind !== "hourly" ? (
        <p id="pos-reports-hourly-off" className="-mt-2 text-xs text-[color:var(--color-muted)]" data-testid="pos-reports-hourly-off">
          {t("hourly.tooLong")}
        </p>
      ) : null}

      {csvErrorCode && (
        <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-report-csv-error">
          {t(refusalKey(csvErrorCode))}
        </div>
      )}

      {overview ? (
        rangeError ? (
          <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-report-error">
            {t(rangeError)}
          </div>
        ) : (
          <ReportsOverview
            systemId={systemId}
            unitCount={units.length}
            from={view.from}
            to={view.to}
            unitId={view.unitId}
            today={today}
            locale={locale}
            t={t}
            tc={tc}
            refusalText={(code) => t(refusalKey(code))}
            onGenerated={setOvGeneratedAt}
            onSeeAll={seeAll}
            cutoffMinutes={cutoffMinutes}
            discountFlagBp={discountFlagBp}
            boardLink={boardOn && canAnomaly} // POS P3.8U ▸ CD-P38U-8 ◂
          />
        )
      ) : (
        <section className="card flex min-w-0 flex-col gap-3" aria-busy={loading} data-testid="pos-report-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{t(`kinds.${view.kind}`)}</h2>
            {report && !loading ? (
              <span className="text-xs text-[color:var(--color-muted)]" data-testid="pos-report-generated">
                {view.from === view.to ? dayDate(view.from, locale) : `${dayDate(view.from, locale)} – ${dayDate(view.to, locale)}` /* POS P2.14 ▸ U2 O-8 ◂ */} · {t("generatedAt", { time: bkkTime(report.generatedAt, locale) })}
              </span>
            ) : null}
          </div>
          {!rangeError && view.kind === "commission" && (commissionDenied || errorCode === "PERMISSION_DENIED") ? (
            // POS P3.5U ▸ มติ 8: ไม่ใช่ผู้ดูเงินเดือน = การ์ดปฏิเสธของรายงานนี้ ◂
            <div role="alert" className="rounded-xl border p-3 text-sm text-[color:var(--color-muted)]" data-testid="pos-reports-commission-denied">
              {t("commission.denied")}
            </div>
          ) : !rangeError && view.kind === "anomalies" && errorCode === "PERMISSION_DENIED" ? (
            // POS P2.12U ▸ มติ 4: ไม่มี pos.report.anomaly = การ์ดปฏิเสธของรายงานนี้ (ไม่มีปุ่มลองใหม่ — ลองซ้ำก็ได้ผลเดิม) ◂
            <div role="alert" className="rounded-xl border p-3 text-sm text-[color:var(--color-muted)]" data-testid="pos-reports-anomaly-denied">
              {t("anomaly.denied")}
            </div>
          ) : shownError ? (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-report-error">
              <span>{shownError}</span>
              {!rangeError && (
                <button data-testid="pos-report-retry" type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={() => void load(view)}>
                  {t("retry")}
                </button>
              )}
            </div>
          ) : loading || !report ? (
            <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="pos-report-loading">
              {t("loading")}
            </p>
          ) : (
            <ReportBody rep={report} t={t} tc={tc} locale={locale} cutoffMinutes={cutoffMinutes} systemId={systemId} boardOn={boardOn} /* POS P3.8U ▸ CD-P38U-7 ◂ */ />
          )}
        </section>
      )}
    </div>
  );
}
