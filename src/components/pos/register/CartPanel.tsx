"use client";

// CartPanel.tsx — แผงตะกร้า (สเปก §2.1 / §2.2 / §2.4 · §4.4 · ภาพ 01 / 20A / 19ก)
//   คลาสฐาน = ขนาด T (iPad 380) · `xl:` = ขนาด D (480) · แผ่นล่างมือถือ (variant "sheet") ใช้ขนาดฐาน + ปุ่มชำระ 56
//   หัว: ชิป "บิลใหม่ · ซื้อกลับ ▾" (เร็ว ๆ นี้) · "พักบิล" / "บิลที่พัก" (เร็ว ๆ นี้ · P1.5 · สูง 44 — แบบ 40/36)
//   ช่องสมาชิก: P1.3 = แถว "+ เพิ่มสมาชิก" (เร็ว ๆ นี้ · P1.12 ส่ง memberSlot เป็นการ์ดสมาชิกจริง)
//   บรรทัด (เลื่อนในตัว) → ยอด (รวม · ส่วนลดรายการ · ส่วนลดท้ายบิล แก้ · คูปอง · VAT · ยอดสุทธิ) → แถวปุ่ม 3 → ปุ่มชำระ 72 (T 70)
//   P1.2 U R3 V6 (ความหนาแน่นภาพ 01 · D 1440×900 เห็นครบ 4 บรรทัดไม่ต้องเลื่อน): หัว py 6 · การ์ดสมาชิก 56 + mt 8 · แถวยอด py 4 leading 1.4 ·
//     กล่องยอด py 12 · ปุ่มรอง 44 · ปุ่มชำระ 64 (mt/mb 12) — งบความสูงอยู่ในโน้ต pos-P1.2U (R3 V6)
//   ตะกร้าว่าง (19ก): ข้อความกลางพื้นที่ + ปุ่มชำระแบบปิด (พื้น surface-2 ตัว muted ขอบ line) — ไม่มีแถวยอด/แถวปุ่ม
// 🔴 ปุ่มชำระ (pos-reg-pay) ต้องเป็นที่แรกในไฟล์นี้ที่สตริงนี้ปรากฏ และอยู่บนแท็กที่มีคลาส ≥44px (S5.9 · G4)
// 🔴 ยอดบนจอ = priceCart ทันใจ แล้ว quote ของเซิร์ฟเวอร์ทับ · เงินที่จ่ายจริง = quote เสมอ (RegisterScreen ตัดสิน payEnabled)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatBaht } from "@/lib/ui/money";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { CartLine, type CartLineModel } from "./CartLine";
import { RegisterIcon } from "./RegisterIcon";

export type CartTotalsModel = {
  subtotalSatang: number;
  lineDiscountSatang: number;
  billDiscountSatang: number;
  couponDiscountSatang: number;
  /** P1.6 U: ค่าบริการ (มาจาก quote เท่านั้น · ยอดทันใจไม่รู้อัตรา ⇒ ไม่มี) — > 0 = แถว "ค่าบริการ" */
  serviceChargeSatang?: number;
  vatSatang: number;
  vatMode: "INCLUDED" | "EXCLUDED" | "NONE";
  vatRateBp: number;
  grandTotalSatang: number;
  /** POS P1.12U มติ 3: ส่วนลดระดับ + บรรทัดสิทธิ์ (ว่อชเชอร์/แต้ม) — มาจาก quote ของเซิร์ฟเวอร์เท่านั้น */
  tierDiscountSatang?: number;
  memberLines?: { kind: string; ref: string | null; label: string; discountSatang: number }[];
};

/** POS P1.12U มติ 3: แถวคูปอง/ระดับ/สิทธิ์ในยอด — couponInvalid = quote รายงาน COUPON conflict (แถวแดงพร้อมเหตุผล) */
export type CartMemberTotals = {
  couponCode: string | null;
  couponInvalid: boolean;
  tierName: string | null;
  /** แต้มที่เลือกใช้ (มีเฉพาะตอนเลือกในจอชำระ) */
  pointsUsed: number;
  onRemoveCoupon: () => void;
};

