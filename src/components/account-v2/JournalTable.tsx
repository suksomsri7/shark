"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AccountIcon } from "./AccountIcon";
import { formatDateTh } from "@/lib/ui/date";

// ตารางสมุดรายวัน V2 — เฟรม g16-journal.png
// คอลัมน์ตามเฟรมเป๊ะ: (กางแถว) · วันที่ · เลขที่ JV · สมุด · คำอธิบาย · อ้างอิงเอกสาร · เดบิต · เครดิต · ผู้บันทึก · ⚑
// กางแถว = ตารางบรรทัดย่อย (บัญชี · คำอธิบาย · เดบิต · เครดิต) ในแถวเดียวกัน — ไม่เด้งออกหน้าใหม่
// (client เพราะ "กาง/ยุบ" เป็น state ของตาราง · ข้อมูลทั้งหมดคิดมาจาก server แล้ว)

export type JournalTableLine = {
  id: string;
  code: string;
  name: string;
  note: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
  suspense: boolean;
};

export type JournalTableRow = {
  id: string;
  docNo: string;
  dateIso: string;
  bookLabel: string;
  memo: string | null;
  refLabel: string | null;
  refHref: string | null;
  totalDebit: number;
  totalCredit: number;
  postedByName: string | null;
  needsReview: boolean;
  flagNote: string | null;
  reversed: boolean;
  isReversal: boolean;
  lines: JournalTableLine[];
};

const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ยอดที่เป็น 0 ในตารางบรรทัดย่อยของ g16 แสดงเป็นขีด "—" ไม่ใช่ 0.00 */
const cell = (satang: number) =>
  satang === 0 ? <span className="text-[color:var(--color-muted)]">—</span> : baht(satang);

