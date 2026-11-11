// secretary.ts — ตัวตนเลขาต่อผู้ใช้ (S1.2 · ตาราง AiSecretary แกน global: 1 แถว/user ใช้ข้ามทุกร้านที่เป็นสมาชิก)
//
// อ่าน (`secretaryOf`) ไม่สร้างแถว — แชทของคนที่ยังไม่เคยตั้งเลขาจึงได้ prompt เดิมทุกไบต์ (service.sendMessage)
// สร้าง (`ensureSecretary`) เมื่อผู้ใช้เปิดหน้าเลขาครั้งแรก · แก้ (`updateSecretary`) ตรวจทุกช่องก่อนเขียน ผิด = ไม่เขียนเลย
// ส่วน pure (ค่าคงที่ · ตรวจรูปแบบ · ประโยคตัวอย่าง · บล็อก prompt) อยู่ที่ ./identity.ts

import type { AiSecretary } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { normalizeIdentityPatch, type SecretaryIdentity } from "./identity";

export {
  SECRETARY_DEFAULT,
  TONES,
  LANGUAGES,
  NAME_MAX,
  SUFFIX_MAX,
  identityOf,
  normalizeIdentityPatch,
  sampleSpeech,
  secretaryPromptBlock,
  toneLabel,
  languageLabel,
  type Tone,
  type Language,
  type SecretaryIdentity,
} from "./identity";

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** upsert ค่าเริ่มต้น (Shark · ครับ · สุภาพ · ไทย) · เรียกซ้ำ = แถวเดิม (id เดิม · ไม่แก้ค่าที่ผู้ใช้ตั้งไว้) */
export async function ensureSecretary(userId: string): Promise<AiSecretary> {
  try {
    return await prisma.aiSecretary.upsert({ where: { userId }, create: { userId }, update: {} });
  } catch (e) {
    // สองคำขอแข่งกันสร้างแถวแรก — ผู้แพ้อ่านแถวของผู้ชนะ
    if (isUniqueViolation(e)) return prisma.aiSecretary.findUniqueOrThrow({ where: { userId } });
    throw e;
  }
}

/** อ่านอย่างเดียว · ไม่มีแถว = null (ไม่สร้าง) */
export async function secretaryOf(userId: string): Promise<AiSecretary | null> {
  return prisma.aiSecretary.findUnique({ where: { userId } });
}

/** แก้ตัวตน — ตรวจก่อนเขียน (ผิดข้อใด = throw ไทย ไม่เขียนเลย) · ไม่มีแถว = สร้างพร้อมค่าที่ส่งมา */
export async function updateSecretary(userId: string, patch: Partial<SecretaryIdentity>): Promise<AiSecretary> {
  const data = normalizeIdentityPatch((patch ?? {}) as Record<string, unknown>);
  try {
    return await prisma.aiSecretary.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  } catch (e) {
    if (isUniqueViolation(e)) return prisma.aiSecretary.update({ where: { userId }, data });
    throw e;
  }
}
