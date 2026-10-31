// SVC D.17 ▸ ประกาศถึงผู้เช่า + อ่านแล้ว — สัญญา ledger/svc-briefs/svc-brief-d.17.md §3.0–§3.2 (ชื่อภายในเลือกเอง)
//   • ฝั่งพนักงาน: ร่าง · แก้ร่าง · ดูผู้รับ · เผยแพร่ (CAS + event ใน tx เดียว) · สถิติ · โมเดลจอ
//     ด่านตายตัวทุกฟังก์ชัน: หน่วย DORM ของร้าน → Membership สด → evaluate(dorm.announce) → ขอบเขตอาคาร (D.13 #64 · fail closed)
//     ไม่ผ่าน ⇒ NOT_FOUND ผลเดียวกันทุกไบต์ (X1) · model ⇒ null · ไม่เขียนอะไร
//   • ตัวอ่านไม่มีผู้กระทำ (platform/dorm-announce ใช้หลังตรวจ token/event แล้ว): ประกาศสำหรับส่ง · ผู้รับ ณ ตอนนี้ ·
//     ประกาศที่สัญญาเห็น · บันทึกอ่าน (ON CONFLICT DO NOTHING) · งานส่งซ้ำ
//   • ผู้รับคิดสดทุกครั้ง (ไม่เก็บรายชื่อ) = สัญญา live (นิยาม D.9 §3.0) ที่ห้อง active อยู่ในกลุ่ม · จัดกลุ่มด้วย Party ตัวจริง (canonical)
//   • ตัวตรวจคำ สคบ. (findForbiddenTerms) บนหัวเรื่อง/เนื้อหาดิบ + ข้อความที่ render แล้ว — ไม่มีคำต้องห้ามเป็นตัวอักษรในไฟล์นี้
//   • tenantDb เท่านั้น (F5.1) · ไม่เปิด connection ที่สองระหว่างถือ tx · 40P01 ⇒ ลองใหม่ 1 ครั้ง แล้วคืน BUSY
//   • ไม่คืน/ไม่ log ชื่อ เบอร์ ของผู้เช่า · audit/event มีแต่ id + kind
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { evaluate } from "@/lib/core/rbac";
import { getDef, renderTemplate, resolveSettings } from "@/lib/core/settings";
import { findForbiddenTerms } from "@/lib/core/settings/legal/th-rental-2568";
import { thDateOf } from "./latefee";
import { portalCanonicalParty } from "./portal";
import { dormLiveMember, dormScopeFor, dormUnitOf, dormVisibleRoomIds, type DormBuildingScope } from "./scope";

type Tx = Prisma.TransactionClient;

// ───────────────────────── ชนิดร่วม (§3.1) ─────────────────────────
export type AnnounceAudience =
  | { kind: "ALL" }
  | { kind: "BUILDING"; buildingIds: string[] }
  | { kind: "FLOOR"; floors: { buildingId: string; floorNo: number }[] }
  | { kind: "ROOM"; roomIds: string[] };
export type AnnounceCtx = { tenantId: string; actorUserId: string };
/** BUSY = ฐานข้อมูลชนกัน (40P01) หลังลองใหม่ 1 ครั้ง — เพิ่มจากสัญญา §3.1 (กติกาผู้คุม: 40P01 ⇒ BUSY) */
export type AnnounceFail = { ok: false; code: "NOT_FOUND" | "BAD_INPUT" | "LEGAL_BLOCK" | "BAD_STATE" | "BUSY"; reason: string; terms?: string[] };
export type AnnounceStats = { recipients: number; sent: number; waiting: number; noLine: number; reads: number };
export type DormAnnouncementRow = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  audience: AnnounceAudience;
  audienceLabelTh: string;
  publishedAt: string | null;
  stats: AnnounceStats;
};
export type DormAnnounceModel = {
  unitId: string;
  unitName: string;
  basePath: string;
  canAll: boolean;
  options: {
    buildings: { id: string; name: string }[];
    floors: { buildingId: string; buildingName: string; floorNo: number }[];
    rooms: { id: string; number: string; buildingId: string | null; floorNo: number | null }[];
  };
  items: DormAnnouncementRow[];
};

// ───────────────────────── ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน) ─────────────────────────
const TITLE_MAX = 120;
const BODY_MAX = 2000;
const TARGETS_MAX = 500;
const FLOOR_MAX = 200;
const MODEL_ITEMS_MAX = 100;
const PORTAL_SCAN_MAX = 200;
const DAY_MS = 86_400_000;
const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const EVENT = "dorm.announcement.published";
const LOG_PREFIX = "rooms:announcement:";
const TPL_KEY = "rooms.msg.announcement";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KINDS = new Set(["ALL", "BUILDING", "FLOOR", "ROOM"]);

const NOT_FOUND_REASON = "ไม่พบหอ ประกาศ หรือกลุ่มผู้รับนี้ หรือบัญชีนี้ไม่มีสิทธิ์จัดการประกาศ";
const LEGAL_REASON =
  "ประกาศมีถ้อยคำที่ห้ามใช้ตามประกาศ สคบ. เรื่องธุรกิจให้เช่าที่อยู่อาศัย — แก้ถ้อยคำก่อนบันทึก (เช่น งานซ่อมบำรุงใช้คำว่า \"ไฟฟ้าดับชั่วคราว\" หรือ \"น้ำไม่ไหลชั่วคราว\")";
const SCOPE_ALL_REASON = "เลือกอาคาร ชั้น หรือห้องที่คุณดูแล";
const PUBLISHED_REASON = "ประกาศนี้ส่งแล้ว แก้ไขไม่ได้ — สร้างประกาศใหม่แทน";
const BUSY_REASON = "ระบบกำลังบันทึกประกาศนี้อยู่ — รอสักครู่แล้วลองใหม่";
const TEMPLATE_WARN =
  "แม่แบบข้อความประกาศของหอมีถ้อยคำที่ห้ามใช้ตามประกาศ สคบ. — ประกาศแสดงในหน้าผู้เช่าแล้ว แต่ยังไม่ส่งทาง LINE จนกว่าจะแก้แม่แบบ \"ข้อความประกาศ\" ในหน้าตั้งค่าข้อความของหอ แล้วกดส่งซ้ำ";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const numCmp = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });
const fail = (code: AnnounceFail["code"], reason: string): AnnounceFail => ({ ok: false, code, reason });
/** NOT_FOUND ข้อความเดียวทั้งไฟล์ (และทั้งใบ — platform/dorm-announce คืนวัตถุจากตัวนี้) */
export const announceNotFound = (): { ok: false; code: "NOT_FOUND"; reason: string } => ({ ok: false, code: "NOT_FOUND", reason: NOT_FOUND_REASON });
const BAD = (reason: string): AnnounceFail => fail("BAD_INPUT", reason);
const ZERO = (recipients: number): AnnounceStats => ({ recipients, sent: 0, waiting: 0, noLine: 0, reads: 0 });

// ───────────────────────── ด่าน (ลำดับตายตัว) ─────────────────────────
type Gate = {
  tenantId: string;
  unitId: string;
  unitName: string;
  unitSlug: string;
  actorUserId: string;
  scope: DormBuildingScope;
  /** ห้องที่ผู้กระทำเห็น · null = ทั้งหน่วย */
  visible: Set<string> | null;
};

async function gate(ctx: unknown, unitId: unknown): Promise<Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId) || !ID_RE.test(unitId)) return null;
  const tenantId = ctx.tenantId;
  const unit = await dormUnitOf(tenantId, unitId);
  if (!unit) return null;
  const mem = await dormLiveMember(tenantId, ctx.actorUserId);
  if (!mem) return null;
  if (!evaluate(mem.ctx, { module: "dorm", action: "dorm.announce", unitId: unit.id })) return null;
  const scope = await dormScopeFor(tenantId, unit.id, mem);
  const visible = await dormVisibleRoomIds(tenantId, unit.id, scope);
  return { tenantId, unitId: unit.id, unitName: unit.name, unitSlug: unit.slug, actorUserId: ctx.actorUserId, scope, visible };
}

// ───────────────────────── กลุ่มเป้าหมาย ─────────────────────────
type RoomRec = { id: string; number: string; buildingId: string | null; floorNo: number | null; active: boolean };
type BuildingRec = { id: string; name: string; sortOrder: number };
type UnitPlan = { rooms: RoomRec[]; buildings: BuildingRec[] };

async function unitPlan(tenantId: string, unitId: string): Promise<UnitPlan> {
  const db = tenantDb({ tenantId, unitId });
  const [rooms, buildings] = await Promise.all([
    db.hotelRoom.findMany({ select: { id: true, number: true, buildingId: true, floorNo: true, active: true }, take: 5000 }),
    db.roomBuilding.findMany({ select: { id: true, name: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 500 }),
  ]);
  rooms.sort((a, b) => numCmp(a.number, b.number) || (a.id < b.id ? -1 : 1));
  return { rooms, buildings };
}

const floorKey = (f: { buildingId: string; floorNo: number }) => `${f.buildingId}:${f.floorNo}`;

/** รูปข้อมูลกลุ่ม (ไม่แตะฐาน) — ไม่ซ้ำ เรียง · ผิด ⇒ ข้อความไทย */
function parseAudience(v: unknown): { ok: true; aud: AnnounceAudience } | { ok: false; reason: string } {
  if (!isRec(v) || typeof v.kind !== "string" || !KINDS.has(v.kind)) return { ok: false, reason: "เลือกกลุ่มผู้รับ: ทั้งหอ อาคาร ชั้น หรือห้อง" };
  if (v.kind === "ALL") return { ok: true, aud: { kind: "ALL" } };
  const list = v.kind === "BUILDING" ? v.buildingIds : v.kind === "ROOM" ? v.roomIds : v.floors;
  if (!Array.isArray(list) || list.length < 1) return { ok: false, reason: "เลือกอาคาร ชั้น หรือห้องที่จะส่งประกาศอย่างน้อย 1 รายการ" };
  if (list.length > TARGETS_MAX) return { ok: false, reason: `เลือกได้ไม่เกิน ${TARGETS_MAX} รายการต่อประกาศ` };
  if (v.kind === "FLOOR") {
    const seen = new Map<string, { buildingId: string; floorNo: number }>();
    for (const f of list) {
      if (!isRec(f) || typeof f.buildingId !== "string" || !f.buildingId || f.buildingId.length > 100) return { ok: false, reason: "ข้อมูลชั้นไม่ถูกต้อง" };
      if (typeof f.floorNo !== "number" || !Number.isInteger(f.floorNo) || f.floorNo < 0 || f.floorNo > FLOOR_MAX) return { ok: false, reason: `เลขชั้นต้องเป็นจำนวนเต็ม 0–${FLOOR_MAX}` };
      const x = { buildingId: f.buildingId, floorNo: f.floorNo };
      seen.set(floorKey(x), x);
    }
    const floors = [...seen.values()].sort((a, b) => (a.buildingId < b.buildingId ? -1 : a.buildingId > b.buildingId ? 1 : a.floorNo - b.floorNo));
    return { ok: true, aud: { kind: "FLOOR", floors } };
  }
  if (!list.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100)) return { ok: false, reason: "ข้อมูลอาคารหรือห้องไม่ถูกต้อง" };
  const ids = [...new Set(list as string[])].sort();
  return { ok: true, aud: v.kind === "BUILDING" ? { kind: "BUILDING", buildingIds: ids } : { kind: "ROOM", roomIds: ids } };
}

/** แถวในฐาน ⇒ กลุ่ม (แถวเพี้ยน ⇒ กลุ่มว่างที่ไม่ตรงห้องใด — fail closed) */
function audienceOfRow(audience: string, ids: Prisma.JsonValue | null): AnnounceAudience {
  if (audience === "ALL") return { kind: "ALL" };
  const p = parseAudience(
    audience === "BUILDING" ? { kind: audience, buildingIds: ids } : audience === "ROOM" ? { kind: audience, roomIds: ids } : { kind: audience, floors: ids },
  );
  if (p.ok) return p.aud;
  return { kind: "ROOM", roomIds: [] };
}
const idsOfAudience = (a: AnnounceAudience): Prisma.InputJsonValue | undefined =>
  a.kind === "ALL" ? undefined : a.kind === "BUILDING" ? a.buildingIds : a.kind === "ROOM" ? a.roomIds : a.floors.map((f) => ({ buildingId: f.buildingId, floorNo: f.floorNo }));

