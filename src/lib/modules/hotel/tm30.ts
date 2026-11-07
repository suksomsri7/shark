// SVC H.4 ▸ แจ้งที่พักคนต่างด้าว (ตม.30) — พ.ร.บ.คนเข้าเมือง พ.ศ. 2522 มาตรา 38: เจ้าบ้าน/ผู้จัดการโรงแรมแจ้งภายใน 24 ชม. นับจากคนต่างด้าวเข้าพัก
//   (ใบสั่ง ledger/svc-briefs/svc-brief-h.4.md §0 ข้อ ตม.30 · §2 ข้อ 5 · §3.4 · มติ §9 ข้อ 4 ข้อ 10)
//   • ระบบไม่ส่งเอง (DH:148): เตรียมไฟล์อัปโหลดตามแม่แบบของระบบแจ้งที่พักออนไลน์ของ ตม. → พนักงานส่งเอง → กรอกเลขรับแจ้ง "แจ้งแล้ว" (FILED)
//   • แม่แบบจริงรอเจ้าของ (Q-H4-1) ⇒ คอลัมน์/ลำดับเป็นค่าตั้ง rooms.hotel.tm30.exportColumns (ค่าเริ่ม = ช่องของแบบ ตม.30 กระดาษ 12 ช่อง)
//   • ไฟล์ = CSV UTF-8 มี BOM (ไม่มีไลบรารี xlsx ใน deps · เปิดด้วย Excel ได้) · มีเลขหนังสือเดินทางเต็มตามแบบ ตม. · ไม่เก็บไฟล์ · AuditLog ทุกครั้ง (ไม่มีเลขเต็ม)
//   • tm30Sweep (ทุก 15 นาที · ข้ามร้าน): PENDING ที่เลยกำหนด ⇒ LATE (UPDATE มีเงื่อนไข ⇒ ซ้อนกันได้ครั้งเดียว · X5) + เตือนก่อนครบตาม tm30ReminderHours (outbox hotel.tm30.due)
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { csvRow } from "@/lib/core/csv";
import { HOTEL_TM30_COLUMN_KEYS, HOTEL_TM30_COLUMN_TH, HOTEL_TM30_DEFAULT_COLUMNS, type HotelTm30ColumnKey } from "@/lib/core/settings/defs/rooms";
import {
  EVIDENCE_KINDS,
  GUEST_TX,
  R,
  checkFile,
  dropGuestFile,
  gfail,
  guestAudit,
  guestClock,
  guestGate,
  guestSettings,
  hotelUnitOf,
  isGuestFail,
  isRec,
  isStr,
  isTxBusy,
  openGuestSecret,
  type GuestSecret,
  tenantOf,
  uploadGuestFile,
  ymdOfDb,
  zodReason,
  type GuestFail,
  type ValidFile,
} from "./guest";
import { nationalityTh } from "./guest-shared";
import { integrationSecretKeyConfigured } from "@/lib/core/integrations/secret-box";

type Tx = Prisma.TransactionClient;
export type Tm30Column = { key: HotelTm30ColumnKey; label: string };
/** 12 คอลัมน์ตามแบบ ตม.30 กระดาษ (ชื่อ-สกุล · เพศ · สัญชาติ · เลขหนังสือเดินทาง · วันเกิด · ตรวจลงตรา · วันเดินทางเข้า · ด่าน · ตม.6 · วันเข้าพัก · วันออกคาด · เลขห้อง) — Q-H4-1 */
export const TM30_DEFAULT_COLUMNS: readonly Tm30Column[] = HOTEL_TM30_DEFAULT_COLUMNS;
const COLUMNS_Z = z.array(z.object({ key: z.enum(HOTEL_TM30_COLUMN_KEYS), label: z.string().trim().min(1).max(60) })).min(1).max(30);
const SEX_TH: Record<string, string> = { M: "ชาย", F: "หญิง", X: "ไม่ระบุ" };
const TM30_PERMS = ["hotel.guest.register"];
const MAX_EXPORT = 200;

