// HR VIS-5c ▸ ลิงก์/ฟอร์มเอกสารแนบย้ายไป people-ui (ProfileDocsTab) ◂
import { notFound, redirect } from "next/navigation"; // HR H2.10 ▸ redirect โปรไฟล์ของตัวเอง ◂
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrProfileScheduleTab, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂ · HR VIS-5c ▸ แท็บตารางงาน ◂
// HF-HR-0 (D4): ด่านสิทธิ์ + DTO รายช่อง — ห้ามส่งแถว HrEmployee ดิบให้ client component
import { hrViewerOf, loadEmployeeProfileForViewer } from "@/lib/modules/hr/privacy";
import { hrScopeOf, isAllBranches, unitsForScope } from "@/lib/modules/hr/scope"; // HR H1.1 ▸ ตัวเลือกสาขาประจำตามขอบเขตผู้แก้ ◂
// HR VIS-5c ▸ เอกสารแนบ (addEmployeeDocAction/removeEmployeeDocAction) ผูกตรงใน ProfileDocsTab ◂
import EmployeeProfileForm from "@/lib/modules/hr/EmployeeProfileForm";
// HR VIS-5c ▸ Section/SubmitButton ไม่ใช้แล้ว (การ์ดของ people-ui) ◂
import { ModuleTabs } from "@/components/module-tabs";
// HR H4.4 ▸ วงจรพนักงาน (แถบทดลองงาน · รายการรับเข้า/ออก · บันทึก · สิ้นสุดการจ้าง) — DTO ของ lifecycle.ts เท่านั้น ◂
import { isLinkedTo, loadLifecycleForViewer } from "@/lib/modules/hr/lifecycle"; // HR H2.10 ▸ isLinkedTo ◂
import { LifecycleBanner, LifecycleMsg, LifecycleProfile } from "@/lib/modules/hr/lifecycle-ui";
import { HrRegisterCard } from "@/lib/modules/hr/reports-ui"; // HR H3.9 ▸ การ์ดทะเบียนลูกจ้าง (สัญชาติ · ประโยชน์ตอบแทนอย่างอื่น) ◂
import { reportTextFor } from "@/lib/modules/hr/reports-rules"; // HR H3.9 ◂
import { getLocale, getTranslations } from "next-intl/server"; // HR H3.9 ◂
import { employeeLineStatus } from "@/lib/modules/hr/line-link"; // HR H4.5 ▸ ชิปสถานะ LINE (สถานะ + วันที่ผูกเท่านั้น · ด่านจากแถว Membership + สาขา) ◂
import { adminUnlinkLineAction } from "@/lib/modules/hr/line-actions"; // HR H4.5 ◂
// HR VIS-5c ▸ โปรไฟล์ (ภาพ 02): หัว · แท็บ · มุมมองอ่าน (เลขอ่อนไหวปิดแล้ว) · เชื่อมระบบ · แท็บลา/เงินเดือน/เอกสาร — ฝั่ง server ทั้งหมด ◂
import { EmployeeReadView, PeopleCard, ProfileEditCard, ProfilePageHeader, ProfileRemovedNote, ProfileChecklist, ProfileConnections, ProfileDocsTab, ProfileHeader, ProfileLeaveTab, ProfilePayTab, ProfileProbation, ProfileTabs, canEditPeople, profileHref, profileTabOf, type ProfileTab } from "@/lib/modules/hr/people-ui"; // HR VIS-5c ◂

