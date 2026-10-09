// channel.ts — ช่องทางขาย (SalesChannel) ต่อสาขา · POS P2.1 (R1–R3 · มติผู้คุมงาน 2 4 5 6 11 · CD1 CD7)
// สัญญา = scripts/qc-pos-p2.1.mts (C1–C7 · E1) · โน้ต ledger/wo-notes/pos-P2.1.md
//
// 🔴 ผู้เขียนเดียวของตาราง SalesChannel (service.ts อ่านผ่าน resolveSaleChannel เท่านั้น) · ไม่ใช่ไฟล์ "use server" (action = channel-actions.ts)
// 🔴 ทุกฟังก์ชันที่รับ (ctx, actor) "คืน" คำปฏิเสธ {ok:false, code, message ไทย} ไม่ throw
//    ขอบเขตผิด (ร้าน/ระบบ POS/สาขา) = NOT_FOUND · id ของร้านอื่น/สาขาอื่น/มั่ว = CHANNEL_NOT_FOUND (404 ไม่ใช่ 403 · มติ 6)
// 🔴 builtins (STORE QR_TABLE WEB CHAT) สร้างแบบขี้เกียจ + ปลอดการแข่ง: createMany({skipDuplicates}) = ON CONFLICT DO NOTHING
//    ⇒ ไม่มี P2002 แม้สองคำขอพร้อมกัน · ปลอดภัยใน tx ของผู้เรียก (createSale)
// 🔴 ค่าคอมฯ ถูกสำเนาลงบิลตอนขาย — แก้ค่าที่นี่ไม่แตะบิลเก่า · ไม่มี outbox (R12) · การเปลี่ยนแปลง = AuditLog pos.channel.*
import type { Prisma, PrismaClient, SalesChannel } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import {
  CHANNEL_BUILTIN_CODES,
  CHANNEL_BUILTIN_NAMES,
  CHANNEL_LIMIT_PER_UNIT,
  channelFallbackName,
  defaultChannelCode,
  isChannelBuiltinCode,
  isChannelExternalPreset,
  parseChannelInput,
  type ArchiveChannelResult,
  type ChannelItem,
  type ChannelRefusal,
  type ChannelRefusalCode,
  type ListChannelsResult,
  type SaveChannelResult,
} from "./channel-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Db = PrismaClient | Prisma.TransactionClient;

const MSG: Record<ChannelRefusalCode, string> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้เข้าสาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าช่องทางขาย — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลช่องทางไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  CHANNEL_NOT_FOUND: "ไม่พบช่องทางขายนี้ในสาขานี้",
  CHANNEL_CODE_TAKEN: "รหัสช่องทางนี้มีอยู่แล้วในสาขานี้",
  CHANNEL_BUILTIN_LOCKED: "ช่องทางพื้นฐานแก้ส่วนนี้ไม่ได้ (หน้าร้านล็อกค่าคอมฯ วิธีรับเงิน และการปิด · รหัสช่องทางพื้นฐานเปลี่ยนไม่ได้)",
  CHANNEL_LIMIT: `สาขานี้มีช่องทางขายครบ ${CHANNEL_LIMIT_PER_UNIT} ช่องทางแล้ว (นับรวมที่เก็บแล้ว)`,
  INTERNAL: "ระบบช่องทางขายขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: ChannelRefusalCode, message?: string, field?: string): ChannelRefusal =>
  field ? { ok: false, code, message: message ?? MSG[code], field } : { ok: false, code, message: message ?? MSG[code] };
const isRefusal = (v: unknown): v is ChannelRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isUniqueViolation = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return o?.code === "P2002" || /\b23505\b|Unique constraint/i.test(String(o?.message ?? ""));
};

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | ChannelRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/channel] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต + สิทธิ์ ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor };
type Need = "read" | "manage";

