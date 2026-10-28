// link-code.ts — รหัสผูก LINE ครั้งเดียว (ลูกค้าพิมพ์รหัสในแชท OA ⇒ ผูกผู้ติดต่อกับสัญญา/คิว/นัด) · SVC R0.7 · ใบสั่ง §3.3
//
// 🔴 carry R0.7: รหัส 8 ตัวจาก alphabet ไม่กำกวม (มีทั้งอักษรและตัวเลข) · เก็บ **HMAC มีกุญแจ** ไม่ใช่รหัสดิบ/sha256 ดิบ
//    codeHash = HMAC-SHA256(key = "chat-link-code:v1:" + SESSION_SECRET, tenantId + ":" + CODE).hex · ชน P2002 ⇒ สุ่มใหม่ ≤ 5 ครั้ง
// 🔴 ไม่มีรหัสดิบในฐาน/log/audit/outbox — ผลคืนของ issue เท่านั้นที่มีรหัส (ผู้เรียกพิมพ์ให้ลูกค้า)
// 🔴 consume: ผิดข้อไหนก็คืน `null` เหมือนกันหมด (X7) · นับ rate limit ก่อนค้น (กันเดารหัส) · อ้างสิทธิ์แบบ atomic (X3)
// 🔴 ไฟล์แชท: ห้าม import platform · prisma ผ่าน ./db

import { createHmac, randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { prisma } from "./db";
import { linkChatContactParty, type ChatPartyCtx } from "./party-bridge";

/** 31 ตัว — ไม่มี 0 O 1 I L */
export const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
export const LINK_PURPOSES = ["DORM_LEASE", "QUEUE_TICKET", "APPOINTMENT"] as const;
export type LinkPurpose = (typeof LINK_PURPOSES)[number];

export type IssueLinkCodeInput = { purpose: string; refId: string; ttlMin: number; connectionId?: string | null };
export type IssueLinkCodeResult =
  | { ok: true; code: string; deepLink: string | null; expiresAt: Date }
  | { ok: false; error: "VALIDATION" | "NOT_FOUND" | "NOT_CONFIGURED"; message: string };
export type ConsumeLinkCodeInput = {
  connectionId: string;
  chatContactId: string;
  text: string;
  resolveParty?: (a: { purpose: string; refId: string }) => Promise<string | null>;
};
export type ConsumeLinkCodeResult = { purpose: string; refId: string; partyId: string | null } | null;

const KEY_LABEL = "chat-link-code:v1:";
const MAX_TTL_MIN = 43_200;
const MAX_ISSUE_TRIES = 5;
const RATE = { limit: 10, windowMs: 15 * 60_000 };
const CODE_RE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);
const BASIC_ID_RE = /^@[A-Za-z0-9._-]{1,40}$/;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** กุญแจติดป้าย — ไม่มี/สั้นกว่า 32 ⇒ null (ไม่มีค่าสำรอง) */
function codeKey(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return null;
  return `${KEY_LABEL}${secret}`;
}

const hashCode = (key: string, tenantId: string, code: string) => createHmac("sha256", key).update(`${tenantId}:${code}`).digest("hex");

/** รูปรหัส: 8 ตัวจาก alphabet และมีทั้งตัวอักษรและตัวเลข */
const isCode = (c: string) => CODE_RE.test(c) && /[A-Z]/.test(c) && /[0-9]/.test(c);

/**
 * ข้อความที่ลูกค้าพิมพ์ → รหัสที่ normalize แล้ว (ตัวพิมพ์ใหญ่ · ตัดช่องว่าง/ขีด/#) · ไม่ใช่รูปรหัส ⇒ null
 * ใช้ตัดสินก่อนแตะฐาน (ข้อความแชทธรรมดาไม่ถูกนับโควตา)
 */