export type Tm30Item = {
  guestId: string;
  reservationId: string;
  reservationCode: string;
  fullName: string;
  nationality: string | null;
  nationalityTh: string | null;
  idNumberLast4: string | null;
  dueAt: string | null;
  status: string;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  checkedIn: boolean;
};
/** คิว "ต้องแจ้ง ตม.30" ของหน่วย (PENDING + LATE) เรียงครบกำหนดก่อน — ไม่มีเลขเต็ม · ผู้เรียก (หน้า) ตรวจสิทธิ์ก่อน */
export async function tm30Queue(ctx: unknown, input: unknown): Promise<{ ok: true; pending: number; late: number; items: Tm30Item[] } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const unit = await hotelUnitOf(tenantId, input.unitId);
  if (!unit) return gfail("NOT_FOUND", R.notFound);
  const rows = await tenantDb({ tenantId, unitId: unit.id }).hotelGuestRecord.findMany({
    where: { isForeigner: true, tm30Status: { in: ["PENDING", "LATE"] } },
    orderBy: [{ tm30DueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 1000,
    include: { reservation: { select: { code: true, status: true, checkInDate: true, checkOutDate: true, room: { select: { number: true } } } } },
  });
  const items: Tm30Item[] = rows.map((r) => ({
    guestId: r.id,
    reservationId: r.reservationId,
    reservationCode: r.reservation.code,
    fullName: r.fullName,
    nationality: r.nationality,
    nationalityTh: nationalityTh(r.nationality),
    idNumberLast4: r.idNumberLast4,
    dueAt: r.tm30DueAt?.toISOString() ?? null,
    status: r.tm30Status,
    roomNumber: r.reservation.room?.number ?? null,
    checkIn: ymdOfDb(r.reservation.checkInDate),
    checkOut: ymdOfDb(r.reservation.checkOutDate),
    checkedIn: r.reservation.status === "CHECKED_IN" || r.reservation.status === "CHECKED_OUT",
  }));
  return { ok: true, pending: items.filter((i) => i.status === "PENDING").length, late: items.filter((i) => i.status === "LATE").length, items };
}

/** คอลัมน์ที่ใช้จริง (ค่าตั้งผิดรูป ⇒ ค่าเริ่ม) */
export function tm30ColumnsOf(v: unknown): Tm30Column[] {
  const p = COLUMNS_Z.safeParse(v);
  return p.success ? p.data : [...TM30_DEFAULT_COLUMNS];
}
const ExportZ = z.object({ unitId: z.string().min(1), guestIds: z.array(z.string().min(1).max(64)).min(1, "เลือกผู้เข้าพักอย่างน้อย 1 คน").max(MAX_EXPORT, `เลือกได้ครั้งละไม่เกิน ${MAX_EXPORT} คน`), format: z.enum(["csv", "xlsx"]).optional() });
const thDate = (ymd: string | null): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};
/**
 * ไฟล์สำหรับอัปโหลดเข้าระบบแจ้งที่พักของ ตม. — เฉพาะผู้พักต่างด้าวที่เลือกและยังไม่แจ้ง (PENDING/LATE) · 1 ไฟล์ต่อครั้ง
 * สิทธิ์ hotel.guest.register (มติ §9 ข้อ 4) · AuditLog hotel.tm30.exported {guestIds, byUserId} · ไม่เก็บไฟล์ · xlsx ⇒ CSV (ไม่มีไลบรารี)
 */