type Props = {
  variant: "inline" | "sheet";
  lines: CartLineModel[];
  totals: CartTotalsModel | null;
  /** P1.2 U R3 F1: ยอดรอ quote (ตะกร้ามีบรรทัดตัวเลือก/ชั่ง) — แสดงแถวยอดสุทธิเป็น "—" แทนยอดเก่า */
  totalsPending?: boolean;
  /** ข้อความบนปุ่มชำระ (ยอดล่าสุด หรือ "กำลังโหลด...") */
  payAmount: string;
  payEnabled: boolean;
  /** เหตุผลที่ชำระไม่ได้ (ออฟไลน์/ไม่มีสิทธิ์/ยอดล้ม) — แสดงใต้ยอด */
  error: React.ReactNode | null;
  frozen: boolean;
  /** POS P1.12U: การ์ดสมาชิก (MemberChip) · null = สาขาไม่มีระบบสมาชิก (ไม่มีแถวเลย) · undefined = แถวเดิมของ P1.3 */
  memberSlot?: React.ReactNode;
  member?: CartMemberTotals;
  /** บิลมี memberId (P1.3 ไม่มีทางใส่ — ทางเลือกสมาชิกคือ P1.12 · โค้ดแถว "ถอด" เตรียมไว้ตามสเปก §4.4) */
  memberAttached?: boolean;
  onRemoveMember?: () => void;
  onPay: () => void;
  onSoon: () => void;
  /** POS P1.13U มติ 1–2: ปุ่ม "ใบกำกับเต็มรูป" เปิดกล่อง 15A · set = บิลนี้มีผู้ซื้อแล้ว (จุดบอก) · eligible false = จาง + เหตุผล (ไม่เปิดกล่อง) */
  onTaxInvoice: () => void;
  taxInvoiceSet: boolean;
  taxInvoiceEligible: boolean;
  /** P1.6 U: ปุ่ม "หมายเหตุ" เปิดกล่องหมายเหตุบิล · hasNote = บิลมีหมายเหตุแล้ว (จุดบอกบนปุ่ม) */
  onNote: () => void;
  hasNote: boolean;
  /** P1.5: ปุ่มพักบิล (เปิดกล่องตั้งป้าย) · ปุ่มบิลที่พัก (เปิดลิ้นชัก) · จำนวนบิลที่พักของสาขา (0 = ไม่แสดงป้าย) */
  onHold: () => void;
  onOpenHeld: () => void;
  heldCount: number;
  /** P1.5: คำเตือนของบิลที่เพิ่งเรียกคืน (ราคาเปลี่ยน / ขายไม่ได้แล้ว) — แสดงเหนือรายการ */
  notice?: React.ReactNode;
  onBillDiscount: () => void;
  onOpenLine: (key: string, focus: "qty" | "discount") => void;
  onKeep: (key: string) => void;
  onReduce: (key: string, qty: number) => void;
  onClose?: () => void;
  /**
   * POS P2.4U ▸ มติ 6: ชิป "บิลใหม่ · ซื้อกลับ ▾" — undefined = ชิป "เร็ว ๆ นี้" เดิม (สาขาไม่มีโหมดโต๊ะ) · ส่งมา = เมนู ซื้อกลับ / ทานที่ร้าน ·
   * null = ซ่อน (โหมดโต๊ะ) ◂
   */
  billType?: { onDineIn: () => void } | null;
  /**
   * POS P2.4U ▸ มติ 4: หน้าขายผูกโต๊ะ — หัว = ชิป "โต๊ะ A5 · สั่งเพิ่ม" + ลิงก์กลับผังโต๊ะ (ไม่มีพักบิล/บิลที่พัก) · ไม่มีส่วนลด/หมายเหตุบิล/ใบกำกับ ·
   * ปุ่มหลัก = "ส่งครัว N รายการ" · ปุ่มรอง = "บันทึกไว้ก่อน" · note = บรรทัดเล็กใต้ยอด ◂
   */
  tableMode?: { chip: string; backHref: string; backLabel: string; sendLabel: string; saveLabel: string; note: string; canSend: boolean; busy: boolean; onSend: () => void; onSave: () => void } | null;
};

