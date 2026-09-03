"use client";

import { useMemo, useState } from "react";
import { MoneyText } from "@/components/ui/MoneyText";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";
import { WHT_TYPE_OPTIONS } from "./doc-editor-types";

// ─────────────────────────────────────────────────────────────
// PaymentSection — ส่วน F ของ DESIGN-SPEC-V2 §5.2 "รับชำระเงิน / บันทึกจ่าย"
// ภาพตายตัว: g2-receipt-payment.png (โหมดขั้นสูง 2 ครั้ง · ครั้งที่ 2 ถูกหัก ณ ที่จ่าย 3% ม.40(8))
// โครงที่ห้ามสลับ (ไล่ตามภาพจากบนลงล่าง):
//   หัวการ์ด "รับชำระเงิน" + segment [พื้นฐาน|ขั้นสูง] ชิดขวา
//   → กล่องเส้นประ "ครั้งที่ n" (แถวบน 4 ช่อง: วันที่ชำระ · ช่องทาง · จำนวนเงิน · หมายเหตุ ≤20)
//     → (ขั้นสูง) toggle ถูกหัก ณ ที่จ่าย · ประเภทเงินได้/อัตรา · จำนวนภาษี · ค่าธรรมเนียมธนาคาร · toggle เช็ค
//     → บรรทัด "รวมครั้งนี้ (เงินสด + หัก ณ ที่จ่าย)" ชิดขวา + แถบฟ้า "สร้างเอกสารหัก ณ ที่จ่าย … อัตโนมัติ"
//   → ปุ่ม "+ เพิ่มการรับชำระ" ซ้าย · "ยอดคงค้างหลังชำระ" ขวา
//   → เส้นคั่น + สรุป 3 ช่อง: ยอดใบเสร็จ · รับชำระรวม · ถูกหัก ณ ที่จ่ายรวม (แดง)
//
// 🔴 ตัวเลขบนจอ = พรีวิว · server (payment.ts) ตรวจยอดคงเหลือ/เพดาน/สิทธิ์ใหม่ทุกครั้งก่อนลงบัญชี
// ─────────────────────────────────────────────────────────────

export type PayBox = {
  key: string;
  paidAt: string; // ISO yyyy-mm-dd
  financeAccountId: string | null;
  amountSatang: number;
  note: string;
  whtOn: boolean;
  whtIncomeType: string;
  whtRateBp: number;
  whtAmountSatang: number;
  feeSatang: number;
  chequeOn: boolean;
  chequeNo: string;
  bankName: string;
  chequeDate: string;
};

export type PaymentChannelOption = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNo: string | null;
};

export function newPayBox(date: string, amountSatang: number, financeAccountId: string | null): PayBox {
  return {
    key: `p${Math.random().toString(36).slice(2, 10)}`,
    paidAt: date,
    financeAccountId,
    amountSatang: Math.max(0, amountSatang),
    note: "",
    whtOn: false,
    whtIncomeType: "M40_8",
    whtRateBp: 300,
    whtAmountSatang: 0,
    feeSatang: 0,
    chequeOn: false,
    chequeNo: "",
    bankName: "",
    chequeDate: date,
  };
}

/** ยอดที่ตัดหนี้ของกล่องหนึ่ง = เงินที่ได้รับ/จ่ายจริง + ภาษีที่ถูกหักไว้ */
export const boxTieOff = (b: PayBox) => b.amountSatang + (b.whtOn ? b.whtAmountSatang : 0);

const channelLabel = (c: PaymentChannelOption) =>
  c.bankName ? `${c.bankName} ${c.name}`.trim() : c.name;

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm"
      data-testid={testId}
    >
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? "var(--color-ink)" : "var(--color-line)" }}
      >
        <span
          className="inline-block h-5 w-5 rounded-full transition-transform"
          style={{ background: "var(--color-surface)", transform: `translateX(${checked ? 22 : 2}px)` }}
        />
      </span>
      <span className="text-[color:var(--color-muted)]">{label}</span>
    </button>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-[color:var(--color-muted)] ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value, danger, testId }: { label: string; value: number; danger?: boolean; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[color:var(--color-muted)]">{label}</span>
      <span
        className="text-[15px] font-semibold tabular-nums"
        style={danger ? { color: "var(--color-danger)" } : undefined}
        data-testid={testId}
      >
        <MoneyText satang={value} decimals />
      </span>
    </div>
  );
}

