import type { BusinessUnit, Tenant, UnitType } from "@prisma/client";
import { prisma } from "./db";

// resolve ร้าน+สาขาสาธารณะจาก slug (public/no-auth) — "คิวรีเดียว" แทนของเดิมที่ยิง 2 ครั้งเรียงกัน
//
// ทำไม: หน้า storefront ทุกหน้าเริ่มด้วยการ resolve slug และ DB อยู่สิงคโปร์ —
// ทุก round-trip ที่ตัดได้คือเวลาที่ลูกค้าไม่ต้องรอ หน้า /s/[t]/[u] เดิมเรียก resolver 5 ตัว
// เรียงกัน = 10 round-trip ก่อนจะเริ่ม render
//
// กติกาความปลอดภัยเดิมคงไว้ทุกข้อ: tenant ต้อง ACTIVE · unit ต้อง ACTIVE · type ต้องตรง (ถ้าระบุ)
export async function resolvePublicUnit(
  tenantSlug: string,
  unitSlug: string,
  type?: UnitType,
): Promise<{ tenant: Tenant; unit: BusinessUnit } | null> {
  const t = (tenantSlug ?? "").trim();
  const u = (unitSlug ?? "").trim();
  if (!t || !u) return null;

  const unit = await prisma.businessUnit.findFirst({
    where: {
      slug: u,
      status: "ACTIVE",
      ...(type ? { type } : {}),
      tenant: { slug: t, status: "ACTIVE" },
    },
    include: { tenant: true },
  });
  if (!unit) return null;

  const { tenant, ...rest } = unit;
  return { tenant, unit: rest as BusinessUnit };
}