/** POS P2.4U ▸ มติ 6: เมนูชนิดบิล (ซื้อกลับ = ค่าเริ่ม · ทานที่ร้าน = เลือกโต๊ะ) — ปุ่มชิปคง testid pos-reg-bill-type (ข้อสอบ P1.3) ◂ */
function BillTypeChip({ onDineIn, frozen }: { onDineIn: () => void; frozen: boolean }) {
  const t = useTranslations("pos.register");
  const tt = useTranslations("pos.tables");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "flex h-11 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)]";
  return (
    <div ref={box} data-testid="pos-reg-billtype" className="relative">
      <button
        data-testid="pos-reg-bill-type"
        className="inline-flex h-11 items-center gap-[5px] whitespace-nowrap rounded-[8px] border border-[color:var(--color-ink)] px-[11px] text-[13px] font-bold xl:h-7"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tt("billType.menu")}
        disabled={frozen}
        onClick={() => setOpen((o) => !o)}
      >
        {`${t("cart.newBill")} · ${t("cart.billType.takeaway")}`}
        <RegisterIcon name="chevron" size={12} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-52 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl">
          <button data-testid="pos-reg-billtype-takeaway" role="menuitemradio" aria-checked="true" type="button" className={`${item} font-bold`} onClick={() => setOpen(false)}>
            <RegisterIcon name="check" size={13} />
            {tt("billType.takeaway")}
          </button>
          <button
            data-testid="pos-reg-billtype-dinein"
            role="menuitemradio"
            aria-checked="false"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              onDineIn();
            }}
          >
            <span className="inline-block w-[13px]" />
            {tt("billType.dineIn")}
          </button>
        </div>
      )}
    </div>
  );
}

/** VAT 700 bp → "7" · 750 → "7.5" (ไม่มี .00 ท้าย) */
const ratePct = (bp: number) => String(Number((bp / 100).toFixed(2)));

