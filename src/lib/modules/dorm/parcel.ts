// SVC D.18 ▸ พัสดุหอ (รับ+ถ่ายรูป ⇒ LINE แจ้งผู้เช่า ⇒ สแกน/เซ็นรับ ⇒ เตือนค้างตามค่าตั้ง #62) — สัญญา ledger/svc-briefs/svc-brief-d.18.md §2 §3
//   • รับซ้ำคีย์เดิม = แถวเดียว: id แถวคำนวณจาก (ร้าน, หน่วย, คีย์) + INSERT … ON CONFLICT ("id") DO NOTHING (มติผู้คุม R1 · ไม่มี migration)
//   • เลขพัสดุซ้ำขณะของเดิมยังรอรับ ⇒ DUPLICATE (ล็อก advisory ต่อเลขใน tx · R3)
//   • ลิงก์รับพัสดุ = signLink purpose dorm.parcel (ไม่เก็บ token ในฐาน · R2) · ใช้ครั้งเดียวด้วย CAS status = 'WAITING'
//   • รับของ = พนักงาน (dorm.parcel.manage) สแกน QR ของผู้เช่า หรือเซ็นบนจอ (R4) · หน้าสาธารณะอ่านอย่างเดียว ไม่มีรูป (R7)
//   • ข้อความผ่าน notifyCustomer เท่านั้น (dynamic import · OA ของหน่วย · เวลาเงียบ · dedupe · precheck อ่านสด)
//   • ขอบเขตอาคาร (#64) = dormVisibleRoomsFor ของ D.13 ทุกฟังก์ชันพนักงาน · ไม่พบทุกแบบ = PARCEL_NF_REASON ทุกไบต์ (X1)
//   • tenantDb เท่านั้น (F5.1) · ไม่เปิด connection ที่สองระหว่างถือ tx · 40P01 ⇒ ลองซ้ำ 1 ครั้ง แล้ว BUSY · ไม่ throw ออก
//   • ไม่มีชื่อ/เบอร์/token ใน payload/audit/log · ค่านโยบายจากทะเบียนค่าตั้ง (ไม่ฝังตัวเลข)
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkDayStart, bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { getDef, resolveSettings } from "@/lib/core/settings";
import { SIGNED_LINK_MAX_MIN, signLink, verifyLink } from "@/lib/core/signed-link";
import { deleteFileAsset, privateFileUrl, uploadFile } from "@/lib/storage/service";
import { dormStaffGate, portalDateLabel } from "./portal";
import { dormVisibleRoomsFor } from "./scope";

type Tx = Prisma.TransactionClient;

export const PARCEL_PICKUP_PURPOSE = "dorm.parcel";
/** ค่าคงที่ความปลอดภัยของหน้าสาธารณะ (ไม่ใช่นโยบายร้าน) */
export const PARCEL_RATE = { view: { limit: 120, windowMs: 600_000 } } as const;
export const PARCEL_NF_REASON = "ไม่พบพัสดุหรือห้องที่ระบุในหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ";

export type ParcelCtx = { tenantId: string; actorUserId: string };
export type ParcelFile = { data: Uint8Array; contentType: string };
export type ParcelFileDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> };
/** BUSY = ฐานข้อมูลชนกัน (40P01) ซ้ำหลังลองใหม่ 1 ครั้ง / ระบบขัดข้อง — ไม่มีอะไรเปลี่ยน ลองใหม่ได้ */
export type ParcelFailCode = "NOT_FOUND" | "DISABLED" | "INVALID_INPUT" | "INVALID_FILE" | "DUPLICATE" | "ALREADY_PICKED_UP" | "BAD_STATE" | "UPLOAD_FAILED" | "BUSY";
export type ParcelFail = { ok: false; code: ParcelFailCode; reason: string };
export type ParcelStatus = "WAITING" | "PICKED_UP" | "RETURNED";
export type ParcelRow = {
  parcelId: string;
  roomId: string;
  roomNumber: string;
  buildingId: string | null;
  carrier: string | null;
  trackingNo: string | null;
  status: ParcelStatus;
  receivedAt: string;
  daysWaiting: number;
  overdue: boolean;
  tenantFirstName: string | null;
  photoUrl: string | null;
  pickedUpAt: string | null;
  remindCount: number;
};
export type ParcelList = {
  ok: true;
  enabled: boolean;
  holdDays: number;
  rows: ParcelRow[];
  counts: { waiting: number; overdue: number; pickedUp: number; returned: number };
};

// ───────────────────────── ค่าคงที่/ตัวช่วย ─────────────────────────
const PERM = "dorm.parcel.manage";
const EVT_RECEIVED = "dorm.parcel.received";
const EVT_PICKED = "dorm.parcel.picked_up";
const K_ENABLED = "rooms.parcel.enabled";
const K_HOLD = "rooms.parcel.holdDays";
const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TRACK_RE = /^[A-Z0-9-]{1,60}$/;
const MAX_CARRIER = 40;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const SIGN_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MB = 1024 * 1024;
const PHOTO_MAX = 10 * MB;
const SIGN_MAX = 2 * MB;
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const DAY_MS = 86_400_000;
const RESEND_WINDOW_MS = 3 * DAY_MS;
const FAILED_RETRY_MAX = 5;
const MAX_ROWS = 500;
const POSTBACK_MAX = 5;
const KEY_RECEIVED = "rooms:parcelReceived:";
const KEY_REMINDER = "rooms:parcelReminder:";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const fail = (code: ParcelFailCode, reason: string): ParcelFail => ({ ok: false, code, reason });
const notFound = (): ParcelFail => fail("NOT_FOUND", PARCEL_NF_REASON);
const busy = (): ParcelFail => fail("BUSY", "ระบบพัสดุไม่ว่างชั่วคราว — ไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง");
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");

class Abort extends Error {
  constructor(public readonly result: ParcelFail | { replay: true }) {
    super("dorm.parcel abort");
  }
}

function isDeadlock(e: unknown): boolean {
  const code = isRec(e) && typeof e.code === "string" ? e.code : "";
  const meta = isRec(e) && isRec(e.meta) && typeof e.meta.code === "string" ? e.meta.code : "";
  const msg = e instanceof Error ? e.message : "";
  return code === "P2034" || code === "40P01" || meta === "40P01" || /40P01|deadlock detected/i.test(msg);
}

/** ธุรกรรมผูกขอบเขต (ร้าน+หน่วย) · 40P01 ⇒ ลองซ้ำ 1 ครั้ง · Abort ⇒ คืนผลปฏิเสธ (rollback) */
async function runTx<T>(tenantId: string, unitId: string, fn: (tx: Tx) => Promise<T>): Promise<T | Abort["result"]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tenantDb({ tenantId, unitId }).$transaction((tx) => fn(tx as unknown as Tx), TX_OPTS);
    } catch (e) {
      if (e instanceof Abort) return e.result;
      if (attempt === 0 && isDeadlock(e)) continue;
      throw e;
    }
  }
}

