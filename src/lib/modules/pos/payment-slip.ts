// payment-slip.ts — สลิปโอนที่แนบเป็นหลักฐาน (P3-SKEL R6 R7 R10 · มติ §10-2 §10-3 · CD-S4 S5 S6) — ผู้เขียนเดียวของ PosPaymentSlip
//
// เป้าหมายอย่างเดียว: (saleId + paymentId ของแถว TRANSFER/PROMPTPAY ในบิลของสาขานี้) **หรือ** intentId (ใบขอรับเงิน PROMPTPAY_STATIC ที่ยัง PENDING)
// ไฟล์: jpeg/png/webp (ตรวจไบต์หัวไฟล์ด้วย) ≤ 5 MB · ≤ 3 ใบต่อแถวชำระ/ใบขอรับเงิน · เก็บแบบ **ส่วนตัว** ผ่าน storage.uploadFile(visibility "private")
//   = path t/<ร้าน>/private/<สุ่ม 40 hex> + cdnUrl ค่าหมาย private:// (รูปแบบเดียวกับ CRM C0.4 — ไม่มี URL ถาวรใน DTO/DB/log)
// สิทธิ์แนบ: pos.sale.create ที่สาขา ภายใน 24 ชม. จาก PosSale.paidAt (ใบขอรับเงิน: จาก createdAt) · หลังนั้นต้อง pos.sale.manage
// ยืนยัน/ปฏิเสธ: pos.shift.manage (ผู้จัดการ) และ **ไม่ใช่ผู้อัปเอง** (SLIP_SELF_CONFIRM) — เจ้าของร้าน (OWNER) ยกเว้น · audit ครั้งเดียวต่อสลิป
// 🔴 ไม่มีผลเงิน: บิล/แถวชำระ/ใบขอรับเงิน/สมุดรายวันไม่ถูกแตะ — ใบขอรับเงินแบบ static ผู้จัดการยังยืนยันเงินเข้าด้วย confirmPaymentIntentManual เอง
// อายุเก็บ (W19): purgeAfter = createdAt + settings.pos.payment.slipRetentionDays (ค่าปริยาย 1,825 วัน · ตัดขั้นต่ำ 90) ·
//   purgeExpiredSlips (งานรายชั่วโมง pos.slip.purge) ลบไฟล์ (deleteFileAsset) แล้วตั้ง fileId = null — แถวคงไว้เป็นหลักฐาน (สถานะเดิม)
// ลิงก์ดูไฟล์: slipViewerUrl หลังตรวจสิทธิ์ (pos.sale.read ที่สาขา) = /api/files/<id>?exp&sig ผูกผู้ดู STAFF:<userId> อายุ ≤ 300 วินาที
// คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
import { evaluate } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { deleteFileAsset, privateFileUrl, storageEnabled, uploadFile, type DeleteDeps, type UploadDeps } from "@/lib/storage/service";
import { posMembership } from "./access";
import { prisma } from "./db";

export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const SLIP_MAX_PER_TARGET = 3;
export const SLIP_ATTACH_WINDOW_MS = 24 * 3_600_000;
export const SLIP_RETENTION_DEFAULT_DAYS = 1825;
export const SLIP_RETENTION_MIN_DAYS = 90;
export const SLIP_RETENTION_MAX_DAYS = 3650;
export const SLIP_VIEW_TTL_SEC = 300;
const DAY_MS = 86_400_000;
const PURGE_BATCH = 200;

export type SlipStatus = "UPLOADED" | "CONFIRMED" | "REJECTED";
export type SlipCode = "NOT_FOUND" | "SALE_NOT_FOUND" | "VALIDATION" | "PERMISSION_DENIED" | "SLIP_SELF_CONFIRM" | "SLIP_DUPLICATE" | "SLIP_INVALID_STATE" | "STORAGE_NOT_CONFIGURED" | "UPLOAD_FAILED" | "FILE_PURGED" | "UNKNOWN";
export type SlipRefusal = { ok: false; code: SlipCode; message: string; messageKey: string };
export type SlipView = {
  id: string;
  status: SlipStatus;
  saleId: string | null;
  paymentId: string | null;
  intentId: string | null;
  transRef: string | null;
  amountSatang: number | null;
  note: string | null;
  verifiedVia: string | null;
  hasFile: boolean;
  createdAt: string;
  confirmedAt: string | null;
  purgeAfter: string;
};
export type SlipResult = { ok: true; slip: SlipView; replayed?: boolean } | SlipRefusal;
export type SlipCtx = { tenantId: string; systemId: string; unitId: string };
export type SlipActor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };
export type SlipDeps = UploadDeps & { now?: Date };

