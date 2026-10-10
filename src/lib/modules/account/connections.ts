// connections.ts — "ตั้งค่า › การเชื่อมต่อ › ระบบใน SHARK" (WO 8.3 · SPEC §9.5 · เฟรม g14)
//
// กติกาความปลอดภัยของหน้านี้ (แถบท้ายการ์ดในเฟรม g14): **ไม่เชื่อม = ไม่ลงบัญชีให้**
//   ทางเข้าเงินจากระบบอื่นทุกเส้นวิ่งผ่าน `AccountSystemLink` อยู่แล้ว (`findAccountLinkForPos` /
//   `findAccountLinkFor`) ⇒ WO นี้เพิ่มแค่คอลัมน์ `enabled` ให้ "ตัดการเชื่อม" ได้โดยไม่ลบแถว
//   (ลบแถว = ตัวเลือก/บัญชีที่ผูกไว้หายหมด · เชื่อมกลับต้องตั้งใหม่ทั้งชุด)
//
// 🔴 ตัวอ่าน link ทั้ง 2 ตัวใน service.ts ต้องกรอง `enabled: true` ด้วย ไม่ใช่แค่ `archivedAt: null`
//    (ถ้าลืม = กดตัดการเชื่อมแล้ว POS ยังลงบัญชีต่อเงียบ ๆ — ข้อสอบ qc-acc-v2-permissions L5 จับข้อนี้)

import type { AccountLinkedKind, Prisma, SystemType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { formatDateTh } from "@/lib/ui/date";
import { ACCOUNT_SCOPE_KEYS } from "@/lib/api-keys/scopes"; // CRM C5.5-fix8 ▸ กติกาหมุนคีย์ = กติกาออกคีย์ ◂

export type Ctx = { tenantId: string; systemId: string };

type Db = ReturnType<typeof tenantDb>;
const dbOf = (ctx: Ctx): Db => tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });

// ─────────────────────────── แคตตาล็อกการ์ด (ลำดับตามเฟรม g14) ───────────────────────────

export type ToggleKey = "autoCreateContact" | "syncProductPrices" | "autoPost" | "inboxFromChat";

export const TOGGLE_LABELS: Record<ToggleKey, string> = {
  autoCreateContact: "สร้างผู้ติดต่ออัตโนมัติ",
  syncProductPrices: "ซิงก์ราคา/ต้นทุน",
  autoPost: "ลงบัญชีอัตโนมัติ",
  inboxFromChat: "รับบิลจากแชทเข้ากล่องขาเข้า",
};

export type ConnectionCatalogItem = {
  kind: AccountLinkedKind;
  /** ชนิดระบบของแพลตฟอร์มที่การ์ดนี้ผูก — null = SHARK ยังไม่มีระบบนี้ (การ์ดจาง "ยังไม่มีระบบ") */
  systemType: SystemType | null;
  label: string;
  icon: string;
  /** คำบรรยายเมื่อยังไม่เชื่อม */
  hint: string;
  /** คำบรรยายเมื่อเชื่อมแล้ว (บอกว่าเชื่อมกับอะไร — ตรงกับบรรทัดแรกของการ์ดในเฟรม g14) */
  linkedHint: string;
  toggles: readonly ToggleKey[];
  /** ป้ายบัญชีที่ใช้ (mapping key → โชว์เป็นรหัสบัญชี) */
  accountKeys: readonly string[];
};

/**
 * 8 การ์ดตามเฟรม g14 — SHARK มี SystemType จริง 6 ตัวแรก
 * (จอง/โรงแรม/คลินิก/โรงเรียน/เช่า/ตั๋ว ที่ §9.5 พูดถึงยังไม่มีเป็น `SystemType` ในแพลตฟอร์ม
 *  ⇒ แสดงเป็นการ์ด "ยังไม่มีระบบ" ตามที่เฟรมวาดไว้ ไม่ใช่ซ่อน — ผู้ใช้จะได้รู้ว่าเชื่อมอะไรได้บ้างในอนาคต)
 */
