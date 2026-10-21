"use client";

// OfflineRegisterParts.tsx — ชิ้นจอขายออฟไลน์ (POS P3.4U · ภาพ 19ง + จออนุพันธ์ · มติผู้คุม 3 4 5 6)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   OfflineLiveBanner = แถบ 19ง "ออฟไลน์ตั้งแต่ HH:MM · ขายต่อได้ด้วยเงินสดและโอน · รอซิงก์ n บิล · เลขชั่วคราว OFF-C1-0007" + "อย่าปิด/รีเฟรช" + ป้ายรอซิงก์
//   OfflineChips = ชิป "ใช้แต้ม / คูปอง / บัตร / พร้อมเพย์ — ใช้ได้เมื่อออนไลน์" (จาง · กดไม่ได้)
//   OfflinePayDialog = เงินสด (รับเงิน · ปุ่มด่วน · เงินทอน) / โอน (เลขอ้างอิงไม่บังคับ) → บันทึกลงคิวของเครื่อง
//   OfflineDoneDialog = เลข OFF + พิมพ์ใบรับเงินชั่วคราว (offlineSlipPayload → printReceipt · ไม่มี QR /r/ · ไม่ใช่ ABB) + บิลถัดไป
//   OfflineBillsDialog = บิลออฟไลน์ของเครื่อง: รอซิงก์ · รอผู้จัดการ (อ่านอย่างเดียว) · ได้เลขจริง (พิมพ์ซ้ำ = reprintReceiptAction) — ไม่มีปุ่มยกเลิก/คืนเงิน
//   ไม่มีภาพออกแบบของกล่องชำระ/สลิป/รายการ ⇒ จออนุพันธ์ (เจ้าของรับทราบ แบบ P2.8) ใช้โครง RegisterDialog เดียวกับกล่องอื่นของหน้าขาย
// 🔴 ไฟล์ "use client": import เฉพาะ *-shared / *-actions / ชิ้นของหน้าขาย · ไม่มีข้อความไทยนอก t() · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { offlineRefusalMessageKey } from "@/lib/modules/pos/offline-shared";
import { OFFLINE_CHIPS, offlineBahtToSatang, offlineChangeSatang, offlineQuickCash, offlineSlipOf, type OfflineQueueRecord, type OfflineSyncedRecord } from "@/lib/modules/pos/offline-client-shared";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { reprintReceiptAction } from "@/lib/modules/pos/receipt-actions";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt, printerPaired } from "@/components/pos/print/printReceipt";
import type { PrintResult } from "@/components/pos/print/types";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

type Printer = { config: PosPrinterConfig; deviceCode: string | undefined };
type Shop = { name: string; branchName: string };

/** แถบ 19ง ขณะออฟไลน์ (เปิดธง) — gateKey = เหตุที่ขายไม่ได้ (null = ขายได้) */
export function OfflineLiveBanner(p: { since: Date | null; pending: number; parked: number; lastRef: string | null; gateKey: string | null; onBadge: () => void }) {
  const t = useTranslations("pos.register");
  const [time, setTime] = useState("");
  useEffect(() => {
    setTime(formatThaiTime(p.since ?? new Date()));
  }, [p.since]);
  return (
    <div data-testid="pos-reg-offline-live-banner" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 bg-[color:var(--color-ink)] px-5 py-[11px] text-[14px] leading-[1.5] text-[color:var(--color-surface)]" role="status">
      <RegisterIcon name="warn" size={18} />
      <span className="min-w-0 flex-1">
        <b>{t("offline.since", { time })}</b>
        {p.gateKey ? (
          <span data-testid="pos-reg-offline-gate"> · {t(p.gateKey)}</span>
        ) : (
          <>
            {" · "}
            {t("offline.sell")}
            {" · "}
            {t("offline.pending", { count: p.pending })}
            {p.lastRef ? ` · ${t("offline.ref", { ref: p.lastRef })}` : ""}
          </>
        )}
        <span className="block text-[12.5px] opacity-80">
          {t("offline.keepOpen")}
        </span>
      </span>
      <OfflineBadge pending={p.pending} parked={p.parked} onOpen={p.onBadge} inverse />
    </div>
  );
}

