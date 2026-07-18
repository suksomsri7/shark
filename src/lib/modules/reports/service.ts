import { tenantDb, type TenantDb } from "@/lib/core/db";
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

export type ReportResult = { columns: Column[]; rows: Record<string, unknown>[]; truncated?: boolean };

type DatasetDef = {
  label: string;
  columns: Column[];
  systemType: SystemType;
  /** เงื่อนไขฐาน (เช่น เฉพาะบิลที่ชำระแล้ว) — merge เข้ากับ filter ผู้ใช้ */
  baseWhere?: Record<string, unknown>;
  /** query โมเดลจริงต่อระบบ — คืนแถวดิบ (แยกไว้เพื่อคงชนิด Prisma ต่อโมเดล) */
  query: (db: TenantDb, where: Record<string, unknown>, take?: number) => Promise<Record<string, unknown>[]>;
};

const RAW_CAP = 500; // เพดานแถวดิบพรีวิวบนจอ (ไม่จัดกลุ่ม)
export const EXPORT_CAP = 50_000; // เพดานตอน export CSV — สูงกว่าจอมาก กัน "ตัด 500 แถวเงียบ ๆ"

export const DATASETS: Record<string, DatasetDef> = {
  sales: {
    label: "ยอดขาย (บิลที่ชำระแล้ว)",
    systemType: "POS",
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
  const ds = DATASETS[name];
  if (!ds) throw new Error(`ไม่รู้จักชุดข้อมูล "${name}"`);
  return ds;
}

/** field ต้องอยู่ใน columns ของ dataset เท่านั้น (กัน field injection) */
function assertField(ds: DatasetDef, field: string, where: string): void {
  if (!ds.columns.some((c) => c.key === field)) {
    throw new Error(`ฟิลด์ "${field}" ใช้ใน${where}ไม่ได้ (ไม่อยู่ในชุดข้อมูลนี้)`);
  }
}

/** แปลง op → เงื่อนไข Prisma — op นอกรายการโยนไทย */
function opClause(op: FilterOp, value: unknown): unknown {
  switch (op) {
    case "eq":
      return value;
    case "gte":
      return { gte: value };
    case "lte":
      return { lte: value };
    case "contains":
      return { contains: value, mode: "insensitive" };
    default:
      throw new Error(`เงื่อนไข "${op as string}" ไม่รองรับ`);
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

export async function runReport(
  ctx: { tenantId: string },
  input: ReportInput,
): Promise<ReportResult> {
  const { tenantId } = ctx;
  const ds = getDataset(input.dataset);
  const filters = input.filters ?? [];

  // ── validate ทุก field ที่ผู้ใช้อ้าง ก่อนแตะ DB ──
  for (const f of filters) assertField(ds, f.field, "ตัวกรอง");
  if (input.groupBy) assertField(ds, input.groupBy, "การจัดกลุ่ม");

  const metric = input.metric ?? "count";
  let sumField: string | null = null;
  if (metric.startsWith("sum:")) {
    sumField = metric.slice(4);
    assertField(ds, sumField, "การรวมค่า");
  } else if (metric !== "count") {
    throw new Error(`ตัวชี้วัด "${metric}" ไม่รองรับ`);
  }

  // ── สร้าง where จาก baseWhere + filter (field ผ่าน whitelist แล้ว) ──
  const conds = filters.map((f) => ({ [f.field]: opClause(f.op, f.value) }));
  const where: Record<string, unknown> = {
    ...(ds.baseWhere ?? {}),
    ...(conds.length ? { AND: conds } : {}),
  };

  const grouped = !!input.groupBy;
  const perSystemTake = grouped ? undefined : input.take ?? RAW_CAP;

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
    for (const r of rows) {
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
    return { columns, rows: outRows };
  }

  // ── แถวดิบ (cap take ?? 500) — บอกชัดถ้าถูกตัด (เลิก "หายเงียบ") ──
  const cap = input.take ?? RAW_CAP;
  const truncated = rows.length > cap;
  return { columns: ds.columns, rows: rows.slice(0, cap), truncated };
}

// ── CSV ──
const BOM = "﻿";

function esc(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