/**
 * ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้ของร้านนี้ / สาขาไม่ผูกระบบนี้ / สาขาเก็บถาวร / เข้าสาขาไม่ได้ = NOT_FOUND ·
 * อ่าน = pos.sale.read หรือ pos.sale.create ที่สาขา · เขียน = pos.channel.manage ที่สาขา (ไม่มี = PERMISSION_DENIED)
 */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown, need: Need): Promise<Scope | ChannelRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, link, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } }, select: { systemId: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !link || link.systemId !== systemId || !unit) return refuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
  const ok =
    need === "manage"
      ? evaluate(actor, { module: "pos", action: "pos.channel.manage", unitId })
      : evaluate(actor, { module: "pos", action: "pos.sale.read", unitId }) || evaluate(actor, { module: "pos", action: "pos.sale.create", unitId });
  if (!ok) return refuse("PERMISSION_DENIED", need === "manage" ? MSG.PERMISSION_DENIED : "บัญชีนี้ยังไม่มีสิทธิ์ดูช่องทางขาย — ขอสิทธิ์จากเจ้าของร้าน");
  return { tenantId, systemId, unitId, actor };
}

// ═══════════ แถว → มุมมอง ═══════════
const BUILTIN_RANK: Record<string, number> = Object.fromEntries(CHANNEL_BUILTIN_CODES.map((c, i) => [c, i]));
/** คีย์ตายตัว 12 ตัว (สัญญา P2.1U · ข้อสอบ C1) */
export function channelItem(r: SalesChannel): ChannelItem {
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    name: r.name,
    adapter: r.adapter,
    active: r.active,
    payout: r.payout,
    commissionBp: r.commissionBp,
    commissionFixedSatang: r.commissionFixedSatang,
    commissionVatBp: r.commissionVatBp,
    sortOrder: r.sortOrder,
    archived: r.archivedAt !== null,
  };
}
/** builtins ตามลำดับคงที่ก่อน แล้ว sortOrder → createdAt → code */
function byDisplayOrder(a: SalesChannel, b: SalesChannel): number {
  const ka = a.kind === "BUILTIN" ? 0 : 1;
  const kb = b.kind === "BUILTIN" ? 0 : 1;
  if (ka !== kb) return ka - kb;
  if (ka === 0) return (BUILTIN_RANK[a.code] ?? 99) - (BUILTIN_RANK[b.code] ?? 99);
  return a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code);
}

// ═══════════ builtins แบบขี้เกียจ (R2) ═══════════
/**
 * ให้สาขามี 4 ช่องทางพื้นฐานครบ แล้วคืนทุกแถวของสาขา (รวมที่เก็บแล้ว) — อ่านก่อน · ขาดตัวไหน createMany({skipDuplicates}) ทั้งชุดแล้วอ่านซ้ำ ·
 * ON CONFLICT DO NOTHING ⇒ สองคำขอแรกพร้อมกันได้ 4 แถวพอดี ไม่มี P2002 (ใช้ได้ใน tx ของผู้เรียก — createSale)
 * 🔴 ผู้เรียกตรวจขอบเขต (ร้าน/ระบบ/สาขา) มาแล้ว
 */
export async function ensureUnitChannels(db: Db, scope: { tenantId: string; systemId: string; unitId: string }): Promise<SalesChannel[]> {
  const read = () => db.salesChannel.findMany({ where: { tenantId: scope.tenantId, unitId: scope.unitId } });
  const rows = await read();
  const have = new Set(rows.filter((r) => r.kind === "BUILTIN").map((r) => r.code));
  if (CHANNEL_BUILTIN_CODES.every((c) => have.has(c))) return rows;
  const data: Prisma.SalesChannelCreateManyInput[] = CHANNEL_BUILTIN_CODES.map((code, i) => ({
      tenantId: scope.tenantId,
      systemId: scope.systemId,
      unitId: scope.unitId,
      code,
      kind: "BUILTIN" as const,
      name: CHANNEL_BUILTIN_NAMES[code],
      adapter: code === "WEB" ? ("WEB" as const) : code === "CHAT" ? ("CHAT" as const) : ("NONE" as const),
      active: true,
      sortOrder: i,
      payout: "DIRECT" as const,
    }));
  await db.salesChannel.createMany({ data, skipDuplicates: true });
  return read();
}

