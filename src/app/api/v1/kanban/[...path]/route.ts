// /api/v1/kanban/* — ประตูเดียวของ REST บอร์ดงาน (K1.15 · D15)
//
// catch-all: ทุก path ใต้ `/api/v1/kanban` เข้ามาที่ไฟล์นี้ แล้วให้ทะเบียน op เป็นคนตัดสินว่า
// มี endpoint นั้นจริงไหม (404) · method ตรงไหม (405) — ไม่ต้องสร้าง route file ต่อ endpoint
//
// 🔴 ไฟล์นี้ต้อง "บาง" เสมอ (กฎเดียวกับ /api/v1/account/*): ตรรกะทั้งหมดอยู่ใน dispatch ของแกนกลาง
import { dispatch } from "@/lib/modules/kanban/api/dispatch";

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
