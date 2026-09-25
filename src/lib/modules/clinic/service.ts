// Clinic (WO-0052) — ประวัติผู้ป่วยแบบเบา (PDPA) · visit · จ่ายยา (ตัดสต็อก) · เก็บเงิน→เส้นเงิน C-2
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type CLINIC
// PDPA: เก็บข้อมูลเท่าที่จำเป็น (ชื่อ/เบอร์/ปีเกิด/แพ้ยา/หมายเหตุ) · ลบร้าน = ลบตาม (WO-0042)
// เงินต้องเข้าเสมอ: เก็บเงิน visit = เปิดบิลผ่าน POS (บังคับเมื่อมีค่าบริการ · ไม่มี POS = โยนก่อนแตะสถานะ — CRM C2.9)
// จ่ายยา = ตัดสต็อกจริงผ่าน INVENTORY (idempotent ต่อรายการ · ไม่มีคลัง = โยน)
import { prisma, tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import * as inventory from "@/lib/modules/inventory/service";
import * as member from "@/lib/modules/member/service";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "ปิดการเข้ารับบริการ" ใน tx เดียวกับสถานะ ◂
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { listSystems } from "@/lib/modules/system/service";
import { resolvePublicUnit } from "@/lib/core/storefront";

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
      partyId: await patientPartyId(ctx.tenantId, name, phone),
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
      // C11 — Party ของคนไข้ (คนไข้เก่าที่ยังไม่มี partyId → หาจากชื่อ+เบอร์ของคนไข้)
      partyId: patient.partyId ?? (await patientPartyId(ctx.tenantId, patient.name, patient.phone)),
      symptom,
      diagnosis: input.diagnosis?.trim() || null,
      feeSatang,
    },
  });
  return { id: v.id };
}

/**
 * CRM v2 C1.1 (C11) — Party กลางของคนไข้ · ไม่มี transaction ธุรกิจครอบ (create ตรง) และการตรวจค่าทั้งหมดทำก่อนถึงจุดนี้แล้ว
 * (createPatient: ชื่อ/เบอร์ · createVisit: คนไข้/อาการ/ค่าบริการ) ⇒ เรียกที่จุดสร้างได้โดยไม่ทิ้ง Party ของรายการที่ล้ม
 * 🔴 เบอร์ normalize < 9 หลัก (เช่นพนักงานพิมพ์ "-") = ไม่ผูก — party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์สั้น ⇒ Party ขยะ
 * AUDIT-CLASS X8: ไม่ได้ Party = ปล่อยว่าง · log แค่ตาราง+tenant ไม่มีเบอร์ (backfill party-links เก็บตกทีหลัง)
 */
