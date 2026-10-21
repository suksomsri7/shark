// offline-sync.ts — facade ของการขายออฟไลน์ฝั่งเซิร์ฟเวอร์ (POS P3.4 S · C-13 v2 · บรีฟ pos-brief-P3.4.md R1–R10 · §10 มติ 1–15 · CD-P34a)
// POS P3.4 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//
// ทางเข้า: issueOfflineSnapshot (ราคา/สินค้าที่เครื่องพกไปขายออฟไลน์ + หลักฐานราคา PosOfflineSnapshot) ·
//   syncOfflineSales (route ของ session `src/app/api/pos/sync/route.ts` + REST op `sync.sales`) ·
//   คิวผู้จัดการ listOfflineRejected / acceptOfflineSale / discardOfflineSale (pos.shift.manage)
//
// 🔴 ความปลอดภัย (เลนเงิน + กันโกง): บิลออฟไลน์ = สิ่งที่เครื่อง "อ้าง" (ราคา · เวลา · ผู้ขาย) ⇒ ทุกข้อด้านล่างคือด่านกันโกง
//    - บันทึกก่อนตัดสิน (PosOfflineSale · unique (tenantId, idempotencyKey)) · payload ไม่เปลี่ยน · ไม่เก็บโทเคนดิบ/PIN/4 หลักท้าย (CD-9 · R13)
//    - R6: ราคา ณ soldAt (กติกาโปรตามเวลา) หรือราคาใน snapshot ของ "เครื่องนี้" ที่ยังเก็บอยู่ (hash ของเครื่องอื่น/ที่ถูกตัดทิ้ง = SNAPSHOT_UNKNOWN) · อื่น = PRICE_MISMATCH
//    - R7: soldAt ≤ now + 2 นาที · ≥ snapshot.issuedAt · ≥ now − 24 ชม. · ≥ เปิดกะ − 5 นาที (กะที่บันทึก) — นอกกรอบ = CLOCK_INVALID
//    - R8: กะที่บันทึกต้องยัง OPEN (ปิดแล้ว = SHIFT_CLOSED → ผู้จัดการรับเป็นนอกกะ) · เครื่องถูกเพิกถอน: revokedAt ≤ soldAt = DEVICE_REVOKED (CD-12) ·
//          โทเคนตรวจ ณ soldAt (หมดอายุ/PIN ใหม่/ถอดสิทธิ์ = STAFF_TOKEN_INVALID) · ผู้ขายที่อ้างต้องเป็นคนในโทเคน หรือผู้ใช้ที่ซิงก์ (SELLER_MISMATCH · CD-3)
//    - เลข OFF: รหัสต้องเป็นของเครื่องนี้ · เลขที่มีรายการคีย์อื่นใช้แล้ว = OFFLINE_REF_TAKEN · unique (unitId, offlineRef) ของบิลเป็นด่านสุดท้าย
//    - ทุกบิลผ่าน submitRegisterSale (ไม่เรียก createSale ตรง) ⇒ สต็อก/สูตร/VAT/เลขใบเสร็จ/บัญชี/outbox ทางเดียวกับหน้าขาย · ไม่มี outbox event ใหม่ (R9)
// 🔴 คืนคำปฏิเสธเป็นข้อมูล {ok:false, code, message} — ปฏิเสธทั้งชุด = ไม่เขียนอะไรเลย · ผลรายรายการ = OK | DUPLICATE | REJECTED

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { isPosDeviceCode } from "./device";
import { posPaymentSettings } from "./payment-settings";
import {
  REG_KEY_PREFIX,
  registerCatalog,
  registerOfflineCtx,
  registerProductOptions,
  registerProductsByIds,
  registerScopeCheck,
  registerVatConfig,
  submitRegisterSale,
  type RegisterOfflineDrift,
  type RegisterOfflineSubmit,
} from "./register";
import { parseShiftSettings } from "./shift";
import { posMemberActor, staffActorFromToken } from "./staff-pin";
import {
  OFFLINE_CLOCK_SKEW_MS,
  OFFLINE_ITEM_KEYS,
  OFFLINE_MAX_AGE_MS,
  OFFLINE_PRICE_GRACE_MS,
  OFFLINE_SHIFT_SLACK_MS,
  OFFLINE_SYNC_BATCH_MAX,
  offlineBatches,
  offlineSaleRefusal,
  parseOfflineRef,
  posOfflineEnabled,
  type OfflineSnapshot,
  type OfflineSnapshotChoice,
  type OfflineSnapshotProduct,
  type OfflineSyncResult,
} from "./offline-shared";
import type { RegisterActor, RegisterCtx, RegisterProduct, RegisterSubmitInput } from "./register-shared";

type Db = PrismaClient;
type Refusal = { ok: false; code: string; message: string };
/** ctx ของ facade — deviceId = รหัสเครื่องของ session (route) · REST: apiKeyId ที่เซิร์ฟเวอร์ประกอบเอง (ไม่มาจาก body) */
export type OfflineCtx = { tenantId: string; systemId: string; unitId: string; deviceId?: string; apiKeyId?: string };
export type OfflineSnapshotResult = { ok: true; snapshot: OfflineSnapshot } | Refusal;
export type OfflineSyncItem = {
  offlineRef: string;
  idempotencyKey: string;
  soldAt: string;
  shiftId?: string;
  staffToken?: string;
  sellerUserId?: string;
  snapshotHash: string;
  sale: Omit<RegisterSubmitInput, "idempotencyKey" | "staffToken">;
};
export type OfflineSyncInput = { deviceId: string; items: OfflineSyncItem[] };
export type OfflineSyncBatchResult = { ok: true; results: OfflineSyncResult[] } | Refusal;
export type OfflineRejectedItem = {
  id: string;
  offlineRef: string;
  deviceId: string;
  soldAt: string;
  reason: string | null;
  status: string;
  createdAt: string;
  expectedGrandTotalSatang: number | null;
  /** POS P3.4 ▸ fix1 N1: ผู้ขายที่เครื่อง "อ้าง" (sellerUserId / u ในโทเคนที่ยังไม่ตรวจ) — แสดงเท่านั้น ไม่ให้สิทธิ์ใด ๆ ◂ */
  claimedSellerUserId: string | null;
  /** POS P3.4 ▸ fix1 N1: ผู้ขายที่ตรวจแล้ว = คนในโทเคนที่ผ่าน ณ soldAt ตอนซิงก์ครั้งแรก ไม่งั้นผู้ใช้ที่ซิงก์ — ผู้จัดการรับบิลด้วยสิทธิ์/เพดานของคนนี้ ◂ */
  verifiedSellerUserId: string | null;
};
export type OfflineRejectedResult = { ok: true; items: OfflineRejectedItem[] } | Refusal;
export type OfflineAcceptResult = { ok: true; saleId: string; receiptNo: string | null; duplicated?: boolean } | Refusal;
export type OfflineDiscardResult = { ok: true; duplicated?: boolean } | Refusal;

// ═══════════════════ ค่าคงที่ ═══════════════════
const STATUS = { SYNCED: "SYNCED", REJECTED: "REJECTED", ACCEPTED: "ACCEPTED_BY_MANAGER", DISCARDED: "DISCARDED" } as const;
/** สถานะชั่วคราวระหว่างตัดสิน (แถวบันทึกก่อนตัดสิน) — ส่งซ้ำ = ตัดสินใหม่ (บิลกันซ้ำด้วยคีย์) · ทิ้ง/รับไม่ได้ภายใน 5 นาที */
const PROCESSING = "PROCESSING";
const PROCESSING_GUARD_MS = 5 * 60_000;
const AUDIT_SYNCED = "pos.sale.offline_synced";
const AUDIT_DISCARDED = "pos.sale.offline_discarded";
const SNAPSHOT_KEEP = 2;
const SNAPSHOT_KEEP_RECENT_MAX = 200; // POS P3.4 ▸ fix1 N4 ◂
const SNAPSHOT_MIN_INTERVAL_MS = 60_000; // POS P3.4 ▸ fix2 N8 ◂
const SNAPSHOT_PAGE = 500;
const SNAPSHOT_MAX_PAGES = 40;
const DISCARD_REASON_MIN = 5;
const DISCARD_REASON_MAX = 500;
const LIST_MAX = 200;
/** สินค้าใน snapshot = คีย์ของ RegisterProduct ที่จอใช้ + ตัวเลือก (SEC1: ไม่มีต้นทุน/กำไร/สต็อกจริง/ข้อมูลสมาชิก · stockLeft = ป้ายบนไทล์เท่านั้น CD-5) */
const PRODUCT_KEYS = [
  "id", "invItemId", "name", "nameEn", "kind", "categoryId", "priceSatang", "sku", "barcode", "imageUrl", "optionGroupCount", "requiredOptionGroupCount",
  "parentId", "variantCount", "soldByWeight", "soldOut", "soldOutReason", "soldOutMark", "stockLeft", "trackStock", "trackStockMode", "listPriceSatang",
  "priceSource", "priceRule", "notSold",
] as const;
/** คำปฏิเสธของหน้าขาย → เหตุผลของรายการออฟไลน์ (R6: ราคาไม่ตรง ณ soldAt และไม่ตรง snapshot = PRICE_MISMATCH) */
const REASON_OF: Readonly<Record<string, string>> = { PRICE_CHANGED: "PRICE_MISMATCH" };
/** คำปฏิเสธชั่วคราว — หยุดทั้งชุด (เครื่องส่งใหม่ด้วยคีย์เดิม · ไม่พักรายการ) */
const TRANSIENT = new Set(["BUSY", "INTERNAL", "UNKNOWN"]);

