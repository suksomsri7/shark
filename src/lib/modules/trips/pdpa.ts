// ─────────────────────────────────────────────────────────────
// trips/pdpa.ts — ลบตามอายุต่อหน่วย (G5) · ลบทั้งคน · ลบผู้จองของการจองหมดเวลาที่ไม่มีเงินเข้า · คิวคำขอเจ้าของข้อมูล · ส่งออก · RUN TRIPS T0.8
// ใบสั่ง ledger/trips-briefs/T0.8.md §7 §8 §11.1 (§17 มติผู้คุมชนะ · ข้อ 5 = ข้ามการจองที่มีเงินรับ/คำขอคืนเงินค้าง ตรวจใต้ล็อกแถวการจอง)
//
// 🔴 tenantDb เท่านั้น · ทุกคิวรีมี "tenantId" + "unitId" · ค่าตั้งอ่านครั้งเดียวต่อหน่วยนอก tx · ไม่แตะร้าน/หน่วยอื่น
// 🔴 ไม่มี DELETE แถว Trip* — การลบข้อมูล = ล้างคอลัมน์ / ตั้ง deletedAt · ไฟล์ = deleteFileAsset (วัตถุ + แถว FileAsset) นอก tx เท่านั้น
// 🔴 ทุกการลบ = CAS ที่มีเงื่อนไขค่าเดิม (deletedAt IS NULL · rev · status) ⇒ รันซ้อนกันได้ · แต่ละชิ้นถูกนับ/ออก event ครั้งเดียว · รอบที่สอง = 0
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import type { SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import { evaluate } from "@/lib/core/rbac";
import type { DeleteDeps } from "@/lib/storage/service";
import { normalizeTimezone } from "./departures-core";
import {
  A,
  NF,
  SENSITIVE,
  abort,
  auditTx,
  deleteFiles,
  docRetainUntil,
  emitTx,
  endYmdOf,
  fail,
  inTx,
  invalid,
  isFailure,
  liveDocs,
  loadPax,
  loadRetention,
  lockKey,
  markDocsDeletedInTx,
  openDocNumber,
  openHealth,
  purgedEvt,
  ro,
  safely,
  sensitiveOk,
  sha256hex,
  staffGate,
  valuesOf,
  type DocRow,
  type Unit,
  type Who,
} from "./passengers";
import {
  ID,
  IDEM_KEY,
  PAX_STAGE_DAYS,
  PURPOSES,
  addDaysYmd,
  isPurgedAll,
  isRealYmd,
  localYmdOf,
  paxRetainUntil,
  parseAnswers,
  parseGuardian,
  parseWaiver,
  presentStages,
  purgeInstant,
  purgedWaiverOf,
  stageDue,
  type Answers,
  type PaxStage,
  type Retention,
} from "./passengers-core";

// ── T0.8 pdpa ──
const P_MANAGE = "trips.pdpa.manage";
const K_DEADLINES = "trips.pdpa.requestDeadlines";
const K_ABANDONED = "trips.pdpa.abandonedRetentionDays";
const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString();
const SYSTEM: Who = { kind: "SYSTEM" };
/** คำขอคืนเงินที่ยังไม่จบ (TripRefundRequest.status §G.3) — การจองที่มีแถวเหล่านี้ไม่ถูกลบผู้จอง (มติ 5) */
const OPEN_REFUND = ["REQUESTED", "QUOTED", "APPROVED", "EXECUTING", "FAILED"];

// ═══════════════════════ ลบทั้งคน (§8 แถว "ลบทั้งคน") ═══════════════════════
/**
 * ในธุรกรรมของผู้เรียก: ล็อกแถวผู้เดินทาง → CAS rev → ล้างทุกช่องตาม §8 → ไฟล์ที่ยังไม่ถูกลบตั้ง retainUntil = now (งานลบหยิบไปลบวัตถุรอบถัดไป/รอบนี้)
 * คงไว้: id · bookingId · itemId · isMinor · formStatus · waiverSignedAt · checkinAt · createdAt
 */
async function erasePassengerInTx(tx: Prisma.TransactionClient, u: Unit, who: Who, passengerId: string, now: Date, skipDocIds: readonly string[]): Promise<boolean> {
  const L = await loadPax(tx, u.tenantId, u.unitId, passengerId, "UPDATE");
  if (!L) return false;
  const a = parseAnswers(L.answers);
  if (isPurgedAll(a)) return false;
  const next: Answers = { v: 1, rev: a.rev + 1, fields: {}, purged: { at: iso(now), stages: ["ALL"] } };
  const done = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripPassenger" SET "fullName" = '', "nationality" = NULL, "dob" = NULL, "sex" = NULL, "docType" = NULL, "docNumberEnc" = NULL, "docLast4" = NULL,
      "docExpiry" = NULL, "phone" = NULL, "birthPlace" = NULL, "certLevel" = NULL, "diveCount" = NULL, "lastDiveAt" = NULL, "diver" = NULL,
      "guardianConsent" = NULL, "waiverEvidence" = NULL, "retainUntil" = NULL, "answers" = ${JSON.stringify(next)}::jsonb, "updatedAt" = ${iso(now)}::timestamp
    WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}
    RETURNING "id"`;
  if (done.length !== 1) return abort("STATE_CONFLICT", { rev: a.rev });
  const skip = skipDocIds.length ? Prisma.sql`AND NOT ("id" = ANY(${[...skipDocIds]}::text[]))` : Prisma.empty;
  await tx.$executeRaw`
    UPDATE "TripDocument" SET "retainUntil" = ${iso(now)}::timestamp, "updatedAt" = ${iso(now)}::timestamp
    WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${L.id} AND "deletedAt" IS NULL ${skip}`;
  await auditTx(tx, u, who, A.purged, "TripPassenger", L.id, { passengerId: L.id, stage: "ALL" });
  await emitTx(tx, u, [purgedEvt(`${L.id}:ALL`, L.bookingId, L.id, "PASSENGER_ALL")]);
  return true;
}

// ═══════════════════════ คิวคำขอเจ้าของข้อมูล (§11.1 · L-48 · T64) ═══════════════════════
const KINDS = ["ACCESS", "RECTIFY", "ERASE", "OBJECT", "PORTABILITY"] as const;
const STATUSES = ["RECEIVED", "IN_PROGRESS", "DONE", "REJECTED"] as const;
const recordSchema = z.strictObject({
  kind: z.enum(KINDS),
  passengerId: ID.optional(),
  partyId: ID.optional(),
  receivedAt: z.string().refine((s) => isRealYmd(s), { message: "วันที่ไม่ถูกต้อง" }).optional(),
  idempotencyKey: IDEM_KEY,
});
const listSchema = z.strictObject({ status: z.enum(STATUSES).optional(), limit: z.number().int().min(1).max(200).optional() });
const resolveSchema = z.strictObject({
  requestId: ID,
  expectedStatus: z.enum(STATUSES),
  decision: z.enum(["IN_PROGRESS", "DONE", "REJECTED"]),
  reasonCode: z.enum(["LEGAL_CLAIM", "LEGAL_OBLIGATION", "IDENTITY_NOT_VERIFIED", "OTHER"]).optional(),
});
const exportSchema = z.strictObject({ passengerId: ID, purpose: z.enum(PURPOSES) });
const DEADLINES = z.object({ accessDays: z.number().int().min(1).max(365), deletionDays: z.number().int().min(1).max(365) });

type ReqRow = { id: string; kind: string; status: string; passengerId: string | null; partyId: string | null; dueAt: Date; doneAt: Date | null };
/** แถว audit กันซ้ำของการบันทึกคำขอ (ค้นผ่านดัชนี AuditLog(action) + tenantId — targetId ยังไม่รู้ก่อนบันทึก) */
async function requestByKey(db: Prisma.TransactionClient, tenantId: string, keyHash: string): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "action" = ${A.requestRecorded} AND "tenantId" = ${tenantId} AND "after"->>'keyHash' = ${keyHash} LIMIT 1`;
  const a = rows[0]?.after;
  return a !== null && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
}

