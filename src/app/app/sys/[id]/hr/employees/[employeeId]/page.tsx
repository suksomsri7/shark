import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { hrTabs } from "@/lib/modules/hr/ui";
// HF-HR-0 (D4): ด่านสิทธิ์ + DTO รายช่อง — ห้ามส่งแถว HrEmployee ดิบให้ client component
import { hrViewerOf, loadEmployeeProfileForViewer } from "@/lib/modules/hr/privacy";
import { addEmployeeDocAction, removeEmployeeDocAction } from "@/lib/modules/hr/actions";
import EmployeeProfileForm from "@/lib/modules/hr/EmployeeProfileForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ModuleTabs } from "@/components/module-tabs";

// หน้าโปรไฟล์พนักงาน 1 คน (ข้อ 8) — ข้อมูลเต็มรูปแบบ + เอกสารแนบ
// 🔒 ช่องอ่อนไหว (เลขบัตร/ประกันสังคม/ทะเบียนบ้าน/บัญชี) + เอกสาร = เห็นเฉพาะผู้มีสิทธิ์ดูเงินเดือน
const DOC_KIND_LABEL: Record<string, string> = {
  ID_CARD: "สำเนาบัตรประชาชน",
  HOUSE_REG: "สำเนาทะเบียนบ้าน",
  CONTRACT: "สัญญาจ้าง",
  CERTIFICATE: "วุฒิการศึกษา/ใบรับรอง",
  SSO_FORM: "เอกสารประกันสังคม",
  BANK_BOOK: "หน้าสมุดบัญชี",
  OTHER: "อื่นๆ",
};

export default async function HrEmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string; employeeId: string }>;
}) {
  const { id, employeeId } = await params;
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
  if (!view) notFound();
  const emp = view.profile;
  const docs = view.docs;
  const def = systemDef(sys.type);
  const sensitive = view.canSeeSensitive;
  const muted = "text-[color:var(--color-muted)]";

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader
        title={`${def?.icon ?? ""} ${emp.name}`.trim()}
        desc={[emp.position, emp.department].filter(Boolean).join(" · ") || "ข้อมูลพนักงาน"}
        back={{ href: `/app/sys/${id}/hr/employees`, label: "พนักงานทั้งหมด" }}
      />
      <ModuleTabs items={hrTabs(id)} />
      {!emp.active && (
        <p className="rounded-lg border px-3 py-2 text-xs text-[color:var(--color-danger)]">
          พนักงานคนนี้ถูกลบออกจากทะเบียนแล้ว (ข้อมูลและประวัติยังอยู่ · กู้คืนได้ที่หน้าพนักงานทั้งหมด)
        </p>
      )}

      <Section title="ข้อมูลพนักงาน">
        <EmployeeProfileForm systemId={id} emp={view.profile} canSeeSensitive={sensitive} />
        <p className={`mt-2 text-xs ${muted}`}>
          PIN ลงเวลา: {emp.hasPin ? "ตั้งแล้ว" : "ยังไม่ตั้ง"} (ตั้ง/เปลี่ยนได้ที่หน้าพนักงานทั้งหมด)
        </p>
      </Section>

      {sensitive ? (
        <Section title="🔒 เอกสารแนบ">
          <div className="flex flex-col gap-2">
            {docs.length === 0 && (
              <p className={`text-xs ${muted}`}>ยังไม่มีเอกสาร — แนบสำเนาบัตร/ทะเบียนบ้าน/สัญญาจ้างได้ที่ฟอร์มด้านล่าง</p>
            )}
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{doc.title}</span>
                  <span className={`block truncate text-xs ${muted}`}>
                    {DOC_KIND_LABEL[doc.kind] ?? doc.kind}
                    {doc.note ? ` · ${doc.note}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Link href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                    เปิด
                  </Link>
                  <form action={removeEmployeeDocAction}>
                    <input type="hidden" name="systemId" value={id} />
                    <input type="hidden" name="employeeId" value={emp.id} />
                    <input type="hidden" name="docId" value={doc.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                  </form>
                </span>
              </div>
            ))}
            <form action={addEmployeeDocAction} className="mt-1 flex flex-wrap items-end gap-2 border-t pt-3">
              <input type="hidden" name="systemId" value={id} />
              <input type="hidden" name="employeeId" value={emp.id} />
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                ชนิด
                <select name="kind" className="input" defaultValue="ID_CARD">
                  {Object.entries(DOC_KIND_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
                ชื่อเอกสาร
                <input name="title" required placeholder="เช่น สำเนาบัตร 2026" className="input min-w-0" />
              </label>
              <label className={`flex w-full flex-col gap-1 text-xs ${muted}`}>
                ลิงก์ไฟล์ (http/https)
                <input name="url" required placeholder="https://…" className="input" />
              </label>
              <SubmitButton variant="ghost">+ แนบเอกสาร</SubmitButton>
            </form>
          </div>
        </Section>
      ) : (
        <Section title="🔒 เอกสารแนบ">
          <p className={`text-xs ${muted}`}>
            เอกสารพนักงานเป็นข้อมูลอ่อนไหว — เห็นได้เฉพาะเจ้าของกิจการหรือผู้ได้รับสิทธิ์ดูเงินเดือน
          </p>
        </Section>
      )}
    </div>
  );
}
