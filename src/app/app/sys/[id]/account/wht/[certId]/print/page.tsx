import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { accountCan } from "@/lib/modules/account/access";
import { baht } from "@/lib/modules/account/service";
import { listDocPrints, printEntry, recordDocPrint } from "@/lib/modules/account/print-log";
import { loadCertPrint, whtReplaceWarnings } from "@/lib/modules/account/wht-cert";
import { WHT_INCOME_LABEL } from "@/lib/modules/account/wht";
import { CERT_PART_LABEL_TH, WHT_CONDITIONS, certPartsOf } from "@/lib/modules/account/wht-forms";
import { formatThaiDateLong as fmtDate } from "@/lib/ui/date";
import { WhtCertForm } from "@/components/account-v2/WhtCertForm";
import { PrintToolbar } from "@/components/account-v2/PrintToolbar";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { replaceWhtCertAction } from "../../actions";

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ตามโครงแบบทางการ — ACC T3.3 (design note ledger/wo-notes/T3.3.md)
//   ?part=1|2|file|set (ค่าเริ่ม set = ฉบับที่ 1 + ฉบับที่ 2 + สำเนาคู่ฉบับ) · ?p=<printId> แถวบันทึกการพิมพ์ (T2.7) · ไม่มี p = บันทึกแล้ว redirect
//   ใบยกเลิก = ลายน้ำ "ยกเลิก" (ไม่บันทึกการพิมพ์) · ฝั่งถูกหัก (WTI) = หน้าบันทึกเดียว ผู้หัก = ลูกค้า
export default async function WhtCertPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; certId: string }>;
  searchParams: Promise<{ part?: string; p?: string; auto?: string; err?: string }>;
}) {
  const { id, certId } = await params;
  const sp = await searchParams;
  const { tenantId, systemId, userId, auth } = await loadAccountSystem(id, { can: "account.wht.manage" });
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account/wht/${certId}/print`;
  const partQ = sp.part === "1" || sp.part === "2" || sp.part === "file" ? sp.part : "set";

  // สถานะของใบ (ก่อนโหลดทั้งหน้า) — ใบที่ใช้อยู่บันทึกการพิมพ์ · ใบยกเลิกไม่บันทึก
  const head = await loadCertPrint(ctx, certId, { fmtDate });
  if (!head) notFound();
  const live = head.cert.status === "ISSUED";
  let reprintNo: number | null = null;
  let toolbar = "";
  if (live) {
    const entry = sp.p ? await printEntry(ctx, certId, sp.p) : null;
    if (!entry) {
      const rec = await recordDocPrint(ctx, certId, { request: "SET", channel: "SCREEN", actorId: userId });
      if (!rec.ok) notFound();
      redirect(`${base}?p=${rec.printId}&part=${partQ}${sp.auto === "1" ? "&auto=1" : ""}`);
    }
    if (entry.kind === "COPY") {
      const rows = await listDocPrints(ctx, certId);
      reprintNo = rows.filter((r) => r.kind === "COPY" && r.createdAt <= entry.createdAt).length;
    }
    toolbar = `${reprintNo ? `พิมพ์ซ้ำครั้งที่ ${reprintNo}` : "พิมพ์ครั้งแรก"} · บันทึกในประวัติเอกสารแล้ว`;
  } else {
    toolbar = "เอกสารนี้ยกเลิกแล้ว — พิมพ์พร้อมลายน้ำ “ยกเลิก”";
  }
  const loaded = reprintNo ? await loadCertPrint(ctx, certId, { fmtDate, reprintNo }) : head;
  if (!loaded) notFound();
  const m = loaded.model;
  const parts = certPartsOf(partQ === "set" ? null : partQ);
  const canReplace = live && m.direction === "IN" && accountCan(auth, "account.wht.manage");
  const keep = sp.p ? `p=${sp.p}&` : "";

  return (
    <>
      <style>{`@media print { body * { visibility: hidden !important; } [data-print-root], [data-print-root] * { visibility: visible !important; } [data-print-root] { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <PrintToolbar label={toolbar} auto={sp.auto === "1"} />
      <div className="mx-auto mb-3 flex max-w-2xl flex-col gap-2 text-sm print:hidden" data-testid="wht-print-controls">
        {sp.err && (
          <p className="text-[color:var(--color-danger)]" data-testid="wht-print-err">
            {sp.err}
          </p>
        )}
        {m.direction === "IN" && (
          <div className="flex flex-wrap items-center gap-2" data-testid="wht-print-parts">
            <span className="text-[color:var(--color-muted)]">พิมพ์:</span>
            {(["set", "1", "2", "file"] as const).map((p) => (
              <Link
                key={p}
                href={`${base}?${keep}part=${p}`}
                className={`rounded-full border px-2 py-0.5 text-xs ${partQ === p ? "border-[color:var(--color-ink)] font-semibold" : ""}`}
                data-testid={`wht-print-part-${p}`}
              >
                {p === "set" ? "ชุด (ฉบับที่ 1 + 2 + สำเนาคู่ฉบับ)" : CERT_PART_LABEL_TH[p].split(" (")[0]}
              </Link>
            ))}
          </div>
        )}
        {m.warnings.length > 0 && <LegalWarnings warnings={m.warnings} compact testId="wht-print-warnings" />}
        {canReplace && (
          <details className="rounded-lg border bg-white px-3 py-2" data-testid="wht-replace">
            <summary className="cursor-pointer font-medium" data-testid="wht-replace-open">
              ยกเลิกและออกใบแทน
            </summary>
            <form action={replaceWhtCertAction} className="mt-2 flex flex-col gap-2" data-testid="wht-replace-form">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="certId" value={certId} />
              <label className="flex flex-col gap-1">
                <span>เหตุที่ออกใบแทน (พิมพ์บนใบใหม่)</span>
                <input name="reason" required minLength={3} maxLength={300} className="input" data-testid="wht-replace-reason" />
              </label>
              <label className="flex flex-col gap-1">
                <span>ประเภทเงินได้</span>
                <select name="whtIncomeType" className="input" defaultValue="" data-testid="wht-replace-income">
                  <option value="">ตามใบเดิม</option>
                  {Object.entries(WHT_INCOME_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span>เงื่อนไขผู้จ่าย</span>
                <select name="whtCondition" className="input" defaultValue="" data-testid="wht-replace-condition">
                  <option value="">ตามใบเดิม</option>
                  {WHT_CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      ({c.value}) {c.labelTh}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="refreshPayee" value="1" data-testid="wht-replace-refresh" />
                ใช้ชื่อ ที่อยู่ เลขผู้เสียภาษีของผู้ถูกหักจากข้อมูลผู้ติดต่อปัจจุบัน
              </label>
              <LegalWarnings warnings={whtReplaceWarnings(m.docNo)} ackName="ack" testId="wht-replace-warn" />
              <button className="btn btn-primary self-start text-sm" data-testid="wht-replace-submit">
                ยกเลิกใบนี้และออกใบแทน
              </button>
            </form>
          </details>
        )}
      </div>
      <div data-print-root className="flex flex-col gap-4">
        <WhtCertForm m={m} parts={parts} money={(s) => baht(s)} fmtDate={fmtDate} />
      </div>
    </>
  );
}
