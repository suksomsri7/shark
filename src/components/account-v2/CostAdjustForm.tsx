"use client";

// CostAdjustForm — ใบปรับต้นทุนสินค้า CA (WO 4.3 · DESIGN-SPEC-V2 §8.4)
// ช่องตามสเปค: สินค้า · ต้นทุนเดิม (readonly) · ต้นทุนใหม่ · เหตุผล · บัญชีคู่ (กำไร/ขาดทุนจากการปรับมูลค่า)
// โครง/ปุ่มยืมจากฟอร์มใบเบิก g12 (เฟรมชุดนี้ไม่มีภาพของ CA — SPEC บรรยายเป็นข้อความ)
import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { DateInput } from "./DateInput";
import { createCostAdjustmentAction } from "@/lib/modules/account/product-actions";

export type CostAdjustProduct = {
  id: string;
  name: string;
  code: string | null;
  unitName: string | null;
  stock: number;
  costSatang: number;
  linked: boolean;
};

const money = (satang: number) =>
  `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CostAdjustForm({
  systemId,
  today,
  docNoPreview,
  products,
  reasons,
  accounts,
  defaultAccountCode,
  cancelHref,
  presetProductId,
}: {
  systemId: string;
  today: string;
  docNoPreview: string;
  products: CostAdjustProduct[];
  reasons: readonly string[];
  accounts: { code: string; name: string }[];
  defaultAccountCode: string;
  cancelHref: string;
  presetProductId?: string;
}) {
  const [productId, setProductId] = useState(presetProductId ?? "");
  const [newCost, setNewCost] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const p = byId.get(productId);
  const newCostSatang = newCost.trim() === "" ? null : Math.round(Number(newCost) * 100);
  const delta = p && newCostSatang != null && Number.isFinite(newCostSatang) ? Math.round((newCostSatang - p.costSatang) * p.stock) : null;
  const canSubmit = !!p && newCostSatang != null && Number.isFinite(newCostSatang) && newCostSatang >= 0;

  if (products.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินค้าที่มีสต็อก — เพิ่มสินค้าก่อนจึงจะปรับต้นทุนได้</p>
      </div>
    );
  }

  return (
    <form action={createCostAdjustmentAction} className="flex max-w-3xl flex-col gap-4 pb-24" data-testid="cost-adjust-form">
      <input type="hidden" name="systemId" value={systemId} />

      <section className="card" data-testid="ca-general">
        <h2 className="mb-3 text-sm font-bold">ข้อมูลทั่วไป</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่
            {/* 🔴 ห้ามใช้ input[type=date] ดิบ — เบราว์เซอร์โชว์ MM/DD/YYYY (บทเรียน WO 1.3) */}
            <DateInput name="issueDate" defaultValue={today} testId="ca-date" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขที่เอกสาร
            <input value={docNoPreview} readOnly className="input" data-testid="ca-docno" />
          </label>
        </div>
      </section>

      <section className="card" data-testid="ca-lines">
        <h2 className="mb-3 text-sm font-bold">สินค้าที่ปรับต้นทุน</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
            สินค้า
            <select name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} className="input" data-testid="ca-product">
              <option value="">— เลือกสินค้า —</option>
              {products.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code ? `${o.code} · ` : ""}
                  {o.name} · คงเหลือ {o.stock}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ต้นทุนเดิม/หน่วย
            <input value={p ? money(p.costSatang) : "—"} readOnly className="input text-right" data-testid="ca-old-cost" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ต้นทุนใหม่/หน่วย (บาท)
            <input
              name="newCostBaht"
              inputMode="decimal"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              className="input text-right"
              data-testid="ca-new-cost"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            จำนวนคงเหลือที่กระทบ
            <input value={p ? `${p.stock} ${p.unitName ?? ""}`.trim() : "—"} readOnly className="input text-right" data-testid="ca-qty" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ผลต่างที่ลงบัญชี
            <input
              value={delta == null ? "—" : `${delta >= 0 ? "กำไร " : "ขาดทุน "}${money(Math.abs(delta))}`}
              readOnly
              className="input text-right"
              data-testid="ca-delta"
            />
          </label>
        </div>
      </section>

      <section className="card" data-testid="ca-accounting">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">การลงบัญชี</h2>
          <span className="flex-1" />
          <span className="text-xs text-[color:var(--color-muted)]">ลงบัญชีอัตโนมัติเมื่อบันทึก</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เหตุผลการปรับ
            <select name="reason" defaultValue={reasons[0]} className="input" data-testid="ca-reason">
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            บัญชีคู่ (กำไร/ขาดทุนจากการปรับมูลค่า)
            <select name="adjustAccountCode" defaultValue={defaultAccountCode} className="input" data-testid="ca-account">
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
            หมายเหตุ
            <input name="note" className="input" data-testid="ca-note" />
          </label>
        </div>
        <p className="mt-2 text-xs text-[color:var(--color-muted)]" data-testid="ca-jv-hint">
          {delta == null || delta === 0
            ? "ต้นทุนไม่เปลี่ยน = ไม่มีรายการบัญชี"
            : delta > 0
              ? `Dr 1200 สินค้าคงเหลือ ${money(Math.abs(delta))} / Cr ${defaultAccountCode} กำไรจากการปรับมูลค่า`
              : `Dr ${defaultAccountCode} ขาดทุนจากการปรับมูลค่า ${money(Math.abs(delta))} / Cr 1200 สินค้าคงเหลือ`}
        </p>
      </section>

      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
        style={{ borderColor: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 8%, transparent)" }}
        data-testid="ca-hint"
      >
        <AccountIcon name="info" className="h-4 w-4 shrink-0" />
        {p?.linked
          ? "สินค้านี้ผูกกับคลัง — ต้นทุนถัวเฉลี่ยในคลังสินค้าจะถูกแก้ตามใบนี้"
          : "ต้นทุนใหม่จะถูกบันทึกเป็น “ราคาซื้อ/หน่วย” ของสินค้า"}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
        <Link href={cancelHref} className="btn btn-ghost">
          ยกเลิก
        </Link>
        <button type="submit" name="asDraft" value="1" className="btn-sm" disabled={!canSubmit} data-testid="ca-save-draft">
          บันทึกร่าง
        </button>
        <button type="submit" name="asDraft" value="0" className="btn btn-primary" disabled={!canSubmit} data-testid="ca-approve">
          อนุมัติใบปรับต้นทุน
        </button>
      </div>
    </form>
  );
}

export default CostAdjustForm;