async function logFail(where: string, tenantId: string, e: unknown): Promise<void> {
  try {
    await logOps("ERROR", `dorm.parcel.${where}`, "บริการพัสดุหอขัดข้อง", { tenantId, detail: errName(e) });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

/** วันไทย(now) − วันไทย(at) เป็นจำนวนวัน (ไม่ติดลบ) */
function daysBetween(at: Date, now: Date): number {
  const a = Date.parse(`${bkkYmd(at)}T00:00:00Z`);
  const b = Date.parse(`${bkkYmd(now)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** ค่าตั้ง #62 ของหน่วย (อ่านต่อคำขอ · ค่าเริ่มจากทะเบียน) */
async function parcelSettings(tenantId: string, unitId: string): Promise<{ enabled: boolean; holdDays: number }> {
  const s = await resolveSettings({ tenantId }, [K_ENABLED, K_HOLD], { unitId });
  const en = s[K_ENABLED]?.value;
  const hd = s[K_HOLD]?.value;
  const hdDefault = getDef(K_HOLD)?.defaults?._fallback;
  const hold = typeof hd === "number" && Number.isInteger(hd) && hd >= 1 ? hd : typeof hdDefault === "number" ? hdDefault : 1;
  return { enabled: en === true, holdDays: hold };
}

/** อายุลิงก์รับพัสดุ (นาที) = (holdDays + 7) วัน · ไม่เกินเพดาน signLink */
const pickupExpMin = (holdDays: number) => Math.min(SIGNED_LINK_MAX_MIN, (holdDays + 7) * 1440);

/** origin ของแอป (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี ⇒ "" (path สัมพัทธ์) */
function appOrigin(): string {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ลองตัวถัดไป */
    }
  }
  return "";
}

/** id แถวพัสดุจากคีย์รับซ้ำ (R1 ทาง ก) */
function parcelIdOf(tenantId: string, unitId: string, key: string): string {
  return `pcl${createHash("sha256").update(`dorm.parcel:v1:${tenantId}:${unitId}:${key}`).digest("hex").slice(0, 25)}`;
}

/** เลขพัสดุ: ตัดช่องว่างทั้งหมด · ตัวพิมพ์ใหญ่ · ว่าง ⇒ null · ผิดรูป ⇒ undefined */
function normTracking(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, "").toUpperCase();
  if (!t) return null;
  return TRACK_RE.test(t) ? t : undefined;
}
function normCarrier(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  // eslint-disable-next-line no-control-regex
  if (Array.from(t).length > MAX_CARRIER || /[\u0000-\u001f\u007f]/.test(t)) return undefined;
  return t;
}

function sniffOk(ct: string, b: Uint8Array): boolean {
  const at = (i: number) => (i < b.length ? b[i] : -1);
  const ascii = (off: number, s: string) => [...s].every((c, i) => at(off + i) === c.charCodeAt(0));
  switch (ct) {
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/png":
      return at(0) === 0x89 && ascii(1, "PNG") && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a;
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
    case "image/heif":
      return ascii(4, "ftyp") && ["heic", "heix", "mif1", "msf1"].some((x) => ascii(8, x));
    default:
      return false;
  }
}
/** ไฟล์รูปใช้ได้ไหม (ชนิดที่รับ · 1 B–max · ไบต์หัวตรงชนิด) — ผิด ⇒ null */
function fileOf(v: unknown, allowed: readonly string[], max: number): ParcelFile | null {
  if (!isRec(v) || !(v.data instanceof Uint8Array) || typeof v.contentType !== "string") return null;
  const ct = v.contentType.split(";")[0].trim().toLowerCase();
  if (!allowed.includes(ct)) return null;
  if (v.data.length < 1 || v.data.length > max) return null;
  if (!sniffOk(ct, v.data)) return null;
  return { data: v.data, contentType: ct };
}
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

async function putPrivate(tenantId: string, f: ParcelFile, label: string, max: number, deps: ParcelFileDeps | undefined): Promise<string | null> {
  try {
    const r = await uploadFile(
      { tenantId },
      { kind: "ATTACHMENT", visibility: "private", filename: `${label}.${EXT[f.contentType] ?? "bin"}`, contentType: f.contentType, data: f.data, maxBytes: max },
      deps?.put ? { put: deps.put } : undefined,
    );
    return r.ok ? r.assetId : null;
  } catch {
    return null;
  }
}
async function dropFile(tenantId: string, id: string | null, deps: ParcelFileDeps | undefined): Promise<void> {
  if (!id) return;
  try {
    await deleteFileAsset({ tenantId }, id, deps?.put ? { del: deps.del ?? (async () => 200) } : undefined);
  } catch {
    /* best-effort — ไฟล์ส่วนตัวที่ค้างไม่มีลิงก์ใดชี้ */
  }
}

/**
 * D18-B5 ▸ ลบไฟล์ในเส้นทางพัง (catch) เฉพาะเมื่อไม่มีแถวพัสดุอ้างไฟล์นั้น — tx อาจ commit แล้วแต่ผลหายระหว่างทาง
 *   (connection หลุดหลัง COMMIT) ⇒ แถวชี้ไฟล์อยู่ = ห้ามลบ · อ่านไม่ได้ ⇒ ไม่ลบ (ไฟล์ส่วนตัวค้างดีกว่ารูปหาย)
 */
async function dropUnreferenced(tenantId: string, id: string, deps: ParcelFileDeps | undefined): Promise<void> {
  if (!isStr(tenantId)) return;
  try {
    const ref = await tenantDb({ tenantId }).$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "DormParcel" WHERE "tenantId" = ${tenantId} AND ("photoFileId" = ${id} OR "signatureFileId" = ${id}) LIMIT 1`;
    if (ref.length) return;
  } catch {
    return;
  }
  await dropFile(tenantId, id, deps);
}

// ───────────────────────── ด่านพนักงาน + ขอบเขตอาคาร ─────────────────────────
type Gate = { tenantId: string; unitId: string; unitName: string; actorUserId: string; visible: Set<string> | null };

async function staffGate(ctx: unknown, unitId: unknown): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const g = await dormStaffGate(ctx, unitId, PERM);
  if (!g) return null;
  const visible = await dormVisibleRoomsFor({ tenantId: g.tenantId }, { unitId: g.unitId, userId: ctx.actorUserId });
  return { ...g, actorUserId: ctx.actorUserId, visible };
}
const inScope = (g: Gate, roomId: string) => g.visible === null || g.visible.has(roomId);

async function roomOf(g: Gate, roomId: unknown): Promise<{ id: string; number: string } | null> {
  if (!isStr(roomId) || !ID_RE.test(roomId)) return null;
  const r = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findFirst({ where: { id: roomId }, select: { id: true, number: true } });
  return r && inScope(g, r.id) ? r : null;
}

type ParcelDb = {
  id: string;
  tenantId: string;
  unitId: string;
  roomId: string;
  leaseId: string | null;
  partyId: string | null;
  carrier: string | null;
  trackingNo: string | null;
  photoFileId: string | null;
  status: string;
  receivedAt: Date;
};
const PARCEL_SELECT = {
  id: true,
  tenantId: true,
  unitId: true,
  roomId: true,
  leaseId: true,
  partyId: true,
  carrier: true,
  trackingNo: true,
  photoFileId: true,
  status: true,
  receivedAt: true,
} as const;

async function parcelOfUnit(g: Gate, parcelId: unknown): Promise<ParcelDb | null> {
  if (!isStr(parcelId) || !ID_RE.test(parcelId)) return null;
  const p = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormParcel.findFirst({ where: { id: parcelId }, select: PARCEL_SELECT });
  return p && inScope(g, p.roomId) ? p : null;
}
async function parcelOfTenant(tenantId: string, parcelId: unknown): Promise<ParcelDb | null> {
  if (!isStr(tenantId) || !isStr(parcelId) || !ID_RE.test(parcelId)) return null;
  // DormParcel เป็นตารางระดับหน่วย — ยังไม่รู้หน่วย ⇒ คิวรีดิบที่ผูก tenantId ตรง
  const rows = await tenantDb({ tenantId }).$queryRaw<ParcelDb[]>`
    SELECT "id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "carrier", "trackingNo", "photoFileId", "status", "receivedAt"
    FROM "DormParcel" WHERE "tenantId" = ${tenantId} AND "id" = ${parcelId} LIMIT 1`;
  return rows[0] ?? null;
}

type LiveLease = { id: string; unitId: string; roomId: string; partyId: string; roomNumber: string; unitName: string };
/** สัญญา live (นิยาม D.9 §3.0: ACTIVE|NOTICE · endedAt ว่าง · endDate ว่างหรือ ≥ วันนี้ไทย · หน่วย DORM) ของห้องนั้น — คิวรีเดียว */
async function liveLeaseOfRoom(tenantId: string, unitId: string, roomId: string, today: string): Promise<LiveLease | null> {
  const rows = await tenantDb({ tenantId }).$queryRaw<LiveLease[]>`
    SELECT l."id", l."unitId", l."roomId", l."partyId", r."number" AS "roomNumber", u."name" AS "unitName"
    FROM "DormLease" l
    JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
    JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${tenantId} AND l."unitId" = ${unitId} AND l."roomId" = ${roomId}
      AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL AND (l."endDate" IS NULL OR l."endDate" >= ${today}::date)
    ORDER BY l."startDate" DESC, l."id" ASC
    LIMIT 1`;
  return rows[0] ?? null;
}
/** สัญญาที่ผูกกับพัสดุยัง live อยู่ไหม (ต้องเป็นสัญญาเดิม · หน่วย/ห้องเดิม) */
async function liveLeaseOfParcel(p: ParcelDb, now: Date): Promise<LiveLease | null> {
  if (!p.leaseId) return null;
  const rows = await tenantDb({ tenantId: p.tenantId }).$queryRaw<LiveLease[]>`
    SELECT l."id", l."unitId", l."roomId", l."partyId", r."number" AS "roomNumber", u."name" AS "unitName"
    FROM "DormLease" l
    JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
    JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId"
    WHERE l."tenantId" = ${p.tenantId} AND l."id" = ${p.leaseId} AND l."unitId" = ${p.unitId} AND l."roomId" = ${p.roomId}
      AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL AND (l."endDate" IS NULL OR l."endDate" >= ${bkkYmd(now)}::date)
    LIMIT 1`;
  return rows[0] ?? null;
}

const audit = (tx: Tx, g: Gate, action: string, parcelId: string, after: Record<string, string>) =>
  tx.auditLog.create({
    data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action, targetType: "DormParcel", targetId: parcelId, after },
  });

