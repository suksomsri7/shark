// coa-v2.ts — ผังบัญชี V2 (WO 6.1 · DESIGN-SPEC-V2 §11.1 · เฟรม f8-chart-of-accounts.png)
//
// ทำไมต้องมีไฟล์นี้แยกจาก coa.ts: coa.ts = "เมล็ดพันธุ์ผังบัญชี + mapping" ของแกน GL (เจ้าของคือ GL-Core)
// ไฟล์นี้ = ชั้นอ่าน/เขียนสำหรับ "หน้าผังบัญชี" ของผู้ใช้ (tree 3 ระดับ · ยอดคงเหลือ · เปิด/ปิดใช้งาน · นำเข้า)
//
// 🔑 โครงต้นไม้: ฐานข้อมูลเก็บบัญชีเป็น "ใบ" ล้วน (รหัส 4 หลัก + บัญชีลูกของช่องทางเงิน เช่น 1010-01)
//    ไม่มีแถวของ "หมวด/หมวดรอง/หมวดย่อย" ⇒ 3 ระดับบนคำนวณจากรหัส (BLUEPRINT §3 แถว 6.1 + SPEC §14 ข้อ 6
//    "level (หลัก/รอง/ย่อย) หรือ derive จากรหัส"):
//      ระดับ 1 หมวด      = ประเภทบัญชี (6 หมวดตาม f8) — รหัสที่โชว์ในวงเล็บ = ตัวเลขนำหน้าของหมวด
//      ระดับ 2 หมวดรอง   = รหัส 2 ตัวแรก
//      ระดับ 3 หมวดย่อย  = รหัส 3 ตัวแรก
//      ระดับ 4 บัญชี     = แถวจริงใน AccountLedger
//    คอลัมน์ `level` ที่เพิ่มใน WO นี้ใช้ "ทับ" ค่าที่คำนวณได้ (null = คำนวณเอง) ⇒ แถวเดิมทั้งหมดทำงานได้ทันที
//
// (ตัวที่แตะ DB อยู่ใน coa.ts — ไฟล์นี้ตั้งใจให้ "บริสุทธิ์" ไม่ import prisma: ทดสอบง่าย + ใช้ฝั่ง client ได้
//  + ไม่เพิ่มตัวนับ F5 ของ fitness ที่ห้ามไฟล์โมดูลใหม่ import prisma ตรง)
//
// 🔑 ยอดเงิน: ใช้กติกาเดียวกับ reports.ts/finance.ts — รวม **ทุกสถานะ** ของ JV (สมุดรายวัน immutable:
//    กลับรายการ = ตั้ง entry เดิมเป็น REVERSED แล้วลง entry ตรงข้าม ⇒ รวมทั้งคู่ = ยอดสุทธิถูกต้อง
//    ถ้ากรอง POSTED อย่างเดียวจะเหลือแต่ขากลับ = ยอดเพี้ยน)
//    เครื่องหมาย: แสดงเป็น "ยอดตามธรรมชาติของหมวด" (สินทรัพย์/ต้นทุน/ค่าใช้จ่าย = Dr−Cr · หนี้สิน/ทุน/รายได้ = Cr−Dr)
//    ⇒ บัญชีรายได้ไม่ติดลบให้ผู้ใช้งงตามที่เจ้าของสั่ง "ภาษาคนทุกที่"

import type { AccountLedgerType } from "@prisma/client";

export type CoaCtx = { tenantId: string; systemId: string };

// ─────────────────── หมวด (ระดับ 1) ───────────────────

export const CHART_TYPE_ORDER: AccountLedgerType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "COGS", "EXPENSE"];

export const CHART_TYPE_LABEL: Record<AccountLedgerType, string> = {
  ASSET: "สินทรัพย์",
  LIABILITY: "หนี้สิน",
  EQUITY: "ส่วนของเจ้าของ",
  INCOME: "รายได้",
  COGS: "ต้นทุนขาย",
  EXPENSE: "ค่าใช้จ่าย",
};

