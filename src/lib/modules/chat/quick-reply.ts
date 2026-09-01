// quick-reply.ts — คลัง "คำตอบสำเร็จรูป" ของร้าน (WO-CV6 · PLAN-CHAT-V2 §3)
//
// 🔴 ทำไมไฟล์นี้ถึงเพิ่งมีวันนี้: ตาราง `ChatQuickReply` มีสคีมาครบตั้งแต่วันแรก
//    (shortcut/title/body/channelTypes/usageCount) แต่ **ไม่มีโค้ดไหนอ่านหรือเขียนเลยสักบรรทัด**
//    — grep ทั้ง `src/` เจอแค่บรรทัดลงทะเบียนใน `core/scope.ts` ⇒ "มีตาราง" ไม่เท่ากับ "มีฟีเจอร์"
//
// 🔴 กติกาที่ห้ามรื้อ (ทุกข้อผูกกับความเสียหายจริง ไม่ใช่รสนิยม)
//  1. **ทุกคำสั่งที่แตะตารางต้องมี `systemId` ใน where/data** — คลังของร้าน A ห้ามโผล่ในร้าน B
//     ใช้ `tenantDb` (ผูกขอบเขตอัตโนมัติ) **และ** เขียนซ้ำในเงื่อนไขอีกชั้น: ชั้นแรกกันคนลืม
//     ชั้นสองทำให้อ่านโค้ดแล้วเห็นขอบเขตโดยไม่ต้องเปิด db.ts (แนวเดียวกับ learning.ts)
//  2. **ถอด = ปัก `archivedAt` ไม่ลบแถว** — ตัวเลข `usageCount` คือประวัติว่าร้านเคยพึ่งคำตอบไหน
//     ลบแถวทิ้ง = ตอบไม่ได้ว่าข้อความที่ส่งไปเมื่อเดือนก่อนมาจากไหน
//  3. **`usageCount` บวกด้วยคำสั่ง SQL เดียว (`{ increment: 1 }`)** ห้ามอ่าน→บวก→เขียน
//     (บทเรียนของรีโปนี้: ตัวนับร่วมที่ไม่จบในคำสั่งเดียว นับพลาดเมื่อ 2 คนกดพร้อมกัน
//      และ DB จำลองจับไม่ได้เพราะรันทีละคำสั่ง)
//  4. **อ่านรายการ ≠ ใช้งาน** — ฟังก์ชัน list/suggest ห้ามแตะตัวนับ ไม่งั้นเปิดหน้าทีเดียวยอดพุ่ง
//     = ตัวเลขที่โกหก แล้วการจัดอันดับ "คำตอบที่ใช้บ่อย" ก็พังตามไปด้วย
//  5. **ตัวแปรที่แทนไม่ได้ ห้ามหลุดเป็น `{{…}}` ถึงลูกค้า** — ข้อความที่ส่งออกไปแล้วแก้ไม่ได้
//     (ดูกติกาเต็มที่ `renderQuickReply`)
//
// ⚠️ ไฟล์นี้เป็น service ล้วน — ห้าม import อะไรที่ผูกกับ request ของ Next (`next/*`, cookies)
//    ด่าน QC เรียกฟังก์ชันในนี้ตรง ๆ เพื่อวัดพฤติกรรม ไม่ได้ grep เอา

