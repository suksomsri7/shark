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
import { findContactData } from "./contact-data";

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
  if (s.own && s.ownerExtras) return { OR: [{ id: { startsWith: likePrefix(s.own) } }, { NOT: { id: { startsWith: MEMBER_TAG } } }] };
  if (s.own) return { id: { startsWith: likePrefix(s.own) } };
  if (s.ownerExtras) return { NOT: { id: { startsWith: MEMBER_TAG } } };
  return { id: { in: [] } };
}

/**
 * CRM C5.5-G3 (รีวิว G2-6) ▸ Prisma `startsWith` ส่งค่าเข้า `LIKE '<ค่า>%'` โดย **ไม่ escape** `_` `%` (วัดแล้ว: `u~a_c~` จับ `u~aXc~…`)
 *   ⇒ escape ด้วย `\` (ตัว escape ปริยายของ LIKE ใน Postgres) ให้ prefix ตรงตัวอักษร — จำนวนแถวที่ `take` ได้จะไม่ถูกแถวเกินกิน
 *   (ผลยังถูกตรวจซ้ำแบบตรงตัวใน JS เสมอ) · 🔴 ตัวช่วยท้องถิ่น: ใบอื่นมี `likeStartsWith` กลาง — รวมเป็นตัวเดียวเมื่อเข้ามาในสายนี้ ◂
 */
export function likePrefix(prefix: string): string {
  let out = "";
  for (const ch of prefix) out += ch === "\\" || ch === "%" || ch === "_" ? `\\${ch}` : ch;
  return out;
}

// ─────────────────────────────── ความจำของผู้ช่วย (AiMemory · CRM C5.5-G3 · รีวิว G2-1) ───────────────────────────────
// รหัสความจำออกโดย server ตอนจด (`ai/memory.ts`) ด้วยกติกาผู้สร้างชุดเดียวกับบทสนทนา + แท็กเพิ่มหนึ่งตัว:
//   `o~<userId>~…` = **ข้อเท็จจริงของร้าน** ที่เจ้าของร้าน (role OWNER ตอนจด) เขียน — ทุกคนในร้านเห็น (เจ้าของร้านดูแลความรู้ของร้าน)
//   `u~<userId>~…` = ความจำ **ส่วนตัว** ของคนในร้านที่ไม่ใช่ OWNER — เข้า prompt/รายการของเขาคนเดียว
//   `k~…` / `s~…` = เขียนโดยคีย์ API / งานภายใน — เจ้าของร้านเท่านั้น (+ ผู้สร้างเอง)
//   รหัสเดิม (cuid ล้วน) = ความจำร้านรุ่นเดิม — ทุกคนเห็นเหมือนเดิม **ยกเว้น** ข้อที่มีข้อมูลติดต่อ (เบอร์/อีเมล/เลขบัตร) = เจ้าของร้านเท่านั้น
// ลบ (`forget_fact`): ผู้สร้าง · หรือ OWNER สำหรับข้อเท็จจริงของร้าน/รุ่นเดิม/ของคีย์/งานภายใน (ห้ามลบความจำส่วนตัวของคนอื่น)
const SHOP_FACT_TAG = `o${SEP}`;

export type MemorySight = { own: string | null; ownFact: string | null; owner: boolean };

/** ผู้ดูความจำจาก actor (ไม่มี / ผิดร้าน / ปลอม = ไม่เห็นอะไร) */
export function memorySightOf(ctx: { tenantId: string; actor?: unknown }): MemorySight {
  const s = sightOf(ctx);
  if (!s.own) return { own: null, ownFact: null, owner: false };
  const a = ctx.actor as AiActor;
  return { own: s.own, ownFact: a.kind === "member" ? `${SHOP_FACT_TAG}${s.own.slice(MEMBER_TAG.length)}` : null, owner: s.ownerExtras };
}

/** รหัสความจำใหม่ + ความจำนี้จะเป็นของร้าน (ทุกคนเห็น) ไหม — ผู้สร้างไม่ชัด = throw */
export function newMemoryId(ctx: ConvCtx): { id: string; shared: boolean } {
  const m = memorySightOf(ctx);
  if (!m.own) throw new Error("AI memory needs a known creator");
  const rand = randomBytes(12).toString("hex");
  return m.owner && m.ownFact ? { id: `${m.ownFact}${rand}`, shared: true } : { id: `${m.own}${rand}`, shared: false };
}