/** ตัวเลขนำหน้าของแต่ละหมวด (ที่โชว์ในวงเล็บบน tree ตาม f8: "สินทรัพย์ (1)") */
export const CHART_TYPE_DIGIT: Record<AccountLedgerType, string> = {
  ASSET: "1",
  LIABILITY: "2",
  EQUITY: "3",
  INCOME: "4",
  COGS: "5",
  EXPENSE: "6",
};

/** หมวดตามตัวเลขนำหน้ารหัส (ใช้เดาประเภทตอนนำเข้า CSV ที่ไม่ระบุประเภท) */
export function typeFromCode(code: string): AccountLedgerType | null {
  const d = code.trim()[0];
  const found = CHART_TYPE_ORDER.find((t) => CHART_TYPE_DIGIT[t] === d);
  return found ?? null;
}

// ─────────────────── ชื่อหมวดรอง/หมวดย่อย (จากคำนำหน้ารหัส) ───────────────────
// ครอบคลุมผังบัญชี SME ไทยที่ coa.ts seed ไว้ทั้งหมด · รหัสนอกตารางนี้ (ผู้ใช้สร้างเอง/นำเข้า)
// ใช้ชื่อสำรอง "หมวดรอง <รหัส>" / "หมวดย่อย <รหัส>" — ไม่ทำให้ต้นไม้พัง
const GROUP_NAME: Record<string, string> = {
  // ── สินทรัพย์ ──
  "10": "เงินสดและรายการเทียบเท่าเงินสด",
  "100": "เงินสด",
  "101": "เงินฝากธนาคาร",
  "102": "เงินอิเล็กทรอนิกส์ (e-Wallet)",
  "103": "เงินสำรองรับจ่าย",
  "104": "เช็ครับรอนำฝาก",
  "11": "ลูกหนี้และสินทรัพย์ทางภาษี",
  "110": "ลูกหนี้การค้า",
  "113": "เงินมัดจำจ่าย",
  "115": "ภาษีซื้อ",
  "116": "ภาษีถูกหัก ณ ที่จ่าย",
  "12": "สินค้าคงเหลือ",
  "120": "สินค้าคงเหลือ",
  "16": "ที่ดิน อาคาร และอุปกรณ์",
  "161": "อุปกรณ์",
  "162": "เครื่องตกแต่งและติดตั้ง",
  "163": "ยานพาหนะ",
  "99": "บัญชีพัก",
  "999": "บัญชีพัก",
  // ── หนี้สิน ──
  "21": "เจ้าหนี้และเงินรับล่วงหน้า",
  "210": "เจ้าหนี้การค้า",
  "211": "เงินมัดจำรับ/เงินรับล่วงหน้า",
  "213": "ภาษีหัก ณ ที่จ่ายค้างนำส่ง",
  "22": "ภาษีขายค้างชำระ",
  "220": "ภาษีขาย",
  "221": "ภาษีขายยังไม่ถึงกำหนด",
  "23": "เช็คจ่าย",
  "230": "เช็คจ่ายรอเรียกเก็บ",
  // ── ส่วนของเจ้าของ ──
  "30": "ทุนเจ้าของ",
  "300": "ทุนเจ้าของ",
  "38": "กำไรสะสม",
  "380": "กำไรสะสม",
  "39": "ยอดยกมา",
  "399": "ยอดยกมา",
  // ── รายได้ ──
  "40": "รายได้จากการขายและบริการ",
  "400": "รายได้จากการขายสินค้า",
  "403": "รายได้ค่าบริการ",
  "48": "ส่วนลดจ่าย",
  "480": "ส่วนลดจ่าย",
  "49": "รายได้อื่น",
  "490": "รายได้อื่น",
  "491": "ดอกเบี้ยรับ",
  // ── ต้นทุนขาย ──
  "50": "ต้นทุนขาย",
  "500": "ซื้อสินค้า/ต้นทุนขาย",
  "53": "ปรับปรุงสินค้าและต้นทุน",
  "530": "สินค้าที่เบิกใช้ในกิจการ",
  "531": "ปรับมูลค่าสินค้า",
  "58": "ส่วนลดรับ",
  "580": "ส่วนลดรับ",
  // ── ค่าใช้จ่าย ──
  "60": "ค่าใช้จ่ายพนักงาน",
  "600": "เงินเดือนและค่าแรง",
  "61": "ค่าเช่า",
  "610": "ค่าเช่า",
  "62": "ค่าสาธารณูปโภค",
  "620": "ค่าสาธารณูปโภค",
  "63": "ค่าการตลาด",
  "630": "ค่าการตลาดและโฆษณา",
  "65": "ค่าธรรมเนียม",
  "650": "ค่าธรรมเนียมชำระเงิน",
  "651": "ค่าธรรมเนียมธนาคาร",
  "68": "ค่าเสื่อมราคา",
  "680": "ค่าเสื่อมราคา",
  "69": "ค่าใช้จ่ายอื่น",
  "690": "ค่าใช้จ่ายอื่น",
};

