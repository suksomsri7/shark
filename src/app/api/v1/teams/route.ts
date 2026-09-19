// /api/v1/teams — หน้าแรกของ REST ทีมขาย (R-C.7 · ใบ C1.10) — `[...path]` ไม่รับ path ว่าง จึงต้องมีไฟล์นี้คู่กัน
// ส่งต่อเข้าประตูเดียวกับ `/api/v1/teams/*` (ไม่มีตรรกะของตัวเอง)
import { crmApi } from "@/lib/modules/crm";


export async function GET(req: Request): Promise<Response> {
  return crmApi.dispatchTeams("GET", req, { path: [] });
}
export async function POST(req: Request): Promise<Response> {
  return crmApi.dispatchTeams("POST", req, { path: [] });
}
