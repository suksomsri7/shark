"use client";

// SlipAttach.tsx — POS P3-SKEL U ▸ CD-SKELU-6: แนบสลิปโอน (หลักฐาน · ไม่มีผลเงิน) — ฟอร์มในบรรทัดชิ้นเดียว ใช้สามที่
//   (a) PayIntentPanel ใบขอรับเงิน PROMPTPAY_STATIC ที่ยัง PENDING (เป้าหมาย = intentId · ไม่ใช่แถวชำระ — หมายเหตุผู้ตรวจ S) → SlipIntentAttach
//   (b) PayDone บิลที่มีแถว TRANSFER เท่านั้น (เป้าหมาย = แถวจาก slipTargetsAction) → SlipDoneBlock
//   (c) ลิ้นชักบิล (sales/BillSlips.tsx) แถว TRANSFER/PROMPTPAY → SlipAttachPanel
//   ช่อง: รูป (jpeg/png/webp · capture กล้องหลัง · ตรวจชนิด+ขนาดฝั่งจอ) · ยอดบนสลิป (บาท ↔ สตางค์ · ไม่เติมให้ — H1 นับสลิปเมื่อยอดที่พิมพ์ตรงใบขอรับเงิน) ·
//   เลขอ้างอิง (transRef ^[A-Za-z0-9_-]{4,64}$) · คีย์รายการ 1 ค่าต่อการเลือกรูป (หมุนใหม่หลังได้ผล) → FormData → attachSlipAction
// 🔴 สลิปไม่เคยยืนยันเงินเข้า (ยืนยันเงินเข้ายังเป็น pos-pay-intent-manual) · คำปฏิเสธ = คีย์ platform.slip.errors.<camel> · STORAGE_NOT_CONFIGURED ⇒ ปุ่มปิดพร้อมเหตุผลหลังครั้งแรก
// 🔴 ไฟล์หน้าขายห้ามเรียก randomUUID (qc-pos-p1.3 S5.21 = คีย์ของบิล) — คีย์สลิปสุ่มด้วย getRandomValues (คนละคีย์กับบิล)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม/ช่อง ≥ 44px · ไม่แสดงชื่อไฟล์/ชื่อผู้แนบ

import { useState } from "react";
import { useTranslations } from "next-intl";
import { attachSlipAction } from "@/lib/modules/pos/payment-slip-actions";
import { slipTargetsAction } from "@/lib/modules/pos/platform-ui-actions";
import type { SlipView } from "@/lib/modules/pos/payment-slip";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "./RegisterIcon";

/** ขนาดไฟล์สูงสุดสำหรับตรวจฝั่งจอเมื่อหน้าเพจไม่ได้ส่ง SLIP_MAX_BYTES มา (หน้าขาย) — เซิร์ฟเวอร์ตรวจซ้ำเสมอ */
export const SLIP_CLIENT_MAX_BYTES_FALLBACK = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REF_RE = /^[A-Za-z0-9_-]{4,64}$/;
const AMOUNT_RE = /^\d{1,9}(?:\.\d{1,2})?$/;

export type SlipTarget = { key: string; amountSatang: number; type: string; saleId?: string; paymentId?: string; intentId?: string };
export type SlipResultLite = { ok: true; slip: SlipView } | { ok: false; code: string; messageKey: string };

