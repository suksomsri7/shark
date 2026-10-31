// SVC D.16 ▸ แจ้งซ่อมหอ (ผู้เช่าแจ้งในพอร์ทัล ⇒ การ์ดบอร์ดงานผ่านสะพาน ⇒ การ์ดเสร็จ ⇒ สถานะ ⇒ LINE ⇒ ให้คะแนน · มือถือช่าง หอ 13ค)
//   สัญญา ledger/svc-briefs/svc-brief-d.16.md §2 §3 (มติผู้คุม R1–R12)
//   • แจ้งซ้ำคีย์เดิม = แถวเดียว: id แถวคำนวณจาก (ร้าน, สัญญา, คีย์) + INSERT … ON CONFLICT ("id") DO NOTHING (R1 · ไม่มี migration)
//   • ด่าน token ของพอร์ทัลลำดับตายตัว (X7): rate limit → verifyLink → สัญญา live → งานของสัญญานี้ · ล้มทุกแบบ = ผลเดียวกันทุกไบต์
//   • รูปเป็นไฟล์ส่วนตัว (private) · ออกได้ทาง DTO พนักงานเป็นลิงก์ /api/files ผูกผู้ดูเท่านั้น · พอร์ทัล/การ์ด/LINE ไม่มีไฟล์ (X10)
//   • DONE เป็นสถานะจบ (R6) · CAS ทุกการเปลี่ยนสถานะ · event done อยู่ใน tx เดียวกับ CAS ⇒ LINE ครั้งเดียวผ่าน dedupe ของ notifyCustomer
//   • การ์ดบอร์ดงานไม่ได้สร้างที่นี่ — สะพานบอร์ดงาน (platform) ฟัง event แล้วเขียนกลับผ่าน linkRepairCard / applyRepairCardState
//   • tenantDb เท่านั้น (F5.1) · ไม่เปิด connection ที่สองระหว่างถือ tx · 40P01 ⇒ ลองซ้ำ 1 ครั้ง แล้ว BUSY · ไม่ throw ออก
//   • ไม่มีชื่อ/เบอร์/ข้อความผู้เช่า/token ใน payload/audit/log
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { SIGNED_LINK_MAX_MIN, signLink, verifyLink } from "@/lib/core/signed-link";
import { deleteFileAsset, privateFileUrl, uploadFile } from "@/lib/storage/service";
import { dormStaffGate, portalDateLabel, portalLiveLease, type PortalLeaseRow } from "./portal";
import { dormVisibleRoomsFor } from "./scope";

type Tx = Prisma.TransactionClient;

export const REPAIR_SOURCE_PREFIX = "dorm.repair#";
/** ถังแจ้ง/ให้คะแนน (ค่าคงที่ความปลอดภัย) · ถัง view = dorm:portal:view ของ D.9 (120/10 นาที) */
export const REPAIR_RATE = { submit: { limit: 10, windowMs: 600_000 } } as const;
export const REPAIR_NF_REASON = "ไม่พบงานแจ้งซ่อมหรือห้องที่ระบุ หรือลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากหอทางแชท LINE";

export type RepairStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type RepairCtx = { tenantId: string; actorUserId: string };
export type RepairFile = { data?: Uint8Array; read?: () => Promise<Uint8Array>; size?: number; contentType: string };
export type RepairFileDeps = { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> };
/** BUSY = ฐานข้อมูลชนกัน (40P01) ซ้ำหลังลองใหม่ 1 ครั้ง / ระบบขัดข้อง — ไม่มีอะไรเปลี่ยน ลองใหม่ได้ */
export type RepairFailCode =
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "INVALID_FILE"
  | "TOO_MANY"
  | "UPLOAD_FAILED"
  | "ALREADY_DONE"
  | "NOT_DONE"
  | "ALREADY_RATED"
  | "BUSY";
export type RepairFail = { ok: false; code: RepairFailCode; reason: string };
export type RepairRow = {
  repairId: string;
  ticketNo: string;
  roomId: string;
  roomNumber: string;
  buildingId: string | null;
  category: string;
  categoryLabel: string;
  text: string;
  status: RepairStatus;
  allowEntry: boolean;
  preferredTime: string | null;
  createdAt: string;
  doneAt: string | null;
  rating: number | null;
  photoCount: number;
  cardLinked: boolean;
  tenantFirstName: string | null;
};
export type RepairJob = RepairRow & {
  text: string;
  photos: { url: string }[];
  afterPhotos: { url: string }[];
  boardName: string;
  payer: "DORM" | "TENANT";
  payerLabelTh: string;
  canComplete: boolean;
};
export type RepairList = { ok: true; unitName: string; rows: RepairRow[]; counts: { open: number; inProgress: number; done: number; cancelled: number } };
export type PortalRepairItem = {
  repairId: string;
  ticketNo: string;
  categoryLabel: string;
  text: string;
  status: RepairStatus;
  statusLabel: string;
  createdLabel: string;
  doneLabel: string | null;
  rating: number | null;
  canRate: boolean;
  current: boolean;
};
export type PortalRepairView = {
  unitName: string;
  roomNumber: string;
  categories: { code: string; labelTh: string }[];
  entryDefault: boolean;
  items: PortalRepairItem[];
  links: { self: string; portal: string };
};

// ───────────────────────── ค่าคงที่/ตัวช่วย ─────────────────────────
const PERM = "dorm.repair.manage";
const PORTAL_PURPOSE = "dorm.portal";
const EVT_CREATED = "dorm.repair.created";
const EVT_DONE = "dorm.repair.done";
const VIEW_RATE = { limit: 120, windowMs: 600_000 } as const;
const KEY_RE = /^[A-Za-z0-9_-]{8,80}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TEXT = 1000;
const MAX_TIME = 120;
const MAX_NOTE = 300;
const MAX_PHOTOS = 4;
const MAX_ACTIVE = 10;
const MAX_ROWS = 500;
const MAX_PORTAL_ITEMS = 20;
const ROW_TEXT = 200;
const MB = 1024 * 1024;
const FILES_MAX = 10 * MB;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const DAY_MS = 86_400_000;
const DAY_MIN = 1440;
const RESEND_WINDOW_MS = 3 * DAY_MS;
const FAILED_RETRY_MAX = 5;
const KEY_DONE = "rooms:repairDone:";
const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