// ═════════════════════════ §3.1 รับพัสดุ ═════════════════════════
export async function receiveParcel(
  ctx: ParcelCtx,
  i: { unitId: string; roomId: string; carrier?: string | null; trackingNo?: string | null; photo?: ParcelFile; idempotencyKey: string },
  opts?: { now?: Date; deps?: ParcelFileDeps },
): Promise<{ ok: true; parcelId: string; replayed: boolean; leaseLinked: boolean } | ParcelFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  const deps = opts?.deps;
  const now = nowOf(opts?.now);
  let uploaded: string | null = null;
  try {
    // (1) รูปแบบ input
    if (!isRec(i)) return fail("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    if (typeof i.idempotencyKey !== "string" || !KEY_RE.test(i.idempotencyKey)) return fail("INVALID_INPUT", "รหัสกันบันทึกซ้ำไม่ถูกต้อง — เปิดฟอร์มรับพัสดุใหม่แล้วลองอีกครั้ง");
    const carrier = normCarrier(i.carrier);
    if (carrier === undefined) return fail("INVALID_INPUT", `ชื่อขนส่งยาวได้ไม่เกิน ${MAX_CARRIER} ตัวอักษร`);
    const tracking = normTracking(i.trackingNo);
    if (tracking === undefined) return fail("INVALID_INPUT", "เลขพัสดุใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และขีด ยาวไม่เกิน 60 ตัว");
    // (2) ด่านพนักงาน + หน่วย + ห้องในขอบเขต
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const room = await roomOf(g, i.roomId);
    if (!room) return notFound();
    // (3) เปิดระบบไหม
    const st = await parcelSettings(g.tenantId, g.unitId);
    if (!st.enabled) return fail("DISABLED", "ระบบพัสดุของหอนี้ปิดอยู่ — เปิดได้ที่หน้าตั้งค่าหอ");
    // (4) คีย์เดิมมีแถวแล้ว ⇒ ผลเดิมทันที (ไม่อัปรูป · ไม่มี event ใหม่)
    const parcelId = parcelIdOf(g.tenantId, g.unitId, i.idempotencyKey);
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const prev = await db.dormParcel.findFirst({ where: { id: parcelId }, select: { id: true, leaseId: true, roomId: true } });
    // D18-B3 ▸ คีย์เดิมของห้องอื่น/นอกขอบเขต ⇒ ไม่พบเดียวกัน (ไม่บอกว่ามีแถวอยู่) ◂
    if (prev) return prev.roomId === room.id && inScope(g, prev.roomId) ? { ok: true, parcelId, replayed: true, leaseLinked: !!prev.leaseId } : notFound();
    // (5) รูป
    if (i.photo === undefined || i.photo === null) return fail("INVALID_INPUT", "ต้องถ่ายรูปพัสดุก่อนบันทึก");
    const photo = fileOf(i.photo, PHOTO_TYPES, PHOTO_MAX);
    if (!photo) return fail("INVALID_FILE", "รูปพัสดุต้องเป็นไฟล์ภาพ JPEG, PNG, WebP หรือ HEIC ขนาดไม่เกิน 10 MB");
    // สัญญา live ของห้อง (อ่านก่อนเปิด tx — ไม่ใช้ connection ที่สองระหว่างถือ tx)
    const lease = await liveLeaseOfRoom(g.tenantId, g.unitId, room.id, bkkYmd(now));
    // (6) อัปไฟล์ส่วนตัว
    uploaded = await putPrivate(g.tenantId, photo, "parcel-photo", PHOTO_MAX, deps);
    if (!uploaded) return fail("UPLOAD_FAILED", "อัปโหลดรูปพัสดุไม่สำเร็จ — ลองใหม่อีกครั้ง");
    const photoId = uploaded;
    // (7) tx: ล็อกเลขพัสดุ → ซ้ำ ⇒ DUPLICATE · INSERT ON CONFLICT DO NOTHING · event · audit
    const out = await runTx(g.tenantId, g.unitId, async (tx) => {
      if (tracking) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dorm.parcel.track:${g.tenantId}:${g.unitId}:${tracking}`}, 0))`;
        const mine = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DormParcel" WHERE "id" = ${parcelId} AND "tenantId" = ${g.tenantId} LIMIT 1`;
        if (mine.length) throw new Abort({ replay: true });
        const dup = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "DormParcel" WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING' AND "trackingNo" = ${tracking} LIMIT 1`;
        if (dup.length) throw new Abort(fail("DUPLICATE", "เลขพัสดุนี้บันทึกไว้แล้วและยังรอผู้เช่ามารับ — ตรวจรายการพัสดุที่รอรับก่อน"));
      }
      const n = await tx.$executeRaw`
        INSERT INTO "DormParcel" ("id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "carrier", "trackingNo", "photoFileId", "receivedById", "receivedAt", "status", "remindCount", "createdAt", "updatedAt")
        VALUES (${parcelId}, ${g.tenantId}, ${g.unitId}, ${room.id}, ${lease?.id ?? null}, ${lease?.partyId ?? null}, ${carrier}, ${tracking}, ${photoId}, ${g.actorUserId}, ${now}, 'WAITING', 0, now(), now())
        ON CONFLICT ("id") DO NOTHING`;
      if (n !== 1) throw new Abort({ replay: true });
      await emitOutbox(tx, {
        tenantId: g.tenantId,
        unitId: g.unitId,
        type: EVT_RECEIVED,
        idempotencyKey: `${EVT_RECEIVED}:${parcelId}`,
        payload: { unitId: g.unitId, parcelId, roomId: room.id },
      });
      await audit(tx, g, EVT_RECEIVED, parcelId, { roomId: room.id, leaseLinked: lease ? "true" : "false" });
      return { done: true as const };
    });
    if ("done" in out) {
      uploaded = null;
      return { ok: true, parcelId, replayed: false, leaseLinked: !!lease };
    }
    await dropFile(g.tenantId, photoId, deps);
    uploaded = null;
    if ("replay" in out) {
      const row = await db.dormParcel.findFirst({ where: { id: parcelId }, select: { leaseId: true, roomId: true } });
      if (!row || row.roomId !== room.id || !inScope(g, row.roomId)) return notFound();
      return { ok: true, parcelId, replayed: true, leaseLinked: !!row.leaseId };
    }
    return out;
  } catch (e) {
    if (uploaded) await dropUnreferenced(tidLog, uploaded, deps);
    await logFail("receive", tidLog, e);
    return busy();
  }
}

