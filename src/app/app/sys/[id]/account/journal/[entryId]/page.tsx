import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, accountCan } from "@/lib/modules/account/access";
import { journalEntryDetail, JOURNAL_TYPE_LABEL } from "@/lib/modules/account/journal-v2";
import { formatDateTh } from "@/lib/ui/date";
import { MoneyText } from "@/components/ui/MoneyText";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { reverseJvAction, toggleFlagAction } from "../actions";

// รายละเอียดใบสำคัญ — ชั้นที่ 3 ของ drill-down (รายงาน → แยกประเภท → **JV** → เอกสาร)
// §11.2: กลับรายการ (reversal) + ธง ⚑ ต้องตรวจ อยู่ที่นี่ (ตารางหน้ารายการมีที่ไม่พอตามเฟรม g16)
export default async function JournalEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; entryId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { id, entryId } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");
  const canAdjust = accountCan(auth, "account.journal.adjust");

  const e = await journalEntryDetail({ tenantId, systemId }, entryId);
  if (!e) notFound();
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`${base}/journal`} className="text-sm text-[color:var(--color-muted)]">
            ← บัญชีรายวัน
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
            {e.docNo}
            {e.needsReview && (
              <span className="text-[color:var(--color-danger)]" title={e.flagNote ?? "ต้องตรวจสอบ"}>
                <AccountIcon name="flag" className="h-5 w-5" />
              </span>
            )}
          </h1>
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="jv-detail-meta">
            {formatDateTh(e.date)} · สมุด{e.bookLabel} · {JOURNAL_TYPE_LABEL[e.journal] ?? e.journal} ·{" "}
            {e.source === "MANUAL" ? "บันทึกด้วยมือ" : "ระบบลงให้อัตโนมัติ"} · ผู้บันทึก {e.postedByName ?? "ระบบ"}
          </p>
        </div>
        {canAdjust && (
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              action={toggleFlagAction}
              fields={{ systemId, entryId: e.id }}
              reasonField={
                e.needsReview ? undefined : { name: "note", label: "เหตุผลที่ต้องตรวจ", required: false }
              }
              triggerLabel={e.needsReview ? "ปลดธงต้องตรวจ" : "ติดธงต้องตรวจ"}
              triggerClassName="btn btn-ghost text-sm"
              title={e.needsReview ? "ปลดธงต้องตรวจ?" : "ติดธง ⚑ ต้องตรวจ?"}
              detail={
                e.needsReview
                  ? "ปลดแล้วใบนี้จะไม่บล็อกการปิดงวดอีกต่อไป"
                  : "ใบที่ติดธงจะบล็อกการปิดงวดจนกว่าจะมีคนตรวจแล้วปลดธง"
              }
              confirmLabel="ยืนยัน"
            />
            {!e.reversed && e.status === "POSTED" && (
              <ConfirmDialog
                action={reverseJvAction}
                fields={{ systemId, entryId: e.id }}
                reasonField={{ name: "reason", label: "เหตุผลในการกลับรายการ", required: true }}
                triggerLabel="กลับรายการ"
                triggerClassName="btn btn-ghost text-sm"
                title="กลับรายการใบสำคัญนี้?"
                detail="ระบบจะลงใบสำคัญตรงข้ามให้ใหม่ (ใบเดิมยังอยู่ในสมุด — สมุดรายวันแก้ไม่ได้) · ถ้างวดของใบเดิมปิดแล้ว ใบกลับจะลงในงวดเปิดถัดไป"
                confirmLabel="ยืนยันกลับรายการ"
                danger
              />
            )}
          </div>
        )}
      </div>

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      {e.memo && <p className="text-sm">{e.memo}</p>}

      {/* ความสัมพันธ์กับใบอื่น + เอกสารต้นทาง (ชั้นที่ 4 ของ drill-down) */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {e.ref && (
          <span>
            อ้างอิงเอกสาร:{" "}
            <Link href={`${base}/${e.ref.href}`} className="text-[color:var(--color-accent)] hover:underline" data-testid="jv-ref-link">
              {e.ref.label}
            </Link>
          </span>
        )}
        {e.reversedBy && (
          <span>
            ถูกกลับรายการโดย:{" "}
            <Link href={`${base}/journal/${e.reversedBy.id}`} className="text-[color:var(--color-accent)] hover:underline">
              {e.reversedBy.docNo}
            </Link>
          </span>
        )}
        {e.reversalOf && (
          <span>
            เป็นใบกลับรายการของ:{" "}
            <Link href={`${base}/journal/${e.reversalOf.id}`} className="text-[color:var(--color-accent)] hover:underline">
              {e.reversalOf.docNo}
            </Link>
          </span>
        )}
        <span>งวด {e.periodKey}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
              <th className="px-3 py-2 font-medium">บัญชี</th>
              <th className="px-3 py-2 font-medium">ผู้ติดต่อ</th>
              <th className="px-3 py-2 font-medium">คำอธิบาย</th>
              <th className="px-3 py-2 text-right font-medium">เดบิต</th>
              <th className="px-3 py-2 text-right font-medium">เครดิต</th>
            </tr>
          </thead>
          <tbody>
            {e.lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }}>
                <td className="px-3 py-2">
                  <span className="text-[color:var(--color-muted)]">{l.code}</span> {l.name}
                  {l.suspense && (
                    <span className="ml-1 inline-block align-text-bottom text-[color:var(--color-danger)]" title="บัญชีพัก 9999">
                      <AccountIcon name="warn" className="h-3.5 w-3.5" />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{l.contactName ?? "—"}</td>
                <td className="px-3 py-2">{l.note ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.debit > 0 ? <MoneyText satang={l.debit} decimals /> : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.credit > 0 ? <MoneyText satang={l.credit} decimals /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--color-line)" }}>
              <td className="px-3 py-2" colSpan={3}>
                รวม
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="jv-detail-debit">
                <MoneyText satang={e.totalDebit} decimals />
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="jv-detail-credit">
                <MoneyText satang={e.totalCredit} decimals />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {e.attachments.length > 0 && (
        <div className="text-sm">
          <div className="mb-1 font-medium">ไฟล์แนบ ({e.attachments.length})</div>
          <ul className="flex flex-col gap-1">
            {e.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.fileUrl} className="text-[color:var(--color-accent)] hover:underline" target="_blank" rel="noreferrer">
                  {a.fileName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
