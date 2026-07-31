// GET /api/mobile/usage + Bearer + X-Tenant-Id → โควตาผู้ช่วย AI ของกิจการนั้น (Phase 4)
// ยุบ 2 ชั้น (หน้าต่าง 5 ชม./สัปดาห์) เหลือชั้นที่ใกล้เต็มที่สุดให้แอปโชว์แถบเดียว — ตรรกะเดียวกับเว็บ
import { requireMobile, mobileError } from "@/lib/mobile/auth";
import { getQuotaStatus } from "@/lib/ai/usage";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);

  const q = await getQuotaStatus(g.ctx);
  const useWeek = q.week.pct > q.session.pct;
  const layer = useWeek ? q.week : q.session;
  return Response.json(
    {
      scope: useWeek ? "week" : "session",
      used: layer.used,
      limit: layer.limit,
      pct: Math.round(layer.pct * 100),
      warn: q.warn,
      degraded: q.degraded,
      blocked: q.blocked,
      resetAt: layer.resetAt.toISOString(),
    },
    { status: 200 },
  );
}