export function JournalTable({
  rows,
  base,
  sumDebit,
  sumCredit,
  total,
  expandedFirst,
  footer,
}: {
  rows: JournalTableRow[];
  /** `/app/sys/<id>/account` */
  base: string;
  sumDebit: number;
  sumCredit: number;
  total: number;
  /** กางแถวแรกที่มีบัญชีพักไว้ตั้งแต่โหลด (สถานะเดียวกับ g16) */
  expandedFirst?: string;
  /** แถบแบ่งหน้า — วางไว้ "ในการ์ดเดียวกับตาราง" ต่อจากแถวสรุป (แบบ footerInsideCard ของ DocTable WO 5.4) */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    expandedFirst ? { [expandedFirst]: true } : {},
  );
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    // การ์ด = กรอบนอก · ตัวที่เลื่อนแนวนอนคือกรอบใน ⇒ แถบแบ่งหน้าท้ายการ์ดไม่เลื่อนหนีไปกับตาราง
    <div className="rounded-xl border" style={{ borderColor: "var(--color-line)" }} data-testid="journal-table">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr
            className="border-b text-left text-xs text-[color:var(--color-muted)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <th className="w-9 px-2 py-3" aria-label="กางรายละเอียด" />
            <th className="px-2 py-3 font-medium">วันที่</th>
            <th className="px-2 py-3 font-medium">เลขที่ JV</th>
            <th className="px-2 py-3 font-medium">สมุด</th>
            <th className="px-2 py-3 font-medium">คำอธิบาย</th>
            <th className="px-2 py-3 font-medium">อ้างอิงเอกสาร</th>
            <th className="px-2 py-3 text-right font-medium">เดบิต</th>
            <th className="px-2 py-3 text-right font-medium">เครดิต</th>
            <th className="px-2 py-3 font-medium">ผู้บันทึก</th>
            <th className="w-10 px-2 py-3" aria-label="ต้องตรวจ" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-3 py-10 text-center text-[color:var(--color-muted)]">
                ไม่มีรายการในสมุดนี้ตามตัวกรองที่เลือก
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <FragmentRow key={r.id} r={r} base={base} open={!!open[r.id]} onToggle={() => toggle(r.id)} />
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2" style={{ borderColor: "var(--color-line)" }}>
              <td className="whitespace-nowrap px-2 py-3" colSpan={6} data-testid="journal-total-count">
                รวม {total} รายการ
              </td>
              {/* g16: "รวมเดบิต ฿X" และ "รวมเครดิต ฿Y" อยู่บรรทัดเดียวกันชิดขวา — ห้ามตัดคำ */}
              <td className="whitespace-nowrap px-2 py-3 text-right" data-testid="journal-sum-debit">
                <span className="mr-1.5 text-xs font-normal text-[color:var(--color-muted)]">รวมเดบิต</span>
                <span className="font-semibold tabular-nums">฿{baht(sumDebit)}</span>
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-right" data-testid="journal-sum-credit">
                <span className="mr-1.5 text-xs font-normal text-[color:var(--color-muted)]">รวมเครดิต</span>
                <span className="font-semibold tabular-nums">฿{baht(sumCredit)}</span>
              </td>
              <td className="px-2 py-3" colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
      </div>
      {footer && (
        <div className="border-t px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  r,
  base,
  open,
  onToggle,
}: {
  r: JournalTableRow;
  base: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }} data-testid={`jv-row-${r.docNo}`}>
        <td className="px-2 py-3 align-top">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "ย่อรายละเอียด" : "กางรายละเอียด"}
            className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)]"
            data-testid={`jv-expand-${r.docNo}`}
          >
            <AccountIcon name={open ? "chevron-down" : "chevron-right"} className="h-4 w-4" />
          </button>
        </td>
        <td className="whitespace-nowrap px-2 py-3 align-top">{formatDateTh(r.dateIso)}</td>
        <td className="whitespace-nowrap px-2 py-3 align-top">
          <Link href={`${base}/journal/${r.id}`} className="text-[color:var(--color-accent)] hover:underline">
            {r.docNo}
          </Link>
          {r.reversed && (
            <span className="ml-1.5 whitespace-nowrap text-[11px] text-[color:var(--color-muted)]">
              (กลับรายการแล้ว)
            </span>
          )}
        </td>
        <td className="px-2 py-3 align-top">
          <span
            className="whitespace-nowrap rounded-md border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--color-line)" }}
          >
            {r.bookLabel}
          </span>
        </td>
        <td className="px-2 py-3 align-top">{r.memo ?? "—"}</td>
        <td className="whitespace-nowrap px-2 py-3 align-top">
          {r.refLabel ? (
            r.refHref ? (
              <Link href={`${base}/${r.refHref}`} className="text-[color:var(--color-accent)] hover:underline">
                {r.refLabel}
              </Link>
            ) : (
              r.refLabel
            )
          ) : (
            <span className="text-[color:var(--color-muted)]">—</span>
          )}
        </td>
        <td className="px-2 py-3 text-right align-top tabular-nums">{baht(r.totalDebit)}</td>
        <td className="px-2 py-3 text-right align-top tabular-nums">{baht(r.totalCredit)}</td>
        <td className="whitespace-nowrap px-2 py-3 align-top">{r.postedByName ?? "ระบบ"}</td>
        <td className="px-2 py-3 align-top">
          {r.needsReview && (
            <span
              title={r.flagNote ?? "ต้องตรวจสอบ"}
              aria-label={`ต้องตรวจสอบ: ${r.flagNote ?? "ต้องตรวจสอบ"}`}
              className="text-[color:var(--color-danger)]"
              data-testid={`jv-flag-${r.docNo}`}
            >
              <AccountIcon name="flag" className="h-4 w-4" />
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b" style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}>
          <td className="px-2 pb-4" colSpan={10}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  <th className="py-2 pl-8 font-medium">บัญชี</th>
                  <th className="py-2 font-medium">คำอธิบาย</th>
                  <th className="py-2 text-right font-medium">เดบิต</th>
                  <th className="py-2 pr-2 text-right font-medium">เครดิต</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pl-8">
                      <span className="text-[color:var(--color-muted)]">{l.code}</span> {l.name}
                      {l.suspense && (
                        <span className="ml-1 inline-block align-text-bottom text-[color:var(--color-danger)]" title="บัญชีพัก 9999 — ต้องเคลียร์ก่อนปิดงวด">
                          <AccountIcon name="warn" className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {l.contactName && (
                        <span className="ml-1 text-xs text-[color:var(--color-muted)]">· {l.contactName}</span>
                      )}
                    </td>
                    <td className="py-1.5">{l.note ?? <span className="text-[color:var(--color-muted)]">—</span>}</td>
                    <td className="py-1.5 text-right tabular-nums">{cell(l.debit)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{cell(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