const STATUS_TH: Record<RepairStatus, string> = { OPEN: "รับเรื่องแล้ว", IN_PROGRESS: "กำลังซ่อม", DONE: "ซ่อมเสร็จแล้ว", CANCELLED: "ยกเลิก" };
const PAYER_TH: Record<"DORM" | "TENANT", string> = { DORM: "หอจ่าย", TENANT: "ผู้เช่าจ่าย" };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const fail = (code: RepairFailCode, reason: string): RepairFail => ({ ok: false, code, reason });
const notFound = (): RepairFail => ({ ok: false, code: "NOT_FOUND", reason: REPAIR_NF_REASON });
const busy = (): RepairFail => fail("BUSY", "ระบบแจ้งซ่อมไม่ว่างชั่วคราว — ไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง");
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");
const statusOf = (s: string): RepairStatus => (s === "IN_PROGRESS" || s === "DONE" || s === "CANCELLED" ? s : "OPEN");
const keyOf = (v: unknown): string => (typeof v === "string" ? v.slice(0, 128) : "") || "unknown";
const chars = (s: string) => Array.from(s).length;
const clip = (s: string, n: number) => (chars(s) > n ? `${Array.from(s).slice(0, n - 1).join("")}…` : s);

/** เลขงาน (R2) = "R-" + 6 ตัวท้ายของ id */
export const repairTicketNo = (repairId: string): string => `R-${repairId.slice(-6).toUpperCase()}`;