export function groupNameOf(prefix: string): string {
  return GROUP_NAME[prefix] ?? (prefix.length === 2 ? `หมวดรอง ${prefix}` : `หมวดย่อย ${prefix}`);
}

/** ระดับของแถวบัญชี — คอลัมน์ `level` ทับได้ · null = บัญชี (ใบ) เสมอ */
export function levelOf(row: { level: number | null }): 1 | 2 | 3 | 4 {
  const l = row.level;
  return l === 1 || l === 2 || l === 3 ? l : 4;
}

/** คำนำหน้ารหัส (ตัดขีดของบัญชีลูกช่องทางเงิน "1010-01" ออกก่อน) */
export function prefixOf(code: string, n: number): string {
  const digits = code.replace(/[^0-9]/g, "");
  return digits.slice(0, n).padEnd(n, "0");
}

/** ช่วงรหัสที่ใช้ได้ของหมวดย่อย (SPEC §11.1: modal ต้อง validate รหัสตามช่วงของหมวด) */
export function codeRangeOf(groupPrefix: string): { min: string; max: string } {
  const p = groupPrefix.replace(/[^0-9]/g, "");
  return { min: p.padEnd(4, "0"), max: p.padEnd(4, "9") };
}

export function codeInRange(code: string, groupPrefix: string): boolean {
  const c = code.replace(/[^0-9]/g, "");
  const p = groupPrefix.replace(/[^0-9]/g, "");
  return c.length >= p.length && c.startsWith(p);
}

// ─────────────────── ประเภทภาษี (ฝั่งซื้อ) ───────────────────

export const VAT_TREATMENTS = ["CLAIMABLE", "NON_CLAIMABLE", "PENDING_INVOICE"] as const;
export type VatTreatment = (typeof VAT_TREATMENTS)[number];
export const VAT_TREATMENT_LABEL: Record<VatTreatment, string> = {
  CLAIMABLE: "ภาษีซื้อขอคืนได้",
  NON_CLAIMABLE: "ภาษีซื้อขอคืนไม่ได้",
  PENDING_INVOICE: "รอใบกำกับภาษี",
};
export function vatTreatmentLabel(v: string | null): string {
  return v && (VAT_TREATMENTS as readonly string[]).includes(v) ? VAT_TREATMENT_LABEL[v as VatTreatment] : "ไม่ระบุ";
}

