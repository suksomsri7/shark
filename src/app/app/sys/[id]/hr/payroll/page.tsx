import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabs } from "@/lib/modules/hr/ui";
import { PayrollSection } from "@/lib/modules/hr/payroll-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
// HR H3.1 ▸ แผงชั่วโมงทำงานของงวด (ภาพ 06) — ?period=YYYY-MM (ค่าปริยาย = เดือนนี้ตามเวลาไทย) · ผลการกด ?we= รหัสสั้นจาก WE_MSG เท่านั้น ◂
import { WorkEntriesPanel, WE_MSG, weMsgCode } from "@/lib/modules/hr/work-entries-ui";
import { buildWorkEntriesAction } from "@/lib/modules/hr/work-entries-actions";
import { thaiDateKey } from "@/lib/ui/date";
import { getTranslations } from "next-intl/server";

// หน้าย่อย "เงินเดือน" ของระบบ HR — โปรไฟล์เงินเดือน + รอบจ่าย + สลิป
// 🔒 PayrollSection มี canViewPayroll guard ในตัว (PDPA — เห็นเฉพาะ OWNER/ผู้มีสิทธิ์)
export default async function HrPayrollPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; we?: string; n?: string; r?: string; after?: string }> }) {
  const { id } = await params;
  const sp = await searchParams; // HR H3.1 ◂
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  // HR H3.1 ▸ งวดของแผงชั่วโมงทำงาน + ผลการกด (ตัวเลขเป็นจำนวนเต็มจาก URL เท่านั้น) ◂
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.period ?? "") ? sp.period! : thaiDateKey().slice(0, 7);
  const tWe = await getTranslations("hr.we");
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : 0);
  const weAfter = sp.we === "more" && typeof sp.after === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(sp.after) ? sp.after : ""; // ดึงยังไม่ครบ (r2 7)
  const weFlash = sp.we === "more" ? tWe("more", { n: num(sp.n) }) : sp.we === "ok" ? tWe("built", { n: num(sp.n), review: num(sp.r) }) : typeof sp.we === "string" && Object.prototype.hasOwnProperty.call(WE_MSG, sp.we) ? WE_MSG[sp.we]! : "";
  const onBuild = async (fd: FormData) => {
    "use server";
    const r = await buildWorkEntriesAction(fd);
    redirect(`/app/sys/${id}/hr/payroll?period=${period}&${r.ok ? (r.next ? `we=more&n=${r.written}&after=${encodeURIComponent(r.next)}` : `we=ok&n=${r.written}&r=${r.blocking}`) : `we=${encodeURIComponent(weMsgCode(r.reason))}`}`);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="เงินเดือน — โปรไฟล์ + รอบจ่าย + สลิป" />
      <ModuleTabs items={hrTabs(id)} />
      <PayrollSection systemId={id} />
      <WorkEntriesPanel systemId={id} periodKey={period} flash={weFlash} onBuild={onBuild} after={weAfter} /> {/* HR H3.1 ◂ */}
    </div>
  );
}
