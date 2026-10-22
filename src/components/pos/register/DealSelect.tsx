"use client";

// DealSelect.tsx — เลือกดีลของบิลบนหน้าขายใหม่ (POS P3.6U ▸ CD-P36U-4 · พอร์ตจาก pos-deal-select ของหน้าขายเดิม ◂)
//   registerDealOptionsAction ครั้งเดียวทุกครั้งที่สมาชิก/บริษัทของบิลเปลี่ยน (ไม่ poll) · รายการว่าง (ไม่มีคีย์ crm.deal.update หรือไม่มีดีลเปิด) = ซ่อน
//   ตัวเลือก = "ชื่อดีล · ขั้น" — ไม่มีมูลค่าดีล (R14) · ค่าปริยาย = deal.none · ค่าที่เลือกไม่อยู่ในรายการใหม่ = ล้าง (onDeal null)
//   error = คีย์ใต้ pos.register (deal.errors.invalid หลัง submit ปฏิเสธ DEAL_INVALID)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ช่องเลือกสูง ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { registerDealOptionsAction } from "@/lib/modules/pos/credit-actions";

type Opt = { id: string; title: string; stageName: string };

export function DealSelect(p: { systemId: string; unitId: string; memberId: string | null; customerPartyId: string | null; value: string | null; frozen: boolean; error: string | null; onDeal: (dealId: string | null) => void }) {
  const t = useTranslations("pos.register");
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    let live = true;
    if (!p.memberId && !p.customerPartyId) {
      setOpts([]);
      return;
    }
    void registerDealOptionsAction({ systemId: p.systemId, unitId: p.unitId, memberId: p.memberId, customerPartyId: p.customerPartyId })
      .then((r) => {
        if (!live) return;
        // มูลค่าดีลไม่ถูกเก็บไว้ที่จอ (R14)
        setOpts(r.ok ? r.items.map((x) => ({ id: x.id, title: x.title, stageName: x.stageName })) : []);
      })
      .catch(() => live && setOpts([]));
    return () => {
      live = false;
    };
  }, [p.systemId, p.unitId, p.memberId, p.customerPartyId]);
  // ดีลที่เลือกไม่อยู่ในรายการใหม่ (เปลี่ยนสมาชิก/บริษัท) = ล้าง
  const { value, onDeal } = p;
  useEffect(() => {
    if (value && !opts.some((o) => o.id === value)) onDeal(null);
  }, [opts, value, onDeal]);
  if (opts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-12 items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 xl:px-4">
        <span className="shrink-0 text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("deal.title")}</span>
        <select
          data-testid="pos-reg-deal-select"
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none disabled:opacity-60"
          aria-label={t("deal.pick")}
          disabled={p.frozen}
          value={value ?? ""}
          onChange={(e) => onDeal(e.target.value || null)}
        >
          <option value="">{t("deal.none")}</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>{`${o.title} · ${o.stageName}`}</option>
          ))}
        </select>
      </label>
      {p.error && (
        <p data-testid="pos-reg-deal-error" role="alert" className="px-1 text-[12.5px] font-semibold text-[color:var(--color-danger)]">
          {t(p.error)}
        </p>
      )}
    </div>
  );
}