/** ประเภทเงินได้ของ WHT ที่ตั้งเป็นค่าเริ่มต้นต่อบัญชีได้ (ชุดเดียวกับที่ฟอร์มเอกสารใช้) */
export const WHT_TYPE_LABEL: Record<string, string> = {
  SERVICE: "ค่าบริการ/รับจ้างทำของ",
  RENT: "ค่าเช่า",
  TRANSPORT: "ค่าขนส่ง",
  ADVERTISING: "ค่าโฆษณา",
  PROFESSIONAL: "ค่าวิชาชีพอิสระ",
  OTHER: "อื่น ๆ",
};
export function whtLabel(rateBp: number | null, type: string | null): string {
  if (rateBp == null) return "ไม่ใช้กับบัญชีนี้";
  const pct = (rateBp / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return `${pct}%${type ? ` · ${WHT_TYPE_LABEL[type] ?? type}` : ""}`;
}

// ─────────────────── ยอดตามธรรมชาติของหมวด ───────────────────

/** หมวดที่ยอดปกติอยู่ฝั่งเครดิต (หนี้สิน/ทุน/รายได้) */
function isCreditNatured(type: AccountLedgerType): boolean {
  return type === "LIABILITY" || type === "EQUITY" || type === "INCOME";
}

export function naturalAmount(type: AccountLedgerType, debit: number, credit: number): number {
  return isCreditNatured(type) ? credit - debit : debit - credit;
}

const TZ = "Asia/Bangkok";
export function bkkMonthKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}
export function bkkDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * ขอบบนของ "ยอด ณ วันที่ <asOf>" — เที่ยงคืนของ **วันถัดไป** ตามเวลาไทย (ใช้แบบ `date < cutoff`)
 *
 * 🔴 ทำไมต้องมี (WO 6.1 รอบ 2): ก่อนหน้านี้ยอดคงเหลือรวม "ทุกบรรทัดที่มีในสมุด" แล้วติดป้ายว่า
 *    "ยอดคงเหลือ ณ <วันนี้>" — ถ้ามีรายการลงวันที่ล่วงหน้า (เช่น ชุด QC ที่ข้อมูลถึง 30 ก.ย. แต่วันนี้ 4 ก.ย.)
 *    ตัวเลขจะเป็นยอด "สิ้นสุดข้อมูล" ไม่ใช่ยอด ณ วันนี้ — ต่างกันจริง 1,000,000 สตางค์ในชุด QC
 *    ตัดที่ "สิ้นวัน" ไม่ใช่ "เวลาปัจจุบัน" เพราะรายการทั้งวันนี้ต้องนับครบ (เวลาใน entry.date ไม่มีความหมาย)
 */
export function asOfCutoff(asOf: Date): Date {
  const [y, m, d] = bkkDayKey(asOf).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -7, 0, 0)); // เที่ยงคืนวันถัดไป เวลาไทย
}

/** ต้นเดือน (เวลาไทย) ของเดือนที่ asOf อยู่ */
export function bkkMonthStart(asOf: Date): Date {
  const [y, m] = bkkDayKey(asOf).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, -7, 0, 0));
}

// ─────────────────── 1) ต้นไม้ผังบัญชี ───────────────────

export type ChartAccountNode = {
  kind: "account";
  key: string;
  id: string;
  level: 4;
  code: string;
  name: string;
  nameEn: string | null;
  type: AccountLedgerType;
  isSystem: boolean;
  archived: boolean;
  balanceSatang: number;
};

export type ChartGroupNode = {
  kind: "group";
  key: string;
  level: 1 | 2 | 3;
  code: string;
  name: string;
  /** จำนวนบัญชี (ใบ) ทั้งหมดใต้โหนดนี้ — SPEC §11.1 "จำนวนต่อหมวด" */
  count: number;
  children: ChartNode[];
};

export type ChartNode = ChartGroupNode | ChartAccountNode;

export type ChartTree = {
  nodes: ChartGroupNode[];
  /** จำนวนบัญชีทั้งหมดที่แสดง (หลังกรองคำค้น) */
  total: number;
  /** จำนวนบัญชีทั้งหมดในระบบ (ไม่สนคำค้น) — ใช้ในหัวข้อ "N บัญชี" */
  grandTotal: number;
  q: string;
};

/** แถวบัญชีเท่าที่ต้นไม้ต้องใช้ (ผู้เรียกดึงจาก DB มาให้) */
export type ChartLedgerRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  type: AccountLedgerType;
  isSystem: boolean;
  archivedAt: Date | null;
  level: number | null;
};

