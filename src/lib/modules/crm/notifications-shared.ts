// notifications-shared.ts — ทะเบียน "แจ้งเตือนพนักงาน" ของ CRM v2 (ใบ C2.10 · พิมพ์เขียว §7.4 · มติ C22 · R-E.12)
//
// ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / next / ตัวส่งใด ๆ ⇒ client component และตัวตรวจไร้ env ใช้ได้
// ตัวเอนจินอยู่ที่ `./notifications.ts` (เขียนฐาน · ยิงช่องทาง · ด่านสิทธิ์)
//
// 🔴 ช่องทางมี **3 ตัวเท่านั้น**: ในแอป · push · อีเมล — **ไม่มี LINE ถึงพนักงาน** ในรอบนี้
//    (ใบงาน C2.10 + คำตอบเจ้าของ Q3 + R-E.12) ⇒ ค่าเริ่มต้นของพิมพ์เขียวถูกแปลงตาม R-E.12:
//    "LINE ทันที" → PUSH · "LINE รายวัน (สรุป)" → อีเมลสรุป + ในแอป
// 🔴 ค่าเริ่มต้นของ `lead.hot` เปิดครบ 3 ช่องทาง (พิมพ์เขียวเขียน "push ทันที") — lead ร้อนคือเรื่องที่
//    "พลาดแล้วเสียเงินจริง" และเป็นเทมเพลตเดียวที่สัญญาของใบนี้ใช้พิสูจน์ว่าทั้งสามช่องทางเดินได้
// 🔴 เนื้อความห้ามมีข้อมูลลูกค้า (ชื่อ/เบอร์/อีเมล) — ตัวแปรของเทมเพลตเป็น "จำนวน" และ "รหัส" เท่านั้น (X8/PDPA)
//    ลิงก์ลึกถูกต่อท้ายโดยเอนจิน ไม่ใช่โดยเทมเพลต (ลิงก์เป็นทั้งทางเข้าของผู้ใช้ และตัวเลือกของรอบกวาดที่เลื่อนไว้)

/** ช่องทางของ "แจ้งเตือนพนักงาน" — 3 ตัวเท่านั้น (LINE ถึงพนักงานอยู่นอกรอบนี้) */
export const CRM_NOTIF_CHANNELS = ["IN_APP", "PUSH", "EMAIL"] as const;
export type CrmNotifChannel = (typeof CRM_NOTIF_CHANNELS)[number];

/** เปิด/ปิดต่อช่องทาง */
export type CrmNotifChannelMap = Record<CrmNotifChannel, boolean>;

/** คีย์ของเทมเพลต 10 ตัวตามพิมพ์เขียว §7.4 (ลำดับ = ลำดับในตารางของพิมพ์เขียว) */
export const CRM_NOTIF_KEYS = [
  "lead.assigned",
  "customer.replied",
  "deal.stale.digest",
  "tasks.today",
  "activity.reminder",
  "lead.hot",
  "deal.closed",
  "commission.status",
  "quota.progress",
  "invoice.paid",
] as const;
export type CrmNotifKey = (typeof CRM_NOTIF_KEYS)[number];

export type CrmNotifTemplateDef = {
  key: CrmNotifKey;
  /** ชื่อที่คนเห็นในหน้าตั้งค่า */
  label: string;
  /** หัวข้อของใบแจ้งเตือน (ไทย · ใส่ {{ตัวแปร}} ได้) */
  title: string;
  /** เนื้อความ (ไทย · {{ตัวแปร}}) — ลิงก์ลึกถูกต่อท้ายโดยเอนจิน */
  body: string;
  /** ค่าเริ่มต้นต่อช่องทางของร้าน */
  defaults: CrmNotifChannelMap;
  /** true = เรื่องนี้เป็น "สรุป" (1 ใบต่อคนต่อวัน) ไม่ใช่ทีละเหตุการณ์ */
  digest?: boolean;
  /** ใครควรได้รับ (เอกสารประกอบหน้าตั้งค่า — ผู้เรียกเป็นคนส่งรายชื่อจริง) */
  recipients: string;
};

const ch = (inApp: boolean, push: boolean, email: boolean): CrmNotifChannelMap => ({ IN_APP: inApp, PUSH: push, EMAIL: email });

