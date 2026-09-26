// POST /api/mobile/crm/tasks/[id]/complete[?systemId=] — ติ๊กงานเสร็จ (ใบ C3.7 · ภาพ 13 ค)
// บริการกิจกรรมตัวเดียวกับหน้าเว็บ (`activities.completeActivity`): มองไม่เห็น = 404 · ไม่มีคีย์ crm.activity.complete = 403 ·
// ปิดแล้วอยู่ก่อน = สำเร็จเฉย ๆ (กดซ้ำไม่เกิดอะไรเพิ่ม)
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, runMobileCrm } from "@/lib/mobile/crm-routes";
import { mobile as crmMobile } from "@/lib/modules/crm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  const { id } = await params;
  return runMobileCrm(req, g, (s) => crmMobile.completeTask(s.ctx, s.actor, id));
}
