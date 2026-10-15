// products-scope.ts — ตรรกะบริสุทธิ์ของจอ 06 ตามตัวเลือกสาขา (POS P2.2U · มติ 1/2): แถวที่ชนะต่อช่องทาง · ราคาที่ใช้ · "ราคาต่างกันตามช่องทาง" ·
//   บรรทัด "แพลตฟอร์ม ฿x" · ชิปช่องทาง · ร่างแก้ราคา → แถวทั้งชุดที่ส่ง setChannelPricesAction
// 🔴 client import ได้ (ไม่มี prisma · import type เท่านั้นจาก products-data.ts) · ไม่มีข้อความไทยนอกคอมเมนต์
// ลำดับเดียวกับ price-shared R4 ③④ (ไม่รวมโปร — โปรแสดงเป็นกล่องแยก):
//   สาขา u: (ช่องทาง, u) > (ช่องทาง, ทุกสาขา) > (ทุกช่องทาง, u) > ราคาปกติ · ทุกสาขา (null): (ช่องทาง, ทุกสาขา) > ราคาปกติ

import type { ProductsChannel, ProductsPriceRow, ProductsRow } from "./products-data";

export type Effective = { kind: "price"; priceSatang: number; own: boolean; source: "BASE" | "CHANNEL" | "BRANCH" } | { kind: "notSold"; own: boolean } | { kind: "none" };

const same = (a: string | null | undefined, b: string | null) => (a ?? null) === b;

/** แถวที่ชนะของช่องทางนี้ในขอบเขตสาขา */
export function scopedRow(rows: readonly ProductsPriceRow[], code: string, unit: string | null): ProductsPriceRow | null {
  const order: [string | null, string | null][] = unit ? [[code, unit], [code, null], [null, unit]] : [[code, null]];
  for (const [c, u] of order) {
    const r = rows.find((x) => same(x.channelCode, c) && same(x.unitId, u));
    if (r) return r;
  }
  return null;
}

/** ราคาที่ใช้ของช่องทางนี้ (own = มีแถว (ช่องทาง, ขอบเขตนี้) ของตัวเอง — แก้ได้ตรง ๆ) */
export function effectiveOf(p: Pick<ProductsRow, "rows" | "basePriceSatang">, code: string, unit: string | null): Effective {
  const r = scopedRow(p.rows, code, unit);
  if (r) {
    const own = same(r.channelCode, code) && same(r.unitId, unit);
    if (r.notSold || r.priceSatang === null) return { kind: "notSold", own };
    return { kind: "price", priceSatang: r.priceSatang, own, source: r.channelCode === null ? "BRANCH" : "CHANNEL" };
  }
  return p.basePriceSatang === null ? { kind: "none" } : { kind: "price", priceSatang: p.basePriceSatang, own: false, source: "BASE" };
}

/** ช่องทางที่ใช้ในขอบเขตนี้ (สาขา = เปิดที่สาขานั้น · ทุกสาขา = ทุกช่องทาง) */
export const channelsIn = (channels: readonly ProductsChannel[], unit: string | null) => (unit ? channels.filter((c) => c.unitIds.includes(unit)) : [...channels]);

/** ราคาต่างกันตามช่องทาง = ราคาที่ใช้ของช่องทางในขอบเขต > 1 ค่า หรือมีช่องทาง "ไม่ขาย" */
export function differsByChannel(p: ProductsRow, chans: readonly ProductsChannel[], unit: string | null): boolean {
  const vals = new Set<number>();
  for (const c of chans) {
    const e = effectiveOf(p, c.code, unit);
    if (e.kind === "notSold") return true;
    if (e.kind === "price") vals.add(e.priceSatang);
  }
  return vals.size > 1;
}

/** บรรทัด "แพลตฟอร์ม ฿x" — ช่องทางแรก (ลำดับแสดง) ที่ payout PLATFORM และราคาต่างจากราคาปกติ */
export function platformPriceOf(p: ProductsRow, chans: readonly ProductsChannel[], unit: string | null): { code: string; priceSatang: number } | null {
  for (const c of chans) {
    if (c.payout !== "PLATFORM") continue;
    const e = effectiveOf(p, c.code, unit);
    if (e.kind === "price" && e.priceSatang !== p.basePriceSatang) return { code: c.code, priceSatang: e.priceSatang };
  }
  return null;
}