export type PaymentSectionTexts = {
  title: string;
  addButton: string;
  boxTotal: string;
  totalPaid: string;
  totalWht: string;
  whtToggle: string;
  chequeToggle: string;
  amountLabel: string;
  amountWithWhtLabel: string;
  certHint: string;
};

/** ป้ายข้อความ 2 ชุด — ฝั่งรับ (เอกสารขาย) กับฝั่งจ่าย (เอกสารซื้อ) ตาม §5.2 F / §3 */
export function textsFor(direction: "IN" | "OUT", docLabel: string): PaymentSectionTexts {
  return direction === "IN"
    ? {
        title: "บันทึกจ่าย",
        addButton: "เพิ่มการจ่ายเงิน",
        boxTotal: "รวมครั้งนี้ (เงินสด + หัก ณ ที่จ่าย)",
        totalPaid: "จ่ายรวม",
        totalWht: "หัก ณ ที่จ่ายรวม",
        whtToggle: "หัก ณ ที่จ่าย",
        chequeToggle: "จ่ายเป็นเช็ค",
        amountLabel: "จำนวนเงิน",
        amountWithWhtLabel: "จำนวนเงินจ่ายจริง",
        certHint: "สร้างหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ให้อัตโนมัติ",
      }
    : {
        title: "รับชำระเงิน",
        addButton: "เพิ่มการรับชำระ",
        boxTotal: "รวมครั้งนี้ (เงินสด + หัก ณ ที่จ่าย)",
        totalPaid: "รับชำระรวม",
        totalWht: "ถูกหัก ณ ที่จ่ายรวม",
        whtToggle: "ถูกหัก ณ ที่จ่าย",
        chequeToggle: "รับเป็นเช็ค",
        amountLabel: "จำนวนเงิน",
        amountWithWhtLabel: "จำนวนเงินรับจริง",
        certHint: `สร้างเอกสารหัก ณ ที่จ่าย (${docLabel}) ให้อัตโนมัติ`,
      };
}

