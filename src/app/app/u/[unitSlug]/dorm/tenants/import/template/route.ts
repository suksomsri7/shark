// SVC D.4 ▸ ดาวน์โหลดแม่แบบ CSV ของการนำเข้า (GET) — ด่านเดียวกับหน้า: requireUnit + หน่วย DORM + สิทธิ์ dorm.import (ไม่ผ่าน ⇒ 404)
//   เนื้อหา = importTemplateCsv() (BOM + หัว 11 คอลัมน์ตามภาพ 12 · ทุกช่องผ่านตัวกันสูตร) · ไม่มีข้อมูลของร้าน
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { importTemplateCsv } from "@/lib/modules/dorm";

export async function GET(_req: Request, { params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (unit.type !== "DORM" || !evaluate(m, { module: "dorm", action: "dorm.import", unitId: unit.id })) notFound();
  return new Response(importTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dorm-import-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
