"use client";

import { useState, useTransition } from "react";
import { MoneyText } from "@/components/ui/MoneyText";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";
import { formatDateTh } from "@/lib/ui/date";
import { listDepositOptionsAction, setDepositsAction, type DepositOption } from "@/lib/modules/account/payment-actions";

// ─────────────────────────────────────────────────────────────
// DepositSection — ส่วน D ของ DESIGN-SPEC-V2 §5.2 "เงินมัดจำ" (IV/RE ฝั่งขาย · PUR/EXP ฝั่งจ่าย)
// ภาพอ้างอิง: g1-invoice-form.png (การ์ด "เงินมัดจำ" ใต้รายการ) + สเปค:
//   ปุ่ม "+ เลือกเงินมัดจำ" → modal รายการ DR/DP ของผู้ติดต่อนี้ที่ยังหักไม่ครบ
//   (เลขที่ · วันที่ · ยอดคงเหลือ · ช่องกรอกจำนวนที่หัก) → แถวสรุป "หักเงินมัดจำ −฿…"
//
// ต่างจาก WO 1.2 (หักได้ครั้งละ 1 ใบ เต็มยอด): เลือกได้หลายใบ และหัก "บางส่วน" ได้
// ⇒ ยอดที่กรอกต้อง ≤ ยอดคงเหลือของใบนั้น (server ตรวจซ้ำใน setDocDeposits/setExpenseDocDeposits)
// 🔴 การหักมัดจำถูกบันทึกลงฐานข้อมูลทันทีที่กด "หักเงินมัดจำ" (ไม่รอ autosave) เพราะยอดเอกสาร
//    (grandTotal) เปลี่ยนตาม ⇒ ต้องมีร่างก่อน (onNeedDraft สร้างให้ถ้ายังไม่มี)
// ─────────────────────────────────────────────────────────────

export type DepositApplied = { depositId: string; docNo: string | null; amountSatang: number };

export function DepositSection({
  systemId,
  docType,
  docId,
  contactId,
  docGrossSatang,
  applied,
  onApplied,
  onNeedDraft,
}: {
  systemId: string;
  docType: string;
  docId?: string;
  contactId: string | null;
  /** ยอดเอกสารก่อนหักมัดจำ — ใช้เป็นเพดานของค่าเริ่มต้นในช่อง "จำนวนที่หัก" */
  docGrossSatang: number;
  applied: DepositApplied[];
  onApplied: (rows: DepositApplied[], depositDeducted: number) => void;
  /** สร้าง/บันทึกร่างแล้วคืน docId (ฟอร์มเป็นคนทำ) */
  onNeedDraft: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DepositOption[]>([]);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const total = applied.reduce((s, a) => s + a.amountSatang, 0);

  const openPicker = () =>
    startTransition(async () => {
      setError("");
      if (!contactId) {
        setError("เลือกผู้ติดต่อก่อนจึงเลือกเงินมัดจำได้");
        setOpen(true);
        return;
      }
      const id = docId ?? (await onNeedDraft());
      const list = await listDepositOptionsAction(systemId, docType, contactId, id ?? undefined);
      setRows(list);
      // ค่าเริ่มต้นของช่อง "จำนวนที่หัก" = min(ยอดคงเหลือ, ยอดเอกสาร) ตามสเปค §5.2 D
      const init: Record<string, number> = {};
      for (const a of applied) init[a.depositId] = a.amountSatang;
      setPicked(init);
      setOpen(true);
    });

  const toggle = (r: DepositOption) =>
    setPicked((p) => {
      const next = { ...p };
      if (next[r.id] !== undefined) delete next[r.id];
      else next[r.id] = Math.min(r.available, Math.max(0, docGrossSatang - sumExcept(p, r.id)));
      return next;
    });

  const confirm = () =>
    startTransition(async () => {
      setError("");
      const id = docId ?? (await onNeedDraft());
      if (!id) {
        setError("บันทึกร่างก่อนจึงหักเงินมัดจำได้");
        return;
      }
      const picks = Object.entries(picked)
        .filter(([, amount]) => amount > 0)
        .map(([depositId, amountSatang]) => ({ depositId, amountSatang }));
      const res = await setDepositsAction(systemId, id, picks);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      onApplied(
        picks.map((p) => ({
          depositId: p.depositId,
          docNo: rows.find((r) => r.id === p.depositId)?.docNo ?? null,
          amountSatang: p.amountSatang,
        })),
        res.depositDeducted,
      );
      setOpen(false);
    });

  return (
    <div className="flex flex-col gap-2" data-testid="deposit-section">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-sm" onClick={openPicker} disabled={pending} data-testid="btn-pick-deposit">
          + เลือกเงินมัดจำ
        </button>
        {total === 0 && (
          <span className="text-xs text-[color:var(--color-muted)]">ยังไม่ได้หักเงินมัดจำใบใด</span>
        )}
      </div>

      {applied.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" data-testid="deposit-applied">
          {applied.map((a) => (
            <li key={a.depositId} className="flex items-center justify-between gap-3">
              <span className="text-[color:var(--color-muted)]">หักเงินมัดจำ {a.docNo ?? ""}</span>
              <span className="tabular-nums" style={{ color: "var(--color-danger)" }}>
                −<MoneyText satang={a.amountSatang} decimals />
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && !open && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="เลือกเงินมัดจำที่จะหัก"
        size="lg"
        testId="deposit-modal"
        actions={
          <>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              onClick={confirm}
              disabled={pending}
              data-testid="btn-apply-deposit"
            >
              {pending ? "กำลังบันทึก…" : "หักเงินมัดจำ"}
            </button>
          </>
        }
      >
        {error && <p className="mb-2 text-sm text-[color:var(--color-danger)]">{error}</p>}
        {rows.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">
            ผู้ติดต่อรายนี้ไม่มีใบมัดจำที่ยังหักได้ (ต้องเป็นใบที่รับ/จ่ายเงินครบแล้วและอยู่สถานะรอหักมัดจำ)
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="w-8 py-1" />
                <th className="py-1">เลขที่</th>
                <th className="py-1">วันที่</th>
                <th className="py-1 text-right">ยอดคงเหลือ</th>
                <th className="py-1 text-right">จำนวนที่หัก</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked[r.id] !== undefined;
                return (
                  <tr key={r.id} className="border-t" data-testid={`deposit-row-${r.docNo ?? r.id}`}>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r)}
                        aria-label={`เลือกใบมัดจำ ${r.docNo ?? ""}`}
                        data-testid={`deposit-check-${r.docNo ?? r.id}`}
                      />
                    </td>
                    <td className="py-2">{r.docNo ?? "(ร่าง)"}</td>
                    <td className="py-2">{formatDateTh(r.issueDate)}</td>
                    <td className="py-2 text-right tabular-nums">
                      <MoneyText satang={r.available} decimals />
                    </td>
                    <td className="py-2 text-right">
                      {on ? (
                        <MoneyInput
                          value={picked[r.id]}
                          onChangeSatang={(satang) =>
                            setPicked((p) => ({ ...p, [r.id]: Math.min(satang, r.available) }))
                          }
                          testId={`deposit-amount-${r.docNo ?? r.id}`}
                        />
                      ) : (
                        <span className="text-xs text-[color:var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

function sumExcept(picked: Record<string, number>, skip: string): number {
  let s = 0;
  for (const [k, v] of Object.entries(picked)) if (k !== skip) s += v;
  return s;
}

export default DepositSection;