/** รูปเลข OFF ที่ซิงก์รับ (เทียบ createSale.offline ใน service.ts) */
const OFFLINE_REF_LOOSE = /^OFF-([A-Z0-9]{1,8})-([0-9]{4,8})$/;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown, max: number, min = 1): v is string => typeof v === "string" && v.length >= min && v.length <= max;
const isIdemKey = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
const refuse = (code: string, message: string): Refusal => ({ ok: false, code, message });
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");
/** JSON แบบเรียงคีย์ (hash ของรายการ/snapshot ไม่ขึ้นกับลำดับคีย์) */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const SECRET_KEYS = new Set(["pin", "managerPin", "managerUserId", "phoneLast4", "staffToken", "token", "secret", "password"]);
/** ผู้ใช้ที่โทเคนอ้าง (ยังไม่ตรวจลายเซ็น — เก็บเป็น "คำอ้าง" ไว้ให้ผู้จัดการรับบิลทีหลัง · ไม่เก็บตัวโทเคน · CD-9) */
function tokenClaimUser(token: string | null): string | null {
  if (!token) return null;
  try {
    const p: unknown = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    return isRecord(p) && typeof p.u === "string" && p.u.length <= 64 ? p.u : null;
  } catch {
    return null;
  }
}
/** สำเนาบิลที่เก็บได้ (R13 · CD-9): ตัด PIN / 4 หลักท้าย / โทเคน / PIN ผู้จัดการ ทุกชั้น */
function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets);
  if (!isRecord(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET_KEYS.has(k)) out[k] = stripSecrets(x);
  return out;
}
/** POS P3.4 ▸ fix1 N1: ค่าสตริงแรกที่ไม่ว่าง ◂ */
const strOf = (...xs: unknown[]): string | null => xs.find((x): x is string => typeof x === "string" && !!x) ?? null;
const actorOk = (a: unknown): a is RegisterActor => isRecord(a) && typeof a.userId === "string" && !!a.userId;
const ctxOk = (c: unknown): c is OfflineCtx => isRecord(c) && isStr(c.tenantId, 200) && isStr(c.systemId, 200) && isStr(c.unitId, 200);
const baseCtx = (c: OfflineCtx): RegisterCtx => ({ tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId });
const nowOf = (opts?: { now?: Date }): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date());

