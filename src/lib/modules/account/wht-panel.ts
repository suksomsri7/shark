// ─────────────────────────────────────────────────────────────
// wht-panel.ts — ส่วน pure ของก้อนหัก ณ ที่จ่าย (ACC T3) — ชนิด + ประเมินงวด · ใช้ได้ทั้งจอ (แผงจ่าย) และเซิร์ฟเวอร์
//   ตัวสร้างก้อน (อ่านตารางค่ากฎหมาย) อยู่ที่ wht-context.ts (server)
// ─────────────────────────────────────────────────────────────
import type { WhtCondition, WhtPayer, WhtRecipient } from "@/lib/core/settings/legal/th-tax-2569";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { DEFAULT_WHT_CODE, feeWhtWarnings, grossUp, instalmentWhtBase, paymentWhtWarnings, whtParentOf, type WhtParent } from "./wht-calc";
import type { WhtGrossUpFormula } from "@/lib/core/settings/legal/th-tax-2569";

export type BookWhtSettings = { ewhtEnabled: boolean; grossUpAlways: WhtGrossUpFormula; grossUpOnce: WhtGrossUpFormula };

export type WhtRateCell = { value: number | null; method: "RATE" | "NONE" | "PROGRESSIVE"; source: string | null; tag: string | null; to: string | null; warnings: LegalWarning[] };

export type WhtPanelContext = {
  /** SHOP_PAYS = ร้านจ่ายเงินได้ (เอกสารซื้อ/ค่าใช้จ่าย) · CUSTOMER_PAYS = ลูกค้าหักร้าน (เอกสารขาย) */
  side: "SHOP_PAYS" | "CUSTOMER_PAYS";
  asOf: string;
  payer: WhtPayer;
  payerLabel: string;
  payerJuristic: boolean | null;
  recipient: WhtRecipient;
  recipientLabel: string;
  recipientAssumed: boolean;
  /** ผู้ขายเป็นตัวแทนหักภาษี (ฉ.457) */
  agent: boolean;
  agentSource: string;
  codes: { code: string; label: string; parent: WhtParent }[];
  defaultCode: string;
  /** อัตราตามตาราง ณ วันที่ต่อรหัส — ewht = null เมื่อไม่มีแถว e-WHT ที่มีผล (หมดอายุแล้ว/ไม่ลด) */
  rates: Record<string, { normal: WhtRateCell; ewht: WhtRateCell | null }>;
  settings: BookWhtSettings;
  /** ประเภทเงินได้ของบรรทัดที่ติดธงหัก (บรรทัดแรก) — ใช้ประเมินงวดที่ไม่ได้ระบุประเภท (เช่น ขั้นต่ำสะสม) · null = ไม่มีธง */
  docCode: string | null;
  /** อัตราของบรรทัดที่ติดธง เมื่อทุกบรรทัดใช้อัตราเดียวกัน (ค่าเริ่มของกล่องจ่าย) · null = ไม่มี/หลายอัตรา */
  docRateBp: number | null;
  /** T3.2 ฐานทั้งใบ (ก่อน VAT · ธงรายบรรทัด · หักส่วนของมัดจำ) */
  base: { full: number; byLineFlags: boolean; goodsExcluded: number; netAll: number };
  grandTotal: number;
  paidBefore: number;
  contractTotal: number;
  /** ขั้นต่ำ 1,000 (สตางค์) · null = ไม่มีแถว */
  minSatang: number | null;
  minSource: string | null;
  feeMinSatang: number;
  feeSource: string;
};

/** แถวการจ่าย 1 งวดที่จะบันทึก (ค่าที่ผู้ใช้ส่ง) */
export type WhtRowInput = {
  code: string | null;
  rateBp: number | null;
  whtAmount: number;
  cash: number;
  fee: number;
  channel: "NORMAL" | "EWHT";
  condition: WhtCondition;
  ewhtRef?: string | null;
};

