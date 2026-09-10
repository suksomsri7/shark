// boards-email.ts — "อีเมลเข้าบอร์ด": กุญแจของที่อยู่ `งาน+{key}@shark.in.th` (K3.9)
//                    พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.2 · สัญญา `ledger/KANBAN-RUN.md` §K3.9
//
// 🔴 กุญแจใบนี้คือ "สิทธิ์เขียนที่ส่งต่อกันได้" — ใครก็ตามที่รู้ที่อยู่นี้ ส่งอีเมลเข้ามาแล้วได้การ์ดในบอร์ด
//    (ผู้ส่งพิสูจน์ตัวตนไม่ได้ — ปลอม From ได้ฟรี) ⇒ ความปลอดภัยทั้งหมดอยู่ที่ "เดาไม่ได้" อย่างเดียว
//    ดังนั้น: สุ่มจาก `crypto.getRandomValues` เท่านั้น (ห้าม `Math.random` — คาดเดาได้จากผลก่อนหน้า)
//    และต้องหมุนทิ้งได้ทุกเมื่อ (`rotateEmailKey`) เมื่อที่อยู่หลุดออกไปนอกทีม
//
// 🔴 base32 ตัวพิมพ์เล็ก `[a-z2-7]` (ตัด 0/1/8/9 ที่สับสนกับ o/l/b/g เวลาอ่านจากจอไปพิมพ์ในมือถือ)
//    8 ตัว = 32^8 ≈ 1.1 ล้านล้านค่า — เดาสุ่มไม่ไหวในทางปฏิบัติ
//
// 🔴 ทำไมต้องเช็ค "ไม่ซ้ำทั้งระบบ" ทั้งที่ดัชนี unique เป็น (tenantId, emailKey):
//    อีเมลขาเข้ามีแต่กุญแจ ยังไม่รู้ว่าเป็นร้านไหน ⇒ ถ้าสองร้านบังเอิญได้กุญแจเดียวกัน
//    ตัวหาบอร์ดจะเจอสองใบแล้วต้องเดา = อีเมลของร้านหนึ่งอาจตกไปอีกร้าน (รั่วข้ามร้าน)
//    ⇒ ตอนสุ่มจึงตรวจทั้งตาราง แล้วสุ่มใหม่ถ้าชน · ตอนอ่านก็ปฏิเสธถ้าเจอมากกว่า 1 ใบ (fail-closed)

import { boardRole, hasBoardRole, KanbanForbiddenError, KanbanNotFoundError } from "./access";
import { logActivity } from "./activity-log";
import { prisma } from "./db";
import type { KanbanActor, KanbanCtx } from "./types";

/** โดเมนของที่อยู่รับอีเมลเข้าบอร์ด (ที่เดียวในโค้ด — เปลี่ยนวันหน้าแก้บรรทัดนี้บรรทัดเดียว) */
export const BOARD_EMAIL_DOMAIN = "shark.in.th";
/** ส่วนหน้าของที่อยู่ที่แสดงให้ผู้ใช้ (ไทย) — ผู้ให้บริการบางรายส่ง local-part มาเป็น ASCII เท่านั้น */
export const BOARD_EMAIL_LOCAL_TH = "งาน";
/** ส่วนหน้าแบบ ASCII ที่ยอมรับด้วย (บางระบบ/บางไคลเอนต์ตัดอักษรไทยทิ้ง) */
export const BOARD_EMAIL_LOCAL_ASCII = "tasks";

const KEY_LEN = 8;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // base32 ตัวเล็ก (RFC 4648 แบบพิมพ์เล็ก)

/** ที่อยู่เต็มของบอร์ดจากกุญแจ — จุดเดียวที่ประกอบสตริงนี้ (จอ/อีเมล/ข้อสอบใช้ตัวเดียวกัน) */
export function boardEmailAddress(key: string): string {
  return `${BOARD_EMAIL_LOCAL_TH}+${key}@${BOARD_EMAIL_DOMAIN}`;
}

/** รูปของกุญแจที่ถูกต้อง — ใช้ทั้งตอนสร้างและตอนอ่านจากที่อยู่ผู้รับ */
export function isBoardEmailKey(key: string): boolean {
  return new RegExp(`^[a-z2-7]{${KEY_LEN}}$`).test(key);
}