/** ห้องนี้อยู่ในกลุ่มไหม (นิยามบน · ณ ปัจจุบัน) */
function roomInAudience(a: AnnounceAudience, r: { id: string; buildingId: string | null; floorNo: number | null }): boolean {
  if (a.kind === "ALL") return true;
  if (a.kind === "ROOM") return a.roomIds.includes(r.id);
  if (a.kind === "BUILDING") return !!r.buildingId && a.buildingIds.includes(r.buildingId);
  return !!r.buildingId && r.floorNo !== null && a.floors.some((f) => f.buildingId === r.buildingId && f.floorNo === r.floorNo);
}

/** id เป้าหมายเป็นของหน่วยนี้ + อยู่ในขอบเขตของผู้กระทำ */
function targetsOk(a: AnnounceAudience, plan: UnitPlan, g: Gate): boolean {
  const bIds = new Set(plan.buildings.map((b) => b.id));
  const rIds = new Set(plan.rooms.map((r) => r.id));
  const scopeB = g.scope.all ? null : new Set(g.scope.buildingIds);
  if (a.kind === "ALL") return true;
  if (a.kind === "BUILDING") return a.buildingIds.every((id) => bIds.has(id) && (!scopeB || scopeB.has(id)));
  if (a.kind === "FLOOR") return a.floors.every((f) => bIds.has(f.buildingId) && (!scopeB || scopeB.has(f.buildingId)));
  return a.roomIds.every((id) => rIds.has(id) && (!g.visible || g.visible.has(id)));
}

/** ผู้ถูกจำกัดอาคารเห็นประกาศนี้ไหม — เป้าหมายทั้งหมดต้องอยู่ในขอบเขต (ALL ⇒ ไม่เห็น) */
function actorSees(a: AnnounceAudience, g: Gate): boolean {
  if (g.visible === null) return true;
  if (a.kind === "ALL") return false;
  const scopeB = g.scope.all ? null : new Set(g.scope.buildingIds);
  if (a.kind === "BUILDING") return a.buildingIds.length > 0 && a.buildingIds.every((id) => !!scopeB?.has(id));
  if (a.kind === "FLOOR") return a.floors.length > 0 && a.floors.every((f) => !!scopeB?.has(f.buildingId));
  return a.roomIds.length > 0 && a.roomIds.every((id) => g.visible!.has(id));
}

function audienceLabel(a: AnnounceAudience, plan: UnitPlan): string {
  const bName = (id: string) => plan.buildings.find((b) => b.id === id)?.name ?? "อาคาร";
  if (a.kind === "ALL") return "ทั้งหอ";
  if (a.kind === "BUILDING") return a.buildingIds.map(bName).join(" · ");
  if (a.kind === "FLOOR") return a.floors.map((f) => `${bName(f.buildingId)} ชั้น ${f.floorNo}`).join(" · ");
  const nums = a.roomIds.map((id) => plan.rooms.find((r) => r.id === id)?.number).filter((x): x is string => !!x).sort(numCmp);
  return nums.length ? `ห้อง ${nums.join(", ")}` : "ห้องที่เลือก";
}

// ───────────────────────── ตัวตรวจคำ ─────────────────────────
const uniqSorted = (xs: string[]) => [...new Set(xs)].sort();

/** คำต้องห้ามของหัวเรื่อง/เนื้อหา (ดิบ · ต่อกัน · render ด้วยแม่แบบ th/en) — แม่แบบที่ผิดเองไม่นับที่นี่ (ตอนส่งบล็อกแยก) */
function contentTerms(title: string, body: string, tplValue: unknown, unitName: string): string[] {
  const out = [...findForbiddenTerms(title), ...findForbiddenTerms(body), ...findForbiddenTerms(`${title}\n${body}`)];
  const def = getDef(TPL_KEY);
  if (def && !templateTermsOf(tplValue).length) {
    for (const loc of ["th", "en"]) out.push(...findForbiddenTerms(renderTemplate(def, tplValue, { unitName, title, body }, loc)));
  }
  return uniqSorted(out);
}
/** คำต้องห้ามในตัวแม่แบบเอง (render ด้วยตัวแปรว่าง — แบบ D.11 templateBlocked) */
function templateTermsOf(tplValue: unknown): string[] {
  const def = getDef(TPL_KEY);
  if (!def) return ["template"];
  return uniqSorted(["th", "en"].flatMap((loc) => findForbiddenTerms(renderTemplate(def, tplValue, {}, loc))));
}
async function tplOf(tenantId: string, unitId: string): Promise<unknown> {
  const s = await resolveSettings({ tenantId }, [TPL_KEY], { unitId });
  return s[TPL_KEY]?.value;
}

/** ตอนส่ง: บล็อกไหม (ตัวแม่แบบ · หัวเรื่อง/เนื้อหาดิบ · ข้อความ render th/en) */
export function announceSendBlocked(tplValue: unknown, a: { title: string; body: string; unitName: string }): boolean {
  if (templateTermsOf(tplValue).length) return true;
  return contentTerms(a.title, a.body, tplValue, a.unitName).length > 0;
}

// ───────────────────────── 40P01 ─────────────────────────
function isDeadlock(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "40P01" || o.originalCode === "40P01" || o.code === "P2034") return true;
    if (typeof o.message === "string" && /deadlock|40P01|write conflict/i.test(o.message)) return true;
    cur = o.cause ?? (isRec(o.meta) ? o.meta.driverAdapterError : undefined);
  }
  return false;
}
async function retryOnce<T>(fn: () => Promise<T>): Promise<T | "BUSY"> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isDeadlock(e)) throw e;
    }
  }
  return "BUSY";
}

// ───────────────────────── สัญญา live + ผู้รับ ─────────────────────────
type LiveLeaseRec = { id: string; partyId: string; roomId: string; roomNumber: string; buildingId: string | null; floorNo: number | null; startDate: Date };
const dayOk = (ymd: string) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "9999-12-31");