class Abort extends Error {
  constructor(public readonly result: RepairFail | { replay: true }) {
    super("dorm.repair abort");
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
    await logOps("ERROR", `dorm.repair.${where}`, "บริการแจ้งซ่อมหอขัดข้อง", { tenantId, detail: errName(e) });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

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

/** id แถวคำแจ้งจากคีย์ส่งซ้ำ (R1 ทาง ก) */
function repairIdOf(tenantId: string, leaseId: string, key: string): string {
  return `rep${createHash("sha256").update(`dorm.repair:v1:${tenantId}:${leaseId}:${key}`).digest("hex").slice(0, 25)}`;
}

// ───────────────────────── ค่าตั้ง #59 #60 #61 ─────────────────────────
type Category = { code: string; labelTh: string; board: string; assigneeId: string | null };

async function categoriesOf(tenantId: string, unitId: string): Promise<Category[]> {
  const v = (await resolveSettings({ tenantId }, ["rooms.repair.categories"], { unitId }))["rooms.repair.categories"]?.value;
  if (!Array.isArray(v)) return [];
  const out: Category[] = [];
  for (const x of v) {
    if (!isRec(x) || !isStr(x.code) || !isStr(x.labelTh) || !isStr(x.board)) continue;
    out.push({ code: x.code, labelTh: x.labelTh, board: x.board, assigneeId: isStr(x.assigneeId) ? x.assigneeId : null });
  }
  return out;
}

async function payerOf(tenantId: string, unitId: string, category: string): Promise<"DORM" | "TENANT"> {
  const v = (await resolveSettings({ tenantId }, ["rooms.repair.payer"], { unitId }))["rooms.repair.payer"]?.value;
  const p = isRec(v) ? (v[category] ?? v._default) : undefined;
  return p === "TENANT" ? "TENANT" : "DORM";
}

async function entryDefaultOf(tenantId: string, lease: PortalLeaseRow): Promise<boolean> {
  const v = (await resolveSettings({ tenantId }, ["rooms.access.roomEntry"], { unitId: lease.unitId, roomId: lease.roomId, leaseId: lease.id }))["rooms.access.roomEntry"]?.value;
  return v === "STANDING_PERMISSION";
}

async function portalDays(tenantId: string, unitId: string): Promise<number> {
  const v = (await resolveSettings({ tenantId }, ["rooms.notify.portalLinkDays"], { unitId }))["rooms.notify.portalLinkDays"]?.value;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 1;
}

// ───────────────────────── รูป (X6 · X10) ─────────────────────────
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
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

type Declared = { src: Record<string, unknown>; contentType: string; size: number };
/** ขนาดที่แจ้ง (size/data.length) + ชนิด — ตรวจก่อนอ่านไบต์เสมอ · ผิด ⇒ null */
function declaredFiles(list: readonly unknown[]): Declared[] | null {
  const out: Declared[] = [];
  let total = 0;
  for (const f of list) {
    if (!isRec(f)) return null;
    const size = typeof f.size === "number" ? f.size : f.data instanceof Uint8Array ? f.data.length : -1;
    if (!Number.isInteger(size) || size < 1 || size > FILES_MAX) return null;
    total += size;
    if (total > FILES_MAX) return null;
    const ct = typeof f.contentType === "string" ? f.contentType.split(";")[0].trim().toLowerCase() : "";
    if (!(PHOTO_TYPES as readonly string[]).includes(ct)) return null;
    out.push({ src: f, contentType: ct, size });
  }
  return out;
}
/** อ่านไบต์ (หลังผ่านด่านขนาด/ชนิด) + ไบต์หัวตรงชนิด · ผิด ⇒ null */
async function readFiles(list: Declared[]): Promise<{ data: Uint8Array; contentType: string }[] | null> {
  const out: { data: Uint8Array; contentType: string }[] = [];
  let total = 0;
  for (const d of list) {
    let data: unknown = d.src.data;
    if (!(data instanceof Uint8Array)) {
      const read = d.src.read;
      if (typeof read !== "function") return null;
      try {
        data = await (read as () => Promise<unknown>)();
      } catch {
        return null;
      }
    }
    if (!(data instanceof Uint8Array) || data.length < 1 || data.length > FILES_MAX) return null;
    total += data.length;
    if (total > FILES_MAX) return null;
    if (!sniffOk(d.contentType, data)) return null;
    out.push({ data, contentType: d.contentType });
  }
  return out;
}

async function putPrivate(tenantId: string, f: { data: Uint8Array; contentType: string }, label: string, deps: RepairFileDeps | undefined): Promise<string | null> {
  try {
    const r = await uploadFile(
      { tenantId },
      { kind: "ATTACHMENT", visibility: "private", filename: `${label}.${EXT[f.contentType] ?? "bin"}`, contentType: f.contentType, data: f.data, maxBytes: FILES_MAX },
      deps?.put ? { put: deps.put } : undefined,
    );
    return r.ok ? r.assetId : null;
  } catch {
    return null;
  }
}
async function dropFiles(tenantId: string, ids: readonly string[], deps: RepairFileDeps | undefined): Promise<void> {
  for (const id of ids) {
    try {
      await deleteFileAsset({ tenantId }, id, deps?.put ? { del: deps.del ?? (async () => 200) } : undefined);
    } catch {
      /* best-effort — ไฟล์ส่วนตัวที่ค้างไม่มีลิงก์ใดชี้ */
    }
  }
}
/** อัปทุกรูป · ล้มตัวใด ⇒ ลบที่อัปแล้ว · คืน null */
async function uploadAll(tenantId: string, files: { data: Uint8Array; contentType: string }[], label: string, deps: RepairFileDeps | undefined): Promise<string[] | null> {
  const ids: string[] = [];
  for (const f of files) {
    const id = await putPrivate(tenantId, f, label, deps);
    if (!id) {
      await dropFiles(tenantId, ids, deps);
      return null;
    }
    ids.push(id);
  }
  return ids;
}
/** ลบไฟล์ในเส้นทางพังเฉพาะเมื่อไม่มีแถวคำแจ้งอ้างไฟล์นั้น (tx อาจ commit แล้วแต่ผลหายระหว่างทาง) */
async function dropUnreferenced(tenantId: string, ids: readonly string[], deps: RepairFileDeps | undefined): Promise<void> {
  if (!isStr(tenantId) || !ids.length) return;
  const keep: string[] = [];
  try {
    for (const id of ids) {
      const ref = await tenantDb({ tenantId }).$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "DormRepair" WHERE "tenantId" = ${tenantId} AND "files" @> ${JSON.stringify([{ fileId: id }])}::jsonb LIMIT 1`;
      if (!ref.length) keep.push(id);
    }
  } catch {
    return;
  }
  await dropFiles(tenantId, keep, deps);
}

type FileRef = { fileId: string; role: "TENANT" | "AFTER" };
function filesOf(v: unknown): FileRef[] {
  if (!Array.isArray(v)) return [];
  const out: FileRef[] = [];
  for (const x of v) if (isRec(x) && isStr(x.fileId) && (x.role === "TENANT" || x.role === "AFTER")) out.push({ fileId: x.fileId, role: x.role });
  return out;
}

// ───────────────────────── แถวคำแจ้ง ─────────────────────────
type RepairDb = {
  id: string;
  tenantId: string;
  unitId: string;
  roomId: string;
  leaseId: string | null;
  partyId: string | null;
  category: string;
  text: string;
  files: Prisma.JsonValue | null;
  preferredTime: string | null;
  allowEntry: boolean;
  status: string;
  kanbanCardId: string | null;
  doneAt: Date | null;
  rating: number | null;
  createdAt: Date;
};

async function repairOfTenant(tenantId: string, repairId: unknown): Promise<RepairDb | null> {
  if (!isStr(tenantId) || !isStr(repairId) || !ID_RE.test(repairId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<RepairDb[]>`
    SELECT "id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "category", "text", "files", "preferredTime", "allowEntry", "status",
           "kanbanCardId", "doneAt", "rating", "createdAt"
    FROM "DormRepair" WHERE "tenantId" = ${tenantId} AND "id" = ${repairId} LIMIT 1`;
  return rows[0] ?? null;
}

/** สัญญาของงานยัง live ไหม (สัญญาเดิม · หน่วย/ห้องเดิม) */
async function liveLeaseOfRepair(r: RepairDb, now: Date): Promise<PortalLeaseRow | null> {
  if (!r.leaseId) return null;
  const l = await portalLiveLease(r.tenantId, r.leaseId, bkkYmd(now));
  return l && l.unitId === r.unitId && l.roomId === r.roomId ? l : null;
}

function auditOf(
  tx: Tx,
  a: { tenantId: string; unitId: string; actorUserId: string | null; action: string; repairId: string; after: Record<string, string | number> },
) {
  return tx.auditLog.create({
    data: {
      tenantId: a.tenantId,
      unitId: a.unitId,
      actorType: a.actorUserId ? "USER" : "SYSTEM",
      actorId: a.actorUserId,
      action: a.action,
      targetType: "DormRepair",
      targetId: a.repairId,
      after: a.after,
    },
  });
}

const emitDone = (tx: Tx, r: { tenantId: string; unitId: string; id: string; roomId: string; category: string }) =>
  emitOutbox(tx, {
    tenantId: r.tenantId,
    unitId: r.unitId,
    type: EVT_DONE,
    idempotencyKey: `${EVT_DONE}:${r.id}`,
    payload: { unitId: r.unitId, repairId: r.id, roomId: r.roomId, category: r.category },
  });

// ═════════════════════════ §3.1 พอร์ทัล — ด่าน token ═════════════════════════
type PortalGate = { ok: true; tenantId: string; lease: PortalLeaseRow } | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" };

/** rate → verifyLink → สัญญา live (วิ่งคิวรีสัญญาเสมอแม้ token ล้ม — เวลาตอบใกล้กัน) */
async function portalGate(token: unknown, bucket: string, rate: { limit: number; windowMs: number }, clientKey: unknown, now: Date): Promise<PortalGate> {
  const rl = await checkRateLimitDb(`${bucket}${keyOf(clientKey)}`, rate, now.getTime());
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const v = verifyLink(token, PORTAL_PURPOSE);
  const lease = await portalLiveLease(v?.tenantId ?? "", v?.subjectId ?? "", bkkYmd(now));
  if (!v || !lease || lease.tenantId !== v.tenantId || lease.id !== v.subjectId) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, tenantId: v.tenantId, lease };
}
const rateFail = () => fail("RATE_LIMITED", "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

// ═════════════════════════ §3.1 แจ้งซ่อม ═════════════════════════
export async function submitPortalRepair(
  token: string,
  i: { category: string; text: string; allowEntry: boolean; preferredTime?: string | null; photos?: RepairFile[]; idempotencyKey: string },
  opts: { clientKey: string; now?: Date; deps?: RepairFileDeps },
): Promise<{ ok: true; repairId: string; replayed: boolean } | RepairFail> {
  const now = nowOf(isRec(opts) ? opts.now : undefined);
  const deps = isRec(opts) ? opts.deps : undefined;
  let tidLog = "";
  let uploaded: string[] = [];
  try {
    // (1) rate limit ก่อนตรวจ token · (2) token + สัญญา live
    const g = await portalGate(token, "dorm:repair:submit:", REPAIR_RATE.submit, isRec(opts) ? opts.clientKey : "", now);
    if (!g.ok) return g.code === "RATE_LIMITED" ? rateFail() : notFound();
    const { tenantId, lease } = g;
    tidLog = tenantId;
    // (3) รูปแบบ input
    if (!isRec(i)) return fail("INVALID_INPUT", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    if (typeof i.idempotencyKey !== "string" || !KEY_RE.test(i.idempotencyKey)) return fail("INVALID_INPUT", "รหัสกันส่งซ้ำไม่ถูกต้อง — เปิดหน้าแจ้งซ่อมใหม่แล้วลองอีกครั้ง");
    const cats = await categoriesOf(tenantId, lease.unitId);
    const cat = typeof i.category === "string" ? cats.find((c) => c.code === i.category) : undefined;
    if (!cat) return fail("INVALID_INPUT", "เลือกหมวดงานซ่อมจากรายการ");
    const text = typeof i.text === "string" ? i.text.trim() : "";
    if (!text || chars(text) > MAX_TEXT) return fail("INVALID_INPUT", `เล่าอาการที่ต้องซ่อม 1–${MAX_TEXT} ตัวอักษร`);
    let preferredTime: string | null = null;
    if (i.preferredTime !== undefined && i.preferredTime !== null) {
      if (typeof i.preferredTime !== "string") return fail("INVALID_INPUT", "เวลาสะดวกไม่ถูกต้อง");
      const t = i.preferredTime.trim();
      if (chars(t) > MAX_TIME) return fail("INVALID_INPUT", `เวลาสะดวกยาวได้ไม่เกิน ${MAX_TIME} ตัวอักษร`);
      preferredTime = t || null;
    }
    if (typeof i.allowEntry !== "boolean") return fail("INVALID_INPUT", "ระบุว่าให้ช่างเข้าห้องตอนไม่อยู่ได้หรือไม่");
    const photosIn = i.photos === undefined || i.photos === null ? [] : i.photos;
    if (!Array.isArray(photosIn) || photosIn.length > MAX_PHOTOS) return fail("INVALID_INPUT", `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
    // (4) คีย์เดิมมีแถวแล้ว ⇒ ผลเดิมทันที (ก่อนอ่านรูป)
    const repairId = repairIdOf(tenantId, lease.id, i.idempotencyKey);
    const prev = await repairOfTenant(tenantId, repairId);
    if (prev) return prev.leaseId === lease.id ? { ok: true, repairId, replayed: true } : notFound();
    // (5) งานค้างต่อสัญญา
    const tooMany = fail("TOO_MANY", `มีเรื่องแจ้งซ่อมที่ยังไม่เสร็จครบ ${MAX_ACTIVE} เรื่องแล้ว — รอหอดำเนินการก่อน หรือติดต่อหอทางแชท`);
    if ((await activeCount(tenantId, lease.id)) >= MAX_ACTIVE) return tooMany;
    // (6) รูป: ขนาดที่แจ้ง → ชนิด → อ่านไบต์ → ไบต์หัว
    const badFile = fail("INVALID_FILE", "แนบได้เฉพาะรูป JPEG, PNG, WebP หรือ HEIC รวมกันไม่เกิน 10 MB");
    const declared = declaredFiles(photosIn);
    if (!declared) return badFile;
    const files = await readFiles(declared);
    if (!files) return badFile;
    // (7) อัปไฟล์ส่วนตัว
    const ids = await uploadAll(tenantId, files, "repair-photo", deps);
    if (!ids) return fail("UPLOAD_FAILED", "อัปโหลดรูปไม่สำเร็จ — ลองใหม่อีกครั้ง");
    uploaded = ids;
    const filesJson = ids.length ? JSON.stringify(ids.map((fileId) => ({ fileId, role: "TENANT" }))) : null;
    // (8) tx: ล็อกต่อสัญญา → ซ้ำ ⇒ replay · เพดานค้าง · INSERT ON CONFLICT DO NOTHING · event · audit
    const out = await runTx(tenantId, lease.unitId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dorm.repair.lease:${tenantId}:${lease.id}`}, 0))`;
      const mine = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "DormRepair" WHERE "id" = ${repairId} AND "tenantId" = ${tenantId} LIMIT 1`;
      if (mine.length) throw new Abort({ replay: true });
      const act = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS "n" FROM "DormRepair" WHERE "tenantId" = ${tenantId} AND "leaseId" = ${lease.id} AND "status" IN ('OPEN', 'IN_PROGRESS')`;
      if ((act[0]?.n ?? 0) >= MAX_ACTIVE) throw new Abort(tooMany);
      const n = await tx.$executeRaw`
        INSERT INTO "DormRepair" ("id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "category", "text", "files", "preferredTime", "allowEntry", "status", "createdAt", "updatedAt")
        VALUES (${repairId}, ${tenantId}, ${lease.unitId}, ${lease.roomId}, ${lease.id}, ${lease.partyId}, ${cat.code}, ${text}, ${filesJson}::jsonb, ${preferredTime}, ${i.allowEntry}, 'OPEN', ${now}, now())
        ON CONFLICT ("id") DO NOTHING`;
      if (n !== 1) throw new Abort({ replay: true });
      await emitOutbox(tx, {
        tenantId,
        unitId: lease.unitId,
        type: EVT_CREATED,
        idempotencyKey: `${EVT_CREATED}:${repairId}`,
        payload: { unitId: lease.unitId, repairId, roomId: lease.roomId, category: cat.code },
      });
      await auditOf(tx, {
        tenantId,
        unitId: lease.unitId,
        actorUserId: null,
        action: EVT_CREATED,
        repairId,
        after: { roomId: lease.roomId, category: cat.code, photos: ids.length, allowEntry: i.allowEntry ? "true" : "false" },
      });
      return { done: true as const };
    });
    if ("done" in out) {
      uploaded = [];
      return { ok: true, repairId, replayed: false };
    }
    await dropFiles(tenantId, ids, deps);
    uploaded = [];
    if ("replay" in out) return { ok: true, repairId, replayed: true };
    return out;
  } catch (e) {
    if (uploaded.length) await dropUnreferenced(tidLog, uploaded, deps);
    await logFail("submit", tidLog, e);
    return busy();
  }
}

async function activeCount(tenantId: string, leaseId: string): Promise<number> {
  const r = await tenantDb({ tenantId }).$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "DormRepair" WHERE "tenantId" = ${tenantId} AND "leaseId" = ${leaseId} AND "status" IN ('OPEN', 'IN_PROGRESS')`;
  return r[0]?.n ?? 0;
}

// ═════════════════════════ §3.1 หน้าแจ้งซ่อมของผู้เช่า ═════════════════════════
export async function loadPortalRepairs(token: string, q: { r?: string | null }, opts: { clientKey: string; now?: Date }): Promise<PortalRepairView | null> {
  try {
    const now = nowOf(isRec(opts) ? opts.now : undefined);
    const g = await portalGate(token, "dorm:portal:view:", VIEW_RATE, isRec(opts) ? opts.clientKey : "", now);
    const want = isRec(q) && q.r !== undefined && q.r !== null && q.r !== "" ? q.r : null;
    if (!g.ok) return null;
    const { tenantId, lease } = g;
    const rows = await tenantDb({ tenantId }).$queryRaw<RepairDb[]>`
      SELECT "id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "category", "text", "files", "preferredTime", "allowEntry", "status",
             "kanbanCardId", "doneAt", "rating", "createdAt"
      FROM "DormRepair" WHERE "tenantId" = ${tenantId} AND "leaseId" = ${lease.id}
      ORDER BY "createdAt" DESC, "id" DESC LIMIT ${MAX_PORTAL_ITEMS}`;
    if (want !== null) {
      if (typeof want !== "string" || !ID_RE.test(want)) return null;
      const r = rows.find((x) => x.id === want) ?? (await repairOfTenant(tenantId, want));
      if (!r || r.leaseId !== lease.id) return null;
      if (!rows.some((x) => x.id === r.id)) rows.push(r);
    }
    const cats = await categoriesOf(tenantId, lease.unitId);
    const labelOf = (code: string) => cats.find((c) => c.code === code)?.labelTh ?? code;
    const t = typeof token === "string" ? token : "";
    return {
      unitName: lease.unitName,
      roomNumber: lease.roomNumber,
      categories: cats.map((c) => ({ code: c.code, labelTh: c.labelTh })),
      entryDefault: await entryDefaultOf(tenantId, lease),
      items: rows.map((r) => {
        const status = statusOf(r.status);
        return {
          repairId: r.id,
          ticketNo: repairTicketNo(r.id),
          categoryLabel: labelOf(r.category),
          text: r.text,
          status,
          statusLabel: STATUS_TH[status],
          createdLabel: portalDateLabel(bkkYmd(r.createdAt)),
          doneLabel: r.doneAt ? portalDateLabel(bkkYmd(r.doneAt)) : null,
          rating: r.rating,
          canRate: status === "DONE" && r.rating === null,
          current: want !== null && r.id === want,
        };
      }),
      links: { self: `/d/${t}/repair`, portal: `/d/${t}` },
    };
  } catch (e) {
    console.error("[dorm.repair] view", errName(e));
    return null;
  }
}

// ═════════════════════════ §3.1 ให้คะแนน ═════════════════════════
export async function ratePortalRepair(
  token: string,
  i: { repairId: string; rating: number; note?: string | null },
  opts: { clientKey: string; now?: Date },
): Promise<{ ok: true } | RepairFail> {
  let tidLog = "";
  try {
    const now = nowOf(isRec(opts) ? opts.now : undefined);
    const g = await portalGate(token, "dorm:repair:submit:", REPAIR_RATE.submit, isRec(opts) ? opts.clientKey : "", now);
    if (!g.ok) return g.code === "RATE_LIMITED" ? rateFail() : notFound();
    const { tenantId, lease } = g;
    tidLog = tenantId;
    const r = await repairOfTenant(tenantId, isRec(i) ? i.repairId : null);
    if (!r || r.leaseId !== lease.id) return notFound();
    const rating = isRec(i) ? i.rating : undefined;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail("INVALID_INPUT", "ให้คะแนนเป็นจำนวนเต็ม 1–5 ดาว");
    let note: string | null = null;
    if (i.note !== undefined && i.note !== null) {
      if (typeof i.note !== "string") return fail("INVALID_INPUT", "หมายเหตุไม่ถูกต้อง");
      const t = i.note.trim();
      if (chars(t) > MAX_NOTE) return fail("INVALID_INPUT", `หมายเหตุยาวได้ไม่เกิน ${MAX_NOTE} ตัวอักษร`);
      note = t || null;
    }
    if (statusOf(r.status) !== "DONE") return fail("NOT_DONE", "งานซ่อมนี้ยังไม่เสร็จ — ให้คะแนนได้หลังซ่อมเสร็จ");
    const out = await runTx(tenantId, r.unitId, async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "DormRepair" SET "rating" = ${rating}, "ratingNote" = ${note}, "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${tenantId} AND "leaseId" = ${lease.id} AND "status" = 'DONE' AND "rating" IS NULL`;
      if (n !== 1) throw new Abort(fail("ALREADY_RATED", "ให้คะแนนงานซ่อมนี้ไปแล้ว — ขอบคุณค่ะ"));
      await auditOf(tx, { tenantId, unitId: r.unitId, actorUserId: null, action: "dorm.repair.rated", repairId: r.id, after: { rating } });
      return { done: true as const };
    });
    if ("done" in out) return { ok: true };
    return "replay" in out ? notFound() : out;
  } catch (e) {
    await logFail("rate", tidLog, e);
    return busy();
  }
}