export const CONNECTION_CATALOG: readonly ConnectionCatalogItem[] = [
  {
    kind: "POS",
    linkedHint: "บิลหน้าร้านทุกใบ · ผูกทะเบียนสินค้า",
    systemType: "POS",
    label: "หน้าร้าน (POS)",
    icon: "cash",
    hint: "เชื่อมเพื่อให้บิลหน้าร้านลงบัญชีอัตโนมัติ",
    toggles: ["autoCreateContact", "syncProductPrices", "autoPost"],
    accountKeys: ["INCOME_GOODS", "AR"],
  },
  {
    kind: "MEMBER",
    linkedHint: "ผูกกับระบบสมาชิกของร้าน",
    systemType: "MEMBER",
    label: "สมาชิก",
    icon: "users",
    hint: "ผูกกับระบบสมาชิกของร้าน",
    toggles: ["autoCreateContact", "autoPost"],
    accountKeys: ["INCOME_DEFAULT"],
  },
  {
    kind: "CRM",
    linkedHint: "ลูกค้าสัมพันธ์ · ผูกทุกดีลที่ปิดแล้ว",
    systemType: "CRM",
    label: "CRM",
    icon: "shop",
    hint: "ลูกค้าสัมพันธ์ · ผูกทุกดีลที่ปิดแล้ว",
    toggles: ["autoCreateContact", "autoPost"],
    accountKeys: ["INCOME_SERVICE"],
  },
  {
    kind: "CHAT",
    linkedHint: "LINE OA · Facebook · Instagram",
    systemType: "CHAT",
    label: "แชทลูกค้า",
    icon: "chat",
    hint: "LINE OA · Facebook · Instagram",
    toggles: ["autoCreateContact", "inboxFromChat", "autoPost"],
    accountKeys: ["INCOME_DEFAULT"],
  },
  {
    kind: "INVENTORY",
    linkedHint: "ผูกกับรายการคลังสินค้าทุกรายการ",
    systemType: "INVENTORY",
    label: "คลังสินค้า",
    icon: "box",
    hint: "ผูกกับรายการคลังสินค้าทุกรายการ",
    toggles: ["syncProductPrices", "autoPost"],
    accountKeys: ["INVENTORY", "GOODS_ISSUE_EXPENSE"],
  },
  {
    kind: "HR",
    linkedHint: "ผูกกับทะเบียนพนักงานและรอบเงินเดือน",
    systemType: "HR",
    label: "พนักงานและเงินเดือน",
    icon: "users",
    hint: "เชื่อมเพื่อให้เงินเดือนลงบัญชีอัตโนมัติ",
    toggles: ["autoPost"],
    accountKeys: ["SALARY_EXPENSE"], // ไม่มี mapping key จริง — postPayrollJV ใช้ 6000 ตรง ๆ (ดู FALLBACK_CODE)
  },
  {
    kind: "BUSINESS",
    linkedHint: "รับข้อมูลการจองทริป/เรือมาลงบัญชี",
    systemType: null,
    label: "จอง/ทริป",
    icon: "calendar",
    hint: "เชื่อมเพื่อรับข้อมูลการจองทริป/เรือมาลงบัญชีอัตโนมัติ",
    toggles: ["autoCreateContact", "autoPost"],
    accountKeys: ["INCOME_SERVICE"],
  },
];

/** การ์ด "ยังไม่มีระบบ" ที่ §9.5 พูดถึงแต่แพลตฟอร์มยังไม่มี — แสดงจาง กดไม่ได้ (เฟรม g14 การ์ด "โรงแรม") */
export const CONNECTION_SOON: readonly { label: string; icon: string; hint: string }[] = [
  { label: "โรงแรม", icon: "shop", hint: "ยังไม่ได้เปิดใช้งานระบบโรงแรมของ SHARK" },
];