import type { ChatChannelType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";

const db = (tenantId: string, systemId: string) => tenantDb({ tenantId, systemId });

// ───────────────────────── ขอบเขตของค่าที่รับได้ (พร้อมเหตุผล) ─────────────────────────

/** ทางลัดยาวสุด — พิมพ์ `/` แล้วต้องพิมพ์ต่อจบใน 1 คำ ยาวกว่านี้ไม่มีใครพิมพ์ (ก็อปวางเอาเร็วกว่า) */
export const QR_SHORTCUT_MAX = 32;
/** หัวเรื่องยาวสุด — ต้องอ่านจบในเมนูลอยกว้าง ~320px ของกล่องพิมพ์ */
export const QR_TITLE_MAX = 80;
/**
 * เนื้อความยาวสุด 2,000 ตัวอักษร
 * 🔴 เพดานจริงของการส่งคือ 4,000 (`sendReply` ใน service.ts) — ตั้งไว้ครึ่งเดียวเพราะ
 *    ตัวแปรขยายตัวได้หลังแทนค่า และทีมมักพิมพ์ต่อท้ายก่อนกดส่ง · เกินเพดานตอนกดส่ง
 *    = ทีมเสียงานที่พิมพ์ไปแล้ว ซึ่งแย่กว่าถูกห้ามตั้งแต่ตอนสร้างคำตอบ
 */
export const QR_BODY_MAX = 2000;
/** จำนวนตัวเลือกที่เสนอในเมนู `/` — มากกว่านี้คนไม่ได้อ่าน แค่เลื่อนผ่าน */
export const QR_SUGGEST_TAKE = 8;

// ───────────────────────── ทะเบียนตัวแปรที่รองรับ ─────────────────────────

/**
 * ตัวแปรที่แทนค่าได้ — **ทะเบียนเดียว** ใช้ทั้งตอนเรนเดอร์ ตอนตรวจก่อนบันทึก และตอนขึ้นคำใบ้บนหน้าจอ
 *
 * 🔴 `fallback` ไม่ใช่ค่าว่าง โดยตั้งใจ: ลูกค้าที่ทักจากเว็บมักไม่มีชื่อ (`displayName` = null)
 *    ถ้าแทนด้วยค่าว่างจะได้ "สวัสดีครับ  ยินดีให้บริการ" — ช่องโหว่กลางประโยคที่อ่านแล้วสะดุด
 *    คำกลาง ๆ ที่สุภาพและไม่โกหก (คุณลูกค้า / ทีมงาน / ทางร้าน) อ่านรู้เรื่องเสมอ
 */
export const QUICK_REPLY_VARS = [
  { key: "contact.name", label: "ชื่อลูกค้า", fallback: "คุณลูกค้า" },
  { key: "staff.name", label: "ชื่อพนักงานที่กำลังตอบ", fallback: "ทีมงาน" },
  { key: "unit.name", label: "ชื่อสาขา/หน่วยงาน", fallback: "ทางร้าน" },
] as const;

export type QuickReplyVarKey = (typeof QUICK_REPLY_VARS)[number]["key"];

export type QuickReplyVars = {
  contact?: { name?: string | null } | null;
  staff?: { name?: string | null } | null;
  unit?: { name?: string | null } | null;
};

/** จับ `{{ contact.name }}` ทุกแบบ (มี/ไม่มีช่องว่างในวงเล็บ) */
const VAR_RE = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

function valueOf(key: string, vars: QuickReplyVars): string | null {
  const def = QUICK_REPLY_VARS.find((v) => v.key === key);
  if (!def) return null; // ไม่รู้จัก → ผู้เรียกเป็นคนตัดสินใจว่าจะทำอย่างไร
  const raw =
    key === "contact.name"
      ? vars?.contact?.name
      : key === "staff.name"
        ? vars?.staff?.name
        : vars?.unit?.name;
  const v = typeof raw === "string" ? raw.trim() : "";
  return v.length > 0 ? v : def.fallback;
}

/**
 * เก็บกวาดช่องว่างที่เกิดจากการถอดตัวแปรออก — เรียก **เฉพาะเมื่อมีการแทนที่จริง**
 * (ข้อความที่ไม่มีตัวแปรเลยต้องออกมาเหมือนเดิมทุกตัวอักษร — ทีมพิมพ์ระยะห่างมาเองต้องได้เท่าเดิม)
 */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ") // ช่องว่างที่เหลือจากตัวแปรที่ถูกถอด
        .replace(/[ \t]+([,.!?·])/g, "$1") // " ·" ที่ลอยหลังคำที่หายไป
        .replace(/^[ \t]*[·,][ \t]*/, "") // ตัวคั่นค้างหัวบรรทัด
        .replace(/[ \t]*[·,][ \t]*$/, "") // ตัวคั่นค้างท้ายบรรทัด
        .trimEnd(),
    )
    .join("\n")
    .trim();
}