/**
 * กุญแจสุ่มจาก CSPRNG — **ห้ามเปลี่ยนไปใช้ `Math.random`**
 * ตัดค่าที่เกินขอบเซตทิ้ง (rejection sampling) เพื่อให้ทุกตัวอักษรมีโอกาสเท่ากันจริง
 * (`byte % 32` เผอิญเท่ากันพอดีเพราะ 256 หาร 32 ลงตัว — เขียนแบบนี้ไว้ให้ถูกแม้วันหน้าเปลี่ยนความยาวเซต)
 */
function randomKey(): string {
  const bytes = new Uint8Array(KEY_LEN * 2);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  for (let i = 0; i < bytes.length && out.length < KEY_LEN; i++) {
    const b = bytes[i]!;
    if (b >= limit) continue;
    out += ALPHABET[b % ALPHABET.length];
  }
  // ยังไม่ครบ (โอกาสน้อยมาก) → เติมด้วยรอบใหม่ ไม่ใช่ปล่อยกุญแจสั้นกว่ามาตรฐาน
  return out.length === KEY_LEN ? out : randomKey();
}

/** สุ่มจนได้กุญแจที่ยังไม่มีใครใช้ **ทั้งระบบ** (ดูเหตุผลหัวไฟล์) */
async function freshKey(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const key = randomKey();
    const taken = await prisma.kanbanBoard.findFirst({ where: { emailKey: key }, select: { id: true } });
    if (!taken) return key;
  }
  // ชน 12 ครั้งติดกันแปลว่ามีอะไรผิดปกติกับตัวสุ่ม ไม่ใช่โชคร้าย — หยุดดีกว่าออกกุญแจที่อาจชน
  throw new Error("สร้างที่อยู่อีเมลของบอร์ดไม่สำเร็จ — กรุณาลองอีกครั้ง");
}

/** ด่านของทั้งไฟล์: ต้องเป็น **ผู้ดูแลบอร์ด** (ADMIN) — ที่อยู่นี้เท่ากับเปิดประตูให้คนนอกเขียนการ์ด */
async function assertBoardAdmin(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
): Promise<{ id: string; emailKey: string | null }> {
  const board = await prisma.kanbanBoard.findFirst({
    where: { id: boardId, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true, unitId: true, visibility: true, emailKey: true },
  });
  // มองไม่เห็น/ไม่มี = 404 เสมอ (§6.3 — ห้ามบอกว่ามีบอร์ดใบนี้อยู่)
  if (!board) throw new KanbanNotFoundError();
  const members = await prisma.kanbanBoardMember.findMany({
    where: { boardId: board.id, tenantId: ctx.tenantId },
    select: { userId: true, role: true },
  });
  const role = boardRole(actor, board, members);
  if (role === null) throw new KanbanNotFoundError();
  if (!hasBoardRole(role, "ADMIN")) {
    throw new KanbanForbiddenError("ต้องเป็นผู้ดูแลบอร์ดนี้ จึงจะเปิด/เปลี่ยนที่อยู่อีเมลของบอร์ดได้");
  }
  return { id: board.id, emailKey: board.emailKey };
}

export type BoardEmailKey = { key: string; address: string };

/**
 * เปิดที่อยู่อีเมลของบอร์ด — **idempotent**: มีอยู่แล้วคืนของเดิม ไม่สร้างใหม่
 * (ถ้าเรียกซ้ำแล้วได้กุญแจใหม่ทุกครั้ง = ที่อยู่ที่ทีมเพิ่งแปะไว้ในลายเซ็นอีเมลจะตายเงียบ ๆ)
 */
