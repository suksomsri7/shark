"use client";

// SlipSheet.tsx — POS P3-SKEL U ▸ CD-SKELU-7: แผ่นดูสลิป (ลิ้นชักบิล 12) — รูปจากลิงก์ดูชั่วคราว (slipViewerUrlAction · ขอใหม่ทุกครั้งที่เปิด · ไม่เก็บเกิน TTL)
//   ยอดบนสลิป (ที่ผู้แนบพิมพ์) เทียบยอดแถวชำระ → บรรทัด "ไม่ตรง" · ยืนยัน/ปฏิเสธ (+ เหตุผล 3–200) เฉพาะผู้ถือ pos.shift.manage (หน้าเพจส่ง)
//   SLIP_SELF_CONFIRM / SLIP_INVALID_STATE / FILE_PURGED = คีย์ของจอ · SLIP_INVALID_STATE โหลดลิ้นชักใหม่ · ไม่กรองผู้แนบฝั่งจอ (เซิร์ฟเวอร์ตัดสิน)
// 🔴 คำว่า "หลักฐาน" เท่านั้น — ไม่เคยเขียน "รับเงินแล้ว" · ไม่มีชื่อผู้แนบ/ผู้จ่าย/ชื่อไฟล์ · ลิงก์รูปไม่ออกนอกแผ่น (ไม่ log)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px · ผู้เรียกตั้งชื่อลงท้าย View (ตัวสแกน F15.3 นับ *Sheet เป็นปุ่ม)

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { confirmSlipAction, rejectSlipAction, slipViewerUrlAction } from "@/lib/modules/pos/payment-slip-actions";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

const keyOk = (k: unknown): k is string => typeof k === "string" && /^platform\.slip\.errors\.[A-Za-z]+$/.test(k);

type Props = {
  systemId: string;
  unitId: string;
  slipId: string;
  index: number;
  status: "UPLOADED" | "CONFIRMED" | "REJECTED";
  /** ยอดที่ผู้แนบพิมพ์ (slipTargetsAction · null = ไม่ได้กรอก) · ยอดของแถวชำระ */
  typedSatang: number | null;
  paidSatang: number | null;
  canManageShift: boolean;
  onClose: () => void;
  /** สถานะเปลี่ยน/ต้องโหลดลิ้นชักใหม่ */
  onChanged: () => void;
};

