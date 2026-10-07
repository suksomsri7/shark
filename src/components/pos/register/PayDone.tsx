"use client";

// PayDone.tsx — จอสำเร็จหลังชำระครบ (POS P1.6 U · ภาพ 02b) — แทน SaleDone ชั่วคราวของ P1.3
//   วงกลมหมึก + ถูก · "ชำระแล้ว ฿X" 30 หนา · กล่องตัวเลข (เงินทอน · เลขใบเสร็จ · วิธีชำระ) · ปุ่ม "ขายต่อ (อัตโนมัติ 5 วินาที)"
//   ช่องที่ภาพมีแต่ยังไม่มีงานรองรับ: แต้มที่ได้ (P1.12) · ใบกำกับอย่างย่อ (P1.13) · สถานะลงบัญชี · พิมพ์ซ้ำ/LINE/QR ใบเสร็จ (P1.10) — ไม่แสดง
//   "สำเร็จ" = หมึกตัวหนา + ไอคอนถูก (ไม่ใช่สีเขียว — UI_STANDARD §0.1) · ปุ่มถัดไปโฟกัสรอ (Enter = ขายต่อ)
// 🔴 duplicated:true ก็คือขายสำเร็จบิลเดิม · ปิดด้วยม่าน/Esc ไม่ได้
// 🔴 มติผู้คุมงาน (7 ต.ค. Q2): นับถอยหลัง 5 วินาทีแล้วไปบิลถัดไปเอง (ภาพ 02b) เฉพาะเมื่อไม่มีเงินทอน (ทอน 0) ·
//    มีเงินทอน = จอค้างจนกด Enter/ปุ่ม "ขายต่อ" (แคชเชียร์ต้องอ่านยอดทอนให้ทัน)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText, type RegisterPayMethod, type RegisterPayType } from "@/lib/modules/pos/register-shared";
import { RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

const AUTO_SECONDS = 5;
const PAY_LABEL: Record<RegisterPayType, string> = { CASH: "pay.cash", PROMPTPAY: "pay.promptpay", TRANSFER: "pay.transfer", CARD: "pay.card" };

type Props = { receiptNo: string | null; totalSatang: number; changeSatang: number; payMethods: RegisterPayMethod[]; onNext: () => void };

export function PayDone({ receiptNo, totalSatang, changeSatang, payMethods, onNext }: Props) {
  const t = useTranslations("pos.register");
  const auto = changeSatang === 0;
  const [left, setLeft] = useState(AUTO_SECONDS);
  const nextRef = useRef(onNext);
  nextRef.current = onNext;
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [auto]);
  useEffect(() => {
    if (auto && left <= 0) nextRef.current();
  }, [auto, left]);
  const paidBy = payMethods.map((m) => `${t(PAY_LABEL[m.type])} ${moneyText(m.amountSatang)}`).join(" · ");
  const cell = "flex min-w-[150px] flex-col gap-[3px] px-5 py-[11px] max-md:border-t max-md:first:border-t-0 md:border-l md:first:border-l-0";
  return (
    <RegisterDialog onDismiss={() => undefined}>
      <div
        data-testid="pos-reg-done"
        className="relative flex max-h-[88dvh] w-full flex-col items-center gap-5 overflow-y-auto rounded-t-[16px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 text-center shadow-xl md:w-auto md:min-w-[560px] md:max-w-[calc(100vw-32px)] md:gap-[31px] md:rounded-[22px] md:px-10 md:py-9"
        role="dialog"
        aria-modal="true"
        aria-label={t("done.title")}
      >
        <SheetGrab />
        <span className="mt-2 grid size-[52px] place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)] md:mt-0">
          <RegisterIcon name="check" size={26} strokeWidth={2.4} />
        </span>
        <h2 className="text-[26px] font-bold tracking-[-0.02em] tabular-nums md:text-[30px]">{t("done.paid", { amount: moneyText(totalSatang) })}</h2>
        <div className="flex w-full overflow-hidden rounded-[12px] border text-left max-md:flex-col md:w-auto">
          <div className={cell}>
            <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("pay.change")}</span>
            <span data-testid="pos-reg-done-change" className="text-[15px] font-bold tabular-nums">
              {moneyText(changeSatang)}
            </span>
          </div>
          <div className={cell}>
            <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.receiptNo")}</span>
            <span data-testid="pos-reg-done-receipt" className="text-[15px] font-bold tabular-nums">
              {receiptNo ?? "-"}
            </span>
          </div>
          {paidBy && (
            <div className={cell}>
              <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("done.paidBy")}</span>
              <span className="text-[15px] font-bold tabular-nums">{paidBy}</span>
            </div>
          )}
        </div>
        <button
          data-testid="pos-reg-done-next"
          className="btn btn-primary h-14 w-full gap-2 rounded-[16px] px-6 text-[16px] font-bold md:h-12 md:w-auto md:min-w-[210px] md:rounded-[13px]"
          type="button"
          autoFocus
          onClick={onNext}
        >
          {t("done.nextShort")}
          {auto && <span className="font-normal opacity-70">{t("done.auto", { sec: Math.max(left, 0) })}</span>}
        </button>
      </div>
    </RegisterDialog>
  );
}
