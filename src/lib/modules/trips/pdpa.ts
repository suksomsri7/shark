// ─────────────────────────────────────────────────────────────
// trips/pdpa.ts — ลบตามอายุต่อหน่วย (G5) · ลบทั้งคน · ลบผู้จองของการจองหมดเวลาที่ไม่มีเงินเข้า · คิวคำขอเจ้าของข้อมูล · ส่งออก · RUN TRIPS T0.8
// ใบสั่ง ledger/trips-briefs/T0.8.md §7 §8 §11.1 (§17 มติผู้คุมชนะ · ข้อ 5 = ข้ามการจองที่มีเงินรับ/คำขอคืนเงินค้าง ตรวจใต้ล็อกแถวการจอง ·
//   รอบแก้ r1 P2 P8 P9 · r3 X2 X3 X4 X5d)
//
// 🔴 tenantDb เท่านั้น · ทุกคิวรีมี "tenantId" + "unitId" · ค่าตั้งอ่านครั้งเดียวต่อหน่วยนอก tx · ไม่แตะร้าน/หน่วยอื่น
// 🔴 ไม่มี DELETE แถว Trip* — การลบข้อมูล = ล้างคอลัมน์ / ตั้ง deletedAt · ไฟล์ = deleteFileAsset (วัตถุ + แถว FileAsset) นอก tx เท่านั้น
//    ลบตามอายุ: วัตถุก่อน แล้วค่อยทำเครื่องหมาย (ล้ม ⇒ ไม่ตั้ง deletedAt)
//    ลบทั้งคน (คำขอ ERASE / ผู้จองหมดเวลา · r3 X2): ล้างแถว + ทำเครื่องหมายไฟล์ใน tx (อ่านผ่านบริการ/route ไม่ได้ทันที) → commit → ลบวัตถุ →
//    "เสร็จ" (คำขอ DONE · event PASSENGER_ALL/BOOKER/trips.document.purged) ออกเมื่อวัตถุชิ้นสุดท้ายถูกยืนยันว่าลบแล้วเท่านั้น
//    วัตถุค้าง ⇒ งานลบลองใหม่ทุกรอบไม่จำกัดเวลา + logOps ERROR เมื่อค้างเกิน PENDING_ALERT_MS
// 🔴 ทุกการลบ = CAS ที่มีเงื่อนไขค่าเดิม (deletedAt IS NULL · rev · status · objDel) ⇒ รันซ้อนกันได้ · แต่ละชิ้นถูกนับ/ออก event ครั้งเดียว · รอบที่สอง = 0
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { evaluate } from "@/lib/core/rbac";
import type { SellResult } from "@/lib/core/sellable";
import { resolveSettings } from "@/lib/core/settings";
import type { DeleteDeps } from "@/lib/storage/service";
import { normalizeTimezone } from "./departures-core";
import {
  A,
  KEY_MISSING,
  NF,
  SENSITIVE,
  abort,
  auditTx,
  deleteAndConfirm,
  deleteObjects,
  docRetainUntil,
  emitTx,
  endYmdOf,
  fail,
  inTx,
  invalid,
  isFailure,
  loadPax,
  loadRetention,
  localYmdOf,
  lockKey,
  mac,
  markDocsDeletedInTx,
  openDocNumber,
  openHealth,
  paxRetainUntil,
  purgeInstant,
  purgedEvt,
  ro,
  safely,
  sensitiveOk,
  serverKeyOk,
  stageDue,
  staffGate,
  valuesOf,
  type DocRow,
  type Unit,
  type Who,
} from "./passengers";
import {
  PAX_STAGE_DAYS,
  PURPOSES,
  addDaysYmd,
  isPurgedAll,
  isRealYmd,
  parseAnswers,
  parseGuardian,
  parseWaiver,
  presentStages,
  purgedWaiverOf,
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
/** r1 P8: ต่อหน่วยต่อขั้นต่อรอบงานไม่เกิน 2,000 ชิ้น (ชุดละ ≤ 200) — `limit` ของผู้เรียก = เพดานต่อรอบ */
const BATCH = 200;
const PER_RUN_MAX = 2000;
/**
 * r3 X2: วัตถุที่ทำเครื่องหมายลบแล้วแต่ยังลบไม่สำเร็จนานเกินนี้ ⇒ logOps ERROR (ไม่มีข้อมูลบุคคล) ทุกรอบงานจนกว่าจะลบได้
 * ไม่มีคีย์ค่าตั้งที่ตรงความหมาย ⇒ ค่าคงที่ (ต้องเพิ่มในหมวดค่าคงที่ของใบสั่ง)
 */
export const PENDING_ALERT_MS = 24 * 60 * 60 * 1000;
/** เงื่อนไข SQL "ไฟล์ที่ทำเครื่องหมายลบแล้ว แต่ยังไม่ยืนยันว่าวัตถุหาย" */
const PENDING_DOC = Prisma.sql`"deletedAt" IS NOT NULL AND COALESCE(("consent"->>'objDel')::boolean, false) = false`;

// ═══════════════════════ ลบทั้งคน (§8 แถว "ลบทั้งคน") ═══════════════════════
/**
 * ในธุรกรรมของผู้เรียก: ล็อกแถวผู้เดินทาง → CAS rev → ล้างทุกช่องตาม §8 (+ partyId: ไม่อยู่ในรายการ "ที่เหลือ" ของ §8 ⇒ ล้าง · r1 P9) →
 * ไฟล์ที่ยังไม่ถูกลบ ⇒ ทำเครื่องหมาย deletedAt (บริการ/route เปิดไม่ได้ทันที) · คืนไฟล์ที่ต้องลบวัตถุหลัง commit
 * event PASSENGER_ALL ออกใน finishErasure เมื่อวัตถุหมดแล้วเท่านั้น (r3 X2)
 * คงไว้: id · bookingId · itemId · isMinor · formStatus · waiverSignedAt · checkinAt · createdAt
 */
async function erasePassengerInTx(tx: Prisma.TransactionClient, u: Unit, who: Who, passengerId: string, now: Date): Promise<{ id: string; fileId: string }[]> {
  const L = await loadPax(tx, u.tenantId, u.unitId, passengerId, "UPDATE");
  if (!L) return [];
  const a = parseAnswers(L.answers);
  if (isPurgedAll(a)) return [];
  const next: Answers = { v: 1, rev: a.rev + 1, fields: {}, purged: { at: iso(now), stages: ["ALL"] } };
  const done = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "TripPassenger" SET "fullName" = '', "nationality" = NULL, "dob" = NULL, "sex" = NULL, "docType" = NULL, "docNumberEnc" = NULL, "docLast4" = NULL,
      "docExpiry" = NULL, "phone" = NULL, "birthPlace" = NULL, "certLevel" = NULL, "diveCount" = NULL, "lastDiveAt" = NULL, "diver" = NULL, "partyId" = NULL,
      "guardianConsent" = NULL, "waiverEvidence" = NULL, "retainUntil" = NULL, "answers" = ${JSON.stringify(next)}::jsonb, "updatedAt" = ${iso(now)}::timestamp
    WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}
    RETURNING "id"`;
  if (done.length !== 1) return abort("STATE_CONFLICT", { rev: a.rev });
  const live = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "TripDocument" WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${L.id} AND "deletedAt" IS NULL`;
  const marked = await markDocsDeletedInTx(tx, u, who, live.map((d) => d.id), L.bookingId, now, "ERASE", false);
  await auditTx(tx, u, who, A.purged, "TripPassenger", L.id, { passengerId: L.id, stage: "ALL" });
  return marked.map((m) => ({ id: m.id, fileId: m.fileId }));
}
/** ไฟล์ที่ทำเครื่องหมายแล้วแต่วัตถุยังไม่ยืนยันของผู้เดินทางคนหนึ่ง (ลองลบซ้ำได้ — deleteFileAsset ซ้ำ = ok) */
async function pendingDocsOf(db: Prisma.TransactionClient, u: Unit, passengerId: string): Promise<{ id: string; fileId: string }[]> {
  return db.$queryRaw<{ id: string; fileId: string }[]>`
    SELECT "id", "fileId" FROM "TripDocument" WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${passengerId} AND ${PENDING_DOC}`;
}
/**
 * r3 X2: ปิดงานลบทั้งคนเมื่อวัตถุหมด — ผู้เดินทางถูกลบทั้งคน และไม่มีไฟล์ค้าง ⇒ event PASSENGER_ALL · คำขอ ERASE ที่ IN_PROGRESS ของคนนี้ ⇒ DONE (+ audit) ·
 * การจองที่ลบผู้จองแล้วและผู้เดินทางทุกคนเสร็จ ⇒ event BOOKER — ซ้ำได้ (คีย์ outbox · CAS สถานะ) · คืน true ถ้าคนนี้เสร็จ
 */
