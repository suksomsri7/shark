// op.ts — ประกาศ op ของ API ระบบงานบุคคล (ใบ H4.8 · brief D1 · แบบ pos/api/op.ts)
//
// ห่อ `defineOp` ของแกนกลางชั้นเดียวเพื่อเติมของที่ทุก op ของ HR ต้องมีเหมือนกัน:
//   `module: "hr"` · `auditAction: "hr.api.<id>"` (ย้อนอ่านประวัติได้ว่า op ไหน) · ไม่มี op ไหนประกาศ `tool` (เครื่องมือ AI ของ HR = H4.3)
//   ด่านผู้ออกคีย์ (มติ Q2): ก่อน handler ทุกตัว ผู้ออกคีย์ต้องยังเป็นเจ้าของร้าน — ไม่ใช่ = 403 forbidden ไม่เขียนอะไร
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม)
import type { ZodType } from "zod";
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