const isLegacyId = (id: string) => !id.includes(SEP);

/** ผู้ดูนี้เห็นความจำนี้ไหม (เข้า prompt / อยู่ในรายการ) — ตรวจตรงตัวอักษรทุกแถว */
export function canSeeMemory(m: MemorySight, row: { id: string; content: string }): boolean {
  const id = String(row?.id ?? "");
  if (!id) return false;
  if (m.own && id.startsWith(m.own)) return true;
  if (m.ownFact && id.startsWith(m.ownFact)) return true;
  if (id.startsWith(SHOP_FACT_TAG)) return m.own !== null; // ข้อเท็จจริงของร้าน (จดผ่านด่านข้อมูลติดต่อแล้ว) — ทุกผู้ดูที่ถูกต้อง
  if (isLegacyId(id)) return m.owner || (m.own !== null && findContactData(row.content).length === 0);
  return m.owner && !id.startsWith(MEMBER_TAG); // k~ / s~ = เจ้าของร้านเท่านั้น · u~ ของคนอื่น = ไม่มีใคร
}

/** ผู้ดูนี้ลบความจำนี้ได้ไหม */
export function canForgetMemory(m: MemorySight, id: string): boolean {
  if (!id || !m.own) return false;
  if (id.startsWith(m.own) || (m.ownFact !== null && id.startsWith(m.ownFact))) return true;
  return m.owner && !id.startsWith(MEMBER_TAG);
}

/** ตัวกรองชั้นแรก (LIKE) ของความจำที่ผู้ดูอาจเห็น — แถวที่ได้ต้องผ่าน `canSeeMemory` ซ้ำเสมอ (ข้อมูลติดต่อของรุ่นเดิมตรวจใน JS) */
export function visibleMemoryWhere(m: MemorySight): Prisma.AiMemoryWhereInput {
  if (!m.own) return { id: { in: [] } };
  if (m.owner) return { OR: [{ id: { startsWith: likePrefix(m.own) } }, { NOT: { id: { startsWith: MEMBER_TAG } } }] };
  return { OR: [{ id: { startsWith: likePrefix(m.own) } }, ...(m.ownFact ? [{ id: { startsWith: likePrefix(m.ownFact) } }] : []), { id: { startsWith: SHOP_FACT_TAG } }, { NOT: { id: { contains: SEP } } }] };
}

/** ตัวกรองของความจำที่ผู้เขียน "ดูแล" (เพดานจำนวน + กันจดซ้ำ): ส่วนตัวของตัวเอง หรือ (OWNER) ข้อเท็จจริงของร้านทั้งหมด */
export function managedMemoryWhere(m: MemorySight, shared: boolean): Prisma.AiMemoryWhereInput {
  if (!m.own) return { id: { in: [] } };
  if (shared) return { OR: [{ id: { startsWith: SHOP_FACT_TAG } }, { NOT: { id: { contains: SEP } } }] };
  return { id: { startsWith: likePrefix(m.own) } };
}

/** ผู้สร้างบทสนทนาจากรหัส — ห้องรุ่นเดิม/รหัสแปลก = null (ใช้เลือกผู้รับ push ของห้อง) */
export function conversationCreatorOf(id: string | null | undefined): { kind: "member" | "apiKey" | "system"; id: string } | null {
  const v = typeof id === "string" ? id : "";
  const parts = v.split(SEP);
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  const kind = parts[0] === TAG.member ? "member" : parts[0] === TAG.apiKey ? "apiKey" : parts[0] === TAG.system ? "system" : null;
  return kind ? { kind, id: parts[1] } : null;
}

/** ป้ายขอบเขตของความจำ (รายการ list_memories) — ร้าน = ทุกคนเห็น · ส่วนตัว = คนจดคนเดียว · ระบบ = คีย์/งานภายใน (เจ้าของร้านเห็น) */
export function memoryScopeOf(id: string): "shop" | "private" | "system" {
  if (isLegacyId(id) || id.startsWith(SHOP_FACT_TAG)) return "shop";
  return id.startsWith(MEMBER_TAG) ? "private" : "system";
}