type DeviceRow = { id: string; deviceCode: string; status: string; revokedAt: Date | null; offlineCode: string | null; offlineSeq: number };
async function deviceOf(db: Db, c: OfflineCtx, code: string): Promise<DeviceRow | null> {
  if (!isPosDeviceCode(code)) return null;
  return db.posDevice.findFirst({
    where: { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, deviceCode: code },
    select: { id: true, deviceCode: true, status: true, revokedAt: true, offlineCode: true, offlineSeq: true },
  });
}
async function flagOn(db: Db, c: OfflineCtx): Promise<boolean> {
  const sys = await db.appSystem.findFirst({ where: { id: c.systemId, tenantId: c.tenantId, type: "POS" }, select: { settings: true } });
  return posOfflineEnabled(sys?.settings);
}
/** ขอบเขต (ร้าน · ระบบ POS · สาขา · เข้าสาขาได้ · pos.sale.create) — ด่านเดียวกับหน้าขาย */
async function scopeOf(db: Db, c: unknown, actor: unknown): Promise<{ ctx: OfflineCtx; actor: RegisterActor } | Refusal> {
  if (!ctxOk(c) || !actorOk(actor)) return refuse("NOT_FOUND", "ไม่พบสาขานี้");
  const r = await registerScopeCheck(baseCtx(c), actor, db);
  if (!r.ok) return refuse(r.code, r.message);
  return { ctx: { ...c, ...r.ctx }, actor: r.actor };
}
/** ผู้จัดการคิว: ขอบเขตหน้าขาย + pos.shift.manage ที่สาขา */
async function managerScope(db: Db, c: unknown, actor: unknown): Promise<{ ctx: OfflineCtx; actor: RegisterActor } | Refusal> {
  const s = await scopeOf(db, c, actor);
  if ("ok" in s) return s;
  if (!evaluate(s.actor, { module: "pos", action: "pos.shift.manage", unitId: s.ctx.unitId })) return refuse("PERMISSION_DENIED", "ต้องมีสิทธิ์จัดการกะ (ผู้จัดการ) จึงจัดการบิลออฟไลน์ที่ถูกปฏิเสธได้");
  return s;
}
async function guarded<T>(name: string, body: () => Promise<T>): Promise<T | Refusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/offline-sync] ${name} INTERNAL`, e);
    return refuse("INTERNAL", "ระบบขัดข้องชั่วคราว — ลองใหม่อีกครั้ง");
  }
}

// ═══════════════════ snapshot (R2 · SEC1 · CD-2 CD-5) ═══════════════════
/** รหัสสั้นของเครื่อง C<n> (ไม่ซ้ำในสาขา · partial unique) — ตั้งครั้งแรกที่ออก snapshot · ชนกัน = ลองเลขถัดไป */
async function ensureOfflineCode(db: Db, c: OfflineCtx, dev: DeviceRow): Promise<string> {
  if (dev.offlineCode) return dev.offlineCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await db.posDevice.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, offlineCode: { not: null } }, select: { offlineCode: true } });
    const max = rows.reduce((m, r) => Math.max(m, Number(/^C(\d+)$/.exec(r.offlineCode ?? "")?.[1] ?? 0)), 0);
    const code = `C${max + 1}`;
    try {
      const u = await db.posDevice.updateMany({ where: { id: dev.id, tenantId: c.tenantId, offlineCode: null }, data: { offlineCode: code } });
      if (u.count === 1) return code;
      const again = await db.posDevice.findFirst({ where: { id: dev.id, tenantId: c.tenantId }, select: { offlineCode: true } });
      if (again?.offlineCode) return again.offlineCode;
    } catch (e) {
      if ((e as { code?: unknown } | null)?.code !== "P2002") throw e;
    }
  }
  throw new Error("ตั้งรหัสออฟไลน์ของเครื่องไม่สำเร็จ");
}
const pickProduct = (p: RegisterProduct, choices: OfflineSnapshotChoice[], groups: unknown[]): OfflineSnapshotProduct => {
  const src = p as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PRODUCT_KEYS) if (src[k] !== undefined) out[k] = src[k];
  out.choices = choices;
  if (groups.length) out.optionGroups = groups;
  return out as unknown as OfflineSnapshotProduct;
};

/**
 * snapshot ของเครื่อง (R2): สินค้าทุกตัวที่ขายได้ที่สาขานี้ (กติกามองเห็นเดียวกับกริด + ตัวแปร) ราคาหน้าร้าน (STORE) ณ ตอนออก + ตัวเลือก/ส่วนต่าง ·
 * VAT + ค่าบริการ · priceValidUntil = ขอบโปรถัดไป · offlineCode/offlineSeq ของเครื่อง · เก็บ priceMap ลง PosOfflineSnapshot (2 ล่าสุดต่อเครื่อง) ·
 * ปฏิเสธ: เครื่องไม่ลงทะเบียน/สาขาอื่น (DEVICE_NOT_FOUND) · ถูกเพิกถอน · ปิดธง (OFFLINE_DISABLED) · ไม่มี pos.sale.create · `opts.now` = ตัวเลื่อนนาฬิกา (CD-6)
 */
export async function issueOfflineSnapshot(ctx: OfflineCtx, actor: RegisterActor, opts: { now?: Date } = {}, client?: Db): Promise<OfflineSnapshotResult> {
  return guarded("issueOfflineSnapshot", async (): Promise<OfflineSnapshotResult> => {
    const db = client ?? prisma;
    const sc = await scopeOf(db, ctx, actor);
    if ("ok" in sc) return sc;
    const c = sc.ctx;
    const code = isRecord(ctx) ? ctx.deviceId : undefined;
    if (typeof code !== "string") return refuse("DEVICE_NOT_FOUND", "ไม่พบเครื่องขายนี้ในสาขา");
    if (!(await flagOn(db, c))) return refuse("OFFLINE_DISABLED", "ร้านยังไม่เปิดขายแบบออฟไลน์");
    const dev = await deviceOf(db, c, code);
    if (!dev) return refuse("DEVICE_NOT_FOUND", "ไม่พบเครื่องขายนี้ในสาขา");
    if (dev.status !== "ACTIVE") return refuse("DEVICE_REVOKED", "เครื่องนี้ถูกเพิกถอนแล้ว");
    const now = nowOf(opts);
    // POS P3.4U ▸ CD-P34U-3 (hunter N11 · R3 H1 — ฮังก์ฝั่งเซิร์ฟเวอร์ฮังก์เดียวของใบ U): ล็อก advisory ต่อเครื่อง (pg_try_advisory_xact_lock) ครอบ
    //   ตรวจเพดานอัตรา → เดินแคตตาล็อก → บันทึก snapshot → ตัดของเก่า ใน transaction เดียว · ล็อกไม่ได้ (มีคำขอของเครื่องนี้ค้างอยู่) = RATE_LIMITED ทันที
    //   (คำขอพร้อมกัน N ตัวเดินแคตตาล็อกได้ตัวเดียว · ไม่มีใบซ้อนภายใน 60 วิ) · บันทึกด้วย createMany skipDuplicates (ชนแล้ว tx ไม่ abort) ·
    //   ตัดของเก่า: เก็บ 2 ล่าสุด ∪ ภายใน 48 ชม. (เพดาน 200 ใบใหม่สุด) ∪ ใบ "เก่าสุด" ภายใน 48 ชม. ∪ hash ที่รายการค้างอ้าง — การยิงออกซ้ำ ~200 ครั้งไม่ไล่ตัดใบที่บิลในเครื่องยังใช้
    const lockKey = `pos-off-snap:${c.tenantId}:${c.unitId}:${dev.deviceCode}`;
    return db.$transaction(
      async (tx): Promise<OfflineSnapshotResult> => {
        const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS ok`;
        if (got[0]?.ok !== true) return refuse("RATE_LIMITED", "เพิ่งออกราคาให้เครื่องนี้ไป — รอสักครู่แล้วลองใหม่");
        // POS P3.4 ▸ fix2 N8 (CD-P34i): 1 ใบต่อเครื่องต่อ 60 วิ (ยกเว้นเลยขอบ priceValidUntil ของใบล่าสุดแล้ว) — กันเดินแคตตาล็อกซ้ำ + กันไล่ตัด snapshot ที่ยังใช้ ◂
        {
          const lastSnap = await tx.posOfflineSnapshot.findFirst({
            where: { tenantId: c.tenantId, unitId: c.unitId, deviceId: dev.deviceCode, issuedAt: { gt: new Date(now.getTime() - SNAPSHOT_MIN_INTERVAL_MS) } },
            orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
            select: { priceMap: true },
          });
          const pvuLast = isRecord(lastSnap?.priceMap) ? (lastSnap.priceMap as Record<string, unknown>).$priceValidUntil : null;
          if (lastSnap && !(typeof pvuLast === "string" && Date.parse(pvuLast) <= now.getTime())) return refuse("RATE_LIMITED", "เพิ่งออกราคาให้เครื่องนี้ไป — รอสักครู่แล้วลองใหม่");
        }
        const rc = baseCtx(c);
        // สินค้า (แม่) ทุกหน้า + ตัวเลือก/ตัวแปร (อ่านผ่าน db — tx ถือแค่ล็อก)
        const parents: RegisterProduct[] = [];
        let pvu: string | null = null;
        let cursor: string | undefined;
        for (let page = 0; page < SNAPSHOT_MAX_PAGES; page++) {
          const r = await registerCatalog(rc, sc.actor, { limit: SNAPSHOT_PAGE, ...(cursor ? { cursor } : {}) }, db);
          if (!r.ok) return refuse(r.code, r.message);
          parents.push(...r.products);
          if (r.priceValidUntil && (!pvu || r.priceValidUntil < pvu)) pvu = r.priceValidUntil;
          if (!r.nextCursor) break;
          cursor = r.nextCursor;
        }
        const products: OfflineSnapshotProduct[] = [];
        for (const p of parents) {
          if (p.optionGroupCount === 0 && p.variantCount === 0) {
            products.push(pickProduct(p, [], []));
            continue;
          }
          const o = await registerProductOptions(rc, sc.actor, { productId: p.id }, db);
          if (!o.ok) continue;
          const choices: OfflineSnapshotChoice[] = o.groups.flatMap((g) => g.choices.map((x) => ({ choiceId: x.choiceId, groupId: g.groupId, name: x.name, priceDeltaSatang: x.priceDeltaSatang })));
          const groups = o.groups.map((g) => ({ groupId: g.groupId, name: g.name, nameEn: g.nameEn, minSelect: g.minSelect, maxSelect: g.maxSelect, choices: g.choices.map((x) => ({ choiceId: x.choiceId, name: x.name, nameEn: x.nameEn, priceDeltaSatang: x.priceDeltaSatang, isDefault: x.isDefault, unavailable: x.unavailable })) }));
          products.push(pickProduct(p, choices, groups));
          const kidIds = o.variants.map((v) => v.id);
          for (let i = 0; i < kidIds.length; i += 200) for (const k of await registerProductsByIds(rc, sc.actor, kidIds.slice(i, i + 200), db)) products.push(pickProduct(k, choices, groups));
        }
        const vat = await registerVatConfig(rc, db);
        if (!vat.ok) return refuse(vat.code, vat.message);
        const pay = await posPaymentSettings({ tenantId: c.tenantId, systemId: c.systemId }, db);
        const serviceChargeBp = pay.ok && pay.serviceCharge.enabled ? pay.serviceCharge.rateBp : 0;
        const offlineCode = await ensureOfflineCode(db, c, dev);
        // หลักฐานราคา (R6): productId → ราคาหน้าร้าน (ต่อกก. ของสินค้าชั่ง) · choiceId → ส่วนต่าง
        // "$priceValidUntil" = ขอบโปรถัดไปของ snapshot (ทางราคา snapshot ใช้ได้ถึงขอบนี้ + 15 นาที · มติ 6) — คีย์ขึ้นต้น $ ไม่ชน id สินค้า/ตัวเลือก
        const priceMap: Record<string, number | string | null> = { $priceValidUntil: pvu };
        for (const p of products) {
          if (typeof p.priceSatang === "number") priceMap[p.id] = p.priceSatang;
          for (const ch of p.choices) priceMap[ch.choiceId] = ch.priceDeltaSatang;
        }
        const issuedAt = now.toISOString();
        const body = { vat: { mode: vat.mode, rateBp: vat.rateBp }, serviceChargeBp, products };
        const hash = sha(`${c.unitId}|${dev.deviceCode}|${issuedAt}|${stable(body)}`).slice(0, 32);
        // ออกซ้ำเนื้อหาเดิมเวลาเดิม = แถวเดิม (ON CONFLICT DO NOTHING — ไม่ทำให้ tx abort)
        await tx.posOfflineSnapshot.createMany({ data: [{ tenantId: c.tenantId, unitId: c.unitId, deviceId: dev.deviceCode, issuedAt: now, priceMap, hash }], skipDuplicates: true });
        // POS P3.4 ▸ fix1 N4 = F1 (CD-P34g) + fix2 G3/N8: เก็บ 2 ล่าสุด ∪ ภายใน 48 ชม. (เพดาน 200) ∪ hash ที่รายการค้างอ้าง — นอกนั้นถูกตัด (SEC3) ◂
        const devWhere = { tenantId: c.tenantId, unitId: c.unitId, deviceId: dev.deviceCode };
        const order = [{ issuedAt: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }];
        const win = { ...devWhere, issuedAt: { gte: new Date(now.getTime() - 2 * OFFLINE_MAX_AGE_MS) } };
        const [last, recent, oldest] = await Promise.all([
          tx.posOfflineSnapshot.findMany({ where: devWhere, orderBy: order, select: { id: true }, take: SNAPSHOT_KEEP }),
          tx.posOfflineSnapshot.findMany({ where: win, orderBy: order, select: { id: true }, take: SNAPSHOT_KEEP_RECENT_MAX }),
          tx.posOfflineSnapshot.findMany({ where: win, orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true }, take: 1 }),
        ]);
        const keep = [...new Set([...last, ...recent, ...oldest].map((k) => k.id))];
        const pending = await tx.posOfflineSale.findMany({
          where: { tenantId: c.tenantId, unitId: c.unitId, deviceId: dev.deviceCode, OR: [{ status: STATUS.REJECTED }, { status: STATUS.ACCEPTED, saleId: null }] },
          select: { payload: true },
          take: 2000,
        });
        const referenced = [...new Set(pending.map((r) => (isRecord(r.payload) && typeof r.payload.snapshotHash === "string" ? r.payload.snapshotHash : "")).filter(Boolean))];
        await tx.posOfflineSnapshot.deleteMany({ where: { ...devWhere, id: { notIn: keep }, ...(referenced.length ? { hash: { notIn: referenced } } : {}) } });
        const fresh = await tx.posDevice.findFirst({ where: { id: dev.id, tenantId: c.tenantId }, select: { offlineSeq: true } });
        return {
          ok: true,
          snapshot: { hash, issuedAt, priceValidUntil: pvu, offlineCode, offlineSeq: fresh?.offlineSeq ?? dev.offlineSeq, vat: body.vat, serviceChargeBp, products },
        };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    // ◂ POS P3.4U
  });
}