export function CartPanel(p: Props) {
  const t = useTranslations("pos.register");
  const tm = useTranslations("pos.member");
  const sheet = p.variant === "sheet";
  const empty = p.lines.length === 0;
  const tt = p.totals;
  return (
    <section
      aria-label={t("cart.title")}
      className={`flex min-h-0 flex-col bg-[color:var(--color-surface)] ${sheet ? "max-h-[85dvh] w-full" : "h-full w-full"}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b px-[14px] py-[9px] xl:gap-3 xl:px-4 xl:py-1.5">
        {/* POS P2.4U ▸ มติ 4/6: โหมดโต๊ะ = ชิปโต๊ะ + ลิงก์กลับ · สาขามีโหมดโต๊ะ = เมนูชนิดบิล · อื่น ๆ = ชิป "เร็ว ๆ นี้" เดิม ◂ */}
        {p.tableMode ? (
          <>
            <span data-testid="pos-tbl-order-chip" className="inline-flex h-7 min-w-0 items-center gap-[5px] truncate rounded-[8px] border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-[11px] text-[13px] font-bold text-[color:var(--color-accent)]">
              <RegisterIcon name="grid" size={12} />
              <span className="truncate">{p.tableMode.chip}</span>
            </span>
            <span className="flex-1" />
            <Link data-testid="pos-tbl-order-back" href={p.tableMode.backHref} className="btn-sm inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[11px] px-[11px] text-[13px] xl:text-[14px]">
              <RegisterIcon name="back" size={14} />
              {p.tableMode.backLabel}
            </Link>
          </>
        ) : p.billType ? (
          <BillTypeChip onDineIn={p.billType.onDineIn} frozen={p.frozen} />
        ) : p.billType === null ? null : (
        <button
          data-testid="pos-reg-bill-type"
          className="inline-flex h-7 items-center gap-[5px] whitespace-nowrap rounded-[8px] border border-[color:var(--color-ink)] px-[11px] text-[13px] font-bold"
          type="button"
          aria-disabled="true"
          title={t("soon")}
          onClick={p.onSoon}
        >
          {`${t("cart.newBill")} · ${t("cart.billType.takeaway")}`}
          <RegisterIcon name="chevron" size={12} />
        </button>
        )}
        {!p.tableMode && (
        <>
        <span className="flex-1" />
        <button
          data-testid="pos-reg-hold"
          className="btn-sm h-11 shrink-0 gap-1.5 rounded-[11px] px-[11px] text-[13px] xl:px-[14px] xl:text-[14px]"
          type="button"
          aria-keyshortcuts="F8"
          disabled={p.frozen || empty}
          onClick={p.onHold}
        >
          <RegisterIcon name="clock" size={14} />
          {t("cart.hold")}
        </button>
        <button
          data-testid="pos-reg-held-bills"
          className="btn-sm h-11 shrink-0 gap-1.5 rounded-[11px] px-[11px] text-[13px] xl:px-[14px] xl:text-[14px]"
          type="button"
          disabled={p.frozen}
          onClick={p.onOpenHeld}
        >
          <span className="xl:hidden">{t("cart.heldBillsShort")}</span>
          <span className="hidden xl:inline">{t("cart.heldBills")}</span>
          {p.heldCount > 0 && (
            <span
              data-testid="pos-reg-held-count"
              className="grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--color-ink)] px-1.5 text-[11.5px] font-bold tabular-nums text-[color:var(--color-surface)]"
            >
              {p.heldCount > 99 ? "99+" : p.heldCount}
            </span>
          )}
        </button>
        </>
        )}
        {sheet && p.onClose && (
          <button
            data-testid="pos-reg-sheet-close"
            className="-mr-1.5 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("cart.close")}
            onClick={p.onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        )}
      </div>

      {p.memberSlot !== null && (
      <div className="mx-[14px] mb-0.5 mt-2 shrink-0 xl:mx-4 xl:mb-0 xl:mt-2">
        {p.memberSlot ??
          (p.memberAttached ? (
            <div className="flex min-h-12 items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[9px] text-[15px] xl:min-h-14 xl:px-4 xl:py-[14px]">
              <RegisterIcon name="users" size={18} className="text-[color:var(--color-muted)]" />
              <span className="flex-1">{t("member.attached")}</span>
              <button
                data-testid="pos-reg-member-remove"
                className="h-11 px-1 text-[12.5px] text-[color:var(--color-muted)] underline disabled:opacity-50"
                type="button"
                disabled={p.frozen}
                onClick={p.onRemoveMember}
              >
                {t("member.remove")}
              </button>
            </div>
          ) : (
          <button
            data-testid="pos-reg-member-pick"
            className="flex min-h-12 w-full items-center gap-3 rounded-[18px] border bg-[color:var(--color-surface-2)] px-3 py-[9px] text-left text-[15px] text-[color:var(--color-ink-soft)] xl:min-h-14 xl:px-4 xl:py-[14px]"
            type="button"
            aria-disabled="true"
            title={t("soon")}
            disabled={p.frozen}
            onClick={p.onSoon}
          >
            <RegisterIcon name="users" size={18} className="text-[color:var(--color-muted)]" />
            <span className="flex-1">{t("member.add")}</span>
            <span className="rounded-[6px] border bg-[color:var(--color-surface)] px-1.5 text-[11px] leading-[18px] text-[color:var(--color-muted)]">{t("soonChip")}</span>
          </button>
          ))}
      </div>
      )}

      {p.notice && <div className="mx-[14px] mt-2 shrink-0 xl:mx-4">{p.notice}</div>}

      <div data-testid="pos-reg-lines" className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label={t("cart.title")}>
        {empty ? (
          <p
            data-testid="pos-reg-cart-empty"
            className="grid h-full min-h-[120px] place-items-center whitespace-pre-line px-6 py-8 text-center text-[13.5px] leading-[1.6] text-[color:var(--color-muted)]"
          >
            {t("cart.empty")}
          </p>
        ) : (
          p.lines.map((l) => <CartLine key={l.key} line={l} frozen={p.frozen} onOpen={p.onOpenLine} onKeep={p.onKeep} onReduce={p.onReduce} />)
        )}
      </div>

      {!empty && tt && (
        <div className="shrink-0 border-t px-4 py-2 text-[14px] xl:px-6 xl:py-3 xl:text-[15px] xl:leading-[1.4]">
          <div data-testid="pos-reg-subtotal" className="flex justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1">
            <span>{t("totals.subtotal")}</span>
            <span className="tabular-nums">{moneyText(tt.subtotalSatang)}</span>
          </div>
          {tt.lineDiscountSatang > 0 && (
            <div data-testid="pos-reg-line-discounts" className="flex justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1">
              <span>{t("totals.lineDiscounts")}</span>
              <span className="tabular-nums text-[color:var(--color-danger)]">{moneyText(-tt.lineDiscountSatang)}</span>
            </div>
          )}
          {!p.tableMode && ( // POS P2.4U ▸ โหมดโต๊ะไม่มีส่วนลดท้ายบิล ◂
          <div data-testid="pos-reg-bill-discount-line" className="flex items-baseline justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1">
            <span>
              {t("totals.billDiscount")}
              <button
                data-testid="pos-reg-bill-discount-edit"
                className="ml-1.5 text-[12px] font-bold text-[color:var(--color-accent)] disabled:opacity-50"
                type="button"
                disabled={p.frozen}
                onClick={p.onBillDiscount}
              >
                {t("totals.edit")}
              </button>
            </span>
            <span className={`tabular-nums ${tt.billDiscountSatang > 0 ? "text-[color:var(--color-danger)]" : ""}`}>
              {tt.billDiscountSatang > 0 ? moneyText(-tt.billDiscountSatang) : moneyText(0)}
            </span>
          </div>
          )}
          {/* POS P1.12U มติ 3 ▸ คูปอง (แดง · ✕ ลบ) → ส่วนลดระดับ → ว่อชเชอร์/แต้มที่เลือก (ตัวเลขจาก quote ของเซิร์ฟเวอร์เท่านั้น) ◂ */}
          {p.member?.couponCode && (tt.couponDiscountSatang > 0 || p.member.couponInvalid) && (
            <div data-testid="pos-member-coupon-line" data-state={p.member.couponInvalid ? "invalid" : "ok"} className="flex items-center justify-between gap-2 py-px text-[color:var(--color-ink-soft)] xl:py-1">
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{tm("chip.couponLine", { code: p.member.couponCode })}</span>
                <button
                  data-testid="pos-member-coupon-remove"
                  className="-my-2 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] disabled:opacity-50"
                  type="button"
                  disabled={p.frozen}
                  aria-label={tm("chip.removeCoupon", { code: p.member.couponCode })}
                  onClick={p.member.onRemoveCoupon}
                >
                  <RegisterIcon name="x" size={12} />
                </button>
              </span>
              <span className="shrink-0 tabular-nums text-[color:var(--color-danger)]">
                {p.member.couponInvalid ? t("errors.couponInvalid") : moneyText(-tt.couponDiscountSatang)}
              </span>
            </div>
          )}
          {(tt.tierDiscountSatang ?? 0) > 0 && (
            <div data-testid="pos-member-tier-line" className="flex justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1">
              <span className="truncate">{tm("chip.tierLine", { tier: p.member?.tierName ?? tm("chip.general") })}</span>
              <span className="tabular-nums text-[color:var(--color-danger)]">{moneyText(-(tt.tierDiscountSatang ?? 0))}</span>
            </div>
          )}
          {(tt.memberLines ?? [])
            .filter((l) => (l.kind === "VOUCHER" || l.kind === "POINTS") && l.discountSatang > 0)
            .map((l) => (
              <div
                key={`${l.kind}-${l.ref ?? ""}`}
                data-testid={l.kind === "VOUCHER" ? "pos-member-voucher-line" : "pos-member-points-line"}
                className="flex justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1"
              >
                <span className="truncate">{l.kind === "VOUCHER" ? tm("chip.voucherLine", { name: l.label }) : tm("chip.pointsLine", { points: (p.member?.pointsUsed ?? 0).toLocaleString("th-TH") })}</span>
                <span className="tabular-nums text-[color:var(--color-danger)]">{moneyText(-l.discountSatang)}</span>
              </div>
            ))}
          {(tt.serviceChargeSatang ?? 0) > 0 && (
            <div data-testid="pos-reg-service-charge-line" className="flex justify-between py-px text-[color:var(--color-ink-soft)] xl:py-1">
              <span>{t("totals.serviceCharge")}</span>
              <span className="tabular-nums">{moneyText(tt.serviceChargeSatang ?? 0)}</span>
            </div>
          )}
          {tt.vatMode !== "NONE" && (
            <div data-testid="pos-reg-vat-line" className="flex justify-between py-px text-[12px] text-[color:var(--color-muted)] xl:py-1">
              <span>{tt.vatMode === "INCLUDED" ? t("totals.vatIncluded", { rate: ratePct(tt.vatRateBp) }) : t("totals.vatExcluded", { rate: ratePct(tt.vatRateBp) })}</span>
              <span className="tabular-nums">{formatBaht(tt.vatSatang, { decimals: true })}</span>
            </div>
          )}
          <div data-testid="pos-reg-total" className="flex items-baseline justify-between gap-3 pt-1 text-[24px] font-bold text-[color:var(--color-ink)] xl:pt-2 xl:text-[26px]" aria-live="polite">
            <span>{t("totals.total")}</span>
            <span className="whitespace-nowrap tabular-nums">{moneyText(tt.grandTotalSatang)}</span>
          </div>
          {p.tableMode && <p data-testid="pos-tbl-order-price-note" className="pt-1 text-[12px] text-[color:var(--color-muted)]">{p.tableMode.note}</p>}
        </div>
      )}

      {!empty && !tt && p.totalsPending && (
        <div className="shrink-0 border-t px-4 py-2 xl:px-6 xl:py-3">
          <div data-testid="pos-reg-total" className="flex items-baseline justify-between gap-3 pt-1 text-[24px] font-bold text-[color:var(--color-ink)] xl:pt-2 xl:text-[26px]" aria-live="polite" aria-busy="true">
            <span>{t("totals.total")}</span>
            <span className="whitespace-nowrap tabular-nums text-[color:var(--color-muted)]">{"\u2014"}</span>
          </div>
        </div>
      )}

      {p.error && (
        <p data-testid="pos-reg-error" className="shrink-0 px-4 pb-1 text-[13.5px] text-[color:var(--color-danger)] xl:px-6" role="alert">
          {p.error}
        </p>
      )}

      {/* B2.2 S3: แถวปุ่มรอง สูง 40 ทุกความกว้าง (สเปก §4/§7 · ขั้นต่ำ .btn-sm) — เดิมต่ำกว่า xl เหลือ 36 */}
      {!empty && !p.tableMode && (
        <div className="grid shrink-0 grid-cols-3 gap-2 px-[14px] xl:gap-3 xl:px-4">
          <button
            data-testid="pos-reg-bill-discount"
            className="btn-sm h-10 min-w-0 xl:h-11 gap-[5px] rounded-[11px] px-1.5 text-[13px] disabled:opacity-50 xl:gap-1.5 xl:px-[14px] xl:text-[14px]"
            type="button"
            disabled={p.frozen}
            onClick={p.onBillDiscount}
          >
            <RegisterIcon name="pct" size={12} />
            <span className="truncate xl:hidden">{t("actions.billDiscountShort")}</span>
            <span className="hidden truncate xl:inline">{t("actions.billDiscount")}</span>
          </button>
          <button
            data-testid="pos-reg-note"
            className={`btn-sm h-10 min-w-0 xl:h-11 gap-[5px] rounded-[11px] px-1.5 text-[13px] disabled:opacity-50 xl:gap-1.5 xl:px-[14px] xl:text-[14px] ${p.hasNote ? "border-[color:var(--color-ink)] font-bold" : ""}`}
            type="button"
            disabled={p.frozen}
            aria-label={p.hasNote ? `${t("actions.note")} · ${t("note.has")}` : undefined}
            onClick={p.onNote}
          >
            <RegisterIcon name="edit" size={12} />
            <span className="truncate">{t("actions.note")}</span>
            {p.hasNote && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-ink)]" />}
          </button>
          <button
            data-testid="pos-reg-tax-invoice"
            className={`btn-sm h-10 min-w-0 xl:h-11 gap-[5px] rounded-[11px] px-1.5 text-[13px] disabled:opacity-50 xl:gap-1.5 xl:px-[14px] xl:text-[14px] ${
              !p.taxInvoiceEligible ? "text-[color:var(--color-muted)] opacity-60" : p.taxInvoiceSet ? "border-[color:var(--color-ink)] font-bold" : ""
            }`}
            type="button"
            disabled={p.frozen}
            aria-disabled={!p.taxInvoiceEligible || undefined}
            title={!p.taxInvoiceEligible ? t("errors.taxInvoiceNotEligible") : undefined}
            aria-label={p.taxInvoiceSet ? `${t("actions.taxInvoice")} · ${t("taxInvoice.set")}` : undefined}
            onClick={p.onTaxInvoice}
          >
            {/* fix V1: ตั้งผู้ซื้อแล้ว = ไอคอน ✓ + ป้ายสั้น "ใบกำกับ" ทุกความกว้าง (ป้ายเต็ม + ตัวหนา + จุด ล้นจนตัดเป็น "ใบกำกับเต็..." ที่ 1440/1024) */}
            <RegisterIcon name={p.taxInvoiceSet ? "check" : "doc"} size={12} />
            {p.taxInvoiceSet ? (
              <span className="truncate">{t("actions.taxInvoiceShort")}</span>
            ) : (
              <>
                <span className="truncate xl:hidden">{t("actions.taxInvoiceShort")}</span>
                <span className="hidden truncate xl:inline">{t("actions.taxInvoice")}</span>
              </>
            )}
          </button>
        </div>
      )}

      {!p.tableMode ? (
      <button
        data-testid="pos-reg-pay"
        className={`btn btn-primary mx-[14px] mb-3 mt-2.5 shrink-0 justify-between rounded-[18px] px-[22px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)] xl:mx-6 xl:mb-3 xl:mt-3 xl:px-6 ${
          sheet ? "h-14 text-[17px]" : "h-[70px] text-[21px] xl:h-16 xl:text-[19px]"
        }`}
        type="button"
        disabled={!p.payEnabled}
        aria-keyshortcuts="F4"
        onClick={p.onPay}
      >
        <span>{t("actions.pay")}</span>
        <span className="whitespace-nowrap tabular-nums">
          {p.payAmount}
          {!sheet && <span className="ml-2.5 hidden text-[12px] font-semibold opacity-70 xl:inline">(F4)</span>}
        </span>
      </button>
      ) : (
        // POS P2.4U ▸ มติ 4: บันทึกไว้ก่อน (พักรอบร่างอย่างเดียว) · ส่งครัว N รายการ (พักแล้วส่งรอบ) ◂
        <div className={`mx-[14px] mb-3 mt-2.5 grid shrink-0 grid-cols-[auto_1fr] gap-2 xl:mx-6 xl:mt-3`}>
          <button
            data-testid="pos-tbl-order-save"
            className="btn btn-ghost h-14 rounded-[16px] px-4 text-[14.5px] font-bold disabled:opacity-50"
            type="button"
            disabled={!p.tableMode.canSend || p.tableMode.busy || p.frozen}
            onClick={p.tableMode.onSave}
          >
            {p.tableMode.saveLabel}
          </button>
          <button
            data-testid="pos-tbl-order-send"
            className={`btn btn-primary justify-center rounded-[18px] px-5 font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)] ${sheet ? "h-14 text-[16px]" : "h-14 text-[17px] xl:text-[18px]"}`}
            type="button"
            disabled={!p.tableMode.canSend || p.tableMode.busy || p.frozen}
            onClick={p.tableMode.onSend}
          >
            {p.tableMode.sendLabel}
          </button>
        </div>
      )}
    </section>
  );
}
