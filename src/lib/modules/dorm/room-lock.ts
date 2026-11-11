// SVC D.15-K M2 ▸ ล็อกแถวห้อง (HotelRoom) ของหอ — กัน race "ปิดห้อง ∥ ทำสัญญา/ย้ายเข้า"
//   • ทางที่ "ใส่ของลงห้อง" (createLease · transferRoom — renewLease ไม่ล็อก: ห้องเดิมมีสัญญา ACTIVE ⇒ ทางปิดตอบ IN_USE อยู่แล้ว · import.ts ยังไม่ล็อก = หนี้) = FOR SHARE ทันทีก่อน claimRoom/moveOccupancy (หลังล็อก advisory ของสัญญา)
//     ⇒ claimRoom/moveOccupancy อ่าน active หลังได้ล็อก = ค่าล่าสุดที่ commit แล้ว (ปิดไปแล้ว ⇒ ROOM_INACTIVE ตามแบบข้อผิดพลาดเดิมของไฟล์)
//   • ทางปิดห้อง (setup.ts archiveDormRoom) = FOR UPDATE เป็นคำสั่งแรกของ tx แล้วจึงตรวจสัญญา/occupancy + ตั้ง active=false ใน tx เดียว
//     ⇒ FOR SHARE ∥ FOR UPDATE ขัดกันเสมอ: ฝั่งใดได้ก่อน อีกฝั่งรอจน commit แล้วเห็นผลของอีกฝั่ง
//   • ลำดับล็อก: ทางสัญญา = advisory(สัญญา) → [advisory รอบบิล] → แถว Party → แถวห้อง (share) → แทรก occupancy · ทางปิดห้อง = แถวห้อง (update) อย่างเดียว
//     (ไม่ถือ advisory/แถว Party/แถวสัญญา) ⇒ ไม่มีวงล็อก · ทางสัญญาสองทางถือ share พร้อมกันได้ (ไม่ขัดกันเอง · ไม่ upgrade เป็น update ใน tx เดียวกัน)
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** FOR SHARE แถวห้องของ (ร้าน, หน่วย) · ไม่พบ = ไม่ทำอะไร (ผู้เรียกตัดสินต่อด้วย claimRoom/moveOccupancy) */
export async function lockDormRoomShared(tx: Tx, tenantId: string, unitId: string, roomId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "HotelRoom" WHERE "id" = ${roomId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} FOR SHARE`;
}

/** FOR UPDATE แถวห้อง · คืน active ล่าสุด (null = ไม่พบ) */
export async function lockDormRoomForUpdate(tx: Tx, tenantId: string, unitId: string, roomId: string): Promise<boolean | null> {
  const rows = await tx.$queryRaw<{ active: boolean }[]>`SELECT "active" FROM "HotelRoom" WHERE "id" = ${roomId} AND "tenantId" = ${tenantId} AND "unitId" = ${unitId} FOR UPDATE`;
  return rows.length ? rows[0].active : null;
}