/** สัญญา live ของหน่วย (นิยาม D.9 §3.0 — คิวรีเดียวกับ portalLiveLease) บนห้อง active */
async function liveLeasesOfUnit(tenantId: string, unitId: string, now: Date): Promise<LiveLeaseRec[]> {
  return tenantDb({ tenantId }).$queryRaw<LiveLeaseRec[]>`
    SELECT l."id", l."partyId", l."roomId", r."number" AS "roomNumber", r."buildingId", r."floorNo", l."startDate"
    FROM "DormLease" l
    JOIN "BusinessUnit" u ON u."id" = l."unitId" AND u."tenantId" = l."tenantId" AND u."type"::text = 'DORM'
    JOIN "HotelRoom" r ON r."id" = l."roomId" AND r."tenantId" = l."tenantId" AND r."unitId" = l."unitId" AND r."active" = true
    WHERE l."tenantId" = ${tenantId} AND l."unitId" = ${unitId} AND l."status" IN ('ACTIVE', 'NOTICE') AND l."endedAt" IS NULL
      AND (l."endDate" IS NULL OR l."endDate" >= ${dayOk(bkkYmd(now))}::date)
    ORDER BY r."number" ASC, l."id" ASC
    LIMIT 5000`;
}

export type AnnounceRecipient = { canonicalPartyId: string; leaseId: string; partyId: string; roomNumber: string };

/** ผู้รับ ณ now: สัญญา live ที่ห้องอยู่ในกลุ่ม ⇒ 1 คนต่อ Party ตัวจริง · สัญญาตัวแทน = ห้องเลขน้อยสุด */
async function recipientsOf(tenantId: string, unitId: string, a: AnnounceAudience, now: Date): Promise<{ rooms: string[]; people: AnnounceRecipient[] }> {
  const leases = (await liveLeasesOfUnit(tenantId, unitId, now)).filter((l) => roomInAudience(a, { id: l.roomId, buildingId: l.buildingId, floorNo: l.floorNo }));
  leases.sort((x, y) => numCmp(x.roomNumber, y.roomNumber) || (x.id < y.id ? -1 : 1));
  const canon = new Map<string, string>();
  for (const pid of new Set(leases.map((l) => l.partyId))) canon.set(pid, await portalCanonicalParty(tenantId, pid));
  const people = new Map<string, AnnounceRecipient>();
  for (const l of leases) {
    const c = canon.get(l.partyId) ?? l.partyId;
    if (!people.has(c)) people.set(c, { canonicalPartyId: c, leaseId: l.id, partyId: l.partyId, roomNumber: l.roomNumber });
  }
  return { rooms: [...new Set(leases.map((l) => l.roomNumber))].sort(numCmp), people: [...people.values()] };
}

// ───────────────────────── สถิติ ─────────────────────────
const SENT = new Set(["SENT"]);
const WAITING = new Set(["SKIPPED_QUIET", "FAILED", "SENDING"]);
const NO_LINE = new Set(["NO_CHANNEL", "SKIPPED_CONSENT", "QUOTA"]);

