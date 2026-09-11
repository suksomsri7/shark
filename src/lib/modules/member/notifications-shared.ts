// notifications-shared.ts — ส่วนที่ "หน้าจอกับเซิร์ฟเวอร์ใช้ร่วมกัน" ของการแจ้งเตือนสมาชิก (M3.6 · ภาพ 30)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / env / facade / Next — `NotificationsSettings.tsx` เป็น
//    client component ที่ต้องใช้ชนิดข้อมูล + ค่าเริ่มต้น/ป้ายไทยชุดเดียวกับเอนจิน ถ้าไปดึงจาก
//    `notifications.ts` ตัวบันเดิลจะลาก `core/db.ts → @prisma/adapter-pg → pg` เข้าเบราว์เซอร์แล้ว
//    `next build` พังทันที (บทเรียน M3.1/M3.2/M3.3 — ดูหัวไฟล์ segments-shared.ts/journeys-shared.ts)
// 🔴 ของที่ต้อง "ถามฐานข้อมูล" (บันทึก/ส่งจริง/สถิติ) อยู่ที่ `notifications.ts` และเรียกจากหน้าจอผ่าน
//    server action ใน `notifications-actions.ts` เท่านั้น

import { NOTIF_CHANNELS, NOTIF_EVENTS, NOTIF_TIMINGS, type NotifChannel, type NotifTiming } from "./notification-events";

export { NOTIF_CHANNELS, NOTIF_EVENTS, NOTIF_TIMINGS };
export type { NotifChannel, NotifEventDef, NotifTiming } from "./notification-events";

/** ป้ายไทยของช่องทาง — คำเดียวกับที่โชว์ในชิปของตาราง (ภาพ 30: LINE / อีเมล / SMS / push) */
export const NOTIF_CHANNEL_LABELS: Record<NotifChannel, string> = {
  LINE: "LINE",
  EMAIL: "อีเมล",
  SMS: "SMS",
  PUSH: "push",
};

export const NOTIF_TIMING_LABELS: Record<NotifTiming, string> = {
  IMMEDIATE: "ทันที",
  DAILY_DIGEST: "รวมรายวัน",
};

/** คำอธิบายตัวแปรที่ใช้ได้ทั้งระบบ (บางเหตุการณ์ใช้แค่บางตัว — ดู `NotifEventDef.vars`) */
export const NOTIF_VAR_LABELS: Record<string, string> = {
  ชื่อ: "ชื่อสมาชิก",
  ร้าน: "ชื่อร้าน",
  ระดับ: "ระดับสมาชิกปัจจุบัน",
  แต้ม: "แต้มคงเหลือ",
  ลิงก์กระเป๋า: "ลิงก์กระเป๋าสิทธิ์ของสมาชิก",
  สาขา: "สาขาหลักของสมาชิก",
  voucher: "รายละเอียด voucher ที่เพิ่งออกให้",
  แต้มที่จะหมด: "จำนวนแต้มที่กำลังจะหมดอายุ",
  วันหมดอายุ: "วันที่แต้มจะหมดอายุ",
};

export type NotifChannelConfig = {
  enabled: boolean;
  body: string;
  /** เฉพาะ EMAIL */
  subject?: string;
  /** เฉพาะ PUSH */
  title?: string;
};

export type NotifTemplateConfig = {
  /** สวิตช์รวมของเหตุการณ์นี้ (คอลัมน์ "สถานะ" ในตาราง — ปิดแล้วทุกช่องทาง SKIPPED หมด) */
  enabled: boolean;
  timing: NotifTiming;
  /** ชั่วโมงไทย (0-23) ที่ส่งสรุปรวม — มีความหมายเมื่อ timing = DAILY_DIGEST เท่านั้น */
  digestHour: number;
  /** เฉพาะ POINTS_EXPIRING — วันล่วงหน้าที่แจ้ง */
  leadDays?: number[];
  channels: Record<NotifChannel, NotifChannelConfig>;
};

export type NotifTemplatesMap = Record<string, NotifTemplateConfig>;

export type NotifQuietHours = { enabled: boolean; from: string; to: string };

export type NotificationSettingsValue = {
  templates: NotifTemplatesMap;
  quietHours: NotifQuietHours;
  respectConsent: boolean;
  transactionalOverride: boolean;
};

