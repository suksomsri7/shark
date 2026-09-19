// /api/v1/crm/* — ประตูเดียวของ REST CRM (ใบ C1.10)
//
// catch-all: ทุก path ใต้ `/api/v1/crm` เข้ามาที่ไฟล์นี้ แล้วให้ทะเบียน op ตัดสินว่ามี endpoint นั้นจริงไหม (404) · method ตรงไหม (405)
// 🔴 ไฟล์นี้ต้อง "บาง" เสมอ (กฎเดียวกับ /api/v1/member/* · /api/v1/account/* · /api/v1/kanban/*):
//    ตรรกะทั้งหมดอยู่ใน dispatch ของแกนกลาง (`src/lib/api/dispatch.ts`) ผ่าน `crm/api/dispatch`
// 🔴 เข้าทาง facade เท่านั้น (fitness F2.3) — `crmApi.dispatch` = ห่อ dispatch ของแกนด้วยทะเบียน CRM_OPS + CRM_API_CONFIG
import { crmApi } from "@/lib/modules/crm";

const { dispatch } = crmApi;

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
