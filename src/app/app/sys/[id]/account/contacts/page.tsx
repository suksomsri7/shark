import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listContacts } from "@/lib/modules/account/service";
import { createContactAction, archiveContactAction } from "@/lib/modules/account/actions";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import DataList from "@/components/ui/DataList";
import FormField from "@/components/ui/FormField";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const KIND_LABEL: Record<string, string> = { CUSTOMER: "ลูกค้า", VENDOR: "ผู้ขาย", BOTH: "ทั้งคู่" };

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const contacts = await listContacts(tenantId, systemId);
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="ผู้ติดต่อ" back={{ href: base, label: "ระบบบัญชี" }} />

      <DataList
        items={contacts.map((c) => ({
          key: c.id,
          primary: c.name,
          secondary: (
            <>
              {KIND_LABEL[c.kind]}
              {c.taxId && ` · ${c.taxId}`}
              {c.phone && ` · ${c.phone}`}
              {c.creditTermDays > 0 && ` · เครดิต ${c.creditTermDays} วัน`}
            </>
          ),
          trailing: (
            <ConfirmDialog
              action={archiveContactAction}
              fields={{ systemId, id: c.id }}
              triggerLabel="ลบ"
              triggerClassName="text-xs text-[color:var(--color-danger)] underline"
              title="ลบผู้ติดต่อนี้?"
              detail="ผู้ติดต่อจะถูกซ่อน (เอกสารเดิมที่อ้างถึงยังอยู่)"
              confirmLabel="ยืนยันลบ"
              danger
            />
          ),
        }))}
        empty="ยังไม่มีผู้ติดต่อ — เพิ่มลูกค้าหรือผู้ขายด้านล่างเพื่อเริ่ม"
      />

      {/* เพิ่มผู้ติดต่อ */}
      <Section title="เพิ่มผู้ติดต่อ" card>
        <form action={createContactAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />
          <div className="sm:col-span-2">
            <FormField label="ชื่อ / ชื่อจดทะเบียน" required error={err === "name" ? "กรุณากรอกชื่อผู้ติดต่อ" : undefined}>
              <input name="name" required className="input" />
            </FormField>
          </div>
          <FormField label="ประเภท">
            <select name="kind" defaultValue="CUSTOMER" className="input">
              <option value="CUSTOMER">ลูกค้า</option>
              <option value="VENDOR">ผู้ขาย</option>
              <option value="BOTH">ทั้งคู่</option>
            </select>
          </FormField>
          <FormField label="รูปแบบ">
            <select name="legalType" defaultValue="COMPANY" className="input">
              <option value="COMPANY">นิติบุคคล</option>
              <option value="PERSON">บุคคลธรรมดา</option>
            </select>
          </FormField>
          <FormField label="เลขผู้เสียภาษี 13 หลัก">
            <input name="taxId" className="input" />
          </FormField>
          <FormField label="สาขา" hint="เช่น สำนักงานใหญ่">
            <input name="branchName" className="input" />
          </FormField>
          <FormField label="เบอร์โทร">
            <input name="phone" inputMode="tel" className="input" />
          </FormField>
          <FormField label="อีเมล">
            <input name="email" type="email" className="input" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="ที่อยู่">
              <input name="address" className="input" />
            </FormField>
          </div>
          <FormField label="เครดิตเทอม (วัน)">
            <input name="creditTermDays" type="number" min={0} className="input" />
          </FormField>
          <div className="sm:col-span-2">
            <SubmitButton className="sm:justify-self-start">+ เพิ่มผู้ติดต่อ</SubmitButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
