"use client";

// BillsClient.tsx — POS P1.16 U หน้า "บิลวันนี้" (ภาพ 12): แถบบน (วันที่ · ค้นหา · ช่องทาง · พนักงาน · ส่งออกหน้านี้) · ชิปสถานะ ·
//   การ์ดสรุป 3 ใบ · ตารางบิล (390 = การ์ดเรียงลง) + แบ่งหน้า · ลิ้นชักบิลด้านขวา (420 / 360 ที่ 1024 · 390 = แผ่นเต็มจอ) ·
//   กล่องยกเลิกบิล · หน้าต่างคืนเงินบางส่วน (ราคาร่างฝั่ง client ด้วย refund-math · เซิร์ฟเวอร์คือความจริง)
// 🔴 โหลดหน้า = billsPageDataAction คำขอเดียว · เปิดบิล = billDetailAction · หลังยกเลิก/คืน/พิมพ์สำเนา โหลดใหม่ทั้งรายการและลิ้นชัก
// 🔴 คำปฏิเสธแสดงผ่านคีย์ (pos.bills.errors.* · pos.refund.errors.* · pos.receipt.errors.*) ไม่แสดง message ไทยของเซิร์ฟเวอร์
// 🔴 คีย์กันซ้ำ: ยกเลิกบิล 1 คีย์ต่อการเปิดกล่อง · คืนเงิน 1 คีย์ต่อการเปิดหน้าต่าง (ยอดเปลี่ยน = ออกคีย์ใหม่ · ขัดข้อง = ลองซ้ำด้วยคีย์เดิม)
// ไม่ทำในใบนี้ (มติ CD3): "รอเงินเข้า" (P1.7) · ส่ง LINE (P1.11) · ขอใบเต็มรูป (P1.13) · เครดิตร้าน (กระเป๋าสมาชิก) · "กำลังทำรายการคืนเงิน" (presence)
// POS P1.13U ▸ แถวใบกำกับในลิ้นชัก (ภาพ 12 · มติ 4): ABB "ขอใบเต็มรูป" (ออกทีหลัง) · คำขอของลูกค้า ออก/ปฏิเสธ · ออกแล้ว = เลข + ผู้ซื้อ —
//   ปุ่มเฉพาะผู้มีสิทธิ์ pos.taxinvoice.issue ที่สาขา (หน้าเพจส่ง canIssueTaxInvoice) · กล่องเดียวกับหน้าขาย (TaxInvoiceDialog โหมด issue) ◂
// POS P1.11U ▸ แถวส่งใบเสร็จในลิ้นชัก: ส่ง LINE (บิลสมาชิก) · ส่งอีเมล (แผ่นช่องเดียว) · คัดลอกลิงก์ใบเสร็จ (receiptLinkAction · ไม่เขียน audit) ◂
// POS P2.1U ▸ ช่องทางขาย (มติ 3–4 · ภาพ 12/09): คอลัมน์ "ช่องทาง" = ชื่อช่องทางขาย (แพลตฟอร์ม = กรอบดำหนา · ระบบอื่นที่เป็นหน้าร้านปริยาย = ป้ายระบบเดิม) ·
//   ลูกค้า = เลขออเดอร์แพลตฟอร์มเมื่อไม่มีสมาชิก · วิธีชำระ "แพลตฟอร์ม" · ตัวกรอง "ทุกช่องทาง" (salesChannelId) ข้างตัวกรองระบบต้นทางเดิม ·
//   การ์ดบิลบรรทัดรอง "หน้าร้าน N · ออนไลน์ M" (ออนไลน์ = ทุกช่องทางที่ไม่ใช่ STORE · นับจากตัวกรอง salesChannelId ของเซิร์ฟเวอร์) ·
//   ลิ้นชัก = บล็อกค่าคอมฯ ใต้ยอด (ตัวเลขเฉพาะเมื่อเซิร์ฟเวอร์ส่ง commission* — pos.report.view) · ไม่มีบนใบเสร็จ ◂

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { billDetailAction, billsPageDataAction, voidSaleAction } from "@/lib/modules/pos/bills-actions";
import { BILLS_ERROR_KEYS, BILLS_SYSTEM_NAME, BILL_STATUS_FILTERS, VOID_REASON_MAX, addBillDays, type BillDetail, type BillDetailResult, type BillRow, type BillStatusFilter, type BillsPageDataResult } from "@/lib/modules/pos/bills-shared";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { heartbeatAction } from "@/lib/modules/pos/device-actions"; // POS P1.15U F8: เครื่องลงทะเบียนไหม
import { receiptLinkAction, reprintReceiptAction } from "@/lib/modules/pos/receipt-actions";
import { sendReceiptAction } from "@/lib/modules/pos/receipt-send-actions";
import { RECEIPT_EMAIL_RE } from "@/lib/modules/pos/receipt-public-shared";
import { receiptRefusalMessageKey } from "@/lib/modules/pos/receipt-render";
// POS P1.10 U ▸ พิมพ์สำเนาผ่านโมดูลพิมพ์ (มติ CD4) — วิธีพิมพ์/กระดาษตามค่าตั้งเครื่องนี้ (heartbeat) ◂
import { thisDevicePrinter } from "@/components/pos/print/device-printer";
import { printReceipt } from "@/components/pos/print/printReceipt";
import { printErrorKey } from "@/components/pos/print/types";
import { refundSaleAction, saleForRefundAction } from "@/lib/modules/pos/refund-actions";
import { refundLineAmount, refundServiceCharge } from "@/lib/modules/pos/refund-math";
import { REFUND_ERROR_KEYS, REFUND_REASON_CODES, REFUND_REASON_MAX, type RefundPayType, type RefundReasonCode, type SaleForRefund } from "@/lib/modules/pos/refund-shared";
import { currentShiftAction } from "@/lib/modules/pos/shift-actions";
import { TaxInvoiceDialog, type TaxInvoiceSubmitResult } from "@/components/pos/register/TaxInvoiceDialog";
import { issueFromTaxInvoiceRequestAction, issueFullTaxInvoiceAction, rejectTaxInvoiceRequestAction } from "@/lib/modules/pos/tax-invoice-actions";
import { buyerKindFromTaxId, taxInvoiceRefusalKey, type TaxInvoiceBuyerInput } from "@/lib/modules/pos/tax-invoice-shared";
// POS P1.15U ▸ ผู้ขอ = คนในโทเคนของเครื่องนี้ (มติ 2) · รหัสปฏิเสธของ PIN/สายอนุมัติ (มติ 6) · กล่องรอผู้จัดการอนุมัติ 21B ◂
import { refusalMessageKey, type PosApprovalView } from "@/lib/modules/pos/register-shared";
import { clearStaffSession, readStaffSession } from "@/lib/modules/pos/staff-session";
import { listStaffForDeviceAction } from "@/lib/modules/pos/staff-pin-actions";
import { ManagerPinPad, type ManagerPinResult } from "@/components/pos/register/ManagerPinPad";
import { posApprovalStatusAction } from "@/lib/modules/pos/pos-approval-actions";
import { ApprovalWaitDialog, type ApprovalPinResult } from "@/components/pos/register/ApprovalWaitDialog";
import { BillChannelPill, BillIcon, StatusChip, SummaryCard, bkkHm, billChannelText, billsCsv, channelLabel, chipOf, dateLabel, methodLabel, money, payText, type T } from "./bills-ui";
// POS P2.1U ▸ ช่องทางขาย: รายการช่องทางของสาขา (หาอัตราค่าคอมฯ ของบล็อกในลิ้นชัก) + เครื่องคิดค่าคอมฯ ฝั่ง client (บริสุทธิ์) ◂
import { listChannelsAction } from "@/lib/modules/pos/channel-actions";
import { channelCommission, channelNet, type ChannelItem } from "@/lib/modules/pos/channel-shared";
import { channelDisplayName, channelRateText } from "@/components/pos/settings/channel-text";