/**
 * buildChartTree — ประกอบต้นไม้ 3 ระดับจาก "แถวบัญชี + ผลรวม GL" ที่ผู้เรียกดึงมาให้ (ฟังก์ชันบริสุทธิ์)
 * ตัวที่แตะ DB อยู่ที่ `coa.ts#chartTree` (งบประมาณ 3 query) — แยกไว้ให้ทดสอบ/เรียกจากฝั่ง client ได้
 */
export function buildChartTree(
  ledgers: ChartLedgerRow[],
  sumBy: Map<string, { debit: number; credit: number }>,
  opts: { q?: string; includeArchived?: boolean } = {},
): ChartTree {
  const q = (opts.q ?? "").trim();
  const needle = q.toLowerCase();
  const leaves = ledgers
    .filter((l) => levelOf(l) === 4)
    .filter((l) => opts.includeArchived !== false || !l.archivedAt)
    .filter((l) => {
      if (!needle) return true;
      return (
        l.code.toLowerCase().includes(needle) ||
        l.name.toLowerCase().includes(needle) ||
        (l.nameEn ?? "").toLowerCase().includes(needle)
      );
    });

  const grandTotal = ledgers.filter((l) => levelOf(l) === 4 && !l.archivedAt).length;

  // จัดกลุ่มในหน่วยความจำ: หมวด (ประเภท) › หมวดรอง (2 หลัก) › หมวดย่อย (3 หลัก) › บัญชี
  const byType = new Map<AccountLedgerType, Map<string, Map<string, ChartAccountNode[]>>>();
  for (const l of leaves) {
    const sum = sumBy.get(l.id) ?? { debit: 0, credit: 0 };
    const node: ChartAccountNode = {
      kind: "account",
      key: `L:${l.id}`,
      id: l.id,
      level: 4,
      code: l.code,
      name: l.name,
      nameEn: l.nameEn,
      type: l.type,
      isSystem: l.isSystem,
      archived: !!l.archivedAt,
      balanceSatang: naturalAmount(l.type, sum.debit, sum.credit),
    };
    const p2 = prefixOf(l.code, 2);
    const p3 = prefixOf(l.code, 3);
    const t = byType.get(l.type) ?? new Map<string, Map<string, ChartAccountNode[]>>();
    byType.set(l.type, t);
    const g2 = t.get(p2) ?? new Map<string, ChartAccountNode[]>();
    t.set(p2, g2);
    const g3 = g2.get(p3) ?? [];
    g2.set(p3, g3);
    g3.push(node);
  }

  const nodes: ChartGroupNode[] = [];
  for (const type of CHART_TYPE_ORDER) {
    const t = byType.get(type);
    if (!t || t.size === 0) continue;
    const level2: ChartGroupNode[] = [];
    for (const p2 of [...t.keys()].sort()) {
      const g2 = t.get(p2)!;
      const level3: ChartGroupNode[] = [];
      for (const p3 of [...g2.keys()].sort()) {
        const accounts = g2.get(p3)!.sort((a, b) => a.code.localeCompare(b.code));
        level3.push({
          kind: "group",
          key: `G3:${p3}`,
          level: 3,
          code: p3,
          name: groupNameOf(p3),
          count: accounts.length,
          children: accounts,
        });
      }
      level2.push({
        kind: "group",
        key: `G2:${p2}`,
        level: 2,
        code: p2,
        name: groupNameOf(p2),
        count: level3.reduce((n, g) => n + g.count, 0),
        children: level3,
      });
    }
    nodes.push({
      kind: "group",
      key: `T:${type}`,
      level: 1,
      code: CHART_TYPE_DIGIT[type],
      name: CHART_TYPE_LABEL[type],
      count: level2.reduce((n, g) => n + g.count, 0),
      children: level2,
    });
  }

  return { nodes, total: leaves.length, grandTotal, q };
}

