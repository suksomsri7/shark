// assignment.ts — ตัวเลือกผู้ดูแลของ lead ใหม่ (stub ของใบ C1.4 · ใบ C2.3 แทนไส้ในทั้งไฟล์)
//
// 🔴 วันนี้ (ก่อน C2.3): กติกาเดียว = FIXED — ผู้ดูแลที่ระบุมา → ไม่มีก็ "คนที่สร้าง" → ไม่มีคน (ฟอร์มสาธารณะ/ผู้ช่วย AI) = ไม่มีผู้ดูแล
//    C2.3 จะเติม ROUND_ROBIN (atomic) · TEAM_LEAD · LEAST_OPEN · maxOpenPerUser · ข้ามคนลา · fallback โดยลายเซ็น `pick` ไม่เปลี่ยน
//    ⇒ ผู้เรียก (contacts.ts: สร้าง · นำเข้า) ไม่ต้องแก้เมื่อ engine จริงมา
// 🔴 ไฟล์นี้ไม่แตะฐานข้อมูล (stub บริสุทธิ์) — การตรวจว่าผู้ดูแลเป็นคนของร้านจริงอยู่ที่ผู้เรียก

export type AssignmentPickInput = {
  /** ผู้ดูแลที่ผู้ใช้เลือกเอง (ผ่านการตรวจสมาชิกภาพของร้านแล้ว) */
  fixedOwnerUserId?: string | null;
  /** คนที่กดสร้าง/นำเข้า (null = งานที่ไม่มีคน เช่น ฟอร์มสาธารณะ) */
  creatorUserId?: string | null;
  /** ที่มาของการมอบหมายเมื่อไม่มีการเลือกเอง — บันทึกลง `assignedBy` */
  via?: "USER" | "IMPORT" | "API";
};

export type AssignmentPick = { ownerUserId: string | null; assignedBy: string | null };

/** เลือกผู้ดูแล (stub FIXED) — คืนค่า `assignedBy` ตามรูป "USER:{id}" | "RULE:{id}" | "API" | "IMPORT" ของสคีมา */
export function pick(_ctx: { tenantId: string; systemId: string }, input: AssignmentPickInput): AssignmentPick {
  const fixed = (input.fixedOwnerUserId ?? "").trim();
  const creator = (input.creatorUserId ?? "").trim();
  if (fixed) return { ownerUserId: fixed, assignedBy: creator ? `USER:${creator}` : input.via === "IMPORT" ? "IMPORT" : input.via === "API" ? "API" : null };
  if (creator) return { ownerUserId: creator, assignedBy: input.via === "IMPORT" ? "IMPORT" : `USER:${creator}` };
  return { ownerUserId: null, assignedBy: null };
}