/** ค่าที่หน้าจออ่านจริง (เพิ่ม `smsAvailable` ที่คำนวณจาก `core/sms.ts` — ไม่ถูกบันทึกลง DB) */
export type NotificationSettingsView = NotificationSettingsValue & { smsAvailable: boolean };

/** ค่าตั้งต้นของแต่ละช่องทาง (ภาพ 30 — แถวไหนช่องไหนติ๊ก ✓/✗ ก็ตามนี้) ทุกช่องมี body ปริยายเสมอ
 * แม้ปิดอยู่ (เปิดทีหลังต้องมีข้อความให้แก้ ไม่ใช่ช่องว่าง) */
const DEFAULTS: Record<
  string,
  {
    enabled: boolean;
    timing: NotifTiming;
    digestHour?: number;
    channels: Record<NotifChannel, { enabled: boolean; body: string; subject?: string; title?: string }>;
  }
> = {
  WELCOME: {
    enabled: true,
    timing: "IMMEDIATE",
    channels: {
      LINE: { enabled: true, body: "สวัสดีคุณ{ชื่อ} ยินดีต้อนรับสู่ {ร้าน}! เริ่มสะสมแต้มและรับสิทธิพิเศษได้เลยที่ {ลิงก์กระเป๋า}" },
      EMAIL: {
        enabled: true,
        subject: "ยินดีต้อนรับสู่ {ร้าน}",
        body: "สวัสดีคุณ{ชื่อ} ขอบคุณที่สมัครสมาชิกกับ {ร้าน} เริ่มสะสมแต้มและรับสิทธิพิเศษได้ที่ {ลิงก์กระเป๋า}",
      },
      SMS: { enabled: false, body: "{ร้าน}: ยินดีต้อนรับคุณ{ชื่อ} สู่สมาชิก ดูสิทธิ์ที่ {ลิงก์กระเป๋า}" },
      PUSH: { enabled: true, title: "ยินดีต้อนรับ", body: "คุณ{ชื่อ} เป็นสมาชิก {ร้าน} แล้ว แตะดูสิทธิ์ของคุณ" },
    },
  },
  POINTS_EARNED: {
    enabled: true,
    timing: "IMMEDIATE",
    channels: {
      LINE: { enabled: true, body: "คุณ{ชื่อ} ได้รับ {แต้ม} แต้มจาก {ร้าน} แล้ว ดูยอดสะสมที่ {ลิงก์กระเป๋า}" },
      EMAIL: { enabled: true, subject: "คุณได้รับแต้มเพิ่ม", body: "คุณ{ชื่อ} ได้รับ {แต้ม} แต้มจาก {ร้าน} ดูยอดสะสมที่ {ลิงก์กระเป๋า}" },
      SMS: { enabled: false, body: "{ร้าน}: คุณ{ชื่อ} ได้รับ {แต้ม} แต้ม" },
      PUSH: { enabled: true, title: "ได้แต้มเพิ่ม", body: "คุณได้รับ {แต้ม} แต้มจาก {ร้าน}" },
    },
  },
  POINTS_EXPIRING: {
    enabled: true,
    timing: "DAILY_DIGEST",
    digestHour: 9,
    channels: {
      LINE: {
        enabled: true,
        body: "สวัสดีคุณ{ชื่อ} คุณมีแต้ม {แต้มที่จะหมด} ที่จะหมดอายุวันที่ {วันหมดอายุ} รีบใช้ก่อนหมดนะครับ {ลิงก์กระเป๋า}",
      },
      EMAIL: {
        enabled: true,
        subject: "แต้มของคุณใกล้หมดอายุ",
        body: "สวัสดีคุณ{ชื่อ} คุณมีแต้ม {แต้มที่จะหมด} ที่จะหมดอายุวันที่ {วันหมดอายุ} รีบใช้ก่อนหมดนะครับ ดูรายละเอียดที่ {ลิงก์กระเป๋า}",
      },
      SMS: { enabled: false, body: "{ร้าน}: แต้ม {แต้มที่จะหมด} จะหมดอายุวันที่ {วันหมดอายุ}" },
      PUSH: { enabled: true, title: "แต้มใกล้หมดอายุ", body: "คุณมีแต้ม {แต้มที่จะหมด} จะหมดอายุวันที่ {วันหมดอายุ}" },
    },
  },
  TIER_UP: {
    enabled: true,
    timing: "IMMEDIATE",
    channels: {
      LINE: { enabled: true, body: "ยินดีด้วยคุณ{ชื่อ} คุณเลื่อนขึ้นเป็นระดับ {ระดับ} แล้ว ดูสิทธิประโยชน์ใหม่ที่ {ลิงก์กระเป๋า}" },
      EMAIL: {
        enabled: true,
        subject: "คุณเลื่อนระดับแล้ว",
        body: "ยินดีด้วยคุณ{ชื่อ} คุณเลื่อนขึ้นเป็นระดับ {ระดับ} ของ {ร้าน} แล้ว ดูสิทธิประโยชน์ใหม่ที่ {ลิงก์กระเป๋า}",
      },
      SMS: { enabled: false, body: "{ร้าน}: ยินดีด้วย คุณเลื่อนเป็นระดับ {ระดับ}" },
      PUSH: { enabled: true, title: "เลื่อนระดับแล้ว", body: "คุณเป็นสมาชิกระดับ {ระดับ} แล้ว" },
    },
  },
  TIER_AT_RISK: {
    enabled: true,
    timing: "DAILY_DIGEST",
    digestHour: 9,
    channels: {
      LINE: {
        enabled: true,
        body: "คุณ{ชื่อ} กำลังจะหลุดจากระดับ {ระดับ} — กลับมาใช้บริการที่ {ร้าน} เพื่อรักษาสิทธิ์ไว้ ดูรายละเอียดที่ {ลิงก์กระเป๋า}",
      },
      EMAIL: {
        enabled: true,
        subject: "รักษาระดับ {ระดับ} ของคุณไว้",
        body: "คุณ{ชื่อ} กำลังจะหลุดจากระดับ {ระดับ} — กลับมาใช้บริการที่ {ร้าน} เพื่อรักษาสิทธิ์ไว้ ดูรายละเอียดที่ {ลิงก์กระเป๋า}",
      },
      SMS: { enabled: false, body: "{ร้าน}: ระดับ {ระดับ} ของคุณใกล้ถูกปรับลด" },
      PUSH: { enabled: true, title: "ระดับของคุณเสี่ยงลดลง", body: "กลับมาใช้บริการเพื่อรักษาระดับ {ระดับ}" },
    },
  },
  VOUCHER_NEW: {
    enabled: true,
    timing: "IMMEDIATE",
    channels: {
      LINE: { enabled: true, body: "คุณ{ชื่อ} ได้รับ {voucher} จาก {ร้าน} ใช้ได้ที่ {ลิงก์กระเป๋า}" },
      EMAIL: { enabled: true, subject: "สิทธิพิเศษสำหรับ {ชื่อ}", body: "คุณ{ชื่อ} ได้รับ {voucher} จาก {ร้าน} ใช้ได้ที่ {ลิงก์กระเป๋า}" },
      SMS: { enabled: false, body: "{ร้าน}: {voucher} รอคุณอยู่" },
      PUSH: { enabled: true, title: "คุณได้รับสิทธิ์ใหม่", body: "{voucher} จาก {ร้าน}" },
    },
  },
  STAMP_COMPLETE: {
    enabled: true,
    timing: "IMMEDIATE",
    channels: {
      LINE: { enabled: true, body: "คุณ{ชื่อ} สะสมตราครบแล้ว แลกรางวัลได้ที่ {ลิงก์กระเป๋า}" },
      EMAIL: { enabled: true, subject: "สะสมตราครบแล้ว", body: "คุณ{ชื่อ} สะสมตราครบแล้วที่ {ร้าน} แลกรางวัลได้ที่ {ลิงก์กระเป๋า}" },
      SMS: { enabled: false, body: "{ร้าน}: สะสมตราครบแล้ว แลกรางวัลได้เลย" },
      PUSH: { enabled: true, title: "สะสมตราครบแล้ว", body: "แลกรางวัลของคุณได้ที่กระเป๋าสิทธิ์" },
    },
  },
  REVIEW_REQUEST: {
    enabled: false,
    timing: "DAILY_DIGEST",
    digestHour: 9,
    channels: {
      LINE: { enabled: true, body: "คุณ{ชื่อ} ใช้บริการ {ร้าน} เป็นอย่างไรบ้าง ช่วยรีวิวให้เราหน่อยนะครับ {ลิงก์กระเป๋า}" },
      EMAIL: {
        enabled: true,
        subject: "ช่วยรีวิว {ร้าน} หน่อยนะคะ",
        body: "คุณ{ชื่อ} ใช้บริการ {ร้าน} เป็นอย่างไรบ้าง ช่วยรีวิวให้เราหน่อยนะครับ {ลิงก์กระเป๋า}",
      },
      SMS: { enabled: false, body: "{ร้าน}: ช่วยรีวิวให้เราหน่อยนะครับ {ลิงก์กระเป๋า}" },
      PUSH: { enabled: true, title: "ช่วยรีวิวเราหน่อย", body: "แชร์ประสบการณ์ของคุณกับ {ร้าน}" },
    },
  },
};

