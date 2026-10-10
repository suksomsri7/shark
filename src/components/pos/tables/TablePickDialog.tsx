"use client";

// TablePickDialog.tsx — POS P2.4U มติ 6: ชิปชนิดบิล "ทานที่ร้าน" ของหน้าขาย
//   BillStripDialog = ถามก่อนเมื่อตะกร้ามีของที่รอบร่างของโต๊ะเก็บไม่ได้ ("รายการเหล่านี้จะถูกตัดออก — ใส่ตอนเช็คบิลได้")
//   TablePickDialog = แผ่นเลือกโต๊ะ (registerTablesAction): ว่าง/จองไว้/ต้องเก็บ = เปิดโต๊ะแล้วพักเป็นรอบร่างใหม่ · มีลูกค้า = พักลงรอบร่างของโต๊ะนั้น
//   (การเปิด/พัก/รวมร่างทำที่ RegisterScreen — ไฟล์นี้แค่เลือก) · ปิดใช้งาน = ไม่แสดง
//   🔴 ไม่มีการคิดเงินที่นี่ · ยอดบนการ์ด = unpaidSatang ของเซิร์ฟเวอร์

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText, refusalMessageKey } from "@/lib/modules/pos/register-shared";
import type { TableCard } from "@/lib/modules/pos/table-shared";
import { registerTablesAction } from "@/lib/modules/pos/table-actions";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import type { CartStrip } from "./table-ui";

export function BillStripDialog({ strip, onContinue, onClose }: { strip: CartStrip; onContinue: () => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const items = [
    strip.discount ? t("billType.strip.discount") : "",
    strip.member ? t("billType.strip.member") : "",
    strip.coupon ? t("billType.strip.coupon") : "",
    strip.channel ? t("billType.strip.channel") : "",
    strip.weighed > 0 ? t("billType.strip.weighed", { n: strip.weighed }) : "",
    strip.note ? t("billType.strip.note") : "",
  ].filter(Boolean);
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-tbl-billtype-strip" role="dialog" aria-modal="true" aria-label={t("billType.stripTitle")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("billType.stripTitle")}</h2>
        <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("billType.stripBody")}</p>
        <ul className="flex flex-col gap-1.5 rounded-[12px] border px-3.5 py-2.5 text-[14px]">
          {items.map((x) => (
            <li key={x} className="flex items-center gap-2">
              <RegisterIcon name="x" size={12} className="text-[color:var(--color-danger)]" />
              {x}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="pos-tbl-billtype-strip-back" type="button" className="btn btn-ghost h-12 rounded-[14px]" onClick={onClose}>
            {t("panel.back")}
          </button>
          <button data-testid="pos-tbl-billtype-strip-continue" type="button" className="btn btn-primary h-12 rounded-[14px] font-bold" onClick={onContinue}>
            {t("billType.continue")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}

export function TablePickDialog({ systemId, unitId, busy, onPick, onClose }: { systemId: string; unitId: string; busy: boolean; onPick: (c: TableCard) => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const [tables, setTables] = useState<TableCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await registerTablesAction({ systemId, unitId });
        if (!live) return;
        if (r.ok) setTables(r.tables.filter((c) => c.state !== "INACTIVE"));
        else {
          setTables([]);
          setErr(refusalMessageKey(r.code));
        }
      } catch {
        if (live) {
          setTables([]);
          setErr("errors.loadFailed");
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [systemId, unitId]);
  return (
    <RegisterDialog onDismiss={onClose} locked={busy}>
      <div data-testid="pos-tbl-pick" role="dialog" aria-modal="true" aria-label={t("billType.pickTable")} className={`${REG_DIALOG_PANEL} md:w-[560px]`}>
        <SheetGrab />
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[19px] font-bold">{t("billType.pickTable")}</h2>
          <button data-testid="pos-tbl-pick-close" type="button" aria-label={t("reservation.close")} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)]" onClick={onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        {err && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {tr(err)}
          </p>
        )}
        {tables === null ? (
          <p className="py-6 text-center text-[13.5px] text-[color:var(--color-muted)]">{"…"}</p>
        ) : tables.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-[color:var(--color-muted)]">{t("billType.empty")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {tables.map((c) => (
              <button
                key={c.id}
                data-testid={`pos-tbl-pick-${c.name}`}
                data-state={c.state}
                type="button"
                disabled={busy}
                className={`flex min-h-[72px] flex-col items-start gap-0.5 rounded-[14px] px-3 py-2.5 text-left disabled:opacity-50 ${
                  c.sessionId ? "border-[1.5px] border-[color:var(--color-ink)]" : "border"
                }`}
                onClick={() => onPick(c)}
              >
                <span className="text-[16px] font-bold">{c.name}</span>
                <span className="text-[12px] text-[color:var(--color-muted)]">{t(`state.${c.state}`)}</span>
                {c.sessionId ? (
                  <span className="text-[12px] font-bold tabular-nums">{c.unsentCount > 0 ? t("billType.hasDraft") : moneyText(c.unpaidSatang)}</span>
                ) : (
                  <span className="text-[12px] text-[color:var(--color-muted)]">{t("card.seats", { n: c.seats })}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </RegisterDialog>
  );
}
