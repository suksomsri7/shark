// display.ts — จอลูกค้า (จอที่ 2 · POS P2.10 · บรีฟ §2 R1–R8 · §3 · §10 มติ 1–13 · ledger/pos-briefs/pos-brief-P2.10.md)
// สัญญา = scripts/qc-pos-p2.10.mts (ST1 ST2 PA1–PA3 DS1 DS2 CT1 CT2 PY1 PY2 Z1) · ตารางชื่อ ledger/wo-notes/pos-P2.10-oracle.md
//
// 🔴 ผู้เขียนเดียวของตาราง PosCustomerDisplay · ไม่ใช่ไฟล์ "use server" (action อยู่ที่ display-actions.ts · หน้า /d มี action ของตัวเอง)
// 🔴 ทุกฟังก์ชัน "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw · ctx = RegisterCtx
// 🔴 จับคู่ (มติ 2): รหัส 8 ตัว Crockford อายุ 10 นาที → token 32 ไบต์ (คุกกี้ httpOnly ของหน้า /d) · เก็บแต่ sha256 · pairFailCount ≥ 5 = ล็อกจนเปิดรหัสใหม่ ·
//    เพดาน 10 ครั้ง/นาที/IP (core/rate-limit-db) · เปิดซ้ำตอนจับคู่อยู่ = token เดิมใช้ได้จนกว่ารหัสใหม่ถูกแลก (มติ 13.7)
// 🔴 ภาพบิล (มติ 1 9): หน้าขาย publish → UPDATE แถวเดียว WHERE stateSeq < $seq (ช้ากว่า/ซ้ำ = ไม่เขียน) · จออ่านด้วย token (ไม่มี session ·
//    ไม่มีตัวจำกัดอัตรา/audit/outbox ต่อโพล · lastPolledAt ทุก 30 วิ) · changed:false เฉพาะเมื่อภาพที่ "คำนวณแล้ว" เท่าเดิม
//    (seq + phase หลังหมดอายุ + สถานะใบขอรับเงิน + ค่าตั้งจอ · มติ 13.2)
// 🔴 ของที่เกี่ยวกับเงินเซิร์ฟเวอร์สร้างเอง (มติ 6): QR = ใบขอรับเงินของเครื่องนี้ (สาขาเดียวกัน · deviceId = รหัสเครื่อง) หรือ QR นิ่งของสาขายอดรอบนี้ ·
//    ลิงก์ใบเสร็จ = บิลในกะของเครื่องนี้ อายุ ≤ 15 นาที + qrEReceipt · qr/receiptUrl ที่ client ส่ง = DISPLAY_STATE_INVALID
// 🔴 PDPA (มติ 3): ชื่อต้น ≤ 30 ตัว + ระดับเสมอ · แต้ม (สะสม/ที่ได้) ตาม showPoints · ไม่มีเบอร์/รหัสสมาชิก/นามสกุล/เลขบัตร/เลขมัดจำ
// 🔴 ไม่มี outbox/event (ภาพชั่วคราว) · audit = pos.display.enable|pair|revoke|settings เท่านั้น · ไม่ import member/account (ข้อมูลสมาชิกมากับภาพของหน้าขาย)
import { createHash, randomBytes, randomInt } from "node:crypto";
import { Prisma, type PosCustomerDisplay, type PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { prisma } from "./db";
import { POS_DEVICE_CODE_RE } from "./device-shared";
import {
  DISPLAY_CROCKFORD,
  DISPLAY_IDLE_TEXT_MAX,
  DISPLAY_ONLINE_MS,
  DISPLAY_PAIR_CODE_LEN,
  DISPLAY_PAIR_CODE_TTL_MS,
  DISPLAY_PAIR_FAIL_LIMIT,
  DISPLAY_POLL_WRITE_MS,
  DISPLAY_SEQ_MAX,
  MAX_DISPLAY_STATE_BYTES,
  displayEffectivePhase,
  displayJsonBytes,
  displayStampView,
  displayStateSchema,
  nextPollMs,
  normalizePairCode,
  type CustomerDisplayStatusResult,
  type CustomerDisplayStatusView,
  type DisplayLocale,
  type DisplayPhase,
  type DisplayQr,
  type DisplayRefusal,
  type DisplayRefusalCode,
  type DisplayState,
  type DisplayView,
  type EnableCustomerDisplayResult,
  type PairCustomerDisplayResult,
  type PublishDisplayStateResult,
  type ReadCustomerDisplayResult,
} from "./display-shared";
import { promptpayIdForUnit } from "./payment-intent-shared";
import { eReceiptUrl, receiptShopHeader } from "./receipt";
import { receiptSettingsOf } from "./receipt-settings";
import type { RegisterActor, RegisterCtx } from "./register-shared";
import { posReceiptLocale } from "./settings-shared";

type Db = PrismaClient | Prisma.TransactionClient;

const MSG: Record<DisplayRefusalCode, string> = {
  DISPLAY_NOT_PAIRED: "จอนี้ยังไม่ได้จับคู่กับเครื่องขาย หรือถูกยกเลิกการจับคู่แล้ว — ใส่รหัสจับคู่ใหม่",
  PAIR_CODE_INVALID: "รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่จากหน้าตั้งค่าเครื่อง",
  DEVICE_NOT_REGISTERED: "เครื่องนี้ยังไม่ได้ลงทะเบียนในสาขานี้ — ลงทะเบียนเครื่องก่อนเปิดจอลูกค้า",
  DISPLAY_STATE_INVALID: "ข้อมูลที่ส่งให้จอลูกค้าไม่ถูกต้อง — ยังไม่ได้แสดงอะไร",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  NOT_FOUND: "ไม่พบจอลูกค้าของเครื่องนี้ในสาขานี้",
  RATE_LIMITED: "ลองรหัสบ่อยเกินไป — รอสักครู่แล้วลองใหม่",
  VALIDATION: "ค่าตั้งจอลูกค้าไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  INTERNAL: "ระบบจอลูกค้าขัดข้องชั่วคราว — ลองอีกครั้ง",
};
const refuse = (code: DisplayRefusalCode): DisplayRefusal => ({ ok: false, code, message: MSG[code] });
const isRefusal = (v: unknown): v is DisplayRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isUniqueViolation = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  return o?.code === "P2002" || /\b23505\b|Unique constraint/i.test(String(o?.message ?? ""));
};

