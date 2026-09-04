"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Modal } from "./Modal";
import { DateInput } from "./DateInput";
import { MoneyInput } from "./MoneyInput";
import { AccountIcon } from "./AccountIcon";

// modal "สร้างสมุดรายวัน" — เฟรม g16-journal-modal.png (§11.2)
// โครงตามเฟรม: วันที่ · สมุด · เลขที่ JV (อัตโนมัติ แก้ไม่ได้) → คำอธิบาย → กล่องบรรทัดรายการ
//              → แถบสมดุล → แนบไฟล์ → ปุ่ม ยกเลิก / บันทึกร่าง / ✓ อนุมัติ
//
// 🔴 กติกาเงิน: ทุกจำนวนเป็น **สตางค์ (integer)** ตลอดทาง — MoneyInput คืนสตางค์ · ส่ง FormData เป็นสตางค์
// 🔴 ไม่สมดุล = ปุ่มอนุมัติกดไม่ได้ (ด่านที่ 1) และ server ปฏิเสธซ้ำอีกชั้น (ด่านที่ 2 — gl.postManualJV)

export type JvAccountOption = { id: string; code: string; name: string };
export type JvContactOption = { id: string; name: string };

type LineState = { key: number; accountId: string; debit: number; credit: number; contactId: string; note: string };

const BOOKS: { value: string; label: string }[] = [
  { value: "GENERAL", label: "ทั่วไป" },
  { value: "SALES", label: "ขาย" },
  { value: "PURCHASES", label: "ซื้อ" },
  { value: "RECEIPTS", label: "รับ" },
  { value: "PAYMENTS", label: "จ่าย" },
];

