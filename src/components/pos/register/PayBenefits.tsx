"use client";

// PayBenefits.tsx — ส่วนสิทธิ์สมาชิกในจอชำระ (POS P1.12U มติ 6 · ภาพ 02 การ์ดแต้ม + แถวคูปอง) · InterimPayDialog วางระหว่างยอด/รายละเอียดกับแถวแยกจ่าย
//   การ์ดแต้ม (มีระบบแต้ม): "ใช้แต้มเป็นส่วนลด" · "{N} แต้ม = ฿1" · "{ชื่อ} มี 1,240 แต้ม (= ฿124)" · ช่องแต้ม (ตัวเลข · Enter = ใช้) › "ลด ฿x" ·
//     ปุ่มเม็ดยา "ใช้ส่วนลด ฿x" → memberChoices.points + quote ใหม่ · ใช้แล้ว = "✓ ใช้แล้ว" + "ยกเลิก" · แต้มไม่ถึงขั้นต่ำ = การ์ดจาง "ต้องมีอย่างน้อย N แต้ม"
//     เกินเพดาน (POINTS_CAPPED) = RegisterScreen แก้เป็น allowedPoints ให้เอง (quote ใหม่ครั้งเดียว) + บรรทัดบอก · ต่ำกว่าขั้นต่ำ/ไม่พอ = บรรทัดบอก + ล้างที่เลือก
//   แถวคูปอง: "คูปอง CODE −฿x ✓ใช้แล้ว" + ✕ · ใช้ไม่ได้ = แถวแดง + "ลบคูปอง" · ไม่มีคูปอง = แถวจาง "ใส่คูปอง" (กล่องคูปอง)
//   ว่อชเชอร์ (มีใบ): เลือกได้ 1 ใบ (แบบปุ่มวิทยุ) · ใช้ไม่ได้ = จาง + เหตุผล · ชนกับคูปอง/ใช้ไม่ได้ตอน quote = บรรทัดแดงใต้แถว + ล้างที่เลือก
//   ส่วนลดระดับ (อ่านอย่างเดียว) · ดวงสแตมป์ที่บิลนี้จะได้ · แบนเนอร์ "สิทธิ์เปลี่ยน" (MEMBER_RIGHTS_CHANGED ตอนบันทึก)
// 🔴 ตัวเลขเงินทุกตัวมาจาก quote ของเซิร์ฟเวอร์ (ยกเว้นตัวอย่าง "ลด ฿x" ก่อนกดใช้ = แต้ม × อัตรา) · ไม่มีข้อความไทยนอกคอมเมนต์

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatShortDate } from "@/lib/ui/date";
import { moneyText, type RegisterMemberBenefits, type RegisterMemberChoices, type RegisterMemberItem, type RegisterQuote } from "@/lib/modules/pos/register-shared";
import { memberShortName, parsePointsInput, pointsRate } from "@/lib/modules/pos/register-member-shared";
import { RegisterIcon } from "./RegisterIcon";

export type PayBenefitsProps = {
  /** สาขามีระบบสมาชิก — false = แสดงแค่แถวคูปอง (เมื่อมีโค้ด) */
  memberEnabled: boolean;
  member: RegisterMemberItem | null;
  /** สิทธิ์ของสมาชิกคนนี้ (null = กำลังโหลด / ไม่มีสมาชิก) */
  benefits: RegisterMemberBenefits | null;
  quote: RegisterQuote | null;
  choices: RegisterMemberChoices;
  couponCode: string | null;
  /** quote รายงาน COUPON_INVALID */
  couponInvalid: boolean;
  pointsNote: React.ReactNode | null;
  voucherNote: { id: string; node: React.ReactNode } | null;
  rightsChanged: boolean;
  focusPoints: boolean;
  busy: boolean;
  onPoints: (points: number | null) => void;
  onVoucher: (id: string | null) => void;
  onEnterCoupon: () => void;
  onRemoveCoupon: () => void;
};

