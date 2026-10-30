// SVC D.5 ▸ ผู้เช่า · สัญญา · เงินประกัน — สัญญา ledger/svc-briefs/svc-brief-d.5.md §2–§3 (ชื่อ/ชนิดตรงตัว · ข้อสอบ qc-svc-d.5 ผูก)
//
// ชั้นตรวจ "เข้ม" (เงิน + กฎหมาย สคบ. + ข้อมูลข้ามร้าน):
//   • ขอบเขต (X1): อ่าน/เขียนผ่าน tenantDb({tenantId, unitId}) เท่านั้น (ไม่ import prisma ดิบ — F5.1) · หน่วยต้องเป็น DORM ของร้าน ·
//     ผู้กระทำ = Membership สด (อ่านจากฐานทุกคำขอ · acceptedAt ไม่ null) · ไม่ผ่านข้อใด ⇒ NOT_FOUND เหตุผลเดียวกันทุกกรณี / อ่าน = null|ว่าง
//   • ห้อง: claimRoom(kind LEASE) ใน tx เดียวกับแถวสัญญา — ห้องว่าง/ถูกจองตัดสินที่ฐาน (EXCLUDE ของ R0.8) ⇒ ROOM_TAKEN
//   • ผู้เช่า = Party: findOrCreate ใต้ pg_advisory_xact_lock ต่อ (ร้าน, เลขบัตร) และ (ร้าน, เบอร์) — พร้อมกันเบอร์ใหม่เดียวกัน = Party 1 ราย
//     (มีเลขบัตร ⇒ จับคู่ด้วยเลขบัตรเท่านั้น · ไม่มี ⇒ เบอร์ → ชื่อ+อีเมล ตามลำดับเดิมของ party)
//   • เงิน: postSecurityDeposit ของ facade บัญชี คีย์ `dorm.lease:<id>:booking` / `:deposit` — ยอดจากคอลัมน์สัญญาเสมอ (ไม่รับยอดจากผู้เรียก)
//     ⇒ ซ้ำ/พร้อมกัน/สลับกันกี่ครั้ง ยอดถือ = ประกันพอดี · เรียกทีละรายการ (หนี้ D.2 N2: ห้าม Promise.all เงินหอ) · เงินก่อนสถานะ
//   • กฎหมาย: ประกัน+ล่วงหน้า (DEPOSIT_ADVANCE_LIMIT) + ข้อบังคับ 7 ข้อ/คำต้องห้าม (CONTRACT_MANDATORY_CLAUSES · TEMPLATE_NO_THREAT) ·
//     โหมดอ่านสดทุกคำขอ · WARN ต้องยอมรับพร้อมเหตุผล + (ไม่ใช่เจ้าของ) สายอนุมัติที่มีขั้น OWNER · คำขออ่านสถานะสดตอนลงชื่อ/รับเงิน/เข้าอยู่
//   • snapshot: policySnapshot ล็อกตอนทำสัญญา (+ contract + legal) · ค่าที่ล็อกอ่านจาก snapshot ไม่ใช่ resolver
//   • ไฟล์: private เท่านั้น (t/<tenant>/private/…) · ลิงก์ผ่าน privateFileUrl ผูกผู้ดู ≤ 15 นาที · ต่อท้ายใต้ล็อกแถวสัญญา
//   • event dorm.lease.signed ใน tx เดียวกับ signedAt · payload ตรง 3 คีย์ { unitId, leaseId, roomId } (X8)
//   • ไม่ throw ออก facade (เขียน ⇒ { ok:false, code, reason ไทย }) · เงินสตางค์จำนวนเต็ม · วันที่ "YYYY-MM-DD" วันไทย
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import type { MembershipCtx } from "@/lib/core/rbac";
import { checkTemplate, getDef, resolveSettings, snapshotPolicy, type PolicySnapshot } from "@/lib/core/settings";
import {
  evaluateLegal,
  findForbiddenTerms,
  isValidOutOfScopeReason,
  leaseKind as legalLeaseKind,
  MANDATORY_CLAUSES,
  normalizeLegalMode,
  normalizeLegalText,
  type LegalOutcome,
} from "@/lib/core/settings/legal/th-rental-2568";
import { deleteFileAsset, privateFileUrl, uploadFile } from "@/lib/storage/service";
import { postSecurityDepositInTx, prepareSecurityDepositContact, runDormMoneyTx, securityDepositHeld, securityDepositHeldInTx, securityDepositHeldMany, securityDepositReceipts } from "@/lib/modules/account";
import { requestStatuses, resolvePolicy, submitForApproval } from "@/lib/modules/approval";
import { attachPersonTaxId, findOrCreate, normalizePartyPhone, normalizePartyTaxId, resolveCanonical, updateContactInfo } from "@/lib/modules/party";
import { claimRoom, exclusiveEnd, releaseOccupancy } from "@/lib/modules/rooms";
import { leaseAccess } from "./lease-access";
import { dormScopeFor, dormVisibleRoomIds } from "./scope"; // SVC D.13 ▸ ขอบเขตอาคาร (#64) ◂

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
export type LeaseCtx = { tenantId: string; actorUserId: string };
export type LeaseTab = "CURRENT" | "BOOKED" | "EXPIRING" | "NOTICE" | "ENDED";
type LegalInfo = { code: string; messageTh: string; citation: string };
export type TenantCandidate = { partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE" };
type Fail = { ok: false; code: string; reason: string; legal?: LegalInfo; candidates?: TenantCandidate[] };
type Channel = "CASH" | "TRANSFER" | "PROMPTPAY";
type FileKindTh = "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT";
type VehicleKind = "CAR" | "MOTORBIKE" | "OTHER";
type Clause = { id: string; titleTh: string | null; textTh: string; mandatory: boolean };
type PutFn = (path: string, data: Uint8Array, contentType: string) => Promise<void>;
type FileDeps = { put?: PutFn };

export type LeaseDetail = {
  leaseId: string;
  unitId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string | null;
  status: string;
  partyId: string;
  tenantName: string;
  phoneMasked: string | null;
  startDate: string;
  endDate: string;
  months: number;
  rentSatang: number;
  commonFeeSatang: number;
  depositSatang: number;
  advanceRentSatang: number;
  bookingFeeSatang: number;
  occupants: { name: string; phoneMasked: string | null }[];
  vehicles: { plate: string; kind: string; note: string | null }[];
  signedAt: string | null;
  files: { ROOM_PHOTO: number; ID_CARD: number; DOCUMENT: number; SIGNATURE: number };
  moveInPhotosMin: number;
  heldSatang: number;
  receipts: { entryId: string; entryNo: string; amountSatang: number; date: string }[];
  legal: {
    mode: string;
    level: "OK" | "WARN";
    code: string | null;
    reason: string | null;
    approvalId: string | null;
    approvalStatus: "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  };
  /** K9: true = ข้อความสัญญามีคำต้องห้าม ⇒ policySnapshot.contract ไม่มี textTh (ใช้สัญญานี้ไม่ได้) */
  legalBlocked: boolean;
  policySnapshot: unknown;
};
export type LeaseRow = {
  leaseId: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string | null;
  status: string;
  tenantName: string;
  occupantCount: number;
  startDate: string;
  endDate: string;
  months: number;
  rentSatang: number;
  depositSatang: number;
  heldSatang: number;
  daysToEnd: number;
};
export type LeaseList = { rows: LeaseRow[]; counts: Record<LeaseTab, number>; heldTotalSatang: number };

export type CreateLeaseInput = {
  unitId: string;
  roomId: string;
  startDate: string;
  months: number;
  /** K3: ผู้เช่าเดิม `{partyId}` · ใหม่ `{name, phone?, idCardNo?, email?}` + ตอบ TENANT_MATCH_CONFIRM ด้วย `confirmPartyId` (ใช้รายนั้น) หรือ `createNewParty:true` */
  tenant:
    | { partyId: string }
    | { name: string; phone?: string | null; idCardNo?: string | null; email?: string | null; confirmPartyId?: string | null; createNewParty?: boolean | null };
  rentSatang?: number;
  commonFeeSatang?: number;
  depositSatang?: number;
  advanceRentSatang?: number;
  bookingFeeSatang?: number;
  occupants?: { name: string; phone?: string | null }[];
  vehicles?: { plate: string; kind: VehicleKind; note?: string | null }[];
  legalAck?: { reason: string } | null;
  note?: string | null;
};
export type CreateLeaseResult =
  | {
      ok: true;
      leaseId: string;
      partyId: string;
      partyCreated: boolean;
      occupancyId: string;
      startDate: string;
      endDate: string;
      legal: { level: "OK" | "WARN"; code: string | null; approvalId: string | null };
    }
  | Fail;

// ───────────────────────── ค่าคงที่ · ข้อความ ─────────────────────────
const NF_REASON = "ไม่พบสัญญาเช่าหรือห้องที่ระบุในหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ";
const ENTITY = "dorm.lease.legal_override";
const EVENT_SIGNED = "dorm.lease.signed";
const MAX_SATANG = 1_000_000_000; // ฿10,000,000
const MAX_MONTHS = 360;
const MAX_PEOPLE = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_CALL = 20;
const MAX_FILES_PER_LEASE = 60;
const MAX_READING = 2_147_483_647;
const DEFAULT_PHOTOS_MIN = 6;
const DAY_MS = 86_400_000;
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const DOC_TYPES = [...PHOTO_TYPES, "application/pdf"] as const;
const SIGN_TYPES: Record<"ON_SCREEN" | "PAPER", readonly string[]> = { ON_SCREEN: ["image/png", "image/jpeg"], PAPER: ["application/pdf", "image/png", "image/jpeg"] };
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

type Tx = Prisma.TransactionClient;

const fail = (code: string, reason: string, legal?: LegalInfo): Fail => (legal ? { ok: false, code, reason, legal } : { ok: false, code, reason });
const notFound = (): Fail => fail("NOT_FOUND", NF_REASON);
const unavailable = (): Fail => fail("UNAVAILABLE", "ระบบบันทึกสัญญาขัดข้องชั่วคราว — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง");
/** K6 ▸ ทางเงิน: เงินกับสถานะ commit พร้อมกันใน tx เดียว (K1) — แต่ commit ที่ขาดกลางทางอาจไม่รู้ผล ⇒ บอกตามจริงว่าอาจรับเงินแล้ว และกดซ้ำไม่รับซ้ำ */
const moneyUnavailable = (): Fail =>
  fail("RETRY_SAFE", "ระบบขัดข้องระหว่างบันทึกเงิน — ถ้าระบบรับเงินไปแล้ว การกดอีกครั้งจะทำต่อโดยไม่รับเงินซ้ำ (ดูยอดเงินประกันที่ถือในสัญญาก่อนรับเงินสดซ้ำ)");
const legalInfo = (o: LegalOutcome): LegalInfo => ({ code: o.code, messageTh: o.messageTh, citation: o.citation });

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isMoney = (v: unknown): v is number => isInt(v) && v >= 0 && v <= MAX_SATANG;
const natOr = (v: unknown, d: number): number => (isInt(v) && v >= 0 ? v : d);

/** ยกเลิกทั้ง tx พร้อมผลปฏิเสธ (ไม่มีแถวใดเกิด) */
class Abort extends Error {
  constructor(public readonly result: Fail) {
    super("dorm.lease abort");
  }
}

function scoped(tenantId: string, unitId: string) {
  return tenantDb({ tenantId, unitId });
}
/** ธุรกรรมผูกขอบเขต (tenantDb ฉีด tenantId+unitId ทุกคำสั่ง) · Abort ⇒ คืนผลปฏิเสธ (rollback ทั้งก้อน) */
async function runTx<T>(tenantId: string, unitId: string, fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  try {
    return await tenantDb({ tenantId, unitId }).$transaction((tx) => fn(tx as unknown as Tx), TX_OPTS);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    throw e;
  }
}
async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
const leaseLockKey = (leaseId: string) => `dorm.lease:${leaseId}`;

/**
 * K1 ▸ ธุรกรรมเงินของสัญญา — connection เดียว (runDormMoneyTx ของ facade บัญชี · maxWait 20 วิ · timeout 30 วิ) · ไม่มี connection ที่สองระหว่างถือ tx
 *   ลำดับล็อก (ห้ามสลับ): ① advisory ต่อสัญญา `dorm.lease:<id>` (คำสั่งแรก) → ② รุ่น InTx ของบัญชี: แถว Tenant → ลิงก์หน่วย → คีย์ → JV → ③ แถวสัญญา
 *   tx นี้เป็น tx ดิบ (ไม่ใช่ tenantDb — ตารางบัญชีเป็นแกนสมุดและคีย์กันซ้ำข้ามสมุด) ⇒ ทุกคำสั่งของหอในนี้ใส่ tenantId + unitId เองเสมอ
 *   ผู้ติดต่อฝั่งบัญชีของผู้เช่ายังไม่มี (NEEDS_CONTACT) ⇒ สร้างนอก tx แล้วลองใหม่ 1 ครั้ง
 */
async function moneyTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  try {
    return await runDormMoneyTx(fn);
  } catch (e) {
    if (e instanceof Abort) return e.result;
    throw e;
  }
}
async function withTenantContact<T>(g: { tenantId: string; unitId: string }, partyId: string, run: () => Promise<T | Fail>): Promise<T | Fail> {
  const first = await run();
  if (!(isRec(first) && first.ok === false && first.code === "NEEDS_CONTACT")) return first;
  const prep = await prepareSecurityDepositContact({ tenantId: g.tenantId, unitId: g.unitId, partyId });
  if (!prep.ok) return fail(prep.code, prep.reason);
  return run();
}

async function logFail(where: string, tenantId: string, e: unknown): Promise<void> {
  try {
    await logOps("ERROR", `dorm.lease.${where}`, "บริการสัญญาเช่าหอขัดข้อง", { tenantId, detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500) });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

// ───────────────────────── วันที่ (ข้อความ YYYY-MM-DD · ไม่ใช้ getDate/getMonth/getDay ดิบ) ─────────────────────────
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m1: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m1 - 1];
const pad2 = (n: number) => String(n).padStart(2, "0");
function parseYmd(s: unknown): { y: number; m: number; d: number } | null {
  if (typeof s !== "string") return null;
  const r = YMD_RE.exec(s);
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  const d = Number(r[3]);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}
const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const addDaysYmd = (ymd: string, n: number) => new Date(ymdMs(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOfDb = (d: Date | null | undefined): string => (d instanceof Date ? d.toISOString().slice(0, 10) : "");
const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY_MS);

/** วันสุดท้ายที่อยู่ได้ (รวมวันนั้น) = start + months เดือน (วันเดียวกัน · เกินสิ้นเดือน ⇒ สิ้นเดือน) − 1 วัน — §2.2 */
export function leaseEndDate(start: string, months: number): string {
  const p = parseYmd(start);
  if (!p) throw new Error("leaseEndDate: วันที่ไม่ถูกต้อง");
  const m0 = p.m - 1 + months;
  const y = p.y + Math.floor(m0 / 12);
  const m1 = (((m0 % 12) + 12) % 12) + 1;
  const d = Math.min(p.d, daysInMonth(y, m1));
  return addDaysYmd(`${y}-${pad2(m1)}-${pad2(d)}`, -1);
}
function thaiDateLong(ymd: string): string {
  const p = parseYmd(ymd);
  return p ? `${p.d} ${THAI_MONTHS[p.m - 1]} พ.ศ. ${p.y + 543}` : ymd;
}

// ───────────────────────── เงิน · เบอร์ · เลขบัตร ─────────────────────────
function bahtText(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  const baht = Math.floor(a / 100).toLocaleString("en-US");
  const st = a % 100;
  return `${satang < 0 ? "-" : ""}${baht}${st ? `.${pad2(st)}` : ""} บาท`;
}
/** เบอร์ปิดเหลือ 4 ตัวท้าย (`xxx-xxx-5678`) — ไม่มีเบอร์เต็มออกจาก DTO (X8) */
function maskPhone(raw: string | null | undefined): string | null {
  const d = normalizePartyPhone(raw ?? "");
  if (d.length < 4) return null;
  return `xxx-xxx-${d.slice(-4)}`;
}
/** K3 ▸ ชื่อที่กรอก "ตรง" ชื่อของ Party ไหม — ไม่สนช่องว่าง/ตัวพิมพ์ · ยอมส่วนต่อท้าย (ชื่อเล่น/วงเล็บ) เมื่อส่วนที่ตรงยาว ≥ 6 ตัวอักษร */
function nameMatches(a: string, b: string): boolean {
  const k = (x: string) => x.normalize("NFC").replace(/\s+/g, "").toLowerCase();
  const x = k(a);
  const y = k(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 6 && long.startsWith(short);
}
/** เลขบัตรประชาชน 13 หลัก + เลขตรวจ (Σ dᵢ×(13−i) i=0..11 · ตรวจ = (11 − Σ mod 11) mod 10) */
function thaiIdOk(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(id[i]) * (13 - i);
  return (11 - (s % 11)) % 10 === Number(id[12]);
}
function newLeaseId(): string {
  // ตัวอักษร a–z0–9 25 ตัว (รูป cuid) — ตัวเลขติดกันยาวแทบไม่เกิด (ไม่ถูกตีความเป็นเบอร์โทรใน DTO)
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(24);
  let out = "c";
  for (const b of bytes) out += alphabet[b % 36];
  return out;
}
const leaseNoOf = (leaseId: string) => `L${leaseId.slice(-8).toUpperCase()}`;

// ───────────────────────── ด่านร่วม (§3: หน่วย DORM ของร้าน → Membership สด → สิทธิ์) ─────────────────────────
type Gate = {
  tenantId: string;
  unitId: string;
  actorUserId: string;
  role: string;
  unitName: string;
  /** SVC D.13 ▸ ห้องที่ผู้กระทำเห็นตามขอบเขตอาคาร (null = ทั้งหน่วย) — ห้องนอกขอบเขต = "ไม่พบ" ◂ */
  visibleRooms: Set<string> | null;
};

async function gate(ctx: unknown, unitId: unknown, need: "manage" | "view"): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const actorUserId = ctx.actorUserId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({
    where: { tenantId, userId: actorUserId, acceptedAt: { not: null } },
    select: { id: true, role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const acc = leaseAccess(m, unit.id);
  if (need === "manage" ? !acc.manage : !acc.view) return null;
  const visibleRooms = await dormVisibleRoomIds(tenantId, unit.id, await dormScopeFor(tenantId, unit.id, { id: mem.id, ctx: m }));
  return { tenantId, unitId: unit.id, actorUserId, role: String(mem.role), unitName: unit.name, visibleRooms };
}

/** SVC D.13 ▸ ห้องอยู่ในขอบเขตอาคารของผู้กระทำ ◂ */
const roomVisible = (g: Gate, roomId: string): boolean => g.visibleRooms === null || g.visibleRooms.has(roomId);

// ───────────────────────── อ่านแถวสัญญา ─────────────────────────
const LEASE_SELECT = {
  id: true,
  unitId: true,
  roomId: true,
  partyId: true,
  coTenants: true,
  status: true,
  startDate: true,
  endDate: true,
  rentSatang: true,
  commonFeeSatang: true,
  depositSatang: true,
  advanceRentSatang: true,
  bookingFeeSatang: true,
  occupancyId: true,
  signedAt: true,
  signatureFileId: true,
  moveInPhotos: true,
  depositDocumentId: true,
  policySnapshot: true,
  createdAt: true,
} as const;
type LeaseRec = {
  id: string;
  unitId: string;
  roomId: string;
  partyId: string;
  coTenants: Prisma.JsonValue;
  status: string;
  startDate: Date;
  endDate: Date | null;
  rentSatang: number;
  commonFeeSatang: number;
  depositSatang: number;
  advanceRentSatang: number;
  bookingFeeSatang: number;
  occupancyId: string | null;
  signedAt: Date | null;
  signatureFileId: string | null;
  moveInPhotos: Prisma.JsonValue;
  depositDocumentId: string | null;
  policySnapshot: Prisma.JsonValue;
  createdAt: Date;
};

async function readLease(g: Gate, leaseId: unknown): Promise<LeaseRec | null> {
  if (!isStr(leaseId)) return null;
  const lease = await scoped(g.tenantId, g.unitId).dormLease.findFirst({ where: { id: leaseId }, select: LEASE_SELECT });
  return lease && roomVisible(g, lease.roomId) ? lease : null;
}

type PhotoEntry = { fileId: string; kind: FileKindTh; at: string };
function photosOf(v: Prisma.JsonValue): PhotoEntry[] {
  if (!Array.isArray(v)) return [];
  const out: PhotoEntry[] = [];
  for (const x of v) {
    if (!isRec(x) || !isStr(x.fileId)) continue;
    const kind = x.kind === "ID_CARD" || x.kind === "DOCUMENT" ? x.kind : "ROOM_PHOTO";
    out.push({ fileId: x.fileId, kind, at: typeof x.at === "string" ? x.at : "" });
  }
  return out;
}
type CoTenants = { occupants: { name: string; phone: string | null }[]; vehicles: { plate: string; kind: VehicleKind; note: string | null }[] };
function coTenantsOf(v: Prisma.JsonValue): CoTenants {
  const out: CoTenants = { occupants: [], vehicles: [] };
  if (!isRec(v)) return out;
  if (Array.isArray(v.occupants)) for (const o of v.occupants) if (isRec(o) && isStr(o.name)) out.occupants.push({ name: o.name, phone: typeof o.phone === "string" ? o.phone : null });
  if (Array.isArray(v.vehicles))
    for (const o of v.vehicles)
      if (isRec(o) && isStr(o.plate)) out.vehicles.push({ plate: o.plate, kind: o.kind === "CAR" || o.kind === "MOTORBIKE" ? o.kind : "OTHER", note: typeof o.note === "string" ? o.note : null });
  return out;
}
/** ตรวจรูปทรงผู้พักร่วม/รถ (§2.4) — ผิด ⇒ null */
function parseCoTenants(occ: unknown, veh: unknown): CoTenants | null {
  const o = occ === undefined || occ === null ? [] : occ;
  const v = veh === undefined || veh === null ? [] : veh;
  if (!Array.isArray(o) || !Array.isArray(v) || o.length > MAX_PEOPLE || v.length > MAX_PEOPLE) return null;
  const out: CoTenants = { occupants: [], vehicles: [] };
  for (const x of o) {
    if (!isRec(x) || !isStr(x.name) || x.name.trim().length > 120) return null;
    if (x.phone !== undefined && x.phone !== null && typeof x.phone !== "string") return null;
    const phone = typeof x.phone === "string" && x.phone.trim() ? x.phone.trim().slice(0, 30) : null;
    out.occupants.push({ name: x.name.trim(), phone });
  }
  for (const x of v) {
    if (!isRec(x) || !isStr(x.plate) || x.plate.trim().length > 30) return null;
    if (x.kind !== "CAR" && x.kind !== "MOTORBIKE" && x.kind !== "OTHER") return null;
    if (x.note !== undefined && x.note !== null && typeof x.note !== "string") return null;
    const note = typeof x.note === "string" && x.note.trim() ? x.note.trim().slice(0, 200) : null;
    out.vehicles.push({ plate: x.plate.trim(), kind: x.kind, note });
  }
  return out;
}

type SnapLegal = { mode: string; level: "OK" | "WARN"; code: string | null; reason: string | null; approvalId: string | null };
function snapOf(v: Prisma.JsonValue): Record<string, unknown> | null {
  return isRec(v) ? v : null;
}
function snapValue(snap: Record<string, unknown> | null, key: string): unknown {
  const values = snap && isRec(snap.values) ? snap.values : null;
  return values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}
function snapLegal(snap: Record<string, unknown> | null): SnapLegal {
  const l = snap && isRec(snap.legal) ? snap.legal : null;
  const mode = typeof l?.mode === "string" ? l.mode : normalizeLegalMode(snapValue(snap, "rooms.legal.mode"));
  return {
    mode,
    level: l?.level === "WARN" ? "WARN" : "OK",
    code: typeof l?.code === "string" ? l.code : null,
    reason: typeof l?.reason === "string" ? l.reason : null,
    approvalId: typeof l?.approvalId === "string" ? l.approvalId : null,
  };
}
const photosMinOf = (snap: Record<string, unknown> | null) => natOr(snapValue(snap, "rooms.lease.moveInPhotosMin"), DEFAULT_PHOTOS_MIN);

/** สถานะคำขอข้ามคำเตือนกฎหมาย (อ่านสดทุกครั้ง — ไม่มี effect) */
async function approvalStatusOf(tenantId: string, approvalId: string | null): Promise<LeaseDetail["legal"]["approvalStatus"]> {
  if (!approvalId) return "NONE";
  const st = (await requestStatuses({ tenantId }, [approvalId]))[approvalId];
  if (st === "APPROVED" || st === "REJECTED" || st === "CANCELLED" || st === "PENDING") return st;
  return "PENDING"; // หาไม่พบ = ยังไม่ได้อนุมัติ (ปฏิเสธการทำต่อแบบ PENDING)
}
/** ด่านอนุมัติกฎหมาย: ไม่มีคำขอ/อนุมัติแล้ว ⇒ null · ค้าง ⇒ NEEDS_APPROVAL · ปฏิเสธ/ยกเลิก ⇒ LEGAL_REJECTED */
async function approvalGate(tenantId: string, snap: Record<string, unknown> | null): Promise<Fail | null> {
  const st = await approvalStatusOf(tenantId, snapLegal(snap).approvalId);
  if (st === "NONE" || st === "APPROVED") return null;
  if (st === "PENDING") return fail("NEEDS_APPROVAL", "สัญญานี้ข้ามคำเตือนกฎหมาย (เงินประกัน + ค่าเช่าล่วงหน้า) และยังรอเจ้าของร้านอนุมัติ — ทำต่อได้หลังอนุมัติ");
  return fail("LEGAL_REJECTED", "เจ้าของร้านไม่อนุมัติการข้ามคำเตือนกฎหมายของสัญญานี้ — ยกเลิกสัญญาแล้วทำใหม่ด้วยยอดที่ไม่เกินเพดาน");
}

// ───────────────────────── ไฟล์ ─────────────────────────
function sniffOk(ct: string, d: Uint8Array): boolean {
  const at = (i: number) => d[i] ?? -1;
  const ascii = (from: number, s: string) => [...s].every((c, i) => at(from + i) === c.charCodeAt(0));
  switch (ct) {
    case "image/jpeg":
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/png":
      return at(0) === 0x89 && ascii(1, "PNG");
    case "application/pdf":
      return ascii(0, "%PDF-");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
    case "image/heif":
      // K7: ISO-BMFF ต้องมี brand ของ HEIF (ไม่ใช่วิดีโอ mp4/mov ที่หัวเป็น ftyp เหมือนกัน)
      return ascii(4, "ftyp") && ["heic", "heix", "mif1", "msf1"].some((b) => ascii(8, b));
    default:
      return false;
  }
}
type InFile = { data: Uint8Array; contentType: string };
/** ไฟล์ใช้ได้ไหม (ชนิดที่รับ · ≤ 10 MB · ไม่ว่าง · ไบต์หัวตรงชนิด) — ผิด ⇒ null */
function fileOf(v: unknown, allowed: readonly string[]): InFile | null {
  if (!isRec(v) || !(v.data instanceof Uint8Array) || typeof v.contentType !== "string") return null;
  const ct = v.contentType.split(";")[0].trim().toLowerCase();
  if (!allowed.includes(ct)) return null;
  if (v.data.length === 0 || v.data.length > MAX_FILE_BYTES) return null;
  if (!sniffOk(ct, v.data)) return null;
  return { data: v.data, contentType: ct };
}
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" };
async function putPrivate(tenantId: string, f: InFile, label: string, deps: FileDeps | undefined): Promise<string | null> {
  const r = await uploadFile(
    { tenantId },
    { kind: "ATTACHMENT", visibility: "private", filename: `${label}.${EXT[f.contentType] ?? "bin"}`, contentType: f.contentType, data: f.data, maxBytes: MAX_FILE_BYTES },
    deps?.put ? { put: deps.put } : undefined,
  );
  return r.ok ? r.assetId : null;
}
async function dropFiles(tenantId: string, ids: string[], deps: FileDeps | undefined): Promise<void> {
  for (const id of ids) {
    try {
      await deleteFileAsset({ tenantId }, id, deps?.put ? { del: async () => 200 } : undefined);
    } catch {
      /* best-effort — ไฟล์ส่วนตัวที่ค้างไม่มีลิงก์ใดชี้ */
    }
  }
}

// ───────────────────────── สัญญา (ข้อความ · ข้อบังคับ) ─────────────────────────
/** K9: snapshot ที่ตัดข้อความสัญญา (textTh · ชื่อผู้เช่าที่ใช้ตรวจ) ออก — ข้อบังคับ/ค่าที่ล็อกยังอยู่ครบ */
function omitContractText(snap: Record<string, unknown> | null): unknown {
  if (!snap) return null;
  const c = isRec(snap.contract) ? snap.contract : null;
  if (!c) return snap;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (k !== "textTh" && k !== "tenantName" && k !== "clauses") rest[k] = v;
  if (Array.isArray(c.clauses))
    rest.clauses = c.clauses.map((x) => (isRec(x) && typeof x.textTh === "string" && findForbiddenTerms(x.textTh).length ? { ...x, textTh: null } : x));
  return { ...snap, contract: { ...rest, textOmitted: true } };
}
function templateText(v: unknown): string {
  if (typeof v === "string") return v;
  if (isRec(v) && typeof v.th === "string") return v.th;
  return "";
}
/** ข้อเพิ่มของหน่วย — รูปผิด/ id ซ้ำข้อบังคับ/ id ซ้ำกันเอง ⇒ null (INVALID_CLAUSE ทุกโหมด) */
function extraClausesOf(v: unknown): Clause[] | null {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) return null;
  // K7: เทียบ id แบบไม่สนตัวพิมพ์/ช่องว่าง (`"RENT-FIXED "` = ข้อบังคับ `rent-fixed`)
  const idKey = (id: string) => id.replace(/\s+/g, "").toLowerCase();
  const mand = new Set(MANDATORY_CLAUSES.map((m) => idKey(m.id)));
  const seen = new Set<string>();
  const out: Clause[] = [];
  for (const x of v) {
    if (!isRec(x) || !isStr(x.id) || !isStr(x.textTh)) return null;
    const id = x.id.trim();
    if (mand.has(idKey(id)) || seen.has(idKey(id))) return null;
    seen.add(idKey(id));
    out.push({ id, titleTh: null, textTh: x.textTh, mandatory: false });
  }
  return out;
}
function clauseBlock(cs: Clause[], startNo: number): string {
  return cs.map((c, i) => `ข้อ ${startNo + i}${c.titleTh ? ` ${c.titleTh}` : ""}\n${c.textTh}`).join("\n\n");
}
/** K2 ▸ ตัวแปรในแม่แบบต้องอยู่ในทะเบียนของค่าตั้ง (ตัวที่ไม่รู้จัก ⇒ ปฏิเสธ · ไม่แทนเป็นค่าว่าง) */
function templateVarsOk(value: unknown): boolean {
  const def = getDef("rooms.lease.contractTemplate");
  if (!def) return false;
  return checkTemplate(def, value).length === 0;
}
/** K2 ▸ คำกลางแทนชื่อผู้เช่าก่อนตรวจคำต้องห้าม (ชื่อคนที่บังเอิญคล้ายคำต้องห้ามไม่ทำให้ผิด · คั่นช่องว่างกันต่อคำข้างเคียง) */
const TENANT_TOKEN = "ผู้เช่า";
function neutralText(text: string, tenantName: string | null): string {
  return tenantName && tenantName.trim() ? text.split(tenantName).join(` ${TENANT_TOKEN} `) : text;
}
/**
 * K8 ▸ คำต้องห้ามที่ "ไม่ได้อยู่ภายในชื่อผู้เช่าทั้งคำ" — สแกน 2 ทาง:
 *   (ก) ข้อความที่แทนชื่อด้วยคำกลาง (คำต้องห้ามของฝั่งผู้ให้เช่า) · (ข) ข้อความจริง (ชื่อจริง) — นับต่อคำหลัง normalize:
 *   จำนวนที่พบในข้อความจริง ต้องไม่เกิน (จำนวนในข้อความคำกลาง + จำนวนในชื่อ × จำนวนครั้งที่ชื่อปรากฏ) ไม่งั้นมีคำที่คร่อมขอบชื่อ (เช่น "ตัด{tenantName}" + "ไฟ…")
 */
function countNorm(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}
function forbiddenOutsideName(text: string, tenantName: string | null): boolean {
  const neutral = neutralText(text, tenantName);
  if (findForbiddenTerms(neutral).length) return true;
  const real = findForbiddenTerms(text);
  if (!real.length) return false;
  const name = tenantName && tenantName.trim() ? tenantName : "";
  const nameTimes = name ? text.split(name).length - 1 : 0;
  const nText = normalizeLegalText(text);
  const nNeutral = normalizeLegalText(neutral);
  const nName = normalizeLegalText(name);
  for (const term of real) {
    const t = normalizeLegalText(term);
    if (countNorm(nText, t) > countNorm(nNeutral, t) + countNorm(nName, t) * nameTimes) return true;
  }
  return false;
}
/** K2 ▸ ข้อความสัญญาที่บันทึกไว้มีคำต้องห้าม ⇒ LEGAL_BLOCK (ใช้ตอนลงชื่อ/พิมพ์ — ข้อความแบบนี้ห้ามออกจากระบบทุกโหมด) */
function contractThreat(snap: Record<string, unknown> | null): Fail | null {
  const c = snap && isRec(snap.contract) ? snap.contract : null;
  if (!c || typeof c.textTh !== "string") return null;
  const clauseHit = Array.isArray(c.clauses) && c.clauses.some((x) => isRec(x) && typeof x.textTh === "string" && findForbiddenTerms(x.textTh).length > 0);
  if (!clauseHit && !forbiddenOutsideName(c.textTh, typeof c.tenantName === "string" ? c.tenantName : null)) return null;
  // ไม่ใส่คำที่พบลงในเหตุผล (ข้อความต้องห้ามห้ามออกจากระบบแม้ในข้อความแจ้งเตือน)
  return fail("LEGAL_BLOCK", "ข้อความสัญญามีถ้อยคำที่ประกาศ สคบ. ห้าม — ใช้สัญญานี้ไม่ได้ ยกเลิกแล้วทำสัญญาใหม่หลังแก้แม่แบบ", {
    code: "TEMPLATE_NO_THREAT",
    messageTh: "ข้อความสัญญามีถ้อยคำข่มขู่/ข้อห้ามตามประกาศ",
    citation: "ประกาศ สคบ. ว่าด้วยข้อห้ามในสัญญาเช่า (ภาคผนวก ก #38 #50)",
  });
}
function renderContract(tpl: string, clauses: Clause[], vars: Record<string, string>): string {
  const mand = clauses.filter((c) => c.mandatory);
  const extra = clauses.filter((c) => !c.mandatory);
  const mandText = clauseBlock(mand, 1);
  const extraText = clauseBlock(extra, mand.length + 1);
  const all: Record<string, string> = { ...vars, mandatoryClauses: mandText, extraClauses: extraText };
  let text = tpl.replace(/\{\s*([a-zA-Z]+)\s*\}/g, (_m, name: string) => (Object.prototype.hasOwnProperty.call(all, name) ? all[name] : ""));
  // ข้อบังคับระบบใส่เอง — แม่แบบไม่มีที่วาง ⇒ ต่อท้าย (ลบด้วยแม่แบบไม่ได้) · ข้อเพิ่มเช่นกัน
  if (!/\{\s*mandatoryClauses\s*\}/.test(tpl)) text = `${text.trimEnd()}\n\n${mandText}`;
  if (extra.length && !/\{\s*extraClauses\s*\}/.test(tpl)) text = `${text.trimEnd()}\n\n${extraText}`;
  return text.trim();
}

// ═════════════════════════ createLease (§3.1) ═════════════════════════
/** SVC D.4 ▸ เครื่องหมายงานนำเข้า (อาร์กิวเมนต์ภายในโมดูล · ไม่เปิดผ่าน server action ใด) — ใบสั่ง svc-brief-d.4 §5.3 ◂ */
export type LeaseImportMark = { importBatchId: string; rowNo: number; claimToken: string };
const importMarkOf = (v: unknown): LeaseImportMark | null =>
  isRec(v) && isStr(v.importBatchId) && isInt(v.rowNo) && v.rowNo > 0 && isStr(v.claimToken) ? { importBatchId: v.importBatchId, rowNo: v.rowNo, claimToken: v.claimToken } : null;
/**
 * SVC D.4 (X5) ▸ งานนำเข้าต้องถือ claim ของชุดอยู่จริง — คำสั่งแรกของ tx: ล็อก `dorm.import:<unitId>` (ลำดับล็อก: import → lease → Tenant)
 *   ชุดไม่ใช่ CREATING หรือ claimToken ไม่ตรง (zombie ถูกแย่ง/ชุดถูกย้อนแล้ว) ⇒ ปฏิเสธ BUSY ไม่มีผลข้างเคียง · ผ่าน ⇒ ต่ออายุ claimUntil
 */
async function holdImportClaim(tx: Tx, tenantId: string, unitId: string, mark: LeaseImportMark): Promise<void> {
  await advisoryLock(tx, `dorm.import:${unitId}`);
  const r = await tx.dormImportBatch.updateMany({
    where: { id: mark.importBatchId, tenantId, unitId, status: "CREATING", claimToken: mark.claimToken },
    data: { claimUntil: new Date(Date.now() + 120_000) },
  });
  if (r.count !== 1) throw new Abort(fail("BUSY", "งานนำเข้านี้ไม่ได้ถือสิทธิ์ทำต่อแล้ว (มีงานอื่นรับช่วงหรือชุดถูกย้อนกลับ) — ไม่มีอะไรเปลี่ยน"));
}
/** สัญญานี้สร้างโดยชุดนำเข้าที่ระบุไหม (policySnapshot.import.batchId) */
function importedBy(snap: Record<string, unknown> | null, mark: LeaseImportMark | null): boolean {
  const im = snap && isRec(snap.import) ? snap.import : null;
  return !!mark && !!im && im.batchId === mark.importBatchId;
}

export async function createLease(ctx: LeaseCtx, input: CreateLeaseInput, internal?: LeaseImportMark): Promise<CreateLeaseResult> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    // 1. ด่าน · ห้อง · Party ที่ระบุ
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const { tenantId, unitId } = g;
    if (!isStr(input.roomId) || !roomVisible(g, input.roomId)) return notFound(); // D.13 ▸ ห้องนอกขอบเขตอาคาร = ไม่พบ ◂
    const room = await scoped(tenantId, unitId).hotelRoom.findFirst({
      where: { id: input.roomId },
      select: { id: true, number: true, roomTypeId: true, roomType: { select: { name: true, monthlyRateSatang: true } } },
    });
    if (!room) return notFound();
    const t = input.tenant;
    if (!isRec(t)) return fail("INVALID_INPUT", "ระบุผู้เช่า (เลือกผู้เช่าเดิม หรือกรอกชื่อพร้อมเบอร์โทร/เลขบัตรประชาชน)");
    let givenPartyId: string | null = null;
    const confirmId = "confirmPartyId" in t && t.confirmPartyId !== undefined && t.confirmPartyId !== null ? t.confirmPartyId : null;
    if ("partyId" in t || confirmId !== null) {
      const pid = "partyId" in t ? t.partyId : confirmId;
      if (!isStr(pid)) return notFound();
      const p = await tenantDb({ tenantId }).party.findFirst({ where: { id: pid }, select: { id: true } });
      if (!p) return notFound();
      givenPartyId = p.id;
    }
    const createNewParty = "createNewParty" in t && t.createNewParty === true;

    // 2. รูปแบบ
    const start = parseYmd(input.startDate) ? input.startDate : null;
    if (!start) return fail("INVALID_INPUT", "วันเริ่มสัญญาไม่ถูกต้อง (ใช้รูปแบบ ปปปป-ดด-วว)");
    if (!isInt(input.months) || input.months < 1 || input.months > MAX_MONTHS) return fail("INVALID_INPUT", "ระยะสัญญาต้องเป็นจำนวนเดือนเต็ม 1–360 เดือน");
    const months = input.months;
    for (const k of ["rentSatang", "commonFeeSatang", "depositSatang", "advanceRentSatang", "bookingFeeSatang"] as const) {
      const v = input[k];
      if (v !== undefined && v !== null && !isMoney(v)) return fail("INVALID_INPUT", "ยอดเงินต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ และไม่เกิน ฿10,000,000");
    }
    let newTenant: { name: string; phone: string | null; idCardNo: string | null; email: string | null } | null = null;
    // K9 ▸ ยืนยันผู้เช่าเดิม (confirmPartyId) — เลขบัตร/เบอร์/อีเมลที่กรอกมา ⇒ เติมให้รายนั้นถ้ายังไม่มี (ไม่ทิ้งเงียบ)
    let confirmFill: { phone: string | null; idCardNo: string | null; email: string | null } | null = null;
    if (confirmId !== null) {
      const tt = t as Record<string, unknown>;
      for (const k of ["phone", "idCardNo", "email"] as const) if (tt[k] !== undefined && tt[k] !== null && typeof tt[k] !== "string") return fail("INVALID_INPUT", "ข้อมูลติดต่อผู้เช่าไม่ถูกต้อง");
      const idRaw = typeof tt.idCardNo === "string" ? tt.idCardNo.trim() : "";
      const idCardNo = idRaw ? idRaw.replace(/[\s-]/g, "") : "";
      if (idRaw && !thaiIdOk(idCardNo)) return fail("INVALID_ID_CARD", "เลขบัตรประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักที่เลขตรวจถูกต้อง) — ตรวจกับบัตรอีกครั้ง");
      const phoneRaw = typeof tt.phone === "string" ? tt.phone.trim() : "";
      if (phoneRaw && normalizePartyPhone(phoneRaw).length < 9) return fail("INVALID_INPUT", "เบอร์โทรผู้เช่าไม่ถูกต้อง");
      const email = typeof tt.email === "string" && tt.email.trim() ? tt.email.trim().slice(0, 200) : null;
      confirmFill = { phone: phoneRaw || null, idCardNo: idCardNo || null, email };
    }
    if (!givenPartyId) {
      const tt = t as Record<string, unknown>;
      if (!isStr(tt.name) || tt.name.trim().length > 200) return fail("INVALID_INPUT", "กรอกชื่อผู้เช่า");
      for (const k of ["phone", "idCardNo", "email"] as const) if (tt[k] !== undefined && tt[k] !== null && typeof tt[k] !== "string") return fail("INVALID_INPUT", "ข้อมูลติดต่อผู้เช่าไม่ถูกต้อง");
      const idRaw = typeof tt.idCardNo === "string" ? tt.idCardNo.trim() : "";
      const idCardNo = idRaw ? idRaw.replace(/[\s-]/g, "") : "";
      if (idRaw && !thaiIdOk(idCardNo)) return fail("INVALID_ID_CARD", "เลขบัตรประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลักที่เลขตรวจถูกต้อง) — ตรวจกับบัตรอีกครั้ง");
      const phoneRaw = typeof tt.phone === "string" ? tt.phone.trim() : "";
      if (phoneRaw && normalizePartyPhone(phoneRaw).length < 9) return fail("INVALID_INPUT", "เบอร์โทรผู้เช่าไม่ถูกต้อง");
      if (!phoneRaw && !idCardNo) return fail("INVALID_INPUT", "ต้องมีเบอร์โทรหรือเลขบัตรประชาชนของผู้เช่าอย่างน้อย 1 อย่าง (ใช้หาผู้เช่าซ้ำ)");
      const email = typeof tt.email === "string" && tt.email.trim() ? tt.email.trim().slice(0, 200) : null;
      newTenant = { name: tt.name.trim(), phone: phoneRaw || null, idCardNo: idCardNo || null, email };
    }
    const co = parseCoTenants(input.occupants, input.vehicles);
    if (!co) return fail("INVALID_INPUT", `ผู้พักร่วมและรถต่อสัญญาได้ไม่เกิน ${MAX_PEOPLE} รายการ และต้องกรอกชื่อ/ทะเบียนให้ครบ`);
    if (input.legalAck !== undefined && input.legalAck !== null && !(isRec(input.legalAck) && typeof input.legalAck.reason === "string"))
      return fail("INVALID_INPUT", "การยอมรับคำเตือนกฎหมายต้องมีเหตุผล");
    if (input.note !== undefined && input.note !== null && typeof input.note !== "string") return fail("INVALID_INPUT", "หมายเหตุไม่ถูกต้อง");

    // snapshot (ล็อกตอนนี้ — ค่าเริ่ม/แม่แบบ/ข้อเพิ่มอ่านจากที่นี่) + โหมดกฎหมายสด
    const refs = { unitId, roomTypeId: room.roomTypeId, roomId: room.id };
    const snap: PolicySnapshot = await snapshotPolicy({ tenantId }, "lease", refs);
    const live = await resolveSettings({ tenantId }, ["rooms.legal.mode", "rooms.legal.outOfScopeReason", "rooms.lease.reservationMonths"], refs);
    const sv = (k: string) => (Object.prototype.hasOwnProperty.call(snap.values, k) ? snap.values[k] : undefined);

    const rentSetting = sv("rooms.rent.monthly");
    const rent = isMoney(input.rentSatang)
      ? input.rentSatang
      : isMoney(rentSetting) && rentSetting > 0
        ? rentSetting
        : isMoney(room.roomType.monthlyRateSatang) && room.roomType.monthlyRateSatang > 0
          ? room.roomType.monthlyRateSatang
          : null;
    if (rent === null) return fail("RENT_REQUIRED", "ยังไม่ได้ตั้งค่าห้องต่อเดือนของห้อง/ประเภทห้องนี้ — ระบุค่าห้องในสัญญา หรือตั้งค่าห้องที่หน้าตั้งค่าก่อน");
    if (rent <= 0) return fail("INVALID_INPUT", "ค่าห้องต่อเดือนต้องมากกว่า 0");
    const appliesTo = sv("rooms.lease.reservationAppliesTo") === "FIRST_RENT" ? "FIRST_RENT" : "DEPOSIT";
    const deposit = isMoney(input.depositSatang) ? input.depositSatang : natOr(sv("rooms.deposit.months"), 0) * rent;
    const advance = isMoney(input.advanceRentSatang) ? input.advanceRentSatang : natOr(sv("rooms.lease.advanceMonths"), 0) * rent;
    const commonFee = isMoney(input.commonFeeSatang) ? input.commonFeeSatang : 0;
    const booking = isMoney(input.bookingFeeSatang)
      ? input.bookingFeeSatang
      : appliesTo === "FIRST_RENT"
        ? 0
        : Math.min(natOr(live["rooms.lease.reservationMonths"]?.value, 0) * rent, deposit);
    if (![deposit, advance, booking].every(isMoney)) return fail("INVALID_INPUT", "ยอดเงินที่คิดจากค่าตั้งเกิน ฿10,000,000 — ระบุยอดในสัญญาเอง");

    // 3. เงินจอง (หักเข้าประกันเท่านั้น — FIRST_RENT = หนี้ D.8)
    if (booking > deposit) return fail("INVALID_AMOUNT", "เงินจองต้องไม่เกินเงินประกัน (เงินจองหักเข้าเงินประกันวันเข้าอยู่)");
    if (appliesTo === "FIRST_RENT" && booking > 0)
      return fail("NOT_SUPPORTED", "หอนี้ตั้งให้เงินจองหักเข้าค่าห้องเดือนแรก ซึ่งระบบยังไม่รองรับ — ตั้งเงินจองเป็น 0 หรือเปลี่ยนค่าตั้งเป็นหักเข้าเงินประกัน");

    // 4. ตัวกั้นประกัน + ล่วงหน้า (ค่าห้องอย่างเดียว ไม่รวมส่วนกลาง) — โหมดสด
    const mode = normalizeLegalMode(live["rooms.legal.mode"]?.value);
    const oosReason = typeof live["rooms.legal.outOfScopeReason"]?.value === "string" ? (live["rooms.legal.outOfScopeReason"]?.value as string) : null;
    const lctx = { mode, outOfScopeReason: oosReason };
    const kind = legalLeaseKind(months);
    if (!kind) return fail("INVALID_INPUT", "ระยะสัญญาเกินที่กฎหมายกำหนด");
    const dep = evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { leaseKind: kind, monthlyRentSatang: rent, depositSatang: deposit, advanceRentSatang: advance }, lctx);
    let legalLevel: "OK" | "WARN" = "OK";
    let legalCode: string | null = null;
    let legalReason: string | null = null;
    let needsOwnerStep = false;
    if (dep.level === "BLOCK") return fail("LEGAL_BLOCK", dep.messageTh, legalInfo(dep));
    if (dep.level === "WARN") {
      const ack = isRec(input.legalAck) ? input.legalAck : null;
      if (!ack) return fail("NEEDS_APPROVAL", `${dep.messageTh} — ถ้าจำเป็นต้องใช้ยอดนี้ ให้ยืนยันพร้อมเหตุผล (ไม่ใช่เจ้าของร้านต้องรอเจ้าของอนุมัติ)`, legalInfo(dep));
      if (!isValidOutOfScopeReason(ack.reason)) return fail("REASON_REQUIRED", "ระบุเหตุผลที่ต้องข้ามคำเตือนกฎหมายอย่างน้อย 10 ตัวอักษร", legalInfo(dep));
      legalLevel = "WARN";
      legalCode = dep.code;
      legalReason = ack.reason.trim();
      needsOwnerStep = g.role !== "OWNER";
    }

    // 5. ข้อสัญญา: ข้อบังคับ 7 ข้อ (ระบบใส่เอง · ถ้อยคำตรงตัว) + ข้อเพิ่มของหน่วย · คำต้องห้ามบล็อกทุกโหมด
    const extras = extraClausesOf(sv("rooms.lease.extraClauses"));
    if (!extras) return fail("INVALID_CLAUSE", "ข้อสัญญาเพิ่มเติมของหอซ้ำหรือทับข้อบังคับตามประกาศ (แก้ถ้อยคำข้อบังคับไม่ได้) — แก้ที่หน้าตั้งค่าสัญญาก่อน");
    const clauses: Clause[] = [...MANDATORY_CLAUSES.map((m) => ({ id: m.id, titleTh: m.titleTh, textTh: m.textTh, mandatory: true })), ...extras];
    const tplValue = sv("rooms.lease.contractTemplate");
    if (!templateVarsOk(tplValue)) return fail("INVALID_TEMPLATE", "แม่แบบสัญญาของหอมีตัวแปรที่ระบบไม่รู้จัก — แก้แม่แบบที่หน้าตั้งค่าสัญญาก่อน (ระบบไม่เติมค่าว่างแทน)");
    const tpl = templateText(tplValue);
    const cm = evaluateLegal("CONTRACT_MANDATORY_CLAUSES", { clauses: clauses.map((c) => ({ id: c.id, text: c.textTh })) }, lctx);
    if (cm.level !== "OK") return fail("LEGAL_BLOCK", cm.messageTh, legalInfo(cm));
    const th = evaluateLegal("TEMPLATE_NO_THREAT", { text: tpl }, lctx);
    if (th.level !== "OK") return fail("LEGAL_BLOCK", th.messageTh, legalInfo(th));

    // K2: ตรวจคำต้องห้ามบน "ข้อความที่ render แล้ว" (ชื่อหอ/ข้อเพิ่ม/ตัวแปรว่างค่าจริง · ชื่อผู้เช่าแทนด้วยคำกลาง) — ทุกโหมด
    const leaseId = newLeaseId();
    const endDate = leaseEndDate(start, months);
    const today = bkkYmd(new Date());
    const varsOf = (tenantName: string): Record<string, string> => ({
      leaseNo: leaseNoOf(leaseId),
      unitName: g.unitName,
      signDate: thaiDateLong(today),
      landlordName: g.unitName,
      tenantName,
      roomNo: room.number,
      startDate: thaiDateLong(start),
      endDate: thaiDateLong(endDate),
      rent: bahtText(rent),
    });
    const rendered = evaluateLegal("TEMPLATE_NO_THREAT", { text: renderContract(tpl, clauses, varsOf(` ${TENANT_TOKEN} `)) }, lctx);
    if (rendered.level !== "OK") return fail("LEGAL_BLOCK", rendered.messageTh, legalInfo(rendered));

    // 6. tx เดียว: (สายอนุมัติ) → Party → claimRoom → คำขออนุมัติ → แถวสัญญา + snapshot → audit
    const importMark = importMarkOf(internal); // SVC D.4 ▸ ไม่ส่ง = พฤติกรรมเดิม ◂
    const res = await runTx(tenantId, unitId, async (tx) => {
      if (importMark) await holdImportClaim(tx, tenantId, unitId, importMark); // SVC D.4 (X5) ◂
      if (needsOwnerStep) {
        const policy = await resolvePolicy({ tenantId }, { entityType: ENTITY, unitId, systemId: null, amountSatang: null }, tx);
        const steps = policy ? await tx.approvalStep.findMany({ where: { tenantId, policyId: policy.id }, select: { approverRole: true } }) : [];
        if (!steps.some((s) => s.approverRole === "OWNER"))
          throw new Abort(fail("NEEDS_APPROVAL", "การข้ามคำเตือนกฎหมายในสัญญาต้องให้เจ้าของร้านอนุมัติ — ให้เจ้าของทำสัญญานี้เอง หรือตั้งสายอนุมัติที่มีขั้นเจ้าของร้านก่อน", legalInfo(dep)));
      }
      // ผู้เช่า = Party
      let partyId: string;
      let partyCreated = false;
      if (givenPartyId) {
        partyId = await resolveCanonical(tenantId, givenPartyId, tx);
        if (confirmFill && (confirmFill.idCardNo || confirmFill.phone || confirmFill.email)) {
          const keys: string[] = [];
          if (confirmFill.idCardNo) keys.push(`dorm.party:${tenantId}:id:${normalizePartyTaxId(confirmFill.idCardNo)}`);
          const cph = normalizePartyPhone(confirmFill.phone ?? "");
          if (cph) keys.push(`dorm.party:${tenantId}:ph:${cph}`);
          for (const k of keys.sort()) await advisoryLock(tx, k);
          const cur = await tx.party.findFirst({ where: { tenantId, id: partyId }, select: { taxId: true, phoneNorm: true, email: true } });
          if (cur) {
            if (confirmFill.idCardNo && !cur.taxId) await attachPersonTaxId(tenantId, partyId, confirmFill.idCardNo, tx);
            const fillPhone = confirmFill.phone && !cur.phoneNorm ? confirmFill.phone : undefined;
            const fillEmail = confirmFill.email && !cur.email ? confirmFill.email : undefined;
            if (fillPhone !== undefined || fillEmail !== undefined) await updateContactInfo(tenantId, partyId, { ...(fillPhone !== undefined ? { phone: fillPhone } : {}), ...(fillEmail !== undefined ? { email: fillEmail } : {}) }, tx);
          }
        }
      } else {
        const nt = newTenant!;
        const keys: string[] = [];
        if (nt.idCardNo) keys.push(`dorm.party:${tenantId}:id:${normalizePartyTaxId(nt.idCardNo)}`);
        const ph = normalizePartyPhone(nt.phone ?? "");
        if (ph) keys.push(`dorm.party:${tenantId}:ph:${ph}`);
        for (const k of keys.sort()) await advisoryLock(tx, k);
        // K3: จับคู่ใต้ล็อก — เลขบัตรตรง ⇒ รายนั้น (ชื่อต้องตรง) · เบอร์ตรงรายที่ยังไม่มีเลขบัตร + ชื่อตรง ⇒ รายนั้น + เติมเลขบัตร ·
        //     เบอร์ตรงรายที่มีเลขบัตรอื่น ⇒ สร้างใหม่ (+ คู่อาจซ้ำ) · ชื่อไม่ตรง ⇒ TENANT_MATCH_CONFIRM (ไม่ผูกคนผิด · ไม่ทิ้งชื่อที่กรอกเงียบ ๆ)
        const idNorm = nt.idCardNo ? normalizePartyTaxId(nt.idCardNo) : "";
        const confirm = (c: { id: string; name: string; phoneNorm: string | null }, matchedBy: "ID_CARD" | "PHONE") =>
          new Abort({
            ok: false,
            code: "TENANT_MATCH_CONFIRM",
            reason: `${matchedBy === "ID_CARD" ? "เลขบัตรประชาชน" : "เบอร์โทร"}นี้เป็นของผู้ติดต่อชื่ออื่นในร้าน — เลือกใช้ผู้ติดต่อรายนั้น หรือยืนยันสร้างผู้เช่ารายใหม่`,
            candidates: [{ partyId: c.id, name: c.name, phoneMasked: maskPhone(c.phoneNorm), matchedBy }],
          });
        const createFresh = async (): Promise<{ id: string; created: boolean }> => {
          // ไม่ใช้เบอร์/อีเมลเป็นกุญแจจับคู่ (สร้างรายใหม่จริง) แล้วเติมผ่าน facade party (เบอร์ชนรายอื่น ⇒ บันทึกคู่อาจซ้ำให้ร้านตรวจ)
          const r = await findOrCreate(tenantId, { name: nt.name, phone: null, email: null, taxId: idNorm && !byId ? idNorm : null }, tx);
          if (r.created && (nt.phone || nt.email)) await updateContactInfo(tenantId, r.id, { phone: nt.phone, email: nt.email }, tx);
          return r;
        };
        const byId = idNorm ? await tx.party.findFirst({ where: { tenantId, taxId: idNorm, mergedIntoId: null }, select: { id: true, name: true, phoneNorm: true }, orderBy: { createdAt: "asc" } }) : null;
        let r: { id: string; created: boolean };
        if (byId) {
          if (nameMatches(nt.name, byId.name)) r = { id: byId.id, created: false };
          else if (!createNewParty) throw confirm(byId, "ID_CARD");
          else r = await createFresh();
        } else {
          const byPhone = ph.length >= 8 ? await tx.party.findFirst({ where: { tenantId, phoneNorm: ph, mergedIntoId: null }, select: { id: true, name: true, phoneNorm: true, taxId: true }, orderBy: { createdAt: "asc" } }) : null;
          if (byPhone && !createNewParty) {
            if (byPhone.taxId && idNorm) r = await createFresh();
            else if (nameMatches(nt.name, byPhone.name)) {
              if (idNorm) await attachPersonTaxId(tenantId, byPhone.id, idNorm, tx);
              r = { id: byPhone.id, created: false };
            } else throw confirm(byPhone, "PHONE");
          } else if (createNewParty || idNorm) r = await createFresh();
          else r = await findOrCreate(tenantId, { name: nt.name, phone: nt.phone, email: nt.email, taxId: null }, tx);
        }
        partyId = r.id;
        partyCreated = r.created;
      }
      const party = await tx.party.findFirst({ where: { tenantId, id: partyId }, select: { name: true } });
      if (!party) throw new Abort(notFound());
      // ห้อง — EXCLUDE ของฐานตัดสิน
      const c = await claimRoom(tx, {
        tenantId,
        unitId,
        roomId: room.id,
        start,
        end: exclusiveEnd(endDate),
        kind: "LEASE",
        refType: "DormLease",
        refId: leaseId,
        requireRentMode: "MONTHLY",
      });
      if (!c.ok) {
        if (c.code === "ROOM_TAKEN") throw new Abort(fail("ROOM_TAKEN", "ห้องนี้มีผู้เช่าหรือถูกจองในช่วงวันที่เลือกแล้ว — เลือกห้องหรือวันเริ่มอื่น"));
        if (c.code === "ROOM_INACTIVE") throw new Abort(fail("ROOM_UNAVAILABLE", "ห้องนี้ปิดซ่อมหรือปิดใช้งานอยู่ — ทำสัญญาไม่ได้จนกว่าจะเปิดห้อง"));
        if (c.code === "RENT_MODE_MISMATCH") throw new Abort(fail("RENT_MODE_MISMATCH", "ห้องนี้เปิดให้เช่ารายคืน ไม่ใช่รายเดือน — เปลี่ยนโหมดห้องก่อนทำสัญญา"));
        if (c.code === "ROOM_NOT_FOUND" || c.code === "UNIT_MISMATCH") throw new Abort(notFound());
        throw new Abort(fail("INVALID_INPUT", "ช่วงวันที่ของสัญญาไม่ถูกต้อง"));
      }
      // คำขออนุมัติ (ไม่ใช่เจ้าของ + WARN)
      let approvalId: string | null = null;
      if (needsOwnerStep) {
        const sub = await submitForApproval({ tenantId }, { entityType: ENTITY, entityId: leaseId, unitId, requestedById: g.actorUserId }, { tx });
        if (!("requestId" in sub)) throw new Abort(fail("NEEDS_APPROVAL", "การข้ามคำเตือนกฎหมายในสัญญาต้องให้เจ้าของร้านอนุมัติ — ตั้งสายอนุมัติที่มีขั้นเจ้าของร้านก่อน", legalInfo(dep)));
        approvalId = sub.requestId;
      }
      // ข้อความสัญญา (render ครั้งเดียว · เก็บใน snapshot)
      const textTh = renderContract(tpl, clauses, varsOf(party.name));
      // ตาข่ายชั้นสุดท้าย: ข้อความจริงที่ผู้เช่าจะเซ็น (ชื่อผู้เช่าแทนด้วยคำกลาง) ต้องไม่มีคำต้องห้าม
      if (forbiddenOutsideName(textTh, party.name))
        throw new Abort(
          fail("LEGAL_BLOCK", "ข้อความสัญญาที่ได้หลังเติมชื่อผู้เช่ามีถ้อยคำที่ประกาศ สคบ. ห้าม — แก้แม่แบบสัญญาให้มีช่องว่าง/เครื่องหมายคั่นรอบชื่อผู้เช่า", {
            code: "TEMPLATE_NO_THREAT",
            messageTh: "ข้อความสัญญามีถ้อยคำข่มขู่/ข้อห้ามตามประกาศ",
            citation: "ประกาศ สคบ. ว่าด้วยข้อห้ามในสัญญาเช่า (ภาคผนวก ก #38 #50)",
          }),
        );
      const legal: SnapLegal = { mode, level: legalLevel, code: legalCode, reason: legalReason, approvalId };
      const mark = importMark;
      const policySnapshot = { ...snap, contract: { textTh, clauses, tenantName: party.name }, legal, ...(mark ? { import: { batchId: mark.importBatchId, rowNo: mark.rowNo, origin: "IMPORT" } } : {}) };
      await tx.dormLease.create({
        data: {
          id: leaseId,
          tenantId,
          unitId,
          roomId: room.id,
          partyId,
          coTenants: co as unknown as Prisma.InputJsonValue,
          status: "DRAFT",
          termType: "FIXED",
          startDate: dbDate(start),
          endDate: dbDate(endDate),
          rentSatang: rent,
          commonFeeSatang: commonFee,
          depositSatang: deposit,
          advanceRentSatang: advance,
          bookingFeeSatang: booking,
          occupancyId: c.occupancyId,
          templateKey: snap.template.key,
          templateVersion: snap.template.version,
          moveInPhotos: [],
          createdById: g.actorUserId,
          policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          unitId,
          actorType: "USER",
          actorId: g.actorUserId,
          action: "dorm.lease.created",
          targetType: "DormLease",
          targetId: leaseId,
          after: { roomId: room.id, startDate: start, endDate, months, rentSatang: rent, commonFeeSatang: commonFee, depositSatang: deposit, advanceRentSatang: advance, bookingFeeSatang: booking, note: typeof input.note === "string" ? input.note.trim().slice(0, 500) || null : null },
        },
      });
      if (legalLevel === "WARN") {
        // X9: ข้ามคำเตือนกฎหมายต้องมีร่องรอย (รหัส · เหตุผล · คำขออนุมัติ)
        await tx.auditLog.create({
          data: {
            tenantId,
            unitId,
            actorType: "USER",
            actorId: g.actorUserId,
            action: "dorm.lease.legal_override",
            targetType: "DormLease",
            targetId: leaseId,
            after: { code: legalCode, reason: legalReason, approvalId, mode, rentSatang: rent, depositSatang: deposit, advanceRentSatang: advance, actorRole: g.role },
          },
        });
      }
      return { partyId, partyCreated, occupancyId: c.occupancyId, approvalId };
    });
    if ("ok" in res) return res;
    return { ok: true, leaseId, partyId: res.partyId, partyCreated: res.partyCreated, occupancyId: res.occupancyId, startDate: start, endDate, legal: { level: legalLevel, code: legalCode, approvalId: res.approvalId } };
  } catch (e) {
    await logFail("create", tenantIdForLog, e);
    return unavailable();
  }
}

// ═════════════════════════ findTenantCandidates (§3.2) ═════════════════════════
export async function findTenantCandidates(
  ctx: LeaseCtx,
  input: { unitId: string; phone?: string | null; idCardNo?: string | null },
): Promise<{ partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE"; activeLeases: number }[]> {
  if (!isRec(input)) return [];
  // K7: ค้น Party ทั้งร้านด้วยเบอร์/เลขบัตร = ต้อง dorm.lease.manage (ผู้ดูผังอย่างเดียวยืนยันตัวตนจากเลขบัตรไม่ได้)
  const g = await gate(ctx, input.unitId, "manage");
  if (!g) return [];
  const id = typeof input.idCardNo === "string" ? normalizePartyTaxId(input.idCardNo) : "";
  const ph = typeof input.phone === "string" ? normalizePartyPhone(input.phone) : "";
  const or: Prisma.PartyWhereInput[] = [];
  if (id.length === 13) or.push({ taxId: id });
  if (ph.length >= 8) or.push({ phoneNorm: ph });
  if (!or.length) return [];
  const rows = await tenantDb({ tenantId: g.tenantId }).party.findMany({
    where: { mergedIntoId: null, OR: or },
    select: { id: true, name: true, phoneNorm: true, taxId: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const out: { partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE"; activeLeases: number }[] = [];
  for (const r of rows) {
    const activeLeases = await scoped(g.tenantId, g.unitId).dormLease.count({ where: { partyId: r.id, status: { in: ["DRAFT", "ACTIVE", "NOTICE"] }, ...(g.visibleRooms ? { roomId: { in: [...g.visibleRooms] } } : {}) } }); // D.13 P6 ▸ นับเฉพาะห้องในขอบเขตอาคาร ◂
    out.push({ partyId: r.id, name: r.name, phoneMasked: maskPhone(r.phoneNorm), matchedBy: id.length === 13 && r.taxId === id ? "ID_CARD" : "PHONE", activeLeases });
  }
  return out;
}

// ═════════════════════════ เงิน (§3.3 · §3.4) ═════════════════════════
type MoneyOpts = { paidAt: Date; channel: Channel; financeAccountId: string | null };
function moneyOpts(input: Record<string, unknown>): MoneyOpts | Fail {
  const paidAt = input.paidAt === undefined || input.paidAt === null ? new Date() : input.paidAt;
  if (!(paidAt instanceof Date) || Number.isNaN(paidAt.getTime())) return fail("INVALID_INPUT", "วันเวลารับเงินไม่ถูกต้อง");
  const channel = input.channel === undefined || input.channel === null ? "TRANSFER" : input.channel;
  if (channel !== "CASH" && channel !== "TRANSFER" && channel !== "PROMPTPAY") return fail("INVALID_INPUT", "ช่องทางรับเงินไม่ถูกต้อง");
  const fa = input.financeAccountId;
  if (fa !== undefined && fa !== null && typeof fa !== "string") return fail("INVALID_INPUT", "บัญชีรับเงินไม่ถูกต้อง");
  return { paidAt, channel, financeAccountId: typeof fa === "string" && fa ? fa : null };
}
const isFail = (x: unknown): x is Fail => isRec(x) && x.ok === false;

export async function receiveBookingFee(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string; paidAt?: Date; channel?: Channel; financeAccountId?: string | null },
): Promise<{ ok: true; duplicate: boolean; entryId: string; entryNo: string; heldSatang: number } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    if (lease.status !== "DRAFT") return fail("NOT_EDITABLE", "รับเงินจองได้เฉพาะสัญญาที่ยังไม่เข้าอยู่");
    if (lease.bookingFeeSatang <= 0) return fail("NO_BOOKING_FEE", "สัญญานี้ไม่มีเงินจอง");
    const ap = await approvalGate(g.tenantId, snapOf(lease.policySnapshot));
    if (ap) return ap;
    const mo = moneyOpts(input as Record<string, unknown>);
    if (isFail(mo)) return mo;
    // K1: tx เดียว — ① ล็อกสัญญา → ตรวจสถานะซ้ำ → ② postSecurityDepositInTx (แถว Tenant → ลิงก์ → คีย์ → JV) · ยกเลิกพร้อมกันรอล็อกเดียวกัน
    const out = await withTenantContact(g, lease.partyId, () =>
      moneyTx(async (tx) => {
        await advisoryLock(tx, leaseLockKey(lease.id));
        const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true } });
        if (!cur) throw new Abort(notFound());
        if (cur.status !== "DRAFT") throw new Abort(fail("NOT_EDITABLE", "รับเงินจองได้เฉพาะสัญญาที่ยังไม่เข้าอยู่"));
        const r = await postSecurityDepositInTx(tx, {
          tenantId: g.tenantId,
          unitId: g.unitId,
          leaseId: lease.id,
          amountSatang: lease.bookingFeeSatang,
          idempotencyKey: `dorm.lease:${lease.id}:booking`,
          partyId: lease.partyId,
          paidAt: mo.paidAt,
          channel: mo.channel,
          financeAccountId: mo.financeAccountId,
          note: `เงินจองสัญญาเช่า ${leaseNoOf(lease.id)} (หักเข้าเงินประกัน)`,
          createdById: g.actorUserId,
        });
        if (!r.ok) throw new Abort(fail(r.code, r.reason));
        return { duplicate: r.duplicate, entryId: r.entryId, entryNo: r.entryNo };
      }),
    );
    if ("ok" in out) return out;
    const heldSatang = await securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id });
    return { ok: true, duplicate: out.duplicate, entryId: out.entryId, entryNo: out.entryNo, heldSatang };
  } catch (e) {
    await logFail("booking", tenantIdForLog, e);
    return moneyUnavailable();
  }
}

