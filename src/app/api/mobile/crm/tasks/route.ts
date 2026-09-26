// GET /api/mobile/crm/tasks[?systemId=] — "งานวันนี้" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ค)
// งานค้างของผู้ใช้คนนี้ที่ครบกำหนดภายในวันไทยนี้ (รวมเลยกำหนด) + งานที่ปิดวันนี้ · ตัวนับ วันนี้/เลยกำหนด/เสร็จแล้ว
// ผล: { items: [{ id, title, type, dueAt, done, contactId, dealId, context }], counts: { today, overdue, done } } — ไม่มีเบอร์/อีเมล
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { mobile as crmMobile } from "@/lib/modules/crm";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  return runMobileCrm(req, g, (s) => crmMobile.todayTasks(s.ctx, s.actor));
}