// ═══════════════════ ซิงก์ (R5–R9) ═══════════════════
/** โครงของคำขอ — ผิด = VALIDATION ทั้งชุด (ไม่เขียนอะไร) · soldAt ผิดรูป = ปฏิเสธรายรายการ (บันทึกไว้) */
function parseBatch(input: unknown): { deviceId: string; items: OfflineSyncItem[] } | Refusal {
  if (!isRecord(input) || !Object.keys(input).every((k) => k === "deviceId" || k === "items")) return refuse("VALIDATION", "คำขอซิงก์ไม่ถูกต้อง");
  if (typeof input.deviceId !== "string" || !isPosDeviceCode(input.deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
  if (!Array.isArray(input.items)) return refuse("VALIDATION", "รายการซิงก์ไม่ถูกต้อง");
  if (input.items.length > OFFLINE_SYNC_BATCH_MAX) return refuse("VALIDATION", `ซิงก์ได้ครั้งละไม่เกิน ${OFFLINE_SYNC_BATCH_MAX} บิล`);
  const keys = new Set<string>();
  for (const it of input.items as unknown[]) {
    if (!isRecord(it) || !Object.keys(it).every((k) => (OFFLINE_ITEM_KEYS as readonly string[]).includes(k))) return refuse("VALIDATION", "รายการซิงก์มีข้อมูลที่ระบบไม่รู้จัก");
    if (!isStr(it.offlineRef, 40) || !isIdemKey(it.idempotencyKey) || !isStr(it.soldAt, 40) || !isStr(it.snapshotHash, 100) || !isRecord(it.sale)) return refuse("VALIDATION", "รายการซิงก์ไม่ครบ");
    if (it.shiftId !== undefined && it.shiftId !== null && !isStr(it.shiftId, 64)) return refuse("VALIDATION", "กะของรายการไม่ถูกต้อง");
    if (it.staffToken !== undefined && it.staffToken !== null && !isStr(it.staffToken, 1000)) return refuse("VALIDATION", "โทเคนพนักงานไม่ถูกต้อง");
    if (it.sellerUserId !== undefined && it.sellerUserId !== null && !isStr(it.sellerUserId, 64)) return refuse("VALIDATION", "ผู้ขายของรายการไม่ถูกต้อง");
    if (keys.has(it.idempotencyKey)) return refuse("VALIDATION", "คีย์บิลซ้ำในชุดเดียวกัน");
    keys.add(it.idempotencyKey);
  }
  return { deviceId: input.deviceId, items: input.items as OfflineSyncItem[] };
}

type Env = { db: Db; ctx: OfflineCtx; actor: RegisterActor; dev: DeviceRow; now: number };
type RowState = { id: string; status: string; reason: string | null; saleId: string | null; createdAt: Date; payload: Prisma.JsonValue; unitId: string; deviceId: string; offlineRef: string; idempotencyKey: string; soldAt: Date };
type Verdict = { kind: "ok"; saleId: string; receiptNo: string | null; duplicated: boolean; drift: RegisterOfflineDrift | null; priceAtSyncSatang?: number | null } | { kind: "rejected"; reason: string } | { kind: "transient"; code: string };
const reject = (reason: string): Verdict => ({ kind: "rejected", reason });

/** หลักฐาน snapshot ของรายการ (แช่แข็งลง payload ตอนบันทึกครั้งแรก — ผู้จัดการรับทีหลังได้แม้ snapshot ถูกตัดทิ้งแล้ว) */
type Evidence = { issuedAt: string; priceValidUntil: string | null; prices: Record<string, number> } | null;
async function evidenceOf(db: Db, e: Env, hash: string, sale: Record<string, unknown>): Promise<Evidence> {
  const row = await db.posOfflineSnapshot.findFirst({ where: { tenantId: e.ctx.tenantId, unitId: e.ctx.unitId, deviceId: e.dev.deviceCode, hash }, select: { issuedAt: true, priceMap: true } });
  if (!row) return null;
  const map = isRecord(row.priceMap) ? (row.priceMap as Record<string, unknown>) : {};
  const want = new Set<string>();
  for (const l of Array.isArray(sale.lines) ? (sale.lines as unknown[]) : []) {
    if (!isRecord(l)) continue;
    if (typeof l.productId === "string") want.add(l.productId);
    for (const o of Array.isArray(l.options) ? (l.options as unknown[]) : []) if (isRecord(o) && typeof o.choiceId === "string") want.add(o.choiceId);
  }
  const prices: Record<string, number> = {};
  for (const k of want) if (typeof map[k] === "number" && Number.isInteger(map[k])) prices[k] = map[k] as number;
  const pvu = typeof map.$priceValidUntil === "string" ? map.$priceValidUntil : null;
  return { issuedAt: row.issuedAt.toISOString(), priceValidUntil: pvu, prices };
}

/**
 * ตัดสินรายการหนึ่ง (ใช้ร่วมซิงก์ครั้งแรก + ผู้จัดการรับ) — ลำดับ: เนื้อหาที่ออฟไลน์ห้าม → เลข OFF ของเครื่องนี้ → เลขถูกใช้แล้ว → snapshot → นาฬิกา →
 * เครื่องถูกเพิกถอน ณ soldAt → กะที่บันทึก → ผู้ขาย/โทเคน ณ soldAt → submitRegisterSale (ราคา ณ soldAt / snapshot · สต็อก · createSale)
 * manager: ไม่ตรวจเปิดกะ − 5 นาที · ผู้ขาย = ผู้ขายที่ตรวจแล้วเท่านั้น (fix1 N1) · หลักฐาน snapshot จาก payload
 */
async function decide(
  e: Env,
  it: { offlineRef: string; idempotencyKey: string; soldAt: string; shiftId: string | null; staffToken: string | null; sellerUserId: string | null; snapshotHash: string; sale: Record<string, unknown> },
  evidence: Evidence,
  manager: { actor: RegisterActor; verifiedSellerId: string | null; capSellerId?: string | null } | null, // POS P3.4 ▸ fix1 N1 ◂ · POS P3.4 ▸ fix2 N7 capSellerId ◂
): Promise<Verdict> {
  const { db, ctx } = e;
  if (offlineSaleRefusal(it.sale)) return reject("VALIDATION");
  // เลข OFF: รูป OFF-<รหัส>-<seq 4+> · รหัสในเนมสเปซของเซิร์ฟเวอร์ (C<n>) ต้องเป็นของเครื่องนี้เท่านั้น (ขโมยรหัสเครื่องอื่น/จองรหัสที่ยังไม่แจก = ปฏิเสธ) ·
  //   รหัสนอกเนมสเปซ C<n> ชนกับเครื่องอื่นไม่ได้ (เซิร์ฟเวอร์ไม่แจก) — ความไม่ซ้ำต่อสาขาตัดสินด้วยเลขเต็ม (OFFLINE_REF_TAKEN + unique ของบิล) · CONTROLLER-DECISION CD-P34c
  const refCode = OFFLINE_REF_LOOSE.exec(it.offlineRef)?.[1];
  if (!refCode || (/^C[0-9]+$/.test(refCode) && refCode !== e.dev.offlineCode)) return reject("VALIDATION");
  if (/^C[0-9]+$/.test(refCode) && !parseOfflineRef(it.offlineRef)) return reject("VALIDATION"); // POS P3.4 ▸ fix1 F6: รหัส C<n> ต้องเป็นรูปมาตรฐาน (OFF-C1-00007 ≠ OFF-C1-0007 — สลิปสองใบห้ามมีเลข 7 ซ้ำ) ◂
  const takenRow = await db.posOfflineSale.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, offlineRef: it.offlineRef, NOT: { idempotencyKey: it.idempotencyKey } }, select: { id: true } });
  const takenSale = await db.posSale.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, offlineRef: it.offlineRef, NOT: { idempotencyKey: `${REG_KEY_PREFIX}${it.idempotencyKey}` } }, select: { id: true } });
  if (takenRow || takenSale) return reject("OFFLINE_REF_TAKEN");
  if (!evidence && !manager) return reject("SNAPSHOT_UNKNOWN");
  // R7 นาฬิกา
  const soldMs = Date.parse(it.soldAt);
  if (!Number.isFinite(soldMs) || !/^\d{4}-\d{2}-\d{2}T/.test(it.soldAt)) return reject("VALIDATION");
  // ผู้จัดการรับบิลเก่ากว่า 24 ชม. ได้ (ตัดสินเอง) · อนาคต / ก่อน snapshot / snapshot อายุเกิน 24 ชม. ตอนขาย = ไม่ได้ทั้งคู่
  if (soldMs > e.now + OFFLINE_CLOCK_SKEW_MS || (!manager && soldMs < e.now - OFFLINE_MAX_AGE_MS)) return reject("CLOCK_INVALID");
  if (evidence && (soldMs < Date.parse(evidence.issuedAt) || soldMs - Date.parse(evidence.issuedAt) > OFFLINE_MAX_AGE_MS)) return reject("CLOCK_INVALID");
  // POS P3.4 ▸ fix1 N3: ขายเลย priceValidUntil + 15 นาทีของ snapshot = เครื่องที่ถูกต้องหยุดขายแล้ว (offlineSellGate) ⇒ CLOCK_INVALID (กันย้อนเวลาเข้าโปร) ◂
  if (evidence?.priceValidUntil && soldMs > Date.parse(evidence.priceValidUntil) + OFFLINE_PRICE_GRACE_MS) return reject("CLOCK_INVALID");
  // R8 เครื่อง (CD-12): ถูกเพิกถอนก่อน/ตอน soldAt = ปฏิเสธ · หลัง soldAt = ขายได้ (audit บันทึก revokedAt)
  if (e.dev.status === "REVOKED" && (!e.dev.revokedAt || e.dev.revokedAt.getTime() <= soldMs)) return reject("DEVICE_REVOKED");
  // R8 กะ: กะของเครื่องนี้ที่บันทึกไว้ต้องยัง OPEN · soldAt ≥ เปิดกะ − 5 นาที · ไม่ส่งกะ = กะของเครื่องที่ครอบ soldAt (กันซ่อนบิลเงินสดไว้นอกกะ)
  // POS P3.4 ▸ fix1 N2 = F3 (CD-P34g): รอบแรก — ไม่มีกะครอบ soldAt แต่เครื่องมีกะเปิดอยู่ หรือมีกะภายใน 24 ชม. = SHIFT_REQUIRED (คิวผู้จัดการ ไม่ใช่นอกกะ) ·
  //   ผู้จัดการรับ — กะที่บันทึก/กะที่ครอบ soldAt ยังเปิด = ผูกกะนั้น · ปิดแล้ว = นอกกะ (null) · ไม่มีกะครอบ = กะที่เปิดอยู่ของเครื่อง (ถ้ามี) ไม่งั้นนอกกะ
  let shiftId: string | null = null;
  {
    const where = { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId, deviceId: e.dev.deviceCode };
    // POS P3.4 ▸ fix2 G1 (CD-P34i): กะที่ครอบ soldAt ก่อนเสมอ · กะที่บันทึกนับเฉพาะเมื่อ soldAt ∈ [เปิด − 5 นาที, ปิด ?? ตอนนี้] —
    //   ไม่ครอบ: รอบแรก = เปิดทีหลัง soldAt → CLOCK_INVALID (R7 เดิม) / ปิดก่อน soldAt → VALIDATION · ผู้จัดการรับ = ใช้กะที่ครอบ soldAt แทน (กันอ้างกะเก่าที่ปิดเพื่อย้ายเงินออกจากกะที่เปิด) ◂
    const sel = { id: true, status: true, openedAt: true, closedAt: true } as const;
    const covering = await db.posShift.findFirst({
      where: { ...where, openedAt: { lte: new Date(soldMs + OFFLINE_SHIFT_SLACK_MS) }, OR: [{ status: "OPEN" }, { closedAt: { gte: new Date(soldMs) } }] },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      select: sel,
    });
    const recorded = it.shiftId ? await db.posShift.findFirst({ where: { ...where, id: it.shiftId }, select: sel }) : null;
    if (it.shiftId && !recorded && !manager) return reject("VALIDATION");
    if (recorded && !manager) {
      if (soldMs < recorded.openedAt.getTime() - OFFLINE_SHIFT_SLACK_MS) return reject("CLOCK_INVALID");
      if (soldMs > (recorded.closedAt?.getTime() ?? e.now + OFFLINE_CLOCK_SKEW_MS)) return reject("VALIDATION");
    }
    const recordedCovers = !!recorded && soldMs >= recorded.openedAt.getTime() - OFFLINE_SHIFT_SLACK_MS && soldMs <= (recorded.closedAt?.getTime() ?? e.now + OFFLINE_CLOCK_SKEW_MS);
    const sh = recordedCovers ? recorded : covering;
    if (manager) {
      if (sh) shiftId = sh.status === "OPEN" ? sh.id : null;
      else shiftId = (await db.posShift.findFirst({ where: { ...where, status: "OPEN" }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], select: { id: true } }))?.id ?? null;
    } else if (sh) {
      if (sh.status !== "OPEN") return reject("SHIFT_CLOSED");
      if (soldMs < sh.openedAt.getTime() - OFFLINE_SHIFT_SLACK_MS) return reject("CLOCK_INVALID");
      shiftId = sh.id;
    } else {
      const since = new Date(e.now - OFFLINE_MAX_AGE_MS);
      const recent = await db.posShift.findFirst({ where: { ...where, OR: [{ status: "OPEN" }, { openedAt: { gte: since } }, { closedAt: { gte: since } }] }, select: { id: true } });
      if (recent) return reject("SHIFT_REQUIRED");
      const sys = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
      if (parseShiftSettings(sys?.settings).requiredRegister) return reject("SHIFT_REQUIRED");
    }
  } // ◂
  // R8 ผู้ขาย (CD-3): โทเคน ณ soldAt (มติ 12) · ผู้ขายที่อ้างต้องเป็นคนในโทเคน / ผู้ใช้ที่ซิงก์
  let seller: RegisterActor = e.actor;
  let capActor: RegisterActor | null = null; // POS P3.4 ▸ fix2 N7 ◂
  if (manager) {
    // POS P3.4 ▸ fix1 N1 (High): ผู้จัดการรับ = ขายในนามผู้ขายที่ตรวจแล้วเท่านั้น (สิทธิ์ + เพดานส่วนลดของคนนั้น) · ไม่ใช่ผู้จัดการ · ไม่ใช่ผู้ขายที่อ้าง ·
    //   คนนั้นขายที่สาขานี้ไม่ได้แล้ว (หรือเป็นคีย์ API) = รับไม่ได้ (SELLER_MISMATCH → ทิ้งแล้วขายใหม่ออนไลน์) ◂
    const orig = manager.verifiedSellerId ? await posMemberActor(ctx.tenantId, manager.verifiedSellerId, db) : null;
    const ok = orig ? await registerScopeCheck(baseCtx(ctx), orig, db) : null;
    if (!ok?.ok) return reject("SELLER_MISMATCH");
    seller = ok.actor;
    // POS P3.4 ▸ fix2 N7 (CD-P34i): ผู้ขายที่อ้าง (ไม่มีโทเคนที่ผ่าน) ≠ ผู้ซิงก์ ⇒ ต้องเป็นสมาชิกที่ขายที่สาขานี้ได้ · ราคา/ส่วนลด = เพดานต่ำกว่าของสองคน ◂
    if (manager.capSellerId) {
      const ca = await posMemberActor(ctx.tenantId, manager.capSellerId, db);
      const okc = ca ? await registerScopeCheck(baseCtx(ctx), ca, db) : null;
      if (!okc?.ok) return reject("SELLER_MISMATCH");
      capActor = okc.actor;
    }
  } else if (it.staffToken) {
    const ta = await staffActorFromToken({ tenantId: ctx.tenantId, unitId: ctx.unitId, deviceId: e.dev.deviceCode }, it.staffToken, db, { at: new Date(soldMs) });
    if (!ta) return reject("STAFF_TOKEN_INVALID");
    if (it.sellerUserId && it.sellerUserId !== ta.userId) return reject("SELLER_MISMATCH");
    seller = ta;
  } else if (it.sellerUserId && it.sellerUserId !== e.actor.userId) return reject("SELLER_MISMATCH");
  // ส่งต่อหน้าขาย (R6 ราคา ณ soldAt / snapshot · R9 สต็อก/สูตร/บัญชี/outbox ทางเดิม · ไม่ออกตั๋วครัว)
  const off: RegisterOfflineSubmit = {
    ref: it.offlineRef,
    soldAt: new Date(soldMs),
    shiftId,
    snapshotPrices: evidence ? new Map(Object.entries(evidence.prices)) : null,
    nowMs: e.now, // POS P3.4 ▸ fix1 N3 ◂
    skipWindowReview: !!manager, // POS P3.4 ▸ fix1 N3: ผู้จัดการรับ = คิด ณ soldAt ◂
    snapshotPastPvu: !!evidence?.priceValidUntil && soldMs > Date.parse(evidence.priceValidUntil), // POS P3.4 ▸ fix2 N6 ◂
    capActor, // POS P3.4 ▸ fix2 N7 ◂
  };
  const regCtx = registerOfflineCtx({ ...baseCtx(ctx), deviceId: e.dev.deviceCode, ...(ctx.apiKeyId ? { apiKeyId: ctx.apiKeyId } : {}) }, off);
  const res = await submitRegisterSale(regCtx, seller, { ...(it.sale as Omit<RegisterSubmitInput, "idempotencyKey">), idempotencyKey: it.idempotencyKey }, db);
  if (res.ok) return { kind: "ok", saleId: res.saleId, receiptNo: res.receiptNo ?? null, duplicated: !!res.duplicated, drift: off.drift ?? null, priceAtSyncSatang: off.priceAtSyncSatang ?? null };
  if (TRANSIENT.has(res.code)) return { kind: "transient", code: res.code };
  if (off.windowReview) return reject("PRICE_WINDOW_REVIEW"); // POS P3.4 ▸ fix1 N3 ◂
  // แข่งกันเอาเลข OFF เดียวกัน (unique (unitId, offlineRef) ของบิล) = OFFLINE_REF_TAKEN
  const raced = await db.posSale.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, offlineRef: it.offlineRef, NOT: { idempotencyKey: `${REG_KEY_PREFIX}${it.idempotencyKey}` } }, select: { id: true } });
  if (raced) return reject("OFFLINE_REF_TAKEN");
  return reject(REASON_OF[res.code] ?? res.code);
}