/** เทมเพลต 10 ตัวของพิมพ์เขียว §7.4 (แปลงช่องทางตาม R-E.12 แล้ว) */
export const CRM_NOTIF_TEMPLATES: readonly CrmNotifTemplateDef[] = Object.freeze([
  {
    key: "lead.assigned",
    label: "lead ใหม่ถูกมอบหมายให้ฉัน",
    title: "มี lead ใหม่เข้ามาที่คุณ",
    body: "คุณได้รับมอบหมาย lead ใหม่ {{count}} ราย — เปิดดูแล้วติดต่อกลับได้เลย",
    defaults: ch(true, true, false),
    recipients: "ผู้ดูแล",
  },
  {
    key: "customer.replied",
    label: "ลูกค้าตอบกลับ (อีเมล · แชท · ใบเสนอราคา)",
    title: "ลูกค้าตอบกลับแล้ว",
    body: "มีการตอบกลับจากลูกค้าในรายการที่คุณดูแล — เปิดอ่านแล้วตอบต่อได้ทันที",
    defaults: ch(true, true, false),
    recipients: "ผู้ดูแล และผู้ร่วมดูแล",
  },
  {
    key: "deal.stale.digest",
    label: "สรุปดีลที่นิ่ง (รายวัน)",
    title: "ดีลที่ต้องดู {{count}} ดีล",
    body: "มีดีลที่นิ่งเกินกำหนดอยู่ {{count}} ดีล — เปิดดูรายการแล้วเลือกว่าจะติดตามหรือปิดเป็นแพ้",
    defaults: ch(true, false, true),
    digest: true,
    recipients: "ผู้ดูแลดีล และหัวหน้าทีมของดีลนั้น",
  },
  {
    key: "tasks.today",
    label: "สรุปงานของวันนี้และงานค้าง",
    title: "งานวันนี้ {{count}} รายการ",
    body: "คุณมีงานติดตามที่ถึงกำหนดหรือค้างอยู่ {{count}} รายการ — เปิดดูรายการงานของคุณได้เลย",
    defaults: ch(true, true, false),
    digest: true,
    recipients: "เจ้าของงาน",
  },
  {
    key: "activity.reminder",
    label: "เตือนก่อนถึงนัดหรืองานติดตาม",
    title: "ใกล้ถึงเวลานัดแล้ว",
    body: "อีกไม่นานจะถึงเวลานัด/งานติดตามที่คุณตั้งไว้ — เปิดดูรายละเอียดเพื่อเตรียมตัว",
    defaults: ch(true, true, false),
    recipients: "ผู้เข้าร่วมและเจ้าของงาน",
  },
  {
    key: "lead.hot",
    label: "lead ร้อน (คะแนนขึ้นถึงระดับร้อน)",
    title: "มี lead ร้อนให้ติดตาม",
    body: "มีผู้ติดต่อที่คะแนนขึ้นถึงระดับร้อน {{count}} ราย — โทรตามวันนี้ได้ผลที่สุด",
    defaults: ch(true, true, true),
    recipients: "ผู้ดูแล",
  },
  {
    key: "deal.closed",
    label: "ดีลปิดแล้ว (ชนะหรือแพ้)",
    title: "ดีลปิดแล้ว",
    body: "มีดีลในทีมของคุณปิดเรียบร้อยแล้ว — เปิดดูผลและเหตุผลที่บันทึกไว้",
    defaults: ch(true, true, false),
    recipients: "ทีมของดีล และหัวหน้าทีม",
  },
  {
    key: "commission.status",
    label: "คอมมิชชันรออนุมัติหรืออนุมัติแล้ว",
    title: "สถานะคอมมิชชันเปลี่ยน",
    body: "มีรายการคอมมิชชันที่สถานะเปลี่ยน — เปิดดูรายการเพื่อตรวจหรืออนุมัติ",
    defaults: ch(true, true, false),
    recipients: "ผู้จัดการ และพนักงานเจ้าของรายการ",
  },
  {
    key: "quota.progress",
    label: "โควตาถึง 80% หรือครบ 100%",
    title: "ความคืบหน้าโควตา {{count}}%",
    body: "โควตาของงวดนี้เดินมาถึง {{count}}% แล้ว — เปิดดูรายละเอียดของงวด",
    defaults: ch(true, false, false),
    recipients: "เจ้าของโควตา และหัวหน้าทีม",
  },
  {
    key: "invoice.paid",
    label: "ใบแจ้งหนี้ของดีลชำระแล้ว หรือเอกสารถูกยกเลิก",
    title: "สถานะเอกสารของดีลเปลี่ยน",
    body: "เอกสารของดีลที่คุณดูแลเปลี่ยนสถานะ (ชำระแล้ว หรือถูกยกเลิก) — เปิดดูดีลเพื่อตรวจยอด",
    defaults: ch(true, false, false),
    recipients: "ผู้ดูแลดีล",
  },
] as const);

