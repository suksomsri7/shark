"use client";

// CartLine.tsx — บรรทัดในตะกร้า (สเปก §2.1 / §2.2 · §4.4 · §5 · ภาพ 01 / 20A / 19ฉ)
//   D (P1.2 U R3 V6 · ภาพ 01 ความหนาแน่น): padding 12/24 ช่องไฟ 16 · กล่องจำนวน 40×40 มุม 10 ตัว 15 หนา (ห่อด้วยปุ่ม 44×44 — S5.9) · ชื่อ 16 หนา 600 ·
//      บรรทัดรอง 13.5 muted mt 4 · ยอด 16 หนา 600 ชิดขวา · ใต้ยอด "฿100 × 2" 12.5 muted (qty > 1) · "−฿10" สีอันตราย 600
//   T/M/C: padding 8/16 ช่องไฟ 12 · กล่อง 30×30 ตัว 14 · ชื่อ 15 · รอง 12.5 mt 1 · ยอด 15 · ไม่มี "฿100 × 2"
//   เตือนสต็อก (19ฉ · นโยบายปริยาย = ขายติดลบได้ ไม่บล็อก): ขอบซ้าย 3px สีอันตราย + กล่องเตือนพื้น surface-2 มุม 14
//     "สต็อกมี N" หนาสีอันตราย · ปุ่ม "ขายต่อ" (หลัก 40) / "ลดเหลือ N" (ผี 40 · ซ่อนเมื่อ N = 0)
// 🔴 แถวเป็น div · ส่วนที่กดได้เป็น <button> แยกกัน (ปุ่มซ้อนปุ่มผิด HTML): กล่องจำนวน + ตัวบรรทัด (ชื่อ/ยอด) เปิดตัวแก้บรรทัดทั้งคู่

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "./RegisterIcon";

export type CartLineModel = {
  key: string;
  name: string;
  qty: number;
  unitPriceSatang: number;
  grossSatang: number;
  discountSatang: number;
  /** สินค้านับสต็อก: คงเหลือก่อนบิลนี้ (null = ไม่นับ) */
  stockLeft: number | null;
  /** แสดงกล่องเตือนสต็อก (qty > คงเหลือ และยังไม่กด "ขายต่อ") */
  warn: boolean;
  /** P1.6 U: หมายเหตุรายการ (ไม่มี = undefined) */
  note?: string;
  /** P1.2 U R3 F1: ราคาบรรทัดรอ quote ของเซิร์ฟเวอร์ (ตัวเลือก/ชั่ง) — ยอดแสดง "—" ไม่เดาจากราคาฐาน */
  pending?: boolean;
  /** P1.2 U: ตัวเลือกที่เลือก + น้ำหนัก ("M · นมโอ๊ต · 250 กรัม") — ภาพ 01 บรรทัดรองใต้ชื่อ */
  detail?: string;
  /** POS P2.2U ▸ มติ 5: ลำดับบรรทัด (testid ป้าย) · ป้าย "ราคาตามช่องทาง" (CHANNEL) / ชื่อโปร (RULE) · คำปฏิเสธของบรรทัด (CHANNEL_NOT_SOLD) ◂ */
  index?: number;
  badge?: { kind: "CHANNEL" | "BRANCH" | "RULE"; text: string };
  error?: string;
};

type Props = {
  line: CartLineModel;
  frozen: boolean;
  onOpen: (key: string, focus: "qty" | "discount") => void;
  onKeep: (key: string) => void;
  onReduce: (key: string, qty: number) => void;
};