async function patientPartyId(tenantId: string, name: string, phone: string): Promise<string | null> {
  if (normalizePartyPhone(phone).length < 9) return null;
  const id = await safeFindOrCreate(tenantId, { name, phone }).catch(() => null);
  if (!id) console.warn(`[party-link] PatientRecord/ClinicVisit tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  return id;
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
  if (!invSys) throw new Error("เปิดระบบสินค้า/บริการ (Inventory) ก่อนจ่ายยา");
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

  // CRM C2.9 ▸ (มติผู้คุมงาน · ใบ C2.9) ด่าน POS ต้องอยู่ **ก่อน** การ claim:
  //   เดิม claim (OPEN→BILLED) + ยิง event ก่อน แล้วจึงหา AppSystem type POS · ไม่มี POS = revert + โยน ⇒
  //   การเก็บเงินที่ถูกยกเลิกไปแล้วยังทิ้ง event ค้างไว้ (และกิจกรรม VISIT ใน CRM หลังคิวระบาย) = ไทม์ไลน์โกหกว่ามารับบริการจบแล้ว
  //   ย้ายขึ้นมาเป็น pre-check ก่อนเขียนอะไรทั้งสิ้น ⇒ ไม่มี POS = โยนโดยไม่แตะสถานะ ไม่มี event ไม่มีกิจกรรม
  //   ข้อความไทยเดิมทุกตัวอักษร · เงื่อนไขเดิมคงไว้: ค่าบริการ 0 = BILLED โดยไม่เปิดบิล ⇒ **ไม่ต้องมี POS** (ไม่โยน)
  const feeSatang = visit.feeSatang;
  const posSys = feeSatang > 0 ? (await listSystems(ctx.tenantId, "POS"))[0] : null;
  if (feeSatang > 0 && !posSys) throw new Error("เปิดระบบขาย (POS) ก่อนเก็บเงิน");

  // 1) claim อะตอมมิก: OPEN → BILLED (แพ้แข่ง/เก็บแล้ว/ยกเลิก → ok:false ไม่ทำเส้นเงินซ้ำ)
  //   ห่อ **เฉพาะ** การ claim + `emitOutbox(tx, …)` ไว้ใน transaction เดียวกัน ⇒
  //   ปิดการเข้ารับบริการสำเร็จ = มี event เสมอ · event เขียนไม่ได้ = ยกเลิกทั้งก้อน (ยัง OPEN) ·
  //   `pos.createSale` / การผูก posSaleId ยังอยู่นอก tx เหมือนเดิม
  //   🔴 X8 (มติผู้คุมงาน C2.9 ข้อ 15) — payload บอกแค่ "มีการมารับบริการหนึ่งครั้ง": visitId · unitId · partyId · patientId
  //      **ห้าม** มีอาการ/การวินิจฉัย/ยาที่จ่าย/ค่าบริการ — ข้อมูลสุขภาพต้องไม่ไหลเข้าไทม์ไลน์ขายหรือเว็บฮุคของร้าน
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.clinicVisit.updateMany({
      where: { id: visitId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "OPEN" },
      data: { status: "BILLED", billedAt: new Date() },
    });
    if (claim.count === 0) return false;
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      type: "clinic.visit.done",
      idempotencyKey: `clinic.visit.done#${visitId}`,
      payload: { visitId, unitId: ctx.unitId, partyId: visit.partyId, patientId: visit.patientId },
    });
    return true;
  });
  if (!claimed) return { ok: false };
  // ◂ CRM C2.9

  // ค่าบริการ 0 → BILLED โดยไม่สร้างบิล (posSaleId คงเป็น null)
  // 2) ด่าน POS ผ่านแล้วตั้งแต่ก่อน claim (บล็อก CRM C2.9 ด้านบน · fee > 0 ⇒ posSys ไม่เป็น null แน่นอน)
  if (feeSatang <= 0 || !posSys) return { ok: true };

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