type Receipt = { entryId: string; entryNo: string; amountSatang: number; kind: "BOOKING" | "DEPOSIT" };

export async function moveIn(
  ctx: LeaseCtx,
  input: {
    unitId: string;
    leaseId: string;
    paidAt?: Date;
    channel?: Channel;
    financeAccountId?: string | null;
    meterReadings?: { meterId: string; value: number }[];
  },
  internal?: LeaseImportMark,
): Promise<{ ok: true; duplicate: boolean; status: "ACTIVE"; heldSatang: number; receipts: Receipt[] } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    // 1. ด่าน · ACTIVE แล้ว = ผลเดิม
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    const dupResult = async () => ({
      ok: true as const,
      duplicate: true,
      status: "ACTIVE" as const,
      heldSatang: await securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id }),
      receipts: [] as Receipt[],
    });
    if (lease.status === "ACTIVE") return await dupResult();
    if (lease.status !== "DRAFT") return fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — เข้าอยู่ไม่ได้");

    // 2. ก่อนเงิน: อนุมัติกฎหมาย · ลงชื่อ · รูปวันเข้า (ขั้นต่ำจาก snapshot) · มิเตอร์
    const snap = snapOf(lease.policySnapshot);
    const ap = await approvalGate(g.tenantId, snap);
    if (ap) return ap;
    // SVC D.4 ▸ สัญญากระดาษเดิมที่นำเข้า (ชุดเดียวกับ internal) ข้ามเฉพาะด่านลงชื่อ + รูปวันเข้า (RULING-6) — อย่างอื่นเหมือนเดิม ◂
    const moveMark = importMarkOf(internal);
    const paperImport = importedBy(snap, moveMark);
    if (!lease.signedAt && !paperImport) return fail("NOT_SIGNED", "ผู้เช่ายังไม่ได้ลงชื่อสัญญา — ลงชื่อบนจอหรือแนบสัญญาที่ลงชื่อแล้วก่อน");
    const need = photosMinOf(snap);
    const have = photosOf(lease.moveInPhotos).filter((p) => p.kind === "ROOM_PHOTO").length;
    if (have < need && !paperImport) return fail("PHOTOS_REQUIRED", `ต้องมีรูปห้องวันเข้าอย่างน้อย ${need} รูป — ขาดอีก ${need - have} รูป`);
    const mo = moneyOpts(input as Record<string, unknown>);
    if (isFail(mo)) return mo;
    const readings: { meterId: string; value: number }[] = [];
    if (input.meterReadings !== undefined && input.meterReadings !== null) {
      if (!Array.isArray(input.meterReadings) || input.meterReadings.length > 20) return fail("INVALID_INPUT", "เลขมิเตอร์วันเข้าไม่ถูกต้อง");
      const seen = new Set<string>();
      for (const r of input.meterReadings) {
        if (!isRec(r) || !isStr(r.meterId)) return fail("INVALID_INPUT", "เลขมิเตอร์วันเข้าไม่ถูกต้อง");
        if (!isInt(r.value) || r.value < 0 || r.value > MAX_READING) return fail("INVALID_INPUT", "เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ");
        if (seen.has(r.meterId)) continue;
        seen.add(r.meterId);
        readings.push({ meterId: r.meterId, value: r.value });
      }
      if (readings.length) {
        const ok = await scoped(g.tenantId, g.unitId).dormMeter.count({ where: { id: { in: readings.map((r) => r.meterId) }, roomId: lease.roomId, removedAt: null } });
        if (ok !== readings.length) return notFound();
      }
    }

    // 3–4. K1: tx เดียว connection เดียว — ① ล็อกสัญญา → ตรวจสถานะซ้ำ → ② เงิน (InTx · ทีละรายการ · ยอดจากคอลัมน์ · คีย์คงที่)
    //      → ③ ACTIVE + มิเตอร์วันเข้า + audit · ปฏิเสธ/ล้มข้อใด ⇒ rollback ทั้งก้อน (ไม่มีเงินบนสัญญาที่ยัง DRAFT)
    const out = await withTenantContact(g, lease.partyId, () =>
      moneyTx(async (tx) => {
        if (moveMark) await holdImportClaim(tx, g.tenantId, g.unitId, moveMark); // SVC D.4 (X5) ◂
        await advisoryLock(tx, leaseLockKey(lease.id));
        const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, signedAt: true } });
        if (!cur) throw new Abort(notFound());
        if (cur.status === "ACTIVE") return { fresh: false, receipts: [] as Receipt[], held: await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id }) };
        if (cur.status !== "DRAFT") throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — เข้าอยู่ไม่ได้"));
        if (!cur.signedAt && !paperImport) throw new Abort(fail("NOT_SIGNED", "ผู้เช่ายังไม่ได้ลงชื่อสัญญา — ลงชื่อบนจอหรือแนบสัญญาที่ลงชื่อแล้วก่อน"));
        const receipts: Receipt[] = [];
        const base = { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, partyId: lease.partyId, paidAt: mo.paidAt, channel: mo.channel, financeAccountId: mo.financeAccountId, createdById: g.actorUserId };
        if (lease.bookingFeeSatang > 0) {
          const r = await postSecurityDepositInTx(tx, { ...base, amountSatang: lease.bookingFeeSatang, idempotencyKey: `dorm.lease:${lease.id}:booking`, note: `เงินจองสัญญาเช่า ${leaseNoOf(lease.id)} (หักเข้าเงินประกัน)` });
          if (!r.ok) throw new Abort(fail(r.code, r.reason));
          receipts.push({ entryId: r.entryId, entryNo: r.entryNo, amountSatang: lease.bookingFeeSatang, kind: "BOOKING" });
        }
        const rest = lease.depositSatang - lease.bookingFeeSatang;
        if (rest > 0) {
          const r = await postSecurityDepositInTx(tx, { ...base, amountSatang: rest, idempotencyKey: `dorm.lease:${lease.id}:deposit`, note: `เงินประกันสัญญาเช่า ${leaseNoOf(lease.id)} (ส่วนที่เหลือหลังหักเงินจอง)` });
          if (!r.ok) throw new Abort(fail(r.code, r.reason));
          receipts.push({ entryId: r.entryId, entryNo: r.entryNo, amountSatang: rest, kind: "DEPOSIT" });
        }
        const depositDocumentId = receipts.find((x) => x.kind === "DEPOSIT")?.entryId ?? receipts.find((x) => x.kind === "BOOKING")?.entryId ?? null;
        const upd = await tx.dormLease.updateMany({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId, status: "DRAFT", ...(paperImport ? {} : { signedAt: { not: null } }) }, data: { status: "ACTIVE", depositDocumentId } });
        if (upd.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้เปลี่ยนสถานะไปแล้ว — โหลดหน้าใหม่"));
        if (readings.length) {
          const exist = new Set(
            (
              await tx.dormMeterReading.findMany({
                where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, kind: "MOVE_IN", meterId: { in: readings.map((r) => r.meterId) } },
                select: { meterId: true },
              })
            ).map((r) => r.meterId),
          );
          const fresh = readings.filter((r) => !exist.has(r.meterId));
          if (fresh.length)
            await tx.dormMeterReading.createMany({
              data: fresh.map((r) => ({
                tenantId: g.tenantId,
                unitId: g.unitId,
                meterId: r.meterId,
                leaseId: lease.id,
                periodKey: ymdOfDb(lease.startDate).slice(0, 7),
                kind: "MOVE_IN",
                value: r.value,
                readAt: mo.paidAt,
                readById: g.actorUserId,
                source: "MANUAL",
              })),
            });
        }
        await tx.auditLog.create({
          data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.moved_in", targetType: "DormLease", targetId: lease.id, after: { depositDocumentId, receipts: receipts.map((r) => r.entryNo) } },
        });
        return { fresh: true, receipts, held: await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id }) };
      }),
    );
    if ("ok" in out) return out;
    return { ok: true, duplicate: !out.fresh, status: "ACTIVE", heldSatang: out.held, receipts: out.receipts };
  } catch (e) {
    await logFail("movein", tenantIdForLog, e);
    return moneyUnavailable();
  }
}

