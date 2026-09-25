// crm-bridges/business.ts — สะพาน "เหตุการณ์ธุรกิจของ 8 โมดูล → ไทม์ไลน์ + ขั้นของลูกค้าใน CRM v2"
//   (ใบ C2.9 · มติ C11 · พิมพ์เขียว §7.2 §9 · RESOLUTIONS R-D: ใบนี้เป็นเจ้าของไฟล์นี้ไฟล์เดียว)
//
// กติกาทั้งหมดของโฟลเดอร์อยู่ที่หัว `core.ts` — ที่นี่ย้ำ 5 ข้อที่เป็นหัวใจของ "เหตุการณ์ธุรกิจ":
//  1. **ประตูมาก่อน** (R-E.14 · กฎถาวรของใบ C1.11 · ข้อสอบ `qc-crm-c1.11` S6.10) — `openCrmSystems(evt.tenantId)` ถูกถามก่อน
//     อ่านหรือเขียนอะไรทั้งหมด: ร้านที่ยังเป็น uiVersion 1 หรือปิด `bridgesEnabled` ⇒ ไม่มีอะไรเกิดขึ้น **แต่ event ยังจบเป็น DONE**
//     (แถวยังอยู่ · เปิดรุ่น 2 แล้วส่งซ้ำ = ได้กิจกรรมย้อนหลังตามปกติ)
//  2. **ตัวรับตัวเดียว 8 ชนิด** (มติผู้คุมงาน C2.9 ข้อ 7) — `onBusinessEvent` + ตาราง `SPECS` บอก "ช่อง id ของแถวต้นทาง ·
//     ตารางที่ต้องอ่าน · หัวเรื่องไทย" ต่อชนิด · เพิ่มโมดูลที่ 9 ในอนาคต = เพิ่มหนึ่งแถวในตาราง ไม่ใช่ handler ตัวที่เก้า
//  3. **AUDIT-CLASS X1 ร้านเดียว** — id ใน payload ถูกอ่านกลับจากตารางต้นทางด้วย `tenantId` ของ event เสมอ (ไม่พบ = ของร้านอื่น/
//     ของปลอม = ไม่ทำอะไร) · Party มาจาก **แถวจริง** ไม่ใช่จาก payload · ไม่มีการ "แผ่" กิจกรรมไปทุกระบบ CRM ของร้าน:
//     เขียนเฉพาะระบบที่ Party นั้นมีผู้ติดต่ออยู่จริง
//  4. **AUDIT-CLASS X4 ปักธงก่อนแล้วค่อยเขียน** — ธง = (ระบบ, ผู้ติดต่อ, `sourceRef` = id ของแถวต้นทาง) อยู่ใต้ advisory lock
//     ในธุรกรรมของ `crm.activities.recordBusinessActivityOnce` ⇒ ส่งซ้ำ/ยิงพร้อมกัน 4 ทาง = กิจกรรมใบเดียว ·
//     การเลื่อนขั้นเป็น conditional update คำสั่งเดียวที่ `crm.contacts.markCustomerFromBridge` ⇒ เลื่อนครั้งเดียว
//     🔴 ธงไม่ใช่ "เคยเห็น OutboxEvent ใบนี้ไหม": event ที่ถึงก่อนผู้ติดต่อจะเกิด เขียนอะไรไม่ได้แต่ก็ไม่พัง และเมื่อส่งซ้ำหลัง
//        ผู้ติดต่อมีแล้ว จะได้กิจกรรมใบนั้นครบ (ลำดับไม่สำคัญ)
//  5. **AUDIT-CLASS X8 id ล้วน** — ที่นี่ **ไม่อ่าน** ช่องชื่อ/เบอร์ของโมดูลต้นทางเลย (รวม `customerName`/`customerPhone` ที่ยังติดมา
//     กับ `shop.order.paid` — หนี้ของโมดูลร้านค้าตาม R-E.17) · หัวเรื่องกิจกรรมมาจากตารางค่าคงที่ข้างล่าง · ไม่มี body ⇒
//     อาการ/การวินิจฉัย/ยาของคลินิกไม่มีทางไหลเข้าไทม์ไลน์ขาย (มติผู้คุมงาน C2.9 ข้อ 15)
//
// 🔴 ไม่สร้าง lead จากคนเดินเข้าร้าน (มติผู้คุมงาน C2.9 ข้อ 12): Party ที่ยังไม่มีผู้ติดต่อ CRM = ไม่เขียนอะไร —
//    "ธุรกรรม → ผู้ติดต่อใหม่" เป็นงานของสะพานแชท (C2.4) / ฟอร์ม (C2.6) ที่มีสวิตช์ของตัวเอง
// 🔴 ไม่ยิง `crm.activity.logged` ต่อ (ตัวเขียนใน `crm/activities.ts` จัดการ) — โมดูลต้นทางประกาศเหตุการณ์ไปแล้วหนึ่งใบ
// 🔴 แถวต้นทางที่ยังไม่มี `partyId` (โมดูลผูก Party หลัง commit — ล้มได้เงียบ ๆ) = เขียนอะไรไม่ได้ ⇒ ที่นี่ลง **WARN id ล้วน**
//    ให้ช่องว่างมองเห็น · **การยิงเหตุการณ์เหล่านี้ซ้ำหลังผูก Party ย้อนหลังเป็นงานของการไล่เก็บ party-links ในใบ C6.1 ไม่ใช่ของสะพานนี้**
// 🔴 ของแถมใต้ `compose` — โยน error ได้ตามจริง: ผู้เรียกบันทึก WARN และ **บิล/ตรา/แต้ม/ไทม์ไลน์สมาชิกไม่ล้มตาม**