/**
 * แทนที่ตัวแปรในเนื้อความคำตอบสำเร็จรูป
 *
 * กติกา (เรียงตามลำดับที่ใช้จริง):
 *  1. ตัวแปร **ที่รู้จักและมีค่า** → ใส่ค่าจริง
 *  2. ตัวแปร **ที่รู้จักแต่ไม่มีค่า** (ลูกค้าไม่มีชื่อ / ห้องไม่ผูกสาขา) → ใส่คำกลาง ๆ จากทะเบียน
 *     ไม่ใช่ค่าว่าง — ประโยคต้องยังอ่านรู้เรื่อง ไม่มีช่องโหว่กลางข้อความ
 *  3. ตัวแปร **ที่ไม่รู้จัก** (พิมพ์ผิด / คิดเอง เช่น `{{promo.code}}`) → **ตัดทิ้ง** แล้วเก็บกวาดช่องว่าง
 *     🔴 เหตุผลที่เลือกตัดทิ้ง ไม่ใช่ปล่อยผ่าน: ข้อความที่ส่งออกไปแล้วเรียกคืนไม่ได้
 *        ลูกค้าเห็น `{{promo.code}}` = ร้านดูไม่มืออาชีพทันที และเราไม่มีทางเดาค่าที่ถูกต้องแทนได้
 *        ⇒ ป้องกันชั้นจริงอยู่ที่ **ตอนบันทึก** (`unknownQuickReplyVars` ปฏิเสธไม่ให้เซฟ)
 *          ชั้นนี้เป็นตาข่ายรับของเก่าที่ถูกบันทึกไว้ก่อนมีกติกา
 *  4. เศษวงเล็บที่ปิดไม่ครบ (`{{ชื่อ`) ถูกกวาดทิ้งท้ายสุดเสมอ — ไม่มี `{{` หรือ `}}` หลุดออกไปได้เลย
 *
 * 🔴 ห้าม throw เด็ดขาด — ฟังก์ชันนี้ถูกเรียกตอนทีมกำลังตอบลูกค้าอยู่
 */
export function renderQuickReply(body: string, vars: QuickReplyVars = {}): string {
  const text = typeof body === "string" ? body : String(body ?? "");
  // ไม่มีวงเล็บเลย = ไม่มีอะไรให้ทำ · คืนของเดิมทุกตัวอักษร (รวมระยะห่างที่ทีมจัดเอง)
  if (!text.includes("{{") && !text.includes("}}")) return text;

  const v = vars ?? {};
  const out = text.replace(VAR_RE, (_m, key: string) => valueOf(key, v) ?? "");
  // ตาข่ายชั้นสุดท้าย: ของที่ regex หลักจับไม่ได้ (วงเล็บปิดไม่ครบ/มีอักขระแปลก)
  // ตาข่ายชั้นสุดท้าย: วงเล็บที่ปิดไม่ครบ (`{{contact.name ต่อ`) — ตัด `{{` **พร้อมชื่อตัวแปรที่ติดมา**
  // ไม่ใช่ตัด `{{` เฉย ๆ เพราะจะเหลือคำว่า "contact.name" โผล่ไปถึงลูกค้าแทน (แย่พอ ๆ กัน)
  // ข้อความจริงที่อยู่หลังช่องว่างยังอยู่ครบ — เราไม่รู้ว่าตั้งใจเขียนถึงไหน จึงไม่กินยาวไปกว่านี้
  const swept = out
    .replace(/\{\{\s*[A-Za-z0-9_.]*\s*\}?\}?/g, "")
    .replace(/\{\{|\}\}/g, "");
  return tidy(swept);
}

/**
 * ตัวแปรที่ "ไม่รู้จัก" ในเนื้อความ — ใช้เตือนคนพิมพ์ **ก่อน** บันทึกลงคลัง
 * (คืนชื่อไม่ซ้ำ เรียงตามที่พบ เพื่อเอาไปต่อเป็นข้อความไทยบอกได้ว่าตัวไหนผิด)
 */
