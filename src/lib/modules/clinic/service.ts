// Clinic (WO-0052) — ประวัติผู้ป่วยแบบเบา (PDPA) · visit · จ่ายยา (ตัดสต็อก) · เก็บเงิน→เส้นเงิน C-2
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type CLINIC
// PDPA: เก็บข้อมูลเท่าที่จำเป็น (ชื่อ/เบอร์/ปีเกิด/แพ้ยา/หมายเหตุ) · ลบร้าน = ลบตาม (WO-0042)
// เงินต้องเข้าเสมอ: เก็บเงิน visit = เปิดบิลผ่าน POS (บังคับเมื่อมีค่าบริการ · ไม่มี POS = โยน + revert)
// จ่ายยา = ตัดสต็อกจริงผ่าน INVENTORY (idempotent ต่อรายการ · ไม่มีคลัง = โยน)
import { tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import * as inventory from "@/lib/modules/inventory/service";
import * as member from "@/lib/modules/member/service";
import { listSystems } from "@/lib/modules/system/service";

export type ClinicCtx = { tenantId: string; unitId: string };

// ── ผู้ป่วย (PatientRecord) ─────────────────────────────────────
export type CreatePatientInput = {
  name: string;
  phone: string;
  birthYear?: number | null;
  allergies?: string | null;
  note?: string | null;
};

export async function createPatient(
  ctx: ClinicCtx,
  input: CreatePatientInput,
): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อผู้ป่วย");
  const phone = input.phone?.trim();
  if (!phone) throw new Error("กรุณาระบุเบอร์โทรผู้ป่วย");
  const birthYear =
    input.birthYear === undefined || input.birthYear === null ? null : Math.round(input.birthYear);

  // มีระบบสมาชิก (MEMBER) → หา/สร้าง Customer จากเบอร์ แล้วผูก customerId (แบบ school) · ไม่มี = null
  let customerId: string | null = null;
  const memberSystems = await listSystems(ctx.tenantId, "MEMBER");
  const memberSys = memberSystems[0];
  if (memberSys) {
    const cust = await member.findOrCreate({
      tenantId: ctx.tenantId,
      memberSystemId: memberSys.id,
      phone,
      name,
      source: "STAFF",
    });
    customerId = cust.id;
  }

  const p = await tenantDb(ctx).patientRecord.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      name,
      phone,
      birthYear,
      allergies: input.allergies?.trim() || null,
      note: input.note?.trim() || null,
      customerId,
    },
  });
  return { id: p.id };
}

export type UpdatePatientPatch = Partial<{
  name: string;
  phone: string;
  birthYear: number | null;
  allergies: string | null;
  note: string | null;
}>;

export async function updatePatient(
  ctx: ClinicCtx,
  id: string,
  patch: UpdatePatientPatch,
): Promise<{ id: string }> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (!name) throw new Error("กรุณาระบุชื่อผู้ป่วย");
    data.name = name;
  }
  if (patch.phone !== undefined) {
    const phone = patch.phone?.trim();
    if (!phone) throw new Error("กรุณาระบุเบอร์โทรผู้ป่วย");
    data.phone = phone;
  }
  if (patch.birthYear !== undefined) {
    data.birthYear = patch.birthYear === null ? null : Math.round(patch.birthYear);
  }
  if (patch.allergies !== undefined) data.allergies = patch.allergies?.trim() || null;
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;

  await tenantDb(ctx).patientRecord.updateMany({ where: { id }, data });
  return { id };
}

// ค้นผู้ป่วยด้วยชื่อหรือเบอร์ (contains) · q ว่าง → รายการล่าสุด
export async function searchPatients(ctx: ClinicCtx, q?: string) {
  const term = q?.trim() || "";
  return tenantDb(ctx).patientRecord.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ── visit ──────────────────────────────────────────────────────
export type CreateVisitInput = {
  patientId: string;
  symptom: string;
  diagnosis?: string | null;
  feeSatang?: number | null;
};

export async function createVisit(ctx: ClinicCtx, input: CreateVisitInput): Promise<{ id: string }> {
  const db = tenantDb(ctx);
  const patient = await db.patientRecord.findFirst({ where: { id: input.patientId } });
  if (!patient) throw new Error("ไม่พบผู้ป่วยในหน่วยนี้");
  const symptom = input.symptom?.trim();
  if (!symptom) throw new Error("กรุณาระบุอาการ");
  const feeSatang =
    input.feeSatang === undefined || input.feeSatang === null ? 0 : Math.round(input.feeSatang);
  if (!Number.isFinite(feeSatang) || feeSatang < 0) throw new Error("ค่าบริการต้องไม่ติดลบ");

  const v = await db.clinicVisit.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      patientId: input.patientId,
      symptom,
      diagnosis: input.diagnosis?.trim() || null,
      feeSatang,
    },
  });
  return { id: v.id };
}

