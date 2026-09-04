import { pp30, type Pp30Side } from "@/lib/modules/account/reports";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan, writeAudit } from "@/lib/modules/account/access";
import { markVatFiled, unmarkVatFiled, listVatFilings } from "@/lib/modules/account/period-close";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

function sideBlock(title: string, s: Pp30Side) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b bg-[color:var(--color-surface-2)] text-left">
          <th className="px-3 py-2" colSpan={4}>{title}</th>
        </tr>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="px-3 py-1.5">เลขที่</th>
          <th className="px-3 py-1.5">คู่ค้า</th>
          <th className="px-3 py-1.5 text-right">ฐานภาษี</th>
          <th className="px-3 py-1.5 text-right">ภาษี</th>
        </tr>
      </thead>
      <tbody>
        {s.byRate.map((g) => (
          <tr key={g.rateBp} className="border-b bg-[color:var(--color-surface-2)] text-xs font-medium">
            <td className="px-3 py-1" colSpan={2}>อัตรา {g.rateBp / 100}%</td>
            <td className="px-3 py-1 text-right"><MoneyText satang={g.base} decimals /></td>
            <td className="px-3 py-1 text-right"><MoneyText satang={g.vat} decimals /></td>
          </tr>
        ))}
        {s.rows.map((r, i) => (
          <tr key={`${r.docNo}-${i}`} className="border-b last:border-0">
            <td className="px-3 py-1.5 font-mono text-xs">{r.docNo}</td>
            <td className="px-3 py-1.5">{r.contactName || "—"}<span className="text-xs text-[color:var(--color-muted)]"> {r.taxId}</span></td>
            <td className="px-3 py-1.5 text-right"><MoneyText satang={r.base} decimals /></td>
            <td className="px-3 py-1.5 text-right"><MoneyText satang={r.vat} decimals /></td>
          </tr>
        ))}
        <tr className="border-t-2 font-semibold">
          <td className="px-3 py-2" colSpan={2}>รวม</td>
          <td className="px-3 py-2 text-right"><MoneyText satang={s.base} decimals /></td>
          <td className="px-3 py-2 text-right"><MoneyText satang={s.total} decimals /></td>
        </tr>
      </tbody>
    </TableWrap>
  );
}

