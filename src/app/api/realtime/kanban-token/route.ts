import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { KanbanNotFoundError } from "@/lib/modules/kanban/access";
import { assertBoardRole } from "@/lib/modules/kanban/members";
import { kanbanChannel } from "@/lib/modules/kanban/realtime";
import { ablyIssueToken } from "@/lib/realtime/ably";
import { realtimeMode } from "@/lib/realtime";

// GET /api/realtime/kanban-token?boardId=… — ออก token ให้เบราว์เซอร์ฟังช่องของ "บอร์ดใบเดียว" (K1.14)
//
// ═══ 🔴 กติกาความปลอดภัยของเส้นนี้ (เหมือนเส้นของแชท WO-CV9) ═══
//  1. **กุญแจจริงห้ามออกจากเซิร์ฟเวอร์** — ส่งได้แค่ token อายุสั้นที่ถูกจำกัด capability แล้ว
//  2. **ผ่านด่านสิทธิ์บอร์ดก่อนเสมอ** (`assertBoardRole(… "VIEWER")`) — ด่านตัวเดียวกับที่หน้าบอร์ดใช้
//     คนที่มองบอร์ดไม่เห็นต้องขอ token ไม่ได้ ไม่งั้นเขาจะรู้ว่า "บอร์ดไหนมีการเคลื่อนไหวเมื่อไหร่"
//     ซึ่งเป็นข้อมูลของทีมเหมือนกัน · บอร์ดที่มองไม่เห็น = 404 ไม่ใช่ 403 (§6.3)
//  3. **capability ผูกกับช่องของบอร์ดใบนั้นช่องเดียว และ subscribe อย่างเดียว**
//     ปลอมชื่อช่องในเบราว์เซอร์ก็ไม่ผ่านที่ฝั่งผู้ให้บริการ · ไม่ให้ publish เพราะทุกสัญญาณ
//     ต้องเกิดหลังเซิร์ฟเวอร์บันทึกข้อมูลสำเร็จเท่านั้น
//  4. `systemId` ต้องเป็นระบบ KANBAN ของร้านนี้จริง (อ่านจากตัวบอร์ดเอง ไม่รับจาก query)
//
// ⚠️ ยังไม่มี `ABLY_API_KEY` (สภาพวันนี้) → ตอบ 200 พร้อม `mode:"polling"` — **ไม่ใช่ error**
//    หน้าบอร์ดทำงานครบด้วยรอบ poll 5 วิ อยู่แล้ว (ดู `useBoardLive.ts`)

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const boardId = new URL(req.url).searchParams.get("boardId")?.trim() ?? "";
  if (!boardId) {
    return NextResponse.json({ mode: "polling", reason: "ไม่ได้ระบุบอร์ดที่จะเชื่อม" }, { status: 400 });
  }

  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  // หา systemId จากตัวบอร์ดเอง (ไม่รับจาก query — ไม่งั้นเดา id ระบบอื่นมาปนได้)
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId },
    select: { id: true, systemId: true },
  });
  if (!board) {
    return NextResponse.json({ mode: "polling", reason: "ไม่พบบอร์ดนี้" }, { status: 404 });
  }

  // 🔴 ด่านสิทธิ์บอร์ด (ชั้นที่ 2 ของ §6.6) — ต้องอยู่ก่อนออก token เสมอ
  try {
    await assertBoardRole(
      { tenantId, systemId: board.systemId, actorUserId: auth.user.id },
      board.id,
      "VIEWER",
    );
  } catch (e) {
    if (e instanceof KanbanNotFoundError) {
      return NextResponse.json({ mode: "polling", reason: "ไม่พบบอร์ดนี้" }, { status: 404 });
    }
    return NextResponse.json({ mode: "polling", reason: "ไม่มีสิทธิ์ดูบอร์ดนี้" }, { status: 403 });
  }

  if (realtimeMode() !== "realtime") {
    return NextResponse.json({ mode: "polling" }, { headers: { "cache-control": "no-store" } });
  }

  const channel = kanbanChannel(tenantId, board.id);
  let token: unknown = null;
  try {
    token = await ablyIssueToken(channel, auth.user.id);
  } catch {
    token = null;
  }
  // ผู้ให้บริการล่ม/โควตาหมด = ตกกลับ polling เงียบ ๆ (ไม่ใช่หน้าจอพัง)
  if (!token) {
    return NextResponse.json({ mode: "polling" }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    { mode: "realtime", channel, token },
    { headers: { "cache-control": "no-store" } },
  );
}