/** ลิงก์หน้าแจ้งซ่อมของสัญญา (เซ็นเอง · ลิงก์เดียวกับพอร์ทัล D.9) — สัญญาไม่ live / ไม่มีกุญแจ ⇒ "" · ไม่ throw */
export async function repairPortalUrl(ctx: { tenantId: string }, i: { leaseId: string; repairId?: string | null }, opts?: { now?: Date }): Promise<string> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i) || !isStr(i.leaseId)) return "";
    const lease = await portalLiveLease(ctx.tenantId, i.leaseId, bkkYmd(nowOf(opts?.now)));
    if (!lease) return "";
    const days = await portalDays(ctx.tenantId, lease.unitId);
    const token = signLink({ tenantId: ctx.tenantId, purpose: PORTAL_PURPOSE, subjectId: lease.id, expMin: Math.min(SIGNED_LINK_MAX_MIN, days * DAY_MIN) });
    const r = isStr(i.repairId) && ID_RE.test(i.repairId) ? `?r=${i.repairId}` : "";
    return `${appOrigin()}/d/${token}/repair${r}`;
  } catch {
    return "";
  }
}

// ═════════════════════════ §3.2 พนักงาน (ด่าน §2 ข้อ 11) ═════════════════════════
type Gate = { tenantId: string; unitId: string; unitName: string; actorUserId: string; visible: Set<string> | null };

