"use client";

// MergePairSheet.tsx — รวมคู่ที่น่าจะซ้ำ (ผู้ติดต่อ หรือ บริษัท) แบบ "เลือกค่าต่อฟิลด์" (ใบ C1.11 · พิมพ์เขียว §3.17 · §11.1)
// ใช้บนหน้า `/crm/contacts/duplicates` และ `/crm/companies/duplicates` — หน้า server ส่งค่าของทั้งสองรายการ (ผ่านการมองเห็นแล้ว) มาทาง props
// 🔴 AUDIT-CLASS X9: ต้องติ๊กยืนยัน + เหตุผล ≥ 5 ตัวอักษรก่อนส่ง (บริการตรวจซ้ำอีกชั้น) · ผลผิดพลาดแสดงในแผ่น ไม่ใช้ alert()
// 🔴 `fieldChoices[field] = "merge"` = ใช้ค่าของรายการที่ถูกรวม (อีกฝั่ง) แทนค่าของรายการที่เก็บไว้ · ไม่ระบุ = ค่าของที่เก็บไว้
//    (ค่าว่างของที่เก็บไว้ บริการเติมจากอีกฝั่งให้เอง) · สลับว่าจะเก็บฝั่งไหนได้ก่อนเลือก

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { mergeContactsAction } from "@/lib/modules/crm/contacts-actions";
import { mergeCompaniesAction } from "@/lib/modules/crm/companies-actions";

export type MergeSide = { id: string; name: string; values: Record<string, string | null> };
export type MergeField = { key: string; label: string };

const REASON_MIN = 5;

export function MergePairSheet({
  kind,
  systemId,
  a,
  b,
  fields,
}: {
  kind: "contact" | "company";
  systemId: string;
  a: MergeSide;
  b: MergeSide;
  fields: MergeField[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [keepA, setKeepA] = useState(true);
  const [picks, setPicks] = useState<Record<string, "keep" | "merge">>({});
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const keep = keepA ? a : b;
  const drop = keepA ? b : a;
  // เลือกได้เฉพาะฟิลด์ที่ค่าต่างกันและอีกฝั่งมีค่า (เหมือนกัน/อีกฝั่งว่าง = ไม่มีอะไรให้เลือก)
  const diff = useMemo(
    () => fields.filter((f) => (drop.values[f.key] ?? "") !== "" && (drop.values[f.key] ?? "") !== (keep.values[f.key] ?? "")),
    [fields, keep, drop],
  );
  const what = kind === "contact" ? "ผู้ติดต่อ" : "บริษัท";

  const submit = () =>
    start(async () => {
      setError(null);
      if (reason.trim().length < REASON_MIN) return setError(`ใส่เหตุผลอย่างน้อย ${REASON_MIN} ตัวอักษร`);
      if (!confirmed) return setError(`ติ๊กยืนยันการรวม${what}ก่อน`);
      // เฉพาะฟิลด์ที่เลือกใช้ค่าของอีกฝั่ง (ไม่เลือก = ค่าของรายการที่เก็บไว้ · ว่าง = บริการเติมให้)
      const fieldChoices = Object.fromEntries(diff.filter((f) => picks[f.key] === "merge").map((f) => [f.key, "merge" as const]));
      const input = { keepId: keep.id, mergeId: drop.id, confirm: confirmed, reason: reason.trim(), fieldChoices };
      const r = kind === "contact" ? await mergeContactsAction(systemId, input) : await mergeCompaniesAction(systemId, input);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="crm-dup-merge-open">
        รวม
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={(e) => (e.target === e.currentTarget ? setOpen(false) : undefined)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`รวม${what}ที่ซ้ำ`}
            data-testid="crm-merge-sheet"
            className="flex max-h-[90vh] w-full max-w-lg min-w-0 flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 shadow-lg sm:rounded-2xl"
          >
            <h2 className="text-base font-semibold">รวม{what}ที่ซ้ำ</h2>
            <p className="text-xs text-[color:var(--color-muted)]">
              {kind === "contact"
                ? "ดีล กิจกรรม บทบาทในบริษัท ไฟล์ และรายการที่ผูกไว้ของรายการที่ถูกรวมจะย้ายมาที่รายการที่เก็บไว้ · แถวเดิมเก็บไว้เป็นประวัติ"
                : "ผู้ติดต่อ ดีล และรายการที่ผูกไว้ของบริษัทที่ถูกรวมจะย้ายมาที่บริษัทที่เก็บไว้ · แถวเดิมเก็บไว้เป็นประวัติ"}
            </p>
            <fieldset className="flex min-w-0 flex-col gap-1 text-sm">
              <legend className="mb-1 text-xs text-[color:var(--color-muted)]">เก็บรายการไหนไว้</legend>
              <label className="flex min-w-0 items-center gap-2">
                <input type="radio" name="crm-merge-keep" checked={keepA} onChange={() => { setKeepA(true); setPicks({}); }} data-testid="crm-merge-keep-a" />
                <span className="min-w-0 truncate">{a.name}</span>
              </label>
              <label className="flex min-w-0 items-center gap-2">
                <input type="radio" name="crm-merge-keep" checked={!keepA} onChange={() => { setKeepA(false); setPicks({}); }} data-testid="crm-merge-keep-b" />
                <span className="min-w-0 truncate">{b.name}</span>
              </label>
            </fieldset>
            {diff.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-2" data-testid="crm-merge-fields">
                <span className="text-xs text-[color:var(--color-muted)]">ค่าที่ต่างกัน — เลือกค่าที่จะใช้ต่อ</span>
                {diff.map((f) => (
                  <div key={f.key} className="flex min-w-0 flex-col gap-1 rounded-lg border p-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
                    <span className="text-xs font-medium">{f.label}</span>
                    <label className="flex min-w-0 items-center gap-2">
                      <input type="radio" name={`crm-merge-${f.key}`} checked={(picks[f.key] ?? "keep") === "keep"} onChange={() => setPicks((p) => ({ ...p, [f.key]: "keep" }))} data-testid="crm-merge-field-keep" />
                      <span className="min-w-0 break-words">{keep.values[f.key] || "(ว่าง)"}</span>
                    </label>
                    <label className="flex min-w-0 items-center gap-2">
                      <input type="radio" name={`crm-merge-${f.key}`} checked={picks[f.key] === "merge"} onChange={() => setPicks((p) => ({ ...p, [f.key]: "merge" }))} data-testid="crm-merge-field-other" />
                      <span className="min-w-0 break-words">{drop.values[f.key] || "(ว่าง)"}</span>
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[color:var(--color-muted)]">ค่าที่กรอกไว้ไม่ขัดกัน — ช่องที่รายการที่เก็บไว้ว่างอยู่จะเติมจากอีกรายการให้</p>
            )}
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>เหตุผล (อย่างน้อย {REASON_MIN} ตัวอักษร)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="input text-sm" placeholder="เช่น ลงทะเบียนซ้ำ คนเดียวกัน" data-testid="crm-merge-reason" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} data-testid="crm-merge-confirm" />
              ยืนยันการรวม{what}
            </label>
            {error && (
              <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-merge-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)} data-testid="crm-merge-cancel">
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={submit} data-testid="crm-merge-submit">
                {pending ? "กำลังรวม…" : "รวม"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