export type WhtRowEval = {
  parent: WhtParent | null;
  code: string | null;
  /** ยอดตัดหนี้ของงวด (เงิน + ภาษีที่หัก · ออกภาษีให้ = เงินอย่างเดียว) */
  tieOff: number;
  /** ฐานของงวด (ออกภาษีให้ = เงินได้รวมภาษีที่ออกแทน) */
  base: number;
  /** ภาษีที่ตัดหนี้ (หัก ณ ที่จ่าย) */
  withheld: number;
  /** ภาษีที่ร้านออกแทน */
  borne: number;
  channel: "NORMAL" | "EWHT" | "AGENT";
  warnings: LegalWarning[];
};

/** ประเมินงวดหนึ่ง (pure บนก้อน context) — paidBefore = ยอดตัดหนี้ก่อนงวดนี้ (รวมงวดก่อนหน้าในชุดเดียวกัน) */
export function evaluateWhtRow(ctx: WhtPanelContext, r: WhtRowInput, paidBefore: number): WhtRowEval {
  // งวดที่ไม่ระบุประเภท = ประเภทของบรรทัดที่ติดธงในเอกสาร (ถ้ามี) — ไม่เดาประเภทเอง
  const code = r.code ? r.code : ctx.docCode;
  const on = r.whtAmount > 0;
  const grossUpMode = on && r.condition !== "WITHHOLD";
  const tieOff = grossUpMode ? r.cash : r.cash + (on ? r.whtAmount : 0);
  const netBase = instalmentWhtBase(ctx.base.full, ctx.grandTotal, paidBefore, tieOff);
  const channel: WhtRowEval["channel"] = on && r.channel === "EWHT" && ctx.settings.ewhtEnabled ? "EWHT" : on && ctx.agent ? "AGENT" : "NORMAL";
  const cell = code ? ctx.rates[code] : null;
  const tableCell = channel === "EWHT" ? (cell?.ewht ?? cell?.normal ?? null) : (cell?.normal ?? null);
  const formula = r.condition === "PAY_ONCE" ? ctx.settings.grossUpOnce : ctx.settings.grossUpAlways;
  const base = grossUpMode ? netBase + r.whtAmount : netBase;
  const warnings = ctx.side === "SHOP_PAYS"
    ? [
        ...paymentWhtWarnings({
          shopPays: true,
          whtOn: on,
          code: code ?? DEFAULT_WHT_CODE,
          rateBp: r.rateBp ?? 0,
          whtAmount: r.whtAmount,
          base: grossUpMode ? netBase : netBase,
          channel: channel === "EWHT" ? "EWHT" : "NORMAL",
          condition: on ? r.condition : "WITHHOLD",
          table: tableCell ? { value: tableCell.value, method: tableCell.method, source: tableCell.source } : { value: null, method: "RATE", source: null },
          recipient: ctx.recipient,
          agent: ctx.agent,
          contractTotal: ctx.contractTotal,
          instalment: tieOff,
          minSatang: ctx.minSatang,
          formula,
          ewhtRef: r.ewhtRef ?? null,
          // ใบที่ไม่มีเงินได้ที่ต้องหัก (สินค้าล้วน) ไม่ต้องยืนยันเรื่องผู้รับต่างประเทศ
          foreignConfirmed: ctx.base.full <= 0,
        }),
        ...feeWhtWarnings(r.fee, ctx.payerJuristic, ctx.feeMinSatang),
      ]
    : [];
  return { parent: whtParentOf(code), code, tieOff, base, withheld: grossUpMode ? 0 : on ? r.whtAmount : 0, borne: grossUpMode ? r.whtAmount : 0, channel, warnings };
}

/** ค่าแนะนำภาษีออกแทนของงวด (แผงจ่ายใช้) — net = ฐานก่อน VAT ของงวด */
export function suggestedGrossUp(ctx: WhtPanelContext, netBase: number, rateBp: number, condition: Exclude<WhtCondition, "WITHHOLD">) {
  return grossUp(netBase, rateBp, condition === "PAY_ONCE" ? ctx.settings.grossUpOnce : ctx.settings.grossUpAlways);
}