async function guard<T>(name: string, body: () => Promise<T>): Promise<T | DisplayRefusal> {
  try {
    return await body();
  } catch (e) {
    console.error(`[pos/display] ${name} INTERNAL`, e);
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

// ═══════════ ขอบเขต + สิทธิ์ (แบบ device.ts) ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; actor: RegisterActor };
/** ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้ / สาขาไม่ผูก / เข้าสาขาไม่ได้ = NOT_FOUND · actor ผิดรูป / ไม่มีสิทธิ์ = PERMISSION_DENIED */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown, action: "pos.device.manage" | "pos.sale.create"): Promise<Scope | DisplayRefusal> {
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
  if (!evaluate(actor, { module: "pos", action, unitId })) return refuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId, actor };
}

/** จอ ACTIVE ของเครื่องนี้ในขอบเขต (ร้าน + ระบบ + สาขา) */
const activeRowOf = (db: Db, s: Scope, deviceId: string) =>
  db.posCustomerDisplay.findFirst({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, deviceId, status: "ACTIVE" } });

function statusView(row: PosCustomerDisplay | null, now = Date.now()): CustomerDisplayStatusView {
  const paired = !!row?.tokenHash;
  const pending = !!row?.pairCodeHash && !!row.pairCodeExpiresAt && row.pairCodeExpiresAt.getTime() > now;
  return {
    enabled: !!row,
    paired,
    pendingCodeExpiresAt: pending ? iso(row!.pairCodeExpiresAt) : null,
    pairLocked: pending && row!.pairFailCount >= DISPLAY_PAIR_FAIL_LIMIT,
    online: paired && !!row!.lastPolledAt && now - row!.lastPolledAt.getTime() <= DISPLAY_ONLINE_MS,
    lastPolledAt: iso(row?.lastPolledAt),
    showPoints: row?.showPoints ?? true,
    idleText: row?.idleText ?? null,
    locale: row?.locale === "th" || row?.locale === "en" ? row.locale : null,
  };
}

