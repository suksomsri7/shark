// room-cards.ts — การ์ด agenda/รายการเตือน ในห้องเลขา (calendar_b · review b B1 · M4)
//   เครื่องมือ calendar_agenda/calendar_list ไม่ส่งรายละเอียดเข้าข้อความของโมเดล (ห้องเลขา OWNER/สมาชิกห้องอ่านได้)
//   ⇒ บันทึกแค่ "ช่วงวัน" ที่ผู้ใช้ถาม · แอปวาดการ์ดด้วย GET calendar/agenda (หรือ calendar/items) ของผู้ดูเอง
//   🔴 M3: userId = actor เสมอ · แนบใน GET rooms/[id] เฉพาะ userId = ผู้ดู (แบบ roomReminders R-CAL-20)
import { tenantDb } from "@/lib/core/db";
import type { CalActor } from "./items";

// Q8 ▸ "TRAVEL" = การ์ดเผื่อเวลาเดินทางของวันนั้น (สัญญา §16.5 · แอปวาดด้วย GET calendar/travel?day= ของผู้ดู) ◂
export type CalRoomCardKind = "AGENDA" | "LIST" | "TRAVEL";
export type CalRoomCardDto = { id: string; kind: CalRoomCardKind; fromDay: string; toDay: string; createdAt: string };
const kindOf = (k: string): CalRoomCardKind => (k === "LIST" || k === "TRAVEL" ? k : "AGENDA");
export const ROOM_CARD_MAX = 100;

export async function addRoomCard(actor: CalActor, roomId: string, card: { kind: CalRoomCardKind; fromDay: string; toDay: string }): Promise<CalRoomCardDto> {
  const r = await tenantDb({ tenantId: actor.tenantId }).calRoomCard.create({ data: { userId: actor.userId, tenantId: actor.tenantId, roomId, ...card } });
  return { id: r.id, kind: kindOf(r.kind), fromDay: r.fromDay, toDay: r.toDay, createdAt: r.createdAt.toISOString() };
}

/** การ์ดของผู้ดูในห้องนี้ (ผู้อื่นในห้องไม่ได้) */
export async function roomCards(actor: CalActor, roomId: string): Promise<CalRoomCardDto[]> {
  const rows = await tenantDb({ tenantId: actor.tenantId }).calRoomCard.findMany({
    where: { userId: actor.userId, tenantId: actor.tenantId, roomId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: ROOM_CARD_MAX,
  });
  return rows.map((r) => ({ id: r.id, kind: kindOf(r.kind), fromDay: r.fromDay, toDay: r.toDay, createdAt: r.createdAt.toISOString() }));
}