/** ช่องทางของสาขานี้ตาม id (ร้าน + สาขา) — อื่น = null (CHANNEL_NOT_FOUND) */
async function channelInScope(db: Db, s: { tenantId: string; unitId: string }, id: unknown): Promise<SalesChannel | null> {
  if (!isId(id)) return null;
  return db.salesChannel.findFirst({ where: { id, tenantId: s.tenantId, unitId: s.unitId } });
}

// ═══════════ ช่องทางของบิล (createSale · register quote) ═══════════
export type SaleChannelResolution =
  | { ok: true; channel: SalesChannel }
  | { ok: false; code: "CHANNEL_INVALID"; message: string };
/**
 * ช่องทางของบิล (R4): ส่ง channelId ⇒ ต้องเป็นของร้าน + สาขานี้ · ไม่เก็บ · เปิดใช้งาน ไม่งั้น CHANNEL_INVALID ·
 * ไม่ส่ง ⇒ defaultChannelCode(sourceModule) ของสาขา (สร้าง builtins ถ้ายังไม่มี) — ไม่ดู active (ผู้เรียกเดิมต้องขายได้เหมือนเดิม) ·
 * บิลขายบัตรกำนัล (giftCard) = STORE เสมอ (มติ 13) ไม่ว่าส่งอะไรมา
 * 🔴 ผู้เรียกตรวจขอบเขตแล้ว · ใช้ใน tx ของบิลได้ (ไม่ throw P2002)
 */
export async function resolveSaleChannel(
  db: Db,
  scope: { tenantId: string; systemId: string; unitId: string },
  opts: { channelId?: string | null; sourceModule?: string | null; giftCard?: boolean },
): Promise<SaleChannelResolution> {
  const invalid = { ok: false as const, code: "CHANNEL_INVALID" as const, message: "ช่องทางขายนี้ใช้ไม่ได้ (ไม่พบ ปิดอยู่ เก็บแล้ว หรือเป็นของสาขาอื่น) — ยังไม่ได้บันทึกบิล" };
  if (!opts.giftCard && opts.channelId !== undefined && opts.channelId !== null) {
    const row = await channelInScope(db, scope, opts.channelId);
    if (!row || row.archivedAt || !row.active) return invalid;
    return { ok: true, channel: row };
  }
  const code = opts.giftCard ? "STORE" : defaultChannelCode(opts.sourceModule);
  const rows = await ensureUnitChannels(db, scope);
  const row = rows.find((r) => r.code === code && r.kind === "BUILTIN");
  return row ? { ok: true, channel: row } : invalid;
}

// ═══════════ API ═══════════

/** รายการช่องทางของสาขา (สร้าง builtins ครั้งแรก) · includeArchived = แสดงที่เก็บแล้วด้วย (archived:true) */
export async function listChannels(ctx: RegisterCtx, actor: RegisterActor, input?: { includeArchived?: boolean }, client?: Db): Promise<ListChannelsResult> {
  return guard("listChannels", async (): Promise<ListChannelsResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "read");
    if (isRefusal(s)) return s;
    const inp = input ?? {};
    if (!isRecord(inp) || Object.keys(inp).some((k) => k !== "includeArchived") || (inp.includeArchived !== undefined && typeof inp.includeArchived !== "boolean")) return refuse("VALIDATION");
    const rows = await ensureUnitChannels(db, s);
    const items = rows.filter((r) => inp.includeArchived === true || r.archivedAt === null).sort(byDisplayOrder).map(channelItem);
    return { ok: true, items };
  });
}