export async function recordPdpaRequest(ctx: unknown, input: unknown): Promise<SellResult<{ requestId: string; status: string; dueAt: string; replayed?: true }>> {
  return safely("recordPdpaRequest", ctx, async () => {
    const p = recordSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const d = p.data;
    if (!d.passengerId && !d.partyId) return fail("VALIDATION", { fields: ["passengerId", "partyId"] });
    const s = await staffGate(ctx, P_MANAGE);
    if (isFailure(s)) return s;
    const db = ro(s.tenantId);
    if (d.passengerId && !(await loadPax(db, s.tenantId, s.unitId, d.passengerId))) return NF();
    if (d.partyId) {
      const hit = await db.$queryRaw<{ x: number }[]>`
        SELECT 1 AS "x" FROM "TripBooking" WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "bookerPartyId" = ${d.partyId}
        UNION ALL SELECT 1 AS "x" FROM "TripPassenger" WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "partyId" = ${d.partyId} LIMIT 1`;
      if (!hit.length) return NF();
    }
    const r = await resolveSettings({ tenantId: s.tenantId }, [K_DEADLINES], { unitId: s.unitId }, s.now);
    const dl = DEADLINES.safeParse(r[K_DEADLINES]?.value);
    if (!dl.success) return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K_DEADLINES });
    const receivedAt = d.receivedAt ?? localYmdOf(s.now, s.tz);
    const dueAt = purgeInstant(addDaysYmd(receivedAt, d.kind === "ERASE" ? dl.data.deletionDays : dl.data.accessDays), s.tz);
    const keyHash = sha256hex(`st:${s.userId}:pdpa:${d.idempotencyKey}`);
    const bodyHash = sha256hex(JSON.stringify(["trips.pdpa.request.v1", s.unitId, d.kind, d.passengerId ?? null, d.partyId ?? null, receivedAt]));
    const replay = (x: Record<string, unknown>): SellResult<{ requestId: string; status: string; dueAt: string; replayed?: true }> =>
      x.bodyHash === bodyHash ? { ok: true, value: { requestId: String(x.requestId), status: "RECEIVED", dueAt: String(x.dueAt), replayed: true } } : fail("IDEMPOTENCY_CONFLICT");
    const pre = await requestByKey(db, s.tenantId, keyHash);
    if (pre) return replay(pre);
    const out = await inTx(s, async (tx) => {
      await lockKey(tx, `t08.pdpareq:${keyHash}`);
      const again = await requestByKey(tx, s.tenantId, keyHash);
      if (again) return { again, requestId: "" };
      const row = await tx.tripPdpaRequest.create({
        data: { tenantId: s.tenantId, unitId: s.unitId, passengerId: d.passengerId ?? null, partyId: d.partyId ?? null, kind: d.kind, status: "RECEIVED", dueAt },
        select: { id: true },
      });
      await auditTx(tx, s, { kind: "USER", userId: s.userId }, A.requestRecorded, "TripPdpaRequest", row.id, {
        requestId: row.id,
        kind: d.kind,
        passengerId: d.passengerId ?? null,
        partyId: d.partyId ?? null,
        dueAt: iso(dueAt),
        keyHash,
        bodyHash,
      });
      return { again: null, requestId: row.id };
    });
    if (!out.ok) return out;
    if (out.value.again) return replay(out.value.again);
    return { ok: true, value: { requestId: out.value.requestId, status: "RECEIVED", dueAt: iso(dueAt) } };
  });
}

