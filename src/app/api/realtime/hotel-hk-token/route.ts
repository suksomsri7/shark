import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { ablyIssueToken } from "@/lib/realtime/ably";
import { hotelHkChannel, realtimeMode } from "@/lib/realtime";

// GET /api/realtime/hotel-hk-token?unitId=… — ออก token ให้เบราว์เซอร์ฟังช่องบอร์ดแม่บ้านของ "หน่วยโรงแรมเดียว" (SVC H.6 · แบบ kanban-token)
//
// ═══ 🔴 กติกาความปลอดภัย (เหมือนเส้นบอร์ดงาน/แชท) ═══
//  1. กุญแจจริงไม่ออกจากเซิร์ฟเวอร์ — ส่งได้แค่ token อายุสั้นที่จำกัด capability ช่องเดียว subscribe อย่างเดียว
//  2. ร้านจาก session เท่านั้น (requireTenant) · หน่วยต้องเป็น "HOTEL" ของร้านนี้ (ไม่พบ/ร้านอื่น ⇒ 404)
//  3. ด่านสิทธิ์แม่บ้านของหน่วย (hotel.housekeeping ผ่าน evaluate · OWNER/MANAGER ตามกติกา rbac) ⇒ ไม่ผ่าน 403
//  4. ชื่อช่องประกอบที่เซิร์ฟเวอร์ (มี tenantId) — ไม่รับชื่อช่อง/สิทธิ์จาก query
// ⚠️ ไม่มี ABLY_API_KEY ⇒ 200 {mode:"polling"} (ไม่ใช่ error) · จอ poll ทุก 15 วิ เอง

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(req: Request) {
  const unitId = new URL(req.url).searchParams.get("unitId")?.trim() ?? "";
  if (!unitId) {
    return NextResponse.json({ mode: "polling", reason: "ไม่ได้ระบุโรงแรมที่จะเชื่อม" }, { status: 400, headers: NO_STORE });
  }

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!unit || !canAccessUnit(m, unit.id)) {
    return NextResponse.json({ mode: "polling", reason: "ไม่พบโรงแรมนี้" }, { status: 404, headers: NO_STORE });
  }
  // 🔴 ด่านสิทธิ์แม่บ้าน — ก่อนออก token เสมอ
  if (!evaluate(m, { module: "hotel", action: "hotel.housekeeping", unitId: unit.id })) {
    return NextResponse.json({ mode: "polling", reason: "ไม่มีสิทธิ์ดูบอร์ดแม่บ้าน" }, { status: 403, headers: NO_STORE });
  }

  if (realtimeMode() !== "realtime") {
    return NextResponse.json({ mode: "polling" }, { headers: NO_STORE });
  }

  const channel = hotelHkChannel(tenantId, unit.id);
  let token: unknown = null;
  try {
    token = await ablyIssueToken(channel, auth.user.id);
  } catch {
    token = null;
  }
  // ผู้ให้บริการล่ม/โควตาหมด = ตกกลับ polling เงียบ ๆ
  if (!token) {
    return NextResponse.json({ mode: "polling" }, { headers: NO_STORE });
  }
  return NextResponse.json({ mode: "realtime", channel, token }, { headers: NO_STORE });
}