function newPairCode(): string {
  let s = "";
  for (let i = 0; i < DISPLAY_PAIR_CODE_LEN; i++) s += DISPLAY_CROCKFORD[randomInt(DISPLAY_CROCKFORD.length)];
  return s;
}

// ═══════════ จับคู่ (R2) ═══════════

/**
 * เปิดจอลูกค้าให้เครื่องขาย (pos.device.manage) — เครื่องต้องเป็น PosDevice ACTIVE ของสาขานี้ (id หรือ deviceCode) ไม่งั้น DEVICE_NOT_REGISTERED ·
 * สร้างหรือใช้แถว ACTIVE เดิม · ทุกครั้งออกรหัสใหม่ 8 ตัว (รหัสเก่าตาย) อายุ 10 นาที + ล้างตัวนับผิด · เก็บแต่ hash · token เดิม (ถ้ามี) ยังใช้ได้
 */
export async function enableCustomerDisplay(ctx: RegisterCtx, actor: RegisterActor, input: { deviceId: string } | { deviceCode: string }, client?: Db): Promise<EnableCustomerDisplayResult> {
  return guard("enableCustomerDisplay", async (): Promise<EnableCustomerDisplayResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceId", "deviceCode"])) return refuse("DEVICE_NOT_REGISTERED");
    const raw = input as Record<string, unknown>;
    const byId = isId(raw.deviceId) ? raw.deviceId : null;
    const byCode = typeof raw.deviceCode === "string" && POS_DEVICE_CODE_RE.test(raw.deviceCode) ? raw.deviceCode : null;
    if (!byId === !byCode) return refuse("DEVICE_NOT_REGISTERED");
    const device = await db.posDevice.findFirst({
      where: { tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId, status: "ACTIVE", ...(byId ? { id: byId } : { deviceCode: byCode! }) },
      select: { id: true },
    });
    if (!device) return refuse("DEVICE_NOT_REGISTERED");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DISPLAY_PAIR_CODE_TTL_MS);
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newPairCode();
      const data = { pairCodeHash: sha256hex(code), pairCodeExpiresAt: expiresAt, pairFailCount: 0 };
      try {
        const cur = await activeRowOf(db, s, device.id);
        let row: PosCustomerDisplay | null;
        if (cur) {
          const n = await db.posCustomerDisplay.updateMany({ where: { id: cur.id, status: "ACTIVE" }, data });
          row = n.count === 1 ? await db.posCustomerDisplay.findUnique({ where: { id: cur.id } }) : null;
        } else {
          row = await db.posCustomerDisplay.create({
            data: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, deviceId: device.id, status: "ACTIVE", createdByUserId: s.actor.userId, ...data },
          });
        }
        if (!row) continue; // ถูกยกเลิกระหว่างทาง — รอบใหม่สร้างแถวใหม่
        await writeAudit({
          tenantId: s.tenantId,
          actorId: s.actor.userId,
          action: "pos.display.enable",
          targetType: "PosCustomerDisplay",
          targetId: row.id,
          after: { deviceId: device.id, pairCodeExpiresAt: expiresAt.toISOString(), paired: !!row.tokenHash },
        });
        return { ok: true, pairCode: code, pairCodeExpiresAt: expiresAt.toISOString(), display: statusView(row, now.getTime()) };
      } catch (e) {
        // แพ้การแข่งสร้างแถว ACTIVE (partial unique deviceId) หรือรหัสชน (partial unique pairCodeHash) ⇒ ลองใหม่ด้วยรหัสใหม่
        if (!isUniqueViolation(e)) throw e;
      }
    }
    return refuse("INTERNAL");
  });
}

