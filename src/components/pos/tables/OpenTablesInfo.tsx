"use client";

// OpenTablesInfo.tsx — POS P2.4U มติ 9 (Q10): บรรทัดข้อมูล "โต๊ะยังไม่ปิด N · ฿x" ในหน้ากะ (X) และหน้าปิดวัน — แสดงอย่างเดียว ไม่บล็อกอะไร
//   ตัวเลข = registerTablesAction().summary (used · unpaidSatang ของเซิร์ฟเวอร์) · สาขาที่ไม่มีโต๊ะ/อ่านไม่ได้ = ไม่แสดง
//   หลายสาขา (หน้าปิดวัน) = หนึ่งบรรทัดต่อสาขาที่มีโต๊ะ (ชื่อสาขานำหน้า)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { registerTablesAction } from "@/lib/modules/pos/table-actions";

type Row = { unitId: string; unitName: string; used: number; unpaidSatang: number };

export function OpenTablesInfo({ systemId, units, className = "" }: { systemId: string; units: { id: string; name: string }[]; className?: string }) {
  const t = useTranslations("pos.tables");
  const [rows, setRows] = useState<Row[]>([]);
  const unitKey = units.map((u) => u.id).join(",");
  useEffect(() => {
    let live = true;
    void (async () => {
      const out: Row[] = [];
      for (const u of units) {
        try {
          const r = await registerTablesAction({ systemId, unitId: u.id });
          if (r.ok && r.tables.length > 0) out.push({ unitId: u.id, unitName: u.name, used: r.summary.used, unpaidSatang: r.summary.unpaidSatang });
        } catch {
          /* อ่านไม่ได้ = ไม่แสดง (ข้อมูลประกอบเท่านั้น) */
        }
      }
      if (live) setRows(out);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้น = ชุดสาขา
  }, [systemId, unitKey]);
  if (!rows.length) return null;
  return (
    <div data-testid="pos-tbl-open-info" className={`flex flex-col gap-0.5 text-[13px] text-[color:var(--color-ink-soft)] ${className}`}>
      {rows.map((r) => (
        <p key={r.unitId}>
          {rows.length > 1 || units.length > 1 ? <b className="mr-1.5 font-semibold text-[color:var(--color-ink)]">{r.unitName}</b> : null}
          {t("summary.openTablesInfo", { n: r.used, amount: moneyText(r.unpaidSatang) })}
        </p>
      ))}
    </div>
  );
}
