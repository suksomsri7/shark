import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { formatThaiDate, thaiDateKey } from "@/lib/ui/date";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { hrScopeOf, isAllBranches } from "@/lib/modules/hr/scope";
import { canManageHrSettings } from "@/lib/modules/hr/settings";
import { loadLawView } from "@/lib/modules/hr/law";
import { LawTableView } from "@/lib/modules/hr/law-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { canSeeLifecycle } from "@/lib/modules/hr/lifecycle"; // HR VIS-5d ▸ same menu as the settings page (lifecycle item = its own gate) ◂
import { SETTINGS_TABS } from "@/lib/modules/hr/settings-view"; // HR VIS-5d ◂
import { ConnectionsMini, SetNavIcon, SettingsFrame, SettingsNav, setNavCls } from "@/lib/modules/hr/settings-ui"; // HR VIS-5d ◂

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
  const tv = await getTranslations("hr.setview"); // HR VIS-5d ◂
  const tabs = SETTINGS_TABS.filter((k) => k !== "life" || canSeeLifecycle(viewer)); // HR VIS-5d ◂
  // HR VIS-5d ▸ law item of the menu = current page ◂
  const lawItem = (
    <Link href={`/app/sys/${id}/hr/settings/law`} aria-current="page" className={setNavCls(true)} data-testid="hr-settings-law-link">
      <SetNavIcon k="law" />
      {t("settingsLink")}
    </Link>
  ); // HR VIS-5d ◂

  return (
    <div className="flex w-full max-w-7xl flex-col gap-5" data-testid="hr-law-page">{/* HR VIS-5d ▸ wide frame (was max-w-3xl) ◂ */}
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} wrap />{/* HR VIS-5d ▸ wrap ◂ */}
      <SettingsFrame nav={<SettingsNav systemId={id} current="law" tabs={tabs} owner={auth.active.role === "OWNER"} lawItem={lawItem} />} aside={<ConnectionsMini ctx={{ tenantId: auth.active.tenantId, systemId: id }} />}>{/* HR VIS-5d ◂ */}
      <div className="flex flex-col gap-1.5">{/* HR VIS-5d ▸ title (mockup .shd) · read-only note instead of "editable without an update" (§4 #4) ◂ */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">
            {t("title")} <span className={`text-base font-normal tracking-normal ${muted}`}>{tv("law.titleNote")}</span>
          </h1>
          <Link href={`/app/sys/${id}/hr/settings`} className="btn btn-ghost min-h-[44px] text-sm" data-testid="hr-law-back">
            {t("backToSettings")}
          </Link>
        </div>
        <p className={`text-[13.5px] ${muted}`}>{t("howPicked")}</p>
        <p className={`text-xs ${muted}`}>
          {t("readOnly")}
          {allBranches ? "" : ` · ${t("sharedBranch")}`} · {t("asOf", { day: formatThaiDate(`${view.onDay}T00:00:00+07:00`) })}
        </p>
      </div>{/* HR VIS-5d ◂ */}
      <p role="note" className="flex items-center gap-2.5 rounded-xl border border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-4 py-3 text-sm text-[color:var(--color-danger)]" data-testid="hr-law-warn">{/* HR VIS-5d ▸ red outline (mockup .warnb) ◂ */}
        ⚠ {t("warn")}
      </p>
      {view.pendingSignOff && (
        <p role="status" className="card p-3 text-sm" data-testid="hr-law-pending">
          {t("pending")}
        </p>
      )}
      <LawTableView view={view} />
      </SettingsFrame>{/* HR VIS-5d ◂ */}
    </div>
  );
}