// ═════════════════════════ signLease (§3.5) ═════════════════════════
export async function signLease(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string; method?: "ON_SCREEN" | "PAPER"; file: { data: Uint8Array; contentType: string } },
  deps?: FileDeps,
): Promise<{ ok: true; signedAt: string; signatureFileId: string } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    if (lease.signedAt) return fail("ALREADY_SIGNED", "สัญญานี้ลงชื่อแล้ว");
    if (lease.status !== "DRAFT") return fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — ลงชื่อไม่ได้");
    const snap = snapOf(lease.policySnapshot);
    const ap = await approvalGate(g.tenantId, snap);
    if (ap) return ap;
    const threat = contractThreat(snap);
    if (threat) return threat;
    let method: "ON_SCREEN" | "PAPER";
    if (input.method === "ON_SCREEN" || input.method === "PAPER") method = input.method;
    else if (input.method !== undefined && input.method !== null) return fail("INVALID_INPUT", "วิธีลงชื่อไม่ถูกต้อง");
    else {
      const fromSnap = snapValue(snap, "rooms.lease.signMethod");
      const v = fromSnap !== undefined ? fromSnap : (await resolveSettings({ tenantId: g.tenantId }, ["rooms.lease.signMethod"], { unitId: g.unitId }))["rooms.lease.signMethod"]?.value;
      method = v === "PAPER" ? "PAPER" : "ON_SCREEN";
    }
    const file = fileOf(input.file, SIGN_TYPES[method]);
    if (!file)
      return fail("INVALID_FILE", method === "ON_SCREEN" ? "ลายเซ็นต้องเป็นรูป PNG หรือ JPEG ขนาดไม่เกิน 10 MB" : "สัญญาที่ลงชื่อแล้วต้องเป็น PDF, PNG หรือ JPEG ขนาดไม่เกิน 10 MB");

    // K5: อัปไฟล์ก่อนเปิด tx (ไม่ถือ tx/ล็อกระหว่างส่งไฟล์) → tx สั้น: ล็อกสัญญา → ตรวจซ้ำ → signedAt (ใต้ signedAt IS NULL) + event + audit
    //     แพ้แข่ง/ปฏิเสธ ⇒ ลบไฟล์ที่เพิ่งอัป (best-effort) · คนที่เห็นว่าลงชื่อแล้วตั้งแต่ก่อนอัป ไม่อัปเลย
    const uploaded = await putPrivate(g.tenantId, file, `lease-signature-${method === "PAPER" ? "paper" : "screen"}`, deps);
    if (!uploaded) return fail("UPLOAD_FAILED", "อัปโหลดไฟล์ลายเซ็นไม่สำเร็จ — ลองใหม่อีกครั้ง");
    try {
      const out = await runTx(g.tenantId, g.unitId, async (tx) => {
        await advisoryLock(tx, leaseLockKey(lease.id));
        const cur = await tx.dormLease.findFirst({ where: { id: lease.id }, select: { status: true, signedAt: true } });
        if (!cur) throw new Abort(notFound());
        if (cur.signedAt) throw new Abort(fail("ALREADY_SIGNED", "สัญญานี้ลงชื่อแล้ว"));
        if (cur.status !== "DRAFT") throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — ลงชื่อไม่ได้"));
        const signedAt = new Date();
        const upd = await tx.dormLease.updateMany({ where: { id: lease.id, status: "DRAFT", signedAt: null }, data: { signedAt, signatureFileId: uploaded } });
        if (upd.count !== 1) throw new Abort(fail("ALREADY_SIGNED", "สัญญานี้ลงชื่อแล้ว"));
        await emitOutbox(tx, {
          tenantId: g.tenantId,
          unitId: g.unitId,
          type: EVENT_SIGNED,
          idempotencyKey: `${EVENT_SIGNED}:${lease.id}`,
          payload: { unitId: g.unitId, leaseId: lease.id, roomId: lease.roomId },
        });
        await tx.auditLog.create({
          data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.signed", targetType: "DormLease", targetId: lease.id, after: { method, signatureFileId: uploaded } },
        });
        return { signedAt, signatureFileId: uploaded };
      });
      if ("ok" in out) {
        await dropFiles(g.tenantId, [uploaded], deps);
        return out;
      }
      return { ok: true, signedAt: out.signedAt.toISOString(), signatureFileId: out.signatureFileId };
    } catch (e) {
      await dropFiles(g.tenantId, [uploaded], deps);
      throw e;
    }
  } catch (e) {
    await logFail("sign", tenantIdForLog, e);
    return unavailable();
  }
}

