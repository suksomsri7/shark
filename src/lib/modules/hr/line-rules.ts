// HR H4.5 ▸ กติกาล้วนของแจ้งเตือนพนักงานผ่าน LINE (brief hr-brief-H4.5 R2 · มติผู้คุม Q6) — ไม่แตะฐาน ไม่ import แชท/แพลตฟอร์ม
//   ข้อความ = ชนิดเหตุการณ์ + คำผลลัพธ์เท่านั้น (ตาราง MSG ของข้อสอบ ทุกไบต์ ไทย + อังกฤษ) — ไม่มีชื่อคน · วันที่ · ประเภทลา · เหตุผล · งวด · เงิน · สาขา
//   ลิงก์ไม่มี token/รหัสร้าน — เปิดแล้วต้องล็อกอิน + ผ่านด่าน "ของฉัน" เอง · ส่งต่อข้อความ = รู้แค่ "มีเหตุการณ์ชนิดนี้"
//   ใช้ร่วม: hr/line-notify.ts (แจ้งในแอป · คีย์กันซ้ำ) · platform/hr-line.ts (ประกอบ Flex · เวลาส่งซ้ำ) ◂

export type HrNoticeKind = "ROSTER" | "LEAVE" | "OT" | "SWAP_ASK" | "SWAP" | "SLIP" | "DIGEST";
export const HR_NOTICE_KINDS: readonly HrNoticeKind[] = ["ROSTER", "LEAVE", "OT", "SWAP_ASK", "SWAP", "SLIP", "DIGEST"];
export type HrLineLocale = "th" | "en";
/** ชนิดเหตุการณ์ที่ร้านเปิด/ปิดได้ทีละตัว (SWAP คุมทั้งคำขอสลับกะและผลอนุมัติ) */
export type HrLineEvent = "ROSTER" | "LEAVE" | "OT" | "SWAP" | "SLIP";
export const HR_LINE_EVENTS: readonly HrLineEvent[] = ["ROSTER", "LEAVE", "OT", "SWAP", "SLIP"];
export const eventOfKind = (kind: string): HrLineEvent | null =>
  kind === "SWAP_ASK" || kind === "SWAP" ? "SWAP" : (HR_LINE_EVENTS as readonly string[]).includes(kind) ? (kind as HrLineEvent) : null;

/** ข้อความคงที่ภาษาไทย (คีย์ "<ชนิด>" หรือ "<ชนิด>:<ผล>" = ประโยคแจ้งเตือน · ที่เหลือ = เมนู/ผลการผูก) */
export const HR_LINE_TEXT: Record<string, string> = {
  ROSTER: "ตารางกะของคุณมีการอัปเดต",
  "LEAVE:APPROVED": "ใบลาของคุณได้รับอนุมัติแล้ว",
  "LEAVE:REJECTED": "ใบลาของคุณไม่ได้รับอนุมัติ",
  "OT:APPROVED": "คำขอ OT ของคุณได้รับอนุมัติแล้ว",
  "OT:REJECTED": "คำขอ OT ของคุณไม่ได้รับอนุมัติ",
  "OT:CANCELLED": "คำขอ OT ของคุณถูกยกเลิก",
  SWAP_ASK: "มีคำขอสลับกะส่งถึงคุณ",
  "SWAP:APPROVED": "คำขอสลับกะได้รับอนุมัติแล้ว",
  SLIP: "สลิปเงินเดือนของคุณพร้อมให้ดูแล้ว",
  DIGEST: "คุณมีแจ้งเตือนใหม่ {n} รายการ",
  FOOTER: "ต้องเข้าสู่ระบบ SHARK ก่อนจึงจะเปิดดูได้",
  BUTTON: "เปิดดู",
  linked: "ผูก LINE กับบัญชีพนักงานเรียบร้อยแล้ว — ต่อไปจะได้รับแจ้งเตือนงานทางแชทนี้ (ต้องเข้าสู่ระบบ SHARK ก่อนเปิดดูทุกครั้ง)",
  notLinked: "LINE นี้ยังไม่ได้ผูกกับบัญชีพนักงาน — ขอรหัสผูกได้ที่หน้า ของฉัน ในแอป SHARK",
  unlinked: "ยกเลิกการผูก LINE กับบัญชีพนักงานแล้ว — จะไม่ได้รับแจ้งเตือนงานทางแชทนี้อีก",
  menuTitle: "เมนูพนักงาน",
  menuWeek: "ตารางกะของฉัน",
  menuRequests: "คำขอของฉัน",
  menuLeave: "ยื่นใบลา",
  menuPay: "สลิปเงินเดือน",
  appBody: "เปิดดูรายละเอียดได้ที่หน้า ของฉัน ในแอป SHARK",
  appLinked: "บัญชีพนักงานของคุณผูกกับ LINE แล้ว — ถ้าไม่ได้ทำเอง ให้กดยกเลิกการผูกที่หน้า ของฉัน",
};
/** ข้อความคงที่ภาษาอังกฤษ (คีย์เดียวกันทุกตัว · ASCII ล้วน) */
export const HR_LINE_TEXT_EN: Record<string, string> = {
  ROSTER: "Your shift roster has been updated.",
  "LEAVE:APPROVED": "Your leave request was approved.",
  "LEAVE:REJECTED": "Your leave request was not approved.",
  "OT:APPROVED": "Your OT request was approved.",
  "OT:REJECTED": "Your OT request was not approved.",
  "OT:CANCELLED": "Your OT request was cancelled.",
  SWAP_ASK: "You have a new shift swap request.",
  "SWAP:APPROVED": "A shift swap was approved.",
  SLIP: "Your payslip is ready.",
  DIGEST: "You have {n} new notices.",
  FOOTER: "Log in to SHARK to view.",
  BUTTON: "Open",
  linked: "LINE is now linked to your staff account. Work notices will arrive in this chat (log in to SHARK to view them).",
  notLinked: "This LINE account is not linked to a staff account. Get a link code from My page in the SHARK app.",
  unlinked: "LINE is no longer linked to your staff account. Work notices will stop in this chat.",
  menuTitle: "Staff menu",
  menuWeek: "My shifts",
  menuRequests: "My requests",
  menuLeave: "Request leave",
  menuPay: "Payslips",
  appBody: "Open My page in the SHARK app for details.",
  appLinked: "Your staff account is now linked to LINE. If this was not you, unlink it on My page.",
};
export const lineTextOf = (locale: HrLineLocale) => (locale === "en" ? HR_LINE_TEXT_EN : HR_LINE_TEXT);