// หน้าโปรไฟล์พนักงาน 1 คน (ข้อ 8) — ข้อมูลเต็มรูปแบบ + เอกสารแนบ
// 🔒 ช่องอ่อนไหว (เลขบัตร/ประกันสังคม/ทะเบียนบ้าน/บัญชี) + เอกสาร = เห็นเฉพาะผู้มีสิทธิ์ดูเงินเดือน
// HR VIS-5c ▸ ค่าเริ่ม = มุมมองอ่าน: เลขอ่อนไหวปิดแล้วจากฝั่ง server (people-ui) · ฟอร์มแก้ไข (เลขเต็ม) เฉพาะ ?edit=1 ของผู้ถือ hr.employee.create ·
//   ผู้ดูอื่นที่ส่ง ?edit=1 ได้มุมมองอ่านเดิม (ไม่ปฏิเสธใหม่) · แท็บ = ?tab= (ทั่วไป · เอกสาร · ตารางงาน · ลา · เงินเดือน · ประวัติ) · ไม่มีตัวเลขเงินบนหน้านี้ ◂
export default async function HrEmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; employeeId: string }>;
  searchParams: Promise<{ life?: string; reg?: string; tab?: string; edit?: string }>; // HR H4.4 ▸ รหัสผลการกด (allowlist LIFE_MSG) ◂ · HR H3.9 ▸ reg = ผลบันทึกการ์ดทะเบียน ◂ · HR VIS-5c ▸ tab · edit ◂
}) {
  const { id, employeeId } = await params;
  const { life: lifeCode, reg: regCode, tab: tabParam, edit: editParam } = await searchParams; // HR H3.9 ▸ reg ◂ · HR VIS-5c ▸ tab · edit ◂
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({
    where: { id, tenantId: auth.active.tenantId, type: "HR" },
  });
  if (!sys) notFound();
  // ไม่มีสิทธิ์ดูข้อมูลพนักงาน/ไม่พบ/ข้ามร้าน = 404 (ไม่บอกว่ามีคนนี้อยู่)
  const view = await loadEmployeeProfileForViewer(
    { tenantId: auth.active.tenantId, systemId: id },
    hrViewerOf(auth),
    employeeId,
  );
  // HR H2.10 ▸ พนักงานเปิดโปรไฟล์ของตัวเองแต่ไม่มีสิทธิ์ดูโปรไฟล์ ⇒ ไปหน้า "ฉัน" ของบริการตัวเอง (หนี้ D-VIS1-selfprofile) · คนอื่น = 404 เหมือนเดิม ◂
  if (!view && (await isLinkedTo({ tenantId: auth.active.tenantId, systemId: id }, auth.user.id, employeeId))) redirect("/app/me/hr/profile");
  if (!view) notFound();
  const emp = view.profile;
  const docs = view.docs;
  const def = systemDef(sys.type);
  const sensitive = view.canSeeSensitive;
  const muted = "text-[color:var(--color-muted)]";
  const scope = hrScopeOf(hrViewerOf(auth));
  const units = await unitsForScope(auth.active.tenantId, scope);
  // HR H4.4 ▸ null = ผู้ดูไม่เห็นข้อมูลบันทึก (ส่วนวงจรพนักงานซ่อนเอง · ปุ่มสิ้นสุดตามด่านปุ่มลบเดิม) ◂
  const life = await loadLifecycleForViewer({ tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), employeeId);
  const line = await employeeLineStatus({ tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), { employeeId: emp.id }); // HR H4.5 ▸ ไม่ผ่านด่าน = ไม่แสดงชิป ◂
  const tLine = await getTranslations("hr.line"); // HR H4.5 ◂
  const onUnlinkLine = async (fd: FormData) => {
    "use server"; // HR H4.5 ▸ ยกเลิกผูก LINE (service ตรวจสิทธิ์จากแถว Membership + สาขาซ้ำ) ◂
    await adminUnlinkLineAction(fd); // HR H4.5 ◂
  }; // HR H4.5 ◂
  // HR VIS-5c ▸ ผู้แก้ (hr.employee.create) · โหมดแก้ไขเฉพาะผู้แก้ · แท็บเงินเดือนเฉพาะผู้เห็นข้อมูลอ่อนไหวของคนนี้ ◂
  const canEdit = canEditPeople(hrViewerOf(auth)); // HR VIS-5c ◂
  const editing = canEdit && editParam === "1"; // HR VIS-5c ◂
  const tab: ProfileTab = profileTabOf(tabParam ?? (regCode || lifeCode ? "history" : undefined)); // HR VIS-5c ▸ ผลกดของการ์ดทะเบียน/วงจรพนักงาน (#hr-register · #hr-life) กลับมาที่แท็บประวัติ ◂
  const tabs: ProfileTab[] = sensitive ? ["general", "docs", "schedule", "leave", "pay", "history"] : ["general", "docs", "schedule", "leave", "history"]; // HR VIS-5c ◂
  const shown: ProfileTab = tabs.includes(tab) ? tab : "general"; // HR VIS-5c ◂
  const lineChip = line.ok ? ( // HR VIS-5c ▸ ชิป LINE เดิม (H4.5) ย้ายเข้าแถว "เชื่อมระบบ" ◂
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border px-2 py-1 text-xs" data-testid="hr-emp-line-chip">
        {line.state === "ACTIVE" ? tLine("chipActive") : line.state === "PENDING" ? tLine("chipPending") : tLine("chipNone")}
        {line.state === "ACTIVE" && line.linkedAt ? ` · ${tLine("linkedAt", { date: new Date(line.linkedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }) })}` : ""}
      </span>
      {line.state === "ACTIVE" && (
        <form action={onUnlinkLine}>
          <input type="hidden" name="systemId" value={id} />
          <input type="hidden" name="employeeId" value={emp.id} />
          <button type="submit" className="btn btn-ghost min-h-[44px] text-sm" data-testid="hr-emp-line-unlink">
            {tLine("adminUnlink")}
          </button>
        </form>
      )}
    </div>
  ) : null; // ◂ HR H4.5

  return (
    <div className="flex max-w-6xl flex-col gap-5">{/* HR VIS-5c ▸ ภาพ 02: มุมมองอ่าน + คอลัมน์ขวา ⇒ max-w-6xl ◂ */}
      <ProfilePageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} systemId={id} />{/* HR VIS-5c ▸ ชื่อ/ตำแหน่งย้ายเข้าหัวโปรไฟล์ · ข้อความแปลในคอมโพเนนต์ ◂ */}
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} wrap activeHref={`/app/sys/${id}/hr/employees`} />{/* HR VIS-5c ◂ · r2 (P14): แท็บ "พนักงาน" สว่างบนหน้าโปรไฟล์ ◂ */}
      <LifecycleMsg code={typeof lifeCode === "string" ? lifeCode : undefined} />
      <PeopleCard className="flex flex-col gap-4">{/* HR VIS-5c ▸ หัวโปรไฟล์ + แท็บ · r2 (B6): แถบทดลองงาน/สัญญา/สิ้นสุด ย้ายลงใต้แท็บ (รายการแรกของแท็บทั่วไป · ภาพ 02) ◂ */}
        <ProfileHeader emp={emp} />
        {!emp.active && <ProfileRemovedNote />}
        {!editing && <ProfileTabs href={(k) => profileHref(id, emp.id, `?tab=${k}`)} tab={shown} tabs={tabs} />}{/* HR VIS-5c */}
      </PeopleCard>

      {editing ? (
        // HR VIS-5c ▸ โหมดแก้ไข (?edit=1 · ผู้แก้เท่านั้น): สาขาประจำ + ฟอร์มเดิม (เลขเต็มอยู่ในฟอร์มนี้ที่เดียว) · แถบล่าง บันทึก · ยกเลิก · สิ้นสุดการจ้าง (#hr-life) ◂
        <>
          <ProfileEditCard emp={emp} units={units} allBranches={isAllBranches(scope)}>
            {/* HR H1.1 ▸ R8 สาขาประจำ (hr-profile-unit) อยู่ใน ProfileEditCard — ช่องของฟอร์มโปรไฟล์ (form={…}) · action ตรวจซ้ำจาก DB ◂ */}
            <EmployeeProfileForm systemId={id} emp={view.profile} canSeeSensitive={sensitive} />
          </ProfileEditCard>
          <PeopleCard className="empty:hidden">
            <LifecycleProfile systemId={id} employeeId={emp.id} life={life} active={emp.active} />
          </PeopleCard>
        </>
      ) : shown === "docs" ? (
        <PeopleCard>
          <ProfileDocsTab systemId={id} employeeId={emp.id} docs={docs} sensitive={sensitive} canEdit={canEdit} />
        </PeopleCard>
      ) : shown === "schedule" ? (
        <PeopleCard>
          <HrProfileScheduleTab systemId={id} employeeId={emp.id} canEdit={canEdit} />
        </PeopleCard>
      ) : shown === "leave" ? (
        <PeopleCard>
          <ProfileLeaveTab systemId={id} tenantId={auth.active.tenantId} viewer={hrViewerOf(auth)} employeeId={emp.id} />
        </PeopleCard>
      ) : shown === "pay" ? (
        <PeopleCard>
          <ProfilePayTab systemId={id} sensitive={sensitive} />
        </PeopleCard>
      ) : shown === "history" ? (
        <>
          {/* HR VIS-5c ▸ r2 (ruling 2): ปุ่มยืนยันผ่านทดลองงานจริง (LifecycleBanner) อยู่ที่แท็บประวัติ — ปลายทางของลิงก์ "ประเมิน ›" ◂ */}
          <LifecycleBanner systemId={id} employeeId={emp.id} life={life} active={emp.active} />
          <PeopleCard className="empty:hidden">
            <LifecycleProfile systemId={id} employeeId={emp.id} life={life} active={emp.active} />
          </PeopleCard>
          {/* HR H3.9 ▸ ทะเบียนลูกจ้าง ม.113 — การ์ดซ่อนเองเมื่อผู้ดูไม่มีสิทธิ์ · ผลบันทึก = รหัสคงที่ (ok · INPUT · อื่น ๆ = ไม่พบ/ไม่มีสิทธิ์) ◂ */}
          <HrRegisterCard
            systemId={id}
            tenantId={auth.active.tenantId}
            employeeId={emp.id}
            viewer={hrViewerOf(auth)}
            flash={regCode === "ok" ? (await getTranslations("hr.report"))("saved") : regCode === "INPUT" ? reportTextFor(await getLocale()).registerInput : regCode ? reportTextFor(await getLocale()).no : null}
          />
        </>
      ) : (
        // HR VIS-5c ▸ แท็บทั่วไป: มุมมองอ่าน ∣ รายการรับเข้า (อ่าน) + เชื่อมระบบ · r2 (B6): แถบทดลองงาน (ลิงก์ประเมิน ›) / สัญญา / สิ้นสุด เป็นรายการแรก ◂
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {life?.status === "PROBATION" && life.probationEndAt ? (
            <div className="xl:col-span-2">
              <ProfileProbation systemId={id} tenantId={auth.active.tenantId} viewer={hrViewerOf(auth)} emp={emp} life={life} />
            </div>
          ) : (
            <div className="empty:hidden xl:col-span-2">
              <LifecycleBanner systemId={id} employeeId={emp.id} life={life} active={emp.active} />
            </div>
          )}
          <PeopleCard>
            <EmployeeReadView systemId={id} emp={emp} sensitive={sensitive} canEdit={canEdit} />
          </PeopleCard>
          <div className="flex min-w-0 flex-col gap-5">
            <PeopleCard className="empty:hidden">
              <ProfileChecklist systemId={id} tenantId={auth.active.tenantId} viewer={hrViewerOf(auth)} employeeId={emp.id} life={life} manageHref={profileHref(id, emp.id, "?tab=history#hr-life")} testId="hr-life-checklist" />
            </PeopleCard>
            <PeopleCard>
              <ProfileConnections systemId={id} tenantId={auth.active.tenantId} emp={emp} canEdit={canEdit} line={lineChip} />
            </PeopleCard>
          </div>
        </div>
      )}
    </div>
  );
}