export type PdpaRequestItem = { id: string; kind: string; status: string; passengerId: string | null; partyId: string | null; dueAt: string; dueSoon: boolean; overdue: boolean };
export async function listPdpaRequests(ctx: unknown, input: unknown): Promise<SellResult<{ items: PdpaRequestItem[] }>> {
  return safely("listPdpaRequests", ctx, async () => {
    const p = listSchema.safeParse(input ?? {});
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, P_MANAGE);
    if (isFailure(s)) return s;
    const rows = await ro(s.tenantId).$queryRaw<ReqRow[]>`
      SELECT "id", "kind", "status", "passengerId", "partyId", "dueAt", "doneAt" FROM "TripPdpaRequest"
      WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} ${p.data.status ? Prisma.sql`AND "status" = ${p.data.status}` : Prisma.empty}
      ORDER BY "dueAt", "id" LIMIT ${p.data.limit ?? 200}`;
    const now = s.now.getTime();
    return {
      ok: true,
      value: {
        items: rows.map((r) => {
          const due = new Date(r.dueAt).getTime();
          const open = r.status === "RECEIVED" || r.status === "IN_PROGRESS";
          return { id: r.id, kind: r.kind, status: r.status, passengerId: r.passengerId, partyId: r.partyId, dueAt: iso(new Date(r.dueAt)), dueSoon: open && due >= now && due - now <= 7 * DAY_MS, overdue: open && now > due };
        }),
      },
    };
  });
}

