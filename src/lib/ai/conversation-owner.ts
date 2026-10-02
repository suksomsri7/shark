// conversation-owner.ts — "บทสนทนา AI นี้เป็นของใคร" (CRM C5.5-G2)
//
// 🔴 ก่อนใบนี้บทสนทนาเป็นของทั้งร้าน (ตารางไม่มีคอลัมน์ผู้สร้าง): แชทเว็บเปิด "ห้องล่าสุดของร้าน" ของใครก็ได้ · แอปลิสต์/อ่านทุกห้อง ·
//    `sendMessage` ต่อห้องไหนของร้านก็ได้แล้วป้อน 40 เทิร์นล่าสุดเข้าโมเดล ⇒ พนักงานที่มีแค่ `ai.chat.send` อ่านคำตอบที่ได้มาด้วย
//    สิทธิ์ของเจ้าของ (เบอร์สมาชิก · ลีด · การเงิน) และให้โมเดลยกมาตอบได้ แม้ G1 จะปฏิเสธเครื่องมือของเขาแล้ว
//
// ที่เก็บผู้สร้าง (ไม่มี migration — การเพิ่มคอลัมน์ในตารางแชทเคยทำแชท prod ล่ม): **รหัสของบทสนทนาเอง**
//   `u~<userId>~<สุ่ม 96 บิต>` คนในร้าน · `k~<apiKeyId>~<สุ่ม>` คีย์ API · `s~<ชื่องาน>~<สุ่ม>` งานภายใน
//   รหัสออกโดย server ตอนสร้างเท่านั้น (ไม่มีประตูไหนรับรหัสจาก client ตอนสร้าง) จึงปลอมไม่ได้ · เปลี่ยนไม่ได้ (เป็น PK) ·
//   ข้อเสนอ/แผนพก `conversationId` อยู่แล้ว ⇒ รู้เจ้าของได้โดยไม่ต้อง join · `~` ไม่อยู่ในชุดตัวอักษรของ cuid
//   รหัสแบบเดิม (cuid ล้วน) = ห้องก่อนใบนี้ "ไม่รู้ผู้สร้าง"
//
// กติกาการมองเห็น (ทุกประตู: ลิสต์ · อ่าน · เปลี่ยนชื่อ · ลบ · ส่งต่อ · ห้องล่าสุดของเว็บ · ข้อเสนอ/แผน):
//   - ผู้สร้างเท่านั้น (คนในร้าน = userId เดียวกัน · คีย์ = คีย์ใบเดียวกัน · งานภายใน = งานเดียวกัน)
//   - ยกเว้น: ห้องที่ **ไม่ได้สร้างโดยคนในร้าน** (ห้องเดิมก่อนใบนี้ · ห้องของคีย์ API · ห้องของงานประจำ) = เจ้าของร้าน (role OWNER) เห็นด้วย
//     · ห้องเดิม: ไม่มี backfill — เจ้าของร้านเท่านั้น ไม่มีใครอื่น
//     · ห้องของคีย์: เส้นทางที่เขียนไว้ใน `/api/v1/ai/tools/[name]` — "เจ้าของต้องกดยืนยันในแอป/เว็บ" (ข้อเสนอจากคีย์อยู่ในห้องนั้น)
//     · ห้องของงานประจำ: รันด้วยสิทธิ์ผู้อ่านน้อยที่สุดอยู่แล้ว (G1) — เจ้าของร้านดูย้อนหลังได้
//   - ห้องของคนในร้านคนอื่น (รวมเจ้าของร้านอีกคน) = ไม่มีใครเห็น
//   - มองไม่เห็น = ตอบแบบเดียวกับ "ไม่มีอยู่" ทุกประตู (ไม่บอกว่ามีอยู่)
//
// 🔴 ไฟล์นี้ต้องเบา (ไม่มี db) — ตัวอ่านฐานข้อมูลอยู่ที่ `./conversations.ts`

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { MembershipCtx } from "@/lib/core/rbac";
import { actorProblem, type AiActor } from "./actor";