// ═════════════════════════ ไฟล์วันเข้า · ลิงก์ส่วนตัว (§3.6) ═════════════════════════
export async function addLeaseFiles(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string; kind: FileKindTh; files: { data: Uint8Array; contentType: string; filename?: string }[] },
  deps?: FileDeps,
): Promise<{ ok: true; added: { fileId: string; kind: string }[]; counts: { ROOM_PHOTO: number; ID_CARD: number; DOCUMENT: number } } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    if (lease.status === "CANCELLED" || lease.status === "ENDED") return fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — แนบไฟล์เพิ่มไม่ได้");
    const kind = input.kind;
    if (kind !== "ROOM_PHOTO" && kind !== "ID_CARD" && kind !== "DOCUMENT") return fail("INVALID_INPUT", "ชนิดเอกสารไม่ถูกต้อง");
    if (!Array.isArray(input.files) || input.files.length === 0) return fail("INVALID_INPUT", "เลือกไฟล์อย่างน้อย 1 ไฟล์");
    if (input.files.length > MAX_FILES_PER_CALL) return fail("TOO_MANY", `แนบได้ครั้งละไม่เกิน ${MAX_FILES_PER_CALL} ไฟล์`);
    const allowed = kind === "ROOM_PHOTO" ? PHOTO_TYPES : DOC_TYPES;
    const files: InFile[] = [];
    for (const f of input.files) {
      const ok = fileOf(f, allowed);
      if (!ok) return fail("INVALID_FILE", kind === "ROOM_PHOTO" ? "รูปห้องต้องเป็น JPEG/PNG/WEBP/HEIC ขนาดไม่เกิน 10 MB ต่อไฟล์ — ไม่ได้แนบไฟล์ใดเลย" : "เอกสารต้องเป็นรูป (JPEG/PNG/WEBP/HEIC) หรือ PDF ขนาดไม่เกิน 10 MB ต่อไฟล์ — ไม่ได้แนบไฟล์ใดเลย");
      files.push(ok);
    }
    if (photosOf(lease.moveInPhotos).length + files.length > MAX_FILES_PER_LEASE) return fail("TOO_MANY", `เอกสารวันเข้าต่อสัญญาได้ไม่เกิน ${MAX_FILES_PER_LEASE} ไฟล์`);

    // K5: อัปทุกไฟล์ก่อนเปิด tx → tx สั้น: ล็อกสัญญา → ตรวจสถานะ/เพดาน 60 → ต่อท้าย moveInPhotos · ล้ม/แพ้ ⇒ ลบไฟล์ที่อัปทั้งชุด (best-effort)
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const id = await putPrivate(g.tenantId, files[i], `lease-${kind.toLowerCase().replace("_", "-")}-${i + 1}`, deps);
        if (!id) {
          await dropFiles(g.tenantId, uploaded, deps);
          return fail("UPLOAD_FAILED", "อัปโหลดไฟล์ไม่สำเร็จ — ไม่ได้แนบไฟล์ใดเลย ลองใหม่อีกครั้ง");
        }
        uploaded.push(id);
      }
      const out = await runTx(g.tenantId, g.unitId, async (tx) => {
        await advisoryLock(tx, leaseLockKey(lease.id));
        const cur = await tx.dormLease.findFirst({ where: { id: lease.id }, select: { status: true, moveInPhotos: true } });
        if (!cur) throw new Abort(notFound());
        if (cur.status === "CANCELLED" || cur.status === "ENDED") throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — แนบไฟล์เพิ่มไม่ได้"));
        const list = photosOf(cur.moveInPhotos);
        if (list.length + uploaded.length > MAX_FILES_PER_LEASE) throw new Abort(fail("TOO_MANY", `เอกสารวันเข้าต่อสัญญาได้ไม่เกิน ${MAX_FILES_PER_LEASE} ไฟล์`));
        const at = new Date().toISOString();
        const added: PhotoEntry[] = uploaded.map((fileId) => ({ fileId, kind, at }));
        const next = [...list, ...added];
        await tx.dormLease.updateMany({ where: { id: lease.id }, data: { moveInPhotos: next as unknown as Prisma.InputJsonValue } });
        return { added, next };
      });
      if ("ok" in out) {
        await dropFiles(g.tenantId, uploaded, deps);
        return out;
      }
      const counts = { ROOM_PHOTO: 0, ID_CARD: 0, DOCUMENT: 0 };
      for (const p of out.next) counts[p.kind]++;
      return { ok: true, added: out.added.map((a) => ({ fileId: a.fileId, kind: a.kind })), counts };
    } catch (e) {
      await dropFiles(g.tenantId, uploaded, deps);
      throw e;
    }
  } catch (e) {
    await logFail("files", tenantIdForLog, e);
    return unavailable();
  }
}