/** รหัสบัญชีของ mapping key (โชว์ท้ายการ์ด "บัญชีที่ใช้ 4000 / 1100") */
const FALLBACK_CODE: Record<string, string> = {
  INCOME_GOODS: "4000",
  AR: "1100",
  INCOME_DEFAULT: "4030",
  INCOME_SERVICE: "4030",
  INVENTORY: "1200",
  GOODS_ISSUE_EXPENSE: "5300",
  SALARY_EXPENSE: "6000", // เงินเดือน (postPayrollJV ใช้ 6000 ตรง ๆ — ไม่มี mapping key)
};

// ─────────────────────────── อ่าน/เขียน link ───────────────────────────

export type LinkConfig = Partial<Record<ToggleKey, boolean>>;

export type ConnectionCard = {
  kind: AccountLinkedKind;
  label: string;
  icon: string;
  hint: string;
  /** "linked" = เชื่อมแล้ว · "unlinked" = มีระบบแต่ยังไม่เชื่อม · "no-system" = ยังไม่มีระบบ */
  status: "linked" | "unlinked" | "no-system";
  statusLabel: string;
  /** AppSystem.id ที่จะเชื่อม (null = ไม่มีระบบให้เชื่อม) */
  linkedId: string | null;
  linkedName: string | null;
  toggles: { key: ToggleKey; label: string; on: boolean }[];
  accountCodes: string[];
  /** "30 ก.ย. 2026 14:20" · "" = ยังไม่เคยลงบัญชี */
  lastPostedText: string;
  /** WO B4 additive — เวลาจริงของการลงบัญชีล่าสุด (REST ส่ง ISO · หน้าจอใช้ lastPostedText) */
  lastPostedAt: Date | null;
  monthCount: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseLinkConfig(raw: unknown): LinkConfig {
  if (!isRecord(raw)) return {};
  const out: LinkConfig = {};
  for (const k of Object.keys(TOGGLE_LABELS) as ToggleKey[]) if (raw[k] === true) out[k] = true;
  return out;
}

/** link ทั้งหมดของสมุดบัญชีเล่มนี้ (รวมที่ถูกตัดการเชื่อม — หน้าจอต้องเห็นเพื่อเชื่อมกลับ) */
export async function listLinks(ctx: Ctx) {
  return dbOf(ctx).accountSystemLink.findMany({
    where: { archivedAt: null },
    select: { id: true, linkedKind: true, linkedId: true, config: true, enabled: true, updatedAt: true },
  });
}

/** `linkedId` ของ kind นี้ที่เชื่อมอยู่ตอนนี้ (รวมที่ตัดการเชื่อมแล้ว) — REST `PATCH`/`DELETE /links/{kind}`
 *  ไม่มี linkedId ในเส้นทาง (ตัดสินใจจาก kind เดียว) ⇒ ต้องคลี่ก่อนส่งต่อให้ `disconnect`/`setLinkOptions` */
export async function linkedIdOfKind(ctx: Ctx, kind: AccountLinkedKind): Promise<string | null> {
  const row = await dbOf(ctx).accountSystemLink.findFirst({ where: { linkedKind: kind }, select: { linkedId: true } });
  return row?.linkedId ?? null;
}

/**
 * REST WO D4: `connect()` เดิมไม่ตรวจว่า `linkedId` เป็นระบบ/สาขาจริงของร้านนี้ เพราะฝั่งหน้าจอส่ง id
 * ที่เลือกจาก dropdown ของร้านเองมาเสมอ (เชื่อถือได้อยู่แล้ว) — ผู้เรียก REST พิมพ์ id เองได้ ⇒ ต้องยืนยัน
 * ก่อนว่า id นั้นตรงชนิดระบบของการ์ด `kind` และเป็นของ tenant นี้จริง (กัน id ปลอม/ข้ามร้าน)
 */
export async function isValidLinkTarget(ctx: Ctx, kind: AccountLinkedKind, linkedId: string): Promise<boolean> {
  if (!linkedId) return false;
  const item = CONNECTION_CATALOG.find((c) => c.kind === kind);
  if (!item) return false;
  const db = dbOf(ctx);
  if (item.systemType) {
    const s = await db.appSystem.findFirst({ where: { id: linkedId, type: item.systemType, active: true }, select: { id: true } });
    return !!s;
  }
  if (kind === "BUSINESS") {
    const u = await db.businessUnit.findFirst({ where: { id: linkedId, type: "BOOKING", status: "ACTIVE" }, select: { id: true } });
    return !!u;
  }
  return false;
}

/** เชื่อม/เชื่อมกลับ — สร้างแถวถ้ายังไม่มี · มีแล้วตั้ง enabled=true (ตัวเลือกเดิมกลับมาครบ) */
// POS P1.18 ▸ F7: connect/disconnect รับ tx ของผู้เรียกได้ (เปิด/ปิดทุกแถวที่ผูก POS เดียวใน transaction เดียว · ผู้เรียก = account facade
//   setPosLinkEnabled) — tx ดิบไม่มีตัวกรองของ tenantDb ⇒ ใส่ tenantId + systemId ของ ctx ลง where/data เอง · ไม่ส่ง tx = เหมือนเดิมทุกอย่าง ◂
const linkDbOf = (ctx: Ctx, tx?: Prisma.TransactionClient): Db => (tx ? (tx as unknown as Db) : dbOf(ctx));
const ownScope = (ctx: Ctx, tx?: Prisma.TransactionClient) => (tx ? { tenantId: ctx.tenantId, systemId: ctx.systemId } : {});
// ◂ POS P1.18

export async function connect(
  ctx: Ctx,
  kind: AccountLinkedKind,
  linkedId: string,
  actorUserId: string | null,
  tx?: Prisma.TransactionClient, // POS P1.18 ▸ F7 ◂
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!linkedId) return { ok: false, reason: "ยังไม่มีระบบนี้ในร้าน — เปิดระบบก่อนแล้วค่อยกลับมาเชื่อม" };
  const db = linkDbOf(ctx, tx);
  const existing = await db.accountSystemLink.findFirst({ where: { ...ownScope(ctx, tx), linkedKind: kind, linkedId } });
  if (existing) {
    await db.accountSystemLink.update({
      where: { id: existing.id },
      data: { enabled: true, archivedAt: null, updatedById: actorUserId },
    });
    return { ok: true };
  }
  // tenantId/systemId ถูก inject โดย tenantDb (แกน system) — TS ยังไม่รู้ ⇒ cast ตามแพตเทิร์นเดียวกับ policy.ts
  await db.accountSystemLink.create({
    data: { ...ownScope(ctx, tx), linkedKind: kind, linkedId, enabled: true, updatedById: actorUserId, config: {} } as Prisma.AccountSystemLinkCreateInput,
  });
  return { ok: true };
}

