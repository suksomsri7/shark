import { tenantDb, type TenantDb } from "@/lib/core/db";
import { csvCell } from "@/lib/core/csv";
import type { Prisma, SystemType } from "@prisma/client";

// Report builder v1 (WO-0055) — สร้างรายงานจากชุดข้อมูลกลาง (READ-ONLY) + บันทึกนิยามรายงาน
//
// แต่ละ dataset มี "แกน system": โมเดลต้นทางเป็น system-scoped (POS/MEMBER/INVENTORY)
// → ร้านหนึ่งมีได้หลายระบบต่อประเภท (หลายสาขา) จึงต้อง enumerate AppSystem ตามประเภท
//   แล้ว query ผ่าน tenantDb({ tenantId, systemId }) ต่อระบบ แล้วรวมผล (pattern เดียวกับ calendar)
// ทุก query ผ่าน tenantDb เสมอ — ไม่ import prisma ตรง (F5) · ไม่มี write path ต่อข้อมูลต้นทาง
//
// กันการ inject field: filter/groupBy/metric อ้าง field ได้เฉพาะที่อยู่ใน columns ของ dataset
//   (whitelist) เท่านั้น — นอกนั้นโยน error ไทย ก่อนแตะ DB

export type ColType = "string" | "number" | "date";
export type Column = { key: string; label: string; type: ColType };

export type FilterOp = "eq" | "gte" | "lte" | "contains";
export type Filter = { field: string; op: FilterOp; value: unknown };

export type ReportInput = {
  dataset: string;
  filters?: Filter[];
  groupBy?: string;
  /** "count" (ค่าเริ่มต้น) | "sum:<numberField>" */
  metric?: string;
  take?: number;
};

export type ReportResult = {
  columns: Column[];
  rows: Record<string, unknown>[];
  truncated?: boolean;
  /** HF-INV-1 R3c (C4): การปฏิเสธที่คาดไว้ (สิทธิ์ · ตรวจค่า · คอลัมน์ปิดบัง) จาก server action — Next ปิดบังข้อความที่ throw ใน production */
  error?: string;
};

/**
 * HF-INV-1 R3c (C4): การปฏิเสธที่ "คาดไว้" ของรายงาน (ตรวจค่า · สิทธิ์อ่านชุดข้อมูล · คอลัมน์ปิดบัง) — ข้อความไทยสำหรับคนใช้
 * server action แปลงเป็นข้อมูล `{ error }` · error ชนิดอื่นยัง throw ตามเดิม
 */
export class ReportRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportRefusal";
  }
}

type DatasetDef = {
  label: string;
  columns: Column[];
  systemType: SystemType;
  /**
   * HF-INV-1 R3.7 / R3b: เงื่อนไขฐานจาก "สาขาที่ผู้รันเข้าถึง" (มีเฉพาะชุดที่ผูกสาขา) — ไม่มี = ชุดนี้กรองตามสาขาไม่ได้
   * sales = unitId ของบิล · customers = ขอบเขตของหน้าสมาชิก (สาขาหลัก หรือเคยมาใช้บริการที่สาขานั้น)
   */
  unitScope?: (unitIds: readonly string[]) => Record<string, unknown>;
  /**
   * HF-INV-1 R3b: คอลัมน์ที่โมดูลเจ้าของ "ปิดบัง" สำหรับบางคน → ตัวปิดบัง (ค่าเดียวกับที่โมดูลเจ้าของแสดง)
   * ผู้เรียกบอกใน ctx.masked ว่าปิดคอลัมน์ไหน — คอลัมน์ที่ปิดอยู่ใช้กรอง/จัดกลุ่ม/รวมค่าไม่ได้ (กันอ่านค่ากลับทางอ้อม)
   * ไม่ใส่ใน `Column` เพราะ columns ถูกส่งกลับไปหน้าจอ (ฟังก์ชันส่งข้าม server action ไม่ได้)
   */
  masks?: Record<string, (v: unknown) => unknown>;
  /** เงื่อนไขฐาน (เช่น เฉพาะบิลที่ชำระแล้ว) — merge เข้ากับ filter ผู้ใช้ */
  baseWhere?: Record<string, unknown>;
  /** query โมเดลจริงต่อระบบ — คืนแถวดิบ (แยกไว้เพื่อคงชนิด Prisma ต่อโมเดล) */
  query: (db: TenantDb, where: Record<string, unknown>, take?: number) => Promise<Record<string, unknown>[]>;
};