export async function leaseFileLinks(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string },
): Promise<{ ok: true; files: { fileId: string; kind: "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT" | "SIGNATURE"; contentType: string; url: string; at: string }[] } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    const list: { fileId: string; kind: "ROOM_PHOTO" | "ID_CARD" | "DOCUMENT" | "SIGNATURE"; at: string }[] = photosOf(lease.moveInPhotos);
    if (lease.signatureFileId) list.push({ fileId: lease.signatureFileId, kind: "SIGNATURE", at: lease.signedAt ? lease.signedAt.toISOString() : "" });
    const assets = list.length
      ? await tenantDb({ tenantId: g.tenantId }).fileAsset.findMany({ where: { id: { in: list.map((f) => f.fileId) } }, select: { id: true, contentType: true } })
      : [];
    const ct = new Map(assets.map((a) => [a.id, a.contentType]));
    const viewer = { kind: "STAFF" as const, id: g.actorUserId };
    const files = list
      .filter((f) => ct.has(f.fileId))
      .map((f) => ({ fileId: f.fileId, kind: f.kind, contentType: ct.get(f.fileId) ?? "", url: privateFileUrl(f.fileId, viewer), at: f.at }));
    return { ok: true, files };
  } catch (e) {
    await logFail("links", tenantIdForLog, e);
    return unavailable();
  }
}

