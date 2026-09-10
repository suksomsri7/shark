// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST ระบบสมาชิก (M1.11)
//
// ตรรกะทั้งหมด (จับคู่ path · ด่านคีย์/ระบบ/เพดาน/สิทธิ์ · กันซ้ำ · confirm ของคำสั่งอันตราย · ซอง · audit)
// อยู่ที่แกนกลาง `src/lib/api/dispatch.ts` — ที่นี่แค่ผูกทะเบียนของระบบสมาชิกเข้ากับค่าตั้งของโมดูล
import { dispatch as coreDispatch } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import { MEMBER_OPS } from "./registry";
import { MEMBER_API_CONFIG } from "./config";

export async function dispatch(
  method: ApiMethod,
  req: Request,
  params: { path?: string[] },
): Promise<Response> {
  return coreDispatch(MEMBER_OPS, method, req, params, MEMBER_API_CONFIG);
}