// ── คืนเงิน/void visit (BILLED → REFUNDED) — void PosSale + คืนยาเข้าคลัง (ห้ามลบ record) ──
// mirror ของ shop.refundOrder / hotel.refundStay:
//   1) claim อะตอมมิก BILLED→REFUNDED (idempotent — คืนซ้ำ/สถานะอื่น → ok:false ไม่กลับเส้นเงินซ้ำ)
//   2) กลับเส้นเงิน pos.voidSale (คืนบัญชี+แต้ม) "นอก tx" — voidSale เปิด tx เอง (ไม่ nested) · เฉพาะบิลที่ยัง PAID
//      (fee 0 → BILLED โดยไม่มีบิล → ข้าม void)
//   3) คืนยาเข้าคลัง — mirror ของตอน dispense (consume) · อ้างจาก InvMovement ที่ตัดจริง (type OUT ผูก visit)
//      → รับเข้าที่ต้นทุนปัจจุบัน (ต้นทุนถัวเฉลี่ยไม่เพี้ยน) · idempotencyKey `clinic-refund-<visitId>-<itemId>`
//      หมายเหตุ: อ้าง movement จริง (ไม่ใช่ dispenseJson) → คืนตรงกับที่ตัด แม้ dispenseJson นับซ้ำ (idempotent)
// cross-tenant: tenantDb(ctx) กรอง tenantId → claim ไม่ match → ok:false (record ร้านอื่นไม่ถูกแตะ)
export async function refundVisit(
  ctx: ClinicCtx,
  visitId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);

  // 1) claim อะตอมมิก: BILLED → REFUNDED
  const claim = await db.clinicVisit.updateMany({
    where: { id: visitId, status: "BILLED" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (claim.count === 0) {
    const cur = await db.clinicVisit.findFirst({ where: { id: visitId } });
    if (!cur) return { ok: false, reason: "ไม่พบรายการตรวจ" };
    if (cur.status === "REFUNDED") return { ok: false, reason: "รายการนี้คืนเงินแล้ว" };
    if (cur.status === "OPEN") return { ok: false, reason: "รายการนี้ยังไม่ได้เก็บเงิน" };
    return { ok: false, reason: "คืนเงินได้เฉพาะรายการที่เก็บเงินแล้ว" };
  }

  const visit = await db.clinicVisit.findFirst({ where: { id: visitId } });
  if (!visit) return { ok: false, reason: "ไม่พบรายการตรวจ" };

  // 2) กลับเส้นเงิน — void PosSale (เฉพาะบิลที่ยัง PAID — กัน void ซ้ำหลัง retry · fee 0 = ไม่มีบิล)
  if (visit.posSaleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: visit.posSaleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, visit.posSaleId);
    }
  }

  // 3) คืนยาเข้าคลัง — วนตาม movement ที่ตัดจริงตอนจ่ายยา (idempotent ต่อ item)
  const invSystems = await listSystems(ctx.tenantId, "INVENTORY");
  const invSys = invSystems[0];
  if (invSys) {
    const invCtx = { tenantId: ctx.tenantId, systemId: invSys.id };
    const invDb = tenantDb(invCtx);
    const outMoves = await prisma.invMovement.findMany({
      where: { tenantId: ctx.tenantId, type: "OUT", refType: "clinicVisit", refId: visitId, sourceModule: "CLINIC" },
    });
    for (const mv of outMoves) {
      const returnQty = -mv.qtyDelta; // qtyDelta ติดลบตอนตัด → คืนเท่าที่ตัดจริง
      if (returnQty <= 0) continue;
      const item = await invDb.invItem.findFirst({ where: { id: mv.itemId } });
      if (!item) continue; // ยาถูกลบออกจากคลัง → ไม่มีที่ให้คืน ข้ามเงียบ
      await inventory.receive(invCtx, {
        itemId: mv.itemId,
        qty: returnQty,
        costSatang: item.costSatang, // คืนที่ต้นทุนปัจจุบัน → ไม่กระทบต้นทุนถัวเฉลี่ย
        idempotencyKey: `clinic-refund-${visitId}-${mv.itemId}`,
        sourceModule: "CLINIC",
        refType: "clinicVisit",
        refId: visitId,
        note: "คืนยาเข้าคลังจากการคืนเงิน",
      });
    }
  }

  return { ok: true };
}

// ───────────────────────── Public appointment (ผู้ป่วยจองนัดออนไลน์ · no-auth · ไม่เก็บเงินล่วงหน้า) ─────────────────────────
// คลินิกจ่ายหลังตรวจผ่าน visit/billVisit อยู่แล้ว → นัดเป็นเพียง "คำขอ" ให้ร้านยืนยัน/ปฏิเสธ (ไม่แตะเส้นเงิน/บัญชี)
// PDPA: symptom = ข้อมูลสุขภาพ → optional เก็บเท่าที่จำเป็น
// resolve unit จาก slug (public) · unit ต้อง ACTIVE + type=CLINIC (กันสวมร้าน/ประเภทผิด) · mirror resolveRentalUnit
export async function resolveClinicUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "CLINIC");
}

export type RequestAppointmentInput = {
  patientName: string;
  patientPhone: string;
  preferredAt: Date;
  symptom?: string | null;
};

