// dispatch.ts — เส้นทางเดียวของทุกคำขอ REST ระบบขายหน้าร้าน (ใบ P2.13)
//
// ตรรกะทั้งหมด (จับคู่ path · ด่านคีย์/ระบบ/เพดาน/สิทธิ์ · กันซ้ำ · confirm ของคำสั่งอันตราย · ซอง · audit · CSV)
// อยู่ที่แกนกลาง `src/lib/api/dispatch.ts` — ที่นี่แค่ผูกทะเบียนของ POS เข้ากับค่าตั้งของโมดูล
import { dispatch as coreDispatch } from "@/lib/api/dispatch";
import type { ApiMethod } from "@/lib/api/op";
import { POS_API_CONFIG } from "./config";
import { POS_OPS } from "./registry";

export async function dispatch(method: ApiMethod, req: Request, params: { path?: string[] }): Promise<Response> {
  return coreDispatch(POS_OPS, method, req, params, POS_API_CONFIG);
}
