import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { PayrollSection } from "@/lib/modules/hr/payroll-ui";
import { StockChargeSection } from "@/lib/modules/hr/stock-charge-ui"; // HR H4.6 ▸ หักค่าของ/ค่าเสียหาย ◂
import { BankFileSection } from "@/lib/modules/hr/bank-files/ui"; // HR H3.5 ▸ ไฟล์โอนเงินเดือน (ด่านในตัว: OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
// HR H3.1 ▸ แผงชั่วโมงทำงานของงวด (ภาพ 06) — ?period=YYYY-MM (ค่าปริยาย = เดือนนี้ตามเวลาไทย) · ผลการกด ?we= รหัสสั้นจาก WE_MSG เท่านั้น ◂
import { WorkEntriesPanel, WE_MSG, weMsgCode } from "@/lib/modules/hr/work-entries-ui";
import { buildWorkEntriesAction, finalizeWorkEntriesAction } from "@/lib/modules/hr/work-entries-actions";
import { thaiDateKey } from "@/lib/ui/date";
import { getTranslations } from "next-intl/server";

// หน้าย่อย "เงินเดือน" ของระบบ HR — โปรไฟล์เงินเดือน + รอบจ่าย + สลิป
// 🔒 PayrollSection มี canViewPayroll guard ในตัว (PDPA — เห็นเฉพาะ OWNER/ผู้มีสิทธิ์)
export default async function HrPayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>; // HR H4.6 ▸ ?stock=<รหัสผล> · ?stockq=<ค้นสินค้า> · ?stockinv=<คลังที่เลือก> ◂
}) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  // HR H3.1 ◂ (sp ใช้ร่วมกับ H4.6)
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  // HR H3.1 ▸ งวดของแผงชั่วโมงทำงาน + ผลการกด (ตัวเลขเป็นจำนวนเต็มจาก URL เท่านั้น) ◂
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp.period) ?? "") ? one(sp.period)! : thaiDateKey().slice(0, 7);
  const tWe = await getTranslations("hr.we");
  const num = (v: unknown) => (typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : 0);
  const weAfter = one(sp.we) === "more" && /^[A-Za-z0-9_-]{1,64}$/.test(one(sp.after) ?? "") ? one(sp.after)! : ""; // ดึงยังไม่ครบ (r2 7)
  const weCode = one(sp.we) ?? "";
  const weFlash = weCode === "fin" ? tWe("finalized", { n: num(one(sp.n)) }) : weCode === "more" ? tWe("more", { n: num(one(sp.n)) }) : weCode === "ok" ? tWe("built", { n: num(one(sp.n)), review: num(one(sp.r)) }) : Object.prototype.hasOwnProperty.call(WE_MSG, weCode) ? WE_MSG[weCode]! : "";
  const onFinalize = async (fd: FormData) => {
    "use server";
    const r = await finalizeWorkEntriesAction(fd);
    redirect(`/app/sys/${id}/hr/payroll?period=${period}&${r.ok ? `we=fin&n=${r.finalized}` : `we=${encodeURIComponent(weMsgCode(r.reason))}`}`);
  };
  const onBuild = async (fd: FormData) => {
    "use server";
    const r = await buildWorkEntriesAction(fd);
    redirect(`/app/sys/${id}/hr/payroll?period=${period}&${r.ok ? (r.next ? `we=more&n=${r.written}&after=${encodeURIComponent(r.next)}` : `we=ok&n=${r.written}&r=${r.blocking}`) : `we=${encodeURIComponent(weMsgCode(r.reason))}`}`);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="เงินเดือน — โปรไฟล์ + รอบจ่าย + สลิป" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <PayrollSection systemId={id} />
      <WorkEntriesPanel systemId={id} periodKey={period} flash={weFlash} onBuild={onBuild} after={weAfter} onFinalize={onFinalize} /> {/* HR H3.1 ◂ */}
      {/* HR H4.6 ▸ ฟอร์ม = ผู้ถือคีย์ยื่นรายการ · รายการ/ยอด = ผู้ดูเงินเดือน (ด่านในตัว) ◂ */}
      <StockChargeSection systemId={id} msg={one(sp.stock)} q={one(sp.stockq)} inv={one(sp.stockinv)} />
      {/* HR H3.5 ▸ ไฟล์โอนเงินเดือน — ?bank=<รอบ> · ?bfmt= · ?beff= · ?benc= · ?bmode= · ?bera= · ?bbranch= · ?bmsg=<รหัสสั้น> (allowlist ใน ui) · ?bfile=<ไฟล์ที่เพิ่งสร้าง> ◂ */}
      <BankFileSection systemId={id} sp={{ bank: one(sp.bank), bfmt: one(sp.bfmt), beff: one(sp.beff), benc: one(sp.benc), bmode: one(sp.bmode), bera: one(sp.bera), bbranch: one(sp.bbranch), bmsg: one(sp.bmsg), bfile: one(sp.bfile) }} /> {/* HR H3.5 ◂ */}
    </div>
  );
}
