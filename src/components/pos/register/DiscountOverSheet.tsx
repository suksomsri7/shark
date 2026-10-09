"use client";

// DiscountOverSheet.tsx — แผ่น "ส่วนลดเกินสิทธิ์" (POS P1.15U · มติผู้คุมงาน 4)
//   เปิดเมื่อส่วนลด (บรรทัด/ท้ายบิล) เกินเพดานของผู้ขายในโทเคน: "เพดานของคุณ x% · บิลนี้ขอ y%"
//   (ก) ใส่ PIN ผู้จัดการ: เลือกผู้จัดการ (MANAGER/OWNER ที่มี PIN · listStaffForDeviceAction) + PIN 4–6 หลัก →
//       onPin(managerUserId, ชื่อ, pin) — จอขายเก็บไว้กับบิลนี้แล้วส่งพร้อม submit (managerPin + managerUserId) · PIN ผิด = ตอบตอนชำระ
//   (ข) ส่งขออนุมัติ: onRequest() → submit ⇒ APPROVAL_REQUIRED {requestId, heldCartId} ⇒ บิลถูกพักที่เซิร์ฟเวอร์ · จอเปิด 21B
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { StaffListItem } from "@/lib/modules/pos/register-shared";
import { listStaffForDeviceAction } from "@/lib/modules/pos/staff-pin-actions";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const pct = (bp: number) => String(Number((bp / 100).toFixed(2)));

export function DiscountOverSheet(p: {
  systemId: string;
  unitId: string;
  deviceId?: string;
  /** เพดานของผู้ขาย (bp) · null = ไม่จำกัด */
  capBp: number | null;
  /** ส่วนลดที่ขอ (bp ของยอดก่อนส่วนลด) */
  wantBp: number;
  /** ส่งขออนุมัติได้ไหม (ต้องมีโทเคนผู้ขาย + ออนไลน์) */
  canRequest: boolean;
  busy: boolean;
  error: string | null;
  onPin: (managerUserId: string, managerName: string, pin: string) => void;
  onRequest: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const [managers, setManagers] = useState<StaffListItem[] | null>(null);
  const [mgr, setMgr] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const r = await listStaffForDeviceAction({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}) });
        const list = r.ok ? r.items.filter((s) => (s.role === "MANAGER" || s.role === "OWNER") && s.hasPin) : [];
        setManagers(list);
        if (list.length === 1) setMgr(list[0]!.userId);
      } catch {
        setManagers([]);
      }
    })();
  }, [p.systemId, p.unitId, p.deviceId]);
  const press = (k: string) => {
    if (p.busy) return;
    if (k === "del") return setPin((v) => v.slice(0, -1));
    setPin((v) => (v.length >= 6 ? v : v + k));
  };
  const confirmPin = () => {
    const m = managers?.find((x) => x.userId === mgr);
    if (!m || pin.length < 4) return;
    const value = pin;
    setPin("");
    p.onPin(m.userId, m.name ?? "-", value);
  };
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-discount-over-sheet" className={`${REG_DIALOG_PANEL} md:w-[480px]`} role="dialog" aria-modal="true" aria-label={t("discountOver.title")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] border text-[color:var(--color-danger)]">
            <RegisterIcon name="pct" size={16} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("discountOver.title")}</h2>
        </div>
        <p data-testid="pos-discount-over-cap" className="text-[14px] text-[color:var(--color-ink-soft)]">
          {p.capBp === null ? t("discountOver.want", { want: pct(p.wantBp) }) : t("discountOver.capLine", { cap: pct(p.capBp), want: pct(p.wantBp) })}
        </p>
        <section className="flex flex-col gap-3 rounded-[14px] border p-4">
          <h3 className="text-[15px] font-bold">{t("discountOver.pinTitle")}</h3>
          {managers === null ? (
            <p className="text-[13px] text-[color:var(--color-muted)]">{t("staff.loading")}</p>
          ) : managers.length === 0 ? (
            <p data-testid="pos-discount-over-no-manager" className="text-[13px] text-[color:var(--color-muted)]">
              {t("approval.noManager")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {managers.map((m) => (
                <button
                  key={m.userId}
                  data-testid="pos-discount-over-manager"
                  type="button"
                  aria-pressed={mgr === m.userId}
                  className={`h-11 rounded-[11px] border px-3.5 text-[13.5px] ${mgr === m.userId ? "border-2 border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`}
                  onClick={() => {
                    setMgr(m.userId);
                    setPin("");
                  }}
                >
                  {m.name ?? "-"}
                </button>
              ))}
            </div>
          )}
          <div data-testid="pos-discount-over-dots" className="flex gap-2.5" aria-label={t("lock.dotsLabel", { count: pin.length })}>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} aria-hidden className={`inline-block size-3.5 rounded-full border-[1.5px] border-[color:var(--color-ink)] ${i < pin.length ? "bg-[color:var(--color-ink)]" : "opacity-40"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button key={k} data-testid={`pos-discount-over-key-${k}`} type="button" disabled={!mgr || p.busy} className="h-12 rounded-[11px] border text-[17px] font-semibold disabled:opacity-40" onClick={() => press(k)}>
                {k}
              </button>
            ))}
            <button data-testid="pos-discount-over-clear" type="button" disabled={!pin || p.busy} className="h-12 rounded-[11px] border bg-[color:var(--color-surface-2)] text-[14px] font-semibold disabled:opacity-40" onClick={() => setPin("")}>
              {t("approval.clear")}
            </button>
            <button data-testid="pos-discount-over-key-0" type="button" disabled={!mgr || p.busy} className="h-12 rounded-[11px] border text-[17px] font-semibold disabled:opacity-40" onClick={() => press("0")}>
              0
            </button>
            <button data-testid="pos-discount-over-key-del" type="button" disabled={!pin || p.busy} aria-label={t("lock.del")} className="grid h-12 place-items-center rounded-[11px] border bg-[color:var(--color-surface-2)] disabled:opacity-40" onClick={() => press("del")}>
              <RegisterIcon name="del" size={18} />
            </button>
          </div>
          <button data-testid="pos-discount-over-pin-apply" type="button" disabled={!mgr || pin.length < 4 || p.busy} className="btn btn-primary h-12 rounded-[13px] text-[15px] disabled:opacity-50" onClick={confirmPin}>
            {t("discountOver.pinApply")}
          </button>
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("discountOver.pinNote")}</p>
        </section>
        <section className="flex flex-col gap-2">
          <button data-testid="pos-discount-over-request" type="button" disabled={!p.canRequest || p.busy} className="btn btn-ghost h-12 rounded-[13px] text-[15px] font-semibold disabled:opacity-50" onClick={p.onRequest}>
            {t("discountOver.request")}
          </button>
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("discountOver.requestNote")}</p>
        </section>
        {p.error && (
          <p data-testid="pos-discount-over-error" role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <button data-testid="pos-discount-over-cancel" type="button" disabled={p.busy} className="btn btn-ghost h-11 rounded-[13px] text-[14px]" onClick={p.onClose}>
          {tc("cancel")}
        </button>
      </div>
    </RegisterDialog>
  );
}
