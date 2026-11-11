"use client";

// StaffPinDialog.tsx — กล่องตั้ง/เปลี่ยน PIN ของพนักงานจากแท็บ "พนักงานและสิทธิ์" (POS P1.18U · มติ 3 · ภาพ 17C ปุ่ม "ตั้ง PIN")
//   แป้นแบบจอล็อก P1.15U (จุด 6 ดวง · 1–9 / ล้าง / 0 / ⌫ · PIN 4–6 หลัก) — ใส่ครั้งแรก → "ถัดไป" → ใส่ซ้ำ → "บันทึก PIN" → setStaffPinAction
//   (ผู้มี pos.staff.manage ตั้งให้คนในสาขา — กติกาเดิมของ P1.15) · สำเร็จ = ปิดกล่อง + ผู้เรียกโหลดรายชื่อใหม่
//   P1.15U ไม่มีแป้น "ตั้ง PIN ให้คนอื่น" แยกเป็นคอมโพเนนต์ (จอล็อกตั้งได้เฉพาะของตัวเอง) ⇒ กล่องนี้ใช้ปุ่ม/ระยะ/testid แบบเดียวกับแป้นจอล็อก
// 🔴 PIN อยู่ใน state ของกล่องนี้จนส่ง แล้วล้างทันที · คำปฏิเสธ → refusalMessageKey (pos.register.errors.*) · ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { setStaffPinAction } from "@/lib/modules/pos/staff-pin-actions";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const PIN_MIN = 4;
const PIN_MAX = 6;

export function StaffPinDialog(p: { systemId: string; unitId: string; userId: string; name: string; change: boolean; onDone: () => void; onClose: () => void }) {
  const t = useTranslations("pos.settings.staff");
  const tr = useTranslations("pos.register");
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; ns: "staff" | "register"; danger: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (value: string) => {
    if (busyRef.current || value.length < PIN_MIN) return;
    if (first === null) {
      setFirst(value);
      setPin("");
      setMsg(null);
      return;
    }
    if (first !== value) {
      setFirst(null);
      setPin("");
      setMsg({ key: "pin.mismatch", ns: "staff", danger: true });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setPin("");
    try {
      const r = await setStaffPinAction({ systemId: p.systemId, unitId: p.unitId, userId: p.userId, pin: value });
      if (r.ok) {
        p.onDone();
        return;
      }
      setFirst(null);
      setMsg({ key: refusalMessageKey(r.code), ns: "register", danger: true });
    } catch {
      setFirst(null);
      setMsg({ key: "errors.unknown", ns: "register", danger: true });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const press = (k: string) => {
    if (busyRef.current) return;
    setMsg((m) => (m?.danger ? null : m));
    if (k === "del") return setPin((v) => v.slice(0, -1));
    if (k === "clear") return setPin("");
    setPin((v) => (v.length >= PIN_MAX ? v : v + k));
  };
  // แป้นพิมพ์จริง: ตัวเลข · Backspace · Enter · Esc = ปิด
  const keyRef = useRef({ press, submit, pin, close: p.onClose });
  keyRef.current = { press, submit, pin, close: p.onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        keyRef.current.press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        keyRef.current.press("del");
      } else if (e.key === "Enter") {
        e.preventDefault();
        void keyRef.current.submit(keyRef.current.pin);
      } else if (e.key === "Escape") keyRef.current.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const keyCls = "h-[60px] rounded-[14px] border bg-[color:var(--color-surface)] text-[22px] font-semibold disabled:opacity-40";
  return (
    <RegisterDialog onDismiss={p.onClose} locked={busy}>
      <div data-testid="pos-settings-staff-pin" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t(p.change ? "pin.changeTitle" : "pin.setTitle", { name: p.name })}>
        <SheetGrab />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold">{t(p.change ? "pin.changeTitle" : "pin.setTitle", { name: p.name })}</h2>
            <p className="mt-1 text-[13.5px] text-[color:var(--color-muted)]">{first === null ? t("pin.enter") : t("pin.confirm")}</p>
          </div>
          <button data-testid="pos-settings-staff-pin-cancel" type="button" className="grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]" aria-label={t("pin.cancel")} onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        <div data-testid="pos-settings-staff-pin-dots" className="flex items-center justify-center gap-4 py-2" aria-label={t("pin.dots", { count: pin.length })}>
          {Array.from({ length: PIN_MAX }, (_, i) => (
            <i key={i} aria-hidden className={`inline-block size-[16px] rounded-full border-[1.5px] border-[color:var(--color-ink)] ${i < pin.length ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface)] opacity-40"}`} />
          ))}
        </div>
        {msg && (
          <p data-testid="pos-settings-staff-pin-message" role="alert" className="text-center text-[14px] font-semibold text-[color:var(--color-danger)]">
            {msg.ns === "staff" ? t(msg.key) : tr(msg.key)}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button key={k} data-testid={`pos-settings-staff-pin-key-${k}`} type="button" disabled={busy} className={keyCls} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button data-testid="pos-settings-staff-pin-clear" type="button" disabled={busy || !pin} className={`${keyCls} bg-[color:var(--color-surface-2)] text-[15px]`} onClick={() => press("clear")}>
            {t("pin.clear")}
          </button>
          <button data-testid="pos-settings-staff-pin-key-0" type="button" disabled={busy} className={keyCls} onClick={() => press("0")}>
            0
          </button>
          <button data-testid="pos-settings-staff-pin-del" type="button" disabled={busy || !pin} className={`${keyCls} grid place-items-center bg-[color:var(--color-surface-2)]`} aria-label={t("pin.del")} onClick={() => press("del")}>
            <RegisterIcon name="del" size={22} />
          </button>
        </div>
        <p className="text-center text-[12.5px] text-[color:var(--color-muted)]">{t("pin.hint")}</p>
        <button data-testid="pos-settings-staff-pin-next" type="button" disabled={busy || pin.length < PIN_MIN} className="btn btn-primary h-12 w-full rounded-[13px] text-[15px] font-semibold disabled:opacity-50" onClick={() => void submit(pin)}>
          {busy ? t("pin.saving") : first === null ? t("pin.next") : t("pin.save")}
        </button>
      </div>
    </RegisterDialog>
  );
}