/** ช่วงห้ามรบกวนปริยายของร้าน (เวลาไทย) */
export const CRM_QUIET_DEFAULT: Readonly<CrmNotifQuietHours> = Object.freeze({ enabled: true, from: "21:00", to: "07:00" });
/** ชั่วโมงที่ส่งสรุปรายวันปริยาย (เวลาไทย) */
export const CRM_DIGEST_HOUR_DEFAULT = 8;
/** จำนวนวันที่ถือว่า "ดีลนิ่ง" เมื่อขั้นนั้นไม่ได้ตั้งค่าไว้เอง (`settings.crm.staleDaysDefault`) */
export const CRM_STALE_DAYS_DEFAULT = 14;
/** ย้อนหลังของรอบกวาด "ของที่เลื่อนไว้" — เก่ากว่านี้ถือว่าเลยเวลาบอกไปแล้ว (ไปอ่านในแอปเอา) */
export const CRM_FANOUT_LOOKBACK_MS = 36 * 3_600_000;
/** เพดานความยาวของ payload push (ไบต์โดยประมาณ) — push คือกระดิ่ง ไม่ใช่เอกสาร */
export const CRM_PUSH_MAX_BYTES = 600;

export type CrmNotifQuietHours = { enabled: boolean; from: string; to: string };

/** มุมมองของเทมเพลต 1 ตัวที่หน้าตั้งค่าเห็น (ค่าของร้าน = ค่าเริ่มต้น + ที่ร้านแก้) */
export type CrmNotifTemplateView = {
  key: CrmNotifKey;
  label: string;
  title: string;
  body: string;
  digest: boolean;
  recipients: string;
  channels: CrmNotifChannelMap;
};

/** มุมมองทั้งก้อนที่ `getNotificationSettings` คืน */
export type CrmNotifSettingsView = {
  templates: Record<string, CrmNotifTemplateView>;
  quietHours: CrmNotifQuietHours;
  digestHour: number;
};

/** สิ่งที่ผู้ใช้ตั้งเองได้ (`CrmUserPref`) */
export type CrmUserPrefView = {
  /** ทับค่าร้านต่อ (เทมเพลต × ช่องทาง) — ไม่มีคีย์ = ใช้ค่าร้าน */
  notifications: Record<string, Partial<CrmNotifChannelMap>>;
  /** ช่วงห้ามรบกวนของตัวเอง — null = ใช้ของร้าน */
  quietHours: CrmNotifQuietHours | null;
};

export type CrmNotifTemplatePatch = { title?: string; body?: string; channels?: Partial<Record<string, boolean>> };
export type CrmNotifSettingsPatch = { quietHours?: Partial<CrmNotifQuietHours>; digestHour?: number };
export type CrmUserPrefPatch = { notifications?: Record<string, Partial<Record<string, boolean>>>; quietHours?: Partial<CrmNotifQuietHours> | null };

type Json = unknown;
const isObj = (v: Json): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export const isCrmNotifKey = (v: unknown): v is CrmNotifKey => typeof v === "string" && (CRM_NOTIF_KEYS as readonly string[]).includes(v);
export const isCrmNotifChannel = (v: unknown): v is CrmNotifChannel => typeof v === "string" && (CRM_NOTIF_CHANNELS as readonly string[]).includes(v);

const templateOf = (key: CrmNotifKey): CrmNotifTemplateDef => CRM_NOTIF_TEMPLATES.find((t) => t.key === key) ?? CRM_NOTIF_TEMPLATES[0]!;

/** ค่าเริ่มต้นทั้งก้อน (ยังไม่มีร้านไหนแก้) */
export function crmNotifDefaults(): CrmNotifSettingsView {
  const templates: Record<string, CrmNotifTemplateView> = {};
  for (const t of CRM_NOTIF_TEMPLATES) {
    templates[t.key] = {
      key: t.key,
      label: t.label,
      title: t.title,
      body: t.body,
      digest: t.digest === true,
      recipients: t.recipients,
      channels: { ...t.defaults },
    };
  }
  return { templates, quietHours: { ...CRM_QUIET_DEFAULT }, digestHour: CRM_DIGEST_HOUR_DEFAULT };
}

function quietOf(raw: Json, fallback: CrmNotifQuietHours): CrmNotifQuietHours {
  if (!isObj(raw)) return { ...fallback };
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : fallback.enabled,
    from: typeof raw.from === "string" && /^([01]?\d|2[0-3]):([0-5]\d)$/.test(raw.from) ? raw.from : fallback.from,
    to: typeof raw.to === "string" && /^([01]?\d|2[0-3]):([0-5]\d)$/.test(raw.to) ? raw.to : fallback.to,
  };
}