/**
 * แลกรหัสจับคู่เป็น token ของจอ (ไม่มี session · หน้า /d เรียก) — เพดาน 10 ครั้ง/นาที/IP ก่อนทุกอย่าง ·
 * รหัสผิด/หมดอายุ/ใช้แล้ว/ถูกล็อก/เครื่องถูกเพิกถอน = PAIR_CODE_INVALID ข้อความเดียว · สำเร็จ = token ใหม่ (token เก่าของจอนี้ตาย) + ล้างรหัส
 */
export async function pairCustomerDisplay(input: { code: string }, meta: { ip: string | null }, client?: Db): Promise<PairCustomerDisplayResult> {
  return guard("pairCustomerDisplay", async (): Promise<PairCustomerDisplayResult> => {
    const db = client ?? prisma;
    const ip = isRecord(meta) && typeof meta.ip === "string" && meta.ip.trim() ? meta.ip.trim().slice(0, 200) : "unknown";
    const rl = await checkRateLimitDb(`pos:display:pair:${ip}`, { limit: 10, windowMs: 60_000 });
    if (!rl.ok) return refuse("RATE_LIMITED");
    const code = normalizePairCode(isRecord(input) ? input.code : null);
    if (!code) return refuse("PAIR_CODE_INVALID");
    const hash = sha256hex(code);
    const now = new Date();
    const row = await db.posCustomerDisplay.findFirst({ where: { pairCodeHash: hash, status: "ACTIVE" } });
    if (!row || !row.pairCodeExpiresAt || row.pairCodeExpiresAt <= now || row.pairFailCount >= DISPLAY_PAIR_FAIL_LIMIT) return refuse("PAIR_CODE_INVALID");
    const device = await db.posDevice.findFirst({ where: { id: row.deviceId, tenantId: row.tenantId, unitId: row.unitId, status: "ACTIVE" }, select: { id: true } });
    if (!device) return refuse("PAIR_CODE_INVALID");
    const token = randomBytes(32).toString("base64url");
    const n = await db.posCustomerDisplay.updateMany({
      where: { id: row.id, status: "ACTIVE", pairCodeHash: hash, pairCodeExpiresAt: { gt: now }, pairFailCount: { lt: DISPLAY_PAIR_FAIL_LIMIT } },
      data: { tokenHash: sha256hex(token), pairCodeHash: null, pairCodeExpiresAt: null, pairFailCount: 0 },
    });
    if (n.count !== 1) return refuse("PAIR_CODE_INVALID"); // แพ้การแข่งแลกรหัสเดียวกัน
    await writeAudit({ tenantId: row.tenantId, actorId: null, actorType: "SYSTEM", action: "pos.display.pair", targetType: "PosCustomerDisplay", targetId: row.id, after: { deviceId: row.deviceId } });
    return { ok: true, token, displayId: row.id };
  });
}

/** ยกเลิกการจับคู่ (pos.device.manage) — ACTIVE → REVOKED + ล้าง token/รหัส · ไม่อยู่ในขอบเขต/ไม่มีจอ = NOT_FOUND ข้อความเดียว */
export async function revokeCustomerDisplay(ctx: RegisterCtx, actor: RegisterActor, input: { deviceId: string }, client?: Db): Promise<CustomerDisplayStatusResult> {
  return guard("revokeCustomerDisplay", async (): Promise<CustomerDisplayStatusResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceId"]) || !isId(input.deviceId)) return refuse("NOT_FOUND");
    const row = await activeRowOf(db, s, input.deviceId);
    if (!row) return refuse("NOT_FOUND");
    const now = new Date();
    const n = await db.posCustomerDisplay.updateMany({
      where: { id: row.id, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now, tokenHash: null, pairCodeHash: null, pairCodeExpiresAt: null },
    });
    if (n.count === 1) {
      await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.display.revoke", targetType: "PosCustomerDisplay", targetId: row.id, before: { paired: !!row.tokenHash }, after: { status: "REVOKED", deviceId: row.deviceId } });
    }
    return { ok: true, display: statusView(null) };
  });
}

