// HR H3.3 ▸ หลังบ้าน SHARK: เขียนตารางกฎหมายเงินเดือน (HrLawTable) — ทางเดียวที่สร้าง/เปิดใช้/ปลดแถวได้
//
// 🔴 ผู้ทำ = SUPER_ADMIN เท่านั้น (Q9) · อ่านผู้ใช้หลังบ้านซ้ำจาก PlatformUser ทุกครั้งในธุรกรรมเดียวกัน — ไม่เชื่อวัตถุที่ส่งเข้ามา
// 🔴 เปิดใช้ (DRAFT → ACTIVE) = การรับรองของนักบัญชี (HQ23) · ต้องมีชื่อผู้รับรอง · json ไม่แก้เด็ดขาด (เปลี่ยนค่า = แถวใหม่ + supersedesId)
//    แทนแถวที่ "วันมีผลเดียวกัน" = ปลดแถวเก่า (RETIRED) ในธุรกรรมเดียวกับการเปิดแถวใหม่ · วันมีผลต่างกัน = แถวเก่ายังใช้กับช่วงของมัน
// 🔴 ใบ H3.3 ไม่เปิดใช้แถวใดบนฐานใด — ฟังก์ชันพร้อมให้หลังบ้าน (หนี้ D-1) / runbook เรียกเมื่อนักบัญชียืนยันแล้ว
// ผล = { ok: true, id } | { ok: false, code } · ทุกการเขียนบันทึก PlatformAuditLog (hr.law.create | hr.law.activate | hr.law.retire) ในธุรกรรมเดียวกัน
// ห้าม import จาก src/app/app/** · src/lib/modules/** · src/lib/ai/** (ข้อสอบ H3.3 S1.4)
import { randomUUID } from "node:crypto";
import { Prisma, type HrLawKind, type HrLawStatus, type PlatformUser } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { assertLawJson } from "@/lib/modules/hr/payroll-rules-v2";
import { isLawDay, lawDayString } from "@/lib/modules/hr/law";

export type LawWriteCode = "NOT_ALLOWED" | "BAD_KIND" | "LAW_BAD_DAY" | "LAW_SHAPE" | "BAD_NOTE" | "BAD_SUPERSEDES" | "NOT_FOUND" | "NOT_DRAFT" | "NO_APPROVER" | "SLOT_TAKEN" | "NOT_RETIRABLE";
export type LawWriteResult = { ok: true; id: string } | { ok: false; code: LawWriteCode };

const KINDS: readonly HrLawKind[] = ["SSO", "TAX_BRACKET", "DEDUCTION", "OT", "MIN_WAGE"];
const TX = { timeout: 15_000, maxWait: 5_000 };
type Tx = Prisma.TransactionClient;
type Actor = Pick<PlatformUser, "id"> | null | undefined;

/** ยกเลิกธุรกรรมพร้อมรหัส (ใช้เมื่อเขียนไปแล้วบางส่วน) */
class Refuse extends Error {
  constructor(readonly code: LawWriteCode) {
    super(code);
  }
}
const no = (code: LawWriteCode): LawWriteResult => ({ ok: false, code });

/** อ่านผู้ใช้หลังบ้านซ้ำจากฐาน — ต้องมีจริงและเป็น SUPER_ADMIN ณ ตอนนี้ */
async function superAdminId(tx: Tx, pu: Actor): Promise<string | null> {
  const id = typeof pu?.id === "string" ? pu.id : "";
  if (!id) return null;
  const u = await tx.platformUser.findUnique({ where: { id }, select: { id: true, role: true } });
  return u && u.role === "SUPER_ADMIN" ? u.id : null;
}
const lawJsonOk = (kind: HrLawKind, json: unknown): boolean => {
  try {
    assertLawJson(kind, json);
    return true;
  } catch {
    return false;
  }
};
const lockSlot = (tx: Tx, kind: HrLawKind, day: string) => tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtextextended(${`hrlaw:${kind}:${day}`}::text, 0)))::int AS n`;
async function run(fn: (tx: Tx) => Promise<LawWriteResult>): Promise<LawWriteResult> {
  try {
    return await prisma.$transaction(fn, TX);
  } catch (e) {
    if (e instanceof Refuse) return no(e.code);
    // ดัชนีเฉพาะ "ACTIVE แถวเดียวต่อ (kind, effectiveFrom)" ชนกันพร้อมกัน = ช่องถูกใช้แล้ว
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return no("SLOT_TAKEN");
    throw e;
  }
}

/** สร้างแถวร่าง (DRAFT) — ค่าเป็นจำนวนเต็มล้วนตามรูปของชนิดนั้น · ยังไม่มีผลกับเงินเดือนจนเปิดใช้ */
export async function createLawDraft(
  pu: Actor,
  input: { kind: HrLawKind; effectiveFrom: string; json: unknown; note?: string | null; supersedesId?: string | null },
): Promise<LawWriteResult> {
  if (!KINDS.includes(input?.kind)) return no("BAD_KIND");
  if (!isLawDay(input.effectiveFrom)) return no("LAW_BAD_DAY");
  if (!lawJsonOk(input.kind, input.json)) return no("LAW_SHAPE");
  const note = input.note == null ? null : String(input.note).trim();
  if (note !== null && note.length > 500) return no("BAD_NOTE");
  return run(async (tx) => {
    const actor = await superAdminId(tx, pu);
    if (!actor) return no("NOT_ALLOWED");
    if (input.supersedesId) {
      const old = await tx.hrLawTable.findUnique({ where: { id: input.supersedesId }, select: { kind: true } });
      if (!old || old.kind !== input.kind) return no("BAD_SUPERSEDES");
    }
    const row = await tx.hrLawTable.create({
      data: {
        kind: input.kind,
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00.000Z`),
        json: input.json as Prisma.InputJsonValue,
        status: "DRAFT",
        sourceKey: `platform:${input.kind}:${input.effectiveFrom}:${randomUUID()}`,
        note: note || null,
        supersedesId: input.supersedesId || null,
      },
      select: { id: true },
    });
    await tx.platformAuditLog.create({ data: { platformUserId: actor, action: "hr.law.create", targetType: "HrLawTable", targetId: row.id, detail: `${input.kind}@${input.effectiveFrom}` } });
    return { ok: true, id: row.id };
  });
}