const OUTCOMES: Record<string, readonly string[]> = { LEAVE: ["APPROVED", "REJECTED"], OT: ["APPROVED", "REJECTED", "CANCELLED"], SWAP: ["APPROVED"] };
/** คีย์ประโยคของ (ชนิด, ผล) — ชนิด/ผลที่ไม่รู้จัก ⇒ null (ไม่ส่ง) */
export function sentenceKeyOf(kind: unknown, outcome: unknown): string | null {
  if (typeof kind !== "string" || !(HR_NOTICE_KINDS as readonly string[]).includes(kind)) return null;
  const allowed = OUTCOMES[kind];
  if (!allowed) return kind;
  return typeof outcome === "string" && allowed.includes(outcome) ? `${kind}:${outcome}` : null;
}

/** ประโยคแจ้งเตือน (DIGEST แทน {n} ด้วยจำนวนเต็มบวก) — อ่านเฉพาะ kind/outcome/n · ช่องอื่นของ input ไม่ถูกอ่าน (P1) */
function sentenceOf(i: { kind?: unknown; outcome?: unknown; n?: unknown }, locale: HrLineLocale): string | null {
  const key = sentenceKeyOf(i?.kind, i?.outcome ?? null);
  if (!key) return null;
  const s = lineTextOf(locale)[key];
  if (!s) return null;
  if (key !== "DIGEST") return s;
  const n = typeof i?.n === "number" && Number.isInteger(i.n) && i.n > 0 && i.n < 100_000 ? i.n : 1;
  return s.replace("{n}", String(n));
}

/**
 * ข้อความ LINE ของแจ้งเตือน 1 ใบ: altText = ประโยค · Flex = ประโยค + ข้อความคงที่ "ต้องเข้าสู่ระบบ" + ปุ่ม uri เดียว (href ที่ผู้เรียกให้)
 * ชนิด/ผลที่ไม่รู้จัก ⇒ null
 */
export function noticeMessage(
  i: { kind: string; outcome?: string | null; n?: number },
  locale: HrLineLocale,
  href: string,
): { altText: string; flex: Record<string, unknown> } | null {
  const loc: HrLineLocale = locale === "en" ? "en" : "th";
  const s = sentenceOf(i, loc);
  if (!s || typeof href !== "string" || !href) return null;
  const T = lineTextOf(loc);
  return {
    altText: s,
    flex: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: s, wrap: true, weight: "bold", size: "md" },
          { type: "text", text: T.FOOTER, wrap: true, size: "xs" },
        ],
      },
      footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", height: "sm", action: { type: "uri", label: T.BUTTON, uri: href } }] },
    },
  };
}

/** แจ้งในแอป (ข้อความไทยคงที่ — หัวเรื่อง = ประโยคเดียวกับ LINE) */
export function appNoteOf(kind: string, outcome: string | null): { title: string; body: string } | null {
  const key = sentenceKeyOf(kind, outcome);
  if (!key || key === "DIGEST") return null;
  return { title: HR_LINE_TEXT[key]!, body: HR_LINE_TEXT.appBody! };
}