export function unknownQuickReplyVars(body: string): string[] {
  const found = new Set<string>();
  for (const m of String(body ?? "").matchAll(VAR_RE)) {
    const key = m[1] ?? "";
    if (!QUICK_REPLY_VARS.some((v) => v.key === key)) found.add(key);
  }
  return [...found];
}

// ───────────────────────── ตัวกรองช่องทาง ─────────────────────────

/** อ่าน `channelTypes` (คอลัมน์ Json) ให้เป็น array ของสตริงเสมอ — ค่าขยะ = ถือว่าว่าง */
export function parseChannelTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/**
 * คำตอบนี้ใช้กับห้องช่องทางนี้ได้ไหม
 * `channelTypes: []` = ทุกช่องทาง (ตามคอมเมนต์ในสคีมา) · ระบุแล้วไม่ตรง = ไม่เสนอ
 * 🔴 เหตุผลที่ต้องกรอง: ข้อความที่เขียนสำหรับ LINE (มีลิงก์ริชเมนู/สติกเกอร์) ไปโผล่ในห้อง
 *    Instagram = อ่านไม่รู้เรื่อง และบางช่องทางส่งลิงก์ไม่ผ่าน = ลูกค้าได้ข้อความพัง
 */
export function quickReplyMatchesChannel(
  qr: { channelTypes?: unknown },
  channel: ChatChannelType | string | null | undefined,
): boolean {
  const list = parseChannelTypes(qr?.channelTypes);
  if (list.length === 0) return true;
  if (!channel) return false;
  return list.includes(String(channel));
}

// ───────────────────────── ตรวจค่าก่อนบันทึก ─────────────────────────

/**
 * ค่าที่ยอมรับได้ของ `channelTypes` — ยกมาจาก enum `ChatChannelType`
 * ⚠️ ไม่ import ทะเบียนของหน้าจอ (`channel-icon.tsx`) มาที่นี่ เพราะไฟล์นั้นเป็น .tsx (React)
 *    ส่วนไฟล์นี้ต้องถูก import ได้จากสคริปต์เปล่า ๆ · ความถูกต้องคุมด้วย typecheck ข้างล่างแทน
 */
const CHANNEL_VALUES: readonly ChatChannelType[] = [
  "LINE",
  "WEBCHAT",
  "APP",
  "FACEBOOK",
  "INSTAGRAM",
  "WHATSAPP",
  "TIKTOK",
  "SHOPEE",
  "LAZADA",
];

/** ทางลัดที่เก็บใน DB ไม่มี `/` นำหน้า — `/` เป็นแค่ปุ่มเรียกเมนูในกล่องพิมพ์ ไม่ใช่ส่วนหนึ่งของชื่อ */
export function normalizeShortcut(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase(); // อังกฤษพิมพ์ใหญ่/เล็กถือเป็นตัวเดียวกัน (ไทยไม่มีผล) — กันทางลัดที่ดูซ้ำแต่ชนไม่ได้
}

type FieldError = { ok: false; reason: string };
type Fields = { shortcut: string; title: string; body: string; channelTypes: string[] };