/** ค่าตั้งต้นของการแจ้งเตือนทั้งระบบ (deep clone ทุกครั้ง — ผู้เรียกแก้ต่อได้อย่างปลอดภัย) */
export function defaultNotificationSettings(): NotificationSettingsValue {
  const templates: NotifTemplatesMap = {};
  for (const ev of NOTIF_EVENTS) {
    const d = DEFAULTS[ev.key];
    templates[ev.key] = {
      enabled: d.enabled,
      timing: d.timing,
      digestHour: d.digestHour ?? 9,
      ...(ev.leadDays ? { leadDays: [...ev.leadDays] } : {}),
      channels: {
        LINE: { ...d.channels.LINE },
        EMAIL: { ...d.channels.EMAIL },
        SMS: { ...d.channels.SMS },
        PUSH: { ...d.channels.PUSH },
      },
    };
  }
  return {
    templates,
    quietHours: { enabled: true, from: "21:00", to: "08:00" },
    respectConsent: true,
    transactionalOverride: true,
  };
}

/**
 * แทนตัวแปรในข้อความ (M3.6 — คนละกติกากับ `renderJourneyMessage` ของ M3.3):
 * ตัวแปรที่ไม่มีค่าส่งมา (แม้ "รู้จัก" ในทะเบียนก็ตาม) ต้องกลายเป็นค่าว่าง ไม่ใช่ค้างเป็นวงเล็บ —
 * ลูกค้าจริงต้องไม่เห็น `{voucher}` โผล่ในข้อความ (ดูเหมือนระบบพัง) · ไม่ trim/ยุบช่องว่างใด ๆ (pure ล้วน)
 */