async function statsMany(tenantId: string, unitId: string, rows: { id: string; audience: AnnounceAudience; publishedAt: Date | null }[], now: Date): Promise<Map<string, AnnounceStats>> {
  const out = new Map<string, AnnounceStats>();
  if (!rows.length) return out;
  const db = tenantDb({ tenantId, unitId });
  const leases = await liveLeasesOfUnit(tenantId, unitId, now);
  const canon = new Map<string, string>();
  for (const pid of new Set(leases.map((l) => l.partyId))) canon.set(pid, await portalCanonicalParty(tenantId, pid));
  const pub = rows.filter((r) => r.publishedAt);
  const logs = pub.length
    ? await db.serviceMessageLog.findMany({ where: { OR: pub.map((r) => ({ dedupeKey: { startsWith: `${LOG_PREFIX}${r.id}:` } })) }, select: { dedupeKey: true, status: true } })
    : [];
  const reads = pub.length
    ? await db.dormAnnouncementRead.groupBy({ by: ["announcementId"], where: { announcementId: { in: pub.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  for (const r of rows) {
    const people = new Set(
      leases.filter((l) => roomInAudience(r.audience, { id: l.roomId, buildingId: l.buildingId, floorNo: l.floorNo })).map((l) => canon.get(l.partyId) ?? l.partyId),
    );
    const s = ZERO(people.size);
    if (r.publishedAt) {
      const pre = `${LOG_PREFIX}${r.id}:`;
      for (const l of logs) {
        if (!l.dedupeKey.startsWith(pre)) continue;
        if (SENT.has(l.status)) s.sent++;
        else if (WAITING.has(l.status)) s.waiting++;
        else if (NO_LINE.has(l.status) || l.status.startsWith("SKIPPED_PRECHECK_")) s.noLine++;
      }
      s.reads = reads.find((x) => x.announcementId === r.id)?._count._all ?? 0;
    }
    out.set(r.id, s);
  }
  return out;
}

// ───────────────────────── ฝั่งพนักงาน (§3.2) ─────────────────────────
type AnnRow = { id: string; unitId: string; title: string; body: string; audience: string; audienceIds: Prisma.JsonValue | null; publishedAt: Date | null; createdAt: Date };
const ANN_SELECT = { id: true, unitId: true, title: true, body: true, audience: true, audienceIds: true, publishedAt: true, createdAt: true } as const;

async function annOf(g: Gate, announcementId: unknown): Promise<AnnRow | null> {
  if (!isStr(announcementId) || !ID_RE.test(announcementId)) return null;
  const a = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormAnnouncement.findFirst({ where: { id: announcementId }, select: ANN_SELECT });
  if (!a) return null;
  return actorSees(audienceOfRow(a.audience, a.audienceIds), g) ? a : null;
}

type Draft = { title: string; body: string; aud: AnnounceAudience };
/** รูป → id เป้าหมาย → ตัวตรวจคำ (ลำดับ §3.2) */
async function checkDraft(g: Gate, i: Record<string, unknown>): Promise<{ ok: true; d: Draft } | AnnounceFail> {
  const title = typeof i.title === "string" ? i.title.trim() : "";
  const body = typeof i.body === "string" ? i.body.trim() : "";
  if (!title) return BAD("ใส่หัวเรื่องประกาศ");
  if (Array.from(title).length > TITLE_MAX) return BAD(`หัวเรื่องยาวได้ไม่เกิน ${TITLE_MAX} ตัวอักษร`);
  if (/[\r\n]/.test(title)) return BAD("หัวเรื่องต้องอยู่ในบรรทัดเดียว");
  if (!body) return BAD("ใส่เนื้อหาประกาศ");
  if (Array.from(body).length > BODY_MAX) return BAD(`เนื้อหายาวได้ไม่เกิน ${BODY_MAX.toLocaleString("en-US")} ตัวอักษร`);
  const p = parseAudience(i.audience);
  if (!p.ok) return BAD(p.reason);
  if (p.aud.kind === "ALL" && g.visible !== null) return BAD(SCOPE_ALL_REASON);
  const plan = await unitPlan(g.tenantId, g.unitId);
  if (!targetsOk(p.aud, plan, g)) return announceNotFound();
  const terms = contentTerms(title, body, await tplOf(g.tenantId, g.unitId), g.unitName);
  if (terms.length) return { ok: false, code: "LEGAL_BLOCK", reason: LEGAL_REASON, terms };
  return { ok: true, d: { title, body, aud: p.aud } };
}

export async function createDormAnnouncement(
  ctx: AnnounceCtx,
  i: { unitId: string; title: string; body: string; audience: AnnounceAudience },
): Promise<{ ok: true; announcementId: string } | AnnounceFail> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const c = await checkDraft(g, i as unknown as Record<string, unknown>);
  if (!c.ok) return c;
  const row = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormAnnouncement.create({
    data: { tenantId: g.tenantId, unitId: g.unitId, title: c.d.title, body: c.d.body, audience: c.d.aud.kind, audienceIds: idsOfAudience(c.d.aud), publishedAt: null, createdById: g.actorUserId },
    select: { id: true },
  });
  return { ok: true, announcementId: row.id };
}

export async function updateDormAnnouncement(
  ctx: AnnounceCtx,
  i: { unitId: string; announcementId: string; title: string; body: string; audience: AnnounceAudience },
): Promise<{ ok: true } | AnnounceFail> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const a = await annOf(g, i.announcementId);
  if (!a) return announceNotFound();
  if (a.publishedAt) return fail("BAD_STATE", PUBLISHED_REASON);
  const c = await checkDraft(g, i as unknown as Record<string, unknown>);
  if (!c.ok) return c;
  const n = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).dormAnnouncement.updateMany({
    where: { id: a.id, publishedAt: null },
    data: { title: c.d.title, body: c.d.body, audience: c.d.aud.kind, audienceIds: idsOfAudience(c.d.aud) ?? Prisma.DbNull },
  });
  return n.count === 1 ? { ok: true } : fail("BAD_STATE", PUBLISHED_REASON);
}

export async function previewDormAnnouncement(
  ctx: AnnounceCtx,
  i: { unitId: string; announcementId: string },
  opts?: { now?: Date },
): Promise<{ ok: true; recipients: number; rooms: string[] } | AnnounceFail> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const a = await annOf(g, i.announcementId);
  if (!a) return announceNotFound();
  const r = await recipientsOf(g.tenantId, g.unitId, audienceOfRow(a.audience, a.audienceIds), nowOf(opts?.now));
  return { ok: true, recipients: r.people.length, rooms: r.rooms };
}

export async function publishDormAnnouncement(
  ctx: AnnounceCtx,
  i: { unitId: string; announcementId: string },
  opts?: { now?: Date },
): Promise<{ ok: true; published: boolean; publishedAt: string; warning?: string } | AnnounceFail> {
  const now = nowOf(opts?.now);
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const a = await annOf(g, i.announcementId);
  if (!a) return announceNotFound();
  if (a.publishedAt) return { ok: true, published: false, publishedAt: a.publishedAt.toISOString() };
  // ตรวจคำซ้ำ — แถวอาจถูกเขียนตรงเข้าฐาน (ไม่ผ่าน create)
  const tpl = await tplOf(g.tenantId, g.unitId);
  const terms = contentTerms(a.title, a.body, tpl, g.unitName);
  if (terms.length) return { ok: false, code: "LEGAL_BLOCK", reason: LEGAL_REASON, terms };
  // UX ▸ แม่แบบข้อความประกาศของหอเองมีคำต้องห้าม ⇒ เผยแพร่ได้ (หน้าผู้เช่า) แต่ LINE จะไม่ออก — บอกพนักงานทันที
  const warn = templateTermsOf(tpl).length ? { warning: TEMPLATE_WARN } : {};
  const aud = audienceOfRow(a.audience, a.audienceIds);
  const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
  const won = await retryOnce(() =>
    db.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as Tx;
      const u = await tx.dormAnnouncement.updateMany({ where: { id: a.id, tenantId: g.tenantId, unitId: g.unitId, publishedAt: null }, data: { publishedAt: now } });
      if (u.count !== 1) return false;
      await emitOutbox(tx, {
        tenantId: g.tenantId,
        type: EVENT,
        idempotencyKey: `${EVENT}:${a.id}`,
        unitId: g.unitId,
        payload: { unitId: g.unitId, announcementId: a.id, audience: aud.kind },
      });
      await tx.auditLog.create({
        data: {
          tenantId: g.tenantId,
          actorType: "USER",
          actorId: g.actorUserId,
          action: EVENT,
          targetType: "DormAnnouncement",
          targetId: a.id,
          after: { unitId: g.unitId, announcementId: a.id, audience: aud.kind },
        },
      });
      return true;
    }, TX_OPTS),
  );
  if (won === "BUSY") return fail("BUSY", BUSY_REASON);
  if (won) return { ok: true, published: true, publishedAt: now.toISOString(), ...warn };
  const cur = await db.dormAnnouncement.findFirst({ where: { id: a.id }, select: { publishedAt: true } });
  return cur?.publishedAt ? { ok: true, published: false, publishedAt: cur.publishedAt.toISOString(), ...warn } : fail("BUSY", BUSY_REASON);
}

