"use client";

// ApprovalWaitDialog.tsx — กล่อง "รอผู้จัดการอนุมัติ" (POS P1.15U · ภาพ 21B · มติผู้คุมงาน 5 6)
//   ใช้ร่วม: ยกเลิกบิล/คืนเงิน (หน้าบิลวันนี้) · ส่วนลดเกินสิทธิ์ (หน้าขาย)
//   บรรทัดสรุป "ส่งคำขอ<ชื่อ> · ฿x แล้ว HH:MM · เหตุผล: …" · การ์ดผู้อนุมัติ + ชิป "ส่งแล้ว" · กำลังรอ… + นับถอยหลัง 5:00 จาก createdAt ·
//   "หรือ" · ใส่ PIN ผู้จัดการที่เครื่องนี้ (เลือกผู้จัดการ + จุด + แป้น 1–9 / ล้าง / 0 / ⌫) · ท้าย: หมดอายุ 5 นาที · [ยกเลิกคำขอ]
//   ถามสถานะทุก 5 วินาที (posApprovalStatusAction) · APPROVED / REJECTED / CANCELLED / FAILED ⇒ onDone(view) ให้ผู้เรียกจัดการต่อ
//   PIN = onPin(managerUserId, pin) → ผู้เรียกส่งคำขอเดิมซ้ำพร้อม managerPin + managerUserId (ยกเลิก/คืนเงิน) หรือเตรียมไว้กับบิล (ส่วนลด)
// 🔴 PIN อยู่ใน state ของกล่องนี้จนส่ง แล้วล้างทันที · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import { moneyText, POS_APPROVAL_WAIT_MS, type PosApprovalView } from "@/lib/modules/pos/register-shared";
import { cancelPosApprovalAction, posApprovalStatusAction } from "@/lib/modules/pos/pos-approval-actions";
import { readStaffSession } from "@/lib/modules/pos/staff-session";
import { RegisterDialog } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";
import { ManagerPinPad } from "./ManagerPinPad";

const POLL_MS = 5_000;

export type ApprovalPinResult = { ok: true } | { ok: false; code: string };

