// /api/mobile/secretary/calendar/google — สถานะ/ตั้งค่า/ยกเลิกเชื่อม Google Calendar (จอ 8 · 9) · CAL1.8 · สัญญา §8 · §10
//   GET = GoogleLinkDto (ไม่เชื่อม = { status: "NONE" }) · PUT = ปฏิทินที่ดึง/ชนิดส่งออก/ปลายทาง · DELETE = ยกเลิกเชื่อม (ลบแคชทันที · ไม่เชื่อม = 200)
//   🔴 token ไม่อยู่ใน DTO · userId จากโทเค็นเท่านั้น
import { after } from "next/server";
import { z } from "zod";
import { disconnectGoogle, googleStatus, syncGoogle, updateGoogle } from "@/lib/modules/calendar/google";
import { ok, readBody, withErrors } from "../../_shared";
import { gGate, gThrown } from "./_g";

async function GET_(req: Request) {
  const g = await gGate(req, "get", 60);
  if (!g.ok) return g.res;
  try {
    return ok((await googleStatus(g.userId)) ?? { status: "NONE" });
  } catch (e) {
    return gThrown(e, "calendar/google GET");
  }
}

const putBody = z
  .object({
    calendars: z.array(z.object({ id: z.string().min(1).max(300), import: z.boolean() }).strict()).max(50).optional(),
    exportKinds: z.array(z.enum(["EVENT", "REMINDER", "BOOKING"])).max(3).optional(),
    exportCalendarId: z.string().min(1).max(300).nullable().optional(),
  })
  .strict();

async function PUT_(req: Request) {
  const g = await gGate(req, "put", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, putBody);
  if (!b.ok) return b.res;
  try {
    const dto = await updateGoogle(g.userId, b.v);
    // calendar_b ▸ review b m7: ลบ/ย้าย/ส่งสำเนาทำในรอบซิงก์ (ไม่ใช่ใน request) — เริ่มรอบทันทีหลังตอบ ◂
    if (dto.status === "ACTIVE") after(() => syncGoogle(g.userId, { reason: "open" }).catch(() => undefined));
    return ok(dto);
  } catch (e) {
    return gThrown(e, "calendar/google PUT");
  }
}

async function DELETE_(req: Request) {
  const g = await gGate(req, "delete", 5);
  if (!g.ok) return g.res;
  try {
    return ok(await disconnectGoogle(g.userId));
  } catch (e) {
    return gThrown(e, "calendar/google DELETE");
  }
}

export const GET = withErrors("secretary/calendar/google GET", GET_);
export const PUT = withErrors("secretary/calendar/google PUT", PUT_);
export const DELETE = withErrors("secretary/calendar/google DELETE", DELETE_);