type Unit = { id: string; name: string };
type Props = {
  systemId: string;
  units: Unit[];
  unitId: string;
  today: string;
  initialDate: string;
  hasAnyBill: boolean;
  accountSystemId: string | null;
  /** POS P1.13U มติ 4: ผู้ใช้มีสิทธิ์ pos.taxinvoice.issue ที่สาขานี้ (เจ้าของ/ผู้จัดการโดยปริยาย) — false = ไม่มีปุ่มออก/ปฏิเสธ */
  canIssueTaxInvoice?: boolean;
};
/** P1.13U: เหตุผลที่ปฏิเสธคำขอใบกำกับ (มติ 4 — แผ่นเหตุผล ≤200 · เซิร์ฟเวอร์รับ ≤500) */
const TAX_REJECT_MAX = 200;
const sameRequestBuyer = (a: TaxInvoiceBuyerInput, b: TaxInvoiceBuyerInput) =>
  a.kind === b.kind &&
  a.name.trim() === b.name.trim() &&
  a.taxId === b.taxId &&
  (a.branchCode || "00000") === (b.branchCode || "00000") &&
  a.address.trim() === b.address.trim() &&
  (a.email?.trim() || null) === (b.email?.trim() || null);
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

export function BillsClient({ systemId, units, unitId, today, initialDate, hasAnyBill, accountSystemId, canIssueTaxInvoice = false }: Props) {
  const t = useTranslations("pos.bills") as T;
  const ts = useTranslations("pos.shift") as T;
  const te = useTranslations("pos.bills.errors") as T;
  const tr = useTranslations("pos.refund.errors") as T;
  const trc = useTranslations("pos.receipt") as T;
  const tpos = useTranslations("pos") as T;
  const trg = useTranslations("pos.register");
  const tch = useTranslations("pos.channel") as T; // POS P2.1U ◂
  const locale = useLocale();
  // POS P1.18U ▸ มติ 9 (บิล drawer en): ชื่อผู้ทำ "ระบบ" (ไม่มีผู้ใช้) + ไทม์ไลน์ แปลตามภาษาจอ (kind + params จากเซิร์ฟเวอร์ · ไม่มี kind = text เดิม) ◂
  const who = (n: string) => (n === BILLS_SYSTEM_NAME ? t("drawer.system") : n);
  const timelineText = (h: BillDetail["timeline"][number]): string => {
    const p = h.params ?? {};
    const name = typeof p.name === "string" ? who(p.name) : "";
    const str = (v: unknown) => (typeof v === "string" && v ? v : "");
    switch (h.kind) {
      case "paid":
        return [t("drawer.timeline.paid"), name].filter(Boolean).join(" · ");
      case "posted":
        return [t("drawer.timeline.posted", { docNo: str(p.docNo) }).trim(), p.points === true ? t("drawer.timeline.points") : ""].filter(Boolean).join(" · ");
      case "refund": {
        const code = str(p.reasonCode);
        const reason = code ? ((REFUND_REASON_CODES as readonly string[]).includes(code) ? t(`refund.reasons.${code}`) : code) : "";
        return [t("drawer.timeline.refund", { amount: money(typeof p.amountSatang === "number" ? p.amountSatang : 0) }), name, reason, str(p.receiptNo)].filter(Boolean).join(" · ");
      }
      case "void":
        return [t("drawer.timeline.void"), name, str(p.reason)].filter(Boolean).join(" · ");
      case "reprint":
        return [t("drawer.timeline.reprint"), name].filter(Boolean).join(" · ");
      default:
        return h.text;
    }
  };

  // ── ตัวกรอง ──
  const [date, setDate] = useState(initialDate);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("");
  const [salesChannelId, setSalesChannelId] = useState(""); // POS P2.1U ▸ มติ 3 ◂
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
      ...(salesChannelId ? { salesChannelId } : {}),
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
  }, [systemId, unitId, date, status, q, channel, salesChannelId, staffUserId, page, reloadTick]);

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

  // ── POS P2.1U ▸ มติ 3: "หน้าร้าน N · ออนไลน์ M" ของทั้งวัน (บิลที่ไม่ยกเลิก = การ์ด "บิล") ──
  //   N = บิลช่องทาง STORE (ตัวกรอง salesChannelId ทั้งวัน − ที่ยกเลิก) · M = บิลทั้งหมด − N · คิดใหม่เมื่อวัน/สาขา/ตัวเลขของวันเปลี่ยน
  //   สาขาที่ยังไม่มีแถวช่องทาง (บิลเดิมทั้งหมด) = ตัวเลขเดิมของเซิร์ฟเวอร์ (sourceModule)
  const storeChannelId = ok?.salesChannels.find((c) => c.code === "STORE")?.id ?? null;
  const dayKey = ok ? `${unitId}|${ok.date}|${ok.counts.all}|${ok.counts.voided}|${ok.summary.billCount}|${storeChannelId ?? ""}|${ok.salesChannels.length}` : null;
  const [chSum, setChSum] = useState<{ key: string; store: number; online: number } | null>(null);
  useEffect(() => {
    if (!ok || !dayKey) return;
    const live = ok.summary.billCount;
    if (!storeChannelId) {
      setChSum(ok.salesChannels.length > 0 ? { key: dayKey, store: 0, online: live } : { key: dayKey, store: ok.summary.storeCount, online: ok.summary.onlineCount });
      return;
    }
    let alive = true;
    const base = { systemId, unitId, date: ok.date, salesChannelId: storeChannelId, page: 1, pageSize: 10 as const };
    Promise.all([billsPageDataAction({ ...base, status: "ALL" }), billsPageDataAction({ ...base, status: "VOIDED" })])
      .then(([a, v]) => {
        if (!alive || !a.ok || !v.ok) return;
        const store = Math.max(0, a.total - v.total);
        setChSum({ key: dayKey, store, online: Math.max(0, live - store) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- คิดใหม่ตาม dayKey เท่านั้น (ตัวกรอง/หน้าไม่เกี่ยว)
  }, [dayKey]);
  const channelSum = chSum && chSum.key === dayKey ? chSum : null;

  // ── POS P2.1U ▸ มติ 4: อัตราค่าคอมฯ ของบล็อกในลิ้นชัก — บิลเก็บแค่ยอดค่าคอมฯ (สำเนาตอนขาย) ไม่เก็บอัตรา ⇒
  //   อ่านอัตราปัจจุบันของช่องทาง แล้วแสดงเฉพาะเมื่อคิดซ้ำได้ยอดตรงกับบิลทุกสตางค์ (เปลี่ยนอัตราหลังขาย = ไม่แสดงอัตรา ไม่เดา) ──
  const [unitChannels, setUnitChannels] = useState<{ unitId: string; items: ChannelItem[] } | null>(null);
  const wantRates = !!bill?.channel && bill.channel.code !== "STORE" && bill.channel.commissionSatang !== undefined;
  useEffect(() => {
    if (!wantRates || unitChannels?.unitId === unitId) return;
    let alive = true;
    listChannelsAction({ systemId, unitId, includeArchived: true })
      .then((r) => {
        if (alive && r.ok) setUnitChannels({ unitId, items: r.items });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [wantRates, unitChannels, systemId, unitId]);
  const commissionRate = (b: Detail): string => {
    const ch = b.channel;
    if (!ch || ch.commissionSatang === undefined || unitChannels?.unitId !== unitId) return "";
    const it = unitChannels.items.find((c) => c.code === ch.code);
    if (!it) return "";
    // POS P2.1U fix รอบ 1 ▸ F3: ยอดชนเพดาน (ค่าคอมฯ = ยอดบิล) หรือยอด 0 ⇒ อัตราหลายชุดให้ยอดเดียวกัน — ไม่แสดงอัตรา ◂
    if (b.totals.grandTotal <= 0 || ch.commissionSatang === b.totals.grandTotal) return "";
    const again = channelCommission(b.totals.grandTotal, it);
    return again.commissionSatang === ch.commissionSatang && again.commissionVatSatang === (ch.commissionVatSatang ?? 0) ? channelRateText(it) : "";
  };
  const refreshAll = useCallback(() => {
    setReloadTick((n) => n + 1);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ── POS P1.15U ▸ โทเคนผู้ขาย · รหัสใหม่ · คำขอที่รออนุมัติของบิลนี้ (ปุ่ม "รออนุมัติ…") · 21B ◂
  /** โทเคนของเครื่องนี้ (มี = ส่ง deviceId + staffToken · ไม่มี = ผู้ใช้ session ตามเดิม) */
  const tokenFields = (): { deviceId?: string; staffToken?: string } => {
    const dev = getPosDeviceId();
    const st = dev ? readStaffSession(dev) : null;
    return dev && st ? { deviceId: dev, staffToken: st.staffToken } : {};
  };
  /** PIN_* · DEVICE_REVOKED · APPROVAL_* · PENDING_APPROVAL · STAFF_TOKEN_INVALID → ข้อความของหน้าขาย (ไม่ใช่ "unknown") */
  const posErr = (code: string): string => (code === "PIN_LOCKED" ? trg("lock.pinLocked") : trg(refusalMessageKey(code)));
  type Wait = { requestId: string; kind: "void" | "refund"; saleId: string; void?: { reason: string; key: string }; refund?: Parameters<typeof refundSaleAction>[0]["refund"] };
  const [wait, setWait] = useState<Wait | null>(null);
  const [openReq, setOpenReq] = useState<{ saleId: string; requestId: string; kind: "void" | "refund" } | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    posApprovalStatusAction({ systemId, unitId, saleId: selectedId })
      .then((r) => {
        if (!alive) return;
        const v = r.ok ? r.request : null;
        setOpenReq(v && (v.status === "PENDING" || v.status === "EXPIRED") ? { saleId: selectedId, requestId: v.requestId, kind: v.kind === "POS_REFUND" ? "refund" : "void" } : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [systemId, unitId, selectedId, reloadTick]);
  const pendingFor = (saleId: string, kind: "void" | "refund") => (openReq && openReq.saleId === saleId && openReq.kind === kind ? openReq : null);
  const waitDone = (v: PosApprovalView) => {
    const kind = wait?.kind ?? "void";
    setWait(null);
    setOpenReq(null);
    if (v.status === "APPROVED") setToast(trg(kind === "refund" ? "approval.approvedRefund" : "approval.approvedVoid"));
    else if (v.status === "REJECTED") setToast(v.note ? trg("approval.rejected", { reason: v.note }) : trg("approval.rejectedNoReason"));
    else setToast(trg("approval.cancelled"));
    refreshAll();
  };
  /** 21B: PIN ผู้จัดการ = ส่งคำขอเดิมซ้ำพร้อม managerPin + managerUserId (ยกเลิก: เหตุผล/คีย์เดิม · คืนเงิน: คำขอเดิมทั้งก้อน) */
  const waitPin = async (managerUserId: string, managerPin: string, view: PosApprovalView | null): Promise<ApprovalPinResult> => {
    if (!wait) return { ok: false, code: "NOT_FOUND" };
    if (wait.kind === "void") {
      const reason = wait.void?.reason ?? view?.reason ?? "";
      const r = await voidSaleAction({ systemId, unitId, saleId: wait.saleId, reason, idempotencyKey: wait.void?.key ?? newKey("void"), managerPin, managerUserId, ...tokenFields() });
      if (!r.ok) return { ok: false, code: r.code };
      setWait(null);
      setOpenReq(null);
      setToast(t("toastVoided"));
      refreshAll();
      return { ok: true };
    }
    if (!wait.refund) return { ok: false, code: "VALIDATION" };
    const r = await refundSaleAction({ systemId, unitId, ...(wait.refund.deviceId ? { deviceId: wait.refund.deviceId } : {}), refund: { ...wait.refund, managerPin, managerUserId } });
    if (!r.ok) return { ok: false, code: r.code };
    setWait(null);
    setOpenReq(null);
    setToast(t("toastRefunded", { no: r.refund.receiptNo ?? "" }));
    refreshAll();
    return { ok: true };
  };

  // ── POS P1.15U ▸ fix รอบ 1 F8: เครื่องที่ลงทะเบียน (+ ร้านมี PIN แล้ว) = ยกเลิก/คืนเงินต้องมีโทเคนที่ยังใช้ได้ · ไม่มี/ตาย = "ใส่ PIN ที่หน้าขายก่อน" ·
  //    NO_PERMISSION = แป้น PIN ผู้จัดการ (managerPin + managerUserId) · เครื่องไม่ลงทะเบียน = เหมือนเดิม ◂
  //    fix รอบ 2 N1: null = กำลังตรวจเครื่อง (ยกเลิก/คืนเงินถูกกันไว้) · ตรวจล้ม/ไม่ ok = true (ปิดไว้ก่อน — แบบเดียวกับหน้าขาย)
  const [pinShop, setPinShop] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dev = getPosDeviceId();
      if (!dev) return setPinShop(false);
      const hb = await heartbeatAction({ systemId, unitId, deviceCode: dev }).catch(() => null);
      if (!alive) return;
      if (!hb?.ok) return setPinShop(true);
      if (!hb.device || hb.device.status !== "ACTIVE") return setPinShop(false);
      const ls = await listStaffForDeviceAction({ systemId, unitId, deviceId: dev }).catch(() => null);
      if (alive) setPinShop(!ls || !ls.ok || ls.items.some((x) => x.hasPin));
    })();
    return () => {
      alive = false;
    };
  }, [systemId, unitId]);
  const [needPin, setNeedPin] = useState(false);
  /** ต้องมีโทเคน แต่ไม่มี = เปิดข้อความ "ใส่ PIN ที่หน้าขายก่อน" แล้วคืน false */
  const requireToken = (): boolean => {
    if (pinShop === null) return false; // N1: ยังตรวจเครื่องไม่เสร็จ (ปุ่มแสดง "กำลังตรวจสถานะเครื่อง…")
    if (pinShop && !tokenFields().staffToken) {
      setNeedPin(true);
      return false;
    }
    return true;
  };
  const tokenDead = () => {
    clearStaffSession(getPosDeviceId());
    setVoidOpen(false);
    setRefundOpen(false);
    setNeedPin(true);
  };
  const [mgrPin, setMgrPin] = useState<{ kind: "void" } | { kind: "refund"; refund: Parameters<typeof refundSaleAction>[0]["refund"] } | null>(null);
  const mgrPinSubmit = async (managerUserId: string, managerPin: string): Promise<ManagerPinResult> => {
    if (!mgrPin || !bill) return { ok: false, code: "NOT_FOUND" };
    if (mgrPin.kind === "void") {
      const r = await voidSaleAction({ systemId, unitId, saleId: bill.id, reason: voidReason.trim(), idempotencyKey: voidKey, managerPin, managerUserId, ...tokenFields() });
      if (!r.ok) {
        if (r.code === "STAFF_TOKEN_INVALID") {
          setMgrPin(null);
          tokenDead();
        }
        return { ok: false, code: r.code };
      }
      setMgrPin(null);
      setVoidOpen(false);
      setToast(t("toastVoided"));
      refreshAll();
      return { ok: true };
    }
    const r = await refundSaleAction({ systemId, unitId, ...(mgrPin.refund.deviceId ? { deviceId: mgrPin.refund.deviceId } : {}), refund: { ...mgrPin.refund, managerPin, managerUserId } });
    if (!r.ok) {
      if (r.code === "STAFF_TOKEN_INVALID") {
        setMgrPin(null);
        tokenDead();
      }
      return { ok: false, code: r.code };
    }
    setMgrPin(null);
    setRefundOpen(false);
    setToast(t("toastRefunded", { no: r.refund.receiptNo ?? "" }));
    refreshAll();
    return { ok: true };
  };

  // ── ยกเลิกบิล ──
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidKey, setVoidKey] = useState("");
  const [voidErr, setVoidErr] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const openVoid = () => {
    if (!requireToken()) return; // F8
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
    if (!requireToken()) {
      setVoidOpen(false);
      return;
    }
    setVoidBusy(true);
    setVoidErr(null);
    try {
      const r = await voidSaleAction({ systemId, unitId, saleId: bill.id, reason, idempotencyKey: voidKey, ...tokenFields() });
      if (r.ok) {
        setVoidOpen(false);
        setToast(t("toastVoided"));
        refreshAll();
      } else if (r.code === "APPROVAL_REQUIRED" || r.code === "PENDING_APPROVAL") {
        // POS P1.15U ▸ มติ 6: ต้องรออนุมัติ ⇒ 21B (PIN ผู้จัดการ = ส่งซ้ำด้วยเหตุผล/คีย์เดิม) ◂
        setVoidOpen(false);
        setOpenReq({ saleId: bill.id, requestId: r.requestId, kind: "void" });
        setWait({ requestId: r.requestId, kind: "void", saleId: bill.id, void: { reason, key: voidKey } });
      } else if (r.code === "STAFF_TOKEN_INVALID") tokenDead(); // F8
      else if (r.code === "NO_PERMISSION" && pinShop) setMgrPin({ kind: "void" }); // F8: ผู้จัดการอนุญาตด้วย PIN ที่เครื่องนี้
      else setVoidErr(errKey(r.code) !== "unknown" ? te(errKey(r.code)) : posErr(r.code));
    } catch {
      setVoidErr(te("unknown"));
    } finally {
      setVoidBusy(false);
    }
  };

  // แก้รอบ 1 F3 (R5) → P1.10 U: ค่าตั้งเครื่องพิมพ์ของเครื่องนี้ (heartbeat ตัวเดียวกับหน้าขาย) ?? เบราว์เซอร์ 80 มม. ·
  //   P1.10 U แก้รอบ 1 F7: อ่านใหม่ทุกครั้งที่พิมพ์ (ผู้จัดการเปลี่ยนวิธีพิมพ์/กระดาษระหว่างหน้าเปิดอยู่ได้) · สำเนาไม่เปิดลิ้นชัก (F1)
  const tp = useTranslations("pos.print") as T;

  // ── พิมพ์สำเนา: printReceipt ตามวิธีพิมพ์ของเครื่องนี้ · พิมพ์ตรงไม่ได้ (ไม่รองรับ/ยังไม่จับคู่) = พิมพ์ผ่านเบราว์เซอร์แทน ──
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
      const dev = await thisDevicePrinter(systemId, unitId);
      const lc = locale.startsWith("en") ? "en" : "th";
      let res = await printReceipt(r.payload, dev.config, { locale: lc, deviceCode: dev.deviceCode, kickDrawer: false });
      if (!res.ok && res.via !== "browser" && (res.code === "UNSUPPORTED" || res.code === "NO_DEVICE")) res = await printReceipt(r.payload, { ...dev.config, mode: "browser" }, { locale: lc, kickDrawer: false });
      if (!res.ok) {
        setDrawerErr(tp(printErrorKey(res.code)));
        return;
      }
      setToast(t("toastReprint"));
      if (selectedId === saleId) void loadDetail(saleId);
    } catch {
      setDrawerErr(trc("errors.internal"));
    } finally {
      setReprintBusy(false);
    }
  };

  // ── POS P1.11U ▸ ส่งใบเสร็จ (sendReceiptAction · คำปฏิเสธ = toast ผ่าน receiptRefusalMessageKey) ──
  const [sendBusy, setSendBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const send = async (saleId: string, via: "LINE" | "EMAIL", email?: string): Promise<boolean> => {
    if (sendBusy) return false;
    setSendBusy(true);
    try {
      const r = await sendReceiptAction({ systemId, saleId, via, ...(email ? { email } : {}) });
      if (!r.ok) {
        if (via === "EMAIL") setEmailErr(trc(receiptRefusalMessageKey(r.code)));
        else setToast(trc(receiptRefusalMessageKey(r.code)));
        return false;
      }
      setToast(trc(via === "LINE" ? "send.sentLine" : "send.sentEmail"));
      if (selectedId === saleId) void loadDetail(saleId);
      return true;
    } catch {
      if (via === "EMAIL") setEmailErr(trc("errors.internal"));
      else setToast(trc("errors.internal"));
      return false;
    } finally {
      setSendBusy(false);
    }
  };
  const openEmail = () => {
    setEmailTo("");
    setEmailErr(null);
    setEmailOpen(true);
  };
  const closeEmail = useCallback(() => setEmailOpen(false), []);
  const submitEmail = async (saleId: string) => {
    const to = emailTo.trim();
    if (to && !RECEIPT_EMAIL_RE.test(to)) return setEmailErr(trc("send.emailInvalid"));
    setEmailErr(null);
    if (await send(saleId, "EMAIL", to || undefined)) setEmailOpen(false);
  };
  const copyLink = async (saleId: string) => {
    if (sendBusy) return;
    setSendBusy(true);
    try {
      const r = await receiptLinkAction({ systemId, saleId }); // F1: อ่านลิงก์อย่างเดียว ไม่เขียน audit reprint
      if (!r.ok) return setToast(trc(receiptRefusalMessageKey(r.code)));
      const url = r.url;
      if (!url) return setToast(trc("send.qrOff"));
      try {
        await navigator.clipboard.writeText(url);
        setToast(trc("send.copied"));
      } catch {
        setToast(trc("send.copyFailed", { url }));
      }
    } catch {
      setToast(trc("errors.internal"));
    } finally {
      setSendBusy(false);
    }
  };
  // ◂

  // ── POS P1.13U ▸ ใบกำกับภาษีเต็มรูป (มติ 4) ──
  //   later = บิล ABB ที่ยังไม่ออก → issueFullTaxInvoiceAction · request = คำขอของลูกค้า: ข้อมูลไม่แก้ = issueFromTaxInvoiceRequestAction · แก้ = issueFullTaxInvoiceAction + requestId
  const [taxDlg, setTaxDlg] = useState<null | { mode: "later" } | { mode: "request"; requestId: string; initial: TaxInvoiceBuyerInput }>(null);
  const [dbdOff, setDbdOff] = useState(false);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectErr, setRejectErr] = useState<string | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const closeTaxDlg = useCallback(() => setTaxDlg(null), []);
  const openTaxRequest = (b: Detail) => {
    const rq = b.taxInvoice.request;
    if (!rq || !b.taxInvoice.requestId) return;
    setTaxDlg({
      mode: "request",
      requestId: b.taxInvoice.requestId,
      initial: { kind: buyerKindFromTaxId(rq.taxId), name: rq.name, taxId: rq.taxId, branchCode: rq.branchCode, address: rq.address, email: rq.email, source: "MANUAL" },
    });
  };
  const issueTaxInvoice = async (buyer: TaxInvoiceBuyerInput, remember: boolean): Promise<TaxInvoiceSubmitResult> => {
    if (!bill || !taxDlg) return;
    const rememberArg = remember && bill.member ? { rememberBuyer: true } : {};
    try {
      const r =
        taxDlg.mode === "request" && sameRequestBuyer(buyer, taxDlg.initial)
          ? await issueFromTaxInvoiceRequestAction({ systemId, unitId, requestId: taxDlg.requestId, ...rememberArg })
          : // fix F3 (มติ): ส่ง requestId เฉพาะเมื่อเลขผู้เสียภาษีตรงคำขอ · เลขต่าง = ออกตามที่กรอก แล้วบริการปฏิเสธคำขอเอง (S fix F5 + audit)
            await issueFullTaxInvoiceAction({ systemId, unitId, saleId: bill.id, buyer, ...(taxDlg.mode === "request" && buyer.taxId === taxDlg.initial.taxId ? { requestId: taxDlg.requestId } : {}), ...rememberArg });
      if (r.ok) {
        setTaxDlg(null);
        setToast(t("taxInvoice.toastIssued", { docNo: r.docNo ?? "\u2014" }));
        refreshAll();
        return;
      }
      if (r.code === "ALREADY_ISSUED") refreshAll(); // ลิ้นชักตามสถานะจริง (มีคนออกไปก่อน)
      return { errorKey: taxInvoiceRefusalKey(r.code) };
    } catch {
      return { errorKey: taxInvoiceRefusalKey("INTERNAL") };
    }
  };
  const openReject = (requestId: string) => {
    setRejectFor(requestId);
    setRejectReason("");
    setRejectErr(null);
  };
  const closeReject = useCallback(() => {
    if (!rejectBusy) setRejectFor(null);
  }, [rejectBusy]);
  const submitReject = async () => {
    if (!rejectFor || rejectBusy) return;
    const reason = rejectReason.trim();
    if (!reason || reason.length > TAX_REJECT_MAX) {
      setRejectErr(tpos(taxInvoiceRefusalKey("VALIDATION")));
      return;
    }
    setRejectBusy(true);
    setRejectErr(null);
    try {
      const r = await rejectTaxInvoiceRequestAction({ systemId, unitId, requestId: rejectFor, reason });
      if (r.ok) {
        setRejectFor(null);
        setToast(t("taxInvoice.toastRejected"));
        refreshAll();
      } else {
        setRejectErr(tpos(taxInvoiceRefusalKey(r.code)));
        if (r.code === "NOT_FOUND") refreshAll();
      }
    } catch {
      setRejectErr(tpos(taxInvoiceRefusalKey("INTERNAL")));
    } finally {
      setRejectBusy(false);
    }
  };
  // ◂

  // ── คืนเงิน ──
  const [refundOpen, setRefundOpen] = useState(false);
  const [rf, setRf] = useState<SaleForRefund | null>(null);
  const [rfLoadErr, setRfLoadErr] = useState<string | null>(null);
  const [rfQty, setRfQty] = useState<Record<string, number>>({});
  const [rfRestock, setRfRestock] = useState<Record<string, boolean>>({});
  const [rfReason, setRfReason] = useState<RefundReasonCode>("DAMAGED");
  const [rfReasonText, setRfReasonText] = useState("");
  const [rfMethod, setRfMethod] = useState<"CASH" | "ORIGINAL" | "CARD" | "PLATFORM">("CASH"); // POS P2.1U ▸ F4: + PLATFORM ◂
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
    if (!requireToken()) return; // F8
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
    if (p.some((x) => x.type === "PLATFORM")) setRfMethod("PLATFORM"); // POS P2.1U ▸ F4: บิลจ่ายผ่านแพลตฟอร์ม = เลือก "แพลตฟอร์ม" ไว้ ◂
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
  const payTypeOf = (): RefundPayType => (rfMethod === "PLATFORM" ? "PLATFORM" : rfMethod === "CASH" ? "CASH" : rfMethod === "CARD" ? "CARD" : originalPay?.type === "TRANSFER" ? "TRANSFER" : "PROMPTPAY");
  const submitRefund = async () => {
    if (!rf || rfBusy || draft.lines.length === 0) return;
    if (!requireToken()) {
      setRefundOpen(false);
      return;
    }
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
      // POS P1.15U ▸ มติ 2: โทเคนผู้ขายของเครื่องนี้ (ผู้ขอ = คนในโทเคน) — เก็บคำขอทั้งก้อนไว้ส่งซ้ำพร้อม PIN ผู้จัดการใน 21B ◂
      const tf = tokenFields();
      const dev = deviceRef.current ?? tf.deviceId;
      const refundIn = {
        saleId: rf.sale.id,
        lines: draft.lines.map((l) => ({ lineId: l.lineId, qty: l.qty, restock: l.restock })),
        payMethods: draft.total > 0 ? [{ type, amountSatang: draft.total, reference }] : [],
        reasonCode: rfReason,
        reason: rfReasonText.trim() || null,
        ...(dev ? { deviceId: dev } : {}),
        idempotencyKey: rfKey,
        ...(tf.staffToken ? { staffToken: tf.staffToken } : {}),
      };
      const r = await refundSaleAction({ systemId, unitId, ...(dev ? { deviceId: dev } : {}), refund: refundIn });
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
      } else if (r.code === "APPROVAL_REQUIRED" || r.code === "PENDING_APPROVAL") {
        // POS P1.15U ▸ มติ 6: ต้องรออนุมัติ ⇒ 21B (PIN ผู้จัดการ = ส่งคำขอคืนเงินเดิมซ้ำทั้งก้อน) ◂
        const refund = refundIn;
        setRefundOpen(false);
        setOpenReq({ saleId: rf.sale.id, requestId: r.requestId, kind: "refund" });
        setWait({ requestId: r.requestId, kind: "refund", saleId: rf.sale.id, refund });
      } else if (r.code === "SHIFT_REQUIRED") setRfCashErr(tr("shiftRequired"));
      else if (r.code === "UNKNOWN") {
        setRfErr(tr("unknown"));
        setRfRetry(true);
      } else if (r.code === "STAFF_TOKEN_INVALID") tokenDead(); // F8
      else if (r.code === "NO_PERMISSION" && pinShop) setMgrPin({ kind: "refund", refund: refundIn }); // F8
      else setRfErr(refundErrKey(r.code) !== "unknown" ? tr(refundErrKey(r.code)) : posErr(r.code));
    } catch {
      setRfErr(tr("unknown"));
      setRfRetry(true);
    } finally {
      setRfBusy(false);
    }
  };

  // ── Esc ปิดลิ้นชัก (เมื่อไม่มีกล่องเปิดทับ) ──
  useEffect(() => {
    // P1.13U ใบกำกับ (taxDlg/rejectFor) + P1.15U แป้น PIN ผู้จัดการ / รออนุมัติ (mgrPin/wait) เปิดทับ ⇒ Esc ปิดกล่องนั้นก่อน ไม่ปิดลิ้นชัก
    if (!selectedId || voidOpen || refundOpen || taxDlg || rejectFor || mgrPin || wait) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuFor) setMenuFor(null);
        else closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, voidOpen, refundOpen, taxDlg, rejectFor, mgrPin, wait, menuFor, closeDrawer]);

  // ── ส่งออกหน้านี้ ──
  const exportCsv = () => {
    if (!ok) return;
    const csv = billsCsv(
      ok.items,
      [t("col.no"), t("col.time"), t("col.channel"), t("col.customer"), t("col.pay"), t("col.staff"), t("col.total"), t("csv.refunded"), t("col.status")],
      (r) => [r.receiptNo ?? "", bkkHm(r.time, locale), billChannelText(r, t, ts, tch), r.customer ? `${r.customer.name}${r.customer.sub ? ` (${r.customer.sub})` : ""}` : (r.channelRef ?? ""), payText(r, t, ts), r.staffName, (r.grandTotalSatang / 100).toFixed(2), (r.refundedSatang / 100).toFixed(2), t(`status.${chipOf(r)}`)],
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
  const filtered = !!(q || channel || salesChannelId || staffUserId || status !== "ALL");

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
    ) : r.channelRef ? (
      // POS P2.1U ▸ มติ 3: บิลแพลตฟอร์มไม่มีสมาชิก = เลขออเดอร์ของแพลตฟอร์มในช่องชื่อ (ภาพ 12 "GF-7610") ◂
      <span className="truncate text-[color:var(--color-muted)] tabular-nums">{r.channelRef}</span>
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
          {/* POS P2.1U ▸ มติ 3: "ทุกช่องทาง" = ช่องทางขาย (salesChannelId) · ตัวกรองเดิม (ระบบต้นทาง = sourceModule) คงไว้ ป้ายว่าง "ทุกระบบ" ◂ */}
          <select data-testid="pos-bills-channel-filter" aria-label={t("allChannels")} className="input h-11 w-auto max-w-[220px]" value={salesChannelId} onChange={(e) => setFilter(() => setSalesChannelId(e.target.value))}>
            <option value="">{t("allChannels")}</option>
            {(ok?.salesChannels ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {channelDisplayName(c.code, c.name, tch)}
              </option>
            ))}
          </select>
          <select data-testid="pos-bills-channel" aria-label={t("channel.allSources")} className="input h-11 w-auto" value={channel} onChange={(e) => setFilter(() => setChannel(e.target.value))}>
            <option value="">{t("channel.allSources")}</option>
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
            sub={
              <span data-testid="pos-bills-channel-summary">{channelSum ? t("summary.channel", { store: channelSum.store, online: channelSum.online }) : "\u00a0"}</span>
            }
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
                      setSalesChannelId("");
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
              {/* md+ ตาราง · POS P2.1U fix รอบ 2 ▸ V1: relative = กรอบเลื่อนเป็นฐานของลูก absolute (sr-only หัวคอลัมน์เมนู) —
                  เดิมฐานอยู่นอกกรอบ ⇒ ตารางกว้างเกินคอลัมน์ข้างลิ้นชักที่ 1024 แล้ว sr-only ไม่ถูกตัด ดัน html ล้นแนวนอน · ตารางเลื่อนในการ์ดเท่านั้น ◂ */}
              <div className="relative hidden overflow-x-auto md:block">
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
                          <td data-testid={`pos-bill-channel-${r.id}`} className="max-w-[140px] px-2 py-3">
                            <BillChannelPill row={r} t={t} ts={ts} tc={tch} />
                          </td>
                          <td className="max-w-[180px] px-2 py-3">{customerCell(r)}</td>
                          <td className="px-2 py-3">{payText(r, t, ts)}</td>
                          <td className="px-2 py-3">
                            <span className="flex flex-col">
                              <span>{who(r.staffName)}</span>
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
                          <span data-testid={`pos-bill-channel-card-${r.id}`} className="inline-flex min-w-0 max-w-[50%]">
                            <BillChannelPill row={r} t={t} ts={ts} tc={tch} />
                          </span>
                          <span className="min-w-0 truncate text-[color:var(--color-muted)]">
                            {r.customer ? r.customer.name : (r.channelRef ?? t("walkIn"))} · {payText(r, t, ts)}
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
                  {[bkkHm(bill.time, locale), who(bill.staffName), bill.deviceName, billChannelText({ sourceModule: bill.sourceModule, salesChannel: bill.channel }, t, ts, tch), bill.shiftNo !== null ? t("drawer.shiftNo", { no: bill.shiftNo }) : null].filter(Boolean).join(" · ")}
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
              {/* POS P2.1U ▸ มติ 4 (ภาพ 09 บล็อกล่าง): ช่องทาง + เลขออเดอร์ · ตัวเลขค่าคอมฯ เฉพาะเมื่อเซิร์ฟเวอร์ส่งมา (pos.report.view) และมีค่าคอมฯ/รับเงินผ่านแพลตฟอร์ม ·
                  สุทธิ = ยอดบิล − ค่าคอมฯ − VAT ค่าคอมฯ · ไม่มีบนใบเสร็จ ◂ */}
              {bill.channel && bill.channel.code !== "STORE" ? (
                <section data-testid="pos-bill-commission" className="flex flex-col gap-0.5 border-b px-5 py-3 text-[13px] tabular-nums">
                  <div data-testid="pos-bill-commission-channel" className="flex min-w-0 items-center gap-2 text-[color:var(--color-ink-soft)]">
                    <span className="min-w-0 truncate">
                      {tch("commissionBlock.channel", { name: channelDisplayName(bill.channel.code, bill.channel.name, tch) })}
                      {bill.channel.ref ? ` \u00b7 ${bill.channel.ref}` : ""}
                    </span>
                  </div>
                  {bill.channel.commissionSatang !== undefined && (bill.channel.payout === "PLATFORM" || bill.channel.commissionSatang + (bill.channel.commissionVatSatang ?? 0) > 0)
                    ? (() => {
                        const c = bill.channel.commissionSatang ?? 0;
                        const v = bill.channel.commissionVatSatang ?? 0;
                        const rate = commissionRate(bill);
                        return (
                          <>
                            <div className="mt-1 flex justify-between gap-3 py-0.5">
                              <span>{tch("commissionBlock.gross")}</span>
                              <span>{money(bill.totals.grandTotal)}</span>
                            </div>
                            <div data-testid="pos-bill-commission-fee" className="flex justify-between gap-3 py-0.5">
                              <span className="min-w-0">{rate ? tch("commissionBlock.commissionRate", { rate }) : tch("commissionBlock.commission")}</span>
                              <span className="text-[color:var(--color-danger)]">−{money(c)}</span>
                            </div>
                            {v > 0 ? (
                              <div className="flex justify-between gap-3 py-0.5">
                                <span>{tch("commissionBlock.vat")}</span>
                                <span className="text-[color:var(--color-danger)]">−{money(v)}</span>
                              </div>
                            ) : null}
                            <div data-testid="pos-bill-commission-net" className="flex justify-between gap-3 pt-1 font-bold">
                              <span>{tch("commissionBlock.net")}</span>
                              <span>{money(channelNet(bill.totals.grandTotal, c, v))}</span>
                            </div>
                            <p className="mt-2 rounded-[10px] border border-dashed px-3 py-2 text-[12px] leading-[1.5] text-[color:var(--color-muted)]">
                              {bill.channel.payout === "PLATFORM" ? tch("commissionBlock.note") : tch("commissionBlock.noteDirect")}
                            </p>
                          </>
                        );
                      })()
                    : null}
                </section>
              ) : null}
              {/* การชำระ */}
              <section className="border-b px-5 py-3 text-[13px]">
                <h3 className="mb-1.5 text-[12px] font-bold text-[color:var(--color-muted)]">{t("drawer.payments")}</h3>
                {bill.payments.length === 0 ? <span className="text-[color:var(--color-muted)]">—</span> : null}
                {bill.payments.map((p, i) => (
                  <div key={i} className="flex justify-between gap-3 py-0.5 tabular-nums">
                    <span className="min-w-0 text-[color:var(--color-ink-soft)]">
                      {methodLabel(p.type, ts, t)}
                      {p.type === "CASH" && p.tenderedSatang !== undefined ? ` · ${t("drawer.cashLine", { tendered: money(p.tenderedSatang), change: money(p.changeSatang ?? 0) })}` : ""}
                      {p.type !== "CASH" && p.reference ? ` · ${p.reference}` : ""}
                    </span>
                    <span>{money(p.amountSatang)}</span>
                  </div>
                ))}
              </section>
              {/* สมาชิก · บัญชี · ใบกำกับ */}
              {bill.member || bill.accounting || bill.receiptKind === "TAX_INVOICE_ABB" || bill.taxInvoice.status !== "NONE" ? (
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
                  {/* POS P1.13U ▸ ใบกำกับ: ออกเต็มรูปแล้ว = แทนแถว ABB · ยังไม่ออก = ABB + "ขอใบเต็มรูป" · ลูกค้าขอ = ออก/ปฏิเสธ ◂ */}
                  {bill.taxInvoice.status === "ISSUED" ? (
                    <div data-testid="pos-taxinv-bill-issued" className="flex min-h-[32px] items-center gap-2.5">
                      <BillIcon name="doc" className="text-[color:var(--color-muted)]" />
                      <span className="min-w-0 truncate">
                        {t("taxInvoice.issued")} <b className="tabular-nums">{bill.taxInvoice.docNo ?? "\u2014"}</b>
                        {bill.taxInvoice.buyerName ? ` \u00b7 ${bill.taxInvoice.buyerName}` : ""}
                      </span>
                    </div>
                  ) : bill.receiptKind === "TAX_INVOICE_ABB" ? (
                    <div data-testid="pos-taxinv-bill-abb" className="flex min-h-[32px] items-center gap-2.5">
                      <BillIcon name="doc" className="text-[color:var(--color-muted)]" />
                      <span>
                        {t("drawer.abb")} <b className="tabular-nums">{bill.receiptNo}</b>
                      </span>
                      <span className="flex-1" />
                      {canIssueTaxInvoice && bill.taxInvoice.status === "NONE" && bill.status === "PAID" && bill.totals.refunded === 0 ? (
                        <button
                          type="button"
                          data-testid="pos-taxinv-request-full"
                          className="inline-flex min-h-[44px] items-center font-semibold text-[color:var(--color-accent)]"
                          onClick={() => setTaxDlg({ mode: "later" })}
                        >
                          {t("taxInvoice.requestFull")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {bill.taxInvoice.status === "REQUESTED" ? (
                    <div data-testid="pos-taxinv-bill-requested" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-1">
                      <BillIcon name="mail" className="text-[color:var(--color-muted)]" />
                      <span className="min-w-0 flex-1">
                        {t("taxInvoice.requested")}
                        {bill.taxInvoice.buyerName ? (
                          <>
                            {" \u00b7 "}
                            <b>{bill.taxInvoice.buyerName}</b>
                          </>
                        ) : null}
                      </span>
                      {canIssueTaxInvoice && bill.taxInvoice.requestId ? (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            data-testid="pos-taxinv-request-reject"
                            className="btn btn-ghost h-11 rounded-[11px] px-3 text-[13px]"
                            onClick={() => openReject(bill.taxInvoice.requestId!)}
                          >
                            {t("taxInvoice.reject")}
                          </button>
                          {/* fix F6: บิลยกเลิก/คืนเงินแล้ว = บริการปฏิเสธการออก (SALE_VOIDED / HAS_REFUNDS) ⇒ ไม่เสนอปุ่มออก (ปฏิเสธคำขอยังทำได้) */}
                          {bill.status === "PAID" && bill.totals.refunded === 0 ? (
                          <button
                            type="button"
                            data-testid="pos-taxinv-request-issue"
                            disabled={!bill.taxInvoice.request}
                            className="btn btn-primary h-11 rounded-[11px] px-3 text-[13px]"
                            onClick={() => openTaxRequest(bill)}
                          >
                            {t("taxInvoice.issue")}
                          </button>
                          ) : null}
                        </span>
                      ) : null}
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
                      <span className="min-w-0 break-words">{timelineText(h)}</span>
                    </li>
                  ))}
                </ol>
              </section>
              {/* ปุ่ม */}
              <div className="mt-auto flex flex-col gap-3 border-t px-5 pb-4 pt-3">
                {drawerErr ? <span className="text-[13px] text-[color:var(--color-danger)]">{drawerErr}</span> : null}
                {/* POS P1.11U ▸ พิมพ์ซ้ำ + ส่ง LINE (แถวเดียวกันตามภาพ 12) · ส่งอีเมล + คัดลอกลิงก์ใบเสร็จ ◂ */}
                <div className="grid grid-cols-2 gap-3">
                  {bill.can.reprint ? (
                    <button type="button" data-testid="pos-bills-reprint" disabled={reprintBusy} className="btn btn-ghost h-12 rounded-[12px] px-2 leading-tight" onClick={() => void reprint(bill.id)}>
                      <BillIcon name="print" />
                      {t("drawer.reprint")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="pos-receipt-send-line"
                    disabled={sendBusy || !bill.member || bill.status === "VOIDED"}
                    className="btn btn-ghost h-12 rounded-[12px] px-2 leading-tight disabled:text-[color:var(--color-muted)]"
                    onClick={() => void send(bill.id, "LINE")}
                  >
                    <BillIcon name="mail" />
                    {trc("send.line")}
                  </button>
                  <button
                    type="button"
                    data-testid="pos-receipt-send-email"
                    disabled={sendBusy || bill.status === "VOIDED"}
                    className="btn btn-ghost h-12 rounded-[12px] px-2 leading-tight disabled:text-[color:var(--color-muted)]"
                    onClick={openEmail}
                  >
                    <BillIcon name="at" />
                    {trc("send.email")}
                  </button>
                  <button type="button" data-testid="pos-receipt-send-copy" disabled={sendBusy} className="btn btn-ghost h-12 rounded-[12px] px-2 leading-tight" onClick={() => void copyLink(bill.id)}>
                    <BillIcon name="link" />
                    {trc("send.copyLink")}
                  </button>
                </div>
                <div className={`grid gap-3 ${bill.can.refund ? "grid-cols-2" : "grid-cols-1"}`}>
                  {/* POS P1.15U ▸ มติ 6: คำขอยกเลิก/คืนเงินของบิลนี้ยังรออนุมัติ ⇒ ปุ่มเป็น "รออนุมัติ…" (จาง) แตะแล้วเปิด 21B ◂ */}
                  <button
                    type="button"
                    data-testid="pos-bills-void-open"
                    data-pending={pendingFor(bill.id, "void") ? "true" : undefined}
                    disabled={!bill.can.void || pinShop === null}
                    className={`btn btn-ghost h-12 rounded-[12px] border-[color:var(--color-danger)] text-[color:var(--color-danger)] disabled:border-[color:var(--color-line)] disabled:text-[color:var(--color-muted)] ${pendingFor(bill.id, "void") ? "opacity-60" : ""}`}
                    onClick={() => {
                      const pr = pendingFor(bill.id, "void");
                      if (pr) setWait({ requestId: pr.requestId, kind: "void", saleId: bill.id });
                      else openVoid();
                    }}
                  >
                    <BillIcon name="x" />
                    {pinShop === null ? trg("lock.checkingDevice") : pendingFor(bill.id, "void") ? `${t("drawer.void")} — ${trg("approval.pending")}` : t("drawer.void")}
                  </button>
                  {bill.can.refund ? (
                    <button
                      type="button"
                      data-testid="pos-bills-refund-open"
                      data-pending={pendingFor(bill.id, "refund") ? "true" : undefined}
                      disabled={pinShop === null}
                      className={`btn btn-primary h-12 rounded-[12px] disabled:opacity-50 ${pendingFor(bill.id, "refund") ? "opacity-60" : ""}`}
                      onClick={() => {
                        const pr = pendingFor(bill.id, "refund");
                        if (pr) setWait({ requestId: pr.requestId, kind: "refund", saleId: bill.id });
                        else void openRefund();
                      }}
                    >
                      {pinShop === null ? trg("lock.checkingDevice") : pendingFor(bill.id, "refund") ? `${t("drawer.refund")} — ${trg("approval.pending")}` : t("drawer.refund")}
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

      {/* ═══ POS P1.11U ▸ แผ่นส่งใบเสร็จทางอีเมล (ช่องเดียว · ว่าง = อีเมลสมาชิกของบิล) ═══ */}
      {emailOpen && bill ? (
        <BillDialog labelledBy="pos-receipt-send-email-title" testid="pos-receipt-send-email-sheet" onClose={closeEmail}>
          <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
            <h2 id="pos-receipt-send-email-title" className="text-[17px] font-bold">
              {trc("send.emailTitle")}
            </h2>
            <span className="flex-1" />
            <button type="button" data-testid="pos-receipt-send-email-close" aria-label={trc("send.close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={closeEmail}>
              <BillIcon name="x" />
            </button>
          </div>
          <form
            data-testid="pos-receipt-send-email-form"
            noValidate
            className="flex flex-col gap-3 px-5 pb-5 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEmail(bill.id);
            }}
          >
            <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-ink-soft)]">
              {trc("send.emailLabel")}
              <input
                type="email"
                data-testid="pos-receipt-send-email-input"
                autoFocus
                maxLength={200}
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="input h-11 text-[15px]"
              />
            </label>
            <span className="text-[12px] text-[color:var(--color-muted)]">{trc("send.emailHint")}</span>
            {emailErr ? (
              <span role="alert" data-testid="pos-receipt-send-error" className="text-[13px] text-[color:var(--color-danger)]">
                {emailErr}
              </span>
            ) : null}
            <button type="submit" data-testid="pos-receipt-send-email-submit" disabled={sendBusy} className="btn btn-primary h-12 rounded-[12px]">
              {trc("send.submit")}
            </button>
          </form>
        </BillDialog>
      ) : null}
      {/* ◂ */}

      {/* ═══ POS P1.13U ▸ กล่องใบกำกับเต็มรูป (15A โหมดออกทีหลัง / จากคำขอ) ═══ */}
      {taxDlg && bill ? (
        <TaxInvoiceDialog
          mode="issue"
          systemId={systemId}
          unitId={unitId}
          chip={`${bill.receiptNo ?? "\u2014"} \u00b7 ${money(bill.totals.grandTotal)}`}
          initial={taxDlg.mode === "request" ? taxDlg.initial : null}
          requestTaxId={taxDlg.mode === "request" ? taxDlg.initial.taxId : null}
          memberId={bill.member?.customerId ?? null}
          memberName={bill.member?.name ?? null}
          dbdOff={dbdOff}
          onDbdOff={() => setDbdOff(true)}
          onCancel={closeTaxDlg}
          onSave={issueTaxInvoice}
          escClose
        />
      ) : null}
      {/* ═══ POS P1.13U ▸ แผ่นปฏิเสธคำขอใบกำกับ (เหตุผลบังคับ ≤200) ═══ */}
      {rejectFor && bill ? (
        <BillDialog labelledBy="pos-taxinv-reject-title" testid="pos-taxinv-reject-sheet" onClose={closeReject}>
          <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
            <h2 id="pos-taxinv-reject-title" className="text-[17px] font-bold">
              {t("taxInvoice.rejectTitle")}
            </h2>
            <span className="flex-1" />
            <button type="button" data-testid="pos-taxinv-reject-close" aria-label={t("taxInvoice.close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" disabled={rejectBusy} onClick={closeReject}>
              <BillIcon name="x" />
            </button>
          </div>
          <form
            data-testid="pos-taxinv-reject-form"
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void submitReject();
            }}
          >
            <div className="flex flex-col gap-3 px-5 py-4">
              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="font-bold">{t("taxInvoice.rejectReason")}</span>
                <textarea
                  data-testid="pos-taxinv-reject-reason"
                  value={rejectReason}
                  maxLength={TAX_REJECT_MAX}
                  rows={3}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    setRejectErr(null);
                  }}
                  className="input"
                  autoFocus
                />
                <span className="self-end text-[11px] tabular-nums text-[color:var(--color-muted)]">{t("taxInvoice.rejectHint", { count: rejectReason.length, max: TAX_REJECT_MAX })}</span>
              </label>
              {rejectErr ? (
                <span className="text-[13px] text-[color:var(--color-danger)]" data-testid="pos-taxinv-reject-error" role="alert">
                  {rejectErr}
                </span>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 pb-4 pt-3">
              <button type="button" data-testid="pos-taxinv-reject-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={rejectBusy} onClick={closeReject}>
                {t("taxInvoice.cancel")}
              </button>
              <button type="submit" data-testid="pos-taxinv-reject-submit" disabled={rejectBusy || !rejectReason.trim()} className="btn h-12 rounded-[12px] bg-[color:var(--color-danger)] px-6 text-[color:var(--color-surface)] disabled:opacity-50">
                {t("taxInvoice.rejectConfirm")}
              </button>
            </div>
          </form>
        </BillDialog>
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
                  {/* POS P2.1U ▸ F4: บิลจ่ายผ่านแพลตฟอร์ม — แพลตฟอร์มคืนลูกค้า ⇒ วิธีคืนมีทางเดียว (refund.ts R9 รับเฉพาะ PLATFORM ทั้งหมด) ◂ */}
                  {(rf.payments ?? []).some((x) => x.type === "PLATFORM") ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <button type="button" data-testid="pos-bills-refund-method-platform" aria-pressed={rfMethod === "PLATFORM"} onClick={() => setRfMethod("PLATFORM")} className="flex min-h-[52px] flex-col items-center justify-center rounded-xl border border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] px-2 text-center text-[13px] font-semibold leading-tight shadow-[inset_0_0_0_1px_var(--color-ink)]">
                        {t("refund.m.platform")}
                        <small className="text-[11px] font-normal text-[color:var(--color-muted)]">{t("refund.m.platformSub")}</small>
                      </button>
                    </div>
                  ) : (
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
                  )}
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

      {/* POS P1.15U ▸ fix รอบ 1 F8: ใส่ PIN ที่หน้าขายก่อน · PIN ผู้จัดการแทนสิทธิ์ที่ขาด ◂ */}
      {needPin ? (
        <BillDialog labelledBy="pos-bills-need-pin-title" testid="pos-bills-need-pin" onClose={() => setNeedPin(false)}>
          <div className="flex flex-col gap-3 px-5 py-5">
            <h2 id="pos-bills-need-pin-title" className="text-[17px] font-bold">
              {trg("lock.needPinBills")}
            </h2>
            <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{trg("lock.needPinBillsBody")}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" data-testid="pos-bills-need-pin-close" className="btn btn-ghost h-12 rounded-[12px] px-5" onClick={() => setNeedPin(false)}>
                {t("drawer.close")}
              </button>
              <Link data-testid="pos-bills-need-pin-link" href={`/app/sys/${systemId}/pos/register?unit=${encodeURIComponent(unitId)}`} className="btn btn-primary inline-flex h-12 items-center rounded-[12px] px-5">
                {trg("lock.goRegister")}
              </Link>
            </div>
          </div>
        </BillDialog>
      ) : null}
      {mgrPin ? (
        <BillDialog labelledBy="pos-bills-mgr-pin-title" testid="pos-bills-mgr-pin" wide onClose={() => setMgrPin(null)}>
          <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
            <h2 id="pos-bills-mgr-pin-title" className="flex-1 text-[17px] font-bold">
              {trg("lock.managerAllow")}
            </h2>
            <button type="button" data-testid="pos-bills-mgr-pin-close" aria-label={t("drawer.close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={() => setMgrPin(null)}>
              <BillIcon name="x" />
            </button>
          </div>
          <div className="px-5 py-4">
            <ManagerPinPad systemId={systemId} unitId={unitId} deviceId={getPosDeviceId()} onPinEntered={mgrPinSubmit} />
          </div>
        </BillDialog>
      ) : null}
      {/* POS P1.15U ▸ กล่องรอผู้จัดการอนุมัติ 21B (ยกเลิกบิล/คืนเงิน) ◂ */}
      {wait ? (
        <ApprovalWaitDialog
          systemId={systemId}
          unitId={unitId}
          deviceId={getPosDeviceId()}
          requestId={wait.requestId}
          allowPin={wait.kind === "void" || !!wait.refund}
          onPin={waitPin}
          onDone={waitDone}
          onClose={() => setWait(null)}
        />
      ) : null}
      {toast ? (
        <div role="status" data-testid="pos-bills-toast" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[color:var(--color-ink)] px-4 py-3 text-sm text-[color:var(--color-surface)] shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
