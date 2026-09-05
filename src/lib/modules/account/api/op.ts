// op.ts — ชนิดของ "หนึ่ง endpoint" ในทะเบียน API บัญชี (WO A3)
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
};

export type ApiOpTool = { name: string; risk?: "DESTRUCTIVE" };

export type ApiOp = {
  id: string;
  method: ApiMethod;
  /** template สัมพัทธ์กับ `/api/v1/account` เช่น `/documents/{id}/issue` */
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
  /** id ข้อสอบที่ครอบ op นี้ เช่น "CORE-2.1" */
  test: string;
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
