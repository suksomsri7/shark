// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST บอร์ดงาน (K1.15)
//
// ตรรกะทั้งหมด (จับคู่ path · ด่านคีย์/ระบบ/เพดาน/สิทธิ์ · กันซ้ำ · confirm ของคำสั่งอันตราย · ซอง · audit)
// อยู่ที่แกนกลาง `src/lib/api/dispatch.ts` — ที่นี่แค่ผูกทะเบียนของบอร์ดงานเข้ากับค่าตั้งของโมดูล
import { dispatch as coreDispatch } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import { KANBAN_OPS } from "./registry";
import { KANBAN_API_CONFIG } from "./config";

export async function dispatch(
  method: ApiMethod,
  req: Request,
  params: { path?: string[] },
): Promise<Response> {
  return coreDispatch(KANBAN_OPS, method, req, params, KANBAN_API_CONFIG);
}