export function SlipSheet({ systemId, unitId, slipId, index, status, typedSatang, paidSatang, canManageShift, onClose, onChanged }: Props) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const [url, setUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState(status);
  const [mounted, setMounted] = useState(false);
  const msg = (k: unknown) => (keyOk(k) && tpos.has(k) ? tpos(k) : t("slip.errors.unknown"));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setImgErr(null);
    slipViewerUrlAction({ systemId, unitId, slipId })
      .then((r) => {
        if (!live) return;
        if (r.ok === true) setUrl(r.url);
        else setImgErr(r.code === "FILE_PURGED" ? msg(r.messageKey) : t("slip.imageUnavailable"));
      })
      .catch(() => live && setImgErr(t("slip.imageUnavailable")));
    return () => {
      live = false;
      setUrl(null); // ลิงก์ชั่วคราวไม่ค้างหลังปิดแผ่น
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ขอลิงก์ใหม่ต่อการเปิดแผ่น
  }, [systemId, unitId, slipId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const decide = async (kind: "confirm" | "reject") => {
    if (busy) return;
    if (kind === "reject") {
      const r = reason.trim();
      if (r.length < 3 || r.length > 200) return setErr(t("slip.reasonShort"));
    }
    setBusy(true);
    setErr(null);
    try {
      const r = kind === "confirm" ? await confirmSlipAction({ systemId, unitId, slipId }) : await rejectSlipAction({ systemId, unitId, slipId, reason: reason.trim() });
      if (r.ok === true) {
        setCur(r.slip.status);
        setRejecting(false);
        onChanged();
      } else {
        setErr(msg(r.messageKey));
        if (r.code === "SLIP_INVALID_STATE") onChanged();
      }
    } catch {
      setErr(t("slip.errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const mismatch = typedSatang !== null && paidSatang !== null && typedSatang !== paidSatang;
  const statusText = cur === "CONFIRMED" ? t("slip.statusConfirmed") : cur === "REJECTED" ? t("slip.statusRejected") : t("slip.statusUploaded");
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="presentation">
      <div data-testid="pos-bills-slip-sheet" role="dialog" aria-modal="true" aria-label={t("slip.sheetTitle")} className="flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl sm:max-w-[520px] sm:rounded-[20px]">
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
          <RegisterIcon name="doc" size={18} />
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">
            {t("slip.sheetTitle")} · {index + 1}
          </h2>
          <span data-testid="pos-bills-slip-sheet-status" data-status={cur} className="inline-flex h-7 shrink-0 items-center rounded-[8px] border px-2.5 text-[12px]">
            {statusText}
          </span>
          <button data-testid="pos-bills-slip-close" type="button" className="grid size-11 shrink-0 place-items-center rounded-[11px] hover:bg-[color:var(--color-surface-2)]" aria-label={t("slip.close")} disabled={busy} onClick={onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </header>
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="flex items-start gap-2 rounded-[11px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
            <RegisterIcon name="warn" size={13} className="mt-[3px] shrink-0" />
            <span>{t("slip.evidenceOnly")}</span>
          </p>
          <div className="grid min-h-[200px] place-items-center overflow-hidden rounded-[13px] border bg-[color:var(--color-surface-2)]">
            {imgErr ? (
              <p data-testid="pos-bills-slip-image" data-state="unavailable" className="px-4 py-8 text-center text-[13px] text-[color:var(--color-muted)]">
                {imgErr}
              </p>
            ) : url ? (
              // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ส่วนตัวลงนามอายุสั้น (ไม่ผ่านตัวปรับรูปของ Next)
              <img data-testid="pos-bills-slip-image" src={url} alt={t("slip.sheetTitle")} className="max-h-[52dvh] w-auto object-contain" referrerPolicy="no-referrer" onError={() => setImgErr(t("slip.imageUnavailable"))} />
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-[color:var(--color-muted)]">{t("slip.imageLoading")}</p>
            )}
          </div>
          <p data-testid="pos-bills-slip-amount" className="text-[13.5px] tabular-nums">
            {typedSatang !== null ? t("slip.amountLine", { slip: moneyText(typedSatang), paid: paidSatang !== null ? moneyText(paidSatang) : "—" }) : t("slip.amountNone", { paid: paidSatang !== null ? moneyText(paidSatang) : "—" })}
          </p>
          {mismatch && (
            <p data-testid="pos-bills-slip-mismatch" role="status" className="rounded-[11px] border border-[color:var(--color-danger)] px-3 py-2 text-[13px] text-[color:var(--color-danger)]">
              {t("slip.amountMismatch", { slip: moneyText(typedSatang!), paid: moneyText(paidSatang!) })}
            </p>
          )}
          {err && (
            <p data-testid="pos-bills-slip-error" role="alert" className="text-[13px] text-[color:var(--color-danger)]">
              {err}
            </p>
          )}
          {!canManageShift ? (
            <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("slip.managerDecides")}</p>
          ) : cur === "UPLOADED" ? (
            <div className="flex flex-col gap-3">
              {rejecting && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]">{t("slip.reasonLabel")}</span>
                  <textarea data-testid="pos-bills-slip-reason" className="input min-h-[88px] rounded-[11px] px-3 py-2 text-[14px]" maxLength={200} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
                </label>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {rejecting ? (
                  <>
                    <button data-testid="pos-bills-slip-reject-cancel" type="button" disabled={busy} className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[14px]" onClick={() => setRejecting(false)}>
                      {t("slip.cancel")}
                    </button>
                    <button data-testid="pos-bills-slip-reject-send" type="button" disabled={busy} className="btn min-h-11 rounded-[11px] border-[color:var(--color-danger)] px-4 text-[14px] font-semibold text-[color:var(--color-danger)] disabled:opacity-60" onClick={() => void decide("reject")}>
                      {t("slip.rejectSend")}
                    </button>
                  </>
                ) : (
                  <>
                    <button data-testid="pos-bills-slip-reject" type="button" disabled={busy} className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[14px] text-[color:var(--color-danger)]" onClick={() => setRejecting(true)}>
                      {t("slip.reject")}
                    </button>
                    <button data-testid="pos-bills-slip-confirm" type="button" disabled={busy} className="btn btn-primary min-h-11 rounded-[11px] px-4 text-[14px] font-semibold disabled:opacity-60" onClick={() => void decide("confirm")}>
                      {t("slip.confirm")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p data-testid="pos-bills-slip-decided" className="text-[12.5px] text-[color:var(--color-muted)]">
              {t("slip.decided")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