// ═════════════════════════ อ่าน (§3.7) ═════════════════════════
type RoomBrief = { number: string; typeName: string | null };
async function roomsOf(g: Gate, ids: string[]): Promise<Map<string, RoomBrief>> {
  if (!ids.length) return new Map();
  const rows = await scoped(g.tenantId, g.unitId).hotelRoom.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, number: true, roomType: { select: { name: true } } } });
  return new Map(rows.map((r) => [r.id, { number: r.number, typeName: r.roomType?.name ?? null }]));
}
async function partiesOf(tenantId: string, ids: string[]): Promise<Map<string, { name: string; phoneNorm: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await tenantDb({ tenantId }).party.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, phoneNorm: true } });
  return new Map(rows.map((r) => [r.id, { name: r.name, phoneNorm: r.phoneNorm }]));
}
const monthsOf = (start: string, end: string): number => {
  // นับเดือนจากช่วงวัน (start..end รวม) — สัญญามีกำหนดของใบนี้ end = start + n เดือน − 1 วัน
  const s = parseYmd(start);
  const e = parseYmd(addDaysYmd(end, 1));
  if (!s || !e) return 0;
  return (e.y - s.y) * 12 + (e.m - s.m) + (e.d >= s.d || e.d === daysInMonth(e.y, e.m) ? 0 : -1);
};

