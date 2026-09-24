// types.ts — ชนิดข้อมูลที่หน้า server ส่งให้หน้าจอฝั่ง client ของ "ระบบอีเมล CRM" (ใบ C2.5b · ภาพ 08 กลาง · ภาพ 15)
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ของ fitness ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ⇒ ทะเบียนโหมด/ป้ายภาษาไทย/เพดานค่า และ **HTML ของจดหมายที่ผ่านตัวตัดแล้ว** มาจากหน้า server ทาง props ทั้งชุด
// 🔴 ไม่มี cdnUrl / path ของที่เก็บ / ค่าหมาย private:// ในชนิดใดเลย (AUDIT-CLASS X10) — ไฟล์แนบเปิดผ่าน
//    ลิงก์ชั่วคราวที่ออกตอนกดเท่านั้น (`attachmentUrl` ฝั่ง server)

export type CrmEmailOption = { value: string; label: string; hint?: string };

export type CrmEmailActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

// ───────────────────────── กล่องจดหมาย ─────────────────────────

export type CrmEmailThreadRow = {
  threadKey: string;
  subject: string;
  /** เวลาแบบพร้อมแสดง (คิดเป็นเวลาไทยที่ฝั่ง server แล้ว) */
  lastAtLabel: string;
  count: number;
  contactId: string | null;
  contactName: string | null;
  companyName: string | null;
  direction: "IN" | "OUT";
  snippet: string | null;
  unread: boolean;
};

/**
 * กล่อง "การส่งของฉัน" บนหน้ากล่องจดหมาย — แถวทับค่าของ **ตัวเอง** (คีย์ crm.email.send)
 * คนที่ส่งจดหมายไม่ได้เข้าหน้า /settings/email (คีย์ crm.email.settings) จึงต้องมีทางแก้แถวของตัวเองที่นี่
 */
export type CrmEmailMySendingData = {
  systemId: string;
  userName: string;
  userEmail: string | null;
  /** ร้านเปิดให้ทับค่ารายคนไหม (ปิด = แก้ได้แต่ระบบจะไม่ใช้ค่านี้จนกว่าเจ้าของร้านเปิด) */
  allowUserOverride: boolean;
  fromName: string | null;
  replyToMode: string;
  replyToAddr: string | null;
  signatureHtml: string | null;
  replyModes: CrmEmailOption[];
};

export type CrmEmailInboxData = {
  systemId: string;
  /** กล่องที่กำลังเปิด — "all" = จดหมายที่จับคู่แล้ว · "unmatched" = ยังไม่รู้ว่าเป็นของใคร */
  box: "all" | "unmatched";
  /** เปิดกล่อง "ยังไม่จับคู่" ได้ไหม (ต้องเห็นผู้ติดต่อทั้งระบบ หรือเป็นผู้จัดการ/เจ้าของร้าน) */
  canSeeUnmatched: boolean;
  q: string;
  items: CrmEmailThreadRow[];
  total: number;
  /** กล่อง "การส่งของฉัน" — null = บัญชีนี้ส่งจดหมายไม่ได้ (ไม่ต้องขึ้นกล่อง) */
  mySending: CrmEmailMySendingData | null;
};

// ───────────────────────── เธรด ─────────────────────────

export type CrmEmailAttachmentRow = { fileId: string; name: string; size: number; mime: string };