async function staffGate(ctx: unknown, unitId: unknown): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const g = await dormStaffGate(ctx, unitId, PERM);
  if (!g) return null;
  const visible = await dormVisibleRoomsFor({ tenantId: g.tenantId }, { unitId: g.unitId, userId: ctx.actorUserId });
  return { ...g, actorUserId: ctx.actorUserId, visible };
}
const inScope = (g: Gate, roomId: string) => g.visible === null || g.visible.has(roomId);

async function repairOfUnit(g: Gate, repairId: unknown): Promise<RepairDb | null> {
  const r = await repairOfTenant(g.tenantId, repairId);
  return r && r.unitId === g.unitId && inScope(g, r.roomId) ? r : null;
}

const firstName = (name: string | null | undefined): string | null => {
  const t = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  return t ? t : null;
};

async function rowsToDto(g: Gate, rows: RepairDb[]): Promise<RepairRow[]> {
  const roomIds = [...new Set(rows.map((r) => r.roomId))];
  const partyIds = [...new Set(rows.map((r) => r.partyId).filter((x): x is string => !!x))];
  const [rooms, parties, cats] = await Promise.all([
    roomIds.length ? tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelRoom.findMany({ where: { id: { in: roomIds } }, select: { id: true, number: true, buildingId: true } }) : Promise.resolve([]),
    partyIds.length ? tenantDb({ tenantId: g.tenantId }).party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    categoriesOf(g.tenantId, g.unitId),
  ]);
  const roomBy = new Map(rooms.map((r) => [r.id, r]));
  const nameBy = new Map(parties.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    repairId: r.id,
    ticketNo: repairTicketNo(r.id),
    roomId: r.roomId,
    roomNumber: roomBy.get(r.roomId)?.number ?? "",
    buildingId: roomBy.get(r.roomId)?.buildingId ?? null,
    category: r.category,
    categoryLabel: cats.find((c) => c.code === r.category)?.labelTh ?? r.category,
    text: clip(r.text, ROW_TEXT),
    status: statusOf(r.status),
    allowEntry: r.allowEntry,
    preferredTime: r.preferredTime,
    createdAt: r.createdAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    rating: r.rating,
    photoCount: filesOf(r.files).filter((f) => f.role === "TENANT").length,
    cardLinked: !!r.kanbanCardId,
    tenantFirstName: r.partyId ? firstName(nameBy.get(r.partyId)) : null,
  }));
}

