// notification-events.ts — ทะเบียนเหตุการณ์แจ้งเตือนสมาชิก (M3.6 · พิมพ์เขียว §5.10 §8.x · ภาพ 30)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / env / facade / Next — หน้าตั้งค่า (client component)
//    ต้องใช้ทะเบียนเดียวกับเอนจิน (`notifications.ts`) เพื่อวาดตาราง/ชื่อตัวแปร/ป้ายไทย โดยไม่ลาก
//    `core/db.ts → @prisma/adapter-pg → pg` เข้าเบราว์เซอร์ (บทเรียน M3.1/M3.2/M3.3 — ดูหัวไฟล์ *-shared.ts อื่น)
// 🔴 ลำดับของ `NOTIF_EVENTS` = ลำดับที่ตารางในภาพ 30 แสดงผล — ห้ามสลับ (harness/ข้อสอบอ้างตำแหน่ง evs[i])

/** ช่องทางที่ระบบแจ้งเตือนส่งออกได้ (4 ช่องทางตามสัญญา M3.6 — คนละทะเบียนกับ `core/channels.ts` ที่กว้างกว่า) */
export const NOTIF_CHANNELS = ["LINE", "EMAIL", "SMS", "PUSH"] as const;
export type NotifChannel = (typeof NOTIF_CHANNELS)[number];

/** รูปแบบเวลาส่งของเทมเพลตหนึ่ง */
export const NOTIF_TIMINGS = ["IMMEDIATE", "DAILY_DIGEST"] as const;
export type NotifTiming = (typeof NOTIF_TIMINGS)[number];

export type NotifEventDef = {
  /** key เสถียร — ใช้เป็น `MemberNotification.event` และคีย์ใน `settings.templates` */
  key: string;
  /** ป้ายไทยในตาราง (คอลัมน์ "เหตุการณ์") */
  label: string;
  /** transactional = ข้ามด่าน "เคารพความยินยอม" ได้เมื่อร้านเปิดสวิตช์ transactionalOverride (§7.1/§8.x) */
  transactional: boolean;
  /** ชื่อตัวแปรที่ใช้ในข้อความของเหตุการณ์นี้ได้ (ไม่รวมปีกกา) — setTemplate ปฏิเสธตัวแปรนอกทะเบียนนี้ */
  vars: string[];
  /** event ของ outbox ที่ทำให้เกิดการแจ้งเตือนนี้ (เอกสารอ้างอิง — การต่อสายจริงอยู่ที่ outbox-consumers.ts) */
  sourceEvent: string;
  /** เฉพาะ POINTS_EXPIRING — จำนวนวันล่วงหน้าที่แจ้ง (ตรงกับ `PointSettings.remindDays` ปริยาย [30,7]) */
  leadDays?: number[];
};

/** 8 เหตุการณ์ตามภาพ 30 — ลำดับนี้คือลำดับแถวในตาราง */
export const NOTIF_EVENTS: readonly NotifEventDef[] = Object.freeze([
  {
    key: "WELCOME",
    label: "ต้อนรับสมาชิกใหม่",
    transactional: true,
    vars: ["ชื่อ", "ร้าน", "ระดับ", "แต้ม", "ลิงก์กระเป๋า", "สาขา"],
    sourceEvent: "member.created",
  },
  {
    key: "POINTS_EARNED",
    label: "ได้แต้ม",
    transactional: true,
    vars: ["ชื่อ", "แต้ม", "ร้าน", "ลิงก์กระเป๋า", "สาขา", "ระดับ"],
    sourceEvent: "point.earned",
  },
  {
    key: "POINTS_EXPIRING",
    label: "แต้มใกล้หมดอายุ",
    transactional: true,
    vars: ["ชื่อ", "แต้มที่จะหมด", "วันหมดอายุ", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "point.expiring",
    leadDays: [30, 7],
  },
  {
    key: "TIER_UP",
    label: "เลื่อนระดับ",
    transactional: false,
    vars: ["ชื่อ", "ระดับ", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "member.tier.changed",
  },
  {
    key: "TIER_AT_RISK",
    label: "ใกล้ลดระดับ",
    transactional: false,
    vars: ["ชื่อ", "ระดับ", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "member.tier.at_risk",
  },
  {
    key: "VOUCHER_NEW",
    label: "voucher ใหม่",
    transactional: false,
    vars: ["ชื่อ", "voucher", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "voucher.issued",
  },
  {
    key: "STAMP_COMPLETE",
    label: "สแตมป์ครบ",
    transactional: false,
    vars: ["ชื่อ", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "stamp.completed",
  },
  {
    key: "REVIEW_REQUEST",
    label: "ขอรีวิว",
    transactional: false,
    vars: ["ชื่อ", "ร้าน", "ลิงก์กระเป๋า"],
    sourceEvent: "review.requested",
  },
]);

const BY_KEY = new Map(NOTIF_EVENTS.map((e) => [e.key, e]));

/** คืนนิยามของเหตุการณ์ · undefined = ไม่รู้จัก */
export function getNotifEvent(key: string): NotifEventDef | undefined {
  return BY_KEY.get(key);
}

/** key ทั้งหมดตามลำดับทะเบียน */
export function notifEventKeys(): string[] {
  return NOTIF_EVENTS.map((e) => e.key);
}

/** ตัวแปรที่ปรากฏใน `text` (นับซ้ำได้ครั้งเดียวต่อชื่อ) — ใช้ตรวจก่อนบันทึกเทมเพลต */
export function varsUsedIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of String(text ?? "").matchAll(/\{([^{}]+)\}/g)) found.add(m[1].trim());
  return [...found];
}