// ขอนัด (public) → PENDING + publicToken · ไม่เก็บเงิน · ไม่ผูกผู้ป่วย/สมาชิก (คำขอเบา ๆ)
export async function requestAppointment(
  ctx: ClinicCtx,
  input: RequestAppointmentInput,
): Promise<{ id: string; publicToken: string | null }> {
  const name = input.patientName?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อผู้ป่วย");
  const phone = input.patientPhone?.trim();
  if (!phone) throw new Error("กรุณาระบุเบอร์โทร");
  if (!(input.preferredAt instanceof Date) || Number.isNaN(input.preferredAt.getTime())) {
    throw new Error("กรุณาเลือกวันเวลาที่สะดวก");
  }

  const appt = await tenantDb(ctx).clinicAppointment.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      patientName: name,
      patientPhone: phone,
      preferredAt: input.preferredAt,
      symptom: input.symptom?.trim() || null,
    },
  });
  return { id: appt.id, publicToken: appt.publicToken };
}

// สถานะคำขอนัด (public จาก publicToken) — กัน cross-tenant: token ต้องเป็นของ unit นี้ (กัน leak PII/สุขภาพร้านอื่น)
export async function getPublicAppointment(unitId: string, publicToken: string) {
  const token = (publicToken ?? "").trim();
  if (!token) return null;
  const appt = await prisma.clinicAppointment.findUnique({ where: { publicToken: token } });
  if (!appt || appt.unitId !== unitId) return null;
  return appt;
}

// รายการคำขอนัด (ฝั่งร้าน) — เรียงคำขอใหม่/ที่สะดวกใกล้สุดก่อน
export async function listAppointments(
  ctx: ClinicCtx,
  opts: { status?: "PENDING" | "CONFIRMED" | "REJECTED" | "DONE" | "CANCELLED" } = {},
) {
  return tenantDb(ctx).clinicAppointment.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: [{ status: "asc" }, { preferredAt: "asc" }],
    take: 200,
  });
}