const SEP = "~";
const MEMBER_TAG = `u${SEP}`;
const TAG = { member: "u", apiKey: "k", system: "s" } as const;

/** ctx ของประตูที่อ่าน/แตะบทสนทนา — ร้าน + **ผู้ดู (บังคับ)** */
export type ConvCtx = { tenantId: string; actor: AiActor };

/** สิ่งที่ผู้ดูคนหนึ่งเห็น: prefix ของห้องตัวเอง + (เจ้าของร้าน) ห้องที่ไม่ได้สร้างโดยคนในร้าน */
export type ConvSight = { own: string | null; ownerExtras: boolean };

const NOTHING: ConvSight = { own: null, ownerExtras: false };

function prefixOf(kind: keyof typeof TAG, id: string | null | undefined): string | null {
  const v = typeof id === "string" ? id.trim() : "";
  if (!v || v.includes(SEP) || v !== id) return null;
  return `${TAG[kind]}${SEP}${v}${SEP}`;
}

/** ผู้ดูจาก actor (ไม่มี / ผิดร้าน / ปลอม = ไม่เห็นอะไร) */
export function sightOf(ctx: { tenantId: string; actor?: unknown }): ConvSight {
  if (actorProblem(ctx)) return NOTHING;
  const a = ctx.actor as AiActor;
  if (a.kind === "member") return { own: prefixOf("member", a.userId), ownerExtras: a.membership.role === "OWNER" };
  if (a.kind === "apiKey") return { own: prefixOf("apiKey", a.keyId), ownerExtras: false };
  return { own: prefixOf("system", a.job), ownerExtras: false };
}

/** ผู้ดูจาก "คนกดยืนยัน" (ประตูยืนยันข้อเสนอ/แผนส่ง Membership + userId มา) — ไม่รู้ userId = เห็นเฉพาะส่วนของเจ้าของร้าน (ถ้าเป็น) */
export function sightOfConfirmer(m: Pick<MembershipCtx, "role">, userId: string | null | undefined): ConvSight {
  return { own: prefixOf("member", userId ?? null), ownerExtras: m?.role === "OWNER" };
}

/** รหัสบทสนทนาใหม่ที่ฝังผู้สร้าง — ผู้สร้างไม่ชัด = throw (ห้ามสร้างห้องที่ไม่มีเจ้าของ) */
export function newConversationId(ctx: ConvCtx): string {
  const own = sightOf(ctx).own;
  if (!own) throw new Error("AI conversation needs a known creator");
  return `${own}${randomBytes(12).toString("hex")}`;
}

/** ผู้ดูนี้เห็นบทสนทนารหัสนี้ไหม (ตรวจตรงตัวอักษร — ใช้ซ้ำหลัง query ทุกครั้ง) */
export function canSeeConversationId(s: ConvSight, conversationId: string | null | undefined): boolean {
  const id = typeof conversationId === "string" ? conversationId : "";
  if (!id) return false;
  if (s.own && id.startsWith(s.own)) return true;
  return s.ownerExtras && !id.startsWith(MEMBER_TAG);
}

/**
 * ตัวกรอง Prisma ของ "บทสนทนาที่ผู้ดูนี้เห็น" บนฟิลด์รหัส (`id` ของ AiConversation)
 * 🔴 เป็นตัวกรองชั้นแรกเท่านั้น (LIKE) — แถวที่ได้ต้องผ่าน `canSeeConversationId` ซ้ำเสมอ
 */
export function visibleConversationWhere(s: ConvSight): Prisma.AiConversationWhereInput {
  if (s.own && s.ownerExtras) return { OR: [{ id: { startsWith: s.own } }, { NOT: { id: { startsWith: MEMBER_TAG } } }] };
  if (s.own) return { id: { startsWith: s.own } };
  if (s.ownerExtras) return { NOT: { id: { startsWith: MEMBER_TAG } } };
  return { id: { in: [] } };
}