/** เปิดใช้แถวร่าง = นักบัญชีรับรองแล้ว (approvedByName) · DRAFT → ACTIVE แบบมีเงื่อนไข (count = 1) · ช่อง (kind, วันมีผล) ต้องว่าง */
export async function activateLawRow(pu: Actor, id: string, opts: { approvedByName: string }): Promise<LawWriteResult> {
  const name = String(opts?.approvedByName ?? "").trim();
  if (!name || name.length > 200) return no("NO_APPROVER");
  return run(async (tx) => {
    const actor = await superAdminId(tx, pu);
    if (!actor) return no("NOT_ALLOWED");
    const row = await tx.hrLawTable.findUnique({ where: { id: String(id ?? "") }, select: { id: true, kind: true, effectiveFrom: true, status: true, json: true, supersedesId: true } });
    if (!row) return no("NOT_FOUND");
    if (row.status !== "DRAFT") return no("NOT_DRAFT");
    if (!lawJsonOk(row.kind, row.json)) return no("LAW_SHAPE");
    const day = lawDayString(row.effectiveFrom);
    await lockSlot(tx, row.kind, day);
    // แทนแถวที่วันมีผลเดียวกัน ⇒ ปลดแถวเก่าในธุรกรรมนี้ (ช่องจึงว่างให้แถวใหม่)
    let retiring: string | null = null;
    if (row.supersedesId) {
      const old = await tx.hrLawTable.findUnique({ where: { id: row.supersedesId }, select: { id: true, kind: true, effectiveFrom: true, status: true } });
      if (old && old.kind === row.kind && old.status === "ACTIVE" && lawDayString(old.effectiveFrom) === day) retiring = old.id;
    }
    const taken = await tx.hrLawTable.count({ where: { kind: row.kind, effectiveFrom: row.effectiveFrom, status: "ACTIVE", id: { not: row.id, ...(retiring ? { notIn: [retiring] } : {}) } } });
    if (taken > 0) return no("SLOT_TAKEN");
    if (retiring) {
      const r = await tx.hrLawTable.updateMany({ where: { id: retiring, status: "ACTIVE" }, data: { status: "RETIRED" } });
      if (r.count !== 1) throw new Refuse("SLOT_TAKEN");
      await tx.platformAuditLog.create({ data: { platformUserId: actor, action: "hr.law.retire", targetType: "HrLawTable", targetId: retiring, detail: `superseded by ${row.id}` } });
    }
    const u = await tx.hrLawTable.updateMany({
      where: { id: row.id, status: "DRAFT" },
      data: { status: "ACTIVE", approvedById: actor, approvedByName: name, approvedAt: new Date() },
    });
    if (u.count !== 1) throw new Refuse("NOT_DRAFT");
    await tx.platformAuditLog.create({ data: { platformUserId: actor, action: "hr.law.activate", targetType: "HrLawTable", targetId: row.id, detail: `${row.kind}@${day} · รับรองโดย ${name}` } });
    return { ok: true, id: row.id };
  });
}

/** ปลดแถว (ACTIVE/DRAFT → RETIRED) · ไม่ลบ — งวดที่อนุมัติไปแล้วยังอ้าง id เดิมใน lawRowIds */
export async function retireLawRow(pu: Actor, id: string): Promise<LawWriteResult> {
  return run(async (tx) => {
    const actor = await superAdminId(tx, pu);
    if (!actor) return no("NOT_ALLOWED");
    const row = await tx.hrLawTable.findUnique({ where: { id: String(id ?? "") }, select: { id: true, status: true } });
    if (!row) return no("NOT_FOUND");
    const from: HrLawStatus[] = ["ACTIVE", "DRAFT"];
    const r = await tx.hrLawTable.updateMany({ where: { id: row.id, status: { in: from } }, data: { status: "RETIRED" } });
    if (r.count !== 1) return no("NOT_RETIRABLE");
    await tx.platformAuditLog.create({ data: { platformUserId: actor, action: "hr.law.retire", targetType: "HrLawTable", targetId: row.id, detail: `from ${row.status}` } });
    return { ok: true, id: row.id };
  });
}

/** รายการทุกแถว (หลังบ้าน) — ผู้ใช้หลังบ้านทุกบทบาทอ่านได้ · อ่านบทบาทซ้ำจากฐาน */
export async function listLawRows(pu: Actor) {
  const id = typeof pu?.id === "string" ? pu.id : "";
  const u = id ? await prisma.platformUser.findUnique({ where: { id }, select: { id: true } }) : null;
  if (!u) return { ok: false as const, code: "NOT_ALLOWED" as const };
  const rows = await prisma.hrLawTable.findMany({ orderBy: [{ kind: "asc" }, { effectiveFrom: "asc" }, { id: "asc" }] });
  return { ok: true as const, rows };
}
// ◂ HR H3.3