// ร้านยืนยันนัด (PENDING → CONFIRMED) — claim อะตอมมิก (กันกดซ้ำ/แข่ง) · cross-tenant: tenantDb กรอง tenantId
export async function confirmAppointment(ctx: ClinicCtx, apptId: string): Promise<boolean> {
  const res = await tenantDb(ctx).clinicAppointment.updateMany({
    where: { id: apptId, status: "PENDING" },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  return res.count > 0;
}

// ร้านปฏิเสธนัด (PENDING → REJECTED) — เต็ม/ไม่สะดวก
export async function rejectAppointment(ctx: ClinicCtx, apptId: string): Promise<boolean> {
  const res = await tenantDb(ctx).clinicAppointment.updateMany({
    where: { id: apptId, status: "PENDING" },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });
  return res.count > 0;
}

// ปิดนัด = ตรวจเสร็จ (CONFIRMED → DONE)
export async function completeAppointment(ctx: ClinicCtx, apptId: string): Promise<boolean> {
  const res = await tenantDb(ctx).clinicAppointment.updateMany({
    where: { id: apptId, status: "CONFIRMED" },
    data: { status: "DONE" },
  });
  return res.count > 0;
}

// CRM C2.4 ▸ facade อ่านอย่างเดียว "การเข้าพบคลินิกของ Party นี้" ให้ปฏิทิน CRM (มติผู้คุมงาน C2.4 ข้อ 8 · เส้น crm→clinic)
//   🔴 ใช้ `ClinicVisit` **ไม่ใช่** `ClinicAppointment` — ตารางคำขอนัดสาธารณะไม่มี `partyId` (จับคู่ผู้ติดต่อไม่ได้)
//   🔴 AUDIT-CLASS X8 (ข้อมูลสุขภาพ): คืนแค่ id · เวลา · สถานะ + หัวเรื่องคงที่ภาษาไทย — **ห้าม** `symptom` /
//      `diagnosis` / `feeSatang` / `dispenseJson` / ชื่อ–เบอร์คนไข้ ออกจากฟังก์ชันนี้เด็ดขาด (ปฏิทิน CRM ไม่ใช่เวชระเบียน)
//   🔴 AUDIT-CLASS X1: ผูก `tenantId` ของผู้เรียก + กรองสาขาตามขอบเขตของผู้ดู ⇒ พนักงานที่ไม่ได้ดูแลสาขาคลินิกจะไม่เห็นแถวนี้เลย
//   รูปข้อมูลตรงกับ `PartyAppointment` ใน `src/lib/modules/crm/activities-shared.ts` (ประกาศซ้ำ — clinic ห้าม import จาก crm)
export type PartyAppointmentRow = {
  source: "CLINIC";
  id: string;
  partyId: string;
  unitId: string;
  startAt: Date;
  endAt: Date | null;
  title: string;
  status: string;
};

/** หัวเรื่องคงที่ — ไม่มีข้อมูลสุขภาพใด ๆ (ดูรายละเอียดต้องเข้าโมดูลคลินิกที่มีด่านสิทธิ์ของตัวเอง) */
const CLINIC_VISIT_TITLE = "นัดที่คลินิก";

/**
 * ใบ C2.4 รอบ 2 (F5): `partyIds` รับ `null` = **ทุก Party ในหน้าต่างเวลานี้** (ผู้เรียกกรองด้วยการมองเห็นทีหลัง)
 * 🔴 ทำไมต้องมีทาง `null`: ของเดิมผู้เรียกต้องส่งรายชื่อ Party มาก่อน ⇒ ปฏิทิน CRM ต้องหยิบผู้ติดต่อ 1,000 คนแรกมาทำรายชื่อ
 *    ร้านที่มีลูกค้า 5,000 คนจะไม่เห็นนัดของลูกค้าคนที่ 1,001 ขึ้นไป **เงียบ ๆ** (นัดพรุ่งนี้หายจากปฏิทิน)
 *    ⇒ ทางที่ถูกคือ "ถามช่วงเวลาก่อน แล้วค่อยตัดด้วยการมองเห็น" — เพดานอยู่ที่จำนวนแถวที่ตอบ (`opts.take`) ไม่ใช่จำนวนลูกค้า
 * `partyIds = []` (อาร์เรย์ว่าง) = ไม่มีอะไรให้ถาม ⇒ คืน [] เหมือนเดิม
 */
export async function appointmentsByParty(
  tenantId: string,
  partyIds: string[] | null | undefined,
  range: { from: Date; to: Date },
  opts?: { unitIds?: string[] | "*"; take?: number },
): Promise<PartyAppointmentRow[]> {
  const all = partyIds === null || partyIds === undefined;
  const ids = all ? [] : [...new Set(partyIds.filter((x): x is string => typeof x === "string" && !!x))];
  if (!tenantId || (!all && ids.length === 0)) return [];
  const units = opts?.unitIds;
  if (Array.isArray(units) && units.length === 0) return [];
  const take = Math.min(Math.max(Math.round(Number(opts?.take ?? 500) || 500), 1), 5_000);
  const rows = await prisma.clinicVisit.findMany({
    where: {
      tenantId,
      ...(all ? { partyId: { not: null } } : { partyId: { in: ids } }),
      status: { not: "CANCELLED" },
      visitDate: { gte: range.from, lt: range.to },
      ...(Array.isArray(units) ? { unitId: { in: units } } : {}),
    },
    select: { id: true, unitId: true, partyId: true, visitDate: true, status: true },
    orderBy: [{ visitDate: "asc" }, { id: "asc" }],
    take,
  });
  return rows
    .filter((r): r is typeof r & { partyId: string } => !!r.partyId)
    .map((r) => ({
      source: "CLINIC" as const,
      id: r.id,
      partyId: r.partyId,
      unitId: r.unitId,
      startAt: r.visitDate,
      endAt: null,
      title: CLINIC_VISIT_TITLE,
      status: r.status,
    }));
}
// ◂ CRM C2.4
