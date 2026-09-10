// VoucherTemplatesBoard.tsx — หน้า "โปรโมชัน › Voucher › แบบที่ตั้งไว้" (M2.5)
//
// แบบ (template) = เงื่อนไขที่ร้านตั้งครั้งเดียวแล้วออกซ้ำได้ทุกวัน — ตารางแบบ + ฟอร์มเพิ่ม
// ใบที่ออกไปแล้วไม่เปลี่ยนตามการแก้แบบ (service snapshot ค่าลงใบตอนออก) จึงแก้แบบได้อย่างปลอดภัย
// ไม่มีอีโมจิ/สีฮาร์ดโค้ดในหน้าสมาชิก · ทุกการบันทึกผ่าน server action (ด่านสิทธิ์อยู่ที่นั่น)
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBaht } from "@/lib/ui/money";
import {
  createVoucherTemplateAction,
  toggleVoucherTemplateAction,
} from "@/lib/modules/voucher/voucher-actions";
import { MemberIcon } from "./MemberIcon";

type TemplateRow = {
  id: string;
  name: string;
  kind: string;
  value: number;
  validDays: number;
  origin: string;
  active: boolean;
  issuedCount: number;
  minSatang: number | null;
};

const KIND_LABEL: Record<string, string> = {
  FIXED: "ส่วนลดบาท",
  PERCENT: "ส่วนลดเปอร์เซ็นต์",
  FREE_SERVICE: "บริการฟรี",
  FREE_ITEM: "สินค้าฟรี",
};

export function VoucherTemplatesBoard({
  systemId,
  rows,
  canManage,
}: {
  systemId: string;
  rows: TemplateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"FIXED" | "PERCENT">("FIXED");
  const [valueText, setValueText] = useState("300");
  const [minText, setMinText] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await createVoucherTemplateAction({
      systemId,
      name,
      kind,
      value: kind === "FIXED" ? Math.round((Number(valueText) || 0) * 100) : Number(valueText) || 0,
      config: {
        ...(minText.trim() ? { minSatang: Math.round((Number(minText) || 0) * 100) } : {}),
        stackWithCoupon: false,
        unitIds: [],
      },
      validDays: Number(validDays) || 30,
      origin: "MANUAL",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setOpen(false);
    setName("");
    router.refresh();
  };

  return (
    <div data-testid="vouchers-templates" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
          {rows.length.toLocaleString("th-TH")} แบบ
        </span>
        <span className="flex-1" />
        {canManage && (
          <button
            type="button"
            data-testid="vouchers-template-add"
            className="btn btn-primary inline-flex items-center gap-1.5"
            onClick={() => setOpen((v) => !v)}
          >
            <MemberIcon name="plus" size="sm" />
            เพิ่มแบบ voucher
          </button>
        )}
      </div>

      {open && (
        <div data-testid="vouchers-template-form" className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input min-w-0 flex-1"
              placeholder="ชื่อที่ลูกค้าเห็น เช่น ส่วนลด 300 บาท คอร์สดำน้ำ"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className="input" style={{ maxWidth: 200 }} value={kind} onChange={(e) => setKind(e.target.value as "FIXED")}>
              <option value="FIXED">ส่วนลดบาท</option>
              <option value="PERCENT">ส่วนลดเปอร์เซ็นต์</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input"
              style={{ maxWidth: 140 }}
              inputMode="decimal"
              placeholder={kind === "PERCENT" ? "เปอร์เซ็นต์" : "มูลค่า (บาท)"}
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: 170 }}
              inputMode="decimal"
              placeholder="ขั้นต่ำบิล (บาท)"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: 110 }}
              inputMode="numeric"
              value={validDays}
              onChange={(e) => setValidDays(e.target.value)}
            />
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>
              วัน หลังออก
            </span>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? "กำลังบันทึก..." : "บันทึกแบบ"}
            </button>
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
        </div>
      )}

      <div className="card p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--color-muted)", fontSize: 12 }}>
                <th className="px-4 py-2 text-left font-normal">ชื่อ voucher</th>
                <th className="px-4 py-2 text-left font-normal">แบบ</th>
                <th className="px-4 py-2 text-right font-normal">มูลค่า</th>
                <th className="hidden px-4 py-2 text-right font-normal md:table-cell">ขั้นต่ำบิล</th>
                <th className="hidden px-4 py-2 text-right font-normal md:table-cell">อายุ</th>
                <th className="hidden px-4 py-2 text-right font-normal md:table-cell">ออกไปแล้ว</th>
                <th className="px-4 py-2 text-left font-normal">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    ยังไม่มีแบบ voucher — กด &ldquo;เพิ่มแบบ voucher&rdquo; เพื่อตั้งแบบแรก
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} data-testid={`vouchers-template-${t.id}`} style={{ borderTop: "1px solid var(--color-line)" }}>
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2" style={{ color: "var(--color-muted)" }}>
                    {KIND_LABEL[t.kind] ?? t.kind}
                  </td>
                  <td className="px-4 py-2 text-right">{t.kind === "FIXED" ? formatBaht(t.value) : `${t.value}%`}</td>
                  <td className="hidden px-4 py-2 text-right md:table-cell" style={{ color: "var(--color-muted)" }}>
                    {t.minSatang ? formatBaht(t.minSatang) : "ไม่กำหนด"}
                  </td>
                  <td className="hidden px-4 py-2 text-right md:table-cell" style={{ color: "var(--color-muted)" }}>
                    {t.validDays} วัน
                  </td>
                  <td className="hidden px-4 py-2 text-right md:table-cell" style={{ color: "var(--color-muted)" }}>
                    {t.issuedCount.toLocaleString("th-TH")}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="rounded-full px-2 py-0.5 text-xs"
                      disabled={!canManage}
                      style={{
                        border: "1px solid var(--color-line)",
                        background: "var(--color-surface-2)",
                        color: t.active ? "var(--color-ink)" : "var(--color-muted)",
                      }}
                      onClick={async () => {
                        await toggleVoucherTemplateAction({ systemId, templateId: t.id, active: !t.active });
                        router.refresh();
                      }}
                    >
                      {t.active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default VoucherTemplatesBoard;
