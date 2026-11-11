// KdsLegacyBanner.tsx — แถบบนของจอครัวเดิม /restaurant/kds (POS P2.6U · มติ 1 · H7): ลิงก์ "เปิดจอครัวใหม่" อย่างเดียว (หน้าเดิมไม่เปลี่ยนอย่างอื่น)
//   แสดงเมื่อสาขานี้ผูกระบบ POS ที่เปิดหน้าขายใหม่ (registerV2) — ไม่งั้นไม่แสดง (จอใหม่จะ 404) · ข้อความเจ้าของ H7: จอเดิมเดินรายการที่ชำระแล้วไม่ได้
//   🔴 server component (ไม่มี 'use client') · ไม่มีข้อความไทยในไฟล์ (ST7)
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/core/db";
import { systemForUnit } from "@/lib/modules/system/service";
import { posRegisterV2On } from "@/lib/modules/pos/register-shared";

export async function KdsLegacyBanner({ tenantId, unitId }: { tenantId: string; unitId: string }) {
  const posId = await systemForUnit(tenantId, unitId, "POS");
  if (!posId) return null;
  const sys = await prisma.appSystem.findFirst({ where: { id: posId, tenantId, type: "POS" }, select: { id: true, active: true, settings: true } });
  if (!sys || !(sys.active && posRegisterV2On(sys.settings))) return null;
  const t = await getTranslations("pos.kds.legacyBanner");
  return (
    <div data-testid="pos-kds-legacy-banner" className="card flex flex-col gap-2 text-sm md:flex-row md:items-center">
      <span className="min-w-0 flex-1 text-[color:var(--color-ink-soft)]">{t("text")}</span>
      <Link data-testid="pos-kds-legacy-open" href={`/app/sys/${sys.id}/pos/kds?unit=${encodeURIComponent(unitId)}`} className="btn btn-primary h-11 shrink-0 rounded-[11px] px-4 text-[14px] font-semibold">
        {t("open")}
      </Link>
    </div>
  );
}