// ═════════════════════════ §3.2 รายการ ═════════════════════════
const firstName = (name: string | null | undefined): string | null => {
  const t = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return t ? t : null;
};
const statusOf = (s: string): ParcelStatus => (s === "PICKED_UP" || s === "RETURNED" ? s : "WAITING");

export async function listParcels(
  ctx: ParcelCtx,
  i: { unitId: string; status?: ParcelStatus | "ALL" },
  opts?: { now?: Date },
): Promise<ParcelList | ParcelFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(i)) return notFound();
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const want = i.status === undefined || i.status === null ? "WAITING" : i.status;
    if (!["WAITING", "PICKED_UP", "RETURNED", "ALL"].includes(want)) return fail("INVALID_INPUT", "สถานะที่ขอไม่ถูกต้อง");
    const now = nowOf(opts?.now);
    const st = await parcelSettings(g.tenantId, g.unitId);
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const scope: Prisma.DormParcelWhereInput = g.visible === null ? {} : { roomId: { in: [...g.visible] } };
    // ค้าง = WAITING และวันไทยที่รับ ≤ วันไทยวันนี้ − holdDays ⇔ receivedAt < เที่ยงคืนไทยของวันนี้ − (holdDays − 1) วัน
    const cutoff = new Date(bkkDayStart(now).getTime() - (st.holdDays - 1) * DAY_MS);
    const [waitingN, pickedN, returnedN, overdueN, rows] = await Promise.all([
      db.dormParcel.count({ where: { ...scope, status: "WAITING" } }),
      db.dormParcel.count({ where: { ...scope, status: "PICKED_UP" } }),
      db.dormParcel.count({ where: { ...scope, status: "RETURNED" } }),
      db.dormParcel.count({ where: { ...scope, status: "WAITING", receivedAt: { lt: cutoff } } }),
      db.dormParcel.findMany({
        where: { ...scope, ...(want === "ALL" ? {} : { status: want }) },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        take: MAX_ROWS,
        select: { ...PARCEL_SELECT, pickedUpAt: true, remindCount: true },
      }),
    ]);
    const roomIds = [...new Set(rows.map((r) => r.roomId))];
    const partyIds = [...new Set(rows.map((r) => r.partyId).filter((x): x is string => !!x))];
    const [rooms, parties] = await Promise.all([
      roomIds.length ? db.hotelRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, buildingId: true } }) : Promise.resolve([]),
      partyIds.length ? tenantDb({ tenantId: g.tenantId }).party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const roomBy = new Map(rooms.map((r) => [r.id, r]));
    const nameBy = new Map(parties.map((p) => [p.id, p.name]));
    const viewer = { kind: "STAFF" as const, id: g.actorUserId };
    const out: ParcelRow[] = rows.map((r) => {
      const status = statusOf(r.status);
      const days = daysBetween(r.receivedAt, now);
      let photoUrl: string | null = null;
      if (r.photoFileId) {
        try {
          photoUrl = privateFileUrl(r.photoFileId, viewer);
        } catch {
          photoUrl = null;
        }
      }
      return {
        parcelId: r.id,
        roomId: r.roomId,
        roomNumber: roomBy.get(r.roomId)?.number ?? "",
        buildingId: roomBy.get(r.roomId)?.buildingId ?? null,
        carrier: r.carrier,
        trackingNo: r.trackingNo,
        status,
        receivedAt: r.receivedAt.toISOString(),
        daysWaiting: days,
        overdue: status === "WAITING" && days >= st.holdDays,
        tenantFirstName: r.partyId ? firstName(nameBy.get(r.partyId)) : null,
        photoUrl,
        pickedUpAt: r.pickedUpAt ? r.pickedUpAt.toISOString() : null,
        remindCount: r.remindCount,
      };
    });
    return {
      ok: true,
      enabled: st.enabled,
      holdDays: st.holdDays,
      rows: out,
      counts: { waiting: waitingN, overdue: overdueN, pickedUp: pickedN, returned: returnedN },
    };
  } catch (e) {
    await logFail("list", tidLog, e);
    return busy();
  }
}

