// etax-transport.ts — ACC T5.4 (เลน 2) ▸ ช่องทางส่งอีเมล e-Tax by Time Stamp (อินเทอร์เฟซ + ตัวจริง)
//
//   ประกาศ ข้อ 5(2) [V]: ส่ง "โดยใช้ที่อยู่จดหมายอิเล็กทรอนิกส์ที่ได้แจ้งไว้ต่อกรมสรรพากร" ⇒ ผู้ส่ง = อีเมลของร้าน ไม่ใช่อีเมลกลางของแพลตฟอร์ม
//   🔴 นอก production (`APP_ENV` ≠ production) = CAPTURE ทุกครั้ง — ไม่ยิงเครือข่าย แม้มีกุญแจ Resend (ข้อสอบ/QC/ภาพหน้าจอปลอดภัย)
//   🔴 production: ค่าเริ่ม NONE (ยังไม่มีช่องทางส่งในนามกล่องอีเมลของร้าน) — เปิด Resend ด้วย env `ETAX_TS_TRANSPORT=resend`
//      เฉพาะเมื่อผู้ดูแลแพลตฟอร์มยืนยันโดเมนผู้ส่งของร้านกับผู้ให้บริการส่งแล้ว (ยังไม่ได้ทดสอบกับระบบประทับเวลาจริง)
// design note: ledger/wo-notes/T5.4.md §1.4
import { randomUUID } from "node:crypto";
// 🔴 ไม่ import `@/lib/env` ตอนโหลด (ทะเบียน REST ถูกโหลดโดยตัวสร้างคู่มือที่ไม่มี env) — อ่าน APP_ENV ตรง ตามค่าเดียวกับ env.isProd
const isProdNow = () => process.env.APP_ENV === "production";

export type EtaxMail = {
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  text: string;
  attachment: { filename: string; content: Uint8Array; contentType: "application/pdf" };
};
export type EtaxTransportName = "CAPTURE" | "RESEND" | "NONE";
export type EtaxSendResult = { ok: true; providerId: string } | { ok: false; error: string };

export interface EtaxMailTransport {
  readonly name: EtaxTransportName;
  send(m: EtaxMail): Promise<EtaxSendResult>;
}

/** อีเมลที่ "ส่ง" ผ่านตัวจับในโพรเซสนี้ (ข้อสอบอ่านได้) — เก็บล่าสุด 50 ฉบับ */
export const CAPTURED_ETAX_MAILS: (EtaxMail & { providerId: string; at: Date })[] = [];

export const captureTransport: EtaxMailTransport = {
  name: "CAPTURE",
  async send(m) {
    const providerId = `capture_${randomUUID()}`;
    CAPTURED_ETAX_MAILS.push({ ...m, providerId, at: new Date() });
    if (CAPTURED_ETAX_MAILS.length > 50) CAPTURED_ETAX_MAILS.splice(0, CAPTURED_ETAX_MAILS.length - 50);
    return { ok: true, providerId };
  },
};

export const noneTransport: EtaxMailTransport = {
  name: "NONE",
  async send() {
    return { ok: false, error: "ยังไม่มีช่องทางส่งอีเมลในนามอีเมลที่ร้านแจ้งกรมสรรพากร — ติดต่อผู้ดูแลระบบ (ส่งด้วยโปรแกรมอีเมลของร้านเองได้: ดาวน์โหลดไฟล์และใช้หัวเรื่องตามที่ระบบแสดง)" };
  },
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const resendTransport: EtaxMailTransport = {
  name: "RESEND",
  async send(m) {
    const { sendEmailRich } = await import("@/lib/core/email");
    const r = await sendEmailRich({
      from: m.from,
      to: [m.to],
      ...(m.cc ? { cc: [m.cc] } : {}),
      subject: m.subject,
      text: m.text,
      html: `<p>${esc(m.text).replace(/\n/g, "<br>")}</p>`,
      attachments: [{ filename: m.attachment.filename, content: m.attachment.content, contentType: m.attachment.contentType }],
    });
    return r.ok ? { ok: true, providerId: r.providerId ?? "resend" } : { ok: false, error: r.error ?? "SEND_FAILED" };
  },
};

let override: EtaxMailTransport | null = null;
/** ข้อสอบเท่านั้น — ใช้ได้เฉพาะนอก production */
export function setEtaxTransportForTests(t: EtaxMailTransport | null): void {
  if (isProdNow()) throw new Error("ห้ามเปลี่ยนช่องทางส่ง e-Tax ใน production");
  override = t;
}

export function etaxTransport(): EtaxMailTransport {
  if (!isProdNow()) return override ?? captureTransport;
  return process.env.ETAX_TS_TRANSPORT === "resend" ? resendTransport : noneTransport;
}
