import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { listJournalPaged, journalRangeOf, JOURNAL_TABS } from "@/lib/modules/account/journal-v2";
import { formatDateTh } from "@/lib/ui/date";

// หน้าพิมพ์สมุดรายวัน (ปุ่ม "พิมพ์รายงาน" ของ g16) — ตารางแบน ขาว-ดำ ไม่มีเมนู
// ใช้ตัวกรองชุดเดียวกับหน้ารายการ (ส่งผ่าน query) เพื่อให้ "สิ่งที่พิมพ์ = สิ่งที่เห็นบนจอ"
export default async function JournalPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.journal.view");

  // ค่าตั้งต้นเดียวกับหน้ารายการเป๊ะ ("เดือนนี้" = ทั้งเดือน) — ปกติหน้ารายการส่ง from/to มาให้อยู่แล้ว
  const month = journalRangeOf("this_month", new Date());
  const from = sp.from || month.from;
  const to = sp.to || month.to;
  const tab = JOURNAL_TABS.find((t) => t.key === sp.tab)?.key ?? "ALL";
  const tabLabel = JOURNAL_TABS.find((t) => t.key === tab)?.label ?? "ทั้งหมด";
  const base = `/app/sys/${id}/account`;

  // พิมพ์ทั้งช่วง (ไม่แบ่งหน้า) — cap 2000 กันหน้าค้างเมื่อช่วงกว้างผิดปกติ
  const list = await listJournalPaged(
    { tenantId, systemId },
    { book: tab, from, to, q: sp.q, page: 1, pageSize: 200 },
  );
  const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <Link href={`${base}/journal`} className="text-sm text-[color:var(--color-muted)] print:hidden">
        ← กลับไปบัญชีรายวัน
      </Link>
      <h1 className="text-xl font-semibold">บัญชีรายวัน — สมุด{tabLabel}</h1>
      <p className="text-sm text-[color:var(--color-muted)]">
        {formatDateTh(from)} ถึง {formatDateTh(to)} · {list.total} รายการ
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs">
            <th className="py-2 pr-2">วันที่</th>
            <th className="py-2 pr-2">เลขที่ JV</th>
            <th className="py-2 pr-2">สมุด</th>
            <th className="py-2 pr-2">คำอธิบาย</th>
            <th className="py-2 pr-2">อ้างอิงเอกสาร</th>
            <th className="py-2 pr-2 text-right">เดบิต</th>
            <th className="py-2 text-right">เครดิต</th>
          </tr>
        </thead>
        <tbody>
          {list.rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-1.5 pr-2 whitespace-nowrap">{formatDateTh(r.date)}</td>
              <td className="py-1.5 pr-2 font-mono text-xs">{r.docNo}</td>
              <td className="py-1.5 pr-2">{r.bookLabel}</td>
              <td className="py-1.5 pr-2">{r.memo ?? "—"}</td>
              <td className="py-1.5 pr-2">{r.ref?.label ?? "—"}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{baht(r.totalDebit)}</td>
              <td className="py-1.5 text-right tabular-nums">{baht(r.totalCredit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2" colSpan={5}>
              รวม {list.total} รายการ
            </td>
            <td className="py-2 text-right tabular-nums">{baht(list.sumDebit)}</td>
            <td className="py-2 text-right tabular-nums">{baht(list.sumCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