export async function dormAnnouncementStats(
  ctx: AnnounceCtx,
  i: { unitId: string; announcementId: string },
  opts?: { now?: Date },
): Promise<{ ok: true; stats: AnnounceStats } | AnnounceFail> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const a = await annOf(g, i.announcementId);
  if (!a) return announceNotFound();
  const m = await statsMany(g.tenantId, g.unitId, [{ id: a.id, audience: audienceOfRow(a.audience, a.audienceIds), publishedAt: a.publishedAt }], nowOf(opts?.now));
  return { ok: true, stats: m.get(a.id) ?? ZERO(0) };
}

/**
 * F6 ▸ ประกาศของหน่วยที่ผู้กระทำเห็น (ใหม่ → เก่า ≤ 100) — กรองขอบเขตอาคารในคิวรี:
 *   ทั้งหน่วย ⇒ ทุกฉบับ · ถูกจำกัด ⇒ ไม่มี ALL · BUILDING/FLOOR = ทุกอาคารเป้าหมายอยู่ในขอบเขต · ROOM = ทุกห้องเป้าหมายอยู่ในห้องที่เห็น
 */
async function modelRows(g: Gate): Promise<AnnRow[]> {
  const all = g.visible === null;
  const bids = g.scope.all ? [] : g.scope.buildingIds;
  const rids = g.visible ? [...g.visible] : [];
  return tenantDb({ tenantId: g.tenantId }).$queryRaw<AnnRow[]>`
    SELECT a."id", a."unitId", a."title", a."body", a."audience", a."audienceIds", a."publishedAt", a."createdAt"
    FROM "DormAnnouncement" a
    WHERE a."tenantId" = ${g.tenantId} AND a."unitId" = ${g.unitId}
      AND (${all}::boolean
        OR (a."audience" = 'BUILDING' AND jsonb_typeof(a."audienceIds") = 'array' AND jsonb_array_length(a."audienceIds") > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a."audienceIds") e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY(${bids}::text[]))))
        OR (a."audience" = 'FLOOR' AND jsonb_typeof(a."audienceIds") = 'array' AND jsonb_array_length(a."audienceIds") > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a."audienceIds") e WHERE jsonb_typeof(e) <> 'object' OR (e ->> 'buildingId') IS NULL OR NOT ((e ->> 'buildingId') = ANY(${bids}::text[]))))
        OR (a."audience" = 'ROOM' AND jsonb_typeof(a."audienceIds") = 'array' AND jsonb_array_length(a."audienceIds") > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a."audienceIds") e WHERE jsonb_typeof(e) <> 'string' OR NOT ((e #>> '{}') = ANY(${rids}::text[])))))
    ORDER BY a."createdAt" DESC, a."id" DESC
    LIMIT ${MODEL_ITEMS_MAX}`;
}

export async function dormAnnounceModel(ctx: AnnounceCtx, i: { unitId: string }, opts?: { now?: Date }): Promise<DormAnnounceModel | null> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return null;
  const now = nowOf(opts?.now);
  const plan = await unitPlan(g.tenantId, g.unitId);
  const scopeB = g.scope.all ? null : new Set(g.scope.buildingIds);
  const buildings = plan.buildings.filter((b) => !scopeB || scopeB.has(b.id));
  const rooms = plan.rooms.filter((r) => r.active && (!g.visible || g.visible.has(r.id)));
  const fl = new Map<string, { buildingId: string; buildingName: string; floorNo: number }>();
  for (const r of rooms) {
    if (!r.buildingId || r.floorNo === null) continue;
    const b = plan.buildings.find((x) => x.id === r.buildingId);
    if (!b) continue;
    fl.set(floorKey({ buildingId: r.buildingId, floorNo: r.floorNo }), { buildingId: r.buildingId, buildingName: b.name, floorNo: r.floorNo });
  }
  const bOrder = (id: string) => plan.buildings.findIndex((b) => b.id === id);
  const floors = [...fl.values()].sort((x, y) => bOrder(x.buildingId) - bOrder(y.buildingId) || x.floorNo - y.floorNo);
  const rows = (await modelRows(g))
    .map((r) => ({ r, aud: audienceOfRow(r.audience, r.audienceIds) }))
    .filter((x) => actorSees(x.aud, g)) // ชั้นที่สอง (แถวเพี้ยน) — ขอบเขตกรองในคิวรีแล้ว
    .slice(0, MODEL_ITEMS_MAX);
  const st = await statsMany(g.tenantId, g.unitId, rows.map((x) => ({ id: x.r.id, audience: x.aud, publishedAt: x.r.publishedAt })), now);
  return {
    unitId: g.unitId,
    unitName: g.unitName,
    basePath: `/app/u/${g.unitSlug}/dorm`,
    canAll: g.visible === null,
    options: {
      buildings: buildings.map((b) => ({ id: b.id, name: b.name })),
      floors,
      rooms: rooms.map((r) => ({ id: r.id, number: r.number, buildingId: r.buildingId, floorNo: r.floorNo })),
    },
    items: rows.map(({ r, aud }) => ({
      id: r.id,
      title: r.title,
      status: r.publishedAt ? ("PUBLISHED" as const) : ("DRAFT" as const),
      audience: aud,
      audienceLabelTh: audienceLabel(aud, plan),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      stats: st.get(r.id) ?? ZERO(0),
    })),
  };
}

/** ด่าน §3.2 ของงานส่งซ้ำจากจอพนักงาน (platform/dorm-announce) — ไม่ผ่าน ⇒ วัตถุ NOT_FOUND ตัวเดียวกับทั้งไฟล์ */
export async function announceStaffGate(
  ctx: unknown,
  i: { unitId: string; announcementId: string },
): Promise<{ ok: true; tenantId: string; unitId: string; announcementId: string } | { ok: false; code: "NOT_FOUND"; reason: string }> {
  const g = await gate(ctx, isRec(i) ? i.unitId : null);
  if (!g) return announceNotFound();
  const a = await annOf(g, isRec(i) ? i.announcementId : null);
  if (!a) return announceNotFound();
  return { ok: true, tenantId: g.tenantId, unitId: g.unitId, announcementId: a.id };
}

