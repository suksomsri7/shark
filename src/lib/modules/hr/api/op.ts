// op.ts — ประกาศ op ของ API ระบบงานบุคคล (ใบ H4.8 · brief D1 · แบบ pos/api/op.ts)
//
// ห่อ `defineOp` ของแกนกลางชั้นเดียวเพื่อเติมของที่ทุก op ของ HR ต้องมีเหมือนกัน:
//   `module: "hr"` · `auditAction: "hr.api.<id>"` (ย้อนอ่านประวัติได้ว่า op ไหน) · ไม่มี op ไหนประกาศ `tool` (เครื่องมือ AI ของ HR = H4.3)
//   ด่านผู้ออกคีย์ (มติ Q2): ก่อน handler ทุกตัว ผู้ออกคีย์ต้องยังเป็นเจ้าของร้าน — ไม่ใช่ = 403 forbidden ไม่เขียนอะไร
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม)
import { z, type ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";
import { assertHrIssuer } from "./actor";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

type HrOpDefinition<S extends ZodType | undefined> = Omit<Parameters<typeof defineOp<S>>[0], "module" | "auditAction" | "tool">;

/** ประกาศ op ของ HR (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกนกลาง) */
export function defineHrOp<S extends ZodType | undefined = undefined>(def: HrOpDefinition<S>): ApiOp {
  const inner = def.handler;
  return defineOp<S>({
    ...def,
    module: "hr",
    auditAction: `hr.api.${def.id}`,
    handler: async (ctx) => {
      await assertHrIssuer(ctx.actor);
      return inner(ctx);
    },
  });
}

/** ctx ของ handler ที่รู้ชนิด input แล้ว */
export type HrOpCtx<T> = ApiOpCtx<T>;

// ── ช่องวันที่ของทุก op (มติรอบแก้ ข้อ 3): ต้องเป็นวันที่มีจริงในปฏิทิน ปี 2000–2600 — ไม่มีทางไปถึง "ค่าปริยาย = วันนี้" ของตัวอ่าน ──
const YEAR_MIN = 2000;
const YEAR_MAX = 2600;
/** "YYYY-MM-DD" ที่มีจริง (2026-02-31 · 2026-06-31 · 0000-00-00 = ไม่ใช่) */
export function isRealDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < YEAR_MIN || y > YEAR_MAX || mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
/** "YYYY-MM" ที่มีจริง */
export const isRealMonth = (v: string): boolean => isRealDay(`${v}-01`) && /^\d{4}-\d{2}$/.test(v);
/** "YYYY" · "YYYY-MM" · "YYYY-MM-DD" ที่มีจริง (ช่วงของรายงาน — ชนิดที่ตรงกับรายงานตรวจต่อที่ตัวอ่าน) */
export const isRealPeriod = (v: string): boolean => (/^\d{4}$/.test(v) ? isRealDay(`${v}-01-01`) : /^\d{4}-\d{2}$/.test(v) ? isRealMonth(v) : isRealDay(v));
export const HR_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDay, { message: "วันที่ไม่มีอยู่จริงในปฏิทิน (YYYY-MM-DD)" });
export const HR_MONTH = z.string().regex(/^\d{4}-\d{2}$/).refine(isRealMonth, { message: "เดือนไม่ถูกต้อง (YYYY-MM)" });
export const HR_PERIOD = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).refine(isRealPeriod, { message: "ช่วงเวลาไม่ถูกต้อง (YYYY หรือ YYYY-MM)" });