export async function listDormRepairs(
  ctx: RepairCtx,
  i: { unitId: string; status?: "ACTIVE" | "DONE" | "ALL" },
  opts?: { now?: Date },
): Promise<RepairList | RepairFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(i)) return notFound();
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const want = i.status === undefined || i.status === null ? "ACTIVE" : i.status;
    if (want !== "ACTIVE" && want !== "DONE" && want !== "ALL") return fail("INVALID_INPUT", "สถานะที่ขอไม่ถูกต้อง");
    void opts;
    const all = g.visible === null;
    const vis = all ? [] : [...(g.visible ?? [])];
    const db = tenantDb({ tenantId: g.tenantId });
    const statuses = want === "ACTIVE" ? [...ACTIVE_STATUSES] : want === "DONE" ? ["DONE"] : ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
    const [counts, rows] = await Promise.all([
      db.$queryRaw<{ status: string; n: number }[]>`
        SELECT "status", count(*)::int AS "n" FROM "DormRepair"
        WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND (${all}::boolean OR "roomId" = ANY(${vis}::text[]))
        GROUP BY "status"`,
      db.$queryRaw<RepairDb[]>`
        SELECT "id", "tenantId", "unitId", "roomId", "leaseId", "partyId", "category", "text", "files", "preferredTime", "allowEntry", "status",
               "kanbanCardId", "doneAt", "rating", "createdAt"
        FROM "DormRepair"
        WHERE "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND (${all}::boolean OR "roomId" = ANY(${vis}::text[])) AND "status" = ANY(${statuses}::text[])
        ORDER BY "createdAt" DESC, "id" DESC LIMIT ${MAX_ROWS}`,
    ]);
    const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
    return {
      ok: true,
      unitName: g.unitName,
      rows: await rowsToDto(g, rows),
      counts: { open: c("OPEN"), inProgress: c("IN_PROGRESS"), done: c("DONE"), cancelled: c("CANCELLED") },
    };
  } catch (e) {
    await logFail("list", tidLog, e);
    return busy();
  }
}

export async function dormRepairJob(ctx: RepairCtx, i: { unitId: string; repairId: string }, opts?: { now?: Date }): Promise<{ ok: true; job: RepairJob } | RepairFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(i)) return notFound();
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const r = await repairOfUnit(g, i.repairId);
    if (!r) return notFound();
    void opts;
    const [row] = await rowsToDto(g, [r]);
    const cats = await categoriesOf(g.tenantId, g.unitId);
    const payer = await payerOf(g.tenantId, g.unitId, r.category);
    const viewer = { kind: "STAFF" as const, id: g.actorUserId };
    const urls = (role: FileRef["role"]) =>
      filesOf(r.files)
        .filter((f) => f.role === role)
        .flatMap((f) => {
          try {
            return [{ url: privateFileUrl(f.fileId, viewer) }];
          } catch {
            return [];
          }
        });
    const status = statusOf(r.status);
    return {
      ok: true,
      job: {
        ...row,
        text: r.text,
        photos: urls("TENANT"),
        afterPhotos: urls("AFTER"),
        boardName: cats.find((c) => c.code === r.category)?.board ?? "",
        payer,
        payerLabelTh: PAYER_TH[payer],
        canComplete: status === "OPEN" || status === "IN_PROGRESS",
      },
    };
  } catch (e) {
    await logFail("job", tidLog, e);
    return busy();
  }
}

export async function completeDormRepair(
  ctx: RepairCtx,
  i: { unitId: string; repairId: string; afterPhotos?: RepairFile[] },
  opts?: { now?: Date; deps?: RepairFileDeps },
): Promise<{ ok: true; repairId: string; doneAt: string } | RepairFail> {
  const tidLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  const deps = opts?.deps;
  const now = nowOf(opts?.now);
  let uploaded: string[] = [];
  try {
    if (!isRec(i)) return notFound();
    const g = await staffGate(ctx, i.unitId);
    if (!g) return notFound();
    const r = await repairOfUnit(g, i.repairId);
    if (!r) return notFound();
    const already = fail("ALREADY_DONE", "งานซ่อมนี้ปิดไปแล้ว");
    if (r.status !== "OPEN" && r.status !== "IN_PROGRESS") return already;
    const badFile = fail("INVALID_FILE", "รูปหลังซ่อมต้องเป็นไฟล์ภาพ JPEG, PNG, WebP หรือ HEIC ไม่เกิน 4 รูป รวมไม่เกิน 10 MB");
    const list = i.afterPhotos === undefined || i.afterPhotos === null ? [] : i.afterPhotos;
    if (!Array.isArray(list) || list.length > MAX_PHOTOS) return badFile;
    const declared = declaredFiles(list);
    if (!declared) return badFile;
    const files = await readFiles(declared);
    if (!files) return badFile;
    const ids = await uploadAll(g.tenantId, files, "repair-after", deps);
    if (!ids) return fail("UPLOAD_FAILED", "อัปโหลดรูปหลังซ่อมไม่สำเร็จ — ลองใหม่อีกครั้ง");
    uploaded = ids;
    const add = JSON.stringify(ids.map((fileId) => ({ fileId, role: "AFTER" })));
    const out = await runTx(g.tenantId, g.unitId, async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "DormRepair" SET "status" = 'DONE', "doneAt" = ${now},
          "files" = (CASE WHEN jsonb_typeof("files") = 'array' THEN "files" ELSE '[]'::jsonb END) || ${add}::jsonb, "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${g.tenantId} AND "unitId" = ${g.unitId} AND "status" IN ('OPEN', 'IN_PROGRESS')`;
      if (n !== 1) throw new Abort(already);
      await emitDone(tx, r);
      await auditOf(tx, { tenantId: g.tenantId, unitId: g.unitId, actorUserId: g.actorUserId, action: EVT_DONE, repairId: r.id, after: { source: "STAFF", photos: ids.length } });
      return { done: true as const };
    });
    if ("done" in out) {
      uploaded = [];
      return { ok: true, repairId: r.id, doneAt: now.toISOString() };
    }
    await dropFiles(g.tenantId, ids, deps);
    uploaded = [];
    return "replay" in out ? notFound() : out;
  } catch (e) {
    if (uploaded.length) await dropUnreferenced(tidLog, uploaded, deps);
    await logFail("complete", tidLog, e);
    return busy();
  }
}

