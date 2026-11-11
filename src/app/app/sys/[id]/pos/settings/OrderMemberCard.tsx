"use client";

// OrderMemberCard.tsx — POS P3.6U ▸ การ์ด "สมาชิกบนบิลออเดอร์" ในแท็บช่องทางขาย (CD-P36U-10 · W17) ◂
//   สวิตช์ memberOnBill = settings.pos.orders.memberOnBill (ปริยายเปิด) · เจ้าของร้านบันทึกทันที (updatePosCreditSettingsAction ตัวเขียนเดียวกับการ์ดวางบิล) ·
//   คนอื่นเห็นสถานะ (aria-disabled) + "เจ้าของร้านเท่านั้น" · บรรทัดช่วย W17: แต้มได้ทุกช่องทางรวมบิลราคาแพลตฟอร์ม (แนบอย่างเดียว ไม่ลดราคา)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) · ไม่แสดง message ของเซิร์ฟเวอร์ · ปุ่ม ≥ 44px

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updatePosCreditSettingsAction } from "@/lib/modules/pos/credit-settings-actions";
import { CardHead, InlineNote, SettingsCard, SwitchKnob } from "./settings-ui";

export function OrderMemberCard(p: { systemId: string; isOwner: boolean; initial: boolean }) {
  const t = useTranslations("pos.settings.orders");
  const [on, setOn] = useState(p.initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    if (!p.isOwner || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await updatePosCreditSettingsAction({ systemId: p.systemId, patch: { memberOnBill: !on } });
      if (r.ok) setOn(r.memberOnBill);
      else setErr(r.code === "PERMISSION_DENIED" ? "ownerOnly" : "failed");
    } catch {
      setErr("failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsCard testid="pos-settings-order-member">
      <CardHead icon="users" title={t("title")} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4 text-[15px]">
          <div className="min-w-0 flex-1">
            <b className="block font-semibold">{t("memberOnBill")}</b>
            <small data-testid="pos-settings-order-member-help" className="block text-[12.5px] text-[color:var(--color-muted)]">
              {t("memberOnBillHelp")}
            </small>
          </div>
          <button
            data-testid="pos-settings-order-member-switch"
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={t("memberOnBill")}
            aria-disabled={!p.isOwner || busy}
            disabled={busy}
            className="grid min-h-11 min-w-11 place-items-center"
            onClick={() => void toggle()}
          >
            <SwitchKnob on={on} disabled={!p.isOwner || busy} />
          </button>
        </div>
        {!p.isOwner && (
          <InlineNote tone="ok" testid="pos-settings-order-member-owner-only">
            {t("ownerOnly")}
          </InlineNote>
        )}
        {err && (
          <InlineNote tone="error" testid="pos-settings-order-member-error">
            {t(err)}
          </InlineNote>
        )}
      </div>
    </SettingsCard>
  );
}
