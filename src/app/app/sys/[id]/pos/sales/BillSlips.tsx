"use client";

// BillSlips.tsx — POS P3-SKEL U ▸ CD-SKELU-6 (c) · CD-SKELU-7: บล็อก "สลิปโอน" ในลิ้นชักบิล (12) ใต้ส่วนการชำระ
//   ชิปต่อสลิปจาก bill.slips (สถานะเท่านั้น — ไม่มีชื่อผู้แนบ/ชื่อไฟล์) → แผ่นดูสลิป (SlipSheet) · "แนบสลิป" สำหรับแถว TRANSFER/PROMPTPAY
//   (paymentId จาก slipTargetsAction — อ่านอย่างเดียว · ยอดที่พิมพ์ในสลิปมาจากตัวอ่านเดียวกัน) · ผลใด ๆ = onChanged (ลิ้นชักโหลดบิลใหม่)
// 🔴 หลักฐานเท่านั้น ไม่มีผลเงิน · ปุ่มยืนยัน/ปฏิเสธเฉพาะผู้ถือ pos.shift.manage (หน้าเพจส่ง · เซิร์ฟเวอร์ตัดสินซ้ำ)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { slipTargetsAction } from "@/lib/modules/pos/platform-ui-actions";
import type { SlipTargetRow, SlipTargetSlip } from "@/lib/modules/pos/slip-targets";
import { SlipAttachPanel, type SlipTarget } from "@/components/pos/register/SlipAttach";
import { SlipSheet as SlipSheetView } from "./SlipSheet";

type Slip = { id: string; status: "UPLOADED" | "CONFIRMED" | "REJECTED"; thumbUrl: string | null };
type Props = {
  systemId: string;
  unitId: string;
  saleId: string;
  slips: Slip[];
  /** บิลมีแถวโอน/พร้อมเพย์ และยังไม่ถูกยกเลิก */
  canAttach: boolean;
  canManageShift: boolean;
  maxBytes: number;
  onChanged: () => void;
};

export function BillSlips({ systemId, unitId, saleId, slips, canAttach, canManageShift, maxBytes, onChanged }: Props) {
  const t = useTranslations("pos.platform");
  const tpos = useTranslations("pos");
  const [rows, setRows] = useState<{ targets: SlipTargetRow[]; slips: SlipTargetSlip[] } | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [attach, setAttach] = useState(false);
  const [storageOff, setStorageOff] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const want = slips.length > 0 || canAttach;
  useEffect(() => {
    if (!want) return;
    let live = true;
    slipTargetsAction({ systemId, unitId, saleId })
      .then((r) => {
        if (!live) return;
        if (r && r.ok === true) setRows({ targets: r.targets, slips: r.slips });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [systemId, unitId, saleId, want, tick, slips.length]);
  if (!want) return null;

  const statusText = (s: Slip["status"]) => (s === "CONFIRMED" ? t("slip.statusConfirmed") : s === "REJECTED" ? t("slip.statusRejected") : t("slip.statusUploaded"));
  const targets: SlipTarget[] = (rows?.targets ?? []).map((x) => ({ key: x.paymentId, saleId, paymentId: x.paymentId, amountSatang: x.amountSatang, type: x.type }));
  const open = openIdx !== null ? slips[openIdx] : null;
  const meta = open ? rows?.slips.find((x) => x.slipId === open.id) : undefined;
  const paid = meta?.paymentId ? (rows?.targets.find((x) => x.paymentId === meta.paymentId)?.amountSatang ?? null) : null;

  return (
    <section data-testid="pos-bills-slips" className="flex flex-col gap-2 border-b px-5 py-3 text-[13px]">
      <h3 className="text-[12px] font-bold text-[color:var(--color-muted)]">{t("slip.blockTitle")}</h3>
      {slips.length === 0 ? <span className="text-[color:var(--color-muted)]">{t("slip.none")}</span> : null}
      {slips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slips.map((s, i) => (
            <button key={s.id} data-testid={`pos-bills-slip-${i}`} data-status={s.status} type="button" className="inline-flex min-h-11 items-center rounded-[11px] border px-3 text-[13px]" onClick={() => setOpenIdx(i)}>
              {t("slip.chip", { n: i + 1, status: statusText(s.status) })}
            </button>
          ))}
        </div>
      )}
      {canAttach && !attach && (
        <button
          data-testid="pos-bills-slip-attach"
          type="button"
          disabled={storageOff || !rows || targets.length === 0}
          title={storageOff ? tpos("platform.slip.errors.storageNotConfigured") : undefined}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-[color:var(--color-accent)] disabled:text-[color:var(--color-muted)]"
          onClick={() => {
            setErr(null);
            setAttach(true);
          }}
        >
          {t("slip.attach")}
        </button>
      )}
      {storageOff && <small className="text-[12px] text-[color:var(--color-muted)]">{tpos("platform.slip.errors.storageNotConfigured")}</small>}
      {err && (
        <p role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
          {err}
        </p>
      )}
      {attach && targets.length > 0 && (
        <SlipAttachPanel
          systemId={systemId}
          unitId={unitId}
          targets={targets}
          maxBytes={maxBytes}
          onCancel={() => setAttach(false)}
          onResult={(r) => {
            if (r.ok) {
              setAttach(false);
              setTick((n) => n + 1);
              onChanged();
            } else if (r.code === "STORAGE_NOT_CONFIGURED") {
              setStorageOff(true);
              setAttach(false);
            }
          }}
        />
      )}
      {open && openIdx !== null && (
        <SlipSheetView
          systemId={systemId}
          unitId={unitId}
          slipId={open.id}
          index={openIdx}
          status={open.status}
          typedSatang={meta?.amountSatang ?? null}
          paidSatang={paid}
          canManageShift={canManageShift}
          onClose={() => setOpenIdx(null)}
          onChanged={() => {
            setTick((n) => n + 1);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