const baht = (satang: number) =>
  "฿" + (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let seq = 0;
const blank = (): LineState => ({ key: ++seq, accountId: "", debit: 0, credit: 0, contactId: "", note: "" });

export function ManualJvModal({
  journalPath,
  systemId,
  accounts,
  contacts,
  defaultDate,
  nextDocNo,
  action,
  error,
}: {
  /** เส้นทางหน้าสมุดรายวัน — ปิด modal = กลับไปหน้านี้ (แบบเดียวกับ LedgerModal ของ WO 6.1) */
  journalPath: string;
  systemId: string;
  accounts: JvAccountOption[];
  contacts: JvContactOption[];
  /** ISO yyyy-mm-dd (วันนี้ตามเวลาไทย) */
  defaultDate: string;
  /** เลขที่ JV ที่ระบบจะออกให้ (พรีวิวอย่างเดียว — เลขจริงออกตอนบันทึก) */
  nextDocNo: string;
  action: (fd: FormData) => void;
  error?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineState[]>(() => [blank(), blank()]);
  const [pending, start] = useTransition();
  const close = () => router.push(journalPath);

  const totals = useMemo(() => {
    const used = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    const debit = used.reduce((s, l) => s + l.debit, 0);
    const credit = used.reduce((s, l) => s + l.credit, 0);
    return { debit, credit, count: used.length, balanced: debit === credit && debit > 0 && used.length >= 2 };
  }, [lines]);

  const patch = (key: number, p: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const submit = (fd: FormData) => start(() => action(fd));

  // size xl (896px) ไม่ใช่ lg — g16-journal-modal.png กว้าง ~940/1440 · lg (672px) ทำให้ชื่อบัญชีในบรรทัดถูกตัด
  return (
    <Modal open onClose={close} title="สร้างสมุดรายวัน" size="xl" testId="jv-modal" sheetOnMobile>
      <form action={submit} className="flex flex-col gap-4">
        <input type="hidden" name="systemId" value={systemId} />
        {lines.map((l) => (
          <input key={`h-${l.key}`} type="hidden" name="lineKey" value={l.key} />
        ))}

        {error && (
          <p
            className="rounded-lg border px-3 py-2 text-sm text-[color:var(--color-danger)]"
            style={{ borderColor: "var(--color-danger)" }}
            data-testid="jv-error"
          >
            {error}
          </p>
        )}

        {/* แถวบน 3 ช่อง ตามเฟรม */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่
            <DateInput name="date" defaultValue={defaultDate} required testId="jv-date" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            สมุด
            <select name="book" defaultValue="GENERAL" className="input" data-testid="jv-book">
              {BOOKS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขที่ JV
            <input className="input" value={nextDocNo} readOnly disabled data-testid="jv-docno" />
            <span className="text-[11px] text-[color:var(--color-muted)]">อัตโนมัติ · แก้ไม่ได้</span>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          คำอธิบาย
          <input name="memo" className="input" placeholder="ระบุคำอธิบายรายการ" data-testid="jv-memo" />
        </label>

        {/* กล่องบรรทัดรายการ */}
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
          <div className="mb-2 text-sm font-semibold">บรรทัดรายการ</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr
                  className="border-b text-left text-xs text-[color:var(--color-muted)]"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <th className="py-2 pr-2 font-medium">บัญชี</th>
                  <th className="py-2 pr-2 font-medium">ผู้ติดต่อ</th>
                  <th className="py-2 pr-2 font-medium">คำอธิบาย</th>
                  <th className="py-2 pr-2 text-right font-medium">เดบิต</th>
                  <th className="py-2 text-right font-medium">เครดิต</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1">
                        <AccountIcon name="search" className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-muted)]" />
                        <select
                          name="accountId"
                          value={l.accountId}
                          onChange={(e) => patch(l.key, { accountId: e.target.value })}
                          className="input"
                          data-testid={`jv-account-${i}`}
                        >
                          <option value="">— เลือกบัญชี —</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        name="contactId"
                        value={l.contactId}
                        onChange={(e) => patch(l.key, { contactId: e.target.value })}
                        className="input"
                        data-testid={`jv-contact-${i}`}
                      >
                        <option value="">—</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        name="note"
                        value={l.note}
                        onChange={(e) => patch(l.key, { note: e.target.value })}
                        className="input"
                        data-testid={`jv-note-${i}`}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <MoneyInput
                        name="debit"
                        value={l.debit}
                        onChangeSatang={(s) => patch(l.key, { debit: s, credit: s > 0 ? 0 : l.credit })}
                        testId={`jv-debit-${i}`}
                      />
                    </td>
                    <td className="py-2">
                      <MoneyInput
                        name="credit"
                        value={l.credit}
                        onChangeSatang={(s) => patch(l.key, { credit: s, debit: s > 0 ? 0 : l.debit })}
                        testId={`jv-credit-${i}`}
                      />
                    </td>
                    <td className="py-2 text-right">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          aria-label="ลบบรรทัด"
                          className="text-[color:var(--color-muted)] hover:text-[color:var(--color-danger)]"
                        >
                          <AccountIcon name="x" className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, blank()])}
            className="btn btn-ghost mt-3 text-sm"
            data-testid="jv-add-line"
          >
            <AccountIcon name="plus" className="h-4 w-4" /> เพิ่มบรรทัด
          </button>
        </div>

        {/* แถบสมดุล — ไม่สมดุล = เตือน + ปุ่มอนุมัติกดไม่ได้ */}
        <div
          className="flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm"
          style={{ borderColor: totals.balanced ? "var(--color-line)" : "var(--color-danger)" }}
          data-testid="jv-balance-bar"
        >
          <AccountIcon
            name={totals.balanced ? "check" : "warn"}
            className={`h-4 w-4 ${totals.balanced ? "" : "text-[color:var(--color-danger)]"}`}
          />
          <span className="font-medium">
            เดบิต {baht(totals.debit)} {totals.balanced ? "=" : "≠"} เครดิต {baht(totals.credit)}
          </span>
          <span
            className={totals.balanced ? "" : "text-[color:var(--color-danger)]"}
            data-testid="jv-balance-state"
          >
            {totals.balanced
              ? "สมดุล"
              : totals.count < 2
                ? "ต้องมีอย่างน้อย 2 บรรทัด"
                : "ไม่สมดุล — บันทึกไม่ได้"}
          </span>
        </div>

        {/* แนบไฟล์ */}
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          แนบไฟล์
          {/* 🔴 ซ่อน <input type="file"> ของเบราว์เซอร์ (มันวาดปุ่มอังกฤษ "Choose Files / No file chosen")
              — g16 มีแต่ข้อความไทย · ตัว input ยังอยู่จริงและคลิกได้ทั้งกล่องผ่าน <label> ที่ครอบอยู่ */}
          <div
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm text-[color:var(--color-muted)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <AccountIcon name="upload" className="h-4 w-4 shrink-0" />
            <span>ลากไฟล์มาวาง หรือเลือกไฟล์แนบ</span>
            <input
              type="file"
              name="files"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              data-testid="jv-files"
              aria-label="ลากไฟล์มาวาง หรือเลือกไฟล์แนบ"
            />
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }}>
          <button type="button" onClick={close} className="btn btn-ghost text-sm">
            ยกเลิก
          </button>
          <div className="flex gap-2">
            <button
              type="submit"
              name="mode"
              value="DRAFT"
              className="btn btn-ghost text-sm"
              disabled={pending || !totals.balanced}
              title={totals.balanced ? undefined : "ต้องสมดุลก่อนจึงบันทึกได้"}
              data-testid="jv-save-draft"
            >
              บันทึกร่าง
            </button>
            <button
              type="submit"
              name="mode"
              value="POST"
              className="btn btn-primary text-sm"
              disabled={pending || !totals.balanced}
              title={totals.balanced ? undefined : "เดบิตรวมต้องเท่ากับเครดิตรวม"}
              data-testid="jv-submit"
            >
              <AccountIcon name="check" className="h-4 w-4" /> {pending ? "กำลังบันทึก…" : "อนุมัติ"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