export function PaymentSection({
  value,
  onChange,
  advanced,
  onAdvancedChange,
  channels,
  direction,
  docTotalSatang,
  alreadyPaidSatang,
  whtBaseSatang,
  docTotalLabel,
  footer,
}: {
  value: PayBox[];
  onChange: (next: PayBox[]) => void;
  advanced: boolean;
  onAdvancedChange: (v: boolean) => void;
  channels: PaymentChannelOption[];
  direction: "IN" | "OUT";
  docTotalSatang: number;
  /** ยอดที่ชำระไปแล้วก่อนหน้านี้ (ครั้งก่อน ๆ ที่บันทึกแล้ว) */
  alreadyPaidSatang: number;
  /** ฐานคำนวณภาษีหัก ณ ที่จ่าย (ยอดก่อน VAT) — ใช้เติมค่าอัตโนมัติเมื่อเปิด toggle */
  whtBaseSatang: number;
  docTotalLabel: string;
  footer?: React.ReactNode;
}) {
  const t = useMemo(() => textsFor(direction, "WTI"), [direction]);
  const paidSum = value.reduce((s, b) => s + b.amountSatang, 0);
  const whtSum = value.reduce((s, b) => s + (b.whtOn ? b.whtAmountSatang : 0), 0);
  const outstanding = Math.max(0, docTotalSatang - alreadyPaidSatang - paidSum - whtSum);

  const patch = (key: string, p: Partial<PayBox>) => onChange(value.map((b) => (b.key === key ? { ...b, ...p } : b)));

  /** ยอดคงเหลือ "ก่อนถึงกล่องนี้" — ใช้เติมจำนวนเงินอัตโนมัติเมื่อเปิด/แก้ภาษีหัก ณ ที่จ่าย */
  const remainingBefore = (key: string) => {
    let used = alreadyPaidSatang;
    for (const b of value) {
      if (b.key === key) break;
      used += boxTieOff(b);
    }
    return Math.max(0, docTotalSatang - used);
  };

  const setWhtOn = (b: PayBox, on: boolean) => {
    if (!on) {
      patch(b.key, { whtOn: false, whtAmountSatang: 0, amountSatang: remainingBefore(b.key) });
      return;
    }
    // ค่าเริ่มต้น = ฐานเงินได้ก่อน VAT × อัตรา (แก้เองได้) · เงินที่ได้รับจริงลดลงเท่ากับภาษีที่ถูกหัก
    const wht = Math.round((whtBaseSatang * b.whtRateBp) / 10000);
    patch(b.key, { whtOn: true, whtAmountSatang: wht, amountSatang: Math.max(0, remainingBefore(b.key) - wht) });
  };

  const setWhtAmount = (b: PayBox, wht: number) =>
    patch(b.key, { whtAmountSatang: wht, amountSatang: Math.max(0, remainingBefore(b.key) - wht) });

  const setWhtType = (b: PayBox, incomeType: string) => {
    const opt = WHT_TYPE_OPTIONS.find((o) => o.value === incomeType);
    const rate = opt?.defaultRateBp ?? b.whtRateBp;
    const wht = Math.round((whtBaseSatang * rate) / 10000);
    patch(b.key, {
      whtIncomeType: incomeType,
      whtRateBp: rate,
      whtAmountSatang: wht,
      amountSatang: Math.max(0, remainingBefore(b.key) - wht),
    });
  };

  const addBox = () => {
    const last = value[value.length - 1];
    const date = last?.paidAt ?? new Date().toISOString().slice(0, 10);
    let used = alreadyPaidSatang;
    for (const b of value) used += boxTieOff(b);
    onChange([...value, newPayBox(date, Math.max(0, docTotalSatang - used), last?.financeAccountId ?? channels[0]?.id ?? null)]);
  };

  return (
    <div className="card flex flex-col gap-4" data-testid="pay-section">
      {/* หัวการ์ด + สลับ พื้นฐาน | ขั้นสูง */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t.title}</h2>
        <span className="flex overflow-hidden rounded-lg border text-sm" role="group" aria-label="ระดับรายละเอียดการชำระ">
          {([false, true] as const).map((adv) => (
            <button
              key={String(adv)}
              type="button"
              className="px-3 py-1.5"
              aria-pressed={advanced === adv}
              style={advanced === adv ? { background: "var(--color-ink)", color: "var(--color-surface)" } : undefined}
              onClick={() => onAdvancedChange(adv)}
              data-testid={adv ? "pay-mode-advanced" : "pay-mode-basic"}
            >
              {adv ? "ขั้นสูง" : "พื้นฐาน"}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {value.map((b, i) => (
          <div
            key={b.key}
            className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
            data-testid={`pay-box-${i + 1}`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden>💵</span>
              ครั้งที่ {i + 1}
              <span className="flex-1" />
              {value.length > 1 && (
                <button
                  type="button"
                  className="text-[color:var(--color-muted)]"
                  aria-label={`ลบการชำระครั้งที่ ${i + 1}`}
                  onClick={() => onChange(value.filter((x) => x.key !== b.key))}
                  data-testid={`pay-remove-${i + 1}`}
                >
                  🗑
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="วันที่ชำระ">
                <DateInput value={b.paidAt} onChange={(iso) => patch(b.key, { paidAt: iso })} testId={`pay-date-${i + 1}`} />
              </Field>
              <Field label="ช่องทาง">
                <select
                  className="input"
                  value={b.financeAccountId ?? ""}
                  onChange={(e) => patch(b.key, { financeAccountId: e.target.value || null })}
                  data-testid={`pay-channel-${i + 1}`}
                >
                  <option value="">— เลือกช่องทาง —</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {channelLabel(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={b.whtOn ? t.amountWithWhtLabel : t.amountLabel}>
                <MoneyInput
                  value={b.amountSatang}
                  onChangeSatang={(satang) => patch(b.key, { amountSatang: satang })}
                  testId={`pay-amount-${i + 1}`}
                />
              </Field>
              <Field label="หมายเหตุ ≤20">
                <input
                  className="input"
                  maxLength={20}
                  value={b.note}
                  onChange={(e) => patch(b.key, { note: e.target.value })}
                  data-testid={`pay-note-${i + 1}`}
                />
              </Field>
            </div>

            {advanced && (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  <span className="pb-2.5">
                    <Toggle
                      checked={b.whtOn}
                      onChange={(v) => setWhtOn(b, v)}
                      label={t.whtToggle}
                      testId={`pay-wht-toggle-${i + 1}`}
                    />
                  </span>
                  {b.whtOn && (
                    <>
                      <Field label="ประเภทเงินได้ / อัตรา" className="w-[220px]">
                        <select
                          className="input"
                          value={b.whtIncomeType}
                          onChange={(e) => setWhtType(b, e.target.value)}
                          data-testid={`pay-wht-type-${i + 1}`}
                        >
                          {WHT_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="อัตรา %" className="w-[92px]">
                        <input
                          type="number"
                          className="input text-right tabular-nums"
                          min={0}
                          max={100}
                          step="0.01"
                          value={b.whtRateBp / 100}
                          onChange={(e) => {
                            const rate = Math.round(Number(e.target.value || 0) * 100);
                            const wht = Math.round((whtBaseSatang * rate) / 10000);
                            patch(b.key, {
                              whtRateBp: rate,
                              whtAmountSatang: wht,
                              amountSatang: Math.max(0, remainingBefore(b.key) - wht),
                            });
                          }}
                          data-testid={`pay-wht-rate-${i + 1}`}
                        />
                      </Field>
                      <Field label="จำนวนภาษี" className="w-[140px]">
                        <MoneyInput
                          value={b.whtAmountSatang}
                          onChangeSatang={(satang) => setWhtAmount(b, satang)}
                          testId={`pay-wht-amount-${i + 1}`}
                        />
                      </Field>
                    </>
                  )}
                  <Field label="ค่าธรรมเนียมธนาคาร" className="w-[170px]">
                    <MoneyInput
                      value={b.feeSatang}
                      onChangeSatang={(satang) => patch(b.key, { feeSatang: satang })}
                      testId={`pay-fee-${i + 1}`}
                    />
                  </Field>
                  <span className="pb-2.5">
                    <Toggle
                      checked={b.chequeOn}
                      onChange={(v) => patch(b.key, { chequeOn: v })}
                      label={t.chequeToggle}
                      testId={`pay-cheque-toggle-${i + 1}`}
                    />
                  </span>
                </div>

                {b.chequeOn && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="เลขที่เช็ค">
                      <input
                        className="input"
                        maxLength={40}
                        value={b.chequeNo}
                        onChange={(e) => patch(b.key, { chequeNo: e.target.value })}
                        data-testid={`pay-cheque-no-${i + 1}`}
                      />
                    </Field>
                    <Field label="ธนาคาร">
                      <input
                        className="input"
                        maxLength={80}
                        value={b.bankName}
                        onChange={(e) => patch(b.key, { bankName: e.target.value })}
                        data-testid={`pay-cheque-bank-${i + 1}`}
                      />
                    </Field>
                    <Field label="วันที่บนเช็ค">
                      <DateInput
                        value={b.chequeDate}
                        onChange={(iso) => patch(b.key, { chequeDate: iso })}
                        testId={`pay-cheque-date-${i + 1}`}
                      />
                    </Field>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 text-sm">
                  <span className="text-[color:var(--color-muted)]">{t.boxTotal}</span>
                  <b className="tabular-nums" data-testid={`pay-total-${i + 1}`}>
                    <MoneyText satang={boxTieOff(b)} decimals />
                  </b>
                </div>

                {b.whtOn && b.whtAmountSatang > 0 && (
                  <div
                    className="flex items-center gap-2 self-start rounded-lg px-2 py-1 text-xs"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-accent)" }}
                    data-testid={`pay-cert-hint-${i + 1}`}
                  >
                    <span aria-hidden>📄</span>
                    {direction === "IN"
                      ? "สร้างหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ให้อัตโนมัติ"
                      : "สร้างเอกสารหัก ณ ที่จ่าย (WTI) ให้อัตโนมัติ"}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-sm" onClick={addBox} data-testid="btn-add-payment">
          + {t.addButton}
        </button>
        <div className="text-right">
          <div className="text-xs text-[color:var(--color-muted)]">ยอดคงค้างหลังชำระ</div>
          <div className="text-[19px] font-bold tabular-nums" data-testid="pay-outstanding">
            <MoneyText satang={outstanding} decimals />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t pt-3.5">
        <Stat label={docTotalLabel} value={docTotalSatang} testId="pay-summary-doc" />
        <Stat label={t.totalPaid} value={paidSum + alreadyPaidSatang} testId="pay-summary-paid" />
        <Stat label={t.totalWht} value={whtSum} danger testId="pay-summary-wht" />
      </div>

      {footer}
    </div>
  );
}

export default PaymentSection;