// ═════════════════════════ §3.3 สถานะจากการ์ด (สะพานเรียก) ═════════════════════════
/** ผูกการ์ดกับคำแจ้ง (ครั้งแรกเท่านั้น · CAS kanbanCardId IS NULL) */
export async function linkRepairCard(ctx: { tenantId: string }, i: { repairId: string; cardId: string }): Promise<boolean> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i) || !isStr(i.repairId) || !ID_RE.test(i.repairId) || !isStr(i.cardId) || !ID_RE.test(i.cardId)) return false;
    const n = await tenantDb({ tenantId: ctx.tenantId }).$executeRaw`
      UPDATE "DormRepair" SET "kanbanCardId" = ${i.cardId}, "updatedAt" = now()
      WHERE "id" = ${i.repairId} AND "tenantId" = ${ctx.tenantId} AND "kanbanCardId" IS NULL`;
    return n === 1;
  } catch (e) {
    console.error("[dorm.repair] link", errName(e));
    return false;
  }
}

export async function applyRepairCardState(
  ctx: { tenantId: string },
  i: { repairId: string; cardId: string; state: "IN_PROGRESS" | "DONE"; actorUserId?: string | null; source?: "CARD" | "SWEEP" },
  opts?: { now?: Date },
): Promise<{ changed: boolean }> {
  const no = { changed: false };
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i) || !isStr(i.cardId) || !ID_RE.test(i.cardId)) return no;
    if (i.state !== "IN_PROGRESS" && i.state !== "DONE") return no;
    const tenantId = ctx.tenantId;
    const r = await repairOfTenant(tenantId, i.repairId);
    if (!r || (r.kanbanCardId !== null && r.kanbanCardId !== i.cardId)) return no;
    const actor = isStr(i.actorUserId) && ID_RE.test(i.actorUserId) ? i.actorUserId : null;
    const source = i.source === "SWEEP" ? "SWEEP" : "CARD";
    const cardId = i.cardId;
    const now = nowOf(opts?.now);
    const out = await runTx(tenantId, r.unitId, async (tx) => {
      if (i.state === "IN_PROGRESS") {
        const n = await tx.$executeRaw`
          UPDATE "DormRepair" SET "status" = 'IN_PROGRESS', "kanbanCardId" = COALESCE("kanbanCardId", ${cardId}), "updatedAt" = now()
          WHERE "id" = ${r.id} AND "tenantId" = ${tenantId} AND "status" = 'OPEN' AND ("kanbanCardId" IS NULL OR "kanbanCardId" = ${cardId})`;
        if (n !== 1) return { done: false as const };
        await auditOf(tx, { tenantId, unitId: r.unitId, actorUserId: actor, action: "dorm.repair.started", repairId: r.id, after: { source } });
        return { done: true as const };
      }
      const n = await tx.$executeRaw`
        UPDATE "DormRepair" SET "status" = 'DONE', "doneAt" = ${now}, "kanbanCardId" = COALESCE("kanbanCardId", ${cardId}), "updatedAt" = now()
        WHERE "id" = ${r.id} AND "tenantId" = ${tenantId} AND "status" IN ('OPEN', 'IN_PROGRESS') AND ("kanbanCardId" IS NULL OR "kanbanCardId" = ${cardId})`;
      if (n !== 1) return { done: false as const };
      await emitDone(tx, r);
      await auditOf(tx, { tenantId, unitId: r.unitId, actorUserId: actor, action: EVT_DONE, repairId: r.id, after: { source } });
      return { done: true as const };
    });
    return { changed: "done" in out && out.done === true };
  } catch (e) {
    console.error("[dorm.repair] card state", errName(e));
    return no;
  }
}

// ═════════════════════════ §3.4 ข้อความซ่อมเสร็จ ═════════════════════════
type NoticeResult = { status: string; dedupeKey: string | null; duplicate: boolean };
const noSend = (status: string): NoticeResult => ({ status, dedupeKey: null, duplicate: false });

/** สถานะสดสำหรับ precheck: ยัง DONE · สัญญาเดิมยัง live */
async function stillDeliverable(tenantId: string, repairId: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = await repairOfTenant(tenantId, repairId);
  if (!r || r.status !== "DONE" || !(await liveLeaseOfRepair(r, now))) return { ok: false, reason: "LEASE_ENDED" };
  return { ok: true };
}

export async function sendRepairDoneNotice(ctx: { tenantId: string }, i: { repairId: string }, opts?: { now?: Date }): Promise<NoticeResult> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(i)) return noSend("NOT_FOUND");
    const tenantId = ctx.tenantId;
    const now = nowOf(opts?.now);
    const r = await repairOfTenant(tenantId, i.repairId);
    if (!r) return noSend("NOT_FOUND");
    if (r.status !== "DONE") return noSend("NOT_DONE");
    const lease = await liveLeaseOfRepair(r, now);
    if (!lease) return noSend("NO_LEASE");
    const party = await tenantDb({ tenantId }).party.findFirst({ where: { id: lease.partyId }, select: { name: true } });
    const url = await repairPortalUrl({ tenantId }, { leaseId: lease.id, repairId: r.id }, { now });
    const dedupeKey = `${KEY_DONE}${r.id}`;
    const { notifyCustomer } = await import("@/lib/platform/notify-customer");
    const res = await notifyCustomer(
      { tenantId },
      {
        unitId: r.unitId,
        domain: "rooms",
        messageKey: "repairDone",
        partyId: lease.partyId,
        vars: { tenantName: firstName(party?.name) ?? "ผู้เช่า", roomNo: lease.roomNumber, unitName: lease.unitName, ticketNo: repairTicketNo(r.id) },
        buttons: url.startsWith("https://") ? [{ label: "ให้คะแนนงานซ่อม", kind: "uri", data: url }] : undefined,
        dedupeKey,
        at: now,
        precheck: () => stillDeliverable(tenantId, r.id, now),
      },
    );
    const status = res.precheckFailed ? `SKIPPED_${res.precheckFailed}` : res.status;
    return { status, dedupeKey, duplicate: res.duplicate === true };
  } catch (e) {
    console.error("[dorm.repair] notice", errName(e));
    return { status: "FAILED", dedupeKey: null, duplicate: false };
  }
}

