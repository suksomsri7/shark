"use client";

// MobileCartBar.tsx — แถบตะกร้าล่างจอมือถือ (C < 768 · ภาพ 05ก · สเปก §2.4 / §4.5)
//   ติดล่าง (sticky ในหน้าที่เลื่อน — ไม่บังการ์ดสุดท้าย) · พื้นขาว ขอบบน · padding 18/22/≥32 (safe area)
//   แถวแอบดู: ไอคอนรายการ 14 · สรุป 12 ink-soft บรรทัดเดียวตัด … · "ดูตะกร้า" 12 หนา accent · เส้นคั่นเว้น 10/10
//   แถวหลัก: "{n} รายการ" 12 muted เหนือยอด 20 หนา · ปุ่มหลัก "ชำระ ›" สูง 48 px22 ตัว 15
//   ตะกร้าว่าง: ข้อความ cart.empty แทนแถวแอบดู + ปุ่ม "ชำระ ฿0" แบบปิด (19ก)
//   แตะที่ไหนก็ได้บนแถบ (ยกเว้นปุ่มชำระ) = เปิดแผ่นตะกร้า · ชื่อสมาชิก ("· คุณสมชาย") = P1.12
// 🔴 คีย์บอร์ด/โปรแกรมอ่านจอใช้ปุ่ม "ดูตะกร้า" (pos-reg-cart-view) — การแตะทั้งแถบเป็นทางลัดของนิ้ว

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "./RegisterIcon";

type Props = { peek: string; count: number; totalText: string; payEnabled: boolean; empty: boolean; onOpen: () => void; onPay: () => void };

export function MobileCartBar({ peek, count, totalText, payEnabled, empty, onOpen, onPay }: Props) {
  const t = useTranslations("pos.register");
  return (
    <div
      data-testid="pos-reg-cart-bar"
      // B2.5: จำนวนบรรทัดให้สคริปต์ภาพ (visual-pos) ตรวจว่าคลิกเพิ่มสินค้าไม่หาย — มือถือไม่มีบรรทัดตะกร้าในหน้า
      data-count={count}
      className="sticky bottom-0 z-20 -mx-[22px] mt-auto border-t bg-[color:var(--color-surface)] px-[22px] pb-[max(32px,env(safe-area-inset-bottom))] pt-[18px] md:hidden"
      onClick={(e) => {
        if (!empty && !(e.target as HTMLElement).closest("button")) onOpen();
      }}
    >
      <div className="mb-2.5 flex items-center gap-4 border-b pb-2.5 text-[12px] text-[color:var(--color-ink-soft)]">
        <RegisterIcon name="list" size={14} />
        <span className={`min-w-0 flex-1 truncate ${empty ? "text-[color:var(--color-muted)]" : ""}`}>{empty ? t("cart.empty").split("\n")[0] : peek}</span>
        {!empty && (
          <button data-testid="pos-reg-cart-view" className="-my-3 h-11 shrink-0 text-[12px] font-bold text-[color:var(--color-accent)]" type="button" onClick={onOpen}>
            {t("cart.viewCart")}
          </button>
        )}
      </div>
      <div className="flex items-center gap-[19px]">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[color:var(--color-muted)]">{t("cart.itemCount", { count })}</div>
          <div className="text-[20px] font-bold leading-[1.2] tabular-nums">{empty ? moneyText(0) : totalText}</div>
        </div>
        <button
          data-testid="pos-reg-cart-bar-pay"
          className="btn btn-primary h-12 shrink-0 rounded-[13px] px-[22px] text-[15px] disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)]"
          type="button"
          disabled={!payEnabled}
          onClick={onPay}
        >
          {empty ? `${t("cart.payShort")} ${moneyText(0)}` : `${t("cart.payShort")} ›`}
        </button>
      </div>
    </div>
  );
}
