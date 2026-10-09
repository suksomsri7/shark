"use client";

// ManagerPinPad.tsx — แป้น PIN ผู้จัดการที่เครื่องนี้ (POS P1.15U · fix รอบ 1 F8 — แยกจาก 21B ให้หน้าบิลวันนี้ใช้ร่วม)
//   เลือกผู้จัดการ (MANAGER/OWNER ที่มี PIN · listStaffForDeviceAction) · กล่อง PIN 4–6 · แป้น 1–9 / ล้าง / 0 / ⌫ · 6 หลักส่งเอง · 4–5 หลักกดยืนยัน
//   onPinEntered(managerUserId, pin) → ผู้เรียกส่งคำขอเดิมพร้อม managerPin + managerUserId · ผิด = ข้อความใต้กล่อง (refusalMessageKey)
// 🔴 PIN อยู่ใน state ของแป้นนี้จนส่ง แล้วล้างทันที · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { refusalMessageKey, type StaffListItem } from "@/lib/modules/pos/register-shared";
import { listStaffForDeviceAction } from "@/lib/modules/pos/staff-pin-actions";
import { RegisterIcon } from "./RegisterIcon";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type ManagerPinResult = { ok: true } | { ok: false; code: string };

export function ManagerPinPad(p: {
  systemId: string;
  unitId: string;
  deviceId?: string;
  /** ปิดแป้นทั้งหมด (เช่น คำขอจบแล้ว) */
  disabled?: boolean;
  onPinEntered: (managerUserId: string, pin: string) => Promise<ManagerPinResult>;
}) {
  const t = useTranslations("pos.register");
  const [managers, setManagers] = useState<StaffListItem[] | null>(null);
  const [mgr, setMgr] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const off = !!p.disabled || busy;
  const submit = async (value: string) => {
    if (off || !mgr || value.length < 4) return;
    setBusy(true);
    setPin("");
    setErr(null);
    try {
      const r = await p.onPinEntered(mgr, value);
      if (!r.ok) setErr(t(r.code === "PIN_LOCKED" ? "lock.pinLocked" : refusalMessageKey(r.code)));
    } catch {
      setErr(t("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const press = (k: string) => {
    if (off) return;
    setErr(null);
    if (k === "del") return setPin((v) => v.slice(0, -1));
    if (k === "clear") return setPin("");
    setPin((v) => {
      if (v.length >= 6) return v;
      const next = v + k;
      if (next.length === 6) queueMicrotask(() => void submit(next));
      return next;
    });
  };
  const mgrName = managers?.find((m) => m.userId === mgr)?.name ?? "-";
  const boxes = Math.max(4, Math.min(6, pin.length + (pin.length < 6 ? 1 : 0)));

  return (
    <div data-testid="pos-mgr-pin" className="grid gap-4 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-3">
        <h3 className="text-[15px] font-bold">{t("approval.pinTitle")}</h3>
        <p className="text-[12.5px] leading-[1.5] text-[color:var(--color-muted)]">{t("approval.pinBody")}</p>
        {managers === null ? (
          <p className="text-[13px] text-[color:var(--color-muted)]">{t("staff.loading")}</p>
        ) : managers.length === 0 ? (
          <p data-testid="pos-mgr-pin-no-manager" className="text-[13px] text-[color:var(--color-muted)]">
            {t("approval.noManager")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {managers.map((m) => (
              <button
                key={m.userId}
                data-testid="pos-mgr-pin-manager"
                type="button"
                disabled={off}
                aria-pressed={mgr === m.userId}
                className={`h-11 rounded-[11px] border px-3.5 text-[13.5px] ${mgr === m.userId ? "border-2 border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`}
                onClick={() => {
                  setMgr(m.userId);
                  setPin("");
                  setErr(null);
                }}
              >
                {m.name ?? "-"}
              </button>
            ))}
          </div>
        )}
        <div data-testid="pos-mgr-pin-dots" className="flex gap-2.5" aria-label={mgr ? t("approval.pinFor", { name: mgrName }) : t("approval.pinTitle")}>
          {Array.from({ length: boxes }, (_, i) => (
            <span key={i} aria-hidden className={`grid size-[46px] place-items-center rounded-[11px] border-[1.5px] ${i < pin.length ? "border-[color:var(--color-ink)]" : ""}`}>
              {i < pin.length ? <i className="inline-block size-3 rounded-full bg-[color:var(--color-ink)]" /> : null}
            </span>
          ))}
        </div>
        {err && (
          <p data-testid="pos-mgr-pin-error" role="alert" className="text-[13px] font-semibold text-[color:var(--color-danger)]">
            {err}
          </p>
        )}
        {pin.length >= 4 && pin.length < 6 && (
          <button data-testid="pos-mgr-pin-submit" type="button" disabled={off || !mgr} className="btn btn-primary h-11 self-start rounded-[11px] px-5 text-[14px] disabled:opacity-50" onClick={() => void submit(pin)}>
            {t("lock.confirm")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 md:w-[230px]">
        {KEYS.map((k) => (
          <button key={k} data-testid={`pos-mgr-pin-key-${k}`} type="button" disabled={off || !mgr} className="h-12 rounded-[11px] border text-[17px] font-semibold disabled:opacity-40" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button data-testid="pos-mgr-pin-clear" type="button" disabled={off || !pin} className="h-12 rounded-[11px] border bg-[color:var(--color-surface-2)] text-[14px] font-semibold disabled:opacity-40" onClick={() => press("clear")}>
          {t("approval.clear")}
        </button>
        <button data-testid="pos-mgr-pin-key-0" type="button" disabled={off || !mgr} className="h-12 rounded-[11px] border text-[17px] font-semibold disabled:opacity-40" onClick={() => press("0")}>
          0
        </button>
        <button data-testid="pos-mgr-pin-key-del" type="button" disabled={off || !pin} aria-label={t("lock.del")} className="grid h-12 place-items-center rounded-[11px] border bg-[color:var(--color-surface-2)] disabled:opacity-40" onClick={() => press("del")}>
          <RegisterIcon name="del" size={18} />
        </button>
      </div>
    </div>
  );
}
