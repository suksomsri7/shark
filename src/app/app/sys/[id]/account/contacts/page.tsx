import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { listContacts } from "@/lib/modules/account/service";
import { createContactAction, archiveContactAction } from "@/lib/modules/account/actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
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
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ผู้ติดต่อ</h1>
      </div>

      {err === "name" && <p className="text-sm text-[color:var(--color-danger)]">กรุณากรอกชื่อผู้ติดต่อ</p>}

      <div className="flex flex-col gap-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีผู้ติดต่อ</p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {KIND_LABEL[c.kind]}
                  {c.taxId && ` · ${c.taxId}`}
                  {c.phone && ` · ${c.phone}`}
                  {c.creditTermDays > 0 && ` · เครดิต ${c.creditTermDays} วัน`}
                </div>
              </div>
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
            </div>
          ))
        )}
      </div>

      {/* เพิ่มผู้ติดต่อ */}
      <form action={createContactAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="systemId" value={systemId} />
        <h2 className="text-sm font-medium sm:col-span-2">เพิ่มผู้ติดต่อ</h2>
        <input name="name" required placeholder="ชื่อ / ชื่อจดทะเบียน" className={`${inputCls} sm:col-span-2`} />
        <select name="kind" defaultValue="CUSTOMER" className={inputCls}>
          <option value="CUSTOMER">ลูกค้า</option>
          <option value="VENDOR">ผู้ขาย</option>
          <option value="BOTH">ทั้งคู่</option>
        </select>
        <select name="legalType" defaultValue="COMPANY" className={inputCls}>
          <option value="COMPANY">นิติบุคคล</option>
          <option value="PERSON">บุคคลธรรมดา</option>
        </select>
        <input name="taxId" placeholder="เลขผู้เสียภาษี 13 หลัก" className={inputCls} />
        <input name="branchName" placeholder="สาขา (เช่น สำนักงานใหญ่)" className={inputCls} />
        <input name="phone" placeholder="เบอร์โทร" className={inputCls} />
        <input name="email" type="email" placeholder="อีเมล" className={inputCls} />
        <input name="address" placeholder="ที่อยู่" className={`${inputCls} sm:col-span-2`} />
        <input name="creditTermDays" type="number" min={0} placeholder="เครดิตเทอม (วัน)" className={inputCls} />
        <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ เพิ่มผู้ติดต่อ</SubmitButton>
      </form>
    </div>
  );
}