export async function getLease(ctx: LeaseCtx, input: { unitId: string; leaseId: string }): Promise<LeaseDetail | null> {
  if (!isRec(input)) return null;
  const g = await gate(ctx, input.unitId, "view");
  if (!g) return null;
  const lease = await readLease(g, input.leaseId);
  if (!lease) return null;
  const room = (await roomsOf(g, [lease.roomId])).get(lease.roomId);
  const party = (await partiesOf(g.tenantId, [lease.partyId])).get(lease.partyId);
  const snap = snapOf(lease.policySnapshot);
  const files = { ROOM_PHOTO: 0, ID_CARD: 0, DOCUMENT: 0, SIGNATURE: lease.signatureFileId ? 1 : 0 };
  for (const p of photosOf(lease.moveInPhotos)) files[p.kind]++;
  const co = coTenantsOf(lease.coTenants);
  const sl = snapLegal(snap);
  const blocked = contractThreat(snap) !== null;
  const heldSatang = await securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id });
  const receipts = (await securityDepositReceipts({ tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id })).map((r) => ({ entryId: r.entryId, entryNo: r.entryNo, amountSatang: r.amountSatang, date: r.date }));
  const start = ymdOfDb(lease.startDate);
  const end = ymdOfDb(lease.endDate);
  return {
    leaseId: lease.id,
    unitId: lease.unitId,
    roomId: lease.roomId,
    roomNumber: room?.number ?? "",
    roomTypeName: room?.typeName ?? null,
    status: lease.status,
    partyId: lease.partyId,
    tenantName: party?.name ?? "",
    phoneMasked: maskPhone(party?.phoneNorm),
    startDate: start,
    endDate: end,
    months: monthsOf(start, end),
    rentSatang: lease.rentSatang,
    commonFeeSatang: lease.commonFeeSatang,
    depositSatang: lease.depositSatang,
    advanceRentSatang: lease.advanceRentSatang,
    bookingFeeSatang: lease.bookingFeeSatang,
    occupants: co.occupants.map((o) => ({ name: o.name, phoneMasked: maskPhone(o.phone) })),
    vehicles: co.vehicles.map((v) => ({ plate: v.plate, kind: v.kind, note: v.note })),
    signedAt: lease.signedAt ? lease.signedAt.toISOString() : null,
    files,
    moveInPhotosMin: photosMinOf(snap),
    heldSatang,
    receipts,
    legal: { ...sl, approvalStatus: await approvalStatusOf(g.tenantId, sl.approvalId) },
    // K9: ข้อความสัญญาที่มีคำต้องห้าม (เช่นถูกแก้ในฐาน) ห้ามออกทาง DTO — ตัด textTh ออก + legalBlocked
    legalBlocked: blocked,
    policySnapshot: blocked ? omitContractText(snap) : lease.policySnapshot,
  };
}

