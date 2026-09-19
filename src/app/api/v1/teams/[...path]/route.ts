// /api/v1/teams/* — REST ทีมขาย (RESOLUTIONS R-C.7 · ใบ C1.10)
//
// 🔴 ไม่มี dispatcher ตัวที่สอง: ส่งต่อเข้าทะเบียน/ประตูเดียวกับ `/api/v1/crm/*` (`crm/api` dispatchTeams)
//    — คีย์ต้องผูกระบบ CRM (ทีมเป็นของทั้งร้าน แต่สิทธิ์ `crm.team.manage` เป็นของ CRM) · ประตู uiVersion ใช้เหมือนกัน
// 🔴 เข้าทาง facade เท่านั้น (fitness F2.3 จงใจไม่ยกเว้น route R-C.7 นี้) — ทะเบียนเดียวกับ REST CRM: crm/api registry + dispatch ของแกน
import { crmApi } from "@/lib/modules/crm";


type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return crmApi.dispatchTeams("GET", req, await ctx.params);
}
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return crmApi.dispatchTeams("POST", req, await ctx.params);
}
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return crmApi.dispatchTeams("PATCH", req, await ctx.params);
}
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return crmApi.dispatchTeams("PUT", req, await ctx.params);
}
export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  return crmApi.dispatchTeams("DELETE", req, await ctx.params);
}
