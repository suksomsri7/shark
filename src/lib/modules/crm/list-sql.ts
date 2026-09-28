// list-sql.ts — ตัวช่วยของ "หน้ารายการในรูป SQL" (ใบ C5.1-fix · F1/F3)
//
// ทำไมมี: ตัวกรองฟิลด์กำหนดเอง (`f.<key>`) กรองในฐานข้อมูลได้แค่ด้วย EXISTS ของตาราง `CustomRecordValue` ซึ่ง Prisma เขียนไม่ได้
//   (ไม่มี relation — recordId เป็น polymorphic) ⇒ เดิมดึงรายการ id ออกมาแล้วส่งกลับเป็น `id IN (…)` ⇒ เกิน 32,766 แถว = P2029
//   หน้ารายการที่มีตัวกรองฟิลด์ (และกระดานดีลทุกครั้ง) จึงเลือก "id ของหน้านั้น" ด้วย SQL คำสั่งเดียว แล้วค่อยอ่านแถวเต็มด้วย Prisma
//   จาก id ที่ได้ (≤ ขนาดหน้า) — DTO/การแปลงค่าเหมือนเดิมทุกไบต์
// 🔴 ลำดับ + cursor ต้อง "เหมือน Prisma เป๊ะ" (ผลของหน้าเดิมกับหน้าใหม่ต้องเป็นแถวชุดเดียวกัน): รูป SQL ข้างล่างคัดจากคำสั่งที่
//    Prisma 7.8 สร้างจริง (จับจาก log ใน C5.1-fix) — คอลัมน์ที่ตั้ง `nulls` ใช้รูปที่มี IS NULL · ที่ไม่ตั้งใช้รูปเทียบตรง ·
//    cursor = ตำแหน่งของแถว cursor (subquery ด้วย id) + OFFSET 1 (skip: 1) · เทียบผลกับ Prisma: scripts/qc-crm-c51fix-equiv.mts

import { Prisma } from "@prisma/client";

export type SqlSortCol = { col: string; dir: "asc" | "desc"; nulls?: "first" | "last" };

const IDENT = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const ALIAS = /^[a-z][a-z0-9_]{0,15}$/;
const TABLE = /^Crm[A-Za-z]+$|^CustomRecord$/;

function ident(v: string): string {
  if (!IDENT.test(v)) throw new Error(`list-sql: ชื่อคอลัมน์ไม่ถูกต้อง ${v.slice(0, 40)}`);
  return v;
}
function alias(v: string): string {
  if (!ALIAS.test(v)) throw new Error("list-sql: alias ไม่ถูกต้อง");
  return v;
}

/** orderBy ของ Prisma (รูปที่ SORTS ของ CRM ใช้: `{ col: "asc" }` / `{ col: { sort, nulls } }`) → รายการคอลัมน์ */
export function sqlSortOf(orderBy: readonly Record<string, unknown>[]): SqlSortCol[] {
  const out: SqlSortCol[] = [];
  for (const o of orderBy) {
    const [[col, v]] = Object.entries(o) as [string, unknown][];
    if (v === "asc" || v === "desc") out.push({ col: ident(col), dir: v });
    else if (v && typeof v === "object") {
      const { sort, nulls } = v as { sort?: string; nulls?: string };
      if (sort !== "asc" && sort !== "desc") throw new Error("list-sql: orderBy ไม่รู้จัก");
      out.push({ col: ident(col), dir: sort, ...(nulls === "first" || nulls === "last" ? { nulls } : {}) });
    } else throw new Error("list-sql: orderBy ไม่รู้จัก");
  }
  return out;
}

/** ORDER BY แบบที่ Prisma เขียน (`"col" DESC` · `"col" ASC NULLS LAST`) */
export function orderBySql(a: string, sort: readonly SqlSortCol[]): Prisma.Sql {
  const A = alias(a);
  return Prisma.raw(sort.map((s) => `${A}."${ident(s.col)}" ${s.dir === "asc" ? "ASC" : "DESC"}${s.nulls ? ` NULLS ${s.nulls === "first" ? "FIRST" : "LAST"}` : ""}`).join(", "));
}

