"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { csvRow } from "@/lib/core/csv";

// แถบเครื่องมือร่วมของทุกหน้ารายงาน — DESIGN-SPEC-V2 §11.3
//   ช่วง/ณ วันที่ · เทียบงวดก่อน · สาขา · พิมพ์ / PDF / Excel
// ทุกหน้ารายงาน (งบทดลอง · งบฐานะ · กำไรขาดทุน · กระแสเงินสด · ภ.พ.30 · อายุหนี้ · แยกประเภท) ใช้ตัวนี้ตัวเดียว
//
// 🔴 PDF = "พิมพ์เป็น PDF" ของเบราว์เซอร์ (window.print + @media print) — ไม่ลงไลบรารีใหม่ (WO ห้ามเพิ่ม dep)
// 🔴 Excel = CSV + BOM (U+FEFF) — Excel ไทยเปิดแล้วไม่เป็นตัวยึกยือ (บทเรียนเดิม §10.10)

/** preamble = บรรทัดก่อนหัวตาราง (ACC T4.6 ▸ ป้าย "ร่างสำหรับผู้ทำบัญชี/ผู้สอบบัญชี" ของงบ) ◂ */
export type CsvData = { headers: string[]; rows: (string | number)[][]; preamble?: string[] };

/** โหมดช่วงเวลาของรายงาน: `range` = ตั้งแต่–ถึง (เดือน) · `asof` = ณ สิ้นเดือน · `none` = ไม่มีตัวเลือกเวลา */
export type RangeMode = "range" | "asof" | "none";

// 🔴 WO 9.2 ข้อ 7: ทุกช่องผ่าน `csvRow`/`csvCell` กลาง (core/csv.ts) — กัน CSV injection
//    (ชื่อบัญชี/ชื่อคู่ค้าในรายงานมาจากผู้ใช้ · เดิมหนีแค่ quote ไม่ได้กันสูตร)
function toCsv(data: CsvData): string {
  const lines = [...(data.preamble ?? []).map((p) => csvRow([p])), csvRow(data.headers)];
  for (const r of data.rows) lines.push(csvRow(r));
  return lines.join("\r\n");
}

export default function ReportToolbar({
  filename,
  csv,
  mode = "range",
  from,
  to,
  compare = false,
  showCompare = true,
  asOfParam,
  resetOnPeriodChange = [],
  extraExports,
  hideBranch = false,
}: {
  filename: string;
  csv: CsvData;
  mode?: RangeMode;
  /** periodKey "YYYY-MM" (mode=range) */
  from?: string;
  /** periodKey "YYYY-MM" (mode=range) หรือ "ณ วันที่" (mode=asof) */
  to?: string;
  compare?: boolean;
  /** รายงานบางตัวเทียบงวดก่อนไม่ได้ (เช่น ภ.พ.30 ที่เป็นแบบยื่นต่องวด) */
  showCompare?: boolean;
  /** ACCOUNT-FIX A5 — หน้าที่อ่านงวดจากพารามิเตอร์ของตัวเอง (ภ.พ.30 = `period`): เปลี่ยนเดือนแล้วตั้งค่าตัวนั้นตัวเดียว
   *  (เดิมตั้ง asOf+to แต่หน้าอ่าน period ก่อน ⇒ เปลี่ยนเดือนแล้วตัวเลขไม่เปลี่ยน) */
  asOfParam?: string;
  /** พารามิเตอร์ที่ผูกกับงวดเดิม — ล้างทิ้งเมื่อเปลี่ยนงวด (เช่น ค่าลองดูเครดิตยกมา · ข้อความผลลัพธ์) */
  resetOnPeriodChange?: string[];
  /** ACCOUNT-FIX B5 — ปุ่มส่งออกเฉพาะรายงาน (เช่น CSV ยื่นแบบ) อยู่ชุดเดียวกับ Excel ของแถบนี้ */
  extraExports?: React.ReactNode;
  /** ACC T5.11 ▸ หน้าที่มีตัวเลือกสาขาของตัวเอง (รายงานภาษีแยกสาขา) ซ่อนช่องสาขาที่ปิดใช้ของแถบนี้ ◂ */
  hideBranch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();

  const go = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const download = () => {
    const blob = new Blob(["﻿" + toCsv(csv)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden" data-testid="report-toolbar">
      {mode === "range" && (
        <>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ตั้งแต่
            <input
              type="month"
              value={from ?? ""}
              onChange={(e) => go({ from: e.target.value })}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--color-line)" }}
              data-testid="report-from"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ถึง
            <input
              type="month"
              value={to ?? ""}
              onChange={(e) => go({ to: e.target.value })}
              className="rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--color-line)" }}
              data-testid="report-to"
            />
          </label>
        </>
      )}
      {mode === "asof" && (
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ณ สิ้นเดือน
          <input
            type="month"
            value={to ?? ""}
            onChange={(e) =>
              go(
                asOfParam
                  ? { [asOfParam]: e.target.value, asOf: undefined, to: undefined, ...Object.fromEntries(resetOnPeriodChange.map((k) => [k, undefined])) }
                  : { asOf: e.target.value, to: e.target.value },
              )
            }
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--color-line)" }}
            data-testid="report-asof"
          />
        </label>
      )}

      {showCompare && (
        <label className="flex items-center gap-1.5 self-end pb-1.5 text-sm" data-testid="report-compare-toggle">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => go({ cmp: e.target.checked ? "1" : "0" /* ACC T5.8 ▸ เทียบงวดก่อนเป็นค่าเริ่ม — ปิด = cmp=0 ◂ */ })}
          />
          เทียบงวดก่อน
        </label>
      )}

      {/* สาขา — ระบบบัญชียังไม่มีมิติสาขาในสมุดรายวัน (ดู wo-notes/6.2.md) จึงแสดงแบบปิดใช้พร้อมเหตุผล
          ไม่ซ่อนเงียบ ๆ เพราะ §11.3 ระบุไว้ในแถบเครื่องมือ */}
      {!hideBranch && <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        สาขา
        <select
          disabled
          title="ระบบบัญชียังลงรายการรวมทุกสาขา (สมุดรายวันยังไม่มีมิติสาขา)"
          className="rounded-lg border px-2 py-1.5 text-sm opacity-60"
          style={{ borderColor: "var(--color-line)" }}
          data-testid="report-branch"
        >
          <option>ทุกสาขา</option>
        </select>
      </label>}

      <div className="flex gap-2 self-end">
        {/* ACCOUNT-FIX B5 — "พิมพ์" กับ "PDF" เป็นคำสั่งเดียวกัน (กล่องพิมพ์ของเบราว์เซอร์ · เลือกบันทึกเป็น PDF ได้) ⇒ เหลือปุ่มเดียว */}
        <button type="button" onClick={() => window.print()} className="btn btn-ghost text-sm" data-testid="report-print">
          <AccountIcon name="printer" className="h-4 w-4" /> พิมพ์ / PDF
        </button>
        <button type="button" onClick={download} className="btn btn-ghost text-sm" data-testid="report-excel">
          <AccountIcon name="download" className="h-4 w-4" /> Excel
        </button>
        {extraExports}
      </div>
    </div>
  );
}
