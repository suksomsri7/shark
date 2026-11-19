// push-msg.ts — ข้อความ push ของปฏิทิน (CAL1.4/1.5 · สัญญา §7) — **บริสุทธิ์ล้วน**
//   🔴 ไม่มีเบอร์เต็มใน payload (R-CAL-34) · ไม่มี badge (มติ Q3) · ข้อมูลของสิ่งที่ผูกใส่เฉพาะเมื่อผู้ใช้ยังอ่านได้ (R-CAL-23)
import { bkkDayNo, dayNoToYmd, BKK_OFFSET_MS, type FireReason } from "./next-fire";

export const CATEGORY_CAL = "SEC_CAL";
export const CATEGORY_CAL_CALL = "SEC_CAL_CALL";
const TITLE_MAX = 64;
export const BRIEF_BODY_MAX = 178;

export type CalPushMsg = { title: string; body: string; data: Record<string, unknown>; categoryId?: string };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ฿12,000 (สตางค์ → บาท · ตัดสตางค์ทิ้งเมื่อเป็น 0) */
export function satang(v: number): string {
  const baht = v / 100;
  return `฿${baht.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(baht) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** เบอร์แบบปิด "08x-xxx-4421" (ไทย · +66 → 0) · ไม่มี/สั้นเกิน = null */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.length < 8) return null;
  return `${d.slice(0, 2)}x-xxx-${d.slice(-4)}`;
}

/** HH:MM ไทย */
export function hhmm(d: Date): string {
  const t = new Date(+d + BKK_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

export type FireMsgItem = {
  id: string;
  tenantId: string;
  kind: "REMINDER" | "EVENT";
  title: string;
  note: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  linkType: string | null;
};
/** ข้อมูลล่าสุดของสิ่งที่ผูก (อ่านได้เท่านั้น · null = ไม่ผูก/อ่านไม่ได้แล้ว) */
export type FireMsgLink = { body: string; phone: string | null } | null;

/** §7.1 เตือนถึงเวลา — `occ` = occurrence ที่แจ้ง (ส่งกลับใน done) */
export function fireMessage(item: FireMsgItem, reason: FireReason, occ: Date, link: FireMsgLink): CalPushMsg {
  const title = cut(`🔔 ${reason === "NAG" ? "ย้ำ: " : ""}${item.title}`, TITLE_MAX);
  let body: string;
  if (link) body = link.body;
  else if (item.note && item.note.trim()) body = item.note.trim().split(/\r?\n/)[0]!;
  else if (item.kind === "EVENT") {
    const dur = item.endAt ? +item.endAt - +item.startAt : 0;
    body = item.allDay ? "ทั้งวัน · นัดส่วนตัว" : `${hhmm(occ)}${dur > 0 ? `–${hhmm(new Date(+occ + dur))}` : ""} · นัดส่วนตัว`;
  } else body = `${item.allDay ? "ทั้งวัน" : hhmm(occ)} · เตือนฉัน`;
  const day = dayNoToYmd(bkkDayNo(occ));
  const call = !!link?.phone && (item.linkType === "CRM_CONTACT" || item.linkType === "CRM_DEAL");
  return {
    title,
    body: cut(body, BRIEF_BODY_MAX),
    data: { type: "cal", link: `/secretary/calendar?day=${day}&item=${item.id}`, tenantId: item.tenantId, itemId: item.id, occ: occ.toISOString() },
    categoryId: call ? CATEGORY_CAL_CALL : CATEGORY_CAL,
  };
}

/** §7.2 สรุปเช้า/เย็น — ไม่มี categoryId · ไม่มี badge */
export function briefMessage(o: { kind: "morning" | "evening"; tenantId: string; tenantName: string; day: string; lines: string[] }): CalPushMsg {
  const title = o.kind === "morning" ? `☀️ สรุปวันนี้ · ${o.tenantName}` : `🌙 พรุ่งนี้ · ${o.tenantName}`;
  return {
    title: cut(title, TITLE_MAX),
    body: cut(o.lines.join(" · "), BRIEF_BODY_MAX),
    data: { type: "cal_brief", link: `/secretary/calendar?day=${o.day}`, tenantId: o.tenantId },
  };
}