/** high-water ของเลข OFF ของเครื่อง (คำสั่งเดียว · ไม่ถอยหลัง) */
async function bumpSeq(db: Db, e: Env, offlineRef: string): Promise<void> {
  const ref = parseOfflineRef(offlineRef);
  if (!ref || ref.code !== e.dev.offlineCode) return;
  await db.$executeRaw`UPDATE "PosDevice" SET "offlineSeq" = GREATEST("offlineSeq", ${ref.seq}) WHERE id = ${e.dev.id} AND "tenantId" = ${e.ctx.tenantId}`;
}
async function receiptNoOf(db: Db, tenantId: string, saleId: string | null): Promise<string | null> {
  if (!saleId) return null;
  return (await db.posSale.findFirst({ where: { tenantId, id: saleId }, select: { receiptNo: true } }))?.receiptNo ?? null;
}
const auditActor = (e: Env, actorId: string) => (e.ctx.apiKeyId && actorId === e.ctx.apiKeyId ? { actorId, actorType: "API_KEY" as const } : { actorId });

/** แถว PROCESSING → ผล (เขียน audit เฉพาะผู้ชนะการเปลี่ยนสถานะ ⇒ บิลละ 1 แถวแม้ส่งพร้อมกัน) */
async function settle(e: Env, row: { id: string; offlineRef: string; soldAt: Date }, v: Verdict, via: { managerId: string } | null): Promise<OfflineSyncResult> {
  const { db, ctx } = e;
  if (v.kind === "transient") return { offlineRef: row.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: v.code };
  if (v.kind === "rejected") {
    if (via) await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, status: STATUS.ACCEPTED, saleId: null }, data: { status: STATUS.REJECTED, reason: v.reason, resolvedByUserId: null } });
    else await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, status: STATUS.REJECTED, reason: PROCESSING }, data: { reason: v.reason } });
    return { offlineRef: row.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: v.reason };
  }
  const drift = v.drift;
  const won = via
    ? await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, status: STATUS.ACCEPTED, saleId: null }, data: { saleId: v.saleId, reason: null, ...(drift ? { drift: drift as unknown as Prisma.InputJsonValue } : {}) } })
    : await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, status: STATUS.REJECTED, reason: PROCESSING }, data: { status: STATUS.SYNCED, saleId: v.saleId, reason: null, ...(drift ? { drift: drift as unknown as Prisma.InputJsonValue } : {}) } });
  // audit ต่อบิลที่เกิดจากรายการนี้ (บิลออนไลน์เดิมของคีย์เดียวกัน = ไม่ใช่บิลออฟไลน์ ไม่เขียน)
  const sale = await db.posSale.findFirst({ where: { tenantId: ctx.tenantId, id: v.saleId }, select: { offlineRef: true, syncedAt: true, soldByUserId: true } });
  if (won.count === 1 && sale?.offlineRef === row.offlineRef) {
    await writeAudit({
      tenantId: ctx.tenantId,
      ...(via ? { actorId: via.managerId } : auditActor(e, e.actor.userId)),
      action: AUDIT_SYNCED,
      targetType: "PosSale",
      targetId: v.saleId,
      after: {
        offlineRef: row.offlineRef,
        offlineSaleId: row.id,
        deviceId: e.dev.deviceCode,
        soldAt: row.soldAt.toISOString(),
        syncedAt: (sale.syncedAt ?? new Date()).toISOString(),
        sellerUserId: sale.soldByUserId,
        ...(e.dev.revokedAt ? { deviceRevokedAt: e.dev.revokedAt.toISOString() } : {}),
        ...(drift ? { drift } : {}),
        priceAtSyncSatang: v.priceAtSyncSatang ?? null, // POS P3.4 ▸ fix1 N3 ◂
        ...(via ? { via: "manager" } : {}),
      },
    });
  }
  await bumpSeq(db, e, row.offlineRef);
  return { offlineRef: row.offlineRef, status: v.duplicated ? "DUPLICATE" : "OK", offlineSaleId: row.id, saleId: v.saleId, receiptNo: v.receiptNo, ...(drift ? { drift } : {}) };
}

