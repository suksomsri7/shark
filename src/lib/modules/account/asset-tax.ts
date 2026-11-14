// asset-tax.ts — ค่าเสื่อม: ตามส่วนของวันในเดือนแรก · ที่ดินไม่คิด · คำเตือนเพดานทางภาษี (ACC T4.3 · ปิด D11 D12) · pure ล้วน
//
//   ทางบัญชี (NPAEs 10.25 ที่ดินไม่คิดค่าเสื่อม · 10.30 เริ่มเมื่อพร้อมใช้งาน) — ระบบคิดตามที่ร้านตั้ง (อายุ · มูลค่าซาก)
//   ทางภาษี (ม.65 ทวิ (2) · พ.ร.ฎ.145 ม.4 ม.4 จัตวา ม.5) — เพดานอัตรา/ฐานรถยนต์นั่ง = คำเตือน "ผลต่างทางภาษีกับทางบัญชี" ไม่บล็อก
//   ค่าตัวเลขทุกตัวมาจากตาราง "สมุดบัญชี" (th-tax-2569 SYSTEM_BOOK_ROWS · ร้านทับได้) — ผู้เรียกส่งเข้ามา
// design note: ledger/wo-notes/T4.3.md
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

export const ASSET_TAX_CLASSES = ["OTHER", "LAND", "BUILDING", "TEMP_BUILDING", "COMPUTER", "PASSENGER_CAR", "INTANGIBLE"] as const;
export type AssetTaxClass = (typeof ASSET_TAX_CLASSES)[number];
export const ASSET_TAX_CLASS_LABEL_TH: Record<AssetTaxClass, string> = {
  OTHER: "ทรัพย์สินอื่น (เครื่องมือ อุปกรณ์ เฟอร์นิเจอร์ ยานพาหนะอื่น ฯลฯ)",
  LAND: "ที่ดิน (ไม่คิดค่าเสื่อม)",
  BUILDING: "อาคารถาวร",
  TEMP_BUILDING: "อาคารชั่วคราว",
  COMPUTER: "คอมพิวเตอร์ อุปกรณ์ และโปรแกรม",
  PASSENGER_CAR: "รถยนต์นั่ง/รถยนต์โดยสารไม่เกิน 10 ที่นั่ง",
  INTANGIBLE: "กู๊ดวิล/เครื่องหมายการค้า/ลิขสิทธิ์ (ไม่จำกัดอายุ)",
};
export const isAssetTaxClass = (v: unknown): v is AssetTaxClass => typeof v === "string" && (ASSET_TAX_CLASSES as readonly string[]).includes(v);
/** ค่าในคอลัมน์ (null/ไม่รู้จัก) → ประเภท (ค่าเริ่ม = ทรัพย์สินอื่น) */
export const assetTaxClassOf = (v: string | null | undefined): AssetTaxClass => (isAssetTaxClass(v) ? v : "OTHER");

const ymdOf = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10));
const daysInMonth = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * เดือนแรกคิดตามส่วนของวัน: วันเริ่มคิด (startDepDate) วันที่ d ของเดือนที่มี D วัน ⇒ ใช้ D − d + 1 วัน
 *   d = 1 ⇒ เต็มเดือน (ไม่ต้องเฉลี่ย · งวดทั้งหมด = อายุ) · d > 1 ⇒ งวดทั้งหมด = อายุ + 1 (งวดสุดท้ายเก็บส่วนที่เหลือ)
 */
export function firstMonthProration(startDepDate: Date | string | null | undefined): { prorated: boolean; daysUsed: number; daysInMonth: number } {
  if (!startDepDate) return { prorated: false, daysUsed: 0, daysInMonth: 0 };
  const ymd = ymdOf(startDepDate);
  const dim = daysInMonth(ymd);
  const day = Number(ymd.slice(8, 10));
  return { prorated: day > 1, daysUsed: dim - day + 1, daysInMonth: dim };
}

/**
 * ค่าเสื่อมของงวดถัดไป (สตางค์) — เส้นตรงบนฐาน (ทุน − ซาก)
 *   ที่ดิน = 0 · งวดแรก (ยังไม่เคยคิด) ที่เริ่มกลางเดือน = round(ฐาน × วันที่ใช้ ÷ (อายุ × วันของเดือน))
 *   งวดปกติ = round(ฐาน ÷ อายุ) · งวดสุดท้าย = ส่วนที่เหลือทั้งหมด (มูลค่าตามบัญชีลงที่ซากพอดี)
 */