export function ApprovalWaitDialog(p: {
  systemId: string;
  unitId: string;
  deviceId?: string;
  requestId: string;
  /** view = สถานะล่าสุดของคำขอ (ผู้เรียกใช้เหตุผลเดิมเมื่อส่งซ้ำ) */
  onPin: (managerUserId: string, pin: string, view: PosApprovalView | null) => Promise<ApprovalPinResult>;
  /** false = ซ่อนทาง PIN (ผู้เรียกส่งคำขอเดิมซ้ำไม่ได้ เช่น คืนเงินที่ยื่นจากที่อื่น) */
  allowPin?: boolean;
  onDone: (view: PosApprovalView) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const [view, setView] = useState<PosApprovalView | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);
  /** fix รอบ 1 F6: หยุดถามสถานะ (หมดอายุ/ล้ม) · ยกเลิกคำขอที่หมดอายุไปแล้ว (ครั้งเดียว) */
  const stopRef = useRef(false);
  const expiredRef = useRef(false);
  const cb = useRef(p);
  cb.current = p;

  const poll = useCallback(async () => {
    try {
      const r = await posApprovalStatusAction({ systemId: p.systemId, unitId: p.unitId, requestId: p.requestId });
      if (!r.ok || !r.request) return setLoadErr(true);
      setLoadErr(false);
      setView(r.request);
      const st = r.request.status;
      if (!doneRef.current && (st === "APPROVED" || st === "REJECTED" || st === "CANCELLED")) {
        doneRef.current = true;
        cb.current.onDone(r.request);
      }
      // fix รอบ 1 F6: หมดอายุ (PENDING ≥ 5 นาที) = ยกเลิกคำขอครั้งเดียวแล้วหยุดถาม · FAILED = หยุดถาม (บิลยังอยู่ตามเดิม)
      if (st === "FAILED") stopRef.current = true;
      if (st === "EXPIRED" && !expiredRef.current) {
        expiredRef.current = true;
        stopRef.current = true;
        await cancelRef.current().catch(() => undefined);
      }
    } catch {
      setLoadErr(true);
    }
  }, [p.systemId, p.unitId, p.requestId]);
  useEffect(() => {
    void poll();
    const id = setInterval(() => {
      if (!doneRef.current && !stopRef.current) void poll();
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [poll]);
  const created = view ? Date.parse(view.createdAt) : now;
  const left = Math.max(0, created + POS_APPROVAL_WAIT_MS - now);
  const expired = view?.status === "EXPIRED" || (view?.status === "PENDING" && left === 0);
  const clock = `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, "0")}`;

  /** fix รอบ 1 F7: ยกเลิกในนามคนในโทเคนของเครื่องนี้ (ผู้ขอ/ผู้จัดการเท่านั้น — เซิร์ฟเวอร์ตัดสิน) */
  const cancelRequestNow = async () => {
    const st = p.deviceId ? readStaffSession(p.deviceId) : null;
    return cancelPosApprovalAction({ systemId: p.systemId, unitId: p.unitId, requestId: p.requestId, ...(st && p.deviceId ? { staffToken: st.staffToken, deviceId: p.deviceId } : {}) });
  };
  const cancelRef = useRef(cancelRequestNow);
  cancelRef.current = cancelRequestNow;
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (view && (view.status === "PENDING" || view.status === "EXPIRED")) await cancelRequestNow();
    } catch {
      /* ปิดกล่องอยู่ดี — คำขอที่ค้างไม่มีผลต่อบิล */
    } finally {
      setBusy(false);
      p.onClose();
    }
  };

  const roleText = (r: string | null) => (r === "OWNER" ? t("roles.owner") : r === "MANAGER" ? t("roles.manager") : r ? t("approval.roleAny") : "");
  const summary = view
    ? t("approval.sent", { title: view.title ?? "-", amount: view.amountSatang !== null ? moneyText(view.amountSatang) : "-", time: formatThaiTime(new Date(view.createdAt)) }) +
      (view.reason ? ` · ${t("approval.reason", { reason: view.reason })}` : "")
    : t("approval.loading");

  return (
    <RegisterDialog onDismiss={p.onClose} locked={busy}>
      <div
        data-testid="pos-approval-wait"
        data-status={view?.status ?? "LOADING"}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:w-[620px] md:max-w-[calc(100vw-32px)] md:rounded-[22px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("approval.title")}
      >
        <header className="flex items-center gap-3 px-6 pb-2 pt-6">
          <span className="grid size-9 place-items-center rounded-[10px] border">
            <RegisterIcon name="lock" size={16} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("approval.title")}</h2>
          <button data-testid="pos-approval-wait-close" type="button" aria-label={t("cart.close")} className="grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={16} />
          </button>
        </header>
        <div className="flex flex-col gap-4 px-6 pb-5">
          <p data-testid="pos-approval-wait-summary" className="text-[14px] text-[color:var(--color-ink-soft)]">
            {summary}
          </p>
          <div className="flex items-center gap-3 rounded-[14px] border px-4 py-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[9px] border bg-[color:var(--color-surface-2)] text-[13px] font-bold">
              {(view?.approverName || roleText(view?.approverRole ?? null) || "?").trim().charAt(0) || "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold">{t("approval.approver", { name: view?.approverName || roleText(view?.approverRole ?? null) || "-" })}</span>
              <span className="block truncate text-[12.5px] text-[color:var(--color-muted)]">{t("approval.notified", { role: roleText(view?.approverRole ?? null) })}</span>
            </span>
            <span className="shrink-0 rounded-[8px] border border-[color:var(--color-accent)] px-2.5 py-1 text-[12px] font-semibold text-[color:var(--color-accent)]">{t("approval.sentChip")}</span>
          </div>
          {expired ? (
            <p data-testid="pos-approval-wait-expired" role="alert" className="text-[14px] font-semibold text-[color:var(--color-danger)]">
              {t("approval.expired")}
            </p>
          ) : view?.status === "FAILED" ? (
            <p data-testid="pos-approval-wait-failed" role="alert" className="text-[14px] font-semibold text-[color:var(--color-danger)]">
              {t("approval.failed")}
            </p>
          ) : (
            <div className="flex items-center gap-3 text-[14px]" role="status">
              <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-[color:var(--color-accent)] border-t-transparent" />
              <span className="flex-1 font-semibold text-[color:var(--color-accent)]">{loadErr ? t("approval.retrying") : t("approval.waiting")}</span>
              <span data-testid="pos-approval-wait-countdown" className="text-[16px] font-bold tabular-nums">
                {clock}
              </span>
            </div>
          )}
          {p.allowPin !== false && (
          <div className="flex items-center gap-3 text-[12px] text-[color:var(--color-muted)]">
            <span className="h-px flex-1 bg-[color:var(--color-line)]" />
            {t("approval.or")}
            <span className="h-px flex-1 bg-[color:var(--color-line)]" />
          </div>
          )}
          {p.allowPin !== false && (
            <ManagerPinPad
              systemId={p.systemId}
              unitId={p.unitId}
              deviceId={p.deviceId}
              disabled={busy}
              onPinEntered={async (m, pin) => {
                if (doneRef.current) return { ok: true };
                const r = await p.onPin(m, pin, view);
                if (r.ok) doneRef.current = true;
                return r;
              }}
            />
          )}
        </div>
        <footer className="flex items-center gap-3 border-t px-6 py-4">
          <p className="flex-1 text-[12px] text-[color:var(--color-muted)]">{t("approval.footer")}</p>
          <button data-testid="pos-approval-wait-cancel" type="button" disabled={busy} className="btn btn-ghost h-11 shrink-0 rounded-[11px] px-4 text-[14px]" onClick={() => void cancel()}>
            {t("approval.cancel")}
          </button>
        </footer>
      </div>
    </RegisterDialog>
  );
}