/** ค่าตั้งของจอ (pos.device.manage) — showPoints · idleText (≤ 80 ตัว · ว่าง/null = ค่าปริยาย) · locale th|en|null · ผิด = VALIDATION แถวไม่เปลี่ยน */
export async function updateCustomerDisplaySettings(
  ctx: RegisterCtx,
  actor: RegisterActor,
  input: { deviceId: string; showPoints?: boolean; idleText?: string | null; locale?: DisplayLocale | null },
  client?: Db,
): Promise<CustomerDisplayStatusResult> {
  return guard("updateCustomerDisplaySettings", async (): Promise<CustomerDisplayStatusResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceId", "showPoints", "idleText", "locale"]) || !isId(input.deviceId)) return refuse("VALIDATION");
    const data: { showPoints?: boolean; idleText?: string | null; locale?: string | null } = {};
    if (input.showPoints !== undefined) {
      if (typeof input.showPoints !== "boolean") return refuse("VALIDATION");
      data.showPoints = input.showPoints;
    }
    if (input.idleText !== undefined) {
      if (input.idleText === null) data.idleText = null;
      else {
        if (typeof input.idleText !== "string") return refuse("VALIDATION");
        const t = input.idleText.trim();
        if ([...t].length > DISPLAY_IDLE_TEXT_MAX || /[\u0000-\u001F\u007F]/.test(t)) return refuse("VALIDATION");
        data.idleText = t || null;
      }
    }
    if (input.locale !== undefined) {
      if (input.locale !== null && input.locale !== "th" && input.locale !== "en") return refuse("VALIDATION");
      data.locale = input.locale;
    }
    const row = await activeRowOf(db, s, input.deviceId);
    if (!row) return refuse("NOT_FOUND");
    if (Object.keys(data).length === 0) return { ok: true, display: statusView(row) };
    const n = await db.posCustomerDisplay.updateMany({ where: { id: row.id, status: "ACTIVE" }, data });
    if (n.count !== 1) return refuse("NOT_FOUND");
    const after = await db.posCustomerDisplay.findUnique({ where: { id: row.id } });
    await writeAudit({
      tenantId: s.tenantId,
      actorId: s.actor.userId,
      action: "pos.display.settings",
      targetType: "PosCustomerDisplay",
      targetId: row.id,
      before: { showPoints: row.showPoints, idleText: row.idleText, locale: row.locale },
      after: data,
    });
    return { ok: true, display: statusView(after) };
  });
}

/** สถานะจอของเครื่อง (pos.device.manage) — ไม่มีรหัส/token/hash · เครื่องนอกขอบเขต = NOT_FOUND · ยังไม่เปิด = enabled:false */
export async function customerDisplayStatus(ctx: RegisterCtx, actor: RegisterActor, input: { deviceId: string }, client?: Db): Promise<CustomerDisplayStatusResult> {
  return guard("customerDisplayStatus", async (): Promise<CustomerDisplayStatusResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.device.manage");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceId"]) || !isId(input.deviceId)) return refuse("NOT_FOUND");
    const dev = await db.posDevice.findFirst({ where: { id: input.deviceId, tenantId: s.tenantId, unitId: s.unitId, systemId: s.systemId }, select: { id: true } });
    if (!dev) return refuse("NOT_FOUND");
    return { ok: true, display: statusView(await activeRowOf(db, s, dev.id)) };
  });
}

// ═══════════ ภาพบิล (R3) ═══════════

