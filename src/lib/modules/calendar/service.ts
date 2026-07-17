import { tenantDb } from "@/lib/core/db";
import { evaluate, filterAccessibleUnitIds, type MembershipCtx } from "@/lib/core/rbac";
import type { HrLeaveType } from "@prisma/client";

// ปฏิทินกลางรวม (WO-0057) — READ-ONLY: รวม 3 แหล่งเวลาเป็นเหตุการณ์เดียว
//   · Appointment (คิวจองบริการ · unit-scoped)
//   · HotelReservation (การเข้าพัก checkInDate→checkOutDate · unit-scoped)
//   · HrLeave (วันลา fromDate→toDate · system-scoped ผูกระบบ HR)
// ปฏิทินอ่านทั้งร้าน (ข้ามทุกสาขา/ทุกระบบ HR) แต่ตัวโมเดลเป็น unit/system-scoped —
// จึงต้อง enumerate unit + ระบบ HR ก่อน แล้ว query ต่อ scope ผ่าน tenantDb(ctx) เสมอ
// (ไม่ import prisma ตรง · ไม่มี write path ใด ๆ)

export type CalEventKind = "APPOINTMENT" | "HOTEL_STAY" | "HR_LEAVE";

export type CalEvent = {
  id: string;
  kind: CalEventKind;
  /** ไทยล้วน + มีชื่อคน เช่น "ตัดผม — คุณสมชาย" / "เข้าพัก Deluxe — คุณเกสต์" / "ลากิจ — พนักงานบี" */
  title: string;
  startAt: Date;
  endAt: Date;
  status: string;
  unitId?: string | null;
  systemId?: string | null;
};

const LEAVE_TYPE_LABEL: Record<HrLeaveType, string> = {
  SICK: "ลาป่วย",
  PERSONAL: "ลากิจ",
  VACATION: "ลาพักร้อน",
  OTHER: "ลาอื่น ๆ",
};

// เกณฑ์เข้า window: ช่วงเวลา overlap [from, to) — เริ่มก่อน from แต่ยังไม่จบ = เข้า
//   overlap  ⇔  start < to  AND  end > from

/** unit ทั้งหมดของร้าน (BusinessUnit = tenant-scoped) — ระบบไม่พร้อม = คืน [] เงียบ ๆ */
async function listUnitIds(tenantId: string): Promise<string[]> {
  try {
    const db = tenantDb({ tenantId });
    const units = await db.businessUnit.findMany({ select: { id: true } });
    return units.map((u) => u.id);
  } catch {
    return [];
  }
}

/** ระบบ HR ทั้งหมดของร้าน (AppSystem = tenant-scoped) — ไม่เปิดระบบ HR = คืน [] เงียบ ๆ */
async function listHrSystemIds(tenantId: string): Promise<string[]> {
  try {
    const db = tenantDb({ tenantId });
    const systems = await db.appSystem.findMany({ where: { type: "HR" }, select: { id: true } });
    return systems.map((s) => s.id);
  } catch {
    return [];
  }
}

export async function getCalendarEvents(
  ctx: { tenantId: string; membership: MembershipCtx },
  window: { from: Date; to: Date },
): Promise<CalEvent[]> {
  const { tenantId, membership } = ctx;
  const { from, to } = window;
  const events: CalEvent[] = [];

  // ── แหล่ง unit-scoped: Appointment + HotelReservation (เฉพาะสาขาที่มีสิทธิ์) ──
  // 🔒 PDPA: กรอง unit ตาม unitAccess — พนักงานสาขาเดียวห้ามเห็นนัด/เข้าพักสาขาอื่น
  const allUnitIds = await listUnitIds(tenantId);
  const unitIds = filterAccessibleUnitIds(membership, allUnitIds);
  for (const unitId of unitIds) {
    const db = tenantDb({ tenantId, unitId });

    // Appointment — ตัด CANCELLED · title = ชื่อบริการ — ชื่อลูกค้า
    try {
      const appts = await db.appointment.findMany({
        where: {
          status: { not: "CANCELLED" },
          startAt: { lt: to },
          endAt: { gt: from },
        },
        include: { service: { select: { name: true } } },
      });
      for (const a of appts) {
        events.push({
          id: a.id,
          kind: "APPOINTMENT",
          title: `${a.service?.name ?? "นัดหมาย"} — ${a.customerName}`,
          startAt: a.startAt,
          endAt: a.endAt,
          status: a.status,
          unitId: a.unitId,
          systemId: null,
        });
      }
    } catch {
      /* ระบบจอง/ตารางไม่เปิด → ข้ามเงียบ ๆ */
    }

    // HotelReservation — startAt=checkInDate endAt=checkOutDate · ตัด CANCELLED
    try {
      const stays = await db.hotelReservation.findMany({
        where: {
          status: { not: "CANCELLED" },
          checkInDate: { lt: to },
          checkOutDate: { gt: from },
        },
        include: { roomType: { select: { name: true } } },
      });
      for (const r of stays) {
        events.push({
          id: r.id,
          kind: "HOTEL_STAY",
          title: `เข้าพัก ${r.roomType?.name ?? "ห้องพัก"} — ${r.guestName}`,
          startAt: r.checkInDate,
          endAt: r.checkOutDate,
          status: r.status,
          unitId: r.unitId,
          systemId: null,
        });
      }
    } catch {
      /* ระบบโรงแรมไม่เปิด → ข้ามเงียบ ๆ */
    }
  }

  // ── แหล่ง system-scoped: HrLeave (เฉพาะผู้มีสิทธิ์อ่าน HR) ──
  // 🔒 PDPA: วันลา (โดยเฉพาะลาป่วย = ข้อมูลสุขภาพ) แสดงเฉพาะผู้มีสิทธิ์อ่านระบบ HR เท่านั้น
  // พนักงานทั่วไปที่เปิดปฏิทินจะไม่เห็นวันลาของเพื่อนร่วมงาน
  const canReadHrLeave = evaluate(membership, { module: "hr", action: "hr.leave.read" });
  const hrSystemIds = canReadHrLeave ? await listHrSystemIds(tenantId) : [];
  for (const systemId of hrSystemIds) {
    const db = tenantDb({ tenantId, systemId });
    try {
      const leaves = await db.hrLeave.findMany({
        where: {
          status: { in: ["PENDING", "APPROVED"] },
          fromDate: { lt: to },
          toDate: { gt: from },
        },
        include: { employee: { select: { name: true } } },
      });
      for (const l of leaves) {
        events.push({
          id: l.id,
          kind: "HR_LEAVE",
          title: `${LEAVE_TYPE_LABEL[l.type]} — ${l.employee?.name ?? "พนักงาน"}`,
          startAt: l.fromDate,
          endAt: l.toDate,
          status: l.status,
          unitId: null,
          systemId: l.systemId,
        });
      }
    } catch {
      /* ระบบ HR ไม่เปิด → ข้ามเงียบ ๆ */
    }
  }

  // เรียง startAt น้อย → มาก
  events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return events;
}
