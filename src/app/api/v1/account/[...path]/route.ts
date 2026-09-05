// /api/v1/account/* — ประตูเดียวของ REST บัญชี (WO A3)
//
// catch-all: ทุก path ใต้ `/api/v1/account` เข้ามาที่ไฟล์นี้ แล้วให้ทะเบียน op เป็นคนตัดสินว่า
// มี endpoint นั้นจริงไหม (404) · method ตรงไหม (405) — ไม่ต้องสร้าง route file ต่อ endpoint
//
// 🔴 ไฟล์นี้ต้อง "บาง" เสมอ (กฎเหล็กเดียวกับ /api/v1/chat/*): ตรรกะทั้งหมดอยู่ใน dispatch.ts
//    ไม่งั้นวันที่มี 200 endpoint จะมี 200 สำเนาของการตรวจสิทธิ์/กันซ้ำ/audit ที่หลุดกันคนละแบบ
import { dispatch } from "@/lib/modules/account/api/dispatch";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return dispatch("GET", req, await ctx.params);
}
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return dispatch("POST", req, await ctx.params);
}
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return dispatch("PATCH", req, await ctx.params);
}
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return dispatch("PUT", req, await ctx.params);
}
export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return dispatch("DELETE", req, await ctx.params);
}