/**
 * หน้าขายส่งภาพบิลให้จอ (pos.sale.create) — ตรวจ seq (จำนวนเต็ม 0..int4) + ขนาด JSON ≤ 16 KB + displayStateSchema แบบเข้ม ก่อนทุกอย่าง ·
 * รหัสเครื่อง → PosDevice ACTIVE ของสาขานี้ → จอ ACTIVE ที่จับคู่แล้ว · ไม่มี = {paired:false} (ไม่สร้างแถว) ·
 * เขียน UPDATE เดียว WHERE stateSeq < seq (ช้ากว่า/ซ้ำ/แข่งกัน = written:false) · ไม่มี audit/outbox
 */
export async function publishDisplayState(ctx: RegisterCtx, actor: RegisterActor, input: { deviceCode: string; seq: number; state: DisplayState }, client?: Db): Promise<PublishDisplayStateResult> {
  return guard("publishDisplayState", async (): Promise<PublishDisplayStateResult> => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, "pos.sale.create");
    if (isRefusal(s)) return s;
    if (!isRecord(input) || !onlyKeys(input, ["deviceCode", "seq", "state"])) return refuse("DISPLAY_STATE_INVALID");
    const seq = input.seq;
    if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0 || seq > DISPLAY_SEQ_MAX) return refuse("DISPLAY_STATE_INVALID");
    if (displayJsonBytes(input.state) > MAX_DISPLAY_STATE_BYTES) return refuse("DISPLAY_STATE_INVALID");
    const parsed = displayStateSchema.safeParse(input.state);
    if (!parsed.success) return refuse("DISPLAY_STATE_INVALID");
    const code = input.deviceCode;
    if (typeof code !== "string" || !POS_DEVICE_CODE_RE.test(code)) return { ok: true, paired: false };
    const device = await db.posDevice.findUnique({ where: { unitId_deviceCode: { unitId: s.unitId, deviceCode: code } }, select: { id: true, tenantId: true, systemId: true, status: true } });
    if (!device || device.tenantId !== s.tenantId || device.systemId !== s.systemId || device.status !== "ACTIVE") return { ok: true, paired: false };
    const row = await db.posCustomerDisplay.findFirst({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, deviceId: device.id, status: "ACTIVE", tokenHash: { not: null } },
      select: { id: true },
    });
    if (!row) return { ok: true, paired: false };
    const n = await db.posCustomerDisplay.updateMany({
      where: { id: row.id, status: "ACTIVE", stateSeq: { lt: seq } },
      data: { state: parsed.data as unknown as Prisma.InputJsonValue, stateSeq: seq, stateAt: new Date() },
    });
    return { ok: true, paired: true, seq, written: n.count === 1 };
  });
}

// ═══════════ อ่านของจอ (R4) ═══════════
type ReadRow = PosCustomerDisplay & { deviceCode: string; deviceName: string };

/** ภาพที่เก็บ (ผ่านตัวตรวจซ้ำ — แถวที่พัง = ไม่มีภาพ) */
function storedState(v: unknown): DisplayState | null {
  if (v === null || v === undefined) return null;
  const p = displayStateSchema.safeParse(v);
  return p.success ? p.data : null;
}
/** ส่วนของค่าตั้งที่ทำให้ภาพเปลี่ยน (เข้ารุ่นของภาพ) */
const settingsKey = (r: PosCustomerDisplay) => sha256hex(`${r.showPoints ? 1 : 0}|${r.locale ?? ""}|${r.idleText ?? ""}`).slice(0, 8);