export async function tm30Export(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; file: { name: string; contentType: string; bytes: Uint8Array }; count: number } | GuestFail> {
  const g = await guestGate(actorIn, ctx, isRec(input) ? input.unitId : null, TM30_PERMS);
  if (isGuestFail(g)) return g;
  const p = ExportZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const ids = [...new Set(p.data.guestIds)];
  const rows = await db.hotelGuestRecord.findMany({
    where: { id: { in: ids }, isForeigner: true, tm30Status: { in: ["PENDING", "LATE"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { reservation: { select: { checkInDate: true, checkOutDate: true, checkedInAt: true, room: { select: { number: true } } } } },
  });
  if (!rows.length) return gfail("INVALID_INPUT", "ไม่มีผู้เข้าพักต่างด้าวที่ยังไม่แจ้งในรายการที่เลือก");
  // ผู้ตรวจ PDPA รอบ 1 MAJOR-1: ไฟล์ ตม. ต้องมีเลขหนังสือเดินทางเต็ม — เปิดกล่องลับไม่ได้ ⇒ ไม่ส่งออก (ไม่สร้างไฟล์ · ไม่เขียน AuditLog exported)
  if (!integrationSecretKeyConfigured()) return gfail("NOT_CONFIGURED", R.noKey);
  const secrets = new Map<string, GuestSecret>();
  let unreadable = 0;
  for (const r of rows) {
    const sec = openGuestSecret(r);
    if (sec) secrets.set(r.id, sec);
    else unreadable++;
  }
  if (unreadable) return gfail("NO_DATA", `เปิดข้อมูลเลขหนังสือเดินทางไม่ได้ ${unreadable} คน (ถูกลบตามระยะเวลาเก็บ หรือกุญแจเข้ารหัสไม่ตรง) — ยังไม่สร้างไฟล์ · แจ้งผู้ดูแลระบบ หรือกรอกเอกสารใหม่ที่ทะเบียนผู้พัก`);
  const st = await guestSettings(g.tenantId, g.unitId);
  const cols = tm30ColumnsOf(st.tm30Columns);
  const lines: string[] = [csvRow(cols.map((x) => x.label))];
  for (const r of rows) {
    const sec = secrets.get(r.id) ?? null;
    const val = (k: HotelTm30ColumnKey): string => {
      switch (k) {
        case "fullName": return r.fullName;
        case "sex": return sec?.sex ? (SEX_TH[sec.sex] ?? sec.sex) : "";
        case "nationality": return r.nationality ?? "";
        case "passportNo": return sec?.id ?? "";
        case "dob": return thDate(r.dob ? ymdOfDb(r.dob) : null);
        case "visa": return [sec?.visaType, sec?.visaNo].filter(Boolean).join(" ");
        case "arrivalDate": return thDate(sec?.arrivalDate ?? null);
        case "portOfEntry": return sec?.portOfEntry ?? "";
        case "tm6No": return sec?.tm6No ?? "";
        case "checkInDate": return thDate(ymdOfDb(r.reservation.checkedInAt ?? r.reservation.checkInDate));
        case "expectedCheckOut": return thDate(ymdOfDb(r.reservation.checkOutDate));
        case "roomNumber": return r.reservation.room?.number ?? "";
        default: return "";
      }
    };
    lines.push(csvRow(cols.map((x) => val(x.key))));
  }
  const text = `${lines.join("\r\n")}\r\n`;
  const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  try {
    await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      for (const r of rows) await guestAudit(tx, c, g.actor.userId, "hotel.tm30.exported", r.id, null, { guestIds: rows.map((x) => x.id), byUserId: g.actor.userId, count: rows.length, format: "csv", requested: p.data.format ?? "csv" });
    }, GUEST_TX);
  } catch (e) {
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
  return { ok: true, count: rows.length, file: { name: `tm30-${stamp}.csv`, contentType: "text/csv; charset=utf-8", bytes } };
}

const FiledZ = z.object({
  guestIds: z.array(z.string().min(1).max(64)).min(1, "เลือกผู้เข้าพักอย่างน้อย 1 คน").max(MAX_EXPORT),
  tm30Ref: z.string({ error: "กรอกเลขรับแจ้งจากระบบ ตม." }).trim().min(1, "กรอกเลขรับแจ้งจากระบบ ตม.").max(60, "เลขรับแจ้งยาวเกินไป"),
  filedAt: z.string().optional().nullable(),
});
/**
 * บันทึก "แจ้งแล้ว": เลขรับแจ้ง 1 เลขให้หลายคนได้ (มติ 5) · PENDING/LATE ⇒ FILED · แจ้งแล้ว ⇒ ข้าม (idempotent) · คนไทย ⇒ ข้าม/ปฏิเสธ
 * หลักฐาน (รูป/PDF) ⇒ ไฟล์ private อ้างใน AuditLog · outbox hotel.tm30.filed (id ล้วน)
 */
export async function markTm30Filed(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; filed: number; skipped: number } | GuestFail> {
  const tenantId = tenantOf(ctx);
  if (!tenantId || !isRec(input)) return gfail("NOT_FOUND", R.notFound);
  const ids = Array.isArray(input.guestIds) ? [...new Set(input.guestIds.filter(isStr))].slice(0, MAX_EXPORT) : [];
  const units = ids.length
    ? await tenantDb({ tenantId }).$queryRaw<{ unitId: string }[]>`SELECT DISTINCT "unitId" FROM "HotelGuestRecord" WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])`
    : [];
  if (ids.length && !units.length) return gfail("NOT_FOUND", R.notFound);
  if (units.length > 1) return gfail("INVALID_INPUT", "เลือกผู้เข้าพักของโรงแรมเดียวกันเท่านั้น");
  const g = await guestGate(actorIn, ctx, units[0]?.unitId ?? null, TM30_PERMS);
  if (isGuestFail(g)) return g;
  const p = FiledZ.safeParse(input);
  if (!p.success) return gfail("INVALID_INPUT", zodReason(p.error));
  const now = new Date();
  let filedAt = now;
  if (p.data.filedAt) {
    const d = new Date(p.data.filedAt);
    if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 60_000) return gfail("INVALID_INPUT", "วันเวลาที่แจ้งไม่ถูกต้อง (เป็นอนาคตไม่ได้)");
    filedAt = d;
  }
  let evidence: ValidFile | null = null;
  if (input.evidence !== undefined && input.evidence !== null) {
    const f = checkFile(input.evidence, EVIDENCE_KINDS);
    if (isGuestFail(f)) return f;
    evidence = f;
  }
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const rows = await db.hotelGuestRecord.findMany({ where: { id: { in: p.data.guestIds } }, select: { id: true, isForeigner: true, tm30Status: true, reservationId: true } });
  const open = rows.filter((r) => r.isForeigner && (r.tm30Status === "PENDING" || r.tm30Status === "LATE"));
  const already = rows.filter((r) => r.tm30Status === "FILED");
  if (!open.length) return already.length ? { ok: true, filed: 0, skipped: rows.length } : gfail("NOT_REQUIRED", "ผู้เข้าพักที่เลือกไม่ต้องแจ้ง ตม.30 (สัญชาติไทยหรือปิดการติดตาม)");
  let evidenceId: string | null = null;
  if (evidence) {
    const up = await uploadGuestFile(g.tenantId, evidence, "tm30");
    if (isGuestFail(up)) return up;
    evidenceId = up.fileId;
  }
  try {
    const n = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const done: string[] = [];
      for (const r of open) {
        const u = await tx.hotelGuestRecord.updateMany({ where: { id: r.id, tm30Status: { in: ["PENDING", "LATE"] } }, data: { tm30Status: "FILED", tm30Ref: p.data.tm30Ref, tm30FiledAt: filedAt } });
        if (u.count !== 1) continue;
        done.push(r.id);
        await guestAudit(tx, c, g.actor.userId, "hotel.tm30.filed", r.id, { tm30Status: r.tm30Status }, { tm30Status: "FILED", tm30Ref: p.data.tm30Ref, filedAt: filedAt.toISOString(), evidenceFileId: evidenceId });
      }
      if (done.length)
        await emitOutbox(tx, {
          tenantId: c.tenantId,
          unitId: c.unitId,
          type: "hotel.tm30.filed",
          idempotencyKey: `hotel.tm30.filed#${randomUUID()}`,
          payload: { tenantId: c.tenantId, unitId: c.unitId, guestIds: done, count: done.length, filedAt: filedAt.toISOString() },
        });
      return done.length;
    }, GUEST_TX);
    if (!n) await dropGuestFile(g.tenantId, evidenceId);
    return { ok: true, filed: n, skipped: rows.length - n };
  } catch (e) {
    await dropGuestFile(g.tenantId, evidenceId);
    if (isTxBusy(e)) return gfail("BUSY", R.busy);
    throw e;
  }
}

