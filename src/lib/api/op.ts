// op.ts — ชนิดของ "หนึ่ง endpoint" ในทะเบียน API ของโมดูลใดก็ได้ (ยกเป็นของกลางตอน K1.15)
//
// แยกจาก `registry.ts` โดยตั้งใจ: ไฟล์ `ops/*.ts` ต้อง import `defineOp` จากที่นี่
// ถ้าเอาไว้ใน registry.ts จะเป็นวงกลม (registry → ops → registry) ซึ่งพังจริงเมื่อ
// ผู้เรียกบางรายเริ่มต้นที่ `ops/*` ก่อน (ACCOUNT_OPS ยังไม่ถูกกำหนดค่า → TDZ)

import type { ZodType } from "zod";
import type { ApiActor } from "./actor";

export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export const API_METHODS: readonly ApiMethod[] = ["GET", "POST", "PATCH", "PUT", "DELETE"];

/** read = อ่านอย่างเดียว · write = เปลี่ยนข้อมูล · danger = ย้อนกลับยาก (ต้อง confirm + reason) */
export type ApiOpKind = "read" | "write" | "danger";
/** ถังเพดานอัตรา — report แยกออกมาเพราะรายงานหนักกว่าการอ่านทั่วไปมาก */
export type ApiRateKind = "read" | "write" | "report";

export type ApiOpCtx<TInput> = {
  actor: ApiActor;
  /** ค่าที่จับได้จาก path template เช่น `/documents/{id}` → { id } */
  params: Record<string, string>;
  input: TInput;
  requestId: string;
  /**
   * ค่าใน header `Idempotency-Key` ของคำขอนี้ (write/danger เท่านั้น · read = null)
   * WO C2: บริการฝั่งการเงินมี "คีย์กันซ้ำ" ของตัวเองอีกชั้น (`recordPayments.keyBase`,
   * `recordGroupPayment.clientKey`) ซึ่งกันการบันทึกเงินซ้ำ **ในระดับรายการชำระ** ไม่ใช่ระดับคำขอ
   * ⇒ handler ต้องส่งค่าเดียวกันนี้ต่อลงไป ไม่งั้นการ retry ที่ผ่านด่านกันซ้ำของ API ไปแล้ว
   * (เช่นแถวกันซ้ำหมดอายุ 24 ชม.) จะสร้าง payment ใบที่สองเงียบ ๆ
   */
  idempotencyKey: string | null;
};

/**
 * op นี้เปิดเป็น "เครื่องมือ" ของสกิล AI `account` ด้วย (WO E1)
 * ชื่อต้องขึ้นต้นด้วยชื่อโมดูล (`account_` / `kanban_`) และ **คงที่ตลอดไป** (โมเดล/สกิลของลูกค้าอ้างชื่อนี้)
 * `hint` = ประโยคอังกฤษสั้น ๆ ต่อท้าย summary เพื่อบอกผู้ช่วยว่า "เมื่อไหร่ควรเรียกตัวนี้"
 */
export type ApiOpTool = { name: string; hint?: string; risk?: "DESTRUCTIVE" };