export function flattenChart(tree: ChartTree): { group: ChartGroupNode[]; account: ChartAccountNode }[] {
  const out: { group: ChartGroupNode[]; account: ChartAccountNode }[] = [];
  for (const g1 of tree.nodes) {
    for (const g2 of g1.children as ChartGroupNode[]) {
      for (const g3 of g2.children as ChartGroupNode[]) {
        for (const a of g3.children as ChartAccountNode[]) out.push({ group: [g1, g2, g3], account: a });
      }
    }
  }
  return out;
}

/** รายการหมวดย่อย (ระดับ 3) ทั้งหมด — ใช้เป็นตัวเลือก "หมวดย่อย" ใน modal เพิ่ม/แก้ไขบัญชี */
export type SubGroupOption = {
  prefix: string;
  label: string; // "1150 · ภาษีซื้อ (สินทรัพย์)"
  type: AccountLedgerType;
  typeLabel: string;
  parentLabel: string; // "1 · สินทรัพย์ › 11 · ลูกหนี้และสินทรัพย์ทางภาษี"
  range: { min: string; max: string };
  nextCode: string | null;
};

export function subGroupOptions(tree: ChartTree, usedCodes: Set<string>): SubGroupOption[] {
  const out: SubGroupOption[] = [];
  for (const g1 of tree.nodes) {
    const type = CHART_TYPE_ORDER.find((t) => CHART_TYPE_DIGIT[t] === g1.code)!;
    for (const g2 of g1.children as ChartGroupNode[]) {
      for (const g3 of g2.children as ChartGroupNode[]) {
        const range = codeRangeOf(g3.code);
        let nextCode: string | null = null;
        for (let i = 0; i <= 9; i++) {
          const c = `${g3.code}${i}`;
          if (!usedCodes.has(c)) {
            nextCode = c;
            break;
          }
        }
        out.push({
          prefix: g3.code,
          label: `${g3.code} · ${g3.name}`,
          type,
          typeLabel: CHART_TYPE_LABEL[type],
          parentLabel: `${g1.code} · ${g1.name} › ${g2.code} · ${g2.name}`,
          range,
          nextCode,
        });
      }
    }
  }
  return out;
}

// ─────────────────── 2) รายละเอียดบัญชี (แผงขวา f8) ───────────────────

export type LedgerMovementRow = {
  id: string;
  entryId: string;
  date: Date;
  docNo: string;
  memo: string | null;
  debit: number;
  credit: number;
  /** ยอดคงเหลือสะสม (ตามธรรมชาติของหมวด) หลังบรรทัดนี้ */
  runningSatang: number;
};

export type LedgerDetail = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  type: AccountLedgerType;
  typeLabel: string;
  isSystem: boolean;
  archivedAt: Date | null;
  description: string | null;
  defaultWhtRateBp: number | null;
  defaultWhtType: string | null;
  vatTreatment: string | null;
  /** หมวดหลัก/รอง/ย่อย ที่คำนวณจากรหัส */
  group1: { code: string; name: string };
  group2: { code: string; name: string };
  group3: { code: string; name: string };
  /** วันที่ที่ใช้คิดยอด (ป้าย "ยอดคงเหลือ ณ …" ต้องใช้ค่านี้ ไม่ใช่ new Date() ของตัวเอง) */
  asOf: Date;
  balanceSatang: number;
  monthDeltaSatang: number;
  /** WO B4 additive — เดบิต/เครดิต "ดิบ" ของเดือนนี้ (monthDeltaSatang เป็นยอดสุทธิตามธรรมชาติของหมวด
   *  ⇒ แยก 2 ขาไม่ได้) · REST `GET /chart/{id}` ส่ง `monthMovement{debitSatang,creditSatang}` */
  monthDebitSatang: number;
  monthCreditSatang: number;
  monthKey: string;
  /** ช่องทางเงินที่ผูกกับบัญชีนี้ (ป้าย "ผูกกับบัญชีเงิน") */
  finance: { id: string; code: string | null; name: string } | null;
  /** คีย์ mapping ที่ชี้มาที่บัญชีนี้ (ทำให้เป็น "บัญชีระบบ" เชิงใช้งาน) */
  mappingKeys: string[];
  movements: LedgerMovementRow[];
  /** เหตุที่ปิดใช้งานไม่ได้ (null = ปิดได้) */
  blockReason: string | null;
  usage: { journalLines: number; docLines: number; mappings: number; finance: number };
};