/**
 * งานตามเวลา (ทุก 15 นาที · ข้ามร้าน): PENDING ที่เลยกำหนด ⇒ LATE · ใกล้ครบ (≤ tm30ReminderHours) ⇒ เตือน 1 ครั้งต่อผู้พัก
 * event hotel.tm30.due {tenantId, unitId, pending, late, dueSoon} — ระบบไม่ส่งแจ้ง ตม. เอง
 */
export async function tm30Sweep(input?: unknown): Promise<{ ok: true; late: number; reminded: number }> {
  const now = guestClock(input, "now");
  const scan = tenantDb({ tenantId: "hotel-tm30-sweep" });
  const due = await scan.$queryRaw<{ id: string; tenantId: string; unitId: string }[]>`
    SELECT "id", "tenantId", "unitId" FROM "HotelGuestRecord"
     WHERE "tm30Status" = 'PENDING' AND "tm30DueAt" IS NOT NULL AND "tm30DueAt" <= ${now}
     ORDER BY "tm30DueAt" ASC, "id" ASC LIMIT 1000`;
  const lateBy = new Map<string, { tenantId: string; unitId: string; n: number }>();
  let late = 0;
  for (const r of due) {
    const c = { tenantId: r.tenantId, unitId: r.unitId };
    const u = await tenantDb(c).hotelGuestRecord.updateMany({ where: { id: r.id, tm30Status: "PENDING" }, data: { tm30Status: "LATE" } });
    if (u.count !== 1) continue;
    late++;
    const k = `${r.tenantId}|${r.unitId}`;
    const cur = lateBy.get(k) ?? { ...c, n: 0 };
    cur.n++;
    lateBy.set(k, cur);
  }
  // ใกล้ครบ: ภายใน 23 ชม. ข้างหน้า (เพดานของค่าตั้ง) แล้วกรองตามค่าตั้งของหน่วย
  const soon = await scan.$queryRaw<{ id: string; tenantId: string; unitId: string; tm30DueAt: Date }[]>`
    SELECT "id", "tenantId", "unitId", "tm30DueAt" FROM "HotelGuestRecord"
     WHERE "tm30Status" = 'PENDING' AND "tm30DueAt" IS NOT NULL AND "tm30DueAt" > ${now} AND "tm30DueAt" <= ${new Date(now.getTime() + 23 * 3_600_000)}
     ORDER BY "tm30DueAt" ASC, "id" ASC LIMIT 1000`;
  const hoursOf = new Map<string, number>();
  let reminded = 0;
  const units = new Map<string, { tenantId: string; unitId: string }>();
  for (const x of [...lateBy.values(), ...soon]) units.set(`${x.tenantId}|${x.unitId}`, { tenantId: x.tenantId, unitId: x.unitId });
  const counts = new Map<string, { pending: number; late: number }>();
  for (const [k, u] of units) {
    const db = tenantDb(u);
    const [pending, lateN] = await Promise.all([db.hotelGuestRecord.count({ where: { tm30Status: "PENDING", isForeigner: true } }), db.hotelGuestRecord.count({ where: { tm30Status: "LATE", isForeigner: true } })]);
    counts.set(k, { pending, late: lateN });
    hoursOf.set(k, (await guestSettings(u.tenantId, u.unitId)).tm30ReminderHours);
  }
  for (const r of soon) {
    const k = `${r.tenantId}|${r.unitId}`;
    const h = hoursOf.get(k) ?? 6;
    if (r.tm30DueAt.getTime() - now.getTime() > h * 3_600_000) continue;
    const cnt = counts.get(k) ?? { pending: 0, late: 0 };
    const dueSoon = soon.filter((x) => `${x.tenantId}|${x.unitId}` === k && x.tm30DueAt.getTime() - now.getTime() <= h * 3_600_000).length;
    try {
      await tenantDb({ tenantId: r.tenantId }).$transaction(async (t) => {
        await emitOutbox(t as unknown as Tx, { tenantId: r.tenantId, unitId: r.unitId, type: "hotel.tm30.due", idempotencyKey: `hotel.tm30.due#remind#${r.id}`, payload: { tenantId: r.tenantId, unitId: r.unitId, pending: cnt.pending, late: cnt.late, dueSoon } });
      });
      reminded++;
    } catch {
      /* กุญแจเตือนซ้ำ (sweep ซ้อนกัน) = เตือนไปแล้ว */
    }
  }
  for (const [k, u] of lateBy) {
    const cnt = counts.get(k) ?? { pending: 0, late: u.n };
    await tenantDb({ tenantId: u.tenantId }).$transaction(async (t) => {
      await emitOutbox(t as unknown as Tx, { tenantId: u.tenantId, unitId: u.unitId, type: "hotel.tm30.due", idempotencyKey: `hotel.tm30.due#late#${u.unitId}#${randomUUID()}`, payload: { tenantId: u.tenantId, unitId: u.unitId, pending: cnt.pending, late: cnt.late, dueSoon: 0 } });
    });
  }
  return { ok: true, late, reminded };
}

/** ป้ายไทยของคอลัมน์ (จอตั้งค่า/ไดอะล็อก) */
export const TM30_COLUMN_TH = HOTEL_TM30_COLUMN_TH;
