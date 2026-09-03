"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatDateTh } from "@/lib/ui/date";
import { searchContactsAction } from "@/lib/modules/account/editor-actions";
import {
  createGroupDocAction,
  listGroupCandidatesAction,
  type GroupCandidateRow,
} from "@/lib/modules/account/group-actions";
import { ContactPicker } from "./ContactPicker";
import { DateInput } from "./DateInput";
import { SectionCard } from "./SectionCard";

// ─────────────────────────────────────────────────────────────
// GroupDocEditor — ฟอร์มพิเศษ §5.2 K (ใบวางบิลรวม BN / ใบรวมจ่าย CP) · WO 1.7
// โครงตามสเปค (ไล่จากบนลงล่าง — ห้ามสลับ):
//   ① เลือกผู้ติดต่อ (บังคับ) · วันที่ออก · กำหนดชำระ · หมายเหตุ
//   ② ตารางเอกสารที่ค้างชำระของผู้ติดต่อรายนั้น: ☐ · เลขที่ · วันที่ · ครบกำหนด · มูลค่า · ค้างชำระ
//   ③ บรรทัด "รวมยอดที่เลือก" (อัปเดตสด)
//   ④ แถบปุ่มท้าย: ยกเลิก · "ออกใบวางบิล/ออกใบรวมจ่าย"
//
// 🔴 ตัวเลขบนจอ = พรีวิว · server (group.ts) ตรวจสิทธิ์/ยอดค้าง/ความซ้ำของใบลูกใหม่ทุกครั้งก่อนสร้างจริง
// ─────────────────────────────────────────────────────────────

export type GroupEditorTexts = {
  title: string;
  contactLabel: string;
  childrenTitle: string;
  totalLabel: string;
  submitLabel: string;
  outstandingLabel: string;
  dueLabel: string;
  emptyHint: string;
};

