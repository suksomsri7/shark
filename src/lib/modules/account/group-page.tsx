import type { AccountDocType } from "@prisma/client";
import { thaiDateKey } from "@/lib/ui/date";
import { GroupDocEditor } from "@/components/account-v2/GroupDocEditor";
import { groupDefOf, groupRoute, groupSeedFromIds, listGroupCandidates } from "./group";
import type { GroupCandidateRow } from "./group-actions";
import { DOC_LABEL } from "./service";
import { EXP_DOC_LABEL } from "./expense";

// ─────────────────────────────────────────────────────────────
// group-page.tsx — server component ของหน้า "สร้างเอกสารกลุ่ม" (§5.2 K) · WO 1.7
// ใช้ร่วม 2 route: `docs/BILLING_NOTE/new` (รายรับ) และ `combined-payment/new` (รายจ่าย)
// 🔴 ไม่ import prisma — เรียกผ่าน group.ts เท่านั้น (fitness F5)
// ─────────────────────────────────────────────────────────────

/** วันที่ปฏิทินไทย + n วัน (ISO yyyy-mm-dd) — ใช้เป็นค่าเริ่มต้นของ "กำหนดชำระ" */
function bkkDayPlus(days: number): string {
  const today = thaiDateKey(new Date());
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const labelOf = (dt: AccountDocType) => DOC_LABEL[dt] ?? EXP_DOC_LABEL[dt] ?? dt;

export async function GroupNewPage({
  tenantId,
  systemId,
  docType,
  ids,
}: {
  tenantId: string;
  systemId: string;
  docType: AccountDocType;
  /** จากปุ่ม bulk บนหน้ารายการ: `?ids=a,b,c` */
  ids?: string;
}) {
  const def = groupDefOf(docType);
  if (!def) throw new Error("ชนิดเอกสารไม่ถูกต้อง");
  const base = `/app/sys/${systemId}/account`;
  const listPath = groupRoute(base, docType);

  const seedIds = (ids ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 200);
  const seed = seedIds.length ? await groupSeedFromIds(tenantId, systemId, docType, seedIds) : null;
  let rows: GroupCandidateRow[] = [];
  if (seed) {
    const candidates = await listGroupCandidates(tenantId, systemId, docType, seed.contactId);
    rows = candidates.map((c) => ({
      id: c.id,
      docType: c.docType,
      docLabel: labelOf(c.docType),
      docNo: c.docNo,
      issueDate: c.issueDate.toISOString().slice(0, 10),
      dueDate: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : null,
      grandTotal: c.grandTotal,
      outstanding: c.outstanding,
      statusLabel: c.statusLabel,
      eligible: c.eligible,
      blockedReason: c.blockedReason,
    }));
  }

  return (
    <GroupDocEditor
      systemId={systemId}
      docType={docType}
      basePath={base}
      listPath={listPath}
      today={thaiDateKey(new Date())}
      defaultDueDate={bkkDayPlus(7)}
      initialContact={seed ? { id: seed.contactId, name: seed.contactName } : null}
      initialRows={rows}
      initialSelectedIds={seed?.selectedIds ?? []}
      texts={{
        title: docType === "BILLING_NOTE" ? "ออกใบวางบิลรวม" : "สร้างใบรวมจ่าย",
        contactLabel: def.texts.contactLabel,
        childrenTitle:
          docType === "BILLING_NOTE" ? "ใบแจ้งหนี้ที่ยังค้างชำระ" : "บิลที่ยังค้างจ่ายของผู้ขายรายนี้",
        totalLabel: def.texts.totalLabel,
        submitLabel: docType === "BILLING_NOTE" ? "ออกใบวางบิล" : "ออกใบรวมจ่าย",
        outstandingLabel: def.texts.outstandingLabel,
        dueLabel: def.texts.dueLabel,
        emptyHint:
          docType === "BILLING_NOTE"
            ? "ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ที่ยังค้างชำระ (หรือถูกใส่ในใบวางบิลอื่นไปแล้ว)"
            : "ผู้ขายรายนี้ไม่มีบิลที่ยังค้างจ่าย (หรือถูกใส่ในใบรวมจ่ายอื่นไปแล้ว)",
      }}
    />
  );
}
