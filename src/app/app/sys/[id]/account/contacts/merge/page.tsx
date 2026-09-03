// WO 3.4 — หน้า "รวมผู้ติดต่อซ้ำ" (DESIGN-SPEC-V2 §7.3 · ภาพ g7-contact-merge.png)
// สิทธิ์แยกจากการแก้ผู้ติดต่อทั่วไป: `account.contact.merge` (เพิ่มไว้ตั้งแต่เฟส 0 · SPEC §14.11)
import { requireAccountPage } from "@/lib/modules/account/guard";
import { listMergeCandidates, MERGE_FIELDS } from "@/lib/modules/account/contact-merge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContactMergePanel } from "@/components/account-v2/ContactMergePanel";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pair?: string }>;
}) {
  const { id } = await params;
  const { pair } = await searchParams;
  const { tenantId, systemId } = await requireAccountPage(id, "account.contact.merge");
  const candidates = await listMergeCandidates({ tenantId, systemId });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="รวมผู้ติดต่อซ้ำ"
        desc={
          candidates.length > 0
            ? `ระบบตรวจพบ ${candidates.length} คู่ที่อาจเป็นรายเดียวกัน (เลขภาษีตรงกัน · เบอร์ตรงกัน · ชื่อคล้าย ≥ 90%)`
            : "ระบบตรวจจากเลขภาษี เบอร์โทร และชื่อที่คล้ายกัน ≥ 90%"
        }
      />
      <ContactMergePanel
        systemId={id}
        fields={MERGE_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
        candidates={candidates}
        selectedKey={pair ?? null}
      />
    </div>
  );
}
