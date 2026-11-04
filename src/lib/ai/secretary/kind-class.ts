// kind-class.ts — ชั้นความเสี่ยงของข้อเสนอ (S1.7 · R-K3 · R-K3b) · ส่วน pure (ไม่อ่าน/เขียนฐานข้อมูล)
//
// ชั้น derive จากของที่มีอยู่แล้ว ไม่เพิ่มคอลัมน์ใน AiProposal:
//   destructive = DESTRUCTIVE_KINDS ของ proposals.ts (ชุดเดียวกับ risk=DESTRUCTIVE / ยืนยัน 2 ชั้น)
//   money / customerFacing / piiExport = จาก `kindAccessOf(kind).module` + ชื่อ kind
//   ไม่รู้จัก kind (ไม่อยู่ในตารางสิทธิ์ของข้อเสนอ) ⇒ fail-closed: ถือว่ามีเงิน + ส่งถึงลูกค้า
// `ALWAYS_APPROVE` = ค่าคงที่ในโค้ด ปิดด้วยการตั้งค่าใด ๆ ไม่ได้ · `AiApprovalRule` เก็บแค่ 3 กฎตั้งค่าได้ (`RULE_KEYS`)
// R-K3b: รุ่นแรกทุกข้อเสนอเขียนยังต้องมีคนอนุมัติ — กฎมีผลแค่ข้อความ "ทำไมต้องอนุมัติ" (whyApproval) + หน้า B4
// 🔴 import proposals.ts แบบค่า (ไม่ใช่ type) — proposals.ts ต้อง import ไฟล์ secretary ที่ใช้ไฟล์นี้แบบ dynamic เท่านั้น (กันวงโหลด)

import { DESTRUCTIVE_KINDS, kindAccessOf, type ProposalKind } from "../proposals";

export type KindClass = { destructive: boolean; money: boolean; customerFacing: boolean; piiExport: boolean; known: boolean };

/** ชั้นที่ต้องอนุมัติเสมอ (ปิดไม่ได้) */
export const ALWAYS_APPROVE = ["destructive", "money", "piiExport"] as const;
/** กฎที่เจ้าของตั้งได้ (หน้า B4) */
export const RULE_KEYS = ["chat.send", "money.limit", "pii.export"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export type RuleMap = Record<RuleKey, { enabled: boolean; limitSatang: number | null }>;

export function isRuleKey(k: unknown): k is RuleKey {
  return typeof k === "string" && (RULE_KEYS as readonly string[]).includes(k);
}

// โมดูลที่ทุกการเขียน = เงิน (บัญชี · แต้ม · รางวัล · ตั๋ว · ร้านอาหาร · การชำระ)
const MONEY_MODULES = new Set(["account", "payments", "finance", "cheques", "point", "reward", "ticket", "restaurant"]);
// kind ส่งถึงลูกค้า (ตรงตัว) + prefix
const CUSTOMER_KINDS = new Set(["chat.send", "marketing_create_campaign", "coupon_create"]);
const CUSTOMER_PREFIXES = ["crm.emails.", "member.campaigns."];

export function classOfKind(kind: string): KindClass {
  const k = typeof kind === "string" ? kind : "";
  const access = k ? kindAccessOf(k) : null;
  const destructive = DESTRUCTIVE_KINDS.has(k as ProposalKind);
  const piiExport = /export|csv/i.test(k);
  if (!access) return { destructive, money: true, customerFacing: true, piiExport, known: false };
  const mod = access.module;
  const money =
    MONEY_MODULES.has(mod) ||
    (mod === "pos" && /void|refund|sale/i.test(k)) ||
    (mod === "shop" && /refund/i.test(k)) ||
    (mod === "school" && /mark_paid|pay/i.test(k)) ||
    /refund|void|pay/i.test(k);
  const customerFacing = CUSTOMER_KINDS.has(k) || CUSTOMER_PREFIXES.some((p) => k.startsWith(p));
  return { destructive, money, customerFacing, piiExport, known: true };
}

/** จำนวนเงิน (สตางค์) ในข้อเสนอ ถ้าระบุ — payload ตรง ๆ หรือ `input` ของทะเบียน op · บิลขายรวมจากรายการ */
export function amountSatangOf(payload: unknown): number | null {
  const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const p = rec(payload);
  if (!p) return null;
  for (const src of [p, rec(p.input)]) {
    if (!src) continue;
    for (const key of ["totalSatang", "amountSatang", "grandTotalSatang"]) {
      const n = Number(src[key]);
      if (src[key] !== undefined && src[key] !== null && Number.isFinite(n)) return Math.round(n);
    }
  }
  if (Array.isArray(p.lines)) {
    let sum = 0;
    for (const l of p.lines) {
      const r = rec(l);
      const q = Number(r?.qty), u = Number(r?.unitPriceSatang);
      if (Number.isFinite(q) && Number.isFinite(u)) sum += q * u;
    }
    return sum > 0 ? Math.round(sum) : null;
  }
  return null;
}

const bahtOf = (satang: number) => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/**
 * เหตุผลภาษาไทยว่า "ทำไมต้องอนุมัติ" — ไม่ว่างเสมอ (รุ่นแรกทุกข้อเสนอเขียนต้องมีคนอนุมัติ)
 * อ่านกฎ `money.limit` (limitSatang) · `chat.send` · `pii.export` เพื่ออธิบายเท่านั้น (ไม่เปิดทางอัตโนมัติ · R-K3b)
 */
export function whyApproval(kind: string, payload: unknown, rules: RuleMap): string {
  const c = classOfKind(kind);
  const out: string[] = [];
  if (!c.known) out.push("ไม่รู้จักประเภทรายการนี้ — ต้องให้คนตรวจก่อนเสมอ");
  if (c.destructive) out.push("ลบ/ยกเลิกถาวร — ต้องยืนยัน 2 ชั้น");
  if (c.money && c.known) {
    const amt = amountSatangOf(payload);
    const lim = rules?.["money.limit"];
    if (lim?.enabled && typeof lim.limitSatang === "number" && amt !== null && amt > lim.limitSatang) {
      out.push(`เกินวงเงิน ${bahtOf(lim.limitSatang)} บาท ที่ตั้งไว้ (รายการนี้ ${bahtOf(amt)} บาท)`);
    } else {
      out.push("มีเงินเข้า/ออก — ต้องอนุมัติเสมอ");
    }
  }
  if (c.customerFacing && c.known) out.push(rules?.["chat.send"]?.enabled === false ? "ส่งถึงลูกค้า" : "ส่งถึงลูกค้า (กฎ chat.send)");
  if (c.piiExport) out.push(rules?.["pii.export"]?.enabled === false ? "ส่งออกข้อมูลส่วนบุคคล — ต้องอนุมัติเสมอ" : "ส่งออกข้อมูลส่วนบุคคล (กฎ pii.export)");
  if (out.length === 0) out.push("เลขาเสนอ — รุ่นแรกทุกรายการเขียนต้องมีคนอนุมัติ");
  return out.join(" · ");
}