/**
 * เงื่อนไข cursor แบบ Prisma: แถวที่อยู่ "ตั้งแต่" แถว cursor ไปตามลำดับ (รวมแถว cursor — ผู้เรียกใส่ OFFSET 1 เท่ากับ skip: 1)
 * รองรับลำดับ 2 คอลัมน์ [คอลัมน์หลัก, id] (ทุก SORTS ของ CRM) — รูปอื่น = โยน (ไม่เดา)
 */
export function cursorSql(a: string, table: string, sort: readonly SqlSortCol[], cursorId: string): Prisma.Sql {
  const A = alias(a);
  if (!TABLE.test(table)) throw new Error("list-sql: ตารางไม่ถูกต้อง");
  if (sort.length !== 2 || sort[1]!.col !== "id") throw new Error("list-sql: cursor รองรับลำดับ [คอลัมน์, id] เท่านั้น");
  const [c, idc] = sort as [SqlSortCol, SqlSortCol];
  const col = Prisma.raw(`${A}."${ident(c.col)}"`);
  const id = Prisma.raw(`${A}."id"`);
  const cur = Prisma.sql`(SELECT x."${Prisma.raw(ident(c.col))}" FROM "${Prisma.raw(table)}" x WHERE x."id" = ${cursorId})`;
  const curId = Prisma.sql`(SELECT x."id" FROM "${Prisma.raw(table)}" x WHERE x."id" = ${cursorId})`;
  const op = Prisma.raw(c.dir === "desc" ? "<" : ">");
  const idOp = Prisma.raw(idc.dir === "desc" ? "<=" : ">=");
  if (c.nulls) {
    return Prisma.sql`(((${col} = ${cur} OR ${cur} IS NULL OR ${col} IS NULL) AND ${id} ${idOp} ${curId}) OR ((${col} ${op} ${cur} OR ${col} IS NULL OR ${cur} IS NULL)))`;
  }
  return Prisma.sql`((${col} = ${cur} AND ${id} ${idOp} ${curId}) OR (${col} ${op} ${cur}))`;
}

/** `contains` ของ Prisma: insensitive = `ILIKE ('%' || $ || '%')` · sensitive = `::text LIKE ('%' || $ || '%')` (ไม่ escape ตัวแทน — เหมือน Prisma) */
export function containsSql(a: string, col: string, value: string, insensitive: boolean): Prisma.Sql {
  const c = Prisma.raw(`${alias(a)}."${ident(col)}"`);
  return insensitive ? Prisma.sql`${c} ILIKE ('%' || ${value} || '%')` : Prisma.sql`${c}::text LIKE ('%' || ${value} || '%')`;
}

/** อ่านแถวเต็มจาก id ของหน้า (ลำดับตาม id ที่ส่งมา) */
export function inOrder<T extends { id: string }>(ids: readonly string[], rows: readonly T[]): T[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => by.get(id)).filter((r): r is T => !!r);
}

export const andSql = (parts: readonly Prisma.Sql[]): Prisma.Sql => (parts.length ? Prisma.sql`(${Prisma.join(parts, " AND ")})` : Prisma.sql`TRUE`);
export const orSql = (parts: readonly Prisma.Sql[]): Prisma.Sql => (parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : Prisma.sql`FALSE`);

/**
 * เทียบคอลัมน์ enum กับค่าเป็นชนิด enum ตรง ๆ (`= CAST($ AS "Enum")`) — ห้าม `::text` ในทางรายการ: นิพจน์ไม่มีสถิติ ⇒ planner เดา 0.5%
 * แล้วเลือกแผนผิด (วัดแล้ว C5.1-fix: ตัวกรอง 5 ตัว 360 ms → ใช้สถิติจริง) · ความหมายเท่ากัน (ค่าที่ผ่าน enumOrNull อยู่ในชนิดแล้ว)
 */
export function enumEqSql(a: string, col: string, enumType: string, value: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`${alias(a)}."${ident(col)}"`)} = CAST(${value} AS ${Prisma.raw(`"${ident(enumType)}"`)})`;
}