function validate(input: {
  shortcut: string;
  title: string;
  body: string;
  channelTypes: string[];
}): Fields | FieldError {
  const shortcut = normalizeShortcut(input.shortcut);
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();

  if (!shortcut) return { ok: false, reason: "ต้องตั้งทางลัด เช่น /ราคา (ไม่ต้องใส่ / ก็ได้)" };
  if (shortcut.length > QR_SHORTCUT_MAX) {
    return { ok: false, reason: `ทางลัดยาวเกิน ${QR_SHORTCUT_MAX} ตัวอักษร — ตั้งให้สั้นพอที่จะพิมพ์เร็ว` };
  }
  if (/\s/.test(shortcut)) {
    return { ok: false, reason: "ทางลัดต้องเป็นคำเดียว ห้ามมีเว้นวรรค (พิมพ์ / แล้วต้องจบใน 1 คำ)" };
  }
  if (!title) return { ok: false, reason: "ต้องตั้งหัวเรื่อง เพื่อให้ทีมเลือกถูกตัวจากเมนู" };
  if (title.length > QR_TITLE_MAX) return { ok: false, reason: `หัวเรื่องยาวเกิน ${QR_TITLE_MAX} ตัวอักษร` };
  if (!body) return { ok: false, reason: "ต้องใส่เนื้อความที่จะส่งให้ลูกค้า" };
  if (body.length > QR_BODY_MAX) {
    return { ok: false, reason: `เนื้อความยาวเกิน ${QR_BODY_MAX.toLocaleString("th-TH")} ตัวอักษร` };
  }

  // วงเล็บที่ปิดไม่ครบ = พิมพ์ตกหล่น · ตอนส่งจะถูกกวาดทิ้งจนความหมายเพี้ยน ⇒ บอกตั้งแต่ตอนบันทึก
  if ((body.match(/\{\{/g) ?? []).length !== (body.match(/\}\}/g) ?? []).length) {
    return { ok: false, reason: "วงเล็บตัวแปรปิดไม่ครบ — ต้องเป็น {{ชื่อตัวแปร}} เสมอ" };
  }

  // 🔴 ด่านจริงของกติกา "ห้าม {{…}} หลุดถึงลูกค้า" — จับตอนที่ยังมีคนแก้ได้
  const unknown = unknownQuickReplyVars(body);
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `ไม่รู้จักตัวแปร ${unknown.map((u) => `{{${u}}}`).join(" ")} — ใช้ได้เฉพาะ ${QUICK_REPLY_VARS.map((v) => `{{${v.key}}}`).join(" ")} (ตัวแปรที่ไม่รู้จักจะถูกตัดทิ้งตอนส่ง)`,
    };
  }

  const valid = new Set<string>(CHANNEL_VALUES);
  const channelTypes = [...new Set(input.channelTypes.filter((c) => valid.has(c)))];
  return { shortcut, title, body, channelTypes };
}

// ───────────────────────── ขาอ่าน ─────────────────────────

export type QuickReplyRow = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  channelTypes: string[];
  usageCount: number;
  archivedAt: Date | null;
  createdAt: Date;
};

const toRow = (r: {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  channelTypes: unknown;
  usageCount: number;
  archivedAt: Date | null;
  createdAt: Date;
}): QuickReplyRow => ({
  id: r.id,
  shortcut: r.shortcut,
  title: r.title,
  body: r.body,
  channelTypes: parseChannelTypes(r.channelTypes),
  usageCount: r.usageCount,
  archivedAt: r.archivedAt,
  createdAt: r.createdAt,
});

/**
 * รายการทั้งคลัง สำหรับ **หน้าจัดการ** (รวมของที่ถอดแล้วได้ ถ้าขอ)
 * 🔴 ห้ามแตะ `usageCount` ที่นี่ (กติกาข้อ 4) — เปิดหน้าไม่ใช่การใช้งาน
 */
