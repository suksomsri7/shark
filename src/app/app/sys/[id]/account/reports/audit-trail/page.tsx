import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { AUDIT_TRAIL_KINDS, listAccountChanges, type AuditTrailKind } from "@/lib/modules/account/audit-trail";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T4.4 — รายงานการแก้ไขของบัญชี (ปิด E12 G2 G7): ใคร ทำอะไร เมื่อไร กับเอกสาร/ใบสำคัญไหน จำนวนเงิน และเหตุผลยกเลิก
//   + กดยืนยันคำเตือนกฎหมาย + log เข้าระบบของสมาชิกร้าน · ตัวคิดเดียวกับ REST `GET /audit/changes` (audit-trail.ts)
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const bkkDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const bkkTime = (d: Date) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const KIND_TH: Record<AuditTrailKind, string> = { all: "ทั้งหมด", cancel: "ยกเลิก / กลับรายการ", legal: "กดยืนยันคำเตือน", signin: "เข้า-ออกระบบ" };
const CAT_TH: Record<string, string> = { cancel: "ยกเลิก", legal: "คำเตือน", signin: "เข้าระบบ", change: "แก้ไข" };

export default async function AuditTrailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; kind?: string; cursor?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const today = bkkDay(new Date());
  const to = sp.to && YMD.test(sp.to) ? sp.to : today;
  const defFrom = bkkDay(new Date(new Date(`${to}T00:00:00+07:00`).getTime() - 30 * 86_400_000));
  const from = sp.from && YMD.test(sp.from) && sp.from <= to ? sp.from : defFrom;
  const kind = (AUDIT_TRAIL_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as AuditTrailKind) : "all";
  const res = await listAccountChanges({ tenantId, systemId }, { from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`), kind, take: 300, cursor: sp.cursor });
  const csv = {
    headers: ["วันเวลา", "ผู้ทำ", "ประเภท", "รายการ", "เอกสาร/ใบสำคัญ", "จำนวนเงิน (บาท)", "เหตุผล", "รายละเอียด"],
    rows: res.rows.map((r) => [bkkTime(r.at), r.actorName, CAT_TH[r.category] ?? r.category, r.actionLabel, r.ref ?? "", r.amountSatang === null ? "" : (r.amountSatang / 100).toFixed(2), r.reason ?? "", r.detail ?? ""]),
  };
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ from, to, kind, ...extra }).toString()}`;

  return (
    <div className="flex max-w-6xl flex-col gap-5" data-testid="audit-trail-page">
      <ReportHeader base={base} title="รายงานการแก้ไขของบัญชี" subtitle={`${from} ถึง ${to} · ใครทำอะไร เมื่อไร · เหตุผลการยกเลิก · การเข้าระบบ`} />
      <ReportToolbar filename={`รายงานการแก้ไข-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden" data-testid="audit-trail-filter">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่
          <input type="date" name="from" defaultValue={from} className="input h-9" data-testid="audit-trail-from" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง
          <input type="date" name="to" defaultValue={to} className="input h-9" data-testid="audit-trail-to" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ประเภท
          <select name="kind" defaultValue={kind} className="input h-9" data-testid="audit-trail-kind">
            {AUDIT_TRAIL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_TH[k]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary btn-sm h-9" data-testid="audit-trail-apply">
          แสดง
        </button>
      </form>
      <p className="text-xs text-[color:var(--color-muted)]">
        รายการที่ลงบัญชีแล้วแก้หรือลบไม่ได้ — การแก้ไขทำด้วยการกลับรายการหรือออกเอกสารปรับปรุง และทุกครั้งจะปรากฏในรายงานนี้ (ระบบบันทึกไว้ถาวร แก้หรือลบบันทึกไม่ได้)
      </p>
      <section className="flex flex-col gap-2" data-testid="audit-trail-rows">
        <h2 className="text-sm font-medium">
          {res.total} รายการ{res.total > res.rows.length ? ` (แสดง ${res.rows.length})` : ""}
        </h2>
        <TableWrap>
          <thead>
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2">วันเวลา</th>
              <th className="px-3 py-2">ผู้ทำ</th>
              <th className="px-3 py-2">รายการ</th>
              <th className="px-3 py-2">เอกสาร/ใบสำคัญ</th>
              <th className="px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="px-3 py-2">เหตุผล / รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.length === 0 ? (
              <tr className="border-t">
                <td colSpan={6} className="px-3 py-4 text-center text-[color:var(--color-muted)]" data-testid="audit-trail-empty">
                  ไม่มีรายการในช่วงนี้
                </td>
              </tr>
            ) : (
              res.rows.map((r) => (
                <tr key={r.id} className="border-t align-top" data-testid="audit-trail-row" data-category={r.category} data-action={r.action}>
                  <td className="whitespace-nowrap px-3 py-1.5">{bkkTime(r.at)}</td>
                  <td className="px-3 py-1.5">{r.actorName}</td>
                  <td className="px-3 py-1.5">
                    <span className={r.category === "cancel" ? "font-medium text-[color:var(--color-danger)]" : undefined}>{r.actionLabel}</span>
                  </td>
                  <td className="px-3 py-1.5">{r.ref ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.amountSatang === null ? "—" : <MoneyText satang={r.amountSatang} decimals />}</td>
                  <td className="px-3 py-1.5">
                    {r.reason ? <div data-testid="audit-trail-reason">เหตุผล: {r.reason}</div> : r.category === "cancel" ? <div className="text-[color:var(--color-muted)]">ไม่ได้ระบุเหตุผล</div> : null}
                    {r.detail ? <div className="text-xs text-[color:var(--color-muted)]">{r.detail}</div> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
        {res.nextCursor ? (
          <Link href={q({ cursor: res.nextCursor })} className="self-start text-sm underline print:hidden" data-testid="audit-trail-next">
            หน้าถัดไป ›
          </Link>
        ) : null}
      </section>
    </div>
  );
}
