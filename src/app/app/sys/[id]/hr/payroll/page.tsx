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
import { OpeningYtdCard } from "@/lib/modules/hr/payroll-opening-ui"; // HR H3.4-YTD ▸ ยอดยกมาต้นปี (ด่านเดียวกับแบบยื่น) ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
// HR H3.1 ▸ แผงชั่วโมงทำงานของงวด (ภาพ 06) — ?period=YYYY-MM (ค่าปริยาย = เดือนนี้ตามเวลาไทย) · ผลการกด ?we= รหัสสั้นจาก WE_MSG เท่านั้น ◂
import { WorkEntriesPanel, WE_MSG, weMsgCode } from "@/lib/modules/hr/work-entries-ui";
import { buildWorkEntriesAction, finalizeWorkEntriesAction } from "@/lib/modules/hr/work-entries-actions";
import { thaiDateKey } from "@/lib/ui/date";
import { getLocale, getTranslations } from "next-intl/server"; // HR VIS-5a ▸ getLocale (F9) ◂
// HR H3.4 ▸ รอบจ่ายรุ่น 2 (ภาพ 06) — ส่วน payroll-run-ui · ผลการกด ?r2= รหัสคงที่ (RUN2_MSG) · ?run= รอบที่เลือก ◂
import { PayrollRunSection, RUN2_MSG, run2MsgCode } from "@/lib/modules/hr/payroll-run-ui";
import { approveRunV2Action, confirmBranchHoursAction, createPayrollRunV2Action, payRunV2Action, recomputeRunV2Action, reverseRunV2Action } from "@/lib/modules/hr/payroll-actions";
import { syncAttendanceDeductionsAction } from "@/lib/modules/hr/attendance-pay-actions";
// HR VIS-5a ▸ one page, sub-views ?view= (run · hours · adjust · profiles · docs · ytd · history) — nav shows a view only when an existing gate of its sections passes ◂
import { PAY_VIEWS, payViewOf, type PayView } from "@/lib/modules/hr/pay-run-view";
import { canViewPayroll } from "@/lib/core/rbac";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { canReadWorkEntries } from "@/lib/modules/hr/work-entries";
import { canRequestStockCharge, canSeeStockCharges } from "@/lib/modules/hr/stock-charge";
import { canUseBankFiles } from "@/lib/modules/hr/bank-files/service";
import { canUseFilings } from "@/lib/modules/hr/filings/service";
import { canUseSalaryCerts } from "@/lib/modules/hr/payslip";
import { getPayrollEngine } from "@/lib/modules/hr/payroll";

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
    redirect(`/app/sys/${id}/hr/payroll?view=hours&period=${period}&${r.ok ? `we=fin&n=${r.finalized}` : `we=${encodeURIComponent(weMsgCode(r.reason))}`}`); // HR VIS-5a ▸ ?view=hours ◂
  };
  // HR VIS-5a ▸ both work-entry redirects land on ?view=hours ◂
  const onBuild = async (fd: FormData) => {
    "use server";
    const r = await buildWorkEntriesAction(fd);
    redirect(`/app/sys/${id}/hr/payroll?view=hours&period=${period}&${r.ok ? (r.next ? `we=more&n=${r.written}&after=${encodeURIComponent(r.next)}` : `we=ok&n=${r.written}&r=${r.blocking}`) : `we=${encodeURIComponent(weMsgCode(r.reason))}`}`); // HR VIS-5a ▸ ?view=hours ◂
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

  // HR VIS-5a ▸ view + nav per viewer (existing gates only — rulings r2 §4) · sections keep their own gates inside ◂
  const view = payViewOf(sp);
  const membership = { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> };
  const viewer = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const payViewer = canViewPayroll(membership);
  const [engine, bankOk, filingOk, certOk] = await Promise.all([getPayrollEngine(ctx), canUseBankFiles(ctx, viewer), canUseFilings(ctx, viewer), canUseSalaryCerts(ctx, viewer)]);
  const v2 = engine.engineVersion === 2;
  const navOn: Record<PayView, boolean> = {
    run: true,
    hours: canReadWorkEntries(viewer) || payViewer,
    adjust: payViewer || canRequestStockCharge(viewer) || canSeeStockCharges(viewer),
    profiles: payViewer,
    docs: bankOk || filingOk || certOk,
    ytd: filingOk,
    history: payViewer && v2, // engine-1 shops: the run view already lists runs (ruling r2 §3) — ?view=history still renders
  };
  const tView = await getTranslations("hr.payview");
  const loc = await getLocale(); // HR VIS-5a ▸ F9: period labels in the legacy parts ◂
  const wide = view === "run" || view === "hours" || view === "docs";
  const tabCls = (on: boolean) => `inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 text-sm ${on ? "bg-[color:var(--color-surface)] font-semibold shadow-sm" : "text-[color:var(--color-muted)]"}`;

  return (
    <div className="flex w-full max-w-[1200px] flex-col gap-5">{/* HR VIS-5a ▸ F8: header + sub-nav always use the full content width; only the forms of narrow views stay max-w-2xl (below) ◂ */}
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={tView("desc")} />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      {/* HR VIS-5a ▸ sub-nav (attendance pattern: ?view= links · aria-current · 44 px · wraps, no scroller) ◂ */}
      <nav className="flex flex-wrap items-center gap-1 self-start rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-stage)] p-1" aria-label={tView("nav")}>
        {PAY_VIEWS.filter((v) => navOn[v]).map((v) => (
          <a key={v} href={`/app/sys/${id}/hr/payroll?view=${v}&period=${period}`} data-testid={`hr-pay-view-${v}`} aria-current={view === v ? "page" : undefined} className={tabCls(view === v)}>
            {tView(v)}
          </a>
        ))}
      </nav>
      <div className={wide ? "contents" : "flex w-full max-w-2xl flex-col gap-5"}>{/* HR VIS-5a ▸ F8 ◂ */}
      {/* HR VIS-5a ▸ run view: viewer without payroll access sees the PayrollSection no-access notice here only · engine-1 shop = legacy create + runs ◂ */}
      {view === "run" && (!payViewer || !v2) && <PayrollSection systemId={id} locale={loc} parts={["create", "runs"]} />}
      {view === "hours" && (<>{/* HR VIS-5a ▸ hours = work-entry panel + attendance part ◂ */}
      <WorkEntriesPanel systemId={id} periodKey={period} flash={weFlash} onBuild={onBuild} after={weAfter} onFinalize={onFinalize} /> {/* HR H3.1 ◂ */}
      {payViewer && <PayrollSection systemId={id} locale={loc} parts={["attendance"]} />}
      </>)}{/* HR VIS-5a ◂ */}
      {view === "run" && (<>{/* HR VIS-5a ▸ run view ◂ */}
      <PayrollRunSection systemId={id} periodKey={period} runId={runSel} flash={r2Flash} flashOk={r2Ok} actions={run2Actions} emp={/^[A-Za-z0-9_-]{1,64}$/.test(one(sp.emp) ?? "") ? one(sp.emp)! : ""} /> {/* HR H3.4 ▸ รอบจ่ายรุ่น 2 (payroll-run-ui) ◂ */}{/* HR VIS-5a ▸ ?emp= drawer (run-ui shows it only for a row of the viewer's own preview) ◂ */}
      </>)}{/* HR VIS-5a ◂ */}
      {view === "adjust" && (<>{/* HR VIS-5a ▸ adjust = additions/deductions part + stock charges ◂ */}
      {payViewer && <PayrollSection systemId={id} locale={loc} parts={["adjust"]} />}
      {/* HR H4.6 ▸ ฟอร์ม = ผู้ถือคีย์ยื่นรายการ · รายการ/ยอด = ผู้ดูเงินเดือน (ด่านในตัว) ◂ */}
      <StockChargeSection systemId={id} msg={one(sp.stock)} q={one(sp.stockq)} inv={one(sp.stockinv)} />
      </>)}{/* HR VIS-5a ◂ */}
      {view === "docs" && (<>{/* HR VIS-5a ▸ docs = bank file · filings · salary certificates ◂ */}
      {/* HR H3.5 ▸ ไฟล์โอนเงินเดือน — ?bank=<รอบ> · ?bfmt= · ?beff= · ?benc= · ?bmode= · ?bera= · ?bbranch= · ?bmsg=<รหัสสั้น> (allowlist ใน ui) · ?bfile=<ไฟล์ที่เพิ่งสร้าง> ◂ */}
      <BankFileSection systemId={id} sp={{ bank: one(sp.bank), bfmt: one(sp.bfmt), beff: one(sp.beff), benc: one(sp.benc), bmode: one(sp.bmode), bera: one(sp.bera), bbranch: one(sp.bbranch), bmsg: one(sp.bmsg), bfile: one(sp.bfile) }} /> {/* HR H3.5 ◂ */}
      </>)}{/* HR VIS-5a ◂ */}
      {/* HR H3.6 ▸ ยื่นภาษี/ประกันสังคม — ?fk=<แบบ> · ?fp=<งวด> · ?frun=<รอบ> · ?ty=<ปีภาษี> · ?fperson= · ?fmsg=<รหัสผล> (allowlist ใน ui) · ?ffile=<ไฟล์ที่เพิ่งสร้าง> ◂ */}
      {view === "ytd" && (<>{/* HR VIS-5a ▸ ytd = opening figures ◂ */}
      {/* HR H3.4-YTD ▸ ยอดยกมาต้นปี (ก่อนใช้ระบบ) — ?yty=<ปีภาษี> · ?ymsg=<รหัสผล> (allowlist ใน ui) · ?yn=<จำนวนที่บันทึก> ◂ */}
      <OpeningYtdCard systemId={id} sp={{ yty: one(sp.yty), ymsg: one(sp.ymsg), yn: one(sp.yn) }} /> {/* HR H3.4-YTD ◂ */}
      </>)}{/* HR VIS-5a ◂ */}
      {view === "docs" && (<>{/* HR VIS-5a ▸ docs (cont.) ◂ */}
      <FilingSection systemId={id} sp={{ fk: one(sp.fk), fp: one(sp.fp), frun: one(sp.frun), fmsg: one(sp.fmsg), fflds: one(sp.fflds), fdoc: one(sp.fdoc), fbi: one(sp.fbi), fbs: one(sp.fbs), ffile: one(sp.ffile), ty: one(sp.ty), fperson: one(sp.fperson), fstop: one(sp.fstop) }} /> {/* HR H3.6 ◂ */}
      {/* HR H3.8 ▸ หนังสือรับรองเงินเดือน — คำขอ (ออก/ไม่อนุมัติ) · ออกใหม่ · ใบที่ออก (ดาวน์โหลด/ยกเลิก) · ?sc=<รหัสผล> (allowlist ใน payslip-ui) ◂ */}
      <SalaryCertSection systemId={id} sc={one(sp.sc)} />
      </>)}{/* HR VIS-5a ◂ */}
      {view === "profiles" && payViewer && <PayrollSection systemId={id} locale={loc} parts={["profiles"]} />}{/* HR VIS-5a ▸ profiles ◂ */}
      {view === "history" && payViewer && <PayrollSection systemId={id} locale={loc} parts={["create", "runs"]} />}{/* HR VIS-5a ▸ history = create + run list (v1 runs, exclusions, stranded, slip chips) ◂ */}
      </div>{/* HR VIS-5a ▸ F8 ◂ */}
    </div>
  );
}