/** ชิปคอลัมน์ "ช่องทาง": ช่องทางที่ขายสินค้านี้ (ไม่ขาย = ซ่อน · QR โต๊ะ/แชท ไม่แสดงเป็นชิป — อยู่ในลิ้นชัก) */
export const chipChannels = (p: ProductsRow, chans: readonly ProductsChannel[], unit: string | null): ProductsChannel[] =>
  chans.filter((c) => c.code !== "QR_TABLE" && c.code !== "CHAT" && effectiveOf(p, c.code, unit).kind !== "notSold");

/** ร่างแก้ราคาต่อช่องทาง (ข้อความในช่อง + ไม่ขาย) */
export type DraftCell = { text: string; notSold: boolean };

/** ร่างตั้งต้นจากแถวของตัวเองในขอบเขตนี้ (ไม่มีแถว = ว่าง ⇒ ใช้ราคาที่สืบทอด) */
export function draftOf(p: ProductsRow, chans: readonly ProductsChannel[], unit: string | null, toInput: (s: number | null) => string): Record<string, DraftCell> {
  const d: Record<string, DraftCell> = {};
  for (const c of chans) {
    const r = p.rows.find((x) => same(x.channelCode, c.code) && same(x.unitId, unit));
    d[c.code] = r ? { text: r.notSold ? "" : toInput(r.priceSatang), notSold: r.notSold } : { text: "", notSold: false };
  }
  return d;
}

/**
 * ร่าง → แถวทั้งชุด (setChannelPrices แทนทั้งชุด): แถวเดิมทั้งหมด ยกเว้นแถว (ช่องทางในร่าง, ขอบเขตนี้) → แทนด้วยร่างที่มีค่า
 * คืน errors ต่อช่องทาง ("bad" | "max") เมื่อข้อความเงินผิด
 */
export function rowsFromDraft(
  p: ProductsRow,
  draft: Record<string, DraftCell>,
  unit: string | null,
  parse: (v: string) => number | null | "bad" | "max",
): { rows: ProductsPriceRow[]; errors: Record<string, "bad" | "max"> } {
  const errors: Record<string, "bad" | "max"> = {};
  const codes = new Set(Object.keys(draft));
  const keep = p.rows.filter((r) => !(r.channelCode !== null && codes.has(r.channelCode) && same(r.unitId, unit)));
  const add: ProductsPriceRow[] = [];
  for (const [code, cell] of Object.entries(draft)) {
    if (cell.notSold) {
      add.push({ channelCode: code, unitId: unit, priceSatang: null, notSold: true });
      continue;
    }
    const v = parse(cell.text);
    if (v === "bad" || v === "max") errors[code] = v;
    else if (v !== null) add.push({ channelCode: code, unitId: unit, priceSatang: v, notSold: false });
  }
  return { rows: [...keep, ...add], errors };
}

// ═══════════ POS P2.11U ▸ หลายสาขา (มติ 1–3) ═══════════
// ช่องคอลัมน์ "ราคา <สาขา>" ของตาราง + ลิ้นชักแบบกลุ่ม "ทุกสาขา" / ต่อสาขา (แถว (ช่องทาง, สาขา) เดียวกับ setChannelPrices) — บริสุทธิ์ · ไม่มีข้อความไทย

/** ราคาหน้าร้าน (STORE) ที่สาขานี้ — own = แถวที่ชนะเป็นของสาขานี้เอง ((STORE, u) หรือ (ทุกช่องทาง, u)) · ไม่ใช่ = ราคากลาง/ราคาปกติ */
export type BranchCell = { kind: "price"; priceSatang: number; own: boolean } | { kind: "notSold"; own: boolean } | { kind: "none" };
export function branchCellOf(p: Pick<ProductsRow, "rows" | "basePriceSatang">, unit: string): BranchCell {
  const r = scopedRow(p.rows, "STORE", unit);
  if (r) {
    const own = same(r.unitId, unit);
    if (r.notSold || r.priceSatang === null) return { kind: "notSold", own };
    return { kind: "price", priceSatang: r.priceSatang, own };
  }
  return p.basePriceSatang === null ? { kind: "none" } : { kind: "price", priceSatang: p.basePriceSatang, own: false };
}