export type ApiOp = {
  id: string;
  /** โมดูลเจ้าของ op (`account` / `kanban`) — ทะเบียนแต่ละชุดเติมให้เองผ่าน `defineOp` ของโมดูล */
  module?: string;
  method: ApiMethod;
  /** template สัมพัทธ์กับ `/api/v1/<module>` เช่น `/documents/{id}/issue` */
  path: string;
  kind: ApiOpKind;
  /** permission key ของ RBAC ที่คีย์ต้องมี (ผ่าน IMPLIES ได้) */
  action: string;
  rate?: ApiRateKind;
  /** คำอธิบายภาษาอังกฤษ (คู่มือหลัก + OpenAPI) — ASCII ล้วน */
  summary: string;
  /** ป้ายภาษาไทย (หน้าจอ / สกิล AI ที่คุยไทย) */
  label: string;
  /** GET = query string · method อื่น = body · ควร `.strict()` เสมอ (กัน tenantId/systemId ปลอมจาก body) */
  input?: ZodType;
  output?: ZodType;
  /**
   * op นี้คืนซองแบ่งหน้า (`paged()` ของ respond.ts) ⇒ คำตอบ 200 มี `page` และอาจมีฟิลด์
   * ระดับบนสุดอื่น (เช่น `tabCounts`) — ธงนี้มีไว้ให้ OpenAPI/คู่มือบอกผู้เรียกได้ตรงความจริง
   */
  paged?: boolean;
  tool?: ApiOpTool;
  /**
   * ตัวเรนเดอร์ CSV (WO B3) — มีเฉพาะ op ที่ประกาศไว้ · dispatch เรียกก้อนนี้แทน JSON เมื่อ
   * `Accept` มี `text/csv` และ handler สำเร็จแล้ว (`data` = สิ่งที่ handler คืน หลังแกะซอง `paged()` ออก)
   * ทุกแถวต้องผ่าน `csvRow()` ของ `src/lib/core/csv.ts` (กัน CSV injection — บทเรียน 9.2) ·
   * คืนสตริงดิบ **ไม่ใส่ BOM เอง** — `dispatch.ts` เติม BOM + header ให้ที่เดียว
   */
  csv?: (ctx: ApiOpCtx<unknown>, data: unknown) => string | Promise<string>;
  /**
   * ขอบเขตของการกันซ้ำ (write/danger เท่านั้น · ค่าปริยาย `"request"`)
   *   `"request"` — คีย์ + **เนื้อคำขอ** ต้องเหมือนเดิมถึงจะตอบซ้ำ · เนื้อต่าง = 409 `idempotency_conflict`
   *                 (ค่าปริยายที่ถูกสำหรับคำสั่งที่ "ทำแล้วทำอีกได้ผลต่างกัน" เช่น บันทึกรับเงิน)
   *   `"key"`     — **คีย์อย่างเดียว** คือตัวระบุความพยายามครั้งนั้น เนื้อคำขอต่างกันก็ตอบของเดิม
   *
   * 🔴 ใช้ `"key"` เฉพาะเมื่อชั้นบริการ **นิยามความพยายามด้วยคีย์อยู่แล้ว** (M1.11: `createMember`
   *    ตรวจ `idempotencyKey` เป็นลำดับแรกก่อนซ้ำเบอร์/อีเมล — พิมพ์เขียว §5.2) ไม่งั้นสองชั้นจะขัดกัน:
   *    ฟอร์มสมัครสมาชิกที่เน็ตหลุดแล้วผู้ใช้กดส่งใหม่โดยกรอกไม่ครบเท่าเดิม จะได้ 409 ทั้งที่ระบบ
   *    ตั้งใจให้ "คีย์เดิม = คนเดิม" ⇒ ผู้เชื่อมต่อเลือกได้แค่ยิงคีย์ใหม่ ซึ่งสร้างสมาชิกซ้ำจริง ๆ
   */
  idempotency?: "request" | "key";
  /** id ข้อสอบที่ครอบ op นี้ เช่น "CORE-2.1" */
  test: string;
  /**
   * action ที่ลง `AuditLog.action` (ไม่ระบุ = `action` ของ op)
   * บอร์ดงานใช้ค่านี้เพื่อให้ประวัติอ่านออกว่า "op ไหน" ไม่ใช่แค่ "คีย์สิทธิ์ไหน"
   * (คีย์สิทธิ์ 1 ตัวครอบหลาย op เช่น `kanban.card.delete` = เก็บการ์ด/เก็บบอร์ด/เก็บคอลัมน์)
   */
  auditAction?: string;
  /**
   * เป้าหมายที่ลง `AuditLog.targetType/targetId` (ไม่ระบุ = `ApiOp` + id ของ op เหมือนเดิม)
   *
   * 🔴 ทำไมต้องมี (M1.11): โมดูลที่ประวัติผูกกับ "ของชิ้นหนึ่ง" (สมาชิกคนหนึ่ง · เอกสารใบหนึ่ง)
   *    ต้องเปิดประวัติของชิ้นนั้นแล้วเห็นครบว่าใครแตะบ้าง — ถ้าแถวที่มาจาก REST ชี้ไปที่ "ชื่อ op"
   *    แทนที่จะชี้ไปที่สมาชิก เจ้าของร้านจะเปิดประวัติของลูกค้าแล้วไม่เห็นการแก้ที่มาจากแอปคู่ค้าเลย
   *    (ชื่อ op ไม่หายไปไหน: ยังอยู่ใน `action` = `auditAction` และใน `after.opId`)
   * คืน `null` = ไม่รู้เป้าหมายรอบนี้ → ใช้ค่าปริยาย
   */
  auditTarget?: (a: { params: Record<string, string>; input: unknown; data: unknown }) => { targetType: string; targetId: string } | null;
  handler: (ctx: ApiOpCtx<unknown>) => Promise<unknown>;
};

type OpDefinition<S extends ZodType | undefined> = Omit<ApiOp, "input" | "handler"> & {
  input?: S;
  handler: (ctx: ApiOpCtx<S extends ZodType ? S["_output"] : unknown>) => Promise<unknown>;
};

/**
 * ประกาศ op โดยให้ TypeScript รู้ชนิดของ `input` จาก zod schema ที่ให้มา
 * (cast ครั้งเดียวที่นี่ — handler ทุกตัวจึงเขียนแบบมีชนิดจริงได้ ไม่ต้อง cast รายไฟล์)
 */
export function defineOp<S extends ZodType | undefined = undefined>(def: OpDefinition<S>): ApiOp {
  return { ...def, input: def.input, handler: def.handler as unknown as ApiOp["handler"] };
}

/** ถังเพดานอัตราของ op — ไม่ระบุ = read → read · write/danger → write */
export function rateKindOf(op: ApiOp): ApiRateKind {
  return op.rate ?? (op.kind === "read" ? "read" : "write");
}
