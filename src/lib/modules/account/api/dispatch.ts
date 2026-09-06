// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST บัญชี (WO A3 · แกนย้ายไป `src/lib/api/dispatch.ts` ตอน K1.15)
//
// route file ยังเรียก `dispatch(method, req, params)` เหมือนเดิม — ที่นี่แค่ผูกทะเบียนบัญชี
// กับค่าตั้งของโมดูลบัญชีเข้ากับแกนกลาง (บอร์ดงานทำแบบเดียวกันที่ `modules/kanban/api/dispatch.ts`)
import { dispatch as coreDispatch } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import { ACCOUNT_OPS } from "./registry";
import { ACCOUNT_API_CONFIG } from "./require";

export async function dispatch(
  method: ApiMethod,
  req: Request,
  params: { path?: string[] },
): Promise<Response> {
  return coreDispatch(ACCOUNT_OPS, method, req, params, ACCOUNT_API_CONFIG);
}