async function finishErasure(u: Unit, who: Who, passengerId: string, now: Date): Promise<boolean> {
  const r = await inTx(u, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; bookingId: string; answers: unknown }[]>`
      SELECT "id", "bookingId", "answers" FROM "TripPassenger" WHERE "id" = ${passengerId} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} FOR UPDATE`;
    const p = rows[0];
    if (!p || !isPurgedAll(parseAnswers(p.answers))) return false;
    if ((await pendingDocsOf(tx, u, p.id)).length) return false;
    await emitTx(tx, u, [purgedEvt(`${p.id}:ALL`, p.bookingId, p.id, "PASSENGER_ALL")]);
    const reqs = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "TripPdpaRequest" SET "status" = 'DONE', "doneAt" = ${iso(now)}::timestamp, "updatedAt" = ${iso(now)}::timestamp
      WHERE "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "passengerId" = ${p.id} AND "kind" = 'ERASE' AND "status" = 'IN_PROGRESS' RETURNING "id"`;
    for (const q of reqs) await auditTx(tx, u, who, A.requestResolved, "TripPdpaRequest", q.id, { requestId: q.id, kind: "ERASE", from: "IN_PROGRESS", to: "DONE", reasonCode: null, passengerId: p.id });
    const bk = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT (b."piiPurgedAt" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "TripPassenger" x WHERE x."bookingId" = b."id" AND x."tenantId" = b."tenantId"
          AND (NOT (COALESCE(x."answers"->'purged'->'stages', '[]'::jsonb) ? 'ALL')
            OR EXISTS (SELECT 1 FROM "TripDocument" d WHERE d."passengerId" = x."id" AND d."tenantId" = x."tenantId" AND d."deletedAt" IS NOT NULL
                       AND COALESCE((d."consent"->>'objDel')::boolean, false) = false))
      )) AS "ok"
      FROM "TripBooking" b WHERE b."id" = ${p.bookingId} AND b."tenantId" = ${u.tenantId} AND b."unitId" = ${u.unitId}`;
    if (bk[0]?.ok === true) await emitTx(tx, u, [purgedEvt(`booking:${p.bookingId}`, p.bookingId, null, "BOOKER")]);
    return true;
  });
  return r.ok && r.value;
}

// ═══════════════════════ คิวคำขอเจ้าของข้อมูล (§11.1 · L-48 · T64) ═══════════════════════
const KINDS = ["ACCESS", "RECTIFY", "ERASE", "OBJECT", "PORTABILITY"] as const;
const STATUSES = ["RECEIVED", "IN_PROGRESS", "DONE", "REJECTED"] as const;
const ID = z.string().trim().min(1).max(128);
const IDEM_KEY = z.string().regex(/^[A-Za-z0-9_-]{8,90}$/);
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
/** วันรับคำขอ: ไม่เกินวันนี้ (เวลาหน่วย) + 1 วัน (เผื่อนาฬิกา) · ไม่ก่อนวันที่มีข้อมูล (สร้างการจอง) และไม่ก่อน 2000-01-01 (r1 P9) */
const RECEIVED_SKEW_DAYS = 1;

type ReqRow = { id: string; kind: string; status: string; passengerId: string | null; partyId: string | null; dueAt: Date; doneAt: Date | null };
/** แถว audit กันซ้ำของการบันทึก/รวมคำขอ — ดัชนี AuditLog_action_idx + tenantId (targetId ยังไม่รู้ก่อนบันทึก) */
async function requestByKey(db: Prisma.TransactionClient, tenantId: string, keyHash: string): Promise<Record<string, unknown> | null> {
  const rows = await db.$queryRaw<{ after: unknown }[]>`
    SELECT "after" FROM "AuditLog" WHERE "action" IN (${A.requestRecorded}, ${A.requestMerged}) AND "tenantId" = ${tenantId} AND "after"->>'keyHash' = ${keyHash} LIMIT 1`;
  const a = rows[0]?.after;
  return a !== null && typeof a === "object" && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
}

type RecordOut = { requestId: string; status: string; dueAt: string; replayed?: true; merged?: true };
/**
 * บันทึกคำขอ — คำขอ ERASE ที่ยังเปิดของเจ้าของข้อมูลเดียวกันมีอยู่แล้ว ⇒ รวม (r1 P9 · r3 X5d): ใช้กำหนดที่เร็วกว่า (dueAt = LEAST) และเขียน audit
 * `trips.pdpa.request_merged` (keyHash · bodyHash ⇒ ส่งซ้ำได้ผลเดิม · คีย์เดิมเนื้อต่าง = IDEMPOTENCY_CONFLICT)
 */
export async function recordPdpaRequest(ctx: unknown, input: unknown): Promise<SellResult<RecordOut>> {
  return safely("recordPdpaRequest", ctx, async () => {
    const p = recordSchema.safeParse(input);
    if (!p.success) return invalid(p.error);
    const d = p.data;
    if (!d.passengerId && !d.partyId) return fail("VALIDATION", { fields: ["passengerId", "partyId"] });
    if (!serverKeyOk()) return KEY_MISSING();
    const s = await staffGate(ctx, P_MANAGE);
    if (isFailure(s)) return s;
    const db = ro(s.tenantId);
    let earliest: Date | null = null;
    if (d.passengerId) {
      const P = await loadPax(db, s.tenantId, s.unitId, d.passengerId);
      if (!P) return NF();
      earliest = new Date(P.bookingCreatedAt);
    }
    if (d.partyId) {
      const hit = await db.$queryRaw<{ at: Date | null }[]>`
        SELECT min(x."at") AS "at" FROM (
          SELECT "createdAt" AS "at" FROM "TripBooking" WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "bookerPartyId" = ${d.partyId}
          UNION ALL SELECT "createdAt" AS "at" FROM "TripPassenger" WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "partyId" = ${d.partyId}) x`;
      const at = hit[0]?.at;
      if (!at) return NF();
      if (!earliest || new Date(at).getTime() < earliest.getTime()) earliest = new Date(at);
    }
    const r = await resolveSettings({ tenantId: s.tenantId }, [K_DEADLINES], { unitId: s.unitId }, s.now);
    const dl = DEADLINES.safeParse(r[K_DEADLINES]?.value);
    if (!dl.success) return fail("VALIDATION", { reason: "SETTINGS_INVALID", key: K_DEADLINES });
    const today = localYmdOf(s.now, s.tz);
    const receivedAt = d.receivedAt ?? today;
    const lower = earliest ? localYmdOf(earliest, s.tz) : today;
    if (receivedAt > addDaysYmd(today, RECEIVED_SKEW_DAYS) || receivedAt < lower || receivedAt < "2000-01-01") return fail("VALIDATION", { reason: "RECEIVED_AT_OUT_OF_RANGE", fields: ["receivedAt"] });
    const dueAt = purgeInstant(addDaysYmd(receivedAt, d.kind === "ERASE" ? dl.data.deletionDays : dl.data.accessDays), s.tz);
    const keyHash = mac(["trips.t08.key", `st:${s.userId}:pdpa`, d.idempotencyKey]);
    const bodyHash = mac(["trips.pdpa.request.v1", s.unitId, d.kind, d.passengerId ?? null, d.partyId ?? null, receivedAt]);
    const replay = (x: Record<string, unknown>): SellResult<RecordOut> =>
      x.bodyHash === bodyHash
        ? { ok: true, value: { requestId: String(x.requestId), status: String(x.status ?? "RECEIVED"), dueAt: String(x.dueAt), replayed: true, ...(x.merged === true ? { merged: true as const } : {}) } }
        : fail("IDEMPOTENCY_CONFLICT");
    const pre = await requestByKey(db, s.tenantId, keyHash);
    if (pre) return replay(pre);
    const subject = d.passengerId ? `pax:${d.passengerId}` : `party:${d.partyId ?? ""}`;
    const who: Who = { kind: "USER", userId: s.userId };
    const out = await inTx(s, async (tx): Promise<{ again: Record<string, unknown> | null; value: RecordOut | null }> => {
      await lockKey(tx, `t08.pdpasub:${s.unitId}:${subject}`);
      await lockKey(tx, `t08.pdpareq:${keyHash}`);
      const again = await requestByKey(tx, s.tenantId, keyHash);
      if (again) return { again, value: null };
      if (d.kind === "ERASE") {
        const merged = await tx.$queryRaw<{ id: string; status: string; dueAt: Date }[]>`
          UPDATE "TripPdpaRequest" SET "dueAt" = LEAST("dueAt", ${iso(dueAt)}::timestamp), "updatedAt" = ${iso(s.now)}::timestamp
          WHERE "id" = (SELECT "id" FROM "TripPdpaRequest"
            WHERE "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "kind" = 'ERASE' AND "status" IN ('RECEIVED', 'IN_PROGRESS')
              AND ${d.passengerId ? Prisma.sql`"passengerId" = ${d.passengerId}` : Prisma.sql`"passengerId" IS NULL AND "partyId" = ${d.partyId ?? ""}`}
            ORDER BY "createdAt", "id" LIMIT 1)
          RETURNING "id", "status", "dueAt"`;
        const m = merged[0];
        if (m) {
          const value: RecordOut = { requestId: m.id, status: m.status, dueAt: iso(new Date(m.dueAt)), merged: true };
          await auditTx(tx, s, who, A.requestMerged, "TripPdpaRequest", m.id, { requestId: m.id, kind: d.kind, status: m.status, dueAt: value.dueAt, merged: true, keyHash, bodyHash });
          return { again: null, value };
        }
      }
      const row = await tx.tripPdpaRequest.create({
        data: { tenantId: s.tenantId, unitId: s.unitId, passengerId: d.passengerId ?? null, partyId: d.partyId ?? null, kind: d.kind, status: "RECEIVED", dueAt },
        select: { id: true },
      });
      await auditTx(tx, s, who, A.requestRecorded, "TripPdpaRequest", row.id, {
        requestId: row.id,
        kind: d.kind,
        passengerId: d.passengerId ?? null,
        partyId: d.partyId ?? null,
        status: "RECEIVED",
        dueAt: iso(dueAt),
        keyHash,
        bodyHash,
      });
      return { again: null, value: { requestId: row.id, status: "RECEIVED", dueAt: iso(dueAt) } };
    });
    if (!out.ok) return out;
    if (out.value.again) return replay(out.value.again);
    return out.value.value ? { ok: true, value: out.value.value } : fail("BUSY");
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
type ResolveOut = { requestId: string; status: string; pendingObjects?: number };
/**
 * ปิด/เดินคำขอ — CAS status
 * ERASE + DONE + passengerId (r3 X2): tx1 = CAS เป็น IN_PROGRESS + ล็อก t08.doc + ลบทั้งคน (ทำเครื่องหมายไฟล์) → commit → ลบวัตถุ (รวมของที่ค้างจากครั้งก่อน) →
 *   ทุกชิ้นยืนยันแล้ว ⇒ finishErasure (DONE + event) · ยังค้าง ⇒ คืน IN_PROGRESS + pendingObjects (งานลบลองใหม่ไม่จำกัดเวลา แล้วปิดให้เอง)
 * ERASE + DONE ที่มีแค่ partyId ⇒ VALIDATION PARTY_ERASE_NOT_SUPPORTED · ปฏิเสธ (REJECTED) หลังลบไปแล้ว ⇒ STATE_CONFLICT
 */
export async function resolvePdpaRequest(ctx: unknown, input: unknown, deps?: { del?: DeleteDeps["del"] }): Promise<SellResult<ResolveOut>> {
  return safely("resolvePdpaRequest", ctx, async (): Promise<SellResult<ResolveOut>> => {
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
    const who: Who = { kind: "USER", userId: s.userId };
    if (erase && q.passengerId) {
      const pid = q.passengerId;
      const r1 = await inTx(s, async (tx) => {
        const cas = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "TripPdpaRequest" SET "status" = 'IN_PROGRESS', "updatedAt" = ${iso(s.now)}::timestamp
          WHERE "id" = ${q.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "status" = ${d.expectedStatus} RETURNING "id"`;
        if (cas.length !== 1) return abort("STATE_CONFLICT");
        await lockKey(tx, `t08.doc:${pid}`);
        const marked = await erasePassengerInTx(tx, s, who, pid, s.now);
        const pend = await pendingDocsOf(tx, s, pid);
        await auditTx(tx, s, who, A.requestResolved, "TripPdpaRequest", q.id, { requestId: q.id, kind: q.kind, from: q.status, to: "IN_PROGRESS", reasonCode: null, passengerId: pid, erasing: true });
        const all = new Map<string, string>();
        for (const x of [...marked, ...pend]) all.set(x.id, x.fileId);
        return [...all.entries()].map(([id, fileId]) => ({ id, fileId }));
      });
      if (!r1.ok) return r1;
      const pending = await deleteAndConfirm(s, who, r1.value, deps?.del ? { del: deps.del } : undefined);
      if (pending === 0 && (await finishErasure(s, who, pid, s.now))) return { ok: true, value: { requestId: q.id, status: "DONE" } };
      return { ok: true, value: { requestId: q.id, status: "IN_PROGRESS", pendingObjects: pending } };
    }
    const doneAt = d.decision === "IN_PROGRESS" ? null : s.now;
    return inTx(s, async (tx): Promise<ResolveOut> => {
      const cas = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "TripPdpaRequest" SET "status" = ${d.decision}, "doneAt" = ${doneAt ? iso(doneAt) : null}::timestamp, "updatedAt" = ${iso(s.now)}::timestamp
        WHERE "id" = ${q.id} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "status" = ${d.expectedStatus} RETURNING "id"`;
      if (cas.length !== 1) return abort("STATE_CONFLICT");
      if (q.kind === "ERASE" && q.passengerId) {
        // การลบทั้งคนเริ่มไปแล้ว (DONE ที่ค้าง IN_PROGRESS) ⇒ ปฏิเสธ/ย้อนสถานะไม่ได้
        const pr = await tx.$queryRaw<{ answers: unknown }[]>`SELECT "answers" FROM "TripPassenger" WHERE "id" = ${q.passengerId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}`;
        if (pr[0] && isPurgedAll(parseAnswers(pr[0].answers))) return abort("STATE_CONFLICT", { reason: "PURGED" });
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

// ═══════════════════════ ลบตามอายุต่อหน่วย (§7 §8 · r1 P8 P9 · r3 X2 X3 X4) ═══════════════════════
export type PurgeFailure = { tenantId: string; unitId: string; code: string };
export type PurgeUnitResult = { documents: number; passengerStages: number; bookers: number; more: boolean; failed: PurgeFailure[] };
type DocCand = { id: string; passengerId: string; kind: string; fileId: string; answers: unknown; endsAt: Date; bookingId: string };
type BookerCand = { id: string; base: Date };

/** วันที่ (เวลาหน่วย) ของ instant ใน SQL — ใช้เทียบกับ retE ที่เก็บ (รอบเลื่อนเร็วขึ้น) */
const localDateSql = (col: Prisma.Sql, tz: string) => Prisma.sql`((((${col}) AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date)::text`;

/**
 * ต่อหน่วย (ลำดับ): (1) ผู้จองของการจอง EXPIRED ไม่มีเงินเข้า (X22) (2) ชั้นข้อมูลในแถวผู้เดินทาง (3) ไฟล์ครบกำหนด (4) วัตถุค้าง (ไม่จำกัดเวลา) (5) ปิดคำขอ ERASE ที่ค้าง
 * แต่ละขั้น: ชุดละ ≤ 200 วนต่อในรอบเดียวกันจนหมด / ถึงเพดาน `limit` (ค่าเริ่ม 2,000) / ถึง deadline (ตรวจทุกชิ้น · r3 X4) — ยังเหลือ ⇒ more
 * แถวที่ล้มในรอบนี้ถูกข้ามจนจบรอบ (ชุด skip) · deadline ของหน่วยแบ่งเป็น 5 ช่วงสะสม (ขั้นที่จบเร็วยกเวลาที่เหลือให้ขั้นถัดไป)
 * ผู้ที่ครบกำหนดเลือกด้วยเงื่อนไขใน SQL · กำหนดคิดใหม่ด้วยค่าตั้ง ณ ตอนลบ + รอบปัจจุบันของการจอง (ช้ากว่าที่เก็บ ⇒ เลื่อน · รอบเลื่อนเร็วขึ้น ⇒ ดึงเข้ามา)
 */
export async function purgeTripPersonalDataForUnit(i: { tenantId: string; unitId: string; now: Date; limit?: number; deadline?: number; storage?: { del?: DeleteDeps["del"] } }): Promise<PurgeUnitResult> {
  const out: PurgeUnitResult = { documents: 0, passengerStages: 0, bookers: 0, more: false, failed: [] };
  const failAdd = (code: string) => out.failed.push({ tenantId: i.tenantId, unitId: i.unitId, code });
  const cap = Number.isInteger(i.limit) && (i.limit ?? 0) >= 1 ? Math.min(PER_RUN_MAX, i.limit ?? PER_RUN_MAX) : PER_RUN_MAX;
  const now = i.now;
  const nowIso = iso(now);
  const start = Date.now();
  const slice = typeof i.deadline === "number" ? Math.max(0, i.deadline - start) : null;
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
  const db = ro(u.tenantId);
  const finishSet = new Set<string>();
  /** วนชุด (ขั้นที่ k ของ 5): ดึง n+1 (ข้าม id ที่ทำแล้ว/ล้มในรอบนี้) · ตรวจ deadline ทุกชิ้น · คืน true ถ้ายังเหลือ */
  const phase = async <T extends { id: string }>(k: number, code: string, fetch: (n: number, skip: string[]) => Promise<T[]>, work: (c: T) => Promise<void>): Promise<boolean> => {
    const phaseEnd = slice === null ? null : start + (slice * k) / 5;
    const late = () => phaseEnd !== null && Date.now() >= phaseEnd;
    let processed = 0;
    const skip: string[] = [];
    try {
      while (processed < cap) {
        const n = Math.min(BATCH, cap - processed);
        const rows = await fetch(n + 1, skip);
        for (const c of rows.slice(0, n)) {
          if (late()) return true;
          skip.push(c.id);
          processed++;
          await work(c);
        }
        if (rows.length <= n) return false;
      }
      return true;
    } catch {
      failAdd(code);
      return true;
    }
  };
  const skipSql = (col: string, skip: string[]) => (skip.length ? Prisma.sql`AND NOT (${Prisma.raw(col)} = ANY(${skip}::text[]))` : Prisma.empty);

  // ── (1) ผู้จองของการจองหมดเวลาที่ไม่มีเงินเข้า (CC §D.4 ข้อ 5 · X22) ──
  if (typeof abDays === "number" && Number.isInteger(abDays) && abDays >= 1 && abDays <= 3650) {
    const m1 = await phase<BookerCand>(
      1,
      "BOOKER_PURGE_FAILED",
      (n, skip) => db.$queryRaw<BookerCand[]>`
        SELECT x."id", x."base" FROM (
          SELECT b."id", COALESCE((SELECT max(h."expiresAt") FROM "TripHold" h WHERE h."bookingId" = b."id" AND h."tenantId" = b."tenantId"), b."updatedAt") AS "base"
          FROM "TripBooking" b
          WHERE b."tenantId" = ${u.tenantId} AND b."unitId" = ${u.unitId} AND b."status" = 'EXPIRED' AND b."piiPurgedAt" IS NULL AND b."paidSatang" = 0
            AND NOT EXISTS (SELECT 1 FROM "TripMoneyEvent" m WHERE m."bookingId" = b."id" AND m."tenantId" = b."tenantId") ${skipSql(`b."id"`, skip)}
        ) x
        WHERE (((((x."base" AT TIME ZONE 'UTC') AT TIME ZONE ${u.tz})::date + ${abDays + 1}::int)::timestamp AT TIME ZONE ${u.tz}) AT TIME ZONE 'UTC') <= ${nowIso}::timestamp
        ORDER BY x."id" LIMIT ${n}`,
      async (c) => {
        // ตรวจซ้ำด้วยตัวช่วยเขตเวลาของโมดูล (SQL เป็นตัวคัด · นี่คือนิยาม)
        if (now.getTime() < purgeInstant(addDaysYmd(localYmdOf(new Date(c.base), u.tz), abDays), u.tz).getTime()) return;
        const r = await inTx(u, async (tx) => {
          const none = { n: 0, docs: [] as { id: string; fileId: string }[], pax: [] as string[] };
          const bk = await tx.$queryRaw<{ id: string; status: string; paidSatang: number; piiPurgedAt: Date | null; version: number }[]>`
            SELECT "id", "status", "paidSatang", "piiPurgedAt", "version" FROM "TripBooking" WHERE "id" = ${c.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} FOR UPDATE`;
          const b = bk[0];
          if (!b || b.status !== "EXPIRED" || b.piiPurgedAt || b.paidSatang !== 0) return none;
          const blocked = await tx.$queryRaw<{ x: number }[]>`
            SELECT 1 AS "x" FROM "TripMoneyEvent" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId}
            UNION ALL SELECT 1 AS "x" FROM "TripRefundRequest" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId} AND "status" = ANY(${OPEN_REFUND}::text[]) LIMIT 1`;
          if (blocked.length) return none;
          const cas = await tx.$queryRaw<{ id: string }[]>`
            UPDATE "TripBooking" SET "bookerPartyId" = NULL, "piiPurgedAt" = ${nowIso}::timestamp, "version" = "version" + 1, "updatedAt" = ${nowIso}::timestamp
            WHERE "id" = ${b.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "status" = 'EXPIRED' AND "piiPurgedAt" IS NULL AND "paidSatang" = 0
              AND "version" = ${b.version} AND NOT EXISTS (SELECT 1 FROM "TripMoneyEvent" m WHERE m."bookingId" = ${b.id} AND m."tenantId" = ${u.tenantId})
            RETURNING "id"`;
          if (cas.length !== 1) return none;
          const pax = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "TripPassenger" WHERE "bookingId" = ${b.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} ORDER BY "id"`;
          const docs: { id: string; fileId: string }[] = [];
          for (const x of pax) docs.push(...(await erasePassengerInTx(tx, u, SYSTEM, x.id, now)));
          await auditTx(tx, u, SYSTEM, A.bookingPiiPurged, "TripBooking", b.id, { bookingId: b.id, passengers: pax.length });
          return { n: 1, docs, pax: pax.map((x) => x.id) };
        });
        if (!r.ok) {
          failAdd(r.code === "STATE_CONFLICT" ? "BOOKER_STATE_CONFLICT" : "BOOKER_PURGE_FAILED");
          return;
        }
        out.bookers += r.value.n;
        if ((await deleteAndConfirm(u, SYSTEM, r.value.docs, del)) > 0) failAdd("STORAGE_DELETE_FAILED");
        for (const pid of r.value.pax) finishSet.add(pid);
      },
    );
    out.more = out.more || m1;
  } else failAdd("SETTINGS_INVALID");

  // ── (2) ชั้นข้อมูลในแถวผู้เดินทาง ──
  const m2 = await phase<{ id: string }>(
    2,
    "PASSENGER_PURGE_FAILED",
    (n, skip) => db.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "TripPassenger" p
        JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId"
        JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
      WHERE p."tenantId" = ${u.tenantId} AND p."unitId" = ${u.unitId} AND p."retainUntil" IS NOT NULL ${skipSql(`p."id"`, skip)}
        AND (p."retainUntil" <= ${nowIso}::timestamp OR (p."answers"->>'retE') > ${localDateSql(Prisma.sql`d."endsAt"`, u.tz)})
      ORDER BY p."retainUntil", p."id" LIMIT ${n}`,
    async (c) => {
      const r = await inTx(u, (tx) => purgeStagesInTx(tx, u, c.id, now, retention));
      if (r.ok) out.passengerStages += r.value;
      else failAdd(r.code === "STATE_CONFLICT" ? "PASSENGER_STATE_CONFLICT" : "PASSENGER_PURGE_FAILED");
    },
  );
  out.more = out.more || m2;

  // ── (3) ไฟล์ครบกำหนด (วัตถุก่อน แล้วค่อยแถว — RT-10) ──
  const m3 = await phase<DocCand>(
    3,
    "DOCUMENT_PURGE_FAILED",
    (n, skip) => db.$queryRaw<DocCand[]>`
      SELECT doc."id", doc."passengerId", doc."kind", doc."fileId", p."answers", d."endsAt", b."id" AS "bookingId"
      FROM "TripDocument" doc
      JOIN "TripPassenger" p ON p."id" = doc."passengerId" AND p."tenantId" = doc."tenantId" AND p."unitId" = doc."unitId"
      JOIN "TripBooking" b ON b."id" = p."bookingId" AND b."tenantId" = p."tenantId"
      JOIN "TripDeparture" d ON d."id" = b."departureId" AND d."tenantId" = b."tenantId"
      WHERE doc."tenantId" = ${u.tenantId} AND doc."unitId" = ${u.unitId} AND doc."deletedAt" IS NULL ${skipSql(`doc."id"`, skip)}
        AND (doc."retainUntil" <= ${nowIso}::timestamp OR (doc."consent"->>'retE') > ${localDateSql(Prisma.sql`d."endsAt"`, u.tz)})
      ORDER BY doc."retainUntil", doc."id" LIMIT ${n}`,
    async (c) => {
      const E = localYmdOf(new Date(c.endsAt), u.tz);
      const due = isPurgedAll(parseAnswers(c.answers)) ? now : docRetainUntil(c.kind, E, u.tz, retention);
      if (due.getTime() > now.getTime()) {
        await inTx(u, (tx) => tx.$executeRaw`
          UPDATE "TripDocument" SET "retainUntil" = ${iso(due)}::timestamp, "consent" = COALESCE("consent", '{}'::jsonb) || jsonb_build_object('retE', ${E}::text),
            "updatedAt" = ${nowIso}::timestamp
          WHERE "id" = ${c.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND "deletedAt" IS NULL`);
        return;
      }
      if ((await deleteObjects(u, [c.fileId], del)) > 0) {
        failAdd("STORAGE_DELETE_FAILED");
        return;
      }
      const r = await inTx(u, (tx) => markDocsDeletedInTx(tx, u, SYSTEM, [c.id], c.bookingId, now, "RETENTION", true));
      if (r.ok) out.documents += r.value.length;
      else failAdd("DOCUMENT_PURGE_FAILED");
    },
  );
  out.more = out.more || m3;

  // ── (4) วัตถุค้าง: แถวที่ทำเครื่องหมายแล้ว (ลบทั้งคน/ปฏิเสธ/ถอน) แต่วัตถุยังไม่ยืนยันว่าหาย — ลองใหม่ทุกรอบ ไม่จำกัดเวลา (r3 X2) ──
  const m4 = await phase<{ id: string; fileId: string; passengerId: string; deletedAt: Date }>(
    4,
    "STORAGE_DELETE_FAILED",
    (n, skip) => db.$queryRaw<{ id: string; fileId: string; passengerId: string; deletedAt: Date }[]>`
      SELECT doc."id", doc."fileId", doc."passengerId", doc."deletedAt" FROM "TripDocument" doc
      WHERE doc."tenantId" = ${u.tenantId} AND doc."unitId" = ${u.unitId} AND doc."retainUntil" <= ${nowIso}::timestamp AND doc.${PENDING_DOC} ${skipSql(`doc."id"`, skip)}
      ORDER BY doc."deletedAt", doc."id" LIMIT ${n}`,
    async (c) => {
      const left = await deleteAndConfirm(u, SYSTEM, [{ id: c.id, fileId: c.fileId }], del);
      finishSet.add(c.passengerId);
      if (left > 0) failAdd("STORAGE_DELETE_FAILED");
    },
  );
  out.more = out.more || m4;
  // วัตถุค้างนานเกินเกณฑ์ ⇒ ops ERROR (จำนวนเท่านั้น · ไม่มีข้อมูลบุคคล)
  const stale = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "TripDocument" doc
    WHERE doc."tenantId" = ${u.tenantId} AND doc."unitId" = ${u.unitId} AND doc."retainUntil" <= ${nowIso}::timestamp AND doc.${PENDING_DOC}
      AND doc."deletedAt" < ${iso(new Date(now.getTime() - PENDING_ALERT_MS))}::timestamp`;
  if ((stale[0]?.n ?? 0) > 0) {
    await logOps("ERROR", "trips.pdpa", `ไฟล์ที่ต้องลบตามข้อมูลส่วนบุคคลยังลบที่ที่เก็บไม่สำเร็จเกิน ${PENDING_ALERT_MS / 3_600_000} ชม.`, {
      tenantId: u.tenantId,
      detail: JSON.stringify({ unitId: u.unitId, pendingObjects: stale[0]?.n ?? 0 }),
    }).catch(() => undefined);
  }

  // ── (5) ปิดงานลบทั้งคนที่ค้าง: คำขอ ERASE IN_PROGRESS ที่ผู้เดินทางถูกลบแล้ว + ผู้เดินทางที่วัตถุเพิ่งหมดในรอบนี้ ──
  const m5 = await phase<{ id: string }>(
    5,
    "ERASE_FINISH_FAILED",
    (n, skip) => db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT q."passengerId" AS "id" FROM "TripPdpaRequest" q
        JOIN "TripPassenger" p ON p."id" = q."passengerId" AND p."tenantId" = q."tenantId"
      WHERE q."tenantId" = ${u.tenantId} AND q."unitId" = ${u.unitId} AND q."kind" = 'ERASE' AND q."status" = 'IN_PROGRESS'
        AND (COALESCE(p."answers"->'purged'->'stages', '[]'::jsonb) ? 'ALL') ${skipSql(`q."passengerId"`, skip)}
      LIMIT ${n}`,
    async (c) => {
      finishSet.add(c.id);
    },
  );
  out.more = out.more || m5;
  for (const pid of finishSet) await finishErasure(u, SYSTEM, pid, now);
  return out;
}

/** ชั้นที่ครบกำหนดของแถวหนึ่ง (ใต้ล็อกแถว · CAS rev) — คืนจำนวนชั้นที่ลบ · ไม่มีชั้นครบ ⇒ ตั้ง retainUntil/retE ใหม่เท่านั้น */
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
      UPDATE "TripPassenger" SET "retainUntil" = ${nextRetain ? iso(nextRetain) : null}::timestamp, "answers" = jsonb_set("answers", '{retE}', to_jsonb(${E}::text), true)
      WHERE "id" = ${L.id} AND "tenantId" = ${u.tenantId} AND "unitId" = ${u.unitId} AND COALESCE(("answers"->>'rev')::int, 0) = ${a.rev}`;
    return 0;
  }
  const has = (s: PaxStage) => dueStages.includes(s);
  const next: Answers = { ...a, rev: a.rev + 1, retE: E, purged: { at: iso(now), stages: [...new Set([...(a.purged?.stages ?? []), ...dueStages])] } };
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
    // คีย์มี rev: ข้อมูลชั้นเดียวกันที่ถูกกรอกใหม่หลังลบ ⇒ event ใหม่ไม่ถูกตัดซ้ำ (r1 P9)
    await emitTx(tx, u, [purgedEvt(`${L.id}:${s}:${next.rev}`, L.bookingId, L.id, s)]);
  }
  return dueStages.length;
}
// ── /T0.8 pdpa ──
