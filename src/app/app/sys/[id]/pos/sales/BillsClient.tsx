"use client";

// BillsClient.tsx — POS P1.16 U หน้า "บิลวันนี้" (ภาพ 12): แถบบน (วันที่ · ค้นหา · ช่องทาง · พนักงาน · ส่งออกหน้านี้) · ชิปสถานะ ·
//   การ์ดสรุป 3 ใบ · ตารางบิล (390 = การ์ดเรียงลง) + แบ่งหน้า · ลิ้นชักบิลด้านขวา (420 / 360 ที่ 1024 · 390 = แผ่นเต็มจอ) ·
//   กล่องยกเลิกบิล · หน้าต่างคืนเงินบางส่วน (ราคาร่างฝั่ง client ด้วย refund-math · เซิร์ฟเวอร์คือความจริง)
// 🔴 โหลดหน้า = billsPageDataAction คำขอเดียว · เปิดบิล = billDetailAction · หลังยกเลิก/คืน/พิมพ์สำเนา โหลดใหม่ทั้งรายการและลิ้นชัก
// 🔴 คำปฏิเสธแสดงผ่านคีย์ (pos.bills.errors.* · pos.refund.errors.* · pos.receipt.errors.*) ไม่แสดง message ไทยของเซิร์ฟเวอร์
// 🔴 คีย์กันซ้ำ: ยกเลิกบิล 1 คีย์ต่อการเปิดกล่อง · คืนเงิน 1 คีย์ต่อการเปิดหน้าต่าง (ยอดเปลี่ยน = ออกคีย์ใหม่ · ขัดข้อง = ลองซ้ำด้วยคีย์เดิม)
// ไม่ทำในใบนี้ (มติ CD3): "รอเงินเข้า" (P1.7) · ส่ง LINE (P1.11) · ขอใบเต็มรูป (P1.13) · เครดิตร้าน (กระเป๋าสมาชิก) · "กำลังทำรายการคืนเงิน" (presence)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { billDetailAction, billsPageDataAction, voidSaleAction } from "@/lib/modules/pos/bills-actions";
import { BILLS_ERROR_KEYS, BILL_STATUS_FILTERS, VOID_REASON_MAX, addBillDays, type BillDetailResult, type BillRow, type BillStatusFilter, type BillsPageDataResult } from "@/lib/modules/pos/bills-shared";
import { heartbeatAction } from "@/lib/modules/pos/device-actions";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { parsePrinterConfig, type PosPrinterPaper } from "@/lib/modules/pos/device-shared";
import { reprintReceiptAction } from "@/lib/modules/pos/receipt-actions";
import { receiptRefusalMessageKey, renderReceiptHtml } from "@/lib/modules/pos/receipt-render";
import { refundSaleAction, saleForRefundAction } from "@/lib/modules/pos/refund-actions";
import { refundLineAmount, refundServiceCharge } from "@/lib/modules/pos/refund-math";
import { REFUND_ERROR_KEYS, REFUND_REASON_CODES, REFUND_REASON_MAX, type RefundPayType, type RefundReasonCode, type SaleForRefund } from "@/lib/modules/pos/refund-shared";
import { currentShiftAction } from "@/lib/modules/pos/shift-actions";
import { BillIcon, ChannelChip, StatusChip, SummaryCard, bkkHm, billsCsv, channelLabel, chipOf, dateLabel, methodLabel, money, payText, type T } from "./bills-ui";

type Unit = { id: string; name: string };
type Props = { systemId: string; units: Unit[]; unitId: string; today: string; initialDate: string; hasAnyBill: boolean; accountSystemId: string | null };
type PageOk = Extract<BillsPageDataResult, { ok: true }>;
type Detail = Extract<BillDetailResult, { ok: true }>["bill"];