/** สถานะเดิมของคีย์ → ผล (ส่งซ้ำ: บิลเดิม / เหตุผลเดิม · ไม่เขียนอะไร) · null = ต้องตัดสิน (แถว PROCESSING) */
async function replayOf(e: Env, row: RowState, itemHash: string): Promise<OfflineSyncResult | null> {
  const p = isRecord(row.payload) ? row.payload : {};
  if (row.unitId !== e.ctx.unitId || row.deviceId !== e.dev.deviceCode || p.itemHash !== itemHash) return { offlineRef: row.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: "IDEMPOTENCY_CONFLICT" };
  if ((row.status === STATUS.SYNCED || row.status === STATUS.ACCEPTED) && row.saleId) return { offlineRef: row.offlineRef, status: "DUPLICATE", offlineSaleId: row.id, saleId: row.saleId, receiptNo: await receiptNoOf(e.db, e.ctx.tenantId, row.saleId) };
  if (row.status === STATUS.REJECTED && row.reason === PROCESSING) return null;
  if (row.status === STATUS.DISCARDED) return { offlineRef: row.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: "DISCARDED" };
  return { offlineRef: row.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: row.reason ?? "REJECTED" };
}

const ROW_SELECT = { id: true, status: true, reason: true, saleId: true, createdAt: true, payload: true, unitId: true, deviceId: true, offlineRef: true, idempotencyKey: true, soldAt: true } as const;

async function syncOne(e: Env, it: OfflineSyncItem): Promise<OfflineSyncResult> {
  const { db, ctx } = e;
  const sale = it.sale as unknown as Record<string, unknown>;
  const item = {
    offlineRef: it.offlineRef,
    idempotencyKey: it.idempotencyKey,
    soldAt: it.soldAt,
    shiftId: it.shiftId ?? null,
    staffToken: it.staffToken ?? null,
    sellerUserId: it.sellerUserId ?? null,
    snapshotHash: it.snapshotHash,
    sale,
  };
  // ลายนิ้วมือของรายการ (รวมโทเคน — ไม่เก็บตัวโทเคน · CD-9) ⇒ คีย์เดิม payload ต่าง = IDEMPOTENCY_CONFLICT
  const itemHash = sha(stable({ ...item, staffToken: item.staffToken ? sha(item.staffToken) : null }));
  const where = { tenantId_idempotencyKey: { tenantId: ctx.tenantId, idempotencyKey: it.idempotencyKey } };
  let row = (await db.posOfflineSale.findUnique({ where, select: ROW_SELECT })) as RowState | null;
  if (row) {
    const r = await replayOf(e, row, itemHash);
    if (r) return r;
  }
  const evidence = row ? ((isRecord(row.payload) ? (row.payload.evidence as Evidence) : null) ?? null) : await evidenceOf(db, e, it.snapshotHash, sale);
  if (!row) {
    const soldMs = Date.parse(it.soldAt);
    // POS P3.4 ▸ fix1 N1: ผู้ขายที่ตรวจแล้ว (โทเคนผ่าน ณ soldAt) ไม่งั้นผู้ใช้ที่ซิงก์ — บันทึกครั้งเดียวตอนแรก · คำอ้างเก็บแยกไว้แสดงเท่านั้น ◂
    const ta = item.staffToken && Number.isFinite(soldMs) ? await staffActorFromToken({ tenantId: ctx.tenantId, unitId: ctx.unitId, deviceId: e.dev.deviceCode }, item.staffToken, db, { at: new Date(soldMs) }) : null;
    const payload = {
      v: 1,
      itemHash,
      offlineRef: it.offlineRef,
      soldAt: it.soldAt,
      shiftId: item.shiftId,
      claimedSellerUserId: item.sellerUserId ?? tokenClaimUser(item.staffToken), // POS P3.4 ▸ fix1 N1 ◂
      verifiedSellerUserId: ta?.userId ?? e.actor.userId, // POS P3.4 ▸ fix1 N1 ◂
      syncedByUserId: e.actor.userId,
      hasStaffToken: !!item.staffToken,
      snapshotHash: it.snapshotHash,
      evidence,
      sale: stripSecrets(sale),
    };
    try {
      row = (await db.posOfflineSale.create({
        data: {
          tenantId: ctx.tenantId,
          unitId: ctx.unitId,
          systemId: ctx.systemId,
          deviceId: e.dev.deviceCode,
          offlineRef: it.offlineRef,
          idempotencyKey: it.idempotencyKey,
          payload: payload as unknown as Prisma.InputJsonValue,
          soldAt: new Date(Number.isFinite(soldMs) ? soldMs : e.now),
          status: STATUS.REJECTED,
          reason: PROCESSING,
        },
        select: ROW_SELECT,
      })) as RowState;
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code !== "P2002") throw err;
      row = (await db.posOfflineSale.findUnique({ where, select: ROW_SELECT })) as RowState | null;
      if (!row) throw err;
      const r = await replayOf(e, row, itemHash);
      if (r) return r;
    }
  }
  const v = await decide(e, item, evidence, null);
  if (v.kind === "transient") return { offlineRef: it.offlineRef, status: "REJECTED", offlineSaleId: row.id, reason: v.code };
  if (v.kind === "rejected") await bumpSeq(db, e, it.offlineRef);
  return settle(e, row, v, null);
}