// ═════════════════════════ §3.3 รับของ (สแกน/ลายเซ็น) ═════════════════════════
/** ข้อความที่สแกนได้ = URL เต็ม `<origin>/dp/<token>` หรือ token ล้วน */
function tokenFromScan(v: unknown): string {
  if (typeof v !== "string") return "";
  let t = v.trim();
  if (t.length > 4096) return "";
  const ix = t.lastIndexOf("/dp/");
  if (ix >= 0) t = t.slice(ix + 4);
  t = t.split(/[?#]/)[0].replace(/\/+$/, "");
  return t;
}

const stateFail = (status: string): ParcelFail =>
  status === "PICKED_UP" ? fail("ALREADY_PICKED_UP", "พัสดุชิ้นนี้รับไปแล้ว") : fail("BAD_STATE", "พัสดุชิ้นนี้ตีกลับแล้ว — รับของไม่ได้");

export async function pickupParcel(
  ctx: ParcelCtx,
  i: { unitId: string; parcelId?: string | null; proof: { kind: "SCAN"; token: string } | { kind: "SIGNATURE"; file: ParcelFile } },
  opts?: { now?: Date; deps?: ParcelFileDeps },
): Promise<{ ok: true; parcelId: string; pickedUpAt: string; method: "SCAN" | "SIGNATURE" } | ParcelFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  const deps = opts?.deps;
  const now = nowOf(opts?.now);
  let uploaded: string | null = null;
  try {
    if (!isRec(i) || !isRec(i.proof)) return fail("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const proof = i.proof;
    let parcel: ParcelDb | null;
    let partyId: string | null = null;
    let method: "SCAN" | "SIGNATURE";
    if (proof.kind === "SCAN") {
      method = "SCAN";
      const sub = verifyLink(tokenFromScan(proof.token), PARCEL_PICKUP_PURPOSE);
      if (!sub || sub.tenantId !== g.tenantId) return notFound();
      if (i.parcelId !== undefined && i.parcelId !== null && i.parcelId !== "" && i.parcelId !== sub.subjectId) return notFound();
      parcel = await parcelOfUnit(g, sub.subjectId);
      if (!parcel) return notFound();
      const lease = await liveLeaseOfParcel(parcel, now);
      if (!lease) return notFound();
      partyId = lease.partyId;
    } else if (proof.kind === "SIGNATURE") {
      method = "SIGNATURE";
      if (!isStr(i.parcelId)) return fail("INVALID_INPUT", "ต้องเลือกพัสดุที่จะเซ็นรับ");
      parcel = await parcelOfUnit(g, i.parcelId);
      if (!parcel) return notFound();
      const lease = await liveLeaseOfParcel(parcel, now);
      partyId = lease ? lease.partyId : null;
    } else return fail("INVALID_INPUT", "วิธีรับพัสดุไม่ถูกต้อง");
    if (parcel.status !== "WAITING") return stateFail(parcel.status);
    if (proof.kind === "SIGNATURE") {
      const f = fileOf(proof.file, SIGN_TYPES, SIGN_MAX);
      if (!f) return fail("INVALID_FILE", "ลายเซ็นต้องเป็นรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 2 MB");
      uploaded = await putPrivate(g.tenantId, f, "parcel-signature", SIGN_MAX, deps);
      if (!uploaded) return fail("UPLOAD_FAILED", "อัปโหลดลายเซ็นไม่สำเร็จ — ลองใหม่อีกครั้ง");
    }
    const sig = uploaded;
    const p = parcel;
    const out = await runTx(g.tenantId, g.unitId, async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "DormParcel" SET "status" = 'PICKED_UP', "pickedUpAt" = ${now}, "pickedUpByPartyId" = ${partyId}, "signatureFileId" = ${sig}, "updatedAt" = now()
        WHERE "id" = ${p.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'`;
      if (n !== 1) {
        const cur = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "DormParcel" WHERE "id" = ${p.id} AND "tenantId" = ${g.tenantId} LIMIT 1`;
        throw new Abort(cur[0] ? stateFail(cur[0].status) : notFound());
      }
      await emitOutbox(tx, {
        tenantId: g.tenantId,
        unitId: g.unitId,
        type: EVT_PICKED,
        idempotencyKey: `${EVT_PICKED}:${p.id}`,
        payload: { unitId: g.unitId, parcelId: p.id, roomId: p.roomId },
      });
      await audit(tx, g, EVT_PICKED, p.id, { method });
      return { done: true as const };
    });
    if ("done" in out) {
      uploaded = null;
      return { ok: true, parcelId: p.id, pickedUpAt: now.toISOString(), method };
    }
    await dropFile(g.tenantId, sig, deps);
    uploaded = null;
    return "replay" in out ? notFound() : out;
  } catch (e) {
    if (uploaded) await dropUnreferenced(tidLog, uploaded, deps);
    await logFail("pickup", tidLog, e);
    return busy();
  }
}

// ═════════════════════════ §3.4 ตีกลับ ═════════════════════════
export async function returnParcel(
  ctx: ParcelCtx,
  i: { unitId: string; parcelId: string; reason: string },
  opts?: { now?: Date },
): Promise<{ ok: true; parcelId: string } | ParcelFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(i)) return fail("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const p = await parcelOfUnit(g, i.parcelId);
    if (!p) return notFound();
    const reason = typeof i.reason === "string" ? i.reason.trim().replace(/\s+/g, " ") : "";
    const len = Array.from(reason).length;
    if (len < 3 || len > 200) return fail("INVALID_INPUT", "ต้องระบุเหตุผลที่ตีกลับ 3–200 ตัวอักษร");
    if (p.status !== "WAITING") return fail("BAD_STATE", p.status === "PICKED_UP" ? "พัสดุชิ้นนี้รับไปแล้ว — ตีกลับไม่ได้" : "พัสดุชิ้นนี้ตีกลับแล้ว");
    void opts;
    const out = await runTx(g.tenantId, g.unitId, async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "DormParcel" SET "status" = 'RETURNED', "updatedAt" = now()
        WHERE "id" = ${p.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" = 'WAITING'`;
      if (n !== 1) throw new Abort(fail("BAD_STATE", "พัสดุชิ้นนี้ไม่อยู่ในสถานะรอรับแล้ว"));
      await audit(tx, g, "dorm.parcel.returned", p.id, { reason });
      return { done: true as const };
    });
    if ("done" in out) return { ok: true, parcelId: p.id };
    return "replay" in out ? notFound() : out;
  } catch (e) {
    await logFail("return", tidLog, e);
    return busy();
  }
}

// ═════════════════════════ §3.5 ลิงก์รับพัสดุ ═════════════════════════
async function pickupUrlOf(p: ParcelDb, now: Date): Promise<string> {
  if (p.status !== "WAITING") return "";
  const lease = await liveLeaseOfParcel(p, now);
  if (!lease) return "";
  const st = await parcelSettings(p.tenantId, p.unitId);
  let token: string;
  try {
    token = signLink({ tenantId: p.tenantId, purpose: PARCEL_PICKUP_PURPOSE, subjectId: p.id, expMin: pickupExpMin(st.holdDays) });
  } catch {
    return ""; // ไม่มี SESSION_SECRET — ไม่มีลิงก์ (ไม่ใช่ลิงก์ที่ปลอมได้)
  }
  return `${appOrigin()}/dp/${token}`;
}

export async function parcelPickupUrl(ctx: { tenantId: string }, i: { parcelId: string }, opts?: { now?: Date }): Promise<string> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i)) return "";
    const p = await parcelOfTenant(ctx.tenantId, i.parcelId);
    return p ? await pickupUrlOf(p, nowOf(opts?.now)) : "";
  } catch {
    return "";
  }
}