const NEXT: Record<string, readonly string[]> = { RECEIVED: ["IN_PROGRESS", "DONE", "REJECTED"], IN_PROGRESS: ["DONE", "REJECTED"] };
/** ปิด/เดินคำขอ — CAS status · ERASE + DONE + passengerId ⇒ ลบทั้งคนในธุรกรรมเดียวกับ CAS (ไฟล์ลบนอก tx ก่อน · ล้ม ⇒ ไม่ปิดคำขอ) */
export async function resolvePdpaRequest(ctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<{ requestId: string; status: string }>> {
  return safely("resolvePdpaRequest", ctx, async () => {
    const p = resolveSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const d = p.data;
    if ((d.decision === "REJECTED") !== (d.reasonCode !== undefined)) return fail("VALIDATION", { fields: ["reasonCode"] });
    const s = await staffGate(ctx, P_MANAGE);
    if (isFailure(s)) return s;
    const db = ro(s.tenantId);
    const rows = await db.$queryRaw<ReqRow[]>`
      SELECT "id", "kind", "status", "passengerId", "partyId", "dueAt", "doneAt" FROM "TripPdpaRequest" WHERE "id" = ${d.requestId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}`;
    const q = rows[0];
    if (!q) return NF();
    if (q.status !== d.expectedStatus || !(NEXT[q.status] ?? []).includes(d.decision)) return fail("STATE_CONFLICT", { status: q.status });
    const erase = q.kind === "ERASE" && d.decision === "DONE";
    if (erase && !q.passengerId) return fail("VALIDATION", { reason: "PARTY_ERASE_NOT_SUPPORTED" });
    let deleted: string[] = [];
    let bookingId: string | null = null;
    if (erase && q.passengerId) {
      const P = await loadPax(db, s.tenantId, s.unitId, q.passengerId);
      if (P && !isPurgedAll(parseAnswers(P.answers))) {
        bookingId = P.bookingId;
        const docs = await liveDocs(db, s, P.id);
        const del = await deleteFiles(s, docs, deps?.del ? { del: deps.del } : undefined);
        if (del.failed) return fail("BUSY", { reason: "STORAGE_DELETE_FAILED" });
        deleted = del.ok;
      }
    }
    const who: Who = { kind: "USER", userId: s.userId };
    const doneAt = d.decision === "IN_PROGRESS" ? null : s.now;
    return inTx(s, async (tx) => {
      const cas = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripPdpaRequest" SET "status" = ${d.decision}, "doneAt" = ${doneAt ? iso(doneAt) : null}::timestamp, "updatedAt" = ${iso(s.now)}::timestamp
        WHERE "id" = ${q.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "status" = ${d.expectedStatus} RETURNING "id"`;
      if (cas.length !== 1) return abort("STATE_CONFLICT");
      if (erase && q.passengerId) {
        await lockKey(tx, `t08.doc:${q.passengerId}`);
        if (bookingId) await markDocsDeletedInTx(tx, s, who, deleted, bookingId, s.now, "ERASE_REQUEST");
        await erasePassengerInTx(tx, s, who, q.passengerId, s.now, deleted);
      }
      await auditTx(tx, s, who, A.requestResolved, "TripPdpaRequest", q.id, { requestId: q.id, kind: q.kind, from: q.status, to: d.decision, reasonCode: d.reasonCode ?? null, passengerId: q.passengerId });
      return { requestId: q.id, status: d.decision };
    });
  });
}

/** ส่งออกข้อมูลผู้เดินทาง (ม.30) — ต้องมีทั้ง reveal และ health (แคบ) + trips.pdpa.manage · audit exported */
export async function exportPassengerData(ctx: unknown, input: unknown): Promise<SellResult<Record<string, unknown>>> {
  return safely("exportPassengerData", ctx, async () => {
    const p = exportSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const s = await staffGate(ctx, null);
    if (isFailure(s)) return s;
    if (!sensitiveOk(s, "trips.passenger.reveal") || !sensitiveOk(s, "trips.passenger.health")) return SENSITIVE();
    if (!evaluate(s.m, { module: "trips", action: P_MANAGE, unitId: s.unitId })) return fail("FORBIDDEN");
    const db = ro(s.tenantId);
    const P = await loadPax(db, s.tenantId, s.unitId, p.data.passengerId);
    if (!P) return NF();
    const a = parseAnswers(P.answers);
    const doc = openDocNumber(s, P.id, P.docNumberEnc);
    const health = openHealth(s, P.id, a.health);
    if (doc === "LOCKED" || health === "LOCKED") return fail("BUSY", { reason: "SECRET_KEY_MISSING" });
    const docs = await db.$queryRaw<DocRow[]>`
      SELECT "id", "passengerId", "kind", "fileId", "retainUntil", "deletedAt", "createdAt" FROM "TripDocument"
      WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "passengerId" = ${P.id} ORDER BY "createdAt", "id"`;
    const v = valuesOf(P, a);
    const w = parseWaiver(P.waiverEvidence);
    const g = parseGuardian(P.guardianConsent);
    const r = await inTx(s, (tx) => auditTx(tx, s, { kind: "USER", userId: s.userId }, A.exported, "TripPassenger", P.id, { passengerId: P.id, purpose: p.data.purpose }));
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        passengerId: P.id,
        bookingId: P.bookingId,
        exportedAt: iso(s.now),
        values: { ...v, docNumber: doc },
        isMinor: P.isMinor,
        health: a.health ? { status: a.health.status, ...(a.health.status === "PROVIDED" ? { consent: a.health.consent, answers: health } : { at: a.health.at }) } : null,
        guardian: g,
        waiver: w.kind === "NONE" ? null : w.e,
        waiverSignedAt: P.waiverSignedAt ? iso(new Date(P.waiverSignedAt)) : null,
        formStatus: P.formStatus,
        documents: docs.map((x) => ({ id: x.id, kind: x.kind, uploadedAt: iso(new Date(x.createdAt)), retainUntil: iso(new Date(x.retainUntil)), deletedAt: x.deletedAt ? iso(new Date(x.deletedAt)) : null })),
        purged: a.purged ?? null,
      },
    };
  });
}

// ═══════════════════════ ลบตามอายุต่อหน่วย (§7 §8) ═══════════════════════
export type PurgeFailure = { tenantId: string; unitId: string; code: string };
export type PurgeUnitResult = { documents: number; passengerStages: number; bookers: number; more: boolean; failed: PurgeFailure[] };
type DocCand = { id: string; passengerId: string; kind: string; fileId: string; answers: unknown; endsAt: Date; bookingId: string };
type BookerCand = { id: string; updatedAt: Date; holdExp: Date | null };

/**
 * ต่อหน่วย: (1) ผู้จองของการจอง EXPIRED ไม่มีเงินเข้า (X22) → ลบทั้งคนของผู้เดินทาง (2) ชั้นข้อมูลในแถวผู้เดินทาง (สุขภาพ · เลขเอกสาร · หลักฐานลงนาม · ผู้ปกครอง)
 * (3) ไฟล์ครบกำหนด — แต่ละขั้นจำกัด `limit` ชิ้น · กำหนดคิดใหม่ด้วยค่าตั้ง ณ ตอนลบ + รอบปัจจุบันของการจอง (ช้ากว่าที่เก็บ ⇒ เลื่อน retainUntil แล้วข้าม)
 */
export async function purgeTripPersonalDataForUnit(i: { tenantId: string; unitId: string; now: Date; limit?: number; storage?: { del?: DeleteDeps["del"] } }): Promise<PurgeUnitResult> {
  const out: PurgeUnitResult = { documents: 0, passengerStages: 0, bookers: 0, more: false, failed: [] };
  const failAdd = (code: string) => out.failed.push({ tenantId: i.tenantId, unitId: i.unitId, code });
  const limit = Number.isInteger(i.limit) && (i.limit ?? 0) >= 1 ? Math.min(200, i.limit ?? 200) : 200;
  const now = i.now;
  const unit = await tenantDb({ tenantId: i.tenantId }).businessUnit.findFirst({ where: { id: i.unitId }, select: { id: true, type: true, settings: true } });
  if (!unit || unit.type !== "TRIPS") {
    failAdd("UNIT_NOT_TRIPS");
    return out;
  }
  const st = unit.settings !== null && typeof unit.settings === "object" && !Array.isArray(unit.settings) ? (unit.settings as Record<string, unknown>) : {};
  const u: Unit = { tenantId: i.tenantId, unitId: unit.id, tz: normalizeTimezone(st.timezone) };
  const retention = await loadRetention(u, now);
  if (!retention) {
    failAdd("SETTINGS_INVALID");
    return out;
  }
  const ab = await resolveSettings({ tenantId: u.tenantId }, [K_ABANDONED], { unitId: u.unitId }, now);
  const abDays = ab[K_ABANDONED]?.value;
  const del = i.storage?.del ? { del: i.storage.del } : undefined;
  const run = async (code: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      failAdd(code);
    }
  };

  // ── (1) ผู้จองของการจองหมดเวลาที่ไม่มีเงินเข้า (CC §D.4 ข้อ 5 · X22) ──
  if (typeof abDays === "number" && Number.isInteger(abDays) && abDays >= 1 && abDays <= 3650) {
    await run("BOOKER_PURGE_FAILED", async () => {
      const cut = new Date(now.getTime() - Math.max(0, abDays - 2) * DAY_MS);
      const cands = await ro(u.tenantId).$queryRaw<BookerCand[]>`
        SELECT b."id", b."updatedAt", (SELECT max(h."expiresAt") FROM "TripHold" h WHERE h."bookingId" = b."id" AND h."tenantId" = b."tenantId") AS "holdExp"
        FROM "TripBooking" b
        WHERE b."tenantId" = ${u.tenantId} AND b."unitId" = ${u.unitId} AND b."status" = 'EXPIRED' AND b."piiPurgedAt" IS NULL AND b."paidSatang" = 0
          AND NOT EXISTS (SELECT 1 FROM "TripMoneyEvent" m WHERE m."bookingId" = b."id" AND m."tenantId" = b."tenantId")
          AND COALESCE((SELECT max(h2."expiresAt") FROM "TripHold" h2 WHERE h2."bookingId" = b."id" AND h2."tenantId" = b."tenantId"), b."updatedAt") <= ${iso(cut)}::timestamp
        ORDER BY b."id" LIMIT 2000`;
      const due = cands.filter((c) => now.getTime() >= purgeInstant(addDaysYmd(localYmdOf(new Date(c.holdExp ?? c.updatedAt), u.tz), abDays), u.tz).getTime());
      if (due.length > limit) out.more = true;
      for (const c of due.slice(0, limit)) {
        const r = await inTx(u, async (tx) => {
          const bk = await tx.$queryRaw<{ id: string; status: string; paidSatang: number; piiPurgedAt: Date | null; version: number }[]>`
            SELECT "id", "status", "paidSatang", "piiPurgedAt", "version" FROM "TripBooking" WHERE "id" = ${c.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} FOR UPDATE`;
          const b = bk[0];
          if (!b || b.status !== "EXPIRED" || b.piiPurgedAt || b.paidSatang !== 0) return 0;
          const blocked = await tx.$queryRaw<{ x: number }[]>`
            SELECT 1 AS "x" FROM "TripMoneyEvent" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId}
            UNION ALL SELECT 1 AS "x" FROM "TripRefundRequest" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId} AND "status" = ANY(${OPEN_REFUND}::text[]) LIMIT 1`;
          if (blocked.length) return 0;
          const cas = await tx.$queryRaw<{ id: string }[]>`
            UPDATE "TripBooking" SET "bookerPartyId" = NULL, "piiPurgedAt" = ${iso(now)}::timestamp, "version" = "version" + 1, "updatedAt" = ${iso(now)}::timestamp
            WHERE "id" = ${b.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "status" = 'EXPIRED' AND "piiPurgedAt" IS NULL AND "paidSatang" = 0
              AND "version" = ${b.version} AND NOT EXISTS (SELECT 1 FROM "TripMoneyEvent" m WHERE m."bookingId" = ${b.id} AND m."tenantId" = ${u.tenantId})
            RETURNING "id"`;
          if (cas.length !== 1) return 0;
          const pax = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "TripPassenger" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} ORDER BY "id"`;
          for (const x of pax) await erasePassengerInTx(tx, u, SYSTEM, x.id, now, []);
          await auditTx(tx, u, SYSTEM, A.bookingPiiPurged, "TripBooking", b.id, { bookingId: b.id, passengers: pax.length });
          await emitTx(tx, u, [purgedEvt(`booking:${b.id}`, b.id, null, "BOOKER")]);
          return 1;
        });
        if (r.ok) out.bookers += r.value;
        else failAdd(r.code === "STATE_CONFLICT" ? "BOOKER_STATE_CONFLICT" : "BOOKER_PURGE_FAILED");
      }
    });
  } else failAdd("SETTINGS_INVALID");

  // ── (2) ชั้นข้อมูลในแถวผู้เดินทาง ──
  await run("PASSENGER_PURGE_FAILED", async () => {
    const cands = await ro(u.tenantId).$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "TripPassenger" WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "retainUntil" <= ${iso(now)}::timestamp
      ORDER BY "retainUntil", "id" LIMIT ${limit + 1}`;
    if (cands.length > limit) out.more = true;
    for (const c of cands.slice(0, limit)) {
      const r = await inTx(u, (tx) => purgeStagesInTx(tx, u, c.id, now, retention));
      if (r.ok) out.passengerStages += r.value;
      else failAdd(r.code === "STATE_CONFLICT" ? "PASSENGER_STATE_CONFLICT" : "PASSENGER_PURGE_FAILED");
    }
  });

  // ── (3) ไฟล์ครบกำหนด ──
  await run("DOCUMENT_PURGE_FAILED", async () => {
    const cands = await ro(u.tenantId).$queryRaw<DocCand[]>`
      SELECT doc."id", doc."passengerId", doc."kind", doc."fileId", p."answers", d."endsAt", b."id" AS "bookingId"
      FROM "TripDocument" doc
      JOIN "TripPassenger" p ON p."id" = doc."passengerId" AND p."tenantId" = doc."tenantId" AND p."unitId" = doc."unitId"
      JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId"
      JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
      WHERE doc."tenantId" = ${u.tenantId} AND doc."unitId" = ${u.unitId} AND doc."deletedAt" IS NULL AND doc."retainUntil" <= ${iso(now)}::timestamp
      ORDER BY doc."retainUntil", doc."id" LIMIT ${limit + 1}`;
    if (cands.length > limit) out.more = true;
    for (const c of cands.slice(0, limit)) {
      const due = isPurgedAll(parseAnswers(c.answers)) ? now : docRetainUntil(c.kind, localYmdOf(new Date(c.endsAt), u.tz), u.tz, retention);
      if (due.getTime() > now.getTime()) {
        await inTx(u, (tx) => tx.$executeRaw`
          UPDATE "TripDocument" SET "retainUntil" = ${iso(due)}::timestamp, "updatedAt" = ${iso(now)}::timestamp
          WHERE "id" = ${c.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "deletedAt" IS NULL`);
        continue;
      }
      const d = await deleteFiles(u, [{ id: c.id, passengerId: c.passengerId, kind: c.kind, fileId: c.fileId, retainUntil: due, deletedAt: null, createdAt: now }], del);
      if (d.failed) {
        failAdd("STORAGE_DELETE_FAILED");
        continue;
      }
      const r = await inTx(u, (tx) => markDocsDeletedInTx(tx, u, SYSTEM, [c.id], c.bookingId, now, "RETENTION"));
      if (r.ok) out.documents += r.value.length;
      else failAdd("DOCUMENT_PURGE_FAILED");
    }
  });
  return out;
}

/** ชั้นที่ครบกำหนดของแถวหนึ่ง (ใต้ล็อกแถว · CAS rev) — คืนจำนวนชั้นที่ลบ · ไม่มีชั้นครบ ⇒ เลื่อน retainUntil เท่านั้น */
async function purgeStagesInTx(tx: Prisma.TransactionClient, u: Unit, passengerId: string, now: Date, retention: Retention): Promise<number> {
  const L = await loadPax(tx, u.tenantId, u.unitId, passengerId, "UPDATE");
  if (!L) return 0;
  const a = parseAnswers(L.answers);
  const E = endYmdOf(L, u.tz);
  if (isPurgedAll(a)) {
    await tx.$executeRaw`UPDATE "TripPassenger" SET "retainUntil" = NULL WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "retainUntil" IS NOT NULL`;
    return 0;
  }
  const present = presentStages(a, { docNumberEnc: L.docNumberEnc, waiverEvidence: L.waiverEvidence, guardianConsent: L.guardianConsent });
  const dueStages = present.filter((s) => {
    const d = stageDue(E, retention[PAX_STAGE_DAYS[s]], u.tz);
    return d !== null && d.getTime() <= now.getTime();
  });
  const remaining = present.filter((s) => !dueStages.includes(s));
  const nextRetain = paxRetainUntil(remaining, E, u.tz, retention);
  if (!dueStages.length) {
    await tx.$executeRaw`
      UPDATE "TripPassenger" SET "retainUntil" = ${nextRetain ? iso(nextRetain) : null}::timestamp
      WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}`;
    return 0;
  }
  const has = (s: PaxStage) => dueStages.includes(s);
  const next: Answers = { ...a, rev: a.rev + 1, purged: { at: iso(now), stages: [...new Set([...(a.purged?.stages ?? []), ...dueStages])] } };
  if (has("HEALTH_ANSWERS")) next.health = { status: "PURGED", at: iso(now) };
  const w = parseWaiver(L.waiverEvidence);
  const waiver = has("WAIVER_EVIDENCE") && w.kind === "FULL" ? purgedWaiverOf(w.e) : L.waiverEvidence;
  const keepDoc = !has("DOC_NUMBER");
  const keepGuardian = !has("GUARDIAN_CONSENT");
  const done = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripPassenger" SET "answers" = ${JSON.stringify(next)}::jsonb,
      "docNumberEnc" = CASE WHEN ${keepDoc}::boolean THEN "docNumberEnc" ELSE NULL END,
      "guardianConsent" = CASE WHEN ${keepGuardian}::boolean THEN "guardianConsent" ELSE NULL END,
      "waiverEvidence" = ${waiver === null || waiver === undefined ? null : JSON.stringify(waiver)}::jsonb,
      "retainUntil" = ${nextRetain ? iso(nextRetain) : null}::timestamp, "updatedAt" = ${iso(now)}::timestamp
    WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}
    RETURNING "id"`;
  if (done.length !== 1) return abort("STATE_CONFLICT", { rev: a.rev });
  for (const s of dueStages) {
    await auditTx(tx, u, SYSTEM, A.purged, "TripPassenger", L.id, { passengerId: L.id, stage: s });
    await emitTx(tx, u, [purgedEvt(`${L.id}:${s}`, L.bookingId, L.id, s)]);
  }
  return dueStages.length;
}
// ── /T0.8 pdpa ──