export async function ensureEmailKey(ctx: KanbanCtx, actor: KanbanActor, boardId: string): Promise<BoardEmailKey> {
  const board = await assertBoardAdmin(ctx, actor, boardId);
  if (board.emailKey && isBoardEmailKey(board.emailKey)) {
    return { key: board.emailKey, address: boardEmailAddress(board.emailKey) };
  }
  const key = await freshKey();
  await prisma.$transaction(async (tx) => {
    await tx.kanbanBoard.updateMany({
      where: { id: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { emailKey: key },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: board.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      data: { fields: ["emailKey"], emailKeyCreated: true },
    });
  });
  return { key, address: boardEmailAddress(key) };
}

/**
 * หมุนกุญแจใหม่ — ของเก่าใช้ไม่ได้ทันที (คอลัมน์เดียว ไม่มีช่วงผ่อนผัน)
 * 🔴 ตั้งใจไม่ทำ "กุญแจเก่ายังใช้ได้อีก 7 วัน": คนกดปุ่มนี้คือคนที่รู้ว่าที่อยู่หลุดไปแล้ว
 *    ช่วงผ่อนผัน = ช่วงที่คนที่ไม่ควรเขียนยังเขียนได้ ซึ่งตรงข้ามกับเจตนาของปุ่ม
 */
export async function rotateEmailKey(ctx: KanbanCtx, actor: KanbanActor, boardId: string): Promise<BoardEmailKey> {
  const board = await assertBoardAdmin(ctx, actor, boardId);
  const previous = board.emailKey;
  const key = await freshKey();
  await prisma.$transaction(async (tx) => {
    await tx.kanbanBoard.updateMany({
      where: { id: board.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: { emailKey: key },
    });
    await logActivity(tx, {
      tenantId: ctx.tenantId,
      boardId: board.id,
      actorUserId: ctx.actorUserId ?? null,
      type: "BOARD_UPDATED",
      // 🔴 ไม่จดกุญแจเก่า/ใหม่ลงประวัติ — ประวัติกิจกรรมทุกคนในบอร์ดอ่านได้ (รวม VIEWER)
      //    จดไว้ = ที่อยู่ที่เพิ่งหมุนหนีไปโผล่ในบันทึกที่คนกลุ่มเดิมยังอ่านได้อยู่ดี
      data: { fields: ["emailKey"], emailKeyRotated: true, hadKey: previous !== null },
    });
  });
  return { key, address: boardEmailAddress(key) };
}

/** อ่านที่อยู่ปัจจุบันของบอร์ด (หน้าตั้งค่า) — ยังไม่เคยเปิด = null (ไม่สร้างให้เองตอนแค่เปิดหน้าดู) */
export async function getBoardEmailKey(
  ctx: KanbanCtx,
  actor: KanbanActor,
  boardId: string,
): Promise<BoardEmailKey | null> {
  const board = await assertBoardAdmin(ctx, actor, boardId);
  return board.emailKey && isBoardEmailKey(board.emailKey)
    ? { key: board.emailKey, address: boardEmailAddress(board.emailKey) }
    : null;
}

export type BoardByEmailKey = { boardId: string; tenantId: string; systemId: string };

/**
 * หาบอร์ดจากกุญแจ — **ทางเข้าเดียว** ของฝั่งอีเมลขาเข้า (ยังไม่รู้ร้าน จึงค้นทั้งตาราง)
 * เงื่อนไข: กุญแจถูกรูป · บอร์ด ACTIVE · เจอ **ใบเดียว** เท่านั้น (เจอหลายใบ = ปฏิเสธ ดูหัวไฟล์)
 * ไม่เจอ = `null` — ผู้เรียกต้องตอบแบบไม่บอกว่ามีบอร์ดอยู่หรือไม่
 */
export async function findBoardByEmailKey(key: string): Promise<BoardByEmailKey | null> {
  if (!isBoardEmailKey(key)) return null;
  const rows = await prisma.kanbanBoard.findMany({
    where: { emailKey: key, status: "ACTIVE" },
    select: { id: true, tenantId: true, systemId: true },
    take: 2,
  });
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  return { boardId: row.id, tenantId: row.tenantId, systemId: row.systemId };
}

/**
 * ดึงกุญแจออกจากรายชื่อผู้รับของอีเมล 1 ฉบับ
 * รับได้ทั้ง `งาน+{key}@shark.in.th` และ `tasks+{key}@shark.in.th` · ทน `"ชื่อ" <a@b>` และตัวพิมพ์ใหญ่
 * ไม่พบ = `null` (ที่อยู่อื่นของโดเมน เช่น info@ ไม่ใช่เรื่องของบอร์ดงาน)
 */
export function boardEmailKeyFromRecipients(recipients: readonly string[]): string | null {
  const local = `(?:${BOARD_EMAIL_LOCAL_TH}|${BOARD_EMAIL_LOCAL_ASCII})`;
  const re = new RegExp(`${local}\\+([a-zA-Z2-7]{${KEY_LEN}})@${BOARD_EMAIL_DOMAIN.replace(/\./g, "\\.")}`, "i");
  for (const raw of recipients) {
    if (typeof raw !== "string") continue;
    const m = raw.match(re);
    if (m?.[1]) {
      const key = m[1].toLowerCase();
      if (isBoardEmailKey(key)) return key;
    }
  }
  return null;
}
