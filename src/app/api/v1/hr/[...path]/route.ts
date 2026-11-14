// /api/v1/hr/* — ประตูเดียวของ REST ระบบงานบุคคล (ใบ H4.8)
//
// catch-all: ทุก path ใต้ `/api/v1/hr` เข้ามาที่ไฟล์นี้ แล้วให้ทะเบียน op เป็นคนตัดสินว่ามี endpoint นั้นจริงไหม (404) · method ตรงไหม (405)
// 🔴 ไฟล์นี้ต้อง "บาง" เสมอ (กฎเดียวกับ /api/v1/pos/*): ตรรกะทั้งหมดอยู่ใน dispatch
import { dispatch } from "@/lib/modules/hr/api/dispatch";

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