// ───────────────────────── ตัวอ่านไม่มีผู้กระทำ (platform ใช้) ─────────────────────────
export type AnnounceForSend = { id: string; unitId: string; unitName: string; title: string; body: string; audience: AnnounceAudience; publishedAt: Date | null };

/** ประกาศของร้าน (อ่านสดทุกครั้ง · หน่วย DORM) — ไม่พบ ⇒ null */
export async function announceForSend(tenantId: string, announcementId: string): Promise<AnnounceForSend | null> {
  if (!isStr(tenantId) || !isStr(announcementId) || !ID_RE.test(announcementId)) return null;
  const rows = await tenantDb({ tenantId }).$queryRaw<(AnnRow & { unitName: string })[]>`
    SELECT a."id", a."unitId", a."title", a."body", a."audience", a."audienceIds", a."publishedAt", a."createdAt", u."name" AS "unitName"
    FROM "DormAnnouncement" a JOIN "BusinessUnit" u ON u."id" = a."unitId" AND u."tenantId" = a."tenantId" AND u."type"::text = 'DORM'
    WHERE a."tenantId" = ${tenantId} AND a."id" = ${announcementId} LIMIT 1`;
  const a = rows[0];
  return a
    ? { id: a.id, unitId: a.unitId, unitName: a.unitName, title: a.title, body: a.body, audience: audienceOfRow(a.audience, a.audienceIds), publishedAt: a.publishedAt }
    : null;
}

/** ผู้รับ ณ now (คิดสด · 1 คนต่อ Party ตัวจริง) */
export async function announceRecipients(tenantId: string, a: { unitId: string; audience: AnnounceAudience }, now: Date): Promise<AnnounceRecipient[]> {
  if (!isStr(tenantId)) return [];
  return (await recipientsOf(tenantId, a.unitId, a.audience, now)).people;
}

/** แม่แบบประกาศปัจจุบันของหน่วย (อ่านต่อคำขอ) */
export async function announceTemplate(tenantId: string, unitId: string): Promise<unknown> {
  return tplOf(tenantId, unitId);
}

/**
 * แถวส่งประกาศที่ notifyCustomer ปิดโดยไม่มีผู้ติดต่อ (NO_CHANNEL ⇒ partyId ว่าง) — เติม Party ของสัญญาตัวแทน (id ล้วน)
 *   ให้ log เป็นรายชื่อผู้รับโดยปริยาย (§3.4) · ไม่แตะแถวที่มี partyId แล้ว · เขียนเฉพาะคีย์ประกาศ
 */
export async function announceStampLogParty(tenantId: string, unitId: string, dedupeKey: string, partyId: string): Promise<void> {
  if (!isStr(tenantId) || !isStr(unitId) || !dedupeKey.startsWith(LOG_PREFIX) || !isStr(partyId)) return;
  await tenantDb({ tenantId, unitId }).serviceMessageLog.updateMany({ where: { dedupeKey, partyId: null }, data: { partyId } });
}

/** สัญญาที่ใช้ตัดสิน "ประกาศที่สัญญาเห็น" (ผลของ portalLiveLease) */
export type AnnounceLeaseRef = { id: string; tenantId: string; unitId: string; roomId: string; partyId: string; startDate: string };
export type AnnounceVisibleRow = { id: string; title: string; body: string; publishedAt: Date };

/**
 * ประกาศที่สัญญา L เห็น (§3.0): เผยแพร่แล้ว ≤ now · ห้องของ L อยู่ในกลุ่ม (ณ ปัจจุบัน · ห้อง active) ·
 *   ≥ 00:00 ไทยของวันเริ่มสัญญา (ผู้เช่าใหม่ไม่เห็นของคนเก่า) · ≥ now − rooms.notify.announcePortalDays · ไม่มีคำต้องห้าม
 *   ใหม่ → เก่า · only = เฉพาะประกาศนี้ (ไม่ตกไปประกาศอื่น)
 */
export async function announceVisibleForLease(lease: AnnounceLeaseRef, now: Date, opts?: { only?: string; limit?: number }): Promise<AnnounceVisibleRow[]> {
  if (!isRec(lease) || !isStr(lease.tenantId) || !isStr(lease.unitId) || !isStr(lease.roomId)) return [];
  if (opts?.only !== undefined && !(isStr(opts.only) && ID_RE.test(opts.only))) return [];
  const { tenantId, unitId } = lease;
  const db = tenantDb({ tenantId, unitId });
  const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { id: true, buildingId: true, floorNo: true, active: true } });
  if (!room || !room.active) return [];
  const s = await resolveSettings({ tenantId }, ["rooms.notify.announcePortalDays"], { unitId });
  const dv = s["rooms.notify.announcePortalDays"]?.value;
  const days = typeof dv === "number" && Number.isInteger(dv) && dv >= 1 ? dv : 1;
  const startMs = /^\d{4}-\d{2}-\d{2}$/.test(lease.startDate) ? Date.parse(`${lease.startDate}T00:00:00+07:00`) : Number.NaN;
  if (!Number.isFinite(startMs)) return [];
  const from = new Date(Math.max(startMs, now.getTime() - days * DAY_MS));
  const rows = await db.dormAnnouncement.findMany({
    where: { publishedAt: { not: null, gte: from, lte: now }, ...(opts?.only ? { id: opts.only } : {}) },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: PORTAL_SCAN_MAX,
    select: { id: true, title: true, body: true, audience: true, audienceIds: true, publishedAt: true },
  });
  const out: AnnounceVisibleRow[] = [];
  for (const r of rows) {
    if (!r.publishedAt || !roomInAudience(audienceOfRow(r.audience, r.audienceIds), room)) continue;
    if (findForbiddenTerms(r.title).length || findForbiddenTerms(r.body).length || findForbiddenTerms(`${r.title}\n${r.body}`).length) continue;
    out.push({ id: r.id, title: r.title, body: r.body, publishedAt: r.publishedAt });
    if (out.length >= (opts?.limit ?? PORTAL_SCAN_MAX)) break;
  }
  return out;
}