const MSG: Record<SlipCode, string> = {
  NOT_FOUND: "ไม่พบสลิปนี้",
  SALE_NOT_FOUND: "ไม่พบบิล/รายการรับเงินนี้ในสาขานี้",
  VALIDATION: "ข้อมูลสลิปไม่ถูกต้อง",
  PERMISSION_DENIED: "ไม่มีสิทธิ์ทำรายการนี้",
  SLIP_SELF_CONFIRM: "ผู้แนบสลิปยืนยันสลิปของตัวเองไม่ได้ — ให้ผู้จัดการอีกคนยืนยัน",
  SLIP_DUPLICATE: "เลขอ้างอิงสลิปนี้ถูกใช้ไปแล้วในร้าน",
  SLIP_INVALID_STATE: "สลิปนี้ถูกตัดสินไปแล้ว",
  STORAGE_NOT_CONFIGURED: "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — แนบสลิปไม่ได้ (ติดต่อผู้ดูแลระบบ)",
  UPLOAD_FAILED: "อัปโหลดสลิปไม่สำเร็จ — ลองอีกครั้ง",
  FILE_PURGED: "ไฟล์สลิปถูกลบตามอายุเก็บแล้ว (คงบันทึกไว้)",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const camel = (c: string) => c.toLowerCase().replace(/_([a-z0-9])/g, (_, x: string) => x.toUpperCase());
const refuse = (code: SlipCode, message?: string): SlipRefusal => ({ ok: false, code, message: message ?? MSG[code], messageKey: `platform.slip.errors.${camel(code)}` });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const absent = (v: unknown) => v === undefined || v === null;
const ATTACH_KEYS = new Set(["saleId", "paymentId", "intentId", "file", "idempotencyKey", "transRef", "amountSatang", "note"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function membershipOf(actor: unknown) {
  return isRecord(actor) && typeof actor.role === "string" && typeof actor.userId === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
}
function ctxOf(ctx: unknown): SlipCtx | null {
  return isRecord(ctx) && isId(ctx.tenantId) && isId(ctx.systemId) && isId(ctx.unitId) ? { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId } : null;
}
const can = (m: ReturnType<typeof membershipOf>, action: string, unitId: string) => !!m && evaluate(m, { module: "pos", action, unitId });

/** ไบต์หัวไฟล์ตรงชนิดที่อ้างไหม (กันไฟล์อื่นปลอมชนิด) */
function magicOk(type: string, b: Uint8Array): boolean {
  if (type === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === "image/webp") return b.length > 12 && String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) === "RIFF" && String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!) === "WEBP";
  return false;
}

/** อายุเก็บสลิป (วัน) ของระบบ POS — ไม่ตั้ง/ผิดรูป = 1,825 · ต่ำกว่า 90 ตัดเป็น 90 (CD-S6) · สูงสุด 3,650 */
export function slipRetentionDaysOf(settings: unknown): number {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : {};
  const pay = isRecord(pos.payment) ? pos.payment : {};
  const raw = pay.slipRetentionDays;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return SLIP_RETENTION_DEFAULT_DAYS;
  return Math.min(SLIP_RETENTION_MAX_DAYS, Math.max(SLIP_RETENTION_MIN_DAYS, Math.round(raw)));
}

/** อายุเก็บที่เจ้าของ "ตั้งไว้จริง" (fix1 H4) — ไม่ได้ตั้ง/ผิดรูป = null (ใช้ purgeAfter ตอนแนบ) · ตั้งแล้ว = ตัด 90–3,650 */
export function explicitSlipRetentionDays(settings: unknown): number | null {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : {};
  const pay = isRecord(pos.payment) ? pos.payment : {};
  return typeof pay.slipRetentionDays === "number" && Number.isFinite(pay.slipRetentionDays) ? slipRetentionDaysOf(settings) : null;
}

type SlipRow = {
  id: string;
  status: string;
  saleId: string | null;
  paymentId: string | null;
  intentId: string | null;
  transRef: string | null;
  amountSatang: number | null;
  note: string | null;
  verifiedVia: string | null;
  fileId: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  purgeAfter: Date;
};
const SLIP_SELECT = { id: true, status: true, saleId: true, paymentId: true, intentId: true, transRef: true, amountSatang: true, note: true, verifiedVia: true, fileId: true, createdAt: true, confirmedAt: true, purgeAfter: true } as const;
const viewOf = (r: SlipRow): SlipView => ({
  id: r.id,
  status: r.status as SlipStatus,
  saleId: r.saleId,
  paymentId: r.paymentId,
  intentId: r.intentId,
  transRef: r.transRef,
  amountSatang: r.amountSatang,
  note: r.note,
  verifiedVia: r.verifiedVia,
  hasFile: !!r.fileId,
  createdAt: r.createdAt.toISOString(),
  confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
  purgeAfter: r.purgeAfter.toISOString(),
});
const isUniqueViolation = (e: unknown) => isRecord(e) && e.code === "P2002";

/** แนบสลิป (หลักฐาน) — ไม่มีผลเงิน · คีย์เดิม = สลิปเดิม (ไม่อัปซ้ำ · พร้อมกัน 2 คำขอได้ใบเดียว) */
export async function attachSlip(ctx: SlipCtx, actor: SlipActor, input: unknown, deps?: SlipDeps): Promise<SlipResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    // ── รูปข้อมูล (ไม่มี I/O) ──
    if (!isRecord(input) || Object.keys(input).some((k) => !ATTACH_KEYS.has(k))) return refuse("VALIDATION", "มีช่องข้อมูลที่ไม่รู้จัก");
    const viaPayment = !absent(input.paymentId);
    const viaIntent = !absent(input.intentId);
    if (viaPayment === viaIntent) return refuse("VALIDATION", "ต้องระบุเป้าหมายอย่างเดียว: แถวชำระของบิล หรือใบขอรับเงิน");
    if (viaPayment && (!isId(input.saleId) || !isId(input.paymentId))) return refuse("VALIDATION", "ต้องระบุบิลและแถวชำระ");
    if (viaIntent && (!isId(input.intentId) || !absent(input.saleId))) return refuse("VALIDATION", "สลิปของใบขอรับเงินไม่ต้องระบุบิล");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!key || key.length > 120) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    const f = input.file;
    if (!isRecord(f) || typeof f.contentType !== "string" || !(f.bytes instanceof Uint8Array)) return refuse("VALIDATION", "ไม่มีไฟล์สลิป");
    const contentType = f.contentType.split(";")[0]!.trim().toLowerCase();
    if (!EXT[contentType]) return refuse("VALIDATION", "รับเฉพาะรูป JPEG · PNG · WebP");
    const bytes = f.bytes;
    if (bytes.length === 0 || bytes.length > SLIP_MAX_BYTES) return refuse("VALIDATION", "ไฟล์สลิปต้องไม่เกิน 5 MB");
    if (!magicOk(contentType, bytes)) return refuse("VALIDATION", "ไฟล์ไม่ใช่รูปชนิดที่ระบุ");
    const transRef = absent(input.transRef) ? null : typeof input.transRef === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(input.transRef.trim()) ? input.transRef.trim() : undefined;
    if (transRef === undefined) return refuse("VALIDATION", "เลขอ้างอิงสลิปไม่ถูกต้อง");
    const amountSatang = absent(input.amountSatang) ? null : typeof input.amountSatang === "number" && Number.isSafeInteger(input.amountSatang) && input.amountSatang >= 0 ? input.amountSatang : undefined;
    if (amountSatang === undefined) return refuse("VALIDATION", "ยอดในสลิปต้องเป็นสตางค์จำนวนเต็ม");
    const note = absent(input.note) ? null : typeof input.note === "string" && input.note.trim().length <= 200 ? input.note.trim() || null : undefined;
    if (note === undefined) return refuse("VALIDATION", "หมายเหตุยาวเกิน 200 ตัวอักษร");
    // ── สิทธิ์พื้นฐาน ──
    const m = membershipOf(actor);
    const userId = (actor as SlipActor).userId;
    if (!can(m, "pos.sale.create", c.unitId) && !can(m, "pos.sale.manage", c.unitId)) return refuse("PERMISSION_DENIED");
    // ── เป้าหมาย ──
    let since: Date;
    let target: { saleId: string | null; paymentId: string | null; intentId: string | null };
    if (viaPayment) {
      const sale = await prisma.posSale.findFirst({ where: { id: input.saleId as string, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, docType: "SALE" }, select: { id: true, status: true, paidAt: true, createdAt: true } });
      if (!sale) return refuse("SALE_NOT_FOUND");
      if (sale.status === "VOIDED") return refuse("VALIDATION", "บิลนี้ถูกยกเลิกแล้ว");
      const pay = await prisma.posPayment.findFirst({ where: { id: input.paymentId as string, saleId: sale.id, tenantId: c.tenantId }, select: { id: true, type: true } });
      if (!pay) return refuse("VALIDATION", "ไม่พบแถวชำระนี้ในบิล");
      if (pay.type !== "TRANSFER" && pay.type !== "PROMPTPAY") return refuse("VALIDATION", "แนบสลิปได้เฉพาะการชำระแบบโอน/พร้อมเพย์");
      since = sale.paidAt ?? sale.createdAt;
      target = { saleId: sale.id, paymentId: pay.id, intentId: null };
    } else {
      const it = await prisma.posPaymentIntent.findFirst({ where: { id: input.intentId as string, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: { id: true, kind: true, status: true, createdAt: true } });
      if (!it) return refuse("SALE_NOT_FOUND");
      if (it.kind !== "PROMPTPAY_STATIC" || it.status !== "PENDING") return refuse("VALIDATION", "แนบสลิปได้เฉพาะใบขอรับเงินพร้อมเพย์ที่ยังรอยืนยัน");
      since = it.createdAt;
      target = { saleId: null, paymentId: null, intentId: it.id };
    }
    const now = deps?.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now : new Date();
    if (now.getTime() - since.getTime() > SLIP_ATTACH_WINDOW_MS && !can(m, "pos.sale.manage", c.unitId)) return refuse("PERMISSION_DENIED", "เกิน 24 ชั่วโมงหลังรับเงิน — ต้องเป็นผู้จัดการ (pos.sale.manage)");
    if (!deps?.put && !storageEnabled()) return refuse("STORAGE_NOT_CONFIGURED");
    const sys = await prisma.appSystem.findFirst({ where: { id: c.systemId, tenantId: c.tenantId, type: "POS" }, select: { settings: true } });
    const retentionDays = slipRetentionDaysOf(sys?.settings);

    // ── จองแถวใต้ล็อกของเป้าหมาย: เล่นซ้ำ → เลขอ้างอิงซ้ำ → เพดาน 3 ใบ ──
    const createdAt = new Date();
    const lockKey = `pos:slip:${c.tenantId}:${target.paymentId ?? target.intentId}`;
    // fix1 H2: คีย์เดิมเล่นซ้ำได้เฉพาะสาขาเดียวกัน + เป้าหมายเดียวกัน — ไม่งั้น VALIDATION (ไม่คืนสลิปของสาขา/บิลอื่น)
    const sameTarget = (r: { unitId: string; saleId: string | null; paymentId: string | null; intentId: string | null }) =>
      r.unitId === c.unitId && r.saleId === target.saleId && r.paymentId === target.paymentId && r.intentId === target.intentId;
    const reserved = await prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS locked`;
        const prev = await tx.posPaymentSlip.findFirst({ where: { tenantId: c.tenantId, idempotencyKey: key }, select: { ...SLIP_SELECT, unitId: true } });
        if (prev) return sameTarget(prev) ? { replay: prev } : { refused: refuse("VALIDATION", "รหัสรายการนี้ถูกใช้กับสลิปอื่นแล้ว") };
        if (transRef && (await tx.posPaymentSlip.findFirst({ where: { tenantId: c.tenantId, transRef }, select: { id: true } }))) return { refused: refuse("SLIP_DUPLICATE") };
        const n = await tx.posPaymentSlip.count({ where: { tenantId: c.tenantId, ...(target.paymentId ? { paymentId: target.paymentId } : { intentId: target.intentId }) } });
        if (n >= SLIP_MAX_PER_TARGET) return { refused: refuse("VALIDATION", "แนบสลิปได้ไม่เกิน 3 ใบต่อการชำระ") };
        const row = await tx.posPaymentSlip.create({
          data: {
            tenantId: c.tenantId,
            systemId: c.systemId,
            unitId: c.unitId,
            ...target,
            contentType,
            bytes: bytes.length,
            transRef,
            amountSatang,
            note,
            idempotencyKey: key,
            createdByUserId: userId,
            purgeAfter: new Date(createdAt.getTime() + retentionDays * DAY_MS),
            createdAt,
          },
          select: SLIP_SELECT,
        });
        return { row };
      })
      .catch(async (e: unknown) => {
        if (!isUniqueViolation(e)) throw e;
        const prev = await prisma.posPaymentSlip.findFirst({ where: { tenantId: c.tenantId, idempotencyKey: key }, select: { ...SLIP_SELECT, unitId: true } });
        if (prev) return sameTarget(prev) ? { replay: prev } : { refused: refuse("VALIDATION", "รหัสรายการนี้ถูกใช้กับสลิปอื่นแล้ว") };
        return { refused: refuse("SLIP_DUPLICATE") };
      });
    if ("replay" in reserved && reserved.replay) return { ok: true, slip: viewOf(reserved.replay), replayed: true };
    if ("refused" in reserved && reserved.refused) return reserved.refused;
    const row = (reserved as { row: SlipRow }).row;

    // ── อัปไฟล์ส่วนตัว (นอกธุรกรรม) → ผูก fileId · ล้ม = ถอนแถวที่จอง ──
    const up = await uploadFile({ tenantId: c.tenantId }, { kind: "ATTACHMENT", filename: `slip.${EXT[contentType]}`, contentType, data: bytes, maxBytes: SLIP_MAX_BYTES, visibility: "private" }, deps?.put ? { put: deps.put } : undefined);
    if (!up.ok) {
      await prisma.posPaymentSlip.deleteMany({ where: { id: row.id, tenantId: c.tenantId, fileId: null } }).catch(() => undefined);
      return refuse("UPLOAD_FAILED");
    }
    const done = await prisma.posPaymentSlip.update({ where: { id: row.id }, data: { fileId: up.assetId }, select: SLIP_SELECT });
    await writeAudit({
      tenantId: c.tenantId,
      actorId: userId,
      action: "pos.slip.attached",
      targetType: "PosPaymentSlip",
      targetId: done.id,
      after: { slipId: done.id, saleId: done.saleId, paymentId: done.paymentId, intentId: done.intentId, contentType, bytes: bytes.length, transRef: !!transRef },
    });
    return { ok: true, slip: viewOf(done) };
  } catch (e) {
    console.error("[pos/payment-slip] attach", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

async function decide(kind: "confirm" | "reject", ctx: SlipCtx, actor: SlipActor, input: unknown): Promise<SlipResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.shift.manage", c.unitId)) return refuse("PERMISSION_DENIED", "ยืนยัน/ปฏิเสธสลิปได้เฉพาะผู้จัดการกะ (pos.shift.manage)");
    if (!isRecord(input) || !isId(input.slipId)) return refuse("NOT_FOUND");
    let reason: string | null = null;
    if (kind === "reject") {
      reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (reason.length < 3 || reason.length > 200) return refuse("VALIDATION", "ระบุเหตุผลที่ปฏิเสธ 3–200 ตัวอักษร");
    }
    const slip = await prisma.posPaymentSlip.findFirst({ where: { id: input.slipId, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: { ...SLIP_SELECT, createdByUserId: true } });
    if (!slip) return refuse("NOT_FOUND");
    const userId = (actor as SlipActor).userId;
    if (slip.createdByUserId === userId && m!.role !== "OWNER") return refuse("SLIP_SELF_CONFIRM");
    const want = kind === "confirm" ? "CONFIRMED" : "REJECTED";
    if (slip.status === want) return { ok: true, slip: viewOf(slip), replayed: true };
    if (slip.status !== "UPLOADED") return refuse("SLIP_INVALID_STATE");
    const now = new Date();
    const res = await prisma.posPaymentSlip.updateMany({
      where: { id: slip.id, tenantId: c.tenantId, status: "UPLOADED" },
      data: kind === "confirm" ? { status: "CONFIRMED", verifiedVia: "MANUAL", confirmedByUserId: userId, confirmedAt: now } : { status: "REJECTED", rejectReason: reason, confirmedByUserId: userId, confirmedAt: now },
    });
    const after = await prisma.posPaymentSlip.findUniqueOrThrow({ where: { id: slip.id }, select: SLIP_SELECT });
    if (res.count === 1) {
      await writeAudit({
        tenantId: c.tenantId,
        actorId: userId,
        action: kind === "confirm" ? "pos.slip.confirmed" : "pos.slip.rejected",
        targetType: "PosPaymentSlip",
        targetId: slip.id,
        before: { status: "UPLOADED" },
        after: { status: want, ...(reason ? { reason } : {}), saleId: slip.saleId, paymentId: slip.paymentId, intentId: slip.intentId },
      });
      return { ok: true, slip: viewOf(after) };
    }
    return after.status === want ? { ok: true, slip: viewOf(after), replayed: true } : refuse("SLIP_INVALID_STATE");
  } catch (e) {
    console.error(`[pos/payment-slip] ${kind}`, e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** ยืนยันสลิป (หลักฐานเท่านั้น — ไม่มีผลเงิน) · ผู้จัดการ ไม่ใช่ผู้อัป (OWNER ยกเว้น) · ยืนยันซ้ำ = ok ไม่ audit ซ้ำ */
export async function confirmSlip(ctx: SlipCtx, actor: SlipActor, input: unknown): Promise<SlipResult> {
  return decide("confirm", ctx, actor, input);
}

/** ปฏิเสธสลิป (ต้องมีเหตุผล) — กติกาสิทธิ์เดียวกับยืนยัน */
export async function rejectSlip(ctx: SlipCtx, actor: SlipActor, input: unknown): Promise<SlipResult> {
  return decide("reject", ctx, actor, input);
}

/** ลิงก์ดูไฟล์สลิป (≤ 300 วินาที · ผูกผู้ดู) — หลังตรวจสิทธิ์ pos.sale.read/create ที่สาขา · ไฟล์ถูกลบตามอายุ = FILE_PURGED */
export async function slipViewerUrl(ctx: SlipCtx, actor: SlipActor, input: unknown): Promise<{ ok: true; url: string; expiresInSec: number } | SlipRefusal> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.sale.read", c.unitId) && !can(m, "pos.sale.create", c.unitId)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isId(input.slipId)) return refuse("NOT_FOUND");
    const slip = await prisma.posPaymentSlip.findFirst({ where: { id: input.slipId, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: { fileId: true } });
    if (!slip) return refuse("NOT_FOUND");
    if (!slip.fileId) return refuse("FILE_PURGED");
    return { ok: true, url: privateFileUrl(slip.fileId, { kind: "STAFF", id: (actor as SlipActor).userId }, SLIP_VIEW_TTL_SEC), expiresInSec: SLIP_VIEW_TTL_SEC };
  } catch (e) {
    console.error("[pos/payment-slip] viewer", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/**
 * สลิปของบิล (ลิ้นชักบิล + REST sales.get อ่านผ่าน billDetail · อ่านอย่างเดียว) — thumbUrl = null เสมอ:
 * ลิงก์ลงนามออกตอนกดดูผ่าน slipViewerUrl เท่านั้น (นาฬิกา 300 วินาทีเริ่มตอนกด · ไม่มีลิงก์ใน DTO ที่ส่งต่อได้)
 */
export async function billSlips(tenantId: string, saleId: string): Promise<{ id: string; status: SlipStatus; thumbUrl: string | null }[]> {
  const rows = await prisma.posPaymentSlip.findMany({ where: { tenantId, saleId }, select: { id: true, status: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, status: r.status as SlipStatus, thumbUrl: null }));
}

/** ลบไฟล์สลิปที่ถึงอายุเก็บ (งานรายชั่วโมง) — ไฟล์ก่อน แล้ว fileId = null · แถว + สถานะคงไว้ · รันซ้ำ = 0 · ที่เก็บล้ม = ลองรอบหน้า */
export async function purgeExpiredSlips(opts?: { tenantId?: string; now?: Date; deps?: DeleteDeps; deadline?: number }): Promise<{ ok: true; purged: number; failed: number; cutOff: boolean }> {
  const now = opts?.now instanceof Date && !Number.isNaN(opts.now.getTime()) ? opts.now : new Date();
  let purged = 0;
  let failed = 0;
  let cutOff = false;
  try {
    // fix1 H4 (W19): อายุเก็บตัดสินตอนลบจาก "ค่าตั้งปัจจุบัน" ของระบบ POS — เจ้าของตั้ง slipRetentionDays แล้ว (ขึ้นหรือลง · ขั้นต่ำ 90)
    //   = ใช้กับสลิปเดิมทุกใบด้วย (createdAt + ค่าปัจจุบัน) · ไม่ได้ตั้ง = วันที่คำนวณไว้ตอนแนบ (purgeAfter · ค่าปริยาย 1,825)
    const base = { ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}), fileId: { not: null } };
    const systems = await prisma.posPaymentSlip.findMany({ where: base, select: { systemId: true }, distinct: ["systemId"] });
    const settings = systems.length ? await prisma.appSystem.findMany({ where: { id: { in: systems.map((x) => x.systemId) } }, select: { id: true, settings: true } }) : [];
    const daysBy = new Map(settings.map((x) => [x.id, explicitSlipRetentionDays(x.settings)]));
    const rows: { id: string; tenantId: string; fileId: string | null }[] = [];
    for (const { systemId } of systems) {
      if (rows.length >= PURGE_BATCH) break;
      const days = daysBy.get(systemId) ?? null;
      const due = days === null ? { purgeAfter: { lte: now } } : { createdAt: { lte: new Date(now.getTime() - days * DAY_MS) } };
      rows.push(...(await prisma.posPaymentSlip.findMany({ where: { ...base, systemId, ...due }, select: { id: true, tenantId: true, fileId: true }, orderBy: { createdAt: "asc" }, take: PURGE_BATCH - rows.length })));
    }
    for (const r of rows) {
      // fix1 F6: เคารพงบของตัวรันรายนาที — ถึง deadline = หยุด (แถวที่เหลือรอบหน้า)
      if (typeof opts?.deadline === "number" && Date.now() >= opts.deadline) {
        cutOff = true;
        break;
      }
      const del = await deleteFileAsset({ tenantId: r.tenantId }, r.fileId!, opts?.deps);
      if (!del.ok) {
        failed++;
        continue;
      }
      const u = await prisma.posPaymentSlip.updateMany({ where: { id: r.id, tenantId: r.tenantId, fileId: r.fileId }, data: { fileId: null, purgedAt: now } });
      purged += u.count;
    }
  } catch (e) {
    console.error("[pos/payment-slip] purge", e instanceof Error ? e.name : "error");
  }
  return { ok: true, purged, failed, cutOff };
}