/** ป้าย "รอซิงก์ n" (คิวในเครื่องเท่านั้น) · มีบิลรอผู้จัดการ = ต่อท้าย — กด = รายการบิลออฟไลน์ของเครื่อง */
export function OfflineBadge(p: { pending: number; parked: number; onOpen: () => void; inverse?: boolean }) {
  const t = useTranslations("pos.register");
  return (
    <button
      data-testid="pos-reg-offline-badge"
      data-count={p.pending}
      type="button"
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[11px] border px-3 text-[13px] font-semibold tabular-nums ${p.inverse ? "border-[color:var(--color-surface)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"}`}
      onClick={p.onOpen}
    >
      <RegisterIcon name="swap" size={14} />
      {t("offline.badge", { count: p.pending })}
      {p.parked > 0 && <span className="font-normal opacity-80">· {t("offline.badgeParked", { count: p.parked })}</span>}
    </button>
  );
}

/** ชิป 19ง — ของที่ต้องออนไลน์ (จาง · ไม่ใช่ปุ่ม) */
export function OfflineChips() {
  const t = useTranslations("pos.register");
  return (
    <div data-testid="pos-reg-offline-chips" className="mx-[14px] mt-2 flex shrink-0 flex-col gap-1.5 rounded-[14px] border border-dashed px-3 py-2.5 xl:mx-4">
      <div className="flex flex-wrap gap-1.5">
        {OFFLINE_CHIPS.map((c) => (
          <span key={c} data-testid={`pos-reg-offline-chip-${c}`} aria-disabled="true" className="inline-flex h-7 items-center gap-1 rounded-[8px] border bg-[color:var(--color-surface-2)] px-2.5 text-[12.5px] text-[color:var(--color-muted)]">
            <RegisterIcon name="lock" size={12} />
            {t(`offline.chip.${c}`)}
          </span>
        ))}
      </div>
      <p className="text-[12px] text-[color:var(--color-muted)]">{t("offline.chipsNote")}</p>
    </div>
  );
}

/** แถวปุ่มชำระตอนออฟไลน์ (19ง: "ชำระเงินสด ฿625" + "โอน") */
export function OfflinePayRow(p: { amount: string; enabled: boolean; sheet: boolean; onCash: () => void; onTransfer: () => void }) {
  const t = useTranslations("pos.register");
  return (
    <div className="mx-[14px] mb-3 mt-2.5 grid shrink-0 grid-cols-[1fr_auto] gap-2 xl:mx-6 xl:mt-3">
      <button
        data-testid="pos-reg-offline-pay-cash"
        type="button"
        disabled={!p.enabled}
        className={`btn btn-primary justify-between rounded-[18px] px-[22px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)] ${p.sheet ? "h-14 text-[17px]" : "h-[70px] text-[19px] xl:h-16"}`}
        onClick={p.onCash}
      >
        <span>{t("offline.payCash")}</span>
        <span className="whitespace-nowrap tabular-nums">{p.amount}</span>
      </button>
      <button
        data-testid="pos-reg-offline-pay-transfer"
        type="button"
        disabled={!p.enabled}
        className={`btn btn-ghost rounded-[18px] px-5 text-[16px] font-bold disabled:opacity-50 ${p.sheet ? "h-14" : "h-[70px] xl:h-16"}`}
        onClick={p.onTransfer}
      >
        {t("offline.payTransfer")}
      </button>
    </div>
  );
}

export type OfflinePayConfirm = { tender: "CASH" | "TRANSFER"; receivedSatang?: number; reference?: string };
/** กล่องชำระออฟไลน์ — เงินสด/โอน · ยืนยัน = onConfirm (คิวของเครื่อง) */
export function OfflinePayDialog(p: { totalSatang: number; tender: "CASH" | "TRANSFER"; busy: boolean; errorKey: string | null; onConfirm: (c: OfflinePayConfirm) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const [tender, setTender] = useState<"CASH" | "TRANSFER">(p.tender);
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const recv = received.trim() ? offlineBahtToSatang(received) : p.totalSatang;
  const change = recv === null ? null : offlineChangeSatang(p.totalSatang, recv);
  const cashOk = tender !== "CASH" || change !== null;
  const confirm = () => {
    if (p.busy || !cashOk) return;
    if (tender === "CASH") p.onConfirm({ tender, receivedSatang: recv ?? p.totalSatang });
    else p.onConfirm({ tender, ...(reference.trim() ? { reference: reference.trim().slice(0, 60) } : {}) });
  };
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-reg-offline-pay" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("offline.sheet.title")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <RegisterIcon name="swap" size={18} />
          <span className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold">{t("offline.sheet.title")}</h2>
            <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("offline.sheet.sub")}</p>
          </span>
          <button data-testid="pos-reg-offline-pay-close" type="button" disabled={p.busy} className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)]" aria-label={t("offline.sheet.cancel")} onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        <div className="flex items-baseline justify-between text-[24px] font-bold">
          <span className="text-[15px] font-semibold text-[color:var(--color-ink-soft)]">{t("offline.sheet.total")}</span>
          <span className="tabular-nums">
            {moneyText(p.totalSatang)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("offline.done.paidBy")}>
          {(["CASH", "TRANSFER"] as const).map((k) => (
            <button
              key={k}
              data-testid={`pos-reg-offline-tender-${k === "CASH" ? "cash" : "transfer"}`}
              type="button"
              role="radio"
              aria-checked={tender === k}
              disabled={p.busy}
              className={`h-12 rounded-[13px] border text-[15px] font-semibold ${tender === k ? "border-2 border-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"}`}
              onClick={() => setTender(k)}
            >
              {k === "CASH" ? t("offline.sheet.cash") : t("offline.sheet.transfer")}
            </button>
          ))}
        </div>
        {tender === "CASH" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-muted)]">
              {t("offline.sheet.received")}
              <input
                data-testid="pos-reg-offline-received"
                className="input h-12 rounded-[13px] text-[18px] font-semibold tabular-nums"
                inputMode="decimal"
                placeholder={moneyText(p.totalSatang)}
                value={received}
                disabled={p.busy}
                onChange={(e) => setReceived(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {offlineQuickCash(p.totalSatang).map((a, i) => (
                <button key={a} data-testid={`pos-reg-offline-quick-${i}`} type="button" disabled={p.busy} className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px] tabular-nums" onClick={() => setReceived(String(a / 100))}>
                  {i === 0 ? t("offline.sheet.exact") : moneyText(a)}
                </button>
              ))}
            </div>
            <p className={`flex justify-between text-[15px] ${change === null ? "text-[color:var(--color-danger)]" : ""}`} role={change === null ? "alert" : undefined}>
              <span>{change === null ? t("offline.sheet.short") : t("offline.sheet.change")}</span>
              <b className="tabular-nums">{change === null ? "—" : moneyText(change)}</b>
            </p>
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-muted)]">
            {t("offline.sheet.reference")}
            <input data-testid="pos-reg-offline-reference" className="input h-12 rounded-[13px] text-[15px]" maxLength={60} value={reference} disabled={p.busy} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        {p.errorKey && (
          <p role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
            {t(p.errorKey)}
          </p>
        )}
        <button data-testid="pos-reg-offline-confirm" type="button" disabled={p.busy || !cashOk} className="btn btn-primary h-14 rounded-[16px] text-[17px] font-bold" onClick={confirm}>
          {t("offline.sheet.confirm", { amount: moneyText(p.totalSatang) })}
        </button>
      </div>
    </RegisterDialog>
  );
}

/** สลิปที่สั่งพิมพ์อัตโนมัติไปแล้ว (ระดับโมดูล — กันพิมพ์ซ้ำเมื่อจอถูกวาดใหม่) */
const autoPrinted = new Set<string>();
const printedOnce = new Set<string>();
/** จอหลังบันทึกบิลออฟไลน์ — เลข OFF · เงินทอน · พิมพ์ใบรับเงินชั่วคราว · บิลถัดไป (ปิดด้วยปุ่มเท่านั้น) */
export function OfflineDoneDialog(p: { rec: OfflineQueueRecord; shop: Shop; printer: Printer; locale: "th" | "en"; onNext: () => void }) {
  const t = useTranslations("pos.register");
  const [res, setRes] = useState<PrintResult | null>(null);
  const [busy, setBusy] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const print = async (mode?: PosPrinterConfig["mode"]) => {
    if (busy) return;
    setBusy(true);
    try {
      const first = !printedOnce.has(p.rec.offlineRef);
      const cfg = mode ? { ...p.printer.config, mode } : p.printer.config;
      const r = await printReceipt(offlineSlipOf(p.rec, p.shop, p.locale), cfg, { locale: p.locale, deviceCode: p.printer.deviceCode, kickDrawer: first && p.rec.tender === "CASH" });
      if (r.ok) printedOnce.add(p.rec.offlineRef);
      setRes(r);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    nextRef.current?.focus();
    if (p.printer.config.autoPrint && printerPaired(p.printer.config.mode, p.printer.deviceCode) && !autoPrinted.has(p.rec.offlineRef)) {
      autoPrinted.add(p.rec.offlineRef);
      void print();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวต่อบิล
  }, [p.rec.offlineRef]);
  return (
    <RegisterDialog onDismiss={() => undefined} locked>
      <div data-testid="pos-reg-offline-done" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("offline.done.title")}>
        <SheetGrab />
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
            <RegisterIcon name="check" size={24} />
          </span>
          <h2 className="text-[20px] font-bold">{t("offline.done.title")}</h2>
          <p className="text-[30px] font-bold tabular-nums">{moneyText(p.rec.totalSatang)}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-[14px] border px-4 py-3 text-[14px]">
          <dt className="text-[color:var(--color-muted)]">{t("offline.done.no")}</dt>
          <dd data-testid="pos-reg-offline-done-no" className="text-right font-bold tabular-nums">
            {p.rec.offlineRef}
          </dd>
          <dt className="text-[color:var(--color-muted)]">{t("offline.done.paidBy")}</dt>
          <dd className="text-right">{p.rec.tender === "CASH" ? t("offline.sheet.cash") : t("offline.sheet.transfer")}</dd>
          {p.rec.tender === "CASH" && (
            <>
              <dt className="text-[color:var(--color-muted)]">{t("offline.done.change")}</dt>
              <dd className="text-right text-[18px] font-bold tabular-nums">
                {moneyText(p.rec.changeSatang)}
              </dd>
            </>
          )}
        </dl>
        <p className="text-center text-[12.5px] text-[color:var(--color-muted)]">{t("offline.done.note")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button data-testid="pos-reg-offline-slip" type="button" disabled={busy} className="btn btn-ghost h-12 gap-2 rounded-[13px] text-[15px]" onClick={() => void print()}>
            <RegisterIcon name="print" size={15} />
            {t("offline.done.printSlip")}
          </button>
          <button data-testid="pos-reg-offline-next" ref={nextRef} type="button" className="btn btn-primary h-12 rounded-[13px] text-[15px] font-bold" onClick={p.onNext}>
            {t("offline.done.next")}
          </button>
        </div>
        <PrintStatus result={res} onRetry={() => void print()} onBrowser={() => void print("browser")} />
      </div>
    </RegisterDialog>
  );
}

/** รายการบิลออฟไลน์ของเครื่อง (คิว + ที่ได้เลขจริงแล้ว) — ไม่มีปุ่มยกเลิก/คืนเงินของบิลที่ยังไม่ซิงก์ (มติ 6) */
export function OfflineBillsDialog(p: {
  systemId: string;
  queue: OfflineQueueRecord[];
  synced: OfflineSyncedRecord[];
  online: boolean;
  syncing: boolean;
  shop: Shop;
  printer: Printer;
  locale: "th" | "en";
  onSyncNow: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const [res, setRes] = useState<PrintResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [times, setTimes] = useState<Record<string, string>>({});
  useEffect(() => {
    // เวลาขายอ่านหลัง mount (HF-418)
    setTimes(Object.fromEntries([...p.queue, ...p.synced].map((r) => [r.offlineRef, formatThaiTime(new Date(r.soldAt))])));
  }, [p.queue, p.synced]);
  const slip = async (rec: OfflineQueueRecord) => {
    setBusy(rec.offlineRef);
    try {
      setRes(await printReceipt(offlineSlipOf(rec, p.shop, p.locale), p.printer.config, { locale: p.locale, deviceCode: p.printer.deviceCode }));
    } finally {
      setBusy(null);
    }
  };
  const reprint = async (s: OfflineSyncedRecord) => {
    if (!s.saleId) return;
    setBusy(s.offlineRef);
    try {
      const r = await reprintReceiptAction({ systemId: p.systemId, saleId: s.saleId }).catch(() => null);
      if (r && r.ok) setRes(await printReceipt(r.payload, p.printer.config, { locale: p.locale, deviceCode: p.printer.deviceCode }));
    } finally {
      setBusy(null);
    }
  };
  const queued = p.queue.filter((r) => r.status === "queued").length;
  return (
    <RegisterDialog onDismiss={p.onClose}>
      <div data-testid="pos-reg-offline-bills" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("offline.bills.title")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <RegisterIcon name="list" size={18} />
          <h2 className="min-w-0 flex-1 text-[19px] font-bold">{t("offline.bills.title")}</h2>
          <button data-testid="pos-reg-offline-bills-close" type="button" className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)]" aria-label={t("offline.bills.close")} onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        {p.queue.length === 0 && p.synced.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-[color:var(--color-muted)]">
            {t("offline.bills.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-[14px] border">
            {p.queue.map((r) => (
              <li key={r.idempotencyKey} data-testid={`pos-reg-offline-bill-${r.offlineRef}`} data-status={r.status} className="flex flex-col gap-1.5 px-4 py-3 text-[14px]">
                <div className="flex items-center gap-3">
                  <b className="tabular-nums">{r.offlineRef}</b>
                  <span className="text-[12.5px] text-[color:var(--color-muted)] tabular-nums">{times[r.offlineRef] ?? ""}</span>
                  <span className="flex-1" />
                  <b className="tabular-nums">{moneyText(r.totalSatang)}</b>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex h-6 items-center rounded-[7px] border px-2 text-[12px] font-semibold ${r.status === "parked" ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
                    {r.status === "parked" ? t("offline.bills.parked") : t("offline.bills.queued")}
                  </span>
                  <span className="flex-1" />
                  <button data-testid={`pos-reg-offline-bill-slip-${r.offlineRef}`} type="button" disabled={!!busy} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-3 text-[13px]" onClick={() => void slip(r)}>
                    <RegisterIcon name="print" size={13} />
                    {t("offline.bills.reprintSlip")}
                  </button>
                </div>
                {r.status === "parked" && (
                  <p className="text-[12.5px] text-[color:var(--color-muted)]">
                    {t(offlineRefusalMessageKey(r.reason ?? ""))} · {t("offline.bills.parkedHint")}
                  </p>
                )}
              </li>
            ))}
            {p.synced.map((s) => (
              <li key={s.idempotencyKey} data-testid={`pos-reg-offline-bill-${s.offlineRef}`} data-status="synced" className="flex flex-col gap-1.5 px-4 py-3 text-[14px]">
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-[color:var(--color-muted)] line-through">{s.offlineRef}</span>
                  <span className="text-[12.5px] text-[color:var(--color-muted)] tabular-nums">{times[s.offlineRef] ?? ""}</span>
                  <span className="flex-1" />
                  <b className="tabular-nums">{moneyText(s.totalSatang)}</b>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-6 items-center rounded-[7px] border border-[color:var(--color-ink)] px-2 text-[12px] font-bold tabular-nums">
                    {t("offline.bills.synced", { no: s.receiptNo ?? "-" })}
                  </span>
                  <span className="flex-1" />
                  {s.saleId && (
                    <button data-testid={`pos-reg-offline-bill-reprint-${s.offlineRef}`} type="button" disabled={!!busy || !p.online} className="btn btn-ghost h-11 gap-1.5 rounded-[11px] px-3 text-[13px]" onClick={() => void reprint(s)}>
                      <RegisterIcon name="print" size={13} />
                      {t("offline.bills.reprint")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("offline.bills.noVoid")}</p>
        <button data-testid="pos-reg-offline-bills-sync" type="button" disabled={!p.online || p.syncing || queued === 0} className="btn btn-primary h-12 rounded-[13px] text-[15px]" onClick={p.onSyncNow}>
          {p.syncing ? t("offline.bills.syncing") : t("offline.bills.syncNow")}
        </button>
        <PrintStatus result={res} onRetry={() => setRes(null)} />
      </div>
    </RegisterDialog>
  );
}