/**
 * ซิงก์บิลออฟไลน์ของเครื่อง (R5): ปฏิเสธทั้งชุด (ไม่เขียนอะไร) เมื่อ โครงผิด / > 50 รายการ / deviceId ≠ ctx.deviceId / ขอบเขตหรือสิทธิ์ขายไม่ผ่าน /
 * เครื่องไม่อยู่ในสาขานี้ (ปิดธง = ยังรับ · fix1 F5) · ผ่านแล้วทำทีละรายการเรียง (soldAt, seq) — ผลรายรายการ OK | DUPLICATE | REJECTED (เหตุผล) ·
 * ขัดข้องชั่วคราวกลางชุด (BUSY/INTERNAL) = หยุดทั้งชุด {ok:false, code BUSY} (ส่งใหม่ด้วยคีย์เดิม = รายการที่ผ่านแล้วได้ DUPLICATE)
 */
export async function syncOfflineSales(ctx: OfflineCtx, actor: RegisterActor, input: OfflineSyncInput, opts: { now?: Date } = {}, client?: Db): Promise<OfflineSyncBatchResult> {
  return guarded("syncOfflineSales", async (): Promise<OfflineSyncBatchResult> => {
    const db = client ?? prisma;
    const b = parseBatch(input);
    if ("ok" in b) return b;
    if (isRecord(ctx) && ctx.deviceId !== undefined && ctx.deviceId !== b.deviceId) return refuse("VALIDATION", "รหัสเครื่องของคำขอไม่ตรงกับเครื่องของ session");
    const sc = await scopeOf(db, ctx, actor);
    if ("ok" in sc) return sc;
    // POS P3.4 ▸ fix1 F5 (CD-P34g): ธงออฟไลน์คุมการออก snapshot (การขาย) เท่านั้น — บิลที่ค้างในเครื่องตอนปิดธงยังซิงก์ได้ (เงินสดต้องลงบิล) ◂
    const dev = await deviceOf(db, sc.ctx, b.deviceId);
    if (!dev) return refuse("DEVICE_NOT_FOUND", "ไม่พบเครื่องขายนี้ในสาขา");
    const e: Env = { db, ctx: { ...sc.ctx, ...(isRecord(ctx) && typeof ctx.apiKeyId === "string" && ctx.apiKeyId ? { apiKeyId: ctx.apiKeyId } : {}) }, actor: sc.actor, dev, now: nowOf(opts).getTime() };
    const byKey = new Map<string, OfflineSyncResult>();
    for (const batch of offlineBatches(b.items)) {
      for (const it of batch) {
        const r = await syncOne(e, it);
        if (TRANSIENT.has(r.reason ?? "") && r.status === "REJECTED") return refuse("BUSY", "ระบบไม่ว่างชั่วคราว — ส่งบิลที่เหลือใหม่อีกครั้ง");
        byKey.set(it.idempotencyKey, r);
      }
    }
    return { ok: true, results: b.items.map((it) => byKey.get(it.idempotencyKey)!) };
  });
}

// ═══════════════════ คิวผู้จัดการ (R10 · มติ 7 · CD-7) ═══════════════════
/** รายการที่ถูกปฏิเสธของสาขา (ใหม่ก่อน) — pos.shift.manage */
export async function listOfflineRejected(ctx: OfflineCtx, actor: RegisterActor, input: { limit?: number } = {}, client?: Db): Promise<OfflineRejectedResult> {
  return guarded("listOfflineRejected", async (): Promise<OfflineRejectedResult> => {
    const db = client ?? prisma;
    const sc = await managerScope(db, ctx, actor);
    if ("ok" in sc) return sc;
    const lim = isRecord(input) && Number.isInteger(input.limit) && (input.limit as number) > 0 ? Math.min(input.limit as number, LIST_MAX) : 50;
    const rows = await db.posOfflineSale.findMany({
      // POS P3.4 ▸ fix1 N5 = F4: + แถวที่ผู้จัดการจองรับแล้วแต่ยังไม่มีบิล (ล้มกลางทาง) — รับซ้ำได้ ◂
      where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, systemId: sc.ctx.systemId, OR: [{ status: STATUS.REJECTED }, { status: STATUS.ACCEPTED, saleId: null }] },
      orderBy: [{ soldAt: "desc" }, { id: "desc" }],
      take: lim,
      select: { id: true, offlineRef: true, deviceId: true, soldAt: true, reason: true, status: true, createdAt: true, payload: true },
    });
    return {
      ok: true,
      items: rows.map((r) => {
        const p = isRecord(r.payload) ? r.payload : {};
        const s = isRecord(p.sale) ? p.sale : {};
        return {
          id: r.id,
          offlineRef: r.offlineRef,
          deviceId: r.deviceId,
          soldAt: r.soldAt.toISOString(),
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          expectedGrandTotalSatang: typeof s.expectedGrandTotalSatang === "number" ? s.expectedGrandTotalSatang : null,
          claimedSellerUserId: strOf(p.claimedSellerUserId, p.sellerUserId, p.staffClaimUserId), // POS P3.4 ▸ fix1 N1 ◂
          verifiedSellerUserId: strOf(p.verifiedSellerUserId, p.syncedByUserId), // POS P3.4 ▸ fix1 N1 ◂
        };
      }),
    };
  });
}

async function managerRow(db: Db, c: OfflineCtx, id: unknown): Promise<RowState | null> {
  if (!isStr(id, 64)) return null;
  return (await db.posOfflineSale.findFirst({ where: { id, tenantId: c.tenantId, unitId: c.unitId, systemId: c.systemId }, select: ROW_SELECT })) as RowState | null;
}
const youngProcessing = (r: RowState) => r.status === STATUS.REJECTED && r.reason === PROCESSING && Date.now() - r.createdAt.getTime() < PROCESSING_GUARD_MS;

/**
 * ผู้จัดการรับบิลที่ถูกปฏิเสธ (R10): ตัดสินใหม่ด้วยกติกาเดิม + ข้อยกเว้นของผู้จัดการ — กะ = กะที่ยังเปิดของ soldAt (fix1 N2 · ปิดแล้ว = นอกกะ) · ผู้ขาย = ผู้ขายที่ตรวจแล้วเท่านั้น (fix1 N1) ·
 * สต็อกตรวจใหม่ · ราคา/นาฬิกา/เครื่องถูกเพิกถอน/เลข OFF ยังบังคับ (ไม่ผ่าน = ปฏิเสธพร้อมรหัส ให้ทิ้งแล้วขายใหม่ออนไลน์) ·
 * idempotent: รับซ้ำ = บิลเดิม (duplicated) · หลังทิ้ง = CONFLICT · audit pos.sale.offline_synced {via: "manager"}
 */