const RAW_CAP = 500; // เพดานแถวดิบพรีวิวบนจอ (ไม่จัดกลุ่ม)
export const EXPORT_CAP = 50_000; // เพดานตอน export CSV — สูงกว่าจอมาก กัน "ตัด 500 แถวเงียบ ๆ"

/**
 * HF-INV-0 (S2c) — `take` มาจาก client (จอ/CSV) · เดิมไม่มีเพดานฝั่ง server (ส่ง 1e9 ได้ · ค่าลบ = Prisma อ่านจากท้าย)
 * ⇒ ปัดเป็นจำนวนเต็ม 1…EXPORT_CAP · ไม่ส่ง/อ่านไม่ได้ = ค่าเริ่มต้นของผู้เรียก
 */
export function clampReportTake(take: unknown, fallback: number): number {
  const n = typeof take === "number" ? take : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), EXPORT_CAP);
}

/** HF-INV-0 (S2a) — แถวที่ออกจาก server มีเฉพาะคีย์ใน columns ของ dataset (ไม่มี id/อีเมล/โน้ต/คีย์ภายในหลุด) */
function project(columns: Column[], row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columns) out[c.key] = row[c.key];
  return out;
}

// ── HF-INV-1 R3b (B1): customers ต้องไม่เห็นเกินที่โมดูลสมาชิกให้ actor คนเดียวกันเห็น ──
// 🔴 โมดูลนี้ import โมดูลสมาชิกไม่ได้ (fitness F2.1: ไม่มีเส้น reports→member ใน allowlist · fitness.mts เป็นไฟล์ร่วมของ CRM)
//    ⇒ ก๊อป 3 อย่างมาให้ตรงตัวอักษร และ oracle `qc-hf-reports-authz` RP-5 เทียบผลกับ listMembers/exportMembers ตรง ๆ ทุกบทบาท
//    (สองที่ลอยห่างกันเมื่อไหร่ ข้อสอบแดง) — แก้ต้นฉบับที่ member/** ต้องแก้ที่นี่ด้วย
/** = member/profile.ts `maskPhone` */
function maskPhoneLikeMember(phone: unknown): string {
  const digits = (typeof phone === "string" ? phone : "").replace(/\D/g, "");
  if (digits.length < 7) return "xxx-xxx-xxxx";
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
}
/** = member/access.ts `VISIT_SCOPE_MODULES` (กิจกรรมที่แปลว่า "มาใช้บริการที่สาขานั้นจริง") */
const MEMBER_VISIT_SCOPE_MODULES: readonly string[] = ["pos", "booking", "restaurant"];
/** = member/list.ts `actorScopeWhere` (ผู้เรียกตัดสิน isUnitScoped แล้วส่ง unitAccess มา) */
function memberUnitScope(unitIds: readonly string[]): Record<string, unknown> {
  const u = [...unitIds];
  return { OR: [{ homeUnitId: { in: u } }, { activities: { some: { unitId: { in: u }, module: { in: [...MEMBER_VISIT_SCOPE_MODULES] } } } }] };
}

