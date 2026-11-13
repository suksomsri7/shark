// ─────────────────────────────────────────────────────────────
// wht-context.ts — ก้อนข้อมูลหัก ณ ที่จ่ายของเอกสารหนึ่งใบ (ACC T3.1 · T3.2 · T3.6 · T3.7)
//   แผงรับ/จ่ายบนจอ · REST `GET /documents/{id}/wht-context` · เครื่องมือเลขา · ตอนบันทึก (ประเมินแต่ละงวด) ใช้ตัวเดียวกัน
//   อัตรา = ตารางค่ากฎหมาย (legalValueFrom) ตาม ประเภทเงินได้ × สถานะผู้จ่าย × ประเภทผู้รับ × ช่องทาง ณ วันที่จ่าย
//   ฐาน = wht-calc.docWhtBase (ธงรายบรรทัด · ก่อน VAT) · งวด = instalmentWhtBase
// ─────────────────────────────────────────────────────────────
import {
  bkkYmd,
  bookWhtOf,
  isJuristicPayer,
  legalValueFrom,
  type BookLegal,
} from "./legal-values";
import {
  WHT_AGENT_RULE,
  WHT_FEE_RULE,
  WHT_PAYER_LABEL_TH,
  whtMinimumAt,
  type WhtPayer,
  type WhtRecipient,
} from "@/lib/core/settings/legal/th-tax-2569";
import { DEFAULT_WHT_CODE, WHT_INCOME_CODES, docWhtBase, whtCodeLabel, whtRecipientLabel, whtRecipientOf } from "./wht-calc";
import type { WhtPanelContext, WhtRateCell } from "./wht-panel";
export type { WhtPanelContext, WhtRateCell, WhtRowEval, WhtRowInput } from "./wht-panel";
export { evaluateWhtRow, suggestedGrossUp } from "./wht-panel";
import type { WhtDocContext } from "./service";

function cellOf(legal: BookLegal, date: Date, code: string, payer: WhtPayer, recipient: WhtRecipient, channel: "NORMAL" | "EWHT"): WhtRateCell | null {
  const v = legalValueFrom(legal, "wht.rate", date, { incomeType: code, payer, recipient, channel });
  // e-WHT: ตัวอ่านถอยไปช่องทางปกติเมื่อไม่มีแถว e-WHT ที่มีผล ⇒ ถือว่าไม่มีอัตราลด (null)
  if (channel === "EWHT" && (!v.row || (v.row as { channel?: string }).channel !== "EWHT")) return null;
  const row = v.row as { source?: string; tag?: string; to?: string | null } | null;
  return { value: v.value, method: v.method, source: row?.source ?? null, tag: row?.tag ?? null, to: row?.to ?? null, warnings: v.warnings.filter((w) => w.code !== "RECIPIENT_ASSUMED" && w.code !== "EWHT_NOT_IN_EFFECT") };
}

export function whtPanelContextFrom(legal: BookLegal, doc: WhtDocContext, date: Date, side: "SHOP_PAYS" | "CUSTOMER_PAYS", shopRecipient?: WhtRecipient): WhtPanelContext {
  const j = isJuristicPayer(legal.entityKind);
  // ฝั่งจ่าย: ผู้จ่าย = ร้าน (ตามประเภทผู้ประกอบการ · ยังไม่ระบุ = นิติบุคคล เหมือนตัวอ่าน T0.2) · ผู้รับ = ผู้ติดต่อ
  // ฝั่งรับ: ผู้จ่าย = ลูกค้า (ถือว่านิติบุคคล — ผู้ที่หักได้ส่วนใหญ่) · ผู้รับ = ร้าน
  const payer: WhtPayer = side === "SHOP_PAYS" ? (j === false ? "NON_JURISTIC" : "JURISTIC") : "JURISTIC";
  const rc = side === "SHOP_PAYS" ? whtRecipientOf(doc.contact) : { recipient: shopRecipient ?? (j === false ? "INDIVIDUAL_TH" : "JURISTIC_TH"), assumed: false };
  const recipient = rc.recipient as WhtRecipient;
  const rates: WhtPanelContext["rates"] = {};
  for (const c of WHT_INCOME_CODES) {
    rates[c.code] = {
      normal: cellOf(legal, date, c.code, payer, recipient, "NORMAL") ?? { value: null, method: "RATE", source: null, tag: null, to: null, warnings: [] },
      ewht: cellOf(legal, date, c.code, payer, recipient, "EWHT"),
    };
  }
  const b = docWhtBase({ lines: doc.lines, discountAmount: doc.discountAmount, vatMode: doc.vatMode });
  const full = doc.depositDeducted > 0 && doc.grandTotal + doc.depositDeducted > 0 ? Math.round((b.base * doc.grandTotal) / (doc.grandTotal + doc.depositDeducted)) : b.base;
  const min = whtMinimumAt(bkkYmd(date));
  return {
    side,
    asOf: bkkYmd(date),
    payer,
    payerLabel: WHT_PAYER_LABEL_TH[payer],
    payerJuristic: side === "SHOP_PAYS" ? j : true,
    recipient,
    recipientLabel: whtRecipientLabel(recipient),
    recipientAssumed: rc.assumed,
    agent: side === "SHOP_PAYS" && !!doc.contact?.whtAgent,
    agentSource: WHT_AGENT_RULE.source,
    codes: WHT_INCOME_CODES.map((c) => ({ code: c.code, label: whtCodeLabel(c.code), parent: c.parent })),
    defaultCode: b.byCode[0]?.code && WHT_INCOME_CODES.some((c) => c.code === b.byCode[0]!.code) ? b.byCode[0]!.code : DEFAULT_WHT_CODE,
    docCode: b.byCode[0]?.code || null,
    docRateBp: b.byCode.length === 1 && typeof b.byCode[0]!.rateBp === "number" && b.byCode[0]!.rateBp > 0 ? b.byCode[0]!.rateBp : null,
    rates,
    settings: bookWhtOf(legal),
    base: { full: doc.lines.length ? full : doc.grandTotal, byLineFlags: b.byLineFlags, goodsExcluded: b.goodsExcluded, netAll: b.netAll },
    grandTotal: doc.grandTotal,
    paidBefore: doc.paidTotal,
    contractTotal: doc.contractTotal,
    minSatang: min?.value ?? null,
    minSource: min?.source ?? null,
    feeMinSatang: WHT_FEE_RULE.bankPerTimeMinSatang,
    feeSource: WHT_FEE_RULE.source,
  };
}