/**
 * แปลง `AppSystem.settings.crm.notifications` (JSON ที่ไม่รู้ทรงล่วงหน้า) → มุมมองที่ใช้ได้
 * ค่าเพี้ยน/ไม่ได้ตั้ง = ค่าเริ่มต้น (ไม่ throw — ตั้งค่าเพี้ยนต้องไม่ทำให้ระบบหยุดแจ้งเตือน)
 */
export function parseCrmNotifSettings(raw: Json): CrmNotifSettingsView {
  const out = crmNotifDefaults();
  if (!isObj(raw)) return out;
  const tpl = isObj(raw.templates) ? raw.templates : {};
  for (const key of CRM_NOTIF_KEYS) {
    const stored = tpl[key];
    if (!isObj(stored)) continue;
    const view = out.templates[key]!;
    if (typeof stored.title === "string" && stored.title.trim()) view.title = stored.title.trim();
    if (typeof stored.body === "string" && stored.body.trim()) view.body = stored.body.trim();
    if (isObj(stored.channels)) {
      for (const c of CRM_NOTIF_CHANNELS) {
        const v = stored.channels[c];
        if (typeof v === "boolean") view.channels[c] = v;
      }
    }
  }
  out.quietHours = quietOf(raw.quietHours, CRM_QUIET_DEFAULT);
  const hour = Number(raw.digestHour);
  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) out.digestHour = hour;
  return out;
}

/** แปลงแถว `CrmUserPref` → มุมมอง (ค่าเพี้ยน = "ไม่ได้ตั้ง") */
export function parseCrmUserPref(notifications: Json, quietHours: Json): CrmUserPrefView {
  const out: CrmUserPrefView = { notifications: {}, quietHours: null };
  if (isObj(notifications)) {
    for (const [key, val] of Object.entries(notifications)) {
      if (!isCrmNotifKey(key) || !isObj(val)) continue;
      const one: Partial<CrmNotifChannelMap> = {};
      for (const c of CRM_NOTIF_CHANNELS) {
        const v = val[c];
        if (typeof v === "boolean") one[c] = v;
      }
      if (Object.keys(one).length > 0) out.notifications[key] = one;
    }
  }
  if (isObj(quietHours)) {
    const q = quietOf(quietHours, CRM_QUIET_DEFAULT);
    out.quietHours = q;
  }
  return out;
}

/**
 * ช่องทางที่ "มีผลจริง" ของคนคนนี้กับเรื่องนี้ = ค่าของร้าน **ผสมกับ** ค่าที่เจ้าตัวตั้งทับ
 * 🔴 เจ้าตัวชนะเสมอเมื่อเขาตั้งไว้ — รวมถึงการ "เปิดกลับ" ช่องทางที่ร้านปิด (มติ C22: ไม่งั้นค่ารายคนแทบไร้ความหมาย)
 */
export function effectiveChannels(shop: CrmNotifChannelMap, mine: Partial<CrmNotifChannelMap> | undefined): CrmNotifChannelMap {
  const out: CrmNotifChannelMap = { ...shop };
  if (!mine) return out;
  for (const c of CRM_NOTIF_CHANNELS) {
    const v = mine[c];
    if (typeof v === "boolean") out[c] = v;
  }
  return out;
}