// ═════════════════════════ §3.6 แจ้งพัสดุมาถึง ═════════════════════════
type NoticeResult = { status: string; dedupeKey: string | null; duplicate: boolean };
const noSend = (status: string): NoticeResult => ({ status, dedupeKey: null, duplicate: false });

/** สถานะสดสำหรับ precheck: ยัง WAITING · สัญญาเดิมยัง live · หน่วยยังเปิดระบบ */
async function stillDeliverable(tenantId: string, parcelId: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const p = await parcelOfTenant(tenantId, parcelId);
  if (!p) return { ok: false, reason: "NOT_FOUND" };
  if (p.status !== "WAITING") return { ok: false, reason: "NOT_WAITING" };
  if (!(await liveLeaseOfParcel(p, now))) return { ok: false, reason: "NO_LEASE" };
  if (!(await parcelSettings(tenantId, p.unitId)).enabled) return { ok: false, reason: "DISABLED" };
  return { ok: true };
}

async function notifyParcel(
  tenantId: string,
  parcelId: string,
  now: Date,
  kind: "parcelReceived" | "parcelReminder",
): Promise<NoticeResult & { parcel?: ParcelDb }> {
  const p = await parcelOfTenant(tenantId, parcelId);
  if (!p) return noSend("NOT_FOUND");
  if (p.status !== "WAITING") return noSend("NOT_WAITING");
  const lease = await liveLeaseOfParcel(p, now);
  if (!lease) return noSend("NO_LEASE");
  const st = await parcelSettings(tenantId, p.unitId);
  if (!st.enabled) return noSend("DISABLED");
  const days = daysBetween(p.receivedAt, now);
  if (kind === "parcelReminder" && days < st.holdDays) return noSend("NOT_DUE");
  const dedupeKey = kind === "parcelReceived" ? `${KEY_RECEIVED}${p.id}` : `${KEY_REMINDER}${p.id}:${bkkYmd(now).replace(/-/g, "")}`;
  const vars: Record<string, string> = {
    roomNo: lease.roomNumber,
    unitName: lease.unitName,
    carrier: p.carrier || "พัสดุ",
    receivedDate: portalDateLabel(bkkYmd(p.receivedAt)),
    pickupLink: await pickupUrlOf(p, now),
  };
  if (kind === "parcelReminder") vars.daysWaiting = String(days);
  const { notifyCustomer } = await import("@/lib/platform/notify-customer");
  const r = await notifyCustomer(
    { tenantId },
    { unitId: p.unitId, domain: "rooms", messageKey: kind, partyId: lease.partyId, vars, dedupeKey, at: now, precheck: () => stillDeliverable(tenantId, p.id, now) },
  );
  const status = r.precheckFailed ? `SKIPPED_${r.precheckFailed}` : r.status;
  return { status, dedupeKey, duplicate: r.duplicate === true, parcel: p };
}

export async function sendParcelNotice(ctx: { tenantId: string }, i: { parcelId: string }, opts?: { now?: Date }): Promise<NoticeResult> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i) || !isStr(i.parcelId) || !ID_RE.test(i.parcelId)) return noSend("NOT_FOUND");
    const r = await notifyParcel(ctx.tenantId, i.parcelId, nowOf(opts?.now), "parcelReceived");
    return { status: r.status, dedupeKey: r.dedupeKey, duplicate: r.duplicate };
  } catch (e) {
    console.error("[dorm.parcel] notice", errName(e));
    return { status: "FAILED", dedupeKey: null, duplicate: false };
  }
}