export function archiveBlockReason(
  isSystem: boolean,
  usage: { journalLines: number; docLines: number; mappings: number; finance: number },
): string | null {
  if (isSystem) return "บัญชีระบบ ปิดใช้งานไม่ได้ — แก้ชื่อ/คำอธิบายได้อย่างเดียว";
  if (usage.finance > 0) return "ปิดใช้งานไม่ได้ เพราะบัญชีนี้ผูกกับช่องทางเงินอยู่ — ปิดช่องทางเงินก่อน";
  if (usage.mappings > 0) return "ปิดใช้งานไม่ได้ เพราะระบบใช้บัญชีนี้ลงบัญชีอัตโนมัติอยู่ — เปลี่ยนการผูกบัญชีอัตโนมัติก่อน";
  if (usage.journalLines > 0) return "ปิดใช้งานไม่ได้ เพราะบัญชีนี้มีรายการเคลื่อนไหวในสมุดรายวันแล้ว";
  if (usage.docLines > 0) return "ปิดใช้งานไม่ได้ เพราะมีรายการในเอกสารอ้างถึงบัญชีนี้อยู่";
  return null;
}

// ─────────────────── 3) เพิ่ม/แก้ไข/เปิด-ปิดใช้งาน ───────────────────

export type SaveLedgerInput = {
  code: string;
  name: string;
  nameEn?: string | null;
  /** คำนำหน้าหมวดย่อย (3 หลัก) ที่ผู้ใช้เลือก — ใช้ตรวจช่วงรหัส + สืบทอดประเภท */
  groupPrefix: string;
  description?: string | null;
  defaultWhtRateBp?: number | null;
  defaultWhtType?: string | null;
  vatTreatment?: string | null;
};

export type SaveLedgerResult =
  | { ok: true; id: string; code: string }
  | { ok: false; fields: Record<string, string> };

const MAXLEN = { name: 80, nameEn: 80, description: 300 };

export function validateLedgerInput(input: SaveLedgerInput): Record<string, string> {
  const f: Record<string, string> = {};
  const code = input.code.trim();
  const prefix = input.groupPrefix.replace(/[^0-9]/g, "");
  if (!code) f.code = "จำเป็นต้องกรอกรหัสบัญชี";
  else if (!/^\d{3,6}$/.test(code)) f.code = "รหัสบัญชีต้องเป็นตัวเลข 3–6 หลัก";
  else if (prefix && !codeInRange(code, prefix)) {
    const r = codeRangeOf(prefix);
    f.code = `รหัสต้องอยู่ในช่วงของหมวดย่อยที่เลือก (${r.min}–${r.max})`;
  }
  if (!input.name.trim()) f.name = "จำเป็นต้องกรอกชื่อบัญชี";
  if (!prefix) f.groupPrefix = "เลือกหมวดย่อยของบัญชี";
  for (const [k, max] of Object.entries(MAXLEN)) {
    const v = String((input as unknown as Record<string, string>)[k] ?? "");
    if (v.length > max) f[k] = `ยาวเกิน ${max} ตัวอักษร`;
  }
  if (input.defaultWhtRateBp != null && (input.defaultWhtRateBp < 0 || input.defaultWhtRateBp > 10000))
    f.defaultWhtRateBp = "อัตราต้องอยู่ระหว่าง 0–100%";
  if (input.vatTreatment && !(VAT_TREATMENTS as readonly string[]).includes(input.vatTreatment))
    f.vatTreatment = "ประเภทภาษีไม่ถูกต้อง";
  return f;
}