/** consumer ของ dorm.repair.done — อ่านสด (ไม่เชื่อ payload นอกจาก repairId) · ไม่ throw */
export async function onRepairDone(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void> {
  try {
    if (!isRec(evt) || evt.type !== EVT_DONE || !isStr(evt.tenantId) || !isRec(evt.payload)) return;
    const repairId = evt.payload.repairId;
    if (!isStr(repairId)) return;
    await sendRepairDoneNotice({ tenantId: evt.tenantId }, { repairId }, { now: new Date() });
  } catch (e) {
    console.error("[dorm.repair] consumer", errName(e));
  }
}

// ═════════════════════════ §3.4 งานตามเวลา: ส่งซ้ำ ═════════════════════════
/**
 * แถว log rooms/repairDone ที่ SKIPPED_QUIET/FAILED ใน 3 วัน · keyset (at, id) วนหน้าจนหมดงบ
 *   ส่งไม่ได้แล้ว (ไม่พบ/ไม่ DONE/สัญญาไม่ live — คิดใน SQL ของหน้า) ⇒ ปิดแถวเป็น SKIPPED_PRECHECK_<เหตุ> ทีเดียวทั้งหน้า (สถานะจบ)
 *   FAILED ชนเพดานลองซ้ำ ⇒ ปิด RETRY_LIMIT · SKIPPED_QUIET ที่ยังเงียบอยู่ ⇒ ข้าม · ซ้อนกันได้ = ข้อความ 1 (dedupe)
 */
export async function runDormRepairJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ resent: number }> {
  const t0 = Date.now();
  const out = { resent: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  try {
    const at = nowOf(now);
    const today = bkkYmd(at);
    const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
    const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
    const since = new Date(at.getTime() - RESEND_WINDOW_MS);
    const quiet = new Map<string, boolean>();
    const quietNow = async (tenantId: string, unitId: string): Promise<boolean> => {
      const k = `${tenantId}:${unitId}`;
      if (!quiet.has(k)) {
        const q = (await resolveSettings({ tenantId }, ["messaging.quietHours"], { unitId }))["messaging.quietHours"]?.value;
        quiet.set(k, isRec(q) && typeof q.start === "string" && typeof q.end === "string" ? inQuietWindow(at, q.start, q.end) : false);
      }
      return quiet.get(k) === true;
    };
    type Row = { id: string; tenantId: string; unitId: string; status: string; at: Date; repairId: string | null; repairStatus: string | null; live: boolean };
    const close = async (tenantId: string, ids: string[], reason: string) => {
      if (!ids.length) return;
      await tenantDb({ tenantId }).$executeRaw`
        UPDATE "ServiceMessageLog" SET "status" = ${`SKIPPED_PRECHECK_${reason}`}, "at" = ${new Date()}
        WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[]) AND "status" IN ('SKIPPED_QUIET', 'FAILED')`;
    };
    let cur: { at: Date; id: string } | null = null;
    page: for (;;) {
      if (left() < 2_000) break;
      const cAt: Date = cur?.at ?? new Date(0);
      const cId: string = cur?.id ?? "";
      const rows: Row[] = await raw.$queryRaw<Row[]>`
        SELECT s."id", s."tenantId", s."unitId", s."status", s."at", r."id" AS "repairId", r."status" AS "repairStatus",
          EXISTS (
            SELECT 1 FROM "DormLease" l JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
            WHERE l."tenantId" = r."tenantId" AND l."id" = r."leaseId" AND l."unitId" = r."unitId" AND l."roomId" = r."roomId"
              AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL AND (l."endDate" IS NULL OR l."endDate" >= ${today}::date)
          ) AS "live"
        FROM "ServiceMessageLog" s
        LEFT JOIN "DormRepair" r ON r."tenantId" = s."tenantId" AND s."dedupeKey" = (${KEY_DONE} || r."id")
        WHERE (${tid}::text IS NULL OR s."tenantId" = ${tid}) AND s."domain" = 'rooms' AND s."messageKey" = 'repairDone'
          AND s."status" IN ('SKIPPED_QUIET', 'FAILED') AND s."at" >= ${since}
          AND (s."at" > ${cAt} OR (s."at" = ${cAt} AND s."id" > ${cId}))
        ORDER BY s."at" ASC, s."id" ASC LIMIT 200`;
      if (!rows.length) break;
      cur = { at: rows[rows.length - 1].at, id: rows[rows.length - 1].id };
      // ส่งไม่ได้แล้ว ⇒ ปิดทั้งหน้า (ร้านละ/เหตุละคำสั่งเดียว)
      const dead = new Map<string, string[]>();
      const live: Row[] = [];
      for (const r of rows) {
        const reason = !r.repairId ? "NOT_FOUND" : r.repairStatus !== "DONE" ? "NOT_DONE" : !r.live ? "NO_LEASE" : "";
        if (!reason) {
          live.push(r);
          continue;
        }
        const k = `${r.tenantId}\u0000${reason}`;
        dead.set(k, [...(dead.get(k) ?? []), r.id]);
      }
      for (const [k, ids] of dead) {
        const [tenantId, reason] = k.split("\u0000");
        try {
          await close(tenantId, ids, reason);
        } catch (e) {
          console.error("[dorm.repair] resend close", errName(e));
        }
      }
      for (const r of live) {
        if (left() < 2_000) break page;
        try {
          if (!r.repairId || !ID_RE.test(r.repairId)) continue;
          if (r.status === "SKIPPED_QUIET" && (await quietNow(r.tenantId, r.unitId))) continue;
          if (r.status === "FAILED") {
            const v = await checkRateLimitDb(`dorm:repair:resend:${r.tenantId}:${r.repairId}`, { limit: FAILED_RETRY_MAX, windowMs: RESEND_WINDOW_MS }, at.getTime());
            if (!v.ok) {
              await close(r.tenantId, [r.id], "RETRY_LIMIT");
              continue;
            }
          }
          const s = await sendRepairDoneNotice({ tenantId: r.tenantId }, { repairId: r.repairId }, { now: at });
          if (s.dedupeKey === null && s.status !== "FAILED") await close(r.tenantId, [r.id], s.status);
          else if (s.status === "SENT" && !s.duplicate) out.resent++;
        } catch (e) {
          console.error("[dorm.repair] resend", errName(e));
        }
      }
      if (rows.length < 200) break;
    }
  } catch (e) {
    console.error("[dorm.repair] resend list", errName(e));
  }
  return out;
}
// ◂ SVC D.16
