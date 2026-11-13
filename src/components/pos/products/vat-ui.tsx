"use client";

// vat-ui.tsx — ACC T1.8 ▸ ส่วน "ภาษีมูลค่าเพิ่ม" ในลิ้นชักสินค้า (จอ 06 แท็บทั่วไป) · ledger/wo-notes/T1.8.md §2 §7
//   ชนิด: มาตรฐาน / 0% / ยกเว้น / เก็บแทน → setProductVatTreatmentAction · เก็บแทน = คำเตือน VAT_COLLECTED_ON_BEHALF (ทะเบียนกลาง) ต้องติ๊กยืนยันก่อนบันทึก ·
//   สินค้าที่ผูกคลัง: มาตรฐาน/0%/ยกเว้น มาจากสมุดบัญชี (ปิดตัวเลือกเหล่านั้น — เก็บแทนยังตั้งได้)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · ไม่มีอีโมจิ
import { useState } from "react";
import { useTranslations } from "next-intl";
import { setProductVatTreatmentAction } from "@/lib/modules/pos/catalog-price-actions";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";

const OPTIONS = ["STANDARD", "ZERO_RATED", "EXEMPT", "ON_BEHALF"] as const;

export function ProductVatSection({
  systemId,
  productId,
  treatment,
  baseTreatment,
  fromBook,
  canManage,
  onSaved,
}: {
  systemId: string;
  productId: string;
  treatment: string;
  /** ชนิดจาก vatRateBp (ไม่นับธงเก็บแทน) — สินค้าผูกคลังเลือกได้แค่ค่านี้หรือเก็บแทน */
  baseTreatment: string;
  fromBook: boolean;
  canManage: boolean;
  onSaved?: (treatment: string, toast: string) => void;
}) {
  const t = useTranslations("pos.products.vat") as unknown as (k: string) => string;
  const [value, setValue] = useState(treatment);
  const [legal, setLegal] = useState<LegalWarning[]>([]);
  const [ack, setAck] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState(treatment);
  const dirty = value !== current;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await setProductVatTreatmentAction({ systemId, productId, treatment: value, ackCodes: ack });
      if (r.ok) {
        setLegal([]);
        setAck([]);
        setCurrent(value);
        onSaved?.(value, t("saved"));
      } else if (r.code === "LEGAL_ACK_REQUIRED" && "warnings" in r) setLegal(r.warnings);
      else setErr("message" in r ? r.message : r.code);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section data-testid="pos-prod-vat" className="mt-3 rounded-[10px] border border-[color:var(--color-line)] px-3 py-2.5">
      <h3 className="text-[13px] font-semibold">{t("title")}</h3>
      <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const locked = fromBook && o !== "ON_BEHALF" && o !== baseTreatment;
          return (
            <label
              key={o}
              data-testid={`pos-prod-vat-${o}`}
              className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border px-2.5 text-[12.5px] ${value === o ? "border-[color:var(--color-primary)] font-semibold" : "border-[color:var(--color-line)]"} ${!canManage || locked ? "opacity-50" : ""}`}
            >
              <input type="radio" data-testid={`pos-prod-vat-opt-${o}`} name={`vat-${productId}`} value={o} checked={value === o} disabled={!canManage || locked || busy} onChange={() => { setValue(o); setLegal([]); setAck([]); }} />
              {t(o)}
            </label>
          );
        })}
      </div>
      {fromBook ? <p className="mt-1.5 text-[11.5px] text-[color:var(--color-muted)]">{t("fromBook")}</p> : null}
      <p className="mt-1.5 text-[11.5px] text-[color:var(--color-muted)]">{t("hint")}</p>
      {legal.length ? (
        <div className="mt-2">
          <LegalWarnings warnings={legal} onAckChange={setAck} testId="pos-prod-vat-legal" />
        </div>
      ) : null}
      {err ? <p data-testid="pos-prod-vat-error" className="mt-1.5 text-[12px] text-[color:var(--color-danger)]">{err}</p> : null}
      {canManage && dirty ? (
        <button type="button" data-testid="pos-prod-vat-save" disabled={busy || (legal.length > 0 && ack.length === 0)} onClick={() => void save()} className="mt-2 min-h-[44px] rounded-[8px] bg-[color:var(--color-primary)] px-3 text-[13px] font-semibold text-white disabled:opacity-50">
          {t("save")}
        </button>
      ) : null}
    </section>
  );
}