/** consumer ของ dorm.parcel.received — อ่านสด (ไม่เชื่อ payload นอกจาก parcelId) · ไม่ throw */
export async function onParcelReceived(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void> {
  try {
    if (!isRec(evt) || evt.type !== EVT_RECEIVED || !isStr(evt.tenantId) || !isRec(evt.payload)) return;
    const parcelId = evt.payload.parcelId;
    if (!isStr(parcelId)) return;
    await sendParcelNotice({ tenantId: evt.tenantId }, { parcelId });
  } catch (e) {
    console.error("[dorm.parcel] consumer", errName(e));
  }
}

// ═════════════════════════ §3.7 หน้าสาธารณะ /dp/<token> ═════════════════════════
export type ParcelPickupView = {
  unitName: string;
  roomNumber: string;
  carrier: string | null;
  trackingLast4: string | null;
  receivedLabel: string;
  daysWaiting: number;
  pickupUrl: string;
  qrSvgDataUrl: string;
};

export async function loadParcelPickup(token: string, opts: { clientKey: string; now?: Date }): Promise<ParcelPickupView | null> {
  try {
    // (1) rate limit ก่อนตรวจอะไร (X7)
    const ck = isRec(opts) && typeof opts.clientKey === "string" && opts.clientKey ? opts.clientKey.slice(0, 200) : "unknown";
    const rl = await checkRateLimitDb(`dorm:parcel:view:${ck}`, PARCEL_RATE.view);
    if (!rl.ok) return null;
    // (2) ลายเซ็น
    const sub = verifyLink(token, PARCEL_PICKUP_PURPOSE);
    if (!sub) return null;
    // (3) พัสดุของร้านใน token · WAITING · สัญญาเดิมยัง live
    const now = nowOf(opts.now);
    const p = await parcelOfTenant(sub.tenantId, sub.subjectId);
    if (!p || p.status !== "WAITING") return null;
    const lease = await liveLeaseOfParcel(p, now);
    if (!lease) return null;
    const origin = appOrigin();
    const pickupUrl = `${origin}/dp/${token}`;
    const svg = await QRCode.toString(pickupUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return {
      unitName: lease.unitName,
      roomNumber: lease.roomNumber,
      carrier: p.carrier,
      trackingLast4: p.trackingNo ? p.trackingNo.slice(-4) : null,
      receivedLabel: portalDateLabel(bkkYmd(p.receivedAt)),
      daysWaiting: daysBetween(p.receivedAt, now),
      pickupUrl,
      qrSvgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  } catch (e) {
    console.error("[dorm.parcel] view", errName(e));
    return null;
  }
}

// ═════════════════════════ §3.8 งานตามเวลา ═════════════════════════
export async function runDormParcelJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ reminded: number; resent: number }> {
  const t0 = Date.now();
  const out = { reminded: 0, resent: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  const at = nowOf(now);
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
  const quiet = new Map<string, boolean>();
  const quietNow = async (tenantId: string, unitId: string): Promise<boolean> => {
    const k = `${tenantId}:${unitId}`;
    if (!quiet.has(k)) {
      const q = (await resolveSettings({ tenantId }, ["messaging.quietHours"], { unitId }))["messaging.quietHours"]?.value;
      quiet.set(k, isRec(q) && typeof q.start === "string" && typeof q.end === "string" ? inQuietWindow(at, q.start, q.end) : false);
    }
    return quiet.get(k) === true;
  };

  // (ก) ส่งแจ้งมาถึงซ้ำ (เวลาเงียบ/ล้ม · ภายใน 3 วัน) — D18-B2: เฉพาะพัสดุที่ยัง WAITING (JOIN ใน SQL) · keyset (at, id) วนจนหมดงบ
  //     อ่านสดไม่ผ่าน / ล้มชนเพดาน ⇒ ปิดแถว log เป็น SKIPPED_PRECHECK_<เหตุ> (สถานะจบ — ไม่ยึดช่องของรอบถัดไป)
  try {
    const since = new Date(at.getTime() - RESEND_WINDOW_MS);
    type Row = { id: string; tenantId: string; unitId: string; dedupeKey: string; status: string; at: Date; parcelId: string };
    const close = (r: Row, reason: string) =>
      tenantDb({ tenantId: r.tenantId }).$executeRaw`
        UPDATE "ServiceMessageLog" SET "status" = ${`SKIPPED_PRECHECK_${reason}`}, "at" = ${new Date()}
        WHERE "id" = ${r.id} AND "tenantId" = ${r.tenantId} AND "status" = ${r.status}`;
    let cur: { at: Date; id: string } | null = null;
    page: for (;;) {
      if (left() < 2_000) break;
      const cAt: Date = cur?.at ?? new Date(0);
      const cId: string = cur?.id ?? "";
      const rows: Row[] = await raw.$queryRaw<Row[]>`
        SELECT s."id", s."tenantId", s."unitId", s."dedupeKey", s."status", s."at", p."id" AS "parcelId" FROM "ServiceMessageLog" s
        JOIN "DormParcel" p ON p."tenantId" = s."tenantId" AND s."dedupeKey" = (${KEY_RECEIVED} || p."id") AND p."status" = 'WAITING'
        WHERE (${tid}::text IS NULL OR s."tenantId" = ${tid}) AND s."domain" = 'rooms' AND s."messageKey" = 'parcelReceived'
          AND s."status" IN ('SKIPPED_QUIET', 'FAILED') AND s."at" >= ${since}
          AND (s."at" > ${cAt} OR (s."at" = ${cAt} AND s."id" > ${cId}))
        ORDER BY s."at" ASC, s."id" ASC LIMIT 200`;
      if (!rows.length) break;
      for (const r of rows) {
        cur = { at: r.at, id: r.id };
        if (left() < 2_000) break page;
        try {
          if (!ID_RE.test(r.parcelId)) continue;
          if (r.status === "SKIPPED_QUIET" && (await quietNow(r.tenantId, r.unitId))) continue;
          if (r.status === "FAILED") {
            const v = await checkRateLimitDb(`dorm:parcel:resend:${r.tenantId}:${r.parcelId}`, { limit: FAILED_RETRY_MAX, windowMs: RESEND_WINDOW_MS }, at.getTime());
            if (!v.ok) {
              await close(r, "RETRY_LIMIT");
              continue;
            }
          }
          const s = await notifyParcel(r.tenantId, r.parcelId, at, "parcelReceived");
          if (s.dedupeKey === null) await close(r, s.status); // NOT_FOUND · NOT_WAITING · NO_LEASE · DISABLED (ไม่ได้เรียก notifyCustomer)
          else if (s.status === "SENT" && !s.duplicate) out.resent++;
        } catch (e) {
          console.error("[dorm.parcel] resend", errName(e));
        }
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    console.error("[dorm.parcel] resend list", errName(e));
  }

  // (ข) เตือนค้าง — วันละครั้งต่อพัสดุ (วันไทย) · ร้านหนึ่งพังไม่หยุดร้านอื่น
  //   D18-B1: กรองใน SQL = WAITING · สัญญาเดิมยัง live · หน่วย DORM ACTIVE · ยังไม่ได้ดำเนินการวันนี้ · ถึงกำหนดตาม holdDays ของหน่วย (เปิดระบบเท่านั้น)
  //   ทุกผลจบ (SENT · NO_CHANNEL · SKIPPED_* · duplicate · NO_LEASE · DISABLED …) ⇒ lastRemindedAt = now (ไม่วนกลับมาวันเดียวกัน)
  //   remindCount +1 เฉพาะผู้ส่งจริง (SENT ไม่ซ้ำ — dedupe ของ notifyCustomer รับประกันวันละ 1) · ล้มลองซ้ำได้ (FAILED/เงียบ/กำลังส่ง) ⇒ ไม่ตั้ง
  //   keyset (createdAt, id) ต่อหน่วย วนจนหมดงบ (ไม่ใช่ LIMIT ครั้งเดียว — ของค้างที่ส่งไม่ได้ไม่บังของที่ถึงกำหนด)
  try {
    const dayStart = bkkDayStart(at);
    const today = bkkYmd(at);
    type UnitRow = { tenantId: string; unitId: string };
    const units: UnitRow[] = await raw.$queryRaw<UnitRow[]>`
      SELECT DISTINCT p."tenantId", p."unitId" FROM "DormParcel" p
      JOIN "BusinessUnit" u ON u."id" = p."unitId" AND u."tenantId" = p."tenantId" AND u."type"::text = 'DORM' AND u."status"::text = 'ACTIVE'
      JOIN "DormLease" l ON l."id" = p."leaseId" AND l."tenantId" = p."tenantId" AND l."unitId" = p."unitId" AND l."roomId" = p."roomId"
        AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL AND (l."endDate" IS NULL OR l."endDate" >= ${today}::date)
      WHERE (${tid}::text IS NULL OR p."tenantId" = ${tid}) AND p."status" = 'WAITING' AND p."receivedAt" < ${dayStart}
        AND (p."lastRemindedAt" IS NULL OR p."lastRemindedAt" < ${dayStart})
      ORDER BY p."tenantId" ASC, p."unitId" ASC LIMIT 2000`;
    unitLoop: for (const u of units) {
      if (left() < 2_000) break;
      try {
        const st = await parcelSettings(u.tenantId, u.unitId);
        if (!st.enabled) continue;
        if (await quietNow(u.tenantId, u.unitId)) continue; // ไม่ส่งย้อนหลัง: พ้นเวลาเงียบค่อยส่งของวันนี้
        const cutoff = new Date(dayStart.getTime() - (st.holdDays - 1) * DAY_MS);
        const db = tenantDb({ tenantId: u.tenantId, unitId: u.unitId });
        const mark = (id: string) => db.$executeRaw`
          UPDATE "DormParcel" SET "lastRemindedAt" = ${at}, "updatedAt" = now()
          WHERE "id" = ${id} AND "tenantId" = ${u.tenantId} AND ("lastRemindedAt" IS NULL OR "lastRemindedAt" < ${dayStart})`;
        let cur: { createdAt: Date; id: string } | null = null;
        for (;;) {
          if (left() < 2_000) break unitLoop;
          type Row = { id: string; createdAt: Date };
          const cAt: Date = cur?.createdAt ?? new Date(0);
          const cId: string = cur?.id ?? "";
          const rows: Row[] = await db.$queryRaw<Row[]>`
            SELECT p."id", p."createdAt" FROM "DormParcel" p
            JOIN "DormLease" l ON l."id" = p."leaseId" AND l."tenantId" = p."tenantId" AND l."unitId" = p."unitId" AND l."roomId" = p."roomId"
              AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL AND (l."endDate" IS NULL OR l."endDate" >= ${today}::date)
            WHERE p."tenantId" = ${u.tenantId} AND p."unitId" = ${u.unitId} AND p."status" = 'WAITING' AND p."receivedAt" < ${cutoff}
              AND (p."lastRemindedAt" IS NULL OR p."lastRemindedAt" < ${dayStart})
              AND (p."createdAt" > ${cAt} OR (p."createdAt" = ${cAt} AND p."id" > ${cId}))
            ORDER BY p."createdAt" ASC, p."id" ASC LIMIT 100`;
          if (!rows.length) break;
          for (const r of rows) {
            cur = { createdAt: r.createdAt, id: r.id };
            if (left() < 2_000) break unitLoop;
            try {
              const s = await notifyParcel(u.tenantId, r.id, at, "parcelReminder");
              if (s.status === "SENT" && !s.duplicate) {
                out.reminded++;
                await db.$executeRaw`
                  UPDATE "DormParcel" SET "remindCount" = "remindCount" + 1, "lastRemindedAt" = ${at}, "updatedAt" = now()
                  WHERE "id" = ${r.id} AND "tenantId" = ${u.tenantId}`;
              } else if (s.status === "SENDING" || (!s.duplicate && (s.status === "FAILED" || s.status === "SKIPPED_QUIET"))) {
                // ลองซ้ำได้ (อีกทางกำลังส่ง · ล้มชั่วคราว · เวลาเงียบ) — ไม่ตั้ง
              } else await mark(r.id);
            } catch (e) {
              console.error("[dorm.parcel] remind", errName(e));
            }
          }
          if (rows.length < 100) break;
        }
      } catch (e) {
        console.error("[dorm.parcel] remind unit", errName(e));
      }
    }
  } catch (e) {
    console.error("[dorm.parcel] remind list", errName(e));
  }
  return out;
}

/** ห้องในขอบเขตของผู้ใช้ (ตัวเลือกฟอร์มรับพัสดุของจอพนักงาน) — ด่านเดียวกับ listParcels · ไม่ผ่าน ⇒ null */
export async function parcelRoomsFor(ctx: ParcelCtx, i: { unitId: string }): Promise<{ roomId: string; roomNumber: string }[] | null> {
  try {
    if (!isRec(i)) return null;
    const g = await staffGate(ctx, i.unitId);
    if (!g) return null;
    const rows = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findMany({
      where: g.visible === null ? {} : { id: { in: [...g.visible] } },
      orderBy: [{ number: "asc" }, { id: "asc" }],
      take: 2000,
      select: { id: true, number: true },
    });
    return rows.map((r) => ({ roomId: r.id, roomNumber: r.number }));
  } catch (e) {
    console.error("[dorm.parcel] rooms", errName(e));
    return null;
  }
}

// ═════════════════════════ §3.9 postback dorm.parcel (ตัวช่วยของ dorm-line) ═════════════════════════
/**
 * พัสดุที่รอรับของสัญญาเหล่านี้ (ผู้เรียกตรวจแล้วว่าเป็นสัญญา live ของผู้กด) ในหน่วยที่เปิดระบบ · ≤ 5 รายการ · อ่านล้วน (ไม่เขียนฐาน)
 *   enabled = มีหน่วยของสัญญาที่เปิดระบบพัสดุอย่างน้อย 1 หน่วย
 */
export async function parcelsForLeases(
  ctx: { tenantId: string },
  leases: readonly { id: string; unitId: string }[],
  opts?: { now?: Date },
): Promise<{ enabled: boolean; items: { roomNumber: string; url: string }[] }> {
  const none = { enabled: false, items: [] as { roomNumber: string; url: string }[] };
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !Array.isArray(leases) || !leases.length) return none;
    const now = nowOf(opts?.now);
    const tenantId = ctx.tenantId;
    const units = [...new Set(leases.map((l) => l.unitId).filter(isStr))];
    const on: string[] = [];
    for (const u of units) if ((await parcelSettings(tenantId, u)).enabled) on.push(u);
    if (!on.length) return none;
    const leaseIds = leases.filter((l) => on.includes(l.unitId) && isStr(l.id)).map((l) => l.id);
    if (!leaseIds.length) return { enabled: true, items: [] };
    const rows = await tenantDb({ tenantId }).$queryRaw<ParcelDb[]>`
      SELECT "id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "carrier", "trackingNo", "photoFileId", "status", "receivedAt"
      FROM "DormParcel"
      WHERE "tenantId" = ${tenantId} AND "leaseId" = ANY(${leaseIds}::text[]) AND "unitId" = ANY(${on}::text[]) AND "status" = 'WAITING'
      ORDER BY "receivedAt" ASC, "id" ASC LIMIT ${POSTBACK_MAX}`;
    const items: { roomNumber: string; url: string }[] = [];
    for (const p of rows) {
      const lease = await liveLeaseOfParcel(p, now);
      if (!lease) continue;
      const url = await pickupUrlOf(p, now);
      if (url) items.push({ roomNumber: lease.roomNumber, url });
    }
    return { enabled: true, items };
  } catch (e) {
    console.error("[dorm.parcel] postback", errName(e));
    return none;
  }
}
// ◂ SVC D.18
