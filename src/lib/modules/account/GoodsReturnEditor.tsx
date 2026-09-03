"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createGoodsMovementAction } from "./product-actions";
import { REASON_OPTIONS, packAdjustReason } from "@/components/account-v2/doc-editor-types";
import { Stepper } from "@/components/account-v2/Stepper";

type PrrLine = { productId: string; name: string; sku: string | null; issuedQty: number; remainingQty: number };

// WO 1.6 §5.2 J — ขั้น ② ของ wizard ใบส่งคืนเบิก (RPR): บรรทัดพรีฟิลจาก PRR ที่เลือกไว้ขั้น ① · จำนวนคืนแก้ได้
// แต่ต้องไม่เกิน "จำนวนที่ยังคืนได้" ต่อบรรทัด (เพดานคำนวณจาก server ใน route — ตรวจซ้ำฝั่ง server เสมอ)
export default function GoodsReturnEditor({
  systemId,
  prr,
  lines,
  cancelHref,
  refChipHref,
}: {
  systemId: string;
  prr: { id: string; docNo: string | null; contactId: string | null; contactName: string | null };
  lines: PrrLine[];
  cancelHref: string;
  /** ปุ่มลิงก์ chip "อ้างอิง PRR <เลขที่>" ในหัวฟอร์ม — PRR ยังไม่มีหน้ารายละเอียดเดี่ยว จึงชี้กลับไปหน้ารายการใบเบิก */
  refChipHref: string;
}) {
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>(
    Object.fromEntries(lines.map((l) => [l.productId, l.remainingQty > 0 ? String(l.remainingQty) : "0"])),
  );
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [note, setNote] = useState("");

  const rows = useMemo(
    () =>
      lines.map((l) => ({
        ...l,
        qty: Math.min(Math.max(0, Number(qtyByProduct[l.productId] ?? 0) || 0), l.remainingQty),
      })),
    [lines, qtyByProduct],
  );
  const outLines = rows.filter((r) => r.qty > 0).map((r) => ({ productId: r.productId, qty: r.qty, description: null }));
  const canSubmit = outLines.length > 0;
  const packedReason = packAdjustReason(reasonCode, reasonText);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 pb-28" data-testid="goods-return-step2">
      <div className="flex items-baseline gap-2">
        <h1 className="text-xl font-semibold">สร้างใบส่งคืนเบิกสินค้า</h1>
        <Link
          href={refChipHref}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
          style={{ background: "var(--color-surface-2)", color: "var(--color-accent)" }}
          data-testid="ref-chip"
        >
          อ้างอิงPRR {prr.docNo ?? "—"}
        </Link>
      </div>

      <div className="card px-5 py-4">
        <Stepper
          steps={[
            { code: "1", label: "เลือก PRR", state: "done" },
            { code: "2", label: "ใบส่งคืนเบิก", state: "current" },
          ]}
          testId="wizard-step"
        />
      </div>

      <form action={createGoodsMovementAction} className="card flex flex-col gap-4">
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="docType" value="GOODS_ISSUE_RETURN" />
        <input type="hidden" name="sourceDocId" value={prr.id} />
        <input type="hidden" name="contactId" value={prr.contactId ?? ""} />
        <input type="hidden" name="lines" value={JSON.stringify(outLines)} />
        <input type="hidden" name="adjustReason" value={packedReason} />

        <p className="text-sm text-[color:var(--color-muted)]">
          ผู้ติดต่อ: {prr.contactName ?? "— ไม่ระบุ —"}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-2">สินค้า</th>
                <th className="py-2 text-right">เบิกไป</th>
                <th className="py-2 text-right">คืนได้ไม่เกิน</th>
                <th className="py-2 text-right">จำนวนที่คืน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.productId} className="border-t">
                  <td className="py-2">
                    {l.name}
                    {l.sku && <span className="ml-1 text-xs text-[color:var(--color-muted)]">({l.sku})</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.issuedQty}</td>
                  <td className="py-2 text-right tabular-nums" data-testid={`remain-${l.productId}`}>
                    {l.remainingQty}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={l.remainingQty}
                      step="any"
                      className="input w-24 text-right"
                      value={qtyByProduct[l.productId] ?? "0"}
                      onChange={(e) => setQtyByProduct((p) => ({ ...p, [l.productId]: e.target.value }))}
                      data-testid={`qty-${l.productId}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เหตุผล
            <select
              className="input"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              data-testid="reason-select"
            >
              <option value="">— เลือกเหตุผล —</option>
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            รายละเอียดเพิ่มเติม
            <input className="input" value={reasonText} onChange={(e) => setReasonText(e.target.value)} data-testid="reason-text" />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หมายเหตุเอกสาร
          <textarea className="input min-h-[3rem]" value={note} onChange={(e) => setNote(e.target.value)} name="note" />
        </label>

        <div className="flex items-center justify-between gap-3">
          <Link href={cancelHref} className="btn btn-ghost text-sm" data-testid="btn-cancel">
            ยกเลิก
          </Link>
          <button disabled={!canSubmit} className="btn btn-primary text-sm disabled:opacity-40" data-testid="btn-approve-menu">
            บันทึกใบส่งคืน
          </button>
        </div>
      </form>
    </div>
  );
}