/** กลุ่มของลิ้นชัก: unit null = "ทุกสาขา" · codes = ช่องทางของกลุ่ม (ลำดับแสดง) · editable = ผู้ใช้แก้กลุ่มนี้ได้ */
export type PriceGroup = { unit: string | null; codes: string[]; editable: boolean };
/** คีย์กลุ่มในร่าง ("*" = ทุกสาขา) */
export const groupKey = (unit: string | null): string => unit ?? "*";
/** ร่างทั้งลิ้นชัก: กลุ่ม → ช่องทาง → ช่อง */
export type GroupDraft = Record<string, Record<string, DraftCell>>;

/** ร่างตั้งต้นของทุกกลุ่มที่แก้ได้ (แถวของตัวเองในกลุ่ม · ไม่มี = ว่าง ⇒ สืบทอด) */
export function draftGroups(p: ProductsRow, groups: readonly PriceGroup[], toInput: (s: number | null) => string): GroupDraft {
  const d: GroupDraft = {};
  for (const g of groups) {
    if (!g.editable) continue;
    const cells: Record<string, DraftCell> = {};
    for (const code of g.codes) {
      const r = p.rows.find((x) => same(x.channelCode, code) && same(x.unitId, g.unit));
      cells[code] = r ? { text: r.notSold ? "" : toInput(r.priceSatang), notSold: r.notSold } : { text: "", notSold: false };
    }
    d[groupKey(g.unit)] = cells;
  }
  return d;
}

/** ราคาที่สืบทอดของช่อง (code, unit) — ไม่นับแถวของช่องนั้นเอง (ใช้เป็น placeholder ของช่องที่ว่าง) */
export const inheritedOf = (p: Pick<ProductsRow, "rows" | "basePriceSatang">, code: string, unit: string | null): Effective =>
  effectiveOf({ basePriceSatang: p.basePriceSatang, rows: p.rows.filter((r) => !(r.channelCode === code && same(r.unitId, unit))) }, code, unit);

/**
 * ร่างทุกกลุ่ม → แถวทั้งชุด (setChannelPrices แทนทั้งชุด): แถวเดิมทั้งหมด (รวมแถวที่มองไม่เห็น/ของช่องทาง-สาขาที่เลิกใช้ — เซิร์ฟเวอร์รับแถวเดิมที่ไม่เปลี่ยน) ·
 * ยกเว้นแถว (ช่องทางในร่าง, สาขาของกลุ่ม) → แทนด้วยร่างที่มีค่า · ช่องว่าง = ลบแถวนั้น (กลับไปสืบทอด)
 * errors คีย์ `<กลุ่ม>|<ช่องทาง>` เมื่อข้อความเงินผิด
 */
export function rowsFromGroups(
  p: ProductsRow,
  draft: GroupDraft,
  parse: (v: string) => number | null | "bad" | "max",
): { rows: ProductsPriceRow[]; errors: Record<string, "bad" | "max"> } {
  const errors: Record<string, "bad" | "max"> = {};
  const edited = new Set<string>();
  for (const [gk, cells] of Object.entries(draft)) for (const code of Object.keys(cells)) edited.add(`${gk}|${code}`);
  const keep = p.rows.filter((r) => !(r.channelCode !== null && edited.has(`${groupKey(r.unitId)}|${r.channelCode}`)));
  const add: ProductsPriceRow[] = [];
  for (const [gk, cells] of Object.entries(draft)) {
    const unit = gk === "*" ? null : gk;
    for (const [code, cell] of Object.entries(cells)) {
      if (cell.notSold) {
        add.push({ channelCode: code, unitId: unit, priceSatang: null, notSold: true });
        continue;
      }
      const v = parse(cell.text);
      if (v === "bad" || v === "max") errors[`${gk}|${code}`] = v;
      else if (v !== null) add.push({ channelCode: code, unitId: unit, priceSatang: v, notSold: false });
    }
  }
  return { rows: [...keep, ...add], errors };
}
// ◂