export function depreciationAmountFor(a: {
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  monthsDepreciated: number;
  accumDepreciation: number;
  startDepDate?: Date | string | null;
  taxClass?: string | null;
}): number {
  if (assetTaxClassOf(a.taxClass) === "LAND") return 0;
  const base = a.cost - a.salvageValue;
  const remaining = base - a.accumDepreciation;
  if (remaining <= 0 || a.usefulLifeMonths < 1) return 0;
  const p = firstMonthProration(a.startDepDate);
  const totalPeriods = a.usefulLifeMonths + (p.prorated ? 1 : 0);
  if (a.monthsDepreciated >= totalPeriods) return 0;
  if (a.monthsDepreciated + 1 >= totalPeriods) return remaining;
  if (a.monthsDepreciated === 0 && p.prorated) {
    const first = Math.round((base * p.daysUsed) / (a.usefulLifeMonths * p.daysInMonth));
    return Math.max(0, Math.min(first, remaining));
  }
  const monthly = Math.round(base / a.usefulLifeMonths);
  return Math.max(0, Math.min(monthly, remaining));
}

/** ครบแล้วไหม (หลังลงงวดนี้) — ฐานถูกคิดหมด */
export function isFullyDepreciated(a: { cost: number; salvageValue: number; accumDepreciation: number; taxClass?: string | null }): boolean {
  if (assetTaxClassOf(a.taxClass) === "LAND") return false;
  return a.accumDepreciation >= a.cost - a.salvageValue;
}

/** ค่าเพดานทางภาษีที่ใช้ (จากตารางของสมุด — bookRuleFrom) · null = ไม่มีแถว (ไม่เตือนข้อนั้น) */
export type AssetTaxRules = {
  buildingBp: number | null;
  tempBuildingBp: number | null;
  intangibleBp: number | null;
  otherBp: number | null;
  computerPeriods: number | null;
  carCapSatang: number | null;
  sources?: Partial<Record<"building" | "tempBuilding" | "intangible" | "other" | "computer" | "carCap", string>>;
};

const pct = (bp: number) => `${(bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** อัตราต่อปีของเส้นตรงตามอายุ (bp) — 12 ÷ อายุเดือน */
export const annualRateBp = (usefulLifeMonths: number) => Math.round((12 / usefulLifeMonths) * 10000);

/**
 * คำเตือนทางภาษีของสินทรัพย์ 1 ตัว (pure) — ไม่บล็อก ไม่เปลี่ยนค่าเสื่อมทางบัญชี
 *   ที่ดิน → ASSET_LAND_NOT_DEPRECIATED
 *   อัตราตามอายุ > เพดานของประเภท (คอมพิวเตอร์: อายุสั้นกว่า N รอบบัญชี) → ASSET_TAX_RATE_ABOVE_CEILING
 *   รถยนต์นั่ง ทุน > ฐานสูงสุด → ASSET_PASSENGER_CAR_COST_CAP
 */
export function assetTaxWarnings(a: { name?: string; taxClass?: string | null; cost: number; usefulLifeMonths: number }, rules: AssetTaxRules): LegalWarning[] {
  const cls = assetTaxClassOf(a.taxClass);
  const out: LegalWarning[] = [];
  if (cls === "LAND") return [legalWarning("ASSET_LAND_NOT_DEPRECIATED", { name: a.name ?? "" })];
  if (a.usefulLifeMonths >= 1) {
    const rate = annualRateBp(a.usefulLifeMonths);
    const life = `${a.usefulLifeMonths} เดือน`;
    const label = ASSET_TAX_CLASS_LABEL_TH[cls].replace(/ \(.*\)$/, "");
    const src = rules.sources ?? {};
    const ceil = (bp: number | null, key: keyof NonNullable<AssetTaxRules["sources"]>) => {
      if (bp !== null && rate > bp) out.push(legalWarning("ASSET_TAX_RATE_ABOVE_CEILING", { life, rate: pct(rate), classLabel: label, ceiling: `${pct(bp)} ต่อปี` }, src[key] ? { citation: src[key] } : {}));
    };
    if (cls === "BUILDING") ceil(rules.buildingBp, "building");
    else if (cls === "TEMP_BUILDING") ceil(rules.tempBuildingBp, "tempBuilding");
    else if (cls === "INTANGIBLE") ceil(rules.intangibleBp, "intangible");
    else if (cls === "COMPUTER") {
      // ม.4 จัตวา: หักได้ภายใน N รอบบัญชี ⇒ อายุสั้นกว่า N × 12 เดือน = เร็วกว่าที่หักได้
      if (rules.computerPeriods !== null && a.usefulLifeMonths < rules.computerPeriods * 12)
        out.push(legalWarning("ASSET_TAX_RATE_ABOVE_CEILING", { life, rate: pct(rate), classLabel: label, ceiling: `หักได้ภายใน ${rules.computerPeriods} รอบบัญชี` }, src.computer ? { citation: src.computer } : {}));
    } else ceil(rules.otherBp, "other");
  }
  if (cls === "PASSENGER_CAR" && rules.carCapSatang !== null && a.cost > rules.carCapSatang) {
    out.push(legalWarning("ASSET_PASSENGER_CAR_COST_CAP", { cost: baht(a.cost), cap: baht(rules.carCapSatang), excess: baht(a.cost - rules.carCapSatang) }, src0(rules)));
  }
  return out;
}
const src0 = (r: AssetTaxRules) => (r.sources?.carCap ? { citation: r.sources.carCap } : {});
