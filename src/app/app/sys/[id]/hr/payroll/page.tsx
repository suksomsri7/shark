import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { PayrollSection } from "@/lib/modules/hr/payroll-ui";
import { StockChargeSection } from "@/lib/modules/hr/stock-charge-ui"; // HR H4.6 ▸ หักค่าของ/ค่าเสียหาย ◂
import { BankFileSection } from "@/lib/modules/hr/bank-files/ui"; // HR H3.5 ▸ ไฟล์โอนเงินเดือน (ด่านในตัว: OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) ◂
import { FilingSection } from "@/lib/modules/hr/filings/ui"; // HR H3.6 ▸ ยื่นภาษี/ประกันสังคม (ด่านเดียวกับไฟล์โอน) ◂
import { SalaryCertSection } from "@/lib/modules/hr/payslip-ui"; // HR H3.8 ▸ หนังสือรับรองเงินเดือน (ด่านในตัว: OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา) ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
// HR H3.1 ▸ แผงชั่วโมงทำงานของงวด (ภาพ 06) — ?period=YYYY-MM (ค่าปริยาย = เดือนนี้ตามเวลาไทย) · ผลการกด ?we= รหัสสั้นจาก WE_MSG เท่านั้น ◂
import { WorkEntriesPanel, WE_MSG, weMsgCode } from "@/lib/modules/hr/work-entries-ui";
import { buildWorkEntriesAction, finalizeWorkEntriesAction } from "@/lib/modules/hr/work-entries-actions";
import { thaiDateKey } from "@/lib/ui/date";
import { getTranslations } from "next-intl/server";
// HR H3.4 ▸ รอบจ่ายรุ่น 2 (ภาพ 06) — ส่วน payroll-run-ui · ผลการกด ?r2= รหัสคงที่ (RUN2_MSG) · ?run= รอบที่เลือก ◂
import { PayrollRunSection, RUN2_MSG, run2MsgCode } from "@/lib/modules/hr/payroll-run-ui";
import { approveRunV2Action, confirmBranchHoursAction, createPayrollRunV2Action, payRunV2Action, recomputeRunV2Action, reverseRunV2Action } from "@/lib/modules/hr/payroll-actions";
import { syncAttendanceDeductionsAction } from "@/lib/modules/hr/attendance-pay-actions";

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
  // HR H3.4 ▸ ปุ่มของรอบจ่ายรุ่น 2 — ทุกปุ่ม redirect กลับพร้อมรหัสผล (ไม่มีข้อความอิสระบน URL) ◂
  const tRun2 = await getTranslations("hr.run2");
  const r2 = one(sp.r2) ?? "";
  const r2Ok = ["created", "done", "approved", "synced"].includes(r2);
  const r2Flash = r2Ok ? tRun2(r2) : r2 ? (RUN2_MSG[r2] ?? tRun2("failed")) : "";
  const runSel = /^[A-Za-z0-9_-]{1,64}$/.test(one(sp.run) ?? "") ? one(sp.run)! : "";
  const back2 = (code: string, run = runSel): never => redirect(`/app/sys/${id}/hr/payroll?period=${period}${run ? `&run=${encodeURIComponent(run)}` : ""}&r2=${encodeURIComponent(code)}#hr-run2`);
  const run2Actions = {
    create: async (fd: FormData) => {
      "use server";
      const r = await createPayrollRunV2Action(fd);
      back2(r.ok ? "created" : run2MsgCode(r.reason), r.ok ? r.id : runSel);
    },
    rebuild: async (fd: FormData) => {
      "use server";
      const r = await recomputeRunV2Action(fd);
      back2(r.ok ? "done" : run2MsgCode(r.reason), String(fd.get("runId") ?? ""));
    },
    approve: async (fd: FormData) => {
      "use server";
      const r = await approveRunV2Action(fd);
      back2(r.ok ? "approved" : run2MsgCode(r.reason), String(fd.get("runId") ?? ""));
    },
    pay: async (fd: FormData) => {
      "use server";
      const r = await payRunV2Action(fd); // fix r1 F7: ผลจริง (ปฏิเสธ = role=alert)
      back2(r.ok ? "done" : run2MsgCode(r.reason), String(fd.get("runId") ?? ""));
    },
    reverse: async (fd: FormData) => {
      "use server";
      const r = await reverseRunV2Action(fd); // fix r1 F7: CARRY_BOUND · LATER_RUN · สิทธิ์ = ข้อความคงที่
      back2(r.ok ? "done" : run2MsgCode(r.reason), String(fd.get("runId") ?? ""));
    },
    confirm: async (fd: FormData) => {
      "use server";
      const r = await confirmBranchHoursAction(fd);
      back2(r.ok ? "done" : run2MsgCode(r.reason), String(fd.get("runId") ?? ""));
    },
    sync: async (fd: FormData) => {
      "use server";
      // ดึงชั่วโมงทำงานจนครบทุกหน้า → คำนวณรายการหักสาย/ขาดจนครบทุกหน้า (วน next — D-H32-ui-payroll)
      for (let i = 0, after = ""; i < 100; i += 1) {
        const f = new FormData();
        f.set("systemId", id);
        f.set("periodKey", period);
        if (after) f.set("after", after);
        const b = await buildWorkEntriesAction(f);
        if (!b.ok) back2(run2MsgCode(b.reason));
        if (!b.ok || !b.next) break;
        after = b.next;
      }
      for (let i = 0, after = ""; i < 100; i += 1) {
        const f = new FormData();
        f.set("systemId", id);
        f.set("periodKey", period);
        if (after) f.set("after", after);
        const s = await syncAttendanceDeductionsAction(f);
        if (!s.ok) back2(run2MsgCode(s.reason));
        if (!s.ok || !s.next) break;
        after = s.next;
      }
      back2("synced");
    },
  };
  // ◂ HR H3.4

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="เงินเดือน — โปรไฟล์ + รอบจ่าย + สลิป" />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <PayrollSection systemId={id} />
      <WorkEntriesPanel systemId={id} periodKey={period} flash={weFlash} onBuild={onBuild} after={weAfter} onFinalize={onFinalize} /> {/* HR H3.1 ◂ */}
      <PayrollRunSection systemId={id} periodKey={period} runId={runSel} flash={r2Flash} flashOk={r2Ok} actions={run2Actions} /> {/* HR H3.4 ▸ รอบจ่ายรุ่น 2 (payroll-run-ui) ◂ */}
      {/* HR H4.6 ▸ ฟอร์ม = ผู้ถือคีย์ยื่นรายการ · รายการ/ยอด = ผู้ดูเงินเดือน (ด่านในตัว) ◂ */}
      <StockChargeSection systemId={id} msg={one(sp.stock)} q={one(sp.stockq)} inv={one(sp.stockinv)} />
      {/* HR H3.5 ▸ ไฟล์โอนเงินเดือน — ?bank=<รอบ> · ?bfmt= · ?beff= · ?benc= · ?bmode= · ?bera= · ?bbranch= · ?bmsg=<รหัสสั้น> (allowlist ใน ui) · ?bfile=<ไฟล์ที่เพิ่งสร้าง> ◂ */}
      <BankFileSection systemId={id} sp={{ bank: one(sp.bank), bfmt: one(sp.bfmt), beff: one(sp.beff), benc: one(sp.benc), bmode: one(sp.bmode), bera: one(sp.bera), bbranch: one(sp.bbranch), bmsg: one(sp.bmsg), bfile: one(sp.bfile) }} /> {/* HR H3.5 ◂ */}
      {/* HR H3.6 ▸ ยื่นภาษี/ประกันสังคม — ?fk=<แบบ> · ?fp=<งวด> · ?frun=<รอบ> · ?ty=<ปีภาษี> · ?fperson= · ?fmsg=<รหัสผล> (allowlist ใน ui) · ?ffile=<ไฟล์ที่เพิ่งสร้าง> ◂ */}
      <FilingSection systemId={id} sp={{ fk: one(sp.fk), fp: one(sp.fp), frun: one(sp.frun), fmsg: one(sp.fmsg), fflds: one(sp.fflds), fdoc: one(sp.fdoc), fbi: one(sp.fbi), fbs: one(sp.fbs), ffile: one(sp.ffile), ty: one(sp.ty), fperson: one(sp.fperson), fstop: one(sp.fstop) }} /> {/* HR H3.6 ◂ */}
      {/* HR H3.8 ▸ หนังสือรับรองเงินเดือน — คำขอ (ออก/ไม่อนุมัติ) · ออกใหม่ · ใบที่ออก (ดาวน์โหลด/ยกเลิก) · ?sc=<รหัสผล> (allowlist ใน payslip-ui) ◂ */}
      <SalaryCertSection systemId={id} sc={one(sp.sc)} />
    </div>
  );
}