export function normalizeLinkCode(text: unknown): string | null {
  if (typeof text !== "string" || text.length > 64) return null;
  const c = text.trim().toUpperCase().replace(/[\s\-#]/g, "");
  return isCode(c) ? c : null;
}

function newCode(): string {
  for (;;) {
    let c = "";
    for (let i = 0; i < LINK_CODE_LENGTH; i++) c += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
    if (isCode(c)) return c;
  }
}

const fail = (error: "VALIDATION" | "NOT_FOUND" | "NOT_CONFIGURED"): IssueLinkCodeResult => ({
  ok: false,
  error,
  message:
    error === "VALIDATION"
      ? "ข้อมูลไม่ครบหรือผิดรูปแบบ (ชนิดรหัส · รายการอ้างอิง · อายุ 1–43200 นาที)"
      : error === "NOT_FOUND"
        ? "ไม่พบ LINE OA นี้ในร้าน"
        : "ระบบยังไม่พร้อมออกรหัสผูก — แจ้งผู้ดูแลระบบ",
});

/** ออกรหัสผูกใหม่ (คืนรหัสดิบครั้งเดียว · ฐานเก็บ HMAC + 4 ตัวท้าย) */
export async function issueLinkCode(ctx: ChatPartyCtx, input: IssueLinkCodeInput): Promise<IssueLinkCodeResult> {
  try {
    const tenantId = str(ctx?.tenantId);
    const purpose = str(input?.purpose);
    const refId = str(input?.refId);
    const ttlMin = input?.ttlMin;
    if (!tenantId || !(LINK_PURPOSES as readonly string[]).includes(purpose)) return fail("VALIDATION");
    if (!refId || refId.length > 100) return fail("VALIDATION");
    if (typeof ttlMin !== "number" || !Number.isInteger(ttlMin) || ttlMin < 1 || ttlMin > MAX_TTL_MIN) return fail("VALIDATION");
    const key = codeKey();
    if (!key) return fail("NOT_CONFIGURED");

    let connectionId: string | null = null;
    let basicId: string | null = null;
    const wanted = str(input?.connectionId);
    if (wanted) {
      const conn = await prisma.chatChannelConnection.findFirst({ where: { id: wanted, tenantId, type: "LINE" }, select: { id: true, meta: true } });
      if (!conn) return fail("NOT_FOUND");
      connectionId = conn.id;
      const b = isRec(conn.meta) ? conn.meta.basicId : null;
      basicId = typeof b === "string" && BASIC_ID_RE.test(b) ? b : null;
    }

    const expiresAt = new Date(Date.now() + ttlMin * 60_000);
    for (let attempt = 1; attempt <= MAX_ISSUE_TRIES; attempt++) {
      const code = newCode();
      try {
        await prisma.chatLinkCode.create({
          data: { tenantId, connectionId, purpose, refId, codeHash: hashCode(key, tenantId, code), codeLast4: code.slice(-4), expiresAt },
        });
        const deepLink = basicId ? `https://line.me/R/oaMessage/${encodeURIComponent(basicId)}/?${code}` : null;
        return { ok: true, code, deepLink, expiresAt };
      } catch (e) {
        // ชน @@unique([tenantId, codeHash]) = รหัสซ้ำกับที่ออกไปแล้ว ⇒ สุ่มใหม่ (สูงสุด 5 ครั้ง)
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < MAX_ISSUE_TRIES) continue;
        throw e;
      }
    }
    return fail("NOT_CONFIGURED");
  } catch {
    return { ok: false, error: "NOT_CONFIGURED", message: "ออกรหัสผูกไม่สำเร็จ — ลองใหม่อีกครั้ง" };
  }
}

/**
 * ลูกค้าพิมพ์รหัสในแชท OA → อ้างสิทธิ์รหัส (ครั้งเดียว) แล้วผูกผู้ติดต่อกับ Party ที่ `resolveParty` บอก
 * ไม่สำเร็จด้วยเหตุใดก็ตาม ⇒ `null` (ไม่บอกเหตุผล — กันเดาว่ารหัสมีอยู่จริงไหม)
 */
export async function consumeLinkCode(ctx: ChatPartyCtx, input: ConsumeLinkCodeInput): Promise<ConsumeLinkCodeResult> {
  try {
    const code = normalizeLinkCode(input?.text);
    if (!code) return null;
    const tenantId = str(ctx?.tenantId);
    const connectionId = str(input?.connectionId);
    const chatContactId = str(input?.chatContactId);
    if (!tenantId || !connectionId || !chatContactId) return null;
    const key = codeKey();
    if (!key) return null;

    // นับโควตาก่อนค้น — เดารหัสได้ไม่เกิน 10 ครั้ง/15 นาที/ผู้ติดต่อ
    const rl = await checkRateLimitDb(`chat-link:${tenantId}:${chatContactId}`, RATE);
    if (!rl.ok) return null;

    const conn = await prisma.chatChannelConnection.findFirst({ where: { id: connectionId, tenantId, type: "LINE" }, select: { id: true } });
    if (!conn) return null;
    const contact = await prisma.chatContact.findFirst({ where: { id: chatContactId, tenantId, channelConnectionId: conn.id }, select: { id: true } });
    if (!contact) return null;
    const now = new Date();
    const row = await prisma.chatLinkCode.findFirst({
      where: { tenantId, codeHash: hashCode(key, tenantId, code) },
      select: { id: true, purpose: true, refId: true, connectionId: true, usedAt: true, expiresAt: true },
    });
    if (!row || row.usedAt !== null || row.expiresAt <= now) return null;
    if (row.connectionId !== null && row.connectionId !== conn.id) return null;

    // อ้างสิทธิ์แบบ atomic — ยิงพร้อมกันกี่ทางก็ชนะได้ทางเดียว
    const claim = await prisma.chatLinkCode.updateMany({
      where: { id: row.id, tenantId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now, usedByChatContactId: contact.id },
    });
    if (claim.count !== 1) return null;

    let partyId: string | null = null;
    if (typeof input?.resolveParty === "function") {
      try {
        const p = await input.resolveParty({ purpose: row.purpose, refId: row.refId });
        partyId = typeof p === "string" && p.trim() ? p.trim() : null;
      } catch {
        partyId = null; // ตัวหาเจ้าของของโดเมนพัง = ผูกรหัสแล้วแต่ไม่ผูก Party (ไม่ลามถึงผู้เรียก)
      }
    }
    // Party ต้องเป็นของร้านนี้ · ผู้ติดต่อมี partyId แล้ว = ไม่ทับ (ตรวจใน linkChatContactParty)
    if (partyId) await linkChatContactParty({ tenantId }, { chatContactId: contact.id, partyId });
    const after = await prisma.chatContact.findFirst({ where: { id: contact.id, tenantId }, select: { partyId: true } });
    return { purpose: row.purpose, refId: row.refId, partyId: after?.partyId ?? null };
  } catch {
    return null;
  }
}