/** ตัดการเชื่อม — ไม่ลบแถว (ตัวเลือก/บัญชีที่ผูกยังอยู่) แค่หยุดลงบัญชี */
export async function disconnect(
  ctx: Ctx,
  kind: AccountLinkedKind,
  linkedId: string,
  actorUserId: string | null,
  tx?: Prisma.TransactionClient, // POS P1.18 ▸ F7 ◂
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = linkDbOf(ctx, tx);
  const n = await db.accountSystemLink.updateMany({
    where: { ...ownScope(ctx, tx), linkedKind: kind, linkedId },
    data: { enabled: false, updatedById: actorUserId },
  });
  if (n.count === 0) return { ok: false, reason: "ยังไม่ได้เชื่อมระบบนี้อยู่แล้ว" };
  return { ok: true };
}

/** เปลี่ยนตัวเลือกของการ์ด (สร้างผู้ติดต่ออัตโนมัติ / ซิงก์ราคา / ลงบัญชีอัตโนมัติ / รับบิลจากแชท) */
export async function setLinkOptions(
  ctx: Ctx,
  kind: AccountLinkedKind,
  linkedId: string,
  options: LinkConfig,
  actorUserId: string | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = dbOf(ctx);
  const existing = await db.accountSystemLink.findFirst({ where: { linkedKind: kind, linkedId } });
  if (!existing) return { ok: false, reason: "ต้องเชื่อมระบบนี้ก่อนจึงตั้งตัวเลือกได้" };
  const next = { ...parseLinkConfig(existing.config), ...options };
  // เก็บเฉพาะที่เปิด — ค่าปิดไม่ต้องเขียน (JSON เล็ก อ่านง่าย และ `=== true` เป็นนิยามเดียวทั้งระบบ)
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(next)) if (v === true) clean[k] = true;
  await db.accountSystemLink.update({
    where: { id: existing.id },
    data: { config: clean as Prisma.InputJsonValue, updatedById: actorUserId },
  });
  return { ok: true };
}