export function CartLine({ line, frozen, onOpen, onKeep, onReduce }: Props) {
  const t = useTranslations("pos.register");
  const sub =
    line.discountSatang > 0
      ? t("line.discount", { amount: moneyText(line.discountSatang) })
      : line.stockLeft !== null
        ? t("line.stockMove", { from: line.stockLeft.toLocaleString("th-TH"), to: (line.stockLeft - line.qty).toLocaleString("th-TH") })
        : null;
  const left = Math.max(line.stockLeft ?? 0, 0);
  const amount = line.pending ? "\u2014" : moneyText(line.grossSatang);
  return (
    <div
      className={`flex items-start gap-3 border-b px-4 py-2 xl:gap-4 xl:px-6 xl:py-3 ${
        line.warn ? "border-l-[3px] border-l-[color:var(--color-danger)] pl-[13px] xl:pl-[21px]" : ""
      }`}
      role="listitem"
    >
      <button
        data-testid={`pos-reg-line-qty-${line.key}`}
        className="-m-[7px] flex size-11 shrink-0 items-center justify-center rounded-[12px] disabled:opacity-60 xl:-m-[2px]"
        type="button"
        disabled={frozen}
        aria-label={`${t("editor.qty")} ${line.qty.toLocaleString("th-TH")}`}
        onClick={() => onOpen(line.key, "qty")}
      >
        <span className="grid size-[30px] place-items-center rounded-[10px] border text-[14px] font-bold tabular-nums xl:size-10 xl:text-[15px]">
          {line.qty.toLocaleString("th-TH")}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <button
          data-testid={`pos-reg-cart-line-${line.key}`}
          className="flex w-full items-start gap-3 text-left disabled:cursor-default"
          type="button"
          disabled={frozen}
          aria-label={t("line.aria", { qty: line.qty.toLocaleString("th-TH"), name: line.name, amount })}
          onClick={() => onOpen(line.key, "discount")}
        >
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[15px] font-semibold [overflow-wrap:anywhere] xl:text-[16px] xl:leading-[1.4]">{line.name}</span>
            {line.detail && (
              <span data-testid={`pos-reg-line-detail-${line.key}`} className="mt-px block break-words text-[12.5px] text-[color:var(--color-muted)] [overflow-wrap:anywhere] xl:mt-1 xl:text-[13.5px]">
                {line.detail}
              </span>
            )}
            {line.badge && (
              <span
                data-testid={`pos-reg-line-badge-${line.index ?? 0}`}
                className={`mt-1 inline-flex max-w-full truncate rounded-[6px] border px-1.5 py-px text-[11px] font-bold ${
                  line.badge.kind === "RULE" ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]" : "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]"
                }`}
              >
                {line.badge.text}
              </span>
            )}
            {sub && <span className="mt-px block text-[12.5px] text-[color:var(--color-muted)] xl:mt-1 xl:text-[13.5px]">{sub}</span>}
            {line.error && (
              <span data-testid={`pos-reg-line-error-${line.index ?? 0}`} role="alert" className="mt-px block text-[12.5px] font-semibold text-[color:var(--color-danger)] xl:text-[13px]">
                {line.error}
              </span>
            )}
            {line.note && (
              <span data-testid={`pos-reg-line-note-text-${line.key}`} className="mt-px flex items-start gap-1 text-[12.5px] text-[color:var(--color-ink-soft)] xl:text-[13px]">
                <RegisterIcon name="edit" size={12} className="mt-[3px]" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{line.note}</span>
              </span>
            )}
          </span>
          <span className="shrink-0 whitespace-nowrap text-right text-[15px] font-semibold tabular-nums xl:text-[16px]">
            {amount}
            {line.qty > 1 && !line.pending && (
              <small className="hidden text-[12.5px] font-normal text-[color:var(--color-muted)] xl:block">
                {t("line.unitTimesQty", { price: moneyText(line.unitPriceSatang), qty: line.qty.toLocaleString("th-TH") })}
              </small>
            )}
            {line.discountSatang > 0 && <small className="block text-[12.5px] font-semibold text-[color:var(--color-danger)]">{moneyText(-line.discountSatang)}</small>}
          </span>
        </button>
        {line.warn && (
          <div
            data-testid={`pos-reg-line-warn-${line.key}`}
            className="mb-1 mt-2 flex flex-col gap-2.5 rounded-[14px] border bg-[color:var(--color-surface-2)] px-[13px] py-3"
            role="alert"
          >
            <div className="flex items-start gap-[9px] text-[13.5px] leading-[1.55] text-[color:var(--color-ink-soft)]">
              <RegisterIcon name="warn" size={14} className="mt-[3px] text-[color:var(--color-danger)]" />
              <p>{t.rich("errors.stockInsufficient", { count: left.toLocaleString("th-TH"), b: (c) => <b className="text-[color:var(--color-danger)]">{c}</b> })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                data-testid={`pos-reg-line-warn-keep-${line.key}`}
                className="btn btn-primary h-10 rounded-[13px] px-5 text-[14px]"
                type="button"
                disabled={frozen}
                onClick={() => onKeep(line.key)}
              >
                {t("line.keepSelling")}
              </button>
              {left > 0 && (
                <button
                  data-testid={`pos-reg-line-warn-reduce-${line.key}`}
                  className="btn btn-ghost h-10 rounded-[13px] px-5 text-[14px]"
                  type="button"
                  disabled={frozen}
                  onClick={() => onReduce(line.key, left)}
                >
                  {t("line.reduceTo", { count: left.toLocaleString("th-TH") })}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