/** QR ของช่องจ่าย (มติ 6 · 13.4): ใบของเครื่องนี้ (สาขาเดียวกัน) → QR ของใบ (PENDING) / สถานะ (PAID…) · อื่น ๆ: พร้อมเพย์ = QR นิ่งของสาขา ยอดรอบนี้ · วิธีอื่น = null */
async function payQr(db: Db, r: ReadRow, pay: NonNullable<DisplayState["pay"]>, settings: unknown, intentRow: IntentRow | null): Promise<DisplayQr | null> {
  if (intentRow && (intentRow.status === "PENDING" || intentRow.status === "PAID" || intentRow.status === "CONSUMED")) {
    return { payload: intentRow.status === "PENDING" ? intentRow.qrPayload : null, amountSatang: intentRow.amountSatang, status: intentRow.status, intentId: intentRow.id };
  }
  if (pay.method !== "PROMPTPAY" || pay.roundSatang <= 0) return null;
  const unitPp = promptpayIdForUnit(settings, r.unitId);
  const ppId = unitPp ?? ((await db.paymentProfile.findUnique({ where: { tenantId: r.tenantId }, select: { promptpayId: true } }))?.promptpayId ?? "").trim();
  if (!ppId) return null;
  try {
    return { payload: promptpayPayload({ id: ppId, amountSatang: pay.roundSatang }), amountSatang: pay.roundSatang, status: "STATIC", intentId: null };
  } catch {
    return null;
  }
}

/** ลิงก์ใบเสร็จ (มติ 6 8): บิลของสาขานี้ อายุ ≤ 15 นาที ในกะของเครื่องนี้ + qrEReceipt เปิด · อื่น = null */
async function doneReceiptUrl(db: Db, r: ReadRow, saleId: string | undefined, settings: unknown, now: number): Promise<string | null> {
  if (!saleId || !receiptSettingsOf(settings).qrEReceipt) return null;
  const sale = await db.posSale.findFirst({
    where: { id: saleId, tenantId: r.tenantId, systemId: r.systemId, unitId: r.unitId, createdAt: { gte: new Date(now - 15 * 60_000) } },
    select: { id: true, publicToken: true, shiftId: true },
  });
  if (!sale?.shiftId) return null;
  const shift = await db.posShift.findFirst({ where: { id: sale.shiftId, tenantId: r.tenantId, unitId: r.unitId, deviceId: r.deviceCode }, select: { id: true } });
  if (!shift) return null;
  return eReceiptUrl(db, r.tenantId, sale);
}

type IntentRow = { id: string; status: string; qrPayload: string | null; amountSatang: number };

async function buildView(db: Db, r: ReadRow, st: DisplayState | null, phase: DisplayPhase, intentRow: IntentRow | null, now: number): Promise<DisplayView> {
  const head = await receiptShopHeader(db, r.tenantId, r.systemId, r.unitId);
  const settings = head?.settings ?? null;
  const locale: DisplayLocale = r.locale === "th" || r.locale === "en" ? r.locale : posReceiptLocale(settings);
  const view: DisplayView = {
    phase,
    header: { shopName: head?.shopName ?? "-", logoUrl: head?.logoUrl ?? null, branch: head?.branchName ?? "", counter: r.deviceName },
    settings: { showPoints: r.showPoints, idleText: r.idleText, locale },
    member: null,
    lines: [],
    moreCount: 0,
    totals: null,
    stamp: null,
    pay: null,
    done: null,
  };
  if (phase === "idle" || !st) return view;
  if (st.member) {
    view.member = { firstName: st.member.firstName, tier: st.member.tier };
    if (r.showPoints && st.member.points !== undefined) view.member.points = st.member.points;
  }
  view.lines = (st.lines ?? []).map((l) => ({ qty: l.qty, name: l.name, detail: l.detail ?? null, grossSatang: l.grossSatang, discountSatang: l.discountSatang ?? 0, discountLabel: l.discountLabel ?? null }));
  view.moreCount = st.moreCount ?? 0;
  view.totals = st.totals ?? null;
  view.stamp = st.stamp && st.member ? displayStampView(st.stamp) : null;
  if (phase === "paying" && st.pay) {
    const { intentId: _i, ...pay } = st.pay;
    void _i;
    view.pay = { ...pay, qr: await payQr(db, r, st.pay, settings, intentRow) };
  }
  if (phase === "done" && st.done) {
    view.done = { receiptNo: st.done.receiptNo, receiptUrl: await doneReceiptUrl(db, r, st.done.saleId, settings, now), changeSatang: st.done.changeSatang };
    if (r.showPoints && st.done.pointsEarned !== undefined) view.done.pointsEarned = st.done.pointsEarned;
  }
  return view;
}

