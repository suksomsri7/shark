// WO 3.2 — หน้ารายละเอียดผู้ติดต่อแบบย่อ (อ่านอย่างเดียว) — ปลายทางของแถวคลิกในหน้ารายการ
// TODO(WO 3.4): แทนที่ด้วยแผงเลื่อน 360° (§7.1: ข้อมูล/เอกสาร n/ไฟล์แนบ n/การเชื่อมต่อ + KPI/อายุหนี้)
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { getContactDetail } from "@/lib/modules/account/contacts-list";
import { editorDetailPath, editorNewPath } from "@/lib/modules/account/doc-editor-config";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDateTh } from "@/lib/ui/date";

const KIND_LABEL: Record<string, string> = { CUSTOMER: "ลูกค้า", VENDOR: "ผู้ขาย", BOTH: "ทั้งคู่" };

export default async function Page({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.contact.manage" });
  const base = `/app/sys/${id}/account`;
  const c = await getContactDetail({ tenantId, systemId }, contactId);
  if (!c) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={`${c.code} · ${c.name}`}
        back={{ href: `${base}/contacts`, label: "ผู้ติดต่อ" }}
        desc={`${KIND_LABEL[c.kind] ?? c.kind}${c.archivedAt ? " · ปิดใช้งาน" : ""}`}
        actions={
          <>
            <Link href={`${base}/contacts?edit=${c.id}#edit-contact`} className="btn-sm">
              แก้ไขข้อมูล
            </Link>
            <Link href={`${editorNewPath(base, "INVOICE")}?contactId=${c.id}`} className="btn btn-primary">
              สร้างใบแจ้งหนี้
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ค้างรับ</span>
          <span className="text-xl font-semibold" style={{ color: c.receivableSatang > 0 ? "var(--color-danger)" : undefined }}>
            <MoneyText satang={c.receivableSatang} decimals />
          </span>
        </div>
        <div className="card flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ค้างจ่าย</span>
          <span className="text-xl font-semibold">
            <MoneyText satang={c.payableSatang} decimals />
          </span>
        </div>
      </div>

      <Section title="ข้อมูล" card>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">เลขผู้เสียภาษี</dt>
            <dd>{c.taxId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">เบอร์โทร</dt>
            <dd>{c.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">อีเมล</dt>
            <dd>{c.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[color:var(--color-muted)]">เครดิตเทอม</dt>
            <dd>{c.creditTermDays} วัน</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-[color:var(--color-muted)]">ที่อยู่</dt>
            <dd>{c.address ?? "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title={`เอกสาร (${c.recentDocs.length} รายการล่าสุด)`} card>
        {c.recentDocs.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีเอกสาร</p>
        ) : (
          <div className="flex flex-col divide-y">
            {c.recentDocs.map((d) => (
              <Link
                key={d.id}
                href={editorDetailPath(base, d.docType, d.id)}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="flex flex-col">
                  <span style={{ color: "var(--color-accent)" }}>{d.docNo ?? "(ร่าง)"}</span>
                  <span className="text-xs text-[color:var(--color-muted)]">{formatDateTh(d.issueDate)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <MoneyText satang={d.grandTotal} decimals />
                  <StatusChip value={d.status} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