/** ฟิลด์ที่ STORE ล็อก (มติ 4) · builtin อื่นล็อก code/kind/payout + เก็บไม่ได้ */
const STORE_LOCKED = ["payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "adapter"] as const;

/** สร้าง (ไม่มี id · ต้องมี code) หรือแก้ (มี id) ช่องทาง — ต้องมี pos.channel.manage ที่สาขา */
export async function saveChannel(ctx: RegisterCtx, actor: RegisterActor, input: unknown, client?: Db): Promise<SaveChannelResult> {
  return guard("saveChannel", async (): Promise<SaveChannelResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "manage");
    if (isRefusal(s)) return s;
    const parsed = parseChannelInput(input);
    if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.field);
    const v = parsed.value;

    // ── แก้ ──
    if (v.id !== undefined) {
      const row = await channelInScope(db, s, v.id);
      if (!row) return refuse("CHANNEL_NOT_FOUND");
      if (v.code !== undefined && v.code !== row.code) {
        // รหัสช่องทางพื้นฐานเปลี่ยนไม่ได้ (มติ 4) · ช่องทางอื่นก็ไม่เปลี่ยนรหัส — บิลเก่าสำเนารหัสไว้ (รายงานจัดกลุ่มตาม channelCode)
        return row.kind === "BUILTIN" ? refuse("CHANNEL_BUILTIN_LOCKED") : refuse("VALIDATION", "เปลี่ยนรหัสช่องทางหลังสร้างไม่ได้ — สร้างช่องทางใหม่แทน", "code");
      }
      if (row.kind === "BUILTIN") {
        const changed = (k: (typeof STORE_LOCKED)[number]) => v[k] !== undefined && v[k] !== row[k];
        if (row.code === "STORE" && (STORE_LOCKED.some(changed) || v.active === false)) return refuse("CHANNEL_BUILTIN_LOCKED");
        if (changed("payout")) return refuse("CHANNEL_BUILTIN_LOCKED");
      }
      const data: Prisma.SalesChannelUpdateManyMutationInput = { name: v.name };
      if (v.active !== undefined) data.active = v.active;
      if (v.payout !== undefined) data.payout = v.payout;
      if (v.commissionBp !== undefined) data.commissionBp = v.commissionBp;
      if (v.commissionFixedSatang !== undefined) data.commissionFixedSatang = v.commissionFixedSatang;
      if (v.commissionVatBp !== undefined) data.commissionVatBp = v.commissionVatBp;
      if (v.sortOrder !== undefined) data.sortOrder = v.sortOrder;
      if (v.adapter !== undefined) data.adapter = v.adapter;
      const n = await db.salesChannel.updateMany({ where: { id: row.id, tenantId: s.tenantId, unitId: s.unitId }, data });
      if (n.count !== 1) return refuse("CHANNEL_NOT_FOUND");
      const after = await db.salesChannel.findUniqueOrThrow({ where: { id: row.id } });
      await writeAudit({
        tenantId: s.tenantId,
        actorId: s.actor.userId,
        action: "pos.channel.updated",
        targetType: "SalesChannel",
        targetId: row.id,
        before: { channelId: row.id, ...channelItem(row) },
        after: { channelId: row.id, ...channelItem(after) },
      });
      return { ok: true, channel: channelItem(after) };
    }

    // ── สร้าง ──
    if (v.code === undefined) return refuse("VALIDATION", "ช่องทางใหม่ต้องมีรหัสช่องทาง", "code");
    const code = v.code;
    if (isChannelBuiltinCode(code)) return refuse("CHANNEL_CODE_TAKEN"); // builtins มีเสมอหลัง ensureUnitChannels (มติ 2)
    const preset = isChannelExternalPreset(code);
    const created = await runTx(db, async (tx): Promise<SalesChannel | ChannelRefusal> => {
      // ล็อกต่อสาขา — นับเพดาน + สร้างเป็นก้อนเดียว (สองคำขอพร้อมกันไม่เกิน 30)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos-channel:${s.unitId}`}))`;
      const rows = await ensureUnitChannels(tx, s);
      if (rows.some((r) => r.code === code)) return refuse("CHANNEL_CODE_TAKEN");
      if (rows.length >= CHANNEL_LIMIT_PER_UNIT) return refuse("CHANNEL_LIMIT");
      const nextSort = rows.filter((r) => r.kind !== "BUILTIN").reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);
      return tx.salesChannel.create({
        data: {
          tenantId: s.tenantId,
          systemId: s.systemId,
          unitId: s.unitId,
          code,
          kind: preset ? "EXTERNAL" : "CUSTOM",
          name: v.name,
          adapter: v.adapter ?? (preset ? "MANUAL" : "NONE"),
          active: v.active ?? true,
          sortOrder: v.sortOrder ?? Math.min(nextSort, 9_999),
          payout: v.payout ?? (preset ? "PLATFORM" : "DIRECT"),
          commissionBp: v.commissionBp ?? 0,
          commissionFixedSatang: v.commissionFixedSatang ?? 0,
          commissionVatBp: v.commissionVatBp ?? 0,
        },
      });
    }).catch((e: unknown) => {
      if (isUniqueViolation(e)) return refuse("CHANNEL_CODE_TAKEN");
      throw e;
    });
    if (isRefusal(created)) return created;
    await writeAudit({
      tenantId: s.tenantId,
      actorId: s.actor.userId,
      action: "pos.channel.created",
      targetType: "SalesChannel",
      targetId: created.id,
      after: { channelId: created.id, ...channelItem(created) },
    });
    return { ok: true, channel: channelItem(created) };
  });
}