/** แถวของ token (จอ ACTIVE + เครื่อง ACTIVE) — อื่น = null (DISPLAY_NOT_PAIRED ข้อความเดียว) */
async function rowOfToken(db: Db, token: unknown): Promise<ReadRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return null;
  const row = await db.posCustomerDisplay.findUnique({ where: { tokenHash: sha256hex(token) } });
  if (!row || row.status !== "ACTIVE") return null;
  const dev = await db.posDevice.findFirst({ where: { id: row.deviceId, tenantId: row.tenantId, unitId: row.unitId, status: "ACTIVE" }, select: { deviceCode: true, name: true } });
  return dev ? { ...row, deviceCode: dev.deviceCode, deviceName: dev.name } : null;
}

/**
 * จออ่านภาพ (ไม่มี session · token จากคุกกี้ของหน้า /d) — token มั่ว/หมุนแล้ว/ยกเลิก/เครื่องถูกเพิกถอน = DISPLAY_NOT_PAIRED ข้อความเดียว ·
 * changed:false เมื่อรุ่นของภาพ (seq · phase หลังหมดอายุ · สถานะใบขอรับเงิน · ค่าตั้ง) เท่ากับ sinceVer — หรือ sinceSeq = stateSeq
 * และภาพยังไม่หมดอายุ ไม่มีใบขอรับเงิน (ผู้เรียกที่ไม่มี ver) · lastPolledAt เขียนไม่ถี่กว่า 30 วิ · ไม่เรียกตัวจำกัดอัตรา/audit/outbox
 */
export async function readCustomerDisplay(input: { token: string; sinceSeq?: number; sinceVer?: string }, client?: Db): Promise<ReadCustomerDisplayResult> {
  return guard("readCustomerDisplay", async (): Promise<ReadCustomerDisplayResult> => {
    const db = client ?? prisma;
    const r = isRecord(input) ? await rowOfToken(db, input.token) : null;
    if (!r) return refuse("DISPLAY_NOT_PAIRED");
    const now = Date.now();
    const st = storedState(r.state);
    const stored: DisplayPhase = st?.phase ?? "idle";
    const phase = displayEffectivePhase(stored, r.stateAt ? r.stateAt.getTime() : null, now);
    const intentId = phase === "paying" ? st?.pay?.intentId : undefined;
    const intentRow = intentId
      ? await db.posPaymentIntent.findFirst({
          where: { id: intentId, tenantId: r.tenantId, systemId: r.systemId, unitId: r.unitId, deviceId: r.deviceCode },
          select: { id: true, status: true, qrPayload: true, amountSatang: true },
        })
      : null;
    const ver = `${r.stateSeq}.${phase}.${intentRow?.status ?? "-"}.${settingsKey(r)}`;
    // lastPolledAt (ออนไลน์) — UPDATE เดียวเมื่อค่าเก่ากว่า 30 วิ (โพลซ้อนกัน = เขียนครั้งเดียว)
    await db.posCustomerDisplay.updateMany({
      where: { id: r.id, status: "ACTIVE", OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: new Date(now - DISPLAY_POLL_WRITE_MS) } }] },
      data: { lastPolledAt: new Date(now) },
    });
    const pollMs = nextPollMs(phase);
    const sinceVer = typeof input.sinceVer === "string" ? input.sinceVer : undefined;
    const sinceSeq = typeof input.sinceSeq === "number" && Number.isSafeInteger(input.sinceSeq) ? input.sinceSeq : undefined;
    const same = sinceVer !== undefined ? sinceVer === ver : sinceSeq !== undefined && sinceSeq === r.stateSeq && phase === stored && !st?.pay?.intentId;
    if (same) return { ok: true, changed: false, seq: r.stateSeq, ver, nextPollMs: pollMs };
    const view = await buildView(db, r, st, phase, intentRow, now);
    return { ok: true, changed: true, seq: r.stateSeq, ver, view, nextPollMs: pollMs };
  });
}