const TABS: LeaseTab[] = ["CURRENT", "BOOKED", "EXPIRING", "NOTICE", "ENDED"];
const emptyCounts = (): Record<LeaseTab, number> => ({ CURRENT: 0, BOOKED: 0, EXPIRING: 0, NOTICE: 0, ENDED: 0 });
function inTab(tab: LeaseTab, status: string, daysToEnd: number): boolean {
  switch (tab) {
    case "CURRENT":
      return status === "ACTIVE" || status === "NOTICE";
    case "BOOKED":
      return status === "DRAFT";
    case "EXPIRING":
      return status === "ACTIVE" && daysToEnd >= 0 && daysToEnd <= 60;
    case "NOTICE":
      return status === "NOTICE";
    case "ENDED":
      return status === "ENDED";
  }
}

export async function listLeases(ctx: LeaseCtx, input: { unitId: string; tab?: LeaseTab; q?: string | null }): Promise<LeaseList> {
  const empty: LeaseList = { rows: [], counts: emptyCounts(), heldTotalSatang: 0 };
  if (!isRec(input)) return empty;
  const g = await gate(ctx, input.unitId, "view");
  if (!g) return empty;
  const tab: LeaseTab = TABS.includes(input.tab as LeaseTab) ? (input.tab as LeaseTab) : "CURRENT";
  const leasesAll = scoped(g.tenantId, g.unitId).dormLease.findMany({
    where: { status: { in: ["DRAFT", "ACTIVE", "NOTICE", "ENDED"] } },
    select: LEASE_SELECT,
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  // D.13 ▸ เฉพาะห้องในขอบเขตอาคาร (แถว + counts + ยอดถือ) · ยอดถือ (GL) อ่านคำสั่งเดียวนอกวน (หนี้ N+1 ของ D.5) ◂
  const leases = (await leasesAll).filter((l) => roomVisible(g, l.roomId));
  const today = bkkYmd(new Date());
  const shownOf = (l: (typeof leases)[number]) => inTab(tab, l.status, ymdOfDb(l.endDate) ? daysBetween(today, ymdOfDb(l.endDate)) : 0);
  const heldOf = await securityDepositHeldMany({ tenantId: g.tenantId, unitId: g.unitId, leaseIds: leases.filter((l) => l.status !== "ENDED" || shownOf(l)).map((l) => l.id) });
  const rooms = await roomsOf(g, leases.map((l) => l.roomId));
  const parties = await partiesOf(g.tenantId, leases.map((l) => l.partyId));
  const counts = emptyCounts();
  let heldTotalSatang = 0;
  const q = typeof input.q === "string" ? input.q.trim().toLowerCase() : "";
  const qDigits = q.replace(/\D/g, "");
  const qIsNumber = q.length > 0 && /^[\d\s+()-]+$/.test(q);
  const qPhone = qIsNumber ? normalizePartyPhone(q) || qDigits : "";
  const rows: LeaseRow[] = [];
  for (const l of leases) {
    const start = ymdOfDb(l.startDate);
    const end = ymdOfDb(l.endDate);
    const daysToEnd = end ? daysBetween(today, end) : 0;
    for (const t of TABS) if (inTab(t, l.status, daysToEnd)) counts[t]++;
    // ยอดถือ (GL) — DRAFT/ACTIVE/NOTICE ทุกแถว (รวมทั้งตึกที่เห็น) · ENDED เฉพาะเมื่อแสดง · อ่านมาแล้วคำสั่งเดียว (heldOf)
    const live = l.status !== "ENDED";
    const shown = inTab(tab, l.status, daysToEnd);
    const held = live || shown ? (heldOf[l.id] ?? 0) : 0;
    if (live) heldTotalSatang += held;
    if (!shown) continue;
    const room = rooms.get(l.roomId);
    const party = parties.get(l.partyId);
    if (q) {
      const byRoom = (room?.number ?? "").toLowerCase().includes(q);
      const byName = !qIsNumber && (party?.name ?? "").toLowerCase().includes(q);
      const byPhone = qIsNumber && qPhone.length >= 4 && (party?.phoneNorm ?? "").includes(qPhone);
      if (!byRoom && !byName && !byPhone) continue;
    }
    rows.push({
      leaseId: l.id,
      roomId: l.roomId,
      roomNumber: room?.number ?? "",
      roomTypeName: room?.typeName ?? null,
      status: l.status,
      tenantName: party?.name ?? "",
      occupantCount: 1 + coTenantsOf(l.coTenants).occupants.length,
      startDate: start,
      endDate: end,
      months: monthsOf(start, end),
      rentSatang: l.rentSatang,
      depositSatang: l.depositSatang,
      heldSatang: held,
      daysToEnd,
    });
  }
  rows.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "th", { numeric: true }) || a.startDate.localeCompare(b.startDate));
  return { rows, counts, heldTotalSatang };
}

export async function leaseContract(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string },
): Promise<{ ok: true; leaseNo: string; textTh: string; clauses: Clause[] } | Fail> {
  if (!isRec(input)) return notFound();
  const g = await gate(ctx, input.unitId, "view");
  if (!g) return notFound();
  const lease = await readLease(g, input.leaseId);
  if (!lease) return notFound();
  const snap = snapOf(lease.policySnapshot);
  const c = snap && isRec(snap.contract) ? snap.contract : null;
  if (!c || typeof c.textTh !== "string" || !Array.isArray(c.clauses)) return fail("NO_CONTRACT", "สัญญานี้ไม่มีข้อความสัญญาที่บันทึกไว้ (นำเข้าจากระบบเดิม) — แนบสัญญากระดาษแทน");
  const threat = contractThreat(snap);
  if (threat) return threat;
  const clauses: Clause[] = [];
  for (const x of c.clauses)
    if (isRec(x) && typeof x.id === "string" && typeof x.textTh === "string")
      clauses.push({ id: x.id, titleTh: typeof x.titleTh === "string" ? x.titleTh : null, textTh: x.textTh, mandatory: x.mandatory === true });
  return { ok: true, leaseNo: leaseNoOf(lease.id), textTh: c.textTh, clauses };
}

// ═════════════════════════ อื่น (§3.8) ═════════════════════════
export async function cancelLease(ctx: LeaseCtx, input: { unitId: string; leaseId: string; reason: string }): Promise<{ ok: true } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    if (lease.status !== "DRAFT") return fail("NOT_EDITABLE", "ยกเลิกได้เฉพาะสัญญาที่ยังไม่เข้าอยู่ (สัญญาที่เข้าอยู่แล้วใช้ขั้นตอนย้ายออก)");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if ([...reason].length < 3) return fail("INVALID_INPUT", "ระบุเหตุผลที่ยกเลิกสัญญา (อย่างน้อย 3 ตัวอักษร)");
    // K1: tx เดียว — ① ล็อกสัญญา (ตัวเดียวกับทางเงิน) → ยอดถืออ่านผ่าน tx เดียวกัน → CANCELLED + ปล่อยห้อง + audit
    const out = await moneyTx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(lease.id));
      const held = await securityDepositHeldInTx(tx, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id });
      if (held > 0) throw new Abort(fail("DEPOSIT_HELD", `สัญญานี้มีเงินจอง/เงินประกันถือไว้ ฿${(held / 100).toLocaleString("en-US")} — คืนหรือริบเงินก่อน แล้วจึงยกเลิกสัญญา`));
      const upd = await tx.dormLease.updateMany({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId, status: "DRAFT" }, data: { status: "CANCELLED", endReason: reason.slice(0, 500) } });
      if (upd.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้เปลี่ยนสถานะไปแล้ว — โหลดหน้าใหม่"));
      if (lease.occupancyId) {
        const r = await releaseOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: lease.occupancyId, reason: "dorm.lease.cancelled" });
        if (!r.ok && r.code !== "NOT_FOUND") throw new Error("ปล่อยห้องไม่สำเร็จ");
      }
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.cancelled", targetType: "DormLease", targetId: lease.id, after: { reason } },
      });
      return { done: true };
    });
    if ("ok" in out) return out;
    return { ok: true };
  } catch (e) {
    await logFail("cancel", tenantIdForLog, e);
    return unavailable();
  }
}

export async function updateLeaseOccupants(
  ctx: LeaseCtx,
  input: { unitId: string; leaseId: string; occupants: { name: string; phone?: string | null }[]; vehicles: { plate: string; kind: VehicleKind; note?: string | null }[] },
): Promise<{ ok: true } | Fail> {
  const tenantIdForLog = isRec(ctx) && typeof ctx.tenantId === "string" ? ctx.tenantId : "";
  try {
    if (!isRec(input)) return notFound();
    const g = await gate(ctx, input.unitId, "manage");
    if (!g) return notFound();
    const lease = await readLease(g, input.leaseId);
    if (!lease) return notFound();
    if (lease.status !== "DRAFT" && lease.status !== "ACTIVE" && lease.status !== "NOTICE") return fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — แก้ผู้พักร่วมไม่ได้");
    const co = parseCoTenants(input.occupants, input.vehicles);
    if (!co) return fail("INVALID_INPUT", `ผู้พักร่วมและรถต่อสัญญาได้ไม่เกิน ${MAX_PEOPLE} รายการ และต้องกรอกชื่อ/ทะเบียนให้ครบ`);
    const out = await runTx(g.tenantId, g.unitId, async (tx) => {
      const upd = await tx.dormLease.updateMany({ where: { id: lease.id, status: { in: ["DRAFT", "ACTIVE", "NOTICE"] } }, data: { coTenants: co as unknown as Prisma.InputJsonValue } });
      if (upd.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ยกเลิกหรือสิ้นสุดแล้ว — แก้ผู้พักร่วมไม่ได้"));
      await tx.auditLog.create({
        data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.occupants_updated", targetType: "DormLease", targetId: lease.id, after: { occupants: co.occupants.length, vehicles: co.vehicles.length } },
      });
      return { done: true };
    });
    if ("ok" in out) return out;
    return { ok: true };
  } catch (e) {
    await logFail("occupants", tenantIdForLog, e);
    return unavailable();
  }
}

// ── SVC D.4 (X12) ▸ ตัวตรวจอ่านอย่างเดียว: ชื่อผู้เช่าที่ทำให้ข้อความสัญญา (แม่แบบ + ข้อบังคับ + ข้อเพิ่มของหน่วย) มีคำต้องห้ามคร่อมขอบชื่อ ──
//   ตรรกะเดียวกับ createLease (renderContract + forbiddenOutsideName) · ไม่เขียนอะไร · ใช้ connection ของตัวเอง (ห้ามเรียกระหว่างถือ tx)
//   คืนเซตชื่อที่ไม่ผ่าน · แม่แบบ/ข้อเพิ่มของหน่วยผิดเอง ⇒ ทุกชื่อไม่ผ่าน (createLease จะปฏิเสธเหมือนกัน)
export async function leaseContractNameProblems(tenantId: string, unitId: string, names: string[]): Promise<Set<string>> {
  const bad = new Set<string>();
  const uniq = [...new Set(names.filter((n) => typeof n === "string" && n.trim()))];
  if (!uniq.length) return bad;
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { name: true } });
  if (!unit) return bad;
  const snap: PolicySnapshot = await snapshotPolicy({ tenantId }, "lease", { unitId });
  const sv = (k: string) => (Object.prototype.hasOwnProperty.call(snap.values, k) ? snap.values[k] : undefined);
  const extras = extraClausesOf(sv("rooms.lease.extraClauses"));
  const tplValue = sv("rooms.lease.contractTemplate");
  if (!extras || !templateVarsOk(tplValue)) {
    for (const n of uniq) bad.add(n);
    return bad;
  }
  const clauses: Clause[] = [...MANDATORY_CLAUSES.map((m) => ({ id: m.id, titleTh: m.titleTh, textTh: m.textTh, mandatory: true })), ...extras];
  const tpl = templateText(tplValue);
  const today = bkkYmd(new Date());
  for (const name of uniq) {
    const text = renderContract(tpl, clauses, {
      leaseNo: "L00000000",
      unitName: unit.name,
      signDate: thaiDateLong(today),
      landlordName: unit.name,
      tenantName: name,
      roomNo: "000",
      startDate: thaiDateLong(today),
      endDate: thaiDateLong(today),
      rent: bahtText(100000),
    });
    if (forbiddenOutsideName(text, name)) bad.add(name);
  }
  return bad;
}