/** เก็บช่องทาง (soft · archivedAt) — ช่องทางพื้นฐานเก็บไม่ได้ · เก็บซ้ำ = ok ไม่มี audit ใหม่ · บิลเก่ายังอ้าง id เดิม */
export async function archiveChannel(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }, client?: Db): Promise<ArchiveChannelResult> {
  return guard("archiveChannel", async (): Promise<ArchiveChannelResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || Object.keys(input).some((k) => k !== "id")) return refuse("VALIDATION");
    const row = await channelInScope(db, s, input.id);
    if (!row) return refuse("CHANNEL_NOT_FOUND");
    if (row.kind === "BUILTIN") return refuse("CHANNEL_BUILTIN_LOCKED");
    if (row.archivedAt) return { ok: true, channel: channelItem(row) };
    const n = await db.salesChannel.updateMany({ where: { id: row.id, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, data: { archivedAt: new Date() } });
    const after = await db.salesChannel.findUniqueOrThrow({ where: { id: row.id } });
    if (n.count === 1)
      await writeAudit({
        tenantId: s.tenantId,
        actorId: s.actor.userId,
        action: "pos.channel.archived",
        targetType: "SalesChannel",
        targetId: row.id,
        before: { channelId: row.id, code: row.code, archived: false },
        after: { channelId: row.id, code: row.code, archived: true },
      });
    return { ok: true, channel: channelItem(after) };
  });
}

/** ชื่อช่องทางของบิล (สะพานบัญชี: ผู้ติดต่อ + memo · ตัวอ่าน) — แถวถูกลบ/บิลเดิม = ชื่อสำรองจากรหัส (ไม่ throw) */
export async function saleChannelName(db: Db, tenantId: string, channelId: string | null | undefined, code: string | null | undefined): Promise<string> {
  if (channelId) {
    const r = await db.salesChannel.findFirst({ where: { id: channelId, tenantId }, select: { name: true } });
    if (r) return r.name;
  }
  return code ? channelFallbackName(code) : "";
}

/** ธุรกรรม — client ที่เป็น tx อยู่แล้ว = ทำในtx นั้นเลย */
function runTx<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return "$transaction" in db ? (db as PrismaClient).$transaction((tx) => fn(tx), { timeout: 20_000, maxWait: 10_000 }) : fn(db);
}
