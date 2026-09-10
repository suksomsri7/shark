// channels-status.ts — ทะเบียนช่องทางกลาง + "ร้านนี้ต่อช่องทางนั้นไว้จริงหรือยัง" (M1.11 · D19)
//
// `core/channels.ts` เป็นทะเบียน **บริสุทธิ์** (ห้ามแตะ prisma — ดูหัวไฟล์นั้น) จึงตอบไม่ได้ว่า
// ร้านหนึ่ง ๆ ต่อไลน์/วอทส์แอปไว้แล้วหรือยัง ⇒ คำถามนั้นอยู่ที่นี่แทน
//
// 🔴 "ต่อแล้ว" (connected) แปลว่า **ส่งข้อความออกทางช่องทางนี้ได้จริงวันนี้** ไม่ใช่ "มีในทะเบียน":
//    - ช่องทางที่มีกล่องแชท (LINE/Meta/วอทส์แอป/ตลาดออนไลน์) = มีการเชื่อมต่อสถานะ CONNECTED อยู่จริง
//    - ช่องทางที่ระบบส่งเองได้อยู่แล้ว (อีเมล/SMS/แจ้งเตือนในแอป) = `canNotify` ของทะเบียน
//    - ช่องทางที่ "เก็บความยินยอมได้ แต่คนเป็นคนส่ง" (โทรศัพท์) = false เสมอ
//    ⇒ ผู้เชื่อมต่อ/ผู้ช่วย AI ที่เห็น false จะได้ไม่สัญญากับลูกค้าว่าจะส่งข้อความไปทางนั้น
//
// 🔴 อ่านตาราง `ChatChannelConnection` ตรงด้วยเหตุผลเดียวกับที่ `privacy.ts` อ่าน `HrEmployee` ตรง:
//    เป็นการอ่านสถานะอย่างเดียว ไม่มีตรรกะของโมดูลแชทเข้ามาเกี่ยว — เรียกผ่าน facade จะกลายเป็น
//    เส้น import ข้ามโมดูล member→chat ถาวร (fitness F2) เพื่อคิวรีบรรทัดเดียว

import { prisma } from "./db";
import { CHANNELS, chatChannelToKey, type ChannelKind } from "@/lib/core/channels";

export type ChannelStatusDto = {
  key: string;
  label: string;
  kind: ChannelKind;
  canConsent: boolean;
  canNotify: boolean;
  /** ร้านนี้ส่งข้อความออกทางช่องทางนี้ได้จริงแล้วหรือยัง */
  connected: boolean;
};

/** ช่องทางที่ "ต่อ" ได้ด้วยการเชื่อมต่อกล่องแชท (ที่เหลือใช้ `canNotify` ของทะเบียนตัดสิน) */
const CONNECTABLE_KINDS: readonly ChannelKind[] = ["CHAT", "MARKETPLACE"];

/** ทะเบียนช่องทาง 15 ช่อง + สถานะการเชื่อมต่อของร้านนี้ (ลำดับเดียวกับทะเบียนกลางเสมอ) */
export async function channelsWithStatus(tenantId: string): Promise<ChannelStatusDto[]> {
  const [rows, chatSystem] = await Promise.all([
    prisma.chatChannelConnection.findMany({ where: { tenantId, status: "CONNECTED" }, select: { type: true } }),
    prisma.appSystem.findFirst({ where: { tenantId, type: "CHAT", active: true }, select: { id: true } }),
  ]);
  const live = new Set(rows.map((r) => chatChannelToKey(r.type)));
  return CHANNELS.map((c) => ({
    key: c.key,
    label: c.label,
    kind: c.kind,
    canConsent: c.canConsent,
    canNotify: c.canNotify,
    connected: CONNECTABLE_KINDS.includes(c.kind)
      ? // WEBCHAT ไม่มีแถวการเชื่อมต่อของตัวเอง (built-in ของ SHARK) — ใช้ได้เมื่อร้านเปิดระบบแชท
        c.key === "WEBCHAT"
        ? !!chatSystem
        : live.has(c.key)
      : c.canNotify,
  }));
}