export type CrmEmailMessageView = {
  id: string;
  direction: "IN" | "OUT";
  fromLabel: string;
  toLabel: string;
  subject: string;
  /** ข้อความล้วน (ใช้เมื่อไม่มี HTML) */
  bodyText: string | null;
  /**
   * HTML ของจดหมายที่ **ผ่านตัวตัดของ core แล้วสองรูป** (คิดฝั่ง server ด้วย `renderInboundHtml`)
   * `safeHtmlNoImages` = ไม่มี element ใดโหลด URL ปลายทางเลย (ค่าที่หน้าเปิดมาครั้งแรก)
   * `safeHtmlWithImages` = เก็บ `<img src="https://…">` ไว้ (แสดงเมื่อพนักงานกด "แสดงรูป" เอง)
   * ทั้งคู่ถูกใส่ใน `<iframe sandbox="">` (ค่าว่าง = ไม่ปลดสิทธิ์ใดให้เอกสารข้างในเลย)
   */
  safeHtmlNoImages: string | null;
  safeHtmlWithImages: string | null;
  /** จดหมายฉบับนี้มีรูปจากภายนอกไหม (ไม่มี = ไม่ต้องขึ้นปุ่ม "แสดงรูป") */
  hasRemoteImages: boolean;
  attachments: CrmEmailAttachmentRow[];
  statusLabel: string;
  atLabel: string;
  openCount: number;
  clickCount: number;
  repliedAtLabel: string | null;
  purged: boolean;
};

export type CrmEmailThreadData = {
  systemId: string;
  threadKey: string;
  subject: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  companyName: string | null;
  messages: CrmEmailMessageView[];
  /** ส่งจดหมายในเธรดนี้ได้ไหม (ต้องมีคีย์ crm.email.send และเธรดต้องผูกผู้ติดต่อแล้ว) */
  canSend: boolean;
  /** ผูกจดหมายที่ยังไม่จับคู่เข้าผู้ติดต่อได้ไหม (กล่อง "ยังไม่จับคู่") */
  canAttach: boolean;
  /** id ของจดหมายฉบับล่าสุดในเธรด — ใช้เป็น `replyToEmailId` ของการตอบ */
  replyToEmailId: string | null;
  templates: CrmEmailOption[];
  attachMaxBytes: number;
  /** เพดานไฟล์แนบของ **ช่องเขียนบนหน้าจอ** (ต่ำกว่าของบริการ — base64 โต 4/3 เท่า ชน bodySizeLimit ของ server action) */
  composerMaxBytes: number;
  attachMaxCount: number;
  subjectMax: number;
};

// ───────────────────────── ตั้งค่า (ภาพ 15) ─────────────────────────

export type CrmEmailDomainRecordRow = { type: string; name: string; value: string; priority: number | null; status: string | null };
export type CrmEmailDomainRow = { id: string; domain: string; status: string; statusLabel: string; records: CrmEmailDomainRecordRow[]; verifiedAtLabel: string | null };

export type CrmEmailUserRow = {
  userId: string;
  name: string;
  /** อีเมลของพนักงานในระบบ (ช่อง "อีเมลตัวเอง" ของภาพ 15) */
  userEmail: string | null;
  fromName: string | null;
  fromAddr: string | null;
  replyToMode: string;
  replyToAddr: string | null;
  copyToAddr: string | null;
  copyMode: string;
  hasSignature: boolean;
};

export type CrmEmailTemplateRow = { id: string; name: string; subject: string; bodyHtml: string; category: string | null; active: boolean };

export type CrmEmailSettingsView = {
  inboundEnabled: boolean;
  fromMode: string;
  fromName: string | null;
  fromAddr: string | null;
  replyToMode: string;
  replyToAddr: string | null;
  copyToAddr: string | null;
  copyMode: string;
  bccCaptureEnabled: boolean;
  strangerToLead: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  retentionDays: number;
  allowUserOverride: boolean;
  inboundAddress: string;
};

export type CrmEmailSettingsData = {
  systemId: string;
  settings: CrmEmailSettingsView;
  /** ที่อยู่ผู้ส่งที่ใช้จริงตอนนี้ (คิดจาก resolveRouting — ใช้แสดงว่า "ลูกค้าจะเห็นอะไร") */
  effectiveFrom: string;
  effectiveReplyTo: string;
  via: string;
  domains: CrmEmailDomainRow[];
  users: CrmEmailUserRow[];
  templates: CrmEmailTemplateRow[];
  fromModes: CrmEmailOption[];
  replyModes: CrmEmailOption[];
  copyModes: CrmEmailOption[];
  limits: { retentionMin: number; retentionMax: number; rotateReasonMin: number; subjectMax: number };
};