export function PayBenefits(p: PayBenefitsProps) {
  const t = useTranslations("pos.member");
  const tr = useTranslations("pos.register");
  const locale = useLocale(); // fix รอบ 1 F6: วันหมดอายุตามภาษาของจอ
  const pts = p.benefits?.points ?? null;
  const chosen = p.choices.points ?? 0;
  const [text, setText] = useState(chosen > 0 ? String(chosen) : "");
  const inputRef = useRef<HTMLInputElement>(null);
  // ที่เลือกเปลี่ยนจากข้างนอก (แก้เป็นเพดาน · ล้างเพราะใช้ไม่ได้ · ยกเลิก) ⇒ ช่องตามค่าใหม่
  useEffect(() => {
    if (chosen > 0) setText(String(chosen));
  }, [chosen]);
  useEffect(() => {
    if (p.focusPoints && pts) setTimeout(() => inputRef.current?.focus({ preventScroll: false }), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวเมื่อการ์ดแต้มพร้อม
  }, [!!pts]);

  const want = parsePointsInput(text);
  const preview = pts ? want * pts.burnRateSatang : 0;
  const pointsLine = p.quote?.memberLines?.find((l) => l.kind === "POINTS") ?? null;
  const applied = chosen > 0 && want === chosen && !!pointsLine;
  const belowMin = !!pts && pts.balance < pts.burnMinPoints;
  const rate = pts ? pointsRate(pts.burnRateSatang) : null;
  const apply = () => {
    if (p.busy || !pts || belowMin || want <= 0 || applied) return;
    p.onPoints(want);
  };

  const showMember = p.memberEnabled && !!p.member;
  const tierSatang = p.quote?.tierDiscountSatang ?? 0;
  const stampAdd = p.quote?.stampsToAdd?.[0] ?? null;
  const stampCard = stampAdd ? (p.benefits?.stamps.find((c) => c.cardId === stampAdd.cardId) ?? null) : null;
  const vouchers = p.benefits?.vouchers ?? [];
  const couponSatang = p.quote?.couponDiscountSatang ?? 0;
  const card = "rounded-[16px] border bg-[color:var(--color-surface)]";

  return (
    <div data-testid="pos-member-pay" className="flex flex-col gap-3">
      {p.rightsChanged && showMember && (
        <p data-testid="pos-member-rights-changed" className="flex items-center gap-2 rounded-[12px] border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-4 py-2.5 text-[13.5px] font-semibold text-[color:var(--color-accent)]" role="status">
          <RegisterIcon name="warn" size={15} />
          {t("pay.rightsChanged")}
        </p>
      )}

      {/* ── การ์ดแต้ม ── */}
      {showMember && pts && (
        <div data-testid="pos-member-points" data-state={belowMin ? "below-min" : applied ? "applied" : "idle"} className={`${card} flex flex-col gap-2.5 px-[18px] py-3.5 ${belowMin ? "opacity-60" : ""}`}>
          <div className="flex items-center gap-2.5">
            <RegisterIcon name="coin" size={16} />
            <span className="flex-1 text-[14.5px] font-bold">{t("pay.pointsTitle")}</span>
            {rate && <span className="text-[12px] text-[color:var(--color-muted)]">{t("pay.rate", { points: rate.points.toLocaleString("th-TH"), baht: rate.baht })}</span>}
          </div>
          <p className="text-[13px] text-[color:var(--color-ink-soft)]">
            {t.rich("pay.balance", {
              name: memberShortName(p.member!.name),
              points: pts.balance.toLocaleString("th-TH"),
              value: moneyText(pts.balanceValueSatang),
              b: (c) => <b className="text-[14px] text-[color:var(--color-ink)]">{c}</b>,
            })}
          </p>
          {belowMin ? (
            <p data-testid="pos-member-points-min" className="text-[13px] text-[color:var(--color-muted)]">
              {t("pay.minPoints", { min: pts.burnMinPoints.toLocaleString("th-TH") })}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-11 w-[150px] items-center gap-2 rounded-[10px] border-[1.5px] border-[color:var(--color-ink)] px-3">
                <input
                  data-testid="pos-member-points-input"
                  ref={inputRef}
                  className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-bold tabular-nums outline-none"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t("pay.pointsInput")}
                  value={text}
                  placeholder="0"
                  disabled={p.busy}
                  onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  onKeyDown={(e) => {
                    // Enter = ใช้แต้ม (ไม่ส่งฟอร์มชำระ)
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    e.stopPropagation();
                    apply();
                  }}
                />
                <span className="shrink-0 text-[12px] text-[color:var(--color-muted)]">{t("pay.pointsUnit")}</span>
              </label>
              <RegisterIcon name="chevron" size={14} className="-rotate-90 text-[color:var(--color-muted)]" />
              <span data-testid="pos-member-points-preview" className="text-[14px] font-bold tabular-nums">
                {t("pay.discountPreview", { amount: moneyText(applied && pointsLine ? pointsLine.discountSatang : preview) })}
              </span>
              <span className="flex-1" />
              {applied && (
                <button
                  data-testid="pos-member-points-cancel"
                  className="h-11 px-1 text-[13px] font-semibold text-[color:var(--color-muted)] underline underline-offset-2 disabled:opacity-50"
                  type="button"
                  disabled={p.busy}
                  onClick={() => {
                    setText("");
                    p.onPoints(null);
                  }}
                >
                  {t("pay.cancelPoints")}
                </button>
              )}
              <button
                data-testid="pos-member-points-apply"
                className="h-11 shrink-0 disabled:cursor-not-allowed"
                type="button"
                aria-pressed={applied}
                disabled={p.busy || (!applied && want <= 0)}
                onClick={apply}
              >
                <span
                  className={`inline-flex h-8 items-center rounded-[9px] border px-3 text-[13px] font-bold ${
                    applied
                      ? "border-[color:var(--color-ink)] text-[color:var(--color-ink)]"
                      : want > 0
                        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-muted)]"
                  }`}
                >
                  {applied ? t("pay.pointsApplied") : t("pay.applyPoints", { amount: moneyText(preview) })}
                </span>
              </button>
            </div>
          )}
          {p.pointsNote && (
            <p data-testid="pos-member-points-note" className="text-[13px] font-semibold text-[color:var(--color-danger)]" role="status">
              {p.pointsNote}
            </p>
          )}
        </div>
      )}

      {/* ── คูปอง ── */}
      {p.couponCode ? (
        <div
          data-testid="pos-member-coupon"
          data-state={p.couponInvalid ? "invalid" : "ok"}
          className={`${card} flex flex-wrap items-center gap-x-3 gap-y-1 px-[18px] py-2 ${p.couponInvalid ? "border-[1.5px] border-[color:var(--color-danger)]" : ""}`}
        >
          <RegisterIcon name="tag" size={15} />
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{t("pay.couponLine", { code: p.couponCode })}</span>
          {p.couponInvalid ? (
            <span className="text-[13px] font-semibold text-[color:var(--color-danger)]">{tr("errors.couponInvalid")}</span>
          ) : (
            <>
              <span className="text-[15px] font-bold tabular-nums text-[color:var(--color-danger)]">{moneyText(-couponSatang)}</span>
              <span className="inline-flex h-8 items-center gap-1 rounded-[9px] border border-[color:var(--color-ink)] px-2.5 text-[12.5px] font-bold">
                {t("pay.couponApplied")}
              </span>
            </>
          )}
          <button
            data-testid="pos-member-coupon-clear"
            className={`h-11 shrink-0 rounded-[11px] disabled:opacity-50 ${p.couponInvalid ? "btn btn-ghost px-3 text-[13px]" : "grid w-11 place-items-center text-[color:var(--color-muted)]"}`}
            type="button"
            disabled={p.busy}
            aria-label={t("pay.removeCoupon")}
            onClick={p.onRemoveCoupon}
          >
            {p.couponInvalid ? t("pay.removeCoupon") : <RegisterIcon name="x" size={14} />}
          </button>
        </div>
      ) : (
        <button
          data-testid="pos-member-coupon-enter"
          className="flex h-12 items-center gap-3 rounded-[16px] border border-dashed px-[18px] text-left text-[14px] text-[color:var(--color-ink-soft)] disabled:opacity-50"
          type="button"
          disabled={p.busy}
          onClick={p.onEnterCoupon}
        >
          <RegisterIcon name="tag" size={15} />
          {t("pay.enterCoupon")}
        </button>
      )}

      {/* ── ว่อชเชอร์ (เลือกได้ 1 ใบ) ── */}
      {showMember && vouchers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] text-[color:var(--color-muted)]">{t("pay.voucherTitle")}</div>
          <div className="overflow-hidden rounded-[16px] border" role="radiogroup" aria-label={t("pay.voucherTitle")}>
            {vouchers.map((v) => {
              const on = p.choices.voucherId === v.id;
              const line = on ? p.quote?.memberLines?.find((l) => l.kind === "VOUCHER" && l.ref === v.id) : null;
              const amount = line ? line.discountSatang : v.discountSatang;
              return (
                <div key={v.id} className="border-b last:border-b-0">
                  <button
                    data-testid={`pos-member-voucher-${v.id}`}
                    className={`flex min-h-12 w-full items-center gap-3 px-[18px] py-2 text-left disabled:cursor-not-allowed ${on ? "bg-[color:var(--color-surface-2)]" : ""} ${v.applicable ? "" : "opacity-55"}`}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={p.busy || (!v.applicable && !on)}
                    onClick={() => p.onVoucher(on ? null : v.id)}
                  >
                    <span aria-hidden className={`grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${on ? "border-[color:var(--color-ink)]" : ""}`}>
                      {on && <span className="size-2.5 rounded-full bg-[color:var(--color-ink)]" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-semibold">{[v.name, v.valueLabel, t("pay.voucherExpires", { date: formatShortDate(v.expiresAt, locale) })].join(" · ")}</span>
                      {!v.applicable && v.reason && <span className="truncate text-[12.5px] text-[color:var(--color-muted)]">{v.reason}</span>}
                    </span>
                    {v.applicable && amount > 0 && <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-[color:var(--color-danger)]">{moneyText(-amount)}</span>}
                    {!v.applicable && <span className="shrink-0 text-[12.5px] text-[color:var(--color-muted)]">{t("pay.voucherUnavailable")}</span>}
                  </button>
                  {p.voucherNote?.id === v.id && (
                    <p data-testid="pos-member-voucher-error" className="px-[18px] pb-2 text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                      {p.voucherNote.node}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ส่วนลดระดับ (อ่านอย่างเดียว) · ดวงสแตมป์ ── */}
      {showMember && tierSatang > 0 && (
        <div data-testid="pos-member-tier" className="flex items-center justify-between px-1 text-[13.5px] text-[color:var(--color-ink-soft)]">
          <span>{t("pay.tierLine", { tier: p.member?.tier?.name ?? t("chip.general") })}</span>
          <span className="font-bold tabular-nums text-[color:var(--color-danger)]">{moneyText(-tierSatang)}</span>
        </div>
      )}
      {showMember && stampAdd && stampAdd.count > 0 && (
        <p data-testid="pos-member-stamp" className="px-1 text-[13px] text-[color:var(--color-muted)]">
          {t("pay.stampHint", {
            count: stampAdd.count,
            stamps: stampCard ? Math.min(stampCard.stamps + stampAdd.count, stampCard.slots) : stampAdd.count,
            slots: stampCard ? stampCard.slots : "-",
          })}
        </p>
      )}
    </div>
  );
}