export async function listVisits(ctx: ClinicCtx, patientId?: string) {
  return tenantDb(ctx).clinicVisit.findMany({
    where: patientId ? { patientId } : {},
    orderBy: { visitDate: "desc" },
    include: { patient: true },
    take: 200,
  });
}

// ── จ่ายยา (dispense) — visit OPEN เท่านั้น · ตัดสต็อกจริง (idempotent ต่อรายการ) ──
type DispenseLine = { invItemId: string; qty: number };
type DispenseRecord = { invItemId: string; name: string; qty: number };

export async function dispense(
  ctx: ClinicCtx,
  visitId: string,
  items: DispenseLine[],
): Promise<{ ok: boolean }> {
  const db = tenantDb(ctx);
  const visit = await db.clinicVisit.findFirst({ where: { id: visitId } });
  if (!visit) throw new Error("ไม่พบ visit");
  if (visit.status !== "OPEN") throw new Error("จ่ายยาได้เฉพาะ visit ที่เปิดอยู่");

  // ไม่มีระบบคลัง (INVENTORY) → ตัดสต็อกไม่ได้ → โยน
  const invSystems = await listSystems(ctx.tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (!invSys) throw new Error("เปิดระบบคลังสินค้า (Inventory) ก่อนจ่ายยา");
  const invCtx = { tenantId: ctx.tenantId, systemId: invSys.id };

  const lines = (items ?? []).filter((it) => it.invItemId && Math.round(it.qty) > 0);
  if (lines.length === 0) return { ok: true };

  // ชื่อยาสำหรับ dispenseJson
  const stockItems = await inventory.listItems(invCtx, 500);
  const nameOf = new Map(stockItems.map((s) => [s.id, s.name]));

  const added: DispenseRecord[] = [];
  for (const line of lines) {
    const qty = Math.round(line.qty);
    // ตัดสต็อกจริง — idempotencyKey ต่อ (visit, item) → จ่ายยาตัวเดิมใน visit เดิมซ้ำ = ไม่ตัดสต็อกซ้ำ
    await inventory.consume(invCtx, {
      itemId: line.invItemId,
      qty,
      sourceModule: "CLINIC",
      refType: "clinicVisit",
      refId: visitId,
      idempotencyKey: `clinic-${visitId}-${line.invItemId}`,
    });
    added.push({ invItemId: line.invItemId, name: nameOf.get(line.invItemId) ?? line.invItemId, qty });
  }

  // append ลง dispenseJson (สะสม)
  const prev = Array.isArray(visit.dispenseJson) ? (visit.dispenseJson as unknown as DispenseRecord[]) : [];
  await db.clinicVisit.updateMany({
    where: { id: visitId },
    data: { dispenseJson: [...prev, ...added] as unknown as object },
  });

  return { ok: true };
}

// ── เก็บเงิน (billVisit) — OPEN→BILLED + เส้นเงิน C-2 ผ่าน pos.createSale ──
export async function billVisit(
  ctx: ClinicCtx,
  visitId: string,
): Promise<{ ok: boolean; posSaleId?: string }> {
  const db = tenantDb(ctx);
  const visit = await db.clinicVisit.findFirst({ where: { id: visitId } });
  if (!visit || visit.status !== "OPEN") return { ok: false };

  // 1) claim อะตอมมิก: OPEN → BILLED (แพ้แข่ง/เก็บแล้ว/ยกเลิก → ok:false ไม่ทำเส้นเงินซ้ำ)
  const claim = await db.clinicVisit.updateMany({
    where: { id: visitId, status: "OPEN" },
    data: { status: "BILLED", billedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false };

  // ค่าบริการ 0 → BILLED โดยไม่สร้างบิล (posSaleId คงเป็น null)
  const feeSatang = visit.feeSatang;
  if (feeSatang <= 0) return { ok: true };

  // 2) หา AppSystem type POS ตัวแรก — ไม่มี = revert แล้วโยน (เงินเข้าไม่ได้ถ้าไม่มีจุดตัดเงิน)
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) {
    await db.clinicVisit.updateMany({
      where: { id: visitId, status: "BILLED", posSaleId: null },
      data: { status: "OPEN", billedAt: null },
    });
    throw new Error("เปิดระบบขาย (POS) ก่อนเก็บเงิน");
  }

  // 3) เส้นเงิน C-2 — pos.createSale (idempotent ต่อ `clinic-<visitId>`)
  const sale = await pos.createSale({
    tenantId: ctx.tenantId,
    unitId: ctx.unitId,
    systemId: posSys.id,
    sourceModule: "CLINIC",
    sourceId: visitId,
    idempotencyKey: `clinic-${visitId}`,
    lines: [{ name: `ค่าบริการคลินิก (${visit.symptom})`, qty: 1, unitPriceSatang: feeSatang }],
    payMethods: [{ type: "CASH", amountSatang: feeSatang }],
  });

  await db.clinicVisit.updateMany({ where: { id: visitId }, data: { posSaleId: sale.saleId } });

  return { ok: true, posSaleId: sale.saleId };
}