export async function listQuickReplies(args: {
  tenantId: string;
  systemId: string;
  includeArchived?: boolean;
  take?: number;
}): Promise<QuickReplyRow[]> {
  const { tenantId, systemId } = args;
  const rows = await db(tenantId, systemId).chatQuickReply.findMany({
    where: { tenantId, systemId, ...(args.includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ archivedAt: "asc" }, { usageCount: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(200, args.take ?? 100)),
  });
  return rows.map(toRow);
}

/**
 * ตัวเลือกที่จะเสนอในกล่องพิมพ์ตอนทีมพิมพ์ `/`
 * - ของที่ถอดแล้ว (`archivedAt`) ไม่ถูกเสนออีก
 * - กรองตามช่องทางของห้อง (`[]` = ทุกช่องทาง)
 * - เรียงตาม "ตรงทางลัดก่อน แล้วค่อยของที่ใช้บ่อย" — คนพิมพ์ทางลัดคือคนที่รู้อยู่แล้วว่าจะเอาตัวไหน
 * 🔴 ห้ามแตะ `usageCount` ที่นี่เช่นกัน
 */
export async function suggestQuickReplies(args: {
  tenantId: string;
  systemId: string;
  channel?: ChatChannelType | string | null;
  query?: string;
  take?: number;
}): Promise<QuickReplyRow[]> {
  const { tenantId, systemId } = args;
  const rows = await db(tenantId, systemId).chatQuickReply.findMany({
    where: { tenantId, systemId, archivedAt: null },
    orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const q = normalizeShortcut(args.query ?? "");
  const qRaw = String(args.query ?? "").trim().replace(/^\/+/, "").toLowerCase();
  const take = Math.max(1, Math.min(20, args.take ?? QR_SUGGEST_TAKE));

  return rows
    .map(toRow)
    .filter((r) => quickReplyMatchesChannel(r, args.channel ?? null))
    .filter((r) => {
      if (!qRaw) return true;
      return (
        r.shortcut.includes(q) ||
        r.title.toLowerCase().includes(qRaw) ||
        r.body.toLowerCase().includes(qRaw)
      );
    })
    .sort((a, b) => {
      if (!q) return 0;
      const rank = (r: QuickReplyRow) => (r.shortcut.startsWith(q) ? 0 : r.shortcut.includes(q) ? 1 : 2);
      return rank(a) - rank(b);
    })
    .slice(0, take);
}

/** อ่านตัวเดียว (ตรวจว่าเป็นของร้าน/ระบบนี้จริง) */
export async function getQuickReply(args: {
  tenantId: string;
  systemId: string;
  quickReplyId: string;
}): Promise<QuickReplyRow | null> {
  const { tenantId, systemId } = args;
  const row = await db(tenantId, systemId).chatQuickReply.findFirst({
    where: { tenantId, systemId, id: (args.quickReplyId ?? "").trim() },
  });
  return row ? toRow(row) : null;
}

// ───────────────────────── ขาเขียน ─────────────────────────

export type QuickReplyResult = { ok: boolean; quickReplyId?: string; reason?: string };

/**
 * หาคำตอบที่ใช้ทางลัดชนกัน — คืนไว้เพื่อบอกเป็นภาษาไทยว่า **ชนกับอันไหน**
 * (สคีมามี `@@unique([systemId, shortcut])` อยู่แล้ว แต่ error ของ Prisma อ่านไม่รู้เรื่อง
 *  และไม่บอกว่าตัวที่ชนชื่ออะไร — คนแก้ต้องไปไล่หาเอง)
 */
async function findByShortcut(tenantId: string, systemId: string, shortcut: string) {
  return db(tenantId, systemId).chatQuickReply.findFirst({
    where: { tenantId, systemId, shortcut },
  });
}

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export async function createQuickReply(args: {
  tenantId: string;
  systemId: string;
  userId: string;
  shortcut: string;
  title: string;
  body: string;
  channelTypes?: string[];
}): Promise<QuickReplyResult> {
  const { tenantId, systemId } = args;
  const v = validate({
    shortcut: args.shortcut,
    title: args.title,
    body: args.body,
    channelTypes: args.channelTypes ?? [],
  });
  if ("ok" in v) return v;

  const dup = await findByShortcut(tenantId, systemId, v.shortcut);
  if (dup) {
    return {
      ok: false,
      reason: `ทางลัด /${v.shortcut} ถูกใช้กับ “${dup.title}” อยู่แล้ว — ตั้งทางลัดอื่น หรือแก้ที่ตัวเดิมแทน`,
    };
  }

  try {
    const created = await db(tenantId, systemId).chatQuickReply.create({
      data: {
        tenantId,
        systemId,
        shortcut: v.shortcut,
        title: v.title,
        body: v.body,
        channelTypes: v.channelTypes as unknown as Prisma.InputJsonValue,
        createdByUserId: args.userId,
      },
    });
    return { ok: true, quickReplyId: created.id };
  } catch (e) {
    // แข่งกันสร้างพร้อมกัน 2 คน — unique index เป็นด่านจริง ข้อความข้างบนเป็นแค่ความสุภาพ
    if (isUniqueViolation(e)) return { ok: false, reason: `ทางลัด /${v.shortcut} เพิ่งถูกใช้ไปพอดี — ตั้งทางลัดอื่น` };
    throw e;
  }
}

export async function updateQuickReply(args: {
  tenantId: string;
  systemId: string;
  quickReplyId: string;
  shortcut: string;
  title: string;
  body: string;
  channelTypes?: string[];
}): Promise<QuickReplyResult> {
  const { tenantId, systemId } = args;
  const quickReplyId = (args.quickReplyId ?? "").trim();
  if (!quickReplyId) return { ok: false, reason: "ไม่ได้ระบุคำตอบที่จะแก้" };

  const v = validate({
    shortcut: args.shortcut,
    title: args.title,
    body: args.body,
    channelTypes: args.channelTypes ?? [],
  });
  if ("ok" in v) return v;

  const dup = await findByShortcut(tenantId, systemId, v.shortcut);
  if (dup && dup.id !== quickReplyId) {
    return { ok: false, reason: `ทางลัด /${v.shortcut} ถูกใช้กับ “${dup.title}” อยู่แล้ว — ตั้งทางลัดอื่น` };
  }

  try {
    const res = await db(tenantId, systemId).chatQuickReply.updateMany({
      where: { tenantId, systemId, id: quickReplyId },
      data: {
        shortcut: v.shortcut,
        title: v.title,
        body: v.body,
        channelTypes: v.channelTypes as unknown as Prisma.InputJsonValue,
      },
    });
    if (res.count === 0) return { ok: false, reason: "ไม่พบคำตอบสำเร็จรูปนี้ในคลังของร้าน" };
    return { ok: true, quickReplyId };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, reason: `ทางลัด /${v.shortcut} เพิ่งถูกใช้ไปพอดี — ตั้งทางลัดอื่น` };
    throw e;
  }
}

/** ถอดออกจากเมนู — ปัก `archivedAt` ไม่ลบแถว (กติกาข้อ 2) */
export async function archiveQuickReply(args: {
  tenantId: string;
  systemId: string;
  quickReplyId: string;
}): Promise<QuickReplyResult> {
  const { tenantId, systemId } = args;
  const res = await db(tenantId, systemId).chatQuickReply.updateMany({
    where: { tenantId, systemId, id: (args.quickReplyId ?? "").trim(), archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบคำตอบนี้ในคลังของร้าน (หรือถูกถอดไปแล้ว)" };
  return { ok: true };
}

/** เอากลับมาใช้ใหม่ — ถอดผิดตัวต้องแก้ได้ ไม่ใช่ทางเดียว */
export async function restoreQuickReply(args: {
  tenantId: string;
  systemId: string;
  quickReplyId: string;
}): Promise<QuickReplyResult> {
  const { tenantId, systemId } = args;
  const res = await db(tenantId, systemId).chatQuickReply.updateMany({
    where: { tenantId, systemId, id: (args.quickReplyId ?? "").trim(), archivedAt: { not: null } },
    data: { archivedAt: null },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบคำตอบที่ถูกถอดไว้" };
  return { ok: true };
}

/**
 * บวกตัวนับการใช้งาน — **คำสั่ง SQL เดียว** (กติกาข้อ 3)
 *
 * 🔴 ห้ามเปลี่ยนเป็นอ่าน→บวก→เขียนเด็ดขาด: พนักงาน 2 คนกดคำตอบเดียวกันพร้อมกัน
 *    จะอ่านค่าเดิมเท่ากันแล้วเขียนทับกัน = นับหายไป 1 · DB จำลอง (รันทีละคำสั่ง) จับไม่ได้เลย
 * 🔴 ตัวนับ **ไม่ใช่** เงื่อนไขความถูกต้องของการตอบลูกค้า — พลาดแล้วห้ามทำให้การตอบล้ม
 *    (ตัวเรียกจึงกลืน error ทิ้งได้ ดู `applyQuickReply`)
 */
export async function markQuickReplyUsed(args: {
  tenantId: string;
  systemId: string;
  quickReplyId: string;
}): Promise<number> {
  const { tenantId, systemId } = args;
  const res = await db(tenantId, systemId).chatQuickReply.updateMany({
    where: { tenantId, systemId, id: (args.quickReplyId ?? "").trim() },
    data: { usageCount: { increment: 1 } },
  });
  return res.count;
}

// ───────────────────────── หยิบไปใช้จริง (เส้นทางของกล่องพิมพ์) ─────────────────────────

export type ApplyResult = { ok: boolean; body?: string; reason?: string };

/**
 * ทีมเลือกคำตอบจากเมนู `/` → คืน **ข้อความที่แทนค่าตัวแปรแล้ว** ให้ไปวางในกล่องพิมพ์
 *
 * 🔴 ฟังก์ชันนี้ **ไม่ส่งข้อความ** — ทีมต้องได้อ่าน/แก้ก่อนกดส่งเสมอ
 *    (คำตอบสำเร็จรูปที่ยิงออกทันทีคือเครื่องมือที่ส่งข้อความผิดห้องได้ด้วยการกดพลาดครั้งเดียว)
 * 🔴 นับ `usageCount` ที่จุดนี้ ไม่ใช่ตอนกดส่ง: เพราะเราไม่ได้เก็บว่าข้อความที่ส่งมาจากคำตอบไหน
 *    ⇒ ถ้าไปนับตอนส่งจะต้องเดา · จุดนี้คือ "คนกดเลือกใช้จริง" ซึ่งเป็นสัญญาณที่ตรงที่สุดที่เรามี
 *    (เปิดดูรายการเฉย ๆ ไม่นับ — ดู `suggestQuickReplies`)
 */
export async function applyQuickReply(args: {
  tenantId: string;
  systemId: string;
  conversationId: string;
  quickReplyId: string;
  staffName?: string | null;
}): Promise<ApplyResult> {
  const { tenantId, systemId } = args;
  const quickReplyId = (args.quickReplyId ?? "").trim();
  const conversationId = (args.conversationId ?? "").trim();
  if (!quickReplyId || !conversationId) return { ok: false, reason: "ข้อมูลไม่ครบสำหรับหยิบคำตอบสำเร็จรูป" };
  const d = db(tenantId, systemId);

  const qr = await d.chatQuickReply.findFirst({
    where: { tenantId, systemId, id: quickReplyId, archivedAt: null },
  });
  if (!qr) return { ok: false, reason: "ไม่พบคำตอบสำเร็จรูปนี้ (อาจถูกถอดออกจากคลังไปแล้ว)" };

  // ไม่มี FK ระหว่างสองตารางนี้ → ตรวจเองว่าห้องเป็นของร้าน/ระบบเดียวกัน
  const conv = await d.chatConversation.findFirst({
    where: { id: conversationId, tenantId, systemId },
    include: { contact: true },
  });
  if (!conv) return { ok: false, reason: "ไม่พบห้องแชทนี้ในระบบของร้าน" };

  if (!quickReplyMatchesChannel({ channelTypes: qr.channelTypes }, conv.channel)) {
    return { ok: false, reason: `คำตอบ “${qr.title}” ถูกตั้งให้ใช้เฉพาะบางช่องทาง ไม่รวมห้องนี้` };
  }

  const unit = conv.unitId
    ? await d.businessUnit.findFirst({ where: { id: conv.unitId, tenantId } })
    : null;

  const body = renderQuickReply(qr.body, {
    contact: { name: conv.contact?.displayName ?? null },
    staff: { name: args.staffName ?? null },
    unit: { name: unit?.name ?? null },
  });

  // ตัวนับพลาดได้ แต่การตอบลูกค้าห้ามพลาด
  await markQuickReplyUsed({ tenantId, systemId, quickReplyId }).catch(() => 0);

  return { ok: true, body };
}