export default async function Pp30Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; carry?: string; to?: string; err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const period = sp.period || sp.to || currentPeriodKey();
  const carryForward = Math.round((Number(sp.carry) || 0) * 100);
  const pp = await pp30({ tenantId, systemId }, period, { carryForward });
  // WO 6.2 (§11.4 เช็กลิสต์ข้อ 4): งวดนี้ทำเครื่องหมาย "ยื่น ภ.พ.30 แล้ว" หรือยัง
  const filings = await listVatFilings({ tenantId, systemId });
  const filed = filings.find((f) => f.periodKey === period) ?? null;
  const path = `${base}/reports/pp30`;

  async function markFiledAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // ยื่นภาษี = การกระทำเชิงบัญชี ไม่ใช่แค่การอ่านรายงาน ⇒ ใช้สิทธิ์ระดับปิดงวด
    assertAccountCan(auth, "account.period.close");
    const key = String(fd.get("periodKey") ?? "");
    const r = await markVatFiled(
      { tenantId, systemId: id },
      {
        periodKey: key,
        salesVat: Number(fd.get("salesVat") ?? 0),
        inputVat: Number(fd.get("inputVat") ?? 0),
        userId: auth.user.id,
        note: String(fd.get("note") ?? "") || null,
      },
    );
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.file",
      targetType: "AccountVatFiling",
      targetId: key,
      after: { ok: r.ok },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?period=${key}&ok=${encodeURIComponent(`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${key} แล้ว`)}`
        : `${path}?period=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  async function unmarkFiledAction(fd: FormData) {
    "use server";
    const { auth, tenantId } = await loadAccountSystem(id);
    // ยกเลิกเครื่องหมายยื่น = สิทธิ์ระดับเจ้าของ (แบบเดียวกับ account.period.reopen / wht unfile)
    assertAccountCan(auth, "account.period.reopen");
    const key = String(fd.get("periodKey") ?? "");
    const r = await unmarkVatFiled({ tenantId, systemId: id }, key);
    await writeAudit({
      tenantId,
      actorId: auth.user.id,
      action: "account.vat.unfile",
      targetType: "AccountVatFiling",
      targetId: key,
      after: { ok: r.ok },
    });
    revalidatePath(path);
    redirect(
      r.ok
        ? `${path}?period=${key}&ok=${encodeURIComponent("ยกเลิกเครื่องหมายยื่นแล้ว")}`
        : `${path}?period=${key}&err=${encodeURIComponent(r.reason)}`,
    );
  }

  const csv = {
    headers: ["ประเภท", "เลขที่", "คู่ค้า", "เลขภาษี", "อัตรา%", "ฐาน (บาท)", "ภาษี (บาท)"],
    rows: [
      ...pp.output.rows.map((r) => ["ภาษีขาย", r.docNo, r.contactName, r.taxId, r.rateBp / 100, r.base / 100, r.vat / 100] as (string | number)[]),
      ...pp.input.rows.map((r) => ["ภาษีซื้อ", r.docNo, r.contactName, r.taxId, r.rateBp / 100, r.base / 100, r.vat / 100] as (string | number)[]),
    ],
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="ภ.พ.30 + รายงานภาษีขาย/ซื้อ" subtitle={`เดือนภาษี ${period}`} />
      </div>
      {/* ภ.พ.30 ยื่นเป็น "งวด" ⇒ ใช้แถบเครื่องมือโหมด ณ สิ้นเดือน · ไม่มีตัวเลือกเทียบงวดก่อน (แบบยื่นไม่เทียบ) */}
      <ReportToolbar filename={`ภพ30-${period}`} csv={csv} mode="asof" to={period} showCompare={false} />

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && <p className="text-sm font-medium">{sp.ok}</p>}

      <form className="flex flex-wrap items-center gap-2 print:hidden">
        <input type="hidden" name="period" value={period} />
        <input name="carry" defaultValue={sp.carry ?? ""} placeholder="เครดิตยกมา (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn btn-ghost text-sm">คำนวณ</button>
        <a
          href={`${base}/tax/export?kind=pp30&period=${period}&carry=${carryForward}`}
          className="btn-sm"
          download
        >
          ดาวน์โหลด CSV ยื่น
        </a>
      </form>

      {/* เครื่องหมาย "ยื่นแล้ว" — เช็กลิสต์ก่อนปิดงวด (§11.4) อ่านจากตรงนี้ */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm print:hidden" data-testid="pp30-filed-box">
        {filed ? (
          <>
            <span data-testid="pp30-filed-state">✓ ทำเครื่องหมายยื่น ภ.พ.30 งวด {period} แล้ว</span>
            <ConfirmDialog
              action={unmarkFiledAction}
              fields={{ periodKey: period }}
              triggerLabel="ยกเลิกเครื่องหมาย"
              triggerClassName="text-sm text-[color:var(--color-muted)] hover:underline"
              title="ยกเลิกเครื่องหมายยื่น ภ.พ.30?"
              detail="เช็กลิสต์ก่อนปิดงวดจะกลับไปเป็น “ยังไม่ได้ยื่น”"
              confirmLabel="ยืนยัน"
              danger
            />
          </>
        ) : (
          <>
            <span data-testid="pp30-filed-state">ยังไม่ได้ทำเครื่องหมายยื่นสำหรับงวด {period}</span>
            <ConfirmDialog
              action={markFiledAction}
              fields={{
                periodKey: period,
                salesVat: String(pp.output.total),
                inputVat: String(pp.input.total),
              }}
              reasonField={{ name: "note", label: "หมายเหตุ (ไม่บังคับ)", required: false }}
              triggerLabel="ทำเครื่องหมายยื่นแล้ว"
              triggerClassName="btn btn-ghost text-sm"
              title={`ทำเครื่องหมายยื่น ภ.พ.30 งวด ${period}?`}
              detail="ระบบจะบันทึกยอดภาษีขาย/ซื้อของงวดนี้ไว้เป็นหลักฐาน และเช็กลิสต์ก่อนปิดงวดจะผ่านข้อนี้"
              confirmLabel="ยืนยัน"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีขาย</div><div className="text-lg font-semibold"><MoneyText satang={pp.output.total} decimals /></div></div>
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อ</div><div className="text-lg font-semibold"><MoneyText satang={pp.input.total} decimals /></div></div>
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">{pp.netPayable >= 0 ? "ต้องชำระ" : "เครดิตยกไป"}</div>
          <div className="text-lg font-bold"><MoneyText satang={Math.abs(pp.netPayable)} decimals /></div>
        </div>
      </div>
      {pp.carryForward > 0 && (
        <div className="text-xs text-[color:var(--color-muted)]">หักเครดิตภาษียกมา <MoneyText satang={pp.carryForward} decimals /> · เครดิตยกไปเดือนถัดไป <MoneyText satang={pp.creditCarry} decimals /></div>
      )}

      <div className="flex flex-col gap-4">
        {sideBlock("รายงานภาษีขาย (2200)", pp.output)}
        {sideBlock("รายงานภาษีซื้อ (1150)", pp.input)}
      </div>
    </div>
  );
}
