// StatusTable.tsx — "สถานะเชื่อมต่อ" (ใบ C3.6 · ภาพ 17 ขวาล่าง): ระบบ · เหตุการณ์ล่าสุด · จำนวน 7 วัน · สถานะ
// 🔴 server component · ไม่ import โมดูล CRM — ข้อมูลมาทาง props (ป้ายเวลาไทยคิดที่ page.tsx)
// 🔴 390 px: ตารางอยู่ในกล่องเลื่อนแนวนอน (overflow-x-auto) · ไม่มีความกว้างตายตัว · ไม่มี payload ของ event (ชนิด + เวลา + จำนวนเท่านั้น)
export type StatusRow = { code: string; label: string; enabled: boolean; lastEventType: string | null; lastLabel: string; events7d: number };

const muted = "text-[color:var(--color-muted)]";

export function StatusTable({ rows, emptyLabel, windowDays, note = null }: { rows: StatusRow[]; emptyLabel: string; windowDays: number; note?: string | null }) {
  return (
    <section data-testid="crm-integrations-status-table" className="card flex min-w-0 flex-col gap-2 p-3 sm:p-4">
      <h2 className="text-sm font-semibold">
        สถานะเชื่อมต่อ <span className={`text-xs font-normal ${muted}`}>เหตุการณ์ย้อนหลัง {windowDays} วัน</span>
      </h2>
      {note ? <p className="text-xs text-[color:var(--color-danger)]">{note}</p> : null}
      {rows.length === 0 ? (
        <p className={`text-xs ${muted}`}>ร้านยังไม่ได้เปิดระบบอื่นที่เชื่อมกับ CRM</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-left text-xs ${muted}`}>
                <th className="py-1.5 pr-2 font-medium">ระบบ</th>
                <th className="py-1.5 pr-2 font-medium">เหตุการณ์ล่าสุด</th>
                <th className="py-1.5 pr-2 text-right font-medium">7 วัน</th>
                <th className="py-1.5 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} data-testid={`crm-integrations-status-row-${r.code}`} className="border-t border-[color:var(--color-line)] align-top">
                  <td className="py-2 pr-2 font-semibold">{r.label}</td>
                  <td className="py-2 pr-2">
                    {r.lastEventType ? (
                      <span className="flex flex-col">
                        <code className="break-all text-xs">{r.lastEventType}</code>
                        <span className={`text-[11px] ${muted}`}>{r.lastLabel}</span>
                      </span>
                    ) : (
                      <span className={`text-xs ${muted}`}>{emptyLabel}</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{r.events7d.toLocaleString("th-TH")}</td>
                  <td className="py-2 text-right text-xs">
                    {r.enabled ? <span aria-label="เชื่อมแล้ว">✓ เชื่อมแล้ว</span> : <span className={muted}>ไม่ได้เปิดใช้</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
