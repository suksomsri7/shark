"use client";

import { useMemo, useState } from "react";
import { MoneyText } from "@/components/ui/MoneyText";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";
import { WHT_TYPE_OPTIONS } from "./doc-editor-types";
import { evaluateWhtRow, type WhtPanelContext } from "@/lib/modules/account/wht-panel";
import { grossUp, instalmentWhtBase, whtForCash, whtOf } from "@/lib/modules/account/wht-calc";
import { WHT_CONDITION_LABEL_TH, WHT_GROSS_UP_FORMULA_LABEL_TH, type WhtCondition } from "@/lib/core/settings/legal/th-tax-2569";

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
  /** ACC T3.7 ▸ นำส่งผ่าน e-WHT (อัตราลดตามตาราง · ไม่ออก 50 ทวิ) ◂ */
  whtEwht?: boolean;
  ewhtRef?: string;
  /** ACC T3.6 ▸ หัก ณ ที่จ่าย / ออกให้ตลอดไป / ออกให้ครั้งเดียว ◂ */
  whtCondition?: WhtCondition;
};

/** ACC T3.1 ▸ อัตราตามตาราง (ตามรหัส × ผู้จ่าย × ผู้รับ × ช่องทาง ณ วันนี้) — ไม่มีอัตราคงที่ = null ◂ */
export function tableRateOf(ctx: WhtPanelContext | null | undefined, code: string, ewht: boolean): number | null {
  const cell = ctx?.rates[code];
  if (!cell) return null;
  const c = ewht ? (cell.ewht ?? cell.normal) : cell.normal;
  return c.method === "RATE" && c.value !== null ? c.value : c.method === "NONE" ? 0 : null;
}

export type PaymentChannelOption = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  accountNo: string | null;
};

/** ประเภทเงินได้เริ่มต้นของกล่องรับ/จ่ายใหม่ (ค่าที่พบบ่อย — ไม่ใช่ค่ากฎหมาย) */
export const DEFAULT_PAY_WHT_TYPE = "M40_8";

/**
 * กล่องรับ/จ่ายใหม่ · `whtSuggest` = อัตราหัก ณ ที่จ่ายแนะนำต่อประเภทเงินได้ (LegalUiOptions.whtSuggest จากตารางค่ากฎหมาย · ACC T0.2)
 */
export function newPayBox(date: string, amountSatang: number, financeAccountId: string | null, whtSuggest: Record<string, number>, ctx?: WhtPanelContext | null): PayBox {
  const code = ctx?.defaultCode ?? DEFAULT_PAY_WHT_TYPE;
  return {
    key: `p${Math.random().toString(36).slice(2, 10)}`,
    paidAt: date,
    financeAccountId,
    amountSatang: Math.max(0, amountSatang),
    note: "",
    whtOn: false,
    whtIncomeType: code,
    // ACC T3.1 ▸ อัตราจากตาราง (ผู้รับของเอกสารนี้) — ไม่มีก้อน = ค่าแนะนำเดิม (ผู้รับไม่ทราบ = บริษัท) ◂
    // ACC T3.2 ▸ บรรทัดของเอกสารติดธงอัตราเดียว = ใช้อัตรานั้น (ผู้ใช้ตั้งไว้ตอนสร้างเอกสาร) ◂
    whtRateBp: ctx?.docRateBp ?? tableRateOf(ctx, code, false) ?? whtSuggest[code] ?? 0,
    whtAmountSatang: 0,
    feeSatang: 0,
    chequeOn: false,
    chequeNo: "",
    bankName: "",
    chequeDate: date,
    whtEwht: false,
    ewhtRef: "",
    whtCondition: "WITHHOLD",
  };
}