export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  return String(body ?? "").replace(/\{([^{}]+)\}/g, (_all, key: string) => {
    const v = vars[key.trim()];
    return v === undefined || v === null ? "" : String(v);
  });
}

// ───────────────────────── ตัวส่ง (deps) ─────────────────────────

export type NotificationSendRequest = {
  tenantId: string;
  customerId: string;
  channel: NotifChannel;
  /** ปลายทางที่ resolve แล้ว — LINE externalId / อีเมล / เบอร์ / token ของ push คั่นด้วยจุลภาค (หลายเครื่อง) */
  to: string;
  body: string;
  /** เฉพาะ EMAIL */
  subject?: string;
  /** เฉพาะ PUSH */
  title?: string;
};

export type NotificationSendResult = { ok: boolean; error?: string };
export type NotificationSendFn = (req: NotificationSendRequest) => Promise<NotificationSendResult>;

/** ฉีดตัวส่งจริงจาก composition root (`src/lib/member-journey-senders.ts`) — ไม่ให้ = ถือว่ายังไม่ได้ต่อสาย */
export type NotificationDeps = {
  line?: NotificationSendFn;
  email?: NotificationSendFn;
  sms?: NotificationSendFn;
  push?: NotificationSendFn;
};

/** ช่องทาง → ชื่อคีย์ของ deps */
export function depsKeyOf(channel: NotifChannel): "line" | "email" | "sms" | "push" {
  return channel === "LINE" ? "line" : channel === "EMAIL" ? "email" : channel === "SMS" ? "sms" : "push";
}