// ─────────────────────────── "ลงบัญชีล่าสุด · N รายการเดือนนี้" ───────────────────────────

export type LinkActivity = { lastPostedAt: Date | null; monthCount: number };

/**
 * ตัวเลขจริงจากข้อมูล (ไม่ใช่ตัวเลขสมมุติ) — แต่ละระบบทิ้งร่องรอยคนละที่:
 *   POS       → AccountJournalEntry refType "PosSale"
 *   คลังสินค้า → AccountJournalEntry refType "InvMovement"
 *   CRM       → AccountDocument source CRM
 *   แชท       → AccountAttachment source CHAT (บิลที่ดูดเข้ากล่องขาเข้า)
 *   สมาชิก/HR/จอง → ยังไม่มีร่องรอยแยกได้ ⇒ คืน 0 + ข้อความ "ยังไม่มีรายการที่ลงบัญชี" (ห้ามเดา)
 */
export async function linkActivity(ctx: Ctx, kind: AccountLinkedKind, monthStart: Date): Promise<LinkActivity> {
  const db = dbOf(ctx);
  if (kind === "POS" || kind === "INVENTORY") {
    const refType = kind === "POS" ? "PosSale" : "InvMovement";
    const [last, count] = await Promise.all([
      db.accountJournalEntry.findFirst({
        where: { refType, status: "POSTED" },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      db.accountJournalEntry.count({ where: { refType, status: "POSTED", date: { gte: monthStart } } }),
    ]);
    return { lastPostedAt: last?.date ?? null, monthCount: count };
  }
  if (kind === "CRM") {
    const [last, count] = await Promise.all([
      db.accountDocument.findFirst({ where: { source: "CRM" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      db.accountDocument.count({ where: { source: "CRM", createdAt: { gte: monthStart } } }),
    ]);
    return { lastPostedAt: last?.createdAt ?? null, monthCount: count };
  }
  if (kind === "CHAT") {
    const [last, count] = await Promise.all([
      db.accountAttachment.findFirst({ where: { source: "CHAT" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      db.accountAttachment.count({ where: { source: "CHAT", createdAt: { gte: monthStart } } }),
    ]);
    return { lastPostedAt: last?.createdAt ?? null, monthCount: count };
  }
  return { lastPostedAt: null, monthCount: 0 };
}

/** รหัสบัญชีที่การ์ดนี้ใช้ — อ่านจาก mapping จริงของร้าน (ไม่มี = ค่าปริยายของผัง §4.14) */
export async function accountCodesFor(ctx: Ctx, keys: readonly string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await dbOf(ctx).accountMapping.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, account: { select: { code: true } } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.account?.code ?? ""]));
  return keys.map((k) => byKey.get(k) || FALLBACK_CODE[k] || "—");
}

// ─────────────────────────── ประกอบการ์ดทั้งหน้า ───────────────────────────

/**
 * การ์ดทั้งหมดของหน้า §9.5 — ระบบที่ร้านเปิดจริง + สถานะการเชื่อม + ตัวเลือก + ตัวเลขจริง
 * (ระบบที่ร้านยังไม่เปิด → "ยังไม่มีระบบ" · เปิดแล้วแต่ยังไม่ผูก → "ยังไม่เชื่อม" + ปุ่มเชื่อม)
 */
export async function buildConnectionCards(ctx: Ctx, now: Date): Promise<ConnectionCard[]> {
  const db = dbOf(ctx);
  const [systems, links, bookingUnit] = await Promise.all([
    db.appSystem.findMany({ where: { active: true }, select: { id: true, type: true, name: true } }),
    listLinks(ctx),
    // การ์ด "จอง/ทริป" (kind BUSINESS) ผูกกับ `BusinessUnit` ไม่ใช่ `AppSystem`
    // (SHARK ยังไม่มี SystemType BOOKING — แต่มีสาขาชนิด BOOKING อยู่แล้ว ⇒ เชื่อมได้จริงตามเฟรม g14)
    db.businessUnit.findFirst({ where: { type: "BOOKING", status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);
  const monthStart = new Date(
    new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).getFullYear(),
    new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).getMonth(),
    1,
  );
  const sysByType = new Map<string, { id: string; name: string }>();
  for (const s of systems) if (!sysByType.has(s.type)) sysByType.set(s.type, { id: s.id, name: s.name });
  const linkByKind = new Map(links.map((l) => [l.linkedKind as AccountLinkedKind, l]));

  const out: ConnectionCard[] = [];
  for (const item of CONNECTION_CATALOG) {
    const sys = item.systemType
      ? sysByType.get(item.systemType)
      : item.kind === "BUSINESS" && bookingUnit
        ? { id: bookingUnit.id, name: bookingUnit.name }
        : undefined;
    const link = linkByKind.get(item.kind);
    const linked = !!link && link.enabled;
    const status: ConnectionCard["status"] = linked ? "linked" : sys || link ? "unlinked" : "no-system";
    const cfg = parseLinkConfig(link?.config);
    const [activity, accountCodes] = await Promise.all([
      linked ? linkActivity(ctx, item.kind, monthStart) : Promise.resolve({ lastPostedAt: null, monthCount: 0 }),
      linked ? accountCodesFor(ctx, item.accountKeys) : Promise.resolve([]),
    ]);
    out.push({
      kind: item.kind,
      label: item.label,
      icon: item.icon,
      hint: status === "linked" ? item.linkedHint : item.hint,
      status,
      statusLabel: status === "linked" ? "เชื่อมแล้ว" : status === "unlinked" ? "ยังไม่เชื่อม" : "ยังไม่มีระบบ",
      linkedId: sys?.id ?? link?.linkedId ?? null,
      linkedName: sys?.name ?? null,
      toggles: item.toggles.map((t) => ({ key: t, label: TOGGLE_LABELS[t], on: cfg[t] === true })),
      accountCodes,
      lastPostedText: activity.lastPostedAt ? formatPostedAt(activity.lastPostedAt) : "",
      lastPostedAt: activity.lastPostedAt,
      monthCount: activity.monthCount,
    });
  }
  return out;
}

/** "30 ก.ย. 2026 14:20" (เวลาไทย) — ใช้ตัวเดียวกับทั้งโมดูล */
function formatPostedAt(d: Date): string {
  const time = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${formatDateTh(d)} ${time}`;
}

// CRM C5.4-B ▸ hunter H2 (ใช้โดย connections-actions: หมุน/เพิกถอนคีย์) — ดูคำอธิบายที่ตัวเรียก
// CRM C5.5-fix8 r2 ▸ (รีวิว RV-5 + มติผู้คุมงาน Q2) "คีย์ของบัญชี" = ผูกระบบบัญชี **และ** ทุกสิทธิ์อยู่ใน ACCOUNT_SCOPE_KEYS — กติกาเดียวทั้งหมุนและเพิกถอน
//   (เดิมคีย์ไม่ผูกระบบที่ไม่มี crm|member|kanban ก็นับ ⇒ หน้านี้เพิกถอน/หมุนคีย์กลางของร้าน `[]` และคีย์ที่ถือ `pos.*` ได้) ·
//   คีย์ไม่ผูกระบบ (คีย์กลาง) และคีย์ที่ถือสิทธิ์ของระบบอื่น จัดการที่ ตั้งค่า › API สำหรับนักพัฒนา เท่านั้น ·
//   scopesJson เสียของคีย์ที่ผูกบัญชี = ยังนับเป็นของหน้านี้ (เพิกถอนทิ้งได้ · หมุนถูกปฏิเสธด้วยข้อความของ accountKeyRotationProblem) ◂
export async function accountManagedKey(tenantId: string, keyId: string): Promise<boolean> {
  if (!keyId) return false;
  const db = tenantDb({ tenantId });
  const k = await db.apiKey.findFirst({ where: { id: keyId }, select: { systemId: true, scopesJson: true } });
  if (!k || !k.systemId) return false;
  if (!(await db.appSystem.findFirst({ where: { id: k.systemId, type: "ACCOUNT" }, select: { id: true } }))) return false;
  const raw = k.scopesJson;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) return true;
  return (raw as string[]).every((sc) => ACCOUNT_SCOPE_KEYS.includes(sc));
}

// CRM C5.5-fix8 ▸ (รีวิว authz-sweep F3) หมุนคีย์ = ออกคีย์ใหม่ที่คัดลอกสิทธิ์ของคีย์เดิม ⇒ ต้องผ่านกติกาเดียวกับตอนออก (S1 + F2):
//   ทุกสิทธิ์อยู่ใน ACCOUNT_SCOPE_KEYS และคีย์ที่ผูกระบบบัญชีต้องมีสิทธิ์ ≥ 1 รายการ · เดิมคัดลอกทุกอย่าง ⇒ คีย์ผูกบัญชีที่ถือ `crm.*`/`member.*`
//   (ออกก่อน S1) หรือไม่มีสิทธิ์เลย ("คีย์รุ่นเดิม" จากฟอร์มที่ยิงเอง) ต่ออายุได้ไม่รู้จบ · ไม่ผ่าน = ปฏิเสธพร้อมบอกให้สร้างคีย์ใหม่
//   (ไม่ตัดสิทธิ์ทิ้งเงียบ ๆ — ระบบปลายทางจะพังโดยไม่รู้ตัว) · r2: คีย์ไม่ผูกระบบ (คีย์กลาง) ไม่ถึงที่นี่แล้ว — accountManagedKey ตอบ "ไม่พบ"
//   scopesJson เสีย = ข้อความเดียวกับ hotfix/apiv1-scope (`rotateApiKey` ตรวจเงื่อนไขเดียวกันใน tx) ◂
export const ROTATE_MALFORMED = "ข้อมูลสิทธิ์ของคีย์นี้ในระบบไม่สมบูรณ์ จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน";
export async function accountKeyRotationProblem(tenantId: string, keyId: string): Promise<string | null> {
  const k = await tenantDb({ tenantId }).apiKey.findFirst({ where: { id: keyId }, select: { systemId: true, scopesJson: true } });
  if (!k) return null; // "ไม่พบ" เป็นหน้าที่ของ accountManagedKey / rotateApiKey
  const raw = k.scopesJson;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) return ROTATE_MALFORMED;
  const scopes = raw as string[];
  const foreign = scopes.find((sc) => !ACCOUNT_SCOPE_KEYS.includes(sc));
  if (foreign !== undefined) {
    return `คีย์นี้มีสิทธิ์ "${foreign}" ซึ่งไม่ใช่สิทธิ์ของระบบบัญชี จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน (สิทธิ์ของระบบอื่นออกที่หน้าตั้งค่า API ของระบบนั้น)`;
  }
  if (scopes.length === 0 && k.systemId) return "คีย์นี้ไม่มีสิทธิ์ของระบบบัญชีเลย จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน (เลือกสิทธิ์อย่างน้อย 1 รายการ)";
  return null;
}