/** คีย์รายการของสลิป (24 hex สุ่ม) — ไม่ใช่คีย์ของบิล */
function freshKey(): string {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return `slip_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}
/** "72.50" → 7250 สตางค์ (ไม่ใช้ทศนิยมลอย) · ผิดรูป = null */
function bahtToSatang(s: string): number | null {
  const v = s.trim().replace(/,/g, "");
  if (!AMOUNT_RE.test(v)) return null;
  const [b, f = ""] = v.split(".");
  return Number(b) * 100 + Number(f.padEnd(2, "0"));
}
const keyOk = (k: unknown): k is string => typeof k === "string" && /^platform\.slip\.errors\.[A-Za-z]+$/.test(k);

type FormProps = {
  systemId: string;
  unitId: string;
  targets: SlipTarget[];
  maxBytes: number;
  onResult: (r: SlipResultLite) => void;
  onCancel: () => void;
};

/** ฟอร์มแนบสลิปในบรรทัด */
export function SlipAttachPanel({ systemId, unitId, targets, maxBytes, onResult, onCancel }: FormProps) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const tr = useTranslations("pos.register");
  const [pick, setPick] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mb = Math.round(maxBytes / (1024 * 1024));
  const target = targets[pick] ?? null;
  const method = (type: string) => (type === "PROMPTPAY" ? tr("pay.promptpay") : tr("pay.transfer"));

  const onFile = (f: File | null) => {
    setErr(null);
    if (!f) return setFile(null);
    if (!TYPES.has(f.type)) {
      setFile(null);
      return setErr(t("slip.typeBad"));
    }
    if (f.size <= 0 || f.size > maxBytes) {
      setFile(null);
      return setErr(t("slip.tooBig", { mb }));
    }
    setFile(f);
    setKey(freshKey()); // คีย์ใหม่ต่อการเลือกรูป
  };

  const send = async () => {
    if (busy || !target) return;
    if (!file || !key) return setErr(t("slip.noFile"));
    const sat = amount.trim() ? bahtToSatang(amount) : null;
    if (amount.trim() && sat === null) return setErr(t("slip.amountBad"));
    const tref = ref.trim();
    if (tref && !REF_RE.test(tref)) return setErr(t("slip.refBad"));
    const fd = new FormData();
    fd.set("systemId", systemId);
    fd.set("unitId", unitId);
    if (target.intentId) fd.set("intentId", target.intentId);
    else {
      fd.set("saleId", target.saleId ?? "");
      fd.set("paymentId", target.paymentId ?? "");
    }
    fd.set("idempotencyKey", key);
    fd.set("file", file);
    if (tref) fd.set("transRef", tref);
    if (sat !== null) fd.set("amountSatang", String(sat));
    setBusy(true);
    setErr(null);
    try {
      const r = await attachSlipAction(fd);
      setKey(freshKey()); // หมุนคีย์หลังได้ผลทุกครั้ง
      if (r.ok === true) {
        setFile(null);
        setAmount("");
        setRef("");
        onResult({ ok: true, slip: r.slip });
      } else {
        setErr(keyOk(r.messageKey) && tpos.has(r.messageKey) ? tpos(r.messageKey) : t("slip.errors.unknown"));
        onResult({ ok: false, code: r.code, messageKey: r.messageKey });
      }
    } catch {
      setKey(freshKey());
      setErr(t("slip.errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const field = "input h-11 w-full min-w-0 rounded-[11px] px-3 text-[14px]";
  return (
    <div data-testid="pos-slip-form" className="flex w-full min-w-0 flex-col gap-3 rounded-[13px] border px-4 py-3.5 text-left">
      <p className="flex items-start gap-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
        <RegisterIcon name="doc" size={13} className="mt-[3px] shrink-0" />
        <span>{t("slip.evidenceOnly")}</span>
      </p>
      {targets.length > 1 && (
        <div role="radiogroup" aria-label={t("slip.pickTarget")} className="flex flex-wrap gap-2">
          {targets.map((x, i) => (
            <button key={x.key} data-testid={`pos-slip-target-${i}`} type="button" role="radio" aria-checked={i === pick} className={`min-h-11 rounded-[11px] border px-3 text-[13.5px] tabular-nums ${i === pick ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`} onClick={() => setPick(i)}>
              {t("slip.targetLine", { method: method(x.type), amount: moneyText(x.amountSatang) })}
            </button>
          ))}
        </div>
      )}
      {targets.length === 1 && target && <span className="text-[13px] font-semibold tabular-nums">{t("slip.targetLine", { method: method(target.type), amount: moneyText(target.amountSatang) })}</span>}
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]">{t("slip.file")}</span>
        <input data-testid="pos-slip-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="min-h-11 w-full min-w-0 text-[13px]" disabled={busy} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <small className="text-[12px] text-[color:var(--color-muted)]">{t("slip.fileHelp", { mb })}</small>
      </label>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]">
            {t("slip.amount")} <span className="font-normal text-[color:var(--color-muted)]">{t("slip.optional")}</span>
          </span>
          <input data-testid="pos-slip-amount" className={`${field} tabular-nums`} inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-[color:var(--color-ink-soft)]">
            {t("slip.transRef")} <span className="font-normal text-[color:var(--color-muted)]">{t("slip.optional")}</span>
          </span>
          <input data-testid="pos-slip-ref" className={`${field} font-mono`} autoComplete="off" spellCheck={false} maxLength={64} value={ref} disabled={busy} onChange={(e) => setRef(e.target.value)} />
        </label>
      </div>
      {err && (
        <p data-testid="pos-slip-error" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
          {err}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button data-testid="pos-slip-cancel" type="button" disabled={busy} className="btn btn-ghost min-h-11 rounded-[11px] px-4 text-[14px]" onClick={onCancel}>
          {t("slip.cancel")}
        </button>
        <button data-testid="pos-slip-send" type="button" disabled={busy || !file} className="btn btn-primary min-h-11 rounded-[11px] px-4 text-[14px] font-semibold disabled:opacity-60" onClick={() => void send()}>
          {busy ? t("slip.sending") : t("slip.send")}
        </button>
      </div>
    </div>
  );
}

const statusKey = (s: string) => (s === "CONFIRMED" ? "slip.statusConfirmed" : s === "REJECTED" ? "slip.statusRejected" : "slip.statusUploaded");

/** (a) ปุ่ม "แนบสลิป" ข้างปุ่มยืนยันเองของใบขอรับเงินพร้อมเพย์แบบคงที่ (PENDING) + ชิปสถานะของสลิปที่แนบในจอนี้ */
export function SlipIntentAttach({ systemId, unitId, intentId, amountSatang, maxBytes = SLIP_CLIENT_MAX_BYTES_FALLBACK }: { systemId: string; unitId: string; intentId: string; amountSatang: number; maxBytes?: number }) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const [open, setOpen] = useState(false);
  const [storageOff, setStorageOff] = useState(false);
  const [done, setDone] = useState<SlipView[]>([]);
  const last = done.at(-1) ?? null;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          data-testid="pos-pay-intent-slip"
          type="button"
          disabled={storageOff}
          title={storageOff ? tpos("platform.slip.errors.storageNotConfigured") : undefined}
          aria-expanded={open}
          className="btn btn-ghost inline-flex h-11 items-center gap-2 self-start rounded-[11px] px-4 text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setOpen((v) => !v)}
        >
          <RegisterIcon name="cam" size={14} />
          {t("slip.attach")}
        </button>
        {last && (
          <span data-testid="pos-pay-intent-slip-chip" data-status={last.status} className="inline-flex h-8 items-center rounded-[9px] border px-3 text-[12.5px] text-[color:var(--color-ink-soft)]">
            {t("slip.chip", { n: done.length, status: t(statusKey(last.status)) })}
          </span>
        )}
      </div>
      {storageOff && <small className="text-[12px] text-[color:var(--color-muted)]">{tpos("platform.slip.errors.storageNotConfigured")}</small>}
      {open && !storageOff && (
        <SlipAttachPanel
          systemId={systemId}
          unitId={unitId}
          targets={[{ key: intentId, intentId, amountSatang, type: "PROMPTPAY" }]}
          maxBytes={maxBytes}
          onCancel={() => setOpen(false)}
          onResult={(r) => {
            if (r.ok) {
              setDone((l) => [...l, r.slip]);
              setOpen(false);
            } else if (r.code === "STORAGE_NOT_CONFIGURED") setStorageOff(true);
          }}
        />
      )}
    </div>
  );
}

/** (b) จอสำเร็จ: "แนบสลิป" ของแถวโอนเงิน (แถวจาก slipTargetsAction · เฉพาะ TRANSFER) — onHold หยุดนับถอยหลังของจอระหว่างเปิดฟอร์ม */
export function SlipDoneBlock({ systemId, unitId, saleId, onHold, maxBytes = SLIP_CLIENT_MAX_BYTES_FALLBACK }: { systemId: string; unitId: string; saleId: string; onHold: (open: boolean) => void; maxBytes?: number }) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const [targets, setTargets] = useState<SlipTarget[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [storageOff, setStorageOff] = useState(false);
  const [sent, setSent] = useState(0);
  const setOpenBoth = (v: boolean) => {
    setOpen(v);
    onHold(v);
  };
  const toggle = async () => {
    if (open) return setOpenBoth(false);
    setErr(null);
    if (targets) return setOpenBoth(true);
    setBusy(true);
    try {
      const r = await slipTargetsAction({ systemId, unitId, saleId });
      if (r && r.ok === true) {
        const rows = r.targets.filter((x) => x.type === "TRANSFER").map((x) => ({ key: x.paymentId, saleId: r.saleId, paymentId: x.paymentId, amountSatang: x.amountSatang, type: x.type }));
        setTargets(rows);
        if (rows.length) setOpenBoth(true);
        else setErr(t("slip.noTarget"));
      } else setErr(r && "messageKey" in r && keyOk(r.messageKey) && tpos.has(r.messageKey) ? tpos(r.messageKey) : t("slip.errors.unknown"));
    } catch {
      setErr(t("slip.errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2 md:w-[460px]">
      <button
        data-testid="pos-reg-done-slip"
        type="button"
        disabled={busy || storageOff}
        title={storageOff ? tpos("platform.slip.errors.storageNotConfigured") : undefined}
        aria-expanded={open}
        className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60"
        onClick={() => void toggle()}
      >
        <RegisterIcon name="cam" size={15} />
        {t("slip.attach")}
      </button>
      {sent > 0 && !open && (
        <p data-testid="pos-slip-sent" role="status" className="text-[13px] text-[color:var(--color-ink-soft)]">
          {t("slip.sent")}
        </p>
      )}
      {storageOff && <small className="text-[12px] text-[color:var(--color-muted)]">{tpos("platform.slip.errors.storageNotConfigured")}</small>}
      {err && !open && (
        <p data-testid="pos-slip-error" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
          {err}
        </p>
      )}
      {open && targets && targets.length > 0 && (
        <SlipAttachPanel
          systemId={systemId}
          unitId={unitId}
          targets={targets}
          maxBytes={maxBytes}
          onCancel={() => setOpenBoth(false)}
          onResult={(r) => {
            if (r.ok) {
              setSent((n) => n + 1);
              setOpenBoth(false);
            } else if (r.code === "STORAGE_NOT_CONFIGURED") {
              setStorageOff(true);
              setOpenBoth(false);
            }
          }}
        />
      )}
    </div>
  );
}
