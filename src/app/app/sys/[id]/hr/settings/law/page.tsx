import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { formatThaiDate, thaiDateKey } from "@/lib/ui/date";
import { hrTabs } from "@/lib/modules/hr/ui";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { hrScopeOf, isAllBranches } from "@/lib/modules/hr/scope";
import { canManageHrSettings } from "@/lib/modules/hr/settings";
import { loadLawView } from "@/lib/modules/hr/law";
import { LawTableView } from "@/lib/modules/hr/law-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// HR H3.3 ▸ R8 หน้าตารางกฎหมาย (ภาพ 08) — อ่านอย่างเดียว · เปิดได้เท่ากับหน้าตั้งค่า HR (Q8 — ข้อมูลกฎหมายสาธารณะ ไม่มีข้อมูลพนักงาน)
//   ไม่มีฟอร์ม/การบันทึก/ลิงก์หลังบ้าน · แถวที่มีผล = ณ วันนี้ตามวันไทย (งวดเงินเดือนเลือกตามวันจ่ายของงวดเอง) ◂
export default async function HrLawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const viewer = hrViewerOf(auth);
  if (!canManageHrSettings(viewer)) notFound();
  const allBranches = isAllBranches(hrScopeOf(viewer)); // ผู้ดูแลบางสาขาเห็นตารางเดียวกัน (ตารางกลาง ไม่มีข้อมูลสาขา/พนักงาน)
  const t = await getTranslations("hr.law");
  const def = systemDef(sys.type);
  const today = thaiDateKey(new Date());
  const view = await loadLawView(today);
  const muted = "text-[color:var(--color-muted)]";

  return (
    <div className="flex max-w-3xl flex-col gap-5" data-testid="hr-law-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={hrTabs(id)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <Link href={`/app/sys/${id}/hr/settings`} className="btn btn-ghost min-h-[44px] text-sm" data-testid="hr-law-back">
          {t("backToSettings")}
        </Link>
      </div>
      <div className={`flex flex-col gap-1 text-sm ${muted}`}>
        <p>{t("howPicked")}</p>
        <p>{t("whtMethod")}</p>
        <p>{t("readOnly")}</p>
        <p>{t(allBranches ? "sharedAll" : "sharedBranch")}</p>
        <p className="text-xs">{t("asOf", { day: formatThaiDate(`${view.onDay}T00:00:00+07:00`) })}</p>
      </div>
      <p role="note" className="card bg-[color:var(--color-note)] p-3 text-sm text-[color:var(--color-note-ink)]" data-testid="hr-law-warn">
        ⚠ {t("warn")}
      </p>
      {view.pendingSignOff && (
        <p role="status" className="card p-3 text-sm" data-testid="hr-law-pending">
          {t("pending")}
        </p>
      )}
      <LawTableView view={view} />
    </div>
  );
}