const newKey = (p: string) => `${p}-${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 100);
const STATUS_CHIP_KEY: Record<BillStatusFilter, "all" | "paid" | "voided" | "refunded" | "offShiftCash"> = {
  ALL: "all",
  PAID: "paid",
  VOIDED: "voided",
  REFUNDED: "refunded",
  OFF_SHIFT_CASH: "offShiftCash",
};
const errKey = (code: string) => (Object.prototype.hasOwnProperty.call(BILLS_ERROR_KEYS, code) ? BILLS_ERROR_KEYS[code as keyof typeof BILLS_ERROR_KEYS] : "unknown");
const refundErrKey = (code: string) => (Object.prototype.hasOwnProperty.call(REFUND_ERROR_KEYS, code) ? REFUND_ERROR_KEYS[code as keyof typeof REFUND_ERROR_KEYS] : "unknown");

/** หน้าเลขที่แสดง: 1 2 … 7 (ปัจจุบัน ± 1 · หัว/ท้ายเสมอ) */
function pageList(cur: number, last: number): (number | "…")[] {
  const s = new Set([1, last, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= last));
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of [...s].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/** กล่องกลางจอ (390 = เต็มจอ) · Esc ปิด */
function BillDialog({ labelledBy, testid, wide, onClose, children }: { labelledBy: string; testid: string; wide?: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testid}
        className={`flex max-h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-lg sm:max-h-[86vh] sm:rounded-2xl ${wide ? "sm:max-w-[620px]" : "sm:max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function BillsClient({ systemId, units, unitId, today, initialDate, hasAnyBill, accountSystemId }: Props) {
  const t = useTranslations("pos.bills") as T;
  const ts = useTranslations("pos.shift") as T;
  const te = useTranslations("pos.bills.errors") as T;
  const tr = useTranslations("pos.refund.errors") as T;
  const trc = useTranslations("pos.receipt") as T;
  const locale = useLocale();

  // ── ตัวกรอง ──
  const [date, setDate] = useState(initialDate);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [staffUserId, setStaffUserId] = useState("");
  const [status, setStatus] = useState<BillStatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BillsPageDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // ── ลิ้นชัก ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillDetailResult | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reprintBusy, setReprintBusy] = useState(false);
  const [drawerErr, setDrawerErr] = useState<string | null>(null);

  // ── ค้นหาแบบหน่วง ──
  useEffect(() => {
    const h = setTimeout(() => {
      setQ(qInput.trim().slice(0, 60));
      setPage(1);
    }, 300);
    return () => clearTimeout(h);
  }, [qInput]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    billsPageDataAction({
      systemId,
      unitId,
      date,
      status,
      ...(q ? { q } : {}),
      ...(channel ? { channel } : {}),
      ...(staffUserId ? { staffUserId } : {}),
      page,
      pageSize: 10,
    })
      .then((r) => {
        if (alive) setData(r);
      })
      .catch(() => {
        if (alive) setData({ ok: false, code: "UNKNOWN", message: "" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [systemId, unitId, date, status, q, channel, staffUserId, page, reloadTick]);

  // แก้รอบ 1 F1: บิลที่ผู้ใช้ต้องการล่าสุด — ผลของคำขอเก่า (แตะ A ช้า แล้วแตะ B) ห้ามทับลิ้นชักของ B
  const wantedRef = useRef<string | null>(null);
  const loadDetail = useCallback(
    async (saleId: string) => {
      setDrawerErr(null);
      let res: BillDetailResult;
      try {
        res = await billDetailAction({ systemId, unitId, saleId });
      } catch {
        res = { ok: false, code: "UNKNOWN", message: "" };
      }
      if (wantedRef.current === saleId) setDetail(res);
    },
    [systemId, unitId],
  );
  const openBill = useCallback(
    (saleId: string) => {
      wantedRef.current = saleId;
      if (detail?.ok && detail.bill.id === saleId) {
        setSelectedId(saleId); // บิลนี้แสดงอยู่แล้ว — ไม่โหลดซ้ำ
        return;
      }
      setSelectedId(saleId);
      setDetail(null);
      void loadDetail(saleId);
    },
    [loadDetail, detail],
  );
  const closeDrawer = useCallback(() => {
    wantedRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setMenuFor(null);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(h);
  }, [toast]);

  const ok: PageOk | null = data && data.ok ? data : null;
  const bill: Detail | null = detail && detail.ok ? detail.bill : null;
  const refreshAll = useCallback(() => {
    setReloadTick((n) => n + 1);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ── ยกเลิกบิล ──
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidKey, setVoidKey] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const openVoid = () => {
    setVoidReason("");
    setVoidErr(null);
    setVoidKey(newKey("void"));
    setVoidOpen(true);
    setMenuFor(null);
  };
  const closeVoid = useCallback(() => {
    if (!voidBusy) setVoidOpen(false);
  }, [voidBusy]);
  const submitVoid = async () => {
    if (!bill || voidBusy) return;
    const reason = voidReason.trim();
    if (!reason || reason.length > VOID_REASON_MAX) {
      setVoidErr(te("reasonRequired"));
      return;
    }
    setVoidBusy(true);
    setVoidErr(null);
    try {
      const r = await voidSaleAction({ systemId, unitId, saleId: bill.id, reason, idempotencyKey: voidKey });
      if (r.ok) {
        setVoidOpen(false);
        setToast(t("toastVoided"));
        refreshAll();
      } else setVoidErr(te(errKey(r.code)));
    } catch {
      setVoidErr(te("unknown"));
    } finally {
      setVoidBusy(false);
    }
  };

  // แก้รอบ 1 F3 (R5): ขนาดกระดาษ = printerConfig ของเครื่องนี้ (heartbeat ตัวเดียวกับหน้าขาย · อ่านครั้งแรกที่พิมพ์แล้วจำไว้) ?? "80"
  const paperRef = useRef<PosPrinterPaper | null>(null);
  const devicePaper = async (): Promise<PosPrinterPaper> => {
    if (paperRef.current) return paperRef.current;
    let paper: PosPrinterPaper = "80";
    const deviceCode = getPosDeviceId();
    if (deviceCode) {
      const hb = await heartbeatAction({ systemId, unitId, deviceCode }).catch(() => null);
      if (hb?.ok && hb.device) {
        const cfg = parsePrinterConfig(hb.device.printerConfig);
        if (cfg.ok) paper = cfg.config.paper ?? "80";
      }
    }
    paperRef.current = paper;
    return paper;
  };

  // ── พิมพ์สำเนา (พิมพ์ผ่านเบราว์เซอร์ใน iframe ซ่อน · มติ CD4 — เครื่องพิมพ์ ESC/POS เป็นของ P1.10U) ──
  const reprint = async (saleId: string) => {
    if (reprintBusy) return;
    setReprintBusy(true);
    setDrawerErr(null);
    setMenuFor(null);
    try {
      const r = await reprintReceiptAction({ systemId, saleId });
      if (!r.ok) {
        setDrawerErr(trc(receiptRefusalMessageKey(r.code)));
        return;
      }
      const html = renderReceiptHtml(r.payload, { paper: await devicePaper(), locale: locale.startsWith("en") ? "en" : "th" });
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } finally {
          setTimeout(() => frame.remove(), 60_000);
        }
      };
      frame.srcdoc = html;
      document.body.appendChild(frame);
      setToast(t("toastReprint"));
      if (selectedId === saleId) void loadDetail(saleId);
    } catch {
      setDrawerErr(trc("errors.internal"));
    } finally {
      setReprintBusy(false);
    }
  };

  // ── คืนเงิน ──
  const [refundOpen, setRefundOpen] = useState(false);
  const [rf, setRf] = useState<SaleForRefund | null>(null);
  const [rfLoadErr, setRfLoadErr] = useState<string | null>(null);
  const [rfQty, setRfQty] = useState<Record<string, number>>({});
  const [rfRestock, setRfRestock] = useState<Record<string, boolean>>({});
  const [rfReason, setRfReason] = useState<RefundReasonCode>("DAMAGED");
  const [rfReasonText, setRfReasonText] = useState("");
  const [rfMethod, setRfMethod] = useState<"CASH" | "ORIGINAL" | "CARD">("CASH");
  const [rfRef, setRfRef] = useState("");
  const [rfKey, setRfKey] = useState("");
  const [rfErr, setRfErr] = useState<string | null>(null);
  const [rfCashErr, setRfCashErr] = useState<string | null>(null);
  const [rfRetry, setRfRetry] = useState(false);
  const [rfBusy, setRfBusy] = useState(false);
  const [rfShiftNo, setRfShiftNo] = useState<number | null>(null);
  const deviceRef = useRef<string | undefined>(undefined);

  const loadRefund = useCallback(
    async (saleId: string) => {
      setRfLoadErr(null);
      const r = await saleForRefundAction({ systemId, unitId, saleId }).catch(() => null);
      if (!r || !r.ok) {
        setRf(null);
        setRfLoadErr(tr(r ? refundErrKey(r.code) : "unknown"));
        return null;
      }
      setRf(r);
      setRfQty({});
      setRfRestock(Object.fromEntries(r.lines.map((l) => [l.lineId, l.stocked])));
      return r;
    },
    [systemId, unitId, tr],
  );
  const openRefund = async () => {
    if (!bill) return;
    setMenuFor(null);
    setRf(null);
    setRfErr(null);
    setRfCashErr(null);
    setRfRetry(false);
    setRfReason("DAMAGED");
    setRfReasonText("");
    setRfMethod("CASH");
    setRfKey(newKey("refund"));
    setRfShiftNo(null);
    setRefundOpen(true);
    deviceRef.current = getPosDeviceId();
    const [r] = await Promise.all([
      loadRefund(bill.id),
      deviceRef.current
        ? currentShiftAction({ systemId, unitId, deviceId: deviceRef.current })
            .then((s) => setRfShiftNo(s.ok && s.shift ? s.shift.shiftNo : null))
            .catch(() => setRfShiftNo(null))
        : Promise.resolve(),
    ]);
    const p = r?.payments ?? [];
    const orig = p.find((x) => x.type === "PROMPTPAY") ?? p.find((x) => x.type === "TRANSFER");
    setRfRef(orig?.reference ?? "");
  };
  const closeRefund = useCallback(() => {
    if (!rfBusy) setRefundOpen(false);
  }, [rfBusy]);

  const originalPay = useMemo(() => {
    const p = rf?.payments ?? [];
    return p.find((x) => x.type === "PROMPTPAY") ?? p.find((x) => x.type === "TRANSFER") ?? null;
  }, [rf]);
  const cardPay = useMemo(() => (rf?.payments ?? []).find((x) => x.type === "CARD") ?? null, [rf]);

  /** ราคาร่าง (สูตรเดียวกับ refund.ts) */
  const draft = useMemo(() => {
    if (!rf) return { lines: [] as { lineId: string; qty: number; amount: number; restock: boolean | null }[], total: 0, stockQty: 0, points: 0 };
    const lines = rf.lines
      .map((l) => {
        const q = rfQty[l.lineId] ?? 0;
        return { l, q, amount: q > 0 ? refundLineAmount(l.netSatang, l.qty, l.refundedQty, l.refundedSatang, q) : 0 };
      })
      .filter((x) => x.q > 0);
    const linesSum = lines.reduce((n, x) => n + x.amount, 0);
    const full = rf.lines.every((l) => l.refundedQty + (rfQty[l.lineId] ?? 0) >= l.qty);
    const sc = lines.length ? refundServiceCharge(rf.sale.serviceChargeSatang, linesSum, rf.sale.netTotalSatang, rf.sale.serviceChargeRefundedSatang, full) : 0;
    const total = linesSum + sc;
    const stockQty = lines.filter((x) => x.l.stocked && rfRestock[x.l.lineId] !== false).reduce((n, x) => n + x.q, 0);
    const points = rf.member && rf.sale.netTotalSatang > 0 ? Math.round((rf.member.pointsEarned * total) / rf.sale.netTotalSatang) : 0;
    return {
      lines: lines.map((x) => ({ lineId: x.l.lineId, qty: x.q, amount: x.amount, restock: x.l.stocked ? rfRestock[x.l.lineId] !== false : null })),
      total,
      stockQty,
      points,
    };
  }, [rf, rfQty, rfRestock]);
  const setLineQty = (lineId: string, q: number) => {
    setRfQty((m) => ({ ...m, [lineId]: q }));
    setRfErr(null);
    setRfRetry(false);
  };
  const payTypeOf = (): RefundPayType => (rfMethod === "CASH" ? "CASH" : rfMethod === "CARD" ? "CARD" : originalPay?.type === "TRANSFER" ? "TRANSFER" : "PROMPTPAY");
  const submitRefund = async () => {
    if (!rf || rfBusy || draft.lines.length === 0) return;
    if (rfReason === "OTHER" && !rfReasonText.trim()) {
      setRfErr(tr("reasonRequired"));
      return;
    }
    setRfBusy(true);
    setRfErr(null);
    setRfCashErr(null);
    setRfRetry(false);
    try {
      const type = payTypeOf();
      const reference = type === "CASH" ? null : rfRef.trim().slice(0, 100) || null;
      const r = await refundSaleAction({
        systemId,
        unitId,
        ...(deviceRef.current ? { deviceId: deviceRef.current } : {}),
        refund: {
          saleId: rf.sale.id,
          lines: draft.lines.map((l) => ({ lineId: l.lineId, qty: l.qty, restock: l.restock })),
          payMethods: draft.total > 0 ? [{ type, amountSatang: draft.total, reference }] : [],
          reasonCode: rfReason,
          reason: rfReasonText.trim() || null,
          ...(deviceRef.current ? { deviceId: deviceRef.current } : {}),
          idempotencyKey: rfKey,
        },
      });
      if (r.ok) {
        setRefundOpen(false);
        setToast(t("toastRefunded", { no: r.refund.receiptNo ?? "" }));
        refreshAll();
        return;
      }
      if (r.code === "PAYMENT_MISMATCH" || r.code === "IDEMPOTENCY_CONFLICT") {
        // ยอดบนเซิร์ฟเวอร์เปลี่ยน (มีคนคืนไปก่อน) / คีย์นี้ถูกใช้กับรายการอื่นแล้ว (แก้รอบ 1 F2) — โหลดใหม่ · คำขอใหม่ = คีย์ใหม่
        await loadRefund(rf.sale.id);
        setRfKey(newKey("refund"));
        setRfErr(t("refund.changed"));
        refreshAll();
      } else if (r.code === "SHIFT_REQUIRED") setRfCashErr(tr("shiftRequired"));
      else if (r.code === "UNKNOWN") {
        setRfErr(tr("unknown"));
        setRfRetry(true);
      } else setRfErr(tr(refundErrKey(r.code)));
    } catch {
      setRfErr(tr("unknown"));
      setRfRetry(true);
    } finally {
      setRfBusy(false);
    }
  };

  // ── Esc ปิดลิ้นชัก (เมื่อไม่มีกล่องเปิดทับ) ──
  useEffect(() => {
    if (!selectedId || voidOpen || refundOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuFor) setMenuFor(null);
        else closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, voidOpen, refundOpen, menuFor, closeDrawer]);

  // ── ส่งออกหน้านี้ ──
  const exportCsv = () => {
    if (!ok) return;
    const csv = billsCsv(
      ok.items,
      [t("col.no"), t("col.time"), t("col.channel"), t("col.customer"), t("col.pay"), t("col.staff"), t("col.total"), t("csv.refunded"), t("col.status")],
      (r) => [r.receiptNo ?? "", bkkHm(r.time, locale), channelLabel(r.sourceModule, t, ts), r.customer ? `${r.customer.name}${r.customer.sub ? ` (${r.customer.sub})` : ""}` : "", payText(r, t, ts), r.staffName, (r.grandTotalSatang / 100).toFixed(2), (r.refundedSatang / 100).toFixed(2), t(`status.${chipOf(r)}`)],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bills-${date}-p${ok.page}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const setFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const lastPage = ok ? Math.max(1, Math.ceil(ok.total / ok.pageSize)) : 1;
  const filtered = !!(q || channel || staffUserId || status !== "ALL");

  // ═══════════ แถวของตาราง / การ์ด ═══════════
  const rowMenu = (r: BillRow) =>
    menuFor === r.id ? (
      <div role="menu" className="absolute right-2 top-[calc(100%-6px)] z-30 flex min-w-[170px] flex-col rounded-xl border bg-[color:var(--color-surface)] p-1 text-left text-[13px] shadow-lg">
        <button type="button" role="menuitem" data-testid="pos-bills-menu-view" className="min-h-[44px] rounded-lg px-3 text-left hover:bg-[color:var(--color-surface-2)]" onClick={(e) => {
            e.stopPropagation();
            setMenuFor(null);
          }}>
          {t("menu.view")}
        </button>
        {bill && bill.id === r.id ? (
          <>
            {bill.can.reprint ? (
              <button type="button" role="menuitem" data-testid="pos-bills-menu-reprint" className="min-h-[44px] rounded-lg px-3 text-left hover:bg-[color:var(--color-surface-2)]" onClick={(e) => {
                  e.stopPropagation();
                  void reprint(r.id);
                }}>
                {t("menu.reprint")}
              </button>
            ) : null}
            {bill.can.refund ? (
              <button type="button" role="menuitem" data-testid="pos-bills-menu-refund" className="min-h-[44px] rounded-lg px-3 text-left hover:bg-[color:var(--color-surface-2)]" onClick={(e) => {
                  e.stopPropagation();
                  void openRefund();
                }}>
                {t("menu.refund")}
              </button>
            ) : null}
            {bill.can.void ? (
              <button type="button" role="menuitem" data-testid="pos-bills-menu-void" className="min-h-[44px] rounded-lg px-3 text-left text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]" onClick={(e) => {
                  e.stopPropagation();
                  openVoid();
                }}>
                {t("menu.void")}
              </button>
            ) : null}
          </>
        ) : (
          <span className="px-3 py-2 text-[12px] text-[color:var(--color-muted)]">{t("loading")}</span>
        )}
      </div>
    ) : null;
  const onMenu = (e: React.MouseEvent, r: BillRow) => {
    e.stopPropagation();
    if (selectedId !== r.id) openBill(r.id);
    setMenuFor((cur) => (cur === r.id ? null : r.id));
  };

  const customerCell = (r: BillRow) =>
    r.customer ? (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{r.customer.name}</span>
        {r.customer.sub ? <small className="truncate text-[11px] text-[color:var(--color-muted)]">{r.customer.sub}</small> : null}
      </span>
    ) : (
      <span className="text-[color:var(--color-muted)]">{t("walkIn")}</span>
    );

  const drawerOpen = selectedId !== null;

  return (
    <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:gap-5">
      {/* ═══ รายการ ═══ */}
      <div className="flex min-w-0 flex-1 flex-col gap-5" data-testid="pos-bills-list">
        {/* แถบบน */}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1">
            <button type="button" data-testid="pos-bills-date-prev" aria-label={t("datePrev")} className="btn btn-ghost h-11 w-11 !px-0" onClick={() => setFilter(() => setDate((d) => addBillDays(d, -1)))}>
              <BillIcon name="left" />
            </button>
            {/* แก้รอบ 1 F6: ป้ายที่เห็น = วันที่ไทย (พ.ศ.) แบบภาพ 12 · ช่องวันที่ของเบราว์เซอร์ซ้อนทับโปร่งใส (แตะ = เปิดตัวเลือกวัน) */}
            <label className="input relative flex h-11 w-auto min-w-[170px] cursor-pointer items-center gap-2 font-semibold">
              <BillIcon name="cal" className="text-[color:var(--color-muted)]" />
              <span aria-hidden className="tabular-nums">
                {dateLabel(date, locale)}
              </span>
              <input
                type="date"
                data-testid="pos-bills-date"
                value={date}
                max={today}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setFilter(() => setDate(e.target.value));
                }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {
                    /* เบราว์เซอร์ไม่รองรับ showPicker — ใช้การแตะปกติ */
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${t("date")} ${dateLabel(date, locale)}`}
              />
            </label>
            <button type="button" data-testid="pos-bills-date-next" aria-label={t("dateNext")} disabled={date >= today} className="btn btn-ghost h-11 w-11 !px-0 disabled:opacity-40" onClick={() => setFilter(() => setDate((d) => addBillDays(d, 1)))}>
              <BillIcon name="right" />
            </button>
          </div>
          <label className="input flex h-11 min-w-[180px] max-w-[300px] flex-1 items-center gap-2">
            <BillIcon name="search" className="text-[color:var(--color-muted)]" />
            <input
              type="search"
              data-testid="pos-bills-search"
              value={qInput}
              maxLength={60}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {units.length > 1 ? (
            <select
              data-testid="pos-bills-unit"
              aria-label={t("unit")}
              className="input h-11 w-auto"
              value={unitId}
              onChange={(e) => {
                window.location.href = `?unit=${encodeURIComponent(e.target.value)}`;
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          ) : null}
          <select data-testid="pos-bills-channel" aria-label={t("allChannels")} className="input h-11 w-auto" value={channel} onChange={(e) => setFilter(() => setChannel(e.target.value))}>
            <option value="">{t("allChannels")}</option>
            {(ok?.channels ?? []).map((c) => (
              <option key={c} value={c}>
                {channelLabel(c, t, ts)}
              </option>
            ))}
          </select>
          <select data-testid="pos-bills-staff" aria-label={t("allStaff")} className="input h-11 w-auto" value={staffUserId} onChange={(e) => setFilter(() => setStaffUserId(e.target.value))}>
            <option value="">{t("allStaff")}</option>
            {(ok?.staff ?? []).map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="hidden flex-1 xl:block" />
          <button type="button" data-testid="pos-bills-export" className="btn btn-ghost h-11" disabled={!ok || ok.items.length === 0} onClick={exportCsv}>
            <BillIcon name="download" />
            {t("export")}
          </button>
        </div>

        {/* ชิปสถานะ (ตัวเลขของทั้งวัน ไม่ขึ้นกับตัวกรอง) */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("statusFilter")}>
          {BILL_STATUS_FILTERS.map((s) => {
            const k = STATUS_CHIP_KEY[s];
            const on = status === s;
            const danger = s === "OFF_SHIFT_CASH";
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={`pos-bills-chip-${k}`}
                onClick={() => setFilter(() => setStatus(s))}
                className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-lg border px-3 text-[13px] ${
                  on
                    ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]"
                    : danger
                      ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
                      : "bg-[color:var(--color-surface)]"
                }`}
              >
                {t(`chip.${k}`)}
                <b className={`tabular-nums ${on ? "" : danger ? "" : "text-[color:var(--color-muted)]"}`}>{ok ? ok.counts[k] : "–"}</b>
              </button>
            );
          })}
        </div>

        {/* การ์ดสรุป */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="pos-bills-summary">
          <SummaryCard testid="pos-bills-sum-net" label={t("sum.net")} value={ok ? money(ok.summary.netSatang) : "–"} sub={t("sum.netSub")} />
          <SummaryCard
            testid="pos-bills-sum-count"
            label={t("sum.bills")}
            value={ok ? String(ok.summary.billCount) : "–"}
            sub={ok ? t("sum.billsSub", { store: ok.summary.storeCount, online: ok.summary.onlineCount }) : ""}
          />
          <SummaryCard testid="pos-bills-sum-avg" label={t("sum.avg")} value={ok ? money(ok.summary.avgSatang) : "–"} sub={ok ? t("sum.avgSub", { y: money(ok.summary.yesterdayAvgSatang) }) : ""} />
        </div>

        {/* ตาราง */}
        <div className="card min-w-0 overflow-hidden !p-0">
          {data && !data.ok ? (
            <div className="flex flex-col items-start gap-3 p-6 text-sm" data-testid="pos-bills-error">
              <span className="text-[color:var(--color-danger)]">{te(errKey(data.code))}</span>
              <button type="button" data-testid="pos-bills-retry" className="btn btn-ghost min-h-[44px]" onClick={() => setReloadTick((n) => n + 1)}>
                {t("retry")}
              </button>
            </div>
          ) : ok && ok.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center" data-testid="pos-bills-empty">
              <BillIcon name="doc" size={28} className="text-[color:var(--color-muted)]" />
              <span className="text-[15px] font-bold">{filtered ? t("empty.noMatch") : hasAnyBill ? t("empty.noBillsDate", { date: dateLabel(date, locale) }) : t("empty.noBillsEver")}</span>
              {!filtered && hasAnyBill ? <span className="text-[13px] text-[color:var(--color-muted)]">{t("empty.noBillsDateSub")}</span> : null}
              {filtered ? (
                <button
                  type="button"
                  data-testid="pos-bills-clear"
                  className="btn btn-ghost mt-2 min-h-[44px]"
                  onClick={() =>
                    setFilter(() => {
                      setQInput("");
                      setQ("");
                      setChannel("");
                      setStaffUserId("");
                      setStatus("ALL");
                    })
                  }
                >
                  {t("empty.clear")}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* md+ ตาราง */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead>
                    <tr className="border-b text-left text-[12px] text-[color:var(--color-muted)]">
                      <th className="px-3 py-2.5 font-semibold">{t("col.no")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.time")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.channel")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.customer")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.pay")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.staff")}</th>
                      <th className="px-2 py-2.5 text-right font-semibold">{t("col.total")}</th>
                      <th className="px-2 py-2.5 font-semibold">{t("col.status")}</th>
                      <th className="w-12 px-2 py-2.5">
                        <span className="sr-only">{t("col.menu")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className={loading ? "opacity-60" : ""}>
                    {(ok?.items ?? []).map((r) => {
                      const chip = chipOf(r);
                      const voided = chip === "VOIDED";
                      const active = r.id === selectedId;
                      return (
                        <tr
                          key={r.id}
                          data-testid="pos-bills-row"
                          data-bill-id={r.id}
                          aria-selected={active}
                          onClick={() => openBill(r.id)}
                          className={`relative cursor-pointer border-b last:border-0 hover:bg-[color:var(--color-surface-2)] ${voided ? "text-[color:var(--color-muted)]" : ""} ${active ? "bg-[color:var(--color-surface-2)]" : ""}`}
                        >
                          <td className={`whitespace-nowrap px-3 py-3 font-bold tabular-nums ${active ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""} ${voided ? "line-through" : ""}`}>{r.receiptNo ?? "—"}</td>
                          <td className="whitespace-nowrap px-2 py-3 tabular-nums">{bkkHm(r.time, locale)}</td>
                          <td className="max-w-[120px] px-2 py-3">
                            <ChannelChip src={r.sourceModule} t={t} ts={ts} />
                          </td>
                          <td className="max-w-[180px] px-2 py-3">{customerCell(r)}</td>
                          <td className="px-2 py-3">{payText(r, t, ts)}</td>
                          <td className="px-2 py-3">
                            <span className="flex flex-col">
                              <span>{r.staffName}</span>
                              {voided && r.voidApprovedBy ? <small className="text-[11px] text-[color:var(--color-muted)]">{t("approvedBy", { name: r.voidApprovedBy })}</small> : null}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">
                            <span className="flex flex-col items-end">
                              <span className="font-semibold">{money(r.grandTotalSatang)}</span>
                              {r.refundedSatang > 0 ? <small className="text-[11px] text-[color:var(--color-muted)]">{t("refundedSub", { amount: money(r.refundedSatang) })}</small> : null}
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <StatusChip chip={chip} t={t} />
                          </td>
                          <td className="relative px-1 py-1 text-right">
                            <button type="button" data-testid="pos-bills-row-menu" aria-haspopup="menu" aria-expanded={menuFor === r.id} aria-label={t("col.menu")} className="inline-grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={(e) => onMenu(e, r)}>
                              <BillIcon name="dots" />
                            </button>
                            {rowMenu(r)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* 390 การ์ด */}
              <ul className={`flex flex-col md:hidden ${loading ? "opacity-60" : ""}`}>
                {(ok?.items ?? []).map((r) => {
                  const chip = chipOf(r);
                  const voided = chip === "VOIDED";
                  return (
                    <li key={r.id} className={`relative border-b last:border-0 ${r.id === selectedId ? "shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                      <button type="button" data-testid="pos-bills-card" data-bill-id={r.id} onClick={() => openBill(r.id)} className={`flex min-h-[64px] w-full flex-col gap-1 px-4 py-3 pr-14 text-left ${voided ? "text-[color:var(--color-muted)]" : ""}`}>
                        <span className="flex w-full items-center gap-2">
                          <b className={`tabular-nums ${voided ? "line-through" : ""}`}>{r.receiptNo ?? "—"}</b>
                          <span className="text-[12px] tabular-nums text-[color:var(--color-muted)]">{bkkHm(r.time, locale)}</span>
                          <span className="flex-1" />
                          <span className="font-semibold tabular-nums">{money(r.grandTotalSatang)}</span>
                        </span>
                        <span className="flex w-full flex-wrap items-center gap-2 text-[12px]">
                          <ChannelChip src={r.sourceModule} t={t} ts={ts} />
                          <span className="min-w-0 truncate text-[color:var(--color-muted)]">
                            {r.customer ? r.customer.name : t("walkIn")} · {payText(r, t, ts)}
                          </span>
                          <span className="flex-1" />
                          <StatusChip chip={chip} t={t} />
                        </span>
                        {r.refundedSatang > 0 ? <small className="text-[11px] text-[color:var(--color-muted)]">{t("refundedSub", { amount: money(r.refundedSatang) })}</small> : null}
                      </button>
                      <button type="button" data-testid="pos-bills-card-menu" aria-haspopup="menu" aria-label={t("col.menu")} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-lg" onClick={(e) => onMenu(e, r)}>
                        <BillIcon name="dots" />
                      </button>
                      {rowMenu(r)}
                    </li>
                  );
                })}
              </ul>
              {!ok && loading ? <div className="px-6 py-10 text-center text-sm text-[color:var(--color-muted)]">{t("loading")}</div> : null}
            </>
          )}
          {/* แบ่งหน้า */}
          {ok && ok.total > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-[12px] text-[color:var(--color-muted)]">
              <span data-testid="pos-bills-showing">{t("showing", { n: ok.items.length, total: ok.total })}</span>
              <span className="flex-1" />
              <button type="button" data-testid="pos-bills-page-prev" aria-label={t("pagePrev")} disabled={ok.page <= 1} className="btn btn-ghost h-11 w-11 !px-0 disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <BillIcon name="left" size={14} />
              </button>
              {pageList(ok.page, lastPage).map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    data-testid={`pos-bills-page-${p}`}
                    aria-current={p === ok.page ? "page" : undefined}
                    className={`h-11 min-w-[44px] rounded-lg border px-2 text-[13px] tabular-nums ${p === ok.page ? "border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]" : "bg-[color:var(--color-surface)]"}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button type="button" data-testid="pos-bills-page-next" aria-label={t("pageNext")} disabled={ok.page >= lastPage} className="btn btn-ghost h-11 w-11 !px-0 disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>
                <BillIcon name="right" size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ═══ ลิ้นชักบิล (lg+: คอลัมน์ขวา 360/420 · <lg: แผ่นเต็มจอ) ═══ */}
      {drawerOpen ? (
        <aside
          data-testid="pos-bills-drawer"
          aria-label={t("drawer.title")}
          className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[color:var(--color-surface)] lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:w-[360px] lg:shrink-0 lg:rounded-2xl lg:border xl:w-[420px]"
        >
          {!detail ? (
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex justify-end">
                <button type="button" data-testid="pos-bills-drawer-close" aria-label={t("drawer.close")} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeDrawer}>
                  <BillIcon name="x" />
                </button>
              </div>
              <span className="text-sm text-[color:var(--color-muted)]">{t("loading")}</span>
            </div>
          ) : !detail.ok ? (
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="flex justify-end">
                <button type="button" data-testid="pos-bills-drawer-close" aria-label={t("drawer.close")} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeDrawer}>
                  <BillIcon name="x" />
                </button>
              </div>
              <span className="text-sm text-[color:var(--color-danger)]">{te(errKey(detail.code))}</span>
            </div>
          ) : bill ? (
            <>
              {/* หัว */}
              <div className="border-b px-5 pb-3 pt-4">
                <div className="flex items-center gap-3">
                  <h2 className={`text-[16px] font-bold tabular-nums ${bill.status === "VOIDED" ? "line-through" : ""}`}>{bill.receiptNo ?? "—"}</h2>
                  <StatusChip chip={chipOf({ status: bill.status, refundedSatang: bill.totals.refunded })} t={t} />
                  <span className="flex-1" />
                  <button type="button" data-testid="pos-bills-drawer-close" aria-label={t("drawer.close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeDrawer}>
                    <BillIcon name="x" />
                  </button>
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--color-muted)]">
                  {[bkkHm(bill.time, locale), bill.staffName, bill.deviceName, channelLabel(bill.sourceModule, t, ts), bill.shiftNo !== null ? t("drawer.shiftNo", { no: bill.shiftNo }) : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              {/* รายการ */}
              <section className="border-b px-5 py-3 text-[13px]">
                <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("drawer.items")}</h3>
                {bill.lines.map((l, i) => (
                  <div key={i} className="flex items-baseline gap-3 py-1">
                    <span className="w-7 shrink-0 font-bold tabular-nums">{l.qty}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-words">{l.name}</span>
                      {l.options.map((o, j) => (
                        <small key={j} className="text-[11px] text-[color:var(--color-muted)]">
                          {o}
                        </small>
                      ))}
                    </span>
                    <span className="font-semibold tabular-nums">{money(l.lineTotalSatang)}</span>
                  </div>
                ))}
              </section>
              {/* ยอด */}
              <section className="border-b px-5 py-3 text-[13px] tabular-nums">
                {bill.totals.lineDiscount + bill.totals.billDiscount + bill.totals.coupon + bill.totals.tier > 0 ? (
                  <div className="flex justify-between py-0.5 text-[color:var(--color-muted)]">
                    <span>{t("drawer.discount")}</span>
                    <span>−{money(bill.totals.lineDiscount + bill.totals.billDiscount + bill.totals.coupon + bill.totals.tier)}</span>
                  </div>
                ) : null}
                {bill.totals.serviceCharge > 0 ? (
                  <div className="flex justify-between py-0.5 text-[color:var(--color-muted)]">
                    <span>{t("drawer.serviceCharge")}</span>
                    <span>{money(bill.totals.serviceCharge)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-1 text-[15px] font-bold">
                  <span>{t("drawer.net")}</span>
                  <span>{money(bill.totals.grandTotal)}</span>
                </div>
                {bill.totals.vatSatang > 0 ? (
                  <div className="flex justify-between py-0.5 text-[12px] text-[color:var(--color-muted)]">
                    <span>{t("drawer.vatIncl", { rate: (bill.totals.vatRateBp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) })}</span>
                    <span>{money(bill.totals.vatSatang)}</span>
                  </div>
                ) : null}
                {bill.totals.tip > 0 ? (
                  <div className="flex justify-between py-0.5 text-[12px] text-[color:var(--color-muted)]">
                    <span>{t("drawer.tip")}</span>
                    <span>{money(bill.totals.tip)}</span>
                  </div>
                ) : null}
                {bill.totals.refunded > 0 ? (
                  <div className="flex justify-between py-0.5 text-[12px] text-[color:var(--color-accent)]">
                    <span>{t("drawer.refunded")}</span>
                    <span>−{money(bill.totals.refunded)}</span>
                  </div>
                ) : null}
              </section>
              {/* การชำระ */}
              <section className="border-b px-5 py-3 text-[13px]">
                <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("drawer.payments")}</h3>
                {bill.payments.length === 0 ? <span className="text-[color:var(--color-muted)]">—</span> : null}
                {bill.payments.map((p, i) => (
                  <div key={i} className="flex justify-between gap-3 py-0.5 tabular-nums">
                    <span className="min-w-0 text-[color:var(--color-ink-soft)]">
                      {methodLabel(p.type, ts)}
                      {p.type === "CASH" && p.tenderedSatang !== undefined ? ` · ${t("drawer.cashLine", { tendered: money(p.tenderedSatang), change: money(p.changeSatang ?? 0) })}` : ""}
                      {p.type !== "CASH" && p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span>{money(p.amountSatang)}</span>
                  </div>
                ))}
              </section>
              {/* สมาชิก · บัญชี · ใบกำกับ */}
              {bill.member || bill.accounting || bill.receiptKind === "TAX_INVOICE_ABB" ? (
                <section className="flex flex-col gap-1 border-b px-5 py-3 text-[13px]">
                  {bill.member ? (
                    <div className="flex min-h-[32px] items-center gap-2.5">
                      <BillIcon name="user" className="text-[color:var(--color-muted)]" />
                      <span className="min-w-0 truncate">
                        {t("drawer.member")} · <b>{bill.member.name}</b>
                        {bill.member.pointsEarned > 0 ? ` · ${t("drawer.points", { n: bill.member.pointsEarned })}` : ""}
                      </span>
                      <span className="flex-1" />
                      <Link data-testid="pos-bills-member-link" href={`/app/members/${bill.member.customerId}`} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--color-accent)]">
                        {t("drawer.viewMember")}
                      </Link>
                    </div>
                  ) : null}
                  {bill.accounting ? (
                    <div className="flex min-h-[32px] items-center gap-2.5">
                      <BillIcon name="book" className="text-[color:var(--color-muted)]" />
                      <span>{t("drawer.posted")} ·</span>
                      {accountSystemId ? (
                        <Link data-testid="pos-bills-accounting-link" href={`/app/sys/${accountSystemId}/account/print/${bill.accounting.docId}`} className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--color-accent)]">
                          {bill.accounting.docNo ?? "—"}
                        </Link>
                      ) : (
                        <b>{bill.accounting.docNo ?? "—"}</b>
                      )}
                    </div>
                  ) : null}
                  {bill.receiptKind === "TAX_INVOICE_ABB" ? (
                    <div className="flex min-h-[32px] items-center gap-2.5">
                      <BillIcon name="doc" className="text-[color:var(--color-muted)]" />
                      <span>
                        {t("drawer.abb")} <b className="tabular-nums">{bill.receiptNo}</b>
                      </span>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {/* ประวัติบิล */}
              <section className="px-5 py-3 text-[12px]">
                <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("drawer.history")}</h3>
                <ol className="flex flex-col gap-1" data-testid="pos-bills-timeline">
                  {bill.timeline.map((h, i) => (
                    <li key={i} className="flex gap-4 text-[color:var(--color-ink-soft)]">
                      <span className="w-10 shrink-0 tabular-nums text-[color:var(--color-muted)]">{bkkHm(h.time, locale)}</span>
                      <span className="min-w-0 break-words">{h.text}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {/* ปุ่ม */}
              <div className="mt-auto flex flex-col gap-3 border-t px-5 pb-4 pt-3">
                {drawerErr ? <span className="text-[13px] text-[color:var(--color-danger)]">{drawerErr}</span> : null}
                {bill.can.reprint ? (
                  <button type="button" data-testid="pos-bills-reprint" disabled={reprintBusy} className="btn btn-ghost h-12 rounded-[12px]" onClick={() => void reprint(bill.id)}>
                    <BillIcon name="print" />
                    {t("drawer.reprint")}
                  </button>
                ) : null}
                <div className={`grid gap-3 ${bill.can.refund ? "grid-cols-2" : "grid-cols-1"}`}>
                  <button
                    type="button"
                    data-testid="pos-bills-void-open"
                    disabled={!bill.can.void}
                    className="btn btn-ghost h-12 rounded-[12px] border-[color:var(--color-danger)] text-[color:var(--color-danger)] disabled:border-[color:var(--color-line)] disabled:text-[color:var(--color-muted)]"
                    onClick={openVoid}
                  >
                    <BillIcon name="x" />
                    {t("drawer.void")}
                  </button>
                  {bill.can.refund ? (
                    <button type="button" data-testid="pos-bills-refund-open" className="btn btn-primary h-12 rounded-[12px]" onClick={() => void openRefund()}>
                      {t("drawer.refund")}
                    </button>
                  ) : null}
                </div>
                {!bill.can.void ? (
                  <span className="text-center text-[11px] text-[color:var(--color-muted)]" data-testid="pos-bills-void-hint">
                    {t(`voidHint.${bill.voidBlockedReason ?? "OTHER"}`)}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </aside>
      ) : null}

      {/* ═══ กล่องยกเลิกบิล (U6) ═══ */}
      {voidOpen && bill ? (
        <BillDialog labelledBy="pos-bills-void-title" testid="pos-bills-void" onClose={closeVoid}>
          <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
            <h2 id="pos-bills-void-title" className="text-[17px] font-bold">
              {t("voidDlg.title", { no: bill.receiptNo ?? "" })}
            </h2>
            <span className="flex-1" />
            <button type="button" data-testid="pos-bills-void-close" aria-label={t("drawer.close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeVoid}>
              <BillIcon name="x" />
            </button>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-bold">{t("voidDlg.reason")}</span>
              <textarea
                data-testid="pos-bills-void-reason"
                value={voidReason}
                maxLength={VOID_REASON_MAX}
                rows={3}
                onChange={(e) => {
                  setVoidReason(e.target.value);
                  setVoidErr(null);
                }}
                placeholder={t("voidDlg.placeholder")}
                className="input"
                autoFocus
              />
              <span className="self-end text-[11px] tabular-nums text-[color:var(--color-muted)]">
                {voidReason.length}/{VOID_REASON_MAX}
              </span>
            </label>
            <div className="flex gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-[13px] text-[color:var(--color-danger)]">
              <BillIcon name="lock" className="mt-0.5" />
              <span>{t("voidDlg.warn")}</span>
            </div>
            {voidErr ? (
              <span className="text-[13px] text-[color:var(--color-danger)]" data-testid="pos-bills-void-error">
                {voidErr}
              </span>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t px-5 pb-4 pt-3">
            <button type="button" data-testid="pos-bills-void-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={voidBusy} onClick={closeVoid}>
              {t("voidDlg.back")}
            </button>
            <button
              type="button"
              data-testid="pos-bills-void-confirm"
              disabled={voidBusy || !voidReason.trim()}
              className="btn h-12 rounded-[12px] bg-[color:var(--color-danger)] px-6 text-[color:var(--color-surface)] disabled:opacity-50"
              onClick={() => void submitVoid()}
            >
              {t("voidDlg.confirm")}
            </button>
          </div>
        </BillDialog>
      ) : null}

      {/* ═══ หน้าต่างคืนเงินบางส่วน (U7) ═══ */}
      {refundOpen && bill ? (
        <BillDialog labelledBy="pos-bills-refund-title" testid="pos-bills-refund" wide onClose={closeRefund}>
          <div className="flex items-center gap-4 border-b px-5 pb-3 pt-4">
            <h2 id="pos-bills-refund-title" className="text-[17px] font-bold">
              {t("refund.title")}
            </h2>
            <span className="min-w-0 truncate text-[12px] text-[color:var(--color-muted)]">
              {[bill.receiptNo, money(bill.totals.grandTotal), bill.member?.name ?? null].filter(Boolean).join(" · ")}
            </span>
            <span className="flex-1" />
            <button type="button" data-testid="pos-bills-refund-close" aria-label={t("drawer.close")} className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeRefund}>
              <BillIcon name="x" />
            </button>
          </div>
          {!rf ? (
            <div className="px-5 py-8 text-sm">{rfLoadErr ? <span className="text-[color:var(--color-danger)]">{rfLoadErr}</span> : <span className="text-[color:var(--color-muted)]">{t("loading")}</span>}</div>
          ) : (
            <>
              <div className="flex flex-col gap-5 px-5 py-4">
                {/* รายการ */}
                <div>
                  <div className="mb-1.5 text-[12px] font-bold text-[color:var(--color-ink-soft)]">{t("refund.pick")}</div>
                  <div className="overflow-hidden rounded-xl border">
                    {rf.lines.map((l) => {
                      const q = rfQty[l.lineId] ?? 0;
                      const done = l.refundableQty === 0;
                      const weighed = l.weightGrams !== null;
                      const amount = q > 0 ? refundLineAmount(l.netSatang, l.qty, l.refundedQty, l.refundedSatang, q) : 0;
                      return (
                        <div key={l.lineId} className={`flex flex-col gap-1 border-t px-3 py-2 first:border-t-0 ${q > 0 ? "bg-[color:var(--color-surface-2)]" : ""}`}>
                          <div className="flex items-center gap-3 text-[13px]">
                            <label className="-my-1 -ml-2 grid h-11 w-11 shrink-0 place-items-center">
                              <input
                                type="checkbox"
                                data-testid="pos-bills-refund-line"
                                aria-label={l.name}
                                disabled={done}
                                checked={q > 0}
                                onChange={(e) => setLineQty(l.lineId, e.target.checked ? (weighed ? l.refundableQty : 1) : 0)}
                                className="h-5 w-5 accent-[color:var(--color-ink)]"
                              />
                            </label>
                            <span className={`min-w-0 flex-1 ${done ? "text-[color:var(--color-muted)]" : ""}`}>
                              {l.name}
                              <small className="ml-1.5 text-[11px] text-[color:var(--color-muted)]">{done ? t("refund.fullyRefunded") : weighed ? t("refund.weighed") : money(l.unitPriceSatang)}</small>
                            </span>
                            {!done && !weighed ? (
                              <span className="flex h-11 items-center rounded-lg border bg-[color:var(--color-surface)] text-[13px]">
                                <button type="button" data-testid="pos-bills-refund-minus" aria-label="−" disabled={q <= 0} className="h-11 w-10 text-[color:var(--color-muted)] disabled:opacity-40" onClick={() => setLineQty(l.lineId, Math.max(0, q - 1))}>
                                  −
                                </button>
                                <b className="w-8 border-x text-center leading-[42px] tabular-nums">{q}</b>
                                <button type="button" data-testid="pos-bills-refund-plus" aria-label="+" disabled={q >= l.refundableQty} className="h-11 w-10 text-[color:var(--color-muted)] disabled:opacity-40" onClick={() => setLineQty(l.lineId, Math.min(l.refundableQty, q + 1))}>
                                  +
                                </button>
                              </span>
                            ) : null}
                            <span className="w-12 shrink-0 text-[11px] text-[color:var(--color-muted)]">{t("refund.of", { n: l.refundableQty })}</span>
                            <span className={`w-16 shrink-0 text-right font-semibold tabular-nums ${q > 0 ? "" : "text-[color:var(--color-muted)]"}`}>{money(amount)}</span>
                          </div>
                          {l.stocked && !done ? (
                            <label className={`ml-9 flex min-h-[44px] items-center gap-2 text-[12px] ${q > 0 ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-muted)]"}`}>
                              <input
                                type="checkbox"
                                data-testid="pos-bills-refund-restock"
                                checked={rfRestock[l.lineId] !== false}
                                onChange={(e) => setRfRestock((m) => ({ ...m, [l.lineId]: e.target.checked }))}
                                className="h-4 w-4 accent-[color:var(--color-ink)]"
                              />
                              {t("refund.restock")}
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* เหตุผล */}
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-bold text-[color:var(--color-ink-soft)]">{t("refund.reason")}</span>
                    <select data-testid="pos-bills-refund-reason" className="input h-12 max-w-[280px] font-semibold" value={rfReason} onChange={(e) => setRfReason(e.target.value as RefundReasonCode)}>
                      {REFUND_REASON_CODES.map((c) => (
                        <option key={c} value={c}>
                          {t(`refund.reasons.${c}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rfReason === "OTHER" ? (
                    <input
                      type="text"
                      data-testid="pos-bills-refund-reason-text"
                      className="input h-11"
                      maxLength={REFUND_REASON_MAX}
                      value={rfReasonText}
                      onChange={(e) => setRfReasonText(e.target.value)}
                      placeholder={t("refund.otherText")}
                      aria-label={t("refund.otherText")}
                    />
                  ) : null}
                </div>
                {/* คืนเงินด้วย */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-[color:var(--color-ink-soft)]">{t("refund.method")}</span>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <button
                      type="button"
                      data-testid="pos-bills-refund-method-cash"
                      aria-pressed={rfMethod === "CASH"}
                      onClick={() => {
                        setRfMethod("CASH");
                        setRfCashErr(null);
                      }}
                      className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight ${rfMethod === "CASH" ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""}`}
                    >
                      {t("refund.m.cash")}
                      <small className="text-[11px] font-normal text-[color:var(--color-muted)]">{rfShiftNo !== null ? t("refund.m.cashSub", { no: rfShiftNo }) : t("refund.m.cashNoShift")}</small>
                    </button>
                    {originalPay ? (
                      <button
                        type="button"
                        data-testid="pos-bills-refund-method-original"
                        aria-pressed={rfMethod === "ORIGINAL"}
                        onClick={() => {
                          setRfMethod("ORIGINAL");
                          setRfRef(originalPay.reference ?? "");
                        }}
                        className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight ${rfMethod === "ORIGINAL" ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""}`}
                      >
                        {originalPay.type === "TRANSFER" ? t("refund.m.transfer") : t("refund.m.promptpay")}
                        <small className="text-[11px] font-normal text-[color:var(--color-muted)]">{t("refund.m.originalSub")}</small>
                      </button>
                    ) : null}
                    {cardPay ? (
                      <button
                        type="button"
                        data-testid="pos-bills-refund-method-card"
                        aria-pressed={rfMethod === "CARD"}
                        onClick={() => {
                          setRfMethod("CARD");
                          setRfRef(cardPay.reference ?? "");
                        }}
                        className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight ${rfMethod === "CARD" ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""}`}
                      >
                        {t("refund.m.card")}
                        <small className="text-[11px] font-normal text-[color:var(--color-muted)]">{t("refund.m.cardSub")}</small>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid="pos-bills-refund-method-credit"
                      disabled
                      aria-disabled="true"
                      className="flex min-h-[52px] cursor-not-allowed flex-col items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight text-[color:var(--color-muted)] opacity-60"
                    >
                      {t("refund.m.credit")}
                      <small className="text-[11px] font-normal">{t("refund.m.creditSub")}</small>
                    </button>
                  </div>
                  {rfCashErr && rfMethod === "CASH" ? (
                    <span className="text-[12px] text-[color:var(--color-danger)]" data-testid="pos-bills-refund-cash-error">
                      {rfCashErr}
                    </span>
                  ) : null}
                  {rfMethod !== "CASH" ? (
                    <input
                      type="text"
                      data-testid="pos-bills-refund-reference"
                      className="input h-11 max-w-[320px]"
                      maxLength={100}
                      value={rfRef}
                      onChange={(e) => setRfRef(e.target.value)}
                      placeholder={t("refund.reference")}
                      aria-label={t("refund.reference")}
                    />
                  ) : null}
                </div>
                {/* สรุป */}
                <div className="rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-4 py-3 text-[13px] text-[color:var(--color-ink-soft)]" data-testid="pos-bills-refund-summary">
                  <div className="mb-1 text-[15px] font-bold text-[color:var(--color-ink)]">{t("refund.summary", { amount: money(draft.total) })}</div>
                  <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    {rf.member ? (
                      <li className="flex items-center gap-2">
                        <BillIcon name="check" size={14} className="text-[color:var(--color-accent)]" />
                        {t("refund.tickPoints", { n: draft.points })}
                      </li>
                    ) : null}
                    <li className="flex items-center gap-2">
                      <BillIcon name="check" size={14} className="text-[color:var(--color-accent)]" />
                      {t("refund.tickStock", { n: draft.stockQty })}
                    </li>
                    <li className="flex items-center gap-2">
                      <BillIcon name="check" size={14} className="text-[color:var(--color-accent)]" />
                      {t("refund.tickCn")}
                    </li>
                    {rf.accounting ? (
                      <li className="flex items-center gap-2">
                        <BillIcon name="check" size={14} className="text-[color:var(--color-accent)]" />
                        {t("refund.tickJv")}
                      </li>
                    ) : null}
                  </ul>
                </div>
                {rfErr ? (
                  <div className="flex flex-wrap items-center gap-3 text-[13px] text-[color:var(--color-danger)]" data-testid="pos-bills-refund-error">
                    <span>{rfErr}</span>
                    {rfRetry ? (
                      <button type="button" data-testid="pos-bills-refund-retry" className="btn btn-ghost min-h-[44px]" disabled={rfBusy} onClick={() => void submitRefund()}>
                        {t("retry")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t px-5 pb-4 pt-3">
                <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-muted)]">
                  <BillIcon name="lock" size={12} />
                  {t("refund.auditNote")}
                </span>
                <span className="flex-1" />
                <button type="button" data-testid="pos-bills-refund-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={rfBusy} onClick={closeRefund}>
                  {t("refund.cancel")}
                </button>
                <button type="button" data-testid="pos-bills-refund-confirm" disabled={rfBusy || draft.lines.length === 0} className="btn btn-primary h-12 rounded-[12px] px-6 disabled:opacity-50" onClick={() => void submitRefund()}>
                  {t("refund.confirm", { amount: money(draft.total) })}
                </button>
              </div>
            </>
          )}
        </BillDialog>
      ) : null}

      {toast ? (
        <div role="status" data-testid="pos-bills-toast" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[color:var(--color-ink)] px-4 py-3 text-sm text-[color:var(--color-surface)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