export const DATASETS: Record<string, DatasetDef> = {
  sales: {
    label: "ยอดขาย (บิลที่ชำระแล้ว)",
    systemType: "POS",
    unitScope: (unitIds) => ({ unitId: { in: [...unitIds] } }),
    baseWhere: { status: "PAID" },
    columns: [
      { key: "receiptNo", label: "เลขที่ใบเสร็จ", type: "string" },
      { key: "unitId", label: "สาขา", type: "string" },
      { key: "subtotalSatang", label: "ยอดก่อนรวม (สตางค์)", type: "number" },
      { key: "discountSatang", label: "ส่วนลด (สตางค์)", type: "number" },
      { key: "grandTotalSatang", label: "ยอดสุทธิ (สตางค์)", type: "number" },
      { key: "status", label: "สถานะ", type: "string" },
      { key: "createdAt", label: "วันที่", type: "date" },
    ],
    query: async (db, where, take) =>
      (await db.posSale.findMany({
        where: where as Prisma.PosSaleWhereInput,
        take,
        orderBy: { createdAt: "desc" },
      })) as unknown as Record<string, unknown>[],
  },
  customers: {
    label: "ลูกค้า (สมาชิก)",
    systemType: "MEMBER",
    // R3b: = buildWhere ของหน้ารวมสมาชิกเมื่อไม่ได้เลือกสถานะ (ไม่นับคนที่ถูกรวมเข้าคนอื่นแล้ว)
    baseWhere: { status: { not: "MERGED" } },
    unitScope: memberUnitScope,
    // R3b: หน้ารวมสมาชิกแสดงเบอร์แบบ maskPhone เสมอ · เบอร์เต็มออกได้ทาง exportMembers เท่านั้น (ผู้เรียกตัดสินด่านนั้น)
    //   คอลัมน์อื่นของชุดนี้หน้าสมาชิกแสดงให้ผู้อ่านคนเดียวกันอยู่แล้ว (รายการ หรือหน้า 360) — ดู wo-notes HF-INV-1 Round 3b
    masks: { phone: maskPhoneLikeMember },
    columns: [
      { key: "memberCode", label: "รหัสสมาชิก", type: "string" },
      { key: "name", label: "ชื่อ", type: "string" },
      { key: "phone", label: "เบอร์โทร", type: "string" },
      { key: "tier", label: "ระดับ", type: "string" },
      { key: "totalSpentSatang", label: "ยอดใช้จ่ายสะสม (สตางค์)", type: "number" },
      { key: "visitCount", label: "จำนวนครั้งที่มา", type: "number" },
      { key: "createdAt", label: "วันที่สมัคร", type: "date" },
    ],
    query: async (db, where, take) =>
      (await db.customer.findMany({
        where: where as Prisma.CustomerWhereInput,
        take,
        orderBy: { createdAt: "desc" },
      })) as unknown as Record<string, unknown>[],
  },
  inventory: {
    label: "สินค้าคงคลัง",
    systemType: "INVENTORY",
    columns: [
      { key: "sku", label: "รหัสสินค้า", type: "string" },
      { key: "name", label: "ชื่อสินค้า", type: "string" },
      { key: "category", label: "หมวดหมู่", type: "string" },
      { key: "onHand", label: "คงเหลือ", type: "number" },
      { key: "reorderPoint", label: "จุดสั่งซื้อ", type: "number" },
      { key: "costSatang", label: "ต้นทุน (สตางค์)", type: "number" },
      { key: "createdAt", label: "วันที่สร้าง", type: "date" },
    ],
    query: async (db, where, take) =>
      (await db.invItem.findMany({
        where: where as Prisma.InvItemWhereInput,
        take,
        orderBy: { createdAt: "desc" },
      })) as unknown as Record<string, unknown>[],
  },
};

function getDataset(name: string): DatasetDef {
  // HF-INV-1 R3.7: ต้องเป็นคีย์ของตารางเอง — `DATASETS["constructor"]` / `["__proto__"]` เคยได้ของจาก prototype แล้ววิ่งต่อ
  //   (ไม่มี systemType ⇒ ดึงระบบทุกประเภทของร้าน) · ตรวจก่อนแตะฐานข้อมูล
  if (typeof name !== "string" || !Object.hasOwn(DATASETS, name)) throw new ReportRefusal(`ไม่รู้จักชุดข้อมูล "${String(name).slice(0, 40)}"`);
  return DATASETS[name];
}

/** field ต้องอยู่ใน columns ของ dataset เท่านั้น (กัน field injection) */
function assertField(ds: DatasetDef, field: string, where: string): void {
  if (!ds.columns.some((c) => c.key === field)) {
    throw new ReportRefusal(`ฟิลด์ "${field}" ใช้ใน${where}ไม่ได้ (ไม่อยู่ในชุดข้อมูลนี้)`);
  }
}