export function GroupDocEditor({
  systemId,
  docType,
  basePath,
  listPath,
  texts,
  today,
  defaultDueDate,
  initialContact,
  initialRows,
  initialSelectedIds,
}: {
  systemId: string;
  docType: string;
  basePath: string;
  listPath: string;
  texts: GroupEditorTexts;
  today: string;
  defaultDueDate: string;
  /** ผู้ติดต่อที่เดามาจากปุ่ม bulk (?ids=…) — ไม่มี = เริ่มจากช่องว่าง */
  initialContact?: { id: string; name: string } | null;
  initialRows?: GroupCandidateRow[];
  initialSelectedIds?: string[];
}) {
  const router = useRouter();
  const [contact, setContact] = useState<{ id: string; name: string } | null>(initialContact ?? null);
  const [rows, setRows] = useState<GroupCandidateRow[]>(initialRows ?? []);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds ?? []));
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitted = useRef(false);

  const loadRows = useCallback(
    async (contactId: string, keep?: Set<string>) => {
      setLoading(true);
      try {
        const next = await listGroupCandidatesAction(systemId, docType, contactId);
        setRows(next);
        const ok = new Set(next.filter((r) => r.eligible).map((r) => r.id));
        setSelected(new Set([...(keep ?? new Set<string>())].filter((id) => ok.has(id))));
      } finally {
        setLoading(false);
      }
    },
    [systemId, docType],
  );

  // เปลี่ยนผู้ติดต่อ = ตารางต้องโหลดใหม่เสมอ (ใบของคนอื่นห้ามค้างอยู่ในตาราง)
  useEffect(() => {
    if (!contact?.id) {
      setRows([]);
      setSelected(new Set());
      return;
    }
    if (initialRows && initialRows.length > 0 && contact.id === initialContact?.id) return;
    void loadRows(contact.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const searchContacts = useCallback((q: string) => searchContactsAction(systemId, q), [systemId]);

  const eligibleRows = useMemo(() => rows.filter((r) => r.eligible), [rows]);
  const total = useMemo(
    () => rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.outstanding, 0),
    [rows, selected],
  );
  const allChecked = eligibleRows.length > 0 && eligibleRows.every((r) => selected.has(r.id));
  // สรุปบนแถบปุ่มท้าย (เดสก์ท็อป = ซ้ายปุ่ม · มือถือ = บรรทัดเหนือปุ่ม) — รูปแบบเดียวกับ wizard WO 1.6
  const summaryText =
    selected.size === 0
      ? `ยังไม่ได้เลือกเอกสาร`
      : `เลือก ${selected.size} รายการ · รวม ฿${(total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(eligibleRows.map((r) => r.id)));

  const submit = () =>
    startTransition(async () => {
      setError("");
      if (!contact?.id) {
        setError(`กรุณาเลือก${texts.contactLabel}`);
        return;
      }
      if (selected.size === 0) {
        setError("กรุณาเลือกเอกสารอย่างน้อย 1 ใบ");
        return;
      }
      if (submitted.current) return;
      submitted.current = true;
      const res = await createGroupDocAction(systemId, {
        docType,
        contactId: contact.id,
        issueDate,
        dueDate: dueDate || null,
        note: note.trim() || null,
        childIds: [...selected],
      });
      if (!res.ok) {
        submitted.current = false;
        setError(res.reason);
        return;
      }
      router.push(res.href);
    });

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 pb-28 md:pb-24" data-testid="group-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{texts.title}</h1>
      </div>

      {error && (
        <p className="text-sm text-[color:var(--color-danger)]" data-testid="group-error">
          {error}
        </p>
      )}

      {/* ① หัวเอกสาร */}
      <SectionCard title="ข้อมูลเอกสาร" testId="sec-group-head">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] md:col-span-2">
            {texts.contactLabel} *
            <ContactPicker
              defaultId={contact?.id}
              defaultLabel={contact?.name}
              search={searchContacts}
              onSelect={(r) => setContact({ id: r.id, name: r.name })}
              onCreate={() => router.push(`${basePath}/contacts`)}
              testId="group-contact"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่ออก
            <DateInput value={issueDate} onChange={setIssueDate} testId="group-issue-date" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            {texts.dueLabel}
            <DateInput value={dueDate} onChange={setDueDate} testId="group-due-date" />
          </label>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หมายเหตุ (พิมพ์บนเอกสาร)
          <textarea
            className="input min-h-16"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="group-note"
          />
        </label>
      </SectionCard>

      {/* ② ตารางใบลูก */}
      <SectionCard title={texts.childrenTitle} testId="sec-group-children">
        {!contact?.id ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="group-empty">
            เลือก{texts.contactLabel}ก่อน แล้วระบบจะแสดงเอกสารที่ยังค้างชำระให้ติ๊กเลือก
          </p>
        ) : loading ? (
          <p className="text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="group-empty">
            {texts.emptyHint}
          </p>
        ) : (
          <>
            {/* เดสก์ท็อป: ตาราง */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                    <th className="w-10 py-2">
                      <input
                        type="checkbox"
                        aria-label="เลือกทั้งหมด"
                        className="h-5 w-5"
                        checked={allChecked}
                        onChange={toggleAll}
                        data-testid="group-check-all"
                      />
                    </th>
                    <th className="py-2 font-normal">เลขที่</th>
                    <th className="py-2 font-normal">วันที่</th>
                    <th className="py-2 font-normal">ครบกำหนด</th>
                    <th className="py-2 text-right font-normal">มูลค่า</th>
                    <th className="py-2 text-right font-normal">{texts.outstandingLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b last:border-0 ${r.eligible ? "" : "opacity-50"}`}
                      data-testid={`child-row-${r.docNo ?? r.id}`}
                      data-selected={selected.has(r.id) ? "1" : "0"}
                      data-eligible={r.eligible ? "1" : "0"}
                    >
                      <td className="py-2">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${r.docNo ?? ""}`}
                          className="h-5 w-5"
                          disabled={!r.eligible}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          data-testid={`child-check-${r.docNo ?? r.id}`}
                        />
                      </td>
                      <td className="py-2">
                        <span className="font-medium">{r.docNo ?? "(ร่าง)"}</span>
                        {!r.eligible && r.blockedReason && (
                          <span className="block text-xs text-[color:var(--color-muted)]">{r.blockedReason}</span>
                        )}
                      </td>
                      <td className="py-2">{formatDateTh(r.issueDate)}</td>
                      <td className="py-2">{r.dueDate ? formatDateTh(r.dueDate) : "—"}</td>
                      <td className="py-2 text-right tabular-nums">
                        <MoneyText satang={r.grandTotal} decimals />
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        <MoneyText satang={r.outstanding} decimals />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* มือถือ: การ์ดแตะเลือกทั้งใบ (ไม่มีตารางแนวนอน) */}
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={!r.eligible}
                  onClick={() => toggle(r.id)}
                  data-testid={`child-card-${r.docNo ?? r.id}`}
                  data-selected={selected.has(r.id) ? "1" : "0"}
                  data-eligible={r.eligible ? "1" : "0"}
                  className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left text-sm ${r.eligible ? "" : "opacity-50"}`}
                  style={selected.has(r.id) ? { borderColor: "var(--color-ink)", borderWidth: 2 } : undefined}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.docNo ?? "(ร่าง)"}</span>
                    <span className="tabular-nums font-semibold">
                      <MoneyText satang={r.outstanding} decimals />
                    </span>
                  </span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {formatDateTh(r.issueDate)} · {texts.dueLabel} {r.dueDate ? formatDateTh(r.dueDate) : "—"}
                    {!r.eligible && r.blockedReason ? ` · ${r.blockedReason}` : ""}
                  </span>
                </button>
              ))}
            </div>

            {/* ③ รวมยอดที่เลือก */}
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-[color:var(--color-muted)]">
                เลือก <span data-testid="group-selected-count">{selected.size}</span> รายการ
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[color:var(--color-muted)]">{texts.totalLabel}</span>
                <span className="text-lg font-semibold tabular-nums" data-testid="group-total">
                  <MoneyText satang={total} decimals />
                </span>
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* ④ แถบปุ่มท้าย */}
      {/* ④ แถบปุ่มท้าย — โครงเดียวกับ wizard WO 1.6 ที่ผ่าน QC แล้ว: [ยกเลิก] · สรุป · [ปุ่มดำ]
          `pr-20` เฉพาะมือถือ กันปุ่มไปทับ orb AI ที่ลอยมุมขวาล่าง (`fixed bottom-4 right-4`) */}
      <div
        className="sticky bottom-0 z-20 border-t bg-[color:var(--color-surface)] py-3 pr-20 pl-4 md:px-4"
        data-testid="group-actions"
      >
        <div className="mb-2 truncate text-xs text-[color:var(--color-muted)] md:hidden" data-testid="group-summary-m">
          {summaryText}
        </div>
        <div className="flex items-center gap-3">
          <a href={listPath} className="btn btn-ghost shrink-0 text-sm" data-testid="btn-cancel">
            ยกเลิก
          </a>
          <span className="hidden flex-1 truncate text-sm text-[color:var(--color-muted)] md:block" data-testid="group-summary">
            {summaryText}
          </span>
          <button
            type="button"
            className="btn btn-primary flex-1 justify-center text-sm md:flex-none"
            disabled={pending || selected.size === 0 || !contact?.id}
            onClick={submit}
            data-testid="btn-create-group"
          >
            {pending ? "กำลังบันทึก…" : texts.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GroupDocEditor;