import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import * as crm from "@/lib/modules/crm";
import * as party from "@/lib/modules/party";
import { openCrmSystems, payloadOf, str, type BridgeEvent } from "./core";

/** ตารางต้นทางของแต่ละชนิดเหตุการณ์ — ช่อง id ใน payload · ตัวอ่านแถว (คืน partyId) · หัวเรื่องไทยของกิจกรรม (ไม่มีข้อมูลบุคคล) */
type BusinessSpec = {
  /** ชื่อช่องของ id แถวต้นทางใน payload */
  idField: string;
  /** ชนิดของแถวต้นทาง (ลงแถว audit — `CrmActivity` ไม่มีคอลัมน์ ref) */
  refType: string;
  title: string;
  /** อ่านแถวต้นทางด้วย (id, tenantId ของ event) — ไม่พบ = null (X1) */
  load: (tenantId: string, id: string) => Promise<{ partyId: string | null } | null>;
};

const SPECS: Record<string, BusinessSpec> = {
  "ticket.order.paid": {
    idField: "orderId",
    refType: "TicketOrder",
    title: "ซื้อบัตรเข้างาน (ชำระเงินแล้ว)",
    load: (tenantId, id) => prisma.ticketOrder.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "rental.returned": {
    idField: "bookingId",
    refType: "RentalBooking",
    title: "คืนของที่เช่าเรียบร้อย",
    load: (tenantId, id) => prisma.rentalBooking.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "school.enrolled": {
    idField: "enrollmentId",
    refType: "SchoolEnrollment",
    title: "ชำระค่าเรียนของรอบเรียนแล้ว",
    load: (tenantId, id) => prisma.schoolEnrollment.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "hotel.checked_out": {
    idField: "reservationId",
    refType: "HotelReservation",
    title: "เช็คเอาท์จากการเข้าพัก",
    load: (tenantId, id) => prisma.hotelReservation.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "clinic.visit.done": {
    // 🔴 X8: อ่านแค่ Party — ไม่แตะอาการ/การวินิจฉัย/ยา/ค่าบริการของแถวนี้เลย
    idField: "visitId",
    refType: "ClinicVisit",
    title: "เข้ารับบริการที่คลินิก",
    load: (tenantId, id) => prisma.clinicVisit.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "queue.served": {
    idField: "ticketId",
    refType: "QueueTicket",
    title: "รับบริการตามคิวเรียบร้อย",
    load: (tenantId, id) => prisma.queueTicket.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "booking.completed": {
    idField: "appointmentId",
    refType: "Appointment",
    title: "มาตามนัดที่จองไว้",
    load: (tenantId, id) => prisma.appointment.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
  "shop.order.paid": {
    // 🔴 X8 · R-E.17: payload ของ event นี้ยังมี customerName/customerPhone (หนี้ของโมดูลร้านค้า) — ที่นี่อ่าน **แต่ id**
    idField: "orderId",
    refType: "ShopOrder",
    title: "ชำระเงินออเดอร์ออนไลน์แล้ว",
    load: (tenantId, id) => prisma.shopOrder.findFirst({ where: { id, tenantId }, select: { partyId: true } }),
  },
};

/** ผู้ติดต่อที่ยังใช้งานของ Party นี้ในระบบ CRM ใบหนึ่ง (เรียงคงที่ — ผลซ้ำได้ · แบบเดียวกับ `chat.ts`) */
async function contactsOfParty(tenantId: string, systemId: string, partyIds: string[]): Promise<{ id: string }[]> {
  return prisma.crmContact.findMany({
    where: { tenantId, systemId, partyId: { in: partyIds }, archivedAt: null, mergedIntoId: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: 80, // เพดานเดียวกับ `chat.ts` (Party เดียวมีผู้ติดต่อซ้ำได้หลายใบก่อนถูกรวม)
  });
}

/** เวลาที่เหตุการณ์เกิดจริง = `createdAt` ของแถวในคิว (ไม่ใช่เวลาที่คิวถูกระบาย) · event สังเคราะห์/ไม่มีแถว = ตอนนี้ */
async function eventTime(evt: BridgeEvent): Promise<Date> {
  const row = str(evt.id) ? await prisma.outboxEvent.findUnique({ where: { id: evt.id }, select: { createdAt: true } }).catch(() => null) : null;
  return row?.createdAt ?? new Date();
}

/**
 * ตัวรับเดียวของ 8 เหตุการณ์ธุรกิจ (`ticket.order.paid` · `rental.returned` · `school.enrolled` · `hotel.checked_out` ·
 * `clinic.visit.done` · `queue.served` · `booking.completed` · `shop.order.paid`)
 *   → แถวต้นทาง (ร้านของ event) → Party (ตามสายการรวม) → ผู้ติดต่อของ Party นั้นในระบบ CRM ทุกใบที่เปิดสะพาน
 *   → กิจกรรมชนิด VISIT ใบเดียวต่อ (ระบบ, ผู้ติดต่อ, แถวต้นทาง) + ขั้นของลูกค้าเดินหน้าเป็น CUSTOMER
 * ไม่มีผู้ติดต่อ = ไม่เขียนอะไร (ไม่สร้าง lead) · id ปลอม/ของร้านอื่น = ไม่เขียนอะไร · ทั้งสองกรณี event จบเป็น DONE
 */
export async function onBusinessEvent(evt: BridgeEvent): Promise<void> {
  // 1) ประตูก่อนเสมอ (R-E.14 · กติกาข้อ 1 ของโฟลเดอร์) — อ่านสดทุกครั้ง สวิตช์ปิดต้องมีผลทันที
  const systems = await openCrmSystems(evt.tenantId);
  if (systems.length === 0) return;
  const spec = SPECS[evt.type];
  if (!spec) return;
  const rowId = str(payloadOf(evt.payload)[spec.idField]);
  if (!rowId) return;
  // 2) AUDIT-CLASS X1: แถวต้นทางต้องเป็นของร้านใน event · Party มาจากแถวจริง ไม่ใช่จาก payload
  const row = await spec.load(evt.tenantId, rowId);
  if (!row) return;
  const rawParty = str(row.partyId);
  if (!rawParty) {
    // ยังไม่มีตัวตนกลาง (เบอร์ว่าง หรือ `linkPartyAfterCommit` ของโมดูลต้นทางล้มเงียบเพราะมันผูก Party **หลัง** commit)
    //   ⇒ event ใบนี้จบเป็น DONE ตามปกติ แต่ไทม์ไลน์ CRM จะ **ไม่มี** กิจกรรมใบนี้เลยและไม่มีใครรู้ (ผู้ตรวจรอบ 3 · F4)
    //   จึงลง WARN แบบ id ล้วน (AUDIT-CLASS X8: ไม่มีชื่อ/เบอร์/อีเมล) ให้ช่องว่างนี้มองเห็นจากหน้าผู้ดูแลแพลตฟอร์ม
    await logOps("WARN", "crm.business", `เหตุการณ์ธุรกิจ "${evt.type}" ไม่มีตัวตนกลาง (Party) — แถว ${rowId} ยังไม่ถูกผูก ⇒ ไม่มีกิจกรรมใน CRM`, { tenantId: evt.tenantId });
    return;
  }
  const partyIds = [...new Set([rawParty, await party.resolveCanonical(evt.tenantId, rawParty)])].sort();
  const at = await eventTime(evt);
  const sourceRef = `${evt.type}:${rowId}`;
  let firstError: unknown = null;
  for (const systemId of systems) {
    const contacts = await contactsOfParty(evt.tenantId, systemId, partyIds);
    for (const contact of contacts) {
      try {
        // 3) AUDIT-CLASS X4 + กติกาข้อ 6: ผู้เขียน CrmActivity / lifecycleStage คือบริการของโมดูล CRM เท่านั้น
        await crm.activities.recordBusinessActivityOnce({ tenantId: evt.tenantId, systemId }, { sourceRef, title: spec.title, contactId: contact.id, at, refType: spec.refType, refId: rowId });
        await crm.contacts.markCustomerFromBridge({ tenantId: evt.tenantId, systemId }, { contactId: contact.id }); // เวลาอยู่ที่กิจกรรม — ตัวเลื่อนขั้นไม่ใช้ `at` (ผู้ตรวจรอบ 3 · N5)
      } catch (e) {
        // ระบบหนึ่งล้มต้องไม่กลืนงานของระบบที่เหลือ — เก็บใบแรกไว้โยนท้ายสุดให้ `compose` บันทึก WARN (AUDIT-CLASS X8: id ล้วน)
        firstError ??= e;
      }
    }
  }
  if (firstError) throw firstError;
}