/** แปลง op → เงื่อนไข Prisma — op นอกรายการโยนไทย */
function opClause(op: FilterOp, value: unknown): unknown {
  // HF-INV-1 R3.7: ค่าตัวกรองต้องเป็นค่าเดี่ยว — object/array ที่ส่งมาตรง ๆ กลายเป็น "ตัวดำเนินการ" ของ Prisma
  //   (เช่น eq { not: … } / { in: [...] } ⇒ ไล่อ่านข้อมูลทีละช่วงได้) · Date ผ่านได้ (ชุดข้อมูลมีคอลัมน์วันที่)
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    throw new ReportRefusal("ค่าที่ใช้กรองต้องเป็นค่าเดียว (ข้อความ ตัวเลข หรือวันที่)");
  }
  switch (op) {
    case "eq":
      return value;
    case "gte":
      return { gte: value };
    case "lte":
      return { lte: value };
    case "contains":
      return { contains: value, mode: "insensitive" };
    default: {
      // R3c (C4): ไม่ส่ง op / op ไม่ใช่ข้อความ ⇒ บอกว่าต้องเลือกเงื่อนไข (เดิม `เงื่อนไข "undefined" ไม่รองรับ`)
      const o: unknown = op;
      throw new ReportRefusal(typeof o === "string" ? `เงื่อนไข "${o.slice(0, 20)}" ไม่รองรับ` : "ตัวกรองแต่ละข้อต้องเลือกเงื่อนไข (เท่ากับ · มากกว่าหรือเท่ากับ · น้อยกว่าหรือเท่ากับ · มีคำว่า)");
    }
  }
}