/** บันทึกอ่าน (ต่อคน: Party ตัวจริงของสัญญา) — INSERT … ON CONFLICT DO NOTHING · counted = แถวใหม่จริง · ไม่ throw P2002 */
export async function announceMarkRead(lease: AnnounceLeaseRef, announcementId: string): Promise<boolean> {
  const partyId = await portalCanonicalParty(lease.tenantId, lease.partyId);
  const r = await tenantDb({ tenantId: lease.tenantId, unitId: lease.unitId }).dormAnnouncementRead.createMany({
    data: [{ tenantId: lease.tenantId, unitId: lease.unitId, announcementId, partyId }],
    skipDuplicates: true,
  });
  return r.count === 1;
}

/** ป้ายวันไทย "3 พ.ย. 2569" ของเวลาเผยแพร่ */
export const announceDateLabel = (d: Date): string => thDateOf(bkkYmd(d));

/** F2 ▸ audit ของประกาศครั้งเดียวต่อ (action, ประกาศ) — id ล้วน · ไม่ throw */
export const ANNOUNCE_BLOCKED_ACTION = "dorm.announcement.blocked";
export const ANNOUNCE_IDLE_ACTION = "dorm.announcement.noRecipients";
export async function announceAuditOnce(tenantId: string, unitId: string, action: typeof ANNOUNCE_BLOCKED_ACTION | typeof ANNOUNCE_IDLE_ACTION, announcementId: string): Promise<void> {
  try {
    if (!isStr(tenantId) || !isStr(unitId) || !isStr(announcementId)) return;
    const db = tenantDb({ tenantId });
    const hit = await db.auditLog.findFirst({ where: { action, targetType: "DormAnnouncement", targetId: announcementId }, select: { id: true } });
    if (hit) return;
    await db.auditLog.create({
      data: { tenantId, actorType: "SYSTEM", action, targetType: "DormAnnouncement", targetId: announcementId, after: { unitId, announcementId } },
    });
  } catch {
    // audit ล้มเหลวห้ามทำงานหลักพัง
  }
}

export type AnnounceCursor = { publishedAt: Date; id: string };
/**
 * F1 ▸ งานส่งซ้ำ — คืนทีละหน้า (keyset publishedAt, id) ให้ผู้เรียกวนจนหมดงบ:
 *   phase "RETRY" = มีแถว SKIPPED_QUIET/FAILED (ส่งก่อน) · phase "FRESH" = ยังไม่มีแถว log เลย (consumer ไม่ได้ส่ง)
 *   ตัดออกในคิวรี: หน่วยที่ตั้ง rooms.notify.announceLine = false (ค่าชั้น UNIT ที่มีผล ณ now — ตัวกรองล่วงหน้า · ตอนส่งยังตรวจจากทะเบียนซ้ำ) ·
 *   ประกาศที่เคยถูกบล็อกคำต้องห้าม/ไม่มีผู้รับ (audit ครั้งเดียวต่อประกาศ — F2) · หน้าต่างเวลาตัดสินจาก publishedAt
 *   F5 ▸ ข้ามร้านเมื่อไม่ระบุ tenantId: ใช้ $queryRaw ตรง (SQL ล้วน — ตัวกรองร้านเขียนใน WHERE เอง ·
 *   บริบทของ client ไม่ถูกใช้กับ raw SQL) เหมือนงานตามเวลาอื่นของหอ (dorm-line/dunning/billing)
 */
export async function announceResendCandidates(
  now: Date,
  since: Date,
  tenantId: string | null,
  phase: "RETRY" | "FRESH",
  after: AnnounceCursor | null,
  limit: number,
): Promise<{ tenantId: string; announcementId: string; publishedAt: Date }[]> {
  const tid = isStr(tenantId) ? tenantId : null;
  const take = Math.max(1, Math.min(200, Math.trunc(limit) || 1));
  const aAt = after?.publishedAt ?? new Date(0);
  const aId = after?.id ?? "";
  const retry = phase === "RETRY";
  type Row = { tenantId: string; announcementId: string; publishedAt: Date };
  return rawSql(tid).$queryRaw<Row[]>`
    SELECT a."tenantId", a."id" AS "announcementId", a."publishedAt" FROM "DormAnnouncement" a
    WHERE (${tid}::text IS NULL OR a."tenantId" = ${tid}) AND a."publishedAt" IS NOT NULL AND a."publishedAt" >= ${since} AND a."publishedAt" <= ${now}
      AND (a."publishedAt", a."id") > (${aAt}, ${aId})
      AND (CASE WHEN ${retry}::boolean
        THEN EXISTS (SELECT 1 FROM "ServiceMessageLog" s WHERE s."tenantId" = a."tenantId" AND s."unitId" = a."unitId"
                      AND starts_with(s."dedupeKey", 'rooms:announcement:' || a."id" || ':') AND s."status" IN ('SKIPPED_QUIET', 'FAILED'))
        ELSE NOT EXISTS (SELECT 1 FROM "ServiceMessageLog" s WHERE s."tenantId" = a."tenantId" AND s."unitId" = a."unitId"
                      AND starts_with(s."dedupeKey", 'rooms:announcement:' || a."id" || ':')) END)
      AND COALESCE((SELECT v."value" = 'false'::jsonb FROM "SettingValue" v
                    WHERE v."tenantId" = a."tenantId" AND v."key" = 'rooms.notify.announceLine' AND v."scope" = 'UNIT' AND v."scopeId" = a."unitId" AND v."effectiveFrom" <= ${now}
                    ORDER BY v."effectiveFrom" DESC LIMIT 1), false) = false
      AND NOT EXISTS (SELECT 1 FROM "AuditLog" x WHERE x."tenantId" = a."tenantId" AND x."targetType" = 'DormAnnouncement' AND x."targetId" = a."id"
                      AND x."action" IN ('dorm.announcement.blocked', 'dorm.announcement.noRecipients'))
    ORDER BY a."publishedAt" ASC, a."id" ASC
    LIMIT ${take}`;
}
/** client สำหรับ $queryRaw เท่านั้น (raw SQL ไม่ผ่านตัวกรอง tenantDb — ร้านกรองใน SQL เอง) · ระบุร้าน ⇒ ใช้บริบทร้านนั้น */
const RAW_SQL_ONLY_CTX = "raw-sql-only";
const rawSql = (tid: string | null) => tenantDb({ tenantId: tid ?? RAW_SQL_ONLY_CTX });