/** ยอดที่ตัดหนี้ของกล่องหนึ่ง = เงินที่ได้รับ/จ่ายจริง + ภาษีที่ถูกหักไว้ (ออกภาษีให้ = เงินอย่างเดียว — ภาษีร้านออกแทน ไม่ตัดหนี้) */
export const boxTieOff = (b: PayBox) => b.amountSatang + (b.whtOn && (b.whtCondition ?? "WITHHOLD") === "WITHHOLD" ? b.whtAmountSatang : 0);

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
  whtSuggest,
  footer,
  wht,
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
  /** ACC T0.2 ▸ อัตราหัก ณ ที่จ่ายแนะนำต่อประเภทเงินได้ (ตารางค่ากฎหมาย + นโยบายร้าน) — เดิมฝังใน WHT_TYPE_OPTIONS ◂ */
  whtSuggest: Record<string, number>;
  footer?: React.ReactNode;
  /** ACC T3 ▸ ก้อนหัก ณ ที่จ่ายของเอกสารที่บันทึกแล้ว (แผงรับ/จ่าย) — ไม่มี = ฟอร์มสร้างเอกสาร (ฐานจาก whtBaseSatang) ◂ */
  wht?: WhtPanelContext | null;
}) {
  const t = useMemo(() => textsFor(direction, "WTI"), [direction]);
  const paidSum = value.reduce((s, b) => s + b.amountSatang, 0);
  const whtSum = value.reduce((s, b) => s + (b.whtOn ? b.whtAmountSatang : 0), 0);
  const tieSum = value.reduce((s, b) => s + boxTieOff(b), 0);
  const outstanding = Math.max(0, docTotalSatang - alreadyPaidSatang - tieSum);
  const ctx = wht ?? null;
  const shopPays = direction === "IN";

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

  /** ACC T3.2 ▸ ฐานของงวดตามยอดตัดหนี้ (สัดส่วนสะสม · ก่อน VAT เฉพาะรายการที่หัก) — ไม่มีก้อน = ฐานทั้งใบ (ฟอร์มสร้างเอกสาร) */
  const paidBeforeOf = (key: string) => docTotalSatang - remainingBefore(key);
  const baseFor = (key: string, tieOff: number) =>
    ctx ? instalmentWhtBase(ctx.base.full, ctx.grandTotal, paidBeforeOf(key), tieOff) : docTotalSatang > 0 ? Math.round((whtBaseSatang * Math.min(tieOff, docTotalSatang)) / docTotalSatang) : 0;

  /** คิดภาษี/เงินจริงของกล่องใหม่ทั้งก้อน (ยอดค้างที่เหลือ) ตามโหมด — หัก ณ ที่จ่าย: เงินจริง = ค้าง − ภาษี · ออกภาษีให้: เงินจริง = ค้าง · ภาษีตามสูตร */
  const settle = (b: PayBox, p: Partial<PayBox>): Partial<PayBox> => {
    const n = { ...b, ...p };
    if (!n.whtOn) return { ...p, whtAmountSatang: 0, amountSatang: remainingBefore(b.key) };
    const remain = remainingBefore(b.key);
    const cond = n.whtCondition ?? "WITHHOLD";
    if (cond !== "WITHHOLD" && ctx) {
      const net = baseFor(b.key, remain);
      const f = cond === "PAY_ONCE" ? ctx.settings.grossUpOnce : ctx.settings.grossUpAlways;
      return { ...p, whtAmountSatang: grossUp(net, n.whtRateBp, f).tax, amountSatang: remain };
    }
    const wht = whtOf(baseFor(b.key, remain), n.whtRateBp);
    return { ...p, whtAmountSatang: wht, amountSatang: Math.max(0, remain - wht) };
  };

  const setWhtOn = (b: PayBox, on: boolean) => patch(b.key, settle(b, { whtOn: on }));

  const setWhtAmount = (b: PayBox, wht: number) =>
    patch(b.key, (b.whtCondition ?? "WITHHOLD") === "WITHHOLD" ? { whtAmountSatang: wht, amountSatang: Math.max(0, remainingBefore(b.key) - wht) } : { whtAmountSatang: wht });

  const rateOf = (code: string, ewht: boolean, fallback: number) => tableRateOf(ctx, code, ewht) ?? whtSuggest[code] ?? fallback;

  const setWhtType = (b: PayBox, incomeType: string) => patch(b.key, settle(b, { whtIncomeType: incomeType, whtRateBp: rateOf(incomeType, !!b.whtEwht, b.whtRateBp) }));

  /** ACC T3.2 (F6) ▸ แก้ "จำนวนเงินจ่ายจริง" = จ่ายบางส่วน ⇒ ภาษีคิดใหม่ตามฐานของงวดนั้น (เดิมคงภาษีเต็มใบ) */
  const setAmount = (b: PayBox, cash: number) => {
    if (!b.whtOn || !ctx || (b.whtCondition ?? "WITHHOLD") !== "WITHHOLD") return patch(b.key, { amountSatang: cash });
    const r = whtForCash(cash, b.whtRateBp, ctx.base.full, ctx.grandTotal, paidBeforeOf(b.key));
    patch(b.key, { amountSatang: cash, whtAmountSatang: r.wht });
  };

  const addBox = () => {
    const last = value[value.length - 1];
    const date = last?.paidAt ?? new Date().toISOString().slice(0, 10);
    let used = alreadyPaidSatang;
    for (const b of value) used += boxTieOff(b);
    onChange([...value, newPayBox(date, Math.max(0, docTotalSatang - used), last?.financeAccountId ?? channels[0]?.id ?? null, whtSuggest, ctx)]);
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
                  onChangeSatang={(satang) => setAmount(b, satang)}
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
                          {(ctx ? ctx.codes.map((c) => ({ value: c.code, label: c.label })) : WHT_TYPE_OPTIONS).map((o) => (
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
                            // ACC T3.1 ▸ อัตราเป็นค่าเริ่มที่ผู้ใช้เปลี่ยนได้ — ต่างจากตาราง = คำเตือน WHT_RATE_DIFFERS_FROM_TABLE (ไม่บล็อก) ◂
                            const rate = Math.round(Number(e.target.value || 0) * 100);
                            patch(b.key, settle(b, { whtRateBp: rate }));
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
                  {b.whtOn && ctx && shopPays && (
                    <Field label="เงื่อนไข" className="w-[170px]">
                      <select
                        className="input"
                        value={b.whtCondition ?? "WITHHOLD"}
                        onChange={(e) => patch(b.key, settle(b, { whtCondition: e.target.value as WhtCondition }))}
                        data-testid={`pay-wht-condition-${i + 1}`}
                      >
                        {(["WITHHOLD", "PAY_ALWAYS", "PAY_ONCE"] as const).map((c) => (
                          <option key={c} value={c}>
                            {WHT_CONDITION_LABEL_TH[c]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {b.whtOn && ctx && shopPays && ctx.settings.ewhtEnabled && (
                    <span className="pb-2.5">
                      <Toggle
                        checked={!!b.whtEwht}
                        onChange={(v) => patch(b.key, settle(b, { whtEwht: v, whtRateBp: rateOf(b.whtIncomeType, v, b.whtRateBp) }))}
                        label="นำส่งผ่าน e-WHT"
                        testId={`pay-wht-ewht-${i + 1}`}
                      />
                    </span>
                  )}
                  {b.whtOn && b.whtEwht && (
                    <Field label="เลขอ้างอิงธนาคาร (e-WHT)" className="w-[190px]">
                      <input className="input" maxLength={60} value={b.ewhtRef ?? ""} onChange={(e) => patch(b.key, { ewhtRef: e.target.value })} data-testid={`pay-wht-ewht-ref-${i + 1}`} />
                    </Field>
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

                {ctx && (b.whtOn || (shopPays && (ctx.agent || ctx.recipient === "FOREIGN"))) && (
                  <WhtInfo ctx={ctx} box={b} index={i + 1} tieOff={boxTieOff(b)} paidBefore={paidBeforeOf(b.key)} shopPays={shopPays} />
                )}

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

                {b.whtOn && b.whtAmountSatang > 0 && !b.whtEwht && !(ctx?.agent && shopPays) && (
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

/**
 * ACC T3 ▸ ข้อมูลหัก ณ ที่จ่ายของกล่อง: ผู้จ่าย/ผู้รับ · อัตราตามตาราง + ที่มา · ฐานของงวด · คำเตือน (พรีวิวตัวเดียวกับที่เซิร์ฟเวอร์ใช้ตอนบันทึก)
 */
function WhtInfo({ ctx, box, index, tieOff, paidBefore, shopPays }: { ctx: WhtPanelContext; box: PayBox; index: number; tieOff: number; paidBefore: number; shopPays: boolean }) {
  const cond = box.whtCondition ?? "WITHHOLD";
  const ev = evaluateWhtRow(
    ctx,
    { code: box.whtIncomeType, rateBp: box.whtOn ? box.whtRateBp : 0, whtAmount: box.whtOn ? box.whtAmountSatang : 0, cash: box.amountSatang, fee: box.feeSatang, channel: box.whtEwht ? "EWHT" : "NORMAL", condition: cond, ewhtRef: box.ewhtRef },
    paidBefore,
  );
  const cell = ctx.rates[box.whtIncomeType];
  const tc = box.whtEwht ? (cell?.ewht ?? cell?.normal) : cell?.normal;
  const tableTxt = !tc ? "ไม่มีแถว" : tc.method === "RATE" ? (tc.value === null ? "-" : `${tc.value / 100}%`) : tc.method === "NONE" ? "ไม่ต้องหัก" : "อัตราก้าวหน้า (กรอกเอง)";
  const formula = cond === "PAY_ONCE" ? ctx.settings.grossUpOnce : ctx.settings.grossUpAlways;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--color-surface-2)" }} data-testid={`pay-wht-info-${index}`}>
      <div className="text-[color:var(--color-muted)]">
        {shopPays ? "ผู้จ่าย (ร้าน)" : "ผู้จ่าย (ลูกค้า)"}: <b>{ctx.payerLabel}</b> · ผู้รับ: <b>{ctx.recipientLabel}</b>
        {ctx.recipientAssumed ? " (ไม่ทราบ — ถือว่าเป็นบริษัท)" : ""}
        {box.whtOn && (
          <>
            {" "}· อัตราตามตาราง: <b data-testid={`pay-wht-table-rate-${index}`}>{tableTxt}</b>
            {tc?.tag ? ` [${tc.tag}]` : ""}
            {box.whtEwht && tc?.to ? ` (e-WHT ถึง ${tc.to})` : ""}
          </>
        )}
      </div>
      {box.whtOn && (
        <div className="text-[color:var(--color-muted)]">
          ฐานงวดนี้ (ก่อน VAT · เฉพาะรายการที่หัก){cond !== "WITHHOLD" ? " ก่อนบวกภาษีที่ออกแทน" : ""}:{" "}
          <b className="tabular-nums" data-testid={`pay-wht-base-${index}`}>
            <MoneyText satang={cond !== "WITHHOLD" ? ev.base - box.whtAmountSatang : ev.base} decimals />
          </b>
          {ctx.base.goodsExcluded > 0 ? <> · ไม่นับค่าสินค้า <MoneyText satang={ctx.base.goodsExcluded} decimals /></> : null}
          {cond !== "WITHHOLD" ? <> · สูตร {WHT_GROSS_UP_FORMULA_LABEL_TH[formula]} · เงินได้บน 50 ทวิ <MoneyText satang={ev.base} decimals /></> : null}
          {` · ยอดตัดหนี้ `}
          <MoneyText satang={tieOff} decimals />
        </div>
      )}
      {ctx.agent && shopPays && (
        <div data-testid={`pay-wht-agent-${index}`}>ผู้ขายรายนี้เป็น “ตัวแทนหักภาษี” — ผู้ขายหักและนำส่งแทนร้าน ระบบจะไม่ออก 50 ทวิ</div>
      )}
      {ev.warnings.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid={`pay-wht-warnings-${index}`}>
          {ev.warnings.map((w) => (
            <li key={w.code} style={{ color: w.ack ? "var(--color-danger)" : "var(--color-ink)" }} data-testid={`pay-wht-warning-${w.code}`}>
              ⚠ {w.messageTh}
              {w.citation ? <span className="text-[color:var(--color-muted)]"> (อ้างอิง: {w.citation})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PaymentSection;