/** รายชื่อ systemId ทุกระบบของร้านตามประเภท (tenant-scoped ผ่าน tenantDb) */
async function systemIds(tenantId: string, type: SystemType): Promise<string[]> {
  try {
    const db = tenantDb({ tenantId });
    const rows = await db.appSystem.findMany({ where: { type }, select: { id: true } });
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/**
 * HF-INV-1 R3c (C3/C4): ตรวจคำขอรายงานทั้งหมดที่ไม่ต้องแตะฐานข้อมูล — ไม่ผ่าน = `ReportRefusal` (ไทย)
 * runReport เรียกก่อนทำงานเสมอ · action ใช้ตัดสินว่ารายงานที่บันทึกไว้ "actor รันได้ตอนนี้" ไหม (ตัวตรวจเดียวกับตอนรันจริง)
 */
export function checkReport(
  ctx: {
    /** HF-INV-1 R3.7: จำกัดสาขา (ผู้รันเข้าได้เฉพาะสาขาเหล่านี้) · ไม่ส่ง = ทุกสาขา */
    unitIds?: readonly string[];
    /** HF-INV-1 R3b: คอลัมน์ที่ต้องปิดบังสำหรับผู้รันคนนี้ (ต้องมีตัวปิดบังใน `masks` ของชุดข้อมูล) */
    masked?: readonly string[];
  },
  input: ReportInput,
) {
  const ds = getDataset(input?.dataset);
  // HF-INV-1 R3b (B4): filters มาจาก client — ไม่ใช่รายการ / สมาชิกไม่ใช่ object ⇒ ข้อความไทย (เดิม TypeError ดิบ หรือ `ฟิลด์ "undefined"`)
  const rawFilters: unknown = input.filters ?? [];
  if (!Array.isArray(rawFilters)) throw new ReportRefusal("รูปแบบตัวกรองไม่ถูกต้อง — ตัวกรองต้องเป็นรายการเงื่อนไข (ฟิลด์ · เงื่อนไข · ค่า)");
  for (const f of rawFilters) {
    if (f === null || typeof f !== "object" || Array.isArray(f) || typeof (f as { field?: unknown }).field !== "string") {
      throw new ReportRefusal("รูปแบบตัวกรองไม่ถูกต้อง — ตัวกรองแต่ละข้อต้องระบุฟิลด์ เงื่อนไข และค่า");
    }
  }
  const filters = rawFilters as Filter[];

  // HF-INV-1 R3b (B1): คอลัมน์ที่ปิดบังต้องมีตัวปิดบังจริง (ขอปิดคอลัมน์ที่ปิดไม่ได้ = ปฏิเสธ ไม่ใช่ส่งค่าเต็มออกไป)
  const masked = new Set(ctx.masked ?? []);
  for (const k of masked) {
    if (!ds.masks || !Object.hasOwn(ds.masks, k)) throw new ReportRefusal(`ชุดข้อมูลนี้ปิดบังคอลัมน์ "${String(k).slice(0, 40)}" ไม่ได้`);
  }
  // คอลัมน์ที่ถูกปิดบังใช้กรอง/จัดกลุ่ม/รวมค่าไม่ได้ — ไม่งั้น `contains "0811"` + นับแถว = อ่านเลขกลับได้ทีละหลัก
  const assertVisible = (field: string, where: string) => {
    if (!masked.has(field)) return;
    const label = ds.columns.find((c) => c.key === field)?.label ?? field;
    throw new ReportRefusal(`บัญชีนี้เห็น "${label}" แบบปิดบังบางส่วน — ใช้ใน${where}ไม่ได้ (ต้องมีสิทธิ์ส่งออกรายชื่อสมาชิกจากเจ้าของร้าน)`);
  };

  // ── validate ทุก field ที่ผู้ใช้อ้าง ก่อนแตะ DB ──
  for (const f of filters) {
    assertField(ds, f.field, "ตัวกรอง");
    assertVisible(f.field, "ตัวกรอง");
  }
  if (input.groupBy) {
    assertField(ds, input.groupBy, "การจัดกลุ่ม");
    assertVisible(input.groupBy, "การจัดกลุ่ม");
  }

  const metric: unknown = input.metric ?? "count";
  // R3c (C4): metric มาจาก client — ไม่ใช่ข้อความ ⇒ ไทย (เดิม TypeError `metric.startsWith is not a function`)
  if (typeof metric !== "string") throw new ReportRefusal("ตัวชี้วัดไม่ถูกต้อง — เลือก “นับจำนวน” หรือ “รวมค่า” ของฟิลด์ตัวเลข");
  let sumField: string | null = null;
  if (metric.startsWith("sum:")) {
    sumField = metric.slice(4);
    assertField(ds, sumField, "การรวมค่า");
    assertVisible(sumField, "การรวมค่า");
  } else if (metric !== "count") {
    throw new ReportRefusal(`ตัวชี้วัด "${metric.slice(0, 40)}" ไม่รองรับ`);
  }

  // ── สร้าง where จาก baseWhere + ขอบเขตสาขา + filter (field ผ่าน whitelist แล้ว) ──
  const conds = filters.map((f) => ({ [f.field]: opClause(f.op, f.value) }));
  // HF-INV-1 R3.7: ขอบเขตสาขาของผู้รันเป็นเงื่อนไขฐาน (ตัวกรองของผู้ใช้อยู่ใน AND — หลุดขอบเขตไม่ได้)
  if (ctx.unitIds && !ds.unitScope) throw new ReportRefusal("ชุดข้อมูลนี้กรองตามสาขาไม่ได้");
  return { ds, masked, sumField, conds };
}

export async function runReport(
  ctx: {
    tenantId: string;
    /** HF-INV-1 R3.7: จำกัดสาขา (ผู้รันเข้าได้เฉพาะสาขาเหล่านี้) · ไม่ส่ง = ทุกสาขา */
    unitIds?: readonly string[];
    /** HF-INV-1 R3b: คอลัมน์ที่ต้องปิดบังสำหรับผู้รันคนนี้ (ต้องมีตัวปิดบังใน `masks` ของชุดข้อมูล) */
    masked?: readonly string[];
  },
  input: ReportInput,
): Promise<ReportResult> {
  const { tenantId } = ctx;
  const { ds, masked, sumField, conds } = checkReport(ctx, input);
  const scope = ctx.unitIds && ds.unitScope ? ds.unitScope(ctx.unitIds) : null;
  const parts = [ds.baseWhere, scope, ...conds].filter((p): p is Record<string, unknown> => !!p && Object.keys(p).length > 0);
  const where: Record<string, unknown> = parts.length ? { AND: parts } : {};

  const grouped = !!input.groupBy;
  // HF-INV-0 S2c: เพดานฝั่ง server · HF-INV-1 R3.7: ทางจัดกลุ่มมีเพดานด้วย (เดิมอ่านทุกแถวทุกระบบไม่จำกัด)
  //   ไม่ส่ง take = EXPORT_CAP · อ่านเกิน 1 แถวเพื่อรู้ว่าถูกตัด แล้วบอก truncated
  const cap = clampReportTake(input.take, grouped ? EXPORT_CAP : RAW_CAP);
  const perSystemTake = grouped ? cap + 1 : cap;

  // ── enumerate ทุกระบบตามประเภท แล้วรวมผล ──
  const ids = await systemIds(tenantId, ds.systemType);
  const rows: Record<string, unknown>[] = [];
  for (const systemId of ids) {
    const db = tenantDb({ tenantId, systemId });
    try {
      const part = await ds.query(db, where, perSystemTake);
      for (const r of part) rows.push(r);
    } catch {
      /* ระบบนั้นไม่พร้อม/ปิด → ข้ามเงียบ ๆ */
    }
  }

  // ── จัดกลุ่ม ──
  if (grouped && input.groupBy) {
    const gb = input.groupBy;
    const agg = new Map<string, number>();
    const groupedTruncated = rows.length > cap;
    for (const r of rows.slice(0, cap)) {
      const key = r[gb] == null ? "" : String(r[gb]);
      const prev = agg.get(key) ?? 0;
      agg.set(key, prev + (sumField ? Number(r[sumField] ?? 0) : 1));
    }
    const gCol = ds.columns.find((c) => c.key === gb);
    const columns: Column[] = [
      { key: "group", label: gCol?.label ?? gb, type: gCol?.type ?? "string" },
      {
        key: "value",
        label: sumField
          ? `รวม ${ds.columns.find((c) => c.key === sumField)?.label ?? sumField}`
          : "จำนวน",
        type: "number",
      },
    ];
    const outRows = [...agg.entries()].map(([group, value]) => ({ group, value }));
    return { columns, rows: outRows, ...(groupedTruncated ? { truncated: true } : {}) };
  }

  // ── แถวดิบ (cap take ?? 500 · เพดาน EXPORT_CAP) — บอกชัดถ้าถูกตัด (เลิก "หายเงียบ") ──
  const truncated = rows.length > cap;
  const out = rows.slice(0, cap).map((r) => {
    const p = project(ds.columns, r);
    // R3b: ปิดบังก่อนออกจาก server (จอและ CSV ใช้ผลเดียวกันนี้)
    for (const k of masked) {
      const mask = ds.masks?.[k];
      if (mask) p[k] = mask(p[k]);
    }
    return p;
  });
  return { columns: ds.columns, rows: out, truncated };
}

// ── CSV ──
const BOM = "﻿";

// HF-INV-1 R3c (C2): ทุกช่อง (หัวตารางด้วย) ผ่าน `csvCell` ของ core/csv — ตัวเดียวกับ exportMembers
//   (ชื่อจากหน้าสมัครสาธารณะเช่น `=HYPERLINK(...)` / เบอร์ `+66…` เคยออกเป็นสูตรสด ๆ ในไฟล์ของเจ้าของร้าน)
//   ตัวเลข (number) ผ่านตรง ไม่เติม ' แม้ติดลบ · วันที่ → ISO · ค่าอื่น → ข้อความแล้วกันสูตร (ข้อความที่เป็นตัวเลขล้วนไม่ถูกเติม — กติกาของตัวช่วยกลาง)
function esc(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return csvCell(v);
  return csvCell(v instanceof Date ? v.toISOString() : String(v));
}

export function toCsv(result: ReportResult): string {
  const header = result.columns.map((c) => esc(c.label)).join(",");
  const lines = result.rows.map((row) =>
    result.columns.map((c) => esc(row[c.key])).join(","),
  );
  return BOM + [header, ...lines].join("\n");
}

// ── บันทึก/เรียก/ลบ นิยามรายงาน (ReportDef · tenant-scoped) ──
export async function saveReport(
  ctx: { tenantId: string },
  input: { name: string; config: ReportInput },
): Promise<{ id: string }> {
  const db = tenantDb({ tenantId: ctx.tenantId });
  const rec = await db.reportDef.create({
    data: {
      tenantId: ctx.tenantId,
      name: input.name,
      configJson: input.config as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { id: rec.id };
}

export async function listReports(
  ctx: { tenantId: string },
): Promise<{ id: string; name: string; config: ReportInput; createdAt: Date }[]> {
  const db = tenantDb({ tenantId: ctx.tenantId });
  const rows = await db.reportDef.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    config: r.configJson as unknown as ReportInput,
    createdAt: r.createdAt,
  }));
}

export async function deleteReport(ctx: { tenantId: string }, id: string): Promise<boolean> {
  const db = tenantDb({ tenantId: ctx.tenantId });
  await db.reportDef.delete({ where: { id } });
  return true;
}