const SAFE_REF = /^[A-Za-z0-9_-]{1,100}$/;
/** ทางไปหน้า "ของฉัน" ของแจ้งเตือน (path สัมพัทธ์ · ไม่มีรหัสร้าน/ระบบ/พนักงาน · ไม่มี query/token) — F7 */
export function hrefOf(i: { kind: string; refId?: string | null }): string | null {
  const ref = typeof i?.refId === "string" && SAFE_REF.test(i.refId) ? i.refId : "";
  switch (i?.kind) {
    case "ROSTER":
      return "/app/me/hr/week";
    case "LEAVE":
      return ref ? `/app/me/hr/requests#req-leave-${ref}` : "/app/me/hr/requests";
    case "OT":
      return ref ? `/app/me/hr/requests#req-ot-${ref}` : "/app/me/hr/requests";
    case "SWAP_ASK":
    case "SWAP":
      return ref ? `/app/me/hr/requests#req-swap-${ref}` : "/app/me/hr/requests";
    case "SLIP":
      return ref ? `/app/me/hr/pay/${ref}` : "/app/me/hr/pay";
    case "DIGEST":
      return "/app/me/hr";
    default:
      return null;
  }
}

/** คีย์กันซ้ำ = hr:<kind>:<refId>:<employeeId>[:<outcome>] (id ล้วน) */
export function dedupeKeyOf(i: { kind: string; refId: string; employeeId: string; outcome?: string | null }): string {
  return `hr:${i.kind}:${i.refId}:${i.employeeId}${i.outcome ? `:${i.outcome}` : ""}`;
}

const BACKOFF_MIN = [5, 30, 120] as const;
/** เวลาส่งซ้ำหลังพยายามครั้งที่ `attempts` (1 ครั้ง + ส่งซ้ำ 3 ครั้ง · มติผู้คุม 2) — ครบ 4 ครั้ง ⇒ null (จบ FAILED) */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  const m = Number.isInteger(attempts) && attempts >= 1 ? BACKOFF_MIN[attempts - 1] : undefined;
  return m === undefined ? null : new Date(now.getTime() + m * 60_000);
}
/** จำนวนครั้งสูงสุดที่ยิงไป LINE ต่อแจ้งเตือน */
export const LINE_MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

export type LineNotifyPolicy = {
  enabled: boolean;
  events: Record<HrLineEvent, boolean>;
  mode: "IMMEDIATE" | "DIGEST";
  digestAt: string;
  monthlyCap: number;
  unitId: string | null;
};
export const LINE_CAP_RANGE = { min: 0, max: 5000 } as const;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** ค่าตั้ง `AppSystem.settings.lineNotify` → นโยบาย (ค่าเสียรายช่อง = ค่าเริ่มต้นของช่องนั้น · ค่าเริ่มต้น = ปิด · ทันที · 17:30 · 200/เดือน) */
export function lineNotifyPolicyOf(v: unknown): LineNotifyPolicy {
  const o = isRec(v) ? v : {};
  const ev = isRec(o.events) ? o.events : {};
  const events = Object.fromEntries(HR_LINE_EVENTS.map((k) => [k, typeof ev[k] === "boolean" ? (ev[k] as boolean) : true])) as Record<HrLineEvent, boolean>;
  const cap = o.monthlyCap;
  return {
    enabled: o.enabled === true,
    events,
    mode: o.mode === "DIGEST" ? "DIGEST" : "IMMEDIATE",
    digestAt: typeof o.digestAt === "string" && HM_RE.test(o.digestAt) ? o.digestAt : "17:30",
    monthlyCap: typeof cap === "number" && Number.isInteger(cap) && cap >= LINE_CAP_RANGE.min && cap <= LINE_CAP_RANGE.max ? cap : 200,
    unitId: typeof o.unitId === "string" && o.unitId.trim() ? o.unitId.trim() : null,
  };
}
export const isDigestAt = (v: unknown): v is string => typeof v === "string" && HM_RE.test(v);

const BKK_MS = 7 * 3_600_000;
/** "YYYY-MM" ของเดือนตามเวลาไทย */
export function monthKeyBkk(d: Date): string {
  return new Date(d.getTime() + BKK_MS).toISOString().slice(0, 7);
}
/** ช่วง [ต้นเดือน, ต้นเดือนถัดไป) ตามเวลาไทยของ `d` (เป็นเวลา UTC จริง) */
export function monthRangeBkk(d: Date): { from: Date; to: Date } {
  const t = new Date(d.getTime() + BKK_MS);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1) - BKK_MS), to: new Date(Date.UTC(y, m + 1, 1) - BKK_MS) };
}
/** "YYYY-MM-DD" ตามเวลาไทย */
export const dayKeyBkk = (d: Date): string => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
/** นาทีจากเที่ยงคืนตามเวลาไทย */
export const minuteOfDayBkk = (d: Date): number => {
  const t = new Date(d.getTime() + BKK_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
export const hmToMin = (hm: string): number => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