export async function acceptOfflineSale(ctx: OfflineCtx, actor: RegisterActor, input: { id: string }, client?: Db): Promise<OfflineAcceptResult> {
  return guarded("acceptOfflineSale", async (): Promise<OfflineAcceptResult> => {
    const db = client ?? prisma;
    const sc = await managerScope(db, ctx, actor);
    if ("ok" in sc) return sc;
    const row = await managerRow(db, sc.ctx, isRecord(input) ? input.id : undefined);
    if (!row) return refuse("NOT_FOUND", "ไม่พบรายการนี้");
    if (row.status === STATUS.SYNCED || (row.status === STATUS.ACCEPTED && row.saleId)) return { ok: true, saleId: row.saleId!, receiptNo: await receiptNoOf(db, sc.ctx.tenantId, row.saleId), duplicated: true };
    if (row.status === STATUS.DISCARDED) return refuse("CONFLICT", "รายการนี้ถูกทิ้งไปแล้ว");
    if (youngProcessing(row)) return refuse("BUSY", "รายการนี้กำลังซิงก์ — ลองใหม่อีกครั้ง");
    const dev = await db.posDevice.findFirst({ where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, deviceCode: row.deviceId }, select: { id: true, deviceCode: true, status: true, revokedAt: true, offlineCode: true, offlineSeq: true } });
    if (!dev) return refuse("DEVICE_NOT_FOUND", "ไม่พบเครื่องขายของรายการนี้");
    // จองรายการ (REJECTED → ACCEPTED_BY_MANAGER ยังไม่มีบิล) — ทิ้งพร้อมกันไม่ได้ · ล้ม = คืนเป็น REJECTED พร้อมรหัสใหม่
    if (row.status === STATUS.REJECTED) {
      const claim = await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: sc.ctx.tenantId, status: STATUS.REJECTED }, data: { status: STATUS.ACCEPTED, resolvedByUserId: sc.actor.userId } });
      if (claim.count !== 1) return refuse("CONFLICT", "รายการนี้เปลี่ยนสถานะระหว่างทำรายการ — โหลดใหม่");
    }
    const p = isRecord(row.payload) ? row.payload : {};
    const e: Env = { db, ctx: sc.ctx, actor: sc.actor, dev, now: Date.now() };
    const v = await decide(
      e,
      {
        offlineRef: row.offlineRef,
        idempotencyKey: row.idempotencyKey,
        soldAt: typeof p.soldAt === "string" ? p.soldAt : row.soldAt.toISOString(),
        shiftId: typeof p.shiftId === "string" && p.shiftId ? p.shiftId : null, // POS P3.4 ▸ fix1 N2: กะที่บันทึก (ผูกเมื่อยังเปิด) ◂
        staffToken: null,
        sellerUserId: null,
        snapshotHash: typeof p.snapshotHash === "string" ? p.snapshotHash : "",
        sale: isRecord(p.sale) ? p.sale : {},
      },
      (p.evidence as Evidence) ?? null,
      {
        actor: sc.actor,
        verifiedSellerId: strOf(p.verifiedSellerUserId, p.syncedByUserId), // POS P3.4 ▸ fix1 N1: ไม่ใช้ sellerUserId/คำอ้างในโทเคน ◂
        // POS P3.4 ▸ fix2 N7: ไม่มีโทเคนที่ผ่าน (verified = ผู้ซิงก์) + มีผู้ขายที่อ้างคนอื่น ⇒ ใช้เพดานต่ำกว่า ◂
        capSellerId: (() => {
          const v = strOf(p.verifiedSellerUserId, p.syncedByUserId);
          const cl = strOf(p.claimedSellerUserId, p.sellerUserId, p.staffClaimUserId);
          return cl && v && cl !== v && v === strOf(p.syncedByUserId) ? cl : null;
        })(),
      },
    );
    if (v.kind === "transient") {
      await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: sc.ctx.tenantId, status: STATUS.ACCEPTED, saleId: null }, data: { status: STATUS.REJECTED, resolvedByUserId: null } });
      return refuse("BUSY", "ระบบไม่ว่างชั่วคราว — ลองใหม่อีกครั้ง");
    }
    const r = await settle(e, row, v, { managerId: sc.actor.userId });
    if (r.status === "REJECTED") return refuse(r.reason ?? "VALIDATION", "รับบิลนี้ไม่ได้ — ตรวจเหตุผลแล้วทิ้งรายการและขายใหม่ออนไลน์");
    return { ok: true, saleId: r.saleId!, receiptNo: r.receiptNo ?? null, ...(r.status === "DUPLICATE" ? { duplicated: true } : {}) };
  });
}

/**
 * ผู้จัดการทิ้งบิลที่ถูกปฏิเสธ (R10): เหตุผล ≥ 5 ตัว · idempotent (ทิ้งซ้ำ = duplicated) · หลังรับแล้ว = CONFLICT ·
 * audit pos.sale.offline_discarded {reason, previousReason} (CD-7) · ไม่มีบิล/ไม่แตะเงิน (เงินในลิ้นชักต่างจาก Z = ผู้จัดการบันทึกเอง)
 */
export async function discardOfflineSale(ctx: OfflineCtx, actor: RegisterActor, input: { id: string; reason: string }, client?: Db): Promise<OfflineDiscardResult> {
  return guarded("discardOfflineSale", async (): Promise<OfflineDiscardResult> => {
    const db = client ?? prisma;
    const sc = await managerScope(db, ctx, actor);
    if ("ok" in sc) return sc;
    const text = isRecord(input) && typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...text].length < DISCARD_REASON_MIN || text.length > DISCARD_REASON_MAX) return refuse("VALIDATION", `ใส่เหตุผลอย่างน้อย ${DISCARD_REASON_MIN} ตัวอักษร`);
    const row = await managerRow(db, sc.ctx, isRecord(input) ? input.id : undefined);
    if (!row) return refuse("NOT_FOUND", "ไม่พบรายการนี้");
    if (row.status === STATUS.DISCARDED) return { ok: true, duplicated: true };
    if (row.status !== STATUS.REJECTED) return refuse("CONFLICT", "รายการนี้ถูกรับเป็นบิลแล้ว — ทิ้งไม่ได้");
    if (youngProcessing(row)) return refuse("BUSY", "รายการนี้กำลังซิงก์ — ลองใหม่อีกครั้ง");
    // POS P3.4 ▸ fix1 N5 = F4 (CD-P34g): บิลของคีย์นี้ commit แล้ว (ล้มหลัง createSale ก่อนปรับแถว) ⇒ ห้ามทิ้ง · ปรับแถวเป็น SYNCED + audit ซิงก์ (ครั้งเดียว) ◂
    const committed = await db.posSale.findFirst({ where: { tenantId: sc.ctx.tenantId, unitId: sc.ctx.unitId, idempotencyKey: `${REG_KEY_PREFIX}${row.idempotencyKey}` }, select: { id: true, offlineRef: true, syncedAt: true, soldByUserId: true } });
    if (committed && committed.offlineRef === row.offlineRef) { // POS P3.4 ▸ fix2 N9: เฉพาะบิลออฟไลน์ของรายการนี้ — คีย์ชนบิลออนไลน์อื่น = ทิ้งได้ตามปกติ ◂
      const w = await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: sc.ctx.tenantId, status: STATUS.REJECTED }, data: { status: STATUS.SYNCED, saleId: committed.id, reason: null } });
      const had = await db.auditLog.count({ where: { tenantId: sc.ctx.tenantId, action: AUDIT_SYNCED, targetId: committed.id } });
      if (w.count === 1 && had === 0) {
        await writeAudit({
          tenantId: sc.ctx.tenantId,
          actorId: sc.actor.userId,
          action: AUDIT_SYNCED,
          targetType: "PosSale",
          targetId: committed.id,
          after: { offlineRef: row.offlineRef, offlineSaleId: row.id, deviceId: row.deviceId, soldAt: row.soldAt.toISOString(), syncedAt: (committed.syncedAt ?? new Date()).toISOString(), sellerUserId: committed.soldByUserId, via: "recovered" },
        });
      }
      return refuse("CONFLICT", "บิลของรายการนี้บันทึกแล้ว — ปรับเป็นซิงก์แล้ว ไม่ต้องทิ้ง");
    }
    const u = await db.posOfflineSale.updateMany({ where: { id: row.id, tenantId: sc.ctx.tenantId, status: STATUS.REJECTED }, data: { status: STATUS.DISCARDED, reason: text, resolvedByUserId: sc.actor.userId } });
    if (u.count !== 1) {
      const now = await managerRow(db, sc.ctx, row.id);
      return now?.status === STATUS.DISCARDED ? { ok: true, duplicated: true } : refuse("CONFLICT", "รายการนี้เปลี่ยนสถานะระหว่างทำรายการ — โหลดใหม่");
    }
    await writeAudit({
      tenantId: sc.ctx.tenantId,
      actorId: sc.actor.userId,
      action: AUDIT_DISCARDED,
      targetType: "PosOfflineSale",
      targetId: row.id,
      before: { status: row.status, reason: row.reason },
      after: { reason: text, previousReason: row.reason, offlineRef: row.offlineRef, deviceId: row.deviceId, soldAt: row.soldAt.toISOString() },
    });
    return { ok: true };
  });
}
