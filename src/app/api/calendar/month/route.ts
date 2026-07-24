// GET /api/calendar/month?ym=YYYY-MM — ข้อมูลปฏิทินรายเดือนเป็น JSON (ให้ widget หน้าแรกเปลี่ยนเดือนแบบไม่ refresh)
// auth ผ่าน cookie เดิม (getAuth) — ไม่มีสิทธิ์ = 401 JSON (ห้าม redirect: fetch ฝั่ง client อ่านไม่ได้)
import { getAuth } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as calendar from "@/lib/modules/calendar/service";

const pad = (n: number) => String(n).padStart(2, "0");

export async function GET(req: Request): Promise<Response> {
  const auth = await getAuth();
  if (!auth?.active) return Response.json({ error: "unauthorized" }, { status: 401 });
  const membership = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  try {
    assertCan(membership, { module: "calendar", action: "calendar.event.read" });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const m = /^(\d{4})-(\d{2})$/.exec(new URL(req.url).searchParams.get("ym") ?? "");
  if (!m) return Response.json({ error: "bad_ym" }, { status: 400 });
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return Response.json({ error: "bad_ym" }, { status: 400 });
  const from = new Date(`${year}-${pad(month)}-01T00:00:00+07:00`);
  const nextYm = month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
  const to = new Date(`${nextYm}-01T00:00:00+07:00`);
  const events = await calendar.getCalendarEvents(
    { tenantId: auth.active.tenantId, membership },
    { from, to },
  );
  return Response.json({
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      start: new Date(e.startAt).toISOString(),
      end: new Date(e.endAt).toISOString(),
      status: e.status,
    })),
  });
}
