"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as clinic from "./service";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

function assertClinicCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "clinic", action, unitId },
  );
}

// ───────────────────────── ผู้ป่วย ─────────────────────────
const patientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(30),
  birthYear: z.coerce.number().int().min(1900).max(2200).optional(),
  allergies: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function createPatientAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertClinicCan(auth, unit.id, "clinic.patient.create");
  const p = patientSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    birthYear: formData.get("birthYear") || undefined,
    allergies: formData.get("allergies") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!p.success) return;
  try {
    await clinic.createPatient(ctxOf(auth, unit.id), {
      name: p.data.name,
      phone: p.data.phone,
      birthYear: p.data.birthYear ?? null,
      allergies: p.data.allergies ?? null,
      note: p.data.note ?? null,
    });
  } catch {
    // validation ชั้น service → กลับหน้าเดิม
  }
  revalidatePath(`/app/u/${unitSlug}/clinic`);
}

// ───────────────────────── visit ─────────────────────────
const visitSchema = z.object({
  patientId: z.string().trim().min(1).max(40),
  symptom: z.string().trim().min(1).max(500),
  feeBaht: z.coerce.number().min(0).max(10_000_000).optional(),
});

export async function createVisitAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertClinicCan(auth, unit.id, "clinic.visit.create");
  const p = visitSchema.safeParse({
    patientId: formData.get("patientId"),
    symptom: formData.get("symptom"),
    feeBaht: formData.get("feeBaht") || undefined,
  });
  if (!p.success) return;
  try {
    await clinic.createVisit(ctxOf(auth, unit.id), {
      patientId: p.data.patientId,
      symptom: p.data.symptom,
      feeSatang: p.data.feeBaht ? Math.round(p.data.feeBaht * 100) : 0,
    });
  } catch {
    // validation ชั้น service → กลับหน้าเดิม
  }
  revalidatePath(`/app/u/${unitSlug}/clinic`);
}

// ───────────────────────── จ่ายยา ─────────────────────────
const dispenseSchema = z.object({
  visitId: z.string().trim().min(1).max(40),
  invItemId: z.string().trim().min(1).max(40),
  qty: z.coerce.number().int().min(1).max(100_000),
});

export async function dispenseAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertClinicCan(auth, unit.id, "clinic.dispense");
  const p = dispenseSchema.safeParse({
    visitId: formData.get("visitId"),
    invItemId: formData.get("invItemId"),
    qty: formData.get("qty"),
  });
  if (!p.success) return;
  try {
    await clinic.dispense(ctxOf(auth, unit.id), p.data.visitId, [
      { invItemId: p.data.invItemId, qty: p.data.qty },
    ]);
  } catch {
    // ไม่มีคลัง/visit ปิด → กลับหน้าเดิม
  }
  revalidatePath(`/app/u/${unitSlug}/clinic`);
}

// ───────────────────────── เก็บเงิน ─────────────────────────
export async function billVisitAction(unitSlug: string, visitId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertClinicCan(auth, unit.id, "clinic.bill");
  try {
    await clinic.billVisit(ctxOf(auth, unit.id), visitId);
  } catch {
    // ไม่มี POS → กลับหน้าเดิม
  }
  revalidatePath(`/app/u/${unitSlug}/clinic`);
}

// ───────────────────────── คืนเงิน / void ─────────────────────────
// คืนเงินหลังเก็บเงิน — void PosSale + คืนยาเข้าคลัง · error inline ผ่าน ?err=
export async function refundVisitAction(unitSlug: string, visitId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertClinicCan(auth, unit.id, "clinic.refund");
  const res = await clinic.refundVisit(ctxOf(auth, unit.id), visitId);
  revalidatePath(`/app/u/${unitSlug}/clinic`);
  if (!res.ok) {
    redirect(`/app/u/${unitSlug}/clinic?err=${encodeURIComponent(res.reason ?? "คืนเงินไม่สำเร็จ")}`);
  }
}