/** แทน {{ตัวแปร}} ด้วยค่าที่ส่งมา (ตัวที่ไม่มีค่า = ตัดออก ไม่ปล่อยให้ผู้ใช้เห็น {{…}}) */
export function renderCrmNotif(text: string, vars: Record<string, string | number> = {}): string {
  return String(text ?? "")
    .replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, name: string) => {
      const v = vars[name];
      return v === undefined || v === null ? "" : String(v);
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** ชนิดของระเบียนแม่ → ทางเดินของลิงก์ลึกในเนื้อความ (ตัวที่ไม่รู้จัก = หน้าแรกของโมดูล) */
export function crmNotifPath(refType: string, refId: string): string {
  const id = String(refId ?? "").trim();
  if (refType === "CrmDeal" && id) return `/deals/${id}`;
  if (refType === "CrmContact" && id) return `/contacts/${id}`;
  if (refType === "CrmCompany" && id) return `/companies/${id}`;
  if (refType === "CrmActivity") return "/activities";
  if (refType === "CrmStaleDeals") return "/deals";
  return "/deals";
}

/**
 * ลิงก์ลึกของใบแจ้งเตือน — **ธงกันซ้ำและตัวเลือกของรอบกวาดด้วย** (ห้ามใครลบ `?n=` / `&nd=`)
 * รูป: `/app/sys/<systemId>/crm<path>?n=<คีย์เทมเพลต>&nd=<วันไทย YYYY-MM-DD>&r=<รหัสระเบียน>`
 *   • `n`  = คีย์เทมเพลต ⇒ รอบกวาด `runFanout` รู้ว่าใบนี้เป็นเรื่องอะไร (ไปอ่านช่องทางที่เจ้าตัวเปิดไว้)
 *   • `nd` = **วันไทยของเหตุการณ์**
 *   • `r`  = **รหัสระเบียน** (มติผู้คุมงานรอบแก้ 25 ก.ย. 2569 ข้อ 5 — B3)
 *     🔴 ทำไมต้องมีทั้งที่ทางเดินก็มีรหัสอยู่แล้ว: `crmNotifPath` ใส่รหัสลงทางเดินได้เฉพาะ deal/contact/company —
 *        `CrmActivity` ไปที่ `/activities` เฉย ๆ และ `CrmStaleDeals` ไปที่ `/deals` ⇒ ก่อนแก้ งานติดตามสองใบของคนเดียวกัน
 *        ในวันเดียวกันมีลิงก์ **เหมือนกันทุกตัวอักษร** ⇒ ใบที่สองถูกกลืนเป็น "ซ้ำ" (ข่าวหาย ไม่ใช่กันซ้ำ)
 *     ⇒ กุญแจกันซ้ำครบทั้งห้าส่วน (ผู้รับ · เทมเพลต · ชนิด · **รหัส** · วันไทย) อยู่ในสตริงเดียวสำหรับทุก refType
 * 🔴 ทำไมวันต้องอยู่ในลิงก์ ไม่ใช่เทียบ `createdAt`: `createdAt` มาจากนาฬิกาของฐาน ส่วน "วัน" ของธุรกิจมาจาก `now`
 *    ที่ผู้เรียก (cron/ข้อสอบ) ส่งมา — สองอย่างนี้ไม่ใช่ตัวเดียวกัน (งานที่รันย้อนหลัง/ข้อสอบที่ตั้งนาฬิกาสมมุติ
 *    จะกันซ้ำพลาดทันทีถ้าใช้ `createdAt` เป็นตัวตัดสินวัน)
 * (ตาราง `AppNotification` เป็นของกลางทั้งแพลตฟอร์ม — ไม่มีคอลัมน์คีย์ให้ใช้ และใบนี้ห้ามเพิ่มคอลัมน์ · R-C.1)
 */
export function crmNotifLink(systemId: string, refType: string, refId: string, key: CrmNotifKey, thaiDay: string): string {
  return `/app/sys/${systemId}/crm${crmNotifPath(refType, refId)}?n=${key}&nd=${thaiDay}&r=${refIdParam(refId)}`;
}

/** รหัสระเบียนในรูปที่ใส่ใน query ได้ (cuid ปลอดภัยอยู่แล้ว · ตัวอื่นถูกตัดให้เหลือชุดที่ regex ของตัวอ่านรับ) */
function refIdParam(refId: string): string {
  return String(refId ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

/** ป้ายบอกว่าใบแจ้งเตือนใบนี้เป็นของ CRM v2 (ตัวกรองแรกของรอบกวาด) */
export const CRM_NOTIF_LINK_MARK = "/crm/";
/**
 * ดึงส่วนประกอบของกุญแจกันซ้ำกลับจากเนื้อความ (`null` = ไม่ใช่ใบของ CRM v2)
 * คืน systemId · คีย์เทมเพลต · วันไทย · **รหัสระเบียน** (`refId` — อาจเป็น "" ในใบเก่าที่เขียนก่อนรอบแก้นี้)
 */
export function parseCrmNotifLink(body: string): { systemId: string; key: CrmNotifKey; thaiDay: string; refId: string } | null {
  const m = /\/app\/sys\/([A-Za-z0-9_-]+)\/crm[^\s?]*\?n=([A-Za-z0-9._-]+)(?:&nd=([0-9-]+))?(?:&r=([A-Za-z0-9_-]*))?/.exec(String(body ?? ""));
  if (!m) return null;
  const key = m[2] ?? "";
  if (!isCrmNotifKey(key)) return null;
  return { systemId: m[1] ?? "", key, thaiDay: m[3] ?? "", refId: m[4] ?? "" };
}

/** ป้ายไทยของช่องทาง (หน้าตั้งค่า) */
export const CRM_NOTIF_CHANNEL_LABEL: Readonly<Record<CrmNotifChannel, string>> = Object.freeze({
  IN_APP: "ในแอป",
  PUSH: "แจ้งเตือนบนมือถือ",
  EMAIL: "อีเมล",
});

export { templateOf as crmNotifTemplateOf };
