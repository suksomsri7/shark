import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/db";
import { requireChatRead } from "@/lib/modules/chat/guard";
import { ablyIssueToken } from "@/lib/realtime/ably";
import { chatChannel, realtimeMode } from "@/lib/realtime";

// GET /api/realtime/token?systemId=… — ออก token ให้เบราว์เซอร์ต่อ realtime (WO-CV9)
//
// ═══ 🔴 กติกาความปลอดภัยของเส้นนี้ ═══
//  1. **กุญแจจริงห้ามออกจากเซิร์ฟเวอร์** — กุญแจของร้านเขียนได้ทุกช่องของทุกร้าน
//     สิ่งที่ส่งให้เบราว์เซอร์คือ token อายุสั้นที่ถูกจำกัดสิทธิ์ไว้แล้ว
//  2. **ผ่านด่านสิทธิ์ก่อนเสมอ** (`requireChatRead()`) — ด่านตัวเดียวกับที่กล่องแชทใช้
//     คนที่ไม่มีสิทธิ์อ่านแชทต้องขอ token ไม่ได้ ไม่งั้นเขาจะรู้ว่า "ห้องไหนมีของใหม่เมื่อไหร่"
//     ซึ่งเป็นข้อมูลของลูกค้าเหมือนกัน
//  3. **capability ผูกกับช่องของร้าน+ระบบตัวเองช่องเดียว และ subscribe อย่างเดียว**
//     · ช่องอื่น = ปฏิเสธที่ฝั่งผู้ให้บริการ (ต่อให้ปลอมชื่อช่องในเบราว์เซอร์ก็ไม่ผ่าน)
//     · ไม่ให้ publish เพราะทุกสัญญาณต้องเกิดหลังเซิร์ฟเวอร์บันทึกข้อมูลสำเร็จเท่านั้น
//  4. `systemId` ต้องเป็นระบบของร้านนี้จริง — ไม่งั้นจะขอ token ของ id ที่เดาขึ้นมาได้
//
// ⚠️ ยังไม่มีกุญแจ (สภาพวันนี้ · §8 ของแผน) → ตอบ 200 พร้อม `mode:"polling"`
//    **ไม่ใช่ error** เพราะนี่ไม่ใช่ความผิดพลาด — ระบบทำงานด้วย polling ได้ครบอยู่แล้ว
//    ฝั่งจอเห็นค่านี้แล้วเงียบไปเฉย ๆ ไม่ลองใหม่รัว ๆ

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const systemId = new URL(req.url).searchParams.get("systemId")?.trim() ?? "";
  if (!systemId) {
    return NextResponse.json({ mode: "polling", reason: "ไม่ได้ระบุระบบที่จะเชื่อม" }, { status: 400 });
  }

  // 🔴 ด่านสิทธิ์ก่อนแตะข้อมูลใด ๆ — ห้ามสลับลำดับกับการอ่าน DB
  const auth = await requireChatRead();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "CHAT" },
    select: { id: true },
  });
  if (!sys) {
    return NextResponse.json({ mode: "polling", reason: "ไม่พบระบบแชทนี้ในร้าน" }, { status: 404 });
  }

  if (realtimeMode() !== "realtime") {
    return NextResponse.json({ mode: "polling" }, { headers: { "cache-control": "no-store" } });
  }

  const channel = chatChannel(tenantId, systemId);
  let token: unknown = null;
  try {
    token = await ablyIssueToken(channel, auth.user.id);
  } catch {
    token = null;
  }
  if (!token) {
    // ผู้ให้บริการล่ม/โควตาหมด = ตกกลับ polling เงียบ ๆ (ไม่ใช่หน้าจอพัง)
    return NextResponse.json({ mode: "polling" }, { headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    { mode: "realtime", channel, token },
    { headers: { "cache-control": "no-store" } },
  );
}
